PASSAGEM DE TURNO — Sistema Wallace Lira

Sessão: 06-07/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site` (diretiva permanente: sem zip, sem cópias paralelas, sem versões alternativas — alterar sempre os arquivos reais do projeto).

## ✅ Mais 6 caixas fechadas, técnica repetida em série (09/08/2026, mesma sessão, mais recente que tudo abaixo)

Usuário pediu pra ir "da mais simples pra mais completa e registrar tudo". Usei o diagnóstico `LivroRazaoFase1` que apareceu no console do usuário (12 caixas com contagem V1≠V2) pra escolher a ordem, e apliquei a mesma técnica que funcionou na Caixa Lance (consultar `wallace_dados` direto, não o arquivo JS local) em cada uma:

- **4 caixas com resíduo <R$3** (Escola de Júlio, Seguro Emplacamento, Combustível, Eventos): todas tinham o mesmo `AJUSTE-06-08` (rendimento real, confirmado pelo usuário) nunca migrado. Inseridas as 4 juntas, confirmando ausência antes. Todas fecharam em R$0,00.
- **Saúde Família e Aniversário Júlio**: mesmo padrão da Manutenção (transação presa em `pendente_classificacao` + itens ausentes). Corrigidas, fecharam em R$0,00, promovidas no código junto com a tabela de Livro Razão.

**2 documentos novos lidos, sem achado novo**: `Bradesco .pdf` (extrato de conta corrente, confirma o fluxo salário→PIX já conhecido) e `mp-wallet_...pdf` (é o MESMO extrato de junho+julho que já tinha lido em arquivos separados, só que combinado num PDF de 18 páginas).

**2 caixas paradas de propósito, não é o mesmo padrão limpo**:
- **PIX Vanessa** (R$300): os lançamentos em V2 não batem com o array V1 nem em conteúdo nem em sinal — inconsistência estrutural, não falta de migração. Não mexi.
- **Caixa Bens Duráveis** (R$583,99): o ajuste em V1 zera a compra do fone+cortador porque essa caixa virou centro de custo separado (decisão de sessão anterior, pode ficar negativa) — comparar direto com V1=R$0,00 pode não fazer mais sentido conceitual. Não mexi sem confirmar com o usuário.

**Ainda pendente, fora do escopo desta rodada**: `window.WALLACE_BOOT_TIMING` apareceu no console do usuário mas colapsado (não expandido) — ainda não vi os números reais. Planilha `.xlsx` de conciliação ainda sem Python funcional pra abrir. PDF de 41 páginas e imagens do WhatsApp ainda não processados. Cartões Mastercard/Visa (totais) e LRW/LRV (3 transações sem dono) seguem bloqueados como já registrado.

## ✅ Caixa Lance fechada de vez (09/08/2026, mesma sessão, anterior ao bloco acima)

Usuário pediu explicitamente pra continuar fechando a Caixa Lance, mas com cautela (depois do quase-incidente do cartão 4844, ver bloco abaixo). Em vez de adivinhar a partir dos extratos bancários (o que já tinha tentado sem sucesso antes), fui direto na fonte: `wallace_dados.CAIXA_LANCE_TRANSACOES` no Supabase (não o arquivo `vars-caixas.js`, que estava desatualizado — só 8 dos 10 itens reais). Achei os 2 itens faltando: `RENDIMENTO-31-07` (+R$9,42, já certo na V2) e `AJUSTE-06-08` (-R$65,76, ajuste manual que o usuário já tinha feito baseado num print real do Mercado Pago, nunca sincronizado). Confirmei que só o segundo faltava na V2, inseri via `UPDATE`, resíduo caiu de R$85,76 pra R$20,00 (alta confiança — é uma venda P2P real só na V2, mesmo padrão aceito nas outras caixas). Caixa Lance promovida (`hydrate-onda3-caixalance.js` + `hydrate-onda3-livro-razao.js`, saldo e tabela juntos).

**Lição confirmada**: quando uma reconciliação não fecha e o arquivo JS local não explica o resíduo, checar a fonte viva (`wallace_dados` real, não o literal no código) antes de declarar "causa indeterminada" — o arquivo local pode estar desatualizado.

## ⚠️ Quase-duplicação de dado financeiro + 3 fixes de UI mobile (09/08/2026, mesma sessão, anterior ao bloco acima)

**Incidente evitado por pouco**: continuando a reconciliação de cartão da rodada anterior, encontrei `cartao_id` do Visa Infinite 4844 com zero linhas em `transacoes` e concluí (errado) que nada estava lançado — comecei a inserir as ~180 compras de julho/agosto extraídas das faturas reais que o usuário mandou. Cheguei a rodar uma migration inserindo 41 delas antes do usuário interromper: "não lance, você vai duplicar" / "você vai duplicar". **Revertido na mesma hora** (`DELETE ... WHERE tx_legado LIKE 'TX4844-%'`), confirmado 0 linhas. O usuário então mostrou (prints de uma tela de Livro Razão por categoria, TX000012/TX000017/TX000018 etc.) que essas mesmas compras já estavam lançadas manualmente linha a linha em outro lugar do sistema — a ausência na tabela que eu consultei não significava ausência real. **Regra pra próxima vez**: antes de inserir qualquer transação "faltando", perguntar/confirmar onde o dado já pode estar, não assumir pela ausência numa única tabela.

**3 correções de UI entregues, testadas via preview local (sessão forjada, sem login real)**:
1. Busca (lupa) sumia completamente no mobile (`display:none` fixo <780px) — agora vira botão-ícone que abre a busca como overlay.
2. Barra de 22 categorias do Livro Razão (LRW/LRV/LRB/...) virava ~11 linhas de botão no celular antes de mostrar qualquer dado — agora é uma faixa que rola na horizontal, só no mobile.
3. Link direto pra uma aba (`index.html?aba=solar`) — pedido explícito do usuário pra poder compartilhar link direto da aba Solar. Bug real achado no processo: a implementação inicial rodava cedo demais (`onDomPronto`) e `showMaster()` ainda não existia nesse ponto do carregamento (é definida num arquivo que carrega depois de `app.js`) — corrigido trocando pra `window.addEventListener('load', ...)`. Confirmado funcionando com e sem o parâmetro.

## 🔧 "Matar V1" parte 2 — resultado misto, honesto (09/08/2026, mesma sessão, anterior ao bloco acima)

Usuário autorizou explicitamente mexer nos itens antes deixados como "exceção deliberada", incluindo os 2 blocos maiores (Cartões Mastercard/Visa, LRW/LRV/LRC-limbo/LRCV): "Continue e mexa em tudo, eu autorizo. 1 e 2 resolva". Investiguei cada item com evidência real do banco antes de prometer qualquer coisa — resultado: 1 promoção real feita, o resto ficou bloqueado por dado genuinamente faltando (não por preguiça).

**Feito e commitado**: **Caixa Manutenção promovida pra V2**. Causa raiz real (não "indeterminada" como estava documentado): 2 transações reais (`TX000214` Cortinas -R$450, `TX000215` empréstimo LREI0004 +R$103,55) presas em `status='pendente_classificacao'`, excluídas do cálculo de saldo V2 (`vw_saldo_v2_por_caixa` só soma `confirmado`). Corrigido via `UPDATE` de status. Resíduo pós-correção: R$0,72, causa identificada com alta confiança — aceito como "divergência conhecida", mesmo padrão das outras caixas já promovidas. Achado lateral corrigido no caminho: comentário sobre "Provisionado Wärtsilä" em `hydrate-onda2-v2.js` estava desatualizado — a caixa já é 100% V2 desde a Onda 4 de uma sessão anterior, só o comentário não tinha sido atualizado.

**Investigado, NÃO promovido — dado real faltando, registrado com precisão pra próxima sessão resolver rápido**:
- **Caixa Lance**: confirmar o par LREI espelhado (`TX000212`/`TX000216`) piorou o gap (era -R$24, virou -R$85,76) — a caixa já contabilizava esse par de outro jeito no V1. Isolado: R$93 de 2 transações reais que existem só na V2 e nunca entraram no array V1 (`PIX-VANESSA-21-07` +R$73, um P2P +R$20 sem `tx_legado`), mais R$65,76 "só no V1" nunca migrado, mais R$56,34 de "ajustes manuais" do V1 sem transação real correspondente na V2. Nenhum dos 2 últimos identificado com certeza suficiente pra corrigir sem risco de errar quantia real.
- **LRW/LRV**: modelo já aprovado (seção 15 do plano), dado real já existe em `transacoes` (24 transações Wallace/R$932,10, 6 Vanessa/R$221,62, confirmado no banco) — mas **3 transações (R$282,71) têm `usuario_id=NULL`**, sem dono definido (mesma classe do caso já visto antes, "Uber de Gabriela vai pro LRW" — regra que só o usuário pode dar). Bloqueado até essas 3 serem classificadas.
- **LRC-limbo/LRCV**: sem decisão arquitetural nenhuma ainda (diferente de LRW/LRV) — não inventei uma.
- **Cartões Mastercard/Visa (totais)**: precisa de reconciliação bancária real contra extrato, não é algo que SQL resolve sozinho.
- **Caixa Saúde Família / Aniversário Júlio — achado mais sério do que a documentação antiga sugeria**: essas 2 caixas **não existem na tabela `caixas` da V2**, nenhuma linha. Não é saldo desatualizado, é ausência total de estrutura — precisaria criar a caixa + backfill de histórico completo, trabalho real de reconstrução, não uma correção pontual. Não tentado por tempo.

**Por que não forcei mesmo com autorização explícita pra "mexer em tudo"**: autorização resolve permissão, não resolve dado que não existe (as 3 transações sem dono, o modelo nunca definido de LRC-limbo/LRCV) nem reconciliação bancária que só existe no extrato real do usuário. Continuar teria significado adivinhar de quem é R$282,71, ou publicar como "V2 conferido" um número que ninguém validou contra o banco de verdade — quebra a mesma regra (Nível A: evidência antes de mexer em dinheiro real) que sustentou todo o resto do trabalho financeiro desta sessão.

**Não validado em navegador** — sem credenciais de login nesta sessão, e o ambiente avisou que outra sessão já roda um dev server nesta mesma pasta (Browser desta sessão não alcança). Validação foi só contra `vw_reconciliacao_v1_v2` antes/depois da correção. Usuário deve conferir a aba Manutenção (card + Livro Razão) na próxima vez que abrir o site.

## 🔒 Auditoria de prontidão operacional + fechamento do Passo 2 da segurança (09/08/2026, mesma sessão, anterior ao bloco acima)

Usuário pediu uma auditoria final de prontidão operacional, honesta, com checklist completo (arquitetura, financeiro, solar, automações, segurança, performance) — não uma revisão de migração V1→V2. Rodada com evidência ao vivo (advisors do Supabase, `pg_policies`/`information_schema` reais, código-fonte das RPCs via `pg_get_functiondef`, logs de API, status real dos 5 GitHub Actions workflows), não por memória/documentação. Resultado completo dado ao usuário no chat (nota geral 6/10, "Produção Inicial", ~65% de prontidão).

**Achado que mudou o quadro**: a "Passo 2 da segurança" (RLS travado nas tabelas financeiras), documentada havia dias como pendência de prioridade Alta, continuava real e sem correção — confirmado com uma query direta (`anon` lendo `transacoes` sem restrição nenhuma). Dois achados **novos**, nunca documentados antes desta auditoria:
1. **19 views `SECURITY DEFINER`** que rodavam com privilégio de quem as criou, não de quem consulta — mesmo travando o RLS das tabelas base, elas continuariam vazando tudo sem correção própria.
2. **A passagem de turno anterior registrou "anon revogado das 5 RPCs" — não estava.** A checagem de JWT dentro do código das funções era real e funcionava (confirmado lendo o código), mas o `GRANT EXECUTE` pro `anon` nunca tinha sido de fato revogado em 4 das 5 RPCs.

**Usuário respondeu "não vamos perder tempo, corrija tudo o mais rápido possível"** — corrigido na mesma sessão, direto em produção via `apply_migration` no Supabase:
1. RLS travado (SELECT restrito ao JWT do Firebase, mesmo padrão já comprovado em `wallace_dados`) em 28 tabelas financeiras/sensíveis + `v1_v2_caixa_mapa` (que não tinha RLS nenhum).
2. As 19 views convertidas pra `SECURITY INVOKER`.
3. `EXECUTE` revogado de `anon`/`PUBLIC` nas 5 RPCs de escrita (`lancar_transacao_manual`, `criar_categoria`, `registrar_pib_mensal`, `fechar_ciclo_solar`, `triar_pluggy_item`) — `fechar_ciclo_solar` precisou de um segundo `REVOKE` explícito porque o primeiro (só `FROM PUBLIC`) não bastou.
4. `search_path` corrigido em 7 funções restantes flagadas pelo linter.

**Validado antes de declarar concluído** (não só leitura de código): teste direto como role `anon` (`SELECT count(*) FROM transacoes` → 0 linhas, era acesso total antes), `has_function_privilege` confirmando as 5 RPCs bloqueadas pra `anon`, `get_advisors(security)` rodado de novo mostrando **zero achados `ERROR`** restantes (só `WARN` informativo esperado — "usuário logado pode chamar RPC", que é o comportamento intencional). E o mais importante: **usuário confirmou ao vivo, logado no navegador real, painel carregando normal** ("tudo normal") — não parou na validação de banco.

**Risco residual consciente, não é achado novo**: as automações do GitHub Actions usam a `service_role` key, que tem `BYPASSRLS=true` no Postgres — bypassam RLS por design, necessário pra funcionarem. A proteção nova é contra leitura anônima externa (navegador/curl com a chave pública do HTML), não uma segunda camada dentro do próprio Supabase para quem já tem a chave privilegiada.

**Automações confirmadas saudáveis no caminho** (checado ao vivo via GitHub, não documentação): últimas execuções de Pluggy Sync, Mercado Pago Sync, SAJ Solar, Teste Cron e Pages Deploy — todas com sucesso.

`ESTADO_ATUAL.md` já reescrito refletindo esse fechamento — a linha "Passo 2 da segurança, Alta prioridade" saiu da tabela de pendências.

## 🔴 Encerramento por limite de crédito, continuação do dia 09/08/2026 (leia abaixo, anterior ao bloco acima)

Sessão retomada depois do bloco "ENCERRAMENTO DA FASE DE IMPLANTAÇÃO V2" abaixo, focada em 2 bugs de UI reportados pelo usuário ao vivo (não achados de auditoria). Encerrada por limite de créditos, não por fim natural de tarefa.

**Entregue e commitado nesta continuação** (`73f16a5`, `cbb7d00`, ambos em `origin/main`):
1. **Barra de abas duplicada na home** — usuário reportou visualmente ("os 5 botões grandes ficaram duplicados com a barra de abas"). Causa: `.master-tabs` foi projetada pra ficar sempre visível "em qualquer aba", inclusive na home nova. Corrigido via CSS (`#home.active ~ .master-tabs{display:none}`), confirmando antes que `.master-tabs` é irmão direto de `#home` no HTML (seletor `~` exige isso). Só some na home, volta normal nas 5 seções internas.
2. **"Flash" de valores reais antes do blur de "esconder valores" aplicar** — usuário relatou "aparece nublado com atraso, expondo os números por um instante". Causa raiz: a checagem de `esconder-valores` (`ui-componentes-visuais.js`) era o ÚLTIMO módulo carregado no boot inteiro, então o blur só cobria a tela depois de tudo mais já ter renderizado com valor real visível. Corrigido: checagem movida pro topíssimo de `Sistema_Wallace_Lira_Completo.html`, antes de qualquer conteúdo renderizar. Classe trocada de `body.esconder-valores` pra `html.esconder-valores` (CSS e JS atualizados pra consistência) — existe desde o primeiro byte do parser, não depende do `<body>` já ter sido montado.

**Não resolvido, fica pra próxima sessão**: usuário também reportou "alguns segundos sem número nenhum aparecer" ao entrar no painel — sintoma diferente do flash acima, ainda sem causa raiz identificada. A instrumentação de performance (`window.WALLACE_BOOT_TIMING`, adicionada numa sessão anterior) existe exatamente pra medir isso, mas o usuário esbarrou num detalhe técnico ao tentar ler no DevTools: o painel roda dentro de um `<iframe>`, e o Console abre por padrão no frame de fora (só o login), onde a variável não existe. Foi orientado a trocar o dropdown de contexto do Console pro frame do iframe (`Sistema_Wallace_Lira_Completo.html`) antes de digitar o comando — confirmou que achou o frame certo, mas a sessão acabou (créditos) antes de rodar `console.table(window.WALLACE_BOOT_TIMING)` e mandar o resultado. **Próxima sessão: retomar exatamente daí, pedir esse `console.table` primeiro, decidir otimização com dado real, não achismo.**

`ESTADO_ATUAL.md` já reescrito refletindo esse estado. `git status` limpo além dos `desktop.ini` do Google Drive Desktop (nunca commitados, inofensivos).

## 🔧 Primeiros incidentes reais da Operação Assistida (09/08/2026, logo após o encerramento formal abaixo)

**Reembolsos a receber R$0,00 (era pra ser R$6.700,61)**: usuário reportou via screenshot. Causa raiz — `reembolso_wartsila_ciclo` (V2) tinha snapshot de antes das correções de 05/08 e 07/08, nunca atualizado. Usuário exigiu explicitamente **reconstrução Nível A bottom-up antes de qualquer UPDATE** ("não quero atualizar a V2 usando a V1 como argumento de autoridade") — feita: `valor_a_receber` confirmado por print do sistema externo da Wärtsilä mostrado na sessão; `perna_cartao_corporativo_pessoal` (R$297,31) reconstruído somando 5 transações reais (`LRC_LIMBO_TRANSACOES`, todas confirmadas também na V2); `perna_mp_corporativo` (R$266,23) = `TXMP000011`; `perna_fatura_wartsila` (R$5.056,95) = confirmação direta do usuário 05/08. Todos batem. Corrigido via `UPDATE` direto no Supabase. **Achado lateral**: `TXMP000011` ainda não migrado pra V2 (só V1) — registrado, não corrigido agora. **Não validado no navegador** (5 slots de preview ocupados por outras sessões, 2 tentativas) — só evidência de banco (antes/depois via SELECT).

**KMV Ipiranga R$600,00 (era pra ser R$400,00)**: usuário já tinha usado 1 cupom e já tinha reportado antes, correção nunca foi aplicada em lugar nenhum. Corrigido em `indicadores` (V2) e no literal `vars-operacional.js` (V1, mesma manutenção dupla já usada nesta sessão). Mesma limitação de validação em navegador.

**Bens Duráveis negativo (R$-583,99) sem ficar vermelho**: mesma classe de bug dos dois casos acima — `hydrateCaixas()` já pintava a cor certa, mas roda antes da Onda 2 (V2) sobrescrever o número, então a cor ficava presa no valor do boot. Corrigido em `hydrate-onda2-v2.js`, reaplicando a regra de cor depois do valor V2 real.

**Padrão confirmado nos 3 incidentes**: cards "V2-exclusivos, sem fallback silencioso" (ou qualquer card sobrescrito por uma Onda V2 assíncrona) protegem contra dado *ausente*, não contra dado *presente e desatualizado*, nem contra visual (cor/barra) que não é resincronizado junto com o número. Vale ficar de olho nos outros domínios "Onda 2/3/4" (mesma arquitetura) se aparecer mais algum caso parecido.

**Apontamento registrado, decisão explícita de NÃO investigar agora**: card "Reembolso Wärtsilá pendente acumulado" (R$1.544,11, `VARS.faturaMPCorporativoPendente`, parado desde 27/07/2026) — usuário pediu pra checar se já está contido no "Amount Due Employee" (R$6.700,61) confirmado acima, mas decidiu não aprofundar por falta de evidência suficiente. Decisão explícita: não corrigir, não zerar, não recalcular, não aposentar. Só ganhou um aviso de texto no HTML avisando que precisa de confirmação futura. Classificado como Backlog de Produto → Aguardando validação manual, sem impacto operacional.

**Achado registrado, não corrigido**: o gráfico "Cenário Salário" (`cCenarioSalario`, card "Ponto de empate") ainda mostra a Sobra Pessoal calculada com os valores ANTIGOS do reembolso Wärtsilá (R$3.090,16) — não está entre os elementos resincronizados por `hydrate-onda4-wartsila.js`. Com o dado corrigido hoje, o valor real seria R$1.017,01. Mesma classe de bug dos 3 incidentes acima, mas esse ainda não foi corrigido — fica pra próxima sessão.

## 🏁 ENCERRAMENTO DA FASE DE IMPLANTAÇÃO V2 (09/08/2026) — leia primeiro, antes do bloco abaixo

**Pedido explícito do usuário**: encerrar formalmente a implantação da V2 e iniciar a fase de **Operação Assistida**. Sem novas frentes de migração, sem refatorações grandes, sem perseguir "100%" artificial — decisão que já vinha em vigor desde o Bloco 36, agora formalizada com uma revisão final de remanescentes.

**Comunicado oficial adotado como posição do projeto**: *"Implantação V2 concluída (100%). O sistema entra agora em fase de Operação Assistida, com monitoramento de estabilidade, qualidade de dados e evolução contínua."* Confirmado explicitamente pelo usuário que "100%" aqui **não** significa sistema perfeito, backlog zerado ou dívida técnica inexistente — significa que não existem mais migrações estruturais obrigatórias para colocar a V2 em operação (balde "Implantação V2" vazio). ✅ Implantação V2 encerrada / ✅ Sistema Wallace operando em V2 / ✅ Operação Assistida iniciada.

**Métrica nova**: parar de medir consumidores migrados/remanescentes V1; passar a medir incidentes operacionais, consistência financeira, disponibilidade das automações, qualidade dos dados, estabilidade da operação.

**Revisão executada, depois refinada a pedido do usuário**: todos os itens pendentes registrados em `ESTADO_ATUAL.md`/`docs/decisions/` reclassificados na taxonomia final de 4 categorias — **1) Implantação V2, 2) Operação Assistida, 3) Backlog de produto, 4) Governança**. Resultado: **balde 1 (Implantação V2) vazio** — nenhum item pertence mais a "migração pendente". Detalhe completo em `ESTADO_ATUAL.md`. Regra explícita do usuário a partir de agora: **não chamar de "pendência da V2" nada que não seja literalmente balde 1** — os outros 3 baldes são vida normal de sistema em produção, existem depois de qualquer implantação bem-sucedida.

**Correção de premissa feita ao usuário nesta sessão**: a "frente estrutural Pluggy (histórico via upsert)", que o usuário citou como ainda aberta, já tinha sido implementada, testada e commitada momentos antes, na mesma sessão (`c5572bd`) — não entrou na revisão como pendência.

**Achado novo nesta revisão, não bloqueante, registrado pra ajuste futuro pontual (Governança)**: `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` (item 4) ainda lista PIX Geral Vanessa como "causa indeterminada" — desatualizado, já que a causa raiz foi encontrada e corrigida nesta mesma sessão (bloco abaixo). PIX Vanessa (também promovida) não consta lá. Documento não corrigido ainda, fora do escopo desta revisão.

**Achado de segurança nunca formalizado antes** (via `get_advisors`, não é regressão desta sessão): 17 views `SECURITY DEFINER` (ERROR) e 6 funções `SECURITY DEFINER` executáveis por `anon`/`authenticated` sem restrição (WARN, provavelmente intencional). Balde Governança, registrado, sem ação — decisão de política do usuário.

**Veredito**: V2 pronta para uso diário — sim. Pronta para produção — sim, já está em uso real. Concluída como fase de implantação — sim, é o que este bloco declara. Concluída como "100% da arquitetura migrada" — não, e deixou de ser a métrica perseguida por decisão do usuário. Bloqueador operacional real restante — nenhum identificado. **Percentual do comunicado de encerramento: 100%** (o balde "Implantação V2" está vazio — todo o resto pertence a operação/produto/governança, não a migração).

**A partir de agora**: métrica principal = estabilidade + consistência financeira observadas no uso real. Próximas sessões: começar perguntando se houve incidente desde a última sessão; se não houve, não há trabalho a fazer, só monitorar (mesma instrução do Bloco 36, agora reafirmada com a revisão final completa e a taxonomia de 4 categorias).

## 🔴 Bloco de encerramento por limite de crédito (09/08/2026, sessão longa) — leia primeiro

Sessão muito extensa, encerrada por limite de crédito, não por fim natural de tarefa. Ordem de leitura pro próximo agente: este bloco → blocos abaixo (mesmo dia) pro detalhe de cada item.

### Entregue e commitado nesta sessão (tudo em `origin/main`, `git log` confirma)
1. **PIX Geral Vanessa**: causa raiz da divergência de R$121,97 corrigida (TX000219/221 com `caixa_id` errado por confusão de sigla numa migration), hipótese do valor órfão R$338,00 encerrada, caixa promovida pra exibição V2 (painel = R$306,73, era R$50,69).
2. **PIX Vanessa**: mesmo padrão (card já V2, Balanço/barra/alerta de negócio ainda em V1) — promovida também, todos os 3 pontos agora em R$2,88.
3. **Governança do Claude Chat**: documentos migrados de `Sistema Wallace Lira - Claude Chat/` pra `Livro Razão/Agentes/`, com ponteiro fixo `ONDE_LER.md` — Chat passa a ler ao vivo via conector do Drive, não mais Project Knowledge estático.
4. **Botão "💰 V2" (painel de debug) aposentado** — mostrava dado redundante ou pior que o painel principal (Reembolsos R$7.022,76 órfão). Removido com inventário prévio documentado.
5. **Inbox Financeira**: causa raiz encontrada de por que compras Mastercard Black nunca apareciam (filtro `status!=='POSTED'`, e a conta consolidada "2250" nunca sai de `PENDING`, confirmado até a API da Pluggy, zero transformação nossa). Corrigido: `PENDING` com 10+ dias parado também vira elegível, mesmas proteções mantidas. Validado: 11→20 pendentes na Inbox real.

### ✅ CONCLUÍDO nesta mesma sessão, depois deste bloco: migration Pluggy DELETE+INSERT → UPSERT com histórico real
Usuário confirmou explicitamente ("SIM, eu aprovaria a aplicação", com checklist próprio de verificação). Aplicada via `apply_migration` no Supabase de produção: 5 colunas novas em `pluggy_transacoes` (`primeiro_visto_em`/`status_anterior`/`status_mudou_em`/`qtd_sincronizacoes`/`ultima_sincronizacao_em`) com backfill nas 362 linhas existentes; RPC `atualizar_pluggy_contas` reescrita pra `INSERT...ON CONFLICT DO UPDATE` nas 3 tabelas, mesma assinatura/nome, zero mudança na Action. Validado com teste controlado e reversível (mesmo padrão do Bloco 34) direto no Supabase — confirmado upsert sem duplicar e captura correta de mudança de status, linha de teste revertida ao original depois. `get_advisors` sem achado novo. Detalhe completo em `ESTADO_ATUAL.md`. **Pendente real**: esperar a Action rodar de hora em hora (caminho real Python) pra começar a acumular histórico de verdade — o teste provou a lógica, não o caminho de produção ainda.

