# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 14/08/2026, sessão longa (herdou contexto do dia, que já vinha de um bloco anterior de 10 agentes performance+design — ver PASSAGEM_DE_TURNO.md pro resumo daquele bloco). Esta sessão: correções pontuais de UX/bugs reais (piso absoluto dessincronizado, legenda gigante, link de compartilhamento solar), 2ª rodada de 10 agentes (design sênior + performance, integrada manualmente), causa raiz real do bug recorrente de `.git`/Google Drive corrigida, seção nova no link de compartilhamento solar (Fluxo 1/2 de crédito), feature nova completa (botão de relatório de fechamento em PDF), 2º bug real de favicon achado no mesmo link solar (diferente do de 2.9, ver 2.11), fix real da restauração de aba no F5 (nunca funcionava — ver 2.12), e módulo novo completo **WWI (Wallace Wealth Intelligence)** — relatório executivo patrimonial vivo, regenerado mensalmente, com histórico e comparação de ciclos, agendamento mensal criado e validado com um Test Run real que já pegou e corrigiu 1 bug de dado (ver 2.13/2.14).

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **Nunca deixar o Google Drive sincronizar a pasta `.git/`** — causou corrupção real 2x (13/08, 14/08 manhã). **NOVO 14/08/2026 (correção definitiva desta sessão)**: a causa raiz real não era só resíduo em disco — 45 `desktop.ini` estavam de fato **commitados no repositório**, então toda limpeza anterior (só apagar do disco) era temporária, o Drive recriava e o bug voltava. Removidos do índice do git de verdade + `.gitignore` novo (`desktop.ini`) — não deve mais voltar, mesmo com o Drive sincronizando `.git/`. Se aparecer de novo mesmo assim, o comando de limpeza antigo (`find .git -iname desktop.ini -delete`) continua seguro, mas agora `git rm --cached` também, dado o `.gitignore`.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — é contenção de thread entre ~18 ondas concorrentes, já investigado a fundo (sessão de 14/08 manhã). Não reabrir como "achado novo" sem medir de novo primeiro. Um agente da rodada de performance desta sessão confirmou de novo (achado novo e real, diferente: ver seção 2 abaixo, "preload de scripts").

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.1 R$340,00 do ciclo Wärtsilä 2026-07 ainda não chegaram
Sem mudança desde a última sessão — ainda não confirmado como recebido.

### 1.2 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente (não conferido nesta sessão).

### 1.3 Relatório de fechamento em PDF — testado o quanto dava sem login, falta validação ao vivo
Feature nova completa (ver seção 2.6). Testei tudo que dava pra testar sem sessão logada (a função de coleta de dados só roda dentro do iframe autenticado): decodifiquei o PDF gerado byte a byte pra confirmar visualmente que renderiza certo, com fixtures de DOM idênticas à estrutura real. **Não testado**: o fluxo real completo, botão → iframe logado → PDF final, com dado de produção. Pedir pro usuário testar na próxima sessão e reportar qualquer seção vazia/estranha.

### 1.4 Previsão de geração baseada em irradiância solar — sugerido, não implementado
Usuário perguntou "tem alguma informação relevante pra energia solar na API do tempo?" — respondido que a Open-Meteo tem `shortwave_radiation`/`direct_radiation`/`diffuse_radiation`/`sunshine_duration`, hoje não usados (só temperatura/condição). Ficou de o usuário decidir se quer que isso vire uma previsão de geração esperada. Nada implementado ainda.

### 1.5 Variação horária de autoconsumo — perguntado, não é bug
Usuário perguntou por que autoconsumo (%) varia hora a hora. Respondido (explicação física: geração e consumo têm picos em horários diferentes, quando coincidem autoconsumo sobe). Mencionei que dado intradiário granular não existe hoje (robô só grava total do dia) — se o usuário quiser essa granularidade, é feature nova a definir, não pendência aberta.

