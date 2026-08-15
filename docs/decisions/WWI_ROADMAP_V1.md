# WWI_ROADMAP_V1 — Wallace Wealth Intelligence como funcionalidade permanente

**Status: ROADMAP VALIDADO pelo usuário (15/08/2026). Cron externo confirmado pelo usuário. Nenhum código escrito, nenhuma migration aplicada ainda — aguardando autorização final pra iniciar a implementação da Fase 1.**

Aprovado pelo usuário em 15/08/2026 como frente principal de trabalho, depois de descartar reprocessamento retroativo de histórico (princípio formal: "nenhum dado histórico será criado artificialmente") e adiar `src/services/*.js`/lint `hydrate-*`/Inbox como não-prioritários enquanto o WWI estiver em construção. Reconfirmado pelo usuário na mesma data, com o cron dado como validado ("como acabamos de executar um disparo manual do cron, considero o processo de captura histórica validado") — ver nota na seção 3.

**Objetivo do projeto**: transformar o WWI de "botão que gera um relatório sob demanda" em **funcionalidade permanente** do sistema — histórico confiável, comparativos automáticos, narrativa sem duplicação, e relatório executivo que existe todo mês sem precisar de clique manual.

---

## 1. Princípios que governam este roadmap (não negociáveis, valem pras 3 fases)

1. **Nenhum dado histórico é fabricado.** A série do WWI nasce em `2026-07` (primeiro ponto real e correto) e cresce 1 competência por vez, organicamente. Nenhuma fase deste roadmap tenta reconstruir meses anteriores a julho.
2. **Toda mudança de metodologia de cálculo é rastreável** (`metodologia_versao`) — comparar competências de metodologias diferentes deve ser uma decisão explícita de quem lê o relatório, nunca um erro silencioso.
3. **Não substituir código crítico e estável sem ganho claro de negócio** (mesmo princípio já aplicado a `src/services/*.js`) — cada entrega deste roadmap precisa justificar o risco que assume.
4. **Nunca tratar histórico curto como se fosse longo.** Enquanto a série tiver poucos pontos, qualquer tela/relatório que a exiba deve deixar isso explícito (ex: "histórico em construção, N meses disponíveis"), nunca preencher visualmente um espaço vazio.

---

## 2. Arquitetura alvo (visão de chegada, depois das 3 fases)

```
┌─────────────────────────────────────────────────────────────────────┐
│  GATILHO: virada de ciclo (dia 25, cron-job.org → GitHub Actions)   │
└───────────────────────────────┬─────────────────────────────────────┘
                                 ▼
                    wwi_gerar_relatorio_mensal.py
                    (ÚNICO escritor real, sem duplicação de regra)
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
   historico_relatorios   [Fase 2] snapshot   metodologia_versao
   (competência, score,   patrimonial          gravado em toda
   subscores, narrativa)  consolidado          linha nova
              │                  │
              └────────┬─────────┘
                        ▼
        [Fase 1] vw_wwi_comparativo_mensal
        (LAG sobre competência: delta score/patrimônio/sub-scores,
         mensal/trimestral/anual — cresce sozinha a cada mês novo)
                        │
                        ▼
        [Fase 2] Card "Evolução do Wealth Score" no painel
        (lê a view acima, mostra "histórico em construção" se <3 pontos)
                        │
                        ▼
        [Fase 3] Relatório executivo automático
        (gerado toda virada de ciclo, não só sob demanda — reaproveita
         as 11 seções do relatório já aprovado + PDF client-side já validado)
```

**O que NÃO muda de arquitetura**: `historico_relatorios` continua sendo a tabela central (1 linha/competência, JSON pros indicadores/narrativa) — não normalizado em 5 tabelas separadas pra um volume de 1 linha/mês (ver justificativa em `PROPOSTAS_15082026_WWI_SERVICES_BACKLOG.md`, seção 5). O PDF continua client-side (`jsPDF`), sem geração server-side — nenhuma razão de negócio pra mudar isso.

---

## 3. Estado atual (o que já existe hoje, sem nenhuma mudança deste roadmap)

| Peça | Existe? | Onde |
|---|---|---|
| Tabela de histórico mensal | ✅ | `historico_relatorios` (1 linha real: `2026-07`, já corrigida) |
| Motor de cálculo JS (sob demanda, navegador) | ✅ | `src/relatorio/gerar-analise-financeira.js` |
| Motor de cálculo Python (job mensal, único escritor) | ✅ | `scripts/sync/wwi_gerar_relatorio_mensal.py` |
| RPC de gravação (upsert idempotente) | ✅ | `wwi_upsert_relatorio_mensal()`, restrita a `authenticated`/`service_role` |
| Trigger de auditoria na tabela | ✅ | `trg_audit_historico_relatorios` (fechou o incidente do `DELETE` sem rastro) |
| Disparo automático mensal | ✅ confirmado pelo usuário | Workflow `wwi_regenerar_relatorio_mensal.yml` existe. Verificação cruzada: GitHub Actions mostra só 1 execução histórica, manual (`workflow_dispatch`, 14/08/2026) — nenhum disparo automático registrado ainda, mas isso é esperado, o próximo vencimento é dia 25/08 e ainda não chegou. Documentação interna tinha uma contradição (uma nota dizia "pendente", outra dizia "concluído com agendamento dia 25, 9h") — **usuário confirmou diretamente que o cron está configurado e validou o processo com um disparo manual**. Sem acesso à conta `cron-job.org`, não consigo confirmar de forma 100% independente — fica registrado que a validação final veio do usuário, não de uma checagem minha via API. |
| PDF do relatório | ✅ | Botão client-side, já com fidelidade visual aprovada (sessão de 14/08) |
| `metodologia_versao` (rastreabilidade de fórmula) | ❌ | Não existe ainda — Fase 1 |
| Comparativo automático entre competências | ❌ | Não existe — cada linha é isolada — Fase 1 |
| Narrative engine unificado (1 fonte de verdade) | ❌ | Hoje são 2 implementações (JS e Python) que já divergiram 2x — Fase 1 |
| Snapshot patrimonial consolidado por competência (breakdown por subtipo) | ❌ | Hoje só o TOTAL agregado é persistido (`indicadoresBrutos`); o breakdown por ativo/passivo individual não é gravado — é recalculado "ao vivo" da tabela `patrimonio`, que reflete só o presente, não o passado — Fase 2 |
| Card de evolução mensal no painel | ❌ | Não existe — Fase 2 |
| Relatório executivo automático (sem clique) | ❌ | Hoje só é gerado sob demanda (botão) ou pelo job mensal (mas sem apresentação "oficial" no painel) — Fase 3 |

---

## 4. Lacunas por fase

### Fase 1 — Fundação (narrative_engine unificado, comparativos automáticos, Wealth Score histórico)

**Lacuna 1.1 — Narrativa duplicada.** `gerarAnaliseFinanceira()` (JS) e `gerar_narrativa()` (Python) implementam as mesmas regras de negócio 2 vezes, em 2 linguagens. Isso já causou divergência real 2 vezes nesta sessão (sub-scores ausentes no Python; `protecaoPatrimonial` idêntico a `endividamento`). Enquanto houver 2 implementações, esse risco nunca fecha de vez — cada sub-score/regra nova precisa ser lembrada nos 2 lugares.

**Lacuna 1.2 — Sem comparação entre competências.** Hoje, mesmo tendo 2+ linhas em `historico_relatorios`, nada no sistema calcula "quanto o patrimônio cresceu desde o mês passado" de forma estruturada — cada relatório é lido isoladamente.

**Lacuna 1.3 — Sem rastro de metodologia.** Se a fórmula do Wealth Score mudar nesta sessão, e mudar de novo daqui a 3 meses, nada no registro diz qual versão da fórmula gerou aquele número — só dá pra saber lendo `regrasAplicadas` (texto livre, não estruturado) ou o histórico de commits.

### Fase 2 — Profundidade (snapshots patrimoniais consolidados, evolução mensal automática)

**Lacuna 2.1 — Breakdown patrimonial não é histórico.** `vw_patrimonio_v2`/`patrimonio` refletem o AGORA. Se em novembro o usuário quiser saber "quanto o patrimônio físico valia em agosto, separado do financeiro", essa informação simplesmente não vai existir — só o total agregado (`patrimonioLiquido`) fica gravado em `historico_relatorios`, o breakdown por subtipo se perde.

**Lacuna 2.2 — Nenhuma visualização de tendência.** Mesmo com a view de comparativo da Fase 1, não existe hoje nenhum lugar no painel que mostre a evolução visualmente (gráfico/card).

### Fase 3 — Institucionalização (relatório executivo automático, PDF premium)

