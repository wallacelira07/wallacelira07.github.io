# Integração do medidor de energia via Smart Life (Tuya) — EM PRODUÇÃO (apartamento do Wallace)

**Status: FASE 2 CONCLUÍDA E EM PRODUÇÃO (17/08/2026).** Pedido original do usuário: trazer pro site os dados de um medidor de energia (voltagem/corrente/potência/kWh acumulado) hoje visível só no app Smart Life. **Confirmado explicitamente pelo usuário nesta mesma sessão: o medidor é a tomada geral do APARTAMENTO DELE (Wallace)**, não a casa em geral — é um aparelho diferente do DDSU666 da usina solar (Casa da Mãe, ver `EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`) e diferente do medidor ainda não instalado na casa da irmã.

## 1. Linha do tempo desta sessão (17/08/2026)

1. **Fase 1 (sondagem)**: script `scripts/sync/sondar_medidor_tuya.py` + workflow manual criados antes de qualquer credencial existir.
2. **Setup de credenciais**: usuário criou conta Tuya IoT Platform, projeto Cloud, vinculou o app Smart Life via QR Code, e cadastrou os 4 secrets no GitHub (`TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_DEVICE_ID`, `TUYA_API_REGION`) manualmente pela UI do GitHub (tentativa de automatizar via PAT + API bloqueada pelo classificador de segurança do Claude Code em 3 tentativas diferentes — decisão: não insistir, seguir caminho manual).
3. **Achado crítico**: `getstatus()`/`getproperties()` devolviam vazio mesmo com o aparelho "Online" — causa raiz: esse produto específico ("EKAZA Medidor de Transf de corrente 80A", `product_id=x0i3dmfiknnbb6wm`) é OEM/genérico, nunca teve o schema de DPs registrado no modo "Standard Instruction" da Tuya. **Resolvido** trocando o produto pro modo **"DP Instruction"** no painel Tuya (Cloud Project → Devices → dispositivo → Device Debugging → "Configure Control Instruction Mode") — só depois disso a API passou a devolver dado real.
4. **Schema real confirmado** (sondagem pós-fix, ver seção 2).
5. **Fase 2 (produção)** construída e publicada: tabela, RPC, robô, workflow, card no painel.
6. **3 refinamentos do card/gráfico**, todos por feedback direto do usuário depois de ver o resultado ao vivo (ver seção 5).
7. **Incidente real do próprio aparelho**: medidor ficou horas reportando valores idênticos (travado) — usuário resetou fisicamente (desligou/religou o disjuntor do circuito), voltou a reportar. Detecção automática desse cenário foi adicionada ao card (seção 6).
8. **Cron dedicado criado** no cron-job.org pelo usuário (a cada 10min, mesmo padrão do robô SAJ) — o job dentro de `executar_tudo.yml` sozinho não é suficiente pra rodar automaticamente (ver seção 7).

## 2. Schema real dos DPs (confirmado 17/08/2026, modo "DP Instruction")

Lido via `cloud.getstatus(device_id)` — cada DP é um inteiro bruto com escala fixa própria:

| DP | Significado | Conversão pro valor real |
|---|---|---|
| `cur_voltage1` | Tensão (V) | bruto ÷ 10 |
| `cur_current1` | Corrente (A) | bruto ÷ 1000 |
| `cur_power1` | Potência (W) | bruto ÷ 10 |
| `today_acc_energy1` | Energia hoje (kWh) | bruto ÷ 1000 |
| `total_energy1` | Energia total acumulada (kWh) — **contador que só cresce** | bruto ÷ 1000 |
| `device_state1` | Estado (enum: `close`/`monitor`/`working`/`warning`) | usado como está |
| `net_state` | Rede (enum: `cloud_net`/`local_net`/`no_net`) | diagnóstico, não usado no card |

Valores reais confirmados na sondagem: 226,6V, 2,091A, 426,8W, 3,389 kWh hoje, 1.311,1 kWh total — plausíveis (P ≈ V×I×fator de potência).

## 3. Backend (Fase 2, em produção)

