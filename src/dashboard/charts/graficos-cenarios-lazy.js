// MÓDULO: Gráficos e Cenários — renderização LAZY (seção Gráficos + seção Cenários)
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carrega
// DEPOIS do app.js terminar (onload). Todas as 4 funções aqui só rodam via initGraficosECenariosLazy(),
// chamada de showMaster() (src/modules/ui-navegacao-basica.js) quando o usuário clica nas abas
// Gráficos/Cenários — NUNCA em código síncrono que outra parte do app.js precise no meio da própria
// execução (diferente da IIFE que cria os gráficos do Painel principal, essa continua em app.js por
// ainda depender de ordem de carregamento mais crítica — não extraída nesta rodada). Depende de
// globals já definidos em app.js quando roda: REG, VARS, Chart, fmt, yRange, alignSeries/
// alignSeriesCiclo, valueLeaderPlugin, WallaceBus, calcularAporteIncrementalPorCiclo,
// observeAndRenderChart — todos já existem a essa altura do carregamento. Nenhuma fórmula,
// comportamento ou resultado foi alterado, só o arquivo que hospeda o código.

// NOVO 12/08/2026 (pente fino pedido pelo usuário: "os números fazem sentido, são fáceis de
// interpretar?" — achado real em várias seções da aba Solar): números concatenados direto em
// string (`valor+' kWh'`) usam PONTO como separador decimal (padrão JS), não vírgula (pt-BR,
// padrão do resto do site) — "10.7 kWh/dia" em vez de "10,7 kWh/dia". Helper top-level (não local
// a uma função só) porque o mesmo problema apareceu em pontos que não compartilham escopo entre si
// (Unidade Geradora × Fluxo 1/Fluxo 2 × Rateio Solar).
function fmtKwhPtBr(v){ return v.toLocaleString('pt-BR', {maximumFractionDigits:2}); }

// NOVO 10/08/2026: extraída pra escopo top-level (achado do usuário, varredura completa de
// gráficos) — antes vivia dentro de _lazyRenderGraficosSecao(), inacessível de fora; precisa ser
// chamável tanto na criação do gráfico g_cCartoesLiquidoCV (dentro daquela função) quanto na
// atualização (atualizarGraficoCaixaVariavel(), mais abaixo neste arquivo).
function _calcularCartoesLiquidoCV(){
  const cvComprometido = REG.caixaVariavel.comprometido;
  const cvDisponivel = REG.caixaVariavel.disponivel;
  const visaTotal = REG.cartaoInfinite.total;
  const mbTotal = REG.cartaoMB.total;
  const liquido = Math.round((visaTotal + mbTotal - cvComprometido)*100)/100;
  const reposicao = cvDisponivel < 0 ? Math.round(Math.abs(cvDisponivel)*100)/100 : 0;
  return [mbTotal, visaTotal, -cvComprometido, liquido, cvDisponivel, reposicao];
}

function _lazyRenderCenariosSalario(){
const grid='#2a2d31';
const cenarioLabelPlugin = {
  id:'cenarioLabel',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = "600 9px -apple-system, 'Segoe UI', Roboto, sans-serif";
    meta.data.forEach((bar,i)=>{
      const v = values[i];
      const y = Math.max(bar.y-8, 12);
      ctx.fillStyle = '#e8e6df';
      ctx.fillText('R$ '+Math.round(v).toLocaleString('pt-BR'), bar.x, y);
    });
    ctx.restore();
  }
};
const cenarioSalarioData = [REG.deficitZero.liquidoSemTrabalhar,REG.operacional.necessidadeTotalBruta-REG.operacional.reembolsoSobraPessoal,REG.cenarioHistorico.media,VARS.cenarioMesesBonsMedia];
const cenarioSalarioRange = yRange(cenarioSalarioData, 0.18);
// DEFENSIVO (11/08/2026, achado de auditoria): destrói instância pré-existente antes de recriar (ver
// nota completa em graficos-painel-principal.js, mesma proteção replicada em todo new Chart() do repo).
{ const __chartExistente = Chart.getChart($('cCenarioSalario')); if (__chartExistente) __chartExistente.destroy(); }
new Chart($('cCenarioSalario'), {
  type:'bar',
  plugins:[cenarioLabelPlugin],
  data:{labels:['Não trabalha','Ponto de\nempate','Média\n(sobra)','Meses bons\n(média)'],
    datasets:[{data:cenarioSalarioData,
    backgroundColor:['#e0574c','#e8a63a','#34c98a','#34c98a'],
    borderRadius:4,barThickness:56}]},

  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,bottom:8}},
    plugins:{legend:{display:false},tooltip:{callbacks:{
      title:c=>c[0].label.replace('\n',' '),
      label:c=>fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10.5}}},
      y:{grid:{color:grid},max:cenarioSalarioRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});
}

function _lazyRenderGraficosSecao(){
// ===== Aba GRAFICOS =====
const muted = '#a9a79f', grid='#2a2d31';
const legendStd = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};
window.WALLACE_CHARTS = window.WALLACE_CHARTS || {};
// barValuePlugin agora e global (definido junto de fmt(), no topo do arquivo) - reutilizado aqui.

// plugin: rotula % em cima de cada barra de progresso de metas
const metaValuePlugin = {
  id:'metaValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const raw = chart.data.datasets[0].raw;
    ctx.save();
    ctx.fillStyle = '#e8e6df';
    ctx.font = "600 10px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    meta.data.forEach((bar,i)=>{
      ctx.fillText(raw[i], bar.x + 6, bar.y);
    });
    ctx.restore();
  }
};

