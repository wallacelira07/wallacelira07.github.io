// MÓDULO: recalcularIndicadores() — domínio Indicadores (PIB Wallace) do motor de cálculo
// (recalcularAgregadosDerivados). Deriva PIB Wallace completo (salário líquido/reembolsos/
// rendimentos/valorização/consumo não recorrente/total), Consumo Improdutivo %, Taxa de Crescimento,
// Taxa de Poupança (Receita/Despesa Total Comparável), Crescimento Patrimonial e Eficiência
// Financeira, além de persistir o snapshot mensal no Supabase (registrar_pib_mensal). Extraído de
// app.js na modularização (07/08/2026) — MESMA fórmula, MESMO resultado. Chamada logo depois de
// recalcularNecessidade() (precisa de REG.operacional.entradasTotais/necessidadeTotalBruta e
// REG.balanco.fluxo.entradas/saidas/resultado, todos já calculados por ela) e depois de
// recalcularPatrimonio() (precisa de REG.balanco.patrimonioLiquido, já calculado por ela — ver nota
// em recalcular-patrimonio.js sobre por que patrimônio líquido é calculado cedo).
function recalcularIndicadores(){
  const r2 = x => Math.round(x*100)/100;

  // NOVO 04/08/2026 (parte 78, continuacao da parte 77 - ficou pela metade): PIB Wallace, indicador de
  // geracao de riqueza (nao de quanto entrou). Formula do usuario: Salario Liquido + Reembolsos +
  // Rendimentos + Valorizacao de Investimentos - Consumo Nao Recorrente. Fontes, uma a uma:
  // - salarioLiquido: VARS.salario (real)
  // - reembolsos: reembolsoCicloTotal menos pass-through corporativo (mesma logica de entradasTotais -
  //   reembolso que so cobre gasto da empresa nao gera riqueza pessoal)
  // - rendimentos: soma "resultadoHistorico" das opcoes vendidas - ACUMULADO por posicao, nao isolado
  //   por mes (nao existe serie mensal ainda) - marcado explicitamente na tela, nao escondido
  // - valorizacaoInvestimentos: 0, NAO TRACKEADO (precisaria de snapshot mes a mes do valor de mercado,
  //   que nao existe) - marcado como pendente, nunca estimado por cima
  // - consumoNaoRecorrente: soma de VARS.EXTRAORDINARIO_BENS_DURAVEIS (categoria nova da parte 77)
  // CORRIGIDO 05/08/2026 (parte 96, usuario apontou a divergencia: "recebi R$371,85 total e R$331,88
  // para as opcoes ativas"): rendimentosOpcoes somava resultadoHistorico (desconta custo operacional E
  // uma marcacao a mercado de posicoes AINDA ABERTAS - PETRT379/ITUBT424 vencem em 21/08, ainda nao
  // realizado) - isso contraria a propria definicao do PIB ("mede o que VIROU riqueza", nao oscilacao
  // de posicao aberta). Numa opcao VENDIDA, o premio e recebido integralmente no ato da venda e so e
  // devolvido se a opcao for exercida contra o Wallace - ate la, e dinheiro real na conta. Corrigido pra
  // somar premioRecebido (R$371,85 = R$331,88 das 2 ativas + R$39,97 da PETRS368W5, ja vencida 31/07).
  const rendimentosOpcoes = r2(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioRecebido||0),0));
  const consumoNaoRecorrentePIB = r2((VARS.EXTRAORDINARIO_BENS_DURAVEIS||[]).reduce((s,t)=>s+(t.valor||0),0));
  REG.pibWallace = {
    salarioLiquido: VARS.salario,
    reembolsos: r2(VARS.reembolsoCicloTotal - REG.operacional.reembolsoPassThroughCorporativo),
    rendimentos: rendimentosOpcoes,
    rendimentosNota: 'prêmio recebido no ato da venda (dinheiro real já na conta), não resultado marcado a mercado — não isolado por mês (sem série histórica ainda)',
    valorizacaoInvestimentos: 0,
    valorizacaoNota: 'não trackeado — precisa de snapshot mês a mês do valor de mercado (pendente)',
    consumoNaoRecorrente: consumoNaoRecorrentePIB,
    total: 0
  };
  REG.pibWallace.total = r2(REG.pibWallace.salarioLiquido + REG.pibWallace.reembolsos + REG.pibWallace.rendimentos
    + REG.pibWallace.valorizacaoInvestimentos - REG.pibWallace.consumoNaoRecorrente);

  // NOVO 05/08/2026 (parte 97, pedido do usuario: "implemente Taxa de Crescimento, Eficiencia
  // Financeira e Consumo Improdutivo, precisam de serie historica mes a mes que o site ainda nao
  // guarda"). Persistido agora no Supabase (PIB_WALLACE_HISTORICO, chave = ciclo "YYYY-MM", via RPC
  // registrar_pib_mensal - escopo minimo, mesmo padrao de triar_mercadopago_evento, so grava dentro
  // dessa 1 chave). Definicoes (primeira vez que esses 3 indicadores existem no sistema, documentadas
  // aqui porque nao existiam em nenhum outro lugar):
  // - Eficiencia Financeira = PIB Wallace do mes / Entradas Totais do mes x 100 (% da renda que virou
  //   riqueza real, nao so "entrou e saiu pela caixa")
  // - Consumo Improdutivo = Consumo Nao Recorrente do mes / Entradas Totais do mes x 100 (% da renda
  //   queimada em bens duraveis avulsos, fora do custo de viver recorrente)
  // - Taxa de Crescimento = variacao % do PIB Wallace total vs o ciclo anterior mais recente que exista
  //   no historico (nao necessariamente o ciclo imediatamente anterior, se algum mes faltar registro)
  REG.pibWallace.consumoImprodutivoPct = REG.operacional.entradasTotais ? r2(REG.pibWallace.consumoNaoRecorrente / REG.operacional.entradasTotais * 100) : null;
  const pibHistorico = VARS.PIB_WALLACE_HISTORICO || {};
  const pibCiclosAnteriores = Object.keys(pibHistorico).filter(k => k < VARS.cicloAtual).sort();
  const pibCicloAnteriorKey = pibCiclosAnteriores[pibCiclosAnteriores.length - 1];
  const pibCicloAnterior = pibCicloAnteriorKey ? pibHistorico[pibCicloAnteriorKey] : null;
  REG.pibWallace.taxaCrescimentoPct = (pibCicloAnterior && typeof pibCicloAnterior.total === 'number' && pibCicloAnterior.total !== 0)
    ? r2((REG.pibWallace.total - pibCicloAnterior.total) / Math.abs(pibCicloAnterior.total) * 100)
    : null;
  REG.pibWallace.mesesNoHistorico = Object.keys(pibHistorico).length + (pibHistorico[VARS.cicloAtual] ? 0 : 1);

  // NOVO 07/08/2026 (pedido do usuario, mudanca de metodologia do indicador principal): "Taxa de
  // Poupança" (receita total x despesa total, SEM excluir consumo não recorrente — "se o dinheiro
  // saiu, reduziu a capacidade de acumular riqueza") e "Crescimento Patrimonial %" (variação do
  // patrimônio líquido entre o fechamento do ciclo anterior e agora). PIB Wallace (acima) continua
  // calculado e persistido — não foi apagado — mas deixa de ser o indicador principal exibido.
  // Receita Total = tudo que entrou (entradasTotais já é salário+reembolsos líquidos; + rendimentos
  // de opções + valorização, que o PIB Wallace já tinha calculado acima, reaproveitados aqui).
  REG.pibWallace.receitaTotalComp = r2(REG.operacional.entradasTotais + REG.pibWallace.rendimentos + REG.pibWallace.valorizacaoInvestimentos);
  // Despesa Total = necessidadeTotalBruta (boletos+parcelas+consórcios+recorrências+aportesPat+provMP+
  // assinaturas+orçamento) + consumoNaoRecorrente (bens duráveis avulsos) — as 2 fontes não se
  // sobrepõem (confirmado: nenhum componente de necessidadeTotalBruta lê VARS.EXTRAORDINARIO_BENS_DURAVEIS).
  REG.pibWallace.despesaTotalComp = r2(REG.operacional.necessidadeTotalBruta + REG.pibWallace.consumoNaoRecorrente);
  REG.pibWallace.poupancaRS = r2(REG.pibWallace.receitaTotalComp - REG.pibWallace.despesaTotalComp);
  REG.pibWallace.taxaPoupancaPct = REG.pibWallace.receitaTotalComp ? r2(REG.pibWallace.poupancaRS / REG.pibWallace.receitaTotalComp * 100) : null;
  // Crescimento Patrimonial: precisa do patrimônio líquido do FECHAMENTO do ciclo anterior, que só
  // existe a partir do momento em que passarmos a persistir esse campo (ver RPC abaixo). Enquanto não
  // existir histórico, fica null (mesmo padrão já usado pra Taxa de Crescimento do PIB Wallace — nunca
  // inventa 0%, só mostra quando o dado existir de verdade).
  REG.pibWallace.patrimonioInicialCiclo = (pibCicloAnterior && typeof pibCicloAnterior.patrimonioLiquido === 'number') ? pibCicloAnterior.patrimonioLiquido : null;
  REG.pibWallace.crescimentoPatrimonialRS = REG.pibWallace.patrimonioInicialCiclo != null ? r2(REG.balanco.patrimonioLiquido - REG.pibWallace.patrimonioInicialCiclo) : null;
  REG.pibWallace.crescimentoPatrimonialPct = REG.pibWallace.patrimonioInicialCiclo ? r2(REG.pibWallace.crescimentoPatrimonialRS / Math.abs(REG.pibWallace.patrimonioInicialCiclo) * 100) : null;

  // Grava o snapshot deste ciclo no histórico (fire-and-forget, mesmo padrão das outras persistências
  // deste arquivo). Persiste também patrimonioLiquido/receitaTotalComp/despesaTotalComp/poupancaRS/
  // taxaPoupancaPct (novos), os campos antigos do PIB Wallace continuam gravados, intactos.
  // CORRIGIDO 09/08/2026 (achado de seguranca, mesma varredura das outras 4 RPCs): registrar_pib_mensal
  // tambem exige login/service_role agora - envia o token real, mesmo padrao de obterTokenAuthSupabase().
  const tokenAuthPib = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';
  if(typeof fetch !== 'undefined'){
    fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/registrar_pib_mensal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg',
        'Authorization': 'Bearer ' + tokenAuthPib
      },
      body: JSON.stringify({ p_mes: VARS.cicloAtual, p_snapshot: {
        salarioLiquido: REG.pibWallace.salarioLiquido, reembolsos: REG.pibWallace.reembolsos,
        rendimentos: REG.pibWallace.rendimentos, valorizacaoInvestimentos: REG.pibWallace.valorizacaoInvestimentos,
        consumoNaoRecorrente: REG.pibWallace.consumoNaoRecorrente, total: REG.pibWallace.total,
        entradasTotais: REG.operacional.entradasTotais,
        patrimonioLiquido: REG.balanco.patrimonioLiquido,
        receitaTotalComp: REG.pibWallace.receitaTotalComp, despesaTotalComp: REG.pibWallace.despesaTotalComp,
        poupancaRS: REG.pibWallace.poupancaRS, taxaPoupancaPct: REG.pibWallace.taxaPoupancaPct,
        registradoEm: new Date().toISOString()
      }})
    }).catch(err=>console.warn('registrar_pib_mensal: erro de rede (nao critico, tela ja mostra o valor calculado)', err));
  }

  // CORRIGIDO 05/08/2026 (parte 100, usuario apontou o erro real: "como 100% virou riqueza, nao tem
  // que descontar todos meus gastos" - tinha razao). Formula antiga (PIB Wallace / Entradas Totais)
  // dava ~100% quase sempre, porque o proprio PIB Wallace = Salario Liquido + Reembolsos + ... , que
  // e quase a MESMA COISA que Entradas Totais (Salario + Reembolso liquido) - o PIB nunca desconta os
  // gastos reais do ciclo (Boletos, Caixa Variavel, aportes), so desconta o "consumo nao recorrente"
  // (bens duraveis avulsos, tipicamente pequeno). Dividir uma coisa quase igual a outra sempre da ~100%,
  // numero tecnicamente correto pra formula errada, mas inutil como indicador. Eficiencia Financeira
  // de verdade precisa ser uma TAXA DE POUPANCA: quanto da renda sobrou depois de TODOS os gastos
  // comprometidos do ciclo (REG.balanco.fluxo.saidas, ja calculado em recalcularNecessidade()).
  REG.pibWallace.eficienciaFinanceiraPct = REG.balanco.fluxo.entradas ? r2(REG.balanco.fluxo.resultado / REG.balanco.fluxo.entradas * 100) : null;
}
