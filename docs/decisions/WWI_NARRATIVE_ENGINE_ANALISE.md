# Análise do Narrative Engine — pré-requisito pra unificação (Fase 1, WWI_ROADMAP_V1)

**Status: ANÁLISE, sem nenhuma alteração de código. Entregue por exigência explícita do usuário antes de qualquer unificação.**

Objetivo: documentar com precisão o que os 2 motores fazem hoje, onde divergem, e qual é o risco real de unificar — pra que a decisão de "como" unificar seja informada, não um chute.

---

## 1. Fluxo atual — motor JS (`src/relatorio/gerar-analise-financeira.js`)

**Gatilho**: exclusivamente o clique do usuário no botão de gerar relatório (`gerarRelatorioFechamentoPDF()`, em `index.html`). Só roda com o usuário logado e o painel (iframe) carregado.

**Entrada**:
- `dados` — objeto retornado por `coletarDadosRelatorioFechamento()`: texto **raspado do DOM já renderizado** (seções/rótulos/valores como string, ex: `"R$ 471.458,31"`), depois convertido pra número por `_wwiNum()`.
- `caixaLanceSaldo` — buscado à parte via `wwiBuscarSaldoCaixaLance()` → `WallaceFinanceService.getSaldosPorCaixa()` → `vw_saldo_v2_por_caixa` (única parte do fluxo JS que já é SQL direto, não DOM).

**Processamento** (`gerarRelatorioFechamentoPDF()` em `index.html`, orquestra tudo):
1. `calcularIndicadoresEScores(dados, caixaLanceSaldo)` — calcula os 7 sub-scores + Wealth Score + 4 índices + `indicadoresBrutos`.
2. `wwiBuscarHistoricoRelatorios(competencia)` — busca `historico_relatorios` (leitura pública, chave `anon`).
3. **Decisão de narrativa**: se já existe um relatório persistido pra esta competência (o job mensal já rodou), **reaproveita a narrativa salva (`analise_ia`) tal como está** — requisito explícito do usuário, "narrativa igual durante o mês". Só se **não existir ainda** (job do mês não rodou), chama `gerarAnaliseFinanceira(dados, caixaLanceSaldo)` pra gerar uma narrativa **na hora, só pra exibir — nunca persiste**.
4. `compararComHistorico(indicadores, historico.anteriores)` — frases de evolução (patrimônio/score) vs. ciclo anterior e janelas de 3/6/12 ciclos. **Existe só aqui, não tem equivalente no Python.**
5. `gerarPdfRelatorioFechamento()` monta o HTML/PDF final.

**Saída**: nunca grava no banco — só exibe/gera PDF no navegador do usuário.

**Regras de narrativa implementadas em `gerarAnaliseFinanceira()`** (contei 15, nomeadas em `regrasAplicadas`): `liquidez_forte`/`media`/`fraca`, `alavancagem_baixa`/`media`/`alta`, `concentracao_fisica`, `investimentos_bem_alocados`, `meta_milhao_inicial`/`avancada`/`mais_da_metade`, `escola_julio_baixo`/`ok`, `casa_nova_pre_contemplacao`, `projeto_casa_nova_capital`, `wartsila_pendencia`, `wartsila_recuperacao_alta`, `capacidade_investimento`, `caixas_zeradas`, `poupanca_alta`.

**Blocos estruturados só no JS** (usados pelo PDF "Tactical Wealth Report" premium): `projetos` (cards de metas), `passivosRank` (ranking de risco dos passivos), `centrosDeCusto` (4 famílias de caixas agregadas), `composicaoPatrimonio` (gauge de 5 eixos), `liquidezAnalise` (classificação textual + índice de independência). **Nenhum desses existe no lado Python.**

---

## 2. Fluxo atual — motor Python (`scripts/sync/wwi_gerar_relatorio_mensal.py`)

**Gatilho**: job agendado (dia 25, via `cron-job.org` → GitHub Actions) ou disparo manual do workflow.

**Entrada**: nenhum DOM — consulta direto `vw_patrimonio_v2`, `vw_saldo_v2_por_caixa`, `reembolso_wartsila_ciclo`, `pib_wallace_historico` via REST/SQL, com a chave `service_role`.

**Processamento**:
1. `coletar_indicadores()` — calcula os mesmos 7 sub-scores (fórmulas espelhadas do JS, inclusive as correções desta sessão) + Wealth Score + `indicadoresBrutos` + (desde hoje) `metodologiaVersao`.
2. `gerar_narrativa()` — implementação **separada e muito mais enxuta**: só 6 regras (`endividamento` alto/baixo, `investimentos` baixo/alto, `metaMilhaoPct` baixo/alto, `consorcioCasaPagoPct` baixo, `reembAReceber`, `reembRecebidos/reembTotalCiclo`). **Nenhuma regra de liquidez, Escola de Júlio, Projeto Casa Nova, capacidade de investimento, caixas zeradas, poupança, perfil de construção ou próximo salto patrimonial** — simplesmente não existem neste lado.
3. `gravar_snapshot()` → RPC `wwi_upsert_relatorio_mensal` — **este é o único escritor real** de `historico_relatorios`.

**Saída**: grava no banco (via RPC restrita a `authenticated`/`service_role`).

**Regras de narrativa implementadas**: 6, sem nome individual rastreável (`regrasAplicadas` grava só a string fixa `["motor_python_job_mensal"]` — não dá pra saber quais das 6 dispararam num ciclo específico, ao contrário do JS que nomeia cada regra).

---

## 3. Pontos de divergência confirmados