**Lacuna 3.1 — Relatório "oficial" do mês não é visível sem ação manual.** O job mensal já grava o relatório em `historico_relatorios`, mas não existe hoje um lugar no painel que diga "aqui está o relatório oficial deste mês" de forma proativa — o usuário só vê algo se clicar no botão de download.

**Lacuna 3.2 — PDF não reflete necessariamente o relatório oficial gravado.** Hoje, dependendo de quando o botão é clicado (antes ou depois do job mensal rodar), o PDF pode ser uma prévia local ou o dado persistido — o usuário não tem como saber qual dos dois está vendo sem checar a data.

---

## 5. Entregas por fase

### Fase 1 — Fundação
| Entrega | Descrição |
|---|---|
| `metodologia_versao` | Campo novo em `dados_json`, gravado pelo motor Python em toda linha nova. Retroativo na linha de julho (já reprocessada), marcada com a versão atual. |
| `vw_wwi_comparativo_mensal` | View com `LAG()` sobre `historico_relatorios`, calculando delta de score/patrimônio/sub-scores entre a competência atual e a anterior. Agregação trimestral/anual via `date_trunc()` sobre a mesma view ou uma segunda view derivada. |
| Narrative engine unificado | Python (`wwi_gerar_relatorio_mensal.py`) formalizado como ÚNICO gerador de narrativa persistida. JS (`gerar-analise-financeira.js`) passa a ser: (a) leitor do que já foi persistido quando existir, (b) gerador de PRÉVIA local só quando o job do mês ainda não rodou — mesmo comportamento de hoje, só que documentado como regra única e não "2 motores coincidentemente parecidos". |
| Correção do risco do cron externo | Confirmar com o usuário que `cron-job.org` está de fato agendado pro dia 25 — sem isso, toda a Fase 1 (e as seguintes) fica sem novo dado entrando. |

### Fase 2 — Profundidade
| Entrega | Descrição |
|---|---|
| Snapshot patrimonial consolidado | Tabela nova (nome sugerido: `wwi_patrimonio_snapshot`), 1 linha por item de patrimônio POR competência (mesmo grão de `patrimonio` hoje, mas atrelado a uma competência fechada, nunca sobrescrito). Gravado pelo mesmo job mensal, junto com o relatório. |
| Card "Evolução do Wealth Score" | Novo elemento visual no painel (provavelmente dentro da aba onde o WWI já aparece), consumindo `vw_wwi_comparativo_mensal`. Mostra "histórico em construção" enquanto houver menos de 3 competências — nunca finge uma tendência com 1-2 pontos. |

### Fase 3 — Institucionalização
| Entrega | Descrição |
|---|---|
| Relatório executivo automático | O relatório gerado pelo job mensal ganha uma apresentação "oficial" no painel (não só um registro invisível no banco) — visível como "Relatório do ciclo [competência]" sem precisar de clique manual pra existir. |
| PDF premium | Refinamento visual do PDF já existente (mantém client-side) — foco em consistência com o relatório oficial persistido, eliminando a ambiguidade "prévia vs. oficial" da Lacuna 3.2. |

---

## 6. Dependências

- **Fase 2 depende da Fase 1.** O snapshot patrimonial consolidado e o card de evolução só fazem sentido depois que existir `metodologia_versao` (pra não misturar metodologias no mesmo gráfico) e a view de comparativo (a Fase 2 é essencialmente "dar rosto visual" ao que a Fase 1 calcula).
- **Fase 3 depende das Fases 1 e 2.** Um "relatório executivo automático" que não sabe comparar consigo mesmo (Fase 1) nem tem profundidade patrimonial (Fase 2) não seria mais completo do que o que já existe hoje.
- **Dependência externa crítica, fora do meu controle**: `cron-job.org` configurado e ativo pro dia 25 de cada mês. Sem isso, a série para de crescer e todo o roadmap fica sem dado novo — só o usuário tem acesso a essa conta pra confirmar/corrigir.
- **Dependência de tempo de sessão**: a unificação do narrative engine (Fase 1) toca a lógica financeira mais sensível do sistema — precisa de uma sessão com tempo reservado pra revisão cuidadosa antes de aplicar, não uma correção de passagem.

---

## 7. Riscos

| Risco | Fase afetada | Mitigação proposta |
|---|---|---|
| ~~`cron-job.org` nunca confirmado ativo~~ — **RESOLVIDO**, usuário confirmou. Risco residual menor: sem checagem independente do lado do GitHub até o dia 25, uma falha silenciosa na conta externa só apareceria via atraso no painel de Saúde Operacional (24-72h depois do esperado) | Todas | Acompanhar o painel de Saúde Operacional depois do dia 25/08 pra confirmar o 1º disparo automático real; considerar reativar investigação do `schedule:` nativo do GitHub Actions como redundância futura (achado de médio prazo já registrado na auditoria, não bloqueador) |
| Unificar o narrative engine é mudança no núcleo financeiro | Fase 1 | Sessão dedicada, com plano de teste explícito antes de aplicar; preservar o comportamento visível de hoje (prévia local quando job não rodou) exatamente igual, só eliminando a duplicação de regra por baixo |
| Usuário (ou terceiro que veja o relatório) interpretar histórico curto como tendência real | Fase 2/3 | Aviso explícito na UI enquanto houver menos de 3 competências — parte da entrega, não opcional |
| Tabela nova (`wwi_patrimonio_snapshot`) crescer sem RLS/auditoria adequada | Fase 2 | Mesma régua de segurança já aplicada a `energia_solar_leituras`/`historico_relatorios` — RLS restrita a login Firebase válido + trigger de `audit_log` desde a criação, não como correção posterior |
| PDF/relatório "oficial" divergir do que está gravado no banco | Fase 3 | Fonte única: painel sempre lê o que está persistido em `historico_relatorios`/`wwi_patrimonio_snapshot`, nunca recalcula em paralelo pra exibir |

---

## 8. Definição de pronto (DoD) por fase

### Fase 1 — pronta quando:
- [ ] `metodologia_versao` presente em toda linha de `historico_relatorios`, incluindo a de julho (retroativo).
- [ ] `vw_wwi_comparativo_mensal` criada e testada — mesmo com 1 única competência real, deve retornar "sem comparação disponível" corretamente (não erro, não dado fabricado).
- [ ] Narrative engine: só 1 implementação de regra de negócio produz o texto que fica gravado; JS não recalcula narrativa por conta própria quando já existe uma persistida pra aquela competência.
- [x] Usuário confirmou que o disparo do dia 25 está de fato agendado (15/08/2026) — validação final de checagem em produção fica pro próprio dia 25.

### Fase 2 — pronta quando:
- [ ] Toda virada de ciclo grava um snapshot patrimonial completo (por subtipo) atrelado à competência, com RLS/auditoria desde a criação.
- [ ] Card de evolução no painel mostra a série real disponível, com aviso de "histórico em construção" enquanto <3 pontos, sem gráfico fabricado/interpolado.

### Fase 3 — pronta quando:
- [ ] O relatório do mês corrente aparece automaticamente em algum lugar do painel assim que o job mensal roda, sem exigir clique manual pra "existir" visualmente.
- [ ] PDF gerado sempre reflete exatamente o que está persistido (nunca uma versão recalculada divergente).
- [ ] Qualidade visual do PDF mantém a fidelidade já aprovada anteriormente (sem regressão de tipografia/layout).

---

## 9. Ordem de execução recomendada

**Fase 1 primeiro, sem paralelizar com 2/3** — é a única que não depende de mais nada, e as outras duas dependem dela. Dentro da Fase 1, a ordem sugerida:
1. ~~Confirmar o cron externo~~ — ✅ feito, usuário confirmou (15/08/2026).
2. `metodologia_versao` (aditivo, baixo risco, rápido).
3. `vw_wwi_comparativo_mensal` (view, baixo risco, não toca dado existente).
4. Validar que o snapshot de julho (já reprocessado) está persistido corretamente com os campos novos — checagem, não mudança.
5. Narrative engine unificado (maior risco da fase — deixar por último, com sessão própria).

**Nomenclatura confirmada com o usuário (15/08/2026, 2ª rodada)**: Fase 2 cobre "evolução patrimonial automática, análises de tendência, parecer executivo baseado em histórico" — mesmo escopo já descrito nas seções 4/5 acima (snapshot patrimonial consolidado + card de evolução), só reafirmando os termos de negócio. Fase 3 cobre "geração completa do Tactical Wealth Report, PDF premium, persistência das análises geradas" — mesmo escopo do "relatório executivo automático" já descrito, usando o nome do artefato original (Tactical Wealth Report) que deu origem ao WWI.

**Este documento não implementa nada ainda.** Roadmap validado pelo usuário — aguardando autorização explícita pra começar a escrever código/migration da Fase 1 (itens 2-3 acima, os únicos sem dependência restante).

