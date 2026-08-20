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
    var card = header.nextElementSibling;
    if (header.querySelector('.btn-print-secao') || (card && card.querySelector('.btn-print-secao'))) return; // evita duplicar se rodar 2x (2 lugares possíveis — ver bloco #lrTabs abaixo, que move o botão pra dentro do card)
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
      // NOVO 19/08/2026 (pedido do usuário: "quero que identifique a caixa" — hoje todo download da
      // seção 07 "Livros Razão" saía com o MESMO nome de arquivo pra qualquer aba selecionada,
      // "secao-07-livros-razao-<data>", porque `titulo` acima vem só do <h2> da seção, calculado 1x
      // na inicialização — nunca sabia qual das 25 abas estava ativa no momento do clique. Lido aqui
      // dentro do handler (não lá em cima) porque a aba ativa muda a cada clique do usuário nos tabs,
      // então precisa ser recalculado a cada download, não fixado na criação do botão. Funciona pra
      // qualquer seção com abas (`.tab.active` dentro do card) — seções sem abas (a maioria) não têm
      // esse elemento, cai no `titulo` original sem mudança nenhuma.
      var tituloFinal = titulo;
      var abaAtivaEl = card.querySelector('.tab.active');
      if (abaAtivaEl) {
        var nomeAba = abaAtivaEl.textContent.trim().replace(/\s*\(\d+\)\s*$/, ''); // tira o "(N)" de contagem, não faz parte do nome
        tituloFinal = titulo + ' - ' + nomeAba;
      }
      baixarSecaoComoJPEG(card, num, tituloFinal, btn);
    });
    // NOVO 20/08/2026 (pedido do usuário, retomado agora que a causa real do JPEG quebrado foi achada
    // e corrigida em baixarSecaoComoJPEG() — remove/restaura os panes escondidos, não depende mais de
    // o botão estar fora do .card): botão da seção "07 Livros Razão" ancorado logo abaixo da grade de
    // abas (#lrTabs), perto de onde o conteúdo real começa — mais alcançável nessa seção, a única
    // grande o suficiente pra justificar. Testado numa réplica de 25 abas/tabelas de 8 linhas antes de
    // aplicar aqui: o botão aparece na imagem capturada (efeito colateral cosmético aceitável, pequeno
    // ícone "⬇"/"…" no canto), mas a tabela renderiza certo — o que quebrava antes era o excesso de
    // panes escondidos, não a posição do botão em si. Demais seções continuam com o botão no
    // cabeçalho, sem mudança.
    var lrTabsEl = card.querySelector('#lrTabs');
    if (lrTabsEl) {
      btn.classList.add('btn-print-secao--ancorado-abas');
      lrTabsEl.insertAdjacentElement('afterend', btn);
    } else {
      header.appendChild(btn);
    }
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
  // CORRIGIDO 20/08/2026, tentativa 2 (a 1ª, via `onclone`, piorou em produção — ver histórico em
  // ESTADO_ATUAL.md). html2canvas 1.4.1 falha em renderizar o conteúdo de um elemento com MUITOS
  // irmãos `display:none` no mesmo container (a seção "Livros Razão" tem até 24 `.pane` escondidos
  // ao lado do único ativo) — confirmado numa página de teste isolada. `onclone` (mexe só na CÓPIA
  // usada pro render) parecia mais seguro, mas se comportou diferente do teste isolado numa estrutura
  // real bem maior — provável interação com o jeito que o html2canvas mede altura via iframe interno.
  // Esta versão remove os panes escondidos da própria página real (não da cópia) ANTES da captura, e
  // devolve cada um pro lugar EXATO de onde saiu (posição salva via `nextSibling`) assim que a captura
  // termina — mesma técnica que funcionou no teste isolado desde o início. Imperceptível ao usuário:
  // são elementos que já estavam com `display:none` (invisíveis), só saem/voltam da árvore por uma
  // fração de segundo: `.pane:not(.active)` não existe fora da seção de Livros Razão, zero efeito nas
  // outras ~47 seções do site.
  var panesEscondidosRemovidos = [];
  card.querySelectorAll('.pane:not(.active)').forEach(function(p){
    panesEscondidosRemovidos.push({ el: p, proximoIrmao: p.nextSibling });
    p.remove();
  });
  function restaurarPanesEscondidos(){
    // ACHADO E CORRIGIDO ANTES DE PUBLICAR (testado isolado com 25 panes, escala real): restaurar na
    // MESMA ordem em que foi removido lança `NotFoundError` — o `proximoIrmao` salvo de um pane pode
    // ser OUTRO pane também removido, que ainda não voltou pro DOM na hora do `insertBefore`. Ordem
    // INVERSA resolve: o último pane removido tem a referência mais estável (nunca outro removido),
    // e cada restauração seguinte já encontra sua referência de volta no lugar. Confirmado sem erro e
    // com a ordem final idêntica à original antes de aplicar aqui.
    for (var i = panesEscondidosRemovidos.length - 1; i >= 0; i--) {
      var item = panesEscondidosRemovidos[i];
      card.insertBefore(item.el, item.proximoIrmao); // proximoIrmao null = insertBefore insere no final, comportamento correto
    }
  }
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
    restaurarPanesEscondidos(); // devolve os panes escondidos ANTES de qualquer outra coisa, mesmo se a captura falhou
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
