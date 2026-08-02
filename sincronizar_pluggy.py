#!/usr/bin/env python3
"""
Integração Pluggy (Meu Pluggy, uso pessoal) -> Sistema Wallace Lira
======================================================================
Puxa saldos de contas bancárias e investimentos das contas que você já
conectou em meu.pluggy.ai, via API oficial da Pluggy.

IMPORTANTE - modelo de uso:
  Isto usa o fluxo "Meu Pluggy" (gratuito, pessoal, só suas proprias contas
  nominais) - NAO o plano comercial pago. A conexao com cada banco ja foi
  feita por voce direto em meu.pluggy.ai + autorizada uma vez no Dashboard
  (fluxo OAuth do "Conector 200"). Este script so LE os dados das conexoes
  que ja existem - ele NUNCA cria conexao nova nem move dinheiro (somente
  leitura, GET em todos os endpoints).

Fluxo de autenticacao:
  1. POST /auth com clientId+clientSecret -> apiKey (validade 2 horas)
  2. GET /items (com header X-API-KEY) -> lista as conexoes ja existentes
  3. Para cada item: GET /accounts?itemId=X -> saldos
  4. Para cada item: GET /investments?itemId=X -> investimentos (se houver)

USO:
  python3 sincronizar_pluggy.py

Variaveis de ambiente necessarias:
  PLUGGY_CLIENT_ID      - da aba "Applications" no dashboard.pluggy.ai
  PLUGGY_CLIENT_SECRET  - idem
  SUPABASE_URL          - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY          - chave do Supabase (mesma dos outros scripts)
"""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PLUGGY_BASE = "https://api.pluggy.ai"


