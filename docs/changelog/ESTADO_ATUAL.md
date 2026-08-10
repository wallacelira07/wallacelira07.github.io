# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

## ✅ Mais 6 caixas fecharam em R$0,00 — mesma técnica da Caixa Lance, aplicada em série (09/08/2026, mesma sessão)

Depois de achar o padrão real na Caixa Lance (consultar `wallace_dados` direto em vez do arquivo JS local), usei o mesmo diagnóstico (`vw_reconciliacao_v1_v2`) pra varrer as 12 caixas que o console do usuário mostrava com "quantidade de transações V1≠V2". Resultado:

- **4 caixas com resíduo minúsculo (<R$3), causa idêntica**: Escola de Júlio (R$2,06), Caixa Seguro Emplacamento (R$0,88), Caixa Combustível (R$0,40), Caixa Eventos (R$0,34) — todas tinham um `AJUSTE-06-08` (rendimento acumulado, real, confirmado pelo usuário em 06/08) nunca migrado pra V2. Inseridos os 4 de uma vez, confirmando ausência antes. Todas fecharam em R$0,00.
- **Caixa Saúde Família** (R$147,12) e **Caixa Aniversário Júlio** (R$107,10) — mesmo padrão da Manutenção: `TX000213` (Saúde Família) estava preso em `status='pendente_classificacao'`; Aniversário Júlio tinha `TX000208` e `AJUSTE-06-08` totalmente ausentes. Corrigido, ambas fecharam em R$0,00. **Promovidas no código** (`hydrate-onda2-v2.js` + `hydrate-onda3-livro-razao.js`, saldo e tabela juntos, mesmo tratamento das outras).

**Paradas por cautela, não é o mesmo padrão limpo**:
- **PIX Vanessa** (R$300) — os lançamentos da caixa V2 não batem com o array V1 `LRPV_TRANSACOES` nem em conteúdo nem em sinal (ex: `TX000150` aparece como entrada num lado e saída no outro). Não é "faltou migrar", é uma inconsistência estrutural — não mexi sem entender a causa raiz de verdade.
- **Caixa Bens Duráveis** (R$583,99) — o array V1 tem um `AJUSTE-06-08` que zera a compra do fone+cortador (~R$355) porque essa caixa virou um centro de custo separado por decisão explícita do usuário numa sessão anterior (pode ficar negativa, não é mais debitada da Caixa Variável) — a comparação direta com V1=R$0,00 pode estar comparando coisas que não deveriam mais ser iguais. Não mexi sem confirmar com o usuário.

**Estado das 12 caixas do diagnóstico do console**: 6 já eram V2 (Caixa Variável, Bens Duráveis, PIX Geral Vanessa — resíduo aceito e documentado antes —, Mastercard/Infinite não estava na lista de exceção), agora +6 fecharam nesta rodada. Restam só PIX Vanessa e Bens Duráveis com pendência real de investigação.

## ✅ Caixa Lance promovida pra V2 — causa raiz real fechada com evidência da fonte (09/08/2026, mesma sessão)

Resíduo de R$85,76 (1,90%) que tinha ficado em aberto: a causa não estava nos extratos bancários (MP julho/junho, já lidos nesta sessão), estava na própria fonte V1. **Consultando `wallace_dados` direto (não o arquivo JS estático `vars-caixas.js`, que só tinha 8 dos 10 itens reais do array)**, achei os 2 itens que faltavam: `RENDIMENTO-31-07` (+R$9,42, rendimento real — já existia certo na V2) e `AJUSTE-06-08` (-R$65,76, correção manual que o usuário já tinha feito em 06/08 contra print real do Mercado Pago — nunca migrada pra V2). Inserido via `UPDATE`. Resíduo caiu de R$85,76 pra **R$20,00** (0,44%), agora com **alta confiança**: é uma venda de P2P real que já existe na V2 mas nunca foi copiada de volta pro V1 — mesmo padrão já aceito nas outras caixas promovidas (V2 recebe lançamento novo direto, V1 não acompanha automaticamente).

**Promovida**: `hydrate-onda3-caixalance.js` (saldo — cards `balResLance`/`patLance`) e `hydrate-onda3-livro-razao.js` (tabela de lançamentos, nova entrada `lrlanceTbody`) — mesma fonte V2 nos dois lugares, mesmo cuidado já usado na Caixa Manutenção pra não deixar "card V2 + tabela V1" inconsistentes.

**Lição prática confirmada nesta investigação**: o arquivo JS estático (`vars-caixas.js`) pode ficar desatualizado em relação ao `wallace_dados` real no Supabase — quando uma reconciliação não fecha com o que está no arquivo, vale sempre conferir a fonte viva antes de concluir "causa indeterminada".

