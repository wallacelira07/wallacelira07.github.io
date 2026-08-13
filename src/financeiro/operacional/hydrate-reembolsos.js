// MÓDULO: hydrateReembolsos() — renderização dos indicadores de Reembolso (cascata Wärtsilä/MP/Cartão)
// e Meta de Investimento. Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateReembolsos() no meio da própria execução. Nenhum id de
// DOM, fórmula ou comportamento mudou.
function hydrateReembolsos(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // reembolsos e meta de investimento
  t('reembRecebidos', fmt(R.reembolsos.recebidosNoCiclo));
  t('reembAReceber', fmt(R.operacional.reembolsosAReceber));
  t('reembCicloTotal', fmt(R.operacional.reembolsoCicloTotal));
  t('reembPagaWartsila', fmt(R.faturaWartsila));
  t('reembPagaMP', fmt(R.operacional.reembolsoPagaMPCorporativo));
  // CORRIGIDO 13/08/2026 (achado de auditoria: este card lia R.visaDetalhe.corp+R.mbDetalhe.corp,
  // fonte V1/limbo do LRC do ciclo atual — mas o cálculo REAL de Sobra Pessoal/Cobertura Garantida
  // usa REG.operacional.reembolsoPagaCartaoCorporativo (V2/Supabase, sobrescrito pela Onda4 desde
  // 08/08/2026). O número exibido aqui podia divergir do que o sistema de fato subtraiu na cascata
  // logo abaixo, na mesma tela. Trocado pra ler a MESMA fonte usada no cálculo real.
  t('reembPagaCartao', fmt(R.operacional.reembolsoPagaCartaoCorporativo));
  t('reembSobraPessoal', fmt(R.operacional.reembolsoSobraPessoal));
  t('reembMPPessoal', fmt(R.totalOpDetalhe.provMP)); // CORRIGIDO 20/07/2026: agora e literalmente o item 4 da cascata (usado no calculo de reembolsoSobraPessoal), nao mais um campo paralelo "so informativo".
  // NOVAS 12/08/2026 (linhas 6/7 da cascata, ver recalcular-necessidade.js pra fórmula real):
  // Manejo = VARS.reembolsoManejo (manual). Sobra Disponível = R.operacional.coberturaGarantida,
  // que agora É literalmente esse valor (Sobra Total - Manejo) - mesmo número, 2 nomes/contextos.
  t('reembManejo', fmt(VARS.reembolsoManejo || 0));
  t('reembSobraDisponivel', fmt(R.operacional.coberturaGarantida));
  t('metaInvTotal', fmt(R.metaInvestimento.investido));
  t('metaInvExcedente', fmt(R.metaInvestimento.excedente));
  t('metaInvMensal', fmt(R.metaInvestimento.meta));
  t('metaInvBadge', 'Total investido '+fmt(R.metaInvestimento.investido)+' · '+(R.metaInvestimento.excedente>=0?'Superada +':'Falta ')+fmt(Math.abs(R.metaInvestimento.excedente)));
  t('metaInvBTG', fmt(VARS.aporteBTGPactual + VARS.depositoAtivacaoNecton)); // CORRIGIDO 25/07/2026 (V159): usuario esclareceu que sao a mesma coisa - consolidados em 1 campo so (era duplicado, 2 linhas separadas para o mesmo conceito).
}
