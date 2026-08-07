// MÓDULO: atualizarContadoresAbasLR() — conta as linhas <tr> reais (excluindo riscadas/vazias) de
// cada painel de Livro Razão e atualiza o texto dos botões das abas + rodapés de tabela com a
// contagem real. Extraído de app.js na modularização (07/08/2026) — função autocontida (só usa $,
// nenhuma dependência de escopo externo). Chamada via onDomPronto(atualizarContadoresAbasLR) em
// app.js, que continua igual. Nenhuma fórmula ou comportamento mudou.
function atualizarContadoresAbasLR(){
  // CORRIGIDO 05/08/2026 (parte 95, usuario apontou "o botao do LRBD nao mostra a quantidade de itens
  // como os demais"): 'lrbd' faltava neste array - o painel existe (id="lrbd" no HTML) mas nunca era
  // varrido por esta funcao, entao nunca ganhava o sufixo "(N)" que os outros 14 botoes ganham. Mesmo
  // padrao de bug ja documentado no manual (regra 03): toda caixa/livro novo precisa ser adicionado
  // aqui manualmente, nao ha auto-descoberta de paineis - registrar pra proxima vez que uma caixa nova
  // ganhar aba propria (usuario pediu isso explicitamente: "acho bom toda caixa ter o seu LR").
  // ATUALIZADO 05/08/2026 (parte 99, pedido repetido do usuario: "nao esqueça, cada caixa deve ter seu
  // LR"): adicionadas as 9 caixas que so tinham array de transacoes no Supabase, sem aba nenhuma - agora
  // toda caixa operacional/patrimonial do sistema tem seu LR proprio (14 caixas + Caixa Variavel = 15,
  // mais os livros que nao sao caixa: Wallace/Vanessa/Boletos/Parcelas/etc).
  const paineis = ['lrw','lrv','lrb','lrp','lrs','lrr','lrcon','lrc','lrmp','lrcv','lrei','lrdoacao','lrpv','lrpvsaldo','lrbd',
    'lrlance','lrmanut','lraniv','lreventos','lrsaude','lrseguro','lrcomb','lrchurrasco','lrmci'];
  const labels = {
    lrw:'LRW - Wallace', lrv:'LRV - Vanessa', lrb:'LRB - Boletos', lrp:'LRP - Parcelas', lrs:'LRS - Assinaturas',
    lrr:'LRR - Recorrências', lrcon:'LRCON - Consórcios', lrc:'LRC - Corporativo', lrmp:'LRMP - Mercado Pago',
    lrcv:'LRCV - Caixa Variável', lrei:'LREI - Empréstimos Internos', lrdoacao:'LRDOA - Doações', lrpv:'LRPGV - PIX Geral Vanessa', lrpvsaldo:'LRPV - PIX Vanessa',
    lrbd:'LRBD - Bens Duráveis',
    lrlance:'LRCL - Caixa Lance', lrmanut:'LRMN - Manutenção', lraniv:'LRAJ - Aniversário Júlio',
    lreventos:'LREV - Eventos e Viagens', lrsaude:'LRSF - Saúde Família', lrseguro:'LRSE - Seguro/Emplacamento',
    lrcomb:'LRCB - Combustível', lrchurrasco:'LRCH - Churrasco', lrmci:'LRMI - Mastercard/Infinite'
  };
  // NOVO 01/08/2026 (V243, pedido do usuario - "torne isso automatico em todas"): rodapes de tabela
  // (ex: "9 lançamentos", "13 assinaturas ativas") eram texto FIXO no HTML, nunca contado de verdade -
  // por isso o LRPGV podia mostrar "18" no rodape e "9" no botao da aba ao mesmo tempo. Mesma contagem
  // real (linhas de tbody, excluindo riscadas/vazias) agora alimenta OS DOIS lugares, sempre igual.
  const rodapes = {
    lrb: {id:'qtdLRB', singular:'boleto', plural:'boletos'},
    lrs: {id:'qtdLRS', singular:'assinatura ativa', plural:'assinaturas ativas'},
    lrr: {id:'qtdLRR', singular:'recorrência', plural:'recorrências'},
    lrcon: {id:'qtdLRCON', singular:'lançamento', plural:'lançamentos'},
    lrdoacao: {id:'qtdLRDOA', singular:'lançamento', plural:'lançamentos'},
    lrpv: {id:'qtdLRPGV', singular:'lançamento (fluxo do período)', plural:'lançamentos (fluxo do período)'},
  };
  paineis.forEach(id => {
    const painel = $(id);
    const btn = $('lrTabBtn_'+id);
    if(!painel || !btn) return;
    const linhas = painel.querySelectorAll('tbody tr');
    let count = 0;
    linhas.forEach(tr => {
      // exclui linhas riscadas (duplicata/estorno) e linhas de "nenhum lancamento" (colspan)
      const riscada = tr.style && tr.style.textDecoration && tr.style.textDecoration.includes('line-through');
      const vazia = tr.querySelector('td[colspan]');
      if(!riscada && !vazia) count++;
    });
    btn.textContent = labels[id]+' ('+count+')';
    const rf = rodapes[id];
    if(rf){
      const rfEl = $(rf.id);
      if(rfEl) rfEl.textContent = count+' '+(count===1?rf.singular:rf.plural);
    }
  });
}
