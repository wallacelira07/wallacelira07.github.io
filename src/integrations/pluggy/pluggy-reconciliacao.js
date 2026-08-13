// MÓDULO: Reconciliação Pluggy (V400 Etapa 2/3) — CARTAO_PLUGGY_MAPA_DEFAULT/gerarIdExternoPluggy/
// pluggyJaTriado/reconciliarPluggy/classificarViaV2/reconciliarTransacoesPluggy. Extraído de app.js
// na modularização (07/08/2026) — funções globais, chamadas por referência (onDomPronto/dentro de
// outras funções). Só modularização, nenhuma fórmula ou comportamento mudou.
//
// IMPORTANTE: `const CARTAO_PLUGGY_MAPA = VARS.CARTAO_PLUGGY_MAPA || CARTAO_PLUGGY_MAPA_DEFAULT;`
// FICOU EM app.js (não foi movida pra cá) de propósito — essa linha é avaliada de forma SÍNCRONA no
// momento em que roda (não dentro de uma função chamada depois), e precisa de VARS já populado. Se
// virasse um `const` de topo aqui (módulo carregado ANTES do app.js), VARS ainda não existiria nesse
// ponto e a linha quebraria a carga inteira da página. CARTAO_PLUGGY_MAPA_DEFAULT (só o literal, sem
// tocar VARS) é seguro de mover — reconciliarPluggy()/classificarItemDeterministico() continuam
// referenciando o global CARTAO_PLUGGY_MAPA (definido em app.js), só usado dentro de função, nunca no
// load do módulo.
//
// V400 Etapa 2 (Pluggy Total) - reconciliarPluggy(). ESCOPO REAL, nao o do brief original: o brief pedia
// reconciliar "lancamentos" (transacao a transacao), mas a automacao que grava VARS.PLUGGY_CONTAS no
// Supabase reporta erro HTTP 410 em TODAS as contas ao buscar transacoes ("endpoint descontinuado, usar
// /v2/transactions com cursor") - ou seja, hoje so saldo/fatura por conta chegam, nunca a lista de
// lancamentos. Reconciliar por SALDO/FATURA e o que da pra fazer sem fabricar dado que nao existe.
// Mapa fixo final-4-digitos -> livro/titular, copiado literal da Politica secao 3 (CARTAO_MAPA) - nunca
// inventado aqui. So os finais com um total agregado correspondente em VARS entram no mapa (2244/4628/6351
// somam em cartaoMBTotal; 4845 e o unico Infinite ativo, cartaoInfiniteTotal). Cartao Mercado Pago casado
// pelo nome da conexao (Pluggy nao usa final-4 pra ele, usa "numero" interno tipo "7642").
const CARTAO_PLUGGY_MAPA_DEFAULT = {
  // ATUALIZADO 08/08/2026: mapeamento oficial confirmado pelo usuário diretamente (não inferido) —
  // Itaú Wallace (1371 físico/4628 virtual/5147 Samsung Wallet), Itaú Vanessa (6351 físico/5660
  // virtual/4017 Samsung Wallet). '1371'/'5147'/'5660'/'4017' nunca tinham entrada aqui antes —
  // gap real que deixava esses 4 finais caindo em "não mapeado" caso a V2 (`cartoes`, ver
  // construirCartaoPluggyMapa() abaixo) estivesse indisponível. Fallback só usado offline/falha de
  // fetch — a fonte viva é a tabela `cartoes`, já atualizada com os mesmos 3 cartões novos.
  '1371': {titular:'Wallace', apelido:'MB físico (novo, substitui 2244)', totalVar:'cartaoMBTotal'},
  '2244': {titular:'Wallace', apelido:'MB físico (aposentado, substituído por 1371)', totalVar:'cartaoMBTotal'},
  '4628': {titular:'Wallace', apelido:'MB virtual', totalVar:'cartaoMBTotal'},
  '5147': {titular:'Wallace', apelido:'MB Samsung Wallet', totalVar:'cartaoMBTotal'},
  '6351': {titular:'Vanessa', apelido:'MB físico', totalVar:'cartaoMBTotal'},
  '5660': {titular:'Vanessa', apelido:'MB virtual', totalVar:'cartaoMBTotal'},
  '4017': {titular:'Vanessa', apelido:'MB Samsung Wallet', totalVar:'cartaoMBTotal'},
  '4845': {titular:'Vanessa', apelido:'Visa Infinite ativo', totalVar:'cartaoInfiniteTotal'},
  '4844': {titular:'Wallace', apelido:'Visa Infinite aposentado', totalVar:null}, // CORRIGIDO 04/08/2026 (parte 84, achado durante migracao pro Supabase): estava 'Vanessa' aqui, mas a Politica (secao 3, tabela oficial de cartoes) diz Wallace - inconsistencia entre os dois, Politica prevalece (documento de referencia formal). so liquidacao, sem total agregado pra comparar
  '2773': {titular:'Wallace', apelido:'Bradesco parcelamentos antigos', totalVar:null},
  '0026': {titular:'Vanessa', apelido:'Bradesco', totalVar:null},
  // CONFIRMADO PELO USUARIO 03/08/2026: substituido de verdade pelo 6351 - a conexao Pluggy ainda nao foi
  // atualizada (continua puxando o cartao antigo). Fica mapeado (nao mais "nao mapeado"), mas sinalizado
  // como conexao desatualizada - acao real necessaria e do lado da Pluggy/banco, nao do codigo.
  // CORRIGIDO 04/08/2026 (parte 65, erro de sessao anterior): mapeamento estava errado - dizia
  // titular Vanessa, "substituido pelo 6351", conexaoDesatualizada. Usuario mostrou print do proprio
  // app da Pluggy: as 61 transacoes deste cartao (H57Store, Tapiocaria Irmao Firmi, Uber, Pax Domini)
  // sao EXATAMENTE as mesmas ja rastreadas manualmente como compras do WALLACE (TX000183-186,
  // TX000179/180 - conferido valor a valor, bate 100%). Ou seja: e o cartao MB atual do Wallace (o
  // "cartao NOVO 1371" mencionado nos comentarios de TX000184-186), a conexao Pluggy JA esta
  // atualizada e sincronizando normal - a resposta anterior desta sessao ("nenhum cartao do Wallace
  // aparece no Pluggy") estava errada, baseada neste mapeamento incorreto. totalVar agora aponta pra
  // cartaoMBTotal (mesmo agregado onde essas compras ja foram somadas manualmente), permitindo o
  // cruzamento fatura-Pluggy x ERP que antes ficava pulado (totalVar:null).
  // CORRIGIDO 04/08/2026 (parte 66, achado real ao vivo - usuario suspeitou certo): puxada a lista
  // COMPLETA das 61 transacoes deste "2250" no Supabase (nao so uma amostra) - e a FATURA UNICA E
  // CONSOLIDADA de todo o produto Itau Personnalite Multi Black, nao um cartao de uma pessoa so.
  // Mistura na mesma fatura: compras do Wallace (H57Store, Uber, Tapiocaria), TODAS as assinaturas/
  // recorrencias ja rastreadas em LRS/LRR (Netflix, Spotify, ChatGPT, Amazon Prime, Vivo, Brisanet,
  // Faculdade/SOCEC, Digna, New Car), E coisas antes atribuidas "assumidamente" a um cartao separado
  // da Vanessa (Drogasil TX000176, MP*TIORAFAKIDS TX000191 - corte de cabelo do filho) - todas aqui
  // tambem, sob o MESMO numero de conta Pluggy. Ou seja: os numeros "2244"/"4628"/"6351"/"1371"
  // citados nos comentarios do codigo sao os PLASTICOS fisicos/virtuais usados por cada pessoa da
  // familia, mas a Pluggy so enxerga UMA conta consolidada (fatura unica do produto Personnalite
  // Multi Black) - nao da pra saber por essa API qual pessoa/plastico fez cada compra individual
  // (precisaria de campo por-transacao que o script atual nao captura, nao confirmado se a Pluggy
  // ate expõe isso). CORRECAO DA PARTE 65 (que disse titular:'Wallace' sozinho) estava incompleta -
  // e conta compartilhada titular+dependente(s), nao so do Wallace. totalVar continua cartaoMBTotal
  // (esse SIM ja e o agregado combinado certo, isso a parte 65 acertou).
  '2250': {titular:'Compartilhada (Wallace+Vanessa, fatura única Personnalité Multi Black)', apelido:'MB - fatura consolidada (físicos 1371/2244 + virtual 4628 + dependente)', totalVar:'cartaoMBTotal'},
  // CONFIRMADO PELO USUARIO 03/08/2026: cartao bloqueado, sem uso - nao precisa reconciliar, so documentar
  // pra nao aparecer mais como "nao mapeado" a cada carga.
  '9187': {titular:null, apelido:'AZUL ITAU VISA INFINITE (bloqueado, sem uso)', totalVar:null, bloqueado:true}
};

