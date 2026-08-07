// MÓDULO: recalcularMercadoPago() — domínio Cartões/Mercado Pago do motor de cálculo
// (recalcularAgregadosDerivados). Deriva Visa (totalComprometido/pessoal) e os subtotais de
// recorrências/assinaturas de totalOpDetalhe (soma Visa+MB). Extraído de app.js na modularização
// (07/08/2026) — MESMA fórmula, MESMO resultado. Chamada logo depois de recalcularCaixas(). Depende
// de REG.operacional.reembolsoPagaCartaoCorporativo (já resincronizado no preâmbulo, antes de
// qualquer domínio rodar) e de REG.visaDetalhe/mbDetalhe (dados estáticos, não calculados aqui).
// IMPORTANTE: totalOpDetalhe.recorrencias/assinaturas precisam existir ANTES de
// recalcularNecessidade() (que lê D.recorrencias/D.assinaturas) — por isso este domínio roda cedo.
function recalcularMercadoPago(){
  const r2 = x => Math.round(x*100)/100;
  REG.visa.totalComprometido = r2(VARS.cartaoInfiniteTotal + VARS.cartaoMBTotal);
  REG.visa.pessoal = r2(REG.visa.totalComprometido - REG.operacional.reembolsoPagaCartaoCorporativo);
  // V135: recorrencias/assinaturas de totalOpDetalhe DERIVADOS da soma Visa+MB (elimina duplicacao -
  // precisa rodar ANTES do calculo de totalOperacional, em recalcularNecessidade()).
  REG.totalOpDetalhe.recorrencias = r2(REG.visaDetalhe.recorrencias + REG.mbDetalhe.recorrencias);
  REG.totalOpDetalhe.assinaturas = r2(REG.visaDetalhe.assinaturas + REG.mbDetalhe.assinaturas);
}
