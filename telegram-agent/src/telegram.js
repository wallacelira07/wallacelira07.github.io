// src/telegram.js
// Cliente mínimo do Telegram Bot API via fetch direto — sem SDK, sem webhook,
// sem servidor HTTP público. Usa "long polling" (getUpdates): o próprio
// script pergunta ao Telegram "tem mensagem nova?", em loop; o Telegram
// segura a resposta até ter algo novo ou até o timeout passar. Isso é o que
// elimina ngrok/hospedagem/certificado HTTPS do protótipo whatsapp-agent —
// dá pra rodar isto no seu próprio computador, sem IP público nenhum.
//
// Documentação oficial: https://core.telegram.org/bots/api#getupdates

const config = require('./config');
const logger = require('./logger');

const BASE_URL = `https://api.telegram.org/bot${config.telegram.botToken}`;

/**
 * Busca mensagens novas (bloqueia até ter uma ou até o timeout, então nunca
 * fica pedindo à toa em loop apertado — "long" polling de verdade).
 * @param {number} offset - update_id do próximo update esperado (ver getUpdates da doc oficial).
 */
async function buscarAtualizacoes(offset) {
  const params = new URLSearchParams({
    timeout: String(config.telegram.pollingTimeoutSegundos),
    allowed_updates: JSON.stringify(['message']),
  });
  if (offset !== undefined) params.set('offset', String(offset));

  const resp = await fetch(`${BASE_URL}/getUpdates?${params.toString()}`);
  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`[telegram] getUpdates falhou (${resp.status}): ${corpo}`);
  }
  const dado = await resp.json();
  if (!dado.ok) {
    throw new Error(`[telegram] getUpdates retornou ok=false: ${JSON.stringify(dado)}`);
  }
  return dado.result; // array de updates
}

/**
 * Envia uma mensagem de texto para um chat.
 * @param {number|string} chatId
 * @param {string} texto
 */
async function enviarMensagem(chatId, texto) {
  const resp = await fetch(`${BASE_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`[telegram] sendMessage falhou (${resp.status}): ${corpo}`);
  }
}

/**
 * Loop principal: fica perguntando ao Telegram por mensagens novas pra
 * sempre, chamando `onMensagem(chatId, texto)` para cada uma. Nunca retorna
 * (é o "servidor" deste protótipo — mantenha o processo rodando com
 * `npm start`, ou um gerenciador tipo pm2 se quiser mais robustez).
 */
async function iniciarPolling(onMensagem) {
  let offset;
  logger.info('[telegram] polling iniciado — aguardando mensagens (Ctrl+C para parar).');
  for (;;) {
    try {
      const atualizacoes = await buscarAtualizacoes(offset);
      for (const upd of atualizacoes) {
        offset = upd.update_id + 1; // confirma pro Telegram que já processamos até aqui
        const msg = upd.message;
        if (!msg || !msg.text) continue; // ignora não-texto (foto, sticker, etc) por enquanto
        try {
          await onMensagem(msg.chat.id, msg.text);
        } catch (erro) {
          logger.error('[telegram] erro processando mensagem:', erro);
        }
      }
    } catch (erro) {
      logger.error('[telegram] erro no polling, tentando de novo em 5s:', erro.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = { iniciarPolling, enviarMensagem };