## 🚨 Quase-duplicação evitada + 3 melhorias de mobile/UX entregues (09/08/2026, mesma sessão)

**Quase-incidente, revertido a tempo**: durante a investigação de reconciliação de cartão (Visa Infinite 4844), assumi que "zero linhas em `transacoes` pra esse `cartao_id`" significava "nada rastreado" — errado. O usuário interrompeu no meio da migration ("não lance, você vai duplicar") depois de eu já ter inserido 41 transações de julho. **Revertido imediatamente** (`DELETE FROM transacoes WHERE tx_legado LIKE 'TX4844-%'`, confirmado 0 linhas depois). Causa raiz do meu erro: essas mesmas compras já estavam lançadas manualmente linha a linha em outro mecanismo do sistema (confirmado pelo usuário com prints de uma tela de Livro Razão por categoria — TX000012, TX000017, TX000018... os mesmos estabelecimentos que eu ia inserir de novo). **Lição registrada**: nunca mais assumir "ausente numa tabela = nunca lançado" sem confirmar onde o dado real mora primeiro.

**3 correções de UI entregues e testadas** (Browser local, sem precisar de login real pra verificar DOM/CSS):
1. **Busca sumia no mobile** — `.header-search-wrap` tinha `display:none` fixo abaixo de 780px, sem alternativa nenhuma. Adicionado botão só-ícone (`#headerSearchToggleBtn`, `index.html`) que abre o mesmo campo como overlay. Testado: toggle abre/fecha corretamente.
2. **Barra de 22 categorias do Livro Razão ilegível no mobile** (achado via prints do usuário) — grade `auto-fill` quebrava em ~11 linhas antes de mostrar qualquer dado. Vira uma faixa rolável horizontal só abaixo de 640px (`assets/css/styles.css`), desktop inalterado.
3. **Link direto pra uma aba específica** (pedido do usuário: "mandar o link e abrir só a aba, geralmente é a solar") — `index.html?aba=solar` agora repassa o parâmetro pro iframe, que troca de `master-pane` automaticamente no boot. **Bug real encontrado e corrigido durante o teste**: a primeira versão usava `onDomPronto()`, que roda cedo demais — `showMaster()` (definida em `ui-navegacao-basica.js`, carregado DEPOIS de `app.js`) ainda não existia nesse momento, então nada acontecia silenciosamente. Corrigido trocando pra `window.addEventListener('load', ...)`, que só dispara depois de todos os scripts carregarem. Testado com `?aba=solar` (abre em Solar) e sem parâmetro (continua abrindo em home) — os dois casos confirmados via DOM real no navegador.

**Não validado com login real** — testes de UI feitos via preview local com sessão falsa (`sessionStorage` forjado só pra passar o guard de "sessão não encontrada"), suficiente pra confirmar DOM/CSS/JS mas não a experiência completa logada. Usuário deve conferir os 3 itens no celular/navegador real na próxima vez que abrir o site.

## 🔧 "Matar V1" parte 2 — Caixa Manutenção promovida, causa raiz real encontrada; resto continua bloqueado por dado genuíno faltando, não por falta de tentativa (09/08/2026)

Usuário autorizou mexer nos itens antes marcados como "exceção deliberada" e nos 2 blocos maiores (Cartões, LRW/LRV/LRC-limbo/LRCV): "Continue e mexa em tudo, eu autorizo. 1 e 2 resolva". Investiguei caso a caso com evidência real (não só documentação) antes de tocar em qualquer saldo.

**✅ Caixa Manutenção — PROMOVIDA pra V2, causa raiz real confirmada**: a divergência de R$345,73 (V1≈R$0,72 × V2 mostrando R$346,45) não era "causa indeterminada" como a Onda 2 registrava — era um bug de status: `TX000214` ("Cortinas", -R$450) e `TX000215` (empréstimo LREI0004, +R$103,55), já mostradas no V1 há dias, estavam presas em `status='pendente_classificacao'` na V2, e `vw_saldo_v2_por_caixa` só soma `status='confirmado'`. Corrigido via `UPDATE` direto (confirmado o status das 2, mais o par espelhado `TX000212`/`TX000216` da Caixa Lance, mesmo par LREI). Depois da correção: V1=R$0,72 × V2=R$0,00, resíduo pequeno com causa identificada (`transacao_ausente_na_v2`, alta confiança) — mesma classe de "divergência conhecida e aceita" já usada nas outras caixas. `hydrate-onda2-v2.js` e `hydrate-onda3-livro-razao.js` atualizados (saldo + tabela de lançamentos).

