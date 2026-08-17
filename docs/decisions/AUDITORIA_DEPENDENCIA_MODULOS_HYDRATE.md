# Auditoria de dependência implícita entre os módulos `hydrate-*`/`recalcular-*`/`reg-*`/`vars-*`

**Data:** 16/08/2026
**Origem do pedido:** item pendente da auditoria multidisciplinar de 15/08/2026 (`AUDITORIA_MULTIDISCIPLINAR_15082026.md`, seção "Arquitetura front-end", linha ~144: *"Lint/checagem de dependência implícita entre os ~91 módulos hydrate-\*"*), motivado por um achado real desta mesma sessão (16/08/2026): `hydrate-deficit-caixas-sem-lrei.js` lê a const global `CAIXAS_TEMATICAS_COMPROMETIDO_V2`, definida em `hydrate-comprometido-caixas-tematicas-v2.js`, sem import explícito — só ES modules teriam import; scripts clássicos dependem inteiramente de outro módulo já ter executado.
**Escopo:** só leitura + correção pontual (nenhuma foi necessária — ver Veredito). Nenhuma lógica de negócio, fórmula ou comportamento foi alterada.
**Status:** concluída. **0 bugs reais encontrados. 0 arquivos corrigidos.**

---

## 0. Correção de premissa (importante — muda a auditoria inteira)

O pedido original descrevia o carregamento como "~91 módulos como scripts clássicos, numa lista sequencial dentro do HTML — a única coisa que garante que uma função existe quando outra tenta usá-la é a ORDEM em que os `<script>` aparecem". **Isso já não é verdade desde a otimização de performance de 07/08/2026.**

Hoje (`Sistema_Wallace_Lira_Completo.html`, linha ~2209-2263), os 83 módulos "base" não são tags `<script>` sequenciais no HTML — são criados dinamicamente em JavaScript e baixados **todos em paralelo**, via:

```js
function __carregarScriptsParalelo(caminhos){
  return Promise.all(caminhos.map(function(src){
    return new Promise(function(resolve){
      var s = document.createElement('script');
      s.src = src + '?v=' + __V;
      s.async = true; // sem interdependência entre eles - ok rodar em qualquer ordem relativa
      s.onload = resolve;
      ...
      document.head.appendChild(s);
    });
  }));
}
window.__promiseModulosBase = __carregarScriptsParalelo([ /* 83 caminhos */ ]);
```

Isso tem uma consequência que a própria auditoria original não previa: **a posição de um módulo dentro do array não determina a ordem de execução.** Scripts `async` executam na ordem em que o download termina (rede), não na ordem de inserção — pode variar entre uma carga de página e outra. Ou seja, mesmo que o achado real de 16/08 (`hydrate-deficit-caixas-sem-lrei.js` no índice 16, `hydrate-comprometido-caixas-tematicas-v2.js` no índice 18) parecesse sugerir "quem vem depois na lista pode não ter carregado ainda", **reordenar o array não teria corrigido nada de fato** — a ordem real de execução já era não-determinística antes e depois de qualquer reordenação.

A pergunta certa para esta auditoria não é "a ordem na lista está certa?" — é **"algum destes 83 módulos executa, IMEDIATAMENTE ao carregar (fora de uma função, ou dentro de uma função chamada de forma síncrona/imediata), algum identificador global definido por OUTRO destes 83 módulos?"** Se a resposta for não para todos, a ordem — seja ela qual for — nunca importou, porque nada roda de fato até a segunda fase do boot (abaixo).

Um comentário já existente no próprio HTML (linha 2166-2177, escrito na sessão de 07/08/2026) já documentava essa investigação: *"cada um só define funções globais, nenhum lê/chama outro módulo no seu próprio nível superior; conferido arquivo por arquivo antes desta mudança"*. Esta auditoria reconfirma essa afirmação **hoje**, depois de vários módulos terem sido criados/alterados nos 9 dias seguintes (inclusive `hydrate-deficit-caixas-sem-lrei.js`, criado em 09/08 e ampliado em 16/08 — depois da mudança para paralelo).

---

## 1. Arquitetura real do boot (2 fases)

