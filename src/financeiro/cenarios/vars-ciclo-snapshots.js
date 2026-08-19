// MODULO: criarVarsCicloSnapshots() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
// NOVO 08/08/2026 (fecha o maior consumidor restante de wallace_dados: CICLO_SNAPSHOTS, 15
// consumidores): transforma as linhas de `ciclos_financeiros_snapshots` (V2, pré-carregada em
// window.WALLACE_CICLO_SNAPSHOTS_V2 ANTES deste script rodar — ver Sistema_Wallace_Lira_Completo.html)
// no MESMO shape aninhado por ciclo_key que o literal abaixo sempre teve. Nenhum consumidor
// (aplicarCicloAoVARS/recalcularNecessidade/auditoria-automatica/CycleEngine/etc) precisa mudar —
// todos continuam lendo VARS.CICLO_SNAPSHOTS[chave].<campo> normalmente.
function transformarLinhasCicloSnapshotsV2(linhas){
  const obj = {};
  linhas.forEach(function(r){
    const arquivo = r.livros_razao_arquivados || null;
    obj[r.ciclo_key] = {
      label: r.label, periodo: r.periodo, fechado: r.fechado,
      salario: r.salario != null ? Number(r.salario) : null,
      entradasTotais: r.entradas_totais != null ? Number(r.entradas_totais) : null,
      caixaVariavelComprometido: r.caixa_variavel_comprometido != null ? Number(r.caixa_variavel_comprometido) : null,
      caixaVariavelSaldoReal: r.caixa_variavel_saldo_real != null ? Number(r.caixa_variavel_saldo_real) : null,
      caixaVariavelDisponivel: r.caixa_variavel_disponivel != null ? Number(r.caixa_variavel_disponivel) : null,
      reembolsoRecebido: r.reembolso_recebido != null ? Number(r.reembolso_recebido) : null,
      reembolsoAReceber: r.reembolso_a_receber != null ? Number(r.reembolso_a_receber) : null,
      toleranciaTempValor: r.tolerancia_temp_valor != null ? Number(r.tolerancia_temp_valor) : 0,
      toleranciaTempMotivo: r.tolerancia_temp_motivo,
      tetoOficial: r.teto_oficial != null ? Number(r.teto_oficial) : null,
      tetoEfetivo: r.teto_efetivo != null ? Number(r.teto_efetivo) : null,
      cascata: r.cascata || null,
      necessidadeTotalBruta: r.necessidade_total_bruta != null ? Number(r.necessidade_total_bruta) : null,
      necessidadeTotalLiquida: r.necessidade_total_liquida != null ? Number(r.necessidade_total_liquida) : null,
      modoOperacional: r.modo_operacional,
      saldoCiclo: r.saldo_ciclo != null ? Number(r.saldo_ciclo) : null,
      visaInfiniteComprometido: r.visa_infinite_comprometido != null ? Number(r.visa_infinite_comprometido) : undefined,
      mastercardBlackComprometido: r.mastercard_black_comprometido != null ? Number(r.mastercard_black_comprometido) : undefined,
      mastercardBlackPessoalCongelado: r.mastercard_black_pessoal_congelado != null ? Number(r.mastercard_black_pessoal_congelado) : undefined,
      mercadoPagoFaturaCongelada: r.mercado_pago_fatura_congelada != null ? Number(r.mercado_pago_fatura_congelada) : undefined,
      diasRestantes: r.dias_restantes,
      observacoes: r.observacoes,
    };
    if(arquivo){
      obj[r.ciclo_key].LRW_TRANSACOES = arquivo.LRW_TRANSACOES || [];
      obj[r.ciclo_key].LRV_TRANSACOES = arquivo.LRV_TRANSACOES || [];
      obj[r.ciclo_key].LRC_LIMBO_TRANSACOES = arquivo.LRC_LIMBO_TRANSACOES || [];
      obj[r.ciclo_key].LRPGV_TRANSACOES = arquivo.LRPV_TRANSACOES || [];
    }
  });
  return obj;
}