**Achado lateral, corrigido no caminho**: o comentário de `hydrate-onda2-v2.js` sobre "Provisionado Wärtsilä" estava desatualizado — dizia que a caixa não tinha equivalente V2 pro card de "4 estados de texto", mas na verdade a Onda 4 (`hydrate-onda4-wartsila.js`, sessão anterior) já resolve isso desde 08/08 (`REG.wartsilaCaixa.provisionado` vem de V2, `hydrateWartsilaCaixasTextos()` é re-chamada). Comentário corrigido pra não confundir a próxima sessão.

**❌ Caixa Lance — investigada, NÃO promovida, gap ficou mais claro mas não fechado**: depois de confirmar o mesmo par LREI (`TX000212`/`TX000216`), o V2 na verdade **piorou** (de -R$24,37 pra -R$85,76) — a caixa já tinha esses 2 lançamentos representados de outro jeito no V1. Isolei 2 causas reais dentro do resíduo: (a) 2 transações reais que existem só na V2 (`PIX-VANESSA-21-07` +R$73, um P2P +R$20 sem `tx_legado`) nunca foram adicionadas ao array V1 — explicam boa parte da diferença; (b) ainda sobra 1 transação de R$65,76 "só no V1" (nunca migrada) + 2 "ajustes manuais" do V1 totalizando -R$56,34 sem transação real correspondente na V2, nenhum dos dois identificado com precisão suficiente pra corrigir sem arriscar erro. Fica pra próxima sessão com esse ponto de partida (bem mais claro que "causa indeterminada").

**❌ LRW/LRV — modelo de dado já aprovado (seção 15 do plano) e dados reais já existem em `transacoes`** (`caixa_id='Caixa Variável'`, `cartao_id` set, `afeta_saldo_real=false`, split por `usuario_id`), confirmado consultando o banco: Wallace 24 transações/R$932,10, Vanessa 6/R$221,62. **Mas 3 transações (R$282,71) têm `usuario_id=NULL`** — sem dono definido, incluindo pelo menos 1 caso documentado que já teve exceção manual antes ("Uber de Gabriela sempre vai pro LRW", regra dada pelo usuário em sessão anterior). Não decidi esses 3 sozinho — atribuir errado divide dinheiro real entre as duas pessoas erroneamente. **Fica bloqueado até o usuário classificar essas 3 transações.**

**❌ LRC-limbo/LRCV — continuam sem modelo de dado definido** (`PLANO_UNIFICACAO_V1_V2.md` seção 35). Diferente de LRW/LRV, aqui não existe nem uma decisão arquitetural aprovada ainda — não é questão de dado faltando, é questão de definição que ninguém tomou. Não tentei inventar uma.

**❌ Cartões Mastercard/Visa (totais de fatura) — não mexido**: continua exigindo reconciliação bancária manual real (extrato vs. sistema) que não está em nenhuma tabela do Supabase — não é algo que dá pra resolver só com SQL/código, precisa do usuário confirmar contra o extrato real, mesmo padrão já usado nos casos Wärtsilä/PGV desta sessão longa.

**❌ Caixa Saúde Família / Caixa Aniversário Júlio — achado novo, mais sério do que a documentação anterior sugeria**: essas 2 caixas **não existem como linha na tabela `caixas` da V2** — não é "saldo desatualizado", é ausência total de estrutura. Promovê-las exigiria criar a caixa + fazer backfill de todo o histórico de transações a partir do array V1 (`SAUDE_FAMILIA_TRANSACOES`/`ANIVERSARIO_JULIO_TRANSACOES`), trabalho real de reconstrução, não uma correção pontual. Não tentado nesta sessão por tempo — registrado como o maior item de esforço real que sobrou.

**Por que parei aqui mesmo com autorização pra "mexer em tudo"**: autorização resolve permissão, não resolve dado que não existe (3 transações sem dono, modelo de LRC-limbo/LRCV nunca definido) nem reconciliação bancária que só existe no extrato real do usuário. Forçar essas migrações teria significado inventar quem gastou o quê, ou publicar como "V2 verificado" um número que na real ninguém conferiu contra o banco. Isso quebra a única regra que sustentou todo o trabalho de reconciliação financeira desta sessão (Nível A: evidência antes de mexer em dinheiro real).

**Não validado em navegador real** — sem credenciais de login, e o hook do ambiente avisou que outra sessão já está com um dev server rodando nesta mesma pasta (não alcançável por este Browser). Validação foi só contra o banco (`vw_reconciliacao_v1_v2` antes/depois). Usuário deve conferir a aba "Manutenção" (card + Livro Razão) na próxima vez que abrir o site.

