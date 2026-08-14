// MÓDULO: UI — componentes visuais autocontidos (esconder valores, download JPEG por seção)
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carrega
// DEPOIS do app.js terminar (onload). Zero dependência de VARS/REG — só DOM/localStorage/html2canvas.
// Nenhuma fórmula, comportamento ou resultado foi alterado, só o arquivo que hospeda o código.

// Antecipado do plano de 25/07 a pedido do usuario ("escolha as mais simples e ja implemente").
// Botao flutuante (topo direito, fixo em todas as paginas) que aplica blur em todos os valores
// monetarios (classes .v/.val/.r, ja usadas globalmente no painel) sem remover labels/estrutura -
// util pra mostrar o painel pra terceiros sem expor numeros. Preferencia salva no localStorage
// (arquivo estatico rodando no navegador do proprio usuario, nao e artifact do Claude.ai - ok usar).
function toggleEsconderValores(){
  // CORRIGIDO 01/08/2026: o botao de verdade mora no index.html (FORA deste documento, que roda
  // dentro do iframe) - $('btnEsconderValores') aqui dentro NUNCA vai achar
  // esse botao, entao o icone nunca trocava. Agora esta funcao so alterna o blur (sua responsabilidade
  // real) e RETORNA o estado, pra quem chamou (index.html, via iframe.contentWindow) atualizar o
  // proprio botao visivel.
  // CORRIGIDO 09/08/2026: alterna em <html>, nao mais em <body> - consistente com a checagem
  // sincrona nova (topo de Sistema_Wallace_Lira_Completo.html), que roda antes de <body> existir.
  const ativo = document.documentElement.classList.toggle('esconder-valores');
  try { localStorage.setItem('wallace_esconder_valores', ativo ? '1' : '0'); } catch(e) {}
  return ativo;
}
// NOVO 09/08/2026: a checagem real (que evitava o "flash" de valores expostos) foi movida pro
// topo de Sistema_Wallace_Lira_Completo.html, roda antes de qualquer conteudo renderizar. Este
// bloco fica só como rede de segurança idempotente (ex: preferência mudada em outra aba entre o
// boot e este ponto) - nunca é a defesa principal contra o flash.
onDomPronto(() => {
  try {
    if(localStorage.getItem('wallace_esconder_valores') === '1'){
      document.documentElement.classList.add('esconder-valores');
    }
  } catch(e) {}
});

// ===== NOVO 03/08/2026 - botao de download JPEG por secao =====
// Pedido do usuario: um botao em cada campo/secao do painel pra baixar aquele
// bloco especifico como JPEG, sob demanda, sem precisar pedir pro Claude toda vez.
// Usa html2canvas (CDN, ver <head>) - roda 100% no navegador do usuario, sem
// depender de rede/servidor nenhum na hora do clique (so a lib precisa ter
// carregado uma vez ao abrir a pagina).
function inicializarBotoesPrintSecao(){
  document.querySelectorAll('.section-num').forEach(function(header){
    if (header.querySelector('.btn-print-secao')) return; // evita duplicar se rodar 2x
    var card = header.nextElementSibling;
    // no HTML do painel o conteudo real e sempre o IRMAO seguinte do
    // .section-num (nunca um ancestral) - mesma estrutura ja documentada
    // na passagem de turno pra ferramenta de print via Claude. Pode ser um
    // .card unico OU um container .grid-2/.grid-3 de mini-cards lado a lado
    // (achado 03/08/2026: 12 das 48 secoes usam esse segundo padrao e
    // ficavam sem botao na v1)
    if (!card) return;
    var classesCard = card.className || '';
    var elegivel = /\bcard\b/.test(classesCard) || /\bgrid-\d/.test(classesCard);
    if (!elegivel) return;
    // CORRIGIDO 14/08/2026 (achado do usuário, print real: botão de download duplicado na seção
    // "Geração diária") — quando o PRIMEIRO card da seção já tem seu próprio botão manual embutido
    // (data-print-titulo, ver inicializarBotoesPrintCardAvulso() logo abaixo — usado pra cards que
    // não são o primeiro da seção), o botão automático injetado aqui captura o MESMO card e baixa a
    // MESMA imagem — redundante sempre que a seção tiver só esse 1 card. Pula a injeção nesse caso.
    if (card.querySelector('.btn-print-secao[data-print-titulo]')) return;

    var num = header.querySelector('.n') ? header.querySelector('.n').textContent.trim() : '';
    var titulo = header.querySelector('h2') ? header.querySelector('h2').textContent.trim() : ('secao-' + num);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-print-secao';
    btn.title = 'Baixar esta seção como JPEG';
    btn.setAttribute('aria-label', 'Baixar seção ' + num + ' como JPEG');
    btn.textContent = '⬇';
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      baixarSecaoComoJPEG(card, num, titulo, btn);
    });
    header.appendChild(btn);
  });
}