function criarVarsCicloSnapshots(){
  // V2 preferida quando o pré-carregamento (topo do HTML) teve sucesso; senão cai no literal abaixo
  // (fallback intencional — CICLO_SNAPSHOTS alimenta cálculo financeiro crítico do boot, nunca deixado
  // sem dado nenhum por causa de uma falha de rede pontual).
  if(Array.isArray(window.WALLACE_CICLO_SNAPSHOTS_V2) && window.WALLACE_CICLO_SNAPSHOTS_V2.length){
    try {
      const cicloSnapshotsV2 = transformarLinhasCicloSnapshotsV2(window.WALLACE_CICLO_SNAPSHOTS_V2);
      // CORRIGIDO 19/08/2026 (achado da investigação de automação de virada de ciclo): cicloAtual
      // era um literal FIXO ('2026-07') mesmo aqui na V2 — nunca acompanhava sozinho quando um ciclo
      // novo fosse aberto (fechar_ciclo_financeiro RPC), o site continuaria mostrando julho pra
      // sempre até alguém editar este arquivo à mão. Agora deriva do próprio dado: a chave com
      // fechado=false é sempre o ciclo atual (invariante de 1 único ciclo aberto por vez, mesma regra
      // que fechar_ciclo_financeiro/fechar_ciclo_solar já impõem no banco).
      const chaveAberta = Object.keys(cicloSnapshotsV2).find(k => cicloSnapshotsV2[k].fechado === false);
      if(chaveAberta){
        console.log('criarVarsCicloSnapshots: CICLO_SNAPSHOTS vindo da V2 (ciclos_financeiros_snapshots), '+Object.keys(cicloSnapshotsV2).length+' ciclo(s), atual='+chaveAberta+'.');
        return { cicloAtual: chaveAberta, CICLO_SNAPSHOTS: cicloSnapshotsV2 };
      }
      console.warn('criarVarsCicloSnapshots: V2 respondeu mas nenhuma linha com fechado=false (nenhum ciclo aberto) — usando literal V1.');
    } catch(err){
      console.warn('criarVarsCicloSnapshots: falha ao transformar CICLO_SNAPSHOTS da V2 — usando literal V1.', err);
    }
  }
  return {
  // ===== V145 (25/07/2026): DUAS VISOES DE CICLO SEPARADAS, SEM CRUZAMENTO =====
  // Pedido explicito do usuario: "quero ter duas visoes, a do ciclo anterior como ele fechou e a nova
  // do ciclo com os dados novos, nao quero cruzamento de dados". Espelha 1:1 a aba SNAPSHOT_CICLOS_FECHADOS
  // do ERP. Contem so os indicadores POR-CICLO (Caixa Variavel, Reembolso, Tolerancia, Cascata do
  // Reembolso, Modo Operacional/Saldo Ciclo). Indicadores de FLUXO CONTINUO (Necessidade Total dos
  // cartoes - segue a mesma curva mensal do grafico de projecao de 12 meses ja existente - Patrimonio,
  // valor obrigatorio das faturas MB/MP ja fechadas) NAO entram aqui, ficam no VARS normal (topo deste
  // arquivo) e sao os MESMOS em qualquer ciclo selecionado.
  cicloAtual: '2026-07', // qual ciclo o site mostra por padrao ao carregar
  CICLO_SNAPSHOTS: {
    '2026-06': {
      label: 'Jun/26 (26/06–24/07) — FECHADO',
      periodo: '26/06/2026 a 24/07/2026',
      fechado: true,
      salario: 33708.78,
      entradasTotais: 38623.76,
      caixaVariavelComprometido: 3998.50,
      caixaVariavelSaldoReal: 3933.37,
      caixaVariavelDisponivel: -65.13,
      reembolsoRecebido: 4914.98,
      reembolsoAReceber: 0,
      toleranciaTempValor: 1500,
      toleranciaTempMotivo: 'Viagem família Vanessa, até 24/07/2026 (encerrada)',
      tetoOficial: 2000,
      tetoEfetivo: 3500,
      cascata: { faturaWartsila: 656.67, mpCorporativo: 1277.88, cartaoCorporativo: 483.43, mpPessoal: 471.47, sobraTotal: 2025.13 },
      necessidadeTotalBruta: 14898.13,
      necessidadeTotalLiquida: 13943.23,
      modoOperacional: 'Alto',
      saldoCiclo: 6836.41,
      visaInfiniteComprometido: 9160.07, // CONGELADO - valor do Visa Infinite quando este ciclo fechou (antes da migracao para MB e antes do Seguro Tokio Marine ser corrigido para parcelado)
      mastercardBlackComprometido: 1937.18, // CORRIGIDO 26/07/2026 (V177): usuario esclareceu que este e o fechamento ARTIFICIAL que ele criou (congelamento de 22/07, vencimento 28/07) - nao um numero calculado a parte. Era R$2.065,17 (formula antiga, antes da reconciliacao completa da V161).
      mastercardBlackPessoalCongelado: 1849.31, // NOVO 26/07/2026 (V177, pedido do usuario): "esse valor deve ser o congelado, que e o fechamento artificial que eu criei" - Pessoal (s/corporativo) do MB no momento do congelamento de 22/07 (R$1.937,18 total congelado - corporativo daquele momento).
      mercadoPagoFaturaCongelada: 1791.93, // CONGELADO - fatura MP de quando este ciclo fechou (sem o adiantamento de transporte corporativo, que so entrou no ciclo seguinte)
      diasRestantes: 0,
      observacoes: 'Ciclo fechado na virada de 25/07/2026. O salário de R$16.819,56 recebido em 24/07 (adiantado por ser sábado) é do ciclo SEGUINTE, já distribuído no dia do recebimento.',
      // CORRIGIDO 04/08/2026 (parte 59, pedido do usuario apos investigacao real): o resumo de 1
      // linha por livro (V174, "61 compras/R$1.406,92" etc) estava DESATUALIZADO - conferido contra
      // ERP_WALLACE_LIRA_V11.xlsx (SWP_INPUT_TX) real, linha a linha. LRC bateu exato (validou o
      // metodo); LRW e LRV nao batiam com o resumo antigo. Usuario perguntou especificamente sobre a
      // tag "Visita Familia de Vanessa"/"Viagem Recife" (hotel ARAM BEACH HOTEL=TXP000009, transporte
      // Joao Pessoa x Campina Grande=TXMP000009, ambos ja lancados, so em livros diferentes de LRW/LRV)
      // - usuario esclareceu que a tag e SO informativa, nao reclassifica livro, entao a explicacao
      // real da divergencia e simplesmente resumo desatualizado, nao regra de negocio nenhuma. Trocado
      // pelos 43+10+6 lancamentos reais da planilha (mesmo criterio de filtro: LIVRO+DATA dentro do
      // periodo do ciclo, 26/06-24/07/2026). Novos totais: LRW R$2.426,36 (43), LRV R$206,27 (10),
      // LRC R$483,43 (6, inalterado - ja batia).
      LRW_TRANSACOES: [
        { tx:'TX000005', data:'27/06', nome:'TAPIOCA', valor:81.0 },
        { tx:'TX000006', data:'27/06', nome:'MERCADO_CLOVIS', valor:8.5 },
        { tx:'TX000007', data:'27/06', nome:'ABASTECE_AI', valor:103.0 },
        { tx:'TX000008', data:'28/06', nome:'KI_FRANGO', valor:64.0 },
        { tx:'TX000009', data:'28/06', nome:'ALEKS_BOLOS', valor:44.0 },
        { tx:'TX000010', data:'28/06', nome:'CLAUVENIENCIA', valor:45.0 },
        { tx:'TX000012', data:'04/07', nome:'MENDONCA_PASTEIS', valor:75.97 },
        { tx:'TX000013', data:'04/07', nome:'H57_STORE', valor:9.19 },
        { tx:'TX000014', data:'05/07', nome:'ELIAS_ANDRADE', valor:120.0 },
        { tx:'TX000015', data:'05/07', nome:'TAMYLLA', valor:32.0 },
        { tx:'TX000016', data:'05/07', nome:'TAMYLLA', valor:36.0 },
        { tx:'TX000017', data:'05/07', nome:'PIZZA_NOSTRA', valor:241.0 },
        { tx:'TX000018', data:'06/07', nome:'BROTHERS_CLUB', valor:85.0 },
        { tx:'TX000020', data:'07/07', nome:'HORTIFRUTI', valor:10.0 },
        { tx:'TX000021', data:'07/07', nome:'H57_STORE', valor:9.99 },
        { tx:'TX000026', data:'10/07', nome:'PANIFICADORA', valor:23.8 },
        { tx:'TX000027', data:'10/07', nome:'AMAZON_PRIME_VIDEO', valor:9.99 },
        { tx:'TX000031', data:'10/07', nome:'H57STORE', valor:40.98 },
        { tx:'TXR000007', data:'10/07', nome:'H57STORE', valor:9.99 },
        { tx:'TX000029', data:'11/07', nome:'MADOSKA_SORVETES', valor:127.43 },
        { tx:'TX000032', data:'11/07', nome:'SONIA_MARMITARIA', valor:5.0 },
        { tx:'TX000030', data:'12/07', nome:'PASTIANNE_RESTAURANTE', valor:126.28 },
        { tx:'TX000034', data:'12/07', nome:'H57STORE', valor:26.36 },
        { tx:'TX000035', data:'12/07', nome:'ANTHROPIC_API', valor:20.0 },
        { tx:'TX000036', data:'12/07', nome:'ANTHROPIC_API', valor:20.0 },
        { tx:'TX000078', data:'13/07', nome:'H57STORE', valor:25.93 },
        { tx:'TX000079', data:'14/07', nome:'ANTHROPIC_API', valor:20.0 },
        { tx:'TX000081', data:'16/07', nome:'NOBRE_CARNES_LI', valor:206.4 },
        { tx:'TX000082', data:'16/07', nome:'SUP_IDEAL', valor:313.12 },
        { tx:'TX000096', data:'17/07', nome:'H57STORE', valor:3.19 },
        { tx:'TX000100', data:'17/07', nome:'DENIS_MASSAS', valor:32.0 },
        { tx:'TX000101', data:'17/07', nome:'VENDEDORA', valor:71.0 },
        { tx:'TX000102', data:'17/07', nome:'H57STORE', valor:6.99 },
        { tx:'TX000103', data:'17/07', nome:'H57STORE', valor:12.79 },
        { tx:'TX000097', data:'17/07', nome:'H57STORE', valor:4.37 },
        { tx:'TX000098', data:'18/07', nome:'H57STORE', valor:12.79 },
        { tx:'TX000099', data:'18/07', nome:'H57STORE', valor:3.19 },
        { tx:'TX000104', data:'18/07', nome:'FILEZAO_SAO_CRISTOVAO', valor:38.26 },
        { tx:'TX000105', data:'18/07', nome:'MARIA_DO_SOCORRO', valor:40.0 },
        { tx:'TX000106', data:'18/07', nome:'MP_SOLANGEARTESA', valor:10.0 },
        { tx:'TX000108', data:'18/07', nome:'IFD_BROTHERS_BURGER', valor:230.67 },
        { tx:'TX000110', data:'19/07', nome:'PANIFICADORA', valor:13.8 },
        { tx:'TX000111', data:'19/07', nome:'H57STORE', valor:7.38 },
      ],
      LRV_TRANSACOES: [
        { tx:'TXR000004', data:'28/06', nome:'H57_STORE', valor:15.97 },
        { tx:'TX000011', data:'01/07', nome:'UBER', valor:9.21 },
        { tx:'TX000019', data:'06/07', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:31.7 },
        { tx:'TXR000006', data:'07/07', nome:'DORGIVAL_DE_OLIVEIRA_B', valor:34.0 },
        { tx:'TX000023', data:'09/07', nome:'DORGIVAL', valor:21.3 },
        { tx:'TX000024', data:'10/07', nome:'H57STORE', valor:9.99 },
        { tx:'TX000028', data:'10/07', nome:'H57STORE', valor:9.88 },
        { tx:'TXR000005', data:'12/07', nome:'DROGARIA_DROGAVISTA', valor:45.19 },
        { tx:'TX000033', data:'12/07', nome:'SONIA_MARMITARIA', valor:5.0 },
        { tx:'TX000076', data:'13/07', nome:'DL', valor:24.03 },
      ],
      LRC_LIMBO_TRANSACOES: [
        { tx:'TX22001', data:'29/06', nome:'LMSERVICE', valor:102.96 },
        { tx:'TX22002', data:'29/06', nome:'PORTO_GALLO', valor:42.56 },
        { tx:'TX22003', data:'01/07', nome:'CAFE_DA_VILLA', valor:150.0 },
        { tx:'TX22004', data:'02/07', nome:'LA_URSA', valor:146.62 },
        { tx:'TX22005', data:'02/07', nome:'CACAU_SHOW_CAFE', valor:19.8 },
        { tx:'TX22006', data:'02/07', nome:'CACAU_SHOW_SORVETE', valor:21.49 },
      ],
      LRPGV_TRANSACOES: [
        { tx:'TX000042', data:'04/07', nome:'Transferência Pix Geral (autonomia)', tipo:'Entrada', valor:300.00 },
        { tx:'TX000043', data:'05/07', nome:'PIX diversos Vanessa', tipo:'Entrada', valor:30.00 },
        { tx:'TX000055', data:'13/07', nome:'Recebido de Wallace (pediatra Júlio)', tipo:'Entrada', valor:50.00 },
        { tx:'TX000046', data:'27/06', nome:'PIX Romário Nogueira', tipo:'Saída', valor:62.00 },
        { tx:'TX000047', data:'27/06', nome:'PIX Vitoria Drieli', tipo:'Saída', valor:111.00 },
        { tx:'TX000048', data:'03/07', nome:'PIX Romário Nogueira', tipo:'Saída', valor:44.00 },
        { tx:'TX000049', data:'03/07', nome:'PIX para Wallace', tipo:'Saída', valor:30.00 },
        { tx:'TX000050', data:'04/07', nome:'PIX Vitoria Drieli', tipo:'Saída', valor:26.00 },
        { tx:'TX000051', data:'04/07', nome:'PIX Rebeca de Souza Oliveira', tipo:'Saída', valor:31.50 },
        { tx:'TX000052', data:'10/07', nome:'PIX Romário Nogueira', tipo:'Saída', valor:68.00 },
        { tx:'TX000053', data:'10/07', nome:'PIX Vanessa - uso próprio', tipo:'Saída', valor:9.36 },
        { tx:'TX000054', data:'12/07', nome:'H57 Store Minimercados', tipo:'Saída', valor:14.99 },
        { tx:'TX000056', data:'13/07', nome:'Sinal pediatra Júlio (repasse)', tipo:'Saída', valor:50.00 },
        { tx:'TX000080', data:'16/07', nome:'Dupomar Hortifrutti', tipo:'Saída', valor:133.81 },
        { tx:'TX000084', data:'16/07', nome:'Reforço da caixa PIX Vanessa (PV) → PIX Geral (PGV)', tipo:'Entrada', valor:95.00 },
        { tx:'TX-SUP-01', data:'20/07', nome:'Suporte da Caixa Variável (co-irmã, via PV)', tipo:'Entrada', valor:2.00 },
        { tx:'TX000122', data:'17/07', nome:'Hortifruti (frutas)', tipo:'Saída', valor:67.00 },
        { tx:'TX000121', data:'20/07', nome:'Fralda do Júlio (Meu Pequeno)', tipo:'Saída', valor:95.00 },
      ],
    },
    '2026-07': {
      label: 'Jul/26 (25/07–24/08) — ATUAL',
      periodo: '25/07/2026 a 24/08/2026',
      fechado: false,
      salario: 16819.56,
      entradasTotais: 17425.79, // ATUALIZADO V146: +R$340 no reembolso
      caixaVariavelComprometido: 1459.60, // ATUALIZADO 12/08/2026: backfill real de compras Mastercard Black/Visa via Pluggy (245,84 Vanessa + 1.213,76 Wallace) - ver docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md. Era R$584,48 (26/07/2026).
      caixaVariavelSaldoReal: 1886.65, // ATUALIZADO 12/08/2026: sincronizado com vw_saldo_v2_por_caixa (fonte viva) - este literal é fallback só-de-rede-falhar, não deve ficar parado enquanto o real muda. Era R$1.878,00 (01/08/2026).
      caixaVariavelDisponivel: 427.05, // ATUALIZADO 12/08/2026: 1886.65 - 1459.60 (comprometido)
      reembolsoRecebido: 340, // CORRIGIDO 07/08/2026 (bug real apontado pelo usuario): estava 0, mas o R$340 do TX000220 (WARTSILA_CAIXA_TRANSACOES) precisa entrar AQUI pra reembolsoCicloTotal (=reembolsoRecebido+reembolsoAReceber) refletir o recebido de verdade - o comentario antigo dizia "ja esta em reembolsoCicloTotal" mas a formula em app.js so le este campo, nunca o array da caixa. Sem isso, "Recebidos no ciclo" (reembolsoCicloTotal-reembolsosAReceber) dava R$0,00 mesmo com o TED ja confirmado.
      reembolsoAReceber: 6700.61, // ATUALIZADO 07/08/2026: usuario confirmou R$6.700,61 ainda a receber. Com reembolsoRecebido=340 acima, total do ciclo = R$7.040,61. Era R$7.022,76 (05/08, parte 96). NOTA: R$3.280,47 do relatorio anterior ("Company Paid BTA AmEx") ja foi pago direto pela empresa no cartao corporativo, nao e devido ao Wallace - nao soma aqui.
      toleranciaTempValor: 0,
      toleranciaTempMotivo: null,
      tetoOficial: 2000,
      tetoEfetivo: 2000,
      cascata: { faturaWartsila: 5056.95, mpCorporativo: 266.23, cartaoCorporativo: 297.31, mpPessoal: 0, sobraTotal: 0 }, // CORRIGIDO 05/08/2026 (parte 96, usuario confirmou valor real do cartao Wartsila = R$5.056,95): era 5768.06 (tanto aqui quanto no Supabase - corrigido nos dois lugares nesta sessao). mpCorporativo 0->266.23 (TXMP000011, PIX Isabel Cristina Barbosa - Transporte corporativo via PicPay). cartaoCorporativo 0->297.31 ja estava valendo via override (V223); consolidado aqui tambem. Impacto real dessas pernas = R$0 no bolso do Wallace (custos da empresa) - so registra para rastreabilidade (P6), nao afeta necessidadeLiquida.
      necessidadeTotalBruta: 13146.21, // ATUALIZADO V146/V147: parcelas Visa+MP recalculadas via PARCELAMENTOS_ATIVOS
      necessidadeTotalLiquida: 12743.10, // ATUALIZADO V147: NECESSIDADE_TOTAL - COBERTURA_JA_GARANTIDA_25 (403.11, cascata zerada corretamente)
      modoOperacional: 'Normal',
      saldoCiclo: 6836.41,
      // REMOVIDOS 29/07/2026 (V203, varredura de bugs): visaInfiniteComprometido (R$1.017,89),
      // mastercardBlackComprometido (R$4.563,34) e mercadoPagoFaturaAtual (R$2.058,16) eram NUMEROS
      // MORTOS - o codigo em aplicarCicloAoVARS() só le esses campos do snapshot quando snap.fechado
      // é true; para o ciclo ATUAL usa os valores vivos do topo do VARS (CARTAO_*_CICLO_ATUAL).
      // Ficavam congelados em 26/07 e nunca atualizavam, gerando falso alarme de "total dessincronizado"
      // em qualquer auditoria que os comparasse. Os valores vivos corretos: cartaoInfiniteTotal,
      // cartaoMBTotal, mercadoPagoFatura (no topo do VARS). Nenhum impacto na tela - eram inertes.
      diasRestantes: 30,
      observacoes: 'Ciclo iniciado 25/07/2026. Caixa Variável, Reembolso, Tolerância e Cascata do Reembolso começam do zero — dados exclusivos deste ciclo, sem cruzamento com o ciclo anterior.',
      // V174: os arrays de transacao do ciclo ATUAL sao referenciados diretamente dos arrays "vivos"
      // do VARS (LRW_TRANSACOES etc, que ja existem e sao atualizados a cada compra nova via Supabase).
      // NAO duplicar aqui - a referencia e resolvida em aplicarCicloAoVARS() no momento de uso.
    }
  }
  };
}
