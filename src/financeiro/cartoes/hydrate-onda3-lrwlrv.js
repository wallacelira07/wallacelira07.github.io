// MÓDULO: Onda 3, prioridade 2 — LRW/LRV (compromisso de cartão por pessoa) lendo V2 (08/08/2026).
// Reproduz VARS.mbLRWConfirmado/mbLRVConfirmado (ids DOM mbLRW/mbLRV, hydrate-visa-mb.js) usando
// vw_compromisso_cartao_por_pessoa — agregação pura de `transacoes` (Caixa Variável,
// afeta_saldo_real=false) já existentes, nenhuma modelagem de domínio nova.
//
// Divergência conhecida e documentada (Parte B, PLANO_UNIFICACAO_V1_V2.md seção 21): 5 linhas
// (TX000200/203/204/205/206) são colisões de tx_legado com eventos históricos não relacionados —
// nunca tiveram usuario_id preenchido (corretamente, não são compras de cartão de ninguém) e por
// isso ficam de fora da soma V2 naturalmente (JOIN com usuarios exclui). Essa é a causa raiz de
// TODA a diferença V1×V2 aqui — aceita pela regra de 08/08/2026 (divergência documentada não
// bloqueia). Roda DEPOIS de hydrateVisaMB() (V1), só sobrescreve em caso de sucesso.
//
// Rollback: comentar a chamada aplicarOnda3LrwLrv() em app.js.

const ONDA3_LRWLRV_MAPA = [
  { idHtml: 'mbLRW', usuarioNome: 'Wallace', getValorV1: () => VARS.mbLRWConfirmado },
  { idHtml: 'mbLRV', usuarioNome: 'Vanessa', getValorV1: () => VARS.mbLRVConfirmado },
];

async function aplicarOnda3LrwLrv(){
  let compromissos;
  try {
    compromissos = await WallaceFinanceService.getCompromissoCartaoPorPessoa();
  } catch(err){
    console.error('Onda3LrwLrv: falha ao buscar vw_compromisso_cartao_por_pessoa — mantendo V1 (fallback automático).', err);
    return;
  }
  if(!Array.isArray(compromissos)){
    console.warn('Onda3LrwLrv: resposta inesperada — mantendo V1.');
    return;
  }
  const relatorio = [];
  ONDA3_LRWLRV_MAPA.forEach(({idHtml, usuarioNome, getValorV1}) => {
    const linha = compromissos.find(c => c.usuario_nome === usuarioNome);
    if(!linha){
      console.warn(`Onda3LrwLrv: "${usuarioNome}" ausente em vw_compromisso_cartao_por_pessoa — mantendo V1.`);
      relatorio.push({ usuario: usuarioNome, status: 'sem_dado_v2', fonte: 'V1 (fallback)' });
      return;
    }
    let valorV1;
    try { valorV1 = Math.round(getValorV1() * 100) / 100; }
    catch(err){ console.warn(`Onda3LrwLrv: falha ao ler valor V1 de referência pra "${usuarioNome}".`, err); valorV1 = null; }
    const valorV2 = Math.round(Number(linha.total_comprometido) * 100) / 100;
    const diverge = valorV1 === null || Math.abs(valorV1 - valorV2) > 0.01;
    const diferenca = valorV1 !== null ? Math.round((valorV1 - valorV2)*100)/100 : null;

    if(diverge){
      console.warn(`Onda3LrwLrv [${usuarioNome}]: V1=${valorV1!==null?fmt(valorV1):'?'} × V2=${fmt(valorV2)} — DIVERGE${diferenca!==null?' R$'+Math.abs(diferenca).toFixed(2):''}. Causa conhecida: colisão de tx_legado (Parte B, 5 linhas sem usuario_id) — aceita, exibindo V2 mesmo assim.`);
    } else {
      console.log(`Onda3LrwLrv [${usuarioNome}]: V1×V2 batem (${fmt(valorV2)}).`);
    }
    relatorio.push({ usuario: usuarioNome, v1: valorV1, v2: valorV2, qtdV2: linha.qtd_transacoes, diverge, diferenca, exibindo: 'V2' });

    const el = $(idHtml);
    if(!el){ console.warn(`Onda3LrwLrv: id "${idHtml}" não encontrado no DOM, ignorado.`); return; }
    el.textContent = fmt(valorV2);
  });
  window.WALLACE_ONDA3_LRWLRV_RELATORIO = relatorio;
  console.log('Onda3LrwLrv: relatório completo em window.WALLACE_ONDA3_LRWLRV_RELATORIO', relatorio);
}
