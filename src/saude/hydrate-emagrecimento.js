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
  // NOVO 16/08/2026 (pedido do usuário: "adicione campos para receber medição de pressão e leitura
  // de glicose, tipo igual do peso com gráfico") — mesmo padrão de aplicarOzivyAplicacoes() acima:
  // disparadas em paralelo, cada uma trata o próprio erro internamente (nunca rejeita pro chamador),
  // só espera terminar mais abaixo.
  const promessaPressaoArterial = aplicarPressaoArterial();
  const promessaGlicoseLeituras = aplicarGlicoseLeituras();
  const promessaSaldosPorCaixa = WallaceFinanceService.getSaldosPorCaixa();
  promessaSaldosPorCaixa.catch(function(){});
  // CORRIGIDO 14/08/2026 (achado de auditoria: esta aba mostrava só "Tem na Caixa" — 100% correto
  // pela regra 1.3.5 do manual, que a compra no cartão nunca reduz o saldo real — mas SEM o bloco
  // "(−) Comprometido no cartão / (=) Disponível Real" que o card-resumo desta mesma caixa já mostra
  // no dashboard (ver hydrate-comprometido-caixas-tematicas-v2.js, CAIXAS_TEMATICAS_COMPROMETIDO_V2).
  // Resultado: quem olhasse só esta aba via "R$278,89" e podia achar que tinha esse valor livre pra
  // gastar, quando na real R$278,89 já está comprometido no cartão (1ª compra do Ozivy) e o
  // Disponível Real é R$0 — mesmo dado, duas telas, uma incompleta. Mesmo ID de caixa usado lá.
  const EMAGRECIMENTO_CAIXA_ID = 'd6be6a08-9d7b-4664-9c85-1e367aa620b9';
  const promessaComprometidoCaixa = WallaceFinanceService.getComprometidoPorCaixaV2(EMAGRECIMENTO_CAIXA_ID);
  promessaComprometidoCaixa.catch(function(){});

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

  // NOVO 14/08/2026 (pedido do usuário: "coloque minha altura aqui, 1.87") - fixa, independe de
  // pesagem existir. IMC só calcula com pelo menos 1 pesagem real (precisa do peso), ver abaixo.
  const alturaM = VARS.alturaWallaceM;
  const elAltura = $('emgAltura');
  if(elAltura) elAltura.textContent = alturaM.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m';

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
    const elImc = $('emgImc');
    if(elImc){
      const imc = Math.round((Number(ultima.peso_kg) / (alturaM*alturaM)) * 10) / 10;
      const classificacaoImc = imc < 18.5 ? 'Abaixo do peso' : imc < 25 ? 'Peso normal' : imc < 30 ? 'Sobrepeso' : imc < 35 ? 'Obesidade grau I' : imc < 40 ? 'Obesidade grau II' : 'Obesidade grau III';
      elImc.textContent = 'IMC '+imc.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' · '+classificacaoImc;
    }
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
    // CORRIGIDO 15/08/2026 (achado de auditoria: texto ainda dizia "Sem meta definida", contradizendo
    // o kpi-strip da mesma tela — a meta de 110kg foi implementada em 13/08/2026, ver metaKg acima).
    if(elAviso) elAviso.textContent = `${pesagens.length} pesagem(ns) registrada(s). Meta: ${fmtKg(metaKg)}.`;

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
  await promessaPressaoArterial;
  await promessaGlicoseLeituras;

  // Custo do tratamento (caneta Ozivy Semaglutida) — caixa dedicada, mesmo padrão de leitura de
  // saldo já usado em todo o resto do site (vw_saldo_v2_por_caixa).
  $('emgAporteMensal').textContent = fmt(VARS.saudeEmagrecimentoAporte)+'/mês';
  const elAvisoCusto = $('emgAvisoCusto');
  const elComprometido = $('emgComprometidoRow');
  let saldoAtualCaixa = null;
  try {
    const saldos = await promessaSaldosPorCaixa;
    const caixa = Array.isArray(saldos) ? saldos.find(c => c.caixa_nome === 'Emagrecimento') : null;
    if(caixa){
      saldoAtualCaixa = Number(caixa.v2_saldo_calculado);
      $('emgSaldoCaixa').textContent = fmt(saldoAtualCaixa);
      if(elAvisoCusto) elAvisoCusto.textContent = saldoAtualCaixa === 0
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

  // Bloco "Comprometido no cartão / Disponível Real" — mesma fórmula/regra 1.3.5 já usada no
  // card-resumo do dashboard pra esta mesma caixa. Só mostra a linha quando há valor comprometido
  // (> 0) e o saldo já carregou, mesmo critério de hydrate-comprometido-caixas-tematicas-v2.js.
  if(elComprometido){
    try {
      const comprometido = await promessaComprometidoCaixa;
      if(typeof comprometido === 'number' && !isNaN(comprometido) && comprometido > 0 && saldoAtualCaixa !== null){
        const disponivelReal = Math.round((saldoAtualCaixa - comprometido) * 100) / 100;
        const corPositiva = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#34c98a';
        const corNegativa = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#e2554f';
        elComprometido.innerHTML =
          '<div class="row"><span class="k">(&minus;) Comprometido no cart&atilde;o</span><span class="v" style="color:var(--amber)">' + fmt(comprometido) + '</span></div>' +
          '<div class="row"><span class="k">(=) Dispon&iacute;vel real</span><span class="v" style="font-weight:600;color:' + (disponivelReal < 0 ? corNegativa : corPositiva) + '">' + fmt(disponivelReal) + '</span></div>';
      } else {
        elComprometido.innerHTML = '';
      }
    } catch(err){
      console.error('Emagrecimento: falha ao buscar comprometido no cartão.', err);
      elComprometido.innerHTML = '';
    }
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

// NOVO 16/08/2026 (pedido do usuário: "adicione campos para receber medição de pressão e leitura de
// glicose, tipo igual do peso com gráfico"). Tabela `pressao_arterial` (mesmo padrão de `pesagens`/
// `aplicacoes_ozivy`: 1 linha por data, RLS só leitura, insert feito manualmente/via agente conforme
// cada medição real acontece — sem formulário de insert no painel). Classificação clínica usa a
// referência padrão da American Heart Association (Normal / Elevada / Hipertensão estágio 1 e 2 /
// Crise hipertensiva) — é só rótulo informativo, não substitui avaliação médica. Diferente do
// gráfico de peso/Ozivy (1 série só), este tem 2 séries (sistólica e diastólica) no mesmo canvas,
// por isso a legenda fica visível em vez de escondida.
async function aplicarPressaoArterial(){
  const fmtDataBR = iso => iso.split('-').reverse().join('/');
  const elAviso = $('paAviso');

  const classificarPressao = (sist, diast) => {
    if(sist >= 180 || diast >= 120) return 'Crise hipertensiva';
    if(sist >= 140 || diast >= 90) return 'Hipertensão estágio 2';
    if(sist >= 130 || diast >= 80) return 'Hipertensão estágio 1';
    if(sist >= 120) return 'Elevada';
    return 'Normal';
  };

  let leituras;
  try {
    leituras = await WallaceFinanceService.getPressaoArterial();
  } catch(err){
    console.error('Emagrecimento: falha ao buscar pressão arterial.', err);
    if(elAviso) elAviso.textContent = '⚠ Indisponível (V2) — não foi possível carregar as leituras de pressão.';
    window.WALLACE_PRESSAO_RELATORIO = { status: 'erro_leituras', erro: String(err) };
    return;
  }

  if(!Array.isArray(leituras) || !leituras.length){
    const elTotal = $('paTotalLeituras');
    if(elTotal) elTotal.textContent = '0';
    const elUltima = $('paUltima');
    if(elUltima) elUltima.textContent = '—';
    const elClass = $('paClassificacao');
    if(elClass) elClass.textContent = '';
    if(elAviso) elAviso.textContent = 'Nenhuma leitura de pressão registrada ainda.';
    window.WALLACE_PRESSAO_RELATORIO = { qtdLeituras: 0 };
    return;
  }

  const elTotal = $('paTotalLeituras');
  if(elTotal) elTotal.textContent = String(leituras.length);
  const ultima = leituras[leituras.length-1];
  const sistUltima = Number(ultima.sistolica);
  const diastUltima = Number(ultima.diastolica);
  const classeUltima = classificarPressao(sistUltima, diastUltima);
  const elUltima = $('paUltima');
  if(elUltima) elUltima.textContent = `${sistUltima}/${diastUltima} mmHg`;
  const elClass = $('paClassificacao');
  if(elClass) elClass.textContent = classeUltima;
  if(elAviso) elAviso.textContent = `${leituras.length} leitura(s) registrada(s) — classificação segue a referência padrão da American Heart Association, não substitui avaliação médica.`;

  const paTbody = $('pressaoTableBody');
  if(paTbody){
    paTbody.innerHTML = leituras.slice().reverse().map(l => (
      '<tr style="border-bottom:1px solid var(--border)">'+
      '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+fmtDataBR(l.data)+'</td>'+
      '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+Number(l.sistolica)+'/'+Number(l.diastolica)+' mmHg</td>'+
      '<td style="padding:0.3rem 0.5rem;color:var(--text-dim)">'+classificarPressao(Number(l.sistolica), Number(l.diastolica))+'</td>'+
      '</tr>'
    )).join('');
  }

  const canvas = $('cPressaoArterial');
  if(canvas && typeof Chart !== 'undefined'){
    const existente = Chart.getChart(canvas);
    if(existente) existente.destroy();
    const grid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#262a32';
    const corSist = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#e2554f';
    const corDiast = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8ef2';
    const labels = leituras.map(l => fmtDataBR(l.data));
    const sistolicas = leituras.map(l => Number(l.sistolica));
    const diastolicas = leituras.map(l => Number(l.diastolica));
    new Chart(canvas, {
      type:'line',
      data:{labels, datasets:[
        {data:sistolicas, label:'Sistólica',
          borderColor:corSist, backgroundColor:corSist+'15',
          borderWidth:2.5, pointBackgroundColor:corSist, pointRadius:4, fill:false, tension:0.3},
        {data:diastolicas, label:'Diastólica',
          borderColor:corDiast, backgroundColor:corDiast+'15',
          borderWidth:2.5, pointBackgroundColor:corDiast, pointRadius:4, fill:false, tension:0.3}
      ]},
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:true, labels:{font:{size:10}}},
          tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+c.raw+' mmHg'}}},
        scales:{x:{grid:{display:false}, ticks:{font:{size:10}}},
          y:{grid:{color:grid}, ticks:{font:{size:10}}}}}
    });
  }

  window.WALLACE_PRESSAO_RELATORIO = {
    qtdLeituras: leituras.length,
    ultimaLeitura: ultima,
    classificacaoUltima: classeUltima,
  };
  console.log('Emagrecimento: relatório de pressão arterial em window.WALLACE_PRESSAO_RELATORIO', window.WALLACE_PRESSAO_RELATORIO);
}

