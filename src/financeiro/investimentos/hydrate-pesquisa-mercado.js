// MÓDULO: "Pesquisa de mercado" — aba Opções, seção nova (22/08/2026, pedido do usuário).
//
// NOVO 22/08/2026 (pedido do usuário, depois de 3 rodadas de reformulação até chegar num escopo
// aceitável: "plataforma de análise quantitativa e observação de mercado... apenas fatos observados
// e estatísticas históricas. Nenhuma conclusão, recomendação, previsão ou sugestão operacional deve
// ser gerada"). Esta função consome analise-tecnica.js (indicadores puros) e eventos-mercado.js
// (detecção de eventos históricos + estatística de retorno pós-evento) — NENHUM dos dois módulos
// nem este arquivo emite sinal/confiança/recomendação, só números objetivos.
//
// Carregado sob demanda ao abrir a aba Opções (showMaster('opcoes'), ui-navegacao-basica.js), mesmo
// padrão do Radar de Ativos — evita o mesmo erro de performance já corrigido lá (10+ fetches
// paralelos no boot síncrono, estourando o watchdog de 20s do painel).

const PESQUISA_MERCADO_TICKERS = ['PETR4','ITUB4','VALE3','MGLU3','ITSA4','BBDC4','BBAS3','WEGE3','ABEV3','B3SA3'];
const PESQUISA_MERCADO_JANELA_DIAS = 200; // cobre todo o histórico real disponível hoje (~64 dias, crescendo) com folga

// Converte o array cru de cotacoes_acoes_historico (preco_fechamento/preco_abertura/...) pro shape
// de "candle" esperado por analise-tecnica.js/eventos-mercado.js (abertura/maxima/minima/fechamento).
function _pesquisaMercadoParaCandles(historicoBruto){
  return (historicoBruto || [])
    .slice()
    .sort((a,b) => a.data < b.data ? -1 : 1)
    .map(h => ({
      data: h.data,
      abertura: h.preco_abertura != null ? Number(h.preco_abertura) : null,
      maxima: h.preco_maximo != null ? Number(h.preco_maximo) : null,
      minima: h.preco_minimo != null ? Number(h.preco_minimo) : null,
      fechamento: Number(h.preco_fechamento),
      volume: h.volume != null ? Number(h.volume) : null,
    }));
}

// Calcula o "pacote técnico" completo de 1 ticker: indicadores (analise-tecnica.js) + eventos
// (eventos-mercado.js) + estatística histórica pós-evento. Retorna null se não houver candle nenhum.
function _pesquisaMercadoCalcularPacote(candles){
  if(!candles.length) return null;
  const fechamentos = candles.map(c => c.fechamento);

  const ema9 = calcularEMA(fechamentos, 9);
  const ema21 = calcularEMA(fechamentos, 21);
  const ema50 = calcularEMA(fechamentos, 50);
  const ema200 = calcularEMA(fechamentos, 200);
  const rsi = calcularRSI(fechamentos, 14);
  const macd = calcularMACD(fechamentos);
  const atr = calcularATR(candles, 14);
  const bollinger = calcularBollinger(fechamentos, 20, 2);
  const obv = calcularOBV(candles);
  const vwapAprox = calcularVWAPAproximado(candles, 20);
  const volumeRelativo = calcularVolumeRelativo(candles, 20);

  const eventos = []
    .concat(detectarCruzamentos(ema9, ema21, candles, 'EMA9', 'EMA21'))
    .concat(detectarCruzamentos(ema21, ema50, candles, 'EMA21', 'EMA50'))
    .concat(detectarRompimentos(candles, 20))
    .concat(detectarPullback(candles, ema21, 1.5))
    .concat(detectarCompressaoExpansaoVolatilidade(atr, candles, 60))
    .concat(detectarDivergenciaRSI(candles, rsi, 5))
    .concat(detectarEstruturaMercado(candles, 5))
    .sort((a,b) => a.index - b.index);

  const estatisticas = calcularEstatisticasHistoricas(eventos, candles, [5, 10, 20]);

  return { candles, fechamentos, ema9, ema21, ema50, ema200, rsi, macd, atr, bollinger, obv, vwapAprox, volumeRelativo, eventos, estatisticas };
}

