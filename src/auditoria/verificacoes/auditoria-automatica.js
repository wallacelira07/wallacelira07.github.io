// MÓDULO: auditoriaAutomatica() — confere a matemática interna do REG (12 relações: cartões,
// Balanço Ativos/Passivos/Patrimônio Líquido, cascata de reembolso, Caixa Variável, Reservas,
// Patrimônio Financeiro, Meta do Milhão, Total Operacional, Visa/Mastercard Black). Loga no console e
// mostra badge/aviso discreto no rodapé se achar divergência; nunca bloqueia a página. Extraído de
// app.js na modularização (07/08/2026) — função autocontida (só usa REG/VARS/$/console/DOM básico).
// Chamada via onDomPronto(auditoriaAutomatica) em app.js, que continua igual. Nenhuma fórmula ou
// comportamento mudou.
function auditoriaAutomatica(){
  const problemas = [];
  const naoAuditaveis = []; // NOVO 12/08/2026 (Prioridade 0): checks #11/#12 caem aqui quando o gap
  // observado é 100% explicado por lacuna de dado conhecida (cartaoIdCoberturaInsuficienteVisa),
  // nunca uma divergência real — ver comentário completo nos checks abaixo e em vars-mercado-pago.js.
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
    // NOVO 12/08/2026 (Prioridade 0, achado confirmado por SQL direto): "wallace" (LRW, compras
    // variáveis) nos dois cartões depende de cartao_id, e o Visa Infinite não tem cobertura nenhuma
    // dessa coluna na V2 - toda transação com cartao_id preenchido é do Mastercard Black. Não é bug
    // de cálculo, é ausência de dado auditável (item 5, PLANO_UNIFICACAO_V1_V2.md). Enquanto isso,
    // #11/#12 comparavam a soma INTEIRA (incluindo wallace) contra o total da fatura e sempre
    // acusavam "divergência" - mesmo com as outras 7 partes de cada cartão batendo certinho. Agora:
    // soma só as partes AUDITÁVEIS (sem wallace) e checa que elas cabem dentro do total da fatura -
    // se couberem, o resto é exatamente a lacuna conhecida (marca "não auditável", não divergência);
    // se ultrapassarem o total sozinhas, isso É impossível sem erro real (marca divergência, igual
    // sempre foi).
    const semCoberturaVisa = !!VARS.cartaoIdCoberturaInsuficienteVisa;

    const vd = REG.visaDetalhe;
    const visaAuditavelCalc = round2(vd.parcelas+vd.consorcios+vd.recorrencias+vd.corp+vd.assinaturas+vd.vanessa+vd.naoReconciliado);
    const visaDetalheCalc = round2(visaAuditavelCalc + vd.wallace);
    if(semCoberturaVisa){
      if(visaAuditavelCalc - 0.02 > REG.cartaoInfinite.total){
        problemas.push(`Visa Infinite: soma das partes AUDITÁVEIS (sem LRW/wallace)=${visaAuditavelCalc} já ultrapassa cartaoInfinite.total(${REG.cartaoInfinite.total}) — isso é impossível só pela lacuna de cartao_id, indica divergência real.`);
      } else if(!bate(visaDetalheCalc, REG.cartaoInfinite.total)){
        naoAuditaveis.push(`Visa Infinite: LRW (compras variáveis, R$${round2(REG.cartaoInfinite.total - visaAuditavelCalc)}) não auditável — Visa Infinite sem cobertura de cartao_id na V2 (item 5, PLANO_UNIFICACAO_V1_V2.md). Partes auditáveis batem dentro do total: ${visaAuditavelCalc} ≤ ${REG.cartaoInfinite.total}.`);
      }
    } else if(!bate(visaDetalheCalc, REG.cartaoInfinite.total)){
      problemas.push(`Visa Infinite: soma visaDetalhe=${visaDetalheCalc} ≠ cartaoInfinite.total(${REG.cartaoInfinite.total})`);
    }

    // 12) Mastercard Black: soma do detalhamento (mbDetalhe) = total do card (ADICIONADO 22/07/2026, V135 -
    // mesma classe de checagem que faltava; foi por isso que mbDetalhe.wallace ficou 3 rodadas desatualizado
    // sem ninguem perceber - nada comparava a soma das partes com o total)
    // NOVO 12/08/2026: mbLRWConfirmado herda, por convenção histórica, todo gasto variável sem
    // cartao_id identificado (não só o do MB de verdade) - mesma lacuna do Visa, só que do lado
    // oposto (aqui o "wallace" pode estar inflado em vez de faltando). Mesmo tratamento: se as partes
    // auditáveis (sem wallace) já excedem o total sozinhas, é divergência real de verdade; senão, o
    // desvio é a lacuna conhecida.
    const md = REG.mbDetalhe;
    const mbAuditavelCalc = round2(md.parcelas+md.consorcios+md.recorrencias+md.corp+md.assinaturas+md.vanessa+md.naoReconciliado);
    const mbDetalheCalc = round2(mbAuditavelCalc + md.wallace);
    if(semCoberturaVisa){
      if(mbAuditavelCalc - 0.02 > REG.cartaoMB.total){
        problemas.push(`Mastercard Black: soma das partes AUDITÁVEIS (sem LRW/wallace)=${mbAuditavelCalc} já ultrapassa cartaoMB.total(${REG.cartaoMB.total}) — isso é impossível só pela lacuna de cartao_id, indica divergência real.`);
      } else if(!bate(mbDetalheCalc, REG.cartaoMB.total)){
        naoAuditaveis.push(`Mastercard Black: LRW (compras variáveis, diferença de R$${round2(mbDetalheCalc - REG.cartaoMB.total)}) não auditável — mbLRWConfirmado inclui gasto variável sem cartao_id atribuído por convenção, mesma lacuna do Visa Infinite (item 5, PLANO_UNIFICACAO_V1_V2.md).`);
      }
    } else if(!bate(mbDetalheCalc, REG.cartaoMB.total)){
      problemas.push(`Mastercard Black: soma mbDetalhe=${mbDetalheCalc} ≠ cartaoMB.total(${REG.cartaoMB.total})`);
    }
  }

  const healthBadge = $('healthBadge');

  // NOVO 12/08/2026 (Prioridade 0): badge/footer agora só ficam vermelhos por divergência REAL
  // (problemas). "Não auditável" (lacuna de dado conhecida, não erro) aparece à parte, em amarelo,
  // sem contar como divergência - nem escondido (continua visível e no console), nem tratado como
  // se fosse igual a um erro real.
  if(problemas.length === 0){
    console.log('%c✅ Auditoria automática: 0 divergências encontradas na matemática do REG.', 'color:#34c98a;font-weight:600');
    if(naoAuditaveis.length){
      console.warn('ℹ️ Auditoria automática: itens não auditáveis (lacuna de dado conhecida, não é divergência):');
      naoAuditaveis.forEach(p => console.warn('  - ' + p));
    }
    if(healthBadge){
      if(naoAuditaveis.length){
        healthBadge.textContent = `✅ Sistema íntegro · ⚠️ ${naoAuditaveis.length} não auditável(is)`;
        healthBadge.style.color = '#e2c46a';
        healthBadge.title = `0 divergências reais.\n\nNão auditável (lacuna de dado conhecida, não é erro):\n${naoAuditaveis.join('\n')}`;
      } else {
        healthBadge.textContent = '✅ Sistema íntegro';
        healthBadge.style.color = '#34c98a';
        healthBadge.title = 'Auditoria automática: 0 divergências nas 12 relações matemáticas do REG.';
      }
    }
  } else {
    console.warn('⚠️ Auditoria automática encontrou divergências:');
    problemas.forEach(p => console.warn('  - ' + p));
    if(naoAuditaveis.length){
      console.warn('ℹ️ Auditoria automática: itens não auditáveis (lacuna de dado conhecida, não é divergência):');
      naoAuditaveis.forEach(p => console.warn('  - ' + p));
    }
    if(healthBadge){
      healthBadge.textContent = `⚠️ ${problemas.length} divergência(s) — ver console`;
      healthBadge.style.color = '#e2554f';
      healthBadge.title = problemas.join('\n') + (naoAuditaveis.length ? `\n\nNão auditável (lacuna de dado conhecida, não é erro):\n${naoAuditaveis.join('\n')}` : '');
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
