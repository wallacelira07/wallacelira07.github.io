# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 15/08/2026, bloco 14. Resumo: sessão inteira dedicada ao **WWI (Wallace Wealth Intelligence)** — do roadmap de 3 fases (definido no fim da sessão anterior) até a conclusão completa de Fase 1, Fase 2 e Fase 3, com o sistema entrando formalmente em **período de observação/estabilização operacional**, congelado funcionalmente por decisão explícita do usuário.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **Nunca deixar o Google Drive sincronizar a pasta `.git/`** — se aparecer `refs/heads/.../desktop.ini` de novo, `find .git -iname desktop.ini -delete` antes de qualquer `git push`.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — contenção de thread já investigada a fundo, não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (seção 1.3.5 do manual). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre, em qualquer caixa.
9. **Procedimento de baixa da fatura**: quando a fatura vence e é paga de verdade, `UPDATE` na MESMA linha de `transacoes` (`afeta_saldo_real` false→true). Nunca criar uma segunda transação.
10. **Nenhuma constante financeira nova deve nascer hardcoded no `.js`** se já existe (ou faz sentido existir) um lugar correspondente em `parametros_gerais`/`indicadores`. Mudar um valor deve ser sempre uma edição de dado no Supabase, nunca deploy de código.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI** (relatório executivo), mas continua FORA da fórmula usada pelo Painel Executivo/Balanço (`recalcularPatrimonio()`) — 2 contextos diferentes, decisão intencional.
12. **Inbox Financeira se auto-filtra** (`arquivar_inbox_historico()`, roda sozinha a cada sincronização). Se o volume voltar a crescer muito, é sinal de que algo na função quebrou, não que precisa de faxina manual em massa.
13. **Leitura manual de `energia_solar_leituras` sempre usa a data/hora REAL da foto (RPC `registrar_leitura_solar_manual`, `timestamptz` explícito), nunca "a data de hoje" no momento de gravar** — já causou 2 achados de "salto implausível" que eram data errada.
14. **NOVO 15/08/2026 — Medidor solar DDSU666: modelo errado (313269, sem RS485) foi instalado; modelo certo (313270) só libera 25/08/2026.** Não disparar sondagem SAJ nem investigar dado novo da API antes dessa data.
15. **NOVO 15/08/2026 — WWI (Wallace Wealth Intelligence) congelado funcionalmente, em período de observação.** Ver seção dedicada abaixo — não abrir fase nova, não expandir escopo, não refatorar sem evidência real de divergência ou pedido explícito do usuário.

## 1. WWI (Wallace Wealth Intelligence) — status oficial 15/08/2026

**Fases 1, 2 e 3 concluídas.** Shadow Mode em observação. Estágio B da unificação JS×Python bloqueado. Ver `docs/decisions/WWI_ROADMAP_V1.md` (18 seções, log de execução completo), `docs/decisions/WWI_NARRATIVE_ENGINE_ANALISE.md`, `docs/decisions/WWI_FASE2_PROPOSTA_ARQUITETURA.md` e `docs/decisions/WWI_FASE3_LEVANTAMENTO_TECNICO.md` para o detalhe técnico de cada etapa.

