// src/index.js
// Ponto de entrada único. Toda mensagem recebida (via long polling, ver
// telegram.js) passa por handleIncomingMessage(), que decide, em código
// determinístico, entre 3 caminhos:
//   1. Chat fora da allowlist -> ignorado (log apenas, sem resposta).
//   2. Existe proposta pendente e a mensagem é "sim"/"não" -> confirma/cancela
//      SEM chamar o modelo (evita que uma prompt injection na resposta do
//      usuário mude o comportamento de confirmação).
//   3. Qualquer outra mensagem -> vai para o agente (Claude + tools).
//
// Ver docs/MANUAL_OPERACIONAL_AGENTES.md seção 2 (regra 1) e seção 8
// (proibições) — a regra "nunca lançar sem confirmação explícita" é aplicada
// aqui, não delegada ao modelo.
//
// Diferença central em relação ao protótipo irmão (whatsapp-agent/): não há
// servidor HTTP, webhook, ngrok, nem validação de assinatura — o Telegram Bot
// API com long polling (telegram.js) dispensa tudo isso. Rode com
// `npm start` e deixe o terminal aberto (ou use pm2/screen se quiser
// sobreviver ao fechar o terminal).

const config = require('./config');
const logger = require('./logger');
const telegram = require('./telegram');
const claudeAgent = require('./agent/claudeAgent');
const pendentes = require('./conversation/pendingConfirmations');
const confirmacao = require('./utils/confirmationWords');
const queries = require('./supabase/queries');

function chatAutorizado(chatId) {
  return config.seguranca.allowedChatIds.includes(String(chatId));
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Ponto único de decisão para qualquer mensagem recebida. Retorna o texto a
 * responder, ou null se nada deve ser respondido (chat não autorizado).
 */
async function handleIncomingMessage(chatId, texto) {
  if (!chatAutorizado(chatId)) {
    logger.warn(`[index] mensagem de chat não autorizado ignorada: ${chatId}`);
    return null;
  }

  const propostaPendente = pendentes.obterPropostaValida(chatId);

  if (propostaPendente && confirmacao.ehConfirmacao(texto)) {
    try {
      const id = await queries.lancarTransacao(propostaPendente);
      pendentes.limparProposta(chatId);
      logger.info(`[index] transação lançada via confirmação Telegram: ${id}`);
      return (
        `Lançado. ${propostaPendente.descricao} — ${formatarMoeda(propostaPendente.valor)} ` +
        `em ${propostaPendente.caixaNome}.`
      );
    } catch (erro) {
      logger.error('[index] falha ao lançar transação confirmada:', erro.message);
      return `Deu erro ao gravar no Supabase: ${erro.message}. Nada foi lançado, pode tentar de novo.`;
    }
  }

  if (propostaPendente && confirmacao.ehCancelamento(texto)) {
    pendentes.limparProposta(chatId);
    return 'Cancelado. Nada foi lançado.';
  }

  try {
    return await claudeAgent.processarMensagem({ chatId, texto });
  } catch (erro) {
    logger.error('[index] erro no agente:', erro);
    return 'Tive um erro interno processando isso. Tenta de novo em alguns instantes.';
  }
}

async function main() {
  logger.info(`[index] telegram-agent iniciando (allowlist: ${config.seguranca.allowedChatIds.length} chat(s) autorizado(s)).`);
  if (config.seguranca.allowedChatIds.length === 0) {
    logger.warn('[index] ALLOWED_TELEGRAM_CHAT_IDS vazio — nenhuma mensagem será respondida até você preencher o .env (ver PROXIMOS_PASSOS.md pra descobrir seu chat_id).');
  }

  await telegram.iniciarPolling(async (chatId, texto) => {
    const textoResposta = await handleIncomingMessage(chatId, texto);
    if (textoResposta) {
      try {
        await telegram.enviarMensagem(chatId, textoResposta);
      } catch (erro) {
        logger.error('[index] falha ao enviar resposta:', erro.message);
      }
    }
  });
}

main().catch((erro) => {
  logger.error('[index] erro fatal no boot:', erro);
  process.exit(1);
});