// NOVO 16/08/2026 (mesmo pedido acima). Tabela `glicose_leituras` (mesmo padrão de `pesagens`/
// `pressao_arterial`). Classificação (referência de jejum: Normal <100, Pré-diabetes 100-125,
// Diabetes ≥126) só é aplicada quando `periodo` é "jejum" ou não foi informado — outros períodos
// (pós-refeição, aleatório) variam demais fisiologicamente pra usar a mesma régua sem inventar um
// diagnóstico fora de contexto; nesses casos só o valor é mostrado, sem rótulo. Gráfico de linha
// simples (1 série), mesmo estilo visual do gráfico de peso (legenda escondida).
async function aplicarGlicoseLeituras(){
  const fmtDataBR = iso => iso.split('-').reverse().join('/');
  const elAviso = $('glcAviso');

  const classificarGlicose = (valor, periodo) => {
    const p = (periodo||'').toLowerCase().trim();
    if(p && p !== 'jejum') return null;
    if(valor < 100) return 'Normal (jejum)';
    if(valor < 126) return 'Pré-diabetes (jejum)';
    return 'Diabetes (jejum)';
  };

  let leituras;
  try {
    leituras = await WallaceFinanceService.getGlicoseLeituras();
  } catch(err){
    console.error('Emagrecimento: falha ao buscar glicose.', err);
    if(elAviso) elAviso.textContent = '⚠ Indisponível (V2) — não foi possível carregar as leituras de glicose.';
    window.WALLACE_GLICOSE_RELATORIO = { status: 'erro_leituras', erro: String(err) };
    return;
  }

  if(!Array.isArray(leituras) || !leituras.length){
    const elTotal = $('glcTotalLeituras');
    if(elTotal) elTotal.textContent = '0';
    const elUltima = $('glcUltima');
    if(elUltima) elUltima.textContent = '—';
    const elClass = $('glcClassificacao');
    if(elClass) elClass.textContent = '';
    if(elAviso) elAviso.textContent = 'Nenhuma leitura de glicose registrada ainda.';
    window.WALLACE_GLICOSE_RELATORIO = { qtdLeituras: 0 };
    return;
  }

  const elTotal = $('glcTotalLeituras');
  if(elTotal) elTotal.textContent = String(leituras.length);
  const ultima = leituras[leituras.length-1];
  const valorUltima = Number(ultima.glicose_mgdl);
  const classeUltima = classificarGlicose(valorUltima, ultima.periodo);
  const elUltima = $('glcUltima');
  if(elUltima) elUltima.textContent = `${valorUltima} mg/dL` + (ultima.periodo ? ` (${ultima.periodo})` : '');
  const elClass = $('glcClassificacao');
  if(elClass) elClass.textContent = classeUltima || '';
  if(elAviso) elAviso.textContent = `${leituras.length} leitura(s) registrada(s)` +
    (classeUltima ? ' — classificação segue a referência padrão de jejum, não substitui avaliação médica.' : '.');

  const glcTbody = $('glicoseTableBody');
  if(glcTbody){
    glcTbody.innerHTML = leituras.slice().reverse().map(l => {
      const valor = Number(l.glicose_mgdl);
      const classe = classificarGlicose(valor, l.periodo);
      return '<tr style="border-bottom:1px solid var(--border)">'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-mid)">'+fmtDataBR(l.data)+'</td>'+
        '<td class="r" style="padding:0.3rem 0.5rem;text-align:right">'+valor+' mg/dL</td>'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-dim)">'+(l.periodo||'—')+'</td>'+
        '<td style="padding:0.3rem 0.5rem;color:var(--text-dim)">'+(classe||'—')+'</td>'+
        '</tr>';
    }).join('');
  }

  const canvas = $('cGlicose');
  if(canvas && typeof Chart !== 'undefined'){
    const existente = Chart.getChart(canvas);
    if(existente) existente.destroy();
    const grid = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#262a32';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8ef2';
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#16181b';
    const labels = leituras.map(l => fmtDataBR(l.data));
    const dados = leituras.map(l => Number(l.glicose_mgdl));
    new Chart(canvas, {
      type:'line',
      data:{labels, datasets:[{data:dados,
        borderColor:accent, backgroundColor:accent+'15',
        borderWidth:2.5, pointBackgroundColor:accent, pointBorderColor:bg,
        pointBorderWidth:2, pointRadius:4, fill:true, tension:0.3}]},
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.raw+' mg/dL'}}},
        scales:{x:{grid:{display:false}, ticks:{font:{size:10}}},
          y:{grid:{color:grid}, ticks:{font:{size:10}}}}}
    });
  }

  window.WALLACE_GLICOSE_RELATORIO = {
    qtdLeituras: leituras.length,
    ultimaLeitura: ultima,
    classificacaoUltima: classeUltima,
  };
  console.log('Emagrecimento: relatório de glicose em window.WALLACE_GLICOSE_RELATORIO', window.WALLACE_GLICOSE_RELATORIO);
}
