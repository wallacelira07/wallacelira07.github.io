# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 18/08/2026, bloco 24. Resumo: bloco 22 (aportes) + bloco 23 (auditoria noturna, 16 achados) + **bloco 24**: usuário acordou os achados restantes — (a) achado #4 (trava de descompasso do card solar público) resolvido de verdade, não só reportado: coluna `geracao_acumulada_atualizado_em` criada, robô/RPC/painel privado/página compartilhada todos atualizados, trava agora funciona nos 2 lados; (b) 8 dos 9 achados de código morto eliminados (autorizado explicitamente pelo usuário), 1 mantido de propósito (dado real de fatura, não bug); (c) infraestrutura completa preparada pra replicar o medidor Tuya na casa da Wellida — banco multi-casa, robô generalizado, workflow do GitHub, card no painel, tudo pronto exceto o que só pode acontecer depois da instalação física (Device ID real). Site commitado e **publicado em produção** (push feito, ver commits no `PASSAGEM_DE_TURNO.md`).

## 0. Bloco 24 (18/08/2026) — achado #4 resolvido de verdade + código morto eliminado + medidor Tuya da Wellida preparado

### 0.1 Achado #4 (trava de descompasso do card solar público) — resolvido, não só reportado

Investigação mais funda revelou que a trava de segurança do PAINEL PRIVADO também nunca disparava (o campo que ela usa, `geracaoAcumuladaData`, era sempre `null` — "nunca fabricado"). Em vez de deixar como estava, resolvido de verdade nos 2 lados:
- Nova coluna `geracao_acumulada_atualizado_em` (timestamptz) em `energia_solar_leituras` (Supabase).
- `scripts/sync/atualizar_geracao_saj.py` grava esse timestamp real toda vez que atualiza `geracao_acumulada`.
- Bootstrap fetch (`Sistema_Wallace_Lira_Completo.html`) e `app.js` passam a ler o campo real em vez de `null` fixo.
- RPC `consultar_solar_compartilhado` passou a expor `geracaoAcumuladaData` (não expunha antes — a página pública nem teria como implementar a trava sem isso).
- `solar-compartilhado.html` ganhou a mesma trava de 10 dias de descompasso que o painel privado já tinha (código antes só existia lá) — agora os 2 lados se comportam de verdade igual, não só "por acaso os 2 nunca travam".
- **Linhas antigas da tabela ficam com o campo `null`** (não retroagido/estimado, política "SEM ESTIMATIVAS" do projeto) — a trava passa a funcionar de verdade a partir da próxima vez que o robô rodar.

### 0.2 Código morto eliminado (8 de 9 achados, autorizado explicitamente pelo usuário: "pode eliminar")

- `aplicarBoletosVencidosAutomaticamente()` (`app.js`) — removida por completo (já estava desligada desde 12/08).
- `VARS.necessidadeHeld`, `VARS.consorcioAutoQuitacaoValor`, `VARS.mastercardBlackCongelado` — literais órfãos removidos, com comentário explicando onde está o valor real hoje (quando aplicável).
- `renderCapaNav()`/`irParaCapaDestino()`/`CAPA_DESTINOS`/`NOMES_PANE`/`renderPageStrip()` (`dashboard-navegacao.js`) — cluster inteiro removido (nunca executava, containers DOM não existiam).
- `.chart-box.small` — em vez de remover a classe (que os 3 gráficos da aba WWI já usavam), completada a regra CSS que faltava (`height:150px`, com redução mobile igual às irmãs `.tall`/`.wide`/`.tall-lg`) — os 3 gráficos (Meta do Milhão, Casa Nova, Liquidez) agora realmente ficam menores, como o nome da classe sempre sugeriu.

**Não eliminado, de propósito**: `VARS.solarConsumoMaeRecente` (dado real de 3 faturas da Casa da Mãe, comentário already dizia "só como referência/contexto" — não é bug, é dado histórico real que vale manter) e `CycleEngine.js` (~103 linhas testadas, parte de uma arquitetura Fase 5 planejada mas nunca finalizada de conectar — apagar um serviço testado por decisão unilateral de madrugada não parecia prudente; já estava documentado como não-carregado em `CONTRIBUTING.md`/`ARCHITECTURE.md`, não é achado novo).

### 0.3 Medidor Tuya da casa da Wellida — infraestrutura 100% preparada, aguardando só instalação física

