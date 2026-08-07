# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 07/08/2026 (fim de sessão, handoff por limite de crédito), via Claude Code, direto em `G:\My Drive\Livro Razão\Site`.

## PRODUÇÃO: domínio oficial é `wallacelira.com.br`

`https://wallacelira.com.br/` (GitHub Pages por baixo) é o ambiente real. `git log --oneline -6` mostra tudo já commitado E enviado (`git push`) até `422b04d` — **working tree limpo, nada pendente** no fim desta sessão.

**Pendente de verificação manual (não dá pra checar por código)**: confirmar em Firebase Console → Authentication → Settings → Authorized domains que `wallacelira.com.br` está cadastrado.

**A V2 arquitetural e funcional estão concluídas (18/18 fases, ver seção 1).** Trabalho novo é otimização/manutenção evolutiva/produção — mas **ver seção 6, existem 2 arquiteturas paralelas de dados (V1 e V2) e é fácil confundir uma com a outra.**

## Protocolo de sessão nova (leia nesta ordem)

1. Este arquivo (`ESTADO_ATUAL.md`)
2. `PASSAGEM_DE_TURNO.md` — Bloco 16 tem o histórico mais recente (sessão de 07/08/2026, handoff por limite de crédito, ver detalhes de tudo que ficou pela metade)
3. `docs/architecture/ARCHITECTURE.md` + `docs/architecture/PROJECT_STRUCTURE.md`
4. **Sempre conferir o estado real do código** (`git status`, `git log --oneline -10`) **antes de assumir qualquer coisa como pendente ou concluído.**

---

## 1. MODULARIZAÇÃO V2 ARQUITETURAL + REORGANIZAÇÃO FÍSICA — ✅ CONCLUÍDAS (sem mudança nesta sessão)

`app.js` → `src/app/app.js`, `VARS`/`REG` modularizados em fábricas por domínio, projeto reorganizado em pastas por domínio de negócio. Sem novidade aqui nesta sessão — ver `PASSAGEM_DE_TURNO.md` Blocos 9-14 pro histórico completo, não repetir.

## 2. ATENÇÃO: DUAS ARQUITETURAS DE DADOS PARALELAS (V1 "clássica" e V2 "relacional") — fonte comum de confusão

Descoberto/confirmado nesta sessão (07/08/2026) que existem **DOIS sistemas de dados completamente separados**, e é fácil (já aconteceu nesta sessão) confundir um com o outro:

- **V1 ("clássica")**: `VARS`/`REG` estáticos (as fábricas `criarVarsXxx()`/`criarRegXxx()`) + uma única linha JSON no Supabase (`wallace_dados`, tabela solta, `id=1`, coluna `dados` jsonb) que é buscada a cada carregamento (`fetch` com `cache:'no-store'`) e sobrescreve por cima do VARS estático via `Object.assign(VARS, dr)`. **É isso que alimenta 100% do Painel Financeiro visível** (todos os cards, caixas, saldos que o usuário vê). Editar dado financeiro real = editar os 2 lugares (arquivo `.js` local E a linha `wallace_dados` no Supabase, via SQL direto tipo `jsonb_set`) pra manter os dois em sincronia — **só editar o arquivo local NÃO muda o que aparece no site ao vivo**, o Supabase sobrescreve por cima.
- **V2 ("relacional")**: tabelas normais do Postgres (`caixas`, `transacoes`, `categorias`, `usuarios` etc.), alimentadas pelo botão flutuante "+ Lançar" (grava via RPC `lancar_transacao_manual`) e pela Inbox Financeira (Aprovar pré-preenche o mesmo formulário). **Isso NÃO afeta o Painel visível ainda** — é dado paralelo, existe só pra comparação/migração futura (Fase 5, ainda não chegou). O painel flutuante "💰 V2" mostra os saldos calculados por essa arquitetura, e o `FASE 2F` da bateria de validação (`WALLACE_VALIDACAO_RUNTIME`) compara V1×V2 por caixa — divergência aqui é **esperada e não-bloqueante** enquanto as duas arquiteturas não forem unificadas (gate de segurança: só promove V2→V1 se as duas baterem, senão mantém V1 na tela).

**Implicação prática pra próxima sessão**: quando o usuário disser "lancei uma transação real", perguntar/confirmar se é pra entrar no V1 (o que aparece no painel — editar `wallace_dados` no Supabase) ou também replicar no V2 (formulário "+ Lançar"). Hoje (07/08) só o V1 foi mantido atualizado; a Inbox Financeira tinha 12 itens pendentes que **foram todos rejeitados** nesta sessão porque já estavam cobertos no V1 manualmente — **nenhum foi lançado no V2** (então o V2 e o V1 estão propositalmente dessincronizados agora, é esperado).

