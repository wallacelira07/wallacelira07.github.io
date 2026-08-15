# WWI Fase 2 — Proposta de Arquitetura: Snapshot Patrimonial Completo

**Status: PROPOSTA. Nenhum código escrito, nenhum schema alterado, nada implementado.** Entregue por exigência explícita do usuário ("Primeiro arquitetura. Depois aprovação. Depois implementação."), como pré-requisito antes de qualquer execução da Fase 2.

Objetivo declarado pelo usuário: transformar o WWI de gerador de relatórios (1 narrativa por ciclo, sob demanda) numa **plataforma histórica patrimonial** — capaz de produzir comparativos mensais/trimestrais/anuais, evolução do Wealth Score, e narrativa executiva ancorada em histórico real, não só no ciclo corrente.

Contexto que já existe hoje (Fase 1, Estágios A/A.1/B, já implementados e liberados) e que esta proposta usa como base, não reinventa:
- `historico_relatorios(competencia PK, score, dados_json jsonb, analise_ia jsonb, pdf_url, created_at, atualizado_em)` — já existe, já é o único escritor real via RPC `wwi_upsert_relatorio_mensal` (service_role).
- `dados_json` já carrega `indicadoresBrutos`, `subscores`, `indices`, `metodologiaVersao`, `dadosNarrativos` (qtdCaixas, projetos/passivos/centros de custo em forma bruta).
- `analise_ia` já carrega a narrativa completa: `projetos`, `passivosRank`, `centrosDeCusto`, `composicaoPatrimonio`, `liquidezAnalise`, textos.
- `vw_wwi_comparativo_mensal` (Fase 1, item 2) já calcula M/M, T/T (fechamento de trimestre), A/A (fechamento de ano) — hoje só para `score` e `patrimonioLiquido`.
- `METODOLOGIA_VERSAO`/`metodologiaVersao` (Fase 1, item 1) já rastreia mudança de fórmula por competência.
- Job mensal Python roda dia 25 (ou disparo manual), é idempotente, único escritor.
- Volume real hoje: **1 competência** (`2026-07`). Isso não é um detalhe secundário — condiciona toda a estratégia de "evitar tendência artificial" abaixo.

---

## 1. Snapshot Patrimonial — o que é armazenado por competência

### 1.1 Já persistido hoje (não precisa de nada novo)

Todos os 12 itens "obrigatórios" listados pelo usuário **já têm campo correspondente** em `historico_relatorios`, graças ao trabalho da Fase 1/Estágio A:

| Item exigido | Onde já mora hoje |
|---|---|
| Patrimônio financeiro | `dados_json.indicadoresBrutos.patrimonioFinanceiro` |
| Patrimônio total | `dados_json.indicadoresBrutos.ativosTotal` |
| Ativos | `dados_json.indicadoresBrutos.ativosTotal` (+ `dadosNarrativos.balancoLinhas.fisicoTotal`) |
| Passivos | `dados_json.indicadoresBrutos.passivosTotal` |
| Reserva de emergência | `dados_json.indicadoresBrutos.reserva` |
| Wealth Score | `historico_relatorios.score` (coluna própria) + `dados_json.wealthScore` |
| Subscores | `dados_json.subscores` (7 eixos) |
| Projetos | `analise_ia.projetos` (Meta do Milhão, Projeto Casa Nova, Consórcio Casa Nova) |
| Objetivos | mesmo campo `projetos` (não existe conceito separado hoje — ver 1.3) |
| Passivos operacionais | `analise_ia.passivosRank` |
| Composição patrimonial | `analise_ia.composicaoPatrimonio` (linhas + eixos + nota) |
| Liquidez | `analise_ia.liquidezAnalise` + `dados_json.indicadoresBrutos.liquidezCiclos` |

**Conclusão da seção 1**: o "Snapshot Patrimonial" que a Fase 2 pede **já existe estruturalmente**, campo a campo, desde o Estágio A. Fase 2 não precisa criar uma tabela nova pra isso — precisa **consumir** o que já está sendo gravado, de um jeito que sirva pra série histórica (hoje `dados_json`/`analise_ia` são só "o retrato de 1 mês", ninguém lê os 2 juntos ao longo do tempo de forma estruturada).

### 1.2 O que fica calculado em tempo real (nunca persistido)

