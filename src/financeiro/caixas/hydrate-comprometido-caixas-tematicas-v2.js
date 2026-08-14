// MÓDULO: aplicarComprometidoCaixasTematicasV2() — extensão do conceito "Tem na Caixa × Comprometido
// × Disponível Real" (antes só existia pra Caixa Variável, ver hydrate-comprometido-caixa-variavel-v2.js)
// pras 6 caixas temáticas que também compram no cartão de crédito e funcionam como "pulmão" do
// orçamento até a fatura vencer. NOVO 14/08/2026 — decisão do usuário depois de uma pergunta de
// arquitetura trazida pelo Claude Chat: "isso é intencional (só a Variável precisa) ou é lacuna
// real?". Resposta do usuário: generalizar pras 6 caixas abaixo, mesmo comportamento da Variável.
//
// Mesma fórmula EXATA de getComprometidoCaixaVariavelV2() (soma de transacoes com essa caixa_id +
// cartao_id preenchido + afeta_saldo_real=false + status=confirmado + tipo=saida, filtrado pelo
// ciclo_inicio_em da própria caixa) — generalizada via WallaceFinanceService.getComprometidoPorCaixaV2(id).
//
// Estratégia de DOM: 4 destas 6 caixas têm card ESTÁTICO com id fixo (Bens Duráveis/Manutenção/
// Eventos/Saúde Família, ver hydrate-caixas.js) — localizados via esse id. As outras 2 (Churrasco,
// Emagrecimento) não têm card próprio no HTML, são geradas em runtime por
// preencherCaixasOperacionaisExtra() (hydrate-caixas.js) — localizadas por texto do título dentro
// de #caixasExtraGrid. Como essa geração é assíncrona e roda em paralelo com este módulo (mesma
// classe de corrida já documentada nesta sessão — "lag pra carregar os valores"), este módulo tenta
// de novo por alguns segundos se o card dinâmico ainda não existir, em vez de desistir na 1ª falha.
const CAIXAS_TEMATICAS_COMPROMETIDO_V2 = [
  { nome: 'Caixa Churrasco', nomeCurto: 'Churrasco', id: 'f18e248e-182b-42ec-9d04-f1bf5cb0a749', origem: 'dinamica' },
  { nome: 'Caixa Bens Duráveis', id: 'eeaf926e-07df-479c-b0bc-1071410a5298', origem: 'estatica', idSaldo: 'cxBensDuraveisSaldo' },
  { nome: 'Caixa Manutenção', id: 'df4c44af-3e30-4592-b0b5-5b863ca91591', origem: 'estatica', idSaldo: 'cxManutSaldo' },
  { nome: 'Caixa Eventos', id: 'ecaebc58-8f49-4d85-8ef4-6282ea765c2f', origem: 'estatica', idSaldo: 'cxEventosSaldo' },
  { nome: 'Caixa Saúde Família', id: 'd15e8cbe-4443-4ee4-9631-06d8d49058fe', origem: 'estatica', idSaldo: 'cxSaudeSaldo' },
  { nome: 'Emagrecimento', nomeCurto: 'Emagrecimento', id: 'd6be6a08-9d7b-4664-9c85-1e367aa620b9', origem: 'dinamica' },
];

function _localizarCardCaixaTematica(cfg){
  if(cfg.origem === 'estatica'){
    const elSaldo = document.getElementById(cfg.idSaldo);
    return elSaldo ? elSaldo.closest('.card') : null;
  }
  const grid = document.getElementById('caixasExtraGrid');
  if(!grid) return null;
  const alvo = cfg.nomeCurto || cfg.nome;
  return Array.from(grid.querySelectorAll('.card')).find(c => c.textContent.includes(alvo)) || null;
}

function _renderizarBlocoComprometido(card, comprometido, saldoAtual){
  const existente = card.querySelector('.comprometido-tematica');
  if(existente) existente.remove();
  if(!(comprometido > 0)) return; // nada comprometido no cartão neste ciclo — não polui o card
  const disponivelReal = Math.round((saldoAtual - comprometido) * 100) / 100;
  const bloco = document.createElement('div');
  bloco.className = 'comprometido-tematica';
  bloco.style.cssText = 'margin-top:0.35rem;padding-top:0.35rem;border-top:1px dashed var(--border);font-size:var(--fs-2xs)';
  bloco.innerHTML =
    '<div style="color:var(--amber)">(&minus;) Comprometido no cart&atilde;o: ' + fmt(comprometido) + '</div>' +
    '<div style="color:' + (disponivelReal < 0 ? 'var(--red)' : 'var(--green)') + ';font-weight:600">(=) Dispon&iacute;vel real: ' + fmt(disponivelReal) + '</div>';
  card.appendChild(bloco);
}

async function aplicarComprometidoCaixasTematicasV2(tentativasRestantes){
  if(tentativasRestantes === undefined) tentativasRestantes = 8; // 8 x 400ms = ate 3.2s de espera

  let saldos, comprometidos;
  try {
    const idsOrdenados = CAIXAS_TEMATICAS_COMPROMETIDO_V2.map(c => c.id);
    [saldos, comprometidos] = await Promise.all([
      WallaceFinanceService.getSaldosPorCaixa(),
      Promise.all(idsOrdenados.map(id => WallaceFinanceService.getComprometidoPorCaixaV2(id))),
    ]);
  } catch(err){
    console.error('ComprometidoCaixasTematicasV2: falha ao buscar saldo/comprometido das caixas temáticas.', err);
    return;
  }
  if(!Array.isArray(saldos)) return;

  const mapaSaldo = {};
  saldos.forEach(s => { mapaSaldo[s.caixa_nome] = Number(s.v2_saldo_calculado); });

  let pendentesPorDom = 0;
  let aplicadas = 0;
  CAIXAS_TEMATICAS_COMPROMETIDO_V2.forEach((cfg, i) => {
    const comprometido = comprometidos[i];
    if(typeof comprometido !== 'number' || isNaN(comprometido)) return;
    const saldoAtual = mapaSaldo[cfg.nome];
    if(saldoAtual === undefined) return;
    const card = _localizarCardCaixaTematica(cfg);
    if(!card){ pendentesPorDom++; return; }
    _renderizarBlocoComprometido(card, comprometido, saldoAtual);
    if(comprometido > 0) aplicadas++;
  });

  // Corrida de boot conhecida (mesma classe já documentada nesta sessão pra busca global/header):
  // preencherCaixasOperacionaisExtra() (Churrasco/Emagrecimento) roda em paralelo, pode ainda não
  // ter criado os cards na 1ª tentativa. Tenta de novo em vez de desistir.
  if(pendentesPorDom > 0 && tentativasRestantes > 0){
    setTimeout(() => aplicarComprometidoCaixasTematicasV2(tentativasRestantes - 1), 400);
    return;
  }

  console.log('ComprometidoCaixasTematicasV2: bloco aplicado em', aplicadas, 'de', CAIXAS_TEMATICAS_COMPROMETIDO_V2.length, 'caixas temáticas (só mostra quando há valor comprometido > 0 no ciclo).');
}
window.aplicarComprometidoCaixasTematicasV2 = aplicarComprometidoCaixasTematicasV2;