## 3. Lançamentos financeiros reais aplicados nesta sessão (07/08/2026) — todos no V1 (arquivo local + Supabase `wallace_dados`)

Ver `PASSAGEM_DE_TURNO.md` Bloco 15/16 para a lista completa e valores exatos. Resumo:
- Reembolso Bradesco R$312 (split R$164,94 Caixa Lance + R$147,06 Caixa Saúde Família), cortinas R$450 + empréstimo LREI0004 R$103,55 (Lance→Manutenção), reembolso Wärtsilä R$340 (dentro da própria Caixa Wärtsilä, não Caixa Lance — segue cascata da política seção 5), R$107,50 adiantamento bolo de Júlio (Variável↔Aniversário↔Vanessa), Hortifruti R$46,97 (PIX Geral Vanessa), correção de IOF ausente em 2 compras Anthropic (TX000200/TX000205, +R$3,72 cada).
- `reembolsoAReceber` (Wärtsilä) atualizado pra R$6.700,61 (usuário confirmou), R$340 já recebido conta à parte.
- Inbox Financeira: 12 pendentes → 0 pendentes (11 rejeitados por já estarem cobertos no V1; 1 item de R$652 **desapareceu sozinho da Inbox antes de eu mexer nele — motivo desconhecido, vale investigar se reaparecer**).

## 4. Bugs reais encontrados e corrigidos nesta sessão

1. **Performance de carregamento** (~10-15s → ~4s medido local): 55 módulos + 3 fetches iniciais eram 100% sequenciais (`document.write`/`await` em cadeia) — paralelizados. Cache-busting `Date.now()` (nunca cacheava nada) trocado por versão fixa `__V` (bump manual em deploy futuro, ver `Sistema_Wallace_Lira_Completo.html` linha ~1452).
2. **Bug de parser HTML real**: um comentário JS continha o texto literal `</script>` — fechava a tag prematuramente, truncando todo o resto do bloco (causa de "ReferenceError: __V is not defined" e tela travada em "—"). **Lição**: nunca escrever `</script>` como texto solto dentro de um bloco `<script>`, nem em comentário — sempre quebrar a string tipo `'<' + '/script>'` se precisar mencionar.
3. **Card FGTS**: placeholder HTML tinha valor antigo hardcoded (`R$ 77.683,60`) em vez de `—` — mascarava falha de carregamento como se fosse valor fixo real. Corrigido pra `—`, igual aos outros cards.
4. **Card Caixa Wärtsilä**: (a) número principal mostrava a fatura em vez do saldo real da caixa — trocado; (b) barra de progresso era decorativa (`width:100%` fixo no HTML, sem id) — agora conectada; (c) legenda usava um indicador genérico do ciclo (`recebidosNoCiclo = reembolsoCicloTotal - reembolsosAReceber`) que dava **negativo** mesmo com dinheiro real recebido, sempre mostrando "R$0 recebido" — trocado pra comparar direto provisionado×fatura desta caixa específica.
5. **IOF ausente** em 2 transações Mastercard Black (Anthropic, TX000200/TX000205) — valor não incluía os 3,38% apesar do comentário dizer que incluía. Corrigido nos 2 + no total mestre `cartaoMBTotal`.
6. **API REST do Supabase servindo resposta em cache** mesmo com `cache:'no-store'` no fetch (confirmado: SQL direto via MCP mostrava R$5.056,95 pra `cascata.faturaWartsila`, mas o navegador recebia R$5.768,06 da REST API) — **não investigado a fundo, não corrigido, só documentado aqui.** Pode ser CDN/edge cache do Supabase na frente do PostgREST.

## 5. Features novas implementadas nesta sessão (não são bugfix, são pedido explícito do usuário)

1. **Saudação premium**: "Bom dia/Boa tarde/Boa noite, Wallace/Vanessa" no topo do painel, conforme e-mail logado (`wallace.termica@gmail.com` / `vanessaflor.galdino@gmail.com`, únicos 2 com acesso) + horário local. `Sistema_Wallace_Lira_Completo.html` (guard de acesso no topo + elemento `#saudacaoPremium`), CSS em `assets/css/styles.css` (`.greeting-premium`).
2. **Logout por inatividade**: 15 minutos sem interação (mouse/teclado/toque/scroll) desloga sozinho. `index.html` (`iniciarMonitorInatividade`/`resetarTimerInatividade`/`pararMonitorInatividade`).
3. **Formulário "+ Lançar" (V2)**: opção de dividir o valor lançado entre mais de 1 caixa (várias linhas caixa+valor, valida soma=total, 1 chamada de RPC por linha) e opção de criar categoria nova direto do formulário (nova função Postgres `criar_categoria`, `SECURITY DEFINER`, evita duplicata por nome — ver migration aplicada via Supabase MCP, não está em nenhum arquivo `.sql` do repo, só no banco).
4. **Botões flutuantes redesenhados**: de pill fina/quase transparente pra botão sólido com gradiente (ainda **INCOMPLETO**, ver seção 7 "Pendente/incompleto").

