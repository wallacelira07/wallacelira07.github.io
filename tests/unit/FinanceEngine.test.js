/**
 * FinanceEngine.test.js — Fase 1 da Promoção Operacional
 * ========================================================
 * Prova matemática exigida pela Regra Absoluta da missão: nenhuma extração de
 * cálculo é aceita sem provar que reproduz exatamente o valor já confirmado nas
 * auditorias de domínio (AUDITORIA_DOMINIO_1_CAIXAS.md, _2_REEMBOLSOS.md,
 * _3_PATRIMONIO.md, _6_INDICADORES.md).
 *
 * Todos os números de entrada abaixo são os mesmos números REAIS extraídos do
 * `app.js`/Supabase durante a auditoria (não são fixtures inventadas) — cada bloco
 * cita de qual domínio/seção vem.
 *
 * Rodar: node src/services/FinanceEngine.test.js
 */

const {
  calcularSaldoCaixa,
  calcularCaixaVariavel,
  calcularReembolsos,
  calcularPatrimonioFinanceiroMetaMilhao,
  calcularMetaMilhao,
  calcularPatrimonio,
  calcularNecessidadeLiquida,
  calcularModoOperacional,
  calcularIndicadores,
  calcularDiasOperacao,
  classificarStatusROC,
  calcularROCPosicao,
  calcularROCConsolidado,
  calcularIdade,
  calcularFormacaoPatrimonial,
  calcularEscolaPct,
  calcularEficienciaFinanceira,
  calcularConsumoImprodutivoPct,
  calcularTaxaCrescimentoPct,
  calcularP2P,
  calcularValorMercadoConsolidado,
  calcularContaSemSolar,
  calcularContaComSolar,
  gerarForecastSolar,
  calcularEconomia,
  calcularValorKwhGerado,
  calcularPayback,
  calcularVisaTotalComprometido,
  calcularTotalOpDetalheRecorrenciasAssinaturas,
  calcularLivroLRC,
  calcularReembolsosRecebidosNoCiclo,
  calcularLiquidoMes,
  calcularAporteIncrementalPorCiclo,
} = require('../../src/services/FinanceEngine.js');

let falhas = 0;
let total = 0;

const r2200 = (x) => Math.round(x * 100) / 100;

function assertEqual(nome, valorObtido, valorEsperado) {
  total++;
  const ok = Math.abs(valorObtido - valorEsperado) < 0.005;
  if (!ok) {
    falhas++;
    console.log(`❌ ${nome}: obtido ${valorObtido}, esperado ${valorEsperado}`);
  } else {
    console.log(`✅ ${nome}: ${valorObtido}`);
  }
}

// ============================================================================
// DOMÍNIO 1 — CAIXAS (2 caixas já confirmadas equivalentes na auditoria)
// ============================================================================
console.log('\n--- Domínio 1: Caixas ---');

// Caixa Aniversário Júlio — AUDITORIA_DOMINIO_1_CAIXAS.md: V1 = R$201,20
assertEqual(
  'Caixa Aniversário Júlio',
  calcularSaldoCaixa(200.10, [
    { tx: 'RENDIMENTO-31-07', tipo: 'Entrada', valor: 0.7 },
    { tx: 'AJUSTE-06-08', tipo: 'Entrada', valor: 0.4 },
  ]),
  201.20
);

// Caixa Combustível — caso-piloto do aporte duplicado, V1 real = R$200,90
assertEqual(
  'Caixa Combustível',
  calcularSaldoCaixa(0, [
    { tx: 'TX000145', tipo: 'Entrada', valor: 200.0 },
    { tx: 'RENDIMENTO-31-07', tipo: 'Entrada', valor: 0.5 },
    { tx: 'AJUSTE-06-08', tipo: 'Entrada', valor: 0.4 },
  ]),
  200.90
);

// Caixa Variável — disponível = saldoReal - comprometido (Domínio 1, seção Caixa Variável)
{
  const cv = calcularCaixaVariavel({ saldoReal: 1878.00, comprometido: 584.48, tetoOficial: 2000, tolerenciaTemp: 0 });
  assertEqual('Caixa Variável — disponível', cv.disponivel, 1293.52);
}

