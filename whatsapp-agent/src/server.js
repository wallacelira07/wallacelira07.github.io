// src/server.js
// Servidor webhook mínimo. Ponto de entrada único: toda mensagem recebida
// (Meta ou Twilio) passa por handleIncomingMessage(), que decide, em código
// determinístico, entre 3 caminhos:
//   1. Número fora da allowlist -> ignorado (log apenas, sem resposta).
//   2. Existe proposta pendente e a mensagem é "sim"/"não" -> confirma/cancela
//      SEM chamar o modelo (evita que uma prompt injection na resposta do
//      usuário mude o comportamento de confirmação).
//   3. Qualquer outra mensagem -> vai para o agente (Claude + tools).
//
// Ver docs/MANUAL_OPERACIONAL_AGENTES.md seção 2 (regra 1) e seção 8
// (proibições) — a regra "nunca lançar sem confirmação explícita" é aplicada
// aqui, não delegada ao modelo.

const express = require('express');
const config = require('./config');
const logger = require('./logger');
const whatsapp = require('./whatsapp');
const metaCloudApi = require('./whatsapp/metaCloudApi');
const twilioSandbox = require('./whatsapp/twilioSandbox');
const claudeAgent = require('./agent/claudeAgent');
const pendentes = require('./conversation/pendingConfirmations');
const confirmacao = require('./utils/confirmationWords');
const queries = require('./supabase/queries');

const app = express();

function numeroAutorizado(numero) {
  return config.seguranca.allowedNumbers.includes(numero);
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Ponto único de decisão para qualquer mensagem recebida, de qualquer
 * provider. Retorna o texto a responder, ou null se nada deve ser
 * respondido (número não autorizado).
 */
async function handleIncomingMessage(numeroTelefone, texto) {
  if (!numeroAutorizado(numeroTelefone)) {
    logger.warn(`[server] mensagem de número não autorizado ignorada: ${numeroTelefone}`);
    return null;
  }

  const propostaPendente = pendentes.obterPropostaValida(numeroTelefone);

  if (propostaPendente && confirmacao.ehConfirmacao(texto)) {
    try {
      const id = await queries.lancarTransacao(propostaPendente);
      pendentes.limparProposta(numeroTelefone);
      logger.info(`[server] transação lançada via confirmação WhatsApp: ${id}`);
      return (
        `Lançado. ${propostaPendente.descricao} — ${formatarMoeda(propostaPendente.valor)} ` +
        `em ${propostaPendente.caixaNome}.`
      );
    } catch (erro) {
      logger.error('[server] falha ao lançar transação confirmada:', erro.message);
      return `Deu erro ao gravar no Supabase: ${erro.message}. Nada foi lançado, pode tentar de novo.`;
    }
  }

  if (propostaPendente && confirmacao.ehCancelamento(texto)) {
    pendentes.limparProposta(numeroTelefone);
    return 'Cancelado. Nada foi lançado.';
  }

  try {
    return await claudeAgent.processarMensagem({ numeroTelefone, texto });
  } catch (erro) {
    logger.error('[server] erro no agente:', erro);
    return 'Tive um erro interno processando isso. Tenta de novo em alguns instantes.';
  }
}

// ---------------------------------------------------------------------------
// Rotas Meta (WhatsApp Business Cloud API)
// ---------------------------------------------------------------------------

// Verificação do webhook — a Meta chama isso uma vez ao salvar a URL no painel.
app.get('/webhook/meta', (req, res) => {
  const resultado = metaCloudApi.tratarVerificacaoWebhook(req.query);
  if (resultado.ok) {
    res.status(200).send(resultado.challenge);
  } else {
    res.sendStatus(403);
  }
});

// Recebimento de mensagens. Precisa do corpo bruto (raw) para validar a
// assinatura X-Hub-Signature-256 antes de fazer JSON.parse.
app.post(
  '/webhook/meta',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const assinatura = req.get('X-Hub-Signature-256');
    if (!metaCloudApi.validarAssinatura(req.body, assinatura)) {
      logger.warn('[meta] assinatura inválida, requisição rejeitada.');
      return res.sendStatus(401);
    }

    // Responde 200 imediatamente (a Meta espera resposta rápida) e processa
    // depois — evita retry duplicado da Meta por timeout.
    res.sendStatus(200);

    let corpo;
    try {
      corpo = JSON.parse(req.body.toString('utf-8'));
    } catch (erro) {
      logger.error('[meta] payload não é JSON válido:', erro.message);
      return;
    }

    const mensagens = metaCloudApi.extrairMensagens(corpo);
    for (const msg of mensagens) {
      const textoResposta = await handleIncomingMessage(msg.de, msg.texto);
      if (textoResposta) {
        try {
          await whatsapp.enviarMensagem(msg.de, textoResposta);
        } catch (erro) {
          logger.error('[meta] falha ao enviar resposta:', erro.message);
        }
      }
    }
  }
);

// ---------------------------------------------------------------------------
// Rotas Twilio (WhatsApp Sandbox)
// ---------------------------------------------------------------------------

app.post(
  '/webhook/twilio',
  express.urlencoded({ extended: false }),
  async (req, res) => {
    // Validação de assinatura simplificada — ver twilioSandbox.js para a
    // ressalva sobre usar o pacote oficial 'twilio' em produção.
    const assinatura = req.get('X-Twilio-Signature');
    const urlCompleta = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    if (!twilioSandbox.validarAssinatura(urlCompleta, req.body, assinatura)) {
      logger.warn('[twilio] assinatura inválida, requisição rejeitada.');
      return res.sendStatus(401);
    }

    res.status(200).send('<Response></Response>'); // TwiML vazio — resposta assíncrona vem por fora.

    const mensagens = twilioSandbox.extrairMensagens(req.body);
    for (const msg of mensagens) {
      const textoResposta = await handleIncomingMessage(msg.de, msg.texto);
      if (textoResposta) {
        try {
          await whatsapp.enviarMensagem(msg.de, textoResposta);
        } catch (erro) {
          logger.error('[twilio] falha ao enviar resposta:', erro.message);
        }
      }
    }
  }
);

// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
  logger.info(`[server] whatsapp-agent rodando na porta ${config.port} (provider: ${config.whatsapp.provider})`);
});
