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

// NOVO 14/08/2026 (instrumentação de boot: até aqui só existia o log final "[Wallace] Carregado em
// Xms", sem breakdown por módulo — impossível saber qual aplicarOndaN() é o gargalo). Envolve cada
// chamada já existente (hydrate() e os onDomPronto(aplicarOndaN...) mais abaixo) com marcação de
// performance.now(), sem alterar nenhuma lógica de negócio nem ordem de execução — se a função
// original retorna uma Promise, a duração só fecha quando ela resolve/rejeita (fetch incluso);
// se for síncrona, fecha na hora. Consultável em runtime via window.WALLACE_BOOT_TIMING (array) e
// impresso automaticamente em console.table() no listener 'load' já existente (ver mais abaixo).
window.WALLACE_BOOT_TIMING = window.WALLACE_BOOT_TIMING || [];
function medirOnda(nome, fn){
  return function(){
    const inicio = performance.now();
    const registrar = function(erro){
      const fim = performance.now();
      window.WALLACE_BOOT_TIMING.push({
        nome: nome,
        inicio: Math.round(inicio * 100) / 100,
        fim: Math.round(fim * 100) / 100,
        duracaoMs: Math.round((fim - inicio) * 100) / 100,
        status: erro ? 'erro' : 'ok'
      });
    };
    try {
      const resultado = fn.apply(this, arguments);
      if(resultado && typeof resultado.then === 'function'){
        return resultado.then(
          function(v){ registrar(false); return v; },
          function(e){ registrar(true); throw e; }
        );
      }
      registrar(false);
      return resultado;
    } catch(e){
      registrar(true);
      throw e;
    }
  };
}

