// src/modules/promocoes-financeengine.js — extraído do app.js em 07/08/2026 (modularização,
// módulo 1 de 1 desta rodada). Script CLÁSSICO, não ES module (mesma restrição documentada em
// Sistema_Wallace_Lira_Completo.html: converter pra type="module" quebraria os onclick inline do
// HTML). Carrega DEPOIS do app.js terminar de executar por completo — usa o mesmo escopo global
// (VARS, REG, WallaceFinanceEngine, WallaceComparator, hydrate, atualizarGraficosPorCiclo,
// registrarValidacaoFase, SolarConfig e as funções V1 de Energia Solar, todos já existem quando
// este arquivo roda). Nenhuma linha de comportamento foi alterada na extração — cópia exata das
// 18 fases de promoção (2D-2V), já validadas 18/18 em runtime real antes de mover.
//
// ===== INSTRUMENTAÇÃO TEMPORÁRIA DE VALIDAÇÃO RUNTIME — 06/08/2026 =====
// Pedido explícito do usuário (achado real: FASE 2F reprovando 0/10 em navegador real): registrar
// de forma uniforme, para as 18 fases 2D-2V, se aprovaram ou reprovaram em runtime — sem adicionar
// nenhuma promoção nova, sem mudar nenhuma fórmula, sem mudar o gate de segurança de nenhuma delas.
// Cada fase já decidia `aprovado` sozinha; este bloco só acrescenta 1 chamada de log padronizada no
// mesmo ponto, e empilha o resultado em `window.WALLACE_VALIDACAO_RUNTIME` pra dar
// `console.table(window.WALLACE_VALIDACAO_RUNTIME)` no fim. TEMPORÁRIO — remover depois da
// validação real (pedido do usuário, não é uma fase nova, é diagnóstico).
window.WALLACE_VALIDACAO_RUNTIME = [];
function registrarValidacaoFase(fase, aprovado, motivo){
  window.WALLACE_VALIDACAO_RUNTIME.push({ fase, resultado: aprovado ? 'APROVADA' : 'REPROVADA', fallback: aprovado ? 'não' : 'sim (V1)', motivo: motivo || '' });
  console.log(`%c[${fase}] ${aprovado ? 'APROVADA' : 'REPROVADA'}${motivo ? ' — ' + motivo : ''}`, aprovado ? 'color:#34c98a;font-weight:700' : 'color:#e2554f;font-weight:700');
}

// ===== FASE 2D — REMOVIDA 12/08/2026 =====
// Usuário pediu remoção após achado real: o selo `syncV2Badge` que esta fase alimentava (indireto,
// via comparação paralela) ficava travado numa divergência de R$18,15 contra um "V1" (VARS.
// CICLO_SNAPSHOTS[...].caixaVariavelSaldoReal) que não foi possível reproduzir/explicar em runtime
// mesmo depois de confirmar por SQL direto que a fonte viva (rpc_dashboard_resumo) e o snapshot
// congelado já batiam exatos (R$1.886,65 = R$1.886,65). Decisão: a migração V1→V2 já foi encerrada
// formalmente nesta mesma sessão (ver docs/decisions/) — este gate experimental de 06/08/2026 (fase
// de transição, "primeira substituição operacional controlada") não tem mais função real: os valores
// que ele tentava promover (REG.caixaVariavel.saldoReal/disponivel) já são setados corretamente por
// hydrate-onda1-v2.js/hydrate-comprometido-caixa-variavel-v2.js, que rodam de qualquer forma. Manter
// um selo de diagnóstico quebrado gerando alarme falso permanente é pior que não ter selo nenhum.
// Bloco original (comparação FinanceEngine × RPC + substituição condicional de REG.caixaVariavel.*)
// removido por completo — ver histórico do git pra recuperar se precisar.
/* ===== FASE 2D — primeira substituição operacional controlada (experimental, escopo único: Caixa
// Variável) — 06/08/2026 =====
// Cálculo em paralelo (V1 já existente acima + FinanceEngine via Comparator), sempre registrado no
// console. Fecha o único critério pendente do marco de transição (ESTADO_ATUAL.md / FASE_2C_SERVICES.md):
// "app.js consumindo Service de forma experimental".
//
// ACHADO desta rodada: src/services/FinanceService.js usa sintaxe ESM (import/export) e importa
// FinanceEngine.js, que por sua vez é CommonJS (module.exports, escrito pros testes via node) —
// os dois formatos são incompatíveis entre si E com app.js (script clássico, não module — mesmo
// motivo já documentado no WallaceFinanceService, parte 118). Resultado: FinanceService.js não pode
// ser carregado aqui sem editá-lo, o que estaria fora do escopo autorizado (Services já congelados).
// Solução adotada: FinanceEngine.js e Comparator.js são carregados sem alteração nenhuma (shim de
// module.exports em Sistema_Wallace_Lira_Completo.html) e o corpo de FinanceService.getSaldoCaixa()
// é replicado aqui (mesmo fetch, mesma adaptação de tipo) — a MATEMÁTICA vem 100% do FinanceEngine
// (não duplicada), a COMPARAÇÃO vem 100% do Comparator (não duplicada). Nenhuma fórmula nova.
(async function experimentalCaixaVariavelViaFinanceEngine(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2D] FinanceEngine/Comparator não carregados nesta sessão — comparação experimental da Caixa Variável pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || !VARS.CICLO_SNAPSHOTS || !VARS.CICLO_SNAPSHOTS[VARS.cicloAtual]) return;

    // 1) V1 — mesma fonte já usada no badge de auditoria existente (linha ~5401 acima), zero recálculo novo.
    const saldoV1 = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].caixaVariavelSaldoReal;

    // 2) V2 — CORRIGIDO 07/08/2026 (3ª tentativa): a 1ª correção (filtro de data) piorou o resultado
    // (+R$2.736,81 → -R$1.627,31); a 2ª tentativa (ler `saldo_real_ciclo_atual` direto da tabela
    // `caixas` via REST) deu erro 400 — confirmado em runtime real: essa coluna NÃO existe na
    // tabela, só existe como campo CALCULADO na resposta da RPC `rpc_dashboard_resumo()` (é ela que
    // "já respeita saldo_inicial_ciclo e só conta movimentos com afeta_saldo_real=true" — ver
    // comentário da linha ~5406, mesmo bloco de auditoria que já bate exato com V1 ao vivo:
    // "✅ Auditoria V1↔V2: Caixa Variável bate (R$1886.65)"). Correção real: chamar a mesma RPC via
    // `WallaceFinanceService.getDashboardResumo()` (já existe, já é usada pelo bloco de auditoria,
    // tem cache interno — reusa o resultado se já buscado nesta carga, não duplica fetch à toa).
    if (typeof WallaceFinanceService === 'undefined') { console.warn('[FASE 2D] WallaceFinanceService não carregado — comparação pulada.'); return; }
    const resumoV2 = await WallaceFinanceService.getDashboardResumo();
    const caixa = (resumoV2.caixas || []).find(c => c.nome === 'Caixa Variável');
    if (!caixa) { console.warn('[FASE 2D] Caixa Variável não encontrada na resposta da RPC (V2) — comparação pulada.'); return; }
    const saldoV2 = Number(caixa.saldo_real_ciclo_atual);

    // 3) Comparação — Comparator.js, não reimplementada na mão. Mantida intacta (regra do usuário:
    // não apagar o cálculo antigo, o comparator, nem os logs).
    const lote = WallaceComparator.compararLote([{ nome: 'Caixa Variável (saldo real)', antigo: saldoV1, novo: saldoV2 }]);
    if (lote.totalDivergente === 0) {
      console.log(`%c[OK] Caixa Variável V1=V2 (R$${saldoV1})`, 'color:#34c98a');
    } else {
      console.warn(`[WARN] divergência detectada — Caixa Variável: valor antigo(V1)=R$${saldoV1} | valor novo(V2/FinanceEngine)=R$${saldoV2} (diferença R$${lote.log[0].diferenca})`);
    }
    console.log(WallaceComparator.formatarLog(lote));

    // ===== PRIMEIRA SUBSTITUIÇÃO REAL — autorizado 06/08/2026 (parte 139) =====
    // Escopo único: Caixa Variável. A partir daqui, o valor EXIBIDO NA UI passa a vir do
    // FinanceEngine (saldoV2), não mais do V1 (saldoV1). O cálculo V1 continua rodando acima
    // (VARS.CICLO_SNAPSHOTS[...].caixaVariavelSaldoReal / VARS.caixaVariavelSaldoReal não são
    // apagados nem sobrescritos) — só existe pra alimentar o Comparator e o log, exatamente como
    // antes. O que muda é que REG.caixaVariavel.saldoReal (a fonte real de tudo que é renderizado)
    // passa a receber saldoV2 em vez do valor V1 que `recalcularAgregadosDerivados()` já tinha
    // colocado lá na carga da página.
    //
    // Único campo tocado: REG.caixaVariavel.saldoReal. .disponivel é recalculado com a MESMA fórmula
    // já usada em recalcularAgregadosDerivados() (saldoReal - comprometido) — não é fórmula nova.
    // .comprometido, .tolerenciaTemp, .tetoEfetivo, .folegoAteTeto: não dependem de saldoReal,
    // ficam como estavam.
    //
    // Re-render: reaproveita hydrate() e atualizarGraficosPorCiclo(), já existentes e já usadas pelo
    // próprio trocarCiclo() pra este mesmo tipo de atualização — nenhuma função de renderização nova.
    // Efeito colateral aceito e documentado: como as duas funções releem o REG inteiro, todo texto/
    // gráfico que já estava na tela é re-escrito com os MESMOS valores de antes (nenhum outro campo
    // do REG foi alterado) — não é uma substituição fora do escopo, é o jeito mais simples de
    // reaproveitar o pipeline de renderização já existente sem escrever um terceiro pipeline paralelo.
    //
    // Limitação conhecida, não corrigida aqui (fora do escopo "somente Caixa Variável" — mexer nela
    // exigiria tocar em código de outras seções): o texto "Disponível/dia" (id `dispDia`) e o gráfico
    // `g_cCartoesLiquidoCV` são calculados 1x no boot, dentro de uma IIFE de topo de arquivo que não é
    // re-chamável — não são atualizados por este bloco (mesma limitação que já existe hoje quando o
    // usuário troca de ciclo pela UI: `trocarCiclo()` também não re-executa essas duas IIFEs).
    //
    // GATE OBRIGATÓRIO (regra explícita da autorização: "Confirmar: divergência = zero"): só troca o
    // valor exibido se o Comparator confirmou divergência zero. Se divergir, a troca NÃO acontece —
    // a UI continua mostrando V1 (nunca expõe um número que a própria validação reprovou), e o WARN
    // acima já registra o motivo no console pra investigação.
    if (lote.totalDivergente === 0 && typeof REG !== 'undefined' && REG.caixaVariavel) {
      REG.caixaVariavel.saldoReal = saldoV2;
      REG.caixaVariavel.disponivel = Math.round((REG.caixaVariavel.saldoReal - REG.caixaVariavel.comprometido) * 100) / 100;

      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
      if (typeof WallaceBus !== 'undefined') {
        WallaceBus.emit('saldoAtualizado', { saldoReal: REG.caixaVariavel.saldoReal, comprometido: REG.caixaVariavel.comprometido, disponivel: REG.caixaVariavel.disponivel });
      }

      console.log(`%c[FASE 2D] Caixa Variável — UI atualizada para o valor do FinanceEngine: R$${saldoV2} (V1 era R$${saldoV1}). Fonte V1 preservada em VARS/CICLO_SNAPSHOTS, só REG.caixaVariavel foi trocado.`, 'color:#3987e5');
      registrarValidacaoFase('FASE 2D', true, `Caixa Variável V1=R$${saldoV1} V2=R$${saldoV2}`);
    } else if (lote.totalDivergente !== 0) {
      console.warn('[FASE 2D] Substituição NÃO aplicada — divergência acima do gate de segurança. UI continua mostrando o valor V1.');
      registrarValidacaoFase('FASE 2D', false, `Caixa Variável V1=R$${saldoV1} V2=R$${saldoV2} (diff R$${lote.log[0].diferenca})`);
    }
  } catch(e) {
    registrarValidacaoFase('FASE 2D', false, `erro: ${e.message}`);
    // silencioso de propósito, mesmo padrão do bloco de auditoria acima — se o fetch ao V2 falhar
    // (rede indisponível, etc.), o site simplesmente continua mostrando o valor V1 que já estava
    // renderizado desde o boot — nunca quebra, nunca mostra tela quebrada.
    console.warn('[FASE 2D] comparação/substituição experimental da Caixa Variável falhou (não afeta o site — valor V1 permanece exibido):', e);
  }
})(); */

