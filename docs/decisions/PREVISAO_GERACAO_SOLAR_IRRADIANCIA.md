# Previsão de geração solar via irradiância (Open-Meteo) — implementado, com calibração fraca documentada

**Status: IMPLEMENTADO em 16/08/2026, com ressalva explícita de calibração fraca (n pequeno) escrita tanto aqui quanto na própria UI.** Pedido do usuário. A pergunta já tinha sido feita e respondida antes (ver `docs/changelog/PASSAGEM_DE_TURNO.md`, bloco 14/08/2026: *"Perguntas respondidas, sem código: relevância de dados de irradiância solar (Open-Meteo) pra previsão de geração (respondido, não implementado, fica de sugestão pro usuário decidir)"*) — nunca tinha sido codificado até agora.

## 1. Objetivo

Mostrar, na aba Energia Solar do painel, uma previsão de geração (kWh/dia) pros próximos ~7 dias, calibrada com dado real (não um fator "kWh por m² de painel" chutado do catálogo do fabricante).

## 2. Dados usados

### 2.1 Geração real (treino)

Tabela `energia_solar_geracao_diaria` (Supabase, projeto `bakdgacmwlopvrrppwdm`), alimentada 2x/dia pelo robô `scripts/sync/atualizar_geracao_saj.py` (lê o inversor SAJ via API). Consultada em 16/08/2026:

- **16 linhas**, uma por dia, de **01/08/2026 a 16/08/2026** (o robô não tem histórico antes disso — não existe dado de meses anteriores nesta tabela).
- A linha de "hoje" (dia da consulta) é sempre **parcial** — o robô roda só 2x/dia (09h e 17h, horário de Brasília) e grava `energy1Today` (acumulado do dia até aquele instante, não o total final) — por isso ela é **excluída do treino**, tanto na análise abaixo quanto no código em produção.
- Amostra de treino final: **15 dias completos** (01/08 a 15/08/2026).

| Data | Geração real (kWh) |
|---|---|
| 01/08 | 23,39 | 02/08 | 24,42 | 03/08 | 21,96 | 04/08 | 21,01 | 05/08 | 26,67 |
| 06/08 | 24,38 | 07/08 | 31,54 | 08/08 | 30,98 | 09/08 | 30,49 | 10/08 | 26,24 |
| 11/08 | 19,70 | 12/08 | 29,53 | 13/08 | 28,87 | 14/08 | 28,33 | 15/08 | 21,81 |

Média: 25,95 kWh/dia · desvio-padrão populacional: 3,77 kWh/dia.

(A outra fonte candidata, `energia_solar_leituras` — leituras manuais do medidor bidirecional 03/103 — tem só **9 linhas desde 31/07/2026**, é esporádica/quinzenal por natureza, não diária, e não foi usada pra este treino.)

### 2.2 Irradiância (feature preditora)

Open-Meteo, endpoint público `https://api.open-meteo.com/v1/forecast`, parâmetro `daily=shortwave_radiation_sum` (MJ/m²/dia), mesma API (sem chave, gratuita) já usada em `src/solar/hydrate-clima-solar.js` pro clima atual — mesmas coordenadas (lat -7,2306 / lon -35,8811, Campina Grande/PB). A API serve **histórico recente e previsão na mesma chamada** via `past_days`/`forecast_days`, sem precisar de um segundo endpoint de arquivo histórico.

Irradiância histórica cruzada por data com a geração real (01/08 a 16/08/2026):

| Data | Irradiância (MJ/m²) | Geração real (kWh) |
|---|---|---|
| 01/08 | 18,67 | 23,39 |
| 02/08 | 15,84 | 24,42 |
| 03/08 | 17,78 | 21,96 |
| 04/08 | 12,07 | 21,01 |
| 05/08 | 19,23 | 26,67 |
| 06/08 | 19,99 | 24,38 |
| 07/08 | 21,55 | 31,54 |
| 08/08 | 20,95 | 30,98 |
| 09/08 | 20,63 | 30,49 |
| 10/08 | 19,66 | 26,24 |
| 11/08 | 18,98 | 19,70 |
| 12/08 | 21,38 | 29,53 |
| 13/08 | 22,21 | 28,87 |
| 14/08 | 21,18 | 28,33 |
| 15/08 | 19,44 | 21,81 |

## 3. Modelo

Regressão linear simples: `geracao_kWh ≈ a + b × irradiancia(MJ/m²)`.

Ajustada por mínimos quadrados sobre os 15 dias acima (offline, pra validar a ideia antes de decidir implementar — os números abaixo batem com o que o código em produção recalcula sozinho a cada carga de página, usando os mesmos dias reais disponíveis naquele momento):

- **n = 15**
- **a (intercepto) = 6,06**
- **b (coeficiente) = 1,03 kWh gerado por MJ/m² de irradiância**
- **R² = 0,467**
- **MAE (erro médio absoluto) = 2,26 kWh/dia (≈ 8,7% da média)**
- **RMSE = 2,75 kWh/dia**
- **MAPE = 9,34%**