### 1.6 WWI — agendamento criado e testado ao vivo; só falta o teste do botão Download com login real
Ver seção 2.13/2.14. **Resolvido nesta sessão**: usuário criou o agendamento (dia 25, 9h, cron-job.org — clonou um cronjob existente pra herdar token/headers sem o agente ver a credencial) e disparou um "Test Run" real, que rodou de ponta a ponta e gravou o snapshot da competência `2026-07` em `historico_relatorios`. Achado um bug real nesse teste (`consorcio_casa_pago_pct` 100x maior que o real) — corrigido no código e na linha já gravada, ver 2.14. **Ainda pendente**: testar o botão Download em si (iframe logado → busca de histórico → PDF com narrativa/score) — o snapshot já existe no banco, então o clique deveria reaproveitar a narrativa persistida; usuário vai testar.

## 2. O que foi feito nesta sessão (14/08/2026, bloco 3 — depois do bloco de 10 agentes da manhã já documentado)

### 2.1 Link de compartilhamento solar — token Firebase expirando em sessões longas
`idToken` do Firebase (~1h de validade) não tinha renovação (login é REST puro, não SDK). `renovarTokenFirebase()` nova em `index.html`, roda a cada 45min + ao retomar sessão; `compartilhamento-solar.js` tenta renovar e repete a chamada 1x antes de mostrar erro. Corrigido só o retry explícito nesse botão — a renovação periódica em background protege qualquer outra RPC autenticada do site.

### 2.2 Piso absoluto dessincronizado (R$9.223,66 vs R$7.831,17) + Consórcios removido de onde é sempre R$0
`VARS.reservaPiso` era um literal congelado de antes de 11/08 (quando Boletos subiu e Consórcios zerou com a migração dos consórcios Porto pro boleto). O card 03 "Soma do piso absoluto" já tinha sido corrigido em 13/08 pra somar ao vivo, mas `REG.reserva.piso` (card 05 "Desemprego extremo"), `deficitZero.piso[0]` e o texto de aviso continuavam lendo o literal velho. Os 3 agora derivam da mesma fórmula (`recalcular-necessidade.js`). Também removida a linha "Consórcios" do card 03 e do gráfico "Composição do Total Operacional" — categoria estruturalmente R$0,00 desde a migração pro boleto (11/08), não é bug.

### 2.3 Legenda gigante de detalhe da Caixa Mastercard_Infinite removida
Extrato linha-a-linha concatenado numa string só, ilegível. Removida a exibição (V1 e V2) e o fetch que só existia pra alimentá-la (`getExtratoCaixaMastercardInfinite`, órfão agora, removido de `app.js`).

### 2.4 CC-211/CC-212 ganham barra/%/meta + Seção "Obrigações Operacionais" reestruturada + Altura/IMC no Emagrecimento
- CC-211 (Caixa Mercado Pago) e CC-212 (Mastercard_Infinite) eram as únicas 2 caixas da grade sem barra/%/meta — meta agora é o comprometido do ciclo (fatura MP / total dos 2 cartões), não um teto fixo (não fazem sentido com meta de poupança, são reserva de fatura).
- Seção 07 "Obrigações Operacionais" dividida em 2 cards: o que soma no Total (Visa+MB+MP líquido) separado do que é só contexto Wärtsilá (corporativo do ciclo + pendente acumulado, nenhum soma no total). 4 legendas soltas viraram 1.
- Aba Emagrecimento: 4º card do kpi-strip (grid fixa de 4 colunas, ficava vazio com só 3 cards) mostra Altura (1,87m) + IMC calculado a partir da última pesagem.

