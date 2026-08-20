// MÓDULO: hydrateVisaMB() — renderização do breakdown Visa Infinite e Mastercard Black (LRW/LRV/LRP/
// LRS/LRR/LRCON/LRC por cartão, pessoal, não reconciliado). Extraído de hydrate() (app.js) na
// modularização (07/08/2026). Script clássico (não ES module), carrega ANTES do app.js — hydrate() é
// síncrona (onDomPronto(hydrate), dentro do próprio app.js) e chama hydrateVisaMB() no meio da
// própria execução. Nenhum id de DOM, fórmula ou comportamento mudou.
// NOVO 20/08/2026 (achado real do usuário: reconciliou o Visa Infinite item a item, R$0,00 exato,
// mas a TELA continuava mostrando os valores antigos — R.visaDetalhe era um snapshot ESTÁTICO,
// montado 1x em criarRegMercadoPago() lendo VARS naquele instante, nunca recalculado de novo
// (diferente de mbDetalhe, que já tinha recalcularEHidratarMbPessoal()). Além disso, sem card em
// hydrateVisaMB() abaixo já mantinha esse mesmo padrão pro lado MB — agora o Visa ganha o espelho
// exato, chamado no início de hydrateVisaMB() pra qualquer um dos 3 pontos que já chamam essa função
// (boot, promoverFaturaPluggyComoFonte(), aplicarOnda9LivrosFixos()) ganhar o recálculo de graça.
function recalcularEHidratarVisaPessoal(){
  if(typeof REG === 'undefined' || !REG.visaDetalhe) return;
  const R = REG;
  const D = R.visaDetalhe;
  D.wallace = VARS.visaLRWHistorico;
  D.vanessa = VARS.visaLRVHistorico;
  D.parcelas = VARS.livroLRP;
  D.assinaturas = VARS.visaLRSConfirmado;
  D.recorrencias = VARS.visaLRRConfirmado;
  D.consorcios = VARS.livroLRCONVisaOnly;
  D.corp = VARS.livroLRCVisaOnly;
  const somaPartes = Math.round((D.wallace + D.vanessa + D.parcelas + D.assinaturas + D.recorrencias + D.consorcios) * 100) / 100;
  D.naoReconciliado = Math.round((R.cartaoInfinite.total - D.corp - somaPartes) * 100) / 100;
}

function hydrateVisaMB(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  recalcularEHidratarVisaPessoal();
  const R = REG;

  // NOVO 11/08/2026 (pedido do usuário: promover a fatura real da Pluggy como fonte do headline total,
  // ver promoverFaturaPluggyComoFonte() em pluggy-reconciliacao.js — mesmo padrão de selo já usado em
  // "Fatura atual (aberta)" do Mercado Pago): mostra a origem do número, nunca finge que é sempre a
  // fatura real quando na verdade é o fallback reconciliado manualmente.
  const badgeOrigem = (origemVar) => VARS[origemVar] === 'pluggy'
    ? ' <span style="font-size:0.62rem;color:var(--green)" title="Valor vindo direto da fatura real da Pluggy, atualizado automaticamente">🔄 Pluggy</span>'
    : ' <span style="font-size:0.62rem;color:var(--text-dim)" title="Pluggy sem fatura em aberto confiável nesta carga — valor reconciliado manualmente">📝 manual</span>';

  // visa infinite
  const visaTotalEl = $('visaTotal');
  if(visaTotalEl) visaTotalEl.innerHTML = fmt(R.cartaoInfinite.total) + badgeOrigem('cartaoInfiniteTotalOrigem');
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
  const mbTotalEl = $('mbTotal');
  if(mbTotalEl) mbTotalEl.innerHTML = fmt(R.cartaoMB.total) + badgeOrigem('cartaoMBTotalOrigem');
  t('mbPessoal', fmt(VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado ? VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].mastercardBlackPessoalCongelado : (R.cartaoMB.total - R.mbDetalhe.corp))); // CORRIGIDO 26/07/2026 (V177): usuario esclareceu que o ciclo fechado deve mostrar o valor CONGELADO do fechamento artificial (R$1.849,31), nao a formula viva recalculada com dados atuais.
  t('mbLRW', fmt(R.mbDetalhe.wallace));
  t('mbLRV', fmt(R.mbDetalhe.vanessa));
  t('mbLRP', fmt(R.mbDetalhe.parcelas));
  t('mbLRS', fmt(R.mbDetalhe.assinaturas));
  t('mbLRR', fmt(R.mbDetalhe.recorrencias));
  t('mbLRCON', fmt(R.mbDetalhe.consorcios));
  t('mbLRC', fmt(R.mbDetalhe.corp));
  t('mbLRNaoReconciliado', fmt(R.mbDetalhe.naoReconciliado)); // NOVO 11/08/2026: residuo soma-livros x fatura-real, mesma logica ja usada no Visa (visaLRNaoReconciliado)
}