```
FASE 1 — paralela, ordem não-determinística (83 módulos "base")
  __promiseModulosBase = Promise.all([...83 <script async>...])
  + em paralelo: ~14 fetches ao Supabase (window.WALLACE_*_V2)
  + em paralelo: 2 módulos isolados via fetch+new Function (FinanceEngine.js, Comparator.js —
    escopo local, nunca tocam window diretamente, fora do grafo desta auditoria)
       │
       ▼ (Promise.all — só avança quando TUDO acima resolveu)
FASE 2 — sequencial, ordem garantida por encadeamento onload
  app.js  ──onload──►  energia-solar.js  ──onload──►  [promocoes-financeengine.js
                                                          + 7 módulos "independentes"]
                                                          (estes 8 carregam em paralelo
                                                           entre si, mas só DEPOIS que
                                                           app.js e energia-solar.js já
                                                           executaram por completo)
```

Isso importa porque **é na Fase 2 que `VARS` e `REG` nascem de verdade.** Os `vars-*.js`/`reg-*.js` da Fase 1 não executam nada — cada um só declara uma função fábrica (`function criarVarsCaixas(){ return {...}; }`, `function criarRegCaixas(){ return {...}; }`). `VARS`/`REG` só passam a existir quando `app.js` roda (depois que a Fase 1 inteira já terminou) e faz:

```js
const VARS = {};
Object.assign(VARS, criarVarsCaixas());
Object.assign(VARS, criarVarsMercadoPago());
... (9 chamadas)
const REG = {};
Object.assign(REG, criarRegOperacional());
... (7 chamadas)
```

Ou seja: **nenhum módulo da Fase 1 pode ler `VARS.x`/`REG.x` no seu nível superior** (não existiriam ainda) — e de fato, nenhum lê (confirmado abaixo). Todo o "encaixe" de VARS/REG com os `hydrate*`/`recalcular*` acontece dentro de `app.js`, via `onDomPronto(nomeDaFuncao)` — chamadas registradas depois que TODOS os 83 módulos e os ~14 fetches já resolveram.

### Sobre `onDomPronto` — o mecanismo real de segurança

```js
function onDomPronto(fn){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}
```

Na prática, quando `app.js` roda (bem depois no boot), `document.readyState` já não é `'loading'` — então `onDomPronto(fn)` chama `fn()` **imediatamente**, de forma síncrona, na ordem em que as linhas aparecem em `app.js`. Isto é: `onDomPronto` aqui não é realmente "espera até mais tarde de forma assíncrona" — é **"chama agora, mas só depois que app.js já garantiu que a Fase 1 inteira terminou"**. A garantia de ordem não vem de `onDomPronto` em si, vem de `onDomPronto` só ser chamado de dentro de `app.js`, que só existe depois do `Promise.all` da Fase 1 resolver. Isso reforça por que o achado de 16/08 "funcionou" — não por sorte de timing, mas por construção: `aplicarDeficitCaixasSemLrei` só é invocada via `onDomPronto(aplicarDeficitCaixasSemLrei)` dentro de `app.js` (linha 2349), momento em que `hydrate-comprometido-caixas-tematicas-v2.js` **já executou há muito tempo**, independentemente de qual dos dois arquivos baixou primeiro da rede.

---

## 2. Metodologia

1. Lista completa dos 83 módulos "base" (Fase 1) extraída do array `window.__promiseModulosBase` em `Sistema_Wallace_Lira_Completo.html` (linhas 2263-2347), + os 3 módulos sequenciais (`app.js`, `energia-solar.js`, `promocoes-financeengine.js`) + os 7 módulos "independentes" carregados em paralelo depois (`dashboard-navegacao.js`, `ui-navegacao-basica.js`, `ui-componentes-visuais.js`, `filtro-livros-razao.js`, `contagem-abas-livros-razao.js`, `coletar-dados-relatorio.js`, `gerar-analise-financeira.js`). **93 arquivos no total** (mais próximo do "~91" citado no achado original do que os "~55" de um comentário desatualizado no próprio HTML).
2. Script Python (heurística de profundidade de chaves/colchetes/parênteses, com remoção prévia de comentários e conteúdo de strings/template literals) para classificar, em cada arquivo, toda linha em nível superior (profundidade 0) como: **definição** (`function nome(...)`, `const/let/var NOME = ...`, `class Nome`) ou **execução imediata** (qualquer outra coisa fora de função — chamada solta, IIFE, `if`, atribuição a objeto já existente, etc.).
3. Todo arquivo com pelo menos 1 linha de "execução imediata" foi **lido por inteiro manualmente** (não confiei no script sozinho) para confirmar se aquela execução: (a) referencia algo de outro módulo da mesma fase paralela, e (b) se sim, se essa referência é resolvida na hora (bug real) ou só registra um callback pra rodar depois (seguro).
4. Sanity check adicional: arquivos onde a contagem de colchetes/chaves/parênteses não fechou em 0 no fim do arquivo foram sinalizados e lidos por inteiro também, mesmo sem "execução imediata" aparente — para descartar falso-negativo por erro do heurístico.