Última reescrita: 09/08/2026, continuação da sessão longa — auditoria de prontidão operacional executada com evidência ao vivo (advisors do Supabase, RLS real, grants reais, código-fonte das RPCs) seguida do fechamento imediato de todos os achados críticos, a pedido explícito do usuário ("corrija tudo o mais rápido possível"), seguida de um levantamento completo pra "matar V1" (pedido explícito do usuário, escopo confirmado: tudo que ainda lê `wallace_dados`/`VARS` no painel). `git status` limpo (fora dos `desktop.ini` inofensivos do Google Drive Desktop, nunca commitados) até este commit.

## 🗺️ Levantamento completo "matar V1" — resultado: menos trabalho pendente do que parecia, 2 blocos genuinamente bloqueados

Usuário pediu pra migrar tudo que ainda depende de `wallace_dados`/`VARS` pra V2 relacional, sem parar pra perguntar. Antes de sair editando, mapeei o escopo real (Explore agent + grep dirigido + leitura de `docs/decisions/PLANO_UNIFICACAO_V1_V2.md`, que já tinha boa parte dessa investigação registrada de sessões anteriores).

**Achado bom: menos pendência do que a auditoria anterior sugeria.** `ACOES_COTACOES`, `creditoUberBalance`, `creditoShellBox`, `creditoKmvIpiranga`, `proLaboreFixo` e `CARTAO_PLUGGY_MAPA` **já são V2-primeiro** — sobrescritos direto em `app.js:858-905`/`app.js:1396` a partir de `indicadores`/`cotacoes_acoes`/`cartoes`, mesmo padrão de `CICLO_SNAPSHOTS`/`HISTORICO_ERP_TODOS_CICLOS`/`LEGENDAS` (que também já eram V2, só ninguém tinha juntado a lista num lugar só). Só não tinham nome de "onda" porque foram feitos inline no boot, não em módulo `hydrate-onda*.js` separado.

**Os únicos 2 blocos grandes que sobraram sem cobertura V2 estão bloqueados por decisão técnica já registrada, não por falta de trabalho**:
1. **Cartões Mastercard Black/Visa Infinite** (`cartaoInfiniteTotal`, `cartaoMBTotal`, `mercadoPagoFatura`, e o resto do bloco) — `PLANO_UNIFICACAO_V1_V2.md` linha 1572: "🔴 Depende de modelagem — acoplado a reconciliação bancária manual (seção 36)". Não é um `hydrate-onda` que falta escrever, é uma decisão de modelagem de dado que o próprio projeto ainda não fechou.
2. **LRW/LRV/LRC-limbo/LRCV (tabelas item-a-item da Caixa Variável)** — mesmo documento, linha 1573: "🔴 Depende de dado inexistente (gap de classificação, seção 35)". A seção 15 do mesmo doc já aprovou uma modelagem pra LRW/LRV especificamente (`usuario_id`+`cartao_id`+`Caixa Variável`+`afeta_saldo_real=false`), mas LRC-limbo/LRCV continuam sem estrutura equivalente definida.

**Por que não forcei essas duas migrações mesmo com "não parar pra perguntar"**: envolvem dinheiro atribuído a outra pessoa (Vanessa) e reconciliação bancária real. Migrar sem a modelagem estar de fato fechada arriscaria mostrar valor incompleto ou mal atribuído como se fosse definitivo — pior do que manter V1 mais um pouco. Isso é diferente do RLS aberto (onde a correção era mecânica e o risco era só técnico) — aqui o risco é de conteúdo financeiro errado sendo exibido como certo.

**Continuam em V1 por decisão explícita do usuário já registrada, não reabertas nesta sessão**: as 4 caixas de exceção residual (Caixa Lance, Manutenção, Saúde Família, Aniversário Júlio) + Provisionado Wärtsilá (`hydrate-onda2-v2.js`/`hydrate-onda3-caixalance.js`), `PLUGGY_TRIAGEM` (decisões de aprovar/rejeitar da Inbox, fora da Onda 7 de propósito), `BOLETOS_TRANSACOES` (só o cronograma migrou na Onda 8, a lista de já-lançados ficou de fora de propósito), Solar rateio/crédito (bloqueado pela investigação "301×361 kWh" ainda não fechada, seção 38).