### 2.5 Bug real de infraestrutura: 45 `desktop.ini` estavam commitados no repositório
Ver regra 6 acima. Causa raiz de verdade do "worktree aparece toda deletada" (13/08, 14/08 manhã, e de novo nesta sessão em 3 das 10 worktrees da 2ª rodada de agentes — seção 2.7). `git rm --cached` nos 45 arquivos + `.gitignore` novo. As 3 worktrees corrompidas desta sessão tiveram os arquivos reais alterados identificados pelo próprio relatório do agente, lidos direto do disco (bypassando git) e reaplicados manualmente no `main` — mesmo procedimento já documentado em sessões anteriores pro mesmo tipo de corrupção.

### 2.6 Relatório de fechamento em PDF — feature nova completa
Pedido do usuário: "quero um botão de link para baixar relatório que possa ser gerado em pdf com um resumo e fechamento de tudo". Escopo definido com o usuário: Resumo Executivo + Obrigações Operacionais (Total Operacional/Cartões/MP) + Todas as Caixas + Balanço Patrimonial/Patrimônio Financeiro + Reembolsos Wärtsilä. Localização: botão no cabeçalho (`index.html`, fora do iframe, acessível de qualquer aba).

- `src/relatorio/coletar-dados-relatorio.js` (novo, roda dentro do iframe): não recalcula nada, lê o texto já renderizado dos cards por título de seção (`.row`/`.k`/`.v`) — fonte única, nunca pode dessincronizar do que a tela mostra.
- **Achado real**: a seção "Todas as Caixas" usa um formato de card diferente (sem `.row`), o extrator genérico não achava nada ali — ficava sempre vazia, nem Boletos apareciam (achado do próprio usuário testando o PDF real). Extrator alternativo (`_extrairLinhasCards`) só pra esse formato, usado como fallback.
- jsPDF carregado sob demanda (mesmo padrão do html2canvas já usado no site), só no 1º clique.
- **Iteração de design**: 1ª versão era só texto corrido — usuário mandou print de referência (relatório corporativo com cards de KPI, cores, header colorido) e pediu pra melhorar. Reescrito com faixa de cabeçalho, 3 KPIs em destaque (Patrimônio Líquido/Modo Operacional/Total Obrigações), cards de seção com header colorido e linhas com fundo alternado.
- **2º achado real, testando o PDF de verdade** (decodifiquei o blob gerado e li o conteúdo byte a byte, não só "rodou sem erro"): emojis dos títulos de seção ("🔄", "📦") e a seta "→" viravam mojibake ("Ø=Ý", "!'") — as fontes padrão do jsPDF (WinAnsiEncoding) não têm glifo pra Unicode fora do latin-1. Sanitizador novo (`pdfSanitizarTexto`) remove emoji/símbolos antes de qualquer `doc.text()`, só na hora de desenhar.
- **Não testado ao vivo** — ver pendência 1.3.

### 2.7 2ª rodada de 10 agentes (5 design sênior + 5 performance) — pedido explícito do usuário ("otimize para mobile, desempenho e estética máxima")
Mesmo padrão da rodada da manhã: worktrees isoladas, sem tocar `main`, sem commit/push/migration. 9/10 worktrees limpas, 3 vieram com o mesmo bug de corrupção do Drive (ver 2.5) — arquivos reais identificados pelo relatório do próprio agente e reaplicados manualmente lendo o disco.

**Design entregue**: touch targets abaixo de 44px corrigidos (Inbox, seletor de ciclo, tabs, ícones do cabeçalho); `kpi-strip` colapsa pra 1 coluna em ≤480px; contraste de `--text-dim` corrigido (4.14:1 → ~5.2:1, WCAG AA); ~178 font-sizes inline migrados pros tokens `--fs-*`; ~25 cores hardcoded/tokens quebrados (`--yellow` nunca existiu) trocados pelos tokens reais; hover/active/focus-visible estendidos aos elementos que ainda não tinham (busca global, botões do compartilhamento solar, `.brand` do cabeçalho).

**Performance entregue**: html2canvas (~200KB) saiu do `<head>` bloqueante, carrega sob demanda no 1º clique de download; `<link rel=preload>` nos 9 scripts que só começavam a baixar no fim de uma cadeia de onload em série; `font-size:16px` em todos os `<input>`/`<select>` reais que causavam zoom automático do iOS Safari.

