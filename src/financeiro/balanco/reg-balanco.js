// MÓDULO: criarRegBalanco() — fragmento do REG (estado inicial) para o domínio Balanço:
// livrosRazaoTotais, balanco. Extraído do literal `const REG = {...}` de app.js na modularização
// (07/08/2026) — MESMOS valores, MESMA estrutura. IMPORTANTE: vira uma FUNÇÃO (não um objeto de
// topo) porque os valores dependem de VARS, avaliado no momento da CHAMADA — mesmo motivo de
// CARTAO_PLUGGY_MAPA_DEFAULT ser literal mas a linha derivada ficar em app.js. "Não alterar
// estrutura de dados consumida pelos módulos existentes" — os módulos de renderização/cálculo
// continuam lendo REG.livrosRazaoTotais.*/REG.balanco.* normalmente, sem nenhuma mudança de forma.
// ÚLTIMO fragmento da Fase 3 — depois deste, o literal `const REG = {}` em app.js fica vazio,
// REG inteiro é montado por Object.assign() dos 7 módulos reg-*.js.
function criarRegBalanco(){
  return {
    livrosRazaoTotais: {
      // V137: LRW/LRV/LRC/LRS/LRR eram literais que so por coincidencia batiam com visaDetalhe+mbDetalhe -
      // viram placeholder 0, DERIVADOS em recalcularAgregadosDerivados() (verificado bater exato antes de
      // converter). LRP/LRCON ja liam do VARS desde V135. LRB/LRCV/LRPV nao tem como derivar de outro dado
      // ja presente no site (sao fonte primaria) - leem do VARS agora, unica copia editavel. LRMP le do
      // VARS.mercadoPagoFatura (fecha a mesma divergencia corrigida no card Cartoes/Balanco).
      LRW:   { total:56.99, qtd:1 }, // FILTRO POR CICLO (V152/V155): painel de Livros Razao (secao 15) mostra o limbo (TX000132, Google SunSurveyorApp, R$56,99, 22/07 pos-fechamento) + ciclo atual - nenhuma compra pessoal do Wallace no MB neste ciclo ainda (Outback foi reclassificado como corporativo). Valor HARDCODED aqui (nao deriva de mbLRWConfirmado/visaLRWHistorico, que sao o TOTAL REAL usado em auditoria/cartaoMBTotal).
      LRV:   { total:35.95, qtd:3 }, // FILTRO POR CICLO (V152/V155): painel mostra limbo (TX000154, R$30,97, 24/07) + ciclo atual (TX000156/157, R$2,49x2) = R$35,95, 3 lancamentos. Valor HARDCODED (mesma logica do LRW acima).
      LRB:   { total:VARS.livroLRB, qtd:10 },
      LRP:   { total:VARS.livroLRP, qtd:16 },
      LRS:   { total:0, qtd:12 },
      LRR:   { total:0, qtd:7  },
      LRCON: { total:VARS.livroLRCON, qtd:2 },
      LRC:   { total:0, qtd:7 }, // CORRIGIDO 25/07/2026 (V154): +1 (Outback, TX000158). Era 6.
      LRMP:  { total:VARS.mercadoPagoFatura, qtd:9 },
      LRCV:  { total:VARS.livroLRCV, qtd:28 },
      LRPV:  { total:VARS.livroLRPV, qtd:19 }
    },
    // ===== BALANÇO PATRIMONIAL (Reestruturação V2.0, 16/07/2026 - V40/V41/V42) =====
    balanco: {
      // V135 (22/07/2026): fisico.total, financeiro.total, passivos.total, ativosTotal e patrimonioLiquido
      // eram numeros hardcoded que HOJE batem com a soma das partes (conferido por execucao real), mas nao
      // tinham formula nenhuma - qualquer edicao futura em 1 componente (ex: valor do carro, novo passivo)
      // ficaria dessincronizada ate alguem recalcular a mao. Viram DERIVADOS em recalcularAgregadosDerivados(),
      // nunca editar os totais aqui diretamente.
      fisico: { casa:VARS.patCasa, apartamento:VARS.patApartamento, jazigo:VARS.patJazigo, solar:VARS.patSolar, carro:VARS.patCarro, total:0 },
      financeiro: { reserva:VARS.reserva, btg:VARS.btgNecton, nectonContaCorrente:VARS.nectonContaCorrente, consorcioCasaPago:0, total:0 },
      pgbl: VARS.patPgbl,   // nao liquido, fora do total financeiro e da Meta do Milhao
      fgts: VARS.patFgts,   // nao liquido, fora do total financeiro e da Meta do Milhao
      passivos: { financiamentoCasa:VARS.passivoFinanciamentoCasa, consorcioAutoContemplado:VARS.passivoConsorcioAuto, total:0 },
      ativosTotal: 0,
      patrimonioLiquido: 0,
      reservas: {
        boletos:VARS.caixaBoletos, escolaJulio:VARS.escolaJulioSaldo, caixaLance:VARS.caixaLance, manutencao:VARS.caixaManutencao, eventos:VARS.caixaEventos,
        churrasco:VARS.caixaChurrasco, saudeFamilia:VARS.caixaSaudeFamilia, seguroEmplacamento:VARS.caixaSeguroEmplacamento, aniversarioJulio:VARS.caixaAniversarioJulio,
        // ADICIONADAS 05/08/2026 (parte 100, usuario listou as caixas reais que tem e apontou que faltavam
        // varias aqui): pixVanessa (VARS.caixaPixVanessa, PV - ja existia na Politica/Caixas Operacionais
        // do Painel, nunca tinha chegado no Balanco), combustivel, bensDuraveis e o Fundo de Suavizacao
        // (contaSuavizacao) - as 4 ja existiam como caixas de verdade (com array de transacoes real),
        // so nunca tinham entrado nesta soma especifica.
        pixVanessa:VARS.caixaPixVanessa, combustivel:VARS.caixaCombustivel, bensDuraveis:VARS.caixaBensDuraveis, suavizacao:VARS.contaSuavizacao,
        total:0 // total DERIVADO em recalcularAgregadosDerivados()
      }, // V134: todos os saldos leem do VARS agora (fonte unica) - eliminada a 2a/3a copia que ja causou 2 rodadas de bug nesta sessao. CORRIGIDO 24/07/2026 (V139): churrasco agora le do VARS (tinha 0 hardcoded, VARS ja tinha o valor certo mas nao estava conectado).
      operacional: { caixaVariavel:VARS.caixaVariavelSaldoReal, pixVanessaSaldoReal:VARS.pixGeralVanessaSaldo, caixaBoletos:VARS.caixaBoletos, mastercardInfinite:VARS.caixaMastercardInfinite, total:0 }, // total DERIVADO. V134: le do VARS. V139: adicionada Caixa Mastercard/Infinite (nova, guarda valor a pagar dos 2 cartoes ate 28/07).
      // V137: Wartsila REMOVIDA da soma do total (pedido do usuario 23/07/2026: "nao deve misturar
      // contas da empresa com minhas contas" - a fatura e 100% corporativa/reembolsavel, so aparece
      // aqui como linha informativa, igual ao tratamento ja dado a PGBL/FGTS). mercadoPago agora le
      // do VARS.mercadoPagoFatura (antes essa fatura aparecia em 2 lugares da tela com 2 valores
      // diferentes: R$1.751,16 aqui/card Cartoes vs R$1.791,93 no Balanco - mesma fatura, bug real).
      obrigacoes: { visa:0, mastercardBlack:0, mercadoPago:0, wartsila:VARS.faturaWartsila, total:0 }, // CORRIGIDO 26/07/2026 (V166): mercadoPago agora e liquido (fatura - corporativo do ciclo), calculado em recalcularAgregadosDerivados(). Era VARS.mercadoPagoFatura direto (bruto, sem descontar corporativo).
      fluxo: { entradas:0, saidas:0, resultado:0 } // CORRIGIDO 25/07/2026 (V150): saidas e resultado agora SOBRESCRITOS em recalcularAgregadosDerivados(), nunca mais numero fixo. Antes ficavam presos no valor do ciclo de transicao (25/06-24/07) mesmo depois de entradas ja ter mudado - "matematica doida" apontada pelo usuario (Resultado R$21.318,48 nao batia com nada real).
    }
  };
}
