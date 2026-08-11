// MÓDULO: auditoriaAutomatica() — confere a matemática interna do REG (12 relações: cartões,
// Balanço Ativos/Passivos/Patrimônio Líquido, cascata de reembolso, Caixa Variável, Reservas,
// Patrimônio Financeiro, Meta do Milhão, Total Operacional, Visa/Mastercard Black). Loga no console e
// mostra badge/aviso discreto no rodapé se achar divergência; nunca bloqueia a página. Extraído de
// app.js na modularização (07/08/2026) — função autocontida (só usa REG/VARS/$/console/DOM básico).
// Chamada via onDomPronto(auditoriaAutomatica) em app.js, que continua igual. Nenhuma fórmula ou
// comportamento mudou.
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

  // 6) Reservas de Pagamento (Balanço) = Caixa Variável + Caixa Boletos + Mastercard/Infinite
  // CORRIGIDO 26/07/2026 (V166): PIX Vanessa (conta autonoma dela) removida - nunca deveria contar.
  const opCalc = round2(REG.balanco.operacional.caixaVariavel + REG.balanco.operacional.caixaBoletos + REG.balanco.operacional.mastercardInfinite);
  if(!bate(opCalc, REG.balanco.operacional.total)){
    problemas.push(`Reservas de Pagamento: CaixaVariavel+CaixaBoletos+MastercardInfinite=${opCalc} ≠ total(${REG.balanco.operacional.total})`);
  }

  // 7) Reservas (Balanço) = soma das 9 caixas de reserva
  const r = REG.balanco.reservas;
  const resCalc = round2(r.boletos+r.escolaJulio+r.caixaLance+r.manutencao+r.eventos+r.churrasco+r.saudeFamilia+r.seguroEmplacamento+r.aniversarioJulio+r.pixVanessa+r.combustivel+r.bensDuraveis+r.suavizacao);
  if(!bate(resCalc, r.total)){
    problemas.push(`Reservas: soma das 13 caixas=${resCalc} ≠ total(${r.total})`);
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
  // V177: SO roda para o ciclo ATUAL - no ciclo fechado, totalOperacional vem de um valor CONGELADO no
  // snapshot (nao da soma dos componentes vivos), entao a divergencia e esperada por design, nao erro.
  if(!VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado){
    const D2 = REG.totalOpDetalhe;
    const totOpCalc = round2(D2.boletos+D2.parcelas+D2.consorcios+D2.recorrencias+D2.aportesPat+D2.provMP+D2.assinaturas);
    if(!bate(totOpCalc, REG.operacional.totalOperacional)){
      problemas.push(`Total Operacional: soma dos 7 componentes=${totOpCalc} ≠ operacional.totalOperacional(${REG.operacional.totalOperacional})`);
    }
  }

  // 11) Visa Infinite: soma do detalhamento (visaDetalhe, usado nos graficos de composicao) = total do card
  // (ADICIONADO 22/07/2026, V135 - esta checagem NAO existia; foi exatamente por isso que o gap de
  // R$49,81 entre o grafico cVisa e o card "Total" ficou sem deteccao automatica por varios ciclos)
  // V174: SO roda para o ciclo ATUAL - o ciclo fechado guarda so um RESUMO agregado (nao o detalhamento
  // fino por categoria), entao a soma das partes nunca vai bater com o total do ciclo fechado por design,
  // nao por erro. Comparar isso seria um falso-positivo constante.
  if(!VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].fechado){
    const vd = REG.visaDetalhe;
    const visaDetalheCalc = round2(vd.parcelas+vd.consorcios+vd.wallace+vd.recorrencias+vd.corp+vd.assinaturas+vd.vanessa+vd.naoReconciliado);
    if(!bate(visaDetalheCalc, REG.cartaoInfinite.total)){
      problemas.push(`Visa Infinite: soma visaDetalhe=${visaDetalheCalc} ≠ cartaoInfinite.total(${REG.cartaoInfinite.total})`);
    }

    // 12) Mastercard Black: soma do detalhamento (mbDetalhe) = total do card (ADICIONADO 22/07/2026, V135 -
    // mesma classe de checagem que faltava; foi por isso que mbDetalhe.wallace ficou 3 rodadas desatualizado
    // sem ninguem perceber - nada comparava a soma das partes com o total)
    const md = REG.mbDetalhe;
    const mbDetalheCalc = round2(md.parcelas+md.consorcios+md.wallace+md.recorrencias+md.corp+md.assinaturas+md.vanessa+md.naoReconciliado);
    if(!bate(mbDetalheCalc, REG.cartaoMB.total)){
      problemas.push(`Mastercard Black: soma mbDetalhe=${mbDetalheCalc} ≠ cartaoMB.total(${REG.cartaoMB.total})`);
    }
  }

  const healthBadge = $('healthBadge');

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
