// MÓDULO: Onda 4 — "Supabase como fonte única de verdade" (08/08/2026), domínio 2
// (Investimentos/ROC/Opções). Estratégia DIFERENTE dos outros domínios da Onda 4: em vez de
// reimplementar a renderização da seção 17 (tabelas de posições ativas/vencidas/exercidas, cores
// OTM/ITM, cotações ao vivo brapi.dev — ~230 linhas em hydrate-roc.js), este módulo troca só a
// ORIGEM do dado bruto (VARS.opcoesVendidasDetalhe/CDI_MENSAL_ATUAL/ROC_STATUS_LIMITES) e
// re-chama as funções V1 JÁ EXISTENTES E INALTERADAS: aplicarStatusVencidoEValorMercadoOpcoes()
// e calcularROCOpcoes() (opcoes-roc.js) pro cálculo, hydrateROC() (hydrate-roc.js) pra
// renderização. Zero lógica de negócio duplicada — as 3 funções V1 continuam sendo a ÚNICA
// implementação do cálculo/render, só passam a operar sobre dado vindo da V2.
//
// Rollback: comentar a chamada aplicarOnda4Investimentos() em app.js — VARS.opcoesVendidasDetalhe
// continua com os literais V1 (nunca sobrescritos se este módulo não rodar).

async function aplicarOnda4Investimentos(){
  let opcoesV2, cdiInd, limiteBoaInd, limiteMuitoBoaInd;
  try {
    [opcoesV2, cdiInd, limiteBoaInd, limiteMuitoBoaInd] = await Promise.all([
      WallaceFinanceService.getInvestimentosOpcoesV2(),
      WallaceFinanceService.getIndicador('CDI_MENSAL_ATUAL'),
      WallaceFinanceService.getIndicador('ROC_STATUS_LIMITES - boaAte'),
      WallaceFinanceService.getIndicador('ROC_STATUS_LIMITES - muitoBoaAte'),
    ]);
  } catch(err){
    console.error('Onda4Investimentos: falha ao buscar dados da V2 — mantendo V1 (fallback automático).', err);
    return;
  }
  if(!Array.isArray(opcoesV2) || !opcoesV2.length || !cdiInd || !limiteBoaInd || !limiteMuitoBoaInd){
    console.warn('Onda4Investimentos: resposta incompleta da V2 — mantendo V1.');
    window.WALLACE_ONDA4_INVESTIMENTOS_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const formatarDataBR = iso => { const [a,m,d] = iso.split('-'); return `${d}/${m}/${a}`; };

  // Mesmo shape de VARS.opcoesVendidasDetalhe (vars-roc.js) — só a origem do valor muda.
  const novoArray = opcoesV2.map(o => ({
    ticker: o.ticker,
    ativo: o.ativo_subjacente,
    tipo: 'Put vendida',
    valorMercado: Number(o.valor_atual),
    precoExercicio: o.preco_exercicio !== null ? Number(o.preco_exercicio) : null,
    vencimento: formatarDataBR(o.data_vencimento),
    quantidade: Number(o.quantidade),
    premioBruto: o.premio_bruto !== null ? Number(o.premio_bruto) : null,
    custoOperacional: o.custo_operacional !== null ? Number(o.custo_operacional) : null,
    premioRecebido: o.premio_recebido !== null ? Number(o.premio_recebido) : null,
    precoMedio: o.preco_medio !== null ? Number(o.preco_medio) : null,
    notaCorretagem: o.nota_corretagem,
    exercida: !!o.exercida,
  }));

  const v1TotalAntes = Math.round(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioRecebido||0),0)*100)/100;

  VARS.opcoesVendidasDetalhe = novoArray;
  VARS.CDI_MENSAL_ATUAL = Number(cdiInd.valor);
  VARS.CDI_MENSAL_ATUAL_DATA_REF = formatarDataBR(cdiInd.data_calculo);
  VARS.ROC_STATUS_LIMITES = { boaAte: Number(limiteBoaInd.valor), muitoBoaAte: Number(limiteMuitoBoaInd.valor) };

  // Reaproveita as funções V1 inalteradas — mesmo cálculo, mesma renderização, só dado novo.
  aplicarStatusVencidoEValorMercadoOpcoes();
  calcularROCOpcoes();
  hydrateROC();

  const v2Total = Math.round(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioRecebido||0),0)*100)/100;
  const diverge = Math.abs(v1TotalAntes - v2Total) > 0.01;
  if(diverge) console.warn(`Onda4Investimentos: prêmio total V1=${fmt(v1TotalAntes)} × V2=${fmt(v2Total)} — DIVERGE (inesperado, investigar).`);
  else console.log(`Onda4Investimentos: V1×V2 batem (prêmio total ${fmt(v2Total)}). V2 é a fonte exibida, hydrateROC() re-renderizado.`);

  window.WALLACE_ONDA4_INVESTIMENTOS_RELATORIO = { premioTotalV1: v1TotalAntes, premioTotalV2: v2Total, diverge, qtdPosicoes: novoArray.length, rocCarteira: VARS.rocCarteira, exibindo: 'V2' };
  console.log('Onda4Investimentos: relatório completo em window.WALLACE_ONDA4_INVESTIMENTOS_RELATORIO', window.WALLACE_ONDA4_INVESTIMENTOS_RELATORIO);
}
