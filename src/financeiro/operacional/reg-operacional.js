// MÓDULO: criarRegOperacional() — fragmento do REG (estado inicial) para o domínio Operacional:
// operacional (salário/reembolsos/necessidade/modo), totalOpDetalhe, estimador, deficitZero,
// superavitNormal, evolucao, qualidade, cenarioHistorico, suporteCoIrmaEventos. Extraído do literal
// `const REG = {...}` de app.js na modularização (07/08/2026) — MESMOS valores, MESMA estrutura.
// IMPORTANTE: vira uma FUNÇÃO (não um objeto de topo) porque os valores dependem de VARS, avaliado
// no momento da CHAMADA — chamada em app.js no mesmo ponto exato onde o literal REG.operacional
// existia, depois de VARS já estar populado (mesmo motivo de CARTAO_PLUGGY_MAPA_DEFAULT ser literal
// mas a linha derivada ficar em app.js). "Não alterar estrutura de dados consumida pelos módulos
// existentes" — os módulos de renderização/cálculo continuam lendo REG.operacional.*/REG.qualidade.*
// etc normalmente, sem nenhuma mudança de forma.
function criarRegOperacional(){
  return {
    operacional: {
      salario: VARS.salario,
      reembolsosAReceber: VARS.__reembolsosAReceber !== undefined ? VARS.__reembolsosAReceber : 0,     // V145: le do ciclo selecionado (era hardcoded 0)
      reembolsoCicloTotal: VARS.reembolsoCicloTotal,        // Recebidos (4.914,98, ja inclui a TED de 21/07) + A Receber (0) - regra V50
      reembolsoPagaWartsila: VARS.faturaWartsila,       // V137: le do VARS (fatura paga integralmente pelo reembolso - mesmo numero, 4a copia eliminada)
      reembolsoPagaCartaoCorporativo: VARS.reembolsoPagaCartaoCorporativo, // NOMEADO V128, corrigido (era 483.43 - extrato real do cofrinho "Fatura Visa Infinit")
      reembolsoSobraPessoal: 0,      // SOBRESCRITO por recalcularAgregadosDerivados() logo apos o REG - este valor aqui e so o ultimo snapshot conhecido, para leitura humana.
      reembolsoPagaMPCorporativo: VARS.reembolsoPagaMPCorporativo, // Transporte corporativo (perna 2 da cascata, varia por ciclo)
      entradasTotais: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = salario + reembolsoCicloTotal. V128 CORRIGIDO (bug real): formula antiga usava reembolsosAReceber, que ia a zero quando o reembolso chegava, fazendo entradasTotais CAIR errado. Era R$36.138,37.
      totalOperacional: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = soma de totalOpDetalhe. Editar os componentes, nao este numero. V111: -R$88,00 (Vivo atualizada).
      orcamentoOperacional: VARS.orcamentoOperacional,
      proLaboreFixo: VARS.proLaboreFixo, // ATIVADO 25/07/2026 (V143): usado para calcular saldoCicloBase/modoOperacional dinamicamente
      necessidadeTotalBruta: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = totalOperacional + orcamentoOperacional. V111: -R$88,00.
      coberturaGarantida: VARS.coberturaGarantida,     // Sem alteracao.
      necessidadeLiquida: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = necessidadeTotalBruta - coberturaGarantida. V111: -R$88,00.
      saldoCiclo: 0,     // SOBRESCRITO por recalcularAgregadosDerivados() = balanco.fluxo.entradas - necessidadeTotalBruta. V111: +R$88,00.
      modoOperacional: 'Normal', // CORRIGIDO 25/07/2026 (V144): placeholder inicial - SEMPRE sobrescrito por recalcularAgregadosDerivados() com base no saldoCiclo real (secao 10 Politicas). Antes ficava fixo em 'Alto' manualmente, nunca recalculava - bug corrigido, confirmado pelo usuario que o calculo dinamico deve valer mesmo quando mostrar Normal/Baixo/Critico.
      // totalOperacionalMar27 removido (16/07/2026): era um 3o registrador duplicado do mesmo valor
      // ja presente em evolucao.totalOperacional[ultimo ponto] - agora calculado dinamicamente no hydrate().
    },
    suporteCoIrmaEventos: VARS.suporteCoIrmaEventos, // 13/07/2026, Eventos->Variavel, mesmo proposito (visita familia Vanessa) - nao e LREI
    // V135: recorrencias/assinaturas: 0 e placeholder - DERIVADOS em recalcularAgregadosDerivados() a partir de
    // visaDetalhe+mbDetalhe (eram numeros literais que so por coincidencia batiam com a soma das partes;
    // agora e formula, nunca mais pode dessincronizar).
    totalOpDetalhe: { boletos:VARS.totalOpBoletos, parcelas:VARS.livroLRP, consorcios:VARS.livroLRCON, recorrencias:VARS.mbLRRConfirmado, aportesPat:VARS.totalOpAportesPat, provMP:VARS.totalOpProvMP, assinaturas:VARS.mbLRSConfirmado },
    estimador: {
      liquidoProjetadoProximoCiclo: VARS.liquidoProjetadoProximoCiclo,  // Estimador de Salario - ciclo que comeca 25/07 (Ago/26)
      necessidadeLiquidaProximoCiclo: 0 // V138: DERIVADO em recalcularAgregadosDerivados() = evolucao.necessidadeLiquida[1] (2o ponto da serie, Ago/26). Era literal duplicado do mesmo numero ja presente no array.
    },
    deficitZero: {
      liquidoSemTrabalhar: VARS.liquidoSemTrabalhar, // REGRA_CENARIO_FICOU_EM_CASA
      // CORRIGIDO 04/08/2026 (parte 77, bug real apontado pelo usuario: "porque dezembro ficou maior
      // se a tendencia e das contas acabarem?"): Nov/26 e Dez/26 tinham valores MAIORES que Out/26, o
      // que e matematicamente impossivel dado que nada nesta formula reinicia antes de Jan/27 (parcelas
      // do LRP so terminam, Escola Julio 2027 so comeca em Jan/27 - ver alivioData acima, mesmo arquivo).
      // Reconstruido simulando PARCELAMENTOS_VISA avancando +1 parcela por ciclo (mesma regra ja usada
      // em outro lugar do proprio app.js) + os aportes de alivioData - validado contra o mes ATUAL
      // (bate exato com cartaoInfiniteTotal, R$1.017,89). Valores de Nov/Dez ESTIMADOS por essa
      // reconstrucao, nao auditados centavo a centavo contra boletos/assinaturas/recorrencias/consorcios
      // (assumidos constantes, mesma premissa ja documentada em legTotalOperacionalDefinicao) - avisar
      // o usuario que pode ter uma margem de erro de ~R$100-300, mesmo nivel de ruido ja visto entre
      // Ago/Set/Out antes desta correcao.
      // VALIDADO 04/08/2026 (parte 81): usuario confirmou que boletos/assinaturas/consorcios nao tem
      // data de termino conhecida entre agora e Dez/26 ("aviso caso cancele") - premissa de constancia
      // sustentada. Unico ajuste real encontrado: Vivo cai de R$523,00 pra R$435,00 a partir do proximo
      // ciclo (confirmado pelo usuario, print da fatura) - aplicado aqui como -R$88,00/mes em Nov/Dez
      // (nao retroagido pro Out, que ja estava calibrado antes dessa mudanca ser conhecida).
      // MIGRADO 04/08/2026 (parte 84, ERP->Supabase): VARS.DEFICIT_ZERO_PISO_OVERRIDE (chave de topo no
      // Supabase) sobrescreve os valores literais Ago/26..Dez/26 quando existir - mesmo motivo do
      // CARTAO_PLUGGY_MAPA acima. Indice 0 do override fica null de proposito (reservaPiso e sempre
      // dinamico/formula, nunca literal) - por isso o merge abaixo usa "??" pra so trocar os indices que
      // o Supabase de fato definiu, mantendo reservaPiso/pisoHeld como sempre foram.
      piso: (() => {
        const base = [VARS.reservaPiso,7821.63,7369.83,7373.69,6584.70,6394.71,...Array(6).fill(VARS.pisoHeld)];
        const overr = VARS.DEFICIT_ZERO_PISO_OVERRIDE;
        if(!Array.isArray(overr)) return base;
        return base.map((v,i) => (overr[i] !== undefined && overr[i] !== null) ? overr[i] : v);
      })()
    },
    superavitNormal: {
      // REGRA DEFINIDA PELO USUARIO 19/07/2026: liquidoMes(0) agora segue prioridade por DIA DO MES,
      // nao mais um valor fixo bundlado. A partir do dia 25 (quando o salario e pago), usa o valor REAL
      // recebido (liquidoReal, preenchido manualmente quando confirmado). Enquanto isso nao chega, do dia
      // 12 em diante (quando a folha de ponto gera o Estimador de Salario) usa o Liquido Projetado PURO
      // (REG.estimador.liquidoProjetadoProximoCiclo, R$16.048,51 - sem somar mais a sobra pessoal do
      // reembolso, que era um bundle errado apontado pelo usuario: mostrava R$18.545,51 em vez de
      // R$16.048,51). Antes do dia 12 (sem estimativa concreta ainda), cai na media ponderada de 12 meses
      // (REG.cenarioHistorico.mediaPonderada12M) - fallback conservador quando nao ha dado especifico do
      // ciclo. Resolvido em runtime por liquidoMes(i), definida antes do REG (topo do arquivo).
      liquidoReal: {0: 16819.56}, // ATUALIZADO 25/07/2026 (V150): salario real do ciclo atual ja recebido (24/07/2026, TX000136) - preenchido conforme a propria regra manda ("preencher quando um ciclo fechar e o valor real chegar"). Era {} (vazio).
      necessidade: [13146.21,12951.87,12620.07,12138.93,11871.07,11771.07,...Array(6).fill(VARS.necessidadeHeld)] // ATUALIZADO V150: indice 0 (ciclo atual) = NECESSIDADE_TOTAL corrigida (13146.21, ver V146/V147). Era 14317.00 (desatualizado, herdado de antes da correcao das parcelas).
    },
    // ===== QUALIDADE/REGRAS DE NEGOCIO (18/07/2026, V79) - "linter" enxuto: nao guarda transacao
    // por transacao (REG so tem agregados, por design - inflar isso pesaria o app.js), mas expoe os
    // poucos contadores/flags que JA sao mantidos no ERP a cada sessao. Atualizar manualmente sempre
    // que o numero mudar no ERP (mesmo padrao de todo o resto do REG).
    qualidade: {
      txSemData: 0,          // contador oficial do ERP (aba AUDITORIA_AUTOMATICA / historico SWP_INPUT). 0 = zerado em 17/07/2026 (V69).
      lreiAtivos: 2,          // CORRIGIDO 27/07/2026 (V189): LREI0002 (Saúde Família, R$164,94) + LREI0003 (Fatura Mercado Pago, R$266,23) ativas. Era 0 (desatualizado desde a quitação de LREI0001 em 21/07/2026) - o alerta "Nenhum empréstimo em aberto" estava mentindo pro usuário.
      tetoTemporarioAtivo: true // reflete caixaVariavel.tolerenciaTemp > 0
    },
    cenarioHistorico: {
      piorMes: VARS.salarioMin12M,
      mediana: VARS.salarioMediana12M,
      media: VARS.salarioMedia12M,
      mediaPonderada12M: VARS.salarioMediaPonderada12M,
      desvioPadrao: VARS.desvioPadraoSalario
    },
    evolucao: {
      // PADRAO 12 MESES ROLANTE (V50, item 4): series estendidas de 8 para 12 pontos, repetindo o
      // ultimo valor conhecido (mesma logica conservadora ja usada aqui - nao ha dado real para meses
      // tao distantes, nunca chutado um numero novo, so mantido o ultimo). Antes pulava Fev/27; agora
      // e sequencial, os rotulos vem de gerarMeses(12) - dinamico, sempre a partir do mes atual.
      totalOperacional:   [11658.24,9751.87,9420.07,8938.93,8671.07,8571.07,...Array(6).fill(VARS.totalOperacionalHeld)], // CORRIGIDO 19/07/2026: 1o ponto (ciclo atual) -R$1.808,91 (reversao Tokio Marine, ver REG.operacional.totalOperacional). Pontos futuros (Ago/26 em diante) NAO recalculados - baseline anterior, ja documentado como limitacao pendente desde V50/V51 (podem ainda incluir as parcelas 8-10 do Tokio removidas hoje - revisao futura).
      necessidadeLiquida: [12743.10,11996.97,11665.17,11184.03,10916.17,10816.17,...Array(6).fill(VARS.necessidadeLiquidaHeld)] // ATUALIZADO 25/07/2026 (V150): indice 0 (ciclo atual, 25/07-24/08) = R$12.743,10 (Necessidade Total corrigida R$13.146,21 - Cobertura Garantida R$403,11, ver V146/V147). Era R$13.903,34 (desatualizado, herdado de antes da correcao das parcelas).
    }
  };
}