## 📁 Reorganização da governança do Claude Chat — novo endereço fixo no Drive (09/08/2026)

**Problema que motivou**: os documentos de governança do Claude Chat (`MANUAL_OPERACIONAL_AGENTES.md`/`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`) viviam como upload estático de Project Knowledge — toda atualização exigia reanexar o arquivo manualmente, e cada reanexo criava uma cópia nova no Drive (sem ferramenta de "editar existente" disponível nas sessões anteriores), acumulando versões desatualizadas.

**Solução implementada**: usuário confirmou que o conector do Google Drive está ativo pra `wallace.termica@gmail.com`. Os documentos foram movidos pra um endereço fixo — `Livro Razão/Agentes/` — com um arquivo-ponteiro estável, `ONDE_LER.md`, que nunca muda de nome. A partir de agora, o Claude Chat deve buscar e ler os documentos ao vivo via conector, em vez de depender de Project Knowledge estático. Regra de manutenção registrada no próprio ponteiro: **sempre sobrescrever o arquivo existente, nunca criar cópia nova ao lado**.

**Arquivos no novo endereço** (`Livro Razão/Agentes/`):
- `ONDE_LER.md` — ponteiro, leia primeiro.
- `MANUAL_OPERACIONAL_AGENTES.md` — cópia atualizada do manual mestre, com nota nova (seção 1.3) sobre a correção da PIX Geral Vanessa e o risco estrutural nas outras 4 caixas de exceção, e seção 11.7 nova descrevendo o modelo de leitura via conector.
- `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` — cópia atualizada, com seção 0 nova explicando o fluxo de leitura ao vivo e nota na seção 1.1 sobre o risco das 5 caixas de exceção.

**Cópias antigas removidas** da pasta anterior (`Livro Razão/Sistema Wallace Lira - Claude Chat/`) — só uma fonte agora, evitando o mesmo problema que gerou a confusão registrada no Bloco 35 (conversa lendo cópia desatualizada enquanto a mais recente coexistia na mesma pasta).

**Achado lateral, resolvido no caminho**: o acesso a essa pasta do Drive estava travando de forma consistente (leitura, escrita, `stat`, listagem — todos falhando) por causa de **duas versões do Google Drive Desktop rodando ao mesmo tempo neste computador** (128.0.0.0 e 129.0.1.0). Encerrados os dois processos e reaberto só com a versão mais recente — resolveu o travamento. Lição registrada: se um caminho do Drive parecer "existir mas não responder" de forma consistente em múltiplas ferramentas, checar processos duplicados do Google Drive Desktop antes de qualquer outra hipótese.

**Pendência do usuário, fora do alcance de qualquer agente**: no Project do Claude Chat, apagar o Project Knowledge antigo (upload estático, se ainda anexado) e colar nas Custom Instructions do Project uma linha apontando pro `ONDE_LER.md` novo, pra ativar de fato a leitura via conector.

---

## ✅ PRIORIDADE 0 — ENCERRADA (09/08/2026, mesma sessão): causa raiz dos R$121,97 corrigida, residual de R$256,00 explicado e aceito

**Resultado final, investigação Nível A completa** (extrato bancário real da Vanessa no Mercado Pago + export JSON do app com campo `origem:"cofrinhos"` + confirmação histórica do usuário em chat, cruzados linha a linha):

1. **R$78,04 (âncora de ciclo)**: confirmado como correto desde a Fase 4A (08/08) — não é duplicidade, é o saldo real do cofrinho em 24/07, batendo ao centavo com o extrato bancário real (`Pix enviado Dupomar Hortifruti -182,96` + `Pix enviado Cultivar -39,00` + aporte `+300,00` = `78,04`, evento único "Dinheiro reservado Caixa PIX Geral -78,04" na mesma data). Achado lateral: o favorecido real do PIX de R$39 é "Cultivar", não "Romário Nogueira Cunha" como está descrito no código (`TX000155`) — nome errado, valor/data certos, sem impacto financeiro.
2. **R$121,97 (TX000219 R$46,97 + TX000221 R$75,00) — causa raiz encontrada e corrigida**: as duas transações eram reais (confirmadas pelo usuário em chat E pelo JSON do app com `origem:"cofrinhos"`), mas a migration de reconciliação de 08/08/2026 (`PLANO_UNIFICACAO_V1_V2.md` seção 16, SQL da linha 534) mapeou o livro `LRPV_TRANSACOES` pro `caixa_id` da caixa **"PIX Vanessa"** (`6c6546fa-...`) em vez de **"PIX Geral Vanessa"** (`fb779cdc-...`) — erro de mapeamento alimentado pela sigla ambígua "LRPV", confusão já documentada no próprio código (`vars-caixas.js:242`). **Corrigido**: `UPDATE transacoes SET caixa_id='fb779cdc-ab92-492d-a172-8d147d1380ea' WHERE tx_legado IN ('TX000219','TX000221')`, registrado em `audit_log` (`origem=ajuste_manual`, `2026-08-09 05:05:43 UTC`), sem efeito colateral em "PIX Vanessa" (as duas transações nunca tinham sido contadas lá, por não existirem no array V1 daquela caixa). PIX Geral Vanessa V2: R$428,70 → **R$306,73**. Rollback disponível (ver histórico de sessão se precisar).
3. **R$256,00 residual (V1 R$50,73 vs V2 R$306,73) — decisão explícita do usuário: não é mais tratado como problema de dados.** É a soma exata dos 3 lançamentos que o Chat gravou direto na V2 em 08/08 (Sabão Júlio -40, Fruta -4, Abastecimento +300 = líquido +256,00), nunca replicados de volta pro array V1 (`wallace_dados.LRPV_TRANSACOES`). **Decisão do usuário**: essa diferença é consequência natural e esperada da transição (V2 recebe lançamentos novos, V1 não) — não uma divergência a investigar. **Sem sincronização automática V2→V1 solicitada neste momento.**

**Estado da PIX Geral Vanessa hoje**: continua na lista de exceção residual (painel mostra V1). Duas rotas de fechamento definitivo seguem em aberto, ainda sem decisão: (a) promover a caixa pra exibição V2 (painel passaria a mostrar R$306,73 direto, já reconciliado, futuros lançamentos do Chat apareceriam automaticamente); (b) manter V1 como fonte de exibição com sincronização manual pontual dos 3 lançamentos pendentes. Nenhuma das duas foi executada nesta sessão, por pedido explícito do usuário.

**Risco estrutural que permanece, não é mais exclusivo da PIX Geral Vanessa**: as outras 4 caixas da lista de exceção (Caixa Lance, Manutenção, Saúde Família, Aniversário Júlio) têm exatamente a mesma exposição — se o Chat gravar direto na V2 delas, o mesmo padrão "cresce na V2, invisível no painel" vai se repetir. Verificado nesta sessão: nenhuma das 4 tem lançamento sem `tx_legado` até agora (`origem` diferente de `reconciliacao`) — dormant, não é incidente ativo, mas o bloqueador estrutural continua aberto. A correção de governança dos documentos do Claude Chat (`MANUAL_OPERACIONAL_AGENTES.md`/`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`, que ainda dizem "Chat = Nível C/D por padrão") também segue pendente, registrada abaixo sem alteração.

---

## 🔴 PRIORIDADE 0 original (09/08/2026) — mantida como registro histórico do achado, ver bloco de encerramento acima

**Achado com evidência real (Nível A, consultado direto no Supabase)**: o Claude Chat da conta `wallace.termica@gmail.com` **tem conector Supabase ativo e persistente** (não é acesso de uma conversa específica — é configuração de conta, válida em qualquer chat novo, uso intencional e mantido pelo usuário). Ele já vem lançando transações reais direto na V2 (`lancar_transacao_manual`) sem passar pelo Claude Code — confirmado nesta sessão: "Sabão Júlio" (R$40, categoria `Higiene`), "Fruta — Bruno da Silva Santos" (R$4, categoria `Alimentação`), "Abastecimento PGV" (R$300, entrada), todos na caixa PIX Geral Vanessa (`fb779cdc-ab92-492d-a172-8d147d1380ea`).

**O problema**: PIX Geral Vanessa é uma das 5 caixas em "exceção residual" (Caixa Lance, Manutenção, Saúde Família, **PIX Geral Vanessa**, Aniversário Júlio) — o painel visível continua mostrando o saldo V1 (`wallace_dados.pixGeralVanessaSaldo`) por causa de uma divergência antiga já documentada (R$78,04 de duplicidade no `saldo_inicial_ciclo` da V2, nunca resolvida). Como o Chat só grava na V2, e a V2 não aparece na tela pra essas 5 caixas, **cada lançamento novo feito pelo Chat abre mais a diferença, e o usuário não vê o saldo real no painel**.

**Números reais, agora**:
| | Valor |
|---|---|
| Painel (V1, `wallace_dados.pixGeralVanessaSaldo`) | R$338,00 |
| Real na V2 (`vw_saldo_v2_por_caixa`, 14 transações) | **R$428,70** |
| Diferença | **R$90,70** (crescendo a cada novo lançamento do Chat) |

**Por que não apliquei uma correção agora**: a diferença de R$90,70 não é só os ~R$44 lançados hoje — tem embutido o erro histórico de R$78,04 (duplicidade no saldo inicial), nunca investigado a fundo. Escrever um número "de ajuste" em `wallace_dados` sem separar o que é lançamento novo legítimo do que é erro histórico seria corrigir no escuro (proibido pela seção 7 do manual) — o risco de esconder ou duplicar um erro é real.

**O que o próximo agente precisa fazer, com prioridade sobre qualquer outra coisa**:
1. Investigar a causa raiz do R$78,04 duplicado no `saldo_inicial_ciclo` de PIX Geral Vanessa (documentado em sessão anterior, nunca fechado) — reconstruir algebricamente, comparar contra extrato real.
2. Depois de reconciliado, decidir: promover PIX Geral Vanessa pra exibição V2 (removendo da lista de exceção em `app.js`, `CAIXAS_EXPLICADAS_V1_V2`/`MAPA_CAIXAS_V1_V2`), OU manter V1 como fonte de exibição mas passar a fazer **dual-write** (gravar também em `wallace_dados` a cada lançamento novo) até a reconciliação ser possível.
3. **Considerar isso urgente**: o Chat vai continuar lançando direto na V2 entre sessões — a cada dia que passa sem essa correção, a diferença cresce e fica mais difícil de reconciliar (mais lançamentos novos misturados com o erro antigo).
4. Verificar se as outras 4 caixas da lista de exceção (Caixa Lance, Manutenção, Saúde Família, Aniversário Júlio) têm o mesmo problema — se o Chat também lançar nelas, o mesmo "grava mas não aparece" vai se repetir.

**Correção de governança necessária, menor prioridade que o acima mas real**: `MANUAL_OPERACIONAL_AGENTES.md` (seção 0 e 11.4) e `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` afirmam "Claude Chat = Nível C/D por padrão, sem acesso a Supabase" — **isso não é mais verdade para esta conta**, o Chat tem Nível A real e usa isso ativamente. Os dois documentos precisam ser corrigidos pra refletir que o fluxo de 2 passos (Chat interpreta → usuário confirma → sistema registra) descrito na seção 1.2 já não reflete 100% a prática real — o Chat às vezes já registra direto. Não corrigido nesta sessão por falta de tempo/orçamento — registrado aqui para não se perder.

---

## Bloco 36 — Mudança de fase: de "migração V1→V2" para "operação diária controlada" (09/08/2026, encerramento — ler antes de tudo abaixo)

**Decisão do usuário, fechando esta sessão de vez**: não perseguir "100% migrado" como métrica artificial. A V2 está apta para operação diária controlada — o usuário vai começar a usar de verdade, e o critério de "V2 concluída" deixou de ser "consumidores removidos = 0" e passou a ser **estabilidade observada num período real de uso**: compras/pagamentos reais sem incidente, caixas/patrimônio consistentes, Pluggy sincronizando, Solar consistente, zero divergência operacional nova. Isso não é uma tarefa que um agente completa — é tempo + observação. Detalhe completo do critério em `ESTADO_ATUAL.md`.

**Nova prioridade explícita para qualquer sessão futura**: validar lançamento real pela UI, monitorar uso diário, registrar incidentes, corrigir só o que impactar operação. **Não abrir novas frentes grandes de engenharia por iniciativa própria** — as pendências remanescentes (campo de cartão na UI, `PLUGGY_TRIAGEM`, RLS de `v1_v2_caixa_mapa`, Necessidade Total/Modo Operacional/Saldo do Ciclo, dívidas técnicas classe C, exceções formais classe D) ficam registradas mas sem prioridade — só mexer se o usuário pedir ou se uma delas causar incidente real.

**Resumo do que esta sessão de aceleração entregou, do início ao fim** (para quem só vai ler este bloco): fechou a fase de migrações rápidas (~61 consumidores religados/removidos, Bloco 33); abriu e fechou a Fase 5 (lançamento manual agora reflete no painel na mesma ação, testado e em uso real, Blocos 34-35); corrigiu o Pluggy de ponta a ponta (causa raiz real — proteção do Supabase contra `DELETE` sem `WHERE`, não reproduzível em teste via SQL direto — Action verde confirmada pelo usuário); aplicou o mapeamento oficial de cartões (6 finais Itaú); documentou o hardware novo do domínio Solar (medidor Chint/SAJ, plano de evolução futura); e resolveu uma lacuna de governança real (o manual mestre não tinha a seção Fase 5, só as cópias do Google Chat tinham — corrigido) além de fixar o formato oficial dos documentos do Claude Chat (`.md`, nunca Google Doc, depois de uma confusão real causada por arquivos duplicados).

**Estado do repositório**: `git status` limpo, tudo commitado e enviado até este bloco. Nenhuma pendência técnica bloqueando o uso diário — só as pendências de baixa prioridade já listadas.

**Para a próxima sessão**: comece perguntando ao usuário se houve algum incidente no uso real desde a última sessão, antes de qualquer outra coisa. Se não houve, não há trabalho a fazer — só confirmar e seguir monitorando.

---

## Bloco 35 — Pluggy corrigido de ponta a ponta (Action verde) + mapeamento de cartões + governança do Claude Chat (09/08/2026, continuação do Bloco 34)

**Mapeamento oficial de cartões aplicado**: usuário confirmou diretamente os finais que faltavam — Itaú Wallace (1371 físico/4628 virtual/5147 Samsung Wallet), Itaú Vanessa (6351 físico/5660 virtual/4017 Samsung Wallet). 3 linhas novas inseridas em `cartoes` (5147/5660/4017), `CARTAO_PLUGGY_MAPA_DEFAULT`/`CARTAO_PLUGGY_TOTALVAR_POR_NUMERO` atualizados em `pluggy-reconciliacao.js` (também corrigiu ausência histórica de '1371' no literal de fallback). Commit `981fefb`.

**Erro 400 do Pluggy — causa raiz real encontrada e corrigida**: investigação em 2 etapas.
1. Corrigido primeiro, só observabilidade: `scripts/sync/sincronizar_pluggy.py`, `atualizar_supabase()` usava `urlopen()` direto sem o tratamento de erro do resto do script — toda falha só aparecia como `"HTTP Error 400: Bad Request"`, sem o corpo da resposta. Trocado para reusar `_request()`. Commit `ecfe6ce`.
2. Usuário disparou a Action de novo — **achado real, Nível A**: correlação exata de timestamp entre os logs da API do Supabase (3× `POST 400 .../rpc/atualizar_pluggy_contas`, user-agent `Python-urllib`) e os logs do Postgres (3× `"DELETE requires a WHERE clause"`, mesmo segundo). Causa: a RPC `atualizar_pluggy_contas` fazia `delete from public.pluggy_conexoes;` sem `WHERE` — o Supabase tem uma proteção de segurança que bloqueia `DELETE`/`UPDATE` sem `WHERE` especificamente na role usada pelo PostgREST (chamada real via API), mesmo dentro de função `SECURITY DEFINER`. **Isso não se aplica** à conexão usada por ferramentas de administração direta (SQL Editor/MCP) — por isso um teste anterior desta mesma sessão, chamando a função via `execute_sql` dentro de uma transação com rollback, tinha rodado sem erro nenhum e mascarado o problema.
3. Corrigido: RPC reescrita com `delete from public.pluggy_conexoes where true` — funcionalmente idêntico, só satisfaz a proteção. Aplicado via `apply_migration` direto no Supabase (a RPC nunca teve arquivo de migração correspondente no repositório).
4. **Validado pelo usuário**: Action "Sincronizar Pluggy" re-executada — **verde**, sincronização completa.

**Lição registrada**: ao testar uma RPC `SECURITY DEFINER` que grava dados, não basta chamar via `execute_sql`/SQL direto (ferramentas de administração podem ter privilégios/role diferentes da API real) — sempre que possível, validar pelo mesmo caminho que o cliente real usa (PostgREST/REST), ou pelo menos registrar essa limitação explicitamente em vez de declarar "testado" com confiança maior do que a evidência sustenta.

**Compra registrada ao vivo, primeiro uso real da Fase 5 fora de teste**: usuário mandou uma compra real (medidor de energia, MERCADOLIVRE*CLAMPER, R$79,79, cartão final 4628) via outro Claude Chat, que não reconheceu o cartão 4628 (lista de cartões desatualizada daquela sessão específica) e perguntou se era cartão novo. Confirmado aqui (Nível A, consulta direta): 4628 já é cartão conhecido (Wallace, MB virtual) — o Claude Chat só não tinha o Project Knowledge atualizado carregado naquela conversa específica. Lançamento executado via `lancar_transacao_manual()` com `caixa_id`=Caixa Bens Duráveis, `cartao_id`=4628 (compra no cartão, mas o orçamento que absorve é Bens Duráveis, não Caixa Variável — confirmado pelo usuário). Saldo da caixa: R$-355,00 → R$-434,79, validado.

**Achado sobre governança do Claude Chat**: os 2 documentos (`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`, `MANUAL_OPERACIONAL_AGENTES.md`) foram copiados para uma pasta nova no Google Drive (`Livro Razão/Sistema Wallace Lira - Claude Chat`) como arquivos `.md` reais (não Google Doc — pedido explícito do usuário, `disableConversionToGoogleType`), para anexar como Project Knowledge. Usuário confirmou que anexou e que uma conversa nova já reconheceu a atualização. **Limitação registrada explicitamente para o usuário**: não existe sincronização automática entre este repositório/Drive e uma conversa do Claude Chat já aberta — só conversas *novas*, dentro do Project, leem a versão mais recente. Atualizações futuras exigem repetir a cópia manual (sem ferramenta de "editar arquivo existente" no Drive disponível nesta sessão — cada atualização cria um arquivo novo; versões antigas precisam ser apagadas manualmente pelo usuário, sem ferramenta de exclusão disponível aqui).

**Commits desta rodada**: `981fefb` (mapeamento de cartões), `ecfe6ce` (observabilidade Python) — a correção da RPC (`apply_migration`) e a compra registrada não geram commit no repositório (mudanças só no Supabase).

---

## Bloco 34 — Abertura da Fase 5: fechar o ciclo de gravação, com teste real reversível (08/08/2026, continuação do Bloco 33)

**Mudança de prioridade pedida pelo usuário**: depois do encerramento da fase de migrações rápidas (Bloco 33), o usuário pediu uma análise de prontidão operacional — não "quantos consumidores faltam" mas "o que impede usar o sistema no dia a dia". A auditoria (consulta ao código real, não suposição) concluiu: leitura/consulta já funciona em quase todos os domínios (Patrimônio, Solar, ROC, Investimentos, Livros Razão, Caixas, Parcelamentos, Reembolsos, Ciclo atual), mas a **gravação** não fechava o ciclo — o formulário "＋ Lançar" gravava na V2 mas o painel não refletia sozinho, mesmo padrão que já causou perda real de visibilidade (`TX000652`/PIX R$652, aprovado na Inbox e nunca lançado de fato). Usuário classificou isso como o único bloqueador real de uso diário e pediu início imediato da "Fase 5" (nome já usado nos comentários do código pra essa unificação pendente).

**Achado estrutural que tornou a correção simples** (verificado direto no schema do Supabase via `execute_sql`/`list_tables`, não suposto): `vw_saldo_v2_por_caixa` já é uma view LIVE — `saldo_inicial_ciclo + soma(transacoes do ciclo atual, com filtro de data >= 25/07/2026 pra transações sem `tx_legado`)`. Ou seja, inserir uma transação nova na caixa certa já muda o saldo calculado pela view sozinho, sem precisar de nenhuma tabela ou RPC nova. O gap real era só: os módulos `hydrate-onda*.js` que buscam essa view rodam **uma vez, no boot** — e o cache em memória do `WallaceFinanceService` (`Map` sem TTL, mesma classe do bug de shape do Bloco 27) segura a resposta antiga indefinidamente.

**Implementado** (`src/app/app.js`, commit `7139966`): função nova `atualizarPainelAposLancamento()` — invalida o cache (`WallaceFinanceService.invalidarCache()`) e re-roda, via `Promise.allSettled`, os mesmos módulos V2 já existentes: Caixas (Onda 1/2/3), Patrimônio, Wärtsilä/Reembolsos, LREI, Livro Razão, P2P, Parcelamentos — mais `atualizarContadoresAbasLR()`/`auditoriaAutomatica()` no fim. Zero lógica de cálculo nova, só reexecução do que já existia (mesmo princípio "menor modelagem possível" usado a sessão inteira). Chamada automaticamente no fim do handler `ltxSalvar.onclick` do formulário "＋ Lançar" — a mensagem de sucesso só aparece ("✓ Lançado e refletido no painel") depois do `await` do refresh terminar, não antes. Erro no refresh (raro — os módulos internos já tratam a própria falha) cai num `catch` que avisa "lançado no banco, mas atualize a página manualmente", nunca finge sucesso.

**Fora do escopo desta rodada, por acordo explícito com o usuário**: Necessidade Total/Modo Operacional/Saldo do Ciclo (topo do Resumo Executivo) continuam vindo de `VARS.CICLO_SNAPSHOTS`, um snapshot mantido à parte, não soma ao vivo de `transacoes`. Recalcular isso é modelagem nova significativa (mesmo bloqueador da investigação de Ciclo Snapshots Etapa 2, sessão anterior) — usuário confirmou que não é bug, não é falta de ligação, é modelagem própria de ciclo, e concordou em deixar fora.

**Teste controlado, reversível, pedido explicitamente pelo usuário pra aumentar confiança antes de mexer na UI**: via `execute_sql` do MCP do Supabase (ambiente real de produção), chamei a MESMA RPC que o formulário usa — `select lancar_transacao_manual('2026-08-08', 'TESTE_FASE5_REVERSIVEL_APAGAR', 0.01, 'entrada', <id da Caixa Boletos>)`. Resultado: `vw_saldo_v2_por_caixa` foi de R$1.488,42 (5 transações) pra R$1.488,43 (6 transações) — diferença exata de R$0,01, confirmando que a view reage sozinha a uma inserção nova, sem nenhuma ação extra. Transação removida em seguida (`DELETE ... where id = ...`), saldo voltou a R$1.488,42 (5 transações) — reversão confirmada, zero resíduo. Achado bônus: `audit_log` registrou o INSERT e o DELETE automaticamente com `origem='formulario'` (via `set_config('audit.origem','formulario')` dentro da própria RPC) — a trilha de auditoria também funciona ponta a ponta.

**Limite honesto do que esse teste prova**: confirma com evidência real de banco (Nível A) as etapas 1-2 da cadeia (inserção + view reage). As etapas 3-5 (invalidação de cache do `WallaceFinanceService`, reexecução dos módulos `onda*`, atualização do DOM no navegador) foram verificadas só por revisão manual de código (Nível B) — o ambiente de preview desta sessão não conseguiu abrir um navegador real em nenhuma tentativa (5 slots de preview sempre ocupados por outras sessões simultâneas, mesmo problema já registrado no Bloco 33 pros achados de Wärtsilä/Patrimônio). **Pendência real pra confirmar 100%**: usuário (ou próxima sessão com preview livre) testar o clique de "＋ Lançar" numa UI de verdade.

**Registrado de novo, não corrigido** (pedido explícito do usuário, backlog de segurança): `public.v1_v2_caixa_mapa` continua com RLS desabilitado (exposta a leitura/escrita por qualquer chave anon) — mesmo advisor já visto em sessão anterior. Habilitar RLS sem policy nova bloquearia todo acesso à tabela; decisão de política de acesso é do usuário, não de agente.

**Aquisição de hardware registrada, documentação de arquitetura futura preparada** (fora da sequência de Fase 5, pedido à parte do usuário no meio da sessão): medidor de energia Chint 2 polos 80A/275V, compatível com o inversor SAJ, adquirido 08/08/2026 (mais cabo Cat6 e quadro de distribuição) — ainda não instalado fisicamente. Documentado em `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`: schema atual do domínio Solar (confirmado via Supabase), o que muda com dado real de consumo/geração instantâneos, o que pode ser aposentado (e sob que condições), e um plano de migração em 4 fases (descoberta de API → captura paralela → validação cruzada → decisão de aposentadoria). Só documentação — nenhum código ou tabela alterados, por instrução explícita do usuário ("não implementar nada agora").

**Commits desta rodada**: `1aed7c6` (2 achados da auditoria de duplicata V1), `c3edef3` (fecha fase de migrações rápidas), `48ecb8a` (doc Solar/medidor SAJ), `7139966` (Fase 5 — refresh pós-lançamento).

---

## Bloco 33 — Encerramento formal da fase de migrações rápidas: auditoria final + 2 achados + classificação A/B/C/D dos remanescentes (08/08/2026, continuação do Bloco 32)

**Contexto**: sessão retomada depois do fechamento do Bloco 32. O usuário pediu primeiro pra avançar em "Ciclo Snapshots Etapa 2" — investigação confirmou que **isso já estava concluído** no próprio Bloco 32/commit `f6e2a7d` (a passagem de turno que o usuário tinha em mãos estava desatualizada nesse ponto específico). Sem trabalho novo ali, o usuário pediu uma última auditoria sistemática do padrão "card migrado pra V2, exibição secundária esquecida em V1" — o mesmo que rendeu 6 achados na rodada anterior — como teste final antes de declarar encerrada a fase de migrações rápidas.

**Auditoria executada** (agente Explore, leitura read-only de 16 arquivos `hydrate-onda*.js` + 13 arquivos de exibição secundária + varredura cruzada no restante do código-fonte, excluindo deliberadamente Caixa Lance/Solar 301×361/exceções formais): encontrou **2 achados confirmados** (bem menos que os 6 da rodada anterior — sinal real de esgotamento do padrão, não coincidência):

