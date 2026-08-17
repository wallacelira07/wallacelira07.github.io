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
// P1 — dado que NÃO existe e não é fabricado aqui: produção por hora (o robô só grava total do
// dia). "Esperado até agora" intradiário EXISTE desde 17/08/2026 via curva de elevação solar
// (__fracaoAcumuladaCurvaSolar, mais abaixo) — é uma estimativa de céu limpo, não produção horária
// real, e isso é dito explicitamente no texto exibido ("estimativa").
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

// NOVO 17/08/2026 (pedido do usuário, prioridade 0 — substitui o modelo linear de "esperado até
// agora" abaixo). Coordenadas EXATAS do gerador: Rua Gildete Gomes Bezerra, 79 - Nova Brasília,
// Campina Grande/PB (mesmo endereço da UC 573.702.053-77, ver vars-energia-solar.js linha 73-74).
// CORRIGIDO 17/08/2026 (mesma sessão): valor inicial veio de geocodificação por endereço
// (OpenStreetMap Nominatim, ~2,8km melhor que o centro-de-cidade usado antes, mas ainda
// aproximado); substituído pela leitura GPS real no local, exportada do app Sun Surveyor pelo
// usuário (arquivo KML, ponto único no telhado do gerador) — agora é a posição real, não mais
// geocodificação por texto de endereço. Duplicada aqui de propósito, mesmo motivo já documentado
// em previsao-geracao-solar.js: módulos da base carregam em paralelo (s.async=true), sem ordem
// garantida, então não dá pra depender de uma const top-level de outro <script>.
const SOLAR_GERADOR_LAT = -7.215406;
const SOLAR_GERADOR_LON = -35.856661;

// Ângulo de elevação solar (graus) pra uma lat/lon/instante — fórmula padrão de posição solar
// (PVEducation/NOAA simplificada: declinação por Cooper's equation + equação do tempo + ângulo
// horário), sem correção de refração atmosférica — validada offline contra nascer/pôr do sol real
// dessa coordenada em 3 datas diferentes do ano (erro de poucos minutos, aceitável: aqui só
// precisamos do FORMATO da curva ao longo do dia, não do instante exato de nascer/pôr do sol).
function __elevacaoSolarGraus(lat, lon, timestampMs){
  const rad = Math.PI/180;
  const d = new Date(timestampMs);
  const inicioAno = Date.UTC(d.getUTCFullYear(), 0, 1);
  const diaDoAno = Math.floor((timestampMs - inicioAno) / 86400000) + 1;
  const B = (360/365) * (diaDoAno - 81) * rad;
  const eot = 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B); // equação do tempo, minutos
  const declinacao = 23.45*rad*Math.sin((360/365) * (284+diaDoAno) * rad); // já em radianos
  const horaUTC = d.getUTCHours() + d.getUTCMinutes()/60 + d.getUTCSeconds()/3600;
  const horaSolarLocal = horaUTC + lon/15 + eot/60; // UTC corresponde ao meridiano 0°
  const hra = 15 * (horaSolarLocal - 12) * rad; // ângulo horário
  const latRad = lat * rad;
  const seno = Math.sin(declinacao)*Math.sin(latRad) + Math.cos(declinacao)*Math.cos(latRad)*Math.cos(hra);
  return Math.asin(Math.max(-1, Math.min(1, seno))) / rad;
}

