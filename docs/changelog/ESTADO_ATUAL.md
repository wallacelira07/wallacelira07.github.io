# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 07/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site`.

## 0. ATUALIZAÇÃO CRÍTICA — REORGANIZAÇÃO FÍSICA COMPLETA DO PROJETO (07/08/2026, mesma sessão, depois da V2 arquitetural)

**Este arquivo mudou de lugar**: `ESTADO_ATUAL.md` → `docs/changelog/ESTADO_ATUAL.md`. `PASSAGEM_DE_TURNO.md` → `docs/changelog/PASSAGEM_DE_TURNO.md`.

Todo o projeto foi fisicamente reorganizado: `app.js` → `src/app/app.js`, os 63 módulos de `src/modules/` (que não existe mais) foram distribuídos em pastas por domínio (`src/financeiro/{balanco,caixas,cenarios,indicadores,livros-razao,patrimonio,cartoes,investimentos,operacional}/`, `src/dashboard/{navigation,charts,widgets}/`, `src/solar/`, `src/auditoria/{inbox,classificacao,verificacoes}/`, `src/integrations/pluggy/`), docs foram pra `docs/{architecture,changelog,decisions,database}/`, scripts Python pra `scripts/{database,sync}/`, CSS/favicons pra `assets/{css,images}/`, os 3 testes pra `tests/unit/`. `src/services/` **não mudou** (tem `import`/`require` relativos entre si).

**Mapa completo, decisões e riscos**: ver `docs/architecture/PROJECT_STRUCTURE.md` e `docs/architecture/ARCHITECTURE.md` (novos). Como contribuir com a estrutura nova: `docs/CONTRIBUTING.md` (novo).