**Conclusão prática**: "matar V1 completamente" hoje não é uma tarefa de velocidade de código, é uma tarefa de decisão de negócio (reconciliação de cartão) e de resolução de uma dúvida factual (solar) que já estavam em aberto antes desta sessão. Não fica nada de fácil/rápido pendente — o que sobra exige o usuário (não um agente) fechar a modelagem de cartão ou a dúvida do medidor solar primeiro.

## 🔒 Passo 2 da segurança FECHADO — RLS travado, views corrigidas, RPCs revogadas (09/08/2026, mesma sessão, urgente)

Auditoria de prontidão operacional (pedida pelo usuário, ver histórico do chat) confirmou ao vivo, consultando o banco diretamente — não por documentação —, que a "Passo 2" registrada como pendência de prioridade Alta continuava real: **28 tabelas financeiras/sensíveis** (`transacoes`, `caixas`, `cartoes`, `investimentos`, `reembolsos`, `reembolso_wartsila_ciclo`, `reembolso_wartsila_recebimentos`, `pluggy_contas`, `pluggy_transacoes`, `pluggy_conexoes`, `mercadopago_eventos`, `financiamentos`, `emprestimos_internos`, `parcelas`, `indicadores`, `patrimonio`, `metas`, `contas_bancarias`, `usuarios`, `regras_classificacao`, `regras_resolver_caixa`, `ciclos_financeiros_snapshots`, `ciclos_solares`, `cronograma_boletos_fixos`, `energia_solar_leituras`, `energia_solar_geracao_diaria`, `categorias`, `subcategorias`) tinham policy de SELECT `qual=true` pra `anon` — qualquer pessoa com a chave pública do site (embutida no HTML) lia o livro razão inteiro sem login.

**2 achados novos, nunca documentados antes, que a auditoria descobriu**:
1. **19 views `SECURITY DEFINER`** (`vw_saldo_v2_por_caixa`, `vw_patrimonio_v2`, `vw_parcelamentos_v2`, `vw_roc_carteira_v2`, `vw_p2p_v2`, `vw_ciclo_solar_historico`, etc.) rodavam com o privilégio de quem as criou, não de quem consulta — mesmo travando o RLS das tabelas base, essas views continuariam vazando tudo.
2. **A passagem de turno anterior registrou "anon revogado das 5 RPCs de escrita" — não estava.** O código das funções tinha a checagem de JWT correta (confirmado lendo `pg_get_functiondef` ao vivo), mas o `GRANT EXECUTE` pro `anon`/`PUBLIC` nunca foi de fato revogado em 4 das 5 — só `triar_mercadopago_evento` tinha sido revogada de verdade.

**Corrigido em produção, via `apply_migration` no Supabase (não é DDL local, foi direto no banco de produção)**:
1. Todas as 28 tabelas: policy `"Leitura via anon key (site publico)"` (qual=true) trocada por `"Leitura restrita a login Firebase valido"` — mesmo padrão já usado e comprovado em `wallace_dados` (`auth.jwt()->>'iss'`/`'aud'` batendo com o Firebase do site). `service_role` (usado pelas automações do GitHub Actions) tem `BYPASSRLS=true` no Postgres, confirmado via `pg_roles` — nenhuma automação foi afetada.
2. `v1_v2_caixa_mapa` (tabela de mapeamento, estava com RLS desativado, zero proteção) — RLS ativado com a mesma policy.
3. As 19 views: `ALTER VIEW ... SET (security_invoker = true)` — agora respeitam o RLS de quem consulta, não de quem criou.
4. `REVOKE EXECUTE ... FROM PUBLIC` (e `FROM anon` explicitamente pra `fechar_ciclo_solar`, que não tinha caído no primeiro `REVOKE FROM PUBLIC`) nas 5 RPCs — `authenticated`/`service_role` mantidos, login continua funcionando.
5. `search_path` corrigido em 7 funções que o linter apontava como mutável (`atualizar_mercadopago_eventos`, `triar_mercadopago_evento`, `triar_pluggy_item`, `rpc_dashboard_resumo`, `fn_parse_data_v1`, `marcar_atualizado_em`, `valores_combinados_v2`).

**Validado antes de declarar concluído**:
- Como role `anon`: `SELECT count(*) FROM transacoes` → **0 linhas** (era acesso total antes).
- `has_function_privilege('anon', ..., 'EXECUTE')` → `false` nas 5 RPCs, confirmado uma por uma.
- `get_advisors(security)` rodado depois: **zero achados `ERROR`** restantes (os 19 `security_definer_view` e o `rls_disabled_in_public` sumiram). Sobrou só `WARN` informativo ("usuário autenticado pode chamar RPC") — que é o comportamento **intencional** do "+ Lançar" e afins.
- **Usuário confirmou ao vivo, logado no navegador real, painel carregando normal** ("tudo normal") — não ficou só na validação de banco.

