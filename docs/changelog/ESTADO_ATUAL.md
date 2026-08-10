# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 10/08/2026, sessão de continuação (achados reais via foto do celular + navegador). HEAD `c123dfe`, tudo commitado e pushed (branch `main`, `wallacelira07.github.io`).

## ✅ Corrigido nesta sessão (10/08/2026, 4ª rodada) — 6 achados via foto real do celular/navegador

1. **Botão "Compartilhar" (aba Solar) invisível** — usava `var(--purple)` sem fallback; essa variável CSS nunca foi definida no painel principal (só existe em `solar-compartilhado.html`), então o botão renderizava sem background/border nenhum, só texto branco solto contra o fundo escuro. Corrigido com fallback `var(--purple, #9085e9)`. **A funcionalidade de escolher a validade do link já existia** (`prompt()` pedindo dias, 1-365, padrão 30) — o usuário só não via porque o botão era invisível.
2. **Card "Caixa Var. — Disponível Real" (capa) sempre verde, mesmo negativo** — classe de cor fixa no HTML (`cm-val g`), nunca trocava pra vermelho como o card gêmeo do Simulador já fazia. Corrigido em `hydrate-resumo-p2p.js` (toggle de classe `.r` conforme sinal).
3. **Lupa do cabeçalho quase invisível numa 2ª faixa de largura (560-780px)** — a correção de contraste da rodada anterior só valia abaixo de 560px; unificada no bloco de 780px (mesma faixa em que o botão já vira círculo).
4. **"Ver ciclo" vazando pra todas as abas** — era global (fora de qualquer master-pane, decisão antiga V145 de 25/07 "sempre visível em qualquer aba"), o usuário pediu que só aparecesse no Painel. Movido pra dentro de `#painel`, mesmo padrão já usado pro card Verificações de Negócio.
5. **F5 sempre voltava pro Painel** — agora grava a aba atual em `sessionStorage` (`showMaster()`) e restaura no boot seguinte (`irParaPrimeiraSecao`).
6. **Boot mais rápido** — medido via `window.WALLACE_BOOT_TIMING` (instrumentação já existia, nunca tinha sido lida): total ~935ms, maior fatia (~500ms) era `promocoes-financeengine.js` carregando em série antes dos 6 módulos finais (documentados como independentes dele). Agora disparam em paralelo.

**Decisão tomada com o usuário** (AskUserQuestion): "atualizar dados ao trocar de aba" — nem sempre (mais lento, mais chamadas ao Supabase) nem nunca (dado pode ficar velho numa sessão longa). Implementado meio-termo: recarrega o iframe inteiro (reaproveitando o F5 que já restaura a aba) só se fizer mais de 5min desde o último boot. Recarregar tudo em vez de tentar atualizar só os dados foi escolha deliberada de segurança — os gráficos (`graficos-cenarios-lazy.js`) são documentados como não seguros de recriar (`new Chart()` de novo no mesmo canvas duplica/quebra).

Commits: `5f1187a`, `c123dfe`. **Não testado em dispositivo real** (só emulação de viewport + sessão fake-auth local) — validação real depende do usuário.

## 🎯 Regra permanente (de sessão anterior, continua valendo): V1 não é autoridade

`wallace_dados`/`VARS` (V1) não é mais fonte de verdade — a V2 (`transacoes`/tabelas relacionais/tabela `legendas`) só é validada contra a realidade (extrato, comprovante, confirmação do usuário), nunca contra o que o V1 dizia. `vw_reconciliacao_v1_v2` é só ferramenta de detecção de migração incompleta.

## 🎯 Regra nova desta sessão: não narrar de volta pedidos antigos do usuário

Pedido explícito: ao aplicar uma correção que já foi pedida antes, agir direto — não prefixar com "você pediu X antes" ou reexplicar o que ele mesmo pediu. A documentação do projeto existe pra isso.

## ✅ PENDÊNCIA #1 RESOLVIDA (era suspeita, não bug) — "Patrimônio Total" vazio no card da capa

Testado em 10/08/2026 (sessão seguinte): forcei carga 100% limpa do `Sistema_Wallace_Lira_Completo.html` local (bypass de login via `sessionStorage['auth']` fake, só pra inspecionar DOM/REG, nenhum dado real tocado) — `#coverPatrimonioTotal` renderiza certo: **R$ 685.683** (Total) e **R$ 120.368** (Líquido), `REG.balanco.patrimonioTotalGeral`/`.pgbl`/`.fgts` todos com valor numérico correto, nenhuma exceção. Confirma a hipótese (a) do registro anterior: era **cache do navegador** (HTML/JS antigo, de antes do `__V` bumped), não bug de código. Ordem de execução (hipótese b) descartada — `REG.balanco.pgbl`/`.fgts` já são números bem antes de `recalcularPatrimonio()` rodar.