**Validado em navegador após a reorganização**: console sem erros novos, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` "✅ Sistema íntegro", painel renderizando com valores reais idênticos aos de antes da reorganização (Patrimônio R$120.314, ciclo 25/07→24/08, etc.) — zero regressão de comportamento, só caminho de arquivo mudou.

**Ajustes feitos fora de `src/`**: os 4 workflows que chamam script Python (`atualizar_cotacoes_acoes.yml`, `atualizar_geracao_saj.yml`, `mercadopago_sync.yml`, `sincronizar_pluggy.yml`) tiveram a linha `run: python3 X.py` atualizada pro caminho novo (`scripts/sync/X.py`) — sem isso os 4 cron jobs quebrariam silenciosamente. `_headers` também atualizado (`/app.js`→`/src/app/app.js`, `/styles.css`→`/assets/css/styles.css`).

**Pendências desta frente**: nenhuma técnica. Decisão de negócio ainda em aberto: retomar o plano de deploy (CNAME + Firebase authorized domain pro domínio `wallacelira.com.br`) que estava congelado antes desta reorganização começar.

---

---

## Protocolo de sessão nova (leia nesta ordem)

1. Este arquivo (`ESTADO_ATUAL.md`)
2. `PASSAGEM_DE_TURNO.md`
3. `MAPA_MIGRACAO_V2.md` (se for mexer em promoção V1→V2/FinanceEngine — não é o foco desta sessão)
4. Conferir o estado real do código (`app.js`, `src/modules/`, `Sistema_Wallace_Lira_Completo.html`) antes de assumir qualquer coisa como pendente ou concluído.

## 1. Migração FinanceEngine (Fase 2) — ENCERRADA (sessão anterior)

18/18 fases confirmadas em runtime real. Sem bloqueador técnico conhecido. Não é o foco desta sessão.

## 2. MODULARIZAÇÃO — EM ANDAMENTO, "MODO V2 ARQUITETURAL" (objetivo: app.js virar bootstrap puro)

**Contexto da decisão**: o usuário mudou o objetivo no meio da sessão — não é mais "reduzir linhas", é **"terminar a V2 arquitetural"**: `app.js` deixar de ser o centro do sistema, `VARS`/`REG` deixarem de ser mega-containers globais, `hydrate()` parar de concentrar toda a renderização, `recalcularAgregadosDerivados()` parar de ser o motor central único.

**Ordem de ataque aprovada pelo usuário** (não mudar sem pedir de novo):
1. **`hydrate()` → renderizadores por domínio** ← ✅ CONCLUÍDA
2. `recalcularAgregadosDerivados()` → funções por domínio — ✅ CONCLUÍDA
3. `REG` → objetos de domínio — ✅ CÓDIGO EXTRAÍDO (7 módulos), validação em navegador PENDENTE
4. `VARS` → módulos de domínio — ✅ CÓDIGO EXTRAÍDO (9 módulos), validação em navegador PENDENTE ← **ÚLTIMA ETAPA, ver seção 2.8**

**Validação consolidada de REG+VARS ainda não feita** (bloqueada por login Firebase — IA nunca digita senha, ver seção 2.7/2.8). Ver seção 6 pra mapa do que sobra em `app.js` e avaliação de conclusão da V2 arquitetural.

**Regra em vigor, repetida várias vezes pelo usuário**: só mover código de renderização (`hydrate()`), nunca mover cálculo. `VARS`/`REG`/`recalcularAgregadosDerivados()` **não podem ser tocados** nesta fase — só depois que `hydrate()` estiver 100% esgotado.

### 2.1 — app.js: 8.890 → 2.897 linhas (67% menor), 47 módulos extraídos — `hydrate()` ESGOTADO, Fase 1a+1b (Renderização + Inbox/Pluggy) e Fase 2 (`recalcularAgregadosDerivados()`) 100% CONCLUÍDAS

Todos os módulos abaixo foram extraídos com o mesmo processo: cópia verbatim via `sed` (nunca reescrita manual, pra evitar erro de transcrição), diff byte-a-byte contra o original antes de apagar de `app.js`, teste real no navegador (18/18 fases + teste funcional da área específica) depois de cada um.

**Módulos que carregam DEPOIS do `app.js`** (cadeia `onload`, só usados via `onclick`/eventos, nunca em código síncrono no meio da execução):
1. `src/modules/promocoes-financeengine.js` — as 18 fases FinanceEngine (sessão anterior)
2. `src/modules/energia-solar.js` — Simulador Regulatório Solar (seção 13)
3. `src/modules/dashboard-navegacao.js` — Capa/Dashboard + Busca Global
4. `src/modules/ui-navegacao-basica.js` — `showMaster`/`showLR`/`irParaPrimeiraSecao`
5. `src/modules/ui-componentes-visuais.js` — esconder valores, download JPEG por seção
6. `src/modules/graficos-cenarios-lazy.js` — as 4 funções lazy de Gráficos/Cenários (clique na aba)
7. `src/modules/filtro-livros-razao.js` — filtro de Livros Razão por ciclo
8. `src/modules/contagem-abas-livros-razao.js` — contagem dinâmica das abas de Livros Razão

**Módulos que carregam ANTES do `app.js`** (via `document.write` de `<script src>` estático — necessário porque são chamados em código SÍNCRONO no meio da execução do `app.js`, ex: dentro de `hydrate()` ou da IIFE dos gráficos do Painel):
9. `src/modules/opcoes-roc.js` — `aplicarStatusVencidoEValorMercadoOpcoes()`/`calcularROCOpcoes()` (cálculo, chamado no meio do VARS)
10. `src/modules/graficos-utilitarios.js` — `yRange`/`gerarMeses`/`alignSeries*`/`barValuePlugin` (a IIFE que cria os 6 gráficos do Painel principal usa isso, roda na carga da página)
11. `src/modules/hydrate-roc.js` — `hydrateROC()`, seção 17 (Opções/ROC) — **1º pedaço de `hydrate()` extraído**
12. `src/modules/hydrate-caixas.js` — `hydrateCaixas()`, seção 05 (Caixas Operacionais)
13. `src/modules/hydrate-patrimonio.js` — `hydratePatrimonio()`, breakdown Patrimônio + seção 11 (Passivos Patrimoniais)
14. `src/modules/hydrate-indicadores.js` — `hydrateIndicadores()`, card PIB Wallace/Taxa de Poupança/Crescimento Patrimonial (seção 23)
15. `src/modules/hydrate-metas.js` — `hydrateMetas()`, Consórcio Casa Nova (seção 12) + Projeto Casa Nova (seção 13) + badges de metas no Resumo Executivo
16. `src/modules/hydrate-reembolsos.js` — `hydrateReembolsos()`, cascata de Reembolso (Wärtsilä/MP/Cartão) + Meta de Investimento
17. `src/modules/hydrate-livros-razao.js` — `hydrateLivrosRazao()`, totais (tfoot) das tabelas de Livros Razão (LRW/LRV/LRB/LRP/LRS/LRR/LRCON/LRC/LRMP/LRPV)
18. `src/modules/hydrate-mercado-pago.js` — `hydrateMercadoPago()`, fatura/parcelas próprias/transporte corporativo do Mercado Pago (só renderização)
19. `src/modules/hydrate-qualidade.js` — `montarAlertasNegocio()` + `hydrateQualidade()`, card "Verificações de Negócio" (Qualidade): transações sem data, LREI/aging, teto oficial, tolerância temporária, limbo MB, PIX Geral Vanessa, Fundo de Suavização, fatura MP ao vivo, Inbox Financeira
20. `src/modules/hydrate-cenarios.js` — `hydrateCenarios()`, Reserva de Emergência (seção 04) + Cenário Histórico (seção 01/02) da página Cenários
21. `src/modules/hydrate-resumo-p2p.js` — `hydrateResumoP2P()`, cover-metrics + resumo Caixa Variável + Operações P2P (seção 18)
22. `src/modules/hydrate-visa-mb.js` — `hydrateVisaMB()`, breakdown Visa Infinite + Mastercard Black
23. `src/modules/hydrate-resumo-cartoes.js` — `hydrateResumoCartoes()`, títulos/totais centralizados (seções 01/02/03) + Alívio + Piso Absoluto
24. `src/modules/hydrate-wartsila-caixas-textos.js` — `hydrateWartsilaCaixasTextos()`, Caixa Wärtsilä + textos/barras Saúde-Aniversário-Seguro + resíduo de Livros Razão (`tfLRCDetalhe`/`tfPixDiversos`, resolvido — ver 2.3c)
25. `src/modules/hydrate-balanco.js` — `hydrateBalanco()`, Balanço Patrimonial completo (Ativos/Passivos/PGBL-FGTS/Patrimônio Líquido e Total Geral/Reservas/Operacional/Obrigações/Fluxo/4 quadrantes) + 3 badges soltos (snCicloAtual/csNecTotal/csReembolsos) — **última seção de `hydrate()`, esgotando a função**
26. `src/modules/hydrate-resumo-executivo.js` — `hydrateResumoExecutivo()`, KPIs do topo + Modo Operacional dinâmico (seção 02) + seção 20 + Resumo Executivo (seção 21)
27. `src/modules/hydrate-estimador-salario.js` — `hydrateEstimadorSalario()`, Estimador de Salário do próximo ciclo

Ordem de carregamento completa hoje (ver `<script>` tags no fim de `Sistema_Wallace_Lira_Completo.html`): `opcoes-roc.js` → `graficos-utilitarios.js` → `hydrate-roc.js` → `hydrate-caixas.js` → `hydrate-patrimonio.js` → `hydrate-indicadores.js` → `hydrate-metas.js` → `hydrate-reembolsos.js` → `hydrate-livros-razao.js` → `hydrate-mercado-pago.js` → `hydrate-qualidade.js` → `hydrate-cenarios.js` → `hydrate-resumo-p2p.js` → `hydrate-visa-mb.js` → `hydrate-resumo-cartoes.js` → `hydrate-wartsila-caixas-textos.js` → `hydrate-balanco.js` → `hydrate-resumo-executivo.js` → `hydrate-estimador-salario.js` → `app.js` → (onload) `energia-solar.js` → `promocoes-financeengine.js` → `dashboard-navegacao.js` → `ui-navegacao-basica.js` → `ui-componentes-visuais.js` → `graficos-cenarios-lazy.js` → `filtro-livros-razao.js` → `contagem-abas-livros-razao.js`.

### 2.1b — `hydrate()` hoje (32 linhas, só chamadas de função, nenhuma renderização inline)

```js
function hydrate(){
  hydrateResumoExecutivo();
  hydrateCenarios();
  hydrateEstimadorSalario();
  hydrateLivrosRazao();
  hydrateResumoP2P();
  hydratePatrimonio();
  hydrateCaixas();
  hydrateVisaMB();
  hydrateMercadoPago();
  hydrateResumoCartoes();
  hydrateReembolsos();
  hydrateWartsilaCaixasTextos();
  hydrateMetas(); // inclui a chamada hydrateROC() no meio
  hydrateBalanco(); // inclui snCicloAtual/csNecTotal/csReembolsos no início + hydrateIndicadores() no meio
}
```

**IMPORTANTE — o que NÃO está em `hydrate()`**: o "Simulador Fim de Ciclo" (cards `eccStatus`/`simTeto`/`simSaldoReal`/etc, seção 07) e o card "Verificações de Negócio" (Qualidade, já modularizado em `hydrate-qualidade.js`, ver 2.3e) vivem numa **IIFE separada** em `app.js` (~linha 4515 hoje, com seu próprio `onDomPronto()`), não dentro da função `hydrate()`. Essa IIFE ainda tem renderização inline não modularizada (Simulador Fim de Ciclo propriamente dito). Se o objetivo for "esgotar toda renderização do site" (não só `hydrate()` literalmente), esse é o próximo alvo antes de `recalcularAgregadosDerivados()`/`REG`/`VARS`.

### 2.2 — REGRA CRÍTICA DE ORDEM (não errar isso na próxima sessão)

`hydrate()` é chamada de forma **síncrona** dentro do próprio `app.js` (`onDomPronto(hydrate)`, ~linha 3910 hoje). Qualquer `hydrateXxx()` que `hydrate()` chame **precisa já estar definida antes do `app.js` carregar** — por isso todo módulo `hydrate-*.js` usa o padrão **estático, ANTES do app.js** (`document.write('<script src="...">')`), **nunca** o padrão `onload` de depois. Confundir os dois padrões quebra o site inteiro (tela fica sem dados, sem erro óbvio de sintaxe — só para de atualizar).

### 2.3 — `hydrate-metas.js` WIREADO E TESTADO (concluído nesta sessão, 07/08/2026)

- `src/modules/hydrate-metas.js` (`hydrateMetas()`: Consórcio Casa Nova seção 12, Projeto Casa Nova seção 13, badges de metas no Resumo Executivo) está em produção no fluxo.
- `app.js`: bloco original (linhas 3775-3807) substituído por uma única chamada `hydrateMetas();` com comentário de modularização.
- `Sistema_Wallace_Lira_Completo.html`: `<script>` estático adicionado ANTES do `app.js`, logo depois de `hydrate-indicadores.js`.
- **Testado no navegador** (login manual do usuário necessário — sessão fica em `sessionStorage`, por isso abrir `Sistema_Wallace_Lira_Completo.html` direto numa aba nova sem passar por `index.html` cai em "Sessão não encontrada"; o painel real roda dentro de um `<iframe>` carregado por `index.html`, então pra inspecionar via JS é preciso `document.querySelector('iframe').contentWindow`): console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, valores reais confirmados (`ccnCartaCredito` R$450.000,00, `ccnParcela` R$1.449,45, `ccnPagoPct` 0,42%, `pcnCapital` R$19.240,36, `pcnPctBadge` 10,69%, badges do Resumo Executivo populados).

### 2.3b — `hydrate-reembolsos.js` WIREADO E TESTADO (concluído nesta sessão, 07/08/2026)

- `src/modules/hydrate-reembolsos.js` (`hydrateReembolsos()`: cascata de Reembolso — Recebidos/A Receber/Ciclo Total/paga Wärtsilä/paga MP/paga Cartão/sobra pessoal/MP pessoal — + Meta de Investimento) está em produção no fluxo.
- `app.js`: bloco original "reembolsos e meta de investimento" (13 linhas) substituído por uma única chamada `hydrateReembolsos();` com comentário de modularização. `app.js` caiu pra **5.011 linhas**.
- `Sistema_Wallace_Lira_Completo.html`: `<script>` estático adicionado ANTES do `app.js`, logo depois de `hydrate-metas.js`.
- **Testado no navegador**: sessão persistiu na mesma aba (sem precisar logar de novo), console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, valores reais confirmados (`reembRecebidos` R$0,00, `reembAReceber`/`reembCicloTotal` R$7.795,56, `reembPagaWartsila` R$5.768,06, `reembPagaMP` R$266,23, `reembPagaCartao` R$297,31, `reembSobraPessoal` R$1.060,85, `reembMPPessoal` R$403,11, `metaInvMensal` R$3.363,91, `metaInvExcedente` -R$3.363,91).
- Próximo item da fila (seção 2.4): **Livros Razão**.

### 2.3c — `hydrate-livros-razao.js` WIREADO E TESTADO (concluído nesta sessão, 07/08/2026)

- `src/modules/hydrate-livros-razao.js` (`hydrateLivrosRazao()`: totais/tfoot das tabelas LRW/LRV/LRB/LRP/LRS/LRR/LRCON/LRC/LRMP/LRPV) está em produção no fluxo.
- **Escopo**: só o bloco "Fase 3 - totais dos livros razao (tfoot de cada tabela)" (17 linhas, comentário incluído). **Não extraído ainda** (ficou pra depois, é código disperso, não contíguo com esse bloco): `tfLRCDetalhe`/`tfPixDiversosDetalhe`/`tfPixDiversosLiquido`, que hoje ficam fisicamente no meio da renderização de Caixas (perto de `cxSeguroSaldo`/Escola de Julio) — considerar isso ao decidir se "Livros Razão" está 100% esgotado antes de avançar pra `recalcularAgregadosDerivados()`.
- `app.js`: bloco original substituído por uma única chamada `hydrateLivrosRazao();` com comentário de modularização. `app.js` caiu pra **4.995 linhas**.
- `Sistema_Wallace_Lira_Completo.html`: `<script>` estático adicionado ANTES do `app.js`, logo depois de `hydrate-reembolsos.js`.
- **Testado no navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, valores reais confirmados (`tfLRW` R$56,99, `tfLRV` R$35,95, `tfLRB` R$4.586,45, `tfLRP` R$1.017,89, `tfLRS` R$623,10, `tfLRR` R$1.279,65, `tfLRCON` R$1.950,77, `tfLRC` R$297,31, `tfLRMP` R$669,34, `tfLRPV` R$172,70).
- Próximo item da fila (seção 2.4): **Mercado Pago** (só renderização).

### 2.3d — `hydrate-mercado-pago.js` WIREADO E TESTADO (concluído nesta sessão, 07/08/2026)

- `src/modules/hydrate-mercado-pago.js` (`hydrateMercadoPago()`: fatura Mercado Pago com aviso de fallback Pluggy, parcelas próprias, transporte corporativo) está em produção no fluxo.
- **Escopo**: só o bloco "// mercado pago" (12 linhas). A lógica de cálculo do Mercado Pago (`corporativoMPDoCiclo` etc.) continua intocada em `recalcularAgregadosDerivados()`.
- `app.js`: bloco original substituído por uma única chamada `hydrateMercadoPago();` com comentário de modularização. `app.js` caiu pra **4.984 linhas**.
- `Sistema_Wallace_Lira_Completo.html`: `<script>` estático adicionado ANTES do `app.js`, logo depois de `hydrate-livros-razao.js`.
- **Testado no navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, valores reais confirmados (`mpFatura` R$669,34 com aviso "⚠ calculado (Pluggy zerada)", `mpProprias` R$403,11, `mpTransporteCorp` R$266,23).
- Próximo item da fila (seção 2.4): **Qualidade**.

### 2.3e — `hydrate-qualidade.js` WIREADO E TESTADO (concluído nesta sessão, 07/08/2026)

- `src/modules/hydrate-qualidade.js` (`montarAlertasNegocio()` + `hydrateQualidade()`: card "Verificações de Negócio", 8 categorias de alerta) está em produção no fluxo.
- **Detalhe estrutural importante**: essa seção NÃO ficava dentro de `hydrate()` — vivia numa IIFE separada (`(function(){...})()`, ~linha 4515 hoje) junto com o Simulador Fim de Ciclo, com seu próprio `onDomPronto()`. `montarAlertasNegocio()` dependia por closure de `cv`/`comprometidoParaTeto`/`tetoEfetivo`/`folego`/`lreiAtivos`/`diasAging`, declaradas mais acima na mesma IIFE (usadas também pelo Simulador, que não foi tocado). Resolvido redeclarando essas variáveis localmente dentro do módulo (mesmo padrão do `C`/`pctOf` em `hydrateCaixas`) — a IIFE em `app.js` manteve suas próprias cópias intactas para o resto do Simulador.
- `montarAlertasNegocio()` virou função global (definida no módulo, carregado estático antes do `app.js`) — `montarResumoAssistente()` (ponte `window.WallaceAI.resumo`, dentro do `app.js`) continua chamando `montarAlertasNegocio()` normalmente, sem mudança.
- `app.js`: a definição de `montarAlertasNegocio()` (136 linhas) e o bloco de renderização do `alertasNegocio` (10 linhas, dentro do `onDomPronto()`) foram substituídos por comentário de modularização + chamada `hydrateQualidade();`. `app.js` caiu pra **4.842 linhas**.
- `Sistema_Wallace_Lira_Completo.html`: `<script>` estático adicionado ANTES do `app.js`, logo depois de `hydrate-mercado-pago.js`.
- **Testado no navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, card `alertasNegocio` renderizou 6 alertas reais (0 transações sem data, 2 LREI ativos há 14 dias, Caixa Variável dentro do teto oficial, PIX Geral Vanessa R$172,66 acima do gatilho, Fundo de Suavização, fatura MP ao vivo).
- Próximo item da fila (seção 2.4): **Cenários**.

### 2.3f — `hydrate-cenarios.js` WIREADO E TESTADO (concluído nesta sessão, 07/08/2026)

- `src/modules/hydrate-cenarios.js` (`hydrateCenarios()`: Reserva de Emergência seção 04 + Cenário Histórico seção 01/02) está em produção no fluxo.
- **Escopo**: 2 blocos não-contíguos de `hydrate()`, ambos etiquetados "Cenarios" no comentário original — "Fase 3 - Reserva de Emergencia" e "cenario historico". O helper local `fmtSign` (usado só pelo Cenário Histórico) foi removido de `app.js` e redeclarado dentro do módulo, mesma lógica do `fmtSinal` em `hydrate-livros-razao.js`.
- `app.js`: os 2 blocos (9 + 9 linhas) substituídos por 1 chamada `hydrateCenarios();` + remoção da declaração órfã de `fmtSign`. `app.js` caiu pra **4.823 linhas**.
- `Sistema_Wallace_Lira_Completo.html`: `<script>` estático adicionado ANTES do `app.js`, logo depois de `hydrate-qualidade.js`.
- **Testado no navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, 13 valores reais confirmados (`resNormalValor` R$12.967,86/ciclo, `resExtremoValor` R$9.223,66/ciclo, `resAtual` R$100.644,15, `chMediana` R$18.283,64, `chPiorValor` R$7.649,62, `chMediaValor` R$20.084,86, etc).
- Próximo (por instrução do usuário): esgotar o restante do `hydrate()` + resíduo de Livros Razão (ver 2.3c) antes de iniciar `recalcularAgregadosDerivados()`/`REG`/`VARS`.

### 2.3g — RESTANTE DO `hydrate()` ESGOTADO + resíduo de Livros Razão resolvido (concluído nesta sessão, 07/08/2026)

Sequência de extrações feitas de uma vez, cada uma testada individualmente (18/18 fases + valores reais confirmados em cada passo, sem erro de console em nenhuma):

1. **`hydrate-resumo-p2p.js`** (`hydrateResumoP2P()`): cover-metrics + resumo Caixa Variável + Operações P2P.
2. **`hydrate-visa-mb.js`** (`hydrateVisaMB()`): breakdown Visa Infinite + Mastercard Black.
3. **`hydrate-resumo-cartoes.js`** (`hydrateResumoCartoes()`): títulos/totais centralizados (01/02/03) + Alívio + Piso Absoluto. `totalOpMar27` redeclarado localmente (mesmo padrão de sempre).
4. **`hydrate-wartsila-caixas-textos.js`** (`hydrateWartsilaCaixasTextos()`): Caixa Wärtsilä + textos/barras Saúde-Aniversário-Seguro + **resolve o resíduo de Livros Razão da 2.3c** (`tfLRCDetalhe`/`tfPixDiversosDetalhe`/`tfPixDiversosLiquido` — não é mais pendência).
5. **`hydrate-balanco.js`** (`hydrateBalanco()`): Balanço Patrimonial completo — a maior extração da sessão, ~100 linhas. Mantém a chamada a `hydrateIndicadores()` na mesma posição do meio do bloco.
6. **`hydrate-resumo-executivo.js`** (`hydrateResumoExecutivo()`): KPIs do topo + Modo Operacional dinâmico + seção 20 + Resumo Executivo (21).
7. **`hydrate-estimador-salario.js`** (`hydrateEstimadorSalario()`): Estimador de Salário do próximo ciclo.

**Armadilha real encontrada e corrigida nesta sessão**: ao criar `hydrateResumoExecutivo()` e remover o `const t=...; const R=REG;` do topo de `hydrate()`, o código que ainda sobrava inline logo abaixo (Estimador de Salário) e uma cópia duplicada de 3 badges (`snCicloAtual`/`csNecTotal`/`csReembolsos`) teriam quebrado por `t`/`R` não estarem mais definidos no escopo. Resolvido: Estimador virou módulo próprio (`hydrate-estimador-salario.js`), e os 3 badges soltos foram movidos para dentro de `hydrateBalanco()` (mesma posição de execução exata, já que era chamada logo em seguida) em vez de para `hydrateResumoExecutivo()` (que roda no início de `hydrate()` — colocá-los lá teria alterado a ordem relativa a `hydrateMetas()`). **Lição pra próxima vez que remover um `const t/R` do topo de uma função**: sempre reler a função inteira depois da edição antes de testar, não só o trecho editado.

- `app.js` caiu de 4.823 para **4.536 linhas**. `hydrate()` tem hoje **32 linhas, só chamadas de função** (ver bloco de código em 2.1b).
- **Todos os 7 módulos testados juntos no navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, dezenas de ids conferidos com valores reais (KPIs, Modo Operacional "Salário Normal", Resumo Executivo, Estimador "Real recebido", badges, Balanço Patrimonial completo).
- **`hydrate()` está oficialmente ESGOTADO** — zero renderização inline restante, só orquestração.
- **Ressalva importante** (ver 2.1b): a IIFE separada do Simulador Fim de Ciclo (~linha 4515 hoje) continua com renderização inline não modularizada — não é `hydrate()`, mas é a próxima fonte de renderização inline no arquivo, se o objetivo for esgotar TODA a renderização antes de atacar `recalcularAgregadosDerivados()`.

**Antes de testar, sempre conferir** (protocolo criado nesta sessão depois de 2 erros mecânicos reais):
- Fechamento de função (`}` no final do arquivo do módulo) — já esqueci isso uma vez (`hydrate-indicadores.js`), quebrou o site com `SyntaxError: Unexpected end of input`.
- Chaves balanceadas (contar `{` vs `}` no arquivo novo).
- Nenhum comentário `//` acabou "engolindo" código de outra linha por causa de um `sed` que colapsou múltiplas linhas em uma só (já aconteceu uma vez em `hydrate-caixas.js` — `sed` com `c\` e continuação de linha não confiável neste ambiente Windows/Git Bash; preferir `Edit`/heredoc pra blocos multi-linha, usar `sed -n 'X,Yp'` só pra EXTRAIR/LER, nunca pra substituir bloco grande).
- Variáveis locais que atravessam a fronteira do corte (ex: `C`/`pctOf` em `hydrateCaixas()` são usadas de novo mais adiante em `hydrate()` — foram reinseridas em `app.js` logo após a chamada `hydrateCaixas();`, mesmo padrão pode ser necessário de novo).

