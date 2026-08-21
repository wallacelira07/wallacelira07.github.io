// MÓDULO: Opções vendidas / ROC (Rentabilidade da Operação) — seção 17
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carregado
// via <script> ESTÁTICO no HTML, ANTES do app.js (não depois, diferente do módulo energia-solar) —
// esse código roda NO MEIO da execução síncrona do app.js (logo depois de VARS.opcoesVendidasDetalhe
// existir, antes de hydrate()/recalcularAgregadosDerivados() precisarem do resultado). Só define as
// funções aqui; QUEM CHAMA continua sendo o app.js, no mesmo ponto exato de antes — preserva 100% a
// ordem de execução original. Nenhuma fórmula ou comportamento foi alterado, só o arquivo que hospeda
// o código.

const parseVencimentoBR = str => { const [d,m,a] = str.split('/').map(Number); return new Date(a,m-1,d); };

// CORRIGIDO 03/08/2026 (pedido do usuario): "Valor de mercado (posicoes ATIVAS)" nao deve mais somar
// posicao ja vencida (ex: PETRS368W5, venceu 31/07/2026) - por definicao uma posicao encerrada nao
// tem mais "valor de mercado" de posicao aberta. o.vencida e calculado 1x aqui (unica fonte, P1) e
// reaproveitado depois na tabela da secao 17 (nunca duplicado) - o registro em si NAO e apagado do
// array (P6, rastreabilidade), so sai da soma/da lista de posicoes ativas exibida.
function aplicarStatusVencidoEValorMercadoOpcoes(){
  // CORRIGIDO 21/08/2026 (achado real do usuário: PETR4/ITUB4 PUT vencendo HOJE já saíam de "ativas"
  // antes das 23:59h do próprio dia de vencimento) — parseVencimentoBR() é sempre meia-noite do dia,
  // comparar contra `new Date()` (agora, com hora) fazia a opção "vencer" a partir da meia-noite do
  // dia do vencimento, não do fim dele. Zera a hora de "hoje" — vira comparação por DIA, "vencida" só
  // a partir do dia SEGUINTE ao vencimento (mesmo padrão já corrigido pra "assembleia já passou").
  const hojeOpcoes = new Date(); hojeOpcoes.setHours(0,0,0,0);
  VARS.opcoesVendidasDetalhe.forEach(o => {
    if(o.statusPosicao === 'ENCERRADA') o.vencida = true;
    else if(o.statusPosicao === 'ATIVA') o.vencida = false;
    else o.vencida = parseVencimentoBR(o.vencimento) < hojeOpcoes;
  });
  VARS.opcoesVendidasValorMercado = Math.round(VARS.opcoesVendidasDetalhe.filter(o=>!o.vencida).reduce((s,o)=>s+o.valorMercado,0)*100)/100;
}

// NOVO 21/08/2026 (achado real do usuário: ITUB4 PUT foi pra ITM no dia do vencimento — a tabela da
// seção 16 já mostrava "ITM" corretamente na coluna "Ação agora", mas era preciso abrir o painel e
// reparar nessa coluna especificamente pra notar. Nenhum aviso proativo existia — "por isso tem a
// cotação ao vivo das ações [...] você tem que me avisar", pedido explícito do usuário). Chamada de
// hydrateROC() (não daqui — precisa de VARS.ACOES_COTACOES já populado pela Onda de cotações do
// app.js, que roda DEPOIS deste módulo na ordem de carga síncrona).
//
// AMPLIADO 21/08/2026 (pedido do usuário, motor de alerta em camadas — "o sistema NÃO pode mostrar
// uma operação como normal quando houver risco elevado"): substitui o alerta binário (ITM/não-ITM
// dentro de 2 dias) por 4 níveis objetivos, calculados por REGRA (dias restantes + distância % do
// strike) — nunca "probabilidade" inventada. Critério, documentado aqui pra nunca precisar abrir o
// código pra saber o que cada nível significa:
//   ⚫ Praticamente certo — ITM E o dia do vencimento já passou (diasParaVencer < 0), aguardando só
//                          confirmação da B3/corretora — o pregão do dia de vencimento já fechou.
//   🔴 Provável        — ITM E vence hoje ou em até 2 dias (inclui o próprio dia do vencimento —
//                          ainda dá tempo do pregão fechar diferente, não é "certo" ainda).
//   🟠 Risco alto       — ITM E vence em até 7 dias.
//   🟡 Atenção          — ITM mas vence depois de 7 dias (ainda pode reverter) OU OTM mas a menos de
//                          3% do strike E vence em até 7 dias (pode virar ITM antes do vencimento).
// Sem nível = sem risco relevante (OTM confortável, ou ITM só nominal mas com folga grande de tempo).
function calcularNivelRiscoOpcao(distanciaPct, diasParaVencer, itm){
  if(itm){
    if(diasParaVencer < 0) return { tier: 4, emoji: '⚫', label: 'Exercício praticamente certo', cor: '#333' };
    if(diasParaVencer <= 2) return { tier: 3, emoji: '🔴', label: 'Exercício provável', cor: 'var(--red)' };
    if(diasParaVencer <= 7) return { tier: 2, emoji: '🟠', label: 'Risco alto de exercício', cor: '#f2994a' };
    return { tier: 1, emoji: '🟡', label: 'Atenção — ITM, mas ainda longe do vencimento', cor: '#eab54f' };
  }
  if(diasParaVencer <= 7 && distanciaPct <= 3) return { tier: 1, emoji: '🟡', label: 'Atenção — perto do strike', cor: '#eab54f' };
  return null;
}

