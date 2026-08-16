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

// CORRIGIDO 16/08/2026 (achado do usuário, print real: "Pessoal (s/ corporativo)" R$3.942,01 vs soma
// das categorias detalhadas R$4.518,73 — gap de R$576,72 "escondido"). Causa raiz: mbDetalhe.corp/
// wallace/vanessa viraram 100% dinâmicos (Onda 3 recalcula wallace/vanessa da V2, Onda 10 recalcula
// corp da V2), mas cada Onda só atualiza o DOM que ela mesma conhece (mbLRW/mbLRV a Onda 3; tfLRC a
// Onda 10) — NENHUMA delas recalculava mbPessoal nem mbLRNaoReconciliado depois, e mbNaoReconciliado
// (VARS) sempre foi um literal fixo em 0 (nunca calculado de verdade, achado documentado desde
// 11/08/2026). Resultado: a divergência real entre o total manualmente reconciliado (VARS.cartaoMBTotal,
// "a fatura sempre vence", nunca deve virar soma automática — ver seção 1 do manual) e a soma ao vivo
// das categorias ficava invisível, mostrando sempre "Não reconciliado: R$0,00" mesmo quando não era.
// Esta função resincroniza mbDetalhe.corp/wallace/vanessa com os VARS mais recentes, recalcula
// naoReconciliado de verdade (mesma soma-auditada usada no Visa, ver comentário de reg-mercado-pago.js)
// e re-hidrata só os 3 campos que dependem disso (mbLRC/mbPessoal/mbLRNaoReconciliado) — chamada no
// FIM de aplicarOnda3LrwLrv() e aplicarOnda10LrcLimbo(), idempotente, nunca sobrescreve com dado velho
// (só lê o que já está em VARS no momento da chamada).
function recalcularEHidratarMbPessoal(){
  if(typeof REG === 'undefined' || !REG.mbDetalhe) return;
  const R = REG;
  const D = R.mbDetalhe;
  D.corp = VARS.mbLRCConfirmado;
  D.wallace = VARS.mbLRWConfirmado;
  D.vanessa = VARS.mbLRVConfirmado;
  const somaPartes = Math.round((D.wallace + D.vanessa + D.parcelas + D.assinaturas + D.recorrencias + D.consorcios) * 100) / 100;
  D.naoReconciliado = Math.round((R.cartaoMB.total - D.corp - somaPartes) * 100) / 100;
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  t('mbLRC', fmt(D.corp));
  t('mbPessoal', fmt(VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado ? VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].mastercardBlackPessoalCongelado : (R.cartaoMB.total - D.corp)));
  t('mbLRNaoReconciliado', fmt(D.naoReconciliado));
  // Donut "Composição" (seção 10) foi desenhado no boot com o mbDetalhe de então — atualiza junto,
  // mesmo padrão de atualizarGraficoCaixas()/atualizarGraficoPatrimonio() já usados no resto do arquivo.
  if(window.WALLACE_CHARTS && window.WALLACE_CHARTS.mbComposicao){
    window.WALLACE_CHARTS.mbComposicao.data.datasets[0].data = Object.values(D);
    window.WALLACE_CHARTS.mbComposicao.update();
  }
}
