// ===== Utilitario global unico (auditoria 15/07/2026: havia 4 definicoes duplicadas de fmt(),
// uma por IIFE - consolidado aqui, todas as IIFEs abaixo usam esta via closure) =====
function fmt(v){return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
// CORRIGIDO 19/07/2026: varios graficos tinham min/max fixos no eixo Y, calculados a mao numa sessao
// anterior para o range de dados de entao. Como os dados crescem (ex: comprometido subindo), o teto
// fixo passou a cortar/estourar a barra ou linha. yRange() calcula um min/max automatico com folga,
// arredondado, a partir dos dados reais de cada grafico - substitui todo min/max hardcoded.
function yRange(data, padPct=0.12){
  const vals = data.filter(v=>typeof v==='number' && !isNaN(v));
  if(!vals.length) return {min:undefined, max:undefined};
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const range = (mx-mn) || Math.abs(mx) || 1;
  const pad = range*padPct;
  const step = mx >= 5000 ? 100 : mx >= 500 ? 10 : 1;
  return { min: Math.max(0, Math.floor((mn-pad)/step)*step), max: Math.ceil((mx+pad)/step)*step };
}

// ===== Janela rolante de 12 meses (padrao unico definido 17/07/2026, V50 item 4) =====
// Pedido do usuario: "crie o padrao de mostrar essas projecoes com 12 meses... todo mes que mudar as
// 00hs do primeiro dia do mes, empurre 1 mes a frente". gerarMeses(n) sempre comeca no MES CALENDARIO
// atual (baseado na data real do dispositivo/servidor no momento em que a pagina carrega) e gera os
// proximos n meses sequenciais - nunca hardcoded, nunca pula mes. Toda virada de mes (00h do dia 1),
// a proxima carga da pagina automaticamente desloca a janela inteira 1 mes a frente, sem intervencao.
function gerarMeses(n){
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const agora = new Date();
  const labels = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() + i, 1);
    labels.push(nomes[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2));
  }
  return labels;
}

// ===== CORRECAO 18/07/2026 (V72, bug real apontado em auditoria externa): as series de projecao
// (evolucao.totalOperacional/necessidadeLiquida, superavitNormal, deficitZero, alivioData) sao arrays
// fixos indexados 0-11 que assumem "indice 0 = mes em que este arquivo foi gerado". gerarMeses(12)
// sempre comeca no MES CALENDARIO REAL atual - se a pagina for aberta num mes seguinte sem os arrays
// serem manualmente re-ancorados, os rotulos avancam mas os arrays nao, deslocando todo mundo (ex: o
// valor de Julho aparece rotulado como Agosto). ANCHOR_MONTH abaixo declara explicitamente a que mes
// o indice 0 de todos esses arrays corresponde HOJE. alignSeries()/alignEventos() calculam quantos
// meses ja se passaram desde essa ancora e deslocam os dados automaticamente antes de desenhar - assim,
// mesmo que ninguem atualize os arrays por 1-2 meses, o grafico nunca mostra o numero errado no mes
// errado (so fica "atrasado" - repete o ultimo valor conhecido, nunca inventa um novo).
const ANCHOR_MONTH = '2026-07'; // atualizar para o mes corrente sempre que os arrays abaixo forem recalculados manualmente
function mesesDesdeAncora(){
  const [ay, am] = ANCHOR_MONTH.split('-').map(Number);
  const agora = new Date();
  return (agora.getFullYear()-ay)*12 + (agora.getMonth()+1-am);
}
function alignSeries(series){
  const offset = mesesDesdeAncora();
  if (offset <= 0) return series.slice();
  const shifted = series.slice(offset);
  while (shifted.length < series.length) shifted.push(series[series.length-1]);
  return shifted;
}
function alignEventos(eventos){
  const offset = mesesDesdeAncora();
  if (offset <= 0) return Object.assign({}, eventos);
  const shifted = {};
  for (const k in eventos){
    const novoIdx = Number(k) - offset;
    if (novoIdx >= 0) shifted[novoIdx] = eventos[k];
  }
  return shifted;
}

// plugin global: rotula valor em cima/ao lado de cada barra (vertical ou horizontal) - compartilhado
// por TODOS os graficos de barra do arquivo (auditoria 16/07/2026: cVariavel era o unico grafico de
// barra sem rotulo de valor por barra, causando desalinhamento visual entre o resumo em texto acima
// e as barras abaixo, especialmente em telas estreitas onde o grid-3 empilha em 1 coluna).
const barValuePlugin = {
  id:'barValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    const horizontal = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.fillStyle = '#e8e6df';
    ctx.font = "600 10px -apple-system, 'Segoe UI', Roboto, sans-serif";
    meta.data.forEach((bar,i)=>{
      const v = values[i];
      const label = typeof v === 'number' ? fmt(v) : v;
      if(horizontal){
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, bar.x + 6, bar.y);
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(label, bar.x, bar.y - 6);
      }
    });
    ctx.restore();
  }
};

/*======================================================
SISTEMA WALLACE LIRA — REGISTRADORES GLOBAIS (REG)
Criado 16/07/2026 (auditoria, a pedido do usuario) - FASE 1 da
refatoracao de arquitetura de dados (PROJETO_REFATORACAO_ARQUITETURA,
ver SWP_INPUT). Fonte unica de verdade para os valores do topo do
Painel (kpi-strip), secao 02 (Modo Operacional), secao 20 (Indicadores)
e secao 21 (Resumo Executivo) - exatamente os pontos onde a auditoria
encontrou divergencia entre paginas (ex: Necessidade Liquida aparecendo
como R$13.290 num lugar e R$13.327,10 em outro).
NUNCA editar os numeros abaixo em mais de um lugar do arquivo: todo o
HTML acima consulta estes valores via hydrate(), nao mais texto solto.
Para atualizar o painel numa proxima sessao: mudar o valor AQUI, e
todo o resto se atualiza sozinho no proximo carregamento da pagina.
FASE 2 (nao feita ainda, requer sessao dedicada): estender REG para
os livros razao (LRW/LRV/LRB/...), graficos de composicao (g_cTotalOp,
g_cVisa, g_cMetas, g_cCaixas) e a pagina Cenarios inteira - hoje ainda
tem valores hardcoded nesses pontos, herdados da versao anterior do HTML.
======================================================*/
// AUTOMATIZADO 19/07/2026: helper global (real > projetado > mediana) para a serie "Liquido" do
// cenario Superavit Normal. Definido antes do REG ser consumido em qualquer render para poder ser
// chamado tanto no resumo executivo (indice 0, ciclo atual) quanto na tabela/grafico completo da
// pagina Cenarios. Fonte dos dados: REG.superavitNormal.liquidoProjetado/liquidoReal + REG.cenarioHistorico.mediana.
// REESCRITO 19/07/2026 (regra definida pelo usuario): para o ciclo mais proximo (i=0), a prioridade
// agora depende do DIA DO MES em que a pagina e aberta, nao so da existencia do dado:
//   dia >= 25            -> valor REAL recebido (liquidoReal[0]). Se ainda nao foi preenchido (salario
//                           acabou de cair, usuario ainda nao confirmou), mantem o projetado como melhor
//                           estimativa disponivel em vez de saltar para a media (evita regressao).
//   dia 12-24             -> Liquido Projetado do Estimador de Salario (REG.estimador.liquidoProjetadoProximoCiclo),
//                           calculado a partir da folha de ponto que sai por volta do dia 12.
//   dia 1-11               -> media ponderada de 12 meses (REG.cenarioHistorico.mediaPonderada12M) -
//                           fallback conservador, nenhum dado especifico do ciclo ainda.
// Para os demais indices (i>0, ciclos futuros sem estimador proprio) mantem a logica antiga: real[i]
// (se algum dia for preenchido) > media ponderada (fallback).
function liquidoMes(i){
  const fallback = REG.cenarioHistorico.mediaPonderada12M;
  const real = (REG.superavitNormal.liquidoReal || {})[i];
  if(real !== undefined && real !== null) return real;
  if(i === 0){
    const dia = new Date().getDate();
    if(dia >= 12 && dia <= 24) return REG.estimador.liquidoProjetadoProximoCiclo;
    if(dia >= 25) return REG.estimador.liquidoProjetadoProximoCiclo; // real ainda nao confirmado - mantem melhor estimativa
  }
  return fallback;
}

// ============================================================================
// BANCO DE VARIAVEIS UNICO (VARS) — NOVO 22/07/2026 (V134)
// ============================================================================
// Implementado HOJE (usuario pediu para nao esperar 25/07 - "encontrei a mesma
// classe de bug [...] nao da para esperar"). Nao e o SSOT completo (isso ainda
// depende do Google Sheets/Apps Script, que exige deploy fora do alcance das
// ferramentas do Claude nesta sessao — ver PROPOSTA_SSOT_GOOGLE_SHEETS_APPS_SCRIPT).
// Mas resolve a CAUSA RAIZ especifica que ja gerou bug real 3-4 vezes nesta sessao:
// o mesmo saldo (Caixa Lance, Manutencao, Boletos, Aniversario Julio, Escola Julio,
// Cartao Infinite/MB) existia em MULTIPLOS lugares do REG como numero literal
// duplicado, e cada correcao so atualizava um lugar, deixando os outros parados.
//
// A partir de agora: estes ~15 valores existem em UM SO lugar (aqui). Todo o
// resto do REG que precisa deles LE a partir daqui (VARS.xxx), nunca mais copia
// o numero. Atualizar um saldo = mudar uma linha aqui, e automaticamente todo
// lugar que usa aquele valor (cards, tabelas, graficos) fica correto.
const VARS = {
  // Caixa Variavel (operacional, dia-a-dia)
  caixaVariavelSaldoReal: 3933.37,      // V136 (22/07/2026): +R$40,00 (TX000133, venda de 2 creditos P2P p/ Elcio Da Silva Santos, destino Caixa Variavel). Era R$3.893,37.
  caixaVariavelComprometido: 3998.50,   // V136: +R$74,97 (TX131 H57Store/Vanessa R$17,98 + TX132 Google SunSurveyorApp/Wallace R$56,99). Era R$3.923,53.

  // Cofrinhos/caixas patrimoniais e operacionais (Mercado Pago)
  caixaLance: 553.91,                   // RECONCILIADO 22/07/2026 (V122) - saldo real do cofrinho
  caixaManutencao: 178.72,              // RECONCILIADO 22/07/2026 - LREI0001 quitado, deposito direto do reembolso
  caixaAniversarioJulio: 200.10,        // RECONCILIADO 22/07/2026 - reembolso Wartsila depositou R$200 direto (50% da meta R$400)
  caixaBoletos: 613.17,                 // RECONCILIADO 22/07/2026 (V123) - fecha exato com PIX Anderson R$210 + rendimento R$1,66
  caixaPixVanessa: 0,                   // PV (reserva do Wallace) - zerada desde V44
  pixGeralVanessaSaldo: -0.04,          // PGV (conta autonoma da Vanessa) - residuo imaterial documentado
  caixaEventos: 0,
  caixaSaudeFamilia: 0,
  caixaSeguroEmplacamento: 0,
  escolaJulioSaldo: 506.74,             // RECONCILIADO 22/07/2026 (V127) - fora da Meta do Milhao (regra P5/V47)

  // Cartoes (comprometido, corporativo Wartsila)
  cartaoInfiniteTotal: 9160.07,          // CORRIGIDO 23/07/2026: recalculado de baixo para cima apos auditoria linha-a-linha contra a fatura Bradesco real. Soma das 7 partes de visaDetalhe (parcelas+consorcios+wallace+recorrencias+corp+assinaturas+vanessa, esta ja incluindo TX131) = R$9.160,07 exato, naoReconciliado agora R$0,00. Correcoes aplicadas: Vivo +R$88,00 (revertida a config errada da V111), Amazon Prime Canais +R$19,99 e Amazon Prime Aluguel +R$9,99 (achados na fatura, nunca lancados). Era R$9.091,90.
  cartaoMBTotal: 2065.17,               // V136: +R$56,99 (TX132, Google SunSurveyorApp, Wallace, cartao 2244). Era R$2.008,18.

  // V135 (22/07/2026, auditoria SSOT): LRP e LRCON ainda sem split fisico por cartao (Politica sec.3) -
  // 100% atribuidos ao Visa Infinite por decisao documentada. Ate aqui existiam como numero literal
  // duplicado em totalOpDetalhe E visaDetalhe (2 copias que podiam dessincronizar) - agora moram so aqui.
  livroLRP: 2500.46,      // = LIVRO_LRP_TOTAL do ERP (16 parcelamentos)
  livroLRCON: 1950.77,    // = LIVRO_LRCON_TOTAL do ERP (2 consorcios)

  // Patrimonio financeiro (Meta do Milhao)
  reserva: 100066.05,
  btgNecton: 14673.40,
  nectonContaCorrente: 429.70,

  // Salario (cenarios de emergencia) - RECALCULADO 22/07/2026 (V132) com 12 contracheques reais,
  // media/mediana/min usam os 10 meses POS-PROMOCAO (ago/25-mai/26, usuario foi promovido de
  // Tecnico p/ Supervisor no meio do periodo - so os meses no cargo atual contam)
  salarioMedia12M: 20084.86,
  salarioMediana12M: 18283.64,
  salarioMin12M: 7649.62,
  salarioMediaPonderada12M: 17843.58,

  // ===== V137 (23/07/2026, auditoria SSOT - pedido explicito do usuario: "nada com numero digitado,
  // tudo formula e referencia a lista de variaveis, so atualizar em 1 lugar") =====
  // Fatura Wartsila / Mercado Pago (corrige divergencia REAL encontrada: REG.mercadoPago mostrava
  // R$1.751,16 em 2 lugares da tela e REG.balanco.obrigacoes.mercadoPago mostrava R$1.791,93 em outro -
  // mesma fatura, 2 numeros diferentes na tela. Fonte correta: LIVRO_LRMP_TOTAL do ERP, R$1.791,93,
  // 17/07/2026, mais completo/recente que MERCADO_PAGO_FATURA de 16/07 R$1.749,35).
  faturaWartsila: 656.67,
  mercadoPagoFatura: 1791.93,

  // Patrimonio Fisico (Balanco) - eram 5 literais soltos dentro de REG.balanco.fisico
  patCasa: 110000.00,
  patApartamento: 155000.00,
  patJazigo: 11000.00,
  patSolar: 14800.00,
  patCarro: 140000.00,

  // Nao liquido (fora do total financeiro e da Meta do Milhao, so informativo)
  patPgbl: 132214.74,
  patFgts: 77683.60,

  // Passivos (Balanco)
  passivoFinanciamentoCasa: 61326.91,
  passivoConsorcioAuto: 18998.83,

  // Metas que apareciam duplicadas em mais de um lugar do REG
  metaEscolaJulio: 9236.00,   // era literal em REG.patrimonio.metaEscolaJulio E em caixasOperacionais.escolaJulio.meta (2 copias)
  reservaPiso: 9223.66,       // era literal em REG.reserva.piso E em deficitZero.piso[0] (2 copias)

  // Meta de investimento
  metaInvestimentoValor: 6741.76,
  aporteBTGPactual: 11700.51,       // V142: componente 1 do investimentoAtual (25/06/2026)
  depositoAtivacaoNecton: 1.00,     // V142: componente 2 (10/07/2026, TX000045) - antes investimentoAtual
                                     // era um literal composto (11701.51) sem os 2 fatos que o formam

  // Livros razao que sao fonte primaria (nao compostos de nada mais dentro do app.js) - LRW/LRV/LRS/LRR/LRC
  // saem de formula (visaDetalhe+mbDetalhe), LRP/LRCON ja existiam acima. Estes 3 nao tem como derivar
  // de outro dado ja presente no site, entao moram aqui como a UNICA copia editavel.
  livroLRB: 2600.24,   // LIVRO_LRB_TOTAL do ERP (distinto de VARS.caixaBoletos, que e o aporte, nao o total bruto do livro)
  livroLRCV: 1502.24,  // LIVRO_LRCV_TOTAL do ERP
  livroLRPV: -295.66,  // LIVRO_LRPV_TOTAL do ERP
  livroLRC: 483.43,    // V138: LIVRO_LRC_TOTAL do ERP (livro/soma-de-transacoes) - distinto de REG.operacional.reembolsoPagaCartaoCorporativo
                        // (483.83, extrato real reconciliado V128); os dois numeros sao proximos mas representam conceitos diferentes,
                        // documentado, nao e erro. Antes vivia como literal solto dentro de visaDetalhe.corp.

  // V139 (23/07/2026): secoes 12 "Consorcio casa nova" e 13 "Projeto casa nova" eram 100% texto fixo no
  // HTML, sem NENHUM id, nunca tocadas por hydrate() - o pior caso de numero digitado que existia no site.
  // consorcioCasaPagoPct e consorcioCasaQuitacao sao VALORES DE ORIGEM EXTERNA (extrato real do app
  // PortoBank, ver ERP CONSORCIO_CASA_PAGO_PCT) - divergem um pouco do calculado internamente
  // (pago/total=0,524% vs 0,42% mostrado no extrato); por regra "extrato sempre vence" ficam como
  // input direto, nao forcados a bater com uma formula interna (documentado, nao escondido).
  consorcioCasaCartaCredito: 450000.00,
  consorcioCasaParcela: 1449.45,
  consorcioCasaPagoPct: 0.42,       // extrato real PortoBank 22/07/2026
  consorcioCasaQuitacao: 550601.43, // extrato real PortoBank 22/07/2026
  metaLanceProjetoCasa: 180000.00,
  consorcioAutoPagoPct: 75.22,      // extrato real app BTG/PortoBank Auto (SALDO_QUITACAO_AUTO do ERP)
  consorcioAutoCartaCredito: 76670.02,
  consorcioAutoQuitacaoValor: 18998.83,
  consorcioCasaParcelasPagas: 2,   // V140: 2 parcelas confirmadas (venc. 15/06 e 15/07/2026) - usado pra derivar o "valor pago" do consorcio

  // V140 (23/07/2026, continuacao da varredura): valores primarios operacionais que ainda viviam como
  // literal solto dentro do REG. Nenhum destes e derivavel de outro dado ja no sistema - sao fatos de
  // origem (extrato, contracheque, decisao do usuario) - mas moram aqui agora como UNICA copia editavel.
  salario: 33708.78,                       // contracheque do ciclo (excecao, ver nota historica)
  reembolsoPagaCartaoCorporativo: 483.83,  // extrato real cofrinho "Fatura Visa Infinit" (V128)
  reembolsoPagaMPCorporativo: 1277.88,     // Transporte corporativo Recife (TXMP000007+008)
  orcamentoOperacional: 3200.00,
  coberturaGarantida: 954.90,
  tetoOficial: 2000.00,                    // meta oficial (Aporte=Meta-Saldo), nao muda com tolerancia temporaria
  tolerenciaTemp: 1500.00,                 // tolerancia temporaria ate fim do ciclo (viagem familia Vanessa)
  caixaVariavelPendenteProximoCiclo: 0,     // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO, pedido do usuario): compras no Mastercard Black feitas DEPOIS do fechamento da fatura MB (dia 22) mas AINDA dentro do ciclo financeiro atual (ate dia 25) - a fatura so cobra no mes seguinte, entao nao contam no CAIXA_VARIAVEL_COMPROMETIDO deste ciclo (evita inflar indevidamente um ciclo que ja esta fechando). Ficam represadas aqui e sao pre-debitadas do orcamento da Caixa Variavel do PROXIMO ciclo na virada do dia 25 (ver recalcularAgregadosDerivados() e o card "Pendente para o próximo ciclo" no Simulador). Zerado ate agora - nenhuma compra nessa janela neste ciclo (23/07/2026).
  // CORRIGIDO 23/07/2026: secao 18 (Operacoes P2P) do site era 100% texto hardcoded, nunca tinha sido
  // ligada ao REG - "Creditos restantes" mostrava "8/10" e "Lucro realizado" R$9,00, desatualizados desde
  // a V136 (22/07/2026), quando TXP2P0003 (venda de 2 creditos ao Elcio) mudou os numeros reais para
  // 6/10 restantes e R$27,00 de lucro. Agora vem do VARS, igual ao resto do sistema.
  p2pCapitalTotal: 110,           // = P2P_CAPITAL_TOTAL do ERP
  p2pCreditosTotal: 10,           // = P2P_CREDITOS_TOTAL
  p2pCreditosRestantes: 6,        // = P2P_CREDITOS_RESTANTES (V136: 9-1-2=6, era 8 no site)
  p2pCreditosVendidos: 3,         // = P2P_CREDITOS_VENDIDOS (TXP2P0002+TXP2P0003)
  p2pPrecoCompra: 11,             // = P2P_PRECO_COMPRA (110/10)
  p2pPrecoVenda: 20,              // = P2P_PRECO_VENDA
  p2pLucroRealizado: 27,          // = P2P_LUCRO_REALIZADO (V136: R$9+R$18=R$27, era R$9 no site)
  suporteCoIrmaEventos: 167.40,            // Eventos->Variavel, mesmo proposito (visita familia Vanessa), nao e LREI

  // V140: componentes de visaDetalhe/mbDetalhe/totalOpDetalhe que ainda eram literal solto
  visaLRWHistorico: 2139.45,      // Compras Wallace (LRW-I, historico). CORRIGIDO 23/07/2026: +R$9,99 (Amazon Prime Aluguel, achado na fatura Bradesco real 10/07, compra avulsa nunca lancada). Era R$2.129,46.
  visaLRRConfirmado: 1194.53,     // Recorrencias confirmadas no Visa Infinite. CORRIGIDO 23/07/2026: VIVO revertida de R$435 (V111, baseada em config teorica) para R$523 (fatura Bradesco real confirma 2 cobrancas: R$469,00+R$54,00=R$523,00 - fatura sempre vence, V61). Era R$1.106,53 (+R$88,00).
  visaLRSConfirmado: 429.31,      // Assinaturas confirmadas no Visa Infinite. CORRIGIDO 23/07/2026: +R$19,99 (Amazon Prime Canais, achado na fatura Bradesco real 25/06, nunca lancado). Era R$409,32.
  visaLRVHistorico: 462.12,       // Compras Vanessa (LRV-I) - = LIVRO_LRV_I_TOTAL
  visaNaoReconciliado: 0,     // RESOLVIDO 23/07/2026: o residuo de R$49,81 foi auditado linha-a-linha contra a fatura Bradesco real (Visa Infinite, fecha 16/07/2026, todos os 4 cartoes - 4844/2773/0026/4845). Causa raiz identificada: VIVO estava R$88,00 abaixo do real (V111 usou config teorica em vez da fatura - revertido) + 2 compras nunca lancadas (Amazon Prime Canais R$19,99 e Amazon Prime Aluguel R$9,99). Substituido o metodo de reconciliacao: antes ancorado no "Total da fatura" (saldo corrente, contamina com pagamentos/saldo anterior de ciclos passados) - agora e a SOMA AUDITADA das 7 partes (parcelas+consorcios+wallace+recorrencias+corp+assinaturas+vanessa), cada uma conferida contra a fatura linha a linha. CARTAO_INFINITE_TOTAL_COMPROMETIDO recalculado: R$9.160,07 exato (soma das 7 partes corrigidas, vanessa ja inclui TX131).
  mbLRWConfirmado: 1406.92,       // = LIVRO_LRW_MB_TOTAL
  mbLRRConfirmado: 614.45,        // Recorrencias confirmadas no Mastercard Black
  mbLRSConfirmado: 43.80,         // Assinaturas confirmadas no Mastercard Black
  totalOpBoletos: 2600,           // APORTE_BOLETOS (nao o total bruto do livro LRB)
  totalOpAportesPat: 1893.34,     // Aportes Patrimoniais do ciclo
  totalOpProvMP: 471.47,          // Mercado Pago pessoal - fatura literal do ciclo (V91)

  // V140: demais primarios soltos no REG (cenarios/estimador)
  liquidoProjetadoProximoCiclo: 16048.51,  // Estimador de Salario - ciclo Ago/26
  liquidoSemTrabalhar: 7667.73,            // REGRA_CENARIO_FICOU_EM_CASA
  desvioPadraoSalario: 9273.21,
  seguroEmplacamentoAporte: 425,
  escolaJulio2027Aporte: 839.64,

  // V141 (23/07/2026, fechamento da varredura): ultimos primarios soltos encontrados
  reembolsoCicloTotal: 4914.98,       // Recebidos (ja inclui TED 21/07) + A Receber (0) - regra V50
  fluxoSaidas: 14819.89,
  fluxoResultado: 21318.48,
  cenarioMesesBonsMedia: 29424.00,    // "Meses bons (media)" no grafico de cenarios de salario

  // Calculadora Energia Solar (fatura Energisa Jun/2026, real)
  faturaEnergisaValor: 322.99,
  faturaEnergisaKwh: 304,
  consumoMinimoComSolarKwh: 30,
  taxaMinimaEnergisa: 38.00,

  // Projecoes "held flat" (meses futuros alem do ultimo recalculado manualmente - repetem o ultimo
  // valor conhecido, mesma logica conservadora ja documentada). Antes: mesmo numero literal 6x em cada
  // array (piso/necessidade/totalOperacional/necessidadeLiquida). Agora: 1 valor, usado via Array.fill.
  pisoHeld: 6979.37,
  necessidadeHeld: 11581.08,
  totalOperacionalHeld: 8381.08,
  necessidadeLiquidaHeld: 10626.18,

  // V142: faltavam estes 3 (a formula em REG.passivosPatrimoniais ja os referenciava, mas eles nunca
  // tinham sido de fato declarados aqui - erro descoberto pela propria execucao real/harness).
  prestacaoFinanciamentoCasa: 588.66,
  mesesRestantesFinanciamentoCasa: 147,
  parcelaConsorcioAuto: 501.50,
  provisionadoWartsila: 680.51,  // V143: cofrinho Fatura Wartsila (Mercado Pago) - provisionado > fatura real (VARS.faturaWartsila),
                                  // excedente = provisionadoWartsila - faturaWartsila (era texto fixo "excedente R$23,84")

  // V144: aportes mensais das caixas incrementais que ainda eram texto fixo no card (secao 05)
  aporteSaudeFamilia: 135,
  aporteAniversarioJulio: 200,
  // seguroEmplacamentoAporte (425) ja existia acima

  // V144: footer da tabela "PIX diversos" (LRCV) - era texto fixo "Saidas R$527,61 Entradas R$64,00 Liquido -R$463,61"
  pixDiversosSaidas: 527.61,
  pixDiversosEntradas: 64.00,

  // V144: footer LRC (Corporativo Visa Infinite) - "6 lancamentos" era texto fixo, valor ja em VARS.livroLRC
  livroLRCQtdLancamentos: 6
};

