// src/conversation/pendingConfirmations.js
//
// Estado de "proposta de lançamento esperando confirmação", por chat_id do
// Telegram. Isto é o mecanismo de segurança central deste protótipo — a
// regra não-negociável do manual (seção 2, regra 1; seção 8 "Lançar
// transação financeira sem confirmação explícita do usuário" está na lista
// de PROCEDIMENTOS PROIBIDOS) é aplicada AQUI, em código determinístico, não
// como uma instrução de prompt que o modelo poderia ignorar/ser induzido a
// pular.
//
// Fluxo:
//   1. O modelo (agent/tools.js -> propor_lancamento) NUNCA grava no banco.
//      Ele só monta os campos e chama registrarProposta(), que devolve o
//      texto de confirmação para o modelo repetir ao usuário.
//   2. index.js, ANTES de invocar o modelo a cada mensagem nova, checa se
//      existe proposta pendente para aquele chat_id e se o texto recebido é
//      um "sim" inequívoco (ver utils/confirmationWords.js). Só nesse caso
//      (código, não modelo) ele chama supabase/queries.js#lancarTransacao.
//   3. Qualquer outra resposta ("não", mensagem nova, silêncio) nunca grava
//      nada. Proposta expira sozinha depois de N minutos (config
//      CONFIRMATION_TIMEOUT_MINUTES) — evita confirmar "sim" de uma proposta
//      antiga por engano, mesma cautela dos incidentes de duplicata da Inbox
//      Financeira documentados no manual.
//
// LIMITAÇÃO CONHECIDA DO PROTÓTIPO: isto é um Map em memória do processo.
// Reiniciar o processo perde qualquer proposta pendente (o usuário só
// precisa perguntar de novo, não é destrutivo). Para uso mais robusto, mover
// este estado para uma tabela no Supabase — ver PROXIMOS_PASSOS.md.

const config = require('../config');
const logger = require('../logger');

/** @type {Map<number, { proposta: object, criadoEm: number }>} */
const pendentes = new Map();

function registrarProposta(chatId, proposta) {
  pendentes.set(chatId, { proposta, criadoEm: Date.now() });
  logger.info(`[confirmacao] proposta registrada para chat ${chatId}:`, {
    descricao: proposta.descricao,
    valor: proposta.valor,
  });
}

function obterPropostaValida(chatId) {
  const entrada = pendentes.get(chatId);
  if (!entrada) return null;

  const limiteMs = config.confirmacao.timeoutMinutos * 60 * 1000;
  const expirada = Date.now() - entrada.criadoEm > limiteMs;
  if (expirada) {
    pendentes.delete(chatId);
    logger.info(`[confirmacao] proposta do chat ${chatId} expirou, descartada.`);
    return null;
  }
  return entrada.proposta;
}

function limparProposta(chatId) {
  pendentes.delete(chatId);
}

module.exports = { registrarProposta, obterPropostaValida, limparProposta };