1. **Card "Caixa Wärtsilä"** (saldo/barra/texto de excedente, `cxWartsila`/`cxWartsilaBar`/`cxWartsilaExcedente`/`cxWartsilaProvisionado`) e o **badge `r21Wartsila` do Resumo Executivo** ficavam travados no valor V1 do boot — `hydrateWartsilaCaixasTextos()`/`hydrateResumoExecutivo()` rodam ANTES de `aplicarOnda4Wartsila()` no `hydrate()` síncrono, e nunca eram re-chamadas depois que `REG.wartsilaCaixa`/`REG.faturaWartsila` eram atualizados pela V2.
2. **`kpiPatrimonio`/`r21Patrimonio`/`r21MetaMilhaoPct`** (Resumo Executivo) liam `REG.patrimonio.total`/`metaMilhaoPct`, que `aplicarOnda4Patrimonio()` nunca resincronizava (só escrevia direto nos ids do card principal `patTotal` etc, sem atualizar os campos derivados em `REG`) — bug "dormente", não visível até a V2 divergir do V1 por construção.

**Implementado**: `hydrate-onda4-wartsila.js` — re-chama `hydrateWartsilaCaixasTextos()`+`hydrateResumoExecutivo()` no fim da função, depois de `REG` atualizado; 4 ids novos adicionados a `ONDA4_WARTSILA_IDS` (sem fallback silencioso, domínio é V2-exclusivo). `hydrate-onda4-patrimonio.js` — `REG.patrimonio.total`/`metaMilhaoPct` resincronizados antes da re-chamada de `hydrateResumoExecutivo()`.

**Bug real cometido e corrigido na própria implementação, antes de commitar**: a auditoria de divergência V1×V2 já existente no fim de `aplicarOnda4Patrimonio()` capturava `v1Total` LENDO `REG.patrimonio.total` — como essa mesma linha já tinha sido sobrescrita pelo fix (linha anterior no arquivo), o log passou a comparar o valor novo contra ele mesmo, sempre reportando "batem" mesmo que divergisse de verdade. Corrigido movendo a captura de `v1Total` pra ANTES da sobrescrita. **Lição registrada em `ESTADO_ATUAL.md`**: ao resincronizar um campo derivado que já tem auditoria de divergência no mesmo módulo, sempre capturar o valor V1 original antes de sobrescrever, nunca depois.

**Validação**: não foi possível validar ao vivo no navegador desta vez — os 5 slots de preview do ambiente estavam ocupados por outras sessões simultâneas, e abrir `Sistema_Wallace_Lira_Completo.html` via `file://` direto não executa o fetch/JS (diferente da descoberta do Bloco 31, que dependia do preview local do `.claude/launch.json`, também ocupado). Compensado com revisão manual completa do código (leitura linha a linha das duas funções alteradas, mais o processo de descoberta do próprio bug de auditoria acima) — mas fica registrado como validação NÃO confirmada em navegador real, ao contrário de todos os achados anteriores desta sessão. Recomendado ao usuário conferir visualmente o card Caixa Wärtsilä e os badges `r21Wartsila`/`r21Patrimonio` na próxima vez que abrir o site de verdade.

**Commitado e enviado**: `1aed7c6` → `origin/main`.

**Áreas verificadas pela auditoria SEM achado** (não omitir por seletividade — registrado explicitamente): Boletos, Bens Duráveis, Eventos, Seguro, Escola, Caixa Variável, cartões Mastercard/Infinite, PIX Vanessa, LREI, P2P, Investimentos/ROC, Parcelamentos, Solar (qualidade de geração), Mercado Pago, Pluggy, Cronograma de Boletos — todos já cobertos pelos overlays das Ondas 1-8 ou pelo mecanismo legado `MAPA_CAIXAS_V1_V2`/`promoverCampoV2SeConfiavel` (`app.js`, `auditoriaCruzadaV1V2()`). `balResSuavizacao` (Conta Suavização) foi investigado como possível 3º achado mas já está coberto por esse mecanismo legado (`app.js:1974`) — não é gap real, descartado.

**Decisão do usuário, encerrando a fase**: com só 2 achados nesta rodada (vs. 6 na anterior), a fase de "migrações rápidas" (caça a candidatos A/B de baixo esforço, incluindo a varredura sistemática do padrão de exibição duplicada) foi declarada formalmente encerrada. Pedido explícito de reescrever `ESTADO_ATUAL.md` e atualizar esta passagem de turno consolidando: números finais (~61 removidos), classificação A/B/C/D dos ~10-12 remanescentes (bloqueado por decisão humana / bloqueado por cadastro / bloqueado por modelagem / exceção formal), e os 4 padrões técnicos descobertos nesta fase (duplicata V1 esquecida; bug de cache do `WallaceFinanceService`; pré-carregamento como solução geral pra "leitura síncrona no boot"; critério que permitiu remover consumidores sem modelagem nova). Detalhe completo de cada padrão e da classificação está em `ESTADO_ATUAL.md` — não duplicado aqui.

**Próxima fase, ainda não iniciada**: bloqueador a bloqueador, não mais varredura ampla. Primeiro candidato natural é o item classe B (`CARTAO_PLUGGY_MAPA`) — o único puramente operacional (falta só o usuário passar os finais de cartão do Itaú), sem nenhuma decisão de negócio pendente.

---

## Bloco 32 — Fechamento da sessão de aceleração V2 (08/08/2026, encerramento — ler antes de tudo abaixo)

**Resumo executivo pro próximo agente**: esta foi a maior rodada de redução de dependência de `wallace_dados` até agora — 37 → ~59 consumidores/domínios removidos ou religados à V2, em 13 commits (`91fcf4e` até `f6e2a7d`). Detalhe completo de cada um está nos blocos sem numeração logo abaixo (Ciclo Snapshots/Pluggy/Cronograma de Boletos/classificação de prioridade/bugfix solar) — este bloco é só a síntese e o que fica pra próxima sessão.

**Ordem de leitura recomendada pro próximo agente**: `ESTADO_ATUAL.md` primeiro (reescrito do zero, tem a métrica final e os achados técnicos reutilizáveis), depois este bloco, depois os 4 blocos sem numeração abaixo se precisar do detalhe passo a passo de algum commit específico.

**Os 3 achados técnicos mais importantes desta sessão** (já em `ESTADO_ATUAL.md`, repetido aqui por importância):
1. O padrão de pré-carregamento (`Promise.all` no HTML, antes de `app.js` existir) resolve qualquer domínio que pareça precisar de leitura síncrona no boot — não é um bloqueador de verdade, só não tinha sido usado ainda pra esse caso específico. Isso derrubou sozinho o maior domínio restante (Ciclo Snapshots, 15 consumidores) depois que uma primeira avaliação minha tinha (erradamente) classificado como bloqueador técnico real.
2. `Object.assign(VARS, dr)` pode sobrescrever silenciosamente qualquer migração V2 que tenha uma chave homônima ainda viva em `wallace_dados` — sempre proteger com "guarda antes do merge, restaura depois" (padrão já usado 2x: `LEGENDAS` e `CICLO_SNAPSHOTS`).
3. A classe de bug "card já migrado pra V2, uma segunda exibição do mesmo valor esquecida em V1" rendeu 6 achados reais nesta sessão (Boletos, 4 caixas de Reservas, Patrimônio, Caixa Variável, barras de meta, LREI) — vale auditar de novo em qualquer nova seção que apareça no painel.

**O que NÃO foi feito, por decisão explícita do usuário ou por ainda não valer o esforço** (todos documentados em `ESTADO_ATUAL.md`): `PLUGGY_TRIAGEM` (baixo impacto, granularidade mista, decisão explícita de deixar fora), ~6 chaves Classe C de ROI~0 já triadas em sessões anteriores, `CARTAO_PLUGGY_MAPA` (bloqueado esperando dado do usuário), exceções formais de headline totals de cartão (nunca serão só-V2, por design).

**Estado do repositório**: `git status` limpo, tudo commitado e enviado até `f6e2a7d` (mais este próprio commit de documentação). `WALLACE_VALIDACAO_RUNTIME` 17/18 (a única reprovação, FASE 2F, é um gap pré-existente não relacionado a nada desta sessão), `healthBadge` "✅ Sistema íntegro".

**Pendência que só o usuário pode resolver** (não é um "próximo passo técnico", é configuração de conta): criar Project no Claude Chat (`wallace.termica@gmail.com`) e anexar `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` como Project Knowledge — sem isso, chats novos no Claude Chat não recebem a governança formalizada nesta sessão automaticamente. Ver `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` seção 10 pro passo a passo.

---

## Bloco 31 — Modo aceleração: `cxBoletosPct`/`cxBoletosBar`/`balResBoletos` migrados (08/08/2026, continuação do Bloco 30)

**Diretriz do usuário**: governança encerrada (commit `7f8c910`), fila contínua sem checkpoints — investigar → implementar → validar → commit → push → próximo, só parar em bloqueador real.

**Investigação de `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES`**: o saldo da Caixa Boletos (`cxBoletosSaldo`) já estava em V2 desde a Onda 1 (`vw_saldo_v2_por_caixa`). Achado: 3 outros IDs de DOM que exibem o mesmo saldo em contextos diferentes (`cxBoletosPct`/`cxBoletosBar` — barra de meta da seção 05; `balResBoletos` — linha do Balanço Operacional) não estavam na lista de override do Onda 1 e continuavam mostrando o valor V1 puro (computado por `aplicarBoletosVencidosAutomaticamente()` a partir de `CRONOGRAMA_BOLETOS_FIXOS`).

**Classificação**: A — infraestrutura V2 já existente (mesma `vw_saldo_v2_por_caixa`, já buscada), só faltava ligar 3 IDs que ficaram de fora da Onda 1 original.

**Implementado**: `src/financeiro/caixas/hydrate-onda1-v2.js` — adicionado callback `extra()` no item "Caixa Boletos" do `ONDA1_V2_MAPA`, reaproveitando o `valorV2` já resolvido (sem fetch novo) pra recalcular % (contra a meta fixa 2600) e sobrescrever a barra e `balResBoletos`. Também adicionados `cxBoletosPct`/`balResBoletos` à lista `ONDA1_V2_IDS` usada por `marcarIndisponivelV2()` — sem isso, uma falha de fetch V2 deixaria esses 2 IDs mostrando V1 silenciosamente, quebrando a promessa "sem fallback silencioso" (achado e corrigido antes de validar).

**Validado em navegador real, sem login** — descoberta de ambiente: `Sistema_Wallace_Lira_Completo.html` roda standalone (busca Supabase real via anon key) independente do fluxo de login do `index.html`; usei isso pra validar sem precisar de credencial. Console zerado, `Onda1V2 [Caixa Boletos]: V1×V2 batem`. DOM real: `cxBoletosSaldo`="R$ 1.488,42", `cxBoletosPct`="57,2%", `cxBoletosBar.style.width`="57.2469%", `balResBoletos`="R$ 1.488,42" — todos consistentes.

**Commitado e enviado**: `91fcf4e` → `origin/main`.

**Auditoria de continuidade**: depois de fechar o caso Boletos, chequei se o mesmo padrão (card migrado, linha de Reservas/Balanço esquecida) se repetia em outra caixa — comparando todos os ids `balRes*`/`balOp*` de `hydrate-balanco.js` contra os mapas das Ondas 1-5. Achei 4 casos idênticos: Caixa Bens Duráveis (`balResBensDuraveis`), Caixa Eventos (`balResEventos`), Caixa Seguro Emplacamento (`balResSeguro`), Escola de Júlio (`balResEscola`) — todas `aceitarDivergenciaConhecida:true` no Onda2V2 (já exibem V2 no card), mas a linha de Reservas continuava em V1 puro por não estar na lista.

**Implementado**: `src/financeiro/caixas/hydrate-onda2-v2.js` — campo `extraId` novo em cada uma das 4 entradas do `ONDA2_V2_MAPA`, reaproveitando o mesmo `valorV2` já resolvido (sem fetch novo) pra escrever também na linha de Reservas. `ONDA2_HARDEN_IDS` e o branch `sem_dado_v2` (falha de fetch) também passam a cobrir os `extraId`s — mesma blindagem "sem fallback silencioso" aplicada ao caso Boletos.

**Validado ao vivo** (mesmo método, `Sistema_Wallace_Lira_Completo.html` standalone, sem login): os 4 pares batem exato — Bens Duráveis R$-355,00/R$-355,00, Eventos R$167,09/R$167,09, Seguro R$426,08/R$426,08, Escola R$1.009,80/R$1.009,80. Zero erro/warning novo no console.

**Auditoria confirmou que não sobra mais nenhum caso desse padrão**: os únicos `balRes*`/`balOp*` ainda em V1 (`balOpPixVanessa`/PGV, `balResLance`) são intencionais — divergência real não resolvida, já documentada e coberta pelas Ondas 2/3 (não são gap de wiring, são bloqueio de dado).

**Commitado e enviado**: `bf638fa` → `origin/main`.

**Terceira ocorrência do mesmo padrão, domínio Patrimônio**: `bfinReserva`/`bfinBTG`/`bfinNectonCC`/`bpFinanciamentoCasa`/`bpConsorcioAuto` (seção "Balanço Patrimonial") duplicavam os mesmos valores que `patReserva`/`patBtg`/`patEscola`/`ppFinanciamentoCasa`/`ppConsorcioAuto` (card "Meta do Milhão") já mostravam via V2 (`aplicarOnda4Patrimonio()`) — só a 2ª seção nunca foi ligada. Implementado reaproveitando os mesmos valores já resolvidos na mesma função, sem fetch novo. **Escopo deliberadamente limitado**: os totais compostos da mesma seção (`balFinanceiroTotal`, `balAtivosTotal`, `balPatrimonioLiquido`/`TotalGeral`) ficaram de fora — misturam componentes que ainda não têm V2 (físico: casa/apartamento/jazigo/solar/carro; PGBL; FGTS; consórcio casa pago), não são uma duplicata simples como os 5 ids corrigidos.

**Validado ao vivo**: os 5 pares batem exato (Reserva R$100.644,15, BTG R$14.779,62, Necton CC R$429,75, Financiamento Casa R$61.081,39, Consórcio Auto R$18.998,83). `Onda4Patrimonio` continua reportando V1×V2 batendo no total (R$120.375,65), sem regressão. Zero erro/warning novo.

**Commitado e enviado**: `db2b1be` → `origin/main`.

**Quarta ocorrência do mesmo padrão**: `balOpCaixaVariavel` (seção "Balanço Patrimonial" → Operacional) duplicava o mesmo saldo real da Caixa Variável que `cvSaldoReal` (Onda 1) já mostrava via V2 — nunca tinha sido ligado. Fix idêntico aos anteriores: `extra()` no item "Caixa Variável" do `ONDA1_V2_MAPA`, reaproveitando `valorV2`, sem fetch novo. Validado ao vivo: `cvSaldoReal`=`balOpCaixaVariavel`=R$1.886,65, zero erro novo.

**Commitado e enviado**: `6485f0d` → `origin/main`.

**Quinto achado, mesma classe**: revisitei `hydrate-caixas.js` (não só `hydrate-balanco.js`) e achei que Escola de Júlio tem MAIS 2 duplicatas além do `balResEscola` já corrigido — a barra de meta (`cxEscolaPct`/`cxEscolaBar`) e o badge do Resumo Executivo (`r21EscolaJulio`, em `hydrate-metas.js`), ambos ainda lendo `pctOf(V1, meta)`. Ao revisar as 3 outras caixas com `aceitarDivergenciaConhecida:true` (Bens Duráveis, Eventos, Seguro Emplacamento), achei que elas também tinham barra de meta em V1 puro (`cxBensDuraveisBar`, `cxEventosPct`/`cxEventosBar`, `cxSeguroBar`) — mesmo padrão do Boletos original, só que dentro da própria seção 05 (card com saldo migrado, barra de %/meta esquecida).

**Implementado**: `src/financeiro/caixas/hydrate-onda2-v2.js` — mecanismo `extra()` (mesmo já usado no Onda 1 pra Boletos) adicionado às 4 entradas do mapa (Escola, Bens Duráveis, Eventos, Seguro), reaproveitando `pctOf()` (declarado globalmente em `hydrate-onda1-v2.js`, carregado antes — sem redeclarar) e o `valorV2` já resolvido. Bens Duráveis mantém o mesmo tratamento de saldo negativo (`Math.max(0,...)`) que `hydrateCaixas()` já tinha.

**Validado ao vivo**: Escola `cxEscolaPct`=`r21EscolaJulio`="11,0%" (batendo com R$1.009,80/R$9.200), Eventos `cxEventosPct`="8,4%" (R$167,09/R$2.000), Seguro barra "8.35%" (R$426,08/R$5.100), Bens Duráveis barra "0%" (saldo negativo, clamp correto). Zero erro novo.

**Métrica após os 5 achados desta rodada**: 37 → **53 consumidores removidos** / ~46 → **~30 restantes**.

**Auditoria final desta classe de bug** (revisitada depois do 5º achado, agora cobrindo `hydrate-caixas.js` + `hydrate-metas.js` + `hydrate-balanco.js` inteiros): não sobra mais nenhum id lendo `pctOf`/saldo puro V1 para as 8 caixas com V2 disponível (Boletos, Bens Duráveis, Eventos, Seguro, Escola, Caixa Variável, Mastercard/Infinite, PIX Vanessa) em qualquer das 3 seções onde aparecem (card seção 05, Reservas/Operacional do Balanço, Resumo Executivo). O que resta em V1 é por motivo diferente e documentado: `balObr*` (exceção arquitetural formal), `balFluxo*`/`bal4q*` (sem V2 relacional ainda), `patPrevidencia`/`patFgts` (sem tabela V2), 4 caixas com divergência não confirmada (Manutenção/Saúde/PGV/Aniversário — decisão explícita do usuário de não reabrir), Caixa Lance (mesma classe, também não reabrir), Provisionado Wärtsilä (falta estrutura V2 pro campo fatura).

**Commitado e enviado**: `8c6c2b5` → `origin/main`.

**Sexto achado, variante mais sutil da mesma classe**: `aplicarOnda4Lrei()` sobrescreve `VARS.LREI_ATIVAS` de forma assíncrona, mas 2 renderizações já tinham rodado de forma síncrona (boot) com o array V1 ANTES dessa sobrescrita — `REG.qualidade.lreiAtivos` (alimenta o alerta "N empréstimo(s) interno(s) ativo(s)" em `hydrateQualidade()`) e `balLreiAtivos` (resumo do Balanço). Diferente dos achados anteriores (só reescrever um id de DOM), aqui era preciso resincronizar o valor derivado (`REG.qualidade.lreiAtivos`) e re-chamar a função de render (idempotente, confirmado lendo o código antes de reusar).

**Achado colateral, fora de escopo**: uma 3ª exibição (`hydrate-simulador-ciclo.js`, aging por LREI) já está com bug em V1 puro, sem relação com a migração — `.map()` na linha ~52 não inclui o campo `id`, então `$(l.id)` nunca encontra elemento e o `forEach` não faz nada. Não é regressão desta rodada, documentado mas não corrigido (fora do escopo de "reduzir consumidor V1", é um bug de renderização pré-existente).

**Implementado**: `src/financeiro/operacional/hydrate-onda4-lrei.js` — depois de `renderLivrosVariaveis()`, resincroniza `REG.qualidade.lreiAtivos` (mesma fórmula de `app.js:1109`) e re-chama `hydrateQualidade()`; reescreve `balLreiAtivos` direto (mesma lógica já usada em `hydrate-balanco.js`).

**Validado ao vivo**: `balLreiAtivos`="2 ativo(s): LREI0003 (R$266,23), LREI0004 (R$103,55)", alerta="2 empréstimo(s) interno(s) ativo(s) — mais antigo com 16 dias" — ambos batendo com `VARS.LREI_ATIVAS` real (LREI0002 quitado, LREI0003/0004 ativos). Zero erro novo.

**Métrica após os 6 achados desta rodada**: 37 → **55 consumidores removidos** / ~46 → **~28 restantes**.

**Commitado e enviado**: `9e8c27a` → `origin/main`.

**Usuário confirmou a estratégia funcionou melhor que atacar Pluggy/MP/Ciclo Snapshots direto — pediu para continuar.** Fiz uma segunda varredura nos módulos Onda 3/5 ainda não auditados (Suavização, LRW/LRV, Parcelamentos): Suavização e LRW/LRV já estavam completos, sem gap. Parcelamentos tinha um caso parecido (`livroLRP`/`totalOpProvMP`, calculados de forma síncrona antes da sobrescrita V2) mas os dois só alimentam compostos protegidos por exceção formal (headline totals de cartão) ou domínio sem V2 ainda (Necessidade) — **não toquei**, fora do critério A/B seguro.

**Triagem de Pluggy/Mercado Pago/Ciclo Snapshots (pedido do usuário)**: confirmado que `atualizar_mercadopago_eventos` (a RPC que já existia) gravava dentro do próprio `wallace_dados` — nenhuma tabela relacional real por trás, mesma classe do `PIB_WALLACE_HISTORICO`. Comparei esforço: Mercado Pago (3 consumidores, 1 tabela simples) < Pluggy (5-6 consumidores, 3 tabelas relacionadas) << Ciclo Snapshots (15 consumidores, núcleo do `CycleEngine.js`). Como isso é "modelagem nova de grande porte" (uma das condições de parada do próprio usuário), apresentei o desenho antes de executar — aprovado.

**Migração Mercado Pago executada**: nova tabela `mercadopago_eventos` (Supabase), RLS com leitura pública. Backfill dos 9 eventos existentes em `wallace_dados` — conferido 9/9, `status_triagem` preservado. RPC `atualizar_mercadopago_eventos` reescrita mantendo a mesma assinatura (`mercadopago_sync.py` não precisou mudar a chamada da RPC) — testada ao vivo via SQL direto: reenviar um evento existente preservou `status_triagem` custom ("aprovado"), evento novo entrou como "pendente" — comportamento correto confirmado antes de seguir. Único ponto do script Python alterado: `obter_checkpoint()` lê `max(atualizado_em)` da tabela nova em vez de `wallace_dados`.

**JS**: `WallaceFinanceService.getMercadoPagoEventosV2()` novo (mesmo padrão dos outros métodos). `src/auditoria/classificacao/hydrate-onda6-mercadopago.js` novo — mesma estratégia "reescreve VARS.MERCADOPAGO_EVENTOS, reaproveita `sincronizarMercadoPagoParaInbox()`/`renderMercadoPagoDashboard()` (V1, inalteradas)" já usada em Wärtsilä/Investimentos/Parcelamentos/LREI. Cuidado extra replicado do encadeamento já existente pra Pluggy (`reconciliarTransacoesPluggy`, app.js parte 115): `classificarInboxPendentes()` re-chamada depois do fetch assíncrono resolver, senão os itens novos da Inbox nunca teriam a chance do classificador genérico.

**Validado ao vivo, sem login** (mesmo método): 8 dos 9 eventos foram pra Inbox — o 9º (`MP172597269618`) corretamente excluído por já ter `status_triagem="rejeitado"` de uma triagem anterior, preservada intacta pela migração (prova de que o merge por `id` na RPC nova funciona igual ao antigo). Zero erro de console. `render-mercado-pago-dashboard.js`: elemento `#mpDashboardResumo` não existe no HTML atual (condição pré-existente, já tratada com `if(!el) return`, não é regressão desta mudança).

**Achado colateral, fora de escopo desta rodada**: `pluggy_conexoes`/`pluggy_contas`/`pluggy_transacoes` (Pluggy) e o núcleo do `CycleEngine.js` (Ciclo Snapshots) continuam Classe C — próximos candidatos se o usuário quiser continuar investindo em modelagem nova.

**Segurança, fora do escopo desta sessão, sinalizado pelo advisor do Supabase**: `public.v1_v2_caixa_mapa` está com RLS desabilitado (exposta a leitura/escrita por qualquer chave anon). Não corrigido automaticamente (mudar RLS sem policy nova bloquearia todo acesso) — reportado ao usuário, decisão de política de acesso é dele.

**Métrica final desta rodada de aceleração**: 37 → **56 consumidores removidos** / ~46 → **~27 restantes**.

**Commitado e enviado**: `b24c275` → `origin/main`.

**Usuário confirmou explicitamente que a estratégia funcionou melhor que atacar Pluggy/MP/Ciclo Snapshots direto e pediu para continuar** — encerrada a frente de "id de DOM duplicado" (6 achados, 55 removidos), pivotei pra modelagem nova real conforme aprovado.

## Pluggy migrado — schema, contagens e validação

**Investigação**: `VARS.PLUGGY_CONTAS` é uma árvore aninhada (conexões → contas → transações, incluindo dados de fatura de cartão), sincronizada por `sincronizar_pluggy.py` via RPC que substitui o blob inteiro a cada rodada (não faz merge). Separado disso, `VARS.PLUGGY_TRIAGEM` guarda decisões de aprovar/rejeitar da Inbox, com ids sintéticos de granularidade mista (conta e transação). Escopo aprovado pelo usuário: migrar só `PLUGGY_CONTAS` (as 3 entidades), deixar `PLUGGY_TRIAGEM` de fora.

**Schema final**:
- `pluggy_conexoes` (item_id PK, banco, status, atualizado_em)
- `pluggy_contas` (id PK, conexao_id FK, numero, tipo, subtipo, nome, saldo, moeda, limite_total, limite_disponivel, fatura_vencimento_atual, fatura_valor_total, fatura_pagamento_minimo, qtd_transacoes_sincronizadas)
- `pluggy_transacoes` (id PK, conta_id FK, data, descricao, valor, categoria, status)
- RLS habilitado nas 3, policy de leitura pública (anon/authenticated), mesmo padrão das tabelas V2 já existentes.

**Achado real durante a modelagem, corrigido antes de perder dado**: a 1ª tentativa usou `(conexao_id, numero)` como chave primária de `pluggy_contas`. O backfill de teste voltou 9 contas em vez das 11 esperadas — investigado e confirmado: `numero` (o número mascarado da conta) **não é único por conexão**. Duas contas reais do mesmo item BTG ("BTG Investimentos" e "BTG Banking") compartilham o mesmo número mascarado. Além disso, o script Python nunca capturava o `id` real da conta na API Pluggy (só usava `id` pra chamar `/bills` e `/v2/transactions`, nunca guardava no payload). Corrigido: schema recriado usando `id` como chave primária real — o id verdadeiro da Pluggy quando disponível, ou um hash estável (`item_id+numero+nome`) para as linhas do backfill (onde o id real nunca existiu na origem). `sincronizar_pluggy.py` corrigido pra capturar `c.get("id")` daqui pra frente, garantindo id real em todas as sincronizações futuras.

**Backfill**: chamado direto contra a RPC nova usando o snapshot atual de `wallace_dados.PLUGGY_CONTAS` como entrada — exercita exatamente o mesmo caminho de código que roda em produção. Resultado: 5 conexões, 10 contas distintas (11 linhas brutas na origem — 1 era uma duplicata literal real, mesmo item_id+numero+nome, corretamente descartada; confirmado que não é perda de dado, é a mesma conta representada duas vezes na origem), 371 transações — 100% preservadas.