- **Tabela `medidor_tuya_leituras`** — 1 linha por execução do robô (INSERT puro, série temporal, nunca upsert). Colunas: `capturado_em`, `tensao_v`, `corrente_a`, `potencia_w`, `energia_hoje_kwh`, `energia_total_kwh`, `estado`. RLS: SELECT só com JWT Firebase válido (mesmo padrão do domínio Solar — dado pessoal, não público).
- **RPC `atualizar_medidor_tuya(leitura jsonb)`** — `SECURITY DEFINER`, rejeita `anon`/`authenticated`, só `service_role` grava. Também insere em `execucoes_jobs` (heartbeat).
- **Robô `scripts/sync/atualizar_medidor_tuya.py`** — chama `tinytuya.Cloud.getstatus()`, converte os DPs (tabela da seção 2), grava via RPC. Heartbeat próprio (`registrar_execucao('medidor_tuya', ...)`) além do que a RPC já grava.
- **Workflow `.github/workflows/atualizar_medidor_tuya.yml`** — `workflow_dispatch` + `workflow_call`, `pip install tinytuya`, sem secret novo além dos 4 já cadastrados.

### 3.1 Consumo diário — calculado e persistido no PRÓPRIO BANCO (não no navegador)

**Tabela `medidor_tuya_consumo_diario`** (`data` date PK, `kwh_consumido`, `atualizado_em`) + **trigger `trg_medidor_tuya_consumo_diario`** (`AFTER INSERT ON medidor_tuya_leituras`): a cada leitura nova, calcula `energia_total_kwh` atual menos a primeira leitura do dia (Brasília) e faz upsert no dia corrente — "hoje" cresce ao vivo, dias passados congelam sozinhos quando o dia seguinte começa. RLS igual à tabela de leituras.

**Por que no banco e não no navegador**: a 1ª versão buscava até 5000 leituras brutas no cliente e recalculava tudo a cada carga de página — trabalho jogado fora, sem limite de crescimento. O trigger resolve isso 1 vez só, no momento em que cada leitura chega.

## 4. Frontend — card no painel

**Card "⚡ Medidor de energia do apartamento (tempo real)"** — aba **Energia Solar**, seção 06 (junto de "Economia antes × depois (apartamento)"). **Movido da aba "Painel" pra aba "Solar" no mesmo dia**, depois que o usuário esclareceu que o medidor é o apartamento dele, mesma unidade das demais seções ali.

Mostra: potência atual, tensão, corrente, energia hoje, energia total acumulada, estado, idade da última leitura (badge verde/amarelo/vermelho, 36h/72h — mesmo limiar do painel Saúde Operacional), e "Consumo real neste ciclo" (desde o dia 21, mesmo `DIA_LEITURA_WALLACE` já usado em `graficos-cenarios-lazy.js` — ciclo de LEITURA/FATURA do apartamento, não confundir com o ciclo da GD, seção 5).

Bootstrap fetch em `Sistema_Wallace_Lira_Completo.html`: `window.WALLACE_MEDIDOR_TUYA_V2` (últimas 50 leituras), `window.WALLACE_MEDIDOR_TUYA_CICLO_BASE_V2` (1ª leitura desde o dia 21), `window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2` (consumo diário já agregado, tabela da seção 3.1) — todos com JWT Firebase via `__wallaceAuthHeader()`.

## 5. Gráfico "Consumo real × crédito que cabe a você" — 3 refinamentos na mesma sessão

Pedido original: "crie um gráfico que mostre o comparativo entre o gerado e o consumido". Evoluiu 3x por feedback direto:

1. **1ª versão**: comparava consumo real medido × geração da usina, no MESMO gráfico "Geração por dia" (seção 04) já existente — **revertida**: usuário esclareceu que só o medidor do apartamento está online hoje (DDSU666 da Casa da Mãe e medidor da Irmã ainda não existem), misturar geração de 1 casa com consumo de outra no mesmo gráfico ainda não faz sentido. Voltou a ser só geração × média das 3 casas, como antes.
2. **2ª versão**: card novo "Consumo do apartamento: esperado × real medido" — comparava consumo real medido × consumo ESPERADO (histórico de fatura Energisa, `kwhAnoAnterior`). **Trocada**: usuário esclareceu "eu não pedi pra cruzar o consumo da fatura com o medidor, pedi pra cruzar o medidor com os CRÉDITOS" — trocado por `creditoMensalWallace` (71% do gerado pela usina, mesma fonte da barra "Crédito Wallace (gerado)" no gráfico Rateio Solar).
3. **3ª versão (atual)**: agrupava por MÊS CALENDÁRIO — **corrigida**: achado real do usuário, "o ciclo de agosto fechou dia 8, esqueceu? toda geração agora é pro próximo ciclo". O crédito "em formação" (`creditoMensalWallace[idxCicloAberto]`) pertence ao CICLO DA GD (fecha todo dia 8, mesma janela do "Fluxo 2" já existente), não ao mês calendário — rotular como "Ago/26" atribuía a agosto um crédito que já tinha rolado pra setembro.