### Limitação conhecida do método (documentada, não escondida)

O heurístico por regex tropeça em **literais de regex contendo aspas** — ex.: `.replace(/'/g, '&#39;')` (padrão de escape de HTML usado em ~6 arquivos deste boot: `_onda9EscapeHtml`, `_lrvEscapeHtml`, `_lrpEscapeHtml`, `_inboxEscapeHtml`, etc.). O removedor de strings não distingue uma aspa simples dentro de um regex de uma aspa simples abrindo string de verdade, e conta errado a partir daí — gerando falsos positivos de "execução imediata" (linhas que na verdade estão dentro de função) nos arquivos seguintes do mesmo scan. **Todos os arquivos afetados por essa distorção foram identificados** (checagem de balanceamento de colchetes no fim do arquivo: 5 casos) **e lidos manualmente na íntegra** para confirmar a classificação real — nenhum continha de fato execução imediata cross-módulo. Ver seção 4.

---

## 3. Lista completa — Fase 1 (83 módulos, ordem não-determinística entre si)

Todos definem **só** funções/consts/classes no nível superior — **nenhuma leitura ou chamada de identificador de outro módulo acontece fora de uma função**, com as únicas 7 exceções abaixo (todas verificadas seguras):

| # | Arquivo | O que tem em nível superior além de definições | Por que é seguro |
|---|---|---|---|
| 2 | `graficos-utilitarios.js` | 5 IIFEs de memoização (`(function(){ yRange = ...; })()` etc.) | Cada IIFE só envolve uma função **do próprio arquivo** (closure sobre `yRange`, `gerarMeses`, `gerarMesesCiclo`, `alignSeriesCiclo`, `alignSeries` — todas definidas antes, no mesmo arquivo). Nenhuma referência a outro módulo. |
| 5 | `tooltip-composicao-caixa.js` | 1 IIFE que configura hover/toque nos cards estáticos da seção 05 | `garantirEstilo()`/`anexarListeners()` só leem `document.getElementById` com IDs fixos do próprio arquivo (`MAPA_CAIXA_ID_CARD`, dados literais locais). A única referência externa (`WallaceFinanceService.getTransacoesComposicaoSaldoCaixa`) fica dentro de `abrirPopover()`, chamada só em clique/hover do usuário — nunca no carregamento do script. |
| 6 | `hydrate-onda2-v2.js` | `const ONDA2_HARDEN_IDS = ONDA2_V2_MAPA.filter(...).flatMap(...)` (declaração multi-linha, não uma statement nova) | `ONDA2_V2_MAPA` é a própria const do mesmo arquivo, 90 linhas acima. Auto-referência, sem dependência externa. |
| 18 | `hydrate-comprometido-caixas-tematicas-v2.js` | `window.aplicarComprometidoCaixasTematicasV2 = aplicarComprometidoCaixasTematicasV2;` | Atribuição a `window` da própria função do arquivo — auto-referencial, não lê nada de fora. |
| 55 (onda9) | `hydrate-onda9-livros-fixos.js` | (falsos positivos do bug de regex, ver seção 4) | Confirmado por leitura manual: tudo dentro de funções (`onda9FormatarData`, `aplicarOnda9LivrosFixos`). |

Os outros 78 módulos têm **zero** execução em nível superior — só `function nome(){...}` e `const NOME = [...]`/`const NOME = {...}` (dados estáticos ou funções fábrica). Lista completa dos 83, com o que cada um define, no Apêndice A.

---

## 4. Os 5 arquivos com contagem de colchetes desbalanceada (falso-positivo do heurístico) — lidos manualmente na íntegra