### 2.8 Link de compartilhamento solar — seção nova + 4 bugs reais corrigidos testando ao vivo
Pedido do usuário: replicar a seção 03 do painel privado ("📈 Crédito garantido vs. crédito em formação", Fluxo 1 fechado + Fluxo 2 em formação) na página pública `solar-compartilhado.html`. A RPC `consultar_solar_compartilhado` já devolvia `baseline_kwh`/`rateio_wallace_pct`/`rateio_irma_pct` em `cicloAberto` (não precisou mudar o banco) — só reaproveitado.

Testado ao vivo com token real ativo do banco (dado de produção, só leitura) em 3 rodadas, achando e corrigindo bugs reais a cada uma:
1. **"Fechado em undefined" / "Período: undefined"** — `dataFimTxt`/`periodoTxt` viviam só no objeto pai (`fluxo1`/`fluxo2`), nunca chegavam no objeto por casa que o template lia.
2. **Payback inflado (0,7 anos)** — achado do próprio usuário ("como vou pegar 14800 em 7 meses?"): dividia a economia acumulada desde a ATIVAÇÃO (~24 dias) pelos dias do CICLO GD ATUAL (~7 dias, reseta a cada fechamento) em vez da data de ativação real. Corrigido com `SOLAR_DATA_ATIVACAO` (2026-07-21) — payback real: 2,3 anos.
3. **"Geração hoje" mostrando dado de ontem depois da virada do dia** — mesmo truque de fuso (Brasília, -3h) já usado no painel privado, só não tinha sido replicado aqui.
4. Reestilizado pra ficar visualmente idêntico ao painel privado (mini-cards com borda em vez de grid solto) + texto conferido linha por linha ("Rateio Wallace"/"Rateio Wellida", "Faltam (se negativo)", legenda com "(janela 19-21)"/"(janela 06-09)") + cor da barra do Fluxo 2 (Wellida) trocada de âmbar pra verde (igual ao Wallace, pedido do usuário) + "previsto" removido do texto do período (nos 2 lugares: painel privado E página compartilhada — mesmo texto copiado deliberadamente nos 2).

Também corrigido: `INVESTIMENTO_PADRAO` desta página (usado no payback) ainda estava em R$25.000 — 2ª cópia do mesmo valor que já tinha sido corrigido no painel privado (`simInvestimento`) nesta sessão, tinha ficado pra trás (achado do usuário: "investimento de R$25.000,00 (padrão) - coloque 14800").

### 2.9 Ícone da aba genérico em links `/solar/<token>`
`404.html` (redirect client-side da URL bonita) só declarava 2 dos 3 ícones (faltava o SVG) — navegador gruda no favicon do instante do redirect e não atualiza depois. Igualado aos outros 2 arquivos (mesmos 3 `<link rel=icon>`, mesma ordem).

### 2.10 Caixa Emagrecimento sem saldo — aporte mensal que faltou lançado
Achado do usuário ("a caixa tem saldo"): a caixa foi criada em 12/08, depois da virada do ciclo (25/07) — nunca recebeu o aporte mensal automático que as outras caixas operacionais recebem na virada. Saldo real era R$0,00 (a única entrada tinha sido um repasse avulso da sobra Wärtsilä que coincidentemente cobriu a 1ª compra). Lançado `TX000318` (SQL direto, confirmado com o usuário antes) — entrada de R$278,89 em 25/07/2026, categoria "Aporte de Salário", mesmo padrão das outras caixas. Saldo real hoje: R$278,89.

