// MÓDULO: aba "⚖️ Emagrecimento" (NOVA 12/08/2026, pedido do usuário). Escopo inicial, deliberado:
// só peso (pesagens datadas + gráfico de evolução, sem meta) e o custo da caneta Ozivy Semaglutida
// (caixa V2 dedicada "Saúde - Emagrecimento", aporte mensal fixo em VARS.saudeEmagrecimentoAporte —
// ver vars-operacional.js). Medidas corporais/dose por pesagem ficaram de fora por pedido explícito
// do usuário ("só peso pra começar") — podem entrar depois sem quebrar o que já existe (tabela
// `pesagens` só ganharia colunas novas, nunca precisa recriar).
//
// Fonte: tabela `pesagens` (V2, 1 linha por data) via WallaceFinanceService.getPesagens(), e
// vw_saldo_v2_por_caixa (já usada em todo o resto do site) filtrada pelo nome da caixa nova.
//
// Rollback: comentar a chamada aplicarEmagrecimento() em app.js — a aba fica com "—" em tudo,
// nenhum outro módulo depende deste.

async function aplicarEmagrecimento(){
  const fmtKg = v => v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kg';
  const elAviso = $('emgAviso');

  let pesagens;
  try {
    pesagens = await WallaceFinanceService.getPesagens();
  } catch(err){
    console.error('Emagrecimento: falha ao buscar pesagens.', err);
    if(elAviso) elAviso.textContent = '⚠ Indisponível (V2) — não foi possível carregar as pesagens.';
    window.WALLACE_EMAGRECIMENTO_RELATORIO = { status: 'erro_pesagens', erro: String(err) };
    return;
  }

  if(!Array.isArray(pesagens) || !pesagens.length){
    $('emgPesoAtual').textContent = 'Sem pesagem ainda';
    $('emgVariacaoTotal').textContent = '—';
    if(elAviso) elAviso.textContent = 'Nenhuma pesagem registrada ainda — assim que a primeira chegar, o gráfico aparece aqui.';
  } else {
    const primeira = pesagens[0];
    const ultima = pesagens[pesagens.length-1];
    const variacao = Math.round((ultima.peso_kg - primeira.peso_kg)*10)/10;
    $('emgPesoAtual').textContent = fmtKg(ultima.peso_kg);
    const elVar = $('emgVariacaoTotal');
    if(elVar){
      elVar.textContent = (variacao>0?'+':'')+fmtKg(variacao)+` (desde ${primeira.data.split('-').reverse().join('/')})`;
      elVar.style.color = variacao <= 0 ? '#34c98a' : '#e2554f';
    }
    if(elAviso) elAviso.textContent = `${pesagens.length} pesagem(ns) registrada(s). Sem meta definida — só evolução real, por enquanto.`;

    const labels = pesagens.map(p => p.data.split('-').reverse().slice(0,2).join('/'));
    const dados = pesagens.map(p => Number(p.peso_kg));
    const canvas = $('cEmagrecimentoPeso');
    if(canvas && typeof Chart !== 'undefined'){
      const existente = Chart.getChart(canvas);
      if(existente) existente.destroy();
      const grid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#262a32';
      new Chart(canvas, {
        type:'line',
        data:{labels, datasets:[{data:dados,
          borderColor:'#4c8ef2', backgroundColor:'rgba(76,142,242,0.08)',
          borderWidth:2.5, pointBackgroundColor:'#4c8ef2', pointBorderColor:'#16181b',
          pointBorderWidth:2, pointRadius:4, fill:true, tension:0.3}]},
        options:{responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmtKg(c.raw)}}},
          scales:{x:{grid:{display:false}, ticks:{font:{size:10}}},
            y:{grid:{color:grid}, ticks:{font:{size:10}}}}}
      });
    }
  }

  // Custo do tratamento (caneta Ozivy Semaglutida) — caixa dedicada, mesmo padrão de leitura de
  // saldo já usado em todo o resto do site (vw_saldo_v2_por_caixa).
  $('emgAporteMensal').textContent = fmt(VARS.saudeEmagrecimentoAporte)+'/mês';
  const elAvisoCusto = $('emgAvisoCusto');
  try {
    const saldos = await WallaceFinanceService.getSaldosPorCaixa();
    const caixa = Array.isArray(saldos) ? saldos.find(c => c.caixa_nome === 'Saúde - Emagrecimento') : null;
    if(caixa){
      $('emgSaldoCaixa').textContent = fmt(Number(caixa.v2_saldo_calculado));
      if(elAvisoCusto) elAvisoCusto.textContent = Number(caixa.v2_saldo_calculado) === 0
        ? 'Nenhuma compra lançada ainda nesta caixa — o aporte mensal acima ainda não teve uma transação real registrada.'
        : '';
    } else {
      $('emgSaldoCaixa').textContent = '⚠ Indisponível (V2)';
      if(elAvisoCusto) elAvisoCusto.textContent = 'Caixa "Saúde - Emagrecimento" não encontrada na V2 — confirme se ela existe em `caixas`.';
    }
  } catch(err){
    console.error('Emagrecimento: falha ao buscar saldo da caixa.', err);
    $('emgSaldoCaixa').textContent = '⚠ Indisponível (V2)';
  }

  window.WALLACE_EMAGRECIMENTO_RELATORIO = {
    qtdPesagens: Array.isArray(pesagens) ? pesagens.length : 0,
    ultimaPesagem: (Array.isArray(pesagens) && pesagens.length) ? pesagens[pesagens.length-1] : null,
    aporteMensal: VARS.saudeEmagrecimentoAporte,
  };
  console.log('Emagrecimento: relatório completo em window.WALLACE_EMAGRECIMENTO_RELATORIO', window.WALLACE_EMAGRECIMENTO_RELATORIO);
}
