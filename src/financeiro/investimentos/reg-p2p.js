// MÓDULO: criarRegP2P() — fragmento do REG (estado inicial) para o domínio P2P: p2p.
// Extraído do literal `const REG = {...}` de app.js na modularização (07/08/2026) — MESMOS
// valores, MESMA estrutura. IMPORTANTE: vira uma FUNÇÃO (não um objeto de topo) porque os valores
// dependem de VARS, avaliado no momento da CHAMADA — mesmo motivo de CARTAO_PLUGGY_MAPA_DEFAULT
// ser literal mas a linha derivada ficar em app.js. "Não alterar estrutura de dados consumida
// pelos módulos existentes" — os módulos de renderização/cálculo continuam lendo REG.p2p.*
// normalmente, sem nenhuma mudança de forma.
function criarRegP2P(){
  return {
    p2p: {
      capitalTotal: VARS.p2pCapitalTotal,
      creditosTotal: VARS.p2pCreditosTotal,
      creditosRestantes: VARS.p2pCreditosRestantes,
      creditosVendidos: VARS.p2pCreditosVendidos,
      precoCompra: VARS.p2pPrecoCompra,
      precoVenda: VARS.p2pPrecoVenda,
      lucroRealizado: VARS.p2pLucroRealizado,
      saldoInvestido: 0,   // DERIVADO em recalcularAgregadosDerivados() = creditosRestantes * precoCompra
      rentabilidadePct: 0  // DERIVADO = (precoVenda-precoCompra)/precoCompra*100
    }
  };
}
