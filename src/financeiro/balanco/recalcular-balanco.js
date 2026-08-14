// MÓDULO: recalcularBalanco() — domínio Balanço do motor de cálculo (recalcularAgregadosDerivados).
// ÚLTIMO domínio a rodar — depende de todos os demais já terem sido calculados: Idade Wallace +
// Patrimônio Esperado (regra clássica)/Meses de Renda/Faixa (precisa de
// recalcularPatrimonio()/recalcularNecessidade()), Reservas/Operacional do Balanço (dados estáticos
// do REG), Obrigações (Visa/MB/Mercado Pago — precisa de recalcularMercadoPago()/preâmbulo) e os
// totais de Livros Razão LRC/LRS/LRR (precisa de recalcularMercadoPago()/recalcularNecessidade() já
// terem preenchido totalOpDetalhe.assinaturas/recorrencias). Extraído de app.js na modularização
// (07/08/2026) — MESMA fórmula, MESMO resultado, é a última chamada de
// recalcularAgregadosDerivados(), fechando a quebra do motor de cálculo em domínios especializados.
function recalcularBalanco(){
  const r2 = x => Math.round(x*100)/100;

  // CORRIGIDO 13/08/2026 (achado de auditoria: reservas.boletos removido da soma - a linha Caixa
  // Boletos migrou da secao 05 pra secao 06 (operacional.caixaBoletos, ja somada la embaixo); somar
  // aqui tambem inflava o Total reservado da secao 05 em ~R$1.648,55, em duplicidade com a secao 06.
  REG.balanco.reservas.total = r2(REG.balanco.reservas.escolaJulio + REG.balanco.reservas.caixaLance +
    REG.balanco.reservas.manutencao + REG.balanco.reservas.eventos + REG.balanco.reservas.churrasco +
    REG.balanco.reservas.saudeFamilia + REG.balanco.reservas.seguroEmplacamento + REG.balanco.reservas.aniversarioJulio +
    REG.balanco.reservas.pixVanessa + REG.balanco.reservas.combustivel + REG.balanco.reservas.bensDuraveis + REG.balanco.reservas.suavizacao);
  REG.balanco.operacional.total = r2(REG.balanco.operacional.caixaVariavel + REG.balanco.operacional.caixaBoletos + REG.balanco.operacional.mastercardInfinite); // CORRIGIDO 26/07/2026 (V166): PIX Vanessa (conta autonoma dela) removida do total - nunca deveria ter somado como "reserva do Wallace".

  // CORRIGIDO 05/08/2026 (parte 101): usuario informou a idade (34 anos, nasce 13/05/1992) - agora da
  // pra usar a regra classica de mercado de verdade (Thomas Stanley, "The Millionaire Next Door"):
  // Patrimonio Esperado = Idade x Renda Anual Bruta / 10. Idade sempre CALCULADA a partir de
  // VARS.dataNascimentoWallace + data de hoje, nunca hardcoded (nao precisa lembrar de atualizar todo
  // ano). Mantido o indicador de "meses de renda" tambem, como segunda leitura complementar.
  REG.idadeWallace = (function(nasc){
    const hoje = new Date(); const dn = new Date(nasc+'T00:00:00');
    let idade = hoje.getFullYear() - dn.getFullYear();
    const aindaNaoFezAniversario = (hoje.getMonth() < dn.getMonth()) || (hoje.getMonth()===dn.getMonth() && hoje.getDate() < dn.getDate());
    if(aindaNaoFezAniversario) idade--;
    return idade;
  })(VARS.dataNascimentoWallace);
  REG.balanco.patrimonioTotalMesesDeRenda = REG.operacional.entradasTotais ? r2(REG.balanco.patrimonioTotalGeral / REG.operacional.entradasTotais) : null;
  REG.balanco.patrimonioEsperadoRegraClassica = r2(REG.idadeWallace * REG.operacional.entradasTotais * 12 / 10);
  REG.balanco.patrimonioTotalFaixa = (function(atual, esperado){
    if(!esperado) return {label:'Sem dado', cor:'var(--text-dim)'};
    const pct = atual / esperado * 100;
    if(pct < 50) return {label:'Abaixo da faixa esperada p/ idade e renda', cor:'var(--red)'};
    if(pct < 100) return {label:'Dentro da faixa, ainda construindo', cor:'var(--amber)'};
    if(pct < 200) return {label:'Dentro da faixa, acumulador acima da média', cor:'var(--green)'};
    return {label:'Muito acima da faixa esperada', cor:'var(--green)'};
  })(REG.balanco.patrimonioTotalGeral, REG.balanco.patrimonioEsperadoRegraClassica);

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
  // CORRIGIDO 07/08/2026 (mudança de regra de negócio, pedido do usuário): a fórmula antiga (V203)
  // misturava o ciclo financeiro atual com `faturaMPCorporativoPendente`, um acumulado de reembolso
  // Wärtsilá pendente que NÃO é escopado a ciclo nenhum (só zera quando a Wärtsilä reembolsa de
  // verdade) — e ainda truncava com `max(0,...)`. Regra nova, por competência: "Corporativo do Ciclo"
  // = soma das transações corporativas do Mercado Pago (`VARS.TRANSACOES_CORPORATIVAS_MP`, tipo:'corp')
  // cuja DATA cai dentro do período do ciclo atual — mesmo filtro por competência já usado no painel
  // LRMP-corp (linha ~4066/4083) — não depende do status da fatura nem de quando o boleto foi pago.
  // Exemplo real: uma viagem corporativa em 26/07 conta no ciclo atual mesmo que a fatura anterior
  // (que fechou antes) já tenha sido paga em 04/08 — são conceitos independentes.
  // "Mercado Pago líquido" = Fatura do Ciclo − Corporativo do Ciclo, SEM `max(0,...)` — pode ser
  // negativo (a fatura pode ficar menor que o corporativo do próprio ciclo, isso é informação real,
  // não erro a esconder).
  const snapMP = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
  const [mpIni, mpFim] = snapMP.periodo.split(' a ').map(s=>{
    const [d,m,a] = s.trim().split('/');
    return new Date(a, m-1, d);
  });
  REG.balanco.corporativoMPDoCiclo = r2((VARS.TRANSACOES_CORPORATIVAS_MP||[]).filter(t=>{
    if(t.tipo !== 'corp') return false;
    const dt = new Date(t.data);
    return dt >= mpIni && dt <= mpFim;
  }).reduce((s,t)=>s+t.valor, 0));
  REG.balanco.obrigacoes.mercadoPago = r2(VARS.mercadoPagoFatura - REG.balanco.corporativoMPDoCiclo);
  REG.balanco.obrigacoes.total = r2(REG.balanco.obrigacoes.visa + REG.balanco.obrigacoes.mastercardBlack + REG.balanco.obrigacoes.mercadoPago);

  // V137: livrosRazaoTotais LRW/LRV/LRC = soma das mesmas partes ja usadas nos graficos (visaDetalhe+mbDetalhe).
  // LRS/LRR = mesmos valores ja derivados em totalOpDetalhe.assinaturas/recorrencias (linha 393/394 acima).
  // Todos verificados batendo exato antes de virar formula (harness Node, 0 divergencia).
  // V152/V153: livrosRazaoTotais.LRW/LRV NAO sao mais sobrescritos aqui - viraram filtro manual por ciclo
  // (painel Livros Razao, secao 15), editados direto no VARS.livrosRazaoTotais. O total REAL comprometido
  // (usado em auditoria/cartaoMBTotal) continua vindo de visaDetalhe.wallace/vanessa + mbDetalhe.wallace/vanessa,
  // sem relacao com o que aparece filtrado no painel.
  REG.livrosRazaoTotais.LRC.total = r2(REG.visaDetalhe.corp + REG.mbDetalhe.corp);
  REG.livrosRazaoTotais.LRS.total = REG.totalOpDetalhe.assinaturas;
  REG.livrosRazaoTotais.LRR.total = REG.totalOpDetalhe.recorrencias;
}
