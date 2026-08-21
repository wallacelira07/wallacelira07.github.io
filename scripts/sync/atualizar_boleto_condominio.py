#!/usr/bin/env python3
"""
Automação do boleto de condomínio (Bellagio Residence) via Gmail -> Supabase
=============================================================================
NOVO 20/08/2026. Mesmo padrão geral de scripts/sync/atualizar_boletos_medintech.py (autenticação
Gmail/idempotência) — módulo separado porque a fonte (Condomob, administradora "Nova Mais") manda
o valor DIRETO NO CORPO do e-mail, em texto plano, sem PDF anexado — mais simples que os outros
robôs, não precisa de `pdfplumber`.

NÃO EXISTE API pública da administradora de condomínio. A fonte real é e-mail:
  - Remetente: `condomob@email.condomob.net` (confirmado pelo usuário 20/08/2026).
  - Assunto: "Bellagio Residence - Seu boleto vencera daqui a N dia(s)".
  - Corpo (texto plano, confirmado em print real): linhas `Unidade: C806`, `Condomínio: Bellagio
    Residence`, `Vencimento: DD/MM/AAAA`, `Período: MM/AAAA`, `Valor: R$ X,XX`.
  - Usuário confirmou o padrão de envio: normalmente 2 e-mails por mês — um ~10-12 dias antes do
    vencimento, outro sempre no dia 9 (1 dia antes, já que o vencimento é dia 10). Este robô não
    depende de pegar os 2 — só o mais recente dentro da janela de busca, mesmo idempotente de
    sempre (só escreve se o valor mudou).

ACHADO REAL AO VALIDAR (20/08/2026), CORRIGIDO NA HORA: o robô inicialmente gravou R$220,00 (valor
literal do campo "Valor:" do e-mail) por cima do R$210,00 já cadastrado — o usuário corrigiu:
R$210,00 estava CERTO, é o valor pago com desconto de pontualidade; o e-mail mostra o valor
NOMINAL (sem desconto). Confirmado pelo usuário: o desconto é sempre **R$10,00 fixo**. O parser
agora subtrai R$10,00 do valor extraído do e-mail antes de gravar (`_DESCONTO_PONTUALIDADE`) — se
esse desconto mudar de valor um dia, atualizar a constante, não o valor final direto.

Autenticação: mesma de atualizar_boletos_medintech.py (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN,
SUPABASE_URL/KEY, já cadastrados nos Secrets do GitHub — reaproveitados, nenhum secret novo).

Idempotente: só escreve se o valor mudou (tolerância de 0,5 centavo). Nunca inventa valor — se o
e-mail não tiver os campos esperados no corpo, loga e pula, sem tocar no registro.
"""
import base64
import json
import os
import re
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