const _PESQUISA_MERCADO_ROTULOS_EVENTO = {
  cruzamento_alta: 'Cruzamento de alta',
  cruzamento_baixa: 'Cruzamento de baixa',
  rompimento_alta: 'Rompimento de alta (20 pregões)',
  rompimento_baixa: 'Rompimento de baixa (20 pregões)',
  pullback: 'Pullback (toque na EMA21)',
  compressao_volatilidade: 'Início de compressão de volatilidade',
  expansao_volatilidade: 'Início de expansão de volatilidade',
  divergencia_alta: 'Divergência de alta (preço x RSI)',
  divergencia_baixa: 'Divergência de baixa (preço x RSI)',
  bos_alta: 'BOS de alta (continuação de estrutura)',
  bos_baixa: 'BOS de baixa (continuação de estrutura)',
  choch_alta: 'CHOCH de alta (possível mudança de estrutura)',
  choch_baixa: 'CHOCH de baixa (possível mudança de estrutura)',
};

function _pesquisaMercadoFmtNum(v, casas = 2){
  return v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function _pesquisaMercadoFmtData(iso){
  return iso ? iso.split('-').reverse().join('/') : '—';
}

// Snapshot dos indicadores do ticker selecionado — só números objetivos, "dados insuficientes"
// quando a janela exigida (ex. EMA200) ainda não existe no histórico real disponível.
function _pesquisaMercadoRenderSnapshot(pacote){
  const u = arr => ultimoValorValido(arr);
  const linha = (rotulo, valor, sufixo) => `<div><div style="font-size:var(--fs-label);color:var(--text-dim);text-transform:uppercase;letter-spacing:0.03em">${rotulo}</div><div class="v" style="font-weight:600">${valor == null ? '<span style="color:var(--text-dim);font-style:italic;font-weight:400">dados insuficientes</span>' : _pesquisaMercadoFmtNum(valor) + (sufixo||'')}</div></div>`;

  const ema9 = u(pacote.ema9), ema21 = u(pacote.ema21), ema50 = u(pacote.ema50), ema200 = u(pacote.ema200);
  const rsi = u(pacote.rsi);
  const atr = u(pacote.atr);
  const obv = u(pacote.obv);
  const vwap = u(pacote.vwapAprox);
  const volRel = u(pacote.volumeRelativo);
  const macdUltimo = pacote.macd.macdLine.length ? { linha: u(pacote.macd.macdLine), sinal: u(pacote.macd.signalLine), hist: u(pacote.macd.histogram) } : { linha:null, sinal:null, hist:null };
  const bbUltimo = { media: u(pacote.bollinger.media), superior: u(pacote.bollinger.superior), inferior: u(pacote.bollinger.inferior) };

  // Alinhamento das médias — leitura FACTUAL do estado atual, nunca previsão do que vem depois.
  let alinhamento = 'dados insuficientes';
  if(ema9 != null && ema21 != null && ema50 != null){
    if(ema9 > ema21 && ema21 > ema50) alinhamento = 'EMA9 > EMA21 > EMA50 (alinhamento de alta)';
    else if(ema9 < ema21 && ema21 < ema50) alinhamento = 'EMA9 < EMA21 < EMA50 (alinhamento de baixa)';
    else alinhamento = 'EMAs não alinhadas na mesma direção (sem tendência definida por este critério)';
  }

  return `
    <div class="grid-4" style="margin-bottom:0.7rem">
      ${linha('EMA 9', ema9)}
      ${linha('EMA 21', ema21)}
      ${linha('EMA 50', ema50)}
      ${linha('EMA 200', ema200)}
      ${linha('RSI (14)', rsi)}
      ${linha('ATR (14)', atr)}
      ${linha('Volume relativo (20d)', volRel, 'x')}
      ${linha('OBV', obv, obv==null?'':'')}
    </div>
    <div class="grid-3" style="margin-bottom:0.7rem">
      ${linha('MACD', macdUltimo.linha)}
      ${linha('Linha de sinal', macdUltimo.sinal)}
      ${linha('Histograma MACD', macdUltimo.hist)}
    </div>
    <div class="grid-3" style="margin-bottom:0.7rem">
      ${linha('Bollinger — banda superior', bbUltimo.superior)}
      ${linha('Bollinger — média (20d)', bbUltimo.media)}
      ${linha('Bollinger — banda inferior', bbUltimo.inferior)}
    </div>
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);margin-bottom:0.3rem"><strong>Alinhamento das médias (estado atual):</strong> ${alinhamento}</div>
    <div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">"Volume relativo" 20d — VWAP aproximado é rolling de N dias (não é VWAP intraday real, que exigiria negócio a negócio). Fatos do estado atual, não previsão.</div>
  `;
}

function _pesquisaMercadoRenderEventos(pacote){
  const ultimos = pacote.eventos.slice(-15).reverse();
  if(!ultimos.length){
    return '<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Nenhum evento detectado ainda no histórico disponível.</div>';
  }
  return '<div style="overflow-x:auto"><table><thead><tr><th scope="col">Data</th><th scope="col">Evento</th></tr></thead><tbody>'
    + ultimos.map(ev => `<tr><td>${_pesquisaMercadoFmtData(ev.data || ev.dataFim)}</td><td>${_PESQUISA_MERCADO_ROTULOS_EVENTO[ev.tipo] || ev.tipo}</td></tr>`).join('')
    + '</tbody></table></div>';
}

function _pesquisaMercadoRenderEstatisticas(pacote){
  const tipos = Object.keys(pacote.estatisticas);
  if(!tipos.length){
    return '<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Sem eventos suficientes ainda pra montar estatística histórica.</div>';
  }
  const linhas = [];
  tipos.forEach(tipo => {
    const porHorizonte = pacote.estatisticas[tipo];
    Object.keys(porHorizonte).forEach(horizonte => {
      const s = porHorizonte[horizonte];
      if(s.ocorrencias === 0) return;
      linhas.push(`<tr>
        <td>${_PESQUISA_MERCADO_ROTULOS_EVENTO[tipo] || tipo}</td>
        <td class="r">${horizonte} pregões</td>
        <td class="r">${s.ocorrencias}${s.amostraPequena ? ' <span style="color:var(--amber)" title="Amostra pequena (menos de 5 ocorrências) — desvio padrão e quartis pouco confiáveis">⚠</span>' : ''}</td>
        <td class="r">${s.retornoMedio>=0?'+':''}${_pesquisaMercadoFmtNum(s.retornoMedio)}%</td>
        <td class="r">${s.retornoMediano>=0?'+':''}${_pesquisaMercadoFmtNum(s.retornoMediano)}%</td>
        <td class="r">${_pesquisaMercadoFmtNum(s.desvioPadrao)}%</td>
        <td class="r">${_pesquisaMercadoFmtNum(s.retornoMinimo)}% / ${s.retornoMaximo>=0?'+':''}${_pesquisaMercadoFmtNum(s.retornoMaximo)}%</td>
      </tr>`);
    });
  });
  if(!linhas.length){
    return '<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Sem eventos suficientes ainda pra montar estatística histórica.</div>';
  }
  return '<div style="overflow-x:auto"><table><thead><tr><th scope="col">Evento</th><th scope="col" class="r">Horizonte</th><th scope="col" class="r">Ocorrências</th><th scope="col" class="r">Retorno médio</th><th scope="col" class="r">Retorno mediano</th><th scope="col" class="r">Desvio padrão</th><th scope="col" class="r">Mín / Máx</th></tr></thead><tbody>'
    + linhas.join('')
    + '</tbody></table></div>'
    + '<div style="font-size:var(--fs-2xs);color:var(--text-dim);margin-top:0.5rem;font-style:italic">Distribuição de retornos JÁ OBSERVADOS depois de ocorrências passadas deste evento — histórico puro, não é previsão de que o próximo movimento se repita.</div>';
}

// Heatmaps + comparador: 1 pacote leve (só indicadores, sem eventos/estatística — caro demais pra
// rodar em 10 tickers de uma vez) por ticker acompanhado.
function _pesquisaMercadoCalcularResumoLeve(candles){
  if(!candles.length) return null;
  const fechamentos = candles.map(c => c.fechamento);
  const ema9 = ultimoValorValido(calcularEMA(fechamentos, 9));
  const ema21 = ultimoValorValido(calcularEMA(fechamentos, 21));
  const ema50 = ultimoValorValido(calcularEMA(fechamentos, 50));
  const rsi = ultimoValorValido(calcularRSI(fechamentos, 14));
  const atr = ultimoValorValido(calcularATR(candles, 14));
  const volumeRelativo = ultimoValorValido(calcularVolumeRelativo(candles, 20));
  const precoAtual = fechamentos[fechamentos.length - 1];
  const atrPct = (atr != null && precoAtual) ? (atr / precoAtual) * 100 : null;
  let alinhamento = 'neutro';
  if(ema9 != null && ema21 != null && ema50 != null){
    if(ema9 > ema21 && ema21 > ema50) alinhamento = 'alta';
    else if(ema9 < ema21 && ema21 < ema50) alinhamento = 'baixa';
  }
  return { precoAtual, ema9, ema21, ema50, rsi, atrPct, volumeRelativo, alinhamento };
}

function _pesquisaMercadoRenderComparadorEHeatmaps(resumosPorTicker){
  const validos = PESQUISA_MERCADO_TICKERS.filter(t => resumosPorTicker[t]);
  if(!validos.length) return '';

  // Heatmap de volatilidade e de volume usam comparação CRUZADA entre os 10 (tercis) — não é
  // percentil histórico de cada ativo contra si mesmo, é só "onde este ativo está HOJE em relação
  // aos outros 9 acompanhados", leitura factual instantânea, não temporal/preditiva.
  const atrPcts = validos.map(t => resumosPorTicker[t].atrPct).filter(v => v != null).sort((a,b)=>a-b);
  const volRels = validos.map(t => resumosPorTicker[t].volumeRelativo).filter(v => v != null).sort((a,b)=>a-b);
  const tercil = (valor, ordenados) => {
    if(valor == null || !ordenados.length) return null;
    const pos = ordenados.filter(v => v <= valor).length / ordenados.length;
    return pos <= 0.33 ? 'baixo' : (pos >= 0.67 ? 'alto' : 'medio');
  };
  const corTrend = { alta: 'rgba(53,209,153,0.25)', baixa: 'rgba(239,91,86,0.25)', neutro: 'rgba(255,255,255,0.05)' };
  const corTercil = { baixo: 'rgba(76,142,242,0.15)', medio: 'rgba(255,255,255,0.05)', alto: 'rgba(234,168,63,0.28)', null: 'rgba(255,255,255,0.05)' };

  const heatmapCell = (ticker, cor, textoLinha1, textoLinha2) => `<div style="background:${cor};border-radius:6px;padding:0.5rem;text-align:center"><div style="font-weight:600;font-size:var(--fs-xs)">${ticker}</div><div style="font-size:var(--fs-label);color:var(--text-mid)">${textoLinha1}</div>${textoLinha2?`<div style="font-size:var(--fs-label);color:var(--text-dim)">${textoLinha2}</div>`:''}</div>`;

  const heatmapTendencia = validos.map(t => {
    const r = resumosPorTicker[t];
    return heatmapCell(t, corTrend[r.alinhamento], r.alinhamento === 'alta' ? 'EMAs em alta' : (r.alinhamento === 'baixa' ? 'EMAs em baixa' : 'sem alinhamento'));
  }).join('');

  const heatmapVolatilidade = validos.map(t => {
    const r = resumosPorTicker[t];
    const terc = tercil(r.atrPct, atrPcts);
    return heatmapCell(t, corTercil[terc], r.atrPct != null ? _pesquisaMercadoFmtNum(r.atrPct)+'% do preço' : 'dados insuf.', terc ? `terço ${terc} entre os 10` : '');
  }).join('');

  const heatmapVolume = validos.map(t => {
    const r = resumosPorTicker[t];
    const terc = tercil(r.volumeRelativo, volRels);
    return heatmapCell(t, corTercil[terc], r.volumeRelativo != null ? _pesquisaMercadoFmtNum(r.volumeRelativo)+'x a média' : 'dados insuf.', terc ? `terço ${terc} entre os 10` : '');
  }).join('');

  const comparador = '<div style="overflow-x:auto"><table><thead><tr><th scope="col">Ativo</th><th scope="col" class="r">Preço</th><th scope="col" class="r">EMA9</th><th scope="col" class="r">EMA21</th><th scope="col" class="r">EMA50</th><th scope="col" class="r">RSI</th><th scope="col" class="r">ATR % do preço</th><th scope="col" class="r">Vol. relativo</th></tr></thead><tbody>'
    + validos.map(t => { const r = resumosPorTicker[t]; return `<tr><td>${t}</td><td class="r">${_pesquisaMercadoFmtNum(r.precoAtual)}</td><td class="r">${_pesquisaMercadoFmtNum(r.ema9)}</td><td class="r">${_pesquisaMercadoFmtNum(r.ema21)}</td><td class="r">${_pesquisaMercadoFmtNum(r.ema50)}</td><td class="r">${_pesquisaMercadoFmtNum(r.rsi)}</td><td class="r">${r.atrPct!=null?_pesquisaMercadoFmtNum(r.atrPct)+'%':'—'}</td><td class="r">${r.volumeRelativo!=null?_pesquisaMercadoFmtNum(r.volumeRelativo)+'x':'—'}</td></tr>`; }).join('')
    + '</tbody></table></div>';

  return `
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Heatmap de tendência (alinhamento de EMAs, hoje)</div>
    <div class="grid-5" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.5rem;margin-bottom:1rem">${heatmapTendencia}</div>
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Heatmap de volatilidade (ATR % do preço, comparado entre os 10 hoje)</div>
    <div class="grid-5" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.5rem;margin-bottom:1rem">${heatmapVolatilidade}</div>
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Heatmap de volume (relativo à média de 20 dias, hoje)</div>
    <div class="grid-5" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.5rem;margin-bottom:1rem">${heatmapVolume}</div>
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Comparador entre os 10 ativos acompanhados</div>
    ${comparador}
  `;
}

let _pesquisaMercadoCacheResumos = null; // memoiza os 10 resumos leves (heatmap/comparador) — só refeito quando a aba é reaberta, não a cada troca de ticker no seletor

async function aplicarPesquisaMercado(){
  const container = $('pesquisaMercadoConteudo');
  const select = $('pesquisaMercadoTickerSelect');
  if(!container || !select || typeof WallaceFinanceService === 'undefined') return;

  const hoje = new Date();
  const desde = new Date(hoje); desde.setDate(desde.getDate() - PESQUISA_MERCADO_JANELA_DIAS);
  const fmtIso = d => d.toISOString().slice(0,10);
  const desdeIso = fmtIso(desde), hojeIso = fmtIso(hoje);

  const tickerSelecionado = select.value;

  container.innerHTML = '<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Carregando…</div>';

  let historicoSelecionado;
  try {
    historicoSelecionado = await WallaceFinanceService.getCotacoesAcoesHistorico(tickerSelecionado, desdeIso, hojeIso);
  } catch(err){
    console.error('PesquisaMercado: falha ao buscar histórico de', tickerSelecionado, err);
    container.innerHTML = '<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Não consegui buscar o histórico agora. Tenta de novo em instantes.</div>';
    return;
  }
  const candlesSelecionado = _pesquisaMercadoParaCandles(historicoSelecionado);
  const pacote = _pesquisaMercadoCalcularPacote(candlesSelecionado);

  if(!pacote){
    container.innerHTML = `<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Ainda sem histórico de cotações pra ${tickerSelecionado}.</div>`;
    return;
  }

  // Resumos leves dos 10 tickers (heatmap/comparador) — busca só na 1ª vez que a aba abre nesta
  // sessão de navegação, reaproveita depois (10 fetches é custoso pra refazer a cada clique).
  if(!_pesquisaMercadoCacheResumos){
    const resumos = {};
    await Promise.all(PESQUISA_MERCADO_TICKERS.map(async ticker => {
      try {
        const historico = ticker === tickerSelecionado ? historicoSelecionado : await WallaceFinanceService.getCotacoesAcoesHistorico(ticker, desdeIso, hojeIso);
        const candles = _pesquisaMercadoParaCandles(historico);
        resumos[ticker] = _pesquisaMercadoCalcularResumoLeve(candles);
      } catch(err){
        console.error('PesquisaMercado: falha ao buscar resumo de', ticker, err);
      }
    }));
    _pesquisaMercadoCacheResumos = resumos;
  } else {
    // mantém o resumo do ticker selecionado sempre fresco (já buscamos agora mesmo)
    _pesquisaMercadoCacheResumos[tickerSelecionado] = _pesquisaMercadoCalcularResumoLeve(candlesSelecionado);
  }

  container.innerHTML = `
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Indicadores — ${tickerSelecionado} (${candlesSelecionado.length} pregões de histórico)</div>
    ${_pesquisaMercadoRenderSnapshot(pacote)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Eventos detectados (últimos 15)</div>
    ${_pesquisaMercadoRenderEventos(pacote)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Estatística histórica pós-evento</div>
    ${_pesquisaMercadoRenderEstatisticas(pacote)}
    ${_pesquisaMercadoRenderComparadorEHeatmaps(_pesquisaMercadoCacheResumos)}
  `;
}
