/**
 * FinanceEngine.js — Sistema Wallace Lira, Arquitetura V2, Fase 1 da Promoção Operacional
 * ======================================================================================
 * NOVO 06/08/2026. Camada única de cálculo financeiro, extraída do `app.js` (parte 138)
 * pra eliminar a duplicação/dispersão de fórmulas já documentada nos Domínios 1-6 da
 * auditoria (AUDITORIA_DOMINIO_1_CAIXAS.md ... AUDITORIA_DOMINIO_6_INDICADORES.md).
 *
 * REGRA DESTA FASE (Fase 1, "criar o mapa" — NÃO é Fase 3 "app.js consome"):
 * Este arquivo é PURO — nenhuma função aqui lê `VARS`, `window`, DOM ou rede. Cada
 * função recebe exatamente os números de que precisa e devolve o resultado, igual à
 * fórmula original do `app.js`. Isso é o que permite provar matematicamente que
 * FinanceEngine === app.js ANTES de qualquer coisa consumir esta camada (regra
 * absoluta da missão: nenhuma alteração sem prova).
 *
 * Cada função abaixo cita a linha exata do `app.js` de onde a fórmula foi extraída,
 * pra rastreabilidade (P6) e pra facilitar reconferir se o app.js driftar depois.
 * NENHUMA fórmula foi alterada, simplificada ou "melhorada" nesta extração — é cópia
 * fiel, testada bit a bit contra os valores já auditados (ver FinanceEngine.test.js).
 *
 * O que este arquivo NÃO faz ainda (fases seguintes, não desta rodada):
 * - Não é chamado por nenhum Service nem pelo app.js (Fase 2/3).
 * - Não substitui nenhum cálculo real na tela (Fase 4, promoção operacional).
 * - Não cobre 100% dos indicadores do Domínio 6 (ROC e Formação Patrimonial ainda
 *   dependem de estruturas de dado mais ricas — `opcoesVendidasDetalhe` completo,
 *   data de nascimento — tratadas como pendência explícita, não fingidas aqui).
 */

const r2 = (x) => Math.round(x * 100) / 100;

// ============================================================================
// CAIXAS (Domínio 1) — app.js:499, calcularSaldoCaixa()
// ============================================================================
/**
 * Saldo de qualquer caixa derivada (18 caixas auditadas no Domínio 1).
 * Cópia fiel de calcularSaldoCaixa(), app.js linha 499.
 */
function calcularSaldoCaixa(saldoInicial, transacoes) {
  const delta = transacoes.reduce((soma, t) => {
    const tipo = (t.tipo || 'Saída').toLowerCase();
    const ehEntrada = tipo.includes('entrada');
    return soma + (ehEntrada ? t.valor : -t.valor);
  }, 0);
  return r2(saldoInicial + delta);
}

/**
 * Caixa Variável: saldo disponível = saldo real − comprometido.
 * app.js:2747 (REG.caixaVariavel.disponivel).
 */
function calcularCaixaVariavel({ saldoReal, comprometido, tetoOficial, tolerenciaTemp = 0 }) {
  const disponivel = r2(saldoReal - comprometido);
  const tetoEfetivo = r2(tetoOficial + tolerenciaTemp);
  const folegoAteTeto = r2(tetoEfetivo - comprometido);
  return { disponivel, tetoEfetivo, folegoAteTeto };
}

// ============================================================================
// REEMBOLSOS (Domínio 2) — app.js:2373-2377 (cascata), app.js:2995 (sobra pessoal)
// ============================================================================
/**
 * Cascata do Reembolso Wärtsilä (Política seção 5) + agregados do ciclo.
 * reembolsoPagaCartaoCorporativo: app.js:2373.
 * reembolsoCicloTotal: app.js:1846.
 * reembolsoSobraPessoal: app.js:2995.
 */
function calcularReembolsos({
  reembolsoRecebido,
  reembolsoAReceber,
  faturaWartsila,
  mpCorporativo,
  livroLRCVisaOnly = 0,
  livroLRC,
  totalOpProvMP = 0,
}) {
  const reembolsoCicloTotal = r2(reembolsoRecebido + reembolsoAReceber);
  const cartaoCorporativo = r2(livroLRCVisaOnly + livroLRC);
  const passThroughCorporativo = r2(faturaWartsila + mpCorporativo + cartaoCorporativo);
  const sobraPessoal = r2(reembolsoCicloTotal - faturaWartsila - mpCorporativo - cartaoCorporativo - totalOpProvMP);
  return { reembolsoCicloTotal, cartaoCorporativo, passThroughCorporativo, sobraPessoal };
}

// ============================================================================
// PATRIMÔNIO (Domínio 3) — app.js:2757 (Meta do Milhão) e :2779-2791 (Balanço)
// ============================================================================
/**
 * Patrimônio Financeiro usado na Meta do Milhão (usa Caixa Lance).
 * ATENÇÃO (achado do Domínio 3): esta é uma fórmula DIFERENTE do Patrimônio
 * Financeiro do Balanço (que usa consórcio pago em vez de Caixa Lance) — não são
 * a mesma métrica, mesmo tendo nome parecido. app.js:2757.
 */