const REG = {
  patrimonio: {
    // DERIVADO em recalcularAgregadosDerivados(): total = VARS.reserva+VARS.btgNecton+VARS.caixaLance+VARS.nectonContaCorrente
    total: 0,          // preenchido no boot, nunca editar aqui
    metaMilhaoPct: 0,  // preenchido no boot = total/metaMilhao*100
    metaMilhao: 1000000,
    metaEscolaJulio: VARS.metaEscolaJulio
  },
  operacional: {
    salario: VARS.salario,
    reembolsosAReceber: 0,     // V128: CORRIGIDO (bug apontado pelo usuario) - TED confirmada 21/07/2026, ja recebido e usado. Era R$2.429,59.
    reembolsoCicloTotal: VARS.reembolsoCicloTotal,        // Recebidos (4.914,98, ja inclui a TED de 21/07) + A Receber (0) - regra V50
    reembolsoPagaWartsila: VARS.faturaWartsila,       // V137: le do VARS (fatura paga integralmente pelo reembolso - mesmo numero, 4a copia eliminada)
    reembolsoPagaCartaoCorporativo: VARS.reembolsoPagaCartaoCorporativo, // NOMEADO V128, corrigido (era 483.43 - extrato real do cofrinho "Fatura Visa Infinit")
    reembolsoSobraPessoal: 0,      // SOBRESCRITO por recalcularAgregadosDerivados() logo apos o REG - este valor aqui e so o ultimo snapshot conhecido, para leitura humana.
    reembolsoPagaMPCorporativo: VARS.reembolsoPagaMPCorporativo, // Transporte corporativo Recife (TXMP000007+008)
    entradasTotais: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = salario + reembolsoCicloTotal. V128 CORRIGIDO (bug real): formula antiga usava reembolsosAReceber, que ia a zero quando o reembolso chegava, fazendo entradasTotais CAIR errado. Era R$36.138,37.
    totalOperacional: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = soma de totalOpDetalhe. Editar os componentes, nao este numero. V111: -R$88,00 (Vivo atualizada).
    orcamentoOperacional: VARS.orcamentoOperacional,
    necessidadeTotalBruta: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = totalOperacional + orcamentoOperacional. V111: -R$88,00.
    coberturaGarantida: VARS.coberturaGarantida,     // Sem alteracao.
    necessidadeLiquida: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = necessidadeTotalBruta - coberturaGarantida. V111: -R$88,00.
    saldoCiclo: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = balanco.fluxo.entradas - necessidadeTotalBruta. V111: +R$88,00.
    modoOperacional: 'Alto',
    // totalOperacionalMar27 removido (16/07/2026): era um 3o registrador duplicado do mesmo valor
    // ja presente em evolucao.totalOperacional[ultimo ponto] - agora calculado dinamicamente no hydrate().
  },
  caixaVariavel: {
    saldoReal: VARS.caixaVariavelSaldoReal,
    comprometido: VARS.caixaVariavelComprometido,
    disponivel: 0,          // DERIVADO em recalcularAgregadosDerivados() = saldoReal-comprometido. Nunca editar aqui.
    tetoOficial: VARS.tetoOficial,   // meta oficial (usada no Aporte=Meta-Saldo). NAO muda com a tolerancia temporaria.
    tolerenciaTemp: VARS.tolerenciaTemp, // V78 (18/07/2026): tolerancia temporaria ate o fim do ciclo (viagem familia Vanessa) - cobre TODOS os gastos da caixa, nao so os tageados como viagem. Recomposicao prevista: reembolso Wartsilia ou salario 25/07. Zerar este campo (0) quando a tolerancia acabar.
    pendenteProximoCiclo: VARS.caixaVariavelPendenteProximoCiclo, // NOVO 23/07/2026 (regra REGRA_LIMBO_FATURA_MB_CICLO): compras no Mastercard Black feitas depois do fechamento da fatura MB (dia 22) mas ainda dentro do ciclo financeiro atual (ate dia 25) - NAO contam no comprometido DESTE ciclo (a fatura so cobra no mes seguinte), ficam represadas aqui e sao pre-debitadas do orcamento da Caixa Variavel do PROXIMO ciclo na virada do dia 25.
  },
  visa: {
    totalComprometido: 0,   // DERIVADO = VARS.cartaoInfiniteTotal + VARS.cartaoMBTotal
    pessoal: 0              // DERIVADO = totalComprometido - reembolsoPagaCartaoCorporativo
  },
  cartaoInfinite: { total: VARS.cartaoInfiniteTotal },
  p2p: {
    capitalTotal: VARS.p2pCapitalTotal,
    creditosTotal: VARS.p2pCreditosTotal,
    creditosRestantes: VARS.p2pCreditosRestantes,
    creditosVendidos: VARS.p2pCreditosVendidos,
    precoCompra: VARS.p2pPrecoCompra,
    precoVenda: VARS.p2pPrecoVenda,
    lucroRealizado: VARS.p2pLucroRealizado,
    saldoInvestido: 0,   // DERIVADO em recalcularAgregadosDerivados() = creditosRestantes * precoCompra
    rentabilidadePct: 0  // DERIVADO = (precoVenda-precoCompra)/precoCompra*100
  },
  cartaoMB: { total: VARS.cartaoMBTotal },
  mercadoPago: VARS.mercadoPagoFatura,     // V137: le do VARS (era literal solto 1751.16, divergia do balanco.obrigacoes.mercadoPago)
  faturaWartsila: VARS.faturaWartsila,     // V137: le do VARS (era 3a copia literal do mesmo numero)
  // V137: excedente DERIVADO (investido-meta) em vez de literal verificado a mao - a correcao de 20/07
  // (V107, erro de subtracao de R$1,00) so foi encontrada porque o usuario reconferiu a mao; formula
  // elimina essa classe de erro para sempre. investido/meta leem do VARS.
  metaInvestimento: { investido:0, meta: VARS.metaInvestimentoValor, excedente: 0 }, // investido DERIVADO = aporteBTGPactual+depositoAtivacaoNecton
  lrei0001: 0, // V121: QUITADO (reembolso Wartsila, deposito direto na Caixa Manutencao). Era R$178,64.
  suporteCoIrmaEventos: VARS.suporteCoIrmaEventos, // 13/07/2026, Eventos->Variavel, mesmo proposito (visita familia Vanessa) - nao e LREI

  // ===== FASE 2 (16/07/2026) - graficos de composicao (g_cTotalOp, g_cVisa, g_cMetas, g_cCaixas) =====
  patrimonioDetalhe: { reserva:VARS.reserva, btg:VARS.btgNecton, caixaLance:VARS.caixaLance, nectonContaCorrente:VARS.nectonContaCorrente }, // V134: agora le do VARS (fonte unica) - antes eram numeros duplicados aqui e em patrimonio.total, ficavam dessincronizados.
  escolaJulioSaldo: VARS.escolaJulioSaldo, // V134: le do VARS. Fora do Patrimonio Total/Meta Milhao desde V47 (16/07/2026) - existe como reserva/caixa propria, nao patrimonio liquido de gestao ativa
  // V135 (22/07/2026, auditoria SSOT): visaDetalhe somava R$9.024,11 vs cartaoInfinite.total (fatura real,
  // VARS) R$9.073,92 - gap de R$49,81. Investigado: NAO e erro de nenhum item, e o mesmo residuo entre
  // "soma dos livros de transacao" x "fatura real do banco" ja documentado no ERP desde a reconciliacao
  // V128 (fatura sempre vence, regra V61) - nunca foi re-itemizado transacao a transacao. Em vez de
  // forcar/inventar em qual categoria o R$49,81 pertence (violaria P1), adicionado como linha propria
  // "naoReconciliado", visivel e documentada - mesmo padrao ja usado para outras diferencas residuais
  // do sistema (ex: CORRECAO_15072026_007, R$36,90 na epoca). Agora a soma bate exatamente com a fatura.
  visaDetalhe: { parcelas:VARS.livroLRP, consorcios:VARS.livroLRCON, wallace:VARS.visaLRWHistorico, recorrencias:VARS.visaLRRConfirmado, corp:VARS.livroLRC, assinaturas:VARS.visaLRSConfirmado, vanessa:VARS.visaLRVHistorico, naoReconciliado:VARS.visaNaoReconciliado },
  // V135: wallace CORRIGIDO 1161.94 -> 1349.93 (= LIVRO_LRW_MB_TOTAL do ERP, V121 - TX128/129/130 de
  // 21/07 nunca tinham propagado pra ca). Era o unico motivo do mbDetalhe nao bater com cartaoMBTotal
  // (gap de R$187,99): 1161,94+614,45+43,80=1.820,19 vs VARS.cartaoMBTotal=2.008,18. Agora soma exato.
  mbDetalhe: { parcelas:0, consorcios:0, wallace:VARS.mbLRWConfirmado, recorrencias:VARS.mbLRRConfirmado, corp:0, assinaturas:VARS.mbLRSConfirmado, vanessa:0 },
  // V136 (22/07/2026): visaDetalhe.vanessa +R$17,98 (TX131, H57Store, cartao 4845) e mbDetalhe.wallace
  // +R$56,99 (TX132, Google SunSurveyorApp, cartao 2244) - ambos ja embutidos acima. Soma continua
  // batendo exato com cartaoInfiniteTotal/cartaoMBTotal (checks #11/#12 da auditoria confirmam).
  // V135: parcelas/consorcios agora leem do VARS (fonte unica, eliminada a 2a copia que existia aqui).
  // recorrencias/assinaturas: 0 e placeholder - DERIVADOS em recalcularAgregadosDerivados() a partir de
  // visaDetalhe+mbDetalhe (eram numeros literais que so por coincidencia batiam com a soma das partes;
  // agora e formula, nunca mais pode dessincronizar).
  totalOpDetalhe: { boletos:VARS.totalOpBoletos, parcelas:VARS.livroLRP, consorcios:VARS.livroLRCON, recorrencias:0, aportesPat:VARS.totalOpAportesPat, provMP:VARS.totalOpProvMP, assinaturas:0 },
  // V137: milhaoPct e escolaPct viram DERIVADOS (alimentam o grafico "Progresso das metas patrimoniais").
  // milhaoPct estava TRAVADO em 11,54% desde antes da correcao V135 (que levou patrimonio.metaMilhaoPct
  // pra 11,57%) - o grafico mostraria o percentual errado. escolaPct tambem estava desatualizado (5,47%
  // vs o real ~5,49%).
  metasPatrimoniais: { milhaoPct:0, casaNovaPct:VARS.consorcioCasaPagoPct, autoPct:VARS.consorcioAutoPagoPct, escolaPct:0 },
  caixasOperacionais: {
    boletos:            { saldo:VARS.caixaBoletos,            meta:2600 },
    pixVanessa:          { saldo:VARS.caixaPixVanessa,         meta:1200 },
    manutencao:          { saldo:VARS.caixaManutencao,         meta:2000 },
    eventos:             { saldo:VARS.caixaEventos,            meta:2000 },
    saudeFamilia:        { saldo:VARS.caixaSaudeFamilia,       meta:1600 },
    aniversarioJulio:    { saldo:VARS.caixaAniversarioJulio,   meta:400  },
    seguroEmplacamento:  { saldo:VARS.caixaSeguroEmplacamento, meta:5100 },
    escolaJulio:         { saldo:VARS.escolaJulioSaldo,        meta:VARS.metaEscolaJulio }
  }, // V134: todos os saldos agora leem do VARS (fonte unica) - antes eram literais duplicados aqui, em balanco.reservas e em escolaJulioSaldo separadamente, 3 copias que ja dessincronizaram nesta sessao.
  // V143: card "Fatura Wartsila" (secao 05) tinha "excedente R$23,84" como texto fixo - agora DERIVADO.
  wartsilaCaixa: { provisionado: VARS.provisionadoWartsila, fatura: VARS.faturaWartsila, excedente: 0 },
  pixDiversos: { saidas: VARS.pixDiversosSaidas, entradas: VARS.pixDiversosEntradas, liquido: 0 },
  livroLRCDetalhe: { qtd: VARS.livroLRCQtdLancamentos, valor: VARS.livroLRC },

  // ===== FASE 3 (16/07/2026) - pagina Cenarios inteira + totais agregados dos livros razao =====
  reserva: {
    atual: VARS.reserva,
    piso: VARS.reservaPiso // "so o piso" - gasto minimo essencial, nao inclui aportes patrimoniais (conceito distinto de necessidadeTotalBruta)
  },
  // V139: secoes 12/13 do painel (Consorcio Casa Nova / Projeto Casa Nova) - antes 100% hardcoded no HTML.
  consorcioCasaNova: {
    cartaCredito: VARS.consorcioCasaCartaCredito,
    parcela: VARS.consorcioCasaParcela,
    pagoPct: VARS.consorcioCasaPagoPct,       // extrato real, nao derivado (ver nota no VARS)
    quitacaoValor: VARS.consorcioCasaQuitacao,
    quitacaoPct: 0 // DERIVADO = 100 - pagoPct (unica relacao interna consistente com o extrato: 100-0,42=99,58, bate exato)
  },
  projetoCasaNova: {
    capitalDisponivel: 0, // DERIVADO = VARS.btgNecton + VARS.caixaLance (era numero fixo capturado num instante passado, nunca recalculado)
    metaLance: VARS.metaLanceProjetoCasa,
    pct: 0,   // DERIVADO = capitalDisponivel / metaLance * 100
    falta: 0  // DERIVADO = metaLance - capitalDisponivel
  },
  // V142 (23/07/2026): secao 11 "Passivos patrimoniais" - a ultima secao ainda 100% hardcoded no HTML.
  // financiamentoCasa le do MESMO VARS.passivoFinanciamentoCasa ja usado no Balanco (balanco.passivos) -
  // antes o HTML desta secao tinha um numero PROPRIO e DIVERGENTE (R$61.311,95 vs R$61.326,91 no Balanco,
  // mesma divida, 2 fontes, 2 valores). Agora so existe 1 numero, usado nos 2 lugares.
  passivosPatrimoniais: {
    financiamentoCasa: VARS.passivoFinanciamentoCasa,
    prestacaoFinanciamentoCasa: VARS.prestacaoFinanciamentoCasa,
    mesesRestantesFinanciamentoCasa: VARS.mesesRestantesFinanciamentoCasa,
    consorcioAuto: VARS.passivoConsorcioAuto,
    consorcioAutoPct: VARS.consorcioAutoPagoPct,
    parcelaConsorcioAuto: VARS.parcelaConsorcioAuto
  },
  estimador: {
    liquidoProjetadoProximoCiclo: VARS.liquidoProjetadoProximoCiclo,  // Estimador de Salario - ciclo que comeca 25/07 (Ago/26)
    necessidadeLiquidaProximoCiclo: 0 // V138: DERIVADO em recalcularAgregadosDerivados() = evolucao.necessidadeLiquida[1] (2o ponto da serie, Ago/26). Era literal duplicado do mesmo numero ja presente no array.
  },
  deficitZero: {
    liquidoSemTrabalhar: VARS.liquidoSemTrabalhar, // REGRA_CENARIO_FICOU_EM_CASA
    piso: [VARS.reservaPiso,7821.63,7369.83,7088.69,7320.83,7220.83,...Array(6).fill(VARS.pisoHeld)]
  },
  superavitNormal: {
    // REGRA DEFINIDA PELO USUARIO 19/07/2026: liquidoMes(0) agora segue prioridade por DIA DO MES,
    // nao mais um valor fixo bundlado. A partir do dia 25 (quando o salario e pago), usa o valor REAL
    // recebido (liquidoReal, preenchido manualmente quando confirmado). Enquanto isso nao chega, do dia
    // 12 em diante (quando a folha de ponto gera o Estimador de Salario) usa o Liquido Projetado PURO
    // (REG.estimador.liquidoProjetadoProximoCiclo, R$16.048,51 - sem somar mais a sobra pessoal do
    // reembolso, que era um bundle errado apontado pelo usuario: mostrava R$18.545,51 em vez de
    // R$16.048,51). Antes do dia 12 (sem estimativa concreta ainda), cai na media ponderada de 12 meses
    // (REG.cenarioHistorico.mediaPonderada12M) - fallback conservador quando nao ha dado especifico do
    // ciclo. Resolvido em runtime por liquidoMes(i), definida antes do REG (topo do arquivo).
    liquidoReal: {}, // preencher {indice: valor} quando um ciclo fechar (dia 25) e o valor real chegar.
    necessidade: [14317.00,12951.87,12620.07,12138.93,11871.07,11771.07,...Array(6).fill(VARS.necessidadeHeld)]
  },
  livrosRazaoTotais: {
    // V137: LRW/LRV/LRC/LRS/LRR eram literais que so por coincidencia batiam com visaDetalhe+mbDetalhe -
    // viram placeholder 0, DERIVADOS em recalcularAgregadosDerivados() (verificado bater exato antes de
    // converter). LRP/LRCON ja liam do VARS desde V135. LRB/LRCV/LRPV nao tem como derivar de outro dado
    // ja presente no site (sao fonte primaria) - leem do VARS agora, unica copia editavel. LRMP le do
    // VARS.mercadoPagoFatura (fecha a mesma divergencia corrigida no card Cartoes/Balanco).
    LRW:   { total:0, qtd:60 },
    LRV:   { total:0, qtd:18 },
    LRB:   { total:VARS.livroLRB, qtd:10 },
    LRP:   { total:VARS.livroLRP, qtd:16 },
    LRS:   { total:0, qtd:12 },
    LRR:   { total:0, qtd:7  },
    LRCON: { total:VARS.livroLRCON, qtd:2 },
    LRC:   { total:0, qtd:6 },
    LRMP:  { total:VARS.mercadoPagoFatura, qtd:9 },
    LRCV:  { total:VARS.livroLRCV, qtd:28 },
    LRPV:  { total:VARS.livroLRPV, qtd:19 }
  },

  reembolsos: { recebidosNoCiclo: 0 }, // V135: DERIVADO em recalcularAgregadosDerivados() = reembolsoCicloTotal - reembolsosAReceber. Estava hardcoded em R$2.485,39 (valor de antes da 2a TED da Wärtsilä, confirmada 21/07/2026) - nunca atualizou quando reembolsosAReceber zerou, entao "Recebidos" ficava mostrando so a metade do que ja tinha entrado de verdade.

  // ===== QUALIDADE/REGRAS DE NEGOCIO (18/07/2026, V79) - "linter" enxuto: nao guarda transacao
  // por transacao (REG so tem agregados, por design - inflar isso pesaria o app.js), mas expoe os
  // poucos contadores/flags que JA sao mantidos no ERP a cada sessao. Atualizar manualmente sempre
  // que o numero mudar no ERP (mesmo padrao de todo o resto do REG).
  qualidade: {
    txSemData: 0,          // contador oficial do ERP (aba AUDITORIA_AUTOMATICA / historico SWP_INPUT). 0 = zerado em 17/07/2026 (V69).
    lreiAtivos: 0,          // V121: LREI0001 QUITADO (reembolso Wartsila, deposito direto na Caixa Manutencao). Nenhum emprestimo interno ativo.
    tetoTemporarioAtivo: true // reflete caixaVariavel.tolerenciaTemp > 0
  },
  cenarioHistorico: {
    piorMes: VARS.salarioMin12M,
    mediana: VARS.salarioMediana12M,
    media: VARS.salarioMedia12M,
    mediaPonderada12M: VARS.salarioMediaPonderada12M,
    desvioPadrao: VARS.desvioPadraoSalario
  },
  evolucao: {
    // PADRAO 12 MESES ROLANTE (V50, item 4): series estendidas de 8 para 12 pontos, repetindo o
    // ultimo valor conhecido (mesma logica conservadora ja usada aqui - nao ha dado real para meses
    // tao distantes, nunca chutado um numero novo, so mantido o ultimo). Antes pulava Fev/27; agora
    // e sequencial, os rotulos vem de gerarMeses(12) - dinamico, sempre a partir do mes atual.
    totalOperacional:   [11658.24,9751.87,9420.07,8938.93,8671.07,8571.07,...Array(6).fill(VARS.totalOperacionalHeld)], // CORRIGIDO 19/07/2026: 1o ponto (ciclo atual) -R$1.808,91 (reversao Tokio Marine, ver REG.operacional.totalOperacional). Pontos futuros (Ago/26 em diante) NAO recalculados - baseline anterior, ja documentado como limitacao pendente desde V50/V51 (podem ainda incluir as parcelas 8-10 do Tokio removidas hoje - revisao futura).
    necessidadeLiquida: [13903.34,11996.97,11665.17,11184.03,10916.17,10816.17,...Array(6).fill(VARS.necessidadeLiquidaHeld)] // CORRIGIDO 19/07/2026: 1o ponto (ciclo atual) -R$1.808,91 (reversao Tokio Marine). Era R$15.712,25.
  },

  // ===== BALANÇO PATRIMONIAL (Reestruturação V2.0, 16/07/2026 - V40/V41/V42) =====
  balanco: {
    // V135 (22/07/2026): fisico.total, financeiro.total, passivos.total, ativosTotal e patrimonioLiquido
    // eram numeros hardcoded que HOJE batem com a soma das partes (conferido por execucao real), mas nao
    // tinham formula nenhuma - qualquer edicao futura em 1 componente (ex: valor do carro, novo passivo)
    // ficaria dessincronizada ate alguem recalcular a mao. Viram DERIVADOS em recalcularAgregadosDerivados(),
    // nunca editar os totais aqui diretamente.
    fisico: { casa:VARS.patCasa, apartamento:VARS.patApartamento, jazigo:VARS.patJazigo, solar:VARS.patSolar, carro:VARS.patCarro, total:0 },
    financeiro: { reserva:VARS.reserva, btg:VARS.btgNecton, nectonContaCorrente:VARS.nectonContaCorrente, consorcioCasaPago:0, total:0 },
    pgbl: VARS.patPgbl,   // nao liquido, fora do total financeiro e da Meta do Milhao
    fgts: VARS.patFgts,   // nao liquido, fora do total financeiro e da Meta do Milhao
    passivos: { financiamentoCasa:VARS.passivoFinanciamentoCasa, consorcioAutoContemplado:VARS.passivoConsorcioAuto, total:0 },
    ativosTotal: 0,
    patrimonioLiquido: 0,
    reservas: {
      boletos:0, escolaJulio:VARS.escolaJulioSaldo, caixaLance:VARS.caixaLance, manutencao:VARS.caixaManutencao, eventos:VARS.caixaEventos,
      churrasco:0, saudeFamilia:VARS.caixaSaudeFamilia, seguroEmplacamento:VARS.caixaSeguroEmplacamento, aniversarioJulio:VARS.caixaAniversarioJulio, total:0 // total DERIVADO em recalcularAgregadosDerivados()
    }, // V134: todos os saldos leem do VARS agora (fonte unica) - eliminada a 2a/3a copia que ja causou 2 rodadas de bug nesta sessao.
    operacional: { caixaVariavel:VARS.caixaVariavelSaldoReal, pixVanessaSaldoReal:VARS.pixGeralVanessaSaldo, caixaBoletos:VARS.caixaBoletos, total:0 }, // total DERIVADO. V134: le do VARS.
    // V137: Wartsila REMOVIDA da soma do total (pedido do usuario 23/07/2026: "nao deve misturar
    // contas da empresa com minhas contas" - a fatura e 100% corporativa/reembolsavel, so aparece
    // aqui como linha informativa, igual ao tratamento ja dado a PGBL/FGTS). mercadoPago agora le
    // do VARS.mercadoPagoFatura (antes essa fatura aparecia em 2 lugares da tela com 2 valores
    // diferentes: R$1.751,16 aqui/card Cartoes vs R$1.791,93 no Balanco - mesma fatura, bug real).
    obrigacoes: { visa:0, mastercardBlack:0, mercadoPago:VARS.mercadoPagoFatura, wartsila:VARS.faturaWartsila, total:0 },
    fluxo: { entradas:0, saidas:VARS.fluxoSaidas, resultado:VARS.fluxoResultado } // V70 (18/07/2026): saidas 14.795,99->14.819,89, resultado 21.342,38->21.318,48
  }
};

