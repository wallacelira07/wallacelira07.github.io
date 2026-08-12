// MÓDULO: tooltip de composição de saldo — Caixas Operacionais (NOVO 12/08/2026)
//
// Pedido do usuário: "quero que quando eu passar o mouse ou o dedo, ele deve mostrar o que se soma
// pra gerar" o valor de cada card da seção 05. Mostra, em hover (desktop) ou toque (mobile), a
// lista real de transações que somam o saldo exibido — não uma fórmula/explicação genérica, a
// lista de verdade, buscada ao vivo em `transacoes`.
//
// Risco identificado antes de implementar (mesma classe de bug já corrigida 2x nesta sessão —
// Onda 3 LRW/LRV, Comprometido Caixa Variável — onde uma segunda fonte mostrava número diferente
// do card): o filtro usado aqui (WallaceFinanceService.getTransacoesComposicaoSaldoCaixa) replica
// EXATAMENTE o filtro de vw_saldo_v2_por_caixa. Mesmo assim, se a soma da lista não bater com o
// valor do card (ex: card ainda em V1 por alguma exceção não mapeada), o tooltip avisa em vez de
// esconder a diferença (P1 — nunca esconder divergência).
//
// Cobertura: todas as 12 caixas da seção 05 já são V2-exclusivas (confirmado lendo
// hydrate-onda1-v2.js/hydrate-onda2-v2.js/hydrate-onda3-suavizacao.js/hydrate-onda4-wartsila.js
// antes de escrever isto) — não há caixa "V1 residual" nesta seção hoje, então não existe card
// aqui que precise de aviso permanente de fonte.
//
// Ativação: hover com pequeno atraso (250ms) no desktop; toque abre/fecha (toggle) no mobile —
// mesmo padrão de "tap pra abrir, tap fora pra fechar" já comum em painéis financeiros.
(function(){
  const ATRASO_HOVER_MS = 250;
  const MAPA_CAIXA_ID_CARD = {
    cxBoletosSaldo: 'Caixa Boletos',
    cxPixSaldo: 'PIX Vanessa',
    cxPgvSaldo: 'PIX Geral Vanessa',
    cxWartsila: 'Provisionado Wärtsilä',
    cxManutSaldo: 'Caixa Manutenção',
    cxBensDuraveisSaldo: 'Caixa Bens Duráveis',
    cxEventosSaldo: 'Caixa Eventos',
    cxSuavizSaldo: 'Conta Suavização (CC-304)',
    cxSaudeSaldo: 'Caixa Saúde Família',
    cxAnivSaldo: 'Caixa Aniversário Júlio',
    cxSeguroSaldo: 'Caixa Seguro Emplacamento',
    cxEscolaSaldo: 'Escola de Júlio',
  };

  let popoverEl = null;
  let hoverTimer = null;
  let cardAberto = null;

  function garantirEstilo(){
    if(document.getElementById('estiloTooltipComposicaoCaixa')) return;
    const style = document.createElement('style');
    style.id = 'estiloTooltipComposicaoCaixa';
    style.textContent = `
      [data-caixa-nome]{ cursor: help; transition: box-shadow 0.15s ease, border-color 0.15s ease; }
      [data-caixa-nome]:hover, [data-caixa-nome].tcc-aberto{ border-color: var(--border-strong); box-shadow: 0 0 0 1px var(--border-strong); }
      .tcc-popover{
        position: fixed; z-index: 600; width: min(320px, calc(100vw - 24px));
        background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius-lg);
        box-shadow: 0 12px 32px rgba(0,0,0,0.45); padding: 0.7rem 0.85rem; font-size: 0.76rem; color: var(--text-mid);
        max-height: min(320px, calc(100vh - 24px)); display: flex; flex-direction: column; gap: 0.5rem;
      }
      .tcc-titulo{ font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-dim); }
      .tcc-total{ font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
      .tcc-lista{ overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem; padding-right: 0.2rem; }
      .tcc-linha{ display: flex; justify-content: space-between; gap: 0.6rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
      .tcc-linha:last-child{ border-bottom: none; padding-bottom: 0; }
      .tcc-linha .tcc-desc{ min-width: 0; flex: 1 1 auto; }
      .tcc-linha .tcc-desc .tcc-data{ font-family: var(--mono); color: var(--text-dim); font-size: 0.68rem; }
      .tcc-linha .tcc-desc .tcc-nome{ display: block; overflow-wrap: anywhere; }
      .tcc-linha .tcc-valor{ flex: 0 0 auto; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
      .tcc-linha .tcc-valor.tcc-entrada{ color: var(--green); }
      .tcc-linha .tcc-valor.tcc-saida{ color: var(--text); }
      .tcc-vazio{ color: var(--text-dim); font-style: italic; }
      .tcc-aviso{ color: var(--amber); font-size: 0.68rem; line-height: 1.35; }
      .tcc-rodape{ font-size: 0.65rem; color: var(--text-dim); border-top: 1px solid var(--border); padding-top: 0.4rem; }
    `;
    document.head.appendChild(style);
  }

  function formatarValor(t){
    const sinal = t.tipo === 'entrada' ? '+' : '−';
    return sinal + ' ' + Math.abs(Number(t.valor)).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function formatarData(d){
    if(!d) return '—';
    const partes = d.slice(0,10).split('-');
    return partes.length === 3 ? partes[2]+'/'+partes[1] : d;
  }

  function fecharPopover(){
    if(popoverEl){ popoverEl.remove(); popoverEl = null; }
    if(cardAberto){ cardAberto.classList.remove('tcc-aberto'); cardAberto = null; }
    clearTimeout(hoverTimer);
  }

  function posicionar(el, pop){
    const r = el.getBoundingClientRect();
    document.body.appendChild(pop); // precisa estar no DOM pra medir a altura real
    const alturaPop = pop.getBoundingClientRect().height;
    const larguraPop = pop.getBoundingClientRect().width;
    let top = r.bottom + 8;
    if(top + alturaPop > window.innerHeight - 12) top = Math.max(12, r.top - alturaPop - 8);
    let left = r.left;
    if(left + larguraPop > window.innerWidth - 12) left = Math.max(12, window.innerWidth - larguraPop - 12);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  async function abrirPopover(el, caixaNome){
    fecharPopover();
    cardAberto = el;
    el.classList.add('tcc-aberto');

    const pop = document.createElement('div');
    pop.className = 'tcc-popover';
    pop.innerHTML = `<div class="tcc-titulo">${caixaNome} · transações do ciclo atual</div><div class="tcc-vazio">Carregando…</div>`;
    popoverEl = pop;
    posicionar(el, pop);

    let composicao;
    try {
      composicao = await WallaceFinanceService.getTransacoesComposicaoSaldoCaixa(caixaNome);
    } catch(err){
      console.error(`TooltipComposicaoCaixa: falha ao buscar composição de "${caixaNome}".`, err);
      if(popoverEl === pop) pop.innerHTML = `<div class="tcc-titulo">${caixaNome}</div><div class="tcc-vazio">Não consegui carregar as transações agora.</div>`;
      return;
    }
    if(popoverEl !== pop) return; // usuário já saiu/trocou de card enquanto a busca rodava

    const linhas = composicao.linhas;
    const total = linhas.reduce((s,t) => s + (t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor)), 0);
    const totalTxt = 'R$ ' + total.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

    const cardEl = el.querySelector('.v') || el;
    const valorCardTxt = (cardEl.textContent || '').trim();
    const valorCardNum = Number(valorCardTxt.replace(/[^0-9,-]/g,'').replace('.','').replace(',','.'));
    const divergeDoCard = !isNaN(valorCardNum) && Math.abs(valorCardNum - total) > 0.01;

    const listaHtml = linhas.length
      ? linhas.map(t => `
          <div class="tcc-linha">
            <div class="tcc-desc"><span class="tcc-data">${formatarData(t.data)}${t.tx_legado ? ' · '+t.tx_legado : ''}</span><span class="tcc-nome">${(t.descricao||'—').replace(/</g,'&lt;')}</span></div>
            <div class="tcc-valor ${t.tipo === 'entrada' ? 'tcc-entrada' : 'tcc-saida'}">${formatarValor(t)}</div>
          </div>`).join('')
      : `<div class="tcc-vazio">Nenhuma transação neste ciclo.</div>`;

    pop.innerHTML = `
      <div class="tcc-titulo">${caixaNome} · ${linhas.length} transação(ões) do ciclo atual</div>
      <div class="tcc-lista">${listaHtml}</div>
      <div class="tcc-rodape">Soma da lista: <span class="tcc-total">${totalTxt}</span></div>
      ${divergeDoCard ? `<div class="tcc-aviso">⚠ Diverge do valor mostrado no card (${valorCardTxt}) — pode ser saldo inicial de ciclo não vindo de transação individual. Não ajustado automaticamente.</div>` : ''}
    `;
    posicionar(el, pop);
  }

  function agendarAbertura(el, caixaNome){
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => abrirPopover(el, caixaNome), ATRASO_HOVER_MS);
  }

  function anexarListeners(){
    Object.keys(MAPA_CAIXA_ID_CARD).forEach(idHtml => {
      const valorEl = document.getElementById(idHtml);
      if(!valorEl) return;
      const card = valorEl.closest('.card');
      if(!card || card.dataset.caixaNome) return; // já anexado (evita duplicar em re-hidratação)
      const caixaNome = MAPA_CAIXA_ID_CARD[idHtml];
      card.dataset.caixaNome = caixaNome;

      // Desktop: hover com pequeno atraso.
      card.addEventListener('mouseenter', () => agendarAbertura(card, caixaNome));
      card.addEventListener('mouseleave', () => { clearTimeout(hoverTimer); if(cardAberto === card) fecharPopover(); });

      // Mobile/touch: toque alterna abrir/fechar (hover não existe de verdade em touch).
      card.addEventListener('click', (ev) => {
        if(cardAberto === card){ fecharPopover(); return; }
        ev.stopPropagation();
        abrirPopover(card, caixaNome);
      });
    });
  }

  document.addEventListener('click', (ev) => {
    if(popoverEl && !popoverEl.contains(ev.target) && cardAberto && !cardAberto.contains(ev.target)) fecharPopover();
  });
  window.addEventListener('scroll', fecharPopover, {passive:true});
  window.addEventListener('resize', fecharPopover);

  garantirEstilo();
  // As caixas da seção 05 são markup estático (não geradas por hydrate()) — já existem no DOM
  // assim que este script (carregado via __carregarScriptsParalelo) executa. Reanexa depois de
  // cada Onda relevante ser reidratada é desnecessário: os ids/estrutura do card nunca mudam,
  // só o texto interno — dataset.caixaNome guarda contra duplicar listener em qualquer re-chamada.
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', anexarListeners);
  else anexarListeners();
})();
