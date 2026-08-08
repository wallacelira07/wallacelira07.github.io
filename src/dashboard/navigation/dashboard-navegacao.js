// MÓDULO: Dashboard (Capa) + Navegação + Busca Global
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carrega
// DEPOIS do app.js terminar (onload em Sistema_Wallace_Lira_Completo.html) — todo o código aqui só
// executa via onDomPronto/onclick/eventos, nunca em código síncrono que outra parte do app.js
// precise no MEIO da própria execução (diferente do módulo opcoes-roc.js). Depende de globals já
// definidos em app.js quando roda: $, fmt, VARS, WallaceBus, showMaster, showLR, debounce,
// filtroLivroRazaoAtivo, aplicarFiltroLivrosRazao — todos já existem a essa altura do carregamento.
// Nenhuma fórmula, comportamento ou resultado foi alterado, só o arquivo que hospeda o código e o
// momento exato (poucos milissegundos depois, ainda antes de qualquer interação do usuário) em que
// os `onDomPronto(...)` abaixo disparam.

// 04/08/2026 (parte 41) - Capa como Dashboard: cards de navegacao no cabecalho (.cover), pedido
// explicito do usuario ("usar o cabecalho pra montar um dashboard, do dashboard acessa as abas e
// volta"). Reaproveita o mesmo padrao de navegacao ja usado na Busca Global (Etapa 6) - showMaster()
// pra trocar de aba + scrollIntoView pra pousar na secao certa - so que com destinos curados em vez
// de busca livre. tituloSecao:null = so troca de aba e fica no topo dela (usado pros paineis
// Graficos/Cenarios/Balanco, que nao tem 1 secao-alvo obvia).
//
// CORRIGIDO 04/08/2026 (parte 42, pedido do usuario - "tem botoes que nao estao funcionando"):
// a causa real era o mecanismo de navegacao inteiro depender de encontrar um <button class="master-tab">
// cujo atributo onclick continha o paneId como substring - se esse botao nao existisse (ou nao fosse
// encontrado por qualquer motivo), showMaster() NUNCA era chamado (o "if(btn)" engolia o clique em
// silencio, sem erro no console). Agora showMaster(id) e chamado direto pelo id do pane, sem procurar
// nenhum botao - elimina essa classe inteira de bug e nao depende mais da barra de abas existir no DOM
// (removida nesta mesma parte - navegacao de paineis agora e so pelo dashboard + .page-strip).
//
// grupo: usado so pra organizar os cards em fileiras simetricas no dashboard (renderCapaNav) - nao
// afeta navegacao.
const CAPA_DESTINOS = [
  // Visão geral
  {grupo:'Visão geral', icone:'⭐', titulo:'Resumo Executivo', sub:'visão geral do ciclo', paneId:'painel', tituloSecao:'Resumo executivo'},
  {grupo:'Visão geral', icone:'💰', titulo:'Caixa Variável', sub:'quanto ainda dá pra gastar', paneId:'painel', tituloSecao:'Controle caixa variável'},
  {grupo:'Visão geral', icone:'📥', titulo:'Inbox Financeira', sub:'itens aguardando triagem', paneId:'painel', tituloSecao:'📥 Inbox Financeira'},
  {grupo:'Visão geral', icone:'🅿️', titulo:'Mercado Pago', sub:'eventos e conciliação', paneId:'painel', tituloSecao:'Mercado Pago'},
  // Financeiro
  {grupo:'Financeiro', icone:'💳', titulo:'Cartões', sub:'Mastercard Black e faturas', paneId:'painel', tituloSecao:'Mastercard Black'},
  {grupo:'Financeiro', icone:'📚', titulo:'Livros Razão', sub:'LRW · LRV · LRC · e mais', paneId:'painel', tituloSecao:'Livros razão'},
  {grupo:'Financeiro', icone:'🏦', titulo:'Patrimônio', sub:'financeiro e físico', paneId:'painel', tituloSecao:'Patrimônio financeiro'},
  {grupo:'Financeiro', icone:'🏛️', titulo:'Balanço', sub:'patrimonial completo', paneId:'balancov2', tituloSecao:null},
  // Metas & análises
  {grupo:'Metas & análises', icone:'🎯', titulo:'Meta do Milhão', sub:'progresso da meta', paneId:'painel', tituloSecao:'Meta do milhão'},
  {grupo:'Metas & análises', icone:'☀️', titulo:'Energia Solar', sub:'geração e economia', paneId:'solar', tituloSecao:null},
  {grupo:'Metas & análises', icone:'📈', titulo:'Gráficos', sub:'evolução e composição', paneId:'graficos', tituloSecao:null},
  {grupo:'Metas & análises', icone:'🛡️', titulo:'Cenários', sub:'crítico · déficit zero', paneId:'cenarios', tituloSecao:null},
];

