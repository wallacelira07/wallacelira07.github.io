// MÓDULO: Onda 10 — LRC_LIMBO (cartão corporativo reembolsável) lendo V2 (12/08/2026).
// Mesmo padrão do bloco "lista detalhada" de hydrate-onda3-lrwlrv.js: substitui
// VARS.LRC_LIMBO_TRANSACOES (array V1 mantido à mão) pela mesma fonte real (`transacoes`),
// filtro mecânico (caixa_id=Provisionado Wärtsilä + cartao_id preenchido), confirmado por
// evidência que as 5 linhas do array V1 já existem 1:1 na V2 (mesmo tx_legado) — nenhuma
// transação nova precisou ser lançada, só trocar a fonte de leitura.
//
// LRCV NÃO está neste módulo, de propósito: os 2 itens são PIX avulsos sem marca própria em
// `transacoes` que os distinga de aportes/rendimentos (mesma caixa Variável, mesmo cartao_id
// nulo) — sem uma regra de negócio nova (categoria dedicada, por exemplo), promover isso pra V2
// seria inventar filtro sem evidência. Fica em V1 até existir essa marca.
//
// Rollback: comentar a chamada aplicarOnda10LrcLimbo() em app.js.

async function aplicarOnda10LrcLimbo(){
  try {
    const detalhe = await WallaceFinanceService.getTransacoesCorporativoCartaoDetalhe();
    if(!Array.isArray(detalhe)){
      console.warn('Onda10LrcLimbo: resposta inesperada de transacoes_corporativo_cartao_detalhe — LRC_LIMBO mantido em V1.');
      window.WALLACE_ONDA10_LRCLIMBO_RELATORIO = { status: 'sem_dado_v2' };
      exibirAvisoFallbackLrcLimbo(true);
      return;
    }
    VARS.LRC_LIMBO_TRANSACOES = detalhe.map(l => ({
      tx: l.tx_legado || '—',
      data: l.data ? l.data.slice(0,10).split('-').reverse().join('/') : '—',
      nome: l.descricao || '',
      valor: Math.round(Number(l.valor)*100)/100,
    }));
    if(typeof renderLivrosVariaveis === 'function') renderLivrosVariaveis();
    // CORRIGIDO 12/08/2026 (achado do usuário: rodapé "tfLRC" ficava com o valor antigo mesmo com a
    // tabela certa embaixo — causa raiz igual à já documentada em hydrate-livros-razao.js pro par
    // LRW/LRV: tfLRC é escrito por hydrateLivrosRazao() a partir de REG.livrosRazaoTotais.LRC.total,
    // um valor calculado 1x no boot a partir do array V1 antigo, nunca recalculado depois. Recalcula
    // aqui a partir do MESMO array que acabou de popular a tabela (VARS.LRC_LIMBO_TRANSACOES), pra
    // rodapé/tabela nunca mais divergirem — mesma garantia que livroLRC/mbLRCConfirmado já tinham
    // internamente (VARS.livroLRC = soma do array, ver app.js), só que agora o texto do DOM também
    // reflete o recalculo, não só a variável.
    VARS.livroLRC = Math.round(VARS.LRC_LIMBO_TRANSACOES.reduce((s,t)=>s+t.valor,0)*100)/100;
    VARS.mbLRCConfirmado = VARS.livroLRC;
    const tfLRCEl = $('tfLRC');
    if(tfLRCEl) tfLRCEl.textContent = fmt(VARS.livroLRC);
    // Recontagem explícita depois do redraw — mesmo achado do usuário no LRV (botão da aba ficava
    // preso na contagem do boot, sem refletir a tabela redesenhada acima).
    if(typeof atualizarContadoresAbasLR === 'function') atualizarContadoresAbasLR();
    // CORRIGIDO 12/08/2026 (achado da auditoria de inconsistências: este módulo reescreve
    // VARS.livroLRC/mbLRCConfirmado acima, mas nunca re-rodava auditoriaAutomatica() depois — mesmo
    // padrão já corrigido em hydrate-onda9-livros-fixos.js (badge "N divergência(s)" preso no
    // resultado do boot, antes da V2 corrigir o valor). Se LRC entrar em alguma das relações que a
    // auditoria confere, o badge ficaria desatualizado sem este re-cálculo.
    if(typeof auditoriaAutomatica === 'function') auditoriaAutomatica();
    window.WALLACE_ONDA10_LRCLIMBO_RELATORIO = { status: 'ok', exibindo: 'V2', qtd: detalhe.length };
    console.log('Onda10LrcLimbo: LRC_LIMBO agora V2 — relatório em window.WALLACE_ONDA10_LRCLIMBO_RELATORIO', window.WALLACE_ONDA10_LRCLIMBO_RELATORIO);
    // Sucesso confirmado contra a V2 nesta carga — apaga o aviso de fallback, se estava aceso de uma
    // tentativa anterior (12/08/2026, auditoria: fallback não podia ficar "grudado" na tela).
    exibirAvisoFallbackLrcLimbo(false);
  } catch(err){
    console.error('Onda10LrcLimbo: falha ao buscar detalhe do cartão corporativo — LRC_LIMBO mantido em V1.', err);
    window.WALLACE_ONDA10_LRCLIMBO_RELATORIO = { status: 'erro_v2', erro: String(err) };
    exibirAvisoFallbackLrcLimbo(true);
  }
}

// 12/08/2026 (auditoria: fallback V2→V1 silencioso, usuário não abre o console) — liga/desliga o
// callout de aviso na aba LRC (limbo). Só aparece quando o fallback realmente acontece (erro/formato
// inesperado); some sozinho assim que uma carga seguinte tiver sucesso.
function exibirAvisoFallbackLrcLimbo(mostrar){
  const el = $('legLRCLimboFallbackAviso');
  if(el) el.style.display = mostrar ? '' : 'none';
}
