// MÓDULO: shadow-homologacao-necessidade — Sub-fase A da migração do frontend pra
// rpc_necessidade_total_bruta (aprovada 22/08/2026, ver docs/decisions/PLANO_MIGRACAO_FRONTEND_CONSUMO_RPC.md).
// NÃO muda nada que o usuário vê. Depois que recalcularNecessidade() termina, chama a RPC em paralelo
// (fire-and-forget), compara os 13 campos que ela cobre contra o que o JS acabou de calcular, e grava
// o resultado em rpc_homologacao_necessidade_log (Supabase) — mesmo padrão de auth de
// registrar_indicador/rpc_atualizar_reembolso_manejo. Se a rede falhar ou a RPC rejeitar (ex: ciclo
// fechado, guard da RPC), só loga aviso no console — nunca lança erro, nunca toca em REG/VARS/DOM.
// Debounce de 2s: várias chamadas de recalcularNecessidade() durante o boot (uma por onda assíncrona
// que termina) colapsam numa única checagem por "acomodação", em vez de 1 linha de log por onda.
const SHADOW_HOMOLOGACAO_TOLERANCIA = 0.01;
let __shadowHomologacaoTimer = null;

function agendarShadowHomologacaoNecessidade(){
  if(typeof fetch === 'undefined') return;
  clearTimeout(__shadowHomologacaoTimer);
  __shadowHomologacaoTimer = setTimeout(rodarShadowHomologacaoNecessidade, 2000);
}

async function rodarShadowHomologacaoNecessidade(){
  try {
    if(typeof VARS === 'undefined' || !VARS.cicloAtual || typeof REG === 'undefined' || !REG.operacional || !REG.totalOpDetalhe) return;
    const ciclo = VARS.cicloAtual;
    const token = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';
    const headers = { 'Content-Type': 'application/json', apikey: 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization: 'Bearer ' + token };

    const respRpc = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/rpc_necessidade_total_bruta', {
      method: 'POST', headers, body: JSON.stringify({ p_ciclo: null })
    });
    if(!respRpc.ok){
      console.warn(`[shadow-homologacao] RPC recusou/falhou (HTTP ${respRpc.status}) — não crítico, tela não é afetada.`);
      return;
    }
    const linhas = await respRpc.json();
    const rpc = Array.isArray(linhas) ? linhas[0] : linhas;
    if(!rpc) return;

    const D = REG.totalOpDetalhe, O = REG.operacional;
    const campos = [
      ['boletos', D.boletos, rpc.boletos],
      ['parcelas', D.parcelas, rpc.parcelas],
      ['consorcios', D.consorcios, rpc.consorcios],
      ['recorrencias', D.recorrencias, rpc.recorrencias],
      ['aportes_pat', D.aportesPat, rpc.aportes_pat],
      ['prov_mp', D.provMP, rpc.prov_mp],
      ['assinaturas', D.assinaturas, rpc.assinaturas],
      ['total_operacional', O.totalOperacional, rpc.total_operacional],
      ['orcamento_operacional', O.orcamentoOperacional, rpc.orcamento_operacional],
      ['deficit_caixas_sem_lrei', O.deficitCaixasSemLrei, rpc.deficit_caixas_sem_lrei],
      ['necessidade_total_bruta', O.necessidadeTotalBruta, rpc.necessidade_total_bruta],
      ['cobertura_garantida', O.coberturaGarantida, rpc.cobertura_garantida],
      ['necessidade_liquida', O.necessidadeLiquida, rpc.necessidade_liquida],
    ];
    const payload = campos.map(([campo, valorJs, valorRpc]) => ({
      campo,
      valor_js: Number(valorJs) || 0,
      valor_rpc: (valorRpc === null || valorRpc === undefined) ? null : Number(valorRpc),
    }));
    const divergentes = payload.filter(p => p.valor_rpc !== null && Math.abs(p.valor_js - p.valor_rpc) > SHADOW_HOMOLOGACAO_TOLERANCIA);

    if(divergentes.length){
      console.warn(`[shadow-homologacao] DIVERGÊNCIA RPC×JS no ciclo ${rpc.ciclo}:`, divergentes);
    } else {
      console.log(`[shadow-homologacao] RPC×JS bateram em cheio — ciclo ${rpc.ciclo}, ${payload.length} campos.`);
    }

    fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/registrar_homologacao_necessidade', {
      method: 'POST', headers, body: JSON.stringify({ p_ciclo: rpc.ciclo, p_valores: payload })
    }).catch(err => console.warn('[shadow-homologacao] falha ao gravar log (não crítico)', err));
  } catch(err){
    console.warn('[shadow-homologacao] erro inesperado (não crítico, não afeta a tela)', err);
  }
}
