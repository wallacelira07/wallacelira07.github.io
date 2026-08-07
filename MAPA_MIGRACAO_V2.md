# MAPA_MIGRACAO_V2.md — Matriz de Migração Operacional

**Missão**: "Promoção Operacional Controlada da V2", TRILHA A. Inventário de TODO cálculo real encontrado no `app.js` (7.782 linhas), classificado por prontidão pra substituição pelo `FinanceEngine`.

**Regra absoluta em vigor**: nenhuma linha desta tabela autoriza troca de chamada. Isto é levantamento, não execução. A única promoção real feita até agora continua sendo a Caixa Variável (FASE 2E, sessão anterior).

**Legenda de classificação**:
- 🟢 **VERDE** — equivalente no `FinanceEngine` existe, testado, dependências conhecidas e disponíveis (V2 ou VARS). Pronto pra virar candidato de promoção real (TRILHA D).
- 🟡 **AMARELO** — equivalente existe mas com ressalva: dependência ainda não migrada pra V2, teste cobre só o caminho feliz, ou formula tem uma parte não extraída ainda.
- 🔴 **VERMELHO** — sem equivalente no `FinanceEngine`, ou bloqueado estruturalmente (V2 não tem o conceito ainda — ciclo, cascata 5 pernas, `cartao_id`/`usuario_id` populados, opções).

---

## 1. Caixas (Domínio 1)

| Cálculo | Localização (`app.js`) | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| Saldo de qualquer caixa (saldo inicial + Σ transações) | `calcularSaldoCaixa()`, linha 499 | `saldoInicial`, array de transações | `calcularSaldoCaixa()` | Sim (múltiplos casos) | 🟢 — **já promovido** (Caixa Variável, FASE 2E) |
| Caixa Variável: disponível/tetoEfetivo/folegoAteTeto | `recalcularAgregadosDerivados()`, 2758-2767 | `saldoReal`, `comprometido`, `tetoOficial`, `tolerenciaTemp` | `calcularCaixaVariavel()` | Sim | 🟢 (disponível já promovido; tetoEfetivo/folegoAteTeto ainda não, mas função pronta) |
| `caixaVariavelComprometido` (Visa+MB Wallace/Vanessa − Bens Duráveis) | linha 2341 (fora da função principal) | 4 campos `VARS` de cartão + dedução Bens Duráveis | **nenhum** | — | 🔴 — fórmula de composição própria (parte 98), não extraída ainda |
| Soma das 12 reservas (Boletos, Lance, Manutenção...) | `REG.balanco.reservas.total`, 2781-2784 | 12 campos `REG.balanco.reservas.*` | `somarCampo()` (genérico, serve) | Indireto (testado noutro contexto) | 🟡 — função genérica cobre, mas sem teste específico com estes 12 campos |
| Soma operacional (Caixa Variável + Boletos + Mastercard/Infinite) | `REG.balanco.operacional.total`, 2785 | 3 campos | `somarCampo()` | Indireto | 🟡 |
| Crédito líquido do medidor (energia, não confundir com caixa) | ver seção 6 | — | — | — | — |

## 2. Reembolsos / Cascata Wärtsilä (Domínio 2)

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| `reembolsoCicloTotal` = recebido + a receber | `aplicarCicloAoVARS()`, ~2367 | 2 campos do snapshot | `calcularReembolsos().reembolsoCicloTotal` | Sim | 🟢 |
| Cascata perna 3 (`reembolsoPagaCartaoCorporativo` = livroLRCVisaOnly + livroLRC) | `aplicarCicloAoVARS()`, 2411 (**bug corrigido nesta sessão anterior**, ver `AUDITORIA_IMPACTO_BUG_LRC.md`) | `livroLRCVisaOnly` (sempre 0), `livroLRC` (Σ `LRC_LIMBO_TRANSACOES` do ciclo certo) | `calcularReembolsos().cartaoCorporativo` | Sim | 🟡 — fórmula em si pronta e testada; mas depende da entrada `livroLRC` estar cycle-scoped corretamente, o que só passou a ser verdade **depois** da correção do bug LRC — reclassificar 🟢 só depois de 1 ciclo fechado novo confirmar em produção |
| `reembolsoPassThroughCorporativo` = Wärtsilä + MP corp + cartão corp | 2816 | 3 campos já calculados acima | `calcularReembolsos().passThroughCorporativo` | Sim | 🟡 (mesma ressalva da perna 3) |
| `reembolsoSobraPessoal` = Total − Wärtsilä − MP corp − cartão corp − provMP | 3006 | 4 campos + `D.provMP` | `calcularReembolsos().sobraPessoal` | Sim | 🟡 (idem) |
| Cascata completa de 5 pernas (Wärtsilä, MP corp, cartão corp, MP pessoal, sobra) | Política seção 5, campos espalhados | 5 componentes | Parcialmente (`calcularReembolsos` cobre 4 das 5 pernas — falta MP pessoal isolado) | Parcial | 🔴 — `BACKLOG_V2_REEMBOLSOS` (V2 não tem cascata migrada, documentado desde `ARQUITETURA_ERP_WALLACE_V2_ATUALIZADA.md`) |
| `recebidosNoCiclo` = Total do ciclo − A receber | 2918 | 2 campos | `calcularReembolsosRecebidosNoCiclo()` | Sim | 🟢 |

