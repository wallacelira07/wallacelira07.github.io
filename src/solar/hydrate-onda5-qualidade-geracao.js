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

async function aplicarOnda5QualidadeGeracao(){
  const registros = VARS.SOLAR_GERACAO_DIARIA;
  const elAviso = $('qgAviso');
  const t = (id,v) => { const el=$(id); if(el) el.textContent=v; };
  if(!Array.isArray(registros) || !registros.length){
    if(elAviso) elAviso.textContent = 'Sem histórico de geração diária ainda — aguardando a primeira leitura do robô.';
    window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO = { status: 'sem_dado' };
    return;
  }

  // Mesma convenção de data do script (atualizar_geracao_saj.py): UTC, "YYYY-MM-DD".
  const hojeStr = new Date().toISOString().slice(0,10);
  const registroHoje = registros.find(r => r.data === hojeStr) || null;
  // "Dias completos" = todos os registros exceto o de hoje (nunca sabemos se hoje já terminou).
  const diasCompletos = registros.filter(r => r.data !== hojeStr && typeof r.kwh === 'number');
  const diaReferencia = diasCompletos.length ? diasCompletos[diasCompletos.length-1] : null; // mais recente
  const baseComparacao = diasCompletos.slice(0, -1); // dias anteriores ao de referência

  const fmtKwh = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' kWh';

  t('qgProducaoHoje', registroHoje ? fmtKwh(registroHoje.kwh) + ' (parcial)' : 'Sem leitura ainda hoje');

  if(!diaReferencia){
    t('qgMediaHistorica', '—');
    t('qgPercentual', '—');
    if(elAviso) elAviso.textContent = 'Ainda não há nenhum dia completo registrado — só a leitura de hoje existe até agora.';
    window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO = { hoje: registroHoje ? registroHoje.kwh : null, status: 'sem_dia_completo' };
    return;
  }

  const [dd,mm] = diaReferencia.data.split('-').slice(1);
  const elLabelRef = $('qgLabelReferencia');
  if(elLabelRef) elLabelRef.textContent = `Último dia completo (${dd}/${mm})`;
  t('qgMediaHistorica', fmtKwh(diaReferencia.kwh));

  const media = baseComparacao.length ? Math.round((baseComparacao.reduce((s,r)=>s+r.kwh,0) / baseComparacao.length) * 100) / 100 : null;

  let limiteBaixo, limiteAlto;
  try {
    const [indBaixo, indAlto] = await Promise.all([
      WallaceFinanceService.getIndicador('SOLAR_STATUS_LIMITES - abaixoAte'),
      WallaceFinanceService.getIndicador('SOLAR_STATUS_LIMITES - acimaApartirDe'),
    ]);
    limiteBaixo = indBaixo ? Number(indBaixo.valor) : 85;
    limiteAlto = indAlto ? Number(indAlto.valor) : 115;
  } catch(err){
    console.warn('Onda5QualidadeGeracao: falha ao buscar limites em indicadores — usando padrão 85/115.', err);
    limiteBaixo = 85; limiteAlto = 115;
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

  if(elAviso){
    const capturado = registroHoje && registroHoje.capturadoEm ? new Date(registroHoje.capturadoEm) : null;
    const horaTxt = capturado ? capturado.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}) : null;
    elAviso.textContent = registroHoje
      ? `"Hoje até agora" é parcial${horaTxt?' (captado às '+horaTxt+', horário de Brasília)':''} — o dia ainda não terminou, por isso não recebe selo de status; o selo acima usa sempre o último dia JÁ FECHADO. Produção por hora e previsão intradiária ainda não existem no sistema (o robô só registra o total acumulado do dia).`
      : 'Ainda sem leitura de hoje — o selo acima usa o último dia já fechado.';
  }

  window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO = {
    hoje: registroHoje ? registroHoje.kwh : null,
    diaReferencia: diaReferencia.data, kwhDiaReferencia: diaReferencia.kwh,
    media, percentual, status: status ? status.texto : null,
    limiteBaixo, limiteAlto, qtdDiasBaseComparacao: baseComparacao.length,
  };
  console.log('Onda5QualidadeGeracao: relatório completo em window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO', window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO);
}