- **`indicadores` (Wealth Score, subscores, indicadoresBrutos) no fluxo de exibição do PDF**: sempre recalculado ao vivo pelo JS (`calcularIndicadoresEScores`), nunca lido do banco — mesmo já existindo em `dados_json`. Isso é uma característica arquitetural já confirmada no Estágio A.1 (seção 15 do roadmap), não uma decisão nova desta fase. Pra Fase 2, isso não muda: os comparativos históricos vão ler `dados_json` das competências **fechadas/passadas** (via SQL, não pelo fluxo do botão), então não competem com essa regra — competência passada não tem mais "tempo real" pra recalcular.
- **KPIs do "Painel Executivo" do PDF**: vêm de scraping de DOM (`dados.secoes`), nunca persistidos, nunca fazem parte de histórico algum. Fora de escopo da Fase 2.
- **`capacidade_investimento`**: continua ausente (gap aceito, Estágio A) — não fica menos ausente numa série histórica, só se repete `null` em toda competência futura até existir fonte SQL.

### 1.3 Gap real encontrado nesta proposta: "Objetivos" não é um conceito distinto de "Projetos"

O usuário pediu os 2 como itens separados na lista de obrigatórios. Hoje só existe `projetos` (3 itens fixos: Meta do Milhão, Projeto Casa Nova, Consórcio Casa Nova). Não existe um conceito de "objetivo" independente (ex: metas pessoais não-financeiras, ou metas financeiras de prazo mais curto que não sejam nenhum dos 3 projetos fixos). **Decisão proposta**: tratar como o MESMO conceito por ora (não fabricar uma segunda categoria vazia) — se o usuário quiser "objetivos" como algo distinto de "projetos", isso é um levantamento de requisito novo, não uma lacuna de arquitetura, e fica fora desta proposta até ser esclarecido.

---

## 2. Evolução Histórica — M/M, T/T, A/A

### 2.1 Estratégia: estender `vw_wwi_comparativo_mensal`, não criar view nova

A view já existe, já resolve o problema difícil (janelas `LAG()`, fechamento de trimestre/ano por `DISTINCT ON`, guarda contra divisão por zero). Hoje só cobre `score`/`patrimonioLiquido`. Proposta: **adicionar as mesmas 3 janelas (M/M, T/T, A/A) para os demais campos do Snapshot** listados na seção 1 — `patrimonioFinanceiro`, `ativosTotal`, `passivosTotal`, `reserva`, e os 7 `subscores`. Mesmo padrão de `LAG()`/fechamento, só mais colunas — não é uma reformulação da view, é extensão aditiva (mesmo espírito de tudo que já foi feito no Estágio A).

**Por que não criar uma view por domínio (ex: `vw_wwi_comparativo_liquidez`, `vw_wwi_comparativo_subscores`)**: fragmentaria o que hoje é 1 leitura só. Sem indício de que isso vá ficar lento (12-24 linhas/ano, nunca vai ser uma tabela grande — ver seção 5), não há ganho em separar.

### 2.2 Como evitar tendência artificial com poucos pontos históricos

Esta é a pergunta mais importante da seção, porque **hoje só existe 1 competência real**. Qualquer "tendência" calculada com 1 ou 2 pontos é estatisticamente vazia — mostrar uma reta ou um "+12% ao mês" com 1 ponto de dado seria fabricar confiança que não existe, o mesmo erro que o projeto já rejeitou (Fase 1, decisão de não reprocessar histórico fictício).

**Regra proposta, a mesma já usada por `vw_wwi_comparativo_mensal`**: **toda métrica de variação retorna `NULL` quando o ponto de comparação não existe** — nunca `0%`, nunca "sem mudança", nunca uma extrapolação. A UI (Fase 2, seção 4) trata `NULL` como "Ainda não há histórico suficiente pra esta comparação", nunca como "○ 0%" (que pareceria um dado real de estabilidade).

**Limiares mínimos propostos, explícitos, para cada tipo de janela**:

| Janela | Mínimo de competências pra calcular | Abaixo do mínimo |
|---|---|---|
| M/M | 2 (atual + mês anterior) | `NULL`, sem exceção |
| T/T | 2 fechamentos de trimestre distintos | `NULL` |
| A/A | 2 fechamentos de ano distintos | `NULL` |
| Tendência (seção 3) | proposto: mínimo de **4 pontos** antes de exibir qualquer seta/rótulo de tendência | Abaixo disso, mostrar só o número absoluto, nunca "tendência de alta/baixa" |
| Média móvel (seção 3) | janela de 3 competências; só calcula quando há 3 pontos completos | `NULL` até lá — nunca uma média com 1-2 pontos disfarçada de "móvel" |

