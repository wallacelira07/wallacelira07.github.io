// MÓDULO: análise técnica de ativos financeiros — funções puras de matemática financeira, sem
// DOM/fetch/VARS/dependência de nada do resto do site. Recebem arrays de números ou de "velas"
// (candles) como parâmetro e devolvem arrays/objetos calculados. Espelha o estilo de
// src/solar/calculos-solares-compartilhados.js: script CLÁSSICO (não ES module, sem import/export),
// funções soltas no escopo global.
//
// Regra inegociável (pedido explícito do usuário): NUNCA fabricar/estimar dado que não existe. Este é
// um dashboard de fatos calculados, não um gerador de sinal/recomendação/previsão — o resto do sistema
// deliberadamente nunca dá conselho de investimento, e este módulo segue a mesma linha. Toda função
// que precisa de N períodos de histórico e recebe um array menor que N retorna `null` (ou array de
// `null`s nas posições sem dado suficiente) — nunca calcula com janela incompleta fingindo validade,
// nunca usa 0 como substituto de "sem dado". O histórico real disponível hoje é curto (~64 dias por
// ativo, crescendo 1 dia por dia): EMA200, por exemplo, não vai ter nenhum valor válido por muito
// tempo ainda, e isso tem que ficar explícito (null) em vez de calculado torto com poucos pontos.
//
// Formato de candle esperado pelas funções que usam mais que o fechamento:
//   { data: 'AAAA-MM-DD', abertura: number|null, maxima: number|null, minima: number|null,
//     fechamento: number, volume: number|null }
// Array ordenado do mais ANTIGO pro mais RECENTE (índice 0 = data mais antiga). Funções que só
// precisam do fechamento aceitam também um array simples de números — documentado em cada uma.

// Média Móvel Exponencial (EMA). `fechamentos` = array de números, mais antigo primeiro. Retorna
// array do MESMO tamanho, com `null` nos índices < periodo-1 (sem dado suficiente pro seed).
// Seed no índice periodo-1 = SMA simples dos primeiros `periodo` valores; daí em diante,
// ema[i] = fechamentos[i]*k + ema[i-1]*(1-k), com k = 2/(periodo+1) (multiplicador padrão de mercado).
function calcularEMA(fechamentos, periodo){
  const n = (fechamentos||[]).length;
  const resultado = new Array(n).fill(null);
  if(n < periodo) return resultado;
  const k = 2 / (periodo + 1);
  // seed: SMA simples dos primeiros `periodo` valores, alocada no índice periodo-1
  let somaSeed = 0;
  for(let i = 0; i < periodo; i++) somaSeed += fechamentos[i];
  resultado[periodo - 1] = somaSeed / periodo;
  for(let i = periodo; i < n; i++){
    resultado[i] = fechamentos[i] * k + resultado[i - 1] * (1 - k);
  }
  return resultado;
}

// RSI de Wilder (o padrão de mercado — NÃO a variante de média simples). `fechamentos` = array de
// números, mais antigo primeiro. Retorna array do mesmo tamanho, `null` nos primeiros `periodo`
// índices (o primeiro RSI válido cai no índice `periodo`, pois precisa de `periodo` deltas, e o
// primeiro delta só existe a partir do índice 1).
function calcularRSI(fechamentos, periodo = 14){
  const n = (fechamentos||[]).length;
  const resultado = new Array(n).fill(null);
  if(n < periodo + 1) return resultado;
  // deltas diários: delta[i] = fechamentos[i] - fechamentos[i-1], começando em i=1
  const ganhos = new Array(n).fill(0);
  const perdas = new Array(n).fill(0);
  for(let i = 1; i < n; i++){
    const delta = fechamentos[i] - fechamentos[i - 1];
    ganhos[i] = delta > 0 ? delta : 0;
    perdas[i] = delta < 0 ? -delta : 0;
  }
  // média inicial (índice `periodo`): média simples dos primeiros `periodo` deltas (índices 1..periodo)
  let somaGanhos = 0, somaPerdas = 0;
  for(let i = 1; i <= periodo; i++){
    somaGanhos += ganhos[i];
    somaPerdas += perdas[i];
  }
  let ganhoMedio = somaGanhos / periodo;
  let perdaMedia = somaPerdas / periodo;
  resultado[periodo] = calcularRSIDeMedias(ganhoMedio, perdaMedia);
  // suavização de Wilder pra frente
  for(let i = periodo + 1; i < n; i++){
    ganhoMedio = (ganhoMedio * (periodo - 1) + ganhos[i]) / periodo;
    perdaMedia = (perdaMedia * (periodo - 1) + perdas[i]) / periodo;
    resultado[i] = calcularRSIDeMedias(ganhoMedio, perdaMedia);
  }
  return resultado;
}

