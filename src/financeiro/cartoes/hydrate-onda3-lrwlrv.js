// MÓDULO: Onda 3, prioridade 2 — LRW/LRV (compromisso de cartão por pessoa) lendo V2 (08/08/2026).
//
// CORRIGIDO 12/08/2026 (achado do usuário, madrugada de reconciliação: "as abas dos LR estão
// erradas" — card mbLRW mostrando R$1.213,76, mas a auditoria/REG.mbDetalhe.wallace, reconciliado
// linha a linha contra a fatura REAL do Bradesco nesta mesma sessão, apurou R$2.027,89. Dois
// números diferentes pro mesmo conceito, um sobrescrevendo o outro sem aviso). Causa: esta função
// buscava vw_compromisso_cartao_por_pessoa (agregação de `transacoes` com cartao_id preenchido) e
// SOBRESCREVIA o texto do card mbLRW/mbLRV direto no DOM, por cima do valor já reconciliado. A view
// tem gaps conhecidos e documentados (Parte B, PLANO_UNIFICACAO_V1_V2.md seção 21: 5 linhas sem
// usuario_id ficam de fora) — não é confiável o bastante pra ser a fonte do headline. A fatura real
// (reconciliação manual, VARS.mbLRWConfirmado/mbLRVConfirmado) é mais precisa. Não sobrescreve mais
// o card — só a lista detalhada abaixo continua vindo da V2 (transparência linha a linha, mesmo que
// a soma dela não bata 100% com o card por causa dos gaps documentados).
//
// Rollback: comentar a chamada aplicarOnda3LrwLrv() em app.js.

const ONDA3_LRWLRV_MAPA = [
  { usuarioNome: 'Wallace', getValorV1: () => VARS.mbLRWConfirmado },
  { usuarioNome: 'Vanessa', getValorV1: () => VARS.mbLRVConfirmado },
];

async function aplicarOnda3LrwLrv(){
  // CORRIGIDO 14/08/2026 (auditoria de performance): a lista detalhada (aplicarOnda3LrwLrvListaDetalhada,
  // mais abaixo) só é chamada DEPOIS deste bloco terminar, mas a view que ela busca
  // (vw_transacoes_cartao_variavel_por_pessoa) não depende em nada do resultado de
  // vw_compromisso_cartao_por_pessoa buscado logo abaixo — são 2 fetches independentes que rodavam
  // em série. Disparado aqui, ANTES do primeiro await, sai baixando em paralelo; .catch vazio só
  // pra não gerar "unhandled rejection" nos 2 caminhos de erro/formato inesperado logo abaixo (o
  // catch de verdade continua isolado dentro de aplicarOnda3LrwLrvListaDetalhada, mais abaixo).
  const promessaDetalhe = WallaceFinanceService.getTransacoesCartaoVariavelDetalhe();
  promessaDetalhe.catch(function(){});
  let compromissos;
  try {
    compromissos = await WallaceFinanceService.getCompromissoCartaoPorPessoa();
  } catch(err){
    console.error('Onda3LrwLrv: falha ao buscar vw_compromisso_cartao_por_pessoa (só usada pra log/diagnóstico agora, card não depende mais disso).', err);
    window.WALLACE_ONDA3_LRWLRV_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return aplicarOnda3LrwLrvListaDetalhada(promessaDetalhe);
  }
  if(!Array.isArray(compromissos)){
    console.warn('Onda3LrwLrv: resposta inesperada de vw_compromisso_cartao_por_pessoa (só log/diagnóstico agora).');
    window.WALLACE_ONDA3_LRWLRV_RELATORIO = { status: 'sem_dado_v2' };
    return aplicarOnda3LrwLrvListaDetalhada(promessaDetalhe);
  }
  // Não sobrescreve mais mbLRW/mbLRV no DOM (ver comentário no topo do arquivo) — só loga a
  // divergência pra quem quiser investigar depois, o card confia na reconciliação manual.
  const relatorio = [];
  ONDA3_LRWLRV_MAPA.forEach(({usuarioNome, getValorV1}) => {
    const linha = compromissos.find(c => c.usuario_nome === usuarioNome);
    if(!linha){
      relatorio.push({ usuario: usuarioNome, status: 'sem_dado_v2' });
      return;
    }
    let valorV1;
    try { valorV1 = Math.round(getValorV1() * 100) / 100; }
    catch(err){ valorV1 = null; }
    const valorV2 = Math.round(Number(linha.total_comprometido) * 100) / 100;
    const diverge = valorV1 === null || Math.abs(valorV1 - valorV2) > 0.01;
    const diferenca = valorV1 !== null ? Math.round((valorV1 - valorV2)*100)/100 : null;

    if(diverge){
      console.log(`Onda3LrwLrv [${usuarioNome}]: reconciliação manual=${valorV1!==null?fmt(valorV1):'?'} × view vw_compromisso_cartao_por_pessoa=${fmt(valorV2)} — diferem${diferenca!==null?' em R$'+Math.abs(diferenca).toFixed(2):''} (esperado, view tem gaps conhecidos — Parte B, PLANO_UNIFICACAO_V1_V2.md seção 21). Card mostra a reconciliação manual.`);
    }
    relatorio.push({ usuario: usuarioNome, reconciliacaoManual: valorV1, viewV2: valorV2, qtdV2: linha.qtd_transacoes, diverge, diferenca });
  });
  window.WALLACE_ONDA3_LRWLRV_RELATORIO = relatorio;

  return aplicarOnda3LrwLrvListaDetalhada(promessaDetalhe);
}

