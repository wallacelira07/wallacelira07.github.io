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

// NOVO 14/08/2026 (auditoria: rodapé do LR soma real gasto + compromisso de cartão ainda não pago
// no mesmo total, sem aviso — achado real via SQL: Bens Duráveis, rodapé −R$104,30 = 583,99
// (saldo real) − 688,29 (comprometido). A conta está certa, só falta deixar claro que o total é
// "Disponível Real" e não "Tem na Caixa" quando há transação de cartão pendente na tabela. Mesmo
// rótulo/estilo já usado nos cards das 6 caixas temáticas (hydrate-comprometido-caixas-tematicas-v2.js,
// bloco ".comprometido-tematica" / "Disponível real") — reaproveitado aqui, não inventado.
function onda3AtualizarNotaDisponivelReal(tfEl, temComprometidoNoCartao){
  if(!tfEl) return;
  const tfootEl = tfEl.closest('.tfoot');
  if(!tfootEl) return;
  const proximo = tfootEl.nextElementSibling;
  let nota = (proximo && proximo.classList && proximo.classList.contains('lr-nota-disponivel-real')) ? proximo : null;
  if(!temComprometidoNoCartao){
    if(nota) nota.remove(); // caixa sem transação de cartão pendente neste ciclo — total já É "Tem na Caixa", nota não se aplica
    return;
  }
  if(!nota){
    nota = document.createElement('div');
    nota.className = 'lr-nota-disponivel-real';
    nota.style.cssText = 'padding:0.3rem 0.5rem 0.5rem;margin-top:-0.3rem;font-size:var(--fs-2xs);color:var(--amber)';
    tfootEl.insertAdjacentElement('afterend', nota);
  }
  nota.textContent = '(=) Este total é o Disponível real: já desconta o comprometido no cartão (compra ainda não paga) deste ciclo.';
}

// AMPLIADO 19/08/2026 (pedido repetido do usuário: "toda compra que entra no livro deve ter um
// campo para descriminar de onde saiu, cartão aí usa o final do cartão ou PIX" — as caixas são
// "pulmão" pra cobrir custo tanto no cartão quanto no PIX, e sem essa tag fica difícil auditar/achar
// duplicidade). cartoesMapa é opcional (id→numero_final) — sem ele, cai pra "PIX/dinheiro" genérico
// se cartao_id vazio, ou mostra só "cartão" sem o final se o mapa não carregou (nunca quebra a linha
// por falta desse dado auxiliar).
function onda3LinhaTransacao(t, cartoesMapa){
  const tipo = t.tipo === 'entrada' ? 'Entrada' : 'Saída';
  const cor = tipo === 'Entrada' ? 'var(--green)' : 'var(--text-danger)';
  const tx = t.tx_legado || '—';
  let origemTxt, origemCor;
  if(t.cartao_id){
    const final = cartoesMapa && cartoesMapa[t.cartao_id];
    origemTxt = final ? `💳 ••••${final}` : '💳 cartão';
    origemCor = 'var(--text-dim)';
  } else {
    origemTxt = '🔑 PIX/dinheiro';
    origemCor = 'var(--text-dim)';
  }
  return `<tr><td class="mono">${tx}</td><td class="mono">${onda3FormatarDataV2(t.data)}</td><td>${t.descricao||''}</td><td style="color:${cor}">${tipo}</td><td style="color:${origemCor};font-size:var(--fs-2xs)">${origemTxt}</td><td class="r">${fmt(Number(t.valor))}</td></tr>`;
}

