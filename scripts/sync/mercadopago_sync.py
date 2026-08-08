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

DESTINO NO SUPABASE (ATUALIZADO 08/08/2026 — migracao V1 wallace_dados -> V2 relacional):
  Este script continua chamando a mesma RPC 'atualizar_mercadopago_eventos' com o mesmo payload
  ({"eventos": [...]})- nenhuma mudanca de interface aqui. O que mudou foi DENTRO da RPC: ela deixou
  de gravar um array dentro de wallace_dados.MERCADOPAGO_EVENTOS (V1) e passou a fazer INSERT/UPSERT
  na tabela propria `mercadopago_eventos` (V2), preservando `status_triagem` por linha em conflito de
  `id` (mesmo comportamento de merge de antes, so que agora e UPSERT relacional em vez de jsonb_set).
  app.js le a tabela nova via WallaceFinanceService.getMercadoPagoEventosV2() (Supabase direto), nao
  mais VARS.MERCADOPAGO_EVENTOS. Ver docs/changelog/PASSAGEM_DE_TURNO.md (08/08/2026) para o registro
  completo desta migracao.

CORRIGIDO 04/08/2026 (parte 39) — bug real achado no 1o teste em produção: o 1o sync trouxe os
500 pagamentos mais recentes (05/01/2026 a 02/08/2026, TODO o histórico da conta, sem filtro de
data) e a RPC antiga SOBRESCREVIA o array inteiro a cada run — ou seja, além de inundar a Inbox com
7 meses de histórico já reconciliado manualmente, qualquer decisão de triagem (aprovar/rejeitar) seria
perdida no próximo sync, porque o array era substituído do zero.
Correção em 2 pontas (script + RPC, RPC já corrigida direto no Supabase nesta sessão):
  1. Este script agora lê o checkpoint MERCADOPAGO_ATUALIZADO_EM (já existente) antes de buscar, e passa
     begin_date pra API (com 1 dia de margem de segurança pra não perder evento na borda do timestamp).
  2. A RPC agora faz MERGE por id (preserva 'status_triagem' de eventos já existentes, marca novos como
     'pendente') em vez de sobrescrever o array — a margem de 1 dia do item 1 não duplica nada porque o
     merge é idempotente por id.

NAO TESTADO CONTRA A API REAL NESTA SESSAO (sem rede/credenciais aqui) — so
`python3 -m py_compile`. Os nomes de endpoint/campos abaixo seguem a doc publica da API de Pagamentos
do Mercado Pago (`/v1/payments/search`) na melhor informacao disponivel no momento em que este script
foi escrito; ANTES do proximo deploy, confirme contra a doc oficial atualizada: (a) os nomes exatos dos
parametros de filtro de data (`range`/`begin_date`/`end_date`, formato ISO com timezone), e (b) os
campos de PIX enviado/recebido e saldo de conta — mesma regra ja aplicada aqui pras tarifas ANEEL
(Politica secao 26): nunca assumir doc de terceiro como definitiva sem validar na hora.

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
import datetime
import urllib.request
import urllib.error

MP_API_BASE = "https://api.mercadopago.com"
PAGE_LIMIT = 50  # tamanho de pagina da API de pagamentos (ajustar conforme doc oficial se mudar)
MARGEM_SEGURANCA_HORAS = 24  # reprocessa 1 dia antes do ultimo checkpoint; merge por id absorve a sobreposicao


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

    def buscar_pagamentos(self, offset=0, begin_date=None, end_date=None):
        """GET /v1/payments/search, paginado por offset/limit, com filtro opcional de data de criacao.
        NOMES DE PARAMETRO A CONFIRMAR contra a doc oficial atual antes do proximo deploy real
        (range/begin_date/end_date e o padrao documentado publicamente, mas nunca testado aqui)."""
        params = {"offset": offset, "limit": PAGE_LIMIT, "sort": "date_created", "criteria": "desc"}
        if begin_date and end_date:
            params["range"] = "date_created"
            params["begin_date"] = begin_date
            params["end_date"] = end_date
        return self._get("/v1/payments/search", params)

    def buscar_saldo_conta(self):
        """Saldo/consumo da conta MP — endpoint a confirmar (ex: /v1/account/settings ou equivalente atual da doc oficial)."""
        return self._get("/v1/account/settings")