function calcularPatrimonioFinanceiroMetaMilhao({ reserva, btgNecton, caixaLance, nectonContaCorrente }) {
  return r2(reserva + btgNecton + caixaLance + nectonContaCorrente);
}

/** % da Meta do Milhão. app.js:2758. */
function calcularMetaMilhao(patrimonioFinanceiro, metaMilhao = 1000000) {
  return r2((patrimonioFinanceiro / metaMilhao) * 100);
}

/**
 * Balanço Patrimonial completo: físico, financeiro (versão Balanço), passivos,
 * ativos totais e patrimônio líquido. app.js:2779-2791.
 */
function calcularPatrimonio({
  patCasa, patApartamento, patJazigo, patSolar, patCarro,
  reserva, btgNecton, nectonContaCorrente, consorcioCasaParcela, consorcioCasaParcelasPagas,
  passivoFinanciamentoCasa, passivoConsorcioAuto,
  pgbl = 0, fgts = 0,
}) {
  const fisicoTotal = r2(patCasa + patApartamento + patJazigo + patSolar + patCarro);
  const consorcioCasaPago = r2(consorcioCasaParcela * consorcioCasaParcelasPagas);
  const financeiroTotal = r2(reserva + btgNecton + nectonContaCorrente + consorcioCasaPago);
  const passivosTotal = r2(passivoFinanciamentoCasa + passivoConsorcioAuto);
  const ativosTotal = r2(fisicoTotal + financeiroTotal);
  const patrimonioLiquido = r2(ativosTotal - passivosTotal);
  const patrimonioTotalGeral = r2(ativosTotal + pgbl + fgts - passivosTotal);
  return { fisicoTotal, financeiroTotal, consorcioCasaPago, passivosTotal, ativosTotal, patrimonioLiquido, patrimonioTotalGeral };
}

// ============================================================================
// INDICADORES OPERACIONAIS (Domínio 6) — app.js:2921-2993
// ============================================================================
/**
 * Total Operacional, Necessidade Total/Líquida, Saldo do Ciclo.
 * app.js:2921-2925. NENHUM equivalente existe na V2 hoje (Domínio 6, Etapa F) —
 * esta função existe pra ficar pronta quando a V2 tiver os dados-fonte vinculados
 * (bloqueado hoje pelo backlog do Domínio 4: cartao_id/usuario_id nulos).
 */
function calcularNecessidadeLiquida({
  boletos, parcelas, consorcios, recorrencias, aportesPat, provMP, assinaturas,
  orcamentoOperacional, coberturaGarantida = 0, entradasTotais,
}) {
  const totalOperacional = r2(boletos + parcelas + consorcios + recorrencias + aportesPat + provMP + assinaturas);
  const necessidadeTotalBruta = r2(totalOperacional + orcamentoOperacional);
  const necessidadeLiquida = r2(necessidadeTotalBruta - coberturaGarantida);
  const saldoCiclo = r2(entradasTotais - necessidadeTotalBruta);
  return { totalOperacional, necessidadeTotalBruta, necessidadeLiquida, saldoCiclo };
}

/** Modo Operacional (Política seção 10). app.js:2990-2993. */
function calcularModoOperacional(saldoCiclo) {
  if (saldoCiclo < 0) return 'Crítico';
  if (saldoCiclo < 3000) return 'Baixo';
  if (saldoCiclo < 8000) return 'Normal';
  return 'Alto';
}

/**
 * PIB Wallace (total e componentes). app.js:2828-2839.
 * Pendência explícita (Domínio 6): Eficiência Financeira / Consumo Improdutivo % /
 * Taxa de Crescimento dependem de série histórica (PIB_WALLACE_HISTORICO) — fora
 * do escopo desta função pura, tratadas como extensão futura, não fingidas aqui.
 */
function calcularIndicadores({
  salarioLiquido, reembolsoCicloTotal, passThroughCorporativo,
  rendimentos, valorizacaoInvestimentos = 0, consumoNaoRecorrente,
}) {
  const reembolsosPIB = r2(reembolsoCicloTotal - passThroughCorporativo);
  const total = r2(salarioLiquido + reembolsosPIB + rendimentos + valorizacaoInvestimentos - consumoNaoRecorrente);
  return { reembolsosPIB, total };
}

// ============================================================================
// FASE 1B — COBERTURA AMPLIADA (06/08/2026)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. ROC — app.js:2160-2264 (calcularROCOpcoes)
// ----------------------------------------------------------------------------
/**
 * Dias em operação de uma posição de opção. Extraído como função PURA separada
 * da original (que lia `new Date()` direto, app.js:2172) — aqui "hoje" é
 * parâmetro explícito, pra função ser testável de forma determinística.
 * app.js:2190-2198.
 */
function calcularDiasOperacao(dataVendaISO, dataVencimentoISO, hojeISO) {
  const dataVenda = new Date(dataVendaISO);
  const dataVencimento = new Date(dataVencimentoISO);
  const hoje = new Date(hojeISO);
  const dataReferencia = dataVencimento < hoje ? dataVencimento : hoje;
  let dias = Math.round((dataReferencia - dataVenda) / 86400000);
  if (dias < 1) dias = 1;
  return dias;
}

