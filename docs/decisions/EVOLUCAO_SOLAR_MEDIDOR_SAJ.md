# Evolução do domínio Solar — medidor Chint/SAJ (registrado, não implementado)

**Status: DOCUMENTAÇÃO E PLANEJAMENTO, com Fase 2 (só schema) antecipada em 12/08/2026, e ferramenta da Fase 1 preparada em 14/08/2026 (véspera da instalação).** O medidor comprado é um **DDSU666** (bidirecional, Modbus, homologado SAJ) — não o "Chint" citado no fato original registrado abaixo; o nome do documento ficou desatualizado, mas o desenho de arquitetura vale igual. Instalação física prevista para **15/08/2026** (Casa da Mãe).

**14/08/2026 — Fase 1 preparada, não executada.** A pedido do usuário ("deixar tudo pronto para receber os dados"), foi criado `scripts/sync/sondar_medidor_saj.py` — script de SONDAGEM, só leitura, que reaproveita o login já validado do robô de produção (`atualizar_geracao_saj.py`) e imprime o `energyDataList` COMPLETO do endpoint `getPlantEnergyStatistics` (não só `PV_ENERGY`, que é tudo que o robô hoje lê), separando visualmente qualquer `dataType` novo que apareça depois da instalação do medidor. Nenhuma escrita no Supabase. Nenhuma mudança no robô de produção (continua exatamente como estava, mesmo padrão de "não pular fases" already documentado na seção 6). Disparo manual via `.github/workflows/sondar_medidor_saj.yml` (`workflow_dispatch`, sem agendamento) — pode ser rodado pela aba Actions do GitHub direto do celular, sem precisar de Python local nem estar no computador. **Passo a passo pra amanhã de manhã**: (1) confirmar com o instalador que o medidor está fisicamente conectado e o inversor já enxerga ele; (2) disparar o workflow `Sondar Medidor DDSU666 (SAJ)` manualmente; (3) ler a saída — se aparecer algum `dataType` além de `PV_ENERGY`, colar a saída completa numa sessão do Claude Code pra decidir o mapeamento de campos e avançar pra Fase 2 (gravar em `energia_solar_medicoes_tempo_real`, que já existe, só schema, vazia); se não aparecer nada novo, não é motivo de alarme — só confirma que a API não expõe esses dados por este endpoint, e o próximo passo vira inspecionar o portal/app da SAJ manualmente (risco já identificado na seção 7).

Em 12/08/2026, a pedido do usuário, a tabela `energia_solar_medicoes_tempo_real` (seção 4, item 1) foi criada no Supabase — **só o schema**, vazia, RLS igual às demais tabelas do domínio Solar (SELECT restrito a login Firebase válido, escrita só via service_role). Nenhum código foi alterado: `atualizar_geracao_saj.py` continua exatamente como estava, o site não lê essa tabela ainda. Isso é estritamente Fase 2 sem a Fase 1 — a tabela existe com as colunas *sugeridas* neste documento, não confirmadas contra a API real (que só poderá ser inspecionada depois de 15/08). Se os campos reais vierem diferentes, a tabela recebe `ALTER TABLE` depois — baixo custo, já que está vazia.

## 1. Fato registrado

**08/08/2026** — usuário adquiriu hardware de medição recomendado pelo próprio fabricante do inversor (SAJ) para integração direta:

- **Medidor de Energia Chint, 2 polos, 80A, 275V** — compatível com a solução SAJ, destinado à integração com o inversor solar (leitura bidirecional de energia em tempo real, no padrão que os inversores SAJ usam para exibir consumo/geração instantâneos no próprio portal/app).
- Cabo de rede Cat6, 40m — comunicação entre o medidor e o inversor/rede local.
- Quadro de distribuição — infraestrutura elétrica para a instalação.

**Instalação física ainda não ocorreu** nesta data — este documento antecipa a arquitetura, não assume que o hardware já está transmitindo dados.

## 2. Estado atual do domínio Solar (antes do medidor)

Fonte de dado hoje, por tipo de informação:

