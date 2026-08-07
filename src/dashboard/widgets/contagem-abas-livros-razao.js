// MÓDULO: contagem dinâmica das abas de Livros Razão (seção 15)
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carrega
// DEPOIS do app.js terminar (onload). Zero dependência de VARS/REG — só conta <tr> visíveis no DOM.
// Único chamador é aplicarFiltroLivrosRazao() (src/modules/filtro-livros-razao.js), sempre lazy
// (nunca em código síncrono no meio da execução do app.js). Nenhuma fórmula ou comportamento
// mudou, só o arquivo que hospeda o código.

// V162 (25/07/2026): contagem dinamica das abas de Livros Razao (secao 15) - antes eram numeros
// FIXOS no HTML ("Wallace (0)", "Boletos (9)" etc), nunca calculados, sempre dessincronizados da
// tabela real embaixo. Agora cada botao conta as <tr> de verdade dentro do seu painel correspondente,
// sempre exato. Roda por ultimo (depois de renderParcelamentos ja ter gerado as tabelas dinamicas).
function atualizarContagemAbas(){
  const mapa = {
    lrw: 'LRW - Wallace', lrv: 'LRV - Vanessa', lrb: 'LRB - Boletos', lrp: 'LRP - Parcelas',
    lrs: 'LRS - Assinaturas', lrr: 'LRR - Recorrências', lrcon: 'LRCON - Consórcios', lrc: 'LRC - Corporativo',
    lrmp: 'LRMP - Merc. Pago', lrcv: 'LRCV - Caixa Var.', lrei: 'LREI - Empréstimos', lrdoacao: 'LRDOA - Doações', lrpv: 'LRPGV - PGV', lrpvsaldo: 'LRPV - PV'
  };
  Object.keys(mapa).forEach(paneId => {
    const pane = $(paneId);
    const btn = document.querySelector(`[onclick*="showLR('${paneId}'"]`);
    if(!pane || !btn) return;
    // CORRIGIDO 25/07/2026 (V162): antes contava TODAS as <tr> (.length), incluindo linhas escondidas
    // pelo filtro de ciclo (display:none) e a linha de mensagem "nenhuma compra ainda" (colspan) -
    // por isso o numero nunca batia com o que aparecia na tela (ex: "Wallace (61)" quando so 0-1
    // estavam visiveis). Agora conta so linhas de dado real e visiveis de fato.
    const todasLinhas = pane.querySelectorAll('tbody tr');
    let count = 0;
    todasLinhas.forEach(tr=>{
      const estaEscondida = tr.style.display === 'none';
      const ehMensagemVazia = tr.querySelector('td[colspan]') !== null;
      if(!estaEscondida && !ehMensagemVazia) count++;
    });
    btn.textContent = `${mapa[paneId]} (${count})`;
  });
}
