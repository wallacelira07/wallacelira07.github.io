// MODULO: criarVarsOperacional() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsOperacional(){
  return {
  // NOVO 05/08/2026 (parte 101, pedido do usuario: "34 anos, nasci em 13.05.1992, pode automatizar a
  // idade no sistema"). Data fixa, idade sempre calculada a partir de hoje (nunca hardcoded de novo).
  dataNascimentoWallace: '1992-05-13',
  // NOVO 31/07/2026 (V218, pedido explicito do usuario: "legendas devem estar em uma lista de
  // variaveis para nunca precisar subir o site so para mudar legendas"): objeto LEGENDAS centraliza
  // todo texto explicativo do site (28 legendas migradas). O HTML agora tem so o id de cada uma,
  // vazio ("—" placeholder) - o conteudo real vem daqui, aplicado no hydrate() via innerHTML.
  // Para editar uma legenda no futuro: mudar SO o texto aqui, nunca precisa tocar no HTML.
  LEGENDAS: {
    legEscolaJulioForaPatrimonio: `Escola de Júlio NÃO entra no Patrimônio Financeiro/Meta do Milhão — regra oficial (P5): só Reserva+BTG/Necton+Caixa Lance+Necton Conta Corrente contam como patrimônio. Escola de Júlio segue existindo como caixa/reserva própria, acompanhada separadamente.`,
    // CORRIGIDO 13/08/2026 (achado de auditoria: legenda dizia "Visa Infinite é só do Wallace", mas
    // o cabeçalho da seção 08 e o mapa real de cartões Pluggy (src/integrations/pluggy/pluggy-
    // reconciliacao.js, cartão 4845) marcam o Visa Infinite da Vanessa como ATIVO — reconciliado
    // contra a fonte viva (Pluggy), que reflete a integração financeira real, não texto escrito à mão.
    legVisaAposentado: `Wallace aposentou o cartão físico Visa Infinite (4844) — usa só o Mastercard Black agora. Assinaturas, recorrências, consórcios e o corporativo antigo já migraram 100% para o Mastercard Black — o que resta aqui é só as <strong>parcelas em andamento</strong>, que continuam no Visa até quitar (nunca migram, é regra fixa). Nenhuma compra variável nova acontece mais neste cartão do Wallace. A Vanessa segue com Visa Infinite ativo (cartão 4845) — ver mapa Pluggy.`,
    legVisaCorrecaoV207: `Cartão 6351 é o Mastercard Black da Vanessa, não o Visa Infinite — o Visa Infinite da Vanessa é o 4845 (ativo).`,
    legAguaGasMedintech: `Água e Gás são cobrados pela Medintech (medição individualizada) e variam todo mês — mantêm o valor do mês anterior até a leitura ser atualizada. Retiradas em dinheiro da Caixa Boletos usadas para pagar essas contas são reconciliadas contra o extrato bancário, não entram como lançamento duplicado. Rendimento do cofrinho (CDI) no período é incluído no total abaixo.`,
    legParcelamentosVisaAuto: `Tabela gerada automaticamente a partir de VARS.PARCELAMENTOS_VISA (aba PARCELAMENTOS_ATIVOS do ERP) — a cada virada de ciclo, cada parcela avança +1; ao ultrapassar o total, o item some da lista sozinho (status QUITADO). Nunca mais editar esta tabela na mão.`,
    // legAlivioAgosto REMOVIDA daqui em V219 - virou calculo dinamico real (ver aplicarAlivioAgosto()
    // logo apos o VARS fechar), nao mais texto fixo. Pedido do usuario: "implemente ja".
    legMigracaoAssinaturasMB: `Todas as assinaturas já estão no Mastercard Black (físico 2244 ou virtual 4628) — nenhuma resta no Visa Infinite.`,
    legLRCLimboCorporativo: `Mostrando só o corporativo do ciclo atual, ainda pendente de reembolso. O corporativo do ciclo fechado já está coberto dentro do valor separado para pagamento (ver seletor de ciclo no topo do painel). 100% reembolsável pela Wärtsilä (prioridade 2 na fila de reembolso).`,
    legParcelamentosMPAuto: `Parcelas geradas automaticamente a partir de VARS.PARCELAMENTOS_MP — avançam +1 a cada ciclo, somem sozinhas ao quitar. Itens "corp."/"único" filtrados automaticamente pela DATA real de cada um contra o período do ciclo selecionado (nunca mais editado à mão) — corp. = 100% reembolsável (prioridade 2 na fila de reembolso).`,
    legP2PCustoWallace: `Custo do Wallace (1/10 do capital P2P de R$110,00). Não gera receita, não entra no total de compras da Vanessa (LRV).`,
    // ATUALIZADO 09/08/2026: texto antigo descrevia matematica de um ciclo anterior (transacoes de
    // 17/07 e 20/07 que nem existem mais no array atual, removidas na reducao V177) - nao tinha mais
    // relacao com os dados reais. Migration da view vw_saldo_v2_por_caixa (Supabase) fechou a
    // dependencia do array V1: agora usa caixas.ciclo_inicio_em, sem tx_legado como criterio de
    // existencia. Fallback local - a versao ao vivo desta legenda vem da tabela `legendas` (Supabase).
    // CORRIGIDO 12/08/2026 (achado de auditoria: texto tinha R$306,73 fixo, congelado do dia em que
    // foi escrito — nunca mais acompanhava o saldo real da PGV depois disso). Esta chave PAROU de
    // ser usada como texto fixo — hydrateResumoExecutivo() agora calcula o conteúdo real de
    // #legPGVSaldoResidual a cada render, a partir de REG.caixasOperacionais.pixGeralVanessa.saldo
    // (mesma fonte do card cxPgvSaldo, ver hydrate-caixas.js) — excluída do loop genérico em
    // hydrate-roc.js de propósito (ver LEGENDAS_CALCULADAS). Literal abaixo mantido só como
    // histórico/fallback morto — nunca mais renderizado.
    legPGVSaldoResidual: `(obsoleta — ver hydrateResumoExecutivo(), calculada dinamicamente a partir de REG.caixasOperacionais.pixGeralVanessa.saldo)`,
    legOpcoesReconstruido: `3 posições confirmadas via extrato da corretora: PETRT379 R$154,84 · PETRS368W5 R$39,97 · ITUBT424 R$177,04. <strong>Total de prêmios: R$371,85</strong>, já garantido mesmo com posições ativas. Estratégia: deixar vencer.`,
    legLinha4vs5MP: `Linha 4 ≠ linha 5 — não confundir. Linha 4 = total da fatura Mercado Pago menos a parte corporativa (linha 2) = o que você mesmo deve pagar ali. Linha 5 = o que sobra do reembolso da Wärtsilä depois de cobrir tudo (linhas 1-3), vira crédito seu no Mercado Pago — dinheiro diferente, mesmo destino. Linha 6 (Manejo) é quanto dessa sobra você já confirmou ter usado/reservado pra outra coisa — o que resta (linha 7, Sobra Disponível) é o que de fato abate a Necessidade Total.`,
    legPGBLDefinicao: `6% do salário (Wallace) + 6% de contrapartida (Wärtsilä), gestão da empresa. Saque apenas em caso de demissão ou aposentadoria — <strong>não entra no Patrimônio Financeiro nem na Meta do Milhão</strong>, que consideram só patrimônio líquido/investível. Conta separada da BTG/Necton (LFTS11) acima.`,
    // CORRIGIDO 12/08/2026 (achado de auditoria: os 2 valores da composição — teto da Caixa Variável
    // e meta da PIX Vanessa — estavam escritos fixos na string, sem ler os números reais). Esta
    // chave PAROU de ser usada como texto fixo — hydrateResumoExecutivo() agora calcula o conteúdo
    // real de #legOrcamentoOperacionalComposicao a cada render, a partir de
    // REG.caixaVariavel.tetoOficial + REG.caixasOperacionais.pixVanessa.meta (mesma dupla que soma
    // VARS.orcamentoOperacional) — excluída do loop genérico em hydrate-roc.js de propósito (ver
    // LEGENDAS_CALCULADAS). Literal abaixo mantido só como histórico/fallback morto — nunca mais
    // renderizado.
    legOrcamentoOperacionalComposicao: `(obsoleta — ver hydrateResumoExecutivo(), calculada dinamicamente a partir de REG.caixaVariavel.tetoOficial + REG.caixasOperacionais.pixVanessa.meta)`,
    // CORRIGIDO 10/08/2026 (achado do usuário: texto estático com números de julho/2026, nunca
    // atualizado, e descrevendo uma regra de Cobertura Garantida já substituída em 26/07/2026 por
    // valor 100% manual): esta chave PAROU de ser usada como texto fixo — hydrate-resumo-executivo.js
    // agora calcula o conteúdo real de #legNecessidadeBrutaLiquida a cada render, a partir de
    // REG.operacional.coberturaGarantida (excluída do loop genérico em hydrate-roc.js de propósito).
    // Literal abaixo mantido só como histórico/fallback morto — nunca mais renderizado.
    legNecessidadeBrutaLiquida: `(obsoleta — ver hydrateResumoExecutivo(), calculada dinamicamente)`,
    legSimulacaoMesAMes: `Simulação mês a mês: cada parcelamento do Visa Infinite avança até encerrar (ex: 4/12 → mais 8 meses), e cada caixa patrimonial recebe Aporte=Meta−Saldo até bater a meta (Aniversário Júlio para em Set/26; Combustível e Churrasco reduzem entre Set-Dez/26). Assume cobertura garantida constante (R$954,90 — MP pessoal R$471,47 + Visa Infinite corporativo R$483,43) e boletos/assinaturas/recorrências/consórcios estáveis. Premissa marcada: o valor corporativo do Visa Infinite recorrente pressupõe viagens/despesas corporativas similares nos próximos meses — recalcular se o padrão mudar.`,
    legTotalOperacionalDefinicao: `O que é: TOTAL_OPERACIONAL (boletos + parcelamentos Visa Infinite + assinaturas + recorrências + consórcios + aportes das caixas patrimoniais) mês a mês. Reconstruído a partir dos dados literais de parcela do livro LRP. Aniversário Júlio zera após o ciclo Set/26 (prazo 14/09/2026). Premissa: boletos, assinaturas, recorrências e consórcios tratados como constantes. Combustível zera após Set/26 (atinge meta R$500) e Churrasco após Nov/26 (atinge meta R$500).`,
    // CORRIGIDO 13/08/2026 (achado de auditoria: legenda densa demais, frase única sem quebras) —
    // encurtada mantendo os mesmos fatos (Caixa Variável cobre 100% de LRW+LRV; este gráfico mostra
    // só o resíduo não coberto, e compara Comprometido x Disponível real).
    legMBVisaLiquidoCV: `Mastercard Black + Visa Infinite líquidos de Caixa Variável. A Caixa Variável já cobre 100% de LRW+LRV — aqui só entra o que ela NÃO cobre (parcelas, assinaturas, recorrências, consórcios, corporativo), comparado com o Disponível real em caixa.`,
    // CORRIGIDO 13/08/2026 (achado de auditoria: mesma legenda, frase única longa demais) —
    // quebrada em tópicos curtos, mesmos fatos e datas.
    legLegendaCaixasIncrementais: `Prazos das caixas incrementais: Aniversário Júlio (R$200/mês) para em Set/26. Escola Júlio ciclo atual (R$500/mês) para em Nov/26. Seguro/Emplacamento (R$425/mês) é contínuo, não gera alívio. Escola Júlio 2027 reinicia em Jan/27 (R$839,64/mês até Nov/27). Saúde Família (R$100/mês) projeta completar perto de Nov/27.`,
    // CORRIGIDO 14/08/2026 (achado do usuário: R$9.223,66 embutido no texto era o mesmo literal
    // congelado de VARS.reservaPiso, dessincronizado do valor real R$7.831,17 desde 11/08 — ver
    // recalcular-necessidade.js). Esta chave PAROU de ser usada como texto fixo — hydrateResumoExecutivo()
    // agora calcula o conteúdo real de #legMPCorporativoImpacto a cada render, a partir de
    // REG.reserva.piso (excluída do loop genérico em hydrate-roc.js de propósito, mesmo padrão de
    // legNecessidadeBrutaLiquida). Literal abaixo mantido só como histórico/fallback morto — nunca mais renderizado.
    legMPCorporativoImpacto: `(obsoleta — ver hydrateResumoExecutivo(), calculada dinamicamente a partir de REG.reserva.piso)`,
    legCoparticipacaoSaude: `⚠ Co-participação de saúde/odonto (uso real de plano) é imprevisível — variou de R$0 a R$231,63/mês nos últimos 12 meses. Usando média histórica de R$87,36/mês. Não é uma alíquota, é uso real do plano.`,
    legTaxasPorHoraAviso: `Taxas por hora (confiança média, ±15%) — ⚠️ valores fixos, não recalculam automaticamente com o salário. Não há fórmula CLT/convenção implementada como derivado — atualizar manualmente se o salário-base mudar.`,
    // MIGRADA 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #9, mesmo padrão de
    // legPGVSaldoResidual/legNecessidadeBrutaLiquida/legOrcamentoOperacionalComposicao/
    // legMPCorporativoImpacto acima) — hydrateResumoExecutivo() agora calcula o conteúdo real de
    // #legCenarioFicaEmCasa a cada render, a partir de REG.deficitZero.liquidoSemTrabalhar (excluída
    // do loop genérico em hydrate-roc.js). Literal abaixo mantido só como histórico/fallback morto.
    legCenarioFicaEmCasa: `(obsoleta — ver hydrateResumoExecutivo(), calculada dinamicamente a partir de REG.deficitZero.liquidoSemTrabalhar)`,
    // ATUALIZADO 11/08/2026 (pedido do usuário: gráfico 06 "Operação Déficit Zero" virou o gráfico
    // 04, atrelado à seção "O que NUNCA é cortado" — trocou o que compara: antes era líquido fixo
    // sem trabalhar × piso absoluto de gastos fixos, agora é o piso mínimo GARANTIDO por lei sempre
    // que há pelo menos 1 dia trabalhado no ciclo (salário base + Periculosidade 30% + Supervisão
    // 5% = base×1,35, nunca cai abaixo disso) × a Evolução real do Total Operacional (mesma série
    // viva do gráfico gêmeo da aba Gráficos, cai conforme parcelas terminam).
    // MIGRADA 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #9, mesmo padrão das outras
    // legendas calculadas): hydrateResumoExecutivo() calcula a partir de
    // REG.deficitZero.pisoGarantidoTrabalhando (VARS.taxasHoraFolhaPontoWartsila + Periculosidade).
    legDeficitSemEmbarque: `(obsoleta — ver hydrateResumoExecutivo(), calculada dinamicamente a partir de REG.deficitZero.pisoGarantidoTrabalhando)`,
    // NOVO 11/08/2026 (pedido do usuário, gráfico idêntico ao de cima com 2 eixos diferentes):
    // compara o mínimo garantido MESMO SEM TRABALHAR NENHUM DIA no ciclo (fórmula "Não trabalha" já
    // usada na seção 01, base+5%+creche, sem periculosidade) contra o piso absoluto de gastos que
    // nunca é cortado (seção 03, mesmo valor de pisoTotal). Os 2 valores são constantes mês a mês
    // (diferente do gráfico de cima, que usa a Evolução real do Total Operacional) — a diferença se
    // repete igual nos 12 meses, é o esperado, não é bug.
    // MIGRADA 16/08/2026 (Grupo A da auditoria de 9 agentes, achado #9, mesmo padrão das outras
    // legendas calculadas): hydrateResumoExecutivo() calcula a partir de
    // REG.deficitZero.liquidoSemTrabalhar.
    legPisoSemTrabalhar: `(obsoleta — ver hydrateResumoExecutivo(), calculada dinamicamente a partir de REG.deficitZero.liquidoSemTrabalhar)`,
    legPGBLFGTSForaBalanco: `PGBL e FGTS (<span id="balPgblFgtsSoma">—</span> juntos) não estão incluídos aqui — são não líquidos e não geridos ativamente, ficam só como cards informativos acima.`,
    legReservasPagamentoDefinicao: `"Reservas de Pagamento" = dinheiro já separado para cobrir compromissos (cartões, boletos) + o saldo de trabalho do ciclo atual. PIX Geral Vanessa é conta autônoma dela, listada aqui só por transparência — nunca soma no total.`,
    // CORRIGIDO 07/08/2026 (mudança de regra de negócio): a legenda antiga condicionava o
    // corporativo do ciclo ao pagamento da fatura anterior — o usuário pediu pra eliminar essa
    // mistura. Regra nova: conta por competência (data real da despesa dentro do ciclo 25→24),
    // independente do status de pagamento de qualquer fatura.
    legDestinoExcedente: `Destino do excedente: Caixa Lance (quando ≥R$500, avaliar ETF LFTS11) e BTG/Necton.`,
    // NOVA 05/08/2026 (parte 106, pedido do usuario: legenda da Inbox vazia estava desatualizada -
    // dizia "nenhuma automacao implementada" quando Pluggy e Mercado Pago ja capturam de verdade.
    // Migrada pro sistema VARS.LEGENDAS (antes vivia hardcoded dentro de renderInboxFinanceira(),
    // por isso nao dava pra editar sem deploy) - agora edita direto no Supabase, igual as outras 28.
    legInboxVazia: `Nenhum item pendente no momento — a Inbox já recebe automaticamente via Pluggy e Mercado Pago. Captura por Email/Telegram/OCR ainda não implementada.`,
    // NOVA 09/08/2026 (política nova, pedido do usuário): fallback local — a versão ao vivo desta
    // legenda vem da tabela `legendas` (Supabase), mesmo padrão da PGV corrigida hoje.
    // CORRIGIDO 12/08/2026: dizia "não recebe selo de status", mas o card de Qualidade da Geração
    // ganhou um selo próprio pra hoje (badge "Hoje: 🔴/🟡/🟢", estimativa por regra de 3 linear) —
    // texto ficava contradizendo o que a tela mostrava. Ver hydrate-onda5-qualidade-geracao.js.
    legQgHojeParcial: `"Hoje até agora" é parcial — o dado é atualizado automaticamente a cada 10 minutos (última captura: {hora}, horário de Brasília). O selo "Hoje" acima é uma ESTIMATIVA (regra de 3 sobre a janela 05:30-18:00, geração solar real não é linear) — o selo "Dia anterior" é o único baseado em dado 100% real, do último dia JÁ FECHADO. Produção por hora ainda não existe no sistema (o robô só registra o total acumulado do dia); um histórico intraday real começou a ser coletado agora, mas ainda não tem dias suficientes pra substituir a estimativa linear.`,
    legDeficitCaixasSemLrei: `Quando uma caixa operacional fica negativa (ex: comprou algo no cartão pra um bolsão temático sem saldo suficiente) e não existe um LREI (empréstimo interno) ATIVO cobrindo esse rombo, a diferença é somada na Necessidade Total Bruta — dinheiro que precisa entrar este ciclo, além dos 7 componentes de sempre (boletos+parcelas+consórcios+recorrências+aportes+MP corporativo+assinaturas). Conferir window.WALLACE_DEFICIT_CAIXAS_RELATORIO no console pra ver quais caixas estão gerando esse ajuste.`,
  },
  // Salario (cenarios de emergencia) - RECALCULADO 22/07/2026 (V132) com 12 contracheques reais,
  // media/mediana/min usam os 10 meses POS-PROMOCAO (ago/25-mai/26, usuario foi promovido de
  // Tecnico p/ Supervisor no meio do periodo - so os meses no cargo atual contam)
  salarioMedia12M: 20084.86,
  salarioMediana12M: 18283.64,
  salarioMin12M: 7649.62,
  salarioMediaPonderada12M: 17843.58,
  // NOVO 31/07/2026 (V219): Créditos e Cupons - valores confirmados pelo usuário há alguns dias,
  // implementado agora (pendência que tinha ficado parada). Benefícios/cupons, não dinheiro líquido -
  // card separado, não soma no patrimônio.
  creditoUberBalance: 68.69, // ATUALIZADO 31/07/2026: print do app Uber confirmou saldo de R$86,67 ("Personal - Uber Credits") antes desta corrida - diverge levemente do valor estimado anterior (R$84,87, V220), print sempre vence. Corrida de R$17,98 (11:15) paga com este credito (nao cartao, sem impacto em nenhuma caixa/fatura) - saldo apos uso: R$86,67 - R$17,98 = R$68,69.
  creditoShellBox: 200.00,
  creditoKmvIpiranga: 400, // CORRIGIDO 09/08/2026: usuario usou 1 dos 3 cupons de 200 (ja reportado antes, nunca tinha sido aplicado aqui nem no Supabase - achado ao investigar card mostrando 600 na tela). Era 600 (31/07/2026, V220: 3 cupons de 200 = 600, nao 503).
  // V140 (23/07/2026, continuacao da varredura): valores primarios operacionais que ainda viviam como
  // literal solto dentro do REG. Nenhum destes e derivavel de outro dado ja no sistema - sao fatos de
  // origem (extrato, contracheque, decisao do usuario) - mas moram aqui agora como UNICA copia editavel.
  salario: 16819.56,                       // ATUALIZADO 24/07/2026 (V139): salario Wartsila recebido hoje (TX000136). Era R$33.708,78 (excecao do ciclo anterior).
  orcamentoOperacional: 3200.00,
  // ===== FUNDO DE SUAVIZACAO SALARIAL - ATIVACAO FORMAL 29/07/2026 (V205) =====
  // Estrutura aprovada na V90 (3/3 decisoes), pre-configurada na V143, ATIVADA de fato agora com as
  // 3 definicoes que faltavam, confirmadas pelo usuario nesta sessao:
  //   (1) PRO-LABORE: R$11.000/mes (nao R$15.000 da decisao original V90) - razao dada pelo usuario:
  //       "as compras parceladas estao acabando e o valor necessario ira diminuir". Conservador: sobra
  //       mais excedente pra formar colchao nos meses gordos.
  //   (2) LOCAL: caixinha COMUM do Itau (CC-304). O usuario cogitou a caixa de Limite Garantido do Itau
  //       (que vira limite do cartao e rende), mas foi alertado do conflito: se o dinheiro estiver sendo
  //       usado como limite, fica travado ate a fatura ser paga - exatamente no mes magro em que o fundo
  //       precisaria ser sacado. Optou por caixa normal, mantendo o fundo sempre liquido.
  //   (3) MODO OPERACIONAL: passa a reagir ao pro-labore fixo, nao ao salario bruto (ja implementado
  //       na V143, ver REG.operacional.excedenteOuComplementoProLabore).
  // COMO FUNCIONA: mes com salario ACIMA de R$11.000 -> excedente entra aqui. Mes ABAIXO -> a conta
  // cobre a diferenca e o orcamento operacional nao muda. Objetivo: parar a oscilacao do Modo
  // Operacional causada pela variacao do salario (media R$20.084 / mediana R$18.283 / minimo R$7.649).
  proLaboreFixo: 11600.00, // ATUALIZADO 03/08/2026: era 11000.00
  coberturaGarantida: 0, // OBSOLETO (V175) - nunca mais usado diretamente, ver coberturaGarantidaConfirmada abaixo.
  // OBSOLETO 12/08/2026: Cobertura Garantida deixou de depender deste campo manual - voltou a ser
  // automatica (Sobra Total da cascata de reembolso - Manejo/Movimentacao, ver
  // REG.operacional.reembolsoSobraPessoal e VARS.reembolsoManejo em vars-reembolsos.js, formula em
  // recalcular-necessidade.js). Mantido aqui só pra não quebrar nenhuma leitura antiga esquecida -
  // nunca mais escrito nem lido pelo cálculo real.
  coberturaGarantidaConfirmada: 0,
  tetoOficial: 2000.00,                    // meta oficial (Aporte=Meta-Saldo), nao muda com tolerancia temporaria
  tolerenciaTemp: 1500.00,                 // tolerancia temporaria ate fim do ciclo (viagem familia Vanessa)
  caixaVariavelPendenteProximoCiclo: 0,     // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO, pedido do usuario): compras no Mastercard Black feitas DEPOIS do fechamento da fatura MB (dia 22) mas AINDA dentro do ciclo financeiro atual (ate dia 25) - a fatura so cobra no mes seguinte, entao nao contam no CAIXA_VARIAVEL_COMPROMETIDO deste ciclo (evita inflar indevidamente um ciclo que ja esta fechando). Ficam represadas aqui e sao pre-debitadas do orcamento da Caixa Variavel do PROXIMO ciclo na virada do dia 25 (ver recalcularAgregadosDerivados() e o card "Pendente para o próximo ciclo" no Simulador). Zerado ate agora - nenhuma compra nessa janela neste ciclo (23/07/2026).
  suporteCoIrmaEventos: 167.40,            // Eventos->Variavel, mesmo proposito (visita familia Vanessa), nao e LREI
  totalOpBoletos: 4550.77,        // APORTE_BOLETOS (nao o total bruto do livro LRB). AUMENTADO 11/08/2026 (era 2600): os 2 consorcios Porto (R$1.950,77) migraram do Mastercard Black para boleto/dinheiro nesta caixa (ver livroLRCON, zerado no mesmo commit, e LREI0005 cobrindo o 1o mes) - sem essa correcao o total operacional cairia R$1.950,77 por engano (dupla-remocao: some do cartao E nao aparece aqui).
  totalOpAportesPat: 1893.34,     // Aportes Patrimoniais do ciclo
  totalOpProvMP: 0,          // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.PARCELAMENTOS_MP (soma dos ATIVO). Nunca editar diretamente.
  // V140: demais primarios soltos no REG (cenarios/estimador)
  // CORRIGIDO 12/08/2026: valor de R$16.396,32 gravado mais cedo no mesmo dia estava ERRADO —
  // somava só salário bruto + parte dos adicionais brutos (Noturno/Interjornada/HE100/Banco de
  // Horas), sem Periculosidade Campo II (30% do salário, ~R$3.274/mês), sem Adicional de
  // Supervisão 5% (~R$546), sem Auxílio Creche (R$445, fixo) e SEM NENHUM desconto (INSS/IRRF/
  // assistência médica-odonto/PGBL) — resultado não era líquido de verdade, era quase bruto.
  // Corrigido usando o holerite REAL de julho/2026 (pago 24/07/2026, pós-reajuste pra
  // R$10.913,66) — o usuário confirmou que essas horas de julho alimentam o pagamento de
  // 25/08/2026 (ciclo Ago/26), então não é mais projeção, é dado real. Detalhamento completo
  // (proventos/descontos linha a linha) em `parametros_gerais`
  // (nome='liquidoProjetadoProximoCiclo_memoria_calculo'); metodologia recalibrada (taxas por
  // hora pós-reajuste + fórmulas de Periculosidade/Supervisão/PGBL/IRRF marginal) em
  // `parametros_gerais` (nome='taxasHoraFolhaPontoWartsila'). Este literal é só fallback — a V2
  // (mesma tabela) já sobrescreve no boot. Era R$16.048,51, depois R$16.396,32 (errado).
  liquidoProjetadoProximoCiclo: 16819.56,  // Estimador de Salario - ciclo Ago/26 (dado real, TX000136)
  // RECALCULADO 12/08/2026 (pedido do usuário: simular "salário seco sem hora extra" — Base +
  // Supervisão(5%) + Creche, sem Periculosidade, com todos os descontos por cima, mesma
  // metodologia usada em liquidoProjetadoProximoCiclo). Fórmula: 10913,66 (base) + 545,68
  // (Supervisão 5%) + 445,00 (Creche fixo) = R$11.904,34 proventos; descontos = INSS R$988,07
  // (teto de contribuição, constante) + IRRF R$1.738,56 (base R$2.639,04 sem adicionais — residual
  // de IRRF total R$5.055,57 menos a parcela marginal 27,5% dos adicionais de hora extra do
  // holerite real — MENOS 27,5% sobre a Periculosidade R$3.274,10 (=R$900,48) que não entra neste
  // cenário, já que ele já está no teto de faixa) + Saúde/Dental fixo R$413,15 + PGBL R$654,82 (6%
  // da base) = R$3.794,60. Líquido = R$11.904,34 − R$3.794,60 = R$8.109,74. Fonte dos valores-base:
  // `parametros_gerais` (nome='taxasHoraFolhaPontoWartsila' e
  // 'liquidoProjetadoProximoCiclo_memoria_calculo'). Era R$7.667,73 (formula antiga, pré-reajuste
  // de 12/08/2026, não recalibrada com os valores reais do holerite de julho).
  // CORRIGIDO 13/08/2026 (achado de auditoria: discrepancia de R$0,10 na conta do comentario acima
  // - 0,275 x 3274,10 = 900,4775 (nao 900,00), IRRF = 2639,04-900,4775 = 1738,5625≈1738,56 (nao
  // 1738,66); descontos totais = 3794,60 (nao 3794,70); liquido = 11904,34-3794,60 = 8109,74).
  // MIGRADO 16/08/2026 (achado #18 da auditoria de 9 agentes): reg-operacional.js agora calcula
  // REG.deficitZero.liquidoSemTrabalhar a partir de VARS.taxasHoraFolhaPontoWartsila (Supabase),
  // mesmo padrão das outras 7 constantes do Déficit Zero migradas em 14/08/2026. Este literal é
  // só fallback se o boot da V2 falhar — nunca mais fonte primária.
  liquidoSemTrabalhar: 8109.74,            // REGRA_CENARIO_FICOU_EM_CASA
  desvioPadraoSalario: 9273.21,
  seguroEmplacamentoAporte: 425,
  // NOVO 12/08/2026 (pedido do usuário: aba de emagrecimento, caneta Ozivy Semaglutida): aporte
  // mensal contínuo, mesmo padrão de seguroEmplacamentoAporte (sem data de término conhecida) —
  // financia a caixa "Emagrecimento". Valor inicial informado pelo usuário ("comece com
  // esse valor, depois nos adequamos à realidade") - ajustar aqui quando o preço real da farmácia
  // divergir (reajuste de fabricante, troca de dosagem, etc), mesma prática já usada pra outros
  // aportes fixos deste arquivo.
  saudeEmagrecimentoAporte: 278.89,
  // NOVO 13/08/2026 (pedido do usuário: meta de peso pra aba Emagrecimento, antes deliberadamente
  // sem meta - "só peso pra começar"). Usada em hydrate-emagrecimento.js pra calcular quanto falta.
  emagrecimentoMetaKg: 110,
  // NOVO 14/08/2026 (pedido do usuário: "coloque minha altura aqui"). Usada em
  // hydrate-emagrecimento.js pro 4º card da seção 01 (antes vazio, grid fixa de 4 colunas) e pro
  // cálculo de IMC (peso da última pesagem / altura²).
  alturaWallaceM: 1.87,
  escolaJulio2027Aporte: 839.64,
  fluxoSaidas: 14819.89,
  fluxoResultado: 21318.48,
  cenarioMesesBonsMedia: 29424.00,    // "Meses bons (media)" no grafico de cenarios de salario
  // Projecoes "held flat" (meses futuros alem do ultimo recalculado manualmente - repetem o ultimo
  // valor conhecido, mesma logica conservadora ja documentada). Antes: mesmo numero literal 6x em cada
  // array (piso/necessidade/totalOperacional/necessidadeLiquida). Agora: 1 valor, usado via Array.fill.
  pisoHeld: 6979.37,
  necessidadeHeld: 11581.08,
  totalOperacionalHeld: 8381.08,
  necessidadeLiquidaHeld: 0, // PLACEHOLDER - sobrescrito por VARS.necessidadeLiquidaHeld = totalOperacionalHeld + orcamentoOperacional - 0 (V225, ATUALIZADO 12/08/2026 - Cobertura Garantida projetada sempre 0, nunca mais coberturaGarantidaConfirmada). Nunca editar aqui direto. Era R$10.626,18 fixo (editado em sessao separada de totalOperacionalHeld, 25/07 vs 19/07 - embutia Cobertura Garantida futura de ~R$954,90 que nunca existiu de fato, ver achado do usuario 31/07/2026).
  // TX000164/165 (27/07/2026): Conduta pediátrica de Júlio. PIX de R$300,00 saiu direto do
  // Mercado Pago do Wallace para Vanessa (NÃO passou pela PIX Geral Vanessa/PGV - correção de erro
  // anterior, onde eu tinha inventado um passo intermediário de reforço de R$222 via Caixa Variável
  // que o usuário nunca confirmou). Coberto por: Saúde Família (saldo real R$135,06) + empréstimo
  // Caixa Lance (R$164,94, LREI0002 ativa). Reembolso do plano de saúde volta para Caixa Saúde Família.
  // RENOMEADO 29/07/2026 (V199): era LRC_CONDUTA_JULIO - nome errado, isso e historico da conduta de
  // Julio, nao o livro LRC (Corporativo) de verdade. LRC_TRANSACOES (abaixo) e o livro corporativo real.
  HISTORICO_CONDUTA_JULIO: [
    { tx:'TX000164', data:'27/07', nome:'PIX Conduta Júlio - pediatra (Mercado Pago Wallace → Vanessa)', tipo:'Saída', valor:300.00 },
    { tx:'TX000165', data:'27/07', nome:'Empréstimo Caixa Lance → Saúde Família (LREI0002 ativa)', tipo:'Empréstimo', valor:164.94 },
  ],
  // V400 (03/08/2026, Etapa 1 - Inbox Financeira): componente central do projeto de automacao de
  // captura. Continuo, nao filtrado por ciclo (mesma classe de LREI/boletos - ver Politicas secao 20) -
  // um item pendente nao "expira" na virada do dia 25. Este array literal e' o esqueleto V1 original,
  // ja SUBSTITUIDO na pratica: Pluggy e Mercado Pago sincronizam automaticamente pras tabelas V2
  // (mercadopago_eventos/pluggy_transacoes/pluggy_triagem, ver src/auditoria/inbox/inbox-financeira.js
  // e docs/decisions/INBOX_FINANCEIRA_REDESIGN_FILTROS.md, 14/08/2026) - a Inbox real ja roda
  // automatizada, com filtro de ciclo passado/duplicata proprio (arquivar_inbox_historico()). Fica
  // vazio aqui de proposito (nao e mais a fonte real). Status continua parado em PENDENTE ate decisao
  // humana (aprovar/rejeitar); aprovacao NAO lanca automaticamente no livro razao (isso seria "lançar
  // transação sem confirmação", proibicao explicita do brief) - so marca a intencao, o lancamento real
  // continua seguindo o fluxo manual ja existente (Claude classifica e lanca, referenciando o ID do
  // item da Inbox por rastreio).
  INBOX_FINANCEIRA: [
  ],
  // NOVO 04/08/2026 (parte 57, pedido explicito do usuario: "precisamos manter os livros dos ciclos
  // passados"): HISTORICO_ERP_TODOS_CICLOS - copia integral de SWP_INPUT_TX (ERP_WALLACE_LIRA_V11.xlsx),
  // TODOS os lancamentos com VALOR preenchido (222 linhas, qualquer livro/ciclo, TX000001 em diante,
  // 19/06/2026 a 03/08/2026 nesta extracao) - nao so os 7 livros AO VIVO do ciclo atual que
  // reconciliarTransacoesPluggy() ja usava. Motivo: transacao antiga da Pluggy "nao bater" com os
  // livros ao vivo NAO significa que nao tem registro - so significa que o registro dela mora num
  // ciclo fechado, que o site so mostra resumido (CICLO_SNAPSHOTS, decisao de V174: "o site so deveria
  // mostrar o que e do seu ciclo"). Este array e so para RECONCILIACAO (comparar valor), nao para
  // exibicao - resolve o falso-positivo "sem registro" sem precisar duplicar a exibicao completa de
  // cada ciclo fechado no site. Fonte: SWP_INPUT_TX, extraido em 04/08/2026 - snapshot pontual, nao se
  // atualiza sozinho quando a planilha muda (mesma natureza estatica de todo o resto do VARS).
  HISTORICO_ERP_TODOS_CICLOS: [
    {tx:'TX000001', data:'19/06/2026', livro:'LRW', nome:'MAGALU', valor:66.89},
    {tx:'TX000002', data:'20/06/2026', livro:'LRV', nome:'UBER', valor:21.98},
    {tx:'TX000003', data:'22/06/2026', livro:'LRV', nome:'UBER', valor:21.74},
    {tx:'TX000004', data:'25/06/2026', livro:'LRV', nome:'UBER', valor:24.78},
    {tx:'TX000005', data:'27/06/2026', livro:'LRW', nome:'TAPIOCA', valor:81.0},
    {tx:'TX000006', data:'27/06/2026', livro:'LRW', nome:'MERCADO_CLOVIS', valor:8.5},
    {tx:'TX000007', data:'27/06/2026', livro:'LRW', nome:'ABASTECE_AI', valor:103.0},
    {tx:'TX000008', data:'28/06/2026', livro:'LRW', nome:'KI_FRANGO', valor:64.0},
    {tx:'TX000009', data:'28/06/2026', livro:'LRW', nome:'ALEKS_BOLOS', valor:44.0},
    {tx:'TX000010', data:'28/06/2026', livro:'LRW', nome:'CLAUVENIENCIA', valor:45.0},
    {tx:'TX000011', data:'01/07/2026', livro:'LRV', nome:'UBER', valor:9.21},
    {tx:'TX000012', data:'04/07/2026', livro:'LRW', nome:'MENDONCA_PASTEIS', valor:75.97},
    {tx:'TX000013', data:'04/07/2026', livro:'LRW', nome:'H57_STORE', valor:9.19},
    {tx:'TX000014', data:'05/07/2026', livro:'LRW', nome:'ELIAS_ANDRADE', valor:120.0},
    {tx:'TX000015', data:'05/07/2026', livro:'LRW', nome:'TAMYLLA', valor:32.0},
    {tx:'TX000016', data:'05/07/2026', livro:'LRW', nome:'TAMYLLA', valor:36.0},
    {tx:'TX000017', data:'05/07/2026', livro:'LRW', nome:'PIZZA_NOSTRA', valor:241.0},
    {tx:'TX000018', data:'06/07/2026', livro:'LRW', nome:'BROTHERS_CLUB', valor:85.0},
    {tx:'TX000020', data:'07/07/2026', livro:'LRW', nome:'HORTIFRUTI', valor:10.0},
    {tx:'TX000021', data:'07/07/2026', livro:'LRW', nome:'H57_STORE', valor:9.99},
    {tx:'TX000026', data:'10/07/2026', livro:'LRW', nome:'PANIFICADORA', valor:23.8},
    {tx:'TX000027', data:'10/07/2026', livro:'LRW', nome:'AMAZON_PRIME_VIDEO', valor:9.99},
    {tx:'TX000029', data:'11/07/2026', livro:'LRW', nome:'MADOSKA_SORVETES', valor:127.43},
    {tx:'TX000030', data:'12/07/2026', livro:'LRW', nome:'PASTIANNE_RESTAURANTE', valor:126.28},
    {tx:'TX000086', data:'22/06/2026', livro:'LRV', nome:'PAGUE_MENOS', valor:75.87},
    {tx:'TX000031', data:'10/07/2026', livro:'LRW', nome:'H57STORE', valor:40.98},
    {tx:'TX000032', data:'11/07/2026', livro:'LRW', nome:'SONIA_MARMITARIA', valor:5.0},
    {tx:'TX000019', data:'06/07/2026', livro:'LRV', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:31.7},
    {tx:'TX000023', data:'09/07/2026', livro:'LRV', nome:'DORGIVAL', valor:21.3},
    {tx:'TX000024', data:'10/07/2026', livro:'LRV', nome:'H57STORE', valor:9.99},
    {tx:'TX000028', data:'10/07/2026', livro:'LRV', nome:'H57STORE', valor:9.88},
    {tx:'TXR000001', data:'22/06/2026', livro:'LRV', nome:'CAROLINA', valor:65.0},
    {tx:'TXR000002', data:'19/06/2026', livro:'LRV', nome:'PANIFICADORA', valor:22.0},
    {tx:'TXR000004', data:'28/06/2026', livro:'LRV', nome:'H57_STORE', valor:15.97},
    {tx:'TXR000005', data:'12/07/2026', livro:'LRV', nome:'DROGARIA_DROGAVISTA', valor:45.19},
    {tx:'TXR000006', data:'07/07/2026', livro:'LRV', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:34.0},
    {tx:'TXR000007', data:'10/07/2026', livro:'LRW', nome:'H57STORE', valor:9.99},
    {tx:'TX000087', data:'27/06/2026', livro:'LRW-I', nome:'A_SOUZA_FECHINE_CIA', valor:103.0},
    {tx:'TX22001', data:'29/06/2026', livro:'LRC', nome:'LMSERVICE', valor:102.96},
    {tx:'TX22002', data:'29/06/2026', livro:'LRC', nome:'PORTO_GALLO', valor:42.56},
    {tx:'TX22003', data:'01/07/2026', livro:'LRC', nome:'CAFE_DA_VILLA', valor:150.0},
    {tx:'TX22004', data:'02/07/2026', livro:'LRC', nome:'LA_URSA', valor:146.62},
    {tx:'TX22005', data:'02/07/2026', livro:'LRC', nome:'CACAU_SHOW_CAFE', valor:19.8},
    {tx:'TX22006', data:'02/07/2026', livro:'LRC', nome:'CACAU_SHOW_SORVETE', valor:21.49},
    {tx:'TX28001', data:'27/06/2026', livro:'LRCV', nome:'GERONCIO_BORGES_ANANIAS', valor:70.0},
    {tx:'TX28002', data:'12/07/2026', livro:'LRCV', nome:'GERONCIO_BORGES_ANANIAS', valor:60.0},
    {tx:'TX28003', data:'12/07/2026', livro:'LRCV', nome:'Reembolso', valor:64.0},
    {tx:'TXCON000001', data:'10/07/2026', livro:'LRCON', nome:'PORTO_CONSORCIO', valor:501.32},
    {tx:'TXCON000002', data:'10/07/2026', livro:'LRCON', nome:'PORTO_CONSORCIO', valor:1449.45},
    {tx:'TXS000001', data:'07/07/2026', livro:'LRS', nome:'IFOOD', valor:5.95},
    {tx:'TXS000002', data:'12/07/2026', livro:'LRS', nome:'CLAUDE_AI', valor:110.0},
    {tx:'TXS000003', data:'10/07/2026', livro:'LRS', nome:'GOOGLE_YOUTUBE', valor:7.99},
    {tx:'TXS000004', data:'11/07/2026', livro:'LRS', nome:'UBER_ONE_MEMBERSHIP', valor:21.9},
    {tx:'TXMP000001', data:'19/05/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:56.39},
    {tx:'TXMP000002', data:'20/02/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:106.04},
    {tx:'TXMP000003', data:'16/02/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:50.4},
    {tx:'TXMP000004', data:'15/02/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:68.36},
    {tx:'TXMP000005', data:'22/10/2025', livro:'LRMP', nome:'MERCADO_LIVRE', valor:166.62},
    {tx:'TXMP000006', data:'19/05/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:23.66},
    {tx:'TXMP000007', data:'02/07/2026', livro:'LRMP', nome:'MP_WALLACELIRA', valor:638.94},
    {tx:'TXMP000008', data:'29/06/2026', livro:'LRMP', nome:'MP_WALLACELIRA', valor:638.94},
    {tx:'TXB000001', data:'25/06/2026', livro:'LRB', nome:'PRESTACAO_CASA', valor:588.66},
    {tx:'TXB000002', data:'10/07/2026', livro:'LRB', nome:'CONDOMINIO_BELLAGIO', valor:210.0},
    {tx:'TXB000003', data:'10/07/2026', livro:'LRB', nome:'CURSO_INGLES', valor:695.0},
    {tx:'TXB000004', data:'10/07/2026', livro:'LRB', nome:'AGUA_MEDINTECH', valor:133.41},
    {tx:'TXB000005', data:'10/07/2026', livro:'LRB', nome:'GAS_MEDINTECH', valor:30.28},
    {tx:'TXB000006', data:'22/07/2026', livro:'LRB', nome:'ANDERSON_RAMOS', valor:210.0},
    {tx:'TXB000007', data:'10/07/2026', livro:'LRB', nome:'FIES_VANESSA', valor:245.0},
    {tx:'TXB000008', data:'30/06/2026', livro:'LRB', nome:'CONSELHO_REGIONAL', valor:163.24},
    {tx:'TXB000009', data:'26/06/2026', livro:'LRB', nome:'ENERGIA_MEDIA', valor:322.99},
    {tx:'TXP000001', data:'23/03/2026', livro:'LRP', nome:'TEACHER_MATIAS', valor:134.14},
    {tx:'TXP000002', data:'21/03/2026', livro:'LRP', nome:'DECKFRIEND', valor:13.03},
    {tx:'TXP000003', data:'05/12/2025', livro:'LRP', nome:'KORPOS_ESTETICA', valor:189.99},
    {tx:'TXP000004', data:'23/05/2026', livro:'LRP', nome:'RL_ARTESAO', valor:66.83},
    {tx:'TXP000005', data:'28/05/2026', livro:'LRP', nome:'MERCADO_LIVRE', valor:38.25},
    {tx:'TXP000006', data:'20/05/2026', livro:'LRP', nome:'MERCADO_LIVRE', valor:68.01},
    {tx:'TXP000007', data:'18/02/2026', livro:'LRP', nome:'MERCADO_LIVRE_MP', valor:48.33},
    {tx:'TXP000008', data:'03/07/2026', livro:'LRP', nome:'SEGURO_TOKIO_MARINE', valor:200.99},
    {tx:'TXP000009', data:'31/05/2026', livro:'LRP', nome:'ARAM_BEACH_HOTEL', valor:486.64},
    {tx:'TXP000010', data:'21/07/2026', livro:'LRP', nome:'PICPAY_WALLACE_PATRI', valor:183.47},
    {tx:'TXP000011', data:'20/05/2026', livro:'LRP', nome:'HUB_SMART_HOME', valor:72.96},
    {tx:'TXP000012', data:'19/05/2026', livro:'LRP', nome:'EDILSON_LOURENCO', valor:425.0},
    {tx:'TXP000013', data:'19/05/2026', livro:'LRP', nome:'SILMARA_MACEDO', valor:375.0},
    {tx:'TXP000014', data:'08/07/2026', livro:'LRP', nome:'HOTMART_FERNANDO', valor:42.0},
    {tx:'TXS000005', data:'28/06/2026', livro:'LRS', nome:'CHATGPT', valor:39.99},
    {tx:'TXS000006', data:'29/06/2026', livro:'LRS', nome:'NETFLIX', valor:72.8},
    {tx:'TXS000007', data:'30/06/2026', livro:'LRS', nome:'YOUTUBE_PREMIUM', valor:53.9},
    {tx:'TXS000008', data:'', livro:'LRS', nome:'FABIO_SABINO', valor:7.99},
    {tx:'TXS000009', data:'19/07/2026', livro:'LRS', nome:'AMAZON_PRIME', valor:19.9},
    {tx:'TXS000010', data:'22/07/2026', livro:'LRS', nome:'MEGA', valor:30.99},
    {tx:'TXS000011', data:'26/06/2026', livro:'LRS', nome:'INTELBRAS_CLOUD', valor:45.9},
    {tx:'TXS000012', data:'17/07/2026', livro:'LRS', nome:'SPOTIFY', valor:23.9},
    {tx:'TXRR000001', data:'25/07/2026', livro:'LRR', nome:'VIVO', valor:435.0},
    {tx:'TXRR000002', data:'17/07/2026', livro:'LRR', nome:'BRISANET', valor:113.13},
    {tx:'TXRR000003', data:'25/06/2026', livro:'LRR', nome:'DIGNA', valor:152.41},
    {tx:'TXRR000004', data:'28/06/2026', livro:'LRR', nome:'CAMPO_SANTO_DA_PAZ', valor:77.79},
    {tx:'TXRR000005', data:'13/07/2026', livro:'LRR', nome:'FACULDADE_ENGENHARIA', valor:441.33},
    {tx:'TXRR000006', data:'17/07/2026', livro:'LRR', nome:'NEW_CAR_RASTREADOR', valor:59.99},
    {tx:'TXR_FACULDADE_MB_JUL26', data:'17/07/2026', livro:'LRR', nome:'FACULDADE_ENGENHARIA', valor:441.33},
    {tx:'TX000033', data:'12/07/2026', livro:'LRV', nome:'SONIA_MARMITARIA', valor:5.0},
    {tx:'TX000034', data:'12/07/2026', livro:'LRW', nome:'H57STORE', valor:26.36},
    {tx:'TX000035', data:'12/07/2026', livro:'LRW', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000036', data:'12/07/2026', livro:'LRW', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TXP000015', data:'13/05/2026', livro:'LRP', nome:'KINESIOCENTEOS', valor:74.85},
    {tx:'TX000037', data:'13/07/2026', livro:'LRCV', nome:'VANESSA_MEDICA_JULIO', valor:50.0},
    {tx:'TX000038', data:'04/07/2026', livro:'LRCV', nome:'CLESTON_DA_SILVA', valor:33.0},
    {tx:'TX000039', data:'03/07/2026', livro:'LRCV', nome:'EDGLEY_DIAS_DE_ARAUJO', valor:150.0},
    {tx:'TX000040', data:'03/07/2026', livro:'LRCV', nome:'EDGLEY_DIAS_DE_ARAUJO', valor:150.0},
    {tx:'TX000041', data:'30/06/2026', livro:'LRCV', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:15489.0},
    {tx:'TX000042', data:'04/07/2026', livro:'LRPG', nome:'VANESSA_GOMES_GALDINO', valor:300.0},
    {tx:'TX000043', data:'05/07/2026', livro:'LRPG', nome:'VANESSA_GOMES_GALDINO', valor:30.0},
    {tx:'TX000044', data:'06/07/2026', livro:'LRCV', nome:'MAGALUPAY', valor:112.61},
    {tx:'TX000045', data:'10/07/2026', livro:'LRCV', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:1.0},
    {tx:'TXMP000009', data:'27/06/2026', livro:'LRMP', nome:'EDJAMILSON_MARQUES_BARBOSA', valor:266.23},
    {tx:'TXMP000010', data:'19/05/2026', livro:'LRMP', nome:'MERCADO_LIVRE', valor:42.58},
    {tx:'TX000046', data:'27/06/2026', livro:'LRPG', nome:'ROMARIO_NOGUEIRA', valor:62.0},
    {tx:'TX000047', data:'27/06/2026', livro:'LRPG', nome:'VITORIA_DRIELI_CAMELO_DA_SILVA', valor:111.0},
    {tx:'TX000048', data:'03/07/2026', livro:'LRPG', nome:'ROMARIO_NOGUEIRA', valor:44.0},
    {tx:'TX000049', data:'03/07/2026', livro:'LRPG', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:30.0},
    {tx:'TX000050', data:'04/07/2026', livro:'LRPG', nome:'VITORIA_DRIELI_CAMELO_DA_SILVA', valor:26.0},
    {tx:'TX000051', data:'04/07/2026', livro:'LRPG', nome:'REBECA_DE_SOUZA_OLIVEIRA', valor:31.5},
    {tx:'TX000052', data:'10/07/2026', livro:'LRPG', nome:'ROMARIO_NOGUEIRA', valor:68.0},
    {tx:'TX000053', data:'10/07/2026', livro:'LRPG', nome:'VANESSA_GOMES_GALDINO', valor:9.36},
    {tx:'TX000054', data:'12/07/2026', livro:'LRPG', nome:'H57_STORE', valor:14.99},
    {tx:'TX000055', data:'13/07/2026', livro:'LRPG', nome:'WALLACE_PATRICK_GALDINO_LIRA', valor:50.0},
    {tx:'TX000056', data:'13/07/2026', livro:'LRPG', nome:'MEDICA_DE_CRIANCA', valor:50.0},
    {tx:'TX000057', data:'27/06/2026', livro:'LRCV', nome:'CAIXA_PIX_VANESSA', valor:300.0},
    {tx:'TX000058', data:'10/07/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:245.0},
    {tx:'TX000059', data:'10/07/2026', livro:'LRCV', nome:'JR_PRESTACAO_DE_SERVICOS', valor:110.0},
    {tx:'TX000060', data:'06/07/2026', livro:'LRCV', nome:'RODRIGO_TORRES_DE_MORAIS', valor:120.0},
    {tx:'TX000061', data:'06/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:120.0},
    {tx:'TX000062', data:'06/07/2026', livro:'LRCV', nome:'CLOVIS_CABRAL_BARBOSA', valor:20.0},
    {tx:'TX000063', data:'05/07/2026', livro:'LRCV', nome:'UNIAO_CAMPINENSE', valor:10.0},
    {tx:'TX000088', data:'17/07/2026', livro:'LRCV', nome:'CLESTON_DA_SILVA', valor:22.0},
    {tx:'TX000109', data:'18/07/2026', livro:'LRCV', nome:'EDGLEY_DIAS_DE_ARAUJO', valor:60.0},
    {tx:'TX000110', data:'19/07/2026', livro:'LRW', nome:'PANIFICADORA', valor:13.8},
    {tx:'TX000111', data:'19/07/2026', livro:'LRW', nome:'H57STORE', valor:7.38},
    {tx:'TX000089', data:'16/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:281.34},
    {tx:'TX000090', data:'16/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:8.75},
    {tx:'TX000091', data:'01/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:1.85},
    {tx:'TX000092', data:'01/07/2026', livro:'LRW-I', nome:'BRADESCO', valor:42.93},
    {tx:'TX000093', data:'13/07/2026', livro:'LRW-I', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000094', data:'14/07/2026', livro:'LRW-I', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000064', data:'06/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:5.81},
    {tx:'TX000065', data:'03/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:264.97},
    {tx:'TX000066', data:'03/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:30.0},
    {tx:'TX000067', data:'03/07/2026', livro:'LRCV', nome:'CAIXA_LANCE', valor:462.29},
    {tx:'TX000068', data:'09/07/2026', livro:'LRCV', nome:'STONE_INSTITUICAO_PAGAMENTO', valor:20.0},
    {tx:'TX000069', data:'09/07/2026', livro:'LRB', nome:'BOLETOS_DIVERSOS', valor:1313.69},
    {tx:'TX000070', data:'07/07/2026', livro:'LRCV', nome:'FATURA_WARTSILA', valor:680.0},
    {tx:'TXP2P0001', data:'10/07/2026', livro:'?', nome:'JR_PRESTACAO_DE_SERVICOS', valor:66.0},
    {tx:'TXP2P0002', data:'23/07/2026', livro:'?', nome:'COMPRADOR_NAO_ESPECIFICADO', valor:20.0},
    {tx:'TXP2P0003', data:'23/07/2026', livro:'?', nome:'ELCIO_DA_SILVA_SANTOS', valor:40.0},
    {tx:'TXRP2P001', data:'13/07/2026', livro:'P2P', nome:'P2P_CREDITO_VANESSA', valor:11.0},
    {tx:'TX000071', data:'05/07/2026', livro:'LRPG', nome:'CONTA_CONJUNTA_BRADESCO', valor:30.0},
    {tx:'TX000072', data:'29/05/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:10.0},
    {tx:'TX000073', data:'29/05/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:1.0},
    {tx:'TX000074', data:'03/07/2026', livro:'LRCV', nome:'VANESSA_GOMES_GALDINO', valor:30.0},
    {tx:'TX000075', data:'02/06/2026', livro:'LRV_HISTORICO', nome:'JANAINA_JAPIASSU', valor:36.9},
    {tx:'TX000076', data:'13/07/2026', livro:'LRV', nome:'DL', valor:24.03},
    {tx:'TX000078', data:'13/07/2026', livro:'LRW', nome:'H57STORE', valor:25.93},
    {tx:'TX000079', data:'14/07/2026', livro:'LRW', nome:'ANTHROPIC_API', valor:20.0},
    {tx:'TX000080', data:'16/07/2026', livro:'LRPG', nome:'DUPOMAR_HORTIFRUTTI', valor:133.81},
    {tx:'TX000081', data:'16/07/2026', livro:'LRW', nome:'NOBRE_CARNES_LI', valor:206.4},
    {tx:'TX000096', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:3.19},
    {tx:'TX000098', data:'18/07/2026', livro:'LRW', nome:'H57STORE', valor:12.79},
    {tx:'TX000099', data:'18/07/2026', livro:'LRW', nome:'H57STORE', valor:3.19},
    {tx:'TX000100', data:'17/07/2026', livro:'LRW', nome:'DENIS_MASSAS', valor:32.0},
    {tx:'TX000101', data:'17/07/2026', livro:'LRW', nome:'VENDEDORA', valor:71.0},
    {tx:'TX000102', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:6.99},
    {tx:'TX000103', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:12.79},
    {tx:'TX000104', data:'18/07/2026', livro:'LRW', nome:'FILEZAO_SAO_CRISTOVAO', valor:38.26},
    {tx:'TX000105', data:'18/07/2026', livro:'LRW', nome:'MARIA_DO_SOCORRO', valor:40.0},
    {tx:'TX000106', data:'18/07/2026', livro:'LRW', nome:'MP_SOLANGEARTESA', valor:10.0},
    {tx:'TX000108', data:'18/07/2026', livro:'LRW', nome:'IFD_BROTHERS_BURGER', valor:230.67},
    {tx:'TX000107', data:'18/07/2026', livro:'LRCV', nome:'LUCIANO_SARTORI_PAQUI', valor:20.0},
    {tx:'TX000097', data:'17/07/2026', livro:'LRW', nome:'H57STORE', valor:4.37},
    {tx:'TX000082', data:'16/07/2026', livro:'LRW', nome:'SUP_IDEAL', valor:313.12},
    {tx:'TX000083', data:'16/07/2026', livro:'LRCV', nome:'PIX_VANESSA', valor:208.24},
    {tx:'TX000084', data:'17/07/2026', livro:'LRPG', nome:'PIX_VANESSA', valor:95.0},
    {tx:'TX000085', data:'17/07/2026', livro:'LRCV', nome:'PIX_VANESSA', valor:399.13},
    {tx:'TX000133', data:'23/07/2026', livro:'LRCV', nome:'ELCIO_DA_SILVA_SANTOS', valor:40.0},
    {tx:'TX000131', data:'23/07/2026', livro:'LRV-I', nome:'H57STORE', valor:17.98},
    {tx:'TX000132', data:'23/07/2026', livro:'LRW-MB', nome:'GOOGLE_SUNSURVEYORAPP', valor:56.99},
    {tx:'TX000134', data:'21/06/2026', livro:'LRS', nome:'AMAZON_PRIME_CANAIS', valor:19.99},
    {tx:'TX000135', data:'30/06/2026', livro:'LRW-I', nome:'AMAZON_PRIME_ALUGUEL', valor:9.99},
    {tx:'TX000165', data:'27/07/2026', livro:'LRCL', nome:'LREI0002', valor:164.94},
    {tx:'TX000166', data:'27/07/2026', livro:'LRSF', nome:'DRA_CINTIA', valor:135.06},
    {tx:'TX000167', data:'28/07/2026', livro:'LRV', nome:'DL', valor:12.42},
    {tx:'TX000168', data:'28/07/2026', livro:'LRV', nome:'DL', valor:11.12},
    {tx:'TX000169', data:'28/07/2026', livro:'LRV', nome:'H57STORE', valor:8.08},
    {tx:'TX000170', data:'28/07/2026', livro:'LRPV', nome:'DRA_CINTIA', valor:40.0},
    {tx:'TX000172', data:'29/07/2026', livro:'LRC', nome:'ANTONIO_DOMINGOS_ANGEL', valor:9.0},
    {tx:'TX000173', data:'29/07/2026', livro:'LRC', nome:'ANTONIO_DOMINGOS_ANGEL', valor:3.0},
    {tx:'TX000174', data:'29/07/2026', livro:'LRC', nome:'CONVENIENCIA_CAPUABA', valor:40.96},
    {tx:'TX000175', data:'29/07/2026', livro:'LRV', nome:'DL', valor:12.02},
    {tx:'TX000176', data:'29/07/2026', livro:'LRV', nome:'DROGASIL_2305', valor:132.26},
    {tx:'TX000177', data:'29/07/2026', livro:'LRV', nome:'DL', valor:19.65},
    {tx:'TX000178', data:'29/07/2026', livro:'LRPV', nome:'PGV', valor:300.0},
    {tx:'TX000179', data:'31/07/2026', livro:'LRV', nome:'DL', valor:5.06},
    {tx:'TX000180', data:'31/07/2026', livro:'LRV', nome:'DL', valor:6.43},
    {tx:'TX000181', data:'31/07/2026', livro:'LRPV', nome:'RAYSSA_DOS_SANTOS_PEREIRA', valor:70.0},
    {tx:'TX000182', data:'31/07/2026', livro:'LRPV', nome:'ROMARIO_NOGUEIRA_CUNHA', valor:65.0},
    {tx:'TX000183', data:'31/07/2026', livro:'LRW', nome:'TAPIOCARIA_IRMAO_FIRMI', valor:227.0},
    {tx:'TX000184', data:'31/07/2026', livro:'LRW', nome:'H57STORE', valor:18.36},
    {tx:'TX000185', data:'31/07/2026', livro:'LRW', nome:'H57STORE', valor:5.59},
    {tx:'TX000186', data:'31/07/2026', livro:'LRW', nome:'H57STORE', valor:2.19},
    {tx:'TX000187', data:'01/08/2026', livro:'LRPV', nome:'PGV', valor:300.0},
    {tx:'TX000188', data:'01/08/2026', livro:'LRW', nome:'AMAZON', valor:32.06},
    {tx:'TX000189', data:'01/08/2026', livro:'LRPV', nome:'MEU_PEQUENO', valor:276.0},
    {tx:'TX000190', data:'01/08/2026', livro:'LRCV', nome:'CLESTON_DA_SILVA', valor:22.0},
    {tx:'TX000191', data:'01/08/2026', livro:'LRV', nome:'TIORAFAKIDS', valor:50.0},
    {tx:'TX000192', data:'02/08/2026', livro:'LRW', nome:'DROGARIA_BENIF', valor:20.0},
    {tx:'TXPV000001', data:'02/08/2026', livro:'LRPV', nome:'SHPB_BRASIL_SANTANDER', valor:34.34},
    {tx:'TXPV000002', data:'02/08/2026', livro:'LRPV', nome:'KENNEDY_EVARISTO_DOS_SANTOS', valor:20.0},
    {tx:'TX000193', data:'03/08/2026', livro:'LRV', nome:'DL', valor:12.23},
    {tx:'TX000194', data:'03/08/2026', livro:'LRV', nome:'DL', valor:11.5},
    {tx:'TX000195', data:'03/08/2026', livro:'LRW', nome:'DL', valor:20.14},
    {tx:'TX000196', data:'03/08/2026', livro:'LRW', nome:'H57STORE', valor:42.28},
    {tx:'TX000197', data:'03/08/2026', livro:'LRW', nome:'ANTHROPIC', valor:51.69},
    {tx:'TX000198', data:'03/08/2026', livro:'LRW', nome:'ANTHROPIC', valor:51.69},
    {tx:'TX000199', data:'03/08/2026', livro:'LRW', nome:'ANTHROPIC', valor:20.68},
    // NOVOS 04/08/2026 (parte 75): confirmados via triagem Visa Infinite Prime (partes 72-73) - todos
    // do ciclo JA FECHADO (25/06-24/07). CORRIGIDO 04/08/2026 (parte 75, erro meu): tinham sido
    // lancados por engano no LRW_TRANSACOES/cartaoInfiniteTotal do CICLO ATUAL (Supabase) - inflava o
    // ciclo errado. Revertidos de la, adicionados aqui (historico cross-ciclo, so pra reconciliacao -
    // nao afeta nenhum agregado do ciclo atual). TX000207 (Mercado Livre R$48,45) NAO incluido - usuario
    // conferiu o app do Mercado Livre e nao achou pedido correspondente, revertido tambem (parte 74).
    {tx:'TX000203', data:'26/06/2026', livro:'LRW', nome:'BRISANET', valor:114.99},
    {tx:'TX000204', data:'30/06/2026', livro:'LRW', nome:'CONTA_VIVO', valor:469.00},
    {tx:'TX000205', data:'01/07/2026', livro:'LRW', nome:'CONTA_VIVO', valor:54.00},
    {tx:'TX000206', data:'15/07/2026', livro:'LRW', nome:'DRYCLEAN_USA', valor:132.00},
    {tx:'TX000208', data:'07/07/2026', livro:'LRW', nome:'RBM_RELOGIOS', valor:80.97},
    {tx:'TX000209', data:'15/07/2026', livro:'LRW', nome:'VENDEDORA', valor:22.30},
    // NOVO 04/08/2026 (parte 80): NAO sao compras - estornos confirmados via fatura real Bradesco
    // (Visa Infinite Prime, junho+julho/2026). MERCADOLIVRE*MERCADOLIVRE R$48,45 cobrado 29/06,
    // estornado 02/07 (junto com um R$132,03 sem cobranca correspondente visivel nas 2 faturas - pode
    // ser de um periodo anterior). Adicionados aqui SO pra reconciliacao parar de flagar como "sem
    // registro" - dinheiro ja voltou, nao e gasto pendente de lancar.
    {tx:'TX000210-ESTORNO', data:'02/07/2026', livro:'LRW', nome:'MERCADOLIVRE_ESTORNO', valor:48.45},
    {tx:'TX000211-ESTORNO', data:'02/07/2026', livro:'LRW', nome:'MERCADOLIVRE_ESTORNO', valor:132.03},
  ],

  };
}
