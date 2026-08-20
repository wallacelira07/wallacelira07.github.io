# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 20/08/2026, sessão longa (bloco 32) — reconciliação completa dos 2 cartões, caça a bugs estruturais de "dado que nunca expira sozinho", e revisão profunda da fórmula de Necessidade Bruta/Líquida. Resumo executivo abaixo; detalhe completo nas seções seguintes.

## 0. Resumo executivo da sessão de 20/08/2026

1. **Mastercard Black — "Não Reconciliado" fechado em R$0,00 exato** (seção 1). 4 causas reais achadas e corrigidas: Tokio Marine duplicado (era parcela do Visa, não recorrência nova), H57Store sem dono, assinaturas somando sem checar ciclo (mesmo bug já corrigido em recorrências, nunca replicado), IOF de compra internacional sem linha própria.
2. **Visa Infinite — "Não Reconciliado" fechado em R$0,00 exato** (seção 2). Mesma investigação revelou que o card do Visa nunca tinha linha pra "Compras Wallace/Vanessa" e o objeto que alimenta a tela era um retrato estático, nunca recalculado — 2 bugs de exibição corrigidos, além dos dados em si (Claude, MEGA, Uber, IOF, H57Store da Vanessa).
3. **3 bugs estruturais achados por auditoria de 3 agentes** (seção 3): `REG.superavitNormal.liquidoReal` preso no salário do ciclo passado (já causou confusão real 2x), `VARS.livroLRPV` nunca recalculado (inofensivo até agora), parcela da Korpos desatualizada (8/12 → 9/12).
4. **Pluggy travada em 3 faturas** (seção 4): por pedido explícito do usuário, `cartaoInfiniteTotal`/`cartaoMBTotal`/`mercadoPagoFatura` não são mais sobrescritos automaticamente pela sincronização da Pluggy — fatura em PDF/print sempre vence, até o usuário liberar de novo caixa a caixa.
5. **LREI (empréstimos internos)**: LREI0003 (R$266,23) quitado — dinheiro já estava disponível desde 13/08, só faltava fechar o ciclo. LREI0004/0005 com plano de quitação definido, ainda não executado (aguardando entrada de R$340 e sobras de salário, respectivamente).
6. **Necessidade Bruta/Líquida — fórmula completa entendida e um bug de documentação corrigido** (seção 5): déficit de caixas sem LREI já incluía a Caixa Variável desde 16/08 (código certo), mas a legenda continuava dizendo o contrário há 4 dias — corrigida. Valores finais recalculados: **Necessidade Bruta R$15.345,06, Necessidade Líquida R$14.005,90**.
7. **Lições da investigação** documentadas permanentemente em `docs/MANUAL_OPERACIONAL_AGENTES.md` seções 1.3.6/1.3.7 e em memória do agente — evitar repetir o mesmo tempo perdido numa reconciliação futura.
8. **Bug real achado depois do falso alarme (seção 5.5)**: "Estimador de Salário do Mês" mostrava R$17.843,58 (fallback) em vez de R$14.519,30 (projeção real) — causa era `FinanceEngine.calcularLiquidoMes()` hardcodeando `indice === 0` em vez de calcular dinamicamente o índice do próximo pagamento sem salário real. Corrigido + testes novos adicionados.

Tudo publicado (`main`, GitHub Pages) — nenhuma pendência de push no fim da sessão.

## 1. Mastercard Black — reconciliação completa (RESOLVIDO)

### 1.1 Achados e correções

**Tokio Marine (Seguro Auto, R$200,99)**: criado por engano mais cedo na mesma sessão como recorrência nova no Mastercard Black (`TXRR000007`). O usuário mostrou print da fatura real do Visa Infinite (Bradesco, cartão 4844) confirmando: já é uma parcela ATIVA do Visa (`TXP000008`, 7/10). `TXRR000007` **excluída** (`DELETE`, a pedido explícito — não é histórico real, é erro do mesmo dia). `TX000272` (a transação bruta) mantém `usuario_id = NULL` (já representada pela parcela).

