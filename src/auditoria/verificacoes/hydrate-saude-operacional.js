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
  pluggy:          { atencaoH: 36, falhaH: 72, label: 'Sincronização Pluggy (bancos)' },
  mercadopago:     { atencaoH: 36, falhaH: 72, label: 'Sincronização Mercado Pago' },
  cotacoes_acoes:  { atencaoH: 36, falhaH: 72, label: 'Cotações de ações' },
  geracao_solar:   { atencaoH: 24, falhaH: 48, label: 'Geração solar (SAJ)' },
};

function saudeOperacionalClassificar(job){
  const cfg = SAUDE_JOBS_LIMIARES[job.job_nome] || { atencaoH: 48, falhaH: 96, label: job.job_nome };
  if(job.ultimo_status === 'erro'){
    return { nivel: 'falha', emoji: '🔴', texto: 'última execução terminou com erro' };
  }
  const h = Number(job.horas_desde_ultima_execucao);
  if(h > cfg.falhaH) return { nivel: 'falha', emoji: '🔴', texto: `sem sincronizar há ${Math.round(h)}h (esperado até ${cfg.falhaH}h)` };
  if(h > cfg.atencaoH) return { nivel: 'atencao', emoji: '🟡', texto: `sem sincronizar há ${Math.round(h)}h (esperado até ${cfg.atencaoH}h)` };
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