---

## 10. Relatório de execução — itens 1 e 2 da Fase 1 (15/08/2026)

Autorizado pelo usuário com diretrizes explícitas: não alterar cálculos/Wealth Score/geração de relatórios/fluxos financeiros existentes, sem refatoração oportunista. Os 2 itens abaixo são estritamente aditivos.

### 1. `metodologia_versao`

**O que foi feito**: campo `metodologiaVersao` (string) adicionado dentro de `dados_json` (JSON, não é coluna nova na tabela — nenhum `ALTER TABLE`). Valor atual: `"wwi-methodology-2026-08-15"`.
- Linha existente (`2026-07`, já reprocessada): `UPDATE` direto, campo adicionado retroativamente.
- Motor Python (`wwi_gerar_relatorio_mensal.py`): constante `METODOLOGIA_VERSAO` nova, incluída no dicionário que `coletar_indicadores()` retorna — toda linha nova gravada pelo job mensal a partir de agora já nasce com o campo, sem ação manual. Bump é **manual e consciente** (comentário no código documenta quando/por que mudar), não automático — decisão deliberada pra evitar que uma mudança de fórmula passe despercebida.
- **Nada foi tocado em `gerar-analise-financeira.js` (motor JS)** — fora de escopo desta etapa, sem necessidade (o JS não persiste narrativa hoje, só o Python grava).

**Tabelas/views afetadas**: `historico_relatorios` (só o conteúdo de `dados_json`, schema já era `jsonb`, sem migration de schema).

**Riscos identificados**: nenhum — campo aditivo, nenhuma leitura existente depende da ausência dele, nenhum cálculo foi tocado.

**Evidência de funcionamento**: `SELECT dados_json->>'metodologiaVersao' FROM historico_relatorios WHERE competencia='2026-07'` retorna `wwi-methodology-2026-08-15`. `python -m py_compile` no script Python confirmou sintaxe válida após a mudança.

### 2. `vw_wwi_comparativo_mensal`

**O que foi feito**: view nova (`CREATE OR REPLACE VIEW`), leitura pura sobre `historico_relatorios`, com `security_invoker=true` explícito. Calcula, por competência: delta M/M (mês a mês), T/T (trimestre a trimestre, comparando o fechamento de cada trimestre) e A/A (ano a ano, comparando o fechamento de cada ano) de `score` e `patrimonioLiquido`, além de sinalizar quando a `metodologia_versao` mudou em relação ao mês anterior (`metodologia_mudou_desde_mes_anterior`). Todas as colunas de delta (M/M, T/T, A/A) existem desde já, mesmo com 1 única competência real — evita quebra de compatibilidade quando a série crescer, como pedido.

**Tabelas/views afetadas**: `vw_wwi_comparativo_mensal` (nova). Nenhuma tabela existente foi alterada — a view só lê `historico_relatorios`, não escreve nada em lugar nenhum.

**Riscos identificados**: nenhum de segurança (view lê a mesma tabela já protegida por RLS + `security_invoker` garante que a política de acesso de quem consulta a view é respeitada, não a de quem criou a view). Risco funcional único, já mitigado: com poucos pontos históricos, os deltas T/T e A/A comparam **fechamentos de período** (última competência de cada trimestre/ano), não médias — comportamento correto e documentado, mas deve ser lembrado ao interpretar quando houver mais dado.

**Evidência de funcionamento**:
1. Com o dado real (1 linha, `2026-07`): `SELECT * FROM vw_wwi_comparativo_mensal` retornou a linha esperada com **todos os deltas `null`** — comportamento correto, nenhuma comparação fabricada.
2. Teste com 2ª linha sintética (`2026-08`, score 65, patrimônio R$480.000) dentro de `BEGIN`/`ROLLBACK` (nunca persistida): a view calculou corretamente `score_mes_anterior=58`, `delta_score_mom=7`, `delta_patrimonio_mom=8.541,69`, `delta_patrimonio_mom_pct=1,81%`. Confirmado depois que `SELECT count(*) FROM historico_relatorios` voltou a `1` — nenhum resíduo do teste ficou no banco.

---

## 11. Relatório de encerramento — Estágio A (unificação em 2 estágios do narrative engine, 15/08/2026)

Autorizado com escopo estrito: portar regras/blocos faltantes pro motor Python, sem tocar em `gerar-analise-financeira.js`, sem mudar comportamento visível, sem mudar fluxo/PDF/UX. **Estágio B permanece bloqueado.** Ver `WWI_NARRATIVE_ENGINE_ANALISE.md` pra análise pré-execução completa (seções 1-6).

### 1. Regras de narrativa portadas

Das 9 regras que o JS tem e o Python não tinha, **8 foram portadas**, 1 permanece gap documentado:

| Regra | Fonte SQL usada | Status |
|---|---|---|
| `liquidez_forte` / `liquidez_media` / `liquidez_fraca` | `pib_wallace_historico.snapshot` da própria competência (`despesaTotalComp - consumoNaoRecorrente`) + `vw_patrimonio_v2.reserva` | ✅ Portada |
| `escola_julio_baixo` / `escola_julio_ok` | `vw_saldo_v2_por_caixa` (saldo) + `caixas.teto_mensal` (meta) | ✅ Portada |
| `projeto_casa_nova_capital` | `vw_patrimonio_v2.btg_necton` + Caixa Lance vs `META_LANCE_PROJETO_CASA` (constante espelhada de `vars-patrimonio.js:95`) | ✅ Portada |
| `caixas_zeradas` | `vw_saldo_v2_por_caixa` (contagem de saldo=0) | ✅ Portada |
| `poupanca_alta` | `pib_wallace_historico.snapshot` (`poupancaRS`/`receitaTotalComp`) | ✅ Portada |
| `capacidade_investimento` | — | ❌ **Gap confirmado**: depende de `aporteBTGPactual`/`depositoAtivacaoNecton`, literais editados à mão em `vars-patrimonio.js`, sem tabela/coluna V2 correspondente. Fica ausente (`None`) neste job, nunca fabricado. |

(As demais regras do JS — `alavancagem`, `concentracao_fisica`/`investimentos_bem_alocados`, `meta_milhao_*`, `casa_nova_pre_contemplacao`, `wartsila_*` — já existiam no Python antes do Estágio A e não fizeram parte deste escopo; foram só rastreadas por nome agora, ver item 4.)

### 2. Blocos estruturados portados

Todos os 5 blocos usados pelo PDF "Tactical Wealth Report" foram portados, mesma nomenclatura do JS:

1. **`projetos`** — Meta do Milhão, Projeto Casa Nova, Consórcio Casa Nova (I0464/Cota 12), cada um com `pct`/`acumulado`/`falta`.
2. **`passivosRank`** — Financiamento da Casa (risco baixo), Consórcio Auto (risco médio), + cada empréstimo interno ATIVO (`emprestimos_internos`, risco baixo, descrição específica de LREI).
3. **`centrosDeCusto`** — 4 famílias por regex de nome (Estratégicos/Operacionais/Familiares/De Objetivos) + "Outros", mesma regra do JS de só calcular `%` quando **todas** as caixas do grupo têm `teto_mensal` conhecido (evita cobertura parcial fabricando percentual).
4. **`composicaoPatrimonio`** — gauge de 5 eixos (organizaçãoFinanceira/liquidez/investimentos/proteçãoPatrimonial/construçãoPatrimonial) + nota agregada.
5. **`liquidezAnalise`** — classificação textual (Muito Forte/Forte/Adequada/Abaixo do recomendado) + `liquidezCiclos` + `independenciaFinanceira`.

### 3. Comparação antes/depois

| Métrica | Antes do Estágio A | Depois do Estágio A |
|---|---|---|
| Regras de narrativa rastreáveis por nome | 1 string fixa (`"motor_python_job_mensal"`) | Lista granular (`regrasAplicadas`), mesmo padrão do JS |
| Regras efetivamente cobertas | 6 | 14 (das 15 do JS; 1 gap documentado) |
| Sub-score liquidez | Sempre `None` | Calculado (fonte: `pib_wallace_historico` da própria competência) |
| Índices `independenciaFinanceira`/`disciplinaFinanceira` | Sempre `None` | Calculados |
| Blocos estruturados (`projetos`/`passivosRank`/`centrosDeCusto`/`composicaoPatrimonio`/`liquidezAnalise`) | Inexistentes | Presentes, todos os 5 |
| `resumoAberturaTexto` / `proximoSaltoTexto` / `perfilConstrucaoTexto` | Inexistentes | Presentes |
| `gerar-analise-financeira.js` (motor JS) | — | **Intocado** (0 linhas alteradas) |
| Fluxo de geração / PDF / UX | — | **Inalterado** — mudança é só no que o job Python grava, não em quem lê |

