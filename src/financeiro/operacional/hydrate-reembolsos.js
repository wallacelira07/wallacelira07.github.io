// MÓDULO: hydrateReembolsos() — renderização dos indicadores de Reembolso (cascata Wärtsilä/MP/Cartão)
// e Meta de Investimento. Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateReembolsos() no meio da própria execução. Nenhum id de
// DOM, fórmula ou comportamento mudou.
function hydrateReembolsos(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // reembolsos e meta de investimento
  t('reembRecebidos', fmt(R.reembolsos.recebidosNoCiclo));
  t('reembAReceber', fmt(R.operacional.reembolsosAReceber));
  t('reembCicloTotal', fmt(R.operacional.reembolsoCicloTotal));
  t('reembPagaWartsila', fmt(R.faturaWartsila));
  t('reembPagaMP', fmt(R.operacional.reembolsoPagaMPCorporativo));
  // CORRIGIDO 13/08/2026 (achado de auditoria: este card lia R.visaDetalhe.corp+R.mbDetalhe.corp,
  // fonte V1/limbo do LRC do ciclo atual — mas o cálculo REAL de Sobra Pessoal/Cobertura Garantida
  // usa REG.operacional.reembolsoPagaCartaoCorporativo (V2/Supabase, sobrescrito pela Onda4 desde
  // 08/08/2026). O número exibido aqui podia divergir do que o sistema de fato subtraiu na cascata
  // logo abaixo, na mesma tela. Trocado pra ler a MESMA fonte usada no cálculo real.
  t('reembPagaCartao', fmt(R.operacional.reembolsoPagaCartaoCorporativo));
  t('reembSobraPessoal', fmt(R.operacional.reembolsoSobraPessoal));
  t('reembMPPessoal', fmt(R.totalOpDetalhe.provMP)); // CORRIGIDO 20/07/2026: agora e literalmente o item 4 da cascata (usado no calculo de reembolsoSobraPessoal), nao mais um campo paralelo "so informativo".
  // NOVAS 12/08/2026 (linhas 6/7 da cascata, ver recalcular-necessidade.js pra fórmula real):
  // Manejo = VARS.reembolsoManejo (manual). Sobra Disponível = R.operacional.coberturaGarantida,
  // que agora É literalmente esse valor (Sobra Total - Manejo) - mesmo número, 2 nomes/contextos.
  t('reembManejo', fmt(VARS.reembolsoManejo || 0));
  t('reembSobraDisponivel', fmt(R.operacional.coberturaGarantida));
  t('metaInvTotal', fmt(R.metaInvestimento.investido));
  t('metaInvExcedente', fmt(R.metaInvestimento.excedente));
  t('metaInvMensal', fmt(R.metaInvestimento.meta));
  t('metaInvBadge', 'Total investido '+fmt(R.metaInvestimento.investido)+' · '+(R.metaInvestimento.excedente>=0?'Superada +':'Falta ')+fmt(Math.abs(R.metaInvestimento.excedente)));
  t('metaInvBTG', fmt(VARS.aporteBTGPactual + VARS.depositoAtivacaoNecton)); // CORRIGIDO 25/07/2026 (V159): usuario esclareceu que sao a mesma coisa - consolidados em 1 campo so (era duplicado, 2 linhas separadas para o mesmo conceito).
}

// NOVO 22/08/2026 (pedido do usuário: "quero poder editar isso no futuro" — reembolsoManejo era um
// literal fixo em VARS, sem nenhum mecanismo real de edição). Prompt simples (mesmo espírito de
// baixo-atrito das outras edições pontuais deste projeto) — grava via rpc_atualizar_reembolso_manejo
// (coluna nova `reembolso_manejo` em reembolso_wartsila_ciclo, SECURITY DEFINER com o mesmo guard de
// auth de fechar_ciclo_financeiro/registrar_leitura_solar_manual) e re-hidrata a cascata inteira na
// mesma ação, mesmo padrão "clique salva e atualiza o painel junto" já usado no resto do site.
async function editarReembolsoManejo(){
  const cicloAtual = typeof VARS !== 'undefined' && VARS.cicloAtual;
  if(!cicloAtual){ alert('Ciclo atual ainda não carregado — tenta de novo em alguns segundos.'); return; }
  const atual = (typeof VARS !== 'undefined' && VARS.reembolsoManejo) || 0;
  const entrada = prompt(`Quanto da Sobra Total do ciclo ${cicloAtual} já foi usado/reservado pra outra coisa (Manejo/Movimentação)?\n\nValor atual: ${fmt(atual)}`, atual.toFixed(2).replace('.', ','));
  if(entrada === null) return; // cancelou
  const valor = Number(entrada.replace(/\./g, '').replace(',', '.'));
  if(!Number.isFinite(valor) || valor < 0){ alert('Valor inválido — precisa ser um número maior ou igual a 0.'); return; }
  try {
    const token = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';
    const resp = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/rpc_atualizar_reembolso_manejo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ p_ciclo: cicloAtual, p_valor: valor })
    });
    if(!resp.ok){ const texto = await resp.text(); throw new Error(`HTTP ${resp.status}: ${texto}`); }
    VARS.reembolsoManejo = valor;
    if(typeof WallaceFinanceService !== 'undefined' && WallaceFinanceService._cache) WallaceFinanceService._cache.deletarPorPrefixo(['reembolso_wartsila_ciclo:']);
    // coberturaGarantida = max(0, reembolsoSobraPessoal - reembolsoManejo) é calculada em
    // recalcularNecessidade() (recalcular-necessidade.js), não em recalcularReembolsos() — precisa
    // das duas, na ordem certa, senão o número novo não se propaga. Mesma lista de reprocessamento
    // já usada em hydrate-deficit-caixas-sem-lrei.js (mesma classe de "esqueceu de recalcular" caçada
    // várias vezes nesta sessão) — reaproveitada aqui pelo mesmo motivo.
    if(typeof recalcularReembolsos === 'function') recalcularReembolsos();
    if(typeof recalcularNecessidade === 'function') recalcularNecessidade();
    hydrateReembolsos();
    if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
    if(typeof hydrateEstimadorSalario === 'function') hydrateEstimadorSalario();
    if(typeof hydrateSimuladorCiclo === 'function') hydrateSimuladorCiclo();
    if(typeof recalcularIndicadores === 'function') recalcularIndicadores();
    if(typeof hydrateIndicadores === 'function') hydrateIndicadores();
  } catch(err){
    console.error('editarReembolsoManejo: falha ao salvar', err);
    alert('Não consegui salvar — ' + err.message);
  }
}
