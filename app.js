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

const REG = {
  patrimonio: {
    total: 115373.63,          // CORRIGIDO 17/07/2026 (V57): Reserva 100066.05 + BTG 14673.40 + Caixa Lance 204.48 + Necton Conta Corrente 429.70. Escola Julio NAO entra (removida desde V47/16-07 no ERP - este card estava desatualizado, ainda somava Escola Julio e nao tinha Necton CC).
    metaMilhaoPct: 11.54,       // Progresso Meta Milhao = total / R$1.000.000
    metaMilhao: 1000000,
    metaEscolaJulio: 9236.00
  },
  operacional: {
    salario: 33708.78,
    reembolsosAReceber: 2429.59,
    reembolsoCicloTotal: 4914.98,        // Recebidos (2.485,39) + A Receber (2.429,59) - regra V50
    reembolsoSobraPessoal: 2025.53,      // SOBRESCRITO por recalcularAgregadosDerivados() logo apos o REG - este valor aqui e so o ultimo snapshot conhecido, para leitura humana. Nao editar sem conferir reembolsoCicloTotal/reembolsoPagaMPCorporativo/totalOpDetalhe.provMP.
    reembolsoPagaMPCorporativo: 1277.88, // Transporte corporativo Recife (TXMP000007+008)
    entradasTotais: 36138.37,
    totalOperacional: 11658.24,     // SOBRESCRITO por recalcularAgregadosDerivados() = soma de totalOpDetalhe. Editar os componentes, nao este numero.
    orcamentoOperacional: 3200.00,
    necessidadeTotalBruta: 14858.24,     // SOBRESCRITO por recalcularAgregadosDerivados() = totalOperacional + orcamentoOperacional.
    coberturaGarantida: 954.90,     // Sem alteracao.
    necessidadeLiquida: 13903.34,     // SOBRESCRITO por recalcularAgregadosDerivados() = necessidadeTotalBruta - coberturaGarantida.
    saldoCiclo: 21280.13,     // SOBRESCRITO por recalcularAgregadosDerivados() = balanco.fluxo.entradas - necessidadeTotalBruta.
    modoOperacional: 'Alto',
    // totalOperacionalMar27 removido (16/07/2026): era um 3o registrador duplicado do mesmo valor
    // ja presente em evolucao.totalOperacional[ultimo ponto] - agora calculado dinamicamente no hydrate().
  },
  caixaVariavel: {
    saldoReal: 2647.77,     // V82 (18/07/2026): -R$60,00 (TX000109, PIX Edgley). Era R$2.707,77.
    comprometido: 3735.54,  // 20/07/2026: -R$19,90 (TX000115 saiu de LRW, virou TXS000013/LRS). = LRW(3291,40)+LRV(444,14). Era R$3.755,44.
    disponivel: -1087.77,   // 20/07/2026: SALDO_REAL(2647.77)-COMPROMETIDO(3735.54). Era -R$1.107,67.
    tetoOficial: 2000.00,   // meta oficial (usada no Aporte=Meta-Saldo). NAO muda com a tolerancia temporaria.
    tolerenciaTemp: 1500.00, // V78 (18/07/2026): tolerancia temporaria ate o fim do ciclo (viagem familia Vanessa) - cobre TODOS os gastos da caixa, nao so os tageados como viagem. Recomposicao prevista: reembolso Wartsilia ou salario 25/07. Zerar este campo (0) quando a tolerancia acabar.
  },
  visa: {
    totalComprometido: 10912.40,   // 20/07/2026: Infinite(9.092,21)+MB(1.820,19). -R$19,90 (TX000115 saiu do Visa Infinite, virou assinatura). Era R$10.932,30.
    pessoal: 10428.97   // totalComprometido - LRC (R$483,43, corporativo). Era R$10.448,87.
  },
  cartaoInfinite: { total: 9092.21 },   // 20/07/2026: -R$19,90 (TX000115 reclassificado para LRS). Era R$9.112,11.
  cartaoMB: { total: 1820.19 },
  mercadoPago: 1751.16,     // RECONCILIADO 16/07/2026 (V44)
  faturaWartsila: 656.67,
  metaInvestimento: { investido: 11701.51, meta: 6741.76, excedente: 4959.75 }, // CORRIGIDO 20/07/2026 (usuario apontou): excedente = investido - meta = 11.701,51-6.741,76 = 4.959,75, nao 4.958,75 (erro de subtracao de R$1,00 - nao tinha relacao com o deposito de ativacao Necton, foi so um erro aritmetico mesmo). meta = 20% do salario Jun/26 (33.708,78).
  lrei0001: 178.64,
  suporteCoIrmaEventos: 167.40, // 13/07/2026, Eventos->Variavel, mesmo proposito (visita familia Vanessa) - nao e LREI

  // ===== FASE 2 (16/07/2026) - graficos de composicao (g_cTotalOp, g_cVisa, g_cMetas, g_cCaixas) =====
  patrimonioDetalhe: { reserva:100066.05, btg:14673.40, caixaLance:204.48, nectonContaCorrente:429.70 }, // CORRIGIDO 17/07/2026 (V57): estes 4 somam exatamente patrimonio.total. Escola Julio NAO entra aqui desde V47 (ver escolaJulioSaldo abaixo, campo separado)
  escolaJulioSaldo: 505.64, // fora do Patrimonio Total/Meta Milhao desde V47 (16/07/2026) - existe como reserva/caixa propria, nao patrimonio liquido de gestao ativa
  visaDetalhe: { parcelas:2500.46, consorcios:1950.77, wallace:2129.46, recorrencias:1194.53, corp:483.43, assinaturas:409.32, vanessa:444.14 }, // 20/07/2026: wallace -R$19,90, assinaturas +R$19,90 (TX000115 reclassificado LRW->LRS, Meli+). Eram wallace R$2.149,36 / assinaturas R$389,42.
  mbDetalhe: { parcelas:0, consorcios:0, wallace:1161.94, recorrencias:614.45, corp:0, assinaturas:43.80, vanessa:0 }, // 19/07/2026: wallace +R$12,79 (TX000117, H57Store, cartao fisico 2244). Era R$1.149,15.
  totalOpDetalhe: { boletos:2600, parcelas:2500.46, consorcios:1950.77, recorrencias:1808.98, aportesPat:1893.34, provMP:471.47, assinaturas:453.12 }, // 20/07/2026: assinaturas +R$19,90 (TXS000013, Meli+, reclassificado de TX000115/LRW). Era R$433,22.
  metasPatrimoniais: { milhaoPct:11.54, casaNovaPct:0.42, autoPct:75.22, escolaPct:5.47 }, // CORRIGIDO 17/07/2026 (V57): casaNovaPct e autoPct estavam desatualizados desde V48 (16/07) - consorcios sao Porto Seguro, casa 0,42% pago (quitacao R$550.601,43/99,58%), auto 75,22% pago (carta R$76.670,02, saldo devedor R$18.998,83)
  caixasOperacionais: {
    boletos:            { saldo:821.51, meta:2600 },
    pixVanessa:          { saldo:0.00,   meta:1200 },  // RECONCILIADO 16/07/2026 (V44): cofrinho zerado apos TX000083+085
    manutencao:          { saldo:0,      meta:2000 },
    eventos:             { saldo:0,      meta:2000 },
    saudeFamilia:        { saldo:0,      meta:1600 },
    aniversarioJulio:    { saldo:0,      meta:400 },
    seguroEmplacamento:  { saldo:0,      meta:5100 }
  },

  // ===== FASE 3 (16/07/2026) - pagina Cenarios inteira + totais agregados dos livros razao =====
  reserva: {
    atual: 100066.05,
    piso: 9223.66 // "so o piso" - gasto minimo essencial, nao inclui aportes patrimoniais (conceito distinto de necessidadeTotalBruta)
  },
  estimador: {
    liquidoProjetadoProximoCiclo: 16048.51,  // Estimador de Salario - ciclo que comeca 25/07 (Ago/26)
    necessidadeLiquidaProximoCiclo: 11996.97 // 2o ponto da serie de projecao (Ago/26)
  },
  deficitZero: {
    liquidoSemTrabalhar: 7667.73, // REGRA_CENARIO_FICOU_EM_CASA
    piso: [9223.66,7821.63,7369.83,7088.69,7320.83,7220.83,6979.37,6979.37,6979.37,6979.37,6979.37,6979.37]
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
    necessidade: [14317.00,12951.87,12620.07,12138.93,11871.07,11771.07,11581.08,11581.08,11581.08,11581.08,11581.08,11581.08]
  },
  livrosRazaoTotais: {
    // CORRIGIDO 17/07/2026 (V68): bloco inteiro estava parado desde 16/07 - nenhuma das correcoes V56-V68 tinha chegado aqui. Realinhado com os registradores LIVRO_XXX_TOTAL oficiais do ERP.
    LRW:   { total:3291.40, qtd:55 }, // 20/07/2026: -R$19,90 (TX000115 reclassificado para LRS - é a assinatura Meli+, não compra avulsa). Era R$3.311,30/56.
    LRV:   { total:444.14,  qtd:17 }, // 19/07/2026: +R$6,50 (TX000118, H57Store, cartao 4845). Era R$437,64/16.
    LRB:   { total:2598.58, qtd:9  },
    LRP:   { total:2500.46, qtd:16 }, // CORRIGIDO 19/07/2026: -R$1.808,91 (reversao das 9 parcelas fabricadas do Tokio Marine, TXP000016-024 removidas - so a 7/10 real, TXP000008, existe). Era R$4.309,37/25.
    LRS:   { total:453.12,  qtd:12 }, // 20/07/2026: +R$19,90 (TXS000013, Meli+ Mercado Livre, reclassificado de TX000115/LRW). Era R$433,22/11.
    LRR:   { total:1808.98, qtd:7  }, // V69: Brisanet corrigido -R$1,86
    LRCON: { total:1950.77, qtd:2  },
    LRC:   { total:483.43,  qtd:6  },
    LRMP:  { total:1791.93, qtd:9  }, // V59: +TXMP000010
    LRCV:  { total:1045.60,  qtd:21 }, // V82: +TX000109 (PIX Edgley, R$60,00)
    LRPV:  { total:-135.66, qtd:16 }
  },

  reembolsos: { recebidosNoCiclo: 2485.39 },

  // ===== QUALIDADE/REGRAS DE NEGOCIO (18/07/2026, V79) - "linter" enxuto: nao guarda transacao
  // por transacao (REG so tem agregados, por design - inflar isso pesaria o app.js), mas expoe os
  // poucos contadores/flags que JA sao mantidos no ERP a cada sessao. Atualizar manualmente sempre
  // que o numero mudar no ERP (mesmo padrao de todo o resto do REG).
  qualidade: {
    txSemData: 0,          // contador oficial do ERP (aba AUDITORIA_AUTOMATICA / historico SWP_INPUT). 0 = zerado em 17/07/2026 (V69).
    lreiAtivos: 1,          // quantidade de emprestimos internos (LREI) em aberto
    tetoTemporarioAtivo: true // reflete caixaVariavel.tolerenciaTemp > 0
  },
  cenarioHistorico: {
    piorMes: 7649.62,   // SALARIO_MIN_12M (set/2025)
    mediana: 18283.64,  // SALARIO_MEDIANA_12M
    media: 20740.48,    // SALARIO_MEDIA_12M
    mediaPonderada12M: 17969.27, // ADICIONADO 19/07/2026 (pedido do usuario, fallback do liquidoMes quando dia<12 do mes): media dos 12 LIQUIDO_RECEBIDO (aba HISTORICO_CONTRACHEQUES), com peso 0.3 nos 3 meses ja documentados como atipicos (Dez/25 13o+ferias, Jan/26 ferias parcial, Jun/26 base do Estimador) e peso 1.0 nos outros 9 - mesma logica que ja justificava usar mediana em vez de media simples, agora expressa como peso em vez de estatistica de posicao. Metodologia explicita, ajustavel se o usuario quiser outra ponderacao.
    desvioPadrao: 9273.21
  },
  evolucao: {
    // PADRAO 12 MESES ROLANTE (V50, item 4): series estendidas de 8 para 12 pontos, repetindo o
    // ultimo valor conhecido (mesma logica conservadora ja usada aqui - nao ha dado real para meses
    // tao distantes, nunca chutado um numero novo, so mantido o ultimo). Antes pulava Fev/27; agora
    // e sequencial, os rotulos vem de gerarMeses(12) - dinamico, sempre a partir do mes atual.
    totalOperacional:   [11658.24,9751.87,9420.07,8938.93,8671.07,8571.07,8381.08,8381.08,8381.08,8381.08,8381.08,8381.08], // CORRIGIDO 19/07/2026: 1o ponto (ciclo atual) -R$1.808,91 (reversao Tokio Marine, ver REG.operacional.totalOperacional). Pontos futuros (Ago/26 em diante) NAO recalculados - baseline anterior, ja documentado como limitacao pendente desde V50/V51 (podem ainda incluir as parcelas 8-10 do Tokio removidas hoje - revisao futura).
    necessidadeLiquida: [13903.34,11996.97,11665.17,11184.03,10916.17,10816.17,10626.18,10626.18,10626.18,10626.18,10626.18,10626.18] // CORRIGIDO 19/07/2026: 1o ponto (ciclo atual) -R$1.808,91 (reversao Tokio Marine). Era R$15.712,25.
  },

  // ===== BALANÇO PATRIMONIAL (Reestruturação V2.0, 16/07/2026 - V40/V41/V42) =====
  balanco: {
    fisico: { casa:110000.00, apartamento:155000.00, jazigo:11000.00, solar:14800.00, carro:140000.00, total:430800.00 },
    financeiro: { reserva:100066.05, btg:14673.40, nectonContaCorrente:429.70, consorcioCasaPago:2898.90, total:118068.05 },
    pgbl: 132214.74,   // nao liquido, fora do total financeiro e da Meta do Milhao
    fgts: 77683.60,    // nao liquido, fora do total financeiro e da Meta do Milhao
    passivos: { financiamentoCasa:61326.91, consorcioAutoContemplado:18998.83, total:80325.74 },
    ativosTotal: 548868.05,
    patrimonioLiquido: 468542.31,
    reservas: {
      boletos:0, escolaJulio:505.64, caixaLance:204.48, manutencao:0, eventos:0,
      churrasco:0, saudeFamilia:0, seguroEmplacamento:0, aniversarioJulio:0, total:710.12
    }, // V85: Caixa Boletos MOVIDA para operacional (usuario: e um pote de trabalho mensal, nao meta patrimonial)
    operacional: { caixaVariavel:2749.77, pixVanessaSaldoReal:159.96, caixaBoletos:821.51, total:3731.24 },
    obrigacoes: { visa:10932.30, mastercardBlack:1661.01, mercadoPago:1791.93, wartsila:656.67, total:15041.91 }, // SOBRESCRITO por recalcularAgregadosDerivados() = mesma fonte do card Cartoes (REG.visa.totalComprometido), evita 3a copia divergente (V85 ja tinha corrigido uma 2a copia).
    fluxo: { entradas:36138.37, saidas:14819.89, resultado:21318.48 } // V70 (18/07/2026): saidas 14.795,99->14.819,89, resultado 21.342,38->21.318,48
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
  // Total Operacional = soma literal dos 7 componentes (mesma formula documentada na Politica sec.13/TOTAL_OPERACIONAL)
  REG.operacional.totalOperacional = r2(D.boletos + D.parcelas + D.consorcios + D.recorrencias + D.aportesPat + D.provMP + D.assinaturas);
  REG.operacional.necessidadeTotalBruta = r2(REG.operacional.totalOperacional + REG.operacional.orcamentoOperacional);
  REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  REG.operacional.saldoCiclo = r2(REG.balanco.fluxo.entradas - REG.operacional.necessidadeTotalBruta);
  // Sobra da cascata de reembolso Wartsila = Total - as 4 pernas de deducao (regra da Politica sec.5, 5 pernas)
  REG.operacional.reembolsoSobraPessoal = r2(REG.operacional.reembolsoCicloTotal - 656.67 - REG.operacional.reembolsoPagaMPCorporativo - 483.43 - D.provMP);
  // Visa total comprometido (usado no card Balanco/Obrigacoes) = mesma fonte do card Cartoes, evita 3a copia divergente (V85 ja tinha corrigido uma 2a copia)
  REG.balanco.obrigacoes.visa = r2(REG.visa.totalComprometido);
  REG.balanco.obrigacoes.mastercardBlack = r2(REG.cartaoMB.total);
  REG.balanco.obrigacoes.total = r2(REG.balanco.obrigacoes.visa + REG.balanco.obrigacoes.mastercardBlack + REG.balanco.obrigacoes.mercadoPago + REG.balanco.obrigacoes.wartsila);
  // Evolucao (graficos): o ponto do ciclo atual (indice 0) tambem passa a vir do agregado real, nao de um numero copiado a mao
  REG.evolucao.totalOperacional[0] = REG.operacional.totalOperacional;
  REG.evolucao.necessidadeLiquida[0] = REG.operacional.necessidadeLiquida;
})();

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

  // caixa variavel
  t('cvSaldoReal', fmt(R.caixaVariavel.saldoReal));
  t('cvComprometido', fmt(R.caixaVariavel.comprometido));
  t('cvDisponivel', fmt(R.caixaVariavel.disponivel));

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

  t('cxWartsila', fmt(R.faturaWartsila));
  t('ejSaldo', fmt(R.escolaJulioSaldo));
  t('ejMeta', fmt(R.patrimonio.metaEscolaJulio));
  t('snCicloAtual', '+ '+fmt(liquidoMes(0) - R.superavitNormal.necessidade[0]));

  t('csNecTotal', R.operacional.necessidadeTotalBruta.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  t('csReembolsos', R.operacional.reembolsoSobraPessoal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));

  // ===== Balanço Patrimonial (Reestruturação V2.0, 16/07/2026) =====
  const B = R.balanco;
  t('balFisicoTotal', fmt(B.fisico.total));
  t('balFinanceiroTotal', fmt(B.financeiro.total));
  t('balPgbl', fmt(B.pgbl));
  t('balFgts', fmt(B.fgts));
  t('balPassivosTotal', fmt(B.passivos.total));
  t('balAtivosTotal', fmt(B.ativosTotal));
  t('balPassivosTotal2', fmt(B.passivos.total));
  t('balPatrimonioLiquido', fmt(B.patrimonioLiquido));
  t('balResBoletos', fmt(B.operacional.caixaBoletos)); // V85: movida de reservas pra operacional
  t('balResEscola', fmt(B.reservas.escolaJulio));
  t('balResLance', fmt(B.reservas.caixaLance));
  t('balResManut', fmt(B.reservas.manutencao)+' (emprestada)');
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
  const cascataTotal = round2(656.67 + REG.operacional.reembolsoPagaMPCorporativo + 483.43 + REG.totalOpDetalhe.provMP + REG.operacional.reembolsoSobraPessoal);
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

  const healthBadge = document.getElementById('healthBadge');

  if(problemas.length === 0){
    console.log('%c✅ Auditoria automática: 0 divergências encontradas na matemática do REG.', 'color:#34c98a;font-weight:600');
    if(healthBadge){
      healthBadge.textContent = '✅ Sistema íntegro';
      healthBadge.style.color = '#34c98a';
      healthBadge.title = 'Auditoria automática: 0 divergências nas 10 relações matemáticas do REG.';
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
  // CORRIGIDO 18/07/2026: antes havia uma constante estatica CAIXA_VARIAVEL_DISPONIVEL=311.28 copiada
  // manualmente do ERP em 16/07/2026, nunca mais atualizada - ficou obsoleta (bug real de "split-brain":
  // o mesmo valor existia em 2 lugares, um vivo (REG.caixaVariavel.disponivel=193.33) e um estatico
  // parado). Removida a duplicata - agora le direto do REG, um so lugar, sempre correto.
  const diasParaDivisao = Math.max(1, restantes);
  const dispDia = REG.caixaVariavel.disponivel / diasParaDivisao;

  // ===== Aging LREI (18/07/2026, V73): dias em aberto de cada emprestimo interno, calculado ao vivo
  // a cada carregamento - nunca mais hardcoded (o ERP ja tinha IDADE_DIAS/STATUS_ENVELHECIMENTO mas
  // ficava parado entre sessoes). Faixas: 0-30 NORMAL, 31-60 ATENCAO, 61+ CRITICO (P4 - toda divida
  // interna deve ser ressarcida, quanto mais velha, maior o risco de ficar esquecida).
  const lreiAtivos = [
    { id:'lrei0001Idade', abertura: new Date(2026,6,12) } // LREI0001: 12/07/2026
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
    return alertas;
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    set('diasDecorridos', decorridos);
    set('diasRestantes', restantes);
    set('hojeData', fmtData(hoje));
    set('atualizadoEm', 'Atualizado em '+fmtData(hoje));
    set('cicloRange', fmtCurta(inicio)+' → '+fmtData(fim));
    set('dispDia', dispDia.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
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
    const folegoEl = document.getElementById('simFolego');
    if(folegoEl){
      folegoEl.textContent = fmt(folego);
      folegoEl.style.color = folego >= 0 ? '#34c98a' : '#e2554f';
    }
    const msgEl = document.getElementById('simMensagem');
    if(msgEl){
      if(folego >= 0){
        msgEl.innerHTML = (cv.tolerenciaTemp>0 ? '* Teto oficial '+fmt(cv.tetoOficial)+' + tolerância temporária '+fmt(cv.tolerenciaTemp)+' (viagem, até 24/07). ' : '')
          + `Ainda dá pra gastar <strong>${fmt(folego)}</strong> até o fim do ciclo — um ritmo de <strong>${fmt(folegoPorDia)}/dia</strong> nos ${restantes} dias restantes, sem estourar o teto.`;
      } else {
        msgEl.innerHTML = `<strong style="color:#e2554f">Atenção:</strong> já estourou o teto efetivo em ${fmt(Math.abs(folego))}. Recomposição prevista via reembolso Wärtsilä ou salário de 25/07.`;
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
  data:{labels:['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa'],
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0'],
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
const cenarioSalarioData = [REG.deficitZero.liquidoSemTrabalhar,REG.operacional.necessidadeTotalBruta-REG.operacional.reembolsoSobraPessoal,REG.cenarioHistorico.media,29424.00];
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
  data:{labels:['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa'],
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0'],
    borderColor:'#16181b',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:legendStd,tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}}
});

new Chart(document.getElementById('g_cVisaBar'), {
  type:'bar',
  plugins:[barValuePlugin],
  data:{labels:['Parcelas','Consórcios','Wallace','Recorrências','Corp.','Assinaturas','Vanessa'],
    datasets:[{data:Object.values(REG.visaDetalhe),
    backgroundColor:['#3987e5','#9085e9','#e8a63a','#34c98a','#6f6d66','#e2554f','#e879b0'],borderRadius:4}]},
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
// Rotulo curto sobre a barra: so porcentagem + texto minimo
const metasRaw = ['11,54% do milhão','0,42% pago','75,22% pago'];
// Descricao completa, so no tooltip ao passar o mouse
const metasDetalhe = [
  '11,54% · R$115.373,63 de R$1.000.000',
  'Consórcio Casa Nova (cota 12, grupo I0464) · quitação R$550.601,43 (99,58%)',
  'Carta R$76.670,02, saldo devedor R$18.998,83'
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
const caixasLabels = ['Boletos','PIX Vanessa','Manutenção','Eventos e Viagens','Saúde Família','Aniversário Júlio','Seguro/Emplacamento'];
const caixasSaldo = Object.values(REG.caixasOperacionais).map(c=>c.saldo);
const caixasMeta =  Object.values(REG.caixasOperacionais).map(c=>c.meta);
const caixasNotas = [
  '31,6% da meta',
  '41,1% da meta',
  'LREI0001: emprestou R$178,64 para a Caixa Variável',
  'Suporte à Variável (R$167,40) para o mesmo custo: visita família Vanessa/Natal-RN — não é empréstimo',
  '2x Júlio + 1x Vanessa/ano · aporte R$100/mês',
  'Nova · aporte R$200/mês até 14/09',
  'Nova · aporte R$425/mês (permanente)'
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
      SEGURO_EMPLACAMENTO_APORTE = 425, ESCOLA_JULIO_2027_APORTE = 839.64;
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
        '<td style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snLiquido[i])+'</td>'+
        '<td style="padding:0.3rem 0.5rem;text-align:right">'+fmt(snNecessidade[i])+'</td>'+
        '<td style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:var(--green)">+'+fmt0b(snDiferenca[i])+'</td>'+
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
        '<td style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzLiquido)+'</td>'+
        '<td style="padding:0.3rem 0.5rem;text-align:right">'+fmt(dzPiso[i])+'</td>'+
        '<td style="padding:0.3rem 0.5rem;text-align:right;font-weight:700;color:'+cor+'">'+sinal+fmt0(Math.abs(d))+'</td>'+
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
  const tarifa = 322.99/304;
  const anoAnterior = kwhAnoAnterior.map(k=>Math.round(k*tarifa*100)/100);
  const valorPosSolar = Math.round((30*tarifa + 38.00)*100)/100;
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
