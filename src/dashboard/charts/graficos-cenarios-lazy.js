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

new Chart($('g_cPatrim'), {
  type:'doughnut',
  data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
    datasets:[{data:Object.values(REG.patrimonioDetalhe),
    backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart($('g_cVisa'), {
  type:'doughnut',
  data:{labels:VISA_DETALHE_LABELS,
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:VISA_DETALHE_CORES,
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

// CORRIGIDO 26/07/2026 (V166, pedido do usuario): "Composição da fatura Mastercard Black e Visa
// Infinite" so mostrava dados do Visa (visaDetalhe) - titulo prometia os 2 cartoes, grafico so
// entregava 1. Novo dataset COMBINADO: cada categoria soma o componente do Visa + o do Mastercard.
const FATURA_COMBINADA_LABELS = ['Parcelas','Consórcios','Wallace/MB','Recorrências','Corp.','Assinaturas','Vanessa/MB'];
const FATURA_COMBINADA_VALORES = [
  REG.visaDetalhe.parcelas, // parcelas so existem no Visa (MB nunca recebe parcela, regra fixa)
  REG.visaDetalhe.consorcios + REG.mbDetalhe.consorcios,
  REG.visaDetalhe.wallace + REG.mbDetalhe.wallace,
  REG.visaDetalhe.recorrencias + REG.mbDetalhe.recorrencias,
  REG.visaDetalhe.corp + REG.mbDetalhe.corp,
  REG.visaDetalhe.assinaturas + REG.mbDetalhe.assinaturas,
  REG.visaDetalhe.vanessa + REG.mbDetalhe.vanessa,
];
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
(function(){
  const cvComprometido = REG.caixaVariavel.comprometido;
  const cvDisponivel = REG.caixaVariavel.disponivel;
  const visaTotal = REG.cartaoInfinite.total;
  const mbTotal = REG.cartaoMB.total;
  const liquido = Math.round((visaTotal + mbTotal - cvComprometido)*100)/100;
  const reposicao = cvDisponivel < 0 ? Math.round(Math.abs(cvDisponivel)*100)/100 : 0;
  new Chart($('g_cCartoesLiquidoCV'), {
    type:'bar',
    plugins:[barValuePlugin],
    data:{labels:['Mastercard Black','Visa Infinite','Caixa Variável (comprometido)','Líquido não coberto','Disponível real em caixa','Reposição necessária'],
      datasets:[{data:[mbTotal, visaTotal, -cvComprometido, liquido, cvDisponivel, reposicao],
      backgroundColor:['#9085e9','#3987e5','#e2554f','#e8a63a','#34c98a','#e0574c'],borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60,left:10}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
        y:{grid:{display:false},ticks:{font:{size:10}}}}}
  });
})();

// 01 — Composição do Total Operacional (7 categorias confirmadas com o Wallace em 15/07/2026)
// Boletos=2600 (APORTE_BOLETOS, nao o total bruto do livro LRB) · Prov. MP=471,47 (MP pessoal, nao o total bruto do LRMP)
const totalOpLabels = ['Boletos','Parcelas','Consórcios','Recorrências','Aportes Pat.','Prov. MP','Assinaturas'];
const totalOpData = Object.values(REG.totalOpDetalhe);
const totalOpColors = ['#3987e5','#9085e9','#e2554f','#34c98a','#e8a63a','#6f6d66','#e879b0'];

new Chart($('g_cTotalOp'), {
  type:'doughnut',
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart($('g_cTotalOpBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

new Chart($('g_cVariavel'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:['Saldo real','Comprometido','Disponível'],
    datasets:[{data:[REG.caixaVariavel.saldoReal,REG.caixaVariavel.comprometido,REG.caixaVariavel.disponivel],
    backgroundColor:['#3987e5','#e8a63a','#34c98a'],borderRadius:5}]},
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
new Chart($('g_cEvol'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:gTotalOpSeries,
    borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
    borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gTotalOpRange.min,max:gTotalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

const gNecLiqSeries = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V163: baseado no CICLO financeiro (25-24), nao no mes calendario - evita o valor "pular" quando mes vira mas ciclo nao, ou vice-versa
const gNecLiqRange = yRange(gNecLiqSeries);
new Chart($('g_cNecessidadeLiquida'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:gNecLiqSeries,
    borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
    borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gNecLiqRange.min,max:gNecLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

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
const CAIXAS_OPERACIONAIS_INFO = {
  boletos:            { label:'Boletos',             nota:'23,6% da meta' },
  pixVanessa:         { label:'PIX Vanessa',          nota:'0% da meta (zerada)' },
  manutencao:         { label:'Manutenção',           nota:'LREI0001 quitado (21/07) — depósito direto do reembolso Wärtsilä' },
  eventos:            { label:'Eventos e Viagens',    nota:'Suporte à Variável (R$167,40) para o mesmo custo: visita família Vanessa/Natal-RN — não é empréstimo' },
  saudeFamilia:       { label:'Saúde Família',        nota:'2x Júlio + 1x Vanessa/ano · aporte R$100/mês' },
  aniversarioJulio:   { label:'Aniversário Júlio',    nota:'50% da meta · aporte R$200/mês até 14/09' },
  seguroEmplacamento: { label:'Seguro/Emplacamento',  nota:'Aporte R$425/mês (permanente)' },
  bensDuraveis:       { label:'Bens Duráveis',        nota:'Nasceu em -R$355,00 (fone + cortador de pelo, comprados antes da caixa existir) · aporte R$250/mês' },
  escolaJulio:        { label:'Escola Júlio',         nota:'5,5% da meta · meta R$9.236,00, fora da Meta do Milhão (P5)' }
};
const caixasChaves = Object.keys(REG.caixasOperacionais);
const caixasLabels = caixasChaves.map(k => (CAIXAS_OPERACIONAIS_INFO[k] && CAIXAS_OPERACIONAIS_INFO[k].label) || k);
const caixasSaldo = caixasChaves.map(k=>REG.caixasOperacionais[k].saldo);
const caixasMeta =  caixasChaves.map(k=>REG.caixasOperacionais[k].meta);
const caixasNotas = caixasChaves.map(k => (CAIXAS_OPERACIONAIS_INFO[k] && CAIXAS_OPERACIONAIS_INFO[k].nota) || '');

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

observeAndRenderChart($('g_cCaixas'), () => new Chart($('g_cCaixas'), {
  type:'bar',
  plugins:[caixasValuePlugin],
  data:{labels:caixasLabels,
    datasets:[
      {label:'Meta', data:caixasMeta, backgroundColor:'#e8a63a', borderRadius:3},
      {label:'Saldo atual', data:caixasSaldo, backgroundColor:'#3987e5', borderRadius:3}
    ]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:70}},
    barPercentage:0.7,categoryPercentage:0.65,
    plugins:{legend:legendStd,tooltip:{callbacks:{
      label:c=>c.dataset.label+': '+fmt(c.raw)+(c.datasetIndex===0 ? ' — '+caixasNotas[c.dataIndex] : '')
    }}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10.5}}}}}
}));

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
const alivioEventos = {
  2: {tipo:'alivio',  texto:'Aniversário Júlio completa (14/09) — R$200,00/mês liberados'},
  4: {tipo:'alivio',  texto:'Escola Júlio (ciclo atual) completa (01/11) — R$500,00/mês liberados'},
  6: {tipo:'aumento', texto:'Escola Júlio 2027 inicia (do zero) — +R$839,64/mês'},
  16:{tipo:'alivio',  texto:'Saúde Família + Escola Júlio 2027 completam — R$939,64/mês liberados'}
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

observeAndRenderChart($('g_cAlivio'), () => new Chart($('g_cAlivio'), {
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
}));
}

// ===== Operação Superávit Normal (Cenarios, secao 05) - mesmo piso do Deficit Zero, renda media 12m =====
function _lazyRenderCenariosSuperavit(){
  const grid2b = '#2a2d31';
  function fmt0b(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}

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
  const snLabels = gerarMesesCiclo(12); // V165: baseado no ciclo financeiro
  const snLiquido = alignSeriesCiclo(snLabels.map((_,i)=>liquidoMes(i)));
  const snNecessidade = alignSeriesCiclo(REG.superavitNormal.necessidade);
  const snDiferenca = snNecessidade.map((n,i)=>Math.round((snLiquido[i]-n)*100)/100);

  // Rotulo compacto em "k" (em vez de milhar completo) - o valor de Julho (salario real) e bem maior que
  // os demais (media), o que gerava sobreposicao de texto com o formato anterior "+13.371" (7 caracteres
  // largos demais para 12 barras). Formato "+19,4k" e fixo e mais estreito.
  const fmtK = v => '+'+(v/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'k';

  const snDataLabelPlugin = {
    id:'snDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        ctx.fillStyle = '#34c98a';
        ctx.fillText(fmtK(snDiferenca[i]), bar.x, bar.y - 7);
      });
      ctx.restore();
    }
  };

  new Chart($('cSuperavitNormal'), {
    type:'bar',
    plugins:[snDataLabelPlugin],
    data:{labels:snLabels,
      datasets:[{data:snDiferenca,
        backgroundColor:'#34c98a',
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Líquido: '+fmt(snLiquido[i]),'Necessidade Total (paga tudo): '+fmt(snNecessidade[i]),'Superávit: '+fmt(snDiferenca[i])];}
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
        y:{grid:{color:grid2b},ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:9.5}}}}}
  });

  const snTbody = $('snTableBody');
  if(snTbody){
    snTbody.innerHTML = snLabels.map((m,i)=>{
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+m+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snLiquido[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snNecessidade[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:var(--green)">+'+fmt0b(snDiferenca[i])+'</td>'+
        '</tr>';
    }).join('');
  }
}

// ===== Operação Déficit Zero e Energia Solar (Cenarios, secoes 06/07) =====
function _lazyRenderCenariosDeficitEGraficosSolar(){
  const grid2 = '#2a2d31';
    function fmt0(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}
  const legendStd2 = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};

  // Piso corrigido 15/07/2026: Parcelas Visa Infinite E Mercado Pago pessoal declinam (parcela
  // 3/6 do MP termina ~Set/26; a de 10/24 avança devagar). Consorcio NAO tem previsao de acabar
  // (confirmado pelo usuario) - fica fixo, assim como Boletos/Recorrencias/Assinaturas.
  // Liquido sem trabalhar fixo R$7.667,73 (12 contracheques reais).
  const dzLabels = gerarMesesCiclo(12); // V165: baseado no ciclo financeiro
  const dzLiquido = REG.deficitZero.liquidoSemTrabalhar;
  const dzPiso = alignSeriesCiclo(REG.deficitZero.piso);
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
        ctx.fillText(label, bar.x, d>=0 ? bar.y - 8 : bar.y + 16);
      });
      ctx.restore();
    }
  };

  new Chart($('cDeficitZero'), {
    type:'bar',
    plugins:[dzDataLabelPlugin],
    data:{labels:dzLabels,
      datasets:[{data:dzDeficit,
        backgroundColor: dzDeficit.map(v=>v<0?'#e2554f':'#34c98a'),
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Líquido sem trabalhar: '+fmt(dzLiquido),'Piso absoluto: '+fmt(dzPiso[i]),(dzDeficit[i]<0?'Déficit: ':'Superávit: ')+fmt(Math.abs(dzDeficit[i]))];}
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  });

  // Tabela HTML organizada abaixo do grafico - liquido, piso e diferenca por mes, texto real
  // (nao desenhado em canvas), garante legibilidade sem risco de sobreposicao.
  const dzTbody = $('dzTableBody');
  if(dzTbody){
    dzTbody.innerHTML = dzLabels.map((m,i)=>{
      const d = dzDeficit[i];
      const cor = d<0 ? 'var(--red)' : 'var(--green)';
      const sinal = d<0 ? '−' : '+';
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+m+'</td>'+
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


  // Energia: comparacao mes a mes, ano anterior (real) vs este ano (projetado com solar).
  // Tarifa real da fatura Jun/2026 (R$322,99/304kWh=R$1,0625/kWh, ICMS+PIS/COFINS ja embutidos).
  // So apartamento do Wallace. Fonte Jul/25-Abr/26: Projeto_Solar_Wallace_Consolidado.md.
  // Mai/26: interpolado entre Abr/26 e Jun/26 (nao ha leitura direta) - marcado com *.
  // Jun/26: real, confirmado na fatura Energisa.
  const mesesPares = ['Jul','Ago','Set','Out','Nov','Dez','Jan','Fev','Mar','Abr','Mai*','Jun'];
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

  observeAndRenderChart($('cEnergiaSolar'), () => new Chart($('cEnergiaSolar'), {
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
  }));
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
    const unidades = [
      { chave:'apartamento_wallace', nome:'Apartamento (Wallace)', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
      { chave:'casa_wellida', nome:'Casa da Wellida', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
      { chave:'casa_mae', nome:'Casa da Mãe (geradora)', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
    ];
    const linhas = unidades.map(u => {
      const d = comp[u.chave];
      if(!d) return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">dados insuficientes</td></tr>`;
      const faturaBase = d.historico ? d.historico.jul26 : d.fatura_jul26_valor;
      const consumoKwh = d.consumo_kwh || d.fatura_jul26_consumo_kwh;
      const pct = d.composicao_pct || {};
      if(faturaBase === undefined || !consumoKwh) return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">dados insuficientes</td></tr>`;
      const tarifaReal = faturaBase / consumoKwh;
      const custoDisponibilidade = Math.round(u.kwhMinimo * tarifaReal * 100) / 100;
      const fioBValor = Math.round(faturaBase * (pct.distribuicao||0)/100 * fioBFracaoDaDistribuicao * 100) / 100;
      const iluminacaoValor = Math.round(faturaBase * (pct.iluminacao||0)/100 * 100) / 100;
      const encargosValor = Math.round(faturaBase * (pct.encargos||0)/100 * 100) / 100;
      const residual = Math.round((custoDisponibilidade + fioBValor + iluminacaoValor + encargosValor) * 100) / 100;
      const economia = Math.round((faturaBase - residual) * 100) / 100;
      const economiaPct = Math.round((economia/faturaBase)*1000)/10;
      const detalhe = `Disponibilidade ${fmt(custoDisponibilidade)} + Fio B ${fmt(fioBValor)} + Iluminação ${fmt(iluminacaoValor)} + Encargos ${fmt(encargosValor)}`;
      return `<tr><td>${u.nome}</td><td class="r">${fmt(faturaBase)}</td><td class="r" style="color:var(--red)" title="${detalhe}">${fmt(residual)}</td><td class="r" style="color:var(--green)">${fmt(economia)} (${economiaPct}%)</td></tr>`;
    }).join('');
    residualTbodyEl.innerHTML = `<table><thead><tr><th>Unidade</th><th class="r">Fatura base (pré-solar)</th><th class="r">Residual estimado/mês</th><th class="r">Economia estimada</th></tr></thead><tbody>${linhas}</tbody></table>`;
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
  solarL.forEach(l=>{
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
  const OFFSET_SOLAR = Math.max(0, offsetCiclosSolar());
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
  const consumoMensalWallace = kwhAnoAnterior; // consumo real dos ultimos 12 meses (mesma base da secao 09)
  const consumoMensalIrma = VARS.solarConsumoIrmaAnoAnterior; // consumo REAL dos ultimos 12 meses (fatura Energisa), mesma logica do kwhAnoAnterior do Wallace

  // NOVO 02/08/2026 (pedido EXPLICITO do usuario - o texto sozinho na Unidade Geradora nao bastava,
  // "só a nota não é o impacto do gráfico"): a barra do MES CALENDARIO ATUAL no grafico 11 (Rateio
  // Solar) tambem precisa refletir o valor calculado (geracao real do inversor - consumo medio da
  // casa), nao so ficar parada na ultima leitura real parcial daquele mes. Mesma formula/regra da
  // estimativa da Unidade Geradora: some pra dentro deste grafico especifico, nao muda o dado bruto
  // (SOLAR_LEITURAS continua 100% real) - so a exibicao desta barra.
  let diasComDadoRealSolar = 0, diasProjetadosSolar = 0;
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

      const mesAtualCalendario = mesFechamentoCiclo(hojeSoDataChart.toISOString().slice(0,10)); // CORRIGIDO 03/08/2026: era mes calendario puro (hojeChart.getMonth()+1) - agora usa o ciclo de leitura (dia 8), consistente com o resto deste grafico
      const idxMesAtual = (mesAtualCalendario - ANCHOR_SOLAR_MES_CICLO + 12) % 12; // CORRIGIDO 03/08/2026: mesma ancora unica (Ago)
      // credito acumulado ATE O FIM DO CICLO ANTERIOR (ultima leitura de um ciclo diferente do atual)
      let creditoAcumAntesDoMesAtual = 0;
      solarL.forEach(l => {
        const mesDaLeitura = mesFechamentoCiclo(l.data); // CORRIGIDO 03/08/2026: era mes calendario puro
        if(mesDaLeitura !== mesAtualCalendario) creditoAcumAntesDoMesAtual = l.creditoLiquido;
      });
      const creditoDoMesAtualEstimado = Math.round((saldoTotalEstimadoChart - creditoAcumAntesDoMesAtual) * 100) / 100;
      creditoMensalWallace[idxMesAtual] = Math.round(creditoDoMesAtualEstimado * VARS.solarRateioWallace * 100) / 100;
      creditoMensalIrma[idxMesAtual] = Math.round(creditoDoMesAtualEstimado * VARS.solarRateioIrma * 100) / 100;
      temLeituraNoMes[idxMesAtual] = true;
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

    setUG('ugImportado', importadoAcum+' kWh');
    setUG('ugExportado', exportadoAcum+' kWh');
    setUG('ugSaldoLiquido', (saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh');
    const ugSaldoEl = $('ugSaldoLiquido');
    if(ugSaldoEl) ugSaldoEl.style.color = saldoLiquidoAcum>=0 ? '#34c98a' : '#e2554f';

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
    const saldoLiquidoEstimado = temGeracao
      ? Math.round((saldoLiquidoAcum + diasDesdeLeitura * (geracaoMediaDiaria - consumoMedioDiarioMae)) * 100) / 100
      : null;

    const ugEstimativaEl = $('ugSaldoLiquidoEstimado');
    if(ugEstimativaEl){
      if(saldoLiquidoEstimado !== null && diasDesdeLeitura > 0){
        ugEstimativaEl.style.display = 'block';
        ugEstimativaEl.innerHTML = `📊 Estimativa pra hoje: <strong style="color:${saldoLiquidoEstimado>=0?'#34c98a':'#e2554f'}">${saldoLiquidoEstimado>=0?'+':''}${saldoLiquidoEstimado} kWh</strong> (${diasDesdeLeitura} dia(s) desde a última leitura do medidor, calculado automaticamente com base na geração real do inversor − consumo médio da casa) — <strong>é estimativa, não leitura real</strong>; sempre que você mandar uma foto nova do medidor, o valor real substitui essa estimativa. Não precisa mandar leitura todo dia — isso aqui só preenche o intervalo sozinho.`;
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

    // Status: so usa dado 100% real (saldo liquido = 103-03), nao depende da geracao do inversor
    let statusUG = {emoji:'🔴', texto:'Déficit', cor:'#e2554f'};
    if(saldoLiquidoAcum > 0) statusUG = {emoji:'🟢', texto:'Excedente (exportando mais do que importa)', cor:'#34c98a'};
    else if(saldoLiquidoAcum === 0) statusUG = {emoji:'🟡', texto:'Equilibrado', cor:'#e8a63a'};
    const ugStatusEl = $('ugStatus');
    if(ugStatusEl){ ugStatusEl.textContent = statusUG.emoji+' '+statusUG.texto; ugStatusEl.style.color = statusUG.cor; }

    const ugResumoEl = $('ugResumo');
    if(ugResumoEl){
      if(consumoDiretoConfiavel){
        ugResumoEl.innerHTML = 'A casa consumiu <strong>'+consumoTotalCasa+' kWh</strong> neste período (desde 21/07, '+ultimaSolar.dias+' dias). <strong style="color:#34c98a">'+consumoDiretoAcum+' kWh ('+autoconsumoPct+'%)</strong> foram atendidos diretamente pelas placas. <strong style="color:#e8a63a">'+importadoAcum+' kWh ('+dependenciaPct+'%)</strong> vieram da Energisa. A usina exportou <strong>'+exportadoAcum+' kWh</strong> ('+exportacaoDaGeracaoPct+'% de tudo que gerou). Saldo líquido produzido: <strong style="color:'+(saldoLiquidoAcum>=0?'#34c98a':'#e2554f')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong> — é esse saldo que alimenta o rateio da seção 11, abaixo.';
      } else if(temGeracao){
        // CORRIGIDO 02/08/2026 (achado do usuário): antes disso, se temGeracao=true o resumo sempre
        // calculava consumoDireto/autoconsumo misturando geracao viva com exportado congelado, sem
        // limite - agora que existe o travamento por dias de descompasso, esse ramo intermediario
        // cobre "tem geracao mas o descompasso ja passou do limite seguro" - mostra so o que e 100%
        // real (importado/exportado/saldo liquido), sem fingir precisao no consumo direto.
        ugResumoEl.innerHTML = '<strong style="color:#e8a63a">Consumo direto/autoconsumo pausado</strong> — a leitura do medidor está desatualizada há <strong>'+diasDescompassoAtual+' dias</strong> (mais que o limite seguro de '+LIMITE_DIAS_DESCOMPASSO_SEGURO+'), então parei de calcular esses campos pra não mostrar número cada vez mais errado. Importado (<strong>'+importadoAcum+' kWh</strong>), exportado (<strong>'+exportadoAcum+' kWh</strong>) e saldo líquido (<strong style="color:'+(saldoLiquidoAcum>=0?'#34c98a':'#e2554f')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong>) continuam corretos (vêm do medidor bidirecional) — isso já alimenta o rateio da seção 11 normalmente. Manda uma leitura nova do 03/103 pra recalibrar tudo.';
      } else {
        ugResumoEl.innerHTML = '<strong style="color:#e8a63a">Dados insuficientes para calcular consumo direto/autoconsumo/dependência</strong> — falta a leitura real de geração acumulada do inversor SAJ. Importado (<strong>'+importadoAcum+' kWh</strong>), exportado (<strong>'+exportadoAcum+' kWh</strong>) e saldo líquido (<strong style="color:'+(saldoLiquidoAcum>=0?'#34c98a':'#e2554f')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong>) continuam corretos (vêm do medidor bidirecional) — isso já alimenta o rateio da seção 11 normalmente.';
      }
    }

    // Historico mes a mes (03, 103, consumo direto real, saldo liquido) - so plota consumo direto
    // quando existir geracaoAcumulada real naquele mes (senao fica null, sem barra - mesmo padrao
    // ja usado pros meses sem leitura de credito).
    observeAndRenderChart($('cUnidadeGeradora'), () => new Chart($('cUnidadeGeradora'), {
      type:'bar',
      data:{labels:mesesParesSolar,
        datasets:[
          {label:'Importado (código 03)', data:alignSolar(importadoMensal), backgroundColor:'#e2554f', borderRadius:3},
          {label:'Consumo direto (calculado)', data:alignSolar(consumoDiretoMensal), backgroundColor:'#e8a63a', borderRadius:3},
          {label:'Exportado (código 103)', data:alignSolar(exportadoMensal), backgroundColor:'#3987e5', borderRadius:3},
          {label:'Saldo líquido', data:alignSolar(saldoLiquidoMensal), backgroundColor:'#34c98a', borderRadius:3}
        ]},
      options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22}},
        plugins:{legend:legendStd2,tooltip:{callbacks:{
          label:c=>{
            if(c.raw===null) return c.dataset.label+': sem dado ainda';
            return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh';
          }
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.9,barPercentage:0.35},
          y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
    }));
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
    const consumoMedioDiarioCasas = Math.round((VARS.solarConsumoDiarioWallace + VARS.solarConsumoDiarioIrma + VARS.solarConsumoDiarioMae) * 100) / 100;
    const linhaConsumoMedio = todasDatas.map(()=> consumoMedioDiarioCasas);
    observeAndRenderChart($('cGeracaoPorDia'), () => new Chart($('cGeracaoPorDia'), {
      type:'bar',
      data:{labels:labelsPorDia, datasets:[
        {label:'Geração real do dia (robô SAJ)', data:valoresDiarioReal, backgroundColor:'#34c98a', borderRadius:4, order:1},
        {label:'Consumo médio diário (3 casas: Wallace + irmã + mãe/geradora)', data:linhaConsumoMedio, type:'line', borderColor:'#ff6b6b', borderDash:[8,3], borderWidth:3.5, pointRadius:0, fill:false, order:0}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:legendStd2,tooltip:{callbacks:{
          label:c=>c.raw==null ? c.dataset.label+': sem dado' : c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kWh'
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9.5}}},
          y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
    }));
    const legGeracaoPorDiaEl = $('legGeracaoPorDia');
    if(legGeracaoPorDiaEl){
      const qtdReal = Object.keys(diariosPorData).length;
      legGeracaoPorDiaEl.textContent = qtdReal
        ? qtdReal+' dia(s) com geração real do robô SAJ (barra verde). Linha vermelha tracejada = consumo médio diário somado das 3 casas, todas com fatura Energisa real confirmada (Wallace 10,00 + irmã 3,73 + mãe/geradora 7,38 = '+consumoMedioDiarioCasas.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' kWh/dia).'
        : 'Ainda sem geração diária real do robô SAJ (barra verde aparece a partir da próxima execução, 09h/17h).';
    }
  }


  const solarBarLabelPlugin = {
    id:'solarBarLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "600 6.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      chart.data.datasets.forEach((ds,di)=>{
        const meta = chart.getDatasetMeta(di);
        ctx.fillStyle = ds.backgroundColor;
        meta.data.forEach((bar,i)=>{
          const v = ds.data[i];
          if(v===null || v===undefined) return;
          ctx.fillText(v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}), bar.x, bar.y - 4);
        });
      });
      ctx.restore();
    }
  };
  observeAndRenderChart($('cSolarRateio'), () => new Chart($('cSolarRateio'), {
    type:'bar',
    plugins:[solarBarLabelPlugin],
    data:{labels:mesesParesSolar,
      datasets:[
        {label:'Crédito Wallace (gerado)', data:alignSolar(creditoMensalWallace), backgroundColor:'#34c98a', borderRadius:3},
        {label:'Consumo esperado Wallace', data:alignSolar(consumoMensalWallace), backgroundColor:'#f0c94a', borderRadius:3},
        {label:'Crédito Irmã (gerado)', data:alignSolar(creditoMensalIrma), backgroundColor:'#1c7a54', borderRadius:3},
        {label:'Consumo esperado Irmã', data:alignSolar(consumoMensalIrma), backgroundColor:'#a9861f', borderRadius:3}
      ]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:30,bottom:8}},
      plugins:{legend:legendStd2,tooltip:{callbacks:{
        label:c=>{
          if(c.raw===null) return c.dataset.label+': sem leitura ainda';
          const nota = (c.datasetIndex===0 && !temLeituraNoMes[c.dataIndex]) ? '' : '';
          return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh'+(c.datasetIndex%2===1?' (estimado, consumo histórico)':'');
        }
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.9,barPercentage:0.35},
        y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
  }));
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
        + ' — por isso pode diferir um pouco da Seção 12/13 (Previsão), que mostra só a última leitura manual, sem projetar nenhum dia à frente.'
      : '';
    legSolarEl.innerHTML = 'Última leitura ('+ultimaSolar.data.split('-').reverse().join('/')+', '+(ultimaSolar.fonte==='real'?'real':'estimado')+', '+ultimaSolar.dias+' dias desde 21/07): crédito líquido acumulado até agora <strong>'+ultimaSolar.creditoLiquido+' kWh</strong> (Wallace '+ultimaSolar.creditoWallace+' kWh · Irmã '+ultimaSolar.creditoIrma+' kWh). Isso ainda não é a meta do mês fechada — pra saber se está no ritmo certo pra bater a meta mensal, veja a seção 11 (Previsão) logo abaixo. Consumo mostrado nas barras é o histórico REAL dos últimos 12 meses de cada apartamento (fatura Energisa de cada um, Wallace e Wellida). '+mesesComLeitura+' de 12 meses já têm leitura de crédito; os demais ficam sem barra verde até a leitura chegar.'+avisoEstimativa;
  }

  // ===== NOVO 01/08/2026: Previsão de Compensação de Créditos de Energia =====
  // Especificação fornecida pelo usuário (documento anexado, 01/08/2026). Reaproveita 100% os dados já
  // existentes (VARS.SOLAR_LEITURAS_CALC) - nao duplica nenhuma variavel, so consome e apresenta previsao.
  // Constantes faceis de ajustar se a janela/dia de leitura mudar (pedido explicito do usuario).
  const DIA_LEITURA_WALLACE = 21; // CORRIGIDO 03/08/2026 (confirmado pelo usuário): era 20. Leitura Energisa do apartamento, janela 19-21
  const DIA_LEITURA_WELLIDA = 8;  // CONFIRMADO 03/08/2026: mesmo ciclo da Casa da Mãe (onde fica a usina) - dia 8
  // CORRIGIDO 01/08/2026 (V241, pedido do usuario - "use a meta do mes especifico igual e feito pra
  // mim"): meta deixa de ser numero fixo solto (321/119) e passa a derivar do mesmo indice (mes atual,
  // posicao 0) do historico real de 12 meses de cada casa - mesmo criterio ja usado pro Wallace desde o
  // inicio (321 sempre foi kwhAnoAnterior[0], so nao estava escrito assim). Nunca mais dessincroniza.
  // CORRIGIDO 03/08/2026 (achado ao verificar a seção 12 após as mudanças de ciclo): meta usava
  // kwhAnoAnterior[0]/consumoMensalIrma[0] fixo - sempre o valor de JULHO (mês de ativação), mesmo já
  // estando em agosto+. Igual ao bug do gráfico 09 (mesma classe: índice fixo em vez de acompanhar o
  // mês real) - agora usa OFFSET_ENERGIA (mesmo índice corrigido no gráfico 09, calendário puro, dia 1).
  const META_WALLACE = kwhAnoAnterior[OFFSET_ENERGIA];       // kWh, consumo real do mesmo mes no ano anterior (Wallace)
  const META_WELLIDA = consumoMensalIrma[OFFSET_ENERGIA];    // kWh, consumo real do mesmo mes no ano anterior (Wellida)

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
    if(mediaNecessaria<=0 || mediaRealizada>=mediaNecessaria) return {emoji:'🟢', texto:'No ritmo', cor:'#34c98a'};
    const deficitPct = (mediaNecessaria-mediaRealizada)/mediaNecessaria;
    if(deficitPct < 0.10) return {emoji:'🟡', texto:'Atenção', cor:'#e8a63a'};
    return {emoji:'🔴', texto:'Atrasado', cor:'#e2554f'};
  }

  function renderPrevisao(prefixo, meta, diaLeitura, creditoAtual, diasDecorridos, corBarra){
    const diasRestantes = calcularDiasRestantes(diaLeitura);
    const creditoRestante = calcularCreditoRestante(meta, creditoAtual);
    const mediaNecessaria = calcularMediaNecessaria(Math.max(0,creditoRestante), diasRestantes);
    const mediaRealizada = calcularMediaRealizada(creditoAtual, diasDecorridos);
    const previsao = calcularPrevisao(creditoAtual, mediaRealizada, diasRestantes);
    const saldoEsperado = Math.round((previsao-meta)*10)/10;
    const status = calcularStatus(mediaRealizada, mediaNecessaria);
    const pct = Math.min(100, Math.max(0, Math.round(creditoAtual/meta*100)));
    const set = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
    const barEl = $(prefixo+'Bar');
    if(barEl){ barEl.style.width = pct+'%'; barEl.style.background = status.cor; }
    set(prefixo+'Fracao', creditoAtual+' / '+meta+' kWh');
    set(prefixo+'Pct', pct+'%');
    set(prefixo+'Faltam', Math.max(0,creditoRestante)+' kWh');
    set(prefixo+'Dias', diasRestantes+' dias');
    set(prefixo+'Necessario', mediaNecessaria+' kWh/dia');
    set(prefixo+'Media', mediaRealizada+' kWh/dia');
    set(prefixo+'Previsao', previsao+' kWh');
    const saldoTxt = (saldoEsperado>=0?'+':'')+saldoEsperado+' kWh';
    set(prefixo+'Saldo', saldoTxt);
    const saldoEl = $(prefixo+'Saldo');
    if(saldoEl) saldoEl.style.color = saldoEsperado>=0 ? '#34c98a' : '#e2554f';
    const statusEl = $(prefixo+'Status');
    if(statusEl){ statusEl.textContent = status.emoji+' '+status.texto; statusEl.style.color = status.cor; }
  }

  if(ultimaSolar){
    // CORRIGIDO 05/08/2026: antes usava ultimaSolar.creditoWallace/creditoIrma (parado na ultima
    // leitura manual) - agora usa a MESMA projecao do grafico 10/11 quando disponivel (VARS.
    // _creditoLiquidoProjetadoHoje, calculada mais acima), pra nao mostrar 2 numeros diferentes pro
    // mesmo conceito de "credito atual". Cai pro valor parado só se a projecao nao pode ser calculada
    // (ex: sem geracaoAcumulada real ainda).
    const creditoLiquidoPrevisao = VARS._creditoLiquidoProjetadoHoje != null ? VARS._creditoLiquidoProjetadoHoje : ultimaSolar.creditoLiquido;
    const creditoWallacePrevisao = Math.round(creditoLiquidoPrevisao * VARS.solarRateioWallace * 100) / 100;
    const creditoIrmaPrevisao = Math.round(creditoLiquidoPrevisao * VARS.solarRateioIrma * 100) / 100;
    renderPrevisao('prevWallace', META_WALLACE, DIA_LEITURA_WALLACE, creditoWallacePrevisao, ultimaSolar.dias, '#34c98a');
    renderPrevisao('prevWellida', META_WELLIDA, DIA_LEITURA_WELLIDA, creditoIrmaPrevisao, ultimaSolar.dias, '#e8a63a');
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
