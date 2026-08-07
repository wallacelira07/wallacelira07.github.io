// MÓDULO: hydrateResumoExecutivo() — renderização dos KPIs do topo (kpiPatrimonio/kpiTotalOp/etc),
// do card de Modo Operacional dinâmico (seção 02, 4 faixas), dos indicadores da seção 20 (Total
// Operacional/Orçamento/Cobertura Garantida) e do Resumo Executivo (seção 21: Patrimônio, Meta do
// Milhão, cartões, Wärtsilä, Total Operacional Mar/27) + 3 badges soltos (snCicloAtual/csNecTotal/
// csReembolsos). Última seção de hydrate() a ser modularizada — esgota a função. Extraído de
// hydrate() (app.js) na modularização (07/08/2026). Script clássico (não ES module), carrega ANTES
// do app.js — hydrate() é síncrona (onDomPronto(hydrate), dentro do próprio app.js) e chama
// hydrateResumoExecutivo() logo no início da própria execução. Nenhum id de DOM, fórmula ou
// comportamento mudou.
function hydrateResumoExecutivo(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  t('kpiPatrimonio', 'R$ '+Math.round(R.patrimonio.total).toLocaleString('pt-BR'));
  t('kpiPatrimonioPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('kpiTotalOp', 'R$ '+Math.round(R.operacional.totalOperacional).toLocaleString('pt-BR'));
  t('kpiNecBruta', Math.round(R.operacional.necessidadeTotalBruta).toLocaleString('pt-BR'));
  t('kpiNecLiquida', Math.round(R.operacional.necessidadeLiquida).toLocaleString('pt-BR'));
  t('kpiCaixaVarDisp', fmt(R.caixaVariavel.disponivel));
  t('kpiModoOp', R.operacional.modoOperacional);
  t('kpiSaldoCiclo', R.operacional.saldoCiclo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));

  t('s02Salario', fmt(R.operacional.salario));
  t('s02Reembolsos', fmt(R.operacional.reembolsosAReceber));
  t('s02Entradas', fmt(R.operacional.entradasTotais));
  t('s02SaldoCiclo', R.operacional.saldoCiclo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  // CORRIGIDO 25/07/2026 (V143→V144): este card era 100% texto fixo ("Salário Alto", badge "Alto",
  // texto de "cumprir aportes") - nunca mudava mesmo quando o Modo Operacional real era outro. Agora
  // reage de verdade as 4 faixas da secao 10 das Politicas.
  (function(){
    const modo = R.operacional.modoOperacional;
    const cfg = {
      'Crítico': {cor:'#e2554f', badge:'Crítico', titulo:'Salário Crítico', faixa:'(< R$ 0)', texto:'Suspender aportes patrimoniais.'},
      'Baixo':   {cor:'#e2a13f', badge:'Baixo',   titulo:'Salário Baixo',   faixa:'(R$ 0 – R$ 2.999)', texto:'Reduzir gastos na ordem: Churrasco → Combustível → Eventos → Manutenção.'},
      'Normal':  {cor:'#e8d34f', badge:'Normal',  titulo:'Salário Normal',  faixa:'(R$ 3.000 – R$ 7.999)', texto:'Cumprir aportes normalmente.'},
      'Alto':    {cor:'var(--green)', badge:'Alto', titulo:'Salário Alto',  faixa:'(≥ R$ 8.000)', texto:'Cumprir todos os aportes e direcionar todo excedente para Caixa Lance e BTG/Necton.'},
    }[modo] || {cor:'var(--green)', badge:'—', titulo:'Modo Operacional', faixa:'', texto:''};
    t('s02ModoTitulo', cfg.titulo);
    t('s02ModoBadge', cfg.badge);
    t('s02ModoFaixa', cfg.faixa);
    t('s02ModoTexto', cfg.texto);
    const tituloEl = $('s02ModoTitulo');
    const cardEl = $('s02ModoCard');
    if(tituloEl) tituloEl.style.color = cfg.cor;
    if(cardEl) cardEl.style.borderLeftColor = cfg.cor;
  })();

  t('s20TotalOp', fmt(R.operacional.totalOperacional));
  t('s20Orcamento', fmt(R.operacional.orcamentoOperacional));
  t('s20NecBruta', fmt(R.operacional.necessidadeTotalBruta));
  t('s20Garantido', R.operacional.coberturaGarantida.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('s20NecLiquida', fmt(R.operacional.necessidadeLiquida));

  t('r21Patrimonio', fmt(R.patrimonio.total));
  t('r21MetaMilhaoPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('r21ModoOp', R.operacional.modoOperacional);
  t('r21Visa', fmt(R.cartaoInfinite.total));
  t('r21MB', fmt(R.cartaoMB.total));
  t('r21MP', fmt(R.mercadoPago));
  t('r21Wartsila', fmt(R.faturaWartsila));
  t('r21TotalOp', fmt(R.operacional.totalOperacional));
  const totalOpMar27 = R.evolucao.totalOperacional[R.evolucao.totalOperacional.length-1];
  t('r21TotalOpMar27', fmt(totalOpMar27));
}
