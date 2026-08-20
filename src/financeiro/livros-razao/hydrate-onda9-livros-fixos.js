// MÓDULO: Onda 9 — LRS/LRR/LRCON/LRDOA lendo V2 (11/08/2026). Mesmo padrão de
// hydrate-onda8-cronograma-boletos.js: as 4 tabelas eram HTML estático, nunca lidas do banco.
// Rodapé de cada tabela = SOMA das linhas mostradas, sempre — nunca mais um número de outra fonte
// (achado real: rodapé de Recorrências mostrava R$1.279,65 e Assinaturas R$663,10, nenhum dos dois
// batendo com a soma das linhas visíveis — números de fontes diferentes). Corrigido junto com o
// usuário: Assinaturas = soma das 13 linhas reais (R$473,11); Recorrências removeu a 2ª linha
// transitória da Faculdade Engenharia (paga 17/07, migração de cartão resolvida, fica só 1
// mensalidade fixa R$441,33) — soma real das 6 linhas ativas agora R$1.367,65.
//
// ATUALIZADO 11/08/2026 (adequação pedida pelo usuário): os 2 consórcios Porto (Carro+Casa Nova)
// deixaram de ser cobrados no Mastercard Black e passaram a boleto pago em dinheiro pela Caixa
// Boletos (dia 15) — cronograma_consorcios agora sempre vem vazio (ambas as linhas ativo=false),
// então LRCON mostra 0 lançamento(s)/R$0,00 de propósito, sem precisar de código novo (mesmo filtro
// ativo=eq.true que já existia). Ver cronograma_boletos_fixos (TXCON000001/002, dia 15) e LREI0005
// (empréstimo-ponte da Caixa Lance cobrindo o 1º mês, aporte da Caixa Boletos subiu de R$2.600 para
// R$4.550,77 — vars-operacional.js).
//
// Rollback: comentar a chamada aplicarOnda9LivrosFixos() em app.js.

// ADICIONADO 15/08/2026 (achado de auditoria de segurança: XSS real, mesma classe já corrigida em
// inbox-financeira.js/dashboard-navegacao.js — nome/obs/descrição/responsável podem vir de texto
// externo e iam direto pra innerHTML sem escapar).
function _onda9EscapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function onda9MarcarIndisponivel(motivo){
  const msg = (cols) => `<tr><td colspan="${cols}" style="text-align:center;color:var(--text-danger)">⚠ Indisponível (V2) — ${(motivo||'').replace(/"/g,'&quot;')}</td></tr>`;
  const lrsEl = $('lrsTbody'); if(lrsEl) lrsEl.innerHTML = msg(5);
  const lrrEl = $('lrrTbody'); if(lrrEl) lrrEl.innerHTML = msg(4);
  const lrdoaEl = $('lrdoaTbody'); if(lrdoaEl) lrdoaEl.innerHTML = msg(5);
}

function onda9FormatarData(iso){
  if(!iso || iso.length < 10) return iso || '—';
  const [ano, mes, dia] = iso.slice(0,10).split('-');
  return `${dia}/${mes}`;
}

// NOVO 20/08/2026 (achado do usuário: "não tem algo errado, as transações dos LRs são as compras que
// fiz no cartão, como não tá batendo?" — investigação a fundo da pendência Não Reconciliado do MB):
// o cartão Mastercard Black fecha sempre dia 22 (confirmado pelo usuário) — este é o ciclo REAL do
// cartão, um conceito DIFERENTE do "ciclo" interno do site (Caixa Variável, `ciclo_inicio_em`, não
// alinhado com nenhum cartão específico). Retorna a data (YYYY-MM-DD) de início do ciclo atual do
// cartão: se hoje já passou do dia 22 deste mês, o ciclo começou dia 22 deste mês; senão, começou dia
// 22 do mês anterior. Usado só pra filtrar `cronograma_recorrencias` por `ultima_cobranca_em` (uma
// recorrência só conta no Não Reconciliado se já cobrou de verdade dentro deste ciclo — achado real:
// Faculdade Engenharia cobrada 17/07, próxima só 11/09, mas contava em TODO ciclo entre essas datas
// porque a soma antiga não sabia diferenciar "ativa" de "já cobrou este ciclo").
function mbCicloAtualInicio(){
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-indexed
  const dia = hoje.getDate();
  const anoRef = dia >= 22 ? ano : (mes === 0 ? ano - 1 : ano);
  const mesRef = dia >= 22 ? mes : (mes === 0 ? 11 : mes - 1);
  const mesStr = String(mesRef + 1).padStart(2, '0');
  return `${anoRef}-${mesStr}-22`;
}