{ const __chartExistente = Chart.getChart($('g_cPatrim')); if (__chartExistente) __chartExistente.destroy(); }
window.WALLACE_CHARTS.gPatrim = new Chart($('g_cPatrim'), {
  type:'doughnut',
  data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
    datasets:[{data:Object.values(REG.patrimonioDetalhe),
    backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

// CORRIGIDO 26/07/2026 (V166, pedido do usuario): "Composição da fatura Mastercard Black e Visa
// Infinite" so mostrava dados do Visa (visaDetalhe) - titulo prometia os 2 cartoes, grafico so
// entregava 1. Novo dataset COMBINADO: cada categoria soma o componente do Visa + o do Mastercard.
// CORRIGIDO 13/08/2026 (achado de auditoria: soma so cobria 7 categorias, omitindo
// "naoReconciliado" de visaDetalhe/mbDetalhe - quando esse residuo e maior que zero (ja aconteceu,
// R$49,81 e R$2.678,41 no historico) a soma das barras nao batia com o Total comprometido ao lado).
// 8a categoria adicionada, mesmo par de campos ja usado em VISA_DETALHE_LABELS/CORES.
const FATURA_COMBINADA_LABELS = ['Parcelas','Consórcios','Wallace/MB','Recorrências','Corp.','Assinaturas','Vanessa/MB','Não Reconciliado'];
const FATURA_COMBINADA_VALORES = [
  REG.visaDetalhe.parcelas, // parcelas so existem no Visa (MB nunca recebe parcela, regra fixa)
  REG.visaDetalhe.consorcios + REG.mbDetalhe.consorcios,
  REG.visaDetalhe.wallace + REG.mbDetalhe.wallace,
  REG.visaDetalhe.recorrencias + REG.mbDetalhe.recorrencias,
  REG.visaDetalhe.corp + REG.mbDetalhe.corp,
  REG.visaDetalhe.assinaturas + REG.mbDetalhe.assinaturas,
  REG.visaDetalhe.vanessa + REG.mbDetalhe.vanessa,
  REG.visaDetalhe.naoReconciliado + REG.mbDetalhe.naoReconciliado,
];

// CORRIGIDO 15/08/2026 (achado de auditoria: o donut g_cVisa, primeiro card da seção 02, continuava
// mostrando só REG.visaDetalhe (Visa Infinite) mesmo depois do V166 ter corrigido o gráfico de
// barras irmão pro dataset COMBINADO — mesmo bug, 2 elementos da mesma seção, um corrigido e um
// esquecido). Passa a usar o mesmo FATURA_COMBINADA_LABELS/VALORES do g_cVisaBar logo abaixo.
{ const __chartExistente = Chart.getChart($('g_cVisa')); if (__chartExistente) __chartExistente.destroy(); }
new Chart($('g_cVisa'), {
  type:'doughnut',
  data:{labels:FATURA_COMBINADA_LABELS,
    datasets:[{data:FATURA_COMBINADA_VALORES,
    backgroundColor:VISA_DETALHE_CORES,
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

{ const __chartExistente = Chart.getChart($('g_cVisaBar')); if (__chartExistente) __chartExistente.destroy(); }
new Chart($('g_cVisaBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:FATURA_COMBINADA_LABELS,
    datasets:[{data:FATURA_COMBINADA_VALORES,
    backgroundColor:VISA_DETALHE_CORES,borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

// Novo 19/07/2026 (V89) — Visa+MB liquido de Caixa Variavel (isolado em IIFE propria, regra 14.2)
// ATUALIZADO 20/07/2026 (pedido do usuario): Mastercard Black vem antes do Visa Infinite em toda
// legenda/titulo que combine os dois. Adicionadas 2 barras novas: Disponivel real (Saldo Real -
// Comprometido) e Reposicao necessaria, pra mostrar a diferenca entre o que esta provisionado
// (Comprometido) e o que existe de verdade em caixa agora (Disponivel).
// _calcularCartoesLiquidoCV() declarada em escopo top-level deste arquivo (fora desta função) —
// precisa ser chamável por atualizarGraficoCaixaVariavel() também, ver mais abaixo.
(function(){
  // CORRIGIDO 10/08/2026 (achado do usuário, varredura completa de gráficos): comprometido/disponivel
  // vêm de REG.caixaVariavel, atualizado ao vivo por hydrate-onda1-v2.js e
  // hydrate-comprometido-caixa-variavel-v2.js — mesma classe de bug já corrigida em cVariavel/
  // g_cVariavel, aqui achada num terceiro gráfico que também deriva desses campos.
  { const __chartExistente = Chart.getChart($('g_cCartoesLiquidoCV')); if (__chartExistente) __chartExistente.destroy(); }
  window.WALLACE_CHARTS.gCartoesLiquidoCV = new Chart($('g_cCartoesLiquidoCV'), {
    type:'bar',
    plugins:[barValuePlugin],
    data:{labels:['Mastercard Black','Visa Infinite','Caixa Variável (comprometido)','Líquido não coberto','Disponível real em caixa','Reposição necessária'],
      datasets:[{data:_calcularCartoesLiquidoCV(),
      backgroundColor:['#9085e9','#3987e5','#e2554f','#e8a63a','#34c98a','#e0574c'],borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60,left:10}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
        y:{grid:{display:false},ticks:{font:{size:10}}}}}
  });
})();

// 01 — Composição do Total Operacional (7 categorias confirmadas com o Wallace em 15/07/2026)
// Boletos=2600 (APORTE_BOLETOS, nao o total bruto do livro LRB) · Prov. MP=471,47 (MP pessoal, nao o total bruto do LRMP)
// REMOVIDO 14/08/2026 (pedido do usuario, mesmo achado do card "O que NUNCA e cortado"):
// "Consórcios" tirado da lista - desde 11/08/2026 os 2 consorcios Porto migraram pro boleto
// (REG.totalOpDetalhe.consorcios sempre R$0,00 desde entao, categoria estrutural morta, nao bug).
// totalOpData agora lista os campos explicitamente (nao mais Object.values() da ordem inteira do
// objeto) pra poder excluir so esse campo sem quebrar o alinhamento label<->valor dos outros 6.
const D01 = REG.totalOpDetalhe;
const totalOpLabels = ['Boletos','Parcelas','Recorrências','Aportes Pat.','Prov. MP','Assinaturas'];
const totalOpData = [D01.boletos, D01.parcelas, D01.recorrencias, D01.aportesPat, D01.provMP, D01.assinaturas];
const totalOpColors = ['#3987e5','#9085e9','#34c98a','#e8a63a','#6f6d66','#e879b0'];

{ const __chartExistente = Chart.getChart($('g_cTotalOp')); if (__chartExistente) __chartExistente.destroy(); }
window.WALLACE_CHARTS.gTotalOpDoughnut = new Chart($('g_cTotalOp'), {
  type:'doughnut',
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

{ const __chartExistente = Chart.getChart($('g_cTotalOpBar')); if (__chartExistente) __chartExistente.destroy(); }
window.WALLACE_CHARTS.gTotalOpBar = new Chart($('g_cTotalOpBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

{ const __chartExistente = Chart.getChart($('g_cVariavel')); if (__chartExistente) __chartExistente.destroy(); }
window.WALLACE_CHARTS.gCaixaVariavel = new Chart($('g_cVariavel'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:['Saldo real','Comprometido','Disponível'],
    // CORRIGIDO 12/08/2026 (mesmo achado do cVariavel em graficos-painel-principal.js): 3ª barra
    // tinha cor fixa verde, não refletia Disponível negativo.
    datasets:[{data:[REG.caixaVariavel.saldoReal,REG.caixaVariavel.comprometido,REG.caixaVariavel.disponivel],
    backgroundColor:['#3987e5','#e8a63a', REG.caixaVariavel.disponivel < 0 ? '#e2554f' : '#34c98a'],borderRadius:5}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}}}}
});

// 03 — Progresso das metas patrimoniais (corrigido 15/07/2026 com o Wallace; Escola Julio removida 18/07/2026 V85).
// Caixa Lance NÃO tem meta propria - e um pulmao que acumula ate um valor relevante para investir
// (evitar taxa de corretagem desproporcional em aportes pequenos), nao entra neste grafico.
// BTG/Necton tambem nao tem meta propria - contribui para a Meta do Milhao (R$1.000.000).
// Escola de Julio NAO entra aqui (removida do Patrimonio Total desde V47, 16/07/2026) - e uma
// reserva/caixa propria, acompanhada na secao 14 (Escola de Julio), nao e uma "meta patrimonial".
// As 3 metas reais monitoradas aqui: Meta do Milhao (patrimonio total), Casa Nova (consorcio),
// Consorcio Auto.
const metasNomes = ['Meta Milhão','Casa Nova','Consórcio Auto'];
const metasPct = [REG.metasPatrimoniais.milhaoPct, REG.metasPatrimoniais.casaNovaPct, REG.metasPatrimoniais.autoPct];
const pctBR = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
// V139: rotulo curto e detalhe completo agora GERADOS a partir do REG/VARS, nao mais strings escritas a
// mao (a versao anterior tinha "11,54% do milhao" congelado no texto, desatualizado desde a correcao
// do PATRIMONIO_TOTAL na V135 - o numero do grafico ja tinha corrigido, so o texto do label nao).
const metasRaw = [
  pctBR(REG.metasPatrimoniais.milhaoPct)+'% do milhão',
  pctBR(REG.consorcioCasaNova.pagoPct)+'% pago',
  pctBR(REG.metasPatrimoniais.autoPct)+'% pago'
];
const metasDetalhe = [
  pctBR(REG.metasPatrimoniais.milhaoPct)+'% · '+fmt(REG.patrimonio.total)+' de '+fmt(REG.patrimonio.metaMilhao),
  'Consórcio Casa Nova (cota 12, grupo I0464) · quitação '+fmt(REG.consorcioCasaNova.quitacaoValor)+' ('+pctBR(REG.consorcioCasaNova.quitacaoPct)+'%)',
  'Carta '+fmt(VARS.consorcioAutoCartaCredito)+', saldo devedor '+fmt(REG.balanco.passivos.consorcioAutoContemplado)
];

{ const __chartExistente = Chart.getChart($('g_cMetas')); if (__chartExistente) __chartExistente.destroy(); }
new Chart($('g_cMetas'), {
  type:'bar',
  plugins:[metaValuePlugin],
  data:{labels:metasNomes,
    datasets:[{data:metasPct, raw:metasRaw,
    backgroundColor:['#9085e9','#3987e5','#34c98a'],borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:70,top:15}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>metasDetalhe[c.dataIndex]}}},
    scales:{x:{grid:{color:grid},max:105,ticks:{callback:v=>v+'%',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

const gTotalOpSeries = alignSeriesCiclo(REG.evolucao.totalOperacional); // V165: baseado no ciclo financeiro
const gTotalOpRange = yRange(gTotalOpSeries);
// CORRIGIDO 10/08/2026: instância guardada em window.WALLACE_CHARTS (antes só existia dentro do
// escopo deste script, inacessível de fora) — precisa disso pra atualizarGraficosNecessidade()
// (abaixo) conseguir re-renderizar depois que provMP/déficit de caixas atualizam REG.evolucao
// de forma assíncrona, depois deste gráfico já ter sido desenhado uma vez (achado real: card do
// Resumo Executivo mudava, gráfico ficava com o valor congelado do boot).
window.WALLACE_CHARTS = window.WALLACE_CHARTS || {};
{ const __chartExistente = Chart.getChart($('g_cEvol')); if (__chartExistente) __chartExistente.destroy(); }
window.WALLACE_CHARTS.totalOperacional = new Chart($('g_cEvol'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:gTotalOpSeries,
    borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
    borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
  // CORRIGIDO 10/08/2026 (achado do usuário: "gráficos de necessidade e evolução cortando os
  // últimos valores") - último ponto sem espaço pro rótulo (valueLeaderPlugin) não ser cortado.
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40,right:32}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gTotalOpRange.min,max:gTotalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

const gNecLiqSeries = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V163: baseado no CICLO financeiro (25-24), nao no mes calendario - evita o valor "pular" quando mes vira mas ciclo nao, ou vice-versa
const gNecLiqRange = yRange(gNecLiqSeries);
{ const __chartExistente = Chart.getChart($('g_cNecessidadeLiquida')); if (__chartExistente) __chartExistente.destroy(); }
window.WALLACE_CHARTS.necessidadeLiquida = new Chart($('g_cNecessidadeLiquida'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:gNecLiqSeries,
    borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
    borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40,right:32}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gNecLiqRange.min,max:gNecLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

// NOVO 10/08/2026, AMPLIADO 10/08/2026 (achado do usuário: "todos os gráficos devem pegar o valor
// do mesmo lugar... não pode haver dois divergentes"): re-renderiza TODO gráfico que consome
// REG.evolucao/REG.superavitNormal — chamada por qualquer módulo que recalcule esses campos DEPOIS
// do boot inicial (hoje: hydrate-onda5-parcelamentos.js pra provMP, hydrate-deficit-caixas-sem-lrei.js
// pro déficit de caixas negativas). Cobre os 2 PARES de gráficos "Total Operacional"/"Necessidade
// Líquida" que existem no sistema (Painel principal: cEvol/cNecessidadeLiquida, definidos em
// graficos-painel-principal.js; aba Cenários: g_cEvol/g_cNecessidadeLiquida, logo acima neste
// arquivo) MAIS o gráfico "Superávit Normal" (cSuperavitNormal). Os 5 já liam da mesma fonte
// (REG.evolucao/REG.superavitNormal, só escritos dentro de recalcularNecessidade() — single source
// of truth já garantido na origem), o problema era só re-render: cada canvas tinha seu Chart.js
// criado 1x e nunca atualizado depois. Guard defensivo (`typeof atualizarGraficosNecessidade ===
// 'function'`) em quem chama, porque graficos-cenarios-lazy.js é módulo lazy (só carrega quando o
// usuário abre a aba Gráficos/Cenários pela 1ª vez) — se ninguém abriu essa aba ainda, a função nem
// existe, e os gráficos dela nem foram criados ainda (nascem certos quando forem criados, leem
// REG.evolucao já atualizado). graficos-painel-principal.js roda no boot síncrono, então sempre
// existe a essa altura.
function atualizarGraficosNecessidade(){
  if(!window.WALLACE_CHARTS) return;
  const atualizarSerie = (chart, serie) => {
    if(!chart) return;
    const range = yRange(serie);
    chart.data.datasets[0].data = serie;
    chart.options.scales.y.min = range.min;
    chart.options.scales.y.max = range.max;
    chart.update();
  };
  const totalOpSerie = alignSeriesCiclo(REG.evolucao.totalOperacional);
  const necLiqSerie = alignSeriesCiclo(REG.evolucao.necessidadeLiquida);
  atualizarSerie(window.WALLACE_CHARTS.totalOperacional, totalOpSerie);          // aba Cenários (g_cEvol)
  atualizarSerie(window.WALLACE_CHARTS.necessidadeLiquida, necLiqSerie);         // aba Cenários (g_cNecessidadeLiquida)
  atualizarSerie(window.WALLACE_CHARTS.painelTotalOperacional, totalOpSerie);    // Painel principal (cEvol)
  atualizarSerie(window.WALLACE_CHARTS.painelNecessidadeLiquida, necLiqSerie);   // Painel principal (cNecessidadeLiquida)

  const cSuperavit = window.WALLACE_CHARTS.superavitNormal;
  if(cSuperavit && typeof _calcularSuperavitNormal === 'function'){
    const { snLabels, snLiquido, snNecessidade, snDiferenca } = _calcularSuperavitNormal();
    cSuperavit.data.datasets[0].data = snDiferenca;
    // CORRIGIDO 13/08/2026 (achado de auditoria): backgroundColor não era recalculado num update
    // posterior — se a diferença virasse negativa depois da criação inicial do chart, a barra
    // continuaria verde pra sempre (só a posição/altura mudava, nunca a cor).
    cSuperavit.data.datasets[0].backgroundColor = snDiferenca.map(v=>v<0?'#e2554f':'#34c98a');
    cSuperavit._snLiquido = snLiquido;
    cSuperavit._snNecessidade = snNecessidade;
    cSuperavit.update();
    if(typeof _renderTabelaSuperavitNormal === 'function') _renderTabelaSuperavitNormal(snLabels, snLiquido, snNecessidade, snDiferenca);
    // NOVO 20/08/2026: legenda (incluindo o aviso condicional do déficit de caixas) também precisa
    // ser recalculada aqui — mesmo motivo do gráfico/tabela acima, senão fica presa no estado do 1º
    // render (déficit ainda em 0) mesmo depois do valor real chegar.
    if(typeof _atualizarLegendaSuperavitNormal === 'function') _atualizarLegendaSuperavitNormal(snLabels, snLiquido);
  }

  // CORRIGIDO 20/08/2026 (achado do usuário, print real: tabela/gráfico de Déficit Zero e Piso×Necessidade
  // Líquida travados em "Carregando dados reais…" pra sempre). Causa raiz PRÉ-EXISTENTE (não introduzida
  // hoje, só ficou visível com o guard novo de WALLACE_DEFICIT_CAIXAS_PRONTO): esta função nunca cobriu
  // os gráficos/tabelas de Déficit Zero (cDeficitZero/dzTableBody) nem Piso×Necessidade Líquida
  // (cPisoSemTrabalharNecLiquida/pnlTableBody) — só Superávit Normal + os 2 pares do Painel/Cenários
  // (Total Operacional/Necessidade Líquida). Antes disso, esses 2 simplesmente ficavam com o número do
  // 1º render (errado, sem o ajuste do déficit) congelado pra sempre, sem nenhum aviso — pior que
  // "Carregando" preso, só que silencioso. Fix real: reaproveita a própria função que já sabe redesenhar
  // tudo isso do zero (idempotente — já destrói/recria os canvas antes de desenhar), em vez de duplicar
  // a lógica de cálculo aqui.
  if(typeof _lazyRenderCenariosDeficitEGraficosSolar === 'function') _lazyRenderCenariosDeficitEGraficosSolar();
}
// CORRIGIDO 20/08/2026 (achado real, confirmado via console pelo usuário: `typeof
// atualizarGraficosNecessidade` retornava 'undefined' mesmo com o arquivo carregado e outras funções
// do MESMO arquivo — _lazyRenderCenariosDeficitEGraficosSolar, _calcularSuperavitNormal — existindo
// normalmente). Causa: esta função é declarada dentro do escopo de outra função deste arquivo, nunca
// exposta em `window` — o guard `typeof atualizarGraficosNecessidade === 'function'` em
// hydrate-deficit-caixas-sem-lrei.js (linha que dispara os 5 gráficos depois do déficit recalcular)
// sempre falhava silenciosamente, então essa reconciliação NUNCA rodava de verdade, desde 10/08/2026
// quando foi criada — bug estrutural antigo, só ficou visível hoje com o guard novo de "Carregando…".
// Exposição explícita corrige pros 2 casos (aninhada ou não).
window.atualizarGraficosNecessidade = atualizarGraficosNecessidade;

// NOVO 10/08/2026 (mesmo achado do usuário, domínio Patrimônio): re-renderiza os 2 gráficos de rosca
// "Reserva/BTG/Caixa Lance/Necton" (Painel: cPatrim; aba Gráficos: g_cPatrim) — chamada por
// hydrate-onda4-patrimonio.js depois de atualizar REG.patrimonioDetalhe.
function atualizarGraficoPatrimonio(){
  if(!window.WALLACE_CHARTS) return;
  const dados = Object.values(REG.patrimonioDetalhe);
  [window.WALLACE_CHARTS.painelPatrimonio, window.WALLACE_CHARTS.gPatrim].forEach(chart => {
    if(!chart) return;
    chart.data.datasets[0].data = dados;
    chart.update();
  });
}
// CORRIGIDO 20/08/2026 (mesmo achado do usuário/mesma causa de atualizarGraficosNecessidade acima:
// declarada dentro de _lazyRenderGraficosSecao(), nunca exposta em window — o guard em
// hydrate-onda4-patrimonio.js sempre falhava silenciosamente).
window.atualizarGraficoPatrimonio = atualizarGraficoPatrimonio;

// NOVO 10/08/2026: re-renderiza os 2 gráficos de composição do Total Operacional (aba Gráficos:
// g_cTotalOp doughnut + g_cTotalOpBar) — os 7 componentes vêm de REG.totalOpDetalhe. Sem par no
// Painel principal (só existe na aba Gráficos). AUDITADO por completo (10/08/2026, varredura pedida
// pelo usuário) — dos 7 componentes: boletos/parcelas/consorcios/aportesPat nunca são reescritos
// depois do boot síncrono (zero risco de divergência); recorrencias/assinaturas têm 1 escritor
// (promocoes-financeengine.js, FASE 2M) mas ele roda de forma SÍNCRONA durante o carregamento do
// script, terminando bem antes desta aba (lazy, só abre no clique do usuário) sequer existir — nunca
// pega o valor errado. `provMP` é o único componente com escritor assíncrono real
// (hydrate-onda5-parcelamentos.js), por isso é o único religado abaixo — cobertura completa, não
// parcial.
function atualizarGraficoTotalOpDetalhe(){
  if(!window.WALLACE_CHARTS) return;
  const dados = Object.values(REG.totalOpDetalhe);
  [window.WALLACE_CHARTS.gTotalOpDoughnut, window.WALLACE_CHARTS.gTotalOpBar].forEach(chart => {
    if(!chart) return;
    chart.data.datasets[0].data = dados;
    chart.update();
  });
}
// CORRIGIDO 20/08/2026 (mesma causa/achado de atualizarGraficosNecessidade acima).
window.atualizarGraficoTotalOpDetalhe = atualizarGraficoTotalOpDetalhe;

// NOVO 10/08/2026 (mesmo achado do usuário, domínio Caixa Variável): re-renderiza os 2 gráficos de
// barra "Saldo real/Comprometido/Disponível" (Painel: cVariavel; aba Gráficos: g_cVariavel) —
// chamada por hydrate-onda1-v2.js (saldoReal) e hydrate-comprometido-caixa-variavel-v2.js
// (comprometido), cada um podendo resolver em ordem diferente — sempre lê o REG.caixaVariavel atual
// no momento da chamada, nunca fica presa a qual dos dois módulos disparou por último.
function atualizarGraficoCaixaVariavel(){
  if(!window.WALLACE_CHARTS) return;
  const dados = [REG.caixaVariavel.saldoReal, REG.caixaVariavel.comprometido, REG.caixaVariavel.disponivel];
  // CORRIGIDO 12/08/2026 (achado do usuário: barra "Disponível" ficava verde mesmo depois de virar
  // negativa numa atualização ao vivo) — a cor só era definida na criação do gráfico, nunca
  // reavaliada aqui. Recalcula a cada update, mesmo sinal usado na criação inicial.
  const corDisponivel = REG.caixaVariavel.disponivel < 0 ? '#e2554f' : '#34c98a';
  [window.WALLACE_CHARTS.painelCaixaVariavel, window.WALLACE_CHARTS.gCaixaVariavel].forEach(chart => {
    if(!chart) return;
    chart.data.datasets[0].data = dados;
    chart.data.datasets[0].backgroundColor[2] = corDisponivel;
    chart.update();
  });
  const cLiquidoCV = window.WALLACE_CHARTS.gCartoesLiquidoCV;
  if(cLiquidoCV){
    cLiquidoCV.data.datasets[0].data = _calcularCartoesLiquidoCV();
    cLiquidoCV.update();
  }
}
// CORRIGIDO 20/08/2026 (mesma causa/achado de atualizarGraficosNecessidade acima).
window.atualizarGraficoCaixaVariavel = atualizarGraficoCaixaVariavel;

// NOVO 10/08/2026 (achado do usuário, varredura completa de gráficos): re-renderiza g_cCaixas
// ("Caixas operacionais vs metas") — chamada por hydrate-onda1-v2.js (Boletos/PIX Vanessa) e
// hydrate-onda2-v2.js (as outras 7 caixas cobertas), cada um podendo resolver em ordem diferente.
// Só existe se o usuário já rolou até esse gráfico pelo menos 1x (observeAndRenderChart, lazy) —
// se ainda não existir, não há nada a atualizar (nasce certo quando for criado, lendo
// REG.caixasOperacionais já sincronizado nesse momento).
function atualizarGraficoCaixas(){
  if(!window.WALLACE_CHARTS || !window.WALLACE_CHARTS.gCaixas) return;
  const chart = window.WALLACE_CHARTS.gCaixas;
  const chaves = Object.keys(REG.caixasOperacionais);
  chart.data.datasets[1].data = chaves.map(k => REG.caixasOperacionais[k].saldo);
  chart.update();
}
// CORRIGIDO 20/08/2026 (mesma causa/achado de atualizarGraficosNecessidade acima).
window.atualizarGraficoCaixas = atualizarGraficoCaixas;

// 07 — Caixas operacionais vs metas (lista confirmada pelo Wallace em 15/07/2026 — sem PIX Wallace,
// extinta em 13/07/2026, e sem Fatura Wärtsilä: não é uma caixa operacional com meta própria, é um
// repasse de reembolso (P3: Reembolsos Wärtsilä → Fatura Wärtsilä → Mercado Pago → Caixa Lance,
// nunca "pertence" a uma caixa - ver Princípios Contábeis no SWP_INPUT). Layout horizontal para
// caber os 7 nomes sem cortar, com o valor ao final de cada barra.
// CORRIGIDO 05/08/2026 (parte 95, usuario apontou "a caixa Bens Duraveis no grafico esta trepada na
// Escola de Julio"): este array era POSICIONAL e hardcoded - quando a caixa Bens Duraveis foi criada
// (parte 90ish) e inserida em REG.caixasOperacionais ANTES de escolaJulio, este array de 8 rotulos nao
// foi atualizado. Resultado: a 8a barra (dado real de bensDuraveis, -R$355,00) herdava o 8o ROTULO
// antigo ("Escola Júlio"), e a Escola Julio de verdade (9a chave) ficava sem rotulo nenhum. Corrigido
// derivando os rotulos/notas de um MAPA por chave (nao mais por posicao) - assim uma caixa nova nunca
// mais desalinha as que vem depois dela, so precisa de uma entrada nova no mapa abaixo.
// CORRIGIDO 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #5): as 4 entradas abaixo tinham
// "X% da meta" escrito cru — cópia solta de saldo/meta, ambos já vivos em REG.caixasOperacionais (o
// próprio gráfico já desenha as barras a partir desses mesmos campos, 1 linha abaixo). Viravam texto
// desatualizado a cada lançamento na caixa. Trocado `nota` fixo por `notaFn(saldo,meta)` só nessas 4
// — as demais notas são texto explicativo estável (evento passado, regra de negócio), não um fato que
// muda a cada transação, ficam como estavam.
const fmtPctCaixaInfo = v => v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const CAIXAS_OPERACIONAIS_INFO = {
  boletos:            { label:'Boletos',             notaFn:(s,m)=> fmtPctCaixaInfo(m>0?s/m*100:0)+'% da meta' },
  pixVanessa:         { label:'PIX Vanessa',          notaFn:(s,m)=> fmtPctCaixaInfo(m>0?s/m*100:0)+'% da meta'+(s===0?' (zerada)':'') },
  manutencao:         { label:'Manutenção',           nota:'LREI0001 quitado (21/07) — depósito direto do reembolso Wärtsilä' },
  eventos:            { label:'Eventos e Viagens',    nota:'Suporte à Variável (R$167,40) para o mesmo custo: visita família Vanessa/Natal-RN — não é empréstimo' },
  // ATUALIZADO 18/08/2026 (pedido do usuário, ver vars-caixas.js aporteSaudeFamilia) — composição
  // real: 2x Pediatra Júlio + 2x Dentista Júlio + 1x Ginecologista Vanessa + 2x Endócrino Wallace,
  // R$2.530,00/ano ÷ 12 = R$210,83/mês (era R$177,50/mês, sem o dentista).
  saudeFamilia:       { label:'Saúde Família',        notaFn:()=> '2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa + 2x endócrino Wallace/ano · aporte '+fmt(VARS.aporteSaudeFamilia)+'/mês' },
  aniversarioJulio:   { label:'Aniversário Júlio',    notaFn:(s,m)=> fmtPctCaixaInfo(m>0?s/m*100:0)+'% da meta · aporte R$200/mês até 14/09' },
  seguroEmplacamento: { label:'Seguro/Emplacamento',  nota:'Aporte R$425/mês (permanente)' },
  bensDuraveis:       { label:'Bens Duráveis',        nota:'Nasceu em -R$355,00 (fone + cortador de pelo, comprados antes da caixa existir) · aporte R$250/mês' },
  escolaJulio:        { label:'Escola Júlio',         notaFn:(s,m)=> fmtPctCaixaInfo(m>0?s/m*100:0)+'% da meta · meta '+fmt(m)+', fora da Meta do Milhão (P5)' },
  // CORRIGIDO 13/08/2026 (achado de auditoria: mapa mapeava só 9 das 10 chaves de
  // REG.caixasOperacionais — pixGeralVanessa, criada 07/08/2026, faltava aqui. A 10ª barra do
  // gráfico aparecia com o nome cru da variável em vez de um rótulo legível).
  pixGeralVanessa:    { label:'PIX Geral Vanessa',    nota:'Conta autônoma da Vanessa (distinta da PIX Vanessa/reserva do Wallace) · meta R$300' }
};
const caixasChaves = Object.keys(REG.caixasOperacionais);
const caixasLabels = caixasChaves.map(k => (CAIXAS_OPERACIONAIS_INFO[k] && CAIXAS_OPERACIONAIS_INFO[k].label) || k);
const caixasMeta =  caixasChaves.map(k=>REG.caixasOperacionais[k].meta);
const caixasNotas = caixasChaves.map(k => {
  const info = CAIXAS_OPERACIONAIS_INFO[k];
  if(!info) return '';
  if(info.notaFn) return info.notaFn(REG.caixasOperacionais[k].saldo, REG.caixasOperacionais[k].meta);
  return info.nota;
});

const caixasValuePlugin = {
  id:'caixasValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    ctx.save();
    ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds,di)=>{
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar,i)=>{
        ctx.fillStyle = di===0 ? '#3987e5' : '#e8a63a';
        ctx.fillText(fmt(ds.data[i]), bar.x + 6, bar.y);
      });
    });
    ctx.restore();
  }
};

observeAndRenderChart($('g_cCaixas'), () => { const __chartExistente = Chart.getChart($('g_cCaixas')); if (__chartExistente) __chartExistente.destroy(); return window.WALLACE_CHARTS.gCaixas = new Chart($('g_cCaixas'), {
  type:'bar',
  plugins:[caixasValuePlugin],
  data:{labels:caixasLabels,
    // Saldo recalculado no momento real da criação (scroll até o gráfico), não no momento em que a
    // aba abriu — evita closure presa ao valor de quando _lazyRenderGraficosSecao() rodou.
    datasets:[
      {label:'Meta', data:caixasMeta, backgroundColor:'#e8a63a', borderRadius:3},
      {label:'Saldo atual', data:caixasChaves.map(k=>REG.caixasOperacionais[k].saldo), backgroundColor:'#3987e5', borderRadius:3}
    ]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:70}},
    barPercentage:0.7,categoryPercentage:0.65,
    plugins:{legend:legendStd,tooltip:{callbacks:{
      label:c=>c.dataset.label+': '+fmt(c.raw)+(c.datasetIndex===0 ? ' — '+caixasNotas[c.dataIndex] : '')
    }}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10.5}}}}}
}); });

// 08 — Alivio de pressao: soma dos aportes das caixas incrementais (Aniversario Julio, Escola Julio,
// Saude Familia, Seguro/Emplacamento) mes a mes, ate cada uma zerar/trocar seu aporte ao bater meta/prazo.
// MESCLADO 20/07/2026 (pedido do usuario, "nao gostei de grafico separado"): janela FIXA de 18 meses
// (Jul/26-Dez/27, nao usa gerarMeses/alignSeries porque este e um plano fixo no tempo, nao uma janela
// rolante a partir de "hoje") pra caber tanto o ciclo atual quanto a virada do ciclo 2027 confirmada pelo
// usuario: Escola de Julio reinicia do zero em Jan/27 (R$839,64/mes x 11 meses = R$9.236,04, bate o teto
// R$9.236,00 em novembro). Seguro/Emplacamento e um ciclo CONTINUO de 12 meses desde Jan/26, mesma taxa
// (R$425/mes) ao virar pro ciclo 2027 - por isso nunca gera evento de alivio/aumento, so continua.
const alivioLabels = ['Jul/26','Ago/26','Set/26','Out/26','Nov/26','Dez/26','Jan/27','Fev/27','Mar/27','Abr/27','Mai/27','Jun/27','Jul/27','Ago/27','Set/27','Out/27','Nov/27','Dez/27'];
// ATUALIZADO 05/08/2026 (parte 102): usa calcularAporteIncrementalPorCiclo() - mesma fonte que a
// projecao de Necessidade Liquida (secao 05) agora usa, nunca mais 2 implementacoes separadas da
// mesma logica. Bens Duraveis (R$250/mes, sem data de termino) adicionada, faltava aqui.
const alivioData = alivioLabels.map((_,i)=> calcularAporteIncrementalPorCiclo(i));
// CORRIGIDO 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #6): os valores em R$ de cada
// marco eram cópia solta calculada uma vez a mão — agora são a DIFERENÇA real entre pontos
// consecutivos do próprio alivioData (mesma fonte, calcularAporteIncrementalPorCiclo, já calculada
// acima), nunca mais podem divergir do que o gráfico de fato desenha. Os índices e as datas (14/09,
// 01/11) continuam fixos de propósito — são marcos de calendário reais já validados com o usuário,
// não recalculados aqui (exigiria fonte de calendário própria, fora de escopo).
// CORRIGIDO no mesmo achado: o evento único no índice 16 ("Saúde Família + Escola Júlio 2027
// completam") juntava 2 transições que a própria calcularAporteIncrementalPorCiclo() não faz no
// mesmo ciclo — Saúde Família para de contar em i<16 (cai no índice 16) e Escola Júlio 2027 para em
// i<=16 (cai só no índice 17, o último da janela) — 1 ciclo de diferença entre as duas. Separado em
// 2 eventos pra bater exatamente com a fórmula.
const alivioEventos = {
  2: {tipo:'alivio',  texto:'Aniversário Júlio completa (14/09) — '+fmt(alivioData[1]-alivioData[2])+'/mês liberados'},
  4: {tipo:'alivio',  texto:'Escola Júlio (ciclo atual) completa (01/11) — '+fmt(alivioData[3]-alivioData[4])+'/mês liberados'},
  6: {tipo:'aumento', texto:'Escola Júlio 2027 inicia (do zero) — +'+fmt(alivioData[6]-alivioData[5])+'/mês'},
  16:{tipo:'alivio',  texto:'Saúde Família completa — '+fmt(alivioData[15]-alivioData[16])+'/mês liberados'},
  17:{tipo:'alivio',  texto:'Escola Júlio 2027 completa — '+fmt(alivioData[16]-alivioData[17])+'/mês liberados'}
};

const alivioStepPlugin = {
  id:'alivioStepPlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8e6df';
    meta.data.forEach((pt,i)=>{
      // CORRIGIDO 20/07/2026: com 18 pontos (janela estendida), rotulo em TODO ponto ficava
      // atropelado/sobreposto quando varios meses seguidos tem o mesmo valor (plato). Agora so
      // desenha o valor no primeiro ponto de cada plato (inicio) e no ultimo ponto da serie.
      const mudou = i === 0 || alivioData[i] !== alivioData[i-1];
      const ultimo = i === meta.data.length - 1;
      if(mudou || ultimo){
        ctx.fillText(fmt(alivioData[i]), pt.x, pt.y - 12);
      }
      const ev = alivioEventos[i];
      if(ev){
        ctx.fillStyle = ev.tipo === 'alivio' ? '#34c98a' : '#e0574c';
        ctx.font = "600 8px -apple-system, 'Segoe UI', Roboto, sans-serif";
        const seta = ev.tipo === 'alivio' ? '↓ ' : '↑ ';
        ctx.fillText(seta+ev.texto.split(' — ')[1], pt.x, pt.y + 18);
        ctx.fillStyle = '#e8e6df';
        ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      }
    });
    ctx.restore();
  }
};

observeAndRenderChart($('g_cAlivio'), () => { const __chartExistente = Chart.getChart($('g_cAlivio')); if (__chartExistente) __chartExistente.destroy(); return new Chart($('g_cAlivio'), {
  type:'line',
  plugins:[alivioStepPlugin],
  data:{labels:alivioLabels,
    datasets:[{data:alivioData, stepped:'before',
    borderColor:'#e879b0', backgroundColor:'rgba(232,121,176,0.08)',
    borderWidth:2.5, pointBackgroundColor:'#e879b0', pointBorderColor:'#16181b',
    pointBorderWidth:2, pointRadius:5, fill:true}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:28,bottom:18}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.raw)+' em aportes incrementais ativos'}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
      y:{grid:{color:grid},min:0,max:yRange(alivioData,0.15).max,ticks:{callback:v=>'R$'+v,font:{size:10}}}}}
}); });
}

// ===== Operação Superávit Normal (Cenarios, secao 05) - mesmo piso do Deficit Zero, renda media 12m =====
// CORRIGIDO 10/08/2026 (achado do usuário: "o valor necessidade bruta no gráfico ainda não bate"):
// esta seção compara Líquido × Necessidade Total Bruta (REG.superavitNormal.necessidade[0], já
// reentrante desde a correção de recalcularNecessidade() — ver recalcular-necessidade.js), mas o
// gráfico/tabela em si eram desenhados 1x só, igual aos 2 gráficos de graficos-cenarios-lazy.js já
// corrigidos (Total Operacional/Necessidade Líquida) — terceiro lugar com o mesmo problema de fundo,
// não coberto pela primeira rodada da correção. Cálculo extraído pra função própria
// (_calcularSuperavitNormal) pra poder ser chamado de novo por atualizarGraficosNecessidade(), sem
// duplicar a fórmula.
function _calcularSuperavitNormal(){
  // CORRIGIDO 16/07/2026 (usuario): (1) nao usar mais o piso absoluto (gasto minimo essencial) como
  // comparacao - usar a Necessidade Total BRUTA (cenario "paga tudo normalmente", mesma serie do card
  // "Cenario normal" da secao 04) porque este grafico representa o cenario normal, nao o de sobrevivencia.
  // (2) CORRIGIDO 16/07/2026 (2 rodadas): Jul/26 usa o liquido CALCULADO pelo Estimador de Salario
  // (R$16.048,51), nao o salario ja recebido/gasto do ciclo anterior. Meses seguintes usam a MEDIANA de
  // 12 meses (R$18.283,64), NAO a media (R$20.740,48) - usuario forneceu analise mostrando que a media e
  // puxada para cima por 3 meses excepcionais (Dez/25 ferias+13o, Jun/26, Jan/26) e nao e representativa
  // como premissa conservadora. Workflow pretendido: mes a mes, substituir o valor conservador pelo real
  // assim que o contracheque chegar (atualizar REG.superavitNormal.liquido[i], nunca noutro lugar).
  // Necessidade Total Bruta projetada = PROJ_TOTAL_OP_* (SWP_INPUT, reconstruida 16/07/2026 a partir do
  // livro LRP) + Orcamento Operacional R$3.200 constante. Mar/27 em diante mantido constante (sem dados
  // de parcelamento/aporte alem desse horizonte).
  // AUTOMATIZADO 19/07/2026: resolve a serie Liquido em runtime (real > projetado > mediana) via
  // helper global liquidoMes(i), em vez de ler um array hardcoded. "Vivo" no sentido pedido pelo
  // usuario: qualquer edicao em REG.superavitNormal.liquidoProjetado/liquidoReal se reflete aqui
  // sem precisar recalcular a mao os 12 valores - so o(s) mes(es) com dado novo precisa(m) de entrada.
  // CORRIGIDO 12/08/2026 (pedido do usuário: "já tendo os valores oficiais, não tem porque usar
  // estimado" — regra geral do sistema, valor final sempre substitui estimativa quando disponível):
  // era REG.superavitNormal.necessidade (= Necessidade Total BRUTA, "paga tudo", ignora Cobertura
  // Garantida). Agora usa REG.evolucao.necessidadeLiquida — mesmo array, mas desconta a Cobertura
  // Garantida (Sobra Total da cascata de reembolso - Manejo, ver recalcular-necessidade.js, corrigida
  // hoje pra automática/real). Só o índice 0 (ciclo atual, único com Cobertura Garantida confirmada)
  // muda de valor — índices 1-11 continuam idênticos (Cobertura Garantida projetada é sempre 0, nunca
  // chutada pra frente, ver comentário em recalcularNecessidade()).
  const snLabels = gerarMesesCiclo(12); // V165: baseado no ciclo financeiro
  const snLiquido = alignSeriesCiclo(snLabels.map((_,i)=>liquidoMes(i)));
  const snNecessidade = alignSeriesCiclo(REG.evolucao.necessidadeLiquida);
  const snDiferenca = snNecessidade.map((n,i)=>Math.round((snLiquido[i]-n)*100)/100);
  return { snLabels, snLiquido, snNecessidade, snDiferenca };
}

// CORRIGIDO 13/08/2026 (achado de auditoria: diferença negativa aparecia como "+-1.234" em verde —
// esta tabela era a única das 3 irmãs (ps/dz/sn) que não tratava o sinal condicionalmente, mesmo
// padrão já usado em _renderTabelaSuperavitNormal's vizinhas psTableBody/dzTableBody).
// NOVO 20/08/2026 (pedido do usuário, depois da inversão do rótulo pro mês do salário: "Jul/26" sendo
// o ciclo atual parece "passado" à primeira vista, mesmo ainda rodando — destacar qual linha é o ciclo
// atual ajuda a não confundir de novo). Índice 0 é SEMPRE o ciclo atual (janela rolante, calculada a
// partir de `hoje` em gerarMesesCiclo() — muda sozinha quando o ciclo virar, sem precisar mexer aqui).
function _renderTabelaSuperavitNormal(snLabels, snLiquido, snNecessidade, snDiferenca){
  function fmt0b(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}
  const snTbody = $('snTableBody');
  if(!snTbody) return;
  // NOVO 20/08/2026 (pedido do usuário: "cada hora é um valor" — snNecessidade depende do déficit de
  // caixas sem LREI, ajustado async depois do boot. Sem isto, a 1ª pintura mostra número incompleto por
  // 1-2s a cada refresh). Não adiciona busca nem atraso novo — só espera o dado que já ia chegar mesmo.
  if(window.WALLACE_DEFICIT_CAIXAS_PRONTO === false){
    snTbody.innerHTML = '<tr><td colspan="4" style="padding:0.6rem 0.5rem;color:var(--text-dim);text-align:center">Carregando dados reais…</td></tr>';
    return;
  }
  snTbody.innerHTML = snLabels.map((m,i)=>{
    const d = snDiferenca[i];
    const cor = d<0 ? 'var(--red)' : 'var(--green)';
    const sinal = d<0 ? '−' : '+';
    const atual = i===0;
    const mesEstilo = atual ? 'color:var(--red);font-weight:700' : 'color:var(--text-mid)';
    const mesTexto = m + (atual ? ' (atual)' : '');
    return '<tr style="border-bottom:1px solid var(--border)">'+
      '<td style="padding:0.3rem 0.5rem;'+mesEstilo+'">'+mesTexto+'</td>'+
      '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snLiquido[i])+'</td>'+
      '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snNecessidade[i])+'</td>'+
      '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+cor+'">'+sinal+fmt0b(Math.abs(d))+'</td>'+
      '</tr>';
  }).join('');
}

function _lazyRenderCenariosSuperavit(){
  const grid2b = '#2a2d31';
  const { snLabels, snLiquido, snNecessidade, snDiferenca } = _calcularSuperavitNormal();

  // Rotulo compacto em "k" (em vez de milhar completo) - o valor de Julho (salario real) e bem maior que
  // os demais (media), o que gerava sobreposicao de texto com o formato anterior "+13.371" (7 caracteres
  // largos demais para 12 barras). Formato "+19,4k" e fixo e mais estreito.
  // CORRIGIDO 13/08/2026 (achado de auditoria): sinal e cor eram fixos ('+' e verde), mesmo bug da
  // tabela acima — agora condicional ao valor real, mesmo padrão de dzDataLabelPlugin/psDataLabelPlugin.
  const fmtK = v => (v<0?'−':'+')+(Math.abs(v)/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'k';

  // CORRIGIDO 10/08/2026: le de chart.data.datasets[0].data (a fonte que atualizarGraficosNecessidade()
  // atualiza) em vez do array `snDiferenca` capturado por closure — senão o rótulo continuaria mostrando
  // o valor antigo pra sempre, mesmo depois do chart.update() recolocar as barras certas.
  const snDataLabelPlugin = {
    id:'snDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      const diferenca = chart.data.datasets[0].data;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        ctx.fillStyle = diferenca[i]<0 ? '#e2554f' : '#34c98a';
        ctx.fillText(fmtK(diferenca[i]), bar.x, bar.y - 7);
      });
      ctx.restore();
    }
  };

  window.WALLACE_CHARTS = window.WALLACE_CHARTS || {};
  { const __chartExistente = Chart.getChart($('cSuperavitNormal')); if (__chartExistente) __chartExistente.destroy(); }
  const chartSuperavit = new Chart($('cSuperavitNormal'), {
    type:'bar',
    plugins:[snDataLabelPlugin],
    data:{labels:snLabels,
      datasets:[{data:snDiferenca,
        backgroundColor: snDiferenca.map(v=>v<0?'#e2554f':'#34c98a'),
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        // le de chart._snLiquido/_snNecessidade (atualizados junto com os dados) em vez do closure —
        // mesmo motivo do datalabel acima.
        label:c=>{const i=c.dataIndex; const liq=c.chart._snLiquido; const nec=c.chart._snNecessidade; return ['Líquido: '+fmt(liq[i]),'Necessidade Líquida: '+fmt(nec[i]),'Superávit: '+fmt(c.chart.data.datasets[0].data[i])];}
      }}},
      scales:{x:{grid:{display:false},ticks:{
        // NOVO 20/08/2026 (pedido do usuário: destacar o ciclo atual em todos os gráficos, mesmo
        // tratamento do destaque nas tabelas — índice 0 é sempre o ciclo atual, janela rolante).
        color:(c)=>c.index===0?'#e2554f':'#a9a79f',
        font:(c)=>c.index===0?{size:9,weight:'700'}:{size:9}
      }},
        y:{grid:{color:grid2b},ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:9.5}}}}}
  });
  chartSuperavit._snLiquido = snLiquido;
  chartSuperavit._snNecessidade = snNecessidade;
  window.WALLACE_CHARTS.superavitNormal = chartSuperavit;

  _renderTabelaSuperavitNormal(snLabels, snLiquido, snNecessidade, snDiferenca);
  _atualizarLegendaSuperavitNormal(snLabels, snLiquido);
}

// NOVO 12/08/2026 (pedido do usuário: "não deve ser textos, deve ser automático, deve buscar
// automaticamente na V2" — a legenda antes era texto estático no HTML com números digitados à
// mão, que já tinha ficado desatualizada 2x na mesma sessão). Monta a legenda em runtime a partir
// dos MESMOS valores que o gráfico/tabela acima usam (liquidoMes(0) via snLiquido[0],
// REG.cenarioHistorico.mediaPonderada12M/media) - nunca mais um número solto pra manter sincronizado
// à mão. real=true quando REG.superavitNormal.liquidoReal[0] está preenchido (dado real confirmado);
// caso contrário mostra como Estimador de Salário (projeção via folha de ponto).
// CORRIGIDO 12/08/2026 (pedido do usuário: valor final sempre substitui estimativa): trocado
// "Necessidade Total bruta" por "Necessidade Líquida" no texto — mesma mudança de fonte de dado do
// snNecessidade acima (agora desconta a Cobertura Garantida real do ciclo atual, não mais "paga tudo").
function _atualizarLegendaSuperavitNormal(snLabels, snLiquido){
  const el = $('legSuperavitNormal');
  if(!el) return;
  const CH = REG.cenarioHistorico;
  const cicloAtual = snLabels[0];
  const valorCicloAtual = snLiquido[0];
  const real = REG.superavitNormal.liquidoReal && REG.superavitNormal.liquidoReal[0] != null;
  const fonteCicloAtual = real
    ? `usa o líquido REAL já recebido (${fmt(valorCicloAtual)})`
    : `usa o líquido projetado pelo Estimador de Salário (${fmt(valorCicloAtual)})`;
  el.innerHTML = 'Cenário normal (paga tudo): confronta o líquido de cada ciclo contra a Necessidade <strong>Líquida</strong> '
    + '(boletos + parcelas + assinaturas + recorrências + consórcios + aportes patrimoniais + orçamento operacional, menos a Cobertura Garantida real do ciclo atual — sobra da cascata de reembolso Wärtsilä) — não o piso essencial. '
    + `${cicloAtual} ${fonteCicloAtual}. Os meses seguintes usam a média ponderada dos últimos 12 meses (${fmt(CH.mediaPonderada12M)}) como valor conservador — não a média simples (${fmt(CH.media)}), que é puxada para cima por meses excepcionais. `
    + 'Conforme cada mês real chegar, o valor conservador é substituído pelo real (atualizar REG.superavitNormal.liquidoReal[i]).';

  // NOVO 20/08/2026 (pedido do usuário: "tenho 4 dias pra acabar o ciclo e não vem dinheiro de outro
  // lugar, vai ter que passar esse déficit pro próximo ciclo, mas isso não é visual nesses gráficos").
  // Mesmo cálculo condicional já usado nos cards "Necessidade × Salário"/"Estimador"
  // (hydrate-estimador-salario.js) — se o déficit de caixas de HOJE (índice 0, "foto ao vivo") não for
  // resolvido até o fechamento do ciclo, ele persiste como déficit real no próximo ciclo (índice 1) —
  // a Necessidade Líquida do próximo ciclo (Ago/26 aqui) sobe por esse valor. Não altera nenhum número
  // já desenhado, só avisa aqui também, não só na Home.
  const snAvisoEl = $('snAvisoDeficit');
  if(snAvisoEl){
    const deficitCaixasHoje = REG.operacional.deficitCaixasSemLrei || 0;
    if(deficitCaixasHoje > 0 && REG.evolucao && REG.evolucao.necessidadeLiquida){
      const necSeDeficitPersistir = Math.round((REG.evolucao.necessidadeLiquida[1] + deficitCaixasHoje)*100)/100;
      snAvisoEl.textContent = `⚠️ Hoje há ${fmt(deficitCaixasHoje)} em caixas negativas sem LREI cobrindo. Se não for quitado até o fechamento do ciclo atual (${cicloAtual}), esse valor persiste e a Necessidade Líquida de ${snLabels[1]} sobe para ${fmt(necSeDeficitPersistir)}.`;
      snAvisoEl.style.display = '';
    } else {
      snAvisoEl.style.display = 'none';
    }
  }
}

