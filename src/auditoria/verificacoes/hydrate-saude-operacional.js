// MÓDULO: Saúde Operacional — painel de observabilidade das automações agendadas (11/08/2026,
// hardening de produção pedido pelo usuário: "eliminar falha silenciosa"). Lê vw_saude_jobs
// (última execução de cada job Python, gravada por scripts/sync/_heartbeat.py ao final de toda
// execução, sucesso ou erro) e classifica cada job em OK/Atenção/Falha pela idade da última
// execução — sem isso, uma automação parada só era percebida quando alguém notava dado
// desatualizado na tela, dias depois.
//
// Limiares por job (estimados pela cadência esperada de cada automação — cron-job.org não expõe
// o agendamento real pra consulta, então isso é calibrado pelo comportamento documentado dos
// workflows, não um fato garantido; ajustar se a cadência real for diferente):
const SAUDE_JOBS_LIMIARES = {
  seguranca_views: { atencaoH: 36, falhaH: 72, label: 'Verificação de segurança (views)' },
  pluggy:          { atencaoH: 36, falhaH: 72, label: 'Sincronização Pluggy (bancos)' },
  mercadopago:     { atencaoH: 36, falhaH: 72, label: 'Sincronização Mercado Pago' },
  cotacoes_acoes:  { atencaoH: 36, falhaH: 72, label: 'Cotações de ações' },
  geracao_solar:   { atencaoH: 24, falhaH: 48, label: 'Geração solar (SAJ)' },
  // ADICIONADO 15/08/2026 (achado da auditoria de 43 especialistas: os 2 jobs abaixo já gravam
  // heartbeat via _heartbeat.py — backup_externo_criptografado.py/wwi_gerar_relatorio_mensal.py —
  // mas nunca apareciam neste painel, então uma falha silenciosa neles não seria notada.
  // backup_externo.yml roda semanalmente (ver workflow); WWI só no dia 25 (virada de ciclo) —
  // limiares bem mais largos que os jobs diários acima, de propósito, pra não marcar "atenção"
  // por dias sem rodar quando isso é o comportamento esperado.
  backup_externo:     { atencaoH: 24 * 10, falhaH: 24 * 16, label: 'Backup externo (Supabase → GitHub)' },
  wwi_relatorio_mensal: { atencaoH: 24 * 33, falhaH: 24 * 40, label: 'WWI — relatório mensal' },
};

// CORRIGIDO 16/08/2026 (achado do usuário, print real: badge de "Cotações de ações" mostrando
// 🟡 42h/esperado 36h numa segunda-feira de manhã — falso positivo, "isso não é um erro, o mercado
// é só em dias da semana"). A B3 não negocia sábado/domingo, então um job que só roda em dia útil
// fica normalmente ~60h+ parado entre a sexta e a segunda — os limiares fixos (36h/72h) não sabiam
// disso. Conta só HORAS ÚTEIS (seg-sex) entre a última execução e agora pra decidir o nível — fim de
// semana nunca conta contra o limiar. Só aplicado ao job de cotações (o único calendário-dependente
// desse jeito); os outros jobs (Pluggy, Mercado Pago, solar) rodam todo dia, sem essa folga.
function _horasUteisDesde(dataInicioISO){
  const inicio = new Date(dataInicioISO);
  const fim = new Date();
  if(isNaN(inicio.getTime()) || inicio >= fim) return 0;
  let horas = 0;
  for(let cursor = inicio.getTime(); cursor < fim.getTime(); cursor += 3600000){
    const dia = new Date(cursor).getDay(); // 0=domingo, 6=sábado
    if(dia !== 0 && dia !== 6) horas++;
  }
  return horas;
}

