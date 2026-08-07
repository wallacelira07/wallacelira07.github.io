// MÓDULO: Energia Solar — Simulador Regulatório (Lei 14.300 / ANEEL, seção 13)
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module — os
// onclick inline do HTML dependem de função global, converter pra type="module" quebraria).
// Carrega DEPOIS do app.js terminar (via onload em Sistema_Wallace_Lira_Completo.html) e
// ANTES de src/modules/promocoes-financeengine.js, que depende de SolarConfig/
// calcularContaSemSolar/calcularContaComSolar já existirem (comparador V1↔V2 da FASE 2K).
// Conteúdo idêntico ao que estava em app.js (linhas 7512-7765 antes da extração) — nenhuma
// fórmula, comportamento ou resultado foi alterado, só o arquivo que hospeda o código.

// ===================================================================================
// NOVO 03/08/2026 - SIMULADOR REGULATORIO SOLAR (Lei 14.300 / ANEEL) - secao 13
// ===================================================================================
// Baseado em especificacao tecnica trazida pelo usuario. 3 decisoes de escopo
// confirmadas por ele antes de implementar:
// 1) O RATEIO real do sistema continua PARALELO (71% Wallace / 29% Wellida,
//    simultaneo) - a "ordem de prioridade" (Apartamento->Casa Mae->Casa Irma)
//    descrita no documento original NAO é usada aqui, é só um modelo generico
//    de referencia que o documento trazia.
// 2) Sem mudanca de arquitetura - continua tudo dentro deste app.js unico,
//    sem virar modulos/classes TypeScript separados (o documento sugeria isso,
//    mas o usuario preferiu so aproveitar as FORMULAS/regras de negocio).
// 3) Isso é uma camada de SIMULACAO/PROJECAO, aditiva - nao substitui nem mexe
//    nos calculos das secoes 09-12 (que usam leitura REAL dos codigos 03/103,
//    sem estimar, regra ja documentada). O simulador é so pra planejamento
//    (payback, economia projetada, cenarios futuros de reajuste tarifario).

// ----- Configuracao parametrizada (nunca numero solto dentro das funcoes) -----
const r2Sim = x => Math.round(x*100)/100; // r2 original é privado de outra função (escopo diferente) - versão própria aqui
const SolarConfig = {
  tarifas: { // Resolucao Homologatoria ANEEL 3518/2025, Grupo B1 Residencial, vigencia 28/08/2025
    TE: 0.25632,
    TUSD: 0.41933,
    FioA: 0.05116,
    FioB: 0.24028,
    PerdasTecnicas: 0.04193,
    PerdasNaoTecnicas: 0.03774,
    Encargos: 0.04822
  },
  tributos: { ICMS: 0.18, PIS_COFINS: 0.045 }, // PIS+COFINS combinado p/ simulacao, conforme doc
  bandeiras: { Verde: 0, Amarela: 0.0188, Vermelha1: 0.0446, Vermelha2: 0.0787 },
  lei14300: {
    // percentual do Fio B cobrado sobre energia compensada, por ano (regra de transicao) -
    // parametrizado por ano, nunca fixo dentro de funcao (pedido explicito do documento)
    percentualFioBPorAno: { 2023:0.15, 2024:0.30, 2025:0.45, 2026:0.60, 2027:0.75, 2028:0.90, 2029:1.00 },
    validadeCreditoMeses: 60
  },
  disponibilidade: { MONO: 30, BI: 50, TRI: 100 }, // kWh
  forecast: {
    reajusteTarifarioAnual: 0.06,   // 6% a.a., padrao de mercado p/ simulacao (ajustavel)
    inflacaoAnual: 0.045,           // 4.5% a.a.
    degradacaoModuloAnual: 0.005,   // 0.5% a.a., padrao garantia de fabricante
    aumentoConsumoAnual: 0.0        // 0% a.a. default - usuario pode simular cenarios de aumento
  }
};

function getDisponibilidade(tipoLigacao){
  return SolarConfig.disponibilidade[tipoLigacao] ?? SolarConfig.disponibilidade.MONO;
}

