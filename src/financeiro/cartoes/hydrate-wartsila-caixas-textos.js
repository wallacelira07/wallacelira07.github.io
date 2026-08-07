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

  t('cxWartsila', fmt(R.faturaWartsila));
  // CORRIGIDO 31/07/2026 (V224, bug real apontado pelo usuario): texto era LITERAL "100% coberto · excedente
  // "+valor, mesmo quando o excedente era NEGATIVO (ex: hoje, R$53,74 provisionado - R$5.768,06 de fatura =
  // -R$5.714,32, mas a tela dizia "100% coberto" do mesmo jeito - mentira). Corrigido para 2 problemas:
  // (1) so mostra "coberto" de verdade quando o reembolso do ciclo ja foi CONFIRMADO recebido
  // (REG.reembolsos.recebidosNoCiclo > 0) - antes disso e so fatura/provisionamento esperado, nao cobertura
  // real; (2) quando ha cobertura, o texto reflete o sinal certo (coberto com sobra vs faltando cobrir).
  if(R.reembolsos.recebidosNoCiclo <= 0){
    t('cxWartsilaExcedente', 'Aguardando confirmação do reembolso (ainda R$0 recebido este ciclo)');
  } else if(R.wartsilaCaixa.excedente >= 0){
    t('cxWartsilaExcedente', '100% coberto · excedente '+fmt(R.wartsilaCaixa.excedente));
  } else {
    t('cxWartsilaExcedente', 'Parcialmente coberto · faltam '+fmt(Math.abs(R.wartsilaCaixa.excedente)));
  }
  t('cxWartsilaProvisionado', 'Provisionado '+fmt(R.wartsilaCaixa.provisionado));
  t('cxSaudeAporteTxt', '2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa/ano · aporte '+fmt(VARS.aporteSaudeFamilia)+'/mês');
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