// CORRIGIDO 14/08/2026 (auditoria de performance mobile: html2canvas saiu do <script defer> do
// <head> - antes baixava ~200KB pra TODO boot do painel, mesmo pra quem nunca clica em nenhum botão
// de download JPEG. Carrega a lib pela CDN só na hora do 1º clique em qualquer botão de print (deste
// arquivo inteiro, os 2 pontos de entrada são inicializarBotoesPrintSecao()/
// inicializarBotoesPrintCardAvulso(), ambos chamam baixarSecaoComoJPEG()). _promiseHtml2Canvas
// memoiza a promise pra cliques seguintes reusarem o mesmo <script> já carregado, nunca injeta 2x.
var _promiseHtml2Canvas = null;
function carregarHtml2CanvasSobDemanda(){
  if (typeof html2canvas !== 'undefined') return Promise.resolve();
  if (_promiseHtml2Canvas) return _promiseHtml2Canvas;
  _promiseHtml2Canvas = new Promise(function(resolve, reject){
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = function(){ resolve(); };
    script.onerror = function(){ _promiseHtml2Canvas = null; reject(new Error('falha ao carregar html2canvas')); };
    document.head.appendChild(script);
  });
  return _promiseHtml2Canvas;
}

function baixarSecaoComoJPEG(card, num, titulo, btnOrigem){
  if (typeof html2canvas === 'undefined'){
    if (btnOrigem){ btnOrigem.disabled = true; btnOrigem.textContent = '…'; }
    carregarHtml2CanvasSobDemanda().then(function(){
      baixarSecaoComoJPEG(card, num, titulo, btnOrigem);
    }).catch(function(err){
      console.error('Erro ao carregar html2canvas sob demanda', err);
      alert('Não consegui carregar a biblioteca de captura. Confira sua conexão e tenta de novo.');
      if (btnOrigem){ btnOrigem.disabled = false; btnOrigem.textContent = '⬇'; }
    });
    return;
  }
  if (btnOrigem){ btnOrigem.disabled = true; btnOrigem.textContent = '…'; }
  var corFundo = getComputedStyle(document.body).backgroundColor || '#0f1115';
  html2canvas(card, { backgroundColor: corFundo, scale: 2, useCORS: true }).then(function(canvas){
    var slug = titulo.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // CORRIGIDO 11/08/2026 (auditoria pedida pelo usuário depois do achado em hydrate-onda5-
    // qualidade-geracao.js: "mude o UTC do site como você falou") - .toISOString() sempre devolve
    // UTC, nunca horário de Brasília; pra nome de arquivo isso só troca a data perto da meia-noite,
    // impacto pequeno, mas é a mesma classe de bug, corrigido pelo mesmo motivo. Desloca -3h antes de
    // extrair a data, mesmo truque já usado em agoraEfetivoFrescorSolar()/hydrate-onda5-qualidade-geracao.js.
    var hoje = new Date(Date.now() - 3*3600*1000).toISOString().slice(0, 10);
    var prefixo = num ? ('secao-' + num + '-') : ''; // NOVO 07/08/2026: cards avulsos (ver abaixo) nao tem numero de secao
    var link = document.createElement('a');
    link.download = prefixo + slug + '-' + hoje + '.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
  }).catch(function(err){
    console.error('Erro ao gerar JPEG da secao', num, err);
    alert('Não consegui gerar o JPEG dessa seção. Tenta de novo.');
  }).finally(function(){
    if (btnOrigem){ btnOrigem.disabled = false; btnOrigem.textContent = '⬇'; }
  });
}
onDomPronto(inicializarBotoesPrintSecao);

// NOVO 07/08/2026 (pedido do usuário: "falta o botão de download nesse gráfico igual os outros
// têm"): o loop acima só cobre o 1º .card/.grid-* logo depois de um .section-num — cards
// secundários dentro da mesma seção (ex: "Geração por dia" dentro de "07 Energia Solar", que não é
// o primeiro card da seção) nunca recebiam botão. Para esses, o próprio HTML já vem com o botão
// inline (`class="btn-print-secao" data-print-titulo="..."`, mesmo estilo visual) — só falta ligar
// o clique, achando o `.card` mais próximo pra capturar (não a seção inteira).
function inicializarBotoesPrintCardAvulso(){
  document.querySelectorAll('.btn-print-secao[data-print-titulo]').forEach(function(btn){
    if (btn.dataset.printLigado) return;
    btn.dataset.printLigado = '1';
    var card = btn.closest('.card');
    if (!card) return;
    var titulo = btn.dataset.printTitulo;
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      baixarSecaoComoJPEG(card, '', titulo, btn);
    });
  });
}
onDomPronto(inicializarBotoesPrintCardAvulso);
