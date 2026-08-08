// MÓDULO: Onda 2 da migração V2 → Painel (08/08/2026) — mesmo modelo da Onda 1
// (hydrate-onda1-v2.js), estendido pras 11 caixas restantes + diagnóstico do Livro Razão.
//
// REGRA ATUALIZADA (08/08/2026, mudança de critério pedida pelo usuário): "divergência
// conhecida e documentada != bloqueador de migração; ausência de estrutura V2 = bloqueador
// real". Cada item do mapa agora tem `aceitarDivergenciaConhecida`:
//   true  -> causa raiz confirmada e documentada (ex: item AJUSTE-06-08 pendente de sync,
//            Política Interna §31) -> exibe V2 mesmo com diferença, loga como "aceita".
//   false -> causa indeterminada/baixa confiança (mesma classe do caso Boletos/TX000140
//            antes de resolvido) -> continua bloqueado, mantém V1, loga divergência sem
//            esconder. Decisão explícita do usuário (08/08/2026): Manutenção, Saúde
//            Família, PIX Geral Vanessa e Aniversário Júlio ficam de fora por enquanto —
//            diferenças grandes (R$107 a R$346) sem causa raiz confirmada, diferente do
//            AJUSTE-06-08 que já tem explicação.
//
// Provisionado Wärtsilä fica de fora do overlay independente da causa — card com 4 estados
// de texto (não um número simples), e a V2 ainda não tem equivalente pro campo "fatura"
// (PLANO_UNIFICACAO_V1_V2.md seção 22, gap D — falta de ESTRUTURA, não só divergência). Só
// compara e loga, nunca escreve no DOM dele.
//
// Rollback: comentar a chamada aplicarOnda2V2() em app.js — nada mais muda.

const ONDA2_V2_MAPA = [
  { idHtml: 'cxBensDuraveisSaldo', caixaNome: 'Caixa Bens Duráveis', getValorV1: () => REG.caixasOperacionais.bensDuraveis.saldo, aceitarDivergenciaConhecida: true },
  { idHtml: 'cxEventosSaldo', caixaNome: 'Caixa Eventos', getValorV1: () => REG.caixasOperacionais.eventos.saldo, aceitarDivergenciaConhecida: true },
  { idHtml: 'cxSeguroSaldo', caixaNome: 'Caixa Seguro Emplacamento', getValorV1: () => REG.caixasOperacionais.seguroEmplacamento.saldo, aceitarDivergenciaConhecida: true },
  { idHtml: 'cxEscolaSaldo', caixaNome: 'Escola de Júlio', getValorV1: () => REG.escolaJulioSaldo, aceitarDivergenciaConhecida: true },
  { idHtml: 'cxPgvSaldo', caixaNome: 'PIX Geral Vanessa', getValorV1: () => VARS.pixGeralVanessaSaldo, aceitarDivergenciaConhecida: false },
  { idHtml: 'cxSaudeSaldo', caixaNome: 'Caixa Saúde Família', getValorV1: () => REG.caixasOperacionais.saudeFamilia.saldo, aceitarDivergenciaConhecida: false },
  { idHtml: 'cxManutSaldo', caixaNome: 'Caixa Manutenção', getValorV1: () => REG.caixasOperacionais.manutencao.saldo, aceitarDivergenciaConhecida: false },
  { idHtml: 'cxAnivSaldo', caixaNome: 'Caixa Aniversário Júlio', getValorV1: () => REG.caixasOperacionais.aniversarioJulio.saldo, aceitarDivergenciaConhecida: false },
  { idHtml: 'balResChurrasco', caixaNome: 'Caixa Churrasco', getValorV1: () => REG.balanco.reservas.churrasco, aceitarDivergenciaConhecida: true },
  { idHtml: 'balResCombustivel', caixaNome: 'Caixa Combustível', getValorV1: () => REG.balanco.reservas.combustivel, aceitarDivergenciaConhecida: true },
  // log-only: sem idHtml -> nunca escreve no DOM, mesmo com aceitarDivergenciaConhecida=true (falta ESTRUTURA, não só divergência)
  { idHtml: null, caixaNome: 'Provisionado Wärtsilä', getValorV1: () => VARS.provisionadoWartsila, aceitarDivergenciaConhecida: false },
];

const TOLERANCIA_CENTAVOS = 0.01;

