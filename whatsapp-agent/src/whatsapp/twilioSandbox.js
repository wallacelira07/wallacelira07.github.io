// src/whatsapp/twilioSandbox.js
// Integração com o Twilio WhatsApp Sandbox (ou um número Twilio já aprovado
// para WhatsApp). Rota recomendada para PROTOTIPAR: não exige aprovação da
// Meta, funciona minutos depois de criar a conta Twilio — troque para
// metaCloudApi.js quando for para produção real com número próprio. Ver
// README.md para a comparação completa.

const crypto = require('crypto');
const config = require('../config');

/**
 * Extrai a mensagem de um webhook do Twilio. O Twilio manda
 * application/x-www-form-urlencoded (não JSON) com, entre outros, os campos
 * `From` (ex: "whatsapp:+5541999999999"), `Body` (texto) e `MessageSid`.
 * server.js precisa registrar express.urlencoded() nesta rota.
 */
function extrairMensagens(body) {
  if (!body?.Body || !body?.From) return [];
  return [
    {
      de: body.From.replace(/^whatsapp:/, ''),
      texto: body.Body,
      idMensagem: body.MessageSid,
    },
  ];
}

/**
 * Validação de assinatura do Twilio (X-Twilio-Signature), algoritmo
 * documentado em https://www.twilio.com/docs/usage/webhooks/webhooks-security.
 * Implementação manual aqui para não adicionar a dependência 'twilio' só por
 * isso; para produção real, prefira `twilio.validateRequest(...)` do pacote
 * oficial — é mais testado que esta versão simplificada.
 */
function validarAssinatura(urlCompleta, parametros, signatureHeader) {
  if (!signatureHeader) return false;
  const chavesOrdenadas = Object.keys(parametros).sort();
  let dados = urlCompleta;
  for (const chave of chavesOrdenadas) {
    dados += chave + parametros[chave];
  }
  const esperado = crypto
    .createHmac('sha1', config.whatsapp.twilio.authToken)
    .update(Buffer.from(dados, 'utf-8'))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(esperado));
  } catch {
    return false;
  }
}

async function enviarTexto(numeroDestino, texto) {
  const { accountSid, authToken, from } = config.whatsapp.twilio;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const corpo = new URLSearchParams({
    From: from,
    To: numeroDestino.startsWith('whatsapp:') ? numeroDestino : `whatsapp:${numeroDestino}`,
    Body: texto,
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: corpo.toString(),
  });

  if (!resp.ok) {
    const corpoErro = await resp.text();
    throw new Error(`[twilio] falha ao enviar mensagem (${resp.status}): ${corpoErro}`);
  }
  return resp.json();
}

module.exports = { extrairMensagens, validarAssinatura, enviarTexto };
