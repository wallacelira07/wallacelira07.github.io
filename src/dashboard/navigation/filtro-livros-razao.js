// MÓDULO: Filtro de Livros Razão por ciclo (mostrar limbo+ciclo atual vs. histórico completo)
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carrega
// DEPOIS do app.js terminar (onload). Zero dependência de VARS/REG — só lê o texto já renderizado
// nas células de data das tabelas (DOM) e alterna display via CSS. Chamado exclusivamente via
// onclick (alternarFiltroLivrosRazao, botão) ou de dentro de trocarCiclo()/irParaTransacaoNoLivro()
// (chamadas lazy, nunca em código síncrono no meio da execução do app.js — o onDomPronto que
// chamava isso automaticamente já estava desativado desde a V174, substituído pelo seletor de
// ciclo). Nenhuma fórmula ou comportamento mudou, só o arquivo que hospeda o código.

// ===== V152 (25/07/2026): FILTRO DE LIVROS RAZAO POR CICLO =====
// Pedido do usuario: "Os livros razão onde tem as compras Variáveis, tem que mostrar apenas as
// compras do limbo do master e as que são no novo ciclo". Em vez de reescrever as ~260 linhas de
// tabela (risco alto de erro/perda de dado numa refatoracao sem visualizacao real disponivel),
// o filtro esconde/mostra linhas via CSS usando a propria coluna "Data" (formato DD/MM) ja existente
// em cada <tr> - nenhum dado foi reescrito, so uma camada de exibicao por cima do que ja existia.
// Corte do limbo+ciclo atual: 23/07/2026 em diante (dia do mes >=23 E mes=07, cobrindo o limbo do
// fechamento da fatura Mastercard Black que comeca no dia 23) OU mes >= 08 (futuro). Datas antes disso
// (ate 22/07) sao 100% do ciclo fechado (26/06-24/07), sem ambiguidade de limbo.
const CICLO_NOVO_DIA_CORTE = 23; // dia em que o LIMBO do Mastercard Black comeca (fechamento fatura ~22/07)
const CICLO_NOVO_MES_CORTE = 7;  // julho

function dataPertenceCicloAtual(dataStr){
  // dataStr no formato "DD/MM" (ex: "27/06", "25/07"). Retorna true se e do ciclo atual (25/07 em diante).
  const m = dataStr.match(/^(\d{2})\/(\d{2})$/);
  if(!m) return true; // formato inesperado (ex: "—" ou vazio) -> nao esconde, mostra por seguranca
  const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10);
  if(mes > CICLO_NOVO_MES_CORTE) return true;  // mes futuro (agosto em diante) = ciclo atual ou seguinte
  if(mes === CICLO_NOVO_MES_CORTE) return dia >= CICLO_NOVO_DIA_CORTE;
  return false; // mes anterior a julho = ciclo fechado
}

// Livros que fazem sentido filtrar por ciclo (compras variaveis e afins). Livros patrimoniais/parcelados
// (LRP, LRCON, LREI, doacoes) nao sao filtrados aqui - continuam mostrando tudo, pois representam saldo
// corrente/parcelamento continuo, nao "gasto do mes".
const LIVROS_FILTRAVEIS_POR_CICLO = ['lrw','lrv','lrb','lrs','lrr','lrc','lrmp','lrcv','lrpv'];

let filtroLivroRazaoAtivo = true; // true = mostra so limbo+ciclo atual. false = mostra tudo (historico completo).
// onDomPronto(aplicarFiltroLivrosRazao) DESATIVADO (V174) - substituido pelo seletor de ciclo, que agora controla tudo via trocarCiclo()

function aplicarFiltroLivrosRazao(){
  LIVROS_FILTRAVEIS_POR_CICLO.forEach(id=>{
    const pane = $(id);
    if(!pane) return;
    const rows = pane.querySelectorAll('tbody tr');
    rows.forEach(tr=>{
      const dataCell = tr.children[1]; // 2a coluna = Data em todas as tabelas (TX, Data, Estabelecimento, Valor)
      if(!dataCell) return;
      const dataStr = dataCell.textContent.trim();
      const ehCicloAtual = dataPertenceCicloAtual(dataStr);
      if(filtroLivroRazaoAtivo){
        tr.style.display = ehCicloAtual ? '' : 'none';
      } else {
        tr.style.display = '';
      }
    });
  });
  atualizarBotaoFiltroLivrosRazao();
  atualizarContagemAbas(); // V162: recontagem dinamica sempre que o filtro muda, roda DEPOIS de esconder/mostrar linhas
}

function alternarFiltroLivrosRazao(){
  filtroLivroRazaoAtivo = !filtroLivroRazaoAtivo;
  aplicarFiltroLivrosRazao();
}

function atualizarBotaoFiltroLivrosRazao(){
  const btn = $('btnFiltroLivrosRazao');
  if(!btn) return;
  btn.textContent = filtroLivroRazaoAtivo
    ? '🔍 Mostrando: ciclo atual + limbo — ver histórico completo'
    : '🔍 Mostrando: histórico completo — ver só ciclo atual';
}