// CALCULADO 20/07/2026 (pedido do usuario, pontos 1 e 2 da auditoria): estes registradores paravam de
// ser numeros fixos digitados a mao e passam a ser DERIVADOS dos componentes reais, na mesma linha do
// que ja acontecia com CAIXA_VARIAVEL.disponivel (sempre = saldoReal-comprometido). Isso elimina a classe
// de bug encontrada nesta sessao (ex: sobra da cascata ficou 2 dias errada porque ninguem lembrou de
// atualizar o numero fixo quando um componente mudou). Os componentes (totalOpDetalhe, reembolsoCicloTotal
// etc.) continuam sendo os valores digitados/confirmados - só os agregados que dependem deles viram formula.
(function recalcularAgregadosDerivados(){
  const r2 = x => Math.round(x*100)/100;
  const D = REG.totalOpDetalhe;

  // ===== V134 - DERIVACOES A PARTIR DO VARS (banco de variaveis unico) =====
  // Estas linhas sao a razao de ser do VARS: qualquer lugar do painel que usa estes valores
  // agora vem de UMA formula so, calculada aqui, nunca mais de numero duplicado em 3-4 lugares.
  REG.caixaVariavel.disponivel = r2(REG.caixaVariavel.saldoReal - REG.caixaVariavel.comprometido);
  REG.patrimonio.total = r2(VARS.reserva + VARS.btgNecton + VARS.caixaLance + VARS.nectonContaCorrente);
  REG.patrimonio.metaMilhaoPct = r2(REG.patrimonio.total / REG.patrimonio.metaMilhao * 100);
  REG.visa.totalComprometido = r2(VARS.cartaoInfiniteTotal + VARS.cartaoMBTotal);
  REG.visa.pessoal = r2(REG.visa.totalComprometido - REG.operacional.reembolsoPagaCartaoCorporativo);
  // NOVO 23/07/2026: P2P (secao 18) nunca tinha formula - saldoInvestido e rentabilidadePct eram
  // texto hardcoded, dessincronizando toda vez que um credito era vendido (V136 ja tinha corrigido o
  // ERP mas o site nunca acompanhou). Agora sempre recalculado a partir de VARS.p2pCreditosRestantes.
  REG.p2p.saldoInvestido = r2(VARS.p2pCreditosRestantes * VARS.p2pPrecoCompra);
  REG.p2p.rentabilidadePct = r2((VARS.p2pPrecoVenda - VARS.p2pPrecoCompra) / VARS.p2pPrecoCompra * 100);
  // V135: recorrencias/assinaturas de totalOpDetalhe DERIVADOS da soma Visa+MB (elimina duplicacao -
  // precisa rodar ANTES do calculo de totalOperacional logo abaixo, que le D.recorrencias/D.assinaturas).
  REG.totalOpDetalhe.recorrencias = r2(REG.visaDetalhe.recorrencias + REG.mbDetalhe.recorrencias);
  REG.totalOpDetalhe.assinaturas = r2(REG.visaDetalhe.assinaturas + REG.mbDetalhe.assinaturas);
  REG.balanco.reservas.total = r2(REG.balanco.reservas.boletos + REG.balanco.reservas.escolaJulio + REG.balanco.reservas.caixaLance +
    REG.balanco.reservas.manutencao + REG.balanco.reservas.eventos + REG.balanco.reservas.churrasco +
    REG.balanco.reservas.saudeFamilia + REG.balanco.reservas.seguroEmplacamento + REG.balanco.reservas.aniversarioJulio);
  REG.balanco.operacional.total = r2(REG.balanco.operacional.caixaVariavel + REG.balanco.operacional.pixVanessaSaldoReal + REG.balanco.operacional.caixaBoletos);

  // V135: totais do Balanço Patrimonial DERIVADOS (antes eram numeros fixos que so por coincidencia
  // batiam com a soma das partes hoje - agora impossivel dessincronizar).
  const bf = REG.balanco.fisico;
  bf.total = r2(bf.casa + bf.apartamento + bf.jazigo + bf.solar + bf.carro);
  // V140: consorcioCasaPago DERIVADO = parcela x parcelas pagas (era literal solto, agora impossivel
  // dessincronizar de VARS.consorcioCasaParcela/consorcioCasaParcelasPagas)
  REG.balanco.financeiro.consorcioCasaPago = r2(VARS.consorcioCasaParcela * VARS.consorcioCasaParcelasPagas);
  const bfin = REG.balanco.financeiro;
  bfin.total = r2(bfin.reserva + bfin.btg + bfin.nectonContaCorrente + bfin.consorcioCasaPago);
  const bp = REG.balanco.passivos;
  bp.total = r2(bp.financiamentoCasa + bp.consorcioAutoContemplado);
  REG.balanco.ativosTotal = r2(bf.total + bfin.total);
  REG.balanco.patrimonioLiquido = r2(REG.balanco.ativosTotal - bp.total);

  // V128 (bug real apontado pelo usuario): entradasTotais agora DERIVADO de salario+reembolsoCicloTotal, nunca mais um numero fixo que "esquecia" de atualizar quando o reembolso mudava de status (a receber -> recebido).
  REG.operacional.entradasTotais = r2(REG.operacional.salario + REG.operacional.reembolsoCicloTotal);
  REG.balanco.fluxo.entradas = REG.operacional.entradasTotais; // fonte unica - antes eram 2 copias que podiam divergir
  // V135: Recebidos no ciclo = Total do ciclo - A receber (sempre a diferenca, nunca mais numero fixo
  // que "esquece" de subir quando uma nova TED e confirmada e A_RECEBER zera).
  REG.reembolsos.recebidosNoCiclo = r2(REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsosAReceber);
  // Total Operacional = soma literal dos 7 componentes (mesma formula documentada na Politica sec.13/TOTAL_OPERACIONAL)
  REG.operacional.totalOperacional = r2(D.boletos + D.parcelas + D.consorcios + D.recorrencias + D.aportesPat + D.provMP + D.assinaturas);
  REG.operacional.necessidadeTotalBruta = r2(REG.operacional.totalOperacional + REG.operacional.orcamentoOperacional);
  REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  REG.operacional.saldoCiclo = r2(REG.balanco.fluxo.entradas - REG.operacional.necessidadeTotalBruta);
  // Sobra da cascata de reembolso Wartsila = Total - as 4 pernas de deducao (regra da Politica sec.5, 5 pernas). V128: campos nomeados, nao mais numeros magicos.
  REG.operacional.reembolsoSobraPessoal = r2(REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsoPagaWartsila - REG.operacional.reembolsoPagaMPCorporativo - REG.operacional.reembolsoPagaCartaoCorporativo - D.provMP);
  // CORRIGIDO 23/07/2026 (bug real apontado pelo usuario): REG.visa.totalComprometido = Infinite+MB somados
  // (linha ~567). Usar isso na linha "Visa Infinite" do card Obrigacoes duplicava o Mastercard Black -
  // ele aparecia com valor certo na sua PROPRIA linha (mastercardBlack, logo abaixo) E de novo embutido
  // dentro do "Visa Infinite" (11.157,07 = 9.091,90 Infinite + 2.065,17 MB), inflando o Total obrigacoes
  // em R$2.065,17. Fonte correta para a linha "Visa Infinite" e SO o cartao Infinite: REG.cartaoInfinite.total
  // (mesma fonte do card Cartoes/secao 08, evita 3a copia divergente - V85 ja tinha corrigido uma 2a copia).
  REG.balanco.obrigacoes.visa = r2(REG.cartaoInfinite.total);
  REG.balanco.obrigacoes.mastercardBlack = r2(REG.cartaoMB.total);
  // V137 (pedido do usuario 23/07/2026): Wartsila NAO entra mais na soma - e 100% corporativo/reembolsavel,
  // nao deve se misturar com obrigacoes pessoais reais. Fica visivel na tela como linha informativa (mesmo
  // tratamento ja dado a PGBL/FGTS no Patrimonio), so nao soma no Total.
  REG.balanco.obrigacoes.total = r2(REG.balanco.obrigacoes.visa + REG.balanco.obrigacoes.mastercardBlack + REG.balanco.obrigacoes.mercadoPago);
  // Evolucao (graficos): o ponto do ciclo atual (indice 0) tambem passa a vir do agregado real, nao de um numero copiado a mao
  REG.evolucao.totalOperacional[0] = REG.operacional.totalOperacional;

  // V137: livrosRazaoTotais LRW/LRV/LRC = soma das mesmas partes ja usadas nos graficos (visaDetalhe+mbDetalhe).
  // LRS/LRR = mesmos valores ja derivados em totalOpDetalhe.assinaturas/recorrencias (linha 393/394 acima).
  // Todos verificados batendo exato antes de virar formula (harness Node, 0 divergencia).
  REG.livrosRazaoTotais.LRW.total = r2(REG.visaDetalhe.wallace + REG.mbDetalhe.wallace);
  REG.livrosRazaoTotais.LRV.total = r2(REG.visaDetalhe.vanessa + REG.mbDetalhe.vanessa);
  REG.livrosRazaoTotais.LRC.total = r2(REG.visaDetalhe.corp + REG.mbDetalhe.corp);
  REG.livrosRazaoTotais.LRS.total = REG.totalOpDetalhe.assinaturas;
  REG.livrosRazaoTotais.LRR.total = REG.totalOpDetalhe.recorrencias;

  // V137: metas percentuais derivadas - milhaoPct estava TRAVADO em 11,54% (nao acompanhava
  // patrimonio.metaMilhaoPct, ja corrigido pra 11,57% na V135) e alimentava o grafico de metas.
  REG.metasPatrimoniais.milhaoPct = REG.patrimonio.metaMilhaoPct;
  REG.metasPatrimoniais.escolaPct = r2(VARS.escolaJulioSaldo / VARS.metaEscolaJulio * 100);

  // V137: excedente do investimento derivado (elimina a classe de erro que gerou a correcao V107, um
  // erro de subtracao manual de R$1,00).
  REG.metaInvestimento.investido = r2(VARS.aporteBTGPactual + VARS.depositoAtivacaoNecton);
  REG.metaInvestimento.excedente = r2(REG.metaInvestimento.investido - REG.metaInvestimento.meta);
  REG.evolucao.necessidadeLiquida[0] = REG.operacional.necessidadeLiquida;
  // V138: elimina duplicacao - antes o mesmo numero vivia em REG.estimador.necessidadeLiquidaProximoCiclo
  // (literal solto) E em REG.evolucao.necessidadeLiquida[1] (array). Agora so o array e fonte, o estimador le dele.
  REG.estimador.necessidadeLiquidaProximoCiclo = REG.evolucao.necessidadeLiquida[1];
  // V139: Consorcio Casa Nova / Projeto Casa Nova - formulas novas (secoes que eram 100% hardcoded)
  REG.consorcioCasaNova.quitacaoPct = r2(100 - REG.consorcioCasaNova.pagoPct);
  REG.projetoCasaNova.capitalDisponivel = r2(VARS.btgNecton + VARS.caixaLance);
  REG.projetoCasaNova.pct = r2(REG.projetoCasaNova.capitalDisponivel / REG.projetoCasaNova.metaLance * 100);
  REG.projetoCasaNova.falta = r2(REG.projetoCasaNova.metaLance - REG.projetoCasaNova.capitalDisponivel);
  REG.wartsilaCaixa.excedente = r2(REG.wartsilaCaixa.provisionado - REG.wartsilaCaixa.fatura);
  REG.pixDiversos.liquido = r2(REG.pixDiversos.entradas - REG.pixDiversos.saidas);
})();

