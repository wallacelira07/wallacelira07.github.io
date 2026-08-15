// MÓDULO: hydrate-wwi.js — aba permanente "🧠 Wealth Intelligence" (WWI Fase 2C)
// NOVO 15/08/2026, pedido explícito do usuário: "o WWI passa a ser a fonte primária, o PDF passa a
// ser a saída". Carregado sob demanda (carregarWwiSobDemanda(), ui-navegacao-basica.js) toda vez
// que a aba #wwi é aberta — nunca no boot síncrono, nunca depende do botão de gerar relatório.
// Fonte 100% SQL (historico_relatorios + vw_wwi_comparativo_mensal + vw_wwi_metricas_historico +
// vw_wwi_score_historico), nunca DOM — diferente de gerar-analise-financeira.js (que lê o painel
// ao vivo). Mesma regra de sempre: histórico insuficiente = estado explícito ("histórico em
// construção"), nunca tendência/gráfico fabricado (WWI_FASE2_PROPOSTA_ARQUITETURA.md, seção 4).
//
// Script clássico (não ES module) — depende de $, fmt, Chart (já carregados por app.js/Chart.js
// no boot) e de WallaceFinanceService (app.js). Nenhuma fórmula é recalculada aqui — só leitura e
// apresentação do que os jobs Python/SQL já calcularam.

var WWI_DASHBOARD_JA_INICIALIZOU = false;

function _wwiFmtPct(n, casas){
  if(n === null || n === undefined || Number.isNaN(n)) return '—';
  casas = casas === undefined ? 2 : casas;
  return Number(n).toLocaleString('pt-BR', {minimumFractionDigits:casas, maximumFractionDigits:casas}) + '%';
}

function _wwiFmtDelta(n, sufixo){
  if(n === null || n === undefined || Number.isNaN(n)) return 'Histórico em construção';
  const sinal = n > 0 ? '+' : '';
  return sinal + Number(n).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) + (sufixo || '');
}

function _wwiDestruirGrafico(canvasId){
  const el = $(canvasId);
  if(!el) return null;
  const existente = Chart.getChart(el);
  if(existente) existente.destroy();
  return el;
}

// Filtra as linhas de vw_wwi_metricas_historico pra 1 métrica, já ordenadas por competência asc.
function _wwiSeriePorMetrica(metricas, nomeMetrica){
  return metricas.filter(function(m){ return m.metrica === nomeMetrica; })
    .sort(function(a, b){ return a.competencia < b.competencia ? -1 : 1; });
}

