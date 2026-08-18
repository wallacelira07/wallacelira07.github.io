// MÓDULO: card "⚡ Medidor de energia (tempo real)" — NOVO 17/08/2026 (medidor EKAZA CT 80A na tomada
// geral do apartamento do Wallace, integrado via Tuya Cloud API). Backend já pronto e testado (tabela
// `medidor_tuya_leituras`, robô scripts/sync/atualizar_medidor_tuya.py gravando várias vezes por dia
// via executar_tudo.yml) — este módulo só lê e exibe, não escreve nada.
//
// MOVIDO 17/08/2026 (mesma sessão, minutos depois) de dentro da aba "Painel" pra dentro da aba
// "Energia Solar" (seção 06, junto de "Economia antes × depois (apartamento)") — usuário confirmou
// que este medidor É o apartamento dele, mesma unidade das demais seções dali.
//
// GENERALIZADO 18/08/2026 (pedido do usuário: "quero a mesma coisa que você fez no site para receber
// os dados do meu medidor, fazer para minha irmã, crie os mesmos gráficos tabelas tudo igual"):
// aplicarMedidorTuya() virou aplicarMedidorTuyaPorCasa(cfg) — mesma lógica exata, parametrizada por
// prefixo de id de DOM e fontes de dado (window.WALLACE_MEDIDOR_TUYA_*_V2 do Wallace vs
// window.WALLACE_MEDIDOR_TUYA_*_WELLIDA_V2 da Wellida). Zero duplicação de fórmula — só 1 lugar pra
// corrigir quando a lógica mudar, os 2 cards ficam sempre em paridade por construção, nunca por
// disciplina de manter 2 cópias sincronizadas (mesmo princípio já usado noutros pares
// painel×compartilhado deste projeto).
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
// VARS.ENERGISA_TARIFA_COMPOSICAO.apartamento_wallace (fatura_XXmm_consumo_kwh). Vale pra qualquer
// casa nova que entrar neste mesmo padrão, não só o Wallace.
//
// Fontes (bootstrap fetch em Sistema_Wallace_Lira_Completo.html, mesmo padrão de
// WALLACE_SOLAR_LEITURAS_V2/WALLACE_SOLAR_GERACAO_DIARIA_V2 — JWT Firebase via __wallaceAuthHeader()):
//   window.WALLACE_MEDIDOR_TUYA_V2 / _WELLIDA_V2          — últimas ~50 leituras, capturado_em desc.
//   window.WALLACE_MEDIDOR_TUYA_CICLO_BASE_V2 / _WELLIDA_V2 — 1 leitura: a mais antiga a partir do
//                                                início do ciclo Energisa atual — linha de base pra
//                                                medir o consumo do ciclo em andamento.
//   window.WALLACE_MEDIDOR_TUYA_CONSUMO_DIARIO_V2 / _WELLIDA_V2 — já vem AGREGADO POR DIA do Supabase
//                                                (tabela medidor_tuya_consumo_diario, mantida por um
//                                                TRIGGER no Postgres a cada INSERT em
//                                                medidor_tuya_leituras — ver
//                                                trg_medidor_tuya_consumo_diario, já filtra por
//                                                `casa` desde a generalização multi-casa 18/08/2026).
//
// Diferente do domínio Solar "clássico" (V2-exclusivo, sem fallback pra V1): aqui não existe V1
// nenhuma pra cair de volta, então "sem dado" é sempre o estado normal de quem acabou de instalar o
// medidor (ou, no caso da Wellida em 18/08/2026, ainda nem instalou fisicamente) — nunca um erro, por
// isso mostra "Sem leitura ainda"/"aguardando instalação" em vez de "⚠ Indisponível".
//
// Limiares de "leitura desatualizada" (36h/72h) — mesmos números já configurados em
// SAUDE_JOBS_LIMIARES.medidor_tuya (src/auditoria/verificacoes/hydrate-saude-operacional.js) pro
// medidor do Wallace, repetidos aqui como literal só pra badge deste card específico, sem
// reimplementar aquela lógica. Aplicado também ao card da Wellida por ora (mesmo padrão de robô/
// cron) — revisar se um dia os 2 precisarem de limiares diferentes.
async function aplicarMedidorTuyaPorCasa(cfg){
  const MEDIDOR_TUYA_ATENCAO_H = 36;
  const MEDIDOR_TUYA_FALHA_H = 72;
  const ESTADOS_TUYA = { working: 'Funcionando', monitor: 'Monitorando', close: 'Desligado', warning: 'Atenção' };

  const fmtNum = (v, casas, sufixo) => (v == null ? '—' :
    Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + ' ' + sufixo);

  const p = cfg.idPrefix; // ex: 'medTuya' (Wallace) ou 'medTuyaWellida'
  const $$ = id => $(id);
  const elAviso = $$(p+'Aviso');
  const elCicloExplicacao = $$(p+'CicloExplicacao');
  const leituras = window[cfg.varLeituras];

  if(!Array.isArray(leituras) || !leituras.length){
    ['EnergiaHoje','EnergiaTotal','Idade','Tensao','Corrente','Estado','ConsumoCiclo'].forEach(sufixo => {
      const el = $$(p+sufixo); if(el) el.textContent = '—';
    });
    if($$(p+'Potencia')) $$(p+'Potencia').textContent = cfg.mensagemSemDado || 'Sem leitura ainda';
    if(elAviso) elAviso.textContent = cfg.avisoSemDado || 'Nenhuma leitura do medidor chegou ainda — assim que o robô sincronizar pela primeira vez, os dados aparecem aqui.';
    if(elCicloExplicacao) elCicloExplicacao.textContent = '';
    if($$(p+'Travamento')) $$(p+'Travamento').textContent = '';
    window[cfg.varRelatorio] = { qtdLeituras: 0 };
    return;
  }

  const ultima = leituras[0];

  if($$(p+'Potencia')) $$(p+'Potencia').textContent = fmtNum(ultima.potencia_w, 0, 'W');
  if($$(p+'Tensao')) $$(p+'Tensao').textContent = fmtNum(ultima.tensao_v, 1, 'V');
  if($$(p+'Corrente')) $$(p+'Corrente').textContent = fmtNum(ultima.corrente_a, 2, 'A');
  if($$(p+'EnergiaHoje')) $$(p+'EnergiaHoje').textContent = fmtNum(ultima.energia_hoje_kwh, 2, 'kWh');
  if($$(p+'EnergiaTotal')) $$(p+'EnergiaTotal').textContent = fmtNum(ultima.energia_total_kwh, 1, 'kWh');
  if($$(p+'Estado')) $$(p+'Estado').textContent = ultima.estado ? (ESTADOS_TUYA[ultima.estado] || ultima.estado) : '—';

  // NOVO 17/08/2026 (achado real em produção no medidor do Wallace: o medidor ficou HORAS reportando
  // exatamente os mesmos números — energia_total_kwh, potência, tudo idêntico — mesmo com o robô
  // rodando com sucesso a cada execução; o heartbeat de Saúde Operacional não pega esse caso, porque
  // a chamada à API da Tuya funciona normal, só o VALOR devolvido é que está congelado do lado do
  // aparelho/nuvem Tuya). Detecta isso aqui: anda pelas últimas leituras (já ordenadas capturado_em
  // desc) enquanto energia_total_kwh for IDÊNTICO ao da mais recente; se esse "platô" já dura 60min+
  // E tem pelo menos 2 leituras nele (1 leitura só nunca conta como travamento, é só a mais recente),
  // avisa. 60min é uma folga generosa: no consumo real observado (~350-430W), o contador (resolução
  // de 0,001 kWh) deveria se mover várias vezes nesse intervalo — ficar bit-a-bit igual por tanto
  // tempo não acontece por acaso com o aparelho funcionando normalmente.
  const elTravamento = $$(p+'Travamento');
  if(elTravamento){
    let travado = false, minutosTravado = null;
    const totalUltima = ultima.energia_total_kwh != null ? Number(ultima.energia_total_kwh) : null;
    if(totalUltima != null){
      let i = 0;
      while(i < leituras.length && leituras[i].energia_total_kwh != null && Number(leituras[i].energia_total_kwh) === totalUltima) i++;
      if(i >= 2){
        const maisAntigaDoPlato = leituras[i-1];
        const tsAntigo = maisAntigaDoPlato.capturado_em ? new Date(maisAntigaDoPlato.capturado_em) : null;
        if(tsAntigo && !isNaN(tsAntigo.getTime())){
          minutosTravado = Math.round((Date.now() - tsAntigo.getTime())/60000);
          travado = minutosTravado >= 60;
        }
      }
    }
    if(travado){
      const corVermelha = getComputedStyle(document.documentElement).getPropertyValue('--red').trim() || '#e2554f';
      elTravamento.textContent = `⚠️ Possível travamento: o valor não muda há ${minutosTravado>=120 ? Math.round(minutosTravado/60)+'h' : minutosTravado+'min'}, mesmo com leituras chegando normalmente — o medidor pode ter parado de reportar de verdade (já aconteceu no medidor do Wallace em 17/08/2026, resolvido com reset físico do aparelho).`;
      elTravamento.style.color = corVermelha;
    } else {
      elTravamento.textContent = '';
    }
  }

  // Consumo real do ciclo Energisa em andamento (desde o dia de virada) — energia_total_kwh é um
  // contador que só cresce, então a diferença entre a leitura de agora e a leitura-base do ciclo É o
  // consumo real do período, sem precisar de nenhuma fatura em PDF pra saber isso.
  const base = window[cfg.varCicloBase];
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const diaVirada = cfg.diaViradaCiclo || 21;
  const inicioCicloMes = diaHoje >= diaVirada ? hoje.getMonth() : hoje.getMonth() - 1;
  const inicioCiclo = new Date(hoje.getFullYear(), inicioCicloMes, diaVirada);
  const diasDeCiclo = Math.max(1, Math.round((hoje - inicioCiclo) / 86400000));
  let consumoCicloKwh = null;
  if(base && base.energia_total_kwh != null && ultima.energia_total_kwh != null){
    consumoCicloKwh = Math.round((ultima.energia_total_kwh - base.energia_total_kwh) * 100) / 100;
  }
  if($$(p+'ConsumoCiclo')) $$(p+'ConsumoCiclo').textContent = consumoCicloKwh != null ? fmtNum(consumoCicloKwh, 1, 'kWh') : '—';
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
  if($$(p+'Idade')) $$(p+'Idade').textContent = idadeTexto;

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

  window[cfg.varRelatorio] = {
    qtdLeituras: leituras.length,
    ultimaLeitura: ultima,
    horasDesdeUltimaLeitura: horasDesde,
    consumoCicloKwh,
    inicioCiclo: inicioCiclo.toISOString().slice(0,10),
  };
  console.log(cfg.logLabel+': relatório completo em window.'+cfg.varRelatorio, window[cfg.varRelatorio]);
}

