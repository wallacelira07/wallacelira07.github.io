// MÓDULO: trocarCiclo()/atualizarGraficosPorCiclo()/atualizarBotoesSeletorCiclo() — troca o ciclo
// financeiro selecionado (recalcula VARS/REG, re-hidrata a tela, atualiza gráficos e botões do
// seletor). Extraído de app.js na modularização (07/08/2026). Chamadas por referência de função
// (onclick inline gerado em popular-seletor-ciclo.js, e onDomPronto/chamadas internas) — todas as
// funções/globais que estas 3 usam (aplicarCicloAoVARS, recalcularAgregadosDerivados, hydrate,
// WallaceBus, renderLivrosVariaveis, atualizarContadoresAbasLR, CICLO_LISTA, VARS, REG) já existem no
// momento da CHAMADA (sempre depois do app.js inteiro ter carregado), mesmo estas 3 funções sendo
// definidas num módulo carregado ANTES do app.js. Nenhuma fórmula ou comportamento mudou.
function trocarCiclo(cicloKey){
  aplicarCicloAoVARS(cicloKey);
  recalcularAgregadosDerivados();
  // V300 (Etapa 2): eventos aditivos, emitidos depois do recalculo real - nao mudam o que ja acontecia.
  WallaceBus.emit('cicloAlterado', {cicloKey});
  WallaceBus.emit('saldoAtualizado', {saldoReal: REG.caixaVariavel.saldoReal, comprometido: REG.caixaVariavel.comprometido, disponivel: REG.caixaVariavel.disponivel});
  hydrate();
  renderLivrosVariaveis(); // V174: regenera as tabelas LRW/LRV/LRC-limbo/LRPV com os dados do ciclo selecionado - antes so rodava no carregamento inicial, nunca ao trocar de ciclo
  atualizarBotoesSeletorCiclo();
  atualizarGraficosPorCiclo();
  atualizarContadoresAbasLR();
  // NOVO 19/08/2026 (achado da investigacao P0 V1xV2: trocar de ciclo pelo seletor, sem F5, fazia a
  // Caixa Variavel reverter silenciosamente pro valor V1 congelado ate a proxima recarga de pagina,
  // porque aplicarOnda1V2/aplicarComprometidoCaixaVariavelV2 so rodavam 1x no boot via onDomPronto).
  // Aditivo, fire-and-forget (mesmo padrao do boot): reaproveita o cache em memoria do
  // WallaceFinanceService (sem fetch novo na pratica comum), nao altera nenhuma formula V1 existente
  // acima, e ja tem fallback de falha proprio (marcarIndisponivelV2) se o fetch V2 nao responder.
  // Rollback: remover este bloco - recalcularAgregadosDerivados() volta a ser a unica fonte pos-troca.
  if(typeof aplicarOnda1V2 === 'function' && typeof aplicarComprometidoCaixaVariavelV2 === 'function'){
    Promise.all([aplicarOnda1V2(), aplicarComprometidoCaixaVariavelV2()]).then(atualizarGraficosPorCiclo);
  }
}

// V145: graficos Chart.js nao se atualizam sozinhos quando REG muda - precisam de update() explicito.
// Só os graficos que leem campos POR-CICLO (Caixa Variavel) precisam disso; os de fluxo continuo
// (Necessidade, Patrimonio) nao mudam com o seletor, entao nao precisam ser tocados aqui.
function atualizarGraficosPorCiclo(){
  if(typeof Chart === 'undefined' || !Chart.getChart) return;
  ['cVariavel','g_cVariavel'].forEach(id=>{
    const canvas = $(id);
    if(!canvas) return;
    const chart = Chart.getChart(canvas);
    if(!chart) return;
    chart.data.datasets[0].data = [REG.caixaVariavel.saldoReal, REG.caixaVariavel.comprometido, REG.caixaVariavel.disponivel];
    chart.update();
  });
  WallaceBus.emit('graficoAtualizado', {origem:'atualizarGraficosPorCiclo'}); // V300 (Etapa 2)
}

function atualizarBotoesSeletorCiclo(){
  CICLO_LISTA.forEach(key=>{
    const btn = $('cicloBtn_'+key);
    if(!btn) return;
    if(key===VARS.cicloAtual){ btn.classList.add('ciclo-ativo'); }
    else { btn.classList.remove('ciclo-ativo'); }
  });
  const banner = $('cicloBannerFechado');
  if(banner){
    const snap = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    banner.style.display = snap.fechado ? 'flex' : 'none';
  }
}
