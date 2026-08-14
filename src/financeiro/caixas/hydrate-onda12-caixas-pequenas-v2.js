// MÓDULO: Onda 12 — as 5 caixas pequenas que faltavam depois da Onda 11 (12/08/2026, auditoria de
// eliminação de dependência de V1): Caixa Lance, Caixa Bens Duráveis, Caixa Churrasco, PIX Vanessa
// e Caixa Mastercard/Infinite. Nas 4 primeiras, o NÚMERO do saldo (card/linha do Balanço) já era V2
// desde a Onda 1/2/3 (hydrate-onda1-v2.js/hydrate-onda2-v2.js/hydrate-onda3-caixalance.js) — só a
// LISTA de lançamentos por baixo (VARS.CAIXA_LANCE_TRANSACOES etc, usada pela aba correspondente do
// Livro Razão) continuava vindo do literal fixo de vars-caixas.js, igual ao bug já corrigido em
// LRC_LIMBO/LRW/LRV (card mostra V2, tabela por baixo mostra V1, os dois nunca batiam).
//
// SEGURANÇA (checado por SQL antes de escrever este arquivo, não suposto): pra cada uma das 5, a
// soma das transações confirmadas de `transacoes` (mesmo filtro que vw_saldo_v2_por_caixa usa —
// status=confirmado + afeta_saldo_real + ciclo_inicio_em) bate EXATO com o v2_saldo_calculado já
// exibido hoje na tela (a mesma fonte, não é coincidência): Caixa Lance R$2.591,96, Bens Duráveis
// -R$583,99, Churrasco -R$108,63, PIX Vanessa R$2,88, Mastercard/Infinite R$0,00. Migrar a lista
// não muda nenhum número já visível — só faz a tabela detalhada bater com o card que já é V2.
//
// Reaproveita WallaceFinanceService.getTransacoesComposicaoSaldoCaixa(nomeCaixa) (12/08/2026, tooltip
// de composição) em vez de escrever fetch novo — já replica exatamente o filtro da view (mesmo
// comentário do arquivo original: "se este filtro divergir do da view, a lista não bate com o
// número do card"), então não corre risco de reintroduzir a mesma classe de bug que motivou esta Onda.
//
// Rollback: comentar a chamada aplicarOnda12CaixasPequenasV2() em app.js — os 5 arrays voltam a ser
// só o literal de vars-caixas.js, igual antes desta Onda.

const ONDA12_CAIXAS_MAPA = [
  { caixaNome: 'Caixa Lance', varArr: 'CAIXA_LANCE_TRANSACOES', varSaldo: 'caixaLance', saldoInicial: () => VARS.CAIXA_LANCE_SALDO_INICIAL_CICLO },
  { caixaNome: 'Caixa Bens Duráveis', varArr: 'BENS_DURAVEIS_TRANSACOES', varSaldo: 'caixaBensDuraveis', saldoInicial: () => VARS.BENS_DURAVEIS_SALDO_INICIAL },
  { caixaNome: 'Caixa Churrasco', varArr: 'CHURRASCO_TRANSACOES', varSaldo: 'caixaChurrasco', saldoInicial: () => VARS.CHURRASCO_SALDO_INICIAL },
  { caixaNome: 'PIX Vanessa', varArr: 'PV_TRANSACOES', varSaldo: 'caixaPixVanessa', saldoInicial: () => VARS.PV_SALDO_INICIAL },
  { caixaNome: 'Caixa Mastercard_Infinite', varArr: 'MASTERCARD_INFINITE_TRANSACOES', varSaldo: 'caixaMastercardInfinite', saldoInicial: () => VARS.MASTERCARD_INFINITE_SALDO_INICIAL },
];

