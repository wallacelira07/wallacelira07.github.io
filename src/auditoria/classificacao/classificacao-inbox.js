// MÓDULO: Classificação da Inbox — classificarItemDeterministico/classificarInboxPendentes (V400
// Etapa 10) + classificarItemMercadoPago/sincronizarMercadoPagoParaInbox (V450 Etapas 5/6).
// Extraído de app.js na modularização (07/08/2026) — funções globais, chamadas por referência
// (onDomPronto) ou de dentro de outras funções. Referenciam o global CARTAO_PLUGGY_MAPA (definido em
// app.js a partir de VARS, ver nota em pluggy-reconciliacao.js), só usado dentro de função, nunca no
// load do módulo. Só modularização, nenhuma fórmula ou comportamento mudou.

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
// NOVO 08/08/2026 (correção de usabilidade — Inbox mostrava "(sem descrição)" genérico, fazendo
// eventos distintos parecerem a mesma transação repetida): quando o Mercado Pago não manda
// "description"/"statement_descriptor", o evento ainda tem "tipo" (payment_type_id/operation_type,
// já normalizado por mercadopago_sync.py) — usa isso pra gerar um texto real em vez de placeholder
// vazio. Mapa fechado, só valores que o próprio brief/API já usa (P1: nunca chuta texto que não
// venha do dado); tipo desconhecido ainda mostra o valor cru, nunca esconde a informação.
function inboxDescricaoAutomaticaMP(tipo){
  const MAPA_TIPO_MP = {
    account_money: 'Movimentação de saldo (conta Mercado Pago)',
    pix: 'PIX recebido (Mercado Pago)',
    bank_transfer: 'Transferência bancária (Mercado Pago)',
    credit_card: 'Pagamento com cartão de crédito (Mercado Pago)',
    debit_card: 'Pagamento com cartão de débito (Mercado Pago)',
    ticket: 'Pagamento via boleto (Mercado Pago)',
  };
  return MAPA_TIPO_MP[tipo] || `Evento Mercado Pago (tipo: ${tipo || 'desconhecido'})`;
}

async function sincronizarMercadoPagoParaInbox(){
  const eventos = VARS.MERCADOPAGO_EVENTOS;
  if(!Array.isArray(eventos) || !eventos.length){
    console.warn('sincronizarMercadoPagoParaInbox: VARS.MERCADOPAGO_EVENTOS ainda nao chegou (offline, Supabase sem esse campo, ou mercadopago_sync.py ainda nao rodou nesta conta).');
    return {novos:0};
  }
  // CORRIGIDO 09/08/2026 (achado do usuario: INBX000001 "Medidor De Energia" R$79,79 ja existia
  // como TX000226 em Bens Duraveis, mas apareceu como PENDENTE - quase virou lancamento duplicado).
  // Causa raiz: a checagem de duplicidade so comparava contra uma LISTA HARDCODED de 7 dos ~24
  // livros/caixas reais (LRW/LRV/LRC_LIMBO/LRCV/PV/LRPV/BOLETOS) - Bens Duraveis (e qualquer caixa
  // fora dela) nunca entrava na comparacao. CORRIGIDO NA RAIZ 09/08/2026 (pedido explicito do
  // usuario: "se existe dado hardcoded, mude isso, e proibido") - lista hardcoded removida por
  // completo. Fonte unica agora e a V2 real (todo valor confirmado, todas as caixas, sem lista
  // fixa pra manter atualizada na mao). Falha de rede nao trava a sincronizacao (item so fica sem
  // o aviso de "possivel duplicidade" nesse caso raro, nunca escondido da Inbox) - log alto pra
  // nao passar despercebido.
  const valoresConhecidos = new Set();
  try {
    (await WallaceFinanceService.getValoresConhecidosV2()).forEach(v => valoresConhecidos.add(v));
  } catch(err){
    console.error('sincronizarMercadoPagoParaInbox: falha ao buscar valores confirmados da V2 — checagem de duplicidade DESATIVADA nesta rodada (itens ainda entram na Inbox, sem o aviso de possível duplicidade).', err);
  }
  // CORRIGIDO 09/08/2026 (achado do usuário: R$551,01 "Mercado Livre" era a mesma compra já lançada,
  // desmembrada em 3 partes — valor exato nunca bateria). Soma de combinações da mesma caixa fecha
  // essa classe de falso-negativo. Mesmo tratamento de falha silenciosa (nunca esconde item real).
  try {
    (await WallaceFinanceService.getValoresCombinadosV2()).forEach(v => valoresConhecidos.add(v));
  } catch(err){
    console.error('sincronizarMercadoPagoParaInbox: falha ao buscar valores combinados da V2 — checagem de compra desmembrada DESATIVADA nesta rodada.', err);
  }
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
      descricao: (ev.descricao || inboxDescricaoAutomaticaMP(ev.tipo)) + (possivelDuplicata ? ' — ⚠ possível duplicidade (valor já existe em algum livro do ERP)' : ''),
      valor: ev.valor, data: ev.data,
      categoriaSugerida: sugestao.categoriaSugerida || null,
      livroSugerido: sugestao.livroSugerido || null,
      confianca: sugestao.confianca != null ? sugestao.confianca : null,
      idExterno: ev.id, metadata: ev.metadata || null, silencioso:true
    });
    novos++;
  });
  console.log('sincronizarMercadoPagoParaInbox:', novos, 'evento(s) novo(s) levado(s) pra Inbox.');
  renderInboxFinanceira(); // parte 54: 1 render só no final, nao mais 1 por evento
  return {novos};
}