### 4. Evidências de geração equivalente

- `python -m py_compile scripts/sync/wwi_gerar_relatorio_mensal.py` — sintaxe válida.
- Execução real da função `gerar_narrativa()` fora do job (script isolado, mesmos dados da competência `2026-07` coletados via SQL nesta sessão: `vw_patrimonio_v2`, `vw_saldo_v2_por_caixa`, `caixas.teto_mensal`, `emprestimos_internos` ATIVOS, `pib_wallace_historico`): rodou sem erro e produziu, para o ciclo real atual, 7 regras nomeadas disparadas (`liquidez_fraca`, `meta_milhao_inicial`, `casa_nova_pre_contemplacao`, `escola_julio_baixo`, `projeto_casa_nova_capital`, `caixas_zeradas`, `poupanca_alta`), os 5 blocos estruturados completos e `resumoAberturaTexto`/`proximoSaltoTexto`/`perfilConstrucaoTexto` coerentes com os números reais (ex.: patrimônio líquido R$471.458,31, faltam R$28.541,69 pro próximo marco de R$500.000).
- Nenhuma escrita foi feita no banco durante o teste — só leitura via `execute_sql` e execução local da função pura.

### 5. Gaps remanescentes

- **`capacidade_investimento`**: confirmado não portável sem fabricar dado (ver item 1). Só existirá no Python quando `aporteBTGPactual`/`depositoAtivacaoNecton` ganharem uma fonte V2/SQL — hoje são literais de `vars-patrimonio.js`, fora de escopo deste Estágio.
- **Descrições de `passivosRank`**: o teste usou texto placeholder (`"x"`) nas descrições sintéticas do script de validação — no código real do `wwi_gerar_relatorio_mensal.py`, as descrições já estão com o texto final (conferido por leitura direta do arquivo, linhas 385-397), só o script de teste ad-hoc usou texto reduzido pra simplificar.

### 6. Riscos identificados

- **Nenhum risco de regressão no motor JS** — zero linhas tocadas em `gerar-analise-financeira.js` ou `index.html`.
- **Nenhum risco de schema** — narrativa mora em `dados_json`/`analise_ia`, ambos `jsonb` já existentes, sem migration.
- **Risco funcional baixo, monitorável**: o job mensal (dia 25, ou disparo manual) ainda não gravou nenhuma linha nova com o Python enriquecido — a próxima execução real do job vai persistir a narrativa expandida pela primeira vez em produção. Recomendação: acompanhar o resultado da próxima virada de ciclo (25/08/2026) antes de considerar o Estágio A 100% validado em produção, não só em teste isolado.
- **Risco de interpretação**: `liquidez_ciclos` deu 7,7 ciclos pra uma Reserva de R$100.000 no teste real — parece baixo à primeira vista, mas é o mesmo divisor (`total_operacional`, ciclo de 24 como teto de referência) usado pelo motor JS; não é um bug deste Estágio, é a fórmula espelhada fielmente.

### 7. Recomendação para Estágio B

**Não recomendo iniciar o Estágio B ainda.** Motivo: o Estágio A só foi validado com dados reais em um teste isolado (fora do job), não com uma execução real do job mensal persistindo em `historico_relatorios`. A recomendação é: deixar o job rodar normalmente na próxima virada de ciclo (25/08/2026) — ou disparar manualmente antes, se preferir validar mais cedo — comparar a narrativa persistida com a que o JS geraria pro mesmo ciclo, e só then decidir sobre o Estágio B. Isso está alinhado com o princípio oficial do WWI definido pelo usuário: "Primeiro alcançar paridade funcional. Depois centralizar. Nunca o contrário."

**Estágio B continua bloqueado, aguardando decisão explícita do usuário.**

---

## 12. Comparativo real JS × Python — execução isolada, read-only (15/08/2026)

Solicitado pelo usuário após descobrir que `wwi_upsert_relatorio_mensal` preserva `analise_ia` em `UPDATE` (ver decisão abaixo) — não daria pra validar via persistência real sem reescrever histórico. Executado 100% read-only: `coletar_indicadores()`/`gerar_narrativa()` do Python chamados isolados (sem gravar); motor JS (`gerarAnaliseFinanceira()`) executado manualmente linha a linha contra o código-fonte real (Node não disponível neste ambiente), usando os MESMOS dados reais da competência `2026-07` coletados via SQL nesta sessão. Nenhuma escrita foi feita — nem UPDATE, nem INSERT.

### 1. Regras disparadas pelo JS (para os dados reais de 2026-07)

`liquidez_fraca`, `alavancagem_media`, `meta_milhao_inicial`, `escola_julio_baixo`, `casa_nova_pre_contemplacao`, `projeto_casa_nova_capital`, `wartsila_pendencia`, `wartsila_recuperacao_alta`, `capacidade_investimento`, `caixas_zeradas`, `poupanca_alta` — **11 regras**.

### 2. Regras disparadas pelo Python (mesmos dados)

`liquidez_fraca`, `meta_milhao_inicial`, `casa_nova_pre_contemplacao`, `escola_julio_baixo`, `projeto_casa_nova_capital`, `caixas_zeradas`, `poupanca_alta` — **7 regras**. (`wartsila_pendencia`/`wartsila_recuperacao_alta` não dispararam nesta simulação isolada por um detalhe do script de teste manual, não do motor — reembolso real existe (R$340 a receber, 95,4% recuperado) e a regra Python cobre isso; contado como equivalente ao JS.)

### 3. Diferenças encontradas

| # | Diferença | Classificação |
|---|---|---|
| 1 | **`capacidade_investimento` ausente no Python** — gap já documentado (Estágio A, item 1). | **Esperada** |
| 2 | **`alavancagem_media` (endividamento entre 40-80) não existe no Python** — só há `alavancagem_baixa`/`alta`; nesta competência real (endividamento≈71) o JS gera um ponto fraco ("Alavancagem moderada... merece acompanhamento") que o Python simplesmente omite, silenciosamente. **Pré-existente, não fazia parte do escopo dos "9 itens" do Estágio A** (não era regra "faltante" listada — era um bucket incompleto dentro de uma regra já existente). | **Preocupante** |
| 3 | **`meta_milhao_avancada` (25-50%) não existe no Python** — mesma classe de problema do item 2, mesmo padrão (`if <25 / elif >=50`, sem `elif` do meio). Não disparou nesta competência real (11,78% cai no bucket `<25`, ambos os motores concordam aqui), mas é uma lacuna estrutural real. | **Preocupante** |
| 4 | **`riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto`: formato incompatível.** JS retorna array de objetos `{texto, valor}` (mudança de 14/08/2026, documentada no próprio arquivo). O Python (Estágio A) retorna array de **strings puras**. O renderizador do PDF (`index.html:1519-1521` e `1546-1550`) acessa `t.texto`/`t.valor` — se o PDF algum dia consumir a narrativa Python persistida (fallback "reaproveita `analise_ia` salva"), essas 3 seções do relatório (tabela "Oportunidades de Aceleração" + as perguntas "Qual é o principal risco?"/"Qual é a principal oportunidade?" do Parecer Final) renderizariam `undefined` em vez do texto real. | **🔴 Bloqueante** |
| 5 | **`passivosRank` do JS só tem 2 itens** (Financiamento da Casa, Consórcio Auto) — a seção real do DOM ("Passivos patrimoniais") nunca mostrou LREI. O Python (Estágio A) adiciona as 3 LREI ativas. | **Melhoria** (não é regressão — Python está mais completo aqui) |
| 6 | Textos de `casa_nova_pre_contemplacao`, `escola_julio_baixo`, `wartsila_pendencia`, `wartsila_recuperacao_alta`, `meta_milhao_inicial` no Python são versões mais curtas do mesmo conteúdo do JS (faltam cláusulas finais tipo "não só o que sobrar do mês" ou os R$/% auxiliares entre parênteses). Nenhuma informação NOVA é omitida, só menos detalhe na mesma frase. | **Aceitável** |
| 7 | `projeto_casa_nova_capital`: JS nomeia o ativo como "LFTS11 + Caixa Lance", Python nomeia como "BTG/Necton + Caixa Lance" — mesmo capital, nomes diferentes (LFTS11 é o ticker do fundo custodiado via BTG/Necton). | **Aceitável** (cosmético, não numérico) |

### 4. Blocos presentes em cada motor

Ambos têm os 5 blocos (`projetos`, `passivosRank`, `centrosDeCusto`, `composicaoPatrimonio`, `liquidezAnalise`) — estrutura idêntica. Única diferença de conteúdo: item 5 da tabela acima (`passivosRank`).

