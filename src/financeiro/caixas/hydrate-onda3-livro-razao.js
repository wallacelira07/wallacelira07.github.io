// MÓDULO: Onda 3, prioridade 1 — Livro Razão lendo V2 (08/08/2026). V2 como fonte principal,
// V1 (renderLivrosVariaveis(), já rodou antes desta função) como fallback automático.
//
// Regra nova (08/08/2026): divergência conhecida e documentada não bloqueia mais — só falta
// de estrutura bloqueia. Por isso o escopo aqui é o MESMO conjunto de caixas cujo saldo já
// foi migrado nas Ondas 1/2 (coerência: se o card já mostra saldo V2, a lista de lançamentos
// da mesma caixa também mostra V2 — nunca card-V2 + tabela-V1 misturados na mesma caixa).
// Caixas ainda em V1 no saldo (Manutenção, Saúde Família, Aniversário Júlio, Caixa Lance,
// Provisionado Wärtsilä) ficam de fora desta rodada pelo mesmo motivo — não é falta de
// estrutura (a tabela `transacoes` tem os dados), é manter a mesma caixa consistente entre
// card e tabela até a decisão de causa raiz de cada uma. ATUALIZADO 09/08/2026: PIX Geral
// Vanessa saiu desta lista — saldo promovido pra V2 mais cedo nesta sessão, mas o Livro
// Razão (esta tabela) tinha ficado esquecido, gerando o mesmo tipo de inconsistência que
// esta regra existe pra evitar (card V2 + tabela V1). Corrigido, ver linha da PGV abaixo.
// LRW/LRV/LRC-limbo/LRCV (Caixa Variável) e Boletos (sem aba de Livro Razão) ficam de fora —
// fora do escopo desta prioridade.
//
// Fallback automático: se o fetch falhar, a tabela já renderizada por renderLivrosVariaveis()
// (V1) permanece intocada — este módulo só SOBRESCREVE em caso de sucesso.
// Rollback: comentar a chamada aplicarOnda3LivroRazao() em app.js.