**Risco residual que ainda existe, consciente**: as automações do GitHub Actions (Pluggy, Mercado Pago, SAJ Solar) usam a `service_role` key, que bypassa RLS por design — isso é esperado e necessário pra elas funcionarem, mas significa que a proteção nova é só contra leitura anônima externa (navegador/curl com a chave pública), não uma segunda camada dentro do próprio Supabase. Não é um achado novo, é a mesma superfície que sempre existiu pra chaves privilegiadas.

## 🚨 Achado mais importante da sessão (antes do fechamento acima): auditoria de segurança real, corrigida

Usuário pediu uma auditoria honesta de prontidão operacional (não uma revisão de migração V1→V2). Achado crítico confirmado lendo o código real das funções no Supabase: **6 RPCs `SECURITY DEFINER` (`lancar_transacao_manual`, `triar_pluggy_item`, `triar_mercadopago_evento`, `criar_categoria`, `registrar_pib_mensal`) estavam concedidas a `anon` sem NENHUMA checagem de quem chamava** — qualquer pessoa com a chave pública do site (está no HTML, visível a qualquer um) podia inserir transação confirmada direto no banco, sem login algum.

**Corrigido e testado ponta a ponta, com confirmação do usuário em navegador real**:
1. As 5 RPCs agora exigem JWT válido do login Firebase do site (mesmo emissor/audiência da policy que já existia em `wallace_dados`) OU `role=service_role` — testado chamando sem autenticação (rejeitou corretamente) e testado ao vivo pelo usuário logado (`+ Lançar` funcionou).
2. `anon` revogado das 5 funções. `audit_log` (antes público) restrito a `authenticated`.
3. Token do login Firebase (`sessionStorage['auth'].idToken`) agora é enviado em **toda** chamada ao Supabase do site — as ~55 chamadas de `WallaceFinanceService` (via `_headers()` central), as 9 leituras de boot (inline em `Sistema_Wallace_Lira_Completo.html`, via `__wallaceAuthHeader()`), e os módulos avulsos (`pluggy-reconciliacao.js`, `inbox-financeira.js`, `recalcular-indicadores.js`, `promocoes-financeengine.js`). Cai pra chave anônima se não tiver sessão (comportamento de hoje preservado quando deslogado).
4. **2 chamadas ficaram quebradas na 1ª rodada e foram corrigidas antes de virar incidente**: "Criar categoria nova" e a sugestão automática de caixa (`resolver_caixa`) ainda mandavam a chave anônima crua pra RPCs que já exigiam login.

**Passo 2 (fechar a leitura pública/RLS das tabelas financeiras) NÃO foi feito ainda** — a canalização do token está pronta e validada, mas travar as policies de SELECT é a próxima ação, deliberadamente separada pra não arriscar travar o painel inteiro sem conseguir testar em tempo real. Ver pendências.

## 🐛 3 bugs reais encontrados testando "+ Lançar" ao vivo pela primeira vez (não relacionados à segurança)

1. **`rpc_dashboard_resumo()` nunca retornava o `id` da caixa** no array `caixas` — toda `<option>` do dropdown de caixa no formulário "+ Lançar" tinha `value="undefined"` desde que o formulário existe (05/08/2026). Ninguém tinha testado escolher uma caixa manualmente ali antes. Corrigido: campo `'id', cc.id` adicionado ao `jsonb_build_object`. Confirmado ao vivo pelo usuário (sugestão de caixa passou a mostrar nome real, lançamento funcionou).
2. **Barra de abas duplicada na home nova** (`.master-tabs`, sempre visível "em qualquer aba" desde V145) sobrepunha visualmente os 5 botões novos da home (`.home-nav-grid`, mesmos 5 destinos). Corrigido via CSS (`#home.active ~ .master-tabs{display:none}`) — só some na home, volta normal dentro de qualquer uma das 5 abas de destino.
3. **"Esconder valores" (blur de privacidade) demorava segundos pra aplicar**, expondo números reais na tela por um instante — a checagem rodava no ÚLTIMO módulo carregado no boot inteiro (`ui-componentes-visuais.js`, depois de ~55 módulos + ~10 fetches + app.js + energia-solar.js + promocoes-financeengine.js). Movida pro topo de `Sistema_Wallace_Lira_Completo.html`, primeira coisa que roda. Classe trocada de `body.esconder-valores` pra `html.esconder-valores` (existe desde o 1º byte do parser).

## 💰 2 bugs financeiros reais corrigidos (achados/validados nesta sessão)

