// MÓDULO: Onda 5 — "Qualidade da geração" (08/08/2026), separado por completo do domínio de
// crédito/rateio solar (que continua PENDENTE de validação conceitual — ver seção 35+ do
// PLANO_UNIFICACAO_V1_V2.md, "301 vs 361 kWh"). Este card não decide nem usa nada daquele debate:
// responde só "a usina está gerando bem ou mal", com linguagem sem nenhum termo técnico (código
// 03/103, saldo líquido, ANEEL, rateio) — pedido explícito do usuário, teste "Vanessa em 10 segundos".
//
// Fonte: VARS.SOLAR_GERACAO_DIARIA — já local (vem de wallace_dados via Object.assign, mesmo
// mecanismo de sempre), sem fetch novo. Limites de classificação (abaixoAte/acimaApartirDe) em
// `indicadores`, mesmo padrão do ROC_STATUS_LIMITES (Onda 4) — editável sem redeploy.
//
// DECISÃO DE DESIGN (achado ao validar antes de subir): a leitura de HOJE é sempre PARCIAL (o
// robô roda 2x/dia, a última execução pode ser de manhã) — comparar um valor parcial contra a
// média de dias INTEIROS classificaria como "abaixo do esperado" quase toda manhã, mesmo em dia
// bom (falso alarme). Por isso: "hoje" é só exibido, nunca classificado com selo de status; o
// selo (🔴/🟡/🟢) usa o ÚLTIMO DIA COMPLETO (ontem, ou o mais recente antes de hoje) comparado
// à média dos dias completos anteriores a ele.
//
// P1 — dados que NÃO existem e não são fabricados aqui: produção por hora (o robô só grava total
// do dia) e "esperado até agora" intradiário (exigiria uma curva-modelo do formato do dia, que não
// existe) — ambos ficam de fora deste card, documentados como bloqueio real, não estimados.
//
// Rollback: comentar a chamada aplicarOnda5QualidadeGeracao() em app.js.

// CORRIGIDO 08/08/2026 (achado pelo usuário: badge de frescor mostrava "atualização antiga, verifique
// se o robô SAJ está rodando" toda noite, alarme falso — o robô só lê das 6h às 18h, horário de
// Brasília, mesma janela do cron do workflow "*/10 6-18 * * *"; não faz sentido continuar lendo à
// noite, sem geração nenhuma pra registrar). O relógio de frescor "congela" fora dessa janela — volta
// a contar normalmente assim que a janela reabre às 6h. Horário de Brasília tratado como UTC-3 fixo
// (Brasil não tem mais horário de verão desde 2019, então isso não precisa de biblioteca de fuso).
const SOLAR_JANELA_LEITURA_INICIO_H = 6;
const SOLAR_JANELA_LEITURA_FIM_H = 18;
function agoraEfetivoFrescorSolar(){
  const agora = new Date();
  const TRES_HORAS_MS = 3*3600*1000;
  // Trick padrão pra trabalhar em "horário de Brasília" sem lib de fuso: desloca o timestamp por
  // -3h e usa os getters UTC do resultado — eles passam a refletir a hora de Brasília diretamente
  // (evita o bug de misturar hora-SP com data-UTC quando a virada de dia UTC não bate com a de SP).
  const spDeslocado = new Date(agora.getTime() - TRES_HORAS_MS);
  const horaSP = spDeslocado.getUTCHours();
  if(horaSP >= SOLAR_JANELA_LEITURA_INICIO_H && horaSP < SOLAR_JANELA_LEITURA_FIM_H) return agora; // dentro da janela, relógio normal
  // Fora da janela (noite): congela no último fechamento (18h de Brasília) — se ainda for madrugada
  // (antes da janela abrir hoje), o fechamento relevante foi ONTEM às 18h.
  const efetivoDeslocado = new Date(spDeslocado);
  efetivoDeslocado.setUTCHours(SOLAR_JANELA_LEITURA_FIM_H, 0, 0, 0);
  if(horaSP < SOLAR_JANELA_LEITURA_INICIO_H) efetivoDeslocado.setUTCDate(efetivoDeslocado.getUTCDate() - 1);
  return new Date(efetivoDeslocado.getTime() + TRES_HORAS_MS); // volta pro UTC real
}

