// MÓDULO: Onda 6 — migração de wallace_dados.MERCADOPAGO_EVENTOS para a tabela relacional
// `mercadopago_eventos` (08/08/2026). A RPC atualizar_mercadopago_eventos (chamada por
// mercadopago_sync.py) passou a gravar direto na tabela nova, preservando status_triagem por linha
// em conflito de id — wallace_dados.MERCADOPAGO_EVENTOS parou de ser atualizado a partir de agora.
//
// Mesma estratégia já usada em Wärtsilä/Investimentos/Parcelamentos/LREI: troca só a ORIGEM do dado
// (VARS.MERCADOPAGO_EVENTOS) e reaproveita sincronizarMercadoPagoParaInbox()/renderMercadoPagoDashboard()
// (V1, INALTERADAS) — zero lógica de negócio duplicada.
//
// NOVO 08/08/2026: Mercado Pago (eventos) é fonte V2 EXCLUSIVA — em caso de falha, não roda a
// sincronização (evita empurrar dado V1 potencialmente desatualizado pra Inbox) e o painel mostra
// aviso explícito em vez de ficar silenciosamente vazio/desatualizado.
//
// Rollback: comentar a chamada aplicarOnda6MercadoPago() em app.js — nada mais muda (a sincronização
// V1 simplesmente não roda mais, já que wallace_dados.MERCADOPAGO_EVENTOS parou de ser atualizado).

async function aplicarOnda6MercadoPago(){
  let eventosV2;
  try {
    eventosV2 = await WallaceFinanceService.getMercadoPagoEventosV2();
  } catch(err){
    console.error('Onda6MercadoPago: falha ao buscar mercadopago_eventos — sem fallback V1 (domínio é V2-exclusivo).', err);
    const el = $('mpDashboardResumo');
    if(el) el.innerHTML = '<div style="color:var(--text-danger);font-size:0.72rem">⚠ Indisponível (V2) — falha ao buscar mercadopago_eventos</div>';
    window.WALLACE_ONDA6_MERCADOPAGO_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(eventosV2)){
    console.warn('Onda6MercadoPago: resposta inesperada da V2.');
    const el = $('mpDashboardResumo');
    if(el) el.innerHTML = '<div style="color:var(--text-danger);font-size:0.72rem">⚠ Indisponível (V2) — resposta inesperada</div>';
    window.WALLACE_ONDA6_MERCADOPAGO_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  VARS.MERCADOPAGO_EVENTOS = eventosV2.map(ev => ({
    id: ev.id, origem: ev.origem, tipo: ev.tipo, descricao: ev.descricao,
    valor: ev.valor !== null ? Number(ev.valor) : null, data: ev.data, status: ev.status,
    status_triagem: ev.status_triagem, metadata: ev.metadata,
  }));

  // Reaproveita sincronizarMercadoPagoParaInbox()/renderMercadoPagoDashboard() (V1, inalteradas) —
  // mesma lógica de classificação/dedupe, dado novo. sincronizarMercadoPagoParaInbox() já chama
  // renderInboxFinanceira() no final; renderMercadoPagoDashboard() lê VARS.INBOX_FINANCEIRA (não
  // MERCADOPAGO_EVENTOS diretamente), então precisa ser re-chamada aqui pra refletir os itens novos.
  const resultado = await sincronizarMercadoPagoParaInbox();
  // Mesmo cuidado já aplicado ao encadeamento reconciliarTransacoesPluggy() em app.js (parte 115):
  // classificarInboxPendentes() já rodou de forma síncrona ANTES deste fetch assíncrono resolver,
  // então os itens novos desta rodada nunca tiveram a chance do classificador genérico — re-chama
  // aqui (idempotente, só preenche o que ainda estiver sem sugestão).
  classificarInboxPendentes();
  renderMercadoPagoDashboard();

  console.log(`Onda6MercadoPago: ${eventosV2.length} evento(s) da V2, ${resultado.novos} novo(s) levado(s) pra Inbox. V2 é a fonte exibida.`);
  window.WALLACE_ONDA6_MERCADOPAGO_RELATORIO = { qtdEventosV2: eventosV2.length, novosNaInbox: resultado.novos, exibindo: 'V2' };
}
