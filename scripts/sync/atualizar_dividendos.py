#!/usr/bin/env python3
"""
Automação de dividendos (brapi.dev) -> Supabase (Sistema Wallace Lira)
=====================================================================
Busca o histórico de proventos (dividendos, JCP, rendimentos) de um conjunto
de ações na brapi.dev. PETR4, ITUB4, VALE3 e MGLU3 são liberadas de graça
sem token; os demais tickers exigem autenticação (Bearer token), por isso o
script manda o header Authorization sempre que BRAPI_TOKEN estiver
disponível - mesmo padrão de scripts/sync/atualizar_cotacoes_acoes.py.

IMPORTANTE (confirmado em 21/08/2026): o parâmetro correto pra pedir
proventos é "dividends=true", NÃO "modules=dividends" - esse último dá erro
MODULES_NOT_AVAILABLE no plano gratuito. "dividends=true" funciona de graça,
sem token extra além do já usado pro resto do endpoint.

A resposta vem em results[0].dividendsData.cashDividends[], uma lista de
eventos com paymentDate/rate/label/lastDatePrior/approvedOn. O script extrai
só a parte de data (YYYY-MM-DD) dos campos de data ISO com horário.

Grava o resultado no Supabase (função upsert_dividendos_acoes) - a RPC já é
idempotente via ON CONFLICT ... DO NOTHING, então o script sempre manda
todos os eventos retornados pela API a cada execução, sem se preocupar com
duplicata.

Variáveis de ambiente necessárias:
  SUPABASE_URL  - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY  - mesma chave pública já usada pelos outros scripts
  BRAPI_TOKEN   - token da conta brapi.dev (necessário pros tickers além de
                  PETR4/ITUB4/VALE3/MGLU3)
"""
import json
import os
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Mesma lista de tickers monitorados pelo script de cotações.
TICKERS = [
    "PETR4", "ITUB4", "VALE3", "MGLU3",
    "ITSA4", "BBDC4", "BBAS3", "WEGE3", "ABEV3", "B3SA3",
]

BRAPI_URL_BASE = "https://brapi.dev/api/quote/"

# Pausa entre requisições pra não estourar rate limit do plano gratuito
# (mesmo motivo do script de cotações).
PAUSA_ENTRE_REQUISICOES_SEGUNDOS = 1.0


def _somente_data(valor_iso: str | None) -> str:
    """Extrai só a parte YYYY-MM-DD de uma data ISO com horário (ou "" se vazio/null)."""
    if not valor_iso:
        return ""
    return valor_iso.split("T")[0]


def buscar_dividendos_unico(ticker: str, token: str | None) -> list[dict]:
    """Busca os proventos de 1 ticker por vez (mesmo padrão de 1 ativo/requisição
    usado pelo script de cotações, já que o plano gratuito limita assim)."""
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    url = f"{BRAPI_URL_BASE}{ticker}?dividends=true"
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        print(f"AVISO: HTTP {e.code} ao buscar dividendos de {ticker}: {corpo}", file=sys.stderr)
        return []
    except URLError as e:
        print(f"AVISO: falha de rede ao buscar dividendos de {ticker}: {e}", file=sys.stderr)
        return []

    results = dados.get("results", [])
    if not results:
        print(f"AVISO: resposta da brapi sem resultado pra {ticker}: {dados}", file=sys.stderr)
        return []

    item = results[0]
    dividends_data = item.get("dividendsData") or {}
    cash_dividends = dividends_data.get("cashDividends") or []

    eventos = []
    for evento in cash_dividends:
        eventos.append({
            "ticker": ticker,
            "tipo": evento.get("label"),
            "valor": evento.get("rate"),
            "data_pagamento": _somente_data(evento.get("paymentDate")),
            "data_com": _somente_data(evento.get("lastDatePrior")),
            "aprovado_em": _somente_data(evento.get("approvedOn")),
        })

    return eventos


def buscar_dividendos(token: str | None) -> list[dict]:
    todos_eventos: list[dict] = []
    tickers_sem_evento = []

    for i, ticker in enumerate(TICKERS):
        eventos = buscar_dividendos_unico(ticker, token)
        if eventos:
            todos_eventos.extend(eventos)
        else:
            tickers_sem_evento.append(ticker)
        # Pausa entre chamadas, exceto depois da última
        if i < len(TICKERS) - 1:
            time.sleep(PAUSA_ENTRE_REQUISICOES_SEGUNDOS)

    if not todos_eventos:
        raise RuntimeError("Nenhum ticker retornou dividendo válido.")

    if tickers_sem_evento:
        print(f"AVISO: tickers sem proventos retornados pela brapi: {', '.join(tickers_sem_evento)}", file=sys.stderr)

    return todos_eventos


def atualizar_supabase(supabase_url: str, supabase_key: str, dividendos: list[dict]) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    rpc_url = f"{supabase_url}/rest/v1/rpc/upsert_dividendos_acoes"
    body = json.dumps({"p_dividendos": dividendos}).encode("utf-8")
    req = Request(rpc_url, data=body, headers=headers, method="POST")
    with urlopen(req, timeout=20) as resp:
        resultado = resp.read().decode("utf-8")
    print(f"Supabase atualizado: {resultado}")


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    brapi_token = os.environ.get("BRAPI_TOKEN")  # opcional para os 4 tickers gratuitos

    if not supabase_url or not supabase_key:
        print("ERRO: SUPABASE_URL e/ou SUPABASE_KEY não definidos.", file=sys.stderr)
        return 1

    if not brapi_token:
        print("AVISO: BRAPI_TOKEN não definido - só PETR4/ITUB4/VALE3/MGLU3 devem funcionar.", file=sys.stderr)

    try:
        print(f"Buscando dividendos na brapi.dev ({len(TICKERS)} tickers, 1 por requisição)...")
        dividendos = buscar_dividendos(brapi_token)
        print(f"{len(dividendos)} eventos de provento encontrados.")

        print("Atualizando Supabase...")
        atualizar_supabase(supabase_url, supabase_key, dividendos)
        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("dividendos_acoes", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