// ============================================================================
// DOMÍNIO 2 — REEMBOLSOS (Wärtsilä, ciclo atual, valores confirmados equivalentes V1=V2)
// ============================================================================
console.log('\n--- Domínio 2: Reembolsos ---');
{
  const r = calcularReembolsos({
    reembolsoRecebido: 0,
    reembolsoAReceber: 7022.76,
    faturaWartsila: 5056.95,
    mpCorporativo: 266.23,
    livroLRCVisaOnly: 0,
    livroLRC: 297.31,
    totalOpProvMP: 403.11,
  });
  assertEqual('reembolsoCicloTotal', r.reembolsoCicloTotal, 7022.76);
  assertEqual('cartaoCorporativo (reembolsoPagaCartaoCorporativo)', r.cartaoCorporativo, 297.31);
  assertEqual('passThroughCorporativo', r.passThroughCorporativo, 5620.49);
}

// ============================================================================
// DOMÍNIO 3 — PATRIMÔNIO (valores reais confirmados equivalentes V1=V2)
// ============================================================================
console.log('\n--- Domínio 3: Patrimônio ---');
{
  const pfMeta = calcularPatrimonioFinanceiroMetaMilhao({
    reserva: 100644.15, btgNecton: 14779.62, caixaLance: 4460.74, nectonContaCorrente: 429.75,
  });
  assertEqual('Patrimônio Financeiro (Meta do Milhão)', pfMeta, 120314.26);
  assertEqual('% Meta do Milhão', calcularMetaMilhao(pfMeta), 12.03);

  const bal = calcularPatrimonio({
    patCasa: 110000, patApartamento: 155000, patJazigo: 11000, patSolar: 14800, patCarro: 140000,
    reserva: 100644.15, btgNecton: 14779.62, nectonContaCorrente: 429.75,
    consorcioCasaParcela: 1449.45, consorcioCasaParcelasPagas: 2,
    passivoFinanciamentoCasa: 61326.91, passivoConsorcioAuto: 18998.83,
    pgbl: 133472.56, fgts: 82983.60,
  });
  assertEqual('Patrimônio Físico total', bal.fisicoTotal, 430800.00);
  assertEqual('Ativos Totais', bal.ativosTotal, 549552.42);
  assertEqual('Patrimônio Líquido (com Financiamento Casa V1)', bal.patrimonioLiquido, 469226.68);
  assertEqual('Patrimônio Total Geral (c/ PGBL+FGTS)', bal.patrimonioTotalGeral, 685682.84);
}

// ============================================================================
// DOMÍNIO 6 — INDICADORES (PIB Wallace, Necessidade Líquida, Modo Operacional)
// ============================================================================
console.log('\n--- Domínio 6: Indicadores ---');
{
  const nec = calcularNecessidadeLiquida({
    boletos: 2600, parcelas: 1017.89, consorcios: 1950.77, recorrencias: 1279.65,
    aportesPat: 1893.34, provMP: 403.11, assinaturas: 623.10,
    orcamentoOperacional: 3200.00, coberturaGarantida: 0,
    entradasTotais: 18221.83,
  });
  assertEqual('Total Operacional', nec.totalOperacional, 9767.86);
  assertEqual('Necessidade Total Bruta', nec.necessidadeTotalBruta, 12967.86);
  assertEqual('Necessidade Líquida', nec.necessidadeLiquida, 12967.86);
  assertEqual('Saldo do Ciclo', nec.saldoCiclo, 5253.97);
  assertEqual('Modo Operacional (via texto)', calcularModoOperacional(nec.saldoCiclo) === 'Normal' ? 1 : 0, 1);

  const pib = calcularIndicadores({
    salarioLiquido: 16819.56,
    reembolsoCicloTotal: 7022.76,
    passThroughCorporativo: 5620.49,
    rendimentos: 371.85,
    consumoNaoRecorrente: 355.00,
  });
  assertEqual('PIB Wallace — reembolsos', pib.reembolsosPIB, 1402.27);
  assertEqual('PIB Wallace — total (live V1, hoje)', pib.total, 18238.68);
}