1. **"Comprometido" da Caixa Variável estava com double-count real**: a fórmula (`mbLRWConfirmado+mbLRVConfirmado+...`, números fixos mantidos à mão) contava TODA compra no cartão de Wallace/Vanessa, sem distinguir gasto genérico (responsabilidade real da Caixa Variável) de compra com caixa temática própria (Bens Duráveis, Churrasco, Provisionado Wärtsilä — já contabilizadas na própria caixa). Caso real: TX000228 (carne pro Churrasco) contava 2x. Corrigido: nova função `getComprometidoCaixaVariavelV2()` — soma ao vivo da V2 (`caixa_id='Caixa Variável' + cartao_id set + afeta_saldo_real=false`, o padrão real de toda compra sem caixa própria). Validado contra o banco antes de implementar: caiu de R$1.931,68 pra R$1.436,43 (Disponível Real virou +R$450,22, não mais -R$45,03).
2. **`vw_saldo_v2_por_caixa` dependia de `wallace_dados`/array V1 pra caixas "de ciclo"** — uma transação com `tx_legado` preenchido só contava se também existisse espelhada em `wallace_dados`, escondendo dinheiro real (achado original: PGV mostrando R$50,73 quando o real era R$306,73). Corrigido na raiz: nova coluna `caixas.ciclo_inicio_em` (data real de início de ciclo por caixa, levantada e validada contra as transações de "aporte mensal" reais de cada uma) — a view agora soma só `transacoes` com `data >= ciclo_inicio_em`, zero dependência de V1/`tx_legado`. **Validado antes de aplicar**: 16 de 19 caixas bateram exato com a lógica antiga, as 3 que mudaram (PGV +R$256, PIX Vanessa -R$300, Bens Duráveis -R$228,99) eram exatamente as 3 com dinheiro real escondido — nenhuma regressão.
3. **Dedup da Inbox tinha 2 buracos reais**: (a) lista hardcoded de 7 livros nunca cobria Bens Duráveis/Churrasco/etc — trocada por consulta real a toda `transacoes` da V2; (b) compra desmembrada em partes (Mercado Livre R$551,01 = TX000159+TX000159-A+TX000159-B) não batia por valor exato — nova função `valores_combinados_v2()` (soma de até 3 transações da mesma caixa, janela de 5 dias) fecha essa classe.

## 🏠 Nova arquitetura de navegação: home como tela inicial

Pedido do usuário: o resumo executivo (`.cover` — Patrimônio/Meta do Milhão/Modo Operacional/Caixa Var. + Simulador Fim de Ciclo) virou a página de entrada de verdade, não só decoração no topo de uma rolagem única. Implementado reaproveitando o mecanismo `showMaster()`/`.master-pane.active` que já trocava Painel/Gráficos/Solar/Cenários/Balanço — `.cover` virou `#home`, com 5 botões grandes (`.home-nav-grid`) levando aos 5 destinos de sempre (`irParaPrimeiraSecao()`, já existia). Ícone "voltar" (`#brandLogo`, `index.html`) agora chama `irParaPrimeiraSecao('home')` de verdade (trocava só rolar a página antes). **As 49 seções internas do Painel continuam como rolagem única dentro do seu próprio pane — não viraram páginas individuais** (avaliado e descartado: HTML são siblings soltos sem wrapper, refactor grande e arriscado pro que foi pedido).

## 📜 Política nova: caixa negativa sem LREI soma na Necessidade Total Bruta

Pedido do usuário: caixas operacionais são "bolsões" de gasto temático — comprar algo no cartão pra um bolsão sem saldo suficiente deixa a caixa negativa até ser coberta (LREI, reembolso, aporte do dia 25). Isso nunca era contabilizado na Necessidade Total (o número que diz quanto precisa entrar no ciclo). Novo módulo `hydrate-deficit-caixas-sem-lrei.js`: soma `max(0, -saldoV2 - LREI_ATIVO_dessa_caixa)` de toda caixa operacional negativa, soma o total na Necessidade Total Bruta (ajuste em cima, não um 8º componente). Validado contra o banco antes de implementar: R$842,68 hoje (Bens Duráveis R$583,99 + Churrasco R$258,63 + Saúde Família R$0,06).

## 🔓 Governança do Claude Chat revertida — decisão explícita do usuário