def _request(url: str, method: str = "GET", headers: dict | None = None, body: dict | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = Request(url, data=data, headers=req_headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} em {method} {url}: {corpo}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede em {url}: {e}") from e


def autenticar(client_id: str, client_secret: str) -> str:
    """POST /auth -> devolve a API Key (v'alida 2h)."""
    resp = _request(
        f"{PLUGGY_BASE}/auth",
        method="POST",
        body={"clientId": client_id, "clientSecret": client_secret},
    )
    api_key = resp.get("apiKey")
    if not api_key:
        raise RuntimeError(f"Resposta de /auth sem apiKey: {resp}")
    return api_key


def listar_items(api_key: str) -> list[dict]:
    """GET /items -> todas as conexoes (bancos) ja existentes na conta Pluggy."""
    resp = _request(f"{PLUGGY_BASE}/items", headers={"X-API-KEY": api_key})
    return resp.get("results", [])


def listar_contas(api_key: str, item_id: str) -> list[dict]:
    """GET /accounts?itemId=X -> contas (corrente, poupanca, cartao) de uma conexao."""
    resp = _request(f"{PLUGGY_BASE}/accounts?itemId={item_id}", headers={"X-API-KEY": api_key})
    return resp.get("results", [])


def listar_investimentos(api_key: str, item_id: str) -> list[dict]:
    """GET /investments?itemId=X -> investimentos de uma conexao, se houver."""
    resp = _request(f"{PLUGGY_BASE}/investments?itemId={item_id}", headers={"X-API-KEY": api_key})
    return resp.get("results", [])


def sincronizar(client_id: str, client_secret: str) -> dict:
    api_key = autenticar(client_id, client_secret)
    items = listar_items(api_key)

    resultado = {"conexoes": [], "erros": []}

    for item in items:
        item_id = item["id"]
        nome_banco = item.get("connector", {}).get("name", "desconhecido")
        status = item.get("status")  # UPDATED, LOGIN_ERROR, OUTDATED, etc.

        entrada = {
            "item_id": item_id,
            "banco": nome_banco,
            "status": status,
            "atualizado_em": item.get("lastUpdatedAt") or item.get("updatedAt"),
            "contas": [],
            "investimentos": [],
        }

        try:
            contas = listar_contas(api_key, item_id)
            for c in contas:
                entrada["contas"].append({
                    "tipo": c.get("type"),           # BANK / CREDIT
                    "subtipo": c.get("subtype"),      # CHECKING_ACCOUNT / SAVINGS_ACCOUNT / CREDIT_CARD
                    "nome": c.get("name"),
                    "numero": c.get("number"),
                    "saldo": c.get("balance"),
                    "moeda": c.get("currencyCode"),
                })
        except RuntimeError as e:
            resultado["erros"].append(f"{nome_banco} (contas): {e}")

        try:
            investimentos = listar_investimentos(api_key, item_id)
            for inv in investimentos:
                entrada["investimentos"].append({
                    "tipo": inv.get("type"),
                    "nome": inv.get("name"),
                    "valor": inv.get("balance") or inv.get("value"),
                    "instituicao": inv.get("institution", {}).get("name") if inv.get("institution") else None,
                })
        except RuntimeError as e:
            # Nem todo banco tem produto de investimento - erro aqui costuma ser normal, nao critico
            pass

        resultado["conexoes"].append(entrada)

    resultado["total_conexoes"] = len(items)
    resultado["saldo_total_contas"] = round(sum(
        c["saldo"] for conexao in resultado["conexoes"] for c in conexao["contas"]
        if c.get("saldo") is not None and c.get("tipo") == "BANK"
    ), 2)

    return resultado


def atualizar_supabase(supabase_url: str, supabase_key: str, resultado: dict) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    patch_url = f"{supabase_url}/rest/v1/wallace_dados?id=eq.1"
    # Grava o resultado inteiro (contas + investimentos + saldo total) num campo unico
    # PLUGGY_CONTAS - mesmo padrao das outras automacoes (ACOES_COTACOES, SOLAR_LEITURAS).
    # PATCH simples aqui SUBSTITUI o campo (nao faz merge profundo) - ok porque e um snapshot
    # completo a cada sincronizacao, nao um historico incremental.
    body = json.dumps({"dados": {"PLUGGY_CONTAS": resultado, "PLUGGY_ATUALIZADO_EM": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}}).encode("utf-8")
    # PATCH simples do PostgREST NAO faz merge profundo de JSON - precisa ser via RPC
    # pra nao apagar o resto de "dados". Ver nota em atualizar_geracao_saj.py sobre isso.
    # Por ora, usa jsonb_set via RPC generico (se existir) ou avisa que precisa de uma
    # funcao dedicada, igual foi feito pra geracao solar.
    rpc_url = f"{supabase_url}/rest/v1/rpc/atualizar_pluggy_contas"
    rpc_body = json.dumps({"contas": resultado}).encode("utf-8")
    req = Request(rpc_url, data=rpc_body, headers=headers, method="POST")
    with urlopen(req, timeout=20) as resp:
        resposta = resp.read().decode("utf-8")
    print(f"Supabase atualizado via RPC: {resposta}")


def main() -> int:
    client_id = os.environ.get("PLUGGY_CLIENT_ID")
    client_secret = os.environ.get("PLUGGY_CLIENT_SECRET")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")

    if not client_id or not client_secret:
        print("ERRO: PLUGGY_CLIENT_ID e/ou PLUGGY_CLIENT_SECRET não definidos.", file=sys.stderr)
        return 1

    try:
        print("Autenticando na Pluggy...")
        resultado = sincronizar(client_id, client_secret)
        print(f"Conexões encontradas: {resultado['total_conexoes']}")
        for c in resultado["conexoes"]:
            print(f"  {c['banco']} ({c['status']}): {len(c['contas'])} conta(s), {len(c['investimentos'])} investimento(s)")
        if resultado["erros"]:
            print("Avisos/erros parciais:", file=sys.stderr)
            for erro in resultado["erros"]:
                print(f"  - {erro}", file=sys.stderr)
        print(f"\nSaldo total em contas bancárias: R$ {resultado['saldo_total_contas']:.2f}")
        print("\n--- JSON completo (pra conferência manual) ---")
        print(json.dumps(resultado, ensure_ascii=False, indent=2))

        if supabase_url and supabase_key:
            print("\nAtualizando Supabase...")
            atualizar_supabase(supabase_url, supabase_key, resultado)
        else:
            print("\nAVISO: SUPABASE_URL/SUPABASE_KEY não definidos - só imprimindo, não salvando.", file=sys.stderr)

        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