_TX_CONDOMINIO = "TXB000002"  # Condomínio Bellagio (ver cronograma_boletos_fixos)
_DESCONTO_PONTUALIDADE = 10.00  # confirmado pelo usuário 20/08/2026 — ver cabeçalho do módulo

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
    """'220,00' -> 220.0; '1.234,56' -> 1234.56."""
    try:
        return round(float(texto.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def _texto_do_corpo_email(msg: dict) -> str:
    """Concatena todas as partes text/plain do e-mail (corpo pode vir em 1 parte única ou em
    multipart/alternative com text/plain + text/html — usa só o texto plano, mais fácil de casar
    com regex do que HTML)."""
    def _decodificar(parte: dict) -> str:
        dados = (parte.get("body") or {}).get("data")
        if not dados:
            return ""
        try:
            return base64.urlsafe_b64decode(dados + "=" * (-len(dados) % 4)).decode("utf-8", errors="replace")
        except Exception:
            return ""

    payload = msg.get("payload", {})
    partes = payload.get("parts")
    if not partes:
        return _decodificar(payload)

    textos = []

    def _percorrer(lista_partes):
        for p in lista_partes:
            if p.get("mimeType") == "text/plain":
                textos.append(_decodificar(p))
            elif p.get("parts"):
                _percorrer(p["parts"])

    _percorrer(partes)
    return "\n".join(textos)


def _extrair_dados_condominio(texto_email: str) -> dict | None:
    m_valor = re.search(r"Valor:\s*R\$\s*([\d.,]+)", texto_email)
    m_venc = re.search(r"Vencimento:\s*(\d{2}/\d{2}/\d{4})", texto_email)
    m_periodo = re.search(r"Per[ií]odo:\s*(\d{2}/\d{4})", texto_email)
    m_unidade = re.search(r"Unidade:\s*(\S+)", texto_email)
    if not m_valor:
        return None
    valor_nominal = _texto_para_valor(m_valor.group(1))
    if valor_nominal is None:
        return None
    return {
        "valor_nominal": valor_nominal,
        "valor": round(valor_nominal - _DESCONTO_PONTUALIDADE, 2),  # valor real pago, com desconto
        "vencimento": m_venc.group(1) if m_venc else None,
        "periodo": m_periodo.group(1) if m_periodo else None,
        "unidade": m_unidade.group(1) if m_unidade else None,
    }


def buscar_boleto_condominio(access_token: str) -> float | None:
    """Retorna o valor do boleto de condomínio mais recente encontrado nos últimos 15 dias (janela
    maior que os outros robôs — o usuário confirmou que os 2 e-mails do mês podem chegar com até
    ~12 dias de intervalo entre si), ou None se não achar nenhum e-mail com os campos esperados."""
    busca = _gmail_get(
        "/messages?q=" + "from:condomob@email.condomob.net newer_than:15d".replace(" ", "%20"),
        access_token,
    )
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        texto = _texto_do_corpo_email(msg)
        dados = _extrair_dados_condominio(texto)
        if dados is None:
            print(f"AVISO: e-mail '{assunto}' não tem os campos esperados no corpo — pulando.", file=sys.stderr)
            continue
        print(f"Condomínio (unidade {dados['unidade']}, período {dados['periodo']}, vence {dados['vencimento']}): R$ {dados['valor_nominal']:.2f} nominal - R$ {_DESCONTO_PONTUALIDADE:.2f} pontualidade = R$ {dados['valor']:.2f} — extraído de '{assunto}'")
        return dados["valor"]  # Gmail retorna mais recente primeiro — o 1º achado já é o que vale
    return None


def obter_valor_atual(supabase_url: str, supabase_key: str) -> float | None:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=eq.{_TX_CONDOMINIO}&select=valor"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    return float(linhas[0]["valor"]) if linhas else None


def atualizar_supabase(supabase_url: str, supabase_key: str, valor: float) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=eq.{_TX_CONDOMINIO}"
    body = json.dumps({"valor": valor}).encode("utf-8")
    req = Request(url, data=body, headers=headers, method="PATCH")
    try:
        with urlopen(req, timeout=20) as resp:
            resultado = resp.read().decode("utf-8")
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} ao atualizar {_TX_CONDOMINIO}: {corpo}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar {_TX_CONDOMINIO}: {e}") from e
    print(f"Supabase atualizado ({_TX_CONDOMINIO}): {resultado}")


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
        print("Buscando boleto de condomínio (Bellagio Residence) dos últimos 15 dias...")
        valor_novo = buscar_boleto_condominio(access_token)

        if valor_novo is None:
            print("Nenhum boleto de condomínio novo encontrado neste período — nada a atualizar.")
            return 0

        valor_atual = obter_valor_atual(supabase_url, supabase_key)
        if valor_atual is not None and abs(valor_atual - valor_novo) < 0.005:
            print(f"{_TX_CONDOMINIO}: valor já está atualizado (R$ {valor_atual:.2f}) — nada a fazer.")
        else:
            print(f"{_TX_CONDOMINIO}: R$ {valor_atual if valor_atual is not None else '—'} -> R$ {valor_novo:.2f}")
            atualizar_supabase(supabase_url, supabase_key, valor_novo)

        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(__file__))
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("boleto_condominio", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
