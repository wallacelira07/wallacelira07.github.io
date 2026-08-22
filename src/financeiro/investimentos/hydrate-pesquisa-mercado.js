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

// NOVO 22/08/2026 (pedido do usuário: "quero uma camada adicional de interpretação DESCRITIVA do
// estado atual do mercado... não é previsão, é a tradução dos indicadores pra linguagem
// compreensível"). Cada rótulo abaixo é a MESMA informação que já está nos números, só reescrita em
// palavras — nunca usa tempo futuro ("vai", "deve", "tende a"), sempre presente/passado ("está",
// "permanece", "mostrou"). Limites numéricos (ex. "força moderada" = 1-3% de distância entre EMAs)
// são escolhas objetivas declaradas aqui, não calibradas por backtest pra acertar previsão nenhuma.
function _pesquisaMercadoCalcularEstadoAtual(pacote){
  const u = arr => ultimoValorValido(arr);
  const precoAtual = u(pacote.fechamentos);
  const ema9 = u(pacote.ema9), ema21 = u(pacote.ema21), ema50 = u(pacote.ema50);
  const rsi = u(pacote.rsi);
  const macdHist = u(pacote.macd.histogram);
  const atr = u(pacote.atr);
  const volRel = u(pacote.volumeRelativo);

  // Tendência: mesmo critério de alinhamento das EMAs já mostrado no snapshot numérico.
  let tendencia = 'Indefinida (dados insuficientes)';
  if(ema9 != null && ema21 != null && ema50 != null){
    if(ema9 > ema21 && ema21 > ema50) tendencia = 'Alta';
    else if(ema9 < ema21 && ema21 < ema50) tendencia = 'Baixa';
    else tendencia = 'Lateral / sem alinhamento definido';
  }

  // Força da tendência: distância entre EMA9 e EMA50, em % do preço — quanto maior o "leque" entre
  // as médias, mais forte o movimento atual (fato geométrico, não previsão de continuidade).
  let forca = 'dados insuficientes';
  if(ema9 != null && ema50 != null && precoAtual){
    const distPct = Math.abs(ema9 - ema50) / precoAtual * 100;
    forca = distPct < 1 ? 'Fraca' : (distPct < 3 ? 'Moderada' : 'Forte');
  }

  // Momentum: RSI acima/abaixo de 50 E histograma do MACD positivo/negativo — "Positivo"/"Negativo"
  // só quando os dois concordam; "Misto" quando divergem (nenhum dos dois "vence" o outro aqui).
  let momentum = 'dados insuficientes';
  if(rsi != null && macdHist != null){
    const rsiPositivo = rsi > 50, macdPositivo = macdHist > 0;
    if(rsiPositivo && macdPositivo) momentum = 'Positivo';
    else if(!rsiPositivo && !macdPositivo) momentum = 'Negativo';
    else momentum = 'Misto (RSI e MACD divergem)';
  }

  // Volatilidade: percentil do ATR atual dentro do PRÓPRIO histórico do ativo (mesma lógica de
  // detectarCompressaoExpansaoVolatilidade, recalculada aqui só pro último ponto).
  let volatilidade = 'dados insuficientes';
  const atrValidos = pacote.atr.filter(v => v != null);
  if(atr != null && atrValidos.length >= 5){
    const ordenados = atrValidos.slice().sort((a,b)=>a-b);
    const percentil = ordenados.filter(v => v <= atr).length / ordenados.length;
    volatilidade = percentil <= 0.3 ? 'Baixa (perto do menor ATR do histórico do ativo)' : (percentil >= 0.7 ? 'Alta (perto do maior ATR do histórico do ativo)' : 'Média');
  }

  // Volume: relativo à média móvel de 20 dias do próprio ativo.
  let volume = 'dados insuficientes';
  if(volRel != null){
    volume = volRel > 1.2 ? 'Acima da média' : (volRel < 0.8 ? 'Abaixo da média' : 'Neutro (perto da média)');
  }

  // Estrutura de mercado: último evento BOS/CHOCH detectado no histórico — puramente o que já
  // aconteceu, nunca "vai romper" ou qualquer coisa no futuro.
  const eventosEstrutura = pacote.eventos.filter(e => e.tipo.startsWith('bos_') || e.tipo.startsWith('choch_'));
  const ultimoEventoEstrutura = eventosEstrutura.length ? eventosEstrutura[eventosEstrutura.length - 1] : null;
  let estrutura = 'Sem evento de estrutura (BOS/CHOCH) registrado ainda no histórico disponível';
  if(ultimoEventoEstrutura){
    const mapa = { bos_alta: 'Último evento: continuação de alta (BOS)', bos_baixa: 'Último evento: continuação de baixa (BOS)', choch_alta: 'Último evento: possível mudança pra alta (CHOCH)', choch_baixa: 'Último evento: possível mudança pra baixa (CHOCH)' };
    estrutura = `${mapa[ultimoEventoEstrutura.tipo]}, em ${_pesquisaMercadoFmtData(ultimoEventoEstrutura.data)}`;
  }

  // Resumo em prosa — só concatena os mesmos fatos acima em frases, tempo presente/passado.
  const partes = [];
  if(tendencia === 'Alta') partes.push('O ativo está posicionado acima das principais médias móveis, com as médias mais curtas acima das mais longas.');
  else if(tendencia === 'Baixa') partes.push('O ativo está posicionado abaixo das principais médias móveis, com as médias mais curtas abaixo das mais longas.');
  else partes.push('As médias móveis do ativo não estão alinhadas numa direção única no momento.');
  if(momentum === 'Positivo') partes.push('O RSI está acima de 50 e o histograma do MACD é positivo — momentum de curto prazo positivo pelos dois critérios.');
  else if(momentum === 'Negativo') partes.push('O RSI está abaixo de 50 e o histograma do MACD é negativo — momentum de curto prazo negativo pelos dois critérios.');
  else if(momentum === 'Misto (RSI e MACD divergem)') partes.push('RSI e MACD não concordam entre si no momento (momentum misto).');
  if(volatilidade.startsWith('Alta')) partes.push('A volatilidade atual (ATR) está entre as mais altas do histórico do próprio ativo.');
  else if(volatilidade.startsWith('Baixa')) partes.push('A volatilidade atual (ATR) está entre as mais baixas do histórico do próprio ativo.');
  partes.push(volume === 'Acima da média' ? 'O volume negociado está acima da média dos últimos 20 dias.' : (volume === 'Abaixo da média' ? 'O volume negociado está abaixo da média dos últimos 20 dias.' : 'O volume negociado está próximo da média dos últimos 20 dias.'));
  partes.push(ultimoEventoEstrutura ? `Em estrutura de mercado, o evento mais recente registrado foi: ${mapaEstruturaTexto(ultimoEventoEstrutura.tipo)}.` : 'Nenhum evento de estrutura de mercado (BOS/CHOCH) foi detectado ainda no histórico disponível.');
  const resumo = partes.join(' ');

  return { tendencia, forca, momentum, volatilidade, volume, estrutura, resumo };
}
function mapaEstruturaTexto(tipo){
  return { bos_alta: 'continuação de alta', bos_baixa: 'continuação de baixa', choch_alta: 'possível mudança de estrutura pra alta', choch_baixa: 'possível mudança de estrutura pra baixa' }[tipo] || tipo;
}

