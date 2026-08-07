// MÓDULO: utilitários de gráfico — janelas de meses/ciclo, alinhamento de séries, yRange, plugins
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carrega
// ANTES do app.js (não depois) — várias partes do app.js (a IIFE que cria os gráficos do Painel
// principal, ~linha 5390) chamam yRange/alignSeriesCiclo/gerarMesesCiclo/barValuePlugin no MEIO da
// própria execução síncrona do app.js, precisam já existir nesse ponto. Zero dependência de VARS/REG
// no momento em que este módulo carrega (só datas/matemática pura + Chart.js) — só usa `fmt`, que é
// referenciado de dentro de um callback do Chart.js (lazy, roda bem depois, quando fmt já existe).
// Nenhuma fórmula ou comportamento foi alterado, só o arquivo que hospeda o código.

function yRange(data, padPct=0.12){
  const vals = data.filter(v=>typeof v==='number' && !isNaN(v));
  if(!vals.length) return {min:undefined, max:undefined};
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const range = (mx-mn) || Math.abs(mx) || 1;
  const pad = range*padPct;
  const step = mx >= 5000 ? 100 : mx >= 500 ? 10 : 1;
  return { min: Math.max(0, Math.floor((mn-pad)/step)*step), max: Math.ceil((mx+pad)/step)*step };
}
// Memoização (item 8 do plano de otimização) - função pura (mesma entrada = mesma saída), cache por
// chave textual dos argumentos. Sempre retorna uma cópia nova do objeto ({...cached}), nunca a mesma
// referência guardada no cache, pra nenhum código que eventualmente mexa no retorno estragar o cache.
(function(){
  const _orig = yRange, _cache = new Map();
  yRange = function(data, padPct=0.12){
    const key = JSON.stringify(data)+'|'+padPct;
    if(_cache.has(key)) return {..._cache.get(key)};
    const r = _orig(data, padPct);
    _cache.set(key, r);
    return {...r};
  };
})();

// ===== Janela rolante de 12 meses (padrao unico definido 17/07/2026, V50 item 4) =====
// Pedido do usuario: "crie o padrao de mostrar essas projecoes com 12 meses... todo mes que mudar as
// 00hs do primeiro dia do mes, empurre 1 mes a frente". gerarMeses(n) sempre comeca no MES CALENDARIO
// atual (baseado na data real do dispositivo/servidor no momento em que a pagina carrega) e gera os
// proximos n meses sequenciais - nunca hardcoded, nunca pula mes. Toda virada de mes (00h do dia 1),
// a proxima carga da pagina automaticamente desloca a janela inteira 1 mes a frente, sem intervencao.
function gerarMeses(n){
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const agora = new Date();
  const labels = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() + i, 1);
    labels.push(nomes[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2));
  }
  return labels;
}
// Memoização (item 8 do plano) - chamada com o mesmo n por vários gráficos na mesma carga de página.
(function(){
  const _orig = gerarMeses, _cache = new Map();
  gerarMeses = function(n){
    if(_cache.has(n)) return _cache.get(n).slice();
    const r = _orig(n);
    _cache.set(n, r);
    return r.slice();
  };
})();

// V163 (pedido do usuario: "acho melhor remover automaticamente o mes pelo ciclo e nao na virada do
// mes ou de um jeito de nao causar essas mudancas" - referindo-se ao grafico Necessidade Liquida caindo
// de valor quando o mes calendario virava mas o ciclo financeiro (25→24) nao tinha virado ainda, ou
// vice-versa - descompasso causava valores "pulando" sem sentido). gerarMesesCiclo(n) gera rotulos com
// base no CICLO financeiro atual (dia 25 vira o mes), nao no mes calendario (dia 1). Rotulo do ciclo
// que comeca dia 25/07 e fecha 24/08 e "Ago/26" (mes que a fatura/pagamento realmente vence), consistente
// com o resto do sistema (Politicas secao 9: "ciclo mensal, dia 25 a 24 do mes seguinte").
function ciclosDesdeAncoraCiclo(){
  const hoje = new Date();
  const diaCicloAtual = hoje.getDate() >= 25
    ? new Date(hoje.getFullYear(), hoje.getMonth()+1, 1) // dia 25+ ja esta no ciclo do mes seguinte
    : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const [ay, am] = ANCHOR_MONTH_CICLO.split('-').map(Number);
  return (diaCicloAtual.getFullYear()-ay)*12 + (diaCicloAtual.getMonth()+1-am);
}
function gerarMesesCiclo(n){
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const hoje = new Date();
  const baseMonth = hoje.getDate() >= 25 ? hoje.getMonth()+1 : hoje.getMonth();
  const labels = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoje.getFullYear(), baseMonth + i, 1);
    labels.push(nomes[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2));
  }
  return labels;
}
// Memoização (item 8 do plano) - mesmo padrão de gerarMeses.
(function(){
  const _orig = gerarMesesCiclo, _cache = new Map();
  gerarMesesCiclo = function(n){
    if(_cache.has(n)) return _cache.get(n).slice();
    const r = _orig(n);
    _cache.set(n, r);
    return r.slice();
  };
})();
function alignSeriesCiclo(series){
  const offset = ciclosDesdeAncoraCiclo();
  if (offset <= 0) return series.slice();
  const shifted = series.slice(offset);
  while (shifted.length < series.length) shifted.push(series[series.length-1]);
  return shifted;
}
// Memoização (item 8 do plano) - chave = conteúdo da série + offset do ciclo no momento (offset não
// muda durante a sessão, mas incluído na chave por segurança, sem custo real).
(function(){
  const _orig = alignSeriesCiclo, _cache = new Map();
  alignSeriesCiclo = function(series){
    const key = ciclosDesdeAncoraCiclo()+'|'+JSON.stringify(series);
    if(_cache.has(key)) return _cache.get(key).slice();
    const r = _orig(series);
    _cache.set(key, r);
    return r.slice();
  };
})();