function getPercentualFioB(ano){
  const tabela = SolarConfig.lei14300.percentualFioBPorAno;
  if(tabela[ano] !== undefined) return tabela[ano];
  const anos = Object.keys(tabela).map(Number).sort((a,b)=>a-b);
  return ano > anos[anos.length-1] ? 1.00 : tabela[anos[0]]; // apos 2029: 100% (fim da transicao)
}

// Tarifa "por dentro" (ICMS/PIS/COFINS incidem sobre o proprio preco final, nao por fora)
function aplicarTributosPorDentro(tarifaBase, bandeira){
  const {ICMS, PIS_COFINS} = SolarConfig.tributos;
  return (tarifaBase + bandeira) / (1 - (ICMS + PIS_COFINS));
}

// Conta SEM geracao solar - consumo integral faturado, sem nenhuma compensacao
function calcularContaSemSolar(consumoKWh, tipoLigacao, bandeira=0){
  const disp = getDisponibilidade(tipoLigacao);
  const {TE, FioA, FioB, PerdasTecnicas, PerdasNaoTecnicas, Encargos} = SolarConfig.tarifas;
  const perdas = PerdasTecnicas + PerdasNaoTecnicas;
  const teComImposto = aplicarTributosPorDentro(TE, bandeira);
  const fioAComImposto = aplicarTributosPorDentro(FioA, 0);
  const fioBComImposto = aplicarTributosPorDentro(FioB, 0);
  const perdasComImposto = aplicarTributosPorDentro(perdas, 0);
  const encargosComImposto = aplicarTributosPorDentro(Encargos, 0);
  const valorTE = consumoKWh * teComImposto;
  const valorFioA = consumoKWh * fioAComImposto;
  const valorFioB = consumoKWh * fioBComImposto; // sem solar, Fio B incide sobre TODO consumo
  const valorPerdas = consumoKWh * perdasComImposto;
  const valorEncargos = consumoKWh * encargosComImposto;
  const total = r2Sim(valorTE + valorFioA + valorFioB + valorPerdas + valorEncargos);
  return { total, detalhe:{valorTE:r2Sim(valorTE), valorFioA:r2Sim(valorFioA), valorFioB:r2Sim(valorFioB), valorPerdas:r2Sim(valorPerdas), valorEncargos:r2Sim(valorEncargos)} };
}

// Conta COM geracao solar - separa energia instantanea (nunca paga Fio B) de energia
// compensada via credito (paga Fio B parcial, conforme % da Lei 14.300 do ano). Usa FIFO
// de creditos com validade de 60 meses (creditosDisponiveis = array de {mes,ano,energia}).
function calcularContaComSolar(consumoKWh, geracaoInstantaneaKWh, energiaInjetadaKWh, creditosDisponiveis, tipoLigacao, ano, bandeira=0){
  const disp = getDisponibilidade(tipoLigacao);
  const percentualFioB = getPercentualFioB(ano);
  const {TE, FioA, FioB, PerdasTecnicas, PerdasNaoTecnicas, Encargos} = SolarConfig.tarifas;
  const perdas = PerdasTecnicas + PerdasNaoTecnicas;

  // energia instantanea nunca excede o proprio consumo
  const energiaInstantanea = Math.min(geracaoInstantaneaKWh, consumoKWh);
  const consumoElegivel = Math.max(0, consumoKWh - disp); // nunca negativo
  const consumoRestante = Math.max(0, consumoKWh - energiaInstantanea);

  // consome creditos mais antigos primeiro (FIFO), respeitando validade de 60 meses
  let creditosOrdenados = creditosDisponiveis
    .filter(c => c.energia > 0)
    .sort((a,b)=> (a.ano*12+a.mes) - (b.ano*12+b.mes));
  let precisaCompensar = Math.min(consumoElegivel, consumoRestante);
  let energiaCompensada = 0;
  const creditosAtualizados = [];
  for(const c of creditosOrdenados){
    if(precisaCompensar <= 0){ creditosAtualizados.push({...c}); continue; }
    const usar = Math.min(c.energia, precisaCompensar);
    energiaCompensada += usar;
    precisaCompensar -= usar;
    creditosAtualizados.push({...c, energia: r2Sim(c.energia - usar)});
  }

  // credito novo gerado neste periodo = injetado - o que ja foi usado pra compensar agora
  const creditoNovo = Math.max(0, r2Sim(energiaInjetadaKWh - energiaCompensada));
  creditosAtualizados.push({mes: null, ano: null, energia: creditoNovo}); // caller preenche mes/ano reais

  const energiaFaturada = Math.max(0, consumoKWh - energiaCompensada);

  const teComImposto = aplicarTributosPorDentro(TE, bandeira);
  const fioAComImposto = aplicarTributosPorDentro(FioA, 0);
  const fioBComImposto = aplicarTributosPorDentro(FioB, 0);
  const perdasComImposto = aplicarTributosPorDentro(perdas, 0);
  const encargosComImposto = aplicarTributosPorDentro(Encargos, 0);

  const valorTE = energiaFaturada * teComImposto;
  const valorFioA = energiaFaturada * fioAComImposto;
  // Fio B: NAO incide sobre energia instantanea - so sobre energia COMPENSADA, e só o
  // percentual da Lei 14.300 vigente naquele ano (regra de transicao)
  const valorFioB = energiaCompensada * fioBComImposto * percentualFioB;
  const valorPerdas = energiaFaturada * perdasComImposto;
  const valorEncargos = energiaFaturada * encargosComImposto;
  const total = r2Sim(valorTE + valorFioA + valorFioB + valorPerdas + valorEncargos);

  return {
    total,
    energiaInstantanea: r2Sim(energiaInstantanea),
    energiaCompensada: r2Sim(energiaCompensada),
    energiaFaturada: r2Sim(energiaFaturada),
    creditoNovo,
    creditosAtualizados,
    percentualFioBAplicado: percentualFioB,
    detalhe:{valorTE:r2Sim(valorTE), valorFioA:r2Sim(valorFioA), valorFioB:r2Sim(valorFioB), valorPerdas:r2Sim(valorPerdas), valorEncargos:r2Sim(valorEncargos)}
  };
}