/** Classificação de status do ROC (Política seção 26). app.js:2179-2185. */
function classificarStatusROC(rentMensalPct, cdiMensalAtual, limites = { boaAte: 2.0, muitoBoaAte: 4.0 }) {
  if (rentMensalPct < cdiMensalAtual) return 'Fraca';
  if (rentMensalPct <= limites.boaAte) return 'Boa';
  if (rentMensalPct <= limites.muitoBoaAte) return 'Muito Boa';
  return 'Excelente';
}

/**
 * ROC de 1 posição de opção vendida. app.js:2200-2223.
 * contratos = |quantidade|/100; capitalTravado = strike × 100 × contratos.
 */
function calcularROCPosicao({ quantidade, precoExercicio, premioRecebido, diasOperacao, cdiMensalAtual, limites }) {
  const contratos = Math.round(Math.abs(quantidade) / 100);
  const capitalTravado = precoExercicio != null ? r2(precoExercicio * 100 * contratos) : null;
  const premioLiquido = premioRecebido;
  if (capitalTravado === null || !diasOperacao) {
    return { contratos, capitalTravado, premioLiquido, rentabilidade: null, rentabilidadeMensal: null, rentabilidadeAnual: null, statusROC: null };
  }
  const rentabilidade = premioLiquido / capitalTravado;
  const rentabilidadeMensal = (rentabilidade * 30) / diasOperacao;
  const rentabilidadeAnual = Math.pow(1 + rentabilidade, 365 / diasOperacao) - 1;
  const statusROC = classificarStatusROC(rentabilidadeMensal * 100, cdiMensalAtual, limites);
  return { contratos, capitalTravado, premioLiquido, rentabilidade, rentabilidadeMensal, rentabilidadeAnual, statusROC };
}

/**
 * ROC consolidado da carteira (só posições não vencidas com capital travado
 * calculável). app.js:2229-2255.
 */
function calcularROCConsolidado(posicoesComROC, cdiMensalAtual, limites) {
  const somaCapital = r2(posicoesComROC.reduce((s, o) => s + o.capitalTravado, 0));
  const somaPremio = r2(posicoesComROC.reduce((s, o) => s + o.premioLiquido, 0));
  const rentabilidade = somaCapital > 0 ? somaPremio / somaCapital : null;
  const diasMedios = posicoesComROC.length
    ? Math.round(posicoesComROC.reduce((s, o) => s + o.diasOperacao, 0) / posicoesComROC.length)
    : null;
  const rentabilidadeMensal = rentabilidade !== null && diasMedios ? (rentabilidade * 30) / diasMedios : null;
  const rentabilidadeAnualizada = rentabilidade !== null && diasMedios ? Math.pow(1 + rentabilidade, 365 / diasMedios) - 1 : null;
  const statusROC = rentabilidadeMensal !== null ? classificarStatusROC(rentabilidadeMensal * 100, cdiMensalAtual, limites) : null;
  return { capitalTravado: somaCapital, premioLiquido: somaPremio, rentabilidade, rentabilidadeMensal, rentabilidadeAnualizada, diasMedios, statusROC };
}

// ----------------------------------------------------------------------------
// 2. Formação Patrimonial (Regra Thomas Stanley) — app.js:2843-2864
// ----------------------------------------------------------------------------
/** Idade a partir da data de nascimento, calculada (nunca hardcoded). app.js:2843-2849. */
function calcularIdade(dataNascimentoISO, hojeISO) {
  const hoje = new Date(hojeISO);
  const dn = new Date(dataNascimentoISO + 'T00:00:00');
  let idade = hoje.getFullYear() - dn.getFullYear();
  const aindaNaoFezAniversario = hoje.getMonth() < dn.getMonth() || (hoje.getMonth() === dn.getMonth() && hoje.getDate() < dn.getDate());
  if (aindaNaoFezAniversario) idade--;
  return idade;
}

/**
 * Patrimônio esperado pela regra clássica (Thomas Stanley, "The Millionaire Next
 * Door"): idade × renda anual bruta / 10. app.js:2864.
 */
function calcularFormacaoPatrimonial({ idade, entradasTotais, patrimonioTotalGeral }) {
  const patrimonioEsperadoRegraClassica = r2((idade * entradasTotais * 12) / 10);
  const patrimonioTotalMesesDeRenda = entradasTotais ? r2(patrimonioTotalGeral / entradasTotais) : null;
  const pct = patrimonioEsperadoRegraClassica ? (patrimonioTotalGeral / patrimonioEsperadoRegraClassica) * 100 : null;
  let faixa = 'Sem dado';
  if (pct !== null) {
    if (pct < 50) faixa = 'Abaixo da faixa esperada p/ idade e renda';
    else if (pct < 100) faixa = 'Dentro da faixa, ainda construindo';
    else if (pct < 200) faixa = 'Dentro da faixa, acumulador acima da média';
    else faixa = 'Muito acima da faixa esperada';
  }
  return { patrimonioEsperadoRegraClassica, patrimonioTotalMesesDeRenda, faixa };
}

// ----------------------------------------------------------------------------
// 3. Indicadores patrimoniais derivados — app.js:3033-3034
// ----------------------------------------------------------------------------
/** % da meta da Escola de Júlio (fora da Meta do Milhão por regra P5/V47). app.js:3034. */
function calcularEscolaPct(escolaJulioSaldo, metaEscolaJulio) {
  return r2((escolaJulioSaldo / metaEscolaJulio) * 100);
}

