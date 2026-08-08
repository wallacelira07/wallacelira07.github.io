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

// MOVIDO 08/08/2026 pra cá (era definido lá embaixo, perto de auditoriaCruzadaV1V2) — CORRIGIDO
// bug real de ordem de execução: onDomPronto() acima roda a função IMEDIATAMENTE, de forma
// SÍNCRONA, sempre que o DOM já está pronto — e como app.js é injetado depois de um fetch
// assíncrono, isso é o caso normal (não "às vezes"). onDomPronto(hydrate), mais abaixo no
// arquivo, chamava hydrate() antes do parser sequer chegar na definição original de
// WallaceFinanceService (que ficava textualmente DEPOIS dessa chamada) — ReferenceError
// determinístico sempre que o timing batia assim, mascarado de "falha transiente" porque só
// aparecia em parte dos carregamentos (dependia de o script ter sido injetado antes ou depois
// do documento terminar de parsear). WallaceFinanceService não depende de VARS/REG/DOM — é
// seguro definir aqui, bem antes de qualquer onDomPronto(...) rodar.
//
// NOVO 05/08/2026 (parte 104): auditoria cruzada V1 (VARS/REG, este arquivo) vs V2 (tabelas
// relacionais no Supabase, Arquitetura V2). Só leitura, só console.warn - nunca altera nada na
// tela, nunca bloqueia o carregamento (fetch assíncrono, fire-and-forget, falha silenciosa se
// offline). Existe pra pegar cedo qualquer descasamento entre os dois sistemas rodando em
// paralelo durante a migração da Fase 5 (mesmo raciocínio da auditoria SSOT acima, mas
// comparando contra a fonte V2 em vez de comparando o V1 consigo mesmo).
// NOVO 06/08/2026 (parte 118, "avance para a fase 5 nao adianta ficar protelando" - pedido explicito
// do usuario). Comeca a consumir de verdade a camada /services (src/services/FinanceService.js) - MAS
// app.js NAO e um ES module (carregado via <script src>, injetado dinamicamente, dezenas de onclick=
// inline no HTML dependem de funcao GLOBAL) - converter pra type="module" quebraria TODOS esses onclick
// de uma vez, risco alto demais pra fazer as cegas sem navegador real pra testar. Solucao: mesma API
// publica do FinanceService.js (getDashboardResumo, getCaixas, getSaldoCaixa), reimplementada aqui como
// objeto global plano (WallaceFinanceService) - comportamento identico, sem sintaxe de modulo. Isso
// elimina a duplicacao real que existia (o fetch de rpc_dashboard_resumo abaixo era copiado a mao,
// diferente do FinanceService.js que nunca era chamado por ninguem) - agora so existe 1 implementacao,
// reusada. Primeiro passo real e seguro de Fase 5: consolidar antes de expandir.
const WallaceFinanceService = {
  _cache: new Map(),
  _url: 'https://bakdgacmwlopvrrppwdm.supabase.co',
  _key: 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg',
  invalidarCache(){ this._cache.clear(); },
  async getDashboardResumo(){
    const chave = 'rpc:dashboard_resumo';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/rpc/rpc_dashboard_resumo`, {
      method:'POST',
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}`, 'Content-Type':'application/json' },
      body:'{}'
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar dashboard`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  },
  // NOVO 08/08/2026 (Onda 1 da migração V2 → Painel): saldo por caixa via vw_saldo_v2_por_caixa —
  // NÃO usar rpc_dashboard_resumo().caixas[].saldo pra isso (achado ao vivo: soma TODA transação
  // da caixa sem filtro de ciclo/afeta_saldo_real, valor errado pra Boletos/Variável) nem
  // saldo_real_ciclo_atual da mesma RPC (diverge pra PIX Vanessa, ~R$122 de diferença). Esta view
  // é a mesma usada e validada a sessão inteira em PLANO_UNIFICACAO_V1_V2.md — v2_saldo_calculado
  // bate exato com vw_reconciliacao_v1_v2 pras 4 caixas já sincronizadas.
  async getSaldosPorCaixa(){
    const chave = 'vw_saldo_v2_por_caixa';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/vw_saldo_v2_por_caixa?select=caixa_nome,v2_saldo_calculado`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_saldo_v2_por_caixa`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  },
  // NOVO 08/08/2026 (Onda 2, Livro Razão Fase 1): reconciliação completa por caixa (saldo, qtd de
  // transações V1×V2, valor das transações só-no-V1) — reaproveita vw_reconciliacao_v1_v2, já
  // validada a sessão inteira, em vez de somar arrays na mão no cliente.
  async getReconciliacaoPorCaixa(){
    const chave = 'vw_reconciliacao_v1_v2';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/vw_reconciliacao_v1_v2?select=caixa_nome,v1_saldo,v2_saldo,diferenca_absoluta,v1_qtd_transacoes,v2_qtd_transacoes,valor_transacoes_so_no_v1,valor_transacoes_so_na_v2,causa_provavel`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_reconciliacao_v1_v2`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  },
  // NOVO 08/08/2026 (Onda 3, Livro Razão): transações confirmadas de uma lista de caixas, numa
  // única chamada (in.(id1,id2,...)) em vez de N requests separados.
  async getTransacoesPorCaixaIds(caixaIds){
    const chave = 'transacoes_por_caixa:' + caixaIds.join(',');
    if(this._cache.has(chave)) return this._cache.get(chave);
    const lista = caixaIds.join(',');
    const resp = await fetch(`${this._url}/rest/v1/transacoes?select=tx_legado,data,descricao,tipo,valor,caixa_id&caixa_id=in.(${lista})&status=eq.confirmado&order=data.desc`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar transacoes por caixa`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  },
  // NOVO 08/08/2026 (Onda 3, Prioridade 2 — LRW/LRV): compromisso de cartão por pessoa
  // (equivalente a VARS.mbLRWConfirmado/mbLRVConfirmado), via vw_compromisso_cartao_por_pessoa —
  // agregação pura de `transacoes` já existentes (Caixa Variável, afeta_saldo_real=false), sem
  // lógica de negócio nova.
  async getCompromissoCartaoPorPessoa(){
    const chave = 'vw_compromisso_cartao_por_pessoa';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/vw_compromisso_cartao_por_pessoa?select=usuario_nome,total_comprometido,qtd_transacoes`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_compromisso_cartao_por_pessoa`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  },
  async getCaixas(){
    const chave = 'caixas';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/caixas?select=id,nome,tipo,teto_mensal`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar caixas`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  },
  async getSaldoCaixa(nomeCaixa){
    const caixas = await this.getCaixas();
    const caixa = caixas.find(c => c.nome === nomeCaixa);
    if(!caixa) throw new Error(`WallaceFinanceService: caixa "${nomeCaixa}" nao encontrada`);
    const resp = await fetch(`${this._url}/rest/v1/transacoes?select=tipo,valor&caixa_id=eq.${caixa.id}&status=eq.confirmado`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar transacoes`);
    const transacoes = await resp.json();
    let saldo = 0;
    for(const t of transacoes) saldo += t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor);
    return Math.round(saldo*100)/100;
  },
  // NOVO 08/08/2026 (Onda 4 — "Supabase como fonte única de verdade", domínio Patrimônio):
  // vw_patrimonio_v2 (patrimonio + financiamentos, rotulados) — mesma agregação que
  // recalcularPatrimonio() já fazia em VARS, só lendo da V2 estruturada.
  async getPatrimonioV2(){
    const chave = 'vw_patrimonio_v2';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/vw_patrimonio_v2?select=*`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_patrimonio_v2`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado[0] || null;
  },
  // NOVO 08/08/2026 (Onda 4, domínio 2 — Investimentos/ROC): posições de opções direto de
  // `investimentos` (tipo=opcoes) — campos crus, mesmo shape que VARS.opcoesVendidasDetalhe usava
  // (ticker/ativo/strike/vencimento/prêmios/etc). O cálculo de ROC continua 100% em
  // calcularROCOpcoes() (opcoes-roc.js, inalterado) — aqui só troca a origem do dado bruto.
  async getInvestimentosOpcoesV2(){
    const chave = 'investimentos_opcoes';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/investimentos?select=ticker,ativo_subjacente,quantidade,valor_atual,preco_exercicio,data_vencimento,premio_bruto,custo_operacional,premio_recebido,preco_medio,nota_corretagem,exercida&tipo=eq.opcoes`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar investimentos (opções)`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  },
  async getIndicador(nome){
    const chave = 'indicador:' + nome;
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/indicadores?select=valor,data_calculo&nome=eq.${encodeURIComponent(nome)}&order=data_calculo.desc&limit=1`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar indicador "${nome}"`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado[0] || null;
  },
  // NOVO 08/08/2026 (Onda 4, domínio 3 — LREI): vw_emprestimos_internos_v2 (mesmo shape de
  // VARS.LREI_ATIVAS — id/data/credora/devedora/valor/origem/status/quitadoEm/quitadoPor).
  async getEmprestimosInternosV2(){
    const chave = 'vw_emprestimos_internos_v2';
    if(this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this._url}/rest/v1/vw_emprestimos_internos_v2?select=*`, {
      headers:{ apikey:this._key, Authorization:`Bearer ${this._key}` }
    });
    if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_emprestimos_internos_v2`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }
};

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

// MODULARIZAÇÃO 07/08/2026: Capa/Dashboard (CAPA_DESTINOS, renderCapaNav, irParaCapaDestino,
// voltarParaCapa, renderPageStrip, toggleBtnVoltarCapa) e Busca Global (construirIndiceBuscaGlobal,
// irParaSecaoBusca, construirIndiceTransacoesBusca, irParaTransacaoNoLivro, renderResultadosBusca,
// initBuscaGlobal, etc.) foram extraídos pra src/modules/dashboard-navegacao.js — carrega depois do
// app.js (onload), nenhuma dessas funções roda em código síncrono que outra parte do app.js precise
// no meio da própria execução (só via onDomPronto/onclick/eventos, sempre depois). Nenhuma fórmula
// ou comportamento mudou, só o arquivo que hospeda o código.

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
// MODULARIZAÇÃO 07/08/2026: yRange/gerarMeses/gerarMesesCiclo/ciclosDesdeAncoraCiclo/alignSeries/
// alignSeriesCiclo/alignEventos/barValuePlugin (utilitários de gráfico) foram extraídos pra
// src/modules/graficos-utilitarios.js — carrega ANTES do app.js (script estático, mesmo padrão de
// opcoes-roc.js), porque a IIFE dos gráficos do Painel principal (mais abaixo neste arquivo) chama
// essas funções no meio da própria execução síncrona. Nenhuma fórmula ou comportamento mudou, só o
// arquivo que hospeda o código.

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
const VARS = {};
// FASE 4 (07/08/2026, modularizacao de VARS): fragmentos por dominio, cada um uma funcao fabrica
// (avaliada aqui, depois que este modulo ja existe no escopo global - mesmo padrao de ordem de
// CARTAO_PLUGGY_MAPA_DEFAULT/REG). Mesma estrutura de dados consumida pelo resto do sistema, sem
// nenhuma mudanca de forma. vars-pluggy.js nao existe - PLUGGY_CONTAS nasce em runtime via
// Object.assign(VARS, window.WALLACE_DADOS_REMOTOS), nao pertence ao literal estatico.
Object.assign(VARS, criarVarsCaixas());
Object.assign(VARS, criarVarsMercadoPago());
Object.assign(VARS, criarVarsP2P());
Object.assign(VARS, criarVarsPatrimonio());
Object.assign(VARS, criarVarsReembolsos());
Object.assign(VARS, criarVarsROC());
Object.assign(VARS, criarVarsEnergiaSolar());
Object.assign(VARS, criarVarsCicloSnapshots());
Object.assign(VARS, criarVarsOperacional());

// Congela objetos que nunca deveriam ser mutados em runtime - protege contra edição acidental
// (ex: alguém escrever VARS.LEGENDAS.algumId = "..." num ponto novo do código sem perceber que
// deveria estar editando o objeto original, lá em cima). Confirmado (03/08/2026): só leitura no
// resto do arquivo para os 3. LEGENDAS NÃO é congelado ainda aqui (ver bloco depois do merge do
// WALLACE_DADOS_REMOTOS logo abaixo) - só os outros 2.
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
  // CORRIGIDO 05/08/2026 (parte 95, usuario apontou "o valor do Mercado Pago nao aparece"): mercadoPagoFatura
  // ficava travado no valor MANUAL do ultimo pagamento (27/07, gravado como 0 no Supabase) porque nada
  // atualizava esse campo depois disso. A funcao reconciliarPluggy() ja calculava o valor real da fatura
  // aberta via Pluggy (resultado.mercadoPagoSaldoAbertoPluggy), mas (1) so roda depois que REG/hydrate ja
  // tinham renderizado a tela inteira (onDomPronto só dispara apos DOMContentLoaded, e REG nasce no parse
  // do script, antes disso) e (2) o resultado nunca era escrito de volta em VARS - so ficava numa variavel
  // local, descartada a cada carga. Corrigido fazendo a MESMA extracao aqui, sincrona, ANTES do REG nascer
  // (window.WALLACE_DADOS_REMOTOS ja contem VARS.PLUGGY_CONTAS neste ponto, injetado no HTML antes deste
  // script). Mesmo criterio ja usado em reconciliarPluggy (parte 77): mostra o saldo/fatura ATUAL da
  // Pluggy sempre, independente do vencimento - nao esconde do usuario so pra evitar falso-positivo de
  // divergencia (essa e uma preocupacao separada, tratada em reconciliarPluggy). Se a Pluggy estiver fora
  // do ar ou sem esse cartao mapeado nesta carga, mantem o valor ja existente em VARS (fallback), o site
  // nunca quebra.
  if(VARS.PLUGGY_CONTAS && Array.isArray(VARS.PLUGGY_CONTAS.conexoes)){
    let faturaMPPluggy = null, vencMPPluggy = null;
    VARS.PLUGGY_CONTAS.conexoes.forEach(conexao=>{
      (conexao.contas||[]).forEach(conta=>{
        if(conta.tipo === 'CREDIT' && /mercado\s*pago/i.test(conta.nome||'') && conta.fatura_mes_atual){
          faturaMPPluggy = conta.fatura_mes_atual.valor_total;
          vencMPPluggy = conta.fatura_vencimento_atual || conta.fatura_mes_atual.vencimento || null;
        }
      });
    });
    if(faturaMPPluggy != null){
      VARS.mercadoPagoFatura = faturaMPPluggy;
      VARS.mercadoPagoVencimentoPluggy = vencMPPluggy;
    }
  }
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

// NOVO 07/08/2026 (pedido do usuario: "legendas devem vir de uma tabela unica, pra nao precisar
// de deploy pra mudar"): completa o que o comentario da V218 (legInboxVazia) ja prometia mas nunca
// foi de fato ligado - mescla VARS.LEGENDAS local (fallback, sempre funciona mesmo offline/banco
// fora do ar) com window.WALLACE_LEGENDAS_REMOTAS (id->texto, buscado da tabela `legendas` no
// Supabase pelo script no HTML). PRECISA rodar DEPOIS do bloco WALLACE_DADOS_REMOTOS acima - bug
// real encontrado e corrigido nesta mesma sessao: `wallace_dados.dados` tem uma chave `LEGENDAS`
// de nivel superior (snapshot antigo, de antes desta tabela existir) que o `Object.assign(VARS, dr)`
// aplica por cima de TUDO - se este bloco rodasse antes (como na 1a tentativa), esse LEGENDAS velho
// sobrescrevia a mesclagem silenciosamente, sem erro nenhum, e nenhuma edicao no Supabase novo aparecia.
// Rodando depois, este bloco sempre tem a ultima palavra sobre VARS.LEGENDAS, nao importa o que exista
// (ou volte a existir) em wallace_dados.
if(typeof window !== 'undefined' && window.WALLACE_LEGENDAS_REMOTAS){
  VARS.LEGENDAS = Object.assign({}, VARS.LEGENDAS, window.WALLACE_LEGENDAS_REMOTAS);
}
Object.freeze(VARS.LEGENDAS);

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
VARS.caixaBensDuraveis = calcularSaldoCaixa(VARS.BENS_DURAVEIS_SALDO_INICIAL, VARS.BENS_DURAVEIS_TRANSACOES);
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
// MODULARIZAÇÃO 07/08/2026: aplicarStatusVencidoEValorMercadoOpcoes() e calcularROCOpcoes() foram
// extraídas pra src/modules/opcoes-roc.js — carregado via <script> ESTÁTICO no HTML, ANTES deste
// arquivo (garante que as funções já existem quando as chamadas abaixo rodam, preservando a mesma
// ordem de execução de antes — este código depende de VARS.opcoesVendidasDetalhe já populado e
// hydrate()/recalcularAgregadosDerivados() dependem do resultado destas 2 chamadas). Nenhuma fórmula
// ou comportamento mudou, só o arquivo que hospeda o código das funções.
aplicarStatusVencidoEValorMercadoOpcoes();
calcularROCOpcoes();
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
// CORRIGIDO 05/08/2026 (parte 98, decisao explicita do usuario apos discussao: "deve remover o
// custo de LRBD da caixa variavel, para liberar o saldo da caixa variavel, esse custo do fone e
// cortador pertence a outro centro de custo, mesmo ja estando no cartao de credito"): Bens Duraveis
// agora e um CENTRO DE CUSTO SEPARADO da Caixa Variavel, mesmo padrao conceitual do custo corporativo
// (LRC) - a diferenca fisica (bens duraveis E cobrado na MESMA fatura MB, corporativo nunca foi) so
// importa pro calculo de cartaoMBTotal (que continua intacto, feito a parte, nunca deriva desta soma -
// ver comentario em cartaoMBTotal, e mantido manualmente junto de mbLRWConfirmado a cada compra) - nao
// importa pro que a Caixa Variavel considera "comprometido do meu dia a dia". EXTRAORDINARIO_BENS_DURAVEIS
// e a mesma fonte unica ja usada pro PIB (consumoNaoRecorrentePIB) e pro teto (comprometidoParaTeto) -
// reaproveitada aqui, nao inventada de novo.
const somaBensDuraveisComprometido = Math.round((VARS.EXTRAORDINARIO_BENS_DURAVEIS||[]).reduce((s,t)=>s+(t.valor||0),0)*100)/100;
VARS.CICLO_SNAPSHOTS['2026-07'].caixaVariavelComprometido = Math.round((VARS.visaLRWHistorico + VARS.visaLRVHistorico + VARS.mbLRWConfirmado + VARS.mbLRVConfirmado - somaBensDuraveisComprometido) * 100) / 100;
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

  // CORRIGIDO 06/08/2026 (BUG_CONFIRMADO_V1_LRC_OBSOLETO, ver AUDITORIA_IMPACTO_BUG_LRC.md):
  // VARS.livroLRC so era calculado 1x no boot (app.js, a partir do array do ciclo ENTAO-atual) e nunca
  // mais recalculado - ao trocar pra um ciclo fechado, VARS.LRC_LIMBO_TRANSACOES acima ja virava a
  // fotografia congelada certa, mas livroLRC continuava sendo a soma do ciclo atual, nao do ciclo
  // selecionado. Resultado: a perna 3 da cascata (abaixo) usava o LRC errado sempre que um ciclo fechado
  // estava selecionado. Corrigido: livroLRC agora e recalculado AQUI, depois que VARS.LRC_LIMBO_TRANSACOES
  // ja reflete o ciclo certo (fechado ou atual) - a mesma formula de sempre (V203), so que na hora certa.
  VARS.livroLRC = Math.round(VARS.LRC_LIMBO_TRANSACOES.reduce((s,t)=>s+t.valor,0)*100)/100;

  // CORRIGIDO 31/07/2026 (V223, pedido do usuario): reembolsoPagaCartaoCorporativo (perna 3, "Corporativo
  // cartao Infinite/MB") lia de snap.cascata.cartaoCorporativo, um numero manual desconectado dos livros
  // reais - por isso ficava 0 mesmo com R$297,31 ja lancados no LRC (MB) este ciclo. Agora deriva de
  // verdade dos 2 livros corporativos (Visa + MB), nunca mais dessincroniza. cartaoCorporativo dentro do
  // snapshot fica so como registro historico/override manual quando necessario via cicloAtualOverrides,
  // mas nao e mais a fonte primaria deste calculo. (Reordenado 06/08/2026 pra rodar DEPOIS do recalculo
  // de livroLRC acima - ver BUG_CONFIRMADO_V1_LRC_OBSOLETO.)
  VARS.reembolsoPagaCartaoCorporativo = Math.round((VARS.livroLRCVisaOnly + VARS.livroLRC) * 100) / 100;
}
aplicarCicloAoVARS(VARS.cicloAtual); // aplica o ciclo padrao (2026-07) ANTES do REG nascer

// CORRIGIDO 05/08/2026 (parte 104, usuario apontou "Fatura atual (aberta)" mostrando R$0,00 mesmo com
// Parcelas proprias + Transporte corporativo somando mais de zero): achado real - o proprio Pluggy
// retorna fatura_mes_atual.valor_total = 0 pra conta Mercado Pago (CREDIT) mesmo com transacoes
// recentes reais na mesma conta (compras postadas, corporativo pendente). Nao e o app.js confundindo
// saldo total rotativo com fatura do mes (saldo total fica em conta.saldo, nunca usado aqui) - e a
// Pluggy devolvendo um valor_total que nao bate com a realidade pra essa conta especifica.
// Fallback: se VARS.mercadoPagoFatura (setado pela Pluggy acima) vier 0 (ou null) MAS o proprio ERP já
// tiver uma soma bottom-up > 0 pras duas pernas que compoem essa fatura (parcelas proprias ativas +
// transporte corporativo pendente, os dois numeros já mostrados separados no painel), usa essa soma em
// vez do 0 da Pluggy - nunca esconde do usuario um valor que o proprio sistema já sabe que é real.
// Marca a origem (mercadoPagoFaturaOrigem) pra o rodape/console poder distinguir "veio da Pluggy" de
// "fallback calculado" (transparencia, nao finge que a Pluggy confirmou um numero que ela nao confirmou).
if((!VARS.mercadoPagoFatura || VARS.mercadoPagoFatura === 0)){
  const somaFallback = Math.round(((VARS.totalOpProvMP||0) + (VARS.reembolsoPagaMPCorporativo||0)) * 100) / 100;
  if(somaFallback > 0){
    VARS.mercadoPagoFatura = somaFallback;
    VARS.mercadoPagoFaturaOrigem = 'fallback_erp_pluggy_zerada';
    console.warn('mercadoPagoFatura: Pluggy devolveu 0 pra fatura_mes_atual, usando soma do ERP (Parcelas proprias + Transporte corporativo) =', somaFallback);
  } else {
    VARS.mercadoPagoFaturaOrigem = 'pluggy_ou_zero_real';
  }
} else {
  VARS.mercadoPagoFaturaOrigem = 'pluggy';
}

// FASE 3 (07/08/2026, modularização de REG): REG deixou de ser um literal monolítico - agora é
// montado por Object.assign() de 7 fragmentos por domínio, cada um uma função fábrica (avaliada
// aqui, depois que VARS já existe - mesmo padrão de ordem de CARTAO_PLUGGY_MAPA_DEFAULT). Mesma
// estrutura de dados consumida pelo resto do sistema, sem nenhuma mudança de forma.
const REG = {};
Object.assign(REG, criarRegOperacional());
Object.assign(REG, criarRegCaixas());
Object.assign(REG, criarRegMercadoPago());
Object.assign(REG, criarRegP2P());
Object.assign(REG, criarRegPatrimonio());
Object.assign(REG, criarRegReembolsos());
Object.assign(REG, criarRegBalanco());

// CALCULADO 20/07/2026 (pedido do usuario, pontos 1 e 2 da auditoria): estes registradores paravam de
// ser numeros fixos digitados a mao e passam a ser DERIVADOS dos componentes reais, na mesma linha do
// que ja acontecia com CAIXA_VARIAVEL.disponivel (sempre = saldoReal-comprometido). Isso elimina a classe
// de bug encontrada nesta sessao (ex: sobra da cascata ficou 2 dias errada porque ninguem lembrou de
// atualizar o numero fixo quando um componente mudou). Os componentes (totalOpDetalhe, reembolsoCicloTotal
// etc.) continuam sendo os valores digitados/confirmados - só os agregados que dependem deles viram formula.
// NOVO 05/08/2026 (parte 102, pedido do usuario: "o valor de necessidade do mes e o alivio de pressao
// sao interligadas, deve haver uma base unica, um unico lugar"). Fonte UNICA do calendario das caixas
// incrementais (quando cada uma completa e libera aporte, quando uma nova comeca) - usada tanto pelo
// grafico "Alivio de pressao" (secao 08, pagina Graficos) quanto pela projecao de Necessidade Liquida
// (secao 05). Antes eram 2 implementacoes separadas da MESMA logica, podendo divergir silenciosamente.
// Indice 0 = ciclo atual (Jul/26), cada indice seguinte = 1 ciclo financeiro a frente.
function calcularAporteIncrementalPorCiclo(i){
  let v = VARS.seguroEmplacamentoAporte + VARS.BENS_DURAVEIS_APORTE_MENSAL_ALVO; // continuos, sem data de termino conhecida
  if(i < 2) v += 200;                              // Aniversario Julio - completa Set/26 (14/09)
  if(i < 4) v += 500;                               // Escola Julio ciclo atual - completa Nov/26 (01/11)
  if(i < 16) v += 100;                              // Saude Familia - projeta completar ~Nov/27
  if(i >= 6 && i <= 16) v += VARS.escolaJulio2027Aporte; // Escola Julio 2027 - Jan/27 a Nov/27 (11 meses)
  return Math.round(v*100)/100;
}
function recalcularAgregadosDerivados(){
  const r2 = x => Math.round(x*100)/100;

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
  // MODULARIZAÇÃO 07/08/2026: domínio Caixas extraído pra src/modules/recalcular-caixas.js — mesma
  // fórmula, chamada logo aqui (posição original das linhas de Caixa Variável). Também inclui
  // pixDiversos.liquido (movido do fim da função pra cá — sem dependência de nada calculado depois,
  // resultado final idêntico).
  recalcularCaixas();
  // MODULARIZAÇÃO 07/08/2026: domínio Patrimônio extraído pra src/modules/recalcular-patrimonio.js —
  // mesma fórmula, chamada logo aqui (posição original das linhas de Patrimônio/Balanço). Ver nota no
  // módulo sobre por que patrimonioLiquido/ativosTotal/patrimonioTotalGeral ficam aqui e não em
  // recalcularBalanco() (chamada por último).
  recalcularPatrimonio();
  // MODULARIZAÇÃO 07/08/2026: domínio Cartões/Mercado Pago extraído pra
  // src/modules/recalcular-mercado-pago.js — mesma fórmula, chamada logo aqui (posição original das
  // linhas de Visa/totalOpDetalhe recorrências-assinaturas).
  recalcularMercadoPago();
  // MODULARIZAÇÃO 07/08/2026: domínio P2P extraído pra src/modules/recalcular-p2p.js — mesma
  // fórmula, chamada logo aqui (posição original das linhas de P2P).
  recalcularP2P();
  // MODULARIZAÇÃO 07/08/2026: domínio Reembolsos extraído pra src/modules/recalcular-reembolsos.js —
  // mesma fórmula, chamada logo aqui (posição original da linha reembolsoPassThroughCorporativo, a
  // primeira do domínio no arquivo).
  recalcularReembolsos();
  // MODULARIZAÇÃO 07/08/2026: domínio Necessidade/Modo Operacional extraído pra
  // src/modules/recalcular-necessidade.js — mesma fórmula, chamada aqui (várias linhas do original
  // que ficavam intercaladas com PIB Wallace/Balanço foram reagrupadas pra esta função — ver comentário
  // no módulo).
  recalcularNecessidade();
  // MODULARIZAÇÃO 07/08/2026: domínio Indicadores (PIB Wallace) extraído pra
  // src/modules/recalcular-indicadores.js — mesma fórmula, chamada logo aqui (posição original do
  // bloco PIB Wallace).
  recalcularIndicadores();
  // MODULARIZAÇÃO 07/08/2026: domínio Balanço extraído pra src/modules/recalcular-balanco.js — mesma
  // fórmula, ÚLTIMO domínio chamado (depende de todos os demais já terem rodado). Fecha a quebra de
  // recalcularAgregadosDerivados() em 8 funções especializadas — agora só orquestra, na mesma ordem
  // de sempre.
  recalcularBalanco();
}
recalcularAgregadosDerivados(); // chamada inicial, na carga da pagina

// V145: aplicarCicloAoVARS() ja definida acima (antes do REG). trocarCiclo() e usada pelo seletor no HTML.
// MODULARIZAÇÃO 07/08/2026: trocarCiclo()/atualizarGraficosPorCiclo()/atualizarBotoesSeletorCiclo()
// extraídas pra src/modules/ciclo-selecao.js — funções globais, carregam ANTES do app.js. Chamadas
// por referência (onclick/chamadas internas), continuam iguais. Nenhuma fórmula ou comportamento
// mudou.

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
// MODULARIZAÇÃO 07/08/2026: atualizarContadoresAbasLR() extraída pra
// src/modules/atualizar-contadores-abas-lr.js — função global autocontida, carrega ANTES do app.js.
// A chamada onDomPronto(atualizarContadoresAbasLR) mais abaixo continua igual. Nenhuma fórmula ou
// comportamento mudou.

// V168: gera as tabelas de LRW/LRV/LRC-limbo/LRCV a partir dos arrays estruturados acima -
// nunca mais editar essas 4 tabelas na mao. Cada nova compra so precisa entrar no array certo.
// MODULARIZAÇÃO 07/08/2026: renderLivrosVariaveis() (gera tabelas LRW/LRV/LRC-limbo/LRCV/LRPV/PV/
// LRBD + 9 caixas LR simples + LREI) extraída pra src/modules/render-livros-variaveis.js — função
// global autocontida, carrega ANTES do app.js. A chamada onDomPronto(renderLivrosVariaveis) mais
// abaixo continua igual (referência de função). Nenhuma fórmula ou comportamento mudou.

// MODULARIZAÇÃO 07/08/2026: Inbox Financeira (gerarProximoInboxId/inboxAdicionarItem/
// persistirTriagem*/inboxAprovar/inboxRejeitar/renderInboxFinanceira) extraída pra
// src/modules/inbox-financeira.js — funções globais, carregam ANTES do app.js. Chamadas por
// referência (onclick/onDomPronto/dentro de outras funções), continuam iguais. Nenhuma fórmula ou
// comportamento mudou.

// MODULARIZAÇÃO 07/08/2026: CARTAO_PLUGGY_MAPA_DEFAULT/gerarIdExternoPluggy/pluggyJaTriado/
// reconciliarPluggy extraídas pra src/modules/pluggy-reconciliacao.js — funções globais, carregam
// ANTES do app.js. A linha abaixo FICA AQUI de propósito (avaliação síncrona que precisa de VARS já
// populado — ver nota completa no topo do módulo). Nenhuma fórmula ou comportamento mudou.
const CARTAO_PLUGGY_MAPA = VARS.CARTAO_PLUGGY_MAPA || CARTAO_PLUGGY_MAPA_DEFAULT;

// MODULARIZAÇÃO 07/08/2026: classificarViaV2()/reconciliarTransacoesPluggy() extraídas pra
// src/modules/pluggy-reconciliacao.js — funções globais, carregam ANTES do app.js. Chamadas por
// referência (onDomPronto), continuam iguais. Nenhuma fórmula ou comportamento mudou.

// MODULARIZAÇÃO 07/08/2026: classificarItemDeterministico/classificarInboxPendentes/
// classificarItemMercadoPago/sincronizarMercadoPagoParaInbox extraídas pra
// src/modules/classificacao-inbox.js — funções globais, carregam ANTES do app.js. Chamadas por
// referência (onDomPronto/dentro de outras funções), continuam iguais. Nenhuma fórmula ou
// comportamento mudou.

// Etapa 9 (Dashboard) - indicadores derivados so da Inbox (origem 'Mercado Pago') e de
// VARS.MERCADOPAGO_EVENTOS, nunca de um calculo/estimativa nova - mesma regra P1 de sempre. Enquanto
// mercadopago_sync.py nao roda de verdade, a secao fica com "—" em tudo (sem dado fabricado), igual a
// Inbox ficou vazia ate a Etapa 1 ter dado real (mesmo padrao ja usado, nao e bug).
// MODULARIZAÇÃO 07/08/2026: renderMercadoPagoDashboard() extraída pra
// src/modules/render-mercado-pago-dashboard.js — função global autocontida, carrega ANTES do
// app.js. A chamada onDomPronto(renderMercadoPagoDashboard) mais abaixo continua igual. Nenhuma
// fórmula ou comportamento mudou.

// MODULARIZAÇÃO 07/08/2026: renderParcelamentos() extraída pra src/modules/render-parcelamentos.js
// — função global autocontida, carrega ANTES do app.js. A chamada onDomPronto(renderParcelamentos)
// mais abaixo continua igual. Nenhuma fórmula ou comportamento mudou.

// MODULARIZAÇÃO 07/08/2026: atualizarContagemAbas() foi extraída pra
// src/modules/contagem-abas-livros-razao.js — único chamador é aplicarFiltroLivrosRazao() (já
// extraída), sempre lazy. Nenhuma fórmula ou comportamento mudou, só o arquivo que hospeda o código.

// MODULARIZAÇÃO 07/08/2026: popularSeletorCiclo() extraída pra src/modules/popular-seletor-ciclo.js
// — depende de CICLO_LISTA/trocarCiclo()/atualizarBotoesSeletorCiclo() (globais aqui em app.js), já
// existentes no momento da CHAMADA (via onDomPronto, bem depois do app.js inteiro já ter carregado).
// A chamada onDomPronto(popularSeletorCiclo) mais abaixo continua igual. Nenhuma fórmula ou
// comportamento mudou.


// V135 (22/07/2026): labels/cores do detalhamento Visa Infinite, compartilhados pelos 3 graficos que
// usam Object.values(REG.visaDetalhe) (cVisa, g_cVisa, g_cVisaBar) - antes cada um tinha sua propria
// copia do array de labels (3x), agora todos leem daqui. Ordem tem que bater exatamente com a ordem
// das chaves de REG.visaDetalhe (parcelas, consorcios, wallace, recorrencias, corp, assinaturas,
// vanessa, naoReconciliado).
const VISA_DETALHE_LABELS = ['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa','Não Reconciliado'];
const VISA_DETALHE_CORES = ['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0','#4a4d52'];

function hydrate(){
  hydrateResumoExecutivo(); // MODULARIZAÇÃO 07/08/2026: KPIs do topo + Modo Operacional (seção 02) + seção 20 + Resumo Executivo (seção 21) + badges soltos extraídos pra src/modules/hydrate-resumo-executivo.js — mesma sequência, nenhum id/fórmula alterado.

  hydrateCenarios(); // MODULARIZAÇÃO 07/08/2026: Reserva de Emergência (secao 04) + Cenário Histórico (secao 01/02) extraídos pra src/modules/hydrate-cenarios.js — mesma sequência, nenhum id/fórmula alterado.

  hydrateEstimadorSalario(); // MODULARIZAÇÃO 07/08/2026: Estimador de Salário extraído pra src/modules/hydrate-estimador-salario.js — mesma sequência, nenhum id/fórmula alterado.

  hydrateLivrosRazao(); // MODULARIZAÇÃO 07/08/2026: totais (tfoot) das tabelas de Livros Razão extraídos pra src/modules/hydrate-livros-razao.js — mesma sequência, nenhum id/fórmula alterado.

  hydrateResumoP2P(); // MODULARIZAÇÃO 07/08/2026: cover-metrics + resumo Caixa Variável + Operações P2P extraídos pra src/modules/hydrate-resumo-p2p.js — mesma sequência, nenhum id/fórmula alterado.

  // MODULARIZAÇÃO 07/08/2026: patrimônio breakdown + seção 11 (Passivos Patrimoniais) extraídos pra
  // src/modules/hydrate-patrimonio.js — mesma sequência, nenhum id/fórmula alterado.
  hydratePatrimonio();

  // MODULARIZAÇÃO 07/08/2026: seção 05 (Caixas Operacionais) extraída pra src/modules/hydrate-caixas.js
  // — mesma sequência, nenhum id/fórmula alterado.
  hydrateCaixas();

  aplicarOnda3Suavizacao(); // NOVO 08/08/2026 (Onda 3, Prioridade 4 — Metas): sobrescreve o card Fundo de Suavização Salarial com V2 (vw_saldo_v2_por_caixa) — roda depois de hydrateCaixas() (V1) de propósito, só sobrescreve em caso de sucesso e zero divergência.

  hydrateVisaMB(); // MODULARIZAÇÃO 07/08/2026: breakdown Visa Infinite + Mastercard Black extraído pra src/modules/hydrate-visa-mb.js — mesma sequência, nenhum id/fórmula alterado.

  aplicarOnda3LrwLrv(); // NOVO 08/08/2026 (Onda 3, Prioridade 2): sobrescreve mbLRW/mbLRV com V2 (vw_compromisso_cartao_por_pessoa) — roda depois de hydrateVisaMB() (V1) de propósito, só sobrescreve em caso de sucesso.

  hydrateMercadoPago(); // MODULARIZAÇÃO 07/08/2026: indicadores de Mercado Pago extraídos pra src/modules/hydrate-mercado-pago.js — só renderização, cálculo continua em recalcularAgregadosDerivados(), nenhum id/fórmula alterado.

  hydrateResumoCartoes(); // MODULARIZAÇÃO 07/08/2026: títulos/totais centralizados (secoes 01/02/03) + Alívio + Piso Absoluto extraídos pra src/modules/hydrate-resumo-cartoes.js — mesma sequência, nenhum id/fórmula alterado.

  hydrateReembolsos(); // MODULARIZAÇÃO 07/08/2026: indicadores de Reembolso (cascata) + Meta de Investimento extraídos pra src/modules/hydrate-reembolsos.js — mesma sequência, nenhum id/fórmula alterado.

  hydrateWartsilaCaixasTextos(); // MODULARIZAÇÃO 07/08/2026: Caixa Wärtsilä + textos/barras Saúde-Aniversário-Seguro + resíduo de Livros Razão (tfLRCDetalhe/tfPixDiversos) extraídos pra src/modules/hydrate-wartsila-caixas-textos.js — mesma sequência, nenhum id/fórmula alterado.

  hydrateMetas(); // MODULARIZAÇÃO 07/08/2026: seções 12/13 (Consórcio Casa Nova / Projeto Casa Nova) + badges de metas do Resumo Executivo extraídos pra src/modules/hydrate-metas.js — mesma sequência (inclui a chamada hydrateROC() no meio), nenhum id/fórmula alterado.

  hydrateBalanco(); // MODULARIZAÇÃO 07/08/2026: Balanço Patrimonial completo (última seção do hydrate()) extraído pra src/modules/hydrate-balanco.js — inclui a chamada hydrateIndicadores() no meio, mesma sequência, nenhum id/fórmula alterado. hydrate() esgotado.

  // ONDA 1 — MIGRAÇÃO V2 → PAINEL (08/08/2026): roda DEPOIS de todo o hydrate V1 acima já ter
  // escrito seus valores (precisa deles como referência pra comparação). Assíncrona (fetch a
  // vw_saldo_v2_por_caixa) — sobrescreve só 4 ids (Boletos/PIX Vanessa/Caixa Variável saldoReal/
  // Mastercard-Infinite) quando a resposta chegar, com fallback automático pro valor V1 já
  // escrito acima se o fetch falhar. Rollback: comentar esta linha. Ver hydrate-onda1-v2.js.
  aplicarOnda1V2();

  // ONDA 2 — MIGRAÇÃO V2 → PAINEL (08/08/2026): mesmo padrão da Onda 1, agora pras 11 caixas
  // restantes (overlay CONDICIONAL — só troca pra V2 se não houver divergência; ver
  // hydrate-onda2-v2.js) + diagnóstico Fase 1 do Livro Razão (só compara e loga, não muda
  // nenhuma renderização de tabela). Rollback: comentar as 2 linhas abaixo.
  aplicarOnda2V2();
  diagnosticoLivroRazaoFase1();

  // ONDA 3 — pendência transversal "Caixa Lance nunca classificada" (08/08/2026): mesmo padrão
  // da Onda 2, reaproveitando vw_saldo_v2_por_caixa. Divergência de R$4,37 (0,10%) tem causa
  // indeterminada/baixa confiança (não "documentada" no sentido da regra) — continua exibindo V1,
  // só passa a logar a divergência em vez de nunca ter sido comparada. Ver hydrate-onda3-caixalance.js.
  aplicarOnda3CaixaLance();

  // ONDA 4 — "SUPABASE COMO FONTE ÚNICA DE VERDADE" (08/08/2026): diferente das Ondas 1-3, aqui a
  // V2 já É a fonte primária assim que os dados existem (sem gate de divergência) — os valores
  // foram migrados diretamente dos mesmos literais do V1, zero divergência por construção.
  // Fallback pra V1 só em erro técnico. Domínio 1: Patrimônio (patrimonio + financiamentos, view
  // vw_patrimonio_v2). Exceção deliberada: caixaLance continua V1 (ver hydrate-onda4-patrimonio.js).
  aplicarOnda4Patrimonio();

  // ONDA 4, domínio 2 (Investimentos/ROC): reaproveita aplicarStatusVencidoEValorMercadoOpcoes()/
  // calcularROCOpcoes()/hydrateROC() (V1, inalteradas) sobre dado vindo de `investimentos` (V2) —
  // ver hydrate-onda4-investimentos.js.
  aplicarOnda4Investimentos();
}
onDomPronto(hydrate); // V170: corrigido - antes nunca rodava (script injetado dinamicamente, DOMContentLoaded ja tinha disparado)
// MODULARIZAÇÃO 07/08/2026: initBuscaGlobal/renderCapaNav/toggleBtnVoltarCapa/renderPageStrip e o
// listener de scroll foram extraídos junto com suas funções pra src/modules/dashboard-navegacao.js —
// ver comentário perto de onde CAPA_DESTINOS estava (topo do arquivo). Continuam rodando via
// onDomPronto (mesma lógica "chama na hora se o DOM já tiver pronto"), só que registrados na cadeia
// onload depois do app.js, não mais aqui.
onDomPronto(popularSeletorCiclo); // V145/V170: cria os botoes do seletor de ciclo
onDomPronto(renderParcelamentos); // V155/V170: gera as tabelas de parcelamento (LRP/LRMP) a partir dos arrays estruturados
onDomPronto(renderLivrosVariaveis); // V168/V170: gera as tabelas LRW/LRV/LRC-limbo/LRCV a partir dos arrays estruturados
// ONDA 3 (08/08/2026): registrado DEPOIS de renderLivrosVariaveis() de propósito — precisa que a
// tabela já tenha sido preenchida com V1 antes de tentar sobrescrever com V2 (senão a ordem
// inverteria e V1 apagaria o V2 escrito antes). Fallback automático: só sobrescreve em caso de
// sucesso do fetch. Rollback: comentar esta linha.
onDomPronto(aplicarOnda3LivroRazao);
// ONDA 4, domínio 3 — LREI (08/08/2026): mesmo motivo de ordem do comentário acima — precisa que
// renderLivrosVariaveis() (V1) já tenha rodado. Reaproveita a própria função pra redesenhar, agora
// com VARS.LREI_ATIVAS vindo da V2. Ver hydrate-onda4-lrei.js.
onDomPronto(aplicarOnda4Lrei);
onDomPronto(renderInboxFinanceira); // V400 Etapa 1: gera a tabela da Inbox Financeira (continua, nao filtrada por ciclo)
// V400 Etapas 2/3: rodam apos renderInboxFinanceira (mesma tabela que elas alimentam via inboxAdicionarItem).
// Ate hoje (03/08/2026) essas 2 funcoes so tinham sido testadas em harness Node isolado, nunca ligadas
// ao carregamento real da pagina - VARS.PLUGGY_CONTAS ja chega pronto antes daqui (aplicado de
// window.WALLACE_DADOS_REMOTOS no topo do arquivo), entao e seguro rodar no mesmo onDomPronto.
onDomPronto(reconciliarPluggy);
onDomPronto(() => { reconciliarTransacoesPluggy().then(() => classificarInboxPendentes()); }); // CORRIGIDO 06/08/2026 (parte 115): reconciliarTransacoesPluggy virou async (parte 114, chamadas V2) - os itens novos so existem DEPOIS do await resolver, entao o classificarInboxPendentes() que ja rodava synchronous logo abaixo (linha ~4792) corria ANTES desses itens existirem e nunca os via. Re-chama aqui, encadeado, garantindo que V1 (classificarInboxPendentes, fallback) rode DEPOIS que a V2 (classificarViaV2, dentro do reconciliar) ja teve a chance - V2 tem prioridade (mais especifica, curada no Supabase), V1 so preenche o que sobrar (categoriaSugerida ja setado nunca e sobrescrito, confirmado no proprio classificarInboxPendentes).
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
// MODULARIZAÇÃO 07/08/2026: auditoriaAutomatica() extraída pra src/modules/auditoria-automatica.js
// — função global autocontida, carrega ANTES do app.js. A chamada onDomPronto(auditoriaAutomatica)
// abaixo continua igual. Nenhuma fórmula ou comportamento mudou.
onDomPronto(auditoriaAutomatica); // V170: corrigido

// WallaceFinanceService foi MOVIDO pro topo do arquivo (08/08/2026, logo após onDomPronto) —
// corrige bug real de ordem de execução (onDomPronto rodava hydrate() antes do parser chegar
// aqui). Ver comentário completo lá em cima. Nada mais mudou nesta função.
(async function auditoriaCruzadaV1V2(){
  try {
    const resumoV2 = await WallaceFinanceService.getDashboardResumo();
    if(!resumoV2) return;

    // NOVO parte 105: mostra cobertura de categorização da V2 (Fase 3) - quantas das transações
    // migradas já têm categoria_id preenchido, pra acompanhar o avanço do motor de classificação
    // sem precisar abrir o Supabase. Badge próprio, não sobrescreve o syncV2Badge (saldo).
    if(resumoV2.kpis){
      const badgeCat = document.getElementById('catV2Badge');
      if(badgeCat){
        const total = resumoV2.kpis.total_transacoes;
        const semCategoria = resumoV2.kpis.transacoes_sem_categoria;
        const comCategoria = total - semCategoria;
        badgeCat.textContent = `📊 ${comCategoria}/${total} categorizadas`;
        badgeCat.title = `Arquitetura V2 (Supabase): ${comCategoria} de ${total} transações já têm categoria via regras_classificacao (Fase 3). ${semCategoria} ainda sem categoria (nomes de pessoa sem padrão seguro, na maioria).`;
      }
    }

    // NOVO parte 107: painel flutuante autocontido mostrando as 18 caixas direto da V2 (Fase 5,
    // primeiro consumo VISÍVEL de verdade da RPC além dos badges). Injetado via JS puro, não
    // depende de nenhum elemento existente no HTML - zero risco de quebrar layout. Fecha por
    // padrão (só o botão fica visível); clique abre/fecha. Só leitura, mesma disciplina das outras
    // peças desta sessão.
    // NOVO 07/08/2026 (pedido do usuário: botões flutuantes "não estão combinando, não simétrico"):
    // dock flutuante único via flexbox pros 2 botões ("+ Lançar" e "💰 V2"), injetado 1x. Antes cada
    // um tinha position:fixed com right em rem fixo — quando o texto de um crescia (badge de
    // divergência), colava no outro (já corrigido uma vez à mão, parte 144, mas voltava a acontecer
    // toda vez que o texto mudava de tamanho). Com flexbox os dois sempre ficam alinhados e nunca se
    // sobrepõem, não importa o tamanho do texto. Só CSS/posicionamento — nenhum cálculo, nenhuma
    // fórmula, nenhum dado tocado.
    if(!document.getElementById('wallaceFabStyles')){
      const wallaceFabCss = document.createElement('style');
      wallaceFabCss.id = 'wallaceFabStyles';
      wallaceFabCss.textContent = `
        #wallaceFabDock{position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:0.6rem}
        /* NOVO 08/08/2026 (pedido do usuario: "no mobile os botoes ficam muito baixos, podem ficar em
           meia lua na lateral da tela"): em telas estreitas o dock sai do canto inferior (perto da
           barra de UI do navegador, dificil de alcancar com o polegar) e vai pro meio da lateral
           direita, centralizado verticalmente - mais facil de alcancar numa mao so e longe da barra
           do navegador. */
        @media (max-width:640px){
          #wallaceFabDock{bottom:auto;top:44%;right:0;transform:translateY(-50%);gap:0.7rem}
          /* NOVO 08/08/2026 (pedido do usuario: "quero que eles sejam uma aba na tela, ai quando
             passar o dedo ele aparece e abre o campo"): cada botao fica quase todo escondido pra fora
             da borda direita (so uma tira visivel, "aba"). Tocar nela revela o dock inteiro (desliza
             pra dentro da tela); tocar de novo no botao ja revelado executa a acao normal (abre o
             painel/form). Fecha sozinho (volta a ser aba) depois de alguns segundos sem uso ou ao
             tocar fora - controlado em JS, ver mais abaixo (dataset.abaLigada).
             AJUSTADO ainda 08/08/2026 (usuario pediu de novo, com print marcando a altura certa):
             posicao subiu de 50% pra 44% (mais perto do meio da capa, no lugar marcado no print) e o
             formato virou retangulo alto (nao mais circulo) - mais facil de notar como "aba" real, e
             a tira que fica visivel por padrao aumentou de 16px pra 22px (mais perceptivel sem abrir
             ainda). Cantos arredondados so do lado esquerdo (o direito fica sempre fora da tela). */
          #wallaceFabDock .wallace-fab{height:4.4rem;border-radius:16px 0 0 16px;transform:translateX(calc(100% - 22px))}
          #wallaceFabDock .wallace-fab-icon{width:2.6rem;height:4.4rem}
          #wallaceFabDock.wallace-fab-dock--aberto .wallace-fab{transform:translateX(0)}
        }
        /* REDESENHADO 07/08/2026 (pedido do usuário): pill fino → botão sólido preenchido. REFEITO
           ainda 07/08/2026 (pedido explícito do usuário, ficou pendente uma sessão inteira: "círculo
           pequeno com ícone, e ao passar o mouse uma tira lateral desliza revelando o texto" — não
           mais um pill sempre expandido com texto visível). Agora é um círculo fixo (2.6rem, só o
           ícone) e o rótulo mora num span à parte, com max-width 0/opacity 0 por padrão — no hover
           (ou foco, pra acessibilidade via teclado) o rótulo expande e aparece ao lado do ícone.
        */
        .wallace-fab{position:relative;order:1;display:inline-flex;align-items:center;height:2.6rem;padding:0;border-radius:999px;border:none;cursor:pointer;background:linear-gradient(155deg,#4a9eff,#3987e5);color:#fff;box-shadow:0 6px 20px rgba(57,135,229,0.4),0 2px 4px rgba(0,0,0,0.25);overflow:hidden;transition:transform .18s cubic-bezier(.34,1.56,.64,1),box-shadow .18s ease,filter .18s ease}
        .wallace-fab-icon{flex:0 0 2.6rem;width:2.6rem;height:2.6rem;display:flex;align-items:center;justify-content:center;font-size:1.05rem;position:relative}
        .wallace-fab-label{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;font-size:0.78rem;font-weight:700;letter-spacing:0.01em;transition:max-width .3s ease,opacity .2s ease,padding-right .3s ease}
        .wallace-fab--lancar{order:2;background:linear-gradient(155deg,#3fd68a,#27a866);box-shadow:0 6px 20px rgba(39,168,102,0.4),0 2px 4px rgba(0,0,0,0.25)}
        .wallace-fab--warn{background:linear-gradient(155deg,#f0b94d,#d99a2b);box-shadow:0 6px 20px rgba(217,154,43,0.4),0 2px 4px rgba(0,0,0,0.25)}
        /* CORRIGIDO 08/08/2026 (pedido do usuario: "no mobile os botoes ficaram travado"): :hover em
           touchscreen fica "grudado" depois do toque (o navegador simula hover no tap e so remove
           quando o usuario toca em outro lugar) - o botao ficava com o rotulo expandido/preso depois
           de 1 toque so, parecendo travado. Isolado dentro de @media(hover:hover), que so e verdadeiro
           em dispositivos com mouse de verdade - touch nunca aciona esse bloco, sempre fica so o
           circulo com o icone (o clique/tap continua funcionando normal, so nao expande visualmente). */
        @media (hover:hover) and (pointer:fine){
          .wallace-fab:hover,.wallace-fab:focus-visible{transform:translateY(-3px) scale(1.02);filter:brightness(1.08);box-shadow:0 10px 26px rgba(57,135,229,0.5),0 3px 6px rgba(0,0,0,0.3)}
          .wallace-fab:active{transform:translateY(-1px) scale(0.98)}
          .wallace-fab:hover .wallace-fab-label,.wallace-fab:focus-visible .wallace-fab-label{max-width:8rem;opacity:1;padding-right:1.05rem}
          .wallace-fab--lancar:hover,.wallace-fab--lancar:focus-visible{box-shadow:0 10px 26px rgba(39,168,102,0.5),0 3px 6px rgba(0,0,0,0.3)}
          .wallace-fab--warn:hover,.wallace-fab--warn:focus-visible{box-shadow:0 10px 26px rgba(217,154,43,0.5),0 3px 6px rgba(0,0,0,0.3)}
        }
        .wallace-fab-badge{position:absolute;top:-0.25rem;right:-0.25rem;min-width:1.15rem;height:1.15rem;padding:0 0.3rem;border-radius:999px;background:#e2554f;color:#fff;font-size:0.62rem;font-weight:800;display:none;align-items:center;justify-content:center;box-shadow:0 0 0 3px #0b0c0e,0 2px 6px rgba(226,85,79,0.5);line-height:1}
        .wallace-panel{position:fixed;right:1.25rem;bottom:4rem;z-index:9999;width:280px;max-height:70vh;overflow-y:auto;background:#0f1620;border:1px solid #2d3b52;border-radius:10px;padding:0.8rem;font-size:0.78rem;color:#c8d4e3;box-shadow:0 4px 20px rgba(0,0,0,.4);display:none}
      `;
      document.head.appendChild(wallaceFabCss);
    }
    if(!document.getElementById('wallaceFabDock')){
      const wallaceFabDock = document.createElement('div');
      wallaceFabDock.id = 'wallaceFabDock';
      document.body.appendChild(wallaceFabDock);
    }
    // NOVO 07/08/2026 (pedido do usuario): clique fora de qualquer painel flutuante (V2 ou Lancar)
    // fecha ele sozinho. 1 listener global, registrado 1x (guard por window.__wallaceFabOutsideClick__)
    // - fecha o painel/form clicado fora, mas ignora clique no proprio dock (senao o botao que abre
    // fecharia no mesmo clique).
    if(!window.__wallaceFabOutsideClick__){
      window.__wallaceFabOutsideClick__ = true;
      document.addEventListener('click', (ev) => {
        const dock = document.getElementById('wallaceFabDock');
        if(dock && dock.contains(ev.target)) return;
        const painelV2 = document.getElementById('painelV2Caixas');
        if(painelV2 && painelV2.style.display === 'block' && !painelV2.contains(ev.target)) painelV2.style.display = 'none';
        const formLancar = document.getElementById('formLancarTx');
        if(formLancar && formLancar.style.display === 'block' && !formLancar.contains(ev.target)) formLancar.style.display = 'none';
      });
    }

    if(resumoV2.caixas && resumoV2.caixas.length && !document.getElementById('painelV2Caixas')){
      const btn = document.createElement('button');
      btn.id = 'painelV2Toggle';
      btn.className = 'wallace-fab';
      btn.title = 'Ver as 18 caixas calculadas pela Arquitetura V2 (Supabase), calibradas com saldo real em 05/08/2026';
      const btnIconWrap = document.createElement('span');
      btnIconWrap.className = 'wallace-fab-icon';
      btnIconWrap.textContent = '💰';
      const btnBadge = document.createElement('span');
      btnBadge.className = 'wallace-fab-badge';
      btnIconWrap.appendChild(btnBadge);
      const btnLabel = document.createElement('span');
      btnLabel.className = 'wallace-fab-label';
      btnLabel.textContent = 'V2';
      btn.appendChild(btnIconWrap);
      btn.appendChild(btnLabel);

      const painel = document.createElement('div');
      painel.id = 'painelV2Caixas';
      painel.className = 'wallace-panel';
      const CAIXAS_CAMPO_SALDO_CUMULATIVO = new Set(['Caixa Mastercard/Infinite', 'PIX Vanessa']);
      const campoCicloOuSaldo = c => CAIXAS_CAMPO_SALDO_CUMULATIVO.has(c.nome) ? c.saldo : c.saldo_real_ciclo_atual;
      const linhas = resumoV2.caixas
        .slice()
        // CORRIGIDO 06/08/2026 (parte 130, print real mostrou 10/13 "divergencias" que eram erro meu,
        // nao erro de dado): a suposicao da parte 129 ("saldo cumulativo bate com V1 pra todas exceto
        // Caixa Variavel") tambem estava errada. Confirmado numero a numero contra o V1 real: SO
        // Mastercard/Infinite e PIX Vanessa usam "saldo" (cumulativo) - todas as outras 11 (incluindo
        // Caixa Variavel) usam saldo_real_ciclo_atual (resetam por ciclo/aporte mensal). Set explicito,
        // nao mais um "todas menos 1" genérico - erro real de menos chance de acontecer de novo.
        .sort((a,b) => campoCicloOuSaldo(b) - campoCicloOuSaldo(a))
        .map(c => { const v = campoCicloOuSaldo(c);
          return `<div style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid #1c2836"><span>${c.nome}</span><span class="v" style="font-weight:600;color:${v < 0 ? '#e2554f' : '#c8d4e3'}">R$${v.toFixed(2)}</span></div>`;
        })
        .join('');

      // NOVO parte 110: patrimônio líquido, metas e reembolsos - já vêm na mesma resposta da RPC
      // (resumoV2.patrimonio_resumo/metas/reembolsos_resumo), zero chamada de rede extra.
      const pat = resumoV2.patrimonio_resumo || {};
      const blocoPatrimonio = pat.liquido != null ? `
        <div style="font-weight:700;margin:0.7rem 0 0.4rem;color:#8ab4f8">Patrimônio Líquido</div>
        <div style="display:flex;justify-content:space-between;padding:0.15rem 0"><span>Ativo</span><span class="v">R$${Number(pat.total_ativo).toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:0.15rem 0"><span>Passivo</span><span class="v" style="color:#e2554f">R$${Number(pat.total_passivo).toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:0.15rem 0;font-weight:700"><span>Líquido</span><span class="v">R$${Number(pat.liquido).toFixed(2)}</span></div>` : '';

      const metas = resumoV2.metas || [];
      const blocoMetas = metas.length ? `
        <div style="font-weight:700;margin:0.7rem 0 0.4rem;color:#8ab4f8">Metas</div>
        ${metas.map(m => `<div style="display:flex;justify-content:space-between;padding:0.15rem 0"><span>${m.nome}</span><span class="v">${m.pct}%</span></div>`).join('')}` : '';

      const reemb = resumoV2.reembolsos_resumo || [];
      const blocoReembolsos = reemb.length ? `
        <div style="font-weight:700;margin:0.7rem 0 0.4rem;color:#8ab4f8">Reembolsos</div>
        ${reemb.map(r => `<div style="display:flex;justify-content:space-between;padding:0.15rem 0"><span>${r.origem} (${r.status})</span><span class="v">R$${(Number(r.a_receber)-Number(r.recebido)).toFixed(2)}</span></div>`).join('')}` : '';

      const investimentos = resumoV2.investimentos || [];
      const blocoInvestimentos = investimentos.length ? `
        <div style="font-weight:700;margin:0.7rem 0 0.4rem;color:#8ab4f8">Investimentos</div>
        ${investimentos.map(i => `<div style="display:flex;justify-content:space-between;padding:0.15rem 0"><span>${i.tipo}${i.quantidade!=null ? ' ('+i.quantidade+')' : ''}</span><span class="v" style="color:${i.valor_atual < 0 ? '#e2554f' : '#c8d4e3'}">R$${Number(i.valor_atual).toFixed(2)}</span></div>`).join('')}` : '';

      const indic = resumoV2.indicadores_recentes || [];
      const pib = indic.filter(i => i.nome.startsWith('PIB Wallace'));
      const pibTotal = pib.find(i => i.nome === 'PIB Wallace - total');
      const blocoIndicadores = pibTotal ? `
        <div style="font-weight:700;margin:0.7rem 0 0.4rem;color:#8ab4f8">PIB Wallace (${pibTotal.data})</div>
        ${pib.filter(i => i.nome !== 'PIB Wallace - total').map(i => `<div style="display:flex;justify-content:space-between;padding:0.15rem 0"><span>${i.nome.replace('PIB Wallace - ','')}</span><span class="v">R$${Number(i.valor).toFixed(2)}</span></div>`).join('')}
        <div style="display:flex;justify-content:space-between;padding:0.15rem 0;font-weight:700"><span>Total</span><span class="v">R$${Number(pibTotal.valor).toFixed(2)}</span></div>` : '';

      const avisos = resumoV2.avisos || [];
      const blocoAvisos = avisos.length ? `
        <div style="font-weight:700;margin:0.7rem 0 0.4rem;color:#e2a53d">⚠ Avisos estruturais</div>
        ${avisos.map(a => `<div style="padding:0.15rem 0;color:#e2a53d;font-size:0.72rem">${a}</div>`).join('')}` : '';

      painel.innerHTML = `<div style="font-weight:700;margin-bottom:0.5rem;color:#8ab4f8">Caixas — Arquitetura V2</div>${linhas}${blocoPatrimonio}${blocoInvestimentos}${blocoMetas}${blocoReembolsos}${blocoIndicadores}${blocoAvisos}<div style="margin-top:0.5rem;padding-top:0.4rem;border-top:1px solid #2d3b52;font-size:0.7rem;color:#6b7a8f">Fonte: rpc_dashboard_resumo() · calibrado com dado real 05/08/2026</div>`;

      if(avisos.length){
        atualizarBadgeV2(avisos.length, 'avisos estruturais da Arquitetura V2');
      }
      btn.onclick = () => {
        const abrir = painel.style.display !== 'block';
        painel.style.display = abrir ? 'block' : 'none';
        const formEl = document.getElementById('formLancarTx');
        if(abrir && formEl) formEl.style.display = 'none';
      };
      document.getElementById('wallaceFabDock').appendChild(btn);
      document.body.appendChild(painel);
    }

    // NOVO 05/08/2026 (parte 111, Fase 4 da Arquitetura V2 - "trocar a via de entrada, tela de
    // lançamento manual"): primeira versão real, minimalista - form flutuante que grava direto na
    // tabela `transacoes` via RPC `lancar_transacao_manual()` (escopo restrito: só INSERT, valida
    // tipo/valor/caixa_id antes de gravar). Lista caixas/categorias da propria resumoV2 (ja veio na
    // mesma chamada, zero fetch extra pra popular os selects).
    if(resumoV2.caixas && !document.getElementById('btnLancarTx')){
      const btnLancar = document.createElement('button');
      btnLancar.id = 'btnLancarTx';
      btnLancar.className = 'wallace-fab wallace-fab--lancar';
      btnLancar.title = 'Lançar uma transação direto na Arquitetura V2 (Supabase relacional)';
      const btnLancarIcon = document.createElement('span');
      btnLancarIcon.className = 'wallace-fab-icon';
      btnLancarIcon.textContent = '＋';
      const btnLancarLabel = document.createElement('span');
      btnLancarLabel.className = 'wallace-fab-label';
      btnLancarLabel.textContent = 'Lançar';
      btnLancar.appendChild(btnLancarIcon);
      btnLancar.appendChild(btnLancarLabel);
      // CORRIGIDO 07/08/2026: agora entra no dock flutuante (#wallaceFabDock, flexbox) em vez de
      // right:9.5rem fixo — nunca mais cola no botão V2, mesmo com o badge crescendo.

      const form = document.createElement('div');
      form.id = 'formLancarTx';
      form.className = 'wallace-panel';
      form.style.width = '260px';
      const caixaOpts = resumoV2.caixas.slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
      form.innerHTML = `
        <div style="font-weight:700;margin-bottom:0.5rem;color:#5fd68a">Lançar transação (V2)</div>
        <input id="ltxData" type="date" style="width:100%;margin-bottom:0.4rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem">
        <input id="ltxDescricao" placeholder="Descrição" style="width:100%;margin-bottom:0.4rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;box-sizing:border-box">
        <input id="ltxValor" type="number" step="0.01" placeholder="Valor" style="width:100%;margin-bottom:0.4rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;box-sizing:border-box">
        <select id="ltxTipo" style="width:100%;margin-bottom:0.4rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem"><option value="saida">Saída</option><option value="entrada">Entrada</option></select>
        <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.72rem;color:#c8d4e3;margin-bottom:0.3rem;cursor:pointer"><input id="ltxDividir" type="checkbox" style="margin:0"> Dividir entre mais de 1 caixa</label>
        <select id="ltxCaixa" style="width:100%;margin-bottom:0.4rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem">${caixaOpts}</select>
        <div id="ltxSplitRows" style="display:none;margin-bottom:0.4rem"></div>
        <button id="ltxSplitAdd" type="button" style="display:none;width:100%;margin-bottom:0.4rem;background:#1a2332;color:#8ab4f8;border:1px dashed #2d3b52;border-radius:5px;padding:0.3rem;cursor:pointer;font-size:0.72rem">+ Adicionar caixa</button>
        <div id="ltxSplitRestante" style="display:none;font-size:0.68rem;margin-bottom:0.4rem"></div>
        <select id="ltxUsuario" style="width:100%;margin-bottom:0.4rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem"><option value="">Usuário (opcional)</option><option value="f70b0f48-9d73-44fd-a05b-6f3248bbea21">Wallace</option><option value="77496938-c875-4578-b6d1-06ffbde3f247">Vanessa</option><option value="89f205ad-2381-4149-b10f-7170aa13f5d5">Júlio</option><option value="3bb93c24-8353-4a4b-91cb-ef055809cc04">Gabriela</option></select>
        <div style="font-size:0.68rem;color:#8ab4f8;margin-bottom:0.15rem">Categoria</div>
        <select id="ltxCategoria" style="width:100%;margin-bottom:0.3rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem"><option value="">Categoria (opcional)</option><option value="533eef0f-0591-4c23-a248-566b95da7ffd">Alimentação</option><option value="69866dc9-89f9-42e3-b10c-5898287c6dd2">Assinaturas</option><option value="558fb61e-c215-4970-a498-b6fbcf67dd97">Bens Duráveis</option><option value="89557dd0-e475-483d-8d90-7cf698c3103a">Boletos</option><option value="b6576c3a-e74e-4f06-afcf-8b07c42785b0">Consórcios</option><option value="e5f8498f-ec63-41db-a333-3de5e8a9a7e3">Educação</option><option value="99915d56-41d2-4ca5-8d5f-c6188b33dc06">Eventos e Viagens</option><option value="f143d814-3883-4f24-a636-7ff80b9f6d1b">P2P</option><option value="1cc9db18-aec4-4cf1-962d-4d9a36f44f70">Reembolsável Corporativo</option><option value="5937378d-f087-48a4-8815-c1ab8055fdf8">Saúde</option><option value="2f08db6b-a018-471f-ad9c-26cb453e3b87">Transporte</option><option value="__nova__">+ Nova categoria…</option></select>
        <div id="ltxNovaCategoriaBox" style="display:none;gap:0.3rem;margin-bottom:0.4rem">
          <input id="ltxNovaCategoriaNome" placeholder="Nome da categoria nova" style="flex:1;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;min-width:0;box-sizing:border-box">
          <button id="ltxNovaCategoriaCriar" type="button" style="background:#1f5c38;color:#5fd68a;border:none;border-radius:5px;padding:0 0.6rem;cursor:pointer;font-size:0.72rem">Criar</button>
        </div>
        <div id="ltxSugestao" style="font-size:0.68rem;color:#8ab4f8;margin-bottom:0.4rem;min-height:1em"></div>
        <button id="ltxSalvar" style="width:100%;background:#1f5c38;color:#5fd68a;border:none;border-radius:5px;padding:0.4rem;cursor:pointer;font-weight:600">Salvar</button>
        <div id="ltxMsg" style="margin-top:0.4rem;font-size:0.72rem"></div>`;
      btnLancar.onclick = () => {
        const abrir = form.style.display !== 'block';
        form.style.display = abrir ? 'block' : 'none';
        const painelEl = document.getElementById('painelV2Caixas');
        if(abrir && painelEl) painelEl.style.display = 'none';
      };
      document.getElementById('wallaceFabDock').appendChild(btnLancar);
      document.body.appendChild(form);

      // NOVO 08/08/2026 (pedido do usuario: "no mobile quero que eles sejam uma aba na tela, ai
      // quando passar o dedo ele aparece e abre o campo"): no mobile (ver CSS acima, media
      // max-width:640px) o dock comeca quase todo fora da tela, so uma tira visivel. 1o toque revela
      // (classe wallace-fab-dock--aberto, so isso - nao dispara a acao do botao ainda); com o dock ja
      // revelado, o toque seguinte passa direto pro onclick normal do botao (abre painel/form). Fecha
      // sozinho (volta a ser so a tira) depois de alguns segundos sem uso, ou ao tocar fora do dock -
      // guard por dataset pra rodar so uma vez mesmo chamado de novo em recargas do resumo V2.
      const dockEl = document.getElementById('wallaceFabDock');
      if(dockEl && !dockEl.dataset.abaLigada && window.matchMedia('(max-width:640px)').matches){
        dockEl.dataset.abaLigada = '1';
        let timerFecharAba = null;
        const fecharAba = () => dockEl.classList.remove('wallace-fab-dock--aberto');
        const agendarFechamento = () => { clearTimeout(timerFecharAba); timerFecharAba = setTimeout(fecharAba, 4000); };
        dockEl.addEventListener('click', (ev) => {
          if(!dockEl.classList.contains('wallace-fab-dock--aberto')){
            ev.preventDefault();
            ev.stopPropagation();
            dockEl.classList.add('wallace-fab-dock--aberto');
          }
          agendarFechamento();
        }, true); // fase de captura - roda ANTES do onclick de cada botao, pra poder interceptar o 1o toque
        document.addEventListener('click', (ev) => { if(!dockEl.contains(ev.target)) fecharAba(); });
      }

      // NOVO 06/08/2026 (parte 119): fecha o pipeline Nivel1->2->3 no unico form interativo que
      // existe hoje - ao escolher categoria/usuario, chama resolver_caixa() de verdade e AUTO-
      // SELECIONA a caixa sugerida no <select> (usuario ainda pode trocar manualmente, nunca trava).
      const sugerirCaixa = async () => {
        const catId = document.getElementById('ltxCategoria').value;
        const usrId = document.getElementById('ltxUsuario').value;
        const sugEl = document.getElementById('ltxSugestao');
        if(!catId){ sugEl.textContent = ''; return; }
        sugEl.textContent = 'Resolvendo caixa...';
        try {
          const r = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/resolver_caixa', {
            method:'POST',
            headers: { 'Content-Type':'application/json', apikey:'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization:'Bearer sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg' },
            body: JSON.stringify({ p_categoria_id:catId, p_usuario_id:usrId||null, p_origem:'manual' })
          });
          const caixaId = r.ok ? await r.json() : null;
          if(caixaId){
            document.getElementById('ltxCaixa').value = caixaId;
            const nomeOpt = document.querySelector(`#ltxCaixa option[value="${caixaId}"]`);
            sugEl.textContent = `✓ Sugerido: ${nomeOpt ? nomeOpt.textContent : caixaId}`;
          } else {
            sugEl.textContent = 'Sem regra pra essa combinação — escolha a caixa manualmente.';
          }
        } catch(e){ sugEl.textContent = ''; }
      };
      // NOVO 07/08/2026 (pedido do usuário: "campo pra eu criar novas categorias caso eu queira"):
      // opção "+ Nova categoria..." no select abre uma caixa de texto + botão Criar, que chama a RPC
      // criar_categoria() (nova, SECURITY DEFINER, valida nome/tipo, evita duplicata por nome) -
      // devolve o id, adiciona como <option> de verdade no select e já deixa selecionada.
      document.getElementById('ltxCategoria').addEventListener('change', function(){
        const box = document.getElementById('ltxNovaCategoriaBox');
        box.style.display = this.value === '__nova__' ? 'flex' : 'none';
        if(this.value !== '__nova__') sugerirCaixa();
      });
      document.getElementById('ltxNovaCategoriaCriar').onclick = async () => {
        const nomeEl = document.getElementById('ltxNovaCategoriaNome');
        const nome = nomeEl.value.trim();
        const msg = document.getElementById('ltxMsg');
        if(!nome){ msg.textContent = 'Digite um nome pra categoria nova.'; msg.style.color = '#e2554f'; return; }
        msg.textContent = 'Criando categoria...'; msg.style.color = '#c8d4e3';
        try {
          const r = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/criar_categoria', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'apikey':'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', 'Authorization':'Bearer sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg' },
            body: JSON.stringify({ p_nome: nome, p_tipo: 'extraordinaria' })
          });
          if(!r.ok){ const err = await r.text(); msg.textContent = 'Erro ao criar categoria: '+err; msg.style.color = '#e2554f'; return; }
          const novoId = await r.json();
          const sel = document.getElementById('ltxCategoria');
          const opt = document.createElement('option');
          opt.value = novoId; opt.textContent = nome;
          sel.insertBefore(opt, sel.querySelector('option[value="__nova__"]'));
          sel.value = novoId;
          document.getElementById('ltxNovaCategoriaBox').style.display = 'none';
          nomeEl.value = '';
          msg.textContent = `✓ Categoria "${nome}" criada e selecionada.`; msg.style.color = '#5fd68a';
          sugerirCaixa();
        } catch(e){ msg.textContent = 'Erro de rede: '+e.message; msg.style.color = '#e2554f'; }
      };
      document.getElementById('ltxUsuario').onchange = sugerirCaixa;

      // NOVO 07/08/2026 (pedido do usuário: "implemente a opção de dividir o valor para mandar para
      // mais de 1 caixa"): a RPC lancar_transacao_manual só aceita 1 caixa por chamada - em vez de
      // mudar a RPC, o form agora pode chamá-la VÁRIAS VEZES em sequência (1 por linha da divisão),
      // mesma data/descrição/tipo/categoria/usuário, só caixa_id e valor mudam por linha. Cada linha
      // vira uma transação própria na V2 (rastreável separadamente, mesmo comportamento de uma
      // divisão real entre caixas).
      const criarLinhaSplit = () => {
        const row = document.createElement('div');
        row.className = 'ltx-split-row';
        row.style.cssText = 'display:flex;gap:0.3rem;margin-bottom:0.3rem';
        row.innerHTML = `
          <select class="ltxSplitCaixa" style="flex:2;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;min-width:0">${caixaOpts}</select>
          <input class="ltxSplitValor" type="number" step="0.01" placeholder="Valor" style="flex:1;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;min-width:0;box-sizing:border-box">
          <button type="button" class="ltxSplitDel" style="background:none;border:none;color:#e2554f;cursor:pointer;font-size:0.9rem;padding:0 0.2rem">✕</button>`;
        row.querySelector('.ltxSplitValor').oninput = atualizarRestante;
        row.querySelector('.ltxSplitDel').onclick = () => { row.remove(); atualizarRestante(); };
        return row;
      };
      const atualizarRestante = () => {
        const totalDeclarado = parseFloat(document.getElementById('ltxValor').value) || 0;
        const linhas = document.querySelectorAll('#ltxSplitRows .ltxSplitValor');
        let somado = 0;
        linhas.forEach(l => { somado += parseFloat(l.value) || 0; });
        const restante = Math.round((totalDeclarado - somado) * 100) / 100;
        const el = document.getElementById('ltxSplitRestante');
        el.textContent = `Restante a alocar: ${restante.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} de ${totalDeclarado.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
        el.style.color = Math.abs(restante) < 0.01 ? '#5fd68a' : '#e8a63a';
      };
      document.getElementById('ltxDividir').onchange = (e) => {
        const ativo = e.target.checked;
        document.getElementById('ltxCaixa').style.display = ativo ? 'none' : 'block';
        document.getElementById('ltxSplitRows').style.display = ativo ? 'block' : 'none';
        document.getElementById('ltxSplitAdd').style.display = ativo ? 'block' : 'none';
        document.getElementById('ltxSplitRestante').style.display = ativo ? 'block' : 'none';
        const rowsEl = document.getElementById('ltxSplitRows');
        if(ativo && !rowsEl.children.length){
          rowsEl.appendChild(criarLinhaSplit());
          rowsEl.appendChild(criarLinhaSplit());
          atualizarRestante();
        }
      };
      document.getElementById('ltxSplitAdd').onclick = () => { document.getElementById('ltxSplitRows').appendChild(criarLinhaSplit()); atualizarRestante(); };
      document.getElementById('ltxValor').addEventListener('input', atualizarRestante);

      document.getElementById('ltxSalvar').onclick = async () => {
        const msg = document.getElementById('ltxMsg');
        const data = document.getElementById('ltxData').value;
        const descricao = document.getElementById('ltxDescricao').value.trim();
        const valor = parseFloat(document.getElementById('ltxValor').value);
        const tipo = document.getElementById('ltxTipo').value;
        const dividir = document.getElementById('ltxDividir').checked;
        if(!data || !descricao || !valor || valor <= 0){ msg.textContent = 'Preencha data, descrição e valor (>0).'; msg.style.color = '#e2554f'; return; }
        const usuarioId = document.getElementById('ltxUsuario').value || null;
        const categoriaId = document.getElementById('ltxCategoria').value || null;

        let lancamentos; // [{caixaId, valor}]
        if(dividir){
          lancamentos = Array.from(document.querySelectorAll('#ltxSplitRows .ltx-split-row')).map(row => ({
            caixaId: row.querySelector('.ltxSplitCaixa').value,
            valor: parseFloat(row.querySelector('.ltxSplitValor').value)
          }));
          if(lancamentos.some(l => !l.valor || l.valor <= 0)){ msg.textContent = 'Preencha um valor (>0) em cada caixa da divisão.'; msg.style.color = '#e2554f'; return; }
          const somado = Math.round(lancamentos.reduce((s,l)=>s+l.valor,0)*100)/100;
          if(Math.abs(somado - Math.round(valor*100)/100) >= 0.01){ msg.textContent = `A soma das caixas (${somado.toLocaleString('pt-BR',{minimumFractionDigits:2})}) precisa bater com o Valor total (${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}).`; msg.style.color = '#e2554f'; return; }
        } else {
          lancamentos = [{ caixaId: document.getElementById('ltxCaixa').value, valor }];
        }

        msg.textContent = 'Salvando...'; msg.style.color = '#c8d4e3';
        try {
          for(const l of lancamentos){
            const r = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/lancar_transacao_manual', {
              method: 'POST',
              headers: { 'Content-Type':'application/json', 'apikey':'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', 'Authorization':'Bearer sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg' },
              body: JSON.stringify({ p_data:data, p_descricao:descricao, p_valor:l.valor, p_tipo:tipo, p_caixa_id:l.caixaId, p_usuario_id:usuarioId, p_categoria_id:categoriaId })
            });
            if(!r.ok){ const err = await r.text(); msg.textContent = `Erro (parte já lançada antes desta pode ter sido gravada): ${err}`; msg.style.color = '#e2554f'; return; }
          }
          msg.textContent = lancamentos.length > 1
            ? `✓ Lançado em ${lancamentos.length} caixas (só na V2/Supabase — o app.js/V1 não recalcula sozinho, é dado paralelo até a Fase 5 unificar).`
            : '✓ Lançado (só na V2/Supabase — o app.js/V1 não recalcula sozinho, é dado paralelo até a Fase 5 unificar).';
          msg.style.color = '#5fd68a';
          document.getElementById('ltxDescricao').value = ''; document.getElementById('ltxValor').value = '';
          document.getElementById('ltxSplitRows').innerHTML = '';
          document.getElementById('ltxDividir').checked = false;
          document.getElementById('ltxDividir').dispatchEvent(new Event('change'));
        } catch(e){ msg.textContent = 'Erro de rede: '+e.message; msg.style.color = '#e2554f'; }
      };
    }

    // CORRIGIDO 06/08/2026 (parte 130, print real do usuario mostrou 10/13 caixas "divergindo" - eram
    // TODAS um erro meu, nao um erro de dado): a suposicao da parte 118 ("saldo_real_ciclo_atual so
    // vale pra Caixa Variavel") estava ERRADA. Testado numero a numero contra o print: Boletos, Lance,
    // Manutencao, Aniversario Julio, Eventos, Saude Familia, Seguro Emplacamento, Combustivel,
    // Churrasco, Bens Duraveis batem EXATO com saldo_real_ciclo_atual (sao caixas de aporte
    // mensal/ciclo, resetam como a Caixa Variavel) - so Mastercard/Infinite e PIX Vanessa sao
    // realmente cumulativas (usam "saldo"). Mapa agora diz qual campo usar POR CAIXA, nao mais uma
    // regra unica pra todas.
    // NOVO 07/08/2026: badge fixo (numero num circulo, canto do botao) em vez de mudar o texto do
    // botao (`💰 V2 (N)` / `💰 V2 ⚠ N`) - a mudanca de texto era a causa raiz do bug de alinhamento
    // com o botao "+ Lancar" ja corrigido antes (largura do botao mudava toda vez que N mudava de
    // digito). Acumula avisos estruturais + divergencias reais no mesmo contador, chamada de 2 pontos
    // diferentes deste bloco (nunca reseta a zero entre as chamadas, so soma).
    function atualizarBadgeV2(qtd, motivo){
      const b = document.getElementById('painelV2Toggle');
      if(!b || !qtd) return;
      let badge = b.querySelector('.wallace-fab-badge');
      if(!badge){ badge = document.createElement('span'); badge.className = 'wallace-fab-badge'; b.appendChild(badge); }
      const total = (parseInt(b.dataset.avisos || '0', 10)) + qtd;
      b.dataset.avisos = String(total);
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.style.display = 'flex';
      b.classList.add('wallace-fab--warn');
      b.title = `${total} aviso(s) na Arquitetura V2 — ${motivo}`;
    }
    const divergenciasV1V2 = [];
    // NOVO 07/08/2026: caixas com diferenca V1/V2 ja investigada e explicada por motivo de negocio
    // (nao e bug de sincronizacao) - saem da lista de "divergencia ativa" e vao pra um bloco proprio,
    // informativo, sem contar no badge de aviso do botao. Boletos e Lance dependem de uma ancora de
    // fechamento de ciclo confiavel pra fechar o numero de verdade (fora de escopo por decisao do
    // usuario, ver ESTADO_ATUAL.md); Bens Duraveis e deficit inicial conhecido, nao anomalia.
    const explicadasV1V2 = [];
    const CAIXAS_EXPLICADAS_V1_V2 = {
      'Caixa Boletos': 'corte de ciclo hardcoded afeta essa caixa de forma nao-uniforme (ja investigado, sem correcao uniforme viavel) - ver ESTADO_ATUAL.md',
      'Caixa Lance': 'reconciliada linha a linha contra extrato bancario/app Itau em 08/08/2026 - V1 confirmado correto, resíduo e o V2 desatualizado (nunca recebeu os lancamentos manuais feitos so no V1)',
      'Caixa Bens Duráveis': 'deficit inicial conhecido (caixa criada negativa, sem fundo previo) - nao e anomalia',
      // ADICIONADAS 08/08/2026: investigacao completa (rendimento real dos cofrinhos confirmado ao
      // vivo no app Mercado Pago pelo usuario, comparado contra V1 - ver conversa da sessao) mostrou
      // que essas 9 caixas divergem do V2 pelo mesmo motivo - o V2 nunca foi atualizado com
      // rendimento/lancamentos que so entraram no V1. Nao e bug, e a arquitetura V2 ainda nao ter
      // sincronizacao automatica com o V1 (ver docs/changelog/ESTADO_ATUAL.md, secao "duas
      // arquiteturas"). Usuario confirmou pra fechar o assunto, nao reabrir.
      'Caixa Manutenção': 'V2 desatualizado - nao recebeu os lancamentos reais de 06-07/08 que so entraram no V1',
      'Caixa Aniversário Júlio': 'V2 desatualizado - nao recebeu os lancamentos reais de 06-07/08 que so entraram no V1',
      'Caixa Eventos': 'V2 desatualizado - rendimento real do cofrinho (confirmado ao vivo no app MP) nunca chega no V2',
      'Caixa Saúde Família': 'V2 desatualizado - nao recebeu o reembolso Bradesco Saude de 07/08 que so entrou no V1',
      'Caixa Seguro Emplacamento': 'V2 desatualizado - rendimento real do cofrinho (confirmado ao vivo no app MP) nunca chega no V2',
      'Caixa Combustível': 'V2 desatualizado - rendimento real do cofrinho (confirmado ao vivo no app MP) nunca chega no V2',
      'Caixa Churrasco': 'V2 desatualizado - rendimento real do cofrinho (confirmado ao vivo no app MP) nunca chega no V2',
      'Escola de Júlio': 'V2 desatualizado - rendimento real do cofrinho (confirmado ao vivo no app MP) nunca chega no V2',
      'PIX Geral Vanessa': 'saldo_inicial_ciclo duplicado no Supabase (R$78,04, dupla-contagem ja documentada) + V2 desatualizado'
    };
    const MAPA_CAIXAS_V1_V2 = {
      'Caixa Boletos':{campo:'caixaBoletos', tipo:'ciclo', domId:'balResBoletos'}, 'Caixa Lance':{campo:'caixaLance', tipo:'ciclo', domId:'balResLance'},
      'Caixa Manutenção':{campo:'caixaManutencao', tipo:'ciclo', domId:'balResManut'}, 'Caixa Aniversário Júlio':{campo:'caixaAniversarioJulio', tipo:'ciclo', domId:'balResAniv'},
      'Caixa Eventos':{campo:'caixaEventos', tipo:'ciclo', domId:'balResEventos'}, 'Caixa Saúde Família':{campo:'caixaSaudeFamilia', tipo:'ciclo', domId:'balResSaude'},
      'Caixa Seguro Emplacamento':{campo:'caixaSeguroEmplacamento', tipo:'ciclo', domId:'balResSeguro'}, 'Caixa Combustível':{campo:'caixaCombustivel', tipo:'ciclo', domId:'balResCombustivel'},
      'Caixa Churrasco':{campo:'caixaChurrasco', tipo:'ciclo', domId:'balResChurrasco'}, 'Caixa Bens Duráveis':{campo:'caixaBensDuraveis', tipo:'ciclo', domId:'balResBensDuraveis'},
      'Escola de Júlio':{campo:'escolaJulioSaldo', tipo:'ciclo', domId:'balResEscola'},
      'Caixa Mastercard/Infinite':{campo:'caixaMastercardInfinite', tipo:'saldo'},
      'PIX Vanessa':{campo:'caixaPixVanessa', tipo:'saldo', domId:'balResPixVanessa'}, 'Conta Suavização (CC-304)':{campo:'contaSuavizacao', tipo:'saldo', domId:'balResSuavizacao'},
      // ADICIONADA 06/08/2026 (parte 143): PIX Geral Vanessa existe como caixa propria na V2 (nao
      // sabia disso ate agora - so tinha PIX Vanessa/PV mapeada). Formula V1 e mais complexa (subtrai
      // PGV_RENDIMENTO_CDI_NAO_RASTREADO) - tipo 'saldo' e um palpite conservador (nao cycle-scoped
      // pelo array), mas a TRAVA DE SEGURANCA do promoverCampoV2SeConfiavel protege: so promove
      // 'balOpPixVanessa' se realmente bater (d<=0.05), senao so fica no console como divergencia,
      // nunca promove errado.
      'PIX Geral Vanessa':{campo:'pixGeralVanessaSaldo', tipo:'ciclo'}
    };
    Object.entries(MAPA_CAIXAS_V1_V2).forEach(([nomeV2, cfg])=>{
      const cxV2 = (resumoV2.caixas||[]).find(c => c.nome === nomeV2);
      if(!cxV2 || typeof VARS[cfg.campo] !== 'number') return;
      const sV1 = VARS[cfg.campo];
      const sV2 = cfg.tipo === 'ciclo' ? cxV2.saldo_real_ciclo_atual : cxV2.saldo;
      const d = Math.round(Math.abs(sV1 - sV2)*100)/100;
      if(d > 0.05 && CAIXAS_EXPLICADAS_V1_V2[nomeV2]){
        console.info(`ℹ️ Auditoria V1↔V2: ${nomeV2} diverge (explicado) - V1=R$${sV1} vs V2=R$${sV2} (diff R$${d}). Motivo: ${CAIXAS_EXPLICADAS_V1_V2[nomeV2]}`);
        explicadasV1V2.push(`${nomeV2}: V1=R$${sV1} vs V2=R$${sV2} (diff R$${d}) — ${CAIXAS_EXPLICADAS_V1_V2[nomeV2]}`);
      } else if(d > 0.05){
        console.warn(`⚠️ Auditoria V1↔V2: ${nomeV2} diverge - V1=R$${sV1} vs V2=R$${sV2} (diff R$${d}).`);
        divergenciasV1V2.push(`${nomeV2}: V1=R$${sV1} vs V2=R$${sV2} (diff R$${d})`);
      } else if(cfg.domId && typeof promoverCampoV2SeConfiavel === 'function'){
        // NOVO 06/08/2026 (parte 138): mesma promocao com trava de seguranca das partes 136-137,
        // aplicada agora nas 12 linhas de texto simples da secao "Gestao das Reservas" (sem barra de
        // progresso, mesmo perfil de risco baixo ja validado). So promove quando ja confirmado batendo
        // (d<=0.05 aqui, mais rigoroso que os 5.00 do Balanco principal, porque estes valores sao
        // tipicamente menores - centenas, nao dezenas de milhares).
        promoverCampoV2SeConfiavel(cfg.domId, sV2, 0.06);
      }
      // NOVO 06/08/2026 (parte 139): so estas 4 caixas tem o trio saldo+%+barra dinamico confirmado -
      // promove independente do bloco acima (que ja rodou/nao rodou baseado no domId da Gestao das
      // Reservas), reaproveitando o mesmo sV2 ja calculado nesta iteracao.
      const CARDS_COM_BARRA = {
        'Caixa Boletos':     {idSaldo:'cxBoletosSaldo', idPct:'cxBoletosPct', idBarra:'cxBoletosBar', meta:2600},
        'PIX Vanessa':       {idSaldo:'cxPixSaldo',     idPct:'cxPixPct',     idBarra:'cxPixBar',     meta:1200},
        'Caixa Manutenção':  {idSaldo:'cxManutSaldo',   idPct:'cxManutPct',   idBarra:'cxManutBar',   meta:2000},
        'Escola de Júlio':   {idSaldo:'cxEscolaSaldo',  idPct:'cxEscolaPct',  idBarra:'cxEscolaBar',  meta:9236},
        // ADICIONADAS 06/08/2026 (parte 140): estas 4 tinham barra ESTATICA ate agora (bug pre-
        // existente achado na parte 139, corrigido nesta mesma rodada - agora tem trio dinamico real).
        // Saude/Aniversario/Seguro nao tem span de %, so idPct=null (funcao ja trata isso com seguranca).
        'Caixa Eventos':             {idSaldo:'cxEventosSaldo', idPct:'cxEventosPct', idBarra:'cxEventosBar', meta:2000},
        'Caixa Saúde Família':       {idSaldo:'cxSaudeSaldo',   idPct:null,           idBarra:'cxSaudeBar',   meta:1600},
        'Caixa Aniversário Júlio':   {idSaldo:'cxAnivSaldo',    idPct:null,           idBarra:'cxAnivBar',    meta:400},
        'Caixa Seguro Emplacamento': {idSaldo:'cxSeguroSaldo',  idPct:null,           idBarra:'cxSeguroBar',  meta:5100},
        'Conta Suavização (CC-304)': {idSaldo:'cxSuavizSaldo',  idPct:null,           idBarra:'cxSuavizBar',  meta:12000}
      };
      if(CARDS_COM_BARRA[nomeV2] && d <= 0.05){
        const cb = CARDS_COM_BARRA[nomeV2];
        promoverCaixaComBarraSeConfiavel(cb.idSaldo, cb.idPct, cb.idBarra, sV2, cb.meta, 0.06);
      }
      // NOVO 06/08/2026 (parte 140): Caixa Lance tambem aparece como linha de texto simples na secao
      // Patrimonio (id diferente de balResLance, que ja e promovido acima) - promove os 2 lugares.
      // NOVO 06/08/2026 (parte 141): 2 campos extra na secao "Reservas de Pagamento" (texto simples,
      // mesmos valores ja confirmados no mapa - Caixa Variavel e Mastercard/Infinite aparecem aqui
      // TAMBEM, alem de onde ja foram promovidos antes).
      if(nomeV2 === 'Caixa Variável' && d <= 0.05) promoverCampoV2SeConfiavel('balOpCaixaVariavel', sV2, 0.06);
      if(nomeV2 === 'Caixa Mastercard/Infinite' && d <= 0.05) promoverCampoV2SeConfiavel('balOpMastercardInfinite', sV2, 0.06);
      if(nomeV2 === 'PIX Geral Vanessa' && d <= 0.05){ promoverCampoV2SeConfiavel('balOpPixVanessa', sV2, 0.06); promoverCampoV2SeConfiavel('cxPgvSaldo', sV2, 0.06); }
      if(nomeV2 === 'Caixa Lance' && d <= 0.05) promoverCampoV2SeConfiavel('patLance', sV2, 0.06);
    });
    // NOVO 06/08/2026 (parte 124, achado da parte 123 - PIX Vanessa dessincronizada e ninguem tinha
    // visto porque so ia pro console): divergencias agora aparecem tambem NO PAINEL (visivel sem abrir
    // devtools), nao so no console.warn. Anexado direto no painel ja existente (nao recria do zero,
    // idempotente - so atualiza o proprio bloco a cada carga).
    const painelExistente = document.getElementById('painelV2Caixas');
    if(painelExistente){
      let blocoDiv = document.getElementById('painelV2Divergencias');
      if(!blocoDiv){
        blocoDiv = document.createElement('div');
        blocoDiv.id = 'painelV2Divergencias';
        painelExistente.appendChild(blocoDiv);
      }
      const blocoDivergentes = divergenciasV1V2.length
        ? `<div style="font-weight:700;margin:0.7rem 0 0.4rem;color:#e2a53d">⚠ V1↔V2 dessincronizado (${divergenciasV1V2.length})</div>${divergenciasV1V2.map(t=>`<div style="padding:0.15rem 0;color:#e2a53d;font-size:0.7rem">${t}</div>`).join('')}`
        : `<div style="margin-top:0.7rem;padding-top:0.4rem;border-top:1px solid #2d3b52;font-size:0.7rem;color:#34c98a">✓ V1↔V2 sincronizado (sem divergência ativa)</div>`;
      // REMOVIDO 08/08/2026 (pedido do usuario: "nao vejo utilidade de ter isso ai, pode remover"):
      // bloco "Diferenca explicada, nao e bug" nao aparece mais no painel visivel - continua sendo
      // calculado e logado no console (console.info acima) pra quem quiser conferir via devtools,
      // so nao polui mais a tela.
      blocoDiv.innerHTML = blocoDivergentes;
      if(divergenciasV1V2.length){
        atualizarBadgeV2(divergenciasV1V2.length, 'divergências V1↔V2 ativas');
      }
    }

    // NOVO 06/08/2026 (parte 120, prova de conceito real "V2 vira fonte exibida na tela", pedido do
    // usuario "avance"): primeiro valor onde a V2 aparece FORA do painel flutuante/console - direto
    // no Balanco, como nota complementar (nao substitui o V1 ainda, so mostra ao lado - baixo risco,
    // e so leitura adicional, nao mexe no calculo V1 existente). Zero fetch extra (resumoV2 ja veio).
    const elPatV2 = document.getElementById('balPatrimonioLiquidoV2');
    if(elPatV2 && resumoV2.patrimonio_resumo && resumoV2.patrimonio_resumo.liquido != null){
      elPatV2.textContent = `V2 (Supabase relacional): R$ ${Number(resumoV2.patrimonio_resumo.liquido).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
      // PROMOVIDO 06/08/2026 (parte 136, refatorado parte 137 pra usar promoverCampoV2SeConfiavel -
      // funcao com hoisting, definida mais abaixo neste mesmo bloco, ja disponivel aqui). Patrimonio
      // Liquido foi o primeiro campo promovido a fonte EXIBIDA (trava de seguranca <R$5 de diferenca).
      promoverCampoV2SeConfiavel('balPatrimonioLiquido', resumoV2.patrimonio_resumo.liquido, 5);
    }
    // NOVO 06/08/2026 (parte 137): extraida a logica de "promover com trava de seguranca" da parte 136
    // pra uma funcao reutilizavel - evita reescrever o mesmo bloco de comparacao 3x (Liquido, Ativo,
    // Passivo), reduz chance de um dos 3 ficar com a trava diferente por descuido de copy-paste.
    function promoverCampoV2SeConfiavel(idElementoPrincipal, valorV2, tolerancia){
      const el = document.getElementById(idElementoPrincipal);
      if(!el || valorV2 == null) return;
      const vAtual = parseFloat(el.textContent.replace(/[^\d,-]/g,'').replace('.','').replace(',','.'));
      if(!isNaN(vAtual) && Math.abs(vAtual - valorV2) < (tolerancia||5)){
        el.textContent = 'R$ ' + Number(valorV2).toLocaleString('pt-BR',{minimumFractionDigits:2});
        el.title = 'Fonte: Arquitetura V2 (Supabase relacional) - confirmado batendo com o cálculo V1 nesta sessão';
      }
    }
    // NOVO 06/08/2026 (parte 139): variante pros cards de caixa com barra de progresso (saldo+%+barra,
    // os 3 amarrados no mesmo numero) - so promove os 4 cards confirmados com o trio completo e
    // dinamico (Boletos, PIX Vanessa, Manutencao, Escola de Julio). As outras caixas com barra tem
    // problema PRE-EXISTENTE (barra estatica, nunca atualizada por JS - achado nesta sessao, nao
    // corrigido de proposito, fora do escopo desta promocao V2).
    function promoverCaixaComBarraSeConfiavel(idSaldo, idPct, idBarra, valorV2, meta, tolerancia){
      const elSaldo = document.getElementById(idSaldo);
      if(!elSaldo || valorV2 == null) return;
      const vAtual = parseFloat(elSaldo.textContent.replace(/[^\d,-]/g,'').replace('.','').replace(',','.'));
      if(isNaN(vAtual) || Math.abs(vAtual - valorV2) >= (tolerancia||0.06)) return;
      elSaldo.textContent = 'R$ ' + Number(valorV2).toLocaleString('pt-BR',{minimumFractionDigits:2});
      elSaldo.title = 'Fonte: Arquitetura V2 (Supabase relacional) - confirmado batendo com o cálculo V1 nesta sessão';
      if(meta > 0){
        const pct = Math.max(0, Math.min(100, Math.round((valorV2/meta)*1000)/10));
        const elPct = document.getElementById(idPct);
        if(elPct && /%/.test(elPct.textContent)) elPct.textContent = pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
        const elBarra = document.getElementById(idBarra);
        if(elBarra) elBarra.style.width = pct+'%';
      }
    }
    // AMPLIADO parte 121/137: nota complementar + promocao (mesma trava de seguranca da parte 136)
    // pros 2 totais que compoem o liquido - ajuda a ver ONDE a divergencia mora (ativo ou passivo) se
    // o total acima um dia nao bater, em vez de so saber que "algo" diverge.
    const elAtivoV2 = document.getElementById('balAtivosTotalV2');
    if(elAtivoV2 && resumoV2.patrimonio_resumo && resumoV2.patrimonio_resumo.total_ativo != null){
      elAtivoV2.textContent = `V2: R$ ${Number(resumoV2.patrimonio_resumo.total_ativo).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
      promoverCampoV2SeConfiavel('balAtivosTotal', resumoV2.patrimonio_resumo.total_ativo, 5);
    }
    const elPassivoV2 = document.getElementById('balPassivosTotalV2');
    if(elPassivoV2 && resumoV2.patrimonio_resumo && resumoV2.patrimonio_resumo.total_passivo != null){
      elPassivoV2.textContent = `V2: R$ ${Number(resumoV2.patrimonio_resumo.total_passivo).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
      promoverCampoV2SeConfiavel('balPassivosTotal', resumoV2.patrimonio_resumo.total_passivo, 5);
    }

    const caixaVariavelV2 = (resumoV2.caixas||[]).find(c => c.nome === 'Caixa Variável');
    if(caixaVariavelV2 && typeof VARS !== 'undefined' && VARS.CICLO_SNAPSHOTS && VARS.CICLO_SNAPSHOTS[VARS.cicloAtual]){
      const saldoV1 = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].caixaVariavelSaldoReal;
      // usa saldo_real_ciclo_atual (campo novo, 05/08/2026 - já respeita saldo_inicial_ciclo e só
      // conta movimentos com afeta_saldo_real=true), NAO o "saldo" bruto (que soma compra de cartão
      // junto, medindo outra coisa - ver ESTADO_ATUAL.md pra reconciliação completa desse achado)
      const saldoV2 = caixaVariavelV2.saldo_real_ciclo_atual;
      const diff = Math.round(Math.abs(saldoV1 - saldoV2) * 100) / 100;
      const badgeV2 = document.getElementById('syncV2Badge');
      if(diff > 0.05){
        console.warn(`⚠️ Auditoria V1↔V2: Caixa Variável (saldo real do ciclo) diverge - V1(app.js)=R$${saldoV1} vs V2(Supabase relacional)=R$${saldoV2} (diff R$${diff}). Investigar: a V2 costuma estar mais completa (captura toda compra migrada), enquanto o array manual do V1 pode estar incompleto - ver ESTADO_ATUAL.md da sessão 05/08/2026 pra um caso já resolvido assim (diferença de R$22 = TX000190, água mineral, que faltava no V1).`);
        if(badgeV2){
          badgeV2.innerHTML = `⚠ V2: diverge <span class="v">R$${diff}</span>`;
          badgeV2.style.color = '#e2a53d';
          badgeV2.title = `Caixa Variável (saldo real do ciclo): app.js=R$${saldoV1} vs Supabase V2=R$${saldoV2}. Ver console para detalhe.`;
        }
      } else {
        console.log(`%c✅ Auditoria V1↔V2: Caixa Variável bate (R$${saldoV1}) entre app.js e Supabase relacional.`, 'color:#34c98a');
        if(badgeV2){
          badgeV2.textContent = '✓ V2 sincronizado';
          badgeV2.style.color = '#34c98a';
          badgeV2.title = `Caixa Variável (saldo real do ciclo) bate entre app.js e Supabase V2: R$${saldoV1}.`;
        }
      }
    }
  } catch(e) {
    // silencioso de propósito - é auditoria opcional, nunca deve quebrar o site nem poluir o
    // console do usuário com erro de rede que ele não pode fazer nada a respeito
  }
})();

// ===== Ciclo financeiro 100% dinâmico (recalcula sempre que o arquivo é aberto, qualquer mês/ano) =====
// Regra do sistema: ciclo vai do dia 25 de um mês ao dia 24 do mês seguinte.
(function(){
  // MODULARIZAÇÃO 07/08/2026: todo o cálculo do ciclo financeiro (decorridos/restantes/pct), aging
  // LREI e Simulador Fim de Ciclo (cv/comprometidoParaTeto/tetoEfetivo/folego/faltaCobrir) + a
  // renderização inteira (antes dentro do onDomPronto abaixo) foram extraídos pra
  // src/modules/hydrate-simulador-ciclo.js — mesmas fórmulas, mesma sequência (inclui a chamada
  // hydrateQualidade() no fim, na mesma posição). `cv` é mantido aqui, redeclarado, só porque
  // montarResumoAssistente() (logo abaixo) também precisa dele.
  const cv = REG.caixaVariavel;

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

  onDomPronto(hydrateSimuladorCiclo); // MODULARIZAÇÃO 07/08/2026: ciclo financeiro + aging LREI + Simulador Fim de Ciclo + chamada hydrateQualidade() extraídos pra src/modules/hydrate-simulador-ciclo.js — mesma sequência, nenhum id/fórmula alterado.
})();

// MODULARIZAÇÃO 07/08/2026: showMaster/irParaPrimeiraSecao/showLR foram extraídas pra
// src/modules/ui-navegacao-basica.js — zero dependência de VARS/REG, só chamadas via onclick inline
// no HTML ou de dentro de outras funções (nunca em código síncrono no meio da execução do app.js).
// Nenhuma fórmula ou comportamento mudou, só o arquivo que hospeda o código.

// MODULARIZAÇÃO 07/08/2026: o filtro de Livros Razão por ciclo (dataPertenceCicloAtual,
// aplicarFiltroLivrosRazao, alternarFiltroLivrosRazao, atualizarBotaoFiltroLivrosRazao) foi extraído
// pra src/modules/filtro-livros-razao.js — zero dependência de VARS/REG, só onclick/chamadas lazy de
// trocarCiclo()/irParaTransacaoNoLivro(). Nenhuma fórmula ou comportamento mudou, só o arquivo que
// hospeda o código.

// MODULARIZAÇÃO 07/08/2026: valueLeaderPlugin + a IIFE dos 6 gráficos do Painel principal extraídos
// pra src/modules/graficos-painel-principal.js — viraram a função renderGraficosPainelPrincipal()
// porque a IIFE original rodava síncrona aqui (lendo REG já populado), não podia virar um IIFE de
// topo num módulo carregado ANTES do app.js (REG ainda não existiria). Chamada abaixo, na mesma
// posição exata de execução. Nenhuma fórmula ou comportamento mudou.
renderGraficosPainelPrincipal();

// MODULARIZAÇÃO 07/08/2026: as 4 funções _lazyRenderCenariosSalario/_lazyRenderGraficosSecao/
// _lazyRenderCenariosSuperavit/_lazyRenderCenariosDeficitEGraficosSolar + initGraficosECenariosLazy
// foram extraídas pra src/modules/graficos-cenarios-lazy.js — só rodam via clique nas abas Gráficos/
// Cenários (initGraficosECenariosLazy chamada por showMaster), nunca em código síncrono. A IIFE
// ACIMA (gráficos do Painel principal, roda na carga da página) e valueLeaderPlugin continuam aqui —
// mais críticos de ordem, não extraídos nesta rodada. Nenhuma fórmula ou comportamento mudou, só o
// arquivo que hospeda o código.

// MODULARIZAÇÃO 07/08/2026: o Simulador Regulatório Solar (seção 13 — SolarConfig,
// calcularContaSemSolar/ComSolar, calcularEconomia/ValorKwhGerado/Payback, gerarForecastSolar,
// calcularSimulacaoRegulatoria) foi extraído pra src/modules/energia-solar.js — bloco
// autocontido, sem nenhuma outra parte do app.js chamando essas funções. Carrega logo depois
// do app.js (onload em Sistema_Wallace_Lira_Completo.html), antes de promocoes-financeengine.js
// (que depende de SolarConfig/calcularContaSemSolar/ComSolar já existirem). Nenhuma fórmula ou
// comportamento mudou, só o arquivo que hospeda o código.
// (código movido pra src/modules/energia-solar.js — ver comentário acima)


// MODULARIZAÇÃO 07/08/2026: toggleEsconderValores/inicializarBotoesPrintSecao/baixarSecaoComoJPEG
// foram extraídas pra src/modules/ui-componentes-visuais.js — zero dependência de VARS/REG, só
// DOM/localStorage/html2canvas. Nenhuma fórmula ou comportamento mudou, só o arquivo que hospeda
// o código.