Pedido do usuário: "quero a mesma coisa que você fez no site para receber os dados do meu medidor, fazer para minha irmã, crie os mesmos gráficos tabelas tudo igual". Generalizado o domínio inteiro do medidor Tuya (antes só o apartamento do Wallace) pra suportar múltiplas casas:

- **Banco**: `medidor_tuya_leituras`/`medidor_tuya_consumo_diario` ganharam coluna `casa` (default `'wallace'`, retrocompatível 100%). Trigger `trg_medidor_tuya_consumo_diario` e RPC `atualizar_medidor_tuya` generalizados pra respeitar `casa`.
- **Robô**: `scripts/sync/atualizar_medidor_tuya.py` generalizado (env `CASA`, default `wallace`) — mesmo script serve qualquer casa nova, só muda qual conjunto de secrets o workflow do GitHub passa.
- **Workflow novo**: `.github/workflows/atualizar_medidor_tuya_wellida.yml`, espelho exato do do Wallace, apontando pros secrets `TUYA_ACCESS_ID_WELLIDA`/`TUYA_ACCESS_SECRET_WELLIDA`/`TUYA_DEVICE_ID_WELLIDA`/`TUYA_API_REGION_WELLIDA` — **secrets ainda não existem no GitHub**, o workflow falha graciosamente até serem criados, não quebra nada.
- **Painel**: card "⚡ Medidor de energia da Wellida (tempo real)" já existe na aba Solar, mesmos campos/KPIs/gráficos do card do Wallace — reaproveita 100% da mesma função (`aplicarMedidorTuyaPorCasa()`, generalizada em `hydrate-medidor-tuya.js`, zero duplicação de fórmula). Mostra "Aguardando instalação" até a 1ª leitura real chegar.
- **CUIDADO CORRIGIDO NA HORA**: a generalização inicial da RPC mudou o nome do job de heartbeat do Wallace de `medidor_tuya` pra `medidor_tuya_wallace`, o que teria quebrado o monitoramento "Saúde Operacional" já em produção (que procura a chave exata `medidor_tuya`). Corrigido antes de publicar: Wallace continua gravando como `medidor_tuya` (sem sufixo), só casas novas ganham sufixo (`medidor_tuya_wellida`).
- **O que falta é só trabalho físico/manual, documentado em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`**: Wellida instalar o medidor + vincular o app Smart Life dela, pegar o Device ID real no painel Tuya IoT (e mudar pra "DP Instruction" — passo crítico, sem ele a API devolve vazio), criar os 4 secrets no GitHub, disparar o workflow manualmente 1x pra confirmar, só depois criar o cron dedicado.

## 1. Bloco 23 (18/08/2026) — auditoria noturna autônoma (10 agentes, carta branca do usuário)

Usuário pediu "coloque 10 agente trabalhando... procurando bugs inconsistências. Não pare, eu vou dormir e você é o responsável por tudo, você tem autorização e carta branca para agir". Rodei um workflow de 7 agentes finders (1 por dimensão: financeiro, divergência V1×V2, sintaxe JS, paridade solar painel×compartilhado, código morto, UI/CSS, segurança Supabase) seguido de verificação adversarial (1 skeptic por achado, ninguém confia no relato do finder, todos re-checam código/SQL reais). **16 achados, 16 confirmados, 0 descartados.**

**Limite que respeitei mesmo com carta branca** (regra permanente do `CLAUDE.md`, sobrevive a qualquer autorização): nenhuma escrita em tabela financeira (`transacoes`/`caixas`/`caixas_aportes_mensais`) foi feita, e **nenhum commit/push foi dado sem avisar antes**. As alterações que apliquei ficaram só commitadas localmente (a combinar push com o usuário) — as únicas escritas no Supabase foram a tabela `legendas` (texto de UI, corrigido pra bater com o valor real) e um `REVOKE` de segurança (grant desnecessário, não afeta nenhum dado).

**Corrigidos (baixo risco, código/texto/documentação, não financeiro):**
1. Legenda "Saúde Família (R$100/mês)"/"(R$177,50/mês)" dessincronizada do valor real (R$210,83) em 2 lugares (tabela `legendas` do Supabase + fallback local `vars-operacional.js`) — corrigida nos 2.
2. `CLAUDE.md` regra 2 dizia que `wallace_dados` sobrescreve o VARS a cada carga — isso foi removido do código em 12/08/2026 e a regra nunca foi atualizada. Corrigida.
3. Comentários em `hydrate-onda2-v2.js`/`hydrate-onda3-caixalance.js` afirmavam divergência V1×V2 "fechada"/"R$20,00" pra Caixa Manutenção/Lance — remedido hoje deu R$1,07/R$65,54 (esperado, cresce com o tempo pós-migração, mas os comentários davam falsa sensação de medição recente). Comentários atualizados com alerta explícito. **Sem impacto visual** (tela já mostra o valor V2 correto nas 2 caixas).
4. Cor da barra "Consumo esperado Wallace" no gráfico Rateio Solar divergia entre painel privado (`#f0c94a`) e compartilhado (`#e8a63a`) — unificada pro valor do painel privado.
5. `REVOKE EXECUTE` de `trg_medidor_tuya_consumo_diario()` (trigger function que não deveria estar exposta como RPC pública `anon`/`authenticated` — não era explorável na prática, mas era superfície de API desnecessária).