O "mínimo de 4 pontos pra tendência" é uma decisão de arquitetura desta proposta (não existia antes) — abaixo de 4, qualquer classificação de "subindo"/"caindo" é ruído, não sinal. Fica sujeito a validação do usuário na aprovação.

### 2.3 Séries incompletas (competência pulada)

Cenário real possível: o job falha um mês, ou o usuário pula um ciclo (viagem, etc.) e a competência nunca fecha. **Tratamento proposto**: `LAG()` sobre a série ordenada por competência (como já faz a view atual) naturalmente "pula" buracos — o M/M de um mês sem antecessor imediato simplesmente compara contra o que existir mais próximo, o que estaria ERRADO (compararia mês contra mês-2 como se fosse M/M). **Correção proposta**: adicionar uma checagem explícita de contiguidade — M/M só é calculado se a competência anterior na SÉRIE DE CALENDÁRIO (não a anterior na tabela) existir; senão, `NULL` + uma flag `serie_contigua = false` pra essa linha, pra a UI poder avisar "há uma lacuna no histórico entre X e Y" em vez de silenciosamente comparar dois meses não-consecutivos como se fossem consecutivos.

### 2.4 Mudança de metodologia no meio da série

Já coberto pela Fase 1 (`metodologia_mudou_desde_mes_anterior`, já existe na view). Proposta pra Fase 2: **quando essa flag for `true`, o delta correspondente (M/M daquele ponto) fica marcado como `comparavel = false`** — o número ainda é calculado (não é escondido), mas a UI mostra um aviso ("Wealth Score recalculado com metodologia nova neste ciclo — comparação com o ciclo anterior usa fórmulas diferentes") em vez de tratar como uma variação real de patrimônio/comportamento.

---

## 3. Wealth Score Histórico

### 3.1 Campos propostos (todos derivados de SQL, sobre `historico_relatorios.score` + `metodologia_versao`)

- **Evolução**: já coberta pela extensão da view (seção 2.1) — série completa de score por competência.
- **Melhor/pior score histórico**: `MAX(score)`/`MIN(score)` sobre a série — trivial, mas com 1 ressalva: **separar por `metodologia_versao`**. Comparar o melhor score de uma metodologia antiga com o pior de uma nova seria comparar réguas diferentes. Proposta: `melhor_score_mesma_metodologia` (dentro da versão atual) E `melhor_score_historico_absoluto` (todas as versões, com aviso de que pode não ser comparável) — os 2 números, nunca 1 só escondendo a diferença.
- **Média móvel**: janela de 3 competências (ver limiar da seção 2.2), calculada só quando há 3 pontos completos e CONTÍGUOS (mesma regra da seção 2.3).
- **Tendência**: classificação textual (alta/estável/queda) derivada da média móvel de 3 pontos comparada ao ponto anterior a essa janela — não do delta M/M isolado (1 mês de queda depois de 6 de alta não devia virar "tendência de queda" da noite pro dia). Só exibida com ≥4 pontos (seção 2.2).

### 3.2 Mudanças futuras de fórmula — uso de `metodologia_versao`

Já existe o campo, já é rastreado por competência. Proposta de uso na Fase 2:
1. Toda comparação histórica (M/M, T/T, A/A, melhor/pior, média móvel) **carrega a informação de quais metodologias estão sendo comparadas**.
2. Quando há mudança no meio da janela: marca `comparavel = false` (mesma lógica da seção 2.4) em vez de bloquear o cálculo ou fabricar uma "normalização" entre fórmulas diferentes (normalizar seria inventar um número que não existe em nenhuma das 2 metodologias reais).
3. Nenhuma normalização retroativa de metodologia é proposta nesta fase — está fora de escopo e é uma decisão de produto separada (o projeto já decidiu, na Fase 1, não reprocessar/reescrever histórico já persistido sem decisão explícita).

---

## 4. Dashboard Executivo — proposta de visualização

Escopo: leitura executiva estilo Family Office, mesma linguagem visual já aprovada no "Tactical Wealth Report" (Estágio A/A.1 reaproveitam essas classes CSS). Não é uma tela nova do zero — é uma extensão do mesmo painel.