// ===== Operação Déficit Zero e Energia Solar (Cenarios, secoes 06/07) =====
// ASSINCRONA desde 08/08/2026 (Solar entra na V2 — modelo de ciclos de crédito): precisa de um
// await pro ciclo aberto (vw_ciclo_solar_aberto) antes de escrever nas seções 10/12. Chamada em
// initGraficosECenariosLazy() já era uma instrução solta, sem await (mesmo padrão fire-and-forget
// dos módulos hydrate-onda*.js) — virar async não muda nenhum call site.
async function _lazyRenderCenariosDeficitEGraficosSolar(){
  const grid2 = '#2a2d31';
    function fmt0(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}
  const legendStd2 = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};

  // CORRIGIDO 11/08/2026 (pedido do usuário: "coloque os valores do gráfico Evolução do Total
  // Operacional... onde tem Líquido coloque meu salário base + 35%, que é obrigatório eu receber
  // se eu trabalhar pelo menos 1 dia"): trocada a fonte de dado inteira deste gráfico.
  // - "Piso" (era REG.deficitZero.piso, série separada e só parcialmente atualizada) agora é
  //   REG.evolucao.totalOperacional — a MESMA fonte viva do gráfico "Evolução do Total Operacional"
  //   (aba Gráficos), nunca mais duas séries divergentes pro mesmo conceito.
  // - "Líquido" (era REG.deficitZero.liquidoSemTrabalhar, R$7.667,73) agora é o piso mínimo
  //   LÍQUIDO GARANTIDO por lei sempre que há pelo menos 1 dia trabalhado no ciclo.
  // RECALCULADO 12/08/2026 (pedido do usuário: "salário seco sem hora extra" — Base + 30% + 5% +
  // Creche, COM todos os descontos por cima, não só o bruto ×1,35 de antes): mesma metodologia de
  // liquidoSemTrabalhar (VARS.liquidoSemTrabalhar, ver vars-operacional.js), mas COM Periculosidade
  // (só entra quando há pelo menos 1 dia trabalhado). Fonte dos valores-base: `parametros_gerais`
  // (nome='taxasHoraFolhaPontoWartsila' e 'liquidoProjetadoProximoCiclo_memoria_calculo').
  // MIGRADO 14/08/2026 (pedido do usuário: "nada de hardcode deve ser tolerado, se eu quiser mudar
  // não precisa mexer na estrutura do site"): as 7 constantes abaixo eram literais fixos neste
  // arquivo — auditoria achou que um reajuste salarial novo exigiria editar .js + deploy. Agora
  // lidas de VARS.taxasHoraFolhaPontoWartsila (mesmo objeto de `parametros_gerais`, já carregado no
  // boot via WALLACE_PARAMETROS_GERAIS_V2 em app.js — ver seção 1.4 do manual). O único campo que
  // não existia nesse objeto (irrfBaseSemAdicionais) foi ACRESCENTADO a ele em 14/08/2026 (mesmo
  // valor de antes, 2639.04) — não duplicado em outro nome. Os literais abaixo são só fallback (se
  // o boot da V2 falhar), mesmo padrão defensivo já usado em VARS.ENERGISA_TARIFA_COMPOSICAO acima.
  const dzLabels = gerarMesesCiclo(12); // V165: baseado no ciclo financeiro
  const THFW = VARS.taxasHoraFolhaPontoWartsila || {};
  const SALARIO_BASE_GARANTIDO = THFW.salarioBaseFixoMensal ?? 10913.66;
  const PERICULOSIDADE_30PCT = (THFW.periculosidadeCampoII && THFW.periculosidadeCampoII.valorAtual) ?? 3274.10; // 30% da base, provento fixo sempre que há ao menos 1 dia trabalhado
  const SUPERVISAO_5PCT = (THFW.adicionalSupervisao5pct && THFW.adicionalSupervisao5pct.valorAtual) ?? 545.68;   // 5% da base, fixo desde que virou Supervisor
  const AUXILIO_CRECHE = (THFW.auxilioCreche && THFW.auxilioCreche.valorAtual) ?? 445.00;                        // fixo, não escala com o salário
  const INSS_TETO = (THFW.inssMes && THFW.inssMes.valorAtual) ?? 988.07;                                         // no teto de contribuição, constante
  const IRRF_BASE_SEM_ADICIONAIS = (THFW.irrfBaseSemAdicionais && THFW.irrfBaseSemAdicionais.valorAtual) ?? 2639.04; // residual: IRRF total do holerite (R$5.055,57) menos a parcela marginal 27,5% dos adicionais de hora extra
  const SAUDE_DENTAL_FIXO = (THFW.assistenciaMedicaOdontoBase && THFW.assistenciaMedicaOdontoBase.valorAtual) ?? 413.15; // dependente médica + odonto + dependente odonto
  const PGBL_6PCT = (THFW.pgbl && THFW.pgbl.valorAtual) ?? 654.82;                                               // 6% da base
  const dzLiquido = Math.round((
    (SALARIO_BASE_GARANTIDO + PERICULOSIDADE_30PCT + SUPERVISAO_5PCT + AUXILIO_CRECHE)
    - (INSS_TETO + IRRF_BASE_SEM_ADICIONAIS + SAUDE_DENTAL_FIXO + PGBL_6PCT)
  ) * 100) / 100; // R$10.483,36
  const dzPiso = alignSeriesCiclo(REG.evolucao.totalOperacional);
  const dzDeficit = dzPiso.map(p=>Math.round((dzLiquido-p)*100)/100);

  const dzDataLabelPlugin = {
    id:'dzDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 11px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        const d = dzDeficit[i];
        ctx.fillStyle = d<0 ? '#e2554f' : '#34c98a';
        const label = (d<0?'−':'+')+fmt0(Math.abs(d));
        // CORRIGIDO 20/08/2026 (achado do usuário, print real: rótulo "-4.982" da barra mais negativa
        // ficava em cima do rótulo "Ago/26" do eixo X). bar.y+16 empurrava o texto pra fora da área do
        // gráfico sempre que a barra era grande o suficiente pra base dela já estar perto do fundo do
        // canvas — sem limite, o rótulo saía da área de plot e sobrepunha os ticks abaixo. Agora
        // travado em chartArea.bottom-4, nunca ultrapassa o fundo real do gráfico.
        const yPos = d>=0 ? bar.y - 8 : Math.min(bar.y + 16, chart.chartArea.bottom - 4);
        ctx.fillText(label, bar.x, yPos);
      });
      ctx.restore();
    }
  };

  // NOVO 11/08/2026 (pedido do usuário: gráfico idêntico ao de cima, 2 eixos diferentes) — compara
  // o mínimo garantido MESMO SEM TRABALHAR NENHUM DIA (REG.deficitZero.liquidoSemTrabalhar, fórmula
  // "Não trabalha" já usada na seção 01) contra o piso absoluto que nunca é cortado (REG.reserva.piso,
  // mesmo valor de pisoTotal na seção 03). Os 2 são CONSTANTES (não uma série viva mês a mês, ao
  // contrário do gráfico acima) — por isso psPiso/psLiquido repetem o mesmo valor nos 12 meses de
  // propósito, não é bug.
  const psLabels = dzLabels; // mesma janela de 12 meses, mesma âncora de ciclo
  // CORRIGIDO 16/08/2026 (achado #18 da auditoria de 9 agentes: liquidoSemTrabalhar escapou da
  // migração de constantes pro Supabase feita em 14/08/2026, continuava só como literal hardcoded
  // em vars-operacional.js). REG.deficitZero.liquidoSemTrabalhar agora é calculado dinamicamente em
  // reg-operacional.js a partir de VARS.taxasHoraFolhaPontoWartsila (mesma fonte de THFW acima) — só
  // lido aqui, cálculo não duplicado.
  const psLiquido = REG.deficitZero.liquidoSemTrabalhar;
  const psPiso = psLabels.map(() => REG.reserva.piso);
  const psDeficit = psPiso.map(p => Math.round((psLiquido - p) * 100) / 100);

  const psDataLabelPlugin = {
    id:'psDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 11px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        const d = psDeficit[i];
        ctx.fillStyle = d<0 ? '#e2554f' : '#34c98a';
        const label = (d<0?'−':'+')+fmt0(Math.abs(d));
        ctx.fillText(label, bar.x, d>=0 ? bar.y - 8 : bar.y + 16);
      });
      ctx.restore();
    }
  };

  { const __chartExistente = Chart.getChart($('cPisoSemTrabalhar')); if (__chartExistente) __chartExistente.destroy(); }
  new Chart($('cPisoSemTrabalhar'), {
    type:'bar',
    plugins:[psDataLabelPlugin],
    data:{labels:psLabels,
      datasets:[{data:psDeficit,
        backgroundColor: psDeficit.map(v=>v<0?'#e2554f':'#34c98a'),
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Não trabalha: '+fmt(psLiquido),'O que NUNCA é cortado: '+fmt(psPiso[i]),(psDeficit[i]<0?'Não cobre: ':'Cobre com sobra: ')+fmt(Math.abs(psDeficit[i]))];}
      }}},
      scales:{x:{grid:{display:false},ticks:{
        color:(c)=>c.index===0?'#e2554f':'#a9a79f',
        font:(c)=>c.index===0?{size:9,weight:'700'}:{size:9}
      }},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  });

  const psTbody = $('psTableBody');
  if(psTbody){
    // NOVO 20/08/2026 (mesmo pedido do destaque em snTableBody): índice 0 é sempre o ciclo atual.
    psTbody.innerHTML = psLabels.map((m,i)=>{
      const d = psDeficit[i];
      const cor = d<0 ? 'var(--red)' : 'var(--green)';
      const sinal = d<0 ? '−' : '+';
      const atual = i===0;
      const mesEstilo = atual ? 'color:var(--red);font-weight:700' : 'color:var(--text-mid)';
      const mesTexto = m + (atual ? ' (atual)' : '');
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;'+mesEstilo+'">'+mesTexto+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(psLiquido)+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(psPiso[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+cor+'">'+sinal+fmt0(Math.abs(d))+'</td>'+
        '</tr>';
    }).join('');
  }

  const psViraEl = $('psViraSuperavit');
  if(psViraEl){
    const idxViraPs = psDeficit.findIndex(d=>d>=0);
    if(idxViraPs === 0){
      psViraEl.textContent = 'Já cobre';
    } else if(idxViraPs > 0){
      psViraEl.textContent = psLabels[idxViraPs]+' ('+(idxViraPs+1)+'º mês)';
    } else {
      psViraEl.textContent = 'Não cobre em nenhum dos 12 meses (valores fixos — não muda sozinho)';
    }
  }

  // NOVO 18/08/2026 (pedido do usuário): mesmo gráfico de cima (psLiquido, o mínimo garantido MESMO
  // SEM TRABALHAR, constante), mas comparado contra a série de 12 meses da Necessidade Líquida
  // (REG.evolucao.necessidadeLiquida — mesma fonte viva já usada no gráfico "Necessidade líquida do
  // salário — próximos ciclos"), não contra o piso absoluto constante ("O que NUNCA é cortado"). Por
  // isso pnlNec varia mês a mês (ao contrário de psPiso acima, que repete o mesmo valor 12x).
  const legPnlEl = $('legPisoSemTrabalharNecLiquida');
  if(legPnlEl){
    legPnlEl.innerHTML = `Compara o mínimo garantido MESMO SEM TRABALHAR NENHUM DIA no ciclo (fórmula "Não trabalha" validada, base+5%+creche−descontos, sem periculosidade — <strong>${fmt(psLiquido)}/mês</strong>) contra a Necessidade Líquida de cada um dos 12 meses (Boletos+Parcelas+Assinaturas+Recorrências+Consórcios+Aportes Patrimoniais+Orçamento Operacional). Diferente do gráfico acima, aqui o eixo de comparação varia mês a mês — não é constante.`;
  }
  const pnlNec = alignSeriesCiclo(REG.evolucao.necessidadeLiquida);
  const pnlDeficit = pnlNec.map(p => Math.round((psLiquido-p)*100)/100);
  // % que psLiquido (Não trabalha) precisaria aumentar pra igualar pnlNec[i] (Necessidade Líquida do
  // mês) — só faz sentido quando não cobre (pnlDeficit[i]<0); quando já cobre, 0% (não precisa aumentar).
  const pnlPctAumento = pnlNec.map((nec,i) => pnlDeficit[i] < 0 ? Math.round(((nec/psLiquido)-1)*10000)/100 : 0);

  const pnlDataLabelPlugin = {
    id:'pnlDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 11px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        const d = pnlDeficit[i];
        ctx.fillStyle = d<0 ? '#e2554f' : '#34c98a';
        const label = (d<0?'−':'+')+fmt0(Math.abs(d));
        ctx.fillText(label, bar.x, d>=0 ? bar.y - 8 : bar.y + 16);
      });
      ctx.restore();
    }
  };

  { const __chartExistente = Chart.getChart($('cPisoSemTrabalharNecLiquida')); if (__chartExistente) __chartExistente.destroy(); }
  new Chart($('cPisoSemTrabalharNecLiquida'), {
    type:'bar',
    plugins:[pnlDataLabelPlugin],
    data:{labels:psLabels,
      datasets:[{data:pnlDeficit,
        backgroundColor: pnlDeficit.map(v=>v<0?'#e2554f':'#34c98a'),
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; const linhas=['Não trabalha: '+fmt(psLiquido),'Necessidade líquida: '+fmt(pnlNec[i]),(pnlDeficit[i]<0?'Não cobre: ':'Cobre com sobra: ')+fmt(Math.abs(pnlDeficit[i]))]; if(pnlPctAumento[i]>0) linhas.push('Precisaria aumentar +'+pnlPctAumento[i].toFixed(2).replace('.',',')+'% para cobrir'); return linhas;}
      }}},
      scales:{x:{grid:{display:false},ticks:{
        color:(c)=>c.index===0?'#e2554f':'#a9a79f',
        font:(c)=>c.index===0?{size:9,weight:'700'}:{size:9}
      }},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  });

  const pnlTbody = $('pnlTableBody');
  // NOVO 20/08/2026 (mesmo pedido do destaque em snTableBody): índice 0 é sempre o ciclo atual.
  // NOVO 20/08/2026 (mesmo motivo do guard em snTableBody: pnlNec depende do déficit de caixas,
  // ajustado async depois do boot — sem isto, a 1ª pintura mostra número incompleto). Usa if/else
  // (não `return`) porque este bloco vive dentro de _lazyRenderCenariosDeficitEGraficosSolar(), que
  // também renderiza os gráficos de energia solar mais abaixo — um return aqui cortaria tudo isso.
  if(pnlTbody && window.WALLACE_DEFICIT_CAIXAS_PRONTO === false){
    pnlTbody.innerHTML = '<tr><td colspan="5" style="padding:0.6rem 0.5rem;color:var(--text-dim);text-align:center">Carregando dados reais…</td></tr>';
  } else if(pnlTbody){
    pnlTbody.innerHTML = psLabels.map((m,i)=>{
      const d = pnlDeficit[i];
      const cor = d<0 ? 'var(--red)' : 'var(--green)';
      const sinal = d<0 ? '−' : '+';
      const pct = pnlPctAumento[i];
      const pctTxt = pct>0 ? '+'+pct.toFixed(2).replace('.',',')+'%' : '—';
      const atual = i===0;
      const mesEstilo = atual ? 'color:var(--red);font-weight:700' : 'color:var(--text-mid)';
      const mesTexto = m + (atual ? ' (atual)' : '');
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;'+mesEstilo+'">'+mesTexto+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(psLiquido)+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(pnlNec[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+cor+'">'+sinal+fmt0(Math.abs(d))+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+(pct>0?'var(--red)':'var(--text-dim)')+'">'+pctTxt+'</td>'+
        '</tr>';
    }).join('');
  }

  const pnlViraEl = $('pnlViraSuperavit');
  if(pnlViraEl){
    const idxViraPnl = pnlDeficit.findIndex(d=>d>=0);
    if(idxViraPnl === 0){
      pnlViraEl.textContent = 'Já cobre';
    } else if(idxViraPnl > 0){
      pnlViraEl.textContent = psLabels[idxViraPnl]+' ('+(idxViraPnl+1)+'º mês)';
    } else {
      pnlViraEl.textContent = 'Não cobre em nenhum dos 12 meses';
    }
  }

  { const __chartExistente = Chart.getChart($('cDeficitZero')); if (__chartExistente) __chartExistente.destroy(); }
  new Chart($('cDeficitZero'), {
    type:'bar',
    plugins:[dzDataLabelPlugin],
    data:{labels:dzLabels,
      datasets:[{data:dzDeficit,
        backgroundColor: dzDeficit.map(v=>v<0?'#e2554f':'#34c98a'),
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22,bottom:16}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Piso mínimo líquido garantido (base+30%+5%+creche−descontos): '+fmt(dzLiquido),'Total Operacional: '+fmt(dzPiso[i]),(dzDeficit[i]<0?'Não cobre: ':'Cobre com sobra: ')+fmt(Math.abs(dzDeficit[i]))];}
      }}},
      scales:{x:{grid:{display:false},ticks:{
        color:(c)=>c.index===0?'#e2554f':'#a9a79f',
        font:(c)=>c.index===0?{size:9,weight:'700'}:{size:9}
      }},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  });

  // Tabela HTML organizada abaixo do grafico - liquido, piso e diferenca por mes, texto real
  // (nao desenhado em canvas), garante legibilidade sem risco de sobreposicao.
  const dzTbody = $('dzTableBody');
  // NOVO 20/08/2026 (mesmo pedido do destaque em snTableBody): índice 0 é sempre o ciclo atual.
  // NOVO 20/08/2026 (mesmo motivo do guard em pnlTbody acima: dzPiso depende do déficit de caixas,
  // ajustado async depois do boot — if/else em vez de return, mesmo motivo).
  if(dzTbody && window.WALLACE_DEFICIT_CAIXAS_PRONTO === false){
    dzTbody.innerHTML = '<tr><td colspan="4" style="padding:0.6rem 0.5rem;color:var(--text-dim);text-align:center">Carregando dados reais…</td></tr>';
  } else if(dzTbody){
    dzTbody.innerHTML = dzLabels.map((m,i)=>{
      const d = dzDeficit[i];
      const cor = d<0 ? 'var(--red)' : 'var(--green)';
      const sinal = d<0 ? '−' : '+';
      const atual = i===0;
      const mesEstilo = atual ? 'color:var(--red);font-weight:700' : 'color:var(--text-mid)';
      const mesTexto = m + (atual ? ' (atual)' : '');
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;'+mesEstilo+'">'+mesTexto+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzLiquido)+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzPiso[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+cor+'">'+sinal+fmt0(Math.abs(d))+'</td>'+
        '</tr>';
    }).join('');
  }

  // CORRIGIDO 04/08/2026: "Déficit vira superávit em" estava hardcoded no HTML ("Set/26 (3º mês)"),
  // nunca recalculado - por isso ficou errado assim que o ciclo virou. Calculado agora a partir da
  // MESMA serie dzDeficit/dzLabels que ja alimenta o grafico e a tabela acima (sem duplicar logica,
  // sem numero novo inventado). i+1 = ordinal contado a partir do 1o mes da janela atual (gerarMesesCiclo),
  // nao de uma data fixa antiga - por isso passa a acompanhar o ciclo automaticamente daqui pra frente.
  const dzViraEl = $('dzViraSuperavit');
  if(dzViraEl){
    const idxVira = dzDeficit.findIndex(d=>d>=0);
    if(idxVira === 0){
      dzViraEl.textContent = 'Já em superávit';
    } else if(idxVira > 0){
      dzViraEl.textContent = dzLabels[idxVira]+' ('+(idxVira+1)+'º mês)';
    } else {
      dzViraEl.textContent = 'Não vira nos próximos 12 meses';
    }
  }
}

