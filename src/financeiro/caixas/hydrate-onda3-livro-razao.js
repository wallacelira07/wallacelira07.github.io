// MÓDULO: Onda 3, prioridade 1 — Livro Razão lendo V2 (08/08/2026). V2 como fonte principal,
// V1 (renderLivrosVariaveis(), já rodou antes desta função) como fallback automático.
//
// Regra nova (08/08/2026): divergência conhecida e documentada não bloqueia mais — só falta
// de estrutura bloqueia. Por isso o escopo aqui é o MESMO conjunto de caixas cujo saldo já
// foi migrado nas Ondas 1/2 (coerência: se o card já mostra saldo V2, a lista de lançamentos
// da mesma caixa também mostra V2 — nunca card-V2 + tabela-V1 misturados na mesma caixa).
// Caixas ainda em V1 no saldo (Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário
// Júlio, Caixa Lance, Provisionado Wärtsilä) ficam de fora desta rodada pelo mesmo motivo —
// não é falta de estrutura (a tabela `transacoes` tem os dados), é manter a mesma caixa
// consistente entre card e tabela até a decisão de causa raiz de cada uma.
// LRW/LRV/LRC-limbo/LRCV (Caixa Variável) e Boletos (sem aba de Livro Razão) ficam de fora —
// fora do escopo desta prioridade.
//
// Fallback automático: se o fetch falhar, a tabela já renderizada por renderLivrosVariaveis()
// (V1) permanece intocada — este módulo só SOBRESCREVE em caso de sucesso.
// Rollback: comentar a chamada aplicarOnda3LivroRazao() em app.js.

const ONDA3_LR_MAPA = [
  { tbodyId: 'lreventosTbody', tfId: 'tf_lreventos', qtdId: 'qtd_lreventos', caixaId: 'ecaebc58-8f49-4d85-8ef4-6282ea765c2f', caixaNome: 'Caixa Eventos' },
  { tbodyId: 'lrseguroTbody', tfId: 'tf_lrseguro', qtdId: 'qtd_lrseguro', caixaId: '8dcfa73a-1560-4b37-9aac-48a499548d2c', caixaNome: 'Caixa Seguro Emplacamento' },
  { tbodyId: 'lrcombTbody', tfId: 'tf_lrcomb', qtdId: 'qtd_lrcomb', caixaId: '782d8722-392a-440d-8b71-4fa7476a5b30', caixaNome: 'Caixa Combustível' },
  { tbodyId: 'lrchurrascoTbody', tfId: 'tf_lrchurrasco', qtdId: 'qtd_lrchurrasco', caixaId: 'f18e248e-182b-42ec-9d04-f1bf5cb0a749', caixaNome: 'Caixa Churrasco' },
  { tbodyId: 'lrmciTbody', tfId: 'tf_lrmci', qtdId: 'qtd_lrmci', caixaId: '748b8612-b854-44e3-8834-542ec7f1ff7c', caixaNome: 'Caixa Mastercard/Infinite' },
  { tbodyId: 'lrbdTbody', tfId: 'tfBD', qtdId: 'qtdBD', caixaId: 'eeaf926e-07df-479c-b0bc-1071410a5298', caixaNome: 'Caixa Bens Duráveis' },
  { tbodyId: 'lrpvsaldoTbody', tfId: 'tfPV', qtdId: 'qtdPV', caixaId: '6c6546fa-5b83-4db6-aa33-ac1bf35370d9', caixaNome: 'PIX Vanessa' },
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

async function aplicarOnda3LivroRazao(){
  const caixaIds = ONDA3_LR_MAPA.map(m => m.caixaId);
  let transacoes;
  try {
    transacoes = await WallaceFinanceService.getTransacoesPorCaixaIds(caixaIds);
  } catch(err){
    console.error('Onda3LivroRazao: falha ao buscar transacoes — mantendo renderização V1 em todas as tabelas (fallback automático).', err);
    return;
  }
  if(!Array.isArray(transacoes)){
    console.warn('Onda3LivroRazao: resposta inesperada — mantendo V1 em todas as tabelas.');
    return;
  }
  const relatorio = [];
  ONDA3_LR_MAPA.forEach(({tbodyId, tfId, qtdId, caixaId, caixaNome}) => {
    const tbody = $(tbodyId);
    if(!tbody){ console.warn(`Onda3LivroRazao: tbody "${tbodyId}" não encontrado, ignorado.`); return; }
    const linhas = transacoes.filter(t => t.caixa_id === caixaId);
    if(!linhas.length){
      console.warn(`Onda3LivroRazao: "${caixaNome}" sem transações na V2 — mantendo V1 na tabela.`);
      relatorio.push({ caixa: caixaNome, status: 'sem_dado_v2', fonte: 'V1 (fallback)' });
      return;
    }
    tbody.innerHTML = linhas.map(onda3LinhaTransacao).join('');
    const soma = Math.round(linhas.reduce((s,t) => s + (t.tipo==='entrada' ? Number(t.valor) : -Number(t.valor)), 0) * 100) / 100;
    const tfEl = $(tfId);
    if(tfEl) tfEl.textContent = fmt(soma);
    const qtdEl = $(qtdId);
    if(qtdEl) qtdEl.textContent = linhas.length + ' lançamento(s)';
    console.log(`Onda3LivroRazao [${caixaNome}]: exibindo V2 — ${linhas.length} lançamento(s), soma ${fmt(soma)}.`);
    relatorio.push({ caixa: caixaNome, qtd: linhas.length, soma, fonte: 'V2' });
  });
  window.WALLACE_ONDA3_LIVRO_RAZAO_RELATORIO = relatorio;
  console.log('Onda3LivroRazao: relatório completo em window.WALLACE_ONDA3_LIVRO_RAZAO_RELATORIO', relatorio);
}
