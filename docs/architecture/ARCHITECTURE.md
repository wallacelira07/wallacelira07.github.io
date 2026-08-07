# Arquitetura — Sistema Wallace Lira

## Visão geral

Site estático puro. **Sem bundler, sem build step, sem ES modules.** Todo `.js` é um script clássico (`<script src="...">`), compartilhando um único escopo global do navegador. A ordem de carregamento em `Sistema_Wallace_Lira_Completo.html` é o que garante que tudo funcione — não existe resolução automática de dependência.

## As duas camadas de dados: `VARS` e `REG`

- **`VARS`** — dados primários/editáveis (saldos, transações, parâmetros). Montado em `src/app/app.js` por `Object.assign()` de 9 funções fábrica (`criarVarsCaixas()`, `criarVarsMercadoPago()`, etc.), uma por domínio financeiro. Cada função fábrica mora junto do domínio correspondente (ex: `criarVarsCaixas()` está em `src/financeiro/caixas/vars-caixas.js`).
- **`REG`** — dados derivados/calculados a partir de `VARS`. Mesmo padrão: 7 funções fábrica (`criarRegOperacional()`, `criarRegCaixas()`, etc.), montadas em `app.js`.

Depois que `VARS`/`REG` existem, `app.js` roda pós-processamento síncrono que genuinamente precisa do objeto inteiro (merge de dados remotos do Supabase, `Object.freeze` de partes imutáveis, saldos derivados via `calcularSaldoCaixa()`) — esse código fica em `app.js`, não pode virar módulo isolado sem redesenhar a ordem de execução.

## Padrão de carregamento de módulo

Dois padrões, dependendo de QUANDO o código roda:

1. **Estático, ANTES do `app.js`** (`document.write('<script src="...">')`) — usado por qualquer módulo cuja função é **chamada de forma síncrona** durante a execução de `app.js` (ex: `criarVarsCaixas()`, chamado na hora de montar `VARS`). A definição só precisa existir antes de ser chamada — carregar antes do `app.js` garante isso.
2. **Dinâmico, DEPOIS do `app.js`** (`onload` em cadeia) — usado por módulos que só rodam via evento (clique, `onDomPronto`) e nunca em código síncrono no meio de `app.js`. Ex: `src/dashboard/navigation/dashboard-navegacao.js`.

**Confundir os dois padrões quebra o site inteiro**, silenciosamente (sem erro de sintaxe óbvio) — já aconteceu 3 vezes ao longo do projeto. Antes de mover um módulo de padrão, confirmar: ele é chamado de dentro de `app.js` de forma síncrona, ou só via evento?

## `hydrate()` e `recalcularAgregadosDerivados()`

Ambos viraram **puros orquestradores** (só chamadas de função, nenhuma lógica própria):
- `hydrate()`: chama uma `hydrateXxx()` por domínio (ex: `hydrateCaixas()` em `src/financeiro/caixas/`).
- `recalcularAgregadosDerivados()`: chama uma `recalcularXxx()` por domínio (8 domínios — 7 mapeiam 1:1 com pastas de `financeiro/`, mais indicadores).

## `FinanceEngine`/`Comparator` (V2) — camada separada, não tocar sem necessidade

`src/services/FinanceEngine.js` e `src/services/Comparator.js` são carregados via `fetch()` + `new Function()` isolado (`carregarModuloIsoladoCommonJS`, em `Sistema_Wallace_Lira_Completo.html`), **não** via `<script src>` — isso evita que `const`/`function` internos deles colidam com o escopo global do `app.js`. `src/app/promocoes-financeengine.js` roda as 18 fases de comparação V1 (app.js/REG) × V2 (FinanceEngine), sempre com fallback automático pro V1 se divergir.

Os outros arquivos em `src/services/` (`CycleEngine.js`, `EnergiaService.js`, `FinanceService.js`, `IndicadoresService.js`, `ParcelaService.js`, `PatrimonioService.js`, `ReembolsoService.js`, `DashboardService.js`, `ClassificacaoService.js`) usam sintaxe ESM real (`import`/`export`) e **não são carregados por nada em produção** — foram uma tentativa de arquitetura anterior, superada por `WallaceFinanceService` (objeto plano dentro de `app.js`). Mantidos por não estar no escopo de nenhuma reorganização autorizada até agora.

## Convenções de nomeação dos módulos

| Prefixo | Papel |
|---|---|
| `hydrate-*.js` | Renderização (lê `REG`, escreve DOM) |
| `recalcular-*.js` | Cálculo (lê `VARS`, escreve `REG`) |
| `reg-*.js` | Função fábrica do estado inicial de um fragmento de `REG` |
| `vars-*.js` | Função fábrica do estado inicial de um fragmento de `VARS` |
| `render-*.js` | Geração de tabela/HTML a partir de array (não é "hydrate" porque não lê `REG` diretamente) |

## Onde cada domínio vive

Ver tabela completa em [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md). Regra geral: **um domínio de negócio = uma pasta**, contendo o `hydrate`+`reg`+`vars`+`recalcular` daquele domínio juntos (em vez de agrupar por "tipo de arquivo"). Isso foi decisão explícita — mais fácil achar tudo sobre "Caixas" numa pasta só do que caçar `hydrate-caixas.js` numa pasta e `reg-caixas.js` em outra.

## Hospedagem

GitHub Pages, sem build step — o que está no repositório é literalmente o que é servido. `.nojekyll` desativa qualquer processamento Jekyll (necessário porque o JS usa `${}`/`{{}}` que colidiriam com Liquid). Ver `docs/decisions/` para o histórico de decisões de deploy.