// Nomes de exibicao dos 4 paineis - usados pelo indicador de pagina atual (.page-strip, parte 42) e
// por qualquer outro lugar que precise mostrar "onde o usuario esta" de forma consistente.
const NOMES_PANE = {painel:'📊 Painel', graficos:'📈 Gráficos', cenarios:'🛡️ Cenários', balancov2:'🏛️ Balanço'};

function renderCapaNav(){
  const wrap = $('coverNavGrid');
  if(!wrap) return; // HTML antigo em cache, sem esse container - nao quebra nada
  const grupos = [];
  CAPA_DESTINOS.forEach(d=>{
    let g = grupos.find(x=>x.nome===d.grupo);
    if(!g){ g = {nome:d.grupo, itens:[]}; grupos.push(g); }
    g.itens.push(d);
  });
  wrap.innerHTML = grupos.map(g => `
    <div class="cover-nav-grupo">
      <div class="cover-nav-grupo-titulo">${g.nome}</div>
      <div class="cover-nav-linha">
        ${g.itens.map(d=>{
          const i = CAPA_DESTINOS.indexOf(d);
          return `<button type="button" class="cover-nav-card" onclick="irParaCapaDestino(CAPA_DESTINOS[${i}])">
             <div class="cnc-icone">${d.icone}</div>
             <div class="cnc-text">
               <div class="cnc-titulo">${d.titulo}</div>
               <div class="cnc-sub">${d.sub}</div>
             </div>
           </button>`;
        }).join('')}
      </div>
    </div>`
  ).join('');
}

// NOVO 04/08/2026 (parte 47, pedido do usuario - "a aba painel tem que vir para esse ponto" + prints
// mostrando o titulo da secao tampado): a .master-tabs e position:sticky;top:0 - ela fica por CIMA do
// conteudo depois que a pagina rola, mas scrollIntoView() nao sabe disso e alinha o topo do alvo com o
// topo do VIEWPORT, nao com o topo VISIVEL abaixo da barra colada. Resultado: o h2 da secao ficava
// escondido atras da barra (ou colado nela, sem respiro). Helper unico com offset real (altura medida
// da .master-tabs + folga) usado nos 3 pontos que navegam pra uma secao - substitui o scrollIntoView
// direto por window.scrollTo calculado, mesmo destaque de fundo de antes.
function scrollParaSecaoComOffset(alvo){
  if(!alvo) return;
  const tabs = document.querySelector('.master-tabs');
  const offset = (tabs ? tabs.offsetHeight : 0) + 20; // +20 = folga visual, titulo nao cola na barra
  const y = alvo.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({top: Math.max(0, y), behavior:'smooth'});
  alvo.style.transition = 'background 0.3s';
  const corOriginal = alvo.style.background;
  alvo.style.background = 'rgba(57,135,229,0.15)';
  setTimeout(()=>{ alvo.style.background = corOriginal; }, 1200);
}