// ----------------------------------------------------------------------------
// 4. Indicadores operacionais derivados — app.js:2878, 2980
// ----------------------------------------------------------------------------
/** Eficiência Financeira % = resultado do fluxo / entradas × 100. app.js:2980. */
function calcularEficienciaFinanceira(resultadoFluxo, entradas) {
  return entradas ? r2((resultadoFluxo / entradas) * 100) : null;
}

/** Consumo Improdutivo % = consumo não recorrente / entradas totais × 100. app.js:2878. */
function calcularConsumoImprodutivoPct(consumoNaoRecorrente, entradasTotais) {
  return entradasTotais ? r2((consumoNaoRecorrente / entradasTotais) * 100) : null;
}

/** Taxa de Crescimento % do PIB Wallace vs. ciclo anterior mais recente. app.js:2883-2885. */
function calcularTaxaCrescimentoPct(pibTotalAtual, pibTotalCicloAnterior) {
  if (pibTotalCicloAnterior === null || pibTotalCicloAnterior === undefined || pibTotalCicloAnterior === 0) return null;
  return r2(((pibTotalAtual - pibTotalCicloAnterior) / Math.abs(pibTotalCicloAnterior)) * 100);
}

// ----------------------------------------------------------------------------
// 5. Indicadores de investimentos (P2P) — app.js:2764-2765
// ----------------------------------------------------------------------------
function calcularP2P({ creditosRestantes, precoCompra, precoVenda }) {
  const saldoInvestido = r2(creditosRestantes * precoCompra);
  const rentabilidadePct = r2(((precoVenda - precoCompra) / precoCompra) * 100);
  return { saldoInvestido, rentabilidadePct };
}

// ----------------------------------------------------------------------------
// 8. Opções — valor de mercado consolidado — app.js:2154
// ----------------------------------------------------------------------------
/** Soma o valor de mercado só das posições NÃO vencidas. app.js:2154. */
function calcularValorMercadoConsolidado(posicoes) {
  return r2(posicoes.filter((o) => !o.vencida).reduce((s, o) => s + o.valorMercado, 0));
}

// ----------------------------------------------------------------------------
// 7. Energia Solar (Lei 14.300 / Resolução ANEEL 3.518/2025) — app.js:7346-7479
// ----------------------------------------------------------------------------
const SolarConfig = {
  tarifas: { TE: 0.25632, FioA: 0.05116, FioB: 0.24028, PerdasTecnicas: 0.04193, PerdasNaoTecnicas: 0.03774, Encargos: 0.04822 },
  tributos: { ICMS: 0.18, PIS_COFINS: 0.045 },
  lei14300: { percentualFioBPorAno: { 2023: 0.15, 2024: 0.30, 2025: 0.45, 2026: 0.60, 2027: 0.75, 2028: 0.90, 2029: 1.00 }, validadeCreditoMeses: 60 },
  disponibilidade: { MONO: 30, BI: 50, TRI: 100 },
  forecast: { reajusteTarifarioAnual: 0.06, inflacaoAnual: 0.045, degradacaoModuloAnual: 0.005, aumentoConsumoAnual: 0.0 },
};

function getDisponibilidade(tipoLigacao) {
  return SolarConfig.disponibilidade[tipoLigacao] ?? SolarConfig.disponibilidade.MONO;
}

function getPercentualFioB(ano) {
  const tabela = SolarConfig.lei14300.percentualFioBPorAno;
  if (tabela[ano] !== undefined) return tabela[ano];
  const anos = Object.keys(tabela).map(Number).sort((a, b) => a - b);
  return ano > anos[anos.length - 1] ? 1.0 : tabela[anos[0]];
}

/** Tarifa "por dentro" (ICMS/PIS/COFINS incidem sobre o próprio preço final). app.js:7385-7388. */
function aplicarTributosPorDentro(tarifaBase, bandeira = 0) {
  const { ICMS, PIS_COFINS } = SolarConfig.tributos;
  return (tarifaBase + bandeira) / (1 - (ICMS + PIS_COFINS));
}

/** Conta SEM geração solar — consumo integral faturado. app.js:7391-7405. */
function calcularContaSemSolar(consumoKWh, tipoLigacao = 'MONO', bandeira = 0, tarifasOverride = null) {
  const { TE, FioA, FioB, PerdasTecnicas, PerdasNaoTecnicas, Encargos } = tarifasOverride || SolarConfig.tarifas;
  const perdas = PerdasTecnicas + PerdasNaoTecnicas;
  const valorTE = consumoKWh * aplicarTributosPorDentro(TE, bandeira);
  const valorFioA = consumoKWh * aplicarTributosPorDentro(FioA);
  const valorFioB = consumoKWh * aplicarTributosPorDentro(FioB);
  const valorPerdas = consumoKWh * aplicarTributosPorDentro(perdas);
  const valorEncargos = consumoKWh * aplicarTributosPorDentro(Encargos);
  const total = r2(valorTE + valorFioA + valorFioB + valorPerdas + valorEncargos);
  return { total, detalhe: { valorTE: r2(valorTE), valorFioA: r2(valorFioA), valorFioB: r2(valorFioB), valorPerdas: r2(valorPerdas), valorEncargos: r2(valorEncargos) } };
}

