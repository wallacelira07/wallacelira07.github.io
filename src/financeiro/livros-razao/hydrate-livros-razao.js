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
  // CORRIGIDO 08/08/2026 (bug real reportado pelo usuário — "as somas dos LRs estão erradas"):
  // tfLRW/tfLRV NÃO são mais escritos aqui. Causa raiz: L.LRW.total/L.LRV.total (reg-balanco.js)
  // são valores HARDCODED desde 25/07/2026 (V152, "filtro por ciclo" — só limbo+ciclo atual, 1 e 3
  // lançamentos respectivamente), nunca atualizados enquanto VARS.LRW_TRANSACOES/LRV_TRANSACOES
  // cresceram pra 19 e 16 itens. Escrever aqui competia com renderLivrosVariaveis() (que soma o
  // array real, sempre em dia) pelo MESMO id de DOM — dependendo da ordem, o rodapé mostrava um
  // total de semanas atrás (ex: R$35,95) junto de uma contagem atual (16 lançamentos), inconsistente
  // entre si. renderLivrosVariaveis() (render-livros-variaveis.js) já escreve tfLRW/tfLRV
  // corretamente a partir do array real — nunca duplicar a mesma soma em 2 lugares.
  // CORRIGIDO 20/08/2026 (mesmo bug do tfLRW/tfLRV acima — achado do usuário: "a quantidade de
  // recorrências está correta (7), mas o total do rodapé está errado", somando os 7 valores exibidos
  // dava R$1.584,72 mas o rodapé mostrava R$1.279,65): tfLRR também competia por aqui com
  // aplicarOnda9LivrosFixos() (hydrate-onda9-livros-fixos.js), que soma o array real da V2 sempre em
  // dia. L.LRR.total (reg-balanco.js) é hardcoded e nunca acompanhou o array crescer — mesma causa
  // raiz do bug já documentado acima pro LRW/LRV, só que ninguém tinha notado ainda pro LRR.
  t('tfLRB', fmt(L.LRB.total));
  t('tfLRP', fmt(L.LRP.total));
  t('tfLRS', fmt(L.LRS.total));
  t('tfLRCON', fmt(L.LRCON.total));
  t('tfLRC', fmt(L.LRC.total));
  t('tfLRMP', fmt(L.LRMP.total));
  t('tfLRPV', fmt(L.LRPV.total));
  // tfLRCV/tfLRCVresumo removidos (18/07/2026, V84): a tabela LRCV foi dividida em "PIX/gastos reais"
  // (visível) vs "movimentações internas" (recolhível, <details>) porque misturar as duas fazia o
  // total "líquido" não significar nada (soma de gasto real + repasse de boleto + LREI + venda de P2P).
  // Os 2 rodapés agora são texto estático mantido manualmente junto com as linhas da tabela.
}