// Mesma logica de irParaSecaoBusca (Etapa 6), generalizada pra aceitar {paneId, tituloSecao} direto
// em vez de um item ja resolvido do indice de busca. setTimeout pequeno pra deixar o pane trocar de
// active/display antes do scrollParaSecaoComOffset medir a posicao (senao mede com o pane escondido).
function irParaCapaDestino(destino){
  showMaster(destino.paneId);
  const pane = document.getElementById(destino.paneId);
  let alvo = null;
  if(destino.tituloSecao && pane){
    alvo = Array.from(pane.querySelectorAll('.section-num')).find(s=>{
      const h2 = s.querySelector('h2');
      return h2 && h2.textContent.trim().startsWith(destino.tituloSecao);
    });
  }
  // CORRIGIDO 04/08/2026 (parte 43, pedido do usuario - "toda aba deve ir pra sua secao 01, nao pro
  // topo da pagina"): sem tituloSecao (Graficos/Cenarios/Balanco) o codigo antigo dava window.scrollTo(0),
  // que pousa no topo FISICO da pagina (acima do pane, na capa/page-strip) - nao na secao 01 do pane.
  // Agora sempre resolve um alvo real: a secao pedida OU, na falta dela, a 1a .section-num do pane
  // (a que tem <span class="n">01</span>) - nunca mais cai no scrollTo(0) generico.
  if(!alvo && pane){
    alvo = pane.querySelector('.section-num');
  }
  if(alvo){
    setTimeout(()=>{ scrollParaSecaoComOffset(alvo); }, 30);
    return;
  }
  window.scrollTo({top:0, behavior:'smooth'}); // fallback extremo: pane sem nenhuma .section-num
}

function voltarParaCapa(){
  window.scrollTo({top:0, behavior:'smooth'});
}

// NOVO 04/08/2026 (parte 42, pedido do usuario - remover a barra de abas redundante com o dashboard):
// substitui .master-tabs (4 botoes fixos, duplicava navegacao que os cards da Capa ja fazem) por uma
// faixa fina e sticky que so mostra "onde o usuario esta agora" + um atalho de volta pro dashboard -
// uma unica forma de navegar (os cards), uma unica forma de se orientar (esta faixa), sem duplicidade.
function renderPageStrip(paneId){
  const el = $('pageStrip');
  if(!el) return; // HTML antigo em cache, sem esse elemento - nao quebra nada
  const nome = NOMES_PANE[paneId] || paneId;
  el.innerHTML = `<button type="button" class="page-strip-home" onclick="voltarParaCapa()">🏠 Dashboard</button>
    <span class="page-strip-sep">/</span>
    <span class="page-strip-atual">${nome}</span>`;
}
WallaceBus.on('abaAlterada', ({id}) => renderPageStrip(id));

function toggleBtnVoltarCapa(){
  const btn = $('btnVoltarCapa');
  if(!btn) return;
  btn.style.display = window.scrollY > 320 ? 'flex' : 'none';
}

// V300 (Etapa 6 - Busca Global): indice construido 1x a partir do HTML estatico (49 secoes),
// nao duplica nenhum dado do VARS - so mapeia texto visivel (titulo de secao + rotulo de linha)
// pra navegacao rapida entre abas. Nao esconde nenhum elemento (zero risco pro lazy loading das
// Etapas 1.1/1.2) - so navega ate a secao e da um destaque temporario. Usa o debounce() da Etapa 1.3,
// que ate aqui estava criado mas sem nenhum uso real.
let _buscaGlobalIndice = null;

function construirIndiceBuscaGlobal(){
  const indice = [];
  document.querySelectorAll('.section-num').forEach(secEl => {
    const h2 = secEl.querySelector('h2');
    const paneEl = secEl.closest('.master-pane');
    if(!h2 || !paneEl) return;
    const tituloSecao = h2.textContent.trim();
    const paneId = paneEl.id;
    indice.push({texto: tituloSecao.toLowerCase(), rotulo: tituloSecao, paneId, alvo: secEl});
    const conteudo = secEl.nextElementSibling;
    if(conteudo){
      conteudo.querySelectorAll('.row .k').forEach(kEl => {
        const rotulo = kEl.textContent.trim();
        if(rotulo) indice.push({texto: rotulo.toLowerCase(), rotulo: rotulo + ' — ' + tituloSecao, paneId, alvo: secEl});
      });
    }
  });
  return indice;
}