| Informação | Fonte hoje | Mecanismo |
|---|---|---|
| Energia importada da rede (código 03) / exportada (código 103) | **Manual** — usuário lê o medidor bidirecional da concessionária (Energisa) na casa da mãe (unidade geradora) e informa a leitura | Grava em `energia_solar_leituras.leitura_03`/`leitura_103` (Supabase, V2) |
| Geração acumulada do inversor | **Semi-automática** — robô (`scripts/sync/atualizar_geracao_saj.py`) faz scraping do portal/API da SAJ, 2x/dia (cron `*/10 6-18 * * *`) | Grava em `energia_solar_leituras.geracao_acumulada` e `energia_solar_geracao_diaria.geracao_kwh` |
| Consumo instantâneo / geração instantânea / autoconsumo real / dependência da rede | **Não existe hoje como dado real** — o simulador regulatório (`energia-solar.js`, `gerarForecastSolar()`) usa uma ESTIMATIVA documentada de 50% (`energiaInstantaneaEstimada = Math.min(geracao,consumo) * 0.5`), só para projeção/cenário futuro, nunca para o card de crédito real | Constante fixa no simulador, nunca uma leitura |
| Crédito líquido do ciclo, rateio Wallace/Irmã | Calculado a partir de duas leituras de `energia_solar_leituras` que fecham um `ciclos_solares` | Tabela `ciclos_solares` (V2), campos `credito_liquido_kwh`/`credito_wallace_kwh`/`credito_irma_kwh` |
| "Qualidade da geração" (acima/abaixo do esperado, frescor) | `energia_solar_geracao_diaria` + indicadores de limite (`indicadores`) | `hydrate-onda5-qualidade-geracao.js` |

**Exceção formal vigente** (não mexida por este documento): a divergência 301×361 kWh — fórmula de rateio sem prova externa — continua registrada em `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`, item 2. Ela é sobre COMO interpretar o código 03/103 (`saldoLíquido = exportado−importado` vs só exportado), não sobre a fonte do dado — o medidor novo não resolve essa disputa de fórmula sozinho, mas pode ajudar a confirmar qual leitura está correta (ver seção 5).

## 3. O que muda com o medidor Chint instalado

O medidor Chint bidirecional, lido pelo inversor SAJ via Modbus/RS485 (o cabo Cat6 citado é tipicamente para essa comunicação serial-sobre-Ethernet ou para a própria rede do inversor, a confirmar no manual do equipamento na instalação), passa a dar ao portal/API da SAJ visibilidade de:

- **Geração instantânea** (kWp no momento, não só o acumulado do dia)
- **Consumo instantâneo da casa** (o medidor mede o fluxo líquido no ponto de conexão)
- **Importação em tempo real** (quando a casa consome mais do que gera)
- **Exportação em tempo real** (quando a geração excede o consumo)
- Por derivação: **autoconsumo** (geração usada na hora, nunca passa pela rede) e **dependência da rede** (% do consumo que ainda vem da concessionária)

Isso é qualitativamente diferente do que existe hoje: hoje só há dois pontos por dia (a leitura manual do 03/103, esporádica, e o acumulado diário do robô SAJ). Com o medidor, o que hoje só existe como estimativa (autoconsumo, energia instantânea) passa a ser dado real, potencialmente em intervalos de minutos.

## 4. Tabelas/views/indicadores que deverão evoluir

Esquema atual (confirmado via Supabase, `list_tables`, 08/08/2026):
- `energia_solar_leituras` (leitura_03, leitura_103, geracao_acumulada, ciclo_id, eh_leitura_oficial_energisa, evidencia) — granularidade: 1 linha por leitura manual/esporádica.
- `energia_solar_geracao_diaria` (data, geracao_kwh) — granularidade: 1 linha por dia.
- `ciclos_solares` (leitura_inicio_id, leitura_fechamento_id, credito_liquido_kwh, credito_wallace_kwh, credito_irma_kwh, rateio_*_pct, status) — granularidade: 1 linha por ciclo de faturamento Energisa.

Nenhuma dessas tem granularidade para dado de alta frequência (minutos/horas). **Proposta de evolução, para quando o medidor estiver instalado**:

1. **Tabela nova**: `energia_solar_medicoes_tempo_real` (nome sugerido, a confirmar) — 1 linha por leitura do medidor Chint via API/portal SAJ. Campos sugeridos: `capturado_em` (timestamptz), `geracao_instantanea_w`, `consumo_instantaneo_w`, `importacao_w`, `exportacao_w`, `autoconsumo_w` (derivado ou vindo pronto da API, a confirmar no payload real), `fonte` (`'medidor_saj'`, pra nunca confundir com a estimativa antiga). Granularidade a decidir na hora (a cada leitura da API, ou agregado por minuto/hora — depende do rate limit da API da SAJ, hoje desconhecido).
2. **`energia_solar_geracao_diaria`** pode ganhar colunas agregadas novas (`consumo_diario_kwh`, `autoconsumo_diario_kwh`, `dependencia_rede_pct`) calculadas a partir da tabela de tempo real, sem quebrar o consumidor atual (`hydrate-onda5-qualidade-geracao.js` continua lendo só `geracao_kwh`).
3. **`energia_solar_leituras`** (leitura_03/103 manual) muda de papel: deixa de ser a ÚNICA fonte de importação/exportação e passa a ser, na melhor hipótese, uma **conferência periódica** (comparar o que a concessionária faturou contra o que o medidor Chint mediu) — não necessariamente aposentada, mas com função diferente (auditoria/validação cruzada, não input primário).
4. **Indicador novo em `indicadores`**: limites de alarme para "dependência da rede alta" (ex: se autoconsumo cair abaixo de X%, ou se importação num dia ultrapassar Y kWh), mesmo padrão já usado para `SOLAR_STATUS_LIMITES`/`SOLAR_FRESCOR_LIMITES`.
5. **Card novo no painel** (não no escopo deste documento decidir o design, só registrar a necessidade): "Fluxo de energia agora" — geração/consumo/import/export instantâneos, side a side, com atualização periódica (mesmo padrão de frescor já usado pra geração diária).

## 5. O que poderá ser aposentado (só depois de confirmado o dado real, nunca antes)

- **Estimativa de 50% autoconsumo** (`gerarForecastSolar()`, `energia-solar.js:190`) — hoje é a única forma de estimar energia instantânea; com dado real do medidor, deixa de ser necessária para qualquer cálculo que precise de precisão (o simulador de forecast futuro pode continuar usando a estimativa para projeção de CENÁRIOS futuros hipotéticos — ali ela é uma premissa de simulação legítima, não um substituto de dado real; não confundir os dois usos).
- **`solarGeracaoDiariaEstimada`** (fallback fixo de 25,6 kWh/dia, `vars-energia-solar.js:67`) — só é usado quando falta leitura real do robô SAJ; deixa de ter função no dia a dia assim que o medidor garantir dado contínuo, mas pode continuar existindo como fallback de última instância (ex: API da SAJ fora do ar).
- **Dependência exclusiva da leitura manual 03/103** para o crédito do ciclo — não pode ser totalmente aposentada sem decisão de negócio (a leitura oficial da Energisa, que fecha a fatura de verdade, continua sendo manual/leitura da concessionária — o medidor Chint mede o MESMO ponto só que continuamente, o que ajuda a CONFERIR a leitura oficial, não necessariamente a substituir a fonte de fechamento de fatura). Essa é uma decisão do usuário a ser tomada quando houver dado real dos dois lados para comparar — pode inclusive ajudar a resolver a disputa dos 301×361 kWh, comparando o saldo líquido contínuo do medidor contra as duas leituras isoladas que geraram a divergência.
- **Nada disso deve ser removido nesta fase.** Tudo listado aqui é candidato a aposentadoria, condicionado a: (a) hardware fisicamente instalado, (b) confirmado que o portal/API SAJ realmente expõe os campos novos (a integração pode devolver só um subconjunto), (c) pelo menos 1 ciclo de faturamento completo comparando dado real do medidor contra a leitura manual, para validar que os dois convergem.

## 6. Plano de migração proposto (só executar quando o hardware estiver instalado e transmitindo)

**Fase 0 (agora)**: este documento. Nenhuma ação técnica.

**Fase 1 — instalação física + descoberta de API** (gatilho: usuário confirma instalação e energização):
- Confirmar no portal/app SAJ quais campos novos aparecem (geração instantânea, consumo, import, export) e em que formato/frequência a API expõe isso — `atualizar_geracao_saj.py` precisa ser inspecionado/estendido para descobrir o endpoint real (hoje só lê `energy1Today`/total acumulado).
- Sem alterar o robô em produção ainda — só uma sondagem/teste isolado.

