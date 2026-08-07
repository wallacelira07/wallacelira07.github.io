// MÓDULO: renderLivrosVariaveis() — gera as tabelas HTML de LRW/LRV/LRC-limbo/LRCV/LRPV/PV/LRBD +
// as 9 caixas "LR simples" (Lance/Manutenção/Aniversário Júlio/Eventos/Saúde Família/Seguro
// Emplacamento/Combustível/Churrasco/Mastercard Infinite) + tabela de LREI (Empréstimos Internos) a
// partir dos arrays estruturados em VARS. Extraído de app.js na modularização (07/08/2026) — função
// autocontida (só usa VARS/$/fmt, nenhuma dependência de escopo externo). Chamada via
// onDomPronto(renderLivrosVariaveis) em app.js, que continua igual (é só uma referência de função
// global — precisa existir antes do app.js carregar, por isso este módulo é estático, ANTES do
// app.js, mesmo padrão dos módulos hydrate-*). Nenhuma fórmula ou comportamento mudou.
function renderLivrosVariaveis(){
  function linha(t, temTipo){
    const obsHtml = t.obs ? ` <span style="font-size:0.62rem;color:var(--text-dim)">· ${t.obs}</span>` : '';
    if(temTipo) return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.tipo||'PIX'}${obsHtml}</td><td class="r">${fmt(t.valor)}</td></tr>`;
    return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}${obsHtml}</td><td class="r">${fmt(t.valor)}</td></tr>`;
  }
  function preencher(id, arr, temTipo){
    const tbody = $(id);
    if(!tbody) return;
    if(!arr.length){
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação neste ciclo ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = arr.map(t=>linha(t, temTipo)).join('');
  }
  preencher('lrwTbody', VARS.LRW_TRANSACOES, false);
  preencher('lrvTbody', VARS.LRV_TRANSACOES, false);
  preencher('lrcLimboTbody', VARS.LRC_LIMBO_TRANSACOES, false);
  preencher('lrcvTbody', VARS.LRCV_TRANSACOES, true);

  // LRPV tem formato proprio (Entrada/Saida colorida) - renderizacao especifica, nao usa preencher() generico
  const lrpvTbody = $('lrpvTbody');
  if(lrpvTbody){
    if(!VARS.LRPV_TRANSACOES.length){
      lrpvTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação ainda.</td></tr>';
    } else {
      lrpvTbody.innerHTML = VARS.LRPV_TRANSACOES.map(t=>{
        const cor = t.tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
        return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}</td><td style="color:${cor}">${t.tipo}</td><td class="r">${fmt(t.valor)}</td></tr>`;
      }).join('');
    }
    const tfLRPVEl = $('tfLRPV');
    if(tfLRPVEl){
      const liquido = VARS.LRPV_TRANSACOES.reduce((s,t)=> s + (t.tipo==='Entrada'?t.valor:-t.valor), 0);
      tfLRPVEl.textContent = fmt(Math.round(liquido*100)/100);
    }
  }

  // V176: painel PV (reserva do Wallace) - mesma logica do PGV, array proprio (VARS.PV_TRANSACOES)
  const lrpvsaldoTbody = $('lrpvsaldoTbody');
  if(lrpvsaldoTbody){
    if(!VARS.PV_TRANSACOES.length){
      lrpvsaldoTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação ainda.</td></tr>';
    } else {
      lrpvsaldoTbody.innerHTML = VARS.PV_TRANSACOES.map(t=>{
        const cor = t.tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
        return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}</td><td style="color:${cor}">${t.tipo}</td><td class="r">${fmt(t.valor)}</td></tr>`;
      }).join('');
    }
    const tfPVEl = $('tfPV');
    if(tfPVEl){
      const liquido = VARS.PV_TRANSACOES.reduce((s,t)=> s + (t.tipo==='Entrada'?t.valor:-t.valor), 0);
      tfPVEl.textContent = fmt(Math.round(liquido*100)/100);
    }
    const qtdPVEl = $('qtdPV');
    if(qtdPVEl) qtdPVEl.textContent = VARS.PV_TRANSACOES.length+' lançamento(s)';
  }

  // NOVO 05/08/2026: painel LRBD (Bens Duraveis) - mesma logica do PV
  const lrbdTbody = $('lrbdTbody');
  if(lrbdTbody){
    if(!VARS.BENS_DURAVEIS_TRANSACOES.length){
      lrbdTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação ainda.</td></tr>';
    } else {
      lrbdTbody.innerHTML = VARS.BENS_DURAVEIS_TRANSACOES.map(t=>{
        const cor = t.tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
        return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}</td><td style="color:${cor}">${t.tipo}</td><td class="r">${fmt(t.valor)}</td></tr>`;
      }).join('');
    }
    const tfBDEl = $('tfBD');
    if(tfBDEl) tfBDEl.textContent = fmt(VARS.caixaBensDuraveis);
    const qtdBDEl = $('qtdBD');
    if(qtdBDEl) qtdBDEl.textContent = VARS.BENS_DURAVEIS_TRANSACOES.length+' lançamento(s)';
  }

  // NOVO 05/08/2026 (parte 99, pedido repetido do usuario: "nao esqueça, cada caixa deve ter seu LR").
  // Generalizado o MESMO padrao ja usado no LRBD acima (nunca reescrito 9x) pras 9 caixas que ainda nao
  // tinham aba propria, mesmo ja tendo array de transacoes real no Supabase havia sessoes: Caixa Lance,
  // Manutencao, Aniversario Julio, Eventos, Saude Familia, Seguro/Emplacamento, Combustivel, Churrasco,
  // Mastercard/Infinite. Config unica abaixo - uma caixa nova so precisa de 1 linha aqui + o par
  // botao/pane no HTML (ver checklist no comentario de atualizarContadoresAbasLR).
  const CAIXAS_LR_SIMPLES = [
    { id:'lrlance',     arr:'CAIXA_LANCE_TRANSACOES',           saldo:'caixaLance' },
    { id:'lrmanut',     arr:'MANUTENCAO_TRANSACOES',            saldo:'caixaManutencao' },
    { id:'lraniv',      arr:'ANIVERSARIO_JULIO_TRANSACOES',     saldo:'caixaAniversarioJulio' },
    { id:'lreventos',   arr:'EVENTOS_TRANSACOES',               saldo:'caixaEventos' },
    { id:'lrsaude',     arr:'SAUDE_FAMILIA_TRANSACOES',         saldo:'caixaSaudeFamilia' },
    { id:'lrseguro',    arr:'SEGURO_EMPLACAMENTO_TRANSACOES',   saldo:'caixaSeguroEmplacamento' },
    { id:'lrcomb',      arr:'COMBUSTIVEL_TRANSACOES',           saldo:'caixaCombustivel' },
    { id:'lrchurrasco', arr:'CHURRASCO_TRANSACOES',             saldo:'caixaChurrasco' },
    { id:'lrmci',       arr:'MASTERCARD_INFINITE_TRANSACOES',   saldo:'caixaMastercardInfinite' }
  ];
  CAIXAS_LR_SIMPLES.forEach(cfg=>{
    const tbody = $(cfg.id+'Tbody');
    if(!tbody) return; // pane ainda nao existe neste HTML (versao antiga em cache) - nao quebra
    const arr = VARS[cfg.arr] || [];
    if(!arr.length){
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação ainda.</td></tr>';
    } else {
      tbody.innerHTML = arr.map(t=>{
        const cor = t.tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
        return `<tr><td class="mono">${t.tx}</td><td class="mono">${t.data}</td><td>${t.nome}</td><td style="color:${cor}">${t.tipo}</td><td class="r">${fmt(t.valor)}</td></tr>`;
      }).join('');
    }
    const tfEl = $('tf_'+cfg.id);
    if(tfEl) tfEl.textContent = fmt(VARS[cfg.saldo]);
    const qtdEl = $('qtd_'+cfg.id);
    if(qtdEl) qtdEl.textContent = arr.length+' lançamento(s)';
  });

  const somaLRW = VARS.LRW_TRANSACOES.reduce((s,t)=>s+t.valor,0);
  const somaLRV = VARS.LRV_TRANSACOES.reduce((s,t)=>s+t.valor,0);
  const tfLRWEl = $('tfLRW');
  if(tfLRWEl) tfLRWEl.textContent = fmt(somaLRW);
  const tfLRVEl = $('tfLRV');
  if(tfLRVEl) tfLRVEl.textContent = fmt(somaLRV);
  const qtdLRWEl = $('qtdLRW');
  if(qtdLRWEl) qtdLRWEl.textContent = VARS.LRW_TRANSACOES.length+' lançamento(s)';
  const qtdLRVEl = $('qtdLRV');
  if(qtdLRVEl) qtdLRVEl.textContent = VARS.LRV_TRANSACOES.length+' lançamento(s)';

  // V189 (27/07/2026): LREI (Empréstimos Internos) tornado dinâmico - antes era HTML fixo com texto
  // "Nenhum empréstimo interno ativo no momento" hardcoded, mesmo com LREI_ATIVAS já tendo 2 dívidas
  // reais (LREI0002 Saúde Família R$164,94 + LREI0003 Fatura Mercado Pago R$266,23) - o array existia
  // no VARS mas nada lia ele pra tela. Bug apontado pelo usuário via print do painel real.
  const lreiTbody = $('lreiTbody');
  if(lreiTbody){
    if(!VARS.LREI_ATIVAS.length){
      lreiTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhum empréstimo interno ativo no momento.</td></tr>';
    } else {
      const hoje = new Date();
      lreiTbody.innerHTML = VARS.LREI_ATIVAS.map(l=>{
        const [d,m] = l.data.split('/').map(Number);
        const dataAbertura = new Date(hoje.getFullYear(), m-1, d);
        const idadeDias = Math.max(0, Math.round((hoje - dataAbertura)/(1000*60*60*24)));
        const corStatus = l.status === 'ATIVO' ? 'var(--text-danger)' : 'var(--green)';
        return `<tr><td class="mono">${l.id}</td><td class="mono">${l.data}</td><td>${l.credora}</td><td>${l.devedora}</td><td class="r">${fmt(l.valor)}</td><td>${idadeDias}d</td><td style="color:${corStatus}">${l.status}</td></tr>`;
      }).join('');
    }
  }
  const lreiTabBtn = $('lrTabBtn_lrei');
  if(lreiTabBtn) lreiTabBtn.textContent = `LREI - Empréstimos (${VARS.LREI_ATIVAS.length})`;
}