// V135 (22/07/2026): labels/cores do detalhamento Visa Infinite, compartilhados pelos 3 graficos que
// usam Object.values(REG.visaDetalhe) (cVisa, g_cVisa, g_cVisaBar) - antes cada um tinha sua propria
// copia do array de labels (3x), agora todos leem daqui. Ordem tem que bater exatamente com a ordem
// das chaves de REG.visaDetalhe (parcelas, consorcios, wallace, recorrencias, corp, assinaturas,
// vanessa, naoReconciliado).
const VISA_DETALHE_LABELS = ['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa','Não Reconciliado'];
const VISA_DETALHE_CORES = ['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0','#4a4d52'];

function hydrate(){
  const t = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  const R = REG;
  t('kpiPatrimonio', 'R$ '+Math.round(R.patrimonio.total).toLocaleString('pt-BR'));
  t('kpiPatrimonioPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('kpiTotalOp', 'R$ '+Math.round(R.operacional.totalOperacional).toLocaleString('pt-BR'));
  t('kpiNecBruta', Math.round(R.operacional.necessidadeTotalBruta).toLocaleString('pt-BR'));
  t('kpiNecLiquida', Math.round(R.operacional.necessidadeLiquida).toLocaleString('pt-BR'));
  t('kpiCaixaVarDisp', fmt(R.caixaVariavel.disponivel));
  t('kpiModoOp', R.operacional.modoOperacional);
  t('kpiSaldoCiclo', R.operacional.saldoCiclo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));

  t('s02Salario', fmt(R.operacional.salario));
  t('s02Reembolsos', fmt(R.operacional.reembolsosAReceber));
  t('s02Entradas', fmt(R.operacional.entradasTotais));
  t('s02SaldoCiclo', R.operacional.saldoCiclo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));

  t('s20TotalOp', fmt(R.operacional.totalOperacional));
  t('s20Orcamento', fmt(R.operacional.orcamentoOperacional));
  t('s20NecBruta', fmt(R.operacional.necessidadeTotalBruta));
  t('s20Garantido', R.operacional.coberturaGarantida.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('s20NecLiquida', fmt(R.operacional.necessidadeLiquida));

  t('r21Patrimonio', fmt(R.patrimonio.total));
  t('r21MetaMilhaoPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('r21ModoOp', R.operacional.modoOperacional);
  t('r21Visa', fmt(R.cartaoInfinite.total));
  t('r21MB', fmt(R.cartaoMB.total));
  t('r21MP', fmt(R.mercadoPago));
  t('r21Wartsila', fmt(R.faturaWartsila));
  t('r21TotalOp', fmt(R.operacional.totalOperacional));
  const totalOpMar27 = R.evolucao.totalOperacional[R.evolucao.totalOperacional.length-1];
  t('r21TotalOpMar27', fmt(totalOpMar27));

  // Fase 3 - Reserva de Emergencia (secao 04, pagina Cenarios)
  const ciclosNormal = R.reserva.atual / R.operacional.necessidadeTotalBruta;
  const ciclosExtremo = R.reserva.atual / R.reserva.piso;
  t('resNormalValor', fmt(R.operacional.necessidadeTotalBruta)+' /ciclo');
  t('resNormalCiclos', '≈ '+ciclosNormal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ciclos (~'+Math.round(ciclosNormal)+' meses)');
  t('resExtremoValor', fmt(R.reserva.piso)+' /ciclo');
  t('resExtremoCiclos', '≈ '+ciclosExtremo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ciclos (~'+ciclosExtremo.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' meses)');
  t('resAtual', R.reserva.atual.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('resDiffMeses', (ciclosExtremo-ciclosNormal).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}));

  // Fase 3 - Estimador de Salario (ciclo que comeca 25/07 = Ago/26)
  t('estLiquido', fmt(liquidoMes(0)));
  { // Rótulo dinâmico: mostra qual fonte da regra de 3 níveis está ativa agora (real/projetado/média).
    const diaHoje = new Date().getDate();
    const temReal = (REG.superavitNormal.liquidoReal||{})[0] != null;
    const fonteLabel = temReal ? 'Real recebido'
      : (diaHoje>=12 ? 'Projetado (Estimador de Salário)' : 'Média ponderada 12M (sem estimativa ainda)');
    t('estStatusFonte', 'Folha Jun/2026 → ciclo 25/07 (Ago/26) · '+fonteLabel);
  }
  t('estNecLiquida', fmt(R.estimador.necessidadeLiquidaProximoCiclo));
  const excedenteEst = liquidoMes(0) - R.estimador.necessidadeLiquidaProximoCiclo;
  t('estExcedente', fmt(excedenteEst)+' · Modo Normal');

  // Fase 3 - totais dos livros razao (tfoot de cada tabela)
  const fmtSinal = v => (v<0?'− ':'')+fmt(Math.abs(v));
  const L = R.livrosRazaoTotais;
  t('tfLRW', fmt(L.LRW.total));
  t('tfLRV', fmt(L.LRV.total));
  t('tfLRB', fmt(L.LRB.total));
  t('tfLRP', fmt(L.LRP.total));
  t('tfLRS', fmt(L.LRS.total));
  t('tfLRR', fmt(L.LRR.total));
  t('tfLRCON', fmt(L.LRCON.total));
  t('tfLRC', fmt(L.LRC.total));
  t('tfLRMP', fmt(L.LRMP.total));
  t('tfLRPV', fmt(L.LRPV.total));
  // tfLRCV/tfLRCVresumo removidos (18/07/2026, V84): a tabela LRCV foi dividida em "PIX/gastos reais"
  // (visível) vs "movimentações internas" (recolhível, <details>) porque misturar as duas fazia o
  // total "líquido" não significar nada (soma de gasto real + repasse de boleto + LREI + venda de P2P).
  // Os 2 rodapés agora são texto estático mantido manualmente junto com as linhas da tabela.

  // ===== Batch final (16/07/2026) - varredura completa a pedido do usuario =====
  const fmtInt = v => 'R$ '+Math.round(v).toLocaleString('pt-BR');
  const fmtSign = v => (v<0?'−':'+')+'R$'+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  // cover-metrics
  t('coverPatrimonio', fmtInt(R.patrimonio.total));
  t('coverMetaPct', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('coverModoOp', R.operacional.modoOperacional);
  t('coverCaixaVar', fmt(R.caixaVariavel.disponivel));

  // patrimonio breakdown
  t('patTotal', fmt(R.patrimonio.total));
  t('patReserva', fmt(R.patrimonioDetalhe.reserva));
  t('patBtg', fmt(R.patrimonioDetalhe.btg));
  t('patLance', fmt(R.patrimonioDetalhe.caixaLance));
  t('patEscola', fmt(R.patrimonioDetalhe.nectonContaCorrente));
  t('patAcumulado', fmt(R.patrimonio.total));
  t('patFalta', fmt(R.patrimonio.metaMilhao - R.patrimonio.total));
  t('patPctBadge', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=document.getElementById('patPctBar'); if(el) el.style.width = R.patrimonio.metaMilhaoPct+'%'; }

  // V142: secao 11 Passivos Patrimoniais
  const PP = R.passivosPatrimoniais;
  t('ppFinanciamentoCasa', fmt(PP.financiamentoCasa));
  t('ppFinanciamentoDetalhe', 'Prestação '+fmt(PP.prestacaoFinanciamentoCasa)+' · '+PP.mesesRestantesFinanciamentoCasa+' meses restantes');
  t('ppConsorcioAuto', fmt(PP.consorcioAuto));
  { const el=document.getElementById('ppConsorcioAutoBar'); if(el) el.style.width = PP.consorcioAutoPct+'%'; }
  t('ppConsorcioAutoPct', PP.consorcioAutoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'% pago');
  t('ppConsorcioAutoParcela', 'Parcela '+fmt(PP.parcelaConsorcioAuto));

  // caixas operacionais
  const C = R.caixasOperacionais;
  const pctOf = (s,m) => m>0 ? Math.min(100, s/m*100) : 0;
  t('cxBoletosSaldo', fmt(C.boletos.saldo));
  t('cxBoletosMeta', fmtInt(C.boletos.meta));
  t('cxBoletosPct', pctOf(C.boletos.saldo,C.boletos.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=document.getElementById('cxBoletosBar'); if(el) el.style.width = pctOf(C.boletos.saldo,C.boletos.meta)+'%'; }
  t('cxPixSaldo', fmt(C.pixVanessa.saldo));
  t('cxPixMeta', fmtInt(C.pixVanessa.meta));
  t('cxPixPct', pctOf(C.pixVanessa.saldo,C.pixVanessa.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=document.getElementById('cxPixBar'); if(el) el.style.width = pctOf(C.pixVanessa.saldo,C.pixVanessa.meta)+'%'; }
  t('cxManutSaldo', fmt(C.manutencao.saldo));       t('cxManutMeta', fmtInt(C.manutencao.meta));
  t('cxEventosSaldo', fmt(C.eventos.saldo));        t('cxEventosMeta', fmtInt(C.eventos.meta));
  t('cxSaudeSaldo', fmt(C.saudeFamilia.saldo));     t('cxSaudeMeta', fmtInt(C.saudeFamilia.meta));
  t('cxAnivSaldo', fmt(C.aniversarioJulio.saldo));  t('cxAnivMeta', fmtInt(C.aniversarioJulio.meta));
  t('cxSeguroSaldo', fmt(C.seguroEmplacamento.saldo)); t('cxSeguroMeta', fmtInt(C.seguroEmplacamento.meta));
  // NOVO 23/07/2026: card Escola de Julio adicionado na secao 05 (Caixas Operacionais) a pedido do
  // usuario - mesma fonte ja usada no card dedicado da secao 14 (R.escolaJulioSaldo/R.patrimonio.metaEscolaJulio).
  t('cxEscolaSaldo', fmt(R.escolaJulioSaldo));
  t('cxEscolaMeta', fmtInt(R.patrimonio.metaEscolaJulio));
  t('cxEscolaPct', pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=document.getElementById('cxEscolaBar'); if(el) el.style.width = pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio)+'%'; }

  // caixa variavel
  t('cvSaldoReal', fmt(R.caixaVariavel.saldoReal));
  t('cvComprometido', fmt(R.caixaVariavel.comprometido));
  t('cvDisponivel', fmt(R.caixaVariavel.disponivel));

  // NOVO 23/07/2026: Operacoes P2P (secao 18) - antes 100% hardcoded, agora vem do REG.p2p
  t('p2pCapitalTotal', fmt(R.p2p.capitalTotal));
  t('p2pCreditosRestantes', R.p2p.creditosRestantes + ' / ' + R.p2p.creditosTotal);
  t('p2pSaldoInvestido', fmt(R.p2p.saldoInvestido));
  t('p2pLucroRealizado', fmt(R.p2p.lucroRealizado));
  t('p2pDetalhe', `Custo ${fmt(R.p2p.precoCompra)}/crédito · Venda ${fmt(R.p2p.precoVenda)}/crédito (rentabilidade ${R.p2p.rentabilidadePct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}% sobre o custo) · ${R.p2p.creditosVendidos} créditos vendidos deste lote (1 crédito doado à Vanessa em 13/07, não contado como venda) — última venda: TXP2P0003, 2 créditos, R$40,00, 22/07/2026.`);

  // visa infinite
  t('visaTotal', fmt(R.cartaoInfinite.total));
  t('visaPessoal', fmt(R.cartaoInfinite.total - R.visaDetalhe.corp));
  t('visaLRW', fmt(R.visaDetalhe.wallace));
  t('visaLRV', fmt(R.visaDetalhe.vanessa));
  t('visaLRP', fmt(R.visaDetalhe.parcelas));
  t('visaLRS', fmt(R.visaDetalhe.assinaturas));
  t('visaLRR', fmt(R.visaDetalhe.recorrencias));
  t('visaLRCON', fmt(R.visaDetalhe.consorcios));
  t('visaLRC', fmt(R.visaDetalhe.corp));
  t('visaLRNaoReconciliado', fmt(R.visaDetalhe.naoReconciliado)); // V135: residuo soma-livros x fatura-real, documentado (P1)
  // mastercard black
  t('mbTotal', fmt(R.cartaoMB.total));
  t('mbPessoal', fmt(R.cartaoMB.total - R.mbDetalhe.corp));
  t('mbLRW', fmt(R.mbDetalhe.wallace));
  t('mbLRV', fmt(R.mbDetalhe.vanessa));
  t('mbLRP', fmt(R.mbDetalhe.parcelas));
  t('mbLRS', fmt(R.mbDetalhe.assinaturas));
  t('mbLRR', fmt(R.mbDetalhe.recorrencias));
  t('mbLRCON', fmt(R.mbDetalhe.consorcios));
  t('mbLRC', fmt(R.mbDetalhe.corp));

  // mercado pago
  t('mpFatura', fmt(R.mercadoPago));
  t('mpProprias', fmt(R.totalOpDetalhe.provMP));
  t('mpTransporteCorp', fmt(R.operacional.reembolsoPagaMPCorporativo));

  // titulos/totais ja centralizados (secoes 01/02/03)
  t('s01TotalOp', fmt(R.operacional.totalOperacional));
  t('totOpTotalLine', fmt(R.operacional.totalOperacional));
  t('s02TituloVisa', fmt(R.visa.totalComprometido));
  t('gVisaTotalLine', fmt(R.visa.totalComprometido));
  t('gVisaPessoalLine', fmt(R.visa.pessoal));
  // Novo 19/07/2026 (V89, pedido do usuario): Visa+MB liquido de Caixa Variavel.
  // A Caixa Variavel ja cobre 100% de LRW+LRV (REGRA_FUNCAO_CAIXA_VARIAVEL) - este card mostra
  // quanto da obrigacao dos 2 cartoes NAO esta coberto por ela (parcelas/assinaturas/recorrencias/consorcios/corp).
  const cartoesTotal = Math.round((R.cartaoInfinite.total + R.cartaoMB.total)*100)/100;
  const cartoesLiquidoCV = Math.round((cartoesTotal - R.caixaVariavel.comprometido)*100)/100;
  t('gCartoesTotalLine', fmt(cartoesTotal));
  t('gCartoesPessoalLine', fmt(R.visa.pessoal)); // mesma logica ja usada em gVisaPessoalLine - so o Visa tem corporativo, MB nao
  t('gCVComprometidoLine', '− '+fmt(R.caixaVariavel.comprometido));
  t('gCartoesLiquidoLine', fmt(cartoesLiquidoCV));
  // ADICIONADO 20/07/2026 (pedido do usuario): Comprometido (provisionado) x Disponivel real em caixa,
  // pra mostrar a diferenca (quanto falta) e de onde vem a reposicao - mesma logica ja usada no LREI0001
  // (recomposicao via salario do dia 25 ou sobra do reembolso Wartsila).
  const cvDisponivel = R.caixaVariavel.disponivel;
  const reposicaoNecessaria = cvDisponivel < 0 ? Math.round(Math.abs(cvDisponivel)*100)/100 : 0;
  t('gCVDisponivelLine', fmt(cvDisponivel));
  const elDisp = document.getElementById('gCVDisponivelLine');
  if(elDisp) elDisp.style.color = cvDisponivel < 0 ? '#e2554f' : '#34c98a';
  const elRepo = document.getElementById('gCVReposicaoLine');
  if(reposicaoNecessaria > 0){
    t('gCVReposicaoLine', fmt(reposicaoNecessaria));
    if(elRepo) elRepo.style.color = '#e2554f';
    t('gCVReposicaoFonte', `Fonte prevista: salário do dia 25 ou sobra do reembolso Wärtsilä (${fmt(R.operacional.reembolsoSobraPessoal)} disponível hoje) — mesmo mecanismo já usado para o LREI0001.`);
  } else {
    t('gCVReposicaoLine', 'Nenhuma');
    if(elRepo) elRepo.style.color = '#34c98a';
    t('gCVReposicaoFonte', 'Caixa Variável está dentro do previsto — sem necessidade de reposição externa agora.');
  }
  t('s03TituloPat', fmt(R.patrimonio.total));

  // alivio (Evolucao Total Operacional)
  const alivioTotal = R.operacional.totalOperacional - totalOpMar27;
  t('aliv1', '− '+fmt(alivioTotal));
  t('aliv2', '− '+fmt(alivioTotal));
  t('alivioBadgeMar27', 'Alívio '+fmt(alivioTotal)+' até Mar/27');

  // cenario historico (Cenarios secao 01/02) - formulas: saldo(salario) = salario + reembolsos - necessidadeTotalBruta
  const CH = R.cenarioHistorico;
  const saldoDe = liquido => liquido + R.operacional.reembolsoSobraPessoal - R.operacional.necessidadeTotalBruta;
  t('chMediana', CH.mediana.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('chDesvpad', CH.desvioPadrao.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('chPiorValor', fmt(CH.piorMes));
  t('chPiorSaldo', fmtSign(saldoDe(CH.piorMes)));
  t('chEquilibrio', fmt(R.operacional.necessidadeTotalBruta - R.operacional.reembolsoSobraPessoal));
  t('chMediaValor', fmt(CH.media));
  t('chMediaSaldo', fmtSign(saldoDe(CH.media)));

  // piso absoluto (O que NUNCA e cortado)
  const D = R.totalOpDetalhe;
  t('pisoBoletos', fmt(D.boletos));
  t('pisoParcelas', fmt(D.parcelas));
  t('pisoConsorcios', fmt(D.consorcios));
  t('pisoRecorrencias', fmt(D.recorrencias));
  t('pisoMP', fmt(D.provMP));
  t('pisoAssinaturas', fmt(D.assinaturas));
  t('pisoTotal', fmt(R.reserva.piso));

  // reembolsos e meta de investimento
  t('reembRecebidos', fmt(R.reembolsos.recebidosNoCiclo));
  t('reembAReceber', fmt(R.operacional.reembolsosAReceber));
  t('reembCicloTotal', fmt(R.operacional.reembolsoCicloTotal));
  t('reembPagaWartsila', fmt(R.faturaWartsila));
  t('reembPagaMP', fmt(R.operacional.reembolsoPagaMPCorporativo));
  t('reembPagaCartao', fmt(R.visaDetalhe.corp));
  t('reembSobraPessoal', fmt(R.operacional.reembolsoSobraPessoal));
  t('reembMPPessoal', fmt(R.totalOpDetalhe.provMP)); // CORRIGIDO 20/07/2026: agora e literalmente o item 4 da cascata (usado no calculo de reembolsoSobraPessoal), nao mais um campo paralelo "so informativo".
  t('metaInvTotal', fmt(R.metaInvestimento.investido));
  t('metaInvExcedente', fmt(R.metaInvestimento.excedente));
  t('metaInvMensal', fmt(R.metaInvestimento.meta));
  t('metaInvBadge', 'Total investido '+fmt(R.metaInvestimento.investido)+' · '+(R.metaInvestimento.excedente>=0?'Superada +':'Falta ')+fmt(Math.abs(R.metaInvestimento.excedente)));
  t('metaInvBTG', fmt(VARS.aporteBTGPactual));
  t('metaInvNecton', fmt(VARS.depositoAtivacaoNecton));

  t('cxWartsila', fmt(R.faturaWartsila));
  t('cxWartsilaExcedente', '100% coberto · excedente '+fmt(R.wartsilaCaixa.excedente));
  t('cxWartsilaProvisionado', 'Provisionado '+fmt(R.wartsilaCaixa.provisionado));
  t('cxSaudeAporteTxt', '2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa/ano · aporte '+fmt(VARS.aporteSaudeFamilia)+'/mês');
  t('cxAnivAporteTxt', 'Nova · aporte '+fmt(VARS.aporteAniversarioJulio)+'/mês até 14/09');
  t('cxSeguroAporteTxt', 'Nova · aporte '+fmt(VARS.seguroEmplacamentoAporte)+'/mês (permanente)');
  t('tfLRCDetalhe', R.livroLRCDetalhe.qtd+' lançamentos · Reembolso pendente '+fmt(R.livroLRCDetalhe.valor));
  t('tfPixDiversosDetalhe', 'Saídas '+fmt(R.pixDiversos.saidas)+' · Entradas '+fmt(R.pixDiversos.entradas));
  t('tfPixDiversosLiquido', 'Líquido '+(R.pixDiversos.liquido<0?'− ':'+ ')+fmt(Math.abs(R.pixDiversos.liquido)));
  t('ejSaldo', fmt(R.escolaJulioSaldo));
  t('ejMeta', fmt(R.patrimonio.metaEscolaJulio));
  // V136: faltava popular ejPct/ejBar apos a secao 14 ter sido reconstruida no padrao da secao 05
  // (o card ficaria com barra em 0% e "—" no lugar do percentual pra sempre sem isso).
  t('ejPct', pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=document.getElementById('ejBar'); if(el) el.style.width = pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio)+'%'; }

  // V139: secoes 12/13 (Consorcio Casa Nova / Projeto Casa Nova) - antes 100% texto fixo, sem id nenhum.
  const CCN = R.consorcioCasaNova, PCN = R.projetoCasaNova;
  t('ccnCartaCredito', fmt(CCN.cartaCredito));
  t('ccnParcela', fmt(CCN.parcela));
  t('ccnPagoPct', CCN.pagoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('ccnQuitacao', fmt(CCN.quitacaoValor)+' ('+CCN.quitacaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%)');
  { const el=document.getElementById('ccnBar'); if(el) el.style.width = CCN.pagoPct+'%'; }
  t('pcnCapital', fmt(PCN.capitalDisponivel));
  t('pcnPctBadge', PCN.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=document.getElementById('pcnBar'); if(el) el.style.width = PCN.pct+'%'; }
  t('pcnMeta', 'Meta lance '+fmt(PCN.metaLance));
  t('pcnFalta', 'Falta '+fmt(PCN.falta));

  // V139: badges do Resumo Executivo - antes texto fixo duplicando numeros ja calculados em outro lugar
  t('r21ProjetoCasa', PCN.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('r21ConsorcioCasa', CCN.pagoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('r21EscolaJulio', pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  t('r21MetaInvest', fmt(R.metaInvestimento.investido)+' investido · '+(R.metaInvestimento.excedente>=0?'Superada +':'Falta ')+fmt(Math.abs(R.metaInvestimento.excedente)));

  t('snCicloAtual', '+ '+fmt(liquidoMes(0) - R.superavitNormal.necessidade[0]));

  t('csNecTotal', R.operacional.necessidadeTotalBruta.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('csReembolsos', R.operacional.reembolsoSobraPessoal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));

  // ===== Balanço Patrimonial (Reestruturação V2.0, 16/07/2026) =====
  const B = R.balanco;
  t('balFisicoTotal', fmt(B.fisico.total));
  t('bfCasa', fmt(B.fisico.casa));
  t('bfApartamento', fmt(B.fisico.apartamento));
  t('bfJazigo', fmt(B.fisico.jazigo));
  t('bfSolar', fmt(B.fisico.solar));
  t('bfCarro', fmt(B.fisico.carro));
  t('balFinanceiroTotal', fmt(B.financeiro.total));
  t('bfinReserva', fmt(B.financeiro.reserva));
  t('bfinBTG', fmt(B.financeiro.btg));
  t('bfinConsorcioCasa', fmt(B.financeiro.consorcioCasaPago));
  t('bfinNectonCC', fmt(B.financeiro.nectonContaCorrente));
  t('bpFinanciamentoCasa', fmt(B.passivos.financiamentoCasa));
  t('bpConsorcioAuto', fmt(B.passivos.consorcioAutoContemplado));
  t('balPgbl', fmt(B.pgbl));
  t('balFgts', fmt(B.fgts));
  t('balPassivosTotal', fmt(B.passivos.total));
  t('balAtivosTotal', fmt(B.ativosTotal));
  t('balPassivosTotal2', fmt(B.passivos.total));
  t('balPatrimonioLiquido', fmt(B.patrimonioLiquido));
  t('balResBoletos', fmt(B.operacional.caixaBoletos)); // V85: movida de reservas pra operacional
  t('balResEscola', fmt(B.reservas.escolaJulio));
  t('balResLance', fmt(B.reservas.caixaLance));
  t('balResManut', fmt(B.reservas.manutencao));
  t('balResEventos', fmt(B.reservas.eventos)+' (usada no ciclo)');
  t('balResChurrasco', fmt(B.reservas.churrasco));
  t('balResSaude', fmt(B.reservas.saudeFamilia));
  t('balResSeguro', fmt(B.reservas.seguroEmplacamento));
  t('balResAniv', fmt(B.reservas.aniversarioJulio));
  t('balReservasTotal', fmt(B.reservas.total));
  t('balOpCaixaVariavel', fmt(B.operacional.caixaVariavel));
  t('balOpPixVanessa', fmt(B.operacional.pixVanessaSaldoReal));
  t('balOperacionalTotal', fmt(B.operacional.total));
  t('balObrVisa', fmt(B.obrigacoes.visa));
  t('balObrMB', fmt(B.obrigacoes.mastercardBlack));
  t('balObrMP', fmt(B.obrigacoes.mercadoPago));
  t('balObrWartsila', fmt(B.obrigacoes.wartsila));
  t('balObrTotal', fmt(B.obrigacoes.total));
  t('balFluxoEntradas', fmt(B.fluxo.entradas));
  t('balFluxoSaidas', fmt(B.fluxo.saidas));
  t('balFluxoResultado', fmt(B.fluxo.resultado));
  t('bal4qModo', R.operacional.modoOperacional);
  t('bal4qTotalOp', fmt(R.operacional.totalOperacional));
  t('bal4qPatrimonio', fmt(B.patrimonioLiquido));
  t('bal4qExcedente', fmt(B.fluxo.resultado));
  t('patPrevidencia', fmt(B.pgbl));
  t('patFgts', fmt(B.fgts));
}
document.addEventListener('DOMContentLoaded', hydrate);

// ===== Auditoria automatica (item 15 do Plano Mestre, criada 17/07/2026 V54) =====
// Roda sozinha ao carregar a pagina. Como o REG e um snapshot agregado (nao guarda TX individuais
// no cliente - isso mora no ERP/Excel), esta auditoria confere a MATEMATICA INTERNA do REG: se os
// totais batem com a soma das suas partes. Nao substitui a auditoria do ERP (que tem granularidade
// de transacao), e uma segunda camada de seguranca no lado do site. Loga no console; se achar
// divergencia, mostra um aviso discreto no rodape (nao intrusivo, nao trava a pagina).
function auditoriaAutomatica(){
  const problemas = [];
  const round2 = v => Math.round(v*100)/100;
  const bate = (a,b,tol=0.02) => Math.abs(a-b) <= tol;

  // 1) Visa Infinite + Mastercard Black = total combinado
  const somaCartoes = round2(REG.cartaoInfinite.total + REG.cartaoMB.total);
  if(!bate(somaCartoes, REG.visa.totalComprometido)){
    problemas.push(`Cartões: Infinite(${REG.cartaoInfinite.total})+MB(${REG.cartaoMB.total})=${somaCartoes} ≠ visa.totalComprometido(${REG.visa.totalComprometido})`);
  }

  // 2) Balanço: Ativos = Físico + Financeiro
  const somaAtivos = round2(REG.balanco.fisico.total + REG.balanco.financeiro.total);
  if(!bate(somaAtivos, REG.balanco.ativosTotal)){
    problemas.push(`Balanço Ativos: Físico+Financeiro=${somaAtivos} ≠ ativosTotal(${REG.balanco.ativosTotal})`);
  }

  // 3) Balanço: Patrimônio Líquido = Ativos - Passivos
  const liquidoCalc = round2(REG.balanco.ativosTotal - REG.balanco.passivos.total);
  if(!bate(liquidoCalc, REG.balanco.patrimonioLiquido)){
    problemas.push(`Patrimônio Líquido: Ativos-Passivos=${liquidoCalc} ≠ patrimonioLiquido(${REG.balanco.patrimonioLiquido})`);
  }

  // 4) Reembolso: cascata bate com o total do ciclo
  // V135: CORRIGIDO numero magico 483.43 (valor antigo do LRC) -> REG.operacional.reembolsoPagaCartaoCorporativo
  // (483.83, extrato real reconciliado V121). O numero fixo aqui causava FALSO-POSITIVO nesta propria
  // auditoria (acusava divergencia de R$0,40 que na verdade nao existia - o proprio checador tinha
  // uma 2a copia desatualizada do valor).
  const cascataTotal = round2(REG.operacional.reembolsoPagaWartsila + REG.operacional.reembolsoPagaMPCorporativo + REG.operacional.reembolsoPagaCartaoCorporativo + REG.totalOpDetalhe.provMP + REG.operacional.reembolsoSobraPessoal);
  if(!bate(cascataTotal, REG.operacional.reembolsoCicloTotal)){
    problemas.push(`Cascata reembolso: soma das 5 pernas=${cascataTotal} ≠ reembolsoCicloTotal(${REG.operacional.reembolsoCicloTotal})`);
  }

  // 5) Caixa Variável: Disponível = Saldo Real - Comprometido
  const dispCalc = round2(REG.caixaVariavel.saldoReal - REG.caixaVariavel.comprometido);
  if(!bate(dispCalc, REG.caixaVariavel.disponivel)){
    problemas.push(`Caixa Variável: SaldoReal-Comprometido=${dispCalc} ≠ disponivel(${REG.caixaVariavel.disponivel})`);
  }

  // 6) Gestão Operacional (Balanço) = Caixa Variável + PIX Vanessa saldo real + Caixa Boletos (movida da Reserva na V85)
  const opCalc = round2(REG.balanco.operacional.caixaVariavel + REG.balanco.operacional.pixVanessaSaldoReal + REG.balanco.operacional.caixaBoletos);
  if(!bate(opCalc, REG.balanco.operacional.total)){
    problemas.push(`Gestão Operacional: CaixaVariavel+PixVanessa+CaixaBoletos=${opCalc} ≠ total(${REG.balanco.operacional.total})`);
  }

  // 7) Reservas (Balanço) = soma das 9 caixas de reserva
  const r = REG.balanco.reservas;
  const resCalc = round2(r.boletos+r.escolaJulio+r.caixaLance+r.manutencao+r.eventos+r.churrasco+r.saudeFamilia+r.seguroEmplacamento+r.aniversarioJulio);
  if(!bate(resCalc, r.total)){
    problemas.push(`Reservas: soma das 9 caixas=${resCalc} ≠ total(${r.total})`);
  }

  // 8) Patrimônio Financeiro = Reserva + BTG/Necton + Caixa Lance + Necton Conta Corrente (ADICIONADO 20/07/2026, pedido do usuário)
  const pd = REG.patrimonioDetalhe;
  const patCalc = round2(pd.reserva + pd.btg + pd.caixaLance + pd.nectonContaCorrente);
  if(!bate(patCalc, REG.patrimonio.total)){
    problemas.push(`Patrimônio Financeiro: Reserva+BTG+CaixaLance+NectonCC=${patCalc} ≠ patrimonio.total(${REG.patrimonio.total})`);
  }

  // 9) Meta do Milhão = Patrimônio / R$1.000.000 (ADICIONADO 20/07/2026, pedido do usuário)
  const metaCalc = round2(REG.patrimonio.total / REG.patrimonio.metaMilhao * 100);
  if(!bate(metaCalc, REG.patrimonio.metaMilhaoPct, 0.01)){
    problemas.push(`Meta do Milhão: patrimonio.total/1.000.000=${metaCalc}% ≠ metaMilhaoPct(${REG.patrimonio.metaMilhaoPct}%)`);
  }

  // 10) Total Operacional = soma dos 7 componentes do totalOpDetalhe (ADICIONADO 20/07/2026, pedido do usuário -
  // hoje isso NUNCA diverge de verdade porque recalcularAgregadosDerivados() já deriva um do outro, mas o check
  // fica como rede de segurança caso algum dos dois seja editado manualmente sem tocar no outro no futuro)
  const D2 = REG.totalOpDetalhe;
  const totOpCalc = round2(D2.boletos+D2.parcelas+D2.consorcios+D2.recorrencias+D2.aportesPat+D2.provMP+D2.assinaturas);
  if(!bate(totOpCalc, REG.operacional.totalOperacional)){
    problemas.push(`Total Operacional: soma dos 7 componentes=${totOpCalc} ≠ operacional.totalOperacional(${REG.operacional.totalOperacional})`);
  }

  // 11) Visa Infinite: soma do detalhamento (visaDetalhe, usado nos graficos de composicao) = total do card
  // (ADICIONADO 22/07/2026, V135 - esta checagem NAO existia; foi exatamente por isso que o gap de
  // R$49,81 entre o grafico cVisa e o card "Total" ficou sem deteccao automatica por varios ciclos)
  const vd = REG.visaDetalhe;
  const visaDetalheCalc = round2(vd.parcelas+vd.consorcios+vd.wallace+vd.recorrencias+vd.corp+vd.assinaturas+vd.vanessa+vd.naoReconciliado);
  if(!bate(visaDetalheCalc, REG.cartaoInfinite.total)){
    problemas.push(`Visa Infinite: soma visaDetalhe=${visaDetalheCalc} ≠ cartaoInfinite.total(${REG.cartaoInfinite.total})`);
  }

  // 12) Mastercard Black: soma do detalhamento (mbDetalhe) = total do card (ADICIONADO 22/07/2026, V135 -
  // mesma classe de checagem que faltava; foi por isso que mbDetalhe.wallace ficou 3 rodadas desatualizado
  // sem ninguem perceber - nada comparava a soma das partes com o total)
  const md = REG.mbDetalhe;
  const mbDetalheCalc = round2(md.parcelas+md.consorcios+md.wallace+md.recorrencias+md.corp+md.assinaturas+md.vanessa);
  if(!bate(mbDetalheCalc, REG.cartaoMB.total)){
    problemas.push(`Mastercard Black: soma mbDetalhe=${mbDetalheCalc} ≠ cartaoMB.total(${REG.cartaoMB.total})`);
  }

  const healthBadge = document.getElementById('healthBadge');

  if(problemas.length === 0){
    console.log('%c✅ Auditoria automática: 0 divergências encontradas na matemática do REG.', 'color:#34c98a;font-weight:600');
    if(healthBadge){
      healthBadge.textContent = '✅ Sistema íntegro';
      healthBadge.style.color = '#34c98a';
      healthBadge.title = 'Auditoria automática: 0 divergências nas 12 relações matemáticas do REG.';
    }
  } else {
    console.warn('⚠️ Auditoria automática encontrou divergências:');
    problemas.forEach(p => console.warn('  - ' + p));
    if(healthBadge){
      healthBadge.textContent = `⚠️ ${problemas.length} divergência(s) — ver console`;
      healthBadge.style.color = '#e2554f';
      healthBadge.title = problemas.join('\n');
    }
    const footer = document.querySelector('footer');
    if(footer){
      const aviso = document.createElement('span');
      aviso.style.color = '#e2554f';
      aviso.style.fontWeight = '600';
      aviso.textContent = `⚠️ ${problemas.length} divergência(s) SSOT — ver console`;
      footer.appendChild(aviso);
    }
  }
  return problemas;
}
document.addEventListener('DOMContentLoaded', auditoriaAutomatica);

// ===== Ciclo financeiro 100% dinâmico (recalcula sempre que o arquivo é aberto, qualquer mês/ano) =====
// Regra do sistema: ciclo vai do dia 25 de um mês ao dia 24 do mês seguinte.
(function(){
  const hoje = new Date();
  const diaMs = 86400000;

  // Se hoje é dia >= 25, o ciclo começou dia 25 deste mês e termina dia 24 do mês seguinte.
  // Se hoje é dia < 25, o ciclo começou dia 25 do mês anterior e termina dia 24 deste mês.
  let inicio, fim;
  if (hoje.getDate() >= 25) {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 24);
  } else {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth()-1, 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 24);
  }

  const totalDias = Math.round((fim-inicio)/diaMs);
  const hojeSoData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let decorridos = Math.round((hojeSoData-inicio)/diaMs);
  decorridos = Math.max(0, Math.min(decorridos, totalDias));
  const restantes = totalDias - decorridos;
  const pct = Math.round(decorridos/totalDias*100);
  const fmtData = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  const fmtCurta = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };

  // Disponivel/dia = REG.caixaVariavel.disponivel (SSOT unico) / dias restantes do ciclo (inclui hoje).
  // CORRIGIDO 22/07/2026 (V128, usuario apontou): quando o disponivel ja e negativo, dividir por dia
  // nao faz sentido nenhum - nao ha "quanto gastar por dia" quando ja nao ha o que gastar. Mostra 0
  // nesse caso, com uma nota separada de quanto falta cobrir (ver simulador abaixo).
  const diasParaDivisao = Math.max(1, restantes);
  const dispDiaReal = REG.caixaVariavel.disponivel > 0 ? REG.caixaVariavel.disponivel / diasParaDivisao : 0;

  // ===== Aging LREI (18/07/2026, V73): dias em aberto de cada emprestimo interno, calculado ao vivo
  // a cada carregamento - nunca mais hardcoded (o ERP ja tinha IDADE_DIAS/STATUS_ENVELHECIMENTO mas
  // ficava parado entre sessoes). Faixas: 0-30 NORMAL, 31-60 ATENCAO, 61+ CRITICO (P4 - toda divida
  // interna deve ser ressarcida, quanto mais velha, maior o risco de ficar esquecida).
  const lreiAtivos = [
    // V121: LREI0001 QUITADO (reembolso Wartsila, 21/07/2026) - nenhum emprestimo interno ativo
  ];
  const diasAging = d => Math.round((hoje - d) / 86400000);
  const faixaAging = dias => dias <= 30 ? '' : (dias <= 60 ? ' color:var(--accent)' : ' color:var(--red);font-weight:700');

  // ===== Simulador Fim de Ciclo (18/07/2026, V79 - inovacao pedida pelo usuario): quanto ainda da
  // pra gastar na Caixa Variavel ate o fim do ciclo, considerando o teto oficial + tolerancia
  // temporaria (se ativa). Nao mexe em nenhum outro indicador - e so uma leitura combinada do que
  // ja existe em REG.caixaVariavel, calculada ao vivo (nunca hardcoded).
  const cv = REG.caixaVariavel;
  const tetoEfetivo = cv.tetoOficial + (cv.tolerenciaTemp||0);
  const folego = Math.round((tetoEfetivo - cv.comprometido)*100)/100;
  const folegoPorDia = restantes > 0 ? folego/restantes : folego;
  // NOVO 22/07/2026 (V128, pedido do usuario): o "Fôlego" (teto - comprometido) confunde porque parece
  // que falta cobrir o valor do estouro do TETO (ex: R$423), quando na real falta so a diferenca entre
  // o que TEM na caixa (saldoReal) e o que ESTA COMPROMETIDO (comprometido) - um numero bem menor.
  // Mostra os 2 lados explicitamente: quanto tem, quanto falta.
  const faltaCobrir = Math.round((cv.comprometido - cv.saldoReal)*100)/100; // positivo = falta, negativo/zero = tem sobra

  // ===== Verificacoes de Negocio (18/07/2026, V79 - "linter" enxuto): nao varre transacao por
  // transacao (REG so guarda agregados por design - ver nota em REG.qualidade), so expoe os
  // contadores/flags que ja sao mantidos manualmente no ERP a cada sessao.
  function montarAlertasNegocio(){
    const q = REG.qualidade;
    const alertas = [];
    alertas.push(q.txSemData === 0
      ? {icone:'✅', cor:'#34c98a', txto:'0 transações sem data rastreável'}
      : {icone:'⚠️', cor:'#e2554f', txto:`${q.txSemData} transaç${q.txSemData===1?'ão':'ões'} sem data — checar aba LRP/registro`});
    const maxIdade = lreiAtivos.length ? Math.max(...lreiAtivos.map(l=>diasAging(l.abertura))) : 0;
    if(q.lreiAtivos === 0){
      alertas.push({icone:'✅', cor:'#34c98a', txto:'Nenhum empréstimo interno (LREI) em aberto'});
    } else {
      const nivel = maxIdade<=30 ? {icone:'ℹ️',cor:'#3987e5'} : maxIdade<=60 ? {icone:'⚠️',cor:'#e8a63a'} : {icone:'🔴',cor:'#e2554f'};
      alertas.push({icone:nivel.icone, cor:nivel.cor, txto:`${q.lreiAtivos} empréstimo(s) interno(s) ativo(s) — mais antigo com ${maxIdade} dias`});
    }
    // CORRIGIDO 19/07/2026: condicao e valor exibido usavam cv.disponivel (Saldo Real - Comprometido, o ECC),
    // uma variavel errada para "quanto passou do teto oficial". O teto oficial e comparado contra o COMPROMETIDO
    // (secao 13 da Politica), nunca contra o disponivel. Valor certo = comprometido - tetoOficial.
    const excedente = Math.round((cv.comprometido - cv.tetoOficial)*100)/100;
    alertas.push(excedente <= 0
      ? {icone:'✅', cor:'#34c98a', txto:'Caixa Variável dentro do teto oficial'}
      : {icone: folego>=0 ? '⚠️' : '🔴', cor: folego>=0 ? '#e8a63a' : '#e2554f',
         txto: folego>=0
           ? `Caixa Variável acima do teto oficial (${fmt(excedente)}), coberta pela tolerância temporária — restam ${fmt(folego)} até o teto de ${fmt(tetoEfetivo)}`
           : `Caixa Variável estourou inclusive a tolerância temporária em ${fmt(Math.abs(folego))}`});
    if(q.tetoTemporarioAtivo){
      alertas.push({icone:'ℹ️', cor:'#3987e5', txto:`Tolerância temporária de ${fmt(cv.tolerenciaTemp)} ativa até o fim do ciclo (24/07) — recomposição prevista via reembolso Wärtsilä ou salário de 25/07`});
    }
    // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO): como o site e estatico (Claude mantem manualmente,
    // nao ha automacao real de virada de ciclo), este alerta funciona como lembrete ativo - se houver
    // valor represado E o ciclo ja virou (dia >= 25), sinaliza que a rolagem manual (debitar do proximo
    // aporte + zerar o registrador) ainda precisa ser feita na proxima sessao.
    const pendenteLimbo = cv.pendenteProximoCiclo || 0;
    if(pendenteLimbo > 0){
      const diaHoje = new Date().getDate();
      if(diaHoje >= 25){
        alertas.push({icone:'🔴', cor:'#e2554f', txto:`Ciclo virou com ${fmt(pendenteLimbo)} represado do limbo MB — rolar manualmente para o aporte/saldo do novo ciclo e zerar CAIXA_VARIAVEL_PENDENTE_PROXIMO_CICLO`});
      } else {
        alertas.push({icone:'ℹ️', cor:'#3987e5', txto:`${fmt(pendenteLimbo)} represado do limbo Mastercard Black (fecha dia 22) — será descontado do orçamento da Caixa Variável do próximo ciclo na virada do dia 25`});
      }
    }
    return alertas;
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    set('diasDecorridos', decorridos);
    set('diasRestantes', restantes);
    set('hojeData', fmtData(hoje));
    set('atualizadoEm', 'Atualizado em '+fmtData(hoje));
    set('cicloRange', fmtCurta(inicio)+' → '+fmtData(fim));
    set('dispDia', dispDiaReal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
    const bar = document.getElementById('cicloProgress');
    if(bar) bar.style.width = pct+'%';
    lreiAtivos.forEach(l=>{
      const el = document.getElementById(l.id);
      if(el){
        const dias = diasAging(l.abertura);
        el.textContent = dias+(dias===1?' dia':' dias');
        el.setAttribute('style', faixaAging(dias));
      }
    });

    // Simulador Fim de Ciclo
    // Card ECC (secao 07 do painel principal) - status real, nao mais hardcoded "RESOLVIDO"
    const eccStatusEl = document.getElementById('eccStatus');
    if(eccStatusEl){
      eccStatusEl.textContent = cv.disponivel >= 0 ? 'RESOLVIDO' : (folego >= 0 ? 'ATIVO (dentro da tolerância)' : 'ATIVO (estourou a tolerância)');
      eccStatusEl.style.color = cv.disponivel >= 0 ? '#34c98a' : (folego >= 0 ? '#e8a63a' : '#e2554f');
    }
    set('eccValor', fmt(cv.disponivel));
    set('eccFolego', fmt(folego));

    // Badge "Queda total" (Necessidade líquida) - calculado ao vivo a partir da MESMA serie usada
    // no grafico (18/07/2026, V85: estava hardcoded, descolado do dado real ha varias rodadas).
    const nlSerie = alignSeries(REG.evolucao.necessidadeLiquida);
    const quedaTotal = Math.round((nlSerie[0] - nlSerie[nlSerie.length-1])*100)/100;
    set('quedaTotalNL', 'Queda total: '+fmt(quedaTotal));
    const r21EccEl = document.getElementById('r21ECC');
    if(r21EccEl){
      r21EccEl.textContent = cv.disponivel >= 0 ? 'Zerado' : (folego >= 0 ? 'Ativo (na tolerância)' : 'Ativo (estourado)');
      r21EccEl.style.color = cv.disponivel >= 0 ? 'var(--green)' : (folego >= 0 ? 'var(--accent)' : 'var(--red)');
    }

    set('simDiasRestantes', restantes+(restantes===1?' dia':' dias'));
    set('simTeto', fmt(tetoEfetivo)+(cv.tolerenciaTemp>0 ? ' *' : ''));
    set('simComprometido', fmt(cv.comprometido));
    set('simSaldoReal', fmt(cv.saldoReal));
    const faltaEl = document.getElementById('simFalta');
    if(faltaEl){
      faltaEl.textContent = faltaCobrir > 0 ? fmt(faltaCobrir) : 'R$ 0,00 (coberto)';
      faltaEl.style.color = faltaCobrir > 0 ? '#e2554f' : '#34c98a';
    }
    const folegoEl = document.getElementById('simFolego');
    if(folegoEl){
      folegoEl.textContent = fmt(folego);
      folegoEl.style.color = folego >= 0 ? '#34c98a' : '#e2554f';
    }
    // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO): card so aparece se houver algo represado -
    // enquanto pendenteProximoCiclo=0 (sem compras na janela 23-25 ainda), fica escondido para nao
    // poluir o painel com um card vazio.
    const pendenteBox = document.getElementById('simPendenteBox');
    const pendenteValor = cv.pendenteProximoCiclo || 0;
    if(pendenteBox){
      pendenteBox.style.display = pendenteValor > 0 ? 'block' : 'none';
    }
    set('simPendenteValor', fmt(pendenteValor));
    const msgEl = document.getElementById('simMensagem');
    if(msgEl){
      if(faltaCobrir <= 0){
        msgEl.innerHTML = `Tem <strong>${fmt(cv.saldoReal)}</strong> na caixa e o comprometido é <strong>${fmt(cv.comprometido)}</strong> — está coberto, sobra <strong>${fmt(Math.abs(faltaCobrir))}</strong>.`
          + (folego < 0 ? ` (Ainda assim, acima do teto oficial em ${fmt(Math.abs(folego))} — coberto pela tolerância temporária.)` : '');
      } else {
        msgEl.innerHTML = `<strong style="color:#e2554f">Falta ${fmt(faltaCobrir)}</strong> para cobrir o comprometido — tem ${fmt(cv.saldoReal)} na caixa contra ${fmt(cv.comprometido)} comprometido. Recomposição prevista via reembolso Wärtsilä ou salário de 25/07.`;
      }
    }

    // Verificações de Negócio
    const alertasEl = document.getElementById('alertasNegocio');
    if(alertasEl){
      alertasEl.innerHTML = montarAlertasNegocio().map(a=>
        `<div style="color:${a.cor}">${a.icone} ${a.txto}</div>`
      ).join('');
    }
  });
})();

function showMaster(id, btn){
  document.querySelectorAll('.master-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.master-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
  // CORRIGIDO 18/07/2026 (V85, bug real reportado pelo usuario: "gráfico do Visa não carregou"):
  // os graficos das paginas Graficos/Cenarios/Balanco sao criados com new Chart() enquanto a pagina
  // ainda esta escondida (display:none) no carregamento inicial - o Chart.js nao consegue medir o
  // canvas com largura/altura zero e o grafico fica quebrado/em branco, mesmo depois da aba aparecer.
  // Forcar resize() em todas as instancias existentes toda vez que uma pagina fica visivel resolve -
  // Chart.js mantem um registro global (Chart.instances) que nao precisa de nenhum controle manual.
  if(typeof Chart !== 'undefined' && Chart.instances){
    requestAnimationFrame(()=>{
      Object.values(Chart.instances).forEach(c=>{ try{ c.resize(); }catch(e){} });
    });
  }
}

function showLR(id, btn){
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

const valueLeaderPlugin = {
  id: 'valueLeader',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    meta.data.forEach((point, i) => {
      const x = point.x, y = point.y;
      const lineTop = y - 16;
      ctx.strokeStyle = 'rgba(169,167,159,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, lineTop);
      ctx.stroke();
      const label = 'R$ ' + Math.round(values[i]).toLocaleString('pt-BR');
      ctx.fillStyle = '#e8e6df';
      ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(label, x, lineTop - 4);
    });
    ctx.restore();
  }
};

(function(){
const muted = '#a9a79f', dim='#6f6d66', grid='#2a2d31';
Chart.defaults.color = muted;
Chart.defaults.font.family = "-apple-system, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size = 11;

new Chart(document.getElementById('cPatrim'), {
  type:'doughnut',
  data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
    datasets:[{data:Object.values(REG.patrimonioDetalhe),
    backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
    tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart(document.getElementById('cVisa'), {
  type:'doughnut',
  data:{labels:VISA_DETALHE_LABELS,
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:VISA_DETALHE_CORES,
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
    tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart(document.getElementById('cVisaMB'), {
  type:'doughnut',
  data:{labels:['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa'],
    datasets:[{data:Object.values(REG.mbDetalhe),
    backgroundColor:['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0'],
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:{position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}},
    tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart(document.getElementById('cVariavel'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:['Saldo real','Comprometido','Disponível'],
    datasets:[{data:[REG.caixaVariavel.saldoReal,REG.caixaVariavel.comprometido,REG.caixaVariavel.disponivel],
    backgroundColor:['#3987e5','#e8a63a','#34c98a'],borderRadius:5}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:20}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}}}}
});

const totalOpSeries = alignSeries(REG.evolucao.totalOperacional);
const totalOpRange = yRange(totalOpSeries);
new Chart(document.getElementById('cEvol'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMeses(12),
    datasets:[{data:totalOpSeries,
    borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
    borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:totalOpRange.min,max:totalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

const necLiqSeries = alignSeries(REG.evolucao.necessidadeLiquida);
const necLiqRange = yRange(necLiqSeries);
new Chart(document.getElementById('cNecessidadeLiquida'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMeses(12),
    datasets:[{data:necLiqSeries,
    borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
    borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:necLiqRange.min,max:necLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});
})();

(function(){
const grid='#2a2d31';
const cenarioLabelPlugin = {
  id:'cenarioLabel',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = "600 9px -apple-system, 'Segoe UI', Roboto, sans-serif";
    meta.data.forEach((bar,i)=>{
      const v = values[i];
      const y = Math.max(bar.y-8, 12);
      ctx.fillStyle = '#e8e6df';
      ctx.fillText('R$ '+Math.round(v).toLocaleString('pt-BR'), bar.x, y);
    });
    ctx.restore();
  }
};
const cenarioSalarioData = [REG.deficitZero.liquidoSemTrabalhar,REG.operacional.necessidadeTotalBruta-REG.operacional.reembolsoSobraPessoal,REG.cenarioHistorico.media,VARS.cenarioMesesBonsMedia];
const cenarioSalarioRange = yRange(cenarioSalarioData, 0.18);
new Chart(document.getElementById('cCenarioSalario'), {
  type:'bar',
  plugins:[cenarioLabelPlugin],
  data:{labels:['Não trabalha','Ponto de\nempate','Média\n(sobra)','Meses bons\n(média)'],
    datasets:[{data:cenarioSalarioData,
    backgroundColor:['#e0574c','#e8a63a','#34c98a','#34c98a'],
    borderRadius:4,barThickness:56}]},

  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,bottom:8}},
    plugins:{legend:{display:false},tooltip:{callbacks:{
      title:c=>c[0].label.replace('\n',' '),
      label:c=>fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10.5}}},
      y:{grid:{color:grid},max:cenarioSalarioRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});
})();

(function(){
// ===== Aba GRAFICOS =====
const muted = '#a9a79f', grid='#2a2d31';
const legendStd = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};
// barValuePlugin agora e global (definido junto de fmt(), no topo do arquivo) - reutilizado aqui.

// plugin: rotula % em cima de cada barra de progresso de metas
const metaValuePlugin = {
  id:'metaValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    const raw = chart.data.datasets[0].raw;
    ctx.save();
    ctx.fillStyle = '#e8e6df';
    ctx.font = "600 10px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    meta.data.forEach((bar,i)=>{
      ctx.fillText(raw[i], bar.x + 6, bar.y);
    });
    ctx.restore();
  }
};

new Chart(document.getElementById('g_cPatrim'), {
  type:'doughnut',
  data:{labels:['Reserva','BTG/Necton','Caixa Lance','Necton C.Corrente'],
    datasets:[{data:Object.values(REG.patrimonioDetalhe),
    backgroundColor:['#3987e5','#9085e9','#34c98a','#e8a63a'],borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart(document.getElementById('g_cVisa'), {
  type:'doughnut',
  data:{labels:VISA_DETALHE_LABELS,
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:VISA_DETALHE_CORES,
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart(document.getElementById('g_cVisaBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:VISA_DETALHE_LABELS,
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:VISA_DETALHE_CORES,borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

// Novo 19/07/2026 (V89) — Visa+MB liquido de Caixa Variavel (isolado em IIFE propria, regra 14.2)
// ATUALIZADO 20/07/2026 (pedido do usuario): Mastercard Black vem antes do Visa Infinite em toda
// legenda/titulo que combine os dois. Adicionadas 2 barras novas: Disponivel real (Saldo Real -
// Comprometido) e Reposicao necessaria, pra mostrar a diferenca entre o que esta provisionado
// (Comprometido) e o que existe de verdade em caixa agora (Disponivel).
(function(){
  const cvComprometido = REG.caixaVariavel.comprometido;
  const cvDisponivel = REG.caixaVariavel.disponivel;
  const visaTotal = REG.cartaoInfinite.total;
  const mbTotal = REG.cartaoMB.total;
  const liquido = Math.round((visaTotal + mbTotal - cvComprometido)*100)/100;
  const reposicao = cvDisponivel < 0 ? Math.round(Math.abs(cvDisponivel)*100)/100 : 0;
  new Chart(document.getElementById('g_cCartoesLiquidoCV'), {
    type:'bar',
    plugins:[barValuePlugin],
    data:{labels:['Mastercard Black','Visa Infinite','Caixa Variável (comprometido)','Líquido não coberto','Disponível real em caixa','Reposição necessária'],
      datasets:[{data:[mbTotal, visaTotal, -cvComprometido, liquido, cvDisponivel, reposicao],
      backgroundColor:['#9085e9','#3987e5','#e2554f','#e8a63a','#34c98a','#e0574c'],borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60,left:10}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
      scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
        y:{grid:{display:false},ticks:{font:{size:10}}}}}
  });
})();

// 01 — Composição do Total Operacional (7 categorias confirmadas com o Wallace em 15/07/2026)
// Boletos=2600 (APORTE_BOLETOS, nao o total bruto do livro LRB) · Prov. MP=471,47 (MP pessoal, nao o total bruto do LRMP)
const totalOpLabels = ['Boletos','Parcelas','Consórcios','Recorrências','Aportes Pat.','Prov. MP','Assinaturas'];
const totalOpData = Object.values(REG.totalOpDetalhe);
const totalOpColors = ['#3987e5','#9085e9','#e2554f','#34c98a','#e8a63a','#6f6d66','#e879b0'];

new Chart(document.getElementById('g_cTotalOp'), {
  type:'doughnut',
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderColor:'#16181b',borderWidth:3}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart(document.getElementById('g_cTotalOpBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:totalOpLabels,datasets:[{data:totalOpData,backgroundColor:totalOpColors,borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:60}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

new Chart(document.getElementById('g_cVariavel'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:['Saldo real','Comprometido','Disponível'],
    datasets:[{data:[REG.caixaVariavel.saldoReal,REG.caixaVariavel.comprometido,REG.caixaVariavel.disponivel],
    backgroundColor:['#3987e5','#e8a63a','#34c98a'],borderRadius:5}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}}}}
});

// 03 — Progresso das metas patrimoniais (corrigido 15/07/2026 com o Wallace; Escola Julio removida 18/07/2026 V85).
// Caixa Lance NÃO tem meta propria - e um pulmao que acumula ate um valor relevante para investir
// (evitar taxa de corretagem desproporcional em aportes pequenos), nao entra neste grafico.
// BTG/Necton tambem nao tem meta propria - contribui para a Meta do Milhao (R$1.000.000).
// Escola de Julio NAO entra aqui (removida do Patrimonio Total desde V47, 16/07/2026) - e uma
// reserva/caixa propria, acompanhada na secao 14 (Escola de Julio), nao e uma "meta patrimonial".
// As 3 metas reais monitoradas aqui: Meta do Milhao (patrimonio total), Casa Nova (consorcio),
// Consorcio Auto.
const metasNomes = ['Meta Milhão','Casa Nova','Consórcio Auto'];
const metasPct = [REG.metasPatrimoniais.milhaoPct, REG.metasPatrimoniais.casaNovaPct, REG.metasPatrimoniais.autoPct];
const pctBR = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
// V139: rotulo curto e detalhe completo agora GERADOS a partir do REG/VARS, nao mais strings escritas a
// mao (a versao anterior tinha "11,54% do milhao" congelado no texto, desatualizado desde a correcao
// do PATRIMONIO_TOTAL na V135 - o numero do grafico ja tinha corrigido, so o texto do label nao).
const metasRaw = [
  pctBR(REG.metasPatrimoniais.milhaoPct)+'% do milhão',
  pctBR(REG.consorcioCasaNova.pagoPct)+'% pago',
  pctBR(REG.metasPatrimoniais.autoPct)+'% pago'
];
const metasDetalhe = [
  pctBR(REG.metasPatrimoniais.milhaoPct)+'% · '+fmt(REG.patrimonio.total)+' de '+fmt(REG.patrimonio.metaMilhao),
  'Consórcio Casa Nova (cota 12, grupo I0464) · quitação '+fmt(REG.consorcioCasaNova.quitacaoValor)+' ('+pctBR(REG.consorcioCasaNova.quitacaoPct)+'%)',
  'Carta '+fmt(VARS.consorcioAutoCartaCredito)+', saldo devedor '+fmt(REG.balanco.passivos.consorcioAutoContemplado)
];

new Chart(document.getElementById('g_cMetas'), {
  type:'bar',
  plugins:[metaValuePlugin],
  data:{labels:metasNomes,
    datasets:[{data:metasPct, raw:metasRaw,
    backgroundColor:['#9085e9','#3987e5','#34c98a'],borderRadius:4}]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:70,top:15}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>metasDetalhe[c.dataIndex]}}},
    scales:{x:{grid:{color:grid},max:105,ticks:{callback:v=>v+'%',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10}}}}}
});

const gTotalOpSeries = alignSeries(REG.evolucao.totalOperacional);
const gTotalOpRange = yRange(gTotalOpSeries);
new Chart(document.getElementById('g_cEvol'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMeses(12),
    datasets:[{data:gTotalOpSeries,
    borderColor:'#3987e5',backgroundColor:'rgba(57,135,229,0.08)',
    borderWidth:2.5,pointBackgroundColor:'#3987e5',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:5,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gTotalOpRange.min,max:gTotalOpRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

const gNecLiqSeries = alignSeries(REG.evolucao.necessidadeLiquida);
const gNecLiqRange = yRange(gNecLiqSeries);
new Chart(document.getElementById('g_cNecessidadeLiquida'), {
  type:'line',
  plugins:[valueLeaderPlugin],
  data:{labels:gerarMeses(12),
    datasets:[{data:gNecLiqSeries,
    borderColor:'#34c98a',backgroundColor:'rgba(52,201,138,0.08)',
    borderWidth:2,pointBackgroundColor:'#34c98a',pointBorderColor:'#16181b',
    pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:40}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:grid},min:gNecLiqRange.min,max:gNecLiqRange.max,ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:10}}}}}
});

// 07 — Caixas operacionais vs metas (lista confirmada pelo Wallace em 15/07/2026 — sem PIX Wallace,
// extinta em 13/07/2026, e sem Fatura Wärtsilä: não é uma caixa operacional com meta própria, é um
// repasse de reembolso (P3: Reembolsos Wärtsilä → Fatura Wärtsilä → Mercado Pago → Caixa Lance,
// nunca "pertence" a uma caixa - ver Princípios Contábeis no SWP_INPUT). Layout horizontal para
// caber os 7 nomes sem cortar, com o valor ao final de cada barra.
const caixasLabels = ['Boletos','PIX Vanessa','Manutenção','Eventos e Viagens','Saúde Família','Aniversário Júlio','Seguro/Emplacamento','Escola Júlio'];
const caixasSaldo = Object.values(REG.caixasOperacionais).map(c=>c.saldo);
const caixasMeta =  Object.values(REG.caixasOperacionais).map(c=>c.meta);
const caixasNotas = [
  '23,6% da meta',
  '0% da meta (zerada)',
  'LREI0001 quitado (21/07) — depósito direto do reembolso Wärtsilä',
  'Suporte à Variável (R$167,40) para o mesmo custo: visita família Vanessa/Natal-RN — não é empréstimo',
  '2x Júlio + 1x Vanessa/ano · aporte R$100/mês',
  '50% da meta · aporte R$200/mês até 14/09',
  'Aporte R$425/mês (permanente)',
  '5,5% da meta · meta R$9.236,00, fora da Meta do Milhão (P5)'
];

const caixasValuePlugin = {
  id:'caixasValuePlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    ctx.save();
    ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds,di)=>{
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar,i)=>{
        ctx.fillStyle = di===0 ? '#3987e5' : '#e8a63a';
        ctx.fillText(fmt(ds.data[i]), bar.x + 6, bar.y);
      });
    });
    ctx.restore();
  }
};

new Chart(document.getElementById('g_cCaixas'), {
  type:'bar',
  plugins:[caixasValuePlugin],
  data:{labels:caixasLabels,
    datasets:[
      {label:'Saldo atual', data:caixasSaldo, backgroundColor:'#3987e5', borderRadius:3},
      {label:'Meta', data:caixasMeta, backgroundColor:'#e8a63a', borderRadius:3}
    ]},
  options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:70}},
    barPercentage:0.7,categoryPercentage:0.65,
    plugins:{legend:legendStd,tooltip:{callbacks:{
      label:c=>c.dataset.label+': '+fmt(c.raw)+(c.datasetIndex===0 ? ' — '+caixasNotas[c.dataIndex] : '')
    }}},
    scales:{x:{grid:{color:grid},ticks:{callback:v=>'R$'+Math.round(v/100)/10+'k',font:{size:10}}},
      y:{grid:{display:false},ticks:{font:{size:10.5}}}}}
});

// 08 — Alivio de pressao: soma dos aportes das caixas incrementais (Aniversario Julio, Escola Julio,
// Saude Familia, Seguro/Emplacamento) mes a mes, ate cada uma zerar/trocar seu aporte ao bater meta/prazo.
// MESCLADO 20/07/2026 (pedido do usuario, "nao gostei de grafico separado"): janela FIXA de 18 meses
// (Jul/26-Dez/27, nao usa gerarMeses/alignSeries porque este e um plano fixo no tempo, nao uma janela
// rolante a partir de "hoje") pra caber tanto o ciclo atual quanto a virada do ciclo 2027 confirmada pelo
// usuario: Escola de Julio reinicia do zero em Jan/27 (R$839,64/mes x 11 meses = R$9.236,04, bate o teto
// R$9.236,00 em novembro). Seguro/Emplacamento e um ciclo CONTINUO de 12 meses desde Jan/26, mesma taxa
// (R$425/mes) ao virar pro ciclo 2027 - por isso nunca gera evento de alivio/aumento, so continua.
const alivioLabels = ['Jul/26','Ago/26','Set/26','Out/26','Nov/26','Dez/26','Jan/27','Fev/27','Mar/27','Abr/27','Mai/27','Jun/27','Jul/27','Ago/27','Set/27','Out/27','Nov/27','Dez/27'];
const ANIVERSARIO_JULIO_APORTE = 200, ESCOLA_JULIO_ATUAL_APORTE = 500, SAUDE_FAMILIA_APORTE = 100,
      SEGURO_EMPLACAMENTO_APORTE = VARS.seguroEmplacamentoAporte, ESCOLA_JULIO_2027_APORTE = VARS.escolaJulio2027Aporte;
const alivioData = alivioLabels.map((_,i)=>{
  let v = SEGURO_EMPLACAMENTO_APORTE; // ciclo continuo, sempre ativo nos 18 meses
  if(i < 2) v += ANIVERSARIO_JULIO_APORTE;       // completa Set/26 (14/09)
  if(i < 4) v += ESCOLA_JULIO_ATUAL_APORTE;      // completa Nov/26 (01/11, coberto por 13o/ferias)
  if(i < 16) v += SAUDE_FAMILIA_APORTE;          // projeta completar ~Nov/27 (16 meses, ritmo atual)
  if(i >= 6 && i <= 16) v += ESCOLA_JULIO_2027_APORTE; // ciclo 2027: Jan/27-Nov/27 (11 meses)
  return Math.round(v*100)/100;
});
const alivioEventos = {
  2: {tipo:'alivio',  texto:'Aniversário Júlio completa (14/09) — R$200,00/mês liberados'},
  4: {tipo:'alivio',  texto:'Escola Júlio (ciclo atual) completa (01/11) — R$500,00/mês liberados'},
  6: {tipo:'aumento', texto:'Escola Júlio 2027 inicia (do zero) — +R$839,64/mês'},
  16:{tipo:'alivio',  texto:'Saúde Família + Escola Júlio 2027 completam — R$939,64/mês liberados'}
};

const alivioStepPlugin = {
  id:'alivioStepPlugin',
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8e6df';
    meta.data.forEach((pt,i)=>{
      // CORRIGIDO 20/07/2026: com 18 pontos (janela estendida), rotulo em TODO ponto ficava
      // atropelado/sobreposto quando varios meses seguidos tem o mesmo valor (plato). Agora so
      // desenha o valor no primeiro ponto de cada plato (inicio) e no ultimo ponto da serie.
      const mudou = i === 0 || alivioData[i] !== alivioData[i-1];
      const ultimo = i === meta.data.length - 1;
      if(mudou || ultimo){
        ctx.fillText(fmt(alivioData[i]), pt.x, pt.y - 12);
      }
      const ev = alivioEventos[i];
      if(ev){
        ctx.fillStyle = ev.tipo === 'alivio' ? '#34c98a' : '#e0574c';
        ctx.font = "600 8px -apple-system, 'Segoe UI', Roboto, sans-serif";
        const seta = ev.tipo === 'alivio' ? '↓ ' : '↑ ';
        ctx.fillText(seta+ev.texto.split(' — ')[1], pt.x, pt.y + 18);
        ctx.fillStyle = '#e8e6df';
        ctx.font = "600 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      }
    });
    ctx.restore();
  }
};

new Chart(document.getElementById('g_cAlivio'), {
  type:'line',
  plugins:[alivioStepPlugin],
  data:{labels:alivioLabels,
    datasets:[{data:alivioData, stepped:'before',
    borderColor:'#e879b0', backgroundColor:'rgba(232,121,176,0.08)',
    borderWidth:2.5, pointBackgroundColor:'#e879b0', pointBorderColor:'#16181b',
    pointBorderWidth:2, pointRadius:5, fill:true}]},
  options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:28,bottom:18}},
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.raw)+' em aportes incrementais ativos'}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
      y:{grid:{color:grid},min:0,max:yRange(alivioData,0.15).max,ticks:{callback:v=>'R$'+v,font:{size:10}}}}}
});
})();

// ===== Operação Superávit Normal (Cenarios, secao 05) - mesmo piso do Deficit Zero, renda media 12m =====
(function(){
  const grid2b = '#2a2d31';
  function fmt0b(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}

  // CORRIGIDO 16/07/2026 (usuario): (1) nao usar mais o piso absoluto (gasto minimo essencial) como
  // comparacao - usar a Necessidade Total BRUTA (cenario "paga tudo normalmente", mesma serie do card
  // "Cenario normal" da secao 04) porque este grafico representa o cenario normal, nao o de sobrevivencia.
  // (2) CORRIGIDO 16/07/2026 (2 rodadas): Jul/26 usa o liquido CALCULADO pelo Estimador de Salario
  // (R$16.048,51), nao o salario ja recebido/gasto do ciclo anterior. Meses seguintes usam a MEDIANA de
  // 12 meses (R$18.283,64), NAO a media (R$20.740,48) - usuario forneceu analise mostrando que a media e
  // puxada para cima por 3 meses excepcionais (Dez/25 ferias+13o, Jun/26, Jan/26) e nao e representativa
  // como premissa conservadora. Workflow pretendido: mes a mes, substituir o valor conservador pelo real
  // assim que o contracheque chegar (atualizar REG.superavitNormal.liquido[i], nunca noutro lugar).
  // Necessidade Total Bruta projetada = PROJ_TOTAL_OP_* (SWP_INPUT, reconstruida 16/07/2026 a partir do
  // livro LRP) + Orcamento Operacional R$3.200 constante. Mar/27 em diante mantido constante (sem dados
  // de parcelamento/aporte alem desse horizonte).
  // AUTOMATIZADO 19/07/2026: resolve a serie Liquido em runtime (real > projetado > mediana) via
  // helper global liquidoMes(i), em vez de ler um array hardcoded. "Vivo" no sentido pedido pelo
  // usuario: qualquer edicao em REG.superavitNormal.liquidoProjetado/liquidoReal se reflete aqui
  // sem precisar recalcular a mao os 12 valores - so o(s) mes(es) com dado novo precisa(m) de entrada.
  const snLabels = gerarMeses(12);
  const snLiquido = alignSeries(snLabels.map((_,i)=>liquidoMes(i)));
  const snNecessidade = alignSeries(REG.superavitNormal.necessidade);
  const snDiferenca = snNecessidade.map((n,i)=>Math.round((snLiquido[i]-n)*100)/100);

  // Rotulo compacto em "k" (em vez de milhar completo) - o valor de Julho (salario real) e bem maior que
  // os demais (media), o que gerava sobreposicao de texto com o formato anterior "+13.371" (7 caracteres
  // largos demais para 12 barras). Formato "+19,4k" e fixo e mais estreito.
  const fmtK = v => '+'+(v/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'k';

  const snDataLabelPlugin = {
    id:'snDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 9.5px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        ctx.fillStyle = '#34c98a';
        ctx.fillText(fmtK(snDiferenca[i]), bar.x, bar.y - 7);
      });
      ctx.restore();
    }
  };

  new Chart(document.getElementById('cSuperavitNormal'), {
    type:'bar',
    plugins:[snDataLabelPlugin],
    data:{labels:snLabels,
      datasets:[{data:snDiferenca,
        backgroundColor:'#34c98a',
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Líquido: '+fmt(snLiquido[i]),'Necessidade Total (paga tudo): '+fmt(snNecessidade[i]),'Superávit: '+fmt(snDiferenca[i])];}
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
        y:{grid:{color:grid2b},ticks:{callback:v=>Math.round(v/1000)+'k',font:{size:9.5}}}}}
  });

  const snTbody = document.getElementById('snTableBody');
  if(snTbody){
    snTbody.innerHTML = snLabels.map((m,i)=>{
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+m+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snLiquido[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snNecessidade[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:var(--green)">+'+fmt0b(snDiferenca[i])+'</td>'+
        '</tr>';
    }).join('');
  }
})();

// ===== Operação Déficit Zero e Energia Solar (Cenarios, secoes 06/07) =====
(function(){
  const grid2 = '#2a2d31';
    function fmt0(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}
  const legendStd2 = {position:'bottom',labels:{boxWidth:8,padding:10,font:{size:10}}};

  // Piso corrigido 15/07/2026: Parcelas Visa Infinite E Mercado Pago pessoal declinam (parcela
  // 3/6 do MP termina ~Set/26; a de 10/24 avança devagar). Consorcio NAO tem previsao de acabar
  // (confirmado pelo usuario) - fica fixo, assim como Boletos/Recorrencias/Assinaturas.
  // Liquido sem trabalhar fixo R$7.667,73 (12 contracheques reais).
  const dzLabels = gerarMeses(12);
  const dzLiquido = REG.deficitZero.liquidoSemTrabalhar;
  const dzPiso = alignSeries(REG.deficitZero.piso);
  const dzDeficit = dzPiso.map(p=>Math.round((dzLiquido-p)*100)/100);

  const dzDataLabelPlugin = {
    id:'dzDataLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "700 11px -apple-system, 'Segoe UI', Roboto, sans-serif";
      meta.data.forEach((bar,i)=>{
        const d = dzDeficit[i];
        ctx.fillStyle = d<0 ? '#e2554f' : '#34c98a';
        const label = (d<0?'−':'+')+fmt0(Math.abs(d));
        ctx.fillText(label, bar.x, d>=0 ? bar.y - 8 : bar.y + 16);
      });
      ctx.restore();
    }
  };

  new Chart(document.getElementById('cDeficitZero'), {
    type:'bar',
    plugins:[dzDataLabelPlugin],
    data:{labels:dzLabels,
      datasets:[{data:dzDeficit,
        backgroundColor: dzDeficit.map(v=>v<0?'#e2554f':'#34c98a'),
        borderRadius:4, barPercentage:0.72, categoryPercentage:0.82}]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:22,bottom:6}},
      plugins:{legend:{display:false},tooltip:{callbacks:{
        label:c=>{const i=c.dataIndex; return ['Líquido sem trabalhar: '+fmt(dzLiquido),'Piso absoluto: '+fmt(dzPiso[i]),(dzDeficit[i]<0?'Déficit: ':'Superávit: ')+fmt(Math.abs(dzDeficit[i]))];}
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9}}},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  });

  // Tabela HTML organizada abaixo do grafico - liquido, piso e diferenca por mes, texto real
  // (nao desenhado em canvas), garante legibilidade sem risco de sobreposicao.
  const dzTbody = document.getElementById('dzTableBody');
  if(dzTbody){
    dzTbody.innerHTML = dzLabels.map((m,i)=>{
      const d = dzDeficit[i];
      const cor = d<0 ? 'var(--red)' : 'var(--green)';
      const sinal = d<0 ? '−' : '+';
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+m+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzLiquido)+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzPiso[i])+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+cor+'">'+sinal+fmt0(Math.abs(d))+'</td>'+
        '</tr>';
    }).join('');
  }

  // Energia: comparacao mes a mes, ano anterior (real) vs este ano (projetado com solar).
  // Tarifa real da fatura Jun/2026 (R$322,99/304kWh=R$1,0625/kWh, ICMS+PIS/COFINS ja embutidos).
  // So apartamento do Wallace. Fonte Jul/25-Abr/26: Projeto_Solar_Wallace_Consolidado.md.
  // Mai/26: interpolado entre Abr/26 e Jun/26 (nao ha leitura direta) - marcado com *.
  // Jun/26: real, confirmado na fatura Energisa.
  const mesesPares = ['Jul','Ago','Set','Out','Nov','Dez','Jan','Fev','Mar','Abr','Mai*','Jun'];
  const kwhAnoAnterior = [321,262,279,297,405,265,211,273,330,343,323,304];
  const tarifa = VARS.faturaEnergisaValor/VARS.faturaEnergisaKwh;
  const anoAnterior = kwhAnoAnterior.map(k=>Math.round(k*tarifa*100)/100);
  const valorPosSolar = Math.round((VARS.consumoMinimoComSolarKwh*tarifa + VARS.taxaMinimaEnergisa)*100)/100;
  const esteAno = mesesPares.map(()=>valorPosSolar);

  const energiaLabelPlugin = {
    id:'energiaLabelPlugin',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const m0 = chart.getDatasetMeta(0), m1 = chart.getDatasetMeta(1);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = "600 8px -apple-system, 'Segoe UI', Roboto, sans-serif";
      m0.data.forEach((bar,i)=>{
        ctx.fillStyle = '#e8a63a';
        ctx.fillText(fmt0(anoAnterior[i]), bar.x, bar.y - 5);
      });
      m1.data.forEach((bar,i)=>{
        ctx.fillStyle = '#34c98a';
        ctx.fillText(fmt0(esteAno[i]), bar.x, bar.y - 5);
        const diff = anoAnterior[i] - esteAno[i];
        const xCenter = (chart.getDatasetMeta(0).data[i].x + bar.x)/2;
        const yTop = Math.min(chart.getDatasetMeta(0).data[i].y, bar.y) - 18;
        ctx.font = "700 9px -apple-system, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = '#3987e5';
        ctx.fillText('−'+fmt0(diff), xCenter, yTop);
        ctx.font = "600 8px -apple-system, 'Segoe UI', Roboto, sans-serif";
      });
      ctx.restore();
    }
  };
  new Chart(document.getElementById('cEnergiaSolar'), {
    type:'bar',
    plugins:[energiaLabelPlugin],
    data:{labels:mesesPares,
      datasets:[
        {label:'Ano anterior (real, sem solar)', data:anoAnterior, backgroundColor:'#e8a63a', borderRadius:3},
        {label:'Este ano (projeção, com solar)', data:esteAno, backgroundColor:'#34c98a', borderRadius:3}
      ]},
    options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:34}},
      plugins:{legend:legendStd2,tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmt(c.raw)}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:9.5}}},
        y:{grid:{color:grid2},ticks:{callback:v=>'R$'+v,font:{size:9.5}}}}}
  });
})();

