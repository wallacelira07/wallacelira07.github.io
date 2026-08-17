// MÓDULO: card "⚡ Medidor de energia do apartamento (tempo real)" — NOVO 17/08/2026 (medidor EKAZA
// CT 80A na tomada geral do apartamento do Wallace, integrado via Tuya Cloud API). Backend já pronto
// e testado (tabela `medidor_tuya_leituras`, robô scripts/sync/atualizar_medidor_tuya.py gravando
// várias vezes por dia via executar_tudo.yml) — este módulo só lê e exibe, não escreve nada.
//
// MOVIDO 17/08/2026 (mesma sessão, minutos depois) de dentro da aba "Painel" pra dentro da aba
// "Energia Solar" (seção 06, junto de "Economia antes × depois (apartamento)") — usuário confirmou
// que este medidor É o apartamento dele, mesma unidade das demais seções dali.
//
// ESCOPO DELIBERADO desta versão ("integrar com os gráficos", mas sem pular fase): o "consumo real
// neste ciclo" abaixo é um dado NOVO, adicional — não substitui nem realimenta a fórmula do gráfico
// R$ (cEnergiaSolar, graficos-cenarios-lazy.js) nem a tabela de fatura residual (residualPosSolarTbody),
// que continuam vindo só da fatura em PDF informada mês a mês. Motivo: aquelas fórmulas pareiam
// consumo (kWh) com valor da fatura (R$) do MESMO período pra achar a tarifa real paga — substituir só
// o kWh por um valor ao vivo do ciclo em aberto, sem o R$ correspondente (que só existe quando a
// fatura chega), quebraria esse pareamento. Mesmo princípio de "não pular fases" já usado no medidor
// DDSU666 da Casa da Mãe (ver docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md, Fase 2 "captura paralela,
// sem substituir nada"): primeiro acumula um ciclo completo de dado real e valida contra a fatura de
// verdade quando ela chegar, só depois decide se/como usar isso pra automatizar a entrada manual de
// VARS.ENERGISA_TARIFA_COMPOSICAO.apartamento_wallace (fatura_XXmm_consumo_kwh).
//
// Fontes (bootstrap fetch em Sistema_Wallace_Lira_Completo.html, mesmo padrão de
// WALLACE_SOLAR_LEITURAS_V2/WALLACE_SOLAR_GERACAO_DIARIA_V2 — JWT Firebase via __wallaceAuthHeader()):
//   window.WALLACE_MEDIDOR_TUYA_V2          — últimas ~50 leituras, ordenadas capturado_em desc.
//   window.WALLACE_MEDIDOR_TUYA_CICLO_BASE_V2 — 1 leitura: a mais antiga a partir do início do ciclo
//                                                Energisa atual (dia 21, ver __cicloInicioWallace no
//                                                bootstrap) — linha de base pra medir o consumo do
//                                                ciclo em andamento.
//
// Diferente do domínio Solar "clássico" (V2-exclusivo, sem fallback pra V1): aqui não existe V1
// nenhuma pra cair de volta, então "sem dado" é sempre o estado normal de quem acabou de instalar o
// medidor, nunca um erro — por isso mostra "Sem leitura ainda" em vez de "⚠ Indisponível".
//
// NOVO 17/08/2026 (pedido do usuário: "crie um gráfico que mostre o comparativo entre o gerado e o
// consumido"): calcula consumo real do apartamento POR DIA a partir do histórico completo de
// energia_total_kwh (contador que só cresce) — pega a ÚLTIMA leitura de cada dia (horário de
// Brasília) e subtrai a última leitura do dia ANTERIOR. Só produz um valor quando os dois dias são
// consecutivos (diffDias===1) — um buraco no meio (ex: medidor ficou 3 dias sem reportar) não vira um
// "consumo do dia" fabricado somando 3 dias num só; o dia problemático simplesmente fica sem barra,
// mesmo princípio de "não fabricar dado" já usado em todo o resto deste sistema. Retorna
// [{data:'YYYY-MM-DD', kwh}], consumido por graficos-cenarios-lazy.js (gráfico "Geração por dia",
// seção 04) via window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2.
function calcularConsumoDiarioApartamento(historicoAscendente){
  if(!Array.isArray(historicoAscendente) || historicoAscendente.length < 2) return [];
  const TRES_HORAS_MS = 3*3600*1000;
  const diaBrasilia = iso => new Date(new Date(iso).getTime() - TRES_HORAS_MS).toISOString().slice(0,10);
  const ultimaPorDia = {}; // 'YYYY-MM-DD' -> energia_total_kwh da última leitura daquele dia (histórico vem em ordem asc, então a última atribuição de cada chave já é a mais recente do dia)
  historicoAscendente.forEach(r => {
    if(r.energia_total_kwh == null || !r.capturado_em) return;
    ultimaPorDia[diaBrasilia(r.capturado_em)] = r.energia_total_kwh;
  });
  const dias = Object.keys(ultimaPorDia).sort();
  const resultado = [];
  for(let i=1;i<dias.length;i++){
    const diffDias = Math.round((new Date(dias[i]+'T00:00:00Z') - new Date(dias[i-1]+'T00:00:00Z')) / 86400000);
    if(diffDias !== 1) continue; // dias não consecutivos - buraco no histórico, não estima o que aconteceu nele
    const delta = Math.round((ultimaPorDia[dias[i]] - ultimaPorDia[dias[i-1]]) * 100) / 100;
    if(delta >= 0) resultado.push({ data: dias[i], kwh: delta });
  }
  return resultado;
}