Causa raiz confirmada em todos os 5: uma função `_xxxEscapeHtml(s)` com a linha `.replace(/'/g, '&#39;')` — o regex `/'/g` tem uma aspa simples "solta" que desalinha a contagem de aspas do resto do arquivo pro heurístico (não afeta o JavaScript real, só a análise por regex).

| Arquivo | Fase | Confirmado por leitura manual |
|---|---|---|
| `hydrate-onda3-livro-razao.js` | 1 (base) | Tudo dentro de função. `const ONDA3_LR_MAPA` é dado estático. Nenhuma execução imediata. |
| `render-livros-variaveis.js` | 1 (base) | Tudo dentro de `renderLivrosVariaveis()`. Nenhuma execução imediata (a função só é chamada via `onDomPronto(renderLivrosVariaveis)` em `app.js`). |
| `render-parcelamentos.js` | 1 (base) | Idêntico ao anterior — tudo dentro de `renderParcelamentos()`. |
| `inbox-financeira.js` | 1 (base) | Só `let _inboxContadorId = null;` (dado) e funções. Nenhuma execução imediata. |
| `dashboard-navegacao.js` | 3 (7 independentes) | Ver seção 5 — tem execução imediata real (`WallaceBus.on(...)`), mas é segura (analisada abaixo). |

---

## 5. Fase 2 — sequencial (`app.js` → `energia-solar.js` → paralelo final)

### `app.js`
Executa **depois** que toda a Fase 1 (83 módulos + ~14 fetches Supabase) já terminou — por isso pode (e faz, extensivamente) ler `VARS.x`/`REG.x`/chamar `criarVarsX()`/`criarRegX()`/`aplicarStatusVencidoEValorMercadoOpcoes()`/etc. em nível superior sem risco: todo mundo já existe. É aqui que moram todos os `onDomPronto(aplicarOndaN...)` que "amarram" os módulos da Fase 1 entre si — nenhum desses é um bug, é o ponto de integração deliberado do sistema.

### `energia-solar.js`
Carrega só depois do `onload` de `app.js` (encadeamento explícito de `<script>`, não `Promise.all`). Único ponto de execução imediata: 1 `onDomPronto(...)`. Seguro pelo mesmo motivo de sempre.

### `promocoes-financeengine.js` + os 7 módulos "independentes"
Estes 8 arquivos carregam **em paralelo entre si** (mesmo padrão `async`/`Promise.all` da Fase 1), mas só depois que `app.js` e `energia-solar.js` já executaram por completo (`script.onload` encadeado). `promocoes-financeengine.js` tem 17 IIFEs de "validação/promoção de domínio" — auditados individualmente: todos leem só `VARS`/`REG`/`WallaceFinanceEngine`/`WallaceComparator`/`WallaceBus` (todos já existentes nesse ponto) e **nenhum** referencia algo definido só nos outros 7 módulos "independentes" (confirmado por grep dos nomes de função de cada um dos 7 dentro deste arquivo — zero ocorrências).

`dashboard-navegacao.js` (um dos 7) tem 2 execuções imediatas reais:
```js
WallaceBus.on('abaAlterada', ({id}) => renderPageStrip(id));
WallaceBus.on('abaAlterada', ({id}) => { ... });
```
`WallaceBus` é definido em `app.js` (`const WallaceBus = (function(){...})();`, linha 1134) — e `app.js` já terminou de executar muito antes deste ponto do boot (é o script anterior na cadeia sequencial). `.on(...)` só registra um callback (roda no evento `'abaAlterada'`, disparado bem depois, por navegação do usuário) — não lê nem chama nada na hora. Seguro.

`ui-navegacao-basica.js` e `ui-componentes-visuais.js` (outros 2 dos 7) só registram `document.addEventListener`/`onDomPronto` em nível superior — mesma categoria, seguro.

---

## 6. Reanálise do achado original (16/08/2026)

> `hydrate-deficit-caixas-sem-lrei.js` (índice 16 no array) lê `CAIXAS_TEMATICAS_COMPROMETIDO_V2`, definida em `hydrate-comprometido-caixas-tematicas-v2.js` (índice 18).