Maior resíduo isolado: 11/08 (previsto 25,62 kWh, real 19,70 kWh, erro de −5,92 kWh — dia com irradiância na média mas geração bem abaixo, possível nebulosidade concentrada no horário de pico não capturada pelo total diário de irradiância, ou perda pontual de geração não relacionada a clima).

## 4. Essa calibração presta?

**Resultado honesto: fraca-a-moderada, mas não é ruído — e o motivo de ainda assim implementar está na seção 6.**

Pontos a favor:
- A relação faz sentido físico e tem o sinal certo (mais irradiância → mais geração, `b > 0`).
- Com n=15, r ≈ 0,68 (raiz de R²) já é estatisticamente significativo (t ≈ 3,4, p < 0,01) — não é uma correlação espúria de amostra pequena, existe uma relação real por trás.
- MAPE de ~9% é um patamar razoável pra previsão de geração solar de curto prazo em clima tropical/parcialmente nublado — na faixa baixa da literatura de modelos baseados só em irradiância (que tipicamente ficam entre 10-20% nessas condições).

Pontos contra (motivo de não tratar isso como "modelo confiável"):
- **n = 15 é pequeno demais pra confiar de olhos fechados.** Só 5 dias de treino "de sobra" além do mínimo estatístico pra uma reta (2 parâmetros). Um ou dois dias atípicos (ex: 11/08) pesam desproporcionalmente no ajuste.
- **Um único mês, uma única estação.** Não há nenhum dia de céu muito mais limpo, nenhuma virada de estação, nenhuma chuva prolongada de vários dias seguidos na amostra — o coeficiente encontrado (1,03 kWh/MJ·m²) pode não generalizar pra condições fora da faixa observada (irradiância de 12 a 22 MJ/m² no treino).
- **R² = 0,467 explica menos da metade da variância dia-a-dia.** O resto (≈53%) vem de fatores que o modelo não vê: temperatura do painel, sujeira/poeira acumulada, distribuição horária da nebulosidade (o total diário de irradiância não distingue "nublado a manhã inteira, limpo à tarde" de "limpo a manhã inteira, nublado à tarde", mas a produção do painel não é simetricamente sensível às duas situações), possíveis quedas de inversor não relacionadas a clima.
- **Intercepto de 6,06 kWh a irradiância zero não faz sentido físico** (sem sol, geração é zero) — é só um artefato do ajuste linear dentro da faixa observada (12-22 MJ/m²), não deve ser extrapolado fora dela.

## 5. Decisão final

**Implementado, mas com a calibração e suas limitações sempre visíveis na própria UI — nunca escondidas atrás de um número "bonito".** Optei por não deixar isso só documentado e fora do painel (a alternativa mais conservadora), pelos seguintes motivos:

1. **O modelo recalibra sozinho, a cada carregamento de página, com o histórico real disponível naquele momento** (`src/solar/previsao-geracao-solar.js`, função `aplicarPrevisaoGeracaoSolar()`) — não há nenhum coeficiente fixo/hardcoded no código. Hoje (16/08/2026) a calibração é fraca porque o robô só existe há 16 dias; daqui a 2-3 meses, com 60-90 dias de histórico cobrindo estações diferentes, a mesma implementação vai calibrar sozinha com uma base muito mais sólida, sem precisar de nenhum redeploy ou nova sessão de análise.
2. **O diagnóstico (n, R², erro médio) é exibido junto do resultado**, sempre, na própria seção do painel (`#previsaoSolarDiagnostico`) — o usuário nunca vê só "vai gerar 27 kWh amanhã" sem também ver "calibrado com 15 dias, R²=0,47 (correlação moderada), erro médio ±2,3 kWh/dia". Isso segue o mesmo padrão já usado no Simulador Regulatório (`energia-solar.js`) e no card de Qualidade da Geração (`hydrate-onda5-qualidade-geracao.js`) — estimativa é permitida quando rotulada como tal, nunca disfarçada de dado real.
3. **Guarda-corpos automáticos contra calibração ruim**: se houver menos de 7 dias completos de histórico (`PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO`), ou se o coeficiente calibrado sair negativo/sem sentido físico (mais irradiância → menos geração, sinal de que os poucos dados disponíveis são ruído puro), a seção inteira fica oculta — nunca mostra um número fabricado a partir de uma calibração sem relação real por trás. Mesmo padrão de "nunca mostrar dado antigo/inventado" já usado em `hydrate-clima-solar.js`.
4. A seção nunca substitui dado real: a leitura real do robô, quando existir pro dia, sempre prevalece sobre a previsão (a previsão só cobre dias estritamente futuros).

