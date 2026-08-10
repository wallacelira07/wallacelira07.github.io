// MÓDULO: Compartilhamento público da aba Energia Solar (10/08/2026) — item aprovado pelo usuário:
// link temporário, sem login, expondo só dado do domínio Solar (nunca financeiro). A página pública
// em si (solar-compartilhado.html) é autocontida, fora deste módulo — aqui só a UI de
// criar/listar/revogar link, dentro do painel autenticado (aba Solar, seção 01).
//
// Mesmo padrão de auth das RPCs de escrita já existentes (obterTokenAuthSupabase(), definida em
// app.js) — criar/listar/revogar exigem login válido; só a consulta pública (dentro de
// solar-compartilhado.html) não exige.
const SUPABASE_URL_SOLAR_SHARE = 'https://bakdgacmwlopvrrppwdm.supabase.co';
const SUPABASE_ANON_KEY_SOLAR_SHARE = 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';

function _headersCompartilhamentoSolar(){
  const token = typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null;
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY_SOLAR_SHARE,
    'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY_SOLAR_SHARE),
  };
}

function _linkCompartilhamentoSolarUrl(token){
  // Mesma origem do site (funciona em produção e em qualquer preview local) — solar-compartilhado.html
  // vive na raiz, igual index.html.
  return location.origin + location.pathname.replace(/[^/]*$/, '') + 'solar-compartilhado.html?token=' + token;
}

function fmtDataHoraCompartilhamentoSolar(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}

async function criarLinkCompartilhamentoSolar(){
  const tokenAuth = typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null;
  if(!tokenAuth){ alert('Sem sessão válida — recarregue a página e faça login de novo.'); return; }
  const validadeDias = Number(prompt('Por quantos dias esse link deve funcionar?', '30'));
  if(!validadeDias || validadeDias < 1 || validadeDias > 365){
    if(validadeDias !== 0) alert('Validade precisa ser um número entre 1 e 365 dias.');
    return;
  }
  const el = $('solarLinkGerado');
  if(el){ el.style.display = 'block'; el.textContent = 'Gerando link…'; }
  try {
    const resp = await fetch(`${SUPABASE_URL_SOLAR_SHARE}/rest/v1/rpc/criar_compartilhamento_solar`, {
      method: 'POST', headers: _headersCompartilhamentoSolar(),
      body: JSON.stringify({ p_validade_dias: validadeDias }),
    });
    if(!resp.ok){ const corpo = await resp.json().catch(()=>({})); throw new Error(corpo.message || `erro ${resp.status}`); }
    const dado = await resp.json();
    const link = _linkCompartilhamentoSolarUrl(dado.token);
    if(el){
      el.innerHTML = `✅ Link criado, válido até <strong>${fmtDataHoraCompartilhamentoSolar(dado.expira_em)}</strong>:<br>` +
        `<a href="${link}" target="_blank" rel="noopener" style="color:var(--blue)">${link}</a><br>` +
        `<button type="button" onclick="navigator.clipboard.writeText('${link}').then(()=>alert('Link copiado!'))" style="margin-top:0.5rem;background:var(--surface-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer">Copiar link</button>`;
    }
    renderizarLinksCompartilhamentoSolar();
  } catch(err){
    console.error('criarLinkCompartilhamentoSolar: falha ao criar link.', err);
    if(el) el.textContent = '⚠ Não consegui criar o link — tenta de novo em alguns segundos.';
  }
}

async function desativarLinkCompartilhamentoSolar(token){
  if(!confirm('Desativar esse link? Quem já tem o link deixa de conseguir acessar.')) return;
  try {
    const resp = await fetch(`${SUPABASE_URL_SOLAR_SHARE}/rest/v1/rpc/desativar_compartilhamento_solar`, {
      method: 'POST', headers: _headersCompartilhamentoSolar(),
      body: JSON.stringify({ p_token: token }),
    });
    if(!resp.ok){ const corpo = await resp.json().catch(()=>({})); throw new Error(corpo.message || `erro ${resp.status}`); }
    renderizarLinksCompartilhamentoSolar();
  } catch(err){
    console.error('desativarLinkCompartilhamentoSolar: falha ao desativar.', err);
    alert('Não consegui desativar o link — tenta de novo em alguns segundos.');
  }
}

async function renderizarLinksCompartilhamentoSolar(){
  const el = $('solarLinksAtivos');
  if(!el) return;
  try {
    const resp = await fetch(`${SUPABASE_URL_SOLAR_SHARE}/rest/v1/rpc/listar_compartilhamentos_solar`, {
      method: 'POST', headers: _headersCompartilhamentoSolar(), body: '{}',
    });
    if(!resp.ok) return; // silencioso - painel funciona igual sem essa lista, so nao mostra o historico
    const linhas = await resp.json();
    const ativos = (linhas || []).filter(l => l.ativo && new Date(l.expira_em) > new Date());
    if(!ativos.length){ el.textContent = ''; return; }
    el.innerHTML = 'Links ativos: ' + ativos.map(l =>
      `<span style="display:inline-block;margin:0.2rem 0.4rem 0.2rem 0;padding:0.15rem 0.5rem;background:var(--surface-2);border-radius:6px">` +
      `válido até ${fmtDataHoraCompartilhamentoSolar(l.expira_em)} ` +
      `<a href="#" onclick="desativarLinkCompartilhamentoSolar('${l.token}');return false;" style="color:var(--red);margin-left:0.3rem">revogar</a></span>`
    ).join('');
  } catch(err){
    console.warn('renderizarLinksCompartilhamentoSolar: falha ao listar links (não bloqueia o painel).', err);
  }
}
