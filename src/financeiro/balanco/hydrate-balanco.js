// MÓDULO: hydrateBalanco() — renderização completa do Balanço Patrimonial (Reestruturação V2.0):
// Ativos Físicos, Ativos Financeiros, Passivos, PGBL/FGTS, Patrimônio Líquido/Total Geral (com faixa
// esperada por idade/renda), Reservas, Operacional, Obrigações, Fluxo, 4 quadrantes, LREI ativos no
// resumo do Balanço. Extraído de hydrate() (app.js) na modularização (07/08/2026) — última seção do
// hydrate() a ser modularizada, esgotando a função. Script clássico (não ES module), carrega ANTES do
// app.js — hydrate() é síncrona (onDomPronto(hydrate), dentro do próprio app.js) e chama
// hydrateBalanco() no meio da própria execução. Mantém a chamada a hydrateIndicadores() (já extraída
// anteriormente pra src/modules/hydrate-indicadores.js) na mesma posição exata do código original.
// Nenhum id de DOM, fórmula ou comportamento mudou.
function hydrateBalanco(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

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
  t('balPatrimonioTotalGeral', fmt(B.patrimonioTotalGeral));
  { const faixaEl = $('balPatrimonioTotalFaixa');
    if(faixaEl && B.patrimonioEsperadoRegraClassica){
      const pct = Math.round(B.patrimonioTotalGeral/B.patrimonioEsperadoRegraClassica*1000)/10;
      faixaEl.innerHTML = `${REG.idadeWallace} anos · esperado p/ idade+renda (regra Idade×Renda Anual÷10): <strong>${fmt(B.patrimonioEsperadoRegraClassica)}</strong> · você tem <strong>${pct.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong> disso — <strong style="color:${B.patrimonioTotalFaixa.cor}">${B.patrimonioTotalFaixa.label}</strong><br><span style="color:var(--text-dim)">Também equivale a ${B.patrimonioTotalMesesDeRenda.toLocaleString('pt-BR',{maximumFractionDigits:1})} meses (~${(B.patrimonioTotalMesesDeRenda/12).toLocaleString('pt-BR',{maximumFractionDigits:1})} anos) da renda atual.</span>`;
    }
  }
  // MODULARIZAÇÃO 07/08/2026: card PIB Wallace/Taxa de Poupança/Crescimento Patrimonial (seção 23)
  // extraído pra src/modules/hydrate-indicadores.js — mesma sequência, nenhum id/fórmula alterado.
  hydrateIndicadores();
  t('balResBoletos', fmt(B.operacional.caixaBoletos)); // V85: movida de reservas pra operacional
  t('balOpMastercardInfinite', fmt(B.operacional.mastercardInfinite)); // V139: nova caixa (24/07/2026), guarda valor a pagar dos 2 cartoes ate 28/07
  t('balResEscola', fmt(B.reservas.escolaJulio));
  t('balResLance', fmt(B.reservas.caixaLance));
  t('balResManut', fmt(B.reservas.manutencao));
  t('balResEventos', fmt(B.reservas.eventos));
  t('balResChurrasco', fmt(B.reservas.churrasco));
  t('balResSaude', fmt(B.reservas.saudeFamilia));
  t('balResSeguro', fmt(B.reservas.seguroEmplacamento));
  t('balResAniv', fmt(B.reservas.aniversarioJulio));
  t('balResPixVanessa', fmt(B.reservas.pixVanessa));
  t('balResCombustivel', fmt(B.reservas.combustivel));
  t('balResBensDuraveis', fmt(B.reservas.bensDuraveis));
  t('balResSuavizacao', fmt(B.reservas.suavizacao));
  t('balReservasTotal', fmt(B.reservas.total));
  t('balOpCaixaVariavel', fmt(B.operacional.caixaVariavel));
  t('balOpPixVanessa', fmt(B.operacional.pixVanessaSaldoReal));
  t('balOperacionalTotal', fmt(B.operacional.total));
  t('balObrVisa', fmt(B.obrigacoes.visa));
  t('balObrMB', fmt(B.obrigacoes.mastercardBlack));
  t('balObrMP', fmt(B.obrigacoes.mercadoPago));
  // CORRIGIDO 07/08/2026: mostrava VARS.faturaMPCorporativoPendente (acumulado, não escopado ao
  // ciclo) apesar do rótulo dizer "ciclo atual". Agora mostra o corporativo do ciclo de verdade,
  // calculado por competência (REG.balanco.corporativoMPDoCiclo, ver recalcularAgregadosDerivados()).
  t('balObrWartsila', fmt(REG.balanco.corporativoMPDoCiclo));
  // NOVO 07/08/2026: indicador separado, só informativo — reembolso Wärtsilá pendente acumulado.
  // NÃO participa de nenhuma conta de ciclo (Mercado Pago líquido, Fatura do Ciclo, Corporativo do
  // Ciclo, necessidade do ciclo) — é só "quanto ainda falta a Wärtsilá me devolver", histórico.
  // REVISADO 09/08/2026: usuário pediu pra checar se esse valor (R$1.544,11, parado desde 27/07) já
  // estava contido no "Amount Due Employee" da Wärtsilá (R$6.700,61, confirmado hoje) - decisão
  // explícita: NÃO corrigir/zerar/recalcular sem evidência (falta confirmar o detalhamento do sistema
  // da Wärtsilá). Mantido apontando pra VARS.faturaMPCorporativoPendente como estava - só ganhou aviso
  // de "necessita confirmação" no HTML (ver Sistema_Wallace_Lira_Completo.html, mesma linha do card).
  const elWartsilaAcumulado = $('balReembolsoWartsilaAcumulado');
  if(elWartsilaAcumulado) elWartsilaAcumulado.textContent = fmt(VARS.faturaMPCorporativoPendente);
  // CORRIGIDO 30/07/2026 (V208): balLreiAtivos era texto FIXO "Nenhum (LREI0001 quitado 21/07)" -
  // mesmo depois de LREI0002+LREI0003 ficarem ativas (27/07), esse card resumo do Balanço nunca foi
  // conectado ao array real (a aba LREI dedicada ja tinha sido corrigida em V189, mas ESTE card,
  // separado, ficou esquecido - mesma classe de bug, lugar diferente). Usuario apontou via print.
  const lreiAtivosNow = VARS.LREI_ATIVAS.filter(l=>l.status==='ATIVO');
  const balLreiEl = $('balLreiAtivos');
  if(balLreiEl){
    if(lreiAtivosNow.length === 0){
      balLreiEl.textContent = 'Nenhum';
    } else {
      balLreiEl.textContent = lreiAtivosNow.length + ' ativo(s): ' + lreiAtivosNow.map(l=>l.id+' ('+fmt(l.valor)+')').join(', ');
    }
  }
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
