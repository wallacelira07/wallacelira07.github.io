// MÓDULO: aplicarComprometidoCaixaVariavelV2() — correção real (09/08/2026, achado do usuário): o
// "Comprometido" da Caixa Variável (mbLRWConfirmado + mbLRVConfirmado + visaLRWHistorico +
// visaLRVHistorico - somaBensDuraveisComprometido, números mantidos à mão em vars-mercado-pago.js)
// misturava TUDO que Wallace/Vanessa compraram no cartão, sem distinguir gasto genérico do dia a dia
// (que É responsabilidade da Caixa Variável cobrir) de compra que já tem sua própria caixa temática
// (Bens Duráveis, Churrasco, Provisionado Wärtsilä etc — essas já são debitadas na PRÓPRIA caixa,
// contar de novo aqui duplicava o risco). O caso real que expôs isso: TX000228 (carne pro Churrasco)
// entrou tanto no saldo negativo da Caixa Churrasco (correto, cobre pela política de
// hydrate-deficit-caixas-sem-lrei.js) quanto no comprometido da Variável (errado, dupla-contagem).
//
// Regra correta (confirmada pelo usuário): "as caixas são budgets para destinar meu dinheiro por
// categoria de custo" — Comprometido = soma de compras com cartão marcadas caixa_id='Caixa Variável'
// + afeta_saldo_real=false (o padrão já usado em toda compra sem caixa própria, ex: H57Store/Uber/
// Anthropic/Panificadora). Isso é buscado ao vivo da V2 (WallaceFinanceService.
// getComprometidoCaixaVariavelV2()), substituindo o número fixo mantido à mão.
//
// Rollback: comentar a chamada onDomPronto(aplicarComprometidoCaixaVariavelV2) em app.js —
// REG.caixaVariavel.comprometido volta a vir só de VARS.caixaVariavelComprometido (V1).
async function aplicarComprometidoCaixaVariavelV2(){
  let comprometidoV2;
  try {
    comprometidoV2 = await WallaceFinanceService.getComprometidoCaixaVariavelV2();
  } catch(err){
    console.error('ComprometidoCaixaVariavelV2: falha ao buscar da V2 — mantendo o número V1 (mbLRWConfirmado/mbLRVConfirmado), pode estar inflado com compras de outras caixas.', err);
    window.WALLACE_COMPROMETIDO_CV_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(typeof comprometidoV2 !== 'number' || isNaN(comprometidoV2)){
    console.warn('ComprometidoCaixaVariavelV2: resposta inesperada da V2 — ajuste não aplicado.');
    window.WALLACE_COMPROMETIDO_CV_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  // CORRIGIDO 12/08/2026 (achado do usuário, madrugada de reconciliação): TX000132 (22/07,
  // R$56,99) e TX000154 (24/07, R$30,97) são o limbo da VIRADA ANTERIOR (24/07→25/07,
  // REGRA_LIMBO_FATURA_MB_CICLO) — corretamente excluídas do comprometido AO VIVO (data <
  // ciclo_inicio_em), mas o pré-débito manual que a regra exige na virada nunca foi feito
  // (VARS.caixaVariavelPendenteProximoCiclo ficou zerado, última atualização 23/07). Resultado:
  // R$87,96 gastos de verdade não contavam em lugar nenhum. Correção pontual, soma direto aqui -
  // não usar caixaVariavelPendenteProximoCiclo (esse é pra próxima virada, 22-24/08, ainda zerado
  // de propósito). Não repetir em ciclos futuros sem novo achado.
  const LIMBO_VIRADA_25_07_NAO_DEBITADO = 87.96;
  comprometidoV2 = Math.round((comprometidoV2 + LIMBO_VIRADA_25_07_NAO_DEBITADO) * 100) / 100;

  const comprometidoV1 = REG.caixaVariavel.comprometido;
  const diferenca = Math.round((comprometidoV1 - comprometidoV2) * 100) / 100;
  window.WALLACE_COMPROMETIDO_CV_RELATORIO = { comprometidoV1, comprometidoV2, diferenca };
  if(Math.abs(diferenca) > 0.01){
    console.warn(`ComprometidoCaixaVariavelV2: V1=${fmt(comprometidoV1)} × V2=${fmt(comprometidoV2)} — DIVERGE R$${Math.abs(diferenca).toFixed(2)} (V1 misturava compras de caixas próprias, V2 é o valor correto). Promovendo V2.`);
  } else {
    console.log(`ComprometidoCaixaVariavelV2: V1×V2 batem (${fmt(comprometidoV2)}).`);
  }

  REG.caixaVariavel.comprometido = comprometidoV2;
  // Reaproveita recalcularCaixas() (recalcular-caixas.js) - mesma fórmula, idempotente, deriva
  // disponivel/comprometidoParaTeto/folegoAteTeto a partir do comprometido já promovido acima.
  if(typeof recalcularCaixas === 'function') recalcularCaixas();

  if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
  if(typeof hydrateResumoP2P === 'function') hydrateResumoP2P();
  if(typeof hydrateResumoCartoes === 'function') hydrateResumoCartoes();
  if(typeof hydrateSimuladorCiclo === 'function') hydrateSimuladorCiclo();
  // CORRIGIDO 10/08/2026 (mesmo achado do caso Necessidade/Patrimônio): o gráfico de barras
  // cVariavel/g_cVariavel também lê REG.caixaVariavel.*, nunca era re-renderizado depois daqui.
  if(typeof atualizarGraficoCaixaVariavel === 'function') atualizarGraficoCaixaVariavel();
  // CORRIGIDO 10/08/2026: cobre o caso do módulo lazy não ter carregado — ver comentário completo
  // em atualizarGraficoPainelCaixaVariavel() (graficos-painel-principal.js).
  if(typeof atualizarGraficoPainelCaixaVariavel === 'function') atualizarGraficoPainelCaixaVariavel();
}
