// src/whatsapp/metaCloudApi.js
// Integração com a WhatsApp Business Cloud API oficial (Meta). Rota de
// produção real — exige número verificado, App revisado pela Meta e HTTPS
// público. Ver README.md para trade-offs vs. Twilio Sandbox e
// PROXIMOS_PASSOS.md para o passo a passo de cadastro (ação humana).

const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

const GRAPH_API_VERSION = 'v20.0';

/**
 * Responde ao GET de verificação que a Meta faz ao salvar a URL do webhook
 * no painel do App. Precisa devolver `hub.challenge` em texto puro se
 * `hub.verify_token` bater com o token que você escolheu.
 */
function tratarVerificacaoWebhook(query) {
  const modo = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (modo === 'subscribe' && token === config.whatsapp.meta.verifyToken) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

/**
 * Valida a assinatura HMAC-SHA256 que a Meta envia em todo POST
 * (X-Hub-Signature-256: sha256=<hex>), calculada sobre o corpo bruto (raw)
 * da requisição com o App Secret. NUNCA processar um webhook da Meta sem
 * essa validação em produção — sem ela, qualquer pessoa que descubra a URL
 * pode mandar payload forjado.
 */
function validarAssinatura(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const esperado =
    'sha256=' +
    crypto
      .createHmac('sha256', config.whatsapp.meta.appSecret)
      .update(rawBody)
      .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(esperado));
  } catch {
    return false; // tamanhos diferentes etc — trata como inválida, nunca lança.
  }
}

/**
 * Extrai as mensagens de texto de um payload de webhook da Cloud API.
 * Formato real (simplificado): body.entry[].changes[].value.messages[].
 * Ignora silenciosamente eventos que não são mensagem de texto (status de
 * entrega, reações, etc.) — este scaffold só lida com texto.
 */
function extrairMensagens(body) {
  const mensagens = [];
  const entradas = body?.entry || [];
  for (const entrada of entradas) {
    for (const mudanca of entrada.changes || []) {
      const valor = mudanca.value || {};
      for (const msg of valor.messages || []) {
        if (msg.type === 'text' && msg.text?.body) {
          mensagens.push({ de: msg.from, texto: msg.text.body, idMensagem: msg.id });
        } else {
          logger.info('[meta] ignorando mensagem não-texto:', msg.type);
        }
      }
    }
  }
  return mensagens;
}

async function enviarTexto(numeroDestino, texto) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.whatsapp.meta.phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.meta.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numeroDestino,
      type: 'text',
      text: { body: texto },
    }),
  });

  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`[meta] falha ao enviar mensagem (${resp.status}): ${corpo}`);
  }
  return resp.json();
}

module.exports = { tratarVerificacaoWebhook, validarAssinatura, extrairMensagens, enviarTexto };
