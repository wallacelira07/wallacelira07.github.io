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
  // WWI (NOVO 15/08/2026, Fase 2C — aba permanente "Wealth Intelligence", fonte primária do WWI;
  // o Tactical Wealth Report em PDF passa a ser só a exportação do que existe aqui).
  {grupo:'Metas & análises', icone:'🧠', titulo:'Wealth Intelligence', sub:'histórico patrimonial e Wealth Score', paneId:'wwi', tituloSecao:null},
];

// Nomes de exibicao dos paineis - usados pelo indicador de pagina atual (.page-strip, parte 42) e
// por qualquer outro lugar que precise mostrar "onde o usuario esta" de forma consistente.
const NOMES_PANE = {painel:'📊 Painel', graficos:'📈 Gráficos', cenarios:'🛡️ Cenários', balancov2:'🏛️ Balanço', wwi:'🧠 Wealth Intelligence'};

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
  // CORRIGIDO 09/08/2026 (pedido do usuario: "piscar em azul claro 2 ou 3 vezes") - trocado o
  // destaque unico (1 fade via style inline) pela mesma classe .linha-destacada-busca usada no
  // destaque de transacao (styles.css), agora com 3 piscadas azuis - efeito consistente nos 2 casos.
  alvo.classList.add('linha-destacada-busca');
  setTimeout(()=>{ alvo.classList.remove('linha-destacada-busca'); }, 1600);
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

// NOVO 10/08/2026 (pedido do usuário: "quando eu mudar de aba, deve atualizar os dados"), CORRIGIDO
// 11/08/2026 (achado do usuário: "quando passo muito tempo na tela e vou pra próxima, os dados
// somem e depois aparecem... as passagens de página não estão suáveis" — era o location.reload()
// abaixo, causou exatamente o flash em branco que a versão anterior deste comentário tentava evitar
// com o script síncrono do F5. Troca de abordagem: em vez de recarregar a página inteira, re-chama
// hydrate() (a mesma função que já roda 1x no boot) — ela é síncrona e reentrante por natureza (só
// escreve textContent/REG, nenhuma criação de gráfico; os aplicarOndaX() assíncronos que ela chama
// por dentro fazem fetch novo e atualizam via atualizarGrafico*() já estabelecido nesta sessão, não
// via new Chart()). Sem flash, sem reload, dado atualiza "ao vivo" como no primeiro carregamento.
const LIMIAR_DADOS_VELHOS_MS = 5 * 60 * 1000;
WallaceBus.on('abaAlterada', ({id}) => {
  if(id === 'home') return; // capa não depende de fetch novo pra fazer sentido revisitar
  const ts = window.__wallaceUltimoBootTs;
  if(!ts) return; // ainda no meio do próprio boot - nada a fazer
  if(Date.now() - ts > LIMIAR_DADOS_VELHOS_MS){
    console.log('[Wallace] Dados desta sessão têm mais de 5min — atualizando (sem recarregar a página).');
    window.__wallaceUltimoBootTs = Date.now();
    if(typeof hydrate === 'function') hydrate();
  }
});

function toggleBtnVoltarCapa(){
  const btn = $('btnVoltarCapa');
  if(!btn) return;
  btn.style.display = window.scrollY > 320 ? 'flex' : 'none';
}