### 2.11 Ícone da aba quebrado de novo em `/solar/<token>` — 2º bug real, diferente do de 2.9
Usuário reportou print mostrando o ícone genérico na aba do navegador ao abrir um link de compartilhamento solar real. A correção de 2.9 (favicon faltando no `404.html`) já tinha resolvido um bug real, mas era outro: `solar-compartilhado.html` (o arquivo que de fato renderiza, depois do redirect do `404.html`) declarava os 3 `<link rel="icon">` com caminho **relativo** (`assets/images/...`) — como a página é servida em `/solar/<token>/`, o navegador resolvia pra `/solar/assets/images/...`, que não existe (404 silencioso). Corrigido pra caminho absoluto (`/assets/images/...`) nos 3 links. Validado ao vivo em produção (`javascript_tool` na página real, com um token inválido de teste): os 3 `href` computados resolvem pra `https://wallacelira.com.br/assets/images/...`. Commit `6b8d7d6`.

### 2.12 F5 no painel nunca voltava pra mesma aba (feature já existia desde 10-11/08, nunca funcionava de verdade)
Usuário reportou: "quando recarrego a página sempre volta para o dashboard, eu quero que fique na mesma página". Achado real: o mecanismo de restauração de aba (`sessionStorage.wallaceAbaAtual` + `wallaceEhReload()`, `Sistema_Wallace_Lira_Completo.html`) checava se o **próprio arquivo do painel** tinha sido recarregado — mas esse arquivo só existe dentro de um `<iframe>` recriado do zero pelo `index.html` a cada login/carregamento, nunca sofre um "reload" de verdade na visão dele. A checagem sempre dava falso, e pior, apagava a aba salva no fim do boot achando que era "entrada nova". Corrigido pra checar `window.top.performance` (a navegação de `index.html`, que é quem realmente sofre o F5) em vez da navegação do próprio iframe. Commit `f480db5`.

### 2.13 WWI (Wallace Wealth Intelligence) — módulo novo completo: relatório executivo patrimonial vivo, regenerado mensalmente
Pedido do usuário, depois de já ter recebido um "Tactical Wealth Report" avulso como artefato numa conversa anterior: "não crie apenas um relatório, crie um módulo permanente... o usuário NÃO quer PDF estático, quer um relatório vivo, regenerado automaticamente a cada mês". Plano completo em `docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md` — resumo aqui.

Decisões confirmadas com o usuário (`AskUserQuestion`, todas na opção recomendada): competência = **ciclo financeiro** do sistema (25→24, mesma chave de `VARS.cicloAtual`), não mês calendário; **quem escreve o snapshot é um job mensal automatizado** (GitHub Actions, service_role), nunca o clique do botão (client-side só tem chave `anon`); **motor de narrativa é regras/templates determinísticos**, sem LLM externo (nenhuma integração de IA de terceiros existe no projeto, risco de alucinação de número inaceitável); **PDF continua só download client-side**, sem Supabase Storage nesta v1.

Implementado: `coletar-dados-relatorio.js` ampliado de 6 pra 15 seções (títulos conferidos um a um contra o HTML real — um deles, "💰 Taxa de Poupança", tinha sido apontado como inexistente por uma checagem inicial errada, corrigida antes de descartar) + 3º extrator de DOM (`_extrairLinhasRotulosInline`, pro formato usado por Meta do Milhão/Passivos/Consórcio Casa Nova/Reserva de Emergência) + os 3 extratores agora rodam sempre e a união vira o resultado. `src/relatorio/gerar-analise-financeira.js` (novo): Wealth Score (0-100, 7 sub-scores ponderados, pesos redistribuídos entre eixos com dado quando algum falta) + 4 índices dedicados + narrativa por regras + comparação histórica com degradação graciosa sem histórico. Botão Download (`index.html`) reescrito: busca `historico_relatorios` pela competência, reutiliza narrativa já salva ou gera na hora só pra exibir, monta PDF de 14 seções.

