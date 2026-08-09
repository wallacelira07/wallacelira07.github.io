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

DESTINO NO SUPABASE (ATUALIZADO 08/08/2026 - migracao V1 wallace_dados -> V2 relacional):
  Este script continua chamando a mesma RPC 'atualizar_pluggy_contas' com o mesmo payload
  ({"contas": resultado}) - nenhuma mudanca de interface aqui. O que mudou foi DENTRO da RPC: ela
  deixou de gravar o blob inteiro em wallace_dados.PLUGGY_CONTAS (V1) e passou a fazer substituicao
  total (delete + insert) nas 3 tabelas relacionais pluggy_conexoes/pluggy_contas/pluggy_transacoes
  (V2), mesmo comportamento de "snapshot completo a cada rodada" de antes. app.js le as tabelas
  novas via WallaceFinanceService.getPluggyContasV2(), nao mais VARS.PLUGGY_CONTAS. VARS.PLUGGY_TRIAGEM
  (decisoes de aprovar/rejeitar da Inbox) fica FORA desta migracao por enquanto - continua em
  wallace_dados, tratada como etapa posterior separada. Ver docs/changelog/PASSAGEM_DE_TURNO.md
  (08/08/2026) para o registro completo desta migracao.
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
    """POST /auth -> devolve a API Key (valida 2h)."""
    resp = _request(
        f"{PLUGGY_BASE}/auth",
        method="POST",
        body={"clientId": client_id, "clientSecret": client_secret},
    )
    api_key = resp.get("apiKey")
    if not api_key:
        raise RuntimeError(f"Resposta de /auth sem apiKey: {resp}")
    print(f"[debug] apiKey recebida: {len(api_key)} caracteres, começa com '{api_key[:6]}...'")
    return api_key


def testar_conectividade(api_key: str) -> None:
    """GET /connectors -> teste de diagnostico recomendado pela propria doc da Pluggy
    pra confirmar se a API Key funciona, SEM depender de nenhum item ja existir."""
    resp = _request(f"{PLUGGY_BASE}/connectors", headers={"X-API-KEY": api_key})
    total = resp.get("total", len(resp.get("results", [])))
    print(f"[debug] GET /connectors OK - {total} conectores disponíveis (confirma que a API Key funciona em geral)")


def buscar_item(api_key: str, item_id: str) -> dict:
    """GET /items/{id} -> detalhes de UM item especifico."""
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
    """GET /bills?accountId=X -> faturas (Bill) de uma conta de cartao de credito."""
    resp = _request(f"{PLUGGY_BASE}/bills?accountId={account_id}", headers={"X-API-KEY": api_key})
    return resp.get("results", [])


