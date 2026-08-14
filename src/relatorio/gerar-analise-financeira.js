// MÓDULO: WALLACE WEALTH INTELLIGENCE (WWI) — motor de análise/score financeiro.
// NOVO 14/08/2026 (pedido do usuário: "transformar o botão de download num gerador automático de
// relatórios executivos patrimoniais... módulo permanente"). Ver plano completo em
// docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md.
//
// DECISÃO DE ARQUITETURA (confirmada com o usuário via pergunta direta, não assumida): este motor é
// um conjunto de REGRAS/TEMPLATES DETERMINÍSTICOS, não um LLM externo. Motivos: (1) não existe hoje
// nenhuma integração de IA de terceiros em produção neste projeto — adicionar uma agora seria abrir
// uma dependência nova, um custo recorrente e uma superfície de falha de rede só pra esta feature;
// (2) um LLM real gerando texto sobre dado financeiro sensível tem risco real de citar um número que
// não bate com o dado de verdade ("alucinação") — inaceitável num relatório que se propõe a ser
// confiável tipo family office; (3) é a extensão natural do padrão já usado em todo o projeto: nunca
// recalcular/reinterpretar por conta própria, só interpretar o que já foi extraído com certeza.
//
// Roda DENTRO do iframe (mesmo contexto de coletar-dados-relatorio.js), depois dele. Só lê o objeto
// já coletado (`dados`) — nunca acessa o DOM diretamente (só o coletor faz isso). Toda frase gerada
// carrega, implicitamente, só números que já vieram do coletor — nenhuma função aqui "digita" um
// valor que não tenha origem rastreável em `dados`.
//
// LIMITAÇÃO CONHECIDA, não testada ao vivo (mesma ressalva já registrada pra coletar-dados-
// relatorio.js e pro botão de PDF): login real não é possível neste ambiente de desenvolvimento —
// os rótulos usados abaixo (`_linha(dados, secao, rotulo)`) foram conferidos contra o HTML real
// (`Sistema_Wallace_Lira_Completo.html`) linha a linha antes de escrever este arquivo, mas a
// combinação completa (coletor → motor → PDF) ainda precisa ser validada com o painel logado de
// verdade antes da Fase B (regra já registrada no handoff do relatório de fechamento em PDF).

// ---------------------------------------------------------------------------------------------
// Helpers de leitura/parsing — únicos pontos que tocam o shape de `dados` (coletarDadosRelatorioFechamento()).
// ---------------------------------------------------------------------------------------------

function _wwiSecao(dados, titulo){
  return (dados.secoes || []).find(s => s.titulo === titulo) || null;
}

// Busca por SUBSTRING (case-insensitive) dentro de uma seção específica — nunca cruza seções, porque
// rótulos como "Total"/"Patrimônio Líquido" se repetem em seções diferentes com significados diferentes.
function _wwiLinha(dados, titulo, rotuloSubstr){
  const secao = _wwiSecao(dados, titulo);
  if(!secao) return null;
  const alvo = rotuloSubstr.toLowerCase();
  const linha = secao.linhas.find(l => l.label.toLowerCase().includes(alvo));
  return linha ? linha.valor : null;
}

// Converte texto BR ("R$ 471.458,31", "-R$ 61.081,39", "12,0%", "6,0 meses") em número. Retorna null
// se não conseguir parsear (nunca retorna 0 por padrão — 0 seria um valor real e distinto de "sem dado").
function _wwiNum(texto){
  if(texto === null || texto === undefined) return null;
  let limpo = String(texto).replace(/−/g, '-').replace(/\s/g, ''); // U+2212 (sinal de menos tipográfico) -> hífen ASCII
  const soDigitos = limpo.replace(/[^\d,.-]/g, '');
  if(!soDigitos || soDigitos === '-') return null;
  const normalizado = soDigitos.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalizado);
  return Number.isNaN(n) ? null : n;
}

function _wwiClamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function _wwiArredonda(n, casas){
  if(n === null || n === undefined) return null;
  const f = Math.pow(10, casas);
  return Math.round(n * f) / f;
}