### 1.1 Fase 1 — narrative engine unificado, comparativos, metodologia_versao
- `metodologiaVersao`/`METODOLOGIA_VERSAO` rastreiam mudança de fórmula do Wealth Score por competência (JS e Python).
- `vw_wwi_comparativo_mensal` (SQL): M/M·T/T·A/A de score/patrimônio líquido, `NULL` explícito sem ponto de comparação — nunca fabrica tendência.
- **Estágio A** (aditivo, motor Python): 8 das 9 regras de narrativa que faltavam portadas do JS (liquidez, Escola de Júlio, Projeto Casa Nova, caixas zeradas, poupança), 5 blocos estruturados (`projetos`/`passivosRank`/`centrosDeCusto`/`composicaoPatrimonio`/`liquidezAnalise`). `capacidade_investimento` fica como **gap aceito e documentado** — depende de `aporteBTGPactual`/`depositoAtivacaoNecton` (literais de `vars-patrimonio.js`, sem tabela V2), decisão explícita de não fabricar dado nem criar schema novo só pra fechar 1 item.
- **Estágio A.1** (correção de contrato): auditoria produtor×consumidor contra os renderizadores REAIS do PDF (`index.html`) achou 3 bloqueantes de verdade (`TypeError` real, não só perda de texto) — `projetos[i].linhas`, `composicaoPatrimonio.linhas`, `liquidezAnalise.linhas` ausentes/tipo errado no Python. Todos corrigidos e validados (simulação dos acessos exatos dos renderizadores, 0 erros).
- **Estágio B** (shadow mode, NÃO é substituição): quando o PDF reaproveita narrativa Python persistida, o JS TAMBÉM calcula a própria versão só pra comparar (`wwiCompararNarrativaShadow`, `gerar-analise-financeira.js`) — nunca substitui o que é exibido, só loga divergência no console. **Motor JS nunca foi tocado/removido.**

### 1.2 Fase 2 — Snapshot Patrimonial Completo
- **2A**: view nova `vw_wwi_metricas_historico` (formato longo, 1 linha por competência×métrica) — 14 métricas (patrimonioFinanceiro/ativosTotal/passivosTotal/reserva/liquidezCiclos/metaMilhaoPct/consorcioCasaPagoPct/projetoCasaNovaPct + 7 subscores), M/M·T/T·A/A com checagem de contiguidade de calendário (nunca compara meses não-consecutivos como se fossem M/M) e flag de mudança de metodologia.
- **2B**: view nova `vw_wwi_score_historico` — melhor/pior score separado por `metodologia_versao` (nunca compara réguas diferentes) + absoluto, média móvel de 3 competências (só com 3 pontos contíguos), tendência (alta/queda/estável, só a partir do 4º ponto contíguo). Checagem de sanidade no job Python: avisa em `stderr` quando >30% de `indicadoresBrutos` vier `None`, nunca bloqueia a gravação.
- **2C**: aba permanente **"🧠 Wealth Intelligence"** (`#wwi`) no painel principal, carregada sob demanda (`src/relatorio/hydrate-wwi.js`, mesmo padrão lazy de `graficos-cenarios-lazy.js`), atualizada toda vez que abre. 8 seções: Resumo Executivo, Evolução Patrimonial, Wealth Score Histórico, Meta do Milhão, Projeto Casa Nova, Liquidez, Riscos e Oportunidades, Comparativos M/M·T/T·A/A. **Consome 100% de dado já persistido, nunca depende da geração do PDF** — "Histórico em construção" explícito quando não há competências suficientes, nunca gráfico/tendência fabricado.

### 1.3 Fase 3 — PDF (Tactical Wealth Report) como consumidor do WWI
- Levantamento técnico confirmou: `indicadores` (Wealth Score/subscores/16 campos brutos) era SEMPRE recalculado ao vivo pelo JS, mesmo quando a narrativa já vinha do WWI — achado da Fase 1/Estágio A.1 (seção 15 do roadmap).
- **Migrado**: `indicadores` passa a ler `historico_relatorios.dados_json` quando a competência está fechada (guarda + fallback automático pro cálculo ao vivo se o shape não bater — nunca quebra o relatório). Isso migra em cascata Reembolsos Wärtsilä e o gauge do Wealth Score. 5 dos 8 KPIs do Painel Executivo passam a preferir o campo já persistido sobre o texto raspado do DOM.
- **Shadow mode dos comparativos** (`wwiCompararComparativoShadow`): compara `vw_wwi_comparativo_mensal` contra `compararComHistorico()` ao vivo, só loga — o texto exibido continua vindo do cálculo ao vivo (framing por calendário vs. ciclos ainda é decisão de produto pendente, por escolha do usuário).
- **Fica em fallback deliberado**: `comparativo` (decisão de produto adiada — usuário quer observar 1 ciclo antes de escolher entre os 2 enquadramentos), Liquidez Imediata/Geração de Caixa (2 dos 8 KPIs, sem campo persistido equivalente — usuário decidiu NÃO portar, "71%→100% é meta técnica, não meta de negócio, prefiro estabilidade"), metadados de capa (não é cálculo).
- **Adoção WWI pelo PDF: ≈71% dos blocos de cálculo** (5 de 7) já consomem WWI quando a competência está fechada.