| Bloco | Conteúdo | Fonte |
|---|---|---|
| **Evolução Patrimonial** | Gráfico de linha (patrimônio líquido por competência) + deltas M/M・T/T・A/A ao lado, cada um com estado "sem histórico suficiente" quando `NULL` | `vw_wwi_comparativo_mensal` estendida |
| **Wealth Score** | Gráfico de linha + faixa de melhor/pior + média móvel (linha pontilhada) + selo de tendência (só com ≥4 pontos) | seção 3 |
| **Meta do Milhão** | Barra de progresso (já existe hoje, ponto único) + linha do tempo de `%` acumulado por competência | `analise_ia.projetos` histórico |
| **Projeto Casa Nova** | Mesmo padrão de Meta do Milhão | idem |
| **Liquidez** | Série de `liquidezCiclos`/classificação ao longo do tempo — mostra se a Reserva está ganhando ou perdendo folga relativa | `dados_json.indicadoresBrutos.liquidezCiclos` |
| **Patrimônio Total / Financeiro** | 2 séries lado a lado (mesmo eixo Y), pra visualizar a proporção físico/financeiro mudando com o tempo | `indicadoresBrutos.ativosTotal`/`patrimonioFinanceiro` |

**Princípio de design proposto, consistente com o resto do projeto**: nenhum gráfico desenha uma linha "estimada"/"projetada" além do último ponto real. Com poucos pontos, o gráfico é curto e mostra "histórico em construção" — nunca extrapola visualmente o que os números não sustentam (mesmo espírito da regra "nunca fabricar dado", aplicada a visualização).

---

## 5. Riscos Arquiteturais

| Risco | Classificação | Mitigação proposta |
|---|---|---|
| **Crescimento de schema** | **Baixo** | Nenhuma tabela nova é proposta nesta fase (seção 1.1) — só extensão de view + leitura do que já existe. Se algo novo for necessário depois (ex: separar "objetivos" de "projetos", seção 1.3), é 1 coluna/campo `jsonb`, não uma reestruturação. |
| **Volume histórico** | **Baixo** | 1 linha/mês em `historico_relatorios` = 12 linhas/ano. Em 10 anos, 120 linhas. Não é um problema de escala em nenhum horizonte realista pra um sistema pessoal. |
| **Reprocessamento de competências antigas** | **Médio** | Já existe 1 precedente controlado (reprocessamento do Wealth Score de julho, Fase 1, via `UPDATE` direto documentado). Risco: se a Fase 2 precisar re-popular campos que não existiam quando uma competência antiga foi gravada (ex: se `analise_ia.composicaoPatrimonio.linhas` não existisse antes do Estágio A.1), a série histórica ficaria com "buracos" de campo, não de competência. Mitigação: qualquer leitura histórica trata campo ausente como `null` (mesma regra de sempre), nunca reprocessa retroativamente sem decisão explícita do usuário — mesma régua já estabelecida. |
| **Mudanças futuras na metodologia** | **Médio** | Já mitigado estruturalmente por `metodologia_versao` (seção 3.2) — o risco residual é humano (esquecer de bump a versão numa mudança de fórmula), não arquitetural. Mitigação: comentário já existe no código listando quando fazer o bump; nenhuma ação nova necessária. |
| **Consistência dos snapshots** | **Alto** | Cada campo do Snapshot (seção 1) vem de uma combinação de views/tabelas (`vw_patrimonio_v2`, `vw_saldo_v2_por_caixa`, `pib_wallace_historico`, `caixas.teto_mensal`, `emprestimos_internos`) capturadas num único instante da execução do job. Se qualquer uma dessas fontes mudar de estrutura (nome de coluna, tipo) sem o job ser atualizado junto, o snapshot daquele mês fica silenciosamente incompleto — o job não tem hoje uma validação de "todos os campos esperados vieram preenchidos". **Mitigação proposta (nova, pra Fase 2)**: adicionar uma checagem de sanidade ao final de `coletar_indicadores()` — contar quantos campos de `indicadoresBrutos`/`dadosNarrativos` vieram `None` vs esperado, e se a proporção passar de um limiar (ex: >30% ausente), o job grava mesmo assim (nunca bloqueia a gravação — isso quebraria o pipeline), mas loga um erro visível (mesmo padrão de heartbeat já usado pelos outros jobs) pra alguém notar antes do próximo ciclo. |
| **Dependência do job automático** | **Alto** | Toda a Fase 2 depende de o job de dia 25 rodar (ou ser disparado manualmente) todo mês, sem falha, pra série ficar sem buracos. Hoje já existe heartbeat monitorado (painel Saúde Operacional, Fase de hardening 11/08) — mitiga detecção, não mitiga a causa. Mitigação adicional proposta: a UI da Fase 2 (seção 4) já trata buraco de competência como dado real (seção 2.3), não como erro — então o "risco" de fato é só de qualidade de dado (série com lacuna), não de quebra de sistema. Aceitável, já mitigado pelo desenho de tratar `NULL`/lacuna como estado válido. |

