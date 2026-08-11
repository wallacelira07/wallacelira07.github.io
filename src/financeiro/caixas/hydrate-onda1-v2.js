// MÓDULO: Onda 1 da migração V2 → Painel (08/08/2026) — leitura paralela V1×V2 para os
// 4 cards já reconciliados (Caixa Mastercard/Infinite, Caixa Variável [saldo real],
// PIX Vanessa, Caixa Boletos). NÃO remove nem altera a lógica V1 — hydrateCaixas()/
// hydrateResumoP2P()/hydrateBalanco() continuam 100% intactas, calculando e escrevendo
// o valor V1 normalmente. Esta função roda DEPOIS delas, dentro de hydrate() (app.js),
// e SOBRESCREVE o texto desses 4 ids com o valor vindo de vw_saldo_v2_por_caixa (V2),
// depois de comparar e logar qualquer divergência no console.
//
// ENDURECIDO (08/08/2026, Wave A): domínio agora é V2-exclusivo, mesmo padrão dos 6
// domínios Onda 4/5 — falha de fetch/estrutura ausente já não deixa o V1 "por baixo"
// silenciosamente; usa marcarIndisponivelV2() pra virar "⚠ Indisponível (V2)" visível.
//
// Rollback imediato: comentar a chamada aplicarOnda1V2() em app.js (hydrate()) — o V1
// volta a ser o único valor exibido, nenhum outro arquivo precisa mudar.
//
// Client único: usa WallaceFinanceService (definido em app.js) — já é a consolidação
// da API pública de src/services/FinanceService.js feita numa sessão anterior (ver
// comentário em app.js, bloco "WallaceFinanceService"). Não importa FinanceService.js
// (ES module) diretamente porque app.js é script clássico com onclick= inline no HTML —
// virar type="module" quebraria todos eles, risco fora do escopo desta onda.
//
// Fonte V1 pra comparação: lida direto de REG/VARS (mesma fonte que hydrateCaixas/
// hydrateResumoP2P/hydrateBalanco já usaram pra escrever o valor original) — não faz
// parsing de texto do DOM (frágil, formato "R$ 1.234,56").
//
// Fonte V2: vw_saldo_v2_por_caixa (via WallaceFinanceService.getSaldosPorCaixa()) — NÃO
// rpc_dashboard_resumo(). Achado ao vivo (08/08/2026): o campo "saldo" da RPC soma toda
// transação da caixa sem filtro de ciclo/afeta_saldo_real (dava -1.802,00 pra Boletos em
// vez de 1.488,42); o campo "saldo_real_ciclo_atual" da mesma RPC diverge pra PIX Vanessa
// (180,91 em vez de 302,88). A view usada aqui é a mesma validada a sessão inteira contra
// vw_reconciliacao_v1_v2 — bate exato pras 4 caixas antes de qualquer código rodar.
// ACHADO (08/08/2026, investigação CRONOGRAMA_BOLETOS_FIXOS/BOLETOS_TRANSACOES): 3 outros ids
// além de cxBoletosSaldo continuavam mostrando o valor V1 puro da Caixa Boletos (simulado por
// aplicarBoletosVencidosAutomaticamente() em app.js, a partir de CRONOGRAMA_BOLETOS_FIXOS) —
// a barra de meta (cxBoletosPct/cxBoletosBar, seção 05) e a linha do Balanço Operacional
// (balResBoletos). A meta (REG.caixasOperacionais.boletos.meta) é uma constante fixa (2600), não
// vem de wallace_dados — só o saldo usado no cálculo do % precisava virar V2. Sem fetch novo:
// reaproveita o mesmo saldosV2 já buscado abaixo para os outros 4 ids.
const pctOf = (s,m) => m>0 ? Math.min(100, s/m*100) : 0;
const ONDA1_V2_MAPA = [
  {
    idHtml: 'cxBoletosSaldo', caixaNome: 'Caixa Boletos', getValorV1: () => REG.caixasOperacionais.boletos.saldo,
    extra: (valorV2) => {
      const meta = REG.caixasOperacionais.boletos.meta;
      const pctTxt = pctOf(valorV2, meta).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%';
      const pctEl = $('cxBoletosPct'); if(pctEl) pctEl.textContent = pctTxt;
      const barEl = $('cxBoletosBar'); if(barEl) barEl.style.width = pctOf(valorV2, meta)+'%';
      const balEl = $('balResBoletos'); if(balEl) balEl.textContent = fmt(valorV2);
    },
  },
  {
    // ACHADO (09/08/2026, mesma classe do caso Boletos acima): cxPixSaldo já mostrava V2, mas
    // cxPixPct/cxPixBar (barra de meta, seção 05) e balResPixVanessa (linha do Balanço,
    // "Gestão das Reservas") continuavam presos no V1 (302,88 em vez de 2,88) - mesma caixa,
    // três números diferentes na mesma tela. Achado ao investigar um relatório (depois
    // desmentido) de outro Chat sobre a PIX Vanessa estar desatualizada.
    idHtml: 'cxPixSaldo', caixaNome: 'PIX Vanessa', getValorV1: () => REG.caixasOperacionais.pixVanessa.saldo,
    extra: (valorV2) => {
      const meta = REG.caixasOperacionais.pixVanessa.meta;
      const pctTxt = pctOf(valorV2, meta).toLocaleString('pt-BR', {minimumFractionDigits:1, maximumFractionDigits:1})+'%';
      const pctEl = $('cxPixPct'); if(pctEl) pctEl.textContent = pctTxt;
      const barEl = $('cxPixBar'); if(barEl) barEl.style.width = pctOf(valorV2, meta)+'%';
      const balEl = $('balResPixVanessa'); if(balEl) balEl.textContent = fmt(valorV2);
    },
  },
  {
    // ACHADO (08/08/2026, mesma classe de bug): balOpCaixaVariavel (seção "Balanço Patrimonial" →
    // Operacional) duplica o mesmo saldo real da Caixa Variável, nunca tinha sido ligado.
    // CORRIGIDO 10/08/2026 (achado do usuário: "gráficos iguais devem ler do mesmo lugar"): esta
    // entrada só sobrescrevia o texto de #cvSaldoReal, nunca REG.caixaVariavel.saldoReal — o
    // gráfico de barras cVariavel/g_cVariavel (lê REG.caixaVariavel.saldoReal/.comprometido/
    // .disponivel na criação) continuava mostrando o saldo V1, mesmo com o texto já em V2. Mesma
    // classe de bug do caso Patrimônio/Necessidade, mesma sessão.
    idHtml: 'cvSaldoReal', caixaNome: 'Caixa Variável', getValorV1: () => REG.caixaVariavel.saldoReal,
    extra: (valorV2) => {
      const el = $('balOpCaixaVariavel'); if(el) el.textContent = fmt(valorV2);
      REG.caixaVariavel.saldoReal = valorV2;
      if(typeof recalcularCaixas === 'function') recalcularCaixas(); // deriva .disponivel a partir do saldoReal novo
      if(typeof atualizarGraficoCaixaVariavel === 'function') atualizarGraficoCaixaVariavel();
      // CORRIGIDO 10/08/2026: cobre o caso do módulo lazy não ter carregado — ver comentário completo
      // em atualizarGraficoPainelCaixaVariavel() (graficos-painel-principal.js).
      if(typeof atualizarGraficoPainelCaixaVariavel === 'function') atualizarGraficoPainelCaixaVariavel();
    },
  },
  { idHtml: 'balOpMastercardInfinite', caixaNome: 'Caixa Mastercard/Infinite', getValorV1: () => VARS.caixaMastercardInfinite },
];