Confirmado nesta auditoria: a leitura acontece só dentro de `aplicarDeficitCaixasSemLrei()` (linha 48), uma função `async` que **nunca roda sozinha** — só é chamada via `onDomPronto(aplicarDeficitCaixasSemLrei)` em `app.js` (linha 2349), depois que a Fase 1 inteira (incluindo `hydrate-comprometido-caixas-tematicas-v2.js`) já terminou. **Não há bug, nem "por sorte"** — é seguro por construção, independente de qual dos dois arquivos baixa primeiro da rede (e hoje, com carregamento paralelo `async`, a ordem real de chegada é não-determinística de qualquer forma — reordenar os itens do array, como a tarefa original cogitava, não mudaria nada).

---

## Veredito final

- **93 módulos do boot auditados** (83 da Fase 1 paralela + 3 da cadeia sequencial + 7 do bloco paralelo final).
- **~15 dependências implícitas "de nome"** mapeadas entre módulos (função definida num arquivo, chamada/lida a partir de outro) — todas elas passam por `onDomPronto(...)` dentro de `app.js`, ou por callbacks de evento/timeout, nunca em código que executa no instante em que o `<script>` carrega.
- **7 arquivos tinham código de nível superior além de puras definições** — todos individualmente auditados e confirmados seguros (auto-referência ao próprio arquivo, ou registro de callback/listener para rodar depois).
- **5 arquivos geraram falso-positivo no heurístico automático** (regex `/'/g` desalinhando a contagem de aspas) — todos lidos manualmente na íntegra para descartar, nenhum tinha execução imediata real.
- **0 bugs reais de ordem de carregamento encontrados.**
- **0 arquivos corrigidos / nenhum `<script>` reordenado** — não havia nada para corrigir, e reordenar não teria efeito prático mesmo se houvesse (os 83 módulos "base" carregam em paralelo `async` desde 07/08/2026; a posição no array não controla mais a ordem real de execução).
- **Achado adicional (não um bug, uma nota de precisão para a documentação futura):** o comentário no próprio HTML e o raciocínio do achado original de 16/08/2026 atribuíam a segurança ao padrão `onDomPronto` de forma um pouco imprecisa — a garantia real vem da arquitetura de 2 fases (paralelo → sequencial via `Promise.all`+`onload` encadeado), não de `onDomPronto` ser "assíncrono" (na prática ele executa a função de forma síncrona e imediata, porque quando `app.js` roda o DOM já está pronto há muito tempo). Vale ajustar essa nuance na próxima vez que o padrão for citado em código ou documentação.

---

## Apêndice A — os 83 módulos da Fase 1, com o que cada um define no nível superior

Lista completa gerada pelo script de auditoria (funções/consts/classes de nível superior por arquivo). Preservada para consulta futura em `docs/decisions/` — útil se um novo módulo for adicionado ao boot e alguém precisar checar rapidamente se algo com o mesmo nome já existe em outro arquivo do batch.