// NOVO 09/08/2026 (achado real de auditoria de segurança: lancar_transacao_manual/triar_pluggy_item/
// triar_mercadopago_evento eram SECURITY DEFINER concedidas a `anon` SEM nenhuma checagem de quem
// chamava - qualquer pessoa com a chave publica do site (esta no HTML, visivel por qualquer um)
// podia inserir transacao confirmada direto no banco. Corrigido no banco (as 3 funcoes agora exigem
// JWT do mesmo login Firebase que o site ja usa, ou service_role) - MAS a checagem so funciona se o
// cliente de fato ENVIAR esse token. index.html grava a resposta do login Firebase (que inclui
// idToken) em sessionStorage['auth'] - o iframe (este arquivo) ja compartilha o mesmo sessionStorage
// (confirmado: a propria checagem de sessao no topo do HTML ja le essa mesma chave). Retorna null se
// nao houver sessao (usuario deslogado) - quem chamar isso DEVE tratar o null antes de montar a
// requisicao, senao a RPC vai rejeitar com "nao autenticado" (comportamento correto, nao um bug).
function obterTokenAuthSupabase(){
  try {
    const auth = JSON.parse(sessionStorage.getItem('auth') || 'null');
    return (auth && auth.idToken) ? auth.idToken : null;
  } catch(e){ return null; }
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
// NOVO 12/08/2026 (Fase 1 de modernização, pedido do usuário — performance): _cache era um Map
// puro, sem expiração, então uma sessão longa (o padrão real de uso deste site, muitas horas
// abertas) podia mostrar dado desatualizado até alguém lembrar de F5 ou disparar
// invalidarCache() manualmente (só acontece hoje no fluxo "+ Lançar"). Já foi a causa raiz
// concreta de confusão real nesta mesma madrugada (Onda 3 LRW/LRV, Comprometido Caixa Variável).
// _CacheComTTL substitui o Map por um objeto com a MESMA API (has/get/set/clear) — nenhum dos
// ~35 métodos que já chamam this._cache.has/get/set precisou mudar, só a implementação por trás
// mudou. TTL de 90s: curto o bastante pra sumir sozinho dentro de 1 clique de navegação, longo o
// bastante pra não gerar refetch a cada re-render da mesma Onda.
class _CacheComTTL {
  constructor(ttlMs){ this._ttlMs = ttlMs; this._mapa = new Map(); }
  has(chave){
    const entrada = this._mapa.get(chave);
    if(!entrada) return false;
    if(Date.now() - entrada.gravadoEm > this._ttlMs){ this._mapa.delete(chave); return false; }
    return true;
  }
  get(chave){ return this.has(chave) ? this._mapa.get(chave).valor : undefined; }
  set(chave, valor){ this._mapa.set(chave, { valor, gravadoEm: Date.now() }); }
  clear(){ this._mapa.clear(); }
  // NOVO 12/08/2026 (achado do usuário: "valores numéricos estão demorando muito para carregar" —
  // confirmado via performance.getEntriesByType('resource') no navegador: a MESMA query batendo em
  // vw_reconciliacao_v1_v2/caixas/vw_transacoes_cartao_variavel_por_pessoa/etc 5-7 VEZES cada, ~25ms
  // uma da outra, cada uma levando 1-2s = dezenas de segundos de espera acumulada). Causa raiz: o
  // padrão `if(has(chave)) return get(chave); ...await fetch...; set(chave,dado)` só evita refetch
  // pra chamadas SEQUENCIAIS - quando vários módulos hydrate-*.js chamam o mesmo método do
  // WallaceFinanceService quase ao mesmo tempo (comum, já que onDomPronto dispara dezenas deles em
  // paralelo), todos passam pelo `has(chave)` ANTES do primeiro terminar o fetch e preencher o cache
  // - corrida clássica de cache-miss concorrente. Esta função resolve cacheando a PROMESSA em voo
  // (não só o valor resolvido), de forma síncrona, antes de qualquer await - chamadas concorrentes
  // que chegarem enquanto a 1ª ainda está em voo reusam a MESMA promessa em vez de disparar fetch
  // novo. Em erro, remove a entrada do cache (não deixa uma falha cacheada travar retentativas).
  async obterOuBuscar(chave, fabricaAsync){
    if(this.has(chave)) return this.get(chave);
    const promessa = (async () => {
      try { return await fabricaAsync(); }
      catch(err){ this._mapa.delete(chave); throw err; }
    })();
    this.set(chave, promessa);
    return promessa;
  }
  // NOVO 12/08/2026 (Fase 4 de modernização, pedido do usuário — performance): apaga só as chaves
  // que começam com um dos prefixos dados, em vez do cache inteiro. Prefixo = chave completa (chaves
  // estáticas, ex: 'caixas') ou o início de uma chave dinâmica (ex: 'composicao_saldo:' cobre
  // 'composicao_saldo:Boletos', 'composicao_saldo:Variável', etc, sem listar cada uma).
  deletarPorPrefixo(prefixos){
    for(const chave of this._mapa.keys()){
      if(prefixos.some(p => chave.startsWith(p))) this._mapa.delete(chave);
    }
  }
  // NOVO 14/08/2026 (pedido do usuário: "ampliar a camada de cache pra reduzir refetch entre cargas
  // de página" — o cache acima é só em memória, então some inteiro a cada F5, forçando refetch total
  // toda vez mesmo que o usuário tenha acabado de recarregar a mesma tela segundos atrás). Camada
  // extra OPCIONAL em sessionStorage (nunca localStorage — expira ao fechar a aba, mais seguro pra
  // dado financeiro que sessão longa/compartilhada em navegador de terceiros poderia deixar salvo).
  // Só chamada explicitamente pelos endpoints pouco voláteis (ver obterOuBuscarPersistente abaixo) -
  // saldo/transações/reconciliação continuam só no obterOuBuscar() em memória, TTL de 90s, nunca
  // sobrevivem a um F5. Prefixo 'wfs_cache_v1:' versiona a chave: se o formato do valor gravado mudar
  // no futuro, basta subir pra 'v2' que o código novo ignora silenciosamente tudo que ficou salvo
  // pelo formato antigo (JSON.parse de um formato incompatível cai no catch, trata como cache-miss).
  _PREFIXO_SESSION_STORAGE = 'wfs_cache_v1:';
  _lerPersistente(chave, ttlMs){
    try {
      const bruto = sessionStorage.getItem(this._PREFIXO_SESSION_STORAGE + chave);
      if(!bruto) return undefined;
      const entrada = JSON.parse(bruto);
      if(!entrada || typeof entrada.gravadoEm !== 'number') return undefined;
      if(Date.now() - entrada.gravadoEm > ttlMs){
        sessionStorage.removeItem(this._PREFIXO_SESSION_STORAGE + chave);
        return undefined;
      }
      return entrada.valor;
    } catch(e){
      // Modo anônimo/privado (Safari lança em alguns browsers), quota estourada, JSON corrompido,
      // sessionStorage desabilitado por política do navegador - qualquer erro aqui cai pra
      // cache-miss silencioso, NUNCA quebra o carregamento da página.
      return undefined;
    }
  }
  _gravarPersistente(chave, valor){
    try {
      sessionStorage.setItem(this._PREFIXO_SESSION_STORAGE + chave, JSON.stringify({ valor, gravadoEm: Date.now() }));
    } catch(e){
      // Mesma justificativa de _lerPersistente: gravação é um bônus de performance, não uma garantia.
      // Se falhar (quota cheia, ex: muitas outras chaves de outra aba do mesmo site), simplesmente não
      // persiste - a próxima chamada volta a buscar da rede via obterOuBuscar() em memória normal.
    }
  }
  // Mesmo contrato de obterOuBuscar (inclusive dedupe de chamada concorrente via promessa em voo),
  // com uma camada extra: se não achar em memória, tenta sessionStorage ANTES de ir pra rede. Uso
  // restrito a endpoints de leitura pouco voláteis (config fixa, regra de classificação, teto de
  // caixa) - NUNCA chamar isto pra saldo/transações/reconciliação, que precisam estar sempre frescos
  // a cada carga de página (ver comentário de cada chamador abaixo).
  async obterOuBuscarPersistente(chave, fabricaAsync, ttlPersistenteMs){
    if(this.has(chave)) return this.get(chave);
    const persistido = this._lerPersistente(chave, ttlPersistenteMs);
    if(persistido !== undefined){
      this.set(chave, persistido); // repovoa a memória também, evita reler sessionStorage a cada chamada
      return persistido;
    }
    const promessa = (async () => {
      try {
        const valor = await fabricaAsync();
        this._gravarPersistente(chave, valor);
        return valor;
      }
      catch(err){ this._mapa.delete(chave); throw err; }
    })();
    this.set(chave, promessa);
    return promessa;
  }
}

const WallaceFinanceService = {
  _cache: new _CacheComTTL(90000),
  _url: 'https://bakdgacmwlopvrrppwdm.supabase.co',
  _key: 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg',
  // NOVO 12/08/2026 (Fase 4, achado da auditoria: invalidarCache() limpava o cache INTEIRO a cada
  // lançamento manual, forçando refetch de ~20 endpoints mesmo quando só `transacoes`/`caixas`
  // mudaram). Lista abaixo é exatamente a mesma que o comentário de atualizarPainelAposLancamento()
  // (mais abaixo) já documentava como "afetado por um lançamento manual" - só passou a ser aplicada
  // de fato em vez de descartar tudo. Deliberadamente FORA (nunca invalidado aqui, mesmo motivo já
  // documentado): investimentos_opcoes/indicador:* (tabela investimentos, não transacoes),
  // vw_ciclo_solar_* (robô SAJ), mercadopago_eventos/pluggy_* (sincronização externa),
  // cronograma_*/vw_saude_jobs (config fixa/monitoramento de automação, não afetados por 1 lançamento).
  _CHAVES_CACHE_AFETADAS_POR_LANCAMENTO: [
    'rpc:dashboard_resumo', 'vw_saldo_v2_por_caixa', 'vw_reconciliacao_v1_v2',
    'extrato_caixa_mastercard_infinite', 'valores_v2_todos', 'valores_combinados_v2',
    'comprometido_caixa_variavel_v2', 'transacoes_cartao_variavel_detalhe',
    'transacoes_por_caixa:', 'vw_compromisso_cartao_por_pessoa',
    'transacoes_corporativo_cartao_detalhe', 'caixas', 'composicao_saldo:',
    'composicao_saldo_batch:', // NOVO 14/08/2026 (getComposicaoCaixasBatch, mesma família de cache que 'composicao_saldo:')
    'vw_patrimonio_v2', 'vw_emprestimos_internos_v2', 'reembolso_wartsila_ciclo',
    'vw_parcelamentos_v2', 'vw_p2p_v2'
  ],
  invalidarCache(){ this._cache.deletarPorPrefixo(this._CHAVES_CACHE_AFETADAS_POR_LANCAMENTO); },
  // NOVO 09/08/2026 (preparação pra fechar a leitura pública do banco - achado da auditoria de
  // segurança: hoje toda leitura usa só a chave anônima, sem token de login nenhum). Passo 1 (este
  // commit): manda o token do Firebase quando existe (obterTokenAuthSupabase(), definida acima),
  // cai pra chave anônima se não tiver sessão - EXATAMENTE o mesmo comportamento de hoje quando
  // deslogado, nada quebra. Passo 2 (SÓ depois de validar login real em navegador): restringir as
  // policies de SELECT no Supabase pra `authenticated` - aí sim a leitura deixa de ser pública. Não
  // fiz o passo 2 ainda de propósito - travaria a tela inteira se o token não estiver realmente
  // sendo aceito pelo Supabase, e não consigo testar isso sem login ao vivo.
  _headers(){
    const token = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || this._key;
    return { apikey: this._key, Authorization: `Bearer ${token}` };
  },
  async getDashboardResumo(){
    return this._cache.obterOuBuscar('rpc:dashboard_resumo', async () => {
      const resp = await fetch(`${this._url}/rest/v1/rpc/rpc_dashboard_resumo`, {
        method:'POST',
        headers: Object.assign({'Content-Type':'application/json'}, this._headers()),
        body:'{}'
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar dashboard`);
      return await resp.json();
    });
  },
  // NOVO 08/08/2026 (Onda 1 da migração V2 → Painel): saldo por caixa via vw_saldo_v2_por_caixa —
  // NÃO usar rpc_dashboard_resumo().caixas[].saldo pra isso (achado ao vivo: soma TODA transação
  // da caixa sem filtro de ciclo/afeta_saldo_real, valor errado pra Boletos/Variável) nem
  // saldo_real_ciclo_atual da mesma RPC (diverge pra PIX Vanessa, ~R$122 de diferença). Esta view
  // é a mesma usada e validada a sessão inteira em PLANO_UNIFICACAO_V1_V2.md — v2_saldo_calculado
  // bate exato com vw_reconciliacao_v1_v2 pras 4 caixas já sincronizadas.
  async getSaldosPorCaixa(){
    // NOVO 09/08/2026: caixa_tipo adicionado ao select (era so caixa_nome,v2_saldo_calculado) - precisa
    // pra filtrar so caixas operacionais no calculo de deficit sem LREI (hydrate-deficit-caixas-sem-lrei.js).
    return this._cache.obterOuBuscar('vw_saldo_v2_por_caixa', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_saldo_v2_por_caixa?select=caixa_nome,caixa_tipo,v2_saldo_calculado`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_saldo_v2_por_caixa`);
      return await resp.json();
    });
  },
  // NOVO 13/08/2026 (seção "Todas as Caixas" no Painel): teto_mensal não está na view
  // vw_saldo_v2_por_caixa (só nome/saldo), precisa buscar direto da tabela caixas pra montar a
  // barra de progresso dos cards gerados dinamicamente (ver preencherCaixasOperacionaisExtra()).
  // NOVO 14/08/2026 (ampliação da camada de cache, pedido do usuário): teto_mensal/meta_data_limite
  // são configurados manualmente e mudam raro (não a cada lançamento, diferente de saldo/transações)
  // - candidato seguro pra sobreviver a um F5 via sessionStorage (obterOuBuscarPersistente), TTL de
  // 90s igual ao cache em memória. Pior caso de "dado desatualizado": barra de progresso da meta
  // atrasada até 90s depois de editar um teto na V2 - aceitável, não é saldo/transação.
  async getTetoMensalCaixas(){
    return this._cache.obterOuBuscarPersistente('caixas_teto_mensal', async () => {
      const resp = await fetch(`${this._url}/rest/v1/caixas?select=nome,teto_mensal,meta_data_limite&teto_mensal=not.is.null`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar caixas.teto_mensal`);
      return await resp.json();
    }, 90000);
  },
  // NOVO 08/08/2026 (Onda 2, Livro Razão Fase 1): reconciliação completa por caixa (saldo, qtd de
  // transações V1×V2, valor das transações só-no-V1) — reaproveita vw_reconciliacao_v1_v2, já
  // validada a sessão inteira, em vez de somar arrays na mão no cliente.
  async getReconciliacaoPorCaixa(){
    return this._cache.obterOuBuscar('vw_reconciliacao_v1_v2', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_reconciliacao_v1_v2?select=caixa_nome,v1_saldo,v2_saldo,diferenca_absoluta,v1_qtd_transacoes,v2_qtd_transacoes,valor_transacoes_so_no_v1,valor_transacoes_so_na_v2,causa_provavel`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_reconciliacao_v1_v2`);
      return await resp.json();
    });
  },
  // NOVO 09/08/2026 (achado do usuário: INBX000001 "Medidor De Energia" R$79,79 apareceu como
  // PENDENTE na Inbox, mas já existe lançado como TX000226 em Bens Duráveis - duplicata real que
  // quase foi lançada de novo). Causa raiz: a checagem de duplicidade da Inbox (valoresConhecidos,
  // classificacao-inbox.js/pluggy-reconciliacao.js) só comparava contra 7 arrays V1 hardcoded
  // (LRW/LRV/LRC_LIMBO/LRCV/PV/LRPV/BOLETOS) - Bens Duráveis (e qualquer outra caixa fora dessa
  // lista) nunca entrava na comparação, então um valor já lançado lá sempre parecia "novo". Esta
  // função busca TODO valor confirmado da V2 (todas as caixas), pra somar à checagem existente -
  // não substitui os arrays V1 (mantidos por resiliência offline), só fecha o buraco de cobertura.
  // NOVO 12/08/2026 (Onda 11, pedido do usuário: "V1 não pode haver nada lá" — matar de vez o
  // palpite por calendário de aplicarBoletosVencidosAutomaticamente()). Extrato real da Caixa
  // Boletos direto da V2. Substitui o array VARS.BOLETOS_TRANSACOES (antes populado por palpite de
  // data) pelo que realmente foi confirmado como pago (via processo de triagem da Inbox, ver
  // MANUAL_OPERACIONAL_AGENTES.md seção 2 regra 6). Caixa id fixo: '7751575a-6339-4bf2-bda4-60817778551c'.
  async getExtratoCaixaBoletos(){
    return this._cache.obterOuBuscar('extrato_caixa_boletos', async () => {
      const caixaId = '7751575a-6339-4bf2-bda4-60817778551c';
      const resp = await fetch(`${this._url}/rest/v1/transacoes?select=tx_legado,data,descricao,valor,tipo&caixa_id=eq.${caixaId}&status=eq.confirmado&order=data.asc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar extrato da Caixa Boletos`);
      return await resp.json();
    });
  },
  // CORRIGIDO 12/08/2026 (achado do usuário, print real: Inbox mostrando "H57Store" R$6,50 e "DRIVE
  // CAMPINA GRANDE" R$131,50 como "não encontrada em nenhum livro do ERP" — as duas JÁ existiam em
  // `transacoes`, só que com status='pendente_classificacao' (lote de 18 itens do Pluggy, já com
  // categoria/caixa sugerida, só faltando confirmação final), não 'confirmado'. Este filtro só
  // olhava confirmado, então a Inbox nunca via que o item já estava capturado e reoferecia como
  // novo. Pedido explícito do usuário: "não quero que apareça na Inbox nada que já foi lançada" —
  // amplia pra incluir pendente_classificacao (já é uma linha real em transacoes, só falta
  // classificação final, não é "não lançada"). 'estornado' fica de fora de propósito: uma transação
  // estornada foi desfeita, não conta como "já existe" pra fins de dedup.
  async getValoresConhecidosV2(){
    return this._cache.obterOuBuscar('valores_v2_todos', async () => {
      const resp = await fetch(`${this._url}/rest/v1/transacoes?select=valor&status=in.(confirmado,pendente_classificacao)`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar valores confirmados da V2`);
      const dado = await resp.json();
      return dado.map(r => Math.round(Math.abs(Number(r.valor))*100)/100);
    });
  },
  // NOVO 12/08/2026 (mesmo achado acima, pedido explícito do usuário: "não me interessa compra de
  // ciclos passados" — a Inbox de Pluggy/Mercado Pago só deveria apontar compra não lançada DO CICLO
  // ATUAL, não gasto antigo). Reusa o mesmo ciclo_inicio_em da Caixa Variável (getCaixas() já busca
  // id+ciclo_inicio_em de todas as caixas, cacheado) — mesma fonte de verdade usada em
  // getComprometidoCaixaVariavelV2() acima, não duplica lógica nova.
  async getCicloAtualInicio(){
    const caixas = await this.getCaixas();
    const caixaVariavel = caixas.find(c => c.id === this.CAIXA_VARIAVEL_ID_V2);
    return (caixaVariavel && caixaVariavel.ciclo_inicio_em) || null;
  },
  // NOVO 09/08/2026 (achado do usuário: R$551,01 "Mercado Livre" pendente na Inbox era a MESMA
  // compra já lançada, só desmembrada em 3 partes - TX000159 196,01 + TX000159-A 319,90 +
  // TX000159-B 35,10. getValoresConhecidosV2() só compara valor exato, nunca pegaria isso. Usa a
  // função nova valores_combinados_v2() (soma de até 3 transações da mesma caixa, janela de 5
  // dias) pra fechar essa classe de falso-negativo.
  async getValoresCombinadosV2(){
    return this._cache.obterOuBuscar('valores_combinados_v2', async () => {
      const resp = await fetch(`${this._url}/rest/v1/rpc/valores_combinados_v2`, {
        method: 'POST',
        headers: Object.assign({'Content-Type':'application/json'}, this._headers()),
        body: '{}'
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar valores combinados da V2`);
      const dado = await resp.json();
      return dado.map(r => Math.round(Math.abs(Number(r.valor_combinado))*100)/100);
    });
  },
  // NOVO 09/08/2026 (achado do usuário: "Comprometido" da Caixa Variável estava inflado, misturando
  // compras que JÁ têm caixa própria - ex: TX000228, carne pro Churrasco, entrou tanto no saldo da
  // Caixa Churrasco quanto no comprometido da Variável, um double-count real). Regra correta
  // (confirmada pelo usuário): "Comprometido" = só gasto genérico do dia a dia/supérfluo, cuja marca
  // registrada é caixa_id='Caixa Variável' + afeta_saldo_real=false (padrão já usado em toda compra
  // de cartão sem caixa própria, ex: H57Store/Uber/Anthropic) - qualquer compra com caixa própria
  // (Bens Duráveis, Churrasco, Provisionado Wärtsilä etc) fica fora, ela já é tracked na sua caixa.
  // Ver hydrate-comprometido-caixa-variavel-v2.js. Id fixo da Caixa Variável (singleton, estável -
  // mesmo padrão de outros ids fixos já hardcoded no projeto, ex: CARTAO_PLUGGY_MAPA).
  CAIXA_VARIAVEL_ID_V2: '8522e256-2039-4c11-bd28-69738bfcf5b8',
  // CORRIGIDO 11/08/2026 (achado do usuário: "ontem eu tinha 450 de crédito, como agora virou 350
  // de débito" — salto real de ~R$800 num dia só): esta consulta somava TODAS as compras de cartão
  // já classificadas como Caixa Variável, sem filtro de data — incluindo 54 transações desde
  // 02/06/2026 (mais de 2 meses), não só as do ciclo atual (25/07→24/08). Mesmo bug de classe já
  // corrigido em vw_compromisso_cartao_por_pessoa/vw_saldo_v2_por_caixa nesta sessão, mas nessa
  // consulta específica (bate direto em `transacoes`, não passa por view) tinha passado batido.
  // Provável gatilho: a classificação retroativa de ~106 transações (sessão anterior) deu cartao_id
  // a compras antigas, que passaram a entrar nesta soma de uma vez só assim que ganharam cartao_id.
  async getComprometidoCaixaVariavelV2(){
    return this._cache.obterOuBuscar('comprometido_caixa_variavel_v2', async () => {
      // CORRIGIDO 12/08/2026 (achado do usuário: "lag pra carregar os valores" - segunda rodada
      // depois da correção da corrida de cache): esta função fazia sua PRÓPRIA consulta a
      // `caixas?select=ciclo_inicio_em&id=eq.X`, quando getCaixas() já busca id+ciclo_inicio_em de
      // TODAS as caixas (e já está cacheado/memoizado) - reusar em vez de refazer o roundtrip.
      const caixas = await this.getCaixas();
      const caixaVariavel = caixas.find(c => c.id === this.CAIXA_VARIAVEL_ID_V2);
      const cicloInicioEm = caixaVariavel && caixaVariavel.ciclo_inicio_em;
      const filtroData = cicloInicioEm ? `&data=gte.${cicloInicioEm}` : '';
      // CORRIGIDO 12/08/2026 (achado do usuário: assinaturas do Mastercard Black recém-vinculadas via
      // Pluggy - Netflix/OpenAI/Anthropic/Amazon Prime/etc - contavam aqui E no orçamento de
      // Assinaturas (cronograma_assinaturas/mbLRSConfirmado, componente separado de Necessidade Total)
      // ao mesmo tempo, mesma classe de bug já documentada do caso TX000228/Churrasco. Marcadas
      // ja_orcado_assinaturas=true (ver migração), excluídas daqui pra não contar 2x.
      const resp = await fetch(`${this._url}/rest/v1/transacoes?select=valor&caixa_id=eq.${this.CAIXA_VARIAVEL_ID_V2}&cartao_id=not.is.null&status=eq.confirmado&tipo=eq.saida&afeta_saldo_real=eq.false&ja_orcado_assinaturas=eq.false${filtroData}`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar comprometido da Caixa Variável`);
      const dado = await resp.json();
      return Math.round(dado.reduce((s,r) => s + Number(r.valor), 0) * 100) / 100;
    });
  },
  // GENERALIZADO 14/08/2026 (decisão do usuário, depois de pergunta trazida pelo Claude Chat sobre
  // se "Comprometido × Disponível Real" devia valer só pra Caixa Variável ou pra qualquer caixa com
  // cartão: as 6 caixas temáticas que compram no cartão de crédito — Churrasco, Bens Duráveis,
  // Manutenção, Eventos e Viagens, Saúde Família, Emagrecimento — devem se comportar como a Caixa
  // Variável, servindo de "pulmão" pro cartão até a fatura vencer). MESMA fórmula exata de
  // getComprometidoCaixaVariavelV2() acima, só parametrizada por caixaId em vez de fixa — essa
  // função nova NÃO substitui a de cima (mantida intacta, já testada, cache própria) — ver
  // hydrate-comprometido-caixas-tematicas-v2.js.
  async getComprometidoPorCaixaV2(caixaId){
    return this._cache.obterOuBuscar('comprometido_caixa_v2:' + caixaId, async () => {
      const caixas = await this.getCaixas();
      const caixa = caixas.find(c => c.id === caixaId);
      const cicloInicioEm = caixa && caixa.ciclo_inicio_em;
      const filtroData = cicloInicioEm ? `&data=gte.${cicloInicioEm}` : '';
      const resp = await fetch(`${this._url}/rest/v1/transacoes?select=valor&caixa_id=eq.${caixaId}&cartao_id=not.is.null&status=eq.confirmado&tipo=eq.saida&afeta_saldo_real=eq.false&ja_orcado_assinaturas=eq.false${filtroData}`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar comprometido da caixa ${caixaId}`);
      const dado = await resp.json();
      return Math.round(dado.reduce((s,r) => s + Number(r.valor), 0) * 100) / 100;
    });
  },
  // NOVO 11/08/2026 (achado do usuário, print real: lista detalhada de LRW/LRV — 19/16 lançamentos,
  // R$1.318,19/R$376,64 — não batia com o card resumido mbLRW/mbLRV, R$972,98/R$245,84): a lista
  // detalhada vinha de VARS.LRW_TRANSACOES/LRV_TRANSACOES, array V1 mantido à mão no código, nunca
  // migrado. Esta função busca vw_transacoes_cartao_variavel_por_pessoa (view nova, MESMO filtro exato
  // de vw_compromisso_cartao_por_pessoa — caixa Variável + afeta_saldo_real=false + cartao_id
  // preenchido + ciclo atual) — garante que a lista detalhada e o card resumido nunca mais divergem,
  // os dois vêm da mesma fonte.
  async getTransacoesCartaoVariavelDetalhe(){
    return this._cache.obterOuBuscar('transacoes_cartao_variavel_detalhe', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_transacoes_cartao_variavel_por_pessoa?select=usuario_nome,tx_legado,data,descricao,valor`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_transacoes_cartao_variavel_por_pessoa`);
      return await resp.json();
    });
  },
  // NOVO 08/08/2026 (Onda 3, Livro Razão): transações confirmadas de uma lista de caixas, numa
  // única chamada (in.(id1,id2,...)) em vez de N requests separados.
  async getTransacoesPorCaixaIds(caixaIds){
    return this._cache.obterOuBuscar('transacoes_por_caixa:' + caixaIds.join(','), async () => {
      const lista = caixaIds.join(',');
      // CORRIGIDO 14/08/2026 (auditoria: rodapé do Livro Razão soma TODA transação confirmada da
      // caixa, inclusive compra de cartão ainda não paga — cartao_id preenchido + afeta_saldo_real=
      // false — o que faz o total bater com "Disponível Real" e não com "Tem na Caixa", sem nenhum
      // aviso na tela. A fórmula continua a mesma (não filtra nada) — só passou a trazer cartao_id e
      // afeta_saldo_real no select pra hydrate-onda3-livro-razao.js poder rotular o rodapé quando isso
      // acontecer, ver onda3AtualizarNotaDisponivelReal() lá.
      const resp = await fetch(`${this._url}/rest/v1/transacoes?select=tx_legado,data,descricao,tipo,valor,caixa_id,cartao_id,afeta_saldo_real&caixa_id=in.(${lista})&status=eq.confirmado&order=data.desc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar transacoes por caixa`);
      return await resp.json();
    });
  },
  // NOVO 08/08/2026 (Onda 3, Prioridade 2 — LRW/LRV): compromisso de cartão por pessoa
  // (equivalente a VARS.mbLRWConfirmado/mbLRVConfirmado), via vw_compromisso_cartao_por_pessoa —
  // agregação pura de `transacoes` já existentes (Caixa Variável, afeta_saldo_real=false), sem
  // lógica de negócio nova.
  async getCompromissoCartaoPorPessoa(){
    return this._cache.obterOuBuscar('vw_compromisso_cartao_por_pessoa', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_compromisso_cartao_por_pessoa?select=usuario_nome,total_comprometido,qtd_transacoes`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_compromisso_cartao_por_pessoa`);
      return await resp.json();
    });
  },
  // NOVO 12/08/2026 (fechamento do domínio Cartões — LRC_LIMBO): igual em espírito a
  // getTransacoesCartaoVariavelDetalhe() (Onda 3 LRW/LRV), mas pro outro "livro item-a-item" que
  // ainda vivia só em VARS.LRC_LIMBO_TRANSACOES. Achado por auditoria de evidência real: as 5
  // transações do array V1 já existem 1:1 em `transacoes` (mesmo tx_legado), todas com o mesmo
  // padrão mecânico — caixa_id = Provisionado Wärtsilä (onde o reembolso corporativo pousa) +
  // cartao_id preenchido (é sempre uma compra de cartão, nunca PIX/dinheiro). Filtro puro, sem
  // heurística nova. LRCV (a outra metade do par) ficou de fora de propósito: os 2 itens dela são
  // pagamentos PIX avulsos sem nenhuma marca própria em `transacoes` que os distinga de aportes/
  // rendimentos que também caem em Caixa Variável + cartao_id nulo — reconstruir isso exigiria
  // inventar uma regra sem evidência, não fazer.
  async getTransacoesCorporativoCartaoDetalhe(){
    return this._cache.obterOuBuscar('transacoes_corporativo_cartao_detalhe', async () => {
      const caixaId = '3d7f37e3-f52f-4aad-a611-23fa54810b39'; // Provisionado Wärtsilä (mesmo id fixo já usado em getExtratoCaixaMastercardInfinite/CAIXA_VARIAVEL_ID_V2)
      // CORRIGIDO 12/08/2026 (achado do usuário: aba LRC mostrando 9 lançamentos, 3 deles de
      // 01-02/07/2026 — ciclo FECHADO anterior, não o ciclo atual 25/07→24/08) — mesma classe de bug já
      // corrigida em getComprometidoCaixaVariavelV2() (11/08/2026): faltava o filtro de ciclo_inicio_em,
      // então TODA transação corporativa já confirmada entrava aqui, de qualquer ciclo.
      // CORRIGIDO 12/08/2026 (achado do usuário: "lag pra carregar os valores"): reusa getCaixas()
      // (já busca id+ciclo_inicio_em de todas, já cacheado) em vez de refazer o roundtrip só pra
      // esta caixa - mesma correção aplicada em getComprometidoCaixaVariavelV2() logo acima.
      const caixas = await this.getCaixas();
      const caixaWartsila = caixas.find(c => c.id === caixaId);
      const cicloInicioEm = caixaWartsila && caixaWartsila.ciclo_inicio_em;
      const filtroData = cicloInicioEm ? `&data=gte.${cicloInicioEm}` : '';
      const resp = await fetch(`${this._url}/rest/v1/transacoes?select=tx_legado,data,descricao,valor&caixa_id=eq.${caixaId}&cartao_id=not.is.null&status=eq.confirmado&order=data.asc${filtroData}`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar detalhe LRC_LIMBO (cartão corporativo)`);
      return await resp.json();
    });
  },
  async getCaixas(){
    return this._cache.obterOuBuscar('caixas', async () => {
      const resp = await fetch(`${this._url}/rest/v1/caixas?select=id,nome,tipo,teto_mensal,ciclo_inicio_em`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar caixas`);
      return await resp.json();
    });
  },
  // NOVO 12/08/2026 (tooltip de composição — pedido do usuário: "quando eu passar o mouse ou o dedo,
  // mostrar o que se soma pra gerar" o saldo de cada card da seção 05/Caixas Operacionais). Replica
  // EXATAMENTE o filtro de vw_saldo_v2_por_caixa (ver pg_get_viewdef consultado antes de escrever isto):
  // status='confirmado' AND coalesce(afeta_saldo_real,true) AND (ciclo_inicio_em IS NULL OR data >=
  // ciclo_inicio_em OR data IS NULL) — se este filtro divergir do da view, a lista mostrada no hover
  // não bate com o número do card, reproduzindo o mesmo tipo de bug já corrigido 2x nesta sessão
  // (Onda 3 LRW/LRV, Comprometido Caixa Variável). Por isso replica em vez de reimplementar.
  async getTransacoesComposicaoSaldoCaixa(nomeCaixa){
    return this._cache.obterOuBuscar('composicao_saldo:' + nomeCaixa, async () => {
      const caixas = await this.getCaixas();
      const caixa = caixas.find(c => c.nome === nomeCaixa);
      if(!caixa) throw new Error(`WallaceFinanceService: caixa "${nomeCaixa}" nao encontrada`);
      const resp = await fetch(`${this._url}/rest/v1/transacoes?select=tx_legado,data,descricao,tipo,valor,afeta_saldo_real&caixa_id=eq.${caixa.id}&status=eq.confirmado&order=data.desc,created_at.desc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar composição de "${nomeCaixa}"`);
      const todas = await resp.json();
      const cicloInicioEm = caixa.ciclo_inicio_em;
      const linhas = todas.filter(t => {
        if(t.afeta_saldo_real === false) return false; // coalesce(afeta_saldo_real,true) — só false exclui
        if(!cicloInicioEm) return true;
        if(!t.data) return true;
        return t.data >= cicloInicioEm;
      });
      return { caixaId: caixa.id, cicloInicioEm, linhas };
    });
  },
  // NOVO 14/08/2026 (consolidação de boot do painel — pedido do orquestrador: hydrate-onda12-
  // caixas-pequenas-v2.js fazia 5 round-trips HTTP separados a getTransacoesComposicaoSaldoCaixa,
  // um por caixa pequena). Chama a RPC nova rpc_composicao_saldo_caixas_batch(p_nomes) — desenhada
  // em supabase/migrations/20260814000000_rpc_composicao_saldo_caixas_batch.sql, AINDA NÃO APLICADA
  // em produção — que devolve a composição das N caixas numa única chamada, chaveada por nome, no
  // MESMO shape que getTransacoesComposicaoSaldoCaixa() já devolve por caixa ({caixaId,
  // cicloInicioEm, linhas}). Enquanto a migration não for aplicada (RPC inexistente -> Postgrest
  // devolve 404), cai automaticamente pro fallback de 5 chamadas individuais (mesmo comportamento de
  // hoje) — mesmo padrão try/catch-com-fallback já usado no domínio Solar/Cotações/PIB (ver
  // hydrate-clima-solar.js), só que ali o fallback é "sem dado" e aqui é "método antigo continua
  // funcionando".
  async getComposicaoCaixasBatch(nomesCaixa){
    const chaveCache = 'composicao_saldo_batch:' + nomesCaixa.slice().sort().join(',');
    return this._cache.obterOuBuscar(chaveCache, async () => {
      try {
        const resp = await fetch(`${this._url}/rest/v1/rpc/rpc_composicao_saldo_caixas_batch`, {
          method: 'POST',
          headers: Object.assign({'Content-Type':'application/json'}, this._headers()),
          body: JSON.stringify({ p_nomes: nomesCaixa })
        });
        if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao chamar rpc_composicao_saldo_caixas_batch`);
        const dado = await resp.json();
        if(!dado || typeof dado !== 'object' || Array.isArray(dado)) throw new Error('WallaceFinanceService: rpc_composicao_saldo_caixas_batch devolveu formato inesperado');
        // confere se a RPC devolveu TODAS as caixas pedidas — se faltar alguma (nome sem match na
        // tabela `caixas`, ou resposta parcial), cai pro fallback também em vez de fingir sucesso
        // com dado incompleto (mesma regra "nunca invente dado" do resto do projeto).
        const faltando = nomesCaixa.filter(n => !(n in dado));
        if(faltando.length) throw new Error(`WallaceFinanceService: rpc_composicao_saldo_caixas_batch nao devolveu "${faltando.join(', ')}"`);
        return dado;
      } catch(errRpc){
        console.warn('WallaceFinanceService: rpc_composicao_saldo_caixas_batch indisponível (RPC provavelmente ainda não aplicada) — usando fallback de chamadas individuais por caixa.', errRpc);
        const resultado = {};
        await Promise.all(nomesCaixa.map(async nome => {
          try {
            resultado[nome] = await this.getTransacoesComposicaoSaldoCaixa(nome);
          } catch(errIndividual){
            console.error(`WallaceFinanceService: falha também no fallback individual de "${nome}".`, errIndividual);
          }
        }));
        return resultado;
      }
    });
  },
  async getSaldoCaixa(nomeCaixa){
    const caixas = await this.getCaixas();
    const caixa = caixas.find(c => c.nome === nomeCaixa);
    if(!caixa) throw new Error(`WallaceFinanceService: caixa "${nomeCaixa}" nao encontrada`);
    const resp = await fetch(`${this._url}/rest/v1/transacoes?select=tipo,valor&caixa_id=eq.${caixa.id}&status=eq.confirmado`, {
      headers: this._headers()
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
    // CORRIGIDO 08/08/2026 (bug estrutural real, achado ao investigar Patrimonio/CDI travando):
    // o cache guardava o ARRAY bruto (`dado`), mas a funcao retorna o objeto desembrulhado
    // (`dado[0]`) - na 1a chamada funcionava (retornava certo antes de cachear errado), mas a
    // partir da 2a chamada pro mesmo dado (cache hit), devolvia o ARRAY em vez do objeto, e
    // qualquer `.campo` lido nesse "objeto" virava undefined -> NaN silencioso rio abaixo. Cache
    // e retorno agora sempre guardam/devolvem o MESMO valor.
    return this._cache.obterOuBuscar('vw_patrimonio_v2', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_patrimonio_v2?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_patrimonio_v2`);
      const dado = await resp.json();
      return dado[0] || null;
    });
  },
  // NOVO 13/08/2026 (pedido do usuário: saldo real da Reserva de Emergência via Pluggy, não só o
  // valor manual travado em R$100.000,00 - patrimonio.reserva, ver vw_patrimonio_v2). Fonte: tabela
  // pluggy_investimentos (persistência nova de 13/08/2026, antes os dados de /investments da Pluggy
  // eram buscados e descartados). Filtro por nome (CDB Itaú) porque pluggy_conexoes.banco vem
  // genérico "MeuPluggy" pra todas as 5 conexões (não distingue banco real) - único jeito confiável
  // hoje de isolar a posição certa.
  async getReservaEmergenciaPluggy(){
    return this._cache.obterOuBuscar('pluggy_reserva_emergencia', async () => {
      const resp = await fetch(`${this._url}/rest/v1/pluggy_investimentos?select=valor,atualizado_em&nome=ilike.*ITAU*&tipo=eq.FIXED_INCOME`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar pluggy_investimentos (reserva)`);
      const linhas = await resp.json();
      if(!Array.isArray(linhas) || !linhas.length) return null;
      const total = Math.round(linhas.reduce((s,l)=>s+Number(l.valor||0),0)*100)/100;
      const atualizadoEm = linhas.reduce((max,l)=>!max || l.atualizado_em>max ? l.atualizado_em : max, null);
      return { total, atualizadoEm, qtdPosicoes: linhas.length };
    });
  },
  // NOVO 08/08/2026 (Solar entra na V2 — modelo de ciclos de crédito): ciclo aberto atual
  // (vw_ciclo_solar_aberto, sempre 0 ou 1 linha) e histórico de ciclos já fechados
  // (vw_ciclo_solar_historico) — ver docs/decisions para o desenho completo do domínio.
  async getCicloSolarAbertoV2(){
    return this._cache.obterOuBuscar('vw_ciclo_solar_aberto', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_ciclo_solar_aberto?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_ciclo_solar_aberto`);
      const dado = await resp.json();
      return dado[0] || null;
    });
  },
  async getCiclosSolarHistoricoV2(){
    return this._cache.obterOuBuscar('vw_ciclo_solar_historico', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_ciclo_solar_historico?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_ciclo_solar_historico`);
      return await resp.json();
    });
  },
  // NOVO 08/08/2026 (Onda 4, domínio 2 — Investimentos/ROC): posições de opções direto de
  // `investimentos` (tipo=opcoes) — campos crus, mesmo shape que VARS.opcoesVendidasDetalhe usava
  // (ticker/ativo/strike/vencimento/prêmios/etc). O cálculo de ROC continua 100% em
  // calcularROCOpcoes() (opcoes-roc.js, inalterado) — aqui só troca a origem do dado bruto.
  async getInvestimentosOpcoesV2(){
    return this._cache.obterOuBuscar('investimentos_opcoes', async () => {
      const resp = await fetch(`${this._url}/rest/v1/investimentos?select=ticker,ativo_subjacente,quantidade,valor_atual,preco_exercicio,data_vencimento,premio_bruto,custo_operacional,premio_recebido,preco_medio,nota_corretagem,exercida&tipo=eq.opcoes`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar investimentos (opções)`);
      return await resp.json();
    });
  },
  // NOVO 12/08/2026 (achado do usuário: "lag pra carregar os valores" — confirmado no profiling:
  // até 9 chamadas separadas pra /rest/v1/indicadores, uma por nome, cada uma seu próprio
  // roundtrip). A tabela tem só 32 linhas (1 por nome, sem histórico) — busca TODAS de uma vez e
  // getIndicador(nome) passa a ler do mapa em memória, sem refazer fetch por chamador. Assinatura
  // de getIndicador() não muda (continua recebendo 1 nome, devolvendo 1 objeto ou null) — nenhum
  // dos ~8 chamadores precisou ser tocado.
  async _obterTodosIndicadores(){
    return this._cache.obterOuBuscar('indicadores_todos', async () => {
      const resp = await fetch(`${this._url}/rest/v1/indicadores?select=nome,valor,data_calculo&order=data_calculo.desc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar indicadores`);
      const linhas = await resp.json();
      const mapa = new Map();
      // order=data_calculo.desc + só grava se ainda não tiver essa chave -> primeira ocorrência de
      // cada nome é sempre a mais recente (equivalente ao antigo order+limit=1 por nome).
      linhas.forEach(l => { if(!mapa.has(l.nome)) mapa.set(l.nome, l); });
      return mapa;
    });
  },
  async getIndicador(nome){
    // CORRIGIDO 08/08/2026 (bug estrutural real, achado ao investigar Patrimonio/CDI travando):
    // o cache guardava o ARRAY bruto (`dado`), mas a funcao retorna o objeto desembrulhado
    // (`dado[0]`) - na 1a chamada funcionava (retornava certo antes de cachear errado), mas a
    // partir da 2a chamada pro mesmo dado (cache hit), devolvia o ARRAY em vez do objeto, e
    // qualquer `.campo` lido nesse "objeto" virava undefined -> NaN silencioso rio abaixo. Cache
    // e retorno agora sempre guardam/devolvem o MESMO valor.
    const mapa = await this._obterTodosIndicadores();
    return mapa.get(nome) || null;
  },
  // NOVO 08/08/2026 (Onda 4, domínio 3 — LREI): vw_emprestimos_internos_v2 (mesmo shape de
  // VARS.LREI_ATIVAS — id/data/credora/devedora/valor/origem/status/quitadoEm/quitadoPor).
  async getEmprestimosInternosV2(){
    return this._cache.obterOuBuscar('vw_emprestimos_internos_v2', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_emprestimos_internos_v2?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_emprestimos_internos_v2`);
      return await resp.json();
    });
  },
  // NOVO 08/08/2026 (Onda 4, domínio 4 — Cascata Wärtsilá): quebra por perna do ciclo mais recente
  // (reembolso_wartsila_ciclo) — não existia tabela nenhuma com essa granularidade antes.
  async getReembolsoWartsilaCicloV2(){
    // CORRIGIDO 08/08/2026 (bug estrutural real, achado ao investigar Patrimonio/CDI travando):
    // o cache guardava o ARRAY bruto (`dado`), mas a funcao retorna o objeto desembrulhado
    // (`dado[0]`) - na 1a chamada funcionava (retornava certo antes de cachear errado), mas a
    // partir da 2a chamada pro mesmo dado (cache hit), devolvia o ARRAY em vez do objeto, e
    // qualquer `.campo` lido nesse "objeto" virava undefined -> NaN silencioso rio abaixo. Cache
    // e retorno agora sempre guardam/devolvem o MESMO valor.
    return this._cache.obterOuBuscar('reembolso_wartsila_ciclo', async () => {
      const resp = await fetch(`${this._url}/rest/v1/reembolso_wartsila_ciclo?select=*&order=ciclo_referencia.desc&limit=1`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar reembolso_wartsila_ciclo`);
      const dado = await resp.json();
      return dado[0] || null;
    });
  },
  // NOVO 08/08/2026 (Onda 5, domínio 1 — Parcelamentos): vw_parcelamentos_v2 — `parcelas` já tinha
  // as 22 linhas (16 Visa + 6 MP) sincronizadas 1:1 com VARS.PARCELAMENTOS_VISA/MP, só faltava a view.
  async getParcelamentosV2(){
    return this._cache.obterOuBuscar('vw_parcelamentos_v2', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_parcelamentos_v2?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_parcelamentos_v2`);
      return await resp.json();
    });
  },
  // NOVO 08/08/2026 (Onda 5, domínio 2 — P2P): vw_p2p_v2, 7 escalares "verdade externa" (mesmo
  // padrão do CDI) agora em `indicadores`.
  async getP2PV2(){
    // CORRIGIDO 08/08/2026 (bug estrutural real, achado ao investigar Patrimonio/CDI travando):
    // o cache guardava o ARRAY bruto (`dado`), mas a funcao retorna o objeto desembrulhado
    // (`dado[0]`) - na 1a chamada funcionava (retornava certo antes de cachear errado), mas a
    // partir da 2a chamada pro mesmo dado (cache hit), devolvia o ARRAY em vez do objeto, e
    // qualquer `.campo` lido nesse "objeto" virava undefined -> NaN silencioso rio abaixo. Cache
    // e retorno agora sempre guardam/devolvem o MESMO valor.
    return this._cache.obterOuBuscar('vw_p2p_v2', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_p2p_v2?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_p2p_v2`);
      const dado = await resp.json();
      return dado[0] || null;
    });
  },
  // NOVO 08/08/2026 (migração wallace_dados.MERCADOPAGO_EVENTOS -> tabela mercadopago_eventos):
  // mesmo shape de VARS.MERCADOPAGO_EVENTOS (id/origem/tipo/descricao/valor/data/status/metadata),
  // + status_triagem. Ver hydrate-onda6-mercadopago.js.
  async getMercadoPagoEventosV2(){
    return this._cache.obterOuBuscar('mercadopago_eventos', async () => {
      const resp = await fetch(`${this._url}/rest/v1/mercadopago_eventos?select=id,origem,tipo,descricao,valor,data,status,status_triagem,metadata&order=data.desc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar mercadopago_eventos`);
      return await resp.json();
    });
  },
  // NOVO 08/08/2026 (migração wallace_dados.PLUGGY_CONTAS -> tabelas pluggy_conexoes/pluggy_contas/
  // pluggy_transacoes): busca as 3 tabelas e reconstrói localmente o MESMO shape aninhado que
  // VARS.PLUGGY_CONTAS já tinha ({conexoes:[{item_id,banco,status,atualizado_em,contas:[{numero,tipo,
  // ...,fatura_mes_atual:{...},transacoes_recentes:[...]}]}]}) — reconciliarPluggy()/
  // reconciliarTransacoesPluggy() (V1, inalteradas) continuam lendo esse shape sem saber que a fonte
  // mudou. Ver hydrate-onda7-pluggy.js.
  async getPluggyContasV2(){
    return this._cache.obterOuBuscar('pluggy_contas_v2', async () => {
      const [respConexoes, respContas, respTransacoes] = await Promise.all([
        fetch(`${this._url}/rest/v1/pluggy_conexoes?select=item_id,banco,status,atualizado_em`, { headers: this._headers() }),
        fetch(`${this._url}/rest/v1/pluggy_contas?select=id,conexao_id,numero,tipo,subtipo,nome,saldo,moeda,limite_total,limite_disponivel,fatura_vencimento_atual,fatura_valor_total,fatura_pagamento_minimo,qtd_transacoes_sincronizadas`, { headers: this._headers() }),
        fetch(`${this._url}/rest/v1/pluggy_transacoes?select=id,conta_id,data,descricao,valor,categoria,status`, { headers: this._headers() }),
      ]);
      if(!respConexoes.ok) throw new Error(`WallaceFinanceService: erro ${respConexoes.status} ao buscar pluggy_conexoes`);
      if(!respContas.ok) throw new Error(`WallaceFinanceService: erro ${respContas.status} ao buscar pluggy_contas`);
      if(!respTransacoes.ok) throw new Error(`WallaceFinanceService: erro ${respTransacoes.status} ao buscar pluggy_transacoes`);
      const [conexoesRaw, contasRaw, transacoesRaw] = await Promise.all([respConexoes.json(), respContas.json(), respTransacoes.json()]);

      const transacoesPorConta = new Map();
      transacoesRaw.forEach(t => {
        if(!transacoesPorConta.has(t.conta_id)) transacoesPorConta.set(t.conta_id, []);
        transacoesPorConta.get(t.conta_id).push({
          id: t.id, data: t.data, descricao: t.descricao,
          valor: t.valor !== null ? Number(t.valor) : null, categoria: t.categoria, status: t.status,
        });
      });
      const contasPorConexao = new Map();
      contasRaw.forEach(a => {
        if(!contasPorConexao.has(a.conexao_id)) contasPorConexao.set(a.conexao_id, []);
        contasPorConexao.get(a.conexao_id).push({
          numero: a.numero, tipo: a.tipo, subtipo: a.subtipo, nome: a.nome,
          saldo: a.saldo !== null ? Number(a.saldo) : null, moeda: a.moeda,
          limite_total: a.limite_total !== null ? Number(a.limite_total) : null,
          limite_disponivel: a.limite_disponivel !== null ? Number(a.limite_disponivel) : null,
          fatura_vencimento_atual: a.fatura_vencimento_atual,
          fatura_mes_atual: (a.fatura_valor_total !== null) ? {
            valor_total: Number(a.fatura_valor_total),
            vencimento: a.fatura_vencimento_atual,
            pagamento_minimo: a.fatura_pagamento_minimo !== null ? Number(a.fatura_pagamento_minimo) : null,
          } : null,
          qtd_transacoes: a.qtd_transacoes_sincronizadas,
          transacoes_recentes: transacoesPorConta.get(a.id) || [],
        });
      });
      return {
        conexoes: conexoesRaw.map(c => ({
          item_id: c.item_id, banco: c.banco, status: c.status, atualizado_em: c.atualizado_em,
          contas: contasPorConexao.get(c.item_id) || [],
        })),
      };
    });
  },
  // NOVO 08/08/2026 (migração wallace_dados/vars-caixas.js.CRONOGRAMA_BOLETOS_FIXOS -> tabela
  // cronograma_boletos_fixos): schedule dos 9 boletos fixos recorrentes, editável sem deploy de
  // código (mesmo padrão já usado pela tabela `legendas`). Ver hydrate-onda8-cronograma-boletos.js.
  // NOVO 14/08/2026 (ampliação da camada de cache): cronograma_boletos_fixos é config fixa, editada
  // manualmente e raro (já documentado acima em _CHAVES_CACHE_AFETADAS_POR_LANCAMENTO como "não
  // afetado por 1 lançamento") - candidato seguro pra sessionStorage, mesmo raciocínio de
  // getTetoMensalCaixas.
  async getCronogramaBoletosV2(){
    return this._cache.obterOuBuscarPersistente('cronograma_boletos_fixos', async () => {
      const resp = await fetch(`${this._url}/rest/v1/cronograma_boletos_fixos?select=tx,nome,dia_vencimento,valor&ativo=eq.true&order=dia_vencimento.asc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar cronograma_boletos_fixos`);
      return await resp.json();
    }, 120000);
  },
  // NOVO 11/08/2026 (hardening de produção: "eliminar falha silenciosa" das automações agendadas).
  // vw_saude_jobs = última execução (sucesso/erro) de cada job Python, gravada por _heartbeat.py
  // ao final de toda execução (scripts/sync/). Ver hydrate-saude-operacional.js.
  async getSaudeJobs(){
    return this._cache.obterOuBuscar('vw_saude_jobs', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_saude_jobs?select=job_nome,ultima_execucao,ultimo_status,ultimo_detalhe,horas_desde_ultima_execucao`, { headers: this._headers() });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_saude_jobs`);
      return await resp.json();
    });
  },
  // NOVO 11/08/2026 (achado do usuário: "confira se isso tudo é V2" — LRS/LRR/LRCON/LRDOA eram HTML
  // estático, nunca lido do banco) — mesmo padrão de getCronogramaBoletosV2() acima, 4 tabelas novas
  // (cronograma_assinaturas/recorrencias/consorcios/doacoes). Ver hydrate-onda9-livros-fixos.js.
  // NOVO 14/08/2026 (ampliação da camada de cache, mesmo raciocínio de getCronogramaBoletosV2 logo
  // acima — as 4 tabelas cronograma_* abaixo já estavam fora de _CHAVES_CACHE_AFETADAS_POR_LANCAMENTO
  // por serem config fixa/pouco volátil): sessionStorage via obterOuBuscarPersistente, TTL 120s.
  async getCronogramaAssinaturasV2(){
    return this._cache.obterOuBuscarPersistente('cronograma_assinaturas', async () => {
      const resp = await fetch(`${this._url}/rest/v1/cronograma_assinaturas?select=tx,data,nome,valor&ativo=eq.true&order=data.asc`, { headers: this._headers() });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar cronograma_assinaturas`);
      return await resp.json();
    }, 120000);
  },
  async getCronogramaRecorrenciasV2(){
    return this._cache.obterOuBuscarPersistente('cronograma_recorrencias', async () => {
      const resp = await fetch(`${this._url}/rest/v1/cronograma_recorrencias?select=tx,nome,valor,cartao,obs&ativo=eq.true&order=criado_em.asc`, { headers: this._headers() });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar cronograma_recorrencias`);
      return await resp.json();
    }, 120000);
  },
  async getCronogramaConsorciosV2(){
    return this._cache.obterOuBuscarPersistente('cronograma_consorcios', async () => {
      const resp = await fetch(`${this._url}/rest/v1/cronograma_consorcios?select=tx,nome,valor&ativo=eq.true&order=criado_em.asc`, { headers: this._headers() });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar cronograma_consorcios`);
      return await resp.json();
    }, 120000);
  },
  async getCronogramaDoacoesV2(){
    return this._cache.obterOuBuscarPersistente('cronograma_doacoes', async () => {
      const resp = await fetch(`${this._url}/rest/v1/cronograma_doacoes?select=tx,descricao,responsavel,valor&ativo=eq.true&order=criado_em.asc`, { headers: this._headers() });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar cronograma_doacoes`);
      return await resp.json();
    }, 120000);
  },
  // NOVO 10/08/2026 (fecha o último escritor ativo de wallace_dados disparado por clique do
  // usuário — ver PLANO_UNIFICACAO_V1_V2.md seção 44): decisões de Aprovar/Rejeitar da Inbox pra
  // itens de origem Pluggy, antes só em wallace_dados.PLUGGY_TRIAGEM. Tabela nova, mesmo padrão de
  // `legendas`/`cronograma_boletos_fixos` (schema pequeno, sem dependência de outra tabela).
  async getPluggyTriagemV2(){
    return this._cache.obterOuBuscar('pluggy_triagem', async () => {
      const resp = await fetch(`${this._url}/rest/v1/pluggy_triagem?select=id_externo,status_triagem,atualizado_em`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar pluggy_triagem`);
      return await resp.json();
    });
  },
  // NOVO 10/08/2026 (item aprovado, ver ESTADO_ATUAL.md: "filtro de assinatura/recorrência
  // conhecida na Inbox"): descrições de transações já confirmadas na categoria "Assinaturas" (V2,
  // 22 hoje) — usado pra detectar duplicidade por ESTABELECIMENTO, não só por valor exato (uma
  // assinatura com reajuste/variação de câmbio nunca bateria no dedup antigo, só por valor). Sem
  // lista hardcoded de nomes de serviço — a fonte é a categorização real já feita em `transacoes`,
  // sempre atualizada conforme o usuário classifica itens novos.
  async getAssinaturasConfirmadasV2(){
    return this._cache.obterOuBuscar('assinaturas_confirmadas_v2', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_assinaturas_confirmadas_v2?select=descricao`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_assinaturas_confirmadas_v2`);
      return await resp.json();
    });
  },
  // NOVO 12/08/2026 (aba Emagrecimento, pedido do usuário): pesagens datadas, ordenadas por data —
  // fonte do gráfico de evolução de peso. Mesmo padrão de getCronogramaBoletosV2/etc.
  async getPesagens(){
    return this._cache.obterOuBuscar('pesagens', async () => {
      const resp = await fetch(`${this._url}/rest/v1/pesagens?select=data,peso_kg&order=data.asc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar pesagens`);
      return await resp.json();
    });
  },
  // NOVO 13/08/2026 (aba Emagrecimento, pedido do usuário: "preciso desse controle" — 1ª aplicação
  // da caneta Ozivy Semaglutida em 13/08/2026, dose 0,25mg de titulação). Tabela `aplicacoes_ozivy`
  // (mesmo padrão de `pesagens`: 1 linha por data, RLS só leitura pra login Firebase válido, insert
  // feito manualmente/via agente conforme cada aplicação acontece de verdade).
  async getAplicacoesOzivy(){
    return this._cache.obterOuBuscar('aplicacoes_ozivy', async () => {
      const resp = await fetch(`${this._url}/rest/v1/aplicacoes_ozivy?select=data,dose_mg,observacao&order=data.asc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar aplicacoes_ozivy`);
      return await resp.json();
    });
  },
  // NOVO 15/08/2026 (WWI Fase 2C — aba "Wealth Intelligence" permanente, pedido do usuário: "o WWI
  // passa a ser a fonte primária, o PDF passa a ser a saída"). 3 métodos novos, mesmo padrão de
  // cache dos demais (TTL 90s em memória — histórico muda só 1x/mês pelo job, não precisa de mais).
  // getWwiHistoricoCompleto() busca `historico_relatorios` inteiro (score/dados_json/analise_ia)
  // — mesma tabela/leitura pública já usada por wwiBuscarHistoricoRelatorios() em
  // gerar-analise-financeira.js, só que aqui central na WallaceFinanceService pra reaproveitar
  // cache/pattern com o resto do painel.
  async getWwiHistoricoCompleto(){
    return this._cache.obterOuBuscar('wwi_historico_completo', async () => {
      const resp = await fetch(`${this._url}/rest/v1/historico_relatorios?select=competencia,score,dados_json,analise_ia&order=competencia.desc`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar historico_relatorios`);
      return await resp.json();
    });
  },
  // vw_wwi_metricas_historico (WWI Fase 2A) — formato longo (1 linha por competência×métrica),
  // M/M・T/T・A/A já calculados, NULL explícito quando não há ponto de comparação (nunca fabrica
  // tendência com histórico insuficiente — ver WWI_FASE2_PROPOSTA_ARQUITETURA.md seção 2).
  async getWwiMetricasHistorico(){
    return this._cache.obterOuBuscar('vw_wwi_metricas_historico', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_wwi_metricas_historico?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_wwi_metricas_historico`);
      return await resp.json();
    });
  },
  // vw_wwi_comparativo_mensal (WWI Fase 1, item 2) — score/patrimonioLiquido com M/M・T/T・A/A.
  async getWwiComparativoMensal(){
    return this._cache.obterOuBuscar('vw_wwi_comparativo_mensal', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_wwi_comparativo_mensal?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_wwi_comparativo_mensal`);
      return await resp.json();
    });
  },
  // vw_wwi_score_historico (WWI Fase 2B) — melhor/pior score por metodologia, média móvel de 3,
  // tendência (só a partir do 4º ponto contíguo).
  async getWwiScoreHistorico(){
    return this._cache.obterOuBuscar('vw_wwi_score_historico', async () => {
      const resp = await fetch(`${this._url}/rest/v1/vw_wwi_score_historico?select=*`, {
        headers: this._headers()
      });
      if(!resp.ok) throw new Error(`WallaceFinanceService: erro ${resp.status} ao buscar vw_wwi_score_historico`);
      return await resp.json();
    });
  }
};

