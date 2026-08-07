# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 07/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site`.

## PRODUÇÃO: domínio oficial é `wallacelira.com.br`

Confirmado ao vivo em 07/08/2026: `https://wallacelira.com.br/` resolve, responde 200, HTTPS ativo, serve a tela de login. GitHub Pages (`wallacelira07.github.io`) passa a ser só a infraestrutura de hospedagem por baixo — qualquer diagnóstico, teste ou decisão de deploy/performance/autenticação daqui pra frente considera `wallacelira.com.br` como o ambiente real, não mais o domínio `.github.io`.

**Pendente de verificação manual (não dá pra checar por código)**: confirmar em Firebase Console → Authentication → Settings → Authorized domains que `wallacelira.com.br` está cadastrado — sem isso o login por email/senha falha nesse domínio mesmo com o site carregando certo.

**A V2 arquitetural e funcional estão concluídas (18/18 fases aprovadas)** — ver seção 1. Trabalho novo a partir daqui é otimização/manutenção evolutiva/performance/produção, não mais "migração V2".

## Protocolo de sessão nova (leia nesta ordem)

1. Este arquivo (`ESTADO_ATUAL.md`)
2. `PASSAGEM_DE_TURNO.md` (mesma pasta, `docs/changelog/`) — Bloco 15 tem o histórico mais recente
3. `docs/architecture/ARCHITECTURE.md` + `docs/architecture/PROJECT_STRUCTURE.md` — mapa da estrutura física atual do projeto
4. `docs/decisions/MAPA_MIGRACAO_V2.md` (só se for mexer em promoção V1→V2/FinanceEngine — não é o foco recente)
5. **Sempre conferir o estado real do código** (`git status`, `git log --oneline -10`, tamanho de `src/app/app.js`) **antes de assumir qualquer coisa como pendente ou concluído** — a documentação já ficou desatualizada em relação ao código real mais de uma vez nesta mesma sessão.

---

## 1. MODULARIZAÇÃO V2 ARQUITETURAL — ✅ CONCLUÍDA, VALIDADA E COMMITADA

O objetivo era: `app.js` deixar de ser o centro do sistema, `VARS`/`REG` deixarem de ser mega-containers globais, `hydrate()` parar de concentrar toda a renderização, `recalcularAgregadosDerivados()` parar de ser o motor central único. **As 4 fases estão 100% concluídas**:

1. `hydrate()` → renderizadores por domínio ✅
2. `recalcularAgregadosDerivados()` → 8 funções por domínio (caixas/mercadoPago/patrimonio/p2p/reembolsos/necessidade/indicadores/balanco) ✅
3. `REG` → 7 módulos fábrica por domínio (`criarRegXxx()`) ✅
4. `VARS` → 10 módulos fábrica por domínio (`criarVarsXxx()`) ✅

**Resultado**: `app.js` original (8.890 linhas) foi reduzido e depois **fisicamente movido** para `src/app/app.js` — hoje com **1.423 linhas**, contendo só: utilitários globais, bootstrap de `VARS`/`REG` (chamadas `Object.assign` pros módulos fábrica), pós-processamento síncrono que genuinamente precisa do objeto inteiro já montado (freeze, merge de dados remotos, saldos derivados), `aplicarCicloAoVARS()`, o orquestrador `recalcularAgregadosDerivados()` (8 chamadas), `hydrate()` (14 chamadas), o `WallaceFinanceService` (~500 linhas, serviço FinanceEngine autocontido, já validado 18/18 desde antes desta modularização — nunca foi alvo dela) e algumas chamadas de orquestração que não podem virar módulo por exigirem ordem síncrona de execução.

**Validado em navegador**: console sem erros, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` "✅ Sistema íntegro", valores reais do painel conferidos em cada domínio.

**Detalhes completos de cada extração** (qual módulo, quais campos, qual armadilha de ordem de execução foi encontrada e como foi resolvida) estão em `PASSAGEM_DE_TURNO.md`, Blocos 9 a 13. Não repetir esse histórico aqui — ele não muda mais, essa frente está fechada.

## 2. REORGANIZAÇÃO FÍSICA COMPLETA DO PROJETO — ✅ CONCLUÍDA, VALIDADA E COMMITADA

Depois da V2 arquitetural concluída, o projeto inteiro foi reorganizado fisicamente (não só o código, a árvore de pastas toda). Ver `PASSAGEM_DE_TURNO.md` Bloco 14 para o processo completo e as decisões de poda de estrutura.

**Estrutura atual** (ver árvore completa e convenções em `docs/architecture/PROJECT_STRUCTURE.md` e `docs/architecture/ARCHITECTURE.md`):

- `src/app/` — `app.js` (bootstrap, 1.423 linhas) + `promocoes-financeengine.js` (cross-domínio)
- `src/financeiro/{caixas,cartoes,patrimonio,cenarios,indicadores,livros-razao,operacional,balanco,investimentos}/` — cada pasta reúne `hydrate-*`/`recalcular-*`/`reg-*`/`vars-*`/`render-*` do MESMO domínio de negócio
- `src/dashboard/{navigation,charts,widgets}/` — navegação, gráficos, widgets de UI
- `src/solar/` — Simulador Regulatório Solar
- `src/auditoria/{inbox,classificacao,verificacoes}/` — Inbox Financeira, classificação, auditoria automática
- `src/integrations/pluggy/` — reconciliação Pluggy
- `src/services/` — **não mexer na organização interna**: tem `import`/`require` relativos entre si (`CycleEngine.js`, `FinanceService.js`, `EnergiaService.js` etc.), mover qualquer um quebra referência. 9 dos 11 arquivos não são usados em produção (arquitetura anterior superada) — mantidos, fora de escopo.
- `docs/{architecture,changelog,decisions,database}/` — toda a documentação (este arquivo está em `docs/changelog/`)
- `scripts/{database,sync}/` — scripts Python (sincronização Pluggy/Mercado Pago/cotações/geração solar)
- `assets/{css,images}/` — CSS e favicons
- `tests/unit/` — os 3 testes `.test.js`

**Validado em navegador após a reorganização**: reload completo, ~140 requests de rede em 200 OK nos caminhos novos, console sem erro novo, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` íntegro, valores reais idênticos aos de antes da reorganização.