// Helper interno: RS = ganhoMedio/perdaMedia (100 se perdaMedia=0, sem histórico de perda no período),
// RSI = 100 - (100/(1+RS)).
function calcularRSIDeMedias(ganhoMedio, perdaMedia){
  if(perdaMedia === 0) return 100;
  const rs = ganhoMedio / perdaMedia;
  return 100 - (100 / (1 + rs));
}

// MACD (Moving Average Convergence Divergence). `fechamentos` = array de números, mais antigo
// primeiro. Retorna { macdLine, signalLine, histogram }, todos do mesmo tamanho de `fechamentos`,
// com `null` onde não há dado suficiente. Índice mínimo válido pra macdLine = periodoLento-1; pra
// signalLine/histogram = periodoLento-1 + periodoSinal-1.
function calcularMACD(fechamentos, periodoRapido = 12, periodoLento = 26, periodoSinal = 9){
  const n = (fechamentos||[]).length;
  const macdLine = new Array(n).fill(null);
  const signalLine = new Array(n).fill(null);
  const histogram = new Array(n).fill(null);
  const emaRapida = calcularEMA(fechamentos, periodoRapido);
  const emaLenta = calcularEMA(fechamentos, periodoLento);
  for(let i = 0; i < n; i++){
    if(emaRapida[i] != null && emaLenta[i] != null){
      macdLine[i] = emaRapida[i] - emaLenta[i];
    }
  }
  // signalLine = EMA de período `periodoSinal` sobre a subsérie DENSA (só valores não-nulos) de
  // macdLine, depois realocada de volta nos índices originais.
  const indicesValidos = [];
  const macdDenso = [];
  for(let i = 0; i < n; i++){
    if(macdLine[i] != null){
      indicesValidos.push(i);
      macdDenso.push(macdLine[i]);
    }
  }
  const signalDenso = calcularEMA(macdDenso, periodoSinal);
  for(let j = 0; j < indicesValidos.length; j++){
    if(signalDenso[j] != null){
      const iOriginal = indicesValidos[j];
      signalLine[iOriginal] = signalDenso[j];
      histogram[iOriginal] = macdLine[iOriginal] - signalDenso[j];
    }
  }
  return { macdLine, signalLine, histogram };
}

// Average True Range (ATR) de Wilder. `candles` = array de objetos com `maxima`, `minima`,
// `fechamento` (mais antigo primeiro). Se ALGUM candle não tiver máxima/mínima, retorna array cheio
// de `null` com aviso no console — ATR não pode ser calculado com dado incompleto, e a série tem que
// ser tudo-ou-nada (não dá pra "pular" um TR no meio sem quebrar a suavização de Wilder que depende
// do valor anterior). Retorna array do mesmo tamanho de `candles`, `null` nos primeiros `periodo`
// índices (seed no índice `periodo`, pois usa TR dos índices 0..periodo-1).
function calcularATR(candles, periodo = 14){
  const n = (candles||[]).length;
  const resultado = new Array(n).fill(null);
  const temDadoCompleto = (candles||[]).every(c => c && c.maxima != null && c.minima != null && c.fechamento != null);
  if(!temDadoCompleto){
    console.warn('calcularATR: ATR precisa de máxima/mínima, dado incompleto');
    return resultado;
  }
  if(n < periodo + 1) return resultado;
  const tr = new Array(n);
  tr[0] = candles[0].maxima - candles[0].minima;
  for(let i = 1; i < n; i++){
    const c = candles[i], fechAnterior = candles[i - 1].fechamento;
    tr[i] = Math.max(
      c.maxima - c.minima,
      Math.abs(c.maxima - fechAnterior),
      Math.abs(c.minima - fechAnterior)
    );
  }
  // seed no índice `periodo`: média simples dos primeiros `periodo` TRs (índices 0..periodo-1)
  let somaSeed = 0;
  for(let i = 0; i < periodo; i++) somaSeed += tr[i];
  resultado[periodo] = somaSeed / periodo;
  for(let i = periodo + 1; i < n; i++){
    resultado[i] = (resultado[i - 1] * (periodo - 1) + tr[i]) / periodo;
  }
  return resultado;
}

// Bandas de Bollinger. `fechamentos` = array de números, mais antigo primeiro. Retorna
// { media, superior, inferior }, `null` nos primeiros periodo-1 índices. Desvio padrão POPULACIONAL
// (divide por N, não por N-1) — é o padrão usado nas Bandas de Bollinger clássicas.
function calcularBollinger(fechamentos, periodo = 20, desvios = 2){
  const n = (fechamentos||[]).length;
  const media = new Array(n).fill(null);
  const superior = new Array(n).fill(null);
  const inferior = new Array(n).fill(null);
  for(let i = periodo - 1; i < n; i++){
    const janela = fechamentos.slice(i - periodo + 1, i + 1);
    const m = janela.reduce((s, v) => s + v, 0) / periodo;
    const variancia = janela.reduce((s, v) => s + (v - m) * (v - m), 0) / periodo; // populacional
    const dp = Math.sqrt(variancia);
    media[i] = m;
    superior[i] = m + desvios * dp;
    inferior[i] = m - desvios * dp;
  }
  return { media, superior, inferior };
}

