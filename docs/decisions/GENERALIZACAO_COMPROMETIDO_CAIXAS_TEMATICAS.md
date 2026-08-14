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

## Correção de dado histórico (mesma data, depois do achado do usuário)

O usuário generalizou o princípio além da exibição: **"as compras foram feitas no cartão... as caixas são apenas referências como uma coleção para viabilizar a compra"** — ou seja, em qualquer caixa, compra com `cartao_id` preenchido é sempre `afeta_saldo_real=false`, ponto final (ver seção 1.3.5 do `MANUAL_OPERACIONAL_AGENTES.md`, criada nesta mesma rodada). Auditoria encontrou 6 transações mal classificadas (`cartao_id` preenchido mas `afeta_saldo_real=true`) nas 3 caixas que já tinham compra real no cartão:

| Caixa | TX corrigidas (`afeta_saldo_real`→false) | Saldo antes |
|---|---|---|
| Caixa Bens Duráveis | TX000227, TX000226, TX000159-A, TX000159-B | R$583,99 |
| Caixa Churrasco | TX000228 | R$359,56 |
| Emagrecimento | TX000277 | R$278,89 |

**Achado seguinte, mesma sessão (achado do usuário: "o valor não pode dobrar")**: essa 1ª correção fez os 3 saldos praticamente dobrarem (Bens Duráveis→R$1.167,98, Churrasco→R$718,43, Emagrecimento→R$557,78) — sintoma de **dupla contagem**, não um saldo real maior. Causa raiz: cada uma das 3 caixas já tinha um lançamento de "calibração"/"saldo físico confirmado" criado numa rodada de reconciliação anterior (13/08), no mesmo valor de outro aporte já existente — criado numa época em que a compra de cartão ainda contava contra o saldo, então a calibração "recompunha" o saldo somando de novo o que a compra de cartão tinha subtraído. Depois que a compra parou de subtrair (correção acima), a calibração virou dinheiro duplicado.

Removidas (confirmado item a item com o usuário) as 3 transações de calibração redundantes:

| Caixa | TX removida | Motivo |
|---|---|---|
| Caixa Bens Duráveis | TX000316 "Saldo físico confirmado pelo usuário" (R$583,99) | Duplicava TX000298 "Aporte — repasse sobra reembolso Wärtsilä", mesmo valor, criada 8h depois |
| Caixa Churrasco | TX000309 "Saldo físico confirmado... destinado ao pagamento do cartão" (R$359,56) | Descrição confirma que era um patch manual só pra cobrir TX000228 (R$358,87) antes da correção existir |
| Emagrecimento | TX000300 "Aporte — repasse sobra reembolso Wärtsilä" (R$278,89) | Duplicava TX000318 "Aporte mensal retroativo", mesmo valor |

**Saldos finais corretos**: Bens Duráveis R$583,99 · Churrasco R$358,87 · Emagrecimento R$278,89 — nenhum dobrou, cada um reflete exatamente o dinheiro real disponível (aportes reais menos só as saídas que NÃO são compra de cartão).

TX000159-A/TX000159-B também receberam de volta o `cartao_id` (MB virtual) que haviam perdido quando TX000159 original foi dividida entre Caixa Variável e Bens Duráveis. Confirmado com o usuário item a item antes da correção; valores pós-correção validados contra `vw_saldo_v2_por_caixa`.

Manutenção/Eventos/Saúde Família não tinham nenhuma transação de cartão mal classificada nesta auditoria.

## Decisão do usuário (14/08/2026) — procedimento de pagamento de fatura

**Decidido**: quando a fatura do cartão vence e é paga de verdade (dinheiro sai do banco), fazer `UPDATE` na MESMA linha de `transacoes` que já registrou a compra — `afeta_saldo_real` muda de `false` para `true` no momento do pagamento. Não criar uma segunda transação (opção descartada: geraria risco de contar a saída 2x no Livro Razão sem cuidado extra de reconciliação).

Efeito prático: a compra continua existindo como UMA linha só, do início ao fim — nasce com `cartao_id` preenchido e `afeta_saldo_real=false` (não reduz o saldo da caixa, só aparece como "Comprometido"); no dia em que a fatura é paga, o mesmo registro vira `afeta_saldo_real=true`, e a partir daí passa a reduzir o "Tem na Caixa" normalmente, como qualquer saída real. O "Comprometido no cartão" (`getComprometidoPorCaixaV2`) já filtra por `afeta_saldo_real=false` — assim que a linha virar `true`, ela some automaticamente do comprometido e passa a contar como saída de caixa, sem precisar de nenhuma mudança de código.

Cuidado ao aplicar: usar a `data` do PAGAMENTO (não a data da compra original) só se isso não quebrar a leitura histórica do Livro Razão daquela caixa — na dúvida, manter a `data` original da compra e registrar a data do pagamento só em auditoria (`audit_log`, já é automático via trigger).
