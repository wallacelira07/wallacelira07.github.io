// src/agent/claudeAgent.js
// Loop manual de tool-use com a API de Mensagens da Anthropic. Loop manual
// (não o Tool Runner beta) para manter este scaffold sem dependência beta e
// fácil de auditar linha a linha — trade-off deliberado, ver README.md.

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const logger = require('../logger');
const SYSTEM_PROMPT = require('./systemPrompt');
const { definicoesTools, executarTool } = require('./tools');

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const MAX_ITERACOES_TOOL_USE = 8; // trava de segurança contra loop infinito de tools.

/**
 * Processa uma mensagem de WhatsApp e devolve o texto de resposta.
 * @param {object} params
 * @param {string} params.numeroTelefone - número E.164 de quem escreveu.
 * @param {string} params.texto - texto da mensagem.
 * @returns {Promise<string>} resposta a enviar de volta pelo WhatsApp.
 */
async function processarMensagem({ numeroTelefone, texto }) {
  const mensagens = [{ role: 'user', content: texto }];
  const contexto = { numeroTelefone };

  for (let iteracao = 0; iteracao < MAX_ITERACOES_TOOL_USE; iteracao++) {
    const resposta = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: definicoesTools,
      messages: mensagens,
    });

    if (resposta.stop_reason === 'refusal') {
      logger.warn('[agent] resposta recusada pelos classificadores de segurança do modelo.');
      return (
        'Não consigo ajudar com esse pedido específico. Se for sobre uma ' +
        'transação real, tenta descrever de outro jeito ou me diz os campos ' +
        'direto (data, valor, descrição, caixa).'
      );
    }

    // Sempre ecoar o content completo de volta no histórico antes de decidir
    // o que fazer — preserva blocos tool_use para o próximo turno.
    mensagens.push({ role: 'assistant', content: resposta.content });

    if (resposta.stop_reason !== 'tool_use') {
      const blocoTexto = resposta.content.find((b) => b.type === 'text');
      return blocoTexto ? blocoTexto.text : '(sem resposta de texto)';
    }

    const blocosToolUse = resposta.content.filter((b) => b.type === 'tool_use');
    const resultadosTool = [];

    for (const bloco of blocosToolUse) {
      try {
        const resultado = await executarTool(bloco.name, bloco.input, contexto);
        resultadosTool.push({
          type: 'tool_result',
          tool_use_id: bloco.id,
          content: JSON.stringify(resultado),
        });
      } catch (erro) {
        logger.error(`[agent] erro executando tool ${bloco.name}:`, erro.message);
        resultadosTool.push({
          type: 'tool_result',
          tool_use_id: bloco.id,
          content: `Erro ao executar a tool: ${erro.message}`,
          is_error: true,
        });
      }
    }

    mensagens.push({ role: 'user', content: resultadosTool });
  }

  logger.warn('[agent] limite de iterações de tool-use atingido sem resposta final.');
  return 'Isso ficou mais complicado do que eu esperava — pode reformular ou tentar de novo?';
}

module.exports = { processarMensagem };
