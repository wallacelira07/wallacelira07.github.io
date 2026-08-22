// MÓDULO: UI — navegação básica entre painéis (showMaster/showLR/irParaPrimeiraSecao)
// Extraído do app.js na modularização (07/08/2026). Script clássico (não ES module), carrega
// DEPOIS do app.js terminar (onload). Zero dependência de VARS/REG — só manipula classes CSS/DOM.
// Chamado exclusivamente via onclick inline no HTML (milhares de botões) ou de dentro de outras
// funções (nunca em código síncrono no meio da execução do app.js) — seguro carregar depois.
// Nenhuma fórmula, comportamento ou resultado foi alterado, só o arquivo que hospeda o código.

// CORRIGIDO 04/08/2026 (parte 42): 2o parametro (btn) removido - a versao antiga so trocava de pane
// se recebesse o elemento do botao clicado, o que obrigava todo chamador a primeiro *encontrar* esse
// botao no DOM (fragil, ver nota em CAPA_DESTINOS acima). Agora showMaster(id) troca o pane sozinho;
// se ainda existir algum elemento com data-pane="<id>" na pagina (nenhum hoje, mantido por seguranca
// caso volte a existir um seletor visual de pane), ele recebe .active - senao, no-op silencioso.
// ADICIONADO 15/08/2026 (achado da auditoria de 43 especialistas, seção 4 Performance):
// graficos-cenarios-lazy.js (2193 linhas, o MAIOR módulo do boot) tinha nome "lazy" só pela
// RENDERIZAÇÃO (initGraficosECenariosLazy/initSolarLazy só rodavam no clique da aba) — o ARQUIVO em
// si baixava sempre, incondicionalmente, pra todo usuário, junto com o resto da cadeia de boot
// (Sistema_Wallace_Lira_Completo.html, promessaModulosIndependentes), mesmo que ele nunca abrisse
// as abas Gráficos/Cenários/Solar. Mesmo padrão já validado pro html2canvas (~200KB, ver
// carregarHtml2CanvasSobDemanda() em ui-componentes-visuais.js, corrigido 14/08/2026): <script>
// injetado sob demanda, promise memoizada pra não baixar 2x. Risco verificado antes de mudar: os 5
// callers externos (atualizarGraficosNecessidade/atualizarGraficoPatrimonio/
// atualizarGraficoTotalOpDetalhe/atualizarGraficoCaixaVariavel/atualizarGraficoCaixas, chamados de
// hydrate-onda*.js) já usam `typeof X === 'function'` como guard defensivo — o próprio comentário em
// graficos-painel-principal.js já documentava que esse guard "falha silenciosamente" quando o
// usuário nunca abriu a aba, e por isso os 2 gráficos do Painel principal têm uma função irmã que
// não depende deste módulo. Ou seja: o resto do sistema já era escrito assumindo que este módulo
// pode não existir ainda — carregar de verdade sob demanda não quebra nada disso, só adia o momento
// em que ele passa a existir. O único ponto que chamava initGraficosECenariosLazy()/initSolarLazy()
// direto pelo nome (sem guard) era showMaster(), abaixo — por isso o loader entra exatamente ali.
var _promiseGraficosCenariosLazy = null;
function carregarGraficosCenariosLazySobDemanda(){
  if (typeof initGraficosECenariosLazy === 'function') return Promise.resolve();
  if (_promiseGraficosCenariosLazy) return _promiseGraficosCenariosLazy;
  _promiseGraficosCenariosLazy = new Promise(function(resolve, reject){
    var script = document.createElement('script');
    script.src = 'src/dashboard/charts/graficos-cenarios-lazy.js' + (typeof __V !== 'undefined' ? '?v=' + __V : '');
    script.onload = function(){ resolve(); };
    script.onerror = function(){ _promiseGraficosCenariosLazy = null; reject(new Error('falha ao carregar graficos-cenarios-lazy.js')); };
    document.head.appendChild(script);
  });
  return _promiseGraficosCenariosLazy;
}

