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
// AMPLIADO 14/08/2026 (WWI — Wallace Wealth Intelligence, pedido do usuário: "transformar o botão de
// download num gerador automático de relatórios executivos"): de 6 pra 15 seções, título por título
// conferido contra o HTML real (`Sistema_Wallace_Lira_Completo.html`) antes de adicionar — não copiado
// de suposição. `calcularIndicadoresEScores()`/`gerarAnaliseFinanceira()` (novos) dependem de boa parte
// destas seções novas pra ter dado suficiente pros scores/narrativa. "💰 Taxa de Poupança" NÃO entra
// como título próprio na lista abaixo, mas não falta dado: é um `<h2>` ANINHADO dentro do mesmo `.card`
// de "📈 Crescimento Patrimonial" (sub-seção visual, não uma `.section-num` irmã no nível do resto) —
// `_extrairLinhasSecao` já varre todos os descendentes de cada irmão até o próximo `.section-num` de
// verdade, então as linhas de Taxa de Poupança (Receitas/Despesas/Sobrou) já vêm incluídas dentro do
// resultado de "📈 Crescimento Patrimonial" sem precisar de entrada separada (testado lendo o HTML
// real, não assumido).
const SECOES_RELATORIO_FECHAMENTO = [
  'Resumo executivo',
  '🔄 Obrigações Operacionais',
  '📦 Todas as Caixas',
  '🏦 Balanço Patrimonial',
  '🏛️ Patrimônio Financeiro',
  '🏛️ Patrimônio Físico',
  '📉 Passivos Patrimoniais',
  'Passivos patrimoniais',
  'Meta do milhão',
  'Projeto casa nova',
  'Consórcio casa nova (I0464 · Cota 12)',
  'Reserva de Emergência — quanto tempo aguenta',
  '📊 Fluxo Financeiro do Ciclo',
  '📈 Crescimento Patrimonial',
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

// CORRIGIDO 14/08/2026 (achado do usuário testando o PDF real: "Todas as Caixas" saía vazia — nem
// Boletos, nem nenhuma caixa apareciam). Causa: essa seção NÃO usa o padrão .row/.k/.v do resto do
// site — cada caixa é um `.card` "achatado" (`<div class="card"><div>label</div><div class="v">
// valor</div><div class="progress">...</div>...</div>`), sem wrapper `.row`. Extrator alternativo,
// só pra esse formato: label = primeiro filho direto do card que não é o valor nem a barra de
// progresso; valor = primeiro `.v` FILHO DIRETO do card (via :scope, pra não pegar os `.v` da
// barra/progress-lbl, que são % e meta, não o saldo).
function _extrairLinhasCards(elSectionNum){
  const linhas = [];
  let el = elSectionNum.nextElementSibling;
  while(el && !el.classList.contains('section-num')){
    el.querySelectorAll('.card').forEach(card => {
      const valEl = card.querySelector(':scope > .v');
      if(!valEl) return;
      const labelEl = Array.from(card.children).find(c =>
        c !== valEl && !c.classList.contains('progress') && !c.classList.contains('progress-lbl'));
      if(!labelEl) return;
      const label = labelEl.textContent.trim().replace(/\s+/g, ' ');
      const valor = valEl.textContent.trim().replace(/\s+/g, ' ');
      if(label && valor && valor !== '—') linhas.push({ label, valor });
    });
    el = el.nextElementSibling;
  }
  return linhas;
}

// NOVO 14/08/2026 (WWI, achado ao mapear as 9 seções novas antes de adicionar): boa parte delas
// (Meta do milhão, Passivos patrimoniais, Consórcio/Projeto casa nova, Reserva de Emergência) usa um
// 3º formato, diferente dos dois já existentes — um rótulo em `<div style="...color:var(--text-mid)">`
// seguido do valor no PRÓXIMO IRMÃO direto com classe `.v` (`<div>Rótulo</div><div class="v">Valor</div>`,
// sem `.row` nem `.card` achatado). Extrator dedicado, mesmo padrão de seletor já usado pelo indexador
// da Busca Global (`dashboard-navegacao.js`, `.card [style*="color:var(--text-mid)"]`) pra achar esse
// tipo de rótulo. Pula rótulos que já têm classe `.v` (evita reprocessar valor como se fosse rótulo) e
// rótulos dentro de `.progress-lbl` (são %/meta da barra, não o dado principal da linha).
function _extrairLinhasRotulosInline(elSectionNum){
  const linhas = [];
  let el = elSectionNum.nextElementSibling;
  while(el && !el.classList.contains('section-num')){
    el.querySelectorAll('[style*="color:var(--text-mid)"]').forEach(labelEl => {
      if(labelEl.classList.contains('v')) return;
      if(labelEl.closest('.progress-lbl')) return;
      const valEl = labelEl.nextElementSibling;
      if(!valEl || !valEl.classList.contains('v')) return;
      const label = labelEl.textContent.trim().replace(/\s+/g, ' ');
      const valor = valEl.textContent.trim().replace(/\s+/g, ' ');
      if(label && valor && valor !== '—') linhas.push({ label, valor });
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
    // AMPLIADO 14/08/2026 (WWI): rodar os 3 extratores e UNIR os resultados (dedupe por label) em vez
    // de só cair pro próximo se o anterior não achar nada — várias seções novas combinam mais de um
    // formato no mesmo bloco (ex: "Consórcio casa nova" tem um cabeçalho no formato rótulo-inline e
    // 4 linhas no formato .row logo abaixo). Continua sem custo pras seções antigas, que só têm um
    // formato — os outros 2 extratores simplesmente não acham nada ali.
    const secaoNum = heading.closest('.section-num');
    const vistos = new Set();
    const linhas = [];
    [_extrairLinhasSecao(secaoNum), _extrairLinhasCards(secaoNum), _extrairLinhasRotulosInline(secaoNum)]
      .forEach(grupo => grupo.forEach(l => {
        const chave = l.label + '|' + l.valor;
        if(vistos.has(chave)) return;
        vistos.add(chave);
        linhas.push(l);
      }));
    return { titulo, linhas };
  });

  const cicloEl = document.getElementById('cicloRange');
  // NOVO 14/08/2026 (WWI): `competencia` é a CHAVE real do ciclo financeiro ('2026-07', mesmo valor
  // de VARS.cicloAtual/ciclo_key em ciclos_financeiros_snapshots) — não o texto de exibição
  // "25/07 → 24/08/2026" de #cicloRange (cicloAtual, mantido só pra exibição/compat). É essa chave
  // que vira a PK de `historico_relatorios`, decisão explícita do usuário: competência = ciclo
  // financeiro (25→24), não mês calendário.
  const competencia = (typeof VARS !== 'undefined' && VARS.cicloAtual) ? VARS.cicloAtual : null;
  return {
    geradoEm: new Date().toLocaleString('pt-BR'),
    cicloAtual: cicloEl ? cicloEl.textContent.trim() : '—',
    competencia,
    secoes,
  };
}
window.coletarDadosRelatorioFechamento = coletarDadosRelatorioFechamento;