// CORRIGIDO 16/08/2026 (achado do usuário, print real: "Pessoal (s/ corporativo)" R$3.942,01 vs soma
// das categorias detalhadas R$4.518,73 — gap de R$576,72 "escondido"). Causa raiz: mbDetalhe.corp/
// wallace/vanessa viraram 100% dinâmicos (Onda 3 recalcula wallace/vanessa da V2, Onda 10 recalcula
// corp da V2), mas cada Onda só atualiza o DOM que ela mesma conhece (mbLRW/mbLRV a Onda 3; tfLRC a
// Onda 10) — NENHUMA delas recalculava mbPessoal nem mbLRNaoReconciliado depois, e mbNaoReconciliado
// (VARS) sempre foi um literal fixo em 0 (nunca calculado de verdade, achado documentado desde
// 11/08/2026). Resultado: a divergência real entre o total manualmente reconciliado (VARS.cartaoMBTotal,
// "a fatura sempre vence", nunca deve virar soma automática — ver seção 1 do manual) e a soma ao vivo
// das categorias ficava invisível, mostrando sempre "Não reconciliado: R$0,00" mesmo quando não era.
// Esta função resincroniza mbDetalhe.corp/wallace/vanessa com os VARS mais recentes, recalcula
// naoReconciliado de verdade (mesma soma-auditada usada no Visa, ver comentário de reg-mercado-pago.js)
// e re-hidrata só os 3 campos que dependem disso (mbLRC/mbPessoal/mbLRNaoReconciliado) — chamada no
// FIM de aplicarOnda3LrwLrv() e aplicarOnda10LrcLimbo(), idempotente, nunca sobrescreve com dado velho
// (só lê o que já está em VARS no momento da chamada).
function recalcularEHidratarMbPessoal(){
  if(typeof REG === 'undefined' || !REG.mbDetalhe) return;
  const R = REG;
  const D = R.mbDetalhe;
  D.corp = VARS.mbLRCConfirmado;
  D.wallace = VARS.mbLRWConfirmado;
  D.vanessa = VARS.mbLRVConfirmado;
  // RETOMADO 20/08/2026 (achado do usuário, com evidência real de novo — mesma disciplina da 1ª
  // tentativa 19/08, que piorou de +1.248 pra -1.617 e foi revertida): naquela época a âncora
  // (`cartaoMBTotal`) e os componentes de `somaPartes` tinham vários problemas reais não descobertos
  // ainda — âncora misturando ciclo do cartão anterior com o novo, âncora desatualizada (só ia até
  // 17/08), 3 dupla-contagens reais (Digna/Pax Domini/Mega religados sem checar cronograma_*),
  // recorrências contando mesmo sem ter cobrado de novo este ciclo. Depois de corrigir tudo isso
  // (ver ESTADO_ATUAL.md seções -10 a -14), a mesma soma que antes dava overshoot de -R$1.617
  // recalculada à mão deu só ~-R$521 — perto o bastante de bater pra valer a pena testar ao vivo de
  // novo. D.caixasTematicas (`atualizarCaixasTematicasComprometidoMB()`, mesmo arquivo) agora entra
  // na soma — usuário confirmou item a item que as 12 transações que compõem esse valor são reais e
  // batem com a fatura (nenhuma dupla-contagem nova encontrada). `|| 0` porque essa busca é async e
  // separada — se ainda não chegou quando esta função roda, soma 0 em vez de `undefined`, mesmo
  // padrão já usado na exibição da linha "Caixas temáticas" logo abaixo.
  // NOVO 20/08/2026 (achado da reconciliação item a item, ver comentário de VARS.mbIOFConfirmado em
  // vars-mercado-pago.js): último componente real do "Não Reconciliado", as taxas de IOF de compra
  // internacional que nunca viram linha em `transacoes` — sem isso, o resíduo ficava preso em ~R$18-38
  // dependendo de quais outros bugs (assinaturas sem ciclo, Tokio Marine duplicado) já tinham sido
  // corrigidos, sem nunca fechar em zero de verdade.
  D.iof = VARS.mbIOFConfirmado || 0;
  const somaPartes = Math.round((D.wallace + D.vanessa + D.parcelas + D.assinaturas + D.recorrencias + D.consorcios + (D.caixasTematicas || 0) + D.iof) * 100) / 100;
  D.naoReconciliado = Math.round((R.cartaoMB.total - D.corp - somaPartes) * 100) / 100;
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  t('mbLRC', fmt(D.corp));
  t('mbLRCaixasTematicas', fmt(D.caixasTematicas || 0));
  t('mbLRIOF', fmt(D.iof));
  t('mbPessoal', fmt(VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado ? VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].mastercardBlackPessoalCongelado : (R.cartaoMB.total - D.corp)));
  t('mbLRNaoReconciliado', fmt(D.naoReconciliado));
  // Donut "Composição" (seção 10) foi desenhado no boot com o mbDetalhe de então — atualiza junto,
  // mesmo padrão de atualizarGraficoCaixas()/atualizarGraficoPatrimonio() já usados no resto do arquivo.
  if(window.WALLACE_CHARTS && window.WALLACE_CHARTS.mbComposicao){
    window.WALLACE_CHARTS.mbComposicao.data.datasets[0].data = Object.values(D);
    window.WALLACE_CHARTS.mbComposicao.update();
  }
}