// NOVO 08/08/2026 (Wave B1 — desligamento da V1): titular/apelido/status agora vêm da tabela
// `cartoes` (V2, já mais atualizada que o literal acima — tem o cartão 1371 que substituiu o 2244,
// coisa que o literal nunca chegou a receber). `totalVar` (qual agregado do ERP cada cartão soma) e
// `conexaoDesatualizada` continuam como regra local — são fato da integração Pluggy em si (qual
// conta bate com qual total), não dado de identidade do cartão, e não têm coluna correspondente em
// `cartoes` hoje. window.WALLACE_CARTOES_V2 é buscado em paralelo no bootstrap (mesmo padrão de
// window.WALLACE_LEGENDAS_REMOTAS); se vier null (offline/falha), cai 100% no literal
// CARTAO_PLUGGY_MAPA_DEFAULT acima, sem quebrar nada.
// ATUALIZADO 08/08/2026: mapeamento oficial de finais Mastercard Black confirmado pelo usuário
// diretamente (Itaú Wallace: 1371 físico/4628 virtual/5147 Samsung Wallet; Itaú Vanessa: 6351
// físico/5660 virtual/4017 Samsung Wallet) — 5147/5660/4017 são cartões novos, nunca tinham linha
// em `cartoes` nem entrada aqui antes disso. Todos batem na mesma fatura consolidada (ver '2250'
// no CARTAO_PLUGGY_MAPA_DEFAULT abaixo) — a Pluggy só expõe o total da fatura por "2250", nunca por
// plástico individual; estes finais servem pra atribuir TITULAR quando o texto de uma transação
// cita "final XXXX" (ver classificarItemDeterministico() em classificacao-inbox.js).
const CARTAO_PLUGGY_TOTALVAR_POR_NUMERO = {
  '2244':'cartaoMBTotal', '1371':'cartaoMBTotal', '4628':'cartaoMBTotal', '5147':'cartaoMBTotal',
  '6351':'cartaoMBTotal', '5660':'cartaoMBTotal', '4017':'cartaoMBTotal', '2250':'cartaoMBTotal',
  '4845':'cartaoInfiniteTotal',
};
const CARTAO_PLUGGY_NOME_USUARIO = {
  'f70b0f48-9d73-44fd-a05b-6f3248bbea21': 'Wallace',
  '77496938-c875-4578-b6d1-06ffbde3f247': 'Vanessa',
  '89f205ad-2381-4149-b10f-7170aa13f5d5': 'Júlio',
  '3bb93c24-8353-4a4b-91cb-ef055809cc04': 'Gabriela',
};
function construirCartaoPluggyMapa(){
  const cartoesV2 = (typeof window !== 'undefined') ? window.WALLACE_CARTOES_V2 : null;
  if(!Array.isArray(cartoesV2) || !cartoesV2.length){
    console.warn('construirCartaoPluggyMapa: window.WALLACE_CARTOES_V2 indisponível — usando CARTAO_PLUGGY_MAPA_DEFAULT (literal local).');
    return CARTAO_PLUGGY_MAPA_DEFAULT;
  }
  const mapa = {};
  cartoesV2.forEach(c => {
    const numero = c.numero_final;
    if(!numero) return;
    let titular = c.usuario_id ? (CARTAO_PLUGGY_NOME_USUARIO[c.usuario_id] || null) : null;
    if(!titular && c.dono_real_id){
      titular = `Compartilhada (titular real: ${CARTAO_PLUGGY_NOME_USUARIO[c.dono_real_id] || c.dono_real_id})`;
    }
    mapa[numero] = {
      titular,
      apelido: c.apelido || numero,
      totalVar: CARTAO_PLUGGY_TOTALVAR_POR_NUMERO[numero] || null,
      bloqueado: c.status === 'bloqueado',
    };
  });
  console.log(`construirCartaoPluggyMapa: mapa construído a partir de "cartoes" (V2), ${Object.keys(mapa).length} cartão(ões) — substitui CARTAO_PLUGGY_MAPA_DEFAULT.`);
  return mapa;
}

