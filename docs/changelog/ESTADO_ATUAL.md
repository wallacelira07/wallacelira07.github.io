# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 19/08/2026, bloco 28. Resumo: usuário trouxe um relatório (gerado por outro agente, Claude Chat) alertando P0 — "48 transações lançadas só na V2 nunca aparecem no painel". Investigação com 10 agentes (SQL direto + leitura de código) **contrariou parte da premissa do relatório**: as 10 caixas afetadas já leem de V2, não de V1. Causa real, mais específica: (a) a view V2 exclui `afeta_saldo_real=false`, e a Caixa Combustível tem 2 lançamentos (R$400,00, "Crédito KMV" — pendência aberta, aguardando o usuário explicar o que é) com `cartao_id` nulo, invisíveis em qualquer bloco; (b) ao trocar de ciclo pelo seletor (sem F5), a Caixa Variável revertia silenciosamente pro valor V1 congelado. Corrigido o (b) e implementado aviso de mitigação pro problema geral. Bloco 27 (automação de faturas via Gmail) seguem válidos, sem mudança. **Tudo commitado e publicado** (push feito, `main` atualizado).

## 0. Bloco 28 (19/08/2026) — investigação P0 "transações V2 invisíveis": achado diferente do relatado, 1 bug real corrigido, 1 aviso de mitigação, 1 pendência aberta (KMV)

Usuário trouxe um relatório de outro agente (Claude Chat, arquivo `.md` avulso) alertando prioridade máxima: "48 transações lançadas só na V2 desde 13/07, R$7.091,00, nunca aparecem no painel real porque `app.js` ainda lê 100% de V1". Antes de agir, rodei 10 agentes (SQL direto no Supabase + leitura do código real, nunca supondo o relatório certo) pra confirmar ou refutar.

### 0.1 A premissa do relatório estava parcialmente errada

As 10 caixas afetadas (Caixa Variável, Bens Duráveis, PIX Geral Vanessa, Lance, Churrasco, Mercado Pago, Combustível, Emagrecimento, PIX Vanessa, Mastercard_Infinite) **já leem o saldo de V2**, não de V1/`wallace_dados` — confirmado arquivo:linha para cada uma. A causa raiz real é mais específica que "painel lê V1":

1. **A view `vw_saldo_v2_por_caixa` exclui `afeta_saldo_real=false`** (por design — esse valor deveria contar em "Comprometido no cartão", não no saldo). **Caixa Combustível tem 2 lançamentos reais** (R$200,00 cada, "Abastecimento Posto Ipiranga — Crédito KMV", 05/08 e 16/08) com `afeta_saldo_real=false` **E `cartao_id` nulo** — não batem em nenhum dos dois filtros, ficam literalmente invisíveis em qualquer bloco (nem saldo, nem comprometido). **Pendência aberta**: o que é "Crédito KMV"? Não mexi em `afeta_saldo_real`/`cartao_id` dessas 2 transações sem entender isso primeiro (regra permanente: nunca escrever em tabela financeira sem revisão humana).
2. **Bug real, corrigido**: `trocarCiclo()` (seletor de ciclo da UI, sem F5) chama `recalcularAgregadosDerivados()`, que reescreve `REG.caixaVariavel.saldoReal/comprometido` a partir de V1 incondicionalmente — e nunca re-chama `aplicarOnda1V2()`/`aplicarComprometidoCaixaVariavelV2()` (que só rodam 1x no boot via `onDomPronto`). Resultado: no carregamento inicial o usuário vê o valor V2 correto; ao trocar de ciclo pelo seletor, a Caixa Variável **revertia silenciosamente pro V1 congelado** até a próxima recarga de página inteira.

### 0.2 Achados colaterais da investigação (não corrigidos, registrados)

- `FinanceService.js`/`PatrimonioService.js`/etc. (a "camada de Services" que o relatório original citava como "já pronta, só falta conectar") **foi deletada em 14/08/2026** (commit `2b20137`, "código morto, zero consumidor") — só sobrevive num worktree órfão nunca mergeado. O mecanismo real e ativo hoje é outro: `WallaceFinanceService` inline em `app.js` + os blocos `promocoes-financeengine.js` (FASE 2D/2F).
- `MATRIZ_MIGRACAO_FASE2.md` (citado no relatório original) **não existe em lugar nenhum do repositório** (nem histórico de git) — tratar como não-fonte se aparecer citado de novo.
- FASE 2F (`promocoes-financeengine.js`) promove em lote **outras** 10 caixas (Manutenção, Aniversário Júlio, Eventos, Saúde Família, Seguro Emplacamento, Combustível, Churrasco, Escola de Júlio, Bens Duráveis, Lance) via gate de "divergência V1×V2 zero" — mas como V1 está congelado (decisão de 12/08) e V2 recebe lançamentos novos, esse gate está **estruturalmente fadado a reprovar** caixas com lançamento manual recente. Não é bloqueio de infra, é um critério de design que passou a trabalhar contra a decisão já tomada. Fica pra decisão futura, não mexido agora.
- Não há `node`/`npm`/`package.json` neste ambiente — nenhum teste automatizado pode ser rodado antes de mudar código de cálculo financeiro; o único "teste" real hoje é o Comparator rodando ao vivo em produção.

