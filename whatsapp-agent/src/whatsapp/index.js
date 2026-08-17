// src/whatsapp/index.js
// Ponto único de saída de mensagens, independente do provider configurado
// (WHATSAPP_PROVIDER=twilio|meta). O recebimento (webhook) continua
// provider-específico em server.js, porque os formatos de payload de entrada
// são bem diferentes (JSON vs. form-urlencoded, estrutura de campos) — não
// vale a pena forçar uma abstração ali. O envio, por outro lado, é só "manda
// texto para um número", então faz sentido unificar.

const config = require('../config');
const meta = require('./metaCloudApi');
const twilio = require('./twilioSandbox');

async function enviarMensagem(numeroDestino, texto) {
  if (config.whatsapp.provider === 'meta') {
    return meta.enviarTexto(numeroDestino, texto);
  }
  return twilio.enviarTexto(numeroDestino, texto);
}

module.exports = { enviarMensagem };