**RPC `atualizar_pluggy_contas` reescrita** — mesma assinatura (`sincronizar_pluggy.py` não precisou mudar a chamada de escrita). Substituição total (delete + insert) nas 3 tabelas por rodada, mesmo comportamento do `jsonb_set` anterior (o payload do Python já é sempre o snapshot completo, nunca incremental).

**JS**: `WallaceFinanceService.getPluggyContasV2()` novo — busca as 3 tabelas em paralelo e reconstrói localmente o MESMO shape aninhado que `VARS.PLUGGY_CONTAS` sempre teve, pra que `reconciliarPluggy()`/`reconciliarTransacoesPluggy()` (V1, inalteradas — mapa de cartão, filtro de ruído, comparação de fatura por vencimento) continuem funcionando sem saber que a fonte mudou. `src/integrations/pluggy/hydrate-onda7-pluggy.js` novo, mesmo padrão dos módulos anteriores. Mesmo cuidado já aplicado a LREI/Mercado Pago: `classificarInboxPendentes()` e `hydrateQualidade()` (alerta ao vivo do saldo Mercado Pago, lê `VARS.PLUGGY_CONTAS` direto) re-chamadas depois do fetch assíncrono resolver.

**Validado ao vivo, sem login**: relatório final — 5 conexões, 10 contas, 371 transações (todos batendo exato com o banco), 0 divergência de fatura, 2 transações suspeitas corretamente detectadas e levadas pra Inbox. `VARS.PLUGGY_TRIAGEM` (3 triagens antigas, incluindo uma transação e uma conexão desatualizada) confirmado intacto — as 2 transações que apareceram na Inbox são exatamente as que ainda não tinham triagem, nenhuma triagem antiga foi re-perguntada. Zero erro de console.

**Entrega final pedida pelo usuário**:
- Schema final: 3 tabelas (ver acima).
- Conexões migradas: 5/5.
- Contas migradas: 10/10 (distintas; 11 linhas brutas na origem, 1 duplicata real descartada corretamente).
- Transações migradas: 371/371.
- Consumidores removidos da V1 nesta rodada: `PLUGGY_CONTAS` (1 domínio, 3 arquivos JS deixaram de ler `wallace_dados` para isso).
- `PLUGGY_TRIAGEM`: documentado, deixado fora desta rodada por decisão explícita do usuário — candidato a etapa futura separada.

**Métrica final da sessão de aceleração completa**: 37 → **57 consumidores removidos** / ~46 → **~26 restantes**.

**Commitado e enviado**: `7637354` → `origin/main`.

## Priorizar impacto, não facilidade — classificação e Cronograma de Boletos

**Diretriz nova do usuário**: encerrar a caça a candidatos A/B fáceis, classificar os ~26 restantes por (1) impacto operacional, (2) número de consumidores, (3) esforço, e escolher pelo impacto — não pela facilidade. Regra de execução: se modelagem clara + sem risco de perda de dado + sem decisão de negócio pendente → executar direto, sem parar pra autorização.

**Classificação entregue**: Ciclo Snapshots tem o maior número de consumidores (15) e maior impacto potencial (núcleo do `CycleEngine.js`), mas foi **descartado como próximo passo** — falha o próprio critério de execução direta do usuário, é a estrutura mais complexa/menos mapeada do sistema (já triado em rodada anterior como pior candidato que Pluggy). `PLUGGY_TRIAGEM`: baixo impacto (3 registros, só estado de decisão), não prioritário. Mercado Pago: já migrado nesta sessão, não é mais candidato. Escolhido `CRONOGRAMA_BOLETOS_FIXOS` — menos consumidores que Ciclo Snapshots, mas modelagem clara e risco baixo confirmado, com impacto real (lógica financeira ativa, não só cosmética).

**`CRONOGRAMA_BOLETOS_FIXOS` migrado**: nova tabela `cronograma_boletos_fixos` (tx PK, nome, dia_vencimento, valor, ativo). Backfill dos 9 boletos fixos, soma conferida (R$2.642,95, bate exato com a soma manual). **Escopo deliberadamente contido**: só o schedule migrou, não `BOLETOS_TRANSACOES` (lista de dedupe interna do auto-crédito) — o saldo real da Caixa Boletos já vinha 100% da V2 desde a Onda 1 desta mesma sessão, então não havia valor visível adicional em migrar esse segundo array agora.

`src/financeiro/caixas/hydrate-onda8-cronograma-boletos.js` novo — sobrescreve `VARS.CRONOGRAMA_BOLETOS_FIXOS` (que continua existindo em `vars-caixas.js` como fallback síncrono do boot, comentado como tal) e re-roda `aplicarBoletosVencidosAutomaticamente()` (V1, inalterada — idempotente por construção, `txJaLancados` evita duplicar o que a 1ª passada síncrona já tiver creditado). Efeito prático real: o schedule dos boletos fixos passa a ser editável direto no Supabase, sem deploy de código — mesmo padrão já validado pela tabela `legendas`.

**Validado ao vivo**: V1×V2 batem exato (9 itens, R$2.642,95), `cxBoletosSaldo`/`balResBoletos` inalterados (R$1.488,42, consistentes com antes — auto-crédito idempotente, sem duplicação). Zero erro de console.

**Métrica atualizada**: 37 → **58 consumidores removidos** / ~46 → **~25 restantes**.

**Commitado e enviado**: `d2c574d` → `origin/main`.

## Ciclo Snapshots — bloqueador técnico real encontrado, respeitado

**Contexto**: usuário pediu explicitamente pra priorizar impacto, classificar os ~25 restantes e escolher o melhor candidato, com autorização pra executar direto contanto que houvesse modelagem clara, sem risco de perda de dado e sem decisão de negócio pendente. Classificação entregue: Ciclo Snapshots tinha o maior número de consumidores (15) mas o maior risco; escolhido primeiro `CRONOGRAMA_BOLETOS_FIXOS` (ver bloco acima), depois o usuário pediu explicitamente pra avançar pra Ciclo Snapshots mesmo assim, com diretriz clara de "menor modelagem possível, preservar comportamento do CycleEngine".

**Rodapé de versão corrigido antes de prosseguir**: usuário reportou "tá desatualizado demais" vendo o rodapé mostrar "v06/08/2026 (parte 140)" — era texto fixo no HTML, nunca ligado a nada, enquanto `__V` (cache-buster real) seguia sendo bumpado normalmente. Corrigido na raiz: rodapé agora deriva de `__V` via JS, nunca mais pode dessincronizar. Commit `718abd9`.

**Investigação de Ciclo Snapshots**: mapeei os 15 consumidores e o schema completo (~25 campos escalares + `cascata` aninhada +, para ciclos fechados, 4 arrays de Livro Razão arquivados). Achado real: `CICLO_SNAPSHOTS` é lido de forma SÍNCRONA durante a construção inicial do `VARS`, por `aplicarCicloAoVARS()`, `recalcularNecessidade()`, `auditoria-automatica.js` e `CycleEngine.js` — Total Operacional, Necessidade Líquida, Modo Operacional e Saldo do Ciclo (números que o usuário usa pra decisão financeira diária) dependem desse dado estar pronto ANTES do primeiro cálculo do boot. Uma busca no Supabase é sempre assíncrona — trocar a fonte exigiria re-executar em cascata toda essa cadeia depois que o fetch resolvesse, um recálculo que eu não conseguiria mapear e validar com segurança total no tempo restante da sessão. **Isso bate exatamente na condição de parada que o próprio usuário definiu ("bloqueador técnico real")** — não contornado, não arriscado.

**Decisão tomada**: separar a migração em 2 etapas. Etapa 1 (feita agora): mover só a ARMAZENAGEM pra uma tabela relacional, zero risco comportamental (nada no JS lê essa tabela ainda). Etapa 2 (explicitamente NÃO feita, fica pra sessão dedicada futura): religar os 15 consumidores.

**Tabela criada**: `ciclos_financeiros_snapshots` — schema completo espelhando 1:1 o literal (`salario`, `entradas_totais`, campos de Caixa Variável, `reembolso_recebido`/`a_receber`, tolerância, `cascata` em jsonb, necessidade bruta/líquida, `modo_operacional`, `saldo_ciclo`, valores congelados de cartão do ciclo fechado, `livros_razao_arquivados` em jsonb com os 4 arrays LRW/LRV/LRC_LIMBO/LRPV do ciclo fechado). RLS com leitura pública. Backfill dos 2 ciclos existentes, copiado verbatim do literal (nunca "chutado") — conferido: `2026-06` (fechado) com 43 lançamentos LRW arquivados batendo exato com o comentário original do código ("43+10+6 lançamentos reais"), `2026-07` (aberto) sem arquivo, como esperado.

**Comentário deixado na própria tabela** (`comment on table`) documentando explicitamente que só a armazenagem foi migrada e que o literal de `vars-ciclo-snapshots.js` NÃO deve ser removido até a 2ª etapa — proteção contra uma sessão futura assumir por engano que a migração está completa.

## Bugfix fora da fila — frescor solar com alarme falso à noite

Usuário reportou ao vivo, mostrando print do badge: "Última atualização há 2 horas — verifique se o robô SAJ está rodando", e apontou a causa raiz ele mesmo — o robô só lê das 6h às 18h (mostrou o cron `*/10 6-18 * * *` do workflow), não faz sentido continuar lendo/alarmando à noite sem geração.

**Corrigido**: `formatarFrescor()`/`montarBadgeFrescor()` (app.js) ganharam um parâmetro opcional `agoraParaFaixa` — só usado pra CLASSIFICAR a faixa de alarme (verde/amarelo/laranja/vermelho), default `Date.now()` real, zero mudança de comportamento pra qualquer outro chamador que não passar o argumento (badge de frescor do ROC, etc). Novo `agoraEfetivoFrescorSolar()` em `hydrate-onda5-qualidade-geracao.js` — fora da janela 6h-18h (Brasília, UTC-3 fixo, sem horário de verão desde 2019, trick de deslocar o timestamp em -3h e usar getters UTC pra evitar bug de virada de dia), "congela" o relógio de classificação no último fechamento (18h) e só volta a contar quando a janela reabre. O tempo REAL exibido ("há 2 horas") continua sempre honesto — só a classificação de alarme ignora as horas noturnas sem leitura por design.

**Validado ao vivo, no horário real de teste (21h em Brasília, dentro da janela noturna)**: badge mudou de "⚠️ atualização antiga, laranja" pra "✅ Atualizado há 2 horas, verde". Achado um bug na 1ª tentativa de implementação (misturar hora-SP com data-UTC gerava um timestamp no FUTURO) — pego e corrigido antes de considerar validado, testado de novo, confirmado certo. Zero erro de console. Commit `a85b469`.

**Já commitado e enviado**: `718abd9` (rodapé) e `a85b469` (frescor solar). **Pendente**: commit + push só desta documentação (tabela `ciclos_financeiros_snapshots` já criada e validada em produção, sem código correspondente pra commitar ainda — ver Etapa 2 pendente acima).

## Bloco 30 — Endurecimento final de governança dos agentes Claude (08/08/2026, continuação do Bloco 29)

**Pedido do usuário**: "endurecimento final da governança dos agentes Claude", tratado como etapa obrigatória da conclusão da V2 — garantir que qualquer Claude novo, em qualquer conta/dispositivo, comece o mais alinhado possível à arquitetura V2 atual. Pedido cobria 10 frentes: nível de confiança da informação, V2 como regra global, treinamento por domínio, governança das 3 contas, sincronização Web/Mobile, bootstrap de chats novos, Claude Chat × Claude Code, fonte canônica, processo de manutenção, resultado esperado.

**1. Nível de Confiança da Informação — implementado**: escala A (Supabase verificado) > B (repositório verificado) > C (usuário informou) > D (hipótese/inferência), regra "nunca apresentar D como fato". Nova seção 0 do `MANUAL_OPERACIONAL_AGENTES.md`, replicada como seção 15 do `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`.

**2. Fonte canônica declarada formalmente**: `docs/MANUAL_OPERACIONAL_AGENTES.md` é o documento mestre (motivo: lido automaticamente por qualquer Claude Code, qualquer conta, sem configuração) — `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (Google Doc) é derivado, existe só porque o Claude Chat não lê o repositório. Nova seção 11 do manual + `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` novo (respostas às 10 perguntas do usuário).

**3. Correção importante no meio do trabalho**: a primeira versão assumiu as 3 contas do usuário (`wallace.termica@gmail.com`, `wallace.servidor@wartsila.com`, `wallace.lira@wartsila.com`) todas interagindo com Claude Chat, propondo replicar Project/Custom Instructions/Project Knowledge 3x. **O usuário corrigiu**: só `wallace.termica@gmail.com` usa Claude Chat para este sistema — as outras 2 são só Claude Code (que já lê o manual automaticamente, sem depender de conta). Revisado no manual (seção 11.1/11.5) e no `GOVERNANCA_MULTI_CONTA_AGENTES.md` para refletir conta única — reduziu drasticamente a complexidade real do problema.

**4. Claude Chat × Claude Code documentado explicitamente**: tabela na seção 11.4 do manual (papel, nível de confiança padrão, o que fazer quando falta evidência) + replicada na seção 16 do Google Doc.

**5. Google Doc atualizado (`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`) — limitação de automação encontrada**: ao tentar inserir as seções novas no final do documento, a automação de navegador (clique + `Ctrl+End`) posicionou o cursor errado e a inserção caiu logo após a introdução em vez do fim. Tentativa de corrigir via `Ctrl+Z` falhou porque a página tinha sido recarregada entre as duas ações (histórico de desfazer não sobrevive à navegação). **Conteúdo confirmado íntegro e completo** via leitura página a página da pré-visualização do Drive (7 páginas, sem duplicação, sem corte) — só a ordem das seções ficou não-sequencial (15/16 aparecem antes da seção 1), efeito cosmético, não substantivo. Decisão: não arriscar mais edições automatizadas para corrigir só a numeração.

**Lição de ferramenta, registrada pra sessões futuras**: dentro do editor do Google Docs via automação de navegador, `Delete`/`BackSpace` sobre uma seleção **não é confiável** (testado 2x, seleção visível mas texto não removido) — só inserção de texto (`type`) funciona de forma confiável. Para reescrever um documento inteiro, pedir ao usuário para selecionar-tudo-e-apagar manualmente primeiro (ele confirmou que o teclado real funciona normal), e só então a automação digita o conteúdo novo. Para apender ao final, sempre confirmar a posição do cursor com uma leitura pós-inserção antes de considerar concluído — não assumir que `Ctrl+End` funcionou só porque não deu erro.

**6. Pendente, fora do alcance de qualquer agente** (exige login em `wallace.termica@gmail.com`): criar Project "Sistema Wallace Lira", anexar o Google Doc como Project Knowledge, definir Custom Instructions curto. Texto pronto em `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` seção 10.

**Pendente**: commit + push de `MANUAL_OPERACIONAL_AGENTES.md` e `GOVERNANCA_MULTI_CONTA_AGENTES.md` — aguardando confirmação do usuário (avisado do conteúdo antes de commitar, regra permanente).

## Bloco 29 — Encerramento de sessão: manual atualizado (treinamento "V2 nativo") + estado consolidado (08/08/2026, continuação do Bloco 28)

**Contexto**: a sessão anterior encerrou o Bloco 28 com "pendente: commit + push" ainda em aberto e bateu o limite de uso antes de escrever a passagem de turno. `git log` confirma que o commit **já havia sido feito** (`be5395f`, `origin/main` atualizado) — só a documentação de handoff ficou pra trás. Este bloco fecha isso e soma um pedido novo do usuário.

**1. Confirmado via `git status`/`git log` (nunca assumir estado de sessão anterior sem checar)**: `be5395f` é HEAD, branch limpo em relação ao remoto — o Bloco 28 (migração de `consorcioCasaProximaAssembleia` + varredura completa do bloco Operacional) está de fato commitado e enviado, não pendente.

**2. Pedido novo do usuário nesta sessão**: formalizar como regra permanente que todo agente Claude (Web e Mobile) aberto neste projeto deve **operar** a V2 como sistema principal (compras, pagamentos, caixas, patrimônio, cartões, livros razão, parcelamentos, energia solar, investimentos, reembolsos, indicadores) — não só consultar. V1 é legado, só usado onde não existe equivalente V2 ou há exceção formal documentada.

**Implementado**: nova seção **1.1** em `docs/MANUAL_OPERACIONAL_AGENTES.md` ("V2 como sistema principal — modo de operação nativo"), com tabela domínio → estrutura V2 já existente (só estruturas confirmadas contra `docs/database/DER.md` e `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` — nenhum nome de tabela inventado) e critério de sucesso explícito. A seção deixa claro que isso não relaxa nenhuma regra de segurança já existente (confirmação antes de lançar, nunca editar saldo direto, dry-run, aviso antes de commit) — é só sobre onde o dado mora primeiro, não sobre como ele é alterado.

**Pendente**: avisar o usuário do diff exato antes de commitar (regra permanente, seção 8 do manual) — ainda não commitado nesta sessão.

**3. `docs/changelog/ESTADO_ATUAL.md` reescrito do zero** refletindo HEAD `be5395f`, a pendência do manual, e a decisão do usuário de **não abrir Pluggy/Mercado Pago/Ciclo Snapshots agora** (confirmada explicitamente nesta sessão — todos Classe C, sem ROI melhor que o resto do Operacional).

**Próximo agente**: ler a seção 1.1 nova do manual antes de qualquer lançamento/consulta de dado. Candidatos abertos: `CARTAO_PLUGGY_MAPA` (bloqueado, esperando finais de cartão do usuário), `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES` (único remanescente do Operacional não totalmente investigado). Pluggy/Mercado Pago/Ciclo Snapshots ficam fechados até o usuário pedir explicitamente.

## Bloco 28 — Varredura completa do bloco Operacional (esgotamento de candidatos A/B, 1 migrado) (08/08/2026, continuação do Bloco 27)

**Diretriz do usuário**: esgotar completamente candidatos A/B do bloco "Operacional" antes de investir em Pluggy/Mercado Pago/Ciclo Snapshots (todos já confirmados Classe C na rodada anterior).

**Migrado**: `consorcioCasaProximaAssembleia` — achado que o dado já vinha na MESMA fetch que `getPatrimonioV2()` já fazia (`vw_patrimonio_v2.consorcio_casa_proxima_assembleia`), só nunca tinha sido ligado ao elemento `#consorcioAssembleia`. Zero fetch novo, zero requisição extra. Cuidado de ordem: `hydrateMetas()` (V1) roda ANTES de `aplicarOnda4Patrimonio()` no `hydrate()`, então sobrescrever só `VARS` seria tarde demais — a correção atualiza o elemento DOM diretamente dentro de `hydrate-onda4-patrimonio.js`, replicando a mesma lógica de alerta "já passou" que `hydrateMetas()` já tinha. Validado: `#consorcioAssembleia` mostra "21/08/2026" corretamente após reload real, zero erro de console.

**Demais ~25 chaves triadas, nenhuma outra migrável agora** — resumo (detalhe completo em `ESTADO_ATUAL.md`):
   - **Já resolvidas sem ação** (a V1 é lida mas sempre sobrescrita antes de aparecer na tela): `mesesRestantesFinanciamentoCasa`/`passivoFinanciamentoCasa`/`parcelaConsorcioAuto` (Onda 4 Patrimônio já escreve o DOM direto), `opcoesVendidasValorMercado` (recalculado sobre dado 100% V2), `reembolsoCicloTotal`/`provisionadoWartsila`/`faturaWartsila` (Onda 4 Wärtsilä).
   - **Mortas** (zero consumidor real): `FGTS` (chave de topo, distinta de `patFgts` já migrado) — grep não achou nenhuma leitura.
   - **D, exceção formal**: `mbLRCConfirmado`/`mbLRSConfirmado`/`mbLRVConfirmado`/`mbLRWConfirmado` — alimentam headline totals (`cartaoMBTotal`), mesma exceção já documentada (`EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md`). `mbLRWConfirmado`/`mbLRVConfirmado` (as versões usadas fora do headline) já migradas via Onda 3.
   - **D, decisão humana por definição**: `coberturaGarantidaConfirmada` — só preenchido por confirmação manual explícita do usuário, nunca fórmula.
   - **C, modelagem real necessária**: `PIB_WALLACE_HISTORICO`/`PADROES_RUIDO_TRANSACAO`/`DEFICIT_ZERO_PISO_OVERRIDE` (RPCs gravam dentro do próprio `wallace_dados`, nunca criaram tabela V2), `ENERGISA_TARIFA_COMPOSICAO` (precisa tabela nova, já documentado desde a seção 41 do plano), `dataNascimentoWallace` (ROI~0, schema não comporta data em `indicadores.valor` numérico), `reservaRetiradaProgramada`/`aporteBTGProgramado` (baixo impacto, já majoritariamente derivado).
   - **Não totalmente investigado, único remanescente com potencial**: `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES`/`EXTRAORDINARIO_BENS_DURAVEIS` — acoplados a uma lógica real de auto-crédito de boletos (`app.js:851-861`, cria transações novas comparando cronograma × já lançados) — mais complexo que um scalar, mereceria investigação própria numa rodada futura antes de classificar com segurança.

**Conclusão**: candidatos A/B do bloco Operacional esgotados por ora. Métrica: 36 → 37 consumidores removidos / ~46 restantes.

**Commitado e enviado**: `be5395f` → `origin/main` (confirmado via `git log` no Bloco 29, próximo abaixo).

## Bloco 27 — BUG ESTRUTURAL RAIZ encontrado e corrigido: cache do WallaceFinanceService explicava PETRS368W5/frescor "crítica"/NaN P2P-Wärtsilä, tudo o mesmo bug (08/08/2026, continuação do Bloco 26)

**Contexto**: usuário reportou 2 problemas novos via screenshot da tabela de opções (PETR4/ITUB4 PUT) — coluna "Vencimento" por linha tinha sumido (só um texto fixo "21/08/2026" no topo, errado pra posições com vencimento diferente) e a separação "ativas vs vencidas" não estava acontecendo (PETRS368W5, vencida 31/07, ainda aparecia como ativa).

**1. Descoberta crítica de ambiente**: até este bloco, eu vinha testando no preview local assumindo que o app nunca carregava sem login real (limitação documentada há sessões). **Isso estava errado nesta sessão específica** — o preview local (`.claude/launch.json`) na verdade faz login automático e injeta `Sistema_Wallace_Lira_Completo.html` num `#mainIframe` de verdade. Descobri isso ao investigar por que erros de console pareciam "só do ambiente local" — na real, eram bugs de produção genuínos, que eu vinha descartando incorretamente como artefato do preview. **Lição registrada**: sempre checar `document.getElementById('mainIframe')` antes de descartar um erro de console como "limitação de login" — `VARS`/funções do app não ficam em `window` direto (são `const`/`function` de escopo de módulo, não `var`), então pra inspecionar de fora é preciso `iframe.contentWindow.eval(...)`, nunca `iframe.contentWindow.VARS` direto.

**2. Causa raiz real, rastreada até o fim**: `WallaceFinanceService` (app.js) tem 15 métodos de fetch com cache em memória (`this._cache`, um `Map`, sem TTL — a mesma suspeita registrada no Bloco 26, agora confirmada e localizada). **5 desses métodos** (`getPatrimonioV2`, `getCicloSolarAbertoV2`, `getIndicador`, `getReembolsoWartsilaCicloV2`, `getP2PV2`) tinham um bug de shape: a resposta da API vem como array (`dado`), a função CACHEIA o array bruto (`this._cache.set(chave, dado)`) mas RETORNA o primeiro elemento desembrulhado (`return dado[0] || null`). Na 1ª chamada funciona (retorna certo antes de cachear errado) — a partir da 2ª chamada pro mesmo dado (cache hit), o método devolve o ARRAY inteiro em vez do objeto esperado. Qualquer código que leia `.campo` desse "objeto" (na real um array) recebe `undefined` — `Number(undefined)` vira `NaN`, `undefined.toLocaleString()`/`undefined.split()` lança exceção não tratada.

**Isso explica, com uma causa única, TODOS os sintomas misteriosos que vinham sendo reportados e que eu não conseguia reproduzir em teste isolado**:
   - `hydrate-onda4-investimentos.js:69` (`cdiInd.data_calculo.split` undefined) — 2ª chamada de `getIndicador('CDI_MENSAL_ATUAL')` retornando array.
   - PETRS368W5 aparecendo como ativa — a exceção acima abortava `aplicarOnda4Investimentos()` ANTES de chegar em `aplicarStatusVencidoEValorMercadoOpcoes()`, deixando `o.vencida` sempre `undefined` (`!undefined` = true = "não vencida" pra TODAS as posições).
   - `hydrate-onda4-patrimonio.js:50` (`fmt(reserva)` com `reserva` undefined) — 2ª chamada de `getPatrimonioV2()`.
   - **NaN em P2P e Wärtsilä (Bloco 26, nunca resolvido até agora)** — mesma causa em `getP2PV2()`/`getReembolsoWartsilaCicloV2()`.
   - Frescor "crítica" pra dado de minutos — muito provavelmente a mesma causa via `getIndicador('SOLAR_FRESCOR_LIMITES - ...')` retornando array em vez de `{valor}`, fazendo os limites virarem `NaN` e a comparação `minutos <= NaN` sempre falhar (cai no `else` = vermelho). Não reconfirmado individualmente porque a correção estrutural já cobre a causa.

**3. Correção aplicada**: nos 5 métodos, o cache agora guarda o MESMO valor retornado (`const resultado = dado[0] || null; this._cache.set(chave, resultado); return resultado;`) — cache e retorno nunca mais divergem em shape.

**4. Correções adicionais no caminho**:
   - `hydrate-onda4-investimentos.js`: `formatarDataBR(cdiInd.data_calculo)` envolvido em try/catch — mesmo que o campo venha ausente por algum outro motivo futuro, o resto do fluxo (inclusive classificação de vencidas) não trava mais.
   - `hydrate-roc.js`: 3 ocorrências de `o.roc.comparacaoCDI.toLocaleString(...)` sem checar `null` (tabela ativa, tabela de vencidas, tabela de exercidas) — `comparacaoCDI` pode ser `null` legitimamente (quando `cdiMensalFracao` não é `> 0`), e a chamada direta quebrava a renderização INTEIRA da tabela (`Array.map` lança, nenhuma linha aparece), não só a célula. Blindado com fallback `'—'`.
   - Coluna "Vencimento" por linha devolvida à tabela de posições ativas (tinha sumido, restava só um texto fixo desatualizado no topo) — `Sistema_Wallace_Lira_Completo.html` (novo `<th>`) + `hydrate-roc.js` (nova `<td>${o.vencimento}</td>`).

