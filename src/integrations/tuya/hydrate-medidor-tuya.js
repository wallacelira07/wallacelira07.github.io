// MÓDULO: card "⚡ Medidor de Energia (Tomada Geral)" — NOVO 17/08/2026 (medidor EKAZA CT 80A
// instalado na tomada geral da casa, integrado via Tuya Cloud API). Backend já pronto e testado
// (tabela `medidor_tuya_leituras`, robô scripts/sync/atualizar_medidor_tuya.py gravando algumas
// vezes por dia via executar_tudo.yml) — este módulo só lê e exibe, não escreve nada.
//
// Diferente do domínio Solar (V2-exclusivo, sem fallback): aqui não existe V1 nenhuma pra cair de
// volta, então "sem dado" é sempre o estado normal de quem acabou de instalar o medidor, nunca um
// erro — por isso mostra "Sem leitura ainda" em vez de "⚠ Indisponível".
//
// Fonte: window.WALLACE_MEDIDOR_TUYA_V2 (array de leituras, já ordenado por capturado_em desc,
// buscado no bootstrap do HTML — ver Sistema_Wallace_Lira_Completo.html, mesmo padrão de
// WALLACE_SOLAR_LEITURAS_V2/WALLACE_SOLAR_GERACAO_DIARIA_V2 logo acima dele). Como é uma série
// temporal (1 INSERT por execução do robô, nunca upsert), o primeiro item do array é sempre a
// leitura mais recente.
//
// Limiares de "leitura desatualizada" (36h/72h) — mesmos números já configurados em
// SAUDE_JOBS_LIMIARES.medidor_tuya (src/auditoria/verificacoes/hydrate-saude-operacional.js),
// repetidos aqui como literal só pra badge deste card específico, sem reimplementar aquela lógica.
async function aplicarMedidorTuya(){
  const MEDIDOR_TUYA_ATENCAO_H = 36;
  const MEDIDOR_TUYA_FALHA_H = 72;
  const ESTADOS_TUYA = { working: 'Funcionando', monitor: 'Monitorando', close: 'Desligado', warning: 'Atenção' };

  const fmtNum = (v, casas, sufixo) => (v == null ? '—' :
    Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + ' ' + sufixo);

  const elAviso = $('medTuyaAviso');
  const leituras = window.WALLACE_MEDIDOR_TUYA_V2;

  if(!Array.isArray(leituras) || !leituras.length){
    if($('medTuyaPotencia')) $('medTuyaPotencia').textContent = 'Sem leitura ainda';
    if($('medTuyaEnergiaHoje')) $('medTuyaEnergiaHoje').textContent = '—';
    if($('medTuyaEnergiaTotal')) $('medTuyaEnergiaTotal').textContent = '—';
    if($('medTuyaIdade')) $('medTuyaIdade').textContent = '—';
    if($('medTuyaTensao')) $('medTuyaTensao').textContent = '—';
    if($('medTuyaCorrente')) $('medTuyaCorrente').textContent = '—';
    if($('medTuyaEstado')) $('medTuyaEstado').textContent = '—';
    if(elAviso) elAviso.textContent = 'Nenhuma leitura do medidor chegou ainda — assim que o robô sincronizar pela primeira vez, os dados aparecem aqui.';
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
  };
  console.log('MedidorTuya: relatório completo em window.WALLACE_MEDIDOR_TUYA_RELATORIO', window.WALLACE_MEDIDOR_TUYA_RELATORIO);
}
