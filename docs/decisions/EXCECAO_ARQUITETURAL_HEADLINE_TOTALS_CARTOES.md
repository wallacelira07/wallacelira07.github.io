# Exceção arquitetural formal — Headline totals de cartão (Mastercard Black / Visa Infinite / Mercado Pago)

**Data:** 08/08/2026
**Status:** REVOGADA em 12/08/2026 (usuário, explícito: "considere essa mensagem como revogação explícita da decisão anterior"). Objetivo mudou de "preservar a exceção" pra "eliminar 100% da dependência de V1, mesmo com dado imperfeito — documentar limitação, congelar valor aprovado, gravar na V2, remover a dependência mesmo assim". Ver seção nova abaixo. Texto original preservado logo depois só como histórico de por que a exceção existiu.

## Revogação (12/08/2026) — o que mudou de fato

Os 3 campos (`cartaoMBTotal`, `cartaoInfiniteTotal`, `mercadoPagoFatura`) não dependem mais de `wallace_dados`/`Object.assign(VARS, dr)` pra funcionar:
- `cartaoMBTotal`, `mbLRWConfirmado`, `mbLRVConfirmado`: gravados na tabela `indicadores` (V2), lidos em `app.js` (bloco `window.WALLACE_CREDITOS_EXTERNOS_V2`) — trabalho de sessão anterior (11/08), confirmado nesta auditoria.
- `cartaoInfiniteTotal`: congelado em `indicadores` a partir da fatura real do banco (Visa Infinite, vencimento 28/07/2026, R$9.073,92, PDF conferido) — feito nesta sessão (12/08/2026). Resíduo de ~R$3.380 entre esse total e a soma item-a-item da V2 é limitação objetiva (Pluggy só sincroniza ~6 semanas; o resto só existe num PDF com data ilegível por OCR) — documentada, não bloqueia mais nada.
- `mercadoPagoFatura`: já tinha fallback 100% V2/ERP (`totalOpProvMP + reembolsoPagaMPCorporativo`) quando a Pluggy devolve 0 — nunca dependeu de `wallace_dados` de fato, só parecia depender.

`promoverFaturaPluggyComoFonte()` continua ativo como primeira tentativa (fatura real da Pluggy quando existe fatura aberta) — o que mudou é que o fallback deixou de ser `wallace_dados` e passou a ser `indicadores` (V2) nos 3 casos.

**Atualização 11/08/2026 (evento que muda a regra de negócio, previsto pelo parágrafo acima):**
usuário aprovou (10/08) e eu implementei (11/08) `promoverFaturaPluggyComoFonte()`
(`src/integrations/pluggy/pluggy-reconciliacao.js`, chamada de `hydrate-onda7-pluggy.js`) — os 3
campos passam a ser sobrescritos pela fatura REAL da Pluggy (`conta.fatura_mes_atual.valor_total`)
sempre que ela existir de verdade (não-nula, não-zero, com vencimento no futuro/fatura em aberto).
**Isso não contraria a regra "a fatura sempre vence" — reforça ela**: antes, "a fatura" era digitada
à mão a partir de conferência manual do extrato; agora, quando a Pluggy tem a fatura em aberto
confiável, ela É a fatura, direto do banco, sem intermediação manual. Quando a Pluggy não tem dado
confiável (fatura vencida/zerada/ausente — situação comum, ver `pluggy_contas` no momento desta
escrita: todas as 4 contas CREDIT sem fatura aberta válida), o valor cai pro fallback já existente
(reconciliação manual pra Visa/MB, soma do ERP pro Mercado Pago) — nunca esconde nem inventa dado.
Continua **proibido** derivar esses 3 campos da soma de lançamentos categorizados do ERP
(`transacoes`/`visaDetalhe`/`mbDetalhe`) — essa parte da exceção original permanece de pé, foi
tentado e revertido na mesma sessão de 11/08 (ver histórico do commit). Badge "🔄 Pluggy"/"📝 manual"
nos cards (`hydrate-visa-mb.js`/`hydrate-mercado-pago.js`) mostra a origem sempre visível pro usuário.

## O que fica de fora do objetivo "zero `wallace_dados`"

Os campos `cartaoMBTotal`, `cartaoInfiniteTotal` e `mercadoPagoFatura` (headline totals das faturas de cartão) **nunca serão derivados exclusivamente de soma de lançamentos categorizados da V2 relacional** (`transacoes`/`visaDetalhe`/`mbDetalhe`). Podem, sim, vir da fatura real da Pluggy (ver atualização acima) — a distinção é "fatura real do banco" vs. "soma do ERP", não "manual vs. automático".

## Por que

Regra de negócio permanente, não lacuna de engenharia: **"a fatura sempre vence"**. Esses três valores são reconciliados manualmente contra o extrato/fatura real do banco (Pluggy + conferência humana) porque são a única fonte que reflete o que o banco vai cobrar de fato — item cobrado fora do padrão, câmbio de compra internacional, encargo, juros, estorno, tudo isso entra na fatura real antes de qualquer classificação/categorização no ERP conseguir capturar. Modelar isso na V2 (recalcular o total a partir de `transacoes` categorizadas) reabriria a reconciliação inteira desses 3 valores — já auditada e fechada em sessões anteriores (`PLANO_UNIFICACAO_V1_V2.md`, seção 36) — sem ganho real: o valor de "verdade" continua sendo o extrato do banco, não a soma de lançamentos do ERP.

`reconciliarPluggy()` (`src/integrations/pluggy/pluggy-reconciliacao.js`) já faz essa comparação — fatura Pluggy × total do ERP — e é exatamente essa a função dele: **detectar divergência, não substituir a fonte**.

## O que isso não bloqueia

Não bloqueia o resto do domínio Mastercard Black/Visa Infinite:
- Titularidade/mapa de cartão (`cartoes`) — já migrado (Wave B1, 08/08/2026): `pluggy-reconciliacao.js` monta `CARTAO_PLUGGY_MAPA` a partir da tabela `cartoes` (V2), com o literal local só como fallback de rede.
- LRW/LRV (compromisso de cartão por pessoa) — já V2-exclusivo desde a Onda 3 (`vw_compromisso_cartao_por_pessoa`), endurecido na Wave A (08/08/2026) pro mesmo padrão `⚠ Indisponível (V2)`.

## O que isso bloqueia (relacionado, mesma causa raiz)

Assinaturas (`visaLRSConfirmado`/`mbLRSConfirmado`) e Recorrências/Corporativo — **não é a mesma exceção** (não é "fatura sempre vence"), é falta de dado: a maioria das transações candidatas não tem `cartao_id` preenchido em `transacoes`, então não dá pra saber se pertencem à fatura Visa ou Mastercard Black. Achado em 08/08/2026 (Wave B2): das 27 transações já classificadas como categoria "Assinaturas", 23 têm `cartao_id = null`. Isso é uma pendência de classificação/dado, **não** uma exceção arquitetural — fica registrado à parte, não resolvido nesta rodada, aguardando decisão do usuário sobre como preencher `cartao_id` retroativamente (nenhuma inferência sem evidência, regra P1 do manual).

## Consequência prática

`ESTADO_ATUAL.md` e `MANUAL_OPERACIONAL_AGENTES.md` devem parar de listar os headline totals como "pendente de migração" — a partir desta decisão, eles são "exceção decidida", fora da métrica de "quantos consumidores de `wallace_dados` ainda restam".