**Fase 2 — captura paralela, sem substituir nada** (baixo risco, aditivo):
- Criar a tabela nova (`energia_solar_medicoes_tempo_real` ou nome equivalente) e estender o robô Python pra também gravar os campos novos, em paralelo ao que já grava hoje. Nenhum consumidor do painel muda ainda — é só acumular histórico real antes de confiar nele.
- Card novo "Fluxo de energia agora" pode ser adicionado nesta fase, como informação adicional, sem substituir nenhum card existente.

**Fase 3 — validação cruzada** (1 ciclo de faturamento completo, mínimo):
- Comparar o saldo líquido do medidor Chint (soma do período) contra a leitura manual 03/103 do mesmo período e contra a fatura oficial da Energisa. Só com essa comparação feita é possível decidir com segurança se algum dos três pode ser aposentado.
- Esse é o momento certo para reconsiderar a exceção formal 301×361 kWh, com dado novo em mãos.

**Fase 4 — decisão de aposentadoria** (decisão do usuário, não de agente):
- Com base na Fase 3, decidir explicitamente o que muda: leitura manual vira só conferência periódica, ou é eliminada; estimativa de 50% autoconsumo sai do caminho crítico (mantida só na simulação de cenários futuros); fallback `solarGeracaoDiariaEstimada` mantido só como rede de segurança.

**Não pular fases.** Energia solar já teve uma exceção formal aberta por causa de números sem prova externa (301×361 kWh) — o mesmo erro (confiar em dado novo sem período de validação) não deve se repetir com o medidor novo.

## 7. Riscos/dependências identificadas desde já

