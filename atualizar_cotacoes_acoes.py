#!/usr/bin/env python3
"""
Automação de cotações (brapi.dev) -> Supabase (Sistema Wallace Lira)
=====================================================================

Busca a cotação atual de PETR4 e ITUB4 (as ações subjacentes das puts vendidas
- PETRT379, PETRS368W5, ITUBT424) na brapi.dev, API pública, gratuita, SEM
precisar de senha nem token pra esses dois papéis especificamente (a brapi
libera PETR4, VALE3, MGLU3 e ITUB4 de graça pra teste/uso básico).

Grava o resultado no Supabase (função atualizar_cotacoes_acoes) - o site já
lê isso automaticamente, sem precisar de deploy novo.

Variáveis de ambiente necessárias:
  SUPABASE_URL  - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY  - mesma chave pública já usada pelos outros scripts
"""

import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BRAPI_URL = "https://brapi.dev/api/quote/PETR4,ITUB4"


def buscar_cotacoes() -> dict:
    req = Request(BRAPI_URL, headers={"Accept": "application/json"}, method="GET")
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
    if not supabase_url or not supabase_key:
        print("ERRO: SUPABASE_URL e/ou SUPABASE_KEY não definidos.", file=sys.stderr)
        return 1
    try:
        print("Buscando cotações na brapi.dev...")
        cotacoes = buscar_cotacoes()
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