async function aplicarOnda5QualidadeGeracao(){
  const registros = VARS.SOLAR_GERACAO_DIARIA;
  const elAviso = $('qgAviso');
  const t = (id,v) => { const el=$(id); if(el) el.textContent=v; };
  if(!Array.isArray(registros) || !registros.length){
    if(elAviso) elAviso.textContent = 'Sem histórico de geração diária ainda — aguardando a primeira leitura do robô.';
    window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO = { status: 'sem_dado' };
    return;
  }

  // CORRIGIDO 11/08/2026 (achado do usuário: "isso só pode ficar assim após 0hs [Brasília]... deve
  // manter a geração do dia até a virada do dia" — "Hoje até agora" virava "Sem leitura ainda hoje"
  // cedo demais). O comentário antigo aqui dizia "mesma convenção do script: UTC" — mas
  // atualizar_geracao_saj.py na verdade usa hoje_brasilia_str() (Brasília, UTC-3) pra gravar a
  // chave `data` de cada registro, não UTC puro. O cliente aqui calculava "hoje" em UTC de verdade
  // — entre meia-noite UTC e meia-noite Brasília (3h de diferença), a data virava aqui ANTES de
  // virar no dado gravado, fazendo o dia de ontem "sumir" (não batia mais com hojeStr) sem ainda
  // ter um registro de hoje pra substituí-lo. Mesmo truque de fuso já usado em
  // agoraEfetivoFrescorSolar() (mesmo arquivo): desloca -3h e lê os getters UTC do resultado.
  const hojeStr = new Date(Date.now() - 3*3600*1000).toISOString().slice(0,10);
  const registroHoje = registros.find(r => r.data === hojeStr) || null;
  // "Dias completos" = todos os registros exceto o de hoje (nunca sabemos se hoje já terminou).
  const diasCompletos = registros.filter(r => r.data !== hojeStr && typeof r.kwh === 'number');
  const diaReferencia = diasCompletos.length ? diasCompletos[diasCompletos.length-1] : null; // mais recente
  const baseComparacao = diasCompletos.slice(0, -1); // dias anteriores ao de referência

  const fmtKwh = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' kWh';

  // CORRIGIDO 09/08/2026 (pedido do usuário): "(parcial)" só faz sentido enquanto a usina ainda pode
  // gerar mais naquele dia. Ela roda das 05:30 às 18:00 (horário real informado pelo usuário) - fora
  // dessa janela a leitura de hoje já é o valor final do dia, não tem mais nada "parcial" nela.
  const agora = new Date();
  const minutosDoDia = agora.getHours()*60 + agora.getMinutes();
  const usinaAindaGerandoHoje = minutosDoDia >= (5*60+30) && minutosDoDia < 18*60;
  t('qgProducaoHoje', registroHoje ? fmtKwh(registroHoje.kwh) + (usinaAindaGerandoHoje ? ' (parcial)' : '') : 'Sem leitura ainda hoje');

  if(!diaReferencia){
    t('qgMediaHistorica', '—');
    t('qgPercentual', '—');
    if(elAviso) elAviso.textContent = 'Ainda não há nenhum dia completo registrado — só a leitura de hoje existe até agora.';
    window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO = { hoje: registroHoje ? registroHoje.kwh : null, status: 'sem_dia_completo' };
    return;
  }

  // CORRIGIDO 08/08/2026 (achado pelo usuário: card mostrava "08/05" pra 5 de agosto — mês/dia
  // invertidos): data vem como "YYYY-MM-DD", split('-') dá [ano,mes,dia] — os nomes das variáveis
  // aqui precisam bater com essa ordem, senão o template `${dd}/${mm}` monta MM/DD (americano) em
  // vez de DD/MM (padrão do site).
  const [mm,dd] = diaReferencia.data.split('-').slice(1);
  const elLabelRef = $('qgLabelReferencia');
  if(elLabelRef) elLabelRef.textContent = `Último dia completo (${dd}/${mm})`;
  t('qgMediaHistorica', fmtKwh(diaReferencia.kwh));

  const media = baseComparacao.length ? Math.round((baseComparacao.reduce((s,r)=>s+r.kwh,0) / baseComparacao.length) * 100) / 100 : null;

  let limiteBaixo, limiteAlto;
  let limitesFrescor;
  try {
    const [indBaixo, indAlto, indVerde, indAmarelo, indLaranja] = await Promise.all([
      WallaceFinanceService.getIndicador('SOLAR_STATUS_LIMITES - abaixoAte'),
      WallaceFinanceService.getIndicador('SOLAR_STATUS_LIMITES - acimaApartirDe'),
      WallaceFinanceService.getIndicador('SOLAR_FRESCOR_LIMITES - minutosVerde'),
      WallaceFinanceService.getIndicador('SOLAR_FRESCOR_LIMITES - minutosAmarelo'),
      WallaceFinanceService.getIndicador('SOLAR_FRESCOR_LIMITES - minutosLaranja'),
    ]);
    limiteBaixo = indBaixo ? Number(indBaixo.valor) : 85;
    limiteAlto = indAlto ? Number(indAlto.valor) : 115;
    limitesFrescor = {
      minutosVerde: indVerde ? Number(indVerde.valor) : 15,
      minutosAmarelo: indAmarelo ? Number(indAmarelo.valor) : 120,
      minutosLaranja: indLaranja ? Number(indLaranja.valor) : 1440,
    };
  } catch(err){
    console.warn('Onda5QualidadeGeracao: falha ao buscar limites em indicadores — usando padrão.', err);
    limiteBaixo = 85; limiteAlto = 115;
    limitesFrescor = { minutosVerde: 15, minutosAmarelo: 120, minutosLaranja: 1440 };
  }

  let percentual = null, status = null;
  if(media){
    percentual = Math.round((diaReferencia.kwh / media) * 1000) / 10;
    if(percentual < limiteBaixo) status = { emoji:'🔴', texto:'Abaixo do esperado', cor:'#e2554f' };
    else if(percentual > limiteAlto) status = { emoji:'🟢', texto:'Acima do esperado', cor:'#34c98a' };
    else status = { emoji:'🟡', texto:'Dentro do esperado', cor:'#e8a63a' };
  }
  t('qgPercentual', percentual !== null ? percentual.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%' : 'Sem dias anteriores suficientes');
  const elStatus = $('qgStatus');
  if(elStatus){
    if(status){ elStatus.textContent = status.emoji+' '+status.texto+` (${dd}/${mm})`; elStatus.style.color = status.cor; }
    else { elStatus.textContent = '—'; elStatus.style.color = ''; }
  }

  // NOVO 08/08/2026 (legendas dinâmicas, pedido do usuário): texto vem de VARS.LEGENDAS
  // (legQgHojeParcial/legQgSemLeituraHoje), não mais hardcoded aqui — {hora} é o único placeholder
  // necessário pra esse texto.
  if(elAviso){
    // CORRIGIDO 11/08/2026 (achado do usuário, "última captura nunca corrige"): usava
    // registroHoje.capturadoEm (= created_at, congela na 1ª gravação do dia, ~06h) em vez de
    // atualizadoEm (= atualizado_em, reflete a gravação mais recente do robô) — mesmo campo que o
    // badge de frescor logo abaixo já usa corretamente. O texto dizia "última captura" mas sempre
    // mostrava a PRIMEIRA.
    const capturado = registroHoje && registroHoje.atualizadoEm ? new Date(registroHoje.atualizadoEm) : null;
    const horaTxt = capturado ? capturado.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}) : '—';
    elAviso.textContent = registroHoje
      ? formatarLegenda('legQgHojeParcial', { hora: horaTxt })
      : formatarLegenda('legQgSemLeituraHoje');
  }

  // NOVO 08/08/2026 (badge de frescor, pedido do usuário): baseado em atualizado_em (não
  // created_at — ver achado da sessão), reflete a última gravação real do robô, não a primeira do
  // dia. Recalcula sozinho a cada 60s, senão "há 3 minutos" vira mentira sem o usuário recarregar.
  const elFrescor = $('qgFrescor');
  if(elFrescor){
    const timestampFrescor = registroHoje ? registroHoje.atualizadoEm : (diaReferencia ? diaReferencia.atualizadoEm : null);
    const renderizarFrescor = () => {
      const badge = montarBadgeFrescor('legFrescorSolar', timestampFrescor, limitesFrescor, agoraEfetivoFrescorSolar());
      elFrescor.textContent = badge.texto;
      elFrescor.style.color = badge.cor;
    };
    renderizarFrescor();
    if(window.__wallaceFrescorSolarInterval) clearInterval(window.__wallaceFrescorSolarInterval);
    window.__wallaceFrescorSolarInterval = setInterval(renderizarFrescor, 60000);
  }

  window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO = {
    hoje: registroHoje ? registroHoje.kwh : null,
    diaReferencia: diaReferencia.data, kwhDiaReferencia: diaReferencia.kwh,
    media, percentual, status: status ? status.texto : null,
    limiteBaixo, limiteAlto, qtdDiasBaseComparacao: baseComparacao.length,
  };
  console.log('Onda5QualidadeGeracao: relatório completo em window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO', window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO);
}