async function aplicarOnda9LivrosFixos(){
  let assinaturas, recorrencias, consorcios, doacoes;
  try {
    [assinaturas, recorrencias, consorcios, doacoes] = await Promise.all([
      WallaceFinanceService.getCronogramaAssinaturasV2(),
      WallaceFinanceService.getCronogramaRecorrenciasV2(),
      WallaceFinanceService.getCronogramaConsorciosV2(),
      WallaceFinanceService.getCronogramaDoacoesV2(),
    ]);
  } catch(err){
    console.error('Onda9LivrosFixos: falha ao buscar cronograma_assinaturas/recorrencias/consorcios/doacoes.', err);
    onda9MarcarIndisponivel('falha ao buscar dado: ' + String(err));
    window.WALLACE_ONDA9_LIVROS_FIXOS_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }

  // Assinaturas (LRS)
  // NOVO 19/08/2026 (pedido do usuário: "assinatura e recorrência pode por, aí coloca o cartão
  // 4628, porque não pagos por ele, só para registro") — cronograma_assinaturas não tem cartao_id
  // por linha (não vem de `transacoes`), então a Origem aqui é fixa/informativa, não consultada por
  // transação — todas as assinaturas ativas são cobradas no Mastercard Black virtual 4628.
  const ORIGEM_LRS_FIXA = '<td style="color:var(--text-dim);font-size:var(--fs-2xs)">💳 ••••4628</td>';
  const lrsTbody = $('lrsTbody');
  if(lrsTbody && Array.isArray(assinaturas)){
    lrsTbody.innerHTML = assinaturas.map(a =>
      `<tr><td class="mono">${a.tx}</td><td class="mono">${onda9FormatarData(a.data)}</td><td>${_onda9EscapeHtml(a.nome)}</td>${ORIGEM_LRS_FIXA}<td class="r">${fmt(Number(a.valor))}</td></tr>`
    ).join('');
    // CORRIGIDO 20/08/2026 (achado do usuário: Google One é assinatura ANUAL — o total desta lista
    // somava R$99,99 todo mês, como se fosse cobrança mensal, mesmo bug latente já existindo com o
    // Registro.br, R$40/ano). Assinatura marcada "anual" no nome só entra na soma no mês em que a
    // cobrança (`a.data`) realmente cai — nos outros 11 meses ela some do total, mas continua listada
    // na tabela acima (é uma obrigação real, só não deste mês).
    const hojeMes = new Date().getMonth();
    const somaLRS = Math.round(assinaturas.reduce((s,a)=>{
      const anual = /anual/i.test(a.nome || '');
      if(anual){
        const mesCobranca = a.data ? new Date(a.data + 'T00:00:00').getMonth() : null;
        if(mesCobranca !== hojeMes) return s;
      }
      return s + Number(a.valor);
    },0)*100)/100;
    const tfEl = $('tfLRS'); if(tfEl) tfEl.textContent = fmt(somaLRS);
    const qtdEl = $('qtdLRS'); if(qtdEl) qtdEl.textContent = assinaturas.length + ' assinatura(s) ativa(s)';
  }

  // Recorrências (LRR)
  // NOVO 19/08/2026 (mesmo pedido acima): Origem fixa "4628", mesmo motivo (cronograma_recorrencias
  // não vem de `transacoes`, sem cartao_id por linha).
  // REMOVIDO 20/08/2026 (pedido do usuário): destaque visual amarelo por linha + legenda explicativa
  // abaixo da tabela (texto desatualizado sobre migração de cartão V63/V87, Faculdade Engenharia e
  // Vivo). O campo `r.cartao` continua existindo e sendo usado no cálculo (mbLRRConfirmado/
  // visaLRRConfirmado abaixo) — só a apresentação visual da linha foi removida.
  const lrrTbody = $('lrrTbody');
  if(lrrTbody && Array.isArray(recorrencias)){
    lrrTbody.innerHTML = recorrencias.map(r => {
      const obs = r.obs ? ` <span style="font-size:0.62rem;color:var(--text-dim)">· ${_onda9EscapeHtml(r.obs)}</span>` : '';
      return `<tr><td class="mono">${r.tx}</td><td>${_onda9EscapeHtml(r.nome)}${obs}</td>${ORIGEM_LRS_FIXA}<td class="r">${fmt(Number(r.valor))}</td></tr>`;
    }).join('');
    const somaLRR = Math.round(recorrencias.reduce((s,r)=>s+Number(r.valor),0)*100)/100;
    const tfEl = $('tfLRR'); if(tfEl) tfEl.textContent = fmt(somaLRR);
    const qtdEl = $('qtdLRR'); if(qtdEl) qtdEl.textContent = recorrencias.length + ' recorrência(s)';
  }

  // Consórcios (LRCON)
  const lrconTbody = $('lrconTbody');
  if(lrconTbody && Array.isArray(consorcios)){
    lrconTbody.innerHTML = consorcios.map(c =>
      `<tr><td class="mono">${c.tx}</td><td>${_onda9EscapeHtml(c.nome)}</td><td class="r">${fmt(Number(c.valor))}</td></tr>`
    ).join('');
    const somaLRCON = Math.round(consorcios.reduce((s,c)=>s+Number(c.valor),0)*100)/100;
    const tfEl = $('tfLRCON'); if(tfEl) tfEl.textContent = fmt(somaLRCON);
    const qtdEl = $('qtdLRCON'); if(qtdEl) qtdEl.textContent = consorcios.length + ' consórcio(s)';
  }

  // Doações (LRDOA)
  // NOVO 19/08/2026 (pedido do usuário, padronização): Origem fixa "PIX" — doação nunca é cartão.
  const lrdoaTbody = $('lrdoaTbody');
  if(lrdoaTbody && Array.isArray(doacoes)){
    lrdoaTbody.innerHTML = doacoes.map(d =>
      `<tr><td class="mono">${d.tx}</td><td>${_onda9EscapeHtml(d.descricao)}</td><td>${d.responsavel ? _onda9EscapeHtml(d.responsavel) : '—'}</td><td style="color:var(--text-dim);font-size:var(--fs-2xs)">🔑 PIX</td><td class="r">${fmt(Number(d.valor))}</td></tr>`
    ).join('');
    const somaLRDOA = Math.round(doacoes.reduce((s,d)=>s+Number(d.valor),0)*100)/100;
    const tfEl = $('tfLRDOACAO'); if(tfEl) tfEl.textContent = fmt(somaLRDOA);
    const qtdEl = $('qtdLRDOA'); if(qtdEl) qtdEl.textContent = doacoes.length + ' doação(ões)';
  }

  // Recalcula os totais que dependiam dos números antigos (mbLRSConfirmado/mbLRRConfirmado/
  // livroLRCON) — mesmo padrão do Onda 5 (livroLRP): atualiza VARS + REG.*Detalhe direto, sem
  // esperar um novo boot.
  // CORRIGIDO 12/08/2026: assinaturas/consórcios não têm coluna `cartao` na V2 (100% Mastercard
  // Black por design, ver vars-mercado-pago.js visaLRSConfirmado/livroLRCONVisaOnly zerados em
  // V159) — só entram em mbDetalhe. Recorrências TÊM `cartao` (era só usado pra estilizar a linha,
  // nunca pra separar o total): a soma combinada era gravada em visaDetalhe E mbDetalhe ao mesmo
  // tempo, inflando os dois (achado: auditoria automática acusando "Visa Infinite" e "Mastercard
  // Black" divergentes — visaDetalhe tinha embutido recorrências que são do MB e vice-versa). A
  // suposição de V159 ("todas as recorrências migraram pro MB") não é mais real: dados atuais têm
  // 4 recorrências no Visa Infinite (Vivo/Digna/Campo Santo/Faculdade) e 2 no MB (Brisanet/New Car).
  // NOVO 20/08/2026 (achado da reconciliação item a item contra a fatura real do MB, 22/07-19/08):
  // igual à recorrências, calculado uma vez só e reaproveitado pelos 2 blocos abaixo.
  const cicloInicioAssinaturasRecorrencias = mbCicloAtualInicio();
  const jaCobrouNesteCicloGenerico = x => x.ultima_cobranca_em && x.ultima_cobranca_em >= cicloInicioAssinaturasRecorrencias;
  if(Array.isArray(assinaturas)){
    // CORRIGIDO 20/08/2026 (achado real: mbLRSConfirmado somava 100% das 13 assinaturas ativas
    // incondicionalmente, mesmo padrão de bug já corrigido pra recorrências hoje mais cedo — 3 delas
    // (MEGA, Meli+, Amazon Prime base, R$70,79) não aparecem na fatura real de 22/07-19/08, ou seja
    // não cobraram de novo dentro deste ciclo, mas entravam mesmo assim no Não Reconciliado). Mesmo
    // filtro `ultima_cobranca_em` já usado pra recorrências — `ativo=true` continua controlando a
    // TABELA (LRS mostra todas as assinaturas ativas, é a lista de obrigações), só a soma usada no
    // Não Reconciliado ficou consciente de ciclo.
    VARS.mbLRSConfirmado = Math.round(assinaturas.filter(jaCobrouNesteCicloGenerico).reduce((s,a)=>s+Number(a.valor),0)*100)/100;
    if(typeof REG !== 'undefined' && REG.mbDetalhe) REG.mbDetalhe.assinaturas = VARS.mbLRSConfirmado;
  }
  if(Array.isArray(recorrencias)){
    // NOVO 20/08/2026 (mesmo achado do comentário de mbCicloAtualInicio() acima): só entra no
    // Não Reconciliado quem já cobrou de verdade DENTRO do ciclo atual do cartão — `ultima_cobranca_em`
    // ausente (NULL, nunca confirmada) é tratado como "não cobrou ainda", exclui por segurança em vez
    // de assumir que já cobrou. `ativo=true` continua controlando o que aparece na TABELA do LRR (uma
    // recorrência pausada/cobrança futura ainda é uma obrigação real, só não entra nesta soma
    // específica se ainda não recorreu neste ciclo).
    const cicloInicio = cicloInicioAssinaturasRecorrencias;
    const jaCobrouNesteCiclo = jaCobrouNesteCicloGenerico;
    VARS.mbLRRConfirmado = Math.round(recorrencias.filter(r => r.cartao === 'Mastercard Black' && jaCobrouNesteCiclo(r)).reduce((s,r)=>s+Number(r.valor),0)*100)/100;
    VARS.visaLRRConfirmado = Math.round(recorrencias.filter(r => r.cartao !== 'Mastercard Black' && jaCobrouNesteCiclo(r)).reduce((s,r)=>s+Number(r.valor),0)*100)/100;
    if(typeof REG !== 'undefined' && REG.visaDetalhe) REG.visaDetalhe.recorrencias = VARS.visaLRRConfirmado;
    if(typeof REG !== 'undefined' && REG.mbDetalhe) REG.mbDetalhe.recorrencias = VARS.mbLRRConfirmado;
  }
  if(Array.isArray(consorcios)){
    VARS.livroLRCON = Math.round(consorcios.reduce((s,c)=>s+Number(c.valor),0)*100)/100;
    if(typeof REG !== 'undefined' && REG.mbDetalhe) REG.mbDetalhe.consorcios = VARS.livroLRCON;
  }
  if(typeof REG !== 'undefined' && REG.totalOpDetalhe){
    // totalOpDetalhe = necessidade operacional combinada (Visa+MB) — soma os dois lados, ao
    // contrário de visaDetalhe/mbDetalhe que são o breakdown POR cartão.
    REG.totalOpDetalhe.recorrencias = Math.round((VARS.mbLRRConfirmado + VARS.visaLRRConfirmado)*100)/100;
    REG.totalOpDetalhe.assinaturas = VARS.mbLRSConfirmado;
    // CORRIGIDO 11/08/2026: faltava sincronizar consorcios aqui (só recorrencias/assinaturas eram
    // resincronizadas) — sem isso, REG.totalOpDetalhe.consorcios ficava preso no valor síncrono do
    // boot (R$1.950,77) mesmo depois do array vir vazio da V2, inflando a Necessidade Operacional em
    // dobro (some do cartão via visaDetalhe/mbDetalhe acima, mas continuava contando aqui também).
    REG.totalOpDetalhe.consorcios = VARS.livroLRCON;
  }
  // Recontagem real das linhas (botão da aba + rodapé "N assinatura(s) ativa(s)" etc) — mesma função
  // que já roda pro resto do sistema, chamada de novo aqui pra refletir o tbody recém-preenchido.
  if(typeof atualizarContadoresAbasLR === 'function') atualizarContadoresAbasLR();
  if(typeof recalcularNecessidade === 'function') recalcularNecessidade();
  if(typeof hydrateResumoCartoes === 'function') hydrateResumoCartoes();
  if(typeof hydrateVisaMB === 'function') hydrateVisaMB();
  if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
  if(typeof hydrateBalanco === 'function') hydrateBalanco();
  if(typeof hydrateCenarios === 'function') hydrateCenarios();
  // CORRIGIDO 12/08/2026 (achado do usuário: badge "N divergência(s)" no topo mostrava números
  // antigos mesmo depois do visaDetalhe/mbDetalhe já estarem corrigidos por esta função) —
  // auditoriaAutomatica() só rodava 1x, dentro de hydrate() síncrono, ANTES desta função assíncrona
  // (registrada em paralelo via onDomPronto, sem await entre as duas) terminar de buscar a V2 e
  // corrigir visaDetalhe/mbDetalhe. Sem re-chamar aqui, o texto do badge ficava preso no resultado
  // antigo pra sempre, mesmo com o REG por baixo já certo — reroda a mesma checagem, mesmo padrão
  // já usado em atualizarPainelAposLancamento() (app.js).
  if(typeof auditoriaAutomatica === 'function') auditoriaAutomatica();

  window.WALLACE_ONDA9_LIVROS_FIXOS_RELATORIO = {
    assinaturas: assinaturas.length, recorrencias: recorrencias.length,
    consorcios: consorcios.length, doacoes: doacoes.length, exibindo: 'V2',
  };
  console.log('Onda9LivrosFixos: LRS/LRR/LRCON/LRDOA agora V2 — relatório em window.WALLACE_ONDA9_LIVROS_FIXOS_RELATORIO', window.WALLACE_ONDA9_LIVROS_FIXOS_RELATORIO);
}
