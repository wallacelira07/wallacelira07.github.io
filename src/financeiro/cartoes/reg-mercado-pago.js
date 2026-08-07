// MÓDULO: criarRegMercadoPago() — fragmento do REG (estado inicial) para o domínio Mercado
// Pago/Cartões: visa, cartaoInfinite, cartaoMB, mercadoPago, faturaWartsila, visaDetalhe, mbDetalhe.
// Extraído do literal `const REG = {...}` de app.js na modularização (07/08/2026) — MESMOS
// valores, MESMA estrutura. IMPORTANTE: vira uma FUNÇÃO (não um objeto de topo) porque os valores
// dependem de VARS, avaliado no momento da CHAMADA — chamada em app.js no mesmo ponto exato onde
// os literais existiam, depois de VARS já estar populado (mesmo motivo de CARTAO_PLUGGY_MAPA_DEFAULT
// ser literal mas a linha derivada ficar em app.js). "Não alterar estrutura de dados consumida pelos
// módulos existentes" — os módulos de renderização/cálculo continuam lendo REG.visa.*/REG.visaDetalhe.*
// etc normalmente, sem nenhuma mudança de forma.
function criarRegMercadoPago(){
  return {
    visa: {
      totalComprometido: 0,   // DERIVADO = VARS.cartaoInfiniteTotal + VARS.cartaoMBTotal
      pessoal: 0              // DERIVADO = totalComprometido - reembolsoPagaCartaoCorporativo
    },
    cartaoInfinite: { total: VARS.cartaoInfiniteTotal },
    cartaoMB: { total: VARS.cartaoMBTotal },
    mercadoPago: VARS.mercadoPagoFatura,     // V137: le do VARS (era literal solto 1751.16, divergia do balanco.obrigacoes.mercadoPago)
    faturaWartsila: VARS.faturaWartsila,     // V137: le do VARS (era 3a copia literal do mesmo numero)
    // V135 (22/07/2026, auditoria SSOT): visaDetalhe somava R$9.024,11 vs cartaoInfinite.total (fatura real,
    // VARS) R$9.073,92 - gap de R$49,81. Investigado: NAO e erro de nenhum item, e o mesmo residuo entre
    // "soma dos livros de transacao" x "fatura real do banco" ja documentado no ERP desde a reconciliacao
    // V128 (fatura sempre vence, regra V61) - nunca foi re-itemizado transacao a transacao. Em vez de
    // forcar/inventar em qual categoria o R$49,81 pertence (violaria P1), adicionado como linha propria
    // "naoReconciliado", visivel e documentada - mesmo padrao ja usado para outras diferencas residuais
    // do sistema (ex: CORRECAO_15072026_007, R$36,90 na epoca). Agora a soma bate exatamente com a fatura.
    visaDetalhe: { parcelas:VARS.livroLRP, consorcios:VARS.livroLRCONVisaOnly, wallace:VARS.visaLRWHistorico, recorrencias:VARS.visaLRRConfirmado, corp:VARS.livroLRCVisaOnly, assinaturas:VARS.visaLRSConfirmado, vanessa:VARS.visaLRVHistorico, naoReconciliado:VARS.visaNaoReconciliado },
    // V135: wallace CORRIGIDO 1161.94 -> 1349.93 (= LIVRO_LRW_MB_TOTAL do ERP, V121 - TX128/129/130 de
    // 21/07 nunca tinham propagado pra ca). Era o unico motivo do mbDetalhe nao bater com cartaoMBTotal
    // (gap de R$187,99): 1161,94+614,45+43,80=1.820,19 vs VARS.cartaoMBTotal=2.008,18. Agora soma exato.
    mbDetalhe: { parcelas:0, consorcios:VARS.livroLRCON, wallace:VARS.mbLRWConfirmado, recorrencias:VARS.mbLRRConfirmado, corp:VARS.mbLRCConfirmado, assinaturas:VARS.mbLRSConfirmado, vanessa:VARS.mbLRVConfirmado }
    // V136 (22/07/2026): visaDetalhe.vanessa +R$17,98 (TX131, H57Store, cartao 4845) e mbDetalhe.wallace
    // +R$56,99 (TX132, Google SunSurveyorApp, cartao 2244) - ambos ja embutidos acima. Soma continua
    // batendo exato com cartaoInfiniteTotal/cartaoMBTotal (checks #11/#12 da auditoria confirmam).
  };
}
