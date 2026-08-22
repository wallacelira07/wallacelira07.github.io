// MÓDULO: hydrateROC() — renderização da seção 17 (Opções vendidas / ROC)
// Extraído de hydrate() (app.js) na modularização (07/08/2026). Script clássico (não ES module),
// carrega DEPOIS do app.js terminar (onload) — só DEFINE a função aqui; QUEM CHAMA continua sendo
// hydrate() (em app.js), no mesmo ponto exato da sequência original. Não usa REG nenhuma vez, só
// VARS/$/t/fmt/setBadge (já existem quando hydrate() roda). Nenhuma fórmula, id de DOM ou
// comportamento visual foi alterado — só o arquivo que hospeda o código.
function hydrateROC(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };

  // NOVO 22/08/2026 (pedido do usuário: exercício automático quando vencida+ITM — ver opcoes-roc.js)
  // — precisa rodar ANTES do Dashboard Executivo/tabs usarem o.exercida/o.statusPosicao logo abaixo.
  aplicarAutoExercicioOpcoesVencidas();

  // NOVO 21/08/2026 (Fase 4 do cockpit de opções, "Dashboard Executivo" — junta números que já
  // existiam espalhados pela seção numa visão única no topo). A maioria REAPROVEITA VARS.rocCarteira/
  // opcoesVendidasDetalhe (nenhum cálculo novo, só exibição consolidada) — só 3 métricas são cálculo
  // novo: Prêmios do mês, Taxa de sucesso, Taxa de exercício.
  {
    const rc = VARS.rocCarteira || {};
    t('dashOpCapitalComprometido', fmt(rc.capitalTravado || 0));
    t('dashOpPremiosTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioRecebido||0),0)));
    t('dashOpRetornoMensal', rc.rentabilidadeMensal != null ? (rc.rentabilidadeMensal*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—');
    t('dashOpTaxaCDI', rc.comparacaoCDI != null ? rc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'x CDI' : '—');
    // Rentabilidade total = soma de resultadoHistorico (campo já existente por posição, "prêmio
    // líquido menos o que foi de fato perdido/ganho até agora" — ver origem do dado em vars-roc.js).
    t('dashOpRentabilidadeTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.resultadoHistorico||0),0)));

    // NOVO — Prêmios do mês: soma premioRecebido só das operações cuja nota de corretagem é do mês
    // corrente (mesmo regex de extração de data já usado em aplicarTendenciaOpcoes()).
    const agora = new Date();
    const premiosMes = VARS.opcoesVendidasDetalhe.reduce((s,o) => {
      const m = /\((\d{2})\/(\d{2})\/(\d{4})\)/.exec(o.notaCorretagem || '');
      if(!m) return s;
      const mesNota = Number(m[2]) - 1, anoNota = Number(m[3]);
      if(mesNota === agora.getMonth() && anoNota === agora.getFullYear()) return s + (o.premioRecebido || 0);
      return s;
    }, 0);
    t('dashOpPremiosMes', fmt(premiosMes));

    // NOVO — Exercícios recebidos / Taxa de sucesso / Taxa de exercício: "encerrada" = o.vencida true
    // (cobre ENCERRADA + vencimento já passado, mesma fonte de aplicarStatusVencidoEValorMercadoOpcoes()
    // em opcoes-roc.js) — sucesso = encerrada sem confirmação de exercício ("virou pó").
    const encerradas = VARS.opcoesVendidasDetalhe.filter(o => o.vencida);
    const exercidas = encerradas.filter(o => o.exercida);
    t('dashOpExercicios', String(exercidas.length));
    t('dashOpTaxaSucesso', encerradas.length ? (((encerradas.length-exercidas.length)/encerradas.length)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%' : '—');
    t('dashOpTaxaExercicio', encerradas.length ? ((exercidas.length/encerradas.length)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%' : '—');

    const legDashEl = $('legDashOpExecutivo');
    if(legDashEl){
      legDashEl.textContent = encerradas.length
        ? `${encerradas.length} operação(ões) encerrada(s) no total (${exercidas.length} exercida(s), ${encerradas.length-exercidas.length} virou(aram) pó). "Recuperações concluídas" ainda não é uma métrica rastreável — a Carteira de Ações Recebidas não tem mecanismo de "venda"/encerramento ainda, fica pra quando o primeiro caso real acontecer.`
        : 'Nenhuma operação encerrada ainda — taxas de sucesso/exercício ficam disponíveis a partir da 1ª posição vencida.';
    }
  }

  // AMPLIADO 21/08/2026 (motor de alerta em camadas, pedido do usuário — ver
  // calcularNivelRiscoOpcao()/calcularAvisosOpcoesRisco() em opcoes-roc.js pro critério completo dos
  // 4 níveis). Renderiza em 3 lugares: banner no topo da Home + banner na própria seção 16 (só tier
  // >=2, "Risco alto" pra cima — não afogar o usuário com 🟡 toda hora fora da aba dedicada) e a aba
  // "Em Risco" da seção 16 (opcoesRiscoDetalhe, TODOS os tiers, 1-4 — visão completa).
  {
    const avisos = typeof calcularAvisosOpcoesRisco === 'function' ? calcularAvisosOpcoesRisco() : [];
    const montarLinha = a => {
      const prazoTxt = a.diasParaVencer < 0
        ? `venceu há ${Math.abs(a.diasParaVencer)} dia(s) (${a.vencimento})${a.itm ? ' — confirme com a corretora se foi exercida' : ''}`
        : a.diasParaVencer === 0 ? `vence HOJE (${a.vencimento})` : `vence em ${a.diasParaVencer} dia(s) (${a.vencimento})`;
      const statusTxt = a.itm
        ? `ITM: cotação ${fmt(a.cotacaoAtual)} abaixo do strike ${fmt(a.strike)} (${a.distanciaPct.toLocaleString('pt-BR',{maximumFractionDigits:1})}%)`
        : `OTM, mas só ${a.distanciaPct.toLocaleString('pt-BR',{maximumFractionDigits:1})}% acima do strike — pode virar ITM até o vencimento`;
      let miolo = '';
      if(a.itm){
        // NOVO 21/08/2026 (pedido do usuário, calculadora de recuperação pós-exercício): 2 caminhos
        // mecânicos SE for exercida, sem recomendar qual escolher (não sou consultor de investimentos).
        // Caminho A (vender e realizar): já é exatamente resultadoLiquidoSeExercido, reaproveitado.
        // Caminho B (manter as ações e vender covered call): não temos cotação de calls integrada
        // (brapi free não cobre chain de opções fora do PETR4, ver comentário em aplicarCotacoesOpcoesV2)
        // — mostra a FÓRMULA (preço de equilíbrio atual, e como cada R$ de prêmio novo o reduz), pro
        // usuário aplicar com a cotação real de calls que ele vir na própria corretora.
        const caminhoB = `Caminho B — manter as ${a.qtd} ações e vender covered call: seu preço de equilíbrio hoje é ${fmt(a.precoEquilibrio)} (o que você "pagou" de fato, já descontado o prêmio da put). `
          + `Cada R$1,00 de prêmio recebido numa call nova reduz esse equilíbrio em R$${(1/a.qtd).toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4})} por ação vendida coberta — confira o prêmio real de calls com strike perto de ${fmt(a.precoEquilibrio)} na sua corretora antes de decidir.`;
        const caminhoA = `Caminho A — vender as ações agora e realizar: resultado líquido ${fmt(a.resultadoLiquidoSeExercido)} (mesmo número do resultado líquido acima).`;
        miolo = `Se exercida: você compra ${a.qtd} ações a ${fmt(a.strike)} (${fmt(a.capitalNecessario)}), valendo ${fmt(a.valorMercadoAcoes)} no mercado agora (${fmt(-a.perdaNoPapel)} no papel). `
          + `Prêmio já recebido: ${fmt(a.premio)}. Resultado líquido se exercido: <strong style="color:${a.resultadoLiquidoSeExercido<0?'var(--red)':'var(--green)'}">${fmt(a.resultadoLiquidoSeExercido)}</strong>. `
          + `Preço de equilíbrio: ${fmt(a.precoEquilibrio)}.<br>`
          + `<span style="font-size:0.72rem;color:var(--text-dim)">${caminhoA}<br>${caminhoB}</span>`;
      } else {
        miolo = `<span style="font-size:0.72rem;color:var(--text-dim)">Prêmio já recebido: ${fmt(a.premio)}. Ainda não está em risco de exercício — só perto o suficiente do strike pra acompanhar de perto.</span>`;
      }
      return `<div style="margin-bottom:0.7rem"><strong>${a.nivel.emoji} ${a.nivel.label}</strong> — <strong>${a.ativo} PUT (${a.ticker})</strong> ${prazoTxt}<br>${statusTxt}.<br>${miolo}</div>`;
    };
    const avisosUrgentes = avisos.filter(a => a.nivel.tier >= 2);
    const htmlBanner = avisosUrgentes.length
      ? `<div style="font-weight:700;margin-bottom:0.5rem">⚠️ ${avisosUrgentes.length} posição(ões) em risco alto de exercício</div>` + avisosUrgentes.map(montarLinha).join('')
        + `<div style="font-size:var(--fs-2xs);color:var(--text-dim)">Isso é matemática mecânica da posição, não recomendação — decida com sua corretora/assessor.</div>`
      : '';
    ['opcoesAvisoITM','homeAvisoOpcoesITM'].forEach(id => {
      const el = $(id);
      if(!el) return;
      if(htmlBanner){ el.innerHTML = htmlBanner; el.style.display = ''; }
      else { el.style.display = 'none'; }
    });
    const contagemEl = $('opcoesRiscoContagem');
    if(contagemEl) contagemEl.textContent = avisos.length ? `(${avisos.length})` : '';
    const detalheEl = $('opcoesRiscoDetalhe');
    if(detalheEl){
      detalheEl.innerHTML = avisos.length
        ? avisos.map(montarLinha).join('')
        : `<div style="color:var(--text-dim);padding:1rem 0;text-align:center">Nenhuma posição em risco no momento.</div>`;
    }
  }

  // NOVO 31/07/2026 (V216): card de Opções reconstruído - derivado de VARS.opcoesVendidasDetalhe,
  // nunca mais tabela fixa no HTML.
  t('opcoesValorMercado', fmt(VARS.opcoesVendidasValorMercado));
  // CORRIGIDO 01/08/2026 (notas de corretagem reais): premioRecebido ja e o LIQUIDO (conferido nota
  // a nota, ver comentario em VARS.opcoesVendidasDetalhe) - o card "Total em premios recebidos"
  // sempre foi, na pratica, o total liquido. Adicionados 2 cards novos: bruto (soma premioBruto) e
  // custos (soma custoOperacional), pra mostrar a composicao completa sem duplicar nenhum desconto.
  t('opcoesPremioTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioRecebido||0),0)) + (VARS.opcoesVendidasDetalhe.some(o=>o.premioRecebido===null) ? ' (parcial, falta confirmar)' : ''));
  t('opcoesPremioBrutoTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.premioBruto||0),0)));
  t('opcoesCustosTotal', fmt(VARS.opcoesVendidasDetalhe.reduce((s,o)=>s+(o.custoOperacional||0),0)));
  // NOVO 03/08/2026 (Módulo 17 - ROC): resumo consolidado da carteira de opções, mesmo padrão dos
  // outros cards - deriva 100% de VARS.rocCarteira (calculado logo após opcoesVendidasValorMercado).
  const rc = VARS.rocCarteira;
  t('rocCapitalTravado', fmt(rc.capitalTravado));
  { const detEl = $('rocCapitalTravadoDetalhe');
    if(detEl){
      const ativas = VARS.opcoesVendidasDetalhe.filter(o=>!o.vencida && o.roc && o.roc.capitalTravado!=null);
      detEl.textContent = ativas.map(o=>`${o.ativo} ${Math.abs(o.quantidade)}un @ R$${o.precoExercicio.toFixed(2)} (${o.vencimento})`).join(' · ');
    }
  }
  t('rocPremioLiquido', fmt(rc.premioLiquido));
  t('rocRentabilidade', rc.rentabilidade !== null ? (rc.rentabilidade*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—');
  t('rocRentabilidadeMensal', rc.rentabilidadeMensal !== null ? (rc.rentabilidadeMensal*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—');
  t('rocRentabilidadeAnualizada', rc.rentabilidadeAnualizada !== null ? (rc.rentabilidadeAnualizada*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—');
  t('rocComparacaoCDI', rc.comparacaoCDI !== null ? rc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'x CDI' : '—');
  t('rocDiasMedios', rc.diasMedios !== null ? rc.diasMedios+' dias' : '—');
  // NOVO 03/08/2026 (layout do ROC): badge de status do consolidado - precisa de className (não só
  // texto), então não usa o helper t(). Mesmas 4 classes .badge (bg/ba/br/bb) já usadas em outros
  // cards do painel (ex: "Não líquido" do PGBL/FGTS), cor deriva do status calculado em VARS.rocCarteira.statusROC.
  const rocBadgeEl = $('rocStatusBadge');
  if(rocBadgeEl){
    if(rc.statusROC){
      setBadge(rocBadgeEl, rc.statusROC.classe, rc.statusROC.emoji + ' ' + rc.statusROC.label);
    } else {
      setBadge(rocBadgeEl, null, '—');
    }
  }
  const legRocEl = $('legRocCarteira');
  if(legRocEl){
    // CORRIGIDO 04/08/2026 (achado do usuario): motivos separados agora - "sem strike confirmado" e
    // "vencida" sao coisas diferentes, cada um com seu proprio trecho de texto (so aparece quando o
    // contador correspondente e >0, pode aparecer os 2 juntos se um dia acontecer ao mesmo tempo).
    const motivos = [];
    if(rc.itensSemStrike > 0) motivos.push(`${rc.itensSemStrike} posição(ões) fora da soma por falta de strike confirmado`);
    if(rc.itensVencidosExcluidos > 0) motivos.push(`${rc.itensVencidosExcluidos} posição(ões) vencida(s) fora da soma (capital não está mais travado)`);
    legRocEl.textContent = `CDI mensal de referência: ${VARS.CDI_MENSAL_ATUAL.toLocaleString('pt-BR',{minimumFractionDigits:2})}% (${VARS.CDI_MENSAL_ATUAL_DATA_REF})`
      + (motivos.length > 0 ? ` · ${motivos.join(' · ')}` : '');
  }
  // NOVO 31/07/2026 (V218): aplica as 28 legendas de VARS.LEGENDAS nos elementos correspondentes -
  // um loop so, nunca precisa lembrar de chamar t() individualmente pra cada uma. Usa innerHTML
  // porque varias legendas tem <strong>/<span> internos que precisam ser preservados.
  // CORRIGIDO 01/08/2026 (achado do usuario via modo apresentacao): valores R$ embutidos no MEIO
  // do texto das legendas (ex: "teto da propria Caixa Variavel (R$2.000...)") nunca ficavam dentro
  // de um <span class="v"> - o modo esconder-valores so nublava campos dinamicos com id proprio,
  // essas legendas vazavam numero de qualquer forma. Regex envolve automaticamente qualquer
  // "R$1.234,56" (com ou sem espaco depois do R$, com ou sem sinal negativo) numa <span class="v">
  // antes de injetar - nao precisa editar as ~28 legendas uma por uma, nem lembrar de fazer isso
  // em legendas novas no futuro.
  const RE_VALOR_MONETARIO = /R\$\s?-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  // NOVO 10/08/2026: ids que passaram a ser CALCULADOS (não mais texto estático da tabela
  // `legendas`/VARS.LEGENDAS) ficam de fora deste loop genérico — senão o texto fixo (que ainda
  // existe como fallback local em vars-operacional.js) sobrescreveria o texto dinâmico logo depois,
  // já que hydrateROC() roda DEPOIS de quem calcula essas legendas (hydrateResumoExecutivo(), no
  // início de hydrate()). Ver hydrate-resumo-executivo.js pra legNecessidadeBrutaLiquida.
  // ADICIONADAS 12/08/2026 (achado de auditoria, mesmo tratamento): legOrcamentoOperacionalComposicao
  // (teto Caixa Variável + meta PIX Vanessa) e legPGVSaldoResidual (saldo real da PGV) tinham valores
  // R$ fixos na string — agora calculadas em hydrateResumoExecutivo() a cada render.
  // ADICIONADA 14/08/2026 (achado do usuário, mesmo tratamento): legMPCorporativoImpacto tinha
  // "R$9.223,66" fixo — agora calculada em hydrateResumoExecutivo() a cada render (ver
  // recalcular-necessidade.js pra causa raiz do valor congelado).
  // ADICIONADAS 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #9, mesmo tratamento):
  // legCenarioFicaEmCasa/legPisoSemTrabalhar/legDeficitSemEmbarque tinham "R$8.109,74"/"R$10.483,36"
  // fixos — agora calculadas em hydrateResumoExecutivo() a partir de REG.deficitZero.
  const LEGENDAS_CALCULADAS = new Set(['legNecessidadeBrutaLiquida', 'legOrcamentoOperacionalComposicao', 'legPGVSaldoResidual', 'legMPCorporativoImpacto', 'legCenarioFicaEmCasa', 'legPisoSemTrabalhar', 'legDeficitSemEmbarque']);
  Object.keys(VARS.LEGENDAS).forEach(id => {
    if(LEGENDAS_CALCULADAS.has(id)) return;
    const el = $(id);
    if(el) el.innerHTML = VARS.LEGENDAS[id].replace(RE_VALOR_MONETARIO, m => `<span class="v">${m}</span>`);
  });
  // NOVO 31/07/2026 (V219): alivio de agosto - calculo real, ver VARS.alivioProximoMes acima.
  const legAlivioEl = $('legAlivioAgosto');
  if(legAlivioEl) legAlivioEl.innerHTML = `Alívio de <span class="v">${fmt(VARS.alivioProximoMes)}</span>/mês a partir do próximo ciclo (parcelas do Visa Infinite + Mercado Pago que terminam agora) — não considera ainda o fim do seguro auto em outubro/2026`;
  // NOVO 17/08/2026: valores abaixo são só o fallback do boot síncrono — aplicarBeneficiosCreditosV2()
  // (final deste arquivo) sobrescreve com a tabela `beneficios_creditos` (Supabase) assim que a busca
  // terminar, mesmo padrão V1→V2 já usado no resto do site.
  t('credUberTotal', fmt(VARS.creditoUberBalance));
  t('credShellBox', fmt(VARS.creditoShellBox));
  t('credKmv', fmt(VARS.creditoKmvIpiranga)); // CORRIGIDO 31/07/2026 (V224): usuario esclareceu que os 600 sao R$600,00 (reais), nao pontos - era concatenado como "600 pontos", corrigido pra formatar como moeda igual aos outros creditos.
  // NOVO 31/07/2026 (V217): "migrados 100% pro MB" no Visa Infinite era R$0,00 hardcoded - correto
  // HOJE, mas um numero mudo que mentiria se algo fosse lancado de volta no Visa por engano (exatamente
  // o que aconteceu com a Drogasil em V201). Agora soma os 4 componentes reais - continua R$0,00
  // porque de fato estao zerados, mas agora e verificavel, nao um texto solto.
  t('visaMigradoTotal', fmt(VARS.livroLRCONVisaOnly + VARS.visaLRRConfirmado + VARS.livroLRCVisaOnly + VARS.visaLRSConfirmado));
  // CORRIGIDO 31/07/2026 (V217): PGBL+FGTS somados estava fixo em R$209.898,34 (desatualizado desde
  // a atualizacao de ambos em 30-31/07) - agora deriva sempre dos 2 valores reais.
  t('balPgblFgtsSoma', fmt(VARS.patPgbl + VARS.patFgts));
  const opcoesTbodyEl = $('opcoesTbody');
  if(opcoesTbodyEl){
    // NOVO 01/08/2026 (pedido do usuario): integra as cotacoes reais da brapi.dev (VARS.ACOES_COTACOES,
    // atualizadas automaticamente via GitHub Actions -> Supabase, ver PASSAGEM_DE_TURNO) na tabela de
    // opcoes. Pra cada PUT vendida, mostra o preco atual da acao-objeto e se ela esta OTM (fora do
    // dinheiro - o normal, o Wallace quer que a put vire po) ou ITM (dentro do dinheiro - alerta, quem
    // vendeu a put pode ser exercido). Formula: PUT vendida fica OTM quando preco da acao > strike.
    const cotacoes = VARS.ACOES_COTACOES || {};
    // NOVO 01/08/2026 (pedido do usuario): ordena por data de vencimento, mais proxima primeiro,
    // mais distante por ultimo - ajuda a priorizar visualmente qual posicao precisa de atencao antes.
    // Datas no formato DD/MM/AAAA - convertidas pra Date so pra comparar, sem alterar o array original
    // (nao mexe em VARS.opcoesVendidasDetalhe, so na copia usada pra desenhar a tabela).
    const parseVencimento = str => { const [d,m,a] = str.split('/').map(Number); return new Date(a,m-1,d); };
    // CORRIGIDO 03/08/2026 (pedido do usuario - tabela "muito bagunçada" misturando ativas e vencidas):
    // a tabela principal da secao 17 agora mostra SO posicoes ativas (o.vencida=false, mesma fonte
    // calculada 1x em recalcularAgregadosDerivados(), nunca duplicada). Posicao vencida (ex:
    // PETRS368W5) sai da lista visual, mas o registro continua intacto em VARS.opcoesVendidasDetalhe
    // (P6 - nao apaga dado) - so nao participa mais da tabela de "posicoes ativas" nem do Valor de
    // Mercado (ver calculo acima). Contagem exposta na legenda logo abaixo da tabela, mesmo padrao
    // ja usado em legRocCarteira pra "itens fora da soma".
    // CORRIGIDO 03/08/2026 (pedido do usuario, opcao A - confirmacao manual): "Vencidas" agora so
    // mostra quem venceu SEM confirmacao de exercicio (o.exercida=false, o caso normal/"virou po").
    // Quem foi confirmado como exercida sai daqui e vai pra tabela propria abaixo (opcoesExercidas).
    const opcoesVencidas = VARS.opcoesVendidasDetalhe.filter(o => o.vencida && !o.exercida);
    const opcoesExercidas = VARS.opcoesVendidasDetalhe.filter(o => o.vencida && o.exercida);
    const opcoesOrdenadas = VARS.opcoesVendidasDetalhe.filter(o => !o.vencida).sort((a,b) => parseVencimento(a.vencimento) - parseVencimento(b.vencimento));
    // ADICIONADO 15/08/2026 (achado de auditoria de design: tabela ficava só com cabeçalho, sem
    // nenhum aviso, quando não há posição ativa nenhuma — usuário não sabia se era "zero posições"
    // ou "travou". Mesmo padrão de estado vazio já usado em render-livros-variaveis.js). NUNCA usar
    // `return` aqui — isso pularia o preenchimento de opcoesVencidas/opcoesExercidas mais abaixo,
    // que rodam dentro do mesmo bloco `if(opcoesTbodyEl)`.
    if(!opcoesOrdenadas.length){
      opcoesTbodyEl.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma posição ativa no momento.</td></tr>';
    } else {
    opcoesTbodyEl.innerHTML = opcoesOrdenadas.map(o => {
      // CORRIGIDO 01/08/2026: antes a cor vermelha do valorMercado vinha "de graca" de um bug
      // (classe .r colidindo entre "alinhar a direita" e "cor vermelha", ver styles.css) - o Strike
      // (coluna sem relacao nenhuma com lucro/prejuizo) tambem ficava vermelho por acidente. Agora
      // cor e explicita e correta: Strike sempre neutro; Valor de Mercado vermelho se negativo,
      // verde se positivo, neutro se exatamente zero.
      const corMercado = o.valorMercado < 0 ? 'var(--red)' : (o.valorMercado > 0 ? 'var(--green)' : 'inherit');
      const cot = cotacoes[o.ativo];
      // CORRIGIDO 01/08/2026 (achado do usuario - texto sobrepondo a coluna vizinha): o site usa
      // table-layout:fixed (V238, evita estouro de texto longo) - isso significa que colunas tem
      // largura FIXA e nao se ajustam ao conteudo. white-space:nowrap numa celula com fixed layout
      // nao quebra linha, so TRANSBORDA por cima da celula vizinha (nao gera scroll nem redimensiona).
      // Solucao: em vez de forcar tudo numa linha, o preco fica numa linha e o status/percentual
      // SEMPRE numa segunda linha (bloco, nao inline) - toda linha da tabela fica com a mesma altura
      // (2 linhas), nunca vaza pra fora da propria celula, nunca quebra de forma inconsistente entre linhas.
      let linha1 = '<span style="color:var(--text-dim)">— sem cotação</span>';
      let linha2 = '';
      if(cot && o.precoExercicio !== null){
        const distanciaPct = ((cot.preco - o.precoExercicio) / o.precoExercicio) * 100;
        const otm = cot.preco > o.precoExercicio; // PUT vendida: OTM (bom, vira po) quando preco > strike
        const corStatus = otm ? 'var(--green)' : 'var(--red)';
        const statusTxt = otm ? 'OTM' : 'ITM';
        const sinalPct = distanciaPct >= 0 ? '+' : '';
        // NOVO 21/08/2026 (motor de alerta em camadas): emoji do nível de risco também na tabela
        // principal, não só no banner/aba "Em Risco" — mesma função/critério, ver opcoes-roc.js.
        let nivelBadge = '';
        if(typeof calcularNivelRiscoOpcao === 'function' && o.vencimento){
          const [dvv,mvv,avv] = o.vencimento.split('/').map(Number);
          const hojeNivel = new Date(); hojeNivel.setHours(0,0,0,0);
          const diasNivel = Math.round((new Date(avv,mvv-1,dvv) - hojeNivel) / 86400000);
          const nivel = calcularNivelRiscoOpcao(Math.abs(distanciaPct), diasNivel, !otm);
          if(nivel) nivelBadge = ` <span title="${nivel.label}">${nivel.emoji}</span>`;
        }
        linha1 = `R$ ${cot.preco.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
        linha2 = `<span style="color:${corStatus};font-weight:600">${statusTxt}</span>${nivelBadge} <span style="color:var(--text-dim);font-size:0.68rem">(${sinalPct}${distanciaPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%)</span>`;
      } else if(cot && o.precoExercicio === null){
        linha1 = `R$ ${cot.preco.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
        linha2 = `<span style="color:var(--text-dim);font-size:0.68rem">(vencida)</span>`;
      }
      const acaoAgoraHtml = `<div>${linha1}</div><div style="min-height:1em">${linha2}</div>`;
      // CORRIGIDO 01/08/2026 (achado do usuario): coluna "Acao agora" nao estava nublando no modo
      // apresentacao - faltava a class="v" na propria celula (o conteudo e gerado por HTML, nao por
      // t(), entao nao herdava a classe automaticamente como os outros campos).
      // CORRIGIDO 01/08/2026 (notas de corretagem reais): premioRecebido JA E o liquido (conferido
      // nota a nota) - "Custos" agora mostra o valor real descontado, "Premio liquido" mostra
      // premioRecebido direto (SEM subtrair de novo, isso seria descontar os custos 2x). "Premio bruto"
      // e a nova coluna = premioBruto (valor da operacao antes dos descontos).
      const custoTxt = o.custoOperacional > 0 ? fmt(o.custoOperacional) : '<span style="color:var(--text-dim)">—</span>';
      // NOVO 03/08/2026 (Módulo 17 - ROC): coluna "Rentabilidade" - % ao mês + status semáforo + dias
      // corridos da operação, mesmo padrão 2-linhas já usado na coluna "Ação agora" (table-layout:fixed
      // não aceita nowrap sem transbordar, ver comentário acima).
      let rocLinha1 = '<span style="color:var(--text-dim)">— sem strike confirmado</span>';
      let rocLinha2 = '';
      if(o.roc && o.roc.rentabilidadeMensal !== null){
        const pctMensal = o.roc.rentabilidadeMensal * 100;
        rocLinha1 = `<span style="font-weight:600">${o.roc.statusROC.emoji} ${pctMensal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%/mês</span>`;
        // CORRIGIDO 08/08/2026 (bug real, achado ao investigar a tabela de opcoes travando):
        // comparacaoCDI pode ser null legitimamente (opcoes-roc.js so calcula quando cdiMensalFracao
        // > 0 E diasOperacao existe) - chamar toLocaleString() direto quebrava a renderizacao
        // INTEIRA da tabela (Array.map lanca e nenhuma linha aparece), nao so a celula.
        const comparacaoCDITxt = o.roc.comparacaoCDI !== null ? `${o.roc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}x CDI` : '—';
        rocLinha2 = `<span style="color:var(--text-dim);font-size:0.68rem">${o.roc.statusROC.label} · ${o.roc.diasOperacao}d · ${comparacaoCDITxt}</span>`;
      }
      const rocHtml = `<div>${rocLinha1}</div><div style="min-height:1em">${rocLinha2}</div>`;
      // NOVO 17/08/2026: marca visualmente quando o.valorMercado veio de cotação AO VIVO
      // (aplicarCotacoesOpcoesV2(), só PETR4) em vez do literal manual de vars-roc.js — sem isso, não
      // dava pra distinguir na tela um preço automatizado de um esperando nota de corretagem nova.
      const marcaAoVivo = o._cotacaoAoVivo ? ` <span title="Preço ao vivo (brapi.dev) — atualizado ${o._cotacaoAoVivoEm ? new Date(o._cotacaoAoVivoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}" style="font-size:0.6rem">🔄</span>` : '';

      // NOVO 21/08/2026 (pedido do usuario: contagem regressiva visivel em toda posicao ativa, nao so
      // nas em risco -- mesma comparacao por DIA ja usada em calcularAvisosOpcoesRisco()/opcoes-roc.js).
      let vencimentoHtml = o.vencimento || '-';
      if(o.vencimento){
        const [dv,mv,av] = o.vencimento.split('/').map(Number);
        const hojeCountdown = new Date(); hojeCountdown.setHours(0,0,0,0);
        const dias = Math.round((new Date(av,mv-1,dv) - hojeCountdown) / 86400000);
        const corDias = dias <= 2 ? 'var(--red)' : (dias <= 7 ? '#eab54f' : 'var(--text-dim)');
        const diasTxt = dias < 0 ? ('venceu ha ' + Math.abs(dias) + 'd') : dias === 0 ? 'vence hoje' : (dias + 'd');
        vencimentoHtml = o.vencimento + '<br><span style="color:' + corDias + ';font-size:0.68rem;font-weight:600">' + diasTxt + '</span>';
      }
      return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${Math.abs(o.quantidade)}un</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td>${vencimentoHtml}</td><td class="r v">${acaoAgoraHtml}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r" style="color:var(--green);font-weight:600">${o.premioRecebido===null ? '<span style="color:var(--text-dim);font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r" style="color:${corMercado}">${fmt(o.valorMercado)}${marcaAoVivo}</td><td class="r v">${rocHtml}</td></tr>`;
    }).join('');
    }
    // NOVO 08/08/2026 (badge de frescor + legendas dinâmicas, pedido do usuário): troca o horário
    // absoluto fixo por frescor relativo (montarBadgeFrescor), recalculado a cada 60s. hydrateROC()
    // não é async — os limites (indicadores) são buscados numa IIFE à parte, sem bloquear o resto
    // do hydrate; a legenda fixa de OTM/ITM (legOpcoesOtmItm) permanece de VARS.LEGENDAS sem troca.
    const legCotacoesEl = $('legOpcoesCotacoes');
    if(legCotacoesEl){
      const otmItmTxt = formatarLegenda('legOpcoesOtmItm') || 'OTM = fora do dinheiro (put vira pó, bom pro vendedor) · ITM = dentro do dinheiro (risco de exercício)';
      (async () => {
        let limitesFrescor;
        try {
          const [indVerde, indAmarelo, indLaranja] = await Promise.all([
            WallaceFinanceService.getIndicador('SOLAR_FRESCOR_LIMITES - minutosVerde'),
            WallaceFinanceService.getIndicador('SOLAR_FRESCOR_LIMITES - minutosAmarelo'),
            WallaceFinanceService.getIndicador('SOLAR_FRESCOR_LIMITES - minutosLaranja'),
          ]);
          limitesFrescor = {
            minutosVerde: indVerde ? Number(indVerde.valor) : 15,
            minutosAmarelo: indAmarelo ? Number(indAmarelo.valor) : 120,
            minutosLaranja: indLaranja ? Number(indLaranja.valor) : 1440,
          };
        } catch(err){
          console.warn('hydrateROC: falha ao buscar limites de frescor em indicadores — usando padrão.', err);
          limitesFrescor = { minutosVerde: 15, minutosAmarelo: 120, minutosLaranja: 1440 };
        }
        const renderizarFrescorCotacoes = () => {
          const badge = montarBadgeFrescor('legFrescorCotacoes', VARS.ACOES_COTACOES_ATUALIZADO_EM, limitesFrescor);
          legCotacoesEl.textContent = `${badge.texto} · ${otmItmTxt}`;
        };
        renderizarFrescorCotacoes();
        if(window.__wallaceFrescorCotacoesInterval) clearInterval(window.__wallaceFrescorCotacoesInterval);
        window.__wallaceFrescorCotacoesInterval = setInterval(renderizarFrescorCotacoes, 60000);
      })();
    }
    // CORRIGIDO 03/08/2026 (pedido do usuario - "a operação que venceu se move automaticamente pra
    // uma linha abaixo só de vencidas"): antes a posição vencida só era citada em texto solto
    // (legOpcoesVencidas). Agora ganha uma tabela própria (opcoesVencidasTbody), esmaecida, logo
    // abaixo da tabela ativa - mesma fonte (VARS.opcoesVendidasDetalhe, filtro o.vencida), nunca uma
    // segunda cópia escrita a mão. Ordenada por vencimento também (mais recente primeiro, já que são
    // todas passadas - a mais perto de hoje é a mais relevante pra conferir).
    const opcoesVencidasOrdenadas = [...opcoesVencidas].sort((a,b) => parseVencimento(b.vencimento) - parseVencimento(a.vencimento));
    const vencidasWrapEl = $('opcoesVencidasWrap');
    const vencidasTbodyEl = $('opcoesVencidasTbody');
    if(vencidasWrapEl && vencidasTbodyEl){
      vencidasWrapEl.style.display = opcoesVencidasOrdenadas.length > 0 ? '' : 'none';
      vencidasTbodyEl.innerHTML = opcoesVencidasOrdenadas.map(o => {
        const custoTxt = o.custoOperacional > 0 ? fmt(o.custoOperacional) : '<span style="color:var(--text-dim)">—</span>';
        // NOVO 03/08/2026 (pedido do usuario): mesma coluna de status ROC (semáforo + %/mês + dias +
        // xCDI) já usada na tabela de posições ativas - reaproveita o mesmo o.roc calculado 1x em
        // calcularROCOpcoes() (nunca recalculado aqui), então mostra "Fraca/Boa/Muito Boa/Excelente"
        // mesmo pra uma posição encerrada, deixando claro se aquela operação já fechada valeu a pena.
        let rocLinha1v = '<span style="color:var(--text-dim)">— sem strike confirmado</span>';
        let rocLinha2v = '';
        if(o.roc && o.roc.rentabilidadeMensal !== null){
          const pctMensalV = o.roc.rentabilidadeMensal * 100;
          rocLinha1v = `<span style="font-weight:600">${o.roc.statusROC.emoji} ${pctMensalV.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%/mês</span>`;
          // CORRIGIDO 08/08/2026 (mesmo bug da tabela ativa, ver comentario acima): comparacaoCDI
          // pode ser null legitimamente.
          const comparacaoCDITxtV = o.roc.comparacaoCDI !== null ? `${o.roc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}x CDI` : '—';
          rocLinha2v = `<span style="font-size:0.68rem">${o.roc.statusROC.label} · ${o.roc.diasOperacao}d · ${comparacaoCDITxtV}</span>`;
        }
        const rocHtmlV = `<div>${rocLinha1v}</div><div style="min-height:1em">${rocLinha2v}</div>`;
        return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${Math.abs(o.quantidade)}un</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td>${o.vencimento}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r">${o.premioRecebido===null ? '<span style="font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r v">${rocHtmlV}</td></tr>`;
      }).join('');
    }
    // NOVO 03/08/2026 (pedido do usuario): avisa por que a posicao vencida saiu da tabela ativa e do
    // Valor de mercado, sem esconder o fato de que ela existe/existiu - documentado, nao omitido (P1).
    // Texto encurtado agora que a tabela acima já mostra ticker/strike/prêmios - não precisa repetir.
    const legVencidasEl = $('legOpcoesVencidas');
    if(legVencidasEl){
      legVencidasEl.textContent = opcoesVencidasOrdenadas.length > 0
        ? `Fora da tabela de posições ativas e do Valor de mercado; resultado final de cada uma registrado em "resultadoHistorico".`
        : '';
    }

    // NOVO 03/08/2026 (pedido do usuario, opcao A): tabela "Posições exercidas" - mesmo padrao exato
    // da tabela de Vencidas acima (mesma fonte, mesmas colunas, mesmo ROC reaproveitado), so trocando
    // o filtro pra o.exercida=true. Confirmacao de exercicio e sempre manual (ver comentario no campo
    // o.exercida, na origem do array) - o "automatico" aqui e so o MOVIMENTO da linha, nao a deteccao.
    const opcoesExercidasOrdenadas = [...opcoesExercidas].sort((a,b) => parseVencimento(b.vencimento) - parseVencimento(a.vencimento));
    const exercidasWrapEl = $('opcoesExercidasWrap');
    const exercidasTbodyEl = $('opcoesExercidasTbody');
    if(exercidasWrapEl && exercidasTbodyEl){
      exercidasWrapEl.style.display = opcoesExercidasOrdenadas.length > 0 ? '' : 'none';
      exercidasTbodyEl.innerHTML = opcoesExercidasOrdenadas.map(o => {
        const custoTxt = o.custoOperacional > 0 ? fmt(o.custoOperacional) : '<span style="color:var(--text-dim)">—</span>';
        let rocLinha1e = '<span style="color:var(--text-dim)">— sem strike confirmado</span>';
        let rocLinha2e = '';
        if(o.roc && o.roc.rentabilidadeMensal !== null){
          const pctMensalE = o.roc.rentabilidadeMensal * 100;
          rocLinha1e = `<span style="font-weight:600">${o.roc.statusROC.emoji} ${pctMensalE.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%/mês</span>`;
          // CORRIGIDO 08/08/2026 (mesmo bug das outras 2 tabelas, ver comentario acima): comparacaoCDI
          // pode ser null legitimamente.
          const comparacaoCDITxtE = o.roc.comparacaoCDI !== null ? `${o.roc.comparacaoCDI.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}x CDI` : '—';
          rocLinha2e = `<span style="font-size:0.68rem">${o.roc.statusROC.label} · ${o.roc.diasOperacao}d · ${comparacaoCDITxtE}</span>`;
        }
        const rocHtmlE = `<div>${rocLinha1e}</div><div style="min-height:1em">${rocLinha2e}</div>`;
        return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${Math.abs(o.quantidade)}un</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td>${o.vencimento}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r">${o.premioRecebido===null ? '<span style="font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r v">${rocHtmlE}</td></tr>`;
      }).join('');
    }
    const legExercidasEl = $('legOpcoesExercidas');
    if(legExercidasEl){
      legExercidasEl.textContent = opcoesExercidasOrdenadas.length > 0
        ? `Exercício confirmado manualmente via nota de corretagem — capital travado já saiu da soma do ROC desde o vencimento (mesma regra de qualquer posição vencida).`
        : '';
    }
  }
}

// NOVO 17/08/2026 (pedido do usuário, item 1 da lista de 4 pendências: "Créditos e Cupons" migrado
// pra tabela própria — ver WallaceFinanceService.getBeneficiosCreditos()). Card "Uber/Shell Box/KMV
// Ipiranga" carregava só do literal VARS (sem tabela nenhuma antes disso); agora essa tabela é a
// fonte real, atualizável via Chat sem precisar de deploy. Fallback: se a busca falhar, o literal
// VARS já escrito por hydrateROC() continua na tela — nunca fica em branco.
async function aplicarBeneficiosCreditosV2(){
  let creditos;
  try {
    creditos = await WallaceFinanceService.getBeneficiosCreditos();
  } catch(err){
    console.error('BeneficiosCreditosV2: falha ao buscar beneficios_creditos — mantido o literal VARS (fallback).', err);
    window.WALLACE_BENEFICIOS_CREDITOS_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(creditos)){
    console.warn('BeneficiosCreditosV2: resposta inesperada — mantido o literal VARS (fallback).');
    window.WALLACE_BENEFICIOS_CREDITOS_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const MAPA_CREDITO_DOM = { uber: 'credUberTotal', shell_box: 'credShellBox', kmv_ipiranga: 'credKmv' };
  creditos.forEach(c => {
    const idDom = MAPA_CREDITO_DOM[c.nome];
    if(!idDom) return;
    t(idDom, fmt(Number(c.saldo)));
  });
  window.WALLACE_BENEFICIOS_CREDITOS_RELATORIO = { status: 'ok', creditos };
  console.log('BeneficiosCreditosV2: card Créditos e Cupons atualizado da V2 — relatório em window.WALLACE_BENEFICIOS_CREDITOS_RELATORIO', window.WALLACE_BENEFICIOS_CREDITOS_RELATORIO);
}

// NOVO 17/08/2026 (card ROC/opções, pedido do usuário: "procure uma fonte gratuita, tente
// implementar" — até aqui "Valor de mercado" das puts vendidas só mudava quando alguém editava
// vars-roc.js à mão a partir de uma nota de corretagem nova). Sobrepõe o preço AO VIVO (tabela
// `cotacoes_opcoes`, alimentada por scripts/sync/atualizar_cotacoes_opcoes.py via brapi.dev) em cima
// do literal estático de VARS.opcoesVendidasDetalhe, quando existir — nunca reescreve vars-roc.js,
// só o VARS em memória, mesmo padrão de aplicarBeneficiosCreditosV2() logo acima. Cobertura parcial
// de propósito: brapi só libera opções sem token pra PETR4 (ITUB4 exigiria plano Pro pago,
// desproporcional pra 1 posição) — ITUBT424 continua 100% manual, sem indicador de "ao vivo".
async function aplicarCotacoesOpcoesV2(){
  let cotacoes;
  try {
    cotacoes = await WallaceFinanceService.getCotacoesOpcoes();
  } catch(err){
    console.error('CotacoesOpcoesV2: falha ao buscar cotacoes_opcoes — mantido o literal VARS (fallback, mesmo comportamento de sempre).', err);
    window.WALLACE_COTACOES_OPCOES_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(cotacoes) || !cotacoes.length){
    window.WALLACE_COTACOES_OPCOES_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }
  const porSymbol = {};
  cotacoes.forEach(c => { porSymbol[c.symbol] = c; });
  let atualizados = 0;
  VARS.opcoesVendidasDetalhe.forEach(o => {
    const c = porSymbol[o.ticker];
    if(!c) return; // sem cotação ao vivo pra esse ticker (ex: ITUB4) — mantém o literal manual
    o.cotacaoAtual = Number(c.preco);
    o.valorMercado = Math.round(o.quantidade * o.cotacaoAtual * 100) / 100;
    o._cotacaoAoVivo = true;
    o._cotacaoAoVivoEm = c.atualizado_em;
    atualizados++;
  });
  if(atualizados > 0){
    // Recalcula a soma consolidada (VARS.opcoesVendidasValorMercado) a partir dos valores já
    // atualizados acima — mesma função que já roda no boot síncrono (opcoes-roc.js), reentrante.
    if(typeof aplicarStatusVencidoEValorMercadoOpcoes === 'function') aplicarStatusVencidoEValorMercadoOpcoes();
    if(typeof hydrateROC === 'function') hydrateROC();
  }
  window.WALLACE_COTACOES_OPCOES_RELATORIO = { status: 'ok', atualizados, cotacoes };
  console.log('CotacoesOpcoesV2: preço ao vivo aplicado —', atualizados, 'série(s) atualizada(s). Relatório em window.WALLACE_COTACOES_OPCOES_RELATORIO', window.WALLACE_COTACOES_OPCOES_RELATORIO);
}

// NOVO 21/08/2026 (pedido do usuário: "gráfico pra analisar as tendências das ações das opções,
// deve registrar o valor do dia que entrei na opção e ir montando a tendência de subida ou descida
// em direção ao vencimento"). Lê `cotacoes_acoes_historico` (nova, 1 linha por ticker/dia — ver
// migração 21/08/2026 e getCotacoesAcoesHistorico() em app.js) desde a data da nota de corretagem
// (campo o.notaCorretagem, formato "NNNNN (DD/MM/AAAA)") até o vencimento. Um gráfico por posição
// ATIVA (não por ativo-base — 2 opções do mesmo ativo, ex. 2 puts de ITUB4 com vencimentos
// diferentes, teriam períodos diferentes). CORRIGIDO 21/08/2026 (achado de auditoria: esta linha
// dizia "não por ticker", palavra errada — confundiu o agente de auditoria, que leu "ticker" aqui
// como se fosse o.ticker, o código da OPÇÃO específica, quando na verdade queria dizer o.ativo, o
// papel-base ITUB4/PETR4). O id do canvas já usa `tendencia_${o.ticker}` (não `${o.ativo}`) — cada
// série de opção tem código único na B3 (ex: ITUBT424 ≠ ITUBS425), então 2 puts do mesmo ativo NUNCA
// colidem de id, mesmo antes desta correção de comentário. Não era bug funcional, só imprecisão de texto.
// Linha do preço + linha pontilhada do strike, pra ver visualmente se a tendência aproxima ou afasta
// do strike. Chamado via onDomPronto() (app.js) — roda depois do boot síncrono, quando
// VARS.opcoesVendidasDetalhe já existe e hydrateROC() já rodou pelo menos uma vez.
async function aplicarTendenciaOpcoes(){
  const container = $('opcoesTendenciaContainer');
  if(!container) return;
  const ativas = (VARS.opcoesVendidasDetalhe || []).filter(o => !o.vencida && o.precoExercicio != null && o.notaCorretagem && o.vencimento);
  if(!ativas.length){ container.innerHTML = ''; return; }

  // CORRIGIDO 22/08/2026 (achado do usuário: "esse gráfico ficou sem controle, melhore a função e
  // posição" — desde que este bloco virou card próprio (antes vivia espremido junto de outros
  // blocos), 2 problemas ficaram visíveis: (1) título genérico duplicado com o título do próprio
  // .card (ver opcoesTendenciaCard/Sistema_Wallace_Lira_Completo.html, que já diz "Tendência das
  // posições ativas") — removido daqui, cada posição já tem seu próprio subtítulo com strike/
  // vencimento, não precisa de um 3º nível de título; (2) altura de 170px ficava esticada/achatada
  // numa card full-width — 260px dá proporção melhor pro tamanho real que o gráfico ocupa agora.
  container.innerHTML = ativas.map(o => `<div style="margin-bottom:1.2rem"><div style="font-size:var(--fs-2xs);color:var(--text-dim);margin-bottom:0.3rem">${o.ativo} PUT (${o.ticker}) — strike ${fmt(o.precoExercicio)} · vencimento ${o.vencimento}</div><div style="height:260px"><canvas id="tendencia_${o.ticker}"></canvas></div></div>`).join('');

  for(const o of ativas){
    const m = /\((\d{2})\/(\d{2})\/(\d{4})\)/.exec(o.notaCorretagem);
    if(!m){ console.warn('TendenciaOpcoes: notaCorretagem sem data reconhecível pra', o.ativo, o.notaCorretagem); continue; }
    const entradaIso = `${m[3]}-${m[2]}-${m[1]}`;
    const [dv,mv,av] = o.vencimento.split('/');
    const vencimentoIso = `${av}-${mv}-${dv}`;
    let historico;
    try {
      historico = await WallaceFinanceService.getCotacoesAcoesHistorico(o.ativo, entradaIso, vencimentoIso);
    } catch(err){
      console.error('TendenciaOpcoes: falha ao buscar histórico de', o.ativo, err);
      continue;
    }
    if(!Array.isArray(historico) || !historico.length) continue;
    const canvas = $(`tendencia_${o.ticker}`);
    if(!canvas || typeof Chart === 'undefined') continue;
    const labels = historico.map(h => { const [,mo,d] = h.data.split('-'); return `${d}/${mo}`; });
    const precos = historico.map(h => Number(h.preco_fechamento));
    const strikeLine = historico.map(() => o.precoExercicio);
    const existente = Chart.getChart(canvas);
    if(existente) existente.destroy();
    new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Cotação', data: precos, borderColor: '#4c8ef2', backgroundColor: 'rgba(76,142,242,0.10)', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2 },
        { label: 'Strike', data: strikeLine, borderColor: '#ef5b56', borderDash: [6,4], pointRadius: 0, borderWidth: 1.5 },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw)}` } } },
        scales: {
          x: { ticks: { font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
          y: { ticks: { font: { size: 9 }, callback: v => 'R$'+v } },
        },
      },
    });
  }
}

// NOVO 22/08/2026 (pedido do usuário: "como mudo a ação desse gráfico? preciso poder mudar para a
// ação que eu quizer" — aplicarTendenciaOpcoes() acima só mostra ações com opção ATIVA aberta; esta
// função é livre, qualquer um dos 10 tickers que scripts/sync/atualizar_cotacoes_acoes.py já grava
// diariamente em cotacoes_acoes_historico (mesma fonte, WallaceFinanceService.getCotacoesAcoesHistorico).
// Sem strike (não está ligada a nenhuma opção específica) — só a série de preço dos últimos ~90 dias
// disponíveis. Chamada 1x no boot (aba "Tendências" do cockpit) + de novo a cada troca no <select>.
async function aplicarTendenciaTickerLivre(){
  const select = $('tendenciaTickerLivreSelect');
  const periodoSelect = $('tendenciaTickerLivrePeriodoSelect');
  const canvas = $('cTendenciaTickerLivre');
  const legEl = $('legTendenciaTickerLivre');
  const badgeEl = $('tendenciaTickerLivreBadge');
  if(!select || !canvas || typeof Chart === 'undefined') return;
  const ticker = select.value;
  // AMPLIADO 22/08/2026 (pedido do usuário: "com opção de período" — antes fixo em 90 dias, sem
  // seletor). periodoSelect pode não existir ainda em cache antigo do navegador (fallback 90).
  const dias = periodoSelect ? Number(periodoSelect.value) : 90;
  const hoje = new Date();
  const desde = new Date(hoje); desde.setDate(desde.getDate() - dias);
  const fmtIso = d => d.toISOString().slice(0,10);
  let historico;
  try {
    historico = await WallaceFinanceService.getCotacoesAcoesHistorico(ticker, fmtIso(desde), fmtIso(hoje));
  } catch(err){
    console.error('TendenciaTickerLivre: falha ao buscar histórico de', ticker, err);
    if(legEl) legEl.textContent = 'Não consegui buscar o histórico de '+ticker+' agora.';
    return;
  }
  // CORRIGIDO 22/08/2026 (achado do usuário: "cadê o gráfico e cadê a indicação de tendência" — pra
  // ITSA4/BBDC4/BBAS3/WEGE3/ABEV3/B3SA3, o robô só começou a registrar 1 ponto (21/08/2026), o
  // gráfico desenhava uma linha reta sem sentido e o badge mostrava "▲ +0,0%" — tecnicamente
  // verdadeiro (mesmo dia comparado com ele mesmo) mas enganoso, parecia bug em vez de "ainda não
  // tem dado suficiente". PETR4/ITUB4/VALE3/MGLU3 já têm ~90 dias reais; os 6 que exigem
  // BRAPI_TOKEN (não disponível fora do GitHub Actions) só vão acumular histórico dia a dia a
  // partir de agora — sem inventar backfill que não dá pra confirmar como real.
  const HISTORICO_MINIMO_PONTOS = 5;
  if(!Array.isArray(historico) || historico.length < HISTORICO_MINIMO_PONTOS){
    const nDias = Array.isArray(historico) ? historico.length : 0;
    if(legEl) legEl.textContent = nDias === 0
      ? 'Ainda sem histórico de cotações pra '+ticker+' (o robô só acompanha esse ticker a partir do dia em que foi adicionado).'
      : 'Histórico insuficiente pra '+ticker+' ainda (só '+nDias+' dia(s) coletado(s) — o robô roda diariamente, volta em alguns dias pra ver a tendência formada).';
    if(badgeEl) badgeEl.style.display = 'none';
    const existenteVazio = Chart.getChart(canvas); if(existenteVazio) existenteVazio.destroy();
    return;
  }
  const labels = historico.map(h => { const [,mo,d] = h.data.split('-'); return `${d}/${mo}`; });
  const precos = historico.map(h => Number(h.preco_fechamento));
  const existente = Chart.getChart(canvas);
  if(existente) existente.destroy();
  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [
      { label: ticker, data: precos, borderColor: '#4c8ef2', backgroundColor: 'rgba(76,142,242,0.10)', fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.raw) } } },
      scales: {
        x: { ticks: { font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
        y: { ticks: { font: { size: 9 }, callback: v => 'R$'+v } },
      },
    },
  });
  const primeiro = precos[0], ultimo = precos[precos.length-1];
  const variacaoPct = primeiro ? Math.round(((ultimo-primeiro)/primeiro)*1000)/10 : null;
  // NOVO 22/08/2026 (pedido do usuário: "o gráfico deve indicar a tendência de queda ou subida do
  // ativo" — antes só dava pra saber lendo o texto pequeno da legenda). Badge visual ▲/▼ + variação
  // %, mesma paleta verde/vermelho já usada no resto do painel (.badge.bg/.badge.br).
  if(badgeEl){
    if(variacaoPct != null){
      badgeEl.style.display = 'inline-flex';
      badgeEl.className = 'badge ' + (variacaoPct >= 0 ? 'bg' : 'br');
      badgeEl.textContent = (variacaoPct >= 0 ? '▲ +' : '▼ ') + variacaoPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}) + '%';
    } else {
      badgeEl.style.display = 'none';
    }
  }
  if(legEl) legEl.textContent = historico.length+' dia(s) de histórico, '+fmtIso(desde).split('-').reverse().join('/')+' → hoje'+(variacaoPct!=null ? ' — variação de '+fmt(primeiro)+' para '+fmt(ultimo)+' ('+(variacaoPct>=0?'+':'')+variacaoPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%)' : '')+'. Histórico puro (sem projeção) — não é conselho de investimento.';
}

// NOVO 22/08/2026 (pedido do usuário: "quero essa aba profissional, tem que ter tudo para me ajudar
// a decidir as operações que vou fazer" — antes de vender uma PUT nova, o usuário precisa comparar
// MOMENTUM entre os 10 ativos acompanhados de uma vez, não só olhar 1 de cada vez no gráfico de
// tendência livre). Mesma fonte de dado (cotacoes_acoes_historico via getCotacoesAcoesHistorico) —
// busca ~32 dias de histórico de cada ticker, calcula variação % dos últimos 7 e 30 dias, ordena por
// variação de 30 dias (maior alta primeiro). Clicar numa linha abre o gráfico daquele ativo na aba
// Tendências (mostrarTendenciaTickerLivre logo abaixo) — liga o radar ao gráfico já existente em vez
// de duplicar visualização.
const TICKERS_RADAR_OPCOES = ['PETR4','ITUB4','VALE3','MGLU3','ITSA4','BBDC4','BBAS3','WEGE3','ABEV3','B3SA3'];
async function aplicarRadarAtivosOpcoes(){
  const container = $('radarAtivosOpcoesContainer');
  if(!container || typeof WallaceFinanceService === 'undefined') return;
  const hoje = new Date();
  const desde = new Date(hoje); desde.setDate(desde.getDate() - 32);
  const fmtIso = d => d.toISOString().slice(0,10);
  const resultados = await Promise.all(TICKERS_RADAR_OPCOES.map(async ticker => {
    let historico;
    try {
      historico = await WallaceFinanceService.getCotacoesAcoesHistorico(ticker, fmtIso(desde), fmtIso(hoje));
    } catch(err){
      console.error('RadarAtivosOpcoes: falha ao buscar', ticker, err);
      return { ticker, semDado: true };
    }
    if(!Array.isArray(historico) || !historico.length) return { ticker, semDado: true };
    const porData = {};
    historico.forEach(h => { porData[h.data] = Number(h.preco_fechamento); });
    const datasOrdenadas = Object.keys(porData).sort();
    const ultimaData = datasOrdenadas[datasOrdenadas.length - 1];
    const precoAtual = porData[ultimaData];
    const variacaoDesde = diasAtras => {
      const alvo = new Date(ultimaData); alvo.setDate(alvo.getDate() - diasAtras);
      const alvoIso = fmtIso(alvo);
      const dataBase = datasOrdenadas.filter(d => d <= alvoIso).pop();
      if(!dataBase) return null;
      const precoBase = porData[dataBase];
      return precoBase ? Math.round(((precoAtual - precoBase) / precoBase) * 1000) / 10 : null;
    };
    return { ticker, precoAtual, var7d: variacaoDesde(7), var30d: variacaoDesde(30) };
  }));
  const validos = resultados.filter(r => !r.semDado);
  if(!validos.length){
    container.innerHTML = '<div style="font-size:var(--fs-2xs);color:var(--text-dim);font-style:italic">Ainda sem histórico de cotações suficiente pra montar o radar.</div>';
    return;
  }
  validos.sort((a,b) => (b.var30d ?? -999) - (a.var30d ?? -999));
  const badgeVariacao = v => v == null
    ? '<span style="color:var(--text-dim)">—</span>'
    : `<span style="color:${v>=0?'var(--green)':'var(--red)'};font-weight:600">${v>=0?'▲ +':'▼ '}${Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</span>`;
  container.innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th scope="col">Ativo</th><th scope="col" class="r">Preço atual</th><th scope="col" class="r">Variação 7d</th><th scope="col" class="r">Variação 30d</th></tr></thead><tbody>`
    + validos.map(r => `<tr style="cursor:pointer" onclick="mostrarTendenciaTickerLivre('${r.ticker}')" title="Ver gráfico de ${r.ticker} na aba Tendências"><td>${r.ticker}</td><td class="r">${fmt(r.precoAtual)}</td><td class="r">${badgeVariacao(r.var7d)}</td><td class="r">${badgeVariacao(r.var30d)}</td></tr>`).join('')
    + `</tbody></table></div><div style="font-size:var(--fs-2xs);color:var(--text-dim);margin-top:0.5rem">Ordenado por variação de 30 dias. Clique numa linha pra ver o gráfico completo na aba Tendências. Histórico puro (sem projeção) — não é conselho de investimento.</div>`;
}

// Ponte radar → gráfico de tendência livre: troca o ticker selecionado, muda pra aba "Tendências" do
// cockpit (dentro do card Posições) e rola até lá — reaproveita o gráfico já existente em vez de
// duplicar, ver aplicarRadarAtivosOpcoes() acima.
function mostrarTendenciaTickerLivre(ticker){
  const select = $('tendenciaTickerLivreSelect');
  if(select){ select.value = ticker; aplicarTendenciaTickerLivre(); }
  const botaoAba = document.querySelector('.opcoes-tab[onclick*="opcoesPaneTendencias"]');
  if(botaoAba && typeof showOpcoesTab === 'function') showOpcoesTab('opcoesPaneTendencias', botaoAba);
  const alvo = $('opcoesPaneTendencias');
  if(alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// NOVO 21/08/2026 (Fase 3 do cockpit de opções, pedido do usuário: "Carteira de Ações Recebidas —
// toda ação recebida por exercício deve entrar nela"). DERIVADA de VARS.opcoesVendidasDetalhe
// (filtro o.exercida=true) — sem tabela nova de posição, pra não duplicar dado que já existe (mesma
// lição já aplicada 2x nesta sessão). Preço médio = soma ponderada dos strikes das opções exercidas
// desse ativo (só faz sentido agrupar por ativo — 2 exercícios do mesmo PETR4 em datas diferentes
// viram 1 posição consolidada, como aconteceria na conta real da corretora). "Situação" mostra fato
// objetivo (cotação acima/abaixo do custo médio), nunca recomendação — não sou consultor de
// investimentos, ver ressalva no rodapé da própria tabela.
async function aplicarCarteiraAcoesExercidas(){
  const container = $('carteiraAcoesExercidasConteudo');
  if(!container) return;
  const exercidas = (VARS.opcoesVendidasDetalhe || []).filter(o => o.exercida && o.precoExercicio != null);
  if(!exercidas.length){
    container.innerHTML = '<div style="color:var(--text-dim);padding:1rem 0;text-align:center">Nenhuma ação recebida por exercício ainda.</div>';
    return;
  }
  const porAtivo = {};
  exercidas.forEach(o => {
    const qtd = Math.abs(o.quantidade);
    if(!porAtivo[o.ativo]) porAtivo[o.ativo] = { ativo: o.ativo, qtdTotal: 0, custoTotal: 0 };
    porAtivo[o.ativo].qtdTotal += qtd;
    porAtivo[o.ativo].custoTotal += qtd * o.precoExercicio;
  });
  const cotacoes = VARS.ACOES_COTACOES || {};
  const hojeD = new Date(); hojeD.setHours(0,0,0,0);
  const umAnoAtras = new Date(hojeD); umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
  const linhasHtml = [];
  for(const p of Object.values(porAtivo)){
    const qtd = p.qtdTotal;
    const precoMedio = Math.round(p.custoTotal / qtd * 100) / 100;
    const cot = cotacoes[p.ativo];
    const cotacaoAtual = cot && cot.preco != null ? Number(cot.preco) : null;
    const lucroPrejuizo = cotacaoAtual != null ? Math.round((cotacaoAtual - precoMedio) * qtd * 100) / 100 : null;
    let dividendos = [];
    try { dividendos = await WallaceFinanceService.getDividendosAcao(p.ativo); } catch(err){ console.error('CarteiraAcoesExercidas: falha ao buscar dividendos de', p.ativo, err); }
    const comData = s => s ? new Date(s+'T00:00:00') : null;
    const futuros = (dividendos||[]).filter(d => comData(d.data_pagamento) && comData(d.data_pagamento) >= hojeD).sort((a,b) => comData(a.data_pagamento) - comData(b.data_pagamento));
    const proximo = futuros[0] || null;
    const ultimos12m = (dividendos||[]).filter(d => { const dt = comData(d.data_pagamento); return dt && dt >= umAnoAtras && dt <= hojeD; });
    const somaDividendos12m = ultimos12m.reduce((s,d) => s + Number(d.valor), 0);
    const dy = cotacaoAtual ? Math.round(somaDividendos12m / cotacaoAtual * 10000) / 100 : null;
    const situacao = cotacaoAtual != null
      ? (cotacaoAtual >= precoMedio
        ? `<span style="color:var(--green)">Acima do custo (+${((cotacaoAtual/precoMedio-1)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%)</span>`
        : `<span style="color:var(--red)">Abaixo do custo (${((cotacaoAtual/precoMedio-1)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%)</span>`)
      : '—';
    linhasHtml.push(`<tr>
      <td>${p.ativo}</td>
      <td class="r">${qtd}un</td>
      <td class="r">${fmt(precoMedio)}</td>
      <td class="r">${cotacaoAtual != null ? fmt(cotacaoAtual) : '—'}</td>
      <td class="r" style="color:${lucroPrejuizo>0?'var(--green)':lucroPrejuizo<0?'var(--red)':'inherit'}">${lucroPrejuizo != null ? fmt(lucroPrejuizo) : '—'}</td>
      <td class="r">${dy != null ? dy.toLocaleString('pt-BR',{minimumFractionDigits:2})+'%' : '—'}</td>
      <td class="r">${proximo ? fmt(Number(proximo.valor))+' ('+proximo.tipo+')' : '—'}</td>
      <td>${proximo && proximo.data_com ? comData(proximo.data_com).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${proximo && proximo.data_pagamento ? comData(proximo.data_pagamento).toLocaleDateString('pt-BR') : '—'}</td>
      <td>${situacao}</td>
    </tr>`);
  }
  container.innerHTML = `<div style="overflow-x:auto"><table><thead><tr>`
    + `<th scope="col">Ativo</th><th scope="col" class="r">Qtd</th><th scope="col" class="r">Preço médio</th>`
    + `<th scope="col" class="r">Cotação atual</th><th scope="col" class="r">Lucro/Prejuízo</th>`
    + `<th scope="col" class="r">Dividend Yield (12m)</th><th scope="col" class="r">Próximo dividendo</th>`
    + `<th scope="col">Data COM</th><th scope="col">Data pagamento</th><th scope="col">Situação</th>`
    + `</tr></thead><tbody>${linhasHtml.join('')}</tbody></table></div>`
    + `<div style="font-size:var(--fs-2xs);color:var(--text-dim);margin-top:0.5rem">Preço médio = soma ponderada dos strikes das opções exercidas desse ativo. "Situação" é só a comparação objetiva entre cotação e custo — não é recomendação de venda/compra.</div>`;
}