### 0.3 O que foi corrigido/implementado nesta sessão

1. **Correção real** (`src/financeiro/cenarios/ciclo-selecao.js`, dentro de `trocarCiclo()`): 2 linhas adicionadas, re-chamando `aplicarOnda1V2()`/`aplicarComprometidoCaixaVariavelV2()` a cada troca de ciclo (aditivo, reaproveita cache em memória, fallback de falha já embutido nas próprias funções — `marcarIndisponivelV2`). Também atualiza os gráficos Chart.js da Caixa Variável depois que a V2 resolve.
2. **Aviso de mitigação** (novo `src/auditoria/verificacoes/hydrate-aviso-lancamentos-manuais-v2.js` + card em `Sistema_Wallace_Lira_Completo.html` + CSS em `assets/css/styles.css`): banner vermelho na Home, só leitura (1 `SELECT` em `transacoes` via `WallaceFinanceService.getTransacoesManualPendentesV2()`, mesmo padrão de `getSaudeJobs()`), mostra contagem/soma de lançamentos `origem='manual'` — avisa sem prometer qual caixa específica está errada, já que a causa varia por caixa. Escondido se zero lançamentos ou se a busca falhar.
3. **3 rodadas de verificação adversarial** (workflow, 10 agentes no total): confirmado que nenhum cálculo de saldo/comprometido existente foi tocado, que os números do aviso batem exato com SQL direto, e que RLS do Supabase já impede vazamento sem login. Zero achado bloqueante.

### 0.4 Pendências reais abertas desta investigação

- **"Crédito KMV" (Caixa Combustível, R$400,00 em 2 lançamentos)**: perguntar ao usuário o que é esse mecanismo de pagamento antes de decidir se `afeta_saldo_real` deveria ser `true`, ou se `cartao_id` deveria estar preenchido, ou se é um 3º tipo de comprometimento que a view ainda não modela.
- **As outras 9 caixas do achado original** (mesmo padrão `afeta_saldo_real=false` + `cartao_id` nulo pode existir em outras, só Combustível foi confirmado por SQL) — não auditado linha a linha ainda, escopo desta sessão foi só confirmar o padrão e corrigir o achado concreto.
- **Gate de divergência V1×V2 zero da FASE 2F** — decisão de produto pendente (ver 0.2), não uma correção de código óbvia.

## 1. Bloco 27 (19/08/2026) — automação de faturas via Gmail (Água/Gás/Energia) + consumo solar automático + gráficos novos

### 0.1 Água/Gás Medintech — automação completa, ponta a ponta

Usuário conectou o Gmail via MCP nesta sessão. `scripts/sync/atualizar_boletos_medintech.py` busca e-mail de `sistemas@bzs.com.br` (contas 753=Água, 1024=Gás), baixa o PDF anexado, extrai o valor pela **linha digitável Febraban** (formato regulado, imune a mudança de layout do PDF) e faz `PATCH` idempotente em `cronograma_boletos_fixos`. Workflow `atualizar_boletos_medintech.yml` no mesmo padrão dos outros robôs (`workflow_dispatch`+`workflow_call`, sem `schedule`). **Achado de drift real**: fatura de julho/2026 mostrou Água R$133,41→R$152,16 e Gás R$30,28→R$36,70 — corrigido no Supabase com o PDF como evidência.

### 0.2 Energia Energisa (TXB000009) — estendido, mas AINDA INCOMPLETO pro Wallace

3 rodadas de correção real na mesma sessão, documentadas em detalhe em `docs/decisions/AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md`:

1. **Erro cometido e revertido**: 1ª tentativa validava a fatura por CPF do campo PAGADOR — descobriu-se que o Wallace é pagador também na conta da própria mãe (arranjo familiar), então CPF do pagador não prova "é a conta dele". Chegou a escrever `TXB000009=R$56,11` (valor da fatura da mãe) no Supabase, revertido pro valor anterior (R$367,36) antes de qualquer commit.
2. **Corrigido de verdade**: identificação agora usa o **Número da UC** (unidade consumidora — sempre presente, exclusiva de 1 imóvel, nunca compartilhada). Testado contra o PDF da mãe: rejeita corretamente.
3. **3º achado real**: a linha digitável Febraban não aparece em toda fatura Energisa (a da irmã, já paga, não tem ficha de compensação). Método de valor trocado pra Energisa: `vencimento+R$` → `TOTAL:` → linha digitável (fallback). Testado contra 2 PDFs reais (mãe R$56,11/145kWh, irmã R$70,12/111kWh) — bateram exato.