function irParaSecaoBusca(item){
  showMaster(item.paneId);
  setTimeout(()=>{ scrollParaSecaoComOffset(item.alvo); }, 30);
}

// NOVO 04/08/2026 (parte 76, pedido do usuario: "quero que no campo de pesquisa possa pesquisar
// valores e TX pra achar compras"): a busca antiga so indexava texto ESTATICO da tela (titulo de
// secao + rotulo de linha) - nunca os dados de transacao em si (a maioria dos livros nao tem tabela
// item-a-item visivel na tela, so cards de agregado, entao nao tinha como achar por texto/DOM).
// Constroi um segundo indice, direto do VARS (nao do DOM), varrendo todos os livros de transacao
// conhecidos + o historico cross-ciclo (parte 57). Busca por: codigo TX (com ou sem "TX"), valor
// (com vírgula/ponto, com ou sem "R$"), ou nome do estabelecimento/descricao.
const LIVROS_BUSCAVEIS = ['LRW_TRANSACOES','LRV_TRANSACOES','LRC_LIMBO_TRANSACOES','LRCV_TRANSACOES',
  'PV_TRANSACOES','LRPV_TRANSACOES','BOLETOS_TRANSACOES','HISTORICO_ERP_TODOS_CICLOS','BENS_DURAVEIS_TRANSACOES'];
let _buscaGlobalIndiceTransacoes = null;

function construirIndiceTransacoesBusca(){
  const indice = [];
  const vistos = new Set(); // evita duplicar a mesma TX se aparecer em 2 arrays (ex: ciclo atual + historico)
  LIVROS_BUSCAVEIS.forEach(nomeLivro=>{
    (VARS[nomeLivro]||[]).forEach(t=>{
      if(typeof t.valor !== 'number' || !t.tx) return;
      const chave = t.tx + '|' + t.valor;
      if(vistos.has(chave)) return;
      vistos.add(chave);
      const valorFmt = fmt(t.valor); // ja usa a mesma formatacao de moeda do resto do site
      indice.push({
        tx: (t.tx||'').toLowerCase(),
        valorTexto: valorFmt.toLowerCase().replace(/\s/g,''),
        valorNumStr: String(t.valor).replace('.',','),
        nome: (t.nome||'').toLowerCase(),
        livro: nomeLivro,
        registro: t
      });
    });
  });
  return indice;
}

// NOVO 05/08/2026 (pedido do usuario: "quando clico na TX da compra quero que va para o lugar onde
// ela esta o LR correto"): mapeia o nome do array (usado no indice de busca) pra chave do showLR()
// (a aba dentro da secao 15 "Livros razao"). Nem todo livro buscavel tem uma aba 1-pra-1 (ex:
// LRC_LIMBO_TRANSACOES e HISTORICO_ERP_TODOS_CICLOS nao tem aba propria - sao vistas cross-livro/
// cross-ciclo) - nesses casos o clique so leva ate a secao, sem trocar de aba, em vez de acertar errado.
const LIVRO_PARA_TAB_LR = {
  'LRW_TRANSACOES': 'lrw',
  'LRV_TRANSACOES': 'lrv',
  'LRCV_TRANSACOES': 'lrcv',
  'BOLETOS_TRANSACOES': 'lrb',
  'PV_TRANSACOES': 'lrpvsaldo',
  'LRPV_TRANSACOES': 'lrpv',
  'BENS_DURAVEIS_TRANSACOES': 'lrbd'
};

