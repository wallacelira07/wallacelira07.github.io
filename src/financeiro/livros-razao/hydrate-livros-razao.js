// MÓDULO: hydrateLivrosRazao() — renderização dos totais (tfoot) das tabelas de Livros Razão
// (LRW/LRV/LRB/LRP/LRS/LRR/LRCON/LRC/LRMP/LRPV). Extraído de hydrate() (app.js) na modularização
// (07/08/2026). Script clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona
// (onDomPronto(hydrate), dentro do próprio app.js) e chama hydrateLivrosRazao() no meio da própria
// execução. Nenhum id de DOM, fórmula ou comportamento mudou.
function hydrateLivrosRazao(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // Fase 3 - totais dos livros razao (tfoot de cada tabela)
  const fmtSinal = v => (v<0?'− ':'')+fmt(Math.abs(v));
  const L = R.livrosRazaoTotais;
  t('tfLRW', fmt(L.LRW.total));
  t('tfLRV', fmt(L.LRV.total));
  t('tfLRB', fmt(L.LRB.total));
  t('tfLRP', fmt(L.LRP.total));
  t('tfLRS', fmt(L.LRS.total));
  t('tfLRR', fmt(L.LRR.total));
  t('tfLRCON', fmt(L.LRCON.total));
  t('tfLRC', fmt(L.LRC.total));
  t('tfLRMP', fmt(L.LRMP.total));
  t('tfLRPV', fmt(L.LRPV.total));
  // tfLRCV/tfLRCVresumo removidos (18/07/2026, V84): a tabela LRCV foi dividida em "PIX/gastos reais"
  // (visível) vs "movimentações internas" (recolhível, <details>) porque misturar as duas fazia o
  // total "líquido" não significar nada (soma de gasto real + repasse de boleto + LREI + venda de P2P).
  // Os 2 rodapés agora são texto estático mantido manualmente junto com as linhas da tabela.
}
