// MODULO: criarVarsMercadoPago() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsMercadoPago(){
  return {
  // Cartoes (comprometido, corporativo Wartsila)
  // AVISO 04/08/2026 (parte 69): cartaoMBTotal, mbLRWConfirmado, mbLRSConfirmado (e mbLRVConfirmado)
  // JA EXISTEM como chave de topo em wallace_dados.dados no Supabase - Object.assign(VARS, dr) (ver
  // "Object.assign(VARS, dr)" mais abaixo no arquivo) SOBRESCREVE o valor escrito aqui, sempre, em
  // toda carga real de pagina. Editar esses 3 numeros aqui e cosmetico/documental (mantido pra quem
  // le o arquivo sem acesso ao banco), mas NUNCA e o jeito de atualizar o site de verdade - o
  // lancamento de compra tem que ir direto no Supabase (UPDATE wallace_dados SET dados = dados ||
  // jsonb_build_object(...) WHERE id=1), nunca so aqui. Erro cometido nas partes 64/67/68 desta mesma
  // sessao - 3 compras "lancadas" so no arquivo, sem efeito nenhum no site real, ate o usuario avisar.
  cartaoInfiniteTotal: 1017.89,          // CORRIGIDO 30/07/2026 (V207): revertido - TX000176 (Drogasil, cartão 6351) nunca foi do Visa Infinite. A tabela oficial de cartões (PROMPT_META_AI_EXTRACAO.md) confirma: 6351 = Vanessa, MASTERCARD BLACK, não Visa. Erro cometido em V201 (29/07) ao lançar a compra - corrigido agora, movida para o Mastercard Black (ver cartaoMBTotal). Era R$1.150,15 (errado).
  cartaoMBTotal: 5904.18,               // SINCRONIZADO 07/08/2026 (fonte: Supabase, direto do banco - arquivo local estava desatualizado, faltavam TX000192-207). mbDetalhe (1950,77 consórcios+1348,73 wallace+1279,65 recorrências+297,31 corp+663,10 assinaturas+364,62 vanessa) soma exato 5.904,18. Era R$5.633,11 (04/08/2026, parte 68) - ver histórico completo de correções anteriores no Supabase (campo não guarda mais o changelog linha a linha aqui, ficou grande demais - a partir de agora, mudanças de valor só documentadas com "Era X (data)" do imediatamente anterior).
  mastercardBlackCongelado: 1937.18,    // Congelado 22/07/2026, vencimento 28/07/2026 (fatura real do app, 25 lancamentos validos).
  // V135 (22/07/2026, auditoria SSOT): LRP e LRCON ainda sem split fisico por cartao (Politica sec.3) -
  // 100% atribuidos ao Visa Infinite por decisao documentada. Ate aqui existiam como numero literal
  // duplicado em totalOpDetalhe E visaDetalhe (2 copias que podiam dessincronizar) - agora moram so aqui.
  livroLRP: 0,      // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.PARCELAMENTOS_VISA (soma dos ATIVO). Nunca editar este numero diretamente - editar os itens do array.
  livroLRCON: 1950.77,    // = LIVRO_LRCON_TOTAL do ERP (2 consorcios: Porto Carro + Porto Casa Nova). USADO NO MASTERCARD BLACK (mbDetalhe.consorcios) - ambos ja migrados para MB desde 17/07/2026, valor correto aqui.
  livroLRCONVisaOnly: 0,    // NOVO 25/07/2026 (V159): parte do LRCON que e do Visa Infinite (usado em visaDetalhe.consorcios) - ZERADO porque os 2 consorcios ja migraram 100% para o Mastercard Black desde 17/07/2026. Nao ha nenhum consorcio no Visa.
  mercadoPagoFatura: 0, // PAGA 27/07/2026 (V187): R$2.015,58 via boleto (comprovante Mercado Pago, 22:43:39) - fatura completa do ciclo fechado (R$1.791,93) + transporte corporativo (R$266,23) já incluído. Juros R$8,27 repassados à Caixa Lance. ATENÇÃO: existe um 2º boleto duplicado de R$2.015,58 pendente - NÃO PAGAR, é a mesma fatura (aviso do próprio Mercado Pago). Era R$2.058,16.
  // Livros razao que sao fonte primaria (nao compostos de nada mais dentro do app.js) - LRW/LRV/LRS/LRR/LRC
  // saem de formula (visaDetalhe+mbDetalhe), LRP/LRCON ja existiam acima. Estes 3 nao tem como derivar
  // de outro dado ja presente no site, entao moram aqui como a UNICA copia editavel.
  livroLRB: 4586.45,   // ATUALIZADO 24/07/2026 (V139): +R$1.986,21 (TXB000010, aporte salario). Era R$2.600,24.
  livroLRCV: 1502.24,  // LIVRO_LRCV_TOTAL do ERP
  livroLRPV: 0,  // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.LRPV_TRANSACOES (soma Entradas-Saidas). CORRIGIDO 26/07/2026 (V172): era numero fixo (-R$295,66) que ja divergia da soma real das 18 linhas do HTML (-R$265,66) mesmo antes de qualquer TX nova - fonte unica agora, nunca mais dessincroniza.
  livroLRCVisaOnly: 0,    // ZERADO 25/07/2026 (V159, confirmado repetidamente pelo usuario): os R$483,43 sao do CICLO ANTERIOR, dinheiro ja recebido/reembolsado, sera pago dia 28 junto com a fatura MB - NAO deve aparecer como pendencia do ciclo atual. Era R$483,43.
  livroLRC: 0,         // PLACEHOLDER - sobrescrito por VARS.livroLRC = soma de LRC_LIMBO_TRANSACOES (V203). Nunca editar aqui - editar o array. Era 215.86 fixo, que ficou desatualizado quando as 3 despesas de viagem entraram no LRC hoje (29/07).
                        // (483.83, extrato real reconciliado V128); os dois numeros sao proximos mas representam conceitos diferentes,
                        // documentado, nao e erro. Antes vivia como literal solto dentro de visaDetalhe.corp.
  // V140: componentes de visaDetalhe/mbDetalhe/totalOpDetalhe que ainda eram literal solto
  visaLRWHistorico: 0,      // ZERADO 25/07/2026 (V147): confirmado pelo usuario - eram compras VARIAVEIS UNICAS no Visa Infinite ("compras unicas e pagou acabou"), nao recorrencia/assinatura. Ja foram pagas na fatura de julho (ciclo fechado), nao repetem no ciclo novo. Migracao de compras variaveis para o Mastercard Black e definitiva desde 23/07/2026 (fechamento da fatura MB). Era R$2.139,45.
  visaLRRConfirmado: 0,     // ZERADO 25/07/2026 (V159): usuario confirmou migracao final e completa de TODAS as recorrencias para o Mastercard Black. Nenhuma recorrencia resta no Visa Infinite. Era R$1.106,53.
  visaLRSConfirmado: 0,      // ZERADO 25/07/2026 (V159): usuario confirmou migracao final e completa de TODAS as assinaturas para o Mastercard Black (incluindo IFood/Vanessa, Meli+, Amazon Prime Canais, que ainda faltavam). Nenhuma assinatura resta no Visa Infinite. Era R$429,31.
  visaLRVHistorico: 0,       // REVERTIDO 30/07/2026 (V207): TX000176 (Drogasil, cartão 6351) nunca foi do Visa - erro de V201, corrigido. Cartão 6351 é Mastercard Black da Vanessa (tabela oficial). Era R$132,26 (errado).
  visaNaoReconciliado: 0,     // RESOLVIDO 23/07/2026: o residuo de R$49,81 foi auditado linha-a-linha contra a fatura Bradesco real (Visa Infinite, fecha 16/07/2026, todos os 4 cartoes - 4844/2773/0026/4845). Causa raiz identificada: VIVO estava R$88,00 abaixo do real (V111 usou config teorica em vez da fatura - revertido) + 2 compras nunca lancadas (Amazon Prime Canais R$19,99 e Amazon Prime Aluguel R$9,99). Substituido o metodo de reconciliacao: antes ancorado no "Total da fatura" (saldo corrente, contamina com pagamentos/saldo anterior de ciclos passados) - agora e a SOMA AUDITADA das 7 partes (parcelas+consorcios+wallace+recorrencias+corp+assinaturas+vanessa), cada uma conferida contra a fatura linha a linha. CARTAO_INFINITE_TOTAL_COMPROMETIDO recalculado: R$9.160,07 exato (soma das 7 partes corrigidas, vanessa ja inclui TX131).
  mbLRWConfirmado: 1348.73,       // SINCRONIZADO 07/08/2026 (fonte: Supabase): TX000203 Sorveteria Papa Açaí +61,15 + TX000205 ANTHROPIC*CLAUDE SUB (compra única, não é renovação de assinatura) +110,00. Era R$1.177,58 (04/08/2026, parte 68) - ver histórico completo de correções anteriores no Supabase.
  mbLRRConfirmado: 1279.65,        // RECONSTRUIDO 25/07/2026 (V159): TODAS as recorrencias migradas para o MB. = LIVRO_LRR_TOTAL (Vivo 435+Brisanet 113,13+Digna 152,41+CampoSanto 77,79+NewCar 59,99+Faculdade 441,33). Era R$614,45 (parcial, so as que ja tinham "cartao virtual" explicito).
  mbLRSConfirmado: 663.10,        // SINCRONIZADO 07/08/2026 (fonte: Supabase): TX000207 RegistroBR 47438636 +40,00 (assinatura ANUAL de domínio, wallacelira.com.br) - LRS não tem array próprio de transação, só o total agregado. Era R$623,10 (04/08/2026, parte 64) - ver histórico completo de correções anteriores no Supabase.
  mbLRVConfirmado: 364.62,         // SINCRONIZADO 07/08/2026 (fonte: Supabase): TX000204 H57Store Vanessa +22,97 + TX000206 H57Store Vanessa +36,95 (cartão dela não confirmado - pode ser 6351 físico ou 4017 Samsung Wallet, ver LRV_TRANSACOES). Era R$304,70 (03/08/2026) - ver histórico completo de correções anteriores no Supabase.
  mbLRCConfirmado: 0,        // PLACEHOLDER - sobrescrito por VARS.mbLRCConfirmado = VARS.livroLRC (V223). Nunca editar aqui - editar o array LRC_LIMBO_TRANSACOES. Era R$297,31 fixo (duplicava livroLRC manualmente).
  // V144: footer LRC (Corporativo Visa Infinite) - "6 lancamentos" era texto fixo, valor ja em VARS.livroLRC
  livroLRCQtdLancamentos: 1, // CORRIGIDO 25/07/2026 (V156): so o corporativo do ciclo ATUAL (TX000158, Outback). Os 6 lancamentos antigos do Visa sao do ciclo fechado, ja cobertos no valor separado pra 28/07. Era 7.
  // ===== V154 (25/07/2026): PARCELAMENTOS ESTRUTURADOS - fonte unica de verdade, espelha 1:1 a aba
  // PARCELAMENTOS_ATIVOS do ERP. Pedido do usuario: "O LR de compras parceladas tem que ser atualizado
  // automaticamente, ir retirando as parcelas pagas igualmente o LR do mercado pago". Antes disso, a
  // tabela HTML (secao 15, paineis LRP/LRMP) era 100% texto fixo, sem nenhuma relacao com os totais
  // usados no calculo (livroLRP/totalOpProvMP) - dois lugares que podiam dessincronizar silenciosamente.
  // Agora a tabela e GERADA por JS a partir destes arrays (ver renderParcelamentos() antes do hydrate),
  // e o total tambem deriva daqui - uma unica fonte, dois usos.
  // Quando um novo ciclo virar: incrementar parcelaAtual de cada item ATIVO; se parcelaAtual>totalParcelas,
  // mudar status para 'QUITADO' (nao remover a linha - mantem rastreabilidade, so sai da soma/exibicao ativa).
  PARCELAMENTOS_VISA: [
    { tx:'TXP000001', data:'23/03', nome:'Teacher Matias', valor:134.14, parcelaAtual:5, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000002', data:'21/03', nome:'DeckFriend', valor:13.03, parcelaAtual:5, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000003', data:'05/12/25', nome:'Korpos Estética', valor:189.99, parcelaAtual:8, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000004', data:'23/05', nome:'RL Artesão', valor:66.83, parcelaAtual:3, totalParcelas:5, status:'ATIVO' },
    { tx:'TXP000005', data:'28/05', nome:'Mercado Livre', valor:38.25, parcelaAtual:3, totalParcelas:4, status:'ATIVO' },
    { tx:'TXP000006', data:'20/05', nome:'Mercado Livre', valor:68.01, parcelaAtual:3, totalParcelas:4, status:'ATIVO' },
    { tx:'TXP000007', data:'18/02', nome:'Mercado Livre MP', valor:48.33, parcelaAtual:6, totalParcelas:6, status:'ATIVO' },
    { tx:'TXP000008', data:'03/07', nome:'Seguro Tokio Marine - Auto', valor:200.99, parcelaAtual:7, totalParcelas:10, status:'ATIVO' }, // CORRIGIDO 26/07/2026 (V172): usuario confirmou parcelado 10x desde Jan/2026, nao a vista. Jul=7/10, 3 restantes (Ago/Set/Out).
    { tx:'TXP000009', data:'31/05', nome:'Aram Beach Hotel', valor:486.64, parcelaAtual:3, totalParcelas:2, status:'QUITADO' }, // era 2/2 (ultima) no ciclo fechado
    { tx:'TXP000010', data:'21/07', nome:'PicPay Wallace Patri', valor:183.47, parcelaAtual:12, totalParcelas:12, status:'ATIVO' },
    { tx:'TXP000011', data:'20/05', nome:'Hub Smart Home', valor:72.96, parcelaAtual:3, totalParcelas:2, status:'QUITADO' },
    { tx:'TXP000012', data:'19/05', nome:'Edilson Lourenço', valor:425.00, parcelaAtual:3, totalParcelas:2, status:'QUITADO' },
    { tx:'TXP000013', data:'19/05', nome:'Silmara Macedo', valor:375.00, parcelaAtual:3, totalParcelas:2, status:'QUITADO' },
    { tx:'TXP000014', data:'08/07', nome:'Hotmart Fernando', valor:42.00, parcelaAtual:13, totalParcelas:12, status:'QUITADO' },
    { tx:'TXP000015', data:'13/05', nome:'Kinesioceteos', valor:74.85, parcelaAtual:4, totalParcelas:5, status:'ATIVO' },
    { tx:'TXP000025', data:'06/05', nome:'RBM Relógios', valor:80.97, parcelaAtual:4, totalParcelas:3, status:'QUITADO' },
  ],
  PARCELAMENTOS_MP: [
    { tx:'TXMP000001', nome:'Mercado Livre', valor:56.39, parcelaAtual:4, totalParcelas:6, status:'ATIVO' },
    { tx:'TXMP000002', nome:'Mercado Livre', valor:106.04, parcelaAtual:7, totalParcelas:12, status:'ATIVO' },
    { tx:'TXMP000003', nome:'Mercado Livre', valor:50.40, parcelaAtual:7, totalParcelas:8, status:'ATIVO' },
    { tx:'TXMP000004', nome:'Mercado Livre', valor:68.36, parcelaAtual:7, totalParcelas:6, status:'QUITADO' },
    { tx:'TXMP000005', nome:'Mercado Livre', valor:166.62, parcelaAtual:11, totalParcelas:24, status:'ATIVO' },
    { tx:'TXMP000006', nome:'Mercado Livre', valor:23.66, parcelaAtual:4, totalParcelas:6, status:'ATIVO' },
  ],
  // V159 (25/07/2026): itens corporativos/avulsos do Mercado Pago, com DATA real - permite filtro automatico
  // por ciclo (nunca mais texto fixo tipo "não deve aparecer no ciclo novo" editado a mao). Pedido do usuario:
  // "isso foi do ciclo passado, não deve aparecer no ciclo novo... tem que ser removido automaticamente".
  TRANSACOES_CORPORATIVAS_MP: [
    { tx:'TXMP000007', nome:'Transporte Recife (volta)', valor:638.94, data:'2026-07-02', tipo:'corp' },
    { tx:'TXMP000008', nome:'Transporte Recife (ida)', valor:638.94, data:'2026-06-29', tipo:'corp' },
    { tx:'TXMP000009', nome:'Transporte Aeroporto João Pessoa', valor:266.23, data:'2026-07-23', tipo:'corp' }, // NOVO 26/07/2026 (V167): MP*WALLACELIRA, achado no extrato do app - mesmo TX000152 ja lancado no ERP (adiantamento Caixa Lance).
    { tx:'TXMP000010', nome:'Mercado Livre (avulsa, à vista)', valor:42.58, data:'2026-05-19', tipo:'unico' },
    { tx:'TXMP000011', nome:'PIX Isabel Cristina Barbosa do Nascimento - Transporte corporativo (PicPay, cartão ...8739)', valor:266.23, data:'2026-08-01', tipo:'corp' },
  ],
  // ===== V168 (26/07/2026): FONTE UNICA ESTRUTURADA para os paineis de compras variaveis (LRW, LRV,
  // LRC-limbo, LRCV) - pedido explicito do usuario ("os pix de vanessa nao ta registrado, isso tem que
  // ser automatico, eu estou me irritando de tanto pedir isso"). Antes essas 4 tabelas eram HTML fixo,
  // editado a mao a cada compra nova - toda vez que eu esquecia de atualizar uma delas, ficava
  // desatualizada (exatamente o que aconteceu com TX000159, que ficou faltando na tabela do Wallace).
  // A partir de agora: TODA compra nova entra so aqui (1 lugar), a tabela HTML e gerada sozinha por
  // renderLivrosVariaveis() a cada carga da pagina - nunca mais editar as tabelas na mao.
  // SINCRONIZADO 07/08/2026 direto do Supabase (fonte real) - o arquivo local estava desatualizado,
  // faltavam TX000192-207 (achado numa sessão de reorganização física do projeto). Doravante, lembrar
  // que este array é só fallback/documentação - o site de verdade sempre lê do Supabase.
  LRW_TRANSACOES: [
    { tx:'TX000132', data:'22/07', nome:'Google SunSurveyorApp', obs:'cartão 2244, limbo (pós-fechamento fatura)', valor:56.99 },
    { tx:'TX000159', data:'25/07', nome:'Mercado*MercadoLivre', obs:'Kit Eudora+Shampoo (Variável) - fone e cortador de pelo movidos pra Extraordinário/Bens Duráveis, ver EXTRAORDINARIO_BENS_DURAVEIS', valor:196.01 },
    { tx:'TX000183', data:'31/07', nome:'Tapiocaria Irmão Firmi', obs:'cartão físico 2244, extração via DeepSeek/GPT', valor:227.00 },
    { tx:'TX000184', data:'31/07', nome:'H57Store', obs:'cartão físico 1371 (NOVO, substitui 2244), extração via DeepSeek/GPT', valor:18.36 },
    { tx:'TX000185', data:'31/07', nome:'H57Store', obs:'cartão físico 1371 (NOVO, substitui 2244), extração via DeepSeek/GPT', valor:5.59 },
    { tx:'TX000186', data:'31/07', nome:'H57Store', obs:'cartão físico 1371 (NOVO, substitui 2244), extração via DeepSeek/GPT', valor:2.19 },
    { tx:'TX000188', data:'01/08', nome:'Amazon - Repelente para Bebê SBP Baby', obs:'cartão virtual 4628, extração via DeepSeek/GPT', valor:32.06 },
    { tx:'TX000192', data:'02/08', nome:'PDV*DROGARIA BENIF', obs:'cartão físico 1371, extração via Claude', valor:20.00 },
    { tx:'TX000195', data:'03/08', nome:'DL*UberRides', obs:'Uber da Gabriela (aviso explícito do usuário) - exceção à regra padrão (Uber normalmente vai pra Vanessa/LRV). Confirmado 03/08/2026: Uber de Gabriela sempre vai pro LRW. Cartão: Mastercard Black virtual 4628 (Wallace). Aprovado 03/08 12h44.', valor:20.14 },
    { tx:'TX000196', data:'03/08', nome:'H57Store', obs:'Compra Wallace, cartão físico Mastercard Black 1371. Aprovado 03/08 14h59.', valor:42.28 },
    { tx:'TX000197', data:'03/08', nome:'ANTHROPIC', obs:'Compra internacional, cartão virtual MB 4628. Valor base R$50,00 + IOF 3,38% (estimado - fatura real confirma o valor final de câmbio). Aprovado 03/08 14h41.', valor:51.69 },
    { tx:'TX000198', data:'03/08', nome:'ANTHROPIC', obs:'Compra internacional, cartão virtual MB 4628. Valor base R$50,00 + IOF 3,38% (estimado - fatura real confirma o valor final de câmbio). Aprovado 03/08 15h22. Cobrança separada da TX000197 (14h41) - mesmo valor, horários diferentes.', valor:51.69 },
    { tx:'TX000199', data:'03/08', nome:'ANTHROPIC', obs:'Compra internacional, cartão virtual MB 4628. Valor base R$20,00 + IOF 3,38% (estimado - fatura real confirma o valor final de câmbio). Aprovado 03/08 16h02.', valor:20.68 },
    { tx:'TX000200', data:'04/08', nome:'ANTHROPIC*CLAUDE SUB', obs:'Compra internacional, cartão físico Mastercard Black 1371 (conta consolidada Pluggy 2250). Valor base R$110,00 + IOF 3,38% (estimado - fatura real confirma valor final). Renovação mensal da assinatura Claude. Aprovado 04/08 10h21.', valor:110.00 },
    { tx:'TX000201', data:'04/08', nome:'PANIFICADORA', obs:'Compra Wallace, cartão físico Mastercard Black 1371 (conta consolidada Pluggy 2250). Aprovado 04/08 16h37.', valor:60.90 },
    { tx:'TX000202', data:'04/08', nome:'MP *FESTA', obs:'Compra Wallace, cartão físico Mastercard Black 1371 (conta consolidada Pluggy 2250). Aprovado 04/08 17h03.', valor:17.00 },
    { tx:'TX000203', data:'05/08', nome:'Sorveteria Papa Açaí', obs:'cartão físico Mastercard Black 1371 (Wallace), aprovado 05/08 18h11', valor:61.15 },
    { tx:'TX000205', data:'06/08', nome:'ANTHROPIC*CLAUDE SUB', obs:'cartão virtual Mastercard Black 4628 (Wallace) - compra única (NÃO é a renovação mensal da assinatura, essa já registrada em TX000200/04-08), aprovado 06/08 16h14, compra internacional (IOF 3,38% + câmbio a confirmar na fatura)', valor:110.00 },
  ],
  LRV_TRANSACOES: [
    { tx:'TX000154', data:'24/07', nome:'H57Store', obs:'cartão 6351, limbo (pós-fechamento fatura)', valor:30.97 },
    { tx:'TX000156', data:'25/07', nome:'H57Store', obs:'cartão 6351', valor:2.49 },
    { tx:'TX000157', data:'25/07', nome:'H57Store', obs:'cartão 6351 (2ª compra distinta, mesmo minuto)', valor:2.49 },
    { tx:'TX000167', data:'28/07', nome:'DL*UberRides', obs:'cartão virtual 4628 (atípico - esse cartão é só p/ assinaturas/recorrências pela política, conferir se não foi engano na hora de passar), pré-autorização', valor:12.42 },
    { tx:'TX000168', data:'28/07', nome:'DL*UberRides', obs:'cartão virtual 4628, padrão Uber=Vanessa (sem nome visível/aviso em contrário)', valor:11.12 },
    { tx:'TX000169', data:'28/07', nome:'H57Store', obs:'cartão virtual 4628, titular VANESSA G GALDINO no comprovante', valor:8.08 },
    { tx:'TX000175', data:'29/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber de Vanessa (confirmado pelo usuário)', valor:12.02 },
    { tx:'TX000176', data:'29/07', nome:'Drogasil 2305', obs:'cartão 6351, Vanessa', valor:132.26 },
    { tx:'TX000177', data:'29/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber de Vanessa (confirmado pelo usuário)', valor:19.65 },
    { tx:'TX000179', data:'31/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber de Vanessa (confirmado pelo usuário, extração via DeepSeek/GPT)', valor:5.06 },
    { tx:'TX000180', data:'31/07', nome:'DL*UberRides', obs:'cartão virtual 4628, Uber padrão Vanessa (sem nome visível/aviso em contrário, extração via DeepSeek/GPT)', valor:6.43 },
    { tx:'TX000191', data:'01/08', nome:'MP *TIORAFAKIDS', obs:'Corte de cabelo do Júlio (confirmado pelo usuário). Cartão não especificado no comprovante, só titular VANESSA G GALDINO - assumido Mastercard Black 6351 (cartão ativo dela) até confirmação.', valor:50.00 },
    { tx:'TX000193', data:'03/08', nome:'DL*UberRides', obs:'Uber (Vanessa, regra fixa) - cartão exibido: Mastercard Black virtual 4628 (Wallace, titular do cartão, mas Uber sempre vai pra Vanessa independente do cartão que aparecer na fatura). Aprovado 03/08 08h36.', valor:12.23 },
    { tx:'TX000194', data:'03/08', nome:'DL*UberRides', obs:'Uber (Vanessa, regra fixa - sem aviso de exceção) - cartão exibido: Mastercard Black virtual 4628 (Wallace, titular do cartão, mas Uber sempre vai pra Vanessa). Aprovado 03/08 09h43.', valor:11.50 },
    { tx:'TX000204', data:'05/08', nome:'H57Store', obs:'Mastercard Black Personnalité Black Pontos, titular VANESSA G GALDINO, aprovado 05/08 19h32 — cartão não confirmado: pode ser 6351 (físico) ou 4017 (Samsung Wallet/aproximação), ambos da Vanessa.', valor:22.97 },
    { tx:'TX000206', data:'06/08', nome:'H57Store', obs:'Mastercard Black Personnalité Black Pontos, titular VANESSA G GALDINO, aprovado 06/08 18h08 — cartão não confirmado: pode ser 6351 (físico) ou 4017 (Samsung Wallet/aproximação), ambos da Vanessa.', valor:36.95 },
  ],
  LRC_LIMBO_TRANSACOES: [
    { tx:'TX000158', data:'25/07', nome:'Outback Vitória', obs:'cartão MB 2244, corporativo (reembolsável)', valor:215.86 },
    { tx:'TX000161', data:'26/07', nome:'Super Bom Supermercado', obs:'cartão MB 2244, corporativo (reembolsável)', valor:28.49 },
    { tx:'TX000172', data:'29/07', nome:'Antonio Domingos Angel', obs:'cartão MB 2244, lanchonete estrada Campos→Vitória, corporativo (reembolsável) - movido do LRW a pedido do usuário', valor:9.00 },
    { tx:'TX000173', data:'29/07', nome:'Antonio Domingos Angel', obs:'cartão MB 2244, lanchonete estrada Campos→Vitória (2ª compra), corporativo (reembolsável) - movido do LRW', valor:3.00 },
    { tx:'TX000174', data:'29/07', nome:'Conveniência Capuaba', obs:'cartão MB 2244, corporativo (reembolsável) - movido do LRW', valor:40.96 },
  ],
  LRCV_TRANSACOES: [
    { tx:'TX000162', data:'26/07', tipo:'PIX Saída', obs:'Poda das bananeiras (Ednaldo Caetano da Silva)', valor:100.00 },
    { tx:'TX000190', data:'01/08', tipo:'PIX Saída', obs:'Água mineral (Cleston da Silva, comprovante E10573521202608011254YTMcGt1oqXh)', valor:22.00 },
  ],
  };
}