```
1  src/financeiro/investimentos/opcoes-roc.js
     const parseVencimentoBR, function aplicarStatusVencidoEValorMercadoOpcoes, function calcularROCOpcoes
2  src/dashboard/charts/graficos-utilitarios.js
     function yRange, function gerarMeses, function ciclosDesdeAncoraCiclo, function gerarMesesCiclo,
     function alignSeriesCiclo, const ANCHOR_MONTH, const ANCHOR_MONTH_CICLO, function mesesDesdeAncora,
     function alignSeries, function alignEventos, const barValuePlugin
3  src/financeiro/investimentos/hydrate-roc.js
     function hydrateROC, function aplicarBeneficiosCreditosV2
4  src/financeiro/caixas/hydrate-caixas.js
     function hydrateCaixas, const CAIXAS_JA_COBERTAS_ESTATICAMENTE, function preencherCaixasOperacionaisExtra,
     const METAS_V2_CARDS_ESTATICOS, function aplicarMetasV2CaixasEstaticas
5  src/ui/tooltip-composicao-caixa.js
     (tudo dentro de 1 IIFE — API pública exposta via window.anexarTooltipComposicaoCaixa)
6  src/financeiro/caixas/hydrate-onda1-v2.js
     const pctOf, const ONDA1_V2_MAPA, const ONDA1_V2_IDS, function aplicarOnda1V2
7  src/financeiro/caixas/hydrate-onda2-v2.js
     const ONDA2_V2_MAPA, const TOLERANCIA_CENTAVOS, const ONDA2_HARDEN_IDS, function aplicarOnda2V2,
     const LIVRO_RAZAO_FASE1_CAIXAS, function diagnosticoLivroRazaoFase1
8  src/financeiro/caixas/hydrate-onda3-livro-razao.js
     const ONDA3_LR_MAPA, function onda3FormatarDataV2, function onda3AtualizarNotaDisponivelReal,
     function onda3LinhaTransacao, function onda3LivroRazaoMarcarIndisponivel
9  src/financeiro/caixas/hydrate-onda3-suavizacao.js
     function aplicarOnda3Suavizacao
10 src/financeiro/caixas/hydrate-onda3-caixalance.js
     const ONDA3_CAIXALANCE_MAPA, function aplicarOnda3CaixaLance
11 src/financeiro/cartoes/hydrate-onda3-lrwlrv.js
     const ONDA3_LRWLRV_MAPA, function aplicarOnda3LrwLrv, function aplicarOnda3LrwLrvListaDetalhada,
     function exibirAvisoFallbackLrwLrv
12 src/financeiro/cartoes/hydrate-onda10-lrclimbo.js
     function aplicarOnda10LrcLimbo, function exibirAvisoFallbackLrcLimbo
13 src/financeiro/patrimonio/hydrate-onda4-patrimonio.js
     const ONDA4_PATRIMONIO_IDS, function aplicarOnda4Patrimonio
14 src/financeiro/investimentos/hydrate-onda4-investimentos.js
     const ONDA4_INVESTIMENTOS_IDS_RESUMO, function onda4InvestimentosMarcarIndisponivel,
     function aplicarOnda4Investimentos
15 src/financeiro/operacional/hydrate-onda4-lrei.js
     function onda4LreiMarcarIndisponivel, function aplicarOnda4Lrei
16 src/financeiro/operacional/hydrate-deficit-caixas-sem-lrei.js
     function aplicarDeficitCaixasSemLrei
17 src/financeiro/caixas/hydrate-comprometido-caixa-variavel-v2.js
     function aplicarComprometidoCaixaVariavelV2
18 src/financeiro/caixas/hydrate-comprometido-caixas-tematicas-v2.js
     const CAIXAS_TEMATICAS_COMPROMETIDO_V2, function _localizarCardCaixaTematica,
     function _renderizarBlocoComprometido, function aplicarComprometidoCaixasTematicasV2
19 src/financeiro/operacional/hydrate-onda4-wartsila.js
     const ONDA4_WARTSILA_IDS, function aplicarOnda4Wartsila
20 src/financeiro/livros-razao/hydrate-onda5-parcelamentos.js
     function onda5ParcelamentosMarcarIndisponivel, function aplicarOnda5Parcelamentos
21 src/financeiro/investimentos/hydrate-onda5-p2p.js
     const ONDA5_P2P_IDS, function aplicarOnda5P2P
22 src/solar/hydrate-onda5-qualidade-geracao.js
     const SOLAR_JANELA_LEITURA_INICIO_H, const SOLAR_JANELA_LEITURA_FIM_H,
     function agoraEfetivoFrescorSolar, function aplicarOnda5QualidadeGeracao
23 src/solar/hydrate-clima-solar.js
     const CLIMA_SOLAR_LAT, const CLIMA_SOLAR_LON, const CLIMA_SOLAR_CODIGOS,
     let __climaSolarJaBuscado, function aplicarClimaSolar
24 src/solar/compartilhamento-solar.js
     const SUPABASE_URL_SOLAR_SHARE, const SUPABASE_ANON_KEY_SOLAR_SHARE, function _headersCompartilhamentoSolar,
     function _linkCompartilhamentoSolarUrl, function fmtDataHoraCompartilhamentoSolar,
     function criarLinkCompartilhamentoSolar, function _copiarLinkCompartilhamentoSolar,
     function desativarLinkCompartilhamentoSolar, function renderizarLinksCompartilhamentoSolar
25 src/financeiro/patrimonio/hydrate-patrimonio.js
     function hydratePatrimonio
26 src/financeiro/indicadores/hydrate-indicadores.js
     function hydrateIndicadores
27 src/financeiro/operacional/hydrate-metas.js
     function hydrateMetas
28 src/financeiro/operacional/hydrate-reembolsos.js
     function hydrateReembolsos
29 src/financeiro/livros-razao/hydrate-livros-razao.js
     function hydrateLivrosRazao
30 src/financeiro/cartoes/hydrate-mercado-pago.js
     function hydrateMercadoPago
31 src/auditoria/verificacoes/hydrate-qualidade.js
     function montarAlertasNegocio, function hydrateQualidade
32 src/financeiro/cenarios/hydrate-cenarios.js
     function hydrateCenarios
33 src/financeiro/investimentos/hydrate-resumo-p2p.js
     function hydrateResumoP2P
34 src/financeiro/cartoes/hydrate-visa-mb.js
     function hydrateVisaMB, function recalcularEHidratarMbPessoal
35 src/financeiro/cartoes/hydrate-resumo-cartoes.js
     function hydrateResumoCartoes
36 src/financeiro/cartoes/hydrate-wartsila-caixas-textos.js
     function hydrateWartsilaCaixasTextos
37 src/financeiro/balanco/hydrate-balanco.js
     function hydrateBalanco
38 src/financeiro/operacional/hydrate-resumo-executivo.js
     function hydrateResumoExecutivo
39 src/financeiro/operacional/hydrate-estimador-salario.js
     function hydrateEstimadorSalario
40 src/financeiro/cenarios/hydrate-simulador-ciclo.js
     function hydrateSimuladorCiclo
41 src/financeiro/livros-razao/render-livros-variaveis.js
     function _lrvEscapeHtml, function renderLivrosVariaveis
42 src/dashboard/widgets/atualizar-contadores-abas-lr.js
     function atualizarContadoresAbasLR
43 src/financeiro/cartoes/render-mercado-pago-dashboard.js
     function renderMercadoPagoDashboard
44 src/financeiro/livros-razao/render-parcelamentos.js
     function _lrpEscapeHtml, function renderParcelamentos
45 src/dashboard/widgets/popular-seletor-ciclo.js
     function popularSeletorCiclo
46 src/financeiro/cenarios/ciclo-selecao.js
     function trocarCiclo, function atualizarGraficosPorCiclo, function atualizarBotoesSeletorCiclo
47 src/dashboard/charts/graficos-painel-principal.js
     const valueLeaderPlugin, function renderGraficosPainelPrincipal,
     function atualizarGraficosPainelPrincipal, function atualizarGraficoPainelPatrimonio,
     function atualizarGraficoPainelCaixaVariavel
48 src/auditoria/verificacoes/auditoria-automatica.js
     function auditoriaAutomatica
49 src/auditoria/inbox/inbox-financeira.js
     function _inboxEscapeHtml, let _inboxContadorId, function gerarProximoInboxId,
     (+ inboxAdicionarItem/persistirTriagem*/inboxAprovar/inboxRejeitar/renderInboxFinanceira)
50 src/integrations/pluggy/pluggy-reconciliacao.js
     const CARTAO_PLUGGY_MAPA_DEFAULT, const CARTAO_PLUGGY_TOTALVAR_POR_NUMERO,
     const CARTAO_PLUGGY_NOME_USUARIO, function construirCartaoPluggyMapa, function gerarIdExternoPluggy,
     function pluggyJaTriado, function reconciliarPluggy, function promoverFaturaPluggyComoFonte,
     let __regrasClassificacaoV2Cache, function classificarViaV2, function reconciliarTransacoesPluggy
51 src/integrations/pluggy/hydrate-onda7-pluggy.js
     function aplicarOnda7Pluggy
52 src/financeiro/caixas/hydrate-onda8-cronograma-boletos.js
     const ONDA8_BOLETO_NOTA_POR_TX, function onda8LrbRenderTabela, function aplicarOnda8CronogramaBoletos
53 src/financeiro/caixas/hydrate-onda11-boletos-extrato-v2.js
     function aplicarOnda11BoletosExtratoV2
54 src/financeiro/caixas/hydrate-onda12-caixas-pequenas-v2.js
     const ONDA12_CAIXAS_MAPA, function aplicarOnda12CaixasPequenasV2
55 src/saude/hydrate-emagrecimento.js
     function aplicarEmagrecimento, function aplicarOzivyAplicacoes, function aplicarPressaoArterial,
     function aplicarGlicoseLeituras
56 src/financeiro/livros-razao/hydrate-onda9-livros-fixos.js
     function _onda9EscapeHtml, function onda9MarcarIndisponivel, function onda9FormatarData,
     function aplicarOnda9LivrosFixos
57 src/auditoria/verificacoes/hydrate-saude-operacional.js
     const SAUDE_JOBS_LIMIARES, function _horasUteisDesde, function saudeOperacionalClassificar,
     function saudeOperacionalRenderErro, function aplicarSaudeOperacional
58 src/auditoria/classificacao/classificacao-inbox.js
     function classificarItemDeterministico, function classificarInboxPendentes,
     function classificarItemMercadoPago, function inboxDescricaoAutomaticaMP,
     const ASSINATURA_STOPWORDS, function extrairPalavrasChaveAssinatura,
     function construirPalavrasChaveAssinaturasConhecidas, function descricaoBateAssinaturaConhecida,
     function obterPalavrasChaveAssinaturasConhecidas, function dispararContextoDedupeInbox,
     function sincronizarMercadoPagoParaInbox
59 src/auditoria/classificacao/hydrate-onda6-mercadopago.js
     function aplicarOnda6MercadoPago
60 src/financeiro/caixas/recalcular-caixas.js
     function recalcularCaixas
61 src/financeiro/cartoes/recalcular-mercado-pago.js
     function recalcularMercadoPago
62 src/financeiro/patrimonio/recalcular-patrimonio.js
     function recalcularPatrimonio
63 src/financeiro/investimentos/recalcular-p2p.js
     function recalcularP2P
64 src/financeiro/operacional/recalcular-reembolsos.js
     function recalcularReembolsos
65 src/financeiro/operacional/recalcular-necessidade.js
     function recalcularNecessidade
66 src/financeiro/indicadores/recalcular-indicadores.js
     function recalcularIndicadores
67 src/financeiro/balanco/recalcular-balanco.js
     function recalcularBalanco
68 src/financeiro/operacional/reg-operacional.js
     function criarRegOperacional
69 src/financeiro/caixas/reg-caixas.js
     function criarRegCaixas
70 src/financeiro/cartoes/reg-mercado-pago.js
     function criarRegMercadoPago
71 src/financeiro/investimentos/reg-p2p.js
     function criarRegP2P
72 src/financeiro/patrimonio/reg-patrimonio.js
     function criarRegPatrimonio
73 src/financeiro/operacional/reg-reembolsos.js
     function criarRegReembolsos
74 src/financeiro/balanco/reg-balanco.js
     function criarRegBalanco
75 src/financeiro/caixas/vars-caixas.js
     function criarVarsCaixas
76 src/financeiro/cartoes/vars-mercado-pago.js
     function criarVarsMercadoPago
77 src/financeiro/investimentos/vars-p2p.js
     function criarVarsP2P
78 src/financeiro/patrimonio/vars-patrimonio.js
     function criarVarsPatrimonio
79 src/financeiro/operacional/vars-reembolsos.js
     function criarVarsReembolsos
80 src/financeiro/investimentos/vars-roc.js
     function criarVarsROC
81 src/solar/vars-energia-solar.js
     function criarVarsEnergiaSolar
82 src/financeiro/cenarios/vars-ciclo-snapshots.js
     function transformarLinhasCicloSnapshotsV2, function criarVarsCicloSnapshots
83 src/financeiro/operacional/vars-operacional.js
     function criarVarsOperacional
```

## Apêndice B — os 10 módulos da Fase 2 (sequencial + paralelo final)

```
SEQ  src/app/app.js                                    — onde VARS/REG nascem + todos os onDomPronto(...)
SEQ  src/solar/energia-solar.js                         — carrega só após onload de app.js
SEQ  src/app/promocoes-financeengine.js                  — carrega só após onload de energia-solar.js,
                                                            em paralelo com os 7 abaixo
IND7 src/dashboard/navigation/dashboard-navegacao.js
IND7 src/dashboard/navigation/ui-navegacao-basica.js
IND7 src/dashboard/widgets/ui-componentes-visuais.js
IND7 src/dashboard/navigation/filtro-livros-razao.js
IND7 src/dashboard/widgets/contagem-abas-livros-razao.js
IND7 src/relatorio/coletar-dados-relatorio.js
IND7 src/relatorio/gerar-analise-financeira.js
```