// ===== NOVO 22/07/2026 (V133) - modo apresentacao (esconder valores) =====
// Antecipado do plano de 25/07 a pedido do usuario ("escolha as mais simples e ja implemente").
// Botao flutuante (topo direito, fixo em todas as paginas) que aplica blur em todos os valores
// monetarios (classes .v/.val/.r, ja usadas globalmente no painel) sem remover labels/estrutura -
// util pra mostrar o painel pra terceiros sem expor numeros. Preferencia salva no localStorage
// (arquivo estatico rodando no navegador do proprio usuario, nao e artifact do Claude.ai - ok usar).
function toggleEsconderValores(){
  const ativo = document.body.classList.toggle('esconder-valores');
  const btn = document.getElementById('btnEsconderValores');
  if(btn){
    btn.textContent = ativo ? '🙈' : '👁️';
    btn.classList.toggle('ativo', ativo);
  }
  try { localStorage.setItem('wallace_esconder_valores', ativo ? '1' : '0'); } catch(e) {}
}
document.addEventListener('DOMContentLoaded', () => {
  try {
    if(localStorage.getItem('wallace_esconder_valores') === '1'){
      document.body.classList.add('esconder-valores');
      const btn = document.getElementById('btnEsconderValores');
      if(btn){ btn.textContent = '🙈'; btn.classList.add('ativo'); }
    }
  } catch(e) {}
});