**Estado real**: UC da mãe (`573.702.053-77`) e da irmã (`2.064.202.053-60`) confirmadas contra PDF real. UC do Wallace (`1.994.775.053-05`) é **Nível C** — informada pelo usuário, nunca testada contra PDF real dele (fatura do ciclo atual ainda não emitida). `cronograma_boletos_fixos.TXB000009` continua em R$367,36 (valor antigo, não substituído por engano).

### 0.3 Consumo solar de referência (3 casas) automatizado

`energia_solar_consumo_referencia` era 100% manual (usuário lia a fatura, agente digitava). Mesmo robô passou a atualizar automaticamente, usando o "Consumo em kWh" do mês atual (não a média histórica, que só existe em 1 dos 2 formatos de fatura vistos). Atualizado com evidência real: mãe 300→145 kWh, irmã 112→111 kWh (Wallace não tocado). **Bug real corrigido antes do commit**: `consumo_diario_kwh` é coluna GERADA no Postgres — script tentava escrever nela direto, Supabase rejeitava; corrigido pra só mandar `consumo_mensal_kwh`/`dias_base`/`fonte`.

### 0.4 Card "Consumo real (fatura Energisa)" — painel privado + compartilhado

Novo card abaixo dos cards de crédito solar (Wallace/Wellida), alimentado por `window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2` (sem fetch novo). RPC `consultar_solar_compartilhado` ampliada com `consumoReferencia`. **Bug real achado pelo usuário ao vivo** ("cadê? não apareceu"): a query só selecionava `casa/consumo_diario_kwh/fonte`, nunca `consumo_mensal_kwh` — o card checava esse campo pra decidir se tinha dado, sempre `null`, sempre caía no fallback "sem fatura". Corrigido (select ampliado), confirmado ao vivo depois.

### 0.5 Gráficos novos "Crédito × medidor Tuya" (mês a mês, 1 por pessoa)

Pedido do usuário, 3 rodadas de refinamento (1ª tentativa errada foi mexer nos cards existentes; o pedido real era gráficos NOVOS comparando crédito gerado × leitura do medidor Tuya, não a fatura Energisa). 2 gráficos por painel (Wallace/Wellida), mesmo estilo do gráfico 05, 12 meses. **Bug real achado pelo usuário com print**: consumo agregado por mês CALENDÁRIO, crédito indexado por mês em que o CICLO FECHA (corte dia 8) — os 2 eixos não batiam. Corrigido pra usar a mesma função de fechamento de ciclo já usada pelo crédito.

### 0.6 Ajustes finais da sessão

- Gráfico 04 (Geração por dia, painel privado) ganhou valores sobre as barras, igualando o compartilhado.
- **Bug real no compartilhado**: os gráficos "Crédito × medidor Tuya" só liam `ciclosFechados` — o mês do ciclo ainda aberto (Set/26) nunca tinha barra de crédito. Corrigido pra usar `fluxo2.wallace/wellida.creditoAtual` (mesma fórmula do card "Consumo real × crédito"), verificado batendo com o painel privado (151/62 kWh).
- Robô passou a também alimentar `parametros_gerais.ENERGISA_TARIFA_COMPOSICAO` (3 casas) e `ENERGIA_FATURAS_REAIS` (Wallace) a cada fatura Energisa nova — fecha o último trecho manual do gráfico 06 "Economia antes × depois" e do card "Quanto você ainda vai pagar". JS trocado de chave fixa (`fatura_ago26_valor`) pra busca automática da fatura mais recente disponível — nenhuma edição de código necessária nos próximos meses.

### 0.7 O que ainda falta pra fechar de vez

`ENERGIA_FATURAS_REAIS` continua `{}` — nenhuma fatura Energisa do próprio Wallace foi processada ainda (a dele deste ciclo não foi emitida). Quando chegar, mandar o PDF real pra confirmar UC + valor, e só então essa parte fica 100% validada (ver seção Pendências).

## 2. Bloco 26 (18/08/2026) — medidor da Wellida em produção de verdade (2 bugs reais corrigidos ao vivo) + reordenação de cards

### 1.1 Saga do erro Tuya `913` — 2 causas reais, ambas resolvidas

