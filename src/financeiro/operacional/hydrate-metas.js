// MÓDULO: hydrateMetas() — renderização de Consórcio Casa Nova (seção 12), Projeto Casa Nova
// (seção 13) e badges de metas no Resumo Executivo. Extraído de hydrate() (app.js) na
// modularização (07/08/2026). Script clássico (não ES module), carrega ANTES do app.js —
// hydrate() é síncrona (onDomPronto(hydrate), dentro do próprio app.js) e chama hydrateMetas() no
// meio da própria execução. Inclui a chamada pra hydrateROC() NO MEIO do corpo, na mesma posição
// exata do código original (a seção Opções/ROC ficava fisicamente entre Consórcio Casa Nova e
// Projeto Casa Nova) — preserva a ordem de execução original. `CCN`/`PCN`/`pctOf` redeclarados
// localmente (mesmo padrão de hydrateCaixas). Nenhum id de DOM, fórmula ou comportamento mudou.
function hydrateMetas(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;
  const pctOf = (s,m) => m>0 ? Math.min(100, s/m*100) : 0;

  // V139: secoes 12/13 (Consorcio Casa Nova / Projeto Casa Nova) - antes 100% texto fixo, sem id nenhum.
  const CCN = R.consorcioCasaNova, PCN = R.projetoCasaNova;
  t('ccnCartaCredito', fmt(CCN.cartaCredito));
  t('ccnParcela', fmt(CCN.parcela));
  t('ccnPagoPct', CCN.pagoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('ccnQuitacao', fmt(CCN.quitacaoValor)+' ('+CCN.quitacaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%)');
  { const el=$('ccnBar'); if(el) el.style.width = CCN.pagoPct+'%'; }
  // NOVO 31/07/2026 (V215): data da assembleia agora dinamica, com alerta automatico se ja passou -
  // antes era texto FIXO no HTML ("21/07/2026 ja passou"), corrigido uma vez pelo usuario mas
  // continuaria travado pra sempre se nao virasse formula. Compara com a data real de hoje.
  const consorcioAssembleiaEl = $('consorcioAssembleia');
  if(consorcioAssembleiaEl){
    const [d,m,a] = VARS.consorcioCasaProximaAssembleia.split('/').map(Number);
    const dataAssembleia = new Date(a, m-1, d);
    const hoje2 = new Date();
    if(dataAssembleia < hoje2){
      consorcioAssembleiaEl.innerHTML = VARS.consorcioCasaProximaAssembleia + ' <span style="color:var(--red)">⚠️ já passou — data desatualizada, confirmar com a administradora</span>';
    } else {
      consorcioAssembleiaEl.textContent = VARS.consorcioCasaProximaAssembleia;
    }
  }
  hydrateROC(); // MODULARIZAÇÃO 07/08/2026: seção 17 (Opções/ROC) extraída pra src/modules/hydrate-roc.js — mesma sequência, nenhum id/fórmula alterado.
  t('pcnCapital', fmt(PCN.capitalDisponivel));
  t('pcnPctBadge', PCN.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=$('pcnBar'); if(el) el.style.width = PCN.pct+'%'; }
  t('pcnMeta', 'Meta lance '+fmt(PCN.metaLance));
  t('pcnFalta', 'Falta '+fmt(PCN.falta));

  // V139: badges do Resumo Executivo - antes texto fixo duplicando numeros ja calculados em outro lugar
  t('r21ProjetoCasa', PCN.pct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('r21ConsorcioCasa', CCN.pagoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  t('r21EscolaJulio', pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  t('r21MetaInvest', fmt(R.metaInvestimento.investido)+' investido · '+(R.metaInvestimento.excedente>=0?'Superada +':'Falta ')+fmt(Math.abs(R.metaInvestimento.excedente)));
}