**Não corrigidos, só reportados** (código morto / decisão que não é minha de tomar sozinho) — ver seção 6 abaixo para a lista completa.

## 2. Bloco 22 (18/08/2026) — recálculo de aportes (Saúde Família + Emagrecimento) + padronização de cards

### 0.1 Caixa Saúde Família — aporte recalculado: R$177,50 → R$210,83/mês

Usuário informou a composição completa e real das consultas recorrentes (estava faltando o dentista na versão anterior, de 16/08): 2x Pediatra Júlio (R$390) + 2x Dentista Júlio (R$200) + 1x Ginecologista Vanessa (R$450) + 2x Endócrino Wallace (R$450) = R$2.530,00/ano ÷ 12 = **R$210,83/mês**.

Também corrigida uma divergência pré-existente entre 2 textos do painel que descreviam a composição de forma diferente uma da outra (`hydrate-wartsila-caixas-textos.js` não mencionava o endócrino; `graficos-cenarios-lazy.js` não mencionava o dentista) — agora os dois textos batem.

Arquivos alterados: `src/financeiro/caixas/vars-caixas.js` (`aporteSaudeFamilia`), `src/financeiro/cartoes/hydrate-wartsila-caixas-textos.js` (texto `cxSaudeAporteTxt`), `src/dashboard/charts/graficos-cenarios-lazy.js` (texto `saudeFamilia.notaFn`). Tabela `caixas_aportes_mensais` (Supabase) atualizada.

**Não alterado de propósito**: a transação TX000147 (R$135,00, já lançada em 24/07 neste ciclo com o valor antigo) não foi reescrita — é lançamento histórico confirmado. Usuário optará depois se complementa com um aporte extra (R$75,83) neste ciclo ou deixa o valor novo valer só a partir do próximo aporte mensal.

### 0.2 Emagrecimento — aporte recalculado: R$278,89 → R$490,00/mês

Preço da caneta Ozivy/Semaglutida subiu de R$278,89 para R$490,00. Usuário tem 3 canetas em estoque (2x 0,25mg — uma delas com 1 aplicação perdida, compensada com dose extra — + 1x 0,5mg), então **não deve comprar caneta nova no próximo ciclo (e possivelmente no seguinte)** — mas isso não muda o aporte mensal reservado, só adia a próxima compra real.

Arquivo alterado: `src/financeiro/operacional/vars-operacional.js` (`saudeEmagrecimentoAporte`). Tabela `caixas_aportes_mensais` (Supabase) atualizada.

### 0.3 Bens Duráveis, Boletos, Fundo de Suavização — CONFIRMADOS já corretos, zero mudança de código

Usuário pediu recálculo dos 3, mas a investigação (código + SQL direto no Supabase) confirmou que já estavam certos:
- **Bens Duráveis**: R$250/mês já é exatamente meta R$3.000 ÷ 12 (mesma lógica pedida: "mesma medida da Caixa Saúde").
- **Boletos**: meta/teto já é R$4.550,77 desde 11/08/2026 (bloco anterior), já incluindo os 2 consórcios Porto (Casa R$1.449,45 + Auto ~R$501,32) migrados do Mastercard Black. Confirmado via SQL na tabela `financiamentos`. "O teto dela é o aporte mensal" já é a regra vigente.
- **Fundo de Suavização**: confirmado que não tem aporte fixo, só teto (R$12.000, `VARS.metaSuavizacao`).

