# Varredura anti-hardcode financeiro (18/08/2026)

## Origem

Usuário perguntou se o card "O que NUNCA é cortado" (Boletos R$4.550,77 etc) era 100% automático. Investigação achou que `totalOpBoletos` era o único dos 5 componentes que não vinha do Supabase — literal fixo em `vars-operacional.js`. Corrigido (ver abaixo). Usuário então pediu varredura completa do site: **"todo dado no site é obrigado a ler do Supabase, hardcode são proibidos"**.

## Parte 1 — Boletos: derivação real, não só mudança de lugar

Não bastava mover `totalOpBoletos` pra `parametros_gerais` como número solto — o valor em si (R$4.550,77) já estava R$42,95 desatualizado em relação aos boletos reais cadastrados em `cronograma_boletos_fixos` (R$4.593,72), porque contas de consumo (água/gás/energia) mudam de valor todo mês e ninguém lembrava de atualizar os 2 lugares.

**Correção real**: `aplicarOnda8CronogramaBoletos()` (`src/financeiro/caixas/hydrate-onda8-cronograma-boletos.js`) agora deriva `VARS.totalOpBoletos` = soma ao vivo dos boletos `ativo=true` em `cronograma_boletos_fixos`, toda vez que a tabela é buscada (mesmo padrão de re-trigger de `recalcularNecessidade()`/hydrates já usado por `aplicarOnda5Parcelamentos()`). Não é mais um número digitado à parte — é literalmente a soma dos boletos individuais.

## Parte 2 — Agente de varredura (`general-purpose`, ~175k tokens, 35 tool calls)

Buscou em todo `src/**/*.js` constantes financeiras hardcoded sem mecanismo de sobrescrita Supabase, excluindo placeholders legítimos, fallbacks já documentados e constantes estruturais. Achou 24 itens (37 campos `VARS` individuais, alguns agrupados).

## Parte 3 — Migração em lote

Para cada campo achado, o valor **atual exato** (lido do código, não estimado) foi inserido em `parametros_gerais` com `nome` = mesmo nome da chave `VARS` — reaproveitando o mecanismo genérico já existente (`WALLACE_PARAMETROS_GERAIS_V2` em `app.js`: `VARS[r.nome] = r.valor` pra cada linha da tabela, mesmo usado por `taxasHoraFolhaPontoWartsila`/`totalOpBoletos`). **Nenhum valor mudou na tela** — só a fonte de verdade migrou do `.js` pro Supabase.

Campos migrados: `totalOpAportesPat`, `mbLRRConfirmado`, `mbLRSConfirmado`, `aporteSaudeFamilia`, `orcamentoOperacional`, `reservaPiso`, `consorcioCasaCartaCredito`, `consorcioCasaParcela`, `consorcioCasaPagoPct`, `consorcioCasaQuitacao`, `consorcioAutoPagoPct`, `consorcioAutoCartaCredito`, `consorcioCasaParcelasPagas`, `patCasa`, `patApartamento`, `patJazigo`, `patSolar`, `patCarro`, `passivoConsorcioAuto`, `metaEscolaJulio`, `BENS_DURAVEIS_APORTE_MENSAL_ALVO`, `seguroEmplacamentoAporte`, `metaSuavizacao`, `escolaJulio2027Aporte`, `aporteAniversarioJulio`, `livroLRB`, `livroLRCV`, `prestacaoFinanciamentoCasa`, `metaLanceProjetoCasa`, `suporteCoIrmaEventos`, `tetoOficial`, `salarioMedia12M`, `salarioMediana12M`, `salarioMin12M`, `salarioMediaPonderada12M`, `salario`, `saudeEmagrecimentoAporte`.

Os literais em `vars-operacional.js`/`vars-patrimonio.js`/`vars-caixas.js`/`vars-mercado-pago.js` continuam existindo só como **fallback síncrono** (se a busca à V2 falhar) — nota de migração adicionada no topo de cada um dos 4 arquivos, listando os campos afetados.

## O que NÃO foi migrado (ainda) e por quê

O agente não escaneou com a mesma profundidade `dashboard/`, `relatorio/`, `auditoria/`, `integrations/`, `services/` nem `Sistema_Wallace_Lira_Completo.html` — só os `vars-*.js`, que concentravam a esmagadora maioria dos literais financeiros. Se aparecer outro achado nesses diretórios, tratar como pendência nova, não reabrir esta.

Itens de confiança mais baixa (`orcamentoOperacional`, `suporteCoIrmaEventos`, as 4 estatísticas de salário) foram migrados mesmo assim — mudar de "fonte" é sempre seguro (mesmo mecanismo já provado), a confiança baixa era só sobre a urgência de migrar, não sobre o risco de migrar.

## Parte 4 — 19/08/2026: os 2 achados pendentes, resolvidos com autorização explícita

Usuário autorizou separadamente editar `FinanceEngine.js` (protegido) e `gerar-analise-financeira.js` (WWI, congelado).

- **`FinanceEngine.js`**: achado importante na investigação — essa função (`calcularAporteIncrementalPorCiclo`) é a cópia "pura" da Fase 1, **ainda não consumida pela produção** (ver cabeçalho do arquivo). A função que roda de verdade é `app.js:calcularAporteIncrementalPorCiclo()` (V1, assinatura `(i)` só), que já tinha dessincronizado da cópia — o item Saúde Família foi corrigido lá em 16/08/2026 e nunca replicado na cópia. **O fix real foi em `app.js`**: os 2 literais restantes (200 = Aniversário Júlio, 500 = Escola Júlio ciclo atual) agora leem `VARS.aporteAniversarioJulio` (já migrado) e `VARS.escolaJulioCicloAtualAporte` (novo campo, migrado agora). A cópia em `FinanceEngine.js` também foi parametrizada (defaults idênticos aos valores antigos — mudança mecânica, comportamento preservado por construção), só pra não ficar pra trás de novo se/quando a Fase 2/3 (consumo real) acontecer.
  - **Não foi possível rodar as 18 fases de validação** nesta sessão (sem Node.js neste ambiente de execução). Recomendado rodar `node tests/unit/FinanceEngine.test.js` e conferir `WALLACE_VALIDACAO_RUNTIME` (18/18) no navegador antes de considerar 100% validado — a mudança em `app.js` é a que efetivamente importa pra produção, e é comportamentalmente equivalente (mesmos valores, só nomeados agora).
- **`gerar-analise-financeira.js` (WWI)**: não migrado pra Supabase de propósito — `REG.patrimonio.metaMilhao` já documenta "constante, não é dado a migrar" (é o nome do próprio objetivo "Meta do Milhão", não uma meta configurável). Corrigido por **deduplicação**: os 2 literais soltos (`1000000` na regra `meta_milhao_inicial` e dentro do array `WWI_MARCOS_PATRIMONIO`) agora referenciam um único `const WWI_META_MILHAO = 1000000` local ao arquivo.

## Como editar esses valores daqui pra frente

`UPDATE parametros_gerais SET valor = to_jsonb(<novo>::numeric) WHERE nome = '<nome>';` — nunca mais editar o `.js`. Efeito no próximo carregamento do painel, sem deploy.
