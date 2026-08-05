// ===== Utilitario global unico (auditoria 15/07/2026: havia 4 definicoes duplicadas de fmt(),
// uma por IIFE - consolidado aqui, todas as IIFEs abaixo usam esta via closure) =====
// V170 (26/07/2026): CORRIGIDO bug critico - o app.js agora e carregado via injecao dinamica
// (document.createElement('script'), depois de um fetch() assincrono ao Supabase, ver
// Sistema_Wallace_Lira_Completo.html). Isso significa que quando este arquivo executa, o evento
// DOMContentLoaded JA DISPAROU (MDN: "a script that is dynamically injected... by the time it
// executes, DOMContentLoaded has already fired"). Todo document.addEventListener('DOMContentLoaded', fn)
// deste arquivo NUNCA rodava - por isso hydrate(), popularSeletorCiclo(), renderParcelamentos() etc
// ficavam vazios (so os graficos, que rodam direto sem esperar evento, apareciam). onDomPronto(fn)
// substitui addEventListener: se o DOM ja estiver pronto (readyState != 'loading'), roda a funcao
// IMEDIATAMENTE; so registra o listener se realmente ainda estiver carregando.
function onDomPronto(fn){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

// V300 (Etapa 1.2): so cria o grafico quando o canvas entra na viewport (ou 200px antes, via
// rootMargin, pra nao dar flash em branco no scroll rapido). Usado nos graficos mais pesados/mais
// abaixo na pagina (secao solar, caixas/alivio) - reduz trabalho de canvas mesmo depois que a aba
// ja esta aberta. Nao muda NENHUM dado/calculo, so adia o instante em que o Chart.js pinta o canvas.
// Fallback: se o navegador nao suporta IntersectionObserver, cria na hora (comportamento antigo).
function observeAndRenderChart(canvasEl, factory){
  if(!canvasEl) return;
  if(!('IntersectionObserver' in window)){ factory(); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        factory();
        io.disconnect();
      }
    });
  }, {rootMargin:'200px'});
  io.observe(canvasEl);
}

// V300 (Etapa 1.3): utilitario generico, pronto pra Busca Global (Etapa 6, ainda nao implementada)
// e qualquer listener futuro de resize/scroll/input. Sem uso ainda hoje - hoje nao existe nenhum
// listener de resize/scroll/busca no sistema (o resize dos graficos e tratado internamente pelo
// proprio Chart.js via responsive:true, ja existente); criar um listener novo so pra ter debounce
// seria codigo morto. Fica aqui documentado e pronto pro dia que a Busca Global for implementada.
function debounce(fn, waitMs){
  let timer = null;
  return function(...args){
    clearTimeout(timer);
    timer = setTimeout(()=>fn.apply(this, args), waitMs);
  };
}

function fmt(v){return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}

// V300 (Etapa 2 - Event Bus): infraestrutura pura, aditiva - NAO substitui nenhuma chamada direta
// existente (hydrate(), atualizarGraficosPorCiclo(), etc continuam sendo chamadas do jeito que
// sempre foram, na mesma ordem - trocar isso por um modelo 100% orientado a evento seria uma
// reescrita de fluxo, risco alto sem navegador real pra validar visualmente). O que existe hoje:
// os pontos naturais do sistema (troca de aba, troca de ciclo, atualizacao de grafico por ciclo)
// TAMBEM emitem um evento, pra qualquer modulo futuro poder escutar sem precisar tocar na funcao
// original. emit()/on()/off() simples, sem dependencia externa.
// Eventos minimos do brief e onde cada um e emitido hoje:
//   abaAlterada      -> showMaster() (toda troca de aba master: Painel/Graficos/Cenarios/Balanco)
//   cicloAlterado    -> trocarCiclo() (toda troca no seletor de ciclo)
//   saldoAtualizado  -> trocarCiclo(), apos recalcularAgregadosDerivados()
//   graficoAtualizado-> atualizarGraficosPorCiclo() e initGraficosECenariosLazy()
//   transacaoCriada  -> RESERVADO, sem emissor ainda: o site e estatico (dados vem do Supabase/
//                       app.js numa proxima entrega, nao ha formulario de criar TX ao vivo no
//                       navegador) - nao existe um ponto real pra emitir isso hoje. Documentado
//                       aqui pra quando/se essa funcionalidade existir, sem inventar uso falso agora.
const WallaceBus = (function(){
  const listeners = {};
  return {
    emit(evento, payload){
      (listeners[evento] || []).forEach(fn => { try{ fn(payload); }catch(e){ console.error('WallaceBus listener falhou em "'+evento+'":', e); } });
    },
    on(evento, fn){
      (listeners[evento] = listeners[evento] || []).push(fn);
      return () => this.off(evento, fn); // conveniencia: on() retorna a propria funcao de unsubscribe
    },
    off(evento, fn){
      if(!listeners[evento]) return;
      listeners[evento] = listeners[evento].filter(f => f !== fn);
    }
  };
})();

// V300 (Etapa 12 - Observabilidade): infraestrutura aditiva, mesmo critério de sempre - só o que é real
// e testável sem navegador (nao existe backend de logging/telemetria neste sistema estático, entao nao
// foi inventado envio pra servico externo). 2 partes:
// 1) Captura de erros nao tratados (window.onerror + unhandledrejection) - antes disso, um erro de JS em
//    producao nao deixava nenhum registro central, so sumia no console de quem estivesse olhando na hora.
//    Nao suprime nem re-lanca o erro, so registra e emite via WallaceBus (erroCapturado) pra quem quiser ouvir.
// 2) Metrica de tempo de carregamento (window 'load'), unico numero real e comparavel sem infra externa.
// Acesso manual: window.WallaceObs.listarErros() no console do navegador. Nenhuma UI nova criada -
// mesma decisao de escopo da Etapa 10 (nao inventar card/badge sem criterio definido pelo usuario).
const WallaceObs = (function(){
  const erros = [];
  window.addEventListener('error', function(e){
    const registro = {tipo:'erro', mensagem:e.message, arquivo:e.filename, linha:e.lineno, hora:new Date().toISOString()};
    erros.push(registro);
    console.error('[Wallace] Erro capturado:', registro);
    WallaceBus.emit('erroCapturado', registro);
  });
  window.addEventListener('unhandledrejection', function(e){
    const motivo = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    const registro = {tipo:'promise', mensagem:motivo, hora:new Date().toISOString()};
    erros.push(registro);
    console.error('[Wallace] Promise rejeitada sem tratamento:', registro);
    WallaceBus.emit('erroCapturado', registro);
  });
  window.addEventListener('load', function(){
    const tempoMs = Math.round(performance.now());
    console.info('[Wallace] Carregado em ' + tempoMs + 'ms');
    WallaceBus.emit('performanceMedida', {tempoMs, hora:new Date().toISOString()});
  });
  return { listarErros: () => erros.slice() };
})();
window.WallaceObs = WallaceObs;

// V300 (Etapa 4 - Componentização): auditoria (03/08/2026) achou só 1 ponto real no código onde um
// badge muda de classe dinamicamente via JS (rocStatusBadge, className setado na mão) - os outros
// ~112 ".badge"/".card" do painel são HTML estático (texto/valor muda via t(), classe nunca muda).
// Componentizar esse HTML estático em massa (createCard genérico pra todas as seções) exigiria reescrever
// e validar visualmente ~1245 linhas de HTML sem navegador real aqui - risco alto, não feito. O que é
// real e testável agora: extrair o padrão "className = 'badge X' + textContent" pra uma função única,
// reutilizável nos pontos que hoje (ou no futuro) precisem de badge com cor dinâmica.
function setBadge(el, classe, texto){
  if(!el) return;
  el.className = classe ? ('badge ' + classe) : 'badge';
  el.textContent = texto;
}

// 04/08/2026 (parte 41) - Capa como Dashboard: cards de navegacao no cabecalho (.cover), pedido
// explicito do usuario ("usar o cabecalho pra montar um dashboard, do dashboard acessa as abas e
// volta"). Reaproveita o mesmo padrao de navegacao ja usado na Busca Global (Etapa 6) - showMaster()
// pra trocar de aba + scrollIntoView pra pousar na secao certa - so que com destinos curados em vez
// de busca livre. tituloSecao:null = so troca de aba e fica no topo dela (usado pros paneis
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
  {grupo:'Metas & análises', icone:'☀️', titulo:'Energia Solar', sub:'geração e economia', paneId:'graficos', tituloSecao:'Energia Solar'},
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
  'PV_TRANSACOES','LRPV_TRANSACOES','BOLETOS_TRANSACOES','HISTORICO_ERP_TODOS_CICLOS'];
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

function renderResultadoTransacao(t, livro){
  const div = document.createElement('div');
  div.className = 'busca-resultado-item busca-resultado-transacao';
  const nomeLivroCurto = livro.replace('_TRANSACOES','').replace('HISTORICO_ERP_TODOS_CICLOS','Histórico');
  div.innerHTML = `<strong>${t.tx||'—'}</strong> · ${t.nome||t.descricao||'(sem descrição)'} · <strong>${fmt(t.valor)}</strong>`
    + `<span class="busca-resultado-sub"> ${t.data||''} — ${nomeLivroCurto}${t.obs ? ' — '+t.obs : ''}</span>`;
  div.onclick = () => { /* so exibe o detalhe - a maioria dos livros nao tem linha visivel na tela pra navegar ate */ };
  return div;
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

// ===== Cache global de seletores DOM (PRIORIDADE 2, item 1 do plano de otimização) =====
// document.getElementById() direto tem custo de busca no DOM a cada chamada; $() guarda a referência
// na primeira vez que encontra o elemento. ||= (em vez de simples atribuição) é proposital: se o
// elemento ainda não existir no momento da 1a chamada (ex: botão de ciclo criado dinamicamente depois
// do carregamento inicial), o cache fica "vazio" (undefined/null, falsy) e a próxima chamada tenta de
// novo - nunca fica preso buscando um elemento que não existia ainda. Não substitui elementos cujo nó
// original é destruído/recriado por engano - conferido: nenhum innerHTML deste arquivo recria elementos
// com id (auditado 03/08/2026), todo id existente no HTML permanece no mesmo nó pra sempre.
const DOM = {};
function $(id){
  return DOM[id] ||= document.getElementById(id);
}

// V192 (27/07/2026): calcularSaldoCaixa() - nucleo da arquitetura "editavel/auditavel" pedida pelo
// usuario apos bug real (Caixa Saude Familia travada em R$135,00 por 3h depois de um gasto de R$135,06
// nunca descontado do registrador solto). Regra: saldoInicial (aportado 1x por ciclo) + soma das
// transacoes do array (Entrada soma, Saida/Gasto/Emprestimo subtrai) = saldo sempre correto, nunca mais
// editado a mao. Cada caixa migrada usa isto em vez de VARS.caixaXxx fixo.
function calcularSaldoCaixa(saldoInicial, transacoes){
  const delta = transacoes.reduce((soma, t) => {
    const tipo = (t.tipo || 'Saída').toLowerCase();
    const ehEntrada = tipo.includes('entrada');
    return soma + (ehEntrada ? t.valor : -t.valor);
  }, 0);
  return Math.round((saldoInicial + delta) * 100) / 100;
}
// CORRIGIDO 19/07/2026: varios graficos tinham min/max fixos no eixo Y, calculados a mao numa sessao
// anterior para o range de dados de entao. Como os dados crescem (ex: comprometido subindo), o teto
// fixo passou a cortar/estourar a barra ou linha. yRange() calcula um min/max automatico com folga,
// arredondado, a partir dos dados reais de cada grafico - substitui todo min/max hardcoded.
function yRange(data, padPct=0.12){
  const vals = data.filter(v=>typeof v==='number' && !isNaN(v));
  if(!vals.length) return {min:undefined, max:undefined};
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const range = (mx-mn) || Math.abs(mx) || 1;
  const pad = range*padPct;
  const step = mx >= 5000 ? 100 : mx >= 500 ? 10 : 1;
  return { min: Math.max(0, Math.floor((mn-pad)/step)*step), max: Math.ceil((mx+pad)/step)*step };
}
// Memoização (item 8 do plano de otimização) - função pura (mesma entrada = mesma saída), cache por
// chave textual dos argumentos. Sempre retorna uma cópia nova do objeto ({...cached}), nunca a mesma
// referência guardada no cache, pra nenhum código que eventualmente mexa no retorno estragar o cache.
(function(){
  const _orig = yRange, _cache = new Map();
  yRange = function(data, padPct=0.12){
    const key = JSON.stringify(data)+'|'+padPct;
    if(_cache.has(key)) return {..._cache.get(key)};
    const r = _orig(data, padPct);
    _cache.set(key, r);
    return {...r};
  };
})();

// ===== Janela rolante de 12 meses (padrao unico definido 17/07/2026, V50 item 4) =====
// Pedido do usuario: "crie o padrao de mostrar essas projecoes com 12 meses... todo mes que mudar as
// 00hs do primeiro dia do mes, empurre 1 mes a frente". gerarMeses(n) sempre comeca no MES CALENDARIO
// atual (baseado na data real do dispositivo/servidor no momento em que a pagina carrega) e gera os
// proximos n meses sequenciais - nunca hardcoded, nunca pula mes. Toda virada de mes (00h do dia 1),
// a proxima carga da pagina automaticamente desloca a janela inteira 1 mes a frente, sem intervencao.
function gerarMeses(n){
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const agora = new Date();
  const labels = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() + i, 1);
    labels.push(nomes[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2));
  }
  return labels;
}
// Memoização (item 8 do plano) - chamada com o mesmo n por vários gráficos na mesma carga de página.
(function(){
  const _orig = gerarMeses, _cache = new Map();
  gerarMeses = function(n){
    if(_cache.has(n)) return _cache.get(n).slice();
    const r = _orig(n);
    _cache.set(n, r);
    return r.slice();
  };
})();

// V163 (pedido do usuario: "acho melhor remover automaticamente o mes pelo ciclo e nao na virada do
// mes ou de um jeito de nao causar essas mudancas" - referindo-se ao grafico Necessidade Liquida caindo
// de valor quando o mes calendario virava mas o ciclo financeiro (25→24) nao tinha virado ainda, ou
// vice-versa - descompasso causava valores "pulando" sem sentido). gerarMesesCiclo(n) gera rotulos com
// base no CICLO financeiro atual (dia 25 vira o mes), nao no mes calendario (dia 1). Rotulo do ciclo
// que comeca dia 25/07 e fecha 24/08 e "Ago/26" (mes que a fatura/pagamento realmente vence), consistente
// com o resto do sistema (Politicas secao 9: "ciclo mensal, dia 25 a 24 do mes seguinte").
function ciclosDesdeAncoraCiclo(){
  const hoje = new Date();
  const diaCicloAtual = hoje.getDate() >= 25
    ? new Date(hoje.getFullYear(), hoje.getMonth()+1, 1) // dia 25+ ja esta no ciclo do mes seguinte
    : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const [ay, am] = ANCHOR_MONTH_CICLO.split('-').map(Number);
  return (diaCicloAtual.getFullYear()-ay)*12 + (diaCicloAtual.getMonth()+1-am);
}
function gerarMesesCiclo(n){
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const hoje = new Date();
  const baseMonth = hoje.getDate() >= 25 ? hoje.getMonth()+1 : hoje.getMonth();
  const labels = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoje.getFullYear(), baseMonth + i, 1);
    labels.push(nomes[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2));
  }
  return labels;
}
// Memoização (item 8 do plano) - mesmo padrão de gerarMeses.
(function(){
  const _orig = gerarMesesCiclo, _cache = new Map();
  gerarMesesCiclo = function(n){
    if(_cache.has(n)) return _cache.get(n).slice();
    const r = _orig(n);
    _cache.set(n, r);
    return r.slice();
  };
})();
function alignSeriesCiclo(series){
  const offset = ciclosDesdeAncoraCiclo();
  if (offset <= 0) return series.slice();
  const shifted = series.slice(offset);
  while (shifted.length < series.length) shifted.push(series[series.length-1]);
  return shifted;
}
// Memoização (item 8 do plano) - chave = conteúdo da série + offset do ciclo no momento (offset não
// muda durante a sessão, mas incluído na chave por segurança, sem custo real).
(function(){
  const _orig = alignSeriesCiclo, _cache = new Map();
  alignSeriesCiclo = function(series){
    const key = ciclosDesdeAncoraCiclo()+'|'+JSON.stringify(series);
    if(_cache.has(key)) return _cache.get(key).slice();
    const r = _orig(series);
    _cache.set(key, r);
    return r.slice();
  };
})();

// ===== CORRECAO 18/07/2026 (V72, bug real apontado em auditoria externa): as series de projecao
// (evolucao.totalOperacional/necessidadeLiquida, superavitNormal, deficitZero, alivioData) sao arrays
// fixos indexados 0-11 que assumem "indice 0 = mes em que este arquivo foi gerado". gerarMeses(12)
// sempre comeca no MES CALENDARIO REAL atual - se a pagina for aberta num mes seguinte sem os arrays
// serem manualmente re-ancorados, os rotulos avancam mas os arrays nao, deslocando todo mundo (ex: o
// valor de Julho aparece rotulado como Agosto). ANCHOR_MONTH abaixo declara explicitamente a que mes
// o indice 0 de todos esses arrays corresponde HOJE. alignSeries()/alignEventos() calculam quantos
// meses ja se passaram desde essa ancora e deslocam os dados automaticamente antes de desenhar - assim,
// mesmo que ninguem atualize os arrays por 1-2 meses, o grafico nunca mostra o numero errado no mes
// errado (so fica "atrasado" - repete o ultimo valor conhecido, nunca inventa um novo).
const ANCHOR_MONTH = '2026-07'; // atualizar para o mes corrente sempre que os arrays abaixo forem recalculados manualmente
const ANCHOR_MONTH_CICLO = '2026-07'; // V163: mes do CICLO (nao calendario) em que os arrays foram recalculados - hoje (25/07/2026) ja esta no ciclo 2026-07 (25/07-24/08), que rotula como "Ago/26" no grafico
function mesesDesdeAncora(){
  const [ay, am] = ANCHOR_MONTH.split('-').map(Number);
  const agora = new Date();
  return (agora.getFullYear()-ay)*12 + (agora.getMonth()+1-am);
}
function alignSeries(series){
  const offset = mesesDesdeAncora();
  if (offset <= 0) return series.slice();
  const shifted = series.slice(offset);
  while (shifted.length < series.length) shifted.push(series[series.length-1]);
  return shifted;
}
// Memoização (item 8 do plano) - mesmo padrão de alignSeriesCiclo.
(function(){
  const _orig = alignSeries, _cache = new Map();
  alignSeries = function(series){
    const key = mesesDesdeAncora()+'|'+JSON.stringify(series);
    if(_cache.has(key)) return _cache.get(key).slice();
    const r = _orig(series);
    _cache.set(key, r);
    return r.slice();
  };
})();
function alignEventos(eventos){
  const offset = mesesDesdeAncora();
  if (offset <= 0) return Object.assign({}, eventos);
  const shifted = {};
  for (const k in eventos){
    const novoIdx = Number(k) - offset;
    if (novoIdx >= 0) shifted[novoIdx] = eventos[k];
  }
  return shifted;
}

// plugin global: rotula valor em cima/ao lado de cada barra (vertical ou horizontal) - compartilhado
// por TODOS os graficos de barra do arquivo (auditoria 16/07/2026: cVariavel era o unico grafico de
// barra sem rotulo de valor por barra, causando desalinhamento visual entre o resumo em texto acima
// e as barras abaixo, especialmente em telas estreitas onde o grid-3 empilha em 1 coluna).
const barValuePlugin = {
  id:'barValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    const horizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.fillStyle = '#e8e6df';
    ctx.font = "600 10px -apple-system, 'Segoe UI', Roboto, sans-serif";
    meta.data.forEach((bar,i)=>{
      const v = values[i];
      const label = typeof v === 'number' ? fmt(v) : v;
      if(horizontal){
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, bar.x + 6, bar.y);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(label, bar.x, bar.y - 6);
      }
    });
    ctx.restore();
  }
};

/*======================================================
SISTEMA WALLACE LIRA — REGISTRADORES GLOBAIS (REG)
Criado 16/07/2026 (auditoria, a pedido do usuario) - FASE 1 da
refatoracao de arquitetura de dados (PROJETO_REFATORACAO_ARQUITETURA,
ver SWP_INPUT). Fonte unica de verdade para os valores do topo do
Painel (kpi-strip), secao 02 (Modo Operacional), secao 20 (Indicadores)
e secao 21 (Resumo Executivo) - exatamente os pontos onde a auditoria
encontrou divergencia entre paginas (ex: Necessidade Liquida aparecendo
como R$13.290 num lugar e R$13.327,10 em outro).
NUNCA editar os numeros abaixo em mais de um lugar do arquivo: todo o
HTML acima consulta estes valores via hydrate(), nao mais texto solto.
Para atualizar o painel numa proxima sessao: mudar o valor AQUI, e
todo o resto se atualiza sozinho no proximo carregamento da pagina.
FASE 2 (nao feita ainda, requer sessao dedicada): estender REG para
os livros razao (LRW/LRV/LRB/...), graficos de composicao (g_cTotalOp,
g_cVisa, g_cMetas, g_cCaixas) e a pagina Cenarios inteira - hoje ainda
tem valores hardcoded nesses pontos, herdados da versao anterior do HTML.
======================================================*/
// AUTOMATIZADO 19/07/2026: helper global (real > projetado > mediana) para a serie "Liquido" do
// cenario Superavit Normal. Definido antes do REG ser consumido em qualquer render para poder ser
// chamado tanto no resumo executivo (indice 0, ciclo atual) quanto na tabela/grafico completo da
// pagina Cenarios. Fonte dos dados: REG.superavitNormal.liquidoProjetado/liquidoReal + REG.cenarioHistorico.mediana.
// REESCRITO 19/07/2026 (regra definida pelo usuario): para o ciclo mais proximo (i=0), a prioridade
// agora depende do DIA DO MES em que a pagina e aberta, nao so da existencia do dado:
//   dia >= 25            -> valor REAL recebido (liquidoReal[0]). Se ainda nao foi preenchido (salario
//                           acabou de cair, usuario ainda nao confirmou), mantem o projetado como melhor
//                           estimativa disponivel em vez de saltar para a media (evita regressao).
//   dia 12-24             -> Liquido Projetado do Estimador de Salario (REG.estimador.liquidoProjetadoProximoCiclo),
//                           calculado a partir da folha de ponto que sai por volta do dia 12.
//   dia 1-11               -> media ponderada de 12 meses (REG.cenarioHistorico.mediaPonderada12M) -
//                           fallback conservador, nenhum dado especifico do ciclo ainda.
// Para os demais indices (i>0, ciclos futuros sem estimador proprio) mantem a logica antiga: real[i]
// (se algum dia for preenchido) > media ponderada (fallback).
function liquidoMes(i){
  const fallback = REG.cenarioHistorico.mediaPonderada12M;
  const real = (REG.superavitNormal.liquidoReal || {})[i];
  if(real !== undefined && real !== null) return real;
  if(i === 0){
    const dia = new Date().getDate();
    if(dia >= 12 && dia <= 24) return REG.estimador.liquidoProjetadoProximoCiclo;
    if(dia >= 25) return REG.estimador.liquidoProjetadoProximoCiclo; // real ainda nao confirmado - mantem melhor estimativa
  }
  return fallback;
}

// ============================================================================
// BANCO DE VARIAVEIS UNICO (VARS) — NOVO 22/07/2026 (V134)
// ============================================================================
// Implementado HOJE (usuario pediu para nao esperar 25/07 - "encontrei a mesma
// classe de bug [...] nao da para esperar"). Nao e o SSOT completo (isso ainda
// depende do Google Sheets/Apps Script, que exige deploy fora do alcance das
// ferramentas do Claude nesta sessao — ver PROPOSTA_SSOT_GOOGLE_SHEETS_APPS_SCRIPT).
// Mas resolve a CAUSA RAIZ especifica que ja gerou bug real 3-4 vezes nesta sessao:
// o mesmo saldo (Caixa Lance, Manutencao, Boletos, Aniversario Julio, Escola Julio,
// Cartao Infinite/MB) existia em MULTIPLOS lugares do REG como numero literal
// duplicado, e cada correcao so atualizava um lugar, deixando os outros parados.
//
// A partir de agora: estes ~15 valores existem em UM SO lugar (aqui). Todo o
// resto do REG que precisa deles LE a partir daqui (VARS.xxx), nunca mais copia
// o numero. Atualizar um saldo = mudar uma linha aqui, e automaticamente todo
// lugar que usa aquele valor (cards, tabelas, graficos) fica correto.
const VARS = {
  // NOVO 31/07/2026 (V218, pedido explicito do usuario: "legendas devem estar em uma lista de
  // variaveis para nunca precisar subir o site so para mudar legendas"): objeto LEGENDAS centraliza
  // todo texto explicativo do site (28 legendas migradas). O HTML agora tem so o id de cada uma,
  // vazio ("—" placeholder) - o conteudo real vem daqui, aplicado no hydrate() via innerHTML.
  // Para editar uma legenda no futuro: mudar SO o texto aqui, nunca precisa tocar no HTML.
  LEGENDAS: {
    legEscolaJulioForaPatrimonio: `Escola de Júlio NÃO entra no Patrimônio Financeiro/Meta do Milhão desde 16/07/2026 (V47) — regra oficial (P5): só Reserva+BTG/Necton+Caixa Lance+Necton Conta Corrente contam como patrimônio. Escola de Júlio segue existindo como caixa/reserva própria, acompanhada separadamente. Atualizado 22/07/2026: total R$115.723,06 (Caixa Lance reconciliada com saldo real, R$204,48→R$553,91).`,
    legVisaAposentado: `Wallace aposentou o cartão físico (4844) em 16/07/2026 — usa só o Mastercard Black agora. Assinaturas, recorrências, consórcios e o corporativo antigo já migraram 100% para o Mastercard Black (V159/V161) — o que resta aqui é só as <strong>parcelas em andamento</strong>, que continuam no Visa até quitar (nunca migram, é regra fixa). Nenhuma compra variável nova acontece mais neste cartão — Visa Infinite é só do Wallace.`,
    legVisaCorrecaoV207: `CORRIGIDO 30/07/2026 (V207): a versão anterior deste texto (V206) dizia que o cartão 6351 da Vanessa era "Visa Infinite ativo" - isso estava ERRADO. A tabela oficial de cartões confirma: 6351 = Mastercard Black da Vanessa, não Visa. A compra da Drogasil (R$132,26) foi lançada por engano neste cartão em V201 e revertida agora - o Visa Infinite nunca teve fatia da Vanessa de verdade, era um erro de lançamento que o gráfico só refletia fielmente.`,
    legAguaGasMedintech: `Água e Gás são cobrados pela Medintech (medição individualizada) e variam todo mês — TXB000004/005 mantêm o valor do mês anterior até a leitura ser atualizada. TX000069 (retirada de R$1.313,69 da Caixa Boletos) não entra como lançamento próprio — reconciliado 100% com o extrato PIX de 10/07 (ver nota no ERP). O PIX de R$210,00 ao Anderson em 21/07 (van escolar do Júlio) é o mesmo TXB000006 já listado acima, não uma cobrança nova. Cofrinho rendeu +R$1,66 de CDI no mesmo período (não listado como linha própria, incluído no total abaixo).`,
    legParcelamentosVisaAuto: `Tabela gerada automaticamente a partir de VARS.PARCELAMENTOS_VISA (aba PARCELAMENTOS_ATIVOS do ERP) — a cada virada de ciclo, cada parcela avança +1; ao ultrapassar o total, o item some da lista sozinho (status QUITADO). Nunca mais editar esta tabela na mão.`,
    // legAlivioAgosto REMOVIDA daqui em V219 - virou calculo dinamico real (ver aplicarAlivioAgosto()
    // logo apos o VARS fechar), nao mais texto fixo. Pedido do usuario: "implemente ja".
    legMigracaoAssinaturasMB: `Migração para o Mastercard Black concluída (25/07/2026) — todas as 13 assinaturas já estão no MB (físico 2244 ou virtual 4628), nenhuma resta no Visa Infinite. TXS000003 (Google Youtube, duplicata de TXS000008) removida desta lista — nunca deveria ter sido lançada em separado.`,
    legLRCLimboCorporativo: `Mostrando só o corporativo do ciclo atual, ainda pendente de reembolso. O corporativo do ciclo fechado já está coberto dentro do valor separado para pagamento (ver seletor de ciclo no topo do painel). 100% reembolsável pela Wärtsilä (prioridade 2 na fila de reembolso).`,
    legParcelamentosMPAuto: `Parcelas geradas automaticamente a partir de VARS.PARCELAMENTOS_MP — avançam +1 a cada ciclo, somem sozinhas ao quitar. Itens "corp."/"único" filtrados automaticamente pela DATA real de cada um contra o período do ciclo selecionado (nunca mais editado à mão) — corp. = 100% reembolsável (prioridade 2 na fila de reembolso).`,
    legP2PCustoWallace: `Custo do Wallace (1/10 do capital P2P de R$110,00). Não gera receita, não entra no total de compras da Vanessa (LRV).`,
    legPGVSaldoResidual: `Saldo real da Caixa Pix Geral: <strong>-R$ 0,04</strong> (praticamente zerada — resíduo imaterial documentado, não forçado). Ciclo fechado com comprovantes reais: 17/07 R$159,96 (pós reforço da PV) − R$67,00 (frutas) = R$92,96; 20/07 + R$2,00 (complemento da Caixa Variável) − R$95,00 (fralda do Júlio) = -R$0,04. O total abaixo é o fluxo líquido de todas as transações listadas na aba, não o saldo da caixa.`,
    legOpcoesReconstruido: `CORRIGIDO 31/07/2026 (V222): 3 posições confirmadas via print direto da corretora (não 2 como antes) — faltava PETRS368W5, e PETRT379 tinha valor errado. PETRT379: R$154,84 (não R$180,00, que era dedução errada de outro print). PETRS368W5: R$39,97 (venc. HOJE, 31/07). ITUBT424: R$177,04. <strong>Total de prêmios: R$371,85</strong>, já garantido mesmo com posições ativas. Estratégia: deixar vencer.`,
    legLinha4vs5MP: `Linha 4 ≠ linha 5 — não confundir. Linha 4 = total da fatura Mercado Pago menos a parte corporativa (linha 2) = o que você mesmo deve pagar ali (verificado 19/07/2026 contra a fatura literal do ciclo atual: 6 parcelas Mercado Livre somam R$471,47 nesta fatura — não R$514,05, valor antigo que incluía indevidamente uma compra avulsa já paga em ciclo anterior). Linha 5 = o que sobra do reembolso da Wärtsilä depois de cobrir tudo (linhas 1-3), vira crédito seu no Mercado Pago — dinheiro diferente, mesmo destino.`,
    legOrcamentoOperacionalComposicao: `Orçamento livre do dia a dia: Custos Variáveis R$2.000,00 + PIX Vanessa R$1.200,00.`,
    legNecessidadeBrutaLiquida: `Bruta assume nenhuma fatura provisionada (pior cenário). Líquida desconta o que já está garantido, seguindo a ordem oficial de prioridade do reembolso Wärtsilä: 1) Fatura Wärtsilä (R$0 de impacto, sempre) → 2) Mercado Pago corporativo → 3) Mercado Pago pessoal → 4) Visa Infinite corporativo (regra nova, 15/07/2026) → 5) sobra vai para Caixa Lance. PIX de R$1.749,35 para Caixa Mercado Pago confirmado em 14/07/2026 já cobriu 100% do provisionamento não-reembolsável do Mercado Pago (R$471,47, corrigido 19/07/2026 — a fatura literal do ciclo atual confirma que a compra avulsa de R$42,58 somada em 17/07 não pertence a este ciclo). Com a regra nova, o corporativo do Visa Infinite (R$483,43) também entra como garantido, elevando o total de R$471,47 para R$954,90.`,
    legSimulacaoMesAMes: `Simulação mês a mês: cada parcelamento do Visa Infinite avança até encerrar (ex: 4/12 → mais 8 meses), e cada caixa patrimonial recebe Aporte=Meta−Saldo até bater a meta (Aniversário Júlio para em Set/26; Combustível e Churrasco reduzem entre Set-Dez/26). Assume cobertura garantida constante (R$954,90 — MP pessoal R$471,47 + Visa Infinite corporativo R$483,43, corrigido 19/07/2026) e boletos/assinaturas/recorrências/consórcios estáveis. Premissa marcada: o valor corporativo do Visa Infinite recorrente pressupõe viagens/despesas corporativas similares nos próximos meses — recalcular se o padrão mudar.`,
    legTotalOperacionalDefinicao: `O que é: TOTAL_OPERACIONAL (boletos + parcelamentos Visa Infinite + assinaturas + recorrências + consórcios + aportes das caixas patrimoniais) mês a mês. Reconstruído em 16/07/2026 (auditoria) a partir dos dados literais de parcela do livro LRP. Aniversário Júlio zera após o ciclo Set/26 (prazo 14/09/2026, confirmado). Premissa: boletos, assinaturas, recorrências e consórcios tratados como constantes. Combustível zera após Set/26 (atinge meta R$500) e Churrasco após Nov/26 (atinge meta R$500) — saldo real R$0 confirmado pelo usuário em 16/07/2026, simulação completa.`,
    legMBVisaLiquidoCV: `Mastercard Black + Visa Infinite — líquido de Caixa Variável (a Caixa Variável já provisiona 100% das compras LRW+LRV de ambos os cartões; este gráfico mostra quanto da obrigação dos cartões NÃO está coberto por ela — parcelas, assinaturas, recorrências, consórcios e corporativo — e compara o Comprometido provisionado com o Disponível real em caixa)`,
    legLegendaCaixasIncrementais: `Aniversário Júlio (R$200/mês) para em Set/26 (prazo 14/09) · Escola Júlio ciclo atual (R$500/mês) para em Nov/26 (coberto por 13º/férias) · Seguro/Emplacamento (R$425/mês) roda em ciclo contínuo de 12 meses desde Jan/26, sem interrupção — vira pro ciclo 2027 na mesma taxa, por isso nunca aparece como "alívio" neste gráfico · Escola de Júlio 2027 reinicia do zero em Jan/27, R$839,64/mês por 11 meses (Jan-Nov/27), batendo o teto de R$9.236,00 em novembro · Saúde Família (R$100/mês) projeta completar por volta de Nov/27 (~16 meses no ritmo atual, reembolsos médicos podem acelerar isso de forma imprevisível).`,
    legMPCorporativoImpacto: `Mercado Pago corporativo (compras Wärtsilä, reembolsáveis) não entra — impacto real é sempre R$0. Escola Júlio é preservada sempre que possível, mas não faz parte deste piso absoluto. Mesmo no cenário mais crítico, R$9.223,66 têm que sair todo ciclo. Ordem de corte quando o modo é Baixo/Crítico: Churrasco → Combustível → Eventos → Manutenção.`,
    legCoparticipacaoSaude: `⚠ Co-participação de saúde/odonto (uso real de plano) é imprevisível — variou de R$0 a R$231,63/mês nos últimos 12 meses. Usando média histórica de R$87,36/mês. Não é uma alíquota, é uso real do plano.`,
    legTaxasPorHoraAviso: `Taxas por hora (confiança média, ±15%) — ⚠️ valores fixos, não recalculam automaticamente com o salário. Usuário não tem a fórmula CLT/convenção para implementar como derivado (achado 31/07/2026, V216) — atualizar manualmente se o salário-base mudar.`,
    legCenarioFicaEmCasa: `Cenário "fica em casa" (sem Periculosidade): Base + Supervisão(5%) + Auxílio Creche − INSS − IRRF − Saúde/Dental − PGBL ≈ <strong>R$7.667,73/mês</strong>.`,
    legDeficitSemEmbarque: `Se você ficasse 12 meses seguidos sem embarque (líquido fixo de R$7.667,73/mês), o déficit contra o piso absoluto diminui sozinho conforme parcelas do Visa Infinite e do Mercado Pago vão terminando — sem cortar nada. Boletos, Consórcios, Recorrências e Assinaturas ficam constantes (não têm previsão de encerrar).`,
    legPGBLFGTSForaBalanco: `PGBL e FGTS (<span id="balPgblFgtsSoma">—</span> juntos) não estão incluídos aqui — são não líquidos e não geridos ativamente, ficam só como cards informativos acima.`,
    legReservasPagamentoDefinicao: `"Reservas de Pagamento" = dinheiro já separado para cobrir compromissos (cartões, boletos) + o saldo de trabalho do ciclo atual. PIX Geral Vanessa é conta autônoma dela, listada aqui só por transparência — nunca soma no total.`,
    legMPCorporativoRetorno: `O corporativo do Mercado Pago só volta a contar após a fatura anterior (venc. dia 4) ser paga e uma nova despesa corporativa surgir neste ciclo — enquanto isso, fica zerado (ver Cascata do Reembolso).`,
    legDestinoExcedente: `Destino do excedente: Caixa Lance (quando ≥R$500, avaliar ETF LFTS11) e BTG/Necton.`,
  },
  // Caixa Variavel (operacional, dia-a-dia)
  // MIGRADO 27/07/2026 (V193): caixaVariavelSaldoReal migrada para saldo derivado - ULTIMA caixa da
  // arquitetura "editavel/auditavel". Mais complexa que as demais por causa da logica de ciclos
  // (aplicarCicloAoVARS troca o valor conforme o ciclo selecionado) - o SALDO INICIAL aqui e o do
  // CICLO ATUAL (2026-07, aberto 25/07), NAO um valor fixo global. O ciclo fechado (2026-06) continua
  // intocado dentro de CICLO_SNAPSHOTS, com seu proprio valor congelado (nao migrado - e historico).
  // BUG ENCONTRADO NESTA MIGRACAO: este numero solto (linha abaixo) estava em R$1.678,00 (resquicio do
  // "reforco fantasma de R$222" que o usuario apontou e eu corrigi errado - so tinha revertido o valor
  // DENTRO do snapshot do ciclo, esquecido aqui no topo do VARS). NUNCA aparecia na tela de verdade
  // (aplicarCicloAoVARS sempre sobrescrevia com o valor certo do snapshot, R$1.900,00) mas era um
  // numero morto enganoso - eliminado agora que vira formula.
  CAIXA_VARIAVEL_SALDO_INICIAL_CICLO: 3933.37, // saldo real do ciclo ANTERIOR (Jun/26) na hora do fechamento - ponto de partida antes dos movimentos do ciclo atual
  CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL: [
    { tx:'TX000139', data:'25/07', nome:'Transferência única CV → Mastercard/Infinite (saldo antigo inteiro, virada de ciclo)', tipo:'Saída', valor:3933.37 },
    { tx:'TX000137', data:'25/07', nome:'Aporte mensal (salário Wärtsilä, novo ciclo)', tipo:'Entrada', valor:2000.00 },
    { tx:'TX000162', data:'26/07', nome:'PIX poda das bananeiras (Ednaldo Caetano da Silva)', tipo:'Saída', valor:100.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:4.80 },
  ],
  // NOTA (mesma migração, V193): o comentário histórico (V144/V145) mencionava TX000139 = R$4.002,61 e uma
  // "folga de R$69,24" - reconferindo a aritmética, a transferência que saiu de fato da Caixa Variável foi
  // o saldo antigo inteiro (R$3.933,37, sem excedente); os R$4.002,61 mencionados antes provavelmente somavam
  // outra origem que também chegou na caixa Mastercard/Infinite. Valor usado aqui é o que fecha exato com o
  // saldo real confirmado (R$1.900,00) - se o usuário tiver o extrato exato da TX000139, vale reconferir.
  caixaVariavelSaldoReal: 1900.00, // PLACEHOLDER - sobrescrito por calcularSaldoCaixa() OU pelo snapshot do ciclo selecionado (aplicarCicloAoVARS). Nunca editar direto - editar CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL.
  caixaVariavelComprometido: 0,          // VIRADA DE CICLO 25/07/2026 (V143): novo ciclo (25/07-24/08) comeca com comprometido zerado. Ciclo anterior fechou em R$3.998,50 (ver ERP SNAPSHOT_CICLOS_FECHADOS - nada foi apagado, so este contador de ciclo resetou). Era R$3.998,50.

  // Cofrinhos/caixas patrimoniais e operacionais (Mercado Pago)
  // MIGRADO 27/07/2026 (V192): caixaLance deixou de ser numero fixo editado a mao - agora e SEMPRE
  // calcularSaldoCaixa(CAIXA_LANCE_SALDO_INICIAL_CICLO, VARS.CAIXA_LANCE_TRANSACOES). Historico
  // reconstruido a partir dos comentarios ja documentados nas versoes anteriores (V141/V183/V187) -
  // nenhum valor novo inventado, so formalizado em array conferivel.
  CAIXA_LANCE_SALDO_INICIAL_CICLO: 3748.74, // saldo de abertura do ciclo 2026-07 (25/07/2026)
  CAIXA_LANCE_TRANSACOES: [
    { tx:'TXMP000009', data:'24/07', nome:'Empréstimo p/ Fatura Cartão Mercado Pago (LREI0003, transporte corporativo, reembolsável Wärtsilä)', tipo:'Saída', valor:266.23 },
    { tx:'TX000165', data:'27/07', nome:'Empréstimo p/ Caixa Saúde Família (LREI0002, conduta pediátrica de Júlio)', tipo:'Saída', valor:164.94 },
    { tx:'JUROS-27-07', data:'27/07', nome:'Juros repassados das caixinhas de fatura (Mastercard/Infinite R$161,12 + Fatura Mercado Pago R$8,27 + Fatura Wärtsilä R$27,37)', tipo:'Entrada', valor:196.76 },
    { tx:'PIX-LIVELO-29-07', data:'29/07', nome:'PIX recebido Livelo S.a. (cashback/pontos)', tipo:'Entrada', valor:8.58 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:9.42 },
  ],
  caixaLance: 3514.33,                  // PLACEHOLDER - sobrescrito logo apos o VARS fechar por calcularSaldoCaixa(). Nunca editar este numero diretamente - editar CAIXA_LANCE_TRANSACOES.

  // V184 (27/07/2026): LREI_ATIVAS criado - primeira vez que as dívidas internas da Caixa Lance
  // ganham registrador estruturado no app.js (antes só existiam como comentário solto no VARS.caixaLance).
  // Espelha 1:1 a aba LREI do ERP (LREI0002/LREI0003). Caixa Lance é credora nas duas.
  LREI_ATIVAS: [
    { id:'LREI0002', data:'27/07', credora:'Caixa Lance', devedora:'Caixa Saúde Família', valor:164.94, origem:'Reembolso do plano de saúde (conduta pediátrica de Júlio)', status:'ATIVO' },
    { id:'LREI0003', data:'24/07', credora:'Caixa Lance', devedora:'Fatura Cartão Mercado Pago', valor:266.23, origem:'Reembolso Wärtsilä (transporte corporativo, TXMP000009, vence 04/08)', status:'ATIVO' },
  ],
  MANUTENCAO_SALDO_INICIAL: 178.72,
  MANUTENCAO_TRANSACOES: [
    { tx:'TX000143', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:166.67 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:1.06 },
  ],
  caixaManutencao: 345.39,              // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar MANUTENCAO_TRANSACOES.

  ANIVERSARIO_JULIO_SALDO_INICIAL: 200.10,
  ANIVERSARIO_JULIO_TRANSACOES: [
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.70 },
  ],
  caixaAniversarioJulio: 200.10,        // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar ANIVERSARIO_JULIO_TRANSACOES.

  // NOVO 31/07/2026 (V214): CRONOGRAMA_BOLETOS_FIXOS - lista completa dos 9 boletos recorrentes com
  // dia de vencimento, confirmada pelo usuario. Base para o auto-credito por data (ver funcao
  // aplicarBoletosVencidosAutomaticamente() logo apos o VARS fechar) - elimina a necessidade de
  // perguntar manualmente "isso ja foi pago?" toda sessao. O TX de cada um casa com o TXB do livro LRB.
  CRONOGRAMA_BOLETOS_FIXOS: [
    { tx:'TXB000001', nome:'Prestação da casa (Caixa Econômica)', diaVencimento:27, valor:588.66 },
    { tx:'TXB000002', nome:'Condomínio Bellagio', diaVencimento:10, valor:210.00 },
    { tx:'TXB000003', nome:'Curso de inglês (Guimarães Faria)', diaVencimento:10, valor:695.00 },
    { tx:'TXB000004', nome:'Água (Medintech)', diaVencimento:10, valor:133.41 },
    { tx:'TXB000005', nome:'Gás (Medintech)', diaVencimento:10, valor:30.28 },
    { tx:'TXB000006', nome:'PIX Anderson da Costa Ramos', diaVencimento:22, valor:210.00 },
    { tx:'TXB000007', nome:'FIES Vanessa (PIX Vanessa Gomes Galdino)', diaVencimento:10, valor:245.00 },
    { tx:'TXB000008', nome:'Conselho Regional', diaVencimento:31, valor:163.24 },
    { tx:'TXB000009', nome:'Energia (Energisa Paraíba)', diaVencimento:26, valor:367.36 },
    // REVERTIDO 04/08/2026 (parte 63): a parte 62 tinha adicionado TXB000010/011/012 (Vivo+Brisanet)
    // aqui, achando que nao tinham registro nenhum - erro meu, so tinha procurado em
    // CRONOGRAMA_BOLETOS_FIXOS, nao no resto do app.js. Usuario mostrou print confirmando que Vivo
    // (R$435,00, TXRR000001) e Brisanet (R$113,13, TXRR000002) JA estavam rastreadas no livro LRR
    // (linha 1429-1430 do HISTORICO_ERP_TODOS_CICLOS, parte 57) - cadastrar de novo aqui, com valor
    // estimado E diferente (484+55,08 vs o real 435,00), teria criado um debito duplicado e errado na
    // Caixa de Boletos (esse cronograma debita de verdade - nao e so referencia). Removido.
  ],
  BOLETOS_SALDO_INICIAL: 613.17,
  BOLETOS_TRANSACOES: [
    { tx:'TX000140/TXB000010', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:1986.21 },
    { tx:'TXB000009', data:'26/07', nome:'Energia (Energisa) - última conta sem efeito do solar', tipo:'Saída', valor:367.36 },
    { tx:'TXB000001', data:'27/07', nome:'Prestação da casa (Caixa Econômica)', tipo:'Saída', valor:588.66 },
    { tx:'TXB000008', data:'31/07', nome:'Conselho Regional', tipo:'Saída', valor:163.24 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app, R$168,43 - documentado, não ajustado silenciosamente conforme P1)', tipo:'Entrada', valor:168.43 },
  ],
  // RESOLVIDO 31/07/2026 (V213): usuario confirmou os 3 boletos pagos no ciclo (25/07-31/07) por
  // vencimento: Energisa (26/07, R$367,36) + Prestação da casa (27/07, R$588,66) + Conselho Regional
  // (31/07, R$163,24) = R$1.119,26. Ainda restava diferenca de R$168,43 em relacao ao saldo real
  // informado (R$1.648,55) - registrada como residuo explicito (P1: nunca ajustar silenciosamente),
  // nao forcado a bater. Os outros 6 boletos (dia 10 e 22) vencem DEPOIS deste ciclo fechar (24/08),
  // entram no proximo aporte. Guimarães Faria=Curso de ingles, PIX Vanessa=FIES Vanessa (confirmado
  // pelo usuario), Bellagio=Condominio, Medintech=Agua+Gas, Anderson Ramos=TXB000006.
  caixaBoletos: 1648.55,                // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar BOLETOS_TRANSACOES.

  PV_SALDO_INICIAL: 0,
  // PV_TRANSACOES ja existe mais abaixo (array proprio criado em V176) - reutilizado aqui, nao duplicado.
  caixaPixVanessa: 900.00,              // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(PV_SALDO_INICIAL, VARS.PV_TRANSACOES). Nunca editar direto.

  // MIGRADO 27/07/2026 (V192): pixGeralVanessaSaldo deixou de ser numero fixo editado a mao - agora e
  // SEMPRE calcularSaldoCaixa(PGV_SALDO_INICIAL_CICLO, VARS.LRPV_TRANSACOES). Conferido por execucao real:
  // 0 - R$182,96 - R$39,00 + R$300,00 = R$78,04, vs R$78,00 confirmado pelo usuario em 26/07 - diferenca
  // de R$0,04 e residuo de rendimento CDI ja documentado (Politica secao 6), nao ajustado silenciosamente.
  PGV_SALDO_INICIAL_CICLO: 0, // ancora do ciclo 2026-07 (25/07-24/08) - PGV comecou zerada (reduzida ao ciclo atual em V177)
  pixGeralVanessaSaldo: 78.00, // PLACEHOLDER - sobrescrito logo apos o VARS fechar por calcularSaldoCaixa(). Nunca editar este numero diretamente - editar LRPV_TRANSACOES. Mantido 78.00 aqui so como fallback caso o array mude antes do recalculo rodar.

  EVENTOS_SALDO_INICIAL: 0,
  EVENTOS_TRANSACOES: [
    { tx:'TX000144', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:166.67 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.42 },
  ],
  caixaEventos: 166.67,                 // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar EVENTOS_TRANSACOES.

  // MIGRADO 27/07/2026 (V192): caixaSaudeFamilia deixou de ser numero fixo - agora e SEMPRE
  // calcularSaldoCaixa(SAUDE_FAMILIA_SALDO_INICIAL_CICLO, VARS.SAUDE_FAMILIA_TRANSACOES), resolvido
  // logo apos o VARS fechar (ver bloco de saldos derivados abaixo). Nunca mais editar um numero aqui -
  // editar o array SAUDE_FAMILIA_TRANSACOES.
  SAUDE_FAMILIA_SALDO_INICIAL_CICLO: 0, // ancora do ciclo 2026-07 (25/07-24/08) - caixa comecou zerada, 1o aporte e a 1a transacao do array
  caixaSaudeFamilia: 0, // PLACEHOLDER - sobrescrito logo apos o VARS fechar por calcularSaldoCaixa(). Nunca editar este numero diretamente. CONFIRMADO 31/07/2026: usuario reportou saldo real R$0,00 - bate com o calculado (R$-0,06, arredonda pra R$0,00), sem ajuste necessario.

  SEGURO_EMPLACAMENTO_SALDO_INICIAL: 0,
  SEGURO_EMPLACAMENTO_TRANSACOES: [
    { tx:'TX000148', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:425.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:1.08 },
  ],
  caixaSeguroEmplacamento: 425.00,      // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar SEGURO_EMPLACAMENTO_TRANSACOES.

  COMBUSTIVEL_SALDO_INICIAL: 0,
  COMBUSTIVEL_TRANSACOES: [
    { tx:'TX000145', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:200.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.50 },
  ],
  caixaCombustivel: 200.00,             // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar COMBUSTIVEL_TRANSACOES.

  CHURRASCO_SALDO_INICIAL: 0,
  CHURRASCO_TRANSACOES: [
    { tx:'TX000146', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:100.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.24 },
  ],
  caixaChurrasco: 100.00,               // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar CHURRASCO_TRANSACOES.

  ESCOLA_JULIO_SALDO_INICIAL: 506.74,
  ESCOLA_JULIO_TRANSACOES: [
    { tx:'TX000142', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:500.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:3.06 },
  ],
  escolaJulioSaldo: 1006.74,            // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar ESCOLA_JULIO_TRANSACOES. Fora da Meta do Milhao (regra P5/V47).

  // Cartoes (comprometido, corporativo Wartsila)
  // AVISO 04/08/2026 (parte 69): cartaoMBTotal, mbLRWConfirmado, mbLRSConfirmado (e mbLRVConfirmado)
  // JA EXISTEM como chave de topo em wallace_dados.dados no Supabase - Object.assign(VARS, dr) (ver
  // "Object.assign(VARS, dr)" mais abaixo no arquivo) SOBRESCREVE o valor escrito aqui, sempre, em
  // toda carga real de pagina. Editar esses 3 numeros aqui e cosmetico/documental (mantido pra quem
  // le o arquivo sem acesso ao banco), mas NUNCA e o jeito de atualizar o site de verdade - o
  // lancamento de compra tem que ir direto no Supabase (UPDATE wallace_dados SET dados = dados ||
  // jsonb_build_object(...) WHERE id=1), nunca so aqui. Erro cometido nas partes 64/67/68 desta mesma
  // sessao - 3 compras "lancadas" so no arquivo, sem efeito nenhum no site real, ate o usuario avisar.
  cartaoInfiniteTotal: 1017.89,          // CORRIGIDO 30/07/2026 (V207): revertido - TX000176 (Drogasil, cartão 6351) nunca foi do Visa Infinite. A tabela oficial de cartões (PROMPT_META_AI_EXTRACAO.md) confirma: 6351 = Vanessa, MASTERCARD BLACK, não Visa. Erro cometido em V201 (29/07) ao lançar a compra - corrigido agora, movida para o Mastercard Black (ver cartaoMBTotal). Era R$1.150,15 (errado).
  cartaoMBTotal: 5633.11,               // ATUALIZADO 04/08/2026 (parte 68): +R$17,00 (TX000202, MP *FESTA, ver mbLRWConfirmado). mbDetalhe (1950,77 consórcios+1177,58 wallace+1279,65 recorrências+297,31 corp+623,10 assinaturas+304,70 vanessa) soma exato 5.633,11. Era R$5.616,11 (parte 67): +R$60,90 (TX000201, PANIFICADORA, ver mbLRWConfirmado). mbDetalhe (1950,77 consórcios+1160,58 wallace+1279,65 recorrências+297,31 corp+623,10 assinaturas+304,70 vanessa) soma exato 5.616,11. Era R$5.555,21 (parte 64): +R$110,00 (TX000200, ANTHROPIC*CLAUDE SUB, ver mbLRSConfirmado). mbDetalhe (1950,77 consórcios+1099,68 wallace+1279,65 recorrências+297,31 corp+623,10 assinaturas+304,70 vanessa) soma exato 5.555,21. Era R$5.445,21 (2a correção do dia, mesmo gap de propagação - agora do lado mbLRWConfirmado, ver comentário lá): +R$206,48 (TX000192/195/196/197/198/199, ver mbLRWConfirmado). mbDetalhe (1950,77 consórcios+1099,68 wallace+1279,65 recorrências+297,31 corp+513,10 assinaturas+304,70 vanessa) soma exato 5.445,21 - checagem #12 volta a bater. Era R$5.238,73 (auditoria automática, mesmo gap de propagação já documentado abaixo): +R$23,73 (TX000193 R$12,23 + TX000194 R$11,50, ambas Uber/Vanessa cartão MB 4628, lançadas em mbLRVConfirmado em 03/08 mas nunca propagadas pra cá) — mbDetalhe (5238,73) × cartaoMB.total (5215,00) divergiam por isso, checagem #12 acusou certo. Era R$5.215,00 (CORRIGIDO 01/08/2026, auditoria SSOT, divergencia real encontrada): +R$50,00 (TX000191, MP *TIORAFAKIDS, corte de cabelo do Julio, 01/08) - ja estava somado em mbLRVConfirmado (detalhamento) mas nunca tinha propagado pra ca (total agregado), causando gap de R$50,00 entre mbDetalhe e cartaoMB.total na auditoria automatica (checagem #12). Era R$5.165,00: +R$32,06 (TX000188, Amazon - Repelente Bebê, cartão MB 4628). Era R$5.132,94 (31/07): +R$26,14 (TX000184/185/186, H57Store x3, cartão NOVO 1371). Era R$5.106,80: +R$227,00 (TX000183, Tapiocaria Irmão Firmi, cartão MB 2244). Era R$4.879,80: +R$6,43 (TX000180, Uber DL*UberRides, cartão MB 4628). Era R$4.873,37: +R$5,06 (TX000179, Uber DL*UberRides, cartão MB 4628). Era R$4.868,31 (30/07, V207): +R$132,26 (TX000176, Drogasil, cartão 6351). Era R$4.736,05 (29/07, V201): +R$19,65 (TX000177, Uber, cartão MB 4628). Era R$4.716,40.

  // NOVA CAIXA 24/07/2026 (V139): renomeacao de CAIXA_FATURA_VISA_INFINITE (nao caixa nova) -
  // passa a guardar o valor combinado dos 2 cartoes (Mastercard Black + Visa Infinite) ate o
  // vencimento 28/07/2026. R$484,08 (saldo antigo, corporativo ja garantido) + R$4.002,61
  // (transferencia unica da CV, TX000139) + R$6.745,18 (aporte direto do salario, TX000151) = R$11.231,87.
  // Necessidade: MB R$1.937,18 (congelado) + Infinite total R$9.160,07 = R$11.097,25. Folga R$134,62.
  // MIGRADO 27/07/2026 (V193): caixaMastercardInfinite migrada para saldo derivado, mesmo padrao das
  // demais. Historico reconstruido do que ja estava documentado em V187 (pagamento das faturas +
  // juros repassados a Caixa Lance) - nenhum valor novo inventado.
  MASTERCARD_INFINITE_SALDO_INICIAL: 11167.23,
  MASTERCARD_INFINITE_TRANSACOES: [
    { tx:'PIX-BRADESCO-27-07', data:'27/07', nome:'Pagamento fatura Visa Infinite (PIX → Bradesco)', tipo:'Saída', valor:9073.92 },
    { tx:'PIX-ITAU-27-07', data:'27/07', nome:'Pagamento fatura Mastercard Black (PIX → Itaú)', tipo:'Saída', valor:1937.18 },
    { tx:'JUROS-27-07-MB', data:'27/07', nome:'Juros acumulados (repassados à Caixa Lance)', tipo:'Entrada', valor:161.12 },
  ],
  caixaMastercardInfinite: 317.25, // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar MASTERCARD_INFINITE_TRANSACOES.
  mastercardBlackCongelado: 1937.18,    // Congelado 22/07/2026, vencimento 28/07/2026 (fatura real do app, 25 lancamentos validos).

  // V135 (22/07/2026, auditoria SSOT): LRP e LRCON ainda sem split fisico por cartao (Politica sec.3) -
  // 100% atribuidos ao Visa Infinite por decisao documentada. Ate aqui existiam como numero literal
  // duplicado em totalOpDetalhe E visaDetalhe (2 copias que podiam dessincronizar) - agora moram so aqui.
  livroLRP: 0,      // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.PARCELAMENTOS_VISA (soma dos ATIVO). Nunca editar este numero diretamente - editar os itens do array.
  // NOVO 04/08/2026 (parte 77, metodologia definida pelo usuario): categoria nova - compras avulsas
  // de bem durável/eletrônico (fone, cortador de pelo, smartwatch, ferramentas) NÃO entram na Caixa
  // Variável (que deveria medir só o custo RECORRENTE de viver - mercado, farmácia, Uber, higiene).
  // Ficam aqui, separadas, pra nao distorcer o indicador do teto de R$2.000/mes da Caixa Variavel.
  // Default vazio aqui - valor real vive no Supabase (EXTRAORDINARIO_BENS_DURAVEIS), mesmo padrao dos
  // outros livros de transacao.
  EXTRAORDINARIO_BENS_DURAVEIS: [],
  livroLRCON: 1950.77,    // = LIVRO_LRCON_TOTAL do ERP (2 consorcios: Porto Carro + Porto Casa Nova). USADO NO MASTERCARD BLACK (mbDetalhe.consorcios) - ambos ja migrados para MB desde 17/07/2026, valor correto aqui.
  livroLRCONVisaOnly: 0,    // NOVO 25/07/2026 (V159): parte do LRCON que e do Visa Infinite (usado em visaDetalhe.consorcios) - ZERADO porque os 2 consorcios ja migraram 100% para o Mastercard Black desde 17/07/2026. Nao ha nenhum consorcio no Visa.

  // Patrimonio financeiro (Meta do Milhao)
  // ATUALIZADO 27/07/2026 (V185, print Itaú 22:04): saldo real R$100.476,11 (aplicação de 03/07/2026,
  // rendimento bruto acumulado R$817,29, IOF R$202,99, IR R$138,19, líquido R$476,11). Rotina do usuário:
  // retirar o rendimento todo mês pra manter a Reserva travada em R$100.000,00.
  // RETIRADA PROGRAMADA (confirmada pelo usuário 27/07): projeção pra 03/08/2026, quando a aplicação
  // completa 30 dias corridos e o IOF zera. Rendimento bruto projetado (linear, R$34,05/dia x 30 dias)
  // = R$1.021,59; IR 22,5% (aplicação <180 dias) = R$229,86; líquido projetado = R$791,73. Retirar esse
  // valor em 03/08 devolve a Reserva para R$100.000,00 (mesma rotina mensal). Ajustar com o valor REAL
  // do app no dia, se divergir da projeção linear (CDI varia dia a dia, fins de semana não rendem).
  reserva: 100644.15, // ATUALIZADO 31/07/2026 (V210): print BTG "meus investimentos", saldo atualizado 31/07/2026, rendimento R$870,24 (03/07 a 28/07). Era R$100.476,11.
  reservaRetiradaProgramada: { data: '03/08/2026', valorProjetado: 791.73, motivo: 'Rendimento do mês (IOF zera aos 30 dias), retirar pra manter Reserva em R$100.000,00' },
  btgNecton: 14779.62, // ATUALIZADO 31/07/2026 (V210): print BTG, LFTS11, 94 cotas, +1,25% resultado com proventos. Era R$14.673,40.
  nectonContaCorrente: 429.75, // ATUALIZADO 31/07/2026 (V210): print BTG "Saldo conta investimento". Era R$429,70.

  // CORRIGIDO 31/07/2026 (V211): removido o campo "previdenciaWartsila" criado por engano ontem
  // (V210) - era o print da conta CORRENTE/salário da Wärtsilä (R$82.983,60), não a Previdência PGBL.
  // A Previdência PGBL de verdade já tinha campo próprio (patPgbl, abaixo) desde antes - confundi os
  // dois prints. Usuário esclareceu: são 3 contas distintas (PGBL, FGTS, conta corrente salário).

  // CORRIGIDO 29/07/2026 (V203, varredura de bugs): aporteBTGProgramado tinha 3 numeros FIXOS
  // (caixaLanceCompleta 3748.74 / rendimentoReserva 791.73 / total 4540.47) que nao acompanhavam a
  // Caixa Lance real - quando o PIX Livelo (R$8,58) entrou hoje, o aporte programado continuou
  // mostrando o valor de 27/07. Agora os 3 derivam: caixaLance atual + LREI ativos + rendimento da
  // Reserva. Recalculado logo apos o VARS fechar (ver bloco de derivados).
  aporteBTGProgramado: { data: '03/08/2026', caixaLanceCompleta: 0, rendimentoReserva: 0, total: 0, condicao: 'Depende dos 2 LREI ativos (Saúde Família + Fatura Mercado Pago) serem quitados antes do aporte' },

  // Salario (cenarios de emergencia) - RECALCULADO 22/07/2026 (V132) com 12 contracheques reais,
  // media/mediana/min usam os 10 meses POS-PROMOCAO (ago/25-mai/26, usuario foi promovido de
  // Tecnico p/ Supervisor no meio do periodo - so os meses no cargo atual contam)
  salarioMedia12M: 20084.86,
  salarioMediana12M: 18283.64,
  salarioMin12M: 7649.62,
  salarioMediaPonderada12M: 17843.58,

  // ===== V137 (23/07/2026, auditoria SSOT - pedido explicito do usuario: "nada com numero digitado,
  // tudo formula e referencia a lista de variaveis, so atualizar em 1 lugar") =====
  // Fatura Wartsila / Mercado Pago (corrige divergencia REAL encontrada: REG.mercadoPago mostrava
  // R$1.751,16 em 2 lugares da tela e REG.balanco.obrigacoes.mercadoPago mostrava R$1.791,93 em outro -
  // mesma fatura, 2 numeros diferentes na tela. Fonte correta: LIVRO_LRMP_TOTAL do ERP, R$1.791,93,
  // 17/07/2026, mais completo/recente que MERCADO_PAGO_FATURA de 16/07 R$1.749,35).
  faturaWartsila: 0, // PAGA 27/07/2026 (V187): R$656,67 via boleto Mercado Pago (Cartão Corporativo B, comprovante #170856844164, 27/07 22:43:39, vencimento 28/07/2026). Era R$656,67 (pendente).
  mercadoPagoFatura: 0, // PAGA 27/07/2026 (V187): R$2.015,58 via boleto (comprovante Mercado Pago, 22:43:39) - fatura completa do ciclo fechado (R$1.791,93) + transporte corporativo (R$266,23) já incluído. Juros R$8,27 repassados à Caixa Lance. ATENÇÃO: existe um 2º boleto duplicado de R$2.015,58 pendente - NÃO PAGAR, é a mesma fatura (aviso do próprio Mercado Pago). Era R$2.058,16.

  // Patrimonio Fisico (Balanco) - eram 5 literais soltos dentro de REG.balanco.fisico
  patCasa: 110000.00,
  patApartamento: 155000.00,
  patJazigo: 11000.00,
  patSolar: 14800.00,
  patCarro: 140000.00,

  // Nao liquido (fora do total financeiro e da Meta do Milhao, so informativo)
  patPgbl: 133472.56, // ATUALIZADO 31/07/2026 (V211): print BTG "Investimentos > Previdência", 100% alocado em Previdência, +R$13.872,82 (12,48%) nos últimos 12 meses. Era R$132.214,74.
  patFgts: 82983.60, // ATUALIZADO 31/07/2026 (V211): print extrato WARTSILA BRASIL LTDA, saldo atualizado em 31/07/2026 (AC CRED DIST RESULTADO + DEPOSITO JUNHO + CREDITO DE JAM/juros). Era R$77.683,60.

  // NOVO 31/07/2026 (V219): Créditos e Cupons - valores confirmados pelo usuário há alguns dias,
  // implementado agora (pendência que tinha ficado parada). Benefícios/cupons, não dinheiro líquido -
  // card separado, não soma no patrimônio.
  creditoUberBalance: 68.69, // ATUALIZADO 31/07/2026: print do app Uber confirmou saldo de R$86,67 ("Personal - Uber Credits") antes desta corrida - diverge levemente do valor estimado anterior (R$84,87, V220), print sempre vence. Corrida de R$17,98 (11:15) paga com este credito (nao cartao, sem impacto em nenhuma caixa/fatura) - saldo apos uso: R$86,67 - R$17,98 = R$68,69.
  creditoShellBox: 200.00,
  creditoKmvIpiranga: 600, // CORRIGIDO 31/07/2026 (V220): usuario confirmou 3 cupons de 200 pontos = 600, nao 503 (numero que eu tinha lido errado do print "Voce tem 503 KMV" - esse era outro saldo, nao a soma dos cupons).

  // NOVO 31/07/2026 (V212): Opções vendidas (puts) na conta BTG - informativo, NÃO É PERDA REALIZADA.
  // R$-108,00 é o valor de mercado para recomprar/encerrar as posições agora, não o resultado final.
  // Estratégia do usuário: deixar vencer. Se PETR4 > R$36,86 e ITUB4 > R$41,82 em 21/08/2026, as puts
  // "viram pó" e o prêmio recebido na venda fica todo como lucro. Não soma no patrimônio líquido -
  // é só uma obrigação em aberto até o vencimento (21/08/2026).
  // NOVO 31/07/2026 (V222): opcoesVendidasValorMercado deixou de ser numero fixo - agora deriva
  // sempre da soma de VARS.opcoesVendidasDetalhe (ver bloco de derivados apos o VARS fechar). Mesmo
  // padrao ja aplicado em todas as outras caixas - evita o mesmo bug de "total desatualizado" que
  // ja aconteceu varias vezes neste sistema.
  opcoesVendidasValorMercado: 0, // PLACEHOLDER - sobrescrito pelo calculo derivado logo abaixo do VARS

  // NOVO 03/08/2026 (Módulo 17 - ROC): parâmetro externo, não deriva de nenhuma TX interna - precisa
  // ser atualizado manualmente de tempos em tempos (mesmo tratamento das tarifas ANEEL, cotações
  // Ipiranga, etc: input de mercado, documentado, nunca forçado a bater com nada do sistema).
  // Fonte: Meelion/B3, Taxa DI de 31/07/2026 = 14,15% a.a. -> ~1,10% a.m. equivalente. Atualizar aqui
  // quando o COPOM mexer no Selic/CDI (a cada ~45 dias) ou quando o usuário informar valor mais recente.
  CDI_MENSAL_ATUAL: 1.10, // % ao mês (referência 31/07/2026)
  CDI_MENSAL_ATUAL_DATA_REF: '31/07/2026',
  // Limites de classificação de status do ROC (Módulo 17, seção "Status") - parametrizados, editáveis.
  ROC_STATUS_LIMITES: { boaAte: 2.0, muitoBoaAte: 4.0 }, // < CDI = Fraca; CDI-boaAte = Boa; boaAte-muitoBoaAte = Muito Boa; > muitoBoaAte = Excelente

  opcoesVendidasDetalhe: [
    // CORRIGIDO 01/08/2026 (notas de corretagem reais, BTG/Necton): premioRecebido JA ERA o valor
    // LIQUIDO (campo "Liquido para [data]" da nota) - nao o bruto. Adicionado premioBruto (= Valor
    // Operacao da nota, quantidade x preco) e custoOperacional real (soma de: taxa liquidacao/CCP +
    // taxa de registro + emolumentos + clearing + ISS), conferido nota a nota: bruto - custo = liquido
    // bate exato nos 3 casos (testado via harness Node antes de subir). Nunca mais confundir - o
    // "Premio recebido" que ja existia sempre foi o liquido de fato creditado na conta.
    { ticker: 'PETRT379', ativo: 'PETR4', tipo: 'Put vendida', valorMercado: -10.00, precoExercicio: 36.86, vencimento: '21/08/2026', quantidade: -200, premioBruto: 160.00, custoOperacional: 5.16, premioRecebido: 154.84, precoMedio: 0.7742, cotacaoAtual: 0.05, resultadoDiario: 6.00, resultadoHistorico: 144.84, precoBlackScholes: null, notaCorretagem: '32928176 (03/07/2026)', exercida: false },
    // CORRIGIDO 03/08/2026 (pedido do usuario): strike confirmado como 36,86 - mesmo strike de
    // PETRT379 (ambas PETR4, o usuario confirmou que sao o mesmo valor pras duas opcoes da Petrobras).
    // Antes: null (pendencia aberta desde V222, ver passagem de turno parte 5). Agora entra na soma
    // consolidada do ROC (Modulo 17) e no capital travado, deixando de ser excluida da carteira.
    { ticker: 'PETRS368W5', ativo: 'PETR4', tipo: 'Put vendida', valorMercado: -1.00, precoExercicio: 36.86, vencimento: '31/07/2026', quantidade: -100, premioBruto: 45.00, custoOperacional: 5.03, premioRecebido: 39.97, precoMedio: 0.3997, cotacaoAtual: 0.01, resultadoDiario: 0.00, resultadoHistorico: 38.97, precoBlackScholes: 0.00, notaCorretagem: '32757842 (25/06/2026)', exercida: false },
    { ticker: 'ITUBT424', ativo: 'ITUB4', tipo: 'Put vendida', valorMercado: -98.00, precoExercicio: 41.82, vencimento: '21/08/2026', quantidade: -200, premioBruto: 180.00, custoOperacional: 2.96, premioRecebido: 177.04, precoMedio: 0.8852, cotacaoAtual: 0.49, resultadoDiario: 60.00, resultadoHistorico: 79.04, precoBlackScholes: 0.33, notaCorretagem: '33025429 (09/07/2026)', exercida: false },
  ],
  // NOVO 03/08/2026 (pedido do usuario, opcao A): "exercida" e um campo MANUAL, igual precoExercicio -
  // o sistema nao tem como saber sozinho se uma put vencida foi de fato exercida pela contraparte
  // (isso so aparece na nota de corretagem/extrato da B3, dias depois do vencimento). Default false
  // (assume "virou po"/expirou OTM, o caso normal). Quando o usuario confirmar via nota que uma
  // posicao vencida foi exercida, troca pra true aqui - a linha se move sozinha pra tabela "Posições
  // exercidas" (mesmo padrao automatico ja usado pra o.vencida, nao precisa mexer em HTML nenhum).
  // CORRIGIDO 31/07/2026 (V222): terceira posição encontrada - PETRS368W5 (100un, vencimento 31/07,
  // hoje mesmo) que eu não tinha registrado. E PETRT379 tinha valor ERRADO (R$180,00, deduzido de
  // outro print) - o print direto da corretora mostra preço médio R$0,7742 × 200un = R$154,84,
  // batendo exato com "Valor investido -R$154,84". Todos os 3 confirmados agora via print direto:
  // PETRT379 R$154,84 + PETRS368W5 R$39,97 + ITUBT424 R$177,04 = R$371,85 total de prêmios.
  // Valor de mercado agregado recalculado: -R$10,00 + -R$1,00 + -R$98,00 = -R$109,00.

  // CORRIGIDO 31/07/2026 (V212): o campo "patContaWartsila" criado ontem por engano era o MESMO FGTS
  // (R$82.983,60) - eu tinha classificado errado como "conta separada de PLR", quando na verdade é o
  // próprio FGTS, só com saldo atualizado. Usuário confirmou: "FGTS Wärtsilä esse é o valor atualizado
  // é só usar ele". Removido o campo duplicado.

  // Passivos (Balanco)
  passivoFinanciamentoCasa: 61326.91,
  passivoConsorcioAuto: 18998.83,

  // Metas que apareciam duplicadas em mais de um lugar do REG
  metaEscolaJulio: 9236.00,   // era literal em REG.patrimonio.metaEscolaJulio E em caixasOperacionais.escolaJulio.meta (2 copias)
  reservaPiso: 9223.66,       // era literal em REG.reserva.piso E em deficitZero.piso[0] (2 copias)

  // Meta de investimento
  metaInvestimentoValor: 0, // CORRIGIDO 25/07/2026 (V151): SOBRESCRITO em recalcularAgregadosDerivados() = 20% do salario do ciclo atual. Era R$6.741,76 (numero fixo, nao batia com "20% do salario" que o proprio card promete no titulo - com o salario real de R$16.819,56, 20% e R$3.363,91, nao R$6.741,76).
  aporteBTGPactual: 0,       // ZERADO 25/07/2026 (V151): era R$11.700,51 de 25/06/2026 (ciclo FECHADO) - o card "Total investido no mês" e mensal, nao acumulado historico. Nenhum aporte BTG feito ainda neste ciclo (25/07-24/08).
  depositoAtivacaoNecton: 0,     // ZERADO 25/07/2026 (V151): era R$1,00 de 10/07/2026 (ciclo FECHADO, TX000045). Mesmo motivo - nenhum deposito Necton feito ainda neste ciclo.
                                     // era um literal composto (11701.51) sem os 2 fatos que o formam

  // Livros razao que sao fonte primaria (nao compostos de nada mais dentro do app.js) - LRW/LRV/LRS/LRR/LRC
  // saem de formula (visaDetalhe+mbDetalhe), LRP/LRCON ja existiam acima. Estes 3 nao tem como derivar
  // de outro dado ja presente no site, entao moram aqui como a UNICA copia editavel.
  livroLRB: 4586.45,   // ATUALIZADO 24/07/2026 (V139): +R$1.986,21 (TXB000010, aporte salario). Era R$2.600,24.
  livroLRCV: 1502.24,  // LIVRO_LRCV_TOTAL do ERP
  livroLRPV: 0,  // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.LRPV_TRANSACOES (soma Entradas-Saidas). CORRIGIDO 26/07/2026 (V172): era numero fixo (-R$295,66) que ja divergia da soma real das 18 linhas do HTML (-R$265,66) mesmo antes de qualquer TX nova - fonte unica agora, nunca mais dessincroniza.
  livroLRCVisaOnly: 0,    // ZERADO 25/07/2026 (V159, confirmado repetidamente pelo usuario): os R$483,43 sao do CICLO ANTERIOR, dinheiro ja recebido/reembolsado, sera pago dia 28 junto com a fatura MB - NAO deve aparecer como pendencia do ciclo atual. Era R$483,43.
  livroLRC: 0,         // PLACEHOLDER - sobrescrito por VARS.livroLRC = soma de LRC_LIMBO_TRANSACOES (V203). Nunca editar aqui - editar o array. Era 215.86 fixo, que ficou desatualizado quando as 3 despesas de viagem entraram no LRC hoje (29/07).
                        // (483.83, extrato real reconciliado V128); os dois numeros sao proximos mas representam conceitos diferentes,
                        // documentado, nao e erro. Antes vivia como literal solto dentro de visaDetalhe.corp.

  // V139 (23/07/2026): secoes 12 "Consorcio casa nova" e 13 "Projeto casa nova" eram 100% texto fixo no
  // HTML, sem NENHUM id, nunca tocadas por hydrate() - o pior caso de numero digitado que existia no site.
  // consorcioCasaPagoPct e consorcioCasaQuitacao sao VALORES DE ORIGEM EXTERNA (extrato real do app
  // PortoBank, ver ERP CONSORCIO_CASA_PAGO_PCT) - divergem um pouco do calculado internamente
  // (pago/total=0,524% vs 0,42% mostrado no extrato); por regra "extrato sempre vence" ficam como
  // input direto, nao forcados a bater com uma formula interna (documentado, nao escondido).
  consorcioCasaCartaCredito: 450000.00,
  consorcioCasaParcela: 1449.45,
  consorcioCasaPagoPct: 0.42,       // extrato real PortoBank 22/07/2026
  consorcioCasaQuitacao: 550601.43, // extrato real PortoBank 22/07/2026
  consorcioCasaProximaAssembleia: '21/08/2026', // CORRIGIDO 31/07/2026 (V215): confirmado pelo usuário via print do app - era 21/07/2026 (hardcoded no HTML, nunca atualizava, alertava "já passou" pra sempre). Agora dinâmico com alerta automático se a data passar de novo.
  metaLanceProjetoCasa: 180000.00,
  consorcioAutoPagoPct: 75.22,      // extrato real app BTG/PortoBank Auto (SALDO_QUITACAO_AUTO do ERP)
  consorcioAutoCartaCredito: 76670.02,
  consorcioAutoQuitacaoValor: 18998.83,
  consorcioCasaParcelasPagas: 2,   // V140: 2 parcelas confirmadas (venc. 15/06 e 15/07/2026) - usado pra derivar o "valor pago" do consorcio

  // V140 (23/07/2026, continuacao da varredura): valores primarios operacionais que ainda viviam como
  // literal solto dentro do REG. Nenhum destes e derivavel de outro dado ja no sistema - sao fatos de
  // origem (extrato, contracheque, decisao do usuario) - mas moram aqui agora como UNICA copia editavel.
  salario: 16819.56,                       // ATUALIZADO 24/07/2026 (V139): salario Wartsila recebido hoje (TX000136). Era R$33.708,78 (excecao do ciclo anterior).
  reembolsoPagaCartaoCorporativo: 483.83,  // extrato real cofrinho "Fatura Visa Infinit" (V128)
  reembolsoPagaMPCorporativo: 1277.88,     // PLACEHOLDER, sobrescrito por snap.cascata.mpCorporativo (variavel por ciclo) - usado na Cascata do Reembolso, sobrescrito por ciclo (zera no ciclo novo, ver CICLO_SNAPSHOTS)
  faturaMPCorporativoPendente: 1544.11, // NOTA 27/07/2026 (V187): a fatura MP em si JÁ FOI PAGA (boleto R$2.015,58, 27/07) - mas esses R$1.544,11 continuam pendentes de REEMBOLSO da Wärtsilä (Recife ida+volta R$1.277,88 + Aeroporto JP R$266,23), independente do pagamento da fatura. Zerar quando a Wärtsilä efetivamente reembolsar, não quando a fatura for paga.
  orcamentoOperacional: 3200.00,

  // ===== FUNDO DE SUAVIZACAO SALARIAL - ATIVACAO FORMAL 29/07/2026 (V205) =====
  // Estrutura aprovada na V90 (3/3 decisoes), pre-configurada na V143, ATIVADA de fato agora com as
  // 3 definicoes que faltavam, confirmadas pelo usuario nesta sessao:
  //   (1) PRO-LABORE: R$11.000/mes (nao R$15.000 da decisao original V90) - razao dada pelo usuario:
  //       "as compras parceladas estao acabando e o valor necessario ira diminuir". Conservador: sobra
  //       mais excedente pra formar colchao nos meses gordos.
  //   (2) LOCAL: caixinha COMUM do Itau (CC-304). O usuario cogitou a caixa de Limite Garantido do Itau
  //       (que vira limite do cartao e rende), mas foi alertado do conflito: se o dinheiro estiver sendo
  //       usado como limite, fica travado ate a fatura ser paga - exatamente no mes magro em que o fundo
  //       precisaria ser sacado. Optou por caixa normal, mantendo o fundo sempre liquido.
  //   (3) MODO OPERACIONAL: passa a reagir ao pro-labore fixo, nao ao salario bruto (ja implementado
  //       na V143, ver REG.operacional.excedenteOuComplementoProLabore).
  // COMO FUNCIONA: mes com salario ACIMA de R$11.000 -> excedente entra aqui. Mes ABAIXO -> a conta
  // cobre a diferenca e o orcamento operacional nao muda. Objetivo: parar a oscilacao do Modo
  // Operacional causada pela variacao do salario (media R$20.084 / mediana R$18.283 / minimo R$7.649).
  proLaboreFixo: 11600.00, // ATUALIZADO 03/08/2026: era 11000.00
  // NOVO 03/08/2026: meta oficial do Fundo de Suavizacao Salarial (CC-304). Funcao do fundo: absorver
  // a OSCILACAO do pro-labore (nao imprevisto - isso e papel da Reserva de Emergencia, R$100k, intocada).
  // Calculo (usuario): pior deficit mensal = proLaboreFixo - menor salario possivel (R$7.667,73, cenario
  // "fica em casa" sem periculosidade) = R$3.932,27/mes. Cobertura de 3 meses ruins seguidos = R$11.796,81.
  // Arredondado para a meta MINIMA das 3 opcoes apresentadas (12k/15k/20k) - usuario confirmou 12k.
  metaSuavizacao: 12000,
  SUAVIZACAO_SALDO_INICIAL: 0, // conta comeca zerada (decisao 3/3 da V90)
  SUAVIZACAO_TRANSACOES: [
    // Vazio na ativacao. O salario deste ciclo (R$16.819,56) foi recebido e 100% distribuido em 24/07,
    // ANTES da ativacao formal - o excedente sobre o pro-labore ja foi para Caixa Lance/outras caixas,
    // nao para ca. A partir do PROXIMO salario (25/08), o excedente passa a entrar aqui de fato.
    // Formato: { tx:'TXxxx', data:'dd/mm', nome:'Excedente do salario de [mes]', tipo:'Entrada', valor:N }
    // ou { ..., nome:'Complemento do pro-labore (mes magro)', tipo:'Saída', valor:N }
  ],
  contaSuavizacao: 0, // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar SUAVIZACAO_TRANSACOES.
  coberturaGarantida: 0, // OBSOLETO (V175) - nunca mais usado diretamente, ver coberturaGarantidaConfirmada abaixo.
  coberturaGarantidaConfirmada: 0, // NOVO 26/07/2026 (V175): so preenchido quando o USUARIO confirmar explicitamente "coloquei R$X na caixa Y cobrindo Z" - nunca calculado por formula automatica. Zerado por padrao ate essa confirmacao existir.
  tetoOficial: 2000.00,                    // meta oficial (Aporte=Meta-Saldo), nao muda com tolerancia temporaria
  tolerenciaTemp: 1500.00,                 // tolerancia temporaria ate fim do ciclo (viagem familia Vanessa)
  caixaVariavelPendenteProximoCiclo: 0,     // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO, pedido do usuario): compras no Mastercard Black feitas DEPOIS do fechamento da fatura MB (dia 22) mas AINDA dentro do ciclo financeiro atual (ate dia 25) - a fatura so cobra no mes seguinte, entao nao contam no CAIXA_VARIAVEL_COMPROMETIDO deste ciclo (evita inflar indevidamente um ciclo que ja esta fechando). Ficam represadas aqui e sao pre-debitadas do orcamento da Caixa Variavel do PROXIMO ciclo na virada do dia 25 (ver recalcularAgregadosDerivados() e o card "Pendente para o próximo ciclo" no Simulador). Zerado ate agora - nenhuma compra nessa janela neste ciclo (23/07/2026).
  // CORRIGIDO 23/07/2026: secao 18 (Operacoes P2P) do site era 100% texto hardcoded, nunca tinha sido
  // ligada ao REG - "Creditos restantes" mostrava "8/10" e "Lucro realizado" R$9,00, desatualizados desde
  // a V136 (22/07/2026), quando TXP2P0003 (venda de 2 creditos ao Elcio) mudou os numeros reais para
  // 6/10 restantes e R$27,00 de lucro. Agora vem do VARS, igual ao resto do sistema.
  p2pCapitalTotal: 110,           // = P2P_CAPITAL_TOTAL do ERP
  p2pCreditosTotal: 10,           // = P2P_CREDITOS_TOTAL
  p2pCreditosRestantes: 6,        // = P2P_CREDITOS_RESTANTES (V136: 9-1-2=6, era 8 no site)
  p2pCreditosVendidos: 3,         // = P2P_CREDITOS_VENDIDOS (TXP2P0002+TXP2P0003)
  p2pPrecoCompra: 11,             // = P2P_PRECO_COMPRA (110/10)
  p2pPrecoVenda: 20,              // = P2P_PRECO_VENDA
  p2pLucroRealizado: 27,          // = P2P_LUCRO_REALIZADO (V136: R$9+R$18=R$27, era R$9 no site)
  suporteCoIrmaEventos: 167.40,            // Eventos->Variavel, mesmo proposito (visita familia Vanessa), nao e LREI

  // V140: componentes de visaDetalhe/mbDetalhe/totalOpDetalhe que ainda eram literal solto
  visaLRWHistorico: 0,      // ZERADO 25/07/2026 (V147): confirmado pelo usuario - eram compras VARIAVEIS UNICAS no Visa Infinite ("compras unicas e pagou acabou"), nao recorrencia/assinatura. Ja foram pagas na fatura de julho (ciclo fechado), nao repetem no ciclo novo. Migracao de compras variaveis para o Mastercard Black e definitiva desde 23/07/2026 (fechamento da fatura MB). Era R$2.139,45.
  visaLRRConfirmado: 0,     // ZERADO 25/07/2026 (V159): usuario confirmou migracao final e completa de TODAS as recorrencias para o Mastercard Black. Nenhuma recorrencia resta no Visa Infinite. Era R$1.106,53.
  visaLRSConfirmado: 0,      // ZERADO 25/07/2026 (V159): usuario confirmou migracao final e completa de TODAS as assinaturas para o Mastercard Black (incluindo IFood/Vanessa, Meli+, Amazon Prime Canais, que ainda faltavam). Nenhuma assinatura resta no Visa Infinite. Era R$429,31.
  visaLRVHistorico: 0,       // REVERTIDO 30/07/2026 (V207): TX000176 (Drogasil, cartão 6351) nunca foi do Visa - erro de V201, corrigido. Cartão 6351 é Mastercard Black da Vanessa (tabela oficial). Era R$132,26 (errado).
  visaNaoReconciliado: 0,     // RESOLVIDO 23/07/2026: o residuo de R$49,81 foi auditado linha-a-linha contra a fatura Bradesco real (Visa Infinite, fecha 16/07/2026, todos os 4 cartoes - 4844/2773/0026/4845). Causa raiz identificada: VIVO estava R$88,00 abaixo do real (V111 usou config teorica em vez da fatura - revertido) + 2 compras nunca lancadas (Amazon Prime Canais R$19,99 e Amazon Prime Aluguel R$9,99). Substituido o metodo de reconciliacao: antes ancorado no "Total da fatura" (saldo corrente, contamina com pagamentos/saldo anterior de ciclos passados) - agora e a SOMA AUDITADA das 7 partes (parcelas+consorcios+wallace+recorrencias+corp+assinaturas+vanessa), cada uma conferida contra a fatura linha a linha. CARTAO_INFINITE_TOTAL_COMPROMETIDO recalculado: R$9.160,07 exato (soma das 7 partes corrigidas, vanessa ja inclui TX131).
  mbLRWConfirmado: 1177.58,       // ATUALIZADO 04/08/2026 (parte 68): +R$17,00 (TX000202, MP *FESTA, notificação Itaú cartão 1371 às 17h03 - conta consolidada 2250). Era R$1.160,58 (parte 67): +R$60,90 (TX000201, PANIFICADORA, notificação Itaú Personnalité Black Pontos cartão 1371 às 16h37 - conta consolidada 2250, ver parte 66). Era R$1.099,68 (CORRIGIDO 04/08/2026, mesmo gap de propagação detalhamento->agregado, usuário achou pelo print da Seção 15): +R$206,48 (TX000192 R$20,00 Drogaria Benif + TX000195 R$20,14 Uber Gabriela/exceção-LRW + TX000196 R$42,28 H57Store + TX000197/198/199 R$51,69+R$51,69+R$20,68 ANTHROPIC/assinatura Claude, todas cartão MB, lançadas em SWP_INPUT_TX entre 02-03/08 mas nunca propagadas pra este agregado - confirmado pelo usuário que as 3 cobranças Anthropic são reais, não duplicidade). Bate exato com o total de 13 lançamentos (R$1.099,68) mostrado ao vivo na Seção 15. Era R$893,20. ATUALIZADO 01/08/2026: +R$32,06 (TX000188, Amazon - Repelente Bebê, cartão virtual 4628). Era R$861,14 (31/07): +R$26,14 (TX000184/185/186, H57Store x3, cartão NOVO 1371, substitui 2244). Era R$835,00: +R$227,00 (TX000183, Tapiocaria Irmão Firmi, cartão físico 2244). Era R$608,00 (29/07, V199).
  mbLRRConfirmado: 1279.65,        // RECONSTRUIDO 25/07/2026 (V159): TODAS as recorrencias migradas para o MB. = LIVRO_LRR_TOTAL (Vivo 435+Brisanet 113,13+Digna 152,41+CampoSanto 77,79+NewCar 59,99+Faculdade 441,33). Era R$614,45 (parcial, so as que ja tinham "cartao virtual" explicito).
  mbLRSConfirmado: 623.10,        // ATUALIZADO 04/08/2026 (parte 64): +R$110,00 (TX000200, ANTHROPIC*CLAUDE SUB, notificação Itaú Personnalité Black Pontos cartão MB 4628 às 10h21, compra internacional aprovada - valor base, SEM IOF/taxas cambiais ainda: Itaú avisou 3,38% de IOF a mais na fatura, valor final ~R$113,72, conferir quando a fatura fechar). Renovação mensal da assinatura Claude (já existia TXS000002, 12/07, mesmo serviço, ciclo anterior). Era R$513,10 (28/07/2026, V196): +R$39,99 (TX000171, ChatGPT, compra internacional, valor base sem IOF/taxas cambiais - conferir na fatura). Era R$473,11 (25/07, V159): TODAS as assinaturas migradas para o MB (IFood, Meli+, Amazon Canais confirmadas). = LIVRO_LRS_TOTAL. Era R$43,80 (parcial).
  mbLRVConfirmado: 304.70,         // ATUALIZADO 03/08/2026: +R$11,50 (TX000194, Uber DL*UberRides, cartão virtual MB 4628, Vanessa - regra fixa de Uber). Era R$293,20 (03/08): +R$12,23 (TX000193, Uber DL*UberRides, cartão virtual MB 4628, Vanessa - regra fixa de Uber). Era R$280,97 (01/08): +R$50,00 (TX000191, MP *TIORAFAKIDS, corte de cabelo do Júlio, cartão não especificado - assumido 6351 Mastercard Black da Vanessa). Era R$230,97: +R$6,43 (TX000180, Uber DL*UberRides, cartão virtual MB 4628, Vanessa - padrão default). Era R$224,54: +R$5,06 (TX000179, Uber DL*UberRides, cartão virtual MB 4628, Vanessa). Era R$219,48 (30/07, V207): +R$132,26 (TX000176, Drogasil, cartão 6351) - nunca tinha entrado aqui, foi lançada por engano no Visa Infinite (V201). Cartão 6351 é Mastercard Black da Vanessa (tabela oficial de cartões). Era R$87,22 (29/07, V201): +R$19,65 (TX000177, Uber, cartão MB 4628). Era R$67,57 (28/07, V195): +R$11,12 (TX000168, Uber) +R$8,08 (TX000169, H57Store). Era R$48,37 (V194): +R$12,42 (TX000167, Uber, pré-autorização). Era R$35,95 (25/07, V161): TX000154 (24/07, R$30,97) + TX000156/157 (25/07, R$2,49x2).
  mbLRCConfirmado: 0,        // PLACEHOLDER - sobrescrito por VARS.mbLRCConfirmado = VARS.livroLRC (V223). Nunca editar aqui - editar o array LRC_LIMBO_TRANSACOES. Era R$297,31 fixo (duplicava livroLRC manualmente).
  totalOpBoletos: 2600,           // APORTE_BOLETOS (nao o total bruto do livro LRB)
  totalOpAportesPat: 1893.34,     // Aportes Patrimoniais do ciclo
  totalOpProvMP: 0,          // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.PARCELAMENTOS_MP (soma dos ATIVO). Nunca editar diretamente.

  // V140: demais primarios soltos no REG (cenarios/estimador)
  liquidoProjetadoProximoCiclo: 16048.51,  // Estimador de Salario - ciclo Ago/26
  liquidoSemTrabalhar: 7667.73,            // REGRA_CENARIO_FICOU_EM_CASA
  desvioPadraoSalario: 9273.21,
  seguroEmplacamentoAporte: 425,
  escolaJulio2027Aporte: 839.64,

  // V141 (23/07/2026, fechamento da varredura): ultimos primarios soltos encontrados
  reembolsoCicloTotal: 4914.98,       // Recebidos (ja inclui TED 21/07) + A Receber (0) - regra V50
  fluxoSaidas: 14819.89,
  fluxoResultado: 21318.48,
  cenarioMesesBonsMedia: 29424.00,    // "Meses bons (media)" no grafico de cenarios de salario

  // Calculadora Energia Solar (fatura Energisa Jun/2026, real)
  faturaEnergisaValor: 322.99,
  faturaEnergisaKwh: 304,
  consumoMinimoComSolarKwh: 30,
  taxaMinimaEnergisa: 38.00,

  // NOVO 31/07/2026: Rateio de credito solar por casa (Wallace/Irma), baseado no medidor bidirecional
  // da casa da mae (codigo 03=consumido da rede, codigo 103=injetado na rede). Formulas e constantes
  // definidas em Base_Calculo_Rateio_Solar.md (documento do usuario). Medidor nunca zera - acumula
  // desde data_ativacao (21/07/2026) indefinidamente; cada leitura nova e comparada com essa data fixa,
  // nao com a leitura anterior (salvo calculo explicito de delta entre 2 leituras).
  solarDataAtivacao: '2026-07-21',
  solarRateioWallace: 0.71,
  solarRateioIrma: 0.29,
  // NOVO 01/08/2026 (pedido do usuario): premissa de quanto cada categoria da fatura Energisa e
  // efetivamente compensada pelos creditos de energia solar (Lei 14.300/2022, Marco Legal da GD).
  // Energia/Transmissao: 100% compensados (creditos abatem 1:1). Iluminacao Publica (COSIP) e
  // Encargos setoriais: NUNCA compensados por lei, sempre sobram na fatura mesmo com credito de sobra.
  // CORRIGIDO 01/08/2026 (2a correcao, usuario apontou erro conceitual meu): o Fio B NAO e a categoria
  // "Distribuicao" inteira - e so UMA FATIA dela (Fio A + Fio B + Encargos + Perdas compoem a TUSD;
  // "Distribuicao" no app da Energisa e so a parte de infraestrutura fisica). O Fio B representa
  // ~28% a 30% do valor da tarifa TE+TUSD (usando 28%, extremo mais conservador/otimista pro usuario).
  // Cobranca 2026 confirmada: 60% do Fio B. Logo, cobranca real sobre a categoria Distribuicao =
  // 60% x 28% = 16,8% (nao 60% direto como eu tinha calculado antes, errado) - ou seja, 83,2% da
  // Distribuicao continua sendo de fato compensada pelos creditos solares.
  FIO_B_PCT_DA_DISTRIBUICAO: 28, // fatia do Fio B dentro da categoria "Distribuicao" da fatura (varia 28-30% na Energisa PB, usado o extremo mais conservador)
  FIO_B_COBRANCA_2026_PCT: 60, // confirmado - cronograma da Lei 14.300 pra sistemas conectados apos 07/01/2023 (15%/23, 30%/24, 45%/25, 60%/26, 75%/27, 90%/28-29)
  // NOVO 01/08/2026: fallback estatico da composicao tarifaria por unidade (prints do app Energisa,
  // 01/08/2026) - o Supabase tem a copia "viva" (ENERGISA_TARIFA_COMPOSICAO) que sobrescreve isto via
  // Object.assign(VARS, dr) no carregamento; mantido aqui so pra o card nao ficar vazio se o banco
  // estiver fora do ar. Editar via Supabase normalmente, nao aqui.
  ENERGISA_TARIFA_COMPOSICAO: {
    apartamento_wallace: { uc:'1.994.775.053-05', historico:{ mai26:270.10, jun26:322.99, jul26:367.36 }, composicao_pct:{ energia:28, impostos:22, distribuicao:22, iluminacao:12, encargos:12, transmissao:5 } },
    casa_wellida: { uc:'2.064.202.053-60', historico:{ mai26:141.82, jun26:106.23, jul26:94.45 }, composicao_pct:{ energia:28, impostos:22, distribuicao:22, iluminacao:12, encargos:12, transmissao:5 } },
    casa_mae: { uc:'573.702.053-77', fatura_jul26_valor:203.61, fatura_jun26_valor:301.54, composicao_pct:{ energia:28, impostos:22, distribuicao:22, iluminacao:12, encargos:12, transmissao:5 } },
  },
  solarConsumoDiarioWallace: 291/30,  // 9,70 kWh/dia (291 kWh/mes historico)
  solarConsumoDiarioIrma: 119/30,     // 3,97 kWh/dia (119 kWh/mes historico)
  solarGeracaoDiariaEstimada: 25.6,   // kWh/dia bruto (app SAJ), usado so como fallback quando faltar leitura real
  // NOVO 31/07/2026: quando o usuario informar o valor REAL da fatura pos-solar de um mes (a partir da
  // fatura de 21/08), a chave (mesmo nome usado em mesesPares: 'Jul','Ago',...) entra aqui e passa a
  // valer sobre o calculo/projecao daquele mes no grafico da secao 09. Comeca vazio - nenhuma fatura
  // pos-solar chegou ainda.
  ENERGIA_FATURAS_REAIS: {},
  // NOVO 01/08/2026: consumo mensal historico da Irma (mesmo padrao do kwhAnoAnterior do Wallace, secao
  // 09) - nao existe historico mes-a-mes dela ainda, entao comeca com a media fixa (119) repetida nos 12
  // meses. Quando o usuario informar consumo real de um mes especifico dela, entra aqui (chave = nome do
  // mes) e passa a valer sobre a media.
  SOLAR_CONSUMO_IRMA_MES_REAL: {},
  // NOVO 01/08/2026: quando um mes de leitura solar FECHA (o usuario confirma o total gerado naquele mes
  // inteiro, nao so uma leitura parcial), o valor entra aqui (chave = nome do mes, valor = {wallace, irma}
  // em kWh) e passa a valer sobre a estimativa. O mes atual (em andamento) usa a ultima leitura parcial
  // diretamente, nao precisa estar aqui.
  SOLAR_CREDITO_MENSAL_REAL: {},
  // NOVO 01/08/2026: consumo mensal REAL dos ultimos 12 meses da Wellida (irma), extraido da fatura
  // Energisa (UC 2.064.202.053-60, Rua Jose Palmeira Filho 580, Jd America), grafico "Consumo Faturado"
  // da propria fatura Jul/2026. Conferido visualmente (rasterizado + ampliado, nao so texto extraido,
  // ordem: Jul/25 a Jun/26). Substitui a media fixa (119) usada como placeholder ate agora.
  solarConsumoIrmaAnoAnterior: [74,70,82,103,127,122,138,142,172,140,100,112], // Jul/25..Jun/26 kWh
  // NOVO 02/08/2026 (pedido do usuario, 2 faturas Energisa da Casa da Mae): consumo historico da
  // unidade geradora (Casa da Mae), mesma janela de 12 meses das outras 2 unidades. Confirmado pelo
  // usuario: Mai/25..Abr/26. Media: 195 kWh/mes.
  solarConsumoMaeAnoAnterior: [171,172,174,175,177,168,201,270,242,210,215,266], // Mai/25..Abr/26 kWh
  // Dados mais recentes (fora da janela de 12 meses acima, guardados a parte): Jun/26 foi o mes de
  // transferencia de titularidade pro nome do usuario (por isso o ciclo de 40 dias, fora do padrao) -
  // nao usado no calculo do consumo medio, so como referencia/contexto.
  solarConsumoMaeRecente: { jun26: {kwh:284, dias:40}, jul26: {kwh:194, dias:30} },
  SOLAR_LEITURAS: [
    // Cada leitura nova enviada pelo usuario (leitura_03 + leitura_103 + data) vira uma linha aqui.
    // dias = data_leitura - solarDataAtivacao. creditoLiquido = leitura103 - leitura03. Resto deriva
    // das formulas da secao 3 do documento base. fonte:'real' (leitura enviada) ou 'estimado' (fallback).
    // CORRIGIDO 01/08/2026 (V250, documento do usuario "SEM ESTIMATIVAS"): novo campo geracaoAcumulada
    // (kWh, leitura REAL do inversor SAJ - "Geracao Total"/"Geracao Acumulada" do app/portal). Enquanto
    // for null, os campos derivados dela (consumoDireto, consumoTotalCasa, autoconsumoPct,
    // dependenciaPct, exportacaoPct) NAO sao calculados - a tela mostra "Dados insuficientes para
    // calculo" em vez de estimar. Nunca mais usar solarGeracaoDiariaEstimada para isso.
    { data:'2026-07-31', dias:10, leitura03:38, leitura103:210, geracaoAcumulada:268.74, geracaoAcumuladaData:'2026-08-01', fonte:'real' }, // NOVO 01/08/2026 (V259): geracaoAcumuladaData rastreia quando ESSE numero foi lido de verdade (o robo da SAJ atualiza isso sozinho todo dia - ver script atualizar_geracao_saj.py), separado da data da leitura 03/103 (manual, so muda quando o usuario manda foto do medidor). Sem isso, consumo direto ficaria cada vez mais errado conforme os dois descasam (geracao andando sozinha, 03/103 parado).
  ],

  // Projecoes "held flat" (meses futuros alem do ultimo recalculado manualmente - repetem o ultimo
  // valor conhecido, mesma logica conservadora ja documentada). Antes: mesmo numero literal 6x em cada
  // array (piso/necessidade/totalOperacional/necessidadeLiquida). Agora: 1 valor, usado via Array.fill.
  pisoHeld: 6979.37,
  necessidadeHeld: 11581.08,
  totalOperacionalHeld: 8381.08,
  necessidadeLiquidaHeld: 0, // PLACEHOLDER - sobrescrito por VARS.necessidadeLiquidaHeld = totalOperacionalHeld + orcamentoOperacional - coberturaGarantidaConfirmada (V225). Nunca editar aqui direto. Era R$10.626,18 fixo (editado em sessao separada de totalOperacionalHeld, 25/07 vs 19/07 - embutia Cobertura Garantida futura de ~R$954,90 que nunca existiu de fato, ver achado do usuario 31/07/2026).

  // V142: faltavam estes 3 (a formula em REG.passivosPatrimoniais ja os referenciava, mas eles nunca
  // tinham sido de fato declarados aqui - erro descoberto pela propria execucao real/harness).
  prestacaoFinanciamentoCasa: 588.66,
  mesesRestantesFinanciamentoCasa: 147,
  parcelaConsorcioAuto: 501.15, // ATUALIZADO 31/07/2026 (V210): extrato BTG/PortoBank confirma R$501,15 (era R$501,50, diferença de arredondamento anterior - extrato sempre vence).
  // MIGRADO 27/07/2026 (V193): provisionadoWartsila migrada para saldo derivado. Historico do saldo
  // do ciclo antigo (R$683,04, confirmado pelo usuario) usado no pagamento de hoje - documentado em
  // V188 apos correcao do erro de V171 (zerada indevida).
  WARTSILA_CAIXA_SALDO_INICIAL: 683.04, // saldo do ciclo antigo, confirmado pelo usuario em 27/07 (V188) - a zerada de 26/07 (V171) tinha sido erro, revertida
  WARTSILA_CAIXA_TRANSACOES: [
    { tx:'BOLETO-MP-27-07', data:'27/07', nome:'Pagamento fatura Wärtsilä (boleto Mercado Pago, comprovante #170856844164)', tipo:'Saída', valor:656.67 },
    { tx:'JUROS-27-07-WARTSILA', data:'27/07', nome:'Juros acumulados (repassados à Caixa Lance)', tipo:'Entrada', valor:27.37 },
  ],
  provisionadoWartsila: 0,  // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar WARTSILA_CAIXA_TRANSACOES.
                                  // excedente = provisionadoWartsila - faturaWartsila

  // V144: aportes mensais das caixas incrementais que ainda eram texto fixo no card (secao 05)
  aporteSaudeFamilia: 135,
  aporteAniversarioJulio: 200,
  // seguroEmplacamentoAporte (425) ja existia acima

  // V144: footer da tabela "PIX diversos" (LRCV) - era texto fixo "Saidas R$527,61 Entradas R$64,00 Liquido -R$463,61"
  pixDiversosSaidas: 0, // ZERADO 25/07/2026 (V152): filtro por ciclo - eram R$527,61 do ciclo FECHADO (26/06-24/07). Nenhuma movimentacao de PIX diversos na Caixa Variavel ainda neste ciclo (25/07-24/08).
  pixDiversosEntradas: 0, // ZERADO 25/07/2026 (V152): mesma logica, era R$64,00 do ciclo fechado.

  // V144: footer LRC (Corporativo Visa Infinite) - "6 lancamentos" era texto fixo, valor ja em VARS.livroLRC
  livroLRCQtdLancamentos: 1, // CORRIGIDO 25/07/2026 (V156): so o corporativo do ciclo ATUAL (TX000158, Outback). Os 6 lancamentos antigos do Visa sao do ciclo fechado, ja cobertos no valor separado pra 28/07. Era 7.

  // ===== V154 (25/07/2026): PARCELAMENTOS ESTRUTURADOS - fonte unica de verdade, espelha 1:1 a aba
  // PARCELAMENTOS_ATIVOS do ERP. Pedido do usuario: "O LR de compras parceladas tem que ser atualizado
  // automaticamente, ir retirando as parcelas pagas igualmente o LR do mercado pago". Antes disso, a
  // tabela HTML (secao 15, paineis LRP/LRMP) era 100% texto fixo, sem nenhuma relacao com os totais
  // usados no calculo (livroLRP/totalOpProvMP) - dois lugares que podiam dessincronizar silenciosamente.
  // Agora a tabela e GERADA por JS a partir destes arrays (ver renderParcelamentos() antes do hydrate),
  // e o total tambem deriva daqui - uma unica fonte, dois usos.
  // Quando um novo ciclo virar: incrementar parcelaAtual de cada item ATIVO; se parcelaAtual>totalParcelas,
  // mudar status para 'QUITADO' (nao remover a linha - mantem rastreabilidade, so sai da soma/exibicao ativa).
  PARCELAMENTOS_VISA: [
    { tx:'TXP000001', data:'23/03', nome:'Teacher Matias', valor:134.14, parcelaAtual:5, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000002', data:'21/03', nome:'DeckFriend', valor:13.03, parcelaAtual:5, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000003', data:'05/12/25', nome:'Korpos Estética', valor:189.99, parcelaAtual:8, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000004', data:'23/05', nome:'RL Artesão', valor:66.83, parcelaAtual:3, totalParcelas:5, status:'ATIVO' },
    { tx:'TXP000005', data:'28/05', nome:'Mercado Livre', valor:38.25, parcelaAtual:3, totalParcelas:4, status:'ATIVO' },
    { tx:'TXP000006', data:'20/05', nome:'Mercado Livre', valor:68.01, parcelaAtual:3, totalParcelas:4, status:'ATIVO' },
    { tx:'TXP000007', data:'18/02', nome:'Mercado Livre MP', valor:48.33, parcelaAtual:6, totalParcelas:6, status:'ATIVO' },
    { tx:'TXP000008', data:'03/07', nome:'Seguro Tokio Marine - Auto', valor:200.99, parcelaAtual:7, totalParcelas:10, status:'ATIVO' }, // CORRIGIDO 26/07/2026 (V172): usuario confirmou parcelado 10x desde Jan/2026, nao a vista. Jul=7/10, 3 restantes (Ago/Set/Out).
    { tx:'TXP000009', data:'31/05', nome:'Aram Beach Hotel', valor:486.64, parcelaAtual:3, totalParcelas:2, status:'QUITADO' }, // era 2/2 (ultima) no ciclo fechado
    { tx:'TXP000010', data:'21/07', nome:'PicPay Wallace Patri', valor:183.47, parcelaAtual:12, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000011', data:'20/05', nome:'Hub Smart Home', valor:72.96, parcelaAtual:3, totalParcelas:2, status:'QUITADO' },
    { tx:'TXP000012', data:'19/05', nome:'Edilson Lourenço', valor:425.00, parcelaAtual:3, totalParcelas:2, status:'QUITADO' },
    { tx:'TXP000013', data:'19/05', nome:'Silmara Macedo', valor:375.00, parcelaAtual:3, totalParcelas:2, status:'QUITADO' },
    { tx:'TXP000014', data:'08/07', nome:'Hotmart Fernando', valor:42.00, parcelaAtual:13, totalParcelas:12, status:'QUITADO' },
    { tx:'TXP000015', data:'13/05', nome:'Kinesioceteos', valor:74.85, parcelaAtual:4, totalParcelas:5, status:'ATIVO' },
    { tx:'TXP000025', data:'06/05', nome:'RBM Relógios', valor:80.97, parcelaAtual:4, totalParcelas:3, status:'QUITADO' },
  ],
  PARCELAMENTOS_MP: [
    { tx:'TXMP000001', nome:'Mercado Livre', valor:56.39, parcelaAtual:4, totalParcelas:6, status:'ATIVO' },
    { tx:'TXMP000002', nome:'Mercado Livre', valor:106.04, parcelaAtual:7, totalParcelas:12, status:'ATIVO' },
    { tx:'TXMP000003', nome:'Mercado Livre', valor:50.40, parcelaAtual:7, totalParcelas:8, status:'ATIVO' },
    { tx:'TXMP000004', nome:'Mercado Livre', valor:68.36, parcelaAtual:7, totalParcelas:6, status:'QUITADO' },
    { tx:'TXMP000005', nome:'Mercado Livre', valor:166.62, parcelaAtual:11, totalParcelas:24, status:'ATIVO' },
    { tx:'TXMP000006', nome:'Mercado Livre', valor:23.66, parcelaAtual:4, totalParcelas:6, status:'ATIVO' },
  ],

  // V159 (25/07/2026): itens corporativos/avulsos do Mercado Pago, com DATA real - permite filtro automatico
  // por ciclo (nunca mais texto fixo tipo "não deve aparecer no ciclo novo" editado a mao). Pedido do usuario:
  // "isso foi do ciclo passado, não deve aparecer no ciclo novo... tem que ser removido automaticamente".
  TRANSACOES_CORPORATIVAS_MP: [
    { tx:'TXMP000007', nome:'Transporte Recife (volta)', valor:638.94, data:'2026-07-02', tipo:'corp' },
    { tx:'TXMP000008', nome:'Transporte Recife (ida)', valor:638.94, data:'2026-06-29', tipo:'corp' },
    { tx:'TXMP000009', nome:'Transporte Aeroporto João Pessoa', valor:266.23, data:'2026-07-23', tipo:'corp' }, // NOVO 26/07/2026 (V167): MP*WALLACELIRA, achado no extrato do app - mesmo TX000152 ja lancado no ERP (adiantamento Caixa Lance).
    { tx:'TXMP000010', nome:'Mercado Livre (avulsa, à vista)', valor:42.58, data:'2026-05-19', tipo:'unico' },
    { tx:'TXMP000011', nome:'PIX Isabel Cristina Barbosa do Nascimento - Transporte corporativo (PicPay, cartão ...8739)', valor:266.23, data:'2026-08-01', tipo:'corp' },
  ],

  // ===== V168 (26/07/2026): FONTE UNICA ESTRUTURADA para os paineis de compras variaveis (LRW, LRV,
  // LRC-limbo, LRCV) - pedido explicito do usuario ("os pix de vanessa nao ta registrado, isso tem que
  // ser automatico, eu estou me irritando de tanto pedir isso"). Antes essas 4 tabelas eram HTML fixo,
  // editado a mao a cada compra nova - toda vez que eu esquecia de atualizar uma delas, ficava
  // desatualizada (exatamente o que aconteceu com TX000159, que ficou faltando na tabela do Wallace).
  // A partir de agora: TODA compra nova entra so aqui (1 lugar), a tabela HTML e gerada sozinha por
  // renderLivrosVariaveis() a cada carga da pagina - nunca mais editar as tabelas na mao.
  LRW_TRANSACOES: [
    { tx:'TX000132', data:'22/07', nome:'Google SunSurveyorApp', obs:'cartão 2244, limbo (pós-fechamento fatura)', valor:56.99 },
    { tx:'TX000159', data:'25/07', nome:'Mercado*MercadoLivre', obs:'cartão virtual 4628 (Kit Eudora+Nasal Wahl+Shampoo+Fone)', valor:551.01 },
    { tx:'TX000183', data:'31/07', nome:'Tapiocaria Irmão Firmi', obs:'cartão físico 2244, extração via DeepSeek/GPT', valor:227.00 },
    { tx:'TX000184', data:'31/07', nome:'H57Store', obs:'cartão físico 1371 (NOVO, substitui 2244), extração via DeepSeek/GPT', valor:18.36 },
    { tx:'TX000185', data:'31/07', nome:'H57Store', obs:'cartão físico 1371 (NOVO, substitui 2244), extração via DeepSeek/GPT', valor:5.59 },
    { tx:'TX000186', data:'31/07', nome:'H57Store', obs:'cartão físico 1371 (NOVO, substitui 2244), extração via DeepSeek/GPT', valor:2.19 },
    { tx:'TX000188', data:'01/08', nome:'Amazon - Repelente para Bebê SBP Baby', obs:'cartão virtual 4628, extração via DeepSeek/GPT', valor:32.06 },
  ],
  LRV_TRANSACOES: [
    { tx:'TX000154', data:'24/07', nome:'H57Store', obs:'cartão 6351, limbo (pós-fechamento fatura)', valor:30.97 },
    { tx:'TX000156', data:'25/07', nome:'H57Store', obs:'cartão 6351', valor:2.49 },
    { tx:'TX000157', data:'25/07', nome:'H57Store', obs:'cartão 6351 (2ª compra distinta, mesmo minuto)', valor:2.49 },
    { tx:'TX000167', data:'28/07', nome:'DL*UberRides', obs:'cartão virtual 4628 (atípico - esse cartão é só p/ assinaturas/recorrências pela política, conferir se não foi engano na hora de passar), pré-autorização', valor:12.42 },
    { tx:'TX000168', data:'28/07', nome:'DL*UberRides', obs:'cartão virtual 4628, padrão Uber=Vanessa (sem nome visível/aviso em contrário)', valor:11.12 },
    { tx:'TX000169', data:'28/07', nome:'H57Store', obs:'cartão virtual 4628, titular VANESSA G GALDINO no comprovante', valor:8.08 },
    { tx:'TX000175', data:'29/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber de Vanessa (confirmado pelo usuário)', valor:12.02 },
    { tx:'TX000176', data:'29/07', nome:'Drogasil 2305', obs:'cartão 6351, Vanessa', valor:132.26 },
    { tx:'TX000177', data:'29/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber de Vanessa (confirmado pelo usuário)', valor:19.65 },
    { tx:'TX000179', data:'31/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber de Vanessa (confirmado pelo usuário, extração via DeepSeek/GPT)', valor:5.06 },
    { tx:'TX000180', data:'31/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber padrão Vanessa (sem nome visível/aviso em contrário, extração via DeepSeek/GPT)', valor:6.43 },
    { tx:'TX000191', data:'01/08', nome:'MP *TIORAFAKIDS', obs:'Corte de cabelo do Júlio (confirmado pelo usuário). Cartão não especificado no comprovante, só titular VANESSA G GALDINO - assumido Mastercard Black 6351 (cartão ativo dela) até confirmação.', valor:50.00 },
  ],
  LRC_LIMBO_TRANSACOES: [
    { tx:'TX000158', data:'25/07', nome:'Outback Vitória', obs:'cartão MB 2244, corporativo (reembolsável)', valor:215.86 },
    { tx:'TX000161', data:'26/07', nome:'Super Bom Supermercado', obs:'cartão MB 2244, corporativo (reembolsável)', valor:28.49 },
    { tx:'TX000172', data:'29/07', nome:'Antonio Domingos Angel', obs:'cartão MB 2244, lanchonete estrada Campos→Vitória, corporativo (reembolsável) - movido do LRW a pedido do usuário', valor:9.00 },
    { tx:'TX000173', data:'29/07', nome:'Antonio Domingos Angel', obs:'cartão MB 2244, lanchonete estrada Campos→Vitória (2ª compra), corporativo (reembolsável) - movido do LRW', valor:3.00 },
    { tx:'TX000174', data:'29/07', nome:'Conveniência Capuaba', obs:'cartão MB 2244, corporativo (reembolsável) - movido do LRW', valor:40.96 },
  ],
  LRCV_TRANSACOES: [
    { tx:'TX000162', data:'26/07', tipo:'PIX Saída', obs:'Poda das bananeiras (Ednaldo Caetano da Silva)', valor:100.00 },
    { tx:'TX000190', data:'01/08', tipo:'PIX Saída', obs:'Água mineral (Cleston da Silva, comprovante E10573521202608011254YTMcGt1oqXh)', valor:22.00 },
  ],
  // TX000164/165 (27/07/2026): Conduta pediátrica de Júlio. PIX de R$300,00 saiu direto do
  // Mercado Pago do Wallace para Vanessa (NÃO passou pela PIX Geral Vanessa/PGV - correção de erro
  // anterior, onde eu tinha inventado um passo intermediário de reforço de R$222 via Caixa Variável
  // que o usuário nunca confirmou). Coberto por: Saúde Família (saldo real R$135,06) + empréstimo
  // Caixa Lance (R$164,94, LREI0002 ativa). Reembolso do plano de saúde volta para Caixa Saúde Família.
  // RENOMEADO 29/07/2026 (V199): era LRC_CONDUTA_JULIO - nome errado, isso e historico da conduta de
  // Julio, nao o livro LRC (Corporativo) de verdade. LRC_TRANSACOES (abaixo) e o livro corporativo real.
  HISTORICO_CONDUTA_JULIO: [
    { tx:'TX000164', data:'27/07', nome:'PIX Conduta Júlio - pediatra (Mercado Pago Wallace → Vanessa)', tipo:'Saída', valor:300.00 },
    { tx:'TX000165', data:'27/07', nome:'Empréstimo Caixa Lance → Saúde Família (LREI0002 ativa)', tipo:'Empréstimo', valor:164.94 },
  ],

  // CORRIGIDO 29/07/2026 (V200): o array LRC_TRANSACOES criado ha pouco (V199) era ORFAO - duplicava
  // TX000158/161 que ja existiam em LRC_LIMBO_TRANSACOES (o array REAL, ja conectado a tela via
  // preencher('lrcLimboTbody', ...)). As 3 despesas de viagem (TX000172/173/174) foram movidas para
  // dentro do LRC_LIMBO_TRANSACOES de verdade, acima - nao existe mais LRC_TRANSACOES separado.

  // V192 (27/07/2026): SAUDE_FAMILIA_TRANSACOES - primeira caixa migrada para SALDO DERIVADO, a pedido
  // explicito do usuario ("editaveis, auditaveis") apos bug real: caixaSaudeFamilia ficou travada em
  // R$135,00 por 3 horas depois do gasto de R$135,06 (27/07), porque o registrador de saldo era numero
  // solto, nunca conectado ao array de transacoes. Daqui pra frente, esta caixa NUNCA mais tem saldo
  // editado direto - sempre SAUDE_FAMILIA_SALDO_INICIAL_CICLO + soma(entradas) - soma(saidas) deste array.
  // Historico deste ciclo (25/07-24/08): aporte de 24/07 na verdade e do ciclo anterior (recebido 1 dia
  // antes da virada oficial, ja documentado em outras caixas como "salario adiantado por cair em sabado").
  SAUDE_FAMILIA_TRANSACOES: [
    { tx:'TX000147', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:135.00 },
    { tx:'TX000166', data:'27/07', nome:'Conduta pediátrica de Júlio (saldo próprio, complementado por empréstimo Caixa Lance)', tipo:'Saída', valor:135.06 },
  ],


  // V400 (03/08/2026, Etapa 1 - Inbox Financeira): componente central do projeto de automacao de
  // captura. Continuo, nao filtrado por ciclo (mesma classe de LREI/boletos - ver Politicas secao 20) -
  // um item pendente nao "expira" na virada do dia 25. Comeca vazio: nenhuma automacao de captura
  // (Pluggy/Email/Telegram/OCR/Corretoras, Etapas 2-9 do brief) esta implementada ainda nesta sessao
  // (sem acesso a rede/conectores externos aqui) - populado manualmente via inboxAdicionarItem() ate
  // essas automacoes existirem. Status parado em PENDENTE ate uma decisao humana (aprovar/rejeitar);
  // aprovacao NAO lanca automaticamente no livro razao (isso seria "lançar transação sem confirmação",
  // proibicao explicita do brief) - so marca a intencao, o lancamento real continua seguindo o fluxo
  // manual ja existente (Claude classifica e lanca, referenciando o ID do item da Inbox por rastreio).
  INBOX_FINANCEIRA: [
  ],

  // NOVO 04/08/2026 (parte 57, pedido explicito do usuario: "precisamos manter os livros dos ciclos
  // passados"): HISTORICO_ERP_TODOS_CICLOS - copia integral de SWP_INPUT_TX (ERP_WALLACE_LIRA_V11.xlsx),
  // TODOS os lancamentos com VALOR preenchido (222 linhas, qualquer livro/ciclo, TX000001 em diante,
  // 19/06/2026 a 03/08/2026 nesta extracao) - nao so os 7 livros AO VIVO do ciclo atual que
  // reconciliarTransacoesPluggy() ja usava. Motivo: transacao antiga da Pluggy "nao bater" com os
  // livros ao vivo NAO significa que nao tem registro - so significa que o registro dela mora num
  // ciclo fechado, que o site so mostra resumido (CICLO_SNAPSHOTS, decisao de V174: "o site so deveria
  // mostrar o que e do seu ciclo"). Este array e so para RECONCILIACAO (comparar valor), nao para
  // exibicao - resolve o falso-positivo "sem registro" sem precisar duplicar a exibicao completa de
  // cada ciclo fechado no site. Fonte: SWP_INPUT_TX, extraido em 04/08/2026 - snapshot pontual, nao se
  // atualiza sozinho quando a planilha muda (mesma natureza estatica de todo o resto do VARS).
  HISTORICO_ERP_TODOS_CICLOS: [
    {tx:'TX000001', data:'19/06/2026', livro:'LRW', nome:'MAGALU', valor:66.89},
    {tx:'TX000002', data:'20/06/2026', livro:'LRV', nome:'UBER', valor:21.98},
    {tx:'TX000003', data:'22/06/2026', livro:'LRV', nome:'UBER', valor:21.74},
    {tx:'TX000004', data:'25/06/2026', livro:'LRV', nome:'UBER', valor:24.78},
    {tx:'TX000005', data:'27/06/2026', livro:'LRW', nome:'TAPIOCA', valor:81.0},
    {tx:'TX000006', data:'27/06/2026', livro:'LRW', nome:'MERCADO_CLOVIS', valor:8.5},
    {tx:'TX000007', data:'27/06/2026', livro:'LRW', nome:'ABASTECE_AI', valor:103.0},
    {tx:'TX000008', data:'28/06/2026', livro:'LRW', nome:'KI_FRANGO', valor:64.0},
    {tx:'TX000009', data:'28/06/2026', livro:'LRW', nome:'ALEKS_BOLOS', valor:44.0},
    {tx:'TX000010', data:'28/06/2026', livro:'LRW', nome:'CLAUVENIENCIA', valor:45.0},
    {tx:'TX000011', data:'01/07/2026', livro:'LRV', nome:'UBER', valor:9.21},
    {tx:'TX000012', data:'04/07/2026', livro:'LRW', nome:'MENDONCA_PASTEIS', valor:75.97},
    {tx:'TX000013', data:'04/07/2026', livro:'LRW', nome:'H57_STORE', valor:9.19},
    {tx:'TX000014', data:'05/07/2026', livro:'LRW', nome:'ELIAS_ANDRADE', valor:120.0},
    {tx:'TX000015', data:'05/07/2026', livro:'LRW', nome:'TAMYLLA', valor:32.0},
    {tx:'TX000016', data:'05/07/2026', livro:'LRW', nome:'TAMYLLA', valor:36.0},
    {tx:'TX000017', data:'05/07/2026', livro:'LRW', nome:'PIZZA_NOSTRA', valor:241.0},
    {tx:'TX000018', data:'06/07/2026', livro:'LRW', nome:'BROTHERS_CLUB', valor:85.0},
    {tx:'TX000020', data:'07/07/2026', livro:'LRW', nome:'HORTIFRUTI', valor:10.0},
    {tx:'TX000021', data:'07/07/2026', livro:'LRW', nome:'H57_STORE', valor:9.99},
    {tx:'TX000026', data:'10/07/2026', livro:'LRW', nome:'PANIFICADORA', valor:23.8},
    {tx:'TX000027', data:'10/07/2026', livro:'LRW', nome:'AMAZON_PRIME_VIDEO', valor:9.99},
    {tx:'TX000029', data:'11/07/2026', livro:'LRW', nome:'MADOSKA_SORVETES', valor:127.43},
    {tx:'TX000030', data:'12/07/2026', livro:'LRW', nome:'PASTIANNE_RESTAURANTE', valor:126.28},
    {tx:'TX000086', data:'22/06/2026', livro:'LRV', nome:'PAGUE_MENOS', valor:75.87},
    {tx:'TX000031', data:'10/07/2026', livro:'LRW', nome:'H57STORE', valor:40.98},
    {tx:'TX000032', data:'11/07/2026', livro:'LRW', nome:'SONIA_MARMITARIA', valor:5.0},
    {tx:'TX000019', data:'06/07/2026', livro:'LRV', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:31.7},
    {tx:'TX000023', data:'09/07/2026', livro:'LRV', nome:'DORGIVAL', valor:21.3},
    {tx:'TX000024', data:'10/07/2026', livro:'LRV', nome:'H57STORE', valor:9.99},
    {tx:'TX000028', data:'10/07/2026', livro:'LRV', nome:'H57STORE', valor:9.88},
    {tx:'TXR000001', data:'22/06/2026', livro:'LRV', nome:'CAROLINA', valor:65.0},
    {tx:'TXR000002', data:'19/06/2026', livro:'LRV', nome:'PANIFICADORA', valor:22.0},
    {tx:'TXR000004', data:'28/06/2026', livro:'LRV', nome:'H57_STORE', valor:15.97},
    {tx:'TXR000005', data:'12/07/2026', livro:'LRV', nome:'DROGARIA_DROGAVISTA', valor:45.19},
    {tx:'TXR000006', data:'07/07/2026', livro:'LRV', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:34.0},
    {tx:'TXR000007', data:'10/07/2026', livro:'LRW', nome:'H57STORE', valor:9.99},
    {tx:'TX000087', data:'27/06/2026', livro:'LRW-I', nome:'A_SOUZA_FECHINE_CIA', valor:103.0},
    {tx:'TX22001', data:'29/06/2026', livro:'LRC', nome:'LMSERVICE', valor:102.96},
    {tx:'TX22002', data:'29/06/2026', livro:'LRC', nome:'PORTO_GALLO', valor:42.56},
    {tx:'TX22003', data:'01/07/2026', livro:'LRC', nome:'CAFE_DA_VILLA', valor:150.0},
    {tx:'TX22004', data:'02/07/2026', livro:'LRC', nome:'LA_URSA', valor:146.62},
    {tx:'TX22005', data:'02/07/2026', livro:'LRC', nome:'CACAU_SHOW_CAFE', valor:19.8},
    {tx:'TX22006', data:'02/07/2026', livro:'LRC', nome:'CACAU_SHOW_SORVETE', valor:21.49},
    {tx:'TX28001', data:'27/06/2026', livro:'LRCV', nome:'GERONCIO_BORGES_ANANIAS', valor:70.0},
    {tx:'TX28002', data:'12/07/2026', livro:'LRCV', nome:'GERONCIO_BORGES_ANANIAS', valor:60.0},
    {tx:'TX28003', data:'12/07/2026', livro:'LRCV', nome:'Reembolso', valor:64.0},
    {tx:'TXCON000001', data:'10/07/2026', livro:'LRCON', nome:'PORTO_CONSORCIO', valor:501.32},
    {tx:'TXCON000002', data:'10/07/2026', livro:'LRCON', nome:'PORTO_CONSORCIO', valor:1449.45},
    {tx:'TXS000001', data:'07/07/2026', livro:'LRS', nome:'IFOOD', valor:5.95},
    {tx:'TXS000002', data:'12/07/2026', livro:'LRS', nome:'CLAUDE_AI', valor:110.0},
    {tx:'TXS000003', data:'10/07/2026', livro:'LRS', nome:'GOOGLE_YOUTUBE', valor:7.99},
    {tx:'TXS000004', data:'11/07/2026', livro:'LRS', nome:'UBER_ONE_MEMBERSHIP', valor:21.9},
    {tx:'TXMP000001', data:'19/05/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:56.39},
    {tx:'TXMP000002', data:'20/02/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:106.04},
    {tx:'TXMP000003', data:'16/02/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:50.4},
    {tx:'TXMP000004', data:'15/02/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:68.36},
    {tx:'TXMP000005', data:'22/10/2025', livro:'LRMP', nome:'MERCADO_LIVRE', valor:166.62},
    {tx:'TXMP000006', data:'19/05/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:23.66},
    {tx:'TXMP000007', data:'02/07/2026', livro:'LRMP', nome:'MP_WALLACELIRA', valor:638.94},
    {tx:'TXMP000008', data:'29/06/2026', livro:'LRMP', nome:'MP_WALLACELIRA', valor:638.94},
    {tx:'TXB000001', data:'25/06/2026', livro:'LRB', nome:'PRESTACAO_CASA', valor:588.66},
    {tx:'TXB000002', data:'10/07/2026', livro:'LRB', nome:'CONDOMINIO_BELLAGIO', valor:210.0},
    {tx:'TXB000003', data:'10/07/2026', livro:'LRB', nome:'CURSO_INGLES', valor:695.0},
    {tx:'TXB000004', data:'10/07/2026', livro:'LRB', nome:'AGUA_MEDINTECH', valor:133.41},
    {tx:'TXB000005', data:'10/07/2026', livro:'LRB', nome:'GAS_MEDINTECH', valor:30.28},
    {tx:'TXB000006', data:'22/07/2026', livro:'LRB', nome:'ANDERSON_RAMOS', valor:210.0},
    {tx:'TXB000007', data:'10/07/2026', livro:'LRB', nome:'FIES_VANESSA', valor:245.0},
    {tx:'TXB000008', data:'30/06/2026', livro:'LRB', nome:'CONSELHO_REGIONAL', valor:163.24},
    {tx:'TXB000009', data:'26/06/2026', livro:'LRB', nome:'ENERGIA_MEDIA', valor:322.99},
    {tx:'TXP000001', data:'23/03/2026', livro:'LRP', nome:'TEACHER_MATIAS', valor:134.14},
    {tx:'TXP000002', data:'21/03/2026', livro:'LRP', nome:'DECKFRIEND', valor:13.03},
    {tx:'TXP000003', data:'05/12/2025', livro:'LRP', nome:'KORPOS_ESTETICA', valor:189.99},
    {tx:'TXP000004', data:'23/05/2026', livro:'LRP', nome:'RL_ARTESAO', valor:66.83},
    {tx:'TXP000005', data:'28/05/2026', livro:'LRP', nome:'MERCADO_LIVRE', valor:38.25},
    {tx:'TXP000006', data:'20/05/2026', livro:'LRP', nome:'MERCADO_LIVRE', valor:68.01},
    {tx:'TXP000007', data:'18/02/2026', livro:'LRP', nome:'MERCADO_LIVRE_MP', valor:48.33},
    {tx:'TXP000008', data:'03/07/2026', livro:'LRP', nome:'SEGURO_TOKIO_MARINE', valor:200.99},
    {tx:'TXP000009', data:'31/05/2026', livro:'LRP', nome:'ARAM_BEACH_HOTEL', valor:486.64},
    {tx:'TXP000010', data:'21/07/2026', livro:'LRP', nome:'PICPAY_WALLACE_PATRI', valor:183.47},
    {tx:'TXP000011', data:'20/05/2026', livro:'LRP', nome:'HUB_SMART_HOME', valor:72.96},
    {tx:'TXP000012', data:'19/05/2026', livro:'LRP', nome:'EDILSON_LOURENCO', valor:425.0},
    {tx:'TXP000013', data:'19/05/2026', livro:'LRP', nome:'SILMARA_MACEDO', valor:375.0},
    {tx:'TXP000014', data:'08/07/2026', livro:'LRP', nome:'HOTMART_FERNANDO', valor:42.0},
    {tx:'TXS000005', data:'28/06/2026', livro:'LRS', nome:'CHATGPT', valor:39.99},
    {tx:'TXS000006', data:'29/06/2026', livro:'LRS', nome:'NETFLIX', valor:72.8},
    {tx:'TXS000007', data:'30/06/2026', livro:'LRS', nome:'YOUTUBE_PREMIUM', valor:53.9},
    {tx:'TXS000008', data:'', livro:'LRS', nome:'FABIO_SABINO', valor:7.99},
    {tx:'TXS000009', data:'19/07/2026', livro:'LRS', nome:'AMAZON_PRIME', valor:19.9},
    {tx:'TXS000010', data:'22/07/2026', livro:'LRS', nome:'MEGA', valor:30.99},
    {tx:'TXS000011', data:'26/06/2026', livro:'LRS', nome:'INTELBRAS_CLOUD', valor:45.9},
    {tx:'TXS000012', data:'17/07/2026', livro:'LRS', nome:'SPOTIFY', valor:23.9},
    {tx:'TXRR000001', data:'25/07/2026', livro:'LRR', nome:'VIVO', valor:435.0},
    {tx:'TXRR000002', data:'17/07/2026', livro:'LRR', nome:'BRISANET', valor:113.13},
    {tx:'TXRR000003', data:'25/06/2026', livro:'LRR', nome:'DIGNA', valor:152.41},
    {tx:'TXRR000004', data:'28/06/2026', livro:'LRR', nome:'CAMPO_SANTO_DA_PAZ', valor:77.79},
    {tx:'TXRR000005', data:'13/07/2026', livro:'LRR', nome:'FACULDADE_ENGENHARIA', valor:441.33},
    {tx:'TXRR000006', data:'17/07/2026', livro:'LRR', nome:'NEW_CAR_RASTREADOR', valor:59.99},
    {tx:'TXR_FACULDADE_MB_JUL26', data:'17/07/2026', livro:'LRR', nome:'FACULDADE_ENGENHARIA', valor:441.33},
    {tx:'TX000033', data:'12/07/2026', livro:'LRV', nome:'SONIA_MARMITARIA', valor:5.0},
    {tx:'TX000034', data:'12/07/2026', livro:'LRW', nome:'H57STORE', valor:26.36},
    {tx:'TX000035', data:'12/07/2026', livro:'LRW', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000036', data:'12/07/2026', livro:'LRW', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TXP000015', data:'13/05/2026', livro:'LRP', nome:'KINESIOCENTEOS', valor:74.85},
    {tx:'TX000037', data:'13/07/2026', livro:'LRCV', nome:'VANESSA_MEDICA_JULIO', valor:50.0},
    {tx:'TX000038', data:'04/07/2026', livro:'LRCV', nome:'CLESTON_DA_SILVA', valor:33.0},
    {tx:'TX000039', data:'03/07/2026', livro:'LRCV', nome:'EDGLEY_DIAS_DE_ARAUJO', valor:150.0},
    {tx:'TX000040', data:'03/07/2026', livro:'LRCV', nome:'EDGLEY_DIAS_DE_ARAUJO', valor:150.0},
    {tx:'TX000041', data:'30/06/2026', livro:'LRCV', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:15489.0},
    {tx:'TX000042', data:'04/07/2026', livro:'LRPG', nome:'VANESSA_GOMES_GALDINO', valor:300.0},
    {tx:'TX000043', data:'05/07/2026', livro:'LRPG', nome:'VANESSA_GOMES_GALDINO', valor:30.0},
    {tx:'TX000044', data:'06/07/2026', livro:'LRCV', nome:'MAGALUPAY', valor:112.61},
    {tx:'TX000045', data:'10/07/2026', livro:'LRCV', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:1.0},
    {tx:'TXMP000009', data:'27/06/2026', livro:'LRMP', nome:'EDJAMILSON_MARQUES_BARBOSA', valor:266.23},
    {tx:'TXMP000010', data:'19/05/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:42.58},
    {tx:'TX000046', data:'27/06/2026', livro:'LRPG', nome:'ROMARIO_NOGUEIRA', valor:62.0},
    {tx:'TX000047', data:'27/06/2026', livro:'LRPG', nome:'VITORIA_DRIELI_CAMELO_DA_SILVA', valor:111.0},
    {tx:'TX000048', data:'03/07/2026', livro:'LRPG', nome:'ROMARIO_NOGUEIRA', valor:44.0},
    {tx:'TX000049', data:'03/07/2026', livro:'LRPG', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:30.0},
    {tx:'TX000050', data:'04/07/2026', livro:'LRPG', nome:'VITORIA_DRIELI_CAMELO_DA_SILVA', valor:26.0},
    {tx:'TX000051', data:'04/07/2026', livro:'LRPG', nome:'REBECA_DE_SOUZA_OLIVEIRA', valor:31.5},
    {tx:'TX000052', data:'10/07/2026', livro:'LRPG', nome:'ROMARIO_NOGUEIRA', valor:68.0},
    {tx:'TX000053', data:'10/07/2026', livro:'LRPG', nome:'VANESSA_GOMES_GALDINO', valor:9.36},
    {tx:'TX000054', data:'12/07/2026', livro:'LRPG', nome:'H57_STORE', valor:14.99},
    {tx:'TX000055', data:'13/07/2026', livro:'LRPG', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:50.0},
    {tx:'TX000056', data:'13/07/2026', livro:'LRPG', nome:'MEDICA_DE_CRIANCA', valor:50.0},
    {tx:'TX000057', data:'27/06/2026', livro:'LRCV', nome:'CAIXA_PIX_VANESSA', valor:300.0},
    {tx:'TX000058', data:'10/07/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:245.0},
    {tx:'TX000059', data:'10/07/2026', livro:'LRCV', nome:'JR_PRESTACAO_DE_SERVICOS', valor:110.0},
    {tx:'TX000060', data:'06/07/2026', livro:'LRCV', nome:'RODRIGO_TORRES_DE_MORAIS', valor:120.0},
    {tx:'TX000061', data:'06/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:120.0},
    {tx:'TX000062', data:'06/07/2026', livro:'LRCV', nome:'CLOVIS_CABRAL_BARBOSA', valor:20.0},
    {tx:'TX000063', data:'05/07/2026', livro:'LRCV', nome:'UNIAO_CAMPINENSE', valor:10.0},
    {tx:'TX000088', data:'17/07/2026', livro:'LRCV', nome:'CLESTON_DA_SILVA', valor:22.0},
    {tx:'TX000109', data:'18/07/2026', livro:'LRCV', nome:'EDGLEY_DIAS_DE_ARAUJO', valor:60.0},
    {tx:'TX000110', data:'19/07/2026', livro:'LRW', nome:'PANIFICADORA', valor:13.8},
    {tx:'TX000111', data:'19/07/2026', livro:'LRW', nome:'H57STORE', valor:7.38},
    {tx:'TX000089', data:'16/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:281.34},
    {tx:'TX000090', data:'16/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:8.75},
    {tx:'TX000091', data:'01/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:1.85},
    {tx:'TX000092', data:'01/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:42.93},
    {tx:'TX000093', data:'13/07/2026', livro:'LRW-I', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000094', data:'14/07/2026', livro:'LRW-I', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000064', data:'06/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:5.81},
    {tx:'TX000065', data:'03/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:264.97},
    {tx:'TX000066', data:'03/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:30.0},
    {tx:'TX000067', data:'03/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:462.29},
    {tx:'TX000068', data:'09/07/2026', livro:'LRCV', nome:'STONE_INSTITUICAO_PAGAMENTO', valor:20.0},
    {tx:'TX000069', data:'09/07/2026', livro:'LRB', nome:'BOLETOS_DIVERSOS', valor:1313.69},
    {tx:'TX000070', data:'07/07/2026', livro:'LRCV', nome:'FATURA_WARTSILA', valor:680.0},
    {tx:'TXP2P0001', data:'10/07/2026', livro:'?', nome:'JR_PRESTACAO_DE_SERVICOS', valor:66.0},
    {tx:'TXP2P0002', data:'23/07/2026', livro:'?', nome:'COMPRADOR_NAO_ESPECIFICADO', valor:20.0},
    {tx:'TXP2P0003', data:'23/07/2026', livro:'?', nome:'ELCIO_DA_SILVA_SANTOS', valor:40.0},
    {tx:'TXRP2P001', data:'13/07/2026', livro:'P2P', nome:'P2P_CREDITO_VANESSA', valor:11.0},
    {tx:'TX000071', data:'05/07/2026', livro:'LRPG', nome:'CONTA_CONJUNTA_BRADESCO', valor:30.0},
    {tx:'TX000072', data:'29/05/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:10.0},
    {tx:'TX000073', data:'29/05/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:1.0},
    {tx:'TX000074', data:'03/07/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:30.0},
    {tx:'TX000075', data:'02/06/2026', livro:'LRV_HISTORICO', nome:'JANAINA_JAPIASSU', valor:36.9},
    {tx:'TX000076', data:'13/07/2026', livro:'LRV', nome:'DL', valor:24.03},
    {tx:'TX000078', data:'13/07/2026', livro:'LRW', nome:'H57STORE', valor:25.93},
    {tx:'TX000079', data:'14/07/2026', livro:'LRW', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000080', data:'16/07/2026', livro:'LRPG', nome:'DUPOMAR_HORTIFRUTTI', valor:133.81},
    {tx:'TX000081', data:'16/07/2026', livro:'LRW', nome:'NOBRE_CARNES_LI', valor:206.4},
    {tx:'TX000096', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:3.19},
    {tx:'TX000098', data:'18/07/2026', livro:'LRW', nome:'H57STORE', valor:12.79},
    {tx:'TX000099', data:'18/07/2026', livro:'LRW', nome:'H57STORE', valor:3.19},
    {tx:'TX000100', data:'17/07/2026', livro:'LRW', nome:'DENIS_MASSAS', valor:32.0},
    {tx:'TX000101', data:'17/07/2026', livro:'LRW', nome:'VENDEDORA', valor:71.0},
    {tx:'TX000102', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:6.99},
    {tx:'TX000103', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:12.79},
    {tx:'TX000104', data:'18/07/2026', livro:'LRW', nome:'FILEZAO_SAO_CRISTOVAO', valor:38.26},
    {tx:'TX000105', data:'18/07/2026', livro:'LRW', nome:'MARIA_DO_SOCORRO', valor:40.0},
    {tx:'TX000106', data:'18/07/2026', livro:'LRW', nome:'MP_SOLANGEARTESA', valor:10.0},
    {tx:'TX000108', data:'18/07/2026', livro:'LRW', nome:'IFD_BROTHERS_BURGER', valor:230.67},
    {tx:'TX000107', data:'18/07/2026', livro:'LRCV', nome:'LUCIANO_SARTORI_PAQUI', valor:20.0},
    {tx:'TX000097', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:4.37},
    {tx:'TX000082', data:'16/07/2026', livro:'LRW', nome:'SUP_IDEAL', valor:313.12},
    {tx:'TX000083', data:'16/07/2026', livro:'LRCV', nome:'PIX_VANESSA', valor:208.24},
    {tx:'TX000084', data:'17/07/2026', livro:'LRPG', nome:'PIX_VANESSA', valor:95.0},
    {tx:'TX000085', data:'17/07/2026', livro:'LRCV', nome:'PIX_VANESSA', valor:399.13},
    {tx:'TX000133', data:'23/07/2026', livro:'LRCV', nome:'ELCIO_DA_SILVA_SANTOS', valor:40.0},
    {tx:'TX000131', data:'23/07/2026', livro:'LRV-I', nome:'H57STORE', valor:17.98},
    {tx:'TX000132', data:'23/07/2026', livro:'LRW-MB', nome:'GOOGLE_SUNSURVEYORAPP', valor:56.99},
    {tx:'TX000134', data:'21/06/2026', livro:'LRS', nome:'AMAZON_PRIME_CANAIS', valor:19.99},
    {tx:'TX000135', data:'30/06/2026', livro:'LRW-I', nome:'AMAZON_PRIME_ALUGUEL', valor:9.99},
    {tx:'TX000165', data:'27/07/2026', livro:'LRCL', nome:'LREI0002', valor:164.94},
    {tx:'TX000166', data:'27/07/2026', livro:'LRSF', nome:'DRA_CINTIA', valor:135.06},
    {tx:'TX000167', data:'28/07/2026', livro:'LRV', nome:'DL', valor:12.42},
    {tx:'TX000168', data:'28/07/2026', livro:'LRV', nome:'DL', valor:11.12},
    {tx:'TX000169', data:'28/07/2026', livro:'LRV', nome:'H57STORE', valor:8.08},
    {tx:'TX000170', data:'28/07/2026', livro:'LRPV', nome:'DRA_CINTIA', valor:40.0},
    {tx:'TX000172', data:'29/07/2026', livro:'LRC', nome:'ANTONIO_DOMINGOS_ANGEL', valor:9.0},
    {tx:'TX000173', data:'29/07/2026', livro:'LRC', nome:'ANTONIO_DOMINGOS_ANGEL', valor:3.0},
    {tx:'TX000174', data:'29/07/2026', livro:'LRC', nome:'CONVENIENCIA_CAPUABA', valor:40.96},
    {tx:'TX000175', data:'29/07/2026', livro:'LRV', nome:'DL', valor:12.02},
    {tx:'TX000176', data:'29/07/2026', livro:'LRV', nome:'DROGASIL_2305', valor:132.26},
    {tx:'TX000177', data:'29/07/2026', livro:'LRV', nome:'DL', valor:19.65},
    {tx:'TX000178', data:'29/07/2026', livro:'LRPV', nome:'PGV', valor:300.0},
    {tx:'TX000179', data:'31/07/2026', livro:'LRV', nome:'DL', valor:5.06},
    {tx:'TX000180', data:'31/07/2026', livro:'LRV', nome:'DL', valor:6.43},
    {tx:'TX000181', data:'31/07/2026', livro:'LRPV', nome:'RAYSSA_DOS_SANTOS_PEREIRA', valor:70.0},
    {tx:'TX000182', data:'31/07/2026', livro:'LRPV', nome:'ROMARIO_NOGUEIRA_CUNHA', valor:65.0},
    {tx:'TX000183', data:'31/07/2026', livro:'LRW', nome:'TAPIOCARIA_IRMAO_FIRMI', valor:227.0},
    {tx:'TX000184', data:'31/07/2026', livro:'LRW', nome:'H57STORE', valor:18.36},
    {tx:'TX000185', data:'31/07/2026', livro:'LRW', nome:'H57STORE', valor:5.59},
    {tx:'TX000186', data:'31/07/2026', livro:'LRW', nome:'H57STORE', valor:2.19},
    {tx:'TX000187', data:'01/08/2026', livro:'LRPV', nome:'PGV', valor:300.0},
    {tx:'TX000188', data:'01/08/2026', livro:'LRW', nome:'AMAZON', valor:32.06},
    {tx:'TX000189', data:'01/08/2026', livro:'LRPV', nome:'MEU_PEQUENO', valor:276.0},
    {tx:'TX000190', data:'01/08/2026', livro:'LRCV', nome:'CLESTON_DA_SILVA', valor:22.0},
    {tx:'TX000191', data:'01/08/2026', livro:'LRV', nome:'TIORAFAKIDS', valor:50.0},
    {tx:'TX000192', data:'02/08/2026', livro:'LRW', nome:'DROGARIA_BENIF', valor:20.0},
    {tx:'TXPV000001', data:'02/08/2026', livro:'LRPV', nome:'SHPB_BRASIL_SANTANDER', valor:34.34},
    {tx:'TXPV000002', data:'02/08/2026', livro:'LRPV', nome:'KENNEDY_EVARISTO_DOS_SANTOS', valor:20.0},
    {tx:'TX000193', data:'03/08/2026', livro:'LRV', nome:'DL', valor:12.23},
    {tx:'TX000194', data:'03/08/2026', livro:'LRV', nome:'DL', valor:11.5},
    {tx:'TX000195', data:'03/08/2026', livro:'LRW', nome:'DL', valor:20.14},
    {tx:'TX000196', data:'03/08/2026', livro:'LRW', nome:'H57STORE', valor:42.28},
    {tx:'TX000197', data:'03/08/2026', livro:'LRW', nome:'ANTHROPIC', valor:51.69},
    {tx:'TX000198', data:'03/08/2026', livro:'LRW', nome:'ANTHROPIC', valor:51.69},
    {tx:'TX000199', data:'03/08/2026', livro:'LRW', nome:'ANTHROPIC', valor:20.68},
    // NOVOS 04/08/2026 (parte 75): confirmados via triagem Visa Infinite Prime (partes 72-73) - todos
    // do ciclo JA FECHADO (25/06-24/07). CORRIGIDO 04/08/2026 (parte 75, erro meu): tinham sido
    // lancados por engano no LRW_TRANSACOES/cartaoInfiniteTotal do CICLO ATUAL (Supabase) - inflava o
    // ciclo errado. Revertidos de la, adicionados aqui (historico cross-ciclo, so pra reconciliacao -
    // nao afeta nenhum agregado do ciclo atual). TX000207 (Mercado Livre R$48,45) NAO incluido - usuario
    // conferiu o app do Mercado Livre e nao achou pedido correspondente, revertido tambem (parte 74).
    {tx:'TX000203', data:'26/06/2026', livro:'LRW', nome:'BRISANET', valor:114.99},
    {tx:'TX000204', data:'30/06/2026', livro:'LRW', nome:'CONTA_VIVO', valor:469.00},
    {tx:'TX000205', data:'01/07/2026', livro:'LRW', nome:'CONTA_VIVO', valor:54.00},
    {tx:'TX000206', data:'15/07/2026', livro:'LRW', nome:'DRYCLEAN_USA', valor:132.00},
    {tx:'TX000208', data:'07/07/2026', livro:'LRW', nome:'RBM_RELOGIOS', valor:80.97},
    {tx:'TX000209', data:'15/07/2026', livro:'LRW', nome:'VENDEDORA', valor:22.30},
    // NOVO 04/08/2026 (parte 80): NAO sao compras - estornos confirmados via fatura real Bradesco
    // (Visa Infinite Prime, junho+julho/2026). MERCADOLIVRE*MERCADOLIVRE R$48,45 cobrado 29/06,
    // estornado 02/07 (junto com um R$132,03 sem cobranca correspondente visivel nas 2 faturas - pode
    // ser de um periodo anterior). Adicionados aqui SO pra reconciliacao parar de flagar como "sem
    // registro" - dinheiro ja voltou, nao e gasto pendente de lancar.
    {tx:'TX000210-ESTORNO', data:'02/07/2026', livro:'LRW', nome:'MERCADOLIVRE_ESTORNO', valor:48.45},
    {tx:'TX000211-ESTORNO', data:'02/07/2026', livro:'LRW', nome:'MERCADOLIVRE_ESTORNO', valor:132.03},
  ],

  // V176 (26/07/2026): NOVO livro PV (PIX Vanessa, reserva do Wallace) - pedido do usuario: "voce colocou
  // PGV mas nao tem PV no Livro Razao, e tem que registrar a saida de um para entrar na outra". Antes so
  // existia LRPV_TRANSACOES (na verdade sempre foi a PGV) - a PV (aportes do Wallace + reforcos a PGV)
  // nunca teve painel proprio, mesmo tendo saldo e regra de reposicao dedicados (secao 7 Politicas).
  PV_TRANSACOES: [
    { tx:'TX000141', data:'24/07', nome:'Aporte mensal (direto do salário Wärtsilä)', tipo:'Entrada', valor:1200.00 },
    { tx:'TX000150', data:'24/07', nome:'Reforço à PGV (contrapartida: entrada na PGV)', tipo:'Saída', valor:300.00 },
    { tx:'TX000178', data:'29/07', nome:'Reforço à PGV (contrapartida: entrada na PGV, comprovante MP 171162180982)', tipo:'Saída', valor:300.00 },
    { tx:'TX000187', data:'01/08', nome:'Reforço à PGV (contrapartida: entrada na PGV, comprovante E10573521202608011203zUhCTMzglu9)', tipo:'Saída', valor:300.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:2.12 },
  ],

  // V172 (26/07/2026): LRPV (PIX Vanessa - PGV, conta autonoma dela) convertido para array estruturado -
  // mesma logica ja aplicada a LRW/LRV/LRC. Antes era HTML fixo, faltavam TX000153/155 (PIX de 24/07,
  // ja existiam no ERP mas nunca chegaram no site). Nunca mais editar a tabela na mao.
  // V177 (26/07/2026): PGV reduzida para SO o ciclo atual (25/07 em diante) - pedido explicito do usuario:
  // "A PGV deve ser igual a LRW, so as transacoes desse ciclo". As 18 transacoes antigas (26/06-22/07,
  // liquido -R$265,66) foram movidas para o snapshot do ciclo FECHADO (ver CICLO_SNAPSHOTS['2026-06']
  // abaixo) - preservadas, so nao aparecem mais misturadas aqui. Adicionada a ENTRADA que faltava:
  // contrapartida do TX000150 (R$300, PV->PGV, 24/07) - antes so a SAIDA da PV estava registrada, sem
  // o correspondente na PGV (erro apontado pelo usuario: "voce colocou que saiu 300 da PV mas nao
  // registrou que entrou na PGV").
  LRPV_TRANSACOES: [
    { tx:'TX000153', data:'24/07', nome:'PIX Dupomar Hortifruti (Banco do Brasil)', tipo:'Saída', valor:182.96 },
    { tx:'TX000155', data:'24/07', nome:'PIX Romário Nogueira Cunha - Hortifruti', tipo:'Saída', valor:39.00 },
    { tx:'TX000150', data:'24/07', nome:'Reforço da PV (contrapartida de TX000150 na PV)', tipo:'Entrada', valor:300.00 },
    { tx:'TX000170', data:'28/07', nome:'Complemento consulta pediátrica Júlio (Dra. Cintia) - PIX R$340 = R$300 repassado 27/07 + R$40 desta caixa', tipo:'Saída', valor:40.00 },
    { tx:'TX000178', data:'29/07', nome:'Reforço da PV (contrapartida de TX000178 na PV, comprovante MP 171162180982)', tipo:'Entrada', valor:300.00 },
    { tx:'TX000181', data:'31/07', nome:'PIX Rayssa Dos Santos Pereira - depilação de Vanessa (comprovante B333NYP1B09MBE9JZ)', tipo:'Saída', valor:70.00 },
    { tx:'TX000182', data:'31/07', nome:'PIX Romario Nogueira Cunha - Hortifrut (comprovante E10573521202607311626TIYWLRElyer)', tipo:'Saída', valor:65.00 },
    { tx:'TX000187', data:'01/08', nome:'Reforço da PV (contrapartida de TX000187 na PV, comprovante E10573521202608011203zUhCTMzglu9)', tipo:'Entrada', valor:300.00 },
    { tx:'TX000189', data:'01/08', nome:'PIX Meu Pequeno (Itaú Unibanco) - comprovante E10573521202608011224CMw0yl9fysg', tipo:'Saída', valor:276.00 },
  ],

  // ===== V145 (25/07/2026): DUAS VISOES DE CICLO SEPARADAS, SEM CRUZAMENTO =====
  // Pedido explicito do usuario: "quero ter duas visoes, a do ciclo anterior como ele fechou e a nova
  // do ciclo com os dados novos, nao quero cruzamento de dados". Espelha 1:1 a aba SNAPSHOT_CICLOS_FECHADOS
  // do ERP. Contem so os indicadores POR-CICLO (Caixa Variavel, Reembolso, Tolerancia, Cascata do
  // Reembolso, Modo Operacional/Saldo Ciclo). Indicadores de FLUXO CONTINUO (Necessidade Total dos
  // cartoes - segue a mesma curva mensal do grafico de projecao de 12 meses ja existente - Patrimonio,
  // valor obrigatorio das faturas MB/MP ja fechadas) NAO entram aqui, ficam no VARS normal (topo deste
  // arquivo) e sao os MESMOS em qualquer ciclo selecionado.
  cicloAtual: '2026-07', // qual ciclo o site mostra por padrao ao carregar
  CICLO_SNAPSHOTS: {
    '2026-06': {
      label: 'Jun/26 (26/06–24/07) — FECHADO',
      periodo: '26/06/2026 a 24/07/2026',
      fechado: true,
      salario: 33708.78,
      entradasTotais: 38623.76,
      caixaVariavelComprometido: 3998.50,
      caixaVariavelSaldoReal: 3933.37,
      caixaVariavelDisponivel: -65.13,
      reembolsoRecebido: 4914.98,
      reembolsoAReceber: 0,
      toleranciaTempValor: 1500,
      toleranciaTempMotivo: 'Viagem família Vanessa, até 24/07/2026 (encerrada)',
      tetoOficial: 2000,
      tetoEfetivo: 3500,
      cascata: { faturaWartsila: 656.67, mpCorporativo: 1277.88, cartaoCorporativo: 483.43, mpPessoal: 471.47, sobraTotal: 2025.13 },
      necessidadeTotalBruta: 14898.13,
      necessidadeTotalLiquida: 13943.23,
      modoOperacional: 'Alto',
      saldoCiclo: 6836.41,
      visaInfiniteComprometido: 9160.07, // CONGELADO - valor do Visa Infinite quando este ciclo fechou (antes da migracao para MB e antes do Seguro Tokio Marine ser corrigido para parcelado)
      mastercardBlackComprometido: 1937.18, // CORRIGIDO 26/07/2026 (V177): usuario esclareceu que este e o fechamento ARTIFICIAL que ele criou (congelamento de 22/07, vencimento 28/07) - nao um numero calculado a parte. Era R$2.065,17 (formula antiga, antes da reconciliacao completa da V161).
      mastercardBlackPessoalCongelado: 1849.31, // NOVO 26/07/2026 (V177, pedido do usuario): "esse valor deve ser o congelado, que e o fechamento artificial que eu criei" - Pessoal (s/corporativo) do MB no momento do congelamento de 22/07 (R$1.937,18 total congelado - corporativo daquele momento).
      mercadoPagoFaturaCongelada: 1791.93, // CONGELADO - fatura MP de quando este ciclo fechou (sem o adiantamento de transporte corporativo, que so entrou no ciclo seguinte)
      diasRestantes: 0,
      observacoes: 'Ciclo fechado na virada de 25/07/2026. O salário de R$16.819,56 recebido em 24/07 (adiantado por ser sábado) é do ciclo SEGUINTE, já distribuído no dia do recebimento.',
      // CORRIGIDO 04/08/2026 (parte 59, pedido do usuario apos investigacao real): o resumo de 1
      // linha por livro (V174, "61 compras/R$1.406,92" etc) estava DESATUALIZADO - conferido contra
      // ERP_WALLACE_LIRA_V11.xlsx (SWP_INPUT_TX) real, linha a linha. LRC bateu exato (validou o
      // metodo); LRW e LRV nao batiam com o resumo antigo. Usuario perguntou especificamente sobre a
      // tag "Visita Familia de Vanessa"/"Viagem Recife" (hotel ARAM BEACH HOTEL=TXP000009, transporte
      // Joao Pessoa x Campina Grande=TXMP000009, ambos ja lancados, so em livros diferentes de LRW/LRV)
      // - usuario esclareceu que a tag e SO informativa, nao reclassifica livro, entao a explicacao
      // real da divergencia e simplesmente resumo desatualizado, nao regra de negocio nenhuma. Trocado
      // pelos 43+10+6 lancamentos reais da planilha (mesmo criterio de filtro: LIVRO+DATA dentro do
      // periodo do ciclo, 26/06-24/07/2026). Novos totais: LRW R$2.426,36 (43), LRV R$206,27 (10),
      // LRC R$483,43 (6, inalterado - ja batia).
      LRW_TRANSACOES: [
        { tx:'TX000005', data:'27/06', nome:'TAPIOCA', valor:81.0 },
        { tx:'TX000006', data:'27/06', nome:'MERCADO_CLOVIS', valor:8.5 },
        { tx:'TX000007', data:'27/06', nome:'ABASTECE_AI', valor:103.0 },
        { tx:'TX000008', data:'28/06', nome:'KI_FRANGO', valor:64.0 },
        { tx:'TX000009', data:'28/06', nome:'ALEKS_BOLOS', valor:44.0 },
        { tx:'TX000010', data:'28/06', nome:'CLAUVENIENCIA', valor:45.0 },
        { tx:'TX000012', data:'04/07', nome:'MENDONCA_PASTEIS', valor:75.97 },
        { tx:'TX000013', data:'04/07', nome:'H57_STORE', valor:9.19 },
        { tx:'TX000014', data:'05/07', nome:'ELIAS_ANDRADE', valor:120.0 },
        { tx:'TX000015', data:'05/07', nome:'TAMYLLA', valor:32.0 },
        { tx:'TX000016', data:'05/07', nome:'TAMYLLA', valor:36.0 },
        { tx:'TX000017', data:'05/07', nome:'PIZZA_NOSTRA', valor:241.0 },
        { tx:'TX000018', data:'06/07', nome:'BROTHERS_CLUB', valor:85.0 },
        { tx:'TX000020', data:'07/07', nome:'HORTIFRUTI', valor:10.0 },
        { tx:'TX000021', data:'07/07', nome:'H57_STORE', valor:9.99 },
        { tx:'TX000026', data:'10/07', nome:'PANIFICADORA', valor:23.8 },
        { tx:'TX000027', data:'10/07', nome:'AMAZON_PRIME_VIDEO', valor:9.99 },
        { tx:'TX000031', data:'10/07', nome:'H57STORE', valor:40.98 },
        { tx:'TXR000007', data:'10/07', nome:'H57STORE', valor:9.99 },
        { tx:'TX000029', data:'11/07', nome:'MADOSKA_SORVETES', valor:127.43 },
        { tx:'TX000032', data:'11/07', nome:'SONIA_MARMITARIA', valor:5.0 },
        { tx:'TX000030', data:'12/07', nome:'PASTIANNE_RESTAURANTE', valor:126.28 },
        { tx:'TX000034', data:'12/07', nome:'H57STORE', valor:26.36 },
        { tx:'TX000035', data:'12/07', nome:'ANTHROPIC_API', valor:20.0 },
        { tx:'TX000036', data:'12/07', nome:'ANTHROPIC_API', valor:20.0 },
        { tx:'TX000078', data:'13/07', nome:'H57STORE', valor:25.93 },
        { tx:'TX000079', data:'14/07', nome:'ANTHROPIC_API', valor:20.0 },
        { tx:'TX000081', data:'16/07', nome:'NOBRE_CARNES_LI', valor:206.4 },
        { tx:'TX000082', data:'16/07', nome:'SUP_IDEAL', valor:313.12 },
        { tx:'TX000096', data:'17/07', nome:'H57STORE', valor:3.19 },
        { tx:'TX000100', data:'17/07', nome:'DENIS_MASSAS', valor:32.0 },
        { tx:'TX000101', data:'17/07', nome:'VENDEDORA', valor:71.0 },
        { tx:'TX000102', data:'17/07', nome:'H57STORE', valor:6.99 },
        { tx:'TX000103', data:'17/07', nome:'H57STORE', valor:12.79 },
        { tx:'TX000097', data:'17/07', nome:'H57STORE', valor:4.37 },
        { tx:'TX000098', data:'18/07', nome:'H57STORE', valor:12.79 },
        { tx:'TX000099', data:'18/07', nome:'H57STORE', valor:3.19 },
        { tx:'TX000104', data:'18/07', nome:'FILEZAO_SAO_CRISTOVAO', valor:38.26 },
        { tx:'TX000105', data:'18/07', nome:'MARIA_DO_SOCORRO', valor:40.0 },
        { tx:'TX000106', data:'18/07', nome:'MP_SOLANGEARTESA', valor:10.0 },
        { tx:'TX000108', data:'18/07', nome:'IFD_BROTHERS_BURGER', valor:230.67 },
        { tx:'TX000110', data:'19/07', nome:'PANIFICADORA', valor:13.8 },
        { tx:'TX000111', data:'19/07', nome:'H57STORE', valor:7.38 },
      ],
      LRV_TRANSACOES: [
        { tx:'TXR000004', data:'28/06', nome:'H57_STORE', valor:15.97 },
        { tx:'TX000011', data:'01/07', nome:'UBER', valor:9.21 },
        { tx:'TX000019', data:'06/07', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:31.7 },
        { tx:'TXR000006', data:'07/07', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:34.0 },
        { tx:'TX000023', data:'09/07', nome:'DORGIVAL', valor:21.3 },
        { tx:'TX000024', data:'10/07', nome:'H57STORE', valor:9.99 },
        { tx:'TX000028', data:'10/07', nome:'H57STORE', valor:9.88 },
        { tx:'TXR000005', data:'12/07', nome:'DROGARIA_DROGAVISTA', valor:45.19 },
        { tx:'TX000033', data:'12/07', nome:'SONIA_MARMITARIA', valor:5.0 },
        { tx:'TX000076', data:'13/07', nome:'DL', valor:24.03 },
      ],
      LRC_LIMBO_TRANSACOES: [
        { tx:'TX22001', data:'29/06', nome:'LMSERVICE', valor:102.96 },
        { tx:'TX22002', data:'29/06', nome:'PORTO_GALLO', valor:42.56 },
        { tx:'TX22003', data:'01/07', nome:'CAFE_DA_VILLA', valor:150.0 },
        { tx:'TX22004', data:'02/07', nome:'LA_URSA', valor:146.62 },
        { tx:'TX22005', data:'02/07', nome:'CACAU_SHOW_CAFE', valor:19.8 },
        { tx:'TX22006', data:'02/07', nome:'CACAU_SHOW_SORVETE', valor:21.49 },
      ],
      LRPV_TRANSACOES: [
        { tx:'TX000042', data:'04/07', nome:'Transferência Pix Geral (autonomia)', tipo:'Entrada', valor:300.00 },
        { tx:'TX000043', data:'05/07', nome:'PIX diversos Vanessa', tipo:'Entrada', valor:30.00 },
        { tx:'TX000055', data:'13/07', nome:'Recebido de Wallace (pediatra Júlio)', tipo:'Entrada', valor:50.00 },
        { tx:'TX000046', data:'27/06', nome:'PIX Romário Nogueira', tipo:'Saída', valor:62.00 },
        { tx:'TX000047', data:'27/06', nome:'PIX Vitoria Drieli', tipo:'Saída', valor:111.00 },
        { tx:'TX000048', data:'03/07', nome:'PIX Romário Nogueira', tipo:'Saída', valor:44.00 },
        { tx:'TX000049', data:'03/07', nome:'PIX para Wallace', tipo:'Saída', valor:30.00 },
        { tx:'TX000050', data:'04/07', nome:'PIX Vitoria Drieli', tipo:'Saída', valor:26.00 },
        { tx:'TX000051', data:'04/07', nome:'PIX Rebeca de Souza Oliveira', tipo:'Saída', valor:31.50 },
        { tx:'TX000052', data:'10/07', nome:'PIX Romário Nogueira', tipo:'Saída', valor:68.00 },
        { tx:'TX000053', data:'10/07', nome:'PIX Vanessa - uso próprio', tipo:'Saída', valor:9.36 },
        { tx:'TX000054', data:'12/07', nome:'H57 Store Minimercados', tipo:'Saída', valor:14.99 },
        { tx:'TX000056', data:'13/07', nome:'Sinal pediatra Júlio (repasse)', tipo:'Saída', valor:50.00 },
        { tx:'TX000080', data:'16/07', nome:'Dupomar Hortifrutti', tipo:'Saída', valor:133.81 },
        { tx:'TX000084', data:'16/07', nome:'Reforço da caixa PIX Vanessa (PV) → PIX Geral (PGV)', tipo:'Entrada', valor:95.00 },
        { tx:'TX-SUP-01', data:'20/07', nome:'Suporte da Caixa Variável (co-irmã, via PV)', tipo:'Entrada', valor:2.00 },
        { tx:'TX000122', data:'17/07', nome:'Hortifruti (frutas)', tipo:'Saída', valor:67.00 },
        { tx:'TX000121', data:'20/07', nome:'Fralda do Júlio (Meu Pequeno)', tipo:'Saída', valor:95.00 },
      ],
    },
    '2026-07': {
      label: 'Jul/26 (25/07–24/08) — ATUAL',
      periodo: '25/07/2026 a 24/08/2026',
      fechado: false,
      salario: 16819.56,
      entradasTotais: 17425.79, // ATUALIZADO V146: +R$340 no reembolso
      caixaVariavelComprometido: 584.48, // ATUALIZADO 26/07/2026 (V178): +R$28,49 (TX000161, Super Bom Supermercado, cartao MB 2244). Era R$555,99.
      caixaVariavelSaldoReal: 1878.00, // ATUALIZADO 01/08/2026: -R$22,00 (TX000190, PIX água mineral, reclassificado de PV para Caixa Variável - correção do usuário). Era R$1.900,00 (26/07, V180): -R$100,00 (TX000162, PIX poda das bananeiras, saiu de verdade da Caixa Variavel). Era R$2.000,00.
      caixaVariavelDisponivel: 1315.52, // ATUALIZADO V180: 1900.00 - 584.48 (comprometido)
      reembolsoRecebido: 0,
      reembolsoAReceber: 7795.56, // ATUALIZADO 31/07/2026: +R$340,00 (usuario pediu para somar ao valor de reembolso a receber). Era R$7.455,56 - valor oficial do portal de reembolso Wärtsilä (relatório 07/31/2026) - "Due Employee". NOTA: R$3.280,47 do mesmo relatorio ("Company Paid BTA AmEx") ja foi pago direto pela empresa no cartao corporativo, nao e devido ao Wallace - nao soma aqui.
      toleranciaTempValor: 0,
      toleranciaTempMotivo: null,
      tetoOficial: 2000,
      tetoEfetivo: 2000,
      cascata: { faturaWartsila: 5768.06, mpCorporativo: 266.23, cartaoCorporativo: 297.31, mpPessoal: 0, sobraTotal: 0 }, // ATUALIZADO 01/08/2026: mpCorporativo 0->266.23 (TXMP000011, PIX Isabel Cristina Barbosa - Transporte corporativo via PicPay). cartaoCorporativo 0->297.31 ja estava valendo via override (V223); consolidado aqui tambem. faturaWartsila 5768.06 confirmado 31/07/2026 (item 1 da cascata, Politica sec.5). Impacto real dessas pernas = R$0 no bolso do Wallace (custos da empresa) - so registra para rastreabilidade (P6), nao afeta necessidadeLiquida.
      necessidadeTotalBruta: 13146.21, // ATUALIZADO V146/V147: parcelas Visa+MP recalculadas via PARCELAMENTOS_ATIVOS
      necessidadeTotalLiquida: 12743.10, // ATUALIZADO V147: NECESSIDADE_TOTAL - COBERTURA_JA_GARANTIDA_25 (403.11, cascata zerada corretamente)
      modoOperacional: 'Normal',
      saldoCiclo: 6836.41,
      // REMOVIDOS 29/07/2026 (V203, varredura de bugs): visaInfiniteComprometido (R$1.017,89),
      // mastercardBlackComprometido (R$4.563,34) e mercadoPagoFaturaAtual (R$2.058,16) eram NUMEROS
      // MORTOS - o codigo em aplicarCicloAoVARS() só le esses campos do snapshot quando snap.fechado
      // é true; para o ciclo ATUAL usa os valores vivos do topo do VARS (CARTAO_*_CICLO_ATUAL).
      // Ficavam congelados em 26/07 e nunca atualizavam, gerando falso alarme de "total dessincronizado"
      // em qualquer auditoria que os comparasse. Os valores vivos corretos: cartaoInfiniteTotal,
      // cartaoMBTotal, mercadoPagoFatura (no topo do VARS). Nenhum impacto na tela - eram inertes.
      diasRestantes: 30,
      observacoes: 'Ciclo iniciado 25/07/2026. Caixa Variável, Reembolso, Tolerância e Cascata do Reembolso começam do zero — dados exclusivos deste ciclo, sem cruzamento com o ciclo anterior.',
      // V174: os arrays de transacao do ciclo ATUAL sao referenciados diretamente dos arrays "vivos"
      // do VARS (LRW_TRANSACOES etc, que ja existem e sao atualizados a cada compra nova via Supabase).
      // NAO duplicar aqui - a referencia e resolvida em aplicarCicloAoVARS() no momento de uso.
    }
  }
};

// Congela objetos que nunca deveriam ser mutados em runtime - protege contra edição acidental
// (ex: alguém escrever VARS.LEGENDAS.algumId = "..." num ponto novo do código sem perceber que
// deveria estar editando o objeto original, lá em cima). Confirmado (03/08/2026): só leitura no
// resto do arquivo para os 3.
Object.freeze(VARS.LEGENDAS);
Object.freeze(VARS.CRONOGRAMA_BOLETOS_FIXOS);
Object.freeze(VARS.ROC_STATUS_LIMITES);

// V169: aplica os dados buscados do Supabase (window.WALLACE_DADOS_REMOTOS, populado pelo script no
// HTML antes deste arquivo carregar) por cima do VARS estatico - assim as compras/saldos mais recentes
// que o Claude atualizar no banco aparecem aqui, sem precisar de novo deploy do site inteiro.
// Se nao houver dados remotos (offline, banco fora do ar), o VARS estatico permanece como esta acima -
// o site nunca quebra, so mostra os dados de quando foi publicado por ultimo.
if(typeof window !== 'undefined' && window.WALLACE_DADOS_REMOTOS){
  const dr = window.WALLACE_DADOS_REMOTOS;
  Object.assign(VARS, dr); // campos de 1o nivel (LRW_TRANSACOES, cartaoMBTotal, etc)
  // caixaVariavelComprometido/SaldoReal vivem dentro de CICLO_SNAPSHOTS[cicloAtual], nao no topo do
  // VARS - precisam ser aplicados no snapshot do ciclo atual especificamente.
  // BUG CORRIGIDO 26/07/2026 (V181): so caixaVariavelComprometido tinha esse tratamento - o Saldo Real
  // (ex: TX000162, PIX de R$100 saindo de verdade da Caixa Variavel) ficava so em VARS.caixaVariavelSaldoReal
  // (nivel superior), nunca chegava no snapshot - aplicarCicloAoVARS() sempre lia o valor estatico antigo
  // do proprio snapshot, ignorando a atualizacao. Usuario reportou "a Caixa Variavel esta errada" (voltou
  // a mostrar R$2.000,00 em vez de R$1.900,00).
  if(VARS.CICLO_SNAPSHOTS[VARS.cicloAtual]){
    const snapVivo = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    if(dr.caixaVariavelSaldoReal !== undefined) snapVivo.caixaVariavelSaldoReal = dr.caixaVariavelSaldoReal;
    if(dr.caixaVariavelComprometido !== undefined) snapVivo.caixaVariavelComprometido = dr.caixaVariavelComprometido;
    snapVivo.caixaVariavelDisponivel = Math.round((snapVivo.caixaVariavelSaldoReal - snapVivo.caixaVariavelComprometido)*100)/100;
    // NOVO 31/07/2026 (V221, pedido explicito do usuario - "nao pode ter valor manual que precise subir
    // arquivo", credito Netlify curto): GENERALIZADO. Antes so caixaVariavelComprometido/SaldoReal vinham
    // do Supabase sem redeploy - qualquer outro campo dentro do snapshot do ciclo atual (reembolsoAReceber,
    // reembolsoRecebido, cascata, tetoOficial/Efetivo, toleranciaTempValor/Motivo, modoOperacional, etc)
    // exigia editar o app.js e subir zip novo (ex: caso real de hoje, reembolsoAReceber 659,19->7.455,56 e
    // cascata.faturaWartsila 0->5.768,06 so apareceram apos redeploy manual). A partir de agora, escrever em
    // dr.cicloAtualOverrides (objeto livre, qualquer chave do snapshot) resolve isso pra sempre - nenhuma
    // chave nova precisa ser prevista aqui, e cascata e mesclada campo a campo (nao sobrescrita inteira) pra
    // nao perder pernas nao informadas nesta atualizacao.
    if(dr.cicloAtualOverrides){
      const ov = dr.cicloAtualOverrides;
      Object.keys(ov).forEach(k=>{
        if(k === 'cascata' && ov.cascata && typeof ov.cascata === 'object'){
          snapVivo.cascata = Object.assign({}, snapVivo.cascata, ov.cascata);
        } else {
          snapVivo[k] = ov[k];
        }
      });
    }
  }
}

const CICLO_LISTA = Object.keys(VARS.CICLO_SNAPSHOTS); // ordem de insercao = ordem cronologica

// V154: livroLRP e totalOpProvMP agora SOBRESCRITOS aqui, derivados dos arrays PARCELAMENTOS_VISA/MP
// (definidos acima dentro do VARS) - nunca mais numero fixo. Somar só os itens com status='ATIVO'.
// Isso e o "motor de avanco automatico": na proxima virada de ciclo, so preciso incrementar
// parcelaAtual de cada item (e marcar QUITADO quando passar do total) - os totais recalculam sozinhos.
VARS.livroLRP = Math.round(VARS.PARCELAMENTOS_VISA.filter(p=>p.status==='ATIVO').reduce((s,p)=>s+p.valor,0)*100)/100;
VARS.totalOpProvMP = Math.round(VARS.PARCELAMENTOS_MP.filter(p=>p.status==='ATIVO').reduce((s,p)=>s+p.valor,0)*100)/100;
// NOVO 31/07/2026 (V219, pedido explicito do usuario "implemente ja"): alivio de agosto agora e
// CALCULO REAL, nao mais texto fixo. Soma o valor de toda parcela ATIVA (Visa LRP + Mercado Pago LRMP)
// cuja parcelaAtual ja bateu o totalParcelas - ou seja, quita nesta virada de ciclo e o valor some do
// comprometido a partir do proximo mes. Continua funcionando sozinho em toda virada futura, sem editar
// nada a mao.
VARS.alivioProximoMes = Math.round((
  VARS.PARCELAMENTOS_VISA.filter(p=>p.status==='ATIVO' && p.parcelaAtual>=p.totalParcelas).reduce((s,p)=>s+p.valor,0) +
  VARS.PARCELAMENTOS_MP.filter(p=>p.status==='ATIVO' && p.parcelaAtual>=p.totalParcelas).reduce((s,p)=>s+p.valor,0)
) * 100) / 100;
VARS.livroLRPV = Math.round(VARS.LRPV_TRANSACOES.reduce((s,t)=>s+(t.tipo==='Entrada'?t.valor:-t.valor),0)*100)/100; // V172: derivado do array, nunca mais numero fixo dessincronizado
VARS.caixaSaudeFamilia = calcularSaldoCaixa(VARS.SAUDE_FAMILIA_SALDO_INICIAL_CICLO, VARS.SAUDE_FAMILIA_TRANSACOES); // V192: 1a caixa migrada para saldo derivado - nunca mais numero fixo dessincronizado do array de transacoes
VARS.PGV_RENDIMENTO_CDI_NAO_RASTREADO = 0.04; // V192: diferenca documentada entre soma das transacoes (R$78,04) e saldo real confirmado pelo usuario 26/07 (R$78,00) - rendimento CDI do cofrinho, nao um erro (Politica secao 6). Nao ajustado silenciosamente (P1) - somado explicitamente abaixo.
VARS.pixGeralVanessaSaldo = calcularSaldoCaixa(VARS.PGV_SALDO_INICIAL_CICLO, VARS.LRPV_TRANSACOES) - VARS.PGV_RENDIMENTO_CDI_NAO_RASTREADO; // V192: derivado do array LRPV_TRANSACOES, nunca mais numero fixo dessincronizado
VARS.caixaLance = calcularSaldoCaixa(VARS.CAIXA_LANCE_SALDO_INICIAL_CICLO, VARS.CAIXA_LANCE_TRANSACOES); // V192: derivado do array CAIXA_LANCE_TRANSACOES, nunca mais numero fixo dessincronizado
VARS.caixaManutencao = calcularSaldoCaixa(VARS.MANUTENCAO_SALDO_INICIAL, VARS.MANUTENCAO_TRANSACOES);
VARS.caixaAniversarioJulio = calcularSaldoCaixa(VARS.ANIVERSARIO_JULIO_SALDO_INICIAL, VARS.ANIVERSARIO_JULIO_TRANSACOES);
VARS.caixaBoletos = calcularSaldoCaixa(VARS.BOLETOS_SALDO_INICIAL, VARS.BOLETOS_TRANSACOES);
// NOVO 31/07/2026 (V214, pedido explicito do usuario: "quero que o pagamento desses boletos sejam
// automaticos"): aplicarBoletosVencidosAutomaticamente() roda no carregamento do site, compara a
// data de HOJE (real, do navegador) contra CRONOGRAMA_BOLETOS_FIXOS, e credita sozinho qualquer
// boleto cujo dia de vencimento ja passou dentro da janela do ciclo atual (25/dia_abertura ate hoje) -
// sem duplicar os que ja foram lancados manualmente (checa por TX antes de inserir). O que isso NAO
// faz: nao paga o boleto de verdade no banco - so registra no sistema que ele ja deveria ter sido
// pago, poupando o usuario de ter que confirmar manualmente todo ciclo (a acao real de pagar/agendar
// continua sendo do usuario, fora do sistema).
function aplicarBoletosVencidosAutomaticamente(){
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const DIA_ABERTURA_CICLO = 25;
  // Constrói o Set de TX ja presentes no array, pra nunca duplicar um lancamento manual ja feito
  const txJaLancados = new Set(VARS.BOLETOS_TRANSACOES.map(t=>t.tx));
  VARS.CRONOGRAMA_BOLETOS_FIXOS.forEach(boleto => {
    if(txJaLancados.has(boleto.tx)) return; // ja foi lancado manualmente ou em rodada anterior - nao duplica
    // O boleto "ja venceu dentro do ciclo atual" se o dia de hoje for >= dia de vencimento E o
    // vencimento cair depois da abertura do ciclo (25). Ciclos que atravessam virada de mes (ex:
    // vencimento dia 10, ciclo aberto dia 25) sao tratados como NAO vencidos ainda neste ciclo -
    // vencem no PROXIMO ciclo (apos a proxima virada do dia 25).
    const vencidoNesteCiclo = boleto.diaVencimento >= DIA_ABERTURA_CICLO
      ? diaHoje >= boleto.diaVencimento
      : false; // dia < 25 so vence no ciclo seguinte, nunca no atual (que abriu dia 25)
    if(vencidoNesteCiclo){
      VARS.BOLETOS_TRANSACOES.push({
        tx: boleto.tx, data: diaHoje+'/'+String(hoje.getMonth()+1).padStart(2,'0'),
        nome: boleto.nome + ' (auto-creditado por vencimento, dia '+boleto.diaVencimento+')',
        tipo: 'Saída', valor: boleto.valor
      });
    }
  });
}
aplicarBoletosVencidosAutomaticamente();
VARS.caixaBoletos = calcularSaldoCaixa(VARS.BOLETOS_SALDO_INICIAL, VARS.BOLETOS_TRANSACOES); // recalcula apos o auto-credito acima
VARS.caixaPixVanessa = calcularSaldoCaixa(VARS.PV_SALDO_INICIAL, VARS.PV_TRANSACOES);
VARS.caixaEventos = calcularSaldoCaixa(VARS.EVENTOS_SALDO_INICIAL, VARS.EVENTOS_TRANSACOES);
VARS.caixaSeguroEmplacamento = calcularSaldoCaixa(VARS.SEGURO_EMPLACAMENTO_SALDO_INICIAL, VARS.SEGURO_EMPLACAMENTO_TRANSACOES);
VARS.caixaCombustivel = calcularSaldoCaixa(VARS.COMBUSTIVEL_SALDO_INICIAL, VARS.COMBUSTIVEL_TRANSACOES);
VARS.caixaChurrasco = calcularSaldoCaixa(VARS.CHURRASCO_SALDO_INICIAL, VARS.CHURRASCO_TRANSACOES);
VARS.escolaJulioSaldo = calcularSaldoCaixa(VARS.ESCOLA_JULIO_SALDO_INICIAL, VARS.ESCOLA_JULIO_TRANSACOES);
VARS.caixaMastercardInfinite = calcularSaldoCaixa(VARS.MASTERCARD_INFINITE_SALDO_INICIAL, VARS.MASTERCARD_INFINITE_TRANSACOES);
VARS.provisionadoWartsila = calcularSaldoCaixa(VARS.WARTSILA_CAIXA_SALDO_INICIAL, VARS.WARTSILA_CAIXA_TRANSACOES);
VARS.contaSuavizacao = calcularSaldoCaixa(VARS.SUAVIZACAO_SALDO_INICIAL, VARS.SUAVIZACAO_TRANSACOES); // V205: Fundo de Suavizacao ativado - 16a caixa com saldo derivado
// V193: caixaVariavelSaldoReal - so recalcula o snapshot do ciclo ATUAL (2026-07). O ciclo fechado
// (2026-06) permanece intocado, com seu valor congelado original - e historico, nao deve mudar.
// CORRIGIDO 29/07/2026 (V203, varredura de bugs): livroLRC e livroLRCQtdLancamentos eram numeros
// FIXOS (R$215,86 / 1 lancamento) - nao acompanhavam o array LRC_LIMBO_TRANSACOES. Quando as 3
// despesas de viagem (TX000172/173/174) foram movidas do LRW para o LRC hoje, o painel de Livros
// Razao continuou mostrando so o Outback. Agora derivam do array real, sempre.
// V222: opcoesVendidasValorMercado agora deriva da soma de VARS.opcoesVendidasDetalhe, nunca mais
// numero fixo dessincronizado (era o mesmo bug ja corrigido em ~17 outras caixas neste sistema).
// CORRIGIDO 03/08/2026 (pedido do usuario): "Valor de mercado (posicoes ATIVAS)" nao deve mais somar
// posicao ja vencida (ex: PETRS368W5, venceu 31/07/2026) - por definicao uma posicao encerrada nao
// tem mais "valor de mercado" de posicao aberta. o.vencida e calculado 1x aqui (unica fonte, P1) e
// reaproveitado depois na tabela da secao 17 (nunca duplicado) - o registro em si NAO e apagado do
// array (P6, rastreabilidade), so sai da soma/da lista de posicoes ativas exibida.
const parseVencimentoBR = str => { const [d,m,a] = str.split('/').map(Number); return new Date(a,m-1,d); };
const HOJE_OPCOES = new Date();
VARS.opcoesVendidasDetalhe.forEach(o => { o.vencida = parseVencimentoBR(o.vencimento) < HOJE_OPCOES; });
VARS.opcoesVendidasValorMercado = Math.round(VARS.opcoesVendidasDetalhe.filter(o=>!o.vencida).reduce((s,o)=>s+o.valorMercado,0)*100)/100;

// NOVO 03/08/2026 (Módulo 17 - Rentabilidade da Operação/ROC): mede o retorno do prêmio líquido sobre
// o capital comprometido (strike x 100 x contratos) - não mede lucro capturado, mede rentabilidade
// sobre o dinheiro travado, pra comparar com CDI/renda fixa. Roda em cima de VARS.opcoesVendidasDetalhe,
// nenhum dado duplicado. Documentado na especificação enviada pelo usuário.
(function calcularROCOpcoes(){
  const parseDataNota = str => {
    // notaCorretagem vem no formato "12345678 (DD/MM/AAAA)" - extrai a data entre parênteses.
    const m = str && str.match(/\((\d{2})\/(\d{2})\/(\d{4})\)/);
    if(!m) return null;
    return new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
  };
  const parseDataBR = str => {
    if(!str) return null;
    const [d,mo,a] = str.split('/').map(Number);
    return new Date(a, mo-1, d);
  };
  const hoje = new Date();

  // Classificação de status (🔴 Fraca / 🟡 Boa / 🟢 Muito Boa / 🔵 Excelente) - extraída pra função
  // reutilizável (03/08/2026, layout do ROC) porque agora é usada tanto por posição quanto no
  // card consolidado da carteira (antes só existia por posição, o card consolidado não tinha status
  // nenhum). "classe" mapeia pra uma das 4 classes .badge já existentes em styles.css (bg/ba/br/bb),
  // mesmas cores do emoji, sem inventar CSS novo.
  const classificarStatusROC = (rentMensalPct) => {
    const lim = VARS.ROC_STATUS_LIMITES;
    if(rentMensalPct < VARS.CDI_MENSAL_ATUAL) return { label: 'Fraca', emoji: '🔴', classe: 'br' };
    if(rentMensalPct <= lim.boaAte) return { label: 'Boa', emoji: '🟡', classe: 'ba' };
    if(rentMensalPct <= lim.muitoBoaAte) return { label: 'Muito Boa', emoji: '🟢', classe: 'bg' };
    return { label: 'Excelente', emoji: '🔵', classe: 'bb' };
  };

  VARS.opcoesVendidasDetalhe.forEach(o => {
    const dataVenda = parseDataNota(o.notaCorretagem);
    const dataVencimento = parseDataBR(o.vencimento);
    // Se o vencimento já passou, a operação está encerrada - usa a data de vencimento como fim da
    // contagem de dias (não a data de hoje, que continuaria somando dias de uma posição que já fechou).
    const dataReferencia = (dataVencimento && dataVencimento < hoje) ? dataVencimento : hoje;

    let diasOperacao = null;
    if(dataVenda){
      diasOperacao = Math.round((dataReferencia - dataVenda) / 86400000);
      if(diasOperacao < 1) diasOperacao = 1; // mesmo dia (ex: PETRS368W5 venceu no próprio dia) - evita divisão por zero
    }

    // Contratos = |quantidade| / 100 (padrão B3, 1 contrato = 100 ações). Capital Travado = Strike x 100 x Contratos.
    const contratos = Math.round(Math.abs(o.quantidade) / 100);
    // precoExercicio pode ser null quando o strike ainda não foi confirmado por print/nota - não
    // força um número, documenta como lacuna (P1), ROC fica indisponível pra esse item. (Não há
    // nenhum caso assim no momento, 03/08/2026 — todas as 3 posições têm strike confirmado.)
    const capitalTravado = (o.precoExercicio !== null && o.precoExercicio !== undefined)
      ? Math.round(o.precoExercicio * 100 * contratos * 100) / 100
      : null;

    const premioLiquido = o.premioRecebido; // já é o líquido (ver comentário na origem do dado acima)

    let rentabilidade = null, rentabilidadeMensal = null, rentabilidadeAnual = null, statusROC = null, comparacaoCDI = null;
    if(capitalTravado !== null && premioLiquido !== null && diasOperacao){
      rentabilidade = premioLiquido / capitalTravado; // fração, ex: 0.042
      rentabilidadeMensal = rentabilidade * 30 / diasOperacao;
      rentabilidadeAnual = Math.pow(1 + rentabilidade, 365 / diasOperacao) - 1;

      const cdiMensalFracao = VARS.CDI_MENSAL_ATUAL / 100;
      comparacaoCDI = cdiMensalFracao > 0 ? (rentabilidadeMensal / cdiMensalFracao) : null;

      const rentMensalPct = rentabilidadeMensal * 100;
      statusROC = classificarStatusROC(rentMensalPct);
    }

    o.roc = {
      contratos, diasOperacao, capitalTravado, premioLiquido,
      rentabilidade, rentabilidadeMensal, rentabilidadeAnual, comparacaoCDI, statusROC,
    };
  });

  // Consolidado da carteira: soma capital travado / soma prêmio líquido (só entre os itens com ROC
  // calculável - item sem strike confirmado ficaria de fora da soma, não forçado a zero; desde
  // 03/08/2026 as 3 posições atuais têm strike confirmado, então nenhuma fica excluída no momento).
  // CORRIGIDO 03/08/2026 (pedido do usuario - "capital travado deve ser removido da opção que já
  // venceu"): faltava o filtro !o.vencida aqui - o mesmo padrão já usado em opcoesVendidasValorMercado
  // (linha ~1250) não tinha sido replicado neste consolidado. Resultado prático: PETRS368W5 (venceu
  // 31/07/2026, capital travado R$3.686,00) continuava dentro da soma consolidada (R$19.422,00 errado),
  // mesmo já fora da tabela de posições ativas e do Valor de Mercado. Agora consistente com o resto do
  // sistema - posição vencida não é mais "capital travado" (não há mais nada travado nela).
  const comROC = VARS.opcoesVendidasDetalhe.filter(o => o.roc.capitalTravado !== null && !o.vencida);
  const somaCapital = Math.round(comROC.reduce((s,o) => s + o.roc.capitalTravado, 0) * 100) / 100;
  const somaPremio = Math.round(comROC.reduce((s,o) => s + o.roc.premioLiquido, 0) * 100) / 100;
  const rentabilidadeCarteira = somaCapital > 0 ? somaPremio / somaCapital : null;
  const diasMedios = comROC.length ? Math.round(comROC.reduce((s,o) => s + o.roc.diasOperacao, 0) / comROC.length) : null;  // Rentabilidade mensal/anualizada da carteira usam os dias médios como padronização (mesma lógica
  // aplicada item a item, agora no consolidado).
  const rentMensalCarteira = (rentabilidadeCarteira !== null && diasMedios) ? rentabilidadeCarteira * 30 / diasMedios : null;
  const rentAnualCarteira = (rentabilidadeCarteira !== null && diasMedios) ? Math.pow(1 + rentabilidadeCarteira, 365/diasMedios) - 1 : null;
  const cdiMensalFracao = VARS.CDI_MENSAL_ATUAL / 100;
  const comparacaoCDICarteira = (rentMensalCarteira !== null && cdiMensalFracao > 0) ? rentMensalCarteira / cdiMensalFracao : null;
  // NOVO 03/08/2026 (layout do ROC, pedido do usuario): status do consolidado, mesma classificacao
  // usada por posicao - antes o card resumo nao tinha nenhum indicador de status.
  const statusROCCarteira = (rentMensalCarteira !== null) ? classificarStatusROC(rentMensalCarteira * 100) : null;

  VARS.rocCarteira = {
    capitalTravado: somaCapital,
    premioLiquido: somaPremio,
    rentabilidade: rentabilidadeCarteira,
    rentabilidadeMensal: rentMensalCarteira,
    rentabilidadeAnualizada: rentAnualCarteira,
    comparacaoCDI: comparacaoCDICarteira,
    diasMedios,
    statusROC: statusROCCarteira,
    // CORRIGIDO 04/08/2026 (achado do usuario via print - legenda dizia "falta de strike confirmado"
    // pra PETRS368W5, que na verdade estava fora por estar VENCIDA, nao por falta de strike - a mesma
    // variavel itensExcluidos servia pros 2 motivos, texto fixo so cobria 1 deles). Agora os 2 motivos
    // sao contados separado, pra legenda dizer o motivo certo em cada caso.
    itensSemStrike: VARS.opcoesVendidasDetalhe.filter(o => o.roc.capitalTravado === null).length,
    itensVencidosExcluidos: VARS.opcoesVendidasDetalhe.filter(o => o.roc.capitalTravado !== null && o.vencida).length,
  };
})();
// CORRIGIDO 31/07/2026 (V225, achado do usuario): necessidadeLiquidaHeld (patamar final da projecao de 12
// meses, usado no badge "Queda total" da Necessidade Liquida) era um numero solto editado numa sessao
// diferente de totalOperacionalHeld (mesmo patamar final, mas do Total Operacional) - por isso o badge
// "Queda total" e o badge "Alivio ate Mar/27" (que usam esses 2 numeros como base) davam resultados
// diferentes (R$1.370,79 vs R$1.276,78) sem motivo real: o necessidadeLiquidaHeld antigo embutia uma
// Cobertura Garantida futura de ~R$954,90 que nunca existiu (a real e R$0,00, so conta quando confirmada -
// V175). Agora SEMPRE derivado do mesmo totalOperacionalHeld + Orcamento Operacional - Cobertura Garantida
// real, igual a formula que ja vale pro ciclo atual (necessidadeLiquida = necessidadeTotalBruta -
// coberturaGarantida) - nunca mais 2 numeros independentes podendo divergir.
VARS.necessidadeLiquidaHeld = Math.round((VARS.totalOperacionalHeld + VARS.orcamentoOperacional - VARS.coberturaGarantidaConfirmada) * 100) / 100;
// NOVO 01/08/2026 (V255, pedido do usuário): trava de consistência pras leituras solares. O medidor
// bidirecional NUNCA zera e os codigos 03/103 SO PODEM subir de uma leitura pra outra (nunca descer) -
// se um valor novo vier menor que o anterior, e quase certamente erro de leitura/digitacao (nao um
// dado real). Gera um aviso visivel em vez de aceitar cego. Nao bloqueia o calculo (mantem o numero
// como veio, documentado) - so avisa, pra decisao ficar com o usuario/Claude na proxima sessao.
VARS.SOLAR_AVISOS_CONSISTENCIA = [];
for(let i=1;i<VARS.SOLAR_LEITURAS.length;i++){
  const anterior = VARS.SOLAR_LEITURAS[i-1];
  const atual = VARS.SOLAR_LEITURAS[i];
  if(atual.leitura03 < anterior.leitura03){
    VARS.SOLAR_AVISOS_CONSISTENCIA.push(`Código 03 caiu de ${anterior.leitura03} (${anterior.data}) para ${atual.leitura03} (${atual.data}) — o medidor nunca deveria retroceder. Confira a leitura.`);
  }
  if(atual.leitura103 < anterior.leitura103){
    VARS.SOLAR_AVISOS_CONSISTENCIA.push(`Código 103 caiu de ${anterior.leitura103} (${anterior.data}) para ${atual.leitura103} (${atual.data}) — o medidor nunca deveria retroceder. Confira a leitura.`);
  }
  if(atual.geracaoAcumulada!=null && anterior.geracaoAcumulada!=null && atual.geracaoAcumulada < anterior.geracaoAcumulada){
    VARS.SOLAR_AVISOS_CONSISTENCIA.push(`Geração acumulada do inversor caiu de ${anterior.geracaoAcumulada} (${anterior.data}) para ${atual.geracaoAcumulada} (${atual.data}) — confira a leitura da SAJ.`);
  }
}
// NOVO 31/07/2026: deriva credito/consumo/saldo por casa para cada leitura solar registrada.
// Formulas de Base_Calculo_Rateio_Solar.md secao 3, executadas aqui (nunca hardcoded a mao).
VARS.SOLAR_LEITURAS_CALC = VARS.SOLAR_LEITURAS.map(l=>{
  const creditoLiquido = Math.round((l.leitura103 - l.leitura03)*100)/100;
  const creditoWallace = Math.round(creditoLiquido * VARS.solarRateioWallace * 100)/100;
  const creditoIrma = Math.round(creditoLiquido * VARS.solarRateioIrma * 100)/100;
  const consumoEspWallace = Math.round(VARS.solarConsumoDiarioWallace * l.dias * 100)/100;
  const consumoEspIrma = Math.round(VARS.solarConsumoDiarioIrma * l.dias * 100)/100;
  return Object.assign({}, l, {
    creditoLiquido, creditoWallace, creditoIrma, consumoEspWallace, consumoEspIrma,
    saldoWallace: Math.round((creditoWallace - consumoEspWallace)*100)/100,
    saldoIrma: Math.round((creditoIrma - consumoEspIrma)*100)/100,
  });
});
VARS.livroLRC = Math.round(VARS.LRC_LIMBO_TRANSACOES.reduce((s,t)=>s+t.valor,0)*100)/100;
VARS.livroLRCQtdLancamentos = VARS.LRC_LIMBO_TRANSACOES.length;
// CORRIGIDO 31/07/2026 (V223, pedido do usuario - "perna 3 e o LRC devem refletir a mesma coisa"):
// mbLRCConfirmado era um numero MANUAL duplicado de VARS.livroLRC (coincidentemente igual ate agora,
// mas sem garantia - mesmo padrao de bug ja corrigido em ~17 outras caixas). Agora sempre = livroLRC,
// nunca mais editado a mao separadamente.
VARS.mbLRCConfirmado = VARS.livroLRC;
// V203: aporteBTGProgramado agora DERIVA - Caixa Lance atual + LREI ativos (que voltam quando quitados)
// + rendimento programado da Reserva. Antes eram 3 numeros fixos que nao acompanhavam a Caixa Lance real.
VARS.aporteBTGProgramado.caixaLanceCompleta = Math.round((VARS.caixaLance + VARS.LREI_ATIVAS.filter(l=>l.status==='ATIVO').reduce((s,l)=>s+l.valor,0))*100)/100;
VARS.aporteBTGProgramado.rendimentoReserva = VARS.reservaRetiradaProgramada.valorProjetado;
VARS.aporteBTGProgramado.total = Math.round((VARS.aporteBTGProgramado.caixaLanceCompleta + VARS.aporteBTGProgramado.rendimentoReserva)*100)/100;
VARS.CICLO_SNAPSHOTS['2026-07'].caixaVariavelSaldoReal = calcularSaldoCaixa(VARS.CAIXA_VARIAVEL_SALDO_INICIAL_CICLO, VARS.CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL);
// CORRIGIDO 29/07/2026 (V202): caixaVariavelComprometido estava CONGELADO em R$584,48 desde 26/07 -
// mesmo bug ja corrigido em 15 outras caixas (numero fixo nunca atualizado quando novas compras
// entravam). Politica secao 13: "CAIXA_VARIAVEL_COMPROMETIDO = soma de TODAS as transacoes LRW+LRV
// do ciclo atual". Agora deriva de verdade dos 4 registradores que ja capturam isso.
VARS.CICLO_SNAPSHOTS['2026-07'].caixaVariavelComprometido = Math.round((VARS.visaLRWHistorico + VARS.visaLRVHistorico + VARS.mbLRWConfirmado + VARS.mbLRVConfirmado) * 100) / 100;
VARS.CICLO_SNAPSHOTS['2026-07'].caixaVariavelDisponivel = Math.round((VARS.CICLO_SNAPSHOTS['2026-07'].caixaVariavelSaldoReal - VARS.CICLO_SNAPSHOTS['2026-07'].caixaVariavelComprometido) * 100) / 100;
// 14 caixas patrimoniais + Caixa Variavel migradas - todas seguem o mesmo padrao calcularSaldoCaixa(),
// nenhuma mais e numero fixo editado a mao. Testar cada uma via harness antes de prosseguir (ver sessao de testes).

// V145 (25/07/2026): aplica o snapshot do ciclo selecionado aos campos POR-CICLO do VARS, ANTES do REG
// ser construido - assim o REG ja nasce lendo o ciclo certo. Campos de FLUXO CONTINUO (necessidade
// total, patrimonio, faturas obrigatorias MB/MP) NAO sao tocados - permanecem os mesmos em qualquer ciclo.
// V174 (26/07/2026): guarda uma copia dos arrays "vivos" do ciclo ATUAL (antes de qualquer troca de
// ciclo poder sobrescreve-los) - pedido do usuario: "cada mes deve mostrar o seu igual excel... o site
// so deveria mostrar o que e do seu ciclo". Sem isso, trocar para o ciclo fechado e depois voltar pro
// atual perderia as transacoes reais (compras de hoje) para sempre dentro da sessao.
const LRW_TRANSACOES_CICLO_ATUAL = VARS.LRW_TRANSACOES;
const LRV_TRANSACOES_CICLO_ATUAL = VARS.LRV_TRANSACOES;
const LRC_LIMBO_TRANSACOES_CICLO_ATUAL = VARS.LRC_LIMBO_TRANSACOES;
const LRPV_TRANSACOES_CICLO_ATUAL = VARS.LRPV_TRANSACOES;
const CARTAO_INFINITE_CICLO_ATUAL = VARS.cartaoInfiniteTotal;
const CARTAO_MB_CICLO_ATUAL = VARS.cartaoMBTotal;
const MERCADO_PAGO_CICLO_ATUAL = VARS.mercadoPagoFatura;

function aplicarCicloAoVARS(cicloKey){
  const snap = VARS.CICLO_SNAPSHOTS[cicloKey];
  if(!snap){ console.error('Ciclo nao encontrado:', cicloKey); return; }
  VARS.cicloAtual = cicloKey;
  VARS.caixaVariavelSaldoReal = snap.caixaVariavelSaldoReal;
  VARS.caixaVariavelComprometido = snap.caixaVariavelComprometido;
  VARS.tolerenciaTemp = snap.toleranciaTempValor;
  VARS.salario = snap.salario;
  VARS.reembolsoCicloTotal = Math.round((snap.reembolsoRecebido + snap.reembolsoAReceber)*100)/100;
  VARS.__reembolsosAReceber = snap.reembolsoAReceber;
  VARS.faturaWartsila = snap.cascata.faturaWartsila;
  // CORRIGIDO 31/07/2026 (V223, pedido do usuario): reembolsoPagaCartaoCorporativo (perna 3, "Corporativo
  // cartao Infinite/MB") lia de snap.cascata.cartaoCorporativo, um numero manual desconectado dos livros
  // reais - por isso ficava 0 mesmo com R$297,31 ja lancados no LRC (MB) este ciclo. Agora deriva de
  // verdade dos 2 livros corporativos (Visa + MB), nunca mais dessincroniza. cartaoCorporativo dentro do
  // snapshot fica so como registro historico/override manual quando necessario via cicloAtualOverrides,
  // mas nao e mais a fonte primaria deste calculo.
  VARS.reembolsoPagaCartaoCorporativo = Math.round((VARS.livroLRCVisaOnly + VARS.livroLRC) * 100) / 100;
  VARS.reembolsoPagaMPCorporativo = snap.cascata.mpCorporativo;

  // V174: Visa/MB/MP e as 4 tabelas de Livros Razao agora respeitam o ciclo selecionado - nunca mais
  // mostram o mesmo numero em ciclos diferentes. Ciclo ATUAL usa os arrays/valores "vivos" (que mudam
  // a cada compra, via Supabase); ciclo FECHADO usa a fotografia congelada salva no proprio snapshot.
  if(snap.fechado){
    VARS.cartaoInfiniteTotal = snap.visaInfiniteComprometido;
    VARS.cartaoMBTotal = snap.mastercardBlackComprometido;
    VARS.mercadoPagoFatura = snap.mercadoPagoFaturaCongelada;
    VARS.LRW_TRANSACOES = snap.LRW_TRANSACOES;
    VARS.LRV_TRANSACOES = snap.LRV_TRANSACOES;
    VARS.LRC_LIMBO_TRANSACOES = snap.LRC_LIMBO_TRANSACOES;
    VARS.LRPV_TRANSACOES = snap.LRPV_TRANSACOES;
  } else {
    VARS.cartaoInfiniteTotal = CARTAO_INFINITE_CICLO_ATUAL;
    VARS.cartaoMBTotal = CARTAO_MB_CICLO_ATUAL;
    VARS.mercadoPagoFatura = MERCADO_PAGO_CICLO_ATUAL;
    VARS.LRW_TRANSACOES = LRW_TRANSACOES_CICLO_ATUAL;
    VARS.LRV_TRANSACOES = LRV_TRANSACOES_CICLO_ATUAL;
    VARS.LRC_LIMBO_TRANSACOES = LRC_LIMBO_TRANSACOES_CICLO_ATUAL;
    VARS.LRPV_TRANSACOES = LRPV_TRANSACOES_CICLO_ATUAL;
  }
}
aplicarCicloAoVARS(VARS.cicloAtual); // aplica o ciclo padrao (2026-07) ANTES do REG nascer

const REG = {
  patrimonio: {
    // DERIVADO em recalcularAgregadosDerivados(): total = VARS.reserva+VARS.btgNecton+VARS.caixaLance+VARS.nectonContaCorrente
    total: 0,          // preenchido no boot, nunca editar aqui
    metaMilhaoPct: 0,  // preenchido no boot = total/metaMilhao*100
    metaMilhao: 1000000,
    metaEscolaJulio: VARS.metaEscolaJulio
  },
  operacional: {
    salario: VARS.salario,
    reembolsosAReceber: VARS.__reembolsosAReceber !== undefined ? VARS.__reembolsosAReceber : 0,     // V145: le do ciclo selecionado (era hardcoded 0)
    reembolsoCicloTotal: VARS.reembolsoCicloTotal,        // Recebidos (4.914,98, ja inclui a TED de 21/07) + A Receber (0) - regra V50
    reembolsoPagaWartsila: VARS.faturaWartsila,       // V137: le do VARS (fatura paga integralmente pelo reembolso - mesmo numero, 4a copia eliminada)
    reembolsoPagaCartaoCorporativo: VARS.reembolsoPagaCartaoCorporativo, // NOMEADO V128, corrigido (era 483.43 - extrato real do cofrinho "Fatura Visa Infinit")
    reembolsoSobraPessoal: 0,      // SOBRESCRITO por recalcularAgregadosDerivados() logo apos o REG - este valor aqui e so o ultimo snapshot conhecido, para leitura humana.
    reembolsoPagaMPCorporativo: VARS.reembolsoPagaMPCorporativo, // Transporte corporativo (perna 2 da cascata, varia por ciclo)
    entradasTotais: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = salario + reembolsoCicloTotal. V128 CORRIGIDO (bug real): formula antiga usava reembolsosAReceber, que ia a zero quando o reembolso chegava, fazendo entradasTotais CAIR errado. Era R$36.138,37.
    totalOperacional: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = soma de totalOpDetalhe. Editar os componentes, nao este numero. V111: -R$88,00 (Vivo atualizada).
    orcamentoOperacional: VARS.orcamentoOperacional,
    proLaboreFixo: VARS.proLaboreFixo, // ATIVADO 25/07/2026 (V143): usado para calcular saldoCicloBase/modoOperacional dinamicamente
    necessidadeTotalBruta: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = totalOperacional + orcamentoOperacional. V111: -R$88,00.
    coberturaGarantida: VARS.coberturaGarantida,     // Sem alteracao.
    necessidadeLiquida: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = necessidadeTotalBruta - coberturaGarantida. V111: -R$88,00.
    saldoCiclo: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = balanco.fluxo.entradas - necessidadeTotalBruta. V111: +R$88,00.
    modoOperacional: 'Normal', // CORRIGIDO 25/07/2026 (V144): placeholder inicial - SEMPRE sobrescrito por recalcularAgregadosDerivados() com base no saldoCiclo real (secao 10 Politicas). Antes ficava fixo em 'Alto' manualmente, nunca recalculava - bug corrigido, confirmado pelo usuario que o calculo dinamico deve valer mesmo quando mostrar Normal/Baixo/Critico.
    // totalOperacionalMar27 removido (16/07/2026): era um 3o registrador duplicado do mesmo valor
    // ja presente em evolucao.totalOperacional[ultimo ponto] - agora calculado dinamicamente no hydrate().
  },
  caixaVariavel: {
    saldoReal: VARS.caixaVariavelSaldoReal,
    comprometido: VARS.caixaVariavelComprometido,
    disponivel: 0,          // DERIVADO em recalcularAgregadosDerivados() = saldoReal-comprometido. Nunca editar aqui.
    tetoOficial: VARS.tetoOficial,   // meta oficial (usada no Aporte=Meta-Saldo). NAO muda com a tolerancia temporaria.
    tolerenciaTemp: VARS.tolerenciaTemp, // V78 (18/07/2026): tolerancia temporaria ate o fim do ciclo (viagem familia Vanessa) - cobre TODOS os gastos da caixa, nao so os tageados como viagem. Recomposicao prevista: reembolso Wartsilia ou salario 25/07. Zerar este campo (0) quando a tolerancia acabar.
    pendenteProximoCiclo: VARS.caixaVariavelPendenteProximoCiclo, // NOVO 23/07/2026 (regra REGRA_LIMBO_FATURA_MB_CICLO): compras no Mastercard Black feitas depois do fechamento da fatura MB (dia 22) mas ainda dentro do ciclo financeiro atual (ate dia 25) - NAO contam no comprometido DESTE ciclo (a fatura so cobra no mes seguinte), ficam represadas aqui e sao pre-debitadas do orcamento da Caixa Variavel do PROXIMO ciclo na virada do dia 25.
  },
  visa: {
    totalComprometido: 0,   // DERIVADO = VARS.cartaoInfiniteTotal + VARS.cartaoMBTotal
    pessoal: 0              // DERIVADO = totalComprometido - reembolsoPagaCartaoCorporativo
  },
  cartaoInfinite: { total: VARS.cartaoInfiniteTotal },
  p2p: {
    capitalTotal: VARS.p2pCapitalTotal,
    creditosTotal: VARS.p2pCreditosTotal,
    creditosRestantes: VARS.p2pCreditosRestantes,
    creditosVendidos: VARS.p2pCreditosVendidos,
    precoCompra: VARS.p2pPrecoCompra,
    precoVenda: VARS.p2pPrecoVenda,
    lucroRealizado: VARS.p2pLucroRealizado,
    saldoInvestido: 0,   // DERIVADO em recalcularAgregadosDerivados() = creditosRestantes * precoCompra
    rentabilidadePct: 0  // DERIVADO = (precoVenda-precoCompra)/precoCompra*100
  },
  cartaoMB: { total: VARS.cartaoMBTotal },
  mercadoPago: VARS.mercadoPagoFatura,     // V137: le do VARS (era literal solto 1751.16, divergia do balanco.obrigacoes.mercadoPago)
  faturaWartsila: VARS.faturaWartsila,     // V137: le do VARS (era 3a copia literal do mesmo numero)
  // V137: excedente DERIVADO (investido-meta) em vez de literal verificado a mao - a correcao de 20/07
  // (V107, erro de subtracao de R$1,00) so foi encontrada porque o usuario reconferiu a mao; formula
  // elimina essa classe de erro para sempre. investido/meta leem do VARS.
  metaInvestimento: { investido:0, meta: VARS.metaInvestimentoValor, excedente: 0 }, // investido DERIVADO = aporteBTGPactual+depositoAtivacaoNecton
  lrei0001: 0, // V121: QUITADO (reembolso Wartsila, deposito direto na Caixa Manutencao). Era R$178,64.
  suporteCoIrmaEventos: VARS.suporteCoIrmaEventos, // 13/07/2026, Eventos->Variavel, mesmo proposito (visita familia Vanessa) - nao e LREI

  // ===== FASE 2 (16/07/2026) - graficos de composicao (g_cTotalOp, g_cVisa, g_cMetas, g_cCaixas) =====
  patrimonioDetalhe: { reserva:VARS.reserva, btg:VARS.btgNecton, caixaLance:VARS.caixaLance, nectonContaCorrente:VARS.nectonContaCorrente }, // V134: agora le do VARS (fonte unica) - antes eram numeros duplicados aqui e em patrimonio.total, ficavam dessincronizados.
  escolaJulioSaldo: VARS.escolaJulioSaldo, // V134: le do VARS. Fora do Patrimonio Total/Meta Milhao desde V47 (16/07/2026) - existe como reserva/caixa propria, nao patrimonio liquido de gestao ativa
  // V135 (22/07/2026, auditoria SSOT): visaDetalhe somava R$9.024,11 vs cartaoInfinite.total (fatura real,
  // VARS) R$9.073,92 - gap de R$49,81. Investigado: NAO e erro de nenhum item, e o mesmo residuo entre
  // "soma dos livros de transacao" x "fatura real do banco" ja documentado no ERP desde a reconciliacao
  // V128 (fatura sempre vence, regra V61) - nunca foi re-itemizado transacao a transacao. Em vez de
  // forcar/inventar em qual categoria o R$49,81 pertence (violaria P1), adicionado como linha propria
  // "naoReconciliado", visivel e documentada - mesmo padrao ja usado para outras diferencas residuais
  // do sistema (ex: CORRECAO_15072026_007, R$36,90 na epoca). Agora a soma bate exatamente com a fatura.
  visaDetalhe: { parcelas:VARS.livroLRP, consorcios:VARS.livroLRCONVisaOnly, wallace:VARS.visaLRWHistorico, recorrencias:VARS.visaLRRConfirmado, corp:VARS.livroLRCVisaOnly, assinaturas:VARS.visaLRSConfirmado, vanessa:VARS.visaLRVHistorico, naoReconciliado:VARS.visaNaoReconciliado },
  // V135: wallace CORRIGIDO 1161.94 -> 1349.93 (= LIVRO_LRW_MB_TOTAL do ERP, V121 - TX128/129/130 de
  // 21/07 nunca tinham propagado pra ca). Era o unico motivo do mbDetalhe nao bater com cartaoMBTotal
  // (gap de R$187,99): 1161,94+614,45+43,80=1.820,19 vs VARS.cartaoMBTotal=2.008,18. Agora soma exato.
  mbDetalhe: { parcelas:0, consorcios:VARS.livroLRCON, wallace:VARS.mbLRWConfirmado, recorrencias:VARS.mbLRRConfirmado, corp:VARS.mbLRCConfirmado, assinaturas:VARS.mbLRSConfirmado, vanessa:VARS.mbLRVConfirmado },
  // V136 (22/07/2026): visaDetalhe.vanessa +R$17,98 (TX131, H57Store, cartao 4845) e mbDetalhe.wallace
  // +R$56,99 (TX132, Google SunSurveyorApp, cartao 2244) - ambos ja embutidos acima. Soma continua
  // batendo exato com cartaoInfiniteTotal/cartaoMBTotal (checks #11/#12 da auditoria confirmam).
  // V135: parcelas/consorcios agora leem do VARS (fonte unica, eliminada a 2a copia que existia aqui).
  // recorrencias/assinaturas: 0 e placeholder - DERIVADOS em recalcularAgregadosDerivados() a partir de
  // visaDetalhe+mbDetalhe (eram numeros literais que so por coincidencia batiam com a soma das partes;
  // agora e formula, nunca mais pode dessincronizar).
  totalOpDetalhe: { boletos:VARS.totalOpBoletos, parcelas:VARS.livroLRP, consorcios:VARS.livroLRCON, recorrencias:VARS.mbLRRConfirmado, aportesPat:VARS.totalOpAportesPat, provMP:VARS.totalOpProvMP, assinaturas:VARS.mbLRSConfirmado },
  // V137: milhaoPct e escolaPct viram DERIVADOS (alimentam o grafico "Progresso das metas patrimoniais").
  // milhaoPct estava TRAVADO em 11,54% desde antes da correcao V135 (que levou patrimonio.metaMilhaoPct
  // pra 11,57%) - o grafico mostraria o percentual errado. escolaPct tambem estava desatualizado (5,47%
  // vs o real ~5,49%).
  metasPatrimoniais: { milhaoPct:0, casaNovaPct:VARS.consorcioCasaPagoPct, autoPct:VARS.consorcioAutoPagoPct, escolaPct:0 },
  caixasOperacionais: {
    boletos:            { saldo:VARS.caixaBoletos,            meta:2600 },
    pixVanessa:          { saldo:VARS.caixaPixVanessa,         meta:1200 },
    manutencao:          { saldo:VARS.caixaManutencao,         meta:2000 },
    eventos:             { saldo:VARS.caixaEventos,            meta:2000 },
    saudeFamilia:        { saldo:VARS.caixaSaudeFamilia,       meta:1600 },
    aniversarioJulio:    { saldo:VARS.caixaAniversarioJulio,   meta:400  },
    seguroEmplacamento:  { saldo:VARS.caixaSeguroEmplacamento, meta:5100 },
    escolaJulio:         { saldo:VARS.escolaJulioSaldo,        meta:VARS.metaEscolaJulio }
  }, // V134: todos os saldos agora leem do VARS (fonte unica) - antes eram literais duplicados aqui, em balanco.reservas e em escolaJulioSaldo separadamente, 3 copias que ja dessincronizaram nesta sessao.
  // V143: card "Fatura Wartsila" (secao 05) tinha "excedente R$23,84" como texto fixo - agora DERIVADO.
  wartsilaCaixa: { provisionado: VARS.provisionadoWartsila, fatura: VARS.faturaWartsila, excedente: 0 },
  pixDiversos: { saidas: VARS.pixDiversosSaidas, entradas: VARS.pixDiversosEntradas, liquido: 0 },
  livroLRCDetalhe: { qtd: VARS.livroLRCQtdLancamentos, valor: VARS.livroLRC },

  // ===== FASE 3 (16/07/2026) - pagina Cenarios inteira + totais agregados dos livros razao =====
  reserva: {
    atual: VARS.reserva,
    piso: VARS.reservaPiso // "so o piso" - gasto minimo essencial, nao inclui aportes patrimoniais (conceito distinto de necessidadeTotalBruta)
  },
  // V139: secoes 12/13 do painel (Consorcio Casa Nova / Projeto Casa Nova) - antes 100% hardcoded no HTML.
  consorcioCasaNova: {
    cartaCredito: VARS.consorcioCasaCartaCredito,
    parcela: VARS.consorcioCasaParcela,
    pagoPct: VARS.consorcioCasaPagoPct,       // extrato real, nao derivado (ver nota no VARS)
    quitacaoValor: VARS.consorcioCasaQuitacao,
    quitacaoPct: 0 // DERIVADO = 100 - pagoPct (unica relacao interna consistente com o extrato: 100-0,42=99,58, bate exato)
  },
  projetoCasaNova: {
    capitalDisponivel: 0, // DERIVADO = VARS.btgNecton + VARS.caixaLance (era numero fixo capturado num instante passado, nunca recalculado)
    metaLance: VARS.metaLanceProjetoCasa,
    pct: 0,   // DERIVADO = capitalDisponivel / metaLance * 100
    falta: 0  // DERIVADO = metaLance - capitalDisponivel
  },
  // V142 (23/07/2026): secao 11 "Passivos patrimoniais" - a ultima secao ainda 100% hardcoded no HTML.
  // financiamentoCasa le do MESMO VARS.passivoFinanciamentoCasa ja usado no Balanco (balanco.passivos) -
  // antes o HTML desta secao tinha um numero PROPRIO e DIVERGENTE (R$61.311,95 vs R$61.326,91 no Balanco,
  // mesma divida, 2 fontes, 2 valores). Agora so existe 1 numero, usado nos 2 lugares.
  passivosPatrimoniais: {
    financiamentoCasa: VARS.passivoFinanciamentoCasa,
    prestacaoFinanciamentoCasa: VARS.prestacaoFinanciamentoCasa,
    mesesRestantesFinanciamentoCasa: VARS.mesesRestantesFinanciamentoCasa,
    consorcioAuto: VARS.passivoConsorcioAuto,
    consorcioAutoPct: VARS.consorcioAutoPagoPct,
    parcelaConsorcioAuto: VARS.parcelaConsorcioAuto
  },
  estimador: {
    liquidoProjetadoProximoCiclo: VARS.liquidoProjetadoProximoCiclo,  // Estimador de Salario - ciclo que comeca 25/07 (Ago/26)
    necessidadeLiquidaProximoCiclo: 0 // V138: DERIVADO em recalcularAgregadosDerivados() = evolucao.necessidadeLiquida[1] (2o ponto da serie, Ago/26). Era literal duplicado do mesmo numero ja presente no array.
  },
  deficitZero: {
    liquidoSemTrabalhar: VARS.liquidoSemTrabalhar, // REGRA_CENARIO_FICOU_EM_CASA
    // CORRIGIDO 04/08/2026 (parte 77, bug real apontado pelo usuario: "porque dezembro ficou maior
    // se a tendencia e das contas acabarem?"): Nov/26 e Dez/26 tinham valores MAIORES que Out/26, o
    // que e matematicamente impossivel dado que nada nesta formula reinicia antes de Jan/27 (parcelas
    // do LRP so terminam, Escola Julio 2027 so comeca em Jan/27 - ver alivioData acima, mesmo arquivo).
    // Reconstruido simulando PARCELAMENTOS_VISA avancando +1 parcela por ciclo (mesma regra ja usada
    // em outro lugar do proprio app.js) + os aportes de alivioData - validado contra o mes ATUAL
    // (bate exato com cartaoInfiniteTotal, R$1.017,89). Valores de Nov/Dez ESTIMADOS por essa
    // reconstrucao, nao auditados centavo a centavo contra boletos/assinaturas/recorrencias/consorcios
    // (assumidos constantes, mesma premissa ja documentada em legTotalOperacionalDefinicao) - avisar
    // o usuario que pode ter uma margem de erro de ~R$100-300, mesmo nivel de ruido ja visto entre
    // Ago/Set/Out antes desta correcao.
    // VALIDADO 04/08/2026 (parte 81): usuario confirmou que boletos/assinaturas/consorcios nao tem
    // data de termino conhecida entre agora e Dez/26 ("aviso caso cancele") - premissa de constancia
    // sustentada. Unico ajuste real encontrado: Vivo cai de R$523,00 pra R$435,00 a partir do proximo
    // ciclo (confirmado pelo usuario, print da fatura) - aplicado aqui como -R$88,00/mes em Nov/Dez
    // (nao retroagido pro Out, que ja estava calibrado antes dessa mudanca ser conhecida).
    // MIGRADO 04/08/2026 (parte 84, ERP->Supabase): VARS.DEFICIT_ZERO_PISO_OVERRIDE (chave de topo no
    // Supabase) sobrescreve os valores literais Ago/26..Dez/26 quando existir - mesmo motivo do
    // CARTAO_PLUGGY_MAPA acima. Indice 0 do override fica null de proposito (reservaPiso e sempre
    // dinamico/formula, nunca literal) - por isso o merge abaixo usa "??" pra so trocar os indices que
    // o Supabase de fato definiu, mantendo reservaPiso/pisoHeld como sempre foram.
    piso: (() => {
      const base = [VARS.reservaPiso,7821.63,7369.83,7373.69,6584.70,6394.71,...Array(6).fill(VARS.pisoHeld)];
      const overr = VARS.DEFICIT_ZERO_PISO_OVERRIDE;
      if(!Array.isArray(overr)) return base;
      return base.map((v,i) => (overr[i] !== undefined && overr[i] !== null) ? overr[i] : v);
    })()
  },
  superavitNormal: {
    // REGRA DEFINIDA PELO USUARIO 19/07/2026: liquidoMes(0) agora segue prioridade por DIA DO MES,
    // nao mais um valor fixo bundlado. A partir do dia 25 (quando o salario e pago), usa o valor REAL
    // recebido (liquidoReal, preenchido manualmente quando confirmado). Enquanto isso nao chega, do dia
    // 12 em diante (quando a folha de ponto gera o Estimador de Salario) usa o Liquido Projetado PURO
    // (REG.estimador.liquidoProjetadoProximoCiclo, R$16.048,51 - sem somar mais a sobra pessoal do
    // reembolso, que era um bundle errado apontado pelo usuario: mostrava R$18.545,51 em vez de
    // R$16.048,51). Antes do dia 12 (sem estimativa concreta ainda), cai na media ponderada de 12 meses
    // (REG.cenarioHistorico.mediaPonderada12M) - fallback conservador quando nao ha dado especifico do
    // ciclo. Resolvido em runtime por liquidoMes(i), definida antes do REG (topo do arquivo).
    liquidoReal: {0: 16819.56}, // ATUALIZADO 25/07/2026 (V150): salario real do ciclo atual ja recebido (24/07/2026, TX000136) - preenchido conforme a propria regra manda ("preencher quando um ciclo fechar e o valor real chegar"). Era {} (vazio).
    necessidade: [13146.21,12951.87,12620.07,12138.93,11871.07,11771.07,...Array(6).fill(VARS.necessidadeHeld)] // ATUALIZADO V150: indice 0 (ciclo atual) = NECESSIDADE_TOTAL corrigida (13146.21, ver V146/V147). Era 14317.00 (desatualizado, herdado de antes da correcao das parcelas).
  },
  livrosRazaoTotais: {
    // V137: LRW/LRV/LRC/LRS/LRR eram literais que so por coincidencia batiam com visaDetalhe+mbDetalhe -
    // viram placeholder 0, DERIVADOS em recalcularAgregadosDerivados() (verificado bater exato antes de
    // converter). LRP/LRCON ja liam do VARS desde V135. LRB/LRCV/LRPV nao tem como derivar de outro dado
    // ja presente no site (sao fonte primaria) - leem do VARS agora, unica copia editavel. LRMP le do
    // VARS.mercadoPagoFatura (fecha a mesma divergencia corrigida no card Cartoes/Balanco).
    LRW:   { total:56.99, qtd:1 }, // FILTRO POR CICLO (V152/V155): painel de Livros Razao (secao 15) mostra o limbo (TX000132, Google SunSurveyorApp, R$56,99, 22/07 pos-fechamento) + ciclo atual - nenhuma compra pessoal do Wallace no MB neste ciclo ainda (Outback foi reclassificado como corporativo). Valor HARDCODED aqui (nao deriva de mbLRWConfirmado/visaLRWHistorico, que sao o TOTAL REAL usado em auditoria/cartaoMBTotal).
    LRV:   { total:35.95, qtd:3 }, // FILTRO POR CICLO (V152/V155): painel mostra limbo (TX000154, R$30,97, 24/07) + ciclo atual (TX000156/157, R$2,49x2) = R$35,95, 3 lancamentos. Valor HARDCODED (mesma logica do LRW acima).
    LRB:   { total:VARS.livroLRB, qtd:10 },
    LRP:   { total:VARS.livroLRP, qtd:16 },
    LRS:   { total:0, qtd:12 },
    LRR:   { total:0, qtd:7  },
    LRCON: { total:VARS.livroLRCON, qtd:2 },
    LRC:   { total:0, qtd:7 }, // CORRIGIDO 25/07/2026 (V154): +1 (Outback, TX000158). Era 6.
    LRMP:  { total:VARS.mercadoPagoFatura, qtd:9 },
    LRCV:  { total:VARS.livroLRCV, qtd:28 },
    LRPV:  { total:VARS.livroLRPV, qtd:19 }
  },

  reembolsos: { recebidosNoCiclo: 0 }, // V135: DERIVADO em recalcularAgregadosDerivados() = reembolsoCicloTotal - reembolsosAReceber. Estava hardcoded em R$2.485,39 (valor de antes da 2a TED da Wärtsilä, confirmada 21/07/2026) - nunca atualizou quando reembolsosAReceber zerou, entao "Recebidos" ficava mostrando so a metade do que ja tinha entrado de verdade.

  // ===== QUALIDADE/REGRAS DE NEGOCIO (18/07/2026, V79) - "linter" enxuto: nao guarda transacao
  // por transacao (REG so tem agregados, por design - inflar isso pesaria o app.js), mas expoe os
  // poucos contadores/flags que JA sao mantidos no ERP a cada sessao. Atualizar manualmente sempre
  // que o numero mudar no ERP (mesmo padrao de todo o resto do REG).
  qualidade: {
    txSemData: 0,          // contador oficial do ERP (aba AUDITORIA_AUTOMATICA / historico SWP_INPUT). 0 = zerado em 17/07/2026 (V69).
    lreiAtivos: 2,          // CORRIGIDO 27/07/2026 (V189): LREI0002 (Saúde Família, R$164,94) + LREI0003 (Fatura Mercado Pago, R$266,23) ativas. Era 0 (desatualizado desde a quitação de LREI0001 em 21/07/2026) - o alerta "Nenhum empréstimo em aberto" estava mentindo pro usuário.
    tetoTemporarioAtivo: true // reflete caixaVariavel.tolerenciaTemp > 0
  },
  cenarioHistorico: {
    piorMes: VARS.salarioMin12M,
    mediana: VARS.salarioMediana12M,
    media: VARS.salarioMedia12M,
    mediaPonderada12M: VARS.salarioMediaPonderada12M,
    desvioPadrao: VARS.desvioPadraoSalario
  },
  evolucao: {
    // PADRAO 12 MESES ROLANTE (V50, item 4): series estendidas de 8 para 12 pontos, repetindo o
    // ultimo valor conhecido (mesma logica conservadora ja usada aqui - nao ha dado real para meses
    // tao distantes, nunca chutado um numero novo, so mantido o ultimo). Antes pulava Fev/27; agora
    // e sequencial, os rotulos vem de gerarMeses(12) - dinamico, sempre a partir do mes atual.
    totalOperacional:   [11658.24,9751.87,9420.07,8938.93,8671.07,8571.07,...Array(6).fill(VARS.totalOperacionalHeld)], // CORRIGIDO 19/07/2026: 1o ponto (ciclo atual) -R$1.808,91 (reversao Tokio Marine, ver REG.operacional.totalOperacional). Pontos futuros (Ago/26 em diante) NAO recalculados - baseline anterior, ja documentado como limitacao pendente desde V50/V51 (podem ainda incluir as parcelas 8-10 do Tokio removidas hoje - revisao futura).
    necessidadeLiquida: [12743.10,11996.97,11665.17,11184.03,10916.17,10816.17,...Array(6).fill(VARS.necessidadeLiquidaHeld)] // ATUALIZADO 25/07/2026 (V150): indice 0 (ciclo atual, 25/07-24/08) = R$12.743,10 (Necessidade Total corrigida R$13.146,21 - Cobertura Garantida R$403,11, ver V146/V147). Era R$13.903,34 (desatualizado, herdado de antes da correcao das parcelas).
  },

  // ===== BALANÇO PATRIMONIAL (Reestruturação V2.0, 16/07/2026 - V40/V41/V42) =====
  balanco: {
    // V135 (22/07/2026): fisico.total, financeiro.total, passivos.total, ativosTotal e patrimonioLiquido
    // eram numeros hardcoded que HOJE batem com a soma das partes (conferido por execucao real), mas nao
    // tinham formula nenhuma - qualquer edicao futura em 1 componente (ex: valor do carro, novo passivo)
    // ficaria dessincronizada ate alguem recalcular a mao. Viram DERIVADOS em recalcularAgregadosDerivados(),
    // nunca editar os totais aqui diretamente.
    fisico: { casa:VARS.patCasa, apartamento:VARS.patApartamento, jazigo:VARS.patJazigo, solar:VARS.patSolar, carro:VARS.patCarro, total:0 },
    financeiro: { reserva:VARS.reserva, btg:VARS.btgNecton, nectonContaCorrente:VARS.nectonContaCorrente, consorcioCasaPago:0, total:0 },
    pgbl: VARS.patPgbl,   // nao liquido, fora do total financeiro e da Meta do Milhao
    fgts: VARS.patFgts,   // nao liquido, fora do total financeiro e da Meta do Milhao
    passivos: { financiamentoCasa:VARS.passivoFinanciamentoCasa, consorcioAutoContemplado:VARS.passivoConsorcioAuto, total:0 },
    ativosTotal: 0,
    patrimonioLiquido: 0,
    reservas: {
      boletos:0, escolaJulio:VARS.escolaJulioSaldo, caixaLance:VARS.caixaLance, manutencao:VARS.caixaManutencao, eventos:VARS.caixaEventos,
      churrasco:VARS.caixaChurrasco, saudeFamilia:VARS.caixaSaudeFamilia, seguroEmplacamento:VARS.caixaSeguroEmplacamento, aniversarioJulio:VARS.caixaAniversarioJulio, total:0 // total DERIVADO em recalcularAgregadosDerivados()
    }, // V134: todos os saldos leem do VARS agora (fonte unica) - eliminada a 2a/3a copia que ja causou 2 rodadas de bug nesta sessao. CORRIGIDO 24/07/2026 (V139): churrasco agora le do VARS (tinha 0 hardcoded, VARS ja tinha o valor certo mas nao estava conectado).
    operacional: { caixaVariavel:VARS.caixaVariavelSaldoReal, pixVanessaSaldoReal:VARS.pixGeralVanessaSaldo, caixaBoletos:VARS.caixaBoletos, mastercardInfinite:VARS.caixaMastercardInfinite, total:0 }, // total DERIVADO. V134: le do VARS. V139: adicionada Caixa Mastercard/Infinite (nova, guarda valor a pagar dos 2 cartoes ate 28/07).
    // V137: Wartsila REMOVIDA da soma do total (pedido do usuario 23/07/2026: "nao deve misturar
    // contas da empresa com minhas contas" - a fatura e 100% corporativa/reembolsavel, so aparece
    // aqui como linha informativa, igual ao tratamento ja dado a PGBL/FGTS). mercadoPago agora le
    // do VARS.mercadoPagoFatura (antes essa fatura aparecia em 2 lugares da tela com 2 valores
    // diferentes: R$1.751,16 aqui/card Cartoes vs R$1.791,93 no Balanco - mesma fatura, bug real).
    obrigacoes: { visa:0, mastercardBlack:0, mercadoPago:0, wartsila:VARS.faturaWartsila, total:0 }, // CORRIGIDO 26/07/2026 (V166): mercadoPago agora e liquido (fatura - corporativo do ciclo), calculado em recalcularAgregadosDerivados(). Era VARS.mercadoPagoFatura direto (bruto, sem descontar corporativo).
    fluxo: { entradas:0, saidas:0, resultado:0 } // CORRIGIDO 25/07/2026 (V150): saidas e resultado agora SOBRESCRITOS em recalcularAgregadosDerivados(), nunca mais numero fixo. Antes ficavam presos no valor do ciclo de transicao (25/06-24/07) mesmo depois de entradas ja ter mudado - "matematica doida" apontada pelo usuario (Resultado R$21.318,48 nao batia com nada real).
  }
};

// CALCULADO 20/07/2026 (pedido do usuario, pontos 1 e 2 da auditoria): estes registradores paravam de
// ser numeros fixos digitados a mao e passam a ser DERIVADOS dos componentes reais, na mesma linha do
// que ja acontecia com CAIXA_VARIAVEL.disponivel (sempre = saldoReal-comprometido). Isso elimina a classe
// de bug encontrada nesta sessao (ex: sobra da cascata ficou 2 dias errada porque ninguem lembrou de
// atualizar o numero fixo quando um componente mudou). Os componentes (totalOpDetalhe, reembolsoCicloTotal
// etc.) continuam sendo os valores digitados/confirmados - só os agregados que dependem deles viram formula.
function recalcularAgregadosDerivados(){
  const r2 = x => Math.round(x*100)/100;
  const D = REG.totalOpDetalhe;

  // V145: RESINCRONIZACAO dos campos "espelho" do VARS - necessaria porque trocarCiclo() muda o VARS
  // DEPOIS que o REG ja foi construido uma vez (na carga da pagina). Sem isto, REG.caixaVariavel.saldoReal
  // (e os outros campos abaixo) ficariam "congelados" com o valor do ciclo inicial para sempre, mesmo
  // apos trocar de ciclo no seletor. So copia campos simples (nao mexe em nada que ja e DERIVADO nesta
  // mesma funcao, como .disponivel, que e recalculado logo abaixo de qualquer forma).
  REG.caixaVariavel.saldoReal = VARS.caixaVariavelSaldoReal;
  REG.caixaVariavel.comprometido = VARS.caixaVariavelComprometido;
  REG.caixaVariavel.tolerenciaTemp = VARS.tolerenciaTemp;
  if(REG.qualidade) REG.qualidade.tetoTemporarioAtivo = VARS.tolerenciaTemp > 0; // V145 CORRIGIDO: era hardcoded 'true', nunca recalculava
  if(REG.qualidade) REG.qualidade.lreiAtivos = VARS.LREI_ATIVAS.filter(l=>l.status==='ATIVO').length; // CORRIGIDO 27/07/2026 (V189): agora DERIVADO de VARS.LREI_ATIVAS, nunca mais numero hardcoded que pode desincronizar (foi exatamente isso que causou o alerta falso "0 LREI" desta rodada).
  REG.operacional.salario = VARS.salario;
  REG.operacional.reembolsoCicloTotal = VARS.reembolsoCicloTotal;
  REG.operacional.reembolsosAReceber = VARS.__reembolsosAReceber !== undefined ? VARS.__reembolsosAReceber : 0;
  REG.operacional.reembolsoPagaWartsila = VARS.faturaWartsila;
  REG.operacional.reembolsoPagaCartaoCorporativo = VARS.reembolsoPagaCartaoCorporativo;
  REG.operacional.reembolsoPagaMPCorporativo = VARS.reembolsoPagaMPCorporativo;
  REG.faturaWartsila = VARS.faturaWartsila;
  REG.wartsilaCaixa.fatura = VARS.faturaWartsila;
  // V174: Visa/MB/MP e os detalhamentos por categoria tambem precisam resincronizar ao trocar de ciclo -
  // sem isso, o card do topo (kpi) ficava congelado no valor do carregamento inicial, mesmo depois de
  // trocar para o ciclo fechado (bug encontrado no teste real: visaTotal nao mudava ao trocar de ciclo).
  REG.cartaoInfinite.total = VARS.cartaoInfiniteTotal;
  REG.cartaoMB.total = VARS.cartaoMBTotal;
  REG.mercadoPago = VARS.mercadoPagoFatura;

  // ===== V134 - DERIVACOES A PARTIR DO VARS (banco de variaveis unico) =====
  // Estas linhas sao a razao de ser do VARS: qualquer lugar do painel que usa estes valores
  // agora vem de UMA formula so, calculada aqui, nunca mais de numero duplicado em 3-4 lugares.
  REG.caixaVariavel.disponivel = r2(REG.caixaVariavel.saldoReal - REG.caixaVariavel.comprometido);
  REG.patrimonio.total = r2(VARS.reserva + VARS.btgNecton + VARS.caixaLance + VARS.nectonContaCorrente);
  REG.patrimonio.metaMilhaoPct = r2(REG.patrimonio.total / REG.patrimonio.metaMilhao * 100);
  REG.visa.totalComprometido = r2(VARS.cartaoInfiniteTotal + VARS.cartaoMBTotal);
  REG.visa.pessoal = r2(REG.visa.totalComprometido - REG.operacional.reembolsoPagaCartaoCorporativo);
  // NOVO 23/07/2026: P2P (secao 18) nunca tinha formula - saldoInvestido e rentabilidadePct eram
  // texto hardcoded, dessincronizando toda vez que um credito era vendido (V136 ja tinha corrigido o
  // ERP mas o site nunca acompanhou). Agora sempre recalculado a partir de VARS.p2pCreditosRestantes.
  REG.p2p.saldoInvestido = r2(VARS.p2pCreditosRestantes * VARS.p2pPrecoCompra);
  REG.p2p.rentabilidadePct = r2((VARS.p2pPrecoVenda - VARS.p2pPrecoCompra) / VARS.p2pPrecoCompra * 100);
  // V135: recorrencias/assinaturas de totalOpDetalhe DERIVADOS da soma Visa+MB (elimina duplicacao -
  // precisa rodar ANTES do calculo de totalOperacional logo abaixo, que le D.recorrencias/D.assinaturas).
  REG.totalOpDetalhe.recorrencias = r2(REG.visaDetalhe.recorrencias + REG.mbDetalhe.recorrencias);
  REG.totalOpDetalhe.assinaturas = r2(REG.visaDetalhe.assinaturas + REG.mbDetalhe.assinaturas);
  REG.balanco.reservas.total = r2(REG.balanco.reservas.boletos + REG.balanco.reservas.escolaJulio + REG.balanco.reservas.caixaLance +
    REG.balanco.reservas.manutencao + REG.balanco.reservas.eventos + REG.balanco.reservas.churrasco +
    REG.balanco.reservas.saudeFamilia + REG.balanco.reservas.seguroEmplacamento + REG.balanco.reservas.aniversarioJulio);
  REG.balanco.operacional.total = r2(REG.balanco.operacional.caixaVariavel + REG.balanco.operacional.caixaBoletos + REG.balanco.operacional.mastercardInfinite); // CORRIGIDO 26/07/2026 (V166): PIX Vanessa (conta autonoma dela) removida do total - nunca deveria ter somado como "reserva do Wallace".

  // V135: totais do Balanço Patrimonial DERIVADOS (antes eram numeros fixos que so por coincidencia
  // batiam com a soma das partes hoje - agora impossivel dessincronizar).
  const bf = REG.balanco.fisico;
  bf.total = r2(bf.casa + bf.apartamento + bf.jazigo + bf.solar + bf.carro);
  // V140: consorcioCasaPago DERIVADO = parcela x parcelas pagas (era literal solto, agora impossivel
  // dessincronizar de VARS.consorcioCasaParcela/consorcioCasaParcelasPagas)
  REG.balanco.financeiro.consorcioCasaPago = r2(VARS.consorcioCasaParcela * VARS.consorcioCasaParcelasPagas);
  const bfin = REG.balanco.financeiro;
  bfin.total = r2(bfin.reserva + bfin.btg + bfin.nectonContaCorrente + bfin.consorcioCasaPago);
  const bp = REG.balanco.passivos;
  bp.total = r2(bp.financiamentoCasa + bp.consorcioAutoContemplado);
  REG.balanco.ativosTotal = r2(bf.total + bfin.total);
  REG.balanco.patrimonioLiquido = r2(REG.balanco.ativosTotal - bp.total);

  // V128 (bug real apontado pelo usuario): entradasTotais agora DERIVADO de salario+reembolsoCicloTotal, nunca mais um numero fixo que "esquecia" de atualizar quando o reembolso mudava de status (a receber -> recebido).
  // CORRIGIDO 31/07/2026 (V222, bug real apontado pelo usuario): reembolsoCicloTotal e BRUTO - inclui as
  // pernas 1-3 da Cascata (fatura do cartao da propria Wartsila + MP corporativo + cartao corporativo
  // pessoal reembolsavel), que sao custos da EMPRESA passando pela conta do Wallace, nunca dinheiro dele.
  // Essas pernas nunca eram descontadas em lugar nenhum (nao entram em totalOperacional/necessidadeTotalBruta,
  // so aparecem isoladas nos cards da cascata) - Entradas/Saldo do Ciclo inflavam exatamente pela soma delas,
  // dando impressao de sobra maior do que a real (chegou a mudar o Modo Operacional de Normal pra Alto
  // indevidamente). Descontado aqui, na fonte, pra nunca mais vazar pro resto do painel.
  REG.operacional.reembolsoPassThroughCorporativo = r2(REG.operacional.reembolsoPagaWartsila + REG.operacional.reembolsoPagaMPCorporativo + REG.operacional.reembolsoPagaCartaoCorporativo);

  // NOVO 04/08/2026 (parte 78, continuacao da parte 77 - ficou pela metade): PIB Wallace, indicador de
  // geracao de riqueza (nao de quanto entrou). Formula do usuario: Salario Liquido + Reembolsos +
  // Rendimentos + Valorizacao de Investimentos - Consumo Nao Recorrente. Movido pra AQUI (depois de
  // reembolsoPassThroughCorporativo, que precisa existir antes de usar). Fontes, uma a uma:
  // - salarioLiquido: VARS.salario (real)
  // - reembolsos: reembolsoCicloTotal menos pass-through corporativo (mesma logica de entradasTotais -
  //   reembolso que so cobre gasto da empresa nao gera riqueza pessoal)
  // - rendimentos: soma "resultadoHistorico" das opcoes vendidas - ACUMULADO por posicao, nao isolado
  //   por mes (nao existe serie mensal ainda) - marcado explicitamente na tela, nao escondido
  // - valorizacaoInvestimentos: 0, NAO TRACKEADO (precisaria de snapshot mes a mes do valor de mercado,
  //   que nao existe) - marcado como pendente, nunca estimado por cima
  // - consumoNaoRecorrente: soma de VARS.EXTRAORDINARIO_BENS_DURAVEIS (categoria nova da parte 77)
  const rendimentosOpcoes = r2(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.resultadoHistorico||0),0));
  const consumoNaoRecorrentePIB = r2((VARS.EXTRAORDINARIO_BENS_DURAVEIS||[]).reduce((s,t)=>s+(t.valor||0),0));
  REG.pibWallace = {
    salarioLiquido: VARS.salario,
    reembolsos: r2(VARS.reembolsoCicloTotal - REG.operacional.reembolsoPassThroughCorporativo),
    rendimentos: rendimentosOpcoes,
    rendimentosNota: 'acumulado das posições abertas, não isolado por mês (sem série histórica ainda)',
    valorizacaoInvestimentos: 0,
    valorizacaoNota: 'não trackeado — precisa de snapshot mês a mês do valor de mercado (pendente)',
    consumoNaoRecorrente: consumoNaoRecorrentePIB,
    total: 0
  };
  REG.pibWallace.total = r2(REG.pibWallace.salarioLiquido + REG.pibWallace.reembolsos + REG.pibWallace.rendimentos
    + REG.pibWallace.valorizacaoInvestimentos - REG.pibWallace.consumoNaoRecorrente);
  REG.operacional.entradasTotais = r2(REG.operacional.salario + REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsoPassThroughCorporativo);
  REG.balanco.fluxo.entradas = REG.operacional.entradasTotais; // fonte unica - antes eram 2 copias que podiam divergir
  // V135: Recebidos no ciclo = Total do ciclo - A receber (sempre a diferenca, nunca mais numero fixo
  // que "esquece" de subir quando uma nova TED e confirmada e A_RECEBER zera).
  REG.reembolsos.recebidosNoCiclo = r2(REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsosAReceber);
  // Total Operacional = soma literal dos 7 componentes (mesma formula documentada na Politica sec.13/TOTAL_OPERACIONAL)
  REG.operacional.coberturaGarantida = VARS.coberturaGarantidaConfirmada || 0; // CORRIGIDO 26/07/2026 (V175): usuario esclareceu a regra - "o valor so deve constar como garantido quando eu por na caixa e informar o que vai cobrir". Antes era FORMULA automatica (totalOpProvMP + reembolsoPagaCartaoCorporativo) somando dividas que ja vao ser pagas de qualquer jeito (nao dinheiro reservado cobrindo algo) - conceitualmente errado. Agora fica em R$0,00 ate o usuario confirmar um valor especifico e o que ele cobre.
  const snapAtual = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
  if(snapAtual && snapAtual.fechado){
    // V177 (26/07/2026, pedido do usuario): "esses dados nao sao os corretos para o ciclo anterior" -
    // Total Operacional/Necessidade sao formulas derivadas de valores VIVOS (parcelas, consorcios, etc)
    // que nao tem versao congelada por componente. Em vez de reconstruir cada um separadamente (LIVRO_LRP,
    // LIVRO_LRCON antigos etc - trabalho grande), aplicamos os 2 valores FINAIS ja congelados no proprio
    // snapshot (necessidadeTotalBruta/necessidadeTotalLiquida ja existiam la, mas nunca eram de fato usados).
    REG.operacional.necessidadeTotalBruta = snapAtual.necessidadeTotalBruta;
    REG.operacional.necessidadeLiquida = snapAtual.necessidadeTotalLiquida;
    REG.operacional.totalOperacional = r2(snapAtual.necessidadeTotalBruta - REG.operacional.orcamentoOperacional);
  } else {
    REG.operacional.totalOperacional = r2(D.boletos + D.parcelas + D.consorcios + D.recorrencias + D.aportesPat + D.provMP + D.assinaturas);
    REG.operacional.necessidadeTotalBruta = r2(REG.operacional.totalOperacional + REG.operacional.orcamentoOperacional);
    REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  }
  REG.operacional.saldoCiclo = r2(REG.balanco.fluxo.entradas - REG.operacional.necessidadeTotalBruta);
  REG.balanco.fluxo.saidas = REG.operacional.necessidadeTotalBruta; // CORRIGIDO V150: era numero fixo, agora e a mesma Necessidade Total Bruta (Boletos+Parcelas+Assinaturas+Recorrencias+Consorcios+AportesPatrimoniais+OrcamentoOperacional). Movido para APOS necessidadeTotalBruta ser calculado (ordem de execucao).
  REG.balanco.fluxo.resultado = r2(REG.balanco.fluxo.entradas - REG.balanco.fluxo.saidas); // CORRIGIDO V150: era numero fixo, agora e Entradas-Saidas de verdade
  // CORRIGIDO 25/07/2026 (V143→V144, erro do Claude apontado pelo usuario): o pro-labore NAO substitui o
  // salario real nos calculos - ele so decide o ROTEAMENTO do excedente/complemento (Fundo de Suavizacao,
  // secao 16 Politicas). Modo Operacional continua reagindo ao saldoCiclo real (dinheiro de verdade
  // disponivel), exatamente como sempre funcionou (secao 10 Politicas). O pro-labore e so o "pulmão":
  // mes bom (salario real > R$11.000) manda o excedente pra Conta Suavizacao; mes fraco (salario real <
  // R$11.000) a Conta Suavizacao complementa a diferenca ANTES do resto do sistema calcular qualquer coisa
  // - entao na pratica o sistema sempre "ve" pelo menos R$11.000 disponivel, nunca menos. O calculo abaixo
  // e so informativo (quanto seria o excedente/complemento deste ciclo), NAO mexe no Modo Operacional.
  REG.operacional.excedenteOuComplementoProLabore = r2(REG.operacional.salario - REG.operacional.proLaboreFixo);
  if(REG.operacional.saldoCiclo < 0) REG.operacional.modoOperacional = 'Crítico';
  else if(REG.operacional.saldoCiclo < 3000) REG.operacional.modoOperacional = 'Baixo';
  else if(REG.operacional.saldoCiclo < 8000) REG.operacional.modoOperacional = 'Normal';
  else REG.operacional.modoOperacional = 'Alto';
  // Sobra da cascata de reembolso Wartsila = Total - as 4 pernas de deducao (regra da Politica sec.5, 5 pernas). V128: campos nomeados, nao mais numeros magicos.
  REG.operacional.reembolsoSobraPessoal = r2(REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsoPagaWartsila - REG.operacional.reembolsoPagaMPCorporativo - REG.operacional.reembolsoPagaCartaoCorporativo - D.provMP);
  // CORRIGIDO 23/07/2026 (bug real apontado pelo usuario): REG.visa.totalComprometido = Infinite+MB somados
  // (linha ~567). Usar isso na linha "Visa Infinite" do card Obrigacoes duplicava o Mastercard Black -
  // ele aparecia com valor certo na sua PROPRIA linha (mastercardBlack, logo abaixo) E de novo embutido
  // dentro do "Visa Infinite" (11.157,07 = 9.091,90 Infinite + 2.065,17 MB), inflando o Total obrigacoes
  // em R$2.065,17. Fonte correta para a linha "Visa Infinite" e SO o cartao Infinite: REG.cartaoInfinite.total
  // (mesma fonte do card Cartoes/secao 08, evita 3a copia divergente - V85 ja tinha corrigido uma 2a copia).
  REG.balanco.obrigacoes.visa = r2(REG.cartaoInfinite.total);
  REG.balanco.obrigacoes.mastercardBlack = r2(REG.cartaoMB.total);
  // V137 (pedido do usuario 23/07/2026): Wartsila NAO entra mais na soma - e 100% corporativo/reembolsavel,
  // nao deve se misturar com obrigacoes pessoais reais. Fica visivel na tela como linha informativa (mesmo
  // tratamento ja dado a PGBL/FGTS no Patrimonio), so nao soma no Total.
  // CORRIGIDO 29/07/2026 (V203, varredura de bugs): a formula anterior (mercadoPagoFatura -
  // faturaMPCorporativoPendente) produzia obrigacao NEGATIVA (-R$1.544,11) desde que a fatura MP foi
  // paga em 27/07 (mercadoPagoFatura zerou, mas faturaMPCorporativoPendente continuou R$1.544,11 -
  // corretamente, porque o reembolso da Wartsila ainda nao chegou). Obrigacao negativa nao existe:
  // com a fatura paga, nao ha mais o que descontar dela - o corporativo pendente virou um ATIVO a
  // receber (reembolso), nao um abatimento de divida. Impacto real: o Total de obrigacoes do Balanco
  // estava R$1.544,11 MENOR do que deveria (R$4.342,09 em vez de R$5.886,20), subestimando os passivos.
  // Agora: desconta o corporativo apenas ate o limite da propria fatura, nunca abaixo de zero.
  REG.balanco.obrigacoes.mercadoPago = r2(Math.max(0, VARS.mercadoPagoFatura - VARS.faturaMPCorporativoPendente));
  REG.balanco.obrigacoes.total = r2(REG.balanco.obrigacoes.visa + REG.balanco.obrigacoes.mastercardBlack + REG.balanco.obrigacoes.mercadoPago);
  // Evolucao (graficos): o ponto do ciclo atual (indice 0) tambem passa a vir do agregado real, nao de um numero copiado a mao
  REG.evolucao.totalOperacional[0] = REG.operacional.totalOperacional;

  // V137: livrosRazaoTotais LRW/LRV/LRC = soma das mesmas partes ja usadas nos graficos (visaDetalhe+mbDetalhe).
  // LRS/LRR = mesmos valores ja derivados em totalOpDetalhe.assinaturas/recorrencias (linha 393/394 acima).
  // Todos verificados batendo exato antes de virar formula (harness Node, 0 divergencia).
  // V152/V153: livrosRazaoTotais.LRW/LRV NAO sao mais sobrescritos aqui - viraram filtro manual por ciclo
  // (painel Livros Razao, secao 15), editados direto no VARS.livrosRazaoTotais. O total REAL comprometido
  // (usado em auditoria/cartaoMBTotal) continua vindo de visaDetalhe.wallace/vanessa + mbDetalhe.wallace/vanessa,
  // sem relacao com o que aparece filtrado no painel.
  REG.livrosRazaoTotais.LRC.total = r2(REG.visaDetalhe.corp + REG.mbDetalhe.corp);
  REG.livrosRazaoTotais.LRS.total = REG.totalOpDetalhe.assinaturas;
  REG.livrosRazaoTotais.LRR.total = REG.totalOpDetalhe.recorrencias;

  // V137: metas percentuais derivadas - milhaoPct estava TRAVADO em 11,54% (nao acompanhava
  // patrimonio.metaMilhaoPct, ja corrigido pra 11,57% na V135) e alimentava o grafico de metas.
  REG.metasPatrimoniais.milhaoPct = REG.patrimonio.metaMilhaoPct;
  REG.metasPatrimoniais.escolaPct = r2(VARS.escolaJulioSaldo / VARS.metaEscolaJulio * 100);

  // V137: excedente do investimento derivado (elimina a classe de erro que gerou a correcao V107, um
  // erro de subtracao manual de R$1,00).
  REG.metaInvestimento.meta = r2(REG.operacional.salario * 0.20); // CORRIGIDO V151: 20% do salario do ciclo atual (era numero fixo R$6.741,76, nao correspondia ao titulo do card "Meta mensal (20% do salario)")
  REG.metaInvestimento.investido = r2(VARS.aporteBTGPactual + VARS.depositoAtivacaoNecton);
  REG.metaInvestimento.excedente = r2(REG.metaInvestimento.investido - REG.metaInvestimento.meta);
  REG.evolucao.necessidadeLiquida[0] = REG.operacional.necessidadeLiquida;
  // V203 (varredura de bugs): mesma correcao ja aplicada a totalOperacional[0] e necessidadeLiquida[0] -
  // o indice 0 (ciclo atual) da serie de cenarios era um literal duplicado do snapshot (13146.21),
  // que dessincronizaria se a necessidade do ciclo mudasse. Agora deriva do agregado real.
  if(REG.superavitNormal && Array.isArray(REG.superavitNormal.necessidade)) REG.superavitNormal.necessidade[0] = REG.operacional.necessidadeTotalBruta;
  // V138: elimina duplicacao - antes o mesmo numero vivia em REG.estimador.necessidadeLiquidaProximoCiclo
  // (literal solto) E em REG.evolucao.necessidadeLiquida[1] (array). Agora so o array e fonte, o estimador le dele.
  REG.estimador.necessidadeLiquidaProximoCiclo = REG.evolucao.necessidadeLiquida[1];
  // V139: Consorcio Casa Nova / Projeto Casa Nova - formulas novas (secoes que eram 100% hardcoded)
  REG.consorcioCasaNova.quitacaoPct = r2(100 - REG.consorcioCasaNova.pagoPct);
  REG.projetoCasaNova.capitalDisponivel = r2(VARS.btgNecton + VARS.caixaLance);
  REG.projetoCasaNova.pct = r2(REG.projetoCasaNova.capitalDisponivel / REG.projetoCasaNova.metaLance * 100);
  REG.projetoCasaNova.falta = r2(REG.projetoCasaNova.metaLance - REG.projetoCasaNova.capitalDisponivel);
  REG.wartsilaCaixa.excedente = r2(REG.wartsilaCaixa.provisionado - REG.wartsilaCaixa.fatura);
  REG.pixDiversos.liquido = r2(REG.pixDiversos.entradas - REG.pixDiversos.saidas);
}
recalcularAgregadosDerivados(); // chamada inicial, na carga da pagina

// V145: aplicarCicloAoVARS() ja definida acima (antes do REG). trocarCiclo() e usada pelo seletor no HTML.
function trocarCiclo(cicloKey){
  aplicarCicloAoVARS(cicloKey);
  recalcularAgregadosDerivados();
  // V300 (Etapa 2): eventos aditivos, emitidos depois do recalculo real - nao mudam o que ja acontecia.
  WallaceBus.emit('cicloAlterado', {cicloKey});
  WallaceBus.emit('saldoAtualizado', {saldoReal: REG.caixaVariavel.saldoReal, comprometido: REG.caixaVariavel.comprometido, disponivel: REG.caixaVariavel.disponivel});
  hydrate();
  renderLivrosVariaveis(); // V174: regenera as tabelas LRW/LRV/LRC-limbo/LRPV com os dados do ciclo selecionado - antes so rodava no carregamento inicial, nunca ao trocar de ciclo
  atualizarBotoesSeletorCiclo();
  atualizarGraficosPorCiclo();
  atualizarContadoresAbasLR();
}

// V145: graficos Chart.js nao se atualizam sozinhos quando REG muda - precisam de update() explicito.
// Só os graficos que leem campos POR-CICLO (Caixa Variavel) precisam disso; os de fluxo continuo
// (Necessidade, Patrimonio) nao mudam com o seletor, entao nao precisam ser tocados aqui.
function atualizarGraficosPorCiclo(){
  if(typeof Chart === 'undefined' || !Chart.getChart) return;
  ['cVariavel','g_cVariavel'].forEach(id=>{
    const canvas = $(id);
    if(!canvas) return;
    const chart = Chart.getChart(canvas);
    if(!chart) return;
    chart.data.datasets[0].data = [REG.caixaVariavel.saldoReal, REG.caixaVariavel.comprometido, REG.caixaVariavel.disponivel];
    chart.update();
  });
  WallaceBus.emit('graficoAtualizado', {origem:'atualizarGraficosPorCiclo'}); // V300 (Etapa 2)
}

function atualizarBotoesSeletorCiclo(){
  CICLO_LISTA.forEach(key=>{
    const btn = $('cicloBtn_'+key);
    if(!btn) return;
    if(key===VARS.cicloAtual){ btn.classList.add('ciclo-ativo'); }
    else { btn.classList.remove('ciclo-ativo'); }
  });
  const banner = $('cicloBannerFechado');
  if(banner){
    const snap = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    banner.style.display = snap.fechado ? 'flex' : 'none';
  }
}

// V145: cria os botoes do seletor dinamicamente a partir de CICLO_LISTA - nunca precisa editar o HTML
// na mao quando um novo ciclo fechar, basta adicionar a entrada em VARS.CICLO_SNAPSHOTS.
// V155: implementacao real de renderParcelamentos() - antes so mencionada em comentario (V154),
// nunca escrita. Gera as tabelas HTML de LRP (Visa) e LRMP-parcelas (Mercado Pago) a partir dos
// arrays estruturados VARS.PARCELAMENTOS_VISA/MP - unica fonte, nunca mais editar a tabela na mao.
// Itens QUITADO nao aparecem (somem sozinhos quando parcelaAtual ultrapassa totalParcelas).
// V162 (pedido do usuario: "os numeros nas abas dos LRs nunca batem com a quantidade real de compras"):
// conta as linhas <tr> REAIS de cada painel (tbody) e atualiza o texto do botao correspondente.
// Nunca mais numero fixo digitado - sempre reflete exatamente o que esta sendo exibido, linha por linha.
// Linhas riscadas (duplicatas/estornos, style="text-decoration:line-through") sao EXCLUIDAS da contagem -
// elas aparecem na tabela por rastreabilidade (P1/P6) mas nao sao lancamentos validos ativos.
function atualizarContadoresAbasLR(){
  const paineis = ['lrw','lrv','lrb','lrp','lrs','lrr','lrcon','lrc','lrmp','lrcv','lrei','lrdoacao','lrpv','lrpvsaldo'];
  const labels = {
    lrw:'LRW - Wallace', lrv:'LRV - Vanessa', lrb:'LRB - Boletos', lrp:'LRP - Parcelas', lrs:'LRS - Assinaturas',
    lrr:'LRR - Recorrências', lrcon:'LRCON - Consórcios', lrc:'LRC - Corporativo', lrmp:'LRMP - Mercado Pago',
    lrcv:'LRCV - Caixa Variável', lrei:'LREI - Empréstimos Internos', lrdoacao:'LRDOA - Doações', lrpv:'LRPGV - PIX Geral Vanessa', lrpvsaldo:'LRPV - PIX Vanessa'
  };
  // NOVO 01/08/2026 (V243, pedido do usuario - "torne isso automatico em todas"): rodapes de tabela
  // (ex: "9 lançamentos", "13 assinaturas ativas") eram texto FIXO no HTML, nunca contado de verdade -
  // por isso o LRPGV podia mostrar "18" no rodape e "9" no botao da aba ao mesmo tempo. Mesma contagem
  // real (linhas de tbody, excluindo riscadas/vazias) agora alimenta OS DOIS lugares, sempre igual.
  const rodapes = {
    lrb: {id:'qtdLRB', singular:'boleto', plural:'boletos'},
    lrs: {id:'qtdLRS', singular:'assinatura ativa', plural:'assinaturas ativas'},
    lrr: {id:'qtdLRR', singular:'recorrência', plural:'recorrências'},
    lrcon: {id:'qtdLRCON', singular:'lançamento', plural:'lançamentos'},
    lrdoacao: {id:'qtdLRDOA', singular:'lançamento', plural:'lançamentos'},
    lrpv: {id:'qtdLRPGV', singular:'lançamento (fluxo do período)', plural:'lançamentos (fluxo do período)'},
  };
  paineis.forEach(id => {
    const painel = $(id);
    const btn = $('lrTabBtn_'+id);
    if(!painel || !btn) return;
    const linhas = painel.querySelectorAll('tbody tr');
    let count = 0;
    linhas.forEach(tr => {
      // exclui linhas riscadas (duplicata/estorno) e linhas de "nenhum lancamento" (colspan)
      const riscada = tr.style && tr.style.textDecoration && tr.style.textDecoration.includes('line-through');
      const vazia = tr.querySelector('td[colspan]');
      if(!riscada && !vazia) count++;
    });
    btn.textContent = labels[id]+' ('+count+')';
    const rf = rodapes[id];
    if(rf){
      const rfEl = $(rf.id);
      if(rfEl) rfEl.textContent = count+' '+(count===1?rf.singular:rf.plural);
    }
  });
}

// V168: gera as tabelas de LRW/LRV/LRC-limbo/LRCV a partir dos arrays estruturados acima -
// nunca mais editar essas 4 tabelas na mao. Cada nova compra so precisa entrar no array certo.
function renderLivrosVariaveis(){
  function linha(t, temTipo){
    const obsHtml = t.obs ? ` <span style="font-size:0.62rem;color:var(--text-dim)">· ${t.obs}</span>` : '';
    if(temTipo) return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.tipo||'PIX'}${obsHtml}</td><td class="r">${fmt(t.valor)}</td></tr>`;
    return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}${obsHtml}</td><td class="r">${fmt(t.valor)}</td></tr>`;
  }
  function preencher(id, arr, temTipo){
    const tbody = $(id);
    if(!tbody) return;
    if(!arr.length){
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação neste ciclo ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = arr.map(t=>linha(t, temTipo)).join('');
  }
  preencher('lrwTbody', VARS.LRW_TRANSACOES, false);
  preencher('lrvTbody', VARS.LRV_TRANSACOES, false);
  preencher('lrcLimboTbody', VARS.LRC_LIMBO_TRANSACOES, false);
  preencher('lrcvTbody', VARS.LRCV_TRANSACOES, true);

  // LRPV tem formato proprio (Entrada/Saida colorida) - renderizacao especifica, nao usa preencher() generico
  const lrpvTbody = $('lrpvTbody');
  if(lrpvTbody){
    if(!VARS.LRPV_TRANSACOES.length){
      lrpvTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação ainda.</td></tr>';
    } else {
      lrpvTbody.innerHTML = VARS.LRPV_TRANSACOES.map(t=>{
        const cor = t.tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
        return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}</td><td style="color:${cor}">${t.tipo}</td><td class="r">${fmt(t.valor)}</td></tr>`;
      }).join('');
    }
    const tfLRPVEl = $('tfLRPV');
    if(tfLRPVEl){
      const liquido = VARS.LRPV_TRANSACOES.reduce((s,t)=> s + (t.tipo==='Entrada'?t.valor:-t.valor), 0);
      tfLRPVEl.textContent = fmt(Math.round(liquido*100)/100);
    }
  }

  // V176: painel PV (reserva do Wallace) - mesma logica do PGV, array proprio (VARS.PV_TRANSACOES)
  const lrpvsaldoTbody = $('lrpvsaldoTbody');
  if(lrpvsaldoTbody){
    if(!VARS.PV_TRANSACOES.length){
      lrpvsaldoTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação ainda.</td></tr>';
    } else {
      lrpvsaldoTbody.innerHTML = VARS.PV_TRANSACOES.map(t=>{
        const cor = t.tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
        return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}</td><td style="color:${cor}">${t.tipo}</td><td class="r">${fmt(t.valor)}</td></tr>`;
      }).join('');
    }
    const tfPVEl = $('tfPV');
    if(tfPVEl){
      const liquido = VARS.PV_TRANSACOES.reduce((s,t)=> s + (t.tipo==='Entrada'?t.valor:-t.valor), 0);
      tfPVEl.textContent = fmt(Math.round(liquido*100)/100);
    }
    const qtdPVEl = $('qtdPV');
    if(qtdPVEl) qtdPVEl.textContent = VARS.PV_TRANSACOES.length+' lançamento(s)';
  }

  const somaLRW = VARS.LRW_TRANSACOES.reduce((s,t)=>s+t.valor,0);
  const somaLRV = VARS.LRV_TRANSACOES.reduce((s,t)=>s+t.valor,0);
  const tfLRWEl = $('tfLRW');
  if(tfLRWEl) tfLRWEl.textContent = fmt(somaLRW);
  const tfLRVEl = $('tfLRV');
  if(tfLRVEl) tfLRVEl.textContent = fmt(somaLRV);
  const qtdLRWEl = $('qtdLRW');
  if(qtdLRWEl) qtdLRWEl.textContent = VARS.LRW_TRANSACOES.length+' lançamento(s)';
  const qtdLRVEl = $('qtdLRV');
  if(qtdLRVEl) qtdLRVEl.textContent = VARS.LRV_TRANSACOES.length+' lançamento(s)';

  // V189 (27/07/2026): LREI (Empréstimos Internos) tornado dinâmico - antes era HTML fixo com texto
  // "Nenhum empréstimo interno ativo no momento" hardcoded, mesmo com LREI_ATIVAS já tendo 2 dívidas
  // reais (LREI0002 Saúde Família R$164,94 + LREI0003 Fatura Mercado Pago R$266,23) - o array existia
  // no VARS mas nada lia ele pra tela. Bug apontado pelo usuário via print do painel real.
  const lreiTbody = $('lreiTbody');
  if(lreiTbody){
    if(!VARS.LREI_ATIVAS.length){
      lreiTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhum empréstimo interno ativo no momento.</td></tr>';
    } else {
      const hoje = new Date();
      lreiTbody.innerHTML = VARS.LREI_ATIVAS.map(l=>{
        const [d,m] = l.data.split('/').map(Number);
        const dataAbertura = new Date(hoje.getFullYear(), m-1, d);
        const idadeDias = Math.max(0, Math.round((hoje - dataAbertura)/(1000*60*60*24)));
        const corStatus = l.status === 'ATIVO' ? 'var(--text-danger)' : 'var(--green)';
        return `<tr><td class="mono">${l.id}</td><td class="mono">${l.data}</td><td>${l.credora}</td><td>${l.devedora}</td><td class="r">${fmt(l.valor)}</td><td>${idadeDias}d</td><td style="color:${corStatus}">${l.status}</td></tr>`;
      }).join('');
    }
  }
  const lreiTabBtn = $('lrTabBtn_lrei');
  if(lreiTabBtn) lreiTabBtn.textContent = `LREI - Empréstimos (${VARS.LREI_ATIVAS.length})`;
}

// ===== V400 Etapa 1 - Inbox Financeira =====
// Componente central do brief V400: "toda informacao capturada entra primeiro aqui, jamais lancar
// diretamente no ERP". As Etapas 2-9 (Pluggy/Email/Telegram/OCR/Corretoras/Energisa) sao os futuros
// PRODUTORES de itens (chamando inboxAdicionarItem) - nenhuma delas existe ainda nesta sessao (sem
// acesso a rede/conectores). O que ja funciona hoje, testavel sem rede: o pipeline em si (criar item,
// listar, aprovar, rejeitar) e a UI (secao 22 do Painel).
// CORRIGIDO 04/08/2026 (parte 54, bug real reportado pelo usuário: "This page isn't responding" +
// "os dados não atualizam" — reproduzido e confirmado a causa lendo o código real, não só supondo):
// gerarProximoInboxId() escaneava VARS.INBOX_FINANCEIRA INTEIRO a cada item novo. Enquanto a Inbox
// tinha 0-4 itens de teste, isso era imperceptível — mas agora que a Pluggy real chegou (parte 53,
// 2.612 transações em 11 contas), reconciliarTransacoesPluggy() passou a chamar isso centenas de vezes
// na mesma carga, virando O(n²) (cada chamada mais lenta que a anterior) — trava a aba. Cache simples:
// escaneia 1x (lazy, na 1ª chamada) e só incrementa depois, O(1) daí em diante.
let _inboxContadorId = null;
function gerarProximoInboxId(){
  if(_inboxContadorId === null){
    let maior = 0;
    VARS.INBOX_FINANCEIRA.forEach(it=>{
      const m = /^INBX(\d{6})$/.exec(it.id);
      if(m) maior = Math.max(maior, parseInt(m[1], 10));
    });
    _inboxContadorId = maior;
  }
  _inboxContadorId += 1;
  return 'INBX' + String(_inboxContadorId).padStart(6, '0');
}

// origem: string livre (ex: 'Pluggy', 'Email Itaú', 'Telegram', 'OCR', 'Manual'). confianca: 0-1 ou null.
// idExterno (NOVO 04/08/2026, parte 49 — CORRIGIDO 04/08/2026, parte 48: comentario original citava
// "parte 41" por engano, numero ja usado pela Capa como Dashboard; renumerado pra nao colidir e pra nao
// sumir de auditorias futuras que buscam por numero de parte): id estavel do item na fonte de origem -
// pro Mercado Pago e o id do evento (ja existia); pro Pluggy agora tambem existe (ver gerarIdExternoPluggy),
// sintetico mas deterministico, usado so pra persistir a decisao de Aprovar/Rejeitar em PLUGGY_TRIAGEM.
// descricaoCompleta (NOVO, parte 49 - melhoria do campo Descrição): texto integral pro title="" (hover);
// descricao pode ser encurtada na chamada sem perder a explicação completa.
// silencioso (NOVO 04/08/2026, parte 54): quando true, NÃO chama renderInboxFinanceira() a cada item —
// quem adiciona vários itens em lote (reconciliarPluggy/reconciliarTransacoesPluggy/
// sincronizarMercadoPagoParaInbox) passa true e renderiza 1 única vez no final. Antes, cada item
// (mesmo 1 de centenas) disparava um innerHTML da tabela inteira — O(n²) real, era a causa da trava
// "This page isn't responding" com volume real da Pluggy (parte 53). Comportamento padrão (chamada
// manual/avulsa) continua igual: renderiza na hora.
function inboxAdicionarItem({origem, descricao, descricaoCompleta, valor, data, categoriaSugerida, livroSugerido, confianca, idExterno, silencioso}){
  const item = {
    id: gerarProximoInboxId(),
    origem: origem || 'Manual',
    descricao: descricao || '',
    descricaoCompleta: descricaoCompleta || descricao || '',
    valor: typeof valor === 'number' ? valor : 0,
    data: data || '',
    categoriaSugerida: categoriaSugerida || null,
    livroSugerido: livroSugerido || null,
    confianca: (typeof confianca === 'number') ? confianca : null,
    idExterno: idExterno || null,
    status: 'PENDENTE',
    criadoEm: new Date().toISOString()
  };
  VARS.INBOX_FINANCEIRA.push(item);
  WallaceBus.emit('inboxItemAdicionado', item);
  if(!silencioso) renderInboxFinanceira();
  return item.id;
}

// Credenciais publicas do Supabase (mesma chave anon/publishable ja exposta no fetch de
// Sistema_Wallace_Lira_Completo.html - nao e segredo, e a chave publica do projeto).
// Usadas so pra chamar a RPC restrita triar_mercadopago_evento (04/08/2026, parte 40) - essa RPC
// SO deixa trocar o campo status_triagem de 1 evento por id, nada mais (ver migration no Supabase).
const SUPABASE_URL_WALLACE = 'https://bakdgacmwlopvrrppwdm.supabase.co';
const SUPABASE_ANON_KEY_WALLACE = 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';

// 04/08/2026 (parte 40): persiste a decisao de triagem de um evento do Mercado Pago no Supabase,
// via RPC restrita (so troca status_triagem, nunca outro campo). Fire-and-forget com log de erro -
// a UI ja mudou otimisticamente (inboxAprovar/inboxRejeitar chamam isso, mas nao esperam a resposta
// pra atualizar a tela), pra nao travar o clique numa rede lenta/instavel.
function persistirTriagemMercadoPago(idExterno, statusTriagem){
  if(!idExterno) return; // item nao veio do Mercado Pago (ex: manual/Pluggy) - nada a persistir aqui
  fetch(`${SUPABASE_URL_WALLACE}/rest/v1/rpc/triar_mercadopago_evento`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY_WALLACE,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY_WALLACE}`
    },
    body: JSON.stringify({ p_id: idExterno, p_status_triagem: statusTriagem })
  }).then(resp=>{
    if(!resp.ok) console.error('persistirTriagemMercadoPago: falhou HTTP', resp.status, idExterno, statusTriagem);
  }).catch(err=>console.error('persistirTriagemMercadoPago: erro de rede', err));
}

// 04/08/2026 (parte 49): persiste a decisao de triagem de um item da Pluggy no Supabase, via RPC
// restrita triar_pluggy_item (so escreve dentro de PLUGGY_TRIAGEM por id sintetico, nada mais - ver
// migration no Supabase, ja aplicada e confirmada ao vivo). Mesmo padrao fire-and-forget de
// persistirTriagemMercadoPago. Resolve a pendencia deixada em aberto na parte 42 ("Aprovar/Rejeitar
// no Pluggy volta apos atualizar a pagina").
function persistirTriagemPluggy(idExterno, statusTriagem){
  if(!idExterno) return;
  fetch(`${SUPABASE_URL_WALLACE}/rest/v1/rpc/triar_pluggy_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY_WALLACE,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY_WALLACE}`
    },
    body: JSON.stringify({ p_id_externo: idExterno, p_status_triagem: statusTriagem })
  }).then(resp=>{
    if(!resp.ok) console.error('persistirTriagemPluggy: falhou HTTP', resp.status, idExterno, statusTriagem);
  }).catch(err=>console.error('persistirTriagemPluggy: erro de rede', err));
}

// 04/08/2026 (parte 49): dispatcher unico - decide qual RPC chamar conforme a origem do item. Pluggy
// usa PLUGGY_TRIAGEM (mapa por id sintetico); qualquer outra origem com idExterno (hoje so Mercado
// Pago) continua no fluxo antigo. Nao muda nada pra itens manuais (idExterno null, ambas as funcoes
// ja tem guarda pra isso).
// AJUSTADO 04/08/2026 (parte 54): 'Pluggy-Transação' (transação individual, reconciliarTransacoesPluggy)
// também usa o mapa PLUGGY_TRIAGEM - mesma RPC/escopo de 'Pluggy' (cartão), só a origem no rótulo muda.
// Sem isso, aprovar/rejeitar uma transação individual nunca persistia (caía no fluxo do Mercado Pago
// por engano, que ignora silenciosamente por falta de idExterno reconhecido).
function persistirTriagemItem(item, statusTriagem){
  if(item.origem === 'Pluggy' || item.origem === 'Pluggy-Transação') persistirTriagemPluggy(item.idExterno, statusTriagem);
  else persistirTriagemMercadoPago(item.idExterno, statusTriagem);
}

function inboxAprovar(id){
  const item = VARS.INBOX_FINANCEIRA.find(i=>i.id===id);
  if(!item) return;
  // Aprovar so marca a intencao - nunca lanca automaticamente no livro razao (proibicao explicita do
  // brief V400: "lancar transacao sem confirmacao"). O lancamento real segue o fluxo manual existente.
  item.status = 'APROVADO';
  persistirTriagemItem(item, 'aprovado'); // 04/08/2026 (parte 49): agora persiste de fato tambem pra Pluggy
  WallaceBus.emit('inboxItemAprovado', item);
  renderInboxFinanceira();
}

function inboxRejeitar(id, motivo){
  const item = VARS.INBOX_FINANCEIRA.find(i=>i.id===id);
  if(!item) return;
  item.status = 'REJEITADO';
  item.motivoRejeicao = motivo || null;
  persistirTriagemItem(item, 'rejeitado'); // 04/08/2026 (parte 49): agora persiste de fato tambem pra Pluggy
  WallaceBus.emit('inboxItemRejeitado', item);
  renderInboxFinanceira();
}

function renderInboxFinanceira(){
  const tbody = $('inboxFinanceiraTbody');
  if(!tbody) return; // secao pode nao existir ainda num HTML antigo carregado em cache
  const itens = VARS.INBOX_FINANCEIRA;
  if(!itens.length){
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhum item capturado ainda — automações de captura (Pluggy/Email/Telegram/OCR) ainda não implementadas.</td></tr>';
  } else {
    tbody.innerHTML = itens.slice().reverse().map(it=>{
      const classeStatus = it.status==='APROVADO' ? 'bg' : (it.status==='REJEITADO' ? 'br' : 'ba');
      const conf = it.confianca!=null ? Math.round(it.confianca*100)+'%' : '—';
      // CORRIGIDO 04/08/2026: botoes trocados de style="" inline pra classes .inbox-btn-ok/.inbox-btn-no
      // (styles.css) - inline sozinho deixava o cromado nativo do <button> (Safari/iOS) por cima da cor,
      // ficava quase invisivel. type="button" evita qualquer comportamento de submit acidental tambem.
      const acoes = it.status==='PENDENTE'
        ? `<button type="button" class="inbox-btn inbox-btn-ok" onclick="inboxAprovar('${it.id}')">✔ Aprovar</button><button type="button" class="inbox-btn inbox-btn-no" onclick="inboxRejeitar('${it.id}')">✘ Rejeitar</button>`
        : '—';
      // MELHORADO 04/08/2026 (parte 49): descricao longa (comum em itens da Pluggy) agora fica num
      // span com clamp de 2 linhas (CSS) + title="" com o texto integral pro hover, em vez de esticar
      // a linha da tabela inteira. escapeHtml() no atributo title pra nao quebrar com aspas na descricao.
      const descTitle = String(it.descricaoCompleta||it.descricao||'').replace(/"/g,'&quot;');
      return `<tr><td class="mono">${it.id}</td><td>${it.origem}</td><td><span class="inbox-desc-txt" title="${descTitle}">${it.descricao}</span>${it.livroSugerido?` <span style="color:var(--text-dim);font-size:0.65rem">→ ${it.livroSugerido}</span>`:''}</td><td class="r">${fmt(it.valor)}</td><td class="mono">${it.data}</td><td class="r">${conf}</td><td><span class="badge ${classeStatus}">${it.status}</span></td><td>${acoes}</td></tr>`;
    }).join('');
  }
  const pendentes = itens.filter(i=>i.status==='PENDENTE').length;
  const aprovados = itens.filter(i=>i.status==='APROVADO').length;
  const rejeitados = itens.filter(i=>i.status==='REJEITADO').length;
  const resumoEl = $('inboxFinanceiraResumo');
  if(resumoEl) resumoEl.textContent = `${pendentes} pendente(s) · ${aprovados} aprovado(s) · ${rejeitados} rejeitado(s)`;
  const tabBadge = $('inboxFinanceiraBadge');
  if(tabBadge) tabBadge.textContent = pendentes > 0 ? String(pendentes) : '';
}

// V400 Etapa 2 (Pluggy Total) - reconciliarPluggy(). ESCOPO REAL, nao o do brief original: o brief pedia
// reconciliar "lancamentos" (transacao a transacao), mas a automacao que grava VARS.PLUGGY_CONTAS no
// Supabase reporta erro HTTP 410 em TODAS as contas ao buscar transacoes ("endpoint descontinuado, usar
// /v2/transactions com cursor") - ou seja, hoje so saldo/fatura por conta chegam, nunca a lista de
// lancamentos. Reconciliar por SALDO/FATURA e o que da pra fazer sem fabricar dado que nao existe.
// Mapa fixo final-4-digitos -> livro/titular, copiado literal da Politica secao 3 (CARTAO_MAPA) - nunca
// inventado aqui. So os finais com um total agregado correspondente em VARS entram no mapa (2244/4628/6351
// somam em cartaoMBTotal; 4845 e o unico Infinite ativo, cartaoInfiniteTotal). Cartao Mercado Pago casado
// pelo nome da conexao (Pluggy nao usa final-4 pra ele, usa "numero" interno tipo "7642").
const CARTAO_PLUGGY_MAPA_DEFAULT = {
  '2244': {titular:'Wallace', apelido:'MB físico', totalVar:'cartaoMBTotal'},
  '4628': {titular:'Wallace', apelido:'MB virtual', totalVar:'cartaoMBTotal'},
  '6351': {titular:'Vanessa', apelido:'MB ativo', totalVar:'cartaoMBTotal'},
  '4845': {titular:'Vanessa', apelido:'Visa Infinite ativo', totalVar:'cartaoInfiniteTotal'},
  '4844': {titular:'Wallace', apelido:'Visa Infinite aposentado', totalVar:null}, // CORRIGIDO 04/08/2026 (parte 84, achado durante migracao pro Supabase): estava 'Vanessa' aqui, mas a Politica (secao 3, tabela oficial de cartoes) diz Wallace - inconsistencia entre os dois, Politica prevalece (documento de referencia formal). so liquidacao, sem total agregado pra comparar
  '2773': {titular:'Wallace', apelido:'Bradesco parcelamentos antigos', totalVar:null},
  '0026': {titular:'Vanessa', apelido:'Bradesco', totalVar:null},
  // CONFIRMADO PELO USUARIO 03/08/2026: substituido de verdade pelo 6351 - a conexao Pluggy ainda nao foi
  // atualizada (continua puxando o cartao antigo). Fica mapeado (nao mais "nao mapeado"), mas sinalizado
  // como conexao desatualizada - acao real necessaria e do lado da Pluggy/banco, nao do codigo.
  // CORRIGIDO 04/08/2026 (parte 65, erro de sessao anterior): mapeamento estava errado - dizia
  // titular Vanessa, "substituido pelo 6351", conexaoDesatualizada. Usuario mostrou print do proprio
  // app da Pluggy: as 61 transacoes deste cartao (H57Store, Tapiocaria Irmao Firmi, Uber, Pax Domini)
  // sao EXATAMENTE as mesmas ja rastreadas manualmente como compras do WALLACE (TX000183-186,
  // TX000179/180 - conferido valor a valor, bate 100%). Ou seja: e o cartao MB atual do Wallace (o
  // "cartao NOVO 1371" mencionado nos comentarios de TX000184-186), a conexao Pluggy JA esta
  // atualizada e sincronizando normal - a resposta anterior desta sessao ("nenhum cartao do Wallace
  // aparece no Pluggy") estava errada, baseada neste mapeamento incorreto. totalVar agora aponta pra
  // cartaoMBTotal (mesmo agregado onde essas compras ja foram somadas manualmente), permitindo o
  // cruzamento fatura-Pluggy x ERP que antes ficava pulado (totalVar:null).
  // CORRIGIDO 04/08/2026 (parte 66, achado real ao vivo - usuario suspeitou certo): puxada a lista
  // COMPLETA das 61 transacoes deste "2250" no Supabase (nao so uma amostra) - e a FATURA UNICA E
  // CONSOLIDADA de todo o produto Itau Personnalite Multi Black, nao um cartao de uma pessoa so.
  // Mistura na mesma fatura: compras do Wallace (H57Store, Uber, Tapiocaria), TODAS as assinaturas/
  // recorrencias ja rastreadas em LRS/LRR (Netflix, Spotify, ChatGPT, Amazon Prime, Vivo, Brisanet,
  // Faculdade/SOCEC, Digna, New Car), E coisas antes atribuidas "assumidamente" a um cartao separado
  // da Vanessa (Drogasil TX000176, MP*TIORAFAKIDS TX000191 - corte de cabelo do filho) - todas aqui
  // tambem, sob o MESMO numero de conta Pluggy. Ou seja: os numeros "2244"/"4628"/"6351"/"1371"
  // citados nos comentarios do codigo sao os PLASTICOS fisicos/virtuais usados por cada pessoa da
  // familia, mas a Pluggy so enxerga UMA conta consolidada (fatura unica do produto Personnalite
  // Multi Black) - nao da pra saber por essa API qual pessoa/plastico fez cada compra individual
  // (precisaria de campo por-transacao que o script atual nao captura, nao confirmado se a Pluggy
  // ate expõe isso). CORRECAO DA PARTE 65 (que disse titular:'Wallace' sozinho) estava incompleta -
  // e conta compartilhada titular+dependente(s), nao so do Wallace. totalVar continua cartaoMBTotal
  // (esse SIM ja e o agregado combinado certo, isso a parte 65 acertou).
  '2250': {titular:'Compartilhada (Wallace+Vanessa, fatura única Personnalité Multi Black)', apelido:'MB - fatura consolidada (físicos 1371/2244 + virtual 4628 + dependente)', totalVar:'cartaoMBTotal'},
  // CONFIRMADO PELO USUARIO 03/08/2026: cartao bloqueado, sem uso - nao precisa reconciliar, so documentar
  // pra nao aparecer mais como "nao mapeado" a cada carga.
  '9187': {titular:null, apelido:'AZUL ITAU VISA INFINITE (bloqueado, sem uso)', totalVar:null, bloqueado:true}
};
// NOVO 04/08/2026 (parte 84, migracao ERP->Supabase pedida pelo usuario: "nao pode em nenhuma
// hipotese estar sem sincronismo entre o site e o ERP... nao deve sair alterando 10 numeros iguais no
// site, so deve mudar em 1 lugar, o site que busque a fonte"): CARTAO_PLUGGY_MAPA agora busca
// primeiro do Supabase (VARS.CARTAO_PLUGGY_MAPA, chave de topo em wallace_dados.dados, mesmo
// mecanismo Object.assign(VARS, dr) ja usado pra tudo mais) - o objeto literal acima
// (CARTAO_PLUGGY_MAPA_DEFAULT) vira só o fallback pra quando o Supabase estiver fora do ar/sem essa
// chave ainda. Daqui em diante, corrigir o mapeamento de cartao é 1 UPDATE no banco, nao 1 edicao de
// arquivo + deploy - fecha exatamente o gap que fez a correcao da parte 71 "sumir" entre sessoes.
const CARTAO_PLUGGY_MAPA = VARS.CARTAO_PLUGGY_MAPA || CARTAO_PLUGGY_MAPA_DEFAULT;
// 04/08/2026 (parte 49): id sintetico e deterministico por item da Pluggy, usado pra persistir a
// triagem (PLUGGY_TRIAGEM) e pra nao re-adicionar na Inbox um item que o usuario ja aprovou/rejeitou
// - sem isso, toda carga da pagina recriava o item do zero (reconciliarPluggy roda em todo onDomPronto)
// e o clique em Aprovar/Rejeitar nunca "grudava" de fato. Divergencia inclui o vencimento no id de
// proposito: uma nova fatura com nova divergencia deve poder aparecer de novo, mesmo cartao.
function gerarIdExternoPluggy(tipo, numero, extra){
  return `pluggy-${tipo}-${numero}${extra?('-'+extra):''}`;
}
function pluggyJaTriado(idExterno){
  const t = VARS.PLUGGY_TRIAGEM;
  return !!(t && t[idExterno] && (t[idExterno].status_triagem === 'aprovado' || t[idExterno].status_triagem === 'rejeitado'));
}

function reconciliarPluggy(){
  const pc = VARS.PLUGGY_CONTAS;
  const resultado = {divergencias:[], naoMapeados:[], erros:[], ok:[]};
  if(!pc || !pc.conexoes){
    console.warn('reconciliarPluggy: VARS.PLUGGY_CONTAS ainda nao chegou (offline ou Supabase sem esse campo nesta carga).');
    return resultado;
  }
  if(Array.isArray(pc.erros) && pc.erros.length){
    resultado.erros = pc.erros.slice();
    pc.erros.forEach(e=>console.warn('⚠ reconciliarPluggy - erro de conexao Pluggy:', e));
  }
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  pc.conexoes.forEach(conexao=>{
    (conexao.contas||[]).forEach(conta=>{
      if(conta.tipo !== 'CREDIT') return; // V1: so cartao de credito tem total agregado pra comparar no VARS hoje
      // Mercado Pago nao tem final-4 na Politica (CARTAO_MAPA so documenta Itau/Bradesco) - casa pelo nome.
      const mapa = /mercado\s*pago/i.test(conta.nome) ? {titular:'', apelido:'Mercado Pago', totalVar:'mercadoPagoFatura'} : CARTAO_PLUGGY_MAPA[conta.numero];
      if(!mapa){
        resultado.naoMapeados.push({numero:conta.numero, nome:conta.nome, saldo:conta.saldo});
        const idExt1 = gerarIdExternoPluggy('mapa', conta.numero);
        if(!pluggyJaTriado(idExt1)) inboxAdicionarItem({
          origem:'Pluggy', descricao:`Cartão final ${conta.numero} ("${conta.nome}") não mapeado na Política`,
          descricaoCompleta:`Cartão não mapeado na Política (final ${conta.numero}, "${conta.nome}") — verificar se é conexão antiga/duplicada ou cartão novo não documentado`,
          valor: conta.fatura_mes_atual ? conta.fatura_mes_atual.valor_total : conta.saldo,
          data: (conexao.atualizado_em||'').slice(0,10), categoriaSugerida:null, livroSugerido:null, confianca:null,
          idExterno: idExt1, silencioso:true
        });
        return;
      }
      if(mapa.bloqueado){ resultado.ok.push({numero:conta.numero, obs:`cartão bloqueado/sem uso (${mapa.apelido}), ignorado por decisão do usuário`}); return; }
      if(mapa.conexaoDesatualizada){
        resultado.ok.push({numero:conta.numero, obs:`conexão Pluggy desatualizada — ${mapa.apelido}, precisa reconectar no Pluggy pro cartão novo (6351), não é ajuste de código`});
        // so 1x por carga faz sentido lembrar isso - continua indo pra Inbox pra nao esquecer de reconectar
        const idExt2 = gerarIdExternoPluggy('desatualizada', conta.numero);
        if(!pluggyJaTriado(idExt2)) inboxAdicionarItem({
          origem:'Pluggy', descricao:`Conexão Pluggy desatualizada: final ${conta.numero} → 6351 (${mapa.apelido})`,
          descricaoCompleta:`Conexão Pluggy desatualizada: final ${conta.numero} foi substituído por 6351, mas a conexão ainda aponta pro cartão antigo — reconectar a conta no painel da Pluggy`,
          valor: conta.saldo, data: (conexao.atualizado_em||'').slice(0,10), categoriaSugerida:null, livroSugerido:null, confianca:null,
          idExterno: idExt2, silencioso:true
        });
        return;
      }
      if(!mapa.totalVar){ resultado.ok.push({numero:conta.numero, obs:'sem total agregado pra comparar (cartão aposentado/sem VARS correspondente)'}); return; }
      const faturaPluggy = conta.fatura_mes_atual ? conta.fatura_mes_atual.valor_total : null;
      const totalERP = VARS[mapa.totalVar];
      if(faturaPluggy == null){ resultado.ok.push({numero:conta.numero, obs:'Pluggy sem fatura_mes_atual nesta carga'}); return; }
      // NOVO 04/08/2026 (parte 77, pedido do usuario: "eu nao quero que o ciclo do mercado pago me
      // engane, resolva da forma profissional"): a checagem de vencimento abaixo (correta, evita
      // falso-positivo comparando fatura ja fechada) tinha o efeito colateral de o valor real do
      // Mercado Pago só aparecer pra quem le o console, nunca no painel - resultado.ok nunca é
      // mostrado linha a linha pro usuario (so contado, ver montarAlertasNegocio). Corrigido expondo
      // o saldo/fatura ATUAL da Pluggy (sempre, independente do vencimento) num campo proprio que o
      // painel pode mostrar direto - separa "e uma divergencia real?" (so faz sentido perto do
      // vencimento) de "qual e o saldo agora?" (deveria ser visivel o mes inteiro, sem enganar).
      if(mapa.totalVar === 'mercadoPagoFatura'){
        resultado.mercadoPagoSaldoAbertoPluggy = faturaPluggy;
        resultado.mercadoPagoVencimentoPluggy = conta.fatura_vencimento_atual || (conta.fatura_mes_atual && conta.fatura_mes_atual.vencimento) || null;
      }
      // CORRIGIDO 03/08/2026 (usuario apontou 2 falsos positivos reais): fatura_mes_atual da Pluggy pode
      // ser a ULTIMA fatura FECHADA (ja vencida/paga), nao a fatura em aberto - nesse caso comparar contra
      // o total corrente do ERP (que zera/reinicia apos o pagamento) e comparacao invalida, nao divergencia
      // real. So compara como divergencia quando o vencimento ainda esta no futuro (fatura em aberto).
      const vencStr = conta.fatura_vencimento_atual || (conta.fatura_mes_atual && conta.fatura_mes_atual.vencimento);
      const venc = vencStr ? new Date(vencStr) : null;
      if(venc && venc < hoje){
        resultado.ok.push({numero:conta.numero, obs:`fatura já vencida/paga (venc. ${vencStr.slice(0,10)}) — não comparada contra o total corrente do ERP`});
        return;
      }
      const diff = Math.round((faturaPluggy - totalERP)*100)/100;
      if(Math.abs(diff) > 0.01){
        const rotulo = (mapa.titular ? mapa.titular+' ' : '') + mapa.apelido;
        resultado.divergencias.push({cartao:`${rotulo} (${conta.numero})`, faturaPluggy, totalERP, diff});
        // vencimento entra no id: uma divergencia de um ciclo novo (fatura seguinte) deve poder
        // reaparecer mesmo que a do ciclo anterior ja tenha sido triada.
        const vencId = (conta.fatura_vencimento_atual||conexao.atualizado_em||'').slice(0,10);
        const idExt3 = gerarIdExternoPluggy('divergencia', conta.numero, vencId);
        if(!pluggyJaTriado(idExt3)) inboxAdicionarItem({
          origem:'Pluggy', descricao:`Divergência ${rotulo} (final ${conta.numero}): Pluggy R$${faturaPluggy.toFixed(2)} × ERP R$${totalERP.toFixed(2)} (diff R$${diff.toFixed(2)})`,
          descricaoCompleta:`Divergência ${rotulo} (final ${conta.numero}): fatura Pluggy R$${faturaPluggy.toFixed(2)} × ${mapa.totalVar} no ERP R$${totalERP.toFixed(2)} (diff R$${diff.toFixed(2)})`,
          valor: diff, data: (conta.fatura_vencimento_atual||'').slice(0,10), categoriaSugerida:null, livroSugerido:null, confianca:null,
          idExterno: idExt3, silencioso:true
        });
      } else {
        resultado.ok.push({numero:conta.numero, obs:'✅ fatura bate com o ERP'});
      }
    });
  });
  console.log('reconciliarPluggy:', resultado.divergencias.length, 'divergência(s),', resultado.naoMapeados.length, 'cartão(ões) não mapeado(s),', resultado.ok.length, 'ok(s).');
  renderInboxFinanceira(); // parte 54: 1 render só no final, nao mais 1 por item (ver silencioso:true acima)
  return resultado;
}

// V400 Etapa 3 (Reconciliador transação-a-transação) - reconciliarTransacoesPluggy().
// So faz sentido depois que o script externo sincronizar_pluggy.py (corrigido 03/08/2026, migrado
// de /transactions para /v2/transactions com cursor) voltar a popular conta.transacoes_recentes no
// Supabase - antes disso vinha so conta.transacoes_erro (HTTP 410), e essa funcao nao encontra nada
// pra comparar (nao e bug, e o dado ainda nao existir na carga atual).
// Mesma logica do script Python (buscar_valores_conhecidos/detectar_transacoes_suspeitas), so que em
// JS direto sobre o VARS ja carregado (nao precisa bater no Supabase de novo) - comparacao SO POR VALOR
// (nao por data/descricao), mesmo criterio do script: mais seguro deixar passar um falso-positivo
// (2 compras coincidentes do mesmo valor) do que perder uma compra real nao lancada.
// AJUSTADO 04/08/2026 (parte 55, achado ao vivo no Supabase, nao suposto): a 1a sincronizacao de uma
// conta na Pluggy sempre traz o historico completo (ate 12 meses, doc oficial: "these transactions
// are recovered... when syncing the item for the first time"), ignorando o "dias=40" do script Python -
// isso so vale pras proximas sincronizacoes (incrementais). Resultado real visto em producao: transacoes
// iam ate 28/07/2025 (mais de 1 ano), gerando 2.257 itens "suspeitos" - inviavel de revisar 1 a 1, e a
// maioria (2.292 de 2.707) e de ANTES do ciclo atual, sem nenhuma relacao com o controle corrente do
// ERP. Adicionado filtro por data aqui no JS (janelaDias, mesma janela que o script sempre pretendeu ter)
// - resolve na fonte que o app.js le, sem depender de corrigir o script Python de novo.
function reconciliarTransacoesPluggy(valorMinimo, janelaDias){
  valorMinimo = typeof valorMinimo === 'number' ? valorMinimo : 5.0;
  janelaDias = typeof janelaDias === 'number' ? janelaDias : 45;
  const dataCorte = new Date(Date.now() - janelaDias*86400000);
  const pc = VARS.PLUGGY_CONTAS;
  const resultado = {suspeitas:[], semDados:true, ignoradasPorData:0};
  if(!pc || !pc.conexoes) return resultado;

  // Mesmos 7 livros de transacao que o script Python le no Supabase - lista literal, nao inventada.
  const LIVROS_CONHECIDOS = ['LRW_TRANSACOES','LRV_TRANSACOES','LRC_LIMBO_TRANSACOES','LRCV_TRANSACOES',
    'PV_TRANSACOES','LRPV_TRANSACOES','BOLETOS_TRANSACOES'];
  const valoresConhecidos = new Set();
  LIVROS_CONHECIDOS.forEach(nomeLivro=>{
    (VARS[nomeLivro]||[]).forEach(t=>{
      if(typeof t.valor === 'number') valoresConhecidos.add(Math.round(Math.abs(t.valor)*100)/100);
    });
  });
  // NOVO 04/08/2026 (parte 57, pedido do usuario): tambem soma o historico COMPLETO do ERP
  // (HISTORICO_ERP_TODOS_CICLOS, todos os ciclos, nao so o atual) - sem isso, transacao de um ciclo
  // FECHADO batia como "sem registro" so porque os 7 livros acima so guardam o ciclo ao vivo. O
  // registro existe, so nao estava no conjunto de comparacao.
  (VARS.HISTORICO_ERP_TODOS_CICLOS||[]).forEach(t=>{
    if(typeof t.valor === 'number') valoresConhecidos.add(Math.round(Math.abs(t.valor)*100)/100);
  });

  // NOVO 04/08/2026 (parte 60, pedido do usuario apos ver 106 pendentes na Inbox): padroes de
  // descricao que NUNCA sao compra/gasto real do dia a dia - sao movimentacao interna entre as
  // proprias contas do usuario (PIX pra si mesmo, "caixinhas" internas do Mercado Pago), operacao
  // de investimento (aplicacao/resgate/liquidacao de bolsa), ou linha de RESUMO da fatura do banco
  // (nao uma compra individual - obviamente nunca vai bater com um lancamento especifico do ERP,
  // que rastreia item a item). Conferido ao vivo no Supabase: 118 das ~221 transacoes que a logica
  // marcava como "suspeita" batiam nesses padroes - nao eram gasto esquecido, eram ruido estrutural
  // do proprio extrato bancario. So exclui pelo padrao de DESCRICAO, nunca por valor/conta - continua
  // seguro (nao esconde nada que pareça uma compra de verdade).
  // AMPLIADO 04/08/2026 (parte 61, usuario listou 20 itens reais da Inbox, INBX000001-020): mais
  // padroes confirmados como quitacao/rendimento estrutural, nunca compra: pagamento de fatura de
  // cartao (Infinite/Mastercard Black/Mercado Pago) - ja rastreado por AGREGADO proprio
  // (VARS.cartaoInfiniteTotal/cartaoMBTotal/mercadoPagoFatura/faturaWartsila), entao a quitacao nunca
  // deveria bater com uma compra individual, e nao e "gasto sem lancar", e o lancamento agregado ja
  // existe noutro lugar; juros/encargos por atraso (encargo do banco, nao compra); Pix recebido de
  // programa de pontos (Livelo - entrada, nao gasto); movimentacao interna da conta de investimentos
  // (Necton - resgate/aplicacao/rendimento, mesma familia de LIQ BOLSA acima).
  // NAO incluido de proposito (usuario listou junto, mas SAO diferentes): conta Vivo/Brisanet (NAO
  // aparecem em VARS.CRONOGRAMA_BOLETOS_FIXOS, os 9 boletos recorrentes ja rastreados - parecem gasto
  // recorrente real ainda sem registro) e lavanderia DryUSA (compra avulsa comum, sem padrao
  // estrutural nenhum) - excluir esses do filtro seria esconder um gasto real, contra a Politica P1.
  const PADROES_RUIDO_TRANSACAO_DEFAULT_STR = [
    'dinheiro (retirado|reservado)',
    'wallace patrick gald',
    'aplica[cç][aã]o cofrinhos|resgate aplica[cç][aã]o',
    'liq bolsa|conta remunerada',
    'pagamento recebido|pagto\\.? por deb em c\\/c|pagto\\.? antec',
    'gastos cartao de credito',
    'ted[- ]?transf.*wartsila|ted recebida wartsila',
    'encargos limite de cred|iof s\\/',
    'pagamento.*fatura.*(infinite|mastercard black|mercado pago)|fatura.*(infinite|mastercard black|mercado pago).*pagamento',
    'juros.*atraso|encargos rotativos|multa.*atraso',
    'livelo',
    'encargos.{0,4}rotativo|iof.*rotativo',
    'pagamento cart[aã]o de cr[eé]dito|pagamento de fatura|fatura paga',
    'cartao corporativo',
  ];
  // MIGRADO 04/08/2026 (parte 84, ERP->Supabase): VARS.PADROES_RUIDO_TRANSACAO (array de strings,
  // regex nao serializa em JSON) sobrescreve a lista acima quando existir no Supabase - mesmo motivo
  // do CARTAO_PLUGGY_MAPA/piso acima. Corrigir/adicionar um padrao novo vira 1 UPDATE no banco.
  const PADROES_RUIDO_TRANSACAO = (VARS.PADROES_RUIDO_TRANSACAO || PADROES_RUIDO_TRANSACAO_DEFAULT_STR)
    .map(s => new RegExp(s, 'i'));
  function pareceRuidoInterno(descricao){
    const d = descricao || '';
    return PADROES_RUIDO_TRANSACAO.some(re=>re.test(d));
  }

  pc.conexoes.forEach(conexao=>{
    (conexao.contas||[]).forEach(conta=>{
      const transacoes = conta.transacoes_recentes;
      if(!Array.isArray(transacoes) || !transacoes.length) return; // ainda sem dado (410 antigo ou conta sem movimento)
      resultado.semDados = false;
      transacoes.forEach(t=>{
        if(t.status !== 'POSTED' || typeof t.valor !== 'number') return;
        // parte 55: fora da janela recente - historico do 1o sync completo da Pluggy, nao entra na
        // Inbox (nao e "perder dado real" - e dado de fora do periodo que o ERP controla granularmente).
        if(t.data && new Date(t.data) < dataCorte){ resultado.ignoradasPorData++; return; }
        const valorAbs = Math.round(Math.abs(t.valor)*100)/100;
        if(valorAbs < valorMinimo) return;
        if(pareceRuidoInterno(t.descricao)){ resultado.ignoradasPorRuido = (resultado.ignoradasPorRuido||0)+1; return; }
        if(!valoresConhecidos.has(valorAbs)){
          // CORRIGIDO 04/08/2026 (parte 54): faltava idExterno + checagem pluggyJaTriado aqui - mesmo
          // gap que a parte 42 diagnosticou e a parte 49 corrigiu pros itens de CARTAO da Pluggy, só
          // que este produtor (transação individual) tinha ficado de fora. Sem isso, TODA transação
          // suspeita seria recriada do zero em toda carga de página, pra sempre, mesmo já aprovada/
          // rejeitada - e agora com volume real (milhares de transações) isso também alimentava a
          // trava O(n²) corrigida acima. idExterno usa o id da própria transação da Pluggy (t.id),
          // já estável e único por natureza - não precisa sintetizar como no nível de cartão.
          const idExtTx = t.id ? `pluggy-tx-${t.id}` : null;
          if(idExtTx && pluggyJaTriado(idExtTx)) return;
          resultado.suspeitas.push({banco:conexao.banco, conta:conta.nome, data:t.data, descricao:t.descricao, valor:t.valor});
          inboxAdicionarItem({
            origem:'Pluggy-Transação',
            descricao:`${conexao.banco} (${conta.nome}): "${t.descricao}" — não encontrada em nenhum livro do ERP (comparação só por valor)`,
            valor: t.valor, data: (t.data||'').slice(0,10), categoriaSugerida:null, livroSugerido:null, confianca:null,
            idExterno: idExtTx, silencioso:true
          });
        }
      });
    });
  });
  console.log('reconciliarTransacoesPluggy:', resultado.semDados ? 'sem transacoes_recentes ainda (aguardando script externo corrigido rodar)' : `${resultado.suspeitas.length} transação(ões) suspeita(s), ${resultado.ignoradasPorData} ignorada(s) por serem fora da janela recente, ${resultado.ignoradasPorRuido||0} ignorada(s) por serem movimentação interna/resumo de fatura`);
  renderInboxFinanceira(); // parte 54: 1 render só no final, nao mais 1 por transação (ver silencioso:true acima)
  return resultado;
}

// V400 Etapa 10 (Classificador Determinístico) - regras fixas, zero IA/heurística nova, copiadas literal
// das regras JÁ CONFIRMADAS pelo usuário na Política (secao 3) e na Passagem de Turno - nada inventado.
// So SUGERE (preenche categoriaSugerida/livroSugerido/confianca no item da Inbox) - nunca muda o status
// nem lanca no livro razao, mesma proibicao P1/brief V400 de sempre. Roda so em item PENDENTE ainda sem
// sugestao (nao sobrescreve categorizacao ja feita manualmente ou por outra etapa).
function classificarItemDeterministico(descricao){
  const d = descricao || '';
  if(/uber/i.test(d)){
    // Excecao fixa da Politica (secao 3): Uber e sempre da Vanessa (LRV), EXCETO quando o nome da
    // Gabriela aparece explicito na descricao/notificacao - ai vai pro LRW (regra nova 23/07/2026).
    if(/gabriela/i.test(d)) return {categoriaSugerida:'Transporte (Uber - Gabriela)', livroSugerido:'LRW', confianca:0.90};
    return {categoriaSugerida:'Transporte (Uber)', livroSugerido:'LRV', confianca:0.85};
  }
  // Regra confirmada na Passagem de Turno: compra Anthropic e avulsa internacional, vai pro LRW normal
  // mesmo saindo do cartao 4628 (rotulado "assinaturas" na Politica, mas isso nao e assinatura).
  if(/anthropic/i.test(d)) return {categoriaSugerida:'Compra internacional avulsa', livroSugerido:'LRW', confianca:0.85};
  // Final-4-digitos do cartao, quando aparece na descricao (ex: itens vindos do reconciliarPluggy/
  // reconciliarTransacoesPluggy costumam citar "final XXXX") - usa o mapa CARTAO_PLUGGY_MAPA (mesma
  // fonte da Politica secao 3, ja usado por reconciliarPluggy) pra sugerir titular/livro. Confianca mais
  // baixa que as regras acima porque e so titular do cartao, nao confirma se a compra e mesmo dele
  // (ex: cartao adicional usado por outra pessoa) - por isso nao ultrapassa 0.7.
  const finalCartao = d.match(/final\s*(\d{4})/i);
  if(finalCartao && CARTAO_PLUGGY_MAPA[finalCartao[1]]){
    const mapa = CARTAO_PLUGGY_MAPA[finalCartao[1]];
    if(mapa.titular === 'Wallace') return {categoriaSugerida:`Cartão ${mapa.apelido}`, livroSugerido:'LRW', confianca:0.7};
    if(mapa.titular === 'Vanessa') return {categoriaSugerida:`Cartão ${mapa.apelido}`, livroSugerido:'LRV', confianca:0.7};
  }
  return null; // sem regra confirmada pra esse texto - fica sem sugestao, nunca chuta
}
function classificarInboxPendentes(){
  let classificados = 0;
  VARS.INBOX_FINANCEIRA.forEach(item=>{
    if(item.status !== 'PENDENTE' || item.categoriaSugerida) return; // ja tem sugestao (manual ou de outra etapa) - nao sobrescreve
    const sugestao = classificarItemDeterministico(item.descricao);
    if(sugestao){
      item.categoriaSugerida = sugestao.categoriaSugerida;
      item.livroSugerido = sugestao.livroSugerido;
      item.confianca = sugestao.confianca;
      classificados++;
    }
  });
  if(classificados) renderInboxFinanceira();
  console.log('classificarInboxPendentes:', classificados, 'item(ns) classificado(s) automaticamente (sugestão apenas — aprovação continua manual).');
  return classificados;
}

// V450 (Mercado Pago Financial Gateway) - Etapas 5+6 da ordem obrigatoria do brief.
// Le VARS.MERCADOPAGO_EVENTOS (gravado externamente por mercadopago_sync.py, mesmo padrao de
// VARS.PLUGGY_CONTAS) - este arquivo NUNCA fala com a API do Mercado Pago diretamente, so consome
// o que ja chegou pronto no Supabase. Mesma proibicao de sempre: nunca lanca TX, so alimenta a Inbox.

// Etapa 5 (Classificador) - regras fixas do brief V450, SEM IA/LLM (exigencia explicita do brief).
// categoriaSugerida cobre os exemplos literais do brief (Uber/iFood/Posto/Mercado Livre). livroSugerido
// SO e preenchido quando ja existe regra confirmada na Politica/Passagem de Turno (hoje, so Uber) - pras
// categorias novas (iFood/Posto/Mercado Livre) nao existe ainda uma regra de titular confirmada, entao
// livroSugerido fica null por decisao (P1: nao chutar quem paga o que) ate o usuario confirmar um padrao,
// mesmo tratamento que classificarItemDeterministico ja da a descricoes sem regra.
function classificarItemMercadoPago(descricao){
  const d = descricao || '';
  if(/uber/i.test(d)){
    // Mesma excecao fixa da Politica (secao 3): Gabriela -> LRW, padrao -> LRV.
    if(/gabriela/i.test(d)) return {categoriaSugerida:'Transporte (Uber - Gabriela)', livroSugerido:'LRW', confianca:0.90};
    return {categoriaSugerida:'Transporte (Uber)', livroSugerido:'LRV', confianca:0.85};
  }
  if(/anthropic/i.test(d)) return {categoriaSugerida:'Compra internacional avulsa', livroSugerido:'LRW', confianca:0.85};
  if(/ifood/i.test(d)) return {categoriaSugerida:'Alimentação (iFood)', livroSugerido:null, confianca:0.6};
  if(/posto\b|combust[ií]vel/i.test(d)) return {categoriaSugerida:'Combustível', livroSugerido:null, confianca:0.6};
  if(/mercado\s*livre/i.test(d)) return {categoriaSugerida:'Compras Online (Mercado Livre)', livroSugerido:null, confianca:0.6};
  return null; // sem regra confirmada - fica sem sugestao, nunca chuta
}

// Etapa 4->3 (ponte Sync -> Inbox) + Etapa 6 (Conciliacao) combinadas: cada FinancialEvent normalizado
// vira 1 InboxItem (nunca direto em LRW/LRV/etc - proibicao central do brief). Antes de criar o item,
// confere se o valor ja aparece em algum dos livros conhecidos (mesma lista/criterio de
// reconciliarTransacoesPluggy, comparacao so por valor) - se aparecer, marca "possivel duplicidade" na
// descricao em vez de lancar/pular sozinho (o brief pede deteccao, nao decisao automatica).
// Dedupe entre cargas: usa o campo idExterno guardado no InboxItem (id do FinancialEvent, "MP<id>") -
// um mesmo evento nunca gera 2 itens de Inbox, mesmo rodando de novo em cargas futuras.
function sincronizarMercadoPagoParaInbox(){
  const eventos = VARS.MERCADOPAGO_EVENTOS;
  if(!Array.isArray(eventos) || !eventos.length){
    console.warn('sincronizarMercadoPagoParaInbox: VARS.MERCADOPAGO_EVENTOS ainda nao chegou (offline, Supabase sem esse campo, ou mercadopago_sync.py ainda nao rodou nesta conta).');
    return {novos:0};
  }
  const LIVROS_CONHECIDOS = ['LRW_TRANSACOES','LRV_TRANSACOES','LRC_LIMBO_TRANSACOES','LRCV_TRANSACOES',
    'PV_TRANSACOES','LRPV_TRANSACOES','BOLETOS_TRANSACOES'];
  const valoresConhecidos = new Set();
  LIVROS_CONHECIDOS.forEach(nomeLivro=>{
    (VARS[nomeLivro]||[]).forEach(t=>{ if(typeof t.valor === 'number') valoresConhecidos.add(Math.round(Math.abs(t.valor)*100)/100); });
  });
  // parte 57: mesmo ajuste de reconciliarTransacoesPluggy() - historico completo (todos os ciclos),
  // nao so o ciclo ao vivo, pra "possivel duplicidade" nao ignorar registro de ciclo ja fechado.
  (VARS.HISTORICO_ERP_TODOS_CICLOS||[]).forEach(t=>{
    if(typeof t.valor === 'number') valoresConhecidos.add(Math.round(Math.abs(t.valor)*100)/100);
  });
  const jaImportados = new Set(VARS.INBOX_FINANCEIRA.map(it=>it.idExterno).filter(Boolean));
  let novos = 0;
  eventos.forEach(ev=>{
    if(!ev || !ev.id || jaImportados.has(ev.id)) return; // ja esta na Inbox, nao duplica
    // CORRIGIDO 04/08/2026 (parte 39): status_triagem e gravado pela RPC atualizar_mercadopago_eventos
    // (merge por id) pra distinguir evento novo ('pendente') de historico ja reconciliado/decidido
    // ('arquivado_historico' etc). Sem esse filtro, TODO reload reimportava os 500 eventos do 1o sync
    // (INBOX_FINANCEIRA nao persiste entre cargas - ver nota abaixo). Ausencia do campo (dado antigo em
    // cache) e tratada como 'pendente', pra nao esconder nada por engano.
    if(ev.status_triagem && ev.status_triagem !== 'pendente') return;
    if(typeof ev.valor !== 'number') return; // evento sem valor normalizado, nao entra (nada a conciliar)
    const valorAbs = Math.round(Math.abs(ev.valor)*100)/100;
    const possivelDuplicata = valoresConhecidos.has(valorAbs);
    const sugestao = classificarItemMercadoPago(ev.descricao) || {};
    // CORRIGIDO 04/08/2026 (parte 54): idExterno agora vai direto na criacao (idExterno: ev.id) em vez
    // de um VARS.INBOX_FINANCEIRA.find(...) logo depois pra "achar de volta" o item e so entao setar -
    // essa busca era O(n) a cada evento, mesma familia do bug O(n²) corrigido acima (gerarProximoInboxId/
    // renderInboxFinanceira). silencioso:true pelo mesmo motivo: 1 render no final, nao 1 por evento.
    inboxAdicionarItem({
      origem: 'Mercado Pago',
      descricao: (ev.descricao||'(sem descrição)') + (possivelDuplicata ? ' — ⚠ possível duplicidade (valor já existe em algum livro do ERP)' : ''),
      valor: ev.valor, data: ev.data,
      categoriaSugerida: sugestao.categoriaSugerida || null,
      livroSugerido: sugestao.livroSugerido || null,
      confianca: sugestao.confianca != null ? sugestao.confianca : null,
      idExterno: ev.id, silencioso:true
    });
    novos++;
  });
  console.log('sincronizarMercadoPagoParaInbox:', novos, 'evento(s) novo(s) levado(s) pra Inbox.');
  renderInboxFinanceira(); // parte 54: 1 render só no final, nao mais 1 por evento
  return {novos};
}

// Etapa 9 (Dashboard) - indicadores derivados so da Inbox (origem 'Mercado Pago') e de
// VARS.MERCADOPAGO_EVENTOS, nunca de um calculo/estimativa nova - mesma regra P1 de sempre. Enquanto
// mercadopago_sync.py nao roda de verdade, a secao fica com "—" em tudo (sem dado fabricado), igual a
// Inbox ficou vazia ate a Etapa 1 ter dado real (mesmo padrao ja usado, nao e bug).
function renderMercadoPagoDashboard(){
  const el = $('mpDashboardResumo');
  if(!el) return; // secao pode nao existir num HTML antigo carregado em cache
  const itensMP = VARS.INBOX_FINANCEIRA.filter(i=>i.origem === 'Mercado Pago');
  if(!itensMP.length){
    el.innerHTML = '<div style="color:var(--text-dim);font-size:0.72rem">Nenhum evento do Mercado Pago capturado ainda — aguardando mercadopago_sync.py (V450) rodar e gravar VARS.MERCADOPAGO_EVENTOS.</div>';
    return;
  }
  const receitas = itensMP.filter(i=>i.valor > 0).reduce((s,i)=>s+i.valor, 0);
  const despesas = itensMP.filter(i=>i.valor < 0).reduce((s,i)=>s+Math.abs(i.valor), 0);
  const pendentes = itensMP.filter(i=>i.status === 'PENDENTE').length;
  el.innerHTML = `
    <div class="grid-4">
      <div><div style="color:var(--text-dim);font-size:0.65rem">Receitas (Inbox)</div><div class="v" style="color:var(--green)">${fmt(receitas)}</div></div>
      <div><div style="color:var(--text-dim);font-size:0.65rem">Gastos (Inbox)</div><div class="v" style="color:var(--red)">${fmt(despesas)}</div></div>
      <div><div style="color:var(--text-dim);font-size:0.65rem">Eventos capturados</div><div class="v">${itensMP.length}</div></div>
      <div><div style="color:var(--text-dim);font-size:0.65rem">Aguardando aprovação</div><div class="v">${pendentes}</div></div>
    </div>`;
}


function renderParcelamentos(){
  const lrpTbody = $('lrpTbody');
  if(lrpTbody){
    lrpTbody.innerHTML = VARS.PARCELAMENTOS_VISA
      .filter(p => p.status === 'ATIVO')
      .map(p => {
        const ultima = p.parcelaAtual === p.totalParcelas;
        const emoji = ultima ? ' 🔚' : '';
        const classe = ultima ? ' class="last-parcel"' : '';
        return `<tr${classe}><td class="mono">${p.tx}</td><td>${p.nome}${emoji}</td><td class="mono">${p.parcelaAtual}/${p.totalParcelas}</td><td class="r">${fmt(p.valor)}</td></tr>`;
      }).join('');
  }

  const lrmpTbody = $('lrmpTbody');
  if(lrmpTbody){
    lrmpTbody.innerHTML = VARS.PARCELAMENTOS_MP
      .filter(p => p.status === 'ATIVO')
      .map(p => {
        const ultima = p.parcelaAtual === p.totalParcelas;
        const emoji = ultima ? ' 🔚' : '';
        const classe = ultima ? ' class="last-parcel"' : '';
        return `<tr${classe}><td class="mono">${p.tx}</td><td>${p.nome}${emoji}</td><td class="mono">${p.parcelaAtual}/${p.totalParcelas}</td><td class="r">${fmt(p.valor)}</td></tr>`;
      }).join('');
  }

  // V159: filtro dinamico por DATA - itens corporativos/avulsos so aparecem se a data deles for
  // dentro do ciclo selecionado (usando o periodo real do CICLO_SNAPSHOTS, nao mais editado a mao).
  const lrmpCorpTbody = $('lrmpCorpTbody');
  if(lrmpCorpTbody){
    const snap = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    const [iniStr, fimStr] = snap.periodo.split(' a ').map(s=>{
      const [d,m,a] = s.trim().split('/');
      return new Date(a, m-1, d);
    });
    const itensDoCiclo = VARS.TRANSACOES_CORPORATIVAS_MP.filter(t=>{
      const dt = new Date(t.data);
      return dt >= iniStr && dt <= fimStr;
    });
    lrmpCorpTbody.innerHTML = itensDoCiclo.map(t=>{
      const tipoLabel = t.tipo === 'corp' ? 'corp.' : 'único';
      return `<tr><td class="mono">${t.tx}</td><td>${t.nome}</td><td class="mono">${tipoLabel}</td><td class="r">${fmt(t.valor)}</td></tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:1rem 0">Nenhum item corporativo/avulso neste ciclo.</td></tr>';
  }

  const qtdVisaAtivo = VARS.PARCELAMENTOS_VISA.filter(p=>p.status==='ATIVO').length;
  const qtdMPAtivo = VARS.PARCELAMENTOS_MP.filter(p=>p.status==='ATIVO').length;
  const snapAtual = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
  const [iniAtual, fimAtual] = snapAtual.periodo.split(' a ').map(s=>{
    const [d,m,a] = s.trim().split('/');
    return new Date(a, m-1, d);
  });
  const qtdCorpAtivo = VARS.TRANSACOES_CORPORATIVAS_MP.filter(t=>{
    const dt = new Date(t.data);
    return dt >= iniAtual && dt <= fimAtual;
  }).length;
  const lrpQtdEl = $('tfLRPQtd');
  if(lrpQtdEl) lrpQtdEl.textContent = qtdVisaAtivo+' lançamentos ativos · âmbar = última parcela';
  const lrmpQtdEl = $('tfLRMPQtd');
  if(lrmpQtdEl) lrmpQtdEl.textContent = (qtdMPAtivo+qtdCorpAtivo)+' lançamentos ('+qtdMPAtivo+' parcelas + '+qtdCorpAtivo+' corp./avulso, filtrado por ciclo)';
}

// V162 (25/07/2026): contagem dinamica das abas de Livros Razao (secao 15) - antes eram numeros
// FIXOS no HTML ("Wallace (0)", "Boletos (9)" etc), nunca calculados, sempre dessincronizados da
// tabela real embaixo. Agora cada botao conta as <tr> de verdade dentro do seu painel correspondente,
// sempre exato. Roda por ultimo (depois de renderParcelamentos ja ter gerado as tabelas dinamicas).
function atualizarContagemAbas(){
  const mapa = {
    lrw: 'LRW - Wallace', lrv: 'LRV - Vanessa', lrb: 'LRB - Boletos', lrp: 'LRP - Parcelas',
    lrs: 'LRS - Assinaturas', lrr: 'LRR - Recorrências', lrcon: 'LRCON - Consórcios', lrc: 'LRC - Corporativo',
    lrmp: 'LRMP - Merc. Pago', lrcv: 'LRCV - Caixa Var.', lrei: 'LREI - Empréstimos', lrdoacao: 'LRDOA - Doações', lrpv: 'LRPGV - PGV', lrpvsaldo: 'LRPV - PV'
  };
  Object.keys(mapa).forEach(paneId => {
    const pane = $(paneId);
    const btn = document.querySelector(`[onclick*="showLR('${paneId}'"]`);
    if(!pane || !btn) return;
    // CORRIGIDO 25/07/2026 (V162): antes contava TODAS as <tr> (.length), incluindo linhas escondidas
    // pelo filtro de ciclo (display:none) e a linha de mensagem "nenhuma compra ainda" (colspan) -
    // por isso o numero nunca batia com o que aparecia na tela (ex: "Wallace (61)" quando so 0-1
    // estavam visiveis). Agora conta so linhas de dado real e visiveis de fato.
    const todasLinhas = pane.querySelectorAll('tbody tr');
    let count = 0;
    todasLinhas.forEach(tr=>{
      const estaEscondida = tr.style.display === 'none';
      const ehMensagemVazia = tr.querySelector('td[colspan]') !== null;
      if(!estaEscondida && !ehMensagemVazia) count++;
    });
    btn.textContent = `${mapa[paneId]} (${count})`;
  });
}

function popularSeletorCiclo(){
  const wrap = $('cicloSeletorBtns');
  if(!wrap) return;
  wrap.innerHTML = '';
  // ordem mais recente primeiro (ciclo atual a esquerda)
  [...CICLO_LISTA].reverse().forEach(key=>{
    const snap = VARS.CICLO_SNAPSHOTS[key];
    const btn = document.createElement('button');
    btn.className = 'ciclo-btn' + (snap.fechado ? ' ciclo-fechado-btn' : '');
    btn.id = 'cicloBtn_'+key;
    btn.textContent = snap.fechado ? ('🔒 '+snap.label.replace(' — FECHADO','')) : ('🟢 '+snap.label.replace(' — ATUAL',''));
    btn.onclick = () => trocarCiclo(key);
    wrap.appendChild(btn);
  });
  atualizarBotoesSeletorCiclo();
}


// V135 (22/07/2026): labels/cores do detalhamento Visa Infinite, compartilhados pelos 3 graficos que
// usam Object.values(REG.visaDetalhe) (cVisa, g_cVisa, g_cVisaBar) - antes cada um tinha sua propria
// copia do array de labels (3x), agora todos leem daqui. Ordem tem que bater exatamente com a ordem
// das chaves de REG.visaDetalhe (parcelas, consorcios, wallace, recorrencias, corp, assinaturas,
// vanessa, naoReconciliado).
const VISA_DETALHE_LABELS = ['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa','Não Reconciliado'];
const VISA_DETALHE_CORES = ['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0','#4a4d52'];

function hydrate(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;
  t('kpiPatrimonio', 'R$ '+Math.round(R.patrimonio.total).toLocaleString('pt-BR'));
  t('kpiPatrimonioPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('kpiTotalOp', 'R$ '+Math.round(R.operacional.totalOperacional).toLocaleString('pt-BR'));
  t('kpiNecBruta', Math.round(R.operacional.necessidadeTotalBruta).toLocaleString('pt-BR'));
  t('kpiNecLiquida', Math.round(R.operacional.necessidadeLiquida).toLocaleString('pt-BR'));
  t('kpiCaixaVarDisp', fmt(R.caixaVariavel.disponivel));
  t('kpiModoOp', R.operacional.modoOperacional);
  t('kpiSaldoCiclo', R.operacional.saldoCiclo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));

  t('s02Salario', fmt(R.operacional.salario));
  t('s02Reembolsos', fmt(R.operacional.reembolsosAReceber));
  t('s02Entradas', fmt(R.operacional.entradasTotais));
  t('s02SaldoCiclo', R.operacional.saldoCiclo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  // CORRIGIDO 25/07/2026 (V143→V144): este card era 100% texto fixo ("Salário Alto", badge "Alto",
  // texto de "cumprir aportes") - nunca mudava mesmo quando o Modo Operacional real era outro. Agora
  // reage de verdade as 4 faixas da secao 10 das Politicas.
  (function(){
    const modo = R.operacional.modoOperacional;
    const cfg = {
      'Crítico': {cor:'#e2554f', badge:'Crítico', titulo:'Salário Crítico', faixa:'(< R$ 0)', texto:'Suspender aportes patrimoniais.'},
      'Baixo':   {cor:'#e2a13f', badge:'Baixo',   titulo:'Salário Baixo',   faixa:'(R$ 0 – R$ 2.999)', texto:'Reduzir gastos na ordem: Churrasco → Combustível → Eventos → Manutenção.'},
      'Normal':  {cor:'#e8d34f', badge:'Normal',  titulo:'Salário Normal',  faixa:'(R$ 3.000 – R$ 7.999)', texto:'Cumprir aportes normalmente.'},
      'Alto':    {cor:'var(--green)', badge:'Alto', titulo:'Salário Alto',  faixa:'(≥ R$ 8.000)', texto:'Cumprir todos os aportes e direcionar todo excedente para Caixa Lance e BTG/Necton.'},
    }[modo] || {cor:'var(--green)', badge:'—', titulo:'Modo Operacional', faixa:'', texto:''};
    t('s02ModoTitulo', cfg.titulo);
    t('s02ModoBadge', cfg.badge);
    t('s02ModoFaixa', cfg.faixa);
    t('s02ModoTexto', cfg.texto);
    const tituloEl = $('s02ModoTitulo');
    const cardEl = $('s02ModoCard');
    if(tituloEl) tituloEl.style.color = cfg.cor;
    if(cardEl) cardEl.style.borderLeftColor = cfg.cor;
  })();

  t('s20TotalOp', fmt(R.operacional.totalOperacional));
  t('s20Orcamento', fmt(R.operacional.orcamentoOperacional));
  t('s20NecBruta', fmt(R.operacional.necessidadeTotalBruta));
  t('s20Garantido', R.operacional.coberturaGarantida.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('s20NecLiquida', fmt(R.operacional.necessidadeLiquida));

  t('r21Patrimonio', fmt(R.patrimonio.total));
  t('r21MetaMilhaoPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('r21ModoOp', R.operacional.modoOperacional);
  t('r21Visa', fmt(R.cartaoInfinite.total));
  t('r21MB', fmt(R.cartaoMB.total));
  t('r21MP', fmt(R.mercadoPago));
  t('r21Wartsila', fmt(R.faturaWartsila));
  t('r21TotalOp', fmt(R.operacional.totalOperacional));
  const totalOpMar27 = R.evolucao.totalOperacional[R.evolucao.totalOperacional.length-1];
  t('r21TotalOpMar27', fmt(totalOpMar27));

  // Fase 3 - Reserva de Emergencia (secao 04, pagina Cenarios)
  const ciclosNormal = R.reserva.atual / R.operacional.necessidadeTotalBruta;
  const ciclosExtremo = R.reserva.atual / R.reserva.piso;
  t('resNormalValor', fmt(R.operacional.necessidadeTotalBruta)+' /ciclo');
  t('resNormalCiclos', '≈ '+ciclosNormal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ciclos (~'+Math.round(ciclosNormal)+' meses)');
  t('resExtremoValor', fmt(R.reserva.piso)+' /ciclo');
  t('resExtremoCiclos', '≈ '+ciclosExtremo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ciclos (~'+ciclosExtremo.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' meses)');
  t('resAtual', R.reserva.atual.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('resDiffMeses', (ciclosExtremo-ciclosNormal).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}));

  // Fase 3 - Estimador de Salario (ciclo que comeca 25/07 = Ago/26)
  t('estLiquido', fmt(liquidoMes(0)));
  { // Rótulo dinâmico: mostra qual fonte da regra de 3 níveis está ativa agora (real/projetado/média).
    const diaHoje = new Date().getDate();
    const temReal = (REG.superavitNormal.liquidoReal||{})[0] != null;
    const fonteLabel = temReal ? 'Real recebido'
      : (diaHoje>=12 ? 'Projetado (Estimador de Salário)' : 'Média ponderada 12M (sem estimativa ainda)');
    // CORRIGIDO 01/08/2026 (V244): "Ciclo 25/07 (Ago/26)" era texto fixo, formato estranho apontado pelo
    // usuario - agora deriva do periodo real do ciclo atual (snap.periodo), formato "25/07 a Ago/26".
    const snapCicloTxt = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const [iniTxt, fimTxt] = snapCicloTxt.periodo.split(' a ');
    const [diaIni, mesIni] = iniTxt.split('/');
    const [, mesFim, anoFim] = fimTxt.split('/');
    const cicloTxt = diaIni+'/'+mesIni+' a '+MESES_ABREV[Number(mesFim)-1]+'/'+anoFim.slice(-2);
    t('estStatusFonte', 'Ciclo '+cicloTxt+' · '+fonteLabel);
  }
  t('estNecLiquida', fmt(R.estimador.necessidadeLiquidaProximoCiclo));
  const excedenteEst = liquidoMes(0) - R.estimador.necessidadeLiquidaProximoCiclo;
  t('estExcedente', fmt(excedenteEst)+' · Modo Normal');

  // Fase 3 - totais dos livros razao (tfoot de cada tabela)
  const fmtSinal = v => (v<0?'− ':'')+fmt(Math.abs(v));
  const L = R.livrosRazaoTotais;
  t('tfLRW', fmt(L.LRW.total));
  t('tfLRV', fmt(L.LRV.total));
  t('tfLRB', fmt(L.LRB.total));
  t('tfLRP', fmt(L.LRP.total));
  t('tfLRS', fmt(L.LRS.total));
  t('tfLRR', fmt(L.LRR.total));
  t('tfLRCON', fmt(L.LRCON.total));
  t('tfLRC', fmt(L.LRC.total));
  t('tfLRMP', fmt(L.LRMP.total));
  t('tfLRPV', fmt(L.LRPV.total));
  // tfLRCV/tfLRCVresumo removidos (18/07/2026, V84): a tabela LRCV foi dividida em "PIX/gastos reais"
  // (visível) vs "movimentações internas" (recolhível, <details>) porque misturar as duas fazia o
  // total "líquido" não significar nada (soma de gasto real + repasse de boleto + LREI + venda de P2P).
  // Os 2 rodapés agora são texto estático mantido manualmente junto com as linhas da tabela.

  // ===== Batch final (16/07/2026) - varredura completa a pedido do usuario =====
  const fmtInt = v => 'R$ '+Math.round(v).toLocaleString('pt-BR');
  const fmtSign = v => (v<0?'−':'+')+'R$'+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  // cover-metrics
  t('coverPatrimonio', fmtInt(R.patrimonio.total));
  t('coverMetaPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('coverModoOp', R.operacional.modoOperacional);
  t('coverCaixaVar', fmt(R.caixaVariavel.disponivel));

  // patrimonio breakdown
  t('patTotal', fmt(R.patrimonio.total));
  t('patReserva', fmt(R.patrimonioDetalhe.reserva));
  t('patBtg', fmt(R.patrimonioDetalhe.btg));
  t('patLance', fmt(R.patrimonioDetalhe.caixaLance));
  t('patEscola', fmt(R.patrimonioDetalhe.nectonContaCorrente));
  t('patAcumulado', fmt(R.patrimonio.total));
  t('patFalta', fmt(R.patrimonio.metaMilhao - R.patrimonio.total));
  t('patPctBadge', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=$('patPctBar'); if(el) el.style.width = R.patrimonio.metaMilhaoPct+'%'; }

  // V142: secao 11 Passivos Patrimoniais
  const PP = R.passivosPatrimoniais;
  t('ppFinanciamentoCasa', fmt(PP.financiamentoCasa));
  t('ppFinanciamentoDetalhe', 'Prestação '+fmt(PP.prestacaoFinanciamentoCasa)+' · '+PP.mesesRestantesFinanciamentoCasa+' meses restantes');
  t('ppConsorcioAuto', fmt(PP.consorcioAuto));
  { const el=$('ppConsorcioAutoBar'); if(el) el.style.width = PP.consorcioAutoPct+'%'; }
  t('ppConsorcioAutoPct', PP.consorcioAutoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'% pago');
  t('ppConsorcioAutoParcela', 'Parcela '+fmt(PP.parcelaConsorcioAuto));

  // caixas operacionais
  const C = R.caixasOperacionais;
  const pctOf = (s,m) => m>0 ? Math.min(100, s/m*100) : 0;
  t('cxBoletosSaldo', fmt(C.boletos.saldo));
  t('cxBoletosMeta', fmtInt(C.boletos.meta));
  t('cxBoletosPct', pctOf(C.boletos.saldo,C.boletos.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxBoletosBar'); if(el) el.style.width = pctOf(C.boletos.saldo,C.boletos.meta)+'%'; }
  t('cxPixSaldo', fmt(C.pixVanessa.saldo));
  t('cxPgvSaldo', fmt(VARS.pixGeralVanessaSaldo)); // V175: card separado - PGV e conta autonoma da Vanessa, distinta da PV (reserva do Wallace)
  t('cxPixMeta', fmtInt(C.pixVanessa.meta));
  t('cxPixPct', pctOf(C.pixVanessa.saldo,C.pixVanessa.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxPixBar'); if(el) el.style.width = pctOf(C.pixVanessa.saldo,C.pixVanessa.meta)+'%'; }
  t('cxManutSaldo', fmt(C.manutencao.saldo));       t('cxManutMeta', fmtInt(C.manutencao.meta));
  { const el=$('cxManutBar'); if(el) el.style.width = pctOf(C.manutencao.saldo, C.manutencao.meta)+'%'; }
  t('cxEventosSaldo', fmt(C.eventos.saldo));        t('cxEventosMeta', fmtInt(C.eventos.meta));
  t('cxEventosPct', pctOf(C.eventos.saldo, C.eventos.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=document.querySelector('#cxEventosSaldo').closest('.card').querySelector('.fill'); if(el) el.style.width = pctOf(C.eventos.saldo, C.eventos.meta)+'%'; }
  // NOVO 30/07/2026 (V206): card do Fundo de Suavização - existia no calculo (VARS.contaSuavizacao)
  // e no alerta desde a ativacao (V205), mas nunca tinha card visual proprio na tela. Usuario perguntou
  // "onde esta a caixa de amortecedor no site" - nao estava em lugar nenhum, so no texto do alerta.
  const suaviz = VARS.contaSuavizacao;
  const suavizExcedente = REG.operacional.excedenteOuComplementoProLabore;
  t('cxSuavizSaldo', fmt(suaviz));
  // ATUALIZADO 03/08/2026: era fmt(pró-labore) - agora mostra a META OFICIAL do fundo (R$12.000,
  // decisão do usuário: pior déficit mensal x 3 meses de colchão, arredondado pra meta mínima das
  // 3 opções apresentadas). Nome do card mantido ("Fundo de Suavização Salarial") - só a meta mudou.
  t('cxSuavizProLabore', 'Meta ' + fmt(VARS.metaSuavizacao));
  const suavizTxtEl = $('cxSuavizTxt');
  if(suavizTxtEl){
    if(suaviz === 0 && suavizExcedente > 0) suavizTxtEl.textContent = 'Zerada · excedente do ciclo: ' + fmt(suavizExcedente);
    else if(suaviz === 0) suavizTxtEl.textContent = 'Zerada';
    else suavizTxtEl.textContent = pctOf(suaviz, VARS.metaSuavizacao).toFixed(1) + '% da meta · ' + (suaviz/VARS.proLaboreFixo).toFixed(1) + ' mês(es) de colchão';
  }
  const suavizBar = $('cxSuavizBar');
  if(suavizBar) suavizBar.style.width = pctOf(suaviz, VARS.metaSuavizacao) + '%';
  t('cxSaudeSaldo', fmt(C.saudeFamilia.saldo));     t('cxSaudeMeta', fmtInt(C.saudeFamilia.meta));
  t('cxAnivSaldo', fmt(C.aniversarioJulio.saldo));  t('cxAnivMeta', fmtInt(C.aniversarioJulio.meta));
  t('cxSeguroSaldo', fmt(C.seguroEmplacamento.saldo)); t('cxSeguroMeta', fmtInt(C.seguroEmplacamento.meta));
  // NOVO 23/07/2026: card Escola de Julio adicionado na secao 05 (Caixas Operacionais) a pedido do
  // usuario - mesma fonte ja usada no card dedicado da secao 14 (R.escolaJulioSaldo/R.patrimonio.metaEscolaJulio).
  t('cxEscolaSaldo', fmt(R.escolaJulioSaldo));
  t('cxEscolaMeta', fmtInt(R.patrimonio.metaEscolaJulio));
  t('cxEscolaPct', pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxEscolaBar'); if(el) el.style.width = pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio)+'%'; }

  // caixa variavel
  t('cvSaldoReal', fmt(R.caixaVariavel.saldoReal));
  t('cvComprometido', fmt(R.caixaVariavel.comprometido));
  t('cvDisponivel', fmt(R.caixaVariavel.disponivel));

  // NOVO 23/07/2026: Operacoes P2P (secao 18) - antes 100% hardcoded, agora vem do REG.p2p
  t('p2pCapitalTotal', fmt(R.p2p.capitalTotal));
  t('p2pCreditosRestantes', R.p2p.creditosRestantes + ' / ' + R.p2p.creditosTotal);
  t('p2pSaldoInvestido', fmt(R.p2p.saldoInvestido));
  t('p2pLucroRealizado', fmt(R.p2p.lucroRealizado));
  t('p2pDetalhe', `Custo ${fmt(R.p2p.precoCompra)}/crédito · Venda ${fmt(R.p2p.precoVenda)}/crédito (rentabilidade ${R.p2p.rentabilidadePct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}% sobre o custo) · ${R.p2p.creditosVendidos} créditos vendidos deste lote (1 crédito doado à Vanessa em 13/07, não contado como venda) — última venda: TXP2P0003, 2 créditos, R$40,00, 22/07/2026.`);

  // visa infinite
  t('visaTotal', fmt(R.cartaoInfinite.total));
  t('visaPessoal', fmt(R.cartaoInfinite.total - R.visaDetalhe.corp));
  t('visaLRW', fmt(R.visaDetalhe.wallace));
  t('visaLRV', fmt(R.visaDetalhe.vanessa));
  t('visaLRP', fmt(R.visaDetalhe.parcelas));
  t('visaLRS', fmt(R.visaDetalhe.assinaturas));
  t('visaLRR', fmt(R.visaDetalhe.recorrencias));
  t('visaLRCON', fmt(R.visaDetalhe.consorcios));
  t('visaLRC', fmt(R.visaDetalhe.corp));
  t('visaLRNaoReconciliado', fmt(R.visaDetalhe.naoReconciliado)); // V135: residuo soma-livros x fatura-real, documentado (P1)
  // mastercard black
  t('mbTotal', fmt(R.cartaoMB.total));
  t('mbPessoal', fmt(VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado ? VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].mastercardBlackPessoalCongelado : (R.cartaoMB.total - R.mbDetalhe.corp))); // CORRIGIDO 26/07/2026 (V177): usuario esclareceu que o ciclo fechado deve mostrar o valor CONGELADO do fechamento artificial (R$1.849,31), nao a formula viva recalculada com dados atuais.
  t('mbLRW', fmt(R.mbDetalhe.wallace));
  t('mbLRV', fmt(R.mbDetalhe.vanessa));
  t('mbLRP', fmt(R.mbDetalhe.parcelas));
  t('mbLRS', fmt(R.mbDetalhe.assinaturas));
  t('mbLRR', fmt(R.mbDetalhe.recorrencias));
  t('mbLRCON', fmt(R.mbDetalhe.consorcios));
  t('mbLRC', fmt(R.mbDetalhe.corp));

  // mercado pago
  t('mpFatura', fmt(R.mercadoPago));
  t('mpProprias', fmt(R.totalOpDetalhe.provMP));
  t('mpTransporteCorp', fmt(R.operacional.reembolsoPagaMPCorporativo));

  // titulos/totais ja centralizados (secoes 01/02/03)
  t('s01TotalOp', fmt(R.operacional.totalOperacional));
  t('totOpTotalLine', fmt(R.operacional.totalOperacional));
  t('s02TituloVisa', fmt(R.visa.totalComprometido));
  t('gVisaTotalLine', fmt(R.visa.totalComprometido));
  t('gVisaPessoalLine', fmt(R.visa.pessoal));
  // Novo 19/07/2026 (V89, pedido do usuario): Visa+MB liquido de Caixa Variavel.
  // A Caixa Variavel ja cobre 100% de LRW+LRV (REGRA_FUNCAO_CAIXA_VARIAVEL) - este card mostra
  // quanto da obrigacao dos 2 cartoes NAO esta coberto por ela (parcelas/assinaturas/recorrencias/consorcios/corp).
  const cartoesTotal = Math.round((R.cartaoInfinite.total + R.cartaoMB.total)*100)/100;
  const cartoesLiquidoCV = Math.round((cartoesTotal - R.caixaVariavel.comprometido)*100)/100;
  t('gCartoesTotalLine', fmt(cartoesTotal));
  t('gCartoesPessoalLine', fmt(R.visa.pessoal)); // mesma logica ja usada em gVisaPessoalLine - so o Visa tem corporativo, MB nao
  t('gCVComprometidoLine', '− '+fmt(R.caixaVariavel.comprometido));
  t('gCartoesLiquidoLine', fmt(cartoesLiquidoCV));
  // ADICIONADO 20/07/2026 (pedido do usuario): Comprometido (provisionado) x Disponivel real em caixa,
  // pra mostrar a diferenca (quanto falta) e de onde vem a reposicao - mesma logica ja usada no LREI0001
  // (recomposicao via salario do dia 25 ou sobra do reembolso Wartsila).
  const cvDisponivel = R.caixaVariavel.disponivel;
  const reposicaoNecessaria = cvDisponivel < 0 ? Math.round(Math.abs(cvDisponivel)*100)/100 : 0;
  t('gCVDisponivelLine', fmt(cvDisponivel));
  const elDisp = $('gCVDisponivelLine');
  if(elDisp) elDisp.style.color = cvDisponivel < 0 ? '#e2554f' : '#34c98a';
  const elRepo = $('gCVReposicaoLine');
  if(reposicaoNecessaria > 0){
    t('gCVReposicaoLine', fmt(reposicaoNecessaria));
    if(elRepo) elRepo.style.color = '#e2554f';
    t('gCVReposicaoFonte', `Fonte prevista: salário do dia 25 ou sobra do reembolso Wärtsilä (${fmt(R.operacional.reembolsoSobraPessoal)} disponível hoje) — mesmo mecanismo já usado para o LREI0001.`);
  } else {
    t('gCVReposicaoLine', 'Nenhuma');
    if(elRepo) elRepo.style.color = '#34c98a';
    t('gCVReposicaoFonte', 'Caixa Variável está dentro do previsto — sem necessidade de reposição externa agora.');
  }
  t('s03TituloPat', fmt(R.patrimonio.total));

  // alivio (Evolucao Total Operacional)
  const alivioTotal = R.operacional.totalOperacional - totalOpMar27;
  t('aliv1', '− '+fmt(alivioTotal));
  t('aliv2', '− '+fmt(alivioTotal));
  t('alivioBadgeMar27', 'Alívio '+fmt(alivioTotal)+' até Mar/27');

  // cenario historico (Cenarios secao 01/02) - formulas: saldo(salario) = salario + reembolsos - necessidadeTotalBruta
  const CH = R.cenarioHistorico;
  const saldoDe = liquido => liquido + R.operacional.reembolsoSobraPessoal - R.operacional.necessidadeTotalBruta;
  t('chMediana', CH.mediana.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('chDesvpad', CH.desvioPadrao.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('chPiorValor', fmt(CH.piorMes));
  t('chPiorSaldo', fmtSign(saldoDe(CH.piorMes)));
  t('chEquilibrio', fmt(R.operacional.necessidadeTotalBruta - R.operacional.reembolsoSobraPessoal));
  t('chMediaValor', fmt(CH.media));
  t('chMediaSaldo', fmtSign(saldoDe(CH.media)));

  // piso absoluto (O que NUNCA e cortado)
  const D = R.totalOpDetalhe;
  t('pisoBoletos', fmt(D.boletos));
  t('pisoParcelas', fmt(D.parcelas));
  t('pisoConsorcios', fmt(D.consorcios));
  t('pisoRecorrencias', fmt(D.recorrencias));
  t('pisoMP', fmt(D.provMP));
  t('pisoAssinaturas', fmt(D.assinaturas));
  t('pisoTotal', fmt(R.reserva.piso));

  // reembolsos e meta de investimento
  t('reembRecebidos', fmt(R.reembolsos.recebidosNoCiclo));
  t('reembAReceber', fmt(R.operacional.reembolsosAReceber));
  t('reembCicloTotal', fmt(R.operacional.reembolsoCicloTotal));
  t('reembPagaWartsila', fmt(R.faturaWartsila));
  t('reembPagaMP', fmt(R.operacional.reembolsoPagaMPCorporativo));
  t('reembPagaCartao', fmt(R.visaDetalhe.corp + R.mbDetalhe.corp)); // CORRIGIDO 31/07/2026 (V223): so mostrava visaDetalhe.corp (Visa), sumindo com o corporativo do MB (R$297,31 este ciclo) mesmo o card se chamando "Infinite/MB".
  t('reembSobraPessoal', fmt(R.operacional.reembolsoSobraPessoal));
  t('reembMPPessoal', fmt(R.totalOpDetalhe.provMP)); // CORRIGIDO 20/07/2026: agora e literalmente o item 4 da cascata (usado no calculo de reembolsoSobraPessoal), nao mais um campo paralelo "so informativo".
  t('metaInvTotal', fmt(R.metaInvestimento.investido));
  t('metaInvExcedente', fmt(R.metaInvestimento.excedente));
  t('metaInvMensal', fmt(R.metaInvestimento.meta));
  t('metaInvBadge', 'Total investido '+fmt(R.metaInvestimento.investido)+' · '+(R.metaInvestimento.excedente>=0?'Superada +':'Falta ')+fmt(Math.abs(R.metaInvestimento.excedente)));
  t('metaInvBTG', fmt(VARS.aporteBTGPactual + VARS.depositoAtivacaoNecton)); // CORRIGIDO 25/07/2026 (V159): usuario esclareceu que sao a mesma coisa - consolidados em 1 campo so (era duplicado, 2 linhas separadas para o mesmo conceito).

  t('cxWartsila', fmt(R.faturaWartsila));
  // CORRIGIDO 31/07/2026 (V224, bug real apontado pelo usuario): texto era LITERAL "100% coberto · excedente
  // "+valor, mesmo quando o excedente era NEGATIVO (ex: hoje, R$53,74 provisionado - R$5.768,06 de fatura =
  // -R$5.714,32, mas a tela dizia "100% coberto" do mesmo jeito - mentira). Corrigido para 2 problemas:
  // (1) so mostra "coberto" de verdade quando o reembolso do ciclo ja foi CONFIRMADO recebido
  // (REG.reembolsos.recebidosNoCiclo > 0) - antes disso e so fatura/provisionamento esperado, nao cobertura
  // real; (2) quando ha cobertura, o texto reflete o sinal certo (coberto com sobra vs faltando cobrir).
  if(R.reembolsos.recebidosNoCiclo <= 0){
    t('cxWartsilaExcedente', 'Aguardando confirmação do reembolso (ainda R$0 recebido este ciclo)');
  } else if(R.wartsilaCaixa.excedente >= 0){
    t('cxWartsilaExcedente', '100% coberto · excedente '+fmt(R.wartsilaCaixa.excedente));
  } else {
    t('cxWartsilaExcedente', 'Parcialmente coberto · faltam '+fmt(Math.abs(R.wartsilaCaixa.excedente)));
  }
  t('cxWartsilaProvisionado', 'Provisionado '+fmt(R.wartsilaCaixa.provisionado));
  t('cxSaudeAporteTxt', '2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa/ano · aporte '+fmt(VARS.aporteSaudeFamilia)+'/mês');
  { const el=$('cxSaudeSaldo'); const bar = el ? el.closest('.card').querySelector('.fill') : null; if(bar) bar.style.width = pctOf(C.saudeFamilia.saldo, C.saudeFamilia.meta)+'%'; } // V177 CORRIGIDO: barra estava fixa em 0%
  t('cxAnivAporteTxt', 'Nova · aporte '+fmt(VARS.aporteAniversarioJulio)+'/mês até 14/09');
  { const el=$('cxAnivSaldo'); const bar = el ? el.closest('.card').querySelector('.fill') : null; if(bar) bar.style.width = pctOf(C.aniversarioJulio.saldo, C.aniversarioJulio.meta)+'%'; } // V176 CORRIGIDO: barra estava fixa em 0%, nunca era preenchida pelo JS
  t('cxSeguroAporteTxt', 'Nova · aporte '+fmt(VARS.seguroEmplacamentoAporte)+'/mês (permanente)');
  { const el=$('cxSeguroSaldo'); const bar = el ? el.closest('.card').querySelector('.fill') : null; if(bar) bar.style.width = pctOf(C.seguroEmplacamento.saldo, C.seguroEmplacamento.meta)+'%'; } // V176 CORRIGIDO: mesma falha
  t('tfLRCDetalhe', R.livroLRCDetalhe.qtd+' lançamentos · Reembolso pendente '+fmt(R.livroLRCDetalhe.valor));
  t('tfPixDiversosDetalhe', 'Saídas '+fmt(R.pixDiversos.saidas)+' · Entradas '+fmt(R.pixDiversos.entradas));
  t('tfPixDiversosLiquido', 'Líquido '+(R.pixDiversos.liquido<0?'− ':'+ ')+fmt(Math.abs(R.pixDiversos.liquido)));
  // V145: secao 14 "Escola de Julio" removida do Painel Completo (pedido do usuario). ejSaldo/ejBar/ejPct/
  // ejMeta nao existem mais no HTML - card cxEscolaSaldo (secao 05, Caixas Operacionais) e balResEscola
  // (Balanco) continuam existindo e sendo hidratados normalmente, so a secao 14 dedicada foi removida.

  // V139: secoes 12/13 (Consorcio Casa Nova / Projeto Casa Nova) - antes 100% texto fixo, sem id nenhum.
  const CCN = R.consorcioCasaNova, PCN = R.projetoCasaNova;
  t('ccnCartaCredito', fmt(CCN.cartaCredito));
  t('ccnParcela', fmt(CCN.parcela));
  t('ccnPagoPct', CCN.pagoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('ccnQuitacao', fmt(CCN.quitacaoValor)+' ('+CCN.quitacaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%)');
  { const el=$('ccnBar'); if(el) el.style.width = CCN.pagoPct+'%'; }
  // NOVO 31/07/2026 (V215): data da assembleia agora dinamica, com alerta automatico se ja passou -
  // antes era texto FIXO no HTML ("21/07/2026 ja passou"), corrigido uma vez pelo usuario mas
  // continuaria travado pra sempre se nao virasse formula. Compara com a data real de hoje.
  const consorcioAssembleiaEl = $('consorcioAssembleia');
  if(consorcioAssembleiaEl){
    const [d,m,a] = VARS.consorcioCasaProximaAssembleia.split('/').map(Number);
    const dataAssembleia = new Date(a, m-1, d);
    const hoje2 = new Date();
    if(dataAssembleia < hoje2){
      consorcioAssembleiaEl.innerHTML = VARS.consorcioCasaProximaAssembleia + ' <span style="color:var(--red)">⚠️ já passou — data desatualizada, confirmar com a administradora</span>';
    } else {
      consorcioAssembleiaEl.textContent = VARS.consorcioCasaProximaAssembleia;
    }
  }
  // NOVO 31/07/2026 (V216): card de Opções reconstruído - derivado de VARS.opcoesVendidasDetalhe,
  // nunca mais tabela fixa no HTML.
  t('opcoesValorMercado', fmt(VARS.opcoesVendidasValorMercado));
  // CORRIGIDO 01/08/2026 (notas de corretagem reais): premioRecebido ja e o LIQUIDO (conferido nota
  // a nota, ver comentario em VARS.opcoesVendidasDetalhe) - o card "Total em premios recebidos"
  // sempre foi, na pratica, o total liquido. Adicionados 2 cards novos: bruto (soma premioBruto) e
  // custos (soma custoOperacional), pra mostrar a composicao completa sem duplicar nenhum desconto.
  t('opcoesPremioTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioRecebido||0),0)) + (VARS.opcoesVendidasDetalhe.some(o=>o.premioRecebido===null) ? ' (parcial, falta confirmar)' : ''));
  t('opcoesPremioBrutoTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioBruto||0),0)));
  t('opcoesCustosTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.custoOperacional||0),0)));
  // NOVO 03/08/2026 (Módulo 17 - ROC): resumo consolidado da carteira de opções, mesmo padrão dos
  // outros cards - deriva 100% de VARS.rocCarteira (calculado logo após opcoesVendidasValorMercado).
  const rc = VARS.rocCarteira;
  t('rocCapitalTravado', fmt(rc.capitalTravado));
  t('rocPremioLiquido', fmt(rc.premioLiquido));
  t('rocRentabilidade', rc.rentabilidade !== null ? (rc.rentabilidade*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—');
  t('rocRentabilidadeMensal', rc.rentabilidadeMensal !== null ? (rc.rentabilidadeMensal*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—');
  t('rocRentabilidadeAnualizada', rc.rentabilidadeAnualizada !== null ? (rc.rentabilidadeAnualizada*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—');
  t('rocComparacaoCDI', rc.comparacaoCDI !== null ? rc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'x CDI' : '—');
  t('rocDiasMedios', rc.diasMedios !== null ? rc.diasMedios+' dias' : '—');
  // NOVO 03/08/2026 (layout do ROC): badge de status do consolidado - precisa de className (não só
  // texto), então não usa o helper t(). Mesmas 4 classes .badge (bg/ba/br/bb) já usadas em outros
  // cards do painel (ex: "Não líquido" do PGBL/FGTS), cor deriva do status calculado em VARS.rocCarteira.statusROC.
  const rocBadgeEl = $('rocStatusBadge');
  if(rocBadgeEl){
    if(rc.statusROC){
      setBadge(rocBadgeEl, rc.statusROC.classe, rc.statusROC.emoji + ' ' + rc.statusROC.label);
    } else {
      setBadge(rocBadgeEl, null, '—');
    }
  }
  const legRocEl = $('legRocCarteira');
  if(legRocEl){
    // CORRIGIDO 04/08/2026 (achado do usuario): motivos separados agora - "sem strike confirmado" e
    // "vencida" sao coisas diferentes, cada um com seu proprio trecho de texto (so aparece quando o
    // contador correspondente e >0, pode aparecer os 2 juntos se um dia acontecer ao mesmo tempo).
    const motivos = [];
    if(rc.itensSemStrike > 0) motivos.push(`${rc.itensSemStrike} posição(ões) fora da soma por falta de strike confirmado`);
    if(rc.itensVencidosExcluidos > 0) motivos.push(`${rc.itensVencidosExcluidos} posição(ões) vencida(s) fora da soma (capital não está mais travado)`);
    legRocEl.textContent = `CDI mensal de referência: ${VARS.CDI_MENSAL_ATUAL.toLocaleString('pt-BR',{minimumFractionDigits:2})}% (${VARS.CDI_MENSAL_ATUAL_DATA_REF})`
      + (motivos.length > 0 ? ` · ${motivos.join(' · ')}` : '');
  }
  // NOVO 31/07/2026 (V218): aplica as 28 legendas de VARS.LEGENDAS nos elementos correspondentes -
  // um loop so, nunca precisa lembrar de chamar t() individualmente pra cada uma. Usa innerHTML
  // porque varias legendas tem <strong>/<span> internos que precisam ser preservados.
  // CORRIGIDO 01/08/2026 (achado do usuario via modo apresentacao): valores R$ embutidos no MEIO
  // do texto das legendas (ex: "teto da propria Caixa Variavel (R$2.000...)") nunca ficavam dentro
  // de um <span class="v"> - o modo esconder-valores so nublava campos dinamicos com id proprio,
  // essas legendas vazavam numero de qualquer forma. Regex envolve automaticamente qualquer
  // "R$1.234,56" (com ou sem espaco depois do R$, com ou sem sinal negativo) numa <span class="v">
  // antes de injetar - nao precisa editar as ~28 legendas uma por uma, nem lembrar de fazer isso
  // em legendas novas no futuro.
  const RE_VALOR_MONETARIO = /R\$\s?-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  Object.keys(VARS.LEGENDAS).forEach(id => {
    const el = $(id);
    if(el) el.innerHTML = VARS.LEGENDAS[id].replace(RE_VALOR_MONETARIO, m => `<span class="v">${m}</span>`);
  });
  // NOVO 31/07/2026 (V219): alivio de agosto - calculo real, ver VARS.alivioProximoMes acima.
  const legAlivioEl = $('legAlivioAgosto');
  if(legAlivioEl) legAlivioEl.innerHTML = `Alívio de <span class="v">${fmt(VARS.alivioProximoMes)}</span>/mês a partir do próximo ciclo (parcelas do Visa Infinite + Mercado Pago que terminam agora) — não considera ainda o fim do seguro auto em outubro/2026`;
  t('credUberTotal', fmt(VARS.creditoUberBalance));
  t('credShellBox', fmt(VARS.creditoShellBox));
  t('credKmv', fmt(VARS.creditoKmvIpiranga)); // CORRIGIDO 31/07/2026 (V224): usuario esclareceu que os 600 sao R$600,00 (reais), nao pontos - era concatenado como "600 pontos", corrigido pra formatar como moeda igual aos outros creditos.
  // NOVO 31/07/2026 (V217): "migrados 100% pro MB" no Visa Infinite era R$0,00 hardcoded - correto
  // HOJE, mas um numero mudo que mentiria se algo fosse lancado de volta no Visa por engano (exatamente
  // o que aconteceu com a Drogasil em V201). Agora soma os 4 componentes reais - continua R$0,00
  // porque de fato estao zerados, mas agora e verificavel, nao um texto solto.
  t('visaMigradoTotal', fmt(VARS.livroLRCONVisaOnly + VARS.visaLRRConfirmado + VARS.livroLRCVisaOnly + VARS.visaLRSConfirmado));
  // CORRIGIDO 31/07/2026 (V217): PGBL+FGTS somados estava fixo em R$209.898,34 (desatualizado desde
  // a atualizacao de ambos em 30-31/07) - agora deriva sempre dos 2 valores reais.
  t('balPgblFgtsSoma', fmt(VARS.patPgbl + VARS.patFgts));
  const opcoesTbodyEl = $('opcoesTbody');
  if(opcoesTbodyEl){
    // NOVO 01/08/2026 (pedido do usuario): integra as cotacoes reais da brapi.dev (VARS.ACOES_COTACOES,
    // atualizadas automaticamente via GitHub Actions -> Supabase, ver PASSAGEM_DE_TURNO) na tabela de
    // opcoes. Pra cada PUT vendida, mostra o preco atual da acao-objeto e se ela esta OTM (fora do
    // dinheiro - o normal, o Wallace quer que a put vire po) ou ITM (dentro do dinheiro - alerta, quem
    // vendeu a put pode ser exercido). Formula: PUT vendida fica OTM quando preco da acao > strike.
    const cotacoes = VARS.ACOES_COTACOES || {};
    // NOVO 01/08/2026 (pedido do usuario): ordena por data de vencimento, mais proxima primeiro,
    // mais distante por ultimo - ajuda a priorizar visualmente qual posicao precisa de atencao antes.
    // Datas no formato DD/MM/AAAA - convertidas pra Date so pra comparar, sem alterar o array original
    // (nao mexe em VARS.opcoesVendidasDetalhe, so na copia usada pra desenhar a tabela).
    const parseVencimento = str => { const [d,m,a] = str.split('/').map(Number); return new Date(a,m-1,d); };
    // CORRIGIDO 03/08/2026 (pedido do usuario - tabela "muito bagunçada" misturando ativas e vencidas):
    // a tabela principal da secao 17 agora mostra SO posicoes ativas (o.vencida=false, mesma fonte
    // calculada 1x em recalcularAgregadosDerivados(), nunca duplicada). Posicao vencida (ex:
    // PETRS368W5) sai da lista visual, mas o registro continua intacto em VARS.opcoesVendidasDetalhe
    // (P6 - nao apaga dado) - so nao participa mais da tabela de "posicoes ativas" nem do Valor de
    // Mercado (ver calculo acima). Contagem exposta na legenda logo abaixo da tabela, mesmo padrao
    // ja usado em legRocCarteira pra "itens fora da soma".
    // CORRIGIDO 03/08/2026 (pedido do usuario, opcao A - confirmacao manual): "Vencidas" agora so
    // mostra quem venceu SEM confirmacao de exercicio (o.exercida=false, o caso normal/"virou po").
    // Quem foi confirmado como exercida sai daqui e vai pra tabela propria abaixo (opcoesExercidas).
    const opcoesVencidas = VARS.opcoesVendidasDetalhe.filter(o => o.vencida && !o.exercida);
    const opcoesExercidas = VARS.opcoesVendidasDetalhe.filter(o => o.vencida && o.exercida);
    const opcoesOrdenadas = VARS.opcoesVendidasDetalhe.filter(o => !o.vencida).sort((a,b) => parseVencimento(a.vencimento) - parseVencimento(b.vencimento));
    opcoesTbodyEl.innerHTML = opcoesOrdenadas.map(o => {
      // CORRIGIDO 01/08/2026: antes a cor vermelha do valorMercado vinha "de graca" de um bug
      // (classe .r colidindo entre "alinhar a direita" e "cor vermelha", ver styles.css) - o Strike
      // (coluna sem relacao nenhuma com lucro/prejuizo) tambem ficava vermelho por acidente. Agora
      // cor e explicita e correta: Strike sempre neutro; Valor de Mercado vermelho se negativo,
      // verde se positivo, neutro se exatamente zero.
      const corMercado = o.valorMercado < 0 ? 'var(--red)' : (o.valorMercado > 0 ? 'var(--green)' : 'inherit');
      const cot = cotacoes[o.ativo];
      // CORRIGIDO 01/08/2026 (achado do usuario - texto sobrepondo a coluna vizinha): o site usa
      // table-layout:fixed (V238, evita estouro de texto longo) - isso significa que colunas tem
      // largura FIXA e nao se ajustam ao conteudo. white-space:nowrap numa celula com fixed layout
      // nao quebra linha, so TRANSBORDA por cima da celula vizinha (nao gera scroll nem redimensiona).
      // Solucao: em vez de forcar tudo numa linha, o preco fica numa linha e o status/percentual
      // SEMPRE numa segunda linha (bloco, nao inline) - toda linha da tabela fica com a mesma altura
      // (2 linhas), nunca vaza pra fora da propria celula, nunca quebra de forma inconsistente entre linhas.
      let linha1 = '<span style="color:var(--text-dim)">— sem cotação</span>';
      let linha2 = '';
      if(cot && o.precoExercicio !== null){
        const distanciaPct = ((cot.preco - o.precoExercicio) / o.precoExercicio) * 100;
        const otm = cot.preco > o.precoExercicio; // PUT vendida: OTM (bom, vira po) quando preco > strike
        const corStatus = otm ? 'var(--green)' : 'var(--red)';
        const statusTxt = otm ? 'OTM' : 'ITM';
        const sinalPct = distanciaPct >= 0 ? '+' : '';
        linha1 = `R$ ${cot.preco.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
        linha2 = `<span style="color:${corStatus};font-weight:600">${statusTxt}</span> <span style="color:var(--text-dim);font-size:0.68rem">(${sinalPct}${distanciaPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%)</span>`;
      } else if(cot && o.precoExercicio === null){
        linha1 = `R$ ${cot.preco.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
        linha2 = `<span style="color:var(--text-dim);font-size:0.68rem">(vencida)</span>`;
      }
      const acaoAgoraHtml = `<div>${linha1}</div><div style="min-height:1em">${linha2}</div>`;
      // CORRIGIDO 01/08/2026 (achado do usuario): coluna "Acao agora" nao estava nublando no modo
      // apresentacao - faltava a class="v" na propria celula (o conteudo e gerado por HTML, nao por
      // t(), entao nao herdava a classe automaticamente como os outros campos).
      // CORRIGIDO 01/08/2026 (notas de corretagem reais): premioRecebido JA E o liquido (conferido
      // nota a nota) - "Custos" agora mostra o valor real descontado, "Premio liquido" mostra
      // premioRecebido direto (SEM subtrair de novo, isso seria descontar os custos 2x). "Premio bruto"
      // e a nova coluna = premioBruto (valor da operacao antes dos descontos).
      const custoTxt = o.custoOperacional > 0 ? fmt(o.custoOperacional) : '<span style="color:var(--text-dim)">—</span>';
      // NOVO 03/08/2026 (Módulo 17 - ROC): coluna "Rentabilidade" - % ao mês + status semáforo + dias
      // corridos da operação, mesmo padrão 2-linhas já usado na coluna "Ação agora" (table-layout:fixed
      // não aceita nowrap sem transbordar, ver comentário acima).
      let rocLinha1 = '<span style="color:var(--text-dim)">— sem strike confirmado</span>';
      let rocLinha2 = '';
      if(o.roc && o.roc.rentabilidadeMensal !== null){
        const pctMensal = o.roc.rentabilidadeMensal * 100;
        rocLinha1 = `<span style="font-weight:600">${o.roc.statusROC.emoji} ${pctMensal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%/mês</span>`;
        rocLinha2 = `<span style="color:var(--text-dim);font-size:0.68rem">${o.roc.statusROC.label} · ${o.roc.diasOperacao}d · ${o.roc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}x CDI</span>`;
      }
      const rocHtml = `<div>${rocLinha1}</div><div style="min-height:1em">${rocLinha2}</div>`;
      return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td class="r v">${acaoAgoraHtml}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r" style="color:var(--green);font-weight:600">${o.premioRecebido===null ? '<span style="color:var(--text-dim);font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r" style="color:${corMercado}">${fmt(o.valorMercado)}</td><td class="r v">${rocHtml}</td></tr>`;
    }).join('');
    // Legenda com o horário da última atualização das cotações (transparência sobre a idade do dado)
    const legCotacoesEl = $('legOpcoesCotacoes');
    if(legCotacoesEl){
      if(VARS.ACOES_COTACOES_ATUALIZADO_EM){
        const dt = new Date(VARS.ACOES_COTACOES_ATUALIZADO_EM);
        legCotacoesEl.textContent = `Cotações via brapi.dev, atualizadas automaticamente às 15h em dias úteis · última atualização: ${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · OTM = fora do dinheiro (put vira pó, bom pro vendedor) · ITM = dentro do dinheiro (risco de exercício)`;
      } else {
        legCotacoesEl.textContent = 'OTM = fora do dinheiro (put vira pó, bom pro vendedor) · ITM = dentro do dinheiro (risco de exercício)';
      }
    }
    // CORRIGIDO 03/08/2026 (pedido do usuario - "a operação que venceu se move automaticamente pra
    // uma linha abaixo só de vencidas"): antes a posição vencida só era citada em texto solto
    // (legOpcoesVencidas). Agora ganha uma tabela própria (opcoesVencidasTbody), esmaecida, logo
    // abaixo da tabela ativa - mesma fonte (VARS.opcoesVendidasDetalhe, filtro o.vencida), nunca uma
    // segunda cópia escrita a mão. Ordenada por vencimento também (mais recente primeiro, já que são
    // todas passadas - a mais perto de hoje é a mais relevante pra conferir).
    const opcoesVencidasOrdenadas = [...opcoesVencidas].sort((a,b) => parseVencimento(b.vencimento) - parseVencimento(a.vencimento));
    const vencidasWrapEl = $('opcoesVencidasWrap');
    const vencidasTbodyEl = $('opcoesVencidasTbody');
    if(vencidasWrapEl && vencidasTbodyEl){
      vencidasWrapEl.style.display = opcoesVencidasOrdenadas.length > 0 ? '' : 'none';
      vencidasTbodyEl.innerHTML = opcoesVencidasOrdenadas.map(o => {
        const custoTxt = o.custoOperacional > 0 ? fmt(o.custoOperacional) : '<span style="color:var(--text-dim)">—</span>';
        // NOVO 03/08/2026 (pedido do usuario): mesma coluna de status ROC (semáforo + %/mês + dias +
        // xCDI) já usada na tabela de posições ativas - reaproveita o mesmo o.roc calculado 1x em
        // calcularROCOpcoes() (nunca recalculado aqui), então mostra "Fraca/Boa/Muito Boa/Excelente"
        // mesmo pra uma posição encerrada, deixando claro se aquela operação já fechada valeu a pena.
        let rocLinha1v = '<span style="color:var(--text-dim)">— sem strike confirmado</span>';
        let rocLinha2v = '';
        if(o.roc && o.roc.rentabilidadeMensal !== null){
          const pctMensalV = o.roc.rentabilidadeMensal * 100;
          rocLinha1v = `<span style="font-weight:600">${o.roc.statusROC.emoji} ${pctMensalV.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%/mês</span>`;
          rocLinha2v = `<span style="font-size:0.68rem">${o.roc.statusROC.label} · ${o.roc.diasOperacao}d · ${o.roc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}x CDI</span>`;
        }
        const rocHtmlV = `<div>${rocLinha1v}</div><div style="min-height:1em">${rocLinha2v}</div>`;
        return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td class="r">${o.vencimento}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r">${o.premioRecebido===null ? '<span style="font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r v">${rocHtmlV}</td></tr>`;
      }).join('');
    }
    // NOVO 03/08/2026 (pedido do usuario): avisa por que a posicao vencida saiu da tabela ativa e do
    // Valor de mercado, sem esconder o fato de que ela existe/existiu - documentado, nao omitido (P1).
    // Texto encurtado agora que a tabela acima já mostra ticker/strike/prêmios - não precisa repetir.
    const legVencidasEl = $('legOpcoesVencidas');
    if(legVencidasEl){
      legVencidasEl.textContent = opcoesVencidasOrdenadas.length > 0
        ? `Fora da tabela de posições ativas e do Valor de mercado; resultado final de cada uma registrado em "resultadoHistorico".`
        : '';
    }

    // NOVO 03/08/2026 (pedido do usuario, opcao A): tabela "Posições exercidas" - mesmo padrao exato
    // da tabela de Vencidas acima (mesma fonte, mesmas colunas, mesmo ROC reaproveitado), so trocando
    // o filtro pra o.exercida=true. Confirmacao de exercicio e sempre manual (ver comentario no campo
    // o.exercida, na origem do array) - o "automatico" aqui e so o MOVIMENTO da linha, nao a deteccao.
    const opcoesExercidasOrdenadas = [...opcoesExercidas].sort((a,b) => parseVencimento(b.vencimento) - parseVencimento(a.vencimento));
    const exercidasWrapEl = $('opcoesExercidasWrap');
    const exercidasTbodyEl = $('opcoesExercidasTbody');
    if(exercidasWrapEl && exercidasTbodyEl){
      exercidasWrapEl.style.display = opcoesExercidasOrdenadas.length > 0 ? '' : 'none';
      exercidasTbodyEl.innerHTML = opcoesExercidasOrdenadas.map(o => {
        const custoTxt = o.custoOperacional > 0 ? fmt(o.custoOperacional) : '<span style="color:var(--text-dim)">—</span>';
        let rocLinha1e = '<span style="color:var(--text-dim)">— sem strike confirmado</span>';
        let rocLinha2e = '';
        if(o.roc && o.roc.rentabilidadeMensal !== null){
          const pctMensalE = o.roc.rentabilidadeMensal * 100;
          rocLinha1e = `<span style="font-weight:600">${o.roc.statusROC.emoji} ${pctMensalE.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%/mês</span>`;
          rocLinha2e = `<span style="font-size:0.68rem">${o.roc.statusROC.label} · ${o.roc.diasOperacao}d · ${o.roc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}x CDI</span>`;
        }
        const rocHtmlE = `<div>${rocLinha1e}</div><div style="min-height:1em">${rocLinha2e}</div>`;
        return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td class="r">${o.vencimento}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r">${o.premioRecebido===null ? '<span style="font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r v">${rocHtmlE}</td></tr>`;
      }).join('');
    }
    const legExercidasEl = $('legOpcoesExercidas');
    if(legExercidasEl){
      legExercidasEl.textContent = opcoesExercidasOrdenadas.length > 0
        ? `Exercício confirmado manualmente via nota de corretagem — capital travado já saiu da soma do ROC desde o vencimento (mesma regra de qualquer posição vencida).`
        : '';
    }
  }
  t('pcnCapital', fmt(PCN.capitalDisponivel));
  t('pcnPctBadge', PCN.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=$('pcnBar'); if(el) el.style.width = PCN.pct+'%'; }
  t('pcnMeta', 'Meta lance '+fmt(PCN.metaLance));
  t('pcnFalta', 'Falta '+fmt(PCN.falta));

  // V139: badges do Resumo Executivo - antes texto fixo duplicando numeros ja calculados em outro lugar
  t('r21ProjetoCasa', PCN.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('r21ConsorcioCasa', CCN.pagoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('r21EscolaJulio', pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  t('r21MetaInvest', fmt(R.metaInvestimento.investido)+' investido · '+(R.metaInvestimento.excedente>=0?'Superada +':'Falta ')+fmt(Math.abs(R.metaInvestimento.excedente)));

  t('snCicloAtual', '+ '+fmt(liquidoMes(0) - R.superavitNormal.necessidade[0]));

  t('csNecTotal', R.operacional.necessidadeTotalBruta.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('csReembolsos', R.operacional.reembolsoSobraPessoal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));

  // ===== Balanço Patrimonial (Reestruturação V2.0, 16/07/2026) =====
  const B = R.balanco;
  t('balFisicoTotal', fmt(B.fisico.total));
  t('bfCasa', fmt(B.fisico.casa));
  t('bfApartamento', fmt(B.fisico.apartamento));
  t('bfJazigo', fmt(B.fisico.jazigo));
  t('bfSolar', fmt(B.fisico.solar));
  t('bfCarro', fmt(B.fisico.carro));
  t('balFinanceiroTotal', fmt(B.financeiro.total));
  t('bfinReserva', fmt(B.financeiro.reserva));
  t('bfinBTG', fmt(B.financeiro.btg));
  t('bfinConsorcioCasa', fmt(B.financeiro.consorcioCasaPago));
  t('bfinNectonCC', fmt(B.financeiro.nectonContaCorrente));
  t('bpFinanciamentoCasa', fmt(B.passivos.financiamentoCasa));
  t('bpConsorcioAuto', fmt(B.passivos.consorcioAutoContemplado));
  t('balPgbl', fmt(B.pgbl));
  t('balFgts', fmt(B.fgts));
  t('balPassivosTotal', fmt(B.passivos.total));
  t('balAtivosTotal', fmt(B.ativosTotal));
  t('balPassivosTotal2', fmt(B.passivos.total));
  t('balPatrimonioLiquido', fmt(B.patrimonioLiquido));
  // NOVO 04/08/2026 (parte 78): render do card PIB Wallace, secao 23.
  { const P = REG.pibWallace;
    if(P){
      t('pibSalario', fmt(P.salarioLiquido));
      t('pibReembolsos', fmt(P.reembolsos));
      t('pibRendimentos', fmt(P.rendimentos));
      t('pibValorizacao', fmt(P.valorizacaoInvestimentos));
      t('pibConsumoNaoRecorrente', '-'+fmt(P.consumoNaoRecorrente));
      t('pibTotal', fmt(P.total));
    }
  }
  t('balResBoletos', fmt(B.operacional.caixaBoletos)); // V85: movida de reservas pra operacional
  t('balOpMastercardInfinite', fmt(B.operacional.mastercardInfinite)); // V139: nova caixa (24/07/2026), guarda valor a pagar dos 2 cartoes ate 28/07
  { // NOVO 01/08/2026 (V245, usuario apontou "nao tem nada" nessa caixa - nao havia detalhamento
    // visivel de onde o numero vinha, mesmo a formula ja sendo automatica). Gera o extrato curto a
    // partir do proprio array MASTERCARD_INFINITE_TRANSACOES, nunca escrito a mao.
    const detEl = $('balOpMastercardInfiniteDetalhe');
    if(detEl){
      const partes = [fmt(VARS.MASTERCARD_INFINITE_SALDO_INICIAL)+' inicial'].concat(
        VARS.MASTERCARD_INFINITE_TRANSACOES.map(t=>(t.tipo==='Entrada'?'+':'−')+fmt(t.valor)+' ('+t.nome+')')
      );
      detEl.textContent = partes.join(' ') + ' = ' + fmt(VARS.caixaMastercardInfinite);
    }
  }
  t('balResEscola', fmt(B.reservas.escolaJulio));
  t('balResLance', fmt(B.reservas.caixaLance));
  t('balResManut', fmt(B.reservas.manutencao));
  t('balResEventos', fmt(B.reservas.eventos));
  t('balResChurrasco', fmt(B.reservas.churrasco));
  t('balResSaude', fmt(B.reservas.saudeFamilia));
  t('balResSeguro', fmt(B.reservas.seguroEmplacamento));
  t('balResAniv', fmt(B.reservas.aniversarioJulio));
  t('balReservasTotal', fmt(B.reservas.total));
  t('balOpCaixaVariavel', fmt(B.operacional.caixaVariavel));
  t('balOpPixVanessa', fmt(B.operacional.pixVanessaSaldoReal));
  t('balOperacionalTotal', fmt(B.operacional.total));
  t('balObrVisa', fmt(B.obrigacoes.visa));
  t('balObrMB', fmt(B.obrigacoes.mastercardBlack));
  t('balObrMP', fmt(B.obrigacoes.mercadoPago));
  t('balObrWartsila', fmt(VARS.faturaMPCorporativoPendente)); // CORRIGIDO V167: mostra os 3 corporativos AINDA na fatura pendente (venc. 04/08), ja descontados do total acima
  // CORRIGIDO 30/07/2026 (V208): balLreiAtivos era texto FIXO "Nenhum (LREI0001 quitado 21/07)" -
  // mesmo depois de LREI0002+LREI0003 ficarem ativas (27/07), esse card resumo do Balanço nunca foi
  // conectado ao array real (a aba LREI dedicada ja tinha sido corrigida em V189, mas ESTE card,
  // separado, ficou esquecido - mesma classe de bug, lugar diferente). Usuario apontou via print.
  const lreiAtivosNow = VARS.LREI_ATIVAS.filter(l=>l.status==='ATIVO');
  const balLreiEl = $('balLreiAtivos');
  if(balLreiEl){
    if(lreiAtivosNow.length === 0){
      balLreiEl.textContent = 'Nenhum';
    } else {
      balLreiEl.textContent = lreiAtivosNow.length + ' ativo(s): ' + lreiAtivosNow.map(l=>l.id+' ('+fmt(l.valor)+')').join(', ');
    }
  }
  t('balObrTotal', fmt(B.obrigacoes.total));
  t('balFluxoEntradas', fmt(B.fluxo.entradas));
  t('balFluxoSaidas', fmt(B.fluxo.saidas));
  t('balFluxoResultado', fmt(B.fluxo.resultado));
  t('bal4qModo', R.operacional.modoOperacional);
  t('bal4qTotalOp', fmt(R.operacional.totalOperacional));
  t('bal4qPatrimonio', fmt(B.patrimonioLiquido));
  t('bal4qExcedente', fmt(B.fluxo.resultado));
  t('patPrevidencia', fmt(B.pgbl));
  t('patFgts', fmt(B.fgts));
}
onDomPronto(hydrate); // V170: corrigido - antes nunca rodava (script injetado dinamicamente, DOMContentLoaded ja tinha disparado)
onDomPronto(initBuscaGlobal); // V300 (Etapa 6): so liga o listener do input, nao depende de hydrate/dados
onDomPronto(popularSeletorCiclo); // V145/V170: cria os botoes do seletor de ciclo
onDomPronto(renderParcelamentos); // V155/V170: gera as tabelas de parcelamento (LRP/LRMP) a partir dos arrays estruturados
onDomPronto(renderLivrosVariaveis); // V168/V170: gera as tabelas LRW/LRV/LRC-limbo/LRCV a partir dos arrays estruturados
onDomPronto(renderCapaNav); // parte 41: monta os cards de navegacao da Capa/Dashboard
onDomPronto(toggleBtnVoltarCapa); // parte 41: estado inicial do botao flutuante (escondido no topo)
onDomPronto(()=>renderPageStrip('painel')); // parte 42: estado inicial da faixa "onde estou" (painel e o pane ativo por padrao no HTML)
window.addEventListener('scroll', toggleBtnVoltarCapa, {passive:true}); // parte 41: mostra/esconde ao rolar
onDomPronto(renderInboxFinanceira); // V400 Etapa 1: gera a tabela da Inbox Financeira (continua, nao filtrada por ciclo)
// V400 Etapas 2/3: rodam apos renderInboxFinanceira (mesma tabela que elas alimentam via inboxAdicionarItem).
// Ate hoje (03/08/2026) essas 2 funcoes so tinham sido testadas em harness Node isolado, nunca ligadas
// ao carregamento real da pagina - VARS.PLUGGY_CONTAS ja chega pronto antes daqui (aplicado de
// window.WALLACE_DADOS_REMOTOS no topo do arquivo), entao e seguro rodar no mesmo onDomPronto.
onDomPronto(reconciliarPluggy);
onDomPronto(reconciliarTransacoesPluggy);
onDomPronto(sincronizarMercadoPagoParaInbox); // V450 Etapas 4+5+6: FinancialEvent -> Inbox (com classificacao e checagem de duplicidade)
onDomPronto(classificarInboxPendentes); // V400 Etapa 10: roda por último, classifica o que as etapas acima adicionaram nesta mesma carga
onDomPronto(renderMercadoPagoDashboard); // V450 Etapa 9: so leitura/exibicao, roda depois da Inbox estar populada
onDomPronto(atualizarContadoresAbasLR); // V162/V170: conta linhas reais das abas de Livros Razao
// onDomPronto(aplicarFiltroLivrosRazao) movido para depois de LIVROS_FILTRAVEIS_POR_CICLO ser declarada (ver abaixo, V170)

// ===== Auditoria automatica (item 15 do Plano Mestre, criada 17/07/2026 V54) =====
// Roda sozinha ao carregar a pagina. Como o REG e um snapshot agregado (nao guarda TX individuais
// no cliente - isso mora no ERP/Excel), esta auditoria confere a MATEMATICA INTERNA do REG: se os
// totais batem com a soma das suas partes. Nao substitui a auditoria do ERP (que tem granularidade
// de transacao), e uma segunda camada de seguranca no lado do site. Loga no console; se achar
// divergencia, mostra um aviso discreto no rodape (nao intrusivo, nao trava a pagina).
function auditoriaAutomatica(){
  const problemas = [];
  const round2 = v => Math.round(v*100)/100;
  const bate = (a,b,tol=0.02) => Math.abs(a-b) <= tol;

  // 1) Visa Infinite + Mastercard Black = total combinado
  const somaCartoes = round2(REG.cartaoInfinite.total + REG.cartaoMB.total);
  if(!bate(somaCartoes, REG.visa.totalComprometido)){
    problemas.push(`Cartões: Infinite(${REG.cartaoInfinite.total})+MB(${REG.cartaoMB.total})=${somaCartoes} ≠ visa.totalComprometido(${REG.visa.totalComprometido})`);
  }

  // 2) Balanço: Ativos = Físico + Financeiro
  const somaAtivos = round2(REG.balanco.fisico.total + REG.balanco.financeiro.total);
  if(!bate(somaAtivos, REG.balanco.ativosTotal)){
    problemas.push(`Balanço Ativos: Físico+Financeiro=${somaAtivos} ≠ ativosTotal(${REG.balanco.ativosTotal})`);
  }

  // 3) Balanço: Patrimônio Líquido = Ativos - Passivos
  const liquidoCalc = round2(REG.balanco.ativosTotal - REG.balanco.passivos.total);
  if(!bate(liquidoCalc, REG.balanco.patrimonioLiquido)){
    problemas.push(`Patrimônio Líquido: Ativos-Passivos=${liquidoCalc} ≠ patrimonioLiquido(${REG.balanco.patrimonioLiquido})`);
  }

  // 4) Reembolso: cascata bate com o total do ciclo
  // V135: CORRIGIDO numero magico 483.43 (valor antigo do LRC) -> REG.operacional.reembolsoPagaCartaoCorporativo
  // (483.83, extrato real reconciliado V121). O numero fixo aqui causava FALSO-POSITIVO nesta propria
  // auditoria (acusava divergencia de R$0,40 que na verdade nao existia - o proprio checador tinha
  // uma 2a copia desatualizada do valor).
  const cascataTotal = round2(REG.operacional.reembolsoPagaWartsila + REG.operacional.reembolsoPagaMPCorporativo + REG.operacional.reembolsoPagaCartaoCorporativo + REG.totalOpDetalhe.provMP + REG.operacional.reembolsoSobraPessoal);
  if(!bate(cascataTotal, REG.operacional.reembolsoCicloTotal)){
    problemas.push(`Cascata reembolso: soma das 5 pernas=${cascataTotal} ≠ reembolsoCicloTotal(${REG.operacional.reembolsoCicloTotal})`);
  }

  // 5) Caixa Variável: Disponível = Saldo Real - Comprometido
  const dispCalc = round2(REG.caixaVariavel.saldoReal - REG.caixaVariavel.comprometido);
  if(!bate(dispCalc, REG.caixaVariavel.disponivel)){
    problemas.push(`Caixa Variável: SaldoReal-Comprometido=${dispCalc} ≠ disponivel(${REG.caixaVariavel.disponivel})`);
  }

  // 6) Reservas de Pagamento (Balanço) = Caixa Variável + Caixa Boletos + Mastercard/Infinite
  // CORRIGIDO 26/07/2026 (V166): PIX Vanessa (conta autonoma dela) removida - nunca deveria contar.
  const opCalc = round2(REG.balanco.operacional.caixaVariavel + REG.balanco.operacional.caixaBoletos + REG.balanco.operacional.mastercardInfinite);
  if(!bate(opCalc, REG.balanco.operacional.total)){
    problemas.push(`Reservas de Pagamento: CaixaVariavel+CaixaBoletos+MastercardInfinite=${opCalc} ≠ total(${REG.balanco.operacional.total})`);
  }

  // 7) Reservas (Balanço) = soma das 9 caixas de reserva
  const r = REG.balanco.reservas;
  const resCalc = round2(r.boletos+r.escolaJulio+r.caixaLance+r.manutencao+r.eventos+r.churrasco+r.saudeFamilia+r.seguroEmplacamento+r.aniversarioJulio);
  if(!bate(resCalc, r.total)){
    problemas.push(`Reservas: soma das 9 caixas=${resCalc} ≠ total(${r.total})`);
  }

  // 8) Patrimônio Financeiro = Reserva + BTG/Necton + Caixa Lance + Necton Conta Corrente (ADICIONADO 20/07/2026, pedido do usuário)
  const pd = REG.patrimonioDetalhe;
  const patCalc = round2(pd.reserva + pd.btg + pd.caixaLance + pd.nectonContaCorrente);
  if(!bate(patCalc, REG.patrimonio.total)){
    problemas.push(`Patrimônio Financeiro: Reserva+BTG+CaixaLance+NectonCC=${patCalc} ≠ patrimonio.total(${REG.patrimonio.total})`);
  }

  // 9) Meta do Milhão = Patrimônio / R$1.000.000 (ADICIONADO 20/07/2026, pedido do usuário)
  const metaCalc = round2(REG.patrimonio.total / REG.patrimonio.metaMilhao * 100);
  if(!bate(metaCalc, REG.patrimonio.metaMilhaoPct, 0.01)){
    problemas.push(`Meta do Milhão: patrimonio.total/1.000.000=${metaCalc}% ≠ metaMilhaoPct(${REG.patrimonio.metaMilhaoPct}%)`);
  }

  // 10) Total Operacional = soma dos 7 componentes do totalOpDetalhe (ADICIONADO 20/07/2026, pedido do usuário -
  // hoje isso NUNCA diverge de verdade porque recalcularAgregadosDerivados() já deriva um do outro, mas o check
  // fica como rede de segurança caso algum dos dois seja editado manualmente sem tocar no outro no futuro)
  // V177: SO roda para o ciclo ATUAL - no ciclo fechado, totalOperacional vem de um valor CONGELADO no
  // snapshot (nao da soma dos componentes vivos), entao a divergencia e esperada por design, nao erro.
  if(!VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado){
    const D2 = REG.totalOpDetalhe;
    const totOpCalc = round2(D2.boletos+D2.parcelas+D2.consorcios+D2.recorrencias+D2.aportesPat+D2.provMP+D2.assinaturas);
    if(!bate(totOpCalc, REG.operacional.totalOperacional)){
      problemas.push(`Total Operacional: soma dos 7 componentes=${totOpCalc} ≠ operacional.totalOperacional(${REG.operacional.totalOperacional})`);
    }
  }

  // 11) Visa Infinite: soma do detalhamento (visaDetalhe, usado nos graficos de composicao) = total do card
  // (ADICIONADO 22/07/2026, V135 - esta checagem NAO existia; foi exatamente por isso que o gap de
  // R$49,81 entre o grafico cVisa e o card "Total" ficou sem deteccao automatica por varios ciclos)
  // V174: SO roda para o ciclo ATUAL - o ciclo fechado guarda so um RESUMO agregado (nao o detalhamento
  // fino por categoria), entao a soma das partes nunca vai bater com o total do ciclo fechado por design,
  // nao por erro. Comparar isso seria um falso-positivo constante.
  if(!VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado){
    const vd = REG.visaDetalhe;
    const visaDetalheCalc = round2(vd.parcelas+vd.consorcios+vd.wallace+vd.recorrencias+vd.corp+vd.assinaturas+vd.vanessa+vd.naoReconciliado);
    if(!bate(visaDetalheCalc, REG.cartaoInfinite.total)){
      problemas.push(`Visa Infinite: soma visaDetalhe=${visaDetalheCalc} ≠ cartaoInfinite.total(${REG.cartaoInfinite.total})`);
    }

    // 12) Mastercard Black: soma do detalhamento (mbDetalhe) = total do card (ADICIONADO 22/07/2026, V135 -
    // mesma classe de checagem que faltava; foi por isso que mbDetalhe.wallace ficou 3 rodadas desatualizado
    // sem ninguem perceber - nada comparava a soma das partes com o total)
    const md = REG.mbDetalhe;
    const mbDetalheCalc = round2(md.parcelas+md.consorcios+md.wallace+md.recorrencias+md.corp+md.assinaturas+md.vanessa);
    if(!bate(mbDetalheCalc, REG.cartaoMB.total)){
      problemas.push(`Mastercard Black: soma mbDetalhe=${mbDetalheCalc} ≠ cartaoMB.total(${REG.cartaoMB.total})`);
    }
  }

  const healthBadge = $('healthBadge');

  if(problemas.length === 0){
    console.log('%c✅ Auditoria automática: 0 divergências encontradas na matemática do REG.', 'color:#34c98a;font-weight:600');
    if(healthBadge){
      healthBadge.textContent = '✅ Sistema íntegro';
      healthBadge.style.color = '#34c98a';
      healthBadge.title = 'Auditoria automática: 0 divergências nas 12 relações matemáticas do REG.';
    }
  } else {
    console.warn('⚠️ Auditoria automática encontrou divergências:');
    problemas.forEach(p => console.warn('  - ' + p));
    if(healthBadge){
      healthBadge.textContent = `⚠️ ${problemas.length} divergência(s) — ver console`;
      healthBadge.style.color = '#e2554f';
      healthBadge.title = problemas.join('\n');
    }
    const footer = document.querySelector('footer');
    if(footer){
      const aviso = document.createElement('span');
      aviso.style.color = '#e2554f';
      aviso.style.fontWeight = '600';
      aviso.textContent = `⚠️ ${problemas.length} divergência(s) SSOT — ver console`;
      footer.appendChild(aviso);
    }
  }
  return problemas;
}
onDomPronto(auditoriaAutomatica); // V170: corrigido

// ===== Ciclo financeiro 100% dinâmico (recalcula sempre que o arquivo é aberto, qualquer mês/ano) =====
// Regra do sistema: ciclo vai do dia 25 de um mês ao dia 24 do mês seguinte.
(function(){
  const hoje = new Date();
  const diaMs = 86400000;

  // Se hoje é dia >= 25, o ciclo começou dia 25 deste mês e termina dia 24 do mês seguinte.
  // Se hoje é dia < 25, o ciclo começou dia 25 do mês anterior e termina dia 24 deste mês.
  let inicio, fim;
  if (hoje.getDate() >= 25) {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 24);
  } else {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth()-1, 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 24);
  }

  const totalDias = Math.round((fim-inicio)/diaMs);
  const hojeSoData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let decorridos = Math.round((hojeSoData-inicio)/diaMs);
  decorridos = Math.max(0, Math.min(decorridos, totalDias));
  const restantes = totalDias - decorridos;
  const pct = Math.round(decorridos/totalDias*100);
  const fmtData = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  const fmtCurta = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
  const set = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };

  // Disponivel/dia = REG.caixaVariavel.disponivel (SSOT unico) / dias restantes do ciclo (inclui hoje).
  // CORRIGIDO 22/07/2026 (V128, usuario apontou): quando o disponivel ja e negativo, dividir por dia
  // nao faz sentido nenhum - nao ha "quanto gastar por dia" quando ja nao ha o que gastar. Mostra 0
  // nesse caso, com uma nota separada de quanto falta cobrir (ver simulador abaixo).
  const diasParaDivisao = Math.max(1, restantes);
  const dispDiaReal = REG.caixaVariavel.disponivel > 0 ? REG.caixaVariavel.disponivel / diasParaDivisao : 0;

  // ===== Aging LREI (18/07/2026, V73): dias em aberto de cada emprestimo interno, calculado ao vivo
  // a cada carregamento - nunca mais hardcoded (o ERP ja tinha IDADE_DIAS/STATUS_ENVELHECIMENTO mas
  // ficava parado entre sessoes). Faixas: 0-30 NORMAL, 31-60 ATENCAO, 61+ CRITICO (P4 - toda divida
  // interna deve ser ressarcida, quanto mais velha, maior o risco de ficar esquecida).
  // CORRIGIDO 27/07/2026 (V189): antes era array hardcoded vazio, mesmo com VARS.LREI_ATIVAS já
  // tendo 2 dívidas reais (LREI0002+LREI0003) - o alerta de negócio nunca via essas dívidas porque
  // lia desta lista separada, nunca conectada ao VARS. Bug apontado pelo usuário via print do painel.
  const lreiAtivos = VARS.LREI_ATIVAS.map(l=>{
    const [d,m] = l.data.split('/').map(Number);
    return { abertura: new Date(hoje.getFullYear(), m-1, d) };
  });
  const diasAging = d => Math.round((hoje - d) / 86400000);
  const faixaAging = dias => dias <= 30 ? '' : (dias <= 60 ? ' color:var(--accent)' : ' color:var(--red);font-weight:700');

  // ===== Simulador Fim de Ciclo (18/07/2026, V79 - inovacao pedida pelo usuario): quanto ainda da
  // pra gastar na Caixa Variavel ate o fim do ciclo, considerando o teto oficial + tolerancia
  // temporaria (se ativa). Nao mexe em nenhum outro indicador - e so uma leitura combinada do que
  // ja existe em REG.caixaVariavel, calculada ao vivo (nunca hardcoded).
  const cv = REG.caixaVariavel;
  const tetoEfetivo = cv.tetoOficial + (cv.tolerenciaTemp||0);
  const folego = Math.round((tetoEfetivo - cv.comprometido)*100)/100;
  const folegoPorDia = restantes > 0 ? folego/restantes : folego;
  // NOVO 22/07/2026 (V128, pedido do usuario): o "Fôlego" (teto - comprometido) confunde porque parece
  // que falta cobrir o valor do estouro do TETO (ex: R$423), quando na real falta so a diferenca entre
  // o que TEM na caixa (saldoReal) e o que ESTA COMPROMETIDO (comprometido) - um numero bem menor.
  // Mostra os 2 lados explicitamente: quanto tem, quanto falta.
  const faltaCobrir = Math.round((cv.comprometido - cv.saldoReal)*100)/100; // positivo = falta, negativo/zero = tem sobra

  // ===== Verificacoes de Negocio (18/07/2026, V79 - "linter" enxuto): nao varre transacao por
  // transacao (REG so guarda agregados por design - ver nota em REG.qualidade), so expoe os
  // contadores/flags que ja sao mantidos manualmente no ERP a cada sessao.
  function montarAlertasNegocio(){
    const q = REG.qualidade;
    const alertas = [];
    alertas.push(q.txSemData === 0
      ? {icone:'✅', cor:'#34c98a', txto:'0 transações sem data rastreável'}
      : {icone:'⚠️', cor:'#e2554f', txto:`${q.txSemData} transaç${q.txSemData===1?'ão':'ões'} sem data — checar aba LRP/registro`});
    const maxIdade = lreiAtivos.length ? Math.max(...lreiAtivos.map(l=>diasAging(l.abertura))) : 0;
    if(q.lreiAtivos === 0){
      alertas.push({icone:'✅', cor:'#34c98a', txto:'Nenhum empréstimo interno (LREI) em aberto'});
    } else {
      const nivel = maxIdade<=30 ? {icone:'ℹ️',cor:'#3987e5'} : maxIdade<=60 ? {icone:'⚠️',cor:'#e8a63a'} : {icone:'🔴',cor:'#e2554f'};
      alertas.push({icone:nivel.icone, cor:nivel.cor, txto:`${q.lreiAtivos} empréstimo(s) interno(s) ativo(s) — mais antigo com ${maxIdade} dias`});
    }
    // CORRIGIDO 19/07/2026: condicao e valor exibido usavam cv.disponivel (Saldo Real - Comprometido, o ECC),
    // uma variavel errada para "quanto passou do teto oficial". O teto oficial e comparado contra o COMPROMETIDO
    // (secao 13 da Politica), nunca contra o disponivel. Valor certo = comprometido - tetoOficial.
    const excedente = Math.round((cv.comprometido - cv.tetoOficial)*100)/100;
    alertas.push(excedente <= 0
      ? {icone:'✅', cor:'#34c98a', txto:'Caixa Variável dentro do teto oficial'}
      : {icone: folego>=0 ? '⚠️' : '🔴', cor: folego>=0 ? '#e8a63a' : '#e2554f',
         txto: folego>=0
           ? `Caixa Variável acima do teto oficial (${fmt(excedente)}), coberta pela tolerância temporária — restam ${fmt(folego)} até o teto de ${fmt(tetoEfetivo)}`
           : `Caixa Variável estourou inclusive a tolerância temporária em ${fmt(Math.abs(folego))}`});
    if(q.tetoTemporarioAtivo && cv.tolerenciaTemp > 0){
      // V145 CORRIGIDO: texto era hardcoded "ate 24/07 - salario de 25/07" (datas do ciclo antigo).
      // So aparece quando ha tolerancia ativa DE VERDADE (usuario declarou uma nova) - por padrao,
      // ciclo novo comeca SEM tolerancia (VARS.tolerenciaTemp=0), entao este alerta fica mudo.
      alertas.push({icone:'ℹ️', cor:'#3987e5', txto:`Tolerância temporária de ${fmt(cv.tolerenciaTemp)} ativa neste ciclo — recomposição a combinar`});
    }
    // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO): como o site e estatico (Claude mantem manualmente,
    // nao ha automacao real de virada de ciclo), este alerta funciona como lembrete ativo - se houver
    // valor represado E o ciclo ja virou (dia >= 25), sinaliza que a rolagem manual (debitar do proximo
    // aporte + zerar o registrador) ainda precisa ser feita na proxima sessao.
    const pendenteLimbo = cv.pendenteProximoCiclo || 0;
    if(pendenteLimbo > 0){
      const diaHoje = new Date().getDate();
      if(diaHoje >= 25){
        alertas.push({icone:'🔴', cor:'#e2554f', txto:`Ciclo virou com ${fmt(pendenteLimbo)} represado do limbo MB — rolar manualmente para o aporte/saldo do novo ciclo e zerar CAIXA_VARIAVEL_PENDENTE_PROXIMO_CICLO`});
      } else {
        alertas.push({icone:'ℹ️', cor:'#3987e5', txto:`${fmt(pendenteLimbo)} represado do limbo Mastercard Black (fecha dia 22) — será descontado do orçamento da Caixa Variável do próximo ciclo na virada do dia 25`});
      }
    }
    // NOVO 29/07/2026 (V204, pedido explicito do usuario): alerta de aporte da PGV. Regra da Politica
    // secao 7: quando o saldo da PIX Geral Vanessa (PGV, conta autonoma dela) cai abaixo de R$50,00,
    // transferir R$300,00 da PIX Vanessa (PV, reserva do Wallace - a caixa DE ONDE o dinheiro sai).
    // Alerta em 3 niveis para o usuario ver ANTES de zerar, nao so depois.
    const saldoPGV = VARS.pixGeralVanessaSaldo;
    const saldoPV = VARS.caixaPixVanessa;
    const GATILHO_APORTE_PGV = 50.00;
    const VALOR_APORTE_PGV = 300.00;
    if(saldoPGV < GATILHO_APORTE_PGV){
      const temNaPV = saldoPV >= VALOR_APORTE_PGV;
      alertas.push({icone:'🔴', cor:'#e2554f',
        txto:`PIX Geral Vanessa em ${fmt(saldoPGV)} — abaixo do gatilho de ${fmt(GATILHO_APORTE_PGV)}. Transferir ${fmt(VALOR_APORTE_PGV)} da PIX Vanessa (tem ${fmt(saldoPV)})${temNaPV ? '' : ' ⚠️ SALDO INSUFICIENTE NA PV'}`});
    } else if(saldoPGV < GATILHO_APORTE_PGV * 2){
      alertas.push({icone:'⚠️', cor:'#e8a63a',
        txto:`PIX Geral Vanessa em ${fmt(saldoPGV)} — aproximando do gatilho de aporte (${fmt(GATILHO_APORTE_PGV)}). Preparar ${fmt(VALOR_APORTE_PGV)} da PIX Vanessa (tem ${fmt(saldoPV)})`});
    } else {
      alertas.push({icone:'✅', cor:'#34c98a',
        txto:`PIX Geral Vanessa em ${fmt(saldoPGV)} — acima do gatilho de aporte (${fmt(GATILHO_APORTE_PGV)})`});
    }
    // NOVO 29/07/2026 (V205): alerta do Fundo de Suavizacao Salarial (ativado nesta sessao, Politica
    // secao 16). Avisa 3 situacoes: (a) salario do ciclo veio acima do pro-labore e o excedente ainda
    // nao foi transferido pro fundo; (b) salario veio abaixo e o fundo precisa cobrir a diferenca;
    // (c) fundo vazio num mes magro (situacao de risco - nao ha colchao pra suavizar).
    const excedenteProLabore = REG.operacional.excedenteOuComplementoProLabore;
    const fundoSuavizacao = VARS.contaSuavizacao;
    if(excedenteProLabore > 0 && fundoSuavizacao === 0){
      alertas.push({icone:'ℹ️', cor:'#3987e5',
        txto:`Fundo de Suavização ativo e zerado — salário deste ciclo veio ${fmt(excedenteProLabore)} acima do pró-labore (${fmt(VARS.proLaboreFixo)}). A partir do próximo salário, transferir o excedente para a caixa do Itaú`});
    } else if(excedenteProLabore < 0){
      const precisa = Math.abs(excedenteProLabore);
      alertas.push(fundoSuavizacao >= precisa
        ? {icone:'⚠️', cor:'#e8a63a', txto:`Mês magro: salário ${fmt(precisa)} abaixo do pró-labore — sacar do Fundo de Suavização (tem ${fmt(fundoSuavizacao)}) para manter o orçamento`}
        : {icone:'🔴', cor:'#e2554f', txto:`Mês magro: falta ${fmt(precisa)} para o pró-labore, mas o Fundo de Suavização só tem ${fmt(fundoSuavizacao)} — sem colchão suficiente, revisar Modo Operacional`});
    } else if(fundoSuavizacao > 0){
      alertas.push({icone:'✅', cor:'#34c98a',
        txto:`Fundo de Suavização com ${fmt(fundoSuavizacao)} — colchão de ${(fundoSuavizacao/VARS.proLaboreFixo).toFixed(1)} mês(es) de pró-labore`});
    }
    // NOVO 04/08/2026 (parte 77, pedido do usuario: "eu nao quero que o ciclo do mercado pago me
    // engane, resolva da forma profissional"): mostra o saldo/fatura ATUAL do Mercado Pago (Pluggy)
    // sempre, o mes inteiro - nao so perto do vencimento (dia 4). Antes esse valor so aparecia (e olhe
    // la, so no console) quando a comparacao de divergencia entrava em jogo, que so faz sentido perto
    // do vencimento (reconciliarPluggy, ver parte 77 la tambem). Aqui e so informativo (nao compara
    // contra o ERP, so mostra o que a Pluggy ve agora), busca direto de VARS.PLUGGY_CONTAS - nao
    // depende do resultado do reconciliador rodar antes.
    (function(){
      const pc = VARS.PLUGGY_CONTAS;
      if(!pc || !pc.conexoes) return;
      let contaMP = null;
      pc.conexoes.forEach(cx=> (cx.contas||[]).forEach(c=>{ if(/mercado\s*pago/i.test(c.nome||'')) contaMP = c; }));
      if(!contaMP || !contaMP.fatura_mes_atual) return;
      const valor = contaMP.fatura_mes_atual.valor_total;
      const venc = contaMP.fatura_vencimento_atual || contaMP.fatura_mes_atual.vencimento;
      const vencFmt = venc ? new Date(venc).toLocaleDateString('pt-BR') : '?';
      alertas.push({icone:'ℹ️', cor:'#3987e5',
        txto:`Mercado Pago (fatura aberta, ao vivo): ${fmt(valor)} — vence ${vencFmt}`});
    })();
    // NOVO 03/08/2026 (V400 Etapa 11 - Alertas): Inbox Financeira acumulando item pendente sem revisão.
    // So conta o que ja existe em VARS.INBOX_FINANCEIRA (nada novo capturado aqui) - mesmo criterio das
    // demais linhas desta funcao (expor contador ja mantido, nao inventar fonte de dado nova). Idade em
    // dias calculada a partir de item.criadoEm (ISO), que ja existe desde a Etapa 1 (inboxAdicionarItem).
    const inboxPendentes = (VARS.INBOX_FINANCEIRA||[]).filter(i=>i.status==='PENDENTE');
    if(inboxPendentes.length === 0){
      alertas.push({icone:'✅', cor:'#34c98a', txto:'Inbox Financeira sem item pendente'});
    } else {
      const maisAntigo = inboxPendentes.reduce((a,b)=> new Date(a.criadoEm) < new Date(b.criadoEm) ? a : b);
      const diasParado = Math.floor((Date.now() - new Date(maisAntigo.criadoEm))/86400000);
      const nivel = diasParado <= 2 ? {icone:'ℹ️',cor:'#3987e5'} : diasParado <= 7 ? {icone:'⚠️',cor:'#e8a63a'} : {icone:'🔴',cor:'#e2554f'};
      alertas.push({icone:nivel.icone, cor:nivel.cor,
        txto:`${inboxPendentes.length} item(ns) pendente(s) na Inbox Financeira — mais antigo há ${diasParado} dia(s) (${maisAntigo.id})`});
    }
    return alertas;
  }

  // NOVO 04/08/2026 (V400 Etapa 12 - Assistente): resumo em linguagem natural, formalizando o que ja
  // era feito manualmente em sessao (ler alertas/Inbox e resumir). So LE dado ja calculado (cv,
  // REG.operacional, montarAlertasNegocio(), VARS.INBOX_FINANCEIRA) - nunca calcula nada novo, mesma
  // regra das Etapas 10/11. Deterministico, sem IA/LLM - compativel com o WallaceAIService do V500
  // (Alexa): a Alexa consumiria isso via /api/insights, nunca calculando nada por conta propria.
  function montarResumoAssistente(){
    const modo = REG.operacional.modoOperacional;
    const alertas = montarAlertasNegocio();
    const criticos = alertas.filter(a=>a.icone==='🔴');
    const atencao = alertas.filter(a=>a.icone==='⚠️');
    const partes = [`Modo operacional: ${modo}.`,
      `Caixa Variável disponível: ${fmt(cv.disponivel)}, comprometido ${fmt(cv.comprometido)}.`];
    if(criticos.length) partes.push(`${criticos.length} alerta(s) crítico(s): ${criticos.map(a=>a.txto).join(' | ')}`);
    else if(atencao.length) partes.push(`${atencao.length} ponto(s) de atenção: ${atencao.map(a=>a.txto).join(' | ')}`);
    else partes.push('Nenhum alerta crítico ou de atenção no momento.');
    const inboxPendentes = (VARS.INBOX_FINANCEIRA||[]).filter(i=>i.status==='PENDENTE');
    if(inboxPendentes.length) partes.push(`${inboxPendentes.length} item(ns) aguardando revisão na Inbox Financeira.`);
    return { texto: partes.join(' '), modo, criticos: criticos.length, atencao: atencao.length, inboxPendentes: inboxPendentes.length };
  }
  window.WallaceAI = window.WallaceAI || {};
  window.WallaceAI.resumo = montarResumoAssistente; // ponte pro futuro /api/insights (V500) - so leitura

  onDomPronto(()=>{ // V170: corrigido - era addEventListener DOMContentLoaded, nunca rodava (script injetado dinamicamente)
    set('diasDecorridos', decorridos);
    set('diasRestantes', restantes);
    set('hojeData', fmtData(hoje));
    set('atualizadoEm', 'Atualizado em '+fmtData(hoje));
    set('cicloRange', fmtCurta(inicio)+' → '+fmtData(fim));
    set('dispDia', dispDiaReal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
    const bar = $('cicloProgress');
    if(bar) bar.style.width = pct+'%';
    lreiAtivos.forEach(l=>{
      const el = $(l.id);
      if(el){
        const dias = diasAging(l.abertura);
        el.textContent = dias+(dias===1?' dia':' dias');
        el.setAttribute('style', faixaAging(dias));
      }
    });

    // Simulador Fim de Ciclo
    // Card ECC (secao 07 do painel principal) - status real, nao mais hardcoded "RESOLVIDO"
    const eccStatusEl = $('eccStatus');
    if(eccStatusEl){
      eccStatusEl.textContent = cv.disponivel >= 0 ? 'RESOLVIDO' : (folego >= 0 ? 'ATIVO (dentro da tolerância)' : 'ATIVO (estourou a tolerância)');
      eccStatusEl.style.color = cv.disponivel >= 0 ? '#34c98a' : (folego >= 0 ? '#e8a63a' : '#e2554f');
    }
    set('eccValor', fmt(cv.disponivel));
    set('eccFolego', fmt(folego));

    // Badge "Queda total" (Necessidade líquida) - calculado ao vivo a partir da MESMA serie usada
    // no grafico (18/07/2026, V85: estava hardcoded, descolado do dado real ha varias rodadas).
    const nlSerie = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V165: baseado no ciclo financeiro
    const quedaTotal = Math.round((nlSerie[0] - nlSerie[nlSerie.length-1])*100)/100;
    set('quedaTotalNL', 'Queda total: '+fmt(quedaTotal));
    const r21EccEl = $('r21ECC');
    if(r21EccEl){
      r21EccEl.textContent = cv.disponivel >= 0 ? 'Zerado' : (folego >= 0 ? 'Ativo (na tolerância)' : 'Ativo (estourado)');
      r21EccEl.style.color = cv.disponivel >= 0 ? 'var(--green)' : (folego >= 0 ? 'var(--accent)' : 'var(--red)');
    }

    set('simDiasRestantes', restantes+(restantes===1?' dia':' dias'));
    set('simTeto', fmt(tetoEfetivo)+(cv.tolerenciaTemp>0 ? ' *' : ''));
    set('simComprometido', fmt(cv.comprometido));
    set('simSaldoReal', fmt(cv.saldoReal));
    const faltaEl = $('simFalta');
    if(faltaEl){
      faltaEl.textContent = faltaCobrir > 0 ? fmt(faltaCobrir) : 'R$ 0,00 (coberto)';
      faltaEl.style.color = faltaCobrir > 0 ? '#e2554f' : '#34c98a';
    }
    const folegoEl = $('simFolego');
    if(folegoEl){
      folegoEl.textContent = fmt(cv.disponivel); // CORRIGIDO 26/07/2026 (V182, usuario apontou "Folego ate teto errado"): antes mostrava tetoEfetivo-comprometido (fôlego contra o TETO OFICIAL de R$2.000, sempre igual mesmo com saldo real menor) - renomeado para "Disponível real hoje" e agora mostra cv.disponivel (saldoReal-comprometido), a mesma metrica do card Caixa Variavel acima, sem ambiguidade.
      folegoEl.style.color = cv.disponivel >= 0 ? '#34c98a' : '#e2554f';
    }
    // NOVO 26/07/2026 (V182): "cadê o valor que possa gastar por dia?" - a descricao do card ja
    // prometia "ritmo sugerido por dia" (Politicas sec.15) mas nunca foi implementado. Disponivel real
    // dividido pelos dias restantes do ciclo, nunca negativo (minimo R$0,00 se ja estourou).
    const porDiaEl = $('simPorDia');
    if(porDiaEl){
      const porDia = restantes > 0 ? Math.max(0, cv.disponivel) / restantes : 0;
      porDiaEl.textContent = fmt(Math.round(porDia*100)/100);
    }
    // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO): card so aparece se houver algo represado -
    // enquanto pendenteProximoCiclo=0 (sem compras na janela 23-25 ainda), fica escondido para nao
    // poluir o painel com um card vazio.
    const pendenteBox = $('simPendenteBox');
    const pendenteValor = cv.pendenteProximoCiclo || 0;
    if(pendenteBox){
      pendenteBox.style.display = pendenteValor > 0 ? 'block' : 'none';
    }
    set('simPendenteValor', fmt(pendenteValor));
    const msgEl = $('simMensagem');
    if(msgEl){
      const porDiaMsg = restantes > 0 ? Math.max(0, cv.disponivel) / restantes : 0;
      if(faltaCobrir <= 0){
        msgEl.innerHTML = `Tem <strong>${fmt(cv.saldoReal)}</strong> na caixa e o comprometido é <strong>${fmt(cv.comprometido)}</strong> — está coberto, sobra <strong>${fmt(Math.abs(faltaCobrir))}</strong>. Isso dá <strong>${fmt(Math.round(porDiaMsg*100)/100)}/dia</strong> pelos ${restantes} dias restantes do ciclo.`
          + (folego < 0 ? ` (Ainda assim, acima do teto oficial em ${fmt(Math.abs(folego))} — coberto pela tolerância temporária.)` : '');
      } else {
        msgEl.innerHTML = `<strong style="color:#e2554f">Falta ${fmt(faltaCobrir)}</strong> para cobrir o comprometido — tem ${fmt(cv.saldoReal)} na caixa contra ${fmt(cv.comprometido)} comprometido. Recomposição prevista via reembolso Wärtsilä ou salário de 25/07.`;
      }
    }

    // Verificações de Negócio
    const alertasEl = $('alertasNegocio');
    if(alertasEl){
      // parte 44 (pedido do usuario, "não conversa com o resto do site"): trocado de linha inteira colorida
      // (style="color:...") pra um chip circular colorido + texto em --text-mid, reaproveitando a mesma
      // paleta de 4 cores que ja formava .badge.bg/.ba/.br/.bb no resto do site, so que como icone em vez de pill de texto.
      const CLASSE_POR_COR = {'#34c98a':'bg','#e8a63a':'ba','#e2554f':'br','#3987e5':'bb'};
      alertasEl.innerHTML = montarAlertasNegocio().map(a=>
        `<div class="verif-item ${CLASSE_POR_COR[a.cor]||'bb'}"><span class="verif-ico">${a.icone}</span><span class="verif-txt">${a.txto}</span></div>`
      ).join('');
    }
  });
})();

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

// ===== V152 (25/07/2026): FILTRO DE LIVROS RAZAO POR CICLO =====
// Pedido do usuario: "Os livros razão onde tem as compras Variáveis, tem que mostrar apenas as
// compras do limbo do master e as que são no novo ciclo". Em vez de reescrever as ~260 linhas de
// tabela (risco alto de erro/perda de dado numa refatoracao sem visualizacao real disponivel),
// o filtro esconde/mostra linhas via CSS usando a propria coluna "Data" (formato DD/MM) ja existente
// em cada <tr> - nenhum dado foi reescrito, so uma camada de exibicao por cima do que ja existia.
// Corte do limbo+ciclo atual: 23/07/2026 em diante (dia do mes >=23 E mes=07, cobrindo o limbo do
// fechamento da fatura Mastercard Black que comeca no dia 23) OU mes >= 08 (futuro). Datas antes disso
// (ate 22/07) sao 100% do ciclo fechado (26/06-24/07), sem ambiguidade de limbo.
const CICLO_NOVO_DIA_CORTE = 23; // dia em que o LIMBO do Mastercard Black comeca (fechamento fatura ~22/07)
const CICLO_NOVO_MES_CORTE = 7;  // julho

function dataPertenceCicloAtual(dataStr){
  // dataStr no formato "DD/MM" (ex: "27/06", "25/07"). Retorna true se e do ciclo atual (25/07 em diante).
  const m = dataStr.match(/^(\d{2})\/(\d{2})$/);
  if(!m) return true; // formato inesperado (ex: "—" ou vazio) -> nao esconde, mostra por seguranca
  const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10);
  if(mes > CICLO_NOVO_MES_CORTE) return true;  // mes futuro (agosto em diante) = ciclo atual ou seguinte
  if(mes === CICLO_NOVO_MES_CORTE) return dia >= CICLO_NOVO_DIA_CORTE;
  return false; // mes anterior a julho = ciclo fechado
}

// Livros que fazem sentido filtrar por ciclo (compras variaveis e afins). Livros patrimoniais/parcelados
// (LRP, LRCON, LREI, doacoes) nao sao filtrados aqui - continuam mostrando tudo, pois representam saldo
// corrente/parcelamento continuo, nao "gasto do mes".
const LIVROS_FILTRAVEIS_POR_CICLO = ['lrw','lrv','lrb','lrs','lrr','lrc','lrmp','lrcv','lrpv'];

let filtroLivroRazaoAtivo = true; // true = mostra so limbo+ciclo atual. false = mostra tudo (historico completo).
// onDomPronto(aplicarFiltroLivrosRazao) DESATIVADO (V174) - substituido pelo seletor de ciclo, que agora controla tudo via trocarCiclo()

function aplicarFiltroLivrosRazao(){
  LIVROS_FILTRAVEIS_POR_CICLO.forEach(id=>{
    const pane = $(id);
    if(!pane) return;
    const rows = pane.querySelectorAll('tbody tr');
    rows.forEach(tr=>{
      const dataCell = tr.children[1]; // 2a coluna = Data em todas as tabelas (TX, Data, Estabelecimento, Valor)
      if(!dataCell) return;
      const dataStr = dataCell.textContent.trim();
      const ehCicloAtual = dataPertenceCicloAtual(dataStr);
      if(filtroLivroRazaoAtivo){
        tr.style.display = ehCicloAtual ? '' : 'none';
      } else {
        tr.style.display = '';
      }
    });
  });
  atualizarBotaoFiltroLivrosRazao();
  atualizarContagemAbas(); // V162: recontagem dinamica sempre que o filtro muda, roda DEPOIS de esconder/mostrar linhas
}

function alternarFiltroLivrosRazao(){
  filtroLivroRazaoAtivo = !filtroLivroRazaoAtivo;
  aplicarFiltroLivrosRazao();
}

function atualizarBotaoFiltroLivrosRazao(){
  const btn = $('btnFiltroLivrosRazao');
  if(!btn) return;
  btn.textContent = filtroLivroRazaoAtivo
    ? '🔍 Mostrando: ciclo atual + limbo — ver histórico completo'
    : '🔍 Mostrando: histórico completo — ver só ciclo atual';
}


const valueLeaderPlugin = {
  id: 'valueLeader',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    meta.data.forEach((point, i) => {
      const x = point.x, y = point.y;
      const lineTop = y - 16;
      ctx.strokeStyle = 'rgba(169,167,159,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, lineTop);
      ctx.stroke();
      const label = 'R$ ' + Math.round(values[i]).toLocaleString('pt-BR');
      ctx.fillStyle = '#e8e6df';
      ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(label, x, lineTop - 4);
    });
    ctx.restore();
  }
};

(function(){
const muted = '#a9a79f', dim='#6f6d66', grid='#2a2d31';
Chart.defaults.color = muted;
Chart.defaults.font.family = "-apple-system, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size = 11;

new Chart($('cPatrim'), {
  type:'doughnut',
  data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
    datasets:[{data:Object.values(REG.patrimonioDetalhe),
    backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
    tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart($('cVisa'), {
  type:'doughnut',
  data:{labels:VISA_DETALHE_LABELS,
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:VISA_DETALHE_CORES,
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
    tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart($('cVisaMB'), {
  type:'doughnut',
  data:{labels:['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa'],
    datasets:[{data:Object.values(REG.mbDetalhe),
    backgroundColor:['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0'],
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
    tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart($('cVariavel'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:['Saldo real','Comprometido','Disponível'],
    datasets:[{data:[REG.caixaVariavel.saldoReal,REG.caixaVariavel.comprometido,REG.caixaVariavel.disponivel],
    backgroundColor:['#3987e5','#e8a63a','#34c98a'],borderRadius:5}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:20}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}}}}
});

const totalOpSeries = alignSeriesCiclo(REG.evolucao.totalOperacional); // V165: baseado no ciclo financeiro (25-24)
const totalOpRange = yRange(totalOpSeries);
new Chart($('cEvol'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:totalOpSeries,
    borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
    borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:totalOpRange.min,max:totalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

const necLiqSeries = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V163: baseado no ciclo financeiro
const necLiqRange = yRange(necLiqSeries);
new Chart($('cNecessidadeLiquida'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:necLiqSeries,
    borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
    borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:necLiqRange.min,max:necLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});
})();

function _lazyRenderCenariosSalario(){
const grid='#2a2d31';
const cenarioLabelPlugin = {
  id:'cenarioLabel',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = "600 9px -apple-system, 'Segoe UI', Roboto, sans-serif";
    meta.data.forEach((bar,i)=>{
      const v = values[i];
      const y = Math.max(bar.y-8, 12);
      ctx.fillStyle = '#e8e6df';
      ctx.fillText('R$ '+Math.round(v).toLocaleString('pt-BR'), bar.x, y);
    });
    ctx.restore();
  }
};
const cenarioSalarioData = [REG.deficitZero.liquidoSemTrabalhar,REG.operacional.necessidadeTotalBruta-REG.operacional.reembolsoSobraPessoal,REG.cenarioHistorico.media,VARS.cenarioMesesBonsMedia];
const cenarioSalarioRange = yRange(cenarioSalarioData, 0.18);
new Chart($('cCenarioSalario'), {
  type:'bar',
  plugins:[cenarioLabelPlugin],
  data:{labels:['Não trabalha','Ponto de\nempate','Média\n(sobra)','Meses bons\n(média)'],
    datasets:[{data:cenarioSalarioData,
    backgroundColor:['#e0574c','#e8a63a','#34c98a','#34c98a'],
    borderRadius:4,barThickness:56}]},

  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,bottom:8}},
    plugins:{legend:{display:false},tooltip:{callbacks:{
      title:c=>c[0].label.replace('\n',' '),
      label:c=>fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10.5}}},
      y:{grid:{color:grid},max:cenarioSalarioRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});
}

function _lazyRenderGraficosSecao(){
// ===== Aba GRAFICOS =====
const muted = '#a9a79f', grid='#2a2d31';
const legendStd = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};
// barValuePlugin agora e global (definido junto de fmt(), no topo do arquivo) - reutilizado aqui.

// plugin: rotula % em cima de cada barra de progresso de metas
const metaValuePlugin = {
  id:'metaValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const raw = chart.data.datasets[0].raw;
    ctx.save();
    ctx.fillStyle = '#e8e6df';
    ctx.font = "600 10px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    meta.data.forEach((bar,i)=>{
      ctx.fillText(raw[i], bar.x + 6, bar.y);
    });
    ctx.restore();
  }
};

new Chart($('g_cPatrim'), {
  type:'doughnut',
  data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
    datasets:[{data:Object.values(REG.patrimonioDetalhe),
    backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart($('g_cVisa'), {
  type:'doughnut',
  data:{labels:VISA_DETALHE_LABELS,
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:VISA_DETALHE_CORES,
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

// CORRIGIDO 26/07/2026 (V166, pedido do usuario): "Composição da fatura Mastercard Black e Visa
// Infinite" so mostrava dados do Visa (visaDetalhe) - titulo prometia os 2 cartoes, grafico so
// entregava 1. Novo dataset COMBINADO: cada categoria soma o componente do Visa + o do Mastercard.
const FATURA_COMBINADA_LABELS = ['Parcelas','Consórcios','Wallace/MB','Recorrências','Corp.','Assinaturas','Vanessa/MB'];
const FATURA_COMBINADA_VALORES = [
  REG.visaDetalhe.parcelas, // parcelas so existem no Visa (MB nunca recebe parcela, regra fixa)
  REG.visaDetalhe.consorcios + REG.mbDetalhe.consorcios,
  REG.visaDetalhe.wallace + REG.mbDetalhe.wallace,
  REG.visaDetalhe.recorrencias + REG.mbDetalhe.recorrencias,
  REG.visaDetalhe.corp + REG.mbDetalhe.corp,
  REG.visaDetalhe.assinaturas + REG.mbDetalhe.assinaturas,
  REG.visaDetalhe.vanessa + REG.mbDetalhe.vanessa,
];
new Chart($('g_cVisaBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:FATURA_COMBINADA_LABELS,
    datasets:[{data:FATURA_COMBINADA_VALORES,
    backgroundColor:VISA_DETALHE_CORES,borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

// Novo 19/07/2026 (V89) — Visa+MB liquido de Caixa Variavel (isolado em IIFE propria, regra 14.2)
// ATUALIZADO 20/07/2026 (pedido do usuario): Mastercard Black vem antes do Visa Infinite em toda
// legenda/titulo que combine os dois. Adicionadas 2 barras novas: Disponivel real (Saldo Real -
// Comprometido) e Reposicao necessaria, pra mostrar a diferenca entre o que esta provisionado
// (Comprometido) e o que existe de verdade em caixa agora (Disponivel).
(function(){
  const cvComprometido = REG.caixaVariavel.comprometido;
  const cvDisponivel = REG.caixaVariavel.disponivel;
  const visaTotal = REG.cartaoInfinite.total;
  const mbTotal = REG.cartaoMB.total;
  const liquido = Math.round((visaTotal + mbTotal - cvComprometido)*100)/100;
  const reposicao = cvDisponivel < 0 ? Math.round(Math.abs(cvDisponivel)*100)/100 : 0;
  new Chart($('g_cCartoesLiquidoCV'), {
    type:'bar',
    plugins:[barValuePlugin],
    data:{labels:['Mastercard Black','Visa Infinite','Caixa Variável (comprometido)','Líquido não coberto','Disponível real em caixa','Reposição necessária'],
      datasets:[{data:[mbTotal, visaTotal, -cvComprometido, liquido, cvDisponivel, reposicao],
      backgroundColor:['#9085e9','#3987e5','#e2554f','#e8a63a','#34c98a','#e0574c'],borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60,left:10}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
        y:{grid:{display:false},ticks:{font:{size:10}}}}}
  });
})();

// 01 — Composição do Total Operacional (7 categorias confirmadas com o Wallace em 15/07/2026)
// Boletos=2600 (APORTE_BOLETOS, nao o total bruto do livro LRB) · Prov. MP=471,47 (MP pessoal, nao o total bruto do LRMP)
const totalOpLabels = ['Boletos','Parcelas','Consórcios','Recorrências','Aportes Pat.','Prov. MP','Assinaturas'];
const totalOpData = Object.values(REG.totalOpDetalhe);
const totalOpColors = ['#3987e5','#9085e9','#e2554f','#34c98a','#e8a63a','#6f6d66','#e879b0'];

new Chart($('g_cTotalOp'), {
  type:'doughnut',
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart($('g_cTotalOpBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

new Chart($('g_cVariavel'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:['Saldo real','Comprometido','Disponível'],
    datasets:[{data:[REG.caixaVariavel.saldoReal,REG.caixaVariavel.comprometido,REG.caixaVariavel.disponivel],
    backgroundColor:['#3987e5','#e8a63a','#34c98a'],borderRadius:5}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}}}}
});

// 03 — Progresso das metas patrimoniais (corrigido 15/07/2026 com o Wallace; Escola Julio removida 18/07/2026 V85).
// Caixa Lance NÃO tem meta propria - e um pulmao que acumula ate um valor relevante para investir
// (evitar taxa de corretagem desproporcional em aportes pequenos), nao entra neste grafico.
// BTG/Necton tambem nao tem meta propria - contribui para a Meta do Milhao (R$1.000.000).
// Escola de Julio NAO entra aqui (removida do Patrimonio Total desde V47, 16/07/2026) - e uma
// reserva/caixa propria, acompanhada na secao 14 (Escola de Julio), nao e uma "meta patrimonial".
// As 3 metas reais monitoradas aqui: Meta do Milhao (patrimonio total), Casa Nova (consorcio),
// Consorcio Auto.
const metasNomes = ['Meta Milhão','Casa Nova','Consórcio Auto'];
const metasPct = [REG.metasPatrimoniais.milhaoPct, REG.metasPatrimoniais.casaNovaPct, REG.metasPatrimoniais.autoPct];
const pctBR = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
// V139: rotulo curto e detalhe completo agora GERADOS a partir do REG/VARS, nao mais strings escritas a
// mao (a versao anterior tinha "11,54% do milhao" congelado no texto, desatualizado desde a correcao
// do PATRIMONIO_TOTAL na V135 - o numero do grafico ja tinha corrigido, so o texto do label nao).
const metasRaw = [
  pctBR(REG.metasPatrimoniais.milhaoPct)+'% do milhão',
  pctBR(REG.consorcioCasaNova.pagoPct)+'% pago',
  pctBR(REG.metasPatrimoniais.autoPct)+'% pago'
];
const metasDetalhe = [
  pctBR(REG.metasPatrimoniais.milhaoPct)+'% · '+fmt(REG.patrimonio.total)+' de '+fmt(REG.patrimonio.metaMilhao),
  'Consórcio Casa Nova (cota 12, grupo I0464) · quitação '+fmt(REG.consorcioCasaNova.quitacaoValor)+' ('+pctBR(REG.consorcioCasaNova.quitacaoPct)+'%)',
  'Carta '+fmt(VARS.consorcioAutoCartaCredito)+', saldo devedor '+fmt(REG.balanco.passivos.consorcioAutoContemplado)
];

new Chart($('g_cMetas'), {
  type:'bar',
  plugins:[metaValuePlugin],
  data:{labels:metasNomes,
    datasets:[{data:metasPct, raw:metasRaw,
    backgroundColor:['#9085e9','#3987e5','#34c98a'],borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:70,top:15}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>metasDetalhe[c.dataIndex]}}},
    scales:{x:{grid:{color:grid},max:105,ticks:{callback:v=>v+'%',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

const gTotalOpSeries = alignSeriesCiclo(REG.evolucao.totalOperacional); // V165: baseado no ciclo financeiro
const gTotalOpRange = yRange(gTotalOpSeries);
new Chart($('g_cEvol'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:gTotalOpSeries,
    borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
    borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gTotalOpRange.min,max:gTotalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

const gNecLiqSeries = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V163: baseado no CICLO financeiro (25-24), nao no mes calendario - evita o valor "pular" quando mes vira mas ciclo nao, ou vice-versa
const gNecLiqRange = yRange(gNecLiqSeries);
new Chart($('g_cNecessidadeLiquida'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMesesCiclo(12),
    datasets:[{data:gNecLiqSeries,
    borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
    borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gNecLiqRange.min,max:gNecLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

// 07 — Caixas operacionais vs metas (lista confirmada pelo Wallace em 15/07/2026 — sem PIX Wallace,
// extinta em 13/07/2026, e sem Fatura Wärtsilä: não é uma caixa operacional com meta própria, é um
// repasse de reembolso (P3: Reembolsos Wärtsilä → Fatura Wärtsilä → Mercado Pago → Caixa Lance,
// nunca "pertence" a uma caixa - ver Princípios Contábeis no SWP_INPUT). Layout horizontal para
// caber os 7 nomes sem cortar, com o valor ao final de cada barra.
const caixasLabels = ['Boletos','PIX Vanessa','Manutenção','Eventos e Viagens','Saúde Família','Aniversário Júlio','Seguro/Emplacamento','Escola Júlio'];
const caixasSaldo = Object.values(REG.caixasOperacionais).map(c=>c.saldo);
const caixasMeta =  Object.values(REG.caixasOperacionais).map(c=>c.meta);
const caixasNotas = [
  '23,6% da meta',
  '0% da meta (zerada)',
  'LREI0001 quitado (21/07) — depósito direto do reembolso Wärtsilä',
  'Suporte à Variável (R$167,40) para o mesmo custo: visita família Vanessa/Natal-RN — não é empréstimo',
  '2x Júlio + 1x Vanessa/ano · aporte R$100/mês',
  '50% da meta · aporte R$200/mês até 14/09',
  'Aporte R$425/mês (permanente)',
  '5,5% da meta · meta R$9.236,00, fora da Meta do Milhão (P5)'
];

const caixasValuePlugin = {
  id:'caixasValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    ctx.save();
    ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds,di)=>{
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar,i)=>{
        ctx.fillStyle = di===0 ? '#3987e5' : '#e8a63a';
        ctx.fillText(fmt(ds.data[i]), bar.x + 6, bar.y);
      });
    });
    ctx.restore();
  }
};

observeAndRenderChart($('g_cCaixas'), () => new Chart($('g_cCaixas'), {
  type:'bar',
  plugins:[caixasValuePlugin],
  data:{labels:caixasLabels,
    datasets:[
      {label:'Meta', data:caixasMeta, backgroundColor:'#e8a63a', borderRadius:3},
      {label:'Saldo atual', data:caixasSaldo, backgroundColor:'#3987e5', borderRadius:3}
    ]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:70}},
    barPercentage:0.7,categoryPercentage:0.65,
    plugins:{legend:legendStd,tooltip:{callbacks:{
      label:c=>c.dataset.label+': '+fmt(c.raw)+(c.datasetIndex===0 ? ' — '+caixasNotas[c.dataIndex] : '')
    }}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10.5}}}}}
}));

// 08 — Alivio de pressao: soma dos aportes das caixas incrementais (Aniversario Julio, Escola Julio,
// Saude Familia, Seguro/Emplacamento) mes a mes, ate cada uma zerar/trocar seu aporte ao bater meta/prazo.
// MESCLADO 20/07/2026 (pedido do usuario, "nao gostei de grafico separado"): janela FIXA de 18 meses
// (Jul/26-Dez/27, nao usa gerarMeses/alignSeries porque este e um plano fixo no tempo, nao uma janela
// rolante a partir de "hoje") pra caber tanto o ciclo atual quanto a virada do ciclo 2027 confirmada pelo
// usuario: Escola de Julio reinicia do zero em Jan/27 (R$839,64/mes x 11 meses = R$9.236,04, bate o teto
// R$9.236,00 em novembro). Seguro/Emplacamento e um ciclo CONTINUO de 12 meses desde Jan/26, mesma taxa
// (R$425/mes) ao virar pro ciclo 2027 - por isso nunca gera evento de alivio/aumento, so continua.
const alivioLabels = ['Jul/26','Ago/26','Set/26','Out/26','Nov/26','Dez/26','Jan/27','Fev/27','Mar/27','Abr/27','Mai/27','Jun/27','Jul/27','Ago/27','Set/27','Out/27','Nov/27','Dez/27'];
const ANIVERSARIO_JULIO_APORTE = 200, ESCOLA_JULIO_ATUAL_APORTE = 500, SAUDE_FAMILIA_APORTE = 100,
      SEGURO_EMPLACAMENTO_APORTE = VARS.seguroEmplacamentoAporte, ESCOLA_JULIO_2027_APORTE = VARS.escolaJulio2027Aporte;
const alivioData = alivioLabels.map((_,i)=>{
  let v = SEGURO_EMPLACAMENTO_APORTE; // ciclo continuo, sempre ativo nos 18 meses
  if(i < 2) v += ANIVERSARIO_JULIO_APORTE;       // completa Set/26 (14/09)
  if(i < 4) v += ESCOLA_JULIO_ATUAL_APORTE;      // completa Nov/26 (01/11, coberto por 13o/ferias)
  if(i < 16) v += SAUDE_FAMILIA_APORTE;          // projeta completar ~Nov/27 (16 meses, ritmo atual)
  if(i >= 6 && i <= 16) v += ESCOLA_JULIO_2027_APORTE; // ciclo 2027: Jan/27-Nov/27 (11 meses)
  return Math.round(v*100)/100;
});
const alivioEventos = {
  2: {tipo:'alivio',  texto:'Aniversário Júlio completa (14/09) — R$200,00/mês liberados'},
  4: {tipo:'alivio',  texto:'Escola Júlio (ciclo atual) completa (01/11) — R$500,00/mês liberados'},
  6: {tipo:'aumento', texto:'Escola Júlio 2027 inicia (do zero) — +R$839,64/mês'},
  16:{tipo:'alivio',  texto:'Saúde Família + Escola Júlio 2027 completam — R$939,64/mês liberados'}
};

const alivioStepPlugin = {
  id:'alivioStepPlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8e6df';
    meta.data.forEach((pt,i)=>{
      // CORRIGIDO 20/07/2026: com 18 pontos (janela estendida), rotulo em TODO ponto ficava
      // atropelado/sobreposto quando varios meses seguidos tem o mesmo valor (plato). Agora so
      // desenha o valor no primeiro ponto de cada plato (inicio) e no ultimo ponto da serie.
      const mudou = i === 0 || alivioData[i] !== alivioData[i-1];
      const ultimo = i === meta.data.length - 1;
      if(mudou || ultimo){
        ctx.fillText(fmt(alivioData[i]), pt.x, pt.y - 12);
      }
      const ev = alivioEventos[i];
      if(ev){
        ctx.fillStyle = ev.tipo === 'alivio' ? '#34c98a' : '#e0574c';
        ctx.font = "600 8px -apple-system, 'Segoe UI', Roboto, sans-serif";
        const seta = ev.tipo === 'alivio' ? '↓ ' : '↑ ';
        ctx.fillText(seta+ev.texto.split(' — ')[1], pt.x, pt.y + 18);
        ctx.fillStyle = '#e8e6df';
        ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      }
    });
    ctx.restore();
  }
};

observeAndRenderChart($('g_cAlivio'), () => new Chart($('g_cAlivio'), {
  type:'line',
  plugins:[alivioStepPlugin],
  data:{labels:alivioLabels,
    datasets:[{data:alivioData, stepped:'before',
    borderColor:'#e879b0', backgroundColor:'rgba(232,121,176,0.08)',
    borderWidth:2.5, pointBackgroundColor:'#e879b0', pointBorderColor:'#16181b',
    pointBorderWidth:2, pointRadius:5, fill:true}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:28,bottom:18}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.raw)+' em aportes incrementais ativos'}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
      y:{grid:{color:grid},min:0,max:yRange(alivioData,0.15).max,ticks:{callback:v=>'R$'+v,font:{size:10}}}}}
}));
}

// ===== Operação Superávit Normal (Cenarios, secao 05) - mesmo piso do Deficit Zero, renda media 12m =====
function _lazyRenderCenariosSuperavit(){
  const grid2b = '#2a2d31';
  function fmt0b(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}

  // CORRIGIDO 16/07/2026 (usuario): (1) nao usar mais o piso absoluto (gasto minimo essencial) como
  // comparacao - usar a Necessidade Total BRUTA (cenario "paga tudo normalmente", mesma serie do card
  // "Cenario normal" da secao 04) porque este grafico representa o cenario normal, nao o de sobrevivencia.
  // (2) CORRIGIDO 16/07/2026 (2 rodadas): Jul/26 usa o liquido CALCULADO pelo Estimador de Salario
  // (R$16.048,51), nao o salario ja recebido/gasto do ciclo anterior. Meses seguintes usam a MEDIANA de
  // 12 meses (R$18.283,64), NAO a media (R$20.740,48) - usuario forneceu analise mostrando que a media e
  // puxada para cima por 3 meses excepcionais (Dez/25 ferias+13o, Jun/26, Jan/26) e nao e representativa
  // como premissa conservadora. Workflow pretendido: mes a mes, substituir o valor conservador pelo real
  // assim que o contracheque chegar (atualizar REG.superavitNormal.liquido[i], nunca noutro lugar).
  // Necessidade Total Bruta projetada = PROJ_TOTAL_OP_* (SWP_INPUT, reconstruida 16/07/2026 a partir do
  // livro LRP) + Orcamento Operacional R$3.200 constante. Mar/27 em diante mantido constante (sem dados
  // de parcelamento/aporte alem desse horizonte).
  // AUTOMATIZADO 19/07/2026: resolve a serie Liquido em runtime (real > projetado > mediana) via
  // helper global liquidoMes(i), em vez de ler um array hardcoded. "Vivo" no sentido pedido pelo
  // usuario: qualquer edicao em REG.superavitNormal.liquidoProjetado/liquidoReal se reflete aqui
  // sem precisar recalcular a mao os 12 valores - so o(s) mes(es) com dado novo precisa(m) de entrada.
  const snLabels = gerarMesesCiclo(12); // V165: baseado no ciclo financeiro
  const snLiquido = alignSeriesCiclo(snLabels.map((_,i)=>liquidoMes(i)));
  const snNecessidade = alignSeriesCiclo(REG.superavitNormal.necessidade);
  const snDiferenca = snNecessidade.map((n,i)=>Math.round((snLiquido[i]-n)*100)/100);

  // Rotulo compacto em "k" (em vez de milhar completo) - o valor de Julho (salario real) e bem maior que
  // os demais (media), o que gerava sobreposicao de texto com o formato anterior "+13.371" (7 caracteres
  // largos demais para 12 barras). Formato "+19,4k" e fixo e mais estreito.
  const fmtK = v => '+'+(v/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'k';

  const snDataLabelPlugin = {
    id:'snDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        ctx.fillStyle = '#34c98a';
        ctx.fillText(fmtK(snDiferenca[i]), bar.x, bar.y - 7);
      });
      ctx.restore();
    }
  };

  new Chart($('cSuperavitNormal'), {
    type:'bar',
    plugins:[snDataLabelPlugin],
    data:{labels:snLabels,
      datasets:[{data:snDiferenca,
        backgroundColor:'#34c98a',
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Líquido: '+fmt(snLiquido[i]),'Necessidade Total (paga tudo): '+fmt(snNecessidade[i]),'Superávit: '+fmt(snDiferenca[i])];}
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
        y:{grid:{color:grid2b},ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:9.5}}}}}
  });

  const snTbody = $('snTableBody');
  if(snTbody){
    snTbody.innerHTML = snLabels.map((m,i)=>{
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+m+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snLiquido[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snNecessidade[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:var(--green)">+'+fmt0b(snDiferenca[i])+'</td>'+
        '</tr>';
    }).join('');
  }
}

// ===== Operação Déficit Zero e Energia Solar (Cenarios, secoes 06/07) =====
function _lazyRenderCenariosDeficitEGraficosSolar(){
  const grid2 = '#2a2d31';
    function fmt0(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}
  const legendStd2 = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};

  // Piso corrigido 15/07/2026: Parcelas Visa Infinite E Mercado Pago pessoal declinam (parcela
  // 3/6 do MP termina ~Set/26; a de 10/24 avança devagar). Consorcio NAO tem previsao de acabar
  // (confirmado pelo usuario) - fica fixo, assim como Boletos/Recorrencias/Assinaturas.
  // Liquido sem trabalhar fixo R$7.667,73 (12 contracheques reais).
  const dzLabels = gerarMesesCiclo(12); // V165: baseado no ciclo financeiro
  const dzLiquido = REG.deficitZero.liquidoSemTrabalhar;
  const dzPiso = alignSeriesCiclo(REG.deficitZero.piso);
  const dzDeficit = dzPiso.map(p=>Math.round((dzLiquido-p)*100)/100);

  const dzDataLabelPlugin = {
    id:'dzDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 11px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        const d = dzDeficit[i];
        ctx.fillStyle = d<0 ? '#e2554f' : '#34c98a';
        const label = (d<0?'−':'+')+fmt0(Math.abs(d));
        ctx.fillText(label, bar.x, d>=0 ? bar.y - 8 : bar.y + 16);
      });
      ctx.restore();
    }
  };

  new Chart($('cDeficitZero'), {
    type:'bar',
    plugins:[dzDataLabelPlugin],
    data:{labels:dzLabels,
      datasets:[{data:dzDeficit,
        backgroundColor: dzDeficit.map(v=>v<0?'#e2554f':'#34c98a'),
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Líquido sem trabalhar: '+fmt(dzLiquido),'Piso absoluto: '+fmt(dzPiso[i]),(dzDeficit[i]<0?'Déficit: ':'Superávit: ')+fmt(Math.abs(dzDeficit[i]))];}
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  });

  // Tabela HTML organizada abaixo do grafico - liquido, piso e diferenca por mes, texto real
  // (nao desenhado em canvas), garante legibilidade sem risco de sobreposicao.
  const dzTbody = $('dzTableBody');
  if(dzTbody){
    dzTbody.innerHTML = dzLabels.map((m,i)=>{
      const d = dzDeficit[i];
      const cor = d<0 ? 'var(--red)' : 'var(--green)';
      const sinal = d<0 ? '−' : '+';
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+m+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzLiquido)+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzPiso[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+cor+'">'+sinal+fmt0(Math.abs(d))+'</td>'+
        '</tr>';
    }).join('');
  }

  // CORRIGIDO 04/08/2026: "Déficit vira superávit em" estava hardcoded no HTML ("Set/26 (3º mês)"),
  // nunca recalculado - por isso ficou errado assim que o ciclo virou. Calculado agora a partir da
  // MESMA serie dzDeficit/dzLabels que ja alimenta o grafico e a tabela acima (sem duplicar logica,
  // sem numero novo inventado). i+1 = ordinal contado a partir do 1o mes da janela atual (gerarMesesCiclo),
  // nao de uma data fixa antiga - por isso passa a acompanhar o ciclo automaticamente daqui pra frente.
  const dzViraEl = $('dzViraSuperavit');
  if(dzViraEl){
    const idxVira = dzDeficit.findIndex(d=>d>=0);
    if(idxVira === 0){
      dzViraEl.textContent = 'Já em superávit';
    } else if(idxVira > 0){
      dzViraEl.textContent = dzLabels[idxVira]+' ('+(idxVira+1)+'º mês)';
    } else {
      dzViraEl.textContent = 'Não vira nos próximos 12 meses';
    }
  }


  // Energia: comparacao mes a mes, ano anterior (real) vs este ano (projetado com solar).
  // Tarifa real da fatura Jun/2026 (R$322,99/304kWh=R$1,0625/kWh, ICMS+PIS/COFINS ja embutidos).
  // So apartamento do Wallace. Fonte Jul/25-Abr/26: Projeto_Solar_Wallace_Consolidado.md.
  // Mai/26: interpolado entre Abr/26 e Jun/26 (nao ha leitura direta) - marcado com *.
  // Jun/26: real, confirmado na fatura Energisa.
  const mesesPares = ['Jul','Ago','Set','Out','Nov','Dez','Jan','Fev','Mar','Abr','Mai*','Jun'];
  const kwhAnoAnterior = [321,262,279,297,405,265,211,273,330,343,323,304];
  // NOVO 03/08/2026 (pedido do usuário: gráfico 09 "deve andar pra frente automático... o deslocamento
  // na 00h do dia 1 de cada mês" - diferente dos gráficos 10/11, que usam o ciclo de leitura dia 8,
  // este aqui usa o MÊS CALENDÁRIO puro, por decisão explícita do usuário). Âncora = mês de ativação
  // (Jul/2026, mesesPares[0]). Mesmo mecanismo usado em ciclosDesdeAncoraCiclo (topo do arquivo), só
  // que a virada é sempre dia 1, não dia 25 (financeiro) nem dia 8 (leitura solar).
  const ANCHOR_ENERGIA_ANO = Number(VARS.solarDataAtivacao.split('-')[0]);
  const ANCHOR_ENERGIA_MES = Number(VARS.solarDataAtivacao.split('-')[1]); // 7 = Jul
  function offsetMesesCalendario(){
    const hoje = new Date();
    return (hoje.getFullYear()-ANCHOR_ENERGIA_ANO)*12 + (hoje.getMonth()+1-ANCHOR_ENERGIA_MES);
  }
  const OFFSET_ENERGIA = Math.max(0, Math.min(11, offsetMesesCalendario())); // limitado a 11 - alem disso nao ha mais historico de 12 meses pra mostrar
  function alignEnergia(series){
    if(OFFSET_ENERGIA<=0) return series.slice();
    const shifted = series.slice(OFFSET_ENERGIA);
    while(shifted.length < series.length) shifted.push(null);
    return shifted;
  }
  const MESES_ABREV_ENERGIA = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function gerarRotulosEnergia(){
    const labels = [];
    for(let i=0;i<12;i++){
      const idxMes = ((ANCHOR_ENERGIA_MES - 1 + OFFSET_ENERGIA + i) % 12 + 12) % 12;
      labels.push(MESES_ABREV_ENERGIA[idxMes]);
    }
    return labels;
  }
  const mesesParesEnergia = gerarRotulosEnergia(); // rotulos deslocados (o proprio eixo "anda" junto, igual aos outros graficos)
  const tarifa = VARS.faturaEnergisaValor/VARS.faturaEnergisaKwh;
  const anoAnterior = kwhAnoAnterior.map(k=>Math.round(k*tarifa*100)/100);
  // CORRIGIDO 01/08/2026 (pedido do usuario - "os R$70 são muito conservadores"): valorPosSolar
  // ERA so consumoMinimoComSolarKwh*tarifa + taxaMinimaEnergisa (R$69,87 = so Disponibilidade+Iluminacao,
  // faltava Fio B e Encargos). Agora usa a MESMA formula completa e automatica do card "Quanto voce
  // ainda vai pagar" (secao logo abaixo neste arquivo) - Disponibilidade + Fio B + Iluminacao + Encargos,
  // calculados a partir de VARS.ENERGISA_TARIFA_COMPOSICAO.apartamento_wallace (fatura real Jul/2026).
  const compApto = VARS.ENERGISA_TARIFA_COMPOSICAO && VARS.ENERGISA_TARIFA_COMPOSICAO.apartamento_wallace;
  let valorPosSolar;
  if(compApto && compApto.historico && compApto.consumo_kwh){
    const fB = compApto.historico.jul26, cK = compApto.consumo_kwh, pct = compApto.composicao_pct;
    const tarifaReal = fB / cK;
    const fioBFracao = (VARS.FIO_B_COBRANCA_2026_PCT/100) * (VARS.FIO_B_PCT_DA_DISTRIBUICAO/100);
    const custoDisp = VARS.consumoMinimoComSolarKwh * tarifaReal;
    const fioBValor = fB * (pct.distribuicao/100) * fioBFracao;
    const iluminacaoValor = fB * (pct.iluminacao/100);
    const encargosValor = fB * (pct.encargos/100);
    valorPosSolar = Math.round((custoDisp + fioBValor + iluminacaoValor + encargosValor) * 100) / 100;
  } else {
    // fallback pro calculo antigo, so se a composicao tarifaria nao estiver disponivel por algum motivo
    valorPosSolar = Math.round((VARS.consumoMinimoComSolarKwh*tarifa + VARS.taxaMinimaEnergisa)*100)/100;
  }
  // CORRIGIDO 03/08/2026 (achado do usuário: gráfico 09 nunca tinha avançado - ficava sempre em Jul):
  // mesesPares[0]='Jul' é o mês de ATIVAÇÃO, não necessariamente "hoje" - o índice que recebe o valor
  // calculado ao vivo (geração real, não projeção) é OFFSET_ENERGIA (quantos meses de calendário já
  // passaram desde a ativação), não mais fixo em 0.
  // Regra: a fatura minima (valorPosSolar, calculado acima - Disponibilidade+FioB+Iluminacao+Encargos)
  // so vale se o credito solar cobrir 100% do consumo do apartamento; se a ultima leitura mostrar saldo
  // NEGATIVO (credito ainda nao cobre o consumo esperado), soma o deficit x tarifa por cima do minimo -
  // reflete o que a fatura real provavelmente vai cobrar.
  const solarCalcAtual = VARS.SOLAR_LEITURAS_CALC[VARS.SOLAR_LEITURAS_CALC.length-1];
  const deficitWallaceAtual = solarCalcAtual ? Math.max(0, -solarCalcAtual.saldoWallace) : 0;
  const valorMesAtualCalculado = Math.round((valorPosSolar + deficitWallaceAtual*tarifa)*100)/100;
  // CORRIGIDO 01/08/2026 (V227, pedido do usuario - "confuso, valor tem que ser o real quando eu der,
  // senao o calculado"): cada mes agora prioriza VARS.ENERGIA_FATURAS_REAIS[mes] (fatura de verdade,
  // informada pelo usuario) e so cai pro calculo/projecao quando essa chave nao existir.
  const esteAnoFonte = mesesPares.map((mes,i)=>{
    const nomeMes = mes.replace('*','');
    if(VARS.ENERGIA_FATURAS_REAIS[nomeMes] !== undefined) return {valor:VARS.ENERGIA_FATURAS_REAIS[nomeMes], fonte:'real'};
    if(i===OFFSET_ENERGIA) return {valor:valorMesAtualCalculado, fonte:'calculado'};
    return {valor:valorPosSolar, fonte:'projetado'};
  });
  const esteAno = esteAnoFonte.map(e=>e.valor);

  // NOVO 01/08/2026 (V244, pedido do usuario): valores de volta em cima das barras - a versao V227
  // tinha removido TUDO (inclusive o numero simples da barra) pra resolver a colisao do texto de
  // "economia" sobreposto (ver historico). Agora so o valor da barra (sem o "-XXX" de economia por
  // cima, que era a causa real da colisao) - risco de colisao muito menor, mesmo padrao ja usado nos
  // graficos 10/11.
  // CORRIGIDO 03/08/2026 (achado do usuário, print real - "faltou o julho no final"): a v1 usava
  // slice+pad-com-null (mesmo padrão dos gráficos 10/11) - mas ali faz sentido (não estimar crédito
  // futuro sem dado real), aqui NÃO faz sentido: "ano anterior" é histórico REAL de 12 meses que se
  // repete todo ano, e "este ano" sempre tem uma projeção padrão (valorPosSolar) pra qualquer mês sem
  // fatura real. Trocado para busca por NOME DO MÊS (não por posição) - o último mês da janela de 12
  // (Jul/27, 13 meses após a ativação) agora encontra o Jul original (kwhAnoAnterior[0]) de novo, sem
  // buraco. Nunca mais fica vazio, não importa quantos meses passem.
  const kwhPorMesAnterior = {};
  mesesPares.forEach((m,i)=>{ kwhPorMesAnterior[m.replace('*','')] = kwhAnoAnterior[i]; });
  const anoAnteriorAlinhado = mesesParesEnergia.map(label=>{
    const kwh = kwhPorMesAnterior[label];
    return kwh!=null ? Math.round(kwh*tarifa*100)/100 : null;
  });
  // esteAnoFonteAlinhado: mesmo raciocínio - reconstruído do zero em cima dos rótulos JÁ alinhados
  // (mesesParesEnergia), não mais fatiando o array original. índice 0 é SEMPRE "agora" por construção
  // de OFFSET_ENERGIA (ver gerarRotulosEnergia) - fatura real tem prioridade, senão calculado (mês
  // atual) ou projetado (todo o resto, inclusive o Jul de wrap-around).
  const esteAnoFonteAlinhado = mesesParesEnergia.map((label,i)=>{
    if(VARS.ENERGIA_FATURAS_REAIS[label] !== undefined) return {valor:VARS.ENERGIA_FATURAS_REAIS[label], fonte:'real'};
    if(i===0) return {valor:valorMesAtualCalculado, fonte:'calculado'};
    return {valor:valorPosSolar, fonte:'projetado'};
  });
  const esteAnoAlinhado = esteAnoFonteAlinhado.map(e=>e.valor);


  const energiaBarLabelPlugin = {
    id:'energiaBarLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "600 7.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      chart.data.datasets.forEach((ds,di)=>{
        const meta = chart.getDatasetMeta(di);
        ctx.fillStyle = di===0 ? '#e8a63a' : '#34c98a';
        meta.data.forEach((bar,i)=>{
          const v = ds.data[i];
          if(v===null || v===undefined) return;
          ctx.fillText('R$'+Math.round(v), bar.x, bar.y - 4);
        });
      });
      // NOVO 02/08/2026 (pedido do usuario - achado num snapshot antigo do Netlify que tinha isso e
      // sumiu nessa versao): numero azul da ECONOMIA do mes (esteAno - anoAnterior, sempre negativo =
      // economizou), desenhado acima da barra laranja (a mais alta na maioria dos meses) - mesma
      // logica ja usada no tooltip (afterLabel), so que agora tambem fixo na tela, sem precisar tocar.
      const metaAnoAnterior = chart.getDatasetMeta(0);
      ctx.fillStyle = '#3987e5';
      ctx.font = "700 7.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      metaAnoAnterior.data.forEach((bar,i)=>{
        const economia = esteAnoAlinhado[i] - anoAnteriorAlinhado[i]; // sempre <=0 (negativo = economizou)
        if(economia===null || economia===undefined || isNaN(economia)) return;
        ctx.fillText((economia>=0?'+':'')+Math.round(economia), bar.x, bar.y - 14);
      });
      ctx.restore();
    }
  };

  observeAndRenderChart($('cEnergiaSolar'), () => new Chart($('cEnergiaSolar'), {
    type:'bar',
    plugins:[energiaBarLabelPlugin],
    data:{labels:mesesParesEnergia,
      datasets:[
        {label:'Ano anterior (real, sem solar)', data:anoAnteriorAlinhado, backgroundColor:'#e8a63a', borderRadius:3},
        {label:'Este ano (com solar)', data:esteAnoAlinhado, backgroundColor:esteAnoFonteAlinhado.map(e=>e && e.fonte==='real' ? '#1f9d66' : '#34c98a'), borderRadius:3}
      ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:legendStd2,tooltip:{callbacks:{
        label:c=>{
          if(c.datasetIndex===1){
            const fonteObj = esteAnoFonteAlinhado[c.dataIndex];
            const f = fonteObj ? fonteObj.fonte : null;
            const rotulo = f==='real' ? ' (fatura real)' : f==='calculado' ? ' (geração real)' : ' (projeção)';
            return c.dataset.label+rotulo+': '+fmt(c.raw);
          }
          return c.dataset.label+': '+fmt(c.raw);
        },
        afterLabel:c=>{
          if(c.datasetIndex!==1) return '';
          const economia = anoAnteriorAlinhado[c.dataIndex] - esteAnoAlinhado[c.dataIndex];
          return 'Economia: '+fmt(economia);
        }
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.6,barPercentage:0.75},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  }));
  // CORRIGIDO 03/08/2026: era anoAnterior[0]/esteAno[0] (sempre Jul, nunca avançava) - agora usa o
  // indice 0 do array JA ALINHADO, que corresponde ao mes atual de verdade (mesesParesEnergia[0]).
  const economiaAtual = anoAnteriorAlinhado[0] - esteAnoAlinhado[0];
  const economiaAnualEstimada = anoAnteriorAlinhado.reduce((s,v)=>s+(v||0),0) - esteAnoAlinhado.reduce((s,v)=>s+(v||0),0);
  const legEnergiaEl = $('legEnergiaSolar');
  if(legEnergiaEl){
    const mesAtualLabel = mesesParesEnergia[0];
    const fonteAtual = esteAnoFonteAlinhado[0];
    legEnergiaEl.innerHTML = 'Mês atual ('+mesAtualLabel+'/26): ano anterior <strong style="color:#e8a63a">'+fmt(anoAnteriorAlinhado[0])+'</strong> vs. este ano <strong style="color:#34c98a">'+fmt(esteAnoAlinhado[0])+'</strong> ('+(fonteAtual && fonteAtual.fonte==='real'?'fatura real':'baseado na geração real do medidor')+') → economia de <strong style="color:#3987e5">'+fmt(economiaAtual)+'</strong> no mês. Projeção de economia nos 12 meses: <strong style="color:#3987e5">'+fmt(economiaAnualEstimada)+'</strong>. Toque numa barra pro valor exato e a fonte (real/calculado/projeção).';
  }

  // NOVO 01/08/2026 (pedido do usuario): estimativa de fatura residual pos-solar por unidade,
  // 100% AUTOMATICA - nunca mais numero digitado. Formula completa (residual = o que voce paga MESMO
  // com creditos cobrindo 100% do consumo):
  //   1) Custo de Disponibilidade (piso que nunca zera, nem com credito de sobra) = kWh minimo da
  //      ligacao (30 monofasica / 50 bi-trifasica) x tarifa real da unidade (fatura_base/consumo_kwh)
  //   2) Fio B (cobrado sobre a fatia da Distribuicao que a lei NAO deixa compensar) = fatura_base x
  //      pct_distribuicao x (FIO_B_COBRANCA_2026_PCT/100) x (FIO_B_PCT_DA_DISTRIBUICAO/100)
  //   3) Iluminacao Publica (COSIP) = fatura_base x pct_iluminacao - nunca compensada, por lei
  //   4) Encargos setoriais = fatura_base x pct_encargos - nao compensados pelos creditos de GD
  // Mesma logica ja usada isoladamente pro apartamento (VARS.taxaMinimaEnergisa/consumoMinimoComSolarKwh,
  // ver secao 09) - generalizada aqui pras 3 unidades com a tarifa real de cada uma.
  const residualTbodyEl = $('residualPosSolarTbody');
  if(residualTbodyEl){
    const comp = VARS.ENERGISA_TARIFA_COMPOSICAO || {};
    const fioBFracaoDaDistribuicao = (VARS.FIO_B_COBRANCA_2026_PCT/100) * (VARS.FIO_B_PCT_DA_DISTRIBUICAO/100); // 0,168
    const unidades = [
      { chave:'apartamento_wallace', nome:'Apartamento (Wallace)', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
      { chave:'casa_wellida', nome:'Casa da Wellida', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
      { chave:'casa_mae', nome:'Casa da Mãe (geradora)', kwhMinimo: 30 }, // CONFIRMADO 01/08/2026 pelo usuario: ligacao monofasica
    ];
    const linhas = unidades.map(u => {
      const d = comp[u.chave];
      if(!d) return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">dados insuficientes</td></tr>`;
      const faturaBase = d.historico ? d.historico.jul26 : d.fatura_jul26_valor;
      const consumoKwh = d.consumo_kwh || d.fatura_jul26_consumo_kwh;
      const pct = d.composicao_pct || {};
      if(faturaBase === undefined || !consumoKwh) return `<tr><td>${u.nome}</td><td colspan="3" style="color:var(--text-dim);font-style:italic">dados insuficientes</td></tr>`;
      const tarifaReal = faturaBase / consumoKwh;
      const custoDisponibilidade = Math.round(u.kwhMinimo * tarifaReal * 100) / 100;
      const fioBValor = Math.round(faturaBase * (pct.distribuicao||0)/100 * fioBFracaoDaDistribuicao * 100) / 100;
      const iluminacaoValor = Math.round(faturaBase * (pct.iluminacao||0)/100 * 100) / 100;
      const encargosValor = Math.round(faturaBase * (pct.encargos||0)/100 * 100) / 100;
      const residual = Math.round((custoDisponibilidade + fioBValor + iluminacaoValor + encargosValor) * 100) / 100;
      const economia = Math.round((faturaBase - residual) * 100) / 100;
      const economiaPct = Math.round((economia/faturaBase)*1000)/10;
      const detalhe = `Disponibilidade ${fmt(custoDisponibilidade)} + Fio B ${fmt(fioBValor)} + Iluminação ${fmt(iluminacaoValor)} + Encargos ${fmt(encargosValor)}`;
      return `<tr><td>${u.nome}</td><td class="r">${fmt(faturaBase)}</td><td class="r" style="color:var(--red)" title="${detalhe}">${fmt(residual)}</td><td class="r" style="color:var(--green)">${fmt(economia)} (${economiaPct}%)</td></tr>`;
    }).join('');
    residualTbodyEl.innerHTML = `<table><thead><tr><th>Unidade</th><th class="r">Fatura base (pré-solar)</th><th class="r">Residual estimado/mês</th><th class="r">Economia estimada</th></tr></thead><tbody>${linhas}</tbody></table>`;
  }



  // REESTRUTURADO 01/08/2026 (V231, pedido do usuario): "montar o grafico 10 por mes, usando o
  // consumo dos ultimos 12 meses como consumo ate eu atualizar o real". Antes cada barra era uma
  // LEITURA (cumulativa desde ativacao); agora cada barra e um MES do calendario (mesmo eixo Jul..Jun
  // da secao 09), e cada mes recebe:
  // - Consumo Wallace: reaproveita kwhAnoAnterior (consumo REAL do apartamento nos ultimos 12 meses,
  //   ja usado na secao 09) como estimativa de referencia - Wallace pediu explicitamente pra usar isso
  //   como base "ate eu atualizar o real" (quando ele tiver consumo pos-solar de fato medido).
  // - Consumo Irma: consumoDiarioIrma x 30 (nao ha historico mensal dela ainda, so a media fixa).
  // - Credito Wallace/Irma: derivado das leituras reais (SOLAR_LEITURAS), agrupadas por CICLO DE
  //   LEITURA da Energisa (nao mais mes de calendario - CORRIGIDO 03/08/2026, pedido do usuario:
  //   "a conta de julho ja foi paga, o credito deve ir todo pra agosto"). A Casa da Mae (onde fica a
  //   usina) fecha o ciclo no MESMO dia que a Wellida - dia 8 (confirmado pelo usuario 03/08/2026,
  //   ver DIA_LEITURA_WELLIDA mais abaixo, secao Previsao). Uma leitura feita dia D pertence ao ciclo
  //   que fecha no dia 8 seguinte (se D<=8, fecha no dia 8 do MESMO mes; se D>8, fecha no dia 8 do
  //   mes SEGUINTE) - e esse mes de fechamento e o "rotulo" usado no grafico, pois e o mes em que a
  //   fatura de fato reflete aquele credito. Ativacao (21/07) cai no ciclo que fecha em 08/08 -> todo
  //   credito gerado desde a ativacao entra no rotulo "Ago", nada fica em "Jul" (ciclo de julho ja
  //   tinha fechado e a fatura ja foi paga antes da usina existir).
  const CICLO_DIA_LEITURA_GERACAO = 8; // dia oficial de leitura Energisa da Casa da Mae - mesmo ciclo da Wellida
  function mesFechamentoCiclo(dataStr){
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    let m = dia <= CICLO_DIA_LEITURA_GERACAO ? mes : mes + 1;
    if(m > 12) m = 1;
    return m; // 1-12, mes em que o ciclo de leitura FECHA (mes que a fatura reflete)
  }
  const solarL = VARS.SOLAR_LEITURAS_CALC;
  const ultimaSolar = solarL[solarL.length-1];
  // CORRIGIDO 03/08/2026 (2ª rodada - achado do usuário com print real, "continua errado"): a v1 desta
  // correção só tinha alinhado ROTULO=DADO usando mesAtivacao (Jul, mês de CALENDÁRIO da ativação) como
  // âncora comum - isso deixava "Jul" sempre como 1ª coluna, vazia, e "Ago" só aparecia na 2ª posição.
  // Tecnicamente alinhado (dado batia com rótulo), mas visualmente ainda "errado" pro que foi pedido:
  // já que nada pertence ao ciclo de julho (pago antes da usina existir), ele nem deveria aparecer -
  // Ago tem que ser a PRIMEIRA coluna. Corrigido de vez: a âncora agora é o CICLO DE LEITURA (mês em
  // que o 1º ciclo FECHA = Ago), usada tanto pro agrupamento dos dados quanto pros rótulos - a mesma
  // variável em 1 lugar só, nunca mais duas âncoras diferentes pra a mesma coisa.
  const ANCHOR_SOLAR_ANO = Number(VARS.solarDataAtivacao.split('-')[0]);
  const ANCHOR_SOLAR_MES_CICLO = mesFechamentoCiclo(VARS.solarDataAtivacao); // 8 = Ago/2026 - unica ancora, usada em TUDO abaixo (dados E rotulos)
  const leituraMaisRecentePorMes = {}; // {indiceMes 0-11: leitura com maior creditoLiquido acumulado naquele CICLO}
  solarL.forEach(l=>{
    const mesLeitura = mesFechamentoCiclo(l.data);
    const idx = (mesLeitura - ANCHOR_SOLAR_MES_CICLO + 12) % 12; // idx0 = Ago (1º ciclo), nao mais Jul
    if(!leituraMaisRecentePorMes[idx] || l.creditoLiquido > leituraMaisRecentePorMes[idx].creditoLiquido) leituraMaisRecentePorMes[idx] = l;
  });

  // NOVO 03/08/2026 (pedido do usuario: "esses graficos devem andar pra frente automatico como o
  // grafico de necessidade"): mesmo padrao ja usado la (alignSeriesCiclo/ciclosDesdeAncoraCiclo,
  // topo do arquivo) - so que aqui a ancora e o CICLO DE LEITURA (dia 8), nao o ciclo financeiro
  // (dia 25). So afeta a CAMADA DE APRESENTACAO (labels/dados dos 2 graficos abaixo) - nao mexe nos
  // arrays originais (creditoMensalWallace etc), que continuam servindo o texto/legenda como antes.
  function offsetCiclosSolar(){
    const hoje = new Date();
    const inicioCicloAtual = hoje.getDate() > CICLO_DIA_LEITURA_GERACAO
      ? new Date(hoje.getFullYear(), hoje.getMonth()+1, 1)
      : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return (inicioCicloAtual.getFullYear()-ANCHOR_SOLAR_ANO)*12 + (inicioCicloAtual.getMonth()+1-ANCHOR_SOLAR_MES_CICLO);
  }
  const OFFSET_SOLAR = Math.max(0, offsetCiclosSolar());
  const MESES_ABREV_SOLAR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function gerarRotulosSolar(){
    const labels = [];
    for(let i=0;i<12;i++){
      const idxMes = ((ANCHOR_SOLAR_MES_CICLO - 1 + OFFSET_SOLAR + i) % 12 + 12) % 12; // MESMA ancora dos dados (Ago)
      labels.push(MESES_ABREV_SOLAR[idxMes]);
    }
    return labels;
  }
  function alignSolar(series){
    if(OFFSET_SOLAR<=0) return series.slice();
    const shifted = series.slice(OFFSET_SOLAR);
    while(shifted.length < series.length) shifted.push(null); // futuro sem dado real - nunca estimar (regra V250)
    return shifted;
  }
  const mesesParesSolar = gerarRotulosSolar(); // rotulos que os 2 graficos abaixo (Rede Energisa/Rateio) usam - "andam" sozinhos conforme os ciclos passam


  let creditoAcumAnterior = 0, leitura03Anterior = 0, leitura103Anterior = 0, diasAcumAnterior = 0, geracaoAcumAnterior = null;
  const creditoMensalWallace = [], creditoMensalIrma = [], temLeituraNoMes = [];
  // CORRIGIDO 01/08/2026 (V250, documento "SEM ESTIMATIVAS"): consumo direto mensal agora deriva da
  // GERACAO REAL do inversor SAJ (delta mes-a-mes de geracaoAcumulada), nunca mais da estimativa fixa
  // solarGeracaoDiariaEstimada. Sem leitura real de geracao em 2 meses consecutivos, fica null (sem
  // barra) em vez de estimar.
  const importadoMensal = [], exportadoMensal = [], geracaoEstMensal = [], consumoDiretoMensal = [], saldoLiquidoMensal = [];
  // NOVO 03/08/2026: rastreia quais meses tiveram o consumo direto CONGELADO (ver logica abaixo) -
  // usado pra montar o aviso automatico na legenda do grafico.
  const consumoDiretoCongeladoMes = [];
  let ultimoConsumoDiretoValido = null; // carrega o ultimo valor >=0 confirmado, mes a mes
  for(let i=0;i<12;i++){
    const l = leituraMaisRecentePorMes[i];
    if(l){
      const creditoDoMes = Math.round((l.creditoLiquido - creditoAcumAnterior)*100)/100;
      creditoMensalWallace.push(Math.round(creditoDoMes*VARS.solarRateioWallace*100)/100);
      creditoMensalIrma.push(Math.round(creditoDoMes*VARS.solarRateioIrma*100)/100);
      const importadoDoMes = Math.round((l.leitura03 - leitura03Anterior)*100)/100;
      const exportadoDoMes = Math.round((l.leitura103 - leitura103Anterior)*100)/100;
      const temGeracaoReal = l.geracaoAcumulada!=null && geracaoAcumAnterior!=null;
      const geracaoDoMes = temGeracaoReal ? Math.round((l.geracaoAcumulada - geracaoAcumAnterior)*100)/100 : null;
      const consumoDiretoBruto = temGeracaoReal ? Math.round((geracaoDoMes - exportadoDoMes)*100)/100 : null;
      // CORRIGIDO 03/08/2026 (achado do usuário, gráfico "Rede Energisa") — REVISADO na mesma data
      // (usuário não gostou de esconder a barra): consumo direto negativo é fisicamente impossível -
      // só acontece quando a automação SAJ (geração) e a leitura manual do 103 (exportado) estão
      // dessincronizadas no tempo. Em vez de null (barra some), agora CONGELA no último valor válido
      // (>=0) já confirmado e marca o mês em consumoDiretoCongeladoMes[] - a legenda automática abaixo
      // do gráfico avisa quais meses estão "presos" nesse estado, sem esconder informação nenhuma.
      let consumoDiretoDoMes;
      if(consumoDiretoBruto!=null && consumoDiretoBruto < 0){
        consumoDiretoDoMes = ultimoConsumoDiretoValido; // pode ser null ainda se nunca teve um valor valido antes
        consumoDiretoCongeladoMes.push(true);
      } else {
        consumoDiretoDoMes = consumoDiretoBruto;
        consumoDiretoCongeladoMes.push(false);
        if(consumoDiretoBruto!=null) ultimoConsumoDiretoValido = consumoDiretoBruto;
      }
      importadoMensal.push(importadoDoMes);
      exportadoMensal.push(exportadoDoMes);
      geracaoEstMensal.push(geracaoDoMes);
      consumoDiretoMensal.push(consumoDiretoDoMes);
      saldoLiquidoMensal.push(creditoDoMes);
      creditoAcumAnterior = l.creditoLiquido;
      leitura03Anterior = l.leitura03;
      leitura103Anterior = l.leitura103;
      diasAcumAnterior = l.dias;
      geracaoAcumAnterior = l.geracaoAcumulada;
      temLeituraNoMes.push(true);
    } else {
      creditoMensalWallace.push(null);
      creditoMensalIrma.push(null);
      importadoMensal.push(null);
      exportadoMensal.push(null);
      geracaoEstMensal.push(null);
      consumoDiretoMensal.push(null);
      consumoDiretoCongeladoMes.push(false);
      saldoLiquidoMensal.push(null);
      temLeituraNoMes.push(false);
    }
  }
  const consumoMensalWallace = kwhAnoAnterior; // consumo real dos ultimos 12 meses (mesma base da secao 09)
  const consumoMensalIrma = VARS.solarConsumoIrmaAnoAnterior; // consumo REAL dos ultimos 12 meses (fatura Energisa), mesma logica do kwhAnoAnterior do Wallace

  // NOVO 02/08/2026 (pedido EXPLICITO do usuario - o texto sozinho na Unidade Geradora nao bastava,
  // "só a nota não é o impacto do gráfico"): a barra do MES CALENDARIO ATUAL no grafico 11 (Rateio
  // Solar) tambem precisa refletir o valor calculado (geracao real do inversor - consumo medio da
  // casa), nao so ficar parada na ultima leitura real parcial daquele mes. Mesma formula/regra da
  // estimativa da Unidade Geradora: some pra dentro deste grafico especifico, nao muda o dado bruto
  // (SOLAR_LEITURAS continua 100% real) - so a exibicao desta barra.
  if(ultimaSolar && ultimaSolar.geracaoAcumulada != null && diasAcumAnterior >= 0){
    const hojeChart = new Date();
    const hojeSoDataChart = new Date(Date.UTC(hojeChart.getFullYear(), hojeChart.getMonth(), hojeChart.getDate()));
    const dataUltimaLeituraChart = new Date(ultimaSolar.data);
    const diasDesdeLeituraChart = Math.max(0, Math.round((hojeSoDataChart - dataUltimaLeituraChart) / 86400000));
    if(diasDesdeLeituraChart > 0){
      const diasDesdeAtivacaoChart = ultimaSolar.dias;
      const geracaoMediaDiariaChart = diasDesdeAtivacaoChart > 0 ? ultimaSolar.geracaoAcumulada / diasDesdeAtivacaoChart : 0;
      const consumoMedioMensalMaeChart = VARS.solarConsumoMaeAnoAnterior.reduce((s,v)=>s+v,0) / VARS.solarConsumoMaeAnoAnterior.length;
      const consumoMedioDiarioMaeChart = consumoMedioMensalMaeChart / 30;
      const saldoTotalEstimadoChart = ultimaSolar.creditoLiquido + diasDesdeLeituraChart * (geracaoMediaDiariaChart - consumoMedioDiarioMaeChart);

      const mesAtualCalendario = mesFechamentoCiclo(hojeSoDataChart.toISOString().slice(0,10)); // CORRIGIDO 03/08/2026: era mes calendario puro (hojeChart.getMonth()+1) - agora usa o ciclo de leitura (dia 8), consistente com o resto deste grafico
      const idxMesAtual = (mesAtualCalendario - ANCHOR_SOLAR_MES_CICLO + 12) % 12; // CORRIGIDO 03/08/2026: mesma ancora unica (Ago)
      // credito acumulado ATE O FIM DO CICLO ANTERIOR (ultima leitura de um ciclo diferente do atual)
      let creditoAcumAntesDoMesAtual = 0;
      solarL.forEach(l => {
        const mesDaLeitura = mesFechamentoCiclo(l.data); // CORRIGIDO 03/08/2026: era mes calendario puro
        if(mesDaLeitura !== mesAtualCalendario) creditoAcumAntesDoMesAtual = l.creditoLiquido;
      });
      const creditoDoMesAtualEstimado = Math.round((saldoTotalEstimadoChart - creditoAcumAntesDoMesAtual) * 100) / 100;
      creditoMensalWallace[idxMesAtual] = Math.round(creditoDoMesAtualEstimado * VARS.solarRateioWallace * 100) / 100;
      creditoMensalIrma[idxMesAtual] = Math.round(creditoDoMesAtualEstimado * VARS.solarRateioIrma * 100) / 100;
      temLeituraNoMes[idxMesAtual] = true;
    }
  }

  // ===== CORRIGIDO 01/08/2026 (V250): Unidade Geradora SEM ESTIMATIVAS (documento do usuário) =====
  // Antes: consumo direto derivado de uma geracao ESTIMADA (25,6 kWh/dia fixo). Usuario pediu para
  // eliminar qualquer estimativa - agora so calcula quando existir leitura REAL de geracaoAcumulada
  // (inversor SAJ). Sem esse dado, os campos dependentes mostram "Dados insuficientes para calculo"
  // em vez de estimar - nunca mais inventar um numero.
  const avisosConsistenciaEl = $('ugAvisosConsistencia');
  if(avisosConsistenciaEl && VARS.SOLAR_AVISOS_CONSISTENCIA.length){
    avisosConsistenciaEl.style.display = 'block';
    avisosConsistenciaEl.innerHTML = '⚠️ <strong>Possível erro de leitura detectado:</strong><br>' + VARS.SOLAR_AVISOS_CONSISTENCIA.join('<br>');
  }
  if(ultimaSolar){
    const importadoAcum = ultimaSolar.leitura03;
    const exportadoAcum = ultimaSolar.leitura103;
    const saldoLiquidoAcum = ultimaSolar.creditoLiquido;
    const geracaoAcum = ultimaSolar.geracaoAcumulada; // null ate o usuario informar a leitura real do inversor
    const temGeracao = geracaoAcum !== null && geracaoAcum !== undefined;
    // NOVO 01/08/2026 (V259, achado do usuário): geracaoAcumulada agora e atualizada sozinha todo dia
    // pelo robo da SAJ, mas leitura03/leitura103 (medidor Energisa) so mudam quando o usuario manda
    // foto nova. Sem checagem, o descompasso entre as duas datas cresce sozinho e o calculo de
    // consumo direto fica cada vez mais errado (geracao "andando" sem o 103 acompanhar). Avisa
    // quando a diferenca passar de 3 dias - a partir dai o erro comeca a pesar de verdade.
    if(temGeracao && ultimaSolar.geracaoAcumuladaData){
      const diasDescompasso = Math.round((new Date(ultimaSolar.geracaoAcumuladaData) - new Date(ultimaSolar.data)) / 86400000);
      if(diasDescompasso >= 3){
        VARS.SOLAR_AVISOS_CONSISTENCIA.push(`A geração (atualizada automaticamente em ${ultimaSolar.geracaoAcumuladaData}) está ${diasDescompasso} dias à frente da última leitura 03/103 do medidor (${ultimaSolar.data}) — o cálculo de consumo direto/autoconsumo está ficando impreciso. Manda uma leitura nova do medidor pra recalibrar.`);
        if(avisosConsistenciaEl){
          avisosConsistenciaEl.style.display = 'block';
          avisosConsistenciaEl.innerHTML = '⚠️ <strong>Possível erro de leitura detectado:</strong><br>' + VARS.SOLAR_AVISOS_CONSISTENCIA.join('<br>');
        }
      }
    }

    const setUG = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
    const INSUFICIENTE = 'Dados insuficientes para cálculo.';

    setUG('ugImportado', importadoAcum+' kWh');
    setUG('ugExportado', exportadoAcum+' kWh');
    setUG('ugSaldoLiquido', (saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh');
    const ugSaldoEl = $('ugSaldoLiquido');
    if(ugSaldoEl) ugSaldoEl.style.color = saldoLiquidoAcum>=0 ? '#34c98a' : '#e2554f';

    // NOVO 02/08/2026 (pedido EXPLICITO do usuario, reversao PONTUAL da regra "SEM ESTIMATIVAS" de
    // V250 - só pra este campo, com autorizacao clara, documentada, mesma logica ja aceita pra
    // projecao de salario/bonus): saldo liquido ESTIMADO pro dia de hoje, pra o numero nao ficar
    // "parado" entre leituras manuais do medidor. Formula: parte do ultimo saldo REAL (leitura103-
    // leitura03) e soma (geracao media diaria - consumo medio diario da Casa da Mae) x dias desde
    // a ultima leitura. SEMPRE e so uma estimativa - a leitura real, quando chegar, sobrescreve tudo
    // (mesma regra "fatura sempre vence" usada em todo o resto do sistema). Nunca usado como fonte
    // pro rateio da secao 11 (isso continua 100% real) - so exibido aqui, claramente rotulado.
    const hoje = new Date();
    // CORRIGIDO 02/08/2026 (achado do usuário): comparar Date completo (com hora) contra uma data
    // pura tipo '2026-08-01' inflava a contagem de dias - '2026-08-01' vira meia-noite UTC, e "hoje"
    // (com hora local, ex: 19h) já passa de 1,5 dia de diferença de tarde pra frente, arredondando
    // pra 2 mesmo sendo só "ontem pra hoje" (1 dia de calendário). Corrigido comparando só a DATA
    // (sem hora) dos dois lados.
    const hojeSoData = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
    const dataUltimaLeitura = new Date(ultimaSolar.data);
    const diasDesdeLeitura = Math.max(0, Math.round((hojeSoData - dataUltimaLeitura) / 86400000));
    const diasDesdeAtivacao = ultimaSolar.dias; // dias desde 21/07/2026 ate a ultima leitura
    const geracaoMediaDiaria = diasDesdeAtivacao > 0 ? geracaoAcum / diasDesdeAtivacao : 0;
    const consumoMedioMensalMae = VARS.solarConsumoMaeAnoAnterior.reduce((s,v)=>s+v,0) / VARS.solarConsumoMaeAnoAnterior.length;
    const consumoMedioDiarioMae = consumoMedioMensalMae / 30;
    const saldoLiquidoEstimado = temGeracao
      ? Math.round((saldoLiquidoAcum + diasDesdeLeitura * (geracaoMediaDiaria - consumoMedioDiarioMae)) * 100) / 100
      : null;

    const ugEstimativaEl = $('ugSaldoLiquidoEstimado');
    if(ugEstimativaEl){
      if(saldoLiquidoEstimado !== null && diasDesdeLeitura > 0){
        ugEstimativaEl.style.display = 'block';
        ugEstimativaEl.innerHTML = `📊 Estimativa pra hoje: <strong style="color:${saldoLiquidoEstimado>=0?'#34c98a':'#e2554f'}">${saldoLiquidoEstimado>=0?'+':''}${saldoLiquidoEstimado} kWh</strong> (${diasDesdeLeitura} dia(s) desde a última leitura do medidor, calculado automaticamente com base na geração real do inversor − consumo médio da casa) — <strong>é estimativa, não leitura real</strong>; sempre que você mandar uma foto nova do medidor, o valor real substitui essa estimativa. Não precisa mandar leitura todo dia — isso aqui só preenche o intervalo sozinho.`;
      } else {
        ugEstimativaEl.style.display = 'none';
      }
    }

    // CORRIGIDO 02/08/2026 (achado do usuário, achado direto no resumo em texto): consumoDireto =
    // geracaoAcum - exportadoAcum assume SILENCIOSAMENTE que 100% da geracao nova (desde a ultima
    // leitura) vira consumo direto, ZERO vira exportacao nova - suposicao que fica cada vez mais
    // errada quanto mais dias passam sem leitura nova (na vida real, parte da geracao nova
    // certamente esta sendo exportada tambem, so que isso nao aparece ate o usuario atualizar
    // leitura103). Antes disso nunca ficava explicito - o numero so ia "crescendo errado" sem avisar.
    // Agora: alem do aviso ja existente (>=3 dias), TRAVA o calculo em INSUFICIENTE quando o
    // descompasso passar de um limite seguro (10 dias) - depois disso a distorcao pesa demais pra
    // continuar mostrando como se fosse dado confiavel. Os campos "reais" (importado/exportado/saldo
    // liquido, mais a estimativa explicita acima) continuam normalmente, so esses 5 derivados travam.
    const LIMITE_DIAS_DESCOMPASSO_SEGURO = 10;
    const diasDescompassoAtual = (temGeracao && ultimaSolar.geracaoAcumuladaData)
      ? Math.round((new Date(ultimaSolar.geracaoAcumuladaData) - new Date(ultimaSolar.data)) / 86400000)
      : 0;
    const consumoDiretoConfiavel = temGeracao && diasDescompassoAtual < LIMITE_DIAS_DESCOMPASSO_SEGURO;

    let consumoDiretoAcum=null, consumoTotalCasa=null, autoconsumoPct=null, dependenciaPct=null, exportacaoDaGeracaoPct=null;
    if(consumoDiretoConfiavel){
      consumoDiretoAcum = Math.round((geracaoAcum - exportadoAcum)*100)/100;
      consumoTotalCasa = Math.round((consumoDiretoAcum + importadoAcum)*100)/100;
      autoconsumoPct = consumoTotalCasa>0 ? Math.round(consumoDiretoAcum/consumoTotalCasa*1000)/10 : 0;
      dependenciaPct = consumoTotalCasa>0 ? Math.round(importadoAcum/consumoTotalCasa*1000)/10 : 0;
      exportacaoDaGeracaoPct = geracaoAcum>0 ? Math.round(exportadoAcum/geracaoAcum*1000)/10 : 0;
    }
    const DESATUALIZADO = `Leitura do medidor desatualizada há ${diasDescompassoAtual} dias — manda uma foto nova pra recalcular.`;
    const consumoMsg = temGeracao ? (consumoDiretoConfiavel ? null : DESATUALIZADO) : INSUFICIENTE;
    setUG('ugGeracaoAcumulada', temGeracao ? geracaoAcum+' kWh' : INSUFICIENTE);
    setUG('ugConsumoDireto', consumoDiretoConfiavel ? consumoDiretoAcum+' kWh' : consumoMsg);
    setUG('ugConsumoTotalCasa', consumoDiretoConfiavel ? consumoTotalCasa+' kWh' : consumoMsg);
    setUG('ugAutoconsumoPct', consumoDiretoConfiavel ? autoconsumoPct+'%' : consumoMsg);
    setUG('ugDependenciaPct', consumoDiretoConfiavel ? dependenciaPct+'%' : consumoMsg);
    setUG('ugExportacaoPct', consumoDiretoConfiavel ? exportacaoDaGeracaoPct+'%' : consumoMsg);

    // Status: so usa dado 100% real (saldo liquido = 103-03), nao depende da geracao do inversor
    let statusUG = {emoji:'🔴', texto:'Déficit', cor:'#e2554f'};
    if(saldoLiquidoAcum > 0) statusUG = {emoji:'🟢', texto:'Excedente (exportando mais do que importa)', cor:'#34c98a'};
    else if(saldoLiquidoAcum === 0) statusUG = {emoji:'🟡', texto:'Equilibrado', cor:'#e8a63a'};
    const ugStatusEl = $('ugStatus');
    if(ugStatusEl){ ugStatusEl.textContent = statusUG.emoji+' '+statusUG.texto; ugStatusEl.style.color = statusUG.cor; }

    const ugResumoEl = $('ugResumo');
    if(ugResumoEl){
      if(consumoDiretoConfiavel){
        ugResumoEl.innerHTML = 'A casa consumiu <strong>'+consumoTotalCasa+' kWh</strong> neste período (desde 21/07, '+ultimaSolar.dias+' dias). <strong style="color:#34c98a">'+consumoDiretoAcum+' kWh ('+autoconsumoPct+'%)</strong> foram atendidos diretamente pelas placas. <strong style="color:#e8a63a">'+importadoAcum+' kWh ('+dependenciaPct+'%)</strong> vieram da Energisa. A usina exportou <strong>'+exportadoAcum+' kWh</strong> ('+exportacaoDaGeracaoPct+'% de tudo que gerou). Saldo líquido produzido: <strong style="color:'+(saldoLiquidoAcum>=0?'#34c98a':'#e2554f')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong> — é esse saldo que alimenta o rateio da seção 11, abaixo.';
      } else if(temGeracao){
        // CORRIGIDO 02/08/2026 (achado do usuário): antes disso, se temGeracao=true o resumo sempre
        // calculava consumoDireto/autoconsumo misturando geracao viva com exportado congelado, sem
        // limite - agora que existe o travamento por dias de descompasso, esse ramo intermediario
        // cobre "tem geracao mas o descompasso ja passou do limite seguro" - mostra so o que e 100%
        // real (importado/exportado/saldo liquido), sem fingir precisao no consumo direto.
        ugResumoEl.innerHTML = '<strong style="color:#e8a63a">Consumo direto/autoconsumo pausado</strong> — a leitura do medidor está desatualizada há <strong>'+diasDescompassoAtual+' dias</strong> (mais que o limite seguro de '+LIMITE_DIAS_DESCOMPASSO_SEGURO+'), então parei de calcular esses campos pra não mostrar número cada vez mais errado. Importado (<strong>'+importadoAcum+' kWh</strong>), exportado (<strong>'+exportadoAcum+' kWh</strong>) e saldo líquido (<strong style="color:'+(saldoLiquidoAcum>=0?'#34c98a':'#e2554f')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong>) continuam corretos (vêm do medidor bidirecional) — isso já alimenta o rateio da seção 11 normalmente. Manda uma leitura nova do 03/103 pra recalibrar tudo.';
      } else {
        ugResumoEl.innerHTML = '<strong style="color:#e8a63a">Dados insuficientes para calcular consumo direto/autoconsumo/dependência</strong> — falta a leitura real de geração acumulada do inversor SAJ. Importado (<strong>'+importadoAcum+' kWh</strong>), exportado (<strong>'+exportadoAcum+' kWh</strong>) e saldo líquido (<strong style="color:'+(saldoLiquidoAcum>=0?'#34c98a':'#e2554f')+'">'+(saldoLiquidoAcum>=0?'+':'')+saldoLiquidoAcum+' kWh</strong>) continuam corretos (vêm do medidor bidirecional) — isso já alimenta o rateio da seção 11 normalmente.';
      }
    }

    // Historico mes a mes (03, 103, consumo direto real, saldo liquido) - so plota consumo direto
    // quando existir geracaoAcumulada real naquele mes (senao fica null, sem barra - mesmo padrao
    // ja usado pros meses sem leitura de credito).
    observeAndRenderChart($('cUnidadeGeradora'), () => new Chart($('cUnidadeGeradora'), {
      type:'bar',
      data:{labels:mesesParesSolar,
        datasets:[
          {label:'Importado (código 03)', data:alignSolar(importadoMensal), backgroundColor:'#e2554f', borderRadius:3},
          {label:'Consumo direto (real)', data:alignSolar(consumoDiretoMensal), backgroundColor:'#e8a63a', borderRadius:3},
          {label:'Exportado (código 103)', data:alignSolar(exportadoMensal), backgroundColor:'#3987e5', borderRadius:3},
          {label:'Saldo líquido', data:alignSolar(saldoLiquidoMensal), backgroundColor:'#34c98a', borderRadius:3}
        ]},
      options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22}},
        plugins:{legend:legendStd2,tooltip:{callbacks:{
          label:c=>{
            if(c.raw===null) return c.dataset.label+': sem dado ainda';
            return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh';
          }
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.9,barPercentage:0.35},
          y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
    }));
    // NOVO 03/08/2026: aviso automatico dos meses com "Consumo direto" CONGELADO (dessincronia entre
    // a automacao SAJ e a leitura manual do 103 - ver logica acima). Usa os MESMOS rotulos ja
    // deslocados (mesesParesSolar) pra apontar o mes certo, mesmo apos o grafico "andar pra frente".
    const legCongeladoEl = $('legConsumoDiretoCongelado');
    if(legCongeladoEl){
      const congeladoAlinhado = alignSolar(consumoDiretoCongeladoMes);
      const mesesCongelados = mesesParesSolar.filter((_,i)=>congeladoAlinhado[i]===true);
      legCongeladoEl.textContent = mesesCongelados.length
        ? '⚠️ Consumo direto CONGELADO no último valor confiável em: '+mesesCongelados.join(', ')+' — a automação SAJ e a leitura manual do código 103 ficaram dessincronizadas nesses meses; assim que uma leitura nova resolver isso, o valor volta a atualizar sozinho.'
        : '';
    }
  }

  const solarBarLabelPlugin = {
    id:'solarBarLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "600 6.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      chart.data.datasets.forEach((ds,di)=>{
        const meta = chart.getDatasetMeta(di);
        ctx.fillStyle = ds.backgroundColor;
        meta.data.forEach((bar,i)=>{
          const v = ds.data[i];
          if(v===null || v===undefined) return;
          ctx.fillText(v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}), bar.x, bar.y - 4);
        });
      });
      ctx.restore();
    }
  };
  observeAndRenderChart($('cSolarRateio'), () => new Chart($('cSolarRateio'), {
    type:'bar',
    plugins:[solarBarLabelPlugin],
    data:{labels:mesesParesSolar,
      datasets:[
        {label:'Crédito Wallace (gerado)', data:alignSolar(creditoMensalWallace), backgroundColor:'#34c98a', borderRadius:3},
        {label:'Consumo esperado Wallace', data:alignSolar(consumoMensalWallace), backgroundColor:'#f0c94a', borderRadius:3},
        {label:'Crédito Irmã (gerado)', data:alignSolar(creditoMensalIrma), backgroundColor:'#1c7a54', borderRadius:3},
        {label:'Consumo esperado Irmã', data:alignSolar(consumoMensalIrma), backgroundColor:'#a9861f', borderRadius:3}
      ]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:30,bottom:8}},
      plugins:{legend:legendStd2,tooltip:{callbacks:{
        label:c=>{
          if(c.raw===null) return c.dataset.label+': sem leitura ainda';
          const nota = (c.datasetIndex===0 && !temLeituraNoMes[c.dataIndex]) ? '' : '';
          return c.dataset.label+': '+c.raw.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh'+(c.datasetIndex%2===1?' (estimado, consumo histórico)':'');
        }
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9.5}},categoryPercentage:0.9,barPercentage:0.35},
        y:{grid:{color:grid2},ticks:{callback:v=>v+' kWh',font:{size:9.5}}}}}
  }));
  const legSolarEl = $('legSolarRateio');
  if(legSolarEl && ultimaSolar){
    const mesesComLeitura = temLeituraNoMes.filter(Boolean).length;
    const avisoEstimativa = ' A barra do mês atual pode incluir uma <strong style="color:#3987e5">estimativa</strong> (geração real do inversor − consumo médio histórico) pros dias sem leitura ainda — sempre corrigida quando a leitura real do medidor chegar.';
    legSolarEl.innerHTML = 'Última leitura ('+ultimaSolar.data.split('-').reverse().join('/')+', '+(ultimaSolar.fonte==='real'?'real':'estimado')+', '+ultimaSolar.dias+' dias desde 21/07): crédito líquido acumulado até agora <strong>'+ultimaSolar.creditoLiquido+' kWh</strong> (Wallace '+ultimaSolar.creditoWallace+' kWh · Irmã '+ultimaSolar.creditoIrma+' kWh). Isso ainda não é a meta do mês fechada — pra saber se está no ritmo certo pra bater a meta mensal, veja a seção 11 (Previsão) logo abaixo. Consumo mostrado nas barras é o histórico REAL dos últimos 12 meses de cada apartamento (fatura Energisa de cada um, Wallace e Wellida). '+mesesComLeitura+' de 12 meses já têm leitura de crédito; os demais ficam sem barra verde até a leitura chegar.'+avisoEstimativa;
  }

  // ===== NOVO 01/08/2026: Previsão de Compensação de Créditos de Energia =====
  // Especificação fornecida pelo usuário (documento anexado, 01/08/2026). Reaproveita 100% os dados já
  // existentes (VARS.SOLAR_LEITURAS_CALC) - nao duplica nenhuma variavel, so consome e apresenta previsao.
  // Constantes faceis de ajustar se a janela/dia de leitura mudar (pedido explicito do usuario).
  const DIA_LEITURA_WALLACE = 21; // CORRIGIDO 03/08/2026 (confirmado pelo usuário): era 20. Leitura Energisa do apartamento, janela 19-21
  const DIA_LEITURA_WELLIDA = 8;  // CONFIRMADO 03/08/2026: mesmo ciclo da Casa da Mãe (onde fica a usina) - dia 8
  // CORRIGIDO 01/08/2026 (V241, pedido do usuario - "use a meta do mes especifico igual e feito pra
  // mim"): meta deixa de ser numero fixo solto (321/119) e passa a derivar do mesmo indice (mes atual,
  // posicao 0) do historico real de 12 meses de cada casa - mesmo criterio ja usado pro Wallace desde o
  // inicio (321 sempre foi kwhAnoAnterior[0], so nao estava escrito assim). Nunca mais dessincroniza.
  // CORRIGIDO 03/08/2026 (achado ao verificar a seção 12 após as mudanças de ciclo): meta usava
  // kwhAnoAnterior[0]/consumoMensalIrma[0] fixo - sempre o valor de JULHO (mês de ativação), mesmo já
  // estando em agosto+. Igual ao bug do gráfico 09 (mesma classe: índice fixo em vez de acompanhar o
  // mês real) - agora usa OFFSET_ENERGIA (mesmo índice corrigido no gráfico 09, calendário puro, dia 1).
  const META_WALLACE = kwhAnoAnterior[OFFSET_ENERGIA];       // kWh, consumo real do mesmo mes no ano anterior (Wallace)
  const META_WELLIDA = consumoMensalIrma[OFFSET_ENERGIA];    // kWh, consumo real do mesmo mes no ano anterior (Wellida)

  function calcularDiasRestantes(diaLeituraAlvo, hojeRef){
    const hj = hojeRef || new Date();
    const hojeSoData = new Date(hj.getFullYear(), hj.getMonth(), hj.getDate());
    let proxima = new Date(hj.getFullYear(), hj.getMonth(), diaLeituraAlvo);
    if(proxima <= hojeSoData) proxima = new Date(hj.getFullYear(), hj.getMonth()+1, diaLeituraAlvo);
    return Math.max(1, Math.round((proxima-hojeSoData)/86400000));
  }
  function calcularCreditoRestante(meta, creditoAtual){
    return Math.round((meta-creditoAtual)*100)/100;
  }
  function calcularMediaNecessaria(creditoRestante, diasRestantes){
    return Math.round((creditoRestante/diasRestantes)*10)/10;
  }
  function calcularMediaRealizada(creditoAtual, diasDecorridos){
    if(!diasDecorridos) return 0;
    return Math.round((creditoAtual/diasDecorridos)*10)/10;
  }
  function calcularPrevisao(creditoAtual, mediaRealizada, diasRestantesAlvo){
    return Math.round((creditoAtual + mediaRealizada*diasRestantesAlvo)*10)/10;
  }
  function calcularStatus(mediaRealizada, mediaNecessaria){
    if(mediaNecessaria<=0 || mediaRealizada>=mediaNecessaria) return {emoji:'🟢', texto:'No ritmo', cor:'#34c98a'};
    const deficitPct = (mediaNecessaria-mediaRealizada)/mediaNecessaria;
    if(deficitPct < 0.10) return {emoji:'🟡', texto:'Atenção', cor:'#e8a63a'};
    return {emoji:'🔴', texto:'Atrasado', cor:'#e2554f'};
  }

  function renderPrevisao(prefixo, meta, diaLeitura, creditoAtual, diasDecorridos, corBarra){
    const diasRestantes = calcularDiasRestantes(diaLeitura);
    const creditoRestante = calcularCreditoRestante(meta, creditoAtual);
    const mediaNecessaria = calcularMediaNecessaria(Math.max(0,creditoRestante), diasRestantes);
    const mediaRealizada = calcularMediaRealizada(creditoAtual, diasDecorridos);
    const previsao = calcularPrevisao(creditoAtual, mediaRealizada, diasRestantes);
    const saldoEsperado = Math.round((previsao-meta)*10)/10;
    const status = calcularStatus(mediaRealizada, mediaNecessaria);
    const pct = Math.min(100, Math.max(0, Math.round(creditoAtual/meta*100)));
    const set = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
    const barEl = $(prefixo+'Bar');
    if(barEl){ barEl.style.width = pct+'%'; barEl.style.background = status.cor; }
    set(prefixo+'Fracao', creditoAtual+' / '+meta+' kWh');
    set(prefixo+'Pct', pct+'%');
    set(prefixo+'Faltam', Math.max(0,creditoRestante)+' kWh');
    set(prefixo+'Dias', diasRestantes+' dias');
    set(prefixo+'Necessario', mediaNecessaria+' kWh/dia');
    set(prefixo+'Media', mediaRealizada+' kWh/dia');
    set(prefixo+'Previsao', previsao+' kWh');
    const saldoTxt = (saldoEsperado>=0?'+':'')+saldoEsperado+' kWh';
    set(prefixo+'Saldo', saldoTxt);
    const saldoEl = $(prefixo+'Saldo');
    if(saldoEl) saldoEl.style.color = saldoEsperado>=0 ? '#34c98a' : '#e2554f';
    const statusEl = $(prefixo+'Status');
    if(statusEl){ statusEl.textContent = status.emoji+' '+status.texto; statusEl.style.color = status.cor; }
  }

  if(ultimaSolar){
    renderPrevisao('prevWallace', META_WALLACE, DIA_LEITURA_WALLACE, ultimaSolar.creditoWallace, ultimaSolar.dias, '#34c98a');
    renderPrevisao('prevWellida', META_WELLIDA, DIA_LEITURA_WELLIDA, ultimaSolar.creditoIrma, ultimaSolar.dias, '#e8a63a');
  }
}

// V300 (03/08/2026, Etapa 1.1 do plano de modernizacao): antes disso, os graficos das abas
// Cenarios/Graficos (nao visiveis no carregamento inicial, so a aba Painel e) ja nao bloqueavam
// mais a 1a pintura (item 5 antigo, double-rAF), mas ainda eram criados sempre, incondicionalmente,
// mesmo se o usuario nunca abrisse essas abas. Agora so sao criados na 1a vez que o usuario abre
// 'graficos' OU 'cenarios' (showMaster chama initGraficosECenariosLazy()) - flag garante que roda
// uma unica vez (as funcoes internas nao sao idempotentes, cada uma faz "new Chart" de novo se
// chamada 2x). Mesmos graficos, mesmos dados, mesmo resultado - so o gatilho de criacao mudou (aba
// aberta em vez de "sempre, um instante depois"). _lazyRenderCenariosDeficitEGraficosSolar mistura
// cDeficitZero (Cenarios) com os 3 graficos solares (Graficos) no mesmo escopo de funcao - nao
// separado por aba pra nao arriscar quebrar variaveis locais compartilhadas entre eles - por isso
// o gatilho e "qualquer uma das duas abas abriu primeiro" (cobre as duas com uma unica carga).
let _graficosECenariosCarregados = false;
function initGraficosECenariosLazy(){
  if(_graficosECenariosCarregados) return;
  _graficosECenariosCarregados = true;
  _lazyRenderCenariosSalario();
  _lazyRenderGraficosSecao();
  _lazyRenderCenariosSuperavit();
  _lazyRenderCenariosDeficitEGraficosSolar();
  WallaceBus.emit('graficoAtualizado', {origem:'initGraficosECenariosLazy'}); // V300 (Etapa 2)
}

// ===================================================================================
// NOVO 03/08/2026 - SIMULADOR REGULATORIO SOLAR (Lei 14.300 / ANEEL) - secao 13
// ===================================================================================
// Baseado em especificacao tecnica trazida pelo usuario. 3 decisoes de escopo
// confirmadas por ele antes de implementar:
// 1) O RATEIO real do sistema continua PARALELO (71% Wallace / 29% Wellida,
//    simultaneo) - a "ordem de prioridade" (Apartamento->Casa Mae->Casa Irma)
//    descrita no documento original NAO é usada aqui, é só um modelo generico
//    de referencia que o documento trazia.
// 2) Sem mudanca de arquitetura - continua tudo dentro deste app.js unico,
//    sem virar modulos/classes TypeScript separados (o documento sugeria isso,
//    mas o usuario preferiu so aproveitar as FORMULAS/regras de negocio).
// 3) Isso é uma camada de SIMULACAO/PROJECAO, aditiva - nao substitui nem mexe
//    nos calculos das secoes 09-12 (que usam leitura REAL dos codigos 03/103,
//    sem estimar, regra ja documentada). O simulador é so pra planejamento
//    (payback, economia projetada, cenarios futuros de reajuste tarifario).

// ----- Configuracao parametrizada (nunca numero solto dentro das funcoes) -----
const r2Sim = x => Math.round(x*100)/100; // r2 original é privado de outra função (escopo diferente) - versão própria aqui
const SolarConfig = {
  tarifas: { // Resolucao Homologatoria ANEEL 3518/2025, Grupo B1 Residencial, vigencia 28/08/2025
    TE: 0.25632,
    TUSD: 0.41933,
    FioA: 0.05116,
    FioB: 0.24028,
    PerdasTecnicas: 0.04193,
    PerdasNaoTecnicas: 0.03774,
    Encargos: 0.04822
  },
  tributos: { ICMS: 0.18, PIS_COFINS: 0.045 }, // PIS+COFINS combinado p/ simulacao, conforme doc
  bandeiras: { Verde: 0, Amarela: 0.0188, Vermelha1: 0.0446, Vermelha2: 0.0787 },
  lei14300: {
    // percentual do Fio B cobrado sobre energia compensada, por ano (regra de transicao) -
    // parametrizado por ano, nunca fixo dentro de funcao (pedido explicito do documento)
    percentualFioBPorAno: { 2023:0.15, 2024:0.30, 2025:0.45, 2026:0.60, 2027:0.75, 2028:0.90, 2029:1.00 },
    validadeCreditoMeses: 60
  },
  disponibilidade: { MONO: 30, BI: 50, TRI: 100 }, // kWh
  forecast: {
    reajusteTarifarioAnual: 0.06,   // 6% a.a., padrao de mercado p/ simulacao (ajustavel)
    inflacaoAnual: 0.045,           // 4.5% a.a.
    degradacaoModuloAnual: 0.005,   // 0.5% a.a., padrao garantia de fabricante
    aumentoConsumoAnual: 0.0        // 0% a.a. default - usuario pode simular cenarios de aumento
  }
};

function getDisponibilidade(tipoLigacao){
  return SolarConfig.disponibilidade[tipoLigacao] ?? SolarConfig.disponibilidade.MONO;
}

function getPercentualFioB(ano){
  const tabela = SolarConfig.lei14300.percentualFioBPorAno;
  if(tabela[ano] !== undefined) return tabela[ano];
  const anos = Object.keys(tabela).map(Number).sort((a,b)=>a-b);
  return ano > anos[anos.length-1] ? 1.00 : tabela[anos[0]]; // apos 2029: 100% (fim da transicao)
}

// Tarifa "por dentro" (ICMS/PIS/COFINS incidem sobre o proprio preco final, nao por fora)
function aplicarTributosPorDentro(tarifaBase, bandeira){
  const {ICMS, PIS_COFINS} = SolarConfig.tributos;
  return (tarifaBase + bandeira) / (1 - (ICMS + PIS_COFINS));
}

// Conta SEM geracao solar - consumo integral faturado, sem nenhuma compensacao
function calcularContaSemSolar(consumoKWh, tipoLigacao, bandeira=0){
  const disp = getDisponibilidade(tipoLigacao);
  const {TE, FioA, FioB, PerdasTecnicas, PerdasNaoTecnicas, Encargos} = SolarConfig.tarifas;
  const perdas = PerdasTecnicas + PerdasNaoTecnicas;
  const teComImposto = aplicarTributosPorDentro(TE, bandeira);
  const fioAComImposto = aplicarTributosPorDentro(FioA, 0);
  const fioBComImposto = aplicarTributosPorDentro(FioB, 0);
  const perdasComImposto = aplicarTributosPorDentro(perdas, 0);
  const encargosComImposto = aplicarTributosPorDentro(Encargos, 0);
  const valorTE = consumoKWh * teComImposto;
  const valorFioA = consumoKWh * fioAComImposto;
  const valorFioB = consumoKWh * fioBComImposto; // sem solar, Fio B incide sobre TODO consumo
  const valorPerdas = consumoKWh * perdasComImposto;
  const valorEncargos = consumoKWh * encargosComImposto;
  const total = r2Sim(valorTE + valorFioA + valorFioB + valorPerdas + valorEncargos);
  return { total, detalhe:{valorTE:r2Sim(valorTE), valorFioA:r2Sim(valorFioA), valorFioB:r2Sim(valorFioB), valorPerdas:r2Sim(valorPerdas), valorEncargos:r2Sim(valorEncargos)} };
}

// Conta COM geracao solar - separa energia instantanea (nunca paga Fio B) de energia
// compensada via credito (paga Fio B parcial, conforme % da Lei 14.300 do ano). Usa FIFO
// de creditos com validade de 60 meses (creditosDisponiveis = array de {mes,ano,energia}).
function calcularContaComSolar(consumoKWh, geracaoInstantaneaKWh, energiaInjetadaKWh, creditosDisponiveis, tipoLigacao, ano, bandeira=0){
  const disp = getDisponibilidade(tipoLigacao);
  const percentualFioB = getPercentualFioB(ano);
  const {TE, FioA, FioB, PerdasTecnicas, PerdasNaoTecnicas, Encargos} = SolarConfig.tarifas;
  const perdas = PerdasTecnicas + PerdasNaoTecnicas;

  // energia instantanea nunca excede o proprio consumo
  const energiaInstantanea = Math.min(geracaoInstantaneaKWh, consumoKWh);
  const consumoElegivel = Math.max(0, consumoKWh - disp); // nunca negativo
  const consumoRestante = Math.max(0, consumoKWh - energiaInstantanea);

  // consome creditos mais antigos primeiro (FIFO), respeitando validade de 60 meses
  let creditosOrdenados = creditosDisponiveis
    .filter(c => c.energia > 0)
    .sort((a,b)=> (a.ano*12+a.mes) - (b.ano*12+b.mes));
  let precisaCompensar = Math.min(consumoElegivel, consumoRestante);
  let energiaCompensada = 0;
  const creditosAtualizados = [];
  for(const c of creditosOrdenados){
    if(precisaCompensar <= 0){ creditosAtualizados.push({...c}); continue; }
    const usar = Math.min(c.energia, precisaCompensar);
    energiaCompensada += usar;
    precisaCompensar -= usar;
    creditosAtualizados.push({...c, energia: r2Sim(c.energia - usar)});
  }

  // credito novo gerado neste periodo = injetado - o que ja foi usado pra compensar agora
  const creditoNovo = Math.max(0, r2Sim(energiaInjetadaKWh - energiaCompensada));
  creditosAtualizados.push({mes: null, ano: null, energia: creditoNovo}); // caller preenche mes/ano reais

  const energiaFaturada = Math.max(0, consumoKWh - energiaCompensada);

  const teComImposto = aplicarTributosPorDentro(TE, bandeira);
  const fioAComImposto = aplicarTributosPorDentro(FioA, 0);
  const fioBComImposto = aplicarTributosPorDentro(FioB, 0);
  const perdasComImposto = aplicarTributosPorDentro(perdas, 0);
  const encargosComImposto = aplicarTributosPorDentro(Encargos, 0);

  const valorTE = energiaFaturada * teComImposto;
  const valorFioA = energiaFaturada * fioAComImposto;
  // Fio B: NAO incide sobre energia instantanea - so sobre energia COMPENSADA, e só o
  // percentual da Lei 14.300 vigente naquele ano (regra de transicao)
  const valorFioB = energiaCompensada * fioBComImposto * percentualFioB;
  const valorPerdas = energiaFaturada * perdasComImposto;
  const valorEncargos = energiaFaturada * encargosComImposto;
  const total = r2Sim(valorTE + valorFioA + valorFioB + valorPerdas + valorEncargos);

  return {
    total,
    energiaInstantanea: r2Sim(energiaInstantanea),
    energiaCompensada: r2Sim(energiaCompensada),
    energiaFaturada: r2Sim(energiaFaturada),
    creditoNovo,
    creditosAtualizados,
    percentualFioBAplicado: percentualFioB,
    detalhe:{valorTE:r2Sim(valorTE), valorFioA:r2Sim(valorFioA), valorFioB:r2Sim(valorFioB), valorPerdas:r2Sim(valorPerdas), valorEncargos:r2Sim(valorEncargos)}
  };
}

function calcularEconomia(contaSemSolar, contaComSolar){
  return r2Sim(contaSemSolar - contaComSolar);
}

function calcularValorKwhGerado(economia, energiaGeradaKWh){
  return energiaGeradaKWh > 0 ? r2Sim(economia / energiaGeradaKWh) : 0;
}

function calcularPayback(investimento, economiaAnual){
  return economiaAnual > 0 ? r2Sim(investimento / economiaAnual) : null;
}

// Forecast de N meses - simula reajuste tarifario, degradacao do modulo, aumento de consumo
// e a curva de transicao da Lei 14.300, mes a mes. Retorna resumo (economia acumulada) +
// serie anual (pra tabela resumida na UI).
function gerarForecastSolar(params){
  const {
    consumoMensalInicial, geracaoMensalInicial, tipoLigacao,
    anoInicial, mesesForecast, investimento
  } = params;
  let creditosAtuais = []; // FIFO acumulado ao longo do forecast
  let economiaAcumulada = 0;
  const resumoAnual = [];
  let economiaDoAnoAtual = 0;

  for(let m=0; m<mesesForecast; m++){
    const anosPassados = Math.floor(m/12);
    const anoCorrente = anoInicial + anosPassados;
    const fatorReajuste = Math.pow(1 + SolarConfig.forecast.reajusteTarifarioAnual, anosPassados);
    const fatorDegradacao = Math.pow(1 - SolarConfig.forecast.degradacaoModuloAnual, anosPassados);
    const fatorConsumo = Math.pow(1 + SolarConfig.forecast.aumentoConsumoAnual, anosPassados);

    const consumoDoMes = consumoMensalInicial * fatorConsumo;
    const geracaoDoMes = geracaoMensalInicial * fatorDegradacao;
    // simplificacao de simulacao: energia instantanea = min(geracao,consumo)*50% (estimativa
    // padrao de autoconsumo simultaneo), resto vira injetado - documentado, nao e dado real
    const energiaInstantaneaEstimada = Math.min(geracaoDoMes, consumoDoMes) * 0.5;
    const energiaInjetadaEstimada = Math.max(0, geracaoDoMes - energiaInstantaneaEstimada);

    // remove creditos vencidos (>60 meses) antes de calcular o mes
    creditosAtuais = creditosAtuais.filter(c => (m - (c.mesIndex ?? -999)) < SolarConfig.lei14300.validadeCreditoMeses);

    // aplica reajuste tarifario nas tarifas base (clona config com fator)
    const tarifasAjustadas = {};
    Object.keys(SolarConfig.tarifas).forEach(k => tarifasAjustadas[k] = SolarConfig.tarifas[k] * fatorReajuste);
    const tarifasOriginais = SolarConfig.tarifas;
    SolarConfig.tarifas = tarifasAjustadas; // temporario, restaurado logo abaixo

    const semSolar = calcularContaSemSolar(consumoDoMes, tipoLigacao);
    const comSolar = calcularContaComSolar(consumoDoMes, energiaInstantaneaEstimada, energiaInjetadaEstimada, creditosAtuais, tipoLigacao, anoCorrente);

    SolarConfig.tarifas = tarifasOriginais; // restaura config real

    const economiaDoMes = calcularEconomia(semSolar.total, comSolar.total);
    economiaAcumulada = r2Sim(economiaAcumulada + economiaDoMes);
    economiaDoAnoAtual += economiaDoMes;

    creditosAtuais = comSolar.creditosAtualizados.map(c => c.mes===null ? {...c, mesIndex:m} : c);

    if((m+1) % 12 === 0 || m === mesesForecast-1){
      resumoAnual.push({
        ano: anoCorrente, mesFinal: m+1,
        economiaAcumulada,
        payback: calcularPayback(investimento, economiaDoAnoAtual > 0 ? (economiaDoAnoAtual*12/((m%12)+1)) : 0)
      });
      economiaDoAnoAtual = 0;
    }
  }
  return { economiaAcumuladaTotal: economiaAcumulada, resumoAnual };
}

// ----- Wiring da UI (secao 13) -----
function calcularSimulacaoRegulatoria(){
  const consumo = Number($('simConsumo')?.value) || 300;
  const tipoLigacao = $('simLigacao')?.value || 'TRI';
  const geracao = Number($('simGeracao')?.value) || 850;
  const investimento = Number($('simInvestimento')?.value) || 25000;
  const mesesForecast = Number($('simMeses')?.value) || 60;
  const anoInicial = new Date().getFullYear();

  const resultado = gerarForecastSolar({
    consumoMensalInicial: consumo, geracaoMensalInicial: geracao,
    tipoLigacao, anoInicial, mesesForecast, investimento
  });

  // CORRIGIDO 03/08/2026 (achado ao testar de verdade): t() é uma função local de outro escopo
  // (linha 1991), não é global - chamar ela aqui dava "t is not defined" e quebrava a página
  // inteira. Substituído por manipulação direta do DOM, sem depender do helper de outro escopo.
  const elEconomia = $('simEconomiaAcumulada');
  if(elEconomia) elEconomia.textContent = fmt(resultado.economiaAcumuladaTotal);
  const anosForecast = (mesesForecast/12).toFixed(0);
  const elPeriodo = $('simPeriodo');
  if(elPeriodo) elPeriodo.textContent = anosForecast + ' ano(s) (' + mesesForecast + ' meses)';

  const tbody = $('simTabelaAnual');
  if(tbody){
    tbody.innerHTML = resultado.resumoAnual.map(r =>
      '<tr><td>'+r.ano+'</td><td>'+fmt(r.economiaAcumulada)+'</td><td>'+(r.payback ? r.payback.toFixed(1)+' anos' : '—')+'</td></tr>'
    ).join('');
  }
}
onDomPronto(() => {
  const btnSim = $('btnCalcularSimulacao');
  if(btnSim) btnSim.addEventListener('click', calcularSimulacaoRegulatoria);
  if($('simConsumo')) calcularSimulacaoRegulatoria(); // calculo inicial com defaults
});
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
  const ativo = document.body.classList.toggle('esconder-valores');
  try { localStorage.setItem('wallace_esconder_valores', ativo ? '1' : '0'); } catch(e) {}
  return ativo;
}
onDomPronto(() => { // V170: corrigido - era addEventListener DOMContentLoaded, nunca rodava
  try {
    if(localStorage.getItem('wallace_esconder_valores') === '1'){
      document.body.classList.add('esconder-valores');
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

function baixarSecaoComoJPEG(card, num, titulo, btnOrigem){
  if (typeof html2canvas === 'undefined'){
    alert('A biblioteca de captura ainda está carregando. Tenta de novo em alguns segundos.');
    return;
  }
  if (btnOrigem){ btnOrigem.disabled = true; btnOrigem.textContent = '…'; }
  var corFundo = getComputedStyle(document.body).backgroundColor || '#0f1115';
  html2canvas(card, { backgroundColor: corFundo, scale: 2, useCORS: true }).then(function(canvas){
    var slug = titulo.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    var hoje = new Date().toISOString().slice(0, 10);
    var link = document.createElement('a');
    link.download = 'secao-' + num + '-' + slug + '-' + hoje + '.jpg';
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