// NOVO 15/08/2026 (WWI Fase 2C — aba "Wealth Intelligence" permanente, WWI_FASE2_PROPOSTA_
// ARQUITETURA.md + decisão do usuário "não depender da geração do PDF, atualização automática ao
// abrir"). Mesmo padrão de carregarGraficosCenariosLazySobDemanda() acima: script sob demanda,
// promise memoizada, só baixa/roda quando o usuário realmente abre a aba pela 1ª vez.
var _promiseWwiLazy = null;
function carregarWwiSobDemanda(){
  if (typeof initWwiDashboard === 'function') return Promise.resolve();
  if (_promiseWwiLazy) return _promiseWwiLazy;
  _promiseWwiLazy = new Promise(function(resolve, reject){
    var script = document.createElement('script');
    script.src = 'src/relatorio/hydrate-wwi.js' + (typeof __V !== 'undefined' ? '?v=' + __V : '');
    script.onload = function(){ resolve(); };
    script.onerror = function(){ _promiseWwiLazy = null; reject(new Error('falha ao carregar hydrate-wwi.js')); };
    document.head.appendChild(script);
  });
  return _promiseWwiLazy;
}

// ADICIONADO 15/08/2026 (achado de UX da auditoria de 43 especialistas: o botão/form "＋ Lançar
// transação" de app.js só existe dentro do card da Inbox Financeira — em qualquer aba muito
// abaixo do topo, o usuário tinha que rolar por várias seções pra chegar nele). Reaproveita o
// mesmo form/botão criados por app.js (nenhum form novo) — só garante visibilidade + scroll até
// ele, chamável de qualquer lugar via o atalho fixo na barra .master-tabs.
function abrirFormLancarTxRapido(){
  const btn = document.getElementById('btnLancarTx');
  const form = document.getElementById('formLancarTx');
  if(!btn || !form){
    alert('O formulário de lançamento ainda está carregando — tente de novo em alguns segundos.');
    return;
  }
  // CORRIGIDO 15/08/2026 (achado do usuário: "botão lançar só funciona na aba painel") — o form só
  // existe dentro do pane #painel; fora dessa aba ele ficava visível (style.display='block') mas
  // escondido atrás de um .master-pane inativo (display:none), então o clique parecia "não fazer
  // nada". Troca pra aba Painel primeiro (mesma showMaster() usada pelas outras abas) — só então o
  // form fica realmente visível, em qualquer aba que o usuário estava.
  if(typeof showMaster === 'function') showMaster('painel');
  form.style.display = 'block';
  form.scrollIntoView({behavior:'smooth', block:'center'});
}

