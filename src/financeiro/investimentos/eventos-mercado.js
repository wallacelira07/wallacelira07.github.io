// MÓDULO: eventos de mercado ESTRITAMENTE HISTÓRICOS/FACTUAIS + estatísticas do que já aconteceu
// depois deles. Nenhuma função aqui prevê nada — cada "evento" é algo que já aconteceu no
// histórico de candles, e cada estatística é sobre retornos JÁ OBSERVADOS depois de ocorrências
// passadas. Ver regra do projeto: proibido qualquer campo de "sinal"/"confiança"/"força"/
// "recomendação"/"probabilidade de continuar" — só números objetivos (contagem, média, mediana,
// desvio padrão, mínimo, máximo, quartis).
//
// Script clássico (não ES module) de propósito, igual src/solar/calculos-solares-compartilhados.js
// — funções penduradas direto no escopo global, sem import/export/bundler. Só recebe arrays de
// candles e séries já prontas como parâmetro, devolve arrays/objetos. Zero DOM, zero fetch, zero
// VARS/REG.
//
// Formato de candle (mesmo do módulo irmão analise-tecnica.js, mais antigo primeiro):
// { data: 'AAAA-MM-DD', abertura, maxima, minima, fechamento, volume } — abertura/maxima/minima/
// volume podem ser null, fechamento é sempre obrigatório.
//
// Este arquivo assume que analise-tecnica.js já foi carregado antes no mesmo escopo (mesma <script>
// global) e usa as funções calcularEMA/calcularRSI/calcularMACD/calcularATR/calcularBollinger/
// calcularOBV/calcularVolumeRelativo dele quando precisar — NÃO reimplementa nenhuma delas aqui.

// ---------------------------------------------------------------------------------------------
// 1. Cruzamentos entre duas séries (ex.: EMA9 x EMA21, MACD x linha de sinal)
// ---------------------------------------------------------------------------------------------
// Cruzamento de alta = a série rápida estava <= a lenta no candle anterior e passou a ficar > no
// candle atual (o inverso pra cruzamento de baixa). Pula qualquer índice onde uma das 2 séries
// seja null (dado insuficiente pro indicador ainda, ex. começo do histórico).
function detectarCruzamentos(serieRapida, serieLenta, candles, nomeRapida, nomeLenta){
  const eventos = [];
  for(let i = 1; i < candles.length; i++){
    const rAtual = serieRapida[i], lAtual = serieLenta[i];
    const rAnterior = serieRapida[i-1], lAnterior = serieLenta[i-1];
    if(rAtual == null || lAtual == null || rAnterior == null || lAnterior == null) continue;
    if(rAnterior <= lAnterior && rAtual > lAtual){
      eventos.push({ tipo: 'cruzamento_alta', data: candles[i].data, index: i, rotulo: `${nomeRapida} cruzou acima de ${nomeLenta}` });
    } else if(rAnterior >= lAnterior && rAtual < lAtual){
      eventos.push({ tipo: 'cruzamento_baixa', data: candles[i].data, index: i, rotulo: `${nomeRapida} cruzou abaixo de ${nomeLenta}` });
    }
  }
  return eventos; // já sai ordenado por data (mais antigo primeiro) porque percorremos candles em ordem
}

// ---------------------------------------------------------------------------------------------
// 2. Rompimentos de máxima/mínima recente
// ---------------------------------------------------------------------------------------------
// Rompimento de alta no candle i = fechamento[i] supera a MAIOR máxima dos `periodo` candles
// ANTERIORES a i (sem incluir i — senão todo candle "romperia" a própria máxima do dia). Simétrico
// pra rompimento de baixa com mínimas. Precisa de janela completa de `periodo` candles antes de i
// e de maxima/minima não-nulos nesses candles; se faltar qualquer um, pula o índice.
function detectarRompimentos(candles, periodo = 20){
  const eventos = [];
  for(let i = periodo; i < candles.length; i++){
    const janela = candles.slice(i - periodo, i);
    if(janela.some(c => c.maxima == null || c.minima == null)) continue;
    const fechamento = candles[i].fechamento;
    const maiorMaximaAnterior = Math.max(...janela.map(c => c.maxima));
    const menorMinimaAnterior = Math.min(...janela.map(c => c.minima));
    if(fechamento > maiorMaximaAnterior){
      eventos.push({ tipo: 'rompimento_alta', data: candles[i].data, index: i, nivelRompido: maiorMaximaAnterior });
    } else if(fechamento < menorMinimaAnterior){
      eventos.push({ tipo: 'rompimento_baixa', data: candles[i].data, index: i, nivelRompido: menorMinimaAnterior });
    }
  }
  return eventos;
}

