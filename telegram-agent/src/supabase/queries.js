// src/supabase/queries.js
// Consultas específicas usadas pelas tools do agente. Fica tudo centralizado
// aqui (e não espalhado dentro de agent/tools.js) para que qualquer tabela
// nova exposta ao agente passe por um único lugar revisável.
//
// Schema conferido ao vivo no Supabase (projeto bakdgacmwlopvrrppwdm) na
// sessão em que o protótipo irmão (whatsapp-agent/) foi escrito — colunas
// reais de vw_saldo_v2_por_caixa, caixas, cartoes, usuarios, categorias,
// subcategorias, transacoes e a assinatura de
// lancar_transacao_manual/rpc_dashboard_resumo. Se o schema mudar depois,
// reconferir antes de confiar cegamente neste arquivo (Nível B do manual:
// "código lido nesta sessão" perde validade assim que o schema muda sem este
// arquivo ser atualizado junto).

const { select, rpc } = require('./client');

// Tabelas de referência que o agente pode consultar por nome (lookup humano
// -> uuid). Whitelist deliberada — nunca deixar o modelo escolher uma tabela
// arbitrária.
const TABELAS_REFERENCIA = {
  caixas: { colunas: 'id,nome,tipo,ciclo_inicio_em', colunaBusca: 'nome' },
  cartoes: { colunas: 'id,apelido,bandeira,banco,numero_final,status', colunaBusca: 'apelido' },
  usuarios: { colunas: 'id,nome,papel', colunaBusca: 'nome' },
  categorias: { colunas: 'id,nome,tipo', colunaBusca: 'nome' },
  subcategorias: { colunas: 'id,nome,categoria_id', colunaBusca: 'nome' },
};

async function buscarReferencia(tabela, termo) {
  const def = TABELAS_REFERENCIA[tabela];
  if (!def) {
    throw new Error(
      `Tabela de referência "${tabela}" não permitida. Use uma de: ${Object.keys(TABELAS_REFERENCIA).join(', ')}.`
    );
  }
  const filtros = {};
  if (termo) {
    // ilike = case-insensitive contains, formato PostgREST.
    filtros[def.colunaBusca] = `ilike.*${termo}*`;
  }
  return select(tabela, { select: def.colunas, filtros, limite: 20 });
}

async function saldoPorCaixa(nomeCaixa) {
  const filtros = {};
  if (nomeCaixa) {
    filtros.caixa_nome = `ilike.*${nomeCaixa}*`;
  }
  return select('vw_saldo_v2_por_caixa', {
    select: 'caixa_nome,caixa_tipo,v2_saldo_inicial,v2_delta,v2_saldo_calculado,v2_qtd_transacoes',
    filtros,
    order: 'caixa_nome.asc',
  });
}

async function transacoesRecentes({ caixaId, usuarioId, limite = 10 } = {}) {
  const filtros = {};
  if (caixaId) filtros.caixa_id = `eq.${caixaId}`;
  if (usuarioId) filtros.usuario_id = `eq.${usuarioId}`;
  return select('transacoes', {
    select: 'id,data,descricao,valor,tipo,caixa_id,cartao_id,usuario_id,afeta_saldo_real,status,origem,tx_legado',
    filtros,
    order: 'data.desc',
    limite,
  });
}

async function resumoDashboard() {
  // rpc_dashboard_resumo() confirmado sem argumentos, retorna jsonb (ver
  // manual seção 6: "avisos" é uma das chaves esperadas desse jsonb).
  return rpc('rpc_dashboard_resumo', {});
}

/**
 * Lança a transação de verdade na V2 (transacoes) via a RPC oficial já usada
 * pelo Claude Chat/Code hoje. NUNCA chamar isto direto a partir de uma tool
 * do modelo — só o código de confirmação em index.js/conversation pode
 * chegar até aqui, depois do usuário responder "sim" a uma proposta que ele
 * mesmo viu por escrito. Ver src/conversation/pendingConfirmations.js.
 *
 * LIMITAÇÃO CONHECIDA (documentar, não esconder): a trigger de auditoria
 * (trg_audit_indicadores / mesma família em transacoes) espera
 * set_config('audit.origem', ...) antes da operação (manual seção 1.3.2/3).
 * Como cada chamada REST/PostgREST aqui é uma conexão/transação isolada, não
 * há como fazer `SET LOCAL` numa chamada e ele valer na chamada seguinte —
 * então lançamentos feitos por este agente ficam em audit_log com
 * origem='sistema' (genérico), a menos que uma RPC dedicada
 * (`lancar_transacao_telegram_agent`, por exemplo, envolvendo os dois
 * comandos na mesma function Postgres) seja criada depois — isso é uma
 * mudança estrutural de schema, fora do escopo deste scaffold, e listada em
 * PROXIMOS_PASSOS.md como melhoria opcional.
 */
async function lancarTransacao(params) {
  return rpc('lancar_transacao_manual', {
    p_data: params.data,
    p_descricao: params.descricao,
    p_valor: params.valor,
    p_tipo: params.tipo,
    p_caixa_id: params.caixaId,
    p_categoria_id: params.categoriaId || null,
    p_subcategoria_id: params.subcategoriaId || null,
    p_cartao_id: params.cartaoId || null,
    p_usuario_id: params.usuarioId || null,
    p_afeta_saldo_real: params.afetaSaldoReal,
  });
}

module.exports = {
  buscarReferencia,
  saldoPorCaixa,
  transacoesRecentes,
  resumoDashboard,
  lancarTransacao,
};
