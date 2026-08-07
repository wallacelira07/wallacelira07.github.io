// MÓDULO: criarRegPatrimonio() — fragmento do REG (estado inicial) para o domínio Patrimônio:
// patrimonio, patrimonioDetalhe, escolaJulioSaldo, metasPatrimoniais, consorcioCasaNova,
// projetoCasaNova, passivosPatrimoniais. Extraído do literal `const REG = {...}` de app.js na
// modularização (07/08/2026) — MESMOS valores, MESMA estrutura. IMPORTANTE: vira uma FUNÇÃO (não
// um objeto de topo) porque os valores dependem de VARS, avaliado no momento da CHAMADA — mesmo
// motivo de CARTAO_PLUGGY_MAPA_DEFAULT ser literal mas a linha derivada ficar em app.js. "Não
// alterar estrutura de dados consumida pelos módulos existentes" — os módulos de
// renderização/cálculo continuam lendo REG.patrimonio.*/REG.consorcioCasaNova.* etc normalmente,
// sem nenhuma mudança de forma.
function criarRegPatrimonio(){
  return {
    patrimonio: {
      // DERIVADO em recalcularAgregadosDerivados(): total = VARS.reserva+VARS.btgNecton+VARS.caixaLance+VARS.nectonContaCorrente
      total: 0,          // preenchido no boot, nunca editar aqui
      metaMilhaoPct: 0,  // preenchido no boot = total/metaMilhao*100
      metaMilhao: 1000000,
      metaEscolaJulio: VARS.metaEscolaJulio
    },
    // ===== FASE 2 (16/07/2026) - graficos de composicao (g_cTotalOp, g_cVisa, g_cMetas, g_cCaixas) =====
    patrimonioDetalhe: { reserva:VARS.reserva, btg:VARS.btgNecton, caixaLance:VARS.caixaLance, nectonContaCorrente:VARS.nectonContaCorrente }, // V134: agora le do VARS (fonte unica) - antes eram numeros duplicados aqui e em patrimonio.total, ficavam dessincronizados.
    escolaJulioSaldo: VARS.escolaJulioSaldo, // V134: le do VARS. Fora do Patrimonio Total/Meta Milhao desde V47 (16/07/2026) - existe como reserva/caixa propria, nao patrimonio liquido de gestao ativa
    // V137: milhaoPct e escolaPct viram DERIVADOS (alimentam o grafico "Progresso das metas patrimoniais").
    // milhaoPct estava TRAVADO em 11,54% desde antes da correcao V135 (que levou patrimonio.metaMilhaoPct
    // pra 11,57%) - o grafico mostraria o percentual errado. escolaPct tambem estava desatualizado (5,47%
    // vs o real ~5,49%).
    metasPatrimoniais: { milhaoPct:0, casaNovaPct:VARS.consorcioCasaPagoPct, autoPct:VARS.consorcioAutoPagoPct, escolaPct:0 },
    // V139: secoes 12/13 do painel (Consorcio Casa Nova / Projeto Casa Nova) - antes 100% hardcoded no HTML.
    consorcioCasaNova: {
      cartaCredito: VARS.consorcioCasaCartaCredito,
      parcela: VARS.consorcioCasaParcela,
      pagoPct: VARS.consorcioCasaPagoPct,       // extrato real, nao derivado (ver nota no VARS)
      quitacaoValor: VARS.consorcioCasaQuitacao,
      quitacaoPct: 0 // DERIVADO = 100 - pagoPct (unica relacao interna consistente com o extrato: 100-0,42=99,58, bate exato)
    },
    projetoCasaNova: {
      capitalDisponivel: 0, // DERIVADO = VARS.btgNecton + VARS.caixaLance (era numero fixo capturado num instante passado, nunca recalculado)
      metaLance: VARS.metaLanceProjetoCasa,
      pct: 0,   // DERIVADO = capitalDisponivel / metaLance * 100
      falta: 0  // DERIVADO = metaLance - capitalDisponivel
    },
    // V142 (23/07/2026): secao 11 "Passivos patrimoniais" - a ultima secao ainda 100% hardcoded no HTML.
    // financiamentoCasa le do MESMO VARS.passivoFinanciamentoCasa ja usado no Balanco (balanco.passivos) -
    // antes o HTML desta secao tinha um numero PROPRIO e DIVERGENTE (R$61.311,95 vs R$61.326,91 no Balanco,
    // mesma divida, 2 fontes, 2 valores). Agora so existe 1 numero, usado nos 2 lugares.
    passivosPatrimoniais: {
      financiamentoCasa: VARS.passivoFinanciamentoCasa,
      prestacaoFinanciamentoCasa: VARS.prestacaoFinanciamentoCasa,
      mesesRestantesFinanciamentoCasa: VARS.mesesRestantesFinanciamentoCasa,
      consorcioAuto: VARS.passivoConsorcioAuto,
      consorcioAutoPct: VARS.consorcioAutoPagoPct,
      parcelaConsorcioAuto: VARS.parcelaConsorcioAuto
    }
  };
}
