/**
 * CycleEngine.js — Sistema Wallace Lira, Arquitetura V2, Fase 2A
 * ================================================================
 * NOVO 06/08/2026. Extração pura de `aplicarCicloAoVARS()` (`app.js`), o
 * bloqueador central identificado em `MAPA_COMPLETO_APLICAR_CICLO.md`.
 *
 * REGRA DESTA FASE: função PURA — recebe tudo por parâmetro, não lê nem
 * escreve `VARS`, não toca DOM, não muta nada. Devolve um objeto novo
 * (`EstadoDoCiclo`) — quem chama decide o que fazer com ele (aplicar em
 * `VARS` continua sendo trabalho da Fase 2D, ainda não feito aqui).
 *
 * Já incorpora a correção do BUG_CONFIRMADO_V1_LRC_OBSOLETO (ver
 * CORRECAO_BUG_LRC.md): `livroLRC` é sempre recalculado a partir do array
 * do ciclo já resolvido nesta mesma chamada — nunca lê um valor congelado
 * de fora. Conecta ao FinanceEngine (Fase 2B, parcial): usa
 * `calcularReembolsos()` de lá em vez de duplicar a fórmula da cascata.
 *
 * O que este arquivo NÃO faz ainda:
 * - Não é chamado pelo `app.js` (Fase 2D, substituição controlada).
 * - Não decide quem escreve o resultado em `VARS` — devolve só o objeto.
 */

const { calcularReembolsos } = require('./FinanceEngine.js');

/**
 * Resolve o estado completo de um ciclo (os mesmos 17 campos que
 * `aplicarCicloAoVARS` escrevia em `VARS`, aqui devolvidos como objeto).
 *
 * @param {string} cicloKey - chave do ciclo, ex: '2026-07'
 * @param {object} contexto
 * @param {object} contexto.snapshots - equivalente a VARS.CICLO_SNAPSHOTS
 * @param {object} contexto.estadoVivo - os 7 campos "*_CICLO_ATUAL" (cartaoInfiniteTotal,
 *   cartaoMBTotal, mercadoPagoFatura, LRW_TRANSACOES, LRV_TRANSACOES,
 *   LRC_LIMBO_TRANSACOES, LRPV_TRANSACOES) — só usados se o ciclo NÃO estiver fechado
 * @param {number} [contexto.livroLRCVisaOnly] - parte do LRC que é do Visa (hoje sempre 0, V159)
 * @returns {{ erro: string }|object} EstadoDoCiclo, ou { erro } se cicloKey não existir
 */
function resolverCiclo(cicloKey, { snapshots, estadoVivo, livroLRCVisaOnly = 0 }) {
  const snap = snapshots[cicloKey];
  if (!snap) {
    return { erro: `Ciclo não encontrado: ${cicloKey}` };
  }

  // Decide a FONTE dos 7 campos "de cartão/livro": fotografia congelada do
  // snapshot (ciclo fechado) ou estado vivo capturado no boot (ciclo atual).
  const fonte = snap.fechado
    ? {
        cartaoInfiniteTotal: snap.visaInfiniteComprometido,
        cartaoMBTotal: snap.mastercardBlackComprometido,
        mercadoPagoFatura: snap.mercadoPagoFaturaCongelada,
        LRW_TRANSACOES: snap.LRW_TRANSACOES,
        LRV_TRANSACOES: snap.LRV_TRANSACOES,
        LRC_LIMBO_TRANSACOES: snap.LRC_LIMBO_TRANSACOES,
        LRPV_TRANSACOES: snap.LRPV_TRANSACOES,
      }
    : {
        cartaoInfiniteTotal: estadoVivo.cartaoInfiniteTotal,
        cartaoMBTotal: estadoVivo.cartaoMBTotal,
        mercadoPagoFatura: estadoVivo.mercadoPagoFatura,
        LRW_TRANSACOES: estadoVivo.LRW_TRANSACOES,
        LRV_TRANSACOES: estadoVivo.LRV_TRANSACOES,
        LRC_LIMBO_TRANSACOES: estadoVivo.LRC_LIMBO_TRANSACOES,
        LRPV_TRANSACOES: estadoVivo.LRPV_TRANSACOES,
      };

  // livroLRC SEMPRE recalculado a partir do array já resolvido pra este ciclo
  // (correção do BUG_CONFIRMADO_V1_LRC_OBSOLETO — nunca um valor de fora congelado).
  const livroLRC = Math.round(fonte.LRC_LIMBO_TRANSACOES.reduce((s, t) => s + t.valor, 0) * 100) / 100;

  // Cascata de reembolso — delega ao FinanceEngine (Fase 2B: conectado, não duplicado).
  const cascata = calcularReembolsos({
    reembolsoRecebido: snap.reembolsoRecebido,
    reembolsoAReceber: snap.reembolsoAReceber,
    faturaWartsila: snap.cascata.faturaWartsila,
    mpCorporativo: snap.cascata.mpCorporativo,
    livroLRCVisaOnly,
    livroLRC,
    totalOpProvMP: 0, // sobraPessoal não é campo do ciclo (é fluxo contínuo) — não usado aqui
  });

  return {
    cicloAtual: cicloKey,
    caixaVariavelSaldoReal: snap.caixaVariavelSaldoReal,
    caixaVariavelComprometido: snap.caixaVariavelComprometido,
    tolerenciaTemp: snap.toleranciaTempValor,
    salario: snap.salario,
    reembolsoCicloTotal: cascata.reembolsoCicloTotal,
    reembolsosAReceber: snap.reembolsoAReceber,
    faturaWartsila: snap.cascata.faturaWartsila,
    reembolsoPagaCartaoCorporativo: cascata.cartaoCorporativo,
    reembolsoPagaMPCorporativo: snap.cascata.mpCorporativo,
    cartaoInfiniteTotal: fonte.cartaoInfiniteTotal,
    cartaoMBTotal: fonte.cartaoMBTotal,
    mercadoPagoFatura: fonte.mercadoPagoFatura,
    LRW_TRANSACOES: fonte.LRW_TRANSACOES,
    LRV_TRANSACOES: fonte.LRV_TRANSACOES,
    LRC_LIMBO_TRANSACOES: fonte.LRC_LIMBO_TRANSACOES,
    LRPV_TRANSACOES: fonte.LRPV_TRANSACOES,
    livroLRC, // extra, exposto pra quem precisar (não existia como campo próprio no VARS original)
  };
}

module.exports = { resolverCiclo };
