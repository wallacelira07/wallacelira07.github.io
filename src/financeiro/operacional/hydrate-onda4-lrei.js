// MÓDULO: Onda 4 — "Supabase como fonte única de verdade" (08/08/2026), domínio 3 (LREI —
// Empréstimos Internos entre caixas). Mesma estratégia do domínio 2 (Investimentos): troca só a
// ORIGEM do dado (VARS.LREI_ATIVAS) e re-chama renderLivrosVariaveis() (render-livros-variaveis.js,
// INALTERADA) pra desenhar a tabela — zero lógica de renderização duplicada. A tabela nova
// `emprestimos_internos` era a única ausência real de estrutura deste domínio (nenhuma tabela da
// V2 rastreava empréstimos internos antes desta migration).
//
// Nota: outros consumidores de VARS.LREI_ATIVAS que já rodaram ANTES deste módulo no boot
// síncrono (REG.qualidade.lreiAtivos, aporteBTGProgramado.caixaLanceCompleta, simulador de ciclo)
// não são re-executados aqui — mesmo padrão já aceito no domínio 2 (Investimentos): os valores são
// idênticos por migração, então não há divergência visual, só uma janela de execução que já existia
// antes desta Onda.
//
// Rollback: comentar a chamada aplicarOnda4Lrei() em app.js.
//
// NOVO 08/08/2026: LREI é fonte V2 EXCLUSIVA (diretriz "V2 é a fonte real") — em caso de falha, a
// tabela mostra aviso explícito em vez de deixar silenciosamente as linhas V1 (síncronas) na tela.
function onda4LreiMarcarIndisponivel(motivo){
  const tbody = $('lreiTbody');
  if(tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-danger);padding:1.2rem 0">⚠ Indisponível (V2) — '+(motivo||'falha ao buscar dado')+'</td></tr>';
}

async function aplicarOnda4Lrei(){
  let lreiV2;
  try {
    lreiV2 = await WallaceFinanceService.getEmprestimosInternosV2();
  } catch(err){
    console.error('Onda4Lrei: falha ao buscar vw_emprestimos_internos_v2 — sem fallback V1 (LREI é V2-exclusivo).', err);
    onda4LreiMarcarIndisponivel('falha ao buscar vw_emprestimos_internos_v2');
    window.WALLACE_ONDA4_LREI_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(lreiV2)){
    console.warn('Onda4Lrei: resposta inesperada.');
    onda4LreiMarcarIndisponivel('resposta inesperada da V2');
    window.WALLACE_ONDA4_LREI_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const v1Qtd = VARS.LREI_ATIVAS.length;
  const v1Total = Math.round(VARS.LREI_ATIVAS.reduce((s,l)=>s+l.valor,0)*100)/100;

  VARS.LREI_ATIVAS = lreiV2.map(l => ({
    id: l.id, data: l.data, credora: l.credora, devedora: l.devedora,
    valor: Number(l.valor), origem: l.origem, status: l.status,
    quitadoEm: l.quitado_em, quitadoPor: l.quitado_por,
  }));

  // Reaproveita renderLivrosVariaveis() inalterada (também redesenha LRW/LRV, idempotente).
  renderLivrosVariaveis();

  // ACHADO (08/08/2026): 2 outras exibições de VARS.LREI_ATIVAS já tinham rodado de forma síncrona,
  // ANTES deste módulo (async) sobrescrever o array — ficavam mostrando a contagem/lista V1 antiga
  // mesmo depois da V2 assumir. REG.qualidade.lreiAtivos precisa ser resincronizado (mesma fórmula de
  // app.js:1109) antes de re-chamar hydrateQualidade() (idempotente, só reconstrói innerHTML a partir
  // de REG/VARS atuais). balLreiAtivos (resumo do Balanço) é reescrito direto, mesma lógica já usada
  // em hydrate-balanco.js. (Terceira exibição, hydrate-simulador-ciclo.js linha ~94-101, é código já
  // morto em V1 — .map() ali não inclui `id`, então `$(l.id)` nunca encontra elemento; não é regressão
  // desta migração, fora de escopo corrigir agora.)
  if(REG.qualidade){
    REG.qualidade.lreiAtivos = VARS.LREI_ATIVAS.filter(l=>l.status==='ATIVO').length;
    if(typeof hydrateQualidade === 'function') hydrateQualidade();
  }
  {
    const lreiAtivosNow = VARS.LREI_ATIVAS.filter(l=>l.status==='ATIVO');
    const balLreiEl = $('balLreiAtivos');
    if(balLreiEl){
      balLreiEl.textContent = lreiAtivosNow.length === 0
        ? 'Nenhum'
        : lreiAtivosNow.length + ' ativo(s): ' + lreiAtivosNow.map(l=>l.id+' ('+fmt(l.valor)+')').join(', ');
    }
  }

  const v2Total = Math.round(VARS.LREI_ATIVAS.reduce((s,l)=>s+l.valor,0)*100)/100;
  const diverge = v1Qtd !== VARS.LREI_ATIVAS.length || Math.abs(v1Total - v2Total) > 0.01;
  if(diverge) console.warn(`Onda4Lrei: V1 (${v1Qtd} itens, ${fmt(v1Total)}) × V2 (${VARS.LREI_ATIVAS.length} itens, ${fmt(v2Total)}) — DIVERGE (inesperado, investigar).`);
  else console.log(`Onda4Lrei: V1×V2 batem (${VARS.LREI_ATIVAS.length} itens, ${fmt(v2Total)}). V2 é a fonte exibida.`);

  window.WALLACE_ONDA4_LREI_RELATORIO = { qtdV1: v1Qtd, totalV1: v1Total, qtdV2: VARS.LREI_ATIVAS.length, totalV2: v2Total, diverge, exibindo: 'V2' };
  console.log('Onda4Lrei: relatório completo em window.WALLACE_ONDA4_LREI_RELATORIO', window.WALLACE_ONDA4_LREI_RELATORIO);
}