// id sintetico e deterministico por item da Pluggy, usado pra persistir a triagem (PLUGGY_TRIAGEM) e
// pra nao re-adicionar na Inbox um item que o usuario ja aprovou/rejeitou - sem isso, toda carga da
// pagina recriava o item do zero (reconciliarPluggy roda em todo onDomPronto) e o clique em
// Aprovar/Rejeitar nunca "grudava" de fato. Divergencia inclui o vencimento no id de proposito: uma
// nova fatura com nova divergencia deve poder aparecer de novo, mesmo cartao.
function gerarIdExternoPluggy(tipo, numero, extra){
  return `pluggy-${tipo}-${numero}${extra?('-'+extra):''}`;
}
function pluggyJaTriado(idExterno){
  const t = VARS.PLUGGY_TRIAGEM;
  return !!(t && t[idExterno] && (t[idExterno].status_triagem === 'aprovado' || t[idExterno].status_triagem === 'rejeitado'));
}

function reconciliarPluggy(){
  const pc = VARS.PLUGGY_CONTAS;
  const resultado = {divergencias:[], naoMapeados:[], erros:[], ok:[]};
  if(!pc || !pc.conexoes){
    console.warn('reconciliarPluggy: VARS.PLUGGY_CONTAS ainda nao chegou (offline ou Supabase sem esse campo nesta carga).');
    return resultado;
  }
  if(Array.isArray(pc.erros) && pc.erros.length){
    resultado.erros = pc.erros.slice();
    pc.erros.forEach(e=>console.warn('⚠ reconciliarPluggy - erro de conexao Pluggy:', e));
  }
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  pc.conexoes.forEach(conexao=>{
    (conexao.contas||[]).forEach(conta=>{
      if(conta.tipo !== 'CREDIT') return; // V1: so cartao de credito tem total agregado pra comparar no VARS hoje
      // Mercado Pago nao tem final-4 na Politica (CARTAO_MAPA so documenta Itau/Bradesco) - casa pelo nome.
      const mapa = /mercado\s*pago/i.test(conta.nome) ? {titular:'', apelido:'Mercado Pago', totalVar:'mercadoPagoFatura'} : CARTAO_PLUGGY_MAPA[conta.numero];
      if(!mapa){
        resultado.naoMapeados.push({numero:conta.numero, nome:conta.nome, saldo:conta.saldo});
        const idExt1 = gerarIdExternoPluggy('mapa', conta.numero);
        if(!pluggyJaTriado(idExt1)) inboxAdicionarItem({
          origem:'Pluggy', descricao:`Cartão final ${conta.numero} ("${conta.nome}") não mapeado na Política`,
          descricaoCompleta:`Cartão não mapeado na Política (final ${conta.numero}, "${conta.nome}") — verificar se é conexão antiga/duplicada ou cartão novo não documentado`,
          valor: conta.fatura_mes_atual ? conta.fatura_mes_atual.valor_total : conta.saldo,
          data: (conexao.atualizado_em||'').slice(0,10), categoriaSugerida:null, livroSugerido:null, confianca:null,
          idExterno: idExt1, silencioso:true
        });
        return;
      }
      if(mapa.bloqueado){ resultado.ok.push({numero:conta.numero, obs:`cartão bloqueado/sem uso (${mapa.apelido}), ignorado por decisão do usuário`}); return; }
      if(mapa.conexaoDesatualizada){
        resultado.ok.push({numero:conta.numero, obs:`conexão Pluggy desatualizada — ${mapa.apelido}, precisa reconectar no Pluggy pro cartão novo (6351), não é ajuste de código`});
        // so 1x por carga faz sentido lembrar isso - continua indo pra Inbox pra nao esquecer de reconectar
        const idExt2 = gerarIdExternoPluggy('desatualizada', conta.numero);
        if(!pluggyJaTriado(idExt2)) inboxAdicionarItem({
          origem:'Pluggy', descricao:`Conexão Pluggy desatualizada: final ${conta.numero} → 6351 (${mapa.apelido})`,
          descricaoCompleta:`Conexão Pluggy desatualizada: final ${conta.numero} foi substituído por 6351, mas a conexão ainda aponta pro cartão antigo — reconectar a conta no painel da Pluggy`,
          valor: conta.saldo, data: (conexao.atualizado_em||'').slice(0,10), categoriaSugerida:null, livroSugerido:null, confianca:null,
          idExterno: idExt2, silencioso:true
        });
        return;
      }
      if(!mapa.totalVar){ resultado.ok.push({numero:conta.numero, obs:'sem total agregado pra comparar (cartão aposentado/sem VARS correspondente)'}); return; }
      const faturaPluggy = conta.fatura_mes_atual ? conta.fatura_mes_atual.valor_total : null;
      const totalERP = VARS[mapa.totalVar];
      if(faturaPluggy == null){ resultado.ok.push({numero:conta.numero, obs:'Pluggy sem fatura_mes_atual nesta carga'}); return; }
      // NOVO 04/08/2026 (parte 77, pedido do usuario: "eu nao quero que o ciclo do mercado pago me
      // engane, resolva da forma profissional"): a checagem de vencimento abaixo (correta, evita
      // falso-positivo comparando fatura ja fechada) tinha o efeito colateral de o valor real do
      // Mercado Pago só aparecer pra quem le o console, nunca no painel - resultado.ok nunca é
      // mostrado linha a linha pro usuario (so contado, ver montarAlertasNegocio). Corrigido expondo
      // o saldo/fatura ATUAL da Pluggy (sempre, independente do vencimento) num campo proprio que o
      // painel pode mostrar direto - separa "e uma divergencia real?" (so faz sentido perto do
      // vencimento) de "qual e o saldo agora?" (deveria ser visivel o mes inteiro, sem enganar).
      if(mapa.totalVar === 'mercadoPagoFatura'){
        resultado.mercadoPagoSaldoAbertoPluggy = faturaPluggy;
        resultado.mercadoPagoVencimentoPluggy = conta.fatura_vencimento_atual || (conta.fatura_mes_atual && conta.fatura_mes_atual.vencimento) || null;
      }
      // CORRIGIDO 03/08/2026 (usuario apontou 2 falsos positivos reais): fatura_mes_atual da Pluggy pode
      // ser a ULTIMA fatura FECHADA (ja vencida/paga), nao a fatura em aberto - nesse caso comparar contra
      // o total corrente do ERP (que zera/reinicia apos o pagamento) e comparacao invalida, nao divergencia
      // real. So compara como divergencia quando o vencimento ainda esta no futuro (fatura em aberto).
      const vencStr = conta.fatura_vencimento_atual || (conta.fatura_mes_atual && conta.fatura_mes_atual.vencimento);
      const venc = vencStr ? new Date(vencStr) : null;
      if(venc && venc < hoje){
        resultado.ok.push({numero:conta.numero, obs:`fatura já vencida/paga (venc. ${vencStr.slice(0,10)}) — não comparada contra o total corrente do ERP`});
        return;
      }
      const diff = Math.round((faturaPluggy - totalERP)*100)/100;
      if(Math.abs(diff) > 0.01){
        const rotulo = (mapa.titular ? mapa.titular+' ' : '') + mapa.apelido;
        resultado.divergencias.push({cartao:`${rotulo} (${conta.numero})`, faturaPluggy, totalERP, diff});
        // vencimento entra no id: uma divergencia de um ciclo novo (fatura seguinte) deve poder
        // reaparecer mesmo que a do ciclo anterior ja tenha sido triada.
        const vencId = (conta.fatura_vencimento_atual||conexao.atualizado_em||'').slice(0,10);
        const idExt3 = gerarIdExternoPluggy('divergencia', conta.numero, vencId);
        if(!pluggyJaTriado(idExt3)) inboxAdicionarItem({
          origem:'Pluggy', descricao:`Divergência ${rotulo} (final ${conta.numero}): Pluggy R$${faturaPluggy.toFixed(2)} × ERP R$${totalERP.toFixed(2)} (diff R$${diff.toFixed(2)})`,
          descricaoCompleta:`Divergência ${rotulo} (final ${conta.numero}): fatura Pluggy R$${faturaPluggy.toFixed(2)} × ${mapa.totalVar} no ERP R$${totalERP.toFixed(2)} (diff R$${diff.toFixed(2)})`,
          valor: diff, data: (conta.fatura_vencimento_atual||'').slice(0,10), categoriaSugerida:null, livroSugerido:null, confianca:null,
          idExterno: idExt3, silencioso:true
        });
      } else {
        resultado.ok.push({numero:conta.numero, obs:'✅ fatura bate com o ERP'});
      }
    });
  });
  console.log('reconciliarPluggy:', resultado.divergencias.length, 'divergência(s),', resultado.naoMapeados.length, 'cartão(ões) não mapeado(s),', resultado.ok.length, 'ok(s).');
  renderInboxFinanceira(); // parte 54: 1 render só no final, nao mais 1 por item (ver silencioso:true acima)
  return resultado;
}

