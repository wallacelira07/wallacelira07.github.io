# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site`.

## PRODUÇÃO: domínio oficial é `wallacelira.com.br`

`https://wallacelira.com.br/` (GitHub Pages por baixo) é o ambiente real. `git log --oneline -5` mostra tudo já commitado E enviado (`git push`) até `ca181c9` — **working tree limpo, nada pendente** no fim desta sessão.

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

## 1.5. FRENTE SEPARADA EM ANDAMENTO: unificação V1×V2 relacional (não confundir com a modularização abaixo)

**Se você está sendo pedido pra continuar reconciliação/correção V1×V2, saldo inicial de caixa, sincronização, duplicidade de `tx_legado` ou qualquer coisa envolvendo as tabelas `caixas`/`transacoes` do Supabase — pare aqui e vá direto para `docs/decisions/PLANO_UNIFICACAO_V1_V2.md`, seção 12 ("Handoff para o próximo agente").** Essa é uma frente de trabalho **completamente separada** desta migração de modularização do `app.js` (que também usa o termo "V2" em blocos antigos deste arquivo, mas se refere à V1 clássica virando módulos — não tem nada a ver com o Supabase relacional).

**Estado no corte (08/08/2026): Fase 1 parcial (cartao_id/usuario_id), Fase 2 concluída (audit_log), Fase 3 (diagnóstico/reconciliação) fechada formalmente, Fase 4A (correção das 5 âncoras `saldo_inicial_ciclo`) executada e registrada em `audit_log` — não reexecutar.** Fase 4B (sincronização V1→V2, dividida em 4B-1/4B-2) e Fase 4C (limpeza de 3 duplicidades `tx_legado` na Caixa Boletos) estão **detalhadas tecnicamente mas não implementadas** — nenhum INSERT, DELETE ou constraint foi criado. Decisão pendente do usuário: ordem de execução entre 4B-1, 4C e 4B-2 (4B-2 depende da 4C rodar primeiro). Próximo agente que for mexer nisso: leia a seção 12 do plano inteira antes de qualquer ação.

## 2. ATENÇÃO: DUAS ARQUITETURAS DE DADOS PARALELAS (V1 "clássica" e V2 "relacional") — fonte comum de confusão

Descoberto/confirmado nesta sessão (07/08/2026) que existem **DOIS sistemas de dados completamente separados**, e é fácil (já aconteceu nesta sessão) confundir um com o outro:

- **V1 ("clássica")**: `VARS`/`REG` estáticos (as fábricas `criarVarsXxx()`/`criarRegXxx()`) + uma única linha JSON no Supabase (`wallace_dados`, tabela solta, `id=1`, coluna `dados` jsonb) que é buscada a cada carregamento (`fetch` com `cache:'no-store'`) e sobrescreve por cima do VARS estático via `Object.assign(VARS, dr)`. **É isso que alimenta 100% do Painel Financeiro visível** (todos os cards, caixas, saldos que o usuário vê). Editar dado financeiro real = editar os 2 lugares (arquivo `.js` local E a linha `wallace_dados` no Supabase, via SQL direto tipo `jsonb_set`) pra manter os dois em sincronia — **só editar o arquivo local NÃO muda o que aparece no site ao vivo**, o Supabase sobrescreve por cima.
- **V2 ("relacional")**: tabelas normais do Postgres (`caixas`, `transacoes`, `categorias`, `usuarios` etc.), alimentadas pelo botão flutuante "+ Lançar" (grava via RPC `lancar_transacao_manual`) e pela Inbox Financeira (Aprovar pré-preenche o mesmo formulário). **Isso NÃO afeta o Painel visível ainda** — é dado paralelo, existe só pra comparação/migração futura (Fase 5, ainda não chegou). O painel flutuante "💰 V2" mostra os saldos calculados por essa arquitetura, e o `FASE 2F` da bateria de validação (`WALLACE_VALIDACAO_RUNTIME`) compara V1×V2 por caixa — divergência aqui é **esperada e não-bloqueante** enquanto as duas arquiteturas não forem unificadas (gate de segurança: só promove V2→V1 se as duas baterem, senão mantém V1 na tela).

**Implicação prática pra próxima sessão**: quando o usuário disser "lancei uma transação real", perguntar/confirmar se é pra entrar no V1 (o que aparece no painel — editar `wallace_dados` no Supabase) ou também replicar no V2 (formulário "+ Lançar"). Hoje (07/08) só o V1 foi mantido atualizado; a Inbox Financeira tinha 12 itens pendentes que **foram todos rejeitados** nesta sessão porque já estavam cobertos no V1 manualmente — **nenhum foi lançado no V2** (então o V2 e o V1 estão propositalmente dessincronizados agora, é esperado).

