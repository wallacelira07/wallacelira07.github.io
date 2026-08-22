// ROBÔ: fechar_ciclo_financeiro.mjs — NOVO 19/08/2026 (pedido do usuário: automatizar a virada do
// ciclo financeiro, que até aqui era 100% manual — ver docs/decisions/AUTOMACAO_VIRADA_CICLO_FINANCEIRO.md
// pro histórico completo da decisão).
//
// POR QUE NÃO É PYTHON (diferente de todos os outros robôs deste projeto): "fechar o ciclo" precisa
// congelar ~15 campos (Necessidade Total, saldo da Caixa Variável, faturas de cartão, 4 Livros Razão
// inteiros) que só existem calculados DENTRO do navegador, depois de rodar centenas de linhas de
// fórmula em app.js/promocoes-financeengine.js/recalcular-necessidade.js. Reimplementar essa fórmula
// em Python seria duplicar lógica financeira crítica em 2 lugares — exatamente o tipo de risco que
// este projeto evita ativamente (regra: nenhuma fórmula financeira nasce duplicada). Em vez disso,
// este robô abre o PRÓPRIO site num navegador headless (Playwright), loga de verdade, deixa o JS real
// do site calcular tudo, e só então lê o resultado (window.REG/VARS) pra gravar o retrato congelado.
// Zero fórmula reimplementada — o "cálculo" é sempre o mesmo código que você vê na tela.
//
// SEGURANÇA: o LOGIN (email/senha) é só pra fazer o site calcular os números reais (a leitura de
// `transacoes` é protegida por RLS, exige sessão autenticada). A GRAVAÇÃO em si (chamada da RPC
// fechar_ciclo_financeiro) usa a chave service_role (mesma já usada por wwi_gerar_relatorio_mensal.py),
// não o login — dá pra girar/revogar a senha de login sem quebrar a gravação, e vice-versa.
//
// IDEMPOTÊNCIA: a RPC fechar_ciclo_financeiro recusa rodar de novo se já existir uma linha pro
// ciclo_key novo, ou se não houver exatamente 1 ciclo aberto — rodar 2x no mesmo dia por engano
// (double-dispatch) falha alto, nunca duplica/corrompe silenciosamente.
//
// DRY_RUN=true — faz login, calcula e IMPRIME o payload que seria gravado, mas nunca chama a RPC.
// Use isso pra validar o robô pela primeira vez antes de confiar nele rodando sozinho no dia 25.
//
// Variáveis de ambiente necessárias:
//   WALLACE_LOGIN_EMAIL / WALLACE_LOGIN_PASSWORD — login real do painel (GitHub secret novo)
//   SUPABASE_URL / SUPABASE_KEY — mesmos já usados pelos outros robôs (SUPABASE_KEY = service_role)
//   SITE_URL — opcional, default https://wallacelira.com.br
//   DRY_RUN — opcional, 'true' pra só simular (default 'false')

import { chromium } from 'playwright';

const SITE_URL = process.env.SITE_URL || 'https://wallacelira.com.br';
const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const BOOT_TIMEOUT_MS = 90_000;