- Comunicação Cat6 sugere Modbus TCP ou RS485-sobre-conversor — o protocolo exato de integração Chint↔SAJ não está documentado neste repositório; só o manual físico do equipamento (ou o instalador) vai confirmar.
- Não há garantia de que o portal/app da SAJ exponha os campos de tempo real via a MESMA API que `atualizar_geracao_saj.py` já usa hoje — pode exigir um endpoint diferente, ou não expor via API nenhuma (só no display local do inversor), o que mudaria bastante o desenho da Fase 1.
- Rate limit/frequência de atualização da API da SAJ é desconhecida para dado de alta frequência — hoje o robô já roda só 2x/dia; dado "instantâneo" pode exigir uma frequência de polling bem maior, com implicações de custo/limite de API a validar na Fase 1.
- **NOVO 17/08/2026 — motivo técnico concreto pro risco acima, achado ao investigar por que o suporte SAJ insiste no "Kit SEC" (medidor DDSU666 + módulo WiFi separado) no projeto do inversor R5-6K-S2-15 do usuário (mesma família de produto, contexto diferente da instalação DDSU666 da Casa da Mãe, mas mesma arquitetura de dado da SAJ).** Datasheet oficial do Kit SEC (lido via Drive, pasta "5 - SEC KIT" compartilhada pelo usuário) diz textualmente: "eSolar SEC uploads the data of smart meter and solar inverter to eSolar cloud server via WiFi or Ethernet" — ou seja, é o módulo SEC (WiFi), não o medidor sozinho, quem sobe o dado pra nuvem eSolar. Isso sugere que o DDSU666 ligado direto no inversor via RS485 (sem SEC) pode ficar restrito a uso LOCAL (display do inversor, função de export limitation) e nunca aparecer na API de nuvem (`iop.saj-electric.com`) que `atualizar_geracao_saj.py`/`sondar_medidor_saj.py` consultam — mesmo com o medidor fisicamente instalado e funcionando. Não é uma confirmação (o inversor pode ter seu próprio canal de upload independente do SEC, já que o robô hoje já recebe `PV_ENERGY` sem nenhum SEC instalado) — é só um motivo concreto a mais pra rodar a Fase 1 (sondagem) assim que o hardware estiver instalado, em vez de assumir que vai funcionar.
- **CONFIRMADO 17/08/2026 (fonte primária: manual oficial "DDSU666 Single Phase Meter User Manual-2019-10-24.pdf", lido na íntegra, fornecido pelo usuário) — a ligação direta RS485 medidor↔inversor É o mecanismo documentado pelo fabricante, sem Kit SEC.** Seção 3.4 do manual ("RS485 interface of inverter") documenta o pinout de conexão direta na porta RS485 do próprio inversor (8 pinos, incluindo alimentação `+7V_W`/`GND_W` e sinal `RS485-A`/`RS485-B`). Seção 6 ("Export limitation function setting") dá o passo a passo oficial pra habilitar limitação de exportação em inversores série R5: baixar o app "eSolar O&M", **Remote control → WiFi/Bluetooth → Local connect** (conecta no módulo de comunicação que o inversor já tem, não no Kit SEC), selecionar "Export limitation setting", senha `201561`, ligar e configurar modo de potência/corrente. **Nenhuma menção ao Kit SEC em nenhuma etapa.** Conclusão: a função central (medidor + export limitation) funciona com ligação direta, configurada via app conectando localmente no inversor — o Kit SEC continua sendo, pelas fontes lidas até agora, um acessório de monitoramento remoto via nuvem (função diferente), não um pré-requisito da função básica. Ainda não é garantia de que os dados de import/export apareçam na API de nuvem que nosso robô consulta (isso continua sendo função só do Kit SEC, não contradito por este manual) — só resolve a dúvida sobre a função local/export limitation, que era o ponto de atrito com o suporte SAJ.
- **CONFIRMAÇÃO FINAL 17/08/2026 (fontes primárias adicionais: datasheet oficial SAJ "Smart Meters" (V1.3-20250904) e manual completo "User Manual SAJ Solar Inverter R5-3K/.../8K-S2", 51 páginas, ambos fornecidos pelo usuário) — 3 documentos oficiais SAJ agora convergem, nenhum menciona o Kit SEC.** O datasheet "Smart Meters" (voltado à solução de "zero export") mostra o diagrama oficial: PV Arrays → Solar Inverter → Smart Meter (DDSU666/DTSU666) → Main Meter → Grid, com RS485 ligado DIRETO entre inversor e medidor — sem nenhum SEC no meio (contrasta com o diagrama do manual de instalação do próprio Kit SEC, que mostra o SEC no meio da cadeia — são dois produtos/topologias diferentes da SAJ, não uma exigência única). O manual do inversor R5 confirma 2 pontos decisivos: (1) seção 6.2, "There is no LCD display screen in R5 series products and they could be monitored through eSolar APP" — bate com a observação do usuário de que o inversor não tem tela; (2) tabela de códigos de erro (7.1), **erro 49 = "Loss of communication between Power Meter and Control Board Master"** — o firmware do inversor tem um código de erro DEDICADO à comunicação com um medidor externo, prova de que é função nativa da placa de controle, não algo que depende de um acessório terceiro. Em 51 páginas de manual completo, "SEC" não aparece nenhuma vez — o que existe documentado é o módulo eSolar GPRS/4G (Bluetooth embutido) ou eSolar WiFi, plugado na porta USB (RS232) do inversor, usado tanto pro app conectar localmente (Bluetooth/WiFi) quanto pra "Remote Monitoring" (upload pra nuvem, seção 6.2.3) — esse é provavelmente o "AIO3" identificado em pesquisa anterior, não o SEC. **Conclusão do usuário validada**: a exigência do suporte SAJ de comprar o Kit SEC não tem respaldo nos 3 manuais oficiais lidos até agora pra função básica (medidor + export limitation + visualização local/remota via app). Ainda não testado fisicamente (hardware chega 25/08) — mas a base documental agora pesa fortemente a favor da ligação direta.

## 8. Mapa de registradores Modbus real (fonte primária — CORRIGIDO, ver nota abaixo)

**⚠ Tentativa 1 (DESCARTADA)**: o primeiro manual lido (`MANUAL DT(S)SU666-Y0.464.1002 V1.4.pdf`, out/2017) era da linha **trifásica** DTSU666/DSSU666 — endereços `101EH`/`1028H` pra energia. Presumiu-se que a família DxSU666 compartilhava o mesmo mapa de registradores entre variantes monofásica/trifásica — **presunção errada**, confirmada ao ler o manual específico da monofásica (abaixo). Os dois modelos usam esquemas de registrador **completamente diferentes**. Não usar os endereços `101EH`/`1028H` pro DDSU666 monofásico.