### 2.3h — `hydrate-simulador-ciclo.js` WIREADO E TESTADO (concluído nesta sessão, 07/08/2026)

- `src/modules/hydrate-simulador-ciclo.js` (`hydrateSimuladorCiclo()`: progresso do ciclo financeiro, aging LREI, Simulador Fim de Ciclo completo — card ECC, badge "Queda total", r21ECC, teto/comprometido/saldo real/falta cobrir/fôlego/ritmo por dia/pendente do limbo MB/mensagem) está em produção no fluxo.
- **Não era parte de `hydrate()`** — vivia numa IIFE separada ("Ciclo financeiro 100% dinâmico", ~linha 4209 hoje) com seu próprio `onDomPronto()`. `montarResumoAssistente()` (ponte `window.WallaceAI.resumo`) continua na mesma IIFE em `app.js`, não foi tocada — só precisa de `cv` (`REG.caixaVariavel`), que continua redeclarado ali.
- `app.js`: todo o cálculo (hoje/decorridos/restantes/pct/dispDiaReal/lreiAtivos/diasAging/faixaAging/cv/comprometidoParaTeto/tetoEfetivo/folego/faltaCobrir) e o `onDomPronto(()=>{...})` inteiro (renderização) substituídos por `onDomPronto(hydrateSimuladorCiclo);`. O módulo mantém a chamada a `hydrateQualidade()` no final, na mesma posição exata (sempre rodou logo depois do Simulador). `app.js` caiu pra **4.384 linhas**.
- `Sistema_Wallace_Lira_Completo.html`: `<script>` estático adicionado ANTES do `app.js`, logo depois de `hydrate-estimador-salario.js`.
- **Testado no navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, valores reais confirmados (`diasDecorridos` 13, `diasRestantes` 17, `eccStatus` "RESOLVIDO", `simTeto` R$2.000,00, `simComprometido` R$1.127,28, `simFalta` "R$0,00 (coberto)", mensagem do simulador correta, `alertasNegocio` com 6 itens, `window.WallaceAI.resumo()` funcionando).