// ===== CORRECAO 18/07/2026 (V72, bug real apontado em auditoria externa): as series de projecao
// (evolucao.totalOperacional/necessidadeLiquida, superavitNormal, deficitZero, alivioData) sao arrays
// fixos indexados 0-11 que assumem "indice 0 = mes em que este arquivo foi gerado". gerarMeses(12)
// sempre comeca no MES CALENDARIO REAL atual - se a pagina for aberta num mes seguinte sem os arrays
// serem manualmente re-ancorados, os rotulos avancam mas os arrays nao, deslocando todo mundo (ex: o
// valor de Julho aparece rotulado como Agosto). ANCHOR_MONTH abaixo declara explicitamente a que mes
// o indice 0 de todos esses arrays corresponde HOJE. alignSeries()/alignEventos() calculam quantos
// meses ja se passaram desde essa ancora e deslocam os dados automaticamente antes de desenhar - assim,
// mesmo que ninguem atualize os arrays por 1-2 meses, o grafico nunca mostra o numero errado no mes
// errado (so fica "atrasado" - repete o ultimo valor conhecido, nunca inventa um novo).
const ANCHOR_MONTH = '2026-07'; // atualizar para o mes corrente sempre que os arrays abaixo forem recalculados manualmente
const ANCHOR_MONTH_CICLO = '2026-07'; // V163: mes do CICLO (nao calendario) em que os arrays foram recalculados - hoje (25/07/2026) ja esta no ciclo 2026-07 (25/07-24/08), que rotula como "Ago/26" no grafico
function mesesDesdeAncora(){
  const [ay, am] = ANCHOR_MONTH.split('-').map(Number);
  const agora = new Date();
  return (agora.getFullYear()-ay)*12 + (agora.getMonth()+1-am);
}
function alignSeries(series){
  const offset = mesesDesdeAncora();
  if (offset <= 0) return series.slice();
  const shifted = series.slice(offset);
  while (shifted.length < series.length) shifted.push(series[series.length-1]);
  return shifted;
}
// Memoização (item 8 do plano) - mesmo padrão de alignSeriesCiclo.
(function(){
  const _orig = alignSeries, _cache = new Map();
  alignSeries = function(series){
    const key = mesesDesdeAncora()+'|'+JSON.stringify(series);
    if(_cache.has(key)) return _cache.get(key).slice();
    const r = _orig(series);
    _cache.set(key, r);
    return r.slice();
  };
})();
function alignEventos(eventos){
  const offset = mesesDesdeAncora();
  if (offset <= 0) return Object.assign({}, eventos);
  const shifted = {};
  for (const k in eventos){
    const novoIdx = Number(k) - offset;
    if (novoIdx >= 0) shifted[novoIdx] = eventos[k];
  }
  return shifted;
}

// plugin global: rotula valor em cima/ao lado de cada barra (vertical ou horizontal) - compartilhado
// por TODOS os graficos de barra do arquivo (auditoria 16/07/2026: cVariavel era o unico grafico de
// barra sem rotulo de valor por barra, causando desalinhamento visual entre o resumo em texto acima
// e as barras abaixo, especialmente em telas estreitas onde o grid-3 empilha em 1 coluna).
const barValuePlugin = {
  id:'barValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    const horizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.fillStyle = '#e8e6df';
    ctx.font = "600 10px -apple-system, 'Segoe UI', Roboto, sans-serif";
    meta.data.forEach((bar,i)=>{
      const v = values[i];
      const label = typeof v === 'number' ? fmt(v) : v;
      if(horizontal){
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, bar.x + 6, bar.y);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(label, bar.x, bar.y - 6);
      }
    });
    ctx.restore();
  }
};
