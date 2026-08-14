// MÓDULO: aba "⚖️ Emagrecimento" (NOVA 12/08/2026, pedido do usuário). Escopo inicial, deliberado:
// só peso (pesagens datadas + gráfico de evolução, sem meta) e o custo da caneta Ozivy Semaglutida
// (caixa V2 dedicada "Emagrecimento", aporte mensal fixo em VARS.saudeEmagrecimentoAporte —
// ver vars-operacional.js). Medidas corporais/dose por pesagem ficaram de fora por pedido explícito
// do usuário ("só peso pra começar") — podem entrar depois sem quebrar o que já existe (tabela
// `pesagens` só ganharia colunas novas, nunca precisa recriar).
//
// AMPLIADO 13/08/2026 (pedido do usuário: "crie um gráfico com tabela para controlar as aplicações
// do Ozivy, apliquei a primeira hoje, preciso desse controle" — 1ª aplicação 13/08/2026, 0,25mg,
// dose inicial de titulação): tabela `aplicacoes_ozivy` (mesmo padrão de `pesagens`, 1 linha por
// data, RLS só leitura — insert feito manualmente/via agente conforme cada aplicação real acontece,
// não existe formulário no painel pra digitar isso). Semaglutida é aplicação SEMANAL — "Próxima
// prevista" é só a última data +7 dias, não uma confirmação médica.
//
// Fonte: tabela `pesagens` (V2, 1 linha por data) via WallaceFinanceService.getPesagens(), tabela
// `aplicacoes_ozivy` via WallaceFinanceService.getAplicacoesOzivy(), e vw_saldo_v2_por_caixa (já
// usada em todo o resto do site) filtrada pelo nome da caixa nova.
//
// Rollback: comentar a chamada aplicarEmagrecimento() em app.js — a aba fica com "—" em tudo,
// nenhum outro módulo depende deste.