function saudeOperacionalClassificar(job){
  const cfg = SAUDE_JOBS_LIMIARES[job.job_nome] || { atencaoH: 48, falhaH: 96, label: job.job_nome };
  if(job.ultimo_status === 'erro'){
    return { nivel: 'falha', emoji: '🔴', texto: 'última execução terminou com erro' };
  }
  const h = Number(job.horas_desde_ultima_execucao);
  const ehJobDiaUtil = job.job_nome === 'cotacoes_acoes' && job.ultima_execucao;
  const hClassificar = ehJobDiaUtil ? _horasUteisDesde(job.ultima_execucao) : h;
  const sufixoLimiar = ehJobDiaUtil ? 'h úteis (fim de semana não conta)' : 'h';
  if(hClassificar > cfg.falhaH) return { nivel: 'falha', emoji: '🔴', texto: `sem sincronizar há ${Math.round(h)}h (esperado até ${cfg.falhaH}${sufixoLimiar})` };
  if(hClassificar > cfg.atencaoH) return { nivel: 'atencao', emoji: '🟡', texto: `sem sincronizar há ${Math.round(h)}h (esperado até ${cfg.atencaoH}${sufixoLimiar})` };
  return { nivel: 'ok', emoji: '🟢', texto: `sincronizado há ${h < 1 ? Math.round(h*60)+'min' : Math.round(h)+'h'}` };
}

function saudeOperacionalRenderErro(motivo){
  const el = $('saudeOperacional');
  if(el) el.innerHTML = `<div style="color:var(--text-danger)">⚠ Não consegui ler o painel de saúde operacional (${motivo}) — isso não afeta o resto do sistema, só esta seção informativa.</div>`;
}

async function aplicarSaudeOperacional(){
  let jobs;
  try {
    jobs = await WallaceFinanceService.getSaudeJobs();
  } catch(err){
    console.error('SaudeOperacional: falha ao buscar vw_saude_jobs.', err);
    saudeOperacionalRenderErro('falha ao buscar dado');
    window.WALLACE_SAUDE_OPERACIONAL_RELATORIO = { status: 'erro', erro: String(err) };
    return;
  }
  if(!Array.isArray(jobs)){
    saudeOperacionalRenderErro('resposta inesperada');
    window.WALLACE_SAUDE_OPERACIONAL_RELATORIO = { status: 'sem_dado' };
    return;
  }

  const porNome = new Map(jobs.map(j => [j.job_nome, j]));
  const relatorio = [];
  const linhas = Object.keys(SAUDE_JOBS_LIMIARES).map(nome => {
    const cfg = SAUDE_JOBS_LIMIARES[nome];
    const job = porNome.get(nome);
    if(!job){
      relatorio.push({ job: nome, status: 'nunca_rodou' });
      return `<div class="row"><span class="k">${cfg.label}</span><span class="v" style="color:var(--text-dim)">⚪ nunca registrou execução</span></div>`;
    }
    const c = saudeOperacionalClassificar(job);
    relatorio.push({ job: nome, status: c.nivel, horasDesdeUltima: Number(job.horas_desde_ultima_execucao), ultimoStatus: job.ultimo_status });
    const cor = c.nivel === 'falha' ? 'var(--text-danger)' : c.nivel === 'atencao' ? 'var(--amber)' : 'var(--green)';
    return `<div class="row"><span class="k">${cfg.label}</span><span class="v" style="color:${cor}">${c.emoji} ${c.texto}</span></div>`;
  });

  const el = $('saudeOperacional');
  if(el) el.innerHTML = linhas.join('');

  const piorNivel = relatorio.some(r => r.status === 'falha') ? 'falha' : relatorio.some(r => r.status === 'atencao' || r.status === 'nunca_rodou') ? 'atencao' : 'ok';
  window.WALLACE_SAUDE_OPERACIONAL_RELATORIO = { status: piorNivel, jobs: relatorio, verificadoEm: new Date().toISOString() };
  console.log('SaudeOperacional: relatório completo em window.WALLACE_SAUDE_OPERACIONAL_RELATORIO', window.WALLACE_SAUDE_OPERACIONAL_RELATORIO);
}
