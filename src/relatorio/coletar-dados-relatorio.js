// MÓDULO: coletarDadosRelatorioFechamento() — NOVO 14/08/2026 (pedido do usuário: "botão de link
// pra baixar relatório em PDF com um resumo e fechamento de tudo"). Escopo definido com o usuário:
// Resumo Executivo + Obrigações Operacionais (Total Operacional/Cartões/Mercado Pago) + Todas as
// Caixas + Balanço Patrimonial/Patrimônio Financeiro + Reembolsos Wärtsilä.
//
// Estratégia: NÃO recalcula nada — lê direto o texto já renderizado dos cards (mesmo padrão de
// "fonte única" do resto do projeto). Cada card já foi populado pelas funções hydrate*() de sempre
// antes deste módulo rodar; ler o DOM em vez de reimplementar a fórmula garante que o relatório
// nunca pode dessincronizar do que a tela mostra (mesma classe de bug de "2 fontes pro mesmo
// conceito" já documentada várias vezes neste projeto). Funciona em qualquer aba ativa — os
// master-panes ficam no DOM (display:none quando inativos), o conteúdo já está populado de qualquer
// jeito porque hydrate() roda tudo no boot, não só a aba visível no momento.
//
// Exposta em window pra ser chamada de fora do iframe (index.html, botão do cabeçalho) via
// iframe.contentWindow.coletarDadosRelatorioFechamento() — mesmo padrão já usado por
// buscaGlobalDados()/buscaGlobalNavegar() (dashboard-navegacao.js).

// Títulos de <h2> EXATOS das seções a incluir (ordem = ordem no relatório). Usar o texto do próprio
// heading (em vez de um id novo em cada section-num) significa que se o texto do título mudar num
// refino futuro, este arquivo para de achar a seção (falha visível/óbvia, "seção não encontrada" no
// relatório) em vez de silenciosamente pegar a seção errada.
const SECOES_RELATORIO_FECHAMENTO = [
  'Resumo executivo',
  '🔄 Obrigações Operacionais',
  '📦 Todas as Caixas',
  '🏦 Balanço Patrimonial',
  '🏛️ Patrimônio Financeiro',
  'Reembolsos Wärtsilä',
];

// Extrai os pares label/valor de um bloco de section-num: anda pelos irmãos seguintes até achar o
// próximo .section-num (ou acabarem os irmãos), coletando todo .row com .k (label) e .v (valor)
// dentro de qualquer .card no caminho. Ignora linhas sem os 2 (ex: separadores, textos soltos).
function _extrairLinhasSecao(elSectionNum){
  const linhas = [];
  let el = elSectionNum.nextElementSibling;
  while(el && !el.classList.contains('section-num')){
    el.querySelectorAll('.row').forEach(row => {
      const kEl = row.querySelector('.k');
      const vEl = row.querySelector('.v');
      if(!kEl || !vEl) return;
      // clona e remove badges/spans de tooltip aninhados do label pra não duplicar texto (ex:
      // badge "Já descontado acima" dentro do próprio .k em algumas linhas).
      const kClone = kEl.cloneNode(true);
      kClone.querySelectorAll('.badge').forEach(b => b.remove());
      const label = kClone.textContent.trim().replace(/\s+/g, ' ');
      const valor = vEl.textContent.trim().replace(/\s+/g, ' ');
      if(label && valor) linhas.push({ label, valor });
    });
    el = el.nextElementSibling;
  }
  return linhas;
}

function coletarDadosRelatorioFechamento(){
  const secoes = SECOES_RELATORIO_FECHAMENTO.map(titulo => {
    // busca em TODO o documento (não só a aba ativa) - os headings são únicos o suficiente
    // (nenhum título duplicado entre seções) pra não precisar escopar por master-pane.
    const heading = Array.from(document.querySelectorAll('.section-num h2'))
      .find(h => h.textContent.trim() === titulo);
    if(!heading){
      return { titulo, linhas: [], erro: 'Seção não encontrada no DOM (título pode ter mudado).' };
    }
    const linhas = _extrairLinhasSecao(heading.closest('.section-num'));
    return { titulo, linhas };
  });

  const cicloEl = document.getElementById('cicloRange');
  return {
    geradoEm: new Date().toLocaleString('pt-BR'),
    cicloAtual: cicloEl ? cicloEl.textContent.trim() : '—',
    secoes,
  };
}
window.coletarDadosRelatorioFechamento = coletarDadosRelatorioFechamento;
