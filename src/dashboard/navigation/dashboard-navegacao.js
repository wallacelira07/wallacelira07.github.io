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

// REMOVIDO 18/08/2026 (achado de auditoria noturna, autorizado pelo usuário: "código morto...pode
// eliminar"): CAPA_DESTINOS, NOMES_PANE, renderCapaNav() e irParaCapaDestino() nunca executavam de
// verdade — os containers que dependiam (#coverNavGrid, #pageStrip) nunca existiram no HTML final, e
// as classes que gerariam (.cover-nav-*, .cnc-*, .page-strip-*) nunca tiveram regra em styles.css. A
// navegação real da Capa hoje é .home-nav-grid (HTML estático + CSS completo). Confirmado por grep
// que nenhum outro arquivo do projeto referenciava CAPA_DESTINOS/NOMES_PANE fora deste cluster morto.

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

// REMOVIDO 18/08/2026 (achado de auditoria noturna, autorizado pelo usuário: "código morto...pode
// eliminar"): irParaCapaDestino() era chamada só pelos onclick gerados por renderCapaNav() (removida
// acima), que nunca rodava de verdade — código morto junto.

function voltarParaCapa(){
  window.scrollTo({top:0, behavior:'smooth'});
}

// NOVO 04/08/2026 (parte 42, pedido do usuario - remover a barra de abas redundante com o dashboard):
// substitui .master-tabs (4 botoes fixos, duplicava navegacao que os cards da Capa ja fazem) por uma
// faixa fina e sticky que so mostra "onde o usuario esta agora" + um atalho de volta pro dashboard -
// uma unica forma de navegar (os cards), uma unica forma de se orientar (esta faixa), sem duplicidade.
// REMOVIDO 18/08/2026 (achado de auditoria noturna, autorizado pelo usuário: "código morto...pode
// eliminar"): renderPageStrip()/NOMES_PANE nunca executavam de verdade — #pageStrip nunca existiu no
// HTML final e .page-strip-* nunca teve regra em styles.css. .master-tabs continua sendo a navegação
// real e ativa do site.

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
  // CORRIGIDO 20/08/2026 (achado real do usuário: "continua com o problema de clicar na transação e
  // não ir em cima dela"): showLR() é um TOGGLE — clicar numa aba já ativa FECHA ela (remove .active
  // de tudo e nunca readiciona, ver ui-navegacao-basica.js). Chamar showLR() incondicionalmente aqui
  // significa que buscar um item que já está na aba visível FECHA a tabela inteira em vez de só rolar
  // até a linha. Navegação por busca precisa sempre abrir/manter aberto, nunca fechar — só chama
  // showLR() se a aba alvo ainda não estiver ativa.
  if(item.tabChave && item.alvo && !item.alvo.classList.contains('active')) showLR(item.tabChave, item.alvo);
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
  // NOVO 20/08/2026 (achado do usuário: buscar TXP000025 — parcela já quitada — trocava de aba certo
  // (LRP) mas não destacava nenhuma linha, sem explicação nenhuma; parecia bug de navegação, mas na
  // verdade render-parcelamentos.js só desenha linhas com status==='ATIVO' — quitadas nunca entram no
  // DOM, então scrollIntoView/destaque nunca tinham chance de achar a linha). Avisa ANTES de tentar
  // navegar, em vez de falhar silenciosamente — devolve o motivo pro chamador (buscaGlobalNavegar)
  // mostrar pro usuário.
  if(t && t.status && t.status !== 'ATIVO'){
    return { ok: false, motivo: `Este item já está quitado/concluído — não aparece na lista de itens ativos de ${livro.replace('_TRANSACOES','')}.` };
  }
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
      let alvo = Array.from(document.querySelectorAll('.pane.active tbody tr')).find(tr => tr.textContent.includes(t.tx));
      // NOVO 20/08/2026 (achado do usuario: clicar num resultado de busca cujo livro nao tem entrada
      // em LIVRO_PARA_TAB_LR - ex. "Histórico"/HISTORICO_ERP_TODOS_CICLOS, TRANSACOES_CORPORATIVAS_MP -
      // so rolava ate o topo da secao "Livros razao", sem trocar de aba nem destacar a linha, porque a
      // busca de <tr> olhava so a aba ja ativa (que podia nao ser a certa). Em vez de tentar completar
      // o mapa manualmente pra cada livro (mesmo problema, so adiado), fallback generico: se nao achou
      // na aba atual, varre TODOS os panes da secao 07 procurando qual realmente contem a linha, troca
      // pra ele via showLR() e so entao destaca - funciona pra qualquer livro, mapeado ou nao.
      if(!alvo && secaoAlvo){
        const cardLR = secaoAlvo.nextElementSibling;
        const paneComLinha = cardLR ? Array.from(cardLR.querySelectorAll('.pane')).find(p => p.id && Array.from(p.querySelectorAll('tbody tr')).some(tr => tr.textContent.includes(t.tx))) : null;
        if(paneComLinha){
          const btnAlvo = document.getElementById('lrTabBtn_' + paneComLinha.id);
          if(btnAlvo) showLR(paneComLinha.id, btnAlvo);
          alvo = Array.from(paneComLinha.querySelectorAll('tbody tr')).find(tr => tr.textContent.includes(t.tx));
        }
      }
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
    if(it) return irParaTransacaoNoLivro(it.registro, it.livro);
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
// CORRIGIDO 22/08/2026, 8ª rodada (giro completo via clones, ver habilitarSetasMasterTabs abaixo):
// `tabs.scrollWidth` sozinho não serve mais pra medir overflow — os clones nas 2 pontas (que existem
// só pra dar espaço de "continuar rolando" durante o giro) inflam o scrollWidth mesmo quando o
// conteúdo REAL cabe inteiro na tela. Mede só a largura das abas reais (`:not(.master-tab--clone)`).
function medirLarguraRealTabs(tabs){
  const reais = tabs.querySelectorAll('.master-tab:not(.master-tab--clone)');
  if(!reais.length) return 0;
  const primeiro = reais[0], ultimo = reais[reais.length - 1];
  return (ultimo.offsetLeft + ultimo.offsetWidth) - primeiro.offsetLeft;
}
function atualizarSetasMasterTabs(){
  const tabs = document.querySelector('.master-tabs');
  const prev = $('masterTabsPrev');
  const next = $('masterTabsNext');
  if(!tabs || !prev || !next) return;
  const folga = 4; // px de tolerância pra arredondamento de scroll fracionário
  const temOverflow = medirLarguraRealTabs(tabs) > tabs.clientWidth + folga;
  // CORRIGIDO 22/08/2026 (achado do usuário: "faça o carrocel como pedi, giro infinito" — as setas
  // sumiam sozinhas em cada ponta, contradizendo a ideia de "carrossel infinito": se clicar em
  // "próxima" no fim já dá a volta pro início (ver habilitarSetasMasterTabs abaixo), a seta "próxima"
  // NUNCA deveria sumir nessa ponta, senão o usuário fica sem o botão bem na hora de dar a volta.
  // Ambas as setas agora só dependem de "existe overflow", nunca da posição atual do scroll.
  prev.style.display = temOverflow ? 'flex' : 'none';
  next.style.display = temOverflow ? 'flex' : 'none';
  // NOVO 22/08/2026 (pedido do usuário: "centralize os botões") — sem overflow (cabe tudo na tela),
  // centraliza os botões em vez de deixá-los grudados à esquerda com vão vazio à direita.
  tabs.classList.toggle('master-tabs--centralizada', !temOverflow);
}
// CORRIGIDO 22/08/2026 (pedido do usuário: "cadê o botão pra rodar o carrocel de abas?" — as setas
// existiam mas não apareciam: atualizarSetasMasterTabs() só rodava 1x, síncrono, no exato instante
// de onDomPronto — nesse momento a barra podia ainda não ter o layout final (fonte/emoji/ícone
// carregando, ou a aba "Opções" nova, adicionada nesta mesma sessão, empurrando a barra pra overflow
// pela 1ª vez). Sem nenhum recheck depois do primeiro paint, a barra podia ficar "presa" achando que
// cabia tudo. Agora reconfere de novo logo após o load completo da página (window.load, que só
// dispara depois de toda fonte/imagem/ícone terminar) — cobre exatamente esse tipo de atraso.
//
// AMPLIADO (mesmo pedido, "faça estilo carrocel, onde vou passando e volta ao início"): clicar em
// "próxima" no fim da barra volta pro início (scrollLeft=0) em vez de ficar parado sem fazer nada;
// clicar em "anterior" no início pula pro fim — looping de verdade, não só ida-e-volta linear.
// CORRIGIDO 22/08/2026 (achado do usuário: "a barra pisca/pula mas volta pro mesmo lugar" ao
// clicar nas setas — sintoma de algo revertendo o scroll logo depois de aplicado, não de o clique
// não registrar). Reescrito de forma defensiva, cobrindo os 3 suspeitos mais prováveis de um
// scroll "voltar sozinho" sem eu conseguir reproduzir ao vivo neste ambiente (sem login):
//   1) e.preventDefault() — clique em <button> pode disparar scroll de foco do próprio navegador
//      (rolar o elemento focado pra dentro da viewport), competindo com o scroll manual.
//   2) btn.blur() logo após clicar — mesmo motivo, elimina qualquer scroll-into-view de foco que o
//      navegador dispare depois do clique, já que o botão nunca precisa ficar focado visualmente.
//   3) behavior:'auto' (instantâneo) em vez de 'smooth' — a versão anterior usava scroll suave, que
//      fica em voo por ~300-500ms; qualquer outro código que rode `atualizarSetasMasterTabs()`
//      nesse meio-tempo (ela roda a cada evento 'scroll', inclusive os intermediários da animação)
//      alterna a classe `master-tabs--centralizada` — se isso disparar por engano com scroll ainda
//      em andamento, justify-content:center brigaria com o scroll suave em curso (mesmo bug clássico
//      de flexbox documentado no CSS). Scroll instantâneo elimina essa janela de tempo inteira.
// REESCRITO 22/08/2026 (pedido explícito do usuário, depois de testar ao vivo: "eu quero que ao
// clicar na seta a aba vai andando para frente até começar a retornar para o final novamente, como
// um anel" — a versão anterior rolava ~70% da largura visível por clique, podia parar no meio de uma
// aba; o pedido é passo de UMA aba por clique, sempre alinhada à borda esquerda da barra, com o loop
// mantido nas duas pontas).
// CORRIGIDO 22/08/2026, 2ª rodada (2 bugs reais achados testando AO VIVO no site publicado, via
// injeção de script no DevTools — não só leitura de código): a 1ª versão calculava "aba atual" só
// pela posição de scroll (`indiceAtual()` sem estado próprio) — funcionava bem no meio da barra, mas
// TRAVAVA nas pontas: quando o `offsetLeft` de uma aba é MAIOR que o scroll máximo possível (comum
// nas últimas 2-3 abas de uma barra com pouco overflow — não sobra espaço pra alinhá-las exatamente
// à borda esquerda), várias abas diferentes ficam TODAS clampadas pro mesmo `scrollLeft` máximo —
// nesse ponto, ler a posição de volta não diferencia mais "estou na aba 6" de "estou na aba 8", então
// clicar "próxima"/"anterior" repetidamente ficava preso recalculando o mesmo alvo pra sempre, sem
// nunca progredir nem dar a volta. Fix: `idxCarrossel` guarda o índice como ESTADO (não mais derivado
// só da posição) — incrementa/decrementa direto a cada clique, e resincroniza com o scroll real (pra
// continuar funcionando se o usuário rolar manualmente com o dedo/roda do mouse) só quando a posição
// NÃO está grudada numa das pontas (onde a leitura seria ambígua, como explicado acima).
// CORRIGIDO 22/08/2026, 8ª rodada (pedido explícito do usuário depois de testar as rodadas 6/7: "tem
// dar o giro completo" — mesmo com a duração escalando por distância, animar a volta como um scroll
// PRA TRÁS de "fim" até "início" nunca parece um giro de verdade, porque literalmente inverte a
// direção do movimento — um carrossel de verdade continua girando na MESMA direção até fechar a
// volta). Solução: truque clássico de "loop infinito" via clones — duplica visualmente as primeiras
// abas depois da última real (`data-clone-pos="fim"`) e as últimas abas antes da primeira real
// (`data-clone-pos="inicio"`), o suficiente pra cobrir 1 largura de tela inteira em cada ponta. Ao
// clicar "próxima" na última parada, a barra CONTINUA rolando pra frente até o clone da 1ª aba
// (pixel-idêntico à aba real) — e só DEPOIS da animação assentar, um ajuste instantâneo (sem
// transição, um único frame) subtrai a largura real total do `scrollLeft`, pousando exatamente na
// aba real 0 sem nenhuma diferença visual (o clone e o real são idênticos). Mesmo mecanismo espelhado
// pra "anterior" na 1ª parada, usando os clones do início. O resultado: o scroll NUNCA inverte de
// direção durante o giro, só continua e "teleporta" de forma imperceptível no instante exato em que
// clone e real são visualmente indistinguíveis.
function habilitarSetasMasterTabs(){
  const tabs = document.querySelector('.master-tabs');
  const prev = $('masterTabsPrev');
  const next = $('masterTabsNext');
  if(!tabs || !prev || !next) return;
  const folga = 4; // px de tolerância pra arredondamento de scroll fracionário
  let idxCarrossel = 0;
  let _scrollAnimId = 0; // token da animação em voo - clique novo invalida a anterior, sem disputa
  let animandoAgora = false; // true enquanto animarScrollPara() está em voo - ver sincronizarComScroll()
  let travadoDuranteGiro = false; // true só durante a transição pro clone - ver comentário nos handlers de clique

  function reais(){
    return Array.from(tabs.querySelectorAll('.master-tab:not(.master-tab--clone)'));
  }
  // Clona abas reais nas 2 pontas da barra pra dar espaço de "continuar rolando" sem inverter direção
  // — largura de clone em cada ponta cobre pelo menos 1 tela inteira, cíclico se a barra tiver menos
  // abas que cabem numa tela (usa `i % lista.length` pra poder repetir a sequência mais de uma vez).
  // Idempotente (remove clones antigos primeiro) — chamado de novo em `resize` porque a largura da
  // tela (e portanto quantos clones cabem) pode mudar.
  function configurarClones(){
    tabs.querySelectorAll('.master-tab--clone').forEach(el => el.remove());
    const lista = reais();
    if(!lista.length) return;
    // Sem overflow real (cabe tudo na tela) não tem carrossel nenhum pra fazer - clones só existem
    // pra dar espaço de rolagem durante o giro, adicioná-los aqui só inflaria o scrollWidth à toa e
    // quebraria a centralização de `.master-tabs--centralizada` (ver atualizarSetasMasterTabs).
    if(medirLarguraRealTabs(tabs) <= tabs.clientWidth + folga){ tabs.scrollLeft = 0; return; }
    const viewport = tabs.clientWidth;
    let larguraFim = 0, i = 0;
    while(larguraFim < viewport && i < lista.length * 3){
      const original = lista[i % lista.length];
      const clone = original.cloneNode(true);
      clone.classList.add('master-tab--clone');
      clone.dataset.clonePos = 'fim';
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      tabs.insertBefore(clone, next);
      larguraFim += original.offsetWidth + 8;
      i++;
    }
    const primeiroReal = lista[0];
    let referencia = primeiroReal, larguraInicio = 0, j = lista.length - 1, contador = 0;
    while(larguraInicio < viewport && contador < lista.length * 3){
      const idx = ((j % lista.length) + lista.length) % lista.length;
      const original = lista[idx];
      const clone = original.cloneNode(true);
      clone.classList.add('master-tab--clone');
      clone.dataset.clonePos = 'inicio';
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      tabs.insertBefore(clone, referencia); // sempre antes da referência anterior - mantém ordem certa
      referencia = clone;
      larguraInicio += original.offsetWidth + 8;
      j--; contador++;
    }
    // posição inicial tem que começar na 1ª aba REAL (depois dos clones prependados no início), nunca
    // em scrollLeft=0 (que agora mostraria os clones do "fim" duplicados, não o Painel de verdade).
    tabs.scrollLeft = primeiroReal.offsetLeft;
  }
  // CORRIGIDO 22/08/2026, 5ª rodada (achado real do usuário: "na última aba trava e fico clicando e
  // não anda, aí se eu cliquei 4 vezes, tenho que clicar 4 vezes no outro lado pra normalizar").
  // Causa: quando várias abas do final (offsetLeft > scroll máximo possível) todas clampam pra
  // EXATAMENTE a mesma posição de rolagem, cada uma consumia 1 clique próprio pra "avançar" o índice,
  // sem NENHUMA mudança visual. Fix de fundo: em vez de 1 "parada" por aba, calcula quantas paradas
  // VISUALMENTE DISTINTAS existem de verdade — todas as abas reais que cabem exatas (0..
  // ultimoAlcancavel) mais UMA parada extra "fim" (só se sobrar conteúdo depois da última que cabe).
  // `max` aqui considera só o conteúdo REAL (último real + sua largura − largura da tela), nunca os
  // clones — eles são só decoração de transição, não paradas de navegação de verdade.
  function calcularParadas(lista){
    const ultimoReal = lista[lista.length - 1];
    const max = Math.max(0, (ultimoReal.offsetLeft + ultimoReal.offsetWidth) - tabs.clientWidth);
    let ultimoAlcancavel = 0;
    for(let i=0;i<lista.length;i++){
      if(lista[i].offsetLeft <= max) ultimoAlcancavel = i; else break;
    }
    const temSobra = ultimoAlcancavel < lista.length - 1;
    const numParadas = temSobra ? ultimoAlcancavel + 2 : ultimoAlcancavel + 1;
    return {max, ultimoAlcancavel, numParadas};
  }
  function alvoDaParada(p, lista, info){
    return p <= info.ultimoAlcancavel ? lista[p].offsetLeft : info.max; // parada "fim" - mostra a cauda que não cabe alinhada
  }
  function sincronizarComScroll(lista, info){
    // Enquanto uma animação está em voo, confia 100% no `idxCarrossel` já rastreado — ler
    // `tabs.scrollLeft` no meio de um trajeto (inclusive dentro da zona de clone) não corresponde a
    // nenhuma parada de verdade e produzia leituras erradas (achado real, rodada 7).
    if(animandoAgora) return;
    if(tabs.scrollLeft <= lista[0].offsetLeft + folga){ idxCarrossel = 0; return; }
    if(tabs.scrollLeft >= info.max - folga){ idxCarrossel = info.numParadas - 1; return; } // na parada "fim"
    let idx = 0;
    for(let i=0;i<=info.ultimoAlcancavel;i++){
      if(lista[i].offsetLeft <= tabs.scrollLeft + folga) idx = i; else break;
    }
    idxCarrossel = idx;
  }
  // Animação própria via `requestAnimationFrame` com easing ease-in-out cúbico (acelera suave,
  // desacelera suave, sem repique) — mesma técnica de qualquer carrossel comercial, e dá controle
  // total sobre a duração (o `scrollTo({behavior:'smooth'})` nativo do navegador tem duração/curva
  // fixas, fora do nosso controle, e varia de navegador pra navegador). `_scrollAnimId` garante que um
  // clique novo no meio de uma animação em voo cancela a anterior de forma limpa. Duração escala com a
  // distância real percorrida — um passo comum continua rápido (~320ms), mas o trecho maior até o
  // clone (parte do giro completo) demora visivelmente mais, pra não parecer um pulo abrupto no
  // instante do pouso.
  // AUMENTADO 22/08/2026 (achado do usuário, testado ao vivo: o giro funcionou, mas "ficou muito
  // rápido pra pular da aba final pra primeira, parece um pulo" — o teto de 650ms deixava o trecho até
  // o clone rápido demais, o pouso instantâneo no final ficava perceptível por contraste. Teto subiu
  // pra 950ms e a taxa por pixel aumentou (~0,55 → ~0,75ms/px) - o trecho do giro fica visivelmente
  // mais devagar/gradual, o pouso no clone fica menos chamativo por não vir logo depois de um
  // movimento rápido. Passo comum (piso 260ms) não muda - só o trecho longo do giro fica mais lento.
  // AUMENTADO 22/08/2026, 2ª rodada (usuário mandou vídeo real de novo, "ainda tem que ajustar, ela
  // tá pulando da última aba pra primeira" — análise quadro a quadro do vídeo, sem pular frame nenhum
  // desta vez, confirmou que o giro NÃO inverte direção e desacelera suave até parar (comportamento
  // correto) — o "pulo" percebido é a quantidade de conteúdo varrida rápido demais num viewport
  // estreito, virando desfoque de movimento em vez de leitura gradual). Teto subiu de 950ms pra
  // 1500ms — bem mais devagar, prioriza legibilidade do movimento sobre agilidade do clique.
  function easeInOutCubic(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }
  function duracaoPelaDistancia(deltaAbs){
    return Math.min(1500, Math.max(260, 260 + deltaAbs * 1.1));
  }
  function animarScrollPara(alvo, aoAssentar){
    const inicio = tabs.scrollLeft;
    const delta = alvo - inicio;
    if(Math.abs(delta) < 1){ if(aoAssentar) aoAssentar(); return; }
    const meuId = ++_scrollAnimId;
    animandoAgora = true;
    const duracaoMs = duracaoPelaDistancia(Math.abs(delta));
    const t0 = performance.now();
    function passo(agora){
      if(meuId !== _scrollAnimId) return; // uma animação mais nova já assumiu - esta desiste
      const t = Math.min(1, (agora - t0) / duracaoMs);
      tabs.scrollLeft = inicio + delta * easeInOutCubic(t);
      if(t < 1) requestAnimationFrame(passo);
      else { animandoAgora = false; if(aoAssentar) aoAssentar(); }
    }
    requestAnimationFrame(passo);
  }
  // CORRIGIDO 22/08/2026, 10ª rodada (achado real do usuário: vídeo mostrando a barra "travada" bem
  // no fim, cliques sem efeito nenhum — investigado com cliques rápidos e IRREGULARES via script,
  // imitando o ritmo real de um clique humano, não o espaçamento uniforme dos testes anteriores).
  // Causa: `_scrollAnimId` cancela e reinicia a animação do giro a cada clique novo — se os cliques
  // chegam mais rápido que a duração da transição até o clone (até 650ms), a animação NUNCA termina
  // de verdade, o callback que faz o pouso instantâneo (`aoAssentar`) nunca dispara, e `idxCarrossel`
  // fica preso pra sempre no valor da última parada — cada clique novo recalcula o MESMO alvo (o
  // clone), sem nunca avançar. Passos normais (fora do giro) não sofrem disso, porque o alvo em si já
  // muda a cada clique (índice incrementado antes de animar), só a transição específica do giro
  // precisa da animação assentar pra saber onde "pousar" de verdade. Fix cirúrgico: `travadoDuranteGiro`
  // ignora cliques novos só durante essa transição específica (no máximo ~650ms) — garante que o giro
  // sempre completa e o índice sempre avança, sem travar a barra indefinidamente. Passos comuns
  // continuam 100% responsivos/cancela-e-reinicia como antes.
  prev.addEventListener('click', (e) => {
    e.preventDefault();
    if(travadoDuranteGiro) return;
    const lista = reais();
    if(!lista.length) return;
    const info = calcularParadas(lista);
    sincronizarComScroll(lista, info);
    if(idxCarrossel <= 0){
      // GIRO pra trás: continua rolando pra trás até o clone da última aba real (prependado antes do
      // início), depois pousa instantaneamente na aba real equivalente - nunca inverte a direção.
      const clonesInicio = Array.from(tabs.querySelectorAll('.master-tab--clone[data-clone-pos="inicio"]'));
      const cloneAdjacente = clonesInicio[clonesInicio.length - 1]; // o mais próximo da 1ª aba real
      const ultimoReal = lista[lista.length - 1];
      const larguraLoop = ultimoReal.offsetLeft - cloneAdjacente.offsetLeft;
      travadoDuranteGiro = true;
      animarScrollPara(cloneAdjacente.offsetLeft, () => {
        tabs.scrollLeft += larguraLoop; // pouso instantâneo, imperceptível (clone == real em pixel)
        idxCarrossel = info.numParadas - 1;
        travadoDuranteGiro = false;
      });
    } else {
      idxCarrossel--;
      animarScrollPara(alvoDaParada(idxCarrossel, lista, info));
    }
    prev.blur();
  });
  next.addEventListener('click', (e) => {
    e.preventDefault();
    if(travadoDuranteGiro) return;
    const lista = reais();
    if(!lista.length) return;
    const info = calcularParadas(lista);
    sincronizarComScroll(lista, info);
    if(idxCarrossel >= info.numParadas - 1){
      // GIRO pra frente: continua rolando pra frente até o clone da 1ª aba real (apendado depois do
      // fim), depois pousa instantaneamente na aba real equivalente - nunca inverte a direção.
      const cloneAdjacente = tabs.querySelector('.master-tab--clone[data-clone-pos="fim"]'); // o mais próximo do fim
      const larguraLoop = cloneAdjacente.offsetLeft - lista[0].offsetLeft;
      travadoDuranteGiro = true;
      animarScrollPara(cloneAdjacente.offsetLeft, () => {
        tabs.scrollLeft -= larguraLoop; // pouso instantâneo, imperceptível (clone == real em pixel)
        idxCarrossel = 0;
        travadoDuranteGiro = false;
      });
    } else {
      idxCarrossel++;
      animarScrollPara(alvoDaParada(idxCarrossel, lista, info));
    }
    next.blur();
  });
  configurarClones();
  tabs.addEventListener('scroll', atualizarSetasMasterTabs, {passive:true});
  window.addEventListener('resize', () => { configurarClones(); atualizarSetasMasterTabs(); }, {passive:true});
  atualizarSetasMasterTabs();
  window.addEventListener('load', () => { configurarClones(); atualizarSetasMasterTabs(); }, {once:true});
}
// CORRIGIDO 22/08/2026 (achado do usuário, testado ao vivo com print real: "nas abas dentro de todas
// menos Painel, Opções não aparece" — na verdade AS SETAS não apareciam em nenhuma aba além da que
// estava ativa no carregamento inicial. Causa raiz confirmada via DevTools ao vivo: `temOverflow`
// media `true` de verdade (scrollWidth 820 > clientWidth 518 na aba Opções), mas `prev.style.display`
// continuava `'none'` — `atualizarSetasMasterTabs()` só é chamada no load/scroll/resize da PRÓPRIA
// barra, nunca ao trocar de aba. Se a barra só passa a ter overflow DEPOIS da troca (aba mais larga
// que a que estava ativa no boot), a seta fica presa no estado herdado da aba anterior. `WallaceBus`
// já emite `'abaAlterada'` a cada troca (`showMaster()`, `ui-navegacao-basica.js`) — só faltava esta
// função escutar. `requestAnimationFrame` garante que o layout da aba nova já comitou antes de medir.
WallaceBus.on('abaAlterada', () => {
  requestAnimationFrame(atualizarSetasMasterTabs);
});

