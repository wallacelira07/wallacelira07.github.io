// MÓDULO: hydrateCenarios() — renderização da página Cenários: Reserva de Emergência (seção 04:
// cenário normal x extremo, ciclos de cobertura) e Cenário Histórico (seção 01/02: mediana/desvio
// padrão, pior mês, mês médio). Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateCenarios() no meio da própria execução. Nenhum id de DOM,
// fórmula ou comportamento mudou.
function hydrateCenarios(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // Fase 3 - Reserva de Emergencia (secao 04, pagina Cenarios)
  const ciclosNormal = R.reserva.atual / R.operacional.necessidadeTotalBruta;
  const ciclosExtremo = R.reserva.atual / R.reserva.piso;
  t('resNormalValor', fmt(R.operacional.necessidadeTotalBruta)+' /ciclo');
  t('resNormalCiclos', '≈ '+ciclosNormal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ciclos (~'+Math.round(ciclosNormal)+' meses)');
  t('resExtremoValor', fmt(R.reserva.piso)+' /ciclo');
  t('resExtremoCiclos', '≈ '+ciclosExtremo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ciclos (~'+ciclosExtremo.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' meses)');
  t('resAtual', R.reserva.atual.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('resDiffMeses', (ciclosExtremo-ciclosNormal).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}));

  // cenario historico (Cenarios secao 01/02) - formulas: saldo(salario) = salario + reembolsos - necessidadeTotalBruta
  const fmtSign = v => (v<0?'−':'+')+'R$'+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const CH = R.cenarioHistorico;
  const saldoDe = liquido => liquido + R.operacional.reembolsoSobraPessoal - R.operacional.necessidadeTotalBruta;
  t('chMediana', CH.mediana.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('chDesvpad', CH.desvioPadrao.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  // CORRIGIDO 15/08/2026 (achado de auditoria: "44,7% da média" era texto fixo no HTML, calculado
  // contra uma média antiga — hoje (desvioPadrao/media) bate ~46,2%, não 44,7%). Calculado em runtime.
  if(CH.media) t('chDesvpadPct', (CH.desvioPadrao/CH.media*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  // CORRIGIDO 15/08/2026 (achado de auditoria: "(do ciclo atual, 25/06-24/07)" era texto fixo, citava
  // um ciclo já encerrado há semanas). Mesmo padrão já usado em hydrateEstimadorSalario() (estStatusFonte).
  {
    const snapCiclo = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    if(snapCiclo) t('csCicloPeriodo', snapCiclo.periodo);
  }
  t('chPiorValor', fmt(CH.piorMes));
  t('chPiorSaldo', fmtSign(saldoDe(CH.piorMes)));
  t('chEquilibrio', fmt(R.operacional.necessidadeTotalBruta - R.operacional.reembolsoSobraPessoal));
  t('chMediaValor', fmt(CH.media));
  t('chMediaSaldo', fmtSign(saldoDe(CH.media)));
}
