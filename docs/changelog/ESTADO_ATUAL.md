# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 17/08/2026, bloco 20 (atualizado com a 2ª metade da sessão — parte da noite). Resumo: sessão longa e inteiramente ao vivo — modelo de geração solar (curva de elevação), automação de cotação de opções (PETR4 + ITUB4 + qualquer ativo B3 via fallback), integração completa do medidor de energia Tuya do apartamento (sondagem → produção → 3 refinamentos de gráfico por feedback direto → detecção de travamento → cron dedicado → runbook pra replicar em outras casas), busca global corrigida, e a 2ª metade da noite: página compartilhada (`solar-compartilhado.html`) trazida à paridade com o painel privado (medidor Tuya, Rateio Solar completo, barra de progresso). **⚠ PENDÊNCIA ATIVA E URGENTE**: a própria página compartilhada ficou travada em "Carregando..." depois dessas adições — ver seção 4.0, é a prioridade #1 da próxima sessão. **Tudo deste bloco já está commitado e publicado em `origin/main`** (commits `b720064` → `4105ab9`, ver lista completa no `PASSAGEM_DE_TURNO.md`). Nada pendente de commit no momento desta reescrita — mas o bug da página compartilhada segue ATIVO e não confirmado como resolvido.

## 0. Bloco 20 (17/08/2026) — modelo solar + medidor Tuya em produção + cotações de opções ampliadas

### 0.1 Modelo de geração solar — curva de elevação real (commits `b720064`, `f37ddee`)
Selo "Hoje" (Qualidade da Geração) sempre mostrava falso "abaixo do esperado" de manhã e "acima do esperado" à tarde — causa: comparação linear ("regra de 3") contra uma janela fixa 05:30-18:00, quando a geração solar real segue uma curva em S. Substituído por `__fracaoAcumuladaCurvaSolar()`: calcula o ângulo de elevação solar real (fórmula PVEducation/NOAA) na coordenada EXATA do gerador, a cada 10min do dia. Coordenadas corrigidas de geocodificação por endereço (Nominatim, ~2,8km de erro) pra GPS real exportado do app Sun Surveyor pelo usuário (`-7.215406, -35.856661`). Limiar de classificação ajustado depois (115%→110%, ver 0.4).

### 0.2 Correções ao vivo (commit `c47b4db`)
- Badge "Queda Total" dessincronizado do gráfico ao lado — causa: `hydrateSimuladorCiclo()` faltava na cadeia de re-hidratação depois do recálculo de `REG.evolucao.*` (mesma classe de bug já corrigida antes nesta sessão). Corrigido + badge novo "Deste → próx. ciclo" (queda ciclo-a-ciclo, pedido do usuário).
- Crédito KMV Ipiranga confirmado desatualizado (R$400 estava certo, usuário só viu página velha em cache).

### 0.3 Cotação de opções automatizada — PETR4 + ITUB4, 2 fontes (commits `8b0002b`, `db29aae`/`ba4ece5`)
1ª versão: só PETR4 via brapi.dev (endpoint de opções só libera sem token esse ativo-objeto). Usuário rejeitou a limitação ("não pode ser só PETR4") — pesquisei alternativas (OpLab: só no plano pago R$97-185/mês) e achei `opcoes.net.br`, que publica tabela de cotação pública (últimos 5 pregões, EOD, sem login) pra qualquer opção da B3. Robô agora tenta brapi primeiro, cai pro scraping quando a brapi exige token — ITUBT424 testado localmente, retornou R$2,63 batendo com o site. Ver `docs/decisions/COTACOES_OPCOES_AO_VIVO_PETR4.md` pro trade-off completo (scraping é mais frágil que API oficial, usuário optou por essa via sabendo disso).

### 0.4 Medidor de energia Tuya — apartamento do Wallace, Fase 2 completa (commits `8ba59a7` → `ba4ece5`)
**O grosso do dia.** Resumo executivo (detalhe completo em `docs/decisions/INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md`):

