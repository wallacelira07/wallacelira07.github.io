/**
 * CycleEngine.test.js — Fase 2A
 * ==============================
 * Valida `resolverCiclo()` contra os 2 ciclos REAIS que existem hoje no sistema
 * (`2026-06` fechado, `2026-07` atual) — mesmos literais do `CICLO_SNAPSHOTS`
 * do `app.js`, mesmos valores já confirmados em `CORRECAO_BUG_LRC.md`.
 *
 * Rodar: node src/services/CycleEngine.test.js
 */

const { resolverCiclo } = require('./CycleEngine.js');

let falhas = 0;
let total = 0;

function assertEqual(nome, obtido, esperado) {
  total++;
  const ok = typeof obtido === 'number' ? Math.abs(obtido - esperado) < 0.005 : obtido === esperado;
  if (!ok) {
    falhas++;
    console.log(`❌ ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
  } else {
    console.log(`✅ ${nome}: ${JSON.stringify(obtido)}`);
  }
}

// Snapshots reais (mesmos literais do app.js, CICLO_SNAPSHOTS)
const snapshots = {
  '2026-06': {
    fechado: true,
    salario: 33708.78,
    caixaVariavelComprometido: 3998.50,
    caixaVariavelSaldoReal: 3933.37,
    reembolsoRecebido: 4914.98,
    reembolsoAReceber: 0,
    toleranciaTempValor: 1500,
    cascata: { faturaWartsila: 656.67, mpCorporativo: 1277.88 },
    visaInfiniteComprometido: 9160.07,
    mastercardBlackComprometido: 1937.18,
    mercadoPagoFaturaCongelada: 1791.93,
    LRW_TRANSACOES: [{ tx: 'exemplo', valor: 1 }],
    LRV_TRANSACOES: [],
    LRPV_TRANSACOES: [],
    // array real do ciclo 2026-06 (mesmo usado na validação da correção do bug)
    LRC_LIMBO_TRANSACOES: [
      { tx: 'TX22001', valor: 102.96 }, { tx: 'TX22002', valor: 42.56 }, { tx: 'TX22003', valor: 150.0 },
      { tx: 'TX22004', valor: 146.62 }, { tx: 'TX22005', valor: 19.8 }, { tx: 'TX22006', valor: 21.49 },
    ],
  },
  '2026-07': {
    fechado: false,
    salario: 16819.56,
    caixaVariavelComprometido: 584.48,
    caixaVariavelSaldoReal: 1878.00,
    reembolsoRecebido: 0,
    reembolsoAReceber: 7022.76,
    toleranciaTempValor: 0,
    cascata: { faturaWartsila: 5056.95, mpCorporativo: 266.23 },
  },
};

// Estado vivo real do ciclo atual (equivalente às 7 constantes *_CICLO_ATUAL, Domínios 2/4)
const estadoVivo = {
  cartaoInfiniteTotal: 1017.89,
  cartaoMBTotal: 5633.11,
  mercadoPagoFatura: 0,
  LRW_TRANSACOES: [],
  LRV_TRANSACOES: [],
  LRPV_TRANSACOES: [],
  LRC_LIMBO_TRANSACOES: [{ tx: 'TX000158', valor: 215.86 }, { tx: 'TX000161', valor: 28.49 }, { tx: 'outros', valor: 52.96 }], // soma = 297.31
};

console.log('\n--- Ciclo 2026-06 (fechado) — mesmos valores já provados em CORRECAO_BUG_LRC.md ---');
{
  const r = resolverCiclo('2026-06', { snapshots, estadoVivo, livroLRCVisaOnly: 0 });
  assertEqual('Corporativo (perna 3) — CORRIGIDO', r.reembolsoPagaCartaoCorporativo, 483.43);
  assertEqual('reembolsoCicloTotal', r.reembolsoCicloTotal, 4914.98);
  assertEqual('livroLRC (exposto)', r.livroLRC, 483.43);
  assertEqual('cartaoInfiniteTotal (fonte: snapshot congelado)', r.cartaoInfiniteTotal, 9160.07);
  assertEqual('cartaoMBTotal (fonte: snapshot congelado)', r.cartaoMBTotal, 1937.18);
  assertEqual('caixaVariavelSaldoReal', r.caixaVariavelSaldoReal, 3933.37);
  assertEqual('tolerenciaTemp', r.tolerenciaTemp, 1500);
}

console.log('\n--- Ciclo 2026-07 (atual) — sem regressão, mesmos valores de sempre ---');
{
  const r = resolverCiclo('2026-07', { snapshots, estadoVivo, livroLRCVisaOnly: 0 });
  assertEqual('Corporativo (perna 3) — inalterado', r.reembolsoPagaCartaoCorporativo, 297.31);
  assertEqual('reembolsoCicloTotal', r.reembolsoCicloTotal, 7022.76);
  assertEqual('livroLRC (exposto)', r.livroLRC, 297.31);
  assertEqual('cartaoInfiniteTotal (fonte: estado vivo)', r.cartaoInfiniteTotal, 1017.89);
  assertEqual('cartaoMBTotal (fonte: estado vivo)', r.cartaoMBTotal, 5633.11);
}

console.log('\n--- Ciclo inexistente — tratamento de erro explícito (sem console.error silencioso) ---');
{
  const r = resolverCiclo('2099-01', { snapshots, estadoVivo });
  assertEqual('Erro explícito, não undefined silencioso', typeof r.erro, 'string');
}

console.log(`\n${total - falhas}/${total} testes passaram.`);
if (falhas > 0) {
  console.log(`${falhas} FALHA(S) — CycleEngine NÃO reproduz o app.js corrigido. Não conectar ainda.`);
  process.exit(1);
} else {
  console.log('Todos os testes passaram — CycleEngine reproduz exatamente o comportamento (já corrigido) do app.js.');
  process.exit(0);
}
