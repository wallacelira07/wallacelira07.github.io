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
// PIX Geral Vanessa PROMOVIDA pra V2 em 09/08/2026 (investigação Nível A completa, ver
// docs/changelog/PASSAGEM_DE_TURNO.md): causa raiz dos R$121,97 corrigida (TX000219/221
// tinham caixa_id errado, corrigido); hipótese do R$338,00 encerrada (era valor órfão em
// wallace_dados, nunca chegava à tela — confirmado em navegador real, o site já mostrava
// R$50,69, o valor V1 recalculado de verdade); resíduo de R$256,00 explicado e aceito como
// consequência esperada da transição (lançamentos que só nascem na V2 hoje). Usuário decidiu
// que a PGV não é mais exceção técnica — sai da lista `false`, entra na `true`.
//
// Provisionado Wärtsilä fica de fora deste mapa — é 100% V2 desde a Onda 4
// (hydrate-onda4-wartsila.js:50, `REG.wartsilaCaixa.provisionado = caixaWartsila.v2_saldo_calculado`).
// CORRIGIDO 13/08/2026 (pedido explícito do usuário): removida a entrada log-only que comparava
// contra VARS.provisionadoWartsila (V1) só pra imprimir aviso de divergência no console — a
// migração V1→V2 está formalmente encerrada, V1 não é mais referência nenhuma pra essa caixa.
//
// Rollback: comentar a chamada aplicarOnda2V2() em app.js — nada mais muda.

