// MÓDULO: recalcularCaixas() — domínio Caixas do motor de cálculo (recalcularAgregadosDerivados).
// Deriva Caixa Variável (disponível/comprometidoParaTeto/tetoEfetivo/folegoAteTeto) e o líquido do
// PIX Diversos. Extraído de app.js na modularização (07/08/2026) — MESMA fórmula, MESMO resultado,
// só reorganização em função de domínio. Chamada logo no início de recalcularAgregadosDerivados()
// (depois do bloco de resincronização VARS→REG, que continua inline em app.js). Depende apenas de
// campos já resincronizados (REG.caixaVariavel.saldoReal/comprometido/tolerenciaTemp) e de dados
// estáticos do REG (tetoOficial, pixDiversos.entradas/saidas) — nenhuma dependência de outro domínio.
function recalcularCaixas(){
  const r2 = x => Math.round(x*100)/100;
  REG.caixaVariavel.disponivel = r2(REG.caixaVariavel.saldoReal - REG.caixaVariavel.comprometido);
  // ATUALIZADO 05/08/2026 (parte 98, decisao do usuario apos discutir a troca-off): Bens Duraveis
  // agora ja e excluida NA ORIGEM de VARS.caixaVariavelComprometido (ver comentario grande junto da
  // formula de caixaVariavelComprometido, mais acima no arquivo) - "comprometido" ja vem liquido de
  // bens duraveis, entao "comprometidoParaTeto" nao precisa mais subtrair de novo (isso duplicaria o
  // desconto). Mantido como campo separado só por clareza de nome/uso nos outros lugares que já
  // referenciam cv.comprometidoParaTeto - mas agora e simplesmente igual a comprometido.
  REG.caixaVariavel.comprometidoParaTeto = REG.caixaVariavel.comprometido;
  REG.caixaVariavel.tetoEfetivo = r2(REG.caixaVariavel.tetoOficial + (REG.caixaVariavel.tolerenciaTemp||0));
  REG.caixaVariavel.folegoAteTeto = r2(REG.caixaVariavel.tetoEfetivo - REG.caixaVariavel.comprometidoParaTeto);
  REG.pixDiversos.liquido = r2(REG.pixDiversos.entradas - REG.pixDiversos.saidas);
}