### 2.5a — FASE 1a (Renderização restante) 100% CONCLUÍDA (nesta sessão, 07/08/2026)

Sequência de extrações, todas testadas (18/18 fases + valores/funcional reais em cada uma):

1. **`render-livros-variaveis.js`** (`renderLivrosVariaveis()`): tabelas LRW/LRV/LRC-limbo/LRCV/LRPV/PV/LRBD + 9 caixas LR simples + LREI.
2. **`atualizar-contadores-abas-lr.js`** (`atualizarContadoresAbasLR()`): contagem dinâmica nos botões das abas.
3. **`render-mercado-pago-dashboard.js`** (`renderMercadoPagoDashboard()`): painel flutuante 💰 V2.
4. **`render-parcelamentos.js`** (`renderParcelamentos()`): tabelas LRP/LRMP.
5. **`popular-seletor-ciclo.js`** (`popularSeletorCiclo()`): botões do seletor de ciclo.
6. **`ciclo-selecao.js`** (`trocarCiclo()`/`atualizarGraficosPorCiclo()`/`atualizarBotoesSeletorCiclo()`): reação à troca de ciclo.
7. **`graficos-painel-principal.js`** (`valueLeaderPlugin` + `renderGraficosPainelPrincipal()`): 6 gráficos Chart.js do Painel principal.
8. **`auditoria-automatica.js`** (`auditoriaAutomatica()`): 12 checagens de consistência do REG.

**Padrão usado nas extrações 1-6 e 8** (diferente do padrão `hydrate-*`): essas funções já eram chamadas por **referência de função** (`onDomPronto(nomeDaFuncao)` ou `btn.onclick = () => trocarCiclo(key)`), nunca executadas de forma síncrona no meio do código. Por isso bastou mover a DEFINIÇÃO pro módulo (carregado estático ANTES do `app.js`) e deixar a chamada em `app.js` intocada — nenhuma linha de `app.js` precisou virar uma nova chamada, só a definição antiga virou um comentário de modularização.

**Exceção importante — item 7 (`graficos-painel-principal.js`)**: essa era uma IIFE que rodava **de forma SÍNCRONA no meio da execução do `app.js`** (lendo `REG` já populado), não podia virar um IIFE de topo num módulo carregado antes do `app.js` (`REG` ainda não existiria nesse ponto). Precisou virar uma função nomeada (`renderGraficosPainelPrincipal()`) definida no módulo + uma chamada explícita em `app.js`, na mesma posição exata onde a IIFE rodava — mesmo padrão dos módulos `hydrate-*`. **Regra pra próximas extrações**: sempre verificar se o código roda dentro de `onDomPronto()`/é só uma função chamada por referência (pode simplesmente mover a definição) OU roda síncrono no meio do arquivo (precisa virar função nomeada + chamada no mesmo lugar).