// CORRIGIDO 12/08/2026 (achado do usuário: "tempo pra dados aparecerem ainda demorando" — auditoria
// de agrupamento de chamadas): window.WALLACE_TODOS_INDICADORES_V2 (bootstrap síncrono no HTML, ver
// __promiseCreditosExternosV2/Sistema_Wallace_Lira_Completo.html) já busca TODA a tabela `indicadores`
// pra alimentar creditoUberBalance/mbLRWConfirmado/etc logo no topo deste arquivo — a MESMA tabela que
// _obterTodosIndicadores() (linha ~505) busca de novo, na primeira vez que algum hydrate chama
// getIndicador(), sem saber que o bootstrap já trouxe tudo. Pré-popula o cache aqui com o resultado do
// bootstrap (mesmo formato de Map que _obterTodosIndicadores() monta) — 1 fetch de indicadores no
// boot inteiro, não 2. Se o bootstrap falhou (array vazio/ausente), não popula nada — próxima chamada
// de getIndicador() cai no caminho normal (fetch dela mesma), sem regressão.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_TODOS_INDICADORES_V2) && window.WALLACE_TODOS_INDICADORES_V2.length){
  const __mapaIndicadoresBootstrap = new Map();
  window.WALLACE_TODOS_INDICADORES_V2.forEach(l => { if(!__mapaIndicadoresBootstrap.has(l.nome)) __mapaIndicadoresBootstrap.set(l.nome, l); });
  WallaceFinanceService._cache.set('indicadores_todos', Promise.resolve(__mapaIndicadoresBootstrap));
}

