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

// NOVO 10/08/2026 (item aprovado: "filtro de assinatura/recorrência conhecida na Inbox" — hoje
// dedup só comparava valor exato, uma assinatura com reajuste/variação de câmbio nunca batia,
// reaparecendo todo ciclo). Extrai palavras-chave (>=4 letras, maiúsculas, sem acento) de uma
// descrição de transação já confirmada como Assinatura — usado pra montar o conjunto de
// "estabelecimentos conhecidos" a partir de vw_assinaturas_confirmadas_v2 (dado real, não lista
// hardcoded). Descarta parte entre parênteses (é narrativa livre do usuário tipo "compra
// internacional, cartão X..." — não é nome de estabelecimento) e um stopword set pequeno de
// palavras genéricas que apareceriam em qualquer descrição, não identificam o serviço.
const ASSINATURA_STOPWORDS = new Set(['ASSINATURA','MENSAL','ANUAL','RENOVACAO','COMPRA','CARTAO',
  'VIRTUAL','FISICO','VALOR','BASE','APROVADO','ESTIMADO','CONFIRMA','INTERNACIONAL','MASTERCARD',
  'BLACK','INFINITE','VISA','CONSOLIDADA','COBRANCA','SEPARADA','MESMO','HORARIOS','DIFERENTES',
  'FINAL','WALLACE','VANESSA']);
function extrairPalavrasChaveAssinatura(descricao){
  const semParenteses = (descricao || '').split('(')[0];
  const normalizado = semParenteses.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return (normalizado.match(/[A-Z]{4,}/g) || []).filter(p => !ASSINATURA_STOPWORDS.has(p));
}
function construirPalavrasChaveAssinaturasConhecidas(descricoesConfirmadas){
  const chaves = new Set();
  descricoesConfirmadas.forEach(row => {
    extrairPalavrasChaveAssinatura(row.descricao).forEach(p => chaves.add(p));
  });
  return chaves;
}
// Bate se QUALQUER palavra-chave conhecida aparecer na descrição do item novo — substring, não
// igualdade exata (ex.: "ANTHROPIC" bate em "ANTHROPIC*CLAUDE SUB" e em "ANTHROPIC_API").
function descricaoBateAssinaturaConhecida(descricaoNova, palavrasChaveConhecidas){
  if(!palavrasChaveConhecidas || !palavrasChaveConhecidas.size) return false;
  const novaChaves = extrairPalavrasChaveAssinatura(descricaoNova);
  if(!novaChaves.length) return false;
  return novaChaves.some(p => palavrasChaveConhecidas.has(p));
}
// Busca única, cacheada em WallaceFinanceService — reaproveitada pelos dois pontos de dedup
// (Mercado Pago abaixo, Pluggy em pluggy-reconciliacao.js). Falha de rede nunca esconde item real
// da Inbox, só desativa esse aviso específico nesta rodada (mesmo tratamento dos outros dedups).
async function obterPalavrasChaveAssinaturasConhecidas(origemLog){
  try {
    const rows = await WallaceFinanceService.getAssinaturasConfirmadasV2();
    return construirPalavrasChaveAssinaturasConhecidas(rows);
  } catch(err){
    console.error(`${origemLog}: falha ao buscar assinaturas confirmadas da V2 — checagem de estabelecimento conhecido DESATIVADA nesta rodada (dedup por valor exato continua ativo).`, err);
    return new Set();
  }
}

// NOVO 14/08/2026 (achado real, auditoria de lag do boot — 3ª rodada): extraído do início de
// sincronizarMercadoPagoParaInbox() pra poder ser disparado MAIS CEDO, em paralelo com a busca
// principal (getMercadoPagoEventosV2()/getPluggyContasV2()) em vez de só depois dela resolver —
// nenhuma das 4 buscas abaixo depende do resultado da busca principal, só é LIDA depois que as
// duas terminam. Compartilhada entre Mercado Pago (aplicarOnda6MercadoPago) e Pluggy
// (reconciliarTransacoesPluggy), mesmo conjunto de checagens de dedupe nos dois.
function dispararContextoDedupeInbox(origemLog){
  return Promise.all([
    WallaceFinanceService.getValoresConhecidosV2().catch(err => {
      console.error(`${origemLog}: falha ao buscar valores confirmados da V2 — checagem de duplicidade DESATIVADA nesta rodada (itens ainda entram na Inbox, sem o aviso de possível duplicidade).`, err);
      return null;
    }),
    // CORRIGIDO 09/08/2026 (achado do usuário: R$551,01 "Mercado Livre" era a mesma compra já
    // lançada, desmembrada em 3 partes — valor exato nunca bateria). Soma de combinações da mesma
    // caixa fecha essa classe de falso-negativo. Mesmo tratamento de falha silenciosa.
    WallaceFinanceService.getValoresCombinadosV2().catch(err => {
      console.error(`${origemLog}: falha ao buscar valores combinados da V2 — checagem de compra desmembrada DESATIVADA nesta rodada.`, err);
      return null;
    }),
    // NOVO 10/08/2026 (item aprovado: filtro de assinatura/recorrência conhecida): fecha o caso que
    // o dedup por valor nunca pegava — mesma assinatura, valor diferente (reajuste/câmbio). Ver
    // obterPalavrasChaveAssinaturasConhecidas() acima (já trata a própria falha internamente).
    obterPalavrasChaveAssinaturasConhecidas(origemLog),
    // NOVO 12/08/2026 (pedido explícito do usuário: "não me interessa compra de ciclos passados,
    // compra já informadas manualmente"). Ciclo atual real da Caixa Variável.
    WallaceFinanceService.getCicloAtualInicio().catch(err => {
      console.error(`${origemLog}: falha ao buscar ciclo atual — filtro de ciclo DESATIVADO nesta rodada (itens de ciclos antigos podem aparecer).`, err);
      return null;
    })
  ]);
}

