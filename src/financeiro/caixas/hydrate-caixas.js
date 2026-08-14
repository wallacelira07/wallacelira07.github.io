// MÓDULO: hydrateCaixas() — renderização da seção 05 (Caixas Operacionais)
// Extraído de hydrate() (app.js) na modularização (07/08/2026). Script clássico (não ES module),
// carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate), dentro do próprio app.js) e
// chama hydrateCaixas() no meio da própria execução. `C` (=REG.caixasOperacionais) e `pctOf` são
// redeclarados aqui E de volta em hydrate() logo após a chamada (ver app.js) — código depois desta
// seção original também usa os dois, então precisam sobreviver nos 2 lugares, mesmos valores, mesma
// função pura. Nenhum id de DOM, fórmula ou comportamento visual foi alterado.
function hydrateCaixas(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const R = REG;
  const fmtInt = v => 'R$ '+Math.round(v).toLocaleString('pt-BR');

  // caixas operacionais
  const C = R.caixasOperacionais;
  const pctOf = (s,m) => m>0 ? Math.min(100, s/m*100) : 0;
  t('cxBoletosSaldo', fmt(C.boletos.saldo));
  t('cxBoletosMeta', fmtInt(C.boletos.meta));
  t('cxBoletosPct', pctOf(C.boletos.saldo,C.boletos.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxBoletosBar'); if(el) el.style.width = pctOf(C.boletos.saldo,C.boletos.meta)+'%'; }
  t('cxPixSaldo', fmt(C.pixVanessa.saldo));
  t('cxPgvSaldo', fmt(VARS.pixGeralVanessaSaldo)); // V175: card separado - PGV e conta autonoma da Vanessa, distinta da PV (reserva do Wallace)
  // NOVO 07/08/2026: meta de R$300 confirmada pelo usuário pro card CC-103 (antes fixo em "sem meta")
  t('cxPgvMeta', fmtInt(C.pixGeralVanessa.meta));
  t('cxPgvPct', pctOf(C.pixGeralVanessa.saldo, C.pixGeralVanessa.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxPgvBar'); if(el) el.style.width = pctOf(C.pixGeralVanessa.saldo, C.pixGeralVanessa.meta)+'%'; }
  t('cxPixMeta', fmtInt(C.pixVanessa.meta));
  t('cxPixPct', pctOf(C.pixVanessa.saldo,C.pixVanessa.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxPixBar'); if(el) el.style.width = pctOf(C.pixVanessa.saldo,C.pixVanessa.meta)+'%'; }
  t('cxManutSaldo', fmt(C.manutencao.saldo));       t('cxManutMeta', fmtInt(C.manutencao.meta));
  // CORRIGIDO 13/08/2026 (achado do usuário): cxManutPct nunca era escrito aqui - o HTML tinha
  // texto fixo "LREI0001: QUITADO 21/07" no lugar do span, então promoverCaixaComBarraSeConfiavel
  // (app.js) tentava atualizar um id que não existia, sem erro visível (silenciosamente ignorado).
  // Nota do LREI0001 movida pro tooltip de composição (tooltip-composicao-caixa.js).
  t('cxManutPct', pctOf(C.manutencao.saldo, C.manutencao.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxManutBar'); if(el) el.style.width = pctOf(C.manutencao.saldo, C.manutencao.meta)+'%'; }
  // NOVO 05/08/2026: card Bens Duraveis - saldo pode ficar NEGATIVO (compra ja feita sem reserva
  // previa) - cor muda pra vermelho nesse caso, barra fica em 0% (pctOf ja trata negativo como 0 via
  // Math.min(100, ...) mas nao evita negativo dentro do min - forcamos max(0,...) aqui especificamente).
  {
    const elSaldo = $('cxBensDuraveisSaldo');
    if(elSaldo){ elSaldo.textContent = fmt(C.bensDuraveis.saldo); elSaldo.style.color = C.bensDuraveis.saldo < 0 ? 'var(--red)' : 'var(--green)'; }
    t('cxBensDuraveisMeta', fmtInt(C.bensDuraveis.meta));
    const pctBens = Math.max(0, pctOf(C.bensDuraveis.saldo, C.bensDuraveis.meta));
    const elBar = $('cxBensDuraveisBar'); if(elBar) elBar.style.width = pctBens+'%';
    const elAporte = $('cxBensDuraveisAporte'); if(elAporte) elAporte.textContent = 'Aporte alvo: '+fmt(VARS.BENS_DURAVEIS_APORTE_MENSAL_ALVO)+'/mês';
  }
  t('cxEventosSaldo', fmt(C.eventos.saldo));        t('cxEventosMeta', fmtInt(C.eventos.meta));
  t('cxEventosPct', pctOf(C.eventos.saldo,C.eventos.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxEventosBar'); if(el) el.style.width = pctOf(C.eventos.saldo, C.eventos.meta)+'%'; }
  t('cxEventosPct', pctOf(C.eventos.saldo, C.eventos.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=document.querySelector('#cxEventosSaldo').closest('.card').querySelector('.fill'); if(el) el.style.width = pctOf(C.eventos.saldo, C.eventos.meta)+'%'; }
  // NOVO 30/07/2026 (V206): card do Fundo de Suavização - existia no calculo (VARS.contaSuavizacao)
  // e no alerta desde a ativacao (V205), mas nunca tinha card visual proprio na tela. Usuario perguntou
  // "onde esta a caixa de amortecedor no site" - nao estava em lugar nenhum, so no texto do alerta.
  const suaviz = VARS.contaSuavizacao;
  const suavizExcedente = REG.operacional.excedenteOuComplementoProLabore;
  t('cxSuavizSaldo', fmt(suaviz));
  // ATUALIZADO 03/08/2026: era fmt(pró-labore) - agora mostra a META OFICIAL do fundo (R$12.000,
  // decisão do usuário: pior déficit mensal x 3 meses de colchão, arredondado pra meta mínima das
  // 3 opções apresentadas). Nome do card mantido ("Fundo de Suavização Salarial") - só a meta mudou.
  t('cxSuavizProLabore', 'Meta ' + fmt(VARS.metaSuavizacao));
  const suavizTxtEl = $('cxSuavizTxt');
  if(suavizTxtEl){
    if(suaviz === 0 && suavizExcedente > 0) suavizTxtEl.textContent = 'Zerada · excedente do ciclo: ' + fmt(suavizExcedente);
    else if(suaviz === 0) suavizTxtEl.textContent = 'Zerada';
    else suavizTxtEl.textContent = pctOf(suaviz, VARS.metaSuavizacao).toFixed(1) + '% da meta · ' + (suaviz/VARS.proLaboreFixo).toFixed(1) + ' mês(es) de colchão';
  }
  const suavizBar = $('cxSuavizBar');
  if(suavizBar) suavizBar.style.width = pctOf(suaviz, VARS.metaSuavizacao) + '%';
  t('cxSaudeSaldo', fmt(C.saudeFamilia.saldo));     t('cxSaudeMeta', fmtInt(C.saudeFamilia.meta));
  { const el=$('cxSaudeBar'); if(el) el.style.width = pctOf(C.saudeFamilia.saldo, C.saudeFamilia.meta)+'%'; }
  t('cxAnivSaldo', fmt(C.aniversarioJulio.saldo));  t('cxAnivMeta', fmtInt(C.aniversarioJulio.meta));
  { const el=$('cxAnivBar'); if(el) el.style.width = pctOf(C.aniversarioJulio.saldo, C.aniversarioJulio.meta)+'%'; }
  t('cxSeguroSaldo', fmt(C.seguroEmplacamento.saldo)); t('cxSeguroMeta', fmtInt(C.seguroEmplacamento.meta));
  { const el=$('cxSeguroBar'); if(el) el.style.width = pctOf(C.seguroEmplacamento.saldo, C.seguroEmplacamento.meta)+'%'; }
  // NOVO 23/07/2026: card Escola de Julio adicionado na secao 05 (Caixas Operacionais) a pedido do
  // usuario - mesma fonte ja usada no card dedicado da secao 14 (R.escolaJulioSaldo/R.patrimonio.metaEscolaJulio).
  t('cxEscolaSaldo', fmt(R.escolaJulioSaldo));
  t('cxEscolaMeta', fmtInt(R.patrimonio.metaEscolaJulio));
  t('cxEscolaPct', pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxEscolaBar'); if(el) el.style.width = pctOf(R.escolaJulioSaldo, R.patrimonio.metaEscolaJulio)+'%'; }

  // NOVO 13/08/2026 (pedido do usuário: "sempre que for negativo, deixe vermelho e com o sinal
  // de menos") - passe único, centralizado, sobre todos os saldos dos 12 cards estáticos: fmt()
  // já garante o sinal de menos (toLocaleString), aqui só falta garantir a cor. Não sobrescreve
  // quando já é 0 ou positivo (deixa a cor que cada card já define por padrão).
  ['cxBoletosSaldo','cxPixSaldo','cxPgvSaldo','cxWartsila','cxManutSaldo','cxBensDuraveisSaldo',
   'cxEventosSaldo','cxSuavizSaldo','cxSaudeSaldo','cxAnivSaldo','cxSeguroSaldo','cxEscolaSaldo'
  ].forEach(id => {
    const el = $(id);
    if(!el) return;
    const valor = Number((el.textContent||'').replace(/[^0-9,-]/g,'').replace('.','').replace(',','.'));
    if(!isNaN(valor) && valor < 0) el.style.color = 'var(--red)';
  });
}

// NOVO 13/08/2026 (pedido do usuário: "todas as caixas nesse lugar, pra não faltar nenhuma") —
// completa a seção 05 com QUALQUER caixa real (vw_saldo_v2_por_caixa) que não esteja nos 12 cards
// estáticos acima de hydrateCaixas() (Boletos, PIX Vanessa, PGV, Wärtsilä, Manutenção, Bens
// Duráveis, Eventos, Suavização, Saúde, Aniversário, Seguro, Escola). Dinâmico de propósito -
// nomes exatos aqui, não são chutados. Se uma caixa nova for criada no banco, aparece sozinha
// aqui sem precisar editar este arquivo.
const CAIXAS_JA_COBERTAS_ESTATICAMENTE = [
  'Caixa Boletos', 'PIX Vanessa', 'PIX Geral Vanessa', 'Caixa Wartsila',
  'Caixa Manutenção', 'Caixa Bens Duráveis', 'Caixa Eventos', 'Conta Suavização (CC-304)',
  'Caixa Saúde Família', 'Caixa Aniversário Júlio', 'Caixa Seguro Emplacamento', 'Escola de Júlio',
];

async function preencherCaixasOperacionaisExtra(){
  const grid = $('caixasExtraGrid');
  if(!grid) return;
  let saldos, tetos;
  try {
    [saldos, tetos] = await Promise.all([
      WallaceFinanceService.getSaldosPorCaixa(),
      WallaceFinanceService.getTetoMensalCaixas(),
    ]);
  } catch(err){
    console.error('CaixasExtra: falha ao buscar vw_saldo_v2_por_caixa/caixas.teto_mensal.', err);
    grid.innerHTML = '<div class="card" style="color:var(--red)">⚠ Não foi possível carregar as demais caixas.</div>';
    return;
  }
  if(!Array.isArray(saldos)){
    console.warn('CaixasExtra: resposta inesperada de getSaldosPorCaixa().');
    return;
  }
  const extras = saldos.filter(c => !CAIXAS_JA_COBERTAS_ESTATICAMENTE.includes(c.caixa_nome));
  // CORRIGIDO 13/08/2026 (achado do usuário: cards novos destoando visualmente dos 12 estáticos -
  // cor sempre verde, sem "CC-XXX", sem tooltip de composição, sem a barra de progresso/meta que
  // dá a mesma altura dos outros cards). Mesmo padrão de cor dos outros cards (ex: Bens Duráveis):
  // só vermelho se negativo. Barra de progresso usa caixas.teto_mensal quando existe (hoje só
  // Caixa Variável R$2.000 e Emagrecimento R$278,89 têm) - sem meta, mostra barra vazia cinza em
  // vez de esconder o bloco inteiro, pra manter a mesma altura de card em toda a grade.
  // CC-209 atribuído 13/08/2026 (pedido do usuário: "crie" um código pra Emagrecimento, mesma
  // faixa 200 dos custos operacionais mensais pessoais - Saúde=206/Aniversário=207/Seguro=208).
  // CC-210 a CC-214 atribuídos 14/08/2026 (achado do usuário via print: cards novos destoando dos
  // outros por não terem "CC-XXX · " na frente do nome, mesma classe do achado de 13/08 que gerou
  // o CC-209) - próximos números livres da mesma faixa 2xx (custos operacionais pessoais).
  const PREFIXO_CC = {
    'Caixa Lance': 'CC-303 · ', 'Emagrecimento': 'CC-209 · ',
    'Caixa Mercado Pago': 'CC-211 · ', 'Caixa Mastercard_Infinite': 'CC-212 · ',
    'Caixa Churrasco': 'CC-213 · ', 'Caixa Combustível': 'CC-214 · ',
  };
  const mapaTeto = {};
  (Array.isArray(tetos) ? tetos : []).forEach(t => { mapaTeto[t.nome] = Number(t.teto_mensal); });
  // NAO usar $() aqui - $(id) memoiza (DOM[id] ||= document.getElementById(id)) e fica com
  // referencia orfa se este grid for recriado de novo (ex: re-hidratacao); acesso posicional via
  // grid.children[i] sempre pega o elemento vivo da renderizacao atual.
  grid.innerHTML = extras.map((c) => {
    const saldo = Number(c.v2_saldo_calculado);
    const estiloValor = saldo < 0 ? 'style="color:var(--red)"' : '';
    const titulo = (PREFIXO_CC[c.caixa_nome] || '') + c.caixa_nome;
    const teto = mapaTeto[c.caixa_nome];
    const temMeta = teto > 0;
    // CORRIGIDO 13/08/2026 (achado do usuário: sem barra o card fica mais baixo que os outros,
    // grade com alturas desiguais - visibility:hidden reserva o mesmo espaço sem mostrar nada,
    // em vez de omitir o bloco inteiro ou mostrar uma barra vazia/cinza "quebrada").
    const pct = temMeta ? Math.max(0, Math.min(100, saldo/teto*100)) : 0;
    const estiloOculto = temMeta ? '' : 'style="visibility:hidden"';
    const blocoMeta = `<div class="progress" ${estiloOculto}><div class="fill" style="width:${pct}%;background:var(--accent)"></div></div><div class="progress-lbl" ${estiloOculto}><span class="v">${pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%</span><span class="v">${temMeta?fmt(teto):''}</span></div>`;
    return `<div class="card"><div style="font-size:0.72rem;color:var(--text-mid)">${titulo}</div><div class="v" style="font-weight:600" ${estiloValor}>${fmt(saldo)}</div>${blocoMeta}</div>`;
  }).join('');
  // Liga o mesmo tooltip de composição (hover/toque) que os 12 cards estáticos já têm - função
  // exposta por tooltip-composicao-caixa.js pra evitar duplicar a lógica de popover.
  if(typeof window.anexarTooltipComposicaoCaixa === 'function'){
    extras.forEach((c, i) => {
      const card = grid.children[i];
      if(card) window.anexarTooltipComposicaoCaixa(card, c.caixa_nome);
    });
  }
  console.log(`CaixasExtra: ${extras.length} caixa(s) adicional(is) renderizada(s) (${extras.map(c=>c.caixa_nome).join(', ')}).`);
}

// NOVO 13/08/2026 (pedido do usuário: "OK se isso for V2" - metas dos 12 cards estáticos
// deixam de vir de constante fixa no JS e passam a ler caixas.teto_mensal, mesma fonte única
// que os cards dinâmicos (preencherCaixasOperacionaisExtra) já usam desde o início. Só
// SOBRESCREVE quando a caixa tem teto_mensal cadastrado - sem meta no banco, mantém o texto
// que hydrateCaixas() (V1/constante) já escreveu, sem quebrar nada.
const METAS_V2_CARDS_ESTATICOS = {
  'Caixa Boletos':            { idPct: 'cxBoletosPct',  idBarra: 'cxBoletosBar',  idMeta: 'cxBoletosMeta' },
  'PIX Vanessa':               { idPct: 'cxPixPct',      idBarra: 'cxPixBar',      idMeta: 'cxPixMeta' },
  'Caixa Manutenção':          { idPct: 'cxManutPct',    idBarra: 'cxManutBar',    idMeta: 'cxManutMeta' },
  'Caixa Eventos':             { idPct: 'cxEventosPct',  idBarra: 'cxEventosBar',  idMeta: 'cxEventosMeta' },
  'Escola de Júlio':           { idPct: 'cxEscolaPct',   idBarra: 'cxEscolaBar',   idMeta: 'cxEscolaMeta',   idPrazo: 'cxEscolaPrazo' },
  // CORRIGIDO 13/08/2026 (pedido do usuário: "passe essas legendas para dentro da caixa
  // flutuante, deixe fora só a porcentagem e a meta") - estes 4 mostravam um texto de "aporte
  // alvo" no lugar da % (cxSaudeAporteTxt etc, ainda escritos por hydrate-wartsila-caixas-
  // textos.js/hydrateCaixas, agora ocultos via CSS) - o texto continua sendo calculado do mesmo
  // jeito, só que o tooltip de composição (tooltip-composicao-caixa.js) lê ele escondido e
  // mostra dentro do popover. Aqui ganham idPct normal, igual as outras 5 caixas com meta.
  'Caixa Bens Duráveis':       { idPct: 'cxBensDuraveisPct', idBarra: 'cxBensDuraveisBar', idMeta: 'cxBensDuraveisMeta' },
  'Caixa Saúde Família':       { idPct: 'cxSaudePct',        idBarra: 'cxSaudeBar',        idMeta: 'cxSaudeMeta' },
  'Caixa Aniversário Júlio':   { idPct: 'cxAnivPct',         idBarra: 'cxAnivBar',         idMeta: 'cxAnivMeta',   idPrazo: 'cxAnivPrazo' },
  'Caixa Seguro Emplacamento': { idPct: 'cxSeguroPct',       idBarra: 'cxSeguroBar',       idMeta: 'cxSeguroMeta' },
};

async function aplicarMetasV2CaixasEstaticas(){
  let saldos, tetos;
  try {
    [saldos, tetos] = await Promise.all([
      WallaceFinanceService.getSaldosPorCaixa(),
      WallaceFinanceService.getTetoMensalCaixas(),
    ]);
  } catch(err){
    console.error('MetasV2CaixasEstaticas: falha ao buscar dados - mantendo metas fixas do JS.', err);
    return;
  }
  if(!Array.isArray(saldos) || !Array.isArray(tetos)) return;
  const mapaSaldo = {};
  saldos.forEach(s => { mapaSaldo[s.caixa_nome] = Number(s.v2_saldo_calculado); });
  const pctOfLocal = (s,m) => m>0 ? Math.max(0, Math.min(100, s/m*100)) : 0;
  let atualizadas = 0;
  tetos.forEach(({nome, teto_mensal, meta_data_limite}) => {
    const cfg = METAS_V2_CARDS_ESTATICOS[nome];
    const teto = Number(teto_mensal);
    if(!cfg || !(teto > 0) || !(nome in mapaSaldo)) return;
    const saldo = mapaSaldo[nome];
    const pct = pctOfLocal(saldo, teto);
    if(cfg.idPct){ const el = document.getElementById(cfg.idPct); if(el) el.textContent = pct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'; }
    if(cfg.idBarra){ const el = document.getElementById(cfg.idBarra); if(el) el.style.width = pct+'%'; }
    if(cfg.idMeta){ const el = document.getElementById(cfg.idMeta); if(el) el.textContent = 'R$ '+Math.round(teto).toLocaleString('pt-BR'); }
    // NOVO 14/08/2026 (pedido do usuário: contagem regressiva no card das metas com prazo -
    // Escola de Júlio 01/11/2026, Aniversário Júlio 25/08/2026, coluna caixas.meta_data_limite).
    if(cfg.idPrazo && meta_data_limite){
      const el = document.getElementById(cfg.idPrazo);
      if(el){
        const hoje = new Date(new Date().toDateString());
        const alvo = new Date(meta_data_limite+'T00:00:00');
        const dias = Math.round((alvo-hoje)/86400000);
        el.textContent = dias > 0 ? `faltam ${dias} dia${dias===1?'':'s'} (${alvo.toLocaleDateString('pt-BR')})`
          : dias === 0 ? 'é hoje!' : `venceu há ${-dias} dia${dias===-1?'':'s'}`;
        el.style.color = dias <= 7 ? 'var(--red)' : 'var(--text-mid)';
      }
    }
    atualizadas++;
  });
  console.log(`MetasV2CaixasEstaticas: ${atualizadas} card(s) com meta atualizada via caixas.teto_mensal (V2).`);
}