// ENDURECIDO (08/08/2026, Wave A): só os itens com aceitarDivergenciaConhecida=true (já
// exibem V2 hoje) viram "⚠ Indisponível (V2)" em caso de falha — são domínio V2-exclusivo
// de fato. Os 4 com aceitarDivergenciaConhecida=false (PGV, Saúde Família, Manutenção,
// Aniversário Júlio) e o Provisionado Wärtsilä (log-only) NÃO são tocados aqui: divergência
// não confirmada, usuário proibiu reabrir essa investigação — continuam em V1 silencioso
// até uma decisão explícita mudar o status deles na tabela acima.
const ONDA2_HARDEN_IDS = ONDA2_V2_MAPA.filter(m => m.aceitarDivergenciaConhecida && m.idHtml).map(m => m.idHtml);

async function aplicarOnda2V2(){
  let saldosV2;
  try {
    saldosV2 = await WallaceFinanceService.getSaldosPorCaixa();
  } catch(err){
    console.error('Onda2V2: falha ao buscar vw_saldo_v2_por_caixa — caixas V2-exclusivas ficam "Indisponível (V2)"; as 4 protegidas (divergência não confirmada) mantêm V1 silencioso.', err);
    marcarIndisponivelV2(ONDA2_HARDEN_IDS, 'Falha ao buscar vw_saldo_v2_por_caixa (Onda 2)');
    window.WALLACE_ONDA2_V2_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(saldosV2)){
    console.warn('Onda2V2: resposta inesperada de vw_saldo_v2_por_caixa.');
    marcarIndisponivelV2(ONDA2_HARDEN_IDS, 'Resposta inesperada de vw_saldo_v2_por_caixa (Onda 2)');
    window.WALLACE_ONDA2_V2_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }
  const relatorio = [];
  ONDA2_V2_MAPA.forEach(({idHtml, caixaNome, getValorV1, aceitarDivergenciaConhecida}) => {
    const caixaV2 = saldosV2.find(c => c.caixa_nome === caixaNome);
    if(!caixaV2 || caixaV2.v2_saldo_calculado === null || caixaV2.v2_saldo_calculado === undefined){
      console.warn(`Onda2V2: "${caixaNome}" ausente/sem saldo em vw_saldo_v2_por_caixa — mantendo V1.`);
      if(aceitarDivergenciaConhecida && idHtml){
        marcarIndisponivelV2([idHtml], `"${caixaNome}" ausente em vw_saldo_v2_por_caixa`);
      }
      relatorio.push({ caixa: caixaNome, status: 'sem_dado_v2' });
      return;
    }
    let valorV1;
    try { valorV1 = Math.round(getValorV1() * 100) / 100; }
    catch(err){ console.warn(`Onda2V2: falha ao ler valor V1 de referência pra "${caixaNome}", comparação pulada.`, err); valorV1 = null; }
    const valorV2 = Math.round(Number(caixaV2.v2_saldo_calculado) * 100) / 100;
    const diverge = valorV1 === null || Math.abs(valorV1 - valorV2) > TOLERANCIA_CENTAVOS;
    const diferenca = valorV1 !== null ? Math.round((valorV1 - valorV2)*100)/100 : null;
    const podeExibirV2 = idHtml && (!diverge || aceitarDivergenciaConhecida) && valorV1 !== null;

    if(diverge){
      const motivo = aceitarDivergenciaConhecida
        ? 'divergência conhecida e documentada (aceita pela regra de 08/08/2026) — exibindo V2 mesmo assim.'
        : 'causa indeterminada/baixa confiança — mantendo V1 (fallback), nada exibido da V2 pra esta caixa ainda.';
      console.warn(`Onda2V2 [${caixaNome}]: V1=${valorV1!==null?fmt(valorV1):'?'} × V2=${fmt(valorV2)} — DIVERGE${diferenca!==null?' R$'+Math.abs(diferenca).toFixed(2):''}. ${motivo}`);
    } else {
      console.log(`Onda2V2 [${caixaNome}]: V1×V2 batem (${fmt(valorV2)}).`);
    }
    relatorio.push({ caixa: caixaNome, v1: valorV1, v2: valorV2, diverge, diferenca, exibindo: podeExibirV2 ? 'V2' : (idHtml ? 'V1 (fallback)' : 'V1 (log-only, sem card simples)') });

    if(!podeExibirV2) return;
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
