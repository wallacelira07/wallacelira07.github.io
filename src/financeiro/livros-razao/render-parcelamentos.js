// MÓDULO: renderParcelamentos() — gera as tabelas de parcelamento LRP (Visa)/LRMP (Mercado Pago) +
// itens corporativos/avulsos do Mercado Pago filtrados por ciclo, a partir dos arrays estruturados
// VARS.PARCELAMENTOS_VISA/MP/TRANSACOES_CORPORATIVAS_MP. Extraído de app.js na modularização
// (07/08/2026) — função autocontida (só usa VARS/$/fmt). Chamada via onDomPronto(renderParcelamentos)
// em app.js, que continua igual. Nenhuma fórmula ou comportamento mudou.
// ADICIONADO 15/08/2026 (achado de auditoria de segurança: XSS real, mesma classe já corrigida em
// inbox-financeira.js/dashboard-navegacao.js — nome/descrição podem vir de texto externo e iam
// direto pra innerHTML sem escapar).
function _lrpEscapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// NOVO 19/08/2026 (pedido do usuário: "Parcelas é o 4844, essas são as parcelas que tenho, todas
// no Infinite" — coluna Origem fixa, mesmo motivo dos LRS/LRR: parcelamentos não vêm de
// `transacoes` linha a linha, então não há cartao_id por item, mas o cartão é sempre o mesmo).
const ORIGEM_LRP_FIXA = '<td style="color:var(--text-dim);font-size:var(--fs-2xs)">💳 ••••4844</td>';
const ORIGEM_LRMP_FIXA = '<td style="color:var(--text-dim);font-size:var(--fs-2xs)">💳 ••••7642</td>';
function renderParcelamentos(){
  const lrpTbody = $('lrpTbody');
  if(lrpTbody){
    lrpTbody.innerHTML = VARS.PARCELAMENTOS_VISA
      .filter(p => p.status === 'ATIVO')
      .map(p => {
        const ultima = p.parcelaAtual === p.totalParcelas;
        const emoji = ultima ? ' 🔚' : '';
        const classe = ultima ? ' class="last-parcel"' : '';
        return `<tr${classe}><td class="mono">${p.tx}</td><td>${_lrpEscapeHtml(p.nome)}${emoji}</td><td class="mono">${p.parcelaAtual}/${p.totalParcelas}</td>${ORIGEM_LRP_FIXA}<td class="r">${fmt(p.valor)}</td></tr>`;
      }).join('');
  }

  const lrmpTbody = $('lrmpTbody');
  if(lrmpTbody){
    lrmpTbody.innerHTML = VARS.PARCELAMENTOS_MP
      .filter(p => p.status === 'ATIVO')
      .map(p => {
        const ultima = p.parcelaAtual === p.totalParcelas;
        const emoji = ultima ? ' 🔚' : '';
        const classe = ultima ? ' class="last-parcel"' : '';
        return `<tr${classe}><td class="mono">${p.tx}</td><td>${_lrpEscapeHtml(p.nome)}${emoji}</td><td class="mono">${p.parcelaAtual}/${p.totalParcelas}</td>${ORIGEM_LRMP_FIXA}<td class="r">${fmt(p.valor)}</td></tr>`;
      }).join('');
  }

  // V159: filtro dinamico por DATA - itens corporativos/avulsos so aparecem se a data deles for
  // dentro do ciclo selecionado (usando o periodo real do CICLO_SNAPSHOTS, nao mais editado a mao).
  const lrmpCorpTbody = $('lrmpCorpTbody');
  if(lrmpCorpTbody){
    const snap = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
    const [iniStr, fimStr] = snap.periodo.split(' a ').map(s=>{
      const [d,m,a] = s.trim().split('/');
      return new Date(a, m-1, d);
    });
    const itensDoCiclo = VARS.TRANSACOES_CORPORATIVAS_MP.filter(t=>{
      const dt = new Date(t.data);
      return dt >= iniStr && dt <= fimStr;
    });
    lrmpCorpTbody.innerHTML = itensDoCiclo.map(t=>{
      const tipoLabel = t.tipo === 'corp' ? 'corp.' : 'único';
      return `<tr><td class="mono">${t.tx}</td><td>${_lrpEscapeHtml(t.nome)}</td><td class="mono">${tipoLabel}</td><td class="r">${fmt(t.valor)}</td></tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:1rem 0">Nenhum item corporativo/avulso neste ciclo.</td></tr>';
  }

  const qtdVisaAtivo = VARS.PARCELAMENTOS_VISA.filter(p=>p.status==='ATIVO').length;
  const qtdMPAtivo = VARS.PARCELAMENTOS_MP.filter(p=>p.status==='ATIVO').length;
  const snapAtual = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
  const [iniAtual, fimAtual] = snapAtual.periodo.split(' a ').map(s=>{
    const [d,m,a] = s.trim().split('/');
    return new Date(a, m-1, d);
  });
  const qtdCorpAtivo = VARS.TRANSACOES_CORPORATIVAS_MP.filter(t=>{
    const dt = new Date(t.data);
    return dt >= iniAtual && dt <= fimAtual;
  }).length;
  const lrpQtdEl = $('tfLRPQtd');
  if(lrpQtdEl) lrpQtdEl.textContent = qtdVisaAtivo+' lançamentos ativos · âmbar = última parcela';
  const lrmpQtdEl = $('tfLRMPQtd');
  if(lrmpQtdEl) lrmpQtdEl.textContent = (qtdMPAtivo+qtdCorpAtivo)+' lançamentos ('+qtdMPAtivo+' parcelas + '+qtdCorpAtivo+' corp./avulso, filtrado por ciclo)';
}