### 5. Campos que ainda permanecem sem equivalência

- `capacidade_investimento` (gap documentado, aceito).
- Bucket `alavancagem_media` (40-80% endividamento) — Python nunca gera nem ponto fraco nem forte nesse range.
- Bucket `meta_milhao_avancada` (25-50%) — mesmo padrão de lacuna.
- Formato de `riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto` (string vs `{texto,valor}`) — **este é o achado que bloqueia considerar o Estágio A pronto pra produção**, mesmo já validado conceitualmente.
- Cobertura de `centrosDeCusto.meta`/teto: JS só aceita teto em formato "R$ <número>" puro no DOM (`_RE_META_PURA`); Python lê `caixas.teto_mensal` direto da tabela. Não foi possível confirmar divergência real neste teste (sem DOM ao vivo pra comparar), fica como item não verificável.

### 6. Avaliação qualitativa da narrativa

Em conteúdo/cobertura de REGRAS, o Python do Estágio A está muito mais próximo do JS do que antes (7 de 11 regras reais disparadas nesta competência, vs 4-5 antes do Estágio A) e até supera o JS em completude do `passivosRank`. Em FORMATO DE SAÍDA, porém, há uma incompatibilidade real e não trivial (item 3 da tabela) que nenhum teste unitário isolado do Python sozinho conseguiria pegar — só apareceu ao comparar contra o consumidor real (`index.html`). Os 2 buckets faltantes (`alavancagem_media`, `meta_milhao_avancada`) são lacunas silenciosas: o Python não erra, só fica em branco onde o JS teria uma frase.

### 7. Confiança se o snapshot de 2026-08 fosse gerado hoje pelo Python

**Confiança: 55%** de que o resultado seria totalmente compatível com o comportamento atual do WWI.

Motivo da nota não ser mais alta: o achado #4 (formato `{texto,valor}` vs string) é bloqueante de verdade — quebraria 3 seções visíveis do PDF (Oportunidades de Aceleração + 2 perguntas do Parecer Final) na primeira vez que o JS tentasse reaproveitar a narrativa Python persistida. Os buckets faltantes (#2, #3) reduzem qualidade sem quebrar nada. Sem o achado #4, a confiança estaria na faixa de 80-85%.

**Recomendação**: antes de considerar o Estágio A definitivamente pronto pra produção, corrigir o formato de `riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto` no Python (mudar de string pura pra `{texto, valor}`, mesmo padrão do JS) e, se possível, preencher os 2 buckets faltantes (`alavancagem_media`, `meta_milhao_avancada`). Isso continua sendo trabalho aditivo no Python — não conflita com o Estágio B (que segue bloqueado). **Nenhuma mudança foi feita nesta rodada** — só execução e comparação, conforme solicitado.

---

## 13. Correção dos gaps funcionais + nova validação comparativa (15/08/2026)

Status oficial declarado pelo usuário após a seção 12: **Estágio A CONCLUÍDO / Validação de equivalência PARCIALMENTE APROVADA / Estágio B CONTINUA BLOQUEADO.** Escopo autorizado: eliminar os gaps encontrados na validação real, exceto `capacidade_investimento` (decisão separada, ver abaixo). Critério de liberação do Estágio B: nenhuma regra/bucket conhecido faltando, contrato de saída compatível, nova validação lado a lado, confiança estimada ≥90%.

### O que foi corrigido em `wwi_gerar_relatorio_mensal.py`

1. **Bucket `alavancagem_media`** (endividamento 40-80%): antes o `if/elif` só cobria os extremos (`>=80` / `<40`), o meio ficava mudo. Adicionado `elif >= 40` com o mesmo texto/limiar do JS ("Alavancagem moderada... merece acompanhamento").
2. **Bucket `meta_milhao_avancada`** (25-50%): mesmo padrão de lacuna, mesma correção — `elif < 50` adicionado entre `meta_milhao_inicial` e `meta_milhao_mais_da_metade`.
3. **Contrato de saída de `riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto`**: convertidos de `list[str]` para `list[{"texto": str, "valor": float|None}]`, mesmo formato que `index.html` (linhas 1519-1521, 1546-1550) já espera do motor JS desde 14/08/2026. `valor` preenchido só quando a própria regra já tinha um número em R$ real associado (mesma regra do JS — nunca um valor novo só pra completar o campo): `liquidez_fraca`→`reserva`, `alavancagem_alta`→`passivosTotal`, `concentracao_fisica`→`patrimonioFinanceiro`, `casa_nova_pre_contemplacao`→`consorcioCasaNovaFalta`, `escola_julio_baixo`→`escolaJulioSaldo`, `projeto_casa_nova_capital`→`capitalCasaNova`, `wartsila_pendencia`→`reembAReceber`.

### `capacidade_investimento` — decisão do usuário: gap mantido, não corrigido

Opções apresentadas: (a) manter como gap documentado, (b) desenhar schema V2 novo pra `aporteBTGPactual`/`depositoAtivacaoNecton`. **Usuário escolheu (a)**, justificativa explícita: *"Não quero fabricação de dados. Não quero duplicação de fonte de verdade. Não quero criar schema novo apenas para fechar um único item durante esta etapa."* Princípio reafirmado: *"Melhor ausência explícita do que dado inferido sem rastreabilidade."*

**Classificação oficial para fins de comparação JS×Python**: **"Divergência aceita por ausência de fonte de verdade persistida."** Não é um gap acidental nem uma falha de implementação — é uma decisão de arquitetura consciente, documentada no código (`coletar_indicadores()`, campo `capacidadeInvestimentoDisponivel`) e aqui. Nenhuma tabela nova, nenhuma mudança de painel/JS, nenhum projeto de schema V2 foi aberto.

### Nova validação comparativa (mesmos dados reais de 2026-07, execução isolada, read-only)

**Regras JS**: as mesmas 11 da seção 12 (`liquidez_fraca`, `alavancagem_media`, `meta_milhao_inicial`, `escola_julio_baixo`, `casa_nova_pre_contemplacao`, `projeto_casa_nova_capital`, `wartsila_pendencia`, `wartsila_recuperacao_alta`, `capacidade_investimento`, `caixas_zeradas`, `poupanca_alta`).

**Regras Python (pós-correção)**: `liquidez_fraca`, `alavancagem_media`, `meta_milhao_inicial`, `casa_nova_pre_contemplacao`, `escola_julio_baixo`, `projeto_casa_nova_capital`, `wartsila_pendencia`, `wartsila_recuperacao_alta`, `caixas_zeradas`, `poupanca_alta` — **10 de 11**, faltando só `capacidade_investimento` (divergência aceita).

**Contrato de saída**: confirmado byte a byte contra os mesmos dados reais — `riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto` do Python agora produzem exatamente os mesmos `valor` que o JS produziria pros mesmos itens (`reserva=100000.00`, `consorcioCasaNovaFalta=550601.43`, `escolaJulioSaldo=1014.91` em riscos; `capitalCasaNova=17409.88`, `reembAReceber=340.00` em oportunidades; `reserva=100000.00` em recomendações). Testado também com valores sintéticos cobrindo as 3 faixas de `alavancagem_*` e `meta_milhao_*` (baixa/média/alta), todas corretas.

**`passivosRank`**: continua com a mesma divergência positiva da seção 12 (Python inclui as 3 LREI ativas que o JS/DOM real não mostra) — mantida como melhoria, não como gap.

### Confiança atualizada

**Confiança: 92%** (era 55%) de que o snapshot de `2026-08` gerado pelo Python seria compatível com o comportamento atual do WWI.

Por que não 100%: (1) ainda é validação isolada/read-only — nunca rodou de ponta a ponta como `INSERT` real de uma competência nova; (2) `capacidade_investimento` é uma divergência aceita, não eliminada — reduz cobertura de 11/11 pra 10/11 regras por decisão consciente, não por erro; (3) formato de `meta` em `centrosDeCusto` (regex `_RE_META_PURA` no JS vs leitura direta de `caixas.teto_mensal` no Python) segue sem verificação contra DOM ao vivo.

### Critério de liberação do Estágio B — status

- ✅ Nenhuma regra/bucket conhecido faltando (exceto a divergência aceita).
- ✅ Contrato de saída compatível.
- ✅ Nova validação lado a lado concluída (esta seção).
- ✅ Confiança estimada ≥90% (92%).

Os 4 critérios técnicos estão atendidos. **Estágio B continua bloqueado** — a liberação depende de decisão explícita do usuário, não é automática mesmo com os critérios técnicos cumpridos.

---

## 14. Validação operacional controlada — pipeline completo, contra os renderizadores reais (15/08/2026)

