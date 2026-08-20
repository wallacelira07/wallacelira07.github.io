// MIGRACAO 18/08/2026 (varredura anti-hardcode, pedido do usuario: "todo dado no site e obrigado a
// ler do Supabase, hardcode sao proibidos"): os literais abaixo SOBRESCRITOS por parametros_gerais
// no boot (mesmo mecanismo generico ja usado por taxasHoraFolhaPontoWartsila - bloco
// WALLACE_PARAMETROS_GERAIS_V2 em app.js, faz VARS[nome]=valor pra cada linha da tabela) - os
// literais aqui viram FALLBACK, so valem se a V2 falhar ao carregar: mbLRRConfirmado,
// mbLRSConfirmado, livroLRB, livroLRCV. Editar valor novo sempre no Supabase (parametros_gerais),
// nunca aqui.
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
  cartaoInfiniteTotal: 1216.55,          // ATUALIZADO 20/08/2026: valor real da fatura fechada Bradesco (todos os 3 cartões Visa — 4844 Wallace R$1.004,75 + 2773 Wallace R$183,47 + 4845 Vanessa R$24,48 = R$1.216,55 exato). Era R$1.017,89 (só parcelas, incompleto — não incluía Wallace/Vanessa avulsos). Componentes ainda incompletos (ver visaLRWHistorico) — resíduo do Não Reconciliado do Visa reflete isso honestamente em vez de mostrar R$0,00 falso.
  // CORRIGIDO 20/08/2026 (usuário mandou a fatura real completa, xlsx do Itaú, 114 lançamentos —
  // reconciliação item a item, ver ESTADO_ATUAL.md bloco 31): o valor anterior (R$6.480,29) era a
  // fatura ABERTA INTEIRA (16/07-17/08) menos o pagamento — mas isso mistura o resíduo do ciclo do
  // CARTÃO anterior (fecha dia 22, já pago em 27/07) com o ciclo NOVO. Usuário confirmou: ciclo do
  // cartão (fecha 22, com "limbo" de 22-24 empurrando compras de fronteira pro ciclo seguinte) e o
  // "ciclo" interno do site (Caixa Variável, `ciclo_inicio_em`=25/07) são conceitos DIFERENTES, não
  // precisam bater — MAS o limbo (22-24) precisa ficar incluído na âncora, senão a falta de sincronismo
  // entre fatura e ciclo do site atrapalha de novo (pedido explícito do usuário). Recalculado: soma
  // real da fatura a partir de 22/07/2026 (com o limbo 22-24 incluso) = 87 lançamentos, R$6.407,98.
  // ATUALIZADO no mesmo dia (achado do usuário: "você já acrescentou as compras de 17 até hoje?" —
  // não tinha, o xlsx só cobria até 17/08): somadas 4 compras reais confirmadas de 18-19/08
  // (Medidor Wellida R$93,51 + Churrasqueira R$349,99 + Nobre Carnes R$82,83 + MP*Brothersclub
  // R$90,00 = R$616,33) = R$7.024,31. REVERTIDO no mesmo dia (achado do usuário, com razão: "Amazon
  // Prime, eu já falei que não deve somar isso, isso é uma maldita assinatura") — cheguei a somar
  // +R$19,90 de Amazon Prime aqui também, mesmo ela já sendo assinatura fixa via `cronograma_assinaturas`
  // (LRS). REGRA PERMANENTE: nunca somar/mexer manualmente em nada que seja assinatura/recorrência
  // reconhecida em nenhum cálculo — o mecanismo de `cronograma_assinaturas`/`cronograma_recorrencias`
  // é a ÚNICA fonte pra isso, sempre, sem exceção (ver [[feedback_assinaturas_nunca_transacao_avulsa]]).
  // Esta âncora vai ficar defasada de novo à medida que dias passam sem atualização — é uma foto de um
  // instante, não um valor vivo (ver seção -12/-13 do ESTADO_ATUAL.md pra entender por que "a fatura
  // sempre vence" é manual de propósito). Mesmo valor já escrito em `parametros_gerais` (fonte real,
  // este literal é só fallback se a busca falhar).
  cartaoMBTotal: 7042.33,                // ATUALIZADO 20/08/2026: fatura real (xlsx Itaú, 22/07-17/08) somada item a item = R$6.406,10, + 5 compras confirmadas de 18-19/08 (print do app, R$636,23) = R$7.042,33. Reconciliado linha a linha contra `transacoes` (LRW+LRV+caixas temáticas+corp bateram exato, centavo a centavo) — resíduo residual de ~R$33 explicado por IOF embutido (R$18,21, categoria separada "Outros custos" na fatura, nunca linha própria em `transacoes`) + pequenas diferenças de câmbio, não é transação perdida/duplicada.
  // REMOVIDO 18/08/2026 (achado de auditoria noturna, autorizado pelo usuário: "código morto...pode
  // eliminar"): mastercardBlackCongelado (1937.18, congelado 22/07/2026) nunca era lido — resíduo da
  // migração pra VARS.CICLO_SNAPSHOTS[cicloAtual].mastercardBlackPessoalCongelado (vars-ciclo-
  // snapshots.js, valor R$1.849,31, só a parte pessoal), que É o campo efetivamente lido hoje
  // (hydrate-visa-mb.js).
  // V135 (22/07/2026, auditoria SSOT): LRP e LRCON ainda sem split fisico por cartao (Politica sec.3) -
  // 100% atribuidos ao Visa Infinite por decisao documentada. Ate aqui existiam como numero literal
  // duplicado em totalOpDetalhe E visaDetalhe (2 copias que podiam dessincronizar) - agora moram so aqui.
  livroLRP: 0,      // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.PARCELAMENTOS_VISA (soma dos ATIVO). Nunca editar este numero diretamente - editar os itens do array.
  livroLRCON: 0,    // ZERADO 11/08/2026 (adequação pedida pelo usuário): os 2 consórcios (Porto Carro + Porto Casa Nova, R$1.950,77) deixaram de ser cobrados no Mastercard Black e passaram a boletos pagos em dinheiro pela Caixa Boletos (dia 15) - ver cronograma_boletos_fixos (TXCON000001/002) e LREI0005 (empréstimo-ponte da Caixa Lance cobrindo o 1º mês). PLACEHOLDER - re-sincronizado por aplicarOnda9LivrosFixos() a partir de cronograma_consorcios (agora sempre vazio, ambos ativo=false).
  livroLRCONVisaOnly: 0,    // NOVO 25/07/2026 (V159): parte do LRCON que e do Visa Infinite (usado em visaDetalhe.consorcios) - ZERADO porque os 2 consorcios ja migraram 100% para o Mastercard Black desde 17/07/2026. Nao ha nenhum consorcio no Visa.
  mercadoPagoFatura: 0, // PAGA 27/07/2026 (V187): R$2.015,58 via boleto (comprovante Mercado Pago, 22:43:39) - fatura completa do ciclo fechado (R$1.791,93) + transporte corporativo (R$266,23) já incluído. Juros R$8,27 repassados à Caixa Lance. ATENÇÃO: existe um 2º boleto duplicado de R$2.015,58 pendente - NÃO PAGAR, é a mesma fatura (aviso do próprio Mercado Pago). Era R$2.058,16.
  // Livros razao que sao fonte primaria (nao compostos de nada mais dentro do app.js) - LRW/LRV/LRS/LRR/LRC
  // saem de formula (visaDetalhe+mbDetalhe), LRP/LRCON ja existiam acima. Estes 3 nao tem como derivar
  // de outro dado ja presente no site, entao moram aqui como a UNICA copia editavel.
  livroLRB: 4586.45,   // ATUALIZADO 24/07/2026 (V139): +R$1.986,21 (TXB000010, aporte salario). Era R$2.600,24.
  livroLRCV: 1502.24,  // LIVRO_LRCV_TOTAL do ERP
  livroLRPV: 0,  // PLACEHOLDER - SOBRESCRITO logo apos o VARS fechar, derivado de VARS.LRPGV_TRANSACOES (soma Entradas-Saidas). CORRIGIDO 26/07/2026 (V172): era numero fixo (-R$295,66) que ja divergia da soma real das 18 linhas do HTML (-R$265,66) mesmo antes de qualquer TX nova - fonte unica agora, nunca mais dessincroniza.
  livroLRCVisaOnly: 0,    // ZERADO 25/07/2026 (V159, confirmado repetidamente pelo usuario): os R$483,43 sao do CICLO ANTERIOR, dinheiro ja recebido/reembolsado, sera pago dia 28 junto com a fatura MB - NAO deve aparecer como pendencia do ciclo atual. Era R$483,43.
  livroLRC: 0,         // PLACEHOLDER - sobrescrito por VARS.livroLRC = soma de LRC_LIMBO_TRANSACOES (V203). Nunca editar aqui - editar o array. Era 215.86 fixo, que ficou desatualizado quando as 3 despesas de viagem entraram no LRC hoje (29/07).
                        // (483.83, extrato real reconciliado V128); os dois numeros sao proximos mas representam conceitos diferentes,
                        // documentado, nao e erro. Antes vivia como literal solto dentro de visaDetalhe.corp.
  // V140: componentes de visaDetalhe/mbDetalhe/totalOpDetalhe que ainda eram literal solto
  // REVERTIDO 12/08/2026: tentativa de lançar wallace/assinatura/vanessa reais (R$84,81 da fatura,
  // IOF+Uber+Google Mega+H57Store) — desfeita porque o campo "parcelas" (livroLRP) já conta adiantado
  // uma parcela (Kinesiocenteos, TXP000015) sem data de cobrança cadastrada, e somar os 2 gera
  // divergência REAL falsa (partes > total) sem correção de raiz possível sem inventar dado (nenhuma
  // parcela tem data_prevista preenchida). Mantido zerado — resíduo pequeno (R$9,96) e já explicado
  // como "não auditável" é preferível a um alarme de divergência real falso. Não mexer sem resolver
  // primeiro a falta de data_prevista nas parcelas.
  // ATUALIZADO 20/08/2026 (achado real, fatura Bradesco 4844 confirmada pelo usuário): a premissa de
  // 12/08 ("Visa não tem cobertura de cartao_id nenhuma") não é mais verdade — a investigação de hoje
  // achou várias transações reais com cartao_id do Visa Infinite (Tokio Marine, IOF diário, Uber,
  // agora também Anthropic/Claude de agosto — TX000348, cobrado por engano no Visa este ciclo,
  // confirmado pela fatura real, volta pro Mastercard Black mês que vem). Não é uma reconstrução
  // completa por query ainda (isso exigiria decidir a mesma arquitetura ONDA3_MB_CARTOES_IDS pro
  // lado Visa, fora do escopo deste ajuste pontual) — só o valor confirmado manualmente contra a
  // fatura, mesmo padrão de "a fatura sempre vence" já usado no resto deste arquivo.
  visaLRWHistorico: 174.18, // Anthropic/Claude (TX000348, R$110,00) + MEGA Pro Lite (TXS000010, R$30,99, cobrada por engano no Visa este ciclo — próximo ciclo volta pro Mastercard, usuário já trocou) + Uber (TX000271, R$26,58) + IOF diário (TX000273, R$2,76) + IOF s/ trans inter reais (TX000351, R$3,85, achado por agente de reconciliação item a item — linha solta da fatura fora dos 3 subtotais por cartão, nunca lançada antes). Resíduo do Não Reconciliado fecha em R$0,00 exato com este ajuste.
  // NOVO 12/08/2026 (PRIORIDADE 0, pedido do usuario): investigacao confirmou por SQL direto que
  // TODA transacao da Caixa Variavel com cartao_id preenchido pertence ao Mastercard Black - o Visa
  // Infinite nao tem cobertura de cartao_id nenhuma (item 5, PLANO_UNIFICACAO_V1_V2.md). Isso NAO e
  // so um buraco no lado Visa: mbLRWConfirmado (linha 43) tambem herda, por convencao historica,
  // gasto variavel sem cartao_id identificado - ou seja, o "wallace" (LRW) dos 2 cartoes e a MESMA
  // lacuna de dado, so que atribuida por padrao ao MB. auditoriaAutomatica() usa esta flag pra
  // marcar os checks #11/#12 como "nao auditavel" em vez de "divergencia" quando o gap observado e
  // inteiramente explicavel por essa lacuna conhecida (nunca quando as partes JA auditaveis, sem
  // wallace, ultrapassam o total da fatura - isso continua sendo divergencia real). Nao mexer sem
  // evidencia nova (cartao_id real do Visa passar a existir na base).
  cartaoIdCoberturaInsuficienteVisa: true,
  visaLRRConfirmado: 0,     // ZERADO 25/07/2026 (V159): usuario confirmou migracao final e completa de TODAS as recorrencias para o Mastercard Black. Nenhuma recorrencia resta no Visa Infinite. Era R$1.106,53.
  visaLRSConfirmado: 0,      // REVERTIDO 12/08/2026 (ver comentário em visaLRWHistorico acima).
  visaLRVHistorico: 24.48,   // ATUALIZADO 20/08/2026: 2 compras da Vanessa (H57Store, TX000349/350, cartão Visa 4845) confirmadas pela fatura real Bradesco, não estavam lançadas em lugar nenhum — checado que não duplicam nada no Mastercard antes de lançar.
  visaNaoReconciliado: 0,     // RESOLVIDO 23/07/2026: o residuo de R$49,81 foi auditado linha-a-linha contra a fatura Bradesco real (Visa Infinite, fecha 16/07/2026, todos os 4 cartoes - 4844/2773/0026/4845). Causa raiz identificada: VIVO estava R$88,00 abaixo do real (V111 usou config teorica em vez da fatura - revertido) + 2 compras nunca lancadas (Amazon Prime Canais R$19,99 e Amazon Prime Aluguel R$9,99). Substituido o metodo de reconciliacao: antes ancorado no "Total da fatura" (saldo corrente, contamina com pagamentos/saldo anterior de ciclos passados) - agora e a SOMA AUDITADA das 7 partes (parcelas+consorcios+wallace+recorrencias+corp+assinaturas+vanessa), cada uma conferida contra a fatura linha a linha. CARTAO_INFINITE_TOTAL_COMPROMETIDO recalculado: R$9.160,07 exato (soma das 7 partes corrigidas, vanessa ja inclui TX131).
  mbLRWConfirmado: 1563.19,       // CORRIGIDO 08/08/2026 (+207,02, TX000222 Dr.Pizza): usuário fez a compra e mandou lançar numa outra sessão/chat - ela gravou só na Arquitetura V2 (tabela transacoes), nunca chegou aqui nem debitou a Caixa Variável (comprometido ficou desatualizado até agora). Era R$1.356,17 (07/08/2026, fix do IOF do TX000200/TX000205) - ver histórico completo de correções anteriores no Supabase.
  mbLRRConfirmado: 1279.65,        // RECONSTRUIDO 25/07/2026 (V159): TODAS as recorrencias migradas para o MB. = LIVRO_LRR_TOTAL (Vivo 435+Brisanet 113,13+Digna 152,41+CampoSanto 77,79+NewCar 59,99+Faculdade 441,33). Era R$614,45 (parcial, so as que ja tinham "cartao virtual" explicito).
  mbLRSConfirmado: 663.10,        // SINCRONIZADO 07/08/2026 (fonte: Supabase): TX000207 RegistroBR 47438636 +40,00 (assinatura ANUAL de domínio, wallacelira.com.br) - LRS não tem array próprio de transação, só o total agregado. Era R$623,10 (04/08/2026, parte 64) - ver histórico completo de correções anteriores no Supabase.
  mbLRVConfirmado: 364.62,         // SINCRONIZADO 07/08/2026 (fonte: Supabase): TX000204 H57Store Vanessa +22,97 + TX000206 H57Store Vanessa +36,95 (cartão dela não confirmado - pode ser 6351 físico ou 4017 Samsung Wallet, ver LRV_TRANSACOES). Era R$304,70 (03/08/2026) - ver histórico completo de correções anteriores no Supabase.
  mbLRCConfirmado: 0,        // PLACEHOLDER - sobrescrito por VARS.mbLRCConfirmado = VARS.livroLRC (V223). Nunca editar aqui - editar o array LRC_LIMBO_TRANSACOES. Era R$297,31 fixo (duplicava livroLRC manualmente).
  // NOVO 20/08/2026 (achado da reconciliação item a item contra a fatura real do MB, xlsx Itaú
  // 22/07-17/08): depois de fechar TODOS os outros componentes do "Não Reconciliado" (âncora
  // atualizada, assinaturas com ultima_cobranca_em, Tokio Marine removido, H57Store religado), sobrou
  // um resíduo fixo de R$18,21 — os 7 "Iof Compra Internacional" da fatura (compras internacionais:
  // Anthropic/OpenAI), que o próprio banco categoriza como "Outros custos" (confirmado no resumo do
  // app: "Compras R$8.842,76 + Outros custos R$18,21"), separado de "Compras" — nunca vira linha
  // própria em `transacoes` (o valor final da compra já vem em reais, com o IOF implícito só nas
  // internacionais que TÊM linha separada de IOF; nas que não têm, o câmbio já fecha exato sem sobra,
  // ver comentário de TX000251/253/257/254/274/etc.). Mesma natureza de `cartaoMBTotal` — foto manual,
  // reconciliada contra a fatura real, não um cálculo automático (o valor exato muda a cada fatura
  // dependendo de quantas compras internacionais houve). Atualizar junto com `cartaoMBTotal` sempre
  // que reconciliar uma fatura nova.
  mbIOFConfirmado: 18.21,
  // NOVO 11/08/2026 (auditoria pedida pelo usuário, "materialidade, não perseguir os 81 lançamentos um
  // a um"): mbDetalhe nunca teve o campo "naoReconciliado" que o Visa já tem desde a V135 (achado real:
  // check #12 de auditoria-automatica.js compara soma(mbDetalhe) x cartaoMBTotal e SEMPRE falhava, porque
  // faltava esse campo). Cruzamento contra as 81 transações reais da Pluggy (conta 2250, wallace_dados.
  // PLUGGY_CONTAS, período 16/07-07/08 = R$5.179,20 observado): R$1.113,32 são compras reais (H57Store,
  // Nobre Carnes, Sup Ideal, Vendedora, Denis Massas, Filezão São Cristóvão, Drive Campina Grande, IFD
  // Brothers Burger, etc.) que nunca entraram em LRW_TRANSACOES/LRV_TRANSACOES — resíduo real, não
  // itemizado pessoa a pessoa ainda. O restante até fechar com a fatura real (R$6.744,29 - R$4.065,88
  // itemizado = R$2.678,41 no total) é a Pluggy ainda não ter sincronizado 08-11/08 (fatura desta caixa
  // fecha depois, "melhor data de compra 22/08") - residual conhecido e explicado pela defasagem de sync,
  // não um erro de dado. Não itemizado transação a transação por decisão de materialidade (usuário: "não
  // espere uma auditoria perfeita dos 81 lançamentos para avançar") - revisar quando a Pluggy sincronizar
  // o resto do ciclo.
  // CORRIGIDO 12/08/2026: reconciliação completa refeita com a fatura real (PDF/Excel Bradesco,
  // extrato em aberto de agosto) - wallace/recorrencias/corp/vanessa/assinaturas agora batem com a
  // fatura linha a linha (ver vars-mercado-pago.js mbLRWConfirmado e cronograma_recorrencias no
  // Supabase). O resíduo de R$2.678,41 documentado acima era de ANTES dessa reconciliação (defasagem
  // de sync Pluggy) - mantê-lo agora contaria a mesma diferença 2x. Único resíduo real que sobra é a
  // diferença de timing de "assinaturas" (VARS.mbLRSConfirmado = compromisso do mês inteiro, R$475,67,
  // vs R$233,04 já lançados nesta fatura até agora) - aparece sozinho na auditoria, não precisa de
  // plug aqui.
  mbNaoReconciliado: 0,
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
    { tx:'TXP000003', data:'05/12/25', nome:'Korpos Estética', valor:189.99, parcelaAtual:9, totalParcelas:12, status:'ATIVO' }, // CORRIGIDO 20/08/2026 (achado real da fatura Bradesco confirmada: "KORPOS ESTETICA LTDA (09/12)" — site estava em 8/12, defasado 1 parcela, achado pelo agente de reconciliação do resíduo R$3,85. Progresso não vem de nenhum trigger/automação (ver 1.3.6/1.3.7 do manual) — precisa ser conferido manualmente a cada fatura nova.
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
    { tx:'TX000200', data:'04/08', nome:'ANTHROPIC*CLAUDE SUB', obs:'Compra internacional, cartão físico Mastercard Black 1371 (conta consolidada Pluggy 2250). Valor base R$110,00 + IOF 3,38% = R$113,72 (câmbio final confirma na fatura). Renovação mensal da assinatura Claude. Aprovado 04/08 10h21. CORRIGIDO 07/08/2026: valor não tinha o IOF somado ainda (era 110,00), mesmo bug do TX000205 - encontrado ao aplicar o IOF do TX000205.', valor:113.72 },
    { tx:'TX000201', data:'04/08', nome:'PANIFICADORA', obs:'Compra Wallace, cartão físico Mastercard Black 1371 (conta consolidada Pluggy 2250). Aprovado 04/08 16h37.', valor:60.90 },
    { tx:'TX000202', data:'04/08', nome:'MP *FESTA', obs:'Compra Wallace, cartão físico Mastercard Black 1371 (conta consolidada Pluggy 2250). Aprovado 04/08 17h03.', valor:17.00 },
    { tx:'TX000203', data:'05/08', nome:'Sorveteria Papa Açaí', obs:'cartão físico Mastercard Black 1371 (Wallace), aprovado 05/08 18h11', valor:61.15 },
    { tx:'TX000205', data:'06/08', nome:'ANTHROPIC*CLAUDE SUB', obs:'cartão virtual Mastercard Black 4628 (Wallace) - compra única (NÃO é a renovação mensal da assinatura, essa já registrada em TX000200/04-08), aprovado 06/08 16h14, compra internacional. Valor base R$110,00 + IOF 3,38% = R$113,72 (câmbio final confirma na fatura).', valor:113.72 },
    { tx:'TX000222', data:'07/08', nome:'AJLR Comercio de Alime (Dr.Pizza)', obs:'cartão físico Mastercard Black 1371 (Wallace). Lançamento tinha entrado só na Arquitetura V2 (outra sessão de chat), nunca no V1/LRW nem debitado da Caixa Variável - corrigido 08/08/2026.', valor:207.02 },
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