// ---------------------------------------------------------------------------------------------
// 3. Pullback (definição operacional, heurística — não é a única definição possível de "pullback")
// ---------------------------------------------------------------------------------------------
// Candle i é considerado "toque de pullback" quando as 3 condições abaixo são todas verdadeiras:
//   a) o fechamento está a no máximo `toleranciaPct`% de distância da série de tendência (ex.
//      EMA21) — "tocou perto da média";
//   b) o candle anterior (i-1) estava MAIS LONGE da média do que o candle i está — ou seja, o
//      preço estava se aproximando da média nesse candle (não apenas passando perto por acaso já
//      distante antes);
//   c) o candle seguinte (i+1), se existir no histórico, fechou na mesma direção da tendência
//      predominante — direção definida comparando serieTendencia[i] com serieTendencia[i-5]: se
//      subiu, tendência de alta (espera-se fechamento[i+1] > fechamento[i]); se desceu, tendência
//      de baixa (espera-se fechamento[i+1] < fechamento[i]).
// Isso é só uma forma objetiva e reproduzível de captar "recuou até a média e voltou a andar na
// direção da tendência" — outras definições (ex. usando mecha em vez de fechamento, ou uma
// tolerância diferente) são igualmente válidas e não foram escolhidas aqui por simplicidade.
function detectarPullback(candles, serieTendencia, toleranciaPct = 1.5){
  const eventos = [];
  for(let i = 5; i < candles.length - 1; i++){
    const tendAtual = serieTendencia[i], tendAnterior = serieTendencia[i-1], tendRef = serieTendencia[i-5];
    if(tendAtual == null || tendAnterior == null || tendRef == null) continue;
    const fechAtual = candles[i].fechamento, fechAnterior = candles[i-1].fechamento;
    const distAtual = Math.abs(fechAtual - tendAtual) / tendAtual * 100;
    const distAnterior = Math.abs(fechAnterior - tendAnterior) / tendAnterior * 100;
    if(distAtual > toleranciaPct) continue; // não tocou perto da média
    if(!(distAnterior > distAtual)) continue; // não estava se aproximando
    const direcaoAlta = tendAtual > tendRef;
    const direcaoBaixa = tendAtual < tendRef;
    if(!direcaoAlta && !direcaoBaixa) continue; // tendência lateral, sem direção clara
    const proximoCandle = candles[i+1];
    if(!proximoCandle) continue; // precisa do candle seguinte pra confirmar continuação
    const continuou = direcaoAlta ? proximoCandle.fechamento > fechAtual : proximoCandle.fechamento < fechAtual;
    if(continuou){
      eventos.push({ tipo: 'pullback', data: candles[i].data, index: i });
    }
  }
  return eventos;
}

// ---------------------------------------------------------------------------------------------
// 4. Compressão/expansão de volatilidade via percentil histórico do ATR
// ---------------------------------------------------------------------------------------------
// Pra cada candle i, olha a janela dos últimos `periodo` valores de ATR (ou todos disponíveis se
// o histórico for menor que `periodo`) terminando em i, e calcula em que percentil o ATR atual
// está DENTRO dessa janela. Percentil <= 20 = regime de baixa volatilidade (compressão); percentil
// >= 80 = regime de alta volatilidade (expansão). Só registra evento na BORDA da transição — ou
// seja, quando o regime muda em relação ao candle anterior — pra não repetir o mesmo evento todo
// dia enquanto o mercado permanece no mesmo regime.
function detectarCompressaoExpansaoVolatilidade(atrSerie, candles, periodo = 60){
  const eventos = [];
  let regimeAnterior = null; // 'compressao' | 'expansao' | 'neutro' | null
  for(let i = 0; i < candles.length; i++){
    if(atrSerie[i] == null) continue;
    const inicioJanela = Math.max(0, i - periodo + 1);
    const janelaBruta = atrSerie.slice(inicioJanela, i + 1).filter(v => v != null);
    if(janelaBruta.length < 2) continue; // amostra mínima pra calcular percentil ter sentido
    const ordenada = janelaBruta.slice().sort((a,b) => a - b);
    // percentil do valor atual dentro da própria janela: posição relativa entre os valores ordenados
    const posicao = ordenada.filter(v => v <= atrSerie[i]).length;
    const percentilAtual = Math.round((posicao / ordenada.length) * 100);
    let regimeAtual;
    if(percentilAtual <= 20) regimeAtual = 'compressao';
    else if(percentilAtual >= 80) regimeAtual = 'expansao';
    else regimeAtual = 'neutro';
    if(regimeAtual !== regimeAnterior && regimeAtual !== 'neutro'){
      eventos.push({
        tipo: regimeAtual === 'compressao' ? 'compressao_volatilidade' : 'expansao_volatilidade',
        data: candles[i].data,
        index: i,
        percentil: percentilAtual
      });
    }
    regimeAnterior = regimeAtual;
  }
  return eventos;
}

