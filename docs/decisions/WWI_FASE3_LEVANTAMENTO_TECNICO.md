# WWI Fase 3 — Levantamento Técnico: Tactical Wealth Report como consumidor do WWI

**Status: LEVANTAMENTO. Nenhum código alterado, nenhuma migração feita.** Entregue por exigência explícita do usuário ("Não fazer a migração ainda. Primeiro mapear."), antes de qualquer execução da Fase 3.

Objetivo declarado: inverter `dados → múltiplos motores → PDF` para `dados → snapshot → WWI → Tactical Wealth Report`. Princípio oficial: **WWI = fonte de verdade. PDF = representação da fonte de verdade.**

---

## 1. Tudo que o PDF recalcula hoje (ao vivo, client-side)

Rastreado a partir de `gerarRelatorioFechamentoPDF()` → `construirHtmlRelatorioWWI()` (`index.html`).

| # | O que é recalculado | Onde | Sempre ao vivo, ou só às vezes? |
|---|---|---|---|
| 1 | `indicadores` completo (Wealth Score, 7 subscores, 4 índices, 16 campos de `indicadoresBrutos`) | `win.calcularIndicadoresEScores(dados, caixaLanceSaldo)`, chamado em `index.html:1706` | **SEMPRE** — mesmo quando a narrativa é reaproveitada do WWI persistido. Achado confirmado na Fase 1/Estágio A.1 (seção 15 do roadmap): este é o ÚNICO motor que roda incondicionalmente, nunca lê `dados_json`. |
| 2 | `comparativo` (variação de patrimônio/score vs. ciclo anterior, janelas de 3/6/12 ciclos) | `win.compararComHistorico(indicadores, historico.anteriores)`, `index.html:1728-1730` | **SEMPRE** ao vivo — nunca lê `vw_wwi_comparativo_mensal`, mesmo essa view já calculando algo equivalente (M/M·T/T·A/A) desde a Fase 1. |
| 3 | Painel Executivo — 8 KPIs (Patrimônio Financeiro, Patrimônio Total, Passivos Externos, Reserva Emergencial, Liquidez Imediata, Meta do Milhão, Geração de Caixa, Capacidade de Investimento) | `pdfPegarKpi(dados.secoes, ...)`, `index.html:1379-1388` | **SEMPRE** — lê direto de `dados.secoes` (texto raspado do DOM pelo coletor), nunca do banco. |
| 4 | Reembolsos Wärtsilä (KPI grid da seção 08) | `indicadores.indicadoresBrutos.reembTotalCiclo/reembRecebidos/reembAReceber`, `index.html:1499-1508` | **SEMPRE** — deriva do item 1, que é sempre ao vivo. |
| 5 | Score Wallace Lira (gauge, seção 10) + `subscoresHtml` | `indicadores.wealthScore`/`indicadores.subscores`, `index.html:1344-1345,1399-1406` | **SEMPRE** — mesmo motivo do item 1. |
| 6 | `narrativa` (pontos fortes/fracos, riscos, oportunidades, recomendações, parecer final, 5 blocos estruturados) | `win.gerarAnaliseFinanceira(dados, caixaLanceSaldo)`, `index.html:1714` | **SÓ ÀS VEZES** — só quando NÃO existe `historico.atual.analise_ia` pra esta competência (ou seja, o job de dia 25 ainda não rodou neste ciclo). Quando existe, já é 100% WWI (`narrativa = historico.atual.analise_ia`, `index.html:1712`). |
| 7 | Metadados de capa (`dados.cicloAtual`, `dados.geradoEm`) | `coletarDadosRelatorioFechamento()`, usados em `index.html:1601,1610` | **SEMPRE** — não são cálculo, são metadado de exibição, mas ainda vêm do DOM. |