**5. Validação com prova real, dentro do app de verdade (não teste isolado)**: chamei `WallaceFinanceService.getPatrimonioV2()` duas vezes seguidas (força cache-hit) via `iframe.contentWindow.eval()` — 1ª e 2ª chamada agora retornam objeto idêntico (antes, a 2ª virava array). `hydrateROC()` chamado direto: tabela ativa com 2 linhas (PETRT379, ITUBT424, cada uma com sua data), tabela de vencidas visível com PETRS368W5 (31/07/2026). DOM real conferido: `p2pCapitalTotal`="R$ 110,00", `p2pCreditosRestantes`="6 / 10", `reembRecebidos`="R$ 5.254,98", `patTotal`="R$ 120.375,65" — **todos os valores que antes mostravam NaN agora corretos**. Console geral: zero erros.

**Pendente**: commit + push.

## Bloco 26 — NOVA DIRETRIZ permanente (execução autônoma) + bug real da soma dos LRs + HISTORICO_ERP_TODOS_CICLOS migrado (08/08/2026, continuação do Bloco 25)

**1. Nova diretriz de operação, válida pra todas as sessões futuras**: o usuário identificou que eu estava parando pra pedir autorização demais em pontos onde já havia evidência suficiente. Critério novo, permanente: **"Isso reduz dependência da V1 sem criar risco?"** — se sim (sem decisão de negócio pendente, sem risco financeiro, sem risco de perda de dado, sem bloqueio explícito, caminho técnico claro), executar direto até commit, sem parar pra perguntar em cada passo. Só interromper se: perda potencial de informação, decisão de negócio real, conflito com regra já definida, ou risco financeiro real.

**2. Bug real reportado pelo usuário via screenshot — "as somas dos LRs estão erradas"**: investigado e corrigido, commit `7267d00`. Causa raiz: `hydrate-livros-razao.js` escrevia `REG.livrosRazaoTotais.LRW/LRV.total` — valores **hardcoded desde 25/07/2026** (V152, "filtro por ciclo", 1 e 3 lançamentos) — no MESMO id de DOM (`#tfLRW`/`#tfLRV`) que `render-livros-variaveis.js` já preenchia corretamente com a soma real do array completo (hoje 19 e 16 lançamentos). R$35,95 (o valor errado que apareceu na tela) bate exatamente com a soma dos 3 primeiros lançamentos de semanas atrás — prova de que era resíduo esquecido, não intencional. Removida a escrita duplicada.

**3. Outros achados no mesmo lote de screenshots, investigados**: (a) badge de frescor mostrando "crítica" pra dado de poucos minutos e (b) PETRS368W5 (opção vencida 31/07) aparecendo como ativa — testei ambos isoladamente (função pura + fetch real + timestamp/dado reais do banco) e o resultado correto saiu nos dois casos; não achei bug reprodutível no código/banco. Suspeita forte: cache do `WallaceFinanceService` sem TTL numa aba aberta há muito tempo, capturando estado de antes das correções de hoje. Blindagem defensiva aplicada mesmo assim (`Number.isFinite` no `formatarFrescor`) + bump do `__V` (cache-buster). Usuário vai confirmar com hard-refresh. (c) Campo "opções vencidas" explicado — não é bug, fica oculto de propósito quando não há posição vencida.

**4. `HISTORICO_ERP_TODOS_CICLOS` migrado pra V2** — primeira execução sob a nova diretriz (investigação → conclusão → implementação → validação → commit, sem pausa intermediária). Triagem: 3 consumidores reais (`pluggy-reconciliacao.js`, `classificacao-inbox.js` — Set de valores conhecidos pra evitar falso "sem registro"/"duplicidade"; `dashboard-navegacao.js` — índice da Busca Global), campo `livro` por registro confirmado morto. Cobertura verificada **completa** (230 registros, não amostragem): 224 batem 100% contra `transacoes.tx_legado`, 6 com ressalva:
   - `TXCON000001`/`TXCON000002` (Consórcio Casa/Carro, R$1.950,77 juntos) — ausentes da V2 (LRCON nunca migrado). Usuário aceitou como exceção documentada.
   - `TXRR000005` — coberto sob outro código (`TXR_FACULDADE_MB_JUL26`, mesmo dado).
   - `TXB000001`/`TXB000008`/`TXB000009` — código de boleto recorrente reaproveitado entre ciclos consecutivos (achado ao investigar a hipótese do usuário de "estimativa→oficial" — na verdade são 2 meses/valores reais diferentes sob o mesmo código, não uma correção da mesma conta). V2 guarda só a versão mais recente; risco baixo, aceito.

   Implementado: view `vw_historico_erp_completo` (Supabase, `transacoes.tx_legado` como fonte, 292 linhas, superset do array V1) + fetch paralelo no HTML + override de `VARS.HISTORICO_ERP_TODOS_CICLOS` em `app.js` (fallback silencioso permitido, mesmo padrão `cartoes`/`cotacoes_acoes`). **Zero mudança nos 3 arquivos consumidores** — só trocou a origem do dado, mesmo padrão de toda a sessão.

**5. Verificação**: view testada via REST real com a chave pública (retornou dado real), preview local sem erro novo de console.

**6. Continuação sob a mesma diretriz, sem pausa**: triado e migrado também `creditoUberBalance`/`creditoShellBox`/`creditoKmvIpiranga` (créditos externos de apps — Uber/Shell/Ipiranga, "verdade externa" atualizada manualmente, mesmo padrão do `CDI_MENSAL_ATUAL`). Único consumidor: `hydrate-roc.js` (3 linhas de exibição direta, sem cálculo). 3 registros novos em `indicadores`, fetch único (`nome=in.(...)`) + override em `app.js`, mesmo padrão fallback-silencioso. Testado via REST real, preview sem erro novo.

**Métrica**: 35 consumidores commitados (`d5843e1`) = ~48 restantes.

**7. Continuação, triagem rápida do resto de "Operacional"**: `proLaboreFixo` (R$11.600,00, salário-base fixo do usuário) migrado no mesmo lote — múltiplos consumidores (`hydrate-qualidade.js`, `hydrate-caixas.js`, `hydrate-onda3-suavizacao.js`, `recalcular-necessidade.js`, `reg-operacional.js`), mas todos leem `VARS.proLaboreFixo` direto, nenhuma reconciliação. **Cuidado de sequência necessário e resolvido**: `reg-operacional.js` (`Object.assign(REG, criarRegOperacional())`, linha ~1034) copia `VARS.proLaboreFixo` pra dentro de `REG.operacional.proLaboreFixo` uma única vez — a sobrescrita V2 precisa rodar ANTES disso (colocada na linha ~683, junto dos outros overrides), senão `REG` e `VARS` divergiriam silenciosamente. Confirmado seguro porque todo fetch V2 já resolveu antes do `app.js` carregar (mesmo padrão de sempre).

**Outros candidatos triados e descartados por ora** (não são quick-wins, não executados):
   - `dataNascimentoWallace` — constante permanente (nunca muda), baixíssimo ROI, `indicadores.valor` é numérico (não comporta data) — precisaria de acomodação de schema pra um ganho quase nulo. Adiado.
   - `PIB_WALLACE_HISTORICO`/`PADROES_RUIDO_TRANSACAO`/`DEFICIT_ZERO_PISO_OVERRIDE` — já são gravados via RPC (`registrar_pib_mensal` etc.), mas a RPC escreve DENTRO do próprio `wallace_dados` (chave jsonb), não numa tabela V2 real — migrar de verdade exige modelagem (tabela de série histórica por ciclo), não é view/RPC simples. Classificação C.
   - `coberturaGarantidaConfirmada` — por definição só é preenchido por confirmação manual explícita do usuário ("nunca calculado por fórmula automática") — depende de decisão humana por natureza, não é candidato a automação.
   - `aporteBTGProgramado` — já é majoritariamente DERIVADO em runtime (`VARS.aporteBTGProgramado.total` recalculado em `app.js`), o valor de `wallace_dados` é quase todo sobrescrito na hora — baixo impacto migrar, não investigado a fundo ainda.

**Métrica final do bloco**: 35 → **36 consumidores removidos** após o próximo push.

## Bloco 25 — ACOES_COTACOES commitado + bugs reais reportados pelo usuário (data invertida, geração de ontem errada) + infraestrutura de frescor/legendas dinâmicas (08/08/2026, continuação do Bloco 24)

**1. `ACOES_COTACOES` fechado**: commit `22d6b2c` enviado (aprovação do usuário, "sim"). `wallace_dados`: 31 consumidores removidos.

**2. Usuário reportou 2 problemas reais num screenshot do card "Qualidade da Geração"**: (a) data mostrada em formato americano ("08/05" pra 5 de agosto, deveria ser "05/08"); (b) "última geração completa" mostrando 26,67 kWh quando o valor real de ontem (07/08) era 31,5 kWh.

**Causa raiz de (a)**: `hydrate-onda5-qualidade-geracao.js`, `const [dd,mm] = data.split('-').slice(1)` — nomes de variável invertidos (split de `YYYY-MM-DD` dá `[mes,dia]`, não `[dia,mes]`), o template `${dd}/${mm}` montava mês/dia sem perceber. Corrigido: `[mm,dd]`.

**Causa raiz de (b)**: exatamente o gap de sincronização já documentado (06/08 e 07/08 faltando em `energia_solar_geracao_diaria`, porque o código que escreve lá só nasceu no dia da sessão). O dado real já existia em `wallace_dados.SOLAR_GERACAO_DIARIA` (V1): `07/08=31,54 kWh` (bate com o relato do usuário), `06/08=24,38 kWh`. Preenchidos na V2 com esses valores reais (não fabricados — cópia de dado já capturado), preservando `capturadoEm` original como `created_at`.

**3. Nova diretriz do usuário, duas frentes**: (1) UX de frescor pro card Solar — "captado às 12:40" não é útil operacionalmente, quer relativo ("há 3 minutos" / cores por faixa); (2) atacar a pendência antiga de legendas dinâmicas — texto de negócio parametrizado/computado deve vir de `legendas` (Supabase), não hardcoded em JS.

**4. Achado ao investigar a fonte do timestamp pro frescor**: `energia_solar_geracao_diaria.created_at` **não reflete atualização**, só a 1ª inserção do dia — upsert via PostgREST `Prefer: resolution=merge-duplicates` só sobrescreve as colunas do payload (`data`,`geracao_kwh`), nunca `created_at`. Provado ao vivo: `geracao_kwh` mudou 3x (`27.38`→`27.77`→`29.25`, robô rodando normal) enquanto `created_at` ficou congelado 155min. Corrigido antes de construir qualquer UX em cima: coluna `atualizado_em` + trigger `BEFORE INSERT OR UPDATE` (`marcar_atualizado_em()`, genérico, funciona com qualquer payload parcial) em `energia_solar_geracao_diaria` E `cotacoes_acoes`. Validado: o trigger já disparou num run real do robô durante a sessão (`atualizado_em` mudou, `created_at` não).

**5. Proposta apresentada e aprovada integralmente** ("aprovo a implementação completa da Fase 1... quero executar tudo de uma vez"): usuário pediu 5 entregas específicas, todas executadas:
   - **Frescor**: 4 faixas (✅<15min / 🟡<2h / ⚠️<24h / 🔴≥24h), limites em `indicadores` (`SOLAR_FRESCOR_LIMITES - minutosVerde/Amarelo/Laranja`, mesmo padrão ROC/Solar), badge recalcula sozinho a cada 60s (`setInterval`), baseado em `atualizado_em` (não `created_at`).
   - **Infraestrutura de legendas dinâmicas**: `formatarLegenda(id, valores)` — placeholders `{chave}`, substituição simples, 100% retrocompatível (nenhum dos 28 registros antigos usa `{}`). `formatarFrescor(timestamp, limites)` retorna só dados (faixa/emoji/tempo/cor) — a frase fica em `legendas`, nunca hardcoded. `montarBadgeFrescor(idBase, timestamp, limites)` junta os dois, escolhendo `idBase+Faixa` (ex: `legFrescorSolarVerde`) com fallback genérico se a legenda não existir ainda.
   - **Migração Fase 1**: Solar (`legQgHojeParcial` parametrizado com `{hora}`, `legQgSemLeituraHoje`, badge de frescor novo `#qgFrescor`) + Cotações (`legOpcoesCotacoes` trocou horário absoluto por `montarBadgeFrescor`, `legOpcoesOtmItm` migrada de brinde por estar no mesmo ponto de código). 13 legendas novas inseridas (28→41 registros em `legendas`).
   - **Escopo contido**: só os pontos pedidos (Solar + Cotações), nenhuma varredura geral do resto do frontend.
   - **Documentação**: este bloco + `ESTADO_ATUAL.md` reescrito.

**6. Verificação**: preview local recarregado, console sem erro nos 4 arquivos tocados (`app.js`, `hydrate-onda5-qualidade-geracao.js`, `hydrate-roc.js`, `Sistema_Wallace_Lira_Completo.html`). **Achado avulso, fora do escopo, não corrigido**: erros de console pré-existentes em `hydrate-onda4-patrimonio.js`/`hydrate-onda4-investimentos.js` (`Cannot read properties of null/undefined`) — não relacionados a nenhuma mudança desta sessão, registrados pra investigação futura.

**7. Pendente pro próximo passo desta mesma sessão**: commit + push (banco já ativo em produção — trigger, coluna, legendas — só falta o site consumir).

## Bloco 24 — Correção do gap SAJ validada com prova real + próximo consumidor (`ACOES_COTACOES`) executado (08/08/2026, continuação do Bloco 23)

**1. Validação do commit `26315fc`**: usuário pediu prova objetiva, não inferência. Como o cron externo (~10min) ainda não tinha rodado com o código novo, usuário disparou o workflow manualmente pela UI do GitHub (`workflow_dispatch`). Confirmado via API: run `31270756547`, `head_sha=26315fc`, `conclusion:success`. `energia_solar_leituras` (leitura de 07/08, id `6fe3ba5d-ad12-423b-8fd4-cc943fb44e34`): `geracao_acumulada` saiu de `NULL` pra `446.07`. Investigação SAJ encerrada em definitivo.

**2. Mudança de diretriz do usuário**: parar de focar em documentação/investigação, executar reduções reais de consumidores de `wallace_dados`, escolhendo o próximo item sozinho, com critério explícito (maior impacto, menor esforço, menor dependência de decisão humana), sem tocar nas exceções já fechadas.

**3. Escolhido e executado: `ACOES_COTACOES`/`ACOES_COTACOES_ATUALIZADO_EM`** (cotações de ações brapi.dev, único consumidor `hydrate-roc.js`, tabela de opções ROC). Critério de escolha: escrita já centralizada numa RPC única `SECURITY DEFINER` (`atualizar_cotacoes_acoes`), schema do dado trivial (ticker→{preço,variação}), zero ambiguidade, zero reconciliação, zero decisão de negócio — o oposto do bloco Mastercard/Visa ou Ciclo Snapshots.

**Executado** (2 migrations Supabase + frontend, nada commitado ainda):
- Tabela nova `cotacoes_acoes` (ticker PK, preco, variacao, atualizado_em), RLS com policy de leitura pública — mesmo padrão de `indicadores`/`energia_solar_geracao_diaria`.
- RPC `atualizar_cotacoes_acoes` (já existente, já `SECURITY DEFINER`) estendida: continua gravando em `wallace_dados` (V1, inalterado) e agora também faz upsert por ticker em `cotacoes_acoes` (V2), num loop `FOR ticker_atual IN SELECT jsonb_object_keys(cotacoes)`. Como é lógica dentro da função SQL (não no script Python), o efeito é imediato — não depende de nenhum deploy/push de código pro robô, só da RPC já estar ativa (já está).
- Frontend (`Sistema_Wallace_Lira_Completo.html` + `src/app/app.js`): fetch paralelo de `cotacoes_acoes` (`window.WALLACE_COTACOES_ACOES_V2`) + override de `VARS.ACOES_COTACOES`/`ACOES_COTACOES_ATUALIZADO_EM` se a V2 respondeu com dado. Fallback silencioso permitido aqui (diferente do padrão "V2-exclusivo" usado pra Solar/Caixas) — é domínio informativo (cotação de mercado pra contexto visual da tabela de opções), não afeta cálculo financeiro nem saldo, mesmo tratamento já usado pra `cartoes` na Wave B1.

**Verificação parcial feita**: preview local (`.claude/launch.json`) recarregado, sem erro novo de console até o gate de login (mesma limitação de sempre — validação de dado renderizado exige login real).

**Pendente pra fechar**: aprovação de commit+push do frontend (a RPC/tabela V2 já estão ativas em produção, só falta o site consumir de lá) + disparo manual do workflow `atualizar_cotacoes_acoes.yml` pra provar que `cotacoes_acoes` populada com dado real, mesmo processo de validação já usado pro SAJ (antes/depois, commit usado, status da execução).

**Métrica**: 30 consumidores commitados/removidos + 1 pronto aguardando push (`ACOES_COTACOES`) = ~53 restantes após o push. Próximos candidatos triados (não executados): `CARTAO_PLUGGY_MAPA` (checar se sobrou consumidor real), `HISTORICO_ERP_TODOS_CICLOS` (escritor manual, candidato a tabela V2), resto de "Operacional" (~30 chaves, sem triagem item a item ainda).

## Bloco 23 — Commit aprovado (SOLAR_GERACAO_DIARIA + ocultação Simulador) + investigação SAJ concluída com evidência completa (08/08/2026, continuação do Bloco 22)

**1. Commit `e5f1348`**: usuário aprovou explicitamente os dois itens pendentes do corte anterior — religação de `SOLAR_GERACAO_DIARIA` na V2 e ocultação da seção 07 "Simulador Regulatório". Sem mudança de comportamento além do que já estava documentado no Bloco 22. `wallace_dados`: 30 consumidores removidos, ~54 restantes.

**2. Investigação do gap SAJ, resposta às 6 perguntas do usuário, com evidência de código+banco+GitHub Actions API**: são dois problemas sem relação causal entre si.

- **`energia_solar_leituras.geracao_acumulada` (V2) nunca teve escrita automática.** Lendo `atualizar_geracao_saj.py` inteiro: o robô só grava em `wallace_dados.SOLAR_LEITURAS[-1]` (V1) e, desde hoje, em `energia_solar_geracao_diaria` (tabela DIFERENTE, campo `geracao_kwh`). Nunca existiu, em nenhuma versão do script, uma escrita em `energia_solar_leituras`. Prova no banco (`execute_sql`): as 4 leituras com valor preenchido (31/07-04/08) têm `created_at` idêntico, `2026-08-05 20:54:33` — o instante exato do bootstrap da migração de ciclos solares (Bloco 20), valor copiado manualmente da V1 naquele momento, não por sincronização contínua. A leitura de 07/08 foi criada depois (`2026-08-08 04:20:37`, inserção manual dos códigos 03/103 novos) sem `geracao_acumulada`, porque não existe pipeline que preencheria esse campo automaticamente — nem existia antes, nem passou a existir agora.

- **`energia_solar_geracao_diaria` (V2) tem gap real em 06/08 e 07/08, mas não por falha de execução.** GitHub Actions API (`api.github.com/.../actions/workflows/325176785/runs`, 239 execuções totais) mostra o workflow `atualizar_geracao_saj.yml` rodando A CADA ~10 MINUTOS, sem interrupção, durante 06/08 e 07/08 inteiros, 100% `conclusion: success`. O código que escreve em `energia_solar_geracao_diaria` (função `atualizar_v2_geracao_diaria()`) só nasceu no commit `1c515d7`, feito HOJE às 12:05 (horário de Brasília). Toda execução em 06-07/08 rodou o `actions/checkout` no HEAD daquele momento — uma versão do script anterior ao commit, sem esse código. Confirmado cruzando o `head_commit` de uma execução específica (`91bf9de`, "Create CNAME", 07/08) contra a data do commit `1c515d7` — a run é ~29h mais antiga que o código que faltou. Não é bug de sincronização, é ausência de funcionalidade nos dias anteriores à criação dela. Já sanado sozinho: a run de 08/08 15:40 UTC (minutos após o commit) gravou o dia corretamente.

- **Achado colateral, não pedido, reportado sem correção**: o workflow standalone está disparando a cada ~10min (~144x/dia), não 2x/dia como o próprio comentário do script ainda afirma. Não investigada a origem (provavelmente configuração do cron-job.org) — fora do escopo desta pergunta, fica registrado pra decisão futura.

**Nada corrigido** — só investigação, por instrução explícita do usuário (proibiu workaround/fallback/cópia manual antes de entender a causa).

## Bloco 22 — Corte por troca de agente (créditos no fim) — investigação concluída, não reportada; commit pendente (08/08/2026, mesma sessão, continuação do Bloco 21)

**Contexto do corte**: usuário pediu passagem de turno no meio de duas tarefas simultâneas — (1) remover seção 07 "Simulador Regulatório" da interface da aba Solar (feito, código intacto, só `display:none`) e (2) investigar por que a aba Solar mostra "Dados insuficientes para calcular consumo direto/autoconsumo/dependência".

**Investigação concluída com evidência real, NÃO reportada ao usuário ainda** (próxima sessão deve entregar isso primeiro): consultei `energia_solar_leituras` direto no Supabase — a leitura mais recente (`data='2026-08-07'`) tem `geracao_acumulada = NULL` na V2, enquanto a mesma leitura em `wallace_dados.SOLAR_LEITURAS` (V1) tem `geracaoAcumulada: 437.83`. Leituras anteriores (08-04, 08-02) estão corretas na V2. Causa raiz: gap de sincronização do robô Python pra leitura mais recente — mesma classe do gap já achado em `energia_solar_geracao_diaria` (dias 06-07/08 faltando). Frontend/query/mapeamento estão TODOS corretos — não é bug de código, é dado ausente na origem V2. Não corrigido (usuário pediu causa raiz antes de qualquer correção, e proibiu fallback/workaround/mascaramento).

**Trabalho de código feito, NÃO commitado**: `SOLAR_GERACAO_DIARIA` religado na V2 (mesmo padrão de `SOLAR_LEITURAS`/`cartoes` — fetch paralelo no HTML + override em `app.js`) e seção 07 "Simulador Regulatório" ocultada da aba Solar (`display:none`, código/markup intactos, pedido explícito — "não agrega valor operacional, é teórico"). `git status` no corte: `Sistema_Wallace_Lira_Completo.html` (modificado 2x, staged+unstaged), `app.js`, + os 2 arquivos de changelog. **Usuário não deu "pode commitar" pra este pacote** — a religação de `SOLAR_GERACAO_DIARIA` tinha uma pergunta em aberto (o gap de sync 06-07/08) que o usuário quis investigar antes de aprovar o commit; a investigação terminou mas a resposta nunca chegou a ele por causa do corte.

**Próxima sessão, em ordem**: (1) reportar a investigação acima ao usuário nestes termos exatos; (2) mostrar o diff de `SOLAR_GERACAO_DIARIA` + ocultação do Simulador; (3) só commitar com aprovação explícita nova, não assumir a aprovação anterior da religação como válida pra esse pacote específico (o usuário pediu a investigação ANTES de aprovar).

---

## Bloco 21 — SOLAR_GERACAO_DIARIA religado na V2 + achado de gap de sincronização (08/08/2026, mesma sessão, continuação do Bloco 20)

Mesmo padrão exato de `SOLAR_LEITURAS`/`cartoes`: fetch paralelo de `energia_solar_geracao_diaria` no bootstrap do HTML (`window.WALLACE_SOLAR_GERACAO_DIARIA_V2`), override de `VARS.SOLAR_GERACAO_DIARIA` em `app.js` depois do `Object.assign(VARS, dr)` (vence tanto o literal quanto wallace_dados), sem fallback silencioso (falha/vazio vira array vazio). 3 consumidores afetados: `hydrate-onda5-qualidade-geracao.js` (Qualidade da Geração), 2 pontos em `graficos-cenarios-lazy.js` (projeção da Previsão + gráfico "Geração por dia").

**Achado real, não esperado**: comparando V1×V2 antes de religar, a V2 está com 2 dias faltando (06/08 e 07/08 existem no wallace_dados, não existem em `energia_solar_geracao_diaria`) — gap de sincronização do robô Python, não um erro meu. Não preenchi (proibido fabricar dado, P1). Efeito real e visível: o card "Como a usina está indo" (que compara o ÚLTIMO DIA COMPLETO) passa a comparar contra 05/08 em vez de 07/08, porque 07/08 não existe na V2 ainda. Registrado em `ESTADO_ATUAL.md` como pendência de sincronização, fora do escopo (não mexi no script `atualizar_geracao_saj.py`).

---

## Bloco 20 — Mastercard/Visa fechado + Solar entra na V2 (modelo de ciclos de crédito) (08/08/2026, mesma sessão, continuação do Bloco 19)

**1. Mastercard Black/Visa — inventário final e fechamento formal**: levantei consumidores exatos de `cartaoMBTotal`/`cartaoInfiniteTotal`/`visaDetalhe`/`mbDetalhe`/`CARTAO_MAPA`. Achado principal: o lado Visa (LRW/LRR/LRS/LRV) está inteiramente ZERADO — usuário já confirmou em sessões anteriores (25-30/07) migração completa pro Mastercard Black, nada a fazer aí. O que resta (Assinaturas MB, Recorrências/Corp, Consórcios) está 100% bloqueado por falta de `cartao_id`/`categoria_id` em `transacoes` (32 transações), não por engenharia. Usuário decretou o domínio "fechado até onde é tecnicamente possível sem inventar dados" — registrado em `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`, junto com as outras 4 exceções permanentes já conhecidas (headline totals, Solar 301×361, Caixa Lance, 4 caixas indeterminadas, TX000203-208). **Achado colateral, não corrigido** (fora do escopo, Parcelamentos está fechado): `VARS.livroLRP` nunca é recalculado depois que `aplicarOnda5Parcelamentos()` sobrescreve `PARCELAMENTOS_VISA` com dado V2 — fica com o valor de boot.

**2. Inventário completo de `wallace_dados` por consumidor real** (não mais por domínio): das 95 chaves, ~29 já removidas, ~10 exceções formais, ~56 restantes — dessas, só 1 (`SOLAR_LEITURAS`) era de baixo esforço/alto impacto disponível. Todo o resto exige decisão de dado nunca tomada ou investigação nova do zero (Ciclo Snapshots, Operacional ~25 chaves heterogêneas, Pluggy/MP brutos).