// NOVO 12/08/2026 (pedido do usuário, print real do celular circulando a barra pill de abas em
// cima do conteúdo de "Energia Solar": "toma muito espaço fixo, tem que recolher ao rolar como
// Gmail/Android faz" — esconde ao rolar pra baixo, volta ao rolar pra cima, mesmo um pouco).
// ACHADO ao investigar ao vivo no painel logado: a barra do print é .master-tabs, NÃO
// .home-nav-grid (tentativa anterior editou o elemento errado - .home-nav-grid só existe dentro
// de #home/Dashboard e nem estava visível naquele print). .master-tabs só é renderizada DENTRO das
// abas (Painel/Gráficos/Energia Solar/Cenários/Balanço - nunca na Home), então não precisa de
// nenhuma checagem de "ainda estou no Dashboard" - toda vez que ela existe no DOM, já estamos numa
// aba, contexto onde o usuário quer o auto-hide. _limiarPx evita esconder/mostrar a cada 1px de
// tremor de scroll do celular.
let _masterTabsUltimoScrollY = 0;
function toggleMasterTabsAoRolar(){
  const tabs = document.querySelector('.master-tabs');
  if(!tabs) return; // não existe na Home - nada a fazer, .home-nav-grid não é afetada
  const y = window.scrollY;
  const limiarPx = 6;
  const delta = y - _masterTabsUltimoScrollY;
  if(y <= 0){
    tabs.classList.remove('master-tabs--escondida'); // topo da página - sempre visível
  } else if(delta > limiarPx){
    tabs.classList.add('master-tabs--escondida'); // rolando pra baixo - esconde
  } else if(delta < -limiarPx){
    tabs.classList.remove('master-tabs--escondida'); // rolando pra cima - mostra de novo
  }
  _masterTabsUltimoScrollY = y;
}

// V300 (Etapa 6 - Busca Global): indice construido 1x a partir do HTML estatico (49 secoes),
// nao duplica nenhum dado do VARS - so mapeia texto visivel (titulo de secao + rotulo de linha)
// pra navegacao rapida entre abas. Nao esconde nenhum elemento (zero risco pro lazy loading das
// Etapas 1.1/1.2) - so navega ate a secao e da um destaque temporario. Usa o debounce() da Etapa 1.3,
// que ate aqui estava criado mas sem nenhum uso real.
let _buscaGlobalIndice = null;

