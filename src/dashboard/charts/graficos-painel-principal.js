// MÓDULO: valueLeaderPlugin + renderGraficosPainelPrincipal() — os 6 gráficos Chart.js do Painel
// principal (cPatrim/cVisa/cVisaMB/cVariavel/cEvol/cNecessidadeLiquida). Extraído de app.js na
// modularização (07/08/2026). IMPORTANTE: essa IIFE original rodava de forma SÍNCRONA no meio da
// execução do app.js (não via onDomPronto) e lê REG/VISA_DETALHE_LABELS/VISA_DETALHE_CORES, que só
// existem depois que boa parte do app.js já rodou (REG é populado no próprio app.js). Por isso, ao
// contrário dos módulos hydrate-*, isso NÃO pode ser um IIFE de topo aqui (executaria cedo demais,
// com REG ainda undefined) — virou a função renderGraficosPainelPrincipal(), definida aqui (carrega
// ANTES do app.js, sem problema — só define, não executa) e CHAMADA explicitamente no app.js na
// mesma posição exata de código onde a IIFE rodava antes. Depende de barValuePlugin (já em
// graficos-utilitarios.js, carregado antes deste módulo) e alignSeriesCiclo/yRange/gerarMesesCiclo
// (idem). Nenhuma fórmula ou comportamento mudou.
const valueLeaderPlugin = {
  id: 'valueLeader',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    meta.data.forEach((point, i) => {
      const x = point.x, y = point.y;
      const lineTop = y - 16;
      ctx.strokeStyle = 'rgba(169,167,159,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, lineTop);
      ctx.stroke();
      const label = 'R$ ' + Math.round(values[i]).toLocaleString('pt-BR');
      ctx.fillStyle = '#e8e6df';
      ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(label, x, lineTop - 4);
    });
    ctx.restore();
  }
};