async function aplicarOnda12CaixasPequenasV2(){
  // CORRIGIDO 14/08/2026 (achado real, auditoria de lag do boot): as 5 caixas eram buscadas num
  // `for` sequencial, uma esperando a outra terminar (5 round-trips ao Supabase em série, ~0,75-
  // 1,5s). São completamente independentes entre si (cada uma só mexe em VARS[cfg.varArr]/
  // VARS[cfg.varSaldo] próprios) — Promise.all dispara as 5 juntas; o try/catch por caixa foi
  // preservado dentro de cada callback (mesmo padrão já usado na FASE 2F de promocoes-financeengine.js).
  //
  // CORRIGIDO 14/08/2026 (consolidação de boot): as 5 chamadas em paralelo acima ainda eram 5
  // round-trips HTTP distintos (paralelos, mas 5 conexões). getComposicaoCaixasBatch() (app.js) busca
  // as 5 numa única chamada via RPC rpc_composicao_saldo_caixas_batch (supabase/migrations/), com
  // fallback automático e transparente pras 5 chamadas individuais se a RPC ainda não estiver
  // aplicada no banco — nenhuma mudança de shape aqui, cada `composicaoBatch[cfg.caixaNome]` é
  // idêntico ao que getTransacoesComposicaoSaldoCaixa(cfg.caixaNome) já devolvia por caixa.
  const composicaoBatch = await WallaceFinanceService.getComposicaoCaixasBatch(ONDA12_CAIXAS_MAPA.map(cfg => cfg.caixaNome));
  const relatorio = await Promise.all(ONDA12_CAIXAS_MAPA.map(async (cfg) => {
    try {
      const composicao = composicaoBatch[cfg.caixaNome];
      const linhas = composicao && composicao.linhas;
      if(!Array.isArray(linhas)){
        console.warn(`Onda12CaixasPequenasV2: resposta inesperada pra "${cfg.caixaNome}" — mantendo array V1.`);
        return { caixa: cfg.caixaNome, status: 'sem_dado_v2' };
      }
      const v1Qtd = VARS[cfg.varArr].length;
      // linhas vem order=data.desc,created_at.desc (mais recente primeiro) — os arrays V1 sempre
      // foram cronológicos (mais antigo primeiro), mesma ordem que a aba do Livro Razão já mostrava.
      VARS[cfg.varArr] = linhas.map(t => ({
        tx: t.tx_legado || '—',
        data: (t.data || '').split('-').reverse().slice(0,2).join('/'), // 2026-08-10 -> 10/08
        nome: t.descricao || '',
        tipo: t.tipo === 'entrada' ? 'Entrada' : 'Saída',
        valor: Number(t.valor),
      })).reverse();
      if(typeof calcularSaldoCaixa === 'function'){
        VARS[cfg.varSaldo] = calcularSaldoCaixa(cfg.saldoInicial(), VARS[cfg.varArr]);
      }
      console.log(`Onda12CaixasPequenasV2 [${cfg.caixaNome}]: lista agora vem 100% da V2 (${linhas.length} lançamentos; V1 tinha ${v1Qtd} itens fixos).`);
      return { caixa: cfg.caixaNome, qtdV1: v1Qtd, qtdV2: linhas.length, saldoV2: VARS[cfg.varSaldo], exibindo: 'V2' };
    } catch(err){
      console.error(`Onda12CaixasPequenasV2: falha ao buscar "${cfg.caixaNome}" — mantendo array V1 local.`, err);
      return { caixa: cfg.caixaNome, status: 'erro_v2', erro: String(err) };
    }
  }));
  // Índice de busca global (mesmo cuidado da Onda 11 — LR simples entra na busca por VARS[arr]).
  // NOTA: `_buscaGlobalIndiceTransacoes` é `let` de escopo de módulo clássico (dashboard-navegacao.js)
  // — window._buscaGlobalIndiceTransacoes NÃO seria o mesmo binding, por isso a referência direta
  // (mesmo padrão já usado em hydrate-onda11-boletos-extrato-v2.js).
  if(typeof _buscaGlobalIndiceTransacoes !== 'undefined') _buscaGlobalIndiceTransacoes = null;
  if(typeof renderLivrosVariaveis === 'function') renderLivrosVariaveis();
  if(typeof atualizarContadoresAbasLR === 'function') atualizarContadoresAbasLR();
  window.WALLACE_ONDA12_CAIXAS_PEQUENAS_RELATORIO = relatorio;
  console.log('Onda12CaixasPequenasV2: relatório completo em window.WALLACE_ONDA12_CAIXAS_PEQUENAS_RELATORIO', relatorio);
}