def listar_transacoes(api_key: str, account_id: str, dias: int = 40, max_paginas: int = 30) -> list[dict]:
    """GET /v2/transactions?accountId=X&createdAtFrom=DATA-HORA-ISO -> extrato da conta, paginado por CURSOR.

    CORRIGIDO 03/08/2026: o endpoint antigo /transactions (paginacao por numero de
    pagina) foi DESCONTINUADO pela Pluggy (retornava HTTP 410 Gone). Migrado para
    GET /v2/transactions, que pagina via cursor: cada resposta traz "next" (uma
    query-string pronta com o parametro "after") - repete a chamada usando esse
    "next" ate ele vir None/ausente. Mesmo comportamento de antes (so ultimos N
    dias, pageSize default 500 conforme doc oficial), so a mecanica de paginacao
    muda. max_paginas e so um teto de seguranca contra loop infinito.

    CORRIGIDO 04/08/2026 (parte 55, achado ao vivo depois do 1º sync real): mesmo mandando
    "createdAtFrom" certinho, a Pluggy documenta que na 1ª sincronização de uma conta ela
    SEMPRE devolve o histórico completo (até 12 meses), ignorando esse filtro - só vale
    pras sincronizações seguintes (incrementais). Confirmado em produção: transações vieram
    até 28/07/2025 (mais de 1 ano), inflando o registro no Supabase pra ~2.700 transações e
    deixando o carregamento do site lento (o site baixa esse blob inteiro em toda carga de
    página, mesmo descontando o que não usa). Corrigido filtrando aqui, DEPOIS de receber a
    resposta da Pluggy (não dá pra evitar a API mandar, só pra não guardar/propagar) - só
    guarda transações dentro da janela pedida (parâmetro "dias"), o resto é descartado antes
    de voltar pra quem chamou.
    """
    data_de = datetime.now(timezone.utc) - timedelta(days=dias)
    data_de_iso = data_de.strftime("%Y-%m-%dT00:00:00.000Z")
    transacoes: list[dict] = []
    proxima_url = f"{PLUGGY_BASE}/v2/transactions?accountId={account_id}&createdAtFrom={data_de_iso}"
    paginas = 0
    while proxima_url and paginas < max_paginas:
        resp = _request(proxima_url, headers={"X-API-KEY": api_key})
        transacoes.extend(resp.get("results", []))
        next_qs = resp.get("next")
        if not next_qs:
            break
        # "next" vem como query-string (ex: "?accountId=...&after=...") - concatena
        # com o host base da API. Se algum dia vier URL absoluta, usa direto.
        proxima_url = next_qs if next_qs.startswith("http") else f"{PLUGGY_BASE}/v2/transactions{next_qs}"
        paginas += 1
    # parte 55: corta pra janela pedida ANTES de devolver - a Pluggy pode ter mandado ate 12 meses
    # (1a sincronizacao), mas so a janela recente interessa pra guardar/propagar. "date" vem em
    # ISO-8601 (ex: "2026-07-15T00:00:00.000Z") - comparacao de string funciona pq o formato e fixo
    # e ordenavel lexicograficamente, mas parseia de verdade pra evitar essa armadilha silenciosa.
    transacoes_recentes = []
    for t in transacoes:
        data_tx = t.get("date")
        if not data_tx:
            transacoes_recentes.append(t)  # sem data, nao arrisca descartar - mantem por seguranca
            continue
        try:
            dt = datetime.fromisoformat(data_tx.replace("Z", "+00:00"))
        except ValueError:
            transacoes_recentes.append(t)  # formato inesperado, mesma logica de seguranca acima
            continue
        if dt >= data_de:
            transacoes_recentes.append(t)
    return transacoes_recentes


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
        status = item.get("status")

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
                    # CORRIGIDO 08/08/2026 (migracao V1 wallace_dados -> V2 relacional): id real da
                    # conta na API Pluggy, nunca capturado antes. "numero" (mascarado) NAO e unico por
                    # conexao - achado real durante a migracao: duas contas do mesmo item BTG
                    # compartilham numero identico (produtos diferentes, "BTG Investimentos" e
                    # "BTG Banking"). A tabela pluggy_contas usa este id como chave primaria.
                    "id": c.get("id"),
                    "tipo": c.get("type"),
                    "subtipo": c.get("subtype"),
                    "nome": c.get("name"),
                    "numero": c.get("number"),
                    "saldo": c.get("balance"),
                    "moeda": c.get("currencyCode"),
                }
                if c.get("type") == "CREDIT":
                    conta_info["saldo_significado"] = "limite total usado (não é a fatura do mês)"
                    cd = c.get("creditData") or {}
                    conta_info["limite_total"] = cd.get("creditLimit")
                    conta_info["limite_disponivel"] = cd.get("availableCreditLimit")
                    conta_info["fatura_vencimento_atual"] = cd.get("balanceDueDate")
                    try:
                        faturas = listar_faturas(api_key, c["id"])
                        if faturas:
                            faturas_ordenadas = sorted(faturas, key=lambda f: f.get("dueDate") or "", reverse=True)
                            fatura_atual = faturas_ordenadas[0]
                            conta_info["fatura_mes_atual"] = {
                                "valor_total": fatura_atual.get("totalAmount"),
                                "vencimento": fatura_atual.get("dueDate"),
                                "pagamento_minimo": fatura_atual.get("minimumPaymentAmount"),
                            }
                    except RuntimeError as e:
                        conta_info["fatura_mes_atual_erro"] = str(e)

                try:
                    transacoes = listar_transacoes(api_key, c["id"])
                    conta_info["transacoes_recentes"] = [
                        {
                            "id": t.get("id"),
                            "data": t.get("date"),
                            "descricao": t.get("description"),
                            "valor": t.get("amount"),
                            "categoria": t.get("category"),
                            "status": t.get("status"),
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
        except RuntimeError:
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
    conjunto (set) dos valores absolutos ja conhecidos."""
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/wallace_dados?select=dados&id=eq.1"
    req = Request(url, headers=headers, method="GET")
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    dados = linhas[0]["dados"] if linhas else {}

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
    """Separa transacoes da Pluggy que nao batem com nenhum valor ja lancado no ERP."""
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
    # CORRIGIDO 08/08/2026 (achado real: toda falha desta chamada só mostrava "HTTP Error 400: Bad
    # Request" no log da Action, nunca o motivo) - esta função usava urlopen() direto, sem o
    # try/except de _request() que lê e.read() no erro. Resultado: o corpo da resposta do
    # PostgREST/Postgres (que traz a mensagem exata do erro) era descartado antes de qualquer log
    # acontecer. Trocado para reusar _request() - mesmo comportamento em caso de sucesso, mas agora
    # RuntimeError(...) carrega o corpo completo da resposta de erro.
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    rpc_url = f"{supabase_url}/rest/v1/rpc/atualizar_pluggy_contas"
    resposta = _request(rpc_url, method="POST", headers=headers, body={"contas": resultado})
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

            print("\nConferindo transações contra o ERP...")
            valores_conhecidos = buscar_valores_conhecidos(supabase_url, supabase_key)
            suspeitas = detectar_transacoes_suspeitas(resultado, valores_conhecidos)
            print(f"Transações suspeitas (possivelmente não lançadas): {len(suspeitas)}")
            for s in suspeitas:
                print(f"  - {s['data']} | {s['banco']} | {s['descricao']} | R$ {s['valor']:.2f}")

            if suspeitas and email_from and email_password and email_to:
                print("\nEnviando e-mail de aviso...")
                # CORRIGIDO 04/08/2026 (parte 58, bug real reportado pelo usuario: run do GitHub Actions
                # terminou com "exit code 1" logo apos "Enviando e-mail de aviso..."): o Supabase JA
                # tinha sido atualizado (atualizar_supabase() roda ANTES disso, linha acima) - ou seja,
                # a sincronizacao de verdade tinha dado certo, so o aviso por e-mail (feature bonus,
                # nao critica) falhou (mais provavel: Gmail exige "Senha de app" quando a conta tem
                # verificacao em 2 etapas, EMAIL_PASSWORD normal da conta e rejeitado no login SMTP) e
                # isso derrubava o job INTEIRO por causa do try/except unico em volta de tudo. Envolvido
                # num try/except proprio agora - falha no e-mail vira aviso no log, nunca mais marca o
                # job inteiro como falho por causa de uma notificacao que nao e o objetivo real do script.
                try:
                    enviar_email_suspeitas(suspeitas, email_smtp_host, email_smtp_port, email_from, email_password, email_to)
                    print("E-mail enviado.")
                except Exception as e:
                    print(f"AVISO: falha ao enviar e-mail de aviso ({e}) - Supabase já foi atualizado normalmente, isso não afeta a sincronização.", file=sys.stderr)
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