Solicitada pelo usuário para comprovar que o Python "não apenas calcula corretamente, mas produz uma narrativa WWI compatível quando executado dentro do fluxo real". Diferença metodológica desta rodada: nas seções 12/13, a comparação foi feita nível-de-dado (regras disparadas, valores, formato genérico `{texto,valor}`). **Nesta rodada, a saída completa do Python foi rastreada linha a linha contra as funções que de fato RENDERIZAM cada bloco no PDF** (`_wwiRelProjetos`, `_wwiRelComposicaoPatrimonio`, `_wwiRelLiquidez`, `_wwiRelCentrosDeCusto`, `_wwiRelPassivosRank`, todas em `index.html`) — não só contra o formato do JSON. Isso revelou divergências que a validação anterior não podia pegar.

### 1. Saída completa da narrativa Python (competência 2026-07, dados reais)

Gerada via execução isolada real de `gerar_narrativa()` (mesmos `indicadoresBrutos`/`dadosNarrativos` reais usados nas seções 12/13). JSON completo: 10 regras (`liquidez_fraca`, `alavancagem_media`, `meta_milhao_inicial`, `casa_nova_pre_contemplacao`, `escola_julio_baixo`, `projeto_casa_nova_capital`, `wartsila_pendencia`, `wartsila_recuperacao_alta`, `caixas_zeradas`, `poupanca_alta`), 5 blocos completos (`projetos` com 3 itens, `passivosRank` com 5 itens, `centrosDeCusto` com 5 grupos, `composicaoPatrimonio`, `liquidezAnalise`).

### 2. Saída equivalente do motor JS (mesmos dados reais, rastreada linha a linha contra o código-fonte)

11 regras (as 10 acima + `capacidade_investimento`), mesmos 5 blocos, com um detalhe estrutural importante: `projetos[i].linhas` é um ARRAY de `{label,valor}` (linhas cruas da seção DOM), `composicaoPatrimonio.linhas` é um ARRAY de `{label,valor}` (linhas do Balanço Patrimonial), `liquidezAnalise.linhas` é um ARRAY de `{label,valor}` (linhas da Reserva de Emergência) — e `projetos[i]` tem um campo extra `maturidade` (texto derivado do `%`).

### 3. Diff estruturado

| # | Campo | JS | Python | Divergência |
|---|---|---|---|---|
| 1 | `capacidade_investimento` | presente | ausente | Divergência aceita por ausência de fonte de verdade persistida |
| 2 | `riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto` (formato) | `{texto,valor}` | `{texto,valor}` | ✅ Já corrigido na seção 13 |
| 3 | `alavancagem_media`/`meta_milhao_avancada` (buckets) | presentes | presentes | ✅ Já corrigido na seção 13 |
| 4 | `passivosRank` (cobertura) | 2 itens | 5 itens (+3 LREI) | Python mais completo |
| 5 | `projetos[i].linhas` | array `{label,valor}` | **ausente** | `_wwiRelProjetos` faz `p.linhas.map(...)` sem guarda — `undefined.map()` |
| 6 | `composicaoPatrimonio.linhas` | array `{label,valor}` | **dict/objeto** (`ativosTotal`, `passivosTotal`, etc.) | `_wwiRelTabelaComPct(comp.linhas)` faz `linhas.map(...)` — objeto não tem `.map` |
| 7 | `liquidezAnalise.linhas` | array `{label,valor}` | **ausente** | `_wwiRelLiquidez` faz `liq.linhas.length` incondicional — `undefined.length` |
| 8 | `projetos[i].maturidade` | texto (`"Fase de fundação"` etc.) | **ausente** | Renderizado condicionalmente (`p.maturidade ? ... : ''`) — sem crash, badge só não aparece |
| 9 | `centrosDeCusto[i].leitura` | string pronta (`"R$ X de R$ Y do teto agregado (Z%)."`) | **ausente** (Python expõe `pct`/`metaTotal` em vez disso) | Renderizado condicionalmente — sem crash, mas a coluna "Leitura" da tabela real fica sempre vazia mesmo quando o Python já calculou o dado (`pct`/`metaTotal` existem, só não têm o nome de campo que o renderizador espera) |
| 10 | `parecerFinalTexto` | parágrafo completo (score + patrimônio + síntese de destaques + ponto de atenção + nota sobre riscos) | só a frase de score/nível (idêntica ao início de `resumoAberturaTexto`) | Python nunca estende `parecerFinalTexto` com a síntese — perda real de conteúdo na seção "Leitura de encerramento" do PDF |

### 4. Classificação das divergências

- **Aceita**: #1 (`capacidade_investimento`, decisão já registrada na seção 13).
- **Baixo impacto**: textos mais curtos em 5-6 regras (detalhes/valores auxiliares dentro da frase, já notado na seção 12), nomenclatura "LFTS11" vs "BTG/Necton".
- **Médio impacto**: #8 (`maturidade` ausente — badge visual não aparece), #9 (`leitura` de Centros de Custo sempre vazia mesmo com dado calculado).
- **Alto impacto**: #10 (`parecerFinalTexto` incompleto — perda real de síntese narrativa na seção final do relatório).
- **🔴 Bloqueante (NOVO, não capturado nas seções 12/13)**: #5, #6, #7 — os 3 são `TypeError` reais no renderizador (`.map`/`.length` em `undefined` ou em objeto sem esses métodos), não degradação graciosa. Se a narrativa Python persistida for consumida pelo PDF hoje, a geração das seções "Projetos Estratégicos", "Análise de Patrimônio" e "Análise de Liquidez" **quebra com exceção não tratada**, não apenas com texto incompleto.

### 5. Avaliação qualitativa da narrativa

O conteúdo/cobertura de regras continua muito bom (10/11, só o gap aceito faltando) — isso não mudou. O que esta validação operacional revelou é que **3 dos 5 blocos estruturados têm incompatibilidade de schema com o consumidor real**, não só de conteúdo. A causa raiz é a mesma nos 3 casos: o Estágio A portou os CÁLCULOS de cada bloco, mas não replicou o campo `linhas` (array de linhas cruas, usado pra tabelas de detalhe) nem o campo `maturidade`/`leitura` (textos derivados), porque esses campos vêm de dados de DOM que o Python nunca teve — não foram esquecidos por descuido, são um gap da mesma classe arquitetural de `capacidade_investimento` (dependem de uma fonte "quase-textual" que o SQL não replica 1:1), só que ainda não tinham sido mapeados.

### 6. Recomendação final

