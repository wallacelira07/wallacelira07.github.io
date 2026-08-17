// MÓDULO: aplicarDeficitCaixasSemLrei() — política nova (09/08/2026, pedido explícito do usuário):
// caixas operacionais funcionam como "bolsões" de gasto temático (ex: comprar carne pro Churrasco no
// cartão debita a Caixa Churrasco mesmo sem saldo suficiente, fica negativa até ser coberta por LREI,
// reembolso, ou o aporte do dia 25). Até aqui, esse risco nunca era CONTABILIZADO em lugar nenhum — o
// card da caixa mostrava vermelho, mas a Necessidade Total Bruta (o número que diz "quanto precisa
// entrar este ciclo") não sabia que aquele buraco existia. Regra nova: caixa negativa SEM um LREI
// (empréstimo interno) ativo cobrindo o rombo soma a diferença na Necessidade Total Bruta, mesmo
// tratamento que Cobertura Garantida já recebe (ajuste em cima do total, não um 8º componente de
// totalOperacional — os 7 componentes documentados na Política seção 13 continuam intocados).
//
// AMPLIADO 16/08/2026 (achado do usuário, explicado com exemplo real: "a caixa emagrecer tem 278 em
// dinheiro... a caixa entrou em 590 negativo [de Disponível Real, comprometido no cartão − saldo] —
// essa diferença tem que aparecer nas necessidades do ciclo, porque esse dinheiro vai vir do
// salário"). Até aqui esta função só olhava SALDO REAL negativo (ignorava por completo o comprometido
// no cartão, que nunca reduz saldo real por design — regra 1.3.5). Isso deixava uma classe de déficit
// inteira invisível: uma caixa podia estar com saldo real positivo mas já "estourada" no cartão (mais
// comprometido do que tem), e isso nunca virava Necessidade. Fórmula generalizada:
// déficit = max(0, comprometido_no_cartão − saldo_real − LREI_de_suporte) — quando comprometido=0,
// reduz exatamente à fórmula antiga (max(0, −saldo−LREI)), então nenhuma caixa sem cartão muda de
// comportamento. Comprometido buscado via WallaceFinanceService.getComprometidoPorCaixaV2() (mesma
// fonte/cache já usada por hydrate-comprometido-caixas-tematicas-v2.js) pras 6 caixas temáticas com
// cartão habilitado (CAIXAS_TEMATICAS_COMPROMETIDO_V2, mesmo arquivo). A Caixa Variável foi deixada
// DE FORA de propósito — ela já tem seu próprio mecanismo dedicado, maduro, testado há semanas
// (orçamentoOperacional fixo R$3.200 + ECC/teto/tolerância) — misturar os dois arriscaria contar o
// mesmo estouro 2 vezes por caminhos diferentes. Se um dia fizer sentido unificar os dois, é decisão
// separada, não decidida aqui.
//
// Por que uma função própria em vez de plugar em aplicarOnda2V2/aplicarOnda4Lrei: essas duas rodam de
// forma independente e assíncrona (onDomPronto, sem await entre si) — depender da ordem de execução de
// uma delas é a mesma classe de bug já encontrada 2x nesta sessão (LEGENDAS sobrescrito por
// wallace_dados, PGV invisível pela regra antiga da view). Esta função busca os dados sozinha
// (Promise.all), sem depender de nenhuma das outras já ter rodado.
//
// Rollback: comentar a chamada onDomPronto(aplicarDeficitCaixasSemLrei) em app.js — necessidadeTotalBruta
// volta a ser só a soma dos 7 componentes de sempre.

