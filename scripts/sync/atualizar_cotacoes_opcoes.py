#!/usr/bin/env python3
"""
Automação de cotações de OPÇÕES (brapi.dev) -> Supabase (Sistema Wallace Lira)
=================================================================================
Busca o preço de mercado atual (campo "close" da última negociação) de séries de
opções específicas na brapi.dev, endpoint /api/v2/options/chain.

IMPORTANTE (pesquisado em 17/08/2026, pedido do usuário: "procure uma fonte
gratuita, tente implementar" pro card ROC/opções, que até aqui só atualizava o
"valor de mercado" manualmente via nota de corretagem): o endpoint de opções da
brapi só é gratuito (sem token) para o ativo-objeto PETR4, em modo sandbox — os
demais ativos (incluindo ITUB4, que também tem posição aberta no sistema) exigem
o plano Pro (R$139,99/mês, pesquisado na mesma data) - desproporcional só pra
acompanhar 1 posição pequena. Por isso este script cobre SÓ séries de PETR4;
ITUB4 continua manual (VARS.opcoesVendidasDetalhe em vars-roc.js, como sempre foi).

SÉRIES_MONITORADAS abaixo é a lista de opções ATIVAS de PETR4 hoje - precisa ser
atualizada manualmente quando o usuário abrir/fechar uma posição (mesmo espírito
de VARS.opcoesVendidasDetalhe em vars-roc.js: dado externo, não deriva de nada
interno, precisa ser mantido por humano/agente de tempos em tempos).

Grava o resultado no Supabase (função atualizar_cotacoes_opcoes, tabela
cotacoes_opcoes) - o site sobrepõe esse preço ao literal estático de vars-roc.js
quando disponível (ver hydrate-roc.js), sem nunca reescrever o arquivo JS.

Variáveis de ambiente necessárias (mesmas já usadas por atualizar_cotacoes_acoes.py
- nenhum secret novo, nenhum token novo, sem custo):
  SUPABASE_URL
  SUPABASE_KEY
"""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Séries ATIVAS de PETR4 hoje (17/08/2026) - ver vars-roc.js VARS.opcoesVendidasDetalhe
# pro detalhe completo de cada posição (prêmio, custo, quantidade). Atualizar esta
# lista quando uma posição de PETR4 for aberta/fechada; ITUB4 (ITUBT424) fica de fora
# de propósito, sem fonte gratuita disponível.
SERIES_MONITORADAS = [
    {"symbol": "PETRT379", "underlying": "PETR4", "expirationDate": "2026-08-21"},
]

BRAPI_CHAIN_URL = "https://brapi.dev/api/v2/options/chain"


def buscar_preco_serie(underlying: str, expiration_date: str, symbol: str) -> float | None:
    """Busca a chain inteira do vencimento (única forma do endpoint) e filtra a série."""
    url = f"{BRAPI_CHAIN_URL}?underlying={underlying}&expirationDate={expiration_date}"
    req = Request(url, headers={"Accept": "application/json"}, method="GET")
    try:
        with urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        print(f"AVISO: HTTP {e.code} ao buscar chain {underlying}/{expiration_date}: {corpo}", file=sys.stderr)
        return None
    except URLError as e:
        print(f"AVISO: falha de rede ao buscar chain {underlying}/{expiration_date}: {e}", file=sys.stderr)
        return None

    series = dados.get("series", [])
    alvo = next((s for s in series if s.get("symbol") == symbol), None)
    if alvo is None:
        print(f"AVISO: série {symbol} não encontrada na chain de {underlying}/{expiration_date} (venceu? ticker mudou?)", file=sys.stderr)
        return None

    preco = alvo.get("close")
    if preco is None or preco <= 0:
        # "close" pode vir 0/None em dia sem negociação - bid/ask são o fallback mais
        # honesto (preço que realmente compraria/venderia agora), nunca inventar 0.
        bid, ask = alvo.get("bid") or 0, alvo.get("ask") or 0
        if bid > 0 and ask > 0:
            preco = round((bid + ask) / 2, 4)
        elif ask > 0:
            preco = ask
        else:
            print(f"AVISO: {symbol} sem close/bid/ask válidos hoje - não atualiza (mantém o valor anterior).", file=sys.stderr)
            return None
    return preco


def buscar_cotacoes() -> dict:
    resultado = {}
    for serie in SERIES_MONITORADAS:
        preco = buscar_preco_serie(serie["underlying"], serie["expirationDate"], serie["symbol"])
        if preco is not None:
            resultado[serie["symbol"]] = {"preco": preco}

    if not resultado:
        raise RuntimeError("Nenhuma série de opção retornou cotação válida.")
    return resultado


def atualizar_supabase(supabase_url: str, supabase_key: str, cotacoes: dict) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    rpc_url = f"{supabase_url}/rest/v1/rpc/atualizar_cotacoes_opcoes"
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
        print(f"Buscando cotações de opções na brapi.dev ({len(SERIES_MONITORADAS)} série(s), grátis/sem token, só PETR4)...")
        cotacoes = buscar_cotacoes()
        for symbol, info in cotacoes.items():
            print(f"{symbol}: R${info['preco']}")

        print("Atualizando Supabase...")
        atualizar_supabase(supabase_url, supabase_key, cotacoes)
        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("cotacoes_opcoes", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
