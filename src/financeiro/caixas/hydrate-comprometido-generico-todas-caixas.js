// MÓDULO: aplicarComprometidoGenericoTodasCaixas() — substitui aplicarComprometidoCaixasTematicasV2()
// (lista fixa de 6 caixas) por um padrão único "centro de custo": QUALQUER caixa com comprometido no
// cartão > 0 ganha o bloco "(−) Comprometido no cartão / (=) Disponível real", sem precisar cadastrar
// caixa nova em lista nenhuma. Pedido explícito do usuário 21/08/2026: "as caixas são centro de
// custo, devem funcionar como um" — achado que motivou: Caixa Wärtsilä e Caixa Mercado Pago tinham
// dívida de cartão real invisível na tela, porque não estavam na lista fixa antiga.
//
// Fórmula idêntica à antiga (Saldo − Comprometido = Disponível real), fonte agora é
// vw_comprometido_cartao_por_caixa (genérica, ver app.js). NÃO substitui
// atualizarCaixasTematicasComprometidoMB() (hydrate-visa-mb.js) — aquela função tem outro propósito
// (soma só o comprometido em cartões da família Mastercard Black, alimenta o cálculo de "Não
// Reconciliado"), não é só exibição.
//
// Estratégia de DOM: 12 caixas estáticas (seção 05) localizadas pelo id do saldo, mesma lista que
// tooltip-composicao-caixa.js já mantém separadamente (MAPA_CAIXA_ID_CARD lá, escopo de IIFE — não
// dá pra importar, replicada aqui). Qualquer caixa fora dessa lista é procurada por texto dentro de
// #caixasExtraGrid (mesmo padrão de preencherCaixasOperacionaisExtra/hydrate-caixas.js).
const MAPA_CAIXA_NOME_SALDO_ID = {
  'Caixa Boletos': 'cxBoletosSaldo',
  'PIX Vanessa': 'cxPixSaldo',
  'PIX Geral Vanessa': 'cxPgvSaldo',
  'Caixa Wartsila': 'cxWartsila',
  'Caixa Manutenção': 'cxManutSaldo',
  'Caixa Bens Duráveis': 'cxBensDuraveisSaldo',
  'Caixa Eventos': 'cxEventosSaldo',
  'Conta Suavização (CC-304)': 'cxSuavizSaldo',
  'Caixa Saúde Família': 'cxSaudeSaldo',
  'Caixa Aniversário Júlio': 'cxAnivSaldo',
  'Caixa Seguro Emplacamento': 'cxSeguroSaldo',
  'Escola de Júlio': 'cxEscolaSaldo',
};

function _localizarCardCaixaGenerico(caixaNome){
  const idSaldo = MAPA_CAIXA_NOME_SALDO_ID[caixaNome];
  if(idSaldo){
    const el = document.getElementById(idSaldo);
    return el ? el.closest('.card') : null;
  }
  const grid = document.getElementById('caixasExtraGrid');
  if(!grid) return null;
  return Array.from(grid.querySelectorAll('.card')).find(c => c.textContent.includes(caixaNome)) || null;
}

function _renderizarBlocoComprometidoGenerico(card, comprometido, saldoAtual){
  const existente = card.querySelector('.comprometido-generico');
  if(existente) existente.remove();
  if(!(comprometido > 0)) return;
  const disponivelReal = Math.round((saldoAtual - comprometido) * 100) / 100;
  const bloco = document.createElement('div');
  bloco.className = 'comprometido-generico';
  bloco.style.cssText = 'margin-top:0.35rem;padding-top:0.35rem;border-top:1px dashed var(--border);font-size:var(--fs-2xs)';
  bloco.innerHTML =
    '<div style="color:var(--amber)">(&minus;) Comprometido no cart&atilde;o: ' + fmt(comprometido) + '</div>' +
    '<div style="color:' + (disponivelReal < 0 ? 'var(--red)' : 'var(--green)') + ';font-weight:600">(=) Dispon&iacute;vel real: ' + fmt(disponivelReal) + '</div>';
  card.appendChild(bloco);
}

async function aplicarComprometidoGenericoTodasCaixas(tentativasRestantes){
  if(tentativasRestantes === undefined) tentativasRestantes = 8; // 8 x 400ms = ate 3.2s de espera pelos cards dinamicos

  let saldos, comprometidos;
  try {
    [saldos, comprometidos] = await Promise.all([
      WallaceFinanceService.getSaldosPorCaixa(),
      WallaceFinanceService.getComprometidoCartaoTodasCaixasV2(),
    ]);
  } catch(err){
    console.error('ComprometidoGenericoTodasCaixas: falha ao buscar saldo/comprometido das caixas.', err);
    return;
  }
  if(!Array.isArray(saldos) || !Array.isArray(comprometidos)) return;

  const mapaSaldo = {};
  saldos.forEach(s => { mapaSaldo[s.caixa_nome] = Number(s.v2_saldo_calculado); });

  let pendentesPorDom = 0;
  let aplicadas = 0;
  comprometidos.forEach(({caixaNome, comprometido}) => {
    const saldoAtual = mapaSaldo[caixaNome];
    if(saldoAtual === undefined) return; // caixa sem vw_saldo_v2_por_caixa correspondente — nao arrisca renderizar com dado incompleto
    const card = _localizarCardCaixaGenerico(caixaNome);
    if(!card){ pendentesPorDom++; return; }
    _renderizarBlocoComprometidoGenerico(card, comprometido, saldoAtual);
    aplicadas++;
  });

  // Mesma corrida de boot já documentada em hydrate-comprometido-caixas-tematicas-v2.js: cards
  // dinâmicos (#caixasExtraGrid) podem ainda não existir na 1ª tentativa. Tenta de novo em vez de
  // desistir.
  if(pendentesPorDom > 0 && tentativasRestantes > 0){
    setTimeout(() => aplicarComprometidoGenericoTodasCaixas(tentativasRestantes - 1), 400);
    return;
  }

  console.log('ComprometidoGenericoTodasCaixas: bloco aplicado em', aplicadas, 'de', comprometidos.length, 'caixa(s) com comprometido > 0 no cartão.');
}
window.aplicarComprometidoGenericoTodasCaixas = aplicarComprometidoGenericoTodasCaixas;
