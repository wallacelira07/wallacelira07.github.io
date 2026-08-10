// MÓDULO: recalcularNecessidade() — domínio Necessidade/Modo Operacional do motor de cálculo
// (recalcularAgregadosDerivados). Deriva Entradas Totais, Necessidade (Bruta/Líquida/Total
// Operacional, com ramo especial pra ciclo fechado), Saldo do Ciclo, a projeção dos próximos 12
// ciclos (evolução), Fluxo (saídas/resultado), excedente/complemento do pró-labore, Modo Operacional
// e os campos derivados de necessidade em Superávit Normal/Estimador. Extraído de app.js na
// modularização (07/08/2026) — MESMA fórmula, MESMO resultado, só reorganizado (algumas linhas que
// originalmente ficavam intercaladas com blocos de PIB Wallace/Balanço foram reagrupadas aqui, sem
// mudar nenhuma conta — ver ESTADO_ATUAL.md pra mapa completo da reorganização). Chamada logo depois
// de recalcularReembolsos() (precisa de REG.operacional.reembolsoPassThroughCorporativo já
// calculado). `REG.totalOpDetalhe.recorrencias/assinaturas` (usados aqui via `D`) já vêm prontos de
// recalcularMercadoPago(), chamada antes.
//
// Duas atribuições duplicadas no arquivo original (`REG.evolucao.totalOperacional[0]` e
// `REG.evolucao.necessidadeLiquida[0]`, reatribuídas mais adiante com o MESMO valor) foram
// consolidadas numa única atribuição cada — resultado final idêntico, zero comportamento alterado.
function recalcularNecessidade(){
  const r2 = x => Math.round(x*100)/100;
  const D = REG.totalOpDetalhe;

  // V128 (bug real apontado pelo usuario): entradasTotais agora DERIVADO de salario+reembolsoCicloTotal, nunca mais um numero fixo que "esquecia" de atualizar quando o reembolso mudava de status (a receber -> recebido).
  REG.operacional.entradasTotais = r2(REG.operacional.salario + REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsoPassThroughCorporativo);
  REG.balanco.fluxo.entradas = REG.operacional.entradasTotais; // fonte unica - antes eram 2 copias que podiam divergir

  // Total Operacional = soma literal dos 7 componentes (mesma formula documentada na Politica sec.13/TOTAL_OPERACIONAL)
  REG.operacional.coberturaGarantida = VARS.coberturaGarantidaConfirmada || 0; // CORRIGIDO 26/07/2026 (V175): usuario esclareceu a regra - "o valor so deve constar como garantido quando eu por na caixa e informar o que vai cobrir". Antes era FORMULA automatica (totalOpProvMP + reembolsoPagaCartaoCorporativo) somando dividas que ja vao ser pagas de qualquer jeito (nao dinheiro reservado cobrindo algo) - conceitualmente errado. Agora fica em R$0,00 ate o usuario confirmar um valor especifico e o que ele cobre.
  const snapAtual = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
  if(snapAtual && snapAtual.fechado){
    // V177 (26/07/2026, pedido do usuario): "esses dados nao sao os corretos para o ciclo anterior" -
    // Total Operacional/Necessidade sao formulas derivadas de valores VIVOS (parcelas, consorcios, etc)
    // que nao tem versao congelada por componente. Em vez de reconstruir cada um separadamente (LIVRO_LRP,
    // LIVRO_LRCON antigos etc - trabalho grande), aplicamos os 2 valores FINAIS ja congelados no proprio
    // snapshot (necessidadeTotalBruta/necessidadeTotalLiquida ja existiam la, mas nunca eram de fato usados).
    REG.operacional.necessidadeTotalBruta = snapAtual.necessidadeTotalBruta;
    REG.operacional.necessidadeLiquida = snapAtual.necessidadeTotalLiquida;
    REG.operacional.totalOperacional = r2(snapAtual.necessidadeTotalBruta - REG.operacional.orcamentoOperacional);
  } else {
    REG.operacional.totalOperacional = r2(D.boletos + D.parcelas + D.consorcios + D.recorrencias + D.aportesPat + D.provMP + D.assinaturas);
    REG.operacional.necessidadeTotalBruta = r2(REG.operacional.totalOperacional + REG.operacional.orcamentoOperacional);
    REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  }

  // CORRIGIDO 10/08/2026: ajuste de déficit de caixas negativas sem LREI (política 09/08/2026, ver
  // hydrate-deficit-caixas-sem-lrei.js) precisa ser REAPLICADO toda vez que a necessidade é
  // recalculada, não só uma vez no momento em que o fetch V2 termina — senão qualquer recálculo
  // posterior (ex: provMP atualizando depois da Onda 5) reseta a necessidade e "esquece" o déficit
  // já contabilizado, mesmo bug de raiz que motivou esta correção. `REG.operacional.deficitCaixasSemLrei`
  // é 0 até a política calcular um valor real; `|| 0` cobre a primeira chamada, antes desse fetch existir.
  REG.operacional.deficitCaixasSemLrei = REG.operacional.deficitCaixasSemLrei || 0;
  REG.operacional.necessidadeTotalBruta = r2(REG.operacional.necessidadeTotalBruta + REG.operacional.deficitCaixasSemLrei);
  REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  REG.operacional.saldoCiclo = r2(REG.balanco.fluxo.entradas - REG.operacional.necessidadeTotalBruta);

  // NOVO 05/08/2026 (parte 102, pedido do usuario: "todo valor nao pode depender de nada manual, tudo
  // precisa buscar referencia de uma base de dados... o valor de necessidade do mes e o alivio de
  // pressao sao interligados, deve haver uma base unica"). Projecao dos proximos 12 ciclos, agora
  // FORMULA, nao mais 12 numeros digitados: parcelas (data real de termino via parcelaAtual/
  // totalParcelas) E aportes patrimoniais incrementais (via calcularAporteIncrementalPorCiclo, MESMA
  // fonte usada pelo grafico Alivio de Pressao - nunca mais 2 implementacoes separadas) mudam mes a
  // mes de verdade agora. Boletos/Assinaturas/Recorrencias/Consorcios/Orcamento seguem como o valor
  // do ciclo atual (nao ha dado real de quando cada um muda no futuro).
  function somaParcelasProjetadas(cicloOffset){
    const somaLista = (lista)=> lista.reduce((s,p)=>{
      if(p.status !== 'ATIVO') return s;
      const parcelasRestantes = p.totalParcelas - p.parcelaAtual; // quantos ciclos AINDA faltam, alem do atual
      return (cicloOffset <= parcelasRestantes) ? s + p.valor : s;
    }, 0);
    return r2(somaLista(VARS.PARCELAMENTOS_VISA||[]) + somaLista(VARS.PARCELAMENTOS_MP||[]));
  }
  // aportesPat do ciclo atual (D.aportesPat, valor real confirmado) e o ANCORA - meses futuros aplicam
  // so o DELTA do calendario de caixas incrementais (calcularAporteIncrementalPorCiclo(i) - calcularAporteIncrementalPorCiclo(0)),
  // nunca substituem o valor de hoje por uma soma reconstruida do zero (evita perder algum componente
  // de aportesPat que nao faca parte das 4-5 caixas incrementais mapeadas, ex: aporte BTG regular).
  const aporteIncrementalHoje = calcularAporteIncrementalPorCiclo(0);
  const baseFixaOperacional = r2(D.boletos + D.consorcios + D.recorrencias + D.provMP + D.assinaturas);
  REG.evolucao = REG.evolucao || {};
  REG.evolucao.totalOperacional = [];
  REG.evolucao.necessidadeLiquida = [];
  for(let i=0;i<12;i++){
    const parcelasProj = somaParcelasProjetadas(i);
    const aportesPatProj = r2(D.aportesPat + (calcularAporteIncrementalPorCiclo(i) - aporteIncrementalHoje));
    const totalOpProj = r2(baseFixaOperacional + aportesPatProj + parcelasProj);
    const necBrutaProj = r2(totalOpProj + REG.operacional.orcamentoOperacional);
    const coberturaProj = i===0 ? REG.operacional.coberturaGarantida : 0; // cobertura garantida so existe confirmada pro ciclo atual, nunca projetada pra frente (regra 04 - nao chutar confirmacao futura)
    REG.evolucao.totalOperacional.push(totalOpProj);
    REG.evolucao.necessidadeLiquida.push(r2(necBrutaProj - coberturaProj));
  }
  // ciclo atual (indice 0) sempre usa o valor JA COMPUTADO acima (fonte real do ciclo, pode incluir
  // ajustes/overrides que a formula generica de parcelas nao capturaria) - so os indices 1+ sao 100%
  // projecao por formula.
  REG.evolucao.totalOperacional[0] = REG.operacional.totalOperacional;
  REG.evolucao.necessidadeLiquida[0] = REG.operacional.necessidadeLiquida;

  REG.balanco.fluxo.saidas = REG.operacional.necessidadeTotalBruta; // CORRIGIDO V150: era numero fixo, agora e a mesma Necessidade Total Bruta (Boletos+Parcelas+Assinaturas+Recorrencias+Consorcios+AportesPatrimoniais+OrcamentoOperacional). Movido para APOS necessidadeTotalBruta ser calculado (ordem de execucao).
  REG.balanco.fluxo.resultado = r2(REG.balanco.fluxo.entradas - REG.balanco.fluxo.saidas); // CORRIGIDO V150: era numero fixo, agora e Entradas-Saidas de verdade

  // CORRIGIDO 25/07/2026 (V143→V144, erro do Claude apontado pelo usuario): o pro-labore NAO substitui o
  // salario real nos calculos - ele so decide o ROTEAMENTO do excedente/complemento (Fundo de Suavizacao,
  // secao 16 Politicas). Modo Operacional continua reagindo ao saldoCiclo real (dinheiro de verdade
  // disponivel), exatamente como sempre funcionou (secao 10 Politicas). O pro-labore e so o "pulmão":
  // mes bom (salario real > R$11.000) manda o excedente pra Conta Suavizacao; mes fraco (salario real <
  // R$11.000) a Conta Suavizacao complementa a diferenca ANTES do resto do sistema calcular qualquer coisa
  // - entao na pratica o sistema sempre "ve" pelo menos R$11.000 disponivel, nunca menos. O calculo abaixo
  // e so informativo (quanto seria o excedente/complemento deste ciclo), NAO mexe no Modo Operacional.
  REG.operacional.excedenteOuComplementoProLabore = r2(REG.operacional.salario - REG.operacional.proLaboreFixo);
  if(REG.operacional.saldoCiclo < 0) REG.operacional.modoOperacional = 'Crítico';
  else if(REG.operacional.saldoCiclo < 3000) REG.operacional.modoOperacional = 'Baixo';
  else if(REG.operacional.saldoCiclo < 8000) REG.operacional.modoOperacional = 'Normal';
  else REG.operacional.modoOperacional = 'Alto';

  // V203 (varredura de bugs): o indice 0 (ciclo atual) da serie de cenarios era um literal duplicado
  // do snapshot (13146.21), que dessincronizaria se a necessidade do ciclo mudasse. Agora deriva do
  // agregado real.
  if(REG.superavitNormal && Array.isArray(REG.superavitNormal.necessidade)) REG.superavitNormal.necessidade[0] = REG.operacional.necessidadeTotalBruta;
  // V138: elimina duplicacao - antes o mesmo numero vivia em REG.estimador.necessidadeLiquidaProximoCiclo
  // (literal solto) E em REG.evolucao.necessidadeLiquida[1] (array). Agora so o array e fonte, o estimador le dele.
  REG.estimador.necessidadeLiquidaProximoCiclo = REG.evolucao.necessidadeLiquida[1];
}