function _pesquisaMercadoRenderEstadoAtual(pacote){
  const e = _pesquisaMercadoCalcularEstadoAtual(pacote);
  const corTendencia = e.tendencia === 'Alta' ? 'var(--green)' : (e.tendencia === 'Baixa' ? 'var(--red)' : 'var(--text-mid)');
  const item = (rotulo, valor, cor) => `<div><div style="font-size:var(--fs-label);color:var(--text-dim);text-transform:uppercase;letter-spacing:0.03em">${rotulo}</div><div class="v" style="font-weight:600${cor?';color:'+cor:''}">${valor}</div></div>`;
  return `
    <div class="grid-3" style="margin-bottom:0.7rem">
      ${item('Tendência', e.tendencia, corTendencia)}
      ${item('Força da tendência', e.forca)}
      ${item('Momentum', e.momentum, e.momentum==='Positivo'?'var(--green)':(e.momentum==='Negativo'?'var(--red)':undefined))}
      ${item('Volatilidade', e.volatilidade.split(' (')[0])}
      ${item('Volume', e.volume)}
      ${item('Estrutura de mercado', e.estrutura)}
    </div>
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);line-height:1.5;margin-bottom:0.3rem">${e.resumo}</div>
    <div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Tradução em palavras dos mesmos indicadores mostrados abaixo em número — descreve o estado atual, não prevê o que vem depois.</div>
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

// Heatmaps + comparador + rankings/filtros: 1 pacote leve por ticker acompanhado. AMPLIADO
// 22/08/2026 (pedido do usuário: "mesa de observação totalmente transparente", 8 rankings + 9
// filtros de métrica única, sem combinar nada num score) — inclui distância da EMA200, variação de
// 5/20 dias, inclinação de EMA21/EMA50, e detecção leve de eventos recentes (compressão/expansão de
// volatilidade, BOS/CHOCH) pra alimentar os filtros. Tudo calculado sobre os mesmos candles já
// buscados (sem fetch extra), custo é só matemática local.
function _pesquisaMercadoCalcularResumoLeve(candles){
  if(!candles.length) return null;
  const fechamentos = candles.map(c => c.fechamento);
  const n = candles.length;
  const ema9Arr = calcularEMA(fechamentos, 9);
  const ema21Arr = calcularEMA(fechamentos, 21);
  const ema50Arr = calcularEMA(fechamentos, 50);
  const ema200Arr = calcularEMA(fechamentos, 200);
  const ema9 = ultimoValorValido(ema9Arr);
  const ema21 = ultimoValorValido(ema21Arr);
  const ema50 = ultimoValorValido(ema50Arr);
  const ema200 = ultimoValorValido(ema200Arr);
  const rsi = ultimoValorValido(calcularRSI(fechamentos, 14));
  const atrArr = calcularATR(candles, 14);
  const atr = ultimoValorValido(atrArr);
  const volumeRelativo = ultimoValorValido(calcularVolumeRelativo(candles, 20));
  const precoAtual = fechamentos[n - 1];
  const atrPct = (atr != null && precoAtual) ? (atr / precoAtual) * 100 : null;
  let alinhamento = 'neutro';
  if(ema9 != null && ema21 != null && ema50 != null){
    if(ema9 > ema21 && ema21 > ema50) alinhamento = 'alta';
    else if(ema9 < ema21 && ema21 < ema50) alinhamento = 'baixa';
  }
  const primeiro = fechamentos[0];
  const variacaoJanelaPct = primeiro ? Math.round(((precoAtual - primeiro) / primeiro) * 1000) / 10 : null;

  const distanciaEMA200Pct = (ema200 != null && precoAtual) ? Math.round(((precoAtual - ema200) / ema200) * 1000) / 10 : null;

  const variacaoNDias = (dias) => {
    if(n <= dias) return null;
    const base = fechamentos[n - 1 - dias];
    return base ? Math.round(((precoAtual - base) / base) * 1000) / 10 : null;
  };
  const variacao5d = variacaoNDias(5);
  const variacao20d = variacaoNDias(20);

  // Inclinação = variação % da própria EMA nos últimos 5 candles — quão rápido a média está se
  // deslocando, não o preço. Objetivo e comparável entre ativos.
  const inclinacaoEMA = (arr, dias = 5) => {
    if(arr.length <= dias) return null;
    const atual = arr[arr.length - 1], antigo = arr[arr.length - 1 - dias];
    if(atual == null || antigo == null || antigo === 0) return null;
    return Math.round(((atual - antigo) / Math.abs(antigo)) * 1000) / 10;
  };
  const inclinacaoEMA21 = inclinacaoEMA(ema21Arr);
  const inclinacaoEMA50 = inclinacaoEMA(ema50Arr);

  // Eventos recentes (últimos 5 pregões) pra alimentar os filtros — mesma detecção de
  // eventos-mercado.js, só olhando se o evento mais recente caiu na janela recente.
  const eventosVol = detectarCompressaoExpansaoVolatilidade(atrArr, candles, 60);
  const ultimoEventoVol = eventosVol.length ? eventosVol[eventosVol.length - 1] : null;
  const expansaoVolatilidadeRecente = !!(ultimoEventoVol && ultimoEventoVol.tipo === 'expansao_volatilidade' && ultimoEventoVol.index >= n - 5);
  const compressaoVolatilidadeRecente = !!(ultimoEventoVol && ultimoEventoVol.tipo === 'compressao_volatilidade' && ultimoEventoVol.index >= n - 5);
  const eventosEstrutura = detectarEstruturaMercado(candles, 5);
  const bosRecente = eventosEstrutura.some(e => e.tipo.startsWith('bos_') && e.index >= n - 5);
  const chochRecente = eventosEstrutura.some(e => e.tipo.startsWith('choch_') && e.index >= n - 5);

  return { precoAtual, ema9, ema21, ema50, ema200, rsi, atrPct, volumeRelativo, alinhamento, variacaoJanelaPct,
    distanciaEMA200Pct, variacao5d, variacao20d, inclinacaoEMA21, inclinacaoEMA50,
    expansaoVolatilidadeRecente, compressaoVolatilidadeRecente, bosRecente, chochRecente };
}

// NOVO 22/08/2026 (pedido do usuário: "quero filtros"). Cada filtro é 1 predicado objetivo,
// aplicado sozinho — nunca combinado com outro filtro/métrica pra formar uma "pontuação".
const _PESQUISA_MERCADO_FILTROS = [
  { rotulo: 'RSI acima de 60', teste: r => r.rsi != null && r.rsi > 60 },
  { rotulo: 'RSI abaixo de 40', teste: r => r.rsi != null && r.rsi < 40 },
  { rotulo: 'Acima da EMA200', teste: r => r.distanciaEMA200Pct != null && r.distanciaEMA200Pct > 0 },
  { rotulo: 'Abaixo da EMA200', teste: r => r.distanciaEMA200Pct != null && r.distanciaEMA200Pct < 0 },
  { rotulo: 'Volume acima de 1,5x a média', teste: r => r.volumeRelativo != null && r.volumeRelativo > 1.5 },
  { rotulo: 'Expansão de volatilidade recente', teste: r => r.expansaoVolatilidadeRecente },
  { rotulo: 'Compressão de volatilidade recente', teste: r => r.compressaoVolatilidadeRecente },
  { rotulo: 'BOS recente (últimos 5 pregões)', teste: r => r.bosRecente },
  { rotulo: 'CHOCH recente (últimos 5 pregões)', teste: r => r.chochRecente },
];
function _pesquisaMercadoRenderFiltros(resumosPorTicker){
  const validos = PESQUISA_MERCADO_TICKERS.filter(t => resumosPorTicker[t]);
  const blocos = _PESQUISA_MERCADO_FILTROS.map(f => {
    const encontrados = validos.filter(t => f.teste(resumosPorTicker[t]));
    return `<div style="background:var(--surface-2,rgba(255,255,255,0.03));border-radius:6px;padding:0.6rem"><div style="font-size:var(--fs-label);color:var(--text-dim);margin-bottom:0.3rem">${f.rotulo}</div><div style="font-size:var(--fs-xs);font-weight:600">${encontrados.length ? encontrados.join(', ') : '<span style="color:var(--text-dim);font-style:italic;font-weight:400">nenhum ativo</span>'}</div></div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.6rem;margin-bottom:1rem">${blocos}</div>`;
}