// On-Balance Volume (OBV). `candles` = array de objetos com `fechamento` e `volume` (mais antigo
// primeiro). Se algum `volume` for null, retorna array cheio de `null` com aviso no console (mesma
// lógica do ATR: OBV é cumulativo, não dá pra "pular" um dia sem quebrar a série inteira a partir
// dali). Retorna array do mesmo tamanho.
function calcularOBV(candles){
  const n = (candles||[]).length;
  const resultado = new Array(n).fill(null);
  const temVolumeCompleto = (candles||[]).every(c => c && c.volume != null);
  if(!temVolumeCompleto){
    console.warn('calcularOBV: OBV precisa de volume em todos os candles, dado incompleto');
    return resultado;
  }
  if(n === 0) return resultado;
  resultado[0] = 0;
  for(let i = 1; i < n; i++){
    const fechAtual = candles[i].fechamento, fechAnterior = candles[i - 1].fechamento;
    if(fechAtual > fechAnterior) resultado[i] = resultado[i - 1] + candles[i].volume;
    else if(fechAtual < fechAnterior) resultado[i] = resultado[i - 1] - candles[i].volume;
    else resultado[i] = resultado[i - 1];
  }
  return resultado;
}

// APROXIMAÇÃO — NÃO é VWAP intraday real (que usaria cada negócio do dia). Este sistema só tem 1
// candle por dia (fechamento diário), então isso é uma aproximação: preço típico ponderado por
// volume numa janela rolante de N dias. NUNCA chamar isso de "VWAP" puro em nenhum lugar da UI —
// sempre qualificar como "aproximado (diário)" ou equivalente, pra não confundir com o VWAP intraday
// real que traders esperam.
// `candles` = array de objetos com `maxima`, `minima`, `fechamento`, `volume` (mais antigo primeiro).
// Preço típico do candle i = (maxima[i]+minima[i]+fechamento[i])/3; se maxima/minima faltarem nesse
// candle específico, cai pro fallback de usar só fechamento[i] como preço típico (documentado aqui,
// não é erro). Se algum `volume` for null dentro da janela de um índice, esse índice fica null.
// Retorna array do mesmo tamanho, null se i < janela-1.
function calcularVWAPAproximado(candles, janela = 20){
  const n = (candles||[]).length;
  const resultado = new Array(n).fill(null);
  for(let i = janela - 1; i < n; i++){
    let somaNumerador = 0, somaVolume = 0, janelaValida = true;
    for(let j = i - janela + 1; j <= i; j++){
      const c = candles[j];
      if(!c || c.volume == null){ janelaValida = false; break; }
      const precoTipico = (c.maxima != null && c.minima != null) ? (c.maxima + c.minima + c.fechamento) / 3 : c.fechamento;
      somaNumerador += precoTipico * c.volume;
      somaVolume += c.volume;
    }
    if(!janelaValida || somaVolume === 0){ resultado[i] = null; continue; }
    resultado[i] = somaNumerador / somaVolume;
  }
  return resultado;
}

// Volume relativo: volume[i] / SMA(volume, periodo)[i]. Um valor de 1.5 significa "50% acima da
// média de volume dos últimos N dias"; 0.5 significa "metade da média". `candles` = array de objetos
// com `volume` (mais antigo primeiro). Null se algum volume for null dentro da janela, ou i < periodo-1.
function calcularVolumeRelativo(candles, periodo = 20){
  const n = (candles||[]).length;
  const resultado = new Array(n).fill(null);
  for(let i = periodo - 1; i < n; i++){
    const janela = candles.slice(i - periodo + 1, i + 1);
    if(janela.some(c => !c || c.volume == null)) continue;
    const media = janela.reduce((s, c) => s + c.volume, 0) / periodo;
    if(media === 0) continue;
    resultado[i] = candles[i].volume / media;
  }
  return resultado;
}

// Helper: último elemento não-null de um array. Retorna null se o array estiver vazio ou todo null.
function ultimoValorValido(array){
  if(!array || !array.length) return null;
  for(let i = array.length - 1; i >= 0; i--){
    if(array[i] != null) return array[i];
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Funções puras, sem side-effect, sem rede/DOM — quem chama é responsável por buscar os dados
// (WallaceFinanceService.getCotacoesAcoesHistorico) e formatar no shape de candle esperado
// ({ data, abertura, maxima, minima, fechamento, volume }, mais antigo primeiro).
// ---------------------------------------------------------------------------------------------------