/**
 * Conta COM geração solar — separa energia instantânea (nunca paga Fio B) de energia
 * compensada via crédito (paga Fio B parcial, conforme % da Lei 14.300 do ano). Usa
 * FIFO de créditos com validade de 60 meses. app.js:7412-7461 (PRIORIDADE 1 desta rodada).
 */
/**
 * Conta COM geração solar — separa energia instantânea (nunca paga Fio B) de energia
 * compensada via crédito (paga Fio B parcial, conforme % da Lei 14.300 do ano). Usa
 * FIFO de créditos com validade de 60 meses. app.js:7973-8030.
 *
 * CORRIGIDO 06/08/2026 (parte 148, achado ao tentar promover): esta cópia estava sem o
 * teto de "disponibilidade" (custo mínimo mensal por tipo de ligação — 30 kWh MONO, 50 BI,
 * 100 TRI, Resolução ANEEL) que o app.js sempre aplicou (`consumoElegivel = consumoKWh -
 * disp`, limitando quanto pode ser compensado por crédito). Sem o teto, esta função deixava
 * compensar mais energia do que a lei permite sempre que havia crédito acumulado suficiente
 * — testado com um cenário real (ligação MONO, consumo baixo, crédito acumulado): a versão
 * sem o teto subestimava a conta em R$1,88 no mês, valor que se acumula ao longo de um
 * forecast de 60 meses. `tipoLigacao` volta a ser parâmetro obrigatório (estava ausente).
 */
function calcularContaComSolar(consumoKWh, geracaoInstantaneaKWh, energiaInjetadaKWh, creditosDisponiveis, tipoLigacao, ano, bandeira = 0, tarifasOverride = null) {
  const disp = getDisponibilidade(tipoLigacao);
  const percentualFioB = getPercentualFioB(ano);
  const { TE, FioA, FioB, PerdasTecnicas, PerdasNaoTecnicas, Encargos } = tarifasOverride || SolarConfig.tarifas;
  const perdas = PerdasTecnicas + PerdasNaoTecnicas;

  const energiaInstantanea = Math.min(geracaoInstantaneaKWh, consumoKWh);
  const consumoElegivel = Math.max(0, consumoKWh - disp);
  const consumoRestante = Math.max(0, consumoKWh - energiaInstantanea);

  const creditosOrdenados = creditosDisponiveis
    .filter((c) => c.energia > 0)
    .sort((a, b) => a.ano * 12 + a.mes - (b.ano * 12 + b.mes));
  let precisaCompensar = Math.min(consumoElegivel, consumoRestante);
  let energiaCompensada = 0;
  const creditosAtualizados = [];
  for (const c of creditosOrdenados) {
    if (precisaCompensar <= 0) { creditosAtualizados.push({ ...c }); continue; }
    const usar = Math.min(c.energia, precisaCompensar);
    energiaCompensada += usar;
    precisaCompensar -= usar;
    creditosAtualizados.push({ ...c, energia: r2(c.energia - usar) });
  }

  const creditoNovo = Math.max(0, r2(energiaInjetadaKWh - energiaCompensada));
  creditosAtualizados.push({ mes: null, ano: null, energia: creditoNovo });

  const energiaFaturada = Math.max(0, consumoKWh - energiaCompensada);

  const valorTE = energiaFaturada * aplicarTributosPorDentro(TE, bandeira);
  const valorFioA = energiaFaturada * aplicarTributosPorDentro(FioA);
  const valorFioB = energiaCompensada * aplicarTributosPorDentro(FioB) * percentualFioB;
  const valorPerdas = energiaFaturada * aplicarTributosPorDentro(perdas);
  const valorEncargos = energiaFaturada * aplicarTributosPorDentro(Encargos);
  const total = r2(valorTE + valorFioA + valorFioB + valorPerdas + valorEncargos);

  return {
    total,
    energiaInstantanea: r2(energiaInstantanea),
    energiaCompensada: r2(energiaCompensada),
    energiaFaturada: r2(energiaFaturada),
    creditoNovo,
    creditosAtualizados,
    percentualFioBAplicado: percentualFioB,
    detalhe: { valorTE: r2(valorTE), valorFioA: r2(valorFioA), valorFioB: r2(valorFioB), valorPerdas: r2(valorPerdas), valorEncargos: r2(valorEncargos) },
  };
}

/** Economia mensal com solar. app.js:7471-7473. */
function calcularEconomia(contaSemSolar, contaComSolar) {
  return r2(contaSemSolar - contaComSolar);
}

/** Valor do kWh gerado (economia / energia gerada). app.js:7475-7477. */
function calcularValorKwhGerado(economia, energiaGeradaKWh) {
  return energiaGeradaKWh > 0 ? r2(economia / energiaGeradaKWh) : 0;
}

/** Payback simples do investimento solar. app.js:7479-7481. */
function calcularPayback(investimento, economiaAnual) {
  return economiaAnual > 0 ? r2(investimento / economiaAnual) : null;
}