**H57Store (TX000240, R$1,49, 22/07)**: estava sem `usuario_id`, invisível em LRW/LRV. Atribuída a Wallace (padrão histórico do cartão).

**Assinaturas sem consciência de ciclo**: `mbLRSConfirmado` somava 100% das 13 assinaturas ativas incondicionalmente, mesmo as que não cobraram de novo neste ciclo — mesma classe de bug já corrigida em `cronograma_recorrencias` (`ultima_cobranca_em`), nunca replicada em `cronograma_assinaturas`. Migração `add_ultima_cobranca_em_assinaturas` aplicada, 11 das 13 datas confirmadas pela fatura real (Netflix, YouTube Premium, Intelbras Cloud, ChatGPT, Registro.br, Spotify, Uber One, Amazon Prime Canais, Fábio Sabino, iFood, Amazon Prime base). MEGA/Meli+ ficam sem data (nenhuma evidência ainda de que cobraram neste ciclo específico — confirmado depois que MEGA na verdade cobrou no **Visa**, não no MB, ver seção 2). **Bug adicional achado só depois de publicar**: a query `getCronogramaAssinaturasV2()` (`app.js`) não pedia a coluna nova no `select` — corrigido.

**IOF de compra internacional (R$18,21)**: categoria separada ("Outros custos") na fatura real do banco, nunca vira linha em `transacoes`. Virou componente explícito rastreado: `VARS.mbIOFConfirmado` (`vars-mercado-pago.js`) + linha nova na tela (`mbLRIOF`) + somado na fórmula (`hydrate-visa-mb.js`).

Âncora `cartaoMBTotal` atualizada pra **R$7.042,33** (era R$7.024,31 — valor real, direto da soma da fatura + compras de 18-19/08 confirmadas pelo print do app, não estimativa).

### 1.2 Metodologia de reconciliação usada (referência pra próxima vez)

1. Fatura real (xlsx/PDF do banco) lida linha a linha, com atenção a colunas escondidas (achado real: uma coluna de detalhe de câmbio USD estava sendo capturada no código mas nunca impressa/usada).
2. Reconciliação item a item contra `transacoes` (multiset match por data+valor), separando: itens que batem exato, itens com defasagem de 1 dia (lag normal de processamento do banco, não é erro), itens já cobertos por recorrência/assinatura (não devem ter linha própria em `transacoes`), e itens genuinamente faltando.
3. Resumo nativo do banco ("Fatura aberta = Compras − Pagamento + Outros custos") usado como cross-check independente — ajudou a achar 1 linha de IOF (R$3,85) que nunca tinha sido capturada por nenhum processo.
4. Todo componente da fórmula recalculado do zero por SQL direto antes de declarar "fechado" — nunca misturar número de um turno anterior com um recalculado agora.

## 2. Visa Infinite — reconciliação completa (RESOLVIDO)

### 2.1 Achados e correções (dados)

Fatura real (PDF Bradesco, "fatura_bradesco.pdf") confirmou 3 cartões: 4844 (Wallace, R$1.004,75), 2773 (Wallace, parcela PicPay, R$183,47), 4845 (Vanessa, R$24,48) = **R$1.216,55 total**.

- **Anthropic/Claude (R$110,00, 12/08)**: cobrado por engano no Visa este ciclo (confirmado pela fatura) — volta pro Mastercard Black no próximo. Lançado como `TX000348`.
- **MEGA Pro Lite (R$30,99, 22/07)**: também cobrado no Visa por engano — já existia como `TXS000010` mas com `cartao_id NULL` e `ja_orcado_assinaturas=true` (por isso não contava em lugar nenhum). Corrigido: `cartao_id` = Visa 4844, `ja_orcado_assinaturas=false`. Usuário já trocou o método de pagamento padrão pro Mastercard Black — próximo ciclo deve cobrar lá.
- **Uber (TX000271, R$26,58) e IOF diário (TX000273, R$2,76)**: já existiam em `transacoes` (achados pelo agente de contaminação Visa×MB mais cedo), só não estavam somadas no literal de exibição.
- **IOF s/ trans inter reais (R$3,85, 18/08)**: linha solta na fatura, fora dos 3 subtotais por cartão — nunca tinha sido capturada. Achada pelo 2º agente de verificação, lançada (`TX000351`).
- **Vanessa (2x H57Store, R$24,48, cartão 4845)**: não estavam lançadas em lugar nenhum — checado que não duplicavam nada no Mastercard antes de lançar (`TX000349`/`TX000350`).

