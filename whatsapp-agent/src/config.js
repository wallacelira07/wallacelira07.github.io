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

const provider = (process.env.WHATSAPP_PROVIDER || 'twilio').toLowerCase();
if (!['twilio', 'meta'].includes(provider)) {
  throw new Error(
    `[config] WHATSAPP_PROVIDER inválido: "${provider}". Use "twilio" ou "meta".`
  );
}

const allowedNumbersRaw = process.env.WALLACE_WHATSAPP_ALLOWED_NUMBERS || '';
const allowedNumbers = allowedNumbersRaw
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

const config = {
  port: Number(process.env.PORT || 3000),

  anthropic: {
    apiKey: obrigatoria('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
  },

  supabase: {
    url: obrigatoria('SUPABASE_URL'),
    serviceRoleKey: obrigatoria('SUPABASE_SERVICE_ROLE_KEY'),
  },

  whatsapp: {
    provider,
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_WHATSAPP_FROM || '',
    },
    meta: {
      token: process.env.WHATSAPP_META_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID || '',
      verifyToken: process.env.WHATSAPP_META_VERIFY_TOKEN || '',
      appSecret: process.env.WHATSAPP_META_APP_SECRET || '',
    },
  },

  seguranca: {
    // Allowlist de números autorizados. Vazia = NINGUÉM autorizado (falha
    // segura) — só fica de fato vazia se o operador não preencheu o .env.
    allowedNumbers,
  },

  confirmacao: {
    timeoutMinutos: Number(process.env.CONFIRMATION_TIMEOUT_MINUTES || 15),
  },
};

module.exports = config;