Tabela `historico_relatorios` + RPC `wwi_upsert_relatorio_mensal` **aplicadas em produção** — upsert idempotente testado com dado fake antes de remover (score/dados_json sobrescrevem, `analise_ia` preserva a narrativa original). Job mensal (`scripts/sync/wwi_gerar_relatorio_mensal.py`, testado com data fake e narrativa fake) + workflow do GitHub Actions criados, calculando os mesmos indicadores via SQL direto nas views V2 (não tem navegador pra fazer scraping de DOM) — cobertura parcial documentada onde não há fonte SQL confiável ainda (ex. "Total operacional"), nunca fabricando dado.

**Pendência real, só o usuário pode resolver**: falta criar o agendamento mensal (dia 25) no painel do cron-job.org apontando pro novo workflow — mesmo mecanismo já usado pelos outros jobs, agente não tem acesso a essa conta externa. Até lá, o job só roda via disparo manual na aba Actions do GitHub. Commit `38d00c4`/`247a107` (com merge).

### 2.14 WWI — agendamento criado, testado ao vivo, e 1º bug real da automação achado e corrigido no mesmo teste
Continuação da 2.13 (mesmo dia). Usuário abriu o cron-job.org com uma aba do Browser pane já autenticada (sessão dele, não do agente) e pediu pra fazer — "está na tela, pode fazer você". Cronjob "WWI - Relatório Mensal" criado clonando um cronjob existente (`Clone` no menu de Ações) pra herdar token/headers do GitHub sem o agente nunca ver a credencial — só trocado Título, URL (`.../wwi_regenerar_relatorio_mensal.yml/dispatches`) e agendamento (opção nativa "Every 25. of the month at 9:00", crontab `0 9 25 * *`, fuso America/Sao_Paulo). Confirmado nas "Next executions" antes de salvar.

No meio do clique em "Test Run" a sessão do Browser pane caiu (não foi ação do agente — a sessão de preview reiniciou sozinha). Usuário disparou o teste manualmente por conta própria depois. **Rodou de ponta a ponta**: heartbeat `sucesso` em `execucoes_jobs`, snapshot da competência `2026-07` gravado em `historico_relatorios` com números batendo exatamente com os calculados manualmente antes (patrimônio líquido R$471.458,31, reembolso Wärtsilä 95,4% recuperado, R$340 pendente).

**1º bug real da automação, achado conferindo célula a célula em vez de aceitar cego**: `consorcioCasaPagoPct` gravou `42` quando o real é `0,42%` — a view `vw_patrimonio_v2.consorcio_casa_pago_pct` já devolve o percentual pronto (confirmado contra `consorcio_auto_pago_pct = 75.22`, também literal), mas o script tinha uma heurística (`*100 se <=1`) pra converter fração-0-a-1, que só quebra quando o percentual real É pequeno — exatamente o caso real agora, por isso nenhum teste anterior com dado fake tinha pego. Corrigido no código (heurística removida) e a linha já gravada corrigida via SQL direto (`created_at` preservado, `analise_ia` preservada, `score` recalculado de 58 pra 53). Commit `0886352`.

Detalhe completo em `docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md` seção 7.

## 3. Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Se `git fetch`/`push`/worktree falhar com erro de ref/objeto corrompido: o bug antigo (Drive sincronizando `.git/`) deveria estar resolvido de vez desde 14/08 (regra 6 acima) — se voltar mesmo assim, é achado novo, investigar a fundo antes de assumir que é "o mesmo de sempre".
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. Retomar pela seção 1 — a pendência mais concreta é testar o relatório PDF ao vivo (1.3).
6. **Sempre que "atualizar passagem de turno" for pedido**: checklist completa da seção 10 do `docs/MANUAL_OPERACIONAL_AGENTES.md`. Nesta sessão, avaliado e **não necessário** atualizar os 2 arquivos do Google Drive — nada mudou que afete premissas do Claude Chat (nenhum domínio V2 novo, nenhuma regra de negócio nova, nenhuma exceção formal nova; o manual operacional em si não foi editado). Reavaliar esse julgamento a cada sessão, não assumir que continua válido.