**Achado central**: dos 7 itens acima, **6 já são recalculados ao vivo incondicionalmente** — o único que já é "WWI puro" quando possível é a narrativa (item 6), e isso já foi resolvido na Fase 1 (Estágios A/A.1/B). Os itens 1, 2, 3, 4, 5 nunca leem `dados_json` nem as views novas da Fase 2, mesmo quando a competência já está totalmente persistida no WWI.

---

## 2. Tudo que já existe nas views WWI (fonte de verdade, hoje)

| Onde | O que contém | Equivalente exato ao item da tabela acima |
|---|---|---|
| `historico_relatorios.dados_json.indicadoresBrutos` | 16 campos: `patrimonioLiquido`, `ativosTotal`, `passivosTotal`, `patrimonioFinanceiro`, `reserva`, `totalOperacional`, `metaMilhaoPct`, `reembRecebidos`, `reembAReceber`, `reembTotalCiclo`, `consorcioCasaPagoPct`, `crescPatrimInicial`, `crescPatrimAtual`, `liquidezCiclos`, `poupancaReceitas`, `poupancaSobrou` | Cobre 100% do item 4 (Reembolsos Wärtsilä) e a maior parte do item 1 |
| `historico_relatorios.dados_json.{wealthScore,subscores,indices}` | Wealth Score, 7 subscores, 4 índices | Cobre 100% do item 5 e o restante do item 1 |
| `historico_relatorios.dados_json.metodologiaVersao` | Versão da fórmula usada | Não tem equivalente no fluxo atual do PDF — não é citado hoje |
| `historico_relatorios.analise_ia` | Narrativa completa + 5 blocos estruturados | Já é usado (item 6), quando existe |
| `vw_wwi_comparativo_mensal` (Fase 1) | Score/patrimônio líquido com M/M·T/T·A/A + `metodologia_mudou_desde_mes_anterior` | Cobre parcialmente o item 2 (mesma intenção, framing diferente: calendário vs. contagem de ciclos) |
| `vw_wwi_metricas_historico` (Fase 2A) | 14 métricas (patrimonioFinanceiro/ativosTotal/passivosTotal/reserva/liquidezCiclos/metaMilhaoPct/consorcioCasaPagoPct/projetoCasaNovaPct + 7 subscores) com M/M·T/T·A/A | Cobre o resto do item 2, pros campos além de score/patrimônio |
| `vw_wwi_score_historico` (Fase 2B) | Melhor/pior por metodologia, média móvel, tendência | Não tem equivalente hoje no PDF — o PDF nunca mostrou "melhor score histórico" |

**Não existe hoje**: equivalente pronto pros 8 KPIs específicos do Painel Executivo (item 3). Alguns batem 1:1 com campos de `indicadoresBrutos` (Patrimônio Financeiro, Patrimônio Total, Reserva Emergencial, Meta do Milhão), outros são combinações ad-hoc feitas só no DOM (Liquidez Imediata = Reserva+Caixa Lance+Caixa Variável; Geração de Caixa = "Entradas totais" do Fluxo Financeiro do Ciclo) sem campo correspondente em `indicadoresBrutos` hoje.

---

## 3. O que pode ser substituído IMEDIATAMENTE (sem trabalho novo, só trocar a fonte)

Válido **apenas para competências já fechadas/persistidas** (ver limitação estrutural na seção 4):

| Item | De onde vem hoje | Pra onde migra | Esforço |
|---|---|---|---|
| Reembolsos Wärtsilä (item 4) | `indicadores.indicadoresBrutos.reemb*` (live) | `dados_json.indicadoresBrutos.reemb*` (persistido) | Trivial — mesmo nome de campo, já existe |
| Score Wallace Lira gauge + `subscoresHtml` (item 5) | `indicadores.wealthScore`/`subscores` (live) | `dados_json.wealthScore`/`subscores` (persistido) | Trivial — mesmo nome de campo, já existe |
| Patrimônio Financeiro/Total/Passivos Externos/Reserva Emergencial/Meta do Milhão (4 dos 8 KPIs do Painel Executivo) | `dados.secoes` (DOM) | `dados_json.indicadoresBrutos.{patrimonioFinanceiro,ativosTotal,passivosTotal,reserva,metaMilhaoPct}` | Baixo — campo já existe, só trocar a leitura |
| `comparativo` pra score/patrimônio líquido | `compararComHistorico()` (live) | `vw_wwi_comparativo_mensal` (M/M·T/T·A/A já calculados) | Médio — framing diferente (calendário vs. 3/6/12 ciclos), precisa decisão de produto sobre qual exibir, não é só trocar a fonte |

