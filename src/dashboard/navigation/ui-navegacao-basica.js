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
  // V300 (Etapa 1.1): so cria os graficos de Graficos/Cenarios quando o usuario realmente abre uma
  // dessas 2 abas pela 1a vez (initGraficosECenariosLazy tem flag interna, seguro chamar sempre aqui).
  if(id === 'graficos' || id === 'cenarios'){
    initGraficosECenariosLazy();
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
function irParaPrimeiraSecao(id){
  showMaster(id);
  const pane = document.getElementById(id);
  const alvo = pane && pane.querySelector('.section-num');
  if(!alvo){ window.scrollTo({top:0, behavior:'smooth'}); return; }
  setTimeout(()=>{ scrollParaSecaoComOffset(alvo); }, 30);
}

function showLR(id, btn){
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  $(id).classList.add('active');
  btn.classList.add('active');
}