**Ajustes fora de `src/` já feitos**: os 4 workflows GitHub Actions (`atualizar_cotacoes_acoes.yml`, `atualizar_geracao_saj.yml`, `mercadopago_sync.yml`, `sincronizar_pluggy.yml`) e o `_headers` foram atualizados pros caminhos novos.

## 3. COMMITS — estado do git agora (confira sempre com `git log`/`git status`, isto pode ficar desatualizado rápido)

- **Tudo da V2 arquitetural + reorganização física está commitado** — commit `b83e165` "Conclusão da atualização V2" (que sozinho remove `app.js` da raiz — 8.890 linhas — e move ~78 arquivos) seguido do merge `e4a0226`, ambos já em `HEAD`.
- **O remote (`origin/main`) está 2 commits à frente do local** (`91bf9de` "Create CNAME", `962e834` "Delete CNAME") — edições pequenas feitas direto pelo GitHub web, relacionadas à decisão de deploy ainda em aberto (ver seção 5). Rodar `git pull` antes de mexer em CNAME/deploy pra não perder essas mudanças.
- **2 arquivos com mudanças NÃO commitadas agora**: `src/financeiro/caixas/vars-caixas.js` e `src/financeiro/cartoes/vars-mercado-pago.js` — sincronização de dados reais vindos do Supabase (transações `TX000192` a `TX000208`, que o arquivo local não tinha — achado durante a auditoria da reorganização física). Ver detalhe exato em `PASSAGEM_DE_TURNO.md` Bloco 15. **Não commitado ainda** (usuário commita via VS Code, nunca fazer isso pela IA sem pedido explícito) — avisar o usuário que esses 2 arquivos têm dado financeiro real pendente de revisão/commit.

## 4. Pendências que dependem de decisão do usuário

1. **Revisar e commitar (via VS Code) os 2 arquivos com sincronização de transações reais** (`vars-caixas.js`, `vars-mercado-pago.js` — ver seção 3). Não é código de infraestrutura, é dado financeiro real (TX000192-208) — vale conferir antes de commitar.
2. **Deploy**: retomar o plano do domínio próprio `wallacelira.com.br` (CNAME + Firebase authorized domain) — estava em andamento antes da reorganização física começar, congelado pra dar prioridade à reorganização. `git pull` primeiro pra trazer os 2 commits de CNAME já feitos no GitHub web.
3. **PIX Geral Vanessa**: campo `saldo_inicial_ciclo` da caixa no Supabase está com `78.04`, mas é dupla-contagem confirmada (mesmo valor já nas transações). Resíduo de R$78,08 aparece no painel V1↔V2 até o usuário decidir corrigir o banco (`update caixas set saldo_inicial_ciclo = 0 where nome = 'PIX Geral Vanessa'`) — **nunca fazer isso sem autorização explícita**.
4. **Caixa Lance**: diferença de R$266,23 (V1 vs V2) é divergência no saldo de abertura do ciclo, não erro de transação. Precisa de uma âncora de fechamento real (saldo confirmado em 24/07/2026) pra reconciliar — não tentar sem esse dado.
5. **`AJUSTE-06-08`** nas 8 caixas pequenas: classificação inconclusiva entre "rendimento CDI real" e "ajuste manual em lote" — não decidido, não removido. Ver `PASSAGEM_DE_TURNO.md` pro raciocínio completo.

## 5. Ambiente de teste local

- `.claude/launch.json` + `.claude/serve.ps1`: servidor HTTP estático local em PowerShell (porta 8081), serve os arquivos direto (`http://localhost:8081/Sistema_Wallace_Lira_Completo.html`).
- Login usa Firebase real (email/senha) — **a IA nunca digita senha em nenhum campo**, nem a do próprio usuário. Toda validação em navegador depende do usuário logar manualmente na aba primeiro (sessão fica em `sessionStorage`, persiste na aba enquanto ficar aberta). O painel real roda dentro de um `<iframe>` carregado por `index.html` — pra inspecionar via JS, usar `document.querySelector('iframe').contentWindow`.
- `window.WALLACE_VALIDACAO_RUNTIME` no console mostra as 18 fases FinanceEngine (`APROVADA`/`REPROVADA`) — teste de regressão rápido padrão depois de qualquer mudança.