// NOVO 19/08/2026 (mesmo achado acima): busca o comprometido (só Mastercard Black) das 9 caixas
// temáticas que compram no cartão — as mesmas 6 de CAIXAS_TEMATICAS_COMPROMETIDO_V2
// (hydrate-comprometido-caixas-tematicas-v2.js) + Combustível/Mastercard_Infinite/Seguro
// Emplacamento, que ficaram de fora daquela lista original. Roda 1x (onDomPronto, ver app.js),
// soma tudo, guarda em REG.mbDetalhe.caixasTematicas e re-hidrata — não duplica fetch: reaproveita
// getComprometidoPorCaixaECartoesV2 (mesmo cache/filtro exato de getComprometidoPorCaixaV2, só
// restrito à família de cartão certa).
const MB_CAIXAS_TEMATICAS_IDS = {
  'Caixa Combustível': '782d8722-392a-440d-8b71-4fa7476a5b30',
  'Caixa Mastercard_Infinite': '748b8612-b854-44e3-8834-542ec7f1ff7c',
  'Caixa Seguro Emplacamento': '8dcfa73a-1560-4b37-9aac-48a499548d2c',
  'Caixa Churrasco': 'f18e248e-182b-42ec-9d04-f1bf5cb0a749',
  'Caixa Bens Duráveis': 'eeaf926e-07df-479c-b0bc-1071410a5298',
  'Caixa Manutenção': 'df4c44af-3e30-4592-b0b5-5b863ca91591',
  'Caixa Eventos': 'ecaebc58-8f49-4d85-8ef4-6282ea765c2f',
  'Caixa Saúde Família': 'd15e8cbe-4443-4ee4-9631-06d8d49058fe',
  'Emagrecimento': 'd6be6a08-9d7b-4664-9c85-1e367aa620b9',
};
// ATUALIZADO 20/08/2026 (achado da investigação "Não Reconciliado" definitiva): faltavam 3 cartões MB
// cadastrados em 10/08 (0317, 2135, 8530) — cadastro em `cartoes` foi feito naquela sessão, mas essa
// lista literal, usada em TODO cálculo de "quem é MB" (aqui e em hydrate-onda3-lrwlrv.js), nunca foi
// atualizada. TX000274 (Anthropic real, cartão 8530) ficava invisível pra qualquer filtro por família
// de cartão até este fix — não é só cosmético, causava R$116,52 de subcontagem real no Não Reconciliado.
const MB_CARTOES_IDS = ['7b981bf6-80eb-473b-8cf5-91a75c4d0cd3','5774ffd5-fa19-47af-affc-761d6b880a88','00098251-b7d1-475c-9ec3-ee5462202082','2bd91561-e1dc-4073-8e8a-b0037b5bb4bf','6cec9fa0-ad3c-4fd1-87e0-52d3e0325b09','7c53205f-d2f1-450b-aea3-10d25b0b9b45','242e0499-a6ff-45b4-a4aa-4579e9b151ec','7b0adfe8-182f-455a-a633-30995fba7e67','02803dbe-0dd1-4720-a6a0-56e1037fe854','cdb6c357-6630-46f6-984f-608973d521f8','1d6d3284-95d5-44f0-bff5-5684f9068e76'];
async function atualizarCaixasTematicasComprometidoMB(){
  if(typeof REG === 'undefined' || !REG.mbDetalhe) return;
  try {
    const somas = await Promise.all(Object.values(MB_CAIXAS_TEMATICAS_IDS).map(caixaId =>
      WallaceFinanceService.getComprometidoPorCaixaECartoesV2(caixaId, MB_CARTOES_IDS).catch(() => 0)
    ));
    REG.mbDetalhe.caixasTematicas = Math.round(somas.reduce((s,v) => s + (Number(v)||0), 0) * 100) / 100;
    recalcularEHidratarMbPessoal();
  } catch(err){
    console.warn('atualizarCaixasTematicasComprometidoMB: falha ao buscar comprometido das caixas temáticas — Não Reconciliado do MB fica sem esse componente nesta carga.', err);
  }
}