1. Sondagem → descoberta de que o produto (`EKAZA Medidor de Transf de corrente 80A`, OEM genérico) precisava do modo **"DP Instruction"** no painel Tuya pra devolver dado (nunca teve schema "Standard" registrado) — sem essa troca, `getstatus()` voltava vazio mesmo com o aparelho Online.
2. Backend de produção: tabela `medidor_tuya_leituras`, RPC `atualizar_medidor_tuya`, robô Python, workflow — RLS igual ao domínio Solar (JWT Firebase, não público).
3. Card "⚡ Medidor de energia do apartamento" — criado na aba Painel, **movido pra aba Solar** no mesmo dia (usuário confirmou: é o apartamento dele, mesma unidade da seção "Economia antes × depois").
4. **Consumo diário calculado e persistido no PRÓPRIO BANCO** (tabela `medidor_tuya_consumo_diario` + trigger `trg_medidor_tuya_consumo_diario`) — substituiu uma 1ª versão que buscava até 5000 leituras brutas e recalculava tudo no navegador a cada carga de página.
5. Gráfico "Consumo real × crédito que cabe a você" — **refinado 3x por feedback direto do usuário**: (a) 1ª versão misturava com geração da usina no gráfico "Geração por dia" — revertida (só 1 dos 3 medidores da família está online, misturar ainda não faz sentido); (b) 2ª versão comparava contra consumo ESPERADO (fatura antiga) — trocada por CRÉDITO (71% do gerado, usuário foi explícito: "pedi pra cruzar o medidor com os créditos"); (c) 3ª versão agrupava por mês calendário — corrigida pro ciclo real da GD (fecha dia 8, não dia 1) depois do usuário apontar "o ciclo de agosto fechou dia 8, toda geração agora é pro próximo ciclo".
6. **Achado real em produção**: o medidor ficou horas reportando valores idênticos (travado do lado do próprio aparelho/nuvem Tuya, confirmado que o app Smart Life mostrava o mesmo travamento) — resolvido com reset físico do disjuntor. Detecção automática desse cenário adicionada ao card (mesmo valor por 60min+ = aviso vermelho).
7. **Achado sobre a arquitetura de automação deste sistema**: `executar_tudo.yml` quase não dispara sozinho na prática (10 execuções, todas manuais) — o padrão que realmente funciona é cada workflow ter sua PRÓPRIA tarefa no cron-job.org. Medidor ganhou tarefa dedicada (10min, mesmo padrão do robô SAJ).

### 0.5 UI — barra de abas travada no desktop (commits `b12b6f2`, `4b667c0`)
`.master-tabs` rola liso no touch, mas mouse/trackpad não geram gesto horizontal por padrão — "+ Lançar" ficava cortado sem jeito óbvio de rolar. Corrigido em 2 camadas: roda do mouse converte pra `scrollLeft` (1ª tentativa, funcional mas não descobrível sozinha) + setas ‹› visíveis (sticky dentro do próprio scroll da barra, aparecem só quando há overflow).

### 0.6 Financeiro — categorização + registros manuais
3 transações pendentes categorizadas via SQL direto (não passou por commit de código): `TX000337` (Pluggy, saque pra boletos) → Boletos; `TX000328` (Megpharma Drugstore) → Saúde + regra nova de classificação automática; `TX000331` (MercadoLivre - L3Decor) → Compras Online. Badge de categorização deve virar 414/414 no próximo carregamento. Glicose (82 mg/dL) e pressão (138/95, pulso 88) registradas. 2 compras manuais lançadas (Galeteria Ki-Frango, Caixa Variável, cartão final 1371).

### 0.7 Incidente técnico — Google Drive Desktop caiu no meio da sessão
Drive `G:` sumiu (processo `GoogleDriveFS.exe` parado por completo, não travado). Diagnosticado via `Get-PSDrive`/`Get-Process` (nenhum processo Google rodando), reiniciado (`Start-Process GoogleDriveFS.exe`), aguardado remontar (~1min). **Nenhum arquivo/trabalho perdido** — confirmado `git status` limpo antes e depois. Não houve edição em andamento no momento da queda.