// Wiring (movido de app.js junto com as funções, mesma ordem relativa de antes) — onDomPronto já
// trata "DOM já pronto" chamando na hora, então o efeito prático é idêntico, só roda alguns
// milissegundos depois (depois de energia-solar.js/promocoes-financeengine.js terminarem de
// carregar), sem nenhuma dependência de hydrate() ou dos outros onDomPronto que continuam em app.js.
onDomPronto(initBuscaGlobal); // V300 (Etapa 6): so liga o listener do input, nao depende de hydrate/dados
onDomPronto(toggleBtnVoltarCapa); // parte 41: estado inicial do botao flutuante (escondido no topo)
// REMOVIDO 18/08/2026 (achado de auditoria noturna): onDomPronto(renderCapaNav) e
// onDomPronto(()=>renderPageStrip('painel')) — as 2 funções nunca executavam de verdade (containers
// inexistentes no HTML), ver comentários de remoção junto às definições acima.
onDomPronto(habilitarRolagemHorizontalMasterTabsNoMouse); // NOVO 17/08/2026: roda do mouse rola a barra de abas no desktop
onDomPronto(habilitarSetasMasterTabs); // NOVO 17/08/2026: setas visíveis pra rolar a barra de abas (descobrível, sem depender da roda do mouse)
window.addEventListener('scroll', toggleBtnVoltarCapa, {passive:true}); // parte 41: mostra/esconde ao rolar
window.addEventListener('scroll', toggleMasterTabsAoRolar, {passive:true}); // NOVO 12/08/2026: auto-hide da barra .master-tabs dentro das abas