async function aplicarDeficitCaixasSemLrei(){
  let saldos, emprestimos, comprometidos;
  try {
    // CAIXAS_TEMATICAS_COMPROMETIDO_V2 vem de hydrate-comprometido-caixas-tematicas-v2.js (mesmo
    // arquivo carregado antes deste no boot, ver app.js) — reaproveita a lista, não duplica os 6 ids.
    const comprometidoPromises = CAIXAS_TEMATICAS_COMPROMETIDO_V2.map(cfg =>
      WallaceFinanceService.getComprometidoPorCaixaV2(cfg.id)
        .then(v => ({ nome: cfg.nome, valor: Number(v) || 0 }))
        .catch(() => ({ nome: cfg.nome, valor: 0 })) // uma caixa falhando não derruba as outras
    );
    [saldos, emprestimos, comprometidos] = await Promise.all([
      WallaceFinanceService.getSaldosPorCaixa(),
      WallaceFinanceService.getEmprestimosInternosV2(),
      Promise.all(comprometidoPromises),
    ]);
  } catch(err){
    console.error('DeficitCaixasSemLrei: falha ao buscar saldo/LREI/comprometido da V2 — ajuste NÃO aplicado nesta rodada (Necessidade Total Bruta fica sem o risco de caixas negativas/estouradas no cartão).', err);
    window.WALLACE_DEFICIT_CAIXAS_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(saldos) || !Array.isArray(emprestimos)){
    console.warn('DeficitCaixasSemLrei: resposta inesperada da V2 — ajuste não aplicado.');
    window.WALLACE_DEFICIT_CAIXAS_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const r2 = x => Math.round(x*100)/100;

  // Soma de LREI ATIVO por caixa devedora (nome exato, mesmo campo já usado em hydrate-onda4-lrei.js).
  const lreiSuportePorCaixa = {};
  emprestimos.forEach(l => {
    if(l.status !== 'ATIVO') return;
    lreiSuportePorCaixa[l.devedora] = (lreiSuportePorCaixa[l.devedora] || 0) + Number(l.valor || 0);
  });

  const comprometidoCartaoPorCaixa = {};
  comprometidos.forEach(c => { comprometidoCartaoPorCaixa[c.nome] = c.valor; });

  const porCaixa = saldos
    .filter(c => c.caixa_tipo === 'operacional')
    .map(c => {
      const saldo = Number(c.v2_saldo_calculado);
      const lrei = lreiSuportePorCaixa[c.caixa_nome] || 0;
      const comprometidoCartao = comprometidoCartaoPorCaixa[c.caixa_nome] || 0;
      const deficit = Math.max(0, r2(comprometidoCartao - saldo - lrei));
      return { caixa: c.caixa_nome, saldo: r2(saldo), lreiSuporte: r2(lrei), comprometidoCartao: r2(comprometidoCartao), deficit };
    })
    .filter(x => x.deficit > 0);

  const deficitTotal = r2(porCaixa.reduce((s,x) => s + x.deficit, 0));

  window.WALLACE_DEFICIT_CAIXAS_RELATORIO = { porCaixa, total: deficitTotal };
  console.log('DeficitCaixasSemLrei: relatório completo em window.WALLACE_DEFICIT_CAIXAS_RELATORIO', window.WALLACE_DEFICIT_CAIXAS_RELATORIO);

  // CORRIGIDO 10/08/2026: antes só rodava a cascata (necessidadeTotalBruta→necessidadeLiquida/saldoCiclo/
  // modoOperacional) quando deficitTotal>0, e nunca tocava REG.evolucao (o array que alimenta o
  // gráfico "Necessidade líquida — próximos ciclos") nem o gráfico em si — o card do Resumo Executivo
  // mostrava o valor com déficit, o gráfico continuava com o valor de antes, congelado desde o boot
  // (achado real: R$13.850,48 no card × R$13.179 no primeiro ponto do gráfico, mesmo ciclo). Also
  // corrigia só o caminho "tem déficit" - se uma caixa voltasse a ficar positiva (déficit some), o
  // ajuste antigo somado ficava travado pra sempre, porque só é subtraído recalculando do zero.
  // Agora sempre grava (mesmo 0, pra "zerar" um déficit resolvido) e sempre reprocessa via a mesma
  // função pura usada no boot (recalcularNecessidade(), agora reentrante — ver seção do próprio
  // ajuste lá dentro), que já recalcula REG.evolucao[0] junto. Único passo extra aqui é reconciliar
  // os gráficos já desenhados (ver atualizarGraficosNecessidade(), graficos-cenarios-lazy.js).
  REG.operacional.deficitCaixasSemLrei = deficitTotal;
  // recalcularNecessidade() já cuida de necessidadeLiquida/saldoCiclo/fluxo.saidas/fluxo.resultado/
  // modoOperacional/REG.evolucao[0] — nenhuma dessas linhas precisa ser replicada aqui.
  if(typeof recalcularNecessidade === 'function') recalcularNecessidade();

  if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
  if(typeof hydrateBalanco === 'function') hydrateBalanco();
  if(typeof hydrateCenarios === 'function') hydrateCenarios();
  if(typeof hydrateResumoP2P === 'function') hydrateResumoP2P();
  if(typeof atualizarGraficosNecessidade === 'function') atualizarGraficosNecessidade();
  // CORRIGIDO 10/08/2026: atualizarGraficosNecessidade() mora no módulo lazy (graficos-cenarios-lazy.js)
  // e some quando a aba Gráficos/Cenários nunca foi aberta - atualizarGraficosPainelPrincipal() (sempre
  // carregada, graficos-painel-principal.js) cobre os 2 gráficos do Painel principal nesse caso.
  if(typeof atualizarGraficosPainelPrincipal === 'function') atualizarGraficosPainelPrincipal();

  if(deficitTotal > 0){
    console.warn(`DeficitCaixasSemLrei: +${fmt(deficitTotal)} somado à Necessidade Total Bruta (${porCaixa.length} caixa(s) com rombo real ou comprometido no cartão maior que o saldo, sem LREI cobrindo: ${porCaixa.map(x=>x.caixa+' '+fmt(x.deficit)).join(', ')}).`);
  } else {
    console.log('DeficitCaixasSemLrei: nenhuma caixa operacional com rombo real nem comprometido no cartão excedendo o saldo — ajuste em 0.');
  }
}