// ACHADO (08/08/2026, mesma classe do caso Boletos/Onda 1): estas 4 caixas têm DOIS ids de
// DOM pro mesmo saldo — o card da seção 05 (já migrado abaixo) e a linha delas na seção
// "Reservas" do Balanço (hydrate-balanco.js, ids balRes*) — só o card estava na lista.
// extraId reaproveita o mesmo valorV2 já resolvido, sem fetch novo.
const ONDA2_V2_MAPA = [
  {
    idHtml: 'cxBensDuraveisSaldo', extraId: 'balResBensDuraveis', caixaNome: 'Caixa Bens Duráveis', getValorV1: () => REG.caixasOperacionais.bensDuraveis.saldo, aceitarDivergenciaConhecida: true,
    // Bens Duráveis pode ficar negativo (compra sem reserva prévia) — barra fixa em 0% nesse caso,
    // mesmo tratamento que hydrateCaixas() já dava (Math.max(0,...)). CORRIGIDO 09/08/2026 (achado
    // do usuário: card negativo aparecia sem vermelho): hydrateCaixas() já pinta a cor certa, mas
    // roda ANTES desta Onda sobrescrever o número — sem re-sincronizar aqui, a cor fica presa no
    // valor V1 do boot. Mesma classe de bug já corrigida em hydrate-onda4-wartsila.js/patrimonio.
    extra: (valorV2) => {
      const meta = REG.caixasOperacionais.bensDuraveis.meta;
      const barEl = $('cxBensDuraveisBar'); if(barEl) barEl.style.width = Math.max(0, pctOf(valorV2, meta))+'%';
      const saldoEl = $('cxBensDuraveisSaldo'); if(saldoEl) saldoEl.style.color = valorV2 < 0 ? 'var(--red)' : 'var(--green)';
    },
  },
  {
    idHtml: 'cxEventosSaldo', extraId: 'balResEventos', caixaNome: 'Caixa Eventos', getValorV1: () => REG.caixasOperacionais.eventos.saldo, aceitarDivergenciaConhecida: true,
    extra: (valorV2) => {
      const meta = REG.caixasOperacionais.eventos.meta;
      const pctTxt = pctOf(valorV2, meta).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%';
      const pctEl = $('cxEventosPct'); if(pctEl) pctEl.textContent = pctTxt;
      const barEl = $('cxEventosBar'); if(barEl) barEl.style.width = pctOf(valorV2, meta)+'%';
    },
  },
  {
    idHtml: 'cxSeguroSaldo', extraId: 'balResSeguro', caixaNome: 'Caixa Seguro Emplacamento', getValorV1: () => REG.caixasOperacionais.seguroEmplacamento.saldo, aceitarDivergenciaConhecida: true,
    extra: (valorV2) => {
      const meta = REG.caixasOperacionais.seguroEmplacamento.meta;
      const barEl = $('cxSeguroBar'); if(barEl) barEl.style.width = pctOf(valorV2, meta)+'%';
    },
  },
  {
    // ACHADO adicional: Escola de Júlio também tem barra de meta (cxEscolaPct/cxEscolaBar,
    // mesmo padrão do caso Boletos) + badge no Resumo Executivo (r21EscolaJulio) — os 3 ainda
    // liam pctOf(V1, meta). Meta (REG.patrimonio.metaEscolaJulio) é constante, não vem de
    // wallace_dados.
    idHtml: 'cxEscolaSaldo', extraId: 'balResEscola', caixaNome: 'Escola de Júlio', getValorV1: () => REG.escolaJulioSaldo, aceitarDivergenciaConhecida: true,
    extra: (valorV2) => {
      const meta = REG.patrimonio.metaEscolaJulio;
      const pctTxt = pctOf(valorV2, meta).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%';
      const pctEl = $('cxEscolaPct'); if(pctEl) pctEl.textContent = pctTxt;
      const barEl = $('cxEscolaBar'); if(barEl) barEl.style.width = pctOf(valorV2, meta)+'%';
      const r21El = $('r21EscolaJulio'); if(r21El) r21El.textContent = pctTxt;
    },
  },
  {
    idHtml: 'cxPgvSaldo', extraId: 'balOpPixVanessa', caixaNome: 'PIX Geral Vanessa', getValorV1: () => VARS.pixGeralVanessaSaldo, aceitarDivergenciaConhecida: true,
    // Achado ao promover (09/08/2026): cxPgvBar/cxPgvPct eram calculados só em hydrate-caixas.js
    // (V1, meta fixa REG.caixasOperacionais.pixGeralVanessa.meta) e nunca reaproveitados aqui -
    // ficariam mostrando a % antiga (baseada em V1) junto do saldo novo (V2), inconsistente.
    // Texto do % NÃO usa pctOf() (que capa em 100 - convenção do resto do projeto): pedido
    // explícito do usuário pra PGV, já que passar da meta é informação real (caixa reforçada
    // acima do normal), não deveria ficar escondida atrás de um "100,0%" enganoso. A BARRA
    // continua capada em 100%, só o texto mostra o valor real.
    extra: (valorV2) => {
      const meta = REG.caixasOperacionais.pixGeralVanessa.meta;
      const pctReal = meta > 0 ? valorV2 / meta * 100 : 0;
      const pctTxt = pctReal.toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%';
      const pctEl = $('cxPgvPct'); if(pctEl) pctEl.textContent = pctTxt;
      const barEl = $('cxPgvBar'); if(barEl) barEl.style.width = Math.min(100, pctReal)+'%';
    },
  },
  // PROMOVIDAS 09/08/2026 (investigação "matar V1"): mesma causa raiz da Manutenção — Saúde
  // Família tinha TX000213 preso em pendente_classificacao + AJUSTE-06-08 nunca migrado;
  // Aniversário Júlio tinha TX000208 e AJUSTE-06-08 nunca migrados. Ambas fecharam em R$0,00
  // de resíduo (causa_provavel='sincronizado', alta confiança) depois da correção.
  { idHtml: 'cxSaudeSaldo', caixaNome: 'Caixa Saúde Família', getValorV1: () => REG.caixasOperacionais.saudeFamilia.saldo, aceitarDivergenciaConhecida: true },
  // PROMOVIDA 09/08/2026 (investigação "matar V1"): causa raiz da divergência de R$345,73
  // encontrada e confirmada com alta confiança (vw_reconciliacao_v1_v2.causa_provavel) — 2
  // transações reais (TX000214 "Cortinas" -R$450, TX000215 empréstimo LREI0004 +R$103,55),
  // já mostradas ao usuário no V1 há dias, estavam presas em status='pendente_classificacao'
  // na V2 (vw_saldo_v2_por_caixa só soma status='confirmado') — corrigido via UPDATE direto
  // (mesmas 2 + o par espelhado TX000212/TX000216 da Caixa Lance, ver PASSAGEM_DE_TURNO.md).
  // Resíduo de R$0,72 fechado de vez (09/08/2026, achado real: era o mesmo AJUSTE-06-08 —
  // rendimento real, nunca inserido — já visto em 5 outras caixas). NAQUELE momento era R$0,00
  // real. ATENÇÃO (achado de auditoria 18/08/2026): já voltou a divergir (R$1,07 medido em
  // 18/08) — mesmo padrão esperado das outras caixas pós-migração (V2 recebe lançamento novo, V1
  // estático não acompanha). Não afeta o que o usuário vê (aceitarDivergenciaConhecida:true já
  // exibe o saldo V2 correto), mas não tratar "R$0,00 real" como medição válida hoje sem reconferir.
  { idHtml: 'cxManutSaldo', caixaNome: 'Caixa Manutenção', getValorV1: () => REG.caixasOperacionais.manutencao.saldo, aceitarDivergenciaConhecida: true },
  { idHtml: 'cxAnivSaldo', caixaNome: 'Caixa Aniversário Júlio', getValorV1: () => REG.caixasOperacionais.aniversarioJulio.saldo, aceitarDivergenciaConhecida: true },
  { idHtml: 'balResChurrasco', caixaNome: 'Caixa Churrasco', getValorV1: () => REG.balanco.reservas.churrasco, aceitarDivergenciaConhecida: true },
  { idHtml: 'balResCombustivel', caixaNome: 'Caixa Combustível', getValorV1: () => REG.balanco.reservas.combustivel, aceitarDivergenciaConhecida: true },
];