// Fração do total do dia já "acumulada" até um dado minuto-do-dia (Brasília), usando
// max(0, sen(elevação)) como peso instantâneo — proxy padrão de irradiância direta em plano
// horizontal sob céu limpo (ignora nuvens/difusa de propósito: aqui só molda a FORMA relativa da
// curva ao longo do dia; o valor absoluto de geração continua vindo de VARS.SOLAR_GERACAO_DIARIA,
// dado real do robô SAJ). Resultado é uma curva em S (baixa de manhã/tarde, íngreme ao meio-dia) —
// fisicamente correta e sensível à estação do ano (se ajusta sozinha a nascer/pôr do sol de cada
// data, sem precisar de janela fixa 05:30-18:00 hardcoded).
function __fracaoAcumuladaCurvaSolar(dataISO, minutosDoDiaAgora){
  const PASSO_MIN = 10;
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const baseUTC = Date.UTC(ano, mes-1, dia, 3, 0, 0); // 00:00 Brasília = 03:00 UTC
  let somaTotal = 0, somaAteAgora = 0;
  for(let m = 0; m < 24*60; m += PASSO_MIN){
    const peso = Math.max(0, Math.sin(__elevacaoSolarGraus(SOLAR_GERADOR_LAT, SOLAR_GERADOR_LON, baseUTC + m*60000) * Math.PI/180));
    somaTotal += peso;
    if(m <= minutosDoDiaAgora) somaAteAgora += peso;
  }
  return somaTotal > 0 ? somaAteAgora / somaTotal : 0;
}
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
  // CORRIGIDO 15/08/2026 (achado de auditoria: usava agora.getHours() — hora LOCAL da máquina, não
  // de Brasília. Mesmo truque de fuso já usado em agoraEfetivoFrescorSolar()/hojeStr acima, neste
  // mesmo arquivo: desloca -3h e lê os getters UTC do resultado).
  const spDeslocadoAgora = new Date(Date.now() - 3*3600*1000);
  const minutosDoDia = spDeslocadoAgora.getUTCHours()*60 + spDeslocadoAgora.getUTCMinutes();
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
    if(percentual < limiteBaixo) status = { emoji:'🔴', texto:'Abaixo do esperado', cor:'var(--red)' };
    else if(percentual > limiteAlto) status = { emoji:'🟢', texto:'Acima do esperado', cor:'var(--green)' };
    else status = { emoji:'🟡', texto:'Dentro do esperado', cor:'var(--amber)' };
  }
  const elStatus = $('qgStatus');
  if(elStatus){
    if(status){ elStatus.textContent = 'Dia anterior: '+status.emoji+' '+status.texto+` (${dd}/${mm}, ${percentual.toLocaleString('pt-BR',{maximumFractionDigits:1})}% da média)`; elStatus.style.color = status.cor; }
    else { elStatus.textContent = '—'; elStatus.style.color = ''; }
  }

  // NOVO 12/08/2026, MODELO SUBSTITUÍDO 17/08/2026 (pedido do usuário: "quero ver se HOJE está
  // abaixo, normal ou acima do esperado", não só o último dia completo/ontem). Até 17/08/2026 isso
  // usava regra de 3 LINEAR sobre a janela 05:30-18:00 — aproximação grosseira que sempre acusava
  // falso "abaixo do esperado" de manhã e falso "acima do esperado" à tarde, porque geração solar
  // real segue uma curva em S (baixa perto do nascer/pôr do sol, íngreme ao meio-dia), não uma
  // reta. Trocado por __fracaoAcumuladaCurvaSolar() (acima nesse arquivo): calcula o ângulo de
  // elevação solar real na coordenada exata do gerador a cada 10min do dia e usa max(0,sen(elevação))
  // como peso — curva fisicamente correta, se ajusta sozinha à estação do ano (nascer/pôr do sol
  // variam), sem depender de janela fixa. Continua sendo uma estimativa de CÉU LIMPO (não considera
  // nuvens do dia) — é dito explicitamente no texto abaixo ("estimativa"), mesmo padrão de honestidade
  // já usado em previsao-geracao-solar.js.
  const elStatusHoje = $('qgStatusHoje');
  if(elStatusHoje){
    const mediaTodosDiasCompletos = diasCompletos.length
      ? Math.round((diasCompletos.reduce((s,r)=>s+r.kwh,0) / diasCompletos.length) * 100) / 100
      : null;
    const fracaoCurvaSolar = __fracaoAcumuladaCurvaSolar(hojeStr, minutosDoDia);
    const esperadoAteAgora = mediaTodosDiasCompletos !== null ? Math.round(mediaTodosDiasCompletos * fracaoCurvaSolar * 100) / 100 : null;
    if(!registroHoje){
      elStatusHoje.textContent = 'Hoje: sem leitura ainda';
      elStatusHoje.style.color = '';
    } else if(esperadoAteAgora === null || fracaoCurvaSolar <= 0.005){
      elStatusHoje.textContent = 'Hoje: aguardando dados suficientes pra estimar';
      elStatusHoje.style.color = '';
    } else {
      const percentualHoje = esperadoAteAgora > 0 ? Math.round((registroHoje.kwh / esperadoAteAgora) * 1000) / 10 : null;
      let statusHoje;
      if(percentualHoje === null) statusHoje = { emoji:'🟡', texto:'Dentro do esperado' };
      else if(percentualHoje < limiteBaixo) statusHoje = { emoji:'🔴', texto:'Abaixo do esperado', cor:'var(--red)' };
      else if(percentualHoje > limiteAlto) statusHoje = { emoji:'🟢', texto:'Acima do esperado', cor:'var(--green)' };
      else statusHoje = { emoji:'🟡', texto:'Dentro do esperado', cor:'var(--amber)' };
      const pctTxt = percentualHoje !== null ? ` (${percentualHoje.toLocaleString('pt-BR',{maximumFractionDigits:1})}% do esperado até agora, estimativa)` : '';
      elStatusHoje.textContent = 'Hoje: '+statusHoje.emoji+' '+statusHoje.texto+pctTxt;
      elStatusHoje.style.color = statusHoje.cor || '';
    }
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

  // NOVO 14/08/2026 (pedido do usuário, depois de perguntar "você acha que o GD não consegue gerar
  // o suficiente pra segurar as 3 casas?" — cálculo manual mostrou geração bruta ~4,5% acima do
  // consumo total, margem apertada demais pra deixar só numa conversa). Compara o último dia
  // COMPLETO de geração bruta (diaReferencia.kwh — nunca "hoje", que é sempre parcial e daria falso
  // alarme de manhã) contra a soma dos 3 consumos diários de referência REAIS (linha "Média" de
  // cada fatura Energisa confirmada, mesma fonte que VARS.solarConsumoDiarioWallace/Irma/Mae já usa
  // em outros cálculos desta sessão — nenhum número novo inventado aqui).
  const elCobertura = $('qgCoberturaTresCasas');
  if(elCobertura){
    const consumoWallace = VARS.solarConsumoDiarioWallace;
    const consumoIrma = VARS.solarConsumoDiarioIrma;
    const consumoMae = VARS.solarConsumoDiarioMae;
    if(typeof consumoWallace === 'number' && typeof consumoIrma === 'number' && typeof consumoMae === 'number'){
      const consumoTotal3Casas = Math.round((consumoWallace + consumoIrma + consumoMae) * 100) / 100;
      const margemPct = consumoTotal3Casas > 0 ? Math.round(((diaReferencia.kwh - consumoTotal3Casas) / consumoTotal3Casas) * 1000) / 10 : null;
      let statusCobertura;
      if(margemPct === null) statusCobertura = { emoji:'🟡', texto:'Sem referência de consumo suficiente pra comparar', cor:'var(--text-dim)' };
      else if(margemPct < 0) statusCobertura = { emoji:'🔴', texto:`Geração ABAIXO do consumo total das 3 casas (${Math.abs(margemPct).toLocaleString('pt-BR',{maximumFractionDigits:1})}% a menos)`, cor:'var(--red)' };
      else if(margemPct < 10) statusCobertura = { emoji:'🟡', texto:`Geração cobre as 3 casas, mas com margem apertada (só ${margemPct.toLocaleString('pt-BR',{maximumFractionDigits:1})}% de folga)`, cor:'var(--amber)' };
      else statusCobertura = { emoji:'🟢', texto:`Geração cobre as 3 casas com folga confortável (${margemPct.toLocaleString('pt-BR',{maximumFractionDigits:1})}% acima do consumo total)`, cor:'var(--green)' };
      elCobertura.textContent = statusCobertura.emoji+' '+statusCobertura.texto+` — ${fmtKwh(diaReferencia.kwh)} gerados × ${fmtKwh(consumoTotal3Casas)} consumidos (Wallace+Wellida+Casa da Mãe, ${dd}/${mm})`;
      elCobertura.style.color = statusCobertura.cor;
      window.WALLACE_ONDA5_COBERTURA_3_CASAS = { kwhGerado: diaReferencia.kwh, consumoTotal3Casas, margemPct, dia: diaReferencia.data };
    } else {
      elCobertura.textContent = '⚠ Consumo de referência das 3 casas indisponível — comparação não calculada.';
      elCobertura.style.color = 'var(--text-dim)';
    }
  }

  window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO = {
    hoje: registroHoje ? registroHoje.kwh : null,
    diaReferencia: diaReferencia.data, kwhDiaReferencia: diaReferencia.kwh,
    media, percentual, status: status ? status.texto : null,
    limiteBaixo, limiteAlto, qtdDiasBaseComparacao: baseComparacao.length,
  };
  console.log('Onda5QualidadeGeracao: relatório completo em window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO', window.WALLACE_ONDA5_QUALIDADE_GERACAO_RELATORIO);
}