const MESES_ABREV_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// CORRIGIDO 22/08/2026 (achado real no 1º teste DRY_RUN completo do usuário: o log imprimiu
// "fechando 2026-07 → abrindo 2026-08 (Ago/26 (25/07–24/08) — ABERTO)" — a data entre parênteses
// (25/07–24/08) é IDÊNTICA à do ciclo que está FECHANDO ("Jul/26 (25/07–24/08)" no banco), não a do
// ciclo novo, que devia ser 25/08–24/09. Causa: `label`/`periodo` usavam `mes` (mês do ciclo
// ANTIGO) como início do período novo, em vez de `proxMes` (mês do ciclo NOVO) — reproduzia a data
// que está fechando em vez de calcular a próxima. Corrigido: início do período novo = proxMes, fim
// = mês seguinte a proxMes (com rollover de ano se proxMes=12, igual já feito pra novoKey acima).
function proximoCiclo(cicloAtualKey){
  // cicloAtualKey = 'YYYY-MM' do ciclo que está fechando agora (ex: '2026-07', vira '2026-08').
  const [ano, mes] = cicloAtualKey.split('-').map(Number);
  const proxMes = mes === 12 ? 1 : mes + 1;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const novoKey = `${proxAno}-${String(proxMes).padStart(2,'0')}`;
  const fimMes = proxMes === 12 ? 1 : proxMes + 1;
  const fimAno = proxMes === 12 ? proxAno + 1 : proxAno;
  // Mesmo formato de label/periodo já usado nos snapshots existentes (ver vars-ciclo-snapshots.js):
  // "Mmm/AA (25/MM–24/MM) — ABERTO", período "25/MM/AAAA a 24/MM/AAAA" (dia 25→24, ciclo financeiro).
  const dd = n => String(n).padStart(2,'0');
  const label = `${MESES_ABREV_PT[proxMes-1]}/${String(proxAno).slice(2)} (25/${dd(proxMes)}–24/${dd(fimMes)}) — ABERTO`;
  const periodo = `25/${dd(proxMes)}/${proxAno} a 24/${dd(fimMes)}/${fimAno}`;
  return { novoKey, label, periodo };
}