## 3. Patrimônio / Balanço (Domínio 3)

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| Patrimônio Financeiro (Meta do Milhão) = reserva+BTG+Lance+Necton | 2768 | 4 campos | `calcularPatrimonioFinanceiroMetaMilhao()` | Sim | 🟢 |
| % Meta do Milhão | 2769 | patrimônio financeiro | `calcularMetaMilhao()` | Sim | 🟢 |
| Balanço completo (físico, financeiro, passivos, ativos, líquido, geral) | 2789-2806 | ~13 campos `VARS`/`REG` | `calcularPatrimonio()` | Sim | 🟡 — fórmula pronta e testada, mas `BACKLOG_PATRIMONIO` (Financiamento Casa) segue com override manual não sincronizado, já pego pelo Comparator (única divergência real conhecida, ver `FASE_2C_SERVICES.md`) |
| Formação Patrimonial (regra Thomas Stanley: idade × renda×12/10) | 2854-2875 | idade (calculada), entradasTotais, patrimônioTotalGeral | `calcularFormacaoPatrimonial()` + `calcularIdade()` | Sim | 🟢 |
| Meta de Investimento (20% salário vs. investido) | 3049-3051 | salário, aporte BTG, depósito Necton | `calcularMetaInvestimento()` **(novo nesta rodada, TRILHA B)** | Sim | 🟢 |
| Projeto Casa Nova (capital disponível vs. meta de lance) | 3062-3064 | BTG+Necton, Caixa Lance, meta | `calcularProjetoCasaNova()` **(novo nesta rodada, TRILHA B)** | Sim | 🟢 |
| Consórcio Casa Nova (% quitação) | 3061 | `pagoPct` | trivial (`100 - x`), não extraído — baixa prioridade | Não | 🔴 (trivial, mas sem função dedicada ainda) |
| `patrimonioTotalMesesDeRenda` / `patrimonioEsperadoRegraClassica` / faixa | 2866-2875 | entradasTotais, patrimônioTotalGeral, idade | Coberto por `calcularFormacaoPatrimonial()` | Sim | 🟢 |
| Escola de Júlio % da meta | 3045 | saldo, meta | `calcularEscolaPct()` | Sim | 🟢 |

## 4. Cartões / Livros Razão (Domínio 4)

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| Visa total comprometido (Infinite+MB) e parte pessoal | 2770-2771 | 3 campos | `calcularVisaTotalComprometido()` | Sim | 🟡 — fórmula pronta; mas depende da mesma entrada perna-3 (ver seção 2) |
| `totalOpDetalhe.recorrencias`/`.assinaturas` (soma Visa+MB) | 2779-2780 | 4 campos | `calcularTotalOpDetalheRecorrenciasAssinaturas()` | Sim | 🟢 |
| `livroLRC` = Σ `LRC_LIMBO_TRANSACOES` | 2401 (recalculado dentro de `aplicarCicloAoVARS`, pós-correção) | array de transações | `calcularLivroLRC()` | Sim | 🟢 (a fórmula em si; a entrada agora é correta pós-fix) |
| Livros Razão totais (LRC, LRS, LRR agregados) | 3038-3040 | `visaDetalhe`/`mbDetalhe` já calculados | Parcial — `somarCampo()` genérico cobre, função dedicada não existe | Indireto | 🟡 |
| `caixaVariavelComprometido` (ver seção 1) | — | — | — | — | 🔴 |
| Migração `transacoes.cartao_id`/`.usuario_id` (pré-requisito de tudo desta seção na V2) | — | — | N/A (dado, não fórmula) | — | 🔴 — **bloqueador estrutural**, 0/280 preenchidos no histórico migrado (só transação nova via form captura) |