/**
 * Forecast de N meses (reajuste tarifário, degradação do módulo, transição Lei 14.300).
 * app.js:7486-7534. Refatorado pra NÃO mutar `SolarConfig.tarifas` global (o original
 * mutava e restaurava dentro do loop, funciona mas é efeito colateral arriscado numa
 * função pura testável — aqui as tarifas ajustadas são passadas por parâmetro pro
 * `calcularContaSemSolar`/`calcularContaComSolar`, mesmo resultado, sem mutação).
 */
function gerarForecastSolar({ consumoMensalInicial, geracaoMensalInicial, tipoLigacao, anoInicial, mesesForecast, investimento }) {
  let creditosAtuais = [];
  let economiaAcumulada = 0;
  const resumoAnual = [];
  let economiaDoAnoAtual = 0;

  for (let m = 0; m < mesesForecast; m++) {
    const anosPassados = Math.floor(m / 12);
    const anoCorrente = anoInicial + anosPassados;
    const fatorReajuste = Math.pow(1 + SolarConfig.forecast.reajusteTarifarioAnual, anosPassados);
    const fatorDegradacao = Math.pow(1 - SolarConfig.forecast.degradacaoModuloAnual, anosPassados);
    const fatorConsumo = Math.pow(1 + SolarConfig.forecast.aumentoConsumoAnual, anosPassados);

    const consumoDoMes = consumoMensalInicial * fatorConsumo;
    const geracaoDoMes = geracaoMensalInicial * fatorDegradacao;
    const energiaInstantaneaEstimada = Math.min(geracaoDoMes, consumoDoMes) * 0.5;
    const energiaInjetadaEstimada = Math.max(0, geracaoDoMes - energiaInstantaneaEstimada);

    creditosAtuais = creditosAtuais.filter((c) => m - (c.mesIndex ?? -999) < SolarConfig.lei14300.validadeCreditoMeses);

    const tarifasAjustadas = {};
    Object.keys(SolarConfig.tarifas).forEach((k) => (tarifasAjustadas[k] = SolarConfig.tarifas[k] * fatorReajuste));

    const semSolar = calcularContaSemSolar(consumoDoMes, tipoLigacao, 0, tarifasAjustadas);
    const comSolar = calcularContaComSolar(consumoDoMes, energiaInstantaneaEstimada, energiaInjetadaEstimada, creditosAtuais, tipoLigacao, anoCorrente, 0, tarifasAjustadas);

    const economiaDoMes = calcularEconomia(semSolar.total, comSolar.total);
    economiaAcumulada = r2(economiaAcumulada + economiaDoMes);
    economiaDoAnoAtual += economiaDoMes;

    creditosAtuais = comSolar.creditosAtualizados.map((c) => (c.mes === null ? { ...c, mesIndex: m } : c));

    if ((m + 1) % 12 === 0 || m === mesesForecast - 1) {
      resumoAnual.push({
        ano: anoCorrente,
        mesFinal: m + 1,
        economiaAcumulada,
        payback: calcularPayback(investimento, economiaDoAnoAtual > 0 ? (economiaDoAnoAtual * 12) / ((m % 12) + 1) : 0),
      });
      economiaDoAnoAtual = 0;
    }
  }
  return { economiaAcumuladaTotal: economiaAcumulada, resumoAnual };
}

// ----------------------------------------------------------------------------
// 5/6. Consolidações patrimoniais e operacionais restantes — app.js:2759-2760, 2768-2769, 3027
// ----------------------------------------------------------------------------
/** Total comprometido (Visa Infinite + Mastercard Black) e parte pessoal. app.js:2759-2760. */
function calcularVisaTotalComprometido({ cartaoInfiniteTotal, cartaoMBTotal, reembolsoPagaCartaoCorporativo }) {
  const totalComprometido = r2(cartaoInfiniteTotal + cartaoMBTotal);
  const pessoal = r2(totalComprometido - reembolsoPagaCartaoCorporativo);
  return { totalComprometido, pessoal };
}

/** Recorrências/Assinaturas consolidadas (Visa + MB). app.js:2768-2769. */
function calcularTotalOpDetalheRecorrenciasAssinaturas({ visaRecorrencias, mbRecorrencias, visaAssinaturas, mbAssinaturas }) {
  return {
    recorrencias: r2(visaRecorrencias + mbRecorrencias),
    assinaturas: r2(visaAssinaturas + mbAssinaturas),
  };
}

/** Livro LRC (corporativo) consolidado — Visa-only + MB. app.js:3027. Único dos 3 (LRW/LRV/LRC) com fórmula viva hoje — LRW/LRV viraram filtro manual por ciclo desde V152/V153, não são mais derivados. */
function calcularLivroLRC({ visaCorp, mbCorp }) {
  return r2(visaCorp + mbCorp);
}

/** Reembolsos recebidos no ciclo = Total do ciclo − A receber. app.js:2911. */
function calcularReembolsosRecebidosNoCiclo(reembolsoCicloTotal, reembolsosAReceber) {
  return r2(reembolsoCicloTotal - reembolsosAReceber);
}

// ----------------------------------------------------------------------------
// Fase 1C — fechamento da camada matemática (06/08/2026)
// ----------------------------------------------------------------------------
/**
 * "Líquido do mês" pro cenário Superávit Normal / Déficit Zero. app.js:725-732.
 * Extraído como função PURA: a original lia `REG` e `new Date()` direto — aqui
 * cada dependência é parâmetro explícito (`diaDoMes` no lugar de `new Date().getDate()`),
 * mesma técnica já usada em `calcularDiasOperacao`. Mesma semântica exata: valor real
 * confirmado > (só pro ciclo atual, a partir do dia 12) líquido projetado > fallback
 * (média ponderada 12 meses).
 */
