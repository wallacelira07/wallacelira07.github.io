#!/usr/bin/env python3
"""
Automação da fatura do Mastercard Black (Itaú Personnalité, cartão físico final 1371) -> Supabase
====================================================================================================
NOVO 22/08/2026 (pedido do usuário: "crie um robô para pegar a fatura do cartão itaú"). Mesmo padrão
Gmail já validado nos outros robôs (Água/Gás/Energia/Consórcio/Condomínio, ver
scripts/sync/atualizar_boletos_medintech.py) — busca por e-mail com PDF anexado, extrai o valor real,
grava no Supabase. Só 2 diferenças reais:

1. O PDF é protegido por senha (Itaú manda sempre criptografado) — os 5 primeiros dígitos do CPF do
   titular, confirmado 22/08/2026 com o PDF real do usuário. NÃO guardar o CPF completo em nenhum
   arquivo deste repositório (é público) — só a senha derivada (5 dígitos) já resolvida, ver
   `_SENHA_PDF` abaixo.
2. O valor atualizado é `indicadores.cartaoMBTotal` (tabela `indicadores`, não `parametros_gerais` —
   ver docs/MANUAL_OPERACIONAL_AGENTES.md seção sobre a duplicação eliminada em 21/08/2026: a fonte
   real hoje é só `indicadores`). Essa âncora está na lista `PLUGGY_PROMOCAO_TRAVADA`
   (pluggy-reconciliacao.js) — a fatura real (PDF) sempre vence a sincronização automática da Pluggy,
   então gravar aqui é exatamente a fonte que o usuário já decidiu que deve mandar.

Remetente: faturadigital@itaupersonnalite.com.br (confirmado no e-mail real recebido 22/08/2026).
Assunto real visto: mencionar "Fatura" + o nome do cartão (Mastercard Black) — busca por remetente +
anexo é suficiente, mais frouxa que por assunto exato (mesmo padrão da Energisa, evita quebrar se o
assunto mudar ligeiramente mês a mês).

NÃO EXISTE API do Itaú pra isso (mesma pesquisa já feita pros outros bancos) — sempre e-mail com PDF.
"""
import base64
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

_GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

# Cartão físico "MB" (Mastercard Black), Itaú Personnalité, final 1371 — confirmado no PDF real
# 22/08/2026 ("Cartão 5234.XXXX.XXXX.1371 MASTERCARD BLACK").
# CORRIGIDO 22/08/2026 (achado real: este repositório é PÚBLICO — guardar o CPF completo aqui, mesmo
# só pra derivar 5 dígitos, expunha o documento inteiro no histórico do Git pra qualquer pessoa. A
# senha em si (5 dígitos) é o suficiente pra esta automação funcionar, sem precisar do CPF completo
# no código-fonte.
_SENHA_PDF = "09639"
_CARTAO_FINAL_ESPERADO = "1371"


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


def _anexo_pdf_do_email(msg: dict) -> str | None:
    for parte in msg["payload"].get("parts", []) or []:
        if (parte.get("filename") or "").lower().endswith(".pdf"):
            return parte["body"].get("attachmentId")
    return None


def _baixar_texto_pdf(dados_pdf_base64: bytes, senha: str) -> str:
    import io
    import pdfplumber
    with pdfplumber.open(io.BytesIO(dados_pdf_base64), password=senha) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def _texto_para_valor(texto: str) -> float | None:
    """'7.210,07' -> 7210.07."""
    try:
        return round(float(texto.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def _extrair_total_fatura(texto_pdf: str) -> float | None:
    m = re.search(r"Totaldestafatura\s*([\d.,]+)", texto_pdf)
    return _texto_para_valor(m.group(1)) if m else None


def _extrair_vencimento(texto_pdf: str) -> str | None:
    m = re.search(r"Vencimento:(\d{2}/\d{2}/\d{4})", texto_pdf)
    return m.group(1) if m else None


def _confirmar_cartao_certo(texto_pdf: str) -> bool:
    """Nunca grava fatura de um cartão diferente por engano — a mesma caixa postal pode um dia
    receber fatura de outro cartão Itaú da família (dependente, etc)."""
    m = re.search(r"Cart.o\s*\d{4}\.XXXX\.XXXX\.(\d{4})", texto_pdf)
    return bool(m and m.group(1) == _CARTAO_FINAL_ESPERADO)


def buscar_fatura_itau_mb(access_token: str) -> tuple[float, str] | None:
    busca = _gmail_get(
        "/messages?q=" + "from:faturadigital@itaupersonnalite.com.br has:attachment newer_than:10d".replace(" ", "%20"),
        access_token,
    )
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        anexo_id = _anexo_pdf_do_email(msg)
        if anexo_id is None:
            print(f"AVISO: e-mail '{assunto}' (Itaú) sem PDF anexado — pulando.", file=sys.stderr)
            continue
        anexo = _gmail_get(f"/messages/{item['id']}/attachments/{anexo_id}", access_token)
        dados_pdf = base64.urlsafe_b64decode(anexo["data"])
        try:
            texto = _baixar_texto_pdf(dados_pdf, _SENHA_PDF)
        except Exception as e:
            print(f"AVISO: não consegui abrir o PDF de '{assunto}' (senha errada ou formato mudou?) — {e}", file=sys.stderr)
            continue
        if not _confirmar_cartao_certo(texto):
            print(f"AVISO: PDF de '{assunto}' não é do cartão final {_CARTAO_FINAL_ESPERADO} — pulando, nada é inventado.", file=sys.stderr)
            continue
        total = _extrair_total_fatura(texto)
        vencimento = _extrair_vencimento(texto)
        if total is None:
            print(f"AVISO: não consegui extrair o total da fatura de '{assunto}' — pulando, nada é inventado.", file=sys.stderr)
            continue
        print(f"Fatura Itaú MB: R$ {total:.2f} (vencimento {vencimento or '?'}) — extraído de '{assunto}'")
        return total, vencimento or ""
    return None


def obter_indicador_atual(supabase_url: str, supabase_key: str, nome: str) -> float | None:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/indicadores?nome=eq.{nome}&select=valor"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    return float(linhas[0]["valor"]) if linhas else None


def atualizar_indicador(supabase_url: str, supabase_key: str, nome: str, valor: float) -> None:
    import datetime
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    hoje = datetime.date.today().isoformat()
    url = f"{supabase_url}/rest/v1/indicadores?on_conflict=nome"
    corpo = json.dumps({"nome": nome, "valor": valor, "data_calculo": hoje}).encode("utf-8")
    req = Request(url, data=corpo, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=20) as resp:
            resultado = resp.read().decode("utf-8")
    except HTTPError as e:
        corpo_erro = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} ao atualizar indicador {nome}: {corpo_erro}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar indicador {nome}: {e}") from e
    print(f"Supabase atualizado (indicadores.{nome}): {resultado}")


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
        print("Buscando fatura do Mastercard Black (Itaú) dos últimos 10 dias...")
        encontrado = buscar_fatura_itau_mb(access_token)

        if encontrado is None:
            print("Nenhuma fatura nova encontrada.")
        else:
            total, _vencimento = encontrado
            atual = obter_indicador_atual(supabase_url, supabase_key, "cartaoMBTotal")
            if atual is not None and abs(atual - total) < 0.005:
                print(f"cartaoMBTotal: valor já está atualizado (R$ {atual:.2f}) — nada a fazer.")
            else:
                print(f"cartaoMBTotal: R$ {atual if atual is not None else '—'} -> R$ {total:.2f}")
                atualizar_indicador(supabase_url, supabase_key, "cartaoMBTotal", total)

        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
