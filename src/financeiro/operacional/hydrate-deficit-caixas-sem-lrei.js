// MÓDULO: aplicarDeficitCaixasSemLrei() — política nova (09/08/2026, pedido explícito do usuário):
// caixas operacionais funcionam como "bolsões" de gasto temático (ex: comprar carne pro Churrasco no
// cartão debita a Caixa Churrasco mesmo sem saldo suficiente, fica negativa até ser coberta por LREI,
// reembolso, ou o aporte do dia 25). Até aqui, esse risco nunca era CONTABILIZADO em lugar nenhum — o
// card da caixa mostrava vermelho, mas a Necessidade Total Bruta (o número que diz "quanto precisa
// entrar este ciclo") não sabia que aquele buraco existia. Regra nova: caixa negativa SEM um LREI
// (empréstimo interno) ativo cobrindo o rombo soma a diferença na Necessidade Total Bruta, mesmo
// tratamento que Cobertura Garantida já recebe (ajuste em cima do total, não um 8º componente de
// totalOperacional — os 7 componentes documentados na Política seção 13 continuam intocados).
//
// Por que uma função própria em vez de plugar em aplicarOnda2V2/aplicarOnda4Lrei: essas duas rodam de
// forma independente e assíncrona (onDomPronto, sem await entre si) — depender da ordem de execução de
// uma delas é a mesma classe de bug já encontrada 2x nesta sessão (LEGENDAS sobrescrito por
// wallace_dados, PGV invisível pela regra antiga da view). Esta função busca os dois dados sozinha
// (Promise.all), sem depender de nenhuma das duas já ter rodado.
//
// Rollback: comentar a chamada onDomPronto(aplicarDeficitCaixasSemLrei) em app.js — necessidadeTotalBruta
// volta a ser só a soma dos 7 componentes de sempre.

async function aplicarDeficitCaixasSemLrei(){
  let saldos, emprestimos;
  try {
    [saldos, emprestimos] = await Promise.all([
      WallaceFinanceService.getSaldosPorCaixa(),
      WallaceFinanceService.getEmprestimosInternosV2(),
    ]);
  } catch(err){
    console.error('DeficitCaixasSemLrei: falha ao buscar saldo/LREI da V2 — ajuste NÃO aplicado nesta rodada (Necessidade Total Bruta fica sem o risco de caixas negativas).', err);
    window.WALLACE_DEFICIT_CAIXAS_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(saldos) || !Array.isArray(emprestimos)){
    console.warn('DeficitCaixasSemLrei: resposta inesperada da V2 — ajuste não aplicado.');
    window.WALLACE_DEFICIT_CAIXAS_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const r2 = x => Math.round(x*100)/100;

  // Soma de LREI ATIVO por caixa devedora (nome exato, mesmo campo já usado em hydrate-onda4-lrei.js).
  const lreiSuportePorCaixa = {};
  emprestimos.forEach(l => {
    if(l.status !== 'ATIVO') return;
    lreiSuportePorCaixa[l.devedora] = (lreiSuportePorCaixa[l.devedora] || 0) + Number(l.valor || 0);
  });

  const porCaixa = saldos
    .filter(c => c.caixa_tipo === 'operacional' && Number(c.v2_saldo_calculado) < 0)
    .map(c => {
      const saldo = Number(c.v2_saldo_calculado);
      const lrei = lreiSuportePorCaixa[c.caixa_nome] || 0;
      const deficit = Math.max(0, r2(-saldo - lrei));
      return { caixa: c.caixa_nome, saldo: r2(saldo), lreiSuporte: r2(lrei), deficit };
    })
    .filter(x => x.deficit > 0);

  const deficitTotal = r2(porCaixa.reduce((s,x) => s + x.deficit, 0));

  window.WALLACE_DEFICIT_CAIXAS_RELATORIO = { porCaixa, total: deficitTotal };
  console.log('DeficitCaixasSemLrei: relatório completo em window.WALLACE_DEFICIT_CAIXAS_RELATORIO', window.WALLACE_DEFICIT_CAIXAS_RELATORIO);

  if(deficitTotal <= 0) return; // nada a ajustar, nenhuma caixa operacional negativa sem LREI

  // Mesma cascata de recalcular-necessidade.js (necessidadeTotalBruta -> necessidadeLiquida/saldoCiclo/
  // modoOperacional) - reaplicada aqui porque o ajuste entra DEPOIS que essas funções já rodaram no
  // boot síncrono.
  REG.operacional.necessidadeTotalBruta = r2(REG.operacional.necessidadeTotalBruta + deficitTotal);
  REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  REG.operacional.saldoCiclo = r2(REG.balanco.fluxo.entradas - REG.operacional.necessidadeTotalBruta);
  REG.balanco.fluxo.saidas = REG.operacional.necessidadeTotalBruta;
  REG.balanco.fluxo.resultado = r2(REG.balanco.fluxo.entradas - REG.balanco.fluxo.saidas);
  if(REG.operacional.saldoCiclo < 0) REG.operacional.modoOperacional = 'Crítico';
  else if(REG.operacional.saldoCiclo < 3000) REG.operacional.modoOperacional = 'Baixo';
  else if(REG.operacional.saldoCiclo < 8000) REG.operacional.modoOperacional = 'Normal';
  else REG.operacional.modoOperacional = 'Alto';
  if(REG.superavitNormal && Array.isArray(REG.superavitNormal.necessidade)) REG.superavitNormal.necessidade[0] = REG.operacional.necessidadeTotalBruta;

  if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
  if(typeof hydrateBalanco === 'function') hydrateBalanco();

  console.warn(`DeficitCaixasSemLrei: +${fmt(deficitTotal)} somado à Necessidade Total Bruta (${porCaixa.length} caixa(s) negativa(s) sem LREI de suporte: ${porCaixa.map(x=>x.caixa+' '+fmt(x.deficit)).join(', ')}).`);
}
