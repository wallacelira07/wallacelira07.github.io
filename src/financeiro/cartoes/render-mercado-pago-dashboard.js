// MÓDULO: renderMercadoPagoDashboard() — painel flutuante 💰 V2, resumo dos eventos do Mercado Pago
// capturados na Inbox Financeira (receitas/gastos/eventos/pendentes). Extraído de app.js na
// modularização (07/08/2026) — função autocontida (só usa VARS/$/fmt). Chamada via
// onDomPronto(renderMercadoPagoDashboard) em app.js, que continua igual. Nenhuma fórmula ou
// comportamento mudou.
function renderMercadoPagoDashboard(){
  const el = $('mpDashboardResumo');
  if(!el) return; // secao pode nao existir num HTML antigo carregado em cache
  const itensMP = VARS.INBOX_FINANCEIRA.filter(i=>i.origem === 'Mercado Pago');
  if(!itensMP.length){
    el.innerHTML = '<div style="color:var(--text-dim);font-size:0.72rem">Nenhum evento do Mercado Pago capturado ainda — aguardando mercadopago_sync.py (V450) rodar e gravar VARS.MERCADOPAGO_EVENTOS.</div>';
    return;
  }
  const receitas = itensMP.filter(i=>i.valor > 0).reduce((s,i)=>s+i.valor, 0);
  const despesas = itensMP.filter(i=>i.valor < 0).reduce((s,i)=>s+Math.abs(i.valor), 0);
  const pendentes = itensMP.filter(i=>i.status === 'PENDENTE').length;
  el.innerHTML = `
    <div class="grid-4">
      <div><div style="color:var(--text-dim);font-size:0.65rem">Receitas (Inbox)</div><div class="v" style="color:var(--green)">${fmt(receitas)}</div></div>
      <div><div style="color:var(--text-dim);font-size:0.65rem">Gastos (Inbox)</div><div class="v" style="color:var(--red)">${fmt(despesas)}</div></div>
      <div><div style="color:var(--text-dim);font-size:0.65rem">Eventos capturados</div><div class="v">${itensMP.length}</div></div>
      <div><div style="color:var(--text-dim);font-size:0.65rem">Aguardando aprovação</div><div class="v">${pendentes}</div></div>
    </div>`;
}