// ENDURECIDO (08/08/2026, Wave A): alvo é tbody (não id simples), então usa wrapper local
// no mesmo padrão de hydrate-onda5-parcelamentos.js — só cobre falha de fetch/estrutura
// (V2 inalcançável), nunca o caso "0 transações" por caixa (pode ser caixa genuinamente
// zerada no ciclo, não é erro — continua mantendo V1 nesse caso pontual).
function onda3LivroRazaoMarcarIndisponivel(motivo){
  ONDA3_LR_MAPA.forEach(({tbodyId}) => {
    const tbody = $(tbodyId);
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-danger)" title="'+(motivo||'').replace(/"/g,'&quot;')+'">⚠ Indisponível (V2)</td></tr>';
  });
  const lrccTbody = $('lrccTbody');
  if(lrccTbody) lrccTbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-danger)" title="'+(motivo||'').replace(/"/g,'&quot;')+'">⚠ Indisponível (V2)</td></tr>';
}

// NOVO 19/08/2026 (achado do usuário, Caixa Combustível: as 2 saídas "Crédito KMV" R$200,00 não são
// gasto real da caixa — são consumo de um crédito pré-pago (mesmo saldo já mostrado no card "Créditos
// e Cupons", tabela `beneficios_creditos`). Ficavam misturadas nas linhas da Caixa Combustível
// "atrapalhando" a leitura do gasto real de combustível — pedido do usuário: tirar daqui, mostrar num
// Livro Razão próprio (LRCC). Marcador é o texto da descrição ("... - Crédito <nome>"), mesmo padrão
// já usado pelas 2 linhas reais existentes ("- Crédito KMV") — não é `afeta_saldo_real=false` +
// `cartao_id null` sozinho, esse par sozinho aparece em ~70 transações históricas não relacionadas
// (parcelamentos antigos, P2P, estornos) que não são consumo de crédito pré-pago nenhum, confirmado
// por SQL antes de escrever este filtro. Se um novo tipo de crédito pré-pago aparecer (ex: "- Crédito
// Shell Box"), esse padrão de descrição já cobre automaticamente, sem precisar editar código de novo.
function onda3EhCreditoPrePago(t){
  return typeof t.descricao === 'string' && /-\s*Cr[ée]dito\s+\S/i.test(t.descricao);
}

