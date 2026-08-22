// MÓDULO: aplicarRpcNecessidade() — Sub-fase B da migração pra rpc_necessidade_total_bruta (aprovada
// 22/08/2026, ver docs/decisions/PLANO_MIGRACAO_FRONTEND_CONSUMO_RPC.md, blocos 44-46 da Passagem de
// Turno). Substitui o antigo shadow-homologacao-necessidade.js (Sub-fase A, só logava) — agora além de
// logar a comparação, TAMBÉM sobrescreve REG.operacional com o valor oficial vindo do banco. A partir
// de agora a RPC é a fonte de: totalOperacional, necessidadeTotalBruta, coberturaGarantida,
// necessidadeLiquida (e, por consequência, saldoCiclo/modoOperacional/fluxo.saidas/fluxo.resultado).
//
// Por que não vira async recalcularNecessidade() inteira: ela é chamada de forma síncrona em cascata
// (boot + todo reprocessamento, dezenas de call sites). Trocar a assinatura pra async propagaria
// `await` por toda essa cascata — risco estrutural desproporcional ao ganho. Em vez disso, o padrão já
// usado neste projeto pra este mesmo problema (aplicarOnda4Wartsila, hydrate-onda4-wartsila.js):
// recalcularNecessidade() continua síncrona, roda primeiro, dá um valor imediato (mesma fórmula JS de
// sempre, nunca removida — é o valor de fallback). Esta função roda depois, assíncrona, e SOBRESCREVE
// com o valor oficial assim que a RPC responde, reprocessando a cascata de telas que depende dele.
//
// Diferença deliberada de política em relação a aplicarOnda4Wartsila(): lá, se a V2 falha, a tela
// mostra aviso "indisponível" (o V1 daquele domínio não era confiável). Aqui, se a RPC falhar (rede
// fora, RPC indisponível, ciclo fechado que a RPC ainda não atende — ver abaixo), a tela MANTÉM o
// valor já calculado por recalcularNecessidade() — é a MESMA fórmula, homologada campo a campo contra
// a RPC (bloco 44/45, zero divergência), só que raiz local. Nunca esconder um valor central do
// dashboard por uma falha de rede transitória quando já existe um valor local correto.
//
// Ciclo fechado (achado ao planejar esta função, não durante um bug): rpc_necessidade_total_bruta só
// aceita p_ciclo = ciclo aberto (boletos/consórcios/aportes_pat/orçamento/déficit ainda leem estado ao
// vivo, sem snapshot por ciclo — Fase 2+ não implementada, ver bloco 43). Pra ciclo fechado,
// recalcularNecessidade() usa o snapshot congelado (ramo `if(snapAtual.fechado)`) — CORRETO, não deve
// ser sobrescrito. Por isso o p_ciclo é sempre VARS.cicloAtual explícito (nunca null): pro ciclo
// aberto funciona normal; pro ciclo fechado a própria RPC rejeita (exception), cai no mesmo caminho de
// "manter valor local" — sem precisar de um `if` duplicado aqui pra decidir isso, o guard já existente
// no banco resolve.
const RPC_NECESSIDADE_TOLERANCIA = 0.01;
let __timerAplicarRpcNecessidade = null;

function agendarAplicacaoRpcNecessidade(){
  if(typeof fetch === 'undefined') return;
  clearTimeout(__timerAplicarRpcNecessidade);
  __timerAplicarRpcNecessidade = setTimeout(aplicarRpcNecessidade, 2000);
}

