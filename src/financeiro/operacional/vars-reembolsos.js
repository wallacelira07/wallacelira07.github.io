// MODULO: criarVarsReembolsos() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsReembolsos(){
  return {
  // V184 (27/07/2026): LREI_ATIVAS criado - primeira vez que as dívidas internas da Caixa Lance
  // ganham registrador estruturado no app.js (antes só existiam como comentário solto no VARS.caixaLance).
  // Espelha 1:1 a aba LREI do ERP (LREI0002/LREI0003). Caixa Lance é credora nas duas.
  LREI_ATIVAS: [
    { id:'LREI0002', data:'27/07', credora:'Caixa Lance', devedora:'Caixa Saúde Família', valor:164.94, origem:'Reembolso do plano de saúde (conduta pediátrica de Júlio)', status:'QUITADO', quitadoEm:'07/08', quitadoPor:'Reembolso Bradesco (TX000212), R$164,94 de volta à Caixa Lance' },
    { id:'LREI0003', data:'24/07', credora:'Caixa Lance', devedora:'Fatura Cartão Mercado Pago', valor:266.23, origem:'Reembolso Wärtsilä (transporte corporativo, TXMP000009, vence 04/08)', status:'ATIVO' },
    { id:'LREI0004', data:'07/08', credora:'Caixa Lance', devedora:'Caixa Manutenção', valor:103.55, origem:'Complemento pagamento das cortinas (R$450,00 total; Manutenção cobriu o resto)', status:'ATIVO' },
    // NOVO 11/08/2026: adequação dos 2 consórcios Porto (Carro+Casa Nova) - deixaram de ser cobrados
    // no Mastercard Black e passaram a boleto/dinheiro pela Caixa Boletos (dia 15). O aporte mensal
    // desta caixa sobe de R$2.600 para R$4.550,77 a partir de agora, mas o aporte deste ciclo já saiu
    // no valor antigo - a Caixa Lance cobre a diferença só neste 1º mês (fonte real: emprestimos_internos
    // no Supabase, tabela V2-exclusiva - este literal é só o fallback síncrono do boot).
    { id:'LREI0005', data:'11/08', credora:'Caixa Lance', devedora:'Caixa Boletos', valor:1950.77, origem:'Cobertura do 1º mês da adequação dos 2 consórcios Porto (Carro R$501,32 + Casa Nova R$1.449,45) migrados do Mastercard Black para pagamento em dinheiro (vencimento dia 15)', status:'ATIVO' },
  ],
  // ===== V137 (23/07/2026, auditoria SSOT - pedido explicito do usuario: "nada com numero digitado,
  // tudo formula e referencia a lista de variaveis, so atualizar em 1 lugar") =====
  // Fatura Wartsila / Mercado Pago (corrige divergencia REAL encontrada: REG.mercadoPago mostrava
  // R$1.751,16 em 2 lugares da tela e REG.balanco.obrigacoes.mercadoPago mostrava R$1.791,93 em outro -
  // mesma fatura, 2 numeros diferentes na tela. Fonte correta: LIVRO_LRMP_TOTAL do ERP, R$1.791,93,
  // 17/07/2026, mais completo/recente que MERCADO_PAGO_FATURA de 16/07 R$1.749,35).
  faturaWartsila: 0, // PAGA 27/07/2026 (V187): R$656,67 via boleto Mercado Pago (Cartão Corporativo B, comprovante #170856844164, 27/07 22:43:39, vencimento 28/07/2026). Era R$656,67 (pendente).
  reembolsoPagaCartaoCorporativo: 483.83,  // extrato real cofrinho "Fatura Visa Infinit" (V128)
  reembolsoPagaMPCorporativo: 1277.88,     // PLACEHOLDER, sobrescrito por snap.cascata.mpCorporativo (variavel por ciclo) - usado na Cascata do Reembolso, sobrescrito por ciclo (zera no ciclo novo, ver CICLO_SNAPSHOTS)
  faturaMPCorporativoPendente: 1544.11, // NOTA 27/07/2026 (V187): a fatura MP em si JÁ FOI PAGA (boleto R$2.015,58, 27/07) - mas esses R$1.544,11 continuam pendentes de REEMBOLSO da Wärtsilä (Recife ida+volta R$1.277,88 + Aeroporto JP R$266,23), independente do pagamento da fatura. Zerar quando a Wärtsilä efetivamente reembolsar, não quando a fatura for paga.
  // V141 (23/07/2026, fechamento da varredura): ultimos primarios soltos encontrados
  reembolsoCicloTotal: 5254.98,       // Recebidos (ja inclui TED 21/07 + TX000220 de 07/08, R$340,00, transferido pelo usuario pra Caixa Wartsila) + A Receber (0) - regra V50. Confirmado pelo usuario: o R$340 foi transferido de verdade pra dentro da Caixa Wartsila (ver WARTSILA_CAIXA_TRANSACOES abaixo), NAO direto pra Caixa Lance - segue a cascata da politica (secao 5): Cartao Wartsila -> corporativo Mastercard -> corporativo Mercado Pago -> Pessoal Mercado Pago -> so a sobra vai pra Lance. reembolsoCicloTotal e a UNICA variavel indicadora a atualizar (SSOT, V137) - sobraPessoal e recalculado automaticamente pela cascata.
  // NOVO 12/08/2026 (pedido do usuario, achado real: a tela dizia "so a sobra total abate a
  // Necessidade Total" mas o codigo usava um campo manual desconectado, "Cobertura Garantida",
  // travado em R$0 desde 26/07 - texto e codigo dessincronizados). Necessidade Liquida passou a ser
  // automatica de novo (Necessidade Bruta - Sobra Total da cascata, ver recalcular-necessidade.js),
  // mas o usuario quis manter controle: "Manejo/Movimentacao" e quanto da Sobra Total ele ja usou ou
  // reservou pra outra coisa este ciclo (fora da cascata) - abate da sobra ANTES dela virar Cobertura
  // Garantida. Manual, zerado por padrao (nada foi movido ainda) - preencher so quando o usuario
  // confirmar que de fato tirou parte da sobra pra outro destino.
  reembolsoManejo: 0,
  // MIGRADO 27/07/2026 (V193): provisionadoWartsila migrada para saldo derivado. Historico do saldo
  // do ciclo antigo (R$683,04, confirmado pelo usuario) usado no pagamento de hoje - documentado em
  // V188 apos correcao do erro de V171 (zerada indevida).
  WARTSILA_CAIXA_SALDO_INICIAL: 683.04, // saldo do ciclo antigo, confirmado pelo usuario em 27/07 (V188) - a zerada de 26/07 (V171) tinha sido erro, revertida
  WARTSILA_CAIXA_TRANSACOES: [
    { tx:'BOLETO-MP-27-07', data:'27/07', nome:'Pagamento fatura Wärtsilä (boleto Mercado Pago, comprovante #170856844164)', tipo:'Saída', valor:656.67 },
    { tx:'JUROS-27-07-WARTSILA', data:'27/07', nome:'Juros acumulados repassados à Caixa Lance (CORRIGIDO 08/08/2026: estava lançado como Entrada aqui E o mesmo valor já entrava em CAIXA_LANCE_TRANSACOES/JUROS-27-07 - dobrava a contagem, inflava esta caixa em vez de esvaziar. É Saída: o juro sai daqui e vira a entrada em Lance)', tipo:'Saída', valor:27.37 },
    { tx:'TX000220', data:'07/08', nome:'Reembolso Wärtsilä recebido (transferência do usuário pra dentro da Caixa Wärtsilä)', tipo:'Entrada', valor:340.00 },
  ],
  provisionadoWartsila: 0,  // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar WARTSILA_CAIXA_TRANSACOES.
                                  // excedente = provisionadoWartsila - faturaWartsila
  };
}
