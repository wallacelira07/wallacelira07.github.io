# Exceções formais ao desligamento da V1

**Data:** 08/08/2026 — decisão explícita do usuário, consolidando exceções já levantadas em sessões anteriores.
**Status:** Permanente até decisão futura explícita. **Não são mais tratadas como "trabalho pendente"** — não entram na métrica de consumidores de `wallace_dados` a resolver, não devem ser reabertas por iniciativa de agente.

## As 5 exceções

1. **Headline totals Mastercard Black/Visa** (`cartaoMBTotal`, `cartaoInfiniteTotal`, `mercadoPagoFatura`) — regra de negócio "fatura sempre vence", detalhado em `EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md`. **Atualização 11/08/2026**: gap de R$2.678,41 na composição do Mastercard Black investigado e explicado — janela de fatura real do banco ≠ janela do ciclo interno do app (`ciclo_inicio_em`), não é lançamento faltante. Absorvido em `mbDetalhe.naoReconciliado` (mesmo padrão do Visa). Detalhe completo em `PLANO_UNIFICACAO_V1_V2.md` seção 51. Encerrado, não reabrir sem pedido novo.
2. **Solar 301×361 kWh** — fórmula de rateio (`saldoLiquido = exportado−importado` vs só exportado) sem prova externa (documento original ou fatura real). Ver `PLANO_UNIFICACAO_V1_V2.md` seção 38.
3. **Caixa Lance** — divergência de R$4,37 não confirmada, causa raiz não fechada.
4. **4 caixas de causa indeterminada** — Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário Júlio — divergência R$107-346 sem causa raiz confirmada.
5. **TX000203-208** — colisão de `tx_legado` entre eventos distintos, decisão de rastreabilidade pendente, já classificadas.

## Regra de aplicação

Nenhum agente deve reabrir investigação, alterar fórmula, ou tentar "resolver" essas 5 frentes sem pedido explícito e novo do usuário. Elas ficam de fora da métrica "consumidores de `wallace_dados` restantes" — contam como decisão de negócio registrada, não como dívida técnica.

## Mastercard Black/Visa — domínio fechado até onde é tecnicamente possível

Registrado em 08/08/2026: titularidade (`CARTAO_MAPA`/`cartoes`), LRW/LRV (`mbLRWConfirmado`/`mbLRVConfirmado`) e estrutura geral de cartões estão **resolvidos e V2-exclusivos**. O que resta do domínio (Assinaturas, Recorrências, Corporativo, Consórcios) está bloqueado por **completude de dado** (`cartao_id`/`categoria_id` não preenchidos em `transacoes`), não por arquitetura — não é engenharia pendente, é decisão de classificação retroativa que cabe ao usuário. Domínio não entra mais em rodadas de "engenharia pesada"; qualquer avanço futuro depende de decisão sobre como preencher os dados faltantes.
