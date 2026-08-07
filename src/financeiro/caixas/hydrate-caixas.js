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
  t('cxPixMeta', fmtInt(C.pixVanessa.meta));
  t('cxPixPct', pctOf(C.pixVanessa.saldo,C.pixVanessa.meta).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%');
  { const el=$('cxPixBar'); if(el) el.style.width = pctOf(C.pixVanessa.saldo,C.pixVanessa.meta)+'%'; }
  t('cxManutSaldo', fmt(C.manutencao.saldo));       t('cxManutMeta', fmtInt(C.manutencao.meta));
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
}
