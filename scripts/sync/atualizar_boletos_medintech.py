#!/usr/bin/env python3
"""
Automação de faturas de consumo (Água/Gás Medintech + Energia Energisa) -> Supabase
=======================================================================================
NOVO 19/08/2026, AMPLIADO 19/08/2026 (Energisa). Resolve o achado da varredura anti-hardcode: 3
componentes de consumo do "piso absoluto" (TXB000004 Água, TXB000005 Gás, TXB000009 Energia,
cronograma_boletos_fixos) eram valores fixos digitados à mão, mas são contas de CONSUMO que mudam
todo mês de verdade — confirmado com PDF real (Água R$133,41->R$152,16, Gás R$30,28->R$36,70). O
valor de Energia (R$367,36) NÃO foi confirmado/corrigido ainda — o único PDF Energisa visto até
agora era da fatura da CASA DA MÃE (erro real cometido nesta sessão: quase gravado como se fosse do
Wallace, revertido a tempo — ver docs/decisions/). A fatura do próprio Wallace deste ciclo ainda não
foi emitida.

NÃO EXISTE API PÚBLICA de nenhuma das 2 concessionárias (confirmado por pesquisa). A fonte real é
sempre e-mail com PDF anexado:
  - Medintech/BZS: sistemas@bzs.com.br, assunto "A tarifa referente ao mês de [mês] chegou -
    Conta: [753/1024]", 1 e-mail por conta por mês, ~dia 19-22.
  - Energisa: domínio @energisa.com.br (remetente exato do envio AUTOMÁTICO mensal ainda não
    confirmado 19/08/2026 — o serviço foi ativado nesta mesma sessão, "a partir da próxima fatura";
    o único PDF real visto até agora veio de uma 2ª via manual, sistemas_siatt@energisa.com.br, e
    era da conta da mãe). Por isso a busca de Energisa é por DOMÍNIO inteiro + exige anexo, não um
    remetente único — mais frouxa na busca, compensada pela validação por UC (ver
    _texto_confirma_wallace abaixo) antes de aceitar qualquer valor.

MÉTODO DE EXTRAÇÃO — linha digitável do boleto, não o layout visual do PDF: o campo de valor NÃO é
lido por regex solto em cima do texto extraído (frágil a mudança de layout) — é decodificado da
LINHA DIGITÁVEL do boleto, formato padrão Febraban (47 dígitos, 5º campo = 14 dígitos = 4 dígitos de
fator de vencimento + 10 dígitos de valor em centavos). Esse formato é regulado, estável, e
independente de qualquer mudança visual que o emissor faça na fatura. Confirmado contra 3 PDFs reais
distintos (Água/Gás Medintech, julho/2026; e a fatura Energisa da mãe, agosto/2026, que provou o
método de extração de VALOR funciona pra Energisa também — mesmo PDF que revelou o problema de
IDENTIFICAÇÃO de conta, ver abaixo).

IDENTIFICAÇÃO DE QUAL CONTA É QUAL — 2 métodos, um por fonte:
  - Medintech: conta (753/1024) vem do ASSUNTO do e-mail, nunca do PDF — mais confiável e não exige
    abrir o PDF pra saber qual é qual.
  - Energisa: como o remetente é buscado por domínio inteiro, e várias contas da família (mãe,
    irmã, Wallace) chegam no mesmo e-mail, a identificação exige achar o **Número da UC** do Wallace
    (1.994.775.053-05, informado por ele — ainda não confirmado contra PDF real, sua fatura deste
    ciclo não foi emitida) DENTRO do texto do PDF antes de aceitar qualquer valor. NÃO usa CPF/nome
    do campo PAGADOR (tentativa anterior, revertida na mesma sessão): confirmado que o Wallace
    aparece como PAGADOR/titular também na conta da própria mãe — CPF do PAGADOR não distingue "é a
    conta dele" de "é uma conta que ele paga". UC é o identificador certo (1 UC = 1 imóvel/ligação
    físico, nunca compartilhado entre pessoas).

Autenticação: OAuth 2.0 com refresh_token de longa duração (obtido 1x, manualmente, fora deste
script — ver docs/decisions/ da integração). Variáveis de ambiente necessárias:
  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
  SUPABASE_URL, SUPABASE_KEY (service_role)

Idempotente: se o valor buscado for igual ao já cadastrado, não escreve nada (evita `atualizado_em`
mudando à toa). Nunca inventa valor — se não achar e-mail do mês corrente pra alguma das contas,
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
    "753": "TXB000004",   # Água (Medintech)
    "1024": "TXB000005",  # Gás (Medintech)
}
_TX_ENERGIA = "TXB000009"  # Energia (Energisa)
# CORRIGIDO 19/08/2026 (2ª rodada — erro real cometido e revertido na mesma sessão): a 1ª versão
# deste script validava pelo CPF do Wallace ancorado no rótulo "PAGADOR". Isso pareceu certo na
# hora (testado contra um PDF real, deu match), mas o PDF usado no teste era a fatura da CASA DA
# MÃE — o Wallace aparece como PAGADOR/titular dela também (arranjo familiar), então validar por
# CPF/nome do PAGADOR NÃO distingue "é a conta do Wallace" de "é uma conta que o Wallace paga".
# Isso causou uma escrita real errada no Supabase (TXB000009 = R$56,11, valor da fatura da mãe,
# quando o valor de referência antigo — R$367,36 — nem era o valor real do Wallace, só não tinha
# sido substituído por outro errado ainda) — revertido na mesma sessão assim que percebido.
# A identificação correta é pelo **Número da UC** (unidade consumidora) — campo sempre presente e
# claramente rotulado em toda fatura Energisa (confirmado pelo usuário com print real: "Número da
# UC" aparece como card próprio, não precisa ancorar em nenhum outro rótulo). Cada UC é 1 imóvel/
# ligação físico — não pode ser compartilhado entre Wallace/mãe/irmã como o CPF pode.
# UC do Wallace, informada por ele diretamente 19/08/2026 ("essa vai ser usada no nosso sistema") —
# Nível C (usuário forneceu), AINDA NÃO confirmada Nível A contra um PDF real (a fatura dele deste
# ciclo ainda não foi emitida). Não confundir com 573.702.053-77 (UC da casa da mãe, essa sim já
# vista e confirmada errada num PDF real) nem com 2.064.202.053-60 (UC da irmã, nunca vista).
_UC_WALLACE = "1.994.775.053-05"

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
        if 1.00 <= valor <= 5000.00:  # faixa plausível pra essas 3 contas — descarta falso-positivo
            return round(valor, 2)
    return None


def _baixar_texto_pdf(dados_pdf_base64: bytes) -> str:
    import io
    import pdfplumber
    with pdfplumber.open(io.BytesIO(dados_pdf_base64)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def _texto_confirma_wallace(texto_pdf: str) -> bool:
    """Confirma que o PDF é da conta do próprio Wallace, não da mãe ou da irmã (ambas também têm
    fatura Energisa chegando no mesmo e-mail, confirmado pelo usuário 19/08/2026) — busca o
    **Número da UC** do Wallace no texto do PDF.
    NÃO usa CPF/nome do PAGADOR (tentativa anterior, revertida na mesma sessão): confirmado por
    print real do usuário que o Wallace aparece como PAGADOR/titular também na conta da casa da
    mãe — CPF do PAGADOR não distingue "é a conta dele" de "é uma conta que ele paga". UC é o
    identificador certo: 1 UC = 1 imóvel/ligação físico, nunca compartilhado entre pessoas."""
    def _so_digitos(s: str) -> str:
        return re.sub(r"\D", "", s)
    return _UC_WALLACE in texto_pdf or _so_digitos(_UC_WALLACE) in _so_digitos(texto_pdf)


def _anexo_pdf_do_email(msg: dict) -> str | None:
    for parte in msg["payload"].get("parts", []) or []:
        if (parte.get("filename") or "").lower().endswith(".pdf"):
            return parte["body"].get("attachmentId")
    return None


def _buscar_medintech(access_token: str, resultado: dict) -> None:
    """Água (753/TXB000004) e Gás (1024/TXB000005) — conta vem do ASSUNTO do e-mail."""
    busca = _gmail_get("/messages?q=" + "from:sistemas@bzs.com.br newer_than:10d".replace(" ", "%20"), access_token)
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        conta = _extrair_conta_do_assunto(assunto)
        if conta is None or conta not in _CONTA_PARA_TX:
            continue
        tx = _CONTA_PARA_TX[conta]
        anexo_id = _anexo_pdf_do_email(msg)
        if anexo_id is None:
            print(f"AVISO: e-mail '{assunto}' (conta {conta}) sem PDF anexado — pulando.", file=sys.stderr)
            continue
        anexo = _gmail_get(f"/messages/{item['id']}/attachments/{anexo_id}", access_token)
        texto = _baixar_texto_pdf(base64.urlsafe_b64decode(anexo["data"]))
        valor = _extrair_valor_da_linha_digitavel(texto)
        if valor is None:
            print(f"AVISO: não consegui extrair valor do PDF de '{assunto}' (conta {conta}) — pulando, nada é inventado.", file=sys.stderr)
            continue
        if tx not in resultado:  # Gmail retorna mais recente primeiro — não sobrescreve com e-mail mais antigo
            resultado[tx] = valor
            print(f"Conta {conta} ({tx}): R$ {valor:.2f} — extraído de '{assunto}'")


def _buscar_energisa(access_token: str, resultado: dict) -> None:
    """Energia (TXB000009) — remetente exato do envio automático ainda não confirmado (ver
    cabeçalho do módulo), então busca por DOMÍNIO inteiro + exige anexo; a identidade é validada
    DENTRO do PDF pela UC do Wallace (_texto_confirma_wallace), nunca pelo remetente sozinho."""
    if _TX_ENERGIA in resultado:
        return
    busca = _gmail_get("/messages?q=" + "from:@energisa.com.br has:attachment newer_than:10d".replace(" ", "%20"), access_token)
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        anexo_id = _anexo_pdf_do_email(msg)
        if anexo_id is None:
            continue
        anexo = _gmail_get(f"/messages/{item['id']}/attachments/{anexo_id}", access_token)
        texto = _baixar_texto_pdf(base64.urlsafe_b64decode(anexo["data"]))
        if not _texto_confirma_wallace(texto):
            print(f"AVISO: PDF de '{assunto}' (Energisa) não confirma a UC do Wallace — pulando (provável fatura de outro familiar).", file=sys.stderr)
            continue
        valor = _extrair_valor_da_linha_digitavel(texto)
        if valor is None:
            print(f"AVISO: não consegui extrair valor do PDF de '{assunto}' (Energisa) — pulando, nada é inventado.", file=sys.stderr)
            continue
        resultado[_TX_ENERGIA] = valor
        print(f"Energia ({_TX_ENERGIA}): R$ {valor:.2f} — extraído de '{assunto}'")
        return  # 1 fatura por mês só — para no primeiro achado válido


def buscar_faturas_do_mes(access_token: str) -> dict:
    """Retorna {tx: valor} pras faturas (Medintech + Energisa) encontradas nos últimos 10 dias."""
    resultado: dict = {}
    _buscar_medintech(access_token, resultado)
    _buscar_energisa(access_token, resultado)
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
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=in.(TXB000004,TXB000005,{_TX_ENERGIA})&select=tx,valor"
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
        print("Buscando faturas de consumo (Água/Gás Medintech + Energia Energisa) dos últimos 10 dias...")
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