function irParaTransacaoNoLivro(t, livro){
  showMaster('painel');
  // CORRIGIDO 05/08/2026 (achado do usuário: busca só achava TX do ciclo atual - TX de ciclos
  // antigos existe na linha (tr com display:none, o filtro de ciclo so esconde via CSS) mas
  // scrollIntoView num elemento escondido nao faz nada. Forca "histórico completo" antes de navegar,
  // sempre - garante que a linha alvo esteja visivel, nao importa de qual ciclo ela seja.
  if(filtroLivroRazaoAtivo){ filtroLivroRazaoAtivo = false; aplicarFiltroLivrosRazao(); }
  // acha a section-num "Livros razao" pelo texto do h2 (mais confiavel que indice fixo)
  const secaoAlvo = Array.from(document.querySelectorAll('.section-num')).find(s => s.querySelector('h2')?.textContent.trim() === 'Livros razão');

  const chaveTab = LIVRO_PARA_TAB_LR[livro];
  if(chaveTab){
    const btn = document.getElementById('lrTabBtn_' + chaveTab);
    if(btn) showLR(chaveTab, btn);
  }

  setTimeout(() => {
    if(secaoAlvo) scrollParaSecaoComOffset(secaoAlvo);
    if(!t.tx) return;
    // procura a linha (<tr>) que contem o codigo TX, dentro da tabela ja visivel apos o showLR acima
    setTimeout(() => {
      const linhas = document.querySelectorAll('.pane.active tbody tr');
      const alvo = Array.from(linhas).find(tr => tr.textContent.includes(t.tx));
      if(alvo){
        alvo.scrollIntoView({behavior:'smooth', block:'center'});
        alvo.classList.add('linha-destacada-busca');
        setTimeout(() => alvo.classList.remove('linha-destacada-busca'), 2500);
      }
    }, 120);
  }, 40);
}

function renderResultadoTransacao(t, livro){
  const div = document.createElement('div');
  div.className = 'busca-resultado-item busca-resultado-transacao';
  const nomeLivroCurto = livro.replace('_TRANSACOES','').replace('HISTORICO_ERP_TODOS_CICLOS','Histórico');
  div.innerHTML = `<strong>${t.tx||'—'}</strong> · ${t.nome||t.descricao||'(sem descrição)'} · <strong>${fmt(t.valor)}</strong>`
    + `<span class="busca-resultado-sub"> ${t.data||''} — ${nomeLivroCurto}${t.obs ? ' — '+t.obs : ''}</span>`;
  // CORRIGIDO 05/08/2026 (pedido do usuario, clique nao fazia nada): agora navega ate a aba do
  // Livro Razao correto e destaca a linha da transacao, quando existe mapeamento conhecido pra
  // aquele livro (ver LIVRO_PARA_TAB_LR acima) - sem mapeamento, so leva ate a secao geral.
  div.onclick = () => irParaTransacaoNoLivro(t, livro);
  div.style.cursor = 'pointer';
  return div;
}

// NOVO 05/08/2026: calcula a posicao real do dropdown (position:fixed agora, ver styles.css) a partir
// da caixa de busca na tela. Roda toda vez que o dropdown abre, e de novo em scroll/resize enquanto
// estiver aberto, pra nao descolar da caixa de busca se a pagina rolar.
function posicionarResultadosBusca(){
  const input = $('buscaGlobalInput');
  const wrap = $('buscaGlobalResultados');
  if(!input || !wrap || wrap.style.display === 'none') return;
  const r = input.getBoundingClientRect();
  wrap.style.top = (r.bottom + 4) + 'px';
  wrap.style.left = r.left + 'px';
  wrap.style.width = r.width + 'px';
}
window.addEventListener('scroll', posicionarResultadosBusca, {passive:true});
window.addEventListener('resize', posicionarResultadosBusca);

