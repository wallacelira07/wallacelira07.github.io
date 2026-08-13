// MÓDULO: hydrateEstimadorSalario() — renderização do Estimador de Salário (ciclo seguinte): líquido
// projetado, rótulo dinâmico da fonte (real recebido/projetado/média ponderada 12M), necessidade
// líquida e excedente estimado. Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateEstimadorSalario() no meio da própria execução, na mesma
// posição exata (entre hydrateCenarios() e hydrateLivrosRazao()). Nenhum id de DOM, fórmula ou
// comportamento mudou.
function hydrateEstimadorSalario(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // Fase 3 - Estimador de Salario (ciclo que comeca 25/07 = Ago/26)
  t('estLiquido', fmt(liquidoMes(0)));
  { // Rótulo dinâmico: mostra qual fonte da regra de 3 níveis está ativa agora (real/projetado/média).
    const diaHoje = new Date().getDate();
    const temReal = (REG.superavitNormal.liquidoReal||{})[0] != null;
    const fonteLabel = temReal ? 'Real recebido'
      : (diaHoje>=12 ? 'Projetado (Estimador de Salário)' : 'Média ponderada 12M (sem estimativa ainda)');
    // CORRIGIDO 01/08/2026 (V244): "Ciclo 25/07 (Ago/26)" era texto fixo, formato estranho apontado pelo
    // usuario - agora deriva do periodo real do ciclo atual (snap.periodo), formato "25/07 a Ago/26".
    const snapCicloTxt = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const [iniTxt, fimTxt] = snapCicloTxt.periodo.split(' a ');
    const [diaIni, mesIni] = iniTxt.split('/');
    const [, mesFim, anoFim] = fimTxt.split('/');
    const cicloTxt = diaIni+'/'+mesIni+' a '+MESES_ABREV[Number(mesFim)-1]+'/'+anoFim.slice(-2);
    t('estStatusFonte', 'Ciclo '+cicloTxt+' · '+fonteLabel);
  }
  // CORRIGIDO 13/08/2026 (achado de auditoria: comparava periodos diferentes) - estLiquido usa
  // liquidoMes(0) = ciclo ATUAL (ja real), mas necessidadeLiquidaProximoCiclo = evolucao.necessidadeLiquida[1]
  // = ciclo SEGUINTE. Excedente estimado tem que comparar o mesmo periodo: troca pra
  // evolucao.necessidadeLiquida[0], que e o mesmo ciclo atual usado em liquidoMes(0).
  t('estNecLiquida', fmt(R.evolucao.necessidadeLiquida[0]));
  const excedenteEst = liquidoMes(0) - R.evolucao.necessidadeLiquida[0];
  t('estExcedente', fmt(excedenteEst)+' · Modo Normal');
}