Âncora `cartaoInfiniteTotal` atualizada pra **R$1.216,55** (era R$1.017,89, só parcelas — nunca incluía as compras avulsas de Wallace/Vanessa).

### 2.2 Bugs de exibição achados (código, não dado)

1. **`R.visaDetalhe` era um retrato estático** — montado 1x em `criarRegMercadoPago()` no boot, lendo `VARS` naquele instante, nunca recalculado de novo (diferente do lado MB, que já tinha `recalcularEHidratarMbPessoal()`). Corrigido: nova função `recalcularEHidratarVisaPessoal()` (espelho exato da função do MB), chamada no início de `hydrateVisaMB()` — cobre os 3 pontos que já chamam essa função (boot, `promoverFaturaPluggyComoFonte()`, `aplicarOnda9LivrosFixos()`).
2. **HTML do card do Visa nunca teve linhas pra "Compras Wallace/Vanessa"** — só existiam no card do Mastercard Black. Os valores eram calculados no JS mas não tinham `id` de DOM pra renderizar. 2 linhas novas adicionadas (`visaLRW`/`visaLRV`).

### 2.3 Item ainda pendente da fatura Visa

Card 2773 (Picpay parcela 12/12, R$183,47) — confirmado pelo usuário que é pessoal e já está no LRP, sem ação necessária.

## 3. Bugs estruturais achados por auditoria (3 agentes, 20/08/2026)

Depois de achar o bug do `liquidoReal` (seção 5.3 abaixo), o usuário pediu 3 agentes pra caçar o mesmo padrão ("dado confirmado que nunca expira sozinho quando o contexto muda") em todo o resto do código. Achados:

1. **`VARS.livroLRPV`** (PIX Geral Vanessa) — prometia ser recalculado depois do fetch V2, mas nunca era de fato (só o `<tbody>`/`VARS.LRPGV_TRANSACOES` eram atualizados). Inofensivo até agora (nada mais lia essa variável — o número na tela sempre esteve certo porque outro trecho escreve direto no DOM). Corrigido: `VARS.livroLRPV`/`REG.livrosRazaoTotais.LRPV.total` agora são atualizados junto, dentro de `aplicarOnda3LivroRazao()`.
2. **Korpos Estética (parcela)** — site mostrava 8/12, fatura real confirmava 9/12. Corrigido (`TXP000003`, código e Supabase `parcelas`).
3. **`PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP` (parcela_atual)** — avança 100% manual, sem nenhuma automação (nem trigger no Supabase, nem código em `trocarCiclo()`). Risco real, não corrigido ainda (precisaria de auditoria item a item contra extrato real de cada parcelamento — só a Korpos foi conferida e corrigida nesta sessão).
4. **`cronograma_consorcios`** — não tinha `ultima_cobranca_em` (mesmo campo que já existe em recorrências/assinaturas). Inofensivo hoje (as 2 linhas estão `ativo=false`), mas reintroduziria o mesmo bug se algum consórcio for reativado. Coluna adicionada preventivamente.
5. **`mbIOFConfirmado`** — mesmo risco de fundo (literal manual que pode ficar velho), mas natureza diferente (não é "ciclo atual", é "última fatura reconciliada"). Não corrigido — não há solução estrutural óbvia sem uma tabela de IOF por fatura, que é overkill pro valor envolvido (~R$18-40/mês). Atualizar manualmente a cada fatura nova reconciliada.

## 4. Pluggy travada em 3 faturas (pedido explícito do usuário)

Depois de reconciliar manualmente o Visa e o MB contra PDFs/prints reais e bater R$0,00 exato nos dois, o usuário decidiu: **a fatura em PDF/print sempre vence a sincronização automática da Pluggy**, até ele mesmo confirmar uma fatura nova.

