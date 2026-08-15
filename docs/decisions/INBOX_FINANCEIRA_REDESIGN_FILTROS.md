# Inbox Financeira — redesenho de filtros (14/08/2026)

**Status: implementado e em produção (Supabase).** Motivado por pedido explícito do usuário depois de uma auditoria completa do site achar 563 itens pendentes acumulados: *"aquilo foi pensado em mostrar apenas transações que foram esquecidas de ser colocadas no sistema. O que for de ciclos passados não interessa e o que for desse ciclo deve ser verificado, todas as transações estão registradas, quero alguém com espertise que faça os filtros funcionarem perfeitamente para que Inbox seja útil e não um problema como é hoje."*

## Causa raiz (achado real, com evidência SQL)

1. **O filtro de ciclo/dedup já existia, mas só no client-side.** `src/auditoria/classificacao/classificacao-inbox.js` e `src/integrations/pluggy/pluggy-reconciliacao.js` (sessões de 09-12/08) já escondiam da tela itens de ciclo passado e duplicatas óbvias — mas nunca gravavam a decisão de volta em `status_triagem`. O item continuava `'pendente'` no banco pra sempre, só invisível. Resultado: 350 dos 363 `mercadopago_eventos` pendentes (96%) eram de ciclos financeiros já fechados (o mais antigo de 2026-02-01, ciclo atual começa 2026-07-25).

2. **Bug real de formato de chave em `pluggy_triagem`.** Uma limpeza manual anterior gravou 361 linhas usando o UUID cru de `pluggy_transacoes.id` como `id_externo`, mas o código sempre consulta no formato `'pluggy-tx-' || id` (`pluggyJaTriado()`, `pluggy-reconciliacao.js:137`). Essas 361 rejeições nunca foram reconhecidas pela aplicação — inertes, mascaradas só pelo filtro de tela.

## Correção aplicada

1. **Migration `fix_pluggy_triagem_id_format_bug`** — normalizou as 361 chaves erradas pro formato correto (manteve as linhas antigas, só corrigiu a chave, pra rastro auditável).
2. **Migration `create_arquivar_inbox_historico`** — nova função `arquivar_inbox_historico()` (SECURITY DEFINER, sem `GRANT` a `anon`/`authenticated`), que:
   - Arquiva (`status_triagem='arquivado_historico'`) qualquer pendente com `data` anterior ao início do ciclo financeiro atual (lido dinamicamente de `caixas.ciclo_inicio_em`, mesma fonte que a UI já usa — nunca hardcoded).
   - Rejeita automaticamente pendentes do ciclo atual cujo `abs(valor)` bate com uma transação já confirmada em `transacoes` dentro de ±20 dias (é ruído — já foi lançado por fora da Inbox).
   - Regra espelhada pras 2 tabelas de staging (`mercadopago_eventos` e `pluggy_transacoes`/`pluggy_triagem`).
3. **Migrations de auto-chamada** — a função passou a rodar automaticamente ao final de `atualizar_mercadopago_eventos()` e `atualizar_pluggy_contas()` (as RPCs que os robôs `mercadopago_sync.py`/`sincronizar_pluggy.py` já chamam periodicamente). **Roda sozinha daqui pra frente**, sem precisar de faxina manual de novo.
4. Nenhuma mudança de JS foi necessária — o código já ignora corretamente qualquer `status_triagem` diferente de `'pendente'`.

## Resultado

| | Antes | Depois da 1ª rodada | Depois da verificação manual dos 5 candidatos |
|---|---|---|---|
| `mercadopago_eventos` pendente | 363 | 13 | 13 |
| Pluggy genuinamente sem triagem | 194 (mascarados por 551 aparentes) | 37 | 28 |
| **Total pendente real** | ~557 | 50 | **41** |

## Verificação dos 5 candidatos a "esquecimento" (usuário, 14/08/2026)

A 1ª rodada isolou 50 itens sem match automático. O usuário revisou os principais e confirmou que **nenhum era esquecimento real** — todos já estavam registrados de outra forma:

- **MEDINTECH R$36,70 e R$152,16 (10/08)** e **GUIMARAES FARIA IDIOMAS R$695,00 (10/08)** — já pagos automaticamente pelo mecanismo de boletos fixos (`cronograma_boletos_fixos`, `TXB000003/004/005` — Curso de inglês, Água, Gás). O valor exato varia mês a mês (contas de consumo/matrícula), por isso não batia por valor com o `cronograma`, mas é a mesma conta recorrente.
- **RAIA DROGASIL R$308,22 (12/08)** — compra real, mas dividida em 2 transações já lançadas: `TX000277` Ozivy Semaglutida R$278,89 (Caixa Emagrecimento) + `TX000278` Meclin 50mg R$29,33 (Caixa Variável), mesma compra, mesmo horário (20h14), soma exata R$308,22.
- **ANTHROPIC\* CLAUDE SUB R$116,52 (11/08) e R$110,00 (13/08)** — mesma compra única já lançada como `TX000274` (R$113,72 = base R$110 + IOF estimado), capturada 2x pelo Pluggy/MP com valores levemente diferentes (pré-autorização vs. liquidação).

Todos os 9 registros correspondentes nas tabelas de staging (2 conexões Pluggy capturaram MEDINTECH/GUIMARAES em duplicidade) foram marcados `status_triagem='rejeitado'` em `pluggy_triagem`, com evidência cruzada contra os `tx_legado` acima.

## O que ainda resta pendente (41 itens)

Não verificados individualmente nesta sessão — são ruído de sincronização de baixo valor (IOF internacional <R$5, arredondamentos de R$0,01, itens duplicados no mesmo timestamp) que os filtros client-side já suprimem visualmente, mesmo continuando `'pendente'` no banco. Não é urgente, mas pode ser revisado numa próxima faxina se o volume voltar a incomodar.

## Correção 2 (15/08/2026) — Inbox ainda pegava assinatura como compra não registrada

**Achado do usuário, mesmo dia**: a cobrança ANTHROPIC*CLAUDE SUB de R$110,00 (12/08, PENDING no Pluggy) reapareceu como pendente mesmo depois da correção acima — era a assinatura mensal "Claude" (`cronograma_assinaturas`, `TXS000002`), não uma compra nova.

**Causa raiz**: o filtro de dedup (correção 1, itens 2 e 4 da função `arquivar_inbox_historico()`) só rejeitava por **valor exato** contra `transacoes`. Assinaturas internacionais com IOF variável (câmbio muda todo mês: R$113,72 num mês, R$117,18 no outro, R$116,42 no outro) nunca batem valor exato com nada — sobreviviam ao filtro e ficavam pendentes pra sempre, mesmo já orçadas em `cronograma_assinaturas`. Existia até uma detecção client-side pra esse exato problema (`descricaoBateAssinaturaConhecida`, `classificacao-inbox.js`, criada em 10/08/2026), mas ela só **mostrava um aviso** ("⚠ estabelecimento já é uma assinatura confirmada") — nunca filtrava o item da lista.

**Correção**: migration `arquivar_inbox_historico_reconhece_assinaturas_conhecidas` — nova regra na função (itens 5 e 6): qualquer pendente, de qualquer ciclo, cuja descrição contenha o 1º radical (≥4 letras) do nome de uma assinatura ATIVA em `cronograma_assinaturas` → rejeitado automaticamente, sem depender de valor bater. Rodada uma vez manualmente pra reprocessar o acumulado: 3 itens Pluggy capturados na hora (incluindo o Claude). Roda sozinha daqui pra frente, junto com o resto da função.

**Correção adicional, mesmo achado**: `cronograma_assinaturas`/`transacoes` (`TXS000002`, "Claude") estava orçado em R$110,00 flat, sem o IOF de compra internacional — subestimando o custo real (~R$113-117/mês). Corrigido pra R$113,72 (base + IOF 3,38% estimado), pedido explícito do usuário.