Uma sessão anterior (mesmo dia) tinha registrado "Claude Chat não deve gravar direto no Supabase, só interpretar e devolver dados pro usuário lançar via '+ Lançar'". Usuário apontou que essa **não é a arquitetura que ele quer**: "o Chat deve atualizar tudo, não pode passar pra mim fazer isso". Revertido — Claude Chat volta a gravar direto (RPC ou SQL, mesma capacidade do Claude Code). **Fronteira esclarecida por TIPO de operação, não por acesso**: Chat resolve qualquer coisa sobre uma linha específica (lançar/corrigir transação); Code fica com mudança estrutural (schema/view/RPC/código-fonte) — "o Chat tem que fazer tudo, menos mudanças arquitetônicas". Manual atualizado nos dois lugares (repo + cópia espelhada no Drive, `Livro Razão/Agentes/`).

## Instrumentação de performance adicionada, ainda não medida com dado real

`performance.mark`/`performance.measure` em volta de cada etapa do boot (módulos base → dados remotos → app.js → solar → promoções → completo), resultado em `window.WALLACE_BOOT_TIMING`/`console.table`. Puramente aditivo, zero mudança de comportamento. Usuário tentou ler no console do navegador nesta sessão e esbarrou num detalhe de estrutura do site: o painel real roda dentro de um `<iframe>` (`Sistema_Wallace_Lira_Completo.html`), então o DevTools abre por padrão no frame de fora (`top`, só o login) — `window.WALLACE_BOOT_TIMING` só existe no frame de dentro. Orientado a trocar o dropdown de contexto do Console (canto superior esquerdo, ao lado do ícone de olho) pro frame do iframe antes de digitar o comando. **Sessão encerrada por limite de créditos antes do usuário conseguir rodar `console.table(window.WALLACE_BOOT_TIMING)` no frame certo e mandar o resultado** — próxima sessão deve começar retomando exatamente esse passo (usuário já sabe onde trocar o frame, só falta o dado).

## O que já está pronto pra uso diário (Nível A/B, testado em navegador real hoje)

- Login → "+ Lançar" → grava na V2 com autenticação real → painel atualiza na mesma ação. Testado ao vivo.
- Dropdown de caixa do "+ Lançar" funciona (bug do `id` ausente corrigido).
- Home nova carrega, 5 botões levam aos destinos certos, ícone de voltar retorna à home.
- PGV, PIX Vanessa, Bens Duráveis, Caixa Variável (saldo e Comprometido) — todos corretos e validados contra o banco.
- Inbox com dedup mais robusto (7 livros→toda V2, + soma de combinações pra compra desmembrada).
- **Passo 2 da segurança FECHADO**: RLS travado em 28 tabelas + `v1_v2_caixa_mapa`, 19 views convertidas pra `SECURITY INVOKER`, `EXECUTE` das 5 RPCs revogado de `anon`/`PUBLIC`. Validado contra o banco (`anon` lê 0 linhas) e confirmado ao vivo pelo usuário logado ("tudo normal").

## Pendências remanescentes — ordem de prioridade pra próxima sessão

| Item | Prioridade |
|---|---|
| Ler `window.WALLACE_BOOT_TIMING` real (usuário já confirmou que funciona) e decidir o que otimizar com dado, não achismo | Alta — pedido explícito do usuário ("nublado"/loading lento) |
| 4 caixas de exceção residual ainda em V1 na exibição (Caixa Lance, Manutenção, Saúde Família, Aniversário Júlio) — mesma exposição que PGV tinha antes de ser promovida | Média — candidatas naturais se causar incidente |
| Dependência de cron-job.org (externo, gratuito) pra todas as 4 automações do GitHub Actions, sem monitoramento de falha | Média — fora do alcance de qualquer agente sem conta do usuário |
| LRR/LRS/LRC sem migração V2 completa (nem array V1 pra comparar) | Baixa — feature nova, não bug pontual |
| Auditoria de rateio/créditos solares — não investigada a fundo ainda | Baixa |
| Campo de cartão na UI do "+ Lançar" (hoje só via SQL/Claude Code) | Baixa — dívida técnica de UI conhecida |

## Protocolo de sessão nova

1. Este arquivo.
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente (topo).
3. Antes de tocar em qualquer RPC/tabela financeira: relembrar que a canalização de auth token já existe (`obterTokenAuthSupabase()`/`_headers()`/`__wallaceAuthHeader()`) — reaproveitar, não recriar.
4. Se for mexer no formulário "+ Lançar" ou em qualquer RPC `SECURITY DEFINER`: testar em navegador real antes de considerar concluído — 2 bugs reais desta sessão (`rpc_dashboard_resumo` sem `id`, 2 chamadas com chave anônima crua) só apareceram no teste ao vivo, não na leitura de código.
5. `git status`/`git log` sempre antes de assumir pendente ou concluído.