### 0.8 Legenda com valor em vermelho + correção de data de ciclo (commits `f463dcb`, `9acfaf5`)
Legenda do gráfico "Geração por dia" ganhou a média real de geração e o consumo médio somado das 3 casas (21,11 kWh) em `<strong style="color:var(--red)">`, pedido do usuário pra destacar os dois números que mais importam de relance. Depois, o usuário flagrou a nota nova "cobertura do ciclo total" (`hydrateSimuladorCiclo`/Onda5) mostrando 232,25 kWh — a fórmula supunha ciclo GD sempre abrindo dia 8 do calendário; o ciclo real deste mês abriu 07/08 (`vw_ciclo_solar_aberto.data_inicio`). Corrigido pra sempre buscar a data real via `WallaceFinanceService.getCicloSolarAbertoV2()`, nunca mais supor recorrência fixa de calendário. Aproveitado o mesmo commit pra aumentar a fonte/padding das abas principais (`.master-tabs`), que o usuário achou "pequenas, sem destaque".

### 0.9 Gráfico "Consumo real × crédito" — 3 refinamentos por correção direta do usuário (commits `c8f1320`→`17ccf7b`, depois `1b70108`)
Pedido original: "comparando o consumo real do medidor com a quantidade de crédito que me cabe (71%)". 3 rodadas de correção até ficar certo: (1) 1ª versão misturou com a geração da usina no gráfico "Geração por dia" — revertida, usuário: "por enquanto algo só do meu apartamento, os outros 2 medidores ainda não existem"; (2) 2ª versão comparava contra consumo ESPERADO (fatura antiga) — usuário: "eu não pedi pra cruzar a fatura com o medidor, pedi pra cruzar o medidor com os CRÉDITOS" — trocado pro crédito real (71%); (3) 3ª versão agrupava por mês calendário — usuário, olhando o print: "o ciclo de agosto fechou dia 8, esqueceu? toda geração agora é pro próximo ciclo" — trocado pro ciclo real da GD como eixo. Por fim, usuário achou o gráfico Chart.js "muito feio" (1 categoria, escalas muito diferentes: 137kWh × ~1kWh) — trocado pelo mesmo padrão visual já usado no Fluxo 1/Fluxo 2 (seção 03): barra de progresso + grade de KPIs, sem Chart.js.

### 0.10 Busca global — cobertura generalizada (commit `d907a0a`)
Usuário: "as alterações novas e menus novos não estão sendo achados na pesquisa, todos os dados devem poder ser achados". `construirIndiceBuscaGlobal()` (`dashboard-navegacao.js`) só cobria 2 dos 3 padrões de título de card em uso no HTML — adicionado o 3º padrão (`.card > div:first-child[style*="font-weight:600"]`, títulos em negrito puro). Correção geral, não só pros 2 cards que o usuário reportou.

### 0.11 Runbook pra replicar o medidor Tuya em novas casas (commits `aad2be1`, `9f5298c`)
Usuário vai mandar medidores iguais pra irmã e pro cunhado instalarem nas casas deles. Criado `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md` (depois generalizado de "só a irmã" pra "qualquer casa nova" quando o cunhado também entrou). Cobre: o que muda por casa (conta Smart Life, Device ID), o passo crítico "DP Instruction" no painel Tuya (sem ele a API devolve vazio, mesmo com o aparelho Online), o schema de DPs esperado, e o checklist de código pra quando o Device ID real de cada casa chegar (secrets `TUYA_*_<CASA>`, cron dedicado, coluna `casa` no banco). **Trabalho de código em si fica pra quando o Device ID real existir — não adiantar.**

### 0.12 Página compartilhada trazida à paridade com o painel — e QUEBROU (commit `5739631`, tentativa de correção `fd99229`)
Sequência de pedidos do usuário, todos atendidos no mesmo commit grande: RPC `consultar_solar_compartilhado` ampliada 2x (expõe `medidorTuyaUltima`/`medidorTuyaCicloBase`/`medidorTuyaConsumoDiario`, mesmo padrão SECURITY DEFINER, nenhum dado financeiro exposto) + `solar-compartilhado.html` ganhou: card "⚡ Consumo em tempo real Apartamento Wallace" (medidor Tuya), gráfico "Rateio Solar" completo (12 meses, 4 séries, cópia deliberada do painel privado — página é autocontida por design), tabela "Histórico de ciclos fechados", card "Consumo real × crédito" (mesma barra de progresso do 0.9), legenda da "Geração diária" com número em vermelho, lista de links ativos agora com "abrir"/"copiar" clicáveis (token nunca virava URL antes).

