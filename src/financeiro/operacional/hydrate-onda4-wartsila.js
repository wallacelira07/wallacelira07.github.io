// MÓDULO: Onda 4 — "Supabase como fonte única de verdade" (08/08/2026), domínio 4 (Cascata de
// Reembolso Wärtsilä — o último dos 4 domínios autorizados). Mesma estratégia dos domínios 2/3:
// sobrescreve os campos de entrada específicos deste domínio em VARS/REG e reaproveita
// recalcularReembolsos() + hydrateReembolsos() (ambas V1, INALTERADAS) pro cálculo/renderização —
// zero lógica de negócio duplicada.
//
// Achado nesta implementação: a caixa "Provisionado Wärtsilä" já existia na V2 (vw_saldo_v2_por_caixa)
// mas com 0 transações sincronizadas (saldo travado no `saldo_inicial_ciclo`, R$683,04) — as 3
// movimentações já documentadas em VARS.WARTSILA_CAIXA_TRANSACOES foram inseridas em `transacoes`
// (migration wartsila_caixa_transacoes_faltantes), então a caixa agora reflete o saldo real
// (R$339,00) por conta própria, sem precisar de lógica nova aqui.
//
// Fora do escopo desta migration (propositalmente): `perna_mp_pessoal_provisionado` (REG.totalOpDetalhe.provMP)
// pertence ao domínio de parcelamentos Mercado Pago — não uma das 4 prioridades autorizadas. Este
// módulo NÃO sobrescreve esse campo, deixa como o V1 já calculou.
//
// Rollback: comentar a chamada aplicarOnda4Wartsila() em app.js.
//
// NOVO 08/08/2026: Cascata Wärtsilä é fonte V2 EXCLUSIVA (diretriz "V2 é a fonte real") — em caso
// de falha, os cards mostram aviso explícito em vez de deixar silenciosamente os números V1
// (síncronos) na tela.
const ONDA4_WARTSILA_IDS = ['reembRecebidos','reembAReceber','reembCicloTotal','reembPagaWartsila','reembPagaMP','reembPagaCartao','reembSobraPessoal','cxWartsila','cxWartsilaExcedente','cxWartsilaProvisionado','r21Wartsila'];

async function aplicarOnda4Wartsila(){
  let ciclo, saldosV2;
  try {
    [ciclo, saldosV2] = await Promise.all([
      WallaceFinanceService.getReembolsoWartsilaCicloV2(),
      WallaceFinanceService.getSaldosPorCaixa(),
    ]);
  } catch(err){
    console.error('Onda4Wartsila: falha ao buscar dados da V2 — sem fallback V1 (domínio é V2-exclusivo).', err);
    marcarIndisponivelV2(ONDA4_WARTSILA_IDS, 'falha ao buscar dados da V2');
    window.WALLACE_ONDA4_WARTSILA_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  const caixaWartsila = Array.isArray(saldosV2) ? saldosV2.find(c => c.caixa_nome === 'Provisionado Wärtsilä') : null;
  if(!ciclo || !caixaWartsila || caixaWartsila.v2_saldo_calculado === null || caixaWartsila.v2_saldo_calculado === undefined){
    console.warn('Onda4Wartsila: dado incompleto na V2.');
    marcarIndisponivelV2(ONDA4_WARTSILA_IDS, 'dado incompleto na V2');
    window.WALLACE_ONDA4_WARTSILA_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const v1SobraPessoalAntes = REG.operacional.reembolsoSobraPessoal;

  VARS.faturaWartsila = Number(ciclo.perna_fatura_wartsila);
  REG.faturaWartsila = VARS.faturaWartsila;
  REG.wartsilaCaixa.fatura = VARS.faturaWartsila;
  REG.wartsilaCaixa.provisionado = Math.round(Number(caixaWartsila.v2_saldo_calculado) * 100) / 100;
  REG.operacional.reembolsoPagaWartsila = VARS.faturaWartsila;
  REG.operacional.reembolsoPagaCartaoCorporativo = Number(ciclo.perna_cartao_corporativo_pessoal);
  REG.operacional.reembolsoPagaMPCorporativo = Number(ciclo.perna_mp_corporativo);
  REG.operacional.reembolsoCicloTotal = Number(ciclo.valor_total_bruto);
  REG.operacional.reembolsosAReceber = Number(ciclo.valor_a_receber);
  // REG.totalOpDetalhe.provMP (perna 4) NÃO é tocado — fora do escopo deste domínio, ver comentário acima.

  // Reaproveita recalcularReembolsos()/hydrateReembolsos() (V1, inalteradas) — mesmo cálculo, dado novo.
  recalcularReembolsos();
  hydrateReembolsos();
  // ACHADO 08/08/2026 (mesma classe do caso Boletos/Reservas/Patrimônio/LREI): hydrateWartsilaCaixasTextos()
  // (card "Caixa Wärtsilä" — saldo/barra/excedente) e hydrateResumoExecutivo() (badge r21Wartsila) rodam
  // ANTES desta função no hydrate() síncrono do boot, então ficavam travados no valor V1 mesmo depois de
  // REG.wartsilaCaixa/REG.faturaWartsila já terem sido sobrescritos acima. Re-chamadas aqui (idempotentes,
  // só leem REG/VARS) pra resincronizar.
  hydrateWartsilaCaixasTextos();
  hydrateResumoExecutivo();

  const v2SobraPessoal = REG.operacional.reembolsoSobraPessoal;
  const diverge = Math.abs(v1SobraPessoalAntes - v2SobraPessoal) > 0.01;
  if(diverge) console.warn(`Onda4Wartsila: sobra pessoal V1=${fmt(v1SobraPessoalAntes)} × V2=${fmt(v2SobraPessoal)} — DIVERGE (inesperado, investigar).`);
  else console.log(`Onda4Wartsila: V1×V2 batem (sobra pessoal ${fmt(v2SobraPessoal)}). V2 é a fonte exibida.`);

  window.WALLACE_ONDA4_WARTSILA_RELATORIO = {
    cicloReferencia: ciclo.ciclo_referencia, sobraPessoalV1: v1SobraPessoalAntes, sobraPessoalV2: v2SobraPessoal,
    provisionadoWartsilaV2: REG.wartsilaCaixa.provisionado, diverge, exibindo: 'V2',
  };
  console.log('Onda4Wartsila: relatório completo em window.WALLACE_ONDA4_WARTSILA_RELATORIO', window.WALLACE_ONDA4_WARTSILA_RELATORIO);
}
