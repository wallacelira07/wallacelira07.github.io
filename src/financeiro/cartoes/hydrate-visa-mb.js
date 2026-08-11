// MÓDULO: hydrateVisaMB() — renderização do breakdown Visa Infinite e Mastercard Black (LRW/LRV/LRP/
// LRS/LRR/LRCON/LRC por cartão, pessoal, não reconciliado). Extraído de hydrate() (app.js) na
// modularização (07/08/2026). Script clássico (não ES module), carrega ANTES do app.js — hydrate() é
// síncrona (onDomPronto(hydrate), dentro do próprio app.js) e chama hydrateVisaMB() no meio da
// própria execução. Nenhum id de DOM, fórmula ou comportamento mudou.
function hydrateVisaMB(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // NOVO 11/08/2026 (pedido do usuário: promover a fatura real da Pluggy como fonte do headline total,
  // ver promoverFaturaPluggyComoFonte() em pluggy-reconciliacao.js — mesmo padrão de selo já usado em
  // "Fatura atual (aberta)" do Mercado Pago): mostra a origem do número, nunca finge que é sempre a
  // fatura real quando na verdade é o fallback reconciliado manualmente.
  const badgeOrigem = (origemVar) => VARS[origemVar] === 'pluggy'
    ? ' <span style="font-size:0.62rem;color:var(--green)" title="Valor vindo direto da fatura real da Pluggy, atualizado automaticamente">🔄 Pluggy</span>'
    : ' <span style="font-size:0.62rem;color:var(--text-dim)" title="Pluggy sem fatura em aberto confiável nesta carga — valor reconciliado manualmente">📝 manual</span>';

  // visa infinite
  const visaTotalEl = $('visaTotal');
  if(visaTotalEl) visaTotalEl.innerHTML = fmt(R.cartaoInfinite.total) + badgeOrigem('cartaoInfiniteTotalOrigem');
  t('visaPessoal', fmt(R.cartaoInfinite.total - R.visaDetalhe.corp));
  t('visaLRW', fmt(R.visaDetalhe.wallace));
  t('visaLRV', fmt(R.visaDetalhe.vanessa));
  t('visaLRP', fmt(R.visaDetalhe.parcelas));
  t('visaLRS', fmt(R.visaDetalhe.assinaturas));
  t('visaLRR', fmt(R.visaDetalhe.recorrencias));
  t('visaLRCON', fmt(R.visaDetalhe.consorcios));
  t('visaLRC', fmt(R.visaDetalhe.corp));
  t('visaLRNaoReconciliado', fmt(R.visaDetalhe.naoReconciliado)); // V135: residuo soma-livros x fatura-real, documentado (P1)
  // mastercard black
  const mbTotalEl = $('mbTotal');
  if(mbTotalEl) mbTotalEl.innerHTML = fmt(R.cartaoMB.total) + badgeOrigem('cartaoMBTotalOrigem');
  t('mbPessoal', fmt(VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado ? VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].mastercardBlackPessoalCongelado : (R.cartaoMB.total - R.mbDetalhe.corp))); // CORRIGIDO 26/07/2026 (V177): usuario esclareceu que o ciclo fechado deve mostrar o valor CONGELADO do fechamento artificial (R$1.849,31), nao a formula viva recalculada com dados atuais.
  t('mbLRW', fmt(R.mbDetalhe.wallace));
  t('mbLRV', fmt(R.mbDetalhe.vanessa));
  t('mbLRP', fmt(R.mbDetalhe.parcelas));
  t('mbLRS', fmt(R.mbDetalhe.assinaturas));
  t('mbLRR', fmt(R.mbDetalhe.recorrencias));
  t('mbLRCON', fmt(R.mbDetalhe.consorcios));
  t('mbLRC', fmt(R.mbDetalhe.corp));
  t('mbLRNaoReconciliado', fmt(R.mbDetalhe.naoReconciliado)); // NOVO 11/08/2026: residuo soma-livros x fatura-real, mesma logica ja usada no Visa (visaLRNaoReconciliado)
}