async function sincronizarMercadoPagoParaInbox(promessaContexto){
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
  // CORRIGIDO 12/08/2026 (mesmo achado do diagnóstico de lag, gêmeo do fix em
  // pluggy-reconciliacao.js — 2ª rodada, achado da auditoria completa de boot: as 4 buscas abaixo
  // são todas independentes entre si, mas 2 delas rodavam atrás do Promise.all em vez de dentro
  // dele). 1 único Promise.all com as 4.
  // CORRIGIDO 14/08/2026 (3ª rodada): as 4 buscas (agora em dispararContextoDedupeInbox()) também
  // não dependem de VARS.MERCADOPAGO_EVENTOS já ter chegado — aplicarOnda6MercadoPago() dispara
  // essa promessa ANTES do fetch dos eventos, em paralelo, e repassa aqui via `promessaContexto`.
  // Se chamada sem o parâmetro (uso avulso/futuro), dispara na hora do jeito antigo — nunca quebra.
  const valoresConhecidos = new Set();
  const [resValoresConhecidos, resValoresCombinados, palavrasChaveAssinaturas, cicloAtualInicio] =
    await (promessaContexto || dispararContextoDedupeInbox('sincronizarMercadoPagoParaInbox'));
  if(resValoresConhecidos) resValoresConhecidos.forEach(v => valoresConhecidos.add(v));
  if(resValoresCombinados) resValoresCombinados.forEach(v => valoresConhecidos.add(v));
  const jaImportados = new Set(VARS.INBOX_FINANCEIRA.map(it=>it.idExterno).filter(Boolean));
  let ignoradosPorCicloAntigo = 0, ignoradosPorDuplicidade = 0;
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
    if(cicloAtualInicio && ev.data && ev.data < cicloAtualInicio){ ignoradosPorCicloAntigo++; return; }
    const valorAbs = Math.round(Math.abs(ev.valor)*100)/100;
    // CORRIGIDO 12/08/2026 (pedido explícito do usuário: "não quero que apareça na Inbox nada que já
    // foi lançada" — antes, valor já conhecido só ganhava um aviso na descrição e ENTRAVA MESMO ASSIM
    // como pendente, diferente do gêmeo Pluggy que já pulava. Unifica: se já existe (confirmado ou
    // pendente_classificacao, ver getValoresConhecidosV2), não vira item de Inbox.
    if(valoresConhecidos.has(valorAbs)){ ignoradosPorDuplicidade++; return; }
    const bateAssinatura = descricaoBateAssinaturaConhecida(ev.descricao, palavrasChaveAssinaturas);
    const avisoDuplicidade = bateAssinatura ? ' — ⚠ estabelecimento já é uma assinatura confirmada (valor pode ter mudado — reajuste/câmbio)' : '';
    const sugestao = classificarItemMercadoPago(ev.descricao) || {};
    // CORRIGIDO 04/08/2026 (parte 54): idExterno agora vai direto na criacao (idExterno: ev.id) em vez
    // de um VARS.INBOX_FINANCEIRA.find(...) logo depois pra "achar de volta" o item e so entao setar -
    // essa busca era O(n) a cada evento, mesma familia do bug O(n²) corrigido acima (gerarProximoInboxId/
    // renderInboxFinanceira). silencioso:true pelo mesmo motivo: 1 render no final, nao 1 por evento.
    inboxAdicionarItem({
      origem: 'Mercado Pago',
      descricao: (ev.descricao || inboxDescricaoAutomaticaMP(ev.tipo)) + avisoDuplicidade,
      valor: ev.valor, data: ev.data,
      categoriaSugerida: sugestao.categoriaSugerida || null,
      livroSugerido: sugestao.livroSugerido || null,
      confianca: sugestao.confianca != null ? sugestao.confianca : null,
      idExterno: ev.id, metadata: ev.metadata || null, silencioso:true
    });
    novos++;
  });
  console.log(`sincronizarMercadoPagoParaInbox: ${novos} evento(s) novo(s) levado(s) pra Inbox, ${ignoradosPorDuplicidade} ignorado(s) por já estar lançado(a), ${ignoradosPorCicloAntigo} ignorado(s) por ser de ciclo anterior ao atual.`);
  renderInboxFinanceira(); // parte 54: 1 render só no final, nao mais 1 por evento
  return {novos};
}
