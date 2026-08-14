// MÓDULO: hydrateSimuladorCiclo() — renderização do progresso do ciclo financeiro (dias decorridos/
// restantes, disponível/dia, barra de progresso), do aging das LREI ativas, e do Simulador Fim de
// Ciclo completo (card ECC, badge "Queda total", r21ECC, e o card Simulador: teto/comprometido/saldo
// real/falta cobrir/fôlego/ritmo por dia/pendente do limbo MB/mensagem). Termina chamando
// hydrateQualidade() (Verificações de Negócio), na mesma posição exata do código original — essa
// seção sempre rodou depois do Simulador, dentro do mesmo onDomPronto(). Extraído da IIFE "Ciclo
// financeiro 100% dinâmico" de app.js (não fazia parte de hydrate(), tinha seu próprio onDomPronto())
// na modularização (07/08/2026). Script clássico (não ES module), carrega ANTES do app.js. Todas as
// variáveis de cálculo (hoje/decorridos/restantes/cv/lreiAtivos/etc) são redeclaradas aqui a partir
// de REG/VARS (mesmo padrão já usado em hydrateQualidade/hydrateCaixas) — o app.js mantém sua própria
// cópia de `cv` para montarResumoAssistente(), que não foi tocada. Nenhum id de DOM, fórmula ou
// comportamento mudou.
function hydrateSimuladorCiclo(){
  const set = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  const hoje = new Date();
  const diaMs = 86400000;

  // Se hoje é dia >= 25, o ciclo começou dia 25 deste mês e termina dia 24 do mês seguinte.
  // Se hoje é dia < 25, o ciclo começou dia 25 do mês anterior e termina dia 24 deste mês.
  let inicio, fim;
  if (hoje.getDate() >= 25) {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 24);
  } else {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth()-1, 25);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 24);
  }

  const totalDias = Math.round((fim-inicio)/diaMs);
  const hojeSoData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let decorridos = Math.round((hojeSoData-inicio)/diaMs);
  decorridos = Math.max(0, Math.min(decorridos, totalDias));
  const restantes = totalDias - decorridos;
  const pct = Math.round(decorridos/totalDias*100);
  const fmtData = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  const fmtCurta = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');

  // Disponivel/dia = REG.caixaVariavel.disponivel (SSOT unico) / dias restantes do ciclo (inclui hoje).
  // CORRIGIDO 22/07/2026 (V128, usuario apontou): quando o disponivel ja e negativo, dividir por dia
  // nao faz sentido nenhum - nao ha "quanto gastar por dia" quando ja nao ha o que gastar. Mostra 0
  // nesse caso, com uma nota separada de quanto falta cobrir (ver simulador abaixo).
  const diasParaDivisao = Math.max(1, restantes);
  const dispDiaReal = REG.caixaVariavel.disponivel > 0 ? REG.caixaVariavel.disponivel / diasParaDivisao : 0;

  // ===== Aging LREI (18/07/2026, V73): dias em aberto de cada emprestimo interno, calculado ao vivo
  // a cada carregamento - nunca mais hardcoded (o ERP ja tinha IDADE_DIAS/STATUS_ENVELHECIMENTO mas
  // ficava parado entre sessoes). Faixas: 0-30 NORMAL, 31-60 ATENCAO, 61+ CRITICO (P4 - toda divida
  // interna deve ser ressarcida, quanto mais velha, maior o risco de ficar esquecida).
  // CORRIGIDO 27/07/2026 (V189): antes era array hardcoded vazio, mesmo com VARS.LREI_ATIVAS já
  // tendo 2 dívidas reais (LREI0002+LREI0003) - o alerta de negócio nunca via essas dívidas porque
  // lia desta lista separada, nunca conectada ao VARS. Bug apontado pelo usuário via print do painel.
  const lreiAtivos = VARS.LREI_ATIVAS.map(l=>{
    const [d,m] = l.data.split('/').map(Number);
    return { abertura: new Date(hoje.getFullYear(), m-1, d) };
  });
  const diasAging = d => Math.round((hoje - d) / 86400000);
  const faixaAging = dias => dias <= 30 ? '' : (dias <= 60 ? ' color:var(--accent)' : ' color:var(--red);font-weight:700');

  // ===== Simulador Fim de Ciclo (18/07/2026, V79 - inovacao pedida pelo usuario): quanto ainda da
  // pra gastar na Caixa Variavel ate o fim do ciclo, considerando o teto oficial + tolerancia
  // temporaria (se ativa). Nao mexe em nenhum outro indicador - e so uma leitura combinada do que
  // ja existe em REG.caixaVariavel, calculada ao vivo (nunca hardcoded).
  const cv = REG.caixaVariavel;
  // CORRIGIDO 05/08/2026 (achado real do usuário: "de onde vou tirar o valor pra cobrir bens
  // duráveis, sai do salário sem caixa prévia?"): bens duráveis (fone de ouvido, cortador Wahl etc)
  // tinham sido excluídos do `mbLRWConfirmado` inteiro pra não estourar o teto de R$2.000 - mas isso
  // também tirava esse dinheiro (REAL, já cobrado no cartão, vai aparecer na fatura de verdade) do
  // `comprometido`/`disponivel`, que é o que diz quanto dinheiro real falta cobrir. Dois problemas
  // diferentes (1: não fazer bem durável parecer estouro de gasto recorrente; 2: nunca esconder
  // dinheiro real da conta de "quanto cobrir") resolvidos com UM número a menos, não dois. Agora:
  // `cv.comprometido` volta a ser o valor CHEIO (bens duráveis incluídos) - disponivel/faltaCobrir
  // continuam certos. Só o teto/fôlego (pace de gasto RECORRENTE, seção 13 da Política) usa um
  // comprometido à parte, subtraindo bens duráveis - eles não deveriam contar contra o ritmo mensal,
  // mas continuam contando contra "quanto preciso ter guardado pra pagar a fatura".
  // CENTRALIZADO 05/08/2026 (parte 97): formula movida pra REG.caixaVariavel (recalcularAgregadosDerivados),
  // agora e fonte unica - antes essa formula so existia aqui dentro, local, sem reuso garantido.
  const comprometidoParaTeto = cv.comprometidoParaTeto;
  const tetoEfetivo = cv.tetoEfetivo;
  const folego = cv.folegoAteTeto;
  // NOVO 22/07/2026 (V128, pedido do usuario): o "Fôlego" (teto - comprometido) confunde porque parece
  // que falta cobrir o valor do estouro do TETO (ex: R$423), quando na real falta so a diferenca entre
  // o que TEM na caixa (saldoReal) e o que ESTA COMPROMETIDO (comprometido) - um numero bem menor.
  // Mostra os 2 lados explicitamente: quanto tem, quanto falta.
  const faltaCobrir = Math.round((cv.comprometido - cv.saldoReal)*100)/100; // positivo = falta, negativo/zero = tem sobra
  // NOVO 12/08/2026 (pedido do usuário: "mude as legendas, não estão fácil de entender" — achado na
  // conversa: "Falta para cobrir" e "Disponível real hoje" mostram o MESMO número (comprometido vs.
  // saldo real na caixa), mas existe um SEGUNDO número, diferente, que nunca aparecia no card: quanto
  // o comprometido já passou do TETO PLANEJADO do mês (R$2.000, por ex.), que é menor que "falta
  // cobrir" quando a caixa ainda não recebeu o aporte completo do mês. Os dois são estouros reais,
  // mas contra bases diferentes (teto planejado × dinheiro que já está de fato na caixa) — deixar os
  // dois visíveis evita a pergunta "como pode -R$154 virar -R$429?" que já aconteceu no chat.
  const estouroTeto = Math.round((cv.comprometido - tetoEfetivo)*100)/100; // positivo = já passou do teto do mês

  set('diasDecorridos', decorridos);
  set('diasRestantes', restantes);
  set('hojeData', fmtData(hoje));
  set('atualizadoEm', 'Atualizado em '+fmtData(hoje));
  set('cicloRange', fmtCurta(inicio)+' → '+fmtData(fim));
  set('dispDia', dispDiaReal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
  const bar = $('cicloProgress');
  if(bar) bar.style.width = pct+'%';
  lreiAtivos.forEach(l=>{
    const el = $(l.id);
    if(el){
      const dias = diasAging(l.abertura);
      el.textContent = dias+(dias===1?' dia':' dias');
      el.setAttribute('style', faixaAging(dias));
    }
  });

  // Simulador Fim de Ciclo
  // Card ECC (secao 07 do painel principal) - status real, nao mais hardcoded "RESOLVIDO"
  const eccStatusEl = $('eccStatus');
  if(eccStatusEl){
    eccStatusEl.textContent = cv.disponivel >= 0 ? 'RESOLVIDO' : (folego >= 0 ? 'ATIVO (dentro da tolerância)' : 'ATIVO (estourou a tolerância)');
    eccStatusEl.style.color = cv.disponivel >= 0 ? 'var(--green)' : (folego >= 0 ? 'var(--amber)' : 'var(--red)');
  }
  set('eccValor', fmt(cv.disponivel));
  set('eccFolego', fmt(folego));

  // Badge "Queda total" (Necessidade líquida) - calculado ao vivo a partir da MESMA serie usada
  // no grafico (18/07/2026, V85: estava hardcoded, descolado do dado real ha varias rodadas).
  const nlSerie = alignSeriesCiclo(REG.evolucao.necessidadeLiquida); // V165: baseado no ciclo financeiro
  const quedaTotal = Math.round((nlSerie[0] - nlSerie[nlSerie.length-1])*100)/100;
  set('quedaTotalNL', 'Queda total: '+fmt(quedaTotal));
  const r21EccEl = $('r21ECC');
  if(r21EccEl){
    r21EccEl.textContent = cv.disponivel >= 0 ? 'Zerado' : (folego >= 0 ? 'Ativo (na tolerância)' : 'Ativo (estourado)');
    r21EccEl.style.color = cv.disponivel >= 0 ? 'var(--green)' : (folego >= 0 ? 'var(--accent)' : 'var(--red)');
  }

  set('simDiasRestantes', restantes+(restantes===1?' dia':' dias'));
  set('simTeto', fmt(tetoEfetivo)+(cv.tolerenciaTemp>0 ? ' *' : ''));
  set('simComprometido', fmt(cv.comprometido));
  set('simSaldoReal', fmt(cv.saldoReal));
  const faltaEl = $('simFalta');
  if(faltaEl){
    faltaEl.textContent = faltaCobrir > 0 ? fmt(faltaCobrir) : 'R$ 0,00 (coberto)';
    faltaEl.style.color = faltaCobrir > 0 ? 'var(--red)' : 'var(--green)';
  }
  const folegoEl = $('simFolego');
  if(folegoEl){
    folegoEl.textContent = fmt(cv.disponivel); // CORRIGIDO 26/07/2026 (V182, usuario apontou "Folego ate teto errado"): antes mostrava tetoEfetivo-comprometido (fôlego contra o TETO OFICIAL de R$2.000, sempre igual mesmo com saldo real menor) - renomeado para "Disponível real hoje" e agora mostra cv.disponivel (saldoReal-comprometido), a mesma metrica do card Caixa Variavel acima, sem ambiguidade.
    folegoEl.style.color = cv.disponivel >= 0 ? 'var(--green)' : 'var(--red)';
  }
  // NOVO 12/08/2026 (ver comentário de estouroTeto acima): quinto valor do card, mostra o estouro
  // contra o TETO PLANEJADO (sempre <= "Falta cobrir" em módulo, já que o teto pode ser maior que o
  // saldo real hoje). "Dentro do teto" quando ainda não estourou.
  const estouroTetoEl = $('simEstouroTeto');
  if(estouroTetoEl){
    estouroTetoEl.textContent = estouroTeto > 0 ? fmt(estouroTeto) : 'Dentro do teto';
    estouroTetoEl.style.color = estouroTeto > 0 ? 'var(--red)' : 'var(--green)';
  }
  // NOVO 26/07/2026 (V182): "cadê o valor que possa gastar por dia?" - a descricao do card ja
  // prometia "ritmo sugerido por dia" (Politicas sec.15) mas nunca foi implementado. Disponivel real
  // dividido pelos dias restantes do ciclo, nunca negativo (minimo R$0,00 se ja estourou).
  const porDiaEl = $('simPorDia');
  if(porDiaEl){
    const porDia = restantes > 0 ? Math.max(0, cv.disponivel) / restantes : 0;
    porDiaEl.textContent = fmt(Math.round(porDia*100)/100);
  }
  // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO): card so aparece se houver algo represado -
  // enquanto pendenteProximoCiclo=0 (sem compras na janela 23-25 ainda), fica escondido para nao
  // poluir o painel com um card vazio.
  const pendenteBox = $('simPendenteBox');
  const pendenteValor = cv.pendenteProximoCiclo || 0;
  if(pendenteBox){
    pendenteBox.style.display = pendenteValor > 0 ? 'block' : 'none';
  }
  set('simPendenteValor', fmt(pendenteValor));
  const msgEl = $('simMensagem');
  if(msgEl){
    const porDiaMsg = restantes > 0 ? Math.max(0, cv.disponivel) / restantes : 0;
    if(faltaCobrir <= 0){
      msgEl.innerHTML = `Tem <strong>${fmt(cv.saldoReal)}</strong> na caixa e o comprometido é <strong>${fmt(cv.comprometido)}</strong> — está coberto, sobra <strong>${fmt(Math.abs(faltaCobrir))}</strong>. Isso dá <strong>${fmt(Math.round(porDiaMsg*100)/100)}/dia</strong> pelos ${restantes} dias restantes do ciclo.`
        + (folego < 0 ? ` (Ainda assim, acima do teto oficial em ${fmt(Math.abs(folego))} — coberto pela tolerância temporária.)` : '');
    } else {
      // CORRIGIDO 12/08/2026 (pedido do usuário: legendas confusas — "Falta cobrir" e "estouro do
      // teto" são 2 números diferentes, e o texto só citava o primeiro): quando os dois estouraram,
      // explica os dois separados, pra nunca mais precisar perguntar "como pode -R$154 virar -R$429?".
      const fraseTeto = estouroTeto > 0
        ? ` Isso já inclui <strong>${fmt(estouroTeto)}</strong> de estouro do teto do mês (${fmt(tetoEfetivo)}) — o resto (${fmt(Math.round((faltaCobrir-estouroTeto)*100)/100)}) é aporte do mês que ainda não caiu na caixa.`
        : ` Ainda dentro do teto do mês (${fmt(tetoEfetivo)}) — só falta o aporte cair na caixa.`;
      msgEl.innerHTML = `<strong style="color:var(--red)">Falta ${fmt(faltaCobrir)}</strong> para cobrir o comprometido — tem ${fmt(cv.saldoReal)} na caixa contra ${fmt(cv.comprometido)} comprometido.${fraseTeto} Recomposição prevista via reembolso Wärtsilä ou salário de 25/07.`;
    }
  }

  hydrateQualidade(); // MODULARIZAÇÃO 07/08/2026: renderização das Verificações de Negócio, chamada na mesma posição exata do código original (sempre rodou logo depois do Simulador, dentro do mesmo onDomPronto()).
}
