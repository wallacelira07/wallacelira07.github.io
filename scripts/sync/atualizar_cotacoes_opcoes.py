#!/usr/bin/env python3
"""
Automação de cotações de OPÇÕES (brapi.dev + opcoes.net.br) -> Supabase (Sistema Wallace Lira)
=================================================================================================
Busca o preço de mercado atual (último negócio) de séries de opções específicas e grava no
Supabase — o site sobrepõe esse preço ao literal estático de vars-roc.js quando disponível
(ver hydrate-roc.js), sem nunca reescrever o arquivo JS.

DUAS FONTES, nessa ordem de tentativa por série:
1. brapi.dev, endpoint /api/v2/options/chain — só devolve sem token pro ativo-objeto PETR4
   (sandbox gratuito, pesquisado e testado ao vivo em 17/08/2026). Qualquer outro ativo
   (ITUB4 incluso) devolve MISSING_TOKEN sem o plano Pro (R$139,99/mês).
2. AMPLIADO 17/08/2026 (pedido do usuário: "não pode ser só PETR4" — pesquisei alternativas
   gratuitas reais antes de implementar, ver docs/decisions/COTACOES_OPCOES_AO_VIVO_PETR4.md):
   opcoes.net.br publica uma tabela de cotação pública (`https://opcoes.net.br/<symbol>`, HTML
   simples, sem login/token) com os últimos 5 pregões de QUALQUER opção da B3 — usado como
   fallback quando a brapi não cobre o ativo-objeto. É EOD (fechamento do último pregão, não
   tempo real) — suficiente pro uso deste sistema (referência de valor de mercado atualizada
   periodicamente, não day-trading). Mais frágil que uma API oficial (scraping de HTML, quebra
   se o layout do site mudar) — por isso só é usado como fallback, nunca substitui a brapi
   quando ela já funciona de graça (PETR4).

SÉRIES_MONITORADAS abaixo precisa ser atualizada manualmente quando o usuário abrir/fechar uma
posição (mesmo espírito de VARS.opcoesVendidasDetalhe em vars-roc.js: dado externo, mantido por
humano/agente de tempos em tempos).

Variáveis de ambiente necessárias (mesmas já usadas por atualizar_cotacoes_acoes.py - nenhum
secret novo, nenhum token novo, sem custo):
  SUPABASE_URL
  SUPABASE_KEY
"""
import json
import os
import re
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Todas as posições ATIVAS hoje (17/08/2026) - ver vars-roc.js VARS.opcoesVendidasDetalhe pro
# detalhe completo de cada uma (prêmio, custo, quantidade). Atualizar esta lista quando uma
# posição for aberta/fechada. PETRT379 usa a brapi (grátis, sem fallback necessário); ITUBT424
# usa o fallback opcoes.net.br (brapi exige token pra ITUB4).
SERIES_MONITORADAS = [
    {"symbol": "PETRT379", "underlying": "PETR4", "expirationDate": "2026-08-21"},
    {"symbol": "ITUBT424", "underlying": "ITUB4", "expirationDate": "2026-08-21"},
]

BRAPI_CHAIN_URL = "https://brapi.dev/api/v2/options/chain"
OPCOES_NET_URL = "https://opcoes.net.br/{symbol}"


