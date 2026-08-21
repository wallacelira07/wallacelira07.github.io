#!/usr/bin/env python3
"""
Automação dos extratos de consórcio Porto Seguro -> Supabase
==============================================================
NOVO 20/08/2026. Mesmo padrão de scripts/sync/atualizar_boletos_medintech.py (ver esse arquivo pra
contexto geral de autenticação Gmail/idempotência) — módulo separado porque a fonte (Porto Seguro,
não Medintech/Energisa) e o formato do documento (extrato de consórcio, não boleto/fatura) são
diferentes o bastante pra não valer a pena forçar no mesmo arquivo.

NÃO EXISTE API pública da Porto Seguro Administradora de Consórcios (mesma conclusão da pesquisa de
DDA que já valeu pra Medintech/Energisa — ver docs/decisions/AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md).
A fonte real é e-mail com PDF "Extrato do Consorciado" anexado:
  - Remetente: comunicacao@novidades.portobank.com.br (confirmado pelo usuário 20/08/2026).
  - Assunto: ainda não confirmado contra um e-mail automático real — os 2 PDFs usados pra validar
    este parser vieram de um print/encaminhamento manual do usuário, não de um e-mail automático
    visto diretamente. Por isso a busca aqui é só por remetente + anexo, sem exigir palavra no
    assunto (mais frouxa, compensada pela identificação por Grupo+Cota antes de aceitar qualquer
    valor — mesmo cuidado já usado pra Energisa).

IDENTIFICAÇÃO DE QUAL CONSÓRCIO É QUAL — por Grupo+Cota (únicos por contrato, nunca mudam), não
por "Bem"/nome do produto (ambíguo, "IMOVEL"/"AUTOMOVEL" não diz qual consórcio específico é):
  - Grupo I0464 / Cota 0012-00 -> TXCON000002 (Casa Nova) / patrimonio.subtipo='consorcio_casa_pago'
    — confirmado em PDF real 20/08/2026 (Valor Contrib. Mensal R$1.449,45, bate com o valor já
    cadastrado em cronograma_boletos_fixos).
  - Grupo AF316 / Cota 0346-00 -> TXCON000001 (Carro) / patrimonio.subtipo='consorcio_auto' —
    confirmado em PDF real 20/08/2026 (última parcela paga, nº 023, R$501,15 — o valor cadastrado
    estava desatualizado em R$501,32, evidência de que o valor da parcela muda mês a mês por
    correção/reajuste, exatamente o tipo de drift que este robô resolve).

CAMPOS EXTRAÍDOS (confirmados nos 2 PDFs reais, 21/08/2026):
  - valor: última linha "RECBTO. PARCELA" da Conta Corrente (parcela ATUAL, não o "Valor Contrib.
    Mensal" do plano original — mesmo conceito que cronograma_boletos_fixos.valor já representa pros
    outros boletos fixos).
  - percentual_pago: linha "TOTAL ... 100,0000 Ideal Devido" da seção "Percentuais Contribuição
    Mensal".
  - valor_quitacao: 2º valor da linha "TOTAL ... TOTAL <valor> ..." da seção "Valores/Percentuais
    a Pagar" — total ainda devido do plano inteiro (Fundo Comum + Fundo de Reserva + Taxa Adm).
    NÃO confundir com "Liquido à Pagar" do bloco "Contemplação" (esse é só o saldo do BEM
    contemplado, sempre R$0,00 quando pago por lance — conceito diferente, não usado aqui).

DESTINO — 2 tabelas diferentes, cada uma com seu dono:
  - valor -> cronograma_boletos_fixos (TXCON000001/TXCON000002) — é o que efetivamente sai da Caixa
    Boletos todo mês. NÃO cronograma_consorcios: essa tabela tem as 2 linhas com ativo=false
    (desativada desde que os consórcios migraram do Mastercard Black pra pagamento em dinheiro em
    11/08/2026) e não é mais lida pelo painel em lugar nenhum.
  - percentual_pago/valor_quitacao -> financiamentos (join por patrimonio_id com
    patrimonio.subtipo='consorcio_auto'/'consorcio_casa_pago') — é o que os cards "Consórcio auto"/
    "Consórcio Casa Nova" (vw_patrimonio_v2) exibem. ACHADO REAL 21/08/2026: uma tentativa anterior
    nesta mesma sessão gravou esses 2 campos em cronograma_boletos_fixos (colunas novas,
    percentual_pago/contemplada/valor_quitacao) sem notar que financiamentos já existia e já
    alimentava a tela — revertido (colunas dropadas) antes de publicar, pra não duplicar a mesma
    informação em 2 lugares (mesma classe de bug já documentada no manual, seção 1.3.2).

Autenticação: mesma de atualizar_boletos_medintech.py (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN,
SUPABASE_URL/KEY, já cadastrados nos Secrets do GitHub — reaproveitados, nenhum secret novo).

Idempotente: só escreve se o valor mudou (tolerância de 0,5 centavo, mesmo padrão dos outros robôs).
Nunca inventa valor — se o PDF não tiver Grupo+Cota reconhecido ou "Valor Contrib. Mensal" legível,
loga e pula, sem tocar no registro.
"""
import base64
import json
import os
import re
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Grupo+Cota -> tx em cronograma_boletos_fixos (ver cabeçalho do módulo pra proveniência de cada um).
_GRUPO_COTA_PARA_TX = {
    ("I0464", "0012-00"): "TXCON000002",  # Casa Nova
    ("AF316", "0346-00"): "TXCON000001",  # Carro
}