Implementado em `pluggy-reconciliacao.js`: lista `PLUGGY_PROMOCAO_TRAVADA = ['cartaoInfiniteTotal', 'cartaoMBTotal', 'mercadoPagoFatura']` — as 3 únicas faturas que `promoverFaturaPluggyComoFonte()` conseguia sobrescrever automaticamente. Enquanto um `totalVar` estiver nesta lista, a Pluggy nunca substitui o valor manual, mesmo com fatura em aberto confiável disponível. Remover um item específico da lista só quando o usuário confirmar uma reconciliação nova.

## 5. Necessidade Bruta / Necessidade Líquida — entendimento completo + 1 bug de documentação corrigido

### 5.1 O que compõe a Necessidade Total Bruta

Total Operacional (soma direta de 7 componentes) + Orçamento Operacional (R$3.200 fixo) + Déficit de caixas sem LREI (dinâmico).

| # | Componente | Valor (20/08/2026) |
|---|---|---|
| 1 | Boletos (`cronograma_boletos_fixos` ativos) | R$4.618,72 |
| 2 | Parcelas Visa (`PARCELAMENTOS_VISA` ativas) | R$1.017,89 |
| 3 | Consórcios | R$0,00 |
| 4 | Recorrências (MB+Visa) | R$769,28 |
| 5 | Aportes Patrimoniais | R$1.893,34 |
| 6 | Provisão Mercado Pago (`PARCELAMENTOS_MP` ativas) | R$403,11 |
| 7 | Assinaturas (Mastercard Black) | R$354,78 |
| | **= Total Operacional** | **R$9.057,12** |
| | + Orçamento Operacional | R$3.200,00 |
| | + Déficit caixas sem LREI | R$3.087,94 |
| | **= Necessidade Total Bruta** | **R$15.345,06** |

**Necessidade Líquida = R$15.345,06 − R$1.339,16 (Cobertura Garantida) = R$14.005,90.**

### 5.2 De onde vem o R$3.200 do Orçamento Operacional

`tetoOficial` da Caixa Variável (R$2.000) + meta da PIX Vanessa (R$1.200) = R$3.200. São 2 orçamentos DIFERENTES somados num número só (compras no cartão da Caixa Variável × dinheiro/PIX da Vanessa) — o usuário identificou corretamente que essa mistura pode mascarar um estouro de qualquer um dos 2 lados.

### 5.3 Falso alarme investigado e descartado: `liquidoReal` NÃO estava preso no ciclo passado — era rótulo ambíguo, não bug

Print real do usuário pareceu mostrar o card "Necessidade × Salário" tratando R$16.819,56 (salário recebido em 24/07) como se fosse do ciclo errado. 1ª hipótese (errada, chegou a ser publicada): `REG.superavitNormal.liquidoReal = {0: 16819.56}` estaria desatualizado, corrigido pra `{}`. **Revertido no mesmo dia** depois de investigar `gerarMesesCiclo()` (`graficos-utilitarios.js`) a fundo: com `hoje.getDate() < 25`, o índice 0 SEMPRE representa o ciclo que **já está rodando** (25/07→24/08, rotulado "Ago/26" na tela pela maioria dos dias cair em agosto) — não o próximo pagamento. Esse ciclo já tinha salário real confirmado (R$16.819,56, 24/07, TX000136) — o valor original estava **certo o tempo todo**. Usuário confirmou explicitamente: *"[o ciclo] tá rodando com um pagamento"*.

**A confusão real era de rótulo, não de dado**: "Ago/26" pode significar 2 coisas diferentes — o ciclo que já está em andamento agora (como o sistema rotula) ou o próximo pagamento de fato (25/08, ainda não recebido, é o que o usuário tinha calculado como previsão hoje). `liquidoReal: {0: 16819.56}` restaurado. Risco estrutural real permanece o mesmo: esse objeto precisa ser atualizado manualmente pro índice 0 do ciclo novo assim que o salário de 25/08 for recebido — sem isso, no dia 25/08 ele passa a representar o ciclo errado até alguém trocar.