// ============================================================================
// FASE 1B — COBERTURA AMPLIADA
// Todos os valores abaixo são reais: posições de opções reais (opcoesVendidasDetalhe,
// notas de corretagem citadas na POLITICAS_INTERNAS_SISTEMA_WALLACE.md seção 26),
// data de nascimento real, tarifas reais da Resolução ANEEL 3.518/2025. "Hoje" fixado
// em 06/08/2026 (data real desta sessão) pra tornar os testes de data determinísticos.
// ============================================================================
const HOJE = '2026-08-06';
const CDI_MENSAL = 1.10;
const LIMITES = { boaAte: 2.0, muitoBoaAte: 4.0 };

console.log('\n--- Fase 1B.1: ROC (opções reais, Política seção 26) ---');
{
  // PETRT379 — nota 03/07/2026, vencimento 21/08/2026 (ativa), strike 36,86, prêmio 154,84
  const dias1 = calcularDiasOperacao('2026-07-03', '2026-08-21', HOJE);
  assertEqual('PETRT379 — dias em operação', dias1, 34);
  const roc1 = calcularROCPosicao({ quantidade: -200, precoExercicio: 36.86, premioRecebido: 154.84, diasOperacao: dias1, cdiMensalAtual: CDI_MENSAL, limites: LIMITES });
  assertEqual('PETRT379 — capital travado', roc1.capitalTravado, 7372.00);
  assertEqual('PETRT379 — rentabilidade mensal %', r2200(roc1.rentabilidadeMensal * 100), 1.85);

  // ITUBT424 — nota 09/07/2026, vencimento 21/08/2026 (ativa), strike 41,82, prêmio 177,04
  const dias2 = calcularDiasOperacao('2026-07-09', '2026-08-21', HOJE);
  assertEqual('ITUBT424 — dias em operação', dias2, 28);
  const roc2 = calcularROCPosicao({ quantidade: -200, precoExercicio: 41.82, premioRecebido: 177.04, diasOperacao: dias2, cdiMensalAtual: CDI_MENSAL, limites: LIMITES });
  assertEqual('ITUBT424 — capital travado', roc2.capitalTravado, 8364.00);
  assertEqual('ITUBT424 — rentabilidade mensal %', r2200(roc2.rentabilidadeMensal * 100), 2.27);

  const consolidado = calcularROCConsolidado(
    [{ ...roc1, diasOperacao: dias1 }, { ...roc2, diasOperacao: dias2 }],
    CDI_MENSAL, LIMITES
  );
  assertEqual('Consolidado — capital travado', consolidado.capitalTravado, 15736.00);
  assertEqual('Consolidado — prêmio líquido', consolidado.premioLiquido, 331.88);
  assertEqual('Consolidado — status é "Muito Boa"', consolidado.statusROC === 'Muito Boa' ? 1 : 0, 1);
}

console.log('\n--- Fase 1B.2: Formação Patrimonial (Regra Thomas Stanley) ---');
{
  const idade = calcularIdade('1992-05-13', HOJE);
  assertEqual('Idade (real, 13/05/1992)', idade, 34);
  const fp = calcularFormacaoPatrimonial({ idade, entradasTotais: 18221.83, patrimonioTotalGeral: 685682.84 });
  assertEqual('Patrimônio Esperado (Regra Clássica)', fp.patrimonioEsperadoRegraClassica, 743450.66);
  assertEqual('Patrimônio Total em Meses de Renda', fp.patrimonioTotalMesesDeRenda, 37.63);
}

console.log('\n--- Fase 1B.3: Indicadores patrimoniais derivados ---');
assertEqual('% Meta Escola de Júlio (Domínio 1: saldo real R$1.011,86)', calcularEscolaPct(1011.86, 9236.00), 10.96);

console.log('\n--- Fase 1B.4: Indicadores operacionais derivados (Domínio 6) ---');
assertEqual('Eficiência Financeira %', calcularEficienciaFinanceira(18238.68, 18221.83), 100.09);
assertEqual('Consumo Improdutivo %', calcularConsumoImprodutivoPct(355.00, 18221.83), 1.95);

