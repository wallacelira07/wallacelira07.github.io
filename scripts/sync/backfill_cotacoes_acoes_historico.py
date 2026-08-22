#!/usr/bin/env python3
"""
Backfill de histórico de cotações (brapi.dev) -> Supabase (Sistema Wallace Lira)
=================================================================================
NOVO 22/08/2026 (pedido do usuário): script PONTUAL, não recorrente — roda 1 vez
(ou toda vez que o usuário disparar manualmente), diferente de
atualizar_cotacoes_acoes.py (esse sim roda todo dia via cron, grava só o
fechamento do próprio dia).

Achado real: ITSA4/BBDC4/BBAS3/WEGE3/ABEV3/B3SA3 só tinham 1 dia de histórico em
cotacoes_acoes_historico (o robô diário só começou a rastreá-los recentemente) —
o gráfico de tendência da aba Opções ficava sem dado suficiente pra mostrar
qualquer coisa. PETR4/ITUB4/VALE3/MGLU3 são liberados de graça pela brapi.dev,
sem token, e por isso já tinham sido backfillados via SQL direto na mesma sessão
em que este script foi criado; os 6 tickers que exigem BRAPI_TOKEN (secret do
GitHub Actions, não disponível localmente) dependem deste script/workflow.

Usa o endpoint de histórico da brapi.dev (?range=3mo&interval=1d,
historicalDataPrice) — dado real de mercado, nunca inventado/estimado. Grava via
a RPC nova backfill_cotacoes_acoes_historico (service_role only, idempotente:
ON CONFLICT (ticker,data) DO UPDATE, seguro rodar de novo sem duplicar).

Variáveis de ambiente necessárias:
  SUPABASE_URL  - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY  - mesma chave (service_role) já usada por atualizar_cotacoes_acoes.py
  BRAPI_TOKEN   - obrigatório aqui (os 6 tickers deste script sempre exigem token)
"""
import json
import os
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Só os 6 tickers que exigem BRAPI_TOKEN e que ainda não tinham histórico real
# suficiente na sessão em que este script foi criado (22/08/2026). PETR4/ITUB4/
# VALE3/MGLU3 não entram aqui de propósito — já têm ~90 dias reais, reexecutar
# não muda nada (idempotente), mas não há necessidade.
TICKERS = ["ITSA4", "BBDC4", "BBAS3", "WEGE3", "ABEV3", "B3SA3"]

BRAPI_URL_BASE = "https://brapi.dev/api/quote/"
RANGE = "3mo"
INTERVAL = "1d"

# Pausa entre requisições pra não estourar rate limit do plano gratuito/pago da brapi.
PAUSA_ENTRE_REQUISICOES_SEGUNDOS = 1.0


def buscar_historico_ticker(ticker: str, token: str) -> list[dict]:
    """Busca o histórico de fechamentos de 1 ticker (range=3mo, ~64 pregões)."""
    headers = {"Accept": "application/json", "Authorization": f"Bearer {token}"}
    url = f"{BRAPI_URL_BASE}{ticker}?range={RANGE}&interval={INTERVAL}"
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=30) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        print(f"AVISO: HTTP {e.code} ao buscar histórico de {ticker}: {corpo}", file=sys.stderr)
        return []
    except URLError as e:
        print(f"AVISO: falha de rede ao buscar histórico de {ticker}: {e}", file=sys.stderr)
        return []

    results = dados.get("results", [])
    if not results:
        print(f"AVISO: resposta da brapi sem resultado pra {ticker}: {dados}", file=sys.stderr)
        return []

    pontos_brutos = results[0].get("historicalDataPrice", [])
    pontos = []
    for p in pontos_brutos:
        timestamp = p.get("date")
        fechamento = p.get("close")
        if timestamp is None or fechamento is None:
            continue
        data_iso = time.strftime("%Y-%m-%d", time.gmtime(timestamp))
        pontos.append({"data": data_iso, "preco": fechamento})
    return pontos


def buscar_todos(token: str) -> dict:
    resultado = {}
    for i, ticker in enumerate(TICKERS):
        pontos = buscar_historico_ticker(ticker, token)
        if pontos:
            resultado[ticker] = pontos
            print(f"{ticker}: {len(pontos)} dia(s) de histórico real ({pontos[0]['data']} -> {pontos[-1]['data']})")
        else:
            print(f"{ticker}: nenhum ponto retornado, pulado.", file=sys.stderr)
        if i < len(TICKERS) - 1:
            time.sleep(PAUSA_ENTRE_REQUISICOES_SEGUNDOS)

    if not resultado:
        raise RuntimeError("Nenhum ticker retornou histórico válido.")
    return resultado


def gravar_supabase(supabase_url: str, supabase_key: str, dados: dict) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    rpc_url = f"{supabase_url}/rest/v1/rpc/backfill_cotacoes_acoes_historico"
    body = json.dumps({"dados": dados}).encode("utf-8")
    req = Request(rpc_url, data=body, headers=headers, method="POST")
    with urlopen(req, timeout=60) as resp:
        resultado = resp.read().decode("utf-8")
    print(f"Supabase atualizado: {resultado}")


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    brapi_token = os.environ.get("BRAPI_TOKEN")

    if not supabase_url or not supabase_key:
        print("ERRO: SUPABASE_URL e/ou SUPABASE_KEY não definidos.", file=sys.stderr)
        return 1
    if not brapi_token:
        print("ERRO: BRAPI_TOKEN não definido — obrigatório pros 6 tickers deste backfill.", file=sys.stderr)
        return 1

    try:
        print(f"Buscando histórico real na brapi.dev ({len(TICKERS)} tickers, range={RANGE})...")
        dados = buscar_todos(brapi_token)
        print("Gravando no Supabase (idempotente, seguro rodar de novo)...")
        gravar_supabase(supabase_url, supabase_key, dados)
        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