function showMaster(id){
  document.querySelectorAll('.master-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('[data-pane]').forEach(t=>t.classList.remove('active'));
  $(id).classList.add('active');
  document.querySelectorAll(`[data-pane="${id}"]`).forEach(t=>t.classList.add('active'));
  // NOVO 10/08/2026 (pedido do usuário: "ao dar F5 tem que recarregar na página que eu estou, não
  // sempre no dashboard") - grava a aba atual pra sobreviver a um F5; lido no boot (ver bloco de
  // restauração em Sistema_Wallace_Lira_Completo.html, logo após todos os módulos carregarem).
  try { sessionStorage.setItem('wallaceAbaAtual', id); } catch(e){}
  // V300 (Etapa 1.1): so cria os graficos de Graficos/Cenarios quando o usuario realmente abre uma
  // dessas 2 abas pela 1a vez (initGraficosECenariosLazy tem flag interna, seguro chamar sempre aqui).
  // ADICIONADO 15/08/2026: initGraficosECenariosLazy só existe depois que o <script> do módulo
  // carregar — carregarGraficosCenariosLazySobDemanda() baixa sob demanda (memoizado) e só então
  // chama a função, mesmo padrão de carregarHtml2CanvasSobDemanda() (ui-componentes-visuais.js).
  if(id === 'graficos' || id === 'cenarios'){
    carregarGraficosCenariosLazySobDemanda().then(function(){
      initGraficosECenariosLazy();
    }).catch(function(err){
      console.error('Erro ao carregar módulo de Gráficos/Cenários sob demanda', err);
    });
  }
  // NOVO 08/08/2026 (aba própria "☀️ Energia Solar"): mesmo padrão da linha acima, flag própria
  // (initSolarLazy(), graficos-cenarios-lazy.js) — Solar não carrega mais junto com Gráficos/Cenários.
  // ADICIONADO 15/08/2026: mesmo loader sob demanda do bloco acima (initSolarLazy vive no mesmo
  // arquivo que initGraficosECenariosLazy, a promise memoizada cobre as 2 chamadas sem baixar 2x).
  if(id === 'solar'){
    carregarGraficosCenariosLazySobDemanda().then(function(){
      initSolarLazy();
    }).catch(function(err){
      console.error('Erro ao carregar módulo de Gráficos/Cenários (Solar) sob demanda', err);
    });
  }
  // NOVO 15/08/2026 (WWI Fase 2C): "atualização automática ao abrir" — chama initWwiDashboard() TODA
  // vez que a aba abre (não só na 1ª), pra sempre refletir o snapshot mais recente; o cache de 90s da
  // WallaceFinanceService já evita rede redundante se o usuário reabrir a aba rapidamente.
  if(id === 'wwi'){
    carregarWwiSobDemanda().then(function(){
      initWwiDashboard();
    }).catch(function(err){
      console.error('Erro ao carregar módulo WWI sob demanda', err);
    });
  }
  // NOVO 22/08/2026 (correção de performance: o Radar de Ativos da aba Opções disparava 10 fetches
  // paralelos ao Supabase incondicionalmente no boot — ver comentário em app.js). hydrate-roc.js já
  // faz parte do bundle base (carrega antes de app.js, sem "sob demanda" nenhum), só o DISPARO da
  // função vira lazy — roda de novo toda vez que a aba abre (mesmo padrão do WWI acima), o cache de
  // 90s da WallaceFinanceService evita rede redundante se o usuário reabrir rápido.
  if(id === 'opcoes' && typeof aplicarRadarAtivosOpcoes === 'function'){
    aplicarRadarAtivosOpcoes();
  }
  // NOVO 22/08/2026 (painel "Pesquisa de mercado" — mesmo motivo de ser lazy que o Radar acima:
  // evitar competir com a cadeia crítica de boot). Ver aplicarPesquisaMercado()/
  // hydrate-pesquisa-mercado.js.
  if(id === 'opcoes' && typeof aplicarPesquisaMercado === 'function'){
    aplicarPesquisaMercado();
  }
  // CORRIGIDO 18/07/2026 (V85, bug real reportado pelo usuario: "gráfico do Visa não carregou"):
  // os graficos das paginas Graficos/Cenarios/Balanco sao criados com new Chart() enquanto a pagina
  // ainda esta escondida (display:none) no carregamento inicial - o Chart.js nao consegue medir o
  // canvas com largura/altura zero e o grafico fica quebrado/em branco, mesmo depois da aba aparecer.
  // Forcar resize() em todas as instancias existentes toda vez que uma pagina fica visivel resolve -
  // Chart.js mantem um registro global (Chart.instances) que nao precisa de nenhum controle manual.
  if(typeof Chart !== 'undefined' && Chart.instances){
    requestAnimationFrame(()=>{
      Object.values(Chart.instances).forEach(c=>{ try{ c.resize(); }catch(e){} });
    });
  }
  // V300 (Etapa 2): evento aditivo, nao substitui nada do que ja acontece acima nesta funcao.
  WallaceBus.emit('abaAlterada', {id});
}

// NOVO 04/08/2026 (parte 44, pedido do usuario - "clico nas abas painel/grafico e vai pro topo da
// pagina, nao pro primeiro item da aba"): causa real era o .master-tabs (barra de 4 botoes fixos)
// ter onclick inline proprio com window.scrollTo({top:0}) direto, sem passar por irParaCapaDestino -
// entao o fix da parte 43 (la em cima, so pros cards da Capa) nunca era executado por esses 4 botoes.
// Esta funcao e o que os 4 botoes agora chamam: mesma logica de "achar a 1a .section-num do pane e
// scrollIntoView nela" que irParaCapaDestino usa quando nao tem tituloSecao especifico.
// CORRIGIDO 11/08/2026 (pedido do usuário: "quando eu clicar sobre a aba painel deveria vir para
// cima desse menu e não sobre ciclo financeiro") - a versao anterior pulava pro 1o .section-num
// do pane, escondendo qualquer conteudo ANTES dele (ex: o kpi-strip com Patrimonio/Total
// Operacional/Caixa Variavel/Modo Operacional, que vem antes de "01 Ciclo Financeiro" no Painel).
// Agora rola pro topo do PRÓPRIO pane (respeitando o offset da barra de abas fixa), nao mais pro
// primeiro titulo de secao - assim nenhum conteudo de introducao fica escondido atras da barra.
function irParaPrimeiraSecao(id){
  showMaster(id);
  const pane = document.getElementById(id);
  if(!pane){ window.scrollTo({top:0, behavior:'smooth'}); return; }
  setTimeout(()=>{
    const tabs = document.querySelector('.master-tabs');
    const offset = (tabs ? tabs.offsetHeight : 0) + 20;
    const y = pane.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({top: Math.max(0, y), behavior:'smooth'});
  }, 30);
}

// CORRIGIDO 14/08/2026 (pedido do usuário: "no início e quando eu clicar fora dos LRs não aparece
// nenhuma lista aberta, os livros fecham, aí quando eu clicar abre a lista"). Duas mudanças: 1)
// clicar na aba já aberta agora FECHA em vez de continuar ativa (toggle); 2) clicar em qualquer
// lugar fora da barra de abas/tabela de um Livro Razão fecha a lista aberta, ver listener no fim do
// arquivo. Nenhum id de pane/aba mudou, só o comportamento de abrir/fechar.
function showLR(id, btn){
  const jaEstavaAberto = btn.classList.contains('active');
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  if(jaEstavaAberto) return; // clicou na mesma aba que já estava aberta - só fecha, não reabre
  $(id).classList.add('active');
  btn.classList.add('active');
  // NOVO 22/08/2026 (achado do usuário testando a busca global: clicar num resultado de Livro Razão
  // ativava a aba certa por baixo — tabela certa, classe .active certa — mas a faixa de abas (.tabs,
  // ~25 pills, só ~1 visível por vez, rolagem horizontal) nunca rolava sozinha até a aba recém-ativada.
  // Resultado: a pill visível continuava sendo a primeira da lista (LRW, offsetLeft 0), enquanto a
  // tabela abaixo já mostrava os dados do livro certo (ex: LRB) - usuário via "aparece LRW e mostra as
  // transações do LRB", parecia os dois desincronizados mesmo sem ser. showLR() nunca tinha lógica de
  // scroll, só troca de classe - faltava sempre, não é regressão de nada. `inline:'nearest'` rola só o
  // eixo horizontal da faixa de abas; `block:'nearest'` evita mexer no scroll vertical da página, que
  // já é resolvido à parte por quem chama showLR() (ex: scrollParaSecaoComOffset da busca global).
  btn.scrollIntoView({inline: 'nearest', block: 'nearest'});
}

// NOVO 21/08/2026 (pedido do usuário: abas próprias pra "Carteira de opções" — Ativas/Em Risco/
// Vencidas/Exercidas). Classes .opcoes-tab/.opcoes-pane DISTINTAS de .tab/.pane de propósito — ver
// comentário no CSS (styles.css). Sempre troca (nunca fecha tudo ao clicar de novo, diferente de
// showLR()) — não faz sentido a seção inteira ficar sem nenhuma aba ativa aqui.
function showOpcoesTab(id, btn){
  document.querySelectorAll('.opcoes-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.opcoes-tab').forEach(t=>t.classList.remove('active'));
  $(id).classList.add('active');
  btn.classList.add('active');
}

// REVERTIDO 21/08/2026 (correção de rumo — ver comentário no topo do master-pane #opcoes no HTML):
// a 1ª tentativa de "aba dedicada" foi um modo tela cheia via position:fixed (abrirCockpitOpcoes()/
// fecharCockpitOpcoes()), porque eu achei que o site não tinha sistema de páginas de topo. Errado —
// existe .master-tabs/.master-pane + showMaster()/irParaPrimeiraSecao() (função já definida logo
// abaixo), o mesmo mecanismo usado por Painel/Gráficos/Solar/etc. A seção de opções virou seu
// próprio master-pane de verdade — as 2 funções deste hack foram removidas, sem substituto
// necessário (irParaPrimeiraSecao('opcoes') já faz o trabalho).

// NOVO 14/08/2026 (pedido do usuário: "coloque animação ao clicar nos cards, informações relevantes
// e movimento no click" — diagrama "Fluxo de energia" na aba Solar). Toggle genérico: abre/fecha o
// painel de detalhe (`${idCard}Detalhe`) logo abaixo do card clicado, mesmo padrão accordion do
// showLR() acima (clicar de novo fecha). Puramente de UI — o TEXTO do detalhe já foi escrito antes
// pela função que calcula os valores reais (graficos-cenarios-lazy.js, roda no boot/toda atualização
// da aba Solar); este toggle só mostra/esconde o que já está lá, nunca calcula nada.
function fluxoEnergiaToggle(idCard){
  const card = document.getElementById(idCard);
  const detalhe = document.getElementById(idCard+'Detalhe');
  if(!card || !detalhe) return;
  const abrir = !card.classList.contains('aberto');
  card.classList.toggle('aberto', abrir);
  detalhe.classList.toggle('aberto', abrir);
  card.setAttribute('aria-expanded', abrir ? 'true' : 'false');
}

// ADICIONADO 15/08/2026 (achado de auditoria de acessibilidade: os 7 cards do Fluxo de energia têm
// role="button"+tabindex="0" — focáveis via Tab — mas só escutam "click", não Enter/Espaço. Um
// <div role="button"> não ganha ativação por teclado de graça do navegador como um <button> real
// teria. Listener delegado no document, único, cobre os 7 cards de hoje e qualquer [role="button"]
// futuro sem precisar adicionar handler individual em cada um — mesmo espírito do listener de clique
// fora do Livro Razão logo abaixo.
document.addEventListener('keydown', function(ev){
  if(ev.key !== 'Enter' && ev.key !== ' ') return;
  const alvo = ev.target.closest && ev.target.closest('[role="button"]');
  if(!alvo) return;
  ev.preventDefault();
  alvo.click();
});

// Clicar fora do bloco "Livros razão" (barra de abas #lrTabs + a tabela do livro aberto) fecha
// qualquer lista aberta, mesmo padrão de UX de um dropdown/accordion. `#lrTabs` e cada `.pane` são
// filhos diretos do mesmo `.card` (ver Sistema_Wallace_Lira_Completo.html, seção 07) - usa esse
// `.card` como referência de "dentro"; clique em qualquer outro lugar da página fecha.
document.addEventListener('click', function(ev){
  const lrTabs = document.getElementById('lrTabs');
  if(!lrTabs) return;
  const cardLR = lrTabs.closest('.card');
  if(cardLR && cardLR.contains(ev.target)) return; // clique dentro do bloco (aba ou conteúdo do livro) - não fecha
  const algumAberto = cardLR ? cardLR.querySelector('.tab.active, .pane.active') : null;
  if(!algumAberto) return; // já estava tudo fechado, nada a fazer
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
});
