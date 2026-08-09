# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 09/08/2026, fim de sessão longa (auditoria de prontidão operacional + correção de todos os achados críticos + bugs reais de UI encontrados testando ao vivo). HEAD `cbb7d00` no momento desta escrita, `git status` limpo (fora dos `desktop.ini` inofensivos do Google Drive Desktop, nunca commitados).

## 🚨 Achado mais importante da sessão: auditoria de segurança real, corrigida

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

## Pendências remanescentes — ordem de prioridade pra próxima sessão

| Item | Prioridade |
|---|---|
| **Passo 2 da segurança**: restringir policies de SELECT (RLS) pras tabelas financeiras — hoje qualquer um lê tudo com a chave pública. Canalização do token já pronta e validada; falta só travar as policies e testar ao vivo. | **Alta** — maior exposição real que resta |
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