**Versão final**: eixo é o **ciclo da GD** (`cicloSolarAberto.data_inicio`, mesma janela do Fluxo 2/seção 12), não mês calendário — consumo real e crédito cobrem exatamente a mesma janela de tempo. Só mostra o ciclo aberto por enquanto (medidor instalado 17/08/2026, ainda não existe ciclo fechado com consumo real medido); a próxima virada (~08/09) começa a acumular histórico de ciclos fechados.

**Escopo deliberadamente NÃO feito ainda**: esse número real não realimenta a fórmula do gráfico R$ (`cEnergiaSolar`) nem a tabela de fatura residual (`residualPosSolarTbody`) — que continuam vindo só da fatura em PDF, mês a mês. Motivo: aquelas fórmulas pareiam consumo (kWh) com valor da fatura (R$) do MESMO período pra achar a tarifa real paga; usar o kWh ao vivo do ciclo aberto sem o R$ correspondente (que só existe quando a fatura chega) quebraria esse pareamento. Mesmo princípio de "não pular fases" do medidor DDSU666.

## 6. Detecção de travamento do medidor (achado real em produção)

O aparelho ficou **horas reportando exatamente os mesmos valores** (`energia_total_kwh`, potência, tudo idêntico) mesmo com o robô rodando com sucesso a cada execução — o heartbeat de Saúde Operacional não pega esse caso (a chamada à API da Tuya funciona normal, só o valor devolvido é que estava congelado do lado do aparelho/nuvem Tuya). Confirmado que o próprio app Smart Life mostrava os mesmos números travados (gráficos de Dia/Mês vazios, Ano sem barra em agosto) — não era bug da integração, era o aparelho real. **Resolvido pelo usuário com reset físico** (desligar/religar o disjuntor do circuito do medidor).

**Detecção adicionada ao card**: anda pelas últimas leituras enquanto `energia_total_kwh` for idêntico ao mais recente; se esse "platô" já dura 60min+ com pelo menos 2 leituras, mostra aviso vermelho "⚠️ Possível travamento". 60min é folga generosa — no consumo real observado (~350-430W), o contador (resolução 0,001 kWh) deveria se mover várias vezes nesse intervalo.

## 7. Automação real — cron dedicado, não o orquestrador

**Achado importante sobre a arquitetura de automação deste sistema**: `executar_tudo.yml` (orquestrador que chama todos os robôs em sequência) **quase não é disparado automaticamente na prática** — só 10 execuções totais, todas manuais. O padrão que realmente funciona é **cada workflow individual ter sua PRÓPRIA tarefa agendada no cron-job.org**, apontando direto pra API de dispatch daquele workflow (confirmado ao vivo: "Atualizar Geração Solar" tem 953 execuções automáticas a cada ~10min via tarefa própria "SAJ Manhã"). Ligar o medidor só dentro do `executar_tudo.yml` não era suficiente pra rodar sozinho.

**Resolvido**: usuário duplicou a tarefa "SAJ Manhã" no cron-job.org, trocou a URL de `atualizar_geracao_saj.yml` pra `atualizar_medidor_tuya.yml`, manteve o intervalo de 10min. Confirmado funcionando (leitura real às 20:40 mostrou o contador se movendo de verdade).

## 8. Não pular fases — o que ainda falta antes de qualquer automação mais profunda

Mesmo princípio já usado no DDSU666: não substituir nenhuma entrada manual (fatura Energisa em PDF) por dado do medidor sem pelo menos 1 ciclo completo de validação cruzada. Quando o medidor da irmã e o DDSU666 da Casa da Mãe existirem, revisitar o gráfico "Geração por dia" (seção 04) pra somar os 3 consumos reais contra a geração real — não fazer isso agora, com só 1 dos 3 medidores online, geraria uma comparação capenga.
