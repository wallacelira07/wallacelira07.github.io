// MÓDULO: Onda 5 — continuação da aposentadoria do wallace_dados (08/08/2026), domínio 1
// (Parcelamentos — LRP/LRMP, seção 15). Achado ao levantar o próximo domínio de maior impacto:
// `parcelas` (V2) já tinha as 22 linhas (16 PARCELAMENTOS_VISA + 6 PARCELAMENTOS_MP) sincronizadas
// 1:1 com os arrays do VARS (mesmo tx_legado/parcela atual/total/valor/status) — só faltava a view
// de consumo e o módulo de ligação. Mesma estratégia dos domínios 2-4 da Onda 4: troca a origem de
// VARS.PARCELAMENTOS_VISA/MP e reaproveita renderParcelamentos() (render-parcelamentos.js,
// INALTERADA) pra desenhar as tabelas — zero lógica de renderização duplicada.
//
// Diferença cosmética conhecida (não financeira, não bloqueia): o "nome" vem de `transacoes.descricao`
// (ex: "TEACHER_MATIAS") em vez do texto V1 mais legível ("Teacher Matias") — mesma informação,
// formatação de origem diferente. Não reformatado aqui (evita inventar lógica de texto nova).
//
// Fora do escopo: VARS.TRANSACOES_CORPORATIVAS_MP (itens corporativos/avulsos filtrados por ciclo)
// não tem equivalente em `parcelas` — continua V1, renderParcelamentos() já lida com isso sozinha
// (não é afetado por este módulo, só a parte LRP/LRMP é sobrescrita).
//
// Rollback: comentar a chamada aplicarOnda5Parcelamentos() em app.js.
//
// NOVO 08/08/2026: Parcelamentos é fonte V2 EXCLUSIVA (diretriz "V2 é a fonte real") — em caso de
// falha, as tabelas mostram aviso explícito em vez de deixar silenciosamente as linhas V1
// (síncronas) na tela.
function onda5ParcelamentosMarcarIndisponivel(motivo){
  const msg = '<tr><td colspan="4" style="text-align:center;color:var(--text-danger);padding:1.2rem 0">⚠ Indisponível (V2) — '+(motivo||'falha ao buscar dado')+'</td></tr>';
  ['lrpTbody','lrmpTbody'].forEach(id => { const el = $(id); if(el) el.innerHTML = msg; });
}

async function aplicarOnda5Parcelamentos(){
  let parcelasV2;
  try {
    parcelasV2 = await WallaceFinanceService.getParcelamentosV2();
  } catch(err){
    console.error('Onda5Parcelamentos: falha ao buscar vw_parcelamentos_v2 — sem fallback V1 (domínio é V2-exclusivo).', err);
    onda5ParcelamentosMarcarIndisponivel('falha ao buscar vw_parcelamentos_v2');
    window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(parcelasV2) || !parcelasV2.length){
    console.warn('Onda5Parcelamentos: resposta vazia/inesperada.');
    onda5ParcelamentosMarcarIndisponivel('resposta vazia/inesperada da V2');
    window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const v1QtdVisa = VARS.PARCELAMENTOS_VISA.length, v1QtdMP = VARS.PARCELAMENTOS_MP.length;

  const mapear = item => ({
    tx: item.tx, nome: item.nome, parcelaAtual: item.parcela_atual,
    totalParcelas: item.total_parcelas, valor: Number(item.valor), status: item.status,
  });
  VARS.PARCELAMENTOS_VISA = parcelasV2.filter(p => p.origem_array === 'PARCELAMENTOS_VISA').map(mapear);
  VARS.PARCELAMENTOS_MP = parcelasV2.filter(p => p.origem_array === 'PARCELAMENTOS_MP').map(mapear);

  // Reaproveita renderParcelamentos() (V1, inalterada) — mesma renderização, dado novo.
  renderParcelamentos();

  // CORRIGIDO 10/08/2026: `provMP` (perna 4 da cascata de reembolso Wärtsilä, `REG.totalOpDetalhe.provMP`/
  // `VARS.totalOpProvMP`) é derivado de VARS.PARCELAMENTOS_MP (soma dos ATIVO, ver app.js), mas esse
  // cálculo rodava só 1x, de forma síncrona, no boot — ANTES desta função (assíncrona) trocar
  // PARCELAMENTOS_MP pelo dado V2 acima. Resultado: mesmo com PARCELAMENTOS_MP já V2, `provMP` ficava
  // congelado no valor derivado do array V1 antigo, e tudo que depende dele (cascata de reembolso,
  // Necessidade Total/Líquida, os 2 gráficos "próximos ciclos") nunca via a atualização. Diferente de
  // Cartões/Ciclo Snapshots (bloqueados por falta de estrutura V2), aqui a estrutura já existe — só
  // faltava religar o recálculo, mesmo padrão que hydrate-onda4-wartsila.js já usa pras outras 3 pernas.
  VARS.totalOpProvMP = Math.round(VARS.PARCELAMENTOS_MP.filter(p => p.status === 'ATIVO').reduce((s,p) => s + p.valor, 0) * 100) / 100;
  REG.totalOpDetalhe.provMP = VARS.totalOpProvMP;
  if(typeof recalcularReembolsos === 'function') recalcularReembolsos();
  if(typeof recalcularNecessidade === 'function') recalcularNecessidade();
  if(typeof hydrateReembolsos === 'function') hydrateReembolsos();
  if(typeof hydrateMercadoPago === 'function') hydrateMercadoPago();
  if(typeof hydrateResumoCartoes === 'function') hydrateResumoCartoes();
  if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
  if(typeof hydrateBalanco === 'function') hydrateBalanco();
  if(typeof hydrateCenarios === 'function') hydrateCenarios();
  if(typeof hydrateResumoP2P === 'function') hydrateResumoP2P();
  if(typeof atualizarGraficosNecessidade === 'function') atualizarGraficosNecessidade();
  // CORRIGIDO 10/08/2026: cobre o mesmo caso de graficos-cenarios-lazy.js não ter carregado ainda
  // (aba Gráficos/Cenários nunca aberta) — ver comentário completo em atualizarGraficosPainelPrincipal().
  if(typeof atualizarGraficosPainelPrincipal === 'function') atualizarGraficosPainelPrincipal();
  if(typeof atualizarGraficoTotalOpDetalhe === 'function') atualizarGraficoTotalOpDetalhe();

  const diverge = v1QtdVisa !== VARS.PARCELAMENTOS_VISA.length || v1QtdMP !== VARS.PARCELAMENTOS_MP.length;
  if(diverge) console.warn(`Onda5Parcelamentos: quantidade diverge — Visa V1=${v1QtdVisa}×V2=${VARS.PARCELAMENTOS_VISA.length}, MP V1=${v1QtdMP}×V2=${VARS.PARCELAMENTOS_MP.length} (inesperado, investigar).`);
  else console.log(`Onda5Parcelamentos: V1×V2 batem (${VARS.PARCELAMENTOS_VISA.length} Visa + ${VARS.PARCELAMENTOS_MP.length} MP). V2 é a fonte exibida.`);

  window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO = { qtdVisaV1: v1QtdVisa, qtdVisaV2: VARS.PARCELAMENTOS_VISA.length, qtdMPV1: v1QtdMP, qtdMPV2: VARS.PARCELAMENTOS_MP.length, diverge, exibindo: 'V2' };
  console.log('Onda5Parcelamentos: relatório completo em window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO', window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO);
}