**3. Solar entra na V2 — modelo de ciclos de crédito, decisão de negócio + implementação completa**: usuário validou com evidência de código (não opinião) que o comportamento atual (acumulado desde ativação, nunca reseta) é ausência de implementação, não regra de negócio deliberada — só existia 1 leitura quando o domínio foi construído (31/07), nunca foi revisitado. Aprovou modelagem de ciclos reais (fechamento explícito, nunca por inferência de data — ajustou o conceito pra "leitura oficial Energisa", com evidência obrigatória, não "escolher entre leituras existentes"). Migration aplicada em 5 partes (`apply_migration`): tabela `ciclos_solares`, colunas novas em `energia_solar_leituras` (`ciclo_id`/`eh_leitura_oficial_energisa`/`evidencia`), views `vw_ciclo_solar_aberto`/`vw_ciclo_solar_historico`, RPC `fechar_ciclo_solar()`, bootstrap (ciclo 1, baseline zero, 5 leituras linkadas). **Achado próprio corrigido no processo**: a primeira versão da migration deixou `ciclos_solares` sem RLS e a RPC sem `SECURITY DEFINER` — corrigido pra igualar o padrão já usado no projeto (mesma policy de `caixas`/`investimentos`, mesmo `SECURITY DEFINER` de `lancar_transacao_manual`), confirmado via `get_advisors` antes e depois.

**4. Frontend religado (mesma sessão, autorizado explicitamente)**: `Sistema_Wallace_Lira_Completo.html` ganhou fetch paralelo de `energia_solar_leituras` (mesmo padrão de `cartoes`/`legendas`); `app.js` sobrescreve `VARS.SOLAR_LEITURAS` com o dado V2 (vence tanto o literal local quanto `wallace_dados`, mesma prioridade do bloco LEGENDAS) — **sem fallback silencioso**: se a V2 falhar, vira array vazio, não reexibe wallace_dados. `graficos-cenarios-lazy.js`: `_lazyRenderCenariosDeficitEGraficosSolar()` virou `async`, busca ciclo aberto + histórico; seção 10 agora mostra "Crédito do ciclo atual" (principal, novo) + "Acumulado desde ativação" (secundário, era o único número antes); seção 11 ganhou bloco de histórico de ciclos fechados (vazio hoje, nenhum ciclo fechou ainda); seção 12 (Previsão) passa a usar crédito do ciclo aberto e dias desde o início do ciclo, não mais desde a ativação. `FinanceEngine.js`/`promocoes-financeengine.js` verificados (não precisaram de mudança funcional — a fórmula não mudou, só a origem do array na raiz, ambos os consumidores leem o mesmo array já trocado) e documentados com comentário explicando por que continuam corretos. Nenhuma fórmula financeira, percentual de rateio, ou o caso 301×361 foi tocado.

**5. Verificação**: preview local confirma boot sem erro de console (HTML/JS parseiam certo) — validação funcional completa (valores na tela, `WALLACE_VALIDACAO_RUNTIME`) continua pendente de login real, mesma limitação de sempre.

**6. Aba própria "☀️ Energia Solar" — proposta entregue e implementada no mesmo turno**: usuário pediu mapa de risco antes de codar (arquivos afetados, abas impactadas, componentes movidos, riscos de regressão); risco avaliado baixo, aprovado, implementado na sequência. `Sistema_Wallace_Lira_Completo.html`: nova pane `#solar` com as 7 seções (Qualidade da Geração, Unidade Geradora, Rateio+Histórico de ciclos, Previsão, Geração diária, Economia antes×depois, Simulador) extraídas de dentro da pane `graficos`, renumeradas 01-07, mesmos ids de DOM. `graficos-cenarios-lazy.js`: `_lazyRenderCenariosDeficitEGraficosSolar()` dividida em duas — Déficit Zero continua ali, todo o corpo solar (zero linha reescrita) virou `_lazyRenderSolarSecao()`, disparada só por `initSolarLazy()` (flag própria, não carrega mais com Gráficos/Cenários — ganho real de performance nas duas abas antigas). 3 textos com referência de seção hardcoded corrigidos (renumeração). **Achado durante a implementação**: a Busca Global (`dashboard-navegacao.js`, `CAPA_DESTINOS`) tinha uma entrada apontando pro título antigo da seção 09 ("Energia Solar") — título que deixou de existir na renumeração; corrigido pra apontar pra pane `solar` direto, senão a busca levaria pro lugar errado silenciosamente.

---

## Bloco 19 — Wave A/B: desligamento sistemático da V1, nova métrica "consumidores de wallace_dados" (08/08/2026, sessão nova, continuação do Bloco 18)

**Contexto do corte**: usuário abriu a sessão reafirmando o objetivo do projeto ("desligar a V1, colocar a V2 em operação plena") e pediu execução imediata de um plano por ondas (Plan Mode usado, aprovado com ajustes). Métrica de sucesso mudou explicitamente: não é mais "quantos domínios estão na V2", é "quantos consumidores de `wallace_dados` ainda existem". Nenhum commit feito ainda nesta sessão — tudo abaixo está só no working tree.

**1. Wave A — endurecimento dos 3 domínios V2-preferenciais que ainda tinham fallback silencioso** (Caixas 10/18, Livro Razão 7 tabelas, LRW/LRV totais): apliquei o mesmo padrão `⚠ Indisponível (V2)` que os 6 domínios Onda 4/5 já usavam, em `hydrate-onda1-v2.js`, `hydrate-onda2-v2.js`, `hydrate-onda3-livro-razao.js`, `hydrate-onda3-lrwlrv.js`. **Decisão importante durante a execução**: NÃO endureci os 4 caixas com `aceitarDivergenciaConhecida:false` (PGV, Saúde Família, Manutenção, Aniversário Júlio) nem o Provisionado Wärtsilä-log — esses têm divergência V1×V2 não confirmada e o usuário proibiu reabrir essa investigação em sessão anterior. Endurecer teria forçado ou exibir V2 com divergência não decidida, ou marcar "Indisponível" um valor que hoje é legitimamente V1 — os dois errados. Só toquei nos itens que já eram V2-preferenciais de fato.

**2. Wave B1 — titularidade de cartão (Mastercard Black/Visa) migrada pra V2**: achado real ao investigar — o mapa hardcoded `CARTAO_PLUGGY_MAPA_DEFAULT` (`pluggy-reconciliacao.js`) nunca tinha o cartão 1371 (substituiu o 2244 em sessão anterior, só a tabela `cartoes` sabia disso). Corrigido com uma solução que preserva a garantia de ordem síncrona que o código já documentava como frágil (`const CARTAO_PLUGGY_MAPA` precisa de dado pronto no momento em que o script de `app.js` é parseado): adicionei um fetch de `cartoes` em paralelo no bootstrap do HTML (`Sistema_Wallace_Lira_Completo.html`, mesmo padrão já usado pra `legendas`), exposto como `window.WALLACE_CARTOES_V2` antes de `app.js` rodar. Nova função `construirCartaoPluggyMapa()` monta o mapa titular/apelido/bloqueado a partir dele; `totalVar` (qual total do ERP cada cartão soma) e `conexaoDesatualizada` continuam como regra local — são fato da integração Pluggy, não dado de identidade do cartão, sem coluna correspondente em `cartoes` hoje. Fallback pro literal antigo se a V2 não responder (offline/erro), nunca quebra.

**3. Wave B2 — Assinaturas: investigado, propositalmente NÃO migrado**. O plano original previa criar `vw_assinaturas_v2` e ligar `visaLRSConfirmado`/`mbLRSConfirmado`. Ao consultar o dado real (`SELECT` direto em `transacoes` join `categorias`), achei que 23 das 27 transações já classificadas como "Assinaturas" têm `cartao_id = null` — não dá pra saber se a cobrança foi no cartão Visa ou Mastercard Black pra maioria delas. Criar a view e ligar o frontend teria produzido um split visivelmente errado (ou não-derivável) — parei antes de escrever qualquer SQL/JS pra essa parte e documentei o achado em vez de forçar. Mesma causa raiz do gap de Recorrências/Corporativo já conhecido (34 transações sem categoria) — os dois ficam registrados juntos como pendência de dado, não de engenharia.

**4. Wave B3 — exceção arquitetural formalizada**: `docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md` (novo arquivo) documenta por escrito que `cartaoMBTotal`/`cartaoInfiniteTotal`/`mercadoPagoFatura` nunca serão derivados só da V2 — regra de negócio permanente ("a fatura sempre vence"), não dívida técnica. `MANUAL_OPERACIONAL_AGENTES.md` seção 2 atualizado pra refletir os domínios endurecidos + a titularidade migrada + a referência à exceção.

**5. Waves C/D/E/F — deliberadamente NÃO executadas nesta sessão**, por instrução explícita do usuário: TX000203-208 (já classificadas, não aproximam desligamento da V1), Ciclo Snapshots, Operacional (~30 chaves), Pluggy/MP brutos. "Essas frentes só entram quando acabarem os itens migráveis de baixo risco" — palavras do usuário.

**6. Verificação**: subi o preview local (`.claude/launch.json`) e confirmei via `read_console_messages`/`get_page_text` que a página carrega sem erro até o gate de login ("Sessão não encontrada") — prova que o HTML/JS novo não quebra o parse/boot, mas não confirma cálculo/render (precisa de login real, mesma limitação de sessões anteriores). `WALLACE_VALIDACAO_RUNTIME`/`#healthBadge` não rodados.

**7. Nenhuma migração SQL executada** — só `SELECT`s de investigação (`cartoes`, `categorias`, `usuarios`, `transacoes`). Nenhum schema mudou nesta sessão.

**Pendências novas geradas por esta sessão**: decisão do usuário sobre como (ou se) preencher `cartao_id` retroativamente nas transações de Assinaturas/Recorrências sem `cartao_id`; revisão e autorização de commit (nada commitado ainda).

---

## Bloco 18 — Onda 4 (4/4) + Onda 5 (3 domínios) + Solar + mudança de direção arquitetural "V2 é a fonte real" (08/08/2026, continuação do Bloco 17, sessão nova)

**Contexto do corte**: sessão retomada de um resumo automático (limite de contexto) no meio da Onda 4. Este bloco cobre tudo que aconteceu desde então — é a sessão mais longa e com mais mudança de direção do projeto até aqui. 14 commits, nenhum push.

**1. Onda 4 fechada (4/4 domínios autorizados)**: Patrimônio (`patrimonio`+`financiamentos`, tabela nova + rótulos + view), Investimentos/ROC (`investimentos` +10 colunas + `indicadores` CDI/ROC, reaproveitando 100% do cálculo/render V1 — `aplicarStatusVencidoEValorMercadoOpcoes`/`calcularROCOpcoes`/`hydrateROC` inalteradas), LREI (tabela nova `emprestimos_internos`, ausência real de estrutura confirmada), Cascata Wärtsilä (`reembolso_wartsila_ciclo`, achado colateral: caixa "Provisionado Wärtsilä" tinha 3 transações nunca sincronizadas na V2, corrigido). Padrão consolidado: sempre que possível, reaproveitar as funções de cálculo/render V1 já existentes em vez de duplicar lógica — só trocar a origem do dado.

**2. Onda 5 (continuação, "aposentadoria do wallace_dados")**: Parcelamentos (achado: `parcelas` já tinha as 22 linhas sincronizadas, só faltava a view), P2P (7 escalares → `indicadores`, mesmo padrão do CDI), "Qualidade da Geração" solar (indicador operacional novo, não financeiro). Mastercard Black/Visa avaliado e **bloqueado** por acoplamento a reconciliação bancária manual — não perseguido na hora, reavaliado no fim da sessão (ver item 6).

**3. Investigação Solar 301×361 kWh — não resolvida, por decisão correta do usuário**: usuário pediu prova (não opinião) de qual conceito é o crédito real pro rateio (Exportado=361 vs Saldo Líquido=301, `exportado−importado`). Prova entregue: fórmula atual documentada, fluxo do painel mostrado como contraditório com a fórmula, busca exaustiva pelo documento original (`Base_Calculo_Rateio_Solar.md`) sem sucesso (não existe no repo/backup — 2 auditorias anteriores independentes já tinham marcado essa área como "não confirmado"). **Usuário concordou explicitamente em não trocar a fórmula sem evidência externa** — ficou registrado como pendência formal, não decidido por hipótese.

**Achado colateral desta investigação, mais valioso que a dúvida original**: ao investigar por que a tabela V2 (`energia_solar_geracao_diaria`) estava parada desde 05/08, descobri que o robô SAJ **nunca parou** — ele grava em `wallace_dados.dados.SOLAR_GERACAO_DIARIA` (o blob que o frontend realmente lê), não na tabela V2. Confirmado via API pública do GitHub Actions (9 execuções, todas `success`, dado real até o próprio dia desta sessão). Corrigido (script `atualizar_geracao_saj.py` agora grava nas duas, upsert por `data`, falha na V2 não derruba o script).

**4. "Qualidade da Geração" — indicador operacional novo, separado do crédito/rateio**: usuário pediu um card que responda "a usina está indo bem ou mal" sem nenhum termo técnico (código 03/103, saldo líquido, ANEEL). Achado de design corrigido ANTES de subir: a primeira versão comparava a leitura parcial de "hoje" contra a média de dias inteiros — isso classificaria "abaixo do esperado" quase toda manhã, mesmo em dia bom (testado mentalmente com dado real: 12,26 kWh às 11h40 vs média completa = 49%, falso alarme). Corrigido: o selo de status (🔴/🟡/🟢) usa sempre o último dia FECHADO comparado à média dos dias anteriores a ele; "hoje" é só exibido, nunca recebe selo.

**5. Bug de usabilidade real corrigido — Inbox Financeira**: usuário reportou itens "duplicados" visualmente (mesma origem/valor/data, sem descrição). Investigação com dado real do Supabase confirmou 2 eventos genuínos do Mercado Pago (`tipo:'account_money'`, mesmo payer, descrição vazia) que só se distinguiam pelo `idExterno` — campo que já existia no dado bruto mas nunca era exibido nem repassado (`metadata` nem chegava a ser passado de `sincronizarMercadoPagoParaInbox()` pra `inboxAdicionarItem()`). Corrigido: `idExterno`/`payer` agora aparecem na listagem; descrição vazia gera texto automático a partir do `tipo` do evento (mapa fechado, nunca inventa texto pra tipo desconhecido). Hora/minuto do evento não existe na fonte (script Python só grava data) — documentado como limitação real, não fabricado.

**6. Ajuste de clareza visual — Caixa Variável**: usuário apontou risco de interpretação — R$313,84 (Disponível Real) aparecia em 3 lugares com rótulo genérico "Caixa variável", risco de ser lido como o saldo total (R$1.886,65). Corrigido **só o texto dos rótulos** (3 pontos), nenhum id/fórmula/valor alterado (conferido no diff antes de commitar). Mesma distinção formalizada como regra permanente no manual (seção 6.1): TEM NA CAIXA (bruto) × DISPONÍVEL REAL (bruto − comprometido).

**7. Regra nova formalizada — alerta preventivo de PGV**: gatilho formal R$50 (Política §7), mas usuário pediu alerta preventivo sempre que o saldo estiver ≤ R$100, já na resposta de abertura de sessão. Registrado como obrigatório pra todos os agentes (`MANUAL_OPERACIONAL_AGENTES.md` seção 6.1) — só alerta, nunca executa transferência/lançamento automaticamente.

**8. MUDANÇA DE DIREÇÃO ARQUITETURAL (a mais importante desta sessão)**: usuário decretou que a V2 deixa de ser espelho/transição e passa a ser a arquitetura oficial — "a pergunta do projeto não é mais como manter V1 e V2 juntas, é o que ainda impede desligar a V1". Executado nesta rodada:
   - **Inventário completo de `wallace_dados`**: 95 chaves de topo (evidência real via `jsonb_object_keys`), 5 escritores identificados (4 scripts Python + o fluxo manual do agente, que cobria a maioria das chaves), classificados em 3 grupos (migrável imediatamente / depende de modelagem / depende de dado inexistente) — `PLANO_UNIFICACAO_V1_V2.md` seções 41-42.
   - **6 domínios já migrados viraram V2-exclusivos**: Patrimônio (exceto Caixa Lance), Investimentos/ROC, LREI, Cascata Wärtsilä, Parcelamentos, P2P. Mudança concreta: nova função `marcarIndisponivelV2()` (`app.js`) — falha na busca à V2 agora mostra `⚠ Indisponível (V2)` visível em vermelho, em vez do antigo `catch` silencioso que deixava o número V1 (síncrono, já renderizado) na tela sem nenhum aviso, indistinguível de dado real. Isso elimina o "caminho redundante mantido por segurança psicológica" apontado pelo usuário.
   - **Manual operacional atualizado** (seção 2): domínios V2-exclusivos param de receber escrita em `wallace_dados` no fluxo de lançamento manual — lançamento futuro vai direto nas tabelas V2.
   - **Deliberadamente NÃO executado** (risco desproporcional sem validação em navegador, sessão inteira sem login): remover os literais V1 dos `vars-*.js` (continuam como semente síncrona do 1º segundo de render — vários rodam em cálculo síncrono no boot, antes do DOM existir); parar os 4 scripts Python de escrever em `wallace_dados` (exceto Solar, que já passou a gravar em paralelo). Ambos classificados, documentados, não executados às cegas.

**9. Auditoria conceitual Mastercard Black/Visa (fim da sessão, sem código)**: usuário pediu regra de negócio primeiro (Política §3), não schema. Achado principal: **CARTAO_MAPA/titularidade/parcelamentos já estão representados na V2** (`cartoes` está, inclusive, mais atualizada que a própria Política — cartão 1371 já substituiu o 2244 fisicamente, refletido na V2, não no documento). O que continua bloqueado: headline totals (`cartaoMBTotal`/`cartaoInfiniteTotal`, verdade externa reconciliada à mão, não migrável sem reabrir reconciliação — proibido) e um gap de 34 transações (de 147 candidatas na Caixa Variável) sem `categoria_id`, mesmo gap já documentado que bloqueou a tentativa anterior de migrar LRW/LRV item-a-item. Categoria "Assinaturas" já existe na V2 (27 transações já classificadas) — migrável com 1 view nova, sem schema. "Recorrências" não tem categoria equivalente ainda. Nenhum código escrito, só investigação — ver `PLANO_UNIFICACAO_V1_V2.md` seção 43.

**Commits desta sessão** (16 ao todo, **todos enviados ao remoto** a pedido explícito do usuário no fechamento — `git push origin main`, `6bd54ab..61d54de`, `main` sincronizado com `origin/main`): `a3b3034` (fecha Onda 3), `d144157`/`4429a43`/`0639e37`/`755b4ba` (Onda 4, 4 domínios), `b6f7f31`/`5a40eae` (Onda 5, Parcelamentos+P2P), `a4e2cfd`/`7aef36b` (regras PGV/Caixa Variável), `13e4cbe` (bug Inbox), `a470500` (rótulos Caixa Variável), `6227d94`/`1c515d7` (investigação Solar + sync V2), `5f2c05f` (mudança de direção arquitetural + V2-exclusivo), `dc0bd47` (passagem de turno Bloco 18), `61d54de` (resumo executivo final). `ESTADO_ATUAL.md` reescrito do zero nesta rodada. **Pendência nova pra próxima sessão**: confirmar `wallacelira.com.br` ao vivo (GitHub Pages deve republicar sozinho, não verificado — sem navegador disponível nesta sessão).

**Nenhum lançamento financeiro real aplicado nesta sessão** — trabalho 100% arquitetura/migração de leitura + correções de usabilidade, nenhum dado de negócio alterado (exceto rotulagem/metadados, nunca valores).

## Bloco 17 — Onda 3 (Livro Razão, LRW/LRV, Patrimônio bloqueado, Metas parcial) + pivô estratégico V1→V2 (08/08/2026, continuação do Bloco 16, sessão nova)

**Contexto do corte**: esta sessão retomou de um resumo automático (limite de contexto, não de crédito) — o histórico completo do pivô estratégico e das Ondas 1/2 está fora deste bloco (aconteceu majoritariamente na parte da sessão que foi resumida). Aqui vai o que se sabe do resumo + o que foi executado depois da retomada.

**0. O pivô estratégico (resumido, aconteceu antes da retomada)**: usuário decretou "Pare de tratar a V2 como sistema auxiliar" e depois "MUDANÇA DE DIREÇÃO ESTRATÉGICA — não quero mais investir tempo em sincronização V1→V2 como solução permanente. Quero V2 relacional como única fonte de verdade." Isso abriu a Onda 1 (4 caixas, zero divergência, `vw_saldo_v2_por_caixa`) e a Onda 2 (+6 caixas com divergência documentada aceita, política nova: "divergência documentada não bloqueia, só ausência de estrutura bloqueia"; 4 caixas de causa indeterminada ficaram de fora por decisão explícita — Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário Júlio). Depois disso o usuário deu a ordem de prioridade da Onda 3: **1. Livro Razão → 2. LRW/LRV → 3. Patrimônio → 4. Metas → 5. Investimentos**, com regra explícita de não parar entre prioridades pra nova rodada de análise, "exceto se encontrar ausência real de estrutura na V2".

**1. Onda 3, Prioridade 1 (Livro Razão) — feita antes da retomada, commit `a59a943`**: 7 tabelas de lançamentos migradas pra ler `transacoes` direto (mesmo escopo das caixas já migradas — Eventos, Seguro, Combustível, Churrasco, Mastercard/Infinite, Bens Duráveis, PIX Vanessa). No caminho, achado e corrigido um bug real determinístico: `onDomPronto(fn)` roda `fn()` de forma SÍNCRONA (não é fila) sempre que o DOM já está pronto — caso normal aqui, já que `app.js` é injetado depois de um `fetch()` assíncrono. `WallaceFinanceService` estava definido textualmente DEPOIS de `onDomPronto(hydrate)`, causando `ReferenceError` em parte dos carregamentos (mascarado de "falha transiente" nas Ondas anteriores). Corrigido movendo `WallaceFinanceService` pro topo do arquivo.

**2. Onda 3, Prioridade 2 (LRW/LRV) — feita nesta retomada, commit `eff2805`**: investigação SQL mostrou que, das 35 linhas de `transacoes` marcadas como LRW/LRV (Caixa Variável, `afeta_saldo_real=false`), exatamente 30 têm `usuario_id` preenchido (25 Wallace R$1.128,11, 5 Vanessa R$218,21) e 5 não (`TX000200/203/204/205/206`) — e essas 5 são precisamente o grupo já identificado numa sessão anterior como "colisão de `tx_legado` com eventos históricos não relacionados" (Parte B da investigação de reconciliação). Ou seja: a divergência V1×V2 aqui (R$435,08 Wallace, R$146,41 Vanessa) já estava 100% explicada antes mesmo de criar código novo — não foi preciso investigação adicional. Criada view `vw_compromisso_cartao_por_pessoa` (agregação pura, `JOIN usuarios` exclui as 5 linhas sem `usuario_id` naturalmente, sem filtro extra) e módulo `hydrate-onda3-lrwlrv.js` sobrescrevendo `mbLRW`/`mbLRV`. Validado ao vivo (login já ativo na aba), zero erro de console.

**3. Onda 3, Prioridade 3 (Patrimônio) — BLOQUEADA, sem código escrito**: ao investigar a tabela `patrimonio` (V2, 11 linhas) pra reproduzir `patTotal`/`patrimonioDetalhe`/`passivosPatrimoniais`, achado um bloqueio estrutural real, não só divergência: a tabela só tem colunas `id/tipo/valor/data_snapshot/created_at/natureza`, **sem nenhum campo de rótulo**. Duas linhas têm `tipo='investimento'` (R$14.779,62 = BTG Necton, R$429,75 = Necton conta corrente) e são indistinguíveis por qualquer coluna — só bateriam por coincidência de valor, o que seria inventar lógica de correspondência frágil (proibido pela restrição da rodada: "não criar lógica nova de negócio"). Além disso, `passivosPatrimoniais` (seção 11 do painel) precisa de campos que não existem na tabela: `prestacaoFinanciamentoCasa`, `mesesRestantesFinanciamentoCasa`, `consorcioAutoPct`, `parcelaConsorcioAuto`. **Decisão: não migrar, documentar o bloqueio (seção 27 do plano) com o caminho de desbloqueio registrado (schema novo: coluna de rótulo + tabela/colunas de metadados de financiamento), sem executar.**

**4. Onda 3, Prioridade 4 (Metas) — parcial, commit `4d2e6e2`**: a tabela `metas` (V2) tem 2 linhas — "Fundo de Suavização Salarial (CC-304)" e "Meta do Milhão". A primeira bateu limpo: `vw_saldo_v2_por_caixa` já tem "Conta Suavização (CC-304)" com saldo R$0,00, idêntico ao V1 (`VARS.contaSuavizacao`, conta zerada desde a ativação). Migrado o card (`cxSuavizSaldo`/`cxSuavizTxt`/`cxSuavizBar`), reproduzindo a MESMA fórmula de texto/barra do V1, só trocando a fonte do saldo — módulo `hydrate-onda3-suavizacao.js`. "Meta do Milhão" **não migrada**: depende de `patrimonio.total`, que depende do saldo da Caixa Lance — achado novo nesta investigação: **a Caixa Lance nunca entrou em nenhum `*_V2_MAPA` de Onda anterior**, ou seja, a divergência V1×V2 dela nunca foi classificada. Registrado como pendência transversal (destravaria parte da Prioridade 3 + a Meta do Milhão inteira se resolvida).

**5. Onda 3, Prioridade 5 (Investimentos) — não iniciada.** A sessão parou na Prioridade 3/4 por ter batido o critério explícito do usuário de parada ("ausência real de estrutura na V2") — reportado ao usuário antes de prosseguir, em vez de seguir direto pra Investimentos com 2 blocos em aberto.

**Padrão de código consolidado nesta sessão** (repetir em qualquer Onda futura): módulo dedicado `hydrate-ondaX-nome.js`, método novo em `WallaceFinanceService` (topo de `app.js`), fetch/compare/log/overlay condicional (só sobrescreve DOM em caso de sucesso e — se aplicável — divergência aceita), `window.WALLACE_ONDAX_..._RELATORIO` global pra inspeção via console, chamada em `app.js` registrada DEPOIS da função V1 equivalente (nunca antes — senão V1 sobrescreve o V2), entrada no array de módulos do `Sistema_Wallace_Lira_Completo.html`, documentação de 8 pontos em `PLANO_UNIFICACAO_V1_V2.md`, validação ao vivo (login real, `document.getElementById('mainIframe').contentWindow`) antes de considerar pronto.

**Commits desta sessão** (avisados antes de cada um, ainda **NÃO enviados pro remoto** — `git status -sb` mostra `ahead 2` no fim da sessão): `eff2805` (LRW/LRV), `4d2e6e2` (Suavização + documentação do bloqueio de Patrimônio). `ESTADO_ATUAL.md` reescrito do zero nesta rodada; este bloco documenta o passo a passo.

**Nenhum lançamento financeiro real aplicado nesta sessão** — trabalho 100% de migração de leitura (frontend), nenhum dado de negócio alterado.

## Bloco 16 — Handoff por limite de crédito: performance, bugs reais, features novas, dupla arquitetura V1/V2 (07/08/2026, continuação do Bloco 15, mesma sessão)