### 1.4 Status final e diretriz vigente
```
Fase 1: ✅ Concluída
Fase 2: ✅ Concluída
Fase 3: ✅ Concluída
Shadow Mode: 🟡 Em observação (narrativa + comparativo)
Estágio B da unificação: 🔒 Continua bloqueado
```
**Diretriz do usuário (15/08/2026): "WWI entra oficialmente em modo de estabilização operacional."** Não abrir fases novas, não criar métricas novas, não expandir escopo, não refatorar por refatorar. Acompanhar só: shadow mode da narrativa, shadow mode dos comparativos, geração real do próximo fechamento, logs/divergências observadas. **Só divergência real observada em produção justifica nova intervenção** — qualquer melhoria sem essa evidência entra em backlog, não em execução. Ver `[project_wwi_status_1508.md]` na memória do agente para o resumo condensado.

## 2. Pendências abertas de sessões anteriores (sem mudança nesta sessão)

### 2.1 Instalação física do medidor solar — TROCA DE MODELO, só libera 25/08/2026
Modelo errado (313269, sem RS485) instalado; modelo certo (313270) encomendado, chega 25/08/2026. Não disparar sondagem SAJ nem investigar API antes dessa data.

### 2.2 Inbox Financeira — ~144 Pluggy + 13 MP não processados
Precisam de revisão caso a caso (maior valor, sem correspondência óbvia em `transacoes`). Não automatizar às cegas.

### 2.3 R$340,00 do ciclo Wärtsilä 2026-07 ainda não confirmados como recebidos
Sem mudança. Não é a mesma coisa que as 2 TEDs já lançadas (`TX000220`/`TX000280`) — não confundir de novo.

### 2.4 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente.

### 2.5 Backlog técnico adiado (decisão consciente do usuário)
Lint dos ~91 módulos `hydrate-*` (retomar só com sinal concreto de bug de ordem de carregamento); previsão de geração solar por irradiância (usuário ainda não decidiu se quer).

## 3. Protocolo de sessão nova

1. Este arquivo, depois o(s) bloco(s) mais recente(s) de `docs/changelog/PASSAGEM_DE_TURNO.md` (bloco 14 em diante = trabalho do WWI desta sessão).
2. `git status`/`git log -15` antes de assumir o que está pendente/concluído — muitos commits desta sessão (Fases 1-3 do WWI), todos já publicados em `origin/main`.
3. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: Google Drive sincronizando `.git/` de novo — `find .git -iname desktop.ini -delete` antes de tentar de novo.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. **Sobre o WWI: NÃO retomar trabalho novo por conta própria.** Está formalmente congelado (seção 1.4 acima) — só agir se o usuário pedir explicitamente ou se houver divergência real reportada pelos shadow modes (narrativa e comparativo). Se o usuário mencionar "abrir o console e ver os logs do WWI" ou algo parecido, é isso que está sendo observado.
6. Retomar pendências reais por aqui: seção 2 acima (Inbox, medidor solar, reembolso Wärtsilä).
7. **Sempre que "atualizar passagem de turno" for pedido**: checklist completa da seção 5/10 do `docs/MANUAL_OPERACIONAL_AGENTES.md`. Nesta sessão (bloco 14), o trabalho tocou schema (3 views SQL novas, todas aditivas/CREATE OR REPLACE, nenhuma destrutiva) e uma regra de negócio nova (WWI como fonte de verdade, PDF como exportação) — avaliar se o manual/Google Drive precisam de atualização na próxima sessão se essa arquitetura for referenciada por outro domínio.