## 5. Indicadores / PIB Wallace (Domínio 6)

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| PIB Wallace (total + componentes) | 2837-2850 | salário, reembolsos líquidos, rendimentos (opções), consumo não recorrente | `calcularIndicadores()` | Sim | 🟡 — depende da perna-3 corrigida (componente "reembolsos") |
| Eficiência Financeira % | 2991 | resultado do fluxo, entradas | `calcularEficienciaFinanceira()` | Sim | 🟢 |
| Consumo Improdutivo % | 2889 | consumo não recorrente, entradas | `calcularConsumoImprodutivoPct()` | Sim | 🟢 |
| Taxa de Crescimento % (vs. ciclo anterior no histórico) | 2894-2896 | PIB atual, PIB do histórico | `calcularTaxaCrescimentoPct()` | Sim | 🟢 |
| Persistência `PIB_WALLACE_HISTORICO` (RPC `registrar_pib_mensal`) | 2900-2914 | — | N/A (efeito colateral de rede, não é cálculo puro) | — | 🔴 (por natureza — nunca vai virar função pura) |
| `mesesNoHistorico` | 2897 | tamanho do histórico | trivial, não extraído | Não | 🔴 (trivial, baixa prioridade) |

## 6. Necessidade / Modo Operacional (Domínio 5)

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| Total Operacional / Necessidade Bruta/Líquida / Saldo do Ciclo (ciclo aberto) | 2932-2936 | 7 componentes (`D.boletos`...`D.assinaturas`) + orçamento + cobertura + entradas | `calcularNecessidadeLiquida()` | Sim | 🟢 (só ciclo aberto — ciclo fechado usa outro caminho, ver linha abaixo) |
| Idem, ciclo **fechado** (lê `snap.necessidadeTotalBruta`/`.necessidadeTotalLiquida` congelados) | 2922-2930 | snapshot congelado | **nenhum** — é leitura direta, não fórmula | — | 🔴 (é dado, não cálculo — nada a extrair) |
| Modo Operacional (Crítico/Baixo/Normal/Alto) | 3001-3004 | `saldoCiclo` | `calcularModoOperacional()` | Sim | 🟢 |
| Projeção de 12 ciclos (parcelas + aportes incrementais) | `somaParcelasProjetadas()` + loop, 2946-2971 | `PARCELAMENTOS_VISA/MP`, calendário de caixas incrementais | `calcularAporteIncrementalPorCiclo()` cobre só o componente de aportes; a soma de parcelas projetadas e o loop de 12 ciclos **não têm função equivalente** | Parcial | 🟡 — metade extraída (aportes), metade não (parcelas projetadas + orquestração do loop) |
| `excedenteOuComplementoProLabore` | 3000 | salário, pró-labore fixo | trivial, não extraído | Não | 🔴 (trivial) |

## 7. Energia Solar (Domínio próprio, fora da numeração 1-6)

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| Conta sem solar | 7510 (app.js) / `calcularContaSemSolar()` | tarifas, consumo | `calcularContaSemSolar()` | Sim | 🟢 |
| Conta com solar + FIFO créditos ANEEL (60 meses) | 7531 (app.js) / `calcularContaComSolar()` | idem + créditos disponíveis, ano (Lei 14.300) | `calcularContaComSolar()` | Sim | 🟢 — **TRILHA B prioridade 1-2, já extraído em rodada anterior** |
| Economia / valor do kWh gerado / payback | 7590-7598 | contas com/sem solar | `calcularEconomia()`, `calcularValorKwhGerado()`, `calcularPayback()` | Sim | 🟢 |
| Forecast de N meses (reajuste, degradação, transição Lei 14.300) | 7486-7534 (versão FinanceEngine, refatorada sem mutação global) | várias | `gerarForecastSolar()` | Sim | 🟢 |
| **Leitura solar derivada (crédito/consumo/saldo por casa, rateio Wallace/Irmã)** | `VARS.SOLAR_LEITURAS_CALC`, 2301-2312 | leitura03/103, dias, rateios, consumo diário por casa | `calcularLeituraSolarDerivada()` **(novo nesta rodada, TRILHA B prioridade 3)** | Sim | 🟢 |
| Rateio mensal agregado (créditoMensalWallace/Irma, alinhamento de série) | 6906-7047 | séries de leituras + geração diária robô SAJ | **nenhum** | — | 🔴 — lógica de alinhamento de série temporal (não é fórmula pontual, é agregação com estado — candidato futuro, não trivial) |
| Casa da Mãe (rateio/geração separados) | comentários em `MAPA_CAMPOS_SUPABASE_VS_CODIGO.md` ("verificar antes de assumir") | `solarConsumoDiarioMae` | **nenhum** | — | 🔴 — nem mapeado por completo ainda no V1, não extrair sem confirmar a fórmula real primeiro |