async function main(){
  const email = process.env.WALLACE_LOGIN_EMAIL;
  const senha = process.env.WALLACE_LOGIN_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if(!email || !senha){ console.error('ERRO: WALLACE_LOGIN_EMAIL/WALLACE_LOGIN_PASSWORD não definidos.'); process.exit(1); }
  if(!DRY_RUN && (!supabaseUrl || !supabaseKey)){ console.error('ERRO: SUPABASE_URL/SUPABASE_KEY não definidos (obrigatório fora de DRY_RUN).'); process.exit(1); }

  console.log(`fechar_ciclo_financeiro: abrindo ${SITE_URL} (DRY_RUN=${DRY_RUN})...`);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
    await page.fill('#email', email);
    await page.fill('#password', senha);
    await page.click('#loginBtn');

    // Login real (Firebase) leva alguns segundos + o iframe #mainIframe só aparece depois disso.
    const iframeEl = await page.waitForSelector('#mainIframe', { timeout: 30_000 });
    const frame = await iframeEl.contentFrame();
    if(!frame) throw new Error('iframe #mainIframe sem contentFrame (login falhou ou layout mudou)');

    console.log('fechar_ciclo_financeiro: login OK, aguardando boot completo do painel (REG/VARS)...');
    await frame.waitForFunction(
      () => typeof performance !== 'undefined' && performance.getEntriesByName('wallace-boot-complete').length > 0,
      null,
      { timeout: BOOT_TIMEOUT_MS, polling: 500 }
    );

    // Lê o retrato vivo direto de REG/VARS do painel real — nenhuma fórmula reimplementada aqui, só
    // remapeamento de nomes (mesmo mapeamento que aplicarCicloAoVARS usa na direção inversa — ver
    // app.js linhas ~1866-1917 e ~1988-1999).
    // CORRIGIDO 22/08/2026 (achado real via 1º teste DRY_RUN do usuário — exatamente por isso o
    // teste existe): app.js declara `const REG = {}`/`const VARS = {}` no nível superior do script
    // clássico (linhas 1548/2165) — em JS de navegador, `const`/`let` no topo de um <script> NUNCA
    // vira propriedade de `window` (diferente de `var`/função, que viram), mesmo sendo genuinamente
    // global e acessível por nome direto de qualquer outro script/eval na mesma página. `window.REG`
    // sempre foi `undefined`, então o boot sempre "completava" de verdade mas essa checagem sempre
    // falhava — o robô nunca tinha sido testado de ponta a ponta antes de agora, por isso não tinha
    // sido pego. Corrigido referenciando REG/VARS como identificador global direto, não via window.
    const snapshot = await frame.evaluate(() => {
      const R = REG, V = VARS;
      if(!R || !V) throw new Error('REG/VARS não existem — boot não completou de verdade');
      const cv = R.caixaVariavel || {};
      const op = R.operacional || {};
      return {
        cicloAtual: V.cicloAtual,
        salario: op.salario ?? V.salario ?? null,
        entradasTotais: op.entradasTotais ?? null,
        caixaVariavelComprometido: cv.comprometido ?? null,
        caixaVariavelSaldoReal: cv.saldoReal ?? null,
        caixaVariavelDisponivel: (cv.saldoReal != null && cv.comprometido != null) ? Math.round((cv.saldoReal - cv.comprometido)*100)/100 : null,
        reembolsoAReceber: V.__reembolsosAReceber ?? 0,
        reembolsoRecebido: (V.reembolsoCicloTotal != null && V.__reembolsosAReceber != null) ? Math.round((V.reembolsoCicloTotal - V.__reembolsosAReceber)*100)/100 : null,
        toleranciaTempValor: V.tolerenciaTemp ?? 0,
        toleranciaTempMotivo: V.tolerenciaTempMotivo ?? null,
        tetoOficial: V.tetoOficial ?? null,
        tetoEfetivo: V.tetoEfetivo ?? null,
        cascata: { faturaWartsila: V.faturaWartsila ?? null, mpCorporativo: V.reembolsoPagaMPCorporativo ?? null },
        necessidadeTotalBruta: op.necessidadeTotalBruta ?? null,
        necessidadeTotalLiquida: op.necessidadeLiquida ?? null,
        modoOperacional: op.modoOperacional ?? null,
        saldoCiclo: op.saldoCiclo ?? null,
        visaInfiniteComprometido: V.cartaoInfiniteTotal ?? null,
        mastercardBlackComprometido: V.cartaoMBTotal ?? null,
        mastercardBlackPessoalCongelado: null, // sem fonte viva equivalente confirmada — fica null (nunca chuta), revisar manualmente se precisar
        mercadoPagoFaturaCongelada: V.mercadoPagoFatura ?? null,
        livrosRazaoArquivados: {
          LRW_TRANSACOES: V.LRW_TRANSACOES ?? [],
          LRV_TRANSACOES: V.LRV_TRANSACOES ?? [],
          LRC_LIMBO_TRANSACOES: V.LRC_LIMBO_TRANSACOES ?? [],
          LRPGV_TRANSACOES: V.LRPGV_TRANSACOES ?? [],
        },
      };
    });

    if(!snapshot.cicloAtual) throw new Error('VARS.cicloAtual vazio — não dá pra saber qual ciclo fechar');
    const { novoKey, label, periodo } = proximoCiclo(snapshot.cicloAtual);
    console.log(`fechar_ciclo_financeiro: fechando ${snapshot.cicloAtual} → abrindo ${novoKey} (${label}).`);
    console.log('fechar_ciclo_financeiro: payload capturado:', JSON.stringify(snapshot, null, 2));

    if(DRY_RUN){
      console.log('fechar_ciclo_financeiro: DRY_RUN=true — nada foi gravado no Supabase.');
      return;
    }

    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/fechar_ciclo_financeiro`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        p_novo_ciclo_key: novoKey,
        p_novo_label: label,
        p_novo_periodo: periodo,
        p_snapshot: snapshot,
      }),
    });
    const texto = await resp.text();
    if(!resp.ok){ throw new Error(`RPC fechar_ciclo_financeiro respondeu ${resp.status}: ${texto}`); }
    console.log(`fechar_ciclo_financeiro: OK — ciclo ${novoKey} aberto. Resposta: ${texto}`);
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('fechar_ciclo_financeiro: FALHOU —', err); process.exit(1); });
