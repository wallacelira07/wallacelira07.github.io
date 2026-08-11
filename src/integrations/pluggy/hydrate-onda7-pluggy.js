// MÓDULO: Onda 7 — migração de wallace_dados.PLUGGY_CONTAS para as tabelas relacionais
// pluggy_conexoes/pluggy_contas/pluggy_transacoes (08/08/2026). A RPC atualizar_pluggy_contas
// (chamada por sincronizar_pluggy.py) passou a fazer substituição total nas 3 tabelas em vez de
// jsonb_set em wallace_dados — wallace_dados.PLUGGY_CONTAS parou de ser atualizado a partir de agora.
//
// CORRIGIDO 10/08/2026 (fecha o último escritor ativo de wallace_dados disparado por clique do
// usuário — ver PLANO_UNIFICACAO_V1_V2.md seção 44/47): VARS.PLUGGY_TRIAGEM (decisões de
// aprovar/rejeitar da Inbox) tinha ficado FORA da Onda 7 de propósito, tratado como etapa futura —
// agora migrado pra tabela `pluggy_triagem` (RPC `triar_pluggy_item` já escreve lá desde esta
// correção). Busca em paralelo com PLUGGY_CONTAS, sobrescreve VARS.PLUGGY_TRIAGEM ANTES de chamar
// reconciliarPluggy()/reconciliarTransacoesPluggy() (que leem pluggyJaTriado() de forma síncrona
// durante a própria execução — precisa estar pronto antes, não dá pra atualizar depois).
//
// Mesma estratégia já usada em Wärtsilä/Investimentos/Parcelamentos/LREI/Mercado Pago: troca só a
// ORIGEM do dado (VARS.PLUGGY_CONTAS/PLUGGY_TRIAGEM) e reaproveita reconciliarPluggy()/
// reconciliarTransacoesPluggy()/pluggyJaTriado()/hydrateQualidade() (V1, INALTERADAS) — zero lógica
// de negócio duplicada (mapa de cartão, filtro de ruído, comparação de fatura por vencimento
// continuam exatamente como eram).
//
// NOVO 08/08/2026: Pluggy é fonte V2 EXCLUSIVA — em caso de falha, NÃO roda nenhuma reconciliação
// (evita empurrar dado V1 potencialmente desatualizado/parado pra Inbox), sem fallback silencioso.
// Falha específica de PLUGGY_TRIAGEM sozinha (contas OK, triagem falhou) é tolerada — degrada pra
// "nenhum item marcado como já triado" (pior caso: um item já decidido reaparece 1x na Inbox, não
// perde dado real nenhum, já que a decisão em si já está gravada na tabela desde a RPC).

async function aplicarOnda7Pluggy(){
  let pluggyV2;
  try {
    pluggyV2 = await WallaceFinanceService.getPluggyContasV2();
  } catch(err){
    console.error('Onda7Pluggy: falha ao buscar pluggy_conexoes/contas/transacoes — sem fallback V1 (domínio é V2-exclusivo).', err);
    window.WALLACE_ONDA7_PLUGGY_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!pluggyV2 || !Array.isArray(pluggyV2.conexoes)){
    console.warn('Onda7Pluggy: resposta inesperada da V2.');
    window.WALLACE_ONDA7_PLUGGY_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const v1QtdConexoes = (VARS.PLUGGY_CONTAS && Array.isArray(VARS.PLUGGY_CONTAS.conexoes)) ? VARS.PLUGGY_CONTAS.conexoes.length : 0;

  VARS.PLUGGY_CONTAS = pluggyV2;

  try {
    const triagemV2 = await WallaceFinanceService.getPluggyTriagemV2();
    const mapa = {};
    (triagemV2 || []).forEach(t => { mapa[t.id_externo] = { status_triagem: t.status_triagem, atualizado_em: t.atualizado_em }; });
    VARS.PLUGGY_TRIAGEM = mapa;
    console.log(`Onda7Pluggy: PLUGGY_TRIAGEM sincronizado da V2 (${triagemV2.length} decisão(ões)).`);
  } catch(err){
    console.warn('Onda7Pluggy: falha ao buscar pluggy_triagem (V2) — itens já triados podem reaparecer 1x na Inbox nesta carga, nenhuma decisão é perdida (já gravada na tabela).', err);
  }

  // Reaproveita reconciliarPluggy()/reconciliarTransacoesPluggy() (V1, inalteradas) — mesma lógica de
  // negócio (mapa de cartão, comparação de fatura por vencimento, filtro de ruído), dado novo.
  const resultadoCartoes = reconciliarPluggy();
  // NOVO 11/08/2026 (pedido explícito do usuário, supersede a exceção arquitetural de 08/08 — ver
  // docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md): promove a fatura real da Pluggy
  // a fonte principal dos headline totals (cartaoInfiniteTotal/cartaoMBTotal/mercadoPagoFatura) quando
  // ela existir de verdade (aberta, não-zero, não-vencida) — nunca sobrescreve com dado ruim, cai pro
  // valor manual/fallback ERP já existente em caso contrário.
  const resultadoPromocao = typeof promoverFaturaPluggyComoFonte === 'function' ? promoverFaturaPluggyComoFonte() : { promovidos: [] };
  const resultadoTransacoes = await reconciliarTransacoesPluggy();
  // Mesmo cuidado já aplicado a Onda6MercadoPago/LREI: itens novos da Inbox só existem depois do
  // await acima resolver, então o classificador genérico (que já rodava síncrono antes) precisa ser
  // re-chamado aqui pra ter a chance de classificá-los.
  classificarInboxPendentes();
  // hydrateQualidade() lê VARS.PLUGGY_CONTAS direto (alerta do saldo/fatura Mercado Pago ao vivo) —
  // já tinha rodado de forma síncrona, antes deste fetch resolver, com o array vazio/V1 antigo.
  if(typeof hydrateQualidade === 'function') hydrateQualidade();

  const qtd = { conexoes: pluggyV2.conexoes.length, contas: pluggyV2.conexoes.reduce((s,c)=>s+c.contas.length,0), transacoes: pluggyV2.conexoes.reduce((s,c)=>s+c.contas.reduce((s2,a)=>s2+(a.transacoes_recentes||[]).length,0),0) };
  console.log(`Onda7Pluggy: ${qtd.conexoes} conexão(ões), ${qtd.contas} conta(s), ${qtd.transacoes} transação(ões) da V2. ${resultadoCartoes.divergencias.length} divergência(s), ${resultadoPromocao.promovidos.length} fatura(s) promovida(s) pra fonte Pluggy real, ${resultadoTransacoes.suspeitas.length} transação(ões) suspeita(s). V2 é a fonte exibida.`);
  window.WALLACE_ONDA7_PLUGGY_RELATORIO = { qtdConexoesV1: v1QtdConexoes, ...qtd, divergencias: resultadoCartoes.divergencias.length, naoMapeados: resultadoCartoes.naoMapeados.length, promovidos: resultadoPromocao.promovidos, suspeitas: resultadoTransacoes.suspeitas.length, exibindo: 'V2' };
}
