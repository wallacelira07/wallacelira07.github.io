// src/config.js
// Carrega e valida as variáveis de ambiente. Falha rápido (erro claro no boot)
// em vez de falhar tarde com um erro obscuro no meio de uma conversa real.

require('dotenv').config();

function obrigatoria(nome) {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `[config] Variável de ambiente obrigatória ausente: ${nome}. ` +
        `Veja .env.example.`
    );
  }
  return valor;
}

const allowedChatIdsRaw = process.env.ALLOWED_TELEGRAM_CHAT_IDS || '';
const allowedChatIds = allowedChatIdsRaw
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

const config = {
  telegram: {
    botToken: obrigatoria('TELEGRAM_BOT_TOKEN'),
    // Long polling não precisa de porta/webhook público — este intervalo é só
    // o timeout do "long" em long-polling (o Telegram segura a conexão aberta
    // até ter uma mensagem nova ou até esse tempo passar, então repetimos).
    pollingTimeoutSegundos: Number(process.env.TELEGRAM_POLLING_TIMEOUT_SEGUNDOS || 30),
  },

  anthropic: {
    apiKey: obrigatoria('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
  },

  supabase: {
    url: obrigatoria('SUPABASE_URL'),
    serviceRoleKey: obrigatoria('SUPABASE_SERVICE_ROLE_KEY'),
  },

  seguranca: {
    // Allowlist de chat_ids autorizados. Vazia = NINGUÉM autorizado (falha
    // segura) — só fica vazia de fato se o operador não preencheu o .env.
    allowedChatIds,
  },

  confirmacao: {
    timeoutMinutos: Number(process.env.CONFIRMATION_TIMEOUT_MINUTES || 15),
  },
};

module.exports = config;
