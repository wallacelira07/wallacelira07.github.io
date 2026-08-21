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
  - Grupo I0464 / Cota 0012-00 -> TXCON000002 (Casa Nova) — confirmado em PDF real 20/08/2026
    (Valor Contrib. Mensal R$1.449,45, bate com o valor já cadastrado em cronograma_boletos_fixos).
  - Grupo AF316 / Cota 0346-00 -> TXCON000001 (Carro) — confirmado em PDF real 20/08/2026 (última
    parcela paga, nº 023, R$501,15 — o valor cadastrado estava desatualizado em R$501,32, evidência
    de que o valor da parcela muda mês a mês por correção/reajuste, exatamente o tipo de drift que
    este robô resolve).

CAMPO EXTRAÍDO: "Valor Contrib. Mensal" (rótulo sempre presente e claramente identificado no
extrato, confirmado nos 2 PDFs reais) — é o valor da parcela ATUAL, o mesmo conceito que
cronograma_boletos_fixos.valor já representa pros outros boletos fixos.

DESTINO: cronograma_boletos_fixos (TXCON000001/TXCON000002), NÃO cronograma_consorcios — achado
real ao investigar: cronograma_consorcios tem as 2 linhas com ativo=false (tabela desativada desde
que os consórcios migraram do Mastercard Black pra pagamento em dinheiro em 11/08/2026, ver
render-parcelamentos.js/hydrate-onda9-livros-fixos.js) e um valor não mais lido pelo painel em
lugar nenhum. cronograma_boletos_fixos é a fonte viva hoje (mesmos tx_legado TXCON000001/000002,
reaproveitados na migração pra não perder o histórico do código).

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
    """Retorna {tx: valor} pros consórcios encontrados nos últimos 10 dias — mesma janela dos
    outros robôs de e-mail deste sistema."""
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
        valor = _extrair_valor_contribuicao_mensal(texto)
        if valor is None:
            print(f"AVISO: não consegui extrair valor da parcela mais recente do PDF de '{assunto}' ({tx}) — pulando.", file=sys.stderr)
            continue
        if tx not in resultado:  # Gmail retorna mais recente primeiro — não sobrescreve com e-mail mais antigo
            resultado[tx] = valor
            print(f"{tx} (Grupo {grupo_cota[0]}, Cota {grupo_cota[1]}): R$ {valor:.2f} — extraído de '{assunto}'")
    return resultado


def obter_valores_atuais(supabase_url: str, supabase_key: str) -> dict:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    txs = ",".join(_GRUPO_COTA_PARA_TX.values())
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=in.({txs})&select=tx,valor"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    return {l["tx"]: float(l["valor"]) for l in linhas}


def atualizar_supabase(supabase_url: str, supabase_key: str, tx: str, valor: float) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=eq.{tx}"
    body = json.dumps({"valor": valor}).encode("utf-8")
    req = Request(url, data=body, headers=headers, method="PATCH")
    try:
        with urlopen(req, timeout=20) as resp:
            resultado = resp.read().decode("utf-8")
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} ao atualizar {tx}: {corpo}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar {tx}: {e}") from e
    print(f"Supabase atualizado ({tx}): {resultado}")


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

        atuais = obter_valores_atuais(supabase_url, supabase_key)
        for tx, valor_novo in encontrados.items():
            valor_atual = atuais.get(tx)
            if valor_atual is not None and abs(valor_atual - valor_novo) < 0.005:
                print(f"{tx}: valor já está atualizado (R$ {valor_atual:.2f}) — nada a fazer.")
                continue
            print(f"{tx}: R$ {valor_atual if valor_atual is not None else '—'} -> R$ {valor_novo:.2f}")
            atualizar_supabase(supabase_url, supabase_key, tx, valor_novo)

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
