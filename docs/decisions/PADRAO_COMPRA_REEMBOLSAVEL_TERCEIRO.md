# Padrão: compra reembolsável de terceiro (18/08/2026)

## Contexto

A mãe do usuário pediu duas compras parceladas no Mercado Livre (Freezer + Sound Bar, Churrasqueira elétrica). O usuário comprou no próprio cartão (Visa Mercado Pago, final 8739, até então não cadastrado no sistema), esperando reembolso dela depois — não é dinheiro dela, é adiantamento dele.

## Decisão

Não criar caixa nova (`Caixa Mãe`/`Caixa Terceiros`) nem tabela nova (`despesas_terceiros`). Reaproveitar a infraestrutura já existente:

1. **Cartão**: cadastrado em `cartoes` com `usuario_id` = usuário (comprador real), não do terceiro.
2. **Categoria nova**: `Reembolsável - Terceiros` (`categorias.id = e928229a-b984-4232-89d9-aadf6b17fe19`) — irmã de `Reembolsável Corporativo` (Wärtsilä), nunca a mesma, para não misturar auditoria.
3. **Caixa existente**: `Caixa Mercado Pago` (a que já paga a fatura desse cartão) — nenhuma caixa nova.
4. **`afeta_saldo_real = false`** nas transações — mesma regra já permanente de qualquer compra com `cartao_id` preenchido (seção 1.3.5/19 do manual).
5. **`parcelas`**: 1 linha por transação (`origem_array = 'PARCELAMENTOS_TERCEIROS'`), não 1 linha por parcela — mesmo padrão das demais.
6. **Reembolso**: não antecipado. Só lançar `entrada` quando o dinheiro voltar de fato.

## Por que não caixa nova nem tabela nova

- Caixa nova exigiria decidir exclusão de Patrimônio Líquido/Meta do Milhão/Necessidade Total — investigação confirmou que esses totais **não** somam genericamente `caixas` (são VARS explícitas, ver `src/financeiro/patrimonio/recalcular-patrimonio.js`), então uma caixa nova ficaria de fora por padrão mesmo — mas o usuário decidiu não criar mesmo assim (queria que a compra debitasse dele, não ficasse "isolada").
- Tabela `despesas_terceiros` reimplementaria do zero o que `transacoes`/`parcelas`/`cartoes`/categoria já resolvem (Livro Razão, auditoria, busca global) — nenhum ganho real.

## Registros criados (18/08/2026)

| Item | Valor |
|---|---|
| `cartoes` | Visa MP (compra p/ Mãe, reembolsável), final 8739, `usuario_id`=Wallace |
| `categorias` | `Reembolsável - Terceiros` |
| `transacoes` TX000343 | Churrasqueira elétrica + Sound Bar, R$120,75, 12x |
| `transacoes` TX000344 | Freezer, R$235,07, 12x |
| `parcelas` | TXP000026, TXP000027 |

Confirmado via `vw_saldo_v2_por_caixa`: saldo calculado da `Caixa Mercado Pago` não mudou com o lançamento (`afeta_saldo_real=false` funcionando).

## Replicável

Qualquer compra futura no mesmo espírito (adiantar por terceiro, esperando reembolso) segue este mesmo padrão — ver seção 1.6 do `docs/MANUAL_OPERACIONAL_AGENTES.md` e seção 23 do `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (Google Drive).
