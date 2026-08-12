// MÓDULO: Inbox Financeira (V400 Etapa 1) — gerarProximoInboxId/inboxAdicionarItem/
// persistirTriagemMercadoPago/persistirTriagemPluggy/persistirTriagemItem/inboxAprovar/
// inboxRejeitar/renderInboxFinanceira. Componente central do brief V400: "toda informacao capturada
// entra primeiro aqui, jamais lancar diretamente no ERP". Extraído de app.js na modularização
// (07/08/2026) — funções globais autocontidas (VARS/$/fmt/WallaceBus), chamadas por referência
// (onclick inline gerado em renderInboxFinanceira, ou de dentro de outras funções de
// reconciliação/classificação — pluggy-reconciliacao.js/classificacao-inbox.js). Só modularização,
// nenhuma fórmula ou comportamento mudou.
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
// idExterno: id estavel do item na fonte de origem - pro Mercado Pago e o id do evento (ja existia);
// pro Pluggy tambem existe (ver gerarIdExternoPluggy), sintetico mas deterministico, usado so pra
// persistir a decisao de Aprovar/Rejeitar em PLUGGY_TRIAGEM.
// descricaoCompleta: texto integral pro title="" (hover); descricao pode ser encurtada na chamada sem
// perder a explicação completa.
// silencioso: quando true, NÃO chama renderInboxFinanceira() a cada item — quem adiciona vários itens
// em lote (reconciliarPluggy/reconciliarTransacoesPluggy/sincronizarMercadoPagoParaInbox) passa true e
// renderiza 1 única vez no final (evita O(n²) com volume real da Pluggy). Comportamento padrão
// (chamada manual/avulsa) continua igual: renderiza na hora.
// NOVO 08/08/2026 (correção de usabilidade: itens com mesma origem/valor/data pareciam duplicados
// quando não havia descrição real nem metadata visível). metadata: objeto livre já existente no dado
// bruto de origem (ex: {payer, payment_method} do Mercado Pago) — antes capturado só implicitamente e
// nunca repassado nem exibido; agora guardado no item e mostrado em renderInboxFinanceira() como linha
// de identificação. Não afeta aprovação/rejeição nem nenhuma lógica existente, só rastreio/exibição.
// ATUALIZADO 11/08/2026 (auditoria de prontidão operacional, achado: "inboxAdicionarItem() não
// verifica duplicata internamente - a responsabilidade de checar idExterno já visto era delegada a
// cada chamador (classificacao-inbox.js, pluggy-reconciliacao.js), frágil pra chamador novo esquecer").
// Centraliza a checagem aqui: se idExterno já existe em VARS.INBOX_FINANCEIRA, não adiciona de novo -
// função vira idempotente, seguro chamar 2x com o mesmo item. Só afeta itens COM idExterno - itens sem
// idExterno nunca tiveram checagem de duplicata (comportamento preservado, não inventado agora).
function inboxAdicionarItem({origem, descricao, descricaoCompleta, valor, data, categoriaSugerida, livroSugerido, confianca, idExterno, metadata, silencioso}){
  if(idExterno){
    const jaExiste = VARS.INBOX_FINANCEIRA.find(it => it.idExterno === idExterno);
    if(jaExiste) return jaExiste.id;
  }
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
    metadata: metadata || null,
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
// Usadas so pra chamar a RPC restrita triar_mercadopago_evento - essa RPC SO deixa trocar o campo
// status_triagem de 1 evento por id, nada mais (ver migration no Supabase).
const SUPABASE_URL_WALLACE = 'https://bakdgacmwlopvrrppwdm.supabase.co';
const SUPABASE_ANON_KEY_WALLACE = 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';

// Persiste a decisao de triagem de um evento do Mercado Pago no Supabase, via RPC restrita (so troca
// status_triagem, nunca outro campo). Fire-and-forget com log de erro - a UI ja mudou otimisticamente
// (inboxAprovar/inboxRejeitar chamam isso, mas nao esperam a resposta pra atualizar a tela), pra nao
// travar o clique numa rede lenta/instavel.
// CORRIGIDO 09/08/2026 (achado de seguranca): triar_mercadopago_evento/triar_pluggy_item eram
// SECURITY DEFINER abertas pra `anon` sem checagem nenhuma - agora exigem o login Firebase do
// site (ou service_role). obterTokenAuthSupabase() (app.js) le o token ja salvo no login. Sem
// sessao valida, a RPC recusa (comportamento correto - mesmo padrao do "+ Lançar").
function persistirTriagemMercadoPago(idExterno, statusTriagem){
  if(!idExterno) return; // item nao veio do Mercado Pago (ex: manual/Pluggy) - nada a persistir aqui
  const tokenAuth = typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null;
  if(!tokenAuth){ console.error('persistirTriagemMercadoPago: sem sessao valida, recarregue a pagina e faca login de novo.'); return; }
  fetch(`${SUPABASE_URL_WALLACE}/rest/v1/rpc/triar_mercadopago_evento`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY_WALLACE,
      'Authorization': `Bearer ${tokenAuth}`
    },
    body: JSON.stringify({ p_id: idExterno, p_status_triagem: statusTriagem })
  }).then(resp=>{
    if(!resp.ok) console.error('persistirTriagemMercadoPago: falhou HTTP', resp.status, idExterno, statusTriagem);
  }).catch(err=>console.error('persistirTriagemMercadoPago: erro de rede', err));
}