console.log('\n--- Fase 1B.5: P2P (VARS.p2p*, valores reais) ---');
{
  const p2p = calcularP2P({ creditosRestantes: 6, precoCompra: 11, precoVenda: 20 });
  assertEqual('P2P — saldo investido', p2p.saldoInvestido, 66.00);
  assertEqual('P2P — rentabilidade %', p2p.rentabilidadePct, 81.82);
}

console.log('\n--- Fase 1B.8: Opções — valor de mercado consolidado ---');
{
  // 3 posições reais: ITUBT424 (-98, ativa), PETRT379 (-10, ativa), PETRS368W5 (-1, VENCIDA — excluída)
  const vm = calcularValorMercadoConsolidado([
    { valorMercado: -98.00, vencida: false },
    { valorMercado: -10.00, vencida: false },
    { valorMercado: -1.00, vencida: true },
  ]);
  assertEqual('Valor de mercado consolidado (exclui vencida)', vm, -108.00);
}

console.log('\n--- Fase 1B.7: Energia Solar (tarifas reais, Resolução ANEEL 3.518/2025) ---');
{
  // Nota de transparência: a fórmula e as tarifas são 100% reais (config SolarConfig,
  // idêntica ao app.js). O consumo de 400 kWh é um cenário representativo — ainda não
  // validado ponta a ponta contra uma conta impressa real (pendência, ver entrega desta
  // rodada, item "riscos remanescentes").
  const contaSemSolar = calcularContaSemSolar(400, 'MONO');
  assertEqual('Conta SEM solar (400 kWh, ligação MONO)', contaSemSolar.total, 348.72);

  // Conta COM solar: mesmo consumo, geração instantânea de 150 kWh, injeção de 100 kWh,
  // sem créditos anteriores, ano 2026 (60% de Fio B sobre a energia compensada, Lei 14.300).
  const contaComSolar = calcularContaComSolar(400, 150, 100, [], 2026);
  assertEqual('Conta COM solar — energia instantânea', contaComSolar.energiaInstantanea, 150.00);
  assertEqual('Conta COM solar — energia compensada (sem créditos prévios)', contaComSolar.energiaCompensada, 0.00);
  assertEqual('Conta COM solar — crédito novo gerado', contaComSolar.creditoNovo, 100.00);
  assertEqual('Conta COM solar — % Fio B aplicado (2026, Lei 14.300)', contaComSolar.percentualFioBAplicado, 0.60);

  // Mesmo cenário, mas agora com 1 crédito anterior de 80 kWh já disponível (mês 1/2025,
  // dentro da validade de 60 meses) — prova o FIFO consumindo o crédito antigo primeiro.
  const contaComCredito = calcularContaComSolar(400, 150, 100, [{ mes: 1, ano: 2025, energia: 80 }], 2026);
  assertEqual('Conta COM solar + crédito prévio — energia compensada', contaComCredito.energiaCompensada, 80.00);
  assertEqual('Conta COM solar + crédito prévio — crédito remanescente do lote antigo', contaComCredito.creditosAtualizados[0].energia, 0.00);

  const economia = calcularEconomia(contaSemSolar.total, 100.00);
  assertEqual('Economia (conta sem 348,72 - conta com 100,00)', economia, 248.72);
  assertEqual('Payback (invest. R$14.800 / economia anual R$2.984,64)', calcularPayback(14800, r2200(economia * 12)), 4.96);

  // Forecast de 12 meses — prova que a versão sem mutação global do SolarConfig produz
  // o mesmo resultado da lógica original (reajuste tarifário 6% a.a., degradação 0,5% a.a.).
  const forecast = gerarForecastSolar({
    consumoMensalInicial: 400, geracaoMensalInicial: 300, tipoLigacao: 'MONO',
    anoInicial: 2026, mesesForecast: 12, investimento: 14800,
  });
  assertEqual('Forecast 12 meses — gerou 1 ponto de resumo anual', forecast.resumoAnual.length, 1);
  assertEqual('Forecast 12 meses — economia acumulada é positiva', forecast.economiaAcumuladaTotal > 0 ? 1 : 0, 1);
}

