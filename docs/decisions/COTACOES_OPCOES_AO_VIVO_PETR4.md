# Cotação ao vivo de opções (PETR4) — implementado, cobertura parcial documentada

**Status: IMPLEMENTADO em 17/08/2026.** Pedido do usuário: *"procure uma fonte gratuita, tente implementar"*, depois de eu apontar que o "valor de mercado" das puts vendidas (card ROC) nunca foi automatizado — sempre dependeu do usuário colar uma nota de corretagem nova em `vars-roc.js` manualmente.

## 1. O que mudou

`o.cotacaoAtual`/`o.valorMercado` de séries de **PETR4** com posição ativa (hoje só `PETRT379`) passam a vir de uma cotação real, buscada 2x/dia (mesmo cron do resto das automações) na brapi.dev, endpoint público de opções (`/api/v2/options/chain`).

`ITUB4` (`ITUBT424`) **continua manual** — não é falta de esforço, é limite real da fonte gratuita (seção 2).

## 2. Por que só PETR4

Pesquisado em 17/08/2026: o endpoint de opções da brapi.dev só é gratuito (sem token, sandbox) para o ativo-objeto **PETR4**. Qualquer outro ativo (incluindo ITUB4) devolve `MISSING_TOKEN` sem o plano **Pro** (**R$139,99/mês**, pesquisado na mesma data) — desproporcional para acompanhar 1 posição de ~R$100 de valor de mercado. Testado ao vivo (`curl`) antes de decidir: PETR4 funciona sem token, ITUB4 não.

Se o usuário abrir novas posições em ativos além de PETR4/ITUB4 no futuro, a mesma limitação provavelmente se aplica — vale testar o ticker específico antes de assumir que vai funcionar de graça.

## 3. Como funciona

- **Fonte**: `https://brapi.dev/api/v2/options/chain?underlying=PETR4&expirationDate=<venc>` — devolve a chain inteira do vencimento; o script filtra a série pelo `symbol`. Preço = `close` (último negócio); se vier `0`/ausente (dia sem negociação), cai pro meio de `bid`/`ask`; se nada disso existir, não atualiza (nunca inventa `0`).
- **Robô**: `scripts/sync/atualizar_cotacoes_opcoes.py` — lista `SERIES_MONITORADAS` (hoje só `PETRT379`) precisa ser **atualizada manualmente** quando o usuário abrir/fechar uma posição de PETR4 (mesmo espírito de `vars-roc.js`: dado externo, mantido por humano/agente).
- **Armazenamento**: tabela nova `cotacoes_opcoes` (Supabase) + RPC `atualizar_cotacoes_opcoes` (mesmo padrão de segurança de `atualizar_cotacoes_acoes`: só `service_role` grava, leitura pública via `anon`).
- **Orquestração**: `.github/workflows/atualizar_cotacoes_opcoes.yml`, chamado pelo orquestrador `executar_tudo.yml` (agora 7 etapas, era 6) logo depois de "Cotações de Ações". Nenhum secret novo — reaproveita `SUPABASE_URL`/`SUPABASE_KEY` já existentes; nem precisa de `BRAPI_TOKEN` (série de PETR4 é sandbox gratuito).
- **Cliente**: `WallaceFinanceService.getCotacoesOpcoes()` (app.js) + `aplicarCotacoesOpcoesV2()` (hydrate-roc.js) — sobrepõe o preço ao vivo em cima de `VARS.opcoesVendidasDetalhe` (nunca reescreve `vars-roc.js`), recalcula `valorMercado = quantidade × cotacaoAtual` e a soma consolidada (`aplicarStatusVencidoEValorMercadoOpcoes()`), redesenha a tabela. Linha com preço ao vivo ganha um ícone 🔄 com tooltip de horário — nunca fica ambíguo se é automático ou manual.
- **Observabilidade**: job `cotacoes_opcoes` adicionado ao painel Saúde Operacional (mesmo limiar/exceção de fim de semana de `cotacoes_acoes` — bolsa fechada sábado/domingo).

## 4. Custo

**Zero.** Sandbox gratuito, sem token, sem cadastro, reaproveitando infraestrutura (GitHub Actions, secrets, cron) já paga/configurada para as outras automações.

## 5. Revisitar quando

- Usuário abrir posição nova em PETR4 → adicionar em `SERIES_MONITORADAS` (`atualizar_cotacoes_opcoes.py`).
- Usuário decidir que vale pagar o plano Pro da brapi (R$139,99/mês) → dá pra estender `SERIES_MONITORADAS` pra ITUB4 e qualquer outro ativo, só trocando o token usado na chamada (mesmo padrão já usado em `atualizar_cotacoes_acoes.py` pros tickers pagos).