**Fonte correta**: manual oficial Chint **"DDSU666 Single phase Smart Meter — Operation Manual"** (ZTY0.464.1224, ago/2020), lido na íntegra, fornecido pelo usuário — é o modelo monofásico exato instalado (DDSU666, não DTSU666/DSSU666).

**Protocolo Modbus RTU, comando de leitura = `03H`, escrita = `10H`.**

Config (16-bit, R/W):
- `0005H` ChangeProtocol — **2 = Modbus-RTU, 1 = DL/T645-2007** (dá pra trocar via escrita no próprio registrador — mais prático que os botões físicos, mas só funciona se o medidor já estiver no protocolo que sabe interpretar esse comando; se estiver em DL/T645, a 1ª troca precisa ser feita pelos botões físicos do medidor, comando "long press" → cicla entre `8n2`/`8n1`/`8E1`/`8o1`/`645Protocol` → parar num modo que não seja `645Protocol`)
- `0006H` Addr — endereço Modbus do medidor (1~247)
- `000CH` BAud — baud rate: 1=2400bps, 2=4800bps, 3=9600bps

Dados elétricos (IEEE754 single-precision float, 2 registradores/4 bytes cada, só leitura):
- `2000H` U — tensão
- `2002H` I — corrente
- `2004H` P — potência ativa combinada (kW)
- `200EH` Freq — frequência

Energia (os campos-alvo do firmware do ESP32):
- **`4000H` Ep — energia ativa importada da rede (positiva) — equivalente ao código 03 da Energisa**
- **`400AH` -Ep — energia ativa exportada pra rede (negativa) — equivalente ao código 103 da Energisa**

Esses 2 últimos (`4000H`/`400AH`) são os campos-alvo do firmware do ESP32 (Rota B do plano DDSU666+ESP32+MAX485, ver conversa da sessão 17/08/2026) — substituem a leitura manual do 03/103. Bem mais simples que o mapa da linha trifásica (menos registradores relevantes no total).

## 9. Linha de base da Fase 1 (sondagem rodada 17/08/2026, ANTES da instalação física do medidor)

Usuário rodou `scripts/sync/sondar_medidor_saj.py` manualmente em 17/08/2026 (medidor DDSU666 ainda não instalado, chega 25/08). Resultado:

- `energyDataList` trouxe 2 itens: `PV_ENERGY` (já conhecido) e `REVENUE` (**falso positivo da heurística do script** — é só o cálculo de receita/economia em R$, `todayIncome`/`totalIncome`, não tem relação com medidor externo; não é dado novo relevante).
- **Achado real, fora do `energyDataList`, no JSON de nível superior**: campo `recommendInstallingSecTip`, valor *"Por favor, instale o monitor de carga para monitorar o consumo da carga em tempo real, tornando o consumo mais transparente!"*. O nome do campo (`...Sec...`) amarra esse aviso especificamente ao conceito "SEC" no backend da SAJ, não a "qualquer medidor genérico" — evidência direta (não elaborada por instalador/fórum, veio do próprio schema da API) de que a plataforma rastreia a presença do SEC especificamente pra liberar dado de consumo/carga na nuvem.
- **Interpretação**: reforça a separação já registrada na seção 7/8 entre função LOCAL (export limitation via app, RS485 direto — já confirmada nos 4 manuais oficiais, não depende do SEC) e função de NUVEM (o que nosso robô consulta via `getPlantEnergyStatistics` — continua parecendo amarrada ao SEC, sem confirmação em contrário).
- **Uso desta linha de base**: quando o DDSU666 for instalado fisicamente (25/08) e ligado direto no RS485 do inversor (sem SEC), rodar esta mesma sondagem de novo e comparar: (a) se `recommendInstallingSecTip` sumir ou se `energyDataList` passar a trazer campos de consumo/import/export → a ligação direta resolve também o lado da nuvem, ESP32 vira desnecessário; (b) se o aviso e a ausência de dado de consumo persistirem idênticos → confirma que o SEC é necessário especificamente pra essa parte, e a Rota B (ESP32+MAX485 postando direto no Supabase, bypassando a nuvem SAJ) segue sendo o caminho.