## 6. Como aplicar dado financeiro real daqui pra frente (fluxo que se consolidou nesta sessão)

1. Usuário confirma o lançamento (nunca aplicar sem confirmação explícita — regra permanente).
2. Aplicar nos 2 lugares do V1: arquivo `.js` local relevante (`src/financeiro/**/vars-*.js`) **e** a linha `wallace_dados` no Supabase (SQL via MCP `execute_sql`, tipo `dados = dados || jsonb_build_object('CHAVE', ...)` pra arrays, ou `jsonb_set` pra campo aninhado) — **checar antes se a chave em questão realmente existe na linha do Supabase** (`select jsonb_object_keys(dados) from wallace_dados where id=1`), porque nem toda chave do VARS está espelhada lá (ex: `WARTSILA_CAIXA_TRANSACOES`/`reembolsoCicloTotal` não estavam, tiveram que ser adicionadas como chave nova).
3. **Autorização de commit mudou nesta sessão**: usuário disse explicitamente "você comita sozinho, só me avise antes" — não é mais preciso esperar pedido pra cada commit individual, só avisar o que vai ser commitado antes de rodar `git commit`. `git push` também já foi autorizado ("se precisar faça o deploy"). Ver memória `feedback_workflow_sessao` (arquivo de memória, não deste repo) pra detalhe completo dessa mudança de regra.

## 7. Pendente / incompleto no fim desta sessão (handoff por limite de crédito, não por conclusão)

1. **Redesign dos botões flutuantes ficou pela metade.** O usuário rejeitou o visual "pill sólida com gradiente" (achou "horroroso", mandou print de referência) e pediu: círculo pequeno com ícone/emoji, e ao passar o mouse uma "tira lateral" desliza revelando o texto/descrição (padrão comum de FAB com label on-hover). **Nenhum código novo foi escrito pra isso ainda** — só decidido o approach (CSS com label posicionado absoluto atrás do círculo, `opacity`/`transform` no hover). Próximo passo: implementar em `src/app/app.js` (procurar `.wallace-fab` — é onde o CSS antigo/atual desses botões mora, criado dinamicamente via `<style>` injetado por JS, não em `assets/css/styles.css`).
2. **R$652,00 sumiu da Inbox Financeira sozinho**, sem eu rejeitar — não investigado por quê. Se reaparecer ou se notar outros itens sumindo sem ação do usuário/IA, vale investigar `src/auditoria/classificacao/classificacao-inbox.js` e `src/integrations/pluggy/pluggy-reconciliacao.js` (fontes que alimentam `VARS.INBOX_FINANCEIRA`).
3. **Cache stale da API REST do Supabase** (seção 4, item 6) — não investigado, só documentado.
4. **IDs da Inbox Financeira (`INBX000001` etc.) parecem ser posicionais, não estáveis** — ao rejeitar um item, os que restam são renumerados no próximo render (confirmado empiricamente nesta sessão: um item que era "007" virou "004" depois de outras rejeições). Isso é OK pra uso manual (sempre reconferir o conteúdo antes de agir), mas **perigoso se algum código em outro lugar guardar um `INBX00000X` como referência persistente** — vale auditar `classificacao-inbox.js`/`inbox-financeira.js` se isso for mexido de novo.
5. **Pendências antigas, ainda não resolvidas** (herdadas de sessões anteriores, não tocadas nesta): PIX Geral Vanessa `saldo_inicial_ciclo` duplicado no Supabase (R$78,04), Caixa Lance R$266,23 de diferença V1×V2 (precisa âncora de fechamento de ciclo), `AJUSTE-06-08` nas 8 caixas pequenas (rendimento real vs ajuste manual, inconclusivo), Firebase Authorized Domains (verificação manual).

## 8. Ambiente de teste local

- `.claude/launch.json` + `.claude/serve.ps1`: servidor HTTP estático local em PowerShell (porta 8081), `http://localhost:8081/index.html`.
- Login usa Firebase real — **a IA nunca digita senha**. Painel roda dentro de `<iframe id="mainIframe">` carregado por `index.html` — inspecionar via `document.getElementById('mainIframe').contentWindow`. `VARS`/`REG` são bindings léxicos de topo (`const`), **não** aparecem como propriedade do `window` do iframe — usar `contentWindow.eval('VARS.algumaCoisa')` pra ler de fora, não `contentWindow.VARS` direto (dá `undefined` mesmo existindo).
- `window.WALLACE_VALIDACAO_RUNTIME` (array de 18 fases `{fase, resultado, motivo}`) e `document.getElementById('healthBadge')` (12 checagens matemáticas do REG) são os 2 testes de regressão padrão depois de qualquer mudança.