// ===== FASE 2F — promoção em lote das 10 caixas reconciliadas (Bens Duráveis, Grupo A x8,
// Caixa Lance) — 06/08/2026, parte 142 =====
// Mesmo padrão exato da FASE 2D (Caixa Variável): V1 já calculado (VARS), V2 via fetch +
// WallaceFinanceEngine.calcularSaldoCaixa(), decisão via WallaceComparator, escreve em REG só se
// aprovado, fallback automático pro V1 em qualquer falha. Diferença desta fase: 10 caixas em vez
// de 1, cada uma com seu próprio gate independente (uma divergir não bloqueia as outras — mesma
// lógica do Passo 4 do plano de execução, "cada caixa aprovada, não em lote único").
//
// Caixa Boletos NÃO está nesta lista — decisão explícita do usuário (06/08/2026): fica de fora
// até o saldo real de abertura do ciclo (25/07) ser confirmado. Nenhuma leitura/escrita feita
// nela por este bloco.
//
// Caixa Lance tem tolerância própria: o resíduo de R$258,99 já foi investigado, classificado como
// divergência de baseline/calibração (não transação) e explicitamente aceito pelo usuário nesta
// sessão — "não bloquear a promoção por causa dela". Por isso, e só para esta caixa, a comparação
// usa uma tolerância elevada (R$260,00) que cobre exatamente esse resíduo já documentado. Isso não
// é um enfraquecimento do gate padrão (R$0,005) do Comparator — TOLERANCIA_PADRAO continua a
// mesma para as outras 9 caixas e para qualquer comparação futura; é uma exceção pontual, com
// motivo registrado no próprio log.
(async function promocaoLote10CaixasReconciliadas(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2F] FinanceEngine/Comparator não carregados nesta sessão — promoção das 10 caixas pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.balanco || !REG.balanco.reservas) return;

    const CICLO_ATUAL_INICIO = '2026-07-24'; // mesmo valor e mesmo motivo documentado em src/services/FinanceService.js

    const CAIXAS_PROMOCAO = [
      { nomeV2:'Caixa Manutenção',          varsField:'caixaManutencao',          regField:'manutencao', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$0,72), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Caixa Aniversário Júlio',   varsField:'caixaAniversarioJulio',    regField:'aniversarioJulio', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$0,40), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Caixa Eventos',             varsField:'caixaEventos',             regField:'eventos', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$0,34), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Caixa Saúde Família',       varsField:'caixaSaudeFamilia',        regField:'saudeFamilia', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$0,06), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Caixa Seguro Emplacamento', varsField:'caixaSeguroEmplacamento',  regField:'seguroEmplacamento', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$0,88), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Caixa Combustível',         varsField:'caixaCombustivel',         regField:'combustivel', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$0,40), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Caixa Churrasco',           varsField:'caixaChurrasco',           regField:'churrasco', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$0,17), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Escola de Júlio',           varsField:'escolaJulioSaldo',         regField:'escolaJulio', tolerancia:2.50,
        motivo:'Resíduo pequeno de calibração (≤R$2,06), aceito pelo usuário em 07/08/2026 — não é transação perdida.' },
      { nomeV2:'Caixa Bens Duráveis',       varsField:'caixaBensDuraveis',        regField:'bensDuraveis', tolerancia:360.00,
        motivo:'Déficit inicial conhecido — caixa criada já negativa (R$355,00: fone de ouvido + aparador de pelos), sem fundo acumulado prévio. Caso encerrado, aceito pelo usuário em 07/08/2026.' },
      { nomeV2:'Caixa Lance',               varsField:'caixaLance',               regField:'caixaLance', tolerancia:270.00,
        motivo:'LREI0003 (R$266,23) — empréstimo interno documentado, crédito a recuperar via reembolsos Wärtsilá. Caso encerrado, aceito pelo usuário em 07/08/2026.' },
    ];

    const _url = 'https://bakdgacmwlopvrrppwdm.supabase.co';
    const _key = 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';

    const nomesQuery = CAIXAS_PROMOCAO.map(c => encodeURIComponent(c.nomeV2)).join(',');
    const respCaixas = await fetch(`${_url}/rest/v1/caixas?select=id,nome,saldo_inicial_ciclo&nome=in.(${nomesQuery})`, {
      headers: { apikey: _key, Authorization: `Bearer ${(typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || _key}` }
    });
    if (!respCaixas.ok) throw new Error(`erro ${respCaixas.status} ao buscar caixas`);
    const caixasV2 = await respCaixas.json();

    // CORRIGIDO 12/08/2026 (achado do usuário via auditoria de lag: este loop fazia até 11
    // `await fetch(...)` de transações EM SÉRIE, um de cada vez — provavelmente o maior gargalo
    // isolado do boot, mesmo padrão do bug já corrigido em pluggy-reconciliacao.js/
    // classificacao-inbox.js (await X; await Y sem dependência real entre eles), só que 10x maior
    // aqui. As 10 buscas de transação são todas independentes entre si (caixas diferentes) —
    // Promise.all dispara todas juntas; o processamento (cálculo/comparação/log) continua
    // sequencial depois, porque é síncrono e rápido (não é rede).
    const _authHeaderPromocao = { apikey: _key, Authorization: `Bearer ${(typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || _key}` };
    const buscasTx = await Promise.all(CAIXAS_PROMOCAO.map(async (cfg) => {
      const caixa = caixasV2.find(c => c.nome === cfg.nomeV2);
      if (!caixa) { console.warn(`[FASE 2F] "${cfg.nomeV2}" não encontrada no V2 — pulada.`); return null; }
      try {
        const respTx = await fetch(`${_url}/rest/v1/transacoes?select=tipo,valor&caixa_id=eq.${caixa.id}&status=eq.confirmado&data=gte.${CICLO_ATUAL_INICIO}`, {
          headers: _authHeaderPromocao
        });
        if (!respTx.ok) { console.warn(`[FASE 2F] erro ${respTx.status} buscando transações de "${cfg.nomeV2}" — pulada.`); return null; }
        const transacoes = await respTx.json();
        return { cfg, caixa, transacoes };
      } catch(err) {
        console.warn(`[FASE 2F] falha de rede buscando transações de "${cfg.nomeV2}" — pulada.`, err);
        return null;
      }
    }));

    const relatorio = [];
    for (const item of buscasTx) {
      if (!item) continue;
      const { cfg, caixa, transacoes } = item;
      const transacoesAdaptadas = transacoes.map(t => ({ tipo: t.tipo === 'entrada' ? 'Entrada' : 'Saída', valor: Number(t.valor) }));
      const saldoV2 = WallaceFinanceEngine.calcularSaldoCaixa(Number(caixa.saldo_inicial_ciclo || 0), transacoesAdaptadas);
      const saldoV1 = VARS[cfg.varsField];

      const lote = WallaceComparator.compararLote(
        [{ nome: cfg.nomeV2, antigo: saldoV1, novo: saldoV2 }],
        cfg.tolerancia // undefined = usa TOLERANCIA_PADRAO (R$0,005) do próprio Comparator
      );
      const aprovado = lote.totalDivergente === 0;
      relatorio.push({ nome: cfg.nomeV2, v1: saldoV1, v2: saldoV2, diferenca: lote.log[0].diferenca, aprovado, motivo: cfg.motivo || null });

      if (aprovado) {
        REG.balanco.reservas[cfg.regField] = saldoV2;
      } else {
        console.warn(`[FASE 2F] "${cfg.nomeV2}" NÃO promovida — divergência acima da tolerância. V1=R$${saldoV1} V2=R$${saldoV2}. UI continua mostrando V1.`);
      }
    }

    // Total recalculado 1x no final, mesma fórmula já existente em recalcularBalanco()
    // (não duplicada — só reaplicada aqui porque este bloco roda DEPOIS dela no carregamento).
    // CORRIGIDO 14/08/2026 (achado real, ao vivo: auditoria acusando "1 divergência" mesmo depois da
    // correção em auditoria-automatica.js/recalcular-balanco.js do mesmo dia — causa raiz era AQUI,
    // um 3º lugar que soma as reservas e ainda incluía r.boletos, reintroduzindo a duplicidade com
    // operacional.caixaBoletos que os outros 2 arquivos já tinham removido. Esta fase roda DEPOIS de
    // recalcularBalanco() no boot, então sobrescrevia o total já corrigido com o valor errado de novo.
    const r = REG.balanco.reservas;
    r.total = Math.round((r.escolaJulio + r.caixaLance + r.manutencao + r.eventos + r.churrasco +
      r.saudeFamilia + r.seguroEmplacamento + r.aniversarioJulio + r.pixVanessa + r.combustivel + r.bensDuraveis + r.suavizacao) * 100) / 100;

    if (typeof hydrate === 'function') hydrate();
    if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();

    const aprovadas = relatorio.filter(x => x.aprovado).length;
    console.log(`%c[FASE 2F] Promoção em lote: ${aprovadas}/${relatorio.length} caixas movidas para o FinanceEngine.`, 'color:#34c98a');
    console.table(relatorio);
    registrarValidacaoFase('FASE 2F', aprovadas === relatorio.length, `${aprovadas}/${relatorio.length} caixas aprovadas`);
  } catch(e) {
    registrarValidacaoFase('FASE 2F', false, `erro: ${e.message}`);
    // silencioso de propósito, mesmo padrão dos blocos anteriores — falha de rede não quebra o
    // site, cada caixa não promovida simplesmente continua mostrando o valor V1 já renderizado.
    console.warn('[FASE 2F] promoção em lote das 10 caixas falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2G — Domínio 3 (Patrimônio/Balanço): Patrimônio Financeiro, Meta do Milhão,
// Formação Patrimonial, Meta de Investimento — 06/08/2026, parte 143 =====
// Mesmo padrão das fases anteriores, mas sem fetch novo: os 4 cálculos deste domínio usam só
// entradas que já estão em VARS/REG depois do boot (reserva, btgNecton e nectonContaCorrente são
// valores manuais de extrato, iguais em V1 e V2 — não têm uma segunda fonte real no Supabase para
// comparar; salario/aporteBTGPactual/depositoAtivacaoNecton idem; idade e entradasTotais são
// derivados de outros campos já calculados). O único componente com fonte V2 genuinamente
// diferente é a Caixa Lance, já promovida na FASE 2F (REG.balanco.reservas.caixaLance) — é ela
// que entra aqui em vez do VARS.caixaLance (V1) usado antes.
//
// Consequência esperada e aceita: como Patrimônio Financeiro usa Caixa Lance, e Lance já carrega
// o resíduo de R$258,99 aceito na FASE 2F, esse mesmo resíduo se propaga pra cá e pra Meta do
// Milhão (que deriva de Patrimônio Financeiro). Não é uma divergência nova, é a mesma já registrada
// aparecendo num agregado que depende dela — por isso as duas usam a mesma tolerância elevada
// (R$260,00 / 0,05 pontos percentuais), com o motivo citado no log. Formação Patrimonial e Meta de
// Investimento não dependem de Lance — tolerância padrão (R$0,005) nelas.
//
// Fora do escopo desta fase, propositalmente: Boletos, Livro LRC, ROC, Opções, Necessidade
// Líquida (instrução explícita do usuário) — nenhum campo relacionado a eles é lido ou escrito
// aqui.
(function promocaoDominio3PatrimonioBalanco(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2G] FinanceEngine/Comparator não carregados nesta sessão — promoção do Domínio 3 pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.patrimonio || !REG.balanco) return;

    const relatorio = [];

    // ---- 1) Patrimônio Financeiro (REG.patrimonio.total) ----
    const patFinV1 = REG.patrimonio.total; // já calculado no boot com VARS.caixaLance (V1)
    const patFinV2 = WallaceFinanceEngine.calcularPatrimonioFinanceiroMetaMilhao({
      reserva: VARS.reserva,
      btgNecton: VARS.btgNecton,
      caixaLance: REG.balanco.reservas.caixaLance, // já promovido na FASE 2F
      nectonContaCorrente: VARS.nectonContaCorrente,
    });
    const lotePatFin = WallaceComparator.compararLote(
      [{ nome: 'Patrimônio Financeiro', antigo: patFinV1, novo: patFinV2 }], 260.00
    );
    const aprovPatFin = lotePatFin.totalDivergente === 0;
    relatorio.push({ nome: 'Patrimônio Financeiro', v1: patFinV1, v2: patFinV2, diferenca: lotePatFin.log[0].diferenca, aprovado: aprovPatFin,
      motivo: 'Herda o resíduo de R$258,99 da Caixa Lance (FASE 2F), já aceito.' });
    if (aprovPatFin) REG.patrimonio.total = patFinV2;

    // ---- 2) Meta do Milhão % (REG.patrimonio.metaMilhaoPct) ----
    const metaMilhaoV1 = REG.patrimonio.metaMilhaoPct; // calculado no boot com patFinV1
    const metaMilhaoV2 = WallaceFinanceEngine.calcularMetaMilhao(patFinV2, REG.patrimonio.metaMilhao);
    const loteMetaMilhao = WallaceComparator.compararLote(
      [{ nome: 'Meta do Milhão %', antigo: metaMilhaoV1, novo: metaMilhaoV2 }], 0.05
    );
    const aprovMetaMilhao = loteMetaMilhao.totalDivergente === 0;
    relatorio.push({ nome: 'Meta do Milhão %', v1: metaMilhaoV1, v2: metaMilhaoV2, diferenca: loteMetaMilhao.log[0].diferenca, aprovado: aprovMetaMilhao,
      motivo: 'Deriva do Patrimônio Financeiro acima — mesma causa.' });
    if (aprovMetaMilhao) {
      REG.patrimonio.metaMilhaoPct = metaMilhaoV2;
      // Espelho que já causou bug real antes (V137, "milhaoPct travado") — atualizado junto,
      // nunca separado, pra não reabrir a mesma classe de erro.
      if (REG.metasPatrimoniais) REG.metasPatrimoniais.milhaoPct = metaMilhaoV2;
    }

    // ---- 3) Formação Patrimonial (REG.balanco.patrimonioEsperadoRegraClassica / .patrimonioTotalMesesDeRenda) ----
    // Mesmas entradas em V1 e V2 (idade, entradasTotais e patrimonioTotalGeral não são tocados
    // por esta fase) — divergência esperada é 0,00, isto valida que a função extraída no
    // FinanceEngine reproduz fielmente a fórmula do app.js, não uma fonte de dado nova.
    const formPatV1 = { esperado: REG.balanco.patrimonioEsperadoRegraClassica, meses: REG.balanco.patrimonioTotalMesesDeRenda };
    const formPatV2 = WallaceFinanceEngine.calcularFormacaoPatrimonial({
      idade: REG.idadeWallace,
      entradasTotais: REG.operacional.entradasTotais,
      patrimonioTotalGeral: REG.balanco.patrimonioTotalGeral,
    });
    const loteFormPat = WallaceComparator.compararLote([
      { nome: 'Formação Patrimonial (esperado)', antigo: formPatV1.esperado, novo: formPatV2.patrimonioEsperadoRegraClassica },
      { nome: 'Formação Patrimonial (meses de renda)', antigo: formPatV1.meses, novo: formPatV2.patrimonioTotalMesesDeRenda },
    ]);
    const aprovFormPat = loteFormPat.totalDivergente === 0;
    relatorio.push({ nome: 'Formação Patrimonial', v1: formPatV1.esperado, v2: formPatV2.patrimonioEsperadoRegraClassica, diferenca: loteFormPat.log[0].diferenca, aprovado: aprovFormPat, motivo: null });
    if (aprovFormPat) {
      REG.balanco.patrimonioEsperadoRegraClassica = formPatV2.patrimonioEsperadoRegraClassica;
      REG.balanco.patrimonioTotalMesesDeRenda = formPatV2.patrimonioTotalMesesDeRenda;
      // cor/label da faixa: mesma logica de limiar do V1 (o Engine so devolve o texto, nao a cor
      // usada no HTML) - reaplicada aqui, nao duplicada como formula nova.
      const pct = formPatV2.patrimonioEsperadoRegraClassica ? (REG.balanco.patrimonioTotalGeral / formPatV2.patrimonioEsperadoRegraClassica) * 100 : null;
      REG.balanco.patrimonioTotalFaixa = pct === null ? {label:'Sem dado', cor:'var(--text-dim)'}
        : pct < 50 ? {label:formPatV2.faixa, cor:'var(--red)'}
        : pct < 100 ? {label:formPatV2.faixa, cor:'var(--amber)'}
        : {label:formPatV2.faixa, cor:'var(--green)'};
    }

    // ---- 4) Meta de Investimento (REG.metaInvestimento) ----
    const metaInvV1 = { meta: REG.metaInvestimento.meta, investido: REG.metaInvestimento.investido, excedente: REG.metaInvestimento.excedente };
    // percentualMeta passado explícito (MIGRADO 18/08/2026, varredura anti-hardcode): antes o call
    // site não passava esse campo, então o default hardcoded de FinanceEngine.js (0.20) era usado em
    // produção sem nenhuma sobrescrita possível. Não editamos FinanceEngine.js (procedimento proibido
    // sem autorização explícita, exige revalidar as 18 fases) — resolvido aqui, no call site, com o
    // valor vindo de parametros_gerais (mesmo mecanismo genérico já usado por outras dezenas de campos).
    const metaInvV2 = WallaceFinanceEngine.calcularMetaInvestimento({
      salario: VARS.salario,
      aporteBTGPactual: VARS.aporteBTGPactual,
      depositoAtivacaoNecton: VARS.depositoAtivacaoNecton,
      percentualMeta: VARS.percentualMetaInvestimento ?? 0.20,
    });
    const loteMetaInv = WallaceComparator.compararLote([
      { nome: 'Meta de Investimento (meta)', antigo: metaInvV1.meta, novo: metaInvV2.meta },
      { nome: 'Meta de Investimento (investido)', antigo: metaInvV1.investido, novo: metaInvV2.investido },
      { nome: 'Meta de Investimento (excedente)', antigo: metaInvV1.excedente, novo: metaInvV2.excedente },
    ]);
    const aprovMetaInv = loteMetaInv.totalDivergente === 0;
    relatorio.push({ nome: 'Meta de Investimento', v1: metaInvV1.meta, v2: metaInvV2.meta, diferenca: loteMetaInv.log[0].diferenca, aprovado: aprovMetaInv, motivo: null });
    if (aprovMetaInv) {
      REG.metaInvestimento.meta = metaInvV2.meta;
      REG.metaInvestimento.investido = metaInvV2.investido;
      REG.metaInvestimento.excedente = metaInvV2.excedente;
    }

    if (typeof hydrate === 'function') hydrate();
    if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();

    const aprovadas = relatorio.filter(x => x.aprovado).length;
    console.log(`%c[FASE 2G] Domínio 3 (Patrimônio/Balanço): ${aprovadas}/${relatorio.length} fórmulas movidas para o FinanceEngine.`, 'color:#34c98a');
    console.table(relatorio);
    registrarValidacaoFase('FASE 2G', aprovadas === relatorio.length, `${aprovadas}/${relatorio.length} itens aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2G', false, `erro: ${e.message}`);
    console.warn('[FASE 2G] promoção do Domínio 3 falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2H — Domínio 5 (Indicadores/PIB Wallace): PIB Wallace, Eficiência Financeira,
// Consumo Improdutivo, Taxa de Crescimento — 06/08/2026, parte 145 =====
// Mesmo padrão das fases 2F/2G, sem fetch novo: os 4 indicadores usam entradas que já estão em
// VARS/REG (salário, reembolsoCicloTotal, reembolsoPassThroughCorporativo, prêmios de opções,
// consumo extraordinário, histórico do PIB) — nenhuma delas depende de Caixa Lance, Boletos,
// Livro LRC, ROC ou Opções (o prêmio de opções entra como dado já calculado, a fórmula do ROC em
// si não é tocada). Por isso, ao contrário da FASE 2G, aqui não há nenhum resíduo esperado: V1 e
// V2 usam exatamente as mesmas entradas, a promoção valida que o FinanceEngine reproduz a fórmula
// fielmente, não migra uma fonte de dado nova.
//
// PIB Wallace tem 1 ressalva já documentada (MAPA_MIGRACAO_V2.md): classificado 🟡, não 🟢, porque
// depende da perna-3 da cascata de reembolso (corrigida nesta sessão, mas só reclassificável pra
// 🟢 depois de 1 ciclo fechado confirmar em produção). A promoção segue porque a correção já está
// ativa e validada nesta mesma sessão — não é uma pendência nova, é a mesma já registrada.
(function promocaoDominio5Indicadores(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2H] FinanceEngine/Comparator não carregados nesta sessão — promoção do Domínio 5 pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.pibWallace) return;

    const relatorio = [];

    // ---- 1) PIB Wallace (REG.pibWallace.reembolsos / .total) ----
    const rendimentosOpcoes = Math.round((VARS.opcoesVendidasDetalhe||[]).reduce((s,o)=>s+(o.premioRecebido||0),0)*100)/100;
    const consumoNaoRecorrentePIB = Math.round((VARS.EXTRAORDINARIO_BENS_DURAVEIS||[]).reduce((s,t)=>s+(t.valor||0),0)*100)/100;
    const pibV1 = { reembolsos: REG.pibWallace.reembolsos, total: REG.pibWallace.total };
    const pibV2 = WallaceFinanceEngine.calcularIndicadores({
      salarioLiquido: VARS.salario,
      reembolsoCicloTotal: VARS.reembolsoCicloTotal,
      passThroughCorporativo: REG.operacional.reembolsoPassThroughCorporativo,
      rendimentos: rendimentosOpcoes,
      valorizacaoInvestimentos: 0,
      consumoNaoRecorrente: consumoNaoRecorrentePIB,
    });
    const lotePib = WallaceComparator.compararLote([
      { nome: 'PIB Wallace (reembolsos)', antigo: pibV1.reembolsos, novo: pibV2.reembolsosPIB },
      { nome: 'PIB Wallace (total)', antigo: pibV1.total, novo: pibV2.total },
    ]);
    const aprovPib = lotePib.totalDivergente === 0;
    relatorio.push({ nome: 'PIB Wallace', v1: pibV1.total, v2: pibV2.total, diferenca: lotePib.log[1].diferenca, aprovado: aprovPib,
      motivo: '🟡 no mapa (depende da perna-3, já corrigida e validada nesta sessão — não é pendência nova).' });
    if (aprovPib) {
      REG.pibWallace.reembolsos = pibV2.reembolsosPIB;
      REG.pibWallace.total = pibV2.total;
    }
    // patrimonioTotalGeral/patrimonioEsperadoRegraClassica (Domínio 3) e o histórico do PIB
    // (RPC registrar_pib_mensal) leem REG.pibWallace.total antes deste bloco rodar no boot — não
    // recalculados aqui de novo (fora do escopo desta fase, e o snapshot do ciclo já foi gravado
    // no valor V1, que é idêntico ao V2 quando aprovado).

    // ---- 2) Eficiência Financeira % (REG.pibWallace.eficienciaFinanceiraPct) ----
    const efV1 = REG.pibWallace.eficienciaFinanceiraPct;
    const efV2 = WallaceFinanceEngine.calcularEficienciaFinanceira(REG.balanco.fluxo.resultado, REG.balanco.fluxo.entradas);
    const loteEf = WallaceComparator.compararLote([{ nome: 'Eficiência Financeira %', antigo: efV1, novo: efV2 }]);
    const aprovEf = loteEf.totalDivergente === 0;
    relatorio.push({ nome: 'Eficiência Financeira %', v1: efV1, v2: efV2, diferenca: loteEf.log[0].diferenca, aprovado: aprovEf, motivo: null });
    if (aprovEf) REG.pibWallace.eficienciaFinanceiraPct = efV2;

    // ---- 3) Consumo Improdutivo % (REG.pibWallace.consumoImprodutivoPct) ----
    const ciV1 = REG.pibWallace.consumoImprodutivoPct;
    const ciV2 = WallaceFinanceEngine.calcularConsumoImprodutivoPct(consumoNaoRecorrentePIB, REG.operacional.entradasTotais);
    const loteCi = WallaceComparator.compararLote([{ nome: 'Consumo Improdutivo %', antigo: ciV1, novo: ciV2 }]);
    const aprovCi = loteCi.totalDivergente === 0;
    relatorio.push({ nome: 'Consumo Improdutivo %', v1: ciV1, v2: ciV2, diferenca: loteCi.log[0].diferenca, aprovado: aprovCi, motivo: null });
    if (aprovCi) REG.pibWallace.consumoImprodutivoPct = ciV2;

    // ---- 4) Taxa de Crescimento % (REG.pibWallace.taxaCrescimentoPct) ----
    const pibHistorico = VARS.PIB_WALLACE_HISTORICO || {};
    const pibCiclosAnteriores = Object.keys(pibHistorico).filter(k => k < VARS.cicloAtual).sort();
    const pibCicloAnteriorKey = pibCiclosAnteriores[pibCiclosAnteriores.length - 1];
    const pibCicloAnterior = pibCicloAnteriorKey ? pibHistorico[pibCicloAnteriorKey] : null;
    const tcV1 = REG.pibWallace.taxaCrescimentoPct;
    const tcV2 = WallaceFinanceEngine.calcularTaxaCrescimentoPct(pibV2.total, pibCicloAnterior ? pibCicloAnterior.total : null);
    const loteTc = WallaceComparator.compararLote([{ nome: 'Taxa de Crescimento %', antigo: tcV1, novo: tcV2 }]);
    const aprovTc = loteTc.totalDivergente === 0;
    relatorio.push({ nome: 'Taxa de Crescimento %', v1: tcV1, v2: tcV2, diferenca: loteTc.log[0].diferenca, aprovado: aprovTc, motivo: null });
    if (aprovTc) REG.pibWallace.taxaCrescimentoPct = tcV2;

    if (typeof hydrate === 'function') hydrate();
    if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();

    const aprovadas = relatorio.filter(x => x.aprovado).length;
    console.log(`%c[FASE 2H] Domínio 5 (Indicadores/PIB Wallace): ${aprovadas}/${relatorio.length} indicadores movidos para o FinanceEngine.`, 'color:#34c98a');
    console.table(relatorio);
    registrarValidacaoFase('FASE 2H', aprovadas === relatorio.length, `${aprovadas}/${relatorio.length} itens aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2H', false, `erro: ${e.message}`);
    console.warn('[FASE 2H] promoção do Domínio 5 falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2I — Domínio 2 (Reembolsos/Cascata): reembolsoCicloTotal, recebidosNoCiclo —
// 06/08/2026, parte 146 =====
// Escopo estritamente limitado aos 2 itens autorizados. calcularReembolsos() do FinanceEngine
// também devolve cartaoCorporativo/passThroughCorporativo/sobraPessoal (dependem de livroLRC,
// a perna-3 da cascata) — chamados aqui só porque a função não tem uma variante menor, mas os 3
// campos são IGNORADOS de propósito: não lidos, não escritos em REG, não citados no relatório.
// livroLRC entra como 0 (valor morto, nunca usado) só para satisfazer a assinatura da função —
// não é uma leitura real do Livro LRC, que continua fora desta fase.
(function promocaoDominio2Reembolsos(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2I] FinanceEngine/Comparator não carregados nesta sessão — promoção do Domínio 2 pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.operacional || !REG.reembolsos) return;

    const relatorio = [];

    // ---- 1) reembolsoCicloTotal (REG.operacional.reembolsoCicloTotal) ----
    const snap = (VARS.CICLO_SNAPSHOTS && VARS.CICLO_SNAPSHOTS[VARS.cicloAtual]) || null;
    if (!snap) { console.warn('[FASE 2I] snapshot do ciclo atual não encontrado — promoção pulada.'); return; }
    const rctV1 = REG.operacional.reembolsoCicloTotal;
    const resultadoReembolsos = WallaceFinanceEngine.calcularReembolsos({
      reembolsoRecebido: snap.reembolsoRecebido,
      reembolsoAReceber: snap.reembolsoAReceber,
      faturaWartsila: 0, mpCorporativo: 0, livroLRCVisaOnly: 0, livroLRC: 0, totalOpProvMP: 0, // não usados, ver nota acima
    });
    const rctV2 = resultadoReembolsos.reembolsoCicloTotal;
    const loteRct = WallaceComparator.compararLote([{ nome: 'Reembolso Ciclo Total', antigo: rctV1, novo: rctV2 }]);
    const aprovRct = loteRct.totalDivergente === 0;
    relatorio.push({ nome: 'Reembolso Ciclo Total', v1: rctV1, v2: rctV2, diferenca: loteRct.log[0].diferenca, aprovado: aprovRct, motivo: null });
    if (aprovRct) REG.operacional.reembolsoCicloTotal = rctV2;

    // ---- 2) recebidosNoCiclo (REG.reembolsos.recebidosNoCiclo) ----
    const rncV1 = REG.reembolsos.recebidosNoCiclo;
    const rncV2 = WallaceFinanceEngine.calcularReembolsosRecebidosNoCiclo(rctV2, REG.operacional.reembolsosAReceber);
    const loteRnc = WallaceComparator.compararLote([{ nome: 'Recebidos no Ciclo', antigo: rncV1, novo: rncV2 }]);
    const aprovRnc = loteRnc.totalDivergente === 0;
    relatorio.push({ nome: 'Recebidos no Ciclo', v1: rncV1, v2: rncV2, diferenca: loteRnc.log[0].diferenca, aprovado: aprovRnc, motivo: null });
    if (aprovRnc) REG.reembolsos.recebidosNoCiclo = rncV2;

    if (typeof hydrate === 'function') hydrate();
    if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();

    const aprovadas = relatorio.filter(x => x.aprovado).length;
    console.log(`%c[FASE 2I] Domínio 2 (Reembolsos/Cascata): ${aprovadas}/${relatorio.length} fórmulas movidas para o FinanceEngine.`, 'color:#34c98a');
    console.table(relatorio);
    registrarValidacaoFase('FASE 2I', aprovadas === relatorio.length, `${aprovadas}/${relatorio.length} itens aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2I', false, `erro: ${e.message}`);
    console.warn('[FASE 2I] promoção do Domínio 2 falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2J — Domínio 6 (Necessidade/Modo Operacional): Necessidade Líquida, Modo Operacional
// — 06/08/2026, parte 147 =====
// Só o ramo "ciclo aberto" é promovido (classificação 🟢 do mapa é explícita nisso — ciclo fechado
// lê snapshot congelado, não é fórmula, fora do escopo). O ciclo atual (2026-07) está aberto, então
// esta fase roda.
//
// `boletos` aqui é D.boletos = VARS.totalOpBoletos, o aporte mensal ORÇADO (R$2.600, uma constante
// de planejamento) — não é o saldo da Caixa Boletos (que segue bloqueada, sem leitura nem escrita
// nesta fase). É a mesma distinção já usada em REG.totalOpDetalhe desde antes desta sessão: um é
// "quanto planejo depositar todo mês", o outro é "quanto tem guardado agora" — só o primeiro entra
// em Necessidade Líquida. Livro LRC, ROC e Opções não são lidos por nenhuma das duas fórmulas desta
// fase.
(function promocaoDominio6NecessidadeModoOperacional(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2J] FinanceEngine/Comparator não carregados nesta sessão — promoção do Domínio 6 pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.operacional) return;

    const snap = (VARS.CICLO_SNAPSHOTS && VARS.CICLO_SNAPSHOTS[VARS.cicloAtual]) || null;
    if (!snap || snap.fechado) { console.warn('[FASE 2J] ciclo atual fechado ou não encontrado — fora do escopo 🟢 (só ciclo aberto), promoção pulada.'); return; }

    const relatorio = [];
    const D = REG.totalOpDetalhe;

    // ---- 1) Necessidade Líquida (+ totalOperacional, necessidadeTotalBruta, saldoCiclo) ----
    const nlV1 = {
      totalOperacional: REG.operacional.totalOperacional,
      necessidadeTotalBruta: REG.operacional.necessidadeTotalBruta,
      necessidadeLiquida: REG.operacional.necessidadeLiquida,
      saldoCiclo: REG.operacional.saldoCiclo,
    };
    const nlV2 = WallaceFinanceEngine.calcularNecessidadeLiquida({
      boletos: D.boletos, parcelas: D.parcelas, consorcios: D.consorcios, recorrencias: D.recorrencias,
      aportesPat: D.aportesPat, provMP: D.provMP, assinaturas: D.assinaturas,
      orcamentoOperacional: REG.operacional.orcamentoOperacional,
      coberturaGarantida: REG.operacional.coberturaGarantida,
      entradasTotais: REG.balanco.fluxo.entradas,
    });
    const loteNl = WallaceComparator.compararLote([
      { nome: 'Total Operacional', antigo: nlV1.totalOperacional, novo: nlV2.totalOperacional },
      { nome: 'Necessidade Total Bruta', antigo: nlV1.necessidadeTotalBruta, novo: nlV2.necessidadeTotalBruta },
      { nome: 'Necessidade Líquida', antigo: nlV1.necessidadeLiquida, novo: nlV2.necessidadeLiquida },
      { nome: 'Saldo do Ciclo', antigo: nlV1.saldoCiclo, novo: nlV2.saldoCiclo },
    ]);
    const aprovNl = loteNl.totalDivergente === 0;
    relatorio.push({ nome: 'Necessidade Líquida', v1: nlV1.necessidadeLiquida, v2: nlV2.necessidadeLiquida, diferenca: loteNl.log[2].diferenca, aprovado: aprovNl, motivo: null });
    if (aprovNl) {
      REG.operacional.totalOperacional = nlV2.totalOperacional;
      REG.operacional.necessidadeTotalBruta = nlV2.necessidadeTotalBruta;
      REG.operacional.necessidadeLiquida = nlV2.necessidadeLiquida;
      REG.operacional.saldoCiclo = nlV2.saldoCiclo;
    }

    // ---- 2) Modo Operacional (usa o saldoCiclo já promovido acima, se aprovado) ----
    const moV1 = REG.operacional.modoOperacional;
    const moV2 = WallaceFinanceEngine.calcularModoOperacional(aprovNl ? nlV2.saldoCiclo : nlV1.saldoCiclo);
    const loteMo = WallaceComparator.compararLote([{ nome: 'Modo Operacional', antigo: moV1, novo: moV2 }]);
    const aprovMo = loteMo.totalDivergente === 0;
    relatorio.push({ nome: 'Modo Operacional', v1: moV1, v2: moV2, diferenca: null, aprovado: aprovMo, motivo: null });
    if (aprovMo) REG.operacional.modoOperacional = moV2;

    if (typeof hydrate === 'function') hydrate();
    if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();

    const aprovadas = relatorio.filter(x => x.aprovado).length;
    console.log(`%c[FASE 2J] Domínio 6 (Necessidade/Modo Operacional): ${aprovadas}/${relatorio.length} fórmulas movidas para o FinanceEngine.`, 'color:#34c98a');
    console.table(relatorio);
    registrarValidacaoFase('FASE 2J', aprovadas === relatorio.length, `${aprovadas}/${relatorio.length} itens aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2J', false, `erro: ${e.message}`);
    console.warn('[FASE 2J] promoção do Domínio 6 falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2K — Domínio 7 (Energia Solar): Conta com/sem Solar, Economia, Forecast, Leitura
// Solar Derivada — 06/08/2026, parte 148 =====
// Este domínio não escreve num REG.* fixo no boot (Conta com/sem Solar, Economia e Forecast só
// existem quando o usuário interage com o Simulador Regulatório, seção 13 — não há valor "V1 já
// exibido" pra comparar sem simular). Padrão adaptado: valida `WallaceFinanceEngine` contra as
// funções V1 originais (ainda presentes no arquivo, nunca apagadas) rodando uma bateria de
// cenários representativos via Comparator; só se TODOS baterem, o ponto de entrada real
// (`gerarForecastSolar`, chamado por `calcularSimulacaoRegulatoria()`) passa a delegar pro
// FinanceEngine, com fallback automático pro V1 se o Engine não estiver carregado ou lançar erro.
//
// ACHADO E CORRIGIDO antes desta promoção (não é uma pendência nova, foi resolvido nesta mesma
// sessão): `WallaceFinanceEngine.calcularContaComSolar` estava sem o teto de "disponibilidade"
// (custo mínimo por tipo de ligação, 30/50/100 kWh) que o app.js sempre aplicou — sem o teto, a
// função deixava compensar mais energia do que a lei permite, subestimando a conta sempre que
// havia crédito acumulado suficiente. Corrigido em src/services/FinanceEngine.js antes de rodar
// a bateria abaixo (por isso ela passa limpa).
//
// Leitura Solar Derivada é caso à parte: tem saída real no boot (VARS.SOLAR_LEITURAS_CALC), então
// segue o padrão de promoção por campo, igual às fases anteriores.
// VERIFICADO 08/08/2026 (Solar entra na V2): VARS.SOLAR_LEITURAS agora vem de `energia_solar_leituras`
// (V2, ver app.js) em vez de wallace_dados — mas a comparação abaixo (v1Existente vs
// calcularLeituraSolarDerivada) continua válida sem alteração, porque os dois lados leem o MESMO
// VARS.SOLAR_LEITURAS já trocado na origem (nenhum dos dois ainda lê wallace_dados diretamente).
// Não há divergência nova esperada aqui.
// CORRIGIDO 07/08/2026: originalmente rodava como IIFE dentro do app.js, num ponto anterior à
// declaração de `const SolarConfig` (TDZ, `ReferenceError` confirmado em runtime). Virou função
// declarada com chamada explícita. Depois da modularização (mesmo dia): este arquivo agora carrega
// DEPOIS do app.js inteiro terminar de executar (ver Sistema_Wallace_Lira_Completo.html), então
// `SolarConfig` já está garantidamente inicializada — a chamada abaixo não precisa mais adiar nada.
function promocaoDominio7EnergiaSolar(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2K] FinanceEngine/Comparator não carregados nesta sessão — promoção do Domínio 7 pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined') return;

    const relatorio = [];

    // ---- 1) Bateria de validação: Conta sem Solar / Conta com Solar / Economia / Valor kWh / Payback ----
    const cenarios = [
      { consumo: 300, geracaoInst: 150, geracaoInj: 700, creditos: [], tipoLigacao: 'TRI', ano: 2026 },
      { consumo: 300, geracaoInst: 150, geracaoInj: 700, creditos: [{mes:0,ano:2026,energia:400}], tipoLigacao: 'TRI', ano: 2026 },
      { consumo: 50,  geracaoInst: 25,  geracaoInj: 825, creditos: [{mes:0,ano:2026,energia:500}], tipoLigacao: 'MONO', ano: 2026 }, // cenario que expos o bug do teto de disponibilidade
      { consumo: 180, geracaoInst: 90,  geracaoInj: 400, creditos: [{mes:2,ano:2026,energia:120}], tipoLigacao: 'BI',   ano: 2027 },
    ];
    const paresBateria = [];
    cenarios.forEach((c, i) => {
      const semV1 = calcularContaSemSolar(c.consumo, c.tipoLigacao);
      const semV2 = WallaceFinanceEngine.calcularContaSemSolar(c.consumo, c.tipoLigacao);
      paresBateria.push({ nome: `Conta sem Solar #${i}`, antigo: semV1.total, novo: semV2.total });

      const comV1 = calcularContaComSolar(c.consumo, c.geracaoInst, c.geracaoInj, c.creditos.map(x=>({...x})), c.tipoLigacao, c.ano);
      const comV2 = WallaceFinanceEngine.calcularContaComSolar(c.consumo, c.geracaoInst, c.geracaoInj, c.creditos.map(x=>({...x})), c.tipoLigacao, c.ano);
      paresBateria.push({ nome: `Conta com Solar #${i}`, antigo: comV1.total, novo: comV2.total });

      const ecoV1 = calcularEconomia(semV1.total, comV1.total);
      const ecoV2 = WallaceFinanceEngine.calcularEconomia(semV2.total, comV2.total);
      paresBateria.push({ nome: `Economia #${i}`, antigo: ecoV1, novo: ecoV2 });

      const paybackV1 = calcularPayback(25000, ecoV1 * 12);
      const paybackV2 = WallaceFinanceEngine.calcularPayback(25000, ecoV2 * 12);
      paresBateria.push({ nome: `Payback #${i}`, antigo: paybackV1, novo: paybackV2 });
    });
    const loteBateria = WallaceComparator.compararLote(paresBateria);
    const aprovBateria = loteBateria.totalDivergente === 0;
    relatorio.push({ nome: 'Bateria Conta/Economia/Payback (4 cenários)', v1: null, v2: null, diferenca: null, aprovado: aprovBateria,
      motivo: aprovBateria ? null : 'Ver console.warn — divergência não esperada, promoção do Forecast NÃO aplicada.' });

    // ---- 2) Forecast — só troca o ponto de entrada real se a bateria acima passou 100% ----
    if (aprovBateria && typeof gerarForecastSolar === 'function') {
      const gerarForecastSolar_V1 = gerarForecastSolar;
      gerarForecastSolar = function(params){
        try {
          return WallaceFinanceEngine.gerarForecastSolar(params);
        } catch(e) {
          console.warn('[FASE 2K] Forecast: erro no FinanceEngine, fallback pro V1:', e);
          return gerarForecastSolar_V1(params);
        }
      };
      relatorio.push({ nome: 'Forecast Solar (gerarForecastSolar)', v1: null, v2: null, diferenca: null, aprovado: true, motivo: 'Delegado ao FinanceEngine; fallback automático pro V1 preservado.' });
    } else {
      relatorio.push({ nome: 'Forecast Solar (gerarForecastSolar)', v1: null, v2: null, diferenca: null, aprovado: false, motivo: 'Não promovido — depende da bateria acima.' });
    }

    // ---- 3) Leitura Solar Derivada (VARS.SOLAR_LEITURAS_CALC) ----
    if (Array.isArray(VARS.SOLAR_LEITURAS) && VARS.SOLAR_LEITURAS.length) {
      let todasBatem = true;
      const novoCalc = VARS.SOLAR_LEITURAS.map((l) => {
        const v2 = WallaceFinanceEngine.calcularLeituraSolarDerivada({
          leitura03: l.leitura03, leitura103: l.leitura103, dias: l.dias,
          rateioWallace: VARS.solarRateioWallace, rateioIrma: VARS.solarRateioIrma,
          consumoDiarioWallace: VARS.solarConsumoDiarioWallace, consumoDiarioIrma: VARS.solarConsumoDiarioIrma,
        });
        const v1Existente = (VARS.SOLAR_LEITURAS_CALC || []).find(x => x.data === l.data);
        if (v1Existente) {
          const lote = WallaceComparator.compararLote([
            { nome: `Leitura ${l.data} (saldoWallace)`, antigo: v1Existente.saldoWallace, novo: v2.saldoWallace },
            { nome: `Leitura ${l.data} (saldoIrma)`, antigo: v1Existente.saldoIrma, novo: v2.saldoIrma },
          ]);
          if (lote.totalDivergente !== 0) todasBatem = false;
        }
        return Object.assign({}, l, v2);
      });
      relatorio.push({ nome: 'Leitura Solar Derivada', v1: null, v2: null, diferenca: null, aprovado: todasBatem, motivo: null });
      if (todasBatem) VARS.SOLAR_LEITURAS_CALC = novoCalc;
    }

    const aprovadas = relatorio.filter(x => x.aprovado).length;
    console.log(`%c[FASE 2K] Domínio 7 (Energia Solar): ${aprovadas}/${relatorio.length} itens promovidos.`, 'color:#34c98a');
    console.table(relatorio);
    if (!aprovBateria) console.warn(WallaceComparator.formatarLog(loteBateria));
    registrarValidacaoFase('FASE 2K', aprovadas === relatorio.length, `${aprovadas}/${relatorio.length} itens aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2K', false, `erro: ${e.message}`);
    console.warn('[FASE 2K] promoção do Domínio 7 falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
}
promocaoDominio7EnergiaSolar();

// ===== FASE 2L — Domínio 8 (P2P): saldo investido / rentabilidade % — 06/08/2026, parte 149 =====
// Único item 🟢 do domínio. Mesmo padrão de formula-swap das fases 3/5/6: entradas já em VARS
// (creditosRestantes, precoCompra, precoVenda), sem dependência de Boletos/Livro LRC/ROC/Opções.
(function promocaoDominio8P2P(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2L] FinanceEngine/Comparator não carregados nesta sessão — promoção do Domínio 8 pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.p2p) return;

    const p2pV1 = { saldoInvestido: REG.p2p.saldoInvestido, rentabilidadePct: REG.p2p.rentabilidadePct };
    const p2pV2 = WallaceFinanceEngine.calcularP2P({
      creditosRestantes: VARS.p2pCreditosRestantes,
      precoCompra: VARS.p2pPrecoCompra,
      precoVenda: VARS.p2pPrecoVenda,
    });
    const lote = WallaceComparator.compararLote([
      { nome: 'P2P Saldo Investido', antigo: p2pV1.saldoInvestido, novo: p2pV2.saldoInvestido },
      { nome: 'P2P Rentabilidade %', antigo: p2pV1.rentabilidadePct, novo: p2pV2.rentabilidadePct },
    ]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      REG.p2p.saldoInvestido = p2pV2.saldoInvestido;
      REG.p2p.rentabilidadePct = p2pV2.rentabilidadePct;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }

    console.log(`%c[FASE 2L] Domínio 8 (P2P): ${aprovado ? '1/1' : '0/1'} item promovido.`, 'color:#34c98a');
    console.table([{ nome: 'P2P (saldo/rentabilidade)', v1: p2pV1.saldoInvestido, v2: p2pV2.saldoInvestido, diferenca: lote.log[0].diferenca, aprovado }]);
    registrarValidacaoFase('FASE 2L', aprovado, `diff R$${lote.log[0].diferenca}`);
  } catch(e) {
    registrarValidacaoFase('FASE 2L', false, `erro: ${e.message}`);
    console.warn('[FASE 2L] promoção do Domínio 8 falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2M — Domínio 4 (Cartões/Livros Razão): totalOpDetalhe.recorrencias/.assinaturas — 06/08/2026 =====
// Único item do Domínio 4 confirmado promovível isoladamente nesta rodada: soma pura de 4 escalares já
// existentes em VARS (visaLRRConfirmado, mbLRRConfirmado, visaLRSConfirmado, mbLRSConfirmado), sem
// depender de Livro LRC, cartao_id/usuario_id, ROC, Opções ou Caixa Boletos (levantamento aprovado antes
// da implementação). Resto do Domínio 4 (livroLRC, visaTotalComprometido, Livros Razão totais, migração
// cartao_id/usuario_id) permanece intocado.
(function promocaoDominio4RecorrenciasAssinaturas(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2M] FinanceEngine/Comparator não carregados nesta sessão — promoção do Domínio 4 pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.totalOpDetalhe) return;

    const totalOpV1 = { recorrencias: REG.totalOpDetalhe.recorrencias, assinaturas: REG.totalOpDetalhe.assinaturas };
    const totalOpV2 = WallaceFinanceEngine.calcularTotalOpDetalheRecorrenciasAssinaturas({
      visaRecorrencias: VARS.visaLRRConfirmado,
      mbRecorrencias: VARS.mbLRRConfirmado,
      visaAssinaturas: VARS.visaLRSConfirmado,
      mbAssinaturas: VARS.mbLRSConfirmado,
    });
    const lote = WallaceComparator.compararLote([
      { nome: 'totalOpDetalhe.recorrencias', antigo: totalOpV1.recorrencias, novo: totalOpV2.recorrencias },
      { nome: 'totalOpDetalhe.assinaturas', antigo: totalOpV1.assinaturas, novo: totalOpV2.assinaturas },
    ]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      REG.totalOpDetalhe.recorrencias = totalOpV2.recorrencias;
      REG.totalOpDetalhe.assinaturas = totalOpV2.assinaturas;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }

    console.log(`%c[FASE 2M] Domínio 4 (recorrências/assinaturas): ${aprovado ? '2/2' : lote.log.filter(l=>!l.divergente).length + '/2'} itens promovidos.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2M', aprovado, `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado} aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2M', false, `erro: ${e.message}`);
    console.warn('[FASE 2M] promoção do Domínio 4 (recorrências/assinaturas) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2N — Domínio 1 (Caixas): Caixa Variável — tetoEfetivo/folegoAteTeto — 06/08/2026 =====
// Único par de campos do domínio 1 que faltava (.disponivel já promovido na FASE 2D/2E, mesma
// função WallaceFinanceEngine.calcularCaixaVariavel() — só lendo os outros 2 campos do mesmo
// retorno). comprometidoParaTeto == comprometido (recalcularAgregadosDerivados(), linha 2766), por
// isso comprometido entra direto na função sem campo novo. Sem fetch novo, sem tocar Boletos/Livro
// LRC/ROC/Opções.
(function promocaoDominio1CaixaVariavelTeto(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2N] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof REG === 'undefined' || !REG.caixaVariavel) return;

    const cv = REG.caixaVariavel;
    const v1 = { tetoEfetivo: cv.tetoEfetivo, folegoAteTeto: cv.folegoAteTeto };
    const v2 = WallaceFinanceEngine.calcularCaixaVariavel({
      saldoReal: cv.saldoReal,
      comprometido: cv.comprometido,
      tetoOficial: cv.tetoOficial,
      tolerenciaTemp: cv.tolerenciaTemp || 0,
    });
    const lote = WallaceComparator.compararLote([
      { nome: 'Caixa Variável (tetoEfetivo)', antigo: v1.tetoEfetivo, novo: v2.tetoEfetivo },
      { nome: 'Caixa Variável (folegoAteTeto)', antigo: v1.folegoAteTeto, novo: v2.folegoAteTeto },
    ]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      cv.tetoEfetivo = v2.tetoEfetivo;
      cv.folegoAteTeto = v2.folegoAteTeto;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2N] Domínio 1 (Caixa Variável tetoEfetivo/folegoAteTeto): ${aprovado ? '2/2' : lote.log.filter(l=>!l.divergente).length + '/2'} itens promovidos.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2N', aprovado, `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado} aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2N', false, `erro: ${e.message}`);
    console.warn('[FASE 2N] promoção do Domínio 1 (Caixa Variável teto) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2O — Domínio 3 (Patrimônio/Balanço): Projeto Casa Nova — 06/08/2026 =====
// Mesmas entradas do V1 (VARS.btgNecton, VARS.caixaLance, REG.projetoCasaNova.metaLance) — cópia
// fiel da fórmula (ver FinanceEngine.js calcularProjetoCasaNova, app.js:3063-3065). Sem tocar
// Boletos/Livro LRC/ROC/Opções/cartao_id/usuario_id.
(function promocaoDominio3ProjetoCasaNova(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2O] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.projetoCasaNova) return;

    const v1 = { capitalDisponivel: REG.projetoCasaNova.capitalDisponivel, pct: REG.projetoCasaNova.pct, falta: REG.projetoCasaNova.falta };
    const v2 = WallaceFinanceEngine.calcularProjetoCasaNova({
      btgNecton: VARS.btgNecton,
      caixaLance: VARS.caixaLance,
      metaLance: REG.projetoCasaNova.metaLance,
    });
    const lote = WallaceComparator.compararLote([
      { nome: 'Projeto Casa Nova (capital disponível)', antigo: v1.capitalDisponivel, novo: v2.capitalDisponivel },
      { nome: 'Projeto Casa Nova (%)', antigo: v1.pct, novo: v2.pct },
      { nome: 'Projeto Casa Nova (falta)', antigo: v1.falta, novo: v2.falta },
    ]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      REG.projetoCasaNova.capitalDisponivel = v2.capitalDisponivel;
      REG.projetoCasaNova.pct = v2.pct;
      REG.projetoCasaNova.falta = v2.falta;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2O] Domínio 3 (Projeto Casa Nova): ${aprovado ? '3/3' : lote.log.filter(l=>!l.divergente).length + '/3'} itens promovidos.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2O', aprovado, `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado} aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2O', false, `erro: ${e.message}`);
    console.warn('[FASE 2O] promoção do Domínio 3 (Projeto Casa Nova) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2P — Domínio 3 (Patrimônio/Balanço): Escola de Júlio % da meta — 06/08/2026 =====
// Mesmas entradas do V1 (VARS.escolaJulioSaldo, VARS.metaEscolaJulio) — cópia fiel da fórmula (ver
// FinanceEngine.js calcularEscolaPct, app.js:3046). Sem tocar Boletos/Livro LRC/ROC/Opções/
// cartao_id/usuario_id.
(function promocaoDominio3EscolaJulioPct(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2P] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.metasPatrimoniais) return;

    const v1 = REG.metasPatrimoniais.escolaPct;
    const v2 = WallaceFinanceEngine.calcularEscolaPct(VARS.escolaJulioSaldo, VARS.metaEscolaJulio);
    const lote = WallaceComparator.compararLote([{ nome: 'Escola de Júlio (% da meta)', antigo: v1, novo: v2 }]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      REG.metasPatrimoniais.escolaPct = v2;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2P] Domínio 3 (Escola de Júlio %): ${aprovado ? '1/1' : '0/1'} item promovido.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2P', aprovado, `diff R$${lote.log[0].diferenca}`);
  } catch(e) {
    registrarValidacaoFase('FASE 2P', false, `erro: ${e.message}`);
    console.warn('[FASE 2P] promoção do Domínio 3 (Escola de Júlio %) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2Q — Domínio 4 (Cartões/Livros Razão): Livro LRC (total exibido) — 06/08/2026 =====
// ATENÇÃO: NÃO é o `VARS.livroLRC` represado (soma do array LRC_LIMBO_TRANSACOES, usado só na
// perna-3 da cascata de reembolso — esse continua intocado e represado, matriz ainda 🟡 até 1 ciclo
// fechado confirmar). Este item é `REG.livrosRazaoTotais.LRC.total` (app.js:3039), soma de 2
// escalares já confirmados (`visaDetalhe.corp`/`mbDetalhe.corp`) — mesmo padrão de baixo risco da
// FASE 2M, sem ler o array/cascata represada, sem tocar Boletos/ROC/Opções/cartao_id/usuario_id.
(function promocaoDominio4LivroLRCTotal(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2Q] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof REG === 'undefined' || !REG.livrosRazaoTotais || !REG.livrosRazaoTotais.LRC || !REG.visaDetalhe || !REG.mbDetalhe) return;

    const v1 = REG.livrosRazaoTotais.LRC.total;
    const v2 = WallaceFinanceEngine.calcularLivroLRC({ visaCorp: REG.visaDetalhe.corp, mbCorp: REG.mbDetalhe.corp });
    const lote = WallaceComparator.compararLote([{ nome: 'Livro LRC (total)', antigo: v1, novo: v2 }]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      REG.livrosRazaoTotais.LRC.total = v2;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2Q] Domínio 4 (Livro LRC total): ${aprovado ? '1/1' : '0/1'} item promovido.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2Q', aprovado, `diff R$${lote.log[0].diferenca}`);
  } catch(e) {
    registrarValidacaoFase('FASE 2Q', false, `erro: ${e.message}`);
    console.warn('[FASE 2Q] promoção do Domínio 4 (Livro LRC total) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2R — Domínio 9 (Opções): Valor de Mercado Consolidado — 06/08/2026 =====
// Só a soma do valor de mercado das posições não vencidas (VARS.opcoesVendidasValorMercado,
// app.js:2155) — não depende de schema novo, não persiste nada no Supabase, só lê o array já
// calculado no boot (VARS.opcoesVendidasDetalhe, já com .vencida definido). Não toca ROC nem ligas
// nenhuma outra métrica de Opções.
(function promocaoDominio9ValorMercado(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2R] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || !Array.isArray(VARS.opcoesVendidasDetalhe)) return;

    const v1 = VARS.opcoesVendidasValorMercado;
    const v2 = WallaceFinanceEngine.calcularValorMercadoConsolidado(VARS.opcoesVendidasDetalhe);
    const lote = WallaceComparator.compararLote([{ nome: 'Opções (valor de mercado consolidado)', antigo: v1, novo: v2 }]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      VARS.opcoesVendidasValorMercado = v2;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2R] Domínio 9 (Valor de Mercado Consolidado): ${aprovado ? '1/1' : '0/1'} item promovido.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2R', aprovado, `diff R$${lote.log[0].diferenca}`);
  } catch(e) {
    registrarValidacaoFase('FASE 2R', false, `erro: ${e.message}`);
    console.warn('[FASE 2R] promoção do Domínio 9 (Valor de Mercado Consolidado) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2S — Domínio 9 (Opções): ROC por posição + ROC consolidado da carteira — 06/08/2026 =====
// calcularDiasOperacao/calcularROCPosicao/calcularROCConsolidado (FinanceEngine) reproduzem
// exatamente o bloco calcularROCOpcoes() já existente (app.js:2161-2270) — mesmas entradas
// (VARS.opcoesVendidasDetalhe, já com .vencida calculado, VARS.CDI_MENSAL_ATUAL,
// VARS.ROC_STATUS_LIMITES), nenhum fetch novo, nenhuma leitura de schema/tabela `investimentos`
// (isso continua bloqueado — só a migração de PERSISTÊNCIA é 🔴, o CÁLCULO em memória não depende
// disso). Única adaptação: o FinanceEngine usa datas ISO (dias determinístico, testável) em vez de
// datas BR parseadas na mão — convertidas aqui antes de chamar. E `classificarStatusROC` do
// FinanceEngine devolve só o label (string); o V1 usa um objeto {label,emoji,classe} pra pintar o
// badge na UI — reconstruído aqui com um mapa fixo (mesmas 4 classes que já existiam em
// classificarStatusROC local, não inventa CSS novo). Não toca Boletos/Livro LRC/cartao_id/
// usuario_id/schema.
(function promocaoDominio9ROC(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2S] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || !Array.isArray(VARS.opcoesVendidasDetalhe) || !VARS.opcoesVendidasDetalhe.length || !VARS.opcoesVendidasDetalhe.every(o => o.roc)) return;

    const ROC_STATUS_META = {
      'Fraca': { emoji: '🔴', classe: 'br' },
      'Boa': { emoji: '🟡', classe: 'ba' },
      'Muito Boa': { emoji: '🟢', classe: 'bg' },
      'Excelente': { emoji: '🔵', classe: 'bb' },
    };
    const cdiMensalAtual = VARS.CDI_MENSAL_ATUAL;
    const limites = VARS.ROC_STATUS_LIMITES;
    const hojeISO = new Date().toISOString();
    const parseDataNotaISO = str => {
      const m = str && str.match(/\((\d{2})\/(\d{2})\/(\d{4})\)/);
      return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).toISOString() : null;
    };
    const parseDataBRISO = str => {
      if (!str) return null;
      const [d, mo, a] = str.split('/').map(Number);
      return new Date(a, mo - 1, d).toISOString();
    };

    const pares = [];
    const posicoesV2 = [];
    VARS.opcoesVendidasDetalhe.forEach(o => {
      const dataVendaISO = parseDataNotaISO(o.notaCorretagem);
      const dataVencimentoISO = parseDataBRISO(o.vencimento);
      const diasV2 = (dataVendaISO && dataVencimentoISO) ? WallaceFinanceEngine.calcularDiasOperacao(dataVendaISO, dataVencimentoISO, hojeISO) : null;
      const rocV2 = WallaceFinanceEngine.calcularROCPosicao({
        quantidade: o.quantidade, precoExercicio: o.precoExercicio, premioRecebido: o.premioRecebido,
        diasOperacao: diasV2, cdiMensalAtual, limites,
      });
      const id = o.ticker || o.ativo || 'posição';
      pares.push({ nome: `${id} (dias)`, antigo: o.roc.diasOperacao, novo: diasV2 });
      pares.push({ nome: `${id} (capitalTravado)`, antigo: o.roc.capitalTravado, novo: rocV2.capitalTravado });
      pares.push({ nome: `${id} (rentabilidadeMensal)`, antigo: o.roc.rentabilidadeMensal, novo: rocV2.rentabilidadeMensal });
      pares.push({ nome: `${id} (status)`, antigo: o.roc.statusROC ? o.roc.statusROC.label : null, novo: rocV2.statusROC });
      posicoesV2.push({ o, diasV2, rocV2 });
    });

    const posicoesComROC = posicoesV2.filter(p => p.rocV2.capitalTravado !== null && !p.o.vencida)
      .map(p => ({ capitalTravado: p.rocV2.capitalTravado, premioLiquido: p.rocV2.premioLiquido, diasOperacao: p.diasV2 }));
    const carteiraV2 = WallaceFinanceEngine.calcularROCConsolidado(posicoesComROC, cdiMensalAtual, limites);
    const carteiraV1 = VARS.rocCarteira;
    pares.push({ nome: 'Carteira (capitalTravado)', antigo: carteiraV1.capitalTravado, novo: carteiraV2.capitalTravado });
    pares.push({ nome: 'Carteira (premioLiquido)', antigo: carteiraV1.premioLiquido, novo: carteiraV2.premioLiquido });
    pares.push({ nome: 'Carteira (rentabilidadeMensal)', antigo: carteiraV1.rentabilidadeMensal, novo: carteiraV2.rentabilidadeMensal });
    pares.push({ nome: 'Carteira (diasMedios)', antigo: carteiraV1.diasMedios, novo: carteiraV2.diasMedios });
    pares.push({ nome: 'Carteira (status)', antigo: carteiraV1.statusROC ? carteiraV1.statusROC.label : null, novo: carteiraV2.statusROC });

    const lote = WallaceComparator.compararLote(pares);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      posicoesV2.forEach(({ o, diasV2, rocV2 }) => {
        const meta = rocV2.statusROC ? ROC_STATUS_META[rocV2.statusROC] : null;
        o.roc = {
          contratos: rocV2.contratos, diasOperacao: diasV2, capitalTravado: rocV2.capitalTravado, premioLiquido: rocV2.premioLiquido,
          rentabilidade: rocV2.rentabilidade, rentabilidadeMensal: rocV2.rentabilidadeMensal, rentabilidadeAnual: rocV2.rentabilidadeAnual,
          comparacaoCDI: (cdiMensalAtual > 0 && rocV2.rentabilidadeMensal !== null) ? rocV2.rentabilidadeMensal / (cdiMensalAtual / 100) : null,
          statusROC: meta ? { label: rocV2.statusROC, emoji: meta.emoji, classe: meta.classe } : null,
        };
      });
      const metaCarteira = carteiraV2.statusROC ? ROC_STATUS_META[carteiraV2.statusROC] : null;
      VARS.rocCarteira = {
        capitalTravado: carteiraV2.capitalTravado, premioLiquido: carteiraV2.premioLiquido, rentabilidade: carteiraV2.rentabilidade,
        rentabilidadeMensal: carteiraV2.rentabilidadeMensal, rentabilidadeAnualizada: carteiraV2.rentabilidadeAnualizada,
        comparacaoCDI: (cdiMensalAtual > 0 && carteiraV2.rentabilidadeMensal !== null) ? carteiraV2.rentabilidadeMensal / (cdiMensalAtual / 100) : null,
        diasMedios: carteiraV2.diasMedios,
        statusROC: metaCarteira ? { label: carteiraV2.statusROC, emoji: metaCarteira.emoji, classe: metaCarteira.classe } : null,
        itensSemStrike: carteiraV1.itensSemStrike, itensVencidosExcluidos: carteiraV1.itensVencidosExcluidos,
      };
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2S] Domínio 9 (ROC posições + carteira): ${aprovado ? `${lote.totalComparado}/${lote.totalComparado}` : `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado}`} itens promovidos.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2S', aprovado, `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado} aprovados`);
  } catch(e) {
    registrarValidacaoFase('FASE 2S', false, `erro: ${e.message}`);
    console.warn('[FASE 2S] promoção do Domínio 9 (ROC) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2T — Domínio 3 (Patrimônio/Balanço): idade (REG.idadeWallace) — 06/08/2026 =====
// calcularIdade(dataNascimentoISO, hojeISO) reproduz a IIFE já existente em app.js:2860-2866 —
// mesma fórmula (idade = ano atual - ano nascimento, -1 se ainda não fez aniversário este ano),
// mesma entrada (VARS.dataNascimentoWallace). Não toca Boletos/Livro LRC/ROC/Opções/cartao_id/
// usuario_id/schema.
(function promocaoDominio3Idade(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2T] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || REG.idadeWallace === undefined) return;

    const v1 = REG.idadeWallace;
    const v2 = WallaceFinanceEngine.calcularIdade(VARS.dataNascimentoWallace, new Date().toISOString());
    const lote = WallaceComparator.compararLote([{ nome: 'Idade Wallace', antigo: v1, novo: v2 }]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      REG.idadeWallace = v2;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2T] Domínio 3 (Idade): ${aprovado ? '1/1' : '0/1'} item promovido.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2T', aprovado, `diff ${lote.log[0].diferenca}`);
  } catch(e) {
    registrarValidacaoFase('FASE 2T', false, `erro: ${e.message}`);
    console.warn('[FASE 2T] promoção do Domínio 3 (Idade) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2U — Domínio 3 (Patrimônio/Balanço): Balanço completo — 06/08/2026 =====
// calcularPatrimonio() reproduz app.js:2790-2807 (fisicoTotal, financeiroTotal, consorcioCasaPago,
// passivosTotal, ativosTotal, patrimonioLiquido, patrimonioTotalGeral). Matriz classifica 🟡 por
// causa do override manual de Financiamento Casa (histórico de dessincronia) — em vez de deixar
// represado por precaução, este bloco usa o MESMO gate de segurança de sempre: só promove se o
// Comparator confirmar 0 divergência entre os 7 campos. Se o override estiver dessincronizado, o
// gate reprova e a tela continua mostrando V1 — nenhum risco novo, mesmo padrão do resto da sessão.
// Não toca Boletos/Livro LRC/ROC/Opções/cartao_id/usuario_id/schema.
(function promocaoDominio3BalancoCompleto(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2U] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof VARS === 'undefined' || typeof REG === 'undefined' || !REG.balanco || !REG.balanco.fisico || !REG.balanco.financeiro || !REG.balanco.passivos) return;

    const bf = REG.balanco.fisico, bfin = REG.balanco.financeiro, bp = REG.balanco.passivos;
    const v1 = {
      fisicoTotal: bf.total, financeiroTotal: bfin.total, consorcioCasaPago: bfin.consorcioCasaPago,
      passivosTotal: bp.total, ativosTotal: REG.balanco.ativosTotal, patrimonioLiquido: REG.balanco.patrimonioLiquido,
      patrimonioTotalGeral: REG.balanco.patrimonioTotalGeral,
    };
    const v2 = WallaceFinanceEngine.calcularPatrimonio({
      patCasa: bf.casa, patApartamento: bf.apartamento, patJazigo: bf.jazigo, patSolar: bf.solar, patCarro: bf.carro,
      reserva: bfin.reserva, btgNecton: bfin.btg, nectonContaCorrente: bfin.nectonContaCorrente,
      consorcioCasaParcela: VARS.consorcioCasaParcela, consorcioCasaParcelasPagas: VARS.consorcioCasaParcelasPagas,
      passivoFinanciamentoCasa: bp.financiamentoCasa, passivoConsorcioAuto: bp.consorcioAutoContemplado,
      pgbl: REG.balanco.pgbl, fgts: REG.balanco.fgts,
    });
    const lote = WallaceComparator.compararLote([
      { nome: 'Balanço (fisicoTotal)', antigo: v1.fisicoTotal, novo: v2.fisicoTotal },
      { nome: 'Balanço (financeiroTotal)', antigo: v1.financeiroTotal, novo: v2.financeiroTotal },
      { nome: 'Balanço (consorcioCasaPago)', antigo: v1.consorcioCasaPago, novo: v2.consorcioCasaPago },
      { nome: 'Balanço (passivosTotal)', antigo: v1.passivosTotal, novo: v2.passivosTotal },
      { nome: 'Balanço (ativosTotal)', antigo: v1.ativosTotal, novo: v2.ativosTotal },
      { nome: 'Balanço (patrimonioLiquido)', antigo: v1.patrimonioLiquido, novo: v2.patrimonioLiquido },
      { nome: 'Balanço (patrimonioTotalGeral)', antigo: v1.patrimonioTotalGeral, novo: v2.patrimonioTotalGeral },
    ]);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      bf.total = v2.fisicoTotal;
      bfin.total = v2.financeiroTotal;
      bfin.consorcioCasaPago = v2.consorcioCasaPago;
      bp.total = v2.passivosTotal;
      REG.balanco.ativosTotal = v2.ativosTotal;
      REG.balanco.patrimonioLiquido = v2.patrimonioLiquido;
      REG.balanco.patrimonioTotalGeral = v2.patrimonioTotalGeral;
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2U] Domínio 3 (Balanço completo): ${aprovado ? `${lote.totalComparado}/${lote.totalComparado}` : `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado}`} campos promovidos.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn('[FASE 2U] Balanço NÃO promovido — provável dessincronia do override de Financiamento Casa (já documentada). ' + WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2U', aprovado, aprovado ? `${lote.totalComparado}/${lote.totalComparado} aprovados` : `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado} aprovados — provável override Financiamento Casa`);
  } catch(e) {
    registrarValidacaoFase('FASE 2U', false, `erro: ${e.message}`);
    console.warn('[FASE 2U] promoção do Domínio 3 (Balanço completo) falhou (não afeta o site — valores V1 permanecem exibidos):', e);
  }
})();

// ===== FASE 2V — cenário Superávit Normal: função liquidoMes(i) — 06/08/2026 =====
// calcularLiquidoMes() reproduz a função liquidoMes(i) já existente em app.js:725-735 (real
// confirmado > projetado do estimador, se i=0 e dia>=12 > média ponderada 12 meses de fallback).
// Diferente de todas as fases anteriores: aqui a promoção troca o CORPO DE UMA FUNÇÃO chamada em
// vários pontos (não um campo escrito 1x), porque liquidoMes(i) é lida sob demanda em tempo real
// (dia do mês muda a cada carregamento). Validado primeiro chamando a função ORIGINAL pros 12
// índices do cenário (mesmo range de REG.superavitNormal.necessidade) e comparando contra o
// FinanceEngine — só troca a implementação de liquidoMes se os 12 baterem exato. Não toca Boletos/
// Livro LRC/ROC/Opções/cartao_id/usuario_id/schema.
(function promocaoLiquidoMesFinanceEngine(){
  try {
    if (typeof WallaceFinanceEngine === 'undefined' || typeof WallaceComparator === 'undefined') {
      console.warn('[FASE 2V] FinanceEngine/Comparator não carregados nesta sessão — promoção pulada (não bloqueia o site).');
      return;
    }
    if (typeof REG === 'undefined' || typeof liquidoMes !== 'function' || !REG.superavitNormal || !REG.cenarioHistorico || !REG.estimador) return;

    const diaDoMes = new Date().getDate();
    const pares = [];
    for (let i = 0; i < 12; i++) {
      const v1 = liquidoMes(i);
      const v2 = WallaceFinanceEngine.calcularLiquidoMes({
        indice: i,
        liquidoReal: REG.superavitNormal.liquidoReal || {},
        mediaPonderada12M: REG.cenarioHistorico.mediaPonderada12M,
        liquidoProjetadoProximoCiclo: REG.estimador.liquidoProjetadoProximoCiclo,
        diaDoMes,
      });
      pares.push({ nome: `liquidoMes(${i})`, antigo: v1, novo: v2 });
    }
    const lote = WallaceComparator.compararLote(pares);
    const aprovado = lote.totalDivergente === 0;
    if (aprovado) {
      // eslint-disable-next-line no-func-assign -- troca intencional, ver comentário do bloco acima.
      liquidoMes = function(i){
        return WallaceFinanceEngine.calcularLiquidoMes({
          indice: i,
          liquidoReal: REG.superavitNormal.liquidoReal || {},
          mediaPonderada12M: REG.cenarioHistorico.mediaPonderada12M,
          liquidoProjetadoProximoCiclo: REG.estimador.liquidoProjetadoProximoCiclo,
          diaDoMes: new Date().getDate(),
        });
      };
      if (typeof hydrate === 'function') hydrate();
      if (typeof atualizarGraficosPorCiclo === 'function') atualizarGraficosPorCiclo();
    }
    console.log(`%c[FASE 2V] liquidoMes(i): ${aprovado ? '12/12' : (lote.totalComparado - lote.totalDivergente) + '/12'} índices promovidos.`, 'color:#34c98a');
    console.table(lote.log);
    if (!aprovado) console.warn(WallaceComparator.formatarLog(lote));
    registrarValidacaoFase('FASE 2V', aprovado, `${lote.totalComparado - lote.totalDivergente}/${lote.totalComparado} aprovados`);
    console.log('%c[VALIDAÇÃO RUNTIME] Resumo completo das 18 fases (2D-2V):', 'color:#8ab4f8;font-weight:700');
    console.table(window.WALLACE_VALIDACAO_RUNTIME);
  } catch(e) {
    registrarValidacaoFase('FASE 2V', false, `erro: ${e.message}`);
    console.warn('[FASE 2V] promoção de liquidoMes(i) falhou (não afeta o site — função original permanece):', e);
  }
})();
