#!/usr/bin/env python3
"""
mercadopago_sync.py — Wallace ERP V450 (Mercado Pago Financial Gateway)

Etapas 1+2+4 da ordem obrigatoria do brief V450:
  1. MercadoPagoGateway  -> classe MercadoPagoGateway (auth, paginacao, normalizacao)
  2. FinancialEvent      -> funcao normalizar_evento()
  4. Sync Service        -> classe MercadoPagoSyncService (orquestra fetch + grava no Supabase)

O QUE ESTE SCRIPT NUNCA FAZ (proibicao explicita do brief V450):
  - Nunca escreve em LRW_TRANSACOES / LRV_TRANSACOES / LRC_* / PV_TRANSACOES / PGV_TRANSACOES.
  - Nunca lanca TX. So grava eventos normalizados numa tabela propria (ver abaixo).
  - Nunca guarda o payload bruto da API — so o FinancialEvent normalizado.

DESTINO NO SUPABASE — decisao de nomenclatura (documentada, nao e a literal do brief):
  O brief pede uma colecao generica "financial_events". Este projeto ja usa o padrao
  "<INTEGRACAO>_CONTAS"/"<INTEGRACAO>_EVENTOS" pro que a Pluggy grava (VARS.PLUGGY_CONTAS) — pra manter
  consistencia com o app.js existente (reconciliarPluggy le VARS.PLUGGY_CONTAS, nao "financial_events"),
  este script grava em uma unica linha/coluna VARS chamada MERCADOPAGO_EVENTOS (RPC
  'atualizar_mercadopago_eventos', a criar no Supabase — mesmo padrao das 3 RPCs ja existentes citadas
  na Passagem de Turno: atualizar_geracao_solar / atualizar_cotacoes_acoes / atualizar_pluggy_contas).
  app.js consome VARS.MERCADOPAGO_EVENTOS do mesmo jeito que ja consome VARS.PLUGGY_CONTAS.

NAO TESTADO CONTRA A API REAL NESTA SESSAO (sem rede/credenciais aqui) — so
`python3 -m py_compile`. Os nomes de endpoint/campos abaixo seguem a doc publica da API de Pagamentos
do Mercado Pago (`/v1/payments/search`) na melhor informacao disponivel no momento em que este script
foi escrito; ANTES do primeiro deploy real, confirme os campos exatos (esp. PIX enviado/recebido,
saldo de conta, extrato) contra a doc oficial atualizada — mesma regra ja aplicada aqui pras tarifas
ANEEL (Politica secao 26): nunca assumir doc de terceiro como definitiva sem validar na hora.

Credenciais (env vars, NUNCA hardcoded — GitHub Secrets no workflow):
  MERCADO_PAGO_ACCESS_TOKEN
  MERCADO_PAGO_CLIENT_ID       (opcional, so se for renovar token via OAuth2)
  MERCADO_PAGO_CLIENT_SECRET   (opcional, idem)
  SUPABASE_URL
  SUPABASE_KEY                 (service_role — mesmo secret que os outros 3 workflows ja usam)
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

MP_API_BASE = "https://api.mercadopago.com"
PAGE_LIMIT = 50  # tamanho de pagina da API de pagamentos (ajustar conforme doc oficial se mudar)


class MercadoPagoGateway:
    """Etapa 1 do brief V450: conexao/auth/paginacao/rate-limit/normalizacao bruta -> dict Python."""

    def __init__(self, access_token):
        if not access_token:
            raise RuntimeError("MERCADO_PAGO_ACCESS_TOKEN ausente (defina como GitHub Secret).")
        self.access_token = access_token

    def _get(self, path, params=None, tentativa=1):
        query = ""
        if params:
            query = "?" + "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
        url = f"{MP_API_BASE}{path}{query}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.access_token}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # Rate limit (429) - backoff simples, mesma filosofia de resiliencia do script Pluggy.
            if e.code == 429 and tentativa <= 3:
                time.sleep(2 * tentativa)
                return self._get(path, params, tentativa + 1)
            corpo = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"MercadoPagoGateway: HTTP {e.code} em {path} — {corpo[:300]}") from e

    def buscar_pagamentos(self, offset=0):
        """GET /v1/payments/search, paginado por offset/limit (confirmar contra doc oficial antes do 1o deploy)."""
        return self._get("/v1/payments/search", {"offset": offset, "limit": PAGE_LIMIT, "sort": "date_created", "criteria": "desc"})

    def buscar_saldo_conta(self):
        """Saldo/consumo da conta MP — endpoint a confirmar (ex: /v1/account/settings ou equivalente atual da doc oficial)."""
        return self._get("/v1/account/settings")


def normalizar_evento(pagamento_bruto):
    """Etapa 2 do brief V450: payload bruto da API -> FinancialEvent (unico formato guardado).
    Estrutura fixa pedida no brief: {id, origem, tipo, descricao, valor, data, status, metadata}.
    Nunca guarda o payload bruto inteiro — so os campos abaixo (metadata fica enxuto, so o essencial
    pra rastreio/dedupe, nao o JSON completo da API)."""
    return {
        "id": f"MP{pagamento_bruto.get('id')}",
        "origem": "Mercado Pago",
        "tipo": pagamento_bruto.get("payment_type_id") or pagamento_bruto.get("operation_type") or "desconhecido",
        "descricao": pagamento_bruto.get("description") or pagamento_bruto.get("statement_descriptor") or "",
        "valor": pagamento_bruto.get("transaction_amount"),
        "data": (pagamento_bruto.get("date_approved") or pagamento_bruto.get("date_created") or "")[:10],
        "status": pagamento_bruto.get("status"),
        "metadata": {
            "payment_method": pagamento_bruto.get("payment_method_id"),
            "payer": (pagamento_bruto.get("payer") or {}).get("email"),
        },
    }


class MercadoPagoSyncService:
    """Etapa 4 do brief V450: orquestra Gateway -> normalizacao -> grava no Supabase (RPC), sem tocar
    em LR*/PV/PGV em nenhum momento."""

    def __init__(self, gateway, supabase_url, supabase_key):
        self.gateway = gateway
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key

    def coletar_eventos(self, max_paginas=10):
        eventos = []
        offset = 0
        for _ in range(max_paginas):
            pagina = self.gateway.buscar_pagamentos(offset=offset)
            resultados = pagina.get("results", [])
            if not resultados:
                break
            eventos.extend(normalizar_evento(p) for p in resultados)
            offset += PAGE_LIMIT
            if offset >= pagina.get("paging", {}).get("total", 0):
                break
        return eventos

    def gravar_supabase(self, eventos):
        """RPC 'atualizar_mercadopago_eventos' — a criar no Supabase, mesmo padrao (REVOKE de anon/
        authenticated depois de configurar, igual foi feito pras 3 RPCs existentes) das outras 3
        funcoes de escrita ja em producao."""
        url = f"{self.supabase_url}/rest/v1/rpc/atualizar_mercadopago_eventos"
        body = json.dumps({"eventos": eventos}).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status

    def rodar(self):
        eventos = self.coletar_eventos()
        print(f"mercadopago_sync: {len(eventos)} evento(s) normalizado(s).")
        if eventos:
            status = self.gravar_supabase(eventos)
            print(f"mercadopago_sync: gravado no Supabase, HTTP {status}.")
        else:
            print("mercadopago_sync: nenhum evento novo, nada gravado.")


def main():
    access_token = os.environ.get("MERCADO_PAGO_ACCESS_TOKEN")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    faltando = [n for n, v in [("MERCADO_PAGO_ACCESS_TOKEN", access_token),
                                ("SUPABASE_URL", supabase_url),
                                ("SUPABASE_KEY", supabase_key)] if not v]
    if faltando:
        print(f"mercadopago_sync: variavel(is) de ambiente ausente(s): {', '.join(faltando)}. Abortando.", file=sys.stderr)
        sys.exit(1)

    gateway = MercadoPagoGateway(access_token)
    servico = MercadoPagoSyncService(gateway, supabase_url, supabase_key)
    servico.rodar()


if __name__ == "__main__":
    main()