// Persiste a decisao de triagem de um item da Pluggy no Supabase, via RPC restrita triar_pluggy_item
// (so escreve dentro de PLUGGY_TRIAGEM por id sintetico, nada mais). Mesmo padrao fire-and-forget de
// persistirTriagemMercadoPago.
function persistirTriagemPluggy(idExterno, statusTriagem){
  if(!idExterno) return;
  const tokenAuth = typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null;
  if(!tokenAuth){ console.error('persistirTriagemPluggy: sem sessao valida, recarregue a pagina e faca login de novo.'); return; }
  fetch(`${SUPABASE_URL_WALLACE}/rest/v1/rpc/triar_pluggy_item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY_WALLACE,
      'Authorization': `Bearer ${tokenAuth}`
    },
    body: JSON.stringify({ p_id_externo: idExterno, p_status_triagem: statusTriagem })
  }).then(resp=>{
    if(!resp.ok) console.error('persistirTriagemPluggy: falhou HTTP', resp.status, idExterno, statusTriagem);
  }).catch(err=>console.error('persistirTriagemPluggy: erro de rede', err));
}

// Dispatcher unico - decide qual RPC chamar conforme a origem do item. Pluggy usa PLUGGY_TRIAGEM
// (mapa por id sintetico); qualquer outra origem com idExterno (hoje so Mercado Pago) continua no
// fluxo antigo. Nao muda nada pra itens manuais (idExterno null, ambas as funcoes ja tem guarda pra
// isso). 'Pluggy-Transação' (transação individual, reconciliarTransacoesPluggy) também usa o mapa
// PLUGGY_TRIAGEM - mesma RPC/escopo de 'Pluggy' (cartão), só a origem no rótulo muda.
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
  persistirTriagemItem(item, 'aprovado');
  WallaceBus.emit('inboxItemAprovado', item);
  atualizarInboxItem(id);
  // Aprovar um item da Inbox ABRE e PRE-PREENCHE o form "+ Lancar" (data/descricao/valor) - usuario
  // ainda precisa clicar Salvar pra gravar de verdade na V2 (mantem a proibicao de auto-lancamento sem
  // confirmacao, so reduz o trabalho de digitar de novo).
  const formEl = document.getElementById('formLancarTx');
  if(formEl){
    formEl.style.display = 'block';
    const elData = document.getElementById('ltxData'), elDesc = document.getElementById('ltxDescricao'), elValor = document.getElementById('ltxValor');
    if(elData && item.data) elData.value = item.data;
    if(elDesc) elDesc.value = item.descricao || '';
    if(elValor) elValor.value = Math.abs(item.valor||0);
    const elTipo = document.getElementById('ltxTipo');
    if(elTipo) elTipo.value = (item.valor||0) < 0 ? 'saida' : 'entrada';
    formEl.scrollIntoView({behavior:'smooth', block:'center'});
  }
}

function inboxRejeitar(id, motivo){
  const item = VARS.INBOX_FINANCEIRA.find(i=>i.id===id);
  if(!item) return;
  item.status = 'REJEITADO';
  item.motivoRejeicao = motivo || null;
  persistirTriagemItem(item, 'rejeitado');
  WallaceBus.emit('inboxItemRejeitado', item);
  atualizarInboxItem(id);
}

// NOVO 12/08/2026 (Fase 4 de modernização, pedido do usuário — performance): extraído de dentro do
// .map() de renderInboxFinanceira() pra poder gerar o HTML de 1 linha isolada (usado por
// atualizarInboxItem(), abaixo), sem duplicar o template. Comportamento idêntico ao que já existia.
function renderInboxLinha(it){
  const classeStatus = it.status==='APROVADO' ? 'bg' : (it.status==='REJEITADO' ? 'br' : 'ba');
  const conf = it.confianca!=null ? Math.round(it.confianca*100)+'%' : '—';
  const acoes = it.status==='PENDENTE'
    ? `<button type="button" class="inbox-btn inbox-btn-ok" onclick="inboxAprovar('${it.id}')">✔ Aprovar</button><button type="button" class="inbox-btn inbox-btn-no" onclick="inboxRejeitar('${it.id}')">✘ Rejeitar</button>`
    : '—';
  const descTitle = String(it.descricaoCompleta||it.descricao||'').replace(/"/g,'&quot;');
  // NOVO 08/08/2026 (correção de usabilidade — itens com mesma origem/valor/data pareciam
  // duplicados): linha de identificação abaixo da descrição, prioridade pagador > ID externo
  // (hora/minuto do evento não está disponível na fonte — mercadopago_sync.py só grava a data,
  // ver auditoria em PLANO_UNIFICACAO_V1_V2.md). Só exibe o que existir, nunca inventa campo.
  const identPartes = [];
  if(it.metadata && it.metadata.payer) identPartes.push(`Pagador: ${it.metadata.payer}`);
  if(it.idExterno) identPartes.push(`ID: ${it.idExterno}`);
  const identLinha = identPartes.length ? `<div class="inbox-ident-txt" style="color:var(--text-dim);font-size:0.65rem">${identPartes.join(' · ')}</div>` : '';
  return `<tr data-inbox-id="${it.id}"><td class="mono">${it.id}</td><td>${it.origem}</td><td><span class="inbox-desc-txt" title="${descTitle}">${it.descricao}</span>${it.livroSugerido?` <span style="color:var(--text-dim);font-size:0.65rem">→ ${it.livroSugerido}</span>`:''}${identLinha}</td><td class="r">${fmt(it.valor)}</td><td class="mono">${it.data}</td><td class="r">${conf}</td><td><span class="badge ${classeStatus}">${it.status}</span></td><td>${acoes}</td></tr>`;
}

// NOVO 12/08/2026 (Fase 4, achado da auditoria: aprovar/rejeitar 1 item reconstruía a tabela
// INTEIRA via renderInboxFinanceira(), inclusive as linhas que não mudaram - fluxo usado dezenas de
// vezes por sessão, sessão aberta por horas). Atualiza só a <tr> do item afetado + o resumo/badge
// (recontagem O(n) sobre o array, não sobre o DOM - barata). Se a linha não existir no DOM por
// algum motivo (ex: HTML antigo em cache), cai pro render completo como rede de segurança.
function atualizarInboxItem(id){
  const tbody = $('inboxFinanceiraTbody');
  if(!tbody) return;
  const item = VARS.INBOX_FINANCEIRA.find(i=>i.id===id);
  if(!item) return;
  const trAtual = tbody.querySelector(`tr[data-inbox-id="${id}"]`);
  if(!trAtual){ renderInboxFinanceira(); return; }
  trAtual.outerHTML = renderInboxLinha(item);
  atualizarResumoInbox();
}

function atualizarResumoInbox(){
  const itens = VARS.INBOX_FINANCEIRA;
  const pendentes = itens.filter(i=>i.status==='PENDENTE').length;
  const aprovados = itens.filter(i=>i.status==='APROVADO').length;
  const rejeitados = itens.filter(i=>i.status==='REJEITADO').length;
  const resumoEl = $('inboxFinanceiraResumo');
  if(resumoEl) resumoEl.textContent = `${pendentes} pendente(s) · ${aprovados} aprovado(s) · ${rejeitados} rejeitado(s)`;
  const tabBadge = $('inboxFinanceiraBadge');
  if(tabBadge) tabBadge.textContent = pendentes > 0 ? String(pendentes) : '';
}

function renderInboxFinanceira(){
  const tbody = $('inboxFinanceiraTbody');
  if(!tbody) return; // secao pode nao existir ainda num HTML antigo carregado em cache
  const itens = VARS.INBOX_FINANCEIRA;
  if(!itens.length){
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">' + VARS.LEGENDAS.legInboxVazia + '</td></tr>';
  } else {
    tbody.innerHTML = itens.slice().reverse().map(renderInboxLinha).join('');
  }
  atualizarResumoInbox();
}