console.log('\n--- Fase 1B.9: Consolidações patrimoniais/operacionais restantes (Domínios 3, 4, 6) ---');
{
  // Domínio 4: Visa Infinite R$1.017,89 + Mastercard Black R$5.633,11
  const visa = calcularVisaTotalComprometido({ cartaoInfiniteTotal: 1017.89, cartaoMBTotal: 5633.11, reembolsoPagaCartaoCorporativo: 297.31 });
  assertEqual('Visa+MB — total comprometido', visa.totalComprometido, 6651.00);
  assertEqual('Visa+MB — parte pessoal', visa.pessoal, 6353.69);

  // Domínio 4: recorrências/assinaturas — Visa já migrado totalmente pro MB (visa=0)
  const consolidado = calcularTotalOpDetalheRecorrenciasAssinaturas({ visaRecorrencias: 0, mbRecorrencias: 1279.65, visaAssinaturas: 0, mbAssinaturas: 623.10 });
  assertEqual('Recorrências consolidadas (Visa+MB)', consolidado.recorrencias, 1279.65);
  assertEqual('Assinaturas consolidadas (Visa+MB)', consolidado.assinaturas, 623.10);

  // Domínio 2: livro LRC (corporativo) = Visa-only (0) + MB (297,31)
  assertEqual('Livro LRC consolidado', calcularLivroLRC({ visaCorp: 0, mbCorp: 297.31 }), 297.31);

  // Domínio 2: reembolsos recebidos no ciclo = total do ciclo − a receber
  assertEqual('Reembolsos recebidos no ciclo', calcularReembolsosRecebidosNoCiclo(7022.76, 7022.76), 0.00);
}

console.log('\n--- Fase 1C: liquidoMes e calcularAporteIncrementalPorCiclo (fechamento da camada matemática) ---');
{
  // liquidoMes — valores reais: liquidoReal[0]=16.819,56 (salário já confirmado, TX000136),
  // liquidoProjetadoProximoCiclo=16.048,51 (Estimador de Salário, Ago/26), mediaPonderada12M=17.843,58.
  const base = { liquidoReal: { 0: 16819.56 }, mediaPonderada12M: 17843.58, liquidoProjetadoProximoCiclo: 16048.51 };
  assertEqual('liquidoMes(0) — real já confirmado vence, ignora dia do mês', calcularLiquidoMes({ ...base, indice: 0, diaDoMes: 15 }), 16819.56);

  const semReal = { liquidoReal: {}, mediaPonderada12M: 17843.58, liquidoProjetadoProximoCiclo: 16048.51 };
  assertEqual('liquidoMes(0), dia 15 (12-24), sem real — usa projetado', calcularLiquidoMes({ ...semReal, indice: 0, diaDoMes: 15 }), 16048.51);
  assertEqual('liquidoMes(0), dia 28 (≥25), sem real — mantém projetado', calcularLiquidoMes({ ...semReal, indice: 0, diaDoMes: 28 }), 16048.51);
  assertEqual('liquidoMes(0), dia 5 (1-11), sem real — cai na média ponderada', calcularLiquidoMes({ ...semReal, indice: 0, diaDoMes: 5 }), 17843.58);
  assertEqual('liquidoMes(3), ciclo futuro sem real — sempre média ponderada', calcularLiquidoMes({ ...semReal, indice: 3, diaDoMes: 15 }), 17843.58);

  // calcularAporteIncrementalPorCiclo — valores reais: seguroEmplacamentoAporte=425,
  // BENS_DURAVEIS_APORTE_MENSAL_ALVO=250, escolaJulio2027Aporte=839,64.
  const aportes = { seguroEmplacamentoAporte: 425, bensDuraveisAporteMensalAlvo: 250, escolaJulio2027Aporte: 839.64 };
  assertEqual('Aporte incremental ciclo 0 (Aniversário+Escola atual+Saúde Família ativos)', calcularAporteIncrementalPorCiclo(0, aportes), 1475.00);
  assertEqual('Aporte incremental ciclo 2 (Aniversário já completou)', calcularAporteIncrementalPorCiclo(2, aportes), 1275.00);
  assertEqual('Aporte incremental ciclo 5 (só Saúde Família + contínuos)', calcularAporteIncrementalPorCiclo(5, aportes), 775.00);
  assertEqual('Aporte incremental ciclo 6 (Escola Júlio 2027 entra na janela)', calcularAporteIncrementalPorCiclo(6, aportes), 1614.64);
  assertEqual('Aporte incremental ciclo 16 (Saúde Família some, Escola 2027 ainda ativo)', calcularAporteIncrementalPorCiclo(16, aportes), 1514.64);
  assertEqual('Aporte incremental ciclo 17 (só contínuos restam)', calcularAporteIncrementalPorCiclo(17, aportes), 675.00);
}

