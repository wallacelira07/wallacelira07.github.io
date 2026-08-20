// MÓDULO: Onda 3, prioridade 2 — LRW/LRV (compromisso de cartão por pessoa) lendo V2 (08/08/2026).
//
// CORRIGIDO 15/08/2026 (pedido explícito do usuário: "isso é pra ser automático, não pode ser
// manual"): card mbLRW/mbLRV deixa de ler VARS.mbLRWConfirmado/mbLRVConfirmado como número
// reconciliado à mão contra a fatura real — passa a ser SEMPRE a soma da própria lista detalhada
// (aplicarOnda3LrwLrvListaDetalhada, mais abaixo), o mesmo padrão já usado em livroLRC (Onda 10) e
// mbLRRConfirmado (Onda 9). Card e lista nunca mais divergem, nunca mais fica número velho esperando
// conferência manual. Trade-off aceito explicitamente pelo usuário: perde a função de "checagem
// contra a fatura real do banco" que o número manual tinha (não existia nenhum alerta automático
// ligado a essa divergência mesmo antes — mbNaoReconciliado sempre foi um literal fixo em 0, nunca
// calculado de verdade — então nada de segurança ativa está sendo removido aqui).
//
// Histórico anterior (12/08/2026, revertido nesta correção): card mbLRW mostrando R$1.213,76 vs
// reconciliação manual R$2.027,89 — na época, a decisão foi manter o número manual como fonte porque
// a view tinha lacunas reais (transações do Mastercard Black sem usuario_id preenchido, ficavam
// invisíveis tanto no card quanto na lista). Essas lacunas foram investigadas e resolvidas 1 a 1 em
// 15/08 (2 transações identificadas e atribuídas à Vanessa; as demais já eram Recorrências,
// contabilizadas à parte em cronograma_recorrencias) — a lista deixou de ter motivo pra ser menos
// confiável que o número digitado à mão.
//
// Rollback: comentar a chamada aplicarOnda3LrwLrv() em app.js.
//
// CORRIGIDO 20/08/2026 (achado da investigação definitiva do "Não Reconciliado" MB): mbLRWConfirmado/
// mbLRVConfirmado eram literalmente a soma de TODA a Caixa Variável (vw_transacoes_cartao_variavel_
// por_pessoa não filtra por bandeira de cartão, mistura Visa+MB de propósito — comentário original da
// view). Isso inflava o "Não Reconciliado" do Mastercard Black em R$317,47 (3 compras reais do Wallace
// no Visa Infinite — TOKIO MARINE seguro auto, IOF rotativo, Anthropic mistaggeada — confirmadas contra
// a fatura real do MB, que não contém nenhuma delas). Cópia local da lista de cartões MB (não importa
// MB_CARTOES_IDS de hydrate-visa-mb.js de propósito — os 2 arquivos carregam em paralelo via
// __carregarScriptsParalelo, sem ordem garantida entre si; manter uma cópia aqui evita depender de qual
// terminou primeiro). Se um cartão MB novo for cadastrado, atualizar as DUAS listas juntas.
const ONDA3_MB_CARTOES_IDS = ['7b981bf6-80eb-473b-8cf5-91a75c4d0cd3','5774ffd5-fa19-47af-affc-761d6b880a88','00098251-b7d1-475c-9ec3-ee5462202082','2bd91561-e1dc-4073-8e8a-b0037b5bb4bf','6cec9fa0-ad3c-4fd1-87e0-52d3e0325b09','7c53205f-d2f1-450b-aea3-10d25b0b9b45','242e0499-a6ff-45b4-a4aa-4579e9b151ec','7b0adfe8-182f-455a-a633-30995fba7e67','02803dbe-0dd1-4720-a6a0-56e1037fe854','cdb6c357-6630-46f6-984f-608973d521f8','1d6d3284-95d5-44f0-bff5-5684f9068e76'];

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
  // NOVO 19/08/2026: mapa cartao_id->final, usado por renderLivrosVariaveis() (coluna Origem em
  // TODOS os LRs). Dispara em paralelo, mesmo padrão acima — .catch vazio, cai no fallback
  // genérico "💳 cartão" se falhar, nunca quebra a renderização por causa disso.
  WallaceFinanceService.getCartoesMapa().then(m => { window.__wallaceCartoesMapa = m; }).catch(function(){});
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
  // CORRIGIDO 15/08/2026: card não lê mais valor manual (ver comentário no topo do arquivo) — este
  // bloco vira só um diagnóstico cruzado (esta view × a lista que vai recalcular o card logo abaixo,
  // em aplicarOnda3LrwLrvListaDetalhada), útil pra pegar divergência entre as 2 fontes V2 diferentes
  // sem travar nada. valorV1/reconciliacaoManual no relatório abaixo mantêm o nome por compatibilidade
  // com quem já lê window.WALLACE_ONDA3_LRWLRV_RELATORIO, mas agora é "VARS.mbLRWConfirmado no
  // momento deste fetch" (ainda o valor da carga anterior — a atualização de verdade só acontece
  // depois, na lista), não mais reconciliação manual de fato.
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
      console.log(`Onda3LrwLrv [${usuarioNome}]: valor anterior=${valorV1!==null?fmt(valorV1):'?'} × view vw_compromisso_cartao_por_pessoa=${fmt(valorV2)} — diferem${diferenca!==null?' em R$'+Math.abs(diferenca).toFixed(2):''} (só diagnóstico, o card é recalculado a partir da lista logo abaixo).`);
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
        .filter(l => l.usuario_nome === nome && ONDA3_MB_CARTOES_IDS.includes(l.cartao_id))
        .map(l => ({
          tx: l.tx_legado || '—',
          data: l.data ? l.data.slice(0,10).split('-').reverse().join('/') : '—',
          nome: l.descricao || '',
          valor: Math.round(Number(l.valor)*100)/100,
          cartaoId: l.cartao_id || null, // NOVO 19/08/2026: coluna Origem (ver render-livros-variaveis.js)
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
      // CORRIGIDO 20/08/2026 (achado do usuário, print real: coluna Origem vazia + data sem ano +
      // linha "torta" nessas 2 exceções do limbo): faltava `cartaoId` nesses 2 objetos hand-coded —
      // todo outro item da lista vem de `mapear()` acima e sempre tem `cartaoId` (linha 104), então
      // `linha()` (render-livros-variaveis.js) sempre desenha a célula de Origem pra eles. Sem
      // `cartaoId`, a linha vinha com 1 <td> a menos que o cabeçalho (5 colunas), empurrando Valor
      // pra esquerda — não era só cosmético, a tabela ficava com número de células errado. Cartões
      // reais confirmados pela fatura real (bloco 31, ESTADO_ATUAL.md): TX000132 = cartão 2244
      // (Google SunSurveyorApp), TX000154 = cartão 6351 (H57Store, Vanessa). Data também ganhou o
      // ano, mesmo formato DD/MM/YYYY que `mapear()` usa pros outros itens.
      onda3InserirNaPosicaoCronologica(VARS.LRW_TRANSACOES, { tx:'TX000132', data:'22/07/2026', nome:'App de alinhamento solar (Google SunSurveyor) — limbo (pós-fechamento fatura)', valor:56.99, cartaoId:'7b0adfe8-182f-455a-a633-30995fba7e67' });
      onda3InserirNaPosicaoCronologica(VARS.LRV_TRANSACOES, { tx:'TX000154', data:'24/07/2026', nome:'H57Store (cartão 6351) — limbo (pós-fechamento fatura)', valor:30.97, cartaoId:'2bd91561-e1dc-4073-8e8a-b0037b5bb4bf' });
      // NOVO 15/08/2026 (card 100% automático, ver comentário no topo do arquivo): mbLRWConfirmado/
      // mbLRVConfirmado deixam de ser número digitado à mão — recalculados aqui, toda carga, a partir
      // da MESMA lista que acabou de ser montada acima (nunca 2 fontes independentes pra mesma coisa,
      // mesma garantia que livroLRC/mbLRRConfirmado já tinham nos módulos irmãos).
      VARS.mbLRWConfirmado = Math.round(VARS.LRW_TRANSACOES.reduce((s,t)=>s+t.valor,0)*100)/100;
      VARS.mbLRVConfirmado = Math.round(VARS.LRV_TRANSACOES.reduce((s,t)=>s+t.valor,0)*100)/100;
      if(typeof REG !== 'undefined' && REG.mbDetalhe){
        REG.mbDetalhe.wallace = VARS.mbLRWConfirmado;
        REG.mbDetalhe.vanessa = VARS.mbLRVConfirmado;
      }
      const mbLRWEl = $('mbLRW'); if(mbLRWEl) mbLRWEl.textContent = fmt(VARS.mbLRWConfirmado);
      const mbLRVEl = $('mbLRV'); if(mbLRVEl) mbLRVEl.textContent = fmt(VARS.mbLRVConfirmado);
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
      // CORRIGIDO 16/08/2026 (achado do usuário: "Pessoal (s/ corporativo)" não batia com a soma das
      // categorias) — mbLRW/mbLRV acabaram de mudar acima, mbPessoal/mbLRNaoReconciliado precisam
      // recalcular junto (ver comentário completo em hydrate-visa-mb.js).
      if(typeof recalcularEHidratarMbPessoal === 'function') recalcularEHidratarMbPessoal();
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
