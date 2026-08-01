#!/usr/bin/env python3
"""
Automação de cotações (brapi.dev) -> Supabase (Sistema Wallace Lira)
=====================================================================
Busca a cotação atual de um conjunto de ações na brapi.dev. PETR4, ITUB4,
VALE3 e MGLU3 são liberadas de graça sem token; os demais tickers exigem
autenticação (Bearer token), por isso o script agora manda o header
Authorization sempre que BRAPI_TOKEN estiver disponível.

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
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Tickers monitorados: os 4 originais (liberados sem token) + os novos
# pedidos pelo usuário (exigem token). Ordem não importa pra brapi.
TICKERS = [
    "PETR4", "ITUB4", "VALE3", "MGLU3",
    "ITSA4", "BBDC4", "BBAS3", "WEGE3", "ABEV3", "B3SA3",
]

BRAPI_URL = "https://brapi.dev/api/quote/" + ",".join(TICKERS)


def buscar_cotacoes(token: str | None) -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = Request(BRAPI_URL, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} ao buscar cotações: {e.read().decode('utf-8', errors='replace')}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao buscar cotações: {e}") from e

    resultado = {}
    for item in dados.get("results", []):
        resultado[item["symbol"]] = {
            "preco": item.get("regularMarketPrice"),
            "variacao": item.get("regularMarketChangePercent"),
        }

    if not resultado:
        raise RuntimeError(f"Resposta da brapi sem resultados: {dados}")

    # Aviso (não erro) se algum ticker pedido não veio na resposta -
    # ajuda a identificar rate limit ou símbolo inválido sem quebrar o resto.
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
        print(f"Buscando cotações na brapi.dev ({len(TICKERS)} tickers)...")
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