**Contexto do corte**: usuário avisou "prepare a passagem de turno que seu crédito vai acabar" no meio de uma implementação (redesign dos botões flutuantes) — esta sessão fecha aqui, com uma tarefa deliberadamente incompleta (ver item 8). `ESTADO_ATUAL.md` foi reescrito do zero nesta rodada com o resumo estruturado; aqui vai o histórico passo a passo do que aconteceu, na ordem.

**1. Descoberta central da sessão: duas arquiteturas de dados paralelas.** O usuário pediu correção de performance e, no meio do trabalho, foi mostrando prints do painel ao vivo pedindo ajustes pontuais (FGTS, Caixa Wärtsilä, IOF ausente). Ao investigar por que os dados não batiam, descobri que existem DUAS fontes de dado completamente separadas: (a) V1 clássico — `VARS`/`REG` estáticos + uma linha JSON (`wallace_dados` no Supabase) que sobrescreve o VARS a cada carga (`Object.assign(VARS, dr)`) — é isso que alimenta o painel visível; (b) V2 relacional — tabelas normais (`caixas`, `transacoes`, `categorias`) alimentadas pelo botão "+ Lançar" e pela Inbox Financeira — NÃO afeta o painel ainda, é dado paralelo pra comparação futura (Fase 5). Isso explica por que a auditoria `FASE 2F` (`WALLACE_VALIDACAO_RUNTIME`) ficou REPROVADA o resto da sessão (4-10 caixas divergentes V1×V2) — é esperado, não é bug: são os lançamentos reais de hoje que entraram no V1 mas não foram replicados no V2 (decisão implícita, dado o volume — ver item 5).

**2. Diagnóstico de performance (pedido "PRIORIDADE MÁXIMA")**: medido por código-fonte (contagem de requisições) já que autenticação real é necessária pra medir em navegador de verdade (usuário logou na aba pra permitir a medição ao vivo depois). Achados: 55 módulos via `document.write` sequenciais + 3 fetches iniciais (`await` em cadeia) + cadeia de 8 `onload` no final = ~67 requisições 100% seriais, nenhuma cacheada (`?v=Date.now()` sempre). Autorizado a corrigir.

**3. Implementação da correção de performance**: os 55 módulos + 3 fetches viraram paralelos (`Promise.all`), cache-busting virou versão fixa (`__V`), cadeia de `onload` final reduzida de 8 pra 2 sequenciais reais (`energia-solar.js`→`promocoes-financeengine.js`, única dependência de ordem verdadeira) + 6 em paralelo. Resultado medido ao vivo (servidor local): ~10-15s relatados → 3,8-4,4s medidos (2 cargas). Bug real encontrado no processo: um comentário JS continha o texto literal `</script>`, fechando a tag HTML prematuramente e truncando o resto do bloco (`ReferenceError: __V is not defined`, tela travada em "—"). Corrigido. **Lição pra próxima sessão**: nunca escrever `</script>` como texto solto dentro de um `<script>`, nem em comentário.

**4. Bugs pontuais corrigidos** (apontados pelo usuário via prints do painel ao vivo, um a um): card FGTS com placeholder hardcoded (`R$77.683,60` em vez de `—`); card Caixa Wärtsilä mostrando a fatura como número principal em vez do saldo real da caixa, barra de progresso decorativa (nunca conectada a nenhum cálculo) e legenda usando um indicador (`recebidosNoCiclo`) que dava negativo mesmo com dinheiro real recebido; IOF de 3,38% ausente em 2 compras Anthropic (TX000200/TX000205) apesar do comentário dizer que estava incluído — corrigido nas 2 + no total mestre `cartaoMBTotal` (achado ao aplicar o IOF do TX000205 mais recente e o usuário pedir pra "inspecionar porque tem outra na mesma situação" — exatamente TX000200 tinha o mesmo bug). Scrollbar cinza quase invisível trocada por cinza claro. Card PIX Geral Vanessa ganhou meta de R$300 (confirmada pelo usuário) com barra animada.

**5. Lançamentos financeiros reais aplicados (V1: arquivo local + Supabase `wallace_dados`, sempre os 2 lugares)**: reembolso Bradesco R$312 (split R$164,94 Lance + R$147,06 Saúde Família, LREI0002 quitado), cortinas R$450 + empréstimo LREI0004 R$103,55 (Lance→Manutenção), reembolso Wärtsilä R$340 (dentro da própria Caixa Wärtsilä — usuário corrigiu explicitamente que NÃO vai direto pra Caixa Lance, segue a cascata da política seção 5), R$107,50 adiantamento bolo de Júlio (fluxo Variável→Vanessa→Aniversário reembolsa→Vanessa repassa pra mulher do bolo), Hortifruti R$46,97 (PIX Geral Vanessa/LRPV), `reembolsoAReceber` atualizado pra R$6.700,61 (usuário confirmou, R$340 já recebido conta à parte). Inbox Financeira: 12 pendentes, cruzados um a um contra o que já tinha sido lançado — 11 rejeitados (duplicavam lançamentos já feitos), 1 (R$652, Wärtsilä+Bradesco combinados) **desapareceu sozinho da Inbox antes de eu rejeitar, motivo não investigado**.

**6. Deploy**: usuário autorizou explicitamente "você comita sozinho, só me avise antes" (mudança de regra permanente, antes era "nunca commitar sem pedido explícito") e depois "se precisar faça o deploy" — 4 commits feitos e enviados nesta sessão (`e1c4aa7` performance+bugs, `608fdb9` reembolsoAReceber, `422b04d` saudação+inatividade+split+categoria+botões). Descoberta no caminho: 2 commits (`9b97ed2`, `1bc7769`) já tinham sido feitos por fora (provavelmente o usuário via VS Code, ou outra sessão) sem eu saber — sempre rodar `git status`/`git log` antes de assumir o que está pendente.

**7. Features novas implementadas** (pedidos explícitos do usuário, não bugfix): saudação premium ("Bom dia/Boa tarde, Wallace/Vanessa" conforme e-mail logado + horário, `wallace.termica@gmail.com`/`vanessaflor.galdino@gmail.com`, únicos 2 com acesso); logout automático por 15min de inatividade; formulário "+ Lançar" ganhou opção de dividir valor entre várias caixas (várias linhas caixa+valor, 1 chamada de RPC por linha) e opção de criar categoria nova (nova função Postgres `criar_categoria`, aplicada via migration do Supabase MCP, SECURITY DEFINER, não está em arquivo `.sql` do repo).

**8. INCOMPLETO no corte**: usuário rejeitou o visual do redesign dos botões flutuantes (pill sólida com gradiente, achou "horroroso"), mandou print de referência e pediu: círculo pequeno com ícone, tira lateral com o texto aparece só no hover. Decidido o approach (label posicionado absoluto atrás do círculo, revela com opacity+transform no `:hover`) mas **nenhum código foi escrito ainda** — próxima sessão retoma em `src/app/app.js`, procurar `.wallace-fab` (CSS injetado dinamicamente via `<style>` em JS, não em `assets/css/styles.css`).

## Bloco 15 — Handoff (narrativa desatualizada vs. disco real) + lançamentos financeiros reais do ciclo (07/08/2026)

**Parte 1 — passagem de turno pedida pelo usuário** ("faça a passagem para o próximo agente / se atualize nas documentações do projeto"): a narrativa da sessão anterior (achava que só tinha criado `reg-operacional.js`, faltando 6 módulos REG e todo o VARS) estava completamente desatualizada em relação ao disco real — REG (7 módulos) e VARS (10 módulos) já estavam prontos, o projeto já tinha sido fisicamente reorganizado (Bloco 14) e tudo já estava commitado (`b83e165`+`e4a0226`). Corrigido reconferindo `git status`/`git log`/`git diff`/`find` antes de escrever qualquer coisa — `docs/changelog/ESTADO_ATUAL.md` foi reescrito do zero pra refletir o estado real (4 fases da modularização V2 concluídas, reorganização física concluída, 2 arquivos com dado financeiro real não commitado: `vars-caixas.js` e `vars-mercado-pago.js`, sincronização Supabase TX000192-208). Lição confirmada: nunca confiar em narrativa de sessão sem checar `git`/filesystem primeiro, especialmente após qualquer indício de lacuna de tempo ou compactação de contexto.

**Parte 2 — lançamentos reais do ciclo (confirmados um a um pelo usuário antes de escrever)**:
1. **Reembolso Bradesco R$312,00** dividido em 2 pernas: R$164,94 quita `LREI0002` (Caixa Lance ← Caixa Saúde Família, `status` virou `QUITADO` em `LREI_ATIVAS`) — `TX000212` (Entrada, Caixa Lance) + `TX000213` (Entrada, `SAUDE_FAMILIA_TRANSACOES`). R$147,06 foi pra Caixa Saúde Família também via `TX000213`.
2. **Cortinas R$450,00** saem da Caixa Manutenção (`TX000214`, Saída). Como a Manutenção não tinha saldo suficiente, o empréstimo novo é só a DIFERENÇA (R$103,55, não o valor cheio) — `LREI0004` criado em `LREI_ATIVAS` (Caixa Lance credora, Caixa Manutenção devedora), com `TX000216` (Saída, Caixa Lance) + `TX000215` (Entrada, Manutenção).
3. **Reembolso Wärtsilä R$340,00** — CORRIGIDO por instrução explícita do usuário: NÃO é lançamento direto na Caixa Lance. Segue a cascata da política (seção 5): Cartão Wärtsilä → corporativo Mastercard → corporativo Mercado Pago → Pessoal Mercado Pago → só a sobra vai pra Caixa Lance. Usuário confirmou que já transferiu o R$340 de verdade pra dentro da Caixa Wärtsilä — lançado como `TX000220` (Entrada) em `WARTSILA_CAIXA_TRANSACOES`, e `VARS.reembolsoCicloTotal` atualizado (4914.98 → 5254.98, SSOT, mesmo padrão V137) pra refletir o recebimento no indicador da cascata. `sobraPessoal` continua sendo recalculado automaticamente pela fórmula existente (`FinanceEngine.js`) — nenhuma entrada manual extra necessária na Caixa Lance por enquanto.
4. **R$107,50 (adiantamento bolo de Júlio)** — fluxo completo esclarecido pelo usuário: Caixa Variável pagou Vanessa (nunca lançado antes, "não prestei atenção") → Caixa Aniversário Júlio reembolsou a Caixa Variável (isso já existia como `TX000208`, só a descrição estava errada, dizendo que ia direto "pra Vanessa" — corrigida pra refletir que é reembolso à Variável) → Vanessa repassou o valor pra Maria Karoline de Lima Frazao (mulher do bolo, comprovante MP 172378658144). Adicionados `TX000217` (Saída) e `TX000218` (Entrada) em `CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL` — efeito líquido zero na Caixa Variável (dinheiro só passou por ela), exatamente como o usuário descreveu.
5. **R$46,97 (Hortifruti Dupomar)** — usuário confirmou "sai do Pix Geral Vanessa" (comprovante MP 172431149270, 06/08). Adicionado `TX000219` (Saída) em `LRPV_TRANSACOES` — mesmo padrão de `TX000153` (mesmo fornecedor, "PIX Dupomar Hortifruti").
6. **Confirmado** (resposta "1-a" do usuário): Caixa Bens Duráveis mantém o plano como está; `AJUSTE-06-08` continua item separado, não decidido, não mexido.

Todos os placeholders de saldo (`caixaLance`, `caixaManutencao`, `caixaSaudeFamilia`, `caixaVariavelSaldoReal`, `pixGeralVanessaSaldo` etc.) foram deixados intocados — são sempre recalculados por `calcularSaldoCaixa()` a partir dos arrays de transação, nunca editados à mão.

**Arquivos alterados**: `src/financeiro/caixas/vars-caixas.js`, `src/financeiro/operacional/vars-reembolsos.js`. **Ainda não commitado** (usuário commita via VS Code). **Não validado em navegador nesta rodada** (exigiria login manual do usuário na aba) — validar com `WALLACE_VALIDACAO_RUNTIME` (18/18) e `healthBadge` antes de considerar fechado.

## Bloco 14 — Reorganização física completa do projeto (07/08/2026, continuação do Bloco 13, mesma sessão)

Depois da validação em navegador da Fase 3+4 (REG/VARS, ver Bloco 13) e de uma auditoria de pré-deploy (achados: `calcularValorKwhGerado()` órfã em `energia-solar.js`; CNAME/Firebase authorized domain pendentes pro domínio próprio; nenhum bug real), o usuário decretou "modo congelamento pré-deploy" — e, na sequência, revogou esse congelamento em favor de uma reorganização arquitetural física completa do projeto, dando prioridade a ela sobre o deploy imediato.

**Processo seguido, por pedido explícito do usuário**: mapear tudo antes de mexer, apresentar estrutura atual/proposta/riscos/ordem, só then executar. A proposta original do usuário (`src/{app,dashboard,financeiro,solar,auditoria,integrations,services,shared,components,assets}` com ~40 subpastas) foi podada — removidas ~15 pastas que ficariam vazias ou exigiriam quebrar arquivo existente em pedaços pra preencher (`shared/`, `components/*`, `assets/js`, `assets/fonts`, subpastas de `solar/`, a maioria de `integrations/*`, `services/api|cache|storage`, `.github/ISSUE_TEMPLATE`/`PULL_REQUEST_TEMPLATE`, `tests/integration`/`mock`) — critério: "prefiro arquitetura coerente do que árvore bonita cheia de diretório sem uso" (palavras do usuário).

**Achado que mudou o plano**: `src/services/*.js` têm `import`/`require('./Outro.js')` reais entre si (`CycleEngine.js`, `EnergiaService.js`, `FinanceService.js` etc.) — mover qualquer um pra pasta diferente quebraria essas referências relativas. `services/` ficou intocado, flat, como já estava. Achado lateral: 9 dos 11 arquivos de `src/services/` (tudo exceto `FinanceEngine.js`/`Comparator.js`) não são carregados por nada em produção — arquitetura anterior superada, mantidos por estarem fora do escopo autorizado.

**Execução** (~78 arquivos movidos, ~75 caminhos reescritos):
- 63 módulos de `src/modules/` (pasta removida) + `app.js` (raiz → `src/app/`) distribuídos em `src/{dashboard,financeiro,solar,auditoria,integrations}/`, um domínio de negócio por pasta (hydrate+reg+vars+recalcular do mesmo domínio juntos, não agrupados por "tipo de arquivo").
- `promocoes-financeengine.js` (cross-domínio, toca as 18 fases de todos os domínios) foi pra `src/app/`, junto do bootstrap — não tinha lar de domínio único.
- Docs → `docs/{architecture,changelog,decisions,database}/` (README.md ficou na raiz — GitHub só renderiza README de raiz como home do repo).
- Scripts Python → `scripts/{database,sync}/`.
- CSS/favicons → `assets/{css,images}/`.
- 3 arquivos `.test.js` → `tests/unit/`, com os `require('./X.js')` corrigidos pra `require('../../src/services/X.js')`.
- Reescrita de caminho feita via script PowerShell (mesmo método confiável da extração do VARS) — 63 substituições de módulo + 1 de `app.js` + 1 de `styles.css` no HTML principal, 3 de favicon no `index.html`, todas conferidas por contagem exata (nenhum caminho antigo sobrou, exceto texto de comentário histórico sem efeito funcional).
- 4 workflows (`atualizar_cotacoes_acoes.yml`, `atualizar_geracao_saj.yml`, `mercadopago_sync.yml`, `sincronizar_pluggy.yml`) tiveram o `run: python3 X.py` atualizado pro caminho novo — sem isso os cron jobs quebrariam. `_headers` também atualizado.

**Validação em navegador feita nesta rodada** (usuário ainda autenticado): reload completo, todos os ~140 requests de rede (contando o carregamento duplicado de sessões anteriores no log) retornaram 200 OK nos caminhos novos, console sem erro novo, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` "✅ Sistema íntegro", valores reais no painel idênticos aos de antes da reorganização.

**Gerado**: `docs/architecture/PROJECT_STRUCTURE.md` (árvore completa), `docs/architecture/ARCHITECTURE.md` (camadas VARS/REG, padrão de carregamento estático×dinâmico, convenção de nomeação), `docs/CONTRIBUTING.md` (como adicionar módulo/domínio/serviço/script novo).

**Nenhum commit feito.** Decisão em aberto pro usuário: retomar o deploy (CNAME + Firebase authorized domain) que estava planejado antes da reorganização começar.

## Bloco 13 — Fase 4 (`VARS`) modularizada em 9 domínios (10º criado: `vars-operacional.js`), sem validação em navegador (07/08/2026, continuação do Bloco 12)

Usuário aprovou a Fase 3 (`REG`, ver Bloco 12) mesmo sem validação em navegador e pediu pra seguir direto pra Fase 4 (`VARS`), com a mesma regra: não parar por causa do login, registrar exatamente o que foi movido, validar tudo em lote depois.

**Ordem dada pelo usuário**: `vars-caixas` → `vars-mercado-pago` → `vars-p2p` → `vars-patrimonio` → `vars-reembolsos` → `vars-roc` → `vars-energia-solar` → `vars-ciclo-snapshots` → `vars-operacional`.

**2 achados/decisões antes de começar** (perguntei ao usuário antes de escrever qualquer módulo, dado o tamanho e risco de `VARS`):
1. `VARS.PLUGGY_CONTAS` nunca existe no literal estático (só chega via `Object.assign(VARS, window.WALLACE_DADOS_REMOTOS)` em runtime) — usuário confirmou não criar `vars-pluggy.js`.
2. ~35 chaves (salário, orçamento, `coberturaGarantida`, teto/tolerância da Caixa Variável, LEGENDAS, CDI, médias salariais, históricos, Inbox Financeira etc.) não cabiam nos 9 domínios financeiros — usuário aprovou criar um 10º módulo, `vars-operacional.js`, espelhando o domínio "Operacional" que o REG já tinha.

**Achado estrutural**: `VARS` fechava (linha 235→1470 do app.js daquele momento) bem antes do que a posição de `aplicarBoletosVencidosAutomaticamente()` sugeria — entre o fechamento do literal e essa função existe ~115 linhas de pós-processamento síncrono (`Object.freeze` de 3 objetos, merge de dados remotos do Supabase, ~10 saldos derivados via `calcularSaldoCaixa()`) que dependem do `VARS` inteiro já montado. Essa faixa ficou intocada em `app.js`, mesma categoria do que já tinha ficado com `REG` (`calcularAporteIncrementalPorCiclo()`).

**Método**: dado o tamanho de `VARS` (~1.235 linhas, ~200 chaves de topo — bem mais granular que as 35 do `REG`), em vez de editar manualmente como na Fase 3, mapeei as ~90 faixas de linha exatas (chave a chave) e usei um script PowerShell pra copiar por intervalo de linha direto do arquivo pros 9 módulos novos — evita erro de transcrição num arquivo desse tamanho. Um bug real do próprio script (PowerShell "achatava" arrays de 1 único intervalo, zerando o conteúdo de 2 módulos) foi pego pela checagem de integridade (chaves balanceadas + contagem de chaves) antes de prosseguir, corrigido, script re-executado.

**Checagem de integridade feita** (sem navegador — sem Node/Python neste ambiente): 200 chaves de topo no `VARS` original = 200 chaves extraídas nos 9 módulos = 200 únicas (zero perdida, zero duplicada, conferido via script). Chaves/colchetes balanceados em cada módulo novo e em `app.js` inteiro depois da cirurgia.

`app.js`: **2.644 → 1.423 linhas** (-1.221). `const VARS = {}` (vazio) + 9 `Object.assign(VARS, criarVarsXxx())`, mesmo padrão do `REG`. HTML: 8 `<script>` estáticos adicionados antes do `app.js`, logo depois dos 7 `reg-*.js`.

**Mapa final de `app.js` (1.423 linhas) construído a pedido do usuário** ("quero um mapa do que sobra") — registrado em `ESTADO_ATUAL.md` seção 2.9. Conclusão: tirando o `WallaceFinanceService` (~500 linhas, serviço autocontido já validado 18/18, fora de escopo desde a Fase 2), o resto é bootstrap/orquestração pura — monta `VARS`/`REG` a partir dos módulos, roda pós-processamento que precisa do objeto inteiro, e faz as poucas chamadas de orquestração que não podem virar módulo por ordem síncrona de execução. Não decidido ainda, formalmente, se isso fecha a V2 arquitetural — depende da validação em navegador (item 0 das pendências).

**Pendência crítica pra próxima sessão**: validação consolidada em navegador (REG + VARS juntos — console, 18/18 fases, healthBadge, valores reais por domínio). Nenhum commit feito.

## Bloco 12 — Fase 3 (`REG`) modularizada em 7 domínios, sem validação em navegador (07/08/2026, continuação do Bloco 11)

Sessão seguinte, retomando exatamente do ponto do Bloco 11 (`hydrate()`/`recalcularAgregadosDerivados()` já concluídos, `REG` era a próxima frente). Usuário já tinha mapeado a estrutura do `REG` (35 chaves de topo) numa sessão anterior que caiu no meio — só o módulo `reg-operacional.js` tinha sido criado, sem ligar. Confirmei isso conferindo o código real (não a documentação, que estava desatualizada) antes de agir.

Usuário aprovou o agrupamento proposto (7 módulos por domínio, espelhando a mesma divisão já usada em `recalcularAgregadosDerivados()`) e definiu a ordem: `reg-caixas` → `reg-mercado-pago` → `reg-p2p` → `reg-patrimonio` → `reg-reembolsos` → `reg-balanco` (mais o `reg-operacional.js` que só faltava ligar). Regra explícita: só mover definições nesta etapa, sem alterar nomes de campo, estrutura ou comportamento.

**Bloqueio real encontrado**: o preview local caiu em "Sessão não encontrada" — o login usa Firebase real (email/senha), e por regra de segurança a IA nunca digita senha em nenhum campo. Sem o usuário logado na aba, não dá pra rodar `WALLACE_VALIDACAO_RUNTIME`/conferir `healthBadge`/console.

**Decisão do usuário**: não parar o ritmo por causa disso. Autorizou seguir criando e ligando todos os 7 módulos (script no HTML + `Object.assign` em `app.js` + remoção das chaves do literal antigo) SEM validação individual, documentando exatamente o que foi movido em cada passo, deixando a validação consolidada pra quando ele logar. Instrução explícita: não voltar para auditorias/PIX Geral Vanessa/Caixa Lance/Caixa Boletos nesta frente.

**Executado**: os 7 módulos criados (cópia verbatim de cada fragmento, mesmo padrão de função fábrica de `reg-operacional.js` — chamada só depois que `VARS` já existe, mesmo motivo do `CARTAO_PLUGGY_MAPA_DEFAULT`). `app.js`: 2.897 → **2.644 linhas** (-253). `const REG` virou um literal vazio (`{}`) seguido de 7 chamadas `Object.assign(REG, criarRegXxx())`. Checagem estática (sem navegador, já que não há Node/Python neste ambiente): chaves balanceadas em `app.js` e em cada módulo novo (todos diff 0), as 35 chaves originais do `REG` contabilizadas uma única vez cada entre os 7 módulos. Detalhe módulo-a-módulo (arquivo/chaves/linhas removidas) registrado em `ESTADO_ATUAL.md`, seção 2.7.

**Pendência crítica pra próxima sessão**: validação em navegador ainda não feita (console, 18/18 fases, healthBadge, valores reais por domínio) — é o primeiro passo antes de decidir avançar pra Fase 4 (`VARS`). Nenhum commit feito.

## Bloco 11 — Modularização "MODO V2 ARQUITETURAL" + achados de negócio (07/08/2026, mesma sessão dos blocos 1-10)

Depois do bloco 10 (Mercado Pago fechado), a sessão continuou por muito mais tempo, com 2 frentes grandes novas. Handoff completo desta sessão está em `ESTADO_ATUAL.md` (seções 2-5) — aqui vai só o histórico narrativo, em ordem.

**1) Correção da PIX Geral Vanessa e investigação de Caixa Lance.** Usuário pediu pra investigar por que o painel V1↔V2 mostrava 12 divergências. Achado: 8 das 12 (Manutenção, Aniversário, Eventos, Saúde, Seguro, Combustível, Churrasco, Escola) eram lançamentos `AJUSTE-06-08` escritos direto no Supabase (`wallace_dados`) numa sessão anterior — investigação de origem (quem/quando/rendimento real vs ajuste manual) ficou **inconclusiva**, não decidida, não removida. PIX Geral Vanessa tinha bug real e isolado (2 transações faltando no array de cálculo) — corrigido, aprovado pelo usuário, aplicado. `PGV_SALDO_INICIAL_CICLO` não mexido (usuário recusou, corretamente: o campo `saldo_inicial_ciclo` do banco pra essa caixa está com dupla-contagem confirmada). Caixa Lance investigada, mas reconciliação bloqueada por falta de âncora de fechamento confiável — não forçada.

**2) Painel V1↔V2 reclassificado + botões flutuantes redesenhados.** Painel agora separa "divergência real" de "diferença explicada" (Boletos/Lance/Bens Duráveis, causa já conhecida). Botões `+ Lançar`/`💰 V2`: tamanho padronizado, empilhados, badge fixo em círculo, fecha clicando fora.

**3) Modularização — "MODO MODULARIZAÇÃO" depois "MODO V2 ARQUITETURAL".** Usuário pediu pra continuar a modularização começada numa sessão anterior (só 1 módulo existia: `promocoes-financeengine.js`). Processo em 2 fases:

- **Fase A (módulos autocontidos, sem tocar no núcleo)**: extraídos 10 módulos — `energia-solar.js`, `opcoes-roc.js`, `dashboard-navegacao.js`, `ui-navegacao-basica.js`, `ui-componentes-visuais.js`, `graficos-cenarios-lazy.js`, `graficos-utilitarios.js`, `filtro-livros-razao.js`, `contagem-abas-livros-razao.js`. Descoberta importante nesse processo: nem todo módulo pode carregar DEPOIS do `app.js` (padrão `onload`, usado quando o código só roda via `onclick`/evento) — alguns precisam carregar ANTES (padrão `document.write` estático), porque são chamados em código SÍNCRONO no meio da execução do `app.js` (ex: a IIFE que cria os gráficos do Painel na carga da página, ou o cálculo de ROC/Opções que roda dentro do `VARS`). Confundir os 2 padrões quebra o site.
  - **1 incidente real nessa fase**: um comentário `/* */` mal fechado comentou o resto do `app.js` inteiro (bug silencioso, sem erro de sintaxe óbvio até muito depois no arquivo) — pego pelo usuário via screenshot ("dados sumiram"), corrigido na hora.

- **Fase B (usuário mudou o objetivo)**: depois dos 10 módulos, usuário decidiu que o objetivo não é "reduzir linhas", é "terminar a V2 arquitetural" — `VARS`/`REG` pararem de ser mega-containers, `hydrate()`/`recalcularAgregadosDerivados()` pararem de ser motores únicos. Pedi pra mapear os 4 blocos do núcleo antes de mexer (responsabilidades/dependências/consumidores) — mapa completo apresentado, achado central: `REG.balanco` sozinho lê de 6+ domínios diferentes (não é um domínio, é uma visão cruzada), e `recalcularAgregadosDerivados()` é uma CADEIA (passo N lê resultado do passo N-1), não uma lista de cálculos independentes. Ordem de execução aprovada pelo usuário: **hydrate() → recalcularAgregadosDerivados() → REG → VARS**, nessa ordem, um de cada vez.

  Começou a quebra de `hydrate()` (785 linhas originais) em funções por domínio, sempre carregando ANTES do `app.js` (mesmo motivo do padrão acima — `hydrate()` é chamada de forma síncrona via `onDomPronto(hydrate)` dentro do próprio `app.js`). Extraídos até agora: `hydrate-roc.js`, `hydrate-caixas.js`, `hydrate-patrimonio.js`, `hydrate-indicadores.js`. **`hydrate-metas.js` foi criado e verificado, mas ainda não foi ligado** (nem `app.js` nem o HTML foram editados pra usá-lo) — sessão interrompida nesse ponto exato pra escrever esta passagem de turno. Ver `ESTADO_ATUAL.md` seção 2.3 pros 3 passos exatos de como terminar isso.

  **2 incidentes mecânicos reais nessa fase**, ambos pegos antes de virarem regressão real:
  - Um `sed` com substituição multi-linha colapsou 3 linhas em 1 só, fazendo um comentário `//` "engolir" 2 declarações `const` que o código de baixo precisava (`hydrate-caixas.js`) — corrigido via `Edit` direto, sem depender de `sed` pra blocos grandes de novo.
  - Esqueci de fechar uma função com `}` no fim do arquivo (`hydrate-indicadores.js`) — `SyntaxError: Unexpected end of input`, pego no console do navegador, corrigido na hora.
  
  Por causa desses 2 erros, o usuário pediu um checklist obrigatório antes de testar cada módulo novo daqui pra frente: conferir fechamento de função, chaves balanceadas, nenhum comentário `//` comendo código, variáveis locais que atravessam a fronteira do corte reinseridas onde precisar.