---

## 6. Roadmap — Fase 2A / 2B / 2C

### FASE 2A — Extensão da série histórica (fundação)

- **Objetivo**: estender `vw_wwi_comparativo_mensal` pra cobrir todos os campos do Snapshot (seção 2.1), e adicionar a checagem de contiguidade de série (seção 2.3) e de metodologia comparável (seção 2.4).
- **Entregáveis**: view estendida (ou view nova complementar, decisão técnica no momento da implementação, sem impacto arquitetural), testada com dado real (1 ponto) e sintético (`BEGIN`/`ROLLBACK`, mesmo padrão da Fase 1).
- **Riscos**: baixo — mesma classe de mudança já feita e validada na Fase 1, item 2.
- **Dependências**: nenhuma — todos os campos-fonte já existem.
- **DoD**: view retorna `NULL` corretamente em todo campo sem histórico suficiente (testado com o único ponto real + sintéticos); nenhuma tendência/média/delta fabricada com dado insuficiente; documentação atualizada.

### FASE 2B — Wealth Score histórico + checagem de sanidade do job

- **Objetivo**: implementar melhor/pior score (por metodologia), média móvel, tendência (seção 3) + a checagem de sanidade do job (seção 5, risco "Consistência dos snapshots").
- **Entregáveis**: view/função SQL pra melhor/pior/média móvel; logging de sanidade no job Python (`coletar_indicadores()`).
- **Riscos**: médio — a checagem de sanidade precisa de um limiar bem calibrado (>30% ausente é uma estimativa inicial, pode precisar ajuste após observar dados reais).
- **Dependências**: Fase 2A concluída (reaproveita a mesma view estendida).
- **DoD**: melhor/pior/média móvel corretos contra dado sintético cobrindo os casos de borda (metodologia mudando no meio, série com lacuna); job continua gravando mesmo com campo ausente (nunca bloqueia), mas loga de forma visível quando isso acontece.

### FASE 2C — Dashboard Executivo (visualização)

- **Objetivo**: implementar a UI da seção 4 — gráficos de evolução patrimonial, Wealth Score, Meta do Milhão, Projeto Casa Nova, liquidez, patrimônio total/financeiro.
- **Entregáveis**: novo painel/seção no site consumindo as views das Fases 2A/2B.
- **Riscos**: baixo técnico, mas UX-sensível (mesmo padrão já visto nesta sessão de "não é o que aprovei" — recomendo protótipo/mockup validado com o usuário antes da implementação final, mesmo processo já usado pro Tactical Wealth Report).
- **Dependências**: Fases 2A e 2B concluídas.
- **DoD**: nenhum gráfico extrapola além do último ponto real; todo estado de "histórico insuficiente" tem uma representação visual explícita (não um gráfico vazio ou quebrado); aprovação visual do usuário.

---

## Resumo para decisão

- **Nenhuma tabela nova é necessária** — o Snapshot que a Fase 2 pede já é gravado desde o Estágio A. O trabalho real da Fase 2 é: extensão de 1 view SQL (2A), cálculos históricos derivados (2B), e a camada de visualização (2C).
- **O maior risco real não é técnico, é estatístico**: com 1 único ponto histórico hoje, qualquer "tendência"/"média móvel" precisa de limiares explícitos (propostos na seção 2.2/3.1) pra não fabricar confiança que os dados ainda não sustentam. Isso é tratado por design (`NULL` explícito, mínimo de pontos) em vez de esperar passivamente até ter "dado suficiente" — a arquitetura já nasce pronta pra série curta E pra série longa, sem precisar de retrabalho quando o histórico crescer.
- **Aguardando aprovação explícita** antes de qualquer implementação (2A/2B/2C).
