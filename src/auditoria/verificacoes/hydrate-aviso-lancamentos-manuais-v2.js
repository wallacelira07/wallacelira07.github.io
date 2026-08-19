// MÓDULO: Aviso de lançamentos manuais V2 pendentes de refletir nos saldos (19/08/2026).
//
// CONTEXTO: auditoria SQL confirmou (SELECT direto na tabela `transacoes`, projeto Supabase
// bakdgacmwlopvrrppwdm) que existem lançamentos com origem='manual' (feitos direto na V2 relacional,
// via o formulário "Lançar transação" deste painel ou script) que ainda não são somados por todo
// cálculo de saldo/comprometido do painel — a causa raiz varia por caixa (algumas ignoram
// afeta_saldo_real=false sem cartao_id preenchido, outras dependem de um gate de "divergência V1×V2
// zero" que passou a reprovar sistematicamente desde que o V1 virou somente-leitura em 12/08/2026).
// Investigar/corrigir cada caminho de cálculo é trabalho de fundo (ver docs/changelog/ESTADO_ATUAL.md
// bloco 28); este módulo é só a mitigação rápida: avisar visualmente que existe dinheiro lançado que pode não
// estar refletido no que a tela mostra, sem prometer qual card específico está errado.
//
// ESTE MÓDULO É 100% SOMENTE LEITURA: um único SELECT (WallaceFinanceService.
// getTransacoesManualPendentesV2(), REST GET puro em `transacoes`) e nenhum INSERT/UPDATE/DELETE.
// NÃO recalcula nenhum saldo/comprometido existente — é aditivo, um card informativo a mais.
//
// Por que "origem='manual'" e não algum outro filtro: foi o critério que a auditoria SQL usou pra
// achar o problema (48 transações, R$7.091,00 na 1ª leitura) e é o único que identifica de forma
// simples e estável "lançamento que nasceu direto na V2 pelo usuário/script, sem vir de
// reconciliação Pluggy nem de import automático" — os outros dois valores possíveis de `origem`
// (`pluggy`, `reconciliacao`) têm 100% de vínculo com o registro V1 correspondente (`tx_legado`
// preenchido), então não sofrem do mesmo risco de "nunca aparecer em lugar nenhum".

function avisoLancamentosManuaisV2RenderErro(motivo){
  const el = $('avisoLancamentosManuaisV2');
  if(!el) return;
  el.style.display = 'none'; // falha aqui não deve gerar alarme falso — só loga e some, é card informativo
  console.error('AvisoLancamentosManuaisV2:', motivo);
}

function _avisoLancamentosManuaisV2FormatarMoeda(v){
  return (Number(v)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

async function aplicarAvisoLancamentosManuaisV2(){
  const el = $('avisoLancamentosManuaisV2');
  if(!el) return; // HTML antigo em cache, sem quebrar o resto do boot
  let linhas;
  try {
    linhas = await WallaceFinanceService.getTransacoesManualPendentesV2();
  } catch(err){
    avisoLancamentosManuaisV2RenderErro('falha ao buscar transacoes origem=manual: ' + err);
    return;
  }
  if(!Array.isArray(linhas)){
    avisoLancamentosManuaisV2RenderErro('resposta inesperada (não é array)');
    return;
  }
  if(linhas.length === 0){
    el.style.display = 'none';
    return;
  }

  const qtd = linhas.length;
  // Total bruto movimentado (soma dos valores absolutos, ignorando sinal/tipo) — é o mesmo número
  // usado na auditoria SQL original (R$7.091,00 na 1ª leitura), não uma soma líquida entrada-saída.
  const totalBruto = linhas.reduce((acc, t) => acc + Math.abs(Number(t.valor) || 0), 0);
  const dataMaisAntiga = linhas.reduce((min, t) => (!min || t.data < min) ? t.data : min, null);

  el.style.display = 'flex';
  el.innerHTML = `
    <span>⚠️</span>
    <span>
      <strong>${qtd} lançamento${qtd === 1 ? '' : 's'} ${qtd === 1 ? 'manual' : 'manuais'}</strong>
      (${_avisoLancamentosManuaisV2FormatarMoeda(totalBruto)}${dataMaisAntiga ? `, desde ${new Date(dataMaisAntiga+'T12:00:00').toLocaleDateString('pt-BR')}` : ''})
      lançado${qtd === 1 ? '' : 's'} direto no banco (V2) pode${qtd === 1 ? '' : 'm'} ainda não estar
      refletido${qtd === 1 ? '' : 's'} nos saldos/comprometido exibidos abaixo em algumas caixas —
      confira o Livro Razão da caixa específica antes de decidir gastar. Este aviso é só leitura,
      não altera nenhum cálculo.
    </span>`;

  window.WALLACE_AVISO_LANCAMENTOS_MANUAIS_V2 = {
    qtd, totalBruto, dataMaisAntiga, verificadoEm: new Date().toISOString(),
  };
  console.log('AvisoLancamentosManuaisV2: relatório completo em window.WALLACE_AVISO_LANCAMENTOS_MANUAIS_V2', window.WALLACE_AVISO_LANCAMENTOS_MANUAIS_V2);
}
