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
  // CORRIGIDO 12/08/2026 (achado do usuário, print real: card sempre verde mesmo negativo) — classe
  // "val g" fixa no HTML nunca trocava pra vermelho quando negativo, mesmo bug já corrigido em
  // 10/08/2026 no card gêmeo "coverCaixaVar" (hydrate-resumo-p2p.js) mas não replicado aqui.
  const kpiCaixaVarDispEl = $('kpiCaixaVarDisp');
  if(kpiCaixaVarDispEl) kpiCaixaVarDispEl.classList.toggle('r', R.caixaVariavel.disponivel < 0);
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

  // CORRIGIDO 10/08/2026 (achado do usuário: legenda estática, números de julho/2026 nunca
  // atualizados, e descrevia uma regra JÁ CORRIGIDA em 26/07/2026 — Cobertura Garantida deixou de
  // ser "soma automática de MP corp + Visa Infinite corp" e virou valor 100% manual, só existe
  // quando o usuário confirma "coloquei R$X na caixa Y cobrindo a fatura Z" (ver
  // recalcular-necessidade.js:25, VARS.coberturaGarantidaConfirmada). A legenda antiga ainda citava
  // R$954,90 — o mesmo número que `vars-operacional.js:122` já registra como "nunca existiu de
  // fato". Diferente das outras ~28 legendas estáticas (hydrate-roc.js, tabela `legendas`), esta
  // agora é COMPUTADA a cada hydrateResumoExecutivo() — nunca mais fica presa a um número antigo,
  // acompanha automaticamente qualquer futura confirmação real de Cobertura Garantida.
  const legNecBrutaLiquidaEl = $('legNecessidadeBrutaLiquida');
  if(legNecBrutaLiquidaEl){
    const cg = R.operacional.coberturaGarantida;
    legNecBrutaLiquidaEl.innerHTML = cg > 0
      ? `Bruta assume nenhuma fatura provisionada (pior cenário). Líquida desconta a Cobertura Garantida confirmada: <span class="v">${fmt(cg)}</span> — só conta quando você coloca o valor numa caixa e informa o que ele cobre (nunca calculada automática pela cascata de reembolso).`
      : `Bruta assume nenhuma fatura provisionada (pior cenário). Líquida desconta a Cobertura Garantida — hoje <span class="v">R$0,00</span> (nada confirmado ainda), então Bruta e Líquida são o mesmo valor. Só passa a divergir quando você confirmar que colocou um valor numa caixa cobrindo uma fatura específica (nunca calculada automática pela cascata de reembolso Wärtsilä).`;
  }

  // CORRIGIDO 12/08/2026 (achado de auditoria: legenda tinha "Custos Variáveis R$2.000,00 + PIX
  // Vanessa R$1.200,00" escrito fixo na string — se um dos 2 tetos mudasse, o texto ficava
  // desatualizado sem ninguém perceber). Mesmo tratamento de legNecessidadeBrutaLiquida acima:
  // computa os 2 valores reais (REG.caixaVariavel.tetoOficial e REG.caixasOperacionais.pixVanessa.
  // meta) a cada render — excluída do loop genérico de hydrate-roc.js (ver LEGENDAS_CALCULADAS lá).
  const legOrcCompEl = $('legOrcamentoOperacionalComposicao');
  if(legOrcCompEl){
    const tetoCV = R.caixaVariavel.tetoOficial;
    const metaPV = R.caixasOperacionais.pixVanessa.meta;
    legOrcCompEl.innerHTML = `Orçamento livre do dia a dia: Custos Variáveis <span class="v">${fmt(tetoCV)}</span> + PIX Vanessa <span class="v">${fmt(metaPV)}</span>.`;
  }

  // CORRIGIDO 12/08/2026 (achado de auditoria: legenda tinha "R$ 306,73" fixo — saldo real da PGV
  // muda a cada lançamento, texto nunca acompanhava). Mesmo tratamento: lê
  // REG.caixasOperacionais.pixGeralVanessa.saldo (mesma fonte do card cxPgvSaldo, ver
  // hydrate-caixas.js) a cada render — excluída do loop genérico de hydrate-roc.js.
  const legPGVEl = $('legPGVSaldoResidual');
  if(legPGVEl){
    const saldoPGV = R.caixasOperacionais.pixGeralVanessa.saldo;
    legPGVEl.innerHTML = `Saldo real da Caixa Pix Geral: <strong>${fmt(saldoPGV)}</strong>. Fonte: V2 pura (tabela transações), sem depender do array V1 — qualquer lançamento confirmado dentro do ciclo aparece aqui automaticamente, sem sincronização manual.`;
  }
}