// NOVO 08/08/2026 (diretriz arquitetural: "V2 é a fonte real, V1 é legado" — não perpetuar
// convivência silenciosa): usada pelos módulos Onda 4/5 já migrados quando a busca na V2 falha.
// ANTES: catch só logava e retornava, deixando o valor V1 (síncrono, já renderizado) na tela sem
// nenhum aviso — o usuário via um número plausível sem saber que não veio da fonte oficial.
// AGORA: marca visivelmente os ids afetados, pra nunca mais existir fallback silencioso tratado
// como "informação válida igual à V2". Não apaga o valor calculado (mantém rastreável no
// console/WALLACE_ONDA*_RELATORIO), só deixa claro na tela que a fonte oficial falhou agora.
function marcarIndisponivelV2(ids, motivo){
  ids.forEach(id => {
    const el = $(id);
    if(el) el.innerHTML = '<span style="color:var(--text-danger)" title="'+(motivo||'Falha ao buscar dado na V2 (Supabase)').replace(/"/g,'&quot;')+'">⚠ Indisponível (V2)</span>';
  });
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
// e testável sem navegador. 2 partes:
// 1) Captura de erros nao tratados (window.onerror + unhandledrejection) - antes disso, um erro de JS em
//    producao nao deixava nenhum registro central, so sumia no console de quem estivesse olhando na hora.
//    Nao suprime nem re-lanca o erro, so registra e emite via WallaceBus (erroCapturado) pra quem quiser ouvir.
// 2) Metrica de tempo de carregamento (window 'load'), unico numero real e comparavel sem infra externa.
// Acesso manual: window.WallaceObs.listarErros() no console do navegador. Nenhuma UI nova criada -
// mesma decisao de escopo da Etapa 10 (nao inventar card/badge sem criterio definido pelo usuario).
// ATUALIZADO 11/08/2026 (fecha o ponto cego "erro real e invisivel pra sempre" da auditoria de
// prontidao operacional): alem de guardar em memoria, cada erro agora tambem e persistido via RPC
// `registrar_erro_cliente` (SECURITY DEFINER, publica de proposito - erro pode acontecer ANTES do
// login). Best-effort puro, igual ao heartbeat das automacoes: falha no envio NUNCA derruba nem afeta
// o app, so cai num catch silencioso. Validado com chamada real (curl, anon key) nesta sessao antes de
// conectar aqui - a RPC grava certo. Nao inventa retry/fila - se a rede cair no momento do erro, o
// registro fica só na memória local mesmo, aceitável pro volume de uso deste sistema.
function __wallaceRegistrarErroRemoto(mensagem, stack, contexto){
  try {
    fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/registrar_erro_cliente', {
      method: 'POST',
      headers: Object.assign({'Content-Type':'application/json'}, __wallaceAuthHeader()),
      body: JSON.stringify({p_mensagem: mensagem, p_stack: stack || null, p_contexto: contexto || null})
    }).catch(function(){ /* best-effort - silencioso de proposito, mesmo criterio do heartbeat */ });
  } catch(e) { /* nunca deixar a propria observabilidade quebrar o app */ }
}
const WallaceObs = (function(){
  const erros = [];
  window.addEventListener('error', function(e){
    const registro = {tipo:'erro', mensagem:e.message, arquivo:e.filename, linha:e.lineno, hora:new Date().toISOString()};
    erros.push(registro);
    console.error('[Wallace] Erro capturado:', registro);
    WallaceBus.emit('erroCapturado', registro);
    __wallaceRegistrarErroRemoto(e.message, e.filename + ':' + e.lineno, {tipo:'erro'});
  });
  window.addEventListener('unhandledrejection', function(e){
    const motivo = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    const registro = {tipo:'promise', mensagem:motivo, hora:new Date().toISOString()};
    erros.push(registro);
    console.error('[Wallace] Promise rejeitada sem tratamento:', registro);
    WallaceBus.emit('erroCapturado', registro);
    __wallaceRegistrarErroRemoto(motivo, e.reason && e.reason.stack, {tipo:'promise'});
  });
  window.addEventListener('load', function(){
    const tempoMs = Math.round(performance.now());
    console.info('[Wallace] Carregado em ' + tempoMs + 'ms');
    WallaceBus.emit('performanceMedida', {tempoMs, hora:new Date().toISOString()});
    // NOVO 14/08/2026: breakdown por módulo de boot, ordenado do mais lento pro mais rápido —
    // ver window.WALLACE_BOOT_TIMING/medirOnda() no topo do arquivo. Algumas ondas assíncronas
    // (fetch em voo) podem ainda não ter terminado no momento exato do evento 'load' — nesse caso
    // ficam de fora desta impressão, mas continuam aparecendo em window.WALLACE_BOOT_TIMING assim
    // que resolverem, consultável manualmente no console.
    if(Array.isArray(window.WALLACE_BOOT_TIMING) && window.WALLACE_BOOT_TIMING.length){
      const ordenado = window.WALLACE_BOOT_TIMING.slice().sort((a, b) => b.duracaoMs - a.duracaoMs);
      console.table(ordenado);
    }
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

// REMOVIDO 12/08/2026 (sepultamento final da V1 — usuário revogou a exceção arquitetural que mantinha
// este merge vivo e pediu remoção total): até aqui existia `Object.assign(VARS, dr)`, aplicando
// window.WALLACE_DADOS_REMOTOS (wallace_dados.dados) por cima do VARS estático. Cada campo que esse
// merge alimentava já tem fonte V2 própria hoje: os ~90 campos de wallace_dados foram auditados nesta
// sessão — caixas/transações via `transacoes`/`caixas` (Ondas 1-10), headline totals de cartão via
// `indicadores` (cartaoMBTotal/cartaoInfiniteTotal/mbLRWConfirmado/mbLRVConfirmado, bloco logo abaixo),
// e os últimos ~15 escalares/objetos isolados (data de nascimento, financiamento da casa, consórcio,
// reserva/BTG/Necton/FGTS/PGBL, composição tarifária Energisa, overrides pontuais) via
// `parametros_gerais` (bloco logo abaixo). A busca de `window.WALLACE_DADOS_REMOTOS` também foi
// removida do HTML de bootstrap (Sistema_Wallace_Lira_Completo.html) — não sobra fetch morto.
// `__literalAntesDoMerge` (usado como fallback dos blocos de créditos externos/tarifa solar mais abaixo)
// agora captura direto
// do literal estático de vars-operacional.js/vars-energia-solar.js, sem nunca ter passado por
// wallace_dados — mesmo comportamento de antes quando a V2 respondia certo, sem regressão.
const __literalAntesDoMerge = {
  creditoUberBalance: VARS.creditoUberBalance, creditoShellBox: VARS.creditoShellBox,
  creditoKmvIpiranga: VARS.creditoKmvIpiranga, proLaboreFixo: VARS.proLaboreFixo,
  consumoMinimoComSolarKwh: VARS.consumoMinimoComSolarKwh, faturaEnergisaKwh: VARS.faturaEnergisaKwh,
  faturaEnergisaValor: VARS.faturaEnergisaValor, taxaMinimaEnergisa: VARS.taxaMinimaEnergisa,
};
// NOVO 08/08/2026 (Solar entra na V2 — desligamento da V1): mesmo padrão do bloco LEGENDAS abaixo —
// window.WALLACE_SOLAR_LEITURAS_V2 (buscado no bootstrap do HTML, tabela energia_solar_leituras)
// sempre tem a última palavra sobre VARS.SOLAR_LEITURAS, sobrescrevendo tanto o literal local
// (criarVarsEnergiaSolar) quanto o wallace_dados.SOLAR_LEITURAS aplicado pelo Object.assign acima.
// Domínio Solar é V2-exclusivo a partir de hoje: se a V2 não respondeu, NÃO cai pro SOLAR_LEITURAS
// do wallace_dados (proibido fallback silencioso) — vira array vazio; graficos-cenarios-lazy.js já
// trata "sem leitura" com "Dados insuficientes para cálculo" em vez de mostrar número desatualizado.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_SOLAR_LEITURAS_V2) && window.WALLACE_SOLAR_LEITURAS_V2.length){
  const ativacaoSolar = new Date(VARS.solarDataAtivacao);
  VARS.SOLAR_LEITURAS = window.WALLACE_SOLAR_LEITURAS_V2.map(r => {
    const dataLeitura = new Date(r.data);
    const dias = Math.round((dataLeitura - ativacaoSolar) / 86400000);
    return {
      data: r.data, dias,
      leitura03: Number(r.leitura_03), leitura103: Number(r.leitura_103),
      geracaoAcumulada: r.geracao_acumulada != null ? Number(r.geracao_acumulada) : null,
      geracaoAcumuladaData: null, // não existe em energia_solar_leituras (V2) — nunca fabricado (P1)
      fonte: 'real',
      // NOVO 11/08/2026 (pedido do usuário: leitura de fronteira de ciclo divide a geração do dia
      // 50/50 entre o mês que fecha e o que abre, já que não se sabe a hora exata do leiturista —
      // ver ajuste em graficos-cenarios-lazy.js, só usa esta flag pra saber QUAL leitura é fronteira).
      ehLeituraOficial: !!r.eh_leitura_oficial_energisa,
    };
  });
} else {
  console.error('Solar V2: window.WALLACE_SOLAR_LEITURAS_V2 indisponível — domínio é V2-exclusivo, sem fallback silencioso pro SOLAR_LEITURAS do wallace_dados.');
  VARS.SOLAR_LEITURAS = [];
}

// NOVO 08/08/2026 (Solar — domínio de primeira classe, desligamento da V1): mesmo padrão do bloco
// SOLAR_LEITURAS acima — window.WALLACE_SOLAR_GERACAO_DIARIA_V2 (bootstrap do HTML, tabela
// energia_solar_geracao_diaria) sempre vence tanto o literal local quanto o wallace_dados.
// SOLAR_GERACAO_DIARIA aplicado pelo Object.assign lá em cima. Sem fallback silencioso: se a V2 não
// respondeu, vira array vazio — hydrate-onda5-qualidade-geracao.js já trata isso ("Sem histórico de
// geração diária ainda"), e os 2 outros consumidores (graficos-cenarios-lazy.js) já toleram array
// vazio/incompleto (checam .length e usam Map por data, nunca assumem posição fixa).
// ACHADO 08/08/2026: a V2 está com um gap real de sincronização — faltam os dias 06/08 e 07/08 (existem
// no wallace_dados, não existem ainda em energia_solar_geracao_diaria). Não preenchido aqui (proibido
// fabricar dado, P1) — os campos dependentes mostram o resultado real com esse gap.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_SOLAR_GERACAO_DIARIA_V2) && window.WALLACE_SOLAR_GERACAO_DIARIA_V2.length){
  VARS.SOLAR_GERACAO_DIARIA = window.WALLACE_SOLAR_GERACAO_DIARIA_V2.map(r => ({
    data: r.data,
    kwh: Number(r.geracao_kwh),
    capturadoEm: r.created_at || null,
    // NOVO 08/08/2026 (badge de frescor): atualizado_em (via trigger BEFORE INSERT OR UPDATE) —
    // ao contrário de created_at (congela na 1a insercao do dia), reflete SEMPRE a ultima gravacao
    // real do robo, mesmo em execucoes subsequentes no mesmo dia via upsert parcial.
    atualizadoEm: r.atualizado_em || null,
  }));
} else {
  console.error('Solar V2: window.WALLACE_SOLAR_GERACAO_DIARIA_V2 indisponível — domínio é V2-exclusivo, sem fallback silencioso pro SOLAR_GERACAO_DIARIA do wallace_dados.');
  VARS.SOLAR_GERACAO_DIARIA = [];
}

// NOVO 14/08/2026 (pedido do usuário: "quero que crie o local para receber os dados e os cálculos,
// quando chegar as faturas eu envio e você joga no supabase e a mágica acontece"). Consumo diário de
// referência de cada casa (VARS.solarConsumoDiarioWallace/Irma/Mae, usado em 6 lugares do código —
// gráficos de energia, alerta de cobertura das 3 casas, projeção de consumo esperado) — até agora
// só existia hardcoded em vars-energia-solar.js (linha "300/30" etc, comentário citando a fatura de
// origem). Tabela nova energia_solar_consumo_referencia (supabase/migrations/) guarda o mesmo valor
// já com a fatura de origem registrada — atualizar é 1 UPDATE na tabela em vez de editar código.
// COM fallback (diferente do domínio Solar acima, que é V2-exclusivo sem fallback): se a tabela
// estiver vazia/offline, os 3 campos de VARS já setados por vars-energia-solar.js continuam valendo
// — esses 3 números mudam raríssimo (só quando chega fatura nova), não vale a pena arriscar quebrar
// o site inteiro por causa deles.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2) && window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2.length){
  const CASA_PARA_CAMPO_VARS = { wallace: 'solarConsumoDiarioWallace', irma: 'solarConsumoDiarioIrma', mae: 'solarConsumoDiarioMae' };
  window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2.forEach(r => {
    const campo = CASA_PARA_CAMPO_VARS[r.casa];
    if(campo && r.consumo_diario_kwh != null) VARS[campo] = Number(r.consumo_diario_kwh);
  });
  console.log('Solar: consumo diário de referência (Wallace/irmã/mãe) atualizado via energia_solar_consumo_referencia (V2).', window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2);
} else {
  console.warn('Solar: energia_solar_consumo_referencia (V2) indisponível — mantendo o valor local de vars-energia-solar.js (não quebra, só pode estar desatualizado se uma fatura nova não foi lançada na tabela ainda).');
}

// ATUALIZADO 11/08/2026 (auditoria de prontidão operacional, eliminação de dependência de V1):
// domínio ACOES_COTACOES agora V2-exclusivo, mesmo padrão já usado pra Solar (sem fallback
// silencioso pro literal antigo/wallace_dados). window.WALLACE_COTACOES_ACOES_V2 (bootstrap do HTML,
// tabela cotacoes_acoes) é a única fonte - se não respondeu, avisa e zera em vez de servir dado
// potencialmente desatualizado silenciosamente.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_COTACOES_ACOES_V2) && window.WALLACE_COTACOES_ACOES_V2.length){
  const cotacoesV2 = {};
  let atualizadoEmMaisRecente = null;
  window.WALLACE_COTACOES_ACOES_V2.forEach(r => {
    cotacoesV2[r.ticker] = { preco: Number(r.preco), variacao: Number(r.variacao) };
    if(!atualizadoEmMaisRecente || new Date(r.atualizado_em) > new Date(atualizadoEmMaisRecente)){
      atualizadoEmMaisRecente = r.atualizado_em;
    }
  });
  VARS.ACOES_COTACOES = cotacoesV2;
  VARS.ACOES_COTACOES_ATUALIZADO_EM = atualizadoEmMaisRecente;
} else {
  console.error('Cotações V2: window.WALLACE_COTACOES_ACOES_V2 indisponível — domínio é V2-exclusivo, sem fallback silencioso pro ACOES_COTACOES do wallace_dados.');
  VARS.ACOES_COTACOES = {};
  VARS.ACOES_COTACOES_ATUALIZADO_EM = null;
}