async function aplicarEmagrecimento(){
  const fmtKg = v => v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kg';
  const elAviso = $('emgAviso');

  // CORRIGIDO 14/08/2026 (auditoria de performance: as 3 buscas desta função — pesagens, aplicações
  // do Ozivy [dentro de aplicarOzivyAplicacoes()] e saldo da caixa Emagrecimento — são 100%
  // independentes entre si, nenhuma lê o resultado da outra, mas rodavam em SÉRIE, await após await
  // (3 round-trips somados em vez do maior dos 3). Disparadas aqui, ANTES do primeiro await, as 3
  // já saem baixando em paralelo — aplicarOzivyAplicacoes() trata o próprio erro internamente (nunca
  // rejeita pro chamador, então não precisa de .catch aqui); promessaSaldos ganha um .catch vazio só
  // pra não gerar "unhandled rejection" no caminho de erro de pesagens (return antecipado logo
  // abaixo) — o catch de verdade continua isolado, mais abaixo, exatamente como antes.
  const promessaOzivyAplicacoes = aplicarOzivyAplicacoes();
  const promessaSaldosPorCaixa = WallaceFinanceService.getSaldosPorCaixa();
  promessaSaldosPorCaixa.catch(function(){});

  let pesagens;
  try {
    pesagens = await WallaceFinanceService.getPesagens();
  } catch(err){
    console.error('Emagrecimento: falha ao buscar pesagens.', err);
    if(elAviso) elAviso.textContent = '⚠ Indisponível (V2) — não foi possível carregar as pesagens.';
    window.WALLACE_EMAGRECIMENTO_RELATORIO = { status: 'erro_pesagens', erro: String(err) };
    return;
  }

  // NOVO 13/08/2026 (pedido do usuário: meta de 110kg). VARS.emagrecimentoMetaKg fica visível mesmo
  // sem pesagem nenhuma ainda; "falta pra meta" só calcula quando há pelo menos 1 pesagem real.
  const metaKg = VARS.emagrecimentoMetaKg;
  const elMetaKg = $('emgMetaKg');
  if(elMetaKg) elMetaKg.textContent = fmtKg(metaKg);

  if(!Array.isArray(pesagens) || !pesagens.length){
    $('emgPesoAtual').textContent = 'Sem pesagem ainda';
    $('emgVariacaoTotal').textContent = '—';
    $('emgFaltaMeta').textContent = '—';
    if(elAviso) elAviso.textContent = 'Nenhuma pesagem registrada ainda — assim que a primeira chegar, o gráfico aparece aqui.';
  } else {
    const primeira = pesagens[0];
    const ultima = pesagens[pesagens.length-1];
    // CORRIGIDO 13/08/2026 (achado de auditoria: peso_kg sem Number() em 2 dos 3 usos, só o array
    // do gráfico já convertia — API pode devolver string, aplicando Number() nos 3 uniformemente)
    const variacao = Math.round((Number(ultima.peso_kg) - Number(primeira.peso_kg))*10)/10;
    $('emgPesoAtual').textContent = fmtKg(Number(ultima.peso_kg));
    const elVar = $('emgVariacaoTotal');
    if(elVar){
      elVar.textContent = (variacao>0?'+':'')+fmtKg(variacao)+` (desde ${primeira.data.split('-').reverse().join('/')})`;
      // CORRIGIDO 13/08/2026 (achado de auditoria: cor de status hardcoded em hex em vez de var(--green)/
      // var(--red) — mesma função já lê --border via getComputedStyle, replicado o padrão aqui)
      const corPositiva = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#34c98a';
      const corNegativa = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#e2554f';
      elVar.style.color = variacao <= 0 ? corPositiva : corNegativa;
    }

    // Falta pra meta = peso atual - meta (0 ou negativo = meta batida)
    const faltaMeta = Math.round((Number(ultima.peso_kg) - metaKg)*10)/10;
    const elFalta = $('emgFaltaMeta');
    if(elFalta){
      if(faltaMeta <= 0){
        elFalta.textContent = 'Meta batida! 🎉';
        elFalta.style.color = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#34c98a';
      } else {
        elFalta.textContent = fmtKg(faltaMeta);
        elFalta.style.color = '';
      }
    }
    if(elAviso) elAviso.textContent = `${pesagens.length} pesagem(ns) registrada(s). Sem meta definida — só evolução real, por enquanto.`;

    const labels = pesagens.map(p => p.data.split('-').reverse().slice(0,2).join('/'));
    const dados = pesagens.map(p => Number(p.peso_kg));
    const canvas = $('cEmagrecimentoPeso');
    if(canvas && typeof Chart !== 'undefined'){
      const existente = Chart.getChart(canvas);
      if(existente) existente.destroy();
      const grid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#262a32';
      // CORRIGIDO 13/08/2026 (achado de auditoria: cores do Chart.js hardcoded em vez de ler
      // var(--accent)/var(--bg) via getComputedStyle, mesmo padrão já usado acima pra --border)
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8ef2';
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#16181b';
      new Chart(canvas, {
        type:'line',
        data:{labels, datasets:[{data:dados,
          borderColor:accent, backgroundColor:accent+'15',
          borderWidth:2.5, pointBackgroundColor:accent, pointBorderColor:bg,
          pointBorderWidth:2, pointRadius:4, fill:true, tension:0.3}]},
        options:{responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmtKg(c.raw)}}},
          scales:{x:{grid:{display:false}, ticks:{font:{size:10}}},
            y:{grid:{color:grid}, ticks:{font:{size:10}}}}}
      });
    }
  }

  // Aplicações do Ozivy — controle de doses aplicadas (semanal), separado das pesagens. Já disparada
  // em paralelo com pesagens/saldos no topo desta função (ver comentário 14/08/2026 acima) — só
  // espera terminar aqui, na mesma posição de sempre.
  await promessaOzivyAplicacoes;

  // Custo do tratamento (caneta Ozivy Semaglutida) — caixa dedicada, mesmo padrão de leitura de
  // saldo já usado em todo o resto do site (vw_saldo_v2_por_caixa).
  $('emgAporteMensal').textContent = fmt(VARS.saudeEmagrecimentoAporte)+'/mês';
  const elAvisoCusto = $('emgAvisoCusto');
  try {
    const saldos = await promessaSaldosPorCaixa;
    const caixa = Array.isArray(saldos) ? saldos.find(c => c.caixa_nome === 'Emagrecimento') : null;
    if(caixa){
      $('emgSaldoCaixa').textContent = fmt(Number(caixa.v2_saldo_calculado));
      if(elAvisoCusto) elAvisoCusto.textContent = Number(caixa.v2_saldo_calculado) === 0
        ? 'Nenhuma compra lançada ainda nesta caixa — o aporte mensal acima ainda não teve uma transação real registrada.'
        : '';
    } else {
      $('emgSaldoCaixa').textContent = '⚠ Indisponível (V2)';
      if(elAvisoCusto) elAvisoCusto.textContent = 'Caixa "Emagrecimento" não encontrada na V2 — confirme se ela existe em `caixas`.';
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

// NOVO 13/08/2026 (pedido do usuário: controle das aplicações da caneta Ozivy Semaglutida, separado
// do controle de peso). Mesmo padrão de fetch/erro da função aplicarEmagrecimento() acima. Semaglutida
// é aplicação semanal — "próxima prevista" é só a última data +7 dias, não confirmação médica real.
async function aplicarOzivyAplicacoes(){
  const fmtDose = v => (v==null ? '—' : v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' mg');
  const fmtDataBR = iso => iso.split('-').reverse().join('/');
  const elAviso = $('ozAviso');

  let aplicacoes;
  try {
    aplicacoes = await WallaceFinanceService.getAplicacoesOzivy();
  } catch(err){
    console.error('Emagrecimento: falha ao buscar aplicações do Ozivy.', err);
    if(elAviso) elAviso.textContent = '⚠ Indisponível (V2) — não foi possível carregar as aplicações.';
    window.WALLACE_OZIVY_RELATORIO = { status: 'erro_aplicacoes', erro: String(err) };
    return;
  }

  if(!Array.isArray(aplicacoes) || !aplicacoes.length){
    $('ozTotalAplicacoes').textContent = '0';
    $('ozUltimaAplicacao').textContent = '—';
    $('ozProximaPrevista').textContent = '—';
    if(elAviso) elAviso.textContent = 'Nenhuma aplicação registrada ainda.';
    window.WALLACE_OZIVY_RELATORIO = { qtdAplicacoes: 0 };
    return;
  }

  const ultima = aplicacoes[aplicacoes.length-1];
  $('ozTotalAplicacoes').textContent = String(aplicacoes.length);
  $('ozUltimaAplicacao').textContent = fmtDataBR(ultima.data) + (ultima.dose_mg!=null ? ' ('+fmtDose(Number(ultima.dose_mg))+')' : '');
  const proxima = new Date(ultima.data+'T00:00:00');
  proxima.setDate(proxima.getDate()+7);
  $('ozProximaPrevista').textContent = proxima.toLocaleDateString('pt-BR');
  if(elAviso) elAviso.textContent = `${aplicacoes.length} aplicação(ões) registrada(s) — semaglutida é semanal, "próxima prevista" é só a última data +7 dias, não é confirmação médica.`;

  const ozTbody = $('ozTableBody');
  if(ozTbody){
    ozTbody.innerHTML = aplicacoes.slice().reverse().map(a => (
      '<tr style="border-bottom:1px solid var(--border)">'+
      '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+fmtDataBR(a.data)+'</td>'+
      '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+fmtDose(a.dose_mg!=null ? Number(a.dose_mg) : null)+'</td>'+
      '<td style="padding:0.3rem 0.5rem;color:var(--text-dim)">'+(a.observacao||'—')+'</td>'+
      '</tr>'
    )).join('');
  }

  const canvas = $('cOzivyDose');
  if(canvas && typeof Chart !== 'undefined'){
    const existente = Chart.getChart(canvas);
    if(existente) existente.destroy();
    const grid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#262a32';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8ef2';
    const labels = aplicacoes.map(a => fmtDataBR(a.data));
    const doses = aplicacoes.map(a => a.dose_mg!=null ? Number(a.dose_mg) : null);
    new Chart(canvas, {
      type:'line',
      data:{labels, datasets:[{data:doses, label:'Dose (mg)',
        borderColor:accent, backgroundColor:accent+'15',
        borderWidth:2.5, pointBackgroundColor:accent, pointRadius:4,
        stepped:'before', spanGaps:true, fill:true}]},
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmtDose(c.raw)}}},
        scales:{x:{grid:{display:false}, ticks:{font:{size:10}}},
          y:{grid:{color:grid}, ticks:{font:{size:10}}, beginAtZero:true}}}
    });
  }

  window.WALLACE_OZIVY_RELATORIO = {
    qtdAplicacoes: aplicacoes.length,
    ultimaAplicacao: ultima,
    proximaPrevista: proxima.toISOString().slice(0,10),
  };
  console.log('Emagrecimento: relatório de aplicações do Ozivy em window.WALLACE_OZIVY_RELATORIO', window.WALLACE_OZIVY_RELATORIO);
}