const TOLERANCIA_CENTAVOS = 0.01;

// ENDURECIDO (08/08/2026, Wave A): só os itens com aceitarDivergenciaConhecida=true (já
// exibem V2 hoje) viram "⚠ Indisponível (V2)" em caso de falha — são domínio V2-exclusivo
// de fato. Itens com aceitarDivergenciaConhecida=false NÃO são tocados aqui: divergência não
// confirmada, continuam em V1 silencioso até uma decisão explícita mudar o status deles na
// tabela acima (hoje nenhum item está nesse estado — todos os restantes já foram promovidos).
const ONDA2_HARDEN_IDS = ONDA2_V2_MAPA.filter(m => m.aceitarDivergenciaConhecida && m.idHtml)
  .flatMap(m => m.extraId ? [m.idHtml, m.extraId] : [m.idHtml]);

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
  ONDA2_V2_MAPA.forEach(({idHtml, extraId, extra, caixaNome, getValorV1, aceitarDivergenciaConhecida}) => {
    const caixaV2 = saldosV2.find(c => c.caixa_nome === caixaNome);
    if(!caixaV2 || caixaV2.v2_saldo_calculado === null || caixaV2.v2_saldo_calculado === undefined){
      console.warn(`Onda2V2: "${caixaNome}" ausente/sem saldo em vw_saldo_v2_por_caixa — mantendo V1.`);
      if(aceitarDivergenciaConhecida && idHtml){
        marcarIndisponivelV2(extraId ? [idHtml, extraId] : [idHtml], `"${caixaNome}" ausente em vw_saldo_v2_por_caixa`);
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
    if(extraId){
      const extraEl = $(extraId);
      if(extraEl) extraEl.textContent = fmt(valorV2);
      else console.warn(`Onda2V2: extraId "${extraId}" não encontrado no DOM, ignorado.`);
    }
    if(typeof extra === 'function'){
      try { extra(valorV2); }
      catch(err){ console.warn(`Onda2V2 [${caixaNome}]: falha ao aplicar overrides extras (meta/barra).`, err); }
    }
  });
  window.WALLACE_ONDA2_V2_RELATORIO = relatorio;
  console.log('Onda2V2: relatório completo em window.WALLACE_ONDA2_V2_RELATORIO', relatorio);
  // Re-chama hydrateQualidade() (09/08/2026) — o alerta da PGV/PV nas "Verificações de Negócio"
  // agora prefere o valor deste relatório quando disponível, mesmo padrão já usado em
  // hydrate-onda7-pluggy.js/hydrate-onda4-lrei.js.
  if(typeof hydrateQualidade === 'function') hydrateQualidade();

  // CORRIGIDO 10/08/2026 (achado do usuário, varredura completa de gráficos): esta função só
  // sobrescrevia texto do DOM — REG.caixasOperacionais[k].saldo (fonte do gráfico g_cCaixas,
  // "Caixas operacionais vs metas") nunca era atualizado, mesma classe de bug já corrigida em
  // Patrimônio/Caixa Variável/Necessidade. Mapa caixaNome→chave cobre só as 7 caixas deste
  // arquivo que têm par em REG.caixasOperacionais (Churrasco/Combustível/PGV não têm — usam
  // outros campos, fora do escopo deste gráfico).
  const CAIXA_NOME_PARA_CHAVE = {
    'Caixa Bens Duráveis': 'bensDuraveis', 'Caixa Eventos': 'eventos', 'Caixa Seguro Emplacamento': 'seguroEmplacamento',
    'Escola de Júlio': 'escolaJulio', 'Caixa Saúde Família': 'saudeFamilia', 'Caixa Manutenção': 'manutencao',
    'Caixa Aniversário Júlio': 'aniversarioJulio',
  };
  relatorio.forEach(r => {
    if(r.exibindo !== 'V2') return;
    const chave = CAIXA_NOME_PARA_CHAVE[r.caixa];
    if(chave && REG.caixasOperacionais[chave]) REG.caixasOperacionais[chave].saldo = r.v2;
  });
  if(typeof atualizarGraficoCaixas === 'function') atualizarGraficoCaixas();
}

// LIVRO RAZÃO — FASE 1 (só diagnóstico, ZERO mudança de renderização, pedido explícito do
// usuário). Reaproveita vw_reconciliacao_v1_v2 (já traz qtd de transações e valor das
// diferenças V1×V2 por caixa) em vez de somar os arrays na mão no cliente — mesma fonte já
// validada a sessão inteira, sem reimplementar comparação que já existe no banco.
const LIVRO_RAZAO_FASE1_CAIXAS = [
  'Caixa Lance','Caixa Manutenção','Caixa Aniversário Júlio','Caixa Eventos','Caixa Saúde Família',
  'Caixa Seguro Emplacamento','Caixa Combustível','Caixa Churrasco','Caixa Mastercard_Infinite',
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