// ===== Energia Solar — aba própria "☀️ Energia Solar" (08/08/2026) =====
// Extraída de dentro de _lazyRenderCenariosDeficitEGraficosSolar() (só a divisão de função é nova —
// zero linha de cálculo solar reescrita, é o mesmo corpo de código de antes, só passou a ter sua
// própria função). Motivo: o Solar tinha esse gatilho compartilhado com Gráficos/Cenários só por
// conveniência histórica (mesmo comentário antigo já admitia isso) — não havia nenhuma variável
// realmente compartilhada com a parte de Déficit Zero (conferido: nenhum `dz*`/`fmt0` usado daqui
// pra baixo). Chamada só quando a aba "solar" abre (initSolarLazy(), showMaster.js) — Gráficos/
// Cenários não iniciam mais os gráficos solares.
async function _lazyRenderSolarSecao(){
  const grid2 = '#2a2d31';
  const legendStd2 = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};

  // Energia: comparacao mes a mes, ano anterior (real) vs este ano (projetado com solar).
  // Tarifa real da fatura Jun/2026 (R$322,99/304kWh=R$1,0625/kWh, ICMS+PIS/COFINS ja embutidos).
  // So apartamento do Wallace. Fonte Jul/25-Abr/26: Projeto_Solar_Wallace_Consolidado.md.
  // Mai/26: interpolado entre Abr/26 e Jun/26 (nao ha leitura direta) - marcado com *.
  // Jun/26: real, confirmado na fatura Energisa.
  const mesesPares = ['Jul','Ago','Set','Out','Nov','Dez','Jan','Fev','Mar','Abr','Mai*','Jun'];
  // REVERTIDO 22/08/2026 (achado real do usuário: "você colocou 279 tanto no ciclo que acabou hoje
  // como no próximo, mas o próximo ainda não tem fatura, tem que usar o valor de referência do ano
  // passado") — a tentativa de 22/08/2026 mais cedo (preferir consumo real da fatura sobre o
  // histórico) quebrou a "Meta" do Fluxo 1/Fluxo 2 (META_WALLACE, linha ~2644, e o fallback de
  // metaWallaceFechado, linha ~2760): as duas leem este MESMO array kwhAnoAnterior como referência
  // "quanto eu consumia antes/de referência" — quando Agosto passou a ter fatura real (279, já COM
  // solar), a "meta" virou a comparação de um número com ele mesmo, sem sentido nenhum. Este array
  // serve múltiplos propósitos com significados diferentes (referência histórica pra Fluxo 1/2 vs.
  // "consumo esperado" no gráfico 11) — não dá pra sobrescrever na origem sem quebrar um dos dois.
  // Voltou a ser 100% o literal histórico, como era antes de hoje.
  const kwhAnoAnterior = [321,262,279,297,405,265,211,273,330,343,323,304];
  // NOVO 03/08/2026 (pedido do usuário: gráfico 09 "deve andar pra frente automático... o deslocamento
  // na 00h do dia 1 de cada mês" - diferente dos gráficos 10/11, que usam o ciclo de leitura dia 8,
  // este aqui usa o MÊS CALENDÁRIO puro, por decisão explícita do usuário). Âncora = mês de ativação
  // (Jul/2026, mesesPares[0]). Mesmo mecanismo usado em ciclosDesdeAncoraCiclo (topo do arquivo), só
  // que a virada é sempre dia 1, não dia 25 (financeiro) nem dia 8 (leitura solar).
  const ANCHOR_ENERGIA_ANO = Number(VARS.solarDataAtivacao.split('-')[0]);
  const ANCHOR_ENERGIA_MES = Number(VARS.solarDataAtivacao.split('-')[1]); // 7 = Jul
  function offsetMesesCalendario(){
    const hoje = new Date();
    return (hoje.getFullYear()-ANCHOR_ENERGIA_ANO)*12 + (hoje.getMonth()+1-ANCHOR_ENERGIA_MES);
  }
  const OFFSET_ENERGIA = Math.max(0, Math.min(11, offsetMesesCalendario())); // limitado a 11 - alem disso nao ha mais historico de 12 meses pra mostrar
  function alignEnergia(series){
    if(OFFSET_ENERGIA<=0) return series.slice();
    const shifted = series.slice(OFFSET_ENERGIA);
    while(shifted.length < series.length) shifted.push(null);
    return shifted;
  }
  const MESES_ABREV_ENERGIA = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function gerarRotulosEnergia(){
    const labels = [];
    for(let i=0;i<12;i++){
      const idxMes = ((ANCHOR_ENERGIA_MES - 1 + OFFSET_ENERGIA + i) % 12 + 12) % 12;
      labels.push(MESES_ABREV_ENERGIA[idxMes]);
    }
    return labels;
  }
  const mesesParesEnergia = gerarRotulosEnergia(); // rotulos deslocados (o proprio eixo "anda" junto, igual aos outros graficos)
  const tarifa = VARS.faturaEnergisaValor/VARS.faturaEnergisaKwh;
  const anoAnterior = kwhAnoAnterior.map(k=>Math.round(k*tarifa*100)/100);
  // CORRIGIDO 01/08/2026 (pedido do usuario - "os R$70 são muito conservadores"): valorPosSolar
  // ERA so consumoMinimoComSolarKwh*tarifa + taxaMinimaEnergisa (R$69,87 = so Disponibilidade+Iluminacao,
  // faltava Fio B e Encargos). Agora usa a MESMA formula completa e automatica do card "Quanto voce
  // ainda vai pagar" (secao logo abaixo neste arquivo) - Disponibilidade + Fio B + Iluminacao + Encargos,
  // calculados a partir de VARS.ENERGISA_TARIFA_COMPOSICAO.apartamento_wallace (fatura real Jul/2026).
  const compApto = VARS.ENERGISA_TARIFA_COMPOSICAO && VARS.ENERGISA_TARIFA_COMPOSICAO.apartamento_wallace;
  let valorPosSolar;
  if(compApto && compApto.historico && compApto.consumo_kwh){
    const fB = compApto.historico.jul26, cK = compApto.consumo_kwh, pct = compApto.composicao_pct;
    const tarifaReal = fB / cK;
    const fioBFracao = (VARS.FIO_B_COBRANCA_2026_PCT/100) * (VARS.FIO_B_PCT_DA_DISTRIBUICAO/100);
    const custoDisp = VARS.consumoMinimoComSolarKwh * tarifaReal;
    const fioBValor = fB * (pct.distribuicao/100) * fioBFracao;
    const iluminacaoValor = fB * (pct.iluminacao/100);
    const encargosValor = fB * (pct.encargos/100);
    valorPosSolar = Math.round((custoDisp + fioBValor + iluminacaoValor + encargosValor) * 100) / 100;
  } else {
    // fallback pro calculo antigo, so se a composicao tarifaria nao estiver disponivel por algum motivo
    valorPosSolar = Math.round((VARS.consumoMinimoComSolarKwh*tarifa + VARS.taxaMinimaEnergisa)*100)/100;
  }
  // CORRIGIDO 03/08/2026 (achado do usuário: gráfico 09 nunca tinha avançado - ficava sempre em Jul):
  // mesesPares[0]='Jul' é o mês de ATIVAÇÃO, não necessariamente "hoje" - o índice que recebe o valor
  // calculado ao vivo (geração real, não projeção) é OFFSET_ENERGIA (quantos meses de calendário já
  // passaram desde a ativação), não mais fixo em 0.
  // Regra: a fatura minima (valorPosSolar, calculado acima - Disponibilidade+FioB+Iluminacao+Encargos)
  // so vale se o credito solar cobrir 100% do consumo do apartamento; se a ultima leitura mostrar saldo
  // NEGATIVO (credito ainda nao cobre o consumo esperado), soma o deficit x tarifa por cima do minimo -
  // reflete o que a fatura real provavelmente vai cobrar.
  const solarCalcAtual = VARS.SOLAR_LEITURAS_CALC[VARS.SOLAR_LEITURAS_CALC.length-1];
  const deficitWallaceAtual = solarCalcAtual ? Math.max(0, -solarCalcAtual.saldoWallace) : 0;
  const valorMesAtualCalculado = Math.round((valorPosSolar + deficitWallaceAtual*tarifa)*100)/100;
  // CORRIGIDO 01/08/2026 (V227, pedido do usuario - "confuso, valor tem que ser o real quando eu der,
  // senao o calculado"): cada mes agora prioriza VARS.ENERGIA_FATURAS_REAIS[mes] (fatura de verdade,
  // informada pelo usuario) e so cai pro calculo/projecao quando essa chave nao existir.
  const esteAnoFonte = mesesPares.map((mes,i)=>{
    const nomeMes = mes.replace('*','');
    if(VARS.ENERGIA_FATURAS_REAIS[nomeMes] !== undefined) return {valor:VARS.ENERGIA_FATURAS_REAIS[nomeMes], fonte:'real'};
    if(i===OFFSET_ENERGIA) return {valor:valorMesAtualCalculado, fonte:'calculado'};
    return {valor:valorPosSolar, fonte:'projetado'};
  });
  const esteAno = esteAnoFonte.map(e=>e.valor);

  // NOVO 01/08/2026 (V244, pedido do usuario): valores de volta em cima das barras - a versao V227
  // tinha removido TUDO (inclusive o numero simples da barra) pra resolver a colisao do texto de
  // "economia" sobreposto (ver historico). Agora so o valor da barra (sem o "-XXX" de economia por
  // cima, que era a causa real da colisao) - risco de colisao muito menor, mesmo padrao ja usado nos
  // graficos 10/11.
  // CORRIGIDO 03/08/2026 (achado do usuário, print real - "faltou o julho no final"): a v1 usava
  // slice+pad-com-null (mesmo padrão dos gráficos 10/11) - mas ali faz sentido (não estimar crédito
  // futuro sem dado real), aqui NÃO faz sentido: "ano anterior" é histórico REAL de 12 meses que se
  // repete todo ano, e "este ano" sempre tem uma projeção padrão (valorPosSolar) pra qualquer mês sem
  // fatura real. Trocado para busca por NOME DO MÊS (não por posição) - o último mês da janela de 12
  // (Jul/27, 13 meses após a ativação) agora encontra o Jul original (kwhAnoAnterior[0]) de novo, sem
  // buraco. Nunca mais fica vazio, não importa quantos meses passem.
  const kwhPorMesAnterior = {};
  mesesPares.forEach((m,i)=>{ kwhPorMesAnterior[m.replace('*','')] = kwhAnoAnterior[i]; });
  const anoAnteriorAlinhado = mesesParesEnergia.map(label=>{
    const kwh = kwhPorMesAnterior[label];
    return kwh!=null ? Math.round(kwh*tarifa*100)/100 : null;
  });
  // esteAnoFonteAlinhado: mesmo raciocínio - reconstruído do zero em cima dos rótulos JÁ alinhados
  // (mesesParesEnergia), não mais fatiando o array original. índice 0 é SEMPRE "agora" por construção
  // de OFFSET_ENERGIA (ver gerarRotulosEnergia) - fatura real tem prioridade, senão calculado (mês
  // atual) ou projetado (todo o resto, inclusive o Jul de wrap-around).
  const esteAnoFonteAlinhado = mesesParesEnergia.map((label,i)=>{
    if(VARS.ENERGIA_FATURAS_REAIS[label] !== undefined) return {valor:VARS.ENERGIA_FATURAS_REAIS[label], fonte:'real'};
    if(i===0) return {valor:valorMesAtualCalculado, fonte:'calculado'};
    return {valor:valorPosSolar, fonte:'projetado'};
  });
  const esteAnoAlinhado = esteAnoFonteAlinhado.map(e=>e.valor);


  const energiaBarLabelPlugin = {
    id:'energiaBarLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "600 7.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      chart.data.datasets.forEach((ds,di)=>{
        const meta = chart.getDatasetMeta(di);
        ctx.fillStyle = di===0 ? '#e8a63a' : '#34c98a';
        meta.data.forEach((bar,i)=>{
          const v = ds.data[i];
          if(v===null || v===undefined) return;
          ctx.fillText('R$'+Math.round(v), bar.x, bar.y - 4);
        });
      });
      // NOVO 02/08/2026 (pedido do usuario - achado num snapshot antigo do Netlify que tinha isso e
      // sumiu nessa versao): numero azul da ECONOMIA do mes (esteAno - anoAnterior, sempre negativo =
      // economizou), desenhado acima da barra laranja (a mais alta na maioria dos meses) - mesma
      // logica ja usada no tooltip (afterLabel), so que agora tambem fixo na tela, sem precisar tocar.
      const metaAnoAnterior = chart.getDatasetMeta(0);
      ctx.fillStyle = '#3987e5';
      ctx.font = "700 7.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      metaAnoAnterior.data.forEach((bar,i)=>{
        const economia = esteAnoAlinhado[i] - anoAnteriorAlinhado[i]; // sempre <=0 (negativo = economizou)
        if(economia===null || economia===undefined || isNaN(economia)) return;
        ctx.fillText((economia>=0?'+':'')+Math.round(economia), bar.x, bar.y - 14);
      });
      ctx.restore();
    }
  };

  observeAndRenderChart($('cEnergiaSolar'), () => { const __chartExistente = Chart.getChart($('cEnergiaSolar')); if (__chartExistente) __chartExistente.destroy(); return new Chart($('cEnergiaSolar'), {
    type:'bar',
    plugins:[energiaBarLabelPlugin],
    data:{labels:mesesParesEnergia,
      datasets:[
        {label:'Ano anterior (real, sem solar)', data:anoAnteriorAlinhado, backgroundColor:'#e8a63a', borderRadius:3},
        {label:'Este ano (com solar)', data:esteAnoAlinhado, backgroundColor:esteAnoFonteAlinhado.map(e=>e && e.fonte==='real' ? '#1f9d66' : '#34c98a'), borderRadius:3}
      ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:legendStd2,tooltip:{callbacks:{
        label:c=>{
          if(c.datasetIndex===1){
            const fonteObj = esteAnoFonteAlinhado[c.dataIndex];
            const f = fonteObj ? fonteObj.fonte : null;
            const rotulo = f==='real' ? ' (fatura real)' : f==='calculado' ? ' (geração real)' : ' (projeção)';
            return c.dataset.label+rotulo+': '+fmt(c.raw);
          }
          return c.dataset.label+': '+fmt(c.raw);
        },
        afterLabel:c=>{
          if(c.datasetIndex!==1) return '';
          const economia = anoAnteriorAlinhado[c.dataIndex] - esteAnoAlinhado[c.dataIndex];
          return 'Economia: '+fmt(economia);
        }
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.6,barPercentage:0.75},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  }); });
  // CORRIGIDO 03/08/2026: era anoAnterior[0]/esteAno[0] (sempre Jul, nunca avançava) - agora usa o
  // indice 0 do array JA ALINHADO, que corresponde ao mes atual de verdade (mesesParesEnergia[0]).
  const economiaAtual = anoAnteriorAlinhado[0] - esteAnoAlinhado[0];
  const economiaAnualEstimada = anoAnteriorAlinhado.reduce((s,v)=>s+(v||0),0) - esteAnoAlinhado.reduce((s,v)=>s+(v||0),0);
  const legEnergiaEl = $('legEnergiaSolar');
  if(legEnergiaEl){
    const mesAtualLabel = mesesParesEnergia[0];
    const fonteAtual = esteAnoFonteAlinhado[0];
    legEnergiaEl.innerHTML = 'Mês atual ('+mesAtualLabel+'/26): ano anterior <strong style="color:#e8a63a">'+fmt(anoAnteriorAlinhado[0])+'</strong> vs. este ano <strong style="color:#34c98a">'+fmt(esteAnoAlinhado[0])+'</strong> ('+(fonteAtual && fonteAtual.fonte==='real'?'fatura real':'baseado na geração real do medidor')+') → economia de <strong style="color:#3987e5">'+fmt(economiaAtual)+'</strong> no mês. Projeção de economia nos 12 meses: <strong style="color:#3987e5">'+fmt(economiaAnualEstimada)+'</strong>. Toque numa barra pro valor exato e a fonte (real/calculado/projeção).';
  }

  // NOVO 01/08/2026 (pedido do usuario): estimativa de fatura residual pos-solar por unidade,
  // 100% AUTOMATICA - nunca mais numero digitado. Formula completa (residual = o que voce paga MESMO
  // com creditos cobrindo 100% do consumo):
  //   1) Custo de Disponibilidade (piso que nunca zera, nem com credito de sobra) = kWh minimo da
  //      ligacao (30 monofasica / 50 bi-trifasica) x tarifa real da unidade (fatura_base/consumo_kwh)
  //   2) Fio B (cobrado sobre a fatia da Distribuicao que a lei NAO deixa compensar) = fatura_base x
  //      pct_distribuicao x (FIO_B_COBRANCA_2026_PCT/100) x (FIO_B_PCT_DA_DISTRIBUICAO/100)
  //   3) Iluminacao Publica (COSIP) = fatura_base x pct_iluminacao - nunca compensada, por lei
  //   4) Encargos setoriais = fatura_base x pct_encargos - nao compensados pelos creditos de GD
  // Mesma logica ja usada isoladamente pro apartamento (VARS.taxaMinimaEnergisa/consumoMinimoComSolarKwh,
  // ver secao 09) - generalizada aqui pras 3 unidades com a tarifa real de cada uma.
  const residualTbodyEl = $('residualPosSolarTbody');
  if(residualTbodyEl){
    const comp = VARS.ENERGISA_TARIFA_COMPOSICAO || {};
    const fioBFracaoDaDistribuicao = (VARS.FIO_B_COBRANCA_2026_PCT/100) * (VARS.FIO_B_PCT_DA_DISTRIBUICAO/100); // 0,168
    // CORRIGIDO 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #4): "16,8%"/"83,2%" (e os 2
    // percentuais que os compõem) estavam escritos crus no texto explicativo do card — o cronograma
    // da Lei 14.300 sobe FIO_B_COBRANCA_2026_PCT todo ano (era 45% em 2025, sobe pra 75% em 2027), e
    // o texto ficaria errado sozinho sem ninguém perceber. Calculado a partir da mesma fonte usada
    // 2 linhas acima, nunca mais escrito a mão.
    { const set1=(id,v)=>{ const el=$(id); if(el) el.textContent=v; };
      const fmtPct1 = v => v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
      set1('fioBPctCobranca2026', VARS.FIO_B_COBRANCA_2026_PCT);
      set1('fioBPctDaDistribuicao', VARS.FIO_B_PCT_DA_DISTRIBUICAO);
      set1('fioBFormula', VARS.FIO_B_COBRANCA_2026_PCT+'%×'+VARS.FIO_B_PCT_DA_DISTRIBUICAO+'%');
      set1('fioBPctCobrado', fmtPct1(fioBFracaoDaDistribuicao*100));
      set1('fioBPctCompensado', fmtPct1(100-fioBFracaoDaDistribuicao*100));
    }
    const unidades = [
      { chave:'apartamento_wallace', nome:'Apartamento (Wallace)', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
      { chave:'casa_wellida', nome:'Casa da Wellida', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
      { chave:'casa_mae', nome:'Casa da Mãe (geradora)', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
    ];
    // CORRIGIDO 19/08/2026 (2ª rodada, achado do usuário): a versão anterior deste bloco tinha
    // faturaEnergisaMaisRecente(d), que buscava a fatura 'fatura_<mês><ano>_valor' mais NOVA pra usar
    // como "fatura base pré-solar" — pra casa_mae/casa_wellida isso pegava sempre a fatura MAIS
    // contaminada por crédito solar (o oposto do que a coluna deveria mostrar). Removida — ver
    // fatura_pre_solar_valor/_consumo_kwh abaixo, referência fixa em vez de "sempre a mais nova".
    const linhas = unidades.map(u => {
      const d = comp[u.chave];
      if(!d) return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">dados insuficientes</td></tr>`;
      // CORRIGIDO 19/08/2026 (achado do usuário: "esses valores da minha mãe e minha irmã são já do
      // valor solar"): esta coluna é "fatura BASE, pré-solar" — mas faturaEnergisaMaisRecente(d)
      // pega sempre a fatura mais NOVA, e pra casa_mae/casa_wellida o crédito solar já está entrando
      // em toda fatura registrada desde mai/26 (valor caindo mês a mês: Wellida 141,82→106,23→94,45→
      // 70,12; Mãe 301,54→203,61→56,11) — a fatura "mais recente" é sempre a MAIS contaminada por
      // crédito, o oposto do que esta coluna deveria mostrar. Confirmado com o usuário: só a fatura
      // de ago/26 já tem solar; jul/26 pra trás é limpa. Referência agora é FIXA em
      // fatura_pre_solar_valor/_consumo_kwh (congelada em jul/26, a última sem solar) em vez de
      // seguir a fatura mais nova do robô — nunca mais avança sozinha. Fallback pro comportamento
      // antigo só se essa chave nova ainda não existir pra alguma casa.
      const faturaBase = d.fatura_pre_solar_valor !== undefined ? d.fatura_pre_solar_valor
        : (d.historico ? d.historico.jul26 : d.fatura_jul26_valor);
      const consumoKwh = d.fatura_pre_solar_consumo_kwh || d.consumo_kwh || d.fatura_jul26_consumo_kwh;
      const pct = d.composicao_pct || {};
      if(faturaBase === undefined || !consumoKwh) return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">dados insuficientes</td></tr>`;
      const tarifaReal = faturaBase / consumoKwh;
      const custoDisponibilidade = Math.round(u.kwhMinimo * tarifaReal * 100) / 100;
      const fioBValor = Math.round(faturaBase * (pct.distribuicao||0)/100 * fioBFracaoDaDistribuicao * 100) / 100;
      // CORRIGIDO 12/08/2026: quando existe cosip_valor_real (extraido da fatura real, linha "CONTRIB
      // ILUM PUBLICA"), usa o valor exato em vez de estimar por pct.iluminacao - a COSIP e uma linha
      // separada da fatura, nao uma fatia percentual do consumo, entao um % chutado sempre erra o
      // valor exato que a lei nunca deixa compensar.
      const iluminacaoValor = d.cosip_valor_real !== undefined ? d.cosip_valor_real : Math.round(faturaBase * (pct.iluminacao||0)/100 * 100) / 100;
      const encargosValor = Math.round(faturaBase * (pct.encargos||0)/100 * 100) / 100;
      const residualFormula = Math.round((custoDisponibilidade + fioBValor + iluminacaoValor + encargosValor) * 100) / 100;
      // CORRIGIDO 22/08/2026 (auditoria pedida pelo usuário, achado real: a fórmula acima mistura 2
      // % diferentes que a Energisa divulga com sentidos distintos — a tabela interna do PDF
      // "Distribuição/Energia/Transmissão/Encargos/Impostos" (usada em pct.*, soma 100% de um
      // subtotal técnico) NÃO é a mesma coisa que a % "Entenda seu consumo" do app oficial, que
      // decompõe o VALOR FINAL já com crédito aplicado — usar uma pra estimar a outra dá número
      // errado. Quando existe residual_validado (número cross-validado contra fatura real com
      // compensação perto de 100%, não mais extrapolado de %), ele tem prioridade sobre a fórmula.
      const residual = d.residual_validado !== undefined ? d.residual_validado : residualFormula;
      const economia = Math.round((faturaBase - residual) * 100) / 100;
      const economiaPct = Math.round((economia/faturaBase)*1000)/10;
      const detalhe = d.residual_validado !== undefined
        ? (d.residual_validado_fonte || 'Validado contra fatura real com compensação próxima de 100%')
        : `Disponibilidade ${fmt(custoDisponibilidade)} + Fio B ${fmt(fioBValor)} + Iluminação ${fmt(iluminacaoValor)} + Encargos ${fmt(encargosValor)} (estimativa por %, não validada contra fatura próxima de 100% ainda)`;
      // NOVO 22/08/2026 (pedido do usuário: "coloque quantos kWh são, não só o valor") — cada coluna
      // em R$ ganha o equivalente em kWh entre parênteses, usando a mesma tarifaReal (R$/kWh) já
      // calculada acima pra esta unidade.
      const residualKwh = Math.round((residual/tarifaReal)*10)/10;
      const economiaKwh = Math.round((economia/tarifaReal)*10)/10;
      return `<tr><td>${u.nome}</td><td class="r">${fmt(faturaBase)} <span style="color:var(--text-dim)">(${fmtKwhPtBr(consumoKwh)} kWh)</span></td><td class="r" style="color:var(--red)" title="${detalhe}">${fmt(residual)} <span style="color:var(--text-dim)">(${fmtKwhPtBr(residualKwh)} kWh)</span></td><td class="r" style="color:var(--green)">${fmt(economia)} (${economiaPct}%) <span style="color:var(--text-dim)">(${fmtKwhPtBr(economiaKwh)} kWh)</span></td></tr>`;
    }).join('');
    residualTbodyEl.innerHTML = `<table><thead><tr><th>Unidade</th><th class="r">Fatura base (pré-solar)</th><th class="r">Residual estimado/mês</th><th class="r">Economia estimada</th></tr></thead><tbody>${linhas}</tbody></table>`;

    // NOVO 22/08/2026 (pedido do usuário: "preciso ter no site um lugar para ver o quanto eu pagaria
    // sem a energia solar e quanto realmente vou pagar, para ver a economia"). Diferente da tabela
    // acima (residual = PISO teórico fixo, sempre igual, não muda mês a mês): esta é a economia REAL
    // deste mês — consumo real que o robô já capturou este mês × tarifa da última fatura pré-solar
    // (R$/kWh, Jul/26) = estimativa de "sem solar", comparada com a fatura real que o robô também já
    // capturou este mês ("com solar"). NÃO usa a linha "Total" da tabela de composição da fatura
    // (achado 22/08/2026, 3 PDFs reais comparados: essa linha é maior que a fatura paga pro Wallace e
    // pra Wellida, mas bateu EXATAMENTE igual à fatura paga da Mãe no mesmo mês — inconsistente
    // demais entre as 3 casas pra confiar como "quanto pagaria sem crédito", então não vira número na
    // tela até isso ficar entendido). Usa só campos já validados nesta mesma função (faturaBase/
    // consumoKwh acima, mais fatura_<mês>_valor/_consumo_kwh, capturados pelo robô todo mês).
    const economiaRealTbodyEl = $('economiaRealTbody');
    if(economiaRealTbodyEl){
      const MESES_CHAVE_ROBO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
      const agoraChave = new Date();
      const chaveMesAtual = MESES_CHAVE_ROBO[agoraChave.getMonth()]+String(agoraChave.getFullYear()%100).padStart(2,'0');
      const linhasEconomia = unidades.map(u => {
        const d = comp[u.chave];
        if(!d) return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">dados insuficientes</td></tr>`;
        const faturaPreSolar = d.fatura_pre_solar_valor;
        const consumoPreSolar = d.fatura_pre_solar_consumo_kwh;
        const valorMesAtual = d[`fatura_${chaveMesAtual}_valor`];
        const consumoMesAtual = d[`fatura_${chaveMesAtual}_consumo_kwh`];
        if(faturaPreSolar === undefined || !consumoPreSolar || valorMesAtual === undefined || !consumoMesAtual){
          return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">ainda sem fatura de ${chaveMesAtual} capturada pelo robô</td></tr>`;
        }
        const tarifaPreSolar = faturaPreSolar / consumoPreSolar;
        const semSolar = Math.round(tarifaPreSolar * consumoMesAtual * 100) / 100;
        const economiaReal = Math.round((semSolar - valorMesAtual) * 100) / 100;
        const economiaRealPct = semSolar > 0 ? Math.round((economiaReal/semSolar)*1000)/10 : 0;
        const tituloTarifa = fmtKwhPtBr(consumoMesAtual)+' kWh × R$'+tarifaPreSolar.toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4})+'/kWh (tarifa da fatura pré-solar, Jul/26)';
        return `<tr><td>${u.nome}</td><td class="r" title="${tituloTarifa}">${fmt(semSolar)}</td><td class="r" style="color:var(--green)">${fmt(valorMesAtual)}</td><td class="r" style="color:var(--accent)">${fmt(economiaReal)} (${economiaRealPct}%)</td></tr>`;
      }).join('');
      economiaRealTbodyEl.innerHTML = `<table><thead><tr><th>Unidade</th><th class="r">Sem solar (estimado)</th><th class="r">Com solar (real)</th><th class="r">Economia real</th></tr></thead><tbody>${linhasEconomia}</tbody></table>`;
    }
  }



  // REESTRUTURADO 01/08/2026 (V231, pedido do usuario): "montar o grafico 10 por mes, usando o
  // consumo dos ultimos 12 meses como consumo ate eu atualizar o real". Antes cada barra era uma
  // LEITURA (cumulativa desde ativacao); agora cada barra e um MES do calendario (mesmo eixo Jul..Jun
  // da secao 09), e cada mes recebe:
  // - Consumo Wallace: reaproveita kwhAnoAnterior (consumo REAL do apartamento nos ultimos 12 meses,
  //   ja usado na secao 09) como estimativa de referencia - Wallace pediu explicitamente pra usar isso
  //   como base "ate eu atualizar o real" (quando ele tiver consumo pos-solar de fato medido).
  // - Consumo Irma: consumoDiarioIrma x 30 (nao ha historico mensal dela ainda, so a media fixa).
  // - Credito Wallace/Irma: derivado das leituras reais (SOLAR_LEITURAS), agrupadas por CICLO DE
  //   LEITURA da Energisa (nao mais mes de calendario - CORRIGIDO 03/08/2026, pedido do usuario:
  //   "a conta de julho ja foi paga, o credito deve ir todo pra agosto"). A Casa da Mae (onde fica a
  //   usina) fecha o ciclo no MESMO dia que a Wellida - dia 8 (confirmado pelo usuario 03/08/2026,
  //   ver DIA_LEITURA_WELLIDA mais abaixo, secao Previsao). Uma leitura feita dia D pertence ao ciclo
  //   que fecha no dia 8 seguinte (se D<=8, fecha no dia 8 do MESMO mes; se D>8, fecha no dia 8 do
  //   mes SEGUINTE) - e esse mes de fechamento e o "rotulo" usado no grafico, pois e o mes em que a
  //   fatura de fato reflete aquele credito. Ativacao (21/07) cai no ciclo que fecha em 08/08 -> todo
  //   credito gerado desde a ativacao entra no rotulo "Ago", nada fica em "Jul" (ciclo de julho ja
  //   tinha fechado e a fatura ja foi paga antes da usina existir).
  const CICLO_DIA_LEITURA_GERACAO = 8; // dia oficial de leitura Energisa da Casa da Mae - mesmo ciclo da Wellida
  function mesFechamentoCiclo(dataStr){
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    let m = dia <= CICLO_DIA_LEITURA_GERACAO ? mes : mes + 1;
    if(m > 12) m = 1;
    return m; // 1-12, mes em que o ciclo de leitura FECHA (mes que a fatura reflete)
  }
  // NOVO 08/08/2026 (Solar entra na V2 — modelo de ciclos de crédito): busca o ciclo aberto atual
  // (baseline_kwh = ponto de partida do ciclo, 0 até o 1º fechamento real) e o histórico de ciclos já
  // fechados. SOLAR_LEITURAS/SOLAR_LEITURAS_CALC continuam vindo de VARS (já V2-sourced desde o boot,
  // ver app.js) — aqui só busca o que falta pra separar "ciclo atual" de "acumulado desde ativação".
  // Falha aqui NUNCA cai pro cálculo antigo (proibido fallback silencioso pro V1): baselineKwh fica
  // null e os elementos dependentes mostram "⚠ Indisponível (V2)" em vez de reexibir o acumulado como
  // se fosse o ciclo atual (os dois só coincidem numericamente enquanto nenhum ciclo fechou ainda).
  let cicloSolarAberto = null, ciclosSolarFechados = [];
  try {
    [cicloSolarAberto, ciclosSolarFechados] = await Promise.all([
      WallaceFinanceService.getCicloSolarAbertoV2(),
      WallaceFinanceService.getCiclosSolarHistoricoV2(),
    ]);
  } catch(err){
    console.error('CicloSolar: falha ao buscar vw_ciclo_solar_aberto/vw_ciclo_solar_historico — domínio V2-exclusivo, sem fallback silencioso.', err);
  }
  const baselineKwh = cicloSolarAberto ? Number(cicloSolarAberto.baseline_kwh) : null;
  window.WALLACE_CICLO_SOLAR_RELATORIO = { cicloAberto: cicloSolarAberto, ciclosFechados: ciclosSolarFechados, status: baselineKwh!=null ? 'ok' : 'erro_v2' };

  const solarL = VARS.SOLAR_LEITURAS_CALC;
  const ultimaSolar = solarL[solarL.length-1];
  // CORRIGIDO 03/08/2026 (2ª rodada - achado do usuário com print real, "continua errado"): a v1 desta
  // correção só tinha alinhado ROTULO=DADO usando mesAtivacao (Jul, mês de CALENDÁRIO da ativação) como
  // âncora comum - isso deixava "Jul" sempre como 1ª coluna, vazia, e "Ago" só aparecia na 2ª posição.
  // Tecnicamente alinhado (dado batia com rótulo), mas visualmente ainda "errado" pro que foi pedido:
  // já que nada pertence ao ciclo de julho (pago antes da usina existir), ele nem deveria aparecer -
  // Ago tem que ser a PRIMEIRA coluna. Corrigido de vez: a âncora agora é o CICLO DE LEITURA (mês em
  // que o 1º ciclo FECHA = Ago), usada tanto pro agrupamento dos dados quanto pros rótulos - a mesma
  // variável em 1 lugar só, nunca mais duas âncoras diferentes pra a mesma coisa.
  const ANCHOR_SOLAR_ANO = Number(VARS.solarDataAtivacao.split('-')[0]);
  const ANCHOR_SOLAR_MES_CICLO = mesFechamentoCiclo(VARS.solarDataAtivacao); // 8 = Ago/2026 - unica ancora, usada em TUDO abaixo (dados E rotulos)
  const leituraMaisRecentePorMes = {}; // {indiceMes 0-11: leitura com maior creditoLiquido acumulado naquele CICLO}
  // CORRIGIDO 11/08/2026 (achado do usuário, print real: barra "Set" aparecendo com dado provisório
  // em 11/08, quando Set nem começou) — antes, QUALQUER leitura manual nova (mesmo não-oficial, tirada
  // em pleno ciclo aberto) já criava/avançava um bucket de mês via mesFechamentoCiclo(l.data), que
  // empurra qualquer dia>8 pro mês seguinte. Isso fazia uma foto tirada dia 11 (ciclo ainda aberto,
  // sem fechar) "criar" uma barra "Set" com número parcial, e o aviso de congelamento citava "Set"
  // como se já tivesse passado. Corrigido: só leituras OFICIAIS (fecham um ciclo de verdade,
  // eh_leitura_oficial_energisa=true) alimentam o histórico mês a mês — mesma regra "só por ciclo
  // fechado" já usada no card "Fluxo 1" (seção 04). Leitura em andamento no ciclo aberto não cria
  // barra nova; o progresso ao vivo continua visível nos KPIs do topo (Crédito do ciclo atual).
  solarL.forEach(l=>{
    if(!l.ehLeituraOficial) return;
    const mesLeitura = mesFechamentoCiclo(l.data);
    const idx = (mesLeitura - ANCHOR_SOLAR_MES_CICLO + 12) % 12; // idx0 = Ago (1º ciclo), nao mais Jul
    if(!leituraMaisRecentePorMes[idx] || l.creditoLiquido > leituraMaisRecentePorMes[idx].creditoLiquido) leituraMaisRecentePorMes[idx] = l;
  });

  // NOVO 03/08/2026 (pedido do usuario: "esses graficos devem andar pra frente automatico como o
  // grafico de necessidade"): mesmo padrao ja usado la (alignSeriesCiclo/ciclosDesdeAncoraCiclo,
  // topo do arquivo) - so que aqui a ancora e o CICLO DE LEITURA (dia 8), nao o ciclo financeiro
  // (dia 25). So afeta a CAMADA DE APRESENTACAO (labels/dados dos 2 graficos abaixo) - nao mexe nos
  // arrays originais (creditoMensalWallace etc), que continuam servindo o texto/legenda como antes.
  function offsetCiclosSolar(){
    const hoje = new Date();
    const inicioCicloAtual = hoje.getDate() > CICLO_DIA_LEITURA_GERACAO
      ? new Date(hoje.getFullYear(), hoje.getMonth()+1, 1)
      : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return (inicioCicloAtual.getFullYear()-ANCHOR_SOLAR_ANO)*12 + (inicioCicloAtual.getMonth()+1-ANCHOR_SOLAR_MES_CICLO);
  }
  // CORRIGIDO 09/08/2026 (achado do usuário, 2ª vez que o gráfico aparecia vazio): offsetCiclosSolar()
  // sozinho só olha o calendário (dia > 8 do mês = "já virou"), sem checar se um ciclo de verdade
  // fechou. Trava o avanço em ciclosSolarFechados.length (já buscado acima, Nível A) — a tela só anda
  // pra frente quando um ciclo REALMENTE fechou, nunca antes disso por suposição de calendário.
  //
  // CORRIGIDO 11/08/2026 (achado do usuário, "faltando os gráficos" — regressão real: o 1º ciclo
  // solar de verdade da história deste sistema fechou nesta sessão, ciclosSolarFechados.length foi
  // de 0 pra 1, e SÓ ISSO já empurrou o único dado real (Ago, 343 kWh) pra fora da janela de 12
  // meses via alignSolar()/slice(OFFSET_SOLAR) — a correção de 09/08 acima evitava a janela andar
  // ANTES de existir ciclo real nenhum, mas não evitava ela engolir o PRIMEIRO ciclo real assim que
  // ele fechasse, com a janela ainda longe de estar cheia (só 1 de 12 posições ocupadas). A janela só
  // deveria começar a "rolar" (perder o mês mais antigo) quando já tiver mais ciclos fechados que
  // cabem nela — com 11 ciclos fechados o 12º ainda cabe todo, só o 12º->13º force a rolagem.
  const OFFSET_SOLAR = Math.max(0, Math.min(offsetCiclosSolar(), ciclosSolarFechados.length - 11));
  const MESES_ABREV_SOLAR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function gerarRotulosSolar(){
    const labels = [];
    for(let i=0;i<12;i++){
      const idxMes = ((ANCHOR_SOLAR_MES_CICLO - 1 + OFFSET_SOLAR + i) % 12 + 12) % 12; // MESMA ancora dos dados (Ago)
      labels.push(MESES_ABREV_SOLAR[idxMes]);
    }
    return labels;
  }
  function alignSolar(series){
    if(OFFSET_SOLAR<=0) return series.slice();
    const shifted = series.slice(OFFSET_SOLAR);
    while(shifted.length < series.length) shifted.push(null); // futuro sem dado real - nunca estimar (regra V250)
    return shifted;
  }
  const mesesParesSolar = gerarRotulosSolar(); // rotulos que os 2 graficos abaixo (Rede Energisa/Rateio) usam - "andam" sozinhos conforme os ciclos passam


  // CORRIGIDO 05/08/2026 (achado do usuário: barra amarela "Consumo direto" nunca aparecia no
  // 1º ciclo, mesmo com geracaoAcumulada real em todas as leituras): geracaoAcumAnterior começava em
  // `null` (diferente de creditoAcumAnterior/leitura03Anterior/leitura103Anterior, que começam em 0),
  // só pra distinguir "sem dado do robô SAJ ainda" de "zero de verdade". Mas isso também fazia
  // `temGeracaoReal` ficar falso pro 1º ciclo inteiro (nada pra comparar "antes" da ativação) - mesmo
  // problema que credito/leitura03/103 JÁ resolviam corretamente usando 0 como ponto de partida (a
  // geração TOTAL desde a ativação conta pro 1º ciclo, mesma lógica do crédito). Alinhado com o
  // mesmo padrão dos outros 3 campos - 0 aqui também, não null.
  let creditoAcumAnterior = 0, leitura03Anterior = 0, leitura103Anterior = 0, diasAcumAnterior = 0, geracaoAcumAnterior = 0;
  const creditoMensalWallace = [], creditoMensalIrma = [], temLeituraNoMes = [];
  // CORRIGIDO 01/08/2026 (V250, documento "SEM ESTIMATIVAS"): consumo direto mensal agora deriva da
  // GERACAO REAL do inversor SAJ (delta mes-a-mes de geracaoAcumulada), nunca mais da estimativa fixa
  // solarGeracaoDiariaEstimada. Sem leitura real de geracao em 2 meses consecutivos, fica null (sem
  // barra) em vez de estimar.
  const importadoMensal = [], exportadoMensal = [], geracaoEstMensal = [], consumoDiretoMensal = [], saldoLiquidoMensal = [];
  // NOVO 03/08/2026: rastreia quais meses tiveram o consumo direto CONGELADO (ver logica abaixo) -
  // usado pra montar o aviso automatico na legenda do grafico.
  const consumoDiretoCongeladoMes = [];
  let ultimoConsumoDiretoValido = null; // carrega o ultimo valor >=0 confirmado, mes a mes
  for(let i=0;i<12;i++){
    const l = leituraMaisRecentePorMes[i];
    if(l){
      const creditoDoMes = Math.round((l.creditoLiquido - creditoAcumAnterior)*100)/100;
      creditoMensalWallace.push(Math.round(creditoDoMes*VARS.solarRateioWallace*100)/100);
      creditoMensalIrma.push(Math.round(creditoDoMes*VARS.solarRateioIrma*100)/100);
      const importadoDoMes = Math.round((l.leitura03 - leitura03Anterior)*100)/100;
      const exportadoDoMes = Math.round((l.leitura103 - leitura103Anterior)*100)/100;
      const temGeracaoReal = l.geracaoAcumulada!=null && geracaoAcumAnterior!=null;
      const geracaoDoMes = temGeracaoReal ? Math.round((l.geracaoAcumulada - geracaoAcumAnterior)*100)/100 : null;
      const consumoDiretoBruto = temGeracaoReal ? Math.round((geracaoDoMes - exportadoDoMes)*100)/100 : null;
      // CORRIGIDO 03/08/2026 (achado do usuário, gráfico "Rede Energisa") — REVISADO na mesma data
      // (usuário não gostou de esconder a barra): consumo direto negativo é fisicamente impossível -
      // só acontece quando a automação SAJ (geração) e a leitura manual do 103 (exportado) estão
      // dessincronizadas no tempo. Em vez de null (barra some), agora CONGELA no último valor válido
      // (>=0) já confirmado e marca o mês em consumoDiretoCongeladoMes[] - a legenda automática abaixo
      // do gráfico avisa quais meses estão "presos" nesse estado, sem esconder informação nenhuma.
      let consumoDiretoDoMes;
      if(consumoDiretoBruto!=null && consumoDiretoBruto < 0){
        consumoDiretoDoMes = ultimoConsumoDiretoValido; // pode ser null ainda se nunca teve um valor valido antes
        consumoDiretoCongeladoMes.push(true);
      } else {
        consumoDiretoDoMes = consumoDiretoBruto;
        consumoDiretoCongeladoMes.push(false);
        if(consumoDiretoBruto!=null) ultimoConsumoDiretoValido = consumoDiretoBruto;
      }
      importadoMensal.push(importadoDoMes);
      exportadoMensal.push(exportadoDoMes);
      geracaoEstMensal.push(geracaoDoMes);
      consumoDiretoMensal.push(consumoDiretoDoMes);
      saldoLiquidoMensal.push(creditoDoMes);
      creditoAcumAnterior = l.creditoLiquido;
      leitura03Anterior = l.leitura03;
      leitura103Anterior = l.leitura103;
      diasAcumAnterior = l.dias;
      geracaoAcumAnterior = l.geracaoAcumulada;
      temLeituraNoMes.push(true);
    } else {
      creditoMensalWallace.push(null);
      creditoMensalIrma.push(null);
      importadoMensal.push(null);
      exportadoMensal.push(null);
      geracaoEstMensal.push(null);
      consumoDiretoMensal.push(null);
      consumoDiretoCongeladoMes.push(false);
      saldoLiquidoMensal.push(null);
      temLeituraNoMes.push(false);
    }
  }

  // NOVO 11/08/2026 (pedido do usuário: "não sabemos a hora que o leiturista passa, vamos dividir a
  // quantidade" — aplicado só aqui, Consumo Direto, por decisão explícita do usuário: o crédito do
  // ciclo/rateio Wallace-Irmã usa só os códigos 03/103, cumulativos como odômetro, sem essa
  // ambiguidade). Quando o mês i termina numa leitura marcada como fronteira oficial de ciclo
  // (ehLeituraOficial), a geração TOTAL daquele dia (energia_solar_geracao_diaria, robô SAJ) é
  // dividida meio-a-meio: metade fica no mês que fecha (i), metade passa pro mês que abre (i+1) —
  // aproximação razoável já que a leitura manual (03/103) e o total diário do robô não têm o mesmo
  // timestamp exato. Sem essa correção, geracaoDoMes[i] levava o dia inteiro da fronteira, e o mês
  // seguinte começava sem ele (mesmo problema em menor escala pra qualquer fronteira, não só day 08).
  for(let i=0;i<12;i++){
    const l = leituraMaisRecentePorMes[i];
    if(!l || !l.ehLeituraOficial || geracaoEstMensal[i] == null) continue;
    const diaFronteira = (VARS.SOLAR_GERACAO_DIARIA||[]).find(g => g.data === l.data);
    if(!diaFronteira || typeof diaFronteira.kwh !== 'number') continue;
    const metade = Math.round((diaFronteira.kwh/2)*100)/100;
    geracaoEstMensal[i] = Math.round((geracaoEstMensal[i] - metade)*100)/100;
    consumoDiretoMensal[i] = consumoDiretoMensal[i] != null ? Math.round((consumoDiretoMensal[i] - metade)*100)/100 : consumoDiretoMensal[i];
    if(i+1 < 12 && geracaoEstMensal[i+1] != null){
      geracaoEstMensal[i+1] = Math.round((geracaoEstMensal[i+1] + metade)*100)/100;
      consumoDiretoMensal[i+1] = consumoDiretoMensal[i+1] != null ? Math.round((consumoDiretoMensal[i+1] + metade)*100)/100 : consumoDiretoMensal[i+1];
    }
  }

  // CORRIGIDO 11/08/2026 (achado do usuário, print real: barra "Ago" mostrando crédito Wallace 214/
  // Irmã 87 quando o fechamento oficial é 137,74/56,26) — a leitura manual do medidor de 07/08
  // (60→361 = delta bruto de 301 kWh) não bateu com a fatura real da Energisa (delta oficial 194 kWh,
  // ver evidência gravada na leitura) e o crédito desse ciclo foi corrigido À MÃO em ciclos_solares
  // (194/137,74/56,26) sem recalcular a leitura em si. O loop acima (creditoMensalWallace/Irma/
  // saldoLiquidoMensal) recalcula do zero a partir do delta bruto da leitura — ignorando a correção
  // gravada e voltando a mostrar o número errado. Sobrescreve aqui com o valor OFICIAL de cada ciclo
  // JÁ FECHADO (mesma fonte de ciclosSolarFechados já usada em renderFluxo1Fechado/tabela "Histórico
  // de ciclos fechados") — nunca mais os gráficos e a tabela mostrando números diferentes pro mesmo
  // ciclo.
  ciclosSolarFechados.forEach(c => {
    const mesFecha = mesFechamentoCiclo(c.data_fim);
    const idx = (mesFecha - ANCHOR_SOLAR_MES_CICLO + 12) % 12;
    creditoMensalWallace[idx] = Number(c.credito_wallace_kwh);
    creditoMensalIrma[idx] = Number(c.credito_irma_kwh);
    saldoLiquidoMensal[idx] = Number(c.credito_liquido_kwh);
  });

  const consumoMensalWallace = kwhAnoAnterior; // consumo real dos ultimos 12 meses (mesma base da secao 09)
  // REVERTIDO 22/08/2026 (mesmo motivo do kwhAnoAnterior acima — META_WELLIDA, linha ~2634, lê este
  // mesmo array como referência do ano passado; sobrescrever com a fatura real quebrava a mesma forma).
  const consumoMensalIrma = VARS.solarConsumoIrmaAnoAnterior;

  // CORRIGIDO 11/08/2026 (achado do usuário, print real: gráfico "Rateio Solar" mostrando Ago=321/74
  // quando deveria ser Ago=262/70): consumoMensalWallace/consumoMensalIrma (kwhAnoAnterior/
  // solarConsumoIrmaAnoAnterior) são indexados por CALENDÁRIO (mesesPares[0]='Jul', índice fixo,
  // igual à seção 09) - mas estavam sendo alinhados aqui embaixo com alignSolar()/OFFSET_SOLAR, que
  // usa uma âncora DIFERENTE (ciclo de fechamento, dia 8) e fica travado em 0 até existir mais de 1
  // ciclo fechado (regra correta pro Crédito, que não deve "andar" antes de ter dado real - ver
  // comentário de OFFSET_SOLAR acima). Misturar as duas âncoras empurrava o valor de Julho pra baixo
  // do rótulo "Ago". Corrigido com o MESMO truque de lookup por nome do mês já usado em
  // kwhPorMesAnterior/anoAnteriorAlinhado (seção 09) - imune a quantos ciclos já fecharam, sempre
  // calendário real.
  const kwhWallacePorMes = {}, kwhIrmaPorMes = {};
  mesesPares.forEach((m,i) => {
    const nome = m.replace('*','');
    kwhWallacePorMes[nome] = kwhAnoAnterior[i];
    kwhIrmaPorMes[nome] = consumoMensalIrma[i];
  });
  const consumoMensalWallaceAlinhado = mesesParesSolar.map(label => kwhWallacePorMes[label] != null ? kwhWallacePorMes[label] : null);
  const consumoMensalIrmaAlinhado = mesesParesSolar.map(label => kwhIrmaPorMes[label] != null ? kwhIrmaPorMes[label] : null);

  // NOVO 02/08/2026 (pedido EXPLICITO do usuario - o texto sozinho na Unidade Geradora nao bastava,
  // "só a nota não é o impacto do gráfico"): a barra do MES CALENDARIO ATUAL no grafico 11 (Rateio
  // Solar) tambem precisa refletir o valor calculado (geracao real do inversor - consumo medio da
  // casa), nao so ficar parada na ultima leitura real parcial daquele mes. Mesma formula/regra da
  // estimativa da Unidade Geradora: some pra dentro deste grafico especifico, nao muda o dado bruto
  // (SOLAR_LEITURAS continua 100% real) - so a exibicao desta barra.
  let diasComDadoRealSolar = 0, diasProjetadosSolar = 0;
  let idxCicloAberto = null; // índice (0-11) da barra do ciclo AINDA ABERTO no gráfico Rateio Solar, se houver — usado pra estilizar essa barra diferente das fechadas
  if(ultimaSolar && ultimaSolar.geracaoAcumulada != null && diasAcumAnterior >= 0){
    const hojeChart = new Date();
    const hojeSoDataChart = new Date(Date.UTC(hojeChart.getFullYear(), hojeChart.getMonth(), hojeChart.getDate()));
    const dataUltimaLeituraChart = new Date(ultimaSolar.data);
    const diasDesdeLeituraChart = Math.max(0, Math.round((hojeSoDataChart - dataUltimaLeituraChart) / 86400000));
    if(diasDesdeLeituraChart > 0){
      const diasDesdeAtivacaoChart = ultimaSolar.dias;
      const geracaoMediaDiariaChart = diasDesdeAtivacaoChart > 0 ? ultimaSolar.geracaoAcumulada / diasDesdeAtivacaoChart : 0;
      const consumoMedioMensalMaeChart = VARS.solarConsumoMaeAnoAnterior.reduce((s,v)=>s+v,0) / VARS.solarConsumoMaeAnoAnterior.length;
      const consumoMedioDiarioMaeChart = consumoMedioMensalMaeChart / 30;
      // MELHORADO 05/08/2026 (pedido do usuario: "já temos dados diários do SAJ, tenta melhorar
      // isso" - a estimativa usava só a MEDIA desde a ativacao pra projetar os dias entre a ultima
      // leitura manual e hoje, mesmo quando o robo SAJ ja tem o dado REAL de alguns desses dias
      // (SOLAR_GERACAO_DIARIA, gravado 2x/dia desde 03/08). Agora percorre dia a dia o periodo:
      // usa o kWh REAL do robo quando existe pra aquele dia especifico, e só cai pra media nos dias
      // sem dado real (ex: antes de 03/08, ou uma falha pontual do robo). Reduz a divergencia entre
      // esta barra (grafico 10/11) e a Secao 12/13 (Previsao, usa só a ultima leitura confirmada).
      const diariosPorDataMap = {};
      (VARS.SOLAR_GERACAO_DIARIA||[]).forEach(r => { diariosPorDataMap[r.data] = r.kwh; });
      let geracaoEstimadaTotalPeriodo = 0;
      let diasComDadoReal = 0;
      for(let d=1; d<=diasDesdeLeituraChart; d++){
        const dataDoDia = new Date(dataUltimaLeituraChart);
        dataDoDia.setDate(dataDoDia.getDate() + d);
        const chaveISO = dataDoDia.toISOString().slice(0,10);
        if(diariosPorDataMap[chaveISO] != null){
          geracaoEstimadaTotalPeriodo += diariosPorDataMap[chaveISO];
          diasComDadoReal++;
        } else {
          geracaoEstimadaTotalPeriodo += geracaoMediaDiariaChart;
        }
      }
      const saldoTotalEstimadoChart = ultimaSolar.creditoLiquido + geracaoEstimadaTotalPeriodo - diasDesdeLeituraChart * consumoMedioDiarioMaeChart;
      diasComDadoRealSolar = diasComDadoReal;
      diasProjetadosSolar = diasDesdeLeituraChart - diasComDadoReal;
      // NOVO 05/08/2026 (pedido do usuario, 3a vez reportando a mesma divergencia entre este grafico
      // e a Secao 12/13): antes a Previsao usava so ultimaSolar.creditoLiquido (parado na ultima
      // leitura manual), enquanto este grafico projetava pra frente - dois numeros diferentes pro
      // mesmo conceito. Exposto em VARS pra a Previsao reusar a MESMA projecao, um numero so em vez
      // de dois caminhos de calculo divergentes.
      VARS._creditoLiquidoProjetadoHoje = saldoTotalEstimadoChart;
      VARS._diasProjetadosSolar = diasProjetadosSolar;
      VARS._diasComDadoRealSolar = diasComDadoRealSolar;

      // RESTAURADO 11/08/2026 (pedido explícito do usuário, revertendo a remoção de mais cedo hoje:
      // "quero que o valor que está sendo gerado vai somando aqui, se não não tem sentido ter esse
      // gráfico") — mas com o problema original resolvido de outro jeito: o valor ao vivo do ciclo
      // aberto volta a aparecer na barra, só que agora é claramente distinguível (cor mais clara/
      // transparente, ver backgroundColor do dataset abaixo) das barras de ciclo REALMENTE fechado —
      // antes as duas pareciam idênticas, o que fazia parecer que "Set" já tinha fechado. Fórmula
      // idêntica à da seção 04 (Fluxo 2), mesma fonte (baselineKwh), nunca diverge dela.
      const mesAtualCalendario = mesFechamentoCiclo(hojeSoDataChart.toISOString().slice(0,10));
      idxCicloAberto = (mesAtualCalendario - ANCHOR_SOLAR_MES_CICLO + 12) % 12;
      if(baselineKwh != null){
        const creditoLiquidoCicloAbertoEstimado = Math.round((saldoTotalEstimadoChart - baselineKwh) * 100) / 100;
        creditoMensalWallace[idxCicloAberto] = Math.round(creditoLiquidoCicloAbertoEstimado * VARS.solarRateioWallace * 100) / 100;
        creditoMensalIrma[idxCicloAberto] = Math.round(creditoLiquidoCicloAbertoEstimado * VARS.solarRateioIrma * 100) / 100;
        temLeituraNoMes[idxCicloAberto] = true;
      }
    }
  }

  // ===== CORRIGIDO 01/08/2026 (V250): Unidade Geradora SEM ESTIMATIVAS (documento do usuário) =====
  // Antes: consumo direto derivado de uma geracao ESTIMADA (25,6 kWh/dia fixo). Usuario pediu para
  // eliminar qualquer estimativa - agora so calcula quando existir leitura REAL de geracaoAcumulada
  // (inversor SAJ). Sem esse dado, os campos dependentes mostram "Dados insuficientes para calculo"
  // em vez de estimar - nunca mais inventar um numero.
  const avisosConsistenciaEl = $('ugAvisosConsistencia');
  if(avisosConsistenciaEl && VARS.SOLAR_AVISOS_CONSISTENCIA.length){
    avisosConsistenciaEl.style.display = 'block';
    avisosConsistenciaEl.innerHTML = '⚠️ <strong>Possível erro de leitura detectado:</strong><br>' + VARS.SOLAR_AVISOS_CONSISTENCIA.join('<br>');
  }
  if(ultimaSolar){
    const importadoAcum = ultimaSolar.leitura03;
    const exportadoAcum = ultimaSolar.leitura103;
    const saldoLiquidoAcum = ultimaSolar.creditoLiquido;
    const geracaoAcum = ultimaSolar.geracaoAcumulada; // null ate o usuario informar a leitura real do inversor
    const temGeracao = geracaoAcum !== null && geracaoAcum !== undefined;
    // NOVO 01/08/2026 (V259, achado do usuário): geracaoAcumulada agora e atualizada sozinha todo dia
    // pelo robo da SAJ, mas leitura03/leitura103 (medidor Energisa) so mudam quando o usuario manda
    // foto nova. Sem checagem, o descompasso entre as duas datas cresce sozinho e o calculo de
    // consumo direto fica cada vez mais errado (geracao "andando" sem o 103 acompanhar). Avisa
    // quando a diferenca passar de 3 dias - a partir dai o erro comeca a pesar de verdade.
    if(temGeracao && ultimaSolar.geracaoAcumuladaData){
      const diasDescompasso = Math.round((new Date(ultimaSolar.geracaoAcumuladaData) - new Date(ultimaSolar.data)) / 86400000);
      if(diasDescompasso >= 3){
        VARS.SOLAR_AVISOS_CONSISTENCIA.push(`A geração (atualizada automaticamente em ${ultimaSolar.geracaoAcumuladaData}) está ${diasDescompasso} dias à frente da última leitura 03/103 do medidor (${ultimaSolar.data}) — o cálculo de consumo direto/autoconsumo está ficando impreciso. Manda uma leitura nova do medidor pra recalibrar.`);
        if(avisosConsistenciaEl){
          avisosConsistenciaEl.style.display = 'block';
          avisosConsistenciaEl.innerHTML = '⚠️ <strong>Possível erro de leitura detectado:</strong><br>' + VARS.SOLAR_AVISOS_CONSISTENCIA.join('<br>');
        }
      }
    }

    const setUG = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
    const INSUFICIENTE = 'Dados insuficientes para cálculo.';

    setUG('ugImportado', fmtKwhPtBr(importadoAcum)+' kWh');
    setUG('ugExportado', fmtKwhPtBr(exportadoAcum)+' kWh');
    // NOVO 08/08/2026 (Solar entra na V2 — modelo de ciclos): ugSaldoLiquido vira o PRINCIPAL —
    // crédito do CICLO ATUAL (acumulado desde ativação MENOS o baseline do ciclo aberto), não mais
    // o acumulado puro. baselineKwh vem de vw_ciclo_solar_aberto (fetch no topo desta função); se a
    // V2 não respondeu, mostra "⚠ Indisponível (V2)" em vez de reexibir o acumulado disfarçado de
    // ciclo atual — os dois só coincidem numericamente enquanto nenhum ciclo fechou ainda.
    const ugSaldoEl = $('ugSaldoLiquido');
    if(baselineKwh != null){
      const creditoCicloAtual = Math.round((saldoLiquidoAcum - baselineKwh)*100)/100;
      setUG('ugSaldoLiquido', (creditoCicloAtual>=0?'+':'')+fmtKwhPtBr(creditoCicloAtual)+' kWh');
      if(ugSaldoEl) ugSaldoEl.style.color = creditoCicloAtual>=0 ? 'var(--green)' : 'var(--red)';
    } else {
      setUG('ugSaldoLiquido', '⚠ Indisponível (V2)');
      if(ugSaldoEl) ugSaldoEl.style.color = 'var(--red)';
    }
    // Secundário — acumulado desde a ativação (21/07), a mesma métrica que era o número principal
    // antes de hoje. Continua 100% real, só deixou de ser o número em destaque.
    // CORRIGIDO 12/08/2026 (pente fino pedido pelo usuário: "os dois números lado a lado confundem,
    // não fica óbvio como um vira o outro" — achado real, os dois só coincidem enquanto nenhum ciclo
    // fechou ainda): texto agora deixa explícita a relação (ciclo atual = este total MENOS os ciclos
    // já fechados e congelados), em vez de só rotular "acumulado" sem dizer o que isso soma.
    setUG('ugAcumuladoDesdeAtivacao', 'Soma bruta desde 21/07 (inclui ciclos já fechados): '+(saldoLiquidoAcum>=0?'+':'')+fmtKwhPtBr(saldoLiquidoAcum)+' kWh');

    // Histórico de ciclos fechados (seção 11) — dado gravado em ciclos_solares, nunca recalculado.
    const historicoEl = $('historicoCiclosSolares');
    if(historicoEl){
      if(!Array.isArray(ciclosSolarFechados)){
        historicoEl.innerHTML = '<span style="color:var(--text-danger)">⚠ Indisponível (V2)</span>';
      } else if(ciclosSolarFechados.length === 0){
        // CORRIGIDO 11/08/2026 (achado do usuário, print real: "20/07 – 06/08" quando o ciclo real é
        // 21/07 – 07/08, 1 dia a menos nas duas pontas): new Date('2026-07-21').toLocaleDateString()
        // interpreta a string como meia-noite UTC; sem fixar o timezone, formatar pro fuso do Brasil
        // (UTC-3) subtrai 3h e cai no dia ANTERIOR. Corrigido com conversão só de texto (sem passar
        // por Date/fuso nenhum) — mesmo truque já usado em fmtDataBr() mais abaixo neste arquivo.
        const fmtDataSemFuso = iso => iso ? iso.slice(0,10).split('-').reverse().join('/') : '—';
        historicoEl.innerHTML = '<span style="color:var(--text-dim);font-style:italic">Nenhum ciclo fechado ainda — o ciclo atual está aberto desde '+(cicloSolarAberto ? fmtDataSemFuso(cicloSolarAberto.data_inicio) : '21/07/2026')+'.</span>';
      } else {
        // CORRIGIDO 11/08/2026 (achado do usuário, print real: tabela mostrando "R$ 194,00 kWh") —
        // fmt() é formatador de MOEDA ('R$ '+número), reaproveitado aqui por engano pra uma coluna
        // que é kWh, não Real. Corrigido com formatador local só de número (mesmas 2 casas decimais).
        const fmtKwhHistorico = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
        const fmtDataSemFuso = iso => iso ? iso.slice(0,10).split('-').reverse().join('/') : '—';
        historicoEl.innerHTML = '<table style="width:100%;font-size:0.78rem"><thead><tr><th style="text-align:left">Período</th><th class="r">Crédito líquido</th><th class="r">Wallace</th><th class="r">Wellida</th></tr></thead><tbody>'
          + ciclosSolarFechados.map(c => {
              const ini = fmtDataSemFuso(c.data_inicio);
              const fim = fmtDataSemFuso(c.data_fim);
              return '<tr><td>'+ini+' – '+fim+'</td><td class="r">'+fmtKwhHistorico(Number(c.credito_liquido_kwh))+' kWh</td><td class="r">'+fmtKwhHistorico(Number(c.credito_wallace_kwh))+' kWh</td><td class="r">'+fmtKwhHistorico(Number(c.credito_irma_kwh))+' kWh</td></tr>';
            }).join('')
          + '</tbody></table>';
      }
    }

    // NOVO 02/08/2026 (pedido EXPLICITO do usuario, reversao PONTUAL da regra "SEM ESTIMATIVAS" de
    // V250 - só pra este campo, com autorizacao clara, documentada, mesma logica ja aceita pra
    // projecao de salario/bonus): saldo liquido ESTIMADO pro dia de hoje, pra o numero nao ficar
    // "parado" entre leituras manuais do medidor. Formula: parte do ultimo saldo REAL (leitura103-
    // leitura03) e soma (geracao media diaria - consumo medio diario da Casa da Mae) x dias desde
    // a ultima leitura. SEMPRE e so uma estimativa - a leitura real, quando chegar, sobrescreve tudo
    // (mesma regra "fatura sempre vence" usada em todo o resto do sistema). Nunca usado como fonte
    // pro rateio da secao 11 (isso continua 100% real) - so exibido aqui, claramente rotulado.
    const hoje = new Date();
    // CORRIGIDO 02/08/2026 (achado do usuário): comparar Date completo (com hora) contra uma data
    // pura tipo '2026-08-01' inflava a contagem de dias - '2026-08-01' vira meia-noite UTC, e "hoje"
    // (com hora local, ex: 19h) já passa de 1,5 dia de diferença de tarde pra frente, arredondando
    // pra 2 mesmo sendo só "ontem pra hoje" (1 dia de calendário). Corrigido comparando só a DATA
    // (sem hora) dos dois lados.
    const hojeSoData = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    const dataUltimaLeitura = new Date(ultimaSolar.data);
    const diasDesdeLeitura = Math.max(0, Math.round((hojeSoData - dataUltimaLeitura) / 86400000));
    const diasDesdeAtivacao = ultimaSolar.dias; // dias desde 21/07/2026 ate a ultima leitura
    const geracaoMediaDiaria = diasDesdeAtivacao > 0 ? geracaoAcum / diasDesdeAtivacao : 0;
    const consumoMedioMensalMae = VARS.solarConsumoMaeAnoAnterior.reduce((s,v)=>s+v,0) / VARS.solarConsumoMaeAnoAnterior.length;
    const consumoMedioDiarioMae = consumoMedioMensalMae / 30;
    // CORRIGIDO 16/08/2026 (achado de auditoria: este card ("Estimativa pra hoje") e a Previsão
    // (Fluxo 1, ~linha 2103) calculavam o mesmo conceito com 2 fórmulas diferentes — esta aqui usava
    // só a média achatada desde a ativação; a Previsão já usa VARS._creditoLiquidoProjetadoHoje
    // (dia a dia real do robô SAJ quando existe, average só como fallback pontual — ver bloco ~1396).
    // Reaproveita o mesmo número em vez de recalcular com a fórmula menos precisa; só cai pro cálculo
    // local se a projeção não tiver sido calculada (ex: sem geracaoAcumulada real ainda).
    const saldoLiquidoEstimado = temGeracao
      ? Math.round((VARS._creditoLiquidoProjetadoHoje != null
          ? VARS._creditoLiquidoProjetadoHoje
          : saldoLiquidoAcum + diasDesdeLeitura * (geracaoMediaDiaria - consumoMedioDiarioMae)) * 100) / 100
      : null;

    const ugEstimativaEl = $('ugSaldoLiquidoEstimado');
    if(ugEstimativaEl){
      if(saldoLiquidoEstimado !== null && diasDesdeLeitura > 0){
        ugEstimativaEl.style.display = 'block';
        ugEstimativaEl.innerHTML = `📊 Estimativa pra hoje: <strong style="color:${saldoLiquidoEstimado>=0?'#34c98a':'#e2554f'}">${saldoLiquidoEstimado>=0?'+':''}${fmtKwhPtBr(saldoLiquidoEstimado)} kWh</strong> (${diasDesdeLeitura} dia(s) desde a última leitura do medidor, calculado automaticamente com base na geração real do inversor − consumo médio da casa) — <strong>é estimativa, não leitura real</strong>; sempre que você mandar uma foto nova do medidor, o valor real substitui essa estimativa. Não precisa mandar leitura todo dia — isso aqui só preenche o intervalo sozinho.`;
      } else {
        ugEstimativaEl.style.display = 'none';
      }
    }

    // CORRIGIDO 02/08/2026 (achado do usuário, achado direto no resumo em texto): consumoDireto =
    // geracaoAcum - exportadoAcum assume SILENCIOSAMENTE que 100% da geracao nova (desde a ultima
    // leitura) vira consumo direto, ZERO vira exportacao nova - suposicao que fica cada vez mais
    // errada quanto mais dias passam sem leitura nova (na vida real, parte da geracao nova
    // certamente esta sendo exportada tambem, so que isso nao aparece ate o usuario atualizar
    // leitura103). Antes disso nunca ficava explicito - o numero so ia "crescendo errado" sem avisar.
    // Agora: alem do aviso ja existente (>=3 dias), TRAVA o calculo em INSUFICIENTE quando o
    // descompasso passar de um limite seguro (10 dias) - depois disso a distorcao pesa demais pra
    // continuar mostrando como se fosse dado confiavel. Os campos "reais" (importado/exportado/saldo
    // liquido, mais a estimativa explicita acima) continuam normalmente, so esses 5 derivados travam.
    const LIMITE_DIAS_DESCOMPASSO_SEGURO = 10;
    const diasDescompassoAtual = (temGeracao && ultimaSolar.geracaoAcumuladaData)
      ? Math.round((new Date(ultimaSolar.geracaoAcumuladaData) - new Date(ultimaSolar.data)) / 86400000)
      : 0;
    const consumoDiretoConfiavel = temGeracao && diasDescompassoAtual < LIMITE_DIAS_DESCOMPASSO_SEGURO;

    let consumoDiretoAcum=null, consumoTotalCasa=null, autoconsumoPct=null, dependenciaPct=null, exportacaoDaGeracaoPct=null;
    if(consumoDiretoConfiavel){
      consumoDiretoAcum = Math.round((geracaoAcum - exportadoAcum)*100)/100;
      consumoTotalCasa = Math.round((consumoDiretoAcum + importadoAcum)*100)/100;
      autoconsumoPct = consumoTotalCasa>0 ? Math.round(consumoDiretoAcum/consumoTotalCasa*1000)/10 : 0;
      dependenciaPct = consumoTotalCasa>0 ? Math.round(importadoAcum/consumoTotalCasa*1000)/10 : 0;
      exportacaoDaGeracaoPct = geracaoAcum>0 ? Math.round(exportadoAcum/geracaoAcum*1000)/10 : 0;
    }
    const DESATUALIZADO = `Leitura do medidor desatualizada há ${diasDescompassoAtual} dias — manda uma foto nova pra recalcular.`;
    const consumoMsg = temGeracao ? (consumoDiretoConfiavel ? null : DESATUALIZADO) : INSUFICIENTE;
    setUG('ugGeracaoAcumulada', temGeracao ? geracaoAcum+' kWh' : INSUFICIENTE);
    setUG('ugConsumoDireto', consumoDiretoConfiavel ? consumoDiretoAcum+' kWh' : consumoMsg);
    setUG('ugConsumoTotalCasa', consumoDiretoConfiavel ? consumoTotalCasa+' kWh' : consumoMsg);
    setUG('ugAutoconsumoPct', consumoDiretoConfiavel ? autoconsumoPct+'%' : consumoMsg);
    setUG('ugDependenciaPct', consumoDiretoConfiavel ? dependenciaPct+'%' : consumoMsg);
    setUG('ugExportacaoPct', consumoDiretoConfiavel ? exportacaoDaGeracaoPct+'%' : consumoMsg);

    // NOVO 14/08/2026 (pedido do usuário: "informações relevantes" nos cards do diagrama "Fluxo de
    // energia" clicáveis, ver Sistema_Wallace_Lira_Completo.html/fluxoEnergiaToggle em
    // ui-navegacao-basica.js). Popula o painel de detalhe de cada etapa com os MESMOS valores já
    // calculados acima pros campos ugGeracaoAcumulada/ugConsumoDireto/etc — nenhum cálculo novo, só
    // reaproveitado no diagrama. Wrapper <div> interno é o que a transição de altura (CSS
    // .fluxo-energia-detalhe > div) anima — sem ele a transição em grid-template-rows não funciona.
    const setFluxo = (id, texto) => { const el = $(id); if(el) el.innerHTML = '<div>'+texto+'</div>'; };
    setFluxo('feGeracaoDetalhe', temGeracao
      ? 'Total gerado pelas placas desde a ativação (21/07): <strong>'+fmtKwhPtBr(geracaoAcum)+' kWh</strong>.'
      : INSUFICIENTE);
    setFluxo('feConsumoCasaDetalhe', consumoDiretoConfiavel
      ? 'Consumido na hora, direto das placas, pela Casa da Mãe (onde fica a usina): <strong>'+fmtKwhPtBr(consumoDiretoAcum)+' kWh</strong> (~'+autoconsumoPct+'% da geração total).'
      : consumoMsg);
    setFluxo('feExportacaoDetalhe', 'Enviado pra rede da Energisa (código 103), vira crédito: <strong>'+fmtKwhPtBr(exportadoAcum)+' kWh</strong>'+(consumoDiretoConfiavel ? ' (~'+exportacaoDaGeracaoPct+'% da geração total)' : '')+'.');
    setFluxo('feCreditosDetalhe', 'Saldo líquido acumulado (exportado − importado à noite): <strong>'+(saldoLiquidoAcum>=0?'+':'')+fmtKwhPtBr(saldoLiquidoAcum)+' kWh</strong>. É esse valor que é dividido entre Wallace e Wellida pelo rateio.');
    // CORRIGIDO 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #1): "71%"/"29%" escritos crus
    // em 4 pontos do HTML (cards do Fluxo de Energia, título da seção 05, detalhe de cada card) —
    // cópias soltas de VARS.solarRateioWallace/solarRateioIrma, que já é a fonte real usada em todo
    // cálculo de crédito (esta mesma função, linhas acima). solar-compartilhado.html já lê o rateio
    // vivo da RPC — esse era o painel principal que ainda tinha o número congelado.
    const rateioWallacePctTxt = fmtKwhPtBr(Math.round(VARS.solarRateioWallace*1000)/10)+'%';
    const rateioIrmaPctTxt = fmtKwhPtBr(Math.round(VARS.solarRateioIrma*1000)/10)+'%';
    [['feRateioWallacePct',rateioWallacePctTxt],['feRateioWellidaPct',rateioIrmaPctTxt],
     ['solarRateioTituloWallacePct',rateioWallacePctTxt],['solarRateioTituloIrmaPct',rateioIrmaPctTxt]]
      .forEach(([id,txt]) => { const el=$(id); if(el) el.textContent = txt; });
    setFluxo('feWallaceDetalhe', 'Fatia do Wallace ('+rateioWallacePctTxt+' do saldo líquido acumulado): <strong>'+(saldoLiquidoAcum>=0?'+':'')+fmtKwhPtBr(Math.round(saldoLiquidoAcum*VARS.solarRateioWallace*100)/100)+' kWh</strong>.');
    setFluxo('feWellidaDetalhe', 'Fatia da Wellida ('+rateioIrmaPctTxt+' do saldo líquido acumulado): <strong>'+(saldoLiquidoAcum>=0?'+':'')+fmtKwhPtBr(Math.round(saldoLiquidoAcum*VARS.solarRateioIrma*100)/100)+' kWh</strong>.');
    setFluxo('feImportacaoDetalhe', 'Puxado da rede à noite (código 03, quando as placas não geram): <strong>'+fmtKwhPtBr(importadoAcum)+' kWh</strong> desde a ativação.');

    // Status: so usa dado 100% real (saldo liquido = 103-03), nao depende da geracao do inversor
    let statusUG = {emoji:'🔴', texto:'Déficit', cor:'var(--red)'};
    if(saldoLiquidoAcum > 0) statusUG = {emoji:'🟢', texto:'Excedente (exportando mais do que importa)', cor:'var(--green)'};
    else if(saldoLiquidoAcum === 0) statusUG = {emoji:'🟡', texto:'Equilibrado', cor:'var(--amber)'};
    const ugStatusEl = $('ugStatus');
    if(ugStatusEl){ ugStatusEl.textContent = statusUG.emoji+' '+statusUG.texto; ugStatusEl.style.color = statusUG.cor; }

    // NOVO 08/08/2026 (pedido explícito do usuário): contextualizar o primeiro ciclo de geração como
    // um ciclo de TRANSIÇÃO, nunca como "inválido"/"não deve ser usado" — a usina entrou em operação
    // (data_inicio, 21/07) DEPOIS do início do ciclo de faturamento da Energisa pra essa unidade
    // (data_inicio_faturamento_energisa, 07/07), então parte do consumo do ciclo aconteceu antes de
    // existir geração pra compensar. O crédito oficial (361−60=301 kWh) não muda — isso é só
    // contexto/interpretação, nunca recálculo. Regra automática: qualquer ciclo futuro em que a
    // geração comece depois do início do próprio ciclo de faturamento recebe o mesmo aviso sozinho,
    // sem precisar editar código de novo (basta a coluna vir preenchida pela Energisa/leitura real).
    const elCicloParcial = $('ugCicloParcial');
    if(elCicloParcial){
      const inicioFaturamento = cicloSolarAberto && cicloSolarAberto.data_inicio_faturamento_energisa;
      const inicioGeracao = cicloSolarAberto && cicloSolarAberto.data_inicio;
      const cicloParcial = !!(inicioFaturamento && inicioGeracao && new Date(inicioGeracao) > new Date(inicioFaturamento));
      if(cicloParcial){
        const fmtDataBR = d => new Date(d).toLocaleDateString('pt-BR', {timeZone:'UTC'});
        elCicloParcial.style.display = 'block';
        elCicloParcial.innerHTML =
          '<div style="font-weight:600;color:var(--amber)">⚠ Primeiro ciclo parcial de geração</div>'
          + '<div style="margin-top:0.5rem">A usina entrou em operação em <strong>'+fmtDataBR(inicioGeracao)+'</strong>, mas o ciclo da distribuidora já havia iniciado em <strong>'+fmtDataBR(inicioFaturamento)+'</strong>. Por isso, parte do consumo deste ciclo ocorreu antes do início da geração solar.</div>'
          + '<div style="margin-top:0.5rem">O resultado oficial do ciclo continua sendo:</div>'
          + '<div style="margin-top:0.2rem">— Exportação: <strong>'+exportadoAcum+' kWh</strong><br>— Importação: <strong>'+importadoAcum+' kWh</strong><br>— Crédito líquido: <strong style="color:var(--green)">'+saldoLiquidoAcum+' kWh</strong></div>'
          + '<div style="margin-top:0.5rem">Entretanto, este ciclo representa uma fase de transição e tende a subestimar o desempenho normal da usina, pois a geração não esteve disponível durante todo o período de faturamento. A partir do primeiro ciclo completo de operação, as comparações de desempenho se tornam mais representativas.</div>';
      } else {
        elCicloParcial.style.display = 'none';
      }
    }

    const ugResumoEl = $('ugResumo');
    if(ugResumoEl){
      if(consumoDiretoConfiavel){
        ugResumoEl.innerHTML = 'A casa consumiu <strong>'+consumoTotalCasa+' kWh</strong> neste período (desde 21/07, '+ultimaSolar.dias+' dias). <strong style="color:var(--green)">'+consumoDiretoAcum+' kWh ('+autoconsumoPct+'%)</strong> foram atendidos diretamente pelas placas. <strong style="color:var(--amber)">'+importadoAcum+' kWh ('+dependenciaPct+'%)</strong> vieram da Energisa. A usina exportou <strong>'+exportadoAcum+' kWh</strong> ('+exportacaoDaGeracaoPct+'% de tudo que gerou). Saldo líquido produzido: <strong style="color:'+(saldoLiquidoAcum>=0?'var(--green)':'var(--red)')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong> — é esse saldo que alimenta o rateio da seção 03, abaixo.';
      } else if(temGeracao){
        // CORRIGIDO 02/08/2026 (achado do usuário): antes disso, se temGeracao=true o resumo sempre
        // calculava consumoDireto/autoconsumo misturando geracao viva com exportado congelado, sem
        // limite - agora que existe o travamento por dias de descompasso, esse ramo intermediario
        // cobre "tem geracao mas o descompasso ja passou do limite seguro" - mostra so o que e 100%
        // real (importado/exportado/saldo liquido), sem fingir precisao no consumo direto.
        ugResumoEl.innerHTML = '<strong style="color:var(--amber)">Consumo direto/autoconsumo pausado</strong> — a leitura do medidor está desatualizada há <strong>'+diasDescompassoAtual+' dias</strong> (mais que o limite seguro de '+LIMITE_DIAS_DESCOMPASSO_SEGURO+'), então parei de calcular esses campos pra não mostrar número cada vez mais errado. Importado (<strong>'+importadoAcum+' kWh</strong>), exportado (<strong>'+exportadoAcum+' kWh</strong>) e saldo líquido (<strong style="color:'+(saldoLiquidoAcum>=0?'var(--green)':'var(--red)')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong>) continuam corretos (vêm do medidor bidirecional) — isso já alimenta o rateio da seção 03 normalmente. Manda uma leitura nova do 03/103 pra recalibrar tudo.';
      } else {
        ugResumoEl.innerHTML = '<strong style="color:var(--amber)">Dados insuficientes para calcular consumo direto/autoconsumo/dependência</strong> — falta a leitura real de geração acumulada do inversor SAJ. Importado (<strong>'+importadoAcum+' kWh</strong>), exportado (<strong>'+exportadoAcum+' kWh</strong>) e saldo líquido (<strong style="color:'+(saldoLiquidoAcum>=0?'var(--green)':'var(--red)')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong>) continuam corretos (vêm do medidor bidirecional) — isso já alimenta o rateio da seção 03 normalmente.';
      }
    }

    // NOVO 14/08/2026 (pedido do usuário: "sempre que fechar o ciclo já deixe o do próximo ciclo ir
    // aparecendo e somando o próximo" — até agora, assim que um ciclo fechava, o mês do ciclo NOVO
    // (ainda em formação) ficava com as 4 barras vazias até ELE TAMBÉM fechar; só o gráfico "Rateio
    // Solar" (seção 05) já mostrava o ciclo aberto crescendo ao vivo). Popula o mês do ciclo aberto
    // (idxCicloAberto, mesmo índice que o gráfico Rateio Solar já usa) com os valores REAIS desde a
    // abertura DESTE ciclo — nunca desde a ativação: leitura_03_inicio/leitura_103_inicio/baseline_kwh
    // vêm de vw_ciclo_solar_aberto (os códigos exatos do medidor no momento em que este ciclo abriu),
    // mesma fonte já usada pra "creditoCicloAtual" (ugSaldoLiquido) mais acima. Consumo direto usa a
    // geração real do robô SAJ (VARS.SOLAR_GERACAO_DIARIA) somada só dos dias deste ciclo — mesma
    // fonte já usada em diasComDadoRealSolar/diasProjetadosSolar, sem estimativa nova.
    if(idxCicloAberto != null && cicloSolarAberto && temGeracao){
      const importadoDesdeAbertura = Math.round((importadoAcum - Number(cicloSolarAberto.leitura_03_inicio))*100)/100;
      const exportadoDesdeAbertura = Math.round((exportadoAcum - Number(cicloSolarAberto.leitura_103_inicio))*100)/100;
      const saldoLiquidoDesdeAbertura = Math.round((saldoLiquidoAcum - Number(cicloSolarAberto.baseline_kwh))*100)/100;
      const geracaoDesdeAbertura = (VARS.SOLAR_GERACAO_DIARIA||[])
        .filter(r => r.data >= cicloSolarAberto.data_inicio)
        .reduce((s,r) => s + (typeof r.kwh === 'number' ? r.kwh : 0), 0);
      const consumoDiretoDesdeAbertura = Math.round((geracaoDesdeAbertura - exportadoDesdeAbertura)*100)/100;
      importadoMensal[idxCicloAberto] = importadoDesdeAbertura;
      exportadoMensal[idxCicloAberto] = exportadoDesdeAbertura;
      saldoLiquidoMensal[idxCicloAberto] = saldoLiquidoDesdeAbertura;
      // consumo direto negativo é fisicamente impossível (mesma checagem já feita no loop histórico
      // acima) — só acontece se a geração do robô ainda não tiver dado nenhum dia deste ciclo ainda
      // (geracaoDesdeAbertura=0 no 1º dia); nesse caso deixa null (sem barra) em vez de mostrar negativo.
      consumoDiretoMensal[idxCicloAberto] = consumoDiretoDesdeAbertura >= 0 ? consumoDiretoDesdeAbertura : null;
    }

    // Historico mes a mes (03, 103, consumo direto real, saldo liquido) - so plota consumo direto
    // quando existir geracaoAcumulada real naquele mes (senao fica null, sem barra - mesmo padrao
    // ja usado pros meses sem leitura de credito).
    // NOVO 11/08/2026 (pedido do usuário: "coloque os valores sobre as barras como todo gráfico do
    // site") - mesmo padrão já usado em energiaBarLabelPlugin/caixasValuePlugin (afterDatasetsDraw,
    // uma cor por dataset, texto acima de cada barra do grupo).
    const unidadeGeradoraBarLabelPlugin = {
      id:'unidadeGeradoraBarLabelPlugin',
      afterDatasetsDraw(chart){
        const {ctx} = chart;
        ctx.save();
        ctx.textAlign = 'center';
        // CORRIGIDO 21/08/2026 (pedido do usuário: "retire os arredondamentos... quero ver número
        // quebrado" — mesmo ajuste do solarBarLabelPlugin acima). 2ª rodada do mesmo dia: fonte volta
        // pro tamanho original (7.5px) — o espaço extra pro dígito decimal vem do categoryPercentage
        // do eixo X (0.9→0.97), não de encolher a fonte.
        ctx.font = "600 7.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
        chart.data.datasets.forEach((ds,di)=>{
          const meta = chart.getDatasetMeta(di);
          meta.data.forEach((bar,i)=>{
            const v = ds.data[i];
            if(v===null || v===undefined) return;
            // CORRIGIDO 11/08/2026 (pedido do usuário: "os números sobre os gráficos devem ficar só
            // os números... igual os outros gráficos" - com "kWh" no texto e 4 barras finas lado a
            // lado, os rótulos de barras vizinhas coladas/iguais (ex: 69/69) se sobrepunham e
            // ficavam ilegíveis. Mesmo padrão sem unidade já usado em energiaBarLabelPlugin.
            // CORRIGIDO 14/08/2026 (mesmo bug já documentado em solarBarLabelPlugin, 11/08/2026):
            // backgroundColor virou uma FUNÇÃO (corBarraUG(), pinta a barra do ciclo aberto mais
            // clara) — ctx.fillStyle=ds.backgroundColor atribuía a função inteira em vez de uma cor,
            // canvas ignora silenciosamente um fillStyle inválido. Resolve a cor por barra.
            ctx.fillStyle = typeof ds.backgroundColor === 'function' ? ds.backgroundColor({dataIndex:i, chart}) : ds.backgroundColor;
            ctx.fillText(v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}), bar.x, bar.y - 4);
          });
        });
        ctx.restore();
      }
    };
    // Mesmo truque de opacidade do gráfico "Rateio Solar" (corBarraCredito, definido mais abaixo
    // neste arquivo — não dá pra reusar direto aqui, TDZ, ainda não foi declarado neste ponto do
    // código) pra distinguir visualmente a barra do ciclo AINDA ABERTO (mais transparente) das
    // fechadas — reforça o mesmo indicador "▼ ciclo atual" que o outro gráfico já tem.
    const idxCicloAbertoAlinhadoUG = idxCicloAberto != null ? idxCicloAberto - OFFSET_SOLAR : null;
    const corBarraUG = (corFechado) => (ctx) => ctx.dataIndex === idxCicloAbertoAlinhadoUG ? corFechado + '66' : corFechado;
    observeAndRenderChart($('cUnidadeGeradora'), () => { const __chartExistente = Chart.getChart($('cUnidadeGeradora')); if (__chartExistente) __chartExistente.destroy(); return new Chart($('cUnidadeGeradora'), {
      type:'bar',
      plugins:[unidadeGeradoraBarLabelPlugin],
      data:{labels:mesesParesSolar,
        datasets:[
          {label:'Importado (código 03)', data:alignSolar(importadoMensal), backgroundColor:corBarraUG('#e2554f'), borderRadius:3},
          {label:'Consumo direto (calculado)', data:alignSolar(consumoDiretoMensal), backgroundColor:corBarraUG('#e8a63a'), borderRadius:3},
          {label:'Exportado (código 103)', data:alignSolar(exportadoMensal), backgroundColor:corBarraUG('#3987e5'), borderRadius:3},
          {label:'Saldo líquido', data:alignSolar(saldoLiquidoMensal), backgroundColor:corBarraUG('#34c98a'), borderRadius:3}
        ]},
      options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22}},
        plugins:{legend:legendStd2,tooltip:{callbacks:{
          label:c=>{
            if(c.raw===null) return c.dataset.label+': sem dado ainda';
            return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh';
          }
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.97,barPercentage:0.35},
          y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
    }); });
    // NOVO 03/08/2026: aviso automatico dos meses com "Consumo direto" CONGELADO (dessincronia entre
    // a automacao SAJ e a leitura manual do 103 - ver logica acima). Usa os MESMOS rotulos ja
    // deslocados (mesesParesSolar) pra apontar o mes certo, mesmo apos o grafico "andar pra frente".
    const legCongeladoEl = $('legConsumoDiretoCongelado');
    if(legCongeladoEl){
      const congeladoAlinhado = alignSolar(consumoDiretoCongeladoMes);
      const mesesCongelados = mesesParesSolar.filter((_,i)=>congeladoAlinhado[i]===true);
      legCongeladoEl.textContent = mesesCongelados.length
        ? '⚠️ Consumo direto CONGELADO no último valor confiável em: '+mesesCongelados.join(', ')+' — a automação SAJ e a leitura manual do código 103 ficaram dessincronizadas nesses meses; assim que uma leitura nova resolver isso, o valor volta a atualizar sozinho.'
        : '';
    }

    // NOVO 05/08/2026 (pedido do usuario: grafico de geracao media por dia, logo abaixo do grafico
    // 10/Unidade Geradora). So usa intervalos onde AS DUAS leituras (anterior e atual) tem
    // geracaoAcumulada real - sem isso, nao da pra calcular um delta confiavel. Media = delta de
    // geracaoAcumulada no intervalo / dias do intervalo (SOLAR_LEITURAS[i].dias) - nao e leitura
    // diaria de verdade, e a media do periodo, deixado claro na legenda do card tambem.
    const leiturasSolar = VARS.SOLAR_LEITURAS;
    const mediasPorData = {}; // 'YYYY-MM-DD' -> media kWh/dia do intervalo que terminou nessa data
    for(let i=1;i<leiturasSolar.length;i++){
      const anterior = leiturasSolar[i-1];
      const atual = leiturasSolar[i];
      if(atual.geracaoAcumulada==null || anterior.geracaoAcumulada==null) continue;
      const diasIntervalo = (atual.dias||0) - (anterior.dias||0); // CORRIGIDO: "dias" e acumulado desde a ativacao, nao o intervalo - precisa da diferenca entre as duas leituras
      if(diasIntervalo<=0) continue;
      const deltaGeracao = Math.round((atual.geracaoAcumulada - anterior.geracaoAcumulada)*100)/100;
      mediasPorData[atual.data] = Math.round((deltaGeracao / diasIntervalo)*100)/100;
    }
    // NOVO 05/08/2026 (pedido do usuario: "não vai conseguir me dar dados de vários dias?"): junta as
    // datas das medias por intervalo (grosso, historico) com as datas do SOLAR_GERACAO_DIARIA (fino,
    // dado real do robo SAJ, a partir de agora) - um EIXO DE DATAS SO, ordenado, cada serie preenche
    // null onde nao tem dado daquele tipo naquela data (Chart.js pula null sem quebrar a barra do lado).
    const diariosPorData = {};
    (VARS.SOLAR_GERACAO_DIARIA||[]).forEach(r=>{ diariosPorData[r.data] = r.kwh; });
    const todasDatas = Array.from(new Set([...Object.keys(mediasPorData), ...Object.keys(diariosPorData)])).sort();
    const labelsPorDia = todasDatas.map(d=>{ const [,mes,dia] = d.split('-'); return dia+'/'+mes; });
    const valoresPorDia = todasDatas.map(d=> mediasPorData[d] ?? null);
    const valoresDiarioReal = todasDatas.map(d=> diariosPorData[d] ?? null);
    // CORRIGIDO 05/08/2026 (parte 96, pedido do usuario): "essa barra de media por intervalo historico
    // nao faz sentido, remova... o que voce podia por e seria interessante seria a media de consumo das
    // 3 casas somadas, ai da pra ver se o gerado e suficiente". Barra laranja removida. Linha vermelha
    // tracejada nova = consumo medio diario somado das casas com dado confiavel, pra comparar contra a
    // geracao real do dia (barra verde). AINDA FALTA 1 DAS 3 CASAS: Wallace (9,70 kWh/dia, fonte antiga
    // sem documentacao) + mae/Wellida (7,38 kWh/dia, fatura Energisa real confirmada nesta sessao,
    // media dos 7 meses com leitura de verdade) = 17,08 kWh/dia. A soma fica INCOMPLETA ate a 3a casa
    // ser identificada e ter dado real (nao inventado) - ver legenda abaixo do grafico.
    // CORRIGIDO 05/08/2026 (parte 97): agora soma as 3 casas de verdade - Wallace (apartamento),
    // Irma (casa da irma, ainda com valor antigo sem fatura conferida) e Mae (casa geradora, fatura
    // real confirmada nesta sessao). Nao existe "3a casa desconhecida" - eram sempre essas 3, so a
    // atribuicao da fatura da mae tinha ido pra variavel errada (Irma) na rodada anterior.
    // NOVO 22/08/2026 (pedido do usuário: "pode usar o meu do medidor Tuya e somar com a estimativa
    // da minha mãe e irmã, aí quando os medidores delas forem entrando no sistema você para de usar
    // [a estimativa]"): Wallace já tem medidor Tuya real (window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2,
    // agregado por dia via trigger no Postgres) — usa a média dos últimos dias com leitura real em vez
    // do literal fixo de vars-energia-solar.js (10,00 kWh/dia, de 1 fatura antiga, nunca atualiza
    // sozinho). Mãe/Wellida continuam no literal/energia_solar_consumo_referencia (fatura real, mas
    // estático) até cada uma ganhar seu próprio medidor Tuya — na hora que a var
    // WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_WELLIDA_V2 tiver dado de verdade, o mesmo padrão se aplica
    // automaticamente aqui (é só reaproveitar a mesma função abaixo pra ela também).
    await Promise.all([window.__promiseMedidorTuyaConsumoDiarioV2, window.__promiseMedidorTuyaConsumoDiarioWellidaV2].filter(Boolean)).catch(()=>{});
    function mediaConsumoDiarioTuyaRecente(diario, fallback){
      const validos = (diario||[]).filter(r => r.kwh_consumido != null).slice(-14); // últimos até 14 dias com leitura
      if(!validos.length) return fallback;
      return Math.round((validos.reduce((s,r)=>s+Number(r.kwh_consumido),0)/validos.length)*100)/100;
    }
    const wallaceConsumoDiarioReal = mediaConsumoDiarioTuyaRecente(window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2, VARS.solarConsumoDiarioWallace);
    const consumoMedioDiarioCasas = Math.round((wallaceConsumoDiarioReal + VARS.solarConsumoDiarioIrma + VARS.solarConsumoDiarioMae) * 100) / 100;
    const linhaConsumoMedio = todasDatas.map(()=> consumoMedioDiarioCasas);
    // CORRIGIDO 07/08/2026 (pedido do usuário: "mude essa linha de indicação, ela tem que começar no
    // início do gráfico e ir até o final e eu acho ela feia, melhore a aparência"): como dataset `line`
    // num eixo de categoria (barras), o Chart.js desenha a linha ligando os PONTOS de cada categoria -
    // ela começa/termina no CENTRO da primeira/última barra, não na borda do gráfico (por isso parecia
    // cortada nas duas pontas). Trocado: o dataset continua existindo (mantém tooltip/legenda), mas com
    // `borderWidth:0` (não desenha a linha nativa) - quem desenha agora é o plugin abaixo, direto na
    // `chartArea` inteira (borda a borda), com traço mais fino/arredondado.
    const linhaConsumoMedioPlugin = {
      id:'linhaConsumoMedioPlugin',
      afterDatasetsDraw(chart){
        const di = chart.data.datasets.findIndex(d=>d.__linhaConsumoMedio);
        if(di===-1 || !chart.isDatasetVisible(di)) return;
        const valor = chart.data.datasets[di].data.find(v=>v!=null);
        if(valor==null) return;
        const {ctx, chartArea, scales} = chart;
        const y = scales.y.getPixelForValue(valor);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5,4]);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,107,107,0.8)';
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.restore();
      }
    };
    // NOVO 19/08/2026 (pedido do usuário: "coloque os valores sobre as barras") — label numérico em
    // cima de cada barra verde (geração real do dia), mesmo padrão do solarBarLabelPlugin (chart 05).
    // Só rotula dataset tipo 'bar' (pula a linha tracejada de consumo médio, que não tem barra).
    const valorSobreBarraGeracaoPlugin = {
      id:'valorSobreBarraGeracaoPlugin',
      afterDatasetsDraw(chart){
        const {ctx} = chart;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = "600 9px -apple-system, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = '#34c98a';
        chart.data.datasets.forEach((ds,di)=>{
          if(ds.type==='line') return;
          const meta = chart.getDatasetMeta(di);
          meta.data.forEach((bar,i)=>{
            const v = ds.data[i];
            if(v===null || v===undefined) return;
            ctx.fillText(v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}), bar.x, bar.y - 5);
          });
        });
        ctx.restore();
      }
    };
    observeAndRenderChart($('cGeracaoPorDia'), () => { const __chartExistente = Chart.getChart($('cGeracaoPorDia')); if (__chartExistente) __chartExistente.destroy(); return new Chart($('cGeracaoPorDia'), {
      type:'bar',
      plugins:[linhaConsumoMedioPlugin, valorSobreBarraGeracaoPlugin],
      data:{labels:labelsPorDia, datasets:[
        {label:'Geração real do dia (robô SAJ)', data:valoresDiarioReal, backgroundColor:'#34c98a', borderRadius:4, order:1},
        // CORRIGIDO 16/08/2026 (achado do usuário: "faltou a marcação na frente de consumo pra saber
        // quem ele é no gráfico, que é o tracejado") — a linha tracejada de verdade é desenhada por
        // cima via linhaConsumoMedioPlugin (canvas custom, ver abaixo), não pelo Chart.js — por isso
        // este dataset ficava com borderWidth:0 (invisível) e SEM backgroundColor, e a legenda
        // automática do Chart.js (que lê backgroundColor pro quadradinho) não tinha cor nenhuma pra
        // mostrar. Adicionado backgroundColor igual à cor real do tracejado, só pra legenda — o
        // desenho do gráfico em si continua 100% a cargo do plugin, sem mudança de comportamento.
        {label:'Consumo médio diário (3 casas: Wallace + irmã + mãe/geradora)', data:linhaConsumoMedio, type:'line', __linhaConsumoMedio:true, borderColor:'#ff6b6b', backgroundColor:'rgba(255,107,107,0.8)', borderWidth:0, pointRadius:0, fill:false, order:0}
      ]},
      options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:16}},
        plugins:{legend:legendStd2,tooltip:{callbacks:{
          label:c=>c.raw==null ? c.dataset.label+': sem dado' : c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kWh'
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9.5}}},
          y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
    }); });
    const legGeracaoPorDiaEl = $('legGeracaoPorDia');
    if(legGeracaoPorDiaEl){
      const valoresReais = Object.values(diariosPorData);
      const qtdReal = valoresReais.length;
      // NOVO 17/08/2026 (pedido do usuário: "coloque nessa legenda o valor médio da geração, em cor
      // vermelha"): média dos dias com geração REAL (mesmo conjunto que soma qtdReal, nunca inclui
      // hoje se ainda não fechou - diariosPorData vem de VARS.SOLAR_GERACAO_DIARIA). Usa innerHTML só
      // pra colorir esse número (antes era texto puro via textContent) - resto da frase idêntico.
      const mediaGeracaoReal = qtdReal ? Math.round((valoresReais.reduce((s,v)=>s+v,0)/qtdReal)*100)/100 : null;
      // NOVO 19/08/2026 (pedido do usuário: cor da média de geração real deixa de ser sempre vermelha
      // e passa a comparar contra o consumo médio das 3 casas — mesmo padrão de "margem de 2kWh" já
      // usado noutros indicadores solares do painel): geração > consumo+2kWh = verde (gera com folga);
      // geração entre consumo e consumo+2kWh = âmbar (cobre, mas margem apertada); geração <= consumo
      // = vermelho (não cobre o consumo médio das 3 casas). O número do consumo (2ª referência da
      // frase) continua vermelho, é só a referência, não muda.
      const corMediaGeracao = (mediaGeracaoReal == null) ? 'var(--red)'
        : mediaGeracaoReal > consumoMedioDiarioCasas + 2 ? 'var(--green)'
        : mediaGeracaoReal > consumoMedioDiarioCasas ? 'var(--amber)'
        : 'var(--red)';
      // CORRIGIDO 22/08/2026 (pedido do usuário: "esses dados devem vir dos medidores, como o meu já
      // tá funcionando, pode já colocar, aí quando os outros entrarem em operação você coloca") — o
      // texto tinha "Wallace 10,00" cravado, mesmo depois do wallaceConsumoDiarioReal (calculado acima
      // a partir do medidor Tuya real) já ter passado a valer no cálculo. Frase agora reflete a fonte
      // real de cada casa — Wallace por medidor Tuya (média móvel), irmã/mãe por fatura (ainda sem
      // medidor instalado).
      const fonteWallaceTxt = wallaceConsumoDiarioReal !== VARS.solarConsumoDiarioWallace ? 'medidor Tuya' : 'fatura';
      legGeracaoPorDiaEl.innerHTML = qtdReal
        ? qtdReal+' dia(s) com geração real do robô SAJ (barra verde), média de <strong style="color:'+corMediaGeracao+'">'+mediaGeracaoReal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kWh/dia</strong>. Linha vermelha tracejada = consumo médio diário somado das 3 casas (Wallace '+wallaceConsumoDiarioReal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' via '+fonteWallaceTxt+' + irmã '+VARS.solarConsumoDiarioIrma.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' via fatura + mãe/geradora '+VARS.solarConsumoDiarioMae.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' via fatura = <strong style="color:var(--red)">'+consumoMedioDiarioCasas.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kWh/dia</strong>).'
        : 'Ainda sem geração diária real do robô SAJ (barra verde aparece a partir da próxima execução, 09h/17h).';
    }
  }


  // Índice da barra do ciclo AINDA ABERTO já ajustado pro mesmo deslocamento (OFFSET_SOLAR) aplicado
  // aos dados/rótulos via alignSolar() — sem isso, a barra "diferente" apontaria pro mês errado assim
  // que a janela de 12 meses começar a rolar.
  const idxCicloAbertoAlinhado = idxCicloAberto != null ? idxCicloAberto - OFFSET_SOLAR : null;
  const solarBarLabelPlugin = {
    id:'solarBarLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      ctx.save();
      ctx.textAlign = 'center';
      // CORRIGIDO 21/08/2026 (pedido do usuário: "retire os arredondamentos dos gráficos, quero ver
      // número quebrado" — 11,6 aparecia arredondado pra 12). 2ª rodada do mesmo dia (achado do
      // usuário: "os valores... ficaram muito pequenos, é melhor aumentar a fonte e espaçar as
      // barras") — fonte volta pro tamanho original (6.5px) e o espaço entre barras foi aumentado
      // no categoryPercentage do eixo X (0.9→0.97) em vez de encolher a fonte pra caber o dígito
      // decimal extra.
      ctx.font = "600 6.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      chart.data.datasets.forEach((ds,di)=>{
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((bar,i)=>{
          const v = ds.data[i];
          if(v===null || v===undefined) return;
          // CORRIGIDO 11/08/2026 (achado do usuário, print real: número sumiu de cima da barra "Ago")
          // — ds.backgroundColor virou uma FUNÇÃO (corBarraCredito(), pinta a barra do ciclo aberto
          // mais clara) desde a correção de mais cedo hoje, mas ctx.fillStyle=ds.backgroundColor
          // atribuía a função inteira em vez de uma cor — canvas ignora silenciosamente um fillStyle
          // inválido. Resolve a cor por barra (chamando a função quando for função, igual o Chart.js
          // já faz internamente pra pintar a própria barra), nunca mais preso a string fixa.
          ctx.fillStyle = typeof ds.backgroundColor === 'function' ? ds.backgroundColor({dataIndex:i, chart}) : ds.backgroundColor;
          ctx.fillText(v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}), bar.x, bar.y - 4);
        });
      });
      // NOVO 14/08/2026 (pedido do usuário: "quero que coloque sobre o ciclo atual um marcador, tem
      // que mudar automaticamente" — a única indicação do ciclo aberto até agora era a barra ~40%
      // mais transparente, achado do usuário como pouco visível). Marcador de texto acima da coluna
      // inteira do mês, usando o MESMO idxCicloAbertoAlinhado que já pinta a barra translúcida — ele
      // vem de cicloSolarAberto (dado real do banco), não de um índice fixo, então já é automático:
      // quando o ciclo fecha e um novo abre, idxCicloAberto muda sozinho no próximo carregamento e o
      // marcador acompanha, sem precisar editar nada aqui.
      if(idxCicloAbertoAlinhado != null && idxCicloAbertoAlinhado >= 0 && chart.scales && chart.scales.x){
        const xPos = chart.scales.x.getPixelForValue(idxCicloAbertoAlinhado);
        if(typeof xPos === 'number' && !isNaN(xPos)){
          ctx.font = "700 8px -apple-system, 'Segoe UI', Roboto, sans-serif";
          ctx.fillStyle = '#34c98a';
          ctx.fillText('▼ ciclo atual', xPos, chart.chartArea.top - 8);
        }
      }
      ctx.restore();
    }
  };
  const corBarraCredito = (corFechado) => (ctx) => ctx.dataIndex === idxCicloAbertoAlinhado ? corFechado + '66' : corFechado; // '66' = ~40% opacidade em hex, só na barra do ciclo aberto
  // NOVO 18/08/2026 (pedido do usuário: fatura real de Ago/26 reconfirmou o consumo da Wellida em 111
  // kWh, bem acima dos 74 kWh que a rolagem de 12 meses tinha — usuário pediu pra cor da barra
  // distinguir "reconfirmado por fatura recente" de "ainda é só a estimativa histórica original").
  // Barra cheia = mês em VARS.CONSUMO_IRMA_MESES_RECONFIRMADOS; opacidade reduzida = resto (mesmo
  // truque de opacidade de corBarraCredito acima, reaproveitado aqui pro mesmo efeito visual).
  const corBarraConsumoEsperadoIrma = (corBase) => (ctx) => (VARS.CONSUMO_IRMA_MESES_RECONFIRMADOS||{})[mesesParesSolar[ctx.dataIndex]] ? corBase : corBase + '66';
  observeAndRenderChart($('cSolarRateio'), () => { const __chartExistente = Chart.getChart($('cSolarRateio')); if (__chartExistente) __chartExistente.destroy(); return new Chart($('cSolarRateio'), {
    type:'bar',
    plugins:[solarBarLabelPlugin],
    data:{labels:mesesParesSolar,
      datasets:[
        {label:'Crédito Wallace (gerado)', data:alignSolar(creditoMensalWallace), backgroundColor:corBarraCredito('#34c98a'), borderRadius:3},
        {label:'Consumo esperado Wallace', data:consumoMensalWallaceAlinhado, backgroundColor:'#f0c94a', borderRadius:3},
        // CORRIGIDO 11/08/2026 (pedido do usuário: "esse verde da minha irmã está muito claro, não
        // tá legal de ver" — era #1c7a54, verde escuro/musgo, baixo contraste contra o fundo escuro
        // do card): trocado por um teal mais saturado, bem distinto do verde do Wallace (#34c98a).
        {label:'Crédito Irmã (gerado)', data:alignSolar(creditoMensalIrma), backgroundColor:corBarraCredito('#14b8a6'), borderRadius:3},
        {label:'Consumo esperado Irmã', data:consumoMensalIrmaAlinhado, backgroundColor:corBarraConsumoEsperadoIrma('#a9861f'), borderRadius:3}
      ]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:30,bottom:8}},
      plugins:{legend:legendStd2,tooltip:{callbacks:{
        label:c=>{
          if(c.raw===null) return c.dataset.label+': sem leitura ainda';
          const emAberto = (c.datasetIndex===0 || c.datasetIndex===2) && c.dataIndex===idxCicloAbertoAlinhado;
          return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh'+(emAberto ? ' (ciclo ainda ABERTO, estimativa — não fechou)' : '')+(c.datasetIndex%2===1?' (estimado, consumo histórico)':'');
        }
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.9,barPercentage:0.35},
        y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
  }); });
  const legSolarEl = $('legSolarRateio');
  if(legSolarEl && ultimaSolar){
    const mesesComLeitura = temLeituraNoMes.filter(Boolean).length;
    // MELHORADO 05/08/2026 (pedido do usuario, "melhora isso porque é confuso"): antes o aviso era
    // generico ("pode incluir uma estimativa"). Agora diz exatamente quantos dias da barra do ciclo
    // atual vieram do robo SAJ (dado real, SOLAR_GERACAO_DIARIA) e quantos ainda sao media histórica
    // - explica de forma direta por que esta barra pode diferir da Secao 12/13 (que só usa a última
    // leitura manual confirmada, sem projetar nenhum dia à frente).
    const avisoEstimativa = diasProjetadosSolar > 0
      ? ' A barra do ciclo atual soma a última leitura manual confirmada + '
        + (diasComDadoRealSolar>0 ? diasComDadoRealSolar+' dia(s) com geração REAL do robô SAJ' : '')
        + (diasComDadoRealSolar>0 && diasProjetadosSolar>0 ? ' + ' : '')
        + (diasProjetadosSolar>0 ? diasProjetadosSolar+' dia(s) por média histórica (robô ainda sem dado nesses dias)' : '')
        + ' — por isso pode diferir um pouco da Seção 04 (Previsão), que mostra só a última leitura manual, sem projetar nenhum dia à frente.'
      : '';
    // NOVO 11/08/2026 (pedido do usuário, "quero que o valor que está sendo gerado vai somando aqui"):
    // aviso explícito sobre a barra do ciclo aberto (mais clara/transparente no gráfico acima) pra não
    // confundir "em andamento, ainda pode mudar" com um ciclo já fechado/congelado.
    const avisoCicloAberto = idxCicloAbertoAlinhado != null
      ? ' A barra mais CLARA/transparente é o ciclo AINDA ABERTO (estimativa ao vivo, cresce todo dia até fechar de verdade) — as barras sólidas são ciclos já fechados e congelados.'
      : '';
    legSolarEl.innerHTML = 'Última leitura ('+ultimaSolar.data.split('-').reverse().join('/')+', '+(ultimaSolar.fonte==='real'?'real':'estimado')+', '+ultimaSolar.dias+' dias desde 21/07): crédito líquido acumulado até agora <strong>'+fmtKwhPtBr(ultimaSolar.creditoLiquido)+' kWh</strong> (Wallace '+fmtKwhPtBr(ultimaSolar.creditoWallace)+' kWh · Irmã '+fmtKwhPtBr(ultimaSolar.creditoIrma)+' kWh). Isso ainda não é a meta do mês fechada — pra saber se está no ritmo certo pra bater a meta mensal, veja a seção 04 (Previsão) logo abaixo. Consumo mostrado nas barras é o histórico REAL dos últimos 12 meses de cada apartamento (fatura Energisa de cada um, Wallace e Wellida). '+mesesComLeitura+' de 12 meses já têm leitura de crédito; os demais ficam sem barra verde até a leitura chegar.'+avisoEstimativa+avisoCicloAberto;
  }

  // NOVO 19/08/2026 (pedido do usuário, 3ª rodada de refinamento na mesma sessão: 1º pediu pra trocar
  // as barras "Consumo esperado" do gráfico 05 — errado, aquilo é a fatura Energisa; 2º corrigiu "quero
  // um gráfico novo... crédito gerado pelo consumo dos medidores", "são dois gráficos novos, um pra
  // mim e um pra minha irmã"; 3º confirmou "comparar o crédito com a leitura dos medidores"). 2 gráficos
  // NOVOS, mesmo estilo visual do 05 (barras por mês), 1 por pessoa — Crédito gerado (mesma série do
  // gráfico 05) × Consumo real medido pelo medidor Tuya (não a fatura Energisa, que já é o gráfico 05
  // e os cards "Consumo real × crédito" acima). Meses sem leitura Tuya ainda (medidor é recente,
  // instalado 17-18/08/2026) ficam sem barra, mesmo padrão de "sem dado ainda" já usado no gráfico 05.
  function agregarConsumoTuyaPorMesCalendario(diario){
    const nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const porMes = {};
    (diario||[]).forEach(r => {
      if(r.kwh_consumido == null) return;
      // CORRIGIDO 19/08/2026 (achado do usuário, print real: consumo de 17-19/08 aparecia na barra
      // "Ago", mas o crédito daquele mesmo período está na barra "Set" — porque o crédito é indexado
      // pelo mês em que o CICLO FECHA (corte dia 8, mesFechamentoCiclo já definida acima), não pelo
      // mês calendário da leitura. Consumo tinha ficado com lógica diferente (calendário puro),
      // dessincronizado do eixo do crédito. "Todo consumo de agora vai pro próximo ciclo" — mesma
      // regra, mesma função, agora os 2 eixos batem sempre.
      const nome = nomesMes[mesFechamentoCiclo(r.data)-1];
      porMes[nome] = (porMes[nome]||0) + Number(r.kwh_consumido);
    });
    Object.keys(porMes).forEach(k => { porMes[k] = Math.round(porMes[k]*100)/100; });
    return porMes;
  }
  const consumoTuyaWallacePorMes = agregarConsumoTuyaPorMesCalendario(window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2);
  const consumoTuyaWellidaPorMes = agregarConsumoTuyaPorMesCalendario(window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_WELLIDA_V2);
  const consumoTuyaWallaceAlinhado = mesesParesSolar.map(label => consumoTuyaWallacePorMes[label] != null ? consumoTuyaWallacePorMes[label] : null);
  const consumoTuyaWellidaAlinhado = mesesParesSolar.map(label => consumoTuyaWellidaPorMes[label] != null ? consumoTuyaWellidaPorMes[label] : null);

  function montarGraficoCreditoVsMedidor(canvasId, credito, consumoTuyaAlinhado, corCredito, nomePessoa){
    const el = $(canvasId);
    if(!el) return;
    observeAndRenderChart(el, () => { const __chartExistente = Chart.getChart(el); if (__chartExistente) __chartExistente.destroy(); return new Chart(el, {
      type:'bar',
      plugins:[solarBarLabelPlugin],
      data:{labels:mesesParesSolar,
        datasets:[
          {label:'Crédito gerado', data:alignSolar(credito), backgroundColor:corBarraCredito(corCredito), borderRadius:3},
          {label:'Consumo real (medidor Tuya)', data:consumoTuyaAlinhado, backgroundColor:'#e2554f', borderRadius:3}
        ]},
      options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:30,bottom:8}},
        plugins:{legend:legendStd2,tooltip:{callbacks:{
          label:c=>{
            if(c.raw===null) return c.dataset.label+': sem leitura ainda';
            return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh';
          }
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.97,barPercentage:0.35},
          y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
    }); });
  }
  montarGraficoCreditoVsMedidor('cCreditoVsMedidorWallace', creditoMensalWallace, consumoTuyaWallaceAlinhado, '#34c98a');
  montarGraficoCreditoVsMedidor('cCreditoVsMedidorWellida', creditoMensalIrma, consumoTuyaWellidaAlinhado, '#14b8a6');

  // NOVO 20/08/2026 (pedido do usuário: "quero um gráfico com o valor do crédito que me cabe no dia
  // em comparação com esse consumo do medidor... um para mim e um para minha irmã"): versão DIA A DIA
  // dos 2 gráficos acima (que são mês a mês/ciclo a ciclo). SIMPLIFICAÇÃO DELIBERADA, documentada:
  // "crédito do dia" aqui = geração BRUTA do dia (VARS.SOLAR_GERACAO_DIARIA, robô SAJ, automático)
  // × rateio (VARS.solarRateioWallace/Irma) — diferente do crédito "oficial" usado no resto do
  // sistema (gráfico Rateio Solar, cards "Consumo real × crédito"), que usa o SALDO LÍQUIDO real
  // (exportado−importado, códigos 03/103) sobre o crédito acumulado. Não dá pra replicar o método
  // oficial em granularidade diária porque as leituras 03/103 são manuais/esporádicas, não diárias
  // automáticas — só a geração bruta tem robô rodando todo dia. Ou seja: este gráfico tende a
  // SUPERESTIMAR levemente o crédito real (não desconta o autoconsumo direto da Casa da Mãe, que
  // acontece durante o dia antes de virar excedente exportado) — é uma referência diária aproximada,
  // não substitui o crédito oficial por ciclo mostrado nos gráficos/cards acima.
  function montarGraficoCreditoVsMedidorDiario(canvasId, rateio, consumoDiarioTuya, corCredito){
    const el = $(canvasId);
    if(!el) return;
    const JANELA_DIAS = 7;
    const geracaoPorData = {};
    (VARS.SOLAR_GERACAO_DIARIA||[]).forEach(r => { geracaoPorData[r.data] = r.kwh; });
    const consumoPorData = {};
    (consumoDiarioTuya||[]).forEach(r => { if(r.kwh_consumido != null) consumoPorData[r.data] = Number(r.kwh_consumido); });
    const datas = Array.from(new Set([...Object.keys(geracaoPorData), ...Object.keys(consumoPorData)])).sort().slice(-JANELA_DIAS);
    if(!datas.length) return;
    const labels = datas.map(d => d.slice(8,10)+'/'+d.slice(5,7));
    const creditoDiario = datas.map(d => geracaoPorData[d] != null ? Math.round(geracaoPorData[d]*rateio*100)/100 : null);
    const consumoAlinhado = datas.map(d => consumoPorData[d] != null ? consumoPorData[d] : null);
    observeAndRenderChart(el, () => { const __chartExistente = Chart.getChart(el); if (__chartExistente) __chartExistente.destroy(); return new Chart(el, {
      type:'bar',
      plugins:[solarBarLabelPlugin],
      data:{labels,
        datasets:[
          {label:'Crédito do dia (aprox.)', data:creditoDiario, backgroundColor:corCredito, borderRadius:3},
          {label:'Consumo real (medidor Tuya)', data:consumoAlinhado, backgroundColor:'#e2554f', borderRadius:3}
        ]},
      options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:30,bottom:8}},
        plugins:{legend:legendStd2,tooltip:{callbacks:{
          label:c=>{
            if(c.raw===null) return c.dataset.label+': sem leitura ainda';
            return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh';
          }
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.97,barPercentage:0.35},
          y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
    }); });
  }
  montarGraficoCreditoVsMedidorDiario('cCreditoVsMedidorDiarioWallace', VARS.solarRateioWallace, window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2, '#34c98a');
  montarGraficoCreditoVsMedidorDiario('cCreditoVsMedidorDiarioWellida', VARS.solarRateioIrma, window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_WELLIDA_V2, '#14b8a6');

  // NOVO 17/08/2026 (pedido do usuário: "crie um gráfico que mostre o comparativo entre o gerado e o
  // consumido", refinado 4x na mesma sessão: 1º "só meu apartamento... algo como o gráfico de
  // rateio", 2º "eu não pedi pra cruzar o consumo da fatura com o medidor, pedi pra cruzar o medidor
  // com os CRÉDITOS", 3º "o ciclo de agosto fechou dia 8, esqueceu? toda geração agora é pro próximo
  // ciclo" (eixo virou o ciclo real da GD, não mês calendário), 4º "muito feio esse gráfico, veja um
  // modelo mais adequado" — com só 1 categoria (o ciclo aberto) e 2 valores de escala muito diferente
  // (137kWh de crédito x ~1kWh de consumo real, medidor recém-instalado), um gráfico de barras
  // Chart.js sempre ia ficar feio. TROCADO por barra de progresso + grade de KPIs, mesmo padrão
  // visual de "Fluxo 1/Fluxo 2" (seção 03, renderFluxo1Fechado logo abaixo) — adequado pra "1 valor
  // contra o outro", diferente de gráfico de barras (que é pra série). Consumo real = soma de
  // window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2 desde cicloSolarAberto.data_inicio (mesma janela
  // real do Fluxo 2/seção 12 abaixo, não mês calendário) — os dois lados da comparação cobrem
  // EXATAMENTE a mesma janela de tempo.
  // GENERALIZADO 18/08/2026 (pedido do usuário: "crie esse mesmo campo para Wellida no site e no
  // compartilhado") — mesma lógica exata, parametrizada por prefixo de id/array de crédito/fonte de
  // consumo diário, pra nunca duplicar a fórmula (mesmo princípio já usado em
  // aplicarMedidorTuyaPorCasa, hydrate-medidor-tuya.js).
  function aplicarConsumoRealVsCreditoPorCasa(cfg){
    const diario = window[cfg.varConsumoDiario] || [];
    const elBar = $(cfg.idPrefix+'Bar');
    const set = (sufixo,v) => { const el = $(cfg.idPrefix+sufixo); if(el) el.textContent = v; };
    const elLeg = $(cfg.idLegenda);

    // NOVO 19/08/2026 (pedido do usuário): consumo real da fatura Energisa
    // (energia_solar_consumo_referencia, automatizado via scripts/sync/atualizar_boletos_medintech.py),
    // exibido abaixo do card — 2ª fonte de referência, independente do bloco Tuya acima (por isso fica
    // fora do if/else de cicloSolarAberto/diario.length: mostra sempre que tiver dado, mesmo sem
    // medidor Tuya instalado ainda). Mesma fonte que já alimenta VARS.solarConsumoDiarioWallace/Irma
    // (app.js) — aqui lê o array bruto pra ter também o valor mensal, não só o diário.
    if(cfg.casaEnergisa){
      const elEnergisa = $(cfg.idPrefix+'EnergisaValor');
      if(elEnergisa){
        const refs = window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2 || [];
        const ref = refs.find(r => r.casa === cfg.casaEnergisa);
        elEnergisa.textContent = (ref && ref.consumo_mensal_kwh != null)
          ? fmtKwhPtBr(Number(ref.consumo_mensal_kwh))+' kWh/mês ('+Number(ref.consumo_diario_kwh).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kWh/dia)'
          : 'Ainda sem fatura Energisa registrada.';
      }
    }
    if(elBar && cicloSolarAberto && idxCicloAberto != null && diario.length){
      const inicioCicloStr = cicloSolarAberto.data_inicio; // 'YYYY-MM-DD'
      const diasDoCicloComDado = diario.filter(r => r.data >= inicioCicloStr && r.kwh_consumido != null);
      const consumoCicloAtualKwh = Math.round(diasDoCicloComDado.reduce((s,r)=>s+Number(r.kwh_consumido),0)*100)/100;
      const creditoCicloAtual = cfg.creditoMensal[idxCicloAberto];
      const fmtDataBrCiclo = iso => iso ? iso.split('-').reverse().join('/') : '—';
      const labelCiclo = fmtDataBrCiclo(inicioCicloStr)+' → hoje';

      if(creditoCicloAtual != null && creditoCicloAtual > 0){
        const pctConsumido = Math.round((consumoCicloAtualKwh / creditoCicloAtual) * 100);
        const saldo = Math.round((creditoCicloAtual - consumoCicloAtualKwh) * 100) / 100;
        const estourou = saldo < 0;
        elBar.style.width = Math.min(100, Math.max(0, pctConsumido)) + '%';
        elBar.style.background = estourou ? 'var(--red)' : 'var(--accent)';
        set('Fracao', fmtKwhPtBr(consumoCicloAtualKwh)+' / '+fmtKwhPtBr(creditoCicloAtual)+' kWh consumidos');
        set('Pct', pctConsumido+'%');
        set('Periodo', labelCiclo);
        set('Credito', fmtKwhPtBr(creditoCicloAtual)+' kWh');
        const elSaldo = $(cfg.idPrefix+'Saldo');
        if(elSaldo){
          elSaldo.textContent = estourou ? '−'+fmtKwhPtBr(Math.abs(saldo))+' kWh (estourou)' : '+'+fmtKwhPtBr(saldo)+' kWh de sobra';
          elSaldo.style.color = estourou ? 'var(--red)' : 'var(--green)';
        }
        if(elLeg){
          elLeg.textContent = estourou
            ? 'Consumo real já passou o crédito formado neste ciclo em '+fmtKwhPtBr(Math.abs(saldo))+' kWh (os dois ainda em andamento, ciclo não fechou).'
            : 'Crédito cobre o consumo real medido até agora, com sobra de '+fmtKwhPtBr(saldo)+' kWh (os dois ainda em andamento, ciclo não fechou).';
        }
      } else {
        set('Periodo', labelCiclo);
        if(elLeg) elLeg.textContent = 'Ainda sem crédito formado neste ciclo pra comparar.';
      }
    } else {
      if(elLeg) elLeg.textContent = cfg.mensagemSemDado || 'Ainda sem dado suficiente pra comparar — precisa de pelo menos 1 dia de leitura do medidor dentro do ciclo aberto da GD.';
    }
  }

  // CORRIGIDO 21/08/2026 (achado do usuário: "às vezes estão sumindo os valores desses gráficos, mais
  // cedo sumiram dos valores em tempo real"): initSolarLazy() só roda 1x por carga de página
  // (_solarCarregado trava re-execução) — se a aba "Energia Solar" fosse aberta antes das buscas de
  // window.__promiseMedidorTuyaConsumoDiarioV2/_WellidaV2 (Sistema_Wallace_Lira_Completo.html)
  // terminarem, window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2 ainda estava null → caía no fallback
  // "sem dado" pro resto da sessão inteira, mesmo o dado chegando 1s depois (nunca re-renderiza).
  // Como esta função já é async, espera as 2 buscas (se existirem) antes de ler o resultado — corrige
  // a corrida sem precisar reestruturar o boot inteiro.
  await Promise.all([window.__promiseMedidorTuyaConsumoDiarioV2, window.__promiseMedidorTuyaConsumoDiarioWellidaV2].filter(Boolean)).catch(()=>{});

  aplicarConsumoRealVsCreditoPorCasa({
    idPrefix: 'consumoApartamento',
    idLegenda: 'legConsumoApartamento',
    varConsumoDiario: 'WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2',
    creditoMensal: creditoMensalWallace,
    casaEnergisa: 'wallace',
  });
  // NOVO 18/08/2026: card gêmeo da Wellida — "aguardando instalação" até o medidor dela existir.
  aplicarConsumoRealVsCreditoPorCasa({
    idPrefix: 'consumoWellida',
    idLegenda: 'legConsumoWellida',
    varConsumoDiario: 'WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_WELLIDA_V2',
    creditoMensal: creditoMensalIrma,
    mensagemSemDado: 'Aguardando instalação do medidor da Wellida — assim que ela instalar e o robô sincronizar, este card passa a comparar automaticamente, sem precisar de nenhuma mudança de código.',
    casaEnergisa: 'irma',
  });

  // ===== NOVO 01/08/2026: Previsão de Compensação de Créditos de Energia =====
  // Especificação fornecida pelo usuário (documento anexado, 01/08/2026). Reaproveita 100% os dados já
  // existentes (VARS.SOLAR_LEITURAS_CALC) - nao duplica nenhuma variavel, so consome e apresenta previsao.
  // Constantes faceis de ajustar se a janela/dia de leitura mudar (pedido explicito do usuario).
  // MIGRADO 18/08/2026 (varredura anti-hardcode): já tinha corrigido 1x (era 20, virou 21) — sinal de
  // que muda com o tempo. Agora lido de parametros_gerais (mesmo mecanismo genérico de
  // taxasHoraFolhaPontoWartsila), literal aqui é só fallback se a V2 falhar.
  const DIA_LEITURA_WALLACE = VARS.diaLeituraWallace ?? 21; // Leitura Energisa do apartamento, janela 19-21
  const DIA_LEITURA_WELLIDA = VARS.diaLeituraWellida ?? 8;  // mesmo ciclo da Casa da Mãe (onde fica a usina)
  // CORRIGIDO 01/08/2026 (V241, pedido do usuario - "use a meta do mes especifico igual e feito pra
  // mim"): meta deixa de ser numero fixo solto (321/119) e passa a derivar do mesmo indice (mes atual,
  // posicao 0) do historico real de 12 meses de cada casa - mesmo criterio ja usado pro Wallace desde o
  // inicio (321 sempre foi kwhAnoAnterior[0], so nao estava escrito assim). Nunca mais dessincroniza.
  // CORRIGIDO 03/08/2026 (achado ao verificar a seção 12 após as mudanças de ciclo): meta usava
  // kwhAnoAnterior[0]/consumoMensalIrma[0] fixo - sempre o valor de JULHO (mês de ativação), mesmo já
  // estando em agosto+. Igual ao bug do gráfico 09 (mesma classe: índice fixo em vez de acompanhar o
  // mês real) - agora usa OFFSET_ENERGIA (mesmo índice corrigido no gráfico 09, calendário puro, dia 1).
  // CORRIGIDO 14/08/2026 (achado do usuário: "os valores de referência de agosto... o ciclo já fechou
  // dia 8, então deve mudar automaticamente" — OFFSET_ENERGIA vira só na virada de MÊS CALENDÁRIO
  // (dia 1), por decisão explícita e documentada pro gráfico 09 (comentário linha ~899). Mas o Fluxo 2
  // segue o ciclo da GD, que fecha no dia 8 (mesmo dia pras duas previsões, ver DIA_LEITURA_WELLIDA
  // acima) — a meta dele tem que virar junto com ESSE fechamento, não esperar o dia 1 do mês seguinte.
  // Ciclo fechado em 07/08 usou a meta de Agosto (262) corretamente (fechou dentro da janela "ainda é
  // Agosto pro calendário E pro corte de dia 8" — os dois offsets convergem nesse caso); o ciclo NOVO
  // (aberto 07/08, ainda dentro de Agosto no calendário) já devia estar comparando contra a meta de
  // Setembro, porque já passamos do corte de dia 8 dele. offsetMesesCicloGD() é o mesmo cálculo do
  // offsetMesesCalendario() (linha ~905), só que a virada de mês acontece no dia 8, não no dia 1.
  const DIA_CORTE_CICLO_GD = DIA_LEITURA_WELLIDA; // 8 — mesmo dia usado como "Dias restantes (GD)" acima
  // CORRIGIDO 14/08/2026 (achado real, auditoria própria depois do pedido "tudo automático, mudou o
  // ciclo mudou tudo"): esta função aceita uma data de referência opcional — SEM isso, tanto o
  // Fluxo 1 (ciclo JÁ FECHADO, histórico, deveria ficar CONGELADO na meta do mês em que fechou) quanto
  // o Fluxo 2 (ciclo aberto, meta tem que acompanhar hoje) acabariam usando a MESMA meta baseada em
  // "hoje" — assim que o ciclo virasse de novo, o card do ciclo já fechado (que não deveria mudar mais
  // nunca) mudaria de meta junto, incorretamente. Fluxo 1 passa `ultimoFechado.data_fim` (trava no mês
  // em que aquele ciclo específico fechou, pra sempre); Fluxo 2 usa o padrão (hoje).
  function offsetMesesCicloGD(dataRef){
    const hoje = dataRef ? new Date(dataRef+'T00:00:00') : new Date();
    let ano = hoje.getFullYear(), mes = hoje.getMonth()+1; // 1-indexed
    if(hoje.getDate() >= DIA_CORTE_CICLO_GD){
      mes += 1;
      if(mes > 12){ mes = 1; ano += 1; }
    }
    return (ano-ANCHOR_ENERGIA_ANO)*12 + (mes-ANCHOR_ENERGIA_MES);
  }
  const OFFSET_ENERGIA_GD = Math.max(0, Math.min(11, offsetMesesCicloGD()));
  const META_WALLACE = kwhAnoAnterior[OFFSET_ENERGIA_GD];       // kWh, consumo real do mesmo mes no ano anterior (Wallace)
  const META_WELLIDA = consumoMensalIrma[OFFSET_ENERGIA_GD];    // kWh, consumo real do mesmo mes no ano anterior (Wellida)

  function calcularDiasRestantes(diaLeituraAlvo, hojeRef){
    const hj = hojeRef || new Date();
    const hojeSoData = new Date(hj.getFullYear(), hj.getMonth(), hj.getDate());
    let proxima = new Date(hj.getFullYear(), hj.getMonth(), diaLeituraAlvo);
    if(proxima <= hojeSoData) proxima = new Date(hj.getFullYear(), hj.getMonth()+1, diaLeituraAlvo);
    return Math.max(1, Math.round((proxima-hojeSoData)/86400000));
  }
  function calcularCreditoRestante(meta, creditoAtual){
    return Math.round((meta-creditoAtual)*100)/100;
  }
  function calcularMediaNecessaria(creditoRestante, diasRestantes){
    return Math.round((creditoRestante/diasRestantes)*10)/10;
  }
  function calcularMediaRealizada(creditoAtual, diasDecorridos){
    if(!diasDecorridos) return 0;
    return Math.round((creditoAtual/diasDecorridos)*10)/10;
  }
  function calcularPrevisao(creditoAtual, mediaRealizada, diasRestantesAlvo){
    return Math.round((creditoAtual + mediaRealizada*diasRestantesAlvo)*10)/10;
  }
  function calcularStatus(mediaRealizada, mediaNecessaria){
    if(mediaNecessaria<=0 || mediaRealizada>=mediaNecessaria) return {emoji:'🟢', texto:'No ritmo', cor:'var(--green)'};
    const deficitPct = (mediaNecessaria-mediaRealizada)/mediaNecessaria;
    if(deficitPct < 0.10) return {emoji:'🟡', texto:'Atenção', cor:'var(--amber)'};
    return {emoji:'🔴', texto:'Atrasado', cor:'var(--red)'};
  }

  // CORRIGIDO 11/08/2026 (pedido do usuário, doc "Ajuste Conceitual da Seção 'Previsão até a
  // Próxima Leitura'") - renderPrevisao agora só cobre o Fluxo 2 (GD atual, em formação): "Faltam"/
  // "Saldo esperado" comparados com a meta do MÊS saíram daqui (não fazem mais sentido pra um crédito
  // que ainda nem fechou) - viraram Período/Rateio, informativos, não uma promessa de cobertura.
  function renderPrevisao(prefixo, meta, diaLeitura, creditoAtual, diasDecorridos, corBarra, periodoTxt, rateioTxt){
    const diasRestantes = calcularDiasRestantes(diaLeitura);
    const creditoRestante = calcularCreditoRestante(meta, creditoAtual);
    const mediaNecessaria = calcularMediaNecessaria(Math.max(0,creditoRestante), diasRestantes);
    const mediaRealizada = calcularMediaRealizada(creditoAtual, diasDecorridos);
    const previsao = calcularPrevisao(creditoAtual, mediaRealizada, diasRestantes);
    const status = calcularStatus(mediaRealizada, mediaNecessaria);
    const pct = Math.min(100, Math.max(0, Math.round(creditoAtual/meta*100)));
    const set = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
    const barEl = $(prefixo+'Bar');
    if(barEl){ barEl.style.width = pct+'%'; barEl.style.background = status.cor; }
    set(prefixo+'Fracao', fmtKwhPtBr(creditoAtual)+' / '+fmtKwhPtBr(meta)+' kWh (meta do mês, referência)');
    set(prefixo+'Pct', pct+'%');
    set(prefixo+'Periodo', periodoTxt || '—');
    set(prefixo+'Rateio', rateioTxt || '—');
    set(prefixo+'Dias', diasRestantes+' dias');
    set(prefixo+'Necessario', fmtKwhPtBr(mediaNecessaria)+' kWh/dia');
    set(prefixo+'Media', fmtKwhPtBr(mediaRealizada)+' kWh/dia');
    // NOVO 19/08/2026 (pedido do usuário: "faça o esquema de cor que fiz no site também aqui, verde
    // amarelo e vermelho"): mesmo critério já usado pra colorir a barra/status acima (calcularStatus,
    // compara ritmo realizado vs. necessário pra bater a meta) — reaproveitado aqui em vez de duplicar
    // lógica, já que "previsão cobre a meta" e "ritmo está no necessário" são o mesmo limiar.
    const previsaoEl = $(prefixo+'Previsao');
    if(previsaoEl){ previsaoEl.textContent = fmtKwhPtBr(previsao)+' kWh'; previsaoEl.style.color = status.cor; }
    const statusEl = $(prefixo+'Status');
    if(statusEl){ statusEl.textContent = status.emoji+' '+status.texto+' (ritmo de geração desta GD)'; statusEl.style.color = status.cor; }
  }

  // NOVO 11/08/2026: Fluxo 1 - crédito já FECHADO no último ciclo da GD, o que realmente vai
  // abater a próxima fatura de cada casa. Não recalcula nada (credito_wallace_kwh/credito_irma_kwh
  // já vêm gravados e congelados por fechar_ciclo_solar() - ver ciclos_solares) - só apresenta.
  function renderFluxo1Fechado(prefixo, meta, creditoFechado, dataFimTxt){
    const set = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
    const barEl = $(prefixo+'Bar');
    if(creditoFechado==null){
      set(prefixo+'Fracao', 'Sem ciclo fechado ainda'); set(prefixo+'Cobertura', '—');
      set(prefixo+'Data', '—'); set(prefixo+'Meta', fmtKwhPtBr(meta)+' kWh'); set(prefixo+'Faltam', '—');
      if(barEl) barEl.style.width = '0%';
      return;
    }
    const cobertura = meta>0 ? Math.round((creditoFechado/meta)*1000)/10 : 0;
    const faltam = Math.round((meta-creditoFechado)*10)/10;
    const pct = Math.min(100, Math.max(0, Math.round(cobertura)));
    if(barEl){ barEl.style.width = pct+'%'; barEl.style.background = faltam<=0 ? 'var(--green)' : 'var(--amber)'; }
    set(prefixo+'Fracao', fmtKwhPtBr(creditoFechado)+' / '+fmtKwhPtBr(meta)+' kWh');
    set(prefixo+'Cobertura', fmtKwhPtBr(cobertura)+'%');
    set(prefixo+'Data', dataFimTxt);
    set(prefixo+'Meta', fmtKwhPtBr(meta)+' kWh');
    set(prefixo+'Faltam', faltam>0 ? fmtKwhPtBr(faltam)+' kWh' : 'Cobre com sobra de '+fmtKwhPtBr(Math.abs(faltam))+' kWh');
  }

  if(ultimaSolar){
    // CORRIGIDO 05/08/2026: antes usava ultimaSolar.creditoWallace/creditoIrma (parado na ultima
    // leitura manual) - agora usa a MESMA projecao do grafico 10/11 quando disponivel (VARS.
    // _creditoLiquidoProjetadoHoje, calculada mais acima), pra nao mostrar 2 numeros diferentes pro
    // mesmo conceito de "credito atual". Cai pro valor parado só se a projecao nao pode ser calculada
    // (ex: sem geracaoAcumulada real ainda).
    // NOVO 08/08/2026 (Solar entra na V2 — modelo de ciclos): Previsão passa a ser baseada
    // EXCLUSIVAMENTE no ciclo aberto — creditoLiquidoPrevisao (projeção desde-ativação, calculada
    // acima) menos o baseline do ciclo aberto, e diasDecorridos contado desde o início do ciclo
    // aberto (cicloSolarAberto.data_inicio), não mais desde a ativação. Sem fallback silencioso: se
    // baselineKwh não veio da V2, marca "Indisponível" em vez de mostrar a projeção desde-ativação
    // como se já fosse o ciclo atual.
    if(baselineKwh != null && cicloSolarAberto){
      const creditoLiquidoDesdeAtivacaoPrevisao = VARS._creditoLiquidoProjetadoHoje != null ? VARS._creditoLiquidoProjetadoHoje : ultimaSolar.creditoLiquido;
      const creditoLiquidoPrevisao = Math.round((creditoLiquidoDesdeAtivacaoPrevisao - baselineKwh) * 100) / 100;
      const creditoWallacePrevisao = Math.round(creditoLiquidoPrevisao * VARS.solarRateioWallace * 100) / 100;
      const creditoIrmaPrevisao = Math.round(creditoLiquidoPrevisao * VARS.solarRateioIrma * 100) / 100;
      // CORRIGIDO 11/08/2026 (achado do usuário: "porque está atrasado? a geração diária sempre supera
      // o mínimo" — logo após fechar um ciclo só existe 1 leitura manual, na própria data de abertura,
      // então "dias decorridos até a última leitura MANUAL" dava 0 e zerava a Média/Status mesmo o
      // numerador (creditoWallacePrevisao) já sendo uma projeção até HOJE via VARS._creditoLiquidoProjetadoHoje
      // (que soma a geração diária real do robô SAJ). Numerador projetado até hoje exige denominador em
      // dias até hoje, não até a última leitura manual — mesmo truque de fuso já usado em
      // agoraEfetivoFrescorSolar()/hydrate-onda5-qualidade-geracao.js (desloca -3h, só a data importa aqui).
      const hojeBrasilia = new Date(Date.now() - 3*3600*1000);
      const diasDesdeInicioCiclo = Math.max(0, Math.round((hojeBrasilia - new Date(cicloSolarAberto.data_inicio)) / 86400000));
      const fmtDataBr = iso => iso ? iso.split('-').reverse().join('/') : '—';
      // CORRIGIDO 14/08/2026 (pedido do usuário: "aqui pode por 08.09.2026, melhor que aberto") —
      // "em aberto" não dizia QUANDO o ciclo deve fechar; mostra a data prevista de verdade (mesmo
      // dia 8 usado em "Dias restantes (GD)"/meta acima — calcularDiasRestantes já faz essa conta,
      // só reaproveitada aqui pra pegar a Date em vez do número de dias).
      const proximoFechamentoGD = (() => {
        const hj = new Date(); const hojeSoData = new Date(hj.getFullYear(), hj.getMonth(), hj.getDate());
        let prox = new Date(hj.getFullYear(), hj.getMonth(), DIA_LEITURA_WELLIDA);
        if(prox <= hojeSoData) prox = new Date(hj.getFullYear(), hj.getMonth()+1, DIA_LEITURA_WELLIDA);
        return prox;
      })();
      const fmtDataBrDate = d => d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
      const periodoTxt = fmtDataBr(cicloSolarAberto.data_inicio)+' → '+fmtDataBrDate(proximoFechamentoGD);
      // CORRIGIDO 14/08/2026 (achado do usuário: "o dia deve ser sempre dia 08 que é o da leitura do
      // GD" — DIA_LEITURA_WALLACE (21) é a leitura do APARTAMENTO do Wallace pela Energisa, sobre
      // CONSUMO, sem nenhuma relação com quando o ciclo de GERAÇÃO (a usina, na Casa da Mãe) fecha.
      // "Dias restantes (GD)" tem que refletir quando o ciclo de crédito realmente fecha, não a
      // leitura de consumo de cada apartamento — por isso as DUAS previsões (Wallace e Wellida) usam
      // DIA_LEITURA_WELLIDA (dia 8, mesmo dia da leitura da Casa da Mãe onde fica a usina), mesmo
      // essa constante tendo "Wellida" no nome (nome antigo, o dia em si é da GD, não da irmã).
      renderPrevisao('prevWallace', META_WALLACE, DIA_LEITURA_WELLIDA, creditoWallacePrevisao, diasDesdeInicioCiclo, '#34c98a', periodoTxt, Math.round(VARS.solarRateioWallace*1000)/10+'%');
      renderPrevisao('prevWellida', META_WELLIDA, DIA_LEITURA_WELLIDA, creditoIrmaPrevisao, diasDesdeInicioCiclo, '#e8a63a', periodoTxt, Math.round(VARS.solarRateioIrma*1000)/10+'%');

      // Fluxo 1: crédito do último ciclo JÁ FECHADO (congelado, não recalcula) - o que de fato vai
      // abater a próxima fatura de cada casa. ciclosSolarFechados vem ordenado por data_fim DESC
      // (vw_ciclo_solar_historico), então [0] é sempre o fechamento mais recente.
      const ultimoFechado = Array.isArray(ciclosSolarFechados) && ciclosSolarFechados.length ? ciclosSolarFechados[0] : null;
      if(ultimoFechado){
        // CORRIGIDO 14/08/2026 (achado real, ver comentário em offsetMesesCicloGD acima): meta do
        // Fluxo 1 (fechado) usa a data REAL de fechamento DESTE ciclo, não "hoje" — fica travada pra
        // sempre no mês certo, mesmo depois que o próximo ciclo virar e META_WALLACE/META_WELLIDA
        // (que seguem "hoje") já tiverem avançado pro mês seguinte.
        const offsetFechado = Math.max(0, Math.min(11, offsetMesesCicloGD(ultimoFechado.data_fim)));
        // NOVO 22/08/2026 (pedido do usuário: "esses dados devem vir dos medidores, como o meu já tá
        // funcionando, pode já colocar, aí quando os outros entrarem em operação você coloca") — Meta
        // do Wallace passa a usar a SOMA real do medidor Tuya na janela exata do ciclo fechado
        // (data_inicio→data_fim), quando o medidor tiver dado pra TODOS os dias dessa janela (nunca
        // mistura real com estimativa dentro do mesmo número). Hoje (22/08) o medidor só tem dado a
        // partir de 17/08 — não cobre o ciclo mais recente (21/07→07/08), então cai no histórico do
        // ano passado como sempre caiu; passa a valer sozinho a partir do próximo ciclo que fechar
        // (~08/09), sem precisar tocar aqui de novo.
        function consumoRealTuyaNaJanela(diario, dataInicio, dataFim){
          if(!Array.isArray(diario) || !dataInicio || !dataFim) return null;
          const porData = {}; diario.forEach(r => { if(r.kwh_consumido != null) porData[r.data] = Number(r.kwh_consumido); });
          const dias = []; for(let d=new Date(dataInicio); d<=new Date(dataFim); d.setDate(d.getDate()+1)) dias.push(d.toISOString().slice(0,10));
          if(!dias.every(iso => porData[iso] != null)) return null; // janela incompleta - nunca mistura real com chute
          return Math.round(dias.reduce((s,iso)=>s+porData[iso],0)*100)/100;
        }
        const metaWallaceFechado = consumoRealTuyaNaJanela(window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2, ultimoFechado.data_inicio, ultimoFechado.data_fim) ?? kwhAnoAnterior[offsetFechado];
        const metaWellidaFechado = consumoMensalIrma[offsetFechado];
        renderFluxo1Fechado('fechWallace', metaWallaceFechado, Number(ultimoFechado.credito_wallace_kwh), fmtDataBr(ultimoFechado.data_fim));
        renderFluxo1Fechado('fechWellida', metaWellidaFechado, Number(ultimoFechado.credito_irma_kwh), fmtDataBr(ultimoFechado.data_fim));
      } else {
        renderFluxo1Fechado('fechWallace', META_WALLACE, null, null);
        renderFluxo1Fechado('fechWellida', META_WELLIDA, null, null);
      }
    } else {
      ['prevWallaceStatus','prevWellidaStatus'].forEach(id => { const el=$(id); if(el){ el.textContent='⚠ Indisponível (V2)'; el.style.color='var(--red)'; } });
      console.error('CicloSolar: Previsão (seção 12) sem baselineKwh/cicloSolarAberto — não calculada, sem fallback silencioso.');
    }
  }
}