Se o usuário achar que mesmo com esses guarda-corpos a seção ainda transmite confiança demais pro estágio atual dos dados (n=15, R²=0,47), a reversão é simples: comentar a chamada de `aplicarPrevisaoGeracaoSolar()` em `src/app/app.js` (mesmo padrão de rollback documentado nos outros módulos solares) — nenhum dado é escrito no banco por este módulo, é 100% leitura (VARS local + Open-Meteo), reverter não tem custo nenhum.

## 6. Onde está o código

- **Cálculo/calibração**: `src/solar/previsao-geracao-solar.js` — `aplicarPrevisaoGeracaoSolar()`, regressão em `__previsaoSolarRegressaoLinear()`.
- **Fonte de treino**: `VARS.SOLAR_GERACAO_DIARIA` (já hidratada em `src/app/app.js` a partir de `window.WALLACE_SOLAR_GERACAO_DIARIA_V2`, que vem da tabela `energia_solar_geracao_diaria`) — nenhum fetch novo ao Supabase, reaproveita o que já existe.
- **Fonte de irradiância**: fetch direto à Open-Meteo (histórico + previsão na mesma chamada), sem chave/cadastro.
- **UI**: `Sistema_Wallace_Lira_Completo.html`, aba Solar (`id="solar"`), nova seção "08 — Previsão de geração (próximos dias)", inserida entre a seção 06 (Economia antes×depois) e o Simulador Regulatório oculto (que mantém o número "07" internamente, mesmo estando `display:none` — por isso a seção nova usa "08", pra não colidir se o Simulador for reativado no futuro).
- **Disparo**: `src/app/app.js`, mesmo bloco que chama `aplicarOnda5QualidadeGeracao()`/`aplicarClimaSolar()`.

## 7. Revisitar quando

- Histórico real passar de ~60-90 dias (cobrindo mais de uma estação) — vale reexecutar esta análise offline (mesmo método, mais dados) e atualizar os números da seção 4 aqui, comparando se R²/MAE melhoraram como esperado.
- Se o medidor bidirecional novo (DDSU666, ver `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`) passar a fornecer geração instantânea/horária, dá pra evoluir de "irradiância diária total → geração diária total" pra um modelo horário, capturando a distribuição da nebulosidade ao longo do dia (uma das limitações apontadas na seção 4) — não faz sentido investir nisso antes de ter esse dado.

## 8. Modelo intradiário separado, implementado 17/08/2026 (curva de elevação solar)

Diferente do modelo acima (previsão de dias FUTUROS via regressão com irradiância), o card "Qualidade da geração" (`src/solar/hydrate-onda5-qualidade-geracao.js`) tem seu próprio problema: comparar a leitura PARCIAL de hoje contra "quanto já deveria ter gerado até agora". Até 17/08/2026 isso usava regra de 3 linear sobre a janela 05:30-18:00 — o usuário reportou, com prints reais de um app de posição solar (sunrise/sunset) e do Shadowmap na coordenada exata do gerador, que o selo "Hoje" ficava sistematicamente 🔴 de manhã e 🟢 à tarde, todo santo dia.

**Causa raiz**: geração solar real não é uma reta ao longo do dia — é uma curva em S (baixa perto do nascer/pôr do sol, mais alta perto do meio-dia). Comparada com uma reta que sobe em ritmo constante, a curva real fica sistematicamente ABAIXO da reta de manhã e ACIMA à tarde, convergindo de novo perto do fim do dia.

**Correção**: `__fracaoAcumuladaCurvaSolar()` (mesmo arquivo) calcula o ângulo de elevação solar real (fórmula padrão de posição solar — declinação por Cooper's equation + equação do tempo + ângulo horário, sem correção de refração) a cada 10 minutos do dia, na coordenada EXATA do gerador (`SOLAR_GERADOR_LAT/LON = -7.215406/-35.856661`, Rua Gildete Gomes Bezerra 79 — leitura GPS real no local, exportada pelo usuário do app Sun Surveyor; substitui uma 1ª correção por geocodificação de endereço via OpenStreetMap Nominatim, que por sua vez substituiu a aproximação de centro-de-cidade usada até então em todo o subsistema solar, ~2,8km de erro). Usa `max(0, sen(elevação))` como peso instantâneo (proxy padrão de irradiância direta em céu limpo) e integra pra achar a fração do total do dia já esperada até um dado horário — validado offline contra nascer/pôr do sol real de 3 datas do ano (erro de poucos minutos, aceitável pro propósito).

Continua sendo uma estimativa de CÉU LIMPO — não considera nuvens do dia específico, isso é dito explicitamente no texto da UI (legenda `legQgHojeParcial`, tabela `legendas`). Não fabrica dado de produção horária real (que não existe — o robô só grava total do dia); é um modelo astronômico, não uma leitura.

Coordenadas exatas também corrigidas em `hydrate-clima-solar.js` e neste mesmo arquivo (seção 2.2 acima) pra consistência — não fazia sentido o subsistema solar ter 2 "verdades" de localização diferentes.