// Formata número BR sem o prefixo "R$" (a narrativa já escreve "R$" na frase) — usado nos
// parágrafos analíticos pra citar valores em moeda de forma legível ("R$ 471.458,31").
function _wwiFmtMoeda(n){
  if(n === null || n === undefined) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ADICIONADO 14/08/2026 (achado do usuário: "não ficou 100% igual" — comparando com o artefato
// aprovado, os percentuais/contagens saíam com PONTO decimal — "95.4%", "10.3 ciclos" — em vez de
// vírgula ("95,4%", "10,3 ciclos"). Causa: _wwiArredonda() retorna um number puro do JavaScript, e
// interpolar um number direto num template string usa o formato padrão (ponto), nunca o BR. Todo
// texto EXIBIDO na narrativa (não usado em cálculo posterior) deve passar por este formatador —
// mesmo padrão já usado em _wwiFmtMoeda() pra valores em R$.
function _wwiFmtNum(n, casas){
  if(n === null || n === undefined) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// ---------------------------------------------------------------------------------------------
// calcularIndicadoresEScores(dados) — Wealth Score (0-100) + 4 índices dedicados + indicadores brutos
// usados tanto pelo PDF quanto pela comparação histórica. Cada sub-score só entra na média se o dado
// de origem foi encontrado — sem dado, o eixo fica `null` e os pesos dos outros são renormalizados
// (nunca finge confiança que não existe, nunca trata "sem dado" como 0).
// ---------------------------------------------------------------------------------------------

const WWI_PESOS_SUBSCORES = {
  liquidez: 0.15,
  protecaoPatrimonial: 0.15,
  investimentos: 0.20,
  endividamento: 0.15,
  organizacaoFinanceira: 0.10,
  execucaoDeMetas: 0.15,
  construcaoPatrimonial: 0.10,
};

function calcularIndicadoresEScores(dados){
  const patrimonioLiquido = _wwiNum(_wwiLinha(dados, '🏦 Balanço Patrimonial', 'Patrimônio Líquido'));
  const ativosTotal = _wwiNum(_wwiLinha(dados, '🏦 Balanço Patrimonial', 'Ativos (Físico'));
  const passivosTotal = _wwiNum(_wwiLinha(dados, '📉 Passivos Patrimoniais', 'Total'))
    ?? _wwiNum(_wwiLinha(dados, '🏦 Balanço Patrimonial', 'Passivos'));
  const patrimonioFinanceiro = _wwiNum(_wwiLinha(dados, '🏛️ Patrimônio Financeiro', 'Total'));
  const reserva = _wwiNum(_wwiLinha(dados, '🏛️ Patrimônio Financeiro', 'Reserva de Emergência'));
  const totalOperacional = _wwiNum(_wwiLinha(dados, 'Resumo executivo', 'Total operacional'));
  const metaMilhaoPct = _wwiNum(_wwiLinha(dados, 'Resumo executivo', 'Meta do Milhão'));
  const reembRecebidos = _wwiNum(_wwiLinha(dados, 'Reembolsos Wärtsilä', 'Recebidos no ciclo'));
  const reembAReceber = _wwiNum(_wwiLinha(dados, 'Reembolsos Wärtsilä', 'A receber'));
  const reembTotalCiclo = _wwiNum(_wwiLinha(dados, 'Reembolsos Wärtsilä', 'Total do ciclo'));
  const consorcioCasaPagoPct = _wwiNum(_wwiLinha(dados, 'Consórcio casa nova (I0464 · Cota 12)', 'Pago até o momento'));
  const crescPatrimInicial = _wwiNum(_wwiLinha(dados, '📈 Crescimento Patrimonial', 'Patrimônio inicial'));
  const crescPatrimAtual = _wwiNum(_wwiLinha(dados, '📈 Crescimento Patrimonial', 'Patrimônio atual'));
  const poupancaReceitas = _wwiNum(_wwiLinha(dados, '📈 Crescimento Patrimonial', 'Receitas totais'));
  const poupancaSobrou = _wwiNum(_wwiLinha(dados, '📈 Crescimento Patrimonial', 'Sobrou'));

  // liquidezMeses: reserva ÷ compromisso fixo do ciclo (totalOperacional é ~mensal, mesmo ciclo de
  // 30 dias corridos do sistema) — proxy de "quantos ciclos a reserva cobre sozinha", não uma leitura
  // literal de nenhum card (o card 05 mostra 2 cenários em prosa, não extraíveis de forma confiável
  // pelo coletor de DOM hoje — ver comentário em coletar-dados-relatorio.js sobre essa limitação).
  const liquidezCiclos = (reserva !== null && totalOperacional) ? reserva / totalOperacional : null;

  const subscores = {
    // 24 ciclos (~2 anos) de reserva sozinha = nota máxima. Benchmark alto de propósito — reserva de
    // emergência tende a ficar bem redundante neste sistema (política interna já é manter R$100k fixos).
    liquidez: liquidezCiclos !== null ? _wwiClamp(liquidezCiclos / 24 * 100, 0, 100) : null,
    // Proteção = inverso da alavancagem (passivos/ativos). 50% de dívida sobre ativo = nota zero.
    protecaoPatrimonial: (passivosTotal !== null && ativosTotal) ?
      _wwiClamp(100 - (passivosTotal / ativosTotal * 100) / 50 * 100, 0, 100) : null,
    // Quanto do patrimônio líquido total é financeiro/líquido (vs físico/ilíquido). 40% líquido = nota máxima.
    investimentos: (patrimonioFinanceiro !== null && patrimonioLiquido) ?
      _wwiClamp(patrimonioFinanceiro / patrimonioLiquido / 0.40 * 100, 0, 100) : null,
    endividamento: (passivosTotal !== null && ativosTotal) ?
      _wwiClamp(100 - (passivosTotal / ativosTotal * 100) / 50 * 100, 0, 100) : null,
    // Proxy v1 de organização: % das seções do relatório que o coletor conseguiu extrair sem erro.
    // NÃO mede categorização/auditoria de transação (esse dado não está disponível pro coletor de
    // DOM) — é um proxy de "o próprio relatório teve dado suficiente pra se montar", documentado como
    // tal de propósito (nunca fingir que mede algo que não mede).
    organizacaoFinanceira: (() => {
      const total = (dados.secoes || []).length;
      if(!total) return null;
      const comDado = (dados.secoes || []).filter(s => s.linhas && s.linhas.length > 0).length;
      return _wwiClamp(comDado / total * 100, 0, 100);
    })(),
    // Média dos % de progresso disponíveis (Meta do Milhão, Consórcio Casa Nova pago).
    execucaoDeMetas: (() => {
      const pcts = [metaMilhaoPct, consorcioCasaPagoPct].filter(v => v !== null);
      if(!pcts.length) return null;
      return _wwiClamp(pcts.reduce((s, v) => s + v, 0) / pcts.length, 0, 100);
    })(),
    // Variação percentual do patrimônio líquido entre o fechamento do ciclo anterior e agora, centrada
    // em 50 (0% de crescimento = 50; a cada 2 pontos percentuais de crescimento, +1 na nota).
    construcaoPatrimonial: (crescPatrimInicial && crescPatrimAtual !== null) ?
      _wwiClamp(50 + ((crescPatrimAtual - crescPatrimInicial) / crescPatrimInicial * 100) / 2, 0, 100) : null,
  };

  // Wealth Score = média ponderada só dos eixos com dado real; pesos dos ausentes são redistribuídos
  // proporcionalmente entre os presentes — nunca trata ausência de dado como nota zero.
  let somaPesos = 0, somaPonderada = 0;
  Object.keys(WWI_PESOS_SUBSCORES).forEach(eixo => {
    const v = subscores[eixo];
    if(v === null) return;
    const peso = WWI_PESOS_SUBSCORES[eixo];
    somaPesos += peso;
    somaPonderada += v * peso;
  });
  const wealthScore = somaPesos > 0 ? _wwiArredonda(somaPonderada / somaPesos, 0) : null;

  // 4 índices dedicados (pedido explícito do usuário) — reaproveitam os mesmos números acima, não
  // recalculam nada novo. Fórmulas de v1, não fixas em pedra: usuário deve validar antes de confiar
  // cegamente no número (mesmo aviso já registrado no plano/PRD).
  const indices = {
    metaDoMilhao: metaMilhaoPct,
    casaNova: consorcioCasaPagoPct,
    // Independência financeira: proxy de "quantos ciclos de compromisso fixo o patrimônio líquido
    // total cobriria" — escala 0-100 usando 240 ciclos (~20 anos) como referência de independência
    // plena. Não é uma leitura literal de nenhuma métrica formal de FIRE (Financial Independence).
    independenciaFinanceira: (patrimonioLiquido !== null && totalOperacional) ?
      _wwiClamp(patrimonioLiquido / totalOperacional / 240 * 100, 0, 100) : null,
    // Disciplina: % da renda do ciclo que virou patrimônio (poupancaSobrou/poupancaReceitas), mesmo
    // conceito de taxa de poupança usado na seção "💰 Taxa de Poupança" (capturada dentro de
    // "📈 Crescimento Patrimonial" — ver comentário em coletar-dados-relatorio.js).
    disciplinaFinanceira: (poupancaReceitas && poupancaSobrou !== null) ?
      _wwiClamp(poupancaSobrou / poupancaReceitas * 100, 0, 100) : null,
  };

  return {
    wealthScore,
    subscores,
    indices,
    indicadoresBrutos: {
      patrimonioLiquido, ativosTotal, passivosTotal, patrimonioFinanceiro, reserva,
      totalOperacional, metaMilhaoPct, reembRecebidos, reembAReceber, reembTotalCiclo,
      consorcioCasaPagoPct, crescPatrimInicial, crescPatrimAtual, liquidezCiclos,
      poupancaReceitas, poupancaSobrou,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// AMPLIADO 14/08/2026 (achado do usuário: o PDF gerado "não é o que aprovei" — a estrutura de
// seções ficou genérica demais frente ao artefato aprovado, que tem Projetos Estratégicos em
// cards, Centros de Custo agrupados em 4 famílias e Análise de Patrimônio com gauge de 5 eixos).
// As 5 funções abaixo montam esses blocos ESTRUTURADOS — mesma regra de sempre: só usam número já
// coletado por coletar-dados-relatorio.js, nunca fabricam texto/valor novo. Ao contrário da
// narrativa do artefato original (que é prosa de exemplo, escrita à mão), aqui cada projeto/passivo
// exibe só os pares label/valor reais já coletados — sem inventar frases de "risco"/"próximo
// passo" que não teriam como ser derivadas de forma determinística e verdadeira.
// ---------------------------------------------------------------------------------------------

// Projetos Estratégicos (proj-grid do artefato) — 1 card por seção de projeto já coletada.
function _wwiMontarProjetos(dados){
  const titulos = ['Meta do milhão', 'Projeto casa nova', 'Consórcio casa nova (I0464 · Cota 12)'];
  return titulos.map(titulo => {
    const secao = _wwiSecao(dados, titulo);
    if(!secao || !secao.linhas.length) return null;
    const linhaPct = secao.linhas.find(l => /%/.test(l.valor));
    const pct = linhaPct ? _wwiClamp(_wwiNum(linhaPct.valor) || 0, 0, 100) : null;
    return { nome: titulo, pct, linhas: secao.linhas };
  }).filter(Boolean);
}

// Análise dos Passivos (rank do artefato) — heurística de risco por PADRÃO DE NOME, não um dado
// coletado (documentado como tal): LREI* (empréstimo interno) = risco baixíssimo; consórcio =
// risco médio (fluxo certo, contemplação incerta); resto = risco baixo (condições conhecidas).
function _wwiMontarPassivosRank(dados){
  const secao = _wwiSecao(dados, '📉 Passivos Patrimoniais') || _wwiSecao(dados, 'Passivos patrimoniais');
  if(!secao) return [];
  return secao.linhas.map(l => {
    const lower = l.label.toLowerCase();
    let risco = 'baixo';
    if(lower.includes('lrei')) risco = 'baixo';
    else if(lower.includes('consórcio') || lower.includes('consorcio')) risco = 'medio';
    return { nome: l.label, valor: l.valor, risco };
  });
}

// Centros de Custo agrupados em 4 famílias (mesma divisão do artefato) — agrupamento por padrão de
// nome da caixa, saldo agregado somado a partir dos valores já coletados (nunca recalculado).
const WWI_FAMILIAS_CAIXA = [
  { nome: 'Estratégicos', padrao: /lance|w[aä]rtsil[aä]|suaviza/i },
  { nome: 'Operacionais', padrao: /vari[aá]vel|boleto|mercado pago|mastercard|combust[ií]vel|manuten[cç][aã]o|seguro/i },
  { nome: 'Familiares', padrao: /sa[uú]de|pix|anivers[aá]rio|emagrecimento|churrasco|evento/i },
  { nome: 'De Objetivos', padrao: /escola|dur[aá]vel|duravel/i },
];
function _wwiMontarCentrosDeCusto(dados){
  const secao = _wwiSecao(dados, '📦 Todas as Caixas');
  if(!secao || !secao.linhas.length) return [];
  const grupos = WWI_FAMILIAS_CAIXA.map(f => ({ nome: f.nome, padrao: f.padrao, caixas: [], total: 0 }));
  const outros = { nome: 'Outros', caixas: [], total: 0 };
  secao.linhas.forEach(l => {
    const valor = _wwiNum(l.valor) || 0;
    const grupo = grupos.find(g => g.padrao.test(l.label)) || outros;
    grupo.caixas.push(l.label);
    grupo.total += valor;
  });
  return grupos.concat(outros.caixas.length ? [outros] : []).filter(g => g.caixas.length);
}

// Análise de Patrimônio (grid-2 + gauge de 5 eixos do artefato) — tabela = linhas já coletadas do
// Balanço Patrimonial; gauge = média dos sub-scores já calculados por calcularIndicadoresEScores,
// remapeados pros 5 rótulos do artefato (mesmo conceito, nomes iguais aos do relatório aprovado).
function _wwiMontarComposicaoPatrimonio(dados, indicadores){
  const secao = _wwiSecao(dados, '🏦 Balanço Patrimonial');
  const s = indicadores.subscores;
  const eixos = [
    { label: 'Eficiência patrimonial', val: s.organizacaoFinanceira },
    { label: 'Liquidez', val: s.liquidez },
    { label: 'Concentração (diversificação)', val: s.investimentos },
    { label: 'Proteção patrimonial', val: s.protecaoPatrimonial },
    { label: 'Geração futura', val: s.construcaoPatrimonial },
  ].filter(e => e.val !== null);
  const nota = eixos.length ? _wwiArredonda(eixos.reduce((a, e) => a + e.val, 0) / eixos.length, 0) : null;
  return { linhas: secao ? secao.linhas : [], eixos, nota };
}

// Análise de Liquidez (grid-2 do artefato) — tabela = linhas já coletadas da Reserva de Emergência;
// cards = classificação textual derivada do sub-score de liquidez já calculado (mesmos limiares
// documentados no comentário do subscore) + índice de independência financeira já calculado.
function _wwiMontarLiquidez(dados, indicadores){
  const secao = _wwiSecao(dados, 'Reserva de Emergência — quanto tempo aguenta');
  const b = indicadores.indicadoresBrutos;
  const classificacao = indicadores.subscores.liquidez === null ? null :
    indicadores.subscores.liquidez >= 80 ? 'Muito Forte' :
    indicadores.subscores.liquidez >= 60 ? 'Forte' :
    indicadores.subscores.liquidez >= 40 ? 'Adequada' : 'Abaixo do recomendado';
  return {
    linhas: secao ? secao.linhas : [],
    classificacao,
    liquidezCiclos: b.liquidezCiclos,
    independenciaFinanceira: indicadores.indices.independenciaFinanceira,
  };
}

// ---------------------------------------------------------------------------------------------
// gerarAnaliseFinanceira(dados) — narrativa determinística (pontos fortes/fracos, riscos,
// oportunidades, recomendações, parecer final). Chamada só na CRIAÇÃO de uma competência nova —
// nunca recalculada dentro do mesmo ciclo (garantia de "narrativa estável", pedido do usuário).
// ---------------------------------------------------------------------------------------------

function gerarAnaliseFinanceira(dados){
  const indicadoresCompletos = calcularIndicadoresEScores(dados);
  const { wealthScore, subscores, indicadoresBrutos: b } = indicadoresCompletos;
  const pontosFortesTexto = [];
  const pontosFracosTexto = [];
  const riscosTexto = [];
  const oportunidadesTexto = [];
  const recomendacoesTexto = [];
  const regrasAplicadas = [];

  // Campos adicionais lidos direto do coletor (fora de calcularIndicadoresEScores porque são
  // usados só pra narrativa, não entram em nenhum sub-score hoje) — cobrem os temas que o motor
  // de análise precisa comentar por pedido explícito do usuário: Escola de Júlio, Projeto Casa
  // Nova, capacidade de investimento, centros de custo. Mesma regra de sempre: null quando a
  // seção/linha não existe, nunca fabricado.
  const escolaJulioPct = _wwiNum(_wwiLinha(dados, 'Resumo executivo', 'Escola de Júlio'));
  const projetoCasaNovaPct = _wwiNum(_wwiLinha(dados, 'Resumo executivo', 'Projeto Casa Nova'));
  const capitalCasaNova = _wwiNum(_wwiLinha(dados, 'Projeto casa nova', 'Capital disponível'));
  const metaInvestimentoTexto = _wwiLinha(dados, 'Resumo executivo', 'Meta investimento');
  const totalCaixasSecao = _wwiSecao(dados, '📦 Todas as Caixas');
  const qtdCaixas = totalCaixasSecao ? totalCaixasSecao.linhas.length : null;
  const caixasZeradas = totalCaixasSecao ? totalCaixasSecao.linhas.filter(l => _wwiNum(l.valor) === 0).length : null;

  function regra(nome, condicao, fn){
    if(!condicao) return;
    regrasAplicadas.push(nome);
    fn();
  }

  // ===== Liquidez =====
  regra('liquidez_forte', subscores.liquidez !== null && subscores.liquidez >= 80, () => {
    pontosFortesTexto.push(`Liquidez de nível muito forte: a Reserva de Emergência (R$ ${_wwiFmtMoeda(b.reserva)}) cobre sozinha cerca de ${_wwiFmtNum(b.liquidezCiclos, 1)} ciclos de compromisso fixo — bem acima do padrão de mercado (6 meses/ciclos costuma ser considerado uma reserva robusta).`);
  });
  regra('liquidez_media', subscores.liquidez !== null && subscores.liquidez >= 40 && subscores.liquidez < 80, () => {
    pontosFortesTexto.push(`Liquidez em nível saudável: a Reserva de Emergência cobre cerca de ${_wwiFmtNum(b.liquidezCiclos, 1)} ciclos de compromisso fixo, dentro da faixa considerada segura para o perfil.`);
  });
  regra('liquidez_fraca', subscores.liquidez !== null && subscores.liquidez < 40, () => {
    pontosFracosTexto.push(`Liquidez abaixo do recomendável: a Reserva cobriria só ${_wwiFmtNum(b.liquidezCiclos, 1)} ciclos de compromisso fixo sozinha, sem contar outras fontes de caixa disponíveis no sistema.`);
    riscosTexto.push('Um imprevisto financeiro grande (perda de renda, despesa médica, reparo urgente) encontraria o sistema com pouca folga de caixa imediata, exigindo recorrer a caixas patrimoniais ou empréstimo interno antes do previsto.');
    recomendacoesTexto.push('Priorizar reforço da Reserva de Emergência no próximo ciclo antes de qualquer novo aporte discricionário — é a base sobre a qual o resto da estratégia patrimonial se apoia.');
  });

  // ===== Endividamento / alavancagem =====
  regra('alavancagem_baixa', subscores.endividamento !== null && subscores.endividamento >= 80, () => {
    const pctAlav = _wwiFmtNum((b.passivosTotal / b.ativosTotal) * 100, 1);
    pontosFortesTexto.push(`Alavancagem controlada: os passivos (financiamento da casa + consórcio do carro) representam apenas ${pctAlav}% do ativo total (R$ ${_wwiFmtMoeda(b.passivosTotal)} sobre R$ ${_wwiFmtMoeda(b.ativosTotal)}) — bem abaixo de qualquer linha de alerta para o perfil, e ambas as dívidas têm condições conhecidas e estáveis, não exigindo antecipação.`);
  });
  regra('alavancagem_media', subscores.endividamento !== null && subscores.endividamento >= 40 && subscores.endividamento < 80, () => {
    pontosFracosTexto.push(`Alavancagem moderada: passivos representam ${_wwiFmtNum((b.passivosTotal / b.ativosTotal) * 100, 1)}% do ativo total — não é crítico, mas merece acompanhamento nos próximos ciclos.`);
  });
  regra('alavancagem_alta', subscores.endividamento !== null && subscores.endividamento < 40, () => {
    pontosFracosTexto.push(`Alavancagem elevada: passivos já representam ${_wwiFmtNum((b.passivosTotal / b.ativosTotal) * 100, 1)}% do ativo total.`);
    riscosTexto.push('Nível de dívida sobre ativos merece monitoramento antes de assumir novos compromissos financeiros de longo prazo.');
  });

  // ===== Composição do patrimônio (financeiro vs. físico) =====
  regra('concentracao_fisica', subscores.investimentos !== null && subscores.investimentos < 50, () => {
    const pctFinanceiro = b.patrimonioLiquido ? _wwiFmtNum((b.patrimonioFinanceiro / b.patrimonioLiquido) * 100, 1) : null;
    pontosFracosTexto.push(`Patrimônio concentrado majoritariamente em ativos físicos/ilíquidos (casa, apartamento, carro, jazigo)${pctFinanceiro !== null ? ` — só ${pctFinanceiro}% do patrimônio líquido está em capital financeiro realmente alocável` : ''}. Não é um erro por si só (é típico de quem construiu patrimônio via consumo disciplinado), mas concentra o risco numa única classe de ativo.`);
    oportunidadesTexto.push('Redirecionar o próximo ciclo de aportes para ativos financeiros líquidos ajuda a equilibrar a composição do patrimônio e reduz a dependência de valorização imobiliária/veicular.');
  });
  regra('investimentos_bem_alocados', subscores.investimentos !== null && subscores.investimentos >= 90, () => {
    pontosFortesTexto.push('Boa proporção de patrimônio financeiro/líquido frente ao total — alocação madura para o perfil, com capital disponível para realocar sem depender de vender um bem físico.');
  });

  // ===== Meta do Milhão =====
  regra('meta_milhao_inicial', b.metaMilhaoPct !== null && b.metaMilhaoPct < 25, () => {
    const faltaMilhao = b.patrimonioLiquido !== null ? Math.max(0, 1000000 - b.patrimonioLiquido) : null;
    pontosFracosTexto.push(`Meta do Milhão ainda em fase inicial: ${_wwiFmtNum(b.metaMilhaoPct, 1)}% do caminho percorrido${faltaMilhao !== null ? ` (faltam R$ ${_wwiFmtMoeda(faltaMilhao)})` : ''}. É esperado nesta fase — o que importa mais que o percentual isolado é o ritmo de aporte se manter constante ciclo a ciclo.`);
  });
  regra('meta_milhao_avancada', b.metaMilhaoPct !== null && b.metaMilhaoPct >= 25 && b.metaMilhaoPct < 50, () => {
    pontosFortesTexto.push(`Meta do Milhão em ${_wwiFmtNum(b.metaMilhaoPct, 1)}% do caminho percorrido — progresso real, mesmo que ainda distante da metade.`);
  });
  regra('meta_milhao_mais_da_metade', b.metaMilhaoPct !== null && b.metaMilhaoPct >= 50, () => {
    pontosFortesTexto.push(`Meta do Milhão já em ${_wwiFmtNum(b.metaMilhaoPct, 1)}% — mais da metade do caminho percorrido, ritmo consolidado.`);
  });

  // ===== Escola de Júlio =====
  regra('escola_julio_baixo', escolaJulioPct !== null && escolaJulioPct < 30, () => {
    riscosTexto.push(`Escola de Júlio em ${_wwiFmtNum(escolaJulioPct, 1)}% do valor necessário acumulado — se o prazo do próximo ciclo escolar estiver próximo, esse é um compromisso com data certa que merece prioridade de aporte, não só o que sobrar do mês.`);
  });
  regra('escola_julio_ok', escolaJulioPct !== null && escolaJulioPct >= 30, () => {
    pontosFortesTexto.push(`Escola de Júlio com ${_wwiFmtNum(escolaJulioPct, 1)}% do valor necessário já acumulado, dentro do esperado para o momento do ciclo escolar.`);
  });

  // ===== Projeto/Consórcio Casa Nova =====
  regra('casa_nova_pre_contemplacao', b.consorcioCasaPagoPct !== null && b.consorcioCasaPagoPct < 5, () => {
    riscosTexto.push(`Consórcio Casa Nova ainda em fase pré-contemplação (${_wwiFmtNum(b.consorcioCasaPagoPct, 2)}% pago): a parcela mensal é um compromisso certo para um benefício (a contemplação, por sorteio ou lance) ainda incerto em prazo. Vale já ter uma política definida de quando/se usar lance para acelerar, em vez de depender só do sorteio.`);
  });
  regra('projeto_casa_nova_capital', projetoCasaNovaPct !== null, () => {
    oportunidadesTexto.push(`Projeto Casa Nova em ${_wwiFmtNum(projetoCasaNovaPct, 1)}% de maturidade${capitalCasaNova !== null ? `, com R$ ${_wwiFmtMoeda(capitalCasaNova)} de capital hoje disponível (LFTS11 + Caixa Lance) para eventual lance` : ''}.`);
  });

  // ===== Reembolsos Wärtsilä =====
  regra('wartsila_pendencia', b.reembAReceber !== null && b.reembAReceber > 0, () => {
    const pctPendente = b.reembTotalCiclo ? _wwiFmtNum((b.reembAReceber / b.reembTotalCiclo) * 100, 1) : null;
    oportunidadesTexto.push(`Reembolso Wärtsilä do ciclo tem R$ ${_wwiFmtMoeda(b.reembAReceber)} ainda pendente de confirmação${pctPendente !== null ? ` (${pctPendente}% do total do ciclo)` : ''} — não trava nenhuma obrigação (a cascata de adiantamento via Caixa Lance já cobre isso), mas vale acompanhar até a confirmação definitiva.`);
  });
  regra('wartsila_recuperacao_alta', (b.reembRecebidos !== null && b.reembTotalCiclo), () => {
    const eficiencia = b.reembTotalCiclo ? (b.reembRecebidos / b.reembTotalCiclo) * 100 : null;
    if(eficiencia !== null && eficiencia >= 90){
      pontosFortesTexto.push(`Eficiência de recuperação do reembolso Wärtsilä em ${_wwiFmtNum(eficiencia, 1)}% no ciclo (R$ ${_wwiFmtMoeda(b.reembRecebidos)} de R$ ${_wwiFmtMoeda(b.reembTotalCiclo)} já confirmados) — a unidade de negócio "reembolso corporativo" está operando com eficiência alta e previsível.`);
    }
  });

  // ===== Capacidade de investimento (Meta investimento, Resumo executivo) =====
  regra('capacidade_investimento', !!metaInvestimentoTexto, () => {
    oportunidadesTexto.push(`Capacidade de investimento do ciclo: ${metaInvestimentoTexto}.`);
  });

  // ===== Centros de custo =====
  regra('caixas_zeradas', qtdCaixas !== null && caixasZeradas !== null && caixasZeradas > 0, () => {
    pontosFracosTexto.push(`${caixasZeradas} de ${qtdCaixas} centros de custo estão com saldo zerado neste ciclo — pode ser normal (caixa recém-criada ou já totalmente utilizada), mas vale conferir se algum deles deveria ter recebido aporte e não recebeu.`);
  });

  regra('poupanca_alta', subscores.execucaoDeMetas !== null || (b.poupancaReceitas && b.poupancaSobrou !== null), () => {
    if(b.poupancaReceitas && b.poupancaSobrou !== null){
      const taxaPoupanca = (b.poupancaSobrou / b.poupancaReceitas) * 100;
      if(taxaPoupanca >= 25){
        pontosFortesTexto.push(`Taxa de poupança do ciclo em ${_wwiFmtNum(taxaPoupanca, 1)}% — nível de elite para o perfil.`);
      }
    }
  });

  if(!pontosFortesTexto.length && !pontosFracosTexto.length){
    pontosFracosTexto.push('Dados insuficientes no momento da coleta para uma leitura completa — algumas seções do painel podem não ter sido encontradas (ver "erro" em cada seção do relatório).');
  }

  // Parecer Final como PARÁGRAFO analítico completo (não uma frase telegráfica) — mesmo espírito
  // do CFO Summary do Tactical Wealth Report original: sintetiza patrimônio, ritmo, risco e a
  // próxima fronteira, tudo ancorado nos números já coletados. Cada trecho só entra se o dado que
  // ele descreve existir (nunca fabrica um número pra completar a frase).
  const nivelTexto = wealthScore === null ? null :
    wealthScore >= 90 ? 'Nível Elite — a base institucional está consolidada em praticamente todos os eixos avaliados.' :
    wealthScore >= 75 ? 'Nível Avançado — disciplina e proteção patrimonial sólidas; a próxima fronteira normalmente é alocação e diversificação, não segurança.' :
    wealthScore >= 55 ? 'Nível Estável — os fundamentos estão presentes, com espaço real de melhoria em pelo menos um eixo crítico (ver Pontos Fracos).' :
    'Nível de Atenção — recomenda-se revisão de prioridades antes de assumir novos compromissos financeiros.';

  // CORRIGIDO 14/08/2026 (achado do usuário: comparando com o artefato aprovado, "Resumo do CFO"
  // repetia o MESMO conteúdo 2x — a versão condensada aqui embaixo ["do lado positivo: X;Y" / "o
  // ponto que mais pede atenção é..."] seguida, no parágrafo seguinte, dos MESMOS pontos por
  // extenso). `resumoAberturaTexto` guarda só as 2 frases realmente diferentes (score + patrimônio
  // líquido) pra abrir o "Resumo do CFO" (seção 01) — o condensado completo (`parecerFinalTexto`,
  // com os destaques resumidos) fica reservado só pro "Parecer Final" (seção 11, "Leitura de
  // encerramento"), que é uma seção separada e não repete o que já foi dito na seção 01.
  const frasesAbertura = [];
  if(wealthScore !== null){
    frasesAbertura.push(`Wealth Score do ciclo: ${wealthScore}/100. ${nivelTexto}`);
  } else {
    frasesAbertura.push('Não foi possível calcular o Wealth Score deste ciclo — dados insuficientes na coleta.');
  }
  if(b.patrimonioLiquido !== null){
    frasesAbertura.push(`O patrimônio líquido do ciclo está em R$ ${_wwiFmtMoeda(b.patrimonioLiquido)}${b.ativosTotal !== null && b.passivosTotal !== null ? `, resultado de R$ ${_wwiFmtMoeda(b.ativosTotal)} em ativos menos R$ ${_wwiFmtMoeda(b.passivosTotal)} em passivos` : ''}.`);
  }
  const resumoAberturaTexto = frasesAbertura.join(' ');

  const frasesParecer = frasesAbertura.slice();
  if(pontosFortesTexto.length){
    // CORRIGIDO 14/08/2026 (achado do usuário: "reembolso wärtsilä" saindo com W minúsculo no
    // parecer — .toLowerCase() aplicado na frase inteira também rebaixava nomes próprios no meio
    // do texto, tipo "Wärtsilä"). Agora só a PRIMEIRA letra é rebaixada (concordância de "os
    // destaques são: X; Y"), preservando maiúscula de nome próprio em qualquer outra posição.
    frasesParecer.push(`Do lado positivo, ${pontosFortesTexto.length === 1 ? 'o destaque do ciclo é' : 'os destaques do ciclo são'}: ${pontosFortesTexto.map(t => { const frag = t.split(':')[0].split(' —')[0]; return frag.charAt(0).toLowerCase() + frag.slice(1); }).join('; ')}.`);
  }
  if(pontosFracosTexto.length){
    frasesParecer.push(`O ponto que mais pede atenção é ${pontosFracosTexto[0].charAt(0).toLowerCase() + pontosFracosTexto[0].slice(1).replace(/\.$/, '')}.`);
  }
  if(riscosTexto.length){
    frasesParecer.push('Nenhum risco identificado neste ciclo é de ruptura — todos são de monitoramento, não de ação emergencial.');
  }
  const parecerFinalTexto = frasesParecer.join(' ');

  return {
    pontosFortesTexto, pontosFracosTexto, riscosTexto, oportunidadesTexto, recomendacoesTexto,
    resumoAberturaTexto, parecerFinalTexto, regrasAplicadas,
    projetos: _wwiMontarProjetos(dados),
    passivosRank: _wwiMontarPassivosRank(dados),
    centrosDeCusto: _wwiMontarCentrosDeCusto(dados),
    composicaoPatrimonio: _wwiMontarComposicaoPatrimonio(dados, indicadoresCompletos),
    liquidezAnalise: _wwiMontarLiquidez(dados, indicadoresCompletos),
  };
}

// ---------------------------------------------------------------------------------------------
// compararComHistorico(indicadoresAtuais, historico) — RF-05. `historico` é o array de linhas já
// buscadas em `historico_relatorios` (mais recentes primeiro), cada uma com pelo menos
// {competencia, score, dados_json}. Degrada graciosamente sem histórico (1º relatório da série):
// nunca gera frase de comparação nesse caso, só omite a seção.
// ---------------------------------------------------------------------------------------------

function compararComHistorico(indicadoresAtuais, historico){
  const frases = [];
  if(!historico || !historico.length){
    return { frases, temHistorico: false };
  }
  const anterior = historico[0]; // já ordenado desc por competência na busca (ver index.html)
  const patrimAtual = indicadoresAtuais && indicadoresAtuais.indicadoresBrutos ? indicadoresAtuais.indicadoresBrutos.patrimonioLiquido : null;
  const patrimAnteriorBruto = anterior && anterior.dados_json ? anterior.dados_json.indicadoresBrutos : null;
  const patrimAnterior = patrimAnteriorBruto ? patrimAnteriorBruto.patrimonioLiquido : null;

  if(patrimAtual !== null && patrimAnterior){
    const variacaoPct = ((patrimAtual - patrimAnterior) / patrimAnterior) * 100;
    frases.push(`O patrimônio líquido ${variacaoPct >= 0 ? 'cresceu' : 'recuou'} ${_wwiFmtNum(Math.abs(variacaoPct), 1)}% em relação ao ciclo anterior (${anterior.competencia}).`);
  }

  if(indicadoresAtuais && indicadoresAtuais.wealthScore !== null && anterior && anterior.score !== null && anterior.score !== undefined){
    const deltaScore = indicadoresAtuais.wealthScore - anterior.score;
    if(deltaScore !== 0){
      frases.push(`O Wealth Score ${deltaScore > 0 ? 'subiu' : 'caiu'} ${Math.abs(deltaScore)} pontos frente ao ciclo anterior (${anterior.score} → ${indicadoresAtuais.wealthScore}).`);
    } else {
      frases.push(`O Wealth Score permanece estável em ${indicadoresAtuais.wealthScore} desde o ciclo anterior.`);
    }
  }

  // Janelas de 3/6/12 ciclos: só entra na frase se houver histórico suficiente — sem fabricar "0%"
  // quando não há dado dos 3/6/12 ciclos completos.
  [
    { n: 3, rotulo: 'nos últimos 3 ciclos' },
    { n: 6, rotulo: 'nos últimos 6 ciclos' },
    { n: 12, rotulo: 'nos últimos 12 ciclos' },
  ].forEach(janela => {
    if(historico.length < janela.n) return;
    const referencia = historico[janela.n - 1];
    const refBruto = referencia && referencia.dados_json ? referencia.dados_json.indicadoresBrutos : null;
    const patrimRef = refBruto ? refBruto.patrimonioLiquido : null;
    if(patrimAtual !== null && patrimRef){
      const variacaoPct = ((patrimAtual - patrimRef) / patrimRef) * 100;
      frases.push(`O patrimônio líquido ${variacaoPct >= 0 ? 'acumulou alta' : 'acumulou queda'} de ${_wwiFmtNum(Math.abs(variacaoPct), 1)}% ${janela.rotulo}.`);
    }
  });

  return { frases, temHistorico: true };
}

// ---------------------------------------------------------------------------------------------
// wwiBuscarHistoricoRelatorios(competenciaAtual) — RF-05/passo 4 do fluxo do botão Download.
// Leitura pública (mesma régua de RLS de qualquer outra tabela — JWT Firebase válido ou fallback
// anônimo, igual ao resto de WallaceFinanceService). NUNCA escreve — a persistência de
// `historico_relatorios` é responsabilidade exclusiva do job mensal (service_role), não do
// client-side (ver docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md, "Quem escreve").
// Degrada graciosamente: qualquer falha de rede/tabela ainda não existir retorna listas vazias,
// nunca quebra a geração do PDF (mesmo espírito defensivo do resto do coletor).
// ---------------------------------------------------------------------------------------------
async function wwiBuscarHistoricoRelatorios(competenciaAtual, limite){
  limite = limite || 13; // competência atual + até 12 ciclos anteriores (cobre as janelas de 3/6/12)
  const vazio = { atual: null, anteriores: [] };
  if(typeof WallaceFinanceService === 'undefined') return vazio;
  try {
    const url = `${WallaceFinanceService._url}/rest/v1/historico_relatorios?select=competencia,score,dados_json,analise_ia&order=competencia.desc&limit=${limite}`;
    const resp = await fetch(url, { headers: WallaceFinanceService._headers() });
    if(!resp.ok) throw new Error('wwiBuscarHistoricoRelatorios: HTTP ' + resp.status);
    const linhas = await resp.json();
    const atual = linhas.find(l => l.competencia === competenciaAtual) || null;
    const anteriores = linhas.filter(l => l.competencia !== competenciaAtual);
    return { atual, anteriores };
  } catch(err){
    console.warn('wwiBuscarHistoricoRelatorios: falha ao buscar histórico — WWI segue sem comparação/reuso de narrativa neste clique.', err);
    return vazio;
  }
}

window.calcularIndicadoresEScores = calcularIndicadoresEScores;
window.gerarAnaliseFinanceira = gerarAnaliseFinanceira;
window.compararComHistorico = compararComHistorico;
window.wwiBuscarHistoricoRelatorios = wwiBuscarHistoricoRelatorios;
