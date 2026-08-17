// src/supabase/client.js
// Cliente mínimo via fetch direto ao PostgREST do Supabase — mesmo padrão já
// usado pelos scripts Python deste repositório (scripts/sync/*.py,
// scripts/database/*.py): SUPABASE_URL + SUPABASE_KEY (aqui, service_role),
// chamando /rest/v1/<tabela> e /rest/v1/rpc/<funcao> direto, sem SDK extra.
//
// Por que fetch direto e não @supabase/supabase-js: mantém este scaffold sem
// dependência a mais, e o padrão já é o mesmo que o resto do repositório usa
// para automações fora do navegador. Trocar pelo SDK oficial é uma melhoria
// razoável antes de produção (ver README.md), não uma exigência.

const config = require('../config');

const BASE_URL = config.supabase.url.replace(/\/+$/, '');
const SERVICE_ROLE_KEY = config.supabase.serviceRoleKey;

function headersPadrao(extra = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * SELECT via PostgREST.
 * @param {string} tabelaOuView - nome da tabela/view (ex: "vw_saldo_v2_por_caixa").
 * @param {object} opcoes
 * @param {string} [opcoes.select] - lista de colunas (default "*").
 * @param {object} [opcoes.filtros] - { coluna: "eq.valor" } no formato PostgREST.
 * @param {string} [opcoes.order] - ex: "data.desc".
 * @param {number} [opcoes.limite]
 */
async function select(tabelaOuView, opcoes = {}) {
  const params = new URLSearchParams();
  params.set('select', opcoes.select || '*');
  if (opcoes.filtros) {
    for (const [coluna, condicao] of Object.entries(opcoes.filtros)) {
      params.append(coluna, condicao);
    }
  }
  if (opcoes.order) params.set('order', opcoes.order);
  if (opcoes.limite) params.set('limit', String(opcoes.limite));

  const resp = await fetch(`${BASE_URL}/rest/v1/${tabelaOuView}?${params.toString()}`, {
    method: 'GET',
    headers: headersPadrao(),
  });

  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`[supabase] SELECT ${tabelaOuView} falhou (${resp.status}): ${corpo}`);
  }
  return resp.json();
}

/**
 * Chama uma RPC (função) do Postgres via PostgREST.
 * @param {string} nomeFuncao
 * @param {object} params - argumentos nomeados (p_...).
 */
async function rpc(nomeFuncao, params = {}) {
  const resp = await fetch(`${BASE_URL}/rest/v1/rpc/${nomeFuncao}`, {
    method: 'POST',
    headers: headersPadrao(),
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`[supabase] RPC ${nomeFuncao} falhou (${resp.status}): ${corpo}`);
  }
  // RPCs podem retornar '' quando o corpo é vazio.
  const texto = await resp.text();
  return texto ? JSON.parse(texto) : null;
}

module.exports = { select, rpc };