**Lição extra**: mesmo tendo acabado de escrever as 7 regras de "nunca declarar fechado sem recalcular do zero" (seção 1.2), quase cometi o mesmo erro de novo — diagnostiquei um bug baseado numa leitura rápida do sintoma, sem ler `gerarMesesCiclo()` primeiro antes de agir. Só não errei 2x seguidas porque parei pra investigar antes de reverter de novo, quando o usuário insistiu que algo ainda parecia errado.

### 5.4 Bug de documentação achado e corrigido: déficit já incluía a Caixa Variável, texto dizia o contrário

O usuário perguntou se o estouro da própria Caixa Variável entrava no cálculo de "Déficit caixas sem LREI". A resposta inicial (baseada na legenda `legDeficitCaixasSemLrei`) foi "não, ela é excluída de propósito" — **errada**. O código real (`hydrate-deficit-caixas-sem-lrei.js`) já tinha sido corrigido em **16/08/2026** pra incluir a Caixa Variável no mesmo loop das outras caixas (pedido do usuário na época: "quero que unifique com as outras caixas, o teto é 2k e não 3.2k"). A legenda (`vars-operacional.js`) ficou **4 dias desalinhada** com o código real, dizendo "Caixa Variável fica de fora desta regra" quando não ficava mais.

**Efeito real**: o déficit total sobe de R$1.842,60 (só as 6 caixas temáticas) pra **R$3.087,94** (+ R$1.245,34 da própria Caixa Variável — comprometido R$3.104,72 vs saldo R$1.859,38, sem nenhum LREI cobrindo). A Necessidade Bruta corrigida sobe de R$14.099,72 pra R$15.345,06.

**Lição**: mesma classe de erro do dia inteiro — documentação/legenda que promete uma coisa e o código faz outra, silenciosamente, até alguém perguntar a coisa certa. Ver `docs/MANUAL_OPERACIONAL_AGENTES.md` 1.3.6/1.3.7.

### 5.5 Bug REAL (não falso alarme): "Estimador de Salário do Mês" mostrando fallback errado — `FinanceEngine.calcularLiquidoMes` hardcodeava `indice === 0`

Depois do falso alarme da seção 5.3, o usuário apontou de novo, com print, que o card "Estimador de Salário do Mês" (ciclo 25/08→24/09, próximo pagamento) mostrava **R$17.843,58** (a média ponderada de fallback) em vez de **R$14.519,30** (`REG.estimador.liquidoProjetadoProximoCiclo`, calculado a partir da folha de ponto de julho/2026). Revisão estática de `app.js:liquidoMes(i)` não achou nada errado — a função lida no código-fonte estava correta.

**Causa real**: `src/app/promocoes-financeengine.js` (Fase 2V, 06/08/2026) **sobrescreve `liquidoMes` em tempo de execução** com uma chamada pra `WallaceFinanceEngine.calcularLiquidoMes()` (`src/services/FinanceEngine.js`). Essa cópia "pura" da função tinha um bug: hardcodeava `indice === 0` pra decidir quando usar a projeção, enquanto a original em `app.js` calcula esse índice **dinamicamente** (`indiceDoProximoPagamentoSemReal = liquidoReal[0] existe ? 1 : 0`). Como o ciclo atual (índice 0) já tem salário real confirmado (`liquidoReal: {0: 16819.56}`), o índice do "próximo pagamento sem real" é **1** — mas a cópia só testava `indice === 0`, então `liquidoMes(1)` nunca caía no ramo da projeção e sempre retornava o fallback.

**Por que a rede de segurança não pegou**: a validação que compara os 12 índices contra a função original (`WallaceComparator.compararLote`) foi **desativada** em 19/08/2026 (`const aprovado = true;` fixo, comentário "pedido explícito do usuário — só V2 existe, sem cálculo paralelo bloqueando") — então o `console.table` do "FASE 2V" reportava "12/12 promovidos" mesmo com a lógica divergente.