const ONDA1_V2_IDS = ONDA1_V2_MAPA.map(m => m.idHtml).concat(['cxBoletosPct', 'balResBoletos', 'balOpCaixaVariavel', 'cxPixPct', 'balResPixVanessa']); // cxBoletosBar/cxPixBar têm style.width, não textContent — marcarIndisponivelV2 cuida só de texto, ver abaixo

async function aplicarOnda1V2(){
  let saldosV2;
  try {
    saldosV2 = await WallaceFinanceService.getSaldosPorCaixa();
  } catch(err){
    console.error('Onda1V2: falha ao buscar vw_saldo_v2_por_caixa — domínio V2-exclusivo, sem fallback silencioso pro V1.', err);
    marcarIndisponivelV2(ONDA1_V2_IDS, 'Falha ao buscar vw_saldo_v2_por_caixa (Onda 1)');
    window.WALLACE_ONDA1_V2_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(saldosV2)){
    console.warn('Onda1V2: resposta inesperada de vw_saldo_v2_por_caixa — domínio V2-exclusivo, sem fallback silencioso pro V1.');
    marcarIndisponivelV2(ONDA1_V2_IDS, 'Resposta inesperada de vw_saldo_v2_por_caixa (Onda 1)');
    window.WALLACE_ONDA1_V2_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }
  const relatorio = [];
  ONDA1_V2_MAPA.forEach(({idHtml, caixaNome, getValorV1, extra}) => {
    const el = $(idHtml);
    if(!el){ console.warn(`Onda1V2: id "${idHtml}" não encontrado no DOM, ignorado.`); return; }
    const caixaV2 = saldosV2.find(c => c.caixa_nome === caixaNome);
    if(!caixaV2 || caixaV2.v2_saldo_calculado === null || caixaV2.v2_saldo_calculado === undefined){
      console.warn(`Onda1V2: "${caixaNome}" ausente/sem saldo em vw_saldo_v2_por_caixa — domínio V2-exclusivo, sem fallback silencioso.`);
      marcarIndisponivelV2([idHtml], `"${caixaNome}" ausente em vw_saldo_v2_por_caixa`);
      relatorio.push({ caixa: caixaNome, status: 'sem_dado_v2' });
      return;
    }
    let valorV1;
    try { valorV1 = Math.round(getValorV1() * 100) / 100; }
    catch(err){ console.warn(`Onda1V2: falha ao ler valor V1 de referência pra "${caixaNome}", comparação pulada.`, err); valorV1 = null; }
    const valorV2 = Math.round(Number(caixaV2.v2_saldo_calculado) * 100) / 100; // PostgREST serializa numeric como string
    const diverge = valorV1 !== null && Math.abs(valorV1 - valorV2) > 0.01;
    relatorio.push({ caixa: caixaNome, v1: valorV1, v2: valorV2, diverge, diferenca: valorV1 !== null ? Math.round((valorV1 - valorV2)*100)/100 : null });
    if(diverge){
      console.warn(`Onda1V2 [${caixaNome}]: V1=${fmt(valorV1)} × V2=${fmt(valorV2)} — DIVERGE R$${Math.abs(valorV1-valorV2).toFixed(2)}`);
    } else {
      console.log(`Onda1V2 [${caixaNome}]: V1×V2 batem (${fmt(valorV2)}) — exibindo V2.`);
    }
    el.textContent = fmt(valorV2);
    if(typeof extra === 'function'){
      try { extra(valorV2); }
      catch(err){ console.warn(`Onda1V2 [${caixaNome}]: falha ao aplicar overrides extras (meta/balanço).`, err); }
    }
  });
  window.WALLACE_ONDA1_V2_RELATORIO = relatorio; // inspecionável no console: WALLACE_ONDA1_V2_RELATORIO
  console.log('Onda1V2: relatório completo em window.WALLACE_ONDA1_V2_RELATORIO', relatorio);
  // Re-chama hydrateQualidade() (09/08/2026) — o alerta da PGV/PV nas "Verificações de Negócio"
  // agora prefere o valor deste relatório quando disponível, mesmo padrão já usado em
  // hydrate-onda7-pluggy.js/hydrate-onda4-lrei.js.
  if(typeof hydrateQualidade === 'function') hydrateQualidade();

  // CORRIGIDO 10/08/2026 (mesmo achado do usuário, ver hydrate-onda2-v2.js): sincroniza
  // REG.caixasOperacionais.{boletos,pixVanessa}.saldo — fonte do gráfico g_cCaixas — que esta
  // função só escrevia em texto do DOM até agora.
  const ONDA1_CAIXA_NOME_PARA_CHAVE = { 'Caixa Boletos': 'boletos', 'PIX Vanessa': 'pixVanessa' };
  relatorio.forEach(r => {
    const chave = ONDA1_CAIXA_NOME_PARA_CHAVE[r.caixa];
    if(chave && r.v2 !== undefined && REG.caixasOperacionais[chave]) REG.caixasOperacionais[chave].saldo = r.v2;
  });
  if(typeof atualizarGraficoCaixas === 'function') atualizarGraficoCaixas();

  // NOVO 11/08/2026 (achado do usuário: legenda de detalhe da Caixa Mastercard/Infinite
  // hardcoded — ver comentário completo em getExtratoCaixaMastercardInfinite(), app.js).
  // Assíncrono à parte (não bloqueia o resto da Onda 1) - falha aqui não derruba nada, só deixa
  // a legenda antiga (V1) visível, o número grande acima já está correto de qualquer forma.
  try {
    const extrato = await WallaceFinanceService.getExtratoCaixaMastercardInfinite();
    const detEl = $('balOpMastercardInfiniteDetalhe');
    if(detEl && Array.isArray(extrato)){
      if(!extrato.length){
        detEl.textContent = 'Sem lançamentos neste ciclo.';
      } else {
        const partes = extrato.map(t => (t.tipo === 'entrada' ? '+' : '−') + fmt(Number(t.valor)) + ' (' + t.descricao + ')');
        const total = extrato.reduce((s,t) => s + (t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor)), 0);
        detEl.textContent = partes.join(' ') + ' = ' + fmt(Math.round(total*100)/100);
      }
    }
  } catch(err){
    console.warn('Onda1V2: falha ao buscar extrato da Caixa Mastercard/Infinite — legenda de detalhe fica na versão V1 antiga.', err);
  }
}