---

## 4. O que ainda depende de `gerarAnaliseFinanceira()`/`calcularIndicadoresEScores()` (client-side)

### 4.1 Dependência estrutural (não é "falta migrar", é a natureza do ciclo aberto)

**Toda a competência ATUAL, antes do job de dia 25 rodar, não tem linha em `historico_relatorios` ainda.** Nesse período (a maior parte de cada ciclo — só o dia do fechamento tem WWI persistido de verdade), literalmente não existe WWI pra consumir. O PDF, se gerado nesse intervalo, **precisa** continuar calculando ao vivo — isso não é uma lacuna a fechar, é a realidade de um relatório que pode ser pedido a qualquer momento do ciclo, não só no fechamento.

**Implicação pro plano de migração**: qualquer troca de fonte precisa de um `if` explícito — "esta competência já tem linha persistida?" — não uma substituição incondicional.

### 4.2 Dependência de dado que só existe no DOM

- **Liquidez Imediata** (KPI do Painel Executivo) = soma de 3 campos (Reserva + Caixa Lance + Caixa Variável) — não existe como campo único em `indicadoresBrutos` nem nas views. Pra migrar, precisaria: (a) adicionar esse campo calculado ao Python (aditivo, mesma classe de trabalho já feita no Estágio A), ou (b) aceitar que este KPI específico continua vindo do DOM enquanto os outros migram.
- **Geração de Caixa (PIB Wallace)** = "Entradas totais" do Fluxo Financeiro do Ciclo — mesma situação, não tem campo direto hoje (existe `poupancaReceitas` em `indicadoresBrutos`, mas não é exatamente "entradas totais").
- **Capacidade de Investimento** (KPI) = `indicadoresBrutos.poupancaSobrou` formatado — este JÁ bate 1:1 com um campo persistido, é migrável (deveria ter entrado na tabela da seção 3, adicionando aqui pra registrar).
- **Metadados de capa** (`dados.cicloAtual`, `dados.geradoEm`) — não são cálculo, mas seguem vindo do DOM; migrar exigiria decidir se "gerado em" deveria virar "dados de `atualizado_em`" (mudança de significado: hora que o job rodou vs. hora que o PDF foi aberto — não é a mesma coisa, precisa decisão de produto).

### 4.3 `comparativo` — janelas de 3/6/12 ciclos não têm equivalente exato

`compararComHistorico()` compara contra os últimos 3/6/12 registros da tabela (contagem de linhas), enquanto `vw_wwi_comparativo_mensal`/`vw_wwi_metricas_historico` comparam M/M (mês civil)/T/T (trimestre civil)/A/A (ano civil). Com histórico maior, esses dois enquadramentos divergem (ex: "3 ciclos atrás" ≠ "1 trimestre atrás" se algum ciclo foi pulado). Migrar exige decisão de produto: manter os 2 enquadramentos, ou padronizar em 1 só.

---

## 5. Plano de migração sem regressão (proposto, não iniciado)

Mesma estratégia de 2 estágios já usada e validada no narrative engine (Estágio A/A.1/B) — aditivo primeiro, substituição só depois de provado.

### 3A — Guarda de disponibilidade + migração dos itens triviais (seção 3)

