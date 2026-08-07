// MÓDULO: criarRegReembolsos() — fragmento do REG (estado inicial) para o domínio Reembolsos:
// metaInvestimento, lrei0001, wartsilaCaixa, reembolsos. Extraído do literal `const REG = {...}`
// de app.js na modularização (07/08/2026) — MESMOS valores, MESMA estrutura. IMPORTANTE: vira uma
// FUNÇÃO (não um objeto de topo) porque os valores dependem de VARS, avaliado no momento da
// CHAMADA — mesmo motivo de CARTAO_PLUGGY_MAPA_DEFAULT ser literal mas a linha derivada ficar em
// app.js. "Não alterar estrutura de dados consumida pelos módulos existentes" — os módulos de
// renderização/cálculo continuam lendo REG.metaInvestimento.*/REG.wartsilaCaixa.*/REG.reembolsos.*
// normalmente, sem nenhuma mudança de forma.
function criarRegReembolsos(){
  return {
    // V137: excedente DERIVADO (investido-meta) em vez de literal verificado a mao - a correcao de 20/07
    // (V107, erro de subtracao de R$1,00) so foi encontrada porque o usuario reconferiu a mao; formula
    // elimina essa classe de erro para sempre. investido/meta leem do VARS.
    metaInvestimento: { investido:0, meta: VARS.metaInvestimentoValor, excedente: 0 }, // investido DERIVADO = aporteBTGPactual+depositoAtivacaoNecton
    lrei0001: 0, // V121: QUITADO (reembolso Wartsila, deposito direto na Caixa Manutencao). Era R$178,64.
    // V143: card "Fatura Wartsila" (secao 05) tinha "excedente R$23,84" como texto fixo - agora DERIVADO.
    wartsilaCaixa: { provisionado: VARS.provisionadoWartsila, fatura: VARS.faturaWartsila, excedente: 0 },
    reembolsos: { recebidosNoCiclo: 0 } // V135: DERIVADO em recalcularAgregadosDerivados() = reembolsoCicloTotal - reembolsosAReceber. Estava hardcoded em R$2.485,39 (valor de antes da 2a TED da Wärtsilä, confirmada 21/07/2026) - nunca atualizou quando reembolsosAReceber zerou, entao "Recebidos" ficava mostrando so a metade do que ja tinha entrado de verdade.
  };
}
