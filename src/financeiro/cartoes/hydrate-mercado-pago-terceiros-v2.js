// MÓDULO: reembolsável de terceiros (Caixa Mercado Pago) — achado real 19/08/2026.
//
// A compra reembolsável de terceiro (seção 23 do manual, implementada 18/08/2026 — ex.: freezer/
// churrasqueira da mãe, TX000343/TX000344) é uma 3ª perna de gasto no cartão Mercado Pago, distinta
// das 2 pernas que a "Fatura atual (aberta)" já somava (Parcelas próprias + Transporte corporativo
// Wärtsilä, ver fallback em app.js ~linha 1932). Ela nunca foi somada ali nem tinha linha própria no
// card — descoberto pelo usuário ao perguntar "por que não aparece aqui o valor de terceiro?".
//
// Este módulo só LÊ (SELECT). Não filtra por ciclo_inicio_em (a Caixa Mercado Pago tem esse campo
// NULL no banco hoje — confirmado por SQL, filtrar por ele quebraria a busca) — em vez disso soma
// TODA saída confirmada de categoria 'Reembolsável - Terceiros' nessa caixa e SUBTRAI qualquer
// entrada já recebida da mesma categoria (regra 23 do manual: reembolso nunca é lançado antecipado,
// só quando a pessoa paga de volta — então "saída - entrada" é o pendente real, nunca fica negativo
// por engano se o reembolso já tiver sido pago). Preenche a linha nova (#mpReembolsavelTerceiros) e
// soma no total exibido SÓ quando a fatura vier do fallback do ERP
// (VARS.mercadoPagoFaturaOrigem === 'fallback_erp_pluggy_zerada') — a fatura real da Pluggy já inclui
// essa compra automaticamente (é uma transação real no cartão), somar de novo duplicaria.
async function aplicarMercadoPagoTerceirosV2(){
  const linha = $('mpReembolsavelTerceirosLinha');
  const valorEl = $('mpReembolsavelTerceiros');
  if(!linha || !valorEl) return; // HTML antigo em cache, sem quebrar o resto do boot
  try {
    const caixaResp = await fetch(`${WallaceFinanceService._url}/rest/v1/caixas?select=id&nome=eq.Caixa%20Mercado%20Pago`, {
      headers: WallaceFinanceService._headers()
    });
    if(!caixaResp.ok) throw new Error(`erro ${caixaResp.status} ao buscar Caixa Mercado Pago`);
    const caixas = await caixaResp.json();
    const caixa = caixas[0];
    if(!caixa) return;

    const txResp = await fetch(`${WallaceFinanceService._url}/rest/v1/transacoes?select=valor,tipo,categorias(nome)&caixa_id=eq.${caixa.id}&status=eq.confirmado`, {
      headers: WallaceFinanceService._headers()
    });
    if(!txResp.ok) throw new Error(`erro ${txResp.status} ao buscar transações da Caixa Mercado Pago`);
    const transacoes = await txResp.json();
    const doCategoria = transacoes.filter(t => t.categorias && t.categorias.nome === 'Reembolsável - Terceiros');
    const saidas = doCategoria.filter(t => t.tipo === 'saida').reduce((s,t) => s + Number(t.valor||0), 0);
    const entradas = doCategoria.filter(t => t.tipo === 'entrada').reduce((s,t) => s + Number(t.valor||0), 0);
    const total = Math.max(0, Math.round((saidas - entradas) * 100) / 100);

    if(total <= 0){ linha.style.display = 'none'; return; }

    linha.style.display = 'flex';
    valorEl.textContent = fmt(total);

    // Só soma no total exibido se ele veio do fallback do ERP (a fatura real da Pluggy já inclui a
    // compra automaticamente, somar de novo duplicaria).
    if(VARS.mercadoPagoFaturaOrigem === 'fallback_erp_pluggy_zerada'){
      VARS.mercadoPagoFatura = Math.round((VARS.mercadoPagoFatura + total) * 100) / 100;
      if(typeof REG !== 'undefined' && REG) REG.mercadoPago = VARS.mercadoPagoFatura;
      const mpFaturaEl = $('mpFatura');
      if(mpFaturaEl){
        mpFaturaEl.innerHTML = fmt(VARS.mercadoPagoFatura) +
          ' <span style="font-size:0.62rem;color:var(--text-dim)" title="Pluggy devolveu R$0,00 pra fatura deste mês; valor calculado a partir do ERP (Parcelas próprias + Transporte corporativo + Reembolsável de terceiros)">⚠ calculado (Pluggy zerada)</span>';
      }
    }
  } catch(err){
    linha.style.display = 'none';
    console.error('MercadoPagoTerceirosV2: falha ao buscar reembolsável de terceiros:', err);
  }
}