**Depois desse commit, a página compartilhada em produção ficou travada em "Carregando..." pra sempre** (usuário: "o compartilhado não sai disso" / "ainda não abre"). Backend confirmado funcionando (curl direto na RPC com a mesma anon key pública que a página usa → 200 OK, dado real). Causa raiz **ainda não confirmada**: a função `carregar()` só tinha `try/catch` em volta do `fetch()` — todo o bloco de renderização (template HTML + 3 gráficos Chart.js), que é onde as adições de hoje entraram, não tinha proteção nenhuma; qualquer exceção ali travava a página sem nenhum erro visível (só no DevTools, que o usuário não abre). Verificação manual de sintaxe (contagem de chaves/parênteses/crases respeitando strings/comentários/template literals aninhados, script Python dedicado) não achou desbalanceamento nenhum; também não há nenhuma string `</script` escondida em comentário/texto que cortaria o `<script>` cedo (outra causa clássica desse sintoma, descartada). Automação de navegador headless (Edge) tentada 2x pra pegar o erro real — abandonada: ambiente é Edge corporativo/gerenciado (políticas vazando mesmo com `--user-data-dir` isolado), 1ª tentativa sem isolamento chegou a vazar dado do perfil real do usuário no log (revertido/avisado, nenhum processo do usuário foi tocado), 2ª tentativa isolada ainda deu `--dump-dom` de 0 bytes.

**Correção aplicada (commit `fd99229`, ainda não confirmada como suficiente)**: envolvido TODO o corpo de renderização de `carregar()` (do `dados = await resp.json()` até o fim da função) num `try/catch` que agora mostra o erro real na tela (`renderErro()` deixou de descartar mensagens custom — antes só reconhecia 3 chaves fixas e caía num texto genérico sempre que a mensagem não batia com nenhuma delas). **Usuário reportou que o problema persiste mesmo depois desse fix e do push.** Hipóteses não descartadas pra próxima sessão, em ordem de probabilidade: (a) cache de CDN/navegador servindo a versão anterior do arquivo (GitHub Pages + possível CDN na frente do domínio custom `wallacelira.com.br` — testar com `?token=...&_cb=<qualquer coisa>` pra forçar bypass de cache, ou pedir hard refresh Ctrl+Shift+R); (b) o `fetch()` em si ficando pendurado sem nunca resolver/rejeitar (não seria pego nem pelo try/catch do fetch nem pelo novo, já que nenhum dos dois cobre uma promise que nunca resolve — nesse caso um `AbortController`/timeout precisaria ser adicionado); (c) algum erro genuíno ainda não identificado no bloco de renderização que o try/catch novo DEVERIA capturar, mas o usuário não reportou o texto do erro que apareceu (se é que apareceu) — **próximo passo obrigatório: pedir print exato da tela/console (F12) depois de um hard refresh**, antes de tentar qualquer outra correção às cegas.

## 1. Bloco 19 (16-17/08/2026) — correções ao vivo + mudança de arquitetura
Commits `5bdc5a1` → `1607121`. Resumo: badge Cotações de ações ignora fim de semana; "Pessoal (s/corporativo)" do Mastercard Black resincronizado (+`recalcularEHidratarMbPessoal()`); gráficos de composição maiores; legenda "Consumo médio" ganhou marcador de cor; aporte Saúde Família recalculado (R$177,50/mês); KMV/Shell Box corrigidos (2 TX novas); tracking pressão/glicose criado (**nunca verificado em navegador real** até a reescrita deste arquivo); tooltips do cabeçalho escurecidos. Mudança de regra de negócio: déficit de caixas (incluindo Caixa Variável) passa a contar excedente de cartão na Necessidade do ciclo — persistido em `indicadores` via RPC `registrar_indicador` nova. Cards "Necessidade × Salário" na Home.

**Nota herdada, ainda válida**: nada do bloco 19 foi validado em navegador real na época — recomendado testar: card Mastercard Black, donut MB, cards Home, ECC, aba Emagrecimento (pressão/glicose), tooltips do cabeçalho.

## 2. Bloco 18 (15-16/08/2026) — auditoria de 9 agentes + Grupo A — FECHADO
Commits `4e5fd1a` → `193da0a`. 21 achados de bug corrigidos/reclassificados; Grupo A do inventário "dado disfarçado de texto" (9 de 9 implementados); Grupo B fora de escopo por decisão do usuário.