// ---------------------------------------------------------------------------------------------
// 5. Divergência entre preço e RSI
// ---------------------------------------------------------------------------------------------
// Topo local no índice i = fechamento[i] é o maior valor entre os candles de i-janelaSwing até
// i+janelaSwing (inclusive) — precisa de vizinhança completa dos dois lados, então pula as bordas
// do array. Fundo local = análogo com mínimo. Divergência de baixa (bearish) = dois topos locais
// CONSECUTIVOS onde o preço do 2º topo é MAIOR que o do 1º mas o RSI no 2º é MENOR que no 1º —
// preço fez topo mais alto, força (RSI) não acompanhou. Divergência de alta (bullish) = o mesmo
// raciocínio invertido com dois fundos locais consecutivos.
function detectarDivergenciaRSI(candles, rsiSerie, janelaSwing = 5){
  const topos = [];
  const fundos = [];
  for(let i = janelaSwing; i < candles.length - janelaSwing; i++){
    if(rsiSerie[i] == null) continue;
    const vizinhanca = candles.slice(i - janelaSwing, i + janelaSwing + 1);
    if(vizinhanca.some(c => c.fechamento == null)) continue;
    const fechamentoAtual = candles[i].fechamento;
    const maiorDaVizinhanca = Math.max(...vizinhanca.map(c => c.fechamento));
    const menorDaVizinhanca = Math.min(...vizinhanca.map(c => c.fechamento));
    if(fechamentoAtual === maiorDaVizinhanca){
      topos.push({ index: i, data: candles[i].data, preco: fechamentoAtual, rsi: rsiSerie[i] });
    }
    if(fechamentoAtual === menorDaVizinhanca){
      fundos.push({ index: i, data: candles[i].data, preco: fechamentoAtual, rsi: rsiSerie[i] });
    }
  }
  const eventos = [];
  for(let k = 1; k < topos.length; k++){
    const t1 = topos[k-1], t2 = topos[k];
    if(t2.preco > t1.preco && t2.rsi < t1.rsi){
      eventos.push({ tipo: 'divergencia_baixa', dataInicio: t1.data, dataFim: t2.data, indexInicio: t1.index, indexFim: t2.index });
    }
  }
  for(let k = 1; k < fundos.length; k++){
    const f1 = fundos[k-1], f2 = fundos[k];
    if(f2.preco < f1.preco && f2.rsi > f1.rsi){
      eventos.push({ tipo: 'divergencia_alta', dataInicio: f1.data, dataFim: f2.data, indexInicio: f1.index, indexFim: f2.index });
    }
  }
  eventos.sort((a,b) => a.indexFim - b.indexFim); // ordena por data (índice) de conclusão do evento
  return eventos;
}

