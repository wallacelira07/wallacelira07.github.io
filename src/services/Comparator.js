/**
 * Comparator.js — Sistema Wallace Lira, Arquitetura V2, Fase 2C.3
 * ==================================================================
 * NOVO 06/08/2026. Camada de comparação `resultado_antigo` (o que o
 * `app.js`/V1 mostra hoje) vs `resultado_engine` (o que o `FinanceEngine`/
 * `CycleEngine` calcula) — gera log de divergência. NÃO altera UI, NÃO
 * decide nada — só registra. Regra: função pura, sem I/O, sem DOM.
 */

const TOLERANCIA_PADRAO = 0.005; // meio centavo — mesma tolerância usada em todos os testes desta sessão

/** Compara 1 par de resultados. Devolve um registro de log, nunca lança erro. */
function compararResultado(nome, resultadoAntigo, resultadoEngine, tolerancia = TOLERANCIA_PADRAO) {
  const diferenca = typeof resultadoAntigo === 'number' && typeof resultadoEngine === 'number'
    ? Math.round((resultadoEngine - resultadoAntigo) * 100) / 100
    : null;
  const divergente = diferenca === null
    ? resultadoAntigo !== resultadoEngine
    : Math.abs(diferenca) > tolerancia;
  return {
    nome,
    resultadoAntigo,
    resultadoEngine,
    diferenca,
    divergente,
    timestamp: null, // preenchido por quem chama, se precisar (função pura não lê relógio)
  };
}

/** Roda uma lista de pares {nome, antigo, novo} e devolve o log completo +
 * um resumo (quantos divergiram). Não lança nem interrompe no primeiro erro
 * — cada item é independente, pra 1 divergência não escondida as outras. */
function compararLote(pares, tolerancia = TOLERANCIA_PADRAO) {
  const log = pares.map((p) => compararResultado(p.nome, p.antigo, p.novo, tolerancia));
  const divergencias = log.filter((r) => r.divergente);
  return {
    log,
    totalComparado: log.length,
    totalDivergente: divergencias.length,
    pronto: divergencias.length === 0, // true = seguro pra considerar a troca (Fase 2D) pra este lote
    divergencias,
  };
}

/** Formata o log pra impressão legível (console, ou futuro painel de auditoria). */
function formatarLog(resultadoLote) {
  const linhas = resultadoLote.log.map((r) => {
    const status = r.divergente ? '❌ DIVERGENTE' : '✅ OK';
    const diffTexto = r.diferenca !== null ? ` (diferença: ${r.diferenca})` : '';
    return `${status} — ${r.nome}: antigo=${JSON.stringify(r.resultadoAntigo)}, engine=${JSON.stringify(r.resultadoEngine)}${diffTexto}`;
  });
  linhas.push(`\n${resultadoLote.totalComparado - resultadoLote.totalDivergente}/${resultadoLote.totalComparado} sem divergência.`);
  return linhas.join('\n');
}

module.exports = { compararResultado, compararLote, formatarLog, TOLERANCIA_PADRAO };