- `app.js` caiu de 4.384 para **3.844 linhas**.
- **Testado após cada extração e no conjunto final**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` mostrando "✅ Sistema íntegro" (auditoria automática rodou, 0 divergências), teste funcional de troca de ciclo (clique real no botão, badge ativo mudou de Jul/26 pra Jun/26 sem erro), 4 gráficos confirmados existentes via `Chart.getChart()`.
- **Fase 1a (Renderização restante) 100% concluída.** Próximo: Fase 1b (Inbox/Pluggy — só modularizar, não alterar comportamento).

## 2.5 — MAPA COMPLETO de `app.js` (4.384 linhas) — estado em 07/08/2026, depois do Simulador Fim de Ciclo (desatualizado após 2.5a — ver linhas atuais em 3.844, mas categorias/blocos continuam válidos como referência de escopo)

**Blocos por categoria, com linhas aproximadas de hoje:**

| Categoria | Bloco | Linhas aprox. | Descrição |
|---|---|---|---|
| Utilitários (não mexer, não é alvo) | `onDomPronto`/`observeAndRenderChart`/`debounce`/`fmt`/`setBadge`/`$`/`calcularSaldoCaixa`/`liquidoMes` | 12–234 (~222) | Helpers puros, usados em todo o arquivo |
| **VARS** (fase 4, não entrar ainda) | `const VARS = {...}` + `aplicarBoletosVencidosAutomaticamente()` + `aplicarCicloAoVARS()` | 235–1802 (~1.568) | Mega-objeto global de dados/config |
| **REG** (fase 3, não entrar ainda) | `const REG = {...}` + `calcularAporteIncrementalPorCiclo()` | 1803–2088 (~286) | Mega-objeto de agregados |
| **recalcularAgregadosDerivados()** (fase 2, próximo alvo depois da renderização) | `function recalcularAgregadosDerivados(){...}` | 2089–2476 (~388) | Motor central de cálculo — deriva REG a partir de VARS |
| **Renderização restante** (fase 1a — próximo alvo AGORA) | `trocarCiclo()` / `atualizarGraficosPorCiclo()` / `atualizarBotoesSeletorCiclo()` | 2477–2530 (~54) | Reage à troca de ciclo no seletor |
| Renderização restante | `atualizarContadoresAbasLR()` | 2531–2587 (~57) | Contagem dinâmica nos botões das abas Livros Razão |
| Renderização restante | `renderLivrosVariaveis()` | 2588–2745 (~158) | Gera tabelas HTML de LRW/LRV/LRC-limbo/LRCV |
| **Inbox/Pluggy** (fase 1b — depois da renderização) | `gerarProximoInboxId`/`inboxAdicionarItem`/`persistirTriagem*`/`inboxAprovar`/`inboxRejeitar` | 2746–2889 (~144) | CRUD da Inbox Financeira |
| Renderização restante | `renderInboxFinanceira()` | 2890–2930 (~41) | Gera a tabela da Inbox Financeira |
| Inbox/Pluggy | `CARTAO_PLUGGY_MAPA_DEFAULT` + `gerarIdExternoPluggy`/`pluggyJaTriado`/`reconciliarPluggy()` | 2931–3108 (~178) | Reconciliação de contas Pluggy |
| Inbox/Pluggy | `classificarViaV2()` + `reconciliarTransacoesPluggy()` | 3109–3258 (~150) | Classificação V2 + reconciliação de transações |
| Inbox/Pluggy | `classificarItemDeterministico()` + `classificarInboxPendentes()` + `classificarItemMercadoPago()` + `sincronizarMercadoPagoParaInbox()` | 3259–3386 (~128) | Classificação de itens da Inbox |
| Renderização restante | `renderMercadoPagoDashboard()` | 3387–3407 (~21) | Painel flutuante 💰 V2 |
| Renderização restante | `renderParcelamentos()` | 3408–3472 (~65) | Tabelas de parcelamento LRP/LRMP |
| Renderização restante | `popularSeletorCiclo()` | 3473–3498 (~26) | Cria botões do seletor de ciclo |
| ~~hydrate()~~ | `function hydrate(){...}` | 3499–3531 (32) | **JÁ ESGOTADO** — só chamadas de função (ver 2.1b) |
| Renderização restante | `auditoriaAutomatica()` | 3532–~3707 (~175, inclui onDomPronto registrations entre 3532–3560) | Confere matemática interna do REG, loga console + aviso discreto no rodapé |
| `WallaceFinanceService` | `const WallaceFinanceService = {...}` | 3708–4208 (~500) | Serviço FinanceEngine (fases 2D-2V, já validado 18/18 — não é alvo desta modularização) |
| ~~Simulador Fim de Ciclo~~ | IIFE "Ciclo financeiro 100% dinâmico" | 4209–4241 (32) | **JÁ ESGOTADO nesta sessão** — só `cv` local + `montarResumoAssistente()` + `onDomPronto(hydrateSimuladorCiclo)` |
| Renderização restante | `valueLeaderPlugin` | 4254–4278 (~25) | Plugin visual dos gráficos de linha (serve a IIFE abaixo, não standalone) |
| Renderização restante | IIFE Gráficos do Painel principal | 4280–4361 (~81) | 6 gráficos Chart.js (cPatrim/cVisa/cVisaMB/cVariavel/cEvol/cNecessidadeLiquida) |
| Comentários de módulos já extraídos | — | 4363–4384 (~22) | Notas sobre `graficos-cenarios-lazy.js`/`energia-solar.js`/`ui-componentes-visuais.js` |

**Somas por categoria**: Renderização restante ≈ 660 linhas · Inbox/Pluggy ≈ 600 linhas · `recalcularAgregadosDerivados()` ≈ 388 linhas · `REG` ≈ 286 linhas · `VARS` ≈ 1.568 linhas · `WallaceFinanceService` ≈ 500 linhas (não é alvo) · utilitários ≈ 222 linhas (não é alvo).

### 2.4 — ORDEM APROVADA (atualizada nesta sessão, não pular etapa)

**Fase 1a — Renderização restante** ← ✅ CONCLUÍDA (ver 2.5a)

**Fase 1b — Inbox/Pluggy** ← ✅ CONCLUÍDA (ver 2.5b)

**Fase 2 — `recalcularAgregadosDerivados()`** ← ✅ CONCLUÍDA (ver 2.5c) — desmontada em 8 domínios (caixas/mercadoPago/patrimonio/p2p/reembolsos/necessidade/indicadores/balanco)

**Fase 3 — `REG`** ← CÓDIGO 100% EXTRAÍDO E LIGADO (ver 2.7) — **validação em navegador ainda PENDENTE** (bloqueada por login, ver 2.7)

**Fase 4 — `VARS`** — só depois da validação da Fase 3 confirmar 18/18 + healthBadge íntegro.

**Validação obrigatória depois de cada extração**: sistema abre, console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, teste funcional da área específica.

### 2.5b — FASE 1b (Inbox/Pluggy) 100% CONCLUÍDA (nesta sessão, 07/08/2026)

3 módulos criados, cobrindo ~600 linhas de Inbox Financeira + reconciliação Pluggy + classificação:

1. **`inbox-financeira.js`**: `gerarProximoInboxId`/`inboxAdicionarItem`/`persistirTriagemMercadoPago`/`persistirTriagemPluggy`/`persistirTriagemItem`/`inboxAprovar`/`inboxRejeitar`/`renderInboxFinanceira` + consts `SUPABASE_URL_WALLACE`/`SUPABASE_ANON_KEY_WALLACE`.
2. **`pluggy-reconciliacao.js`**: `CARTAO_PLUGGY_MAPA_DEFAULT`/`gerarIdExternoPluggy`/`pluggyJaTriado`/`reconciliarPluggy`/`classificarViaV2`/`reconciliarTransacoesPluggy`.
3. **`classificacao-inbox.js`**: `classificarItemDeterministico`/`classificarInboxPendentes`/`classificarItemMercadoPago`/`sincronizarMercadoPagoParaInbox`.

**Achado importante (2ª armadilha de ordem de execução desta sessão)**: `app.js` tinha `const CARTAO_PLUGGY_MAPA = VARS.CARTAO_PLUGGY_MAPA || CARTAO_PLUGGY_MAPA_DEFAULT;` — uma linha avaliada de forma SÍNCRONA no momento em que aparece no arquivo (não dentro de uma função chamada depois), lendo `VARS` diretamente. Se movida pra dentro de um módulo carregado ANTES do `app.js` (padrão usado em todo o resto), essa linha executaria antes de `VARS` existir, quebrando a carga inteira da página. Resolvido: só o literal `CARTAO_PLUGGY_MAPA_DEFAULT` (sem tocar `VARS`) foi movido pro módulo `pluggy-reconciliacao.js`; a linha `const CARTAO_PLUGGY_MAPA = ...` **ficou em `app.js`**, na mesma posição exata, agora referenciando o global `CARTAO_PLUGGY_MAPA_DEFAULT` do módulo. **Regra confirmada de novo**: antes de mover qualquer trecho, verificar se ele contém uma atribuição de topo (`const X = VARS...`/`REG...`) avaliada no load, não só dentro de funções — esse é o 2º caso real desta sessão (o 1º foi a IIFE dos gráficos do Painel, ver 2.5a).

- Todas as demais funções (10 no total) seguiram o padrão simples de "mover definição, manter chamada por referência" (mesmo padrão da Fase 1a), já que só são chamadas via `onDomPronto(...)` ou de dentro de outras funções, nunca de forma síncrona no meio do arquivo.
- `app.js` caiu de 3.844 para **3.215 linhas**.
- **Testado no navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `CARTAO_PLUGGY_MAPA` populado com 9 chaves reais, Inbox Financeira funcional com dados reais (5 pendentes), logs de negócio confirmando comportamento idêntico ao anterior: `reconciliarPluggy` (0 divergências, 4 ok's), `sincronizarMercadoPagoParaInbox` (3 eventos novos), `reconciliarTransacoesPluggy` (2 transações suspeitas, 141 ignoradas por ruído), `classificarInboxPendentes` (0 novos, nenhuma sugestão pendente), `healthBadge` "✅ Sistema íntegro".
- **Fase 1b (Inbox/Pluggy) 100% concluída, comportamento idêntico ao original.**

### 2.5c — FASE 2 (`recalcularAgregadosDerivados()`) 100% CONCLUÍDA — desmontado em 8 domínios (nesta sessão, 07/08/2026)

`recalcularAgregadosDerivados()` (motor central de cálculo, ~385 linhas) foi quebrado em 8 funções especializadas, chamadas na ordem pedida pelo usuário, **sem alterar nenhuma fórmula ou resultado**:

1. **`recalcular-caixas.js`** — `recalcularCaixas()`: Caixa Variável (disponível/comprometidoParaTeto/tetoEfetivo/folegoAteTeto) + PIX Diversos líquido.
2. **`recalcular-mercado-pago.js`** — `recalcularMercadoPago()`: Visa (totalComprometido/pessoal) + totalOpDetalhe.recorrencias/assinaturas (soma Visa+MB).
3. **`recalcular-patrimonio.js`** — `recalcularPatrimonio()`: Patrimônio (total/metaMilhaoPct), estrutura do Balanço (físico/financeiro/passivos/ativosTotal/**patrimonioLiquido**/patrimonioTotalGeral), metas patrimoniais, Consórcio/Projeto Casa Nova.
4. **`recalcular-p2p.js`** — `recalcularP2P()`: saldo investido + rentabilidade % das Operações P2P.
5. **`recalcular-reembolsos.js`** — `recalcularReembolsos()`: cascata de reembolso (pass-through/recebidos no ciclo/sobra pessoal), Meta de Investimento, excedente da Caixa Wärtsilä.
6. **`recalcular-necessidade.js`** — `recalcularNecessidade()`: Entradas Totais, Necessidade (Bruta/Líquida/Total Operacional, com ramo de ciclo fechado), Saldo do Ciclo, projeção de 12 ciclos (evolução), Fluxo, Modo Operacional.
7. **`recalcular-indicadores.js`** — `recalcularIndicadores()`: PIB Wallace completo, Taxa de Poupança, Crescimento Patrimonial, Eficiência Financeira, persistência do snapshot mensal.
8. **`recalcular-balanco.js`** — `recalcularBalanco()`: **último a rodar** — Reservas/Operacional do Balanço, Idade/Patrimônio Esperado/Faixa, Obrigações (Visa/MB/MP), totais de Livros Razão LRC/LRS/LRR.

**Dois achados estruturais importantes (o motivo de este domínio ser mais arriscado que a renderização)**:

1. **A função tinha muito mais entrelaçamento do que a renderização** — vários campos de "Balanço" (`patrimonioLiquido`/`ativosTotal`/`patrimonioTotalGeral`) precisavam existir **antes** de Indicadores (PIB Wallace/Crescimento Patrimonial) rodar, mesmo sendo tecnicamente `REG.balanco.*`. Resolvido movendo esses campos específicos pro domínio **Patrimônio** (#3, roda cedo) em vez de Balanço (#8, roda por último) — documentado com uma nota extensa em `recalcular-patrimonio.js` explicando exatamente por quê. O que sobrou pra `recalcularBalanco()` foram só os campos que realmente só fazem sentido depois de tudo (reservas, obrigações, "patrimônio esperado por idade/renda" que precisa de `entradasTotais` do domínio Necessidade, livros-razão totais).
2. **2 atribuições genuinamente duplicadas no arquivo original** (`REG.evolucao.totalOperacional[0]` e `REG.evolucao.necessidadeLiquida[0]`, reatribuídas mais adiante com o MESMO valor) foram consolidadas numa única atribuição cada — resultado final idêntico, zero comportamento alterado (mesma classe de limpeza já feita antes com `fmtSinal`/`fmtSign` na Fase 1a).

- `app.js` caiu de 3.215 para **2.897 linhas**. `recalcularAgregadosDerivados()` agora só orquestra: `recalcularCaixas(); recalcularPatrimonio(); recalcularMercadoPago(); recalcularP2P(); recalcularReembolsos(); recalcularNecessidade(); recalcularIndicadores(); recalcularBalanco();` (dentro do bloco de resincronização VARS→REG, que continua inline, intocado).
- **Todas as 8 extrações testadas individualmente** (18/18 fases + valores REG conferidos um a um em cada etapa) **e depois em conjunto**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` "✅ Sistema íntegro", dezenas de valores REG/tela conferidos idênticos aos vistos em toda a sessão (`patrimonioLiquido` R$469.472,20, `necessidadeTotalBruta` R$12.967,86, `saldoCiclo` R$5.315,66, `pibWallaceTotal` R$18.300,37, `balObrTotal` R$7.054,11, etc).
- **Teste funcional real de ponta a ponta**: clique real no seletor de ciclo (`trocarCiclo()` → `recalcularAgregadosDerivados()` com os 8 domínios em sequência) trocando pro ciclo **fechado** (exercita o ramo `if(snapAtual.fechado)` dentro de `recalcularNecessidade()`, branch alternativo nunca testado nas extrações individuais) — Modo Operacional mudou corretamente pra "Alto", `necessidadeTotalBruta` recalculada pra R$14.898,13, sem erros, `healthBadge` continuou íntegro.
- **`recalcularAgregadosDerivados()` está oficialmente desmontado em 8 domínios especializados — Fase 2 100% concluída.**

