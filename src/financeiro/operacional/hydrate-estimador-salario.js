// MÓDULO: hydrateEstimadorSalario() — renderização do Estimador de Salário (ciclo seguinte): líquido
// projetado, rótulo dinâmico da fonte (real recebido/projetado/média ponderada 12M), necessidade
// líquida e excedente estimado. Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateEstimadorSalario() no meio da própria execução, na mesma
// posição exata (entre hydrateCenarios() e hydrateLivrosRazao()). Nenhum id de DOM, fórmula ou
// comportamento mudou.
function hydrateEstimadorSalario(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;

  // Fase 3 - Estimador de Salario (ciclo SEGUINTE, ainda não começou/fechou - por isso "Estimador",
  // não "Modo Operacional" (seção 02), que mostra o ciclo ATUAL já com salário real recebido).
  // CORRIGIDO 19/08/2026, 2ª rodada (achado do usuário: os 2 cards estavam mostrando o mesmo valor,
  // R$16.819,56 — não deveriam, "o primeiro print tem que ser o ciclo atual e o segundo é sempre o
  // próximo ciclo"). Causa raiz: a correção de 13/08 (comentário que estava aqui) resolveu um
  // descompasso de período entre estLiquido/estNecLiquida colapsando os DOIS pro índice 0 (ciclo
  // atual) — errado na outra direção, isso faz este card duplicar o de cima em vez de projetar o
  // ciclo seguinte. Fix certo: os dois campos usam índice 1 (ciclo seguinte) de forma consistente.
  t('estLiquido', fmt(liquidoMes(1)));
  { // Rótulo dinâmico: mostra qual fonte está ativa (real, se algum dia liquidoReal[1] for preenchido
    // adiantado; senão média ponderada 12M — não existe "Projetado (Estimador de Salário)" pro índice
    // 1, essa fonte é a prévia de folha de ponto do PAGAMENTO IMINENTE do ciclo atual, só faz sentido
    // pro índice 0, ver liquidoMes() em app.js).
    const temRealProximo = (REG.superavitNormal.liquidoReal||{})[1] != null;
    const fonteLabel = temRealProximo ? 'Real recebido' : 'Média ponderada 12M (projeção, ciclo ainda não começou)';
    // Período do ciclo SEGUINTE calculado a partir do ciclo atual — VARS.CICLO_SNAPSHOTS não tem uma
    // linha pro ciclo seguinte até ele realmente abrir (fechar_ciclo_financeiro cria essa linha só na
    // virada), não dá pra ler snap.periodo de um ciclo que ainda não existe no banco.
    const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const [anoAtual, mesAtual] = VARS.cicloAtual.split('-').map(Number);
    const mesSeguinte = mesAtual === 12 ? 1 : mesAtual + 1;
    const anoSeguinte = mesAtual === 12 ? anoAtual + 1 : anoAtual;
    const mesFechamento = mesSeguinte === 12 ? 1 : mesSeguinte + 1;
    const anoFechamento = mesSeguinte === 12 ? anoSeguinte + 1 : anoSeguinte;
    const cicloTxt = '25/'+String(mesSeguinte).padStart(2,'0')+' a '+MESES_ABREV[mesFechamento-1]+'/'+String(anoFechamento).slice(-2);
    t('estStatusFonte', 'Ciclo '+cicloTxt+' (seguinte) · '+fonteLabel);
  }
  t('estNecLiquida', fmt(R.evolucao.necessidadeLiquida[1]));
  const excedenteEst = liquidoMes(1) - R.evolucao.necessidadeLiquida[1];
  // CORRIGIDO 15/08/2026 (achado de auditoria: "· Modo Normal" era texto fixo, nunca refletia
  // Crítico/Baixo/Alto de verdade — R.operacional.modoOperacional já existe, calculado em
  // recalcular-necessidade.js, só nunca tinha sido ligado aqui).
  t('estExcedente', fmt(excedenteEst)+' · Modo '+R.operacional.modoOperacional);

  // NOVO 16/08/2026 (pedido do usuário: cards na Home com Necessidade/Salário esperado/Sobra real) —
  // MESMOS 3 valores já calculados acima (liquidoMes(1), R.evolucao.necessidadeLiquida[1], excedenteEst),
  // só promovidos pra um card mais visível — nenhum cálculo novo/duplicado. CORRIGIDO 19/08/2026 (2ª
  // rodada, junto com a correção acima): índice ajustado de 0 pra 1 pra continuar batendo com o
  // "acima" — "Salário ESPERADO" é sobre o que ainda não chegou (ciclo seguinte), não o que já foi
  // recebido (ciclo atual, índice 0).
  t('homeNecLiquida', fmt(R.evolucao.necessidadeLiquida[1]));
  t('homeSalarioEsperado', fmt(liquidoMes(1)));
  const homeSobraEl = $('homeSobraReal');
  if(homeSobraEl){ homeSobraEl.textContent = fmt(excedenteEst); homeSobraEl.style.color = excedenteEst >= 0 ? 'var(--green)' : 'var(--red)'; }
  t('legHomeSobraReal', 'Modo '+R.operacional.modoOperacional+' · Salário esperado (dia 25) − Necessidade Líquida do ciclo. Sobra negativa = precisa entrar mais dinheiro além do salário pra fechar o ciclo.');

  // CORRIGIDO 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #3): a tabela "Fórmula exata"
  // tinha INSS/Saúde-Dental escritos crus no HTML — já dessincronizados de verdade (382,67 no HTML
  // vs 413,15 real em parametros_gerais.taxasHoraFolhaPontoWartsila.assistenciaMedicaOdontoBase,
  // mesma fonte já usada em reg-operacional.js/graficos-cenarios-lazy.js pro Déficit Zero).
  const THFW = VARS.taxasHoraFolhaPontoWartsila;
  if(THFW){
    const inss = (THFW.inssMes && THFW.inssMes.valorAtual) ?? 988.07;
    const saudeDental = (THFW.assistenciaMedicaOdontoBase && THFW.assistenciaMedicaOdontoBase.valorAtual) ?? 413.15;
    t('estFormulaInss', fmt(inss));
    t('estFormulaSaudeDental', fmt(saudeDental));
  }
}