// ATUALIZADO 11/08/2026 (auditoria de prontidão operacional, eliminação de dependência de V1):
// remove o fallback pra wallace_dados especificamente - mas HISTORICO_ERP_TODOS_CICLOS TEM um
// literal de código próprio (snapshot estático em vars-operacional.js, não é dado de wallace_dados),
// já aplicado por criarVarsOperacional() antes deste ponto - continua valendo se a V2 falhar (não é
// V1, é o mesmo tipo de fallback já usado pras 4 constantes de tarifa solar/créditos externos, que
// não são wallace_dados e por isso não foram tocados aqui).
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_HISTORICO_ERP_V2) && window.WALLACE_HISTORICO_ERP_V2.length){
  VARS.HISTORICO_ERP_TODOS_CICLOS = window.WALLACE_HISTORICO_ERP_V2.map(r => ({
    tx: r.tx, data: r.data, nome: r.nome, valor: Number(r.valor),
  }));
} else {
  console.error('Histórico ERP V2: window.WALLACE_HISTORICO_ERP_V2 indisponível — usando o literal estático de vars-operacional.js (não é wallace_dados/V1, é o snapshot de código já aplicado).');
}

// ATUALIZADO 11/08/2026 (auditoria de prontidão operacional, eliminação de dependência de V1):
// window.WALLACE_PARAMETROS_SOLARES_V2 (bootstrap do HTML, tabela parametros_solares) vence o literal
// de código se respondeu com dado. Se falhar, restaura explicitamente o literal de
// vars-energia-solar.js capturado em __literalAntesDoMerge (ANTES de qualquer valor de wallace_dados
// ter tido chance de contaminar via Object.assign(VARS, dr) acima) - nunca serve o resíduo de V1.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_PARAMETROS_SOLARES_V2) && window.WALLACE_PARAMETROS_SOLARES_V2.length){
  window.WALLACE_PARAMETROS_SOLARES_V2.forEach(r => { VARS[r.chave] = Number(r.valor); });
} else if(__literalAntesDoMerge) {
  console.error('Parâmetros solares V2: window.WALLACE_PARAMETROS_SOLARES_V2 indisponível — usando o literal de código de vars-energia-solar.js (não wallace_dados/V1).');
  VARS.consumoMinimoComSolarKwh = __literalAntesDoMerge.consumoMinimoComSolarKwh;
  VARS.faturaEnergisaKwh = __literalAntesDoMerge.faturaEnergisaKwh;
  VARS.faturaEnergisaValor = __literalAntesDoMerge.faturaEnergisaValor;
  VARS.taxaMinimaEnergisa = __literalAntesDoMerge.taxaMinimaEnergisa;
}

// ATUALIZADO 11/08/2026 (auditoria de prontidão operacional, eliminação de dependência de V1):
// PIB_WALLACE_HISTORICO agora V2-exclusivo - não tem literal de código próprio (só existia via
// wallace_dados), e os 2 consumidores conhecidos (promocoes-financeengine.js,
// recalcular-indicadores.js) já fazem `VARS.PIB_WALLACE_HISTORICO || {}` defensivamente, então um
// objeto vazio no fallback não quebra nada.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_PIB_HISTORICO_V2) && window.WALLACE_PIB_HISTORICO_V2.length){
  const pibV2 = {};
  window.WALLACE_PIB_HISTORICO_V2.forEach(r => { pibV2[r.mes] = r.snapshot; });
  VARS.PIB_WALLACE_HISTORICO = pibV2;
} else {
  console.error('PIB Wallace V2: window.WALLACE_PIB_HISTORICO_V2 indisponível — domínio é V2-exclusivo, sem fallback silencioso pro PIB_WALLACE_HISTORICO do wallace_dados.');
  VARS.PIB_WALLACE_HISTORICO = {};
}

// ATUALIZADO 11/08/2026 (auditoria de prontidão operacional, eliminação de dependência de V1):
// window.WALLACE_TODOS_INDICADORES_V2 (bootstrap do HTML, tabela indicadores) vence o literal de
// código se respondeu com dado. CRITICO: proLaboreFixo precisa ser sobrescrito AQUI, bem no topo
// do arquivo - reg-operacional.js (criarRegOperacional(), Object.assign(REG,...) mais abaixo) copia
// VARS.proLaboreFixo pra dentro de REG.operacional.proLaboreFixo UMA VEZ; se essa sobrescrita
// rodasse depois desse Object.assign, REG ficaria dessincronizado de VARS.proLaboreFixo. Se a V2
// não respondeu, restaura o literal de código capturado em __literalAntesDoMerge (não o resíduo de
// wallace_dados) - mesmo padrão do bloco de tarifa solar logo acima.
// ATUALIZADO 11/08/2026 (execução da auditoria de eliminação de V1 - bloqueadores Categoria A):
// cartaoMBTotal/mbLRWConfirmado/mbLRVConfirmado agora também vêm de `indicadores` (mesma tabela,
// mesmo fetch) - saldo oficial aprovado pelo usuário contra a fatura real do banco (Mastercard
// Black, print 11/08/2026), gravado direto na V2. Antes só existiam via wallace_dados (bloqueador
// confirmado na auditoria) - agora `indicadores` é a fonte, sem residir mais em wallace_dados.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_TODOS_INDICADORES_V2) && window.WALLACE_TODOS_INDICADORES_V2.length){
  window.WALLACE_TODOS_INDICADORES_V2.forEach(r => {
    if(r.nome === 'creditoUberBalance') VARS.creditoUberBalance = Number(r.valor);
    else if(r.nome === 'creditoShellBox') VARS.creditoShellBox = Number(r.valor);
    else if(r.nome === 'creditoKmvIpiranga') VARS.creditoKmvIpiranga = Number(r.valor);
    else if(r.nome === 'proLaboreFixo') VARS.proLaboreFixo = Number(r.valor);
    else if(r.nome === 'cartaoMBTotal') VARS.cartaoMBTotal = Number(r.valor);
    else if(r.nome === 'mbLRWConfirmado') VARS.mbLRWConfirmado = Number(r.valor);
    else if(r.nome === 'mbLRVConfirmado') VARS.mbLRVConfirmado = Number(r.valor);
    // NOVO 12/08/2026 (revogação da exceção arquitetural formal de 08/08 — usuário decidiu eliminar
    // 100% da dependência de V1, mesmo pra headline totals de cartão): cartaoInfiniteTotal congelado
    // a partir da fatura real do banco (Visa Infinite, vencimento 28/07/2026, "Total da fatura"
    // R$9.073,92, PDF conferido linha a linha) e gravado em `indicadores`, mesmo padrão já usado pro
    // cartaoMBTotal acima. Residual de ~R$3.380 entre este total e a soma item-a-item da V2
    // (`transacoes` com cartao_id Visa, R$5.693,87 confirmado) é limitação objetiva documentada: a
    // Pluggy só sincroniza ~6 semanas de histórico, e o restante das compras parceladas da fatura só
    // existe num PDF com data corrompida por OCR (parcela mesclada com data, sem separador) — sem
    // outra fonte legível disponível. O headline (valor que o banco cobra) é real e conferido; o que
    // falta é o detalhamento item-a-item, não o valor agregado.
    else if(r.nome === 'cartaoInfiniteTotal') VARS.cartaoInfiniteTotal = Number(r.valor);
  });
} else if(__literalAntesDoMerge) {
  console.error('Créditos externos V2: window.WALLACE_TODOS_INDICADORES_V2 indisponível — usando o literal de código de vars-operacional.js (não wallace_dados/V1).');
  VARS.creditoUberBalance = __literalAntesDoMerge.creditoUberBalance;
  VARS.creditoShellBox = __literalAntesDoMerge.creditoShellBox;
  VARS.creditoKmvIpiranga = __literalAntesDoMerge.creditoKmvIpiranga;
  VARS.proLaboreFixo = __literalAntesDoMerge.proLaboreFixo;
}

// NOVO 12/08/2026 (sepultamento final da V1 — usuário revogou a exceção arquitetural e pediu
// remoção total de Object.assign(VARS, dr)): últimos ~15 escalares/objetos isolados (data de
// nascimento, financiamento da casa, consórcio, reserva/BTG/Necton/FGTS/PGBL, composição
// tarifária Energisa, overrides pontuais) que só existiam em wallace_dados — congelados em
// `parametros_gerais` com o valor mais recente já confirmado (o mesmo que dr aplicava até agora,
// só que a partir daqui vem da V2, não do blob). Sem fallback pro literal de vars-*.js aqui de
// propósito: são valores que mudam raramente e não têm "literal seguro" melhor que o último
// congelado — se a V2 não responder, o literal estático (potencialmente desatualizado há meses)
// já é o que os arquivos vars-*.js tinham antes desta migração, sem regressão.
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_PARAMETROS_GERAIS_V2) && window.WALLACE_PARAMETROS_GERAIS_V2.length){
  window.WALLACE_PARAMETROS_GERAIS_V2.forEach(r => { VARS[r.nome] = r.valor; });
} else {
  console.warn('parametros_gerais (V2) indisponível — usando os literais estáticos de vars-*.js (não wallace_dados/V1).');
}