// ---------------------------------------------------------------------------------------------
// 6. Estrutura de mercado — BOS (Break of Structure) e CHOCH (Change of Character)
// ---------------------------------------------------------------------------------------------
// Implementação simplificada e objetiva (regra fixa, não julgamento discricionário) da definição
// padrão de price action / smart money concepts. Primeiro acha todos os swing highs/lows (mesma
// definição de topo/fundo local do item 5, janela de `janelaSwing` candles pra cada lado) e monta
// a sequência cronológica alternando topo/fundo/topo/fundo... A tendência vigente em cada ponto é
// definida comparando os 2 últimos topos e os 2 últimos fundos conhecidos: se ambos topos E ambos
// fundos estão subindo = tendência de alta; se ambos estão descendo = tendência de baixa (fora
// desses 2 casos não há tendência definida o suficiente pra classificar rompimento).
//   BOS = rompimento que CONFIRMA/CONTINUA a tendência vigente (em alta: fechamento rompe acima
//   do swing high anterior; em baixa: fechamento rompe abaixo do swing low anterior).
//   CHOCH = rompimento na direção CONTRÁRIA à tendência vigente (em alta: fechamento rompe abaixo
//   do último swing low; em baixa: fechamento rompe acima do último swing high) — indício
//   objetivo (não previsão) de possível mudança de estrutura.
// Cada nível só é usado pra gerar um evento a primeira vez que é rompido (depois de romper, o
// próximo nível relevante passa a ser o swing seguinte).
function detectarEstruturaMercado(candles, janelaSwing = 5){
  // Passo 1: acha todos os swings (topo/fundo local), mesma lógica do item 5, sem depender de RSI.
  const swings = [];
  for(let i = janelaSwing; i < candles.length - janelaSwing; i++){
    const vizinhanca = candles.slice(i - janelaSwing, i + janelaSwing + 1);
    if(vizinhanca.some(c => c.fechamento == null)) continue;
    const fechamentoAtual = candles[i].fechamento;
    const maiorDaVizinhanca = Math.max(...vizinhanca.map(c => c.fechamento));
    const menorDaVizinhanca = Math.min(...vizinhanca.map(c => c.fechamento));
    if(fechamentoAtual === maiorDaVizinhanca){
      swings.push({ tipo: 'topo', index: i, data: candles[i].data, preco: fechamentoAtual });
    } else if(fechamentoAtual === menorDaVizinhanca){
      swings.push({ tipo: 'fundo', index: i, data: candles[i].data, preco: fechamentoAtual });
    }
  }

  const eventos = [];
  let ultimoTopoUsado = null; // último swing high já "consumido" como nível de referência
  let ultimoFundoUsado = null;
  const topos = [];
  const fundos = [];

  for(let i = 0; i < candles.length; i++){
    // Atualiza a lista de swings conhecidos até este ponto (sem olhar o futuro)
    const swingNesteIndex = swings.find(s => s.index === i);
    if(swingNesteIndex){
      if(swingNesteIndex.tipo === 'topo') topos.push(swingNesteIndex);
      else fundos.push(swingNesteIndex);
    }
    if(topos.length < 2 || fundos.length < 2) continue; // ainda não dá pra definir tendência

    const [tPenultimo, tUltimo] = topos.slice(-2);
    const [fPenultimo, fUltimo] = fundos.slice(-2);
    let tendencia = null;
    if(tUltimo.preco > tPenultimo.preco && fUltimo.preco > fPenultimo.preco) tendencia = 'alta';
    else if(tUltimo.preco < tPenultimo.preco && fUltimo.preco < fPenultimo.preco) tendencia = 'baixa';
    if(!tendencia) continue;

    const fechamento = candles[i].fechamento;
    if(fechamento == null) continue;

    if(tendencia === 'alta'){
      // BOS de alta: rompe acima do último swing high ainda não usado como nível
      if(ultimoTopoUsado !== tUltimo.index && fechamento > tUltimo.preco){
        eventos.push({ tipo: 'bos_alta', data: candles[i].data, index: i, nivelRompido: tUltimo.preco });
        ultimoTopoUsado = tUltimo.index;
      }
      // CHOCH de alta->baixa: rompe abaixo do último swing low (contra a tendência de alta vigente)
      if(ultimoFundoUsado !== fUltimo.index && fechamento < fUltimo.preco){
        eventos.push({ tipo: 'choch_baixa', data: candles[i].data, index: i, nivelRompido: fUltimo.preco });
        ultimoFundoUsado = fUltimo.index;
      }
    } else if(tendencia === 'baixa'){
      // BOS de baixa: rompe abaixo do último swing low ainda não usado como nível
      if(ultimoFundoUsado !== fUltimo.index && fechamento < fUltimo.preco){
        eventos.push({ tipo: 'bos_baixa', data: candles[i].data, index: i, nivelRompido: fUltimo.preco });
        ultimoFundoUsado = fUltimo.index;
      }
      // CHOCH de baixa->alta: rompe acima do último swing high (contra a tendência de baixa vigente)
      if(ultimoTopoUsado !== tUltimo.index && fechamento > tUltimo.preco){
        eventos.push({ tipo: 'choch_alta', data: candles[i].data, index: i, nivelRompido: tUltimo.preco });
        ultimoTopoUsado = tUltimo.index;
      }
    }
  }
  eventos.sort((a,b) => a.index - b.index);
  return eventos;
}