### 2.6 — FASE 3 (`REG`) — PLANEJAMENTO CONCLUÍDO, EXTRAÇÃO AINDA NÃO INICIADA (nesta sessão, 07/08/2026)

**Mapeamento feito**: estrutura completa de `REG` mapeada — 35 chaves de topo, ~265 linhas (posição atual em `app.js`, ver tabela em 2.5: `const REG = {...}` + `calcularAporteIncrementalPorCiclo()`).

**Decisão de arquitetura**: como todo valor de `REG` é derivado de `VARS` no momento da construção, cada fragmento de domínio vira uma **função fábrica** (chamada depois que `VARS` já existe) — mesmo padrão de segurança de ordem já usado com `CARTAO_PLUGGY_MAPA_DEFAULT` (ver 2.5b, achado da 2ª armadilha). `REG` continua sendo um único objeto global, montado por `Object.assign()` dos 7 fragmentos.

**7 domínios planejados**. Um deles (Indicadores/PIB Wallace) fica **vazio por natureza** — não há dados estáticos, PIB Wallace é 100% criado em runtime por `recalcularIndicadores()`.

**Ordem de execução planejada**:
1. Criar os 7 módulos primeiro (funções fábrica, cada uma retornando seu fragmento de `REG`).
2. Trocar a definição de `REG` em `app.js` de uma vez só — mudança estrutural única, testada de forma abrangente (não incremental como nas Fases 1 e 2).

**Atualização (mesma sessão, depois): os 7 módulos foram criados e ligados** — ver 2.7 abaixo.

### 2.7 — FASE 3 (`REG`): 7 MÓDULOS CRIADOS, LIGADOS EM `app.js`/HTML — VALIDAÇÃO EM NAVEGADOR PENDENTE (07/08/2026)

**Autorização do usuário**: "Continue criando os módulos... Não vou interromper o fluxo por causa do login... Se a validação exigir sessão autenticada: prepare a alteração, deixe pronta, registre exatamente o que foi movido, e siga para o próximo módulo... Quando eu estiver novamente logado: fazemos a validação consolidada de todos os módulos da Fase 3." — por isso os 7 módulos foram criados e ligados (script no HTML + `Object.assign` em `app.js` + remoção das chaves do literal antigo) SEM validação individual em navegador. `WALLACE_VALIDACAO_RUNTIME`/`healthBadge`/console ainda não foram conferidos nesta frente — fazer isso antes de iniciar a Fase 4 (`VARS`).