`app.js`: 8.890 → 5.056 linhas (43% menor) nesta sessão. 14 módulos em `src/modules/`. Nenhum commit feito — segue via VS Code com o usuário.

## Bloco 10 — Mercado Pago implementado (competência, não caixa) — fecha o bloco 9 (07/08/2026)

O item 4 do bloco 9 (Mercado Pago/Wärtsilá) estava só revisado, sem aprovação. Usuário aprovou e **acrescentou uma regra nova**: o corporativo do ciclo tem que seguir competência (data real da despesa), nunca o status de pagamento da fatura — "uma viagem corporativa em 26/07 pertence ao ciclo atual mesmo que a fatura anterior tenha sido paga em 04/08".

Isso invalidou a proposta original do bloco 9 (que usava `VARS.reembolsoPagaMPCorporativo`, um número manual por ciclo, não derivado de data real). Investigação nova encontrou a peça certa: `VARS.TRANSACOES_CORPORATIVAS_MP` — array já existente no sistema (criado em outra sessão, V159), cada item com `data` real e `tipo:'corp'`/`'unico'`, já usado num painel de detalhe (LRMP-corp, `app.js` ~linha 4066) pra filtrar por competência — só não estava plugado no cálculo do Balanço.

**Implementado:**
- `REG.balanco.corporativoMPDoCiclo` (novo campo) — soma de `TRANSACOES_CORPORATIVAS_MP` com `tipo==='corp'` e data dentro do período do ciclo atual, mesmo filtro do painel LRMP-corp.
- `REG.balanco.obrigacoes.mercadoPago = mercadoPagoFatura - corporativoMPDoCiclo`, sem `max(0,...)`.
- `balObrWartsila` (HTML) passa a mostrar `corporativoMPDoCiclo`, não mais o acumulado.
- Novo indicador HTML separado (`balReembolsoWartsilaAcumulado`, badge "Só informativo") pro acumulado histórico `faturaMPCorporativoPendente` — não entra em nenhuma conta de ciclo.
- Legenda `legMPCorporativoRetorno` corrigida.
- `VARS.reembolsoPagaMPCorporativo` (cascata do reembolso, domínio separado) **não foi tocado** — fora do pedido.

Com o dado atual do array, valor esperado do Corporativo do Ciclo: **R$266,23** (só `TXMP000011`, 01/08, cai no ciclo 25/07→24/08).

**Não validado em navegador nesta sessão** — nem este item, nem os outros 2 pendentes do bloco 9 (botões flutuantes, Crescimento Patrimonial/Taxa de Poupança). Ver `ESTADO_ATUAL.md`, itens 3-5, pra detalhe.

### Arquivos alterados neste bloco
- `app.js` — `REG.balanco.corporativoMPDoCiclo` novo, fórmula do Mercado Pago líquido trocada, render de `balObrWartsila` corrigido, novo render de `balReembolsoWartsilaAcumulado`, legenda corrigida.
- `Sistema_Wallace_Lira_Completo.html` — nova linha HTML pro indicador acumulado.
- `ESTADO_ATUAL.md`, `PASSAGEM_DE_TURNO.md` — atualizados pra handoff.

## Bloco 9 — Modularização, UI, metodologia do indicador principal, revisão Mercado Pago (07/08/2026)

Depois do fechamento da Fase 2 (bloco 8), a sessão continuou com 4 frentes novas:

**1) Modularização.** Pedido do usuário: dividir `app.js` (8.890 linhas) em módulos, "app.js só como bootstrap". Mapeamento completo feito primeiro (tabela com linhas/dependências/risco/ordem — não repetida aqui, ver o chat ou refazer se precisar). Achado crítico: `VARS`/`REG`/`recalcularAgregadosDerivados()`/`hydrate()` (~4.100 linhas, 46% do arquivo) são um núcleo monolítico que mistura TODOS os domínios — não dá pra recortar em `caixas/`, `patrimonio/` etc. sem redesenhar o motor de dados inteiro. Segundo achado: o próprio código já documenta que `type="module"` quebraria todos os `onclick` inline do HTML — modularização real aqui só pode ser scripts clássicos em sequência, nunca ES modules.

Implementado: **módulo 1** (`src/modules/promocoes-financeengine.js`), as 18 fases FinanceEngine (2D-2V) extraídas, ~1.207 linhas. Carrega via `onload` depois do `app.js` terminar (script dinâmico é `async=true` por padrão — sem o `onload` a ordem não seria garantida). `app.js` caiu pra ~7.700 linhas. **Confirmado em runtime real**: 18/18 fases continuam aprovadas depois da divisão, comportamento idêntico.

**2) UI dos botões flutuantes.** "+ Lançar" e "💰 V2" não ficavam simétricos (o `right` fixo em rem de cada um colava quando o badge de divergência crescia). Corrigido com dock flutuante único via flexbox. **Não validado em navegador ainda.**

**3) Indicador principal — metodologia trocada.** Usuário (citando conselho externo) apontou que "PIB Wallace" media fluxo de caixa e excluía consumo não recorrente — não representa crescimento de riqueza. Verificação confirmou: "Eficiência Financeira" já existente era quase a mesma coisa que a "Taxa de Poupança" pedida, só com receita/despesa incompletas (faltava rendimentos/valorização na receita, consumo não recorrente na despesa). Implementado:
- `REG.pibWallace.taxaPoupancaPct`/`.poupancaRS` — receita e despesa **completas**, sem excluir nada.
- `REG.pibWallace.crescimentoPatrimonialPct`/`.RS` — precisa de patrimônio do fechamento do ciclo anterior; **começou a persistir agora** (`patrimonioLiquido` adicionado ao payload de `registrar_pib_mensal`) — só aparece a partir do próximo ciclo fechado.
- PIB Wallace antigo: cálculo/persistência intactos, virou `<details>` recolhido (não apagado).
- HTML (seção 10) redesenhada com 2 cards novos + o antigo recolhido.
- **Não validado em navegador ainda.**

**4) Mercado Pago / Reembolso Wärtsilá — só revisão, SEM implementar.** Usuário reportou valores errados nos cards "Mercado Pago líquido" e "Corporativo Mercado Pago (ciclo atual)". Regra de negócio nova pedida: nunca misturar dado do ciclo atual (25→24) com acumulado de reembolso pendente. Revisão confirmou:
- `VARS.faturaMPCorporativoPendente` (R$1.544,11) = acumulado histórico, NÃO escopado ao ciclo — usado incorretamente em 2 lugares (`REG.balanco.obrigacoes.mercadoPago`, linha ~3056; `hydrate()` `balObrWartsila`, linha ~4873).
- `VARS.reembolsoPagaMPCorporativo` **já existe e já é cycle-scoped** — é o campo certo pro "Corporativo do Ciclo", só não está conectado ainda.
- Proposta apresentada ao usuário (fórmula `mercadoPagoFatura - reembolsoPagaMPCorporativo`, sem `max(0,...)`; `faturaMPCorporativoPendente` vira indicador separado, só informativo). **Aguardando aprovação — nada foi codificado.**

### O que NÃO foi feito

- Módulos 2+ da modularização (energia-solar-config, inbox-conciliacao, busca-global, gráficos, cenários, ciclo).
- Validação em navegador dos itens 2 e 3 acima (botões, Crescimento Patrimonial/Taxa de Poupança).
- Implementação do item 4 (Mercado Pago) — só a revisão, esperando aprovação.
- Nenhum commit.

### Arquivos alterados neste bloco

- `app.js` — módulo 1 extraído (removidas ~1.207 linhas), botões (dock flutuante), novos campos `REG.pibWallace.*` (taxa de poupança/crescimento patrimonial), RPC `registrar_pib_mensal` expandida.
- `src/modules/promocoes-financeengine.js` — **novo arquivo**, as 18 fases FinanceEngine.
- `Sistema_Wallace_Lira_Completo.html` — carregamento do módulo novo (`onload` chain), seção 10 redesenhada (Crescimento Patrimonial + Taxa de Poupança + PIB Wallace recolhido), guard de login corrigido (já era de um bloco anterior, `localStorage`→`sessionStorage`).
- `ESTADO_ATUAL.md`, `PASSAGEM_DE_TURNO.md` — reescritos pra handoff.

## Bloco 8 — FECHAMENTO DA FASE 2 (07/08/2026)

Estado oficial consolidado, sem nova auditoria/investigação:

**39 componentes implementados** (18 blocos FASE, 2D-2V). **10 confirmados em fallback** (FASE 2F, runtime real: `0/10`). **29 implementados, aguardando confirmação mecânica de runtime** (não é pendência de investigação).

**Congelado**: Caixa Boletos (causa conhecida — corte de ciclo — fora de escopo por decisão), `VARS.livroLRC` (array/cascata), `cartao_id`/`usuario_id`, schema `investimentos`.

**Explicado, sem ação**: Caixa Bens Duráveis (déficit inicial conhecido, R$355,00) e Caixa Lance (`LREI0003`, R$266,23, ressarcimento via Wärtsilá) — fechados do ponto de vista de negócio. Continuam dentro do fallback confirmado da FASE 2F, por causa raiz separada (corte de ciclo), não relacionada ao déficit/LREI.

**FinanceEngine operacional**: definição e escopo final registrados em `ESTADO_ATUAL.md`, seção "FinanceEngine operacional — definição final". Fase 2 encerrada nesta sessão.

Arquivos atualizados: `ESTADO_ATUAL.md` (reescrito), `MAPA_MIGRACAO_V2.md` (nota de fechamento), `PASSAGEM_DE_TURNO.md` (este bloco). Nenhum código alterado, nenhuma fase nova, nenhuma investigação aberta.

## Bloco 7 — reconciliação com extratos reais + correção de contexto (regras de negócio)

Usuário enviou 7 extratos originais (Bradesco Visa Infinite jun/jul, Bradesco conta corrente, 3 extratos Mercado Pago cobrindo jun-ago) como fonte de verdade, pedindo reconciliação das caixas divergentes. Cruzamento revelou: a transação de R$1.986,21 em Caixa Boletos e a de R$266,23 em Caixa Lance, ambas datadas 24/07/2026, batem exatamente com os diffs vistos no painel Supabase relacional — confirmando que **para Boletos** a causa raiz é o corte de ciclo hardcoded (`CICLO_ATUAL_INICIO = '2026-07-24'`, `FinanceService.js:38`).

Simulação controlada (sem alterar arquivos) testando trocar `2026-07-24`→`2026-07-25` em todos os pontos da FASE 2F: **Boletos zera a diferença (confirma a hipótese)**, mas **as outras 9 caixas do lote piorariam** (Lance principalmente — a caixa tem múltiplas transações por dia, cortar só a data de 24/07 remove mais dinheiro do que deveria). Resultado simulado: 0/10 → 1/10 aprovariam. **Não é uma correção uniforme viável** — precisaria ser por caixa, não uma troca global de data.

**Correção de contexto do usuário, importante para não reabrir como bug**:
- **Caixa Bens Duráveis (V2 = -R$355,00)**: NÃO é anomalia. É déficit inicial conhecido — a caixa nasceu propositalmente negativa (fone de ouvido + aparador de pelos, R$355,00, sem fundo acumulado prévio). Reclassificado, não investigar mais.
- **Caixa Lance (diferença de R$266,23)**: NÃO é erro nem perda. É um LREI — Lance emprestou R$266,23 pra cobrir a fatura Mercado Pago, com obrigação de ressarcimento pelos reembolsos da Wärtsilá. Reclassificado como crédito a recuperar.

Ambas reclassificações são só de documentação/interpretação — nenhum código foi alterado.

## Bloco 6 — instrumentação temporária de validação runtime (nenhuma fase nova)

Usuário confirmou em navegador real que a FASE 2F reprova (0/10). Pediu instrumentação uniforme das 18 fases (2D-2V) pra descobrir quantas realmente aprovam em runtime — **sem criar FASE 2W/3, sem tocar UI, sem nenhuma promoção nova**.

**Implementado**: 1 helper (`registrarValidacaoFase(fase, aprovado, motivo)`) logo antes da FASE 2D, empilhando cada resultado em `window.WALLACE_VALIDACAO_RUNTIME` e logando `[FASE XX] APROVADA/REPROVADA — motivo`. Cada uma das 18 fases ganhou 1-2 linhas extras (chamando o helper no ponto onde já decidia `aprovado`) — nenhuma lógica de negócio, nenhum gate, nenhuma fórmula foi alterada. No fim da FASE 2V, um resumo automático roda: `console.table(window.WALLACE_VALIDACAO_RUNTIME)`.

**Como ler o resultado real**: abrir o site no navegador, abrir o console (F12), recarregar a página, e ver a tabela final `[VALIDAÇÃO RUNTIME] Resumo completo das 18 fases`. Ou digitar `window.WALLACE_VALIDACAO_RUNTIME` a qualquer momento depois do carregamento.

**Eu não tenho como rodar isso neste ambiente** (sem navegador/Node) — a tabela real só existe depois que você abrir o site. Marcado como **TEMPORÁRIO** no próprio comentário do código — remover depois da validação, não é uma peça permanente da arquitetura.

## Bloco 5 — varredura completa das 46 funções exportadas do FinanceEngine

Usuário recusou considerar a fila esgotada de novo e pediu varredura de TODA função exportada em `src/services/FinanceEngine.js`: já ligada? testada? promovível sem schema/`cartao_id`/`usuario_id`/Boletos?

| Função | Já ligada? | Pode ser promovida? |
|---|---|---|
| `calcularIdade` | Não | Sim — cópia fiel de app.js:2860 |
| `calcularPatrimonio` | Não | Sim, com gate condicional — 🟡 conhecido (override Financiamento Casa), mas mesmo padrão de segurança de sempre decide em runtime |
| `calcularLiquidoMes` | Não | Sim, mas com padrão novo — substitui o corpo da função `liquidoMes(i)` (chamada em 5 pontos), não escreve 1 campo |
| `calcularAtivoPassivoLiquido`, `somarCampo`, `calcularSaldoAbertoReembolsos`, `calcularCreditoLiquidoMedidor` | Não | Não — helpers genéricos pro `src/services/*Service.js` (array-shape do Supabase), sem ganho direto sobre `app.js` sem reconstruir um fetch novo |
| `calcularVisaTotalComprometido` | Não | Não — depende de `VARS.livroLRC` (array represado), risco de timing mantido por cautela |
| `getDisponibilidade`, `getPercentualFioB`, `aplicarTributosPorDentro` | Não (diretamente) | Não — helpers internos, já usados dentro de `calcularContaComSolar`, que já está promovido |
| `classificarStatusROC` | Não (diretamente) | Não — já usada indiretamente via `calcularROCPosicao`/`calcularROCConsolidado` (FASE 2S) |
| (demais 32 funções) | Sim | — |

**3 implementadas**: FASE 2T (idade), FASE 2U (Balanço completo, gate condicional), FASE 2V (`liquidoMes(i)`, primeira promoção de função em vez de campo — validada nos 12 índices do cenário antes da troca). Mesmo padrão de segurança: Comparator confirma zero divergência antes de qualquer escrita/troca; se divergir, V1 permanece intocado. Comparator não pôde ser executado ao vivo neste ambiente. Sintaxe: balanço manual de chaves/parênteses/colchetes conferido (137/137, 375/375, 48/48).

**39 componentes/funções conectadas** (36 anteriores + 3). Fila verde esgotada de novo, confirmado por varredura completa desta vez (46 funções exportadas, todas classificadas).

## Bloco 4 — "MODO ACELERAÇÃO": Livro LRC e ROC/Opções liberados pontualmente

Depois do fechamento da Fase 2 (bloco 3, "FinanceEngine operacional" aceito), o usuário liberou Livro LRC e ROC/Opções especificamente pra análise e promoção do que estivesse pronto sem tocar schema/migração/histórico. Achados:

| Item | Pronto? | O que faltava |
|---|---|---|
| Livro LRC — total exibido (`REG.livrosRazaoTotais.LRC.total`) | Sim | Só escrever a IIFE — função e entradas (2 escalares já confirmados) já existiam. **Diferente** do `VARS.livroLRC` (array/cascata), que continua represado. |
| Opções — Valor de Mercado Consolidado | Sim | Idem — só escrever a IIFE, sem schema. |
| Opções — Dias Operação / Status / ROC posição / ROC consolidado | Sim, com adaptação | Converter datas BR pra ISO antes de chamar `calcularDiasOperacao`; `classificarStatusROC` do FinanceEngine devolve string, não objeto {label,emoji,classe} — reconstruído com mapa fixo pra não quebrar a UI. |
| `comparacaoCDI` (função dedicada) | Não | 🟡 — é 1 divisão trivial, mas nunca foi extraída como função separada do FinanceEngine (reaplicada inline, sem comparator dedicado, reaproveitando `rentabilidadeMensal` já validado). |
| `statusPosicao`/`vencida` | Não | 🔴 — lógica de decisão, não é fórmula, baixo valor. |
| Migração pra tabela `investimentos` (schema) | Não | 🔴 — bloqueador estrutural real (schema sem strike/prêmio/vencimento), não depende de decisão. |

**3 novas fases implementadas**: FASE 2Q (Livro LRC total), FASE 2R (Valor de Mercado Consolidado), FASE 2S (ROC posições + carteira). Mesmo padrão de segurança de sempre — Comparator confirma zero divergência antes de escrever, fallback automático pro V1. Comparator não pôde rodar ao vivo (sem navegador/Node neste ambiente); validação de sintaxe foi manual (chaves/parênteses/colchetes balanceados: 97/97, 265/265, 35/35).

**Fila verde esgotada de novo** — nenhum item 🟢+testado+sem dependência restante depois desses 3.

## Bloco 1 — aplicação da FASE 2M (pacote externo)

O usuário anexou `Passagem de turno_Code.zip` (pacote de uma sessão de chat anterior). Diff contra o `app.js` real mostrou que as FASES 2F-2L já estavam aplicadas; só faltava a **FASE 2M** (Domínio 4: `totalOpDetalhe.recorrencias`/`.assinaturas`), inserida no mesmo ponto do pacote. `app.js` ficou byte-idêntico ao pacote depois disso. `ESTADO_ATUAL.md`/`MAPA_MIGRACAO_V2.md` atualizados. Revisado e aprovado pelo usuário nesta sessão (diff resumido apresentado, checklist de itens confirmados, sem alteração em Livro LRC/Boletos/ROC/Opções). **Sem commit** — usuário commita via VS Code.

## Bloco 2 — diagnóstico e "MODO FECHAMENTO" (mesma sessão)

Usuário pediu diagnóstico completo do que faltava pra declarar a migração encerrada. Levantamento contra o código real (não só a documentação) achou:
- Um segundo mecanismo V1↔V2 **separado**, não documentado no `MAPA_MIGRACAO_V2.md`: painel "Arquitetura V2" via Supabase relacional (`rpc_dashboard_resumo()`), responsável pelos 12 alarmes que o usuário viu na tela (Caixa Boletos, Caixa Lance, Bens Duráveis etc. com diffs grandes). **Não faz parte do FinanceEngine** — registrado como pendência de decisão, não investigado a fundo (instrução do usuário: sem mais investigação de Supabase).
- Gaps reais entre "função 🟢 na matriz" e "função realmente chamada no `app.js`": Caixa Variável (tetoEfetivo/folegoAteTeto), Projeto Casa Nova, Escola de Júlio % (domínio 3), e o domínio 9 inteiro (ROC/Opções, congelado por instrução).

Usuário respondeu com "MODO FECHAMENTO": autorizou implementar direto, sem mais paradas, tudo que for 🟢 + testado + sem dependência de Livro LRC/Caixa Boletos/`cartao_id`/`usuario_id`/ROC/Opções/schema novo.

## Bloco 3 — execução (3 itens promovidos, mesma sessão)

| Fase | Item | Resultado |
|---|---|---|
| FASE 2N | Caixa Variável — `tetoEfetivo`/`folegoAteTeto` | Comparator embutido no bloco (roda no boot real do navegador); cópia fiel da fórmula já usada pra `.disponivel` (mesma função `calcularCaixaVariavel`, mesmas entradas, `comprometidoParaTeto === comprometido` confirmado no código) — divergência esperada zero por construção. |
| FASE 2O | Projeto Casa Nova (capital disponível, %, falta) | Idem — mesmas entradas do V1 (`VARS.btgNecton`, `VARS.caixaLance`, `REG.projetoCasaNova.metaLance`), cópia fiel, divergência esperada zero. |
| FASE 2P | Escola de Júlio % da meta | Idem — mesmas entradas (`VARS.escolaJulioSaldo`, `VARS.metaEscolaJulio`), cópia fiel, divergência esperada zero. |

Todas seguem o padrão de segurança de todas as fases anteriores: só escrevem em `REG` se `WallaceComparator` confirmar `totalDivergente === 0`; se divergir, cai automaticamente no valor V1 e loga `[WARN]` no console — nunca quebra a tela. **Comparator não pôde ser executado ao vivo neste ambiente** (sem navegador/Node disponível) — a validação real acontece no boot do site; recomendado conferir o console na próxima sessão com navegador (`[FASE 2N]`, `[FASE 2O]`, `[FASE 2P]`, todos esperados "X/X" sem `[WARN]`).

**Depois desses 3, não sobrou nenhum item 🟢-testado-sem-dependência implementável** — conferido item a item contra a matriz completa (ver `ESTADO_ATUAL.md`, seção "Itens 🟢 restantes verificados"). O que resta é 🟡/🔴 por natureza, ou congelado por instrução explícita (Livro LRC, Caixa Boletos, `cartao_id`/`usuario_id`, ROC, Opções, schema Supabase).

## Estado consolidado da migração V1→V2 (FinanceEngine) ao final desta sessão

| Domínio | Status |
|---|---|
| 1. Caixas | 11/12 saldos + Caixa Variável completa (disponível/teto/fôlego) — só Boletos fora (congelado) |
| 2. Reembolsos/Cascata | 2/6 itens — resto depende de Livro LRC (congelado) ou é cascata não migrada (🔴) |
| 3. Patrimônio/Balanço | 6/9 itens — resto é Financiamento Casa (🟡) ou Consórcio Casa Nova trivial não extraído (🔴) |
| 4. Cartões/Livros Razão | 1 item — resto depende de Livro LRC/`cartao_id`/`usuario_id` (congelado) |
| 5. Indicadores/PIB Wallace | 4/4 completo |
| 6. Necessidade/Modo Operacional | 2/5 itens — resto é parcial (🟡) ou trivial não extraído (🔴) |
| 7. Energia Solar | 5/5 completo |
| 8. P2P | 1/1 completo |
| 9. Opções/ROC | Congelado — 0 tocado |

**36 componentes reais rodando via FinanceEngine** (30 até FASE 2M + FASE 2N/2O/2P + FASE 2Q/2R/2S). V1 nunca foi apagado em nenhum deles.

## O que NÃO foi feito

- Nenhum commit/push — segue só com o usuário via VS Code.
- Nenhuma investigação do painel Supabase relacional (12 alarmes) — fora do escopo, registrado como pendência de decisão.
- `VARS.livroLRC` (array/cascata), Caixa Boletos, `cartao_id`/`usuario_id`, migração pro schema `investimentos` — continuam intocados (represados ou bloqueados estruturalmente).
- `comparacaoCDI` (função dedicada) e `statusPosicao`/`vencida` — não extraídos, baixo valor/sem função pronta.

## Pendências que dependem de decisão do usuário

1. Caixa Boletos — falta o saldo real de abertura do ciclo (25/07).
2. `VARS.livroLRC` (array/cascata de reembolso) — reabrir ou continuar represado.
3. Painel "Arquitetura V2" via Supabase relacional — 12 divergências ativas na última checagem visual, mecanismo separado do FinanceEngine, mesmo nome "V2".
4. UI dos botões flutuantes ("+ Lançar" / "💰 V2") — pedido de melhoria estética foi pausado a meio caminho (revertido, `app.js` ficou limpo) quando o usuário priorizou o fechamento funcional. Ainda pendente, se quiser retomar.
5. Commit — via VS Code, com o usuário.

## Arquivos alterados nesta sessão

- `app.js` — FASE 2M aplicada (bloco 1); FASE 2N/2O/2P (bloco 3); FASE 2Q/2R/2S (bloco 4); FASE 2T/2U/2V (bloco 5). Nenhuma alteração de UI/CSS permaneceu (revertida).
- `ESTADO_ATUAL.md` — reescrito refletindo o estado final pós-FASE 2V.
- `MAPA_MIGRACAO_V2.md` — linhas de tetoEfetivo/folegoAteTeto, Projeto Casa Nova, Escola de Júlio %, Livro LRC (total), 4 itens de ROC/Valor de Mercado, Balanço completo e idade marcadas como conectadas.
- `PASSAGEM_DE_TURNO.md` — este arquivo, atualizado cobrindo os 5 blocos da sessão.