// NOVO 22/08/2026 (pedido do usuário: "dashboard executivo que destaque automaticamente os
// extremos de cada métrica" — top 3 de CADA métrica isolada, sem combinar nada). Reaproveita a
// mesma lista de rankings de _pesquisaMercadoRenderRankings, só que aqui mostra top-3 lado a lado
// em vez da tabela completa.
const _PESQUISA_MERCADO_METRICAS_DESTAQUE = [
  { rotulo: 'Maior RSI', chave: 'rsi', sufixo: '' },
  { rotulo: 'Maior volume relativo', chave: 'volumeRelativo', sufixo: 'x' },
  { rotulo: 'Maior variação 5d', chave: 'variacao5d', sufixo: '%' },
  { rotulo: 'Maior variação 20d', chave: 'variacao20d', sufixo: '%' },
  { rotulo: 'Maior ATR % do preço', chave: 'atrPct', sufixo: '%' },
  { rotulo: 'Maior inclinação EMA21', chave: 'inclinacaoEMA21', sufixo: '%' },
  { rotulo: 'Maior inclinação EMA50', chave: 'inclinacaoEMA50', sufixo: '%' },
  { rotulo: 'Maior distância da EMA200', chave: 'distanciaEMA200Pct', sufixo: '%' },
];
function _pesquisaMercadoRenderDestaques(resumosPorTicker){
  const validos = PESQUISA_MERCADO_TICKERS.filter(t => resumosPorTicker[t]);
  const blocos = _PESQUISA_MERCADO_METRICAS_DESTAQUE.map(m => {
    const top3 = validos
      .filter(t => resumosPorTicker[t][m.chave] != null)
      .slice()
      .sort((a,b) => resumosPorTicker[b][m.chave] - resumosPorTicker[a][m.chave])
      .slice(0, 3);
    const lista = top3.length
      ? top3.map((t,i) => `<div>${i+1}. ${t} <span style="color:var(--text-dim)">(${resumosPorTicker[t][m.chave]>=0?'+':''}${_pesquisaMercadoFmtNum(resumosPorTicker[t][m.chave])}${m.sufixo})</span></div>`).join('')
      : '<div style="color:var(--text-dim);font-style:italic">dados insuficientes</div>';
    return `<div style="background:var(--surface-2,rgba(255,255,255,0.03));border-radius:6px;padding:0.6rem"><div style="font-size:var(--fs-label);color:var(--text-dim);margin-bottom:0.3rem;text-transform:uppercase">${m.rotulo}</div><div style="font-size:var(--fs-xs)">${lista}</div></div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.6rem;margin-bottom:1rem">${blocos}</div>`;
}

// NOVO 22/08/2026 (pedido do usuário: "quais ativos estão mais fortes/mais fracos" — SEM combinar
// indicadores diferentes num score único, que seria sinal disfarçado. Cada ranking abaixo ordena
// pela mesma métrica objetiva, JÁ mostrada crua no comparador — só reagrupada por ordem, uma
// métrica de cada vez, nunca combinada com outra).
function _pesquisaMercadoRenderRankings(resumosPorTicker){
  const validos = PESQUISA_MERCADO_TICKERS.filter(t => resumosPorTicker[t]);
  const tabelaRanking = (rotuloMetrica, chave, sufixo, decrescente) => {
    const linhas = validos
      .filter(t => resumosPorTicker[t][chave] != null)
      .slice()
      .sort((a,b) => decrescente ? resumosPorTicker[b][chave]-resumosPorTicker[a][chave] : resumosPorTicker[a][chave]-resumosPorTicker[b][chave]);
    if(!linhas.length) return `<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Sem dado suficiente pra "${rotuloMetrica}" ainda.</div>`;
    return '<div style="overflow-x:auto"><table><thead><tr><th scope="col">#</th><th scope="col">Ativo</th><th scope="col" class="r">'+rotuloMetrica+'</th></tr></thead><tbody>'
      + linhas.map((t,i) => `<tr><td>${i+1}º</td><td>${t}</td><td class="r">${resumosPorTicker[t][chave]>=0&&sufixo==='%'?'+':''}${_pesquisaMercadoFmtNum(resumosPorTicker[t][chave])}${sufixo}</td></tr>`).join('')
      + '</tbody></table></div>';
  };
  // AMPLIADO 22/08/2026 (pedido do usuário: "mesa de observação totalmente transparente" — 8
  // rankings, um por métrica isolada, nunca combinados). rotulo/chave/sufixo espelham
  // _PESQUISA_MERCADO_METRICAS_DESTAQUE (mesma fonte de verdade dos "destaques" no topo do card).
  const RANKINGS = [
    ['RSI', 'rsi', ''],
    ['Volume relativo', 'volumeRelativo', 'x'],
    ['Distância da EMA200', 'distanciaEMA200Pct', '%'],
    ['Variação 5 dias', 'variacao5d', '%'],
    ['Variação 20 dias', 'variacao20d', '%'],
    ['ATR % do preço', 'atrPct', '%'],
    ['Inclinação EMA21 (5d)', 'inclinacaoEMA21', '%'],
    ['Inclinação EMA50 (5d)', 'inclinacaoEMA50', '%'],
  ];
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:0.5rem">
      ${RANKINGS.map(([rotulo, chave, sufixo]) => `<div><div style="font-size:var(--fs-2xs);color:var(--text-dim);margin-bottom:0.4rem">Ordenado por ${rotulo} (maior primeiro)</div>${tabelaRanking(rotulo, chave, sufixo, true)}</div>`).join('')}
    </div>
    <div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Cada ranking usa 1 métrica objetiva isolada, nunca combinada com outra — não existe "força geral" ou score único neste sistema (ver nota do card).</div>
  `;
}

// Heatmap de momentum — zona do RSI (terminologia padrão: sobrevendido/neutro/sobrecomprado),
// mesma leitura que já aparece no ranking acima, só visual. Não combina com MACD nem outro
// indicador (heatmap de tendência, acima, já cobre o alinhamento das EMAs separadamente).
function _pesquisaMercadoRenderHeatmapMomentum(resumosPorTicker){
  const validos = PESQUISA_MERCADO_TICKERS.filter(t => resumosPorTicker[t]);
  const zonaRSI = rsi => {
    if(rsi == null) return { rotulo: 'dados insuf.', cor: 'rgba(255,255,255,0.05)' };
    if(rsi < 30) return { rotulo: 'sobrevendido', cor: 'rgba(76,142,242,0.28)' };
    if(rsi < 45) return { rotulo: 'fraco', cor: 'rgba(76,142,242,0.12)' };
    if(rsi <= 55) return { rotulo: 'neutro', cor: 'rgba(255,255,255,0.05)' };
    if(rsi <= 70) return { rotulo: 'forte', cor: 'rgba(53,209,153,0.15)' };
    return { rotulo: 'sobrecomprado', cor: 'rgba(53,209,153,0.28)' };
  };
  const celulas = validos.map(t => {
    const r = resumosPorTicker[t];
    const z = zonaRSI(r.rsi);
    return `<div style="background:${z.cor};border-radius:6px;padding:0.5rem;text-align:center"><div style="font-weight:600;font-size:var(--fs-xs)">${t}</div><div style="font-size:var(--fs-label);color:var(--text-mid)">RSI ${r.rsi!=null?_pesquisaMercadoFmtNum(r.rsi):'—'}</div><div style="font-size:var(--fs-label);color:var(--text-dim)">${z.rotulo}</div></div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.5rem;margin-bottom:1rem">${celulas}</div>`;
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
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Destaques automáticos (top 3 por métrica, isolados — nunca combinados)</div>
    ${_pesquisaMercadoRenderDestaques(resumosPorTicker)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Filtros por métrica</div>
    ${_pesquisaMercadoRenderFiltros(resumosPorTicker)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Rankings por métrica isolada</div>
    ${_pesquisaMercadoRenderRankings(resumosPorTicker)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Heatmap de tendência (alinhamento de EMAs, hoje)</div>
    <div class="grid-5" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.5rem;margin-bottom:1rem">${heatmapTendencia}</div>
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Heatmap de momentum (zona do RSI, hoje)</div>
    ${_pesquisaMercadoRenderHeatmapMomentum(resumosPorTicker)}
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
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem">Estado atual — ${tickerSelecionado} (${candlesSelecionado.length} pregões de histórico)</div>
    ${_pesquisaMercadoRenderEstadoAtual(pacote)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Indicadores em número</div>
    ${_pesquisaMercadoRenderSnapshot(pacote)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Eventos detectados (últimos 15)</div>
    ${_pesquisaMercadoRenderEventos(pacote)}
    <div style="font-size:var(--fs-2xs);color:var(--text-mid);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin:1rem 0 0.5rem">Estatística histórica pós-evento</div>
    ${_pesquisaMercadoRenderEstatisticas(pacote)}
    ${_pesquisaMercadoRenderComparadorEHeatmaps(_pesquisaMercadoCacheResumos)}
  `;
}