**Bloqueio técnico**: o login do sistema usa Firebase real (email/senha) — por regra de segurança, a IA nunca digita senha em nenhum campo, nem a do próprio usuário. A validação em navegador só pode ser feita com o usuário logando manualmente na aba.

`app.js`: **2.897 → 2.644 linhas** (-253, todas as 7 extrações). `const REG = {}` (literal vazio) + 7 chamadas `Object.assign(REG, criarRegXxx())` em sequência, logo após a declaração. Checagem estática feita (sem navegador): chaves balanceadas em `app.js` (754 `{` / 754 `}`) e em cada um dos 7 módulos novos (todos com diff 0). Todas as 35 chaves de topo do `REG` original contabilizadas exatamente uma vez entre os 7 módulos (nenhuma perdida, nenhuma duplicada).

Cada módulo segue o padrão de `reg-operacional.js`: função fábrica `criarRegXxx()`, retorna o fragmento com os MESMOS valores/comentários/estrutura do literal original (cópia verbatim), carrega via `document.write` estático ANTES do `app.js` no HTML (mesmo motivo do `CARTAO_PLUGGY_MAPA_DEFAULT` — a função só é CHAMADA depois que `VARS` já existe, a definição pode carregar a qualquer momento antes disso).

**Registro exato por módulo** (arquivo · chaves movidas · linhas removidas de `app.js` naquele passo):

1. **`reg-operacional.js`** (já existia de uma sessão interrompida antes desta, só faltava ligar) · `operacional`, `suporteCoIrmaEventos`, `totalOpDetalhe`, `estimador`, `deficitZero`, `superavitNormal`, `qualidade`, `cenarioHistorico`, `evolucao` · app.js 2.897→2.803 (-94)
2. **`reg-caixas.js`** · `caixaVariavel`, `caixasOperacionais`, `pixDiversos`, `livroLRCDetalhe`, `reserva` · app.js 2.803→2.777 (-26)
3. **`reg-mercado-pago.js`** · `visa`, `cartaoInfinite`, `cartaoMB`, `mercadoPago`, `faturaWartsila`, `visaDetalhe`, `mbDetalhe` · app.js 2.777→2.755 (-22)
4. **`reg-p2p.js`** · `p2p` · app.js 2.755→2.745 (-10)
5. **`reg-patrimonio.js`** · `patrimonio`, `patrimonioDetalhe`, `escolaJulioSaldo`, `metasPatrimoniais`, `consorcioCasaNova`, `projetoCasaNova`, `passivosPatrimoniais` · app.js 2.745→2.704 (-41)
6. **`reg-reembolsos.js`** · `metaInvestimento`, `lrei0001`, `wartsilaCaixa`, `reembolsos` · app.js 2.704→2.696 (-8)
7. **`reg-balanco.js`** (último — depois deste o literal `REG` ficou vazio) · `livrosRazaoTotais`, `balanco` · app.js 2.696→2.644 (-52)

`Sistema_Wallace_Lira_Completo.html`: 7 blocos `<script>` estáticos adicionados em sequência, todos ANTES do `app.js`, logo depois de `recalcular-balanco.js` (ordem: `reg-operacional.js` → `reg-caixas.js` → `reg-mercado-pago.js` → `reg-p2p.js` → `reg-patrimonio.js` → `reg-reembolsos.js` → `reg-balanco.js`).

