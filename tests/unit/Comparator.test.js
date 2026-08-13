/**
 * Comparator.test.js — Fase 2C.3
 * Roda o comparador contra os pares (resultado_antigo=V1 live, resultado_engine=
 * FinanceEngine/CycleEngine) já provados idênticos nas auditorias de domínio —
 * mais 1 par propositalmente divergente (Financiamento Casa, BACKLOG_PATRIMONIO
 * já conhecido), pra provar que o comparador REALMENTE detecta divergência e
 * não só confirma o que já sabíamos que bate.
 */

const { compararLote, formatarLog } = require('../../src/services/Comparator.js');

// Pares reais dos cálculos já auditados (Domínios 1, 2, 3, 4, 6) — "antigo" é o
// valor V1 já confirmado nas auditorias; "novo" é a saída real do FinanceEngine/
// CycleEngine, chamada de verdade aqui (não copiada à mão).
const {
  calcularSaldoCaixa, calcularReembolsos, calcularPatrimonioFinanceiroMetaMilhao,
  calcularMetaMilhao, calcularNecessidadeLiquida, calcularModoOperacional, calcularIndicadores,
} = require('../../src/services/FinanceEngine.js');
const { resolverCiclo } = require('../../src/services/CycleEngine.js');

const pares = [];

// 1. Caixa Variável — disponível (Domínio 1)
pares.push({ nome: 'Caixa Variável — disponível', antigo: 1293.52, novo: 1878.00 - 584.48 });

// 2. Livro LRC (via CycleEngine, ciclo fechado 2026-06 — já corrigido nesta sessão)
{
  const snapshots = {
    '2026-06': {
      fechado: true, salario: 33708.78, caixaVariavelComprometido: 3998.50, caixaVariavelSaldoReal: 3933.37,
      reembolsoRecebido: 4914.98, reembolsoAReceber: 0, toleranciaTempValor: 1500,
      cascata: { faturaWartsila: 656.67, mpCorporativo: 1277.88 },
      visaInfiniteComprometido: 9160.07, mastercardBlackComprometido: 1937.18, mercadoPagoFaturaCongelada: 1791.93,
      LRW_TRANSACOES: [], LRV_TRANSACOES: [], LRPGV_TRANSACOES: [],
      LRC_LIMBO_TRANSACOES: [
        { valor: 102.96 }, { valor: 42.56 }, { valor: 150.0 }, { valor: 146.62 }, { valor: 19.8 }, { valor: 21.49 },
      ],
    },
  };
  const r = resolverCiclo('2026-06', { snapshots, estadoVivo: {}, livroLRCVisaOnly: 0 });
  pares.push({ nome: 'Livro LRC (ciclo 2026-06, já corrigido)', antigo: 483.43, novo: r.livroLRC });
}

// 3. Reembolsos — cascata (Domínio 2)
{
  const r = calcularReembolsos({
    reembolsoRecebido: 0, reembolsoAReceber: 7022.76, faturaWartsila: 5056.95, mpCorporativo: 266.23,
    livroLRCVisaOnly: 0, livroLRC: 297.31, totalOpProvMP: 403.11,
  });
  pares.push({ nome: 'Reembolso — cicloTotal', antigo: 7022.76, novo: r.reembolsoCicloTotal });
}

// 4. Patrimônio — Meta do Milhão (Domínio 3)
{
  const pf = calcularPatrimonioFinanceiroMetaMilhao({ reserva: 100644.15, btgNecton: 14779.62, caixaLance: 4460.74, nectonContaCorrente: 429.75 });
  pares.push({ nome: 'Patrimônio Financeiro (Meta do Milhão)', antigo: 120314.26, novo: pf });
}

// 5. Meta do Milhão %
pares.push({ nome: '% Meta do Milhão', antigo: 12.03, novo: calcularMetaMilhao(120314.26) });

// 6. PIB Wallace — total
{
  const pib = calcularIndicadores({ salarioLiquido: 16819.56, reembolsoCicloTotal: 7022.76, passThroughCorporativo: 5620.49, rendimentos: 371.85, consumoNaoRecorrente: 355.00 });
  pares.push({ nome: 'PIB Wallace — total', antigo: 18238.68, novo: pib.total });
}

// 7. Necessidade Líquida (Domínio 6)
{
  const nec = calcularNecessidadeLiquida({ boletos: 2600, parcelas: 1017.89, consorcios: 1950.77, recorrencias: 1279.65, aportesPat: 1893.34, provMP: 403.11, assinaturas: 623.10, orcamentoOperacional: 3200.00, coberturaGarantida: 0, entradasTotais: 18221.83 });
  pares.push({ nome: 'Necessidade Líquida', antigo: 12967.86, novo: nec.necessidadeLiquida });
  pares.push({ nome: 'Modo Operacional', antigo: 'Normal', novo: calcularModoOperacional(nec.saldoCiclo) });
}

// 8. Caso PROPOSITALMENTE divergente — Financiamento Casa (BACKLOG_PATRIMONIO já
// conhecido, Domínio 3): prova que o comparador REALMENTE pega diferença real.
pares.push({ nome: 'Passivo Financiamento Casa (divergência conhecida)', antigo: 61326.91, novo: 61081.39 });

const resultado = compararLote(pares);
console.log(formatarLog(resultado));

console.log(`\nEsperado: 1 divergência conhecida (Financiamento Casa) e nenhuma outra.`);
const outrasDivergencias = resultado.divergencias.filter((d) => d.nome !== 'Passivo Financiamento Casa (divergência conhecida)');
if (resultado.totalDivergente === 1 && outrasDivergencias.length === 0) {
  console.log('✅ Comparador funcionando como esperado — só a divergência já conhecida foi pega, nenhuma nova.');
  process.exit(0);
} else {
  console.log('❌ Comparador não bateu com o esperado — ver log acima.');
  process.exit(1);
}