## 3. Lançamentos financeiros reais aplicados (07-08/08/2026) — todos no V1 (arquivo local + Supabase `wallace_dados`)

Ver `PASSAGEM_DE_TURNO.md` Bloco 15/16 para a lista completa e valores exatos. Resumo:
- Reembolso Bradesco R$312 (split R$164,94 Caixa Lance + R$147,06 Caixa Saúde Família), cortinas R$450 + empréstimo LREI0004 R$103,55 (Lance→Manutenção), reembolso Wärtsilä R$340 (dentro da própria Caixa Wärtsilä, não Caixa Lance — segue cascata da política seção 5), R$107,50 adiantamento bolo de Júlio (Variável↔Aniversário↔Vanessa), Hortifruti R$46,97 (PIX Geral Vanessa), correção de IOF ausente em 2 compras Anthropic (TX000200/TX000205, +R$3,72 cada).
- `reembolsoAReceber` (Wärtsilä) atualizado pra R$6.700,61 (usuário confirmou), R$340 já recebido conta à parte.
- Inbox Financeira: 12 pendentes → 0 pendentes (11 rejeitados por já estarem cobertos no V1; 1 item de R$652 desapareceu sozinho da Inbox antes de qualquer rejeição manual — **motivo ainda desconhecido, ver seção 7 item 2, continua em aberto**).
- **Compra Dr.Pizza R$207,02 — RESOLVIDA (08/08, commit `1f1a69a`).** Causa raiz: outra sessão de chat lançou a compra direto na tabela `transacoes` (V2 relacional) sem tocar no V1 — explicava a divergência do badge e o fato de nunca debitar a Caixa Variável nem entrar no LRW. Portada pro V1 (`TX000222`, `mbLRWConfirmado`/`cartaoMBTotal` +207,02). Achado secundário corrigido: a transação na V2 estava com `afeta_saldo_real=true` indevidamente (compra de cartão só compromete fatura futura, regra já documentada em Políticas Internas seção 13).

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
4. **Botões flutuantes (FAB) — RESOLVIDO (08/08/2026, commit `eebc5f7`).** O pedido original evoluiu: usuário mandou print marcando posição exata, design final ficou diferente do "círculo pequeno com hover" cogitado antes — no mobile virou retângulo alto (4.4rem, cantos arredondados só à esquerda), dock subiu de `top:50%` pra `top:44%`, tira visível por padrão de 22px (antes 16px). Aplicado em `src/app/app.js` (classe `.wallace-fab`/`#wallaceFabDock`). Não reabrir como pendência — se usuário pedir novo ajuste visual, é revisão nova.

## 6. Como aplicar dado financeiro real daqui pra frente (fluxo que se consolidou nesta sessão)

1. Usuário confirma o lançamento (nunca aplicar sem confirmação explícita — regra permanente).
2. Aplicar nos 2 lugares do V1: arquivo `.js` local relevante (`src/financeiro/**/vars-*.js`) **e** a linha `wallace_dados` no Supabase (SQL via MCP `execute_sql`, tipo `dados = dados || jsonb_build_object('CHAVE', ...)` pra arrays, ou `jsonb_set` pra campo aninhado) — **checar antes se a chave em questão realmente existe na linha do Supabase** (`select jsonb_object_keys(dados) from wallace_dados where id=1`), porque nem toda chave do VARS está espelhada lá (ex: `WARTSILA_CAIXA_TRANSACOES`/`reembolsoCicloTotal` não estavam, tiveram que ser adicionadas como chave nova).
3. **Autorização de commit mudou nesta sessão**: usuário disse explicitamente "você comita sozinho, só me avise antes" — não é mais preciso esperar pedido pra cada commit individual, só avisar o que vai ser commitado antes de rodar `git commit`. `git push` também já foi autorizado ("se precisar faça o deploy"). Ver memória `feedback_workflow_sessao` (arquivo de memória, não deste repo) pra detalhe completo dessa mudança de regra.

## 7. Pendente / em aberto (atualizado 08/08/2026)

**Resolvidas desde a última reescrita — não reabrir como bug novo:** redesign dos botões flutuantes (item 4 da seção 5), compra Dr.Pizza R$207,02 (seção 3), Caixa Lance reconciliada do lado V1 (item 6 abaixo), `AJUSTE-06-08` revisado (item 7 abaixo).

