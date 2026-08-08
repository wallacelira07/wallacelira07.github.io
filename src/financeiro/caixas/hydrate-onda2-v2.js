// MÓDULO: Onda 2 da migração V2 → Painel (08/08/2026) — mesmo modelo da Onda 1
// (hydrate-onda1-v2.js), estendido pras 11 caixas restantes + diagnóstico do Livro Razão.
//
// DIFERENÇA-CHAVE em relação à Onda 1: lá, os 4 alvos já estavam com diferença 0 confirmada
// antes de escrever qualquer código, então o overlay era incondicional. Aqui, checagem ao
// vivo (08/08/2026) mostrou que NENHUMA das 11 caixas está com V1×V2=0 hoje — 6 têm resíduo
// de um item AJUSTE-06-08 (rendimento de cofrinho sem comprovante diário, excluído de
// propósito de sincronizar_v1_v2() — Política Interna §31) e 5 têm causa indeterminada,
// baixa confiança (mesma classe do caso Boletos/TX000140 antes de resolvido). Por isso o
// overlay aqui é CONDICIONAL: só troca o texto pra V2 se |V1−V2|<=0,01; senão mantém V1 e
// só loga a divergência (nunca esconde). Resultado esperado nesta rodada: 0 das 11 migram
// de fato pra exibição V2 — mas o mecanismo fica pronto e promove sozinho, sem novo deploy
// de lógica, assim que cada divergência real fechar (seja por sincronizar_v1_v2() futuro,
// seja por investigação dedicada tipo TX000140).
//
// Provisionado Wärtsilä fica de fora do overlay de propósito — card com 4 estados de texto
// (não um número simples), e a V2 ainda não tem equivalente pro campo "fatura" (ver
// PLANO_UNIFICACAO_V1_V2.md seção 22, gap D). Só compara e loga, nunca escreve no DOM dele.
//
// Rollback: comentar a chamada aplicarOnda2V2() em app.js — nada mais muda.

const ONDA2_V2_MAPA = [
  { idHtml: 'cxBensDuraveisSaldo', caixaNome: 'Caixa Bens Duráveis', getValorV1: () => REG.caixasOperacionais.bensDuraveis.saldo },
  { idHtml: 'cxEventosSaldo', caixaNome: 'Caixa Eventos', getValorV1: () => REG.caixasOperacionais.eventos.saldo },
  { idHtml: 'cxSeguroSaldo', caixaNome: 'Caixa Seguro Emplacamento', getValorV1: () => REG.caixasOperacionais.seguroEmplacamento.saldo },
  { idHtml: 'cxEscolaSaldo', caixaNome: 'Escola de Júlio', getValorV1: () => REG.escolaJulioSaldo },
  { idHtml: 'cxPgvSaldo', caixaNome: 'PIX Geral Vanessa', getValorV1: () => VARS.pixGeralVanessaSaldo },
  { idHtml: 'cxSaudeSaldo', caixaNome: 'Caixa Saúde Família', getValorV1: () => REG.caixasOperacionais.saudeFamilia.saldo },
  { idHtml: 'cxManutSaldo', caixaNome: 'Caixa Manutenção', getValorV1: () => REG.caixasOperacionais.manutencao.saldo },
  { idHtml: 'cxAnivSaldo', caixaNome: 'Caixa Aniversário Júlio', getValorV1: () => REG.caixasOperacionais.aniversarioJulio.saldo },
  { idHtml: 'balResChurrasco', caixaNome: 'Caixa Churrasco', getValorV1: () => REG.balanco.reservas.churrasco },
  { idHtml: 'balResCombustivel', caixaNome: 'Caixa Combustível', getValorV1: () => REG.balanco.reservas.combustivel },
  // log-only: sem idHtml -> nunca escreve no DOM, só compara e loga
  { idHtml: null, caixaNome: 'Provisionado Wärtsilä', getValorV1: () => VARS.provisionadoWartsila },
];

const TOLERANCIA_CENTAVOS = 0.01;