function construirIndiceBuscaGlobal(){
  const indice = [];
  // NOVO 10/08/2026 (achado do usuario: buscar "Energia Solar" dava "Nada encontrado" mesmo sendo
  // uma aba real do site) - o indice so cobria TITULOS DE SECAO (.section-num) dentro de cada aba,
  // nunca o NOME DA PROPRIA ABA (Painel/Graficos/Energia Solar/Cenarios/Balanco) - "a lupa tem que
  // pegar tudo que tem no site" inclui os destinos de navegacao, nao so o conteudo deles. Alvo e a
  // 1a .section-num de dentro do pane (mesmo padrao de scroll ja usado em outro lugar), com fallback
  // pro proprio pane se ele nao tiver nenhuma secao numerada.
  document.querySelectorAll('.master-tabs .master-tab[data-pane]').forEach(tabBtn => {
    const paneId = tabBtn.getAttribute('data-pane');
    const paneEl = document.getElementById(paneId);
    if(!paneEl) return;
    const rotuloAba = tabBtn.textContent.trim();
    const alvo = paneEl.querySelector('.section-num') || paneEl;
    indice.push({texto: rotuloAba.toLowerCase(), rotulo: rotuloAba + ' (aba)', paneId, alvo});
  });
  document.querySelectorAll('.section-num').forEach(secEl => {
    const h2 = secEl.querySelector('h2');
    const paneEl = secEl.closest('.master-pane');
    if(!h2 || !paneEl) return;
    const tituloSecao = h2.textContent.trim();
    const paneId = paneEl.id;
    indice.push({texto: tituloSecao.toLowerCase(), rotulo: tituloSecao, paneId, alvo: secEl});
    // CORRIGIDO 10/08/2026 (achado do usuario: buscar "PIB" nao achava "PIB Wallace do mes", mesmo
    // sendo um <span class="k"> real na tela) - o indexador so olhava o PRIMEIRO irmao depois do
    // titulo da secao (secEl.nextElementSibling), mas varias secoes tem 2-3 blocos depois do titulo
    // (paragrafo de descricao, DEPOIS o card com os valores, ou um <details> recolhido no fim, como
    // o card "PIB Wallace" dentro da secao "Crescimento Patrimonial") - qualquer coisa alem do
    // primeiro irmao nunca entrava no indice. Agora varre TODOS os irmaos seguintes ate a proxima
    // secao (ou ate acabar o pane), nao so o primeiro - mesma logica de sempre, escopo maior.
    let conteudo = secEl.nextElementSibling;
    while(conteudo && !conteudo.classList.contains('section-num')){
      conteudo.querySelectorAll('.row .k').forEach(kEl => {
        const rotulo = kEl.textContent.trim();
        if(rotulo) indice.push({texto: rotulo.toLowerCase(), rotulo: rotulo + ' — ' + tituloSecao, paneId, alvo: secEl});
      });
      // CORRIGIDO 09/08/2026 (achado do usuario: "nao pega as caixas, so pega transacao, tem que
      // pegar todas as caixas, titulos") - os cards de saldo/agregado (ex: secao 05 "Caixas
      // operacionais": Caixa boletos, PIX Vanessa, PIX Geral Vanessa) usam um padrao de HTML
      // diferente do .row .k acima - o rotulo eh um <div style="color:var(--text-mid)"> solto
      // dentro de .card, sem classe propria. Sem classe pra selecionar, o indice antigo nunca via
      // esses titulos. Esse estilo inline (color:var(--text-mid), tamanho ~0.7rem) eh o padrao
      // usado em ~112 rotulos de card no HTML inteiro, entao cobre a classe inteira do problema.
      conteudo.querySelectorAll('.card [style*="color:var(--text-mid)"]').forEach(labelEl => {
        const rotulo = labelEl.textContent.trim();
        // CORRIGIDO 09/08/2026 (pedido do usuario: "quero que a caixa especifica pisque") - o alvo
        // aqui era secEl (a secao inteira), entao so rolava ate o topo da secao sem destacar o card
        // certo. O .card mais proximo do rotulo (ou o proprio labelEl, se por algum motivo nao tiver
        // um .card ancestral) passa a ser o alvo do scroll+piscar, igual ja acontece pra transacao.
        const cardAlvo = labelEl.closest('.card') || labelEl;
        if(rotulo) indice.push({texto: rotulo.toLowerCase(), rotulo: rotulo + ' — ' + tituloSecao, paneId, alvo: cardAlvo});
      });
      // NOVO 10/08/2026: <summary> de <details> (ex: "PIB Wallace (metodologia antiga...)") tambem
      // eh um titulo clicavel de verdade na tela - indexavel pelo proprio texto, alvo eh o <details>
      // (clicar no resultado precisa abri-lo pra nao rolar ate um bloco recolhido/vazio).
      conteudo.querySelectorAll('summary').forEach(sumEl => {
        const rotulo = sumEl.textContent.trim();
        const detalhesAlvo = sumEl.closest('details') || sumEl;
        if(rotulo) indice.push({texto: rotulo.toLowerCase(), rotulo: rotulo + ' — ' + tituloSecao, paneId, alvo: detalhesAlvo});
      });
      // NOVO 17/08/2026 (achado do usuário: "as alterações novas e menus novos não estão sendo
      // achados na pesquisa, todos os dados devem poder ser achados" — cards novos como "⚡ Medidor
      // de energia..."/"📊 Consumo real × crédito..." não apareciam buscando pelo próprio título).
      // Terceiro padrão de rótulo usado no site, além de `.row .k` e `[color:var(--text-mid)]`
      // acima: título de card em negrito puro (`font-weight:600`, sem cor especial) — usado quando
      // um .card tem seu próprio "cabeçalho" interno em vez de depender só do título da seção pai.
      // `:first-child` restringe ao PRIMEIRO elemento do card (o título), nunca um valor numérico
      // qualquer no meio do card que também use negrito (ex: `.v` com font-weight:600 pra destacar
      // um número) — esses não são "título", indexá-los junto poluiria a busca com números soltos.
      conteudo.querySelectorAll('.card > div:first-child[style*="font-weight:600"]').forEach(tituloEl => {
        const rotulo = tituloEl.textContent.trim();
        const cardAlvo = tituloEl.closest('.card') || tituloEl;
        if(rotulo) indice.push({texto: rotulo.toLowerCase(), rotulo: rotulo + ' — ' + tituloSecao, paneId, alvo: cardAlvo});
      });
      conteudo = conteudo.nextElementSibling;
    }
  });
  // NOVO 09/08/2026 (pedido do usuario: "coloque so as siglas tambem na pesquisa") - ate aqui, a
  // sigla de uma aba do Livro Razao (ex: "LRB") so aparecia no indice via construirIndiceTransacoesBusca,
  // e so quando o array daquele livro tinha pelo menos 1 transacao com tx+valor validos. Livro vazio ou
  // sem esse formato = sigla invisivel pra busca. Agora cada aba mapeada em LIVRO_PARA_TAB_LR entra
  // direto no indice de SECAO (independente de ter transacao), buscavel pela sigla sozinha ("lrb"), pelo
  // nome sozinho ("boletos") ou pelos dois juntos ("lrb boletos") - mesmo helper buscaTermoBateTexto.
  const secaoLivrosRazao = Array.from(document.querySelectorAll('.section-num'))
    .find(s => s.querySelector('h2')?.textContent.trim() === 'Livros razão');
  if(secaoLivrosRazao){
    const paneLR = secaoLivrosRazao.closest('.master-pane');
    if(paneLR){
      Object.entries(LIVRO_PARA_TAB_LR).forEach(([, chaveTab]) => {
        const btn = document.getElementById('lrTabBtn_' + chaveTab);
        if(!btn) return;
        const rotuloBtn = btn.textContent.trim();
        if(!rotuloBtn) return;
        indice.push({
          texto: (chaveTab + ' ' + rotuloBtn).toLowerCase(),
          rotulo: rotuloBtn + ' — Livros razão',
          paneId: paneLR.id,
          alvo: btn,
          tabChave: chaveTab
        });
      });
    }
  }
  return indice;
}