1. **R$652,00 sumiu da Inbox Financeira sozinho**, sem ninguém rejeitar — motivo ainda desconhecido. Não confundir com o caso do Dr.Pizza (já resolvido, era outra causa). Se reaparecer, investigar `src/auditoria/classificacao/classificacao-inbox.js` e `src/integrations/pluggy/pluggy-reconciliacao.js` (fontes que alimentam `VARS.INBOX_FINANCEIRA`).
2. **Cache stale da API REST do Supabase** (seção 4, item 6) — não investigado, só documentado. SQL direto via MCP mostrou R$5.056,95 pra `cascata.faturaWartsila`, navegador recebeu R$5.768,06 da REST API mesmo com `cache:'no-store'`. Pode ser CDN/edge cache do Supabase na frente do PostgREST.
3. **IDs da Inbox Financeira (`INBX000001` etc.) são posicionais, não estáveis** — renumeram a cada render quando um item é rejeitado (confirmado empiricamente). Perigoso se algum código guardar um `INBX00000X` como referência persistente — auditar `classificacao-inbox.js`/`inbox-financeira.js` antes de mexer de novo.
4. **PIX Geral Vanessa**: `saldo_inicial_ciclo` duplicado no Supabase (R$78,04, dupla-contagem confirmada) — usuário recusou corrigir até ter mais clareza.
5. **Caixa Boletos**: falta o saldo real de abertura do ciclo em 25/07. Causa raiz: `CICLO_ATUAL_INICIO` hardcoded em `FinanceService.js:38`; simulação mostrou que corrigir só Boletos pioraria outras 9 caixas — não é correção uniforme viável. Ver também Fase 4C do plano de unificação (duplicidades `tx_legado` nessa mesma caixa, na V2).
6. **Caixa Lance — RECONCILIADA do lado do V1 (08/08/2026).** Reconstrução completa dos 10 lançamentos de `CAIXA_LANCE_TRANSACOES` contra extratos bancários reais (9 dos 10 confirmados com prova documental). A âncora `CAIXA_LANCE_SALDO_INICIAL_CICLO = R$3.748,74` foi confirmada matematicamente — **descarta hipótese de dupla contagem ou erro estrutural no V1**. A divergência remanescente V1×V2 (~R$318) é atribuída ao V2 desatualizado/incompleto, não a erro do V1 — usuário concordou, **não reabrir**. Único item ainda sem lastro documental: `RENDIMENTO-31-07` (+R$9,42) — por decisão do usuário, mantido como está, só marcado como pendente de validação.
7. **`AJUSTE-06-08` — REVISADO (08/08/2026).** Hipótese anterior ("6 caixas são ajuste artificial, candidatas a remoção") foi contestada: a maioria dos padrões `AJUSTE-DD-MM`/`RENDIMENTO-DD-MM` (12 caixas ao todo) não são artificiais — são rendimento real de cofrinho do Mercado Pago, que não emite comprovante diário. **Não remover nenhum `AJUSTE-*`/`RENDIMENTO-*` até o usuário revisar essa nova interpretação.**
8. **Plano de Unificação V1→V2**: Fase 4B (sincronização, 2 partes) e Fase 4C (limpeza de 3 duplicidades na Caixa Boletos) detalhadas tecnicamente mas não implementadas — decisão de ordem de execução pendente do usuário. Ver seção 1.5 acima e `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` seção 12.
9. **Firebase Console → Authentication → Settings → Authorized domains**: precisa confirmação manual de que `wallacelira.com.br` está cadastrado — IA não consegue checar isso.

## 8. Ambiente de teste local

- `.claude/launch.json` + `.claude/serve.ps1`: servidor HTTP estático local em PowerShell (porta 8081), `http://localhost:8081/index.html`.
- Login usa Firebase real — **a IA nunca digita senha**. Painel roda dentro de `<iframe id="mainIframe">` carregado por `index.html` — inspecionar via `document.getElementById('mainIframe').contentWindow`. `VARS`/`REG` são bindings léxicos de topo (`const`), **não** aparecem como propriedade do `window` do iframe — usar `contentWindow.eval('VARS.algumaCoisa')` pra ler de fora, não `contentWindow.VARS` direto (dá `undefined` mesmo existindo).
- `window.WALLACE_VALIDACAO_RUNTIME` (array de 18 fases `{fase, resultado, motivo}`) e `document.getElementById('healthBadge')` (12 checagens matemáticas do REG) são os 2 testes de regressão padrão depois de qualquer mudança.
