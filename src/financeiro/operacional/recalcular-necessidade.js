// MÓDULO: recalcularNecessidade() — domínio Necessidade/Modo Operacional do motor de cálculo
// (recalcularAgregadosDerivados). Deriva Entradas Totais, Necessidade (Bruta/Líquida/Total
// Operacional, com ramo especial pra ciclo fechado), Saldo do Ciclo, a projeção dos próximos 12
// ciclos (evolução), Fluxo (saídas/resultado), excedente/complemento do pró-labore, Modo Operacional
// e os campos derivados de necessidade em Superávit Normal/Estimador. Extraído de app.js na
// modularização (07/08/2026) — MESMA fórmula, MESMO resultado, só reorganizado (algumas linhas que
// originalmente ficavam intercaladas com blocos de PIB Wallace/Balanço foram reagrupadas aqui, sem
// mudar nenhuma conta — ver ESTADO_ATUAL.md pra mapa completo da reorganização). Chamada logo depois
// de recalcularReembolsos() (precisa de REG.operacional.reembolsoPassThroughCorporativo já
// calculado). `REG.totalOpDetalhe.recorrencias/assinaturas` (usados aqui via `D`) já vêm prontos de
// recalcularMercadoPago(), chamada antes.
//
// Duas atribuições duplicadas no arquivo original (`REG.evolucao.totalOperacional[0]` e
// `REG.evolucao.necessidadeLiquida[0]`, reatribuídas mais adiante com o MESMO valor) foram
// consolidadas numa única atribuição cada — resultado final idêntico, zero comportamento alterado.
function recalcularNecessidade(){
  const r2 = x => Math.round(x*100)/100;
  const D = REG.totalOpDetalhe;

  // CORRIGIDO 14/08/2026 (achado do usuário: card 05 "Desemprego extremo" mostrava R$9.223,66,
  // card 03 "Soma do piso absoluto" mostrava R$7.831,17 — não batiam). REG.reserva.piso e
  // deficitZero.piso[0] ainda liam VARS.reservaPiso, literal congelado de antes de 11/08/2026
  // (quando Boletos subiu e Consórcios zerou com a migração dos consórcios Porto pro boleto).
  // pisoTotal (hydrate-resumo-cartoes.js) já tinha sido corrigido em 13/08 pra somar os mesmos 6
  // componentes ao vivo — só esse literal ficou pra trás. Agora os 3 consumidores derivam da MESMA
  // fórmula, nunca mais podem dessincronizar.
  REG.reserva.piso = r2(D.boletos + D.parcelas + D.consorcios + D.recorrencias + D.provMP + D.assinaturas);
  if(REG.deficitZero && Array.isArray(REG.deficitZero.piso)) REG.deficitZero.piso[0] = REG.reserva.piso;

  // V128 (bug real apontado pelo usuario): entradasTotais agora DERIVADO de salario+reembolsoCicloTotal, nunca mais um numero fixo que "esquecia" de atualizar quando o reembolso mudava de status (a receber -> recebido).
  REG.operacional.entradasTotais = r2(REG.operacional.salario + REG.operacional.reembolsoCicloTotal - REG.operacional.reembolsoPassThroughCorporativo);
  REG.balanco.fluxo.entradas = REG.operacional.entradasTotais; // fonte unica - antes eram 2 copias que podiam divergir

  // Total Operacional = soma literal dos 7 componentes (mesma formula documentada na Politica sec.13/TOTAL_OPERACIONAL)
  // CORRIGIDO 12/08/2026 (achado do usuario: a tela dizia "so a sobra total [linha 5 da cascata]
  // abate a Necessidade Total e vira Necessidade Liquida" mas o codigo usava VARS.coberturaGarantidaConfirmada,
  // campo manual desconectado da Sobra Total desde a V175 (26/07) - texto e formula dessincronizados
  // havia mais de 2 semanas. Cobertura Garantida volta a ser automatica = Sobra Total da cascata de
  // reembolso (REG.operacional.reembolsoSobraPessoal, ja calculado por recalcularReembolsos(), chamada
  // logo antes desta funcao) MENOS o "Manejo/Movimentacao" (VARS.reembolsoManejo, manual) - quanto da
  // sobra o usuario ja confirmou ter usado/reservado pra outra coisa este ciclo. Diferente da FORMULA
  // antiga rejeitada em V175 (totalOpProvMP + reembolsoPagaCartaoCorporativo, que somava DIVIDAS que
  // iam ser pagas de qualquer jeito) - Sobra Total ja e dinheiro que sobrou DEPOIS das 4 pernas da
  // cascata, nao uma divida disfarcada. Math.max(0,...) evita Cobertura Garantida negativa se o
  // usuario registrar mais Manejo do que a sobra disponivel (sinal de erro de digitacao, nunca deixa
  // a Necessidade Liquida "subir" por causa disso).
  REG.operacional.coberturaGarantida = r2(Math.max(0, REG.operacional.reembolsoSobraPessoal - (VARS.reembolsoManejo || 0)));
  const snapAtual = VARS.CICLO_SNAPSHOTS[VARS.cicloAtual];
  if(snapAtual && snapAtual.fechado){
    // V177 (26/07/2026, pedido do usuario): "esses dados nao sao os corretos para o ciclo anterior" -
    // Total Operacional/Necessidade sao formulas derivadas de valores VIVOS (parcelas, consorcios, etc)
    // que nao tem versao congelada por componente. Em vez de reconstruir cada um separadamente (LIVRO_LRP,
    // LIVRO_LRCON antigos etc - trabalho grande), aplicamos os 2 valores FINAIS ja congelados no proprio
    // snapshot (necessidadeTotalBruta/necessidadeTotalLiquida ja existiam la, mas nunca eram de fato usados).
    REG.operacional.necessidadeTotalBruta = snapAtual.necessidadeTotalBruta;
    REG.operacional.necessidadeLiquida = snapAtual.necessidadeTotalLiquida;
    REG.operacional.totalOperacional = r2(snapAtual.necessidadeTotalBruta - REG.operacional.orcamentoOperacional);
  } else {
    REG.operacional.totalOperacional = r2(D.boletos + D.parcelas + D.consorcios + D.recorrencias + D.aportesPat + D.provMP + D.assinaturas);
    REG.operacional.necessidadeTotalBruta = r2(REG.operacional.totalOperacional + REG.operacional.orcamentoOperacional);
    REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  }

  // CORRIGIDO 10/08/2026: ajuste de déficit de caixas negativas sem LREI (política 09/08/2026, ver
  // hydrate-deficit-caixas-sem-lrei.js) precisa ser REAPLICADO toda vez que a necessidade é
  // recalculada, não só uma vez no momento em que o fetch V2 termina — senão qualquer recálculo
  // posterior (ex: provMP atualizando depois da Onda 5) reseta a necessidade e "esquece" o déficit
  // já contabilizado, mesmo bug de raiz que motivou esta correção. `REG.operacional.deficitCaixasSemLrei`
  // é 0 até a política calcular um valor real; `|| 0` cobre a primeira chamada, antes desse fetch existir.
  REG.operacional.deficitCaixasSemLrei = REG.operacional.deficitCaixasSemLrei || 0;
  REG.operacional.necessidadeTotalBruta = r2(REG.operacional.necessidadeTotalBruta + REG.operacional.deficitCaixasSemLrei);
  REG.operacional.necessidadeLiquida = r2(REG.operacional.necessidadeTotalBruta - REG.operacional.coberturaGarantida);
  REG.operacional.saldoCiclo = r2(REG.balanco.fluxo.entradas - REG.operacional.necessidadeTotalBruta);

  // NOVO 05/08/2026 (parte 102, pedido do usuario: "todo valor nao pode depender de nada manual, tudo
  // precisa buscar referencia de uma base de dados... o valor de necessidade do mes e o alivio de
  // pressao sao interligados, deve haver uma base unica"). Projecao dos proximos 12 ciclos, agora
  // FORMULA, nao mais 12 numeros digitados: parcelas (data real de termino via parcelaAtual/
  // totalParcelas) E aportes patrimoniais incrementais (via calcularAporteIncrementalPorCiclo, MESMA
  // fonte usada pelo grafico Alivio de Pressao - nunca mais 2 implementacoes separadas) mudam mes a
  // mes de verdade agora. Boletos/Assinaturas/Recorrencias/Consorcios/Orcamento seguem como o valor
  // do ciclo atual (nao ha dado real de quando cada um muda no futuro).
  function somaParcelasProjetadas(cicloOffset){
    const somaLista = (lista)=> lista.reduce((s,p)=>{
      if(p.status !== 'ATIVO') return s;
      const parcelasRestantes = p.totalParcelas - p.parcelaAtual; // quantos ciclos AINDA faltam, alem do atual
      return (cicloOffset <= parcelasRestantes) ? s + p.valor : s;
    }, 0);
    return r2(somaLista(VARS.PARCELAMENTOS_VISA||[]) + somaLista(VARS.PARCELAMENTOS_MP||[]));
  }
  // aportesPat do ciclo atual (D.aportesPat, valor real confirmado) e o ANCORA - meses futuros aplicam
  // so o DELTA do calendario de caixas incrementais (calcularAporteIncrementalPorCiclo(i) - calcularAporteIncrementalPorCiclo(0)),
  // nunca substituem o valor de hoje por uma soma reconstruida do zero (evita perder algum componente
  // de aportesPat que nao faca parte das 4-5 caixas incrementais mapeadas, ex: aporte BTG regular).
  const aporteIncrementalHoje = calcularAporteIncrementalPorCiclo(0);
  // CORRIGIDO 10/08/2026 (achado do usuário: "porque o total operacional está mais alto mês que vem
  // se a tendência é as contas irem eliminando" — bug real confirmado): D.provMP (parcelas Mercado
  // Pago ATIVAS, VARS.totalOpProvMP) estava contado AQUI como componente fixo E DE NOVO dentro de
  // somaParcelasProjetadas() abaixo (que soma PARCELAMENTOS_VISA + PARCELAMENTOS_MP, com decaimento
  // real por parcela restante) — dupla contagem em TODO mês projetado (índice 1+), nunca no índice 0
  // (que usa REG.operacional.totalOperacional, sem essa duplicação). Resultado: qualquer mês futuro
  // saía artificialmente mais alto que o atual. Removido daqui — só Boletos/Consórcios/Recorrências/
  // Assinaturas ficam fixos (mesma lista já documentada no comentário abaixo), MP/Visa decaem juntos
  // via somaParcelasProjetadas(), única fonte agora.
  const baseFixaOperacional = r2(D.boletos + D.consorcios + D.recorrencias + D.assinaturas);
  REG.evolucao = REG.evolucao || {};
  REG.evolucao.totalOperacional = [];
  REG.evolucao.necessidadeLiquida = [];
  // NOVO 10/08/2026 (achado do usuário: "os valores de necessidade líquida e operacional não
  // refletem com os valores que vejo na aba Cenários" — confirmado bug real: a tabela "NECESSIDADE
  // (PAGA TUDO)" da aba Cenários lia REG.superavitNormal.necessidade, um array LITERAL congelado
  // desde V150/25-07-2026 nos índices 1-11 (só o índice 0 era resincronizado, ver comentário V203
  // abaixo) — o gráfico "Necessidade líquida" da aba Gráficos já usava a fórmula viva
  // (REG.evolucao.necessidadeLiquida). Duas fontes pro mesmo conceito = elas dessincronizam assim
  // que qualquer parcela/aporte muda depois de 25/07. Corrigido pela raiz: necessidadeBruta agora é
  // um array vivo aqui, e REG.superavitNormal.necessidade abaixo passa a ser a MESMA referência (não
  // uma cópia) — impossível dessincronizar de novo, os dois nomes sempre apontam pro mesmo array.
  REG.evolucao.necessidadeBruta = [];
  // CORRIGIDO 20/08/2026 (pedido explícito do usuário: "se eu vou cobrir as caixas negativas com o
  // salário de 25/08, é lógico que esses custos têm que ser somados à necessidade do próximo ciclo" —
  // antes o déficit de caixas sem LREI (aplicarDeficitCaixasSemLrei()) só entrava na Necessidade Bruta
  // do índice 0 (ciclo atual), nunca nos índices projetados 1-11, mesmo esses sendo exatamente os
  // valores comparados contra o salário esperado nos cards "Necessidade × Salário"/"Estimador".
  // Mesmo tratamento das outras 4 linhas "fixas" (Boletos/Consórcios/Recorrências/Assinaturas, ver
  // baseFixaOperacional acima): sem dado real de como cada caixa vai evoluir mês a mês, assume-se o
  // valor de HOJE constante pra frente — quando a caixa for de fato corrigida, o próximo recálculo
  // (ao vivo) já reflete o déficit menor/zerado automaticamente, nenhum valor fica "travado".
  for(let i=0;i<12;i++){
    const parcelasProj = somaParcelasProjetadas(i);
    const aportesPatProj = r2(D.aportesPat + (calcularAporteIncrementalPorCiclo(i) - aporteIncrementalHoje));
    const totalOpProj = r2(baseFixaOperacional + aportesPatProj + parcelasProj);
    const necBrutaProj = r2(totalOpProj + REG.operacional.orcamentoOperacional + REG.operacional.deficitCaixasSemLrei);
    const coberturaProj = i===0 ? REG.operacional.coberturaGarantida : 0; // cobertura garantida so existe confirmada pro ciclo atual, nunca projetada pra frente (regra 04 - nao chutar confirmacao futura)
    REG.evolucao.totalOperacional.push(totalOpProj);
    REG.evolucao.necessidadeBruta.push(necBrutaProj);
    REG.evolucao.necessidadeLiquida.push(r2(necBrutaProj - coberturaProj));
  }
  // ciclo atual (indice 0) sempre usa o valor JA COMPUTADO acima (fonte real do ciclo, pode incluir
  // ajustes/overrides que a formula generica de parcelas nao capturaria) - so os indices 1+ sao 100%
  // projecao por formula.
  REG.evolucao.totalOperacional[0] = REG.operacional.totalOperacional;
  REG.evolucao.necessidadeBruta[0] = REG.operacional.necessidadeTotalBruta;
  REG.evolucao.necessidadeLiquida[0] = REG.operacional.necessidadeLiquida;

  REG.balanco.fluxo.saidas = REG.operacional.necessidadeTotalBruta; // CORRIGIDO V150: era numero fixo, agora e a mesma Necessidade Total Bruta (Boletos+Parcelas+Assinaturas+Recorrencias+Consorcios+AportesPatrimoniais+OrcamentoOperacional). Movido para APOS necessidadeTotalBruta ser calculado (ordem de execucao).
  REG.balanco.fluxo.resultado = r2(REG.balanco.fluxo.entradas - REG.balanco.fluxo.saidas); // CORRIGIDO V150: era numero fixo, agora e Entradas-Saidas de verdade

  // CORRIGIDO 25/07/2026 (V143→V144, erro do Claude apontado pelo usuario): o pro-labore NAO substitui o
  // salario real nos calculos - ele so decide o ROTEAMENTO do excedente/complemento (Fundo de Suavizacao,
  // secao 16 Politicas). Modo Operacional continua reagindo ao saldoCiclo real (dinheiro de verdade
  // disponivel), exatamente como sempre funcionou (secao 10 Politicas). O pro-labore e so o "pulmão":
  // mes bom (salario real > R$11.000) manda o excedente pra Conta Suavizacao; mes fraco (salario real <
  // R$11.000) a Conta Suavizacao complementa a diferenca ANTES do resto do sistema calcular qualquer coisa
  // - entao na pratica o sistema sempre "ve" pelo menos R$11.000 disponivel, nunca menos. O calculo abaixo
  // e so informativo (quanto seria o excedente/complemento deste ciclo), NAO mexe no Modo Operacional.
  REG.operacional.excedenteOuComplementoProLabore = r2(REG.operacional.salario - REG.operacional.proLaboreFixo);
  if(REG.operacional.saldoCiclo < 0) REG.operacional.modoOperacional = 'Crítico';
  else if(REG.operacional.saldoCiclo < 3000) REG.operacional.modoOperacional = 'Baixo';
  else if(REG.operacional.saldoCiclo < 8000) REG.operacional.modoOperacional = 'Normal';
  else REG.operacional.modoOperacional = 'Alto';

  // V203 (varredura de bugs, índice 0) + CORRIGIDO 10/08/2026 (varredura desta sessão, índices 1-11,
  // ver comentário grande acima): REG.superavitNormal.necessidade inteiro agora É
  // REG.evolucao.necessidadeBruta (mesma referência de array, não uma cópia) — a tabela "NECESSIDADE
  // (PAGA TUDO)" da aba Cenários passa a ler exatamente a mesma fonte viva do gráfico da aba Gráficos.
  if(REG.superavitNormal) REG.superavitNormal.necessidade = REG.evolucao.necessidadeBruta;
  // V138: elimina duplicacao - antes o mesmo numero vivia em REG.estimador.necessidadeLiquidaProximoCiclo
  // (literal solto) E em REG.evolucao.necessidadeLiquida[1] (array). Agora so o array e fonte, o estimador le dele.
  REG.estimador.necessidadeLiquidaProximoCiclo = REG.evolucao.necessidadeLiquida[1];

  // NOVO 16/08/2026 (pedido do usuário: "quero recalcular a Necessidade Líquida gravada no Supabase,
  // não só ao vivo no site" — antes disso, quem perguntasse "quanto é minha necessidade agora" via
  // Chat/Supabase direto não tinha como saber, porque este cálculo inteiro só existia em memória no
  // navegador, nunca persistido. Mesmo padrão exato de registrar_pib_mensal (recalcular-indicadores.js):
  // RPC própria (`registrar_indicador`), protegida por login, fire-and-forget (não trava o render se a
  // rede falhar) — grava só o RESULTADO final, não muda onde/como o cálculo acontece (continua 100%
  // síncrono em JS, esta linha só persiste o output). Roda toda vez que a Necessidade recalcula (boot +
  // toda vez que aplicarDeficitCaixasSemLrei() reprocessa), mesma cadência de registrar_pib_mensal.
  if(typeof fetch !== 'undefined'){
    const tokenAuthIndicador = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';
    const registrarIndicador = (nome, valor) => fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/registrar_indicador', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg',
        'Authorization': 'Bearer ' + tokenAuthIndicador
      },
      body: JSON.stringify({ p_nome: nome, p_valor: valor })
    }).catch(err => console.warn(`registrar_indicador(${nome}): erro de rede (não crítico, tela já mostra o valor calculado)`, err));
    registrarIndicador('necessidadeTotalBruta', REG.operacional.necessidadeTotalBruta);
    registrarIndicador('necessidadeLiquida', REG.operacional.necessidadeLiquida);
  }
}
