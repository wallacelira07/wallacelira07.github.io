// MÓDULO: recalcularReembolsos() — domínio Reembolsos do motor de cálculo
// (recalcularAgregadosDerivados). Deriva a cascata de Reembolso (pass-through corporativo/recebidos
// no ciclo/sobra pessoal), a Meta de Investimento e o excedente da Caixa Wärtsilä. Extraído de
// app.js na modularização (07/08/2026) — MESMA fórmula, MESMO resultado (usa
// REG.totalOpDetalhe.provMP diretamente em vez do alias local `D.provMP` do original — mesmo valor,
// mesmo objeto). Chamada logo depois de recalcularP2P().
//
// Depende só de campos já resincronizados no preâmbulo (REG.operacional.reembolso*/salario/
// reembolsoCicloTotal/reembolsosAReceber, REG.wartsilaCaixa.fatura) e de dados estáticos do REG
// (wartsilaCaixa.provisionado, totalOpDetalhe.provMP) — nenhuma dependência de outro domínio já
// calculado nesta função.
function recalcularReembolsos(){
  const r2 = x => Math.round(x*100)/100;
  // V128 (bug real apontado pelo usuario): entradasTotais agora DERIVADO de salario+reembolsoCicloTotal, nunca mais um numero fixo que "esquecia" de atualizar quando o reembolso mudava de status (a receber -> recebido).
  // CORRIGIDO 31/07/2026 (V222, bug real apontado pelo usuario): reembolsoCicloTotal e BRUTO - inclui as
  // pernas 1-3 da Cascata (fatura do cartao da propria Wartsila + MP corporativo + cartao corporativo
  // pessoal reembolsavel), que sao custos da EMPRESA passando pela conta do Wallace, nunca dinheiro dele.
  // Essas pernas nunca eram descontadas em lugar nenhum (nao entram em totalOperacional/necessidadeTotalBruta,
  // so aparecem isoladas nos cards da cascata) - Entradas/Saldo do Ciclo inflavam exatamente pela soma delas,
  // dando impressao de sobra maior do que a real (chegou a mudar o Modo Operacional de Normal pra Alto
  // indevidamente). Descontado aqui, na fonte, pra nunca mais vazar pro resto do painel.
  REG.operacional.reembolsoPassThroughCorporativo = r2(REG.operacional.reembolsoPagaWartsila + REG.operacional.reembolsoPagaMPCorporativo + REG.operacional.reembolsoPagaCartaoCorporativo);
  // V135: Recebidos no ciclo = Total do ciclo - A receber (sempre a diferenca, nunca mais numero fixo
  // que "esquece" de subir quando uma nova TED e confirmada e A_RECEBER zera).
  REG.reembolsos.recebidosNoCiclo = r2(REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsosAReceber);
  // Sobra da cascata de reembolso Wartsila = Total - as 4 pernas de deducao (regra da Politica sec.5, 5 pernas). V128: campos nomeados, nao mais numeros magicos.
  REG.operacional.reembolsoSobraPessoal = r2(REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsoPagaWartsila - REG.operacional.reembolsoPagaMPCorporativo - REG.operacional.reembolsoPagaCartaoCorporativo - REG.totalOpDetalhe.provMP);
  // V137: excedente do investimento derivado (elimina a classe de erro que gerou a correcao V107, um
  // erro de subtracao manual de R$1,00).
  REG.metaInvestimento.meta = r2(REG.operacional.salario * 0.20); // CORRIGIDO V151: 20% do salario do ciclo atual (era numero fixo R$6.741,76, nao correspondia ao titulo do card "Meta mensal (20% do salario)")
  REG.metaInvestimento.investido = r2(VARS.aporteBTGPactual + VARS.depositoAtivacaoNecton);
  REG.metaInvestimento.excedente = r2(REG.metaInvestimento.investido - REG.metaInvestimento.meta);
  REG.wartsilaCaixa.excedente = r2(REG.wartsilaCaixa.provisionado - REG.wartsilaCaixa.fatura);
}