function calcularLiquidoMes({ indice, liquidoReal = {}, mediaPonderada12M, liquidoProjetadoProximoCiclo, diaDoMes }) {
  const real = liquidoReal[indice];
  if (real !== undefined && real !== null) return real;
  if (indice === 0 && diaDoMes >= 12) return liquidoProjetadoProximoCiclo;
  return mediaPonderada12M;
}

/**
 * Aporte incremental projetado pro ciclo `i` (meses a partir de hoje) — soma os
 * aportes contínuos (Seguro Emplacamento, Bens Duráveis, Saúde-Emagrecimento) com
 * os aportes que têm data de término conhecida (Aniversário Júlio, Escola Júlio
 * ciclo atual, Saúde Família, Escola Júlio 2027), cada um dentro da sua janela de
 * meses. app.js:2707-2714. Cópia fiel — já era pura no original (só lê `VARS`, que
 * aqui são parâmetros). ATUALIZADO 12/08/2026: saudeEmagrecimentoAporte (caneta
 * Ozivy Semaglutida) somado aos contínuos, mesmo tratamento do Seguro Emplacamento.
 */
// MIGRADO 19/08/2026 (varredura anti-hardcode, autorização explícita do usuário pra editar este
// arquivo protegido): os 3 literais de projeção (200/500/100) viraram parâmetros com default
// IDÊNTICO ao valor anterior — mudança puramente mecânica (parametrizar, não reformular a fórmula).
// ACHADO na mesma investigação: esta função é a cópia "pura" da Fase 1 (ver cabeçalho do arquivo,
// "não é chamado por nenhum Service nem pelo app.js") — a que RODA DE VERDADE em produção é
// app.js:calcularAporteIncrementalPorCiclo() (V1, assinatura diferente, só `(i)`), e ela já tinha
// dessincronizado desta cópia (o item Saúde Família foi corrigido lá em 16/08/2026 e nunca replicado
// aqui). O fix real dos 2 hardcodes (200/500) foi aplicado em app.js, não aqui — esta mudança serve
// só pra esta cópia não ficar pra trás de novo se/quando a Fase 2/3 (consumo real desta camada)
// acontecer. NÃO foi possível rodar as 18 fases de validação nesta sessão (sem Node.js neste
// ambiente) — recomendado rodar `node tests/unit/FinanceEngine.test.js` e conferir
// `WALLACE_VALIDACAO_RUNTIME` (18/18) no navegador antes de considerar validado.
function calcularAporteIncrementalPorCiclo(i, { seguroEmplacamentoAporte, bensDuraveisAporteMensalAlvo, escolaJulio2027Aporte, saudeEmagrecimentoAporte, projecaoCiclo1_2 = 200, projecaoCiclo1_4 = 500, projecaoCiclo1_16 = 100 }) {
  let v = seguroEmplacamentoAporte + bensDuraveisAporteMensalAlvo + saudeEmagrecimentoAporte;
  if (i < 2) v += projecaoCiclo1_2;
  if (i < 4) v += projecaoCiclo1_4;
  if (i < 16) v += projecaoCiclo1_16;
  if (i >= 6 && i <= 16) v += escolaJulio2027Aporte;
  return r2(v);
}

// ----------------------------------------------------------------------------
// Fase 2C — funções genéricas de agregação (pra eliminar duplicação nos Services)
// ----------------------------------------------------------------------------
/**
 * Ativo/Passivo/Líquido genérico, a partir de uma lista de itens com campos
 * `natureza` ('ativo'|'passivo') e `valor` — mesmo shape da tabela `patrimonio`
 * da V2. Usada por `PatrimonioService.getPatrimonioAtual()` no lugar de somar
 * na mão (Fase 2C.2: eliminar duplicação de lógica).
 */
function calcularAtivoPassivoLiquido(itens) {
  const totalAtivo = r2(itens.filter((i) => i.natureza === 'ativo').reduce((s, i) => s + Number(i.valor), 0));
  const totalPassivo = r2(itens.filter((i) => i.natureza === 'passivo').reduce((s, i) => s + Number(i.valor), 0));
  return { totalAtivo, totalPassivo, liquido: r2(totalAtivo - totalPassivo) };
}

/** Soma genérica de 1 campo numérico de uma lista de itens. Usada por
 * `PatrimonioService.getTotalInvestido()` e `ParcelaService.getTotalComprometidoMensal()`. */
function somarCampo(itens, campo) {
  return r2(itens.reduce((s, i) => s + Number(i[campo] || 0), 0));
}

/** Saldo aberto de reembolsos (a receber − recebido), só os não quitados.
 * Usada por `ReembolsoService.getTotalAReceber()`. */
function calcularSaldoAbertoReembolsos(itens) {
  return r2(
    itens
      .filter((i) => i.status !== 'quitado')
      .reduce((s, i) => s + (Number(i.valor_a_receber) - Number(i.valor_recebido)), 0)
  );
}