async function aplicarOnda2V2(){
  let saldosV2;
  try {
    saldosV2 = await WallaceFinanceService.getSaldosPorCaixa();
  } catch(err){
    console.error('Onda2V2: falha ao buscar vw_saldo_v2_por_caixa — mantendo V1 em todas as 11 caixas (fallback automático).', err);
    return;
  }
  if(!Array.isArray(saldosV2)){
    console.warn('Onda2V2: resposta inesperada de vw_saldo_v2_por_caixa — mantendo V1 em todas.');
    return;
  }
  const relatorio = [];
  ONDA2_V2_MAPA.forEach(({idHtml, caixaNome, getValorV1}) => {
    const caixaV2 = saldosV2.find(c => c.caixa_nome === caixaNome);
    if(!caixaV2 || caixaV2.v2_saldo_calculado === null || caixaV2.v2_saldo_calculado === undefined){
      console.warn(`Onda2V2: "${caixaNome}" ausente/sem saldo em vw_saldo_v2_por_caixa — mantendo V1.`);
      relatorio.push({ caixa: caixaNome, status: 'sem_dado_v2' });
      return;
    }
    let valorV1;
    try { valorV1 = Math.round(getValorV1() * 100) / 100; }
    catch(err){ console.warn(`Onda2V2: falha ao ler valor V1 de referência pra "${caixaNome}", comparação pulada.`, err); valorV1 = null; }
    const valorV2 = Math.round(Number(caixaV2.v2_saldo_calculado) * 100) / 100;
    const diverge = valorV1 === null || Math.abs(valorV1 - valorV2) > TOLERANCIA_CENTAVOS;
    const diferenca = valorV1 !== null ? Math.round((valorV1 - valorV2)*100)/100 : null;

    if(diverge){
      console.warn(`Onda2V2 [${caixaNome}]: V1=${valorV1!==null?fmt(valorV1):'?'} × V2=${fmt(valorV2)} — DIVERGE${diferenca!==null?' R$'+Math.abs(diferenca).toFixed(2):''}. Mantendo V1 (fallback), nada exibido da V2 pra esta caixa ainda.`);
      relatorio.push({ caixa: caixaNome, v1: valorV1, v2: valorV2, diverge: true, diferenca, exibindo: 'V1 (fallback)' });
      return; // NUNCA sobrescreve o DOM quando diverge — regra central desta onda
    }

    console.log(`Onda2V2 [${caixaNome}]: V1×V2 batem (${fmt(valorV2)}).`);
    relatorio.push({ caixa: caixaNome, v1: valorV1, v2: valorV2, diverge: false, diferenca: 0, exibindo: idHtml ? 'V2' : 'V1 (log-only, sem card simples)' });

    if(!idHtml) return; // Wärtsilä: só loga, nunca escreve (card complexo, ver comentário do topo)
    const el = $(idHtml);
    if(!el){ console.warn(`Onda2V2: id "${idHtml}" não encontrado no DOM, ignorado.`); return; }
    el.textContent = fmt(valorV2);
  });
  window.WALLACE_ONDA2_V2_RELATORIO = relatorio;
  console.log('Onda2V2: relatório completo em window.WALLACE_ONDA2_V2_RELATORIO', relatorio);
}

// LIVRO RAZÃO — FASE 1 (só diagnóstico, ZERO mudança de renderização, pedido explícito do
// usuário). Reaproveita vw_reconciliacao_v1_v2 (já traz qtd de transações e valor das
// diferenças V1×V2 por caixa) em vez de somar os arrays na mão no cliente — mesma fonte já
// validada a sessão inteira, sem reimplementar comparação que já existe no banco.
const LIVRO_RAZAO_FASE1_CAIXAS = [
  'Caixa Lance','Caixa Manutenção','Caixa Aniversário Júlio','Caixa Eventos','Caixa Saúde Família',
  'Caixa Seguro Emplacamento','Caixa Combustível','Caixa Churrasco','Caixa Mastercard/Infinite',
  'PIX Vanessa','PIX Geral Vanessa','Caixa Bens Duráveis','Caixa Boletos','Caixa Variável','Escola de Júlio'
];

async function diagnosticoLivroRazaoFase1(){
  let recon;
  try {
    recon = await WallaceFinanceService.getReconciliacaoPorCaixa();
  } catch(err){
    console.error('LivroRazaoFase1: falha ao buscar vw_reconciliacao_v1_v2 — diagnóstico pulado, renderização V1 do Livro Razão inalterada.', err);
    return;
  }
  if(!Array.isArray(recon)){
    console.warn('LivroRazaoFase1: resposta inesperada — diagnóstico pulado.');
    return;
  }
  const diagnostico = LIVRO_RAZAO_FASE1_CAIXAS.map(nome => {
    const r = recon.find(c => c.caixa_nome === nome);
    if(!r) return { caixa: nome, status: 'sem_dado_reconciliacao' };
    return {
      caixa: nome,
      qtd_v1: r.v1_qtd_transacoes,
      qtd_v2: r.v2_qtd_transacoes,
      qtd_bate: r.v1_qtd_transacoes === r.v2_qtd_transacoes,
      valor_so_no_v1: Number(r.valor_transacoes_so_no_v1) || 0,
      valor_so_na_v2: Number(r.valor_transacoes_so_na_v2) || 0,
      diferenca_saldo: Number(r.diferenca_absoluta),
      causa_provavel: r.causa_provavel,
    };
  });
  window.WALLACE_LIVRO_RAZAO_DIAGNOSTICO = diagnostico;
  console.log('LivroRazaoFase1 (diagnóstico apenas, renderização V1 inalterada): window.WALLACE_LIVRO_RAZAO_DIAGNOSTICO', diagnostico);
  const comQtdDiferente = diagnostico.filter(d => d.qtd_bate === false);
  if(comQtdDiferente.length){
    console.warn(`LivroRazaoFase1: ${comQtdDiferente.length} caixa(s) com quantidade de transações V1≠V2:`, comQtdDiferente.map(d => d.caixa));
  }
}