async function aplicarRpcNecessidade(){
  try {
    if(typeof VARS === 'undefined' || !VARS.cicloAtual || typeof REG === 'undefined' || !REG.operacional || !REG.totalOpDetalhe) return;
    const ciclo = VARS.cicloAtual;
    const token = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';
    const headers = { 'Content-Type': 'application/json', apikey: 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization: 'Bearer ' + token };

    const respRpc = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/rpc_necessidade_total_bruta', {
      method: 'POST', headers, body: JSON.stringify({ p_ciclo: ciclo })
    });

    const D = REG.totalOpDetalhe, O = REG.operacional;
    const valoresLocais = {
      boletos: D.boletos, parcelas: D.parcelas, consorcios: D.consorcios, recorrencias: D.recorrencias,
      aportes_pat: D.aportesPat, prov_mp: D.provMP, assinaturas: D.assinaturas,
      total_operacional: O.totalOperacional, orcamento_operacional: O.orcamentoOperacional,
      deficit_caixas_sem_lrei: O.deficitCaixasSemLrei, necessidade_total_bruta: O.necessidadeTotalBruta,
      cobertura_garantida: O.coberturaGarantida, necessidade_liquida: O.necessidadeLiquida,
    };

    if(!respRpc.ok){
      // Esperado e correto pra ciclo fechado (guard da RPC) — não é falha real, só log informativo.
      const snapAtual = VARS.CICLO_SNAPSHOTS && VARS.CICLO_SNAPSHOTS[ciclo];
      if(snapAtual && snapAtual.fechado){
        console.log(`[aplicar-rpc-necessidade] ciclo ${ciclo} está fechado — RPC não atende (esperado, Fase 2+ não implementada). Mantendo snapshot congelado já aplicado por recalcularNecessidade().`);
      } else {
        console.warn(`[aplicar-rpc-necessidade] RPC recusou/falhou (HTTP ${respRpc.status}) — mantendo valor local já calculado por recalcularNecessidade().`);
      }
      window.WALLACE_RPC_NECESSIDADE_RELATORIO = { status: 'nao_aplicado', http: respRpc.status, ciclo, motivo: (snapAtual && snapAtual.fechado) ? 'ciclo_fechado' : 'http_erro' };
      return;
    }

    const linhas = await respRpc.json();
    const rpc = Array.isArray(linhas) ? linhas[0] : linhas;
    if(!rpc || rpc.necessidade_total_bruta == null){
      console.warn('[aplicar-rpc-necessidade] RPC respondeu sem dado utilizável — mantendo valor local.');
      window.WALLACE_RPC_NECESSIDADE_RELATORIO = { status: 'sem_dado', ciclo };
      return;
    }

    // log de homologação continua ativo (pedido explícito do usuário: manter coletando evidência mesmo
    // depois do corte) — mesma tabela/RPC já usada na Sub-fase A, fire-and-forget.
    const camposLog = Object.keys(valoresLocais).map(campo => ({
      campo, valor_js: Number(valoresLocais[campo]) || 0,
      valor_rpc: (rpc[campo] === null || rpc[campo] === undefined) ? null : Number(rpc[campo]),
    }));
    fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/registrar_homologacao_necessidade', {
      method: 'POST', headers, body: JSON.stringify({ p_ciclo: rpc.ciclo, p_valores: camposLog })
    }).catch(err => console.warn('[aplicar-rpc-necessidade] falha ao gravar log de homologação (não crítico)', err));

    // aplica como fonte oficial
    const antes = { totalOperacional: O.totalOperacional, necessidadeTotalBruta: O.necessidadeTotalBruta, coberturaGarantida: O.coberturaGarantida, necessidadeLiquida: O.necessidadeLiquida };
    O.totalOperacional = Number(rpc.total_operacional);
    O.necessidadeTotalBruta = Number(rpc.necessidade_total_bruta);
    O.coberturaGarantida = Number(rpc.cobertura_garantida);
    O.necessidadeLiquida = Number(rpc.necessidade_liquida);
    if(REG.evolucao){
      if(Array.isArray(REG.evolucao.totalOperacional)) REG.evolucao.totalOperacional[0] = O.totalOperacional;
      if(Array.isArray(REG.evolucao.necessidadeBruta)) REG.evolucao.necessidadeBruta[0] = O.necessidadeTotalBruta;
      if(Array.isArray(REG.evolucao.necessidadeLiquida)) REG.evolucao.necessidadeLiquida[0] = O.necessidadeLiquida;
    }
    REG.balanco.fluxo.saidas = O.necessidadeTotalBruta;
    REG.balanco.fluxo.resultado = Math.round((REG.balanco.fluxo.entradas - REG.balanco.fluxo.saidas) * 100) / 100;
    O.saldoCiclo = Math.round((REG.balanco.fluxo.entradas - O.necessidadeTotalBruta) * 100) / 100;
    if(O.saldoCiclo < 0) O.modoOperacional = 'Crítico';
    else if(O.saldoCiclo < 3000) O.modoOperacional = 'Baixo';
    else if(O.saldoCiclo < 8000) O.modoOperacional = 'Normal';
    else O.modoOperacional = 'Alto';

    const divergiu = Object.keys(antes).some(k => Math.abs(antes[k] - O[k]) > RPC_NECESSIDADE_TOLERANCIA);
    window.WALLACE_RPC_NECESSIDADE_RELATORIO = { status: 'aplicado', ciclo: rpc.ciclo, antes, depois: { totalOperacional: O.totalOperacional, necessidadeTotalBruta: O.necessidadeTotalBruta, coberturaGarantida: O.coberturaGarantida, necessidadeLiquida: O.necessidadeLiquida }, divergiuDoValorLocal: divergiu };
    if(divergiu) console.warn(`[aplicar-rpc-necessidade] RPC aplicada — valor oficial DIVERGIU do local calculado por JS (ciclo ${rpc.ciclo}). Investigar.`, window.WALLACE_RPC_NECESSIDADE_RELATORIO);
    else console.log(`[aplicar-rpc-necessidade] RPC aplicada como fonte oficial — ciclo ${rpc.ciclo}, idêntica ao valor local.`);

    // reprocessa só as telas (hydrate*), nunca os recalcular* (senão eles recalculariam com a fórmula
    // JS de novo e desfariam a sobrescrita acima). Mesma lista de telas dependentes já usada em
    // editarReembolsoManejo() + hydrateBalanco/hydrateCenarios (leem necessidadeTotalBruta/Liquida
    // direto, ver csNecTotal/chEquilibrio, os mesmos ids homologados no bloco 44).
    if(typeof hydrateReembolsos === 'function') hydrateReembolsos();
    if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
    if(typeof hydrateEstimadorSalario === 'function') hydrateEstimadorSalario();
    if(typeof hydrateSimuladorCiclo === 'function') hydrateSimuladorCiclo();
    if(typeof hydrateBalanco === 'function') hydrateBalanco();
    if(typeof hydrateCenarios === 'function') hydrateCenarios();
    if(typeof recalcularIndicadores === 'function') recalcularIndicadores();
    if(typeof hydrateIndicadores === 'function') hydrateIndicadores();
  } catch(err){
    console.warn('[aplicar-rpc-necessidade] erro inesperado — mantendo valor local já calculado (não crítico)', err);
    window.WALLACE_RPC_NECESSIDADE_RELATORIO = { status: 'erro_excecao', erro: String(err) };
  }
}
