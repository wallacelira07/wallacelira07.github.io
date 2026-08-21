// MÓDULO: Onda 3 — Caixa Lance, PROMOVIDA pra V2 (09/08/2026, investigação "matar V1").
//
// Histórico: resíduo era R$85,76 (1,90%), causa indeterminada. Consultando `wallace_dados`
// diretamente (não o arquivo JS estático, que estava desatualizado — só 8 dos 10 itens reais)
// achei os 2 itens que faltavam: `RENDIMENTO-31-07` (+R$9,42, já existia certo na V2) e
// `AJUSTE-06-08` (-R$65,76, correção manual do usuário contra print real do Mercado Pago,
// nunca migrada pra V2 — corrigido via UPDATE). Resíduo caiu pra R$20,00 (0,44%) NAQUELE momento
// (09/08/2026), alta confiança: é uma venda de P2P real que já existe na V2 mas nunca foi copiada
// de volta pro V1 — mesmo padrão já aceito nas outras caixas (V2 recebe lançamento novo, V1 não
// acompanha). ATENÇÃO (achado de auditoria 18/08/2026): esse resíduo cresce a cada novo
// lançamento feito só na V2, é esperado pós-encerramento da migração — não tratar este número
// (R$20,00/0,44%) como medição atual sem reconferir vw_reconciliacao_v1_v2. Não afeta o que o
// usuário vê (aceitarDivergenciaConhecida:true já exibe o saldo V2 correto na tela).
//
// CORRIGIDO 21/08/2026 (pedido direto do usuário, prioridade 0 — "V1 deve ser assassinada e
// enterrada"): a divergência V1×V2 cresceu de R$4,37/R$20,00 (quando documentada) pra R$139,31,
// porque o array V1 (CAIXA_LANCE_TRANSACOES em vars-caixas.js) nunca acompanhava os lançamentos
// reais novos. hydrate-onda4-patrimonio.js (Patrimônio total) foi a última leitura que ainda
// dependia de V1 pra este valor — agora lê o mesmo V2 daqui. Este módulo (Onda 3) continua servindo
// como log de comparação/divergência V1×V2, útil pra detectar drift futuro.
//
// Rollback: comentar a chamada aplicarOnda3CaixaLance() em app.js.

const ONDA3_CAIXALANCE_MAPA = [
  { idHtml: 'balResLance', caixaNome: 'Caixa Lance', getValorV1: () => REG.balanco.reservas.caixaLance, aceitarDivergenciaConhecida: true },
  { idHtml: 'patLance', caixaNome: 'Caixa Lance', getValorV1: () => REG.patrimonioDetalhe.caixaLance, aceitarDivergenciaConhecida: true },
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
        : 'causa indeterminada/baixa confiança — mantendo V1.';
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
