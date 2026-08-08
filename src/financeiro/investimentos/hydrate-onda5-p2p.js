// MÓDULO: Onda 5 — continuação da aposentadoria do wallace_dados (08/08/2026), domínio 2 (P2P,
// seção 18). Domínio isolado (recalcularP2P() só depende de VARS.p2p*, nenhuma dependência de
// outro domínio) — candidato seguro, sem risco de efeito colateral em outras seções. Os 7
// escalares são "verdade externa" (plataforma P2P, não derivável de transacoes/parcelas), mesmo
// padrão já usado pro CDI_MENSAL_ATUAL: migrados pra `indicadores`, não uma tabela de domínio novo.
//
// Mesma estratégia dos domínios anteriores: troca a origem de VARS.p2p* e reaproveita
// recalcularP2P() + hydrateResumoP2P() (V1, INALTERADAS) — zero lógica duplicada.
//
// Rollback: comentar a chamada aplicarOnda5P2P() em app.js.
//
// NOVO 08/08/2026: P2P é fonte V2 EXCLUSIVA (diretriz "V2 é a fonte real") — em caso de falha, os
// ids marcam "⚠ Indisponível (V2)" em vez de deixar silenciosamente o número V1 (síncrono) na tela.
const ONDA5_P2P_IDS = ['p2pCapitalTotal', 'p2pCreditosRestantes', 'p2pSaldoInvestido', 'p2pLucroRealizado'];

async function aplicarOnda5P2P(){
  let p2pV2;
  try {
    p2pV2 = await WallaceFinanceService.getP2PV2();
  } catch(err){
    console.error('Onda5P2P: falha ao buscar vw_p2p_v2 — sem fallback V1 (P2P é V2-exclusivo).', err);
    marcarIndisponivelV2(ONDA5_P2P_IDS, 'Falha ao buscar vw_p2p_v2');
    window.WALLACE_ONDA5_P2P_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!p2pV2 || p2pV2.capital_total === null){
    console.warn('Onda5P2P: vw_p2p_v2 vazia/incompleta.');
    marcarIndisponivelV2(ONDA5_P2P_IDS, 'vw_p2p_v2 vazia/incompleta');
    window.WALLACE_ONDA5_P2P_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const v1 = { capitalTotal: VARS.p2pCapitalTotal, lucroRealizado: VARS.p2pLucroRealizado };

  VARS.p2pCapitalTotal = Number(p2pV2.capital_total);
  VARS.p2pCreditosTotal = Number(p2pV2.creditos_total);
  VARS.p2pCreditosRestantes = Number(p2pV2.creditos_restantes);
  VARS.p2pCreditosVendidos = Number(p2pV2.creditos_vendidos);
  VARS.p2pPrecoCompra = Number(p2pV2.preco_compra);
  VARS.p2pPrecoVenda = Number(p2pV2.preco_venda);
  VARS.p2pLucroRealizado = Number(p2pV2.lucro_realizado);

  REG.p2p.capitalTotal = VARS.p2pCapitalTotal;
  REG.p2p.creditosTotal = VARS.p2pCreditosTotal;
  REG.p2p.creditosRestantes = VARS.p2pCreditosRestantes;
  REG.p2p.creditosVendidos = VARS.p2pCreditosVendidos;
  REG.p2p.precoCompra = VARS.p2pPrecoCompra;
  REG.p2p.precoVenda = VARS.p2pPrecoVenda;
  REG.p2p.lucroRealizado = VARS.p2pLucroRealizado;

  // Reaproveita recalcularP2P()/hydrateResumoP2P() (V1, inalteradas) — mesmo cálculo, dado novo.
  recalcularP2P();
  hydrateResumoP2P();

  const diverge = Math.abs(v1.capitalTotal - VARS.p2pCapitalTotal) > 0.01 || Math.abs(v1.lucroRealizado - VARS.p2pLucroRealizado) > 0.01;
  if(diverge) console.warn(`Onda5P2P: V1×V2 divergem (inesperado, investigar). Capital V1=${fmt(v1.capitalTotal)}×V2=${fmt(VARS.p2pCapitalTotal)}.`);
  else console.log(`Onda5P2P: V1×V2 batem. V2 é a fonte exibida.`);

  window.WALLACE_ONDA5_P2P_RELATORIO = { capitalTotalV1: v1.capitalTotal, capitalTotalV2: VARS.p2pCapitalTotal, diverge, exibindo: 'V2' };
  console.log('Onda5P2P: relatório completo em window.WALLACE_ONDA5_P2P_RELATORIO', window.WALLACE_ONDA5_P2P_RELATORIO);
}
