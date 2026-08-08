// MÓDULO: hydrateROC() — renderização da seção 17 (Opções vendidas / ROC)
// Extraído de hydrate() (app.js) na modularização (07/08/2026). Script clássico (não ES module),
// carrega DEPOIS do app.js terminar (onload) — só DEFINE a função aqui; QUEM CHAMA continua sendo
// hydrate() (em app.js), no mesmo ponto exato da sequência original. Não usa REG nenhuma vez, só
// VARS/$/t/fmt/setBadge (já existem quando hydrate() roda). Nenhuma fórmula, id de DOM ou
// comportamento visual foi alterado — só o arquivo que hospeda o código.
function hydrateROC(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };

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
  Object.keys(VARS.LEGENDAS).forEach(id => {
    const el = $(id);
    if(el) el.innerHTML = VARS.LEGENDAS[id].replace(RE_VALOR_MONETARIO, m => `<span class="v">${m}</span>`);
  });
  // NOVO 31/07/2026 (V219): alivio de agosto - calculo real, ver VARS.alivioProximoMes acima.
  const legAlivioEl = $('legAlivioAgosto');
  if(legAlivioEl) legAlivioEl.innerHTML = `Alívio de <span class="v">${fmt(VARS.alivioProximoMes)}</span>/mês a partir do próximo ciclo (parcelas do Visa Infinite + Mercado Pago que terminam agora) — não considera ainda o fim do seguro auto em outubro/2026`;
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
        linha1 = `R$ ${cot.preco.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
        linha2 = `<span style="color:${corStatus};font-weight:600">${statusTxt}</span> <span style="color:var(--text-dim);font-size:0.68rem">(${sinalPct}${distanciaPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%)</span>`;
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
      return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${Math.abs(o.quantidade)}un</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td class="r">${o.vencimento||'-'}</td><td class="r v">${acaoAgoraHtml}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r" style="color:var(--green);font-weight:600">${o.premioRecebido===null ? '<span style="color:var(--text-dim);font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r" style="color:${corMercado}">${fmt(o.valorMercado)}</td><td class="r v">${rocHtml}</td></tr>`;
    }).join('');
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
        return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${Math.abs(o.quantidade)}un</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td class="r">${o.vencimento}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r">${o.premioRecebido===null ? '<span style="font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r v">${rocHtmlV}</td></tr>`;
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
        return `<tr><td>${o.ativo} PUT</td><td>${o.ticker}</td><td class="r">${Math.abs(o.quantidade)}un</td><td class="r">${o.precoExercicio===null ? '—' : o.precoExercicio.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td><td class="r">${o.vencimento}</td><td class="r">${o.premioBruto===undefined ? '—' : fmt(o.premioBruto)}</td><td class="r">${custoTxt}</td><td class="r">${o.premioRecebido===null ? '<span style="font-style:italic">pendente</span>' : fmt(o.premioRecebido)}</td><td class="r v">${rocHtmlE}</td></tr>`;
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