console.log('\n--- Fase 2C: funções genéricas de agregação (pra eliminar duplicação nos Services) ---');
{
  const {
    calcularAtivoPassivoLiquido,
    somarCampo,
    calcularSaldoAbertoReembolsos,
    calcularCreditoLiquidoMedidor,
  } = require('../../src/services/FinanceEngine.js');

  // Domínio 3: mesmos 11 itens reais da tabela `patrimonio` (Supabase)
  const itensPatrimonio = [
    { natureza: 'ativo', valor: 11000.00 }, { natureza: 'ativo', valor: 155000.00 },
    { natureza: 'ativo', valor: 2898.90 }, { natureza: 'ativo', valor: 110000.00 },
    { natureza: 'ativo', valor: 14800.00 }, { natureza: 'ativo', valor: 14779.62 },
    { natureza: 'ativo', valor: 429.75 }, { natureza: 'ativo', valor: 100644.15 },
    { natureza: 'ativo', valor: 140000.00 }, { natureza: 'passivo', valor: 61081.39 },
    { natureza: 'passivo', valor: 18998.83 },
  ];
  const pat = calcularAtivoPassivoLiquido(itensPatrimonio);
  assertEqual('Ativo/Passivo/Líquido — total ativo (Domínio 3, V2)', pat.totalAtivo, 549552.42);
  assertEqual('Ativo/Passivo/Líquido — total passivo (Domínio 3, V2)', pat.totalPassivo, 80080.22);
  assertEqual('Ativo/Passivo/Líquido — líquido (Domínio 3, V2)', pat.liquido, 469472.20);

  // Domínio 3: investimentos reais (LFTS11, ITUBT424, PETRT379, P2P)
  const investimentos = [{ valor_atual: 14779.62 }, { valor_atual: -98.00 }, { valor_atual: -10.00 }, { valor_atual: 66.00 }];
  assertEqual('Total investido (soma de valor_atual, Domínio 3)', somarCampo(investimentos, 'valor_atual'), 14737.62);

  // Domínio 4: parcelas ativas reais (15 itens, soma R$1.421,00)
  const parcelasAtivas = [
    { valor_parcela: 134.14 }, { valor_parcela: 13.03 }, { valor_parcela: 189.99 }, { valor_parcela: 66.83 },
    { valor_parcela: 38.25 }, { valor_parcela: 68.01 }, { valor_parcela: 48.33 }, { valor_parcela: 200.99 },
    { valor_parcela: 183.47 }, { valor_parcela: 74.85 }, { valor_parcela: 56.39 }, { valor_parcela: 106.04 },
    { valor_parcela: 50.40 }, { valor_parcela: 166.62 }, { valor_parcela: 23.66 },
  ];
  assertEqual('Total comprometido mensal em parcelas (Domínio 4)', somarCampo(parcelasAtivas, 'valor_parcela'), 1421.00);

  // Domínio 2: reembolso Wärtsilä real (1 linha, pendente)
  const reembolsos = [{ status: 'pendente', valor_a_receber: 7022.76, valor_recebido: 0.00 }];
  assertEqual('Saldo aberto de reembolsos (Domínio 2)', calcularSaldoAbertoReembolsos(reembolsos), 7022.76);

  // Energia: leitura real mais recente (04/08/2026, casa mãe)
  assertEqual('Crédito líquido do medidor (leitura real 04/08)', calcularCreditoLiquidoMedidor(288.00, 51.00), 237.00);
}

