#!/usr/bin/env python3
"""
Automação de cotações (brapi.dev) -> Supabase (Sistema Wallace Lira)
=====================================================================
Busca a cotação atual de um conjunto de ações na brapi.dev. PETR4, ITUB4,
VALE3 e MGLU3 são liberadas de graça sem token; os demais tickers exigem
autenticação (Bearer token), por isso o script manda o header Authorization
sempre que BRAPI_TOKEN estiver disponível.

IMPORTANTE (descoberto em 01/08/2026): o plano gratuito da brapi permite
apenas 1 ativo por requisição (erro QUOTES_PER_REQUEST_EXCEEDED se mandar
vários tickers de uma vez, mesmo com token). Por isso o script faz UMA
requisição por ticker, em vez de uma única chamada em lote.

Grava o resultado no Supabase (função atualizar_cotacoes_acoes) - o site já
lê isso automaticamente, sem precisar de deploy novo.

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

# Tickers monitorados: os 4 originais (liberados sem token) + os novos
# pedidos pelo usuário (exigem token).
TICKERS = [
    "PETR4", "ITUB4", "VALE3", "MGLU3",
    "ITSA4", "BBDC4", "BBAS3", "WEGE3", "ABEV3", "B3SA3",
]

BRAPI_URL_BASE = "https://brapi.dev/api/quote/"

# Pausa entre requisições pra não estourar rate limit do plano gratuito
# (requisições/minuto, separado do limite de tickers/requisição já corrigido).
PAUSA_ENTRE_REQUISICOES_SEGUNDOS = 1.0


def buscar_cotacao_unica(ticker: str, token: str | None) -> dict | None:
    """Busca 1 ticker por vez (plano gratuito só permite 1 ativo/requisição)."""
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    url = BRAPI_URL_BASE + ticker
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        print(f"AVISO: HTTP {e.code} ao buscar {ticker}: {corpo}", file=sys.stderr)
        return None
    except URLError as e:
        print(f"AVISO: falha de rede ao buscar {ticker}: {e}", file=sys.stderr)
        return None

    results = dados.get("results", [])
    if not results:
        print(f"AVISO: resposta da brapi sem resultado pra {ticker}: {dados}", file=sys.stderr)
        return None

    item = results[0]
    return {
        "preco": item.get("regularMarketPrice"),
        "variacao": item.get("regularMarketChangePercent"),
    }


def buscar_cotacoes(token: str | None) -> dict:
    resultado = {}
    for i, ticker in enumerate(TICKERS):
        info = buscar_cotacao_unica(ticker, token)
        if info is not None:
            resultado[ticker] = info
        # Pausa entre chamadas, exceto depois da última
        if i < len(TICKERS) - 1:
            time.sleep(PAUSA_ENTRE_REQUISICOES_SEGUNDOS)

    if not resultado:
        raise RuntimeError("Nenhum ticker retornou cotação válida.")

    faltando = [t for t in TICKERS if t not in resultado]
    if faltando:
        print(f"AVISO: tickers não retornados pela brapi: {', '.join(faltando)}", file=sys.stderr)

    return resultado


def atualizar_supabase(supabase_url: str, supabase_key: str, cotacoes: dict) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    rpc_url = f"{supabase_url}/rest/v1/rpc/atualizar_cotacoes_acoes"
    body = json.dumps({"cotacoes": cotacoes}).encode("utf-8")
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
        print(f"Buscando cotações na brapi.dev ({len(TICKERS)} tickers, 1 por requisição)...")
        cotacoes = buscar_cotacoes(brapi_token)
        for ticker, info in cotacoes.items():
            print(f"{ticker}: R${info['preco']} ({info['variacao']}%)")

        print("Atualizando Supabase...")
        atualizar_supabase(supabase_url, supabase_key, cotacoes)
        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