async function aplicarOnda3LivroRazao(){
  const caixaIds = ONDA3_LR_MAPA.map(m => m.caixaId);
  let transacoes, cartoesMapa;
  try {
    [transacoes, cartoesMapa] = await Promise.all([
      WallaceFinanceService.getTransacoesPorCaixaIds(caixaIds),
      WallaceFinanceService.getCartoesMapa().catch(() => ({})), // origem cai pra "💳 cartão" genérico se isso falhar, nunca quebra a tabela
    ]);
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
    // CORRIGIDO 19/08/2026 (pedido do usuário: as saídas "Crédito KMV" da Caixa Combustível
    // "atrapalham" a leitura do gasto real de combustível — tiradas daqui de vez, exibidas no LRCC
    // próprio logo abaixo, ver onda3EhCreditoPrePago()). Antes ficavam na tabela só excluídas da soma;
    // agora nem aparecem aqui, o LRCC é a única fonte pra elas.
    const linhas = transacoes.filter(t => t.caixa_id === caixaId && !onda3EhCreditoPrePago(t));
    if(!linhas.length){
      console.warn(`Onda3LivroRazao: "${caixaNome}" sem transações na V2 — mantendo V1 na tabela e na busca.`);
      relatorio.push({ caixa: caixaNome, status: 'sem_dado_v2', fonte: 'V1 (fallback)' });
      return;
    }
    tbody.innerHTML = linhas.map(t => onda3LinhaTransacao(t, cartoesMapa)).join('');
    const soma = Math.round(linhas.reduce((s,t) => s + (t.tipo==='entrada' ? Number(t.valor) : -Number(t.valor)), 0) * 100) / 100;
    const tfEl = $(tfId);
    if(tfEl) tfEl.textContent = fmt(soma);
    // NOVO 14/08/2026 (auditoria de rótulo, ver onda3AtualizarNotaDisponivelReal acima): soma acima
    // já não conta mais crédito pré-pago (correção de 19/08/2026 logo acima) — só rotula quando pelo
    // menos uma linha é compra de cartão ainda não paga (cartao_id preenchido + afeta_saldo_real=false).
    const temComprometidoNoCartao = linhas.some(t => t.cartao_id && t.afeta_saldo_real === false);
    onda3AtualizarNotaDisponivelReal(tfEl, temComprometidoNoCartao);
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
  // NOVO 19/08/2026 (LRCC — Créditos e Cupons, ver onda3EhCreditoPrépago() acima): reúne, de TODAS as
  // caixas buscadas nesta onda, as linhas de consumo de crédito pré-pago que foram tiradas de dentro
  // de cada caixa individual — não é uma caixa de verdade (mesmo espírito do card "Créditos e Cupons",
  // "Benefícios, não patrimônio": não participa de Balanço/Patrimônio), só uma aba de auditoria/leitura
  // que junta esse tipo de lançamento onde quer que ele exista, sem precisar mudar `caixa_id` nenhum.
  const lrccLinhas = transacoes.filter(t => onda3EhCreditoPrePago(t));
  const lrccTbody = $('lrccTbody');
  if(lrccTbody){
    if(!lrccLinhas.length){
      lrccTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhum consumo de crédito pré-pago neste ciclo.</td></tr>';
    } else {
      lrccTbody.innerHTML = lrccLinhas.map(t => onda3LinhaTransacao(t, cartoesMapa)).join('');
    }
    const lrccSoma = Math.round(lrccLinhas.reduce((s,t) => s + (t.tipo==='entrada' ? Number(t.valor) : -Number(t.valor)), 0) * 100) / 100;
    const tfLrcc = $('tf_lrcc'); if(tfLrcc) tfLrcc.textContent = fmt(lrccSoma);
    const qtdLrcc = $('qtd_lrcc'); if(qtdLrcc) qtdLrcc.textContent = lrccLinhas.length + ' lançamento(s)';
    console.log(`Onda3LivroRazao [LRCC]: ${lrccLinhas.length} lançamento(s) de crédito pré-pago, soma ${fmt(lrccSoma)}.`);
  }
  // NOVO 19/08/2026 (achado do usuário: Combustível "não muda", sempre volta pro -R$198,50 e some a
  // coluna Origem, mesmo com o fetch V2 confirmado correto): as 9 caixas acima (mesmos tbodyId do
  // bloco CAIXAS_LR_SIMPLES em render-livros-variaveis.js) são redesenhadas de novo, com o shape V1
  // antigo (sem Origem, rodapé de VARS.caixaCombustivel nunca recalculado), toda vez que
  // renderLivrosVariaveis() é rechamada por um módulo irmão (aplicarOnda4Lrei, aplicarOnda3LrwLrv,
  // aplicarOnda10LrcLimbo, aplicarOnda12CaixasPequenasV2) só pra redesenhar UMA tabela diferente —
  // como são todos fetches assíncronos correndo em paralelo, não há garantia de que este módulo (V2,
  // correto) termine por último. Esta flag avisa render-livros-variaveis.js pra não mais tocar nessas
  // 9 tabelas depois que a V2 já assumiu — a partir daqui, só este módulo (ou uma nova chamada dele)
  // escreve nelas.
  window.__wallaceOnda3LivroRazaoAplicado = true;
  // CORRIGIDO 14/08/2026 (auditoria de LRs: achado real — botão "LRBD - Bens Duráveis" ficava preso em
  // "(2)" pra sempre, mesmo a tabela V2 mostrando 6 lançamentos reais). Causa: aplicarOnda3LrwLrv(),
  // aplicarOnda10LrcLimbo() e aplicarOnda12CaixasPequenasV2() já chamam atualizarContadoresAbasLR() no
  // fim de cada um (mesmo padrão citado no comentário de hydrate-onda3-lrwlrv.js), mas esta função —
  // que sobrescreve o tbody das 13 caixas de ONDA3_LR_MAPA — nunca chamava. No boot, onDomPronto()
  // registra este fetch assíncrono ANTES de onDomPronto(atualizarContadoresAbasLR) (app.js), então o
  // contador roda cedo demais, contando o <tbody> ainda em V1 (array hardcoded, quase sempre menor que
  // a V2 real) — e como esta função nunca recontava depois, o número errado ficava preso até o próximo
  // atualizarPainelAposLancamento() (salvar um lançamento novo, trocar de ciclo). Mesmo fix já aplicado
  // nos módulos irmãos, replicado aqui.
  if(typeof atualizarContadoresAbasLR === 'function') atualizarContadoresAbasLR();
}

// NOVO 19/08/2026 (achado do usuário: "porque a saída de 33 de hoje não consta no LR? Isso não pode
// acontecer nunca" — LRCV/tfPixDiversos vinham 100% de VARS.LRCV_TRANSACOES/pixDiversosSaidas/
// pixDiversosEntradas, literais V1 hardcoded com só 2 lançamentos antigos (26/07 e 01/08),
// congelados desde então — a TX000345 de hoje, e qualquer PIX novo da Caixa Variável, nunca
// apareceriam aqui até alguém editar o array no código à mão. Agora V2-live: busca as movimentações
// PIX/dinheiro reais (cartao_id IS NULL — LRW/LRV já cobrem o lado cartão da mesma caixa,
// separadamente) da própria Caixa Variável, mesmo padrão da Onda 3 acima.
const LRCV_CAIXA_ID = '8522e256-2039-4c11-bd28-69738bfcf5b8'; // Caixa Variável
async function aplicarOnda3Lrcv(){
  const tbody = $('lrcvTbody');
  if(!tbody) return;
  let transacoes;
  try {
    transacoes = await WallaceFinanceService.getTransacoesPorCaixaIds([LRCV_CAIXA_ID]);
  } catch(err){
    console.error('Onda3Lrcv: falha ao buscar transações da Caixa Variável — mantendo o literal V1 antigo.', err);
    return;
  }
  if(!Array.isArray(transacoes)) return;
  // Só PIX/dinheiro (cartao_id null) — compra de cartão da Caixa Variável já é LRW/LRV, não duplica aqui.
  const linhas = transacoes.filter(t => !t.cartao_id).sort((a,b) => (a.data < b.data ? 1 : -1));
  if(!linhas.length){
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:1.2rem 0">Nenhuma movimentação PIX/dinheiro neste ciclo ainda.</td></tr>';
  } else {
    tbody.innerHTML = linhas.map(t => {
      const tipoTxt = t.tipo === 'entrada' ? 'PIX Entrada' : 'PIX Saída';
      const obsHtml = t.descricao ? ` <span style="font-size:0.62rem;color:var(--text-dim)">· ${_lrvEscapeHtml(t.descricao)}</span>` : '';
      return `<tr><td class="mono">${t.tx_legado||'—'}</td><td class="mono">${onda3FormatarDataV2(t.data)}</td><td>${tipoTxt}${obsHtml}</td><td class="r">${fmt(Number(t.valor))}</td></tr>`;
    }).join('');
  }
  const saidas = Math.round(linhas.filter(t=>t.tipo==='saida').reduce((s,t)=>s+Number(t.valor),0)*100)/100;
  const entradas = Math.round(linhas.filter(t=>t.tipo==='entrada').reduce((s,t)=>s+Number(t.valor),0)*100)/100;
  const liquido = Math.round((entradas - saidas)*100)/100;
  const t2 = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  t2('tfPixDiversosDetalhe', 'Saídas '+fmt(saidas)+' · Entradas '+fmt(entradas));
  t2('tfPixDiversosLiquido', 'Líquido '+(liquido<0?'− ':'+ ')+fmt(Math.abs(liquido)));
  console.log(`Onda3Lrcv: LRCV atualizado V2 — ${linhas.length} lançamento(s) PIX, líquido ${fmt(liquido)}.`);
}