Usuário disparou o workflow `atualizar_medidor_tuya_wellida.yml` pela primeira vez e caiu num erro genérico da Tuya Cloud: `913 - No permission. The data center is suspended`. Investigação em 2 etapas, ambas confirmadas por evidência real antes de declarar resolvido:

1. **Região errada**: o secret `TUYA_API_REGION_WELLIDA` estava como `us-e` (copiado do padrão do Wallace), mas o painel Tuya mostrava o device sob "Western America Data Center" — que mapeia pro código `us` puro na API, não `us-e` (sub-região diferente, "America Leste"). Usuário trocou o secret pra `us` — resolveu a conexão, o robô passou a ler a leitura real do device (`energia_total_kwh: 0.0`, esperado pra medidor recém-instalado).
2. **Bug real meu, achado na hora**: com a conexão funcionando, apareceu um NOVO erro — `HTTP 409 duplicate key value violates unique constraint "medidor_tuya_consumo_diario_pkey"`. Causa: na migração de generalização multi-casa (bloco 24), dropei a constraint UNIQUE errada (`medidor_tuya_consumo_diario_data_key`) mas a PRIMARY KEY real da tabela (`medidor_tuya_consumo_diario_pkey`, só em `data`, sem `casa`) continuou intacta — bloqueava qualquer 2ª casa gravar numa data que o Wallace já tivesse usado. Corrigido: `DROP CONSTRAINT medidor_tuya_consumo_diario_pkey` (a `UNIQUE(data,casa)` já existente é suficiente pro `ON CONFLICT` do trigger). Confirmado que a transação inteira tinha revertido no erro anterior (nenhum dado órfão pra limpar).

**Resultado confirmado em produção**: `medidor_tuya_leituras` e `medidor_tuya_consumo_diario` já têm linha real com `casa='wellida'`, gravada com sucesso, heartbeat registrado como `medidor_tuya_wellida = sucesso`.

### 1.2 Reordenação dos cards do medidor (pedido do usuário)

Ordem antiga: telemetria Wallace → telemetria Wellida → comparação Wallace → comparação Wellida (agrupado por TIPO de card). Ordem nova, pedida explicitamente: telemetria Wallace → comparação Wallace → telemetria Wellida → comparação Wellida (agrupado por PESSOA). Aplicado nos 2 lugares (`Sistema_Wallace_Lira_Completo.html` e `solar-compartilhado.html`) — só reordenação de HTML, nenhuma lógica mudou.

### 1.3 Pendências reais restantes pro medidor da Wellida