// Limiares de "leitura desatualizada" (36h/72h) — mesmos números já configurados em
// SAUDE_JOBS_LIMIARES.medidor_tuya (src/auditoria/verificacoes/hydrate-saude-operacional.js),
// repetidos aqui como literal só pra badge deste card específico, sem reimplementar aquela lógica.
async function aplicarMedidorTuya(){
  const MEDIDOR_TUYA_ATENCAO_H = 36;
  const MEDIDOR_TUYA_FALHA_H = 72;
  // Mesmo valor de DIA_LEITURA_WALLACE em graficos-cenarios-lazy.js — duplicado aqui de propósito
  // (módulos da base carregam em paralelo, sem ordem garantida, mesmo motivo já documentado em
  // outras constantes duplicadas deste projeto, ex: SOLAR_GERADOR_LAT em hydrate-clima-solar.js).
  const DIA_LEITURA_WALLACE = 21;
  const ESTADOS_TUYA = { working: 'Funcionando', monitor: 'Monitorando', close: 'Desligado', warning: 'Atenção' };

  const fmtNum = (v, casas, sufixo) => (v == null ? '—' :
    Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + ' ' + sufixo);

  const elAviso = $('medTuyaAviso');
  const elCicloExplicacao = $('medTuyaCicloExplicacao');
  const leituras = window.WALLACE_MEDIDOR_TUYA_V2;

  // Roda independente do restante da função (não depende de `leituras` ter dado) — o gráfico
  // "Geração por dia" (seção 04) lê este global direto, precisa existir mesmo se o resto do card
  // mostrar "Sem leitura ainda".
  window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2 = calcularConsumoDiarioApartamento(window.WALLACE_MEDIDOR_TUYA_HISTORICO_V2);

  if(!Array.isArray(leituras) || !leituras.length){
    ['medTuyaEnergiaHoje','medTuyaEnergiaTotal','medTuyaIdade','medTuyaTensao','medTuyaCorrente','medTuyaEstado','medTuyaConsumoCiclo'].forEach(id => {
      if($(id)) $(id).textContent = '—';
    });
    if($('medTuyaPotencia')) $('medTuyaPotencia').textContent = 'Sem leitura ainda';
    if(elAviso) elAviso.textContent = 'Nenhuma leitura do medidor chegou ainda — assim que o robô sincronizar pela primeira vez, os dados aparecem aqui.';
    if(elCicloExplicacao) elCicloExplicacao.textContent = '';
    window.WALLACE_MEDIDOR_TUYA_RELATORIO = { qtdLeituras: 0 };
    return;
  }

  const ultima = leituras[0];

  if($('medTuyaPotencia')) $('medTuyaPotencia').textContent = fmtNum(ultima.potencia_w, 0, 'W');
  if($('medTuyaTensao')) $('medTuyaTensao').textContent = fmtNum(ultima.tensao_v, 1, 'V');
  if($('medTuyaCorrente')) $('medTuyaCorrente').textContent = fmtNum(ultima.corrente_a, 2, 'A');
  if($('medTuyaEnergiaHoje')) $('medTuyaEnergiaHoje').textContent = fmtNum(ultima.energia_hoje_kwh, 2, 'kWh');
  if($('medTuyaEnergiaTotal')) $('medTuyaEnergiaTotal').textContent = fmtNum(ultima.energia_total_kwh, 1, 'kWh');
  if($('medTuyaEstado')) $('medTuyaEstado').textContent = ultima.estado ? (ESTADOS_TUYA[ultima.estado] || ultima.estado) : '—';

  // Consumo real do ciclo Energisa em andamento (desde o último dia 21) — energia_total_kwh é um
  // contador que só cresce, então a diferença entre a leitura de agora e a leitura-base do ciclo É o
  // consumo real do período, sem precisar de nenhuma fatura em PDF pra saber isso.
  const base = window.WALLACE_MEDIDOR_TUYA_CICLO_BASE_V2;
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const inicioCicloMes = diaHoje >= DIA_LEITURA_WALLACE ? hoje.getMonth() : hoje.getMonth() - 1;
  const inicioCiclo = new Date(hoje.getFullYear(), inicioCicloMes, DIA_LEITURA_WALLACE);
  const diasDeCiclo = Math.max(1, Math.round((hoje - inicioCiclo) / 86400000));
  let consumoCicloKwh = null;
  if(base && base.energia_total_kwh != null && ultima.energia_total_kwh != null){
    consumoCicloKwh = Math.round((ultima.energia_total_kwh - base.energia_total_kwh) * 100) / 100;
  }
  if($('medTuyaConsumoCiclo')) $('medTuyaConsumoCiclo').textContent = consumoCicloKwh != null ? fmtNum(consumoCicloKwh, 1, 'kWh') : '—';
  if(elCicloExplicacao){
    const inicioCicloTexto = inicioCiclo.toLocaleDateString('pt-BR');
    if(consumoCicloKwh != null){
      const mediaDiaria = Math.round((consumoCicloKwh / diasDeCiclo) * 100) / 100;
      elCicloExplicacao.textContent = `Ciclo Energisa em andamento desde ${inicioCicloTexto} (${diasDeCiclo} dia${diasDeCiclo===1?'':'s'}) — média de ${mediaDiaria.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} kWh/dia até agora. Dado real medido — a fatura oficial da Energisa continua sendo a fonte de verdade quando chegar.`;
    } else {
      elCicloExplicacao.textContent = `Ciclo Energisa em andamento desde ${inicioCicloTexto} — ainda não há leitura do medidor a partir dessa data pra calcular o consumo real (medidor instalado recentemente).`;
    }
  }

  // Idade da leitura mais recente — "há Xh Ymin" ou "agora mesmo", só pra exibição (new Date() puro
  // serve aqui, sem cuidado especial de fuso, ver regra do projeto).
  let idadeTexto = '—';
  let horasDesde = null;
  const capturadoEm = ultima.capturado_em ? new Date(ultima.capturado_em) : null;
  if(capturadoEm && !isNaN(capturadoEm.getTime())){
    const diffMs = Date.now() - capturadoEm.getTime();
    horasDesde = diffMs / 3600000;
    if(diffMs < 60000){
      idadeTexto = 'agora mesmo';
    } else {
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      idadeTexto = h > 0 ? `há ${h}h ${m}min` : `há ${m}min`;
    }
  }
  if($('medTuyaIdade')) $('medTuyaIdade').textContent = idadeTexto;

  if(elAviso){
    const corVerde = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#34c98a';
    const corAmbar = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || '#e2a03f';
    const corVermelha = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#e2554f';
    if(horasDesde == null){
      elAviso.textContent = '';
    } else if(horasDesde > MEDIDOR_TUYA_FALHA_H){
      elAviso.textContent = `🔴 Leitura muito desatualizada — sem sincronizar há ${Math.round(horasDesde)}h (esperado até ${MEDIDOR_TUYA_FALHA_H}h).`;
      elAviso.style.color = corVermelha;
    } else if(horasDesde > MEDIDOR_TUYA_ATENCAO_H){
      elAviso.textContent = `🟡 Leitura desatualizada — sem sincronizar há ${Math.round(horasDesde)}h (esperado até ${MEDIDOR_TUYA_ATENCAO_H}h).`;
      elAviso.style.color = corAmbar;
    } else {
      elAviso.textContent = `🟢 Leitura em dia — sincronizada ${idadeTexto}.`;
      elAviso.style.color = corVerde;
    }
  }

  window.WALLACE_MEDIDOR_TUYA_RELATORIO = {
    qtdLeituras: leituras.length,
    ultimaLeitura: ultima,
    horasDesdeUltimaLeitura: horasDesde,
    consumoCicloKwh,
    inicioCiclo: inicioCiclo.toISOString().slice(0,10),
  };
  console.log('MedidorTuya: relatório completo em window.WALLACE_MEDIDOR_TUYA_RELATORIO', window.WALLACE_MEDIDOR_TUYA_RELATORIO);
}