// Não é conselho de investimento — só a matemática mecânica do que acontece SE for exercido, pra
// decisão informada (com o usuário/corretora, não comigo). Chamada de hydrateROC() (não daqui —
// precisa de VARS.ACOES_COTACOES já populado pela Onda de cotações do app.js, que roda DEPOIS deste
// módulo na ordem de carga síncrona).
function calcularAvisosOpcoesRisco(){
  const hojeOpcoes = new Date(); hojeOpcoes.setHours(0,0,0,0);
  const cotacoes = VARS.ACOES_COTACOES || {};
  const avisos = [];
  VARS.opcoesVendidasDetalhe.forEach(o => {
    if(o.statusPosicao === 'ENCERRADA') return;
    if(o.precoExercicio == null || !o.vencimento) return;
    const cot = cotacoes[o.ativo];
    if(!cot || cot.preco == null) return;
    const itm = cot.preco < o.precoExercicio; // PUT vendida: ITM quando cotação < strike
    const distanciaPct = Math.abs((cot.preco - o.precoExercicio) / o.precoExercicio * 100);
    const dataVenc = parseVencimentoBR(o.vencimento);
    const diasParaVencer = Math.round((dataVenc - hojeOpcoes) / 86400000);
    const nivel = calcularNivelRiscoOpcao(distanciaPct, diasParaVencer, itm);
    if(!nivel) return;
    const qtd = Math.abs(o.quantidade);
    const premio = o.premioRecebido || 0;
    let capitalNecessario = null, valorMercadoAcoes = null, perdaNoPapel = null, resultadoLiquidoSeExercido = null, precoEquilibrio = null;
    if(itm){
      // Matemática de exercício só faz sentido pra posição ITM — pra tier 🟡 OTM "perto do strike"
      // seria hipotético (a opção NÃO está em risco de exercício agora, só perto o suficiente pra
      // acompanhar), não misturar os 2 casos no mesmo número.
      capitalNecessario = Math.round(qtd * o.precoExercicio * 100) / 100;
      valorMercadoAcoes = Math.round(qtd * cot.preco * 100) / 100;
      perdaNoPapel = Math.round((capitalNecessario - valorMercadoAcoes) * 100) / 100;
      resultadoLiquidoSeExercido = Math.round((premio - perdaNoPapel) * 100) / 100;
      precoEquilibrio = Math.round((o.precoExercicio - premio / qtd) * 100) / 100;
    }
    avisos.push({
      ativo: o.ativo, ticker: o.ticker, diasParaVencer, vencimento: o.vencimento, itm, distanciaPct, nivel,
      strike: o.precoExercicio, cotacaoAtual: cot.preco, qtd, premio,
      capitalNecessario, valorMercadoAcoes, perdaNoPapel, resultadoLiquidoSeExercido, precoEquilibrio,
    });
  });
  avisos.sort((a,b) => b.nivel.tier - a.nivel.tier || a.diasParaVencer - b.diasParaVencer);
  return avisos;
}