**Diagnóstico ao vivo**: como o código lido batia com o esperado, a única forma de confirmar foi `console.log()` direto no DevTools, dentro do iframe certo (não "top"), com filtro de texto do console limpo — 2 rodadas de troubleshooting só de ferramenta (contexto errado, depois filtro escondendo o output) antes de conseguir o valor real: `liquidoMes(1) = 17843.58` com `liquidoReal={0:16819.56}` e `estimador=14519.3` — confirmando o bug.

**Correção**: `FinanceEngine.js:calcularLiquidoMes()` agora replica exatamente a lógica de `app.js` (índice dinâmico, não hardcode). Testes novos adicionados em `tests/unit/FinanceEngine.test.js` cobrindo esse cenário específico (índice 1 com real confirmado no índice 0) — os testes antigos não cobriam esse caso, por isso o bug passou.

### 5.6 Ciclo atual vs. ciclo seguinte na Necessidade Total — 2 correções de fundo (pedido explícito do usuário)

Depois do fix da seção 5.5, o usuário apontou 2 problemas reais nos cards de "Necessidade Total":

**(a) Os cards de destaque do topo (KPI + seção 19/20) mostravam o ciclo ATUAL, não o seguinte.** Argumento do usuário: *"o ciclo atual não tem como mudar, depois que o salário cai e o dinheiro é dividido, já era — o que importa é o próximo ciclo, todo esforço é pra saber quanto vou ganhar e gastar no próximo ciclo"*. `kpiTotalOp/kpiNecBruta/kpiNecLiquida` e `s20TotalOp/s20NecBruta/s20NecLiquida` (`hydrate-resumo-executivo.js`) trocaram de `REG.operacional.*` (índice 0, ciclo atual) pra `REG.evolucao.*[1]` (ciclo seguinte) — mesma fonte que os cards "Necessidade × Salário"/"Estimador" já usavam. Como Cobertura Garantida nunca é projetada pra frente (regra já existente, "não chuta confirmação futura"), Bruta e Líquida do próximo ciclo agora saem sempre iguais nesses cards — `s20Garantido` fixado em R$0,00 com legenda explicando o porquê.

**(b) O déficit de caixas sem LREI (hoje R$2.458,29 ao vivo) não entrava em NENHUMA projeção de ciclo futuro** — só na Necessidade Bruta do ciclo atual (índice 0). Usuário: *"se eu vou cobrir as caixas negativas com o salário de 25/08, é lógico que esses custos têm que ser somados à necessidade do próximo ciclo"*. 1ª tentativa: somar `REG.operacional.deficitCaixasSemLrei` direto no loop de `recalcular-necessidade.js`, em todos os índices projetados. **Revertida no mesmo dia** — usuário gostou da ideia mas preferiu não embutir a suposição no número principal ("vamos manter como era antes"). Solução final: número base (`REG.evolucao.necessidadeLiquida[1]`) volta a NÃO incluir o déficit; em vez disso, um **aviso condicional** novo (`hydrate-estimador-salario.js`, ids `homeAvisoDeficit`/`estAvisoDeficit`, só aparece quando há déficit real > 0) mostra: *"⚠️ Hoje há R$X em caixas negativas sem LREI cobrindo. Se não for quitado até o fechamento do ciclo (24/08), a Necessidade Líquida do próximo ciclo sobe para R$Y."* — informa o cenário condicional sem alterar o número principal nem esconder o risco.

## 6. Empréstimos internos (LREI) — estado individual

- **LREI0003 (R$266,23, Fatura Cartão Mercado Pago)**: **QUITADO** hoje. O dinheiro (perna MP corporativo do reembolso Wärtsilä) já tinha chegado na Caixa Mercado Pago em 13/08 (`TX000292`) — só faltava o repasse formal de volta pra Caixa Lance, feito agora (`TX000357`/`TX000358`).
- **LREI0004 (R$103,55, Caixa Manutenção)**: plano ORIGINAL (usar os R$340,00 do reembolso Wärtsilä) **mudou de destino em 20/08/2026** — os R$340 chegaram (Itaú→Mercado Pago→Caixa Lance, `TX000359-361`) e o usuário redirecionou 100% pra 2 urgências reais: R$55,29 pra Caixa Boletos (completar Van do Júlio, vencimento 22/08, `TX000362`/`TX000363`) + R$284,71 pra Emagrecimento (`TX000364`/`TX000365`). `reembolso_wartsila_ciclo.valor_a_receber` zerado (perna final recebida). **LREI0004 fica sem fonte de quitação definida — pendência real, precisa de novo plano.**
- **LREI0005 (R$1.950,77, Caixa Boletos)**: plano definido — quitação gradual via sobras de salário, sem valor único definido. Ainda não executado.