// CORRIGIDO 10/08/2026 (achado do usuário: "tela já usa V2, busca ainda usa V1"): cada entrada ganhou
// `varsArray` — o nome do array em VARS que a Busca Global (construirIndiceTransacoesBusca(),
// dashboard-navegacao.js) lê pra indexar. Antes esta função só escrevia no <tbody> (visual); o array
// em memória nunca era tocado, então a busca continuava indexando o literal V1 pras mesmas 12 caixas
// que a tela já mostra em V2 — divergência real entre o que a tela mostra e o que a busca acha.
const ONDA3_LR_MAPA = [
  { tbodyId: 'lreventosTbody', tfId: 'tf_lreventos', qtdId: 'qtd_lreventos', caixaId: 'ecaebc58-8f49-4d85-8ef4-6282ea765c2f', caixaNome: 'Caixa Eventos', varsArray: 'EVENTOS_TRANSACOES' },
  { tbodyId: 'lrseguroTbody', tfId: 'tf_lrseguro', qtdId: 'qtd_lrseguro', caixaId: '8dcfa73a-1560-4b37-9aac-48a499548d2c', caixaNome: 'Caixa Seguro Emplacamento', varsArray: 'SEGURO_EMPLACAMENTO_TRANSACOES' },
  { tbodyId: 'lrcombTbody', tfId: 'tf_lrcomb', qtdId: 'qtd_lrcomb', caixaId: '782d8722-392a-440d-8b71-4fa7476a5b30', caixaNome: 'Caixa Combustível', varsArray: 'COMBUSTIVEL_TRANSACOES' },
  { tbodyId: 'lrchurrascoTbody', tfId: 'tf_lrchurrasco', qtdId: 'qtd_lrchurrasco', caixaId: 'f18e248e-182b-42ec-9d04-f1bf5cb0a749', caixaNome: 'Caixa Churrasco', varsArray: 'CHURRASCO_TRANSACOES' },
  { tbodyId: 'lrmciTbody', tfId: 'tf_lrmci', qtdId: 'qtd_lrmci', caixaId: '748b8612-b854-44e3-8834-542ec7f1ff7c', caixaNome: 'Caixa Mastercard_Infinite', varsArray: 'MASTERCARD_INFINITE_TRANSACOES' },
  { tbodyId: 'lrbdTbody', tfId: 'tfBD', qtdId: 'qtdBD', caixaId: 'eeaf926e-07df-479c-b0bc-1071410a5298', caixaNome: 'Caixa Bens Duráveis', varsArray: 'BENS_DURAVEIS_TRANSACOES' },
  { tbodyId: 'lrpvsaldoTbody', tfId: 'tfPV', qtdId: 'qtdPV', caixaId: '6c6546fa-5b83-4db6-aa33-ac1bf35370d9', caixaNome: 'PIX Vanessa', varsArray: 'PV_TRANSACOES' },
  // NOVO 09/08/2026 (achado do usuário: 3 lançamentos gravados direto na V2 pelo Chat - Sabão Júlio,
  // Fruta, Abastecimento PGV R$300 - nunca apareciam aqui porque esta aba ficou de fora da Onda 3
  // original por engano: o saldo da PGV já lia V2 desde a promoção desta sessão, mas o Livro Razão
  // (lançamento por lançamento) continuava preso em VARS.LRPGV_TRANSACOES). Mesma arquitetura das
  // demais caixas acima - corrige a origem do problema, não um remendo pontual nos 3 lançamentos.
  { tbodyId: 'lrpvTbody', tfId: 'tfLRPV', qtdId: 'qtdLRPGV', caixaId: 'fb779cdc-ab92-492d-a172-8d147d1380ea', caixaNome: 'PIX Geral Vanessa', varsArray: 'LRPGV_TRANSACOES' },
  // NOVO 09/08/2026 (investigação "matar V1"): Caixa Manutenção promovida no saldo (Onda 2,
  // ver hydrate-onda2-v2.js) depois de achar a causa raiz real da divergência — mesma regra
  // das outras caixas acima: card e Livro Razão têm que mostrar a mesma fonte.
  { tbodyId: 'lrmanutTbody', tfId: 'tf_lrmanut', qtdId: 'qtd_lrmanut', caixaId: 'df4c44af-3e30-4592-b0b5-5b863ca91591', caixaNome: 'Caixa Manutenção', varsArray: 'MANUTENCAO_TRANSACOES' },
  // NOVO 09/08/2026 (investigação "matar V1"): Caixa Lance promovida no saldo (Onda 3,
  // ver hydrate-onda3-caixalance.js) depois de fechar o resíduo pra R$20 (alta confiança).
  { tbodyId: 'lrlanceTbody', tfId: 'tf_lrlance', qtdId: 'qtd_lrlance', caixaId: 'ff0cd9af-c5a9-4a9b-8cdd-c379e167275e', caixaNome: 'Caixa Lance', varsArray: 'CAIXA_LANCE_TRANSACOES' },
  // NOVO 09/08/2026 (investigação "matar V1"): Saúde Família e Aniversário Júlio promovidas
  // no saldo (Onda 2, ver hydrate-onda2-v2.js), resíduo R$0,00 nas duas.
  { tbodyId: 'lrsaudeTbody', tfId: 'tf_lrsaude', qtdId: 'qtd_lrsaude', caixaId: 'd15e8cbe-4443-4ee4-9631-06d8d49058fe', caixaNome: 'Caixa Saúde Família', varsArray: 'SAUDE_FAMILIA_TRANSACOES' },
  { tbodyId: 'lranivTbody', tfId: 'tf_lraniv', qtdId: 'qtd_lraniv', caixaId: 'ffa94985-902c-4e8a-bd31-0a15a054a403', caixaNome: 'Caixa Aniversário Júlio', varsArray: 'ANIVERSARIO_JULIO_TRANSACOES' },
  // NOVA 12/08/2026 (pedido repetido do usuário: "sempre que houver caixa deve haver um livro, é lá
  // que haverá auditoria"). Caixa Emagrecimento nasceu direto na V2 (criada 12/08/2026, ver
  // hydrate-emagrecimento.js) — nunca teve array V1, então sem fallback CAIXAS_LR_SIMPLES
  // correspondente em render-livros-variaveis.js (não existe VARS.EMAGRECIMENTO_TRANSACOES V1 pra
  // cair de volta); o pane HTML já nasce com "Carregando…" em vez do texto padrão de fallback vazio.
  { tbodyId: 'lremagTbody', tfId: 'tf_lremag', qtdId: 'qtd_lremag', caixaId: 'd6be6a08-9d7b-4664-9c85-1e367aa620b9', caixaNome: 'Emagrecimento', varsArray: 'EMAGRECIMENTO_TRANSACOES' },
];

function onda3FormatarDataV2(dataIso){
  // transacoes.data vem "YYYY-MM-DD" — V1 sempre mostrou "DD/MM", mantém o mesmo formato visual
  if(!dataIso || dataIso.length < 10) return dataIso || '';
  const [ano, mes, dia] = dataIso.slice(0,10).split('-');
  return `${dia}/${mes}`;
}

function onda3LinhaTransacao(t){
  const tipo = t.tipo === 'entrada' ? 'Entrada' : 'Saída';
  const cor = tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
  const tx = t.tx_legado || '—';
  return `<tr><td class="mono">${tx}</td><td class="mono">${onda3FormatarDataV2(t.data)}</td><td>${t.descricao||''}</td><td style="color:${cor}">${tipo}</td><td class="r">${fmt(Number(t.valor))}</td></tr>`;
}