// ---------------------------------------------------------------------------------------------
// 8. Helpers estatísticos (medianas/percentis com interpolação linear) — expostos globalmente
//    também porque são úteis em outros lugares do sistema, não só aqui.
// ---------------------------------------------------------------------------------------------
function percentil(numerosOrdenados, p){
  const n = numerosOrdenados.length;
  if(n === 0) return null;
  if(n === 1) return numerosOrdenados[0];
  const idx = (p / 100) * (n - 1);
  const idxBaixo = Math.floor(idx);
  const idxAlto = Math.ceil(idx);
  if(idxBaixo === idxAlto) return numerosOrdenados[idxBaixo];
  const fracao = idx - idxBaixo;
  return numerosOrdenados[idxBaixo] + (numerosOrdenados[idxAlto] - numerosOrdenados[idxBaixo]) * fracao;
}

function mediana(numeros){
  if(!numeros || numeros.length === 0) return null;
  const ordenados = numeros.slice().sort((a,b) => a - b);
  return percentil(ordenados, 50);
}

// ---------------------------------------------------------------------------------------------
// 7. Estatísticas históricas de retorno depois de cada tipo de evento — função central do módulo.
// ---------------------------------------------------------------------------------------------
// `eventos` = qualquer combinação de arrays retornados pelas funções acima (todo evento tem
// `.tipo` e `.index`). Agrupa por tipo e, pra cada horizonte (número de candles À FRENTE do
// evento), calcula o retorno percentual fechamento[i+horizonte] vs fechamento[i] de CADA
// ocorrência passada do tipo, e resume a distribuição desses retornos já observados.
// IMPORTANTE: sempre i + horizonte (candle FUTURO em relação ao evento, dentro do histórico já
// existente) — nunca i - horizonte. Se candles[i+horizonte] não existir (evento perto demais do
// fim do histórico), essa ocorrência simplesmente não entra na amostra daquele horizonte (nunca
// insere undefined/NaN no array de retornos).
function calcularEstatisticasHistoricas(eventos, candles, horizontes = [5, 10, 20]){
  const porTipo = {};
  (eventos || []).forEach(ev => {
    if(!ev || ev.tipo == null || ev.index == null) return;
    if(!porTipo[ev.tipo]) porTipo[ev.tipo] = [];
    porTipo[ev.tipo].push(ev);
  });

  const resultado = {};
  Object.keys(porTipo).forEach(tipo => {
    resultado[tipo] = {};
    const ocorrenciasDoTipo = porTipo[tipo];
    horizontes.forEach(horizonte => {
      const retornos = [];
      ocorrenciasDoTipo.forEach(ev => {
        const candleEvento = candles[ev.index];
        const candleFuturo = candles[ev.index + horizonte];
        if(!candleEvento || !candleFuturo) return; // fora do histórico disponível, não entra na amostra
        if(candleEvento.fechamento == null || candleFuturo.fechamento == null) return;
        const retornoPct = (candleFuturo.fechamento - candleEvento.fechamento) / candleEvento.fechamento * 100;
        retornos.push(retornoPct);
      });

      const n = retornos.length;
      if(n === 0){
        resultado[tipo][horizonte] = {
          ocorrencias: 0, retornoMedio: null, retornoMediano: null, desvioPadrao: null,
          retornoMinimo: null, retornoMaximo: null, q1: null, q3: null, amostraPequena: true
        };
        return;
      }

      const ordenados = retornos.slice().sort((a,b) => a - b);
      const media = retornos.reduce((soma, v) => soma + v, 0) / n;
      const variancia = retornos.reduce((soma, v) => soma + (v - media) * (v - media), 0) / n; // populacional
      const desvioPadrao = Math.sqrt(variancia);

      resultado[tipo][horizonte] = {
        ocorrencias: n,
        retornoMedio: media,
        retornoMediano: mediana(ordenados),
        desvioPadrao,
        retornoMinimo: ordenados[0],
        retornoMaximo: ordenados[n - 1],
        q1: percentil(ordenados, 25),
        q3: percentil(ordenados, 75),
        amostraPequena: n < 5
      };
    });
  });

  return resultado;
}

// Módulo estritamente histórico/factual — cada evento é algo que JÁ aconteceu, cada estatística é
// sobre retornos JÁ observados depois de ocorrências passadas. Nunca adicionar aqui nenhum campo
// de previsão/confiança/sinal/recomendação — ver regra do projeto.