// V300 (03/08/2026, Etapa 1.1 do plano de modernizacao): antes disso, os graficos das abas
// Cenarios/Graficos (nao visiveis no carregamento inicial, so a aba Painel e) ja nao bloqueavam
// mais a 1a pintura (item 5 antigo, double-rAF), mas ainda eram criados sempre, incondicionalmente,
// mesmo se o usuario nunca abrisse essas abas. Agora so sao criados na 1a vez que o usuario abre
// 'graficos' OU 'cenarios' (showMaster chama initGraficosECenariosLazy()) - flag garante que roda
// uma unica vez (as funcoes internas nao sao idempotentes, cada uma faz "new Chart" de novo se
// chamada 2x). Mesmos graficos, mesmos dados, mesmo resultado - so o gatilho de criacao mudou (aba
// aberta em vez de "sempre, um instante depois"). _lazyRenderCenariosDeficitEGraficosSolar mistura
// cDeficitZero (Cenarios) com os 3 graficos solares (Graficos) no mesmo escopo de funcao - nao
// separado por aba pra nao arriscar quebrar variaveis locais compartilhadas entre eles - por isso
// o gatilho e "qualquer uma das duas abas abriu primeiro" (cobre as duas com uma unica carga).
let _graficosECenariosCarregados = false;
function initGraficosECenariosLazy(){
  if(_graficosECenariosCarregados) return;
  _graficosECenariosCarregados = true;
  _lazyRenderCenariosSalario();
  _lazyRenderGraficosSecao();
  _lazyRenderCenariosSuperavit();
  _lazyRenderCenariosDeficitEGraficosSolar();
  WallaceBus.emit('graficoAtualizado', {origem:'initGraficosECenariosLazy'}); // V300 (Etapa 2)
}

// NOVO 08/08/2026 (aba própria "☀️ Energia Solar"): mesmo padrão de flag-única de
// initGraficosECenariosLazy() acima, mas disparado só quando a aba "solar" abre — antes disso, o
// domínio Solar inteiro carregava junto com Gráficos OU Cenários (o que abrisse primeiro), mesmo que
// o usuário nunca tivesse interesse em ver Solar. Reduz trabalho inicial das outras abas.
let _solarCarregado = false;
function initSolarLazy(){
  if(_solarCarregado) return;
  _solarCarregado = true;
  _lazyRenderSolarSecao();
  // NOVO 10/08/2026: mostra os links de compartilhamento já ativos (se houver) assim que a aba abre.
  if(typeof renderizarLinksCompartilhamentoSolar === 'function') renderizarLinksCompartilhamentoSolar();
  WallaceBus.emit('graficoAtualizado', {origem:'initSolarLazy'});
}