function renderResultadosBusca(termo){
  const wrap = $('buscaGlobalResultados');
  if(!wrap) return;
  if(!termo){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  if(!_buscaGlobalIndice) _buscaGlobalIndice = construirIndiceBuscaGlobal();
  if(!_buscaGlobalIndiceTransacoes) _buscaGlobalIndiceTransacoes = construirIndiceTransacoesBusca();
  const t = termo.toLowerCase().trim();
  const tSemTx = t.replace(/^tx0*/, ''); // "tx201" ou "201" acham "TX000201" do mesmo jeito
  const tSoDigitos = t.replace(/[^\d,.]/g, ''); // pra buscar valor mesmo digitando "R$ 60,90" ou "60.90"

  const vistos = new Set();
  const resultadosSecao = _buscaGlobalIndice
    .filter(it => it.texto.includes(t))
    .filter(it => { if(vistos.has(it.rotulo)) return false; vistos.add(it.rotulo); return true; })
    .slice(0, 5);

  const resultadosTransacao = t.length >= 2 ? _buscaGlobalIndiceTransacoes.filter(it=>{
    if(it.tx.includes(t) || (tSemTx && it.tx.includes(tSemTx))) return true;
    if(it.nome.includes(t)) return true;
    if(tSoDigitos && (it.valorTexto.includes(tSoDigitos.replace('.',',')) || it.valorNumStr.includes(tSoDigitos))) return true;
    return false;
  }).sort((a,b)=>{
    // NOVO parte 83 (bug real: busca de "100" nao achava um valor de R$100,00 - existiam muitos
    // OUTROS valores contendo "100" como substring, ex: 1006.04, 5100.00, que enchiam o limite de 6
    // resultados antes do match exato aparecer). Match EXATO de valor sempre primeiro.
    const valorBuscado = tSoDigitos ? parseFloat(tSoDigitos.replace(',','.')) : null;
    const aExato = valorBuscado !== null && a.registro.valor === valorBuscado;
    const bExato = valorBuscado !== null && b.registro.valor === valorBuscado;
    if(aExato && !bExato) return -1;
    if(bExato && !aExato) return 1;
    return 0;
  }).slice(0, 6) : [];

  if(resultadosSecao.length === 0 && resultadosTransacao.length === 0){
    wrap.innerHTML = '<div class="busca-resultado-vazio">Nada encontrado</div>';
    wrap.style.display = 'block';
    posicionarResultadosBusca();
    return;
  }
  wrap.innerHTML = '';
  resultadosSecao.forEach(item => {
    const div = document.createElement('div');
    div.className = 'busca-resultado-item';
    div.textContent = item.rotulo;
    div.onclick = () => { irParaSecaoBusca(item); wrap.style.display = 'none'; $('buscaGlobalInput').value = ''; };
    wrap.appendChild(div);
  });
  resultadosTransacao.forEach(it => {
    wrap.appendChild(renderResultadoTransacao(it.registro, it.livro));
  });
  wrap.style.display = 'block';
  posicionarResultadosBusca();
}

const buscaGlobalDebounced = debounce(function(e){ renderResultadosBusca(e.target.value.trim()); }, 200);

function initBuscaGlobal(){
  const input = $('buscaGlobalInput');
  if(!input) return;
  input.addEventListener('input', buscaGlobalDebounced);
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.busca-global-wrap')){
      const wrap = $('buscaGlobalResultados');
      if(wrap) wrap.style.display = 'none';
    }
  });
}

// Wiring (movido de app.js junto com as funções, mesma ordem relativa de antes) — onDomPronto já
// trata "DOM já pronto" chamando na hora, então o efeito prático é idêntico, só roda alguns
// milissegundos depois (depois de energia-solar.js/promocoes-financeengine.js terminarem de
// carregar), sem nenhuma dependência de hydrate() ou dos outros onDomPronto que continuam em app.js.
onDomPronto(initBuscaGlobal); // V300 (Etapa 6): so liga o listener do input, nao depende de hydrate/dados
onDomPronto(renderCapaNav); // parte 41: monta os cards de navegacao da Capa/Dashboard
onDomPronto(toggleBtnVoltarCapa); // parte 41: estado inicial do botao flutuante (escondido no topo)
onDomPronto(()=>renderPageStrip('painel')); // parte 42: estado inicial da faixa "onde estou" (painel e o pane ativo por padrao no HTML)
window.addEventListener('scroll', toggleBtnVoltarCapa, {passive:true}); // parte 41: mostra/esconde ao rolar