// Wrapper do Wallace — 100% mesmo comportamento de antes da generalização (mesmos ids de DOM, mesmas
// variáveis globais), só passando por cfg em vez de hardcoded dentro da função.
async function aplicarMedidorTuya(){
  return aplicarMedidorTuyaPorCasa({
    idPrefix: 'medTuya',
    varLeituras: 'WALLACE_MEDIDOR_TUYA_V2',
    varCicloBase: 'WALLACE_MEDIDOR_TUYA_CICLO_BASE_V2',
    varRelatorio: 'WALLACE_MEDIDOR_TUYA_RELATORIO',
    diaViradaCiclo: 21,
    logLabel: 'MedidorTuya',
  });
}

// NOVO 18/08/2026: card gêmeo da Wellida — mesmos gráficos/tabelas/campos do Wallace, preparado com
// antecedência (ver .github/workflows/atualizar_medidor_tuya_wellida.yml e
// docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md). Antes do medidor físico dela existir, o card
// mostra "aguardando instalação" (mensagem própria, nunca confundida com uma falha real como a do
// Wallace, que já teve leitura e parou).
async function aplicarMedidorTuyaWellida(){
  return aplicarMedidorTuyaPorCasa({
    idPrefix: 'medTuyaWellida',
    varLeituras: 'WALLACE_MEDIDOR_TUYA_WELLIDA_V2',
    varCicloBase: 'WALLACE_MEDIDOR_TUYA_CICLO_BASE_WELLIDA_V2',
    varRelatorio: 'WALLACE_MEDIDOR_TUYA_WELLIDA_RELATORIO',
    diaViradaCiclo: 21, // TODO: ajustar quando soubermos o dia real do ciclo Energisa da Wellida
    logLabel: 'MedidorTuyaWellida',
    mensagemSemDado: 'Aguardando instalação',
    avisoSemDado: 'Medidor ainda não instalado na casa da Wellida — assim que ela instalar e o robô sincronizar pela primeira vez, os dados aparecem aqui automaticamente (nenhuma ação extra no código será necessária).',
  });
}
