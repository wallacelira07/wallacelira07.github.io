// MÓDULO: hydrateMercadoPago() — renderização dos indicadores de Mercado Pago (fatura, parcelas
// próprias, transporte corporativo). Extraído de hydrate() (app.js) na modularização (07/08/2026).
// Só a parte de renderização — a lógica de cálculo do Mercado Pago (corporativoMPDoCiclo etc.) mora
// em recalcularAgregadosDerivados(), não foi tocada. Script clássico (não ES module), carrega ANTES
// do app.js — hydrate() é síncrona (onDomPronto(hydrate), dentro do próprio app.js) e chama
// hydrateMercadoPago() no meio da própria execução. Nenhum id de DOM, fórmula ou comportamento mudou.
function hydrateMercadoPago(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // mercado pago
  // CORRIGIDO 05/08/2026 (parte 104): quando o valor exibido vem do fallback (Pluggy devolveu 0 mas o
  // ERP tem soma propria real), mostra um aviso pequeno junto do numero - nunca deixa parecer que foi a
  // Pluggy quem confirmou, quando na verdade foi calculado aqui por causa da falha dela.
  const mpFaturaEl = $('mpFatura');
  if(mpFaturaEl){
    mpFaturaEl.innerHTML = fmt(R.mercadoPago) + (VARS.mercadoPagoFaturaOrigem === 'fallback_erp_pluggy_zerada'
      ? ' <span style="font-size:0.62rem;color:var(--text-dim)" title="Pluggy devolveu R$0,00 pra fatura deste mês; valor calculado a partir do ERP (Parcelas próprias + Transporte corporativo)">⚠ calculado (Pluggy zerada)</span>'
      : '');
  }
  t('mpProprias', fmt(R.totalOpDetalhe.provMP));
  t('mpTransporteCorp', fmt(R.operacional.reembolsoPagaMPCorporativo));
}
