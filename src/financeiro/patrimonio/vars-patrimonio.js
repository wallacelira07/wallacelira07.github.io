// MIGRACAO 18/08/2026 (varredura anti-hardcode, pedido do usuario: "todo dado no site e obrigado a
// ler do Supabase, hardcode sao proibidos"): os literais abaixo SOBRESCRITOS por parametros_gerais
// no boot (mesmo mecanismo generico ja usado por taxasHoraFolhaPontoWartsila - bloco
// WALLACE_PARAMETROS_GERAIS_V2 em app.js, faz VARS[nome]=valor pra cada linha da tabela) - os
// literais aqui viram FALLBACK, so valem se a V2 falhar ao carregar: reservaPiso,
// consorcioCasaCartaCredito, consorcioCasaParcela, consorcioCasaPagoPct, consorcioCasaQuitacao,
// consorcioAutoPagoPct, consorcioAutoCartaCredito, consorcioCasaParcelasPagas, patCasa,
// patApartamento, patJazigo, patSolar, patCarro, passivoConsorcioAuto, metaEscolaJulio,
// prestacaoFinanciamentoCasa, metaLanceProjetoCasa. Editar valor novo sempre no Supabase
// (parametros_gerais), nunca aqui.
// MODULO: criarVarsPatrimonio() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsPatrimonio(){
  return {
  // Patrimonio financeiro (Meta do Milhao)
  // ATUALIZADO 27/07/2026 (V185, print Itaú 22:04): saldo real R$100.476,11 (aplicação de 03/07/2026,
  // rendimento bruto acumulado R$817,29, IOF R$202,99, IR R$138,19, líquido R$476,11). Rotina do usuário:
  // retirar o rendimento todo mês pra manter a Reserva travada em R$100.000,00.
  // RETIRADA PROGRAMADA (confirmada pelo usuário 27/07): projeção pra 03/08/2026, quando a aplicação
  // completa 30 dias corridos e o IOF zera. Rendimento bruto projetado (linear, R$34,05/dia x 30 dias)
  // = R$1.021,59; IR 22,5% (aplicação <180 dias) = R$229,86; líquido projetado = R$791,73. Retirar esse
  // valor em 03/08 devolve a Reserva para R$100.000,00 (mesma rotina mensal). Ajustar com o valor REAL
  // do app no dia, se divergir da projeção linear (CDI varia dia a dia, fins de semana não rendem).
  // ATUALIZADO 10/08/2026 (usuário confirmou: "eu retirei o juros lá da caixa dos 100k, então o
  // valor é 100k, esse é o plano, manter esse valor sempre lá") — rotina mensal de retirada de
  // rendimento executada, Reserva travada em R$100.000,00 (mesmo valor já atualizado na tabela V2
  // `patrimonio`, id d36ce6aa-6ce2-4212-bcdf-c858615aa1ef). Era R$100.644,15.
  // ESCLARECIDO 10/08/2026: comentários antigos deste campo alternavam entre "print Itaú" (27/07) e
  // "print BTG" (31/07) sem nunca dizer explicitamente qual banco é — usuário confirmou que a
  // Reserva de Emergência é conta ITAÚ (não BTG; BTG/Necton é o campo separado `btgNecton` abaixo,
  // LFTS11). Checado via Pluggy (10/08): a conta "itau" já está conectada (`pluggy_contas`, item
  // 7a747d7d-...), mas sincroniza como CHECKING_ACCOUNT com saldo R$0 (sync fresco, 10/08 22:52) —
  // os R$100k não aparecem porque devem estar num produto separado (poupança/CDB/fundo) não incluído
  // no escopo desta conexão Pluggy, não por sync desatualizado. Não dá pra automatizar via Pluggy sem
  // adicionar esse produto à conexão primeiro (fora do escopo desta sessão).
  reserva: 100000.00,
  reservaRetiradaProgramada: { data: '03/08/2026', valorProjetado: 791.73, motivo: 'Rendimento do mês (IOF zera aos 30 dias), retirar pra manter Reserva em R$100.000,00' },
  btgNecton: 14779.62, // ATUALIZADO 31/07/2026 (V210): print BTG, LFTS11, 94 cotas, +1,25% resultado com proventos. Era R$14.673,40.
  nectonContaCorrente: 429.75, // ATUALIZADO 31/07/2026 (V210): print BTG "Saldo conta investimento". Era R$429,70.
  // CORRIGIDO 31/07/2026 (V211): removido o campo "previdenciaWartsila" criado por engano ontem
  // (V210) - era o print da conta CORRENTE/salário da Wärtsilä (R$82.983,60), não a Previdência PGBL.
  // A Previdência PGBL de verdade já tinha campo próprio (patPgbl, abaixo) desde antes - confundi os
  // dois prints. Usuário esclareceu: são 3 contas distintas (PGBL, FGTS, conta corrente salário).

  // CORRIGIDO 29/07/2026 (V203, varredura de bugs): aporteBTGProgramado tinha 3 numeros FIXOS
  // (caixaLanceCompleta 3748.74 / rendimentoReserva 791.73 / total 4540.47) que nao acompanhavam a
  // Caixa Lance real - quando o PIX Livelo (R$8,58) entrou hoje, o aporte programado continuou
  // mostrando o valor de 27/07. Agora os 3 derivam: caixaLance atual + LREI ativos + rendimento da
  // Reserva. Recalculado logo apos o VARS fechar (ver bloco de derivados).
  aporteBTGProgramado: { data: '03/08/2026', caixaLanceCompleta: 0, rendimentoReserva: 0, total: 0, condicao: 'Depende dos 2 LREI ativos (Saúde Família + Fatura Mercado Pago) serem quitados antes do aporte' },
  // Patrimonio Fisico (Balanco) - eram 5 literais soltos dentro de REG.balanco.fisico
  patCasa: 110000.00,
  patApartamento: 155000.00,
  patJazigo: 11000.00,
  patSolar: 14800.00,
  patCarro: 140000.00,

  // Nao liquido (fora do total financeiro e da Meta do Milhao, so informativo)
  patPgbl: 133472.56, // ATUALIZADO 31/07/2026 (V211): print BTG "Investimentos > Previdência", 100% alocado em Previdência, +R$13.872,82 (12,48%) nos últimos 12 meses. Era R$132.214,74.
  patFgts: 82983.60, // ATUALIZADO 31/07/2026 (V211): print extrato WARTSILA BRASIL LTDA, saldo atualizado em 31/07/2026 (AC CRED DIST RESULTADO + DEPOSITO JUNHO + CREDITO DE JAM/juros). Era R$77.683,60.
  // CORRIGIDO 31/07/2026 (V212): o campo "patContaWartsila" criado ontem por engano era o MESMO FGTS
  // (R$82.983,60) - eu tinha classificado errado como "conta separada de PLR", quando na verdade é o
  // próprio FGTS, só com saldo atualizado. Usuário confirmou: "FGTS Wärtsilä esse é o valor atualizado
  // é só usar ele". Removido o campo duplicado.

  // Passivos (Balanco)
  // CORRIGIDO 14/08/2026 (auditoria de consistência entre valores duplicados): este literal nunca foi
  // atualizado desde a criação do arquivo (commit b83e165, "Conclusão da atualização V2") - ficou
  // parado em R$61.326,91 enquanto a tabela V2 `financiamentos`/`patrimonio` (subtipo
  // 'financiamento_casa') já registrava R$61.081,39 (data_snapshot 2026-08-05, amortização da
  // prestação). Confirmado via SQL real (select * from vw_patrimonio_v2 e da tabela financiamentos
  // direto): a Onda 4 (hydrate-onda4-patrimonio.js) já corrige a exibição da LINHA individual
  // (bpFinanciamentoCasa/ppFinanciamentoCasa) pro valor V2, mas os TOTAIS compostos (balPassivosTotal/
  // balPatrimonioLiquido/balPatrimonioTotalGeral/bal4qPatrimonio), calculados em
  // recalcularPatrimonio() a partir deste literal, continuavam usando o valor V1 desatualizado - uma
  // divergência real de R$245,52, maior que a tolerância de segurança (R$5) que trava a promoção
  // automática em app.js (promoverCampoV2SeConfiavel), então ela nunca era corrigida sozinha. Mesma
  // classe de bug do caso solar-compartilhado.html (fórmula duplicada em 2 lugares, uma delas
  // desatualizada). Sincronizado aqui com o valor V2 atual - próxima amortização real da prestação
  // precisa atualizar os dois lados de novo (VARS local E a tabela `patrimonio`/`financiamentos`).
  passivoFinanciamentoCasa: 61081.39,
  passivoConsorcioAuto: 18998.83,
  // Metas que apareciam duplicadas em mais de um lugar do REG
  metaEscolaJulio: 9236.00,   // era literal em REG.patrimonio.metaEscolaJulio E em caixasOperacionais.escolaJulio.meta (2 copias)
  reservaPiso: 9223.66,       // era literal em REG.reserva.piso E em deficitZero.piso[0] (2 copias)
  // Meta de investimento
  metaInvestimentoValor: 0, // CORRIGIDO 25/07/2026 (V151): SOBRESCRITO em recalcularAgregadosDerivados() = 20% do salario do ciclo atual. Era R$6.741,76 (numero fixo, nao batia com "20% do salario" que o proprio card promete no titulo - com o salario real de R$16.819,56, 20% e R$3.363,91, nao R$6.741,76).
  aporteBTGPactual: 0,       // ZERADO 25/07/2026 (V151): era R$11.700,51 de 25/06/2026 (ciclo FECHADO) - o card "Total investido no mês" e mensal, nao acumulado historico. Nenhum aporte BTG feito ainda neste ciclo (25/07-24/08).
  depositoAtivacaoNecton: 0,     // ZERADO 25/07/2026 (V151): era R$1,00 de 10/07/2026 (ciclo FECHADO, TX000045). Mesmo motivo - nenhum deposito Necton feito ainda neste ciclo.
                                     // era um literal composto (11701.51) sem os 2 fatos que o formam
  // V139 (23/07/2026): secoes 12 "Consorcio casa nova" e 13 "Projeto casa nova" eram 100% texto fixo no
  // HTML, sem NENHUM id, nunca tocadas por hydrate() - o pior caso de numero digitado que existia no site.
  // consorcioCasaPagoPct e consorcioCasaQuitacao sao VALORES DE ORIGEM EXTERNA (extrato real do app
  // PortoBank, ver ERP CONSORCIO_CASA_PAGO_PCT) - divergem um pouco do calculado internamente
  // (pago/total=0,524% vs 0,42% mostrado no extrato); por regra "extrato sempre vence" ficam como
  // input direto, nao forcados a bater com uma formula interna (documentado, nao escondido).
  consorcioCasaCartaCredito: 450000.00,
  consorcioCasaParcela: 1449.45,
  consorcioCasaPagoPct: 0.42,       // extrato real PortoBank 22/07/2026
  consorcioCasaQuitacao: 550601.43, // extrato real PortoBank 22/07/2026
  consorcioCasaProximaAssembleia: '21/08/2026', // CORRIGIDO 31/07/2026 (V215): confirmado pelo usuário via print do app - era 21/07/2026 (hardcoded no HTML, nunca atualizava, alertava "já passou" pra sempre). Agora dinâmico com alerta automático se a data passar de novo.
  metaLanceProjetoCasa: 180000.00,
  consorcioAutoPagoPct: 75.22,      // extrato real app BTG/PortoBank Auto (SALDO_QUITACAO_AUTO do ERP)
  consorcioAutoCartaCredito: 76670.02,
  // REMOVIDO 18/08/2026 (achado de auditoria noturna, autorizado pelo usuário: "código morto...pode
  // eliminar"): consorcioAutoQuitacaoValor (18998.83) nunca era lido — par assimétrico de
  // consorcioCasaQuitacao (Casa), que É usado em reg-patrimonio.js. Se precisar expor "valor de
  // quitação do consórcio Auto" no patrimônio no futuro, o número real (extrato BTG/PortoBank Auto,
  // 31/07/2026) é R$18.998,83.
  consorcioCasaParcelasPagas: 2,   // V140: 2 parcelas confirmadas (venc. 15/06 e 15/07/2026) - usado pra derivar o "valor pago" do consorcio
  // V142: faltavam estes 3 (a formula em REG.passivosPatrimoniais ja os referenciava, mas eles nunca
  // tinham sido de fato declarados aqui - erro descoberto pela propria execucao real/harness).
  prestacaoFinanciamentoCasa: 588.66,
  mesesRestantesFinanciamentoCasa: 147,
  parcelaConsorcioAuto: 501.15, // ATUALIZADO 31/07/2026 (V210): extrato BTG/PortoBank confirma R$501,15 (era R$501,50, diferença de arredondamento anterior - extrato sempre vence).
  };
}
