// MÓDULO: Onda 11 — mata de vez o palpite por calendário de aplicarBoletosVencidosAutomaticamente()
// (app.js, desligada nesta mesma onda). Pedido explícito do usuário (12/08/2026): "V1 já cobre isso
// sozinho, mate V1, não pode haver nada lá" - depois de o agente lançar 5 boletos de agosto em V2
// que já tinham sido "adivinhados" em V1 no mesmo boot, gerando duplicata real.
//
// Escopo: VARS.BOLETOS_TRANSACOES deixa de ser alimentado por palpite de vencimento e passa a
// refletir só o que está REALMENTE confirmado em `transacoes` (V2) para a Caixa Boletos - o mesmo
// dado que o agente já mantém correto via processo de triagem da Inbox (ver
// MANUAL_OPERACIONAL_AGENTES.md seção 2 regra 6). O array continua existindo porque ainda alimenta
// o índice de busca global (LIVRO_PARA_TAB_LR/'BOLETOS_TRANSACOES' → aba 'lrb', dashboard-navegacao.js)
// - só a FONTE do dado muda, de "acho que já venceu" pra "confirmei que pagou".
//
// O que isso NÃO faz: não mexe no saldo exibido (cxBoletosSaldo/balResBoletos/cxBoletosPct/Bar) -
// esses já são 100% V2 desde a Onda 1 (hydrate-onda1-v2.js), continuam inalterados. Também não mexe
// na tabela da aba LRB em si (onda8LrbRenderTabela) - essa mostra o CRONOGRAMA (schedule dos 9
// boletos fixos), não o extrato de pagamentos; são coisas diferentes, ver hydrate-onda8-cronograma-boletos.js.
//
// Rollback: comentar a chamada aplicarOnda11BoletosExtratoV2() em app.js - VARS.BOLETOS_TRANSACOES
// volta a ficar só com o literal local (vars-caixas.js), igual antes desta Onda (sem o auto-crédito
// V1, que já está desligado separadamente).

async function aplicarOnda11BoletosExtratoV2(){
  let extratoV2;
  try {
    extratoV2 = await WallaceFinanceService.getExtratoCaixaBoletos();
  } catch(err){
    console.error('Onda11BoletosExtratoV2: falha ao buscar extrato da Caixa Boletos - mantendo o array V1 local (baixo risco, só afeta o índice de busca).', err);
    window.WALLACE_ONDA11_BOLETOS_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(extratoV2)){
    console.warn('Onda11BoletosExtratoV2: resposta inesperada - mantendo o array V1 local.');
    window.WALLACE_ONDA11_BOLETOS_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const v1Qtd = VARS.BOLETOS_TRANSACOES.length;

  VARS.BOLETOS_TRANSACOES = extratoV2.map(t => ({
    tx: t.tx_legado || null,
    data: (t.data || '').split('-').reverse().slice(0,2).join('/'), // 2026-08-10 -> 10/08
    nome: t.descricao,
    tipo: t.tipo === 'entrada' ? 'Entrada' : 'Saída',
    valor: Number(t.valor),
  }));

  if(typeof calcularSaldoCaixa === 'function'){
    VARS.caixaBoletos = calcularSaldoCaixa(VARS.BOLETOS_SALDO_INICIAL, VARS.BOLETOS_TRANSACOES);
  }
  if(typeof construirIndiceTransacoesBusca === 'function'){
    _buscaGlobalIndiceTransacoes = null; // força reconstrução do índice de busca com o dado novo
  }

  console.log(`Onda11BoletosExtratoV2: extrato da Caixa Boletos agora vem 100% da V2 (${extratoV2.length} lançamentos confirmados; array V1 antigo tinha ${v1Qtd} itens fixos/palpitados).`);
  window.WALLACE_ONDA11_BOLETOS_RELATORIO = { qtdV1: v1Qtd, qtdV2: extratoV2.length, exibindo: 'V2' };
}