function irParaSecaoBusca(item){
  showMaster(item.paneId);
  // NOVO 09/08/2026: resultado de aba do Livro Razao (tabChave presente) troca pra aba certa antes de
  // rolar/piscar - sem isso, o botao poderia estar la mas a TABELA visivel seria de outra aba.
  if(item.tabChave) showLR(item.tabChave, item.alvo);
  setTimeout(()=>{ scrollParaSecaoComOffset(item.alvo); }, 30);
}

// NOVO 04/08/2026 (parte 76, pedido do usuario: "quero que no campo de pesquisa possa pesquisar
// valores e TX pra achar compras"): a busca antiga so indexava texto ESTATICO da tela (titulo de
// secao + rotulo de linha) - nunca os dados de transacao em si (a maioria dos livros nao tem tabela
// item-a-item visivel na tela, so cards de agregado, entao nao tinha como achar por texto/DOM).
// Constroi um segundo indice, direto do VARS (nao do DOM), varrendo todos os livros de transacao
// conhecidos + o historico cross-ciclo (parte 57). Busca por: codigo TX (com ou sem "TX"), valor
// (com vírgula/ponto, com ou sem "R$"), ou nome do estabelecimento/descricao.
// EXPANDIDO 09/08/2026 (achado do usuário: buscar "LRPV" dava "Nada encontrado", "a lupa tem que
// pegar tudo") — a lista cobria só 9 dos ~24 arrays de transação reais do sistema (grep por
// `_TRANSACOES: [` em src/financeiro/**/vars-*.js + TRANSACOES_CORPORATIVAS_MP/PARCELAMENTOS_*, que
// têm o mesmo formato tx/nome/valor). Agora cobre todos.
const LIVROS_BUSCAVEIS = ['LRW_TRANSACOES','LRV_TRANSACOES','LRC_LIMBO_TRANSACOES','LRCV_TRANSACOES',
  'PV_TRANSACOES','LRPGV_TRANSACOES','BOLETOS_TRANSACOES','HISTORICO_ERP_TODOS_CICLOS','BENS_DURAVEIS_TRANSACOES',
  'CAIXA_LANCE_TRANSACOES','MANUTENCAO_TRANSACOES','ANIVERSARIO_JULIO_TRANSACOES','EVENTOS_TRANSACOES',
  'SEGURO_EMPLACAMENTO_TRANSACOES','COMBUSTIVEL_TRANSACOES','CHURRASCO_TRANSACOES','ESCOLA_JULIO_TRANSACOES',
  'MASTERCARD_INFINITE_TRANSACOES','SUAVIZACAO_TRANSACOES','SAUDE_FAMILIA_TRANSACOES','WARTSILA_CAIXA_TRANSACOES',
  'TRANSACOES_CORPORATIVAS_MP','PARCELAMENTOS_VISA','PARCELAMENTOS_MP','EMAGRECIMENTO_TRANSACOES'];