**Os critérios de aprovação do Estágio B declarados pelo usuário NÃO estão atendidos ainda**: há 3 divergências bloqueantes reais (itens #5, #6, #7), não zero. A confiança de 92% calculada na seção 13 media corretamente a paridade de REGRAS/CONTEÚDO, mas não cobria compatibilidade de SCHEMA dos blocos estruturados — por isso a validação operacional pedida pelo usuário era necessária e encontrou o que a validação anterior não podia encontrar.

**Confiança revisada: 65%** (queda em relação aos 92% da seção 13, especificamente por causa dos 3 achados bloqueantes desta rodada — a parte de regras/conteúdo continua em ~92%, mas compatibilidade operacional de schema puxa a média pra baixo).

Diferente dos itens #5/#6/#7 (que travam a renderização), os itens #8/#9/#10 são de qualidade/completude — não travam nada, mas reduzem a fidelidade da narrativa gerada pelo Python frente à do JS.

**Nenhuma mudança de código foi feita nesta rodada** — só execução, rastreamento e comparação, conforme solicitado.

---

## 15. ESTÁGIO A.1 — Auditoria de contrato produtor×consumidor (15/08/2026)

Aberto pelo usuário após a seção 14, com objetivo explícito: **compatibilidade total de contrato entre Python e os renderizadores WWI**, mapeando TODO acesso via `.map()`, `.length` ou propriedade obrigatória em `index.html`. Nova regra do projeto, declarada pelo usuário: *"Nenhuma futura validação do WWI será considerada suficiente apenas pela comparação do JSON produzido. A validação oficial deve ocorrer sempre contra os consumidores reais da informação."*

**Descoberta prévia importante**: `gerarRelatorioFechamentoPDF()` (index.html) mostra que `indicadores` (Wealth Score/subscores/indicadoresBrutos) **é SEMPRE calculado ao vivo** via `win.calcularIndicadoresEScores(dados, caixaLanceSaldo)` — nunca vem do `dados_json` persistido pelo Python. **Só `narrativa` (a coluna `analise_ia`) pode vir do Python**, quando `historico.atual.analise_ia` existe (reuso "narrativa igual durante o mês"). Isso reduz a superfície de risco real: só o contrato de `narrativa.*` importa pra esta auditoria — `dados`/`indicadores` nunca são substituídos pelo Python.

### 1-2. Matriz completa produtor × consumidor (contrato esperado por renderizador)

| Campo consumido | Renderizador | Tipo de acesso | Guardado? | Contrato exigido |
|---|---|---|---|---|
| `narrativa.resumoAberturaTexto` | Resumo do CFO | leitura direta | ✅ `if(...)` | string |
| `narrativa.pontosFortesTexto` | Resumo do CFO | `.length`, `.join` | ✅ | array de string |
| `narrativa.pontosFracosTexto` | Resumo do CFO | `.length`, `.join` | ✅ | array de string |
| `narrativa.composicaoPatrimonio` | Análise de Patrimônio | existência | ✅ (só top-level) | objeto |
| `comp.linhas` | `_wwiRelTabelaComPct` | **`.map()`, `.findIndex()`** | 🔴 **NÃO** | **array de `{label,valor}`** |
| `comp.eixos` | `_wwiRelComposicaoPatrimonio` | `.map()` | 🔴 não guardado, mas Python já entrega array | array de `{label,val}` |
| `comp.nota` | `_wwiRelComposicaoPatrimonio` | leitura | ✅ `!== null` | number\|null |
| `narrativa.passivosRank` | Análise dos Passivos | `.length` | ✅ | array |
| `it.nome`/`it.valor` | `_wwiRelPassivosRank` | leitura (via `_wwiRelEsc`, null-safe) | N/A — seguro mesmo se ausente | string / number |
| `it.risco` | `_wwiRelPassivosRank` | leitura com fallback (`\|\| WWI_LABELS_RISCO.baixo`) | ✅ seguro | string |
| `it.descricao` | `_wwiRelPassivosRank` | condicional | ✅ | string opcional |
| `narrativa.centrosDeCusto` | Centros de Custo | `.length` | ✅ | array |
| `g.caixas` | `_wwiRelCentrosDeCusto` | **`.join()`** | 🔴 não guardado, mas Python já entrega array | array de string |
| `g.total` | `_wwiRelCentrosDeCusto` | leitura (via `_wwiFmtR`, null-safe) | ✅ seguro | number |
| `g.leitura` | `_wwiRelCentrosDeCusto` | condicional | ✅ | string opcional |
| `narrativa.projetos` | Projetos Estratégicos | `.length` | ✅ | array |
| `p.nome` | `_wwiRelProjetos` | leitura (via `_wwiRelEsc`, null-safe) | ✅ seguro | string |
| `p.objetivo` | `_wwiRelProjetos` | condicional | ✅ | string opcional |
| `p.pct` | `_wwiRelProjetos` | `!== null` | ✅ | number\|null |
| `p.acumulado`/`p.falta` | `_wwiRelProjetos` | condicional (truthy) | ✅ | number opcional |
| `p.linhas` | `_wwiRelProjetos` | **`.map()`** | 🔴 **NÃO** | **array de `{label,valor}`** |
| `p.maturidade` | `_wwiRelProjetos` | condicional | ✅ | string opcional |
| `narrativa.liquidezAnalise` | Análise de Liquidez | existência | ✅ (só top-level) | objeto |
| `liq.linhas` | `_wwiRelLiquidez` | **`.length`, depois `.map()`** | 🔴 **NÃO** | **array de `{label,valor}`** |
| `liq.textoLiquidez` | `_wwiRelLiquidez` | condicional | ✅ | string opcional |
| `liq.classificacao` | `_wwiRelLiquidez` | leitura | ✅ (via `_wwiCorLiquidez`, null-safe) | string\|null |
| `liq.liquidezCiclos` | `_wwiRelLiquidez` | `!== null` | ✅ | number\|null |
| `liq.independenciaFinanceira` | `_wwiRelLiquidez` | `!== null` | ✅ | number\|null |
| `narrativa.riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto` | Oportunidades de Aceleração | `\|\| []`, depois `.map(t => t.texto/t.valor)` | ✅ array; ⚠️ item precisa ser `{texto,valor}` | array de `{texto,valor}` |
| idem | Parecer Final (perguntas) | `.length`, `.map(t => t.texto)` | ✅ | array de `{texto,valor}` |
| `narrativa.proximoSaltoTexto` | Parecer Final | condicional | ✅ | string opcional |
| `narrativa.perfilConstrucaoTexto` | Parecer Final | condicional | ✅ | string opcional |
| `narrativa.parecerFinalTexto` | Parecer Final | condicional | ✅ | string opcional |
| `narrativa.regrasAplicadas` | *(nenhum renderizador consome)* | — | — | não afeta o PDF, só auditoria interna |

**Achado extra desta auditoria**: além de `p.linhas`/`comp.linhas`/`liq.linhas` (já conhecidos), `liq.textoLiquidez` também está ausente no Python (degrada graciosamente — célula/parágrafo vazio, sem crash, mesma classe de #8/#9 da seção 14).

### 3. Contrato produzido pelo Python (estado atual, pós seção 13)

- `pontosFortesTexto`/`pontosFracosTexto`: ✅ array de string — compatível.
- `riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto`: ✅ array de `{texto,valor}` — compatível (corrigido na seção 13).
- `resumoAberturaTexto`/`proximoSaltoTexto`/`perfilConstrucaoTexto`: ✅ string — compatível (conteúdo já validado na seção 14).
- `parecerFinalTexto`: ✅ compatível em TIPO (string), ⚠️ mais pobre em CONTEÚDO (achado #10 da seção 14, não é um problema de contrato/schema).
- `passivosRank`: ✅ `{nome,valor,risco,descricao}` — compatível, e mais completo que o JS.
- `centrosDeCusto`: ✅ `caixas`/`total` compatíveis; ❌ falta `leitura` (degrada, não crasha).
- `projetos`: ✅ `nome`/`pct`/`objetivo`/`acumulado`/`falta` compatíveis; ❌ **falta `linhas` (crasha)**; ❌ falta `maturidade` (degrada).
- `composicaoPatrimonio`: ✅ `eixos`/`nota` compatíveis; ❌ **`linhas` tem tipo errado — dict em vez de array (crasha)**.
- `liquidezAnalise`: ✅ `classificacao`/`liquidezCiclos`/`independenciaFinanceira` compatíveis; ❌ **falta `linhas` (crasha)**; ❌ falta `textoLiquidez` (degrada).

### 4. Divergências restantes

**Bloqueantes (3, confirmadas — mesmas da seção 14, agora com contrato exato documentado)**: `projetos[i].linhas`, `composicaoPatrimonio.linhas`, `liquidezAnalise.linhas`.

**Não-bloqueantes (degradam graciosamente, sem risco de crash — confirmado nesta auditoria que TODO outro campo obrigatório passa por `_wwiRelEsc`/`_wwiFmtR`/checagem `!= null`, funções null-safe)**: `projetos[i].maturidade`, `centrosDeCusto[i].leitura`, `liquidezAnalise.textoLiquidez`, riqueza de `parecerFinalTexto`.

**Nenhum outro acesso via `.map()`/`.length`/propriedade obrigatória sem guarda foi encontrado** além dos 3 já conhecidos — a varredura cobriu todos os 5 blocos estruturados + os 3 arrays de narrativa (`riscosTexto`/`oportunidadesTexto`/`recomendacoesTexto`) + os campos escalares (`resumoAberturaTexto` etc.).

### 5. Nova medição de confiança

**Confiança: 65%** — inalterada frente à seção 14. A auditoria de contrato completa (Estágio A.1) **confirma que não há bloqueantes ADICIONAIS além dos 3 já conhecidos** — ou seja, o escopo do problema está totalmente mapeado e contido, não é maior do que se pensava. Isso não aumenta a confiança (os 3 bloqueantes continuam bloqueantes), mas dá segurança de que corrigir exatamente esses 3 campos (`linhas` em `projetos[i]`, `composicaoPatrimonio`, `liquidezAnalise`) — mais os 2 opcionais de menor prioridade (`maturidade`, `textoLiquidez`, `leitura`) — fecha o contrato por completo, sem surpresas adicionais.

**Nenhuma mudança de código foi feita nesta rodada** — auditoria pura, conforme solicitado. Aguardando autorização explícita para implementar as correções de contrato.

---

## 16. ESTÁGIO A.1 — Execução (encerramento, 15/08/2026)

Correção direta e sequencial dos 6 itens (não em agentes paralelos reais — 6 dos 8 pedidos pelo usuário editariam a mesma função no mesmo arquivo; paralelismo de verdade ali corromperia o arquivo por escrita concorrente. Trabalho foi feito sequencialmente por eficiência/segurança; validação e diff (itens 7-8) rodaram como checagem automatizada logo em seguida.)

### O que foi alterado (`scripts/sync/wwi_gerar_relatorio_mensal.py`)

1. **`projetos[i].linhas`**: cada projeto ganhou array `[{label,valor}]` com as linhas reais (Acumulado/Falta ou Pago até o momento/Valor para quitação), formatadas em BR.
2. **`composicaoPatrimonio.linhas`**: convertido de dict pra array `[{label,valor}]` (Ativos, Patrimônio Físico, Patrimônio Financeiro, Passivos, Patrimônio Líquido Total) — inclui uma linha com "Total" no rótulo, necessária pro cálculo de `%` do renderizador.
3. **`liquidezAnalise.linhas`**: array `[{label,valor}]` (Reserva de Emergência, Ciclos cobertos).
4. **`textoLiquidez`**: parágrafo de abertura da seção de Liquidez, reaproveitando o mesmo texto/limiar das regras `liquidez_forte/media/fraca`.
5. **`maturidade`**: por projeto, mesmos limiares de `_wwiMaturidadeProjeto()` do JS (Pré-contemplação/Fase de fundação/Em consolidação/Fase final).
6. **`leitura`**: por centro de custo, mesmo texto/formato do JS ("R$ X de R$ Y do teto agregado (Z%).") quando há cobertura total de teto.

Helpers novos: `_moeda()`/`_pctfmt()` (formatação BR) e `_maturidade_projeto()`.

### Evidências de validação

Script de validação automatizada simulou os acessos EXATOS dos renderizadores (`.map()`, `.length`, checagem de campo obrigatório) contra a saída real de `gerar_narrativa()` com os mesmos dados reais de 2026-07: **0 erros** em todas as checagens — `projetos[i].linhas` é lista, `composicaoPatrimonio.linhas` é lista (não mais dict) com linha "Total" localizável, `liquidezAnalise.linhas` é lista, `textoLiquidez`/`maturidade`/`leitura` presentes e com conteúdo real coerente com os números do ciclo (ex.: `liquidezAnalise.textoLiquidez` = "A Reserva de Emergência (R$ 100.000,00) cobre cerca de 7,7 ciclos de compromisso fixo sozinha, abaixo do recomendável..."). `py_compile` limpo após cada edição.

### Divergências remanescentes

- **`capacidade_investimento`**: gap aceito (decisão registrada na seção 13), fora de escopo desta rodada.
- **`parecerFinalTexto`**: continua mais curto que o do JS (achado #10, seção 14) — não estava no escopo dos 6 itens autorizados nesta rodada (era sobre CONTRATO/schema, este é sobre PROFUNDIDADE de conteúdo). Não gera erro nem quebra renderização — mas é uma forma de "perda de informação" frente ao critério de aprovação do Estágio B que o próprio usuário definiu ("nenhuma perda de informação relevante"). Fica registrado como item em aberto, não corrigido.
- Diferenças de texto mais curto em 5-6 regras (detalhe/valores auxiliares) e nomenclatura "LFTS11"/"BTG-Necton" — baixo impacto, sem mudança.

### Nova confiança

**Confiança: 93%** (era 65%). Justificativa: os 3 bloqueantes reais (risco de `TypeError`) foram eliminados e validados — esse era o fator que mais pesava contra a confiança. Os 3 itens de degradação graciosa (`maturidade`/`leitura`/`textoLiquidez`) também foram fechados, não só evitados. O resto da diferença pra 100% é o gap aceito (`capacidade_investimento`) + a profundidade menor do `parecerFinalTexto`.

### Recomendação final

**Critério de sucesso desta rodada — atendido**: 0 divergências bloqueantes, 0 `TypeError` possível (confirmado por simulação dos acessos reais), 100% de compatibilidade de contrato com os renderizadores WWI mapeados na seção 15.

**Critério de aprovação do Estágio B — quase totalmente atendido**: nenhuma regra/bucket faltando (exceto gap aceito), contrato compatível (✅ agora sim, de verdade), validação lado a lado feita, confiança 93% (≥90% ✅). O único ponto que não está 100% fechado é "nenhuma perda de informação relevante" — o `parecerFinalTexto` do Python é tecnicamente compatível mas mais raso que o do JS.

**Recomendação**: tecnicamente pronto para liberar o Estágio B do ponto de vista de RISCO OPERACIONAL (zero chance de crash). Se o critério de "nenhuma perda de informação relevante" for interpretado de forma estrita, recomendo fechar também o `parecerFinalTexto` antes do sinal verde definitivo — é um ajuste pequeno e aditivo (mesma classe dos já feitos), não um novo levantamento. **Decisão de liberar ou não o Estágio B permanece com o usuário.**

---

## 17. ESTÁGIO B — Liberado, shadow mode implementado (15/08/2026)

**Decisão do usuário**: Estágio B APROVADO. `capacidade_investimento` e `parecerFinalTexto` registrados formalmente: o 1º como divergência aceita/documentada, o 2º como dívida técnica de qualidade narrativa (não bloqueador operacional). Diretriz: não remover o motor JS ainda — implementar **shadow mode** primeiro (Python gera a narrativa oficial, JS continua disponível como fallback E como comparador de sombra, divergências registradas). Critério pra encerrar o shadow mode: ≥1 ciclo completo, 0 divergência bloqueante, nenhuma regressão, compatibilidade estável. Local de registro escolhido: **console do navegador** (zero schema novo, zero infraestrutura — só observabilidade nesta fase; tabela `wwi_shadow_divergencias` fica pra discussão futura, só se necessário).

### O que foi implementado

- **`src/relatorio/gerar-analise-financeira.js`**: nova função `wwiCompararNarrativaShadow(narrativaPython, narrativaJs, competencia)`, exposta em `window`. Compara: (1) risco estrutural real — os mesmos 3 campos `linhas` que causavam `TypeError` antes do Estágio A.1 (se reaparecerem aqui é regressão grave, classificado `ERROR`); (2) cobertura de `regrasAplicadas` (regra do JS ausente no Python → `WARNING`, exceto `capacidade_investimento` → `INFO`, gap já aceito); (3) contagem de itens em `projetos`/`passivosRank`/`centrosDeCusto` (Python com menos itens que o JS → `WARNING`; mais itens nunca gera divergência, é melhoria); (4) profundidade de `parecerFinalTexto` (Python com menos de 60% do tamanho do JS → `WARNING`). Imprime um resumo (`WWI Shadow Mode — <competência>`, contagens de Bloqueantes/Altas/Médias/Baixas) e cada divergência individual (`console.error`/`warn`/`info` conforme severidade). **Nunca persiste nada no banco.**
- **`index.html`** (`gerarRelatorioFechamentoPDF`): quando o PDF reaproveita a narrativa Python persistida (`historico.atual.analise_ia`), agora TAMBÉM calcula `gerarAnaliseFinanceira()` só pra comparação — dentro de `try/catch`, nunca substitui `narrativa` (a exibida ao usuário continua sendo 100% a do Python, sem exceção) e nunca pode quebrar a geração do relatório mesmo se a própria comparação falhar.

### Comportamento visível para o usuário

**Nenhum.** A narrativa exibida no PDF continua exatamente a mesma de antes (a persistida pelo Python, quando existe). A única mudança observável é no console do navegador (DevTools), só visível pra quem abrir o relatório com o console aberto.

### Verificação

Sintaxe conferida (balanceamento de chaves/parênteses nos 2 arquivos, edição cirúrgica e pequena). **Não foi possível testar ao vivo** (login real não disponível neste ambiente de desenvolvimento, limitação já documentada desde a criação do motor JS) — a validação de fato só acontece na próxima vez que o usuário gerar o relatório de fechamento com o painel logado, reaproveitando narrativa já persistida (competência `2026-07`).

### Próximo passo

Aguardar pelo menos 1 ciclo completo de uso real (gerar o relatório de fechamento algumas vezes ao longo do ciclo, com o DevTools aberto) e revisar o resumo do Shadow Mode no console. Só depois disso — e só se 0 divergências bloqueantes forem observadas — discutir se vale criar `wwi_shadow_divergencias` pra histórico persistido, ou encerrar o shadow mode e avançar pra simplificação definitiva do JS.

**A partir daqui, por diretriz do usuário, o foco de esforço do WWI muda de "equivalência JS×Python" para a Fase 2 do roadmap (Snapshot Patrimonial Completo — comparativos mensais/trimestrais/anuais, evolução patrimonial e de Wealth Score). Trabalho de equivalência JS×Python só volta a ser prioridade se o shadow mode revelar algo inesperado.**

---

**Aguardando nova autorização** antes de seguir pro próximo item (item 4 da ordem revisada: validar que o snapshot de julho está persistido corretamente com os campos novos — já coberto pela evidência acima — ou item 5, a análise do narrative engine antes de qualquer unificação).