// NOVO 03/08/2026 (Módulo 17 - Rentabilidade da Operação/ROC): mede o retorno do prêmio líquido sobre
// o capital comprometido (strike x 100 x contratos) - não mede lucro capturado, mede rentabilidade
// sobre o dinheiro travado, pra comparar com CDI/renda fixa. Roda em cima de VARS.opcoesVendidasDetalhe,
// nenhum dado duplicado. Documentado na especificação enviada pelo usuário.
function calcularROCOpcoes(){
  const parseDataNota = str => {
    // notaCorretagem vem no formato "12345678 (DD/MM/AAAA)" - extrai a data entre parênteses.
    const m = str && str.match(/\((\d{2})\/(\d{2})\/(\d{4})\)/);
    if(!m) return null;
    return new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
  };
  const parseDataBR = str => {
    if(!str) return null;
    const [d,mo,a] = str.split('/').map(Number);
    return new Date(a, mo-1, d);
  };
  const hoje = new Date();

  // Classificação de status (🔴 Fraca / 🟡 Boa / 🟢 Muito Boa / 🔵 Excelente) - extraída pra função
  // reutilizável (03/08/2026, layout do ROC) porque agora é usada tanto por posição quanto no
  // card consolidado da carteira (antes só existia por posição, o card consolidado não tinha status
  // nenhum). "classe" mapeia pra uma das 4 classes .badge já existentes em styles.css (bg/ba/br/bb),
  // mesmas cores do emoji, sem inventar CSS novo.
  const classificarStatusROC = (rentMensalPct) => {
    const lim = VARS.ROC_STATUS_LIMITES;
    if(rentMensalPct < VARS.CDI_MENSAL_ATUAL) return { label: 'Fraca', emoji: '🔴', classe: 'br' };
    if(rentMensalPct <= lim.boaAte) return { label: 'Boa', emoji: '🟡', classe: 'ba' };
    if(rentMensalPct <= lim.muitoBoaAte) return { label: 'Muito Boa', emoji: '🟢', classe: 'bg' };
    return { label: 'Excelente', emoji: '🔵', classe: 'bb' };
  };

  VARS.opcoesVendidasDetalhe.forEach(o => {
    const dataVenda = parseDataNota(o.notaCorretagem);
    const dataVencimento = parseDataBR(o.vencimento);
    // Se o vencimento já passou, a operação está encerrada - usa a data de vencimento como fim da
    // contagem de dias (não a data de hoje, que continuaria somando dias de uma posição que já fechou).
    const dataReferencia = (dataVencimento && dataVencimento < hoje) ? dataVencimento : hoje;

    let diasOperacao = null;
    if(dataVenda){
      diasOperacao = Math.round((dataReferencia - dataVenda) / 86400000);
      if(diasOperacao < 1) diasOperacao = 1; // mesmo dia (ex: PETRS368W5 venceu no próprio dia) - evita divisão por zero
    }

    // Contratos = |quantidade| / 100 (padrão B3, 1 contrato = 100 ações). Capital Travado = Strike x 100 x Contratos.
    const contratos = Math.round(Math.abs(o.quantidade) / 100);
    // precoExercicio pode ser null quando o strike ainda não foi confirmado por print/nota - não
    // força um número, documenta como lacuna (P1), ROC fica indisponível pra esse item. (Não há
    // nenhum caso assim no momento, 03/08/2026 — todas as 3 posições têm strike confirmado.)
    const capitalTravado = (o.precoExercicio !== null && o.precoExercicio !== undefined)
      ? Math.round(o.precoExercicio * 100 * contratos * 100) / 100
      : null;

    const premioLiquido = o.premioRecebido; // já é o líquido (ver comentário na origem do dado acima)

    let rentabilidade = null, rentabilidadeMensal = null, rentabilidadeAnual = null, statusROC = null, comparacaoCDI = null;
    if(capitalTravado !== null && premioLiquido !== null && diasOperacao){
      rentabilidade = premioLiquido / capitalTravado; // fração, ex: 0.042
      rentabilidadeMensal = rentabilidade * 30 / diasOperacao;
      rentabilidadeAnual = Math.pow(1 + rentabilidade, 365 / diasOperacao) - 1;

      const cdiMensalFracao = VARS.CDI_MENSAL_ATUAL / 100;
      comparacaoCDI = cdiMensalFracao > 0 ? (rentabilidadeMensal / cdiMensalFracao) : null;

      const rentMensalPct = rentabilidadeMensal * 100;
      statusROC = classificarStatusROC(rentMensalPct);
    }

    o.roc = {
      contratos, diasOperacao, capitalTravado, premioLiquido,
      rentabilidade, rentabilidadeMensal, rentabilidadeAnual, comparacaoCDI, statusROC,
    };
  });

  // Consolidado da carteira: soma capital travado / soma prêmio líquido (só entre os itens com ROC
  // calculável - item sem strike confirmado ficaria de fora da soma, não forçado a zero; desde
  // 03/08/2026 as 3 posições atuais têm strike confirmado, então nenhuma fica excluída no momento).
  // CORRIGIDO 03/08/2026 (pedido do usuario - "capital travado deve ser removido da opção que já
  // venceu"): faltava o filtro !o.vencida aqui - o mesmo padrão já usado em opcoesVendidasValorMercado
  // (linha ~1250) não tinha sido replicado neste consolidado. Resultado prático: PETRS368W5 (venceu
  // 31/07/2026, capital travado R$3.686,00) continuava dentro da soma consolidada (R$19.422,00 errado),
  // mesmo já fora da tabela de posições ativas e do Valor de Mercado. Agora consistente com o resto do
  // sistema - posição vencida não é mais "capital travado" (não há mais nada travado nela).
  const comROC = VARS.opcoesVendidasDetalhe.filter(o => o.roc.capitalTravado !== null && !o.vencida);
  const somaCapital = Math.round(comROC.reduce((s,o) => s + o.roc.capitalTravado, 0) * 100) / 100;
  const somaPremio = Math.round(comROC.reduce((s,o) => s + o.roc.premioLiquido, 0) * 100) / 100;
  const rentabilidadeCarteira = somaCapital > 0 ? somaPremio / somaCapital : null;
  const diasMedios = comROC.length ? Math.round(comROC.reduce((s,o) => s + o.roc.diasOperacao, 0) / comROC.length) : null;  // Rentabilidade mensal/anualizada da carteira usam os dias médios como padronização (mesma lógica
  // aplicada item a item, agora no consolidado).
  const rentMensalCarteira = (rentabilidadeCarteira !== null && diasMedios) ? rentabilidadeCarteira * 30 / diasMedios : null;
  const rentAnualCarteira = (rentabilidadeCarteira !== null && diasMedios) ? Math.pow(1 + rentabilidadeCarteira, 365/diasMedios) - 1 : null;
  const cdiMensalFracao = VARS.CDI_MENSAL_ATUAL / 100;
  const comparacaoCDICarteira = (rentMensalCarteira !== null && cdiMensalFracao > 0) ? rentMensalCarteira / cdiMensalFracao : null;
  // NOVO 03/08/2026 (layout do ROC, pedido do usuario): status do consolidado, mesma classificacao
  // usada por posicao - antes o card resumo nao tinha nenhum indicador de status.
  const statusROCCarteira = (rentMensalCarteira !== null) ? classificarStatusROC(rentMensalCarteira * 100) : null;

  VARS.rocCarteira = {
    capitalTravado: somaCapital,
    premioLiquido: somaPremio,
    rentabilidade: rentabilidadeCarteira,
    rentabilidadeMensal: rentMensalCarteira,
    rentabilidadeAnualizada: rentAnualCarteira,
    comparacaoCDI: comparacaoCDICarteira,
    diasMedios,
    statusROC: statusROCCarteira,
    // CORRIGIDO 04/08/2026 (achado do usuario via print - legenda dizia "falta de strike confirmado"
    // pra PETRS368W5, que na verdade estava fora por estar VENCIDA, nao por falta de strike - a mesma
    // variavel itensExcluidos servia pros 2 motivos, texto fixo so cobria 1 deles). Agora os 2 motivos
    // sao contados separado, pra legenda dizer o motivo certo em cada caso.
    itensSemStrike: VARS.opcoesVendidasDetalhe.filter(o => o.roc.capitalTravado === null).length,
    itensVencidosExcluidos: VARS.opcoesVendidasDetalhe.filter(o => o.roc.capitalTravado !== null && o.vencida).length,
  };
}