## 7. Rastreamento da Cobertura Garantida (R$1.339,16) até os saldos das caixas

Pergunta do usuário: "essa sobra já virou saldo em alguma caixa?" — sim, rastreável 100% por transação:

- R$999,16 (parte já recebida da TED de 13/08) → Caixa Lance → redistribuído no mesmo dia: R$583,99 Bens Duráveis + R$278,89 Emagrecimento + R$108,63 Churrasco + R$27,65 ficou na própria Lance.
- R$340,00 (ainda a receber) → mesmo destino esperado (Caixa Lance).

Achado colateral: R$583,99 e R$278,89 são **exatamente** os saldos atuais de Bens Duráveis e Emagrecimento hoje — praticamente 100% do saldo dessas 2 caixas veio desse repasse pontual, não de acúmulo próprio.

## 8. Bugs cosméticos/UX corrigidos na mesma sessão (achados no meio, não relacionados à reconciliação financeira)

- **Cache do CSS travado desde 11/08** — `styles.css?v=277` nunca era invalidado apesar de 15+ commits de CSS publicados depois. Action de deploy (`atualizar_versao_deploy.yml`) agora bumpa esse `?v=` junto com `__V` a cada push.
- **LRMP corporativo com célula de Origem faltando** — coluna desalinhada (a linha renderizava 4 `<td>` pra um cabeçalho de 5 colunas).
- **Busca global: clique num resultado que já estava na aba visível fechava a tabela** — `showLR()` é um toggle (clicar numa aba já ativa fecha ela); a navegação por busca chamava incondicionalmente, causando o fechamento em vez de só rolar até a linha. Corrigido: só chama `showLR()` se a aba ainda não estiver ativa.

## 9. Não mexido nesta sessão / pendências reais pro futuro

