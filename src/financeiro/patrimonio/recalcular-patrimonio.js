// MÓDULO: recalcularPatrimonio() — domínio Patrimônio do motor de cálculo
// (recalcularAgregadosDerivados). Deriva Patrimônio (total/metaMilhaoPct), a estrutura do Balanço
// Patrimonial (fisico/financeiro/passivos/ativosTotal/patrimonioLiquido/patrimonioTotalGeral) e as
// metas patrimoniais (Consórcio Casa Nova/Projeto Casa Nova/metasPatrimoniais). Extraído de app.js
// na modularização (07/08/2026) — MESMA fórmula, MESMO resultado. Chamada logo depois de
// recalcularMercadoPago().
//
// IMPORTANTE — por que patrimonioLiquido/ativosTotal/patrimonioTotalGeral estão AQUI e não em
// recalcularBalanco() (chamada por último): recalcularIndicadores() (PIB Wallace, domínio 7) precisa
// de REG.balanco.patrimonioLiquido para calcular o Crescimento Patrimonial — se esses campos
// esperassem até recalcularBalanco() (domínio 8, o último), indicadores não teria o valor ainda
// disponível. Como bf/bfin/bp/ativosTotal/patrimonioLiquido/patrimonioTotalGeral só dependem de VARS
// e de campos estáticos do REG (nunca de outro domínio calculado nesta função), adiantar o cálculo
// pra cá não muda nenhum resultado — só garante que "patrimônio" (que engloba ativos/passivos/
// patrimônio líquido, o núcleo do Balanço) já está pronto quando os domínios seguintes precisarem.
// O que sobra pra recalcularBalanco() são só os campos que realmente dependem de outros domínios
// (necessidade/entradasTotais, mercadoPago/obrigações, etc.) — ver comentário lá.
function recalcularPatrimonio(){
  const r2 = x => Math.round(x*100)/100;
  REG.patrimonio.total = r2(VARS.reserva + VARS.btgNecton + VARS.caixaLance + VARS.nectonContaCorrente);
  REG.patrimonio.metaMilhaoPct = r2(REG.patrimonio.total / REG.patrimonio.metaMilhao * 100);

  // V135: totais do Balanço Patrimonial DERIVADOS (antes eram numeros fixos que so por coincidencia
  // batiam com a soma das partes hoje - agora impossivel dessincronizar).
  const bf = REG.balanco.fisico;
  bf.total = r2(bf.casa + bf.apartamento + bf.jazigo + bf.solar + bf.carro);
  // V140: consorcioCasaPago DERIVADO = parcela x parcelas pagas (era literal solto, agora impossivel
  // dessincronizar de VARS.consorcioCasaParcela/consorcioCasaParcelasPagas)
  REG.balanco.financeiro.consorcioCasaPago = r2(VARS.consorcioCasaParcela * VARS.consorcioCasaParcelasPagas);
  const bfin = REG.balanco.financeiro;
  bfin.total = r2(bfin.reserva + bfin.btg + bfin.nectonContaCorrente + bfin.consorcioCasaPago);
  const bp = REG.balanco.passivos;
  bp.total = r2(bp.financiamentoCasa + bp.consorcioAutoContemplado);
  REG.balanco.ativosTotal = r2(bf.total + bfin.total);
  REG.balanco.patrimonioLiquido = r2(REG.balanco.ativosTotal - bp.total);
  // NOVO 05/08/2026 (parte 97, pedido do usuario: "campo em balanco que some o patrimonio fisico,
  // financeiro, previdencia privada e FGTS, preciso ver quanto tenho de valor"). PGBL e FGTS ficam de
  // proposito FORA de ativosTotal/patrimonioLiquido (regra ja documentada acima: "nao liquido, fora do
  // total financeiro e da Meta do Milhao" - previdencia e FGTS nao sao resgatáveis livremente, misturar
  // com patrimonio liquido de verdade distorceria a Meta do Milhao). Este e um total PARALELO, separado,
  // so pra responder "quanto eu tenho no total, contando tudo" - nao substitui nem afeta os outros.
  REG.balanco.patrimonioTotalGeral = r2(REG.balanco.ativosTotal + REG.balanco.pgbl + REG.balanco.fgts - bp.total);
  // LIMITAÇÃO CONHECIDA (achado de auditoria 13/08/2026, não corrigido - risco maior que o benefício):
  // este cálculo roda no motor síncrono (recalcularAgregadosDerivados), ANTES da promoção V2 assíncrona
  // (promoverCampoV2SeConfiavel em app.js, que só roda depois que resumoV2 chega da rede). Por isso
  // patrimonioTotalGeral usa sempre os valores V1 de ativosTotal/patrimonioLiquido, mesmo quando a
  // promoção V2 já trocou os ids exibidos na tela por valores ligeiramente diferentes (trava <R$5).
  // Divergência esperada: até ~R$10 em cenários raros. Reordenar exigiria mover a promoção V2 pra
  // dentro do motor de cálculo síncrono (mudança estrutural maior, fora do escopo desta correção) -
  // deixado documentado aqui em vez de arriscar side effect em outros campos que dependem desta função.

  // V137: metas percentuais derivadas - milhaoPct estava TRAVADO em 11,54% (nao acompanhava
  // patrimonio.metaMilhaoPct, ja corrigido pra 11,57% na V135) e alimentava o grafico de metas.
  REG.metasPatrimoniais.milhaoPct = REG.patrimonio.metaMilhaoPct;
  REG.metasPatrimoniais.escolaPct = r2(VARS.escolaJulioSaldo / VARS.metaEscolaJulio * 100);

  // V139: Consorcio Casa Nova / Projeto Casa Nova - formulas novas (secoes que eram 100% hardcoded)
  REG.consorcioCasaNova.quitacaoPct = r2(100 - REG.consorcioCasaNova.pagoPct);
  REG.projetoCasaNova.capitalDisponivel = r2(VARS.btgNecton + VARS.caixaLance);
  REG.projetoCasaNova.pct = r2(REG.projetoCasaNova.capitalDisponivel / REG.projetoCasaNova.metaLance * 100);
  REG.projetoCasaNova.falta = r2(REG.projetoCasaNova.metaLance - REG.projetoCasaNova.capitalDisponivel);
}