# Grupo+Cota -> patrimonio.subtipo, pra achar a linha certa em financiamentos (join por patrimonio_id).
_GRUPO_COTA_PARA_SUBTIPO = {
    ("I0464", "0012-00"): "consorcio_casa_pago",
    ("AF316", "0346-00"): "consorcio_auto",
}

_GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


def _obter_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    body = (
        f"client_id={client_id}&client_secret={client_secret}"
        f"&refresh_token={refresh_token}&grant_type=refresh_token"
    ).encode("utf-8")
    req = Request(_GMAIL_TOKEN_URL, data=body, method="POST",
                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))["access_token"]


def _gmail_get(path: str, access_token: str) -> dict:
    req = Request(f"{_GMAIL_API_BASE}{path}", headers={"Authorization": f"Bearer {access_token}"})
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _texto_para_valor(texto: str) -> float | None:
    """'1.449,45' -> 1449.45."""
    try:
        return round(float(texto.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def _extrair_grupo_cota(texto_pdf: str) -> tuple[str, str] | None:
    m = re.search(r"Grupo:\s*([A-Z0-9]+)\s+Cota:\s*([\d-]+)", texto_pdf)
    if not m:
        return None
    return m.group(1), m.group(2)


def _extrair_valor_contribuicao_mensal(texto_pdf: str) -> float | None:
    """"Valor Contrib. Mensal:" seguido do valor — confirmado presente e sem ambiguidade nos 2 PDFs
    reais (Carro R$500,98 na foto do plano geral, mas R$501,15 na última parcela realmente paga —
    o rótulo "Valor Contrib. Mensal" da seção Percentuais é o plano ORIGINAL, não a parcela atual
    corrigida; por isso usa a ÚLTIMA linha "RECBTO. PARCELA" da Conta Corrente, não este campo)."""
    linhas_parcela = re.findall(
        r"\d{3}\s+RECBTO\.\s*PARCELA\s+\d{2}/\d{2}/\d{4}\s+\d{2}/\d{2}/\d{4}\s+([\d.,]+)\s+([\d.,]+)",
        texto_pdf,
    )
    if not linhas_parcela:
        return None
    # 1ª linha encontrada = parcela mais recente (extrato lista em ordem decrescente, confirmado nos
    # 2 PDFs reais — parcela mais alta aparece primeiro). "Valor a Pagar" (1º grupo) é o que
    # efetivamente venceu naquele mês, mesmo conceito de cronograma_boletos_fixos.valor.
    return _texto_para_valor(linhas_parcela[0][0])


def _extrair_percentual_pago(texto_pdf: str) -> float | None:
    """Linha "TOTAL <pago> <pendente> <a cobrar> 100,0000 Ideal Devido:" da seção "Percentuais
    Contribuição Mensal" — confirmado nos 2 PDFs reais (Carro 75,8576 / Casa Nova 0,6285). O sufixo
    "Ideal Devido" na mesma linha distingue esta TOTAL das outras 2 que aparecem mais abaixo no
    extrato (uma em R$, outra rotulada "TOTAIS")."""
    m = re.search(r"TOTAL\s+([\d,]+)\s+[\d,]+\s+[\d,]+\s+100,0000\s+Ideal Devido", texto_pdf)
    return _texto_para_valor(m.group(1)) if m else None


def _extrair_contemplada(texto_pdf: str) -> bool:
    """Só informativo (log) — extrato tem o bloco "Contemplação" (confirmado: presente na Cota
    AF316/Carro, ausente na I0464/Casa Nova). Não persistido: não existe coluna "contemplada" em
    nenhuma tabela hoje, e os badges "Contemplada com o bem"/"Não contemplada" na tela são texto
    fixo no HTML, já corretos pros 2 consórcios atuais — criar uma coluna nova só pra isso é
    prematuro sem um 3º consórcio real pra justificar automatizar."""
    return bool(re.search(r"Dt\.\s*Contempla[çc][ãa]o:", texto_pdf))


def _extrair_valor_quitacao(texto_pdf: str) -> float | None:
    """2º valor da linha "TOTAL <pago R$> <pago %> TOTAL <a pagar R$> <a pagar %>" da seção
    "Valores/Percentuais Pagos" × "a Pagar" — total ainda devido do plano inteiro (Fundo Comum +
    Fundo de Reserva + Taxa de Administração). Confirmado nos 2 PDFs reais (Carro R$18.504,34 /
    Casa Nova R$549.151,95). NÃO é o mesmo campo que "Liquido à Pagar" do bloco "Contemplação"
    (esse é só o saldo do BEM contemplado — R$0,00 pra um consórcio pago por lance, conceito
    diferente do "valor de quitação do plano" que a tela mostra)."""
    m = re.search(r"TOTAL\s+[\d.,]+\s+[\d,]+\s+TOTAL\s+([\d.,]+)\s+[\d,]+", texto_pdf)
    return _texto_para_valor(m.group(1)) if m else None


def _baixar_texto_pdf(dados_pdf_base64: bytes) -> str:
    import io
    import pdfplumber
    with pdfplumber.open(io.BytesIO(dados_pdf_base64)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def _anexo_pdf_do_email(msg: dict) -> str | None:
    for parte in msg["payload"].get("parts", []) or []:
        if (parte.get("filename") or "").lower().endswith(".pdf"):
            return parte["body"].get("attachmentId")
    return None


def buscar_extratos_consorcio(access_token: str) -> dict:
    """Retorna {subtipo: {tx, valor, percentual_pago, valor_quitacao}} pros consórcios encontrados
    nos últimos 10 dias — mesma janela dos outros robôs de e-mail deste sistema. Chave é o subtipo
    (não o tx) porque valor vai pra cronograma_boletos_fixos e percentual_pago/valor_quitacao vão
    pra financiamentos — 2 destinos, 1 registro por consórcio."""
    resultado: dict = {}
    busca = _gmail_get(
        "/messages?q=" + "from:comunicacao@novidades.portobank.com.br has:attachment newer_than:10d".replace(" ", "%20"),
        access_token,
    )
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        anexo_id = _anexo_pdf_do_email(msg)
        if anexo_id is None:
            continue
        anexo = _gmail_get(f"/messages/{item['id']}/attachments/{anexo_id}", access_token)
        texto = _baixar_texto_pdf(base64.urlsafe_b64decode(anexo["data"]))
        grupo_cota = _extrair_grupo_cota(texto)
        if grupo_cota is None or grupo_cota not in _GRUPO_COTA_PARA_TX:
            print(f"AVISO: PDF de '{assunto}' não confirma Grupo+Cota conhecido — pulando, nada é inventado.", file=sys.stderr)
            continue
        tx = _GRUPO_COTA_PARA_TX[grupo_cota]
        subtipo = _GRUPO_COTA_PARA_SUBTIPO[grupo_cota]
        valor = _extrair_valor_contribuicao_mensal(texto)
        if valor is None:
            print(f"AVISO: não consegui extrair valor da parcela mais recente do PDF de '{assunto}' ({tx}) — pulando.", file=sys.stderr)
            continue
        percentual_pago = _extrair_percentual_pago(texto)
        valor_quitacao = _extrair_valor_quitacao(texto)
        contemplada = _extrair_contemplada(texto)  # só log, ver docstring de _extrair_contemplada
        if subtipo not in resultado:  # Gmail retorna mais recente primeiro — não sobrescreve com e-mail mais antigo
            resultado[subtipo] = {
                "tx": tx,
                "valor": valor,
                "percentual_pago": percentual_pago,
                "valor_quitacao": valor_quitacao,
            }
            print(
                f"{tx} (Grupo {grupo_cota[0]}, Cota {grupo_cota[1]}): R$ {valor:.2f}, "
                f"% pago={percentual_pago}, contemplada={contemplada}, quitação={valor_quitacao} "
                f"— extraído de '{assunto}'"
            )
    return resultado


def _supabase_get(supabase_url: str, supabase_key: str, path: str) -> list:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    req = Request(f"{supabase_url}/rest/v1/{path}", headers=headers)
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _supabase_patch(supabase_url: str, supabase_key: str, path: str, corpo: dict) -> str:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    body = json.dumps(corpo).encode("utf-8")
    req = Request(f"{supabase_url}/rest/v1/{path}", data=body, headers=headers, method="PATCH")
    try:
        with urlopen(req, timeout=20) as resp:
            return resp.read().decode("utf-8")
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} ao atualizar {path}: {e.read().decode('utf-8', errors='replace')}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar {path}: {e}") from e


def obter_valores_atuais(supabase_url: str, supabase_key: str) -> dict:
    """{subtipo: {tx, valor, percentual_pago, valor_quitacao, financiamento_id}} — junta
    cronograma_boletos_fixos (valor, por tx) com financiamentos via patrimonio_id (percentual_pago/
    valor_quitacao, por patrimonio.subtipo). 3 fetches simples e diretos (sem embed do PostgREST,
    pra não depender de comportamento de filtro em recurso aninhado que varia por versão)."""
    txs = ",".join(_GRUPO_COTA_PARA_TX.values())
    linhas_boletos = _supabase_get(
        supabase_url, supabase_key, f"cronograma_boletos_fixos?tx=in.({txs})&select=tx,valor"
    )
    valor_por_tx = {l["tx"]: float(l["valor"]) for l in linhas_boletos}

    subtipos = ",".join(_GRUPO_COTA_PARA_SUBTIPO.values())
    linhas_pat = _supabase_get(
        supabase_url, supabase_key, f"patrimonio?subtipo=in.({subtipos})&select=id,subtipo"
    )
    patrimonio_id_por_subtipo = {l["subtipo"]: l["id"] for l in linhas_pat}

    patrimonio_ids = ",".join(patrimonio_id_por_subtipo.values())
    linhas_fin = _supabase_get(
        supabase_url, supabase_key,
        f"financiamentos?patrimonio_id=in.({patrimonio_ids})&select=id,patrimonio_id,percentual_pago,valor_quitacao",
    )
    fin_por_patrimonio_id = {
        l["patrimonio_id"]: {
            "financiamento_id": l["id"],
            "percentual_pago": float(l["percentual_pago"]) if l["percentual_pago"] is not None else None,
            "valor_quitacao": float(l["valor_quitacao"]) if l["valor_quitacao"] is not None else None,
        }
        for l in linhas_fin
    }

    resultado = {}
    for grupo_cota, tx in _GRUPO_COTA_PARA_TX.items():
        subtipo = _GRUPO_COTA_PARA_SUBTIPO[grupo_cota]
        patrimonio_id = patrimonio_id_por_subtipo.get(subtipo)
        fin = fin_por_patrimonio_id.get(patrimonio_id) if patrimonio_id else None
        if tx not in valor_por_tx or fin is None:
            continue
        resultado[subtipo] = {"tx": tx, "valor": valor_por_tx[tx], **fin}
    return resultado


def atualizar_supabase(supabase_url: str, supabase_key: str, subtipo: str, dados_novos: dict, financiamento_id: str) -> None:
    r1 = _supabase_patch(
        supabase_url, supabase_key, f"cronograma_boletos_fixos?tx=eq.{dados_novos['tx']}",
        {"valor": dados_novos["valor"]},
    )
    r2 = _supabase_patch(
        supabase_url, supabase_key, f"financiamentos?id=eq.{financiamento_id}",
        {"percentual_pago": dados_novos["percentual_pago"], "valor_quitacao": dados_novos["valor_quitacao"]},
    )
    print(f"Supabase atualizado ({subtipo}) — cronograma_boletos_fixos: {r1} | financiamentos: {r2}")


def main() -> int:
    client_id = os.environ.get("GMAIL_CLIENT_ID")
    client_secret = os.environ.get("GMAIL_CLIENT_SECRET")
    refresh_token = os.environ.get("GMAIL_REFRESH_TOKEN")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")

    faltando = [n for n, v in [
        ("GMAIL_CLIENT_ID", client_id), ("GMAIL_CLIENT_SECRET", client_secret),
        ("GMAIL_REFRESH_TOKEN", refresh_token),
        ("SUPABASE_URL", supabase_url), ("SUPABASE_KEY", supabase_key),
    ] if not v]
    if faltando:
        print(f"ERRO: variáveis de ambiente faltando: {', '.join(faltando)}", file=sys.stderr)
        return 1

    try:
        print("Autenticando na Gmail API...")
        access_token = _obter_access_token(client_id, client_secret, refresh_token)
        print("Buscando extratos de consórcio Porto Seguro dos últimos 10 dias...")
        encontrados = buscar_extratos_consorcio(access_token)

        if not encontrados:
            print("Nenhum extrato novo encontrado neste período — nada a atualizar.")
            return 0

        def _numero_mudou(a: float | None, b: float | None) -> bool:
            if a is None or b is None:
                return a != b
            return abs(a - b) >= 0.005

        atuais = obter_valores_atuais(supabase_url, supabase_key)
        for subtipo, dados_novos in encontrados.items():
            dados_atuais = atuais.get(subtipo)
            if dados_atuais is None:
                print(f"AVISO: '{subtipo}' não encontrado em cronograma_boletos_fixos/financiamentos — pulando (nada a atualizar às cegas).", file=sys.stderr)
                continue
            mudou = (
                _numero_mudou(dados_atuais["valor"], dados_novos["valor"])
                or _numero_mudou(dados_atuais["percentual_pago"], dados_novos["percentual_pago"])
                or _numero_mudou(dados_atuais["valor_quitacao"], dados_novos["valor_quitacao"])
            )
            if not mudou:
                print(f"{dados_novos['tx']} ({subtipo}): já está atualizado — nada a fazer.")
                continue
            print(f"{dados_novos['tx']} ({subtipo}): {dados_atuais} -> {dados_novos}")
            atualizar_supabase(supabase_url, supabase_key, subtipo, dados_novos, dados_atuais["financiamento_id"])

        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(__file__))
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("consorcio_porto", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
