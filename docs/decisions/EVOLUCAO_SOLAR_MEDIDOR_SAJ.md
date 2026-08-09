# Evolução do domínio Solar — medidor Chint/SAJ (registrado, não implementado)

**Status: DOCUMENTAÇÃO E PLANEJAMENTO APENAS.** Nada neste documento foi implementado — nenhuma tabela nova criada, nenhum código alterado. Existe pra a próxima sessão (ou a mesma, quando o usuário confirmar a instalação física) ter o desenho pronto em vez de decidir do zero.

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