// NOVO 11/08/2026 (pedido explícito do usuário — supersede a exceção arquitetural de 08/08, ver
// docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md): promove o valor REAL da fatura
// Pluggy a fonte principal de cartaoInfiniteTotal/cartaoMBTotal/mercadoPagoFatura — só quando existe
// uma fatura EM ABERTO de verdade (valor não-nulo, não-zero, com vencimento no futuro). Nunca
// sobrescreve com fatura vencida/zerada/ausente — nesses casos o valor atual (reconciliado
// manualmente, ou o fallback do ERP já existente pro Mercado Pago) permanece intocado. Mesma regra
// "a fatura sempre vence" do documento de 08/08, só que agora COM a fatura real quando ela existe, em
// vez de depender sempre de digitação manual. Roda depois de reconciliarPluggy() (que continua
// intacta, só detecta divergência pro log/Inbox) — leitura separada do mesmo dado, nenhuma duplicação
// de lógica de mapeamento de cartão.
function promoverFaturaPluggyComoFonte(){
  const pc = VARS.PLUGGY_CONTAS;
  const promovidos = [];
  if(!pc || !pc.conexoes){ window.WALLACE_PROMOCAO_PLUGGY_RELATORIO = { promovidos }; return { promovidos }; }
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  pc.conexoes.forEach(conexao => {
    (conexao.contas||[]).forEach(conta => {
      if(conta.tipo !== 'CREDIT') return;
      const mapa = /mercado\s*pago/i.test(conta.nome) ? {totalVar:'mercadoPagoFatura'} : CARTAO_PLUGGY_MAPA[conta.numero];
      if(!mapa || !mapa.totalVar || mapa.bloqueado) return;
      const faturaPluggy = conta.fatura_mes_atual ? conta.fatura_mes_atual.valor_total : null;
      // Pluggy pode devolver 0 mesmo com fatura real em aberto (achado documentado 05/08/2026, caso
      // Mercado Pago) — 0/null tratados igual: sem dado confiável, mantém o valor atual.
      if(faturaPluggy == null || faturaPluggy === 0) return;
      const vencStr = conta.fatura_vencimento_atual || (conta.fatura_mes_atual && conta.fatura_mes_atual.vencimento);
      const venc = vencStr ? new Date(vencStr) : null;
      if(!venc || venc < hoje) return; // sem data, ou fatura já vencida/paga — não é a fatura EM ABERTO
      const valorAnterior = VARS[mapa.totalVar];
      VARS[mapa.totalVar] = faturaPluggy;
      VARS[mapa.totalVar + 'Origem'] = 'pluggy';
      promovidos.push({ totalVar: mapa.totalVar, cartao: conta.nome, numero: conta.numero, valorAnterior, valorPluggy: faturaPluggy, vencimento: vencStr });
    });
  });
  if(promovidos.length){
    REG.cartaoInfinite.total = VARS.cartaoInfiniteTotal;
    REG.cartaoMB.total = VARS.cartaoMBTotal;
    REG.mercadoPago = VARS.mercadoPagoFatura;
    if(typeof recalcularMercadoPago === 'function') recalcularMercadoPago();
    if(typeof hydrateResumoCartoes === 'function') hydrateResumoCartoes();
    if(typeof hydrateVisaMB === 'function') hydrateVisaMB();
    if(typeof hydrateMercadoPago === 'function') hydrateMercadoPago();
    if(typeof hydrateBalanco === 'function') hydrateBalanco();
    if(typeof hydrateResumoExecutivo === 'function') hydrateResumoExecutivo();
    console.log(`promoverFaturaPluggyComoFonte: ${promovidos.length} total(is) promovido(s) pra fatura real da Pluggy.`, promovidos);
  } else {
    console.log('promoverFaturaPluggyComoFonte: nenhuma fatura em aberto confiável na Pluggy nesta carga — mantendo valores atuais (reconciliação manual/fallback ERP).');
  }
  window.WALLACE_PROMOCAO_PLUGGY_RELATORIO = { promovidos };
  return { promovidos };
}