async function initWwiDashboard(){
  const t = (id, v) => { const el = $(id); if(el) el.textContent = v; };
  const avisar = (id, msg) => { const el = $(id); if(el) el.textContent = msg || ''; };

  let historico, metricas, comparativoMensal, scoreHistorico;
  try {
    [historico, metricas, comparativoMensal, scoreHistorico] = await Promise.all([
      WallaceFinanceService.getWwiHistoricoCompleto(),
      WallaceFinanceService.getWwiMetricasHistorico(),
      WallaceFinanceService.getWwiComparativoMensal(),
      WallaceFinanceService.getWwiScoreHistorico(),
    ]);
  } catch(err){
    console.error('WWI Dashboard: falha ao buscar dados.', err);
    avisar('wwiAviso', 'Não foi possível carregar os dados do WWI agora — tenta de novo em alguns segundos.');
    return;
  }

  if(!historico || !historico.length){
    avisar('wwiAviso', 'Nenhuma competência fechada ainda — o WWI passa a ter dados assim que o job mensal rodar pela 1ª vez (ver docs/decisions/WWI_ROADMAP_V1.md).');
    return;
  }

  const atual = historico[0]; // já vem ordenado desc (competencia.desc)
  const b = (atual.dados_json && atual.dados_json.indicadoresBrutos) || {};
  const narrativa = atual.analise_ia || {};

  // ===== 01. Resumo Executivo =====
  t('wwiCompetenciaRef', atual.competencia);
  t('wwiKpiScore', atual.score !== null && atual.score !== undefined ? Math.round(atual.score) + '/100' : '—');
  t('wwiKpiPatrimonio', b.patrimonioLiquido != null ? fmt(b.patrimonioLiquido) : '—');
  t('wwiKpiPatrimonioFin', b.patrimonioFinanceiro != null ? fmt(b.patrimonioFinanceiro) : '—');
  t('wwiKpiReserva', b.reserva != null ? fmt(b.reserva) : '—');
  t('wwiResumoTexto', narrativa.resumoAberturaTexto || narrativa.parecerFinalTexto || 'Narrativa ainda não disponível para esta competência.');
  avisar('wwiAviso', historico.length === 1 ? 'Histórico em construção — só 1 competência fechada até agora. Comparativos M/M·T/T·A/A aparecem a partir da 2ª.' : '');

  // ===== 02. Evolução Patrimonial =====
  const serieComparativo = (comparativoMensal || []).slice().sort(function(a, b2){ return a.competencia < b2.competencia ? -1 : 1; });
  const atualComparativo = (comparativoMensal || []).find(function(c){ return c.competencia === atual.competencia; }) || {};
  _wwiDestruirGrafico('cWwiPatrimonio');
  if(serieComparativo.length){
    new Chart($('cWwiPatrimonio'), {
      type: 'line',
      data: {
        labels: serieComparativo.map(function(c){ return c.competencia; }),
        datasets: [{
          label: 'Patrimônio Líquido',
          data: serieComparativo.map(function(c){ return c.patrimonio_liquido; }),
          borderColor: '#34c98a', backgroundColor: 'rgba(52,201,138,0.12)', fill: true, tension: 0.25,
        }],
      },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:function(c){ return ' '+fmt(c.raw); }}} },
        scales:{ y:{ticks:{callback:function(v){ return fmt(v); }}} } },
    });
  }
  t('wwiPatrimonioMom', _wwiFmtDelta(atualComparativo.delta_patrimonio_mom_pct, '%'));
  t('wwiPatrimonioQoq', atualComparativo.delta_patrimonio_qoq != null ? fmt(atualComparativo.delta_patrimonio_qoq) : 'Histórico em construção');
  t('wwiPatrimonioYoy', atualComparativo.delta_patrimonio_yoy != null ? fmt(atualComparativo.delta_patrimonio_yoy) : 'Histórico em construção');

  // ===== 03. Wealth Score Histórico =====
  const serieScore = (scoreHistorico || []).slice().sort(function(a, b2){ return a.competencia < b2.competencia ? -1 : 1; });
  const atualScore = (scoreHistorico || []).find(function(s){ return s.competencia === atual.competencia; }) || {};
  _wwiDestruirGrafico('cWwiScore');
  if(serieScore.length){
    new Chart($('cWwiScore'), {
      type: 'line',
      data: {
        labels: serieScore.map(function(s){ return s.competencia; }),
        datasets: [
          { label: 'Wealth Score', data: serieScore.map(function(s){ return s.score; }),
            borderColor: '#3987e5', backgroundColor: 'rgba(57,135,229,0.12)', fill: true, tension: 0.25 },
          { label: 'Média móvel (3)', data: serieScore.map(function(s){ return s.media_movel_3; }),
            borderColor: '#9085e9', borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0.25 },
        ],
      },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{position:'bottom', labels:{boxWidth:8, font:{size:10}}} },
        scales:{ y:{min:0, max:100} } },
    });
  }
  t('wwiScoreMelhor', atualScore.melhor_score_mesma_metodologia != null ? Math.round(atualScore.melhor_score_mesma_metodologia) : '—');
  t('wwiScorePior', atualScore.pior_score_mesma_metodologia != null ? Math.round(atualScore.pior_score_mesma_metodologia) : '—');
  t('wwiScoreMediaMovel', atualScore.media_movel_3 != null ? atualScore.media_movel_3 : 'Histórico em construção');
  const TENDENCIA_LABEL = {alta:'📈 Alta', queda:'📉 Queda', estavel:'➡️ Estável'};
  t('wwiScoreTendencia', TENDENCIA_LABEL[atualScore.tendencia] || 'Histórico em construção');

  // ===== 04. Meta do Milhão =====
  const serieMetaMilhao = _wwiSeriePorMetrica(metricas, 'metaMilhaoPct');
  const atualMetaMilhao = serieMetaMilhao.length ? serieMetaMilhao[serieMetaMilhao.length - 1] : null;
  t('wwiMetaMilhaoPct', atualMetaMilhao ? _wwiFmtPct(atualMetaMilhao.valor) : (b.metaMilhaoPct != null ? _wwiFmtPct(b.metaMilhaoPct) : '—'));
  { const elBar = $('wwiMetaMilhaoBar'); if(elBar) elBar.style.width = (atualMetaMilhao ? atualMetaMilhao.valor : (b.metaMilhaoPct || 0)) + '%'; }
  _wwiDestruirGrafico('cWwiMetaMilhao');
  if(serieMetaMilhao.length > 1){
    new Chart($('cWwiMetaMilhao'), { type:'line', data:{ labels:serieMetaMilhao.map(function(m){ return m.competencia; }),
      datasets:[{ data:serieMetaMilhao.map(function(m){ return m.valor; }), borderColor:'#e8a63a', backgroundColor:'rgba(232,166,58,0.12)', fill:true, tension:0.25 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:0, max:100}} } });
  }

  // ===== 05. Projeto Casa Nova =====
  const seriePcn = _wwiSeriePorMetrica(metricas, 'projetoCasaNovaPct');
  const serieCcn = _wwiSeriePorMetrica(metricas, 'consorcioCasaPagoPct');
  const atualPcn = seriePcn.length ? seriePcn[seriePcn.length - 1].valor : (narrativa.projetos || []).find(function(p){ return p.nome === 'Projeto casa nova'; });
  t('wwiProjetoCasaNovaPct', typeof atualPcn === 'number' ? _wwiFmtPct(atualPcn) : '—');
  const atualCcn = serieCcn.length ? serieCcn[serieCcn.length - 1].valor : b.consorcioCasaPagoPct;
  t('wwiConsorcioCasaNovaPct', atualCcn != null ? _wwiFmtPct(atualCcn) : '—');
  _wwiDestruirGrafico('cWwiCasaNova');
  if(seriePcn.length > 1 || serieCcn.length > 1){
    const labelsBase = (seriePcn.length >= serieCcn.length ? seriePcn : serieCcn).map(function(m){ return m.competencia; });
    new Chart($('cWwiCasaNova'), { type:'line', data:{ labels:labelsBase,
      datasets:[
        { label:'Projeto Casa Nova', data:seriePcn.map(function(m){ return m.valor; }), borderColor:'#3987e5', fill:false, tension:0.25 },
        { label:'Consórcio', data:serieCcn.map(function(m){ return m.valor; }), borderColor:'#34c98a', fill:false, tension:0.25 },
      ] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:8, font:{size:10}}}}, scales:{y:{min:0, max:100}} } });
  }

  // ===== 06. Liquidez =====
  const liqAnalise = narrativa.liquidezAnalise || {};
  t('wwiLiquidezClassificacao', liqAnalise.classificacao || '—');
  t('wwiLiquidezCiclos', b.liquidezCiclos != null ? b.liquidezCiclos.toFixed(1).replace('.', ',') + ' ciclos' : '—');
  t('wwiLiquidezIndependencia', liqAnalise.independenciaFinanceira != null ? _wwiFmtPct(liqAnalise.independenciaFinanceira, 1) : '—');
  const serieLiquidez = _wwiSeriePorMetrica(metricas, 'liquidezCiclos');
  const atualLiquidez = serieLiquidez.length ? serieLiquidez[serieLiquidez.length - 1] : null;
  t('wwiLiquidezMom', atualLiquidez ? _wwiFmtDelta(atualLiquidez.delta_mom_pct, '%') : 'Histórico em construção');
  _wwiDestruirGrafico('cWwiLiquidez');
  if(serieLiquidez.length > 1){
    new Chart($('cWwiLiquidez'), { type:'line', data:{ labels:serieLiquidez.map(function(m){ return m.competencia; }),
      datasets:[{ data:serieLiquidez.map(function(m){ return m.valor; }), borderColor:'#9085e9', backgroundColor:'rgba(144,133,233,0.12)', fill:true, tension:0.25 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} } });
  }

  // ===== 07. Riscos e Oportunidades =====
  function _wwiRenderLista(containerId, itens, corFallback){
    const el = $(containerId);
    if(!el) return;
    if(!itens || !itens.length){ el.innerHTML = '<div class="row" style="border:none"><span class="k" style="color:var(--text-dim)">Nenhum item neste ciclo.</span></div>'; return; }
    el.innerHTML = itens.map(function(it){
      const texto = typeof it === 'string' ? it : (it.texto || '');
      const valor = typeof it === 'object' && it.valor != null ? '<span class="v">'+fmt(it.valor)+'</span>' : '';
      return '<div class="row"><span class="k">'+texto.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</span>'+valor+'</div>';
    }).join('');
  }
  _wwiRenderLista('wwiListaRiscos', narrativa.riscosTexto);
  _wwiRenderLista('wwiListaOportunidades', narrativa.oportunidadesTexto);

  // ===== 08. Comparativos M/M · T/T · A/A =====
  function _wwiLinhaComparativo(nome, atualVal, fmtFn, deltaMom, deltaQoq, deltaYoy, sufixo){
    const f = fmtFn || fmt;
    return '<tr><td style="padding:0.35rem 0.5rem">'+nome+'</td>' +
      '<td style="text-align:right;padding:0.35rem 0.5rem">'+(atualVal != null ? f(atualVal) : '—')+'</td>' +
      '<td style="text-align:right;padding:0.35rem 0.5rem">'+_wwiFmtDelta(deltaMom, sufixo)+'</td>' +
      '<td style="text-align:right;padding:0.35rem 0.5rem">'+(deltaQoq != null ? f(deltaQoq) : 'Histórico em construção')+'</td>' +
      '<td style="text-align:right;padding:0.35rem 0.5rem">'+(deltaYoy != null ? f(deltaYoy) : 'Histórico em construção')+'</td></tr>';
  }
  function _metricaAtual(nome){
    const serie = _wwiSeriePorMetrica(metricas, nome);
    return serie.length ? serie[serie.length - 1] : null;
  }
  const mPatFin = _metricaAtual('patrimonioFinanceiro');
  const mReserva = _metricaAtual('reserva');
  const mMetaMilhao = _metricaAtual('metaMilhaoPct');
  const mLiquidez = _metricaAtual('liquidezCiclos');
  const linhasTabela = [
    _wwiLinhaComparativo('Patrimônio Líquido', b.patrimonioLiquido, fmt, atualComparativo.delta_patrimonio_mom, atualComparativo.delta_patrimonio_qoq, atualComparativo.delta_patrimonio_yoy),
    _wwiLinhaComparativo('Wealth Score', atual.score, function(v){ return String(Math.round(v)); }, atualComparativo.delta_score_mom, atualComparativo.delta_score_qoq, atualComparativo.delta_score_yoy),
    _wwiLinhaComparativo('Patrimônio Financeiro', mPatFin ? mPatFin.valor : b.patrimonioFinanceiro, fmt, mPatFin ? mPatFin.delta_mom : null, mPatFin ? mPatFin.delta_qoq : null, mPatFin ? mPatFin.delta_yoy : null),
    _wwiLinhaComparativo('Reserva de Emergência', mReserva ? mReserva.valor : b.reserva, fmt, mReserva ? mReserva.delta_mom : null, mReserva ? mReserva.delta_qoq : null, mReserva ? mReserva.delta_yoy : null),
    _wwiLinhaComparativo('Meta do Milhão (%)', mMetaMilhao ? mMetaMilhao.valor : b.metaMilhaoPct, function(v){ return _wwiFmtPct(v); }, mMetaMilhao ? mMetaMilhao.delta_mom_pct : null, mMetaMilhao ? mMetaMilhao.delta_qoq : null, mMetaMilhao ? mMetaMilhao.delta_yoy : null, '%'),
    _wwiLinhaComparativo('Liquidez (ciclos)', mLiquidez ? mLiquidez.valor : b.liquidezCiclos, function(v){ return v.toFixed(1).replace('.', ',') + ' ciclos'; }, mLiquidez ? mLiquidez.delta_mom : null, mLiquidez ? mLiquidez.delta_qoq : null, mLiquidez ? mLiquidez.delta_yoy : null),
  ].join('');
  { const elTbody = $('wwiTabelaComparativos'); if(elTbody) elTbody.innerHTML = linhasTabela; }
  avisar('wwiAvisoComparativos', historico.length < 2 ? 'M/M aparece a partir da 2ª competência fechada; T/T e A/A precisam de fechamentos de trimestre/ano distintos — "Histórico em construção" nunca é um número fabricado, é a ausência real de ponto de comparação (WWI_FASE2_PROPOSTA_ARQUITETURA.md, seção 2).' : '');

  WWI_DASHBOARD_JA_INICIALIZOU = true;
}
