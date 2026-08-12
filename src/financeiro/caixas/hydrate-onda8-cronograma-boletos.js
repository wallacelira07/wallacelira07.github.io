// MÓDULO: Onda 8 — migração de VARS.CRONOGRAMA_BOLETOS_FIXOS (literal em vars-caixas.js) para a
// tabela relacional cronograma_boletos_fixos (08/08/2026). Escopo deliberadamente contido: só o
// SCHEDULE (dia de vencimento/valor dos 9 boletos fixos) migra — a lógica de auto-crédito em si
// (aplicarBoletosVencidosAutomaticamente(), app.js) continua a mesma função V1, inalterada, só
// passa a rodar de novo com o schedule vindo da V2 depois que o fetch resolve.
//
// Por que o escopo não inclui BOLETOS_TRANSACOES: essa é a lista de "já lançados" nesta sessão de
// boot, usada só pra dedupe do auto-crédito — o saldo real da Caixa Boletos (cxBoletosSaldo,
// balResBoletos, cxBoletosPct/Bar) já vem 100% da V2 desde a Onda 1/mesma sessão (vw_saldo_v2_por_caixa),
// então não há valor visível adicional em migrar esse array também agora.
//
// Efeito prático da migração: o schedule dos boletos fixos passa a ser editável direto no Supabase,
// sem precisar de deploy de código (mesmo padrão já usado pela tabela `legendas`) — se um valor
// mudar (ex: reajuste do condomínio), corrigir na tabela já reflete no próximo carregamento.
//
// Rollback: comentar a chamada aplicarOnda8CronogramaBoletos() em app.js — VARS.CRONOGRAMA_BOLETOS_FIXOS
// volta a vir só do literal local (vars-caixas.js), comportamento idêntico ao de antes desta Onda.

// NOVO 11/08/2026: anotações presentacionais que existiam só no HTML estático (ex: contexto do
// desconto solar na conta de Energia) — não têm coluna própria em cronograma_boletos_fixos, mantidas
// aqui como um pequeno mapa por `tx` pra não perder a informação quando a tabela virou dinâmica.
const ONDA8_BOLETO_NOTA_POR_TX = {
  TXB000009: 'última conta sem efeito do solar (gerador ativo desde 21/07, desconto só a partir da fatura de 21/08)',
  TXCON000001: 'migrado do Mastercard Black para pagamento em dinheiro em 11/08/2026 — antes era LRCON, agora entra no cronograma de boletos',
  TXCON000002: 'migrado do Mastercard Black para pagamento em dinheiro em 11/08/2026 — antes era LRCON, agora entra no cronograma de boletos',
};

function onda8LrbRenderTabela(){
  const tbody = $('lrbTbody');
  const lista = VARS.CRONOGRAMA_BOLETOS_FIXOS;
  if(tbody){
    if(!Array.isArray(lista) || !lista.length){
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-danger)">⚠ Indisponível (V2)</td></tr>';
    } else {
      tbody.innerHTML = lista.map(b => {
        const nota = ONDA8_BOLETO_NOTA_POR_TX[b.tx] ? ` <span style="font-size:0.62rem;color:var(--text-dim)">· ${ONDA8_BOLETO_NOTA_POR_TX[b.tx]}</span>` : '';
        return `<tr><td class="mono">${b.tx}</td><td>${b.nome}${nota}</td><td class="r">${fmt(b.valor)}</td></tr>`;
      }).join('');
    }
  }
  // Rodapé passa a ser a SOMA real dos itens acima — antes era VARS.livroLRB, o saldo (com aportes/
  // rendimento) da Caixa Boletos, um número de outra fonte que só coincidia por acaso.
  const somaBoletos = Array.isArray(lista) ? Math.round(lista.reduce((s,b) => s + Number(b.valor||0), 0) * 100) / 100 : 0;
  const tfEl = $('tfLRB'); if(tfEl) tfEl.textContent = fmt(somaBoletos);
  const qtdEl = $('qtdLRB'); if(qtdEl) qtdEl.textContent = (Array.isArray(lista) ? lista.length : 0) + ' boleto(s)';
}

async function aplicarOnda8CronogramaBoletos(){
  let cronogramaV2;
  try {
    cronogramaV2 = await WallaceFinanceService.getCronogramaBoletosV2();
  } catch(err){
    console.error('Onda8CronogramaBoletos: falha ao buscar cronograma_boletos_fixos — mantendo o schedule V1 local (baixo risco, já rodou no boot).', err);
    window.WALLACE_ONDA8_CRONOGRAMA_RELATORIO = { status: 'erro_v2', erro: String(err) };
    onda8LrbRenderTabela();
    return;
  }
  if(!Array.isArray(cronogramaV2) || !cronogramaV2.length){
    console.warn('Onda8CronogramaBoletos: resposta vazia/inesperada — mantendo o schedule V1 local.');
    window.WALLACE_ONDA8_CRONOGRAMA_RELATORIO = { status: 'sem_dado_v2' };
    onda8LrbRenderTabela();
    return;
  }

  const v1Total = Math.round(VARS.CRONOGRAMA_BOLETOS_FIXOS.reduce((s,b)=>s+b.valor,0)*100)/100;
  const v1Qtd = VARS.CRONOGRAMA_BOLETOS_FIXOS.length;

  VARS.CRONOGRAMA_BOLETOS_FIXOS = cronogramaV2.map(b => ({
    tx: b.tx, nome: b.nome, diaVencimento: b.dia_vencimento, valor: Number(b.valor),
  }));

  const v2Total = Math.round(VARS.CRONOGRAMA_BOLETOS_FIXOS.reduce((s,b)=>s+b.valor,0)*100)/100;
  const diverge = v1Qtd !== VARS.CRONOGRAMA_BOLETOS_FIXOS.length || Math.abs(v1Total - v2Total) > 0.01;

  // DESLIGADO 12/08/2026 (Onda 11): não rechama mais aplicarBoletosVencidosAutomaticamente() aqui -
  // essa função está desativada no boot (ver app.js). VARS.BOLETOS_TRANSACOES e VARS.caixaBoletos
  // agora só são atualizados por aplicarOnda11BoletosExtratoV2() (extrato real da V2), que roda em
  // paralelo via onDomPronto - não precisa ser chamado daqui.

  if(diverge) console.warn(`Onda8CronogramaBoletos: schedule V1 (${v1Qtd} itens, ${fmt(v1Total)}) × V2 (${VARS.CRONOGRAMA_BOLETOS_FIXOS.length} itens, ${fmt(v2Total)}) — DIVERGE. Se for uma edição intencional feita direto no Supabase, é esperado; se não, investigar.`);
  else console.log(`Onda8CronogramaBoletos: V1×V2 batem (${VARS.CRONOGRAMA_BOLETOS_FIXOS.length} boletos, ${fmt(v2Total)}). V2 é a fonte do schedule a partir de agora.`);

  onda8LrbRenderTabela();

  window.WALLACE_ONDA8_CRONOGRAMA_RELATORIO = { qtdV1: v1Qtd, totalV1: v1Total, qtdV2: VARS.CRONOGRAMA_BOLETOS_FIXOS.length, totalV2: v2Total, diverge, exibindo: 'V2' };
}
