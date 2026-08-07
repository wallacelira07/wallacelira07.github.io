// MODULO: criarVarsCaixas() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsCaixas(){
  return {
  // Caixa Variavel (operacional, dia-a-dia)
  // MIGRADO 27/07/2026 (V193): caixaVariavelSaldoReal migrada para saldo derivado - ULTIMA caixa da
  // arquitetura "editavel/auditavel". Mais complexa que as demais por causa da logica de ciclos
  // (aplicarCicloAoVARS troca o valor conforme o ciclo selecionado) - o SALDO INICIAL aqui e o do
  // CICLO ATUAL (2026-07, aberto 25/07), NAO um valor fixo global. O ciclo fechado (2026-06) continua
  // intocado dentro de CICLO_SNAPSHOTS, com seu proprio valor congelado (nao migrado - e historico).
  // BUG ENCONTRADO NESTA MIGRACAO: este numero solto (linha abaixo) estava em R$1.678,00 (resquicio do
  // "reforco fantasma de R$222" que o usuario apontou e eu corrigi errado - so tinha revertido o valor
  // DENTRO do snapshot do ciclo, esquecido aqui no topo do VARS). NUNCA aparecia na tela de verdade
  // (aplicarCicloAoVARS sempre sobrescrevia com o valor certo do snapshot, R$1.900,00) mas era um
  // numero morto enganoso - eliminado agora que vira formula.
  CAIXA_VARIAVEL_SALDO_INICIAL_CICLO: 3933.37, // saldo real do ciclo ANTERIOR (Jun/26) na hora do fechamento - ponto de partida antes dos movimentos do ciclo atual
  CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL: [
    { tx:'TX000139', data:'25/07', nome:'Transferência única CV → Mastercard/Infinite (saldo antigo inteiro, virada de ciclo)', tipo:'Saída', valor:3933.37 },
    { tx:'TX000137', data:'25/07', nome:'Aporte mensal (salário Wärtsilä, novo ciclo)', tipo:'Entrada', valor:2000.00 },
    { tx:'TX000162', data:'26/07', nome:'PIX poda das bananeiras (Ednaldo Caetano da Silva)', tipo:'Saída', valor:100.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:4.80 },
    { tx:'TX000217', data:'06/08', nome:'PIX Vanessa Gomes Galdino (adiantamento do bolo de Júlio, repassado por ela à Maria Karoline de Lima Frazao)', tipo:'Saída', valor:107.50 },
    { tx:'TX000218', data:'06/08', nome:'Reembolso da Caixa Aniversário Júlio (referente ao adiantamento TX000217)', tipo:'Entrada', valor:107.50 },
  ],
  // NOTA (mesma migração, V193): o comentário histórico (V144/V145) mencionava TX000139 = R$4.002,61 e uma
  // "folga de R$69,24" - reconferindo a aritmética, a transferência que saiu de fato da Caixa Variável foi
  // o saldo antigo inteiro (R$3.933,37, sem excedente); os R$4.002,61 mencionados antes provavelmente somavam
  // outra origem que também chegou na caixa Mastercard/Infinite. Valor usado aqui é o que fecha exato com o
  // saldo real confirmado (R$1.900,00) - se o usuário tiver o extrato exato da TX000139, vale reconferir.
  caixaVariavelSaldoReal: 1900.00, // PLACEHOLDER - sobrescrito por calcularSaldoCaixa() OU pelo snapshot do ciclo selecionado (aplicarCicloAoVARS). Nunca editar direto - editar CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL.
  caixaVariavelComprometido: 0,          // VIRADA DE CICLO 25/07/2026 (V143): novo ciclo (25/07-24/08) comeca com comprometido zerado. Ciclo anterior fechou em R$3.998,50 (ver ERP SNAPSHOT_CICLOS_FECHADOS - nada foi apagado, so este contador de ciclo resetou). Era R$3.998,50.
  // Cofrinhos/caixas patrimoniais e operacionais (Mercado Pago)
  // MIGRADO 27/07/2026 (V192): caixaLance deixou de ser numero fixo editado a mao - agora e SEMPRE
  // calcularSaldoCaixa(CAIXA_LANCE_SALDO_INICIAL_CICLO, VARS.CAIXA_LANCE_TRANSACOES). Historico
  // reconstruido a partir dos comentarios ja documentados nas versoes anteriores (V141/V183/V187) -
  // nenhum valor novo inventado, so formalizado em array conferivel.
  CAIXA_LANCE_SALDO_INICIAL_CICLO: 3748.74, // saldo de abertura do ciclo 2026-07 (25/07/2026)
  CAIXA_LANCE_TRANSACOES: [
    { tx:'TXMP000009', data:'24/07', nome:'Empréstimo p/ Fatura Cartão Mercado Pago (LREI0003, transporte corporativo, reembolsável Wärtsilä)', tipo:'Saída', valor:266.23 },
    { tx:'TX000165', data:'27/07', nome:'Empréstimo p/ Caixa Saúde Família (LREI0002, conduta pediátrica de Júlio)', tipo:'Saída', valor:164.94 },
    { tx:'JUROS-27-07', data:'27/07', nome:'Juros repassados das caixinhas de fatura (Mastercard/Infinite R$161,12 + Fatura Mercado Pago R$8,27 + Fatura Wärtsilä R$27,37)', tipo:'Entrada', valor:196.76 },
    { tx:'PIX-LIVELO-29-07', data:'29/07', nome:'PIX recebido Livelo S.a. (cashback/pontos)', tipo:'Entrada', valor:8.58 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:9.42 },
    { tx:'TX000210', data:'05/08', nome:'PIX Itaú → Mercado Pago (aporte Caixa Lance, rendimento Reserva de Emergência)', tipo:'Entrada', valor:921.17 },
    { tx:'TX000212', data:'07/08', nome:'Reembolso Bradesco Saúde - quitação LREI0002 (Caixa Saúde Família)', tipo:'Entrada', valor:164.94 },
    { tx:'TX000216', data:'07/08', nome:'Empréstimo p/ Caixa Manutenção (LREI0004, complemento pagamento das cortinas)', tipo:'Saída', valor:103.55 },
  ],
  caixaLance: 4453.50,                  // PLACEHOLDER - sobrescrito logo apos o VARS fechar por calcularSaldoCaixa(). Nunca editar este numero diretamente - editar CAIXA_LANCE_TRANSACOES.
  MANUTENCAO_SALDO_INICIAL: 178.72,
  MANUTENCAO_TRANSACOES: [
    { tx:'TX000143', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:166.67 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:1.06 },
    { tx:'TX000214', data:'07/08', nome:'Cortinas', tipo:'Saída', valor:450.00 },
    { tx:'TX000215', data:'07/08', nome:'Empréstimo recebido da Caixa Lance (LREI0004, complemento pagamento das cortinas)', tipo:'Entrada', valor:103.55 },
  ],
  caixaManutencao: 345.39,              // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar MANUTENCAO_TRANSACOES.
  // NOVO 05/08/2026 (pedido do usuario, "quero criar uma caixa de verdade pra bens duraveis, sem
  // saldo previo - vai ficar negativa"): mesmo padrao das outras 12 caixas (saldo derivado via
  // calcularSaldoCaixa). Comeca SEM saldo inicial (0) - as 2 primeiras saidas ja fazem ela nascer
  // negativa em R$355,00 (fone+cortador, ja gastos antes desta caixa existir). Aporte mensal alvo:
  // R$250,00 (R$1.000/ano cada - Wallace, Vanessa, Julio - dividido por 12, confirmado pelo usuario).
  // Meta de reserva: R$3.000 (1 ano de aporte acumulado).
  BENS_DURAVEIS_SALDO_INICIAL: 0,
  BENS_DURAVEIS_APORTE_MENSAL_ALVO: 250.00,
  BENS_DURAVEIS_TRANSACOES: [
    {tx:'TX000159-A', data:'25/07', nome:'Fone de Ouvido QCY HT08', tipo:'Saída', valor:319.90, obs:'Bem durável (eletrônico) - separado de TX000159 (compra conjunta no Mercado Livre).'},
    {tx:'TX000159-B', data:'25/07', nome:'Cortador de Pelo Nasal Wahl', tipo:'Saída', valor:35.10, obs:'Bem durável (eletrônico) - separado de TX000159 (compra conjunta no Mercado Livre).'}
  ],
  caixaBensDuraveis: -355.00,           // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar BENS_DURAVEIS_TRANSACOES.

  ANIVERSARIO_JULIO_SALDO_INICIAL: 200.10,
  // SINCRONIZADO 07/08/2026 (fonte: Supabase) - faltava AJUSTE-06-08 e a nova saída TX000208.
  ANIVERSARIO_JULIO_TRANSACOES: [
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.70 },
    { tx:'AJUSTE-06-08', data:'06/08', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.40 },
    { tx:'TX000208', data:'06/08', nome:'Reembolso à Caixa Variável (adiantamento do bolo de Júlio, repassado por ela via TX000217/TX000218; comprovante MP 172377811244 / Pix E10573521202608061644RhYaOmLbuda)', tipo:'Saída', valor:107.50 },
  ],
  caixaAniversarioJulio: 93.30,        // SINCRONIZADO 07/08/2026 (fonte: Supabase): -R$107,50 (TX000208, adiantamento bolo de Júlio). Era R$200,80. PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar ANIVERSARIO_JULIO_TRANSACOES.
  // NOVO 31/07/2026 (V214): CRONOGRAMA_BOLETOS_FIXOS - lista completa dos 9 boletos recorrentes com
  // dia de vencimento, confirmada pelo usuario. Base para o auto-credito por data (ver funcao
  // aplicarBoletosVencidosAutomaticamente() logo apos o VARS fechar) - elimina a necessidade de
  // perguntar manualmente "isso ja foi pago?" toda sessao. O TX de cada um casa com o TXB do livro LRB.
  CRONOGRAMA_BOLETOS_FIXOS: [
    { tx:'TXB000001', nome:'Prestação da casa (Caixa Econômica)', diaVencimento:27, valor:588.66 },
    { tx:'TXB000002', nome:'Condomínio Bellagio', diaVencimento:10, valor:210.00 },
    { tx:'TXB000003', nome:'Curso de inglês (Guimarães Faria)', diaVencimento:10, valor:695.00 },
    { tx:'TXB000004', nome:'Água (Medintech)', diaVencimento:10, valor:133.41 },
    { tx:'TXB000005', nome:'Gás (Medintech)', diaVencimento:10, valor:30.28 },
    { tx:'TXB000006', nome:'PIX Anderson da Costa Ramos', diaVencimento:22, valor:210.00 },
    { tx:'TXB000007', nome:'FIES Vanessa (PIX Vanessa Gomes Galdino)', diaVencimento:10, valor:245.00 },
    { tx:'TXB000008', nome:'Conselho Regional', diaVencimento:31, valor:163.24 },
    { tx:'TXB000009', nome:'Energia (Energisa Paraíba)', diaVencimento:26, valor:367.36 },
    // REVERTIDO 04/08/2026 (parte 63): a parte 62 tinha adicionado TXB000010/011/012 (Vivo+Brisanet)
    // aqui, achando que nao tinham registro nenhum - erro meu, so tinha procurado em
    // CRONOGRAMA_BOLETOS_FIXOS, nao no resto do app.js. Usuario mostrou print confirmando que Vivo
    // (R$435,00, TXRR000001) e Brisanet (R$113,13, TXRR000002) JA estavam rastreadas no livro LRR
    // (linha 1429-1430 do HISTORICO_ERP_TODOS_CICLOS, parte 57) - cadastrar de novo aqui, com valor
    // estimado E diferente (484+55,08 vs o real 435,00), teria criado um debito duplicado e errado na
    // Caixa de Boletos (esse cronograma debita de verdade - nao e so referencia). Removido.
  ],
  BOLETOS_SALDO_INICIAL: 613.17,
  BOLETOS_TRANSACOES: [
    { tx:'TX000140/TXB000010', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:1986.21 },
    { tx:'TXB000009', data:'26/07', nome:'Energia (Energisa) - última conta sem efeito do solar', tipo:'Saída', valor:367.36 },
    { tx:'TXB000001', data:'27/07', nome:'Prestação da casa (Caixa Econômica)', tipo:'Saída', valor:588.66 },
    { tx:'TXB000008', data:'31/07', nome:'Conselho Regional', tipo:'Saída', valor:163.24 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app, R$168,43 - documentado, não ajustado silenciosamente conforme P1)', tipo:'Entrada', valor:168.43 },
  ],
  // RESOLVIDO 31/07/2026 (V213): usuario confirmou os 3 boletos pagos no ciclo (25/07-31/07) por
  // vencimento: Energisa (26/07, R$367,36) + Prestação da casa (27/07, R$588,66) + Conselho Regional
  // (31/07, R$163,24) = R$1.119,26. Ainda restava diferenca de R$168,43 em relacao ao saldo real
  // informado (R$1.648,55) - registrada como residuo explicito (P1: nunca ajustar silenciosamente),
  // nao forcado a bater. Os outros 6 boletos (dia 10 e 22) vencem DEPOIS deste ciclo fechar (24/08),
  // entram no proximo aporte. Guimarães Faria=Curso de ingles, PIX Vanessa=FIES Vanessa (confirmado
  // pelo usuario), Bellagio=Condominio, Medintech=Agua+Gas, Anderson Ramos=TXB000006.
  caixaBoletos: 1648.55,                // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar BOLETOS_TRANSACOES.
  PV_SALDO_INICIAL: 0,
  // PV_TRANSACOES ja existe mais abaixo (array proprio criado em V176) - reutilizado aqui, nao duplicado.
  caixaPixVanessa: 900.00,              // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(PV_SALDO_INICIAL, VARS.PV_TRANSACOES). Nunca editar direto.
  // MIGRADO 27/07/2026 (V192): pixGeralVanessaSaldo deixou de ser numero fixo editado a mao - agora e
  // SEMPRE calcularSaldoCaixa(PGV_SALDO_INICIAL_CICLO, VARS.LRPV_TRANSACOES). Conferido por execucao real:
  // 0 - R$182,96 - R$39,00 + R$300,00 = R$78,04, vs R$78,00 confirmado pelo usuario em 26/07 - diferenca
  // de R$0,04 e residuo de rendimento CDI ja documentado (Politica secao 6), nao ajustado silenciosamente.
  PGV_SALDO_INICIAL_CICLO: 0, // ancora do ciclo 2026-07 (25/07-24/08) - PGV comecou zerada (reduzida ao ciclo atual em V177)
  pixGeralVanessaSaldo: 78.00, // PLACEHOLDER - sobrescrito logo apos o VARS fechar por calcularSaldoCaixa(). Nunca editar este numero diretamente - editar LRPV_TRANSACOES. Mantido 78.00 aqui so como fallback caso o array mude antes do recalculo rodar.
  EVENTOS_SALDO_INICIAL: 0,
  EVENTOS_TRANSACOES: [
    { tx:'TX000144', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:166.67 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.42 },
  ],
  caixaEventos: 166.67,                 // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar EVENTOS_TRANSACOES.
  // MIGRADO 27/07/2026 (V192): caixaSaudeFamilia deixou de ser numero fixo - agora e SEMPRE
  // calcularSaldoCaixa(SAUDE_FAMILIA_SALDO_INICIAL_CICLO, VARS.SAUDE_FAMILIA_TRANSACOES), resolvido
  // logo apos o VARS fechar (ver bloco de saldos derivados abaixo). Nunca mais editar um numero aqui -
  // editar o array SAUDE_FAMILIA_TRANSACOES.
  SAUDE_FAMILIA_SALDO_INICIAL_CICLO: 0, // ancora do ciclo 2026-07 (25/07-24/08) - caixa comecou zerada, 1o aporte e a 1a transacao do array
  caixaSaudeFamilia: 0, // PLACEHOLDER - sobrescrito logo apos o VARS fechar por calcularSaldoCaixa(). Nunca editar este numero diretamente. CONFIRMADO 31/07/2026: usuario reportou saldo real R$0,00 - bate com o calculado (R$-0,06, arredonda pra R$0,00), sem ajuste necessario.
  SEGURO_EMPLACAMENTO_SALDO_INICIAL: 0,
  SEGURO_EMPLACAMENTO_TRANSACOES: [
    { tx:'TX000148', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:425.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:1.08 },
  ],
  caixaSeguroEmplacamento: 425.00,      // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar SEGURO_EMPLACAMENTO_TRANSACOES.
  COMBUSTIVEL_SALDO_INICIAL: 0,
  COMBUSTIVEL_TRANSACOES: [
    { tx:'TX000145', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:200.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.50 },
  ],
  caixaCombustivel: 200.00,             // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar COMBUSTIVEL_TRANSACOES.
  CHURRASCO_SALDO_INICIAL: 0,
  CHURRASCO_TRANSACOES: [
    { tx:'TX000146', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:100.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:0.24 },
  ],
  caixaChurrasco: 100.00,               // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar CHURRASCO_TRANSACOES.
  ESCOLA_JULIO_SALDO_INICIAL: 506.74,
  ESCOLA_JULIO_TRANSACOES: [
    { tx:'TX000142', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:500.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:3.06 },
  ],
  escolaJulioSaldo: 1006.74,            // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar ESCOLA_JULIO_TRANSACOES. Fora da Meta do Milhao (regra P5/V47).
  // NOVA CAIXA 24/07/2026 (V139): renomeacao de CAIXA_FATURA_VISA_INFINITE (nao caixa nova) -
  // passa a guardar o valor combinado dos 2 cartoes (Mastercard Black + Visa Infinite) ate o
  // vencimento 28/07/2026. R$484,08 (saldo antigo, corporativo ja garantido) + R$4.002,61
  // (transferencia unica da CV, TX000139) + R$6.745,18 (aporte direto do salario, TX000151) = R$11.231,87.
  // Necessidade: MB R$1.937,18 (congelado) + Infinite total R$9.160,07 = R$11.097,25. Folga R$134,62.
  // MIGRADO 27/07/2026 (V193): caixaMastercardInfinite migrada para saldo derivado, mesmo padrao das
  // demais. Historico reconstruido do que ja estava documentado em V187 (pagamento das faturas +
  // juros repassados a Caixa Lance) - nenhum valor novo inventado.
  MASTERCARD_INFINITE_SALDO_INICIAL: 0, // CORRIGIDO 05/08/2026 (parte 96, usuario apontou: "esse valor nao existe... voce deveria ter essa movimentacao no ERP porque eu sempre aviso qualquer valor que vou mover"): era 11167.23 - os 2 pagamentos abaixo NAO foram saidas desta caixa, foram APORTES (reforcos) que o usuario fez pra caixa, avisados em sessao anterior e nunca registrados. Corrigido tambem no Supabase (chave nova, antes so existia como default local).
  MASTERCARD_INFINITE_TRANSACOES: [
    { tx:'PIX-BRADESCO-27-07', data:'27/07', nome:'Aporte para fatura Visa Infinite (avisado pelo usuário, corrigido 05/08 — não era saída de pagamento, e sim reforço na caixa)', tipo:'Entrada', valor:9073.92 },
    { tx:'PIX-ITAU-27-07', data:'27/07', nome:'Aporte para fatura Mastercard Black (avisado pelo usuário, corrigido 05/08 — não era saída de pagamento, e sim reforço na caixa)', tipo:'Entrada', valor:1937.18 },
    { tx:'JUROS-27-07-MB', data:'27/07', nome:'Juros acumulados (repassados à Caixa Lance)', tipo:'Entrada', valor:161.12 },
  ],
  caixaMastercardInfinite: 11172.22, // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar MASTERCARD_INFINITE_TRANSACOES.
  // NOVO 04/08/2026 (parte 77, metodologia definida pelo usuario): categoria nova - compras avulsas
  // de bem durável/eletrônico (fone, cortador de pelo, smartwatch, ferramentas) NÃO entram na Caixa
  // Variável (que deveria medir só o custo RECORRENTE de viver - mercado, farmácia, Uber, higiene).
  // Ficam aqui, separadas, pra nao distorcer o indicador do teto de R$2.000/mes da Caixa Variavel.
  // Default vazio aqui - valor real vive no Supabase (EXTRAORDINARIO_BENS_DURAVEIS), mesmo padrao dos
  // outros livros de transacao.
  EXTRAORDINARIO_BENS_DURAVEIS: [],
  // NOVO 03/08/2026: meta oficial do Fundo de Suavizacao Salarial (CC-304). Funcao do fundo: absorver
  // a OSCILACAO do pro-labore (nao imprevisto - isso e papel da Reserva de Emergencia, R$100k, intocada).
  // Calculo (usuario): pior deficit mensal = proLaboreFixo - menor salario possivel (R$7.667,73, cenario
  // "fica em casa" sem periculosidade) = R$3.932,27/mes. Cobertura de 3 meses ruins seguidos = R$11.796,81.
  // Arredondado para a meta MINIMA das 3 opcoes apresentadas (12k/15k/20k) - usuario confirmou 12k.
  metaSuavizacao: 12000,
  SUAVIZACAO_SALDO_INICIAL: 0, // conta comeca zerada (decisao 3/3 da V90)
  SUAVIZACAO_TRANSACOES: [
    // Vazio na ativacao. O salario deste ciclo (R$16.819,56) foi recebido e 100% distribuido em 24/07,
    // ANTES da ativacao formal - o excedente sobre o pro-labore ja foi para Caixa Lance/outras caixas,
    // nao para ca. A partir do PROXIMO salario (25/08), o excedente passa a entrar aqui de fato.
    // Formato: { tx:'TXxxx', data:'dd/mm', nome:'Excedente do salario de [mes]', tipo:'Entrada', valor:N }
    // ou { ..., nome:'Complemento do pro-labore (mes magro)', tipo:'Saída', valor:N }
  ],
  contaSuavizacao: 0, // PLACEHOLDER - sobrescrito por calcularSaldoCaixa(). Nunca editar direto - editar SUAVIZACAO_TRANSACOES.
  // V144: aportes mensais das caixas incrementais que ainda eram texto fixo no card (secao 05)
  aporteSaudeFamilia: 135,
  aporteAniversarioJulio: 200,
  // seguroEmplacamentoAporte (425) ja existia acima
  // V144: footer da tabela "PIX diversos" (LRCV) - era texto fixo "Saidas R$527,61 Entradas R$64,00 Liquido -R$463,61"
  pixDiversosSaidas: 0, // ZERADO 25/07/2026 (V152): filtro por ciclo - eram R$527,61 do ciclo FECHADO (26/06-24/07). Nenhuma movimentacao de PIX diversos na Caixa Variavel ainda neste ciclo (25/07-24/08).
  pixDiversosEntradas: 0, // ZERADO 25/07/2026 (V152): mesma logica, era R$64,00 do ciclo fechado.

  // CORRIGIDO 29/07/2026 (V200): o array LRC_TRANSACOES criado ha pouco (V199) era ORFAO - duplicava
  // TX000158/161 que ja existiam em LRC_LIMBO_TRANSACOES (o array REAL, ja conectado a tela via
  // preencher('lrcLimboTbody', ...)). As 3 despesas de viagem (TX000172/173/174) foram movidas para
  // dentro do LRC_LIMBO_TRANSACOES de verdade, acima - nao existe mais LRC_TRANSACOES separado.

  // V192 (27/07/2026): SAUDE_FAMILIA_TRANSACOES - primeira caixa migrada para SALDO DERIVADO, a pedido
  // explicito do usuario ("editaveis, auditaveis") apos bug real: caixaSaudeFamilia ficou travada em
  // R$135,00 por 3 horas depois do gasto de R$135,06 (27/07), porque o registrador de saldo era numero
  // solto, nunca conectado ao array de transacoes. Daqui pra frente, esta caixa NUNCA mais tem saldo
  // editado direto - sempre SAUDE_FAMILIA_SALDO_INICIAL_CICLO + soma(entradas) - soma(saidas) deste array.
  // Historico deste ciclo (25/07-24/08): aporte de 24/07 na verdade e do ciclo anterior (recebido 1 dia
  // antes da virada oficial, ja documentado em outras caixas como "salario adiantado por cair em sabado").
  SAUDE_FAMILIA_TRANSACOES: [
    { tx:'TX000147', data:'24/07', nome:'Aporte mensal (salário Wärtsilä)', tipo:'Entrada', valor:135.00 },
    { tx:'TX000166', data:'27/07', nome:'Conduta pediátrica de Júlio (saldo próprio, complementado por empréstimo Caixa Lance)', tipo:'Saída', valor:135.06 },
    { tx:'TX000213', data:'07/08', nome:'Reembolso Bradesco Saúde (referente à conduta pediátrica de Júlio, TX000166/LREI0002)', tipo:'Entrada', valor:147.06 },
  ],
  // V176 (26/07/2026): NOVO livro PV (PIX Vanessa, reserva do Wallace) - pedido do usuario: "voce colocou
  // PGV mas nao tem PV no Livro Razao, e tem que registrar a saida de um para entrar na outra". Antes so
  // existia LRPV_TRANSACOES (na verdade sempre foi a PGV) - a PV (aportes do Wallace + reforcos a PGV)
  // nunca teve painel proprio, mesmo tendo saldo e regra de reposicao dedicados (secao 7 Politicas).
  PV_TRANSACOES: [
    { tx:'TX000141', data:'24/07', nome:'Aporte mensal (direto do salário Wärtsilä)', tipo:'Entrada', valor:1200.00 },
    { tx:'TX000150', data:'24/07', nome:'Reforço à PGV (contrapartida: entrada na PGV)', tipo:'Saída', valor:300.00 },
    { tx:'TX000178', data:'29/07', nome:'Reforço à PGV (contrapartida: entrada na PGV, comprovante MP 171162180982)', tipo:'Saída', valor:300.00 },
    { tx:'TX000187', data:'01/08', nome:'Reforço à PGV (contrapartida: entrada na PGV, comprovante E10573521202608011203zUhCTMzglu9)', tipo:'Saída', valor:300.00 },
    { tx:'RENDIMENTO-31-07', data:'31/07', nome:'Rendimento acumulado (ajuste conforme saldo real do app)', tipo:'Entrada', valor:2.12 },
  ],

  // V172 (26/07/2026): LRPV (PIX Vanessa - PGV, conta autonoma dela) convertido para array estruturado -
  // mesma logica ja aplicada a LRW/LRV/LRC. Antes era HTML fixo, faltavam TX000153/155 (PIX de 24/07,
  // ja existiam no ERP mas nunca chegaram no site). Nunca mais editar a tabela na mao.
  // V177 (26/07/2026): PGV reduzida para SO o ciclo atual (25/07 em diante) - pedido explicito do usuario:
  // "A PGV deve ser igual a LRW, so as transacoes desse ciclo". As 18 transacoes antigas (26/06-22/07,
  // liquido -R$265,66) foram movidas para o snapshot do ciclo FECHADO (ver CICLO_SNAPSHOTS['2026-06']
  // abaixo) - preservadas, so nao aparecem mais misturadas aqui. Adicionada a ENTRADA que faltava:
  // contrapartida do TX000150 (R$300, PV->PGV, 24/07) - antes so a SAIDA da PV estava registrada, sem
  // o correspondente na PGV (erro apontado pelo usuario: "voce colocou que saiu 300 da PV mas nao
  // registrou que entrou na PGV").
  LRPV_TRANSACOES: [
    { tx:'TX000153', data:'24/07', nome:'PIX Dupomar Hortifruti (Banco do Brasil)', tipo:'Saída', valor:182.96 },
    { tx:'TX000155', data:'24/07', nome:'PIX Romário Nogueira Cunha - Hortifruti', tipo:'Saída', valor:39.00 },
    { tx:'TX000150', data:'24/07', nome:'Reforço da PV (contrapartida de TX000150 na PV)', tipo:'Entrada', valor:300.00 },
    { tx:'TX000170', data:'28/07', nome:'Complemento consulta pediátrica Júlio (Dra. Cintia) - PIX R$340 = R$300 repassado 27/07 + R$40 desta caixa', tipo:'Saída', valor:40.00 },
    { tx:'TX000178', data:'29/07', nome:'Reforço da PV (contrapartida de TX000178 na PV, comprovante MP 171162180982)', tipo:'Entrada', valor:300.00 },
    { tx:'TX000181', data:'31/07', nome:'PIX Rayssa Dos Santos Pereira - depilação de Vanessa (comprovante B333NYP1B09MBE9JZ)', tipo:'Saída', valor:70.00 },
    { tx:'TX000182', data:'31/07', nome:'PIX Romario Nogueira Cunha - Hortifrut (comprovante E10573521202607311626TIYWLRElyer)', tipo:'Saída', valor:65.00 },
    { tx:'TX000187', data:'01/08', nome:'Reforço da PV (contrapartida de TX000187 na PV, comprovante E10573521202608011203zUhCTMzglu9)', tipo:'Entrada', valor:300.00 },
    { tx:'TX000189', data:'01/08', nome:'PIX Meu Pequeno (Itaú Unibanco) - comprovante E10573521202608011224CMw0yl9fysg', tipo:'Saída', valor:276.00 },
    // ADICIONADAS 07/08/2026: TXPV000001/TXPV000002 ja existiam no banco (Supabase) e no livro de
    // exibicao (linha ~1752), mas faltavam neste array - o unico realmente usado no calculo do saldo
    // (linha 2083) e do total do livro (linha 2080). Bug real confirmado contra o banco antes de aplicar.
    { tx:'TXPV000001', data:'02/08', nome:'Sandália de Júlio (PIX pra SHPB Brasil/Santander, comprovante E10573521202608021819nvP5QumT3Zb)', tipo:'Saída', valor:34.34 },
    { tx:'TXPV000002', data:'02/08', nome:'Kennedy Evaristo Dos Santos - Copinhos para Júlio', tipo:'Saída', valor:20.00 },
    { tx:'TX000219', data:'06/08', nome:'PIX Dupomar Hortifruti (comprovante MP 172431149270)', tipo:'Saída', valor:46.97 },
    { tx:'TX000221', data:'07/08', nome:'PIX Romario Nogueira Cunha - Hortifruti (comprovante MP 172570160396 / Pix E10573521202608071708zEIQz65uFJA)', tipo:'Saída', valor:75.00 },
  ],

  };
}