## 3. Incidentes técnicos já resolvidos (sem repetição nos blocos 19/20)
- Rebase interrompido pelo Google Drive durante push (bloco 18) — recuperado com `git checkout HEAD -- .`.
- Google Drive Desktop caiu por completo (bloco 20, seção 0.7) — recuperado reiniciando o processo.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **`.git` real fica em `C:\Users\WLI015\.git-repos\Site.git`** (fora da pasta sincronizada pelo Drive) — máquina nova precisa de `git clone` novo. Arquivos do projeto em si ainda podem travar momentaneamente durante rebase (Drive sincronizando) — usar `.claude\git-safe-sync.ps1` (retry automático) em vez de `git pull --rebase`/`push` cru.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (manual seção 1.3.5). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre. O EXCEDENTE (comprometido > saldo) conta na Necessidade do ciclo (regra do bloco 19) — as duas regras coexistem.
9. **Procedimento de baixa da fatura**: `UPDATE` na MESMA linha de `transacoes` (`afeta_saldo_real` false→true). Nunca criar uma segunda transação.
10. **Nenhuma constante financeira nova deve nascer hardcoded no `.js`** se já existe (ou faz sentido existir) lugar correspondente em `parametros_gerais`/`indicadores`.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI**, mas continua FORA da fórmula do Painel Executivo/Balanço.
12. **Inbox Financeira DESATIVADA DA UI** (pedido do usuário) — sincronização continua rodando por baixo. Não reativar sem pedido explícito. Itens ambíguos ficam `pendente` silenciosamente, nunca mais reportados ao usuário (regra reforçada 2x, usuário cansado do assunto).
13. **Leitura manual de `energia_solar_leituras` sempre usa a data/hora REAL da foto**, nunca "hoje" no momento de gravar.
14. **Medidor solar DDSU666 (Casa da Mãe): modelo certo (313270) só libera 25/08/2026.** Não sondar API antes dessa data.
15. **WWI (Wallace Wealth Intelligence) congelado funcionalmente, em observação** desde 15/08/2026. Não abrir fase nova sem evidência real ou pedido explícito.
16. **Necessidade Total Bruta/Líquida persistida em `indicadores`** a cada recálculo — consultável via SQL sem abrir o site (RPC `registrar_indicador`, genérica).
17. **NOVO bloco 20 — Medidor Tuya do apartamento em produção, cron dedicado a cada 10min.** Card na aba Solar (não Painel). Consumo diário/mensal persistido no banco via trigger, não recalculado no navegador. Gráfico "Consumo real × crédito" usa ciclo da GD (dia 8), não mês calendário — não confundir com o "Consumo real neste ciclo" do card (esse usa dia 21, ciclo de FATURA do apartamento — são 2 ciclos diferentes de propósito, ver `docs/decisions/INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md` seção 4/5).
18. **NOVO bloco 20 — `executar_tudo.yml` NÃO é o mecanismo real de automação deste sistema.** Cada workflow individual precisa de sua própria tarefa no cron-job.org apontando pro `dispatches` daquele workflow especificamente — o orquestrador serve só pra disparo manual/teste. Qualquer robô novo criado a partir de agora precisa desse cron dedicado pra rodar sozinho de verdade, não basta adicionar como job dentro do `executar_tudo.yml`.
19. **NOVO bloco 20 — Cotação de opções cobre PETR4 (brapi.dev) e ITUB4 (fallback `opcoes.net.br`, scraping).** Qualquer posição nova de opção entra em `SERIES_MONITORADAS` (`atualizar_cotacoes_opcoes.py`) — o fallback cobre qualquer ativo-objeto da B3, não só esses 2.
20. **NOVO bloco 20 — Limiar `SOLAR_STATUS_LIMITES - acimaApartirDe` mudou de 115% pra 110%** (indicador no Supabase, pedido do usuário).
21. **NOVO bloco 20 — `solar-compartilhado.html` é a única página do site sem `try/catch` completo por padrão** (era só em volta do `fetch`) — corrigido (commit `fd99229`), mas checar se algum outro arquivo autocontido do site tem o mesmo ponto cego antes de assumir que não.
22. **NOVO bloco 20 — Runbook de replicação de medidor Tuya existe** em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`, genérico pra qualquer casa nova (não só a irmã). Trabalho de código (secrets/cron/coluna `casa`) só quando o Device ID real de cada casa chegar — não adiantar.

## 4. Pendências abertas

### 4.0 🔴 URGENTE — página compartilhada (`solar-compartilhado.html`) travada em "Carregando..." em produção
**Bug ativo, não resolvido, prioridade #1 da próxima sessão.** Detalhe completo, causas descartadas e hipóteses restantes em 0.12 acima. Resumo: depois de trazer o medidor Tuya + Rateio Solar completo pra essa página (commit `5739631`), ela parou de renderizar (fica só no "Carregando..."). Backend confirmado OK via curl direto. Adicionado `try/catch` de diagnóstico em volta de toda a renderização (commit `fd99229`) pra mostrar o erro real na tela em vez de travar silenciosamente — **usuário reportou que o problema persiste mesmo depois desse fix**. Não descartar cache de CDN/navegador antes de investigar mais fundo (pedir hard refresh + `?_cb=` novo na URL). Próximo passo obrigatório: conseguir ver o que a tela mostra agora (print) antes de qualquer nova tentativa de correção.

### 4.1 Instalação física do medidor solar DDSU666 — só libera 25/08/2026
Modelo errado (313269, sem RS485) instalado; modelo certo (313270) chega 25/08/2026.

### 4.2 R$340,00 do ciclo Wärtsilä 2026-07 ainda não confirmados como recebidos
Não é a mesma coisa que as TEDs já lançadas (`TX000220`/`TX000280`).

### 4.3 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente.

### 4.4 Backlog técnico adiado (decisão consciente do usuário)
Lint dos ~91 módulos `hydrate-*`.

### 4.5 Pressão/glicose (aba Emagrecimento) — ainda não verificado em navegador real
Herdado do bloco 19, sem atualização nesta sessão.

### 4.6 Consumo real do medidor Tuya × gráfico "Geração por dia" — deliberadamente adiado
Quando o medidor da irmã e o DDSU666 (Casa da Mãe) existirem, revisitar o gráfico "Geração por dia" (seção 04, Solar) pra somar os 3 consumos reais contra a geração real da usina. Não fazer com só 1 dos 3 medidores online (ver `INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md` seção 8).

### 4.7 ENCERRADO — projeto "Agente financeiro no WhatsApp/Telegram"
Construído, testado, e cancelado pelo próprio usuário (custo de API inevitável + não queria rodar processo local). Pastas removidas. Não retomar sem pedido explícito novo e sem deixar claro por escrito, ANTES de codar, que qualquer canal tem custo de API da Anthropic.

## 5. Protocolo de sessão nova

0. **Se a sessão abrir com o bug da página compartilhada ainda aberto (seção 4.0): pedir print da tela/console (F12) ANTES de tentar qualquer correção nova** — a última tentativa (try/catch de diagnóstico, commit `fd99229`) não foi confirmada como suficiente, e sem ver o que a tela mostra agora (ou se ainda é exatamente "Carregando...") não dá pra saber se é cache, um erro ainda não capturado, ou o `fetch` pendurado sem nunca resolver.
1. Este arquivo primeiro, depois os blocos mais recentes de `docs/changelog/PASSAGEM_DE_TURNO.md`.
2. `git status` — não deveria haver nada pendente no momento desta reescrita, mas confirmar sempre.
3. **Testar em navegador real**: nada do bloco 19 foi validado visualmente ainda (pressão/glicose, cards Home, ECC). O bloco 20 (medidor Tuya, gráficos novos) foi validado ao vivo pelo próprio usuário durante a sessão (prints reais conferidos a cada mudança).
4. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: Google Drive sincronizando `.git/` — ver regra 6. Se um rebase travar com entradas "pick" duplicadas (bug raro do `git-safe-sync.ps1`, já visto 2x): `git rebase --abort` (mover arquivos não-commitados pra fora da working tree antes, se o abort reclamar de "untracked files would be overwritten"), depois `git rebase origin/main` direto.
5. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
6. **Sobre o WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
7. Se o medidor Tuya parecer travado de novo (valores idênticos por muito tempo no card), é MUITO provavelmente o aparelho físico, não o código — orientar reset do disjuntor antes de investigar a integração.