let _buscaGlobalIndiceTransacoes = null;

// CORRIGIDO 09/08/2026 (achado do usuário: buscar "LRPGV" dava "Nada encontrado" mesmo depois de
// consertar o match por código de livro) - na época o array interno se chamava LRPV_TRANSACOES (sem
// G), mas a aba visível na tela mostra "LRPGV - PIX Geral Vanessa" (com G) - nomes de código e de
// exibição DIVERGIAM, "LRPGV" nunca seria substring de "lrpv_transacoes". Em vez de corrigir só esse
// caso (remendo pontual), passou a buscar o texto REAL do botão da aba no DOM (via LIVRO_PARA_TAB_LR,
// já existe) pra cada livro - resolve essa classe inteira de mismatch código-interno × rótulo-visível
// de uma vez, pra qualquer livro que tenha essa mesma divergência, sem precisar descobrir um por um.
// RENOMEADO 12/08/2026 (auditoria de nomenclatura): o array em si foi renomeado de LRPV_TRANSACOES
// para LRPGV_TRANSACOES (bate com o rótulo visível "LRPGV"), então essa divergência específica não
// existe mais - a busca por texto do DOM continua valendo pra qualquer outro livro no mesmo caso.
function construirIndiceTransacoesBusca(){
  const indice = [];
  const vistos = new Set(); // evita duplicar a mesma TX se aparecer em 2 arrays (ex: ciclo atual + historico)
  LIVROS_BUSCAVEIS.forEach(nomeLivro=>{
    const chaveTab = LIVRO_PARA_TAB_LR[nomeLivro];
    const botaoTab = chaveTab ? document.getElementById('lrTabBtn_' + chaveTab) : null;
    const livroLabel = botaoTab ? botaoTab.textContent.trim().toLowerCase() : '';
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
        livroLabel,
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
// EXPANDIDO 09/08/2026: adicionadas só as abas confirmadas direto no HTML (id="lrTabBtn_X") - livros
// sem aba própria confirmada (WARTSILA_CAIXA_TRANSACOES, SUAVIZACAO_TRANSACOES,
// TRANSACOES_CORPORATIVAS_MP, HISTORICO_ERP_TODOS_CICLOS) ficam de fora de propósito, mesma regra de
// sempre: sem mapeamento certo, o clique só leva até a seção, nunca arrisca trocar pra aba errada.
const LIVRO_PARA_TAB_LR = {
  'LRW_TRANSACOES': 'lrw',
  'LRV_TRANSACOES': 'lrv',
  'LRC_LIMBO_TRANSACOES': 'lrc',
  'LRCV_TRANSACOES': 'lrcv',
  'PV_TRANSACOES': 'lrpvsaldo',
  'LRPGV_TRANSACOES': 'lrpv',
  'BENS_DURAVEIS_TRANSACOES': 'lrbd',
  'BOLETOS_TRANSACOES': 'lrb',
  'CAIXA_LANCE_TRANSACOES': 'lrlance',
  'MANUTENCAO_TRANSACOES': 'lrmanut',
  'ANIVERSARIO_JULIO_TRANSACOES': 'lraniv',
  'EVENTOS_TRANSACOES': 'lreventos',
  'SEGURO_EMPLACAMENTO_TRANSACOES': 'lrseguro',
  'COMBUSTIVEL_TRANSACOES': 'lrcomb',
  'CHURRASCO_TRANSACOES': 'lrchurrasco',
  'SAUDE_FAMILIA_TRANSACOES': 'lrsaude',
  'MASTERCARD_INFINITE_TRANSACOES': 'lrmci',
  'PARCELAMENTOS_VISA': 'lrp',
  'PARCELAMENTOS_MP': 'lrmp',
  'EMAGRECIMENTO_TRANSACOES': 'lremag'
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

// ADICIONADO 15/08/2026 (achado de auditoria de segurança: XSS real — nome/descrição/obs de
// transação podem vir de texto que um terceiro escolheu livremente num pagamento/extrato bancário,
// e iam direto pra innerHTML sem escapar. Mesmo padrão de correção usado em inbox-financeira.js).
function _buscaEscapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function renderResultadoTransacao(t, livro){
  const div = document.createElement('div');
  div.className = 'busca-resultado-item busca-resultado-transacao';
  const nomeLivroCurto = livro.replace('_TRANSACOES','').replace('HISTORICO_ERP_TODOS_CICLOS','Histórico');
  div.innerHTML = `<strong>${_buscaEscapeHtml(t.tx)||'—'}</strong> · ${_buscaEscapeHtml(t.nome||t.descricao)||'(sem descrição)'} · <strong>${fmt(t.valor)}</strong>`
    + `<span class="busca-resultado-sub"> ${_buscaEscapeHtml(t.data)||''} — ${_buscaEscapeHtml(nomeLivroCurto)}${t.obs ? ' — '+_buscaEscapeHtml(t.obs) : ''}</span>`;
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

// NOVO 09/08/2026 (pedido do usuario: "quero que ache pela sigla" - buscar "LRB Boletos" dava "Nada
// encontrado" mesmo com a aba "LRB - Boletos (9)" existindo) - o match antigo exigia a FRASE inteira
// como substring literal ("lrb boletos" nao e substring de "lrb - boletos (9)", tem " - " no meio).
// Agora compara por TOKEN: cada palavra digitada precisa aparecer em algum lugar do texto (AND entre
// palavras, ordem livre) - "lrb boletos", "boletos lrb" ou so "lrb" batem todos na mesma aba.
function buscaTermoBateTexto(texto, termo){
  if(!texto || !termo) return false;
  return termo.split(/\s+/).filter(Boolean).every(tok => texto.includes(tok));
}
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
    .filter(it => buscaTermoBateTexto(it.texto, t))
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

// NOVO 09/08/2026 (pedido do usuario: campo de busca movido pra barra fixa FORA do iframe, index.html
// - so assim fica "sempre visivel" de verdade, já que position:fixed daqui de dentro nunca pinta por
// cima da barra externa). Versao "so dados" das funcoes acima - reaproveita 100% do mesmo indice/
// match/ordenacao de renderResultadosBusca(), so devolve objetos simples (sem elemento DOM) em vez de
// escrever HTML, porque quem desenha o dropdown agora é o index.html. Navegação (scroll/troca de aba)
// continua acontecendo AQUI dentro do iframe - só o resultado da busca cruza a fronteira.
let _buscaGlobalUltimoResultado = null;
function buscaGlobalDados(termo){
  if(!_buscaGlobalIndice) _buscaGlobalIndice = construirIndiceBuscaGlobal();
  if(!_buscaGlobalIndiceTransacoes) _buscaGlobalIndiceTransacoes = construirIndiceTransacoesBusca();
  const t = (termo||'').toLowerCase().trim();
  if(!t){ _buscaGlobalUltimoResultado = { secoes: [], transacoes: [] }; return { secoes: [], transacoes: [] }; }
  const tSemTx = t.replace(/^tx0*/, '');
  const tSoDigitos = t.replace(/[^\d,.]/g, '');
  const vistos = new Set();
  const secoesOriginais = _buscaGlobalIndice
    .filter(it => buscaTermoBateTexto(it.texto, t))
    .filter(it => { if(vistos.has(it.rotulo)) return false; vistos.add(it.rotulo); return true; })
    .slice(0, 5);
  // NOVO 09/08/2026 (achado do usuário: buscar "LRPV" dava "Nada encontrado" mesmo com o livro
  // existindo) - antes só comparava contra TX/nome/valor de CADA transação, nunca contra o código do
  // livro em si. Agora também casa pelo nome do array (ex: "LRPGV_TRANSACOES") - digitar o código do
  // livro mostra as transações dele, mesmo sem saber nenhum nome/valor específico.
  const transacoesOriginais = t.length >= 2 ? _buscaGlobalIndiceTransacoes.filter(it=>{
    if(it.tx.includes(t) || (tSemTx && it.tx.includes(tSemTx))) return true;
    if(it.nome.includes(t)) return true;
    if(it.livro && it.livro.toLowerCase().includes(t)) return true;
    if(it.livroLabel && buscaTermoBateTexto(it.livroLabel, t)) return true;
    if(tSoDigitos && (it.valorTexto.includes(tSoDigitos.replace('.',',')) || it.valorNumStr.includes(tSoDigitos))) return true;
    return false;
  }).sort((a,b)=>{
    const valorBuscado = tSoDigitos ? parseFloat(tSoDigitos.replace(',','.')) : null;
    const aExato = valorBuscado !== null && a.registro.valor === valorBuscado;
    const bExato = valorBuscado !== null && b.registro.valor === valorBuscado;
    if(aExato && !bExato) return -1;
    if(bExato && !aExato) return 1;
    return 0;
  }).slice(0, 6) : [];
  _buscaGlobalUltimoResultado = { secoes: secoesOriginais, transacoes: transacoesOriginais };
  return {
    secoes: secoesOriginais.map((it,i) => ({ idx:i, rotulo: it.rotulo })),
    transacoes: transacoesOriginais.map((it,i) => ({
      idx:i, tx: it.registro.tx||'—', nome: it.registro.nome||it.registro.descricao||'(sem descrição)',
      valor: fmt(it.registro.valor), data: it.registro.data||'', obs: it.registro.obs||'',
      livro: it.livro.replace('_TRANSACOES','').replace('HISTORICO_ERP_TODOS_CICLOS','Histórico')
    }))
  };
}
function buscaGlobalNavegar(tipo, idx){
  if(!_buscaGlobalUltimoResultado) return;
  if(tipo === 'secao'){
    const item = _buscaGlobalUltimoResultado.secoes[idx];
    if(item) irParaSecaoBusca(item);
  } else {
    const it = _buscaGlobalUltimoResultado.transacoes[idx];
    if(it) irParaTransacaoNoLivro(it.registro, it.livro);
  }
}
window.buscaGlobalDados = buscaGlobalDados;
window.buscaGlobalNavegar = buscaGlobalNavegar;

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

// NOVO 17/08/2026 (achado do usuário: ".master-tabs rola liso no touch do celular, mas no PC o botão
// '+ Lançar' fica cortado sem jeito óbvio de chegar nele" — overflow-x:auto funciona perfeitamente
// via arrastar-dedo no touch, mas mouse/trackpad não geram gesto horizontal por padrão, e a barra de
// rolagem está escondida de propósito (scrollbar-width:none, ver styles.css) pelo visual "pill" já
// aprovado. Sem indicação nenhuma de COMO rolar no desktop, só a sombra/gradiente da direita (que
// avisa "tem mais", mas não ensina como chegar lá). Fix padrão pra barra horizontal em desktop:
// captura a rolagem VERTICAL do mouse (roda/trackpad) enquanto o cursor está sobre a barra e
// converte em scrollLeft — não precisa de scroll horizontal nativo (shift+roda), que quase nenhum
// usuário conhece. preventDefault só quando a barra realmente tem o que rolar (scrollWidth >
// clientWidth) - em telas largas o bastante pra caber tudo, o scroll da página passa normal por
// baixo do cursor, sem capturar rolagem que não faz sentido interceptar.
function habilitarRolagemHorizontalMasterTabsNoMouse(){
  const tabs = document.querySelector('.master-tabs');
  if(!tabs) return;
  tabs.addEventListener('wheel', (e) => {
    if(tabs.scrollWidth <= tabs.clientWidth) return; // nada pra rolar - deixa o scroll da página normal
    tabs.scrollLeft += e.deltaY;
    e.preventDefault();
  }, {passive:false});
}

// NOVO 17/08/2026 (mesmo achado acima: roda do mouse funciona mas ninguém descobre sozinho). Setas
// visíveis (◄ ►) grudadas nas bordas da própria barra (position:sticky dentro do scroll horizontal
// dela, ver .master-tabs-nav em styles.css) — aparecem só quando há de fato conteúdo cortado, e cada
// lado individualmente some quando já rolou até aquela ponta (não faz sentido "voltar" se já está no
// início). Mesmo elemento serve em qualquer largura de tela, inclusive mobile (harmless: quem já rola
// com o dedo só ganha um atalho extra, não muda o gesto de toque).
function atualizarSetasMasterTabs(){
  const tabs = document.querySelector('.master-tabs');
  const prev = $('masterTabsPrev');
  const next = $('masterTabsNext');
  if(!tabs || !prev || !next) return;
  const folga = 4; // px de tolerância pra arredondamento de scroll fracionário
  const temOverflow = tabs.scrollWidth > tabs.clientWidth + folga;
  prev.style.display = (temOverflow && tabs.scrollLeft > folga) ? 'flex' : 'none';
  next.style.display = (temOverflow && tabs.scrollLeft < (tabs.scrollWidth - tabs.clientWidth - folga)) ? 'flex' : 'none';
}
function habilitarSetasMasterTabs(){
  const tabs = document.querySelector('.master-tabs');
  const prev = $('masterTabsPrev');
  const next = $('masterTabsNext');
  if(!tabs || !prev || !next) return;
  prev.addEventListener('click', () => tabs.scrollBy({left: -tabs.clientWidth*0.7, behavior:'smooth'}));
  next.addEventListener('click', () => tabs.scrollBy({left: tabs.clientWidth*0.7, behavior:'smooth'}));
  tabs.addEventListener('scroll', atualizarSetasMasterTabs, {passive:true});
  window.addEventListener('resize', atualizarSetasMasterTabs, {passive:true});
  atualizarSetasMasterTabs();
}

// Wiring (movido de app.js junto com as funções, mesma ordem relativa de antes) — onDomPronto já
// trata "DOM já pronto" chamando na hora, então o efeito prático é idêntico, só roda alguns
// milissegundos depois (depois de energia-solar.js/promocoes-financeengine.js terminarem de
// carregar), sem nenhuma dependência de hydrate() ou dos outros onDomPronto que continuam em app.js.
onDomPronto(initBuscaGlobal); // V300 (Etapa 6): so liga o listener do input, nao depende de hydrate/dados
onDomPronto(renderCapaNav); // parte 41: monta os cards de navegacao da Capa/Dashboard
onDomPronto(toggleBtnVoltarCapa); // parte 41: estado inicial do botao flutuante (escondido no topo)
onDomPronto(()=>renderPageStrip('painel')); // parte 42: estado inicial da faixa "onde estou" (painel e o pane ativo por padrao no HTML)
onDomPronto(habilitarRolagemHorizontalMasterTabsNoMouse); // NOVO 17/08/2026: roda do mouse rola a barra de abas no desktop
onDomPronto(habilitarSetasMasterTabs); // NOVO 17/08/2026: setas visíveis pra rolar a barra de abas (descobrível, sem depender da roda do mouse)
window.addEventListener('scroll', toggleBtnVoltarCapa, {passive:true}); // parte 41: mostra/esconde ao rolar
window.addEventListener('scroll', toggleMasterTabsAoRolar, {passive:true}); // NOVO 12/08/2026: auto-hide da barra .master-tabs dentro das abas