**Pendência crítica pra próxima sessão/quando o usuário logar**: rodar a validação consolidada — abrir o sistema, checar console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` íntegro, e conferir valores reais de pelo menos 1 campo por domínio (mesmo nível de rigor das Fases 1/2). Só depois disso decidir se avança pra Fase 4 (`VARS`) ou se algum módulo precisa de correção.

**Instrução explícita do usuário nesta sessão**: não voltar para auditorias, PIX Geral Vanessa, Caixa Lance ou Caixa Boletos — manter o ritmo só na modularização.

### 2.8 — FASE 4 (`VARS`) CONCLUÍDA — 9 MÓDULOS CRIADOS, LIGADOS EM `app.js`/HTML — VALIDAÇÃO EM NAVEGADOR PENDENTE (07/08/2026, mesma sessão do 2.7)

**Autorização do usuário**: mesma regra da Fase 3 — "não vou interromper o fluxo por causa do login... quando eu estiver novamente logado, fazemos a validação consolidada de todos os módulos" (agora cobrindo REG **e** VARS juntos).

**Mapeamento**: `VARS` fechava na linha 235→1470 do `app.js` de então (1.235 linhas, ~200 chaves de topo) — bem maior e mais granular que `REG` (34 chaves eram objetos por domínio; `VARS` tem ~200 chaves, muitas primitivas soltas ou arrays de transação). Achado importante: **`VARS` fecha ANTES do que a definição de `aplicarBoletosVencidosAutomaticamente()` sugeria** — entre o fechamento do literal e essa função existe um bloco de ~115 linhas de pós-processamento síncrono (3x `Object.freeze`, merge de `window.WALLACE_DADOS_REMOTOS` via `Object.assign(VARS, dr)`, e ~10 atribuições `VARS.xxx = calcularSaldoCaixa(...)` que dependem do objeto inteiro já montado) — essa faixa **ficou intocada em `app.js`**, mesma categoria de código que `calcularAporteIncrementalPorCiclo()` foi pro `REG`.

**2 decisões de escopo, aprovadas pelo usuário antes de começar** (ver troca de mensagens):
1. **`vars-pluggy.js` não foi criado** — `VARS.PLUGGY_CONTAS` nunca existe no literal estático, só nasce em runtime via `Object.assign(VARS, window.WALLACE_DADOS_REMOTOS)`. Não havia conteúdo pra extrair.
2. **10º domínio criado: `vars-operacional.js`** — absorve ~35 chaves que não cabiam nos 9 domínios financeiros originais (salário, orçamento, `coberturaGarantida`, teto/tolerância da Caixa Variável, `LEGENDAS`, data de nascimento, CDI, médias salariais 12M, `HISTORICO_ERP_TODOS_CICLOS`, `HISTORICO_CONDUTA_JULIO`, `INBOX_FINANCEIRA`, etc. — lista exata dada pelo próprio usuário).

**Método de extração**: diferente da Fase 3 (Edit manual), aqui usei um script PowerShell pra copiar por **intervalo de linha exato** (não retypado à mão) — mapeei manualmente as ~90 faixas de linha (chave a chave, comentário anexado sempre à chave seguinte, mesmo padrão já usado no projeto) e usei `Get-Content`/slicing de array pra colar cada faixa no módulo certo, char a char, sem risco de erro de transcrição num arquivo desse tamanho.

**Checagem de integridade** (estática, sem navegador — sem Node/Python neste ambiente):
- 200 chaves de topo no `VARS` original (linhas 236–1469) = 200 chaves extraídas somadas nos 9 módulos = 200 chaves **únicas** (checado via script, zero duplicata, zero perdida).
- Chaves balanceadas (`{`/`}` e `[`/`]`) em cada um dos 9 módulos novos individualmente E em `app.js` inteiro depois da cirurgia (297/297 chaves, 60/60 colchetes).

**Resultado em `app.js`**: **2.644 → 1.423 linhas** (-1.221). `const VARS = {}` (vazio) + 9 `Object.assign(VARS, criarVarsXxx())` em sequência, mesmo padrão do `REG`.

**Os 9 módulos** (`src/modules/`): `vars-caixas.js` (57 chaves), `vars-mercado-pago.js` (30), `vars-p2p.js` (7), `vars-patrimonio.js` (32), `vars-reembolsos.js` (9), `vars-roc.js` (5), `vars-energia-solar.js` (22), `vars-ciclo-snapshots.js` (2 — `cicloAtual`+`CICLO_SNAPSHOTS`, o maior em linhas), `vars-operacional.js` (36).

`Sistema_Wallace_Lira_Completo.html`: 8 blocos `<script>` estáticos adicionados em sequência, todos ANTES do `app.js`, logo depois dos 7 `reg-*.js` (ordem: `vars-caixas` → `vars-mercado-pago` → `vars-p2p` → `vars-patrimonio` → `vars-reembolsos` → `vars-roc` → `vars-energia-solar` → `vars-ciclo-snapshots` → `vars-operacional`).

**Pendência crítica**: validação consolidada em navegador (console, 18/18, healthBadge, valores reais) — cobre REG (2.7) e VARS (2.8) juntos, feita assim que o usuário logar.

### 2.9 — MAPA DE `app.js` PÓS-FASE 4 (1.423 linhas) — pedido do usuário: "quando VARS terminar, quero um mapa do que sobra"

| Bloco | Linhas aprox. | O que é |
|---|---|---|
| Utilitários globais | 1–218 (~218) | `fmt`/`onDomPronto`/`observeAndRenderChart`/`debounce`/`WallaceBus`/`WallaceObs`/`setBadge`/`$`/`calcularSaldoCaixa`/`liquidoMes` — helpers puros, nunca foram alvo da modularização |
| `VARS` bootstrap | 219–249 (~31) | Comentário histórico + `const VARS = {}` + 9 `Object.assign(VARS, criarVarsXxx())` |
| Pós-processamento de `VARS` | 250–495 (~246) | `Object.freeze` (3x) + merge `window.WALLACE_DADOS_REMOTOS` + ~10 atribuições `VARS.xxx = calcularSaldoCaixa(...)` — depende do objeto inteiro já montado, não pode virar módulo isolado (mesma categoria de `calcularAporteIncrementalPorCiclo()` no REG) |
| `aplicarBoletosVencidosAutomaticamente()` | dentro do bloco acima | Auto-credita boletos vencidos no carregamento |
| `aplicarCicloAoVARS()` | 503–585 (~83) | Troca de ciclo (snapshot histórico ↔ ciclo atual) |
| `REG` bootstrap | 586–593 (~8) | `const REG = {}` + 7 `Object.assign(REG, criarRegXxx())` |
| `calcularAporteIncrementalPorCiclo()` + `recalcularAgregadosDerivados()` | 607–722 (~116) | Orquestra os 8 domínios já modularizados na Fase 2 (`recalcular-*.js`) |
| `CARTAO_PLUGGY_MAPA` | 723 (1) | Linha síncrona (mesmo motivo documentado na Fase 1b — não pode virar módulo carregado antes do `app.js`) |
| `VISA_DETALHE_LABELS`/`CORES` | 764–765 (2) | Constantes de cor/label pros gráficos |
| `hydrate()` | 767–821 (~32) | Só chamadas de função — Fase 1 já esgotada |
| Auditoria automática (registro `onDomPronto`) | 822–848 (~27) | Chama `auditoriaAutomatica()` (já modularizada) |
| **`WallaceFinanceService`** | 849–1347 (**~500**) | Serviço FinanceEngine (fases 2D–2V) — **já validado 18/18, explicitamente fora de escopo desde a Fase 2** (ver seção 1) |
| IIFE "Ciclo financeiro" | 1348–1382 (~35) | Só `cv` local + `montarResumoAssistente()` (bridge `window.WallaceAI.resumo`) + `onDomPronto(hydrateSimuladorCiclo)` — já esgotada em sessão anterior |
| `renderGraficosPainelPrincipal()` | 1400 (1) | 1 chamada (Fase 1a) |
| Comentários de módulos já extraídos | 1384–1423 (~40) | Documentação, zero código |

**Avaliação**: tirando o `WallaceFinanceService` (~500 linhas, serviço autocontido e já validado, não um mega-container tipo `VARS`/`REG` antigos), o resto de `app.js` é **inteiramente bootstrap/orquestração**: monta `VARS`/`REG` a partir dos módulos de domínio, aplica pós-processamento que genuinamente precisa do objeto inteiro (mesmo padrão já aceito no `REG`), e faz as poucas chamadas de orquestração que não podiam virar módulo por causa de ordem de execução síncrona. **Não há mais nenhum mega-objeto monolítico nem motor de cálculo/renderização centralizado em `app.js`.**

## 3. Achados de negócio desta sessão (não relacionados à modularização)

### 3.1 — PIX Geral Vanessa: bug de código CORRIGIDO, bug de banco PENDENTE
- **Corrigido em código** (já em `app.js`, ainda não commitado): faltavam 2 transações (`TXPV000001` R$34,34, `TXPV000002` R$20,00) no array `VARS.LRPV_TRANSACOES` — adicionadas. `PGV_SALDO_INICIAL_CICLO` **não foi mexido** (fica em `0`, por decisão do usuário).
- **Pendente, decisão do usuário**: o campo `saldo_inicial_ciclo` da caixa "PIX Geral Vanessa" no Supabase (tabela `caixas`) está com `78.04`, mas essa é uma dupla-contagem confirmada (mesmo valor já incluído nas transações). Resíduo de R$78,08 continua aparecendo no painel V1↔V2 até o usuário decidir se corrige o banco (`update caixas set saldo_inicial_ciclo = 0 where nome = 'PIX Geral Vanessa'`) — **nunca fazer isso sem autorização explícita**.

### 3.2 — Caixa Lance: reconciliação NÃO FEITA, bloqueada por falta de âncora
- Diferença de R$266,23 (V1 vs V2) **não é bug de transação** (as 6 transações do ciclo batem exatas nos dois lados) — é 100% divergência no saldo de abertura do ciclo (`CAIXA_LANCE_SALDO_INICIAL_CICLO` no código = R$3.748,74; banco real = R$3.489,75).
- Usuário mandou uma lista de transferências reais de junho/julho pra ajudar a reconciliar, mas ela é parcial ("principais transferências", não exaustiva) — não dá pra derivar o número certo com segurança sem uma âncora fechada (saldo real confirmado em 24/07/2026). **Não tentar reconciliar isso sem esse dado.**

### 3.3 — Painel V1↔V2 (Arquitetura V2, Supabase relacional): reclassificado, não mais "12 divergências"
- `app.js` agora separa "divergência real" de "diferença explicada" no painel flutuante 💰 V2 — Boletos, Lance e Bens Duráveis viram bloco informativo (causa já conhecida/documentada), não contam mais no badge de aviso do botão.
- Botões flutuantes (`+ Lançar` / `💰 V2`) redesenhados: tamanho padronizado, empilhados verticalmente (V2 em cima), badge fixo em círculo (não muda de tamanho o botão), fecha clicando fora.
- `AJUSTE-06-08` nas 8 caixas pequenas (Manutenção, Aniversário, Eventos, Saúde, Seguro, Combustível, Churrasco, Escola): investigado, classificação inconclusiva entre "rendimento CDI real" e "ajuste manual em lote" — ver `PASSAGEM_DE_TURNO.md` bloco correspondente pro raciocínio completo. **Não decidido, não removido.**

## 4. Ambiente de teste local (criado nesta sessão, útil pra continuar)

- `.claude/launch.json` + `.claude/serve.ps1`: servidor HTTP estático local em PowerShell (porta 8081), serve os arquivos do projeto direto (`http://localhost:8081/Sistema_Wallace_Lira_Completo.html`). Criado porque não há Node/Python de verdade neste ambiente (só stubs da Microsoft Store).
- Pra abrir: usar o preview do Claude Browser apontando pra essa URL. **Precisa de login real** (sessionStorage) — usuário loga manualmente, sessão persiste na aba enquanto ela ficar aberta.
- `window.WALLACE_VALIDACAO_RUNTIME` no console mostra as 18 fases FinanceEngine com resultado `APROVADA`/`REPROVADA` — é o teste de regressão rápido depois de cada extração.

## 5. Pendências que dependem de decisão do usuário

0. **[CRÍTICO, PRÓXIMO PASSO] Validar Fase 3 (`REG`) + Fase 4 (`VARS`) em navegador**, consolidado, assim que o usuário estiver logado — ver 2.7/2.8. 16 módulos criados e ligados sem validação (autorizado explicitamente pelo usuário pra não parar o ritmo por causa do login), console/18-18/healthBadge/valores reais por domínio ainda não conferidos. Depois disso: decidir se a V2 arquitetural está oficialmente concluída (mapa em 2.9 sugere que sim, tirando o `WallaceFinanceService`, já fora de escopo).
1. `hydrate()`, `recalcularAgregadosDerivados()`, `REG` e `VARS` — todos com código 100% extraído (ver seção 2, itens 1-4). Falta só a validação (item 0 acima).
2. PIX Geral Vanessa — corrigir `saldo_inicial_ciclo` no banco ou não (seção 3.1).
3. Caixa Lance — precisa de âncora de fechamento real pra reconciliar (seção 3.2).
4. `AJUSTE-06-08` — decidir se é rendimento real ou ajuste manual, se mantém ou remove (seção 3.3).
5. Commit — via VS Code, com o usuário. Nada foi commitado nesta sessão (63 módulos novos em `src/modules/` + `app.js` + `Sistema_Wallace_Lira_Completo.html` modificados).