- Adicionar 1 checagem no início de `gerarRelatorioFechamentoPDF()`: `const competenciaJaFechada = historico.atual && historico.atual.dados_json;`.
- Quando `true`: `indicadores` passa a ser montado a partir de `historico.atual.dados_json` (mesmo shape, já compatível — é literalmente o que `calcularIndicadoresEScores()` retorna, gravado pelo Python) em vez de `win.calcularIndicadoresEScores(dados, caixaLanceSaldo)`.
- Quando `false` (ciclo aberto, sem WWI ainda): comportamento atual, sem mudança.
- Cobre os itens 4, 5, e os 4 KPIs triviais do item 3 (seção 3 desta análise) de uma vez, porque todos dependem do mesmo `indicadores`.

### 3B — Shadow mode pro `comparativo` (mesmo padrão do Estágio B)

- Antes de trocar `compararComHistorico()` pelas views, rodar em paralelo (mesmo espírito de `wwiCompararNarrativaShadow`): calcular os 2 (live + view) e logar divergência no console, sem trocar o que é exibido.
- Só depois de um período de observação, decidir se os 2 enquadramentos (3/6/12 ciclos vs. M/M·T/T·A/A) convivem ou se 1 substitui o outro.

### 3C — KPIs sem fonte direta (Liquidez Imediata, Geração de Caixa) — decisão separada

- Requer trabalho aditivo no Python (novos campos em `indicadoresBrutos`, mesma classe de decisão já tomada 2x nesta sessão pra `organizacaoFinanceira`/`construcaoPatrimonial` e pra liquidez/independência financeira) — **decisão de produto do usuário antes de qualquer código**, não uma tarefa técnica isolada.
- Até essa decisão, esses 2 KPIs específicos continuam vindo do DOM mesmo depois de 3A/3B — degradação aceitável, documentada, não bloqueia o resto da migração.

### Ordem recomendada: 3A → 3B → (3C só se autorizado separadamente)

---

## 6. Estratégia de rollback

- **Zero schema destrutivo em qualquer etapa** — 3A/3B são só troca de FONTE de leitura no JS (`dados_json` em vez de recálculo), nenhuma tabela/coluna nova, nenhuma migration.
- **Reverter = reverter commit** — mesmo padrão usado a sessão inteira (`git revert`), sem nenhum passo de banco envolvido.
- **Fallback automático por competência, não por deploy**: a checagem `competenciaJaFechada` (seção 3A) já é, por design, um fallback vivo — se por qualquer motivo uma competência específica tiver `dados_json` incompleto/corrompido, basta a checagem falhar (ou um campo vir `undefined`) e o comportamento correto é cair de volta pro cálculo ao vivo pra aquela geração específica, nunca quebrar a geração do PDF. Mesma filosofia defensiva já usada no shadow mode (`try/catch` em volta da comparação).
- **Nenhuma competência já persistida é reescrita** — a migração muda só de onde o PDF LÊ, nunca o que o job GRAVA. Mesmo princípio "nunca reescrever histórico sem decisão explícita" já estabelecido desde a Fase 1.

---

## Resumo para decisão

O achado mais importante deste levantamento: **a narrativa (textos/blocos estruturados) já é 100% WWI quando a competência está fechada** — isso foi resolvido na Fase 1. O que falta pra completar "WWI = fonte, PDF = saída" é migrar os **NÚMEROS** (`indicadores`, `comparativo`, parte dos KPIs) da mesma forma — e a maior parte disso (seção 3) é trivial, porque os campos já existem persistidos com o mesmo nome. As únicas partes genuinamente difíceis são: (a) o ciclo aberto sem WWI ainda (estrutural, sem solução — sempre vai precisar de fallback ao vivo), e (b) 2 KPIs (Liquidez Imediata, Geração de Caixa) sem campo persistido hoje, que exigem uma decisão de produto antes de qualquer trabalho técnico.

**Nenhuma migração foi feita. Aguardando aprovação explícita pra iniciar 3A.**
