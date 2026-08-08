// MÓDULO: Onda 3 — pendência transversal "Caixa Lance nunca classificada em nenhuma Onda"
// (achada na Prioridade 4/Metas, 08/08/2026). Mesmo padrão de hydrate-onda2-v2.js — reaproveita
// WallaceFinanceService.getSaldosPorCaixa() (vw_saldo_v2_por_caixa), já validada, sem SQL novo.
//
// Investigação feita nesta rodada (vw_reconciliacao_v1_v2 + vw_transacoes_so_no_v1 +
// vw_ajustes_manuais_v1, todas views já existentes): V1=R$4.522,13 × V2=R$4.526,50, diferença
// R$4,37 (0,10%). Parcialmente explicada: `AJUSTE-06-08` (-R$65,76, "saldo real confirmado
// pelo usuário via print Mercado Pago") existe só no V1 (aplicado direto em wallace_dados numa
// sessão anterior, nunca sincronizado como transação real na V2) — mas isso sozinho não fecha a
// conta (65,76 ≠ 4,37). Resíduo de R$4,37 continua com causa indeterminada
// (`causa_provavel = saldo_inicial_ausente_no_supabase_causa_indeterminada`, confiança BAIXA
// segundo a própria view). Mesma classe de caso das 4 caixas já excluídas na Onda 2 (Manutenção,
// Saúde Família, PIX Geral Vanessa, Aniversário Júlio) — divergência pequena mas SEM causa
// confirmada, não "documentada" no sentido da regra de 08/08. Por isso `aceitarDivergenciaConhecida:
// false` aqui: continua exibindo V1, só loga a divergência (deixa de ser "nunca classificada").
//
// Se o usuário confirmar/sincronizar o AJUSTE-06-08 na V2 e o resíduo fechar, virar
// `aceitarDivergenciaConhecida: true` é a única mudança necessária neste arquivo.
//
// Rollback: comentar a chamada aplicarOnda3CaixaLance() em app.js.

const ONDA3_CAIXALANCE_MAPA = [
  { idHtml: 'balResLance', caixaNome: 'Caixa Lance', getValorV1: () => REG.balanco.reservas.caixaLance, aceitarDivergenciaConhecida: false },
  { idHtml: 'patLance', caixaNome: 'Caixa Lance', getValorV1: () => REG.patrimonioDetalhe.caixaLance, aceitarDivergenciaConhecida: false },
];

async function aplicarOnda3CaixaLance(){
  let saldosV2;
  try {
    saldosV2 = await WallaceFinanceService.getSaldosPorCaixa();
  } catch(err){
    console.error('Onda3CaixaLance: falha ao buscar vw_saldo_v2_por_caixa — mantendo V1 (fallback automático).', err);
    return;
  }
  if(!Array.isArray(saldosV2)){
    console.warn('Onda3CaixaLance: resposta inesperada — mantendo V1.');
    return;
  }
  const caixaV2 = saldosV2.find(c => c.caixa_nome === 'Caixa Lance');
  if(!caixaV2 || caixaV2.v2_saldo_calculado === null || caixaV2.v2_saldo_calculado === undefined){
    console.warn('Onda3CaixaLance: "Caixa Lance" ausente/sem saldo em vw_saldo_v2_por_caixa — mantendo V1.');
    window.WALLACE_ONDA3_CAIXALANCE_RELATORIO = [{ caixa: 'Caixa Lance', status: 'sem_dado_v2' }];
    return;
  }
  const valorV2 = Math.round(Number(caixaV2.v2_saldo_calculado) * 100) / 100;
  const relatorio = [];
  ONDA3_CAIXALANCE_MAPA.forEach(({idHtml, caixaNome, getValorV1, aceitarDivergenciaConhecida}) => {
    let valorV1;
    try { valorV1 = Math.round(getValorV1() * 100) / 100; }
    catch(err){ console.warn(`Onda3CaixaLance: falha ao ler valor V1 de referência ("${idHtml}").`, err); valorV1 = null; }
    const diverge = valorV1 === null || Math.abs(valorV1 - valorV2) > 0.01;
    const diferenca = valorV1 !== null ? Math.round((valorV1 - valorV2)*100)/100 : null;
    const podeExibirV2 = (!diverge || aceitarDivergenciaConhecida) && valorV1 !== null;

    if(diverge){
      const motivo = aceitarDivergenciaConhecida
        ? 'divergência conhecida e documentada — exibindo V2 mesmo assim.'
        : 'causa indeterminada/baixa confiança (parcialmente explicada por AJUSTE-06-08 não sincronizado, resíduo R$4,37 sem causa confirmada) — mantendo V1.';
      console.warn(`Onda3CaixaLance [${idHtml}]: V1=${valorV1!==null?fmt(valorV1):'?'} × V2=${fmt(valorV2)} — DIVERGE${diferenca!==null?' R$'+Math.abs(diferenca).toFixed(2):''}. ${motivo}`);
    } else {
      console.log(`Onda3CaixaLance [${idHtml}]: V1×V2 batem (${fmt(valorV2)}).`);
    }
    relatorio.push({ caixa: caixaNome, idHtml, v1: valorV1, v2: valorV2, diverge, diferenca, exibindo: podeExibirV2 ? 'V2' : 'V1 (fallback, causa indeterminada)' });

    if(!podeExibirV2) return;
    const el = $(idHtml);
    if(!el){ console.warn(`Onda3CaixaLance: id "${idHtml}" não encontrado no DOM, ignorado.`); return; }
    el.textContent = fmt(valorV2);
  });
  window.WALLACE_ONDA3_CAIXALANCE_RELATORIO = relatorio;
  console.log('Onda3CaixaLance: relatório completo em window.WALLACE_ONDA3_CAIXALANCE_RELATORIO', relatorio);
}
