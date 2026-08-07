// MÓDULO: hydratePatrimonio() — renderização do bloco Patrimônio (breakdown + seção 11 Passivos Patrimoniais)
// Extraído de hydrate() (app.js) na modularização (07/08/2026). Script clássico (não ES module),
// carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate), dentro do próprio app.js) e
// chama hydratePatrimonio() no meio da própria execução. `PP` (=REG.passivosPatrimoniais) é usado só
// dentro deste bloco (conferido, sem uso posterior em hydrate()) — não precisa ser reinserido depois,
// diferente do que aconteceu com C/pctOf em hydrateCaixas(). Nenhum id de DOM, fórmula ou
// comportamento visual foi alterado.
function hydratePatrimonio(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // patrimonio breakdown
  t('patTotal', fmt(R.patrimonio.total));
  t('patReserva', fmt(R.patrimonioDetalhe.reserva));
  t('patBtg', fmt(R.patrimonioDetalhe.btg));
  t('patLance', fmt(R.patrimonioDetalhe.caixaLance));
  t('patEscola', fmt(R.patrimonioDetalhe.nectonContaCorrente));
  t('patAcumulado', fmt(R.patrimonio.total));
  t('patFalta', fmt(R.patrimonio.metaMilhao - R.patrimonio.total));
  t('patPctBadge', R.patrimonio.metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=$('patPctBar'); if(el) el.style.width = R.patrimonio.metaMilhaoPct+'%'; }

  // V142: secao 11 Passivos Patrimoniais
  const PP = R.passivosPatrimoniais;
  t('ppFinanciamentoCasa', fmt(PP.financiamentoCasa));
  t('ppFinanciamentoDetalhe', 'Prestação '+fmt(PP.prestacaoFinanciamentoCasa)+' · '+PP.mesesRestantesFinanciamentoCasa+' meses restantes');
  t('ppConsorcioAuto', fmt(PP.consorcioAuto));
  { const el=$('ppConsorcioAutoBar'); if(el) el.style.width = PP.consorcioAutoPct+'%'; }
  t('ppConsorcioAutoPct', PP.consorcioAutoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'% pago');
  t('ppConsorcioAutoParcela', 'Parcela '+fmt(PP.parcelaConsorcioAuto));
}