def buscar_preco_brapi(underlying: str, expiration_date: str, symbol: str) -> float | None:
    """Busca a chain inteira do vencimento (única forma do endpoint) e filtra a série. Só funciona
    sem token pra underlying=PETR4 (sandbox gratuito da brapi.dev)."""
    url = f"{BRAPI_CHAIN_URL}?underlying={underlying}&expirationDate={expiration_date}"
    req = Request(url, headers={"Accept": "application/json"}, method="GET")
    try:
        with urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        print(f"AVISO: HTTP {e.code} na brapi pra {underlying}/{expiration_date}: {corpo}", file=sys.stderr)
        return None
    except URLError as e:
        print(f"AVISO: falha de rede na brapi pra {underlying}/{expiration_date}: {e}", file=sys.stderr)
        return None

    if dados.get("error"):
        # Caso esperado pra qualquer underlying != PETR4 (MISSING_TOKEN) - não é uma falha real,
        # só significa "essa série precisa do fallback opcoes.net.br".
        return None

    series = dados.get("series", [])
    alvo = next((s for s in series if s.get("symbol") == symbol), None)
    if alvo is None:
        print(f"AVISO: série {symbol} não encontrada na chain brapi de {underlying}/{expiration_date} (venceu? ticker mudou?)", file=sys.stderr)
        return None

    preco = alvo.get("close")
    if preco is None or preco <= 0:
        # "close" pode vir 0/None em dia sem negociação - bid/ask são o fallback mais honesto
        # (preço que realmente compraria/venderia agora), nunca inventar 0.
        bid, ask = alvo.get("bid") or 0, alvo.get("ask") or 0
        if bid > 0 and ask > 0:
            preco = round((bid + ask) / 2, 4)
        elif ask > 0:
            preco = ask
        else:
            return None
    return preco


def buscar_preco_opcoes_net(symbol: str) -> float | None:
    """Fallback pra séries que a brapi não cobre de graça (qualquer ativo-objeto != PETR4). Faz
    scraping de uma tabela HTML pública (sem login/token) com os últimos 5 pregões da opção -
    extrai a coluna "Ult" (preço do último negócio) da linha mais recente. Existem 2 tabelas na
    página: a primeira (class="table table-bordered table-condensed top-buffer-20") tem o
    histórico de cotação real da própria opção - é essa que interessa. A segunda (id="miniGrid")
    é só navegação entre strikes/vencimentos, nunca usar essa. Mais frágil que uma API oficial
    (quebra se o site mudar o layout do HTML) - por isso só é chamado quando a brapi já falhou."""
    url = OPCOES_NET_URL.format(symbol=symbol)
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; WallaceLiraBot/1.0)"}, method="GET")
    try:
        with urlopen(req, timeout=20) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError) as e:
        print(f"AVISO: falha ao buscar {url} (fallback opcoes.net.br): {e}", file=sys.stderr)
        return None

    tabela = re.search(
        r'<table class="table table-bordered table-condensed top-buffer-20">.*?<tbody>(.*?)</tbody>',
        html, re.S,
    )
    if not tabela:
        print(f"AVISO: tabela de cotação não encontrada em {url} — layout do site pode ter mudado.", file=sys.stderr)
        return None
    primeira_linha = re.search(r"<tr>(.*?)</tr>", tabela.group(1), re.S)
    if not primeira_linha:
        return None
    celulas = re.findall(r"<td[^>]*>(.*?)</td>", primeira_linha.group(1), re.S)
    # Colunas: [0]=data, [1]=Min, [2]=Pri(meira), [3]=Med(ia), [4]=Ult(imo), [5]=Max
    if len(celulas) < 5:
        return None
    ult_str = celulas[4].strip().replace(".", "").replace(",", ".")
    try:
        preco = float(ult_str)
    except ValueError:
        return None
    return preco if preco > 0 else None


def buscar_preco_serie(underlying: str, expiration_date: str, symbol: str) -> float | None:
    preco = buscar_preco_brapi(underlying, expiration_date, symbol)
    if preco is not None:
        return preco
    print(f"AVISO: brapi sem cobertura gratuita pra {underlying} ({symbol}) — tentando fallback opcoes.net.br...", file=sys.stderr)
    preco = buscar_preco_opcoes_net(symbol)
    if preco is None:
        print(f"AVISO: {symbol} sem cotação válida em nenhuma fonte hoje — não atualiza (mantém o valor anterior).", file=sys.stderr)
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
        print(f"Buscando cotações de opções ({len(SERIES_MONITORADAS)} série(s): brapi.dev p/ PETR4, opcoes.net.br p/ demais)...")
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