- Auditoria item a item de todos os `PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP` contra extrato real (só Korpos foi conferida) — risco real, ver seção 3 item 3.
- `mbIOFConfirmado` precisa ser atualizado manualmente a cada fatura MB nova reconciliada — sem solução estrutural ainda.
- Conta de energia (Energisa) vai reduzir este mês por créditos solares (137 kWh acumulados) — fatura real só fecha amanhã (21/08), aguardando valor real antes de atualizar `TXB000009`/aporte da Caixa Boletos.
- `liquidoReal` (seção 5.3) precisa ser limpo manualmente a cada virada de ciclo — sem rollover automático ainda, risco de repetir o mesmo bug num ciclo futuro se ninguém lembrar.
- **PENDÊNCIA NOVA (20/08/2026, ligada à meta máxima do projeto — ver seção 0/memória "zerar o déficit")**: usuário confirmou que agosto/2026 ainda é mês de transição do desconto solar (parcial), mas a partir de **setembro/2026 o desconto passa a valer sobre a fatura Energisa INTEIRA** — estimativa hoje é de ~R$300-330/mês de economia adicional (vs. R$367,36 do boleto fixo atual), mas isso é PROJEÇÃO, não confirmado. **Assim que a fatura real de setembro sair**: (1) atualizar `TXB000009`/boleto Energia com o valor real reduzido, (2) recalcular o plano de quitação antecipada do Consórcio Porto (Carro) que estava sendo montado nesta mesma conversa (ver simulação: Vivo R$104,08/mês já confirmado + energia solar + assinaturas candidatas = pool de economia mensal direcionável pro consórcio), (3) avisar o usuário que o número mudou de estimado pra real.
- **PENDÊNCIA NOVA (20/08/2026): aporte da Emagrecimento (R$490/mês) pausado por EXATAMENTE 1 ciclo** (`parametros_gerais.saudeEmagrecimentoAporte` = 0, mesmo valor no fallback `vars-operacional.js`). Motivo: usuário tem 3 canetas em estoque, sem compra prevista tão cedo — dinheiro redirecionado a serviço da meta máxima. **REVERTER pra 490.00 (nos 2 lugares) quando o ciclo 25/09→24/10 abrir**, salvo o usuário confirmar que precisa pausar mais um ciclo.
- **Conta Suavização (CC-304) com saldo R$0,00** — usuário identificou isso como "meu maior gargalo hoje" (18/08/2026 confirmou que essa caixa não tem aporte mensal fixo, só teto de R$12.000, `VARS.metaSuavizacao`). Sem nenhum saldo aqui, não existe amortecedor pra um mês de salário fraco. **NÃO propor mais planos de financiamento pra essa caixa sem o usuário pedir de novo** — ver correção de rumo abaixo.
- **CORREÇÃO DE RUMO (20/08/2026, mesma sessão)**: depois de eu propor um "aporte mensal recorrente de R$594,08" pra Suavização, o usuário apontou 2 erros reais: (1) misturei uma economia TEMPORÁRIA (Emagrecimento, pausada por só 1 ciclo) com uma proposta de compromisso PERMANENTE — matematicamente errado; (2) empilhar mais um aporte fixo é exatamente o problema que ele tinha acabado de descrever (caixas demais consumindo o salário, nada sobra pra investir/família). Depois, ao eu propor uma "transferência única" das sobras, ele apontou que **não existe dinheiro real pra transferir** — Vivo mais barata só significa fatura menor quando chegar, não um valor em caixa. Ele disse explicitamente: **"o sistema está me pressionando ao invés de me tranquilizar"**. Nenhum aporte novo foi criado. Única ação real desta frente: MEGA (Pro Lite, R$30,99/mês) cancelada pelo usuário direto no app e marcada `ativo=false` em `cronograma_assinaturas`. Lição permanente registrada em memória do agente — ver `feedback_nao_empilhar_pressao_financeira`.

## 10. Bug estrutural achado e corrigido: reconciliação de gráficos nunca rodava de verdade desde 10/08/2026

Depois da inversão do rótulo dos ciclos (seção 5.5-relacionada), o usuário notou as tabelas Déficit Zero/Piso×Necessidade Líquida presas em "Carregando dados reais…" pra sempre. Investigação via console (`typeof atualizarGraficosNecessidade` retornava `undefined`, enquanto funções vizinhas do MESMO arquivo existiam normalmente) revelou a causa raiz: **5 funções de reconciliação de gráficos** (`atualizarGraficosNecessidade`, `atualizarGraficoPatrimonio`, `atualizarGraficoTotalOpDetalhe`, `atualizarGraficoCaixaVariavel`, `atualizarGraficoCaixas`, todas em `graficos-cenarios-lazy.js`) são declaradas **dentro do escopo de `_lazyRenderGraficosSecao()`** (corpo desta função não é indentado no arquivo, por isso pareciam top-level numa leitura rápida do código) — nunca foram expostas em `window`. Todo guard `typeof atualizarGraficoX === 'function'` espalhado por `hydrate-deficit-caixas-sem-lrei.js`, `hydrate-onda4-patrimonio.js`, `hydrate-onda1/2-v2.js` etc. **sempre falhava silenciosamente desde que essas funções foram criadas em 10/08/2026** — nenhuma reconciliação de gráfico pós-boot rodava de verdade, o site só não quebrava porque o guard defensivo escondia o erro. Corrigido: as 5 funções agora são explicitamente expostas (`window.atualizarGraficoX = atualizarGraficoX`), logo após suas declarações. **Lição**: este arquivo (`graficos-cenarios-lazy.js`, 2193 linhas, o maior módulo do boot) não indenta corpos de função — cuidado ao ler "nível zero" como sinônimo de "escopo global" nele especificamente.
