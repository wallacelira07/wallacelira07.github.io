#!/usr/bin/env python3
"""
Automação das faturas Água/Gás Medintech (BZS Tecnologia) -> Supabase (Sistema Wallace Lira)
==============================================================================================
NOVO 19/08/2026. Resolve o achado da varredura anti-hardcode: os 2 componentes de consumo do
"piso absoluto" (TXB000004 Água, TXB000005 Gás, cronograma_boletos_fixos) eram valores fixos
digitados à mão, mas são contas de CONSUMO que mudam todo mês de verdade — confirmado com PDF real
(fatura de julho/2026: Água R$152,16 vs R$133,41 cadastrado, Gás R$36,70 vs R$30,28 cadastrado).

NÃO EXISTE API PÚBLICA da BZS/Medintech (confirmado por pesquisa: só formulário web em
https://sga.bzs.com.br/segunda-via/consumidor?s=medintech, sem documentação de integração). A
fonte real é o e-mail mensal de sistemas@bzs.com.br ("A tarifa referente ao mês de [mês] chegou -
Conta: [753/1024]") com o PDF da fatura anexado — confirmado (Nível A, e-mails reais lidos
19/08/2026): 1 e-mail por conta por mês, sempre por volta do dia 19-22, valor SÓ no PDF (nunca no
corpo do e-mail).

MÉTODO DE EXTRAÇÃO — linha digitável do boleto, não o layout visual do PDF: o campo de valor NÃO é
lido por regex solto em cima do texto extraído (frágil a mudança de layout) — é decodificado da
LINHA DIGITÁVEL do boleto, formato padrão Febraban (47 dígitos, 5º campo = 14 dígitos = 4 dígitos de
fator de vencimento + 10 dígitos de valor em centavos). Esse formato é regulado, estável, e
independente de qualquer mudança visual que a Medintech faça na fatura. Confirmado contra os 2 PDFs
reais de julho/2026: linha "...15340000015216" -> últimos 10 dígitos "0000015216" = 15216 centavos =
R$152,16 (bate exato com "VALOR TOTAL" impresso).

Conta (753=Água/TXB000004, 1024=Gás/TXB000005) vem do ASSUNTO do e-mail (nunca do PDF) — o padrão
"Conta: 753"/"Conta: 1024" é o dado mais confiável disponível, sem precisar abrir o PDF pra saber
qual é qual.

Autenticação: OAuth 2.0 com refresh_token de longa duração (obtido 1x, manualmente, fora deste
script — ver docs/decisions/ da integração). Variáveis de ambiente necessárias:
  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
  SUPABASE_URL, SUPABASE_KEY (service_role)

Idempotente: se o valor buscado for igual ao já cadastrado, não escreve nada (evita `atualizado_em`
mudando à toa). Nunca inventa valor — se não achar e-mail do mês corrente pra alguma das 2 contas,
loga e segue sem tocar naquele registro (P1: nunca aplicar dado sem evidência).
"""
import base64
import json
import os
import re
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# tx/conta -> mapeamento fixo (ver cronograma_boletos_fixos, migração 18/08/2026)
_CONTA_PARA_TX = {
    "753": "TXB000004",   # Água
    "1024": "TXB000005",  # Gás
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


def _extrair_conta_do_assunto(assunto: str) -> str | None:
    m = re.search(r"Conta:\s*(\d+)", assunto or "")
    return m.group(1) if m else None


def _extrair_valor_da_linha_digitavel(texto_pdf: str) -> float | None:
    """Decodifica o valor a partir da linha digitável padrão Febraban (ver cabeçalho do módulo).
    Procura o 5º campo (14 dígitos, sem pontuação, geralmente colado no fim da linha digitável)."""
    candidatos = re.findall(r"\b(\d{14})\b", texto_pdf.replace(".", "").replace(" ", "\n"))
    for c in candidatos:
        centavos = int(c[4:])  # 10 dígitos finais = valor em centavos
        valor = centavos / 100
        if 1.00 <= valor <= 5000.00:  # faixa plausível pra essas 2 contas — descarta falso-positivo
            return round(valor, 2)
    return None


def _baixar_texto_pdf(dados_pdf_base64: bytes) -> str:
    import io
    import pdfplumber
    with pdfplumber.open(io.BytesIO(dados_pdf_base64)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def buscar_faturas_do_mes(access_token: str) -> dict:
    """Retorna {tx: valor} pras faturas Medintech encontradas nos últimos 10 dias."""
    resultado = {}
    busca = _gmail_get("/messages?q=" + "from:sistemas@bzs.com.br newer_than:10d".replace(" ", "%20"), access_token)
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        conta = _extrair_conta_do_assunto(assunto)
        if conta is None or conta not in _CONTA_PARA_TX:
            continue
        tx = _CONTA_PARA_TX[conta]
        anexo_id = None
        for parte in msg["payload"].get("parts", []) or []:
            if (parte.get("filename") or "").lower().endswith(".pdf"):
                anexo_id = parte["body"].get("attachmentId")
                break
        if anexo_id is None:
            print(f"AVISO: e-mail '{assunto}' (conta {conta}) sem PDF anexado — pulando.", file=sys.stderr)
            continue
        anexo = _gmail_get(f"/messages/{item['id']}/attachments/{anexo_id}", access_token)
        dados_pdf = base64.urlsafe_b64decode(anexo["data"])
        texto = _baixar_texto_pdf(dados_pdf)
        valor = _extrair_valor_da_linha_digitavel(texto)
        if valor is None:
            print(f"AVISO: não consegui extrair valor do PDF de '{assunto}' (conta {conta}) — pulando, nada é inventado.", file=sys.stderr)
            continue
        # Se já achou este tx num e-mail mais recente nesta mesma execução, mantém o mais recente
        # (Gmail já retorna mais recente primeiro) — não sobrescreve com um e-mail mais antigo.
        if tx not in resultado:
            resultado[tx] = valor
            print(f"Conta {conta} ({tx}): R$ {valor:.2f} — extraído de '{assunto}'")
    return resultado


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


def obter_valores_atuais(supabase_url: str, supabase_key: str) -> dict:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=in.(TXB000004,TXB000005)&select=tx,valor"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    return {l["tx"]: float(l["valor"]) for l in linhas}


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
        print("Buscando faturas Medintech (Água/Gás) dos últimos 10 dias...")
        encontradas = buscar_faturas_do_mes(access_token)
        if not encontradas:
            print("Nenhuma fatura nova encontrada neste período — nada a atualizar.")
            return 0
        atuais = obter_valores_atuais(supabase_url, supabase_key)
        for tx, valor_novo in encontradas.items():
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
    registrar_execucao("boletos_medintech", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
