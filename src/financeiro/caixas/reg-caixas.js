// MÓDULO: criarRegCaixas() — fragmento do REG (estado inicial) para o domínio Caixas:
// caixaVariavel, caixasOperacionais, pixDiversos, livroLRCDetalhe, reserva. Extraído do literal
// `const REG = {...}` de app.js na modularização (07/08/2026) — MESMOS valores, MESMA estrutura.
// IMPORTANTE: vira uma FUNÇÃO (não um objeto de topo) porque os valores dependem de VARS, avaliado
// no momento da CHAMADA — chamada em app.js no mesmo ponto exato onde os literais existiam, depois
// de VARS já estar populado (mesmo motivo de CARTAO_PLUGGY_MAPA_DEFAULT ser literal mas a linha
// derivada ficar em app.js). "Não alterar estrutura de dados consumida pelos módulos existentes" —
// os módulos de renderização/cálculo continuam lendo REG.caixaVariavel.*/REG.pixDiversos.* etc
// normalmente, sem nenhuma mudança de forma.
function criarRegCaixas(){
  return {
    caixaVariavel: {
      saldoReal: VARS.caixaVariavelSaldoReal,
      comprometido: VARS.caixaVariavelComprometido,
      disponivel: 0,          // DERIVADO em recalcularAgregadosDerivados() = saldoReal-comprometido. Nunca editar aqui.
      tetoOficial: VARS.tetoOficial,   // meta oficial (usada no Aporte=Meta-Saldo). NAO muda com a tolerancia temporaria.
      tolerenciaTemp: VARS.tolerenciaTemp, // V78 (18/07/2026): tolerancia temporaria ate o fim do ciclo (viagem familia Vanessa) - cobre TODOS os gastos da caixa, nao so os tageados como viagem. Recomposicao prevista: reembolso Wartsilia ou salario 25/07. Zerar este campo (0) quando a tolerancia acabar.
      pendenteProximoCiclo: VARS.caixaVariavelPendenteProximoCiclo, // NOVO 23/07/2026 (regra REGRA_LIMBO_FATURA_MB_CICLO): compras no Mastercard Black feitas depois do fechamento da fatura MB (dia 22) mas ainda dentro do ciclo financeiro atual (ate dia 25) - NAO contam no comprometido DESTE ciclo (a fatura so cobra no mes seguinte), ficam represadas aqui e sao pre-debitadas do orcamento da Caixa Variavel do PROXIMO ciclo na virada do dia 25.
    },
    caixasOperacionais: {
      boletos:            { saldo:VARS.caixaBoletos,            meta:4550.77 }, // META AUMENTADA 11/08/2026 (era 2600): consorcios Porto migraram do cartao p/ esta caixa, ver vars-operacional.js totalOpBoletos.
      pixVanessa:          { saldo:VARS.caixaPixVanessa,         meta:1200 },
      manutencao:          { saldo:VARS.caixaManutencao,         meta:2000 },
      eventos:             { saldo:VARS.caixaEventos,            meta:2000 },
      saudeFamilia:        { saldo:VARS.caixaSaudeFamilia,       meta:1600 },
      aniversarioJulio:    { saldo:VARS.caixaAniversarioJulio,   meta:400  },
      seguroEmplacamento:  { saldo:VARS.caixaSeguroEmplacamento, meta:5100 },
      bensDuraveis:        { saldo:VARS.caixaBensDuraveis,       meta:3000 },
      escolaJulio:         { saldo:VARS.escolaJulioSaldo,        meta:VARS.metaEscolaJulio },
      pixGeralVanessa:     { saldo:VARS.pixGeralVanessaSaldo,    meta:300  } // NOVO 07/08/2026: meta confirmada pelo usuário pro card CC-103 (antes "sem meta")
    }, // V134: todos os saldos agora leem do VARS (fonte unica) - antes eram literais duplicados aqui, em balanco.reservas e em escolaJulioSaldo separadamente, 3 copias que ja dessincronizaram nesta sessao.
    pixDiversos: { saidas: VARS.pixDiversosSaidas, entradas: VARS.pixDiversosEntradas, liquido: 0 },
    livroLRCDetalhe: { qtd: VARS.livroLRCQtdLancamentos, valor: VARS.livroLRC },
    // ===== FASE 3 (16/07/2026) - pagina Cenarios inteira + totais agregados dos livros razao =====
    reserva: {
      atual: VARS.reserva,
      piso: VARS.reservaPiso // "so o piso" - gasto minimo essencial, nao inclui aportes patrimoniais (conceito distinto de necessidadeTotalBruta)
    }
  };
}
