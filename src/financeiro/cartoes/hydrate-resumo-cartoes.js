// MÓDULO: hydrateResumoCartoes() — renderização dos "títulos/totais já centralizados" (seções
// 01/02/03: Total Operacional, Visa comprometido/pessoal, Visa+MB líquido de Caixa Variável,
// disponível/reposição necessária), do "Alívio" (Evolução Total Operacional) e do "Piso Absoluto"
// (o que nunca é cortado). Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateResumoCartoes() no meio da própria execução.
// totalOpMar27 é redeclarado aqui a partir de REG (mesmo padrão já usado em hydrateCaixas com
// C/pctOf) — o app.js mantém sua própria cópia local pro card r21TotalOpMar27 (Resumo Executivo),
// não tocado. Nenhum id de DOM, fórmula ou comportamento mudou.
function hydrateResumoCartoes(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;
  const totalOpMar27 = R.evolucao.totalOperacional[R.evolucao.totalOperacional.length-1];

  // titulos/totais ja centralizados (secoes 01/02/03)
  t('s01TotalOp', fmt(R.operacional.totalOperacional));
  t('totOpTotalLine', fmt(R.operacional.totalOperacional));
  t('s02TituloVisa', fmt(R.visa.totalComprometido));
  t('gVisaTotalLine', fmt(R.visa.totalComprometido));
  t('gVisaPessoalLine', fmt(R.visa.pessoal));
  // Novo 19/07/2026 (V89, pedido do usuario): Visa+MB liquido de Caixa Variavel.
  // A Caixa Variavel ja cobre 100% de LRW+LRV (REGRA_FUNCAO_CAIXA_VARIAVEL) - este card mostra
  // quanto da obrigacao dos 2 cartoes NAO esta coberto por ela (parcelas/assinaturas/recorrencias/consorcios/corp).
  // CORRIGIDO 13/08/2026 (achado de auditoria: esta função e _calcularCartoesLiquidoCV()
  // (graficos-cenarios-lazy.js) implementavam a MESMA fórmula (cartoesTotal - caixaVariavel.comprometido)
  // de forma independente). Reusa a função compartilhada quando ela já existe — mas
  // graficos-cenarios-lazy.js é módulo LAZY que só termina de baixar bem depois de hydrate() rodar no
  // boot síncrono (ver cabeçalho daquele arquivo), então guard com fallback idêntico é necessário pra
  // não quebrar a 1ª renderização (typeof indefinido nesse momento). Em qualquer chamada depois do
  // boot completo (ex: re-hydrate manual), já usa a função compartilhada de verdade.
  let cartoesTotal, cartoesLiquidoCV;
  if(typeof _calcularCartoesLiquidoCV === 'function'){
    const [, , , liquido] = _calcularCartoesLiquidoCV();
    cartoesTotal = Math.round((R.cartaoInfinite.total + R.cartaoMB.total)*100)/100;
    cartoesLiquidoCV = liquido;
  } else {
    cartoesTotal = Math.round((R.cartaoInfinite.total + R.cartaoMB.total)*100)/100;
    cartoesLiquidoCV = Math.round((cartoesTotal - R.caixaVariavel.comprometido)*100)/100;
  }
  t('gCartoesTotalLine', fmt(cartoesTotal));
  t('gCartoesPessoalLine', fmt(R.visa.pessoal)); // mesma logica ja usada em gVisaPessoalLine - so o Visa tem corporativo, MB nao
  t('gCVComprometidoLine', '− '+fmt(R.caixaVariavel.comprometido));
  t('gCartoesLiquidoLine', fmt(cartoesLiquidoCV));
  // ADICIONADO 20/07/2026 (pedido do usuario): Comprometido (provisionado) x Disponivel real em caixa,
  // pra mostrar a diferenca (quanto falta) e de onde vem a reposicao - mesma logica ja usada no LREI0001
  // (recomposicao via salario do dia 25 ou sobra do reembolso Wartsila).
  const cvDisponivel = R.caixaVariavel.disponivel;
  const reposicaoNecessaria = cvDisponivel < 0 ? Math.round(Math.abs(cvDisponivel)*100)/100 : 0;
  // CORRIGIDO 13/08/2026 (achado de auditoria: hex hardcoded #e2554f/#34c98a em vez dos design
  // tokens var(--red)/var(--green) definidos em :root de styles.css) - lidos via getComputedStyle
  // no :root pra continuar funcionando com style.color direto (inline), sem precisar de classe nova.
  const rootStyle = getComputedStyle(document.documentElement);
  const corRed = rootStyle.getPropertyValue('--red').trim() || '#e2554f';
  const corGreen = rootStyle.getPropertyValue('--green').trim() || '#34c98a';
  t('gCVDisponivelLine', fmt(cvDisponivel));
  const elDisp = $('gCVDisponivelLine');
  if(elDisp) elDisp.style.color = cvDisponivel < 0 ? corRed : corGreen;
  const elRepo = $('gCVReposicaoLine');
  if(reposicaoNecessaria > 0){
    t('gCVReposicaoLine', fmt(reposicaoNecessaria));
    if(elRepo) elRepo.style.color = corRed;
    t('gCVReposicaoFonte', `Fonte prevista: salário do dia 25 ou sobra do reembolso Wärtsilä (${fmt(R.operacional.reembolsoSobraPessoal)} disponível hoje) — mesmo mecanismo já usado para o LREI0001.`);
  } else {
    t('gCVReposicaoLine', 'Nenhuma');
    if(elRepo) elRepo.style.color = corGreen;
    t('gCVReposicaoFonte', 'Caixa Variável está dentro do previsto — sem necessidade de reposição externa agora.');
  }
  t('s03TituloPat', fmt(R.patrimonio.total));

  // alivio (Evolucao Total Operacional)
  const alivioTotal = R.operacional.totalOperacional - totalOpMar27;
  t('aliv1', '− '+fmt(alivioTotal));
  t('aliv2', '− '+fmt(alivioTotal));
  t('alivioBadgeMar27', 'Alívio '+fmt(alivioTotal)+' até Mar/27');

  // piso absoluto (O que NUNCA e cortado)
  const D = R.totalOpDetalhe;
  t('pisoBoletos', fmt(D.boletos));
  t('pisoParcelas', fmt(D.parcelas));
  t('pisoConsorcios', fmt(D.consorcios));
  t('pisoRecorrencias', fmt(D.recorrencias));
  t('pisoMP', fmt(D.provMP));
  t('pisoAssinaturas', fmt(D.assinaturas));
  // CORRIGIDO 13/08/2026 (achado de auditoria: literal fixo desatualizavel) - pisoTotal mostrava
  // R.reserva.piso (= VARS.reservaPiso, literal fixo) em vez da soma real dos 6 itens listados
  // acima. Deriva ao vivo pra nunca dessincronizar quando um dos 6 itens mudar.
  const pisoTotalReal = Math.round((D.boletos + D.parcelas + D.consorcios + D.recorrencias + D.provMP + D.assinaturas) * 100) / 100;
  t('pisoTotal', fmt(pisoTotalReal));
}
