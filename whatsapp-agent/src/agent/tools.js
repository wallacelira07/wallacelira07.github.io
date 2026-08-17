// src/agent/tools.js
// Definições das tools (function calling) expostas ao Claude, e a execução
// de cada uma. Regra de ouro deste arquivo: NENHUMA tool aqui escreve em
// `transacoes`/qualquer tabela financeira diretamente. A única tool que
// "lança" (propor_lancamento) só grava uma proposta em memória
// (conversation/pendingConfirmations.js) — o INSERT de verdade só acontece
// em server.js, depois que o número confirmar "sim" numa mensagem separada.

const queries = require('../supabase/queries');
const pendentes = require('../conversation/pendingConfirmations');
const logger = require('../logger');

const definicoesTools = [
  {
    name: 'buscar_referencia',
    description:
      'Busca o id (uuid) de uma caixa, cartão, usuário, categoria ou subcategoria pelo nome/apelido. ' +
      'Use SEMPRE antes de propor um lançamento — nunca invente um uuid.',
    input_schema: {
      type: 'object',
      properties: {
        tabela: {
          type: 'string',
          enum: ['caixas', 'cartoes', 'usuarios', 'categorias', 'subcategorias'],
        },
        termo: {
          type: 'string',
          description: 'Nome ou parte do nome a buscar (busca parcial, case-insensitive). Vazio lista os primeiros 20.',
        },
      },
      required: ['tabela'],
    },
  },
  {
    name: 'consultar_saldo',
    description: 'Consulta o saldo V2 (vw_saldo_v2_por_caixa) de uma ou todas as caixas.',
    input_schema: {
      type: 'object',
      properties: {
        caixa: {
          type: 'string',
          description: 'Nome (ou parte do nome) da caixa. Omita para listar todas.',
        },
      },
    },
  },
  {
    name: 'listar_transacoes_recentes',
    description: 'Lista as transações mais recentes, opcionalmente filtradas por caixa e/ou usuário.',
    input_schema: {
      type: 'object',
      properties: {
        caixa_id: { type: 'string', description: 'uuid da caixa (ver buscar_referencia).' },
        usuario_id: { type: 'string', description: 'uuid do usuário (ver buscar_referencia).' },
        limite: { type: 'integer', description: 'Default 10, máximo 50.' },
      },
    },
  },
  {
    name: 'consultar_resumo_financeiro',
    description:
      'Chama o resumo/avisos gerais do painel (rpc_dashboard_resumo). Use para perguntas amplas ' +
      '("como estão minhas finanças", "tem algum alerta?") em vez de adivinhar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propor_lancamento',
    description:
      'Registra uma PROPOSTA de lançamento e devolve o texto de confirmação a enviar ao usuário. ' +
      'NÃO grava nada no banco — o lançamento real só acontece se o usuário responder "sim" numa ' +
      'mensagem seguinte. Só chame esta tool depois de ter TODOS os campos obrigatórios confirmados ' +
      'na conversa (nunca invente nenhum). Se a compra foi no cartão, preencha cartao_id — o sistema ' +
      'força afeta_saldo_real=false automaticamente nesse caso (regra permanente do manual, compra no ' +
      'cartão nunca reduz o saldo da caixa na hora).',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Data real da compra/evento, formato YYYY-MM-DD.' },
        descricao: { type: 'string' },
        valor: { type: 'number', description: 'Sempre positivo.' },
        tipo: { type: 'string', enum: ['entrada', 'saida'] },
        caixa_id: { type: 'string', description: 'uuid, obtido via buscar_referencia.' },
        caixa_nome: { type: 'string', description: 'Nome legível da caixa, só para exibir na confirmação.' },
        cartao_id: { type: 'string', description: 'uuid do cartão, se a compra foi no cartão.' },
        cartao_nome: { type: 'string', description: 'Apelido do cartão, só para exibir na confirmação.' },
        usuario_id: { type: 'string', description: 'uuid de quem comprou, se souber.' },
        usuario_nome: { type: 'string', description: 'Nome de quem comprou, só para exibir na confirmação.' },
        categoria_id: { type: 'string' },
        subcategoria_id: { type: 'string' },
      },
      required: ['data', 'descricao', 'valor', 'tipo', 'caixa_id', 'caixa_nome'],
    },
  },
];

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function executarTool(nome, input, contexto) {
  switch (nome) {
    case 'buscar_referencia':
      return queries.buscarReferencia(input.tabela, input.termo);

    case 'consultar_saldo':
      return queries.saldoPorCaixa(input.caixa);

    case 'listar_transacoes_recentes':
      return queries.transacoesRecentes({
        caixaId: input.caixa_id,
        usuarioId: input.usuario_id,
        limite: Math.min(input.limite || 10, 50),
      });

    case 'consultar_resumo_financeiro':
      return queries.resumoDashboard();

    case 'propor_lancamento': {
      // Regra permanente (manual seção 1.3.5): cartão preenchido -> nunca
      // afeta o saldo real na hora, sem exceção. Decidido em código, não
      // deixado a critério do modelo.
      const afetaSaldoReal = !input.cartao_id;

      const proposta = {
        data: input.data,
        descricao: input.descricao,
        valor: input.valor,
        tipo: input.tipo,
        caixaId: input.caixa_id,
        caixaNome: input.caixa_nome,
        cartaoId: input.cartao_id || null,
        cartaoNome: input.cartao_nome || null,
        usuarioId: input.usuario_id || null,
        usuarioNome: input.usuario_nome || null,
        categoriaId: input.categoria_id || null,
        subcategoriaId: input.subcategoria_id || null,
        afetaSaldoReal,
      };

      pendentes.registrarProposta(contexto.numeroTelefone, proposta);

      const linhas = [
        'Confirma esse lançamento?',
        `Data: ${proposta.data}`,
        `Descrição: ${proposta.descricao}`,
        `Valor: ${formatarMoeda(proposta.valor)} (${proposta.tipo})`,
        `Caixa: ${proposta.caixaNome}`,
      ];
      if (proposta.cartaoNome) linhas.push(`Cartão: ${proposta.cartaoNome} (não afeta o saldo da caixa agora, só a fatura)`);
      if (proposta.usuarioNome) linhas.push(`Quem comprou: ${proposta.usuarioNome}`);
      linhas.push('Responda "sim" para lançar ou "não" para cancelar.');

      return { proposta_registrada: true, texto_confirmacao_sugerido: linhas.join('\n') };
    }

    default:
      logger.warn(`[tools] tool desconhecida chamada pelo modelo: ${nome}`);
      return { erro: `Tool "${nome}" não existe.` };
  }
}

module.exports = { definicoesTools, executarTool };