## 8. P2P

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| Saldo investido / rentabilidade % | 2775-2776 | créditos restantes, preço compra/venda | `calcularP2P()` | Sim | 🟢 |

## 9. Opções vendidas / ROC

| Cálculo | Localização | Dependências | Equivalente `FinanceEngine` | Teste? | Pronto? |
|---|---|---|---|---|---|
| Dias em operação por posição | `calcularROCOpcoes()`, 2178-2185 | data venda, vencimento, hoje | `calcularDiasOperacao()` | Sim | 🟢 |
| Classificação de status ROC (Fraca/Boa/Muito Boa/Excelente) | 2172-2177 | rentabilidade mensal, CDI, limites | `classificarStatusROC()` | Sim | 🟢 |
| ROC por posição (contratos, capital travado, rentabilidade) | 2189-2214 | quantidade, strike, prêmio, dias, CDI | `calcularROCPosicao()` | Sim | 🟢 |
| ROC consolidado da carteira | 2216-2233 | posições com ROC já calculado | `calcularROCConsolidado()` | Sim | 🟢 |
| Comparação com CDI (`comparacaoCDI`, por posição e consolidado) | 2196, 2224 | rentabilidade mensal, CDI mensal | **não extraído separadamente** (é 1 divisão trivial, poderia entrar em `calcularROCPosicao`/`Consolidado` como campo extra) | Não | 🟡 — cálculo simples, fica de fora só porque a extração original não incluiu esse campo específico |
| Valor de mercado consolidado (só posições não vencidas) | 2154 (`opcoesVendidasValorMercado`) | array de posições | `calcularValorMercadoConsolidado()` | Sim | 🟢 |
| `statusPosicao`/`vencida` (classificação booleana por data ou override manual) | 2148-2153 | vencimento, override manual | **não extraído** — é lógica de decisão (não é bem "fórmula"), baixo valor de extração | Não | 🔴 (baixa prioridade, é 1 if/else curto) |
| Migração de opções pra V2 (tabela `investimentos` só tem quantidade/valor_atual, não strike/prêmio/vencimento) | — | — | N/A (dado, não fórmula) | — | 🔴 — **bloqueador estrutural**: schema `investimentos` da V2 não tem campos suficientes pra recalcular ROC lá |

## 10. Dashboard (agregação, não cálculo)

| Item | Observação |
|---|---|
| `DashboardService.js` | **Confirmado, novamente, nesta rodada**: 0% matemática própria — só injeta os outros Services e monta 1 objeto de resumo. Não há "cálculo de Dashboard" pra extrair — TRILHA B prioridade 6 está, portanto, **N/A por natureza**, não pendente. |
| RPC `rpc_dashboard_resumo` (V2, Supabase) | Já existe (parte da Fase 5.5, Performance). Também é só agregação SQL de leituras já existentes — mesma natureza, nada a extrair como "fórmula pura" adicional. |

---

## Totais desta matriz

| Classificação | Quantidade de linhas de cálculo |
|---|---|
| 🟢 VERDE | 27 |
| 🟡 AMARELO | 11 |
| 🔴 VERMELHO | 15 |
| **Total mapeado** | **53** |

**Nota de método**: esta é uma varredura de TODA a função `recalcularAgregadosDerivados()` (linhas 2731-3067, o "motor" central de derivação do sistema) mais as seções de Energia Solar (7486-7598), ROC/Opções (2140-2264) e `aplicarCicloAoVARS()` (2361-2412) — as 4 áreas onde cálculo real acontece no `app.js`. Funções de renderização pura (DOM, `hydrate()`, gráficos) foram **propositalmente excluídas** — não são cálculo, são exibição, fora do escopo desta matriz.
