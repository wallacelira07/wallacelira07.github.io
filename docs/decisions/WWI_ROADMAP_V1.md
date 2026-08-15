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

**Aguardando nova autorização** antes de seguir pro próximo item (item 4 da ordem revisada: validar que o snapshot de julho está persistido corretamente com os campos novos — já coberto pela evidência acima — ou item 5, a análise do narrative engine antes de qualquer unificação).