**Não precisa de ação de código.** Se o usuário ainda ver "—", é F5 forçado / conferir `__V` no rodapé.

## ⚠️ PENDÊNCIA #2 — abas cortando/travando ao rolar no mobile

Usuário reportou 2 sintomas: (a) `.master-tabs` (position:sticky;top:0) "desce um pouco e trava" ao rolar, precisa rolar tudo de volta pro topo pra trocar de aba; (b) clicar numa aba corta a parte de cima do conteúdo novo. Não achei a causa lendo o CSS — pedi print/gravação 2x, sem resposta ainda. **Não mexer sem evidência visual real.**

## ✅ Corrigido nesta sessão — bug real de dado (Necessidade Líquida)

Gráfico "Necessidade líquida — próximos ciclos" não batia com o card do mesmo valor (ex: R$13.700 no card × R$13.008/13.179 no 1º ponto do gráfico). Duas causas:
1. `ANCHOR_MONTH_CICLO` (`graficos-utilitarios.js`) gravado com mês calendário em vez do mês de ciclo — corrigido pra `'2026-08'`.
2. Achado mais sério: a função que resincroniza gráficos depois de recálculo assíncrono (`atualizarGraficosNecessidade()`) mora só no módulo *lazy* (`graficos-cenarios-lazy.js`, só carrega se o usuário abrir a aba Gráficos/Cenários) — quem fica só no Painel nunca via a atualização. Criadas versões não-lazy em `graficos-painel-principal.js` (`atualizarGraficosPainelPrincipal`/`atualizarGraficoPainelPatrimonio`/`atualizarGraficoPainelCaixaVariavel`), conectadas nos mesmos pontos de chamada.

**Confirmado funcionando pelo usuário** (print). **Suspeita não verificada**: outros gráficos (dos ~26 `new Chart(...)` do site) podem ter o mesmo padrão de bug — só os 3 achados nesta varredura foram corrigidos, não houve varredura exaustiva de todos.

## ✅ Corrigido — 12 legendas sem data/histórico de correção

Local (`VARS.LEGENDAS`, `vars-operacional.js`) + Supabase (tabela `legendas`, sempre vence) atualizados juntos: `legEscolaJulioForaPatrimonio`, `legVisaAposentado`, `legVisaCorrecaoV207`, `legAguaGasMedintech`, `legMigracaoAssinaturasMB`, `legPGVSaldoResidual`, `legOpcoesReconstruido`, `legLinha4vs5MP`, `legSimulacaoMesAMes`, `legTotalOperacionalDefinicao`, `legTaxasPorHoraAviso`, `legQgHojeParcial` (frequência real: atualiza a cada 10 min, não "captura única"). `legPGBLDefinicao` migrada de HTML hardcoded pro sistema de legendas (não existia como legenda de verdade antes). **Não houve varredura exaustiva de todas as legendas do site** — só as apontadas pelo usuário + as com o mesmo padrão dentro de `VARS.LEGENDAS`.

## ✅ Corrigido — cabeçalho e mobile (index.html + assets/css/styles.css)

- Nome abreviado "Wallace Lira" (era "SWL"), avatar vira círculo com a inicial + tooltip de clique/toque com o email (não só hover).
- Botões do cabeçalho agrupados em `.header-actions-group` — alinhamento consistente em qualquer largura.
- Lupa de busca torta no overlay mobile — corrigida (cálculo de posição não considerava padding extra do overlay).
- Tabelas quebrando texto letra por letra no mobile — `table-layout:fixed` global trocado por `table-layout:auto` + scroll horizontal (`max-width:640px`), o `overflow-x:auto` que já existia nos wrappers passou a funcionar de verdade.
- Grade de navegação da home (5 botões grandes) — virava 3 linhas no mobile, agora é faixa rolável horizontal.
- Botão flutuante "＋ Lançar" — removido do dock `position:fixed` global, migrado pra dentro do card Inbox Financeira (`#lancarTxSlot`), mesma lógica/RPC internas.

**Confirmado pelo usuário**: cabeçalho/avatar/busca. **Não testado em navegador real ainda**: tabelas mobile, botão Lançar reposicionado (não consigo logar).

## ✅ Corrigido — "Verificações de Negócio" vazando pra todas as abas

1ª tentativa desta sessão moveu o card pra área "home" (capa) — errado, essa área é compartilhada por todas as abas, vazava pra Gráficos/Solar/Cenários/Balanço (usuário reportou com print). Corrigido de vez: movido pra dentro do próprio `#painel` (só existe quando essa aba está ativa), como primeiro elemento.

## ✅ Corrigido — card "Patrimônio" renomeado e expandido