def normalizar_evento(pagamento_bruto):
    """Etapa 2 do brief V450: payload bruto da API -> FinancialEvent (unico formato guardado).
    Estrutura fixa pedida no brief: {id, origem, tipo, descricao, valor, data, status, metadata}.
    Nunca guarda o payload bruto inteiro — so os campos abaixo (metadata fica enxuto, so o essencial
    pra rastreio/dedupe, nao o JSON completo da API).
    'status_triagem' NAO e definido aqui de proposito — quem decide isso e a RPC no merge (preserva
    o que ja existe, default 'pendente' pro que e novo)."""
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

    def obter_checkpoint(self):
        """CORRIGIDO 08/08/2026: le o maior atualizado_em direto da tabela mercadopago_eventos (V2) em vez
        de VARS.MERCADOPAGO_ATUALIZADO_EM em wallace_dados (V1, aposentado nesta migracao - ver
        docs/decisions/ e o novo destino da RPC atualizar_mercadopago_eventos, que agora grava na tabela
        propria em vez de wallace_dados). Retorna None se a tabela ainda esta vazia (1o run)."""
        url = f"{self.supabase_url}/rest/v1/mercadopago_eventos?select=atualizado_em&order=atualizado_em.desc&limit=1"
        req = urllib.request.Request(url, headers={
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                linhas = json.loads(resp.read().decode("utf-8"))
            if not linhas:
                return None
            return linhas[0].get("atualizado_em")
        except Exception as e:
            print(f"mercadopago_sync: nao consegui ler checkpoint (seguindo sem filtro de data): {e}", file=sys.stderr)
            return None

    def calcular_janela_busca(self):
        """1o run (sem checkpoint): sem begin_date/end_date -> busca tudo (comportamento antigo, so
        acontece 1 vez). Runs seguintes: begin_date = checkpoint - MARGEM_SEGURANCA_HORAS, end_date = agora.
        A margem existe pra nao perder pagamento processado perto do instante exato do ultimo run; o
        merge por id na RPC absorve a sobreposicao sem duplicar."""
        checkpoint = self.obter_checkpoint()
        if not checkpoint:
            return None, None
        try:
            ultimo = datetime.datetime.fromisoformat(checkpoint.replace("Z", "+00:00"))
        except ValueError:
            return None, None
        inicio = ultimo - datetime.timedelta(hours=MARGEM_SEGURANCA_HORAS)
        fim = datetime.datetime.now(datetime.timezone.utc)
        fmt = "%Y-%m-%dT%H:%M:%S.000-00:00"
        return inicio.strftime(fmt), fim.strftime(fmt)

    def coletar_eventos(self, max_paginas=10):
        begin_date, end_date = self.calcular_janela_busca()
        if begin_date:
            print(f"mercadopago_sync: buscando pagamentos desde {begin_date} (checkpoint - {MARGEM_SEGURANCA_HORAS}h de margem).")
        else:
            print("mercadopago_sync: sem checkpoint anterior — 1o sync, buscando historico completo (unica vez).")
        eventos = []
        offset = 0
        for _ in range(max_paginas):
            pagina = self.gateway.buscar_pagamentos(offset=offset, begin_date=begin_date, end_date=end_date)
            resultados = pagina.get("results", [])
            if not resultados:
                break
            eventos.extend(normalizar_evento(p) for p in resultados)
            offset += PAGE_LIMIT
            if offset >= pagina.get("paging", {}).get("total", 0):
                break
        return eventos

    def gravar_supabase(self, eventos):
        """RPC 'atualizar_mercadopago_eventos' (corrigida 04/08/2026 parte 39: agora faz MERGE por id,
        preservando 'status_triagem' de eventos ja existentes em vez de sobrescrever o array inteiro)."""
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
            print(f"mercadopago_sync: gravado no Supabase (merge por id), HTTP {status}.")
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