Só os campos `fonte`/`vigencia` dessas 3 linhas na tabela `caixas_aportes_mensais` (Supabase) foram atualizados para registrar a confirmação de 18/08.

### 0.4 Cards da seção "Todas as Caixas" — tamanho padronizado (pedido repetido do usuário)

Causa raiz: só 6 das ~14 caixas (Bens Duráveis, Manutenção, Eventos, Saúde Família, Churrasco, Emagrecimento) podem ganhar um bloco extra "Comprometido no cartão/Disponível real" (aparece só quando há valor comprometido no ciclo, ver `hydrate-comprometido-caixas-tematicas-v2.js`) — o grid já esticava as alturas DENTRO de uma mesma fileira (comportamento correto, documentado desde 14/08), mas a fileira que calhasse de ter uma caixa com esse bloco ficava mais alta que as outras fileiras.

Corrigido com `min-height:168px` escopado à nova classe `.caixas-grid` (`assets/css/styles.css`), aplicada aos 2 grids da seção 05 em `Sistema_Wallace_Lira_Completo.html` — reserva o espaço do bloco extra em toda fileira, não só na que precisa.

**Não testado visualmente ao vivo** (painel exige login Firebase, não acessível pelo agente) — `min-height` estimado a partir das variáveis CSS existentes (padding do `.card`, tamanhos de fonte, espaçamento do bloco comprometido). Se sobrar espaço vazio grande demais ou continuar cortando, ajustar o valor.

### 0.5 Verificação pontual — 3 empréstimos internos (LREI) ativos, confirmado real

Usuário perguntou se o alerta "3 empréstimo(s) interno(s) ativo(s) — mais antigo com 25 dias" batia com a realidade. Confirmado via SQL direto em `vw_emprestimos_internos_v2` (Supabase): **sim, são 3 reais** — LREI0003 (24/07, R$266,23), LREI0004 (07/08, R$103,55), LREI0005 (11/08, R$1.950,77), todos ATIVO. O mais antigo (LREI0003) tem exatamente 25 dias hoje (18/08). O mecanismo de verificação já é 100% automático (busca a lista direto do Supabase a cada carregamento, `hydrate-onda4-lrei.js`, com severidade em 3 níveis por idade em `hydrate-qualidade.js`) — nada precisou ser automatizado, já não havia número hardcoded.

## 3. Bloco 21 (18/08/2026) — bug do compartilhado resolvido de verdade + projeto DDSU666/SAJ do zero

Resumo (detalhe completo no `PASSAGEM_DE_TURNO.md`): bug crítico do `solar-compartilhado.html` (travamento "Carregando..." eterno) resolvido de verdade — causa raiz era erro de sintaxe JS (crase de Markdown dentro de comentário HTML dentro de template literal gigante), não os problemas de execução corrigidos em tentativas anteriores. Projeto novo do zero: medidor DDSU666 ligado direto no inversor SAJ do usuário, investigação completa sobre a exigência do "Kit SEC" (não é exigível, confirmado por 4 manuais oficiais), firmware ESP32 pronto pra quando o hardware chegar (25/08/2026).

## 4. Bloco 20 e anteriores