"Patrimônio" (ambíguo) → "Patrimônio Líquido" em 3 lugares (capa, KPI do Painel, Resumo Executivo) — deixa claro que é só Reserva+BTG/Necton+Caixa Lance+Necton CC. "Patrimônio Total" (Físico+Financeiro+Previdência+FGTS líquido de passivos, já existia só na aba Balanço) virou o valor principal do mesmo card da capa, com Líquido como linha secundária. **Ver Pendência #1 — o valor Total não está aparecendo ainda.**

## ✅ Implementado nesta sessão (10/08/2026) — filtro de assinatura/recorrência conhecida

Dedup da Inbox (Mercado Pago + Pluggy) agora também compara por ESTABELECIMENTO, não só valor exato — fecha o caso de assinatura com reajuste/câmbio (ex: Anthropic em USD) reaparecendo como "nova" todo ciclo. Fonte: view nova `vw_assinaturas_confirmadas_v2` (categoria "Assinaturas" já classificada em V2, 22 hoje), sem lista hardcoded. Ver `classificacao-inbox.js`/`pluggy-reconciliacao.js`, commit `7bbe694`. **Não testado em navegador real** (não consigo logar) — validação depende do usuário ver a Inbox de perto.

## ✅ Implementado nesta sessão (10/08/2026) — compartilhamento público da aba Energia Solar

Link com token temporário, sem login, expondo só dado do domínio Solar (geração/eficiência/economia estimada em R$) — nunca nenhuma tabela financeira. Tabela `solar_compartilhamentos` + 4 RPCs (criar/desativar/listar autenticadas; consultar pública) + página nova `solar-compartilhado.html` (autocontida) + botão "Compartilhar" na aba Solar (`src/solar/compartilhamento-solar.js`). Commit `a02c095`. **Validado**: RPCs testadas direto no Postgres, página pública testada de ponta a ponta com token real (leituras/gráfico/economia renderizando certo). **Não testado**: fluxo de criar link a partir do painel autenticado (exige login Firebase real, sem credenciais nesta sessão) — só a rejeição de token inválido foi confirmada.

## ✅ Corrigido nesta sessão — 2 achados do usuário via foto real do celular (depois do refresh)

1. Lupa de busca quase invisível no círculo do cabeçalho mobile (baixo contraste) — cores mais fortes só no mobile.
2. Carrossel horizontal dos 5 botões de navegação da home — usuário não gostou ("não gostei desse carrossel"), pediu grade 2 colunas. Trocado, e o breakpoint foi unificado em 820px depois de uma 2ª reclamação ("essa barra também não tá legal, toma muito espaço") — o celular real do usuário caía na faixa 640-820px, que ainda usava a versão alta antiga.

Commit `bb11918`. **Confirmado pelo usuário só pra lupa/carrossel visualmente via prints — não testado por mim em dispositivo real** (só emulação de viewport local).

## 🔜 Aprovado pelo usuário, NÃO implementado — 2 itens (ambos domínio Cartões, fora do escopo desta sessão)

1. **Totais de fatura de cartão via Pluggy** (`cartaoMBTotal`/`cartaoInfiniteTotal`/`mercadoPagoFatura`) — trocar a fonte manual pelo valor real que a Pluggy já traz do banco (`conta.fatura_mes_atual.valor_total`), com fallback pro valor manual se a Pluggy estiver fora do ar. Isso reabre/substitui `docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md` — atualizar esse doc ao implementar. **Ver `PLANO_UNIFICACAO_V1_V2.md` seção 47.**
2. **21 transações "Assinaturas" sem `cartao_id`** — proposta de classificação por data de corte (16/07/2026: antes=Visa 4844, depois=MB consolidada 2250) apresentada, usuário não confirmou execução. `TXS000003` pode ser duplicata de `TXS000008` — decidir cancelar vs classificar antes de tocar nela. **Idem — domínio Cartões, fora do escopo desta sessão.**

## Pendências antigas, sem decisão do usuário ainda

| Item | Nota |
|---|---|
| Rodapé "ERP V11" | Proposta de renomear feita 2x nesta sessão, usuário nunca confirmou "sim" |
| 3 transações LRW/LRV sem dono (R$282,71) | Só o usuário pode dizer de quem são |
| `window.WALLACE_BOOT_TIMING` | Nunca foi lido, precisa login real + DevTools |
| Leitura solar 09/08 sem `geracao_acumulada` | Confirmado pelo usuário como comportamento esperado (sem Energy Meter instalado ainda), não é bug |

## Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. **Pendência #1 é a mais urgente** — resolver antes de qualquer coisa nova.
3. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa — já causou confusão real nesta sessão (edições que "não apareciam" só porque a string não tinha sido bumped).
5. Não reabrir a exceção arquitetural de totais de cartão sem seguir o item 2 da lista "aprovado, não implementado" — é uma decisão formal já registrada, só muda com esse plano específico.