// ENDURECIDO (08/08/2026, Wave A): alvo é tbody (não id simples), então usa wrapper local
// no mesmo padrão de hydrate-onda5-parcelamentos.js — só cobre falha de fetch/estrutura
// (V2 inalcançável), nunca o caso "0 transações" por caixa (pode ser caixa genuinamente
// zerada no ciclo, não é erro — continua mantendo V1 nesse caso pontual).
function onda3LivroRazaoMarcarIndisponivel(motivo){
  ONDA3_LR_MAPA.forEach(({tbodyId}) => {
    const tbody = $(tbodyId);
    if(tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-danger)" title="'+(motivo||'').replace(/"/g,'&quot;')+'">⚠ Indisponível (V2)</td></tr>';
  });
}

async function aplicarOnda3LivroRazao(){
  const caixaIds = ONDA3_LR_MAPA.map(m => m.caixaId);
  let transacoes;
  try {
    transacoes = await WallaceFinanceService.getTransacoesPorCaixaIds(caixaIds);
  } catch(err){
    console.error('Onda3LivroRazao: falha ao buscar transacoes — domínio V2-exclusivo, sem fallback silencioso pro V1.', err);
    onda3LivroRazaoMarcarIndisponivel('Falha ao buscar transacoes (Onda 3 Livro Razão): ' + String(err));
    window.WALLACE_ONDA3_LIVRO_RAZAO_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!Array.isArray(transacoes)){
    console.warn('Onda3LivroRazao: resposta inesperada — domínio V2-exclusivo, sem fallback silencioso pro V1.');
    onda3LivroRazaoMarcarIndisponivel('Resposta inesperada ao buscar transacoes (Onda 3 Livro Razão)');
    window.WALLACE_ONDA3_LIVRO_RAZAO_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }
  const relatorio = [];
  ONDA3_LR_MAPA.forEach(({tbodyId, tfId, qtdId, caixaId, caixaNome, varsArray}) => {
    const tbody = $(tbodyId);
    if(!tbody){ console.warn(`Onda3LivroRazao: tbody "${tbodyId}" não encontrado, ignorado.`); return; }
    const linhas = transacoes.filter(t => t.caixa_id === caixaId);
    if(!linhas.length){
      console.warn(`Onda3LivroRazao: "${caixaNome}" sem transações na V2 — mantendo V1 na tabela e na busca.`);
      relatorio.push({ caixa: caixaNome, status: 'sem_dado_v2', fonte: 'V1 (fallback)' });
      return;
    }
    tbody.innerHTML = linhas.map(onda3LinhaTransacao).join('');
    const soma = Math.round(linhas.reduce((s,t) => s + (t.tipo==='entrada' ? Number(t.valor) : -Number(t.valor)), 0) * 100) / 100;
    const tfEl = $(tfId);
    if(tfEl) tfEl.textContent = fmt(soma);
    const qtdEl = $(qtdId);
    if(qtdEl) qtdEl.textContent = linhas.length + ' lançamento(s)';
    // CORRIGIDO 10/08/2026 (achado do usuário: "tela já usa V2, busca ainda usa V1"): antes só o
    // <tbody> era sobrescrito — VARS[varsArray] (o que construirIndiceTransacoesBusca() em
    // dashboard-navegacao.js realmente lê) continuava com o literal V1, então a Busca Global achava
    // um conjunto de lançamentos diferente do que a tabela mostrava, pras mesmas 12 caixas. Mesmo
    // shape que os arrays V1 sempre tiveram (tx/nome/valor/data), pra caber no índice sem mudar nada
    // lá — só a origem do dado muda.
    if(varsArray && typeof VARS !== 'undefined'){
      VARS[varsArray] = linhas.map(t => ({
        tx: t.tx_legado || '',
        nome: t.descricao || '',
        valor: Number(t.valor),
        data: onda3FormatarDataV2(t.data),
        tipo: t.tipo,
      }));
    }
    console.log(`Onda3LivroRazao [${caixaNome}]: exibindo V2 — ${linhas.length} lançamento(s), soma ${fmt(soma)}${varsArray ? ' (busca sincronizada)' : ''}.`);
    relatorio.push({ caixa: caixaNome, qtd: linhas.length, soma, fonte: 'V2' });
  });
  window.WALLACE_ONDA3_LIVRO_RAZAO_RELATORIO = relatorio;
  console.log('Onda3LivroRazao: relatório completo em window.WALLACE_ONDA3_LIVRO_RAZAO_RELATORIO', relatorio);
}
