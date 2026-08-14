# Generalização do conceito "Comprometido × Disponível Real" pras caixas temáticas

**Data:** 14/08/2026
**Status:** Implementado
**Origem:** pergunta de arquitetura trazida pelo Claude Chat pro Claude Code, depois de um achado real (compra de R$104,30 no cartão MB virtual lançada na Caixa Bens Duráveis, `afeta_saldo_real=false`, sem nenhuma redução visível no saldo do card).

## Contexto

O conceito **Tem na Caixa × Comprometido × Disponível Real** (Política Interna §13, regra permanente seção 6.1 do `MANUAL_OPERACIONAL_AGENTES.md`) só existia implementado pra Caixa Variável (`hydrate-comprometido-caixa-variavel-v2.js`, `WallaceFinanceService.getComprometidoCaixaVariavelV2()`). Qualquer outra caixa que recebesse uma compra de cartão com `afeta_saldo_real=false` (compromisso de fatura futura, ver seção 1.3.1 do manual) continuava mostrando o saldo cheio, sem refletir visualmente que parte dele já está comprometida.

O Claude Chat perguntou 3 coisas:
1. Existe "Comprometido" calculado pra outra caixa? — **Não**, só Variável.
2. É intencional ou lacuna? — Confirmado como **lacuna de visualização, não de dado** (o campo `afeta_saldo_real` já distingue os dois conceitos pra qualquer caixa desde o design original da tabela `transacoes`; só a exibição nunca foi generalizada).
3. Qual o procedimento quando a fatura é paga de verdade? — **Ainda não decidido**, fica registrado como pendência em aberto (ver seção "Pendência" abaixo).

## Decisão do usuário (14/08/2026)

Generalizar o comportamento da Caixa Variável (servir de "pulmão" pro cartão de crédito) pras seguintes 6 caixas temáticas:

| Caixa | ID (Supabase `caixas`) |
|---|---|
| Caixa Churrasco | `f18e248e-182b-42ec-9d04-f1bf5cb0a749` |
| Caixa Bens Duráveis | `eeaf926e-07df-479c-b0bc-1071410a5298` |
| Caixa Manutenção | `df4c44af-3e30-4592-b0b5-5b863ca91591` |
| Caixa Eventos (Eventos e Viagens) | `ecaebc58-8f49-4d85-8ef4-6282ea765c2f` |
| Caixa Saúde Família | `d15e8cbe-4443-4ee4-9631-06d8d49058fe` |
| Emagrecimento | `d6be6a08-9d7b-4664-9c85-1e367aa620b9` |

## Implementação

- **`WallaceFinanceService.getComprometidoPorCaixaV2(caixaId)`** (`src/app/app.js`) — generalização da fórmula exata de `getComprometidoCaixaVariavelV2()` (soma de `transacoes` com essa `caixa_id` + `cartao_id` preenchido + `afeta_saldo_real=false` + `status=confirmado` + `tipo=saida`, filtrado por `ciclo_inicio_em` da própria caixa), parametrizada por `caixaId`. Não substitui a função original — mantida intacta, com sua própria chave de cache.
- **`src/financeiro/caixas/hydrate-comprometido-caixas-tematicas-v2.js`** (novo módulo) — busca saldo (`getSaldosPorCaixa()`) e comprometido das 6 caixas em paralelo, injeta um bloco `(−) Comprometido no cartão / (=) Disponível real` dentro do card existente de cada uma. Só mostra o bloco quando há valor comprometido `> 0` no ciclo (não polui o card em ciclos normais).
- **Localização do card**: 4 das 6 caixas têm card estático com id fixo (Bens Duráveis/Manutenção/Eventos/Saúde Família) — localizado via esse id. As outras 2 (Churrasco, Emagrecimento) são geradas em runtime por `preencherCaixasOperacionaisExtra()` — localizadas por texto do título dentro de `#caixasExtraGrid`, com retry (até ~3,2s) pra cobrir a corrida entre os dois módulos assíncronos.
- Chamada no boot: `onDomPronto(aplicarComprometidoCaixasTematicasV2)`, logo depois da chamada equivalente da Caixa Variável em `app.js`.

## Validado

Testado com dados simulados (DOM + `WallaceFinanceService` mockados) cobrindo os 6 casos: caixa estática com comprometido (Bens Duráveis, replicando o caso real de R$104,30), caixa estática sem comprometido (Manutenção/Eventos, bloco corretamente omitido), caixa estática com disponível negativo (Saúde Família), caixa dinâmica com comprometido (Churrasco) e caixa dinâmica sem comprometido (Emagrecimento) — todos os 6 resultados bateram com o esperado.

## Pendência em aberto (não resolvida nesta rodada)

**Procedimento pra quando a fatura do cartão vence e é paga de verdade** (dinheiro sai do banco), sem contar a saída duas vezes (uma como "Comprometido", outra como pagamento real). Não existe hoje nenhum mecanismo automático (trigger/RPC) nem procedimento manual documentado — precisa ser decidido e registrado antes da próxima virada de fatura. Caminhos possíveis, nenhum implementado ainda:
- (a) `UPDATE` na mesma linha de `transacoes`, virando `afeta_saldo_real=true` quando a fatura é paga; ou
- (b) uma segunda transação real (a saída do banco pagando a fatura), com a original marcada de forma que a reconciliação não some as duas.
