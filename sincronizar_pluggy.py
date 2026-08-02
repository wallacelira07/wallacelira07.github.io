#!/usr/bin/env python3
"""
Integração Pluggy (Meu Pluggy, uso pessoal) -> Sistema Wallace Lira
======================================================================
Puxa saldos de contas bancárias e investimentos das contas que você já
conectou em meu.pluggy.ai, via API oficial da Pluggy.

IMPORTANTE - modelo de uso:
  Isto usa o fluxo "Meu Pluggy" (gratuito, pessoal, só suas proprias contas
  nominais) - NAO o plano comercial pago. A conexao com cada banco ja foi
  feita por voce direto em meu.pluggy.ai + autorizada uma vez no Dashboard
  (fluxo OAuth do "Conector 200"). Este script so LE os dados das conexoes
  que ja existem - ele NUNCA cria conexao nova nem move dinheiro (somente
  leitura, GET em todos os endpoints).

Fluxo de autenticacao:
  1. POST /auth com clientId+clientSecret -> apiKey (validade 2 horas)
  2. GET /items (com header X-API-KEY) -> lista as conexoes ja existentes
  3. Para cada item: GET /accounts?itemId=X -> saldos
  4. Para cada item: GET /investments?itemId=X -> investimentos (se houver)

USO:
  python3 sincronizar_pluggy.py

Variaveis de ambiente necessarias:
  PLUGGY_CLIENT_ID      - da aba "Applications" no dashboard.pluggy.ai
  PLUGGY_CLIENT_SECRET  - idem
  SUPABASE_URL          - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY          - chave do Supabase (mesma dos outros scripts)
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PLUGGY_BASE = "https://api.pluggy.ai"


def _request(url: str, method: str = "GET", headers: dict | None = None, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = Request(url, data=data, headers=req_headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} em {method} {url}: {corpo}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede em {url}: {e}") from e


def autenticar(client_id: str, client_secret: str) -> str:
    """POST /auth -> devolve a API Key (v'alida 2h)."""
    resp = _request(
        f"{PLUGGY_BASE}/auth",
        method="POST",
        body={"clientId": client_id, "clientSecret": client_secret},
    )
    api_key = resp.get("apiKey")
    if not api_key:
        raise RuntimeError(f"Resposta de /auth sem apiKey: {resp}")
    # DEBUG (nao expoe a chave completa, so confirma que ela existe e tem formato plausivel)
    print(f"[debug] apiKey recebida: {len(api_key)} caracteres, começa com '{api_key[:6]}...'")
    return api_key


def testar_conectividade(api_key: str) -> None:
    """GET /connectors -> teste de diagnostico recomendado pela propria doc da Pluggy
    pra confirmar se a API Key funciona, SEM depender de nenhum item ja existir.
    Se isso tambem der 401, o problema e na chave/credenciais em si (nao em permissao
    de item especifico). Se isso funcionar mas /items falhar, o problema e outro."""
    resp = _request(f"{PLUGGY_BASE}/connectors", headers={"X-API-KEY": api_key})
    total = resp.get("total", len(resp.get("results", [])))
    print(f"[debug] GET /connectors OK - {total} conectores disponíveis (confirma que a API Key funciona em geral)")


def buscar_item(api_key: str, item_id: str) -> dict:
    """GET /items/{id} -> detalhes de UM item especifico.
    IMPORTANTE (descoberto 02/08/2026): a Pluggy NAO disponibiliza um endpoint pra
    listar todos os items de uma vez ('Listing existing connections its not provided
    due to security reasons' - docs.pluggy.ai/docs/item). Por isso os itemIds precisam
    ser configurados manualmente (variavel PLUGGY_ITEM_IDS), um por banco conectado.
    """
    return _request(f"{PLUGGY_BASE}/items/{item_id}", headers={"X-API-KEY": api_key})


def listar_contas(api_key: str, item_id: str) -> list[dict]:
    """GET /accounts?itemId=X -> contas (corrente, poupanca, cartao) de uma conexao."""
    resp = _request(f"{PLUGGY_BASE}/accounts?itemId={item_id}", headers={"X-API-KEY": api_key})
    return resp.get("results", [])


def listar_investimentos(api_key: str, item_id: str) -> list[dict]:
    """GET /investments?itemId=X -> investimentos de uma conexao, se houver."""
    resp = _request(f"{PLUGGY_BASE}/investments?itemId={item_id}", headers={"X-API-KEY": api_key})
    return resp.get("results", [])


def listar_faturas(api_key: str, account_id: str) -> list[dict]:
    """GET /bills?accountId=X -> faturas (Bill) de uma conta de cartao de credito.
    IMPORTANTE: em conexoes Open Finance Regulado (caso do MeuPluggy), o campo
    'balance' da conta CREDIT retorna o LIMITE TOTAL USADO, nao a fatura do mes
    (confirmado na documentacao oficial: docs.pluggy.ai/docs/accounts#balance -
    'For Open Finance connectors, Credit Card balance is the used limit'). A fatura
    de verdade (o que fecha e vence todo mes) vem dessa entidade Bill separada.
    Endpoint inferido pelo padrao dos demais (/transactions?accountId=X) - se der
    404/erro, o log vai mostrar a mensagem exata da API pra corrigir na proxima rodada.
    """
    resp = _request(f"{PLUGGY_BASE}/bills?accountId={account_id}", headers={"X-API-KEY": api_key})
    return resp.get("results", [])


def listar_transacoes(api_key: str, account_id: str, dias: int = 40, max_paginas: int = 5) -> list[dict]:
    """GET /transactions?accountId=X&from=DATA -> extrato da conta, paginado.
    Traz so os ultimos N dias (padrao 40, cobre o ciclo financeiro atual + folga
    pra virada) - nao a historia toda, pra manter o payload diario pequeno.
    NOTA (02/08/2026): esse endpoint classico esta marcado como deprecated pela
    Pluggy, disponivel so ate 2026-12-31 (migrar pra GET /v2/transactions, cursor-
    based, depois disso). Usado por ora porque e mais simples e ainda valido por
    varios meses - registrar como pendencia de migracao antes do prazo.
    """
    data_de = (datetime.now(timezone.utc) - timedelta(days=dias)).strftime("%Y-%m-%d")
    transacoes = []
    pagina = 1
    while pagina <= max_paginas:
        url = f"{PLUGGY_BASE}/transactions?accountId={account_id}&from={data_de}&page={pagina}&pageSize=500"
        resp = _request(url, headers={"X-API-KEY": api_key})
        resultados = resp.get("results", [])
        transacoes.extend(resultados)
        total_paginas = resp.get("totalPages", 1)
        if pagina >= total_paginas or not resultados:
            break
        pagina += 1
    return transacoes


def sincronizar(client_id: str, client_secret: str, item_ids: list[str]) -> dict:
    api_key = autenticar(client_id, client_secret)
    testar_conectividade(api_key)

    resultado = {"conexoes": [], "erros": []}

    for item_id in item_ids:
        try:
            item = buscar_item(api_key, item_id)
        except RuntimeError as e:
            resultado["erros"].append(f"item {item_id}: falha ao buscar detalhes - {e}")
            continue

        nome_banco = item.get("connector", {}).get("name", "desconhecido")
        status = item.get("status")  # UPDATED, LOGIN_ERROR, OUTDATED, etc.

        entrada = {
            "item_id": item_id,
            "banco": nome_banco,
            "status": status,
            "atualizado_em": item.get("lastUpdatedAt") or item.get("updatedAt"),
            "contas": [],
            "investimentos": [],
        }

        try:
            contas = listar_contas(api_key, item_id)
            for c in contas:
                conta_info = {
                    "tipo": c.get("type"),           # BANK / CREDIT
                    "subtipo": c.get("subtype"),      # CHECKING_ACCOUNT / SAVINGS_ACCOUNT / CREDIT_CARD
                    "nome": c.get("name"),
                    "numero": c.get("number"),
                    "saldo": c.get("balance"),
                    "moeda": c.get("currencyCode"),
                }
                if c.get("type") == "CREDIT":
                    # 'saldo' aqui e o LIMITE TOTAL USADO (Open Finance), nao a fatura do mes.
                    conta_info["saldo_significado"] = "limite total usado (não é a fatura do mês)"
                    cd = c.get("creditData") or {}
                    conta_info["limite_total"] = cd.get("creditLimit")
                    conta_info["limite_disponivel"] = cd.get("availableCreditLimit")
                    conta_info["fatura_vencimento_atual"] = cd.get("balanceDueDate")
                    try:
                        faturas = listar_faturas(api_key, c["id"])
                        if faturas:
                            # a mais recente costuma vir primeiro - ordena por dueDate pra garantir
                            faturas_ordenadas = sorted(faturas, key=lambda f: f.get("dueDate") or "", reverse=True)
                            fatura_atual = faturas_ordenadas[0]
                            conta_info["fatura_mes_atual"] = {
                                "valor_total": fatura_atual.get("totalAmount"),
                                "vencimento": fatura_atual.get("dueDate"),
                                "pagamento_minimo": fatura_atual.get("minimumPaymentAmount"),
                            }
                    except RuntimeError as e:
                        conta_info["fatura_mes_atual_erro"] = str(e)

                # NOVO 02/08/2026 (pedido do usuario): traz o extrato dos ultimos 40 dias
                # de cada conta - alimenta a classificacao de compras sem precisar de
                # print/DeepSeek pros 5 bancos ja cobertos pelo Pluggy. Formato enxuto
                # (so os campos uteis pro Claude classificar depois), nao o objeto bruto
                # inteiro da API, pra manter o payload diario do Supabase pequeno.
                try:
                    transacoes = listar_transacoes(api_key, c["id"])
                    conta_info["transacoes_recentes"] = [
                        {
                            "id": t.get("id"),
                            "data": t.get("date"),
                            "descricao": t.get("description"),
                            "valor": t.get("amount"),
                            "categoria": t.get("category"),
                            "status": t.get("status"),  # POSTED / PENDING
                        }
                        for t in transacoes
                    ]
                    conta_info["qtd_transacoes"] = len(transacoes)
                except RuntimeError as e:
                    conta_info["transacoes_erro"] = str(e)

                entrada["contas"].append(conta_info)
        except RuntimeError as e:
            resultado["erros"].append(f"{nome_banco} (contas): {e}")

        try:
            investimentos = listar_investimentos(api_key, item_id)
            for inv in investimentos:
                entrada["investimentos"].append({
                    "tipo": inv.get("type"),
                    "nome": inv.get("name"),
                    "valor": inv.get("balance") or inv.get("value"),
                    "instituicao": inv.get("institution", {}).get("name") if inv.get("institution") else None,
                })
        except RuntimeError as e:
            # Nem todo banco tem produto de investimento - erro aqui costuma ser normal, nao critico
            pass

        resultado["conexoes"].append(entrada)

    resultado["total_conexoes"] = len(item_ids)
    resultado["saldo_total_contas"] = round(sum(
        c["saldo"] for conexao in resultado["conexoes"] for c in conexao["contas"]
        if c.get("saldo") is not None and c.get("tipo") == "BANK"
    ), 2)

    return resultado


def buscar_valores_conhecidos(supabase_url: str, supabase_key: str) -> set[float]:
    """Le todos os livros de transacao ja lancados no ERP (Supabase) e devolve um
    conjunto (set) dos valores absolutos ja conhecidos - usado pra comparar contra
    o extrato novo da Pluggy e achar o que pode estar faltando lancar.
    Comparacao e so por VALOR (nao por data/descricao) - simples de proposito, pra
    nao gerar falso-negativo por causa de diferenca de 1-2 dias entre data de compra
    e data de posting no banco. Pode gerar falso-positivo (2 compras coincidentes
    do mesmo valor), mas isso e mais seguro que deixar passar uma compra de verdade.
    """
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/wallace_dados?select=dados&id=eq.1"
    req = Request(url, headers=headers, method="GET")
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    dados = linhas[0]["dados"] if linhas else {}

    # Livros de transacao conhecidos no ERP - cada um e uma lista de objetos com
    # campo "valor" (as vezes "premioRecebido" pra opcoes, ignorado aqui de proposito).
    livros = [
        "LRW_TRANSACOES", "LRV_TRANSACOES", "LRC_LIMBO_TRANSACOES", "LRCV_TRANSACOES",
        "PV_TRANSACOES", "LRPV_TRANSACOES", "BOLETOS_TRANSACOES",
    ]
    valores = set()
    for livro in livros:
        for item in (dados.get(livro) or []):
            v = item.get("valor")
            if isinstance(v, (int, float)):
                valores.add(round(abs(v), 2))
    return valores


def detectar_transacoes_suspeitas(resultado: dict, valores_conhecidos: set[float], valor_minimo: float = 5.0) -> list[dict]:
    """Percorre as transacoes recentes trazidas da Pluggy e separa as que NAO batem
    com nenhum valor ja lancado no ERP - candidatas a "esqueci de mandar pro Claude".
    Filtra valores pequenos (< valor_minimo) pra nao poluir com taxas/juros/estorno.
    """
    suspeitas = []
    for conexao in resultado["conexoes"]:
        for conta in conexao["contas"]:
            for t in conta.get("transacoes_recentes", []):
                valor = t.get("valor")
                status = t.get("status")
                if valor is None or status != "POSTED":
                    continue
                valor_abs = round(abs(valor), 2)
                if valor_abs < valor_minimo:
                    continue
                if valor_abs not in valores_conhecidos:
                    suspeitas.append({
                        "banco": conexao["banco"],
                        "conta": conta["nome"],
                        "data": t.get("data"),
                        "descricao": t.get("descricao"),
                        "valor": valor,
                    })
    return suspeitas


def enviar_email_suspeitas(suspeitas: list[dict], smtp_host: str, smtp_port: int, email_from: str, email_password: str, email_to: str) -> None:
    """Manda um e-mail simples (texto puro) avisando sobre transacoes que apareceram
    no extrato da Pluggy mas nao parecem estar lancadas no ERP ainda."""
    import smtplib
    from email.mime.text import MIMEText

    linhas = [f"Encontrei {len(suspeitas)} transação(ões) no extrato de hoje que não parecem estar lançadas no Sistema Wallace Lira:\n"]
    for s in suspeitas:
        linhas.append(f"- {s['data']} | {s['banco']} ({s['conta']}) | {s['descricao']} | R$ {s['valor']:.2f}")
    linhas.append("\nSe já lançou manualmente, pode ignorar - a comparação é só por valor, pode dar falso positivo (ex: duas compras com o mesmo valor).")
    corpo = "\n".join(linhas)

    msg = MIMEText(corpo, "plain", "utf-8")
    msg["Subject"] = f"Sistema Wallace Lira: {len(suspeitas)} transação(ões) pra conferir"
    msg["From"] = email_from
    msg["To"] = email_to

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(email_from, email_password)
        server.sendmail(email_from, [email_to], msg.as_string())


def atualizar_supabase(supabase_url: str, supabase_key: str, resultado: dict) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    patch_url = f"{supabase_url}/rest/v1/wallace_dados?id=eq.1"
    # Grava o resultado inteiro (contas + investimentos + saldo total) num campo unico
    # PLUGGY_CONTAS - mesmo padrao das outras automacoes (ACOES_COTACOES, SOLAR_LEITURAS).
    # PATCH simples aqui SUBSTITUI o campo (nao faz merge profundo) - ok porque e um snapshot
    # completo a cada sincronizacao, nao um historico incremental.
    body = json.dumps({"dados": {"PLUGGY_CONTAS": resultado, "PLUGGY_ATUALIZADO_EM": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}}).encode("utf-8")
    # PATCH simples do PostgREST NAO faz merge profundo de JSON - precisa ser via RPC
    # pra nao apagar o resto de "dados". Ver nota em atualizar_geracao_saj.py sobre isso.
    # Por ora, usa jsonb_set via RPC generico (se existir) ou avisa que precisa de uma
    # funcao dedicada, igual foi feito pra geracao solar.
    rpc_url = f"{supabase_url}/rest/v1/rpc/atualizar_pluggy_contas"
    rpc_body = json.dumps({"contas": resultado}).encode("utf-8")
    req = Request(rpc_url, data=rpc_body, headers=headers, method="POST")
    with urlopen(req, timeout=20) as resp:
        resposta = resp.read().decode("utf-8")
    print(f"Supabase atualizado via RPC: {resposta}")


def main() -> int:
    client_id = os.environ.get("PLUGGY_CLIENT_ID")
    client_secret = os.environ.get("PLUGGY_CLIENT_SECRET")
    item_ids_raw = os.environ.get("PLUGGY_ITEM_IDS", "")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    email_smtp_host = os.environ.get("EMAIL_SMTP_HOST", "smtp.gmail.com")
    email_smtp_port = int(os.environ.get("EMAIL_SMTP_PORT", "587"))
    email_from = os.environ.get("EMAIL_FROM")
    email_password = os.environ.get("EMAIL_PASSWORD")
    email_to = os.environ.get("EMAIL_TO")

    if not client_id or not client_secret:
        print("ERRO: PLUGGY_CLIENT_ID e/ou PLUGGY_CLIENT_SECRET não definidos.", file=sys.stderr)
        return 1

    item_ids = [i.strip() for i in item_ids_raw.split(",") if i.strip()]
    if not item_ids:
        print("ERRO: PLUGGY_ITEM_IDS não definido (lista de IDs separados por vírgula, um por banco conectado).", file=sys.stderr)
        return 1

    try:
        print("Autenticando na Pluggy...")
        resultado = sincronizar(client_id, client_secret, item_ids)
        print(f"Conexões encontradas: {resultado['total_conexoes']}")
        for c in resultado["conexoes"]:
            print(f"  {c['banco']} ({c['status']}): {len(c['contas'])} conta(s), {len(c['investimentos'])} investimento(s)")
        if resultado["erros"]:
            print("Avisos/erros parciais:", file=sys.stderr)
            for erro in resultado["erros"]:
                print(f"  - {erro}", file=sys.stderr)
        print(f"\nSaldo total em contas bancárias: R$ {resultado['saldo_total_contas']:.2f}")
        print("\n--- JSON completo (pra conferência manual) ---")
        print(json.dumps(resultado, ensure_ascii=False, indent=2))

        if supabase_url and supabase_key:
            print("\nAtualizando Supabase...")
            atualizar_supabase(supabase_url, supabase_key, resultado)

            # NOVO 02/08/2026 (pedido do usuario): compara o extrato novo contra o
            # que ja esta lancado no ERP - se achar algo que nao bate, manda e-mail.
            print("\nConferindo transações contra o ERP...")
            valores_conhecidos = buscar_valores_conhecidos(supabase_url, supabase_key)
            suspeitas = detectar_transacoes_suspeitas(resultado, valores_conhecidos)
            print(f"Transações suspeitas (possivelmente não lançadas): {len(suspeitas)}")
            for s in suspeitas:
                print(f"  - {s['data']} | {s['banco']} | {s['descricao']} | R$ {s['valor']:.2f}")

            if suspeitas and email_from and email_password and email_to:
                print("\nEnviando e-mail de aviso...")
                enviar_email_suspeitas(suspeitas, email_smtp_host, email_smtp_port, email_from, email_password, email_to)
                print("E-mail enviado.")
            elif suspeitas:
                print("AVISO: encontrei transações suspeitas mas EMAIL_FROM/EMAIL_PASSWORD/EMAIL_TO não configurados - não enviei nada.", file=sys.stderr)
        else:
            print("\nAVISO: SUPABASE_URL/SUPABASE_KEY não definidos - só imprimindo, não salvando.", file=sys.stderr)

        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