function calcularEconomia(contaSemSolar, contaComSolar){
  return r2Sim(contaSemSolar - contaComSolar);
}

function calcularValorKwhGerado(economia, energiaGeradaKWh){
  return energiaGeradaKWh > 0 ? r2Sim(economia / energiaGeradaKWh) : 0;
}

function calcularPayback(investimento, economiaAnual){
  return economiaAnual > 0 ? r2Sim(investimento / economiaAnual) : null;
}

// Forecast de N meses - simula reajuste tarifario, degradacao do modulo, aumento de consumo
// e a curva de transicao da Lei 14.300, mes a mes. Retorna resumo (economia acumulada) +
// serie anual (pra tabela resumida na UI).
function gerarForecastSolar(params){
  const {
    consumoMensalInicial, geracaoMensalInicial, tipoLigacao,
    anoInicial, mesesForecast, investimento
  } = params;
  let creditosAtuais = []; // FIFO acumulado ao longo do forecast
  let economiaAcumulada = 0;
  const resumoAnual = [];
  let economiaDoAnoAtual = 0;

  for(let m=0; m<mesesForecast; m++){
    const anosPassados = Math.floor(m/12);
    const anoCorrente = anoInicial + anosPassados;
    const fatorReajuste = Math.pow(1 + SolarConfig.forecast.reajusteTarifarioAnual, anosPassados);
    const fatorDegradacao = Math.pow(1 - SolarConfig.forecast.degradacaoModuloAnual, anosPassados);
    const fatorConsumo = Math.pow(1 + SolarConfig.forecast.aumentoConsumoAnual, anosPassados);

    const consumoDoMes = consumoMensalInicial * fatorConsumo;
    const geracaoDoMes = geracaoMensalInicial * fatorDegradacao;
    // simplificacao de simulacao: energia instantanea = min(geracao,consumo)*50% (estimativa
    // padrao de autoconsumo simultaneo), resto vira injetado - documentado, nao e dado real
    const energiaInstantaneaEstimada = Math.min(geracaoDoMes, consumoDoMes) * 0.5;
    const energiaInjetadaEstimada = Math.max(0, geracaoDoMes - energiaInstantaneaEstimada);

    // remove creditos vencidos (>60 meses) antes de calcular o mes
    creditosAtuais = creditosAtuais.filter(c => (m - (c.mesIndex ?? -999)) < SolarConfig.lei14300.validadeCreditoMeses);

    // aplica reajuste tarifario nas tarifas base (clona config com fator)
    const tarifasAjustadas = {};
    Object.keys(SolarConfig.tarifas).forEach(k => tarifasAjustadas[k] = SolarConfig.tarifas[k] * fatorReajuste);
    const tarifasOriginais = SolarConfig.tarifas;
    SolarConfig.tarifas = tarifasAjustadas; // temporario, restaurado logo abaixo

    const semSolar = calcularContaSemSolar(consumoDoMes, tipoLigacao);
    const comSolar = calcularContaComSolar(consumoDoMes, energiaInstantaneaEstimada, energiaInjetadaEstimada, creditosAtuais, tipoLigacao, anoCorrente);

    SolarConfig.tarifas = tarifasOriginais; // restaura config real

    const economiaDoMes = calcularEconomia(semSolar.total, comSolar.total);
    economiaAcumulada = r2Sim(economiaAcumulada + economiaDoMes);
    economiaDoAnoAtual += economiaDoMes;

    creditosAtuais = comSolar.creditosAtualizados.map(c => c.mes===null ? {...c, mesIndex:m} : c);

    if((m+1) % 12 === 0 || m === mesesForecast-1){
      resumoAnual.push({
        ano: anoCorrente, mesFinal: m+1,
        economiaAcumulada,
        payback: calcularPayback(investimento, economiaDoAnoAtual > 0 ? (economiaDoAnoAtual*12/((m%12)+1)) : 0)
      });
      economiaDoAnoAtual = 0;
    }
  }
  return { economiaAcumuladaTotal: economiaAcumulada, resumoAnual };
}

