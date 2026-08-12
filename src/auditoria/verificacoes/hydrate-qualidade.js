// MÓDULO: hydrateQualidade() — renderização das "Verificações de Negócio" (card de Qualidade,
// id alertasNegocio): 0 transações sem data, LREI ativos/aging, teto oficial da Caixa Variável,
// tolerância temporária, limbo Mastercard Black, PIX Geral Vanessa, Fundo de Suavização, fatura
// Mercado Pago ao vivo, Inbox Financeira pendente. Extraído do IIFE de app.js (função
// montarAlertasNegocio(), chamada de dentro do onDomPronto() logo abaixo do Simulador Fim de Ciclo)
// na modularização (07/08/2026). Script clássico (não ES module), carrega ANTES do app.js — o
// onDomPronto() do app.js chama hydrateQualidade() de dentro da própria execução. cv/comprometidoParaTeto/
// tetoEfetivo/folego/lreiAtivos/diasAging são redeclarados aqui a partir de REG/VARS (mesmo padrão já
// usado em hydrateCaixas com C/pctOf) — o app.js continua com as próprias cópias locais dessas
// variáveis para o resto do Simulador Fim de Ciclo, que não foi tocado. Nenhum id de DOM, fórmula ou
// comportamento mudou.
function montarAlertasNegocio(){
  const q = REG.qualidade;
  const cv = REG.caixaVariavel;
  const comprometidoParaTeto = cv.comprometidoParaTeto;
  const tetoEfetivo = cv.tetoEfetivo;
  const folego = cv.folegoAteTeto;
  const hoje = new Date();
  const lreiAtivos = VARS.LREI_ATIVAS.map(l=>{
    const [d,m] = l.data.split('/').map(Number);
    return { abertura: new Date(hoje.getFullYear(), m-1, d) };
  });
  const diasAging = d => Math.round((hoje - d) / 86400000);

  const alertas = [];
  alertas.push(q.txSemData === 0
    ? {icone:'✅', cor:'#34c98a', txto:'0 transações sem data rastreável'}
    : {icone:'⚠️', cor:'#e2554f', txto:`${q.txSemData} transaç${q.txSemData===1?'ão':'ões'} sem data — checar aba LRP/registro`});
  const maxIdade = lreiAtivos.length ? Math.max(...lreiAtivos.map(l=>diasAging(l.abertura))) : 0;
  if(q.lreiAtivos === 0){
    alertas.push({icone:'✅', cor:'#34c98a', txto:'Nenhum empréstimo interno (LREI) em aberto'});
  } else {
    const nivel = maxIdade<=30 ? {icone:'ℹ️',cor:'#3987e5'} : maxIdade<=60 ? {icone:'⚠️',cor:'#e8a63a'} : {icone:'🔴',cor:'#e2554f'};
    alertas.push({icone:nivel.icone, cor:nivel.cor, txto:`${q.lreiAtivos} empréstimo(s) interno(s) ativo(s) — mais antigo com ${maxIdade} dias`});
  }
  // NOVO 05/08/2026 (parte 100, pendencia deixada em aberto na parte 97: "aplique uma solucao
  // profissional" pro mecanismo de emprestimo interno da Bens Duraveis). Mesmo padrao ja usado pras
  // outras 2 LREI ativas (Caixa Lance emprestando pra Saude Familia/Fatura MP) - so um ALERTA
  // automatico sinalizando a OPORTUNIDADE quando o saldo vira positivo, nunca cria o LREI sozinho
  // (lancamento continua manual/confirmado pelo usuario, regra 04 do manual - nunca lancar no escuro).
  // Enquanto negativo, mostra nota neutra confirmando que isso e esperado (nao e erro, nao significa
  // que saiu dinheiro da Caixa Variavel - ver callout da aba LRBD).
  // CORRIGIDO 12/08/2026 (achado do usuário: alerta mostrava R$-355,00, saldo real V2 já é
  // R$-583,99 — mesma classe de bug do caso PGV/PV acima, só que faltava aqui: esta função lia
  // VARS.caixaBensDuraveis direto, nunca sabendo que a Onda 2 já tinha promovido o card visível
  // pra V2. Mesmo padrão: prefere window.WALLACE_ONDA2_V2_RELATORIO quando disponível.
  const bdV2 = window.WALLACE_ONDA2_V2_RELATORIO?.find(r => r.caixa === 'Caixa Bens Duráveis');
  const saldoBD = (bdV2 && typeof bdV2.v2 === 'number') ? bdV2.v2 : VARS.caixaBensDuraveis;
  if(saldoBD > 0){
    alertas.push({icone:'💡', cor:'#3987e5', txto:`Caixa Bens Duráveis com saldo positivo (${fmt(saldoBD)}) — pode virar empréstimo interno (LREI) pra ajudar a cobrir a fatura do Mastercard, mesmo mecanismo já usado com a Caixa Lance. Precisa de confirmação explícita antes de lançar.`});
  } else if(saldoBD < 0){
    alertas.push({icone:'ℹ️', cor:'#3987e5', txto:`Caixa Bens Duráveis negativa (${fmt(saldoBD)}) — normal, é só o medidor de quanto falta reservar pra compras já feitas; não significa que saiu dinheiro da Caixa Variável.`});
  }
  // CORRIGIDO 19/07/2026: condicao e valor exibido usavam cv.disponivel (Saldo Real - Comprometido, o ECC),
  // uma variavel errada para "quanto passou do teto oficial". O teto oficial e comparado contra o COMPROMETIDO
  // (secao 13 da Politica), nunca contra o disponivel. Valor certo = comprometido - tetoOficial.
  // CORRIGIDO 05/08/2026: usa comprometidoParaTeto (exclui bens duráveis), mesma razão do folego acima.
  const excedente = Math.round((comprometidoParaTeto - cv.tetoOficial)*100)/100;
  alertas.push(excedente <= 0
    ? {icone:'✅', cor:'#34c98a', txto:'Caixa Variável dentro do teto oficial'}
    : {icone: folego>=0 ? '⚠️' : '🔴', cor: folego>=0 ? '#e8a63a' : '#e2554f',
       txto: folego>=0
         ? `Caixa Variável acima do teto oficial (${fmt(excedente)}), coberta pela tolerância temporária — restam ${fmt(folego)} até o teto de ${fmt(tetoEfetivo)}`
         : `Caixa Variável estourou inclusive a tolerância temporária em ${fmt(Math.abs(folego))}`});
  if(q.tetoTemporarioAtivo && cv.tolerenciaTemp > 0){
    // V145 CORRIGIDO: texto era hardcoded "ate 24/07 - salario de 25/07" (datas do ciclo antigo).
    // So aparece quando ha tolerancia ativa DE VERDADE (usuario declarou uma nova) - por padrao,
    // ciclo novo comeca SEM tolerancia (VARS.tolerenciaTemp=0), entao este alerta fica mudo.
    alertas.push({icone:'ℹ️', cor:'#3987e5', txto:`Tolerância temporária de ${fmt(cv.tolerenciaTemp)} ativa neste ciclo — recomposição a combinar`});
  }
  // NOVO 23/07/2026 (REGRA_LIMBO_FATURA_MB_CICLO): como o site e estatico (Claude mantem manualmente,
  // nao ha automacao real de virada de ciclo), este alerta funciona como lembrete ativo - se houver
  // valor represado E o ciclo ja virou (dia >= 25), sinaliza que a rolagem manual (debitar do proximo
  // aporte + zerar o registrador) ainda precisa ser feita na proxima sessao.
  const pendenteLimbo = cv.pendenteProximoCiclo || 0;
  if(pendenteLimbo > 0){
    const diaHoje = new Date().getDate();
    if(diaHoje >= 25){
      alertas.push({icone:'🔴', cor:'#e2554f', txto:`Ciclo virou com ${fmt(pendenteLimbo)} represado do limbo MB — rolar manualmente para o aporte/saldo do novo ciclo e zerar CAIXA_VARIAVEL_PENDENTE_PROXIMO_CICLO`});
    } else {
      alertas.push({icone:'ℹ️', cor:'#3987e5', txto:`${fmt(pendenteLimbo)} represado do limbo Mastercard Black (fecha dia 22) — será descontado do orçamento da Caixa Variável do próximo ciclo na virada do dia 25`});
    }
  }
  // NOVO 29/07/2026 (V204, pedido explicito do usuario): alerta de aporte da PGV. Regra da Politica
  // secao 7: quando o saldo da PIX Geral Vanessa (PGV, conta autonoma dela) cai abaixo de R$50,00,
  // transferir R$300,00 da PIX Vanessa (PV, reserva do Wallace - a caixa DE ONDE o dinheiro sai).
  // Alerta em 3 niveis para o usuario ver ANTES de zerar, nao so depois.
  // CORRIGIDO 09/08/2026: esta funcao roda antes (e e re-chamada depois) das Ondas 1/2 V2
  // resolverem - lia VARS.pixGeralVanessaSaldo/caixaPixVanessa (V1) direto, sem nunca saber que
  // a PGV/PV ja tinham sido promovidas pra V2 no restante da tela (achado ao investigar um
  // relatorio de outro Chat: o alerta mostrava R$50,69/R$302,88, valores que ja tinham sido
  // corrigidos em todo o resto do painel). Agora prefere o valor V2 (via window.WALLACE_ONDA1_V2_
  // RELATORIO/WALLACE_ONDA2_V2_RELATORIO, ja resolvidos quando essas ondas re-chamam esta funcao
  // no fim), caindo pro V1 só se a onda correspondente ainda não rodou.
  const pgvV2 = window.WALLACE_ONDA2_V2_RELATORIO?.find(r => r.caixa === 'PIX Geral Vanessa');
  const saldoPGV = (pgvV2 && typeof pgvV2.v2 === 'number') ? pgvV2.v2 : VARS.pixGeralVanessaSaldo;
  const pvV2 = window.WALLACE_ONDA1_V2_RELATORIO?.find(r => r.caixa === 'PIX Vanessa');
  const saldoPV = (pvV2 && typeof pvV2.v2 === 'number') ? pvV2.v2 : VARS.caixaPixVanessa;
  const GATILHO_APORTE_PGV = 50.00;
  const VALOR_APORTE_PGV = 300.00;
  if(saldoPGV < GATILHO_APORTE_PGV){
    const temNaPV = saldoPV >= VALOR_APORTE_PGV;
    alertas.push({icone:'🔴', cor:'#e2554f',
      txto:`PIX Geral Vanessa em ${fmt(saldoPGV)} — abaixo do gatilho de ${fmt(GATILHO_APORTE_PGV)}. Transferir ${fmt(VALOR_APORTE_PGV)} da PIX Vanessa (tem ${fmt(saldoPV)})${temNaPV ? '' : ' ⚠️ SALDO INSUFICIENTE NA PV'}`});
  } else if(saldoPGV < GATILHO_APORTE_PGV * 2){
    alertas.push({icone:'⚠️', cor:'#e8a63a',
      txto:`PIX Geral Vanessa em ${fmt(saldoPGV)} — aproximando do gatilho de aporte (${fmt(GATILHO_APORTE_PGV)}). Preparar ${fmt(VALOR_APORTE_PGV)} da PIX Vanessa (tem ${fmt(saldoPV)})`});
  } else {
    alertas.push({icone:'✅', cor:'#34c98a',
      txto:`PIX Geral Vanessa em ${fmt(saldoPGV)} — acima do gatilho de aporte (${fmt(GATILHO_APORTE_PGV)})`});
  }
  // NOVO 29/07/2026 (V205): alerta do Fundo de Suavizacao Salarial (ativado nesta sessao, Politica
  // secao 16). Avisa 3 situacoes: (a) salario do ciclo veio acima do pro-labore e o excedente ainda
  // nao foi transferido pro fundo; (b) salario veio abaixo e o fundo precisa cobrir a diferenca;
  // (c) fundo vazio num mes magro (situacao de risco - nao ha colchao pra suavizar).
  const excedenteProLabore = REG.operacional.excedenteOuComplementoProLabore;
  const fundoSuavizacao = VARS.contaSuavizacao;
  if(excedenteProLabore > 0 && fundoSuavizacao === 0){
    alertas.push({icone:'ℹ️', cor:'#3987e5',
      txto:`Fundo de Suavização ativo e zerado — salário deste ciclo veio ${fmt(excedenteProLabore)} acima do pró-labore (${fmt(VARS.proLaboreFixo)}). A partir do próximo salário, transferir o excedente para a caixa do Itaú`});
  } else if(excedenteProLabore < 0){
    const precisa = Math.abs(excedenteProLabore);
    alertas.push(fundoSuavizacao >= precisa
      ? {icone:'⚠️', cor:'#e8a63a', txto:`Mês magro: salário ${fmt(precisa)} abaixo do pró-labore — sacar do Fundo de Suavização (tem ${fmt(fundoSuavizacao)}) para manter o orçamento`}
      : {icone:'🔴', cor:'#e2554f', txto:`Mês magro: falta ${fmt(precisa)} para o pró-labore, mas o Fundo de Suavização só tem ${fmt(fundoSuavizacao)} — sem colchão suficiente, revisar Modo Operacional`});
  } else if(fundoSuavizacao > 0){
    alertas.push({icone:'✅', cor:'#34c98a',
      txto:`Fundo de Suavização com ${fmt(fundoSuavizacao)} — colchão de ${(fundoSuavizacao/VARS.proLaboreFixo).toFixed(1)} mês(es) de pró-labore`});
  }
  // NOVO 04/08/2026 (parte 77, pedido do usuario: "eu nao quero que o ciclo do mercado pago me
  // engane, resolva da forma profissional"): mostra o saldo/fatura ATUAL do Mercado Pago (Pluggy)
  // sempre, o mes inteiro - nao so perto do vencimento (dia 4). Antes esse valor so aparecia (e olhe
  // la, so no console) quando a comparacao de divergencia entrava em jogo, que so faz sentido perto
  // do vencimento (reconciliarPluggy, ver parte 77 la tambem). Aqui e so informativo (nao compara
  // contra o ERP, so mostra o que a Pluggy ve agora), busca direto de VARS.PLUGGY_CONTAS - nao
  // depende do resultado do reconciliador rodar antes.
  (function(){
    const pc = VARS.PLUGGY_CONTAS;
    if(!pc || !pc.conexoes) return;
    let contaMP = null;
    pc.conexoes.forEach(cx=> (cx.contas||[]).forEach(c=>{ if(/mercado\s*pago/i.test(c.nome||'')) contaMP = c; }));
    if(!contaMP || !contaMP.fatura_mes_atual) return;
    const venc = contaMP.fatura_vencimento_atual || contaMP.fatura_mes_atual.vencimento;
    const vencFmt = venc ? new Date(venc).toLocaleDateString('pt-BR') : '?';
    // CORRIGIDO 06/08/2026 (parte 135, usuario apontou confusao real: este alerta mostrava R$0,00
    // cru da Pluggy ao lado do card principal (secao 10) ja mostrando R$669,34 com fallback -
    // pareciam 2 sistemas discordando, quando na verdade so este alerta nunca tinha o fallback.
    // Agora usa VARS.mercadoPagoFatura (ja resolvido com fallback, mesma fonte do card) em vez do
    // valor bruto contaMP.fatura_mes_atual.valor_total - consistente em todo o site.
    const valorFinal = VARS.mercadoPagoFatura;
    const avisoFallback = VARS.mercadoPagoFaturaOrigem === 'fallback_erp_pluggy_zerada' ? ' (Pluggy zerada, valor calculado do ERP)' : '';
    alertas.push({icone:'ℹ️', cor:'#3987e5',
      txto:`Mercado Pago (fatura aberta, ao vivo): ${fmt(valorFinal)} — vence ${vencFmt}${avisoFallback}`});
  })();
  // NOVO 03/08/2026 (V400 Etapa 11 - Alertas): Inbox Financeira acumulando item pendente sem revisão.
  // So conta o que ja existe em VARS.INBOX_FINANCEIRA (nada novo capturado aqui) - mesmo criterio das
  // demais linhas desta funcao (expor contador ja mantido, nao inventar fonte de dado nova). Idade em
  // dias calculada a partir de item.criadoEm (ISO), que ja existe desde a Etapa 1 (inboxAdicionarItem).
  const inboxPendentes = (VARS.INBOX_FINANCEIRA||[]).filter(i=>i.status==='PENDENTE');
  if(inboxPendentes.length === 0){
    alertas.push({icone:'✅', cor:'#34c98a', txto:'Inbox Financeira sem item pendente'});
  } else {
    const maisAntigo = inboxPendentes.reduce((a,b)=> new Date(a.criadoEm) < new Date(b.criadoEm) ? a : b);
    const diasParado = Math.floor((Date.now() - new Date(maisAntigo.criadoEm))/86400000);
    const nivel = diasParado <= 2 ? {icone:'ℹ️',cor:'#3987e5'} : diasParado <= 7 ? {icone:'⚠️',cor:'#e8a63a'} : {icone:'🔴',cor:'#e2554f'};
    alertas.push({icone:nivel.icone, cor:nivel.cor,
      txto:`${inboxPendentes.length} item(ns) pendente(s) na Inbox Financeira — mais antigo há ${diasParado} dia(s) (${maisAntigo.id})`});
  }
  return alertas;
}

function hydrateQualidade(){
  // Verificações de Negócio
  const alertasEl = $('alertasNegocio');
  if(alertasEl){
    // parte 44 (pedido do usuario, "não conversa com o resto do site"): trocado de linha inteira colorida
    // (style="color:...") pra um chip circular colorido + texto em --text-mid, reaproveitando a mesma
    // paleta de 4 cores que ja formava .badge.bg/.ba/.br/.bb no resto do site, so que como icone em vez de pill de texto.
    const CLASSE_POR_COR = {'#34c98a':'bg','#e8a63a':'ba','#e2554f':'br','#3987e5':'bb'};
    alertasEl.innerHTML = montarAlertasNegocio().map(a=>
      `<div class="verif-item ${CLASSE_POR_COR[a.cor]||'bb'}"><span class="verif-ico">${a.icone}</span><span class="verif-txt">${a.txto}</span></div>`
    ).join('');
  }
}
