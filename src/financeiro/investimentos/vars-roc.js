// MODULO: criarVarsROC() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsROC(){
  return {
  // NOVO 31/07/2026 (V212): Opções vendidas (puts) na conta BTG - informativo, NÃO É PERDA REALIZADA.
  // R$-108,00 é o valor de mercado para recomprar/encerrar as posições agora, não o resultado final.
  // Estratégia do usuário: deixar vencer. Se PETR4 > R$36,86 e ITUB4 > R$41,82 em 21/08/2026, as puts
  // "viram pó" e o prêmio recebido na venda fica todo como lucro. Não soma no patrimônio líquido -
  // é só uma obrigação em aberto até o vencimento (21/08/2026).
  // NOVO 31/07/2026 (V222): opcoesVendidasValorMercado deixou de ser numero fixo - agora deriva
  // sempre da soma de VARS.opcoesVendidasDetalhe (ver bloco de derivados apos o VARS fechar). Mesmo
  // padrao ja aplicado em todas as outras caixas - evita o mesmo bug de "total desatualizado" que
  // ja aconteceu varias vezes neste sistema.
  opcoesVendidasValorMercado: 0, // PLACEHOLDER - sobrescrito pelo calculo derivado logo abaixo do VARS
  // NOVO 03/08/2026 (Módulo 17 - ROC): parâmetro externo, não deriva de nenhuma TX interna - precisa
  // ser atualizado manualmente de tempos em tempos (mesmo tratamento das tarifas ANEEL, cotações
  // Ipiranga, etc: input de mercado, documentado, nunca forçado a bater com nada do sistema).
  // Fonte: Meelion/B3, Taxa DI de 31/07/2026 = 14,15% a.a. -> ~1,10% a.m. equivalente. Atualizar aqui
  // quando o COPOM mexer no Selic/CDI (a cada ~45 dias) ou quando o usuário informar valor mais recente.
  CDI_MENSAL_ATUAL: 1.10, // % ao mês (referência 31/07/2026)
  CDI_MENSAL_ATUAL_DATA_REF: '31/07/2026',
  // Limites de classificação de status do ROC (Módulo 17, seção "Status") - parametrizados, editáveis.
  ROC_STATUS_LIMITES: { boaAte: 2.0, muitoBoaAte: 4.0 }, // < CDI = Fraca; CDI-boaAte = Boa; boaAte-muitoBoaAte = Muito Boa; > muitoBoaAte = Excelente
  opcoesVendidasDetalhe: [
    // CORRIGIDO 01/08/2026 (notas de corretagem reais, BTG/Necton): premioRecebido JA ERA o valor
    // LIQUIDO (campo "Liquido para [data]" da nota) - nao o bruto. Adicionado premioBruto (= Valor
    // Operacao da nota, quantidade x preco) e custoOperacional real (soma de: taxa liquidacao/CCP +
    // taxa de registro + emolumentos + clearing + ISS), conferido nota a nota: bruto - custo = liquido
    // bate exato nos 3 casos (testado via harness Node antes de subir). Nunca mais confundir - o
    // "Premio recebido" que ja existia sempre foi o liquido de fato creditado na conta.
    { ticker: 'PETRT379', ativo: 'PETR4', tipo: 'Put vendida', valorMercado: -10.00, precoExercicio: 36.86, vencimento: '21/08/2026', quantidade: -200, premioBruto: 160.00, custoOperacional: 5.16, premioRecebido: 154.84, precoMedio: 0.7742, cotacaoAtual: 0.05, resultadoDiario: 6.00, resultadoHistorico: 144.84, precoBlackScholes: null, notaCorretagem: '32928176 (03/07/2026)', exercida: false, statusPosicao: 'ATIVA' },
    // CORRIGIDO 03/08/2026 (pedido do usuario): strike confirmado como 36,86 - mesmo strike de
    // PETRT379 (ambas PETR4, o usuario confirmou que sao o mesmo valor pras duas opcoes da Petrobras).
    // Antes: null (pendencia aberta desde V222, ver passagem de turno parte 5). Agora entra na soma
    // consolidada do ROC (Modulo 17) e no capital travado, deixando de ser excluida da carteira.
    { ticker: 'PETRS368W5', ativo: 'PETR4', tipo: 'Put vendida', valorMercado: -1.00, precoExercicio: 36.86, vencimento: '31/07/2026', quantidade: -100, premioBruto: 45.00, custoOperacional: 5.03, premioRecebido: 39.97, precoMedio: 0.3997, cotacaoAtual: 0.01, resultadoDiario: 0.00, resultadoHistorico: 38.97, precoBlackScholes: 0.00, notaCorretagem: '32757842 (25/06/2026)', exercida: false, statusPosicao: 'ENCERRADA' },
    { ticker: 'ITUBT424', ativo: 'ITUB4', tipo: 'Put vendida', valorMercado: -98.00, precoExercicio: 41.82, vencimento: '21/08/2026', quantidade: -200, premioBruto: 180.00, custoOperacional: 2.96, premioRecebido: 177.04, precoMedio: 0.8852, cotacaoAtual: 0.49, resultadoDiario: 60.00, resultadoHistorico: 79.04, precoBlackScholes: 0.33, notaCorretagem: '33025429 (09/07/2026)', exercida: false },
  ],
  // NOVO 03/08/2026 (pedido do usuario, opcao A): "exercida" e um campo MANUAL, igual precoExercicio -
  // o sistema nao tem como saber sozinho se uma put vencida foi de fato exercida pela contraparte
  // (isso so aparece na nota de corretagem/extrato da B3, dias depois do vencimento). Default false
  // (assume "virou po"/expirou OTM, o caso normal). Quando o usuario confirmar via nota que uma
  // posicao vencida foi exercida, troca pra true aqui - a linha se move sozinha pra tabela "Posições
  // exercidas" (mesmo padrao automatico ja usado pra o.vencida, nao precisa mexer em HTML nenhum).
  // CORRIGIDO 31/07/2026 (V222): terceira posição encontrada - PETRS368W5 (100un, vencimento 31/07,
  // hoje mesmo) que eu não tinha registrado. E PETRT379 tinha valor ERRADO (R$180,00, deduzido de
  // outro print) - o print direto da corretora mostra preço médio R$0,7742 × 200un = R$154,84,
  // batendo exato com "Valor investido -R$154,84". Todos os 3 confirmados agora via print direto:
  // PETRT379 R$154,84 + PETRS368W5 R$39,97 + ITUBT424 R$177,04 = R$371,85 total de prêmios.
  // Valor de mercado agregado recalculado: -R$10,00 + -R$1,00 + -R$98,00 = -R$109,00.
  };
}
