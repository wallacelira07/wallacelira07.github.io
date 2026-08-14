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
  if(id === 'graficos' || id === 'cenarios'){
    initGraficosECenariosLazy();
  }
  // NOVO 08/08/2026 (aba própria "☀️ Energia Solar"): mesmo padrão da linha acima, flag própria
  // (initSolarLazy(), graficos-cenarios-lazy.js) — Solar não carrega mais junto com Gráficos/Cenários.
  if(id === 'solar'){
    initSolarLazy();
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
}

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