- **Cron dedicado no cron-job.org**: ainda não criado — passei a URL/method/headers/body pro usuário (mesma API do GitHub `workflow_dispatch`, reaproveitando o token já configurado nas outras tarefas). `.github/workflows/atualizar_medidor_tuya_wellida.yml`.
- **`medidor_tuya_wellida` ainda não está em `SAUDE_JOBS_LIMIARES`** (`hydrate-saude-operacional.js`) — de propósito, só adicionar depois do cron confirmado rodando sozinho por um tempo (evita alarme falso "nunca rodou").
- **Medidor da Wellida ficou fisicamente offline** (app Smart Life mostrou "Device Connection Failure") logo depois do 1º sucesso — orientado troubleshooting padrão (WiFi/roteador/disjuntor, mesmo problema já visto no medidor do Wallace). O contador de energia é gravado no hardware do próprio medidor (não se perde offline) — só a granularidade por-leitura fica comprometida no período sem conexão, o total nunca é perdido.
- **Modelo do medidor da Wellida é bidirecional** (`forward_energy_total`/`reverse_energy_total`, DP diferente do CT simples do Wallace) — só energia total é gravada de verdade; potência/tensão/corrente/estado sempre ficam `—` pra ela, não é falha, é limitação real do aparelho (documentado em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`).

## 3. Bloco 25 (18/08/2026) — medidor da Wellida: modelo identificado, robô adaptado, card replicado, extensão de link

Usuário mandou prints ao vivo do painel Tuya (device já linkado, `ebf0d04e88180e1474o2is`) — schema de DPs confirmado DIFERENTE do EKAZA CT do Wallace (só `forward_energy_total`/`reverse_energy_total`, sem tensão/corrente/potência/estado). `scripts/sync/atualizar_medidor_tuya.py` ganhou suporte a múltiplos modelos via `TUYA_MODELO` (`ekaza_ct` default Wallace, `bidirecional_ab` novo pra Wellida). Card "Consumo real × crédito" replicado pro painel privado e compartilhado (função `aplicarConsumoRealVsCreditoPorCasa()` generalizada, RPC ganhou `medidorTuyaWellidaConsumoDiario`/`medidorTuyaWellidaUltima`). Nova opção de estender validade de link de compartilhamento já existente (RPC `estender_compartilhamento_solar`, botão "+dias").

## 4. Bloco 24 (18/08/2026) — achado #4 resolvido de verdade + código morto eliminado + medidor Tuya preparado (infra inicial)

**Achado #4** (trava de descompasso do card solar público): coluna `geracao_acumulada_atualizado_em` criada em `energia_solar_leituras`, robô `atualizar_geracao_saj.py` grava o timestamp real, RPC/painel privado/compartilhado atualizados — a trava (10 dias de descompasso) agora funciona de verdade nos 2 lados (antes nenhum dos 2 disparava, o campo era sempre `null`).

**Código morto eliminado** (8 de 9 achados da auditoria, autorizado pelo usuário: "pode eliminar"): `aplicarBoletosVencidosAutomaticamente()`, `VARS.necessidadeHeld`, `VARS.consorcioAutoQuitacaoValor`, `VARS.mastercardBlackCongelado`, cluster `renderCapaNav()`/`irParaCapaDestino()`/`CAPA_DESTINOS`/`NOMES_PANE`/`renderPageStrip()` removidos. `.chart-box.small` completado com CSS real em vez de removido. Mantidos de propósito: `VARS.solarConsumoMaeRecente` (dado real de fatura) e `CycleEngine.js` (serviço testado, arquitetura planejada).

**Infra multi-casa do medidor Tuya** criada (banco, robô, workflow, card) — nessa época ainda hipotética ("quando o Device ID existir"), depois confirmada real no mesmo dia (bloco 25).

## 5. Bloco 23 (18/08/2026) — auditoria noturna autônoma (7 agentes + verificação adversarial, carta branca do usuário)

Usuário: "coloque 10 agente trabalhando... não pare, eu vou dormir... carta branca para agir". Workflow de 7 agentes finders (financeiro, V1×V2, sintaxe JS, paridade solar, código morto, UI/CSS, segurança) + verificação adversarial (1 skeptic por achado). **16 achados, 16 confirmados, 0 descartados.**

**Limite respeitado mesmo com carta branca**: nenhuma escrita em tabela financeira, nenhum push sem avisar antes (regra permanente do `CLAUDE.md`). Corrigidos na hora: legenda Saúde Família dessincronizada, `CLAUDE.md` desatualizado (regra do `wallace_dados` obsoleta desde 12/08), comentários V1×V2 obsoletos, cor de gráfico divergente, 1 grant de segurança desnecessário revogado. O resto ficou reportado pro usuário decidir (resolvido nos blocos 24-26 acima).

## 6. Bloco 22 (18/08/2026) — recálculo de aportes + padronização de cards

- **Caixa Saúde Família**: R$177,50 → **R$210,83/mês** (composição completa: 2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa + 2x endócrino Wallace).
- **Emagrecimento**: R$278,89 → **R$490,00/mês** (caneta subiu de preço; usuário tem 3 canetas em estoque, não compra nova nos próximos 1-2 ciclos, mas aporte continua).
- **Bens Duráveis/Boletos/Fundo de Suavização**: pedido recálculo, CONFIRMADOS já corretos (zero mudança de código).
- **Cards "Todas as Caixas"**: altura padronizada via `.caixas-grid`/`min-height:168px` (não testado ao vivo, exige login).
- **3 LREI ativos** (R$266,23+R$103,55+R$1.950,77): confirmado real via SQL, não é bug.

## 7. Bloco 21 e anteriores

Ver `PASSAGEM_DE_TURNO.md` para o histórico narrativo completo. Resumo: bug crítico do `solar-compartilhado.html` (travamento "Carregando...") resolvido de verdade (erro de sintaxe JS); projeto DDSU666/SAJ do zero (Kit SEC não é exigível, firmware pronto, aguardando hardware físico 25/08/2026).

## 🎯 Regras permanentes (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova.
6. **`.git` real em `C:\Users\WLI015\.git-repos\Site.git`** — máquina nova precisa `git clone` novo. Usar merge (não rebase) pra sincronizar — bug conhecido de rebase nesta pasta sincronizada pelo Drive.
7. **Boot do painel ~1,7-1,8s (`aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy`) NÃO é bug** — não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz saldo real de nenhuma caixa** (manual seção 1.3.5). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre.
9. **Baixa de fatura**: `UPDATE` na MESMA linha de `transacoes`, nunca criar 2ª transação.
10. **Nenhuma constante financeira nova nasce hardcoded no `.js`** se já existe lugar em `parametros_gerais`/`indicadores`.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI**, mas FORA do Painel Executivo/Balanço.
12. **Inbox Financeira DESATIVADA DA UI** — itens ambíguos ficam `pendente` silenciosamente.
13. **Leitura manual de `energia_solar_leituras` sempre usa data/hora REAL da foto**, nunca "hoje".
14. **Medidor solar DDSU666 (Casa da Mãe): modelo certo só libera 25/08/2026.** Não confundir com o DDSU666 do inversor SAJ (bloco 21) — mesma família de hardware, contextos diferentes.
15. **WWI congelado funcionalmente, em observação** desde 15/08/2026. Não abrir fase nova sem evidência real ou pedido explícito.
16. **Necessidade Total Bruta/Líquida persistida em `indicadores`** a cada recálculo — só atualiza no próximo login (agente não dispara sem sessão).
17. **Medidor Tuya do apartamento em produção**, cron a cada 10min. Medidor da Wellida também em produção desde bloco 26 (cron ainda pendente de criar).
18. **`executar_tudo.yml` NÃO é o mecanismo real de automação.** Cada workflow precisa de tarefa dedicada no cron-job.org (URL da API do GitHub `workflow_dispatch`, não é webhook simples).
19. **Cotação de opções cobre PETR4 (brapi.dev) e ITUB4 (fallback `opcoes.net.br`, scraping).**
20. **Limiar `SOLAR_STATUS_LIMITES - acimaApartirDe` é 110%.**
21. **`solar-compartilhado.html` confirmado funcionando** desde bloco 21 — se travar de novo, ler console do navegador primeiro, não repetir tentativas antigas.
22. **Runbook de replicação de medidor Tuya** em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md` — inclui agora a lição da região `us` vs `us-e` e o bug de PK multi-casa, já corrigidos.
23. **Kit SEC da SAJ não é exigível** pra função básica de medidor+export limitation, confirmado por 4 manuais oficiais.
24. **Firmware ESP32 pro DDSU666/SAJ pronto** em `firmware/esp32_ddsu666_saj/`, aguardando hardware físico (25/08/2026). Mapa Modbus: `4000H`/`400AH` (monofásico), nunca `101EH`/`1028H` (trifásico).
25. **Tabela `caixas_aportes_mensais` (Supabase) é a fonte única de verdade dos aportes mensais** de todas as caixas — ver seção 6 abaixo pro snapshot completo.
26. **Cards da seção "Todas as Caixas" usam `.caixas-grid` (CSS)** pra altura uniforme — se algum outro lugar do painel tiver cards de tamanho desigual, mesma técnica provavelmente resolve.
27. **Medidor Tuya multi-casa: a PRIMARY KEY de `medidor_tuya_consumo_diario` é `(data, casa)`** (não mais só `data`, corrigido bloco 26). Se criar uma 3ª casa nova, não precisa mexer nisso de novo — já está certo.
28. **Região da API Tuya não é igual ao rótulo do painel.** "Western America Data Center" no painel = código `us` na API (não `us-e`). Confirmar sempre com um teste real antes de assumir, o rótulo visual da Tuya é impreciso.
29. **NOVO bloco 27 — não existe API de DDA acessível a pessoa física** (confirmado: Pluggy, Open Finance oficial, CIP, Celcoin, BTG Empresas, TecnoSpeed, QI Tech, Kobana — todos exigem CNPJ/credenciamento institucional). Alternativa real e já implementada: parsing de e-mail via Gmail API (ver `docs/decisions/AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md`).
30. **NOVO bloco 27 — identificar de quem é uma fatura Energisa usa o Número da UC, nunca o CPF do campo PAGADOR.** O Wallace é pagador/titular também da conta da própria mãe (arranjo familiar) — CPF do pagador só prova "ele paga essa conta", não "é a conta dele". Cada UC corresponde a exatamente 1 imóvel, nunca compartilhada.
31. **NOVO bloco 27 — nem toda fatura Energisa tem linha digitável Febraban** (só quando ainda tem ficha de compensação; fatura já paga/2ª via simplificada não tem). Ordem de fallback pro valor: `vencimento+R$` → `TOTAL:` → linha digitável. Medintech (Água/Gás) continua só com linha digitável, que é 100% confiável pra ela.
32. **NOVO bloco 27 — `consumo_diario_kwh` em `energia_solar_consumo_referencia` é coluna GERADA no Postgres**, nunca escrever nela direto (só `consumo_mensal_kwh`/`dias_base`/`fonte`).
33. **NOVO bloco 27 — crédito solar é indexado pelo mês em que o CICLO FECHA (corte dia 8), consumo por mês calendário são coisas diferentes.** Qualquer gráfico/comparação novo que cruze os dois precisa usar a mesma função de fechamento de ciclo (`mesFechamentoCiclo`/`mesFechamentoCicloRateio`) dos dois lados, senão os eixos não batem.
34. **NOVO bloco 28 — "as 10 caixas do achado P0 leem V1, não V2" é FALSO.** Antes de assumir que um card lê V1/`wallace_dados`, ler o código real — quase todas as caixas relevantes já foram promovidas pra V2 (ver mapa de fontes por caixa no bloco 28). O gap real é mais sutil: `afeta_saldo_real=false` + `cartao_id` nulo cai fora de qualquer filtro (view de saldo E cálculo de comprometido), e o seletor de ciclo não re-buscava V2 (corrigido).
35. **NOVO bloco 28 — `FinanceService.js`/`PatrimonioService.js`/etc. NÃO EXISTEM em `main`** (deletados 14/08/2026, commit `2b20137`, código morto sem consumidor). Não citar/planejar em cima deles como "já prontos, só falta conectar" — só sobrevivem num worktree órfão nunca mergeado. O mecanismo real é `WallaceFinanceService` inline em `app.js` + `promocoes-financeengine.js`.
36. **NOVO bloco 28 — `MATRIZ_MIGRACAO_FASE2.md` NÃO EXISTE** no repositório (nem no histórico do git). Se aparecer citado em algum relatório/prompt, tratar como referência não confiável.
37. **NOVO bloco 28 — FASE 2F (`promocoes-financeengine.js`) usa gate de "divergência V1×V2 zero"**, que hoje reprova estruturalmente qualquer caixa com lançamento manual recente (porque V1 está congelado desde 12/08 e V2 recebe lançamento novo) — não é bug de infraestrutura, é decisão de design que ficou desatualizada. Decisão de produto pendente, não mexer sem pedido explícito.

## Pendências abertas

1. **DDSU666 (SAJ)**: aguardando hardware chegar (~25/08/2026) pra fiação/reconfiguração/teste real.
2. **R$340,00 do ciclo Wärtsilä 2026-07** ainda não confirmados como recebidos (não confundir com TEDs já lançadas).
3. **LREI0003/0004/0005 ativas** (R$266,23+R$103,55+R$1.950,77) — usuário optou por deixar como está, tendem a normalizar.
4. **Lint dos ~91 módulos `hydrate-*`** — adiado por decisão consciente do usuário, não reabrir sem pedido novo.
5. **Projeto WhatsApp/Telegram** — cancelado 17/08, não retomar sem confirmação explícita dos 2 motivos originais (custo API + hospedagem 24/7).
6. **Necessidade Total Bruta/Líquida** — recálculo automático pendente do próximo login (regra 16).
7. **Medidor da Wellida**: cron dedicado no cron-job.org ainda não criado (usuário tem a URL/config); `medidor_tuya_wellida` ainda não monitorado em Saúde Operacional (esperar cron rodar sozinho primeiro). **Usuário já comprou um medidor substituto IDÊNTICO ao do apartamento (mesmo modelo EKAZA CT), chega domingo (23/08/2026)** — quando trocar, o workflow dela deve voltar pro `TUYA_MODELO=ekaza_ct` (padrão, igual ao Wallace) em vez do `bidirecional_ab` atual, e o `TUYA_DEVICE_ID_WELLIDA`/região precisam ser atualizados pro novo aparelho. Até lá, seguir usando os dados do medidor bidirecional atual.
8. **2 achados da auditoria noturna sem decisão tomada** (não são bugs, são escolhas de produto/segurança): (a) vale a pena implementar rastreamento real de `geracaoAcumuladaData` retroativo, ou deixar só daqui pra frente (já resolvido pra frente, bloco 24)? (b) `registrar_erro_cliente()` sem checagem de role — intencional (log pré-login) ou deveria restringir?
9. **NOVO bloco 27 — automação de Energia (TXB000009) ainda não validada de ponta a ponta pro Wallace**: UC dele (`1.994.775.053-05`) é Nível C (informada, nunca testada contra PDF real — a fatura do ciclo atual dele não foi emitida). `cronograma_boletos_fixos.TXB000009` continua no valor antigo (R$367,36). Quando a fatura dele chegar, mandar o PDF real pra confirmar UC+valor antes de considerar fechado.
10. **NOVO bloco 27 — `ENERGIA_FATURAS_REAIS` continua `{}`** (nenhuma fatura Energisa do Wallace processada ainda) — gráfico 06 continua mostrando fonte='calculado' até a 1ª fatura real dele ser processada pelo robô; deve virar 'fatura real' sozinho, sem código novo.
11. **NOVO bloco 27 — remetente exato do envio automático mensal da Energisa ainda não confirmado** (serviço ativado nesta sessão, ainda não chegou nenhuma fatura automática, só 2ª via manual). Busca hoje é por domínio inteiro (`from:@energisa.com.br has:attachment`), compensada pela validação por UC. Revisitar quando a 1ª fatura automática real chegar.
12. **NOVO bloco 27 — pendências de setup do robô Gmail** (ação do usuário, fora do alcance do agente): criar tarefa dedicada no cron-job.org pro workflow `atualizar_boletos_medintech.yml`; depois de confirmar rodando sozinho, adicionar `boletos_medintech` em `SAUDE_JOBS_LIMIARES`.
13. **NOVO bloco 28 — "Crédito KMV" (Caixa Combustível, 2 lançamentos, R$400,00, 05/08 e 16/08/2026)**: `afeta_saldo_real=false` + `cartao_id` nulo, invisível em qualquer bloco do painel. Perguntado ao usuário o que é esse mecanismo de pagamento — aguardando resposta antes de decidir se `afeta_saldo_real`/`cartao_id` devem mudar, ou se é um 3º tipo de comprometimento que a view precisa passar a modelar.
14. **NOVO bloco 28 — auditar as outras 9 caixas do achado P0** pelo mesmo padrão confirmado em Combustível (`afeta_saldo_real=false` + `cartao_id` nulo) — só Combustível foi confirmado por SQL nesta sessão, as demais (Bens Duráveis, Lance, Churrasco, Mercado Pago, PIX Geral Vanessa, PIX Vanessa, Emagrecimento, Mastercard_Infinite) podem ter o mesmo problema, não verificado ainda.

## Snapshot da tabela `caixas_aportes_mensais` (Supabase) — 18/08/2026

Fonte única de verdade dos aportes mensais, consultável por qualquer agente sem ler código.

| Caixa | Aporte mensal | Tipo |
|---|---|---|
| Caixa Boletos | R$4.550,77 | contínuo |
| Caixa Variável | R$2.000,00 | contínuo (teto oficial) |
| PIX Vanessa | R$1.200,00 | contínuo |
| Escola de Júlio (fase 2027) | R$839,64 | temporário (Jan-Nov/2027) |
| Caixa Seguro Emplacamento | R$425,00 | contínuo |
| Emagrecimento | R$490,00 | contínuo |
| Escola de Júlio (ciclo atual) | R$500,00 | temporário (até Nov/2026) |
| Caixa Bens Duráveis | R$250,00 | contínuo |
| Caixa Saúde Família | R$210,83 | temporário (até ~Nov/2027) |
| Caixa Aniversário Júlio | R$200,00 | temporário (até 14/09/2026) |
| Caixa Combustível | R$200,00 | contínuo |
| Caixa Eventos | R$166,67 | contínuo |
| Caixa Manutenção | R$166,67 | contínuo |
| Caixa Churrasco | R$100,00 | contínuo |
| Lance, Mastercard_Infinite, Mercado Pago, Wartsila, Suavização, PIX Geral Vanessa | — | sem aporte fixo |

## Protocolo de sessão nova

1. Este arquivo primeiro, depois os blocos mais recentes de `docs/changelog/PASSAGEM_DE_TURNO.md`.
2. `git status` — deveria estar limpo (tudo commitado/publicado nesta reescrita); confirmar.
3. **Medidor Tuya**: Wallace e Wellida ambos em produção. Se algum aparecer travado/offline, é MUITO provavelmente o aparelho físico (WiFi/disjuntor) — orientar reset antes de mexer em código ou Supabase.
4. **Se o usuário mencionar o DDSU666 chegando/instalado**: ver pendência 1 acima, `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md` tem o mapa de registradores.
5. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
6. **WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
7. **Aportes mensais de qualquer caixa**: consultar `caixas_aportes_mensais` (Supabase) primeiro, é a fonte única de verdade.
8. **Cron externo (cron-job.org)**: qualquer automação nova precisa de tarefa dedicada lá — a URL é a API do GitHub `workflow_dispatch` (não um endpoint simples), reaproveitar token já configurado.
9. **Se replicar mais um medidor Tuya (3ª casa)**: seguir `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`, já atualizado com as 2 lições reais do bloco 26 (região `us`, PK multi-casa).
10. **Se mexer em fatura Energisa/UC/robô de faturas**: ler `docs/decisions/AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md` primeiro — tem as 3 lições reais do bloco 27 (UC não CPF pagador, fallback de linha digitável, coluna gerada no Postgres).
11. **Fatura do Wallace (Energisa) ainda não emitida** — quando chegar, é a peça que falta pra fechar as pendências 9/10 acima.
