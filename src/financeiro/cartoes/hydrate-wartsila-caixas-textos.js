// MÓDULO: hydrateWartsilaCaixasTextos() — renderização do card Caixa Wärtsilä (fatura/excedente/
// provisionado), dos textos de aporte + barras de progresso das caixas Saúde Família/Aniversário
// Júlio/Seguro Emplacamento, e do resíduo de Livros Razão (tfLRCDetalhe/tfPixDiversosDetalhe/
// tfPixDiversosLiquido — ver nota em ESTADO_ATUAL.md seção 2.3c). Extraído de hydrate() (app.js) na
// modularização (07/08/2026). Script clássico (não ES module), carrega ANTES do app.js — hydrate() é
// síncrona (onDomPronto(hydrate), dentro do próprio app.js) e chama hydrateWartsilaCaixasTextos() no
// meio da própria execução. C/pctOf redeclarados aqui a partir de REG (mesmo padrão já usado em
// hydrateCaixas). Nenhum id de DOM, fórmula ou comportamento mudou.
function hydrateWartsilaCaixasTextos(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;
  const C = R.caixasOperacionais;
  const pctOf = (s,m) => m>0 ? Math.min(100, s/m*100) : 0;

  // CORRIGIDO 07/08/2026 (pedido do usuário: "aqui tem que ter o saldo da caixa, esse valor tá
  // parecendo a fatura"): o número principal do card mostrava R.faturaWartsila (valor da fatura,
  // pendência), não o saldo real da Caixa Wärtsilä - confuso, parecia fatura em aberto quando na
  // verdade é o dinheiro provisionado na própria caixa. Card renomeado "Caixa Wärtsilä" (era "Fatura
  // Wärtsilä"), número principal agora é o saldo real (R.wartsilaCaixa.provisionado); a fatura passa
  // a aparecer só como texto secundário (onde antes ficava "Provisionado").
  t('cxWartsila', fmt(R.wartsilaCaixa.provisionado));
  // CORRIGIDO 31/07/2026 (V224, bug real apontado pelo usuario): texto era LITERAL "100% coberto · excedente
  // "+valor, mesmo quando o excedente era NEGATIVO - mentira. CORRIGIDO DE NOVO 07/08/2026 (bug real
  // apontado pelo usuario: "essa legenda não está correta, o dinheiro da caixa é de reembolso" - a
  // R$393,74 provisionados na caixa SÃO reembolso já recebido, TX000220): o gate usava
  // R.reembolsos.recebidosNoCiclo (reembolsoCicloTotal - reembolsosAReceber, um indicador GERAL do
  // ciclo, não desta caixa especificamente) - como reembolsosAReceber (o que ainda falta vir) é maior
  // que o total recebido até agora, essa conta dá NEGATIVA mesmo com dinheiro real na caixa, caindo
  // sempre em "R$0 recebido" independente da realidade do provisionado. Trocado para comparar só os
  // 2 números que realmente pertencem a esta caixa: provisionado (dinheiro que já entrou aqui) vs
  // fatura (o que ainda precisa ser coberto).
  const barWartsila = $('cxWartsilaBar');
  const pctWartsila = R.faturaWartsila > 0 ? Math.min(100, Math.max(0, R.wartsilaCaixa.provisionado / R.faturaWartsila * 100)) : 100;
  if(R.faturaWartsila <= 0){
    t('cxWartsilaExcedente', 'Sem fatura pendente nesta caixa');
    if(barWartsila){ barWartsila.style.width = '100%'; barWartsila.style.background = 'var(--green)'; }
  } else if(R.wartsilaCaixa.provisionado <= 0){
    t('cxWartsilaExcedente', 'Aguardando reembolso (ainda nada provisionado nesta caixa)');
    if(barWartsila){ barWartsila.style.width = '0%'; barWartsila.style.background = 'var(--amber)'; }
  } else if(R.wartsilaCaixa.excedente >= 0){
    t('cxWartsilaExcedente', '100% coberto · excedente '+fmt(R.wartsilaCaixa.excedente));
    if(barWartsila){ barWartsila.style.width = '100%'; barWartsila.style.background = 'var(--green)'; }
  } else {
    t('cxWartsilaExcedente', 'Parcialmente coberto · faltam '+fmt(Math.abs(R.wartsilaCaixa.excedente)));
    if(barWartsila){ barWartsila.style.width = pctWartsila+'%'; barWartsila.style.background = 'var(--amber)'; }
  }
  t('cxWartsilaProvisionado', 'Fatura '+fmt(R.faturaWartsila));
  t('cxSaudeAporteTxt', '2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa + 2x endócrino Wallace/ano · aporte '+fmt(VARS.aporteSaudeFamilia)+'/mês');
  { const el=$('cxSaudeSaldo'); const bar = el ? el.closest('.card').querySelector('.fill') : null; if(bar) bar.style.width = pctOf(C.saudeFamilia.saldo, C.saudeFamilia.meta)+'%'; } // V177 CORRIGIDO: barra estava fixa em 0%
  t('cxAnivAporteTxt', 'Nova · aporte '+fmt(VARS.aporteAniversarioJulio)+'/mês até 14/09');
  { const el=$('cxAnivSaldo'); const bar = el ? el.closest('.card').querySelector('.fill') : null; if(bar) bar.style.width = pctOf(C.aniversarioJulio.saldo, C.aniversarioJulio.meta)+'%'; } // V176 CORRIGIDO: barra estava fixa em 0%, nunca era preenchida pelo JS
  t('cxSeguroAporteTxt', 'Nova · aporte '+fmt(VARS.seguroEmplacamentoAporte)+'/mês (permanente)');
  { const el=$('cxSeguroSaldo'); const bar = el ? el.closest('.card').querySelector('.fill') : null; if(bar) bar.style.width = pctOf(C.seguroEmplacamento.saldo, C.seguroEmplacamento.meta)+'%'; } // V176 CORRIGIDO: mesma falha
  t('tfLRCDetalhe', R.livroLRCDetalhe.qtd+' lançamentos · Reembolso pendente '+fmt(R.livroLRCDetalhe.valor));
  t('tfPixDiversosDetalhe', 'Saídas '+fmt(R.pixDiversos.saidas)+' · Entradas '+fmt(R.pixDiversos.entradas));
  t('tfPixDiversosLiquido', 'Líquido '+(R.pixDiversos.liquido<0?'− ':'+ ')+fmt(Math.abs(R.pixDiversos.liquido)));
  // V145: secao 14 "Escola de Julio" removida do Painel Completo (pedido do usuario). ejSaldo/ejBar/ejPct/
  // ejMeta nao existem mais no HTML - card cxEscolaSaldo (secao 05, Caixas Operacionais) e balResEscola
  // (Balanco) continuam existindo e sendo hidratados normalmente, so a secao 14 dedicada foi removida.
}