// V400 Etapa 3 (Reconciliador transação-a-transação) - reconciliarTransacoesPluggy().
// So faz sentido depois que o script externo sincronizar_pluggy.py (corrigido 03/08/2026, migrado
// de /transactions para /v2/transactions com cursor) voltar a popular conta.transacoes_recentes no
// Supabase - antes disso vinha so conta.transacoes_erro (HTTP 410), e essa funcao nao encontra nada
// pra comparar (nao e bug, e o dado ainda nao existir na carga atual).
// Mesma logica do script Python (buscar_valores_conhecidos/detectar_transacoes_suspeitas), so que em
// JS direto sobre o VARS ja carregado (nao precisa bater no Supabase de novo) - comparacao SO POR VALOR
// (nao por data/descricao), mesmo criterio do script: mais seguro deixar passar um falso-positivo
// (2 compras coincidentes do mesmo valor) do que perder uma compra real nao lancada.
// AJUSTADO 04/08/2026 (parte 55, achado ao vivo no Supabase, nao suposto): a 1a sincronizacao de uma
// conta na Pluggy sempre traz o historico completo (ate 12 meses, doc oficial: "these transactions
// are recovered... when syncing the item for the first time"), ignorando o "dias=40" do script Python -
// isso so vale pras proximas sincronizacoes (incrementais). Resultado real visto em producao: transacoes
// iam ate 28/07/2025 (mais de 1 ano), gerando 2.257 itens "suspeitos" - inviavel de revisar 1 a 1, e a
// maioria (2.292 de 2.707) e de ANTES do ciclo atual, sem nenhuma relacao com o controle corrente do
// ERP. Adicionado filtro por data aqui no JS (janelaDias, mesma janela que o script sempre pretendeu ter)
// - resolve na fonte que o app.js le, sem depender de corrigir o script Python de novo.
// NOVO 06/08/2026 (parte 114, arquitetura ResolverCaixa aprovada pelo usuario, parte 113): consome
// a infra V2 (regras_classificacao + resolver_caixa RPC) pra sugerir categoria/caixa nos itens novos
// da Inbox. Cache em memoria (1 fetch por sessao, regra muda pouco). Nunca inventa - null se nenhuma
// regra bater, mesma disciplina do classificarItemDeterministico existente (que continua rodando
// depois, sem alteracao - isto so PREENCHE categoriaSugerida quando o V1 nao tinha achado nada).
let __regrasClassificacaoV2Cache = null;
async function classificarViaV2(descricaoBruta, origem){
  // CORRIGIDO 09/08/2026 (mesma varredura de segurança): passa a enviar o token do login quando
  // existe (mesmo padrão de WallaceFinanceService._headers() em app.js) — plumbing pra quando a
  // leitura pública for restringida (passo 2, ainda não feito, ver nota em app.js:_headers()).
  const __tokenV2 = (typeof obterTokenAuthSupabase === 'function' ? obterTokenAuthSupabase() : null) || 'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg';
  try {
    if(!__regrasClassificacaoV2Cache){
      const r = await fetch('https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/regras_classificacao?select=prioridade,estabelecimento_contem,categoria_id,resultado&ativo=eq.true&resultado=eq.classificar&order=prioridade.asc', {
        headers: { apikey:'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization:'Bearer '+__tokenV2 }
      });
      if(!r.ok) return null;
      __regrasClassificacaoV2Cache = await r.json();
    }
    const texto = (descricaoBruta||'').toUpperCase();
    const regra = __regrasClassificacaoV2Cache.find(rg => rg.estabelecimento_contem && texto.includes(rg.estabelecimento_contem.toUpperCase()));
    if(!regra) return null;
    const rc = await fetch(`https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/rpc/resolver_caixa`, {
      method:'POST',
      headers: { 'Content-Type':'application/json', apikey:'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization:'Bearer '+__tokenV2 },
      body: JSON.stringify({ p_categoria_id: regra.categoria_id, p_usuario_id: null, p_origem: origem||null })
    });
    const caixaId = rc.ok ? await rc.json() : null;
    let caixaNome = null;
    if(caixaId){
      const rcx = await fetch(`https://bakdgacmwlopvrrppwdm.supabase.co/rest/v1/caixas?select=nome&id=eq.${caixaId}`, {
        headers: { apikey:'sb_publishable_yxosvu7hHWJvSBfyxi0fRA_X7MDiwfg', Authorization:'Bearer '+__tokenV2 }
      });
      const j = rcx.ok ? await rcx.json() : [];
      caixaNome = j[0] ? j[0].nome : null;
    }
    return { caixaNome }; // categoria em si nao e exibida separada aqui - so a sugestao de destino final (o que a Inbox precisa pra agilizar aprovacao)
  } catch(e){ return null; } // falha de rede/offline - item continua pendente normal, so sem sugestao V2
}
async function reconciliarTransacoesPluggy(valorMinimo, janelaDias){
  valorMinimo = typeof valorMinimo === 'number' ? valorMinimo : 5.0;
  janelaDias = typeof janelaDias === 'number' ? janelaDias : 45;
  let dataCorte = new Date(Date.now() - janelaDias*86400000);
  const pc = VARS.PLUGGY_CONTAS;
  const resultado = {suspeitas:[], semDados:true, ignoradasPorData:0};
  if(!pc || !pc.conexoes) return resultado;

  // CORRIGIDO 09/08/2026 (mesmo achado/causa raiz do sincronizarMercadoPagoParaInbox em
  // classificacao-inbox.js: INBX000001 R$79,79 ja existia como TX000226 em Bens Duraveis, mas essa
  // lista hardcoded de "7 livros conhecidos" nunca cobria Bens Duraveis nem nenhuma caixa fora
  // dela). Pedido explicito do usuario: "se existe dado hardcoded, mude isso, e proibido" - lista
  // fixa removida. Fonte unica agora e a V2 real (todo valor confirmado, todas as caixas, sem
  // precisar manter lista na mao) - ja cobre historico completo tambem, sem precisar somar
  // HISTORICO_ERP_TODOS_CICLOS a parte. Falha de rede so desativa o aviso de duplicidade nesta
  // rodada (nunca esconde a transacao da Inbox) - log alto pra nao passar despercebido.
  // CORRIGIDO 12/08/2026 (achado do usuário via diagnóstico de lag: os 3 fetches abaixo não têm
  // dependência entre si, mas rodavam em série (2 num Promise.all à parte, o 3º — ciclo atual —
  // atrás de tudo isso). Promise.all único deixa os 3 dispararem juntos.
  const valoresConhecidos = new Set();
  const [resValoresConhecidos, resValoresCombinados, resCicloAtualInicio] = await Promise.all([
    WallaceFinanceService.getValoresConhecidosV2().catch(err => {
      console.error('reconciliarTransacoesPluggy: falha ao buscar valores confirmados da V2 — checagem de duplicidade DESATIVADA nesta rodada.', err);
      return null;
    }),
    WallaceFinanceService.getValoresCombinadosV2().catch(err => {
      console.error('reconciliarTransacoesPluggy: falha ao buscar valores combinados da V2 — checagem de compra desmembrada DESATIVADA nesta rodada.', err);
      return null;
    }),
    // NOVO 12/08/2026 (pedido explícito do usuário: "não me interessa compra de ciclos passados,
    // compra já informadas manualmente" — o propósito único desta Inbox é apontar compra NÃO
    // lançada DO CICLO ATUAL). janelaDias (45 dias corridos) é mais largo que 1 ciclo financeiro
    // (~30 dias) e deixava passar item de ciclo já fechado. Usa o ciclo_inicio_em real da Caixa
    // Variável como piso quando é mais restritivo que a janela — nunca o contrário.
    WallaceFinanceService.getCicloAtualInicio().catch(err => {
      console.error('reconciliarTransacoesPluggy: falha ao buscar ciclo atual — mantendo janela de dias como piso.', err);
      return null;
    })
  ]);
  if(resCicloAtualInicio){
    const dataCicloAtual = new Date(resCicloAtualInicio + 'T00:00:00');
    if(dataCicloAtual > dataCorte) dataCorte = dataCicloAtual;
  }
  if(resValoresConhecidos) resValoresConhecidos.forEach(v => valoresConhecidos.add(v));
  if(resValoresCombinados) resValoresCombinados.forEach(v => valoresConhecidos.add(v));
  // NOVO 10/08/2026 (item aprovado: filtro de assinatura/recorrência conhecida na Inbox — antes
  // dedup só comparava valor exato, uma cobrança recorrente da Pluggy com valor levemente diferente
  // do mês anterior (reajuste/câmbio) reaparecia como "suspeita" todo ciclo). Mesma função
  // compartilhada com sincronizarMercadoPagoParaInbox (classificacao-inbox.js), fonte real (V2), sem
  // lista hardcoded de nomes de serviço.
  const palavrasChaveAssinaturas = typeof obterPalavrasChaveAssinaturasConhecidas === 'function'
    ? await obterPalavrasChaveAssinaturasConhecidas('reconciliarTransacoesPluggy')
    : new Set();

  // NOVO 04/08/2026 (parte 60, pedido do usuario apos ver 106 pendentes na Inbox): padroes de
  // descricao que NUNCA sao compra/gasto real do dia a dia - sao movimentacao interna entre as
  // proprias contas do usuario (PIX pra si mesmo, "caixinhas" internas do Mercado Pago), operacao
  // de investimento (aplicacao/resgate/liquidacao de bolsa), ou linha de RESUMO da fatura do banco
  // (nao uma compra individual - obviamente nunca vai bater com um lancamento especifico do ERP,
  // que rastreia item a item). Conferido ao vivo no Supabase: 118 das ~221 transacoes que a logica
  // marcava como "suspeita" batiam nesses padroes - nao eram gasto esquecido, eram ruido estrutural
  // do proprio extrato bancario. So exclui pelo padrao de DESCRICAO, nunca por valor/conta - continua
  // seguro (nao esconde nada que pareça uma compra de verdade).
  // AMPLIADO 04/08/2026 (parte 61, usuario listou 20 itens reais da Inbox, INBX000001-020): mais
  // padroes confirmados como quitacao/rendimento estrutural, nunca compra: pagamento de fatura de
  // cartao (Infinite/Mastercard Black/Mercado Pago) - ja rastreado por AGREGADO proprio
  // (VARS.cartaoInfiniteTotal/cartaoMBTotal/mercadoPagoFatura/faturaWartsila), entao a quitacao nunca
  // deveria bater com uma compra individual, e nao e "gasto sem lancar", e o lancamento agregado ja
  // existe noutro lugar; juros/encargos por atraso (encargo do banco, nao compra); Pix recebido de
  // programa de pontos (Livelo - entrada, nao gasto); movimentacao interna da conta de investimentos
  // (Necton - resgate/aplicacao/rendimento, mesma familia de LIQ BOLSA acima).
  // NAO incluido de proposito (usuario listou junto, mas SAO diferentes): conta Vivo/Brisanet (NAO
  // aparecem em VARS.CRONOGRAMA_BOLETOS_FIXOS, os 9 boletos recorrentes ja rastreados - parecem gasto
  // recorrente real ainda sem registro) e lavanderia DryUSA (compra avulsa comum, sem padrao
  // estrutural nenhum) - excluir esses do filtro seria esconder um gasto real, contra a Politica P1.
  const PADROES_RUIDO_TRANSACAO_DEFAULT_STR = [
    'dinheiro (retirado|reservado)',
    'wallace patrick gald',
    'aplica[cç][aã]o cofrinhos|resgate aplica[cç][aã]o',
    'liq bolsa|conta remunerada',
    'pagamento recebido|pagto\\.? por deb em c\\/c|pagto\\.? antec',
    'gastos cartao de credito',
    'ted[- ]?transf.*wartsila|ted recebida wartsila',
    'encargos limite de cred|iof s\\/',
    'pagamento.*fatura.*(infinite|mastercard black|mercado pago)|fatura.*(infinite|mastercard black|mercado pago).*pagamento',
    'juros.*atraso|encargos rotativos|multa.*atraso',
    'livelo',
    'encargos.{0,4}rotativo|iof.*rotativo',
    'pagamento cart[aã]o de cr[eé]dito|pagamento de fatura|fatura paga',
    'cartao corporativo',
  ];
  // MIGRADO 04/08/2026 (parte 84, ERP->Supabase): VARS.PADROES_RUIDO_TRANSACAO (array de strings,
  // regex nao serializa em JSON) sobrescreve a lista acima quando existir no Supabase - mesmo motivo
  // do CARTAO_PLUGGY_MAPA/piso acima. Corrigir/adicionar um padrao novo vira 1 UPDATE no banco.
  const PADROES_RUIDO_TRANSACAO = (VARS.PADROES_RUIDO_TRANSACAO || PADROES_RUIDO_TRANSACAO_DEFAULT_STR)
    .map(s => new RegExp(s, 'i'));
  function pareceRuidoInterno(descricao){
    const d = descricao || '';
    return PADROES_RUIDO_TRANSACAO.some(re=>re.test(d));
  }

  for(const conexao of pc.conexoes){
    for(const conta of (conexao.contas||[])){
      const transacoes = conta.transacoes_recentes;
      if(!Array.isArray(transacoes) || !transacoes.length) continue; // ainda sem dado (410 antigo ou conta sem movimento)
      resultado.semDados = false;
      for(const t of transacoes){
        if(typeof t.valor !== 'number') continue;
        // CORRIGIDO 09/08/2026 (investigacao real: conta "2250"/Mastercard Black consolidada tinha
        // 81 transacoes 100% em PENDING, algumas ha 23 dias - rastreado ponta a ponta ate a API da
        // Pluggy, sem transformacao em nenhuma camada nossa - Pluggy/Itau nunca promove essa conta
        // pra POSTED). Antes, `t.status !== 'POSTED'` excluia TODAS elas da Inbox, sempre, pra
        // sempre - a Inbox ficava cega pro cartao principal. Regra nova: aceita POSTED sempre, ou
        // PENDING com PENDING_ELEGIVEL_DIAS+ dias parado (folga generosa acima do ciclo normal de
        // assentamento, que no Visa Infinite - mesma familia de produto - e de poucos dias). Passa
        // pelos MESMOS filtros de sempre depois (ruido/valor minimo/valoresConhecidos/
        // pluggyJaTriado) - nenhuma protecao removida.
        const PENDING_ELEGIVEL_DIAS = 10;
        if(t.status !== 'POSTED'){
          if(t.status !== 'PENDING') continue;
          const diasParado = t.data ? (Date.now() - new Date(t.data).getTime()) / 86400000 : 0;
          if(diasParado < PENDING_ELEGIVEL_DIAS) continue;
        }
        // parte 55: fora da janela recente - historico do 1o sync completo da Pluggy, nao entra na
        // Inbox (nao e "perder dado real" - e dado de fora do periodo que o ERP controla granularmente).
        if(t.data && new Date(t.data) < dataCorte){ resultado.ignoradasPorData++; continue; }
        const valorAbs = Math.round(Math.abs(t.valor)*100)/100;
        if(valorAbs < valorMinimo) continue;
        if(pareceRuidoInterno(t.descricao)){ resultado.ignoradasPorRuido = (resultado.ignoradasPorRuido||0)+1; continue; }
        // NOVO 10/08/2026: mesmo tratamento do valor exato acima — se bate um estabelecimento já
        // confirmado como assinatura (por palavra-chave, não valor), também não entra como
        // "suspeita" nova. Contado à parte no relatório pra ficar rastreável (não é "sumiu sem
        // explicação", é "reconhecida como recorrência já classificada").
        if(descricaoBateAssinaturaConhecida(t.descricao, palavrasChaveAssinaturas)){
          resultado.ignoradasPorAssinaturaConhecida = (resultado.ignoradasPorAssinaturaConhecida||0)+1;
          continue;
        }
        if(!valoresConhecidos.has(valorAbs)){
          // CORRIGIDO 04/08/2026 (parte 54): faltava idExterno + checagem pluggyJaTriado aqui - mesmo
          // gap que a parte 42 diagnosticou e a parte 49 corrigiu pros itens de CARTAO da Pluggy, só
          // que este produtor (transação individual) tinha ficado de fora. Sem isso, TODA transação
          // suspeita seria recriada do zero em toda carga de página, pra sempre, mesmo já aprovada/
          // rejeitada - e agora com volume real (milhares de transações) isso também alimentava a
          // trava O(n²) corrigida acima. idExterno usa o id da própria transação da Pluggy (t.id),
          // já estável e único por natureza - não precisa sintetizar como no nível de cartão.
          const idExtTx = t.id ? `pluggy-tx-${t.id}` : null;
          if(idExtTx && pluggyJaTriado(idExtTx)) continue;
          resultado.suspeitas.push({banco:conexao.banco, conta:conta.nome, data:t.data, descricao:t.descricao, valor:t.valor});
          // NOVO 06/08/2026 (parte 114): tenta sugestao V2 (regras_classificacao + resolver_caixa)
          // antes de criar o item - best-effort, nunca bloqueia (catch interno ja trata falha de rede).
          const sugestaoV2 = await classificarViaV2(t.descricao, 'pluggy');
          inboxAdicionarItem({
            origem:'Pluggy-Transação',
            descricao:`${conexao.banco} (${conta.nome}): "${t.descricao}" — não encontrada em nenhum livro do ERP (comparação só por valor)`,
            valor: t.valor, data: (t.data||'').slice(0,10),
            categoriaSugerida: sugestaoV2 ? `V2 sugere: ${sugestaoV2.caixaNome}` : null,
            livroSugerido:null, confianca: sugestaoV2 ? 0.6 : null,
            idExterno: idExtTx, silencioso:true
          });
        }
      }
    }
  }
  console.log('reconciliarTransacoesPluggy:', resultado.semDados ? 'sem transacoes_recentes ainda (aguardando script externo corrigido rodar)' : `${resultado.suspeitas.length} transação(ões) suspeita(s), ${resultado.ignoradasPorData} ignorada(s) por serem fora da janela recente, ${resultado.ignoradasPorRuido||0} ignorada(s) por serem movimentação interna/resumo de fatura`);
  renderInboxFinanceira(); // parte 54: 1 render só no final, nao mais 1 por transação (ver silencioso:true acima)
  return resultado;
}