async function aplicarOnda3LrwLrvListaDetalhada(promessaDetalhe){

  // NOVO 11/08/2026 (achado do usuário, print real: lista detalhada de lançamentos com total
  // diferente do card acima — R$1.318,19/R$376,64 na lista vs R$972,98/R$245,84 aqui): a lista
  // detalhada (VARS.LRW_TRANSACOES/LRV_TRANSACOES, renderizada por renderLivrosVariaveis()) era um
  // array V1 mantido à mão no código, nunca migrado. Substitui pela mesma fonte V2 já usada acima
  // (mesmo filtro exato), pra lista e card nunca mais divergirem — um só lê o outro escreve, nunca 2
  // fontes independentes pra mesma coisa.
  try {
    const detalhe = await promessaDetalhe;
    if(Array.isArray(detalhe)){
      const mapear = nome => detalhe
        .filter(l => l.usuario_nome === nome)
        .map(l => ({
          tx: l.tx_legado || '—',
          data: l.data ? l.data.slice(0,10).split('-').reverse().join('/') : '—',
          nome: l.descricao || '',
          valor: Math.round(Number(l.valor)*100)/100,
        }));
      VARS.LRW_TRANSACOES = mapear('Wallace');
      VARS.LRV_TRANSACOES = mapear('Vanessa');
      // CORRIGIDO 12/08/2026 (achado do usuário: "faltou na lista os do limbo") — a view
      // vw_transacoes_cartao_variavel_por_pessoa filtra data >= ciclo_inicio_em (25/07),
      // corretamente por design (REGRA_LIMBO_FATURA_MB_CICLO), mas isso apaga da lista os 2
      // lançamentos do limbo (22-24/07) que SÃO do ciclo atual — eles só não têm data >= 25/07
      // porque a fatura fechou antes. Sem isso, TX000132/TX000154 (que já existem como literal
      // fixo em vars-mercado-pago.js) sumiam da lista toda vez que a Onda 3 recarregava.
      // CORRIGIDO 15/08/2026 (achado do usuário: "não tá correto a data e a posição" — o .unshift()
      // colocava o item sempre no topo/posição 0, aparecendo como se fosse a compra mais recente,
      // mesmo sendo a data mais antiga do ciclo — 22/07, antes de tudo que já vem ordenado data.asc
      // da view acima). Troca unshift() por inserção na posição cronológica correta.
      const onda3InserirNaPosicaoCronologica = (lista, item) => {
        if(lista.some(t => t.tx === item.tx)) return;
        const chaveData = d => { const [dd, mm] = (d || '').split('/').map(Number); return (mm || 0) * 100 + (dd || 0); };
        const chaveItem = chaveData(item.data);
        const idx = lista.findIndex(t => chaveData(t.data) > chaveItem);
        if(idx === -1) lista.push(item); else lista.splice(idx, 0, item);
      };
      onda3InserirNaPosicaoCronologica(VARS.LRW_TRANSACOES, { tx:'TX000132', data:'22/07', nome:'App de alinhamento solar (Google SunSurveyor) — limbo (pós-fechamento fatura)', valor:56.99 });
      onda3InserirNaPosicaoCronologica(VARS.LRV_TRANSACOES, { tx:'TX000154', data:'24/07', nome:'H57Store (cartão 6351) — limbo (pós-fechamento fatura)', valor:30.97 });
      if(typeof renderLivrosVariaveis === 'function') renderLivrosVariaveis();
      // CORRIGIDO 12/08/2026 (achado do usuário: botão da aba "LRV - Vanessa (16)" não batia com a
      // tabela real embaixo, 6 linhas) — renderLivrosVariaveis() acima redesenha a tabela, mas o
      // contador do botão (atualizarContadoresAbasLR(), que conta <tr> do DOM) só rodava 1x no boot,
      // antes desta atualização assíncrona substituir o array V1 pelo V2. Sem re-chamar aqui, o botão
      // ficava preso na contagem antiga pra sempre, mesmo com a tabela certa. Mesmo padrão que faltava
      // em aplicarOnda10LrcLimbo() — corrigido junto.
      if(typeof atualizarContadoresAbasLR === 'function') atualizarContadoresAbasLR();
      // Sucesso confirmado contra a V2 nesta carga — apaga o aviso de fallback, se estava aceso de
      // uma tentativa anterior (12/08/2026, auditoria: fallback não podia ficar "grudado" na tela).
      exibirAvisoFallbackLrwLrv(false);
    } else {
      console.warn('Onda3LrwLrv: resposta inesperada de vw_transacoes_cartao_variavel_por_pessoa — lista detalhada de LRW/LRV mantida em V1 (pode divergir do card acima).');
      exibirAvisoFallbackLrwLrv(true);
    }
  } catch(err){
    console.error('Onda3LrwLrv: falha ao buscar vw_transacoes_cartao_variavel_por_pessoa — lista detalhada de LRW/LRV mantida em V1 (pode divergir do card acima).', err);
    exibirAvisoFallbackLrwLrv(true);
  }
}

// 12/08/2026 (auditoria: fallback V2→V1 silencioso, usuário não abre o console) — liga/desliga o
// callout de aviso nas abas LRW/LRV. Só aparece quando o fallback realmente acontece (erro/formato
// inesperado); some sozinho assim que uma carga seguinte tiver sucesso.
function exibirAvisoFallbackLrwLrv(mostrar){
  ['legLRWFallbackAviso', 'legLRVFallbackAviso'].forEach(id => {
    const el = $(id);
    if(el) el.style.display = mostrar ? '' : 'none';
  });
}
