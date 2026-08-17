// src/utils/confirmationWords.js
// Reconhecimento determinístico de "sim"/"não" em português coloquial de
// WhatsApp. Deliberadamente estreito: preferimos pedir de novo a interpretar
// "sim" onde não há certeza (mesmo princípio do manual P1 — nunca inventar/
// assumir na dúvida).

const PALAVRAS_CONFIRMACAO = [
  'sim', 'sim.', 'sim!', 's', 'ok', 'okay', 'confirmo', 'confirmado',
  'pode lançar', 'pode lancar', 'pode confirmar', 'isso', 'exato',
  'correto', 'positivo', 'afirmativo',
];

const PALAVRAS_CANCELAMENTO = [
  'não', 'nao', 'não.', 'nao.', 'n', 'cancela', 'cancelar', 'cancelado',
  'esquece', 'para', 'pera', 'errado', 'negativo',
];

function normalizar(texto) {
  return (texto || '').trim().toLowerCase();
}

function ehConfirmacao(texto) {
  const t = normalizar(texto);
  return PALAVRAS_CONFIRMACAO.includes(t);
}

function ehCancelamento(texto) {
  const t = normalizar(texto);
  return PALAVRAS_CANCELAMENTO.includes(t);
}

module.exports = { ehConfirmacao, ehCancelamento };