function renderGraficosPainelPrincipal(){
  const muted = '#a9a79f', dim='#6f6d66', grid='#2a2d31';
  Chart.defaults.color = muted;
  Chart.defaults.font.family = "-apple-system, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size = 11;

  window.WALLACE_CHARTS = window.WALLACE_CHARTS || {};
  // DEFENSIVO (11/08/2026, achado de auditoria): destrói instância Chart.js pré-existente no canvas
  // antes de recriar. Hoje cada gráfico só é criado 1x por sessão (guards), então isso nunca dispara
  // na prática — mas protege contra uma futura re-invocação acidental duplicar/vazar instâncias.
  { const __chartExistente = Chart.getChart($('cPatrim')); if (__chartExistente) __chartExistente.destroy(); }
  window.WALLACE_CHARTS.painelPatrimonio = new Chart($('cPatrim'), {
    type:'doughnut',
    data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
      datasets:[{data:Object.values(REG.patrimonioDetalhe),
      backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
      tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
  });

  { const __chartExistente = Chart.getChart($('cVisa')); if (__chartExistente) __chartExistente.destroy(); }
  new Chart($('cVisa'), {
    type:'doughnut',
    data:{labels:VISA_DETALHE_LABELS,
      datasets:[{data:Object.values(REG.visaDetalhe),
      backgroundColor:VISA_DETALHE_CORES,
      borderColor:'#16181b',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
      plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
      tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
  });

  { const __chartExistente = Chart.getChart($('cVisaMB')); if (__chartExistente) __chartExistente.destroy(); }
  new Chart($('cVisaMB'), {
    type:'doughnut',
    data:{labels:['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa'],
      datasets:[{data:Object.values(REG.mbDetalhe),
      backgroundColor:['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0'],
      borderColor:'#16181b',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
      plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
      tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
  });

  { const __chartExistente = Chart.getChart($('cVariavel')); if (__chartExistente) __chartExistente.destroy(); }
  window.WALLACE_CHARTS.painelCaixaVariavel = new Chart($('cVariavel'), {
    type:'bar',
    plugins:[barValuePlugin],
    data:{labels:['Saldo real','Comprometido','Disponível'],
      datasets:[{data:[REG.caixaVariavel.saldoReal,REG.caixaVariavel.comprometido,REG.caixaVariavel.disponivel],
      backgroundColor:['#3987e5','#e8a63a','#34c98a'],borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:20}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}}}}
  });

  // CORRIGIDO 10/08/2026 (achado do usuário: "todos os gráficos devem pegar o valor do mesmo lugar,
  // não pode haver dois divergentes"): este é o SEGUNDO par de gráficos "Total Operacional"/
  // "Necessidade Líquida" do sistema — canvases cEvol/cNecessidadeLiquida no Painel principal (aba
  // que abre por padrão), diferente de g_cEvol/g_cNecessidadeLiquida (aba Cenários,
  // graficos-cenarios-lazy.js). Os dois pares leem a MESMA fonte (REG.evolucao, derivado só dentro
  // de recalcularNecessidade()) — single source of truth já garantido — mas cada canvas tinha seu
  // próprio Chart.js criado 1x e nunca atualizado. Guardado em window.WALLACE_CHARTS (mesmo padrão
  // de graficos-cenarios-lazy.js) pra atualizarGraficosNecessidade() conseguir atualizar os DOIS
  // pares juntos sempre que REG.evolucao mudar (hoje: provMP pós-Onda5, déficit de caixas sem LREI).
  window.WALLACE_CHARTS = window.WALLACE_CHARTS || {};

  const totalOpSeries = alignSeriesCiclo(REG.evolucao.totalOperacional); // V165: baseado no ciclo financeiro (25-24)
  const totalOpRange = yRange(totalOpSeries);
  { const __chartExistente = Chart.getChart($('cEvol')); if (__chartExistente) __chartExistente.destroy(); }
  window.WALLACE_CHARTS.painelTotalOperacional = new Chart($('cEvol'), {
    type:'line',
    plugins:[valueLeaderPlugin],
    data:{labels:gerarMesesCiclo(12),
      datasets:[{data:totalOpSeries,
      borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
      borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
      pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
    // CORRIGIDO 10/08/2026 (achado do usuário: "gráficos de necessidade e evolução cortando os
    // últimos valores") - o último ponto fica exatamente na borda direita do canvas, sem espaço
    // pro rótulo de valor (valueLeaderPlugin, desenhado do lado de fora do ponto) não ser cortado.
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40,right:32}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:grid},min:totalOpRange.min,max:totalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
  });

  const necLiqSeries = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V163: baseado no ciclo financeiro
  const necLiqRange = yRange(necLiqSeries);
  { const __chartExistente = Chart.getChart($('cNecessidadeLiquida')); if (__chartExistente) __chartExistente.destroy(); }
  window.WALLACE_CHARTS.painelNecessidadeLiquida = new Chart($('cNecessidadeLiquida'), {
    type:'line',
    plugins:[valueLeaderPlugin],
    data:{labels:gerarMesesCiclo(12),
      datasets:[{data:necLiqSeries,
      borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
      borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
      pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40,right:32}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:grid},min:necLiqRange.min,max:necLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
  });
}

// CORRIGIDO 10/08/2026 (achado do usuário, 2ª ocorrência do mesmo bug: card R$13.700,48 x 1º ponto
// do gráfico R$13.008 — mesma classe do achado já registrado em hydrate-deficit-caixas-sem-lrei.js,
// mas sobrevivendo mesmo depois daquele fix). Causa raiz real: atualizarGraficosNecessidade() (que
// já existia pra resolver exatamente isso) mora em graficos-cenarios-lazy.js, um módulo LAZY que só
// carrega quando o usuário abre a aba Gráficos/Cenários pela 1ª vez — se a sessão nunca visitou essa
// aba (caso comum: usuário fica só no Painel/home), a função nunca existe, o guard defensivo
// `typeof atualizarGraficosNecessidade === 'function'` falha silenciosamente, e os 2 gráficos do
// Painel principal (sempre visíveis, sem precisar abrir nenhuma aba) ficam congelados no valor do
// boot inicial pra sempre, mesmo depois de aplicarDeficitCaixasSemLrei()/provMP recalcularem
// REG.evolucao de verdade. Esta função replica só a atualização dos 2 gráficos do Painel (não
// depende de nada lazy) — chamada em paralelo com atualizarGraficosNecessidade() nos mesmos 2 pontos
// que já chamavam ela, então a aba Cenários (se já carregada) continua sendo coberta também.
function atualizarGraficosPainelPrincipal(){
  if(!window.WALLACE_CHARTS) return;
  const atualizarSerie = (chart, serie) => {
    if(!chart) return;
    const range = yRange(serie);
    chart.data.datasets[0].data = serie;
    chart.options.scales.y.min = range.min;
    chart.options.scales.y.max = range.max;
    chart.update();
  };
  atualizarSerie(window.WALLACE_CHARTS.painelTotalOperacional, alignSeriesCiclo(REG.evolucao.totalOperacional));
  atualizarSerie(window.WALLACE_CHARTS.painelNecessidadeLiquida, alignSeriesCiclo(REG.evolucao.necessidadeLiquida));
}

// NOVO 10/08/2026 (achado do usuário na mesma varredura: "confira se todos os gráficos são
// automáticos" — mesma classe de bug do fix acima, encontrada por inspeção antes de virar
// reclamação nova). atualizarGraficoPatrimonio()/atualizarGraficoCaixaVariavel() (graficos-cenarios-
// lazy.js) já atualizavam window.WALLACE_CHARTS.painelPatrimonio/painelCaixaVariavel corretamente —
// o problema é que as próprias FUNÇÕES só existem depois que o módulo lazy carrega (usuário abriu
// Gráficos/Cenários pelo menos 1x). Sem isso, hydrate-onda4-patrimonio.js/hydrate-onda1-v2.js/
// hydrate-comprometido-caixa-variavel-v2.js chamam uma função inexistente (guard silencioso) e os 2
// gráficos do Painel ficam congelados no valor do boot, exatamente como necessidadeLiquida estava.
// Estas 2 funções replicam só a metade "Painel principal" (doughnut/bar simples, sem min/max de
// eixo pra recalcular) — chamadas em paralelo com as versões lazy nos mesmos pontos de chamada.
function atualizarGraficoPainelPatrimonio(){
  const chart = window.WALLACE_CHARTS && window.WALLACE_CHARTS.painelPatrimonio;
  if(!chart) return;
  chart.data.datasets[0].data = Object.values(REG.patrimonioDetalhe);
  chart.update();
}
function atualizarGraficoPainelCaixaVariavel(){
  const chart = window.WALLACE_CHARTS && window.WALLACE_CHARTS.painelCaixaVariavel;
  if(!chart) return;
  chart.data.datasets[0].data = [REG.caixaVariavel.saldoReal, REG.caixaVariavel.comprometido, REG.caixaVariavel.disponivel];
  chart.update();
}
