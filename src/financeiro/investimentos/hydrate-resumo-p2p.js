// MÓDULO: hydrateResumoP2P() — renderização dos "cover-metrics" (resumo do topo: Patrimônio/Meta do
// Milhão/Modo Operacional/Caixa Variável), do resumo da Caixa Variável (seção dedicada) e das
// Operações P2P (seção 18). Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateResumoP2P() no meio da própria execução. Nenhum id de
// DOM, fórmula ou comportamento mudou.
function hydrateResumoP2P(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;
  const fmtInt = v => 'R$ '+Math.round(v).toLocaleString('pt-BR');

  // cover-metrics
  // CORRIGIDO 10/08/2026 (pedido do usuário: "total como principal e um pequeno com o líquido, no
  // mesmo card") - coverPatrimonioTotal (novo, valor principal do card) = Físico+Financeiro+
  // Previdência+FGTS líquido de passivos (mesmo total já mostrado na aba Balanço,
  // REG.balanco.patrimonioTotalGeral). coverPatrimonio (id antigo, agora só a linha pequena) continua
  // sendo o líquido de sempre (Reserva+BTG/Necton+Caixa Lance+Necton CC).
  t('coverPatrimonioTotal', fmtInt(R.balanco.patrimonioTotalGeral));
  t('coverPatrimonio', fmtInt(R.patrimonio.total));
  t('coverMetaPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('coverModoOp', R.operacional.modoOperacional);
  t('coverCaixaVar', fmt(R.caixaVariavel.disponivel));

  // caixa variavel
  t('cvSaldoReal', fmt(R.caixaVariavel.saldoReal));
  t('cvComprometido', fmt(R.caixaVariavel.comprometido));
  t('cvDisponivel', fmt(R.caixaVariavel.disponivel));

  // NOVO 23/07/2026: Operacoes P2P (secao 18) - antes 100% hardcoded, agora vem do REG.p2p
  t('p2pCapitalTotal', fmt(R.p2p.capitalTotal));
  t('p2pCreditosRestantes', R.p2p.creditosRestantes + ' / ' + R.p2p.creditosTotal);
  t('p2pSaldoInvestido', fmt(R.p2p.saldoInvestido));
  t('p2pLucroRealizado', fmt(R.p2p.lucroRealizado));
  // CORRIGIDO 10/08/2026 (pedido do usuario: "revise todas as legendas, evite usar datas, causa
  // desincronizacao"): removida a parte hardcoded ("1 credito doado a Vanessa em 13/07" / "ultima
  // venda: TXP2P0003...") - eram fatos soltos no texto, nunca recalculados, ficavam desatualizados
  // a cada nova venda real. O que resta e 100% derivado de REG.p2p ao vivo.
  t('p2pDetalhe', `Custo ${fmt(R.p2p.precoCompra)}/crédito · Venda ${fmt(R.p2p.precoVenda)}/crédito (rentabilidade ${R.p2p.rentabilidadePct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}% sobre o custo) · ${R.p2p.creditosVendidos} créditos vendidos deste lote.`);
}
