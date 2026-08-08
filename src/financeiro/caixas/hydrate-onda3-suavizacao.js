// MÓDULO: Onda 3, prioridade 4 (Metas) — card "Fundo de Suavização Salarial" lendo V2 (08/08/2026).
// Único item de Metas pronto pra migrar: `vw_saldo_v2_por_caixa` já tem "Conta Suavização (CC-304)"
// com saldo V1×V2 idêntico (0,00 nos dois — conta zerada desde a ativação, V90). Meta (R$12.000,
// VARS.metaSuavizacao) continua fixa em código — não é um valor variável rastreado em transacoes,
// não tem "estrutura V2" própria pra ler (mesmo caso do gap D já documentado pra Provisionado
// Wärtsilä), então continua vindo do V1 mesmo depois da migração.
//
// Meta do Milhão (2º item de Metas) NÃO migrada nesta entrega — depende de patrimonio.total, que
// depende da saldo da Caixa Lance, ainda sem causa raiz classificada (mesma pendência que bloqueou
// a Prioridade 3/Patrimônio nesta sessão — ver PLANO_UNIFICACAO_V1_V2.md seção 27).
//
// Reproduz a MESMA fórmula de hydrate-caixas.js (pctOf, textos "Zerada"/"Zerada · excedente",
// largura da barra) — só troca a fonte do saldo (VARS.contaSuavizacao → V2), nenhuma lógica nova.
//
// Rollback: comentar a chamada aplicarOnda3Suavizacao() em app.js — cxSuaviz* voltam a vir só de
// hydrateCaixas() (V1).

async function aplicarOnda3Suavizacao(){
  let saldosV2;
  try {
    saldosV2 = await WallaceFinanceService.getSaldosPorCaixa();
  } catch(err){
    console.error('Onda3Suavizacao: falha ao buscar vw_saldo_v2_por_caixa — mantendo V1 (fallback automático).', err);
    return;
  }
  if(!Array.isArray(saldosV2)){
    console.warn('Onda3Suavizacao: resposta inesperada — mantendo V1.');
    return;
  }
  const caixaV2 = saldosV2.find(c => c.caixa_nome === 'Conta Suavização (CC-304)');
  if(!caixaV2 || caixaV2.v2_saldo_calculado === null || caixaV2.v2_saldo_calculado === undefined){
    console.warn('Onda3Suavizacao: "Conta Suavização (CC-304)" ausente/sem saldo em vw_saldo_v2_por_caixa — mantendo V1.');
    window.WALLACE_ONDA3_SUAVIZACAO_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }
  const valorV1 = Math.round(VARS.contaSuavizacao * 100) / 100;
  const valorV2 = Math.round(Number(caixaV2.v2_saldo_calculado) * 100) / 100;
  const diverge = Math.abs(valorV1 - valorV2) > 0.01;

  if(diverge){
    console.warn(`Onda3Suavizacao: V1=${fmt(valorV1)} × V2=${fmt(valorV2)} — DIVERGE R$${Math.abs(valorV1-valorV2).toFixed(2)}. Sem causa raiz confirmada ainda — mantendo V1 (fallback), nada sobrescrito.`);
    window.WALLACE_ONDA3_SUAVIZACAO_RELATORIO = { v1: valorV1, v2: valorV2, diverge: true, exibindo: 'V1 (fallback)' };
    return;
  }
  console.log(`Onda3Suavizacao: V1×V2 batem (${fmt(valorV2)}).`);

  const suavizExcedente = REG.operacional.excedenteOuComplementoProLabore;
  const pctOf = (s,m) => m>0 ? Math.min(100, s/m*100) : 0;
  const t = (id,v) => { const el = $(id); if(el) el.textContent = v; };
  t('cxSuavizSaldo', fmt(valorV2));
  const suavizTxtEl = $('cxSuavizTxt');
  if(suavizTxtEl){
    if(valorV2 === 0 && suavizExcedente > 0) suavizTxtEl.textContent = 'Zerada · excedente do ciclo: ' + fmt(suavizExcedente);
    else if(valorV2 === 0) suavizTxtEl.textContent = 'Zerada';
    else suavizTxtEl.textContent = pctOf(valorV2, VARS.metaSuavizacao).toFixed(1) + '% da meta · ' + (valorV2/VARS.proLaboreFixo).toFixed(1) + ' mês(es) de colchão';
  }
  const suavizBar = $('cxSuavizBar');
  if(suavizBar) suavizBar.style.width = pctOf(valorV2, VARS.metaSuavizacao) + '%';

  window.WALLACE_ONDA3_SUAVIZACAO_RELATORIO = { v1: valorV1, v2: valorV2, diverge: false, exibindo: 'V2' };
  console.log('Onda3Suavizacao: relatório em window.WALLACE_ONDA3_SUAVIZACAO_RELATORIO', window.WALLACE_ONDA3_SUAVIZACAO_RELATORIO);
}