| Dimensão | JS | Python | Risco |
|---|---|---|---|
| Cobertura de regras de narrativa | 15 regras | 6 regras | **Alto** — narrativa persistida (Python) é objetivamente mais pobre que a que o usuário vê ao clicar "gerar relatório" no mesmo ciclo, antes do job rodar |
| Sub-score `liquidez` | Calculado (DOM tem "Total operacional") | **Sempre `null`** (sem fonte SQL confiável hoje) | Médio — Wealth Score persistido nunca considera os 15% de peso da liquidez; renormalizado, mas é um eixo inteiro ausente sempre |
| Blocos estruturados (projetos/passivos/centros de custo/composição/liquidez) | Existem, alimentam o PDF premium | **Não existem** | Alto — se o PDF passasse a depender só do que está persistido, essas seções ficariam vazias |
| Comparativo histórico (`compararComHistorico`) | Existe, calculado a cada clique | Não existe (mas `vw_wwi_comparativo_mensal`, entregue nesta sessão, cobre a mesma necessidade do lado SQL) | Baixo — já mitigado pela Fase 1, item 2 |
| Rastreabilidade de regra disparada | `regrasAplicadas` nomeado, granular | String fixa, sem granularidade | Baixo — não afeta o número/texto exibido, só a auditabilidade |
| Fonte de dado | DOM renderizado (texto → número) | SQL direto (número nativo) | Já é o motivo original de toda essa investigação — 2 pipelines independentes, sem compartilhar código, só fórmula "espelhada" à mão |

---

## 4. Riscos de regressão se a unificação for feita de forma ingênua

Se a "unificação" significasse simplesmente **"JS para de gerar narrativa própria, sempre usa o que está persistido"**, sem mais nada, os riscos reais seriam:

1. **Perda de cobertura de narrativa** — qualquer relatório gerado nos primeiros dias do ciclo (antes do job do dia 25 já ter rodado a versão daquele mês) passaria a mostrar uma narrativa de 6 regras em vez de 15, ou nenhuma narrativa (dependendo de como o fallback for tratado). Isso é uma piora perceptível e imediata pro usuário.
2. **Perda dos blocos estruturados do PDF** — `projetos`/`passivosRank`/`centrosDeCusto`/`composicaoPatrimonio`/`liquidezAnalise` simplesmente desapareceriam do relatório, porque só existem no lado JS hoje. Isso quebraria a fidelidade visual do "Tactical Wealth Report" já aprovada numa sessão anterior (14/08) — regressão visível, não só técnica.
3. **Sub-score de liquidez nunca mais apareceria** em nenhum relatório oficial (persistido), mesmo quando o usuário tem uma Reserva de Emergência saudável — perda de informação real, não só cosmética.

---

## 5. Estratégia recomendada — unificação em 2 estágios, não 1 salto

**Não recomendo fazer a unificação como "flip único"** (trocar de uma vez o comportamento do JS). O risco muda completamente se for feito em 2 estágios:

**Estágio A — Enriquecer o Python primeiro (aditivo, mesmo padrão já usado nesta sessão pra `organizacaoFinanceira`/`construcaoPatrimonial`)**:
Portar as 9 regras de narrativa que faltam (liquidez, Escola de Júlio, Projeto Casa Nova, capacidade de investimento, caixas zeradas, poupança, perfil de construção, próximo salto, resumo de abertura) + os 5 blocos estruturados pro lado Python, usando fonte SQL em vez de DOM (mesmo trabalho já feito pra os 2 sub-scores nesta sessão — adaptado, documentado, testado). Ao final deste estágio, o Python produz uma narrativa **igual ou mais completa** que o JS, sem que nada no comportamento visível hoje mude (o JS continua gerando sua própria prévia quando o job não rodou ainda — só que agora, quando ele reaproveita a persistida, ela é tão boa quanto).

**Estágio B — Simplificar o JS (só depois do Estágio A validado)**:
Só depois de confirmar (comparação lado a lado, competência real) que o Python produz o mesmo nível de narrativa, o JS deixa de ter lógica de geração própria — vira 100% leitor/exibidor do que está persistido, gerando só uma prévia mínima ("relatório ainda não fechado oficialmente este ciclo") quando não existir nada pra mostrar, em vez de recalcular tudo de novo.

**Por que essa ordem importa**: o Estágio A sozinho já elimina o risco de "narrativa pobre no persistido" (item 1 dos riscos acima) e é puramente aditivo (mesmo perfil de risco baixo que `metodologia_versao`/`vw_wwi_comparativo_mensal`, já aprovados e entregues). O Estágio B (remover código do JS) é a parte que precisa de mais cautela — só compensa fazer depois que o A prova que não há perda.

---

## 6. Estratégia de rollback

- **Sem migration/schema envolvido** — narrativa mora em `dados_json`/`analise_ia`, ambos `jsonb` já flexíveis. Reverter é reverter commit(s), não desfazer estrutura de banco.
- **Relatórios já persistidos não são afetados por um rollback de código** — um `git revert` do Estágio A/B não reescreve `historico_relatorios` retroativamente (mesmo princípio já aplicado: nunca reescrever histórico sem decisão explícita).
- Se o Estágio A revelar, na prática, que uma regra específica não é replicável com segurança via SQL (paralelo ao que já aconteceu com `organizacaoFinanceira`, que precisou virar um proxy adaptado em vez de cópia exata), a regra fica documentada como `null`/ausente no Python — nunca fabricada — e o JS continua cobrindo esse caso na prévia local até existir uma fonte SQL confiável.

---

## 7. Recomendação final

Autorizar o **Estágio A** (enriquecer o Python, aditivo, mesmo perfil de risco já validado nesta Fase 1) como próximo passo, se aprovado. O **Estágio B** (simplificar o JS) só deve ser autorizado depois que o Estágio A for validado com uma comparação real lado a lado — não nesta mesma leva.

**Nenhuma unificação foi executada. Aguardando aprovação explícita pra iniciar o Estágio A.**