/** Crédito líquido do medidor bidirecional (código 103 injetado − código 03
 * consumido da rede). Usada por `EnergiaService.getCreditoLiquidoAtual()`. */
// ============================================================================
// FASE 1C — COBERTURA AMPLIADA (06/08/2026, TRILHA B da missão "Promoção
// Operacional Controlada da V2"). Prioridades 3 e 7 da missão: agregadores de
// Energia (rateio por leitura) e consolidadores patrimoniais restantes que
// ainda não tinham função pura equivalente. Prioridades 1-2 (calcularConta-
// ComSolar + FIFO créditos ANEEL) já estavam prontas desde a Fase 1B (linha
// 350 acima). Prioridades 4-5 (P2P, Opções) também já cobertas (calcularP2P,
// calcularROC*, calcularValorMercadoConsolidado). Prioridade 6 (Dashboard):
// SEM equivalente aqui de propósito — `DashboardService.js` não tem matemática
// própria, só orquestra os outros Services (confirmado na Fase 2C, FASE_2C_
// SERVICES.md) — nada pra extrair.
// ============================================================================

/**
 * Deriva crédito/consumo/saldo por casa (Wallace/Irmã) a partir de 1 leitura
 * bidirecional do medidor solar. Fórmula de Base_Calculo_Rateio_Solar.md
 * seção 3, cópia fiel de VARS.SOLAR_LEITURAS_CALC (app.js:2301-2312).
 * NÃO cobre a casa da mãe (rateio separado, medidor próprio — fora do escopo
 * desta função, que segue exatamente o que o app.js já calcula aqui).
 *
 * VERIFICADO 08/08/2026 (Solar entra na V2 — modelo de ciclos de crédito): esta fórmula
 * (creditoLiquido = leitura103 − leitura03) NÃO mudou — só a origem de VARS.SOLAR_LEITURAS
 * mudou (agora vem de `energia_solar_leituras`/V2 via app.js, antes vinha de wallace_dados).
 * O comparador em promocoes-financeengine.js (seção "Leitura Solar Derivada") continua batendo
 * porque os dois lados (esta função e VARS.SOLAR_LEITURAS_CALC) leem o MESMO array já trocado na
 * origem — nenhuma divergência nova esperada em WALLACE_VALIDACAO_RUNTIME. O conceito novo de
 * "ciclo atual" (subtrai o baseline do ciclo aberto) vive só em graficos-cenarios-lazy.js
 * (seções 10-12), não nesta função — que continua representando o acumulado desde a leitura=0.
 */
function calcularLeituraSolarDerivada({ leitura03, leitura103, dias, rateioWallace, rateioIrma, consumoDiarioWallace, consumoDiarioIrma }) {
  const creditoLiquido = r2(leitura103 - leitura03);
  const creditoWallace = r2(creditoLiquido * rateioWallace);
  const creditoIrma = r2(creditoLiquido * rateioIrma);
  const consumoEspWallace = r2(consumoDiarioWallace * dias);
  const consumoEspIrma = r2(consumoDiarioIrma * dias);
  const saldoWallace = r2(creditoWallace - consumoEspWallace);
  const saldoIrma = r2(creditoIrma - consumoEspIrma);
  return { creditoLiquido, creditoWallace, creditoIrma, consumoEspWallace, consumoEspIrma, saldoWallace, saldoIrma };
}

/**
 * Meta de Investimento do ciclo (20% do salário) vs. investido (BTG + Necton)
 * e o excedente/déficit. Cópia fiel de app.js:3049-3051.
 */
function calcularMetaInvestimento({ salario, aporteBTGPactual, depositoAtivacaoNecton, percentualMeta = 0.20 }) {
  const meta = r2(salario * percentualMeta);
  const investido = r2(aporteBTGPactual + depositoAtivacaoNecton);
  const excedente = r2(investido - meta);
  return { meta, investido, excedente };
}

/**
 * Projeto Casa Nova: capital disponível (BTG+Necton + Caixa Lance) vs. meta de
 * lance, % atingido e quanto falta. Cópia fiel de app.js:3062-3064.
 */
function calcularProjetoCasaNova({ btgNecton, caixaLance, metaLance }) {
  const capitalDisponivel = r2(btgNecton + caixaLance);
  const pct = r2((capitalDisponivel / metaLance) * 100);
  const falta = r2(metaLance - capitalDisponivel);
  return { capitalDisponivel, pct, falta };
}

function calcularCreditoLiquidoMedidor(leitura103, leitura03) {
  return r2(leitura103 - leitura03);
}

module.exports = {
  // Fase 1
  calcularSaldoCaixa,
  calcularCaixaVariavel,
  calcularReembolsos,
  calcularPatrimonioFinanceiroMetaMilhao,
  calcularMetaMilhao,
  calcularPatrimonio,
  calcularNecessidadeLiquida,
  calcularModoOperacional,
  calcularIndicadores,
  // Fase 1B
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
  getDisponibilidade,
  getPercentualFioB,
  aplicarTributosPorDentro,
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
  calcularAtivoPassivoLiquido,
  somarCampo,
  calcularSaldoAbertoReembolsos,
  calcularCreditoLiquidoMedidor,
  calcularLeituraSolarDerivada,
  calcularMetaInvestimento,
  calcularProjetoCasaNova,
};