// NOVO 11/08/2026 (auditoria de eliminação de dependência de V1, execução): substitui os arrays de
// transação das 8 caixas cujo saldo V2 foi CONFIRMADO idêntico ao valor real hoje (validado via SQL
// antes desta migração - ver docs/decisions, seção de execução desta auditoria). window.
// WALLACE_CAIXAS_TRANSACOES_V2 (bootstrap do HTML, tabela transacoes filtrada por caixa_id) vence os
// arrays de wallace_dados. Fallback: se a V2 não respondeu, os arrays continuam com o valor que
// window.WALLACE_DADOS_REMOTOS já aplicou acima (que HOJE bate exato com a V2, confirmado) - não é
// fallback pra "V1 errado", é fallback pro mesmo valor, só de origem diferente.
const MAPA_CAIXA_ID_PARA_ARRAY_V2 = {
  'ffa94985-902c-4e8a-bd31-0a15a054a403': 'ANIVERSARIO_JULIO_TRANSACOES',
  '782d8722-392a-440d-8b71-4fa7476a5b30': 'COMBUSTIVEL_TRANSACOES',
  'ecaebc58-8f49-4d85-8ef4-6282ea765c2f': 'EVENTOS_TRANSACOES',
  'df4c44af-3e30-4592-b0b5-5b863ca91591': 'MANUTENCAO_TRANSACOES',
  'd15e8cbe-4443-4ee4-9631-06d8d49058fe': 'SAUDE_FAMILIA_TRANSACOES',
  '8dcfa73a-1560-4b37-9aac-48a499548d2c': 'SEGURO_EMPLACAMENTO_TRANSACOES',
  '3a1e6765-79d9-42bf-8bc0-c93f9c2b77e4': 'ESCOLA_JULIO_TRANSACOES',
  '3d7f37e3-f52f-4aad-a611-23fa54810b39': 'WARTSILA_CAIXA_TRANSACOES',
};
if(typeof window !== 'undefined' && Array.isArray(window.WALLACE_CAIXAS_TRANSACOES_V2)){
  const porArray = {};
  window.WALLACE_CAIXAS_TRANSACOES_V2.forEach(row => {
    const nomeArray = MAPA_CAIXA_ID_PARA_ARRAY_V2[row.caixa_id];
    if(!nomeArray) return; // caixa_id fora do mapa (não é uma das 7 confirmadas) - ignora
    if(!porArray[nomeArray]) porArray[nomeArray] = [];
    const [ano, mes, dia] = row.data.split('-');
    porArray[nomeArray].push({
      tx: row.tx_legado || row.descricao,
      data: `${dia}/${mes}/${ano}`,
      nome: row.descricao || '',
      valor: Number(row.valor),
      tipo: row.tipo === 'entrada' ? 'Entrada' : 'Saída',
    });
  });
  Object.keys(MAPA_CAIXA_ID_PARA_ARRAY_V2).forEach(id => {
    const nomeArray = MAPA_CAIXA_ID_PARA_ARRAY_V2[id];
    if(porArray[nomeArray]) VARS[nomeArray] = porArray[nomeArray];
  });
} else {
  console.warn('Caixas V2 (7 confirmadas): window.WALLACE_CAIXAS_TRANSACOES_V2 indisponível — usando os arrays de wallace_dados (valor já confirmado idêntico ao V2 nesta sessão).');
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

// NOVO 08/08/2026 (infraestrutura de legendas dinâmicas + frescor, pedido do usuário): 3 helpers
// globais, mesmo espírito de marcarIndisponivelV2 — reutilizáveis por qualquer módulo, sem duplicar
// lógica de formatação de data/hora relativa.

// "3 minutos" / "2 horas" / "1 dia" — nunca "3 minuto" nem "1 horas" (singular/plural corretos).
function formatarTempoRelativo(timestampISO){
  if(!timestampISO) return null;
  const diffMs = Date.now() - new Date(timestampISO).getTime();
  const minutos = Math.max(0, Math.round(diffMs / 60000));
  if(minutos < 1) return 'agora mesmo';
  if(minutos < 60) return `${minutos} minuto${minutos===1?'':'s'}`;
  const horas = Math.round(minutos / 60);
  if(horas < 24) return `${horas} hora${horas===1?'':'s'}`;
  const dias = Math.round(horas / 24);
  return `${dias} dia${dias===1?'':'s'}`;
}

// Classifica o frescor de um timestamp em 4 faixas — retorna só os DADOS (emoji/tempo/faixa/cor),
// nunca a frase pronta: a frase é texto de negócio, vem de VARS.LEGENDAS via formatarLegenda()
// (pedido explícito do usuário — nada de sentença hardcoded aqui). `limites` = {minutosVerde,
// minutosAmarelo,minutosLaranja}, tipicamente vindo de `indicadores` (mesmo padrão de
// ROC_STATUS_LIMITES/SOLAR_STATUS_LIMITES — editável sem redeploy). Sem limites, usa 15min/2h/24h.
// `agoraParaFaixa` (opcional): instante usado só pra CLASSIFICAR a faixa (verde/amarelo/laranja/
// vermelho) — default Date.now() real, comportamento idêntico ao de sempre pra quem não passar esse
// argumento. `tempo` (o texto "há Xh") sempre usa o relógio real, nunca mente sobre quanto tempo
// passou de verdade — só a faixa de alarme pode ser ajustada (ver aplicarOnda5QualidadeGeracao(),
// que usa isso pra não disparar falso alarme durante a janela noturna sem leitura do robô solar).
function formatarFrescor(timestampISO, limites, agoraParaFaixa){
  if(!timestampISO) return { faixa:'semDado', emoji:'—', tempo:null, cor:'var(--text-dim)' };
  const minutos = Math.round(((agoraParaFaixa instanceof Date ? agoraParaFaixa.getTime() : Date.now()) - new Date(timestampISO).getTime()) / 60000);
  const tempo = formatarTempoRelativo(timestampISO);
  let { minutosVerde=15, minutosAmarelo=120, minutosLaranja=1440 } = limites || {};
  // Blindagem 08/08/2026: se algum limite vier NaN/inválido (indicadores fora do ar, resposta
  // malformada etc), nunca deixar a comparação com NaN empurrar tudo pra "vermelho" por padrão
  // (NaN <= qualquer coisa é sempre false) — cai pro default são/salvo em vez de alarme falso.
  if(!Number.isFinite(minutosVerde)) minutosVerde = 15;
  if(!Number.isFinite(minutosAmarelo)) minutosAmarelo = 120;
  if(!Number.isFinite(minutosLaranja)) minutosLaranja = 1440;
  if(minutos <= minutosVerde) return { faixa:'verde', emoji:'✅', tempo, cor:'var(--green)' };
  if(minutos <= minutosAmarelo) return { faixa:'amarelo', emoji:'🟡', tempo, cor:'var(--amber)' };
  if(minutos <= minutosLaranja) return { faixa:'laranja', emoji:'⚠️', tempo, cor:'#e2884f' };
  return { faixa:'vermelho', emoji:'🔴', tempo, cor:'var(--red)' };
}

// Junta formatarFrescor()+formatarLegenda(): escolhe a legenda certa pela faixa (ex: idBase
// "legFrescorSolar" -> procura "legFrescorSolarVerde"/"...Amarelo"/"...Laranja"/"...Vermelho"/
// "...SemDado" em VARS.LEGENDAS) e substitui {emoji}/{tempo}/{minutos}. Se a legenda daquela faixa
// não existir no Supabase ainda, cai num texto genérico (nunca quebra a tela por falta de linha
// na tabela `legendas`).
function montarBadgeFrescor(idBase, timestampISO, limites, agoraParaFaixa){
  const f = formatarFrescor(timestampISO, limites, agoraParaFaixa);
  const sufixo = f.faixa.charAt(0).toUpperCase() + f.faixa.slice(1);
  const idLegenda = idBase + sufixo;
  const valores = { emoji: f.emoji, tempo: f.tempo, minutos: f.tempo };
  const texto = formatarLegenda(idLegenda, valores)
    || (f.faixa === 'semDado' ? 'Sem dado ainda' : `${f.emoji} Última atualização há ${f.tempo}`);
  return { texto, cor: f.cor };
}

// Templating simples pra VARS.LEGENDAS: substitui {chave} por valor. Sem `valores`, ou se nenhum
// placeholder existir no texto, comportamento é idêntico a VARS.LEGENDAS[id] direto — 100%
// compatível com os registros existentes (nenhum usa chaves {} hoje).
function formatarLegenda(id, valores){
  let texto = VARS.LEGENDAS ? VARS.LEGENDAS[id] : null;
  if(texto == null) return null;
  if(valores){
    for(const [chave, valor] of Object.entries(valores)){
      texto = texto.replaceAll(`{${chave}}`, valor);
    }
  }
  return texto;
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
VARS.livroLRPV = Math.round(VARS.LRPGV_TRANSACOES.reduce((s,t)=>s+(t.tipo==='Entrada'?t.valor:-t.valor),0)*100)/100; // V172: derivado do array, nunca mais numero fixo dessincronizado
VARS.caixaSaudeFamilia = calcularSaldoCaixa(VARS.SAUDE_FAMILIA_SALDO_INICIAL_CICLO, VARS.SAUDE_FAMILIA_TRANSACOES); // V192: 1a caixa migrada para saldo derivado - nunca mais numero fixo dessincronizado do array de transacoes
VARS.PGV_RENDIMENTO_CDI_NAO_RASTREADO = 0.04; // V192: diferenca documentada entre soma das transacoes (R$78,04) e saldo real confirmado pelo usuario 26/07 (R$78,00) - rendimento CDI do cofrinho, nao um erro (Politica secao 6). Nao ajustado silenciosamente (P1) - somado explicitamente abaixo.
VARS.pixGeralVanessaSaldo = calcularSaldoCaixa(VARS.PGV_SALDO_INICIAL_CICLO, VARS.LRPGV_TRANSACOES) - VARS.PGV_RENDIMENTO_CDI_NAO_RASTREADO; // V192: derivado do array LRPGV_TRANSACOES, nunca mais numero fixo dessincronizado
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
// DESLIGADO 12/08/2026 (Onda 11, pedido explícito do usuário: "V1 já cobre isso sozinho, mate V1,
// não pode haver nada lá"). Motivo real: o palpite por calendário duplicava o que o agente já lança
// em V2 a partir de dado real confirmado (Pluggy/Mercado Pago), gerando 2 registros pro mesmo boleto
// (um "acho que já venceu" em V1, outro "confirmei que pagou" em V2) - já causou duplicata real numa
// sessão (ver MANUAL_OPERACIONAL_AGENTES.md seção 2 regra 6). O saldo exibido (cxBoletosSaldo etc)
// já é 100% V2 desde a Onda 1, e o array VARS.BOLETOS_TRANSACOES agora vem só do extrato real da V2
// (ver aplicarOnda11BoletosExtratoV2(), hydrate-onda11-boletos-extrato-v2.js) - nunca mais por palpite.
// Rollback: descomentar a linha abaixo (volta ao comportamento antigo, mas reintroduz o risco de duplicata).
// aplicarBoletosVencidosAutomaticamente();
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
// ATUALIZADO 12/08/2026 (Cobertura Garantida voltou a ser automatica = Sobra Total da cascata -
// Manejo, ver recalcular-necessidade.js): "Held" representa o PATAMAR FINAL de uma projecao de 12
// ciclos a frente, onde Cobertura Garantida e SEMPRE 0 por regra propria da projecao ("cobertura
// garantida so existe confirmada pro ciclo atual, nunca projetada pra frente" - recalcular-necessidade.js,
// loop de evolucao). Usar aqui o valor automatico do ciclo ATUAL seria aplicar a sobra de hoje a um
// ciclo futuro que a propria formula de projecao trata como sem cobertura - mantido 0 literal, nao
// mais VARS.coberturaGarantidaConfirmada (campo agora vestigial, ver vars-operacional.js).
VARS.necessidadeLiquidaHeld = Math.round((VARS.totalOperacionalHeld + VARS.orcamentoOperacional - 0) * 100) / 100;
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
const LRPGV_TRANSACOES_CICLO_ATUAL = VARS.LRPGV_TRANSACOES;
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
    VARS.LRPGV_TRANSACOES = snap.LRPGV_TRANSACOES;
  } else {
    VARS.cartaoInfiniteTotal = CARTAO_INFINITE_CICLO_ATUAL;
    VARS.cartaoMBTotal = CARTAO_MB_CICLO_ATUAL;
    VARS.mercadoPagoFatura = MERCADO_PAGO_CICLO_ATUAL;
    VARS.LRW_TRANSACOES = LRW_TRANSACOES_CICLO_ATUAL;
    VARS.LRV_TRANSACOES = LRV_TRANSACOES_CICLO_ATUAL;
    VARS.LRC_LIMBO_TRANSACOES = LRC_LIMBO_TRANSACOES_CICLO_ATUAL;
    VARS.LRPGV_TRANSACOES = LRPGV_TRANSACOES_CICLO_ATUAL;
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
  // ATUALIZADO 12/08/2026: saudeEmagrecimentoAporte (caneta Ozivy Semaglutida) somado aos
  // contínuos - mesmo tratamento de seguroEmplacamentoAporte, sem data de término conhecida.
  let v = VARS.seguroEmplacamentoAporte + VARS.BENS_DURAVEIS_APORTE_MENSAL_ALVO + VARS.saudeEmagrecimentoAporte; // continuos, sem data de termino conhecida
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
// ATUALIZADO 08/08/2026 (Wave B1): VARS.CARTAO_PLUGGY_MAPA (override manual via wallace_dados, V1)
// continua tendo prioridade se alguém setar explicitamente; senão usa construirCartaoPluggyMapa()
// (tabela `cartoes`, V2 — já buscada em paralelo no bootstrap do HTML, disponível em
// window.WALLACE_CARTOES_V2 antes deste ponto), com fallback pro literal local se a V2 não respondeu.
const CARTAO_PLUGGY_MAPA = VARS.CARTAO_PLUGGY_MAPA || construirCartaoPluggyMapa();

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

// FASE 5 (08/08/2026) — "gravado e refletido no sistema", não "gravado mas invisível": até aqui,
// lancar_transacao_manual() gravava direto em `transacoes`, mas nada no painel se atualizava sozinho
// (mensagem antiga do form avisava isso explicitamente) — o mesmo padrão que já causou perda real de
// visibilidade (TX000652/PIX R$652, aprovado na Inbox e nunca lançado de fato no livro visível).
//
// ACHADO que tornou isso simples (verificado direto no Supabase antes de implementar, não suposto):
// `vw_saldo_v2_por_caixa` já é uma VIEW live — `saldo_inicial_ciclo + soma(transacoes do ciclo atual,
// data >= 25/07/2026)`. Ou seja, inserir uma transação nova na caixa certa JÁ muda o saldo calculado
// pela view, sem precisar de nenhum SQL novo. O único motivo de o painel não refletir isso é que os
// módulos Onda* (que buscam essa view) só rodam UMA VEZ, no boot — e o cache do WallaceFinanceService
// (Map sem TTL) segura a resposta antiga mesmo que a view já tenha mudado.
//
// Esta função reproduz exatamente a mesma sequência de overlays V2 já usada no boot (hydrate(), mais
// abaixo) — nenhuma lógica nova de cálculo, só re-executa o que já existe depois de invalidar o cache.
// Cobre: Caixas (Onda 1/2/3), Patrimônio, Wärtsilä/Reembolsos, LREI, Livro Razão (10/18 caixas
// reconciliadas), P2P, Parcelamentos — todos alimentados por `transacoes`/`caixas`/`patrimonio`, os
// mesmos que uma compra/pagamento manual pode afetar. Deliberadamente FORA (sem relação com um
// lançamento manual de caixa): Investimentos/ROC (tabela `investimentos`, não `transacoes`), Qualidade
// da Geração Solar (robô SAJ), Mercado Pago/Pluggy (sincronização externa) — rodar de novo não traria
// nenhum dado novo, só gastaria requisição à toa.
//
// LIMITAÇÃO CONHECIDA, registrada explicitamente (não escondida): Necessidade Total/Modo
// Operacional/Saldo do Ciclo (topo do Resumo Executivo, VARS.CICLO_SNAPSHOTS) NÃO são recalculados
// aqui — esses campos vêm de um snapshot do ciclo mantido à parte (não são soma ao vivo de
// `transacoes`), e recalculá-los ao vivo é modelagem nova significativa (o mesmo bloqueador técnico
// já registrado na investigação de Ciclo Snapshots Etapa 2), fora do escopo desta rodada.
async function atualizarPainelAposLancamento(){
  WallaceFinanceService.invalidarCache();
  // Promise.allSettled (não Promise.all): cada onda* já trata a própria falha internamente
  // (marcarIndisponivelV2/console.warn, nunca lança) — allSettled só garante que esperamos TODAS
  // terminarem antes de considerar o painel atualizado, mesmo que uma demore mais que outra.
  await Promise.allSettled([
    aplicarOnda1V2(),
    aplicarOnda2V2(),
    aplicarOnda3CaixaLance(),
    aplicarOnda3Suavizacao(),
    aplicarOnda3LrwLrv(),
    aplicarOnda10LrcLimbo(),
    typeof aplicarOnda12CaixasPequenasV2 === 'function' ? aplicarOnda12CaixasPequenasV2() : null,
    aplicarOnda4Patrimonio(),
    aplicarOnda4Wartsila(),
    aplicarOnda5P2P(),
    // Estes 3 dependem da tabela V1 (renderLivrosVariaveis/renderParcelamentos) já estar no DOM antes
    // de sobrescrever — já estão, desde o boot; seguro re-chamar, mesmo padrão dos demais.
    typeof aplicarOnda3LivroRazao === 'function' ? aplicarOnda3LivroRazao() : null,
    typeof aplicarOnda4Lrei === 'function' ? aplicarOnda4Lrei() : null,
    typeof aplicarOnda5Parcelamentos === 'function' ? aplicarOnda5Parcelamentos() : null,
  ]);
  if(typeof atualizarContadoresAbasLR === 'function') atualizarContadoresAbasLR();
  if(typeof auditoriaAutomatica === 'function') auditoriaAutomatica();
}

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
  preencherCaixasOperacionaisExtra(); // NOVO 13/08/2026: completa a seção 05 com as caixas que não têm card estático (ver hydrate-caixas.js)
  aplicarMetasV2CaixasEstaticas(); // NOVO 13/08/2026: metas dos 12 cards estáticos passam a vir de caixas.teto_mensal (V2), não mais fixas no JS

  medirOnda('aplicarOnda3Suavizacao', aplicarOnda3Suavizacao)(); // NOVO 08/08/2026 (Onda 3, Prioridade 4 — Metas): sobrescreve o card Fundo de Suavização Salarial com V2 (vw_saldo_v2_por_caixa) — roda depois de hydrateCaixas() (V1) de propósito, só sobrescreve em caso de sucesso e zero divergência.

  hydrateVisaMB(); // MODULARIZAÇÃO 07/08/2026: breakdown Visa Infinite + Mastercard Black extraído pra src/modules/hydrate-visa-mb.js — mesma sequência, nenhum id/fórmula alterado.

  medirOnda('aplicarOnda3LrwLrv', aplicarOnda3LrwLrv)(); // NOVO 08/08/2026 (Onda 3, Prioridade 2): sobrescreve mbLRW/mbLRV com V2 (vw_compromisso_cartao_por_pessoa) — roda depois de hydrateVisaMB() (V1) de propósito, só sobrescreve em caso de sucesso.

  medirOnda('aplicarOnda10LrcLimbo', aplicarOnda10LrcLimbo)(); // NOVO 12/08/2026 (Onda 10): sobrescreve LRC_LIMBO (cartão corporativo reembolsável) com V2 — mesmo padrão do bloco acima, roda depois de renderLivrosVariaveis() (V1) já ter desenhado a tabela, só sobrescreve em caso de sucesso.

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
  medirOnda('aplicarOnda1V2', aplicarOnda1V2)();

  // ONDA 2 — MIGRAÇÃO V2 → PAINEL (08/08/2026): mesmo padrão da Onda 1, agora pras 11 caixas
  // restantes (overlay CONDICIONAL — só troca pra V2 se não houver divergência; ver
  // hydrate-onda2-v2.js) + diagnóstico Fase 1 do Livro Razão (só compara e loga, não muda
  // nenhuma renderização de tabela). Rollback: comentar as 2 linhas abaixo.
  medirOnda('aplicarOnda2V2', aplicarOnda2V2)();
  diagnosticoLivroRazaoFase1();

  // ONDA 3 — pendência transversal "Caixa Lance nunca classificada" (08/08/2026): mesmo padrão
  // da Onda 2, reaproveitando vw_saldo_v2_por_caixa. Divergência de R$4,37 (0,10%) tem causa
  // indeterminada/baixa confiança (não "documentada" no sentido da regra) — continua exibindo V1,
  // só passa a logar a divergência em vez de nunca ter sido comparada. Ver hydrate-onda3-caixalance.js.
  medirOnda('aplicarOnda3CaixaLance', aplicarOnda3CaixaLance)();

  // ONDA 4 — "SUPABASE COMO FONTE ÚNICA DE VERDADE" (08/08/2026): diferente das Ondas 1-3, aqui a
  // V2 já É a fonte primária assim que os dados existem (sem gate de divergência) — os valores
  // foram migrados diretamente dos mesmos literais do V1, zero divergência por construção.
  // Fallback pra V1 só em erro técnico. Domínio 1: Patrimônio (patrimonio + financiamentos, view
  // vw_patrimonio_v2). Exceção deliberada: caixaLance continua V1 (ver hydrate-onda4-patrimonio.js).
  medirOnda('aplicarOnda4Patrimonio', aplicarOnda4Patrimonio)();

  // ONDA 4, domínio 2 (Investimentos/ROC): reaproveita aplicarStatusVencidoEValorMercadoOpcoes()/
  // calcularROCOpcoes()/hydrateROC() (V1, inalteradas) sobre dado vindo de `investimentos` (V2) —
  // ver hydrate-onda4-investimentos.js.
  medirOnda('aplicarOnda4Investimentos', aplicarOnda4Investimentos)();

  // ONDA 4, domínio 4 (último dos 4 autorizados) — Cascata Wärtsilä: reaproveita
  // recalcularReembolsos()/hydrateReembolsos() (V1, inalteradas) sobre dado vindo de
  // reembolso_wartsila_ciclo + vw_saldo_v2_por_caixa. Ver hydrate-onda4-wartsila.js.
  medirOnda('aplicarOnda4Wartsila', aplicarOnda4Wartsila)();

  // ONDA 5, domínio 2 — P2P: reaproveita recalcularP2P()/hydrateResumoP2P() (V1, inalteradas)
  // sobre dado vindo de `indicadores` (mesmo padrão do CDI). Ver hydrate-onda5-p2p.js.
  medirOnda('aplicarOnda5P2P', aplicarOnda5P2P)();

  // "Qualidade da geração" (08/08/2026) — card novo, SEPARADO do domínio de crédito/rateio solar
  // (que continua pendente de validação, não tocado). Só responde "a usina está indo bem ou mal
  // hoje", sem jargão técnico. Ver hydrate-onda5-qualidade-geracao.js.
  medirOnda('aplicarOnda5QualidadeGeracao', aplicarOnda5QualidadeGeracao)();
  // NOVO 11/08/2026 (pedido do usuário: ícone de clima atual junto do card de desempenho da usina,
  // "geração baixa mas está chovendo, aí eu já sei o porque"). Ver hydrate-clima-solar.js.
  if(typeof aplicarClimaSolar === 'function') aplicarClimaSolar();
}
// NOVO 12/08/2026: marca o boot como concluído pro aviso de timeout em Sistema_Wallace_Lira_Completo.html
// (window.__wallaceBootTimeoutId) — hydrate() é síncrona e já deixa o painel com números reais (V1),
// as Ondas assíncronas que rodam dentro dela são só sobreposição opcional, não bloqueiam este sinal.
onDomPronto(function(){
  hydrate();
  window.WALLACE_BOOT_OK = true;
  if(window.__wallaceBootTimeoutId) clearTimeout(window.__wallaceBootTimeoutId);
  const aviso = document.getElementById('bootFalhouAviso');
  if(aviso) aviso.style.display = 'none';
}); // V170: corrigido - antes nunca rodava (script injetado dinamicamente, DOMContentLoaded ja tinha disparado)
// NOVO 09/08/2026 (pedido do usuario: "compartilhar link de uma aba especifica, ex. solar") -
// le ?aba=... da propria URL deste arquivo (index.html repassa o parametro pro src do iframe,
// ver loadDashboard() em index.html) e troca de master-pane logo apos o boot sincrono, antes do
// usuario ver "home" pra depois trocar. Lista de ids valida = os 5 master-pane que existem hoje;
// qualquer outro valor (link errado/antigo) e ignorado silenciosamente, home continua padrao.
// CORRIGIDO 09/08/2026 (achado ao testar): showMaster() só existe depois de
// ui-navegacao-basica.js carregar, que vem DEPOIS de app.js no HTML — onDomPronto (roda no
// DOMContentLoaded/imediato) disparava cedo demais, com showMaster ainda undefined, e o clique
// silencioso não fazia nada. window.addEventListener('load', ...) só dispara depois de TODOS os
// scripts terem terminado de carregar, garantindo showMaster já existir.
window.addEventListener('load', function(){
  const abaAlvo = new URLSearchParams(location.search).get('aba');
  const ABAS_VALIDAS = ['home','painel','graficos','solar','cenarios','balancov2'];
  if(abaAlvo && ABAS_VALIDAS.includes(abaAlvo) && typeof showMaster === 'function'){
    showMaster(abaAlvo);
  }
});
// MODULARIZAÇÃO 07/08/2026: initBuscaGlobal/renderCapaNav/toggleBtnVoltarCapa/renderPageStrip e o
// listener de scroll foram extraídos junto com suas funções pra src/modules/dashboard-navegacao.js —
// ver comentário perto de onde CAPA_DESTINOS estava (topo do arquivo). Continuam rodando via
// onDomPronto (mesma lógica "chama na hora se o DOM já tiver pronto"), só que registrados na cadeia
// onload depois do app.js, não mais aqui.
onDomPronto(popularSeletorCiclo); // V145/V170: cria os botoes do seletor de ciclo
onDomPronto(renderParcelamentos); // V155/V170: gera as tabelas de parcelamento (LRP/LRMP) a partir dos arrays estruturados
// ONDA 5, domínio 1 (08/08/2026) — Parcelamentos: registrado DEPOIS de renderParcelamentos() de
// propósito, mesmo motivo das Ondas anteriores. Reaproveita a própria função pra redesenhar, agora
// com VARS.PARCELAMENTOS_VISA/MP vindo da V2. Ver hydrate-onda5-parcelamentos.js.
onDomPronto(medirOnda('aplicarOnda5Parcelamentos', aplicarOnda5Parcelamentos));
onDomPronto(renderLivrosVariaveis); // V168/V170: gera as tabelas LRW/LRV/LRC-limbo/LRCV a partir dos arrays estruturados
// ONDA 3 (08/08/2026): registrado DEPOIS de renderLivrosVariaveis() de propósito — precisa que a
// tabela já tenha sido preenchida com V1 antes de tentar sobrescrever com V2 (senão a ordem
// inverteria e V1 apagaria o V2 escrito antes). Fallback automático: só sobrescreve em caso de
// sucesso do fetch. Rollback: comentar esta linha.
onDomPronto(medirOnda('aplicarOnda3LivroRazao', aplicarOnda3LivroRazao));
// ONDA 4, domínio 3 — LREI (08/08/2026): mesmo motivo de ordem do comentário acima — precisa que
// renderLivrosVariaveis() (V1) já tenha rodado. Reaproveita a própria função pra redesenhar, agora
// com VARS.LREI_ATIVAS vindo da V2. Ver hydrate-onda4-lrei.js.
onDomPronto(medirOnda('aplicarOnda4Lrei', aplicarOnda4Lrei));
// NOVO 09/08/2026 (politica nova, pedido do usuario): caixa operacional negativa sem LREI ATIVO
// cobrindo o rombo soma a diferenca na Necessidade Total Bruta. Busca saldo (vw_saldo_v2_por_caixa)
// e LREI (vw_emprestimos_internos_v2) por conta propria, via Promise.all - nao depende de nenhuma
// onda ja ter rodado (mesma prevencao de bug de ordem que ja mordeu 2x nesta sessao). Ver
// hydrate-deficit-caixas-sem-lrei.js.
onDomPronto(aplicarDeficitCaixasSemLrei);
// NOVO 09/08/2026 (achado do usuário, correção real): "Comprometido" da Caixa Variável estava
// contando compras de caixas próprias (Bens Duráveis, Churrasco etc) - double-count com a política
// de deficit acima. Busca o valor correto ao vivo da V2. Independente da onda acima (não lê nem
// escreve os mesmos campos de REG.operacional) - pode rodar em qualquer ordem relativa a ela. Ver
// hydrate-comprometido-caixa-variavel-v2.js.
onDomPronto(aplicarComprometidoCaixaVariavelV2);
// NOVO 14/08/2026 (decisão do usuário — ver hydrate-comprometido-caixas-tematicas-v2.js): mesmo
// conceito acima, generalizado pras 6 caixas temáticas que também compram no cartão de crédito.
onDomPronto(aplicarComprometidoCaixasTematicasV2);
onDomPronto(renderInboxFinanceira); // V400 Etapa 1: gera a tabela da Inbox Financeira (continua, nao filtrada por ciclo)
// MIGRADO 08/08/2026 (Onda 7): reconciliarPluggy()/reconciliarTransacoesPluggy() (V1, liam
// VARS.PLUGGY_CONTAS de wallace_dados) substituídos por aplicarOnda7Pluggy(), que busca as tabelas
// pluggy_conexoes/pluggy_contas/pluggy_transacoes (V2) e reaproveita as mesmas funções de
// reconciliação inalteradas, só com dado novo. Ver hydrate-onda7-pluggy.js. classificarInboxPendentes()
// já é re-chamada de dentro de aplicarOnda7Pluggy() (mesmo cuidado da parte 115 abaixo).
onDomPronto(medirOnda('aplicarOnda7Pluggy', aplicarOnda7Pluggy));
// NOVO 08/08/2026 (Onda 8): CRONOGRAMA_BOLETOS_FIXOS (literal em vars-caixas.js) migrado pra tabela
// cronograma_boletos_fixos — editável sem deploy de código a partir de agora. Ver hydrate-onda8-cronograma-boletos.js.
onDomPronto(medirOnda('aplicarOnda8CronogramaBoletos', aplicarOnda8CronogramaBoletos));
// NOVO 12/08/2026 (Onda 11): extrato real da Caixa Boletos, ver hydrate-onda11-boletos-extrato-v2.js.
onDomPronto(medirOnda('aplicarOnda11BoletosExtratoV2', aplicarOnda11BoletosExtratoV2));
// NOVO 12/08/2026 (Onda 12): lista de lançamentos das 5 últimas caixas pequenas cujo CARD já era V2
// mas a tabela detalhada por baixo ainda vinha do literal fixo (Caixa Lance, Bens Duráveis,
// Churrasco, PIX Vanessa, Mastercard/Infinite) — ver hydrate-onda12-caixas-pequenas-v2.js.
onDomPronto(medirOnda('aplicarOnda12CaixasPequenasV2', aplicarOnda12CaixasPequenasV2));
// NOVA 12/08/2026: aba "Emagrecimento" (peso + custo da caneta), ver hydrate-emagrecimento.js.
onDomPronto(aplicarEmagrecimento);
onDomPronto(medirOnda('aplicarOnda9LivrosFixos', aplicarOnda9LivrosFixos));
// NOVO 11/08/2026 (hardening de produção): painel de saúde das automações agendadas.
// Ver hydrate-saude-operacional.js.
onDomPronto(aplicarSaudeOperacional);
// MIGRADO 08/08/2026 (Onda 6): sincronizarMercadoPagoParaInbox() (V1, lia VARS.MERCADOPAGO_EVENTOS de
// wallace_dados) substituída por aplicarOnda6MercadoPago(), que busca a tabela mercadopago_eventos (V2)
// e reaproveita a mesma função de sincronização inalterada, só com dado novo. Ver hydrate-onda6-mercadopago.js.
onDomPronto(medirOnda('aplicarOnda6MercadoPago', aplicarOnda6MercadoPago)); // V450 Etapas 4+5+6, agora V2: FinancialEvent -> Inbox (com classificacao e checagem de duplicidade)
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
        badgeCat.textContent = `🏷️ ${comCategoria}/${total} categorizadas`;
        badgeCat.title = `Arquitetura V2 (Supabase): ${comCategoria} de ${total} transações já têm categoria via regras_classificacao (Fase 3). ${semCategoria} ainda sem categoria (nomes de pessoa sem padrão seguro, na maioria).`;
      }
    }

    // NOVO parte 107: painel flutuante autocontido mostrando as 18 caixas direto da V2 (Fase 5,
    // primeiro consumo VISÍVEL de verdade da RPC além dos badges). Injetado via JS puro, não
    // depende de nenhum elemento existente no HTML - zero risco de quebrar layout. Fecha por
    // padrão (só o botão fica visível); clique abre/fecha. Só leitura, mesma disciplina das outras
    // peças desta sessão.
    // CORRIGIDO 10/08/2026 (pedido do usuário: "esse botão de lançar não combina com nada, até no PC
    // parece deslocado, atrapalha mais do que ajuda" — decisão explícita: remover o atalho global
    // flutuante, deixar só nos lugares que já fazem sentido). Antes disto vivia um dock fixo
    // (position:fixed, canto inferior direito, "aba" deslizante no mobile) com o botão "＋ Lançar" —
    // removido por completo (dock, animação hover circular, comportamento de aba no mobile). O botão
    // e o formulário agora são um bloco inline normal, injetado dentro de #lancarTxSlot (Inbox
    // Financeira, Sistema_Wallace_Lira_Completo.html seção 22) — mesma lógica/RPC de sempre, só
    // deixou de flutuar por cima do resto do site o tempo todo.
    if(!document.getElementById('wallaceFabStyles')){
      const wallaceFabCss = document.createElement('style');
      wallaceFabCss.id = 'wallaceFabStyles';
      wallaceFabCss.textContent = `
        .wallace-lancar-btn{display:inline-flex;align-items:center;gap:0.4rem;padding:0.55rem 1rem;border-radius:8px;border:none;cursor:pointer;background:linear-gradient(155deg,#3fd68a,#27a866);color:#fff;font-weight:700;font-size:0.78rem;box-shadow:0 2px 8px rgba(39,168,102,0.3);transition:filter .15s ease,transform .15s ease}
        .wallace-lancar-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .wallace-lancar-btn:active{transform:translateY(0) scale(0.98)}
        .wallace-panel{position:relative;margin-top:0.6rem;width:100%;max-width:320px;max-height:70vh;overflow-y:auto;background:#0f1620;border:1px solid #2d3b52;border-radius:10px;padding:0.8rem;font-size:0.78rem;color:#c8d4e3;box-shadow:0 2px 12px rgba(0,0,0,.25);display:none}
        .wallace-field{width:100%;margin-bottom:0.4rem;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;box-sizing:border-box;font-size:16px}
        .wallace-btn-primary{width:100%;background:#1f5c38;color:#5fd68a;border:none;border-radius:5px;padding:0.4rem;cursor:pointer;font-weight:600}
        .wallace-btn-secondary{background:#1a2332;color:#8ab4f8;border:1px dashed #2d3b52;border-radius:5px;padding:0.3rem;cursor:pointer;font-size:0.72rem}
      `;
      document.head.appendChild(wallaceFabCss);
    }
    // Clique fora do form fecha ele sozinho (mesmo comportamento de antes, sem depender mais de dock).
    if(!window.__wallaceFabOutsideClick__){
      window.__wallaceFabOutsideClick__ = true;
      document.addEventListener('click', (ev) => {
        const formLancar = document.getElementById('formLancarTx');
        const btnLancarEl = document.getElementById('btnLancarTx');
        if(!formLancar || formLancar.style.display !== 'block') return;
        if(formLancar.contains(ev.target) || (btnLancarEl && btnLancarEl.contains(ev.target))) return;
        formLancar.style.display = 'none';
      });
    }

    // APOSENTADO 09/08/2026 (pedido do usuário, inventário completo em PASSAGEM_DE_TURNO.md): o
    // botão flutuante "💰 V2" e o painel que ele abria (18 caixas cruas, patrimônio, investimentos,
    // metas, reembolsos, PIB Wallace, avisos estruturais, divergências V1↔V2) foram removidos —
    // tudo que tinha valor real já existe no painel principal (e melhor: o bloco Reembolsos daqui
    // mostrava R$7.022,76, valor órfão de uma linha morta na tabela `reembolsos` nunca usada por
    // nenhum cálculo, enquanto a seção 19 do painel principal já mostra o valor certo, R$0,00).
    // Fonte era rpc_dashboard_resumo(), calibrada uma única vez em 05/08/2026 e nunca mais
    // atualizada. Rollback: reverter este commit — o bloco removido criava o botão `painelV2Toggle`
    // e o painel `painelV2Caixas`, com innerHTML construído a partir de resumoV2 (patrimonio_resumo/
    // investimentos/metas/reembolsos_resumo/indicadores_recentes/avisos). `resumoV2` continua sendo
    // buscado normalmente aqui em cima — outros consumidores (catV2Badge, formulário "＋ Lançar",
    // comparações V1↔V2 abaixo) não dependiam deste bloco e continuam intactos.

    // NOVO 05/08/2026 (parte 111, Fase 4 da Arquitetura V2 - "trocar a via de entrada, tela de
    // lançamento manual"): primeira versão real, minimalista - form flutuante que grava direto na
    // tabela `transacoes` via RPC `lancar_transacao_manual()` (escopo restrito: só INSERT, valida
    // tipo/valor/caixa_id antes de gravar). Lista caixas/categorias da propria resumoV2 (ja veio na
    // mesma chamada, zero fetch extra pra popular os selects).
    if(resumoV2.caixas && !document.getElementById('btnLancarTx')){
      const btnLancar = document.createElement('button');
      btnLancar.type = 'button';
      btnLancar.id = 'btnLancarTx';
      btnLancar.className = 'wallace-lancar-btn';
      btnLancar.title = 'Lançar uma transação direto na Arquitetura V2 (Supabase relacional)';
      btnLancar.textContent = '＋ Lançar transação';

      const form = document.createElement('div');
      form.id = 'formLancarTx';
      form.className = 'wallace-panel';
      form.style.width = '260px';
      const caixaOpts = resumoV2.caixas.slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
      form.innerHTML = `
        <div style="font-weight:700;margin-bottom:0.5rem;color:#5fd68a">Lançar transação (V2)</div>
        <input id="ltxData" type="date" class="wallace-field">
        <input id="ltxDescricao" placeholder="Descrição" class="wallace-field">
        <input id="ltxValor" type="number" step="0.01" placeholder="Valor" class="wallace-field">
        <select id="ltxTipo" class="wallace-field"><option value="saida">Saída</option><option value="entrada">Entrada</option></select>
        <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.72rem;color:#c8d4e3;margin-bottom:0.3rem;cursor:pointer"><input id="ltxDividir" type="checkbox" style="margin:0"> Dividir entre mais de 1 caixa</label>
        <select id="ltxCaixa" class="wallace-field">${caixaOpts}</select>
        <div id="ltxSplitRows" style="display:none;margin-bottom:0.4rem"></div>
        <button id="ltxSplitAdd" type="button" class="wallace-btn-secondary" style="display:none;width:100%;margin-bottom:0.4rem">+ Adicionar caixa</button>
        <div id="ltxSplitRestante" style="display:none;font-size:0.68rem;margin-bottom:0.4rem"></div>
        <select id="ltxUsuario" class="wallace-field"><option value="">Usuário (opcional)</option><option value="f70b0f48-9d73-44fd-a05b-6f3248bbea21">Wallace</option><option value="77496938-c875-4578-b6d1-06ffbde3f247">Vanessa</option><option value="89f205ad-2381-4149-b10f-7170aa13f5d5">Júlio</option><option value="3bb93c24-8353-4a4b-91cb-ef055809cc04">Gabriela</option></select>
        <div style="font-size:0.68rem;color:#8ab4f8;margin-bottom:0.15rem">Categoria</div>
        <select id="ltxCategoria" class="wallace-field" style="margin-bottom:0.3rem"><option value="">Categoria (opcional)</option><option value="533eef0f-0591-4c23-a248-566b95da7ffd">Alimentação</option><option value="69866dc9-89f9-42e3-b10c-5898287c6dd2">Assinaturas</option><option value="558fb61e-c215-4970-a498-b6fbcf67dd97">Bens Duráveis</option><option value="89557dd0-e475-483d-8d90-7cf698c3103a">Boletos</option><option value="b6576c3a-e74e-4f06-afcf-8b07c42785b0">Consórcios</option><option value="e5f8498f-ec63-41db-a333-3de5e8a9a7e3">Educação</option><option value="99915d56-41d2-4ca5-8d5f-c6188b33dc06">Eventos e Viagens</option><option value="f143d814-3883-4f24-a636-7ff80b9f6d1b">P2P</option><option value="1cc9db18-aec4-4cf1-962d-4d9a36f44f70">Reembolsável Corporativo</option><option value="5937378d-f087-48a4-8815-c1ab8055fdf8">Saúde</option><option value="2f08db6b-a018-471f-ad9c-26cb453e3b87">Transporte</option><option value="__nova__">+ Nova categoria…</option></select>
        <div id="ltxNovaCategoriaBox" style="display:none;gap:0.3rem;margin-bottom:0.4rem">
          <input id="ltxNovaCategoriaNome" placeholder="Nome da categoria nova" class="wallace-field" style="flex:1;margin-bottom:0;min-width:0">
          <button id="ltxNovaCategoriaCriar" type="button" style="background:#1f5c38;color:#5fd68a;border:none;border-radius:5px;padding:0 0.6rem;cursor:pointer;font-size:0.72rem">Criar</button>
        </div>
        <div id="ltxSugestao" style="font-size:0.68rem;color:#8ab4f8;margin-bottom:0.4rem;min-height:1em"></div>
        <button id="ltxSalvar" class="wallace-btn-primary">Salvar</button>
        <div id="ltxMsg" style="margin-top:0.4rem;font-size:0.72rem"></div>`;
      btnLancar.onclick = () => {
        form.style.display = form.style.display !== 'block' ? 'block' : 'none';
      };
      // CORRIGIDO 10/08/2026: injeta dentro de #lancarTxSlot (card Inbox Financeira) em vez do dock
      // flutuante removido — se o slot ainda não existir por algum motivo (HTML em cache antigo,
      // deploy no meio do caminho), cai pro rodapé do body só pra não perder a funcionalidade.
      const lancarSlot = document.getElementById('lancarTxSlot') || document.body;
      lancarSlot.appendChild(btnLancar);
      lancarSlot.appendChild(form);

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
          const tokenResolver = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';
          const r = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/resolver_caixa', {
            method:'POST',
            headers: { 'Content-Type':'application/json', apikey:'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization:'Bearer '+tokenResolver },
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
        // CORRIGIDO 09/08/2026 (achado numa varredura pós-fix de segurança: este ponto ainda mandava
        // a chave anônima crua pra criar_categoria, que já exige login - quebraria "Criar" mesmo
        // com sessão válida, porque o servidor não recebia o token real).
        const tokenNovaCategoria = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null);
        if(!tokenNovaCategoria){ msg.textContent = 'Sessão expirada — recarregue a página e faça login de novo.'; msg.style.color = '#e2554f'; return; }
        msg.textContent = 'Criando categoria...'; msg.style.color = '#c8d4e3';
        try {
          const r = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/criar_categoria', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'apikey':'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', 'Authorization':'Bearer '+tokenNovaCategoria },
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
          <select class="ltxSplitCaixa" style="flex:2;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;min-width:0;font-size:16px">${caixaOpts}</select>
          <input class="ltxSplitValor" type="number" step="0.01" placeholder="Valor" style="flex:1;background:#1a2332;border:1px solid #2d3b52;color:#c8d4e3;border-radius:5px;padding:0.3rem;min-width:0;box-sizing:border-box;font-size:16px">
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

        // CORRIGIDO 09/08/2026 (achado de seguranca): lancar_transacao_manual agora exige login
        // valido (auditoria encontrou a RPC aberta pra qualquer um com a chave publica, sem
        // checagem nenhuma) - envia o token do login Firebase como Authorization em vez da chave
        // publica. Sem sessao valida, avisa e para ANTES de tentar (a RPC recusaria mesmo assim,
        // mas falhar cedo com mensagem clara e melhor que deixar o fetch estourar sem contexto).
        const tokenAuth = obterTokenAuthSupabase();
        if(!tokenAuth){ msg.textContent = 'Sessão expirada — recarregue a página e faça login de novo antes de lançar.'; msg.style.color = '#e2554f'; return; }
        msg.textContent = 'Salvando...'; msg.style.color = '#c8d4e3';
        try {
          for(const l of lancamentos){
            const r = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/lancar_transacao_manual', {
              method: 'POST',
              headers: { 'Content-Type':'application/json', 'apikey':'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', 'Authorization':'Bearer '+tokenAuth },
              body: JSON.stringify({ p_data:data, p_descricao:descricao, p_valor:l.valor, p_tipo:tipo, p_caixa_id:l.caixaId, p_usuario_id:usuarioId, p_categoria_id:categoriaId })
            });
            if(!r.ok){ const err = await r.text(); msg.textContent = `Erro (parte já lançada antes desta pode ter sido gravada): ${err}`; msg.style.color = '#e2554f'; return; }
          }
          msg.textContent = 'Lançado — atualizando painel...';
          document.getElementById('ltxDescricao').value = ''; document.getElementById('ltxValor').value = '';
          document.getElementById('ltxSplitRows').innerHTML = '';
          document.getElementById('ltxDividir').checked = false;
          document.getElementById('ltxDividir').dispatchEvent(new Event('change'));
          // FASE 5 (08/08/2026): antes disso o lançamento ficava "gravado mas invisível" (mesmo padrão
          // do caso real TX000652/PIX R$652) — agora o mesmo clique que grava já refresca caixas,
          // patrimônio, reembolsos, LREI, livro razão, P2P e parcelamentos com o dado novo. Ver
          // atualizarPainelAposLancamento() (comentário completo lá) pro que NÃO é recalculado ainda
          // (Necessidade Total/Modo Operacional do ciclo — modelagem nova, fora desta rodada).
          try {
            await atualizarPainelAposLancamento();
            msg.textContent = lancamentos.length > 1
              ? `✓ Lançado em ${lancamentos.length} caixas e refletido no painel.`
              : '✓ Lançado e refletido no painel.';
            msg.style.color = '#5fd68a';
          } catch(errRefresh){
            console.error('atualizarPainelAposLancamento: falha ao atualizar o painel após o lançamento — o dado JÁ está salvo no Supabase, só a tela não atualizou sozinha. Recarregue a página.', errRefresh);
            msg.textContent = '✓ Lançado no banco, mas houve erro ao atualizar o painel — recarregue a página pra ver refletido.';
            msg.style.color = '#e8a63a';
          }
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
    // APOSENTADO 09/08/2026: atualizarBadgeV2() atualizava o contador do botão "💰 V2" (removido
    // acima) — sem chamador restante, removida junto.
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
      // ATUALIZADO 09/08/2026: causa raiz antiga (R$78,04) foi corrigida na Fase 4A (08/08); a
      // divergencia atual (~R$256) e o residuo de lancamentos que nascem so na V2 (Chat),
      // aceito pelo usuario como consequencia esperada da transicao. A exibicao real da PGV ja
      // foi promovida pra V2 na Onda 2 (hydrate-onda2-v2.js, aceitarDivergenciaConhecida:true) -
      // este mapa legado continua so como log de diagnostico, nunca sobrescreve o que a Onda 2
      // ja decidiu.
      'PIX Geral Vanessa': 'V2 desatualizado - lancamentos que nascem so na V2 (Chat) ainda nao replicados pro V1, residuo aceito (ver PASSAGEM_DE_TURNO.md)'
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
        'Caixa Boletos':     {idSaldo:'cxBoletosSaldo', idPct:'cxBoletosPct', idBarra:'cxBoletosBar', meta:4550.77}, // AUMENTADA 11/08/2026 (era 2600): consorcios Porto migraram do cartao p/ esta caixa.
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
    // APOSENTADO 09/08/2026 (mesma remoção do botão "💰 V2", ver comentário acima): este bloco
    // anexava as divergências V1↔V2 dentro do painel de debug (`painelV2Caixas`, agora removido).
    // A telemetria não se perdeu — `console.warn`/`console.info` (linhas acima, dentro do forEach)
    // continuam logando cada divergência normalmente, só pararam de duplicar na UI.

    // NOVO 06/08/2026 (parte 120, prova de conceito real "V2 vira fonte exibida na tela", pedido do
    // usuario "avance"): primeiro valor onde a V2 aparece FORA do painel flutuante/console - direto
    // no Balanco, como nota complementar (nao substitui o V1 ainda, so mostra ao lado - baixo risco,
    // e so leitura adicional, nao mexe no calculo V1 existente). Zero fetch extra (resumoV2 ja veio).
    const elPatV2 = document.getElementById('balPatrimonioLiquidoV2');
    if(elPatV2 && resumoV2.patrimonio_resumo && resumoV2.patrimonio_resumo.liquido != null){
      // CORRIGIDO 13/08/2026 (achado de auditoria: texto continha jargao tecnico "V2 (Supabase
      // relacional)" exposto na tela pro usuario final - trocado por texto neutro; o detalhe tecnico
      // continua disponivel no atributo title, definido em promoverCampoV2SeConfiavel).
      // CORRIGIDO 14/08/2026 (achado de auditoria): o selo "✓ confirmado" era escrito de forma
      // incondicional, mesmo quando a trava de seguranca (5 reais de tolerancia, mesma usada por
      // promoverCampoV2SeConfiavel logo abaixo) rejeitava o valor por divergir demais do V1 - ex:
      // bug de rpc_dashboard_resumo() que zerava 12 dos 13 itens de patrimonio (liquido caia pra
      // R$100mil) ainda assim aparecia na tela como "✓ confirmado: R$ 100.000,00". Agora o selo só
      // aparece quando o mesmo criterio de confianca de promoverCampoV2SeConfiavel é satisfeito.
      const elPatV1Ref = document.getElementById('balPatrimonioLiquido');
      const vAtualPatV1 = elPatV1Ref ? parseFloat(elPatV1Ref.textContent.replace(/[^\d,-]/g,'').replace('.','').replace(',','.')) : NaN;
      const patrimonioV2Confiavel = !isNaN(vAtualPatV1) && Math.abs(vAtualPatV1 - resumoV2.patrimonio_resumo.liquido) < 5;
      elPatV2.textContent = patrimonioV2Confiavel
        ? `✓ confirmado: R$ ${Number(resumoV2.patrimonio_resumo.liquido).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
        : `V2: R$ ${Number(resumoV2.patrimonio_resumo.liquido).toLocaleString('pt-BR',{minimumFractionDigits:2})} (não confere com V1 - não promovido)`;
      // PROMOVIDO 06/08/2026 (parte 136, refatorado parte 137 pra usar promoverCampoV2SeConfiavel -
      // funcao com hoisting, definida mais abaixo neste mesmo bloco, ja disponivel aqui). Patrimonio
      // Liquido foi o primeiro campo promovido a fonte EXIBIDA (trava de seguranca <R$5 de diferenca).
      promoverCampoV2SeConfiavel('balPatrimonioLiquido', resumoV2.patrimonio_resumo.liquido, 5);
      // CORRIGIDO 13/08/2026 (achado de auditoria: promocao nao propagava pro id irmao da secao 09,
      // mesmo conceito hidratado por hydrate-balanco.js - podiam divergir apos a promocao acima).
      promoverCampoV2SeConfiavel('bal4qPatrimonio', resumoV2.patrimonio_resumo.liquido, 5);
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
      // CORRIGIDO 13/08/2026 (achado de auditoria: id irmao 'balPassivosTotal2' da secao 04, mesmo
      // REG.balanco.passivos.total, nunca era promovido junto - podiam divergir ate R$5 apos a promocao acima).
      promoverCampoV2SeConfiavel('balPassivosTotal2', resumoV2.patrimonio_resumo.total_passivo, 5);
    }

    // REMOVIDO 12/08/2026 (pedido do usuário, achado real): esta comparação alimentava o selo
    // `syncV2Badge` ("V2: DIVERGE R$18,15"), que ficou travado numa divergência não-reproduzível —
    // confirmado por SQL direto que as duas fontes reais (rpc_dashboard_resumo e o snapshot
    // congelado) já batiam exatas, mas o selo continuava mostrando a mesma diferença antiga mesmo
    // depois de recarregar com deploy novo confirmado. Migração V1→V2 já encerrada formalmente
    // nesta sessão (ver docs/decisions/) — este selo de auditoria é obsoleto e só gerava alarme
    // falso permanente. Elemento #syncV2Badge removido do HTML junto (Sistema_Wallace_Lira_Completo.html).
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