Ver `PASSAGEM_DE_TURNO.md` para o histórico completo — nenhuma mudança nesta sessão nos itens desses blocos.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **`.git` real fica em `C:\Users\WLI015\.git-repos\Site.git`** (fora da pasta sincronizada pelo Drive) — máquina nova precisa de `git clone` novo. Usar `.claude\git-safe-sync.ps1` (retry automático) em vez de `git pull --rebase`/`push` cru — se ele recusar com erro fora do padrão conhecido, resolver manualmente (`git stash` do que estiver bloqueando, rebase, `git stash pop`) em vez de insistir cru.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (manual seção 1.3.5). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre.
9. **Procedimento de baixa da fatura**: `UPDATE` na MESMA linha de `transacoes` (`afeta_saldo_real` false→true). Nunca criar uma segunda transação.
10. **Nenhuma constante financeira nova deve nascer hardcoded no `.js`** se já existe (ou faz sentido existir) lugar correspondente em `parametros_gerais`/`indicadores`.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI**, mas continua FORA da fórmula do Painel Executivo/Balanço.
12. **Inbox Financeira DESATIVADA DA UI** — itens ambíguos ficam `pendente` silenciosamente, nunca mais reportados ao usuário.
13. **Leitura manual de `energia_solar_leituras` sempre usa a data/hora REAL da foto**, nunca "hoje" no momento de gravar.
14. **Medidor solar DDSU666 (Casa da Mãe): modelo certo (313270) só libera 25/08/2026.** Não sondar API antes dessa data. Não confundir com o medidor DDSU666 do bloco 21 (ligação direta no inversor SAJ do usuário) — mesma família de hardware, contextos diferentes, mas podem ser o mesmo evento físico (medidor chegando 25/08).
15. **WWI (Wallace Wealth Intelligence) congelado funcionalmente, em observação** desde 15/08/2026. Não abrir fase nova sem evidência real ou pedido explícito.
16. **Necessidade Total Bruta/Líquida persistida em `indicadores`** a cada recálculo — **atenção**: os recálculos do bloco 22 (Saúde Família/Emagrecimento) mudam a Necessidade, mas o valor persistido só atualiza no próximo carregamento do painel logado (agente não tem como disparar isso sem login) — não é bug, é auto-correção pendente do próximo acesso do usuário.
17. **Medidor Tuya do apartamento em produção**, cron dedicado a cada 10min. Card na aba Solar.
18. **`executar_tudo.yml` NÃO é o mecanismo real de automação deste sistema.** Cada workflow precisa de tarefa dedicada no cron-job.org.
19. **Cotação de opções cobre PETR4 (brapi.dev) e ITUB4 (fallback `opcoes.net.br`, scraping).**
20. **Limiar `SOLAR_STATUS_LIMITES - acimaApartirDe` é 110%** (não mais 115%).
21. **`solar-compartilhado.html` confirmado funcionando** desde o bloco 21 — se o usuário reportar travamento de novo, não repetir as mesmas 3 tentativas já feitas; ler o console do navegador real primeiro.
22. **Runbook de replicação de medidor Tuya existe** em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`.
23. **Kit SEC da SAJ não é exigível pra função básica de medidor+export limitation**, confirmado por 4 manuais oficiais. SAJ recusou dar suporte à integração — não insistir em contato com eles.
24. **Firmware ESP32 pro DDSU666/SAJ está pronto** em `firmware/esp32_ddsu666_saj/`, aguardando só a chegada física do hardware (25/08/2026). Mapa de registradores Modbus: SEMPRE `4000H`/`400AH` (monofásico), nunca `101EH`/`1028H` (trifásico, erro já descartado).
25. **NOVO bloco 22 — tabela `caixas_aportes_mensais` (Supabase) é a fonte única de verdade dos aportes mensais de todas as caixas**, acessível por qualquer agente (Claude Chat, Claude Code, Copilot). Ver seção 5 abaixo para o snapshot completo. Manter atualizada junto com qualquer mudança de aporte no código (VARS.*).
26. **NOVO bloco 22 — cards da seção "Todas as Caixas" usam `.caixas-grid` (CSS) pra manter altura uniforme.** Se algum card ficar visivelmente errado (muito vazio ou cortando conteúdo), ajustar `min-height` em `assets/css/styles.css` — não foi testado ao vivo (exige login).

## 5. Pendências abertas

### 3.1 Instalação física do DDSU666 (SAJ, ligação direta no inversor) — aguardando hardware chegar
Material comprado pelo usuário (ESP32, MAX485, fonte, jumpers, caixa). Firmware pronto e testado (parte que dá pra testar sem o medidor — WiFi conecta OK). Falta: hardware chegar, reconfigurar o medidor pra protocolo Modbus (botões físicos), fazer a fiação, testar leitura real, fechar a instalação.

### 3.2 R$340,00 do ciclo Wärtsilä 2026-07 ainda não confirmados como recebidos
Não é a mesma coisa que as TEDs já lançadas (`TX000220`/`TX000280`).

### 3.3 LREI0003/LREI0004/LREI0005 seguem ativas (confirmado real, 18/08)
R$266,23 (Fatura MP) + R$103,55 (Manutenção) + R$1.950,77 (Boletos, 1º mês da migração dos consórcios). Usuário optou por deixar como está — tendem a normalizar no próximo ciclo. Não é pendência de ação, só acompanhar.

### 3.4 Backlog técnico adiado (decisão consciente do usuário)
Lint dos ~91 módulos `hydrate-*` — análise estática de qualidade de código, não é bug, adiado por decisão própria do usuário. Não reabrir sem pedido novo.

### 3.5 ENCERRADO — projeto "Agente financeiro no WhatsApp/Telegram"
Cancelado pelo usuário em 17/08, revisitado e reconfirmado inviável (ESP32 não serve de servidor) no bloco 21. Usuário ainda não respondeu se topa os 2 motivos originais do cancelamento (custo de API inevitável + precisa rodar 24/7 em algum lugar) — **não retomar sem essa confirmação explícita**.

### 3.6 Necessidade Total Bruta/Líquida — recálculo pendente de próximo login (não é bug)
Os recálculos de aporte do bloco 22 (Saúde Família R$177,50→R$210,83, Emagrecimento R$278,89→R$490,00) mudam a Necessidade do ciclo, mas o valor persistido em `indicadores` só atualiza no próximo carregamento do painel com o usuário logado — regra 16 acima.

## 6. Snapshot da tabela `caixas_aportes_mensais` (Supabase) — 18/08/2026 (revisado após 2ª rodada)

Fonte única de verdade dos aportes mensais, consultável por qualquer agente sem precisar ler código. **2ª rodada de correção no mesmo dia**: usuário apontou que Churrasco/Combustível/Eventos/PIX Vanessa tinham aporte real e estavam marcadas erradas como "sem aporte fixo" — a 1ª varredura só tinha procurado por `VARS.aporte*` (constantes/fórmula), não pegou transações recorrentes literais repetidas todo ciclo (`TX0001xx "Aporte mensal (salário Wärtsilä)"`). Ao reconferir, achei que Manutenção tinha o mesmo problema (não reportado pelo usuário, achado por conta própria) e corrigi junto. Caixa Variável (R$2.000, TX000137) ficou em dúvida por ter mecanismo diferente (teto oficial, não meta acumulada) — usuário confirmou que conta como aporte fixo mesmo assim.

| Caixa | Aporte mensal | Tipo | Vigência |
|---|---|---|---|
| Caixa Boletos | R$4.550,77 | contínuo | sem data de término |
| Caixa Variável | R$2.000,00 | contínuo | sem data de término (mecanismo de teto oficial, confirmado pelo usuário como aporte fixo mesmo assim) |
| PIX Vanessa | R$1.200,00 | contínuo | sem data de término |
| Escola de Júlio (fase 2027) | R$839,64 | temporário | Jan/2027 a Nov/2027 (ciclo 6≤i≤16) |
| Caixa Seguro Emplacamento | R$425,00 | contínuo | sem data de término |
| Emagrecimento | R$490,00 | contínuo | sem data de término |
| Escola de Júlio (ciclo atual) | R$500,00 | temporário | completa Nov/2026 (01/11), ciclo i<4 |
| Caixa Bens Duráveis | R$250,00 | contínuo | sem data de término |
| Caixa Saúde Família | R$210,83 | temporário | projeta completar ~Nov/2027 (ciclo i<16) |
| Caixa Aniversário Júlio | R$200,00 | temporário | completa Set/2026 (14/09), ciclo i<2 |
| Caixa Combustível | R$200,00 | contínuo | sem data de término |
| Caixa Eventos | R$166,67 | contínuo | sem data de término |
| Caixa Manutenção | R$166,67 | contínuo | sem data de término |
| Caixa Churrasco | R$100,00 | contínuo | sem data de término |
| Caixa Lance, Mastercard_Infinite, Mercado Pago, Wartsila, Conta Suavização, PIX Geral Vanessa | — | sem aporte fixo | financiadas por outra fonte (juros repassados/reembolso, reconciliação de fatura, ou só têm teto sem aporte, caso da Suavização — R$12.000) — conferidas transação a transação, nenhuma tem linha "Aporte mensal" recorrente |

## 7. Achados da auditoria noturna NÃO corrigidos (decisão do usuário antes de agir)

Todos confirmados por verificação adversarial (código real lido, SQL real rodado) — não são suspeitas. Não corrigi porque ou (a) são "código morto"/lint, categoria que o usuário já decidiu adiar (seção 4.4 "Backlog técnico adiado"), ou (b) envolvem uma decisão de produto/segurança que não é minha de tomar sozinho de madrugada.

**Requer decisão do usuário (não é lint):**
- **Card "Autoconsumo/Dependência/Exportação" da página pública nunca trava com leitura desatualizada**, ao contrário do painel privado, que tem uma trava de 10 dias de descompasso. MAS: essa trava do painel privado nunca dispara na prática hoje porque o campo que ela usa (`geracaoAcumuladaData`) é sempre `null` — comentário em `app.js:1399` diz "não existe em energia_solar_leituras (V2) — nunca fabricado (P1)". Ou seja, os dois lados já se comportam igual hoje (nenhum trava), a diferença é só que o painel privado TEM o código pronto pra travar se esse dado existisse, e a RPC pública (`consultar_solar_compartilhado`) nem devolve o campo, então a página pública não teria como implementar a mesma trava sem alterar a RPC primeiro. Decisão: vale a pena investir em rastrear a data real de captura da geração (pra trava funcionar de verdade nos 2 lados), ou deixar como está?
- **`registrar_erro_cliente()` (SECURITY DEFINER) não tem nenhuma checagem de role/JWT**, ao contrário de todas as outras 11 funções SECURITY DEFINER do projeto. Pode ser intencional (log de erro do cliente antes do login precisa aceitar `anon`), mas não há decisão documentada disso. Não bloqueei sozinho porque isso pode quebrar o log de erro se a intenção for mesmo aceitar anônimo.

**Código morto / inconsistência não-crítica (mesma categoria do backlog de lint já adiado):**
- `aplicarBoletosVencidosAutomaticamente()` em `app.js` — função de ~24 linhas, chamador comentado desde 12/08, nunca removida.
- `VARS.necessidadeHeld` (`vars-operacional.js`) — declarada, nunca lida (quebra o padrão dos irmãos `pisoHeld`/`totalOperacionalHeld`, que são lidos).
- `VARS.consorcioAutoQuitacaoValor` (`vars-patrimonio.js`) — declarada, nunca lida. Par assimétrico: `consorcioCasaQuitacao` (Casa) É usado em `reg-patrimonio.js`, o do Auto não.
- `VARS.mastercardBlackCongelado` (`vars-mercado-pago.js`) — literal órfão de uma migração antiga, valor real hoje vem de `CICLO_SNAPSHOTS[...].mastercardBlackPessoalCongelado`.
- `VARS.solarConsumoMaeRecente` (`vars-energia-solar.js`) — dado real (faturas da Casa da Mãe) nunca lido em nenhum gráfico. O comentário do próprio arquivo diz que foi guardado "só como referência/contexto" — pode ser intencional, não necessariamente bug.
- `CycleEngine.js` não carrega em produção (só `FinanceEngine.js`/`Comparator.js` carregam) — já documentado em `CONTRIBUTING.md`/`ARCHITECTURE.md`, não é achado novo, só reconfirmado.
- `renderCapaNav()`/`renderPageStrip()` (`dashboard-navegacao.js`) — código morto real: os elementos DOM que eles procuram (`#coverNavGrid`, `#pageStrip`) não existem no HTML, e as classes CSS que gerariam (`.cover-nav-*`, `.cnc-*`, `.page-strip-*`) não têm nenhuma regra em `styles.css`. A navegação real da Capa hoje é `.home-nav-grid` (funcional, com CSS completo).
- `.chart-box.small` (3 gráficos da aba WWI: Meta do Milhão, Casa Nova, Liquidez) — classe sem regra CSS correspondente, renderiza na altura padrão (190px) como se não tivesse modificador nenhum. Diferente de `.tall`/`.wide`/`.tall-lg`, que existem e funcionam.

## 8. Protocolo de sessão nova

1. Este arquivo primeiro, depois os blocos mais recentes de `docs/changelog/PASSAGEM_DE_TURNO.md`.
2. `git status` — 6 arquivos modificados no momento desta reescrita (aguardando autorização do usuário pra commit), confirmar se ainda é esse o caso.
3. **Se o usuário mencionar o medidor DDSU666 chegando/instalado**: ver seção 3.1 acima.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. **Sobre o WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
6. Se o medidor Tuya parecer travado de novo, é MUITO provavelmente o aparelho físico — orientar reset do disjuntor antes de investigar a integração.
7. **Aportes mensais de qualquer caixa: consultar `caixas_aportes_mensais` (Supabase) primeiro**, é a fonte única de verdade — evita recalcular do zero ou usar valor desatualizado do código.
8. **Se o usuário reportar cards de tamanho diferente em qualquer outra seção do painel**: mesmo padrão da regra 26 — provavelmente falta a mesma técnica de `min-height` escopado.
