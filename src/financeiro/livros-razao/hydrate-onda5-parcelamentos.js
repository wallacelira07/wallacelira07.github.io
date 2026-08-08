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

async function aplicarOnda5Parcelamentos(){
  let parcelasV2;
  try {
    parcelasV2 = await WallaceFinanceService.getParcelamentosV2();
  } catch(err){
    console.error('Onda5Parcelamentos: falha ao buscar vw_parcelamentos_v2 — mantendo V1 (fallback automático).', err);
    return;
  }
  if(!Array.isArray(parcelasV2) || !parcelasV2.length){
    console.warn('Onda5Parcelamentos: resposta vazia/inesperada — mantendo V1.');
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

  const diverge = v1QtdVisa !== VARS.PARCELAMENTOS_VISA.length || v1QtdMP !== VARS.PARCELAMENTOS_MP.length;
  if(diverge) console.warn(`Onda5Parcelamentos: quantidade diverge — Visa V1=${v1QtdVisa}×V2=${VARS.PARCELAMENTOS_VISA.length}, MP V1=${v1QtdMP}×V2=${VARS.PARCELAMENTOS_MP.length} (inesperado, investigar).`);
  else console.log(`Onda5Parcelamentos: V1×V2 batem (${VARS.PARCELAMENTOS_VISA.length} Visa + ${VARS.PARCELAMENTOS_MP.length} MP). V2 é a fonte exibida.`);

  window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO = { qtdVisaV1: v1QtdVisa, qtdVisaV2: VARS.PARCELAMENTOS_VISA.length, qtdMPV1: v1QtdMP, qtdMPV2: VARS.PARCELAMENTOS_MP.length, diverge, exibindo: 'V2' };
  console.log('Onda5Parcelamentos: relatório completo em window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO', window.WALLACE_ONDA5_PARCELAMENTOS_RELATORIO);
}
