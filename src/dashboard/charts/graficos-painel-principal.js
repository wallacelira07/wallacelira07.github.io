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

  new Chart($('cPatrim'), {
    type:'doughnut',
    data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
      datasets:[{data:Object.values(REG.patrimonioDetalhe),
      backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
      tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
  });

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

  new Chart($('cVariavel'), {
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

  const totalOpSeries = alignSeriesCiclo(REG.evolucao.totalOperacional); // V165: baseado no ciclo financeiro (25-24)
  const totalOpRange = yRange(totalOpSeries);
  new Chart($('cEvol'), {
    type:'line',
    plugins:[valueLeaderPlugin],
    data:{labels:gerarMesesCiclo(12),
      datasets:[{data:totalOpSeries,
      borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
      borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
      pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:grid},min:totalOpRange.min,max:totalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
  });

  const necLiqSeries = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V163: baseado no ciclo financeiro
  const necLiqRange = yRange(necLiqSeries);
  new Chart($('cNecessidadeLiquida'), {
    type:'line',
    plugins:[valueLeaderPlugin],
    data:{labels:gerarMesesCiclo(12),
      datasets:[{data:necLiqSeries,
      borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
      borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
      pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:grid},min:necLiqRange.min,max:necLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
  });
}