// NOTA 07/08/2026: `promocaoDominio7EnergiaSolar()` (FASE 2K) foi extraída pra
// src/modules/promocoes-financeengine.js na modularização — não é mais chamada aqui. Esse novo
// arquivo carrega depois do app.js inteiro, quando `SolarConfig` (acima) já está pronta.

// ----- Wiring da UI (secao 13) -----
function calcularSimulacaoRegulatoria(){
  const consumo = Number($('simConsumo')?.value) || 300;
  const tipoLigacao = $('simLigacao')?.value || 'TRI';
  const geracao = Number($('simGeracao')?.value) || 850;
  const investimento = Number($('simInvestimento')?.value) || 25000;
  const mesesForecast = Number($('simMeses')?.value) || 60;
  const anoInicial = new Date().getFullYear();

  const resultado = gerarForecastSolar({
    consumoMensalInicial: consumo, geracaoMensalInicial: geracao,
    tipoLigacao, anoInicial, mesesForecast, investimento
  });

  // CORRIGIDO 03/08/2026 (achado ao testar de verdade): t() é uma função local de outro escopo
  // (linha 1991), não é global - chamar ela aqui dava "t is not defined" e quebrava a página
  // inteira. Substituído por manipulação direta do DOM, sem depender do helper de outro escopo.
  const elEconomia = $('simEconomiaAcumulada');
  if(elEconomia) elEconomia.textContent = fmt(resultado.economiaAcumuladaTotal);
  const anosForecast = (mesesForecast/12).toFixed(0);
  const elPeriodo = $('simPeriodo');
  if(elPeriodo) elPeriodo.textContent = anosForecast + ' ano(s) (' + mesesForecast + ' meses)';

  const tbody = $('simTabelaAnual');
  if(tbody){
    tbody.innerHTML = resultado.resumoAnual.map(r =>
      '<tr><td>'+r.ano+'</td><td>'+fmt(r.economiaAcumulada)+'</td><td>'+(r.payback ? r.payback.toFixed(1)+' anos' : '—')+'</td></tr>'
    ).join('');
  }
}
onDomPronto(() => {
  const btnSim = $('btnCalcularSimulacao');
  if(btnSim) btnSim.addEventListener('click', calcularSimulacaoRegulatoria);
  if($('simConsumo')) calcularSimulacaoRegulatoria(); // calculo inicial com defaults
});
