// MÓDULO: recalcularP2P() — domínio P2P do motor de cálculo (recalcularAgregadosDerivados). Deriva
// o saldo investido e a rentabilidade % das Operações P2P (seção 18). Extraído de app.js na
// modularização (07/08/2026) — MESMA fórmula, MESMO resultado. Chamada logo depois de
// recalcularPatrimonio(). Depende só de VARS, nenhuma dependência de outro domínio.
function recalcularP2P(){
  const r2 = x => Math.round(x*100)/100;
  // NOVO 23/07/2026: P2P (secao 18) nunca tinha formula - saldoInvestido e rentabilidadePct eram
  // texto hardcoded, dessincronizando toda vez que um credito era vendido (V136 ja tinha corrigido o
  // ERP mas o site nunca acompanhou). Agora sempre recalculado a partir de VARS.p2pCreditosRestantes.
  REG.p2p.saldoInvestido = r2(VARS.p2pCreditosRestantes * VARS.p2pPrecoCompra);
  REG.p2p.rentabilidadePct = r2((VARS.p2pPrecoVenda - VARS.p2pPrecoCompra) / VARS.p2pPrecoCompra * 100);
}
