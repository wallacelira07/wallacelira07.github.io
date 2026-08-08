// MÓDULO: Onda 8 — migração de VARS.CRONOGRAMA_BOLETOS_FIXOS (literal em vars-caixas.js) para a
// tabela relacional cronograma_boletos_fixos (08/08/2026). Escopo deliberadamente contido: só o
// SCHEDULE (dia de vencimento/valor dos 9 boletos fixos) migra — a lógica de auto-crédito em si
// (aplicarBoletosVencidosAutomaticamente(), app.js) continua a mesma função V1, inalterada, só
// passa a rodar de novo com o schedule vindo da V2 depois que o fetch resolve.
//
// Por que o escopo não inclui BOLETOS_TRANSACOES: essa é a lista de "já lançados" nesta sessão de
// boot, usada só pra dedupe do auto-crédito — o saldo real da Caixa Boletos (cxBoletosSaldo,
// balResBoletos, cxBoletosPct/Bar) já vem 100% da V2 desde a Onda 1/mesma sessão (vw_saldo_v2_por_caixa),
// então não há valor visível adicional em migrar esse array também agora.
//
// Efeito prático da migração: o schedule dos boletos fixos passa a ser editável direto no Supabase,
// sem precisar de deploy de código (mesmo padrão já usado pela tabela `legendas`) — se um valor
// mudar (ex: reajuste do condomínio), corrigir na tabela já reflete no próximo carregamento.
//
// Rollback: comentar a chamada aplicarOnda8CronogramaBoletos() em app.js — VARS.CRONOGRAMA_BOLETOS_FIXOS
// volta a vir só do literal local (vars-caixas.js), comportamento idêntico ao de antes desta Onda.

async function aplicarOnda8CronogramaBoletos(){
  let cronogramaV2;
  try {
    cronogramaV2 = await WallaceFinanceService.getCronogramaBoletosV2();
  } catch(err){
    console.error('Onda8CronogramaBoletos: falha ao buscar cronograma_boletos_fixos — mantendo o schedule V1 local (baixo risco, já rodou no boot).', err);
    window.WALLACE_ONDA8_CRONOGRAMA_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(cronogramaV2) || !cronogramaV2.length){
    console.warn('Onda8CronogramaBoletos: resposta vazia/inesperada — mantendo o schedule V1 local.');
    window.WALLACE_ONDA8_CRONOGRAMA_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const v1Total = Math.round(VARS.CRONOGRAMA_BOLETOS_FIXOS.reduce((s,b)=>s+b.valor,0)*100)/100;
  const v1Qtd = VARS.CRONOGRAMA_BOLETOS_FIXOS.length;

  VARS.CRONOGRAMA_BOLETOS_FIXOS = cronogramaV2.map(b => ({
    tx: b.tx, nome: b.nome, diaVencimento: b.dia_vencimento, valor: Number(b.valor),
  }));

  const v2Total = Math.round(VARS.CRONOGRAMA_BOLETOS_FIXOS.reduce((s,b)=>s+b.valor,0)*100)/100;
  const diverge = v1Qtd !== VARS.CRONOGRAMA_BOLETOS_FIXOS.length || Math.abs(v1Total - v2Total) > 0.01;

  // Re-roda o auto-crédito (V1, inalterada) com o schedule novo — idempotente por construção
  // (txJaLancados evita duplicar o que a 1ª passada síncrona do boot já tiver creditado).
  if(typeof aplicarBoletosVencidosAutomaticamente === 'function') aplicarBoletosVencidosAutomaticamente();
  VARS.caixaBoletos = calcularSaldoCaixa(VARS.BOLETOS_SALDO_INICIAL, VARS.BOLETOS_TRANSACOES);

  if(diverge) console.warn(`Onda8CronogramaBoletos: schedule V1 (${v1Qtd} itens, ${fmt(v1Total)}) × V2 (${VARS.CRONOGRAMA_BOLETOS_FIXOS.length} itens, ${fmt(v2Total)}) — DIVERGE. Se for uma edição intencional feita direto no Supabase, é esperado; se não, investigar.`);
  else console.log(`Onda8CronogramaBoletos: V1×V2 batem (${VARS.CRONOGRAMA_BOLETOS_FIXOS.length} boletos, ${fmt(v2Total)}). V2 é a fonte do schedule a partir de agora.`);

  window.WALLACE_ONDA8_CRONOGRAMA_RELATORIO = { qtdV1: v1Qtd, totalV1: v1Total, qtdV2: VARS.CRONOGRAMA_BOLETOS_FIXOS.length, totalV2: v2Total, diverge, exibindo: 'V2' };
}