console.log('\n--- Fase 1C (06/08/2026, TRILHA B "Promoção Operacional Controlada da V2"): agregadores de Energia e consolidadores patrimoniais restantes ---');
{
  const { calcularLeituraSolarDerivada, calcularMetaInvestimento, calcularProjetoCasaNova } = require('../../src/services/FinanceEngine.js');

  // Energia: única leitura real cadastrada até 06/08/2026 (app.js:1348 — data 31/07, dias:10,
  // leitura03:38, leitura103:210), rateio Wallace 0,71/Irmã 0,29, consumo diário real (fatura
  // Energisa: Wallace 300kWh/30d, Irmã 112kWh/30d).
  const leituraReal = {
    leitura03: 38, leitura103: 210, dias: 10,
    rateioWallace: 0.71, rateioIrma: 0.29,
    consumoDiarioWallace: 300 / 30, consumoDiarioIrma: 112 / 30,
  };
  const solarCalc = calcularLeituraSolarDerivada(leituraReal);
  assertEqual('Leitura solar — crédito líquido (210-38)', solarCalc.creditoLiquido, 172.00);
  assertEqual('Leitura solar — crédito Wallace (71%)', solarCalc.creditoWallace, 122.12);
  assertEqual('Leitura solar — crédito Irmã (29%)', solarCalc.creditoIrma, 49.88);
  assertEqual('Leitura solar — consumo esperado Wallace (10 dias)', solarCalc.consumoEspWallace, 100.00);
  assertEqual('Leitura solar — consumo esperado Irmã (10 dias)', solarCalc.consumoEspIrma, 37.33);
  assertEqual('Leitura solar — saldo Wallace', solarCalc.saldoWallace, 22.12);
  assertEqual('Leitura solar — saldo Irmã', solarCalc.saldoIrma, 12.55);

  // Meta de Investimento: salário real do ciclo (R$16.819,56), 0 aportes BTG/Necton neste ciclo
  // (V151, ambos zerados no início do ciclo 25/07-24/08 — app.js:1132-1133).
  const metaInv = calcularMetaInvestimento({ salario: 16819.56, aporteBTGPactual: 0, depositoAtivacaoNecton: 0 });
  assertEqual('Meta de Investimento — meta (20% do salário)', metaInv.meta, 3363.91);
  assertEqual('Meta de Investimento — investido (0 no ciclo)', metaInv.investido, 0);
  assertEqual('Meta de Investimento — excedente (déficit ainda, início do ciclo)', metaInv.excedente, -3363.91);

  // Projeto Casa Nova: BTG (R$14.779,62) + Caixa Lance (R$3.514,33) vs. meta de lance (R$180.000).
  const pcn = calcularProjetoCasaNova({ btgNecton: 14779.62, caixaLance: 3514.33, metaLance: 180000.00 });
  assertEqual('Projeto Casa Nova — capital disponível', pcn.capitalDisponivel, 18293.95);
  assertEqual('Projeto Casa Nova — % da meta', pcn.pct, 10.16);
  assertEqual('Projeto Casa Nova — falta pra meta', pcn.falta, 161706.05);

  // Casos de borda: nenhum destes 3 aconteceu ainda nos dados reais, mas a fórmula precisa se
  // comportar corretamente quando acontecerem (aporte no mês / meta batida / capital acima da meta).
  const metaInvComAporte = calcularMetaInvestimento({ salario: 16819.56, aporteBTGPactual: 5000, depositoAtivacaoNecton: 0 });
  assertEqual('Meta de Investimento — excedente positivo quando aporte supera a meta', metaInvComAporte.excedente, 1636.09);

  const pcnAcimaDaMeta = calcularProjetoCasaNova({ btgNecton: 150000, caixaLance: 40000, metaLance: 180000 });
  assertEqual('Projeto Casa Nova — falta negativa quando capital já passou da meta', pcnAcimaDaMeta.falta, -10000.00);
  assertEqual('Projeto Casa Nova — % acima de 100 quando capital já passou da meta', pcnAcimaDaMeta.pct, 105.56);
}

// ============================================================================
console.log(`\n${total - falhas}/${total} testes passaram.`);
if (falhas > 0) {
  console.log(`${falhas} FALHA(S) — FinanceEngine NÃO reproduz o app.js exatamente. Não promover.`);
  process.exit(1);
} else {
  console.log('Todos os testes passaram — FinanceEngine reproduz exatamente os valores já auditados do app.js.');
  process.exit(0);
}
