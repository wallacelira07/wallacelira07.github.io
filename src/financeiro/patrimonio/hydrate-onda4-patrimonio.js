// MÓDULO: Onda 4 — "Supabase como fonte única de verdade" (08/08/2026), domínio Patrimônio.
// Diferente das Ondas 1-3 (overlay condicional por divergência), aqui a V2 é a FONTE PRIMÁRIA
// assim que os dados existem: os valores em `patrimonio`/`financiamentos` foram migrados
// diretamente dos mesmos literais que estavam em VARS (zero divergência por construção, não por
// coincidência). Fallback pra V1 só acontece em erro técnico (fetch falhou/tabela vazia), nunca
// por causa de diferença de valor — não há mais "aceitarDivergenciaConhecida" aqui.
//
// Exceção deliberada: `caixaLance` continua vindo do V1 (REG.patrimonioDetalhe.caixaLance) — é a
// pendência já registrada (divergência de R$4,37, causa não confirmada, ver
// hydrate-onda3-caixalance.js) e o usuário pediu explicitamente pra não reabrir essa discussão.
// Assim que a causa for confirmada e o módulo da Onda 3 passar a exibir V2, basta trocar a linha
// marcada abaixo pra ler o mesmo valor.
//
// Rollback: comentar a chamada aplicarOnda4Patrimonio() em app.js — os ids voltam a mostrar só o
// que hydratePatrimonio() (V1) já escreveu antes.
//
// NOVO 08/08/2026: Patrimônio (exceto Caixa Lance, exceção deliberada acima) é fonte V2 EXCLUSIVA
// (diretriz "V2 é a fonte real") — em caso de falha, os ids mostram aviso explícito em vez de
// deixar silenciosamente os números V1 (síncronos) na tela. `patLance` fica de fora desta lista de
// propósito — continua sempre V1, não é afetado por sucesso nem falha deste módulo.
// ACHADO (08/08/2026, mesma classe do caso Boletos/4-caixas-Reservas): a seção "Balanço
// Patrimonial" (hydrate-balanco.js) tem 5 ids que duplicam valores já buscados aqui
// (reserva/btg/nectonCC/financiamentoCasa/consorcioAuto), só que nunca foram ligados —
// bfinReserva/bfinBTG/bfinNectonCC/bpFinanciamentoCasa/bpConsorcioAuto. Os TOTAIS compostos
// dessa mesma seção (balFinanceiroTotal, balAtivosTotal, balPatrimonioLiquido/TotalGeral) ficam
// de fora desta lista — misturam componentes sem V2 ainda (físico, PGBL, FGTS, consórcio casa
// pelo valor pago), não são um "mesmo valor, id duplicado" simples como os 5 abaixo.
// CORRIGIDO 13/08/2026 (achado de auditoria: comentário desatualizado dizia que balAtivosTotal/
// balPatrimonioLiquido ficavam "de fora de propósito" da promoção V2 — na verdade SÃO promovidos,
// só que por outro pipeline (promoverCampoV2SeConfiavel em app.js), não por este módulo da Onda 4).
const ONDA4_PATRIMONIO_IDS = ['patTotal','patReserva','patBtg','patEscola','patAcumulado','patFalta','patPctBadge','ppFinanciamentoCasa','ppFinanciamentoDetalhe','ppConsorcioAuto','ppConsorcioAutoPct','ppConsorcioAutoParcela','bfinReserva','bfinBTG','bfinNectonCC','bpFinanciamentoCasa','bpConsorcioAuto'];

async function aplicarOnda4Patrimonio(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };
  let p;
  try {
    p = await WallaceFinanceService.getPatrimonioV2();
  } catch(err){
    console.error('Onda4Patrimonio: falha ao buscar vw_patrimonio_v2 — sem fallback V1 (domínio é V2-exclusivo, exceto Caixa Lance).', err);
    marcarIndisponivelV2(ONDA4_PATRIMONIO_IDS, 'falha ao buscar vw_patrimonio_v2');
    window.WALLACE_ONDA4_PATRIMONIO_RELATORIO = { status: 'erro_v2', erro: String(err) };
    return;
  }
  if(!p){
    console.warn('Onda4Patrimonio: vw_patrimonio_v2 retornou vazio.');
    marcarIndisponivelV2(ONDA4_PATRIMONIO_IDS, 'vw_patrimonio_v2 vazia');
    window.WALLACE_ONDA4_PATRIMONIO_RELATORIO = { status: 'sem_dado_v2' };
    return;
  }

  const num = v => v === null || v === undefined ? null : Number(v);
  const reserva = num(p.reserva), btg = num(p.btg_necton), nectonCC = num(p.necton_conta_corrente);
  const caixaLance = REG.patrimonioDetalhe.caixaLance; // EXCEÇÃO DELIBERADA — ver comentário no topo do arquivo
  const v1Total = Math.round(REG.patrimonio.total * 100) / 100; // capturado ANTES de sobrescrever REG.patrimonio.total abaixo

  const total = Math.round((reserva + btg + caixaLance + nectonCC) * 100) / 100;
  const metaMilhao = REG.patrimonio.metaMilhao; // 1.000.000, constante — mesmo valor do V1, não é dado a migrar
  const metaMilhaoPct = Math.round((total / metaMilhao * 100) * 100) / 100;
  // ACHADO 08/08/2026 (mesma classe do caso Boletos/Reservas/LREI): REG.patrimonio.total/metaMilhaoPct
  // nunca eram resincronizados aqui — hydrateResumoExecutivo() (kpiPatrimonio/r21Patrimonio/
  // r21MetaMilhaoPct), chamada ANTES desta função no boot síncrono, ficava lendo o total V1 mesmo
  // depois do card principal (patTotal) já mostrar V2.
  REG.patrimonio.total = total;
  REG.patrimonio.metaMilhaoPct = metaMilhaoPct;
  // CORRIGIDO 10/08/2026 (achado do usuário: "gráficos iguais devem refletir exatamente a mesma
  // fonte"): REG.patrimonioDetalhe nunca era atualizado aqui — os textos abaixo (patReserva/patBtg/
  // patEscola) já mostravam V2, mas o gráfico de rosca cPatrim/g_cPatrim (Object.values(REG.
  // patrimonioDetalhe), lido 1x na criação) continuava com a composição V1 do boot. Mesma classe de
  // bug do caso Necessidade Bruta/Líquida (provMP/déficit de caixas), corrigida na mesma sessão.
  REG.patrimonioDetalhe = { reserva, btg, caixaLance, nectonContaCorrente: nectonCC };
  // CORRIGIDO 10/08/2026 (achado do usuário: "eu retirei o juros lá da caixa dos 100k... esse é o
  // plano, manter esse valor sempre lá" — mas a aba Cenários mostrava R$100.644,15, o valor V1
  // antigo, mesmo depois do Balanço já mostrar V2 certo): REG.reserva.atual (só consumido por
  // hydrateCenarios(), aba Cenários — Reserva de Emergência normal×extremo) nunca era atualizado
  // aqui, mesma classe do caso do gráfico de rosca (REG.patrimonioDetalhe) logo acima. Reentrante e
  // seguro de chamar de novo (hydrateCenarios só escreve textContent, não cria gráfico).
  REG.reserva.atual = reserva;
  if(typeof hydrateCenarios === 'function') hydrateCenarios();

  t('patTotal', fmt(total));
  t('patReserva', fmt(reserva));
  t('patBtg', fmt(btg));
  t('patEscola', fmt(nectonCC));
  t('patAcumulado', fmt(total));
  t('patFalta', fmt(metaMilhao - total));
  // Duplicatas na seção "Balanço Patrimonial" (mesmo achado documentado acima, no topo do arquivo)
  t('bfinReserva', fmt(reserva));
  t('bfinBTG', fmt(btg));
  t('bfinNectonCC', fmt(nectonCC));
  t('patPctBadge', metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=$('patPctBar'); if(el) el.style.width = metaMilhaoPct+'%'; }

  // NOVO 13/08/2026 (pedido do usuário: saldo real da Reserva de Emergência via Pluggy - estratégia
  // é sempre manter R$100.000,00 lá e sacar o rendimento acumulado do mês pra Caixa Lance). Não
  // altera 'reserva'/patReserva/bfinReserva acima (o valor âncora R$100k que entra no patrimônio
  // total) - só um informativo a mais, lido de pluggy_investimentos (CDBs Itaú).
  {
    const elPluggy = $('bfinReservaPluggy');
    if(elPluggy){
      try {
        const r = await WallaceFinanceService.getReservaEmergenciaPluggy();
        if(!r){
          elPluggy.textContent = 'Saldo real via Pluggy indisponível (nenhuma posição encontrada ainda).';
        } else {
          const rendimento = Math.round((r.total - reserva)*100)/100;
          elPluggy.innerHTML = `Saldo real (Pluggy, ${r.qtdPosicoes} posição/ões CDB Itaú): <strong>${fmt(r.total)}</strong> — `
            + (rendimento > 0
              ? `rendimento acumulado este mês a sacar pra Caixa Lance: <strong style="color:var(--green)">${fmt(rendimento)}</strong>`
              : 'sem rendimento acima do piso de R$100.000,00 ainda.');
        }
      } catch(err){
        console.error('Onda4Patrimonio: falha ao buscar reserva via Pluggy.', err);
        elPluggy.textContent = '⚠ Indisponível (Pluggy) — não foi possível carregar o saldo real.';
      }
    }
  }

  // NOVO 08/08/2026 (fecha consumidor de wallace_dados: consorcioCasaProximaAssembleia): mesmo dado
  // ja vem em `p` (vw_patrimonio_v2.consorcio_casa_proxima_assembleia), so nunca tinha sido ligado -
  // hydrateMetas() (V1) roda ANTES desta funcao no hydrate(), entao sobrescrever so VARS aqui seria
  // tarde demais pro DOM que ela ja escreveu; atualiza o elemento #consorcioAssembleia direto,
  // replicando a mesma logica de alerta "ja passou" que hydrateMetas() ja usava.
  if(p.consorcio_casa_proxima_assembleia){
    const [ano,mes,dia] = p.consorcio_casa_proxima_assembleia.split('-');
    const dataBR = `${dia}/${mes}/${ano}`;
    VARS.consorcioCasaProximaAssembleia = dataBR;
    const elAssembleia = $('consorcioAssembleia');
    if(elAssembleia){
      const dataAssembleia = new Date(Number(ano), Number(mes)-1, Number(dia));
      elAssembleia.innerHTML = dataAssembleia < new Date()
        ? dataBR + ' <span style="color:var(--red)">⚠️ já passou — data desatualizada, confirmar com a administradora</span>'
        : dataBR;
    }
  }

  const finCasa = num(p.passivo_financiamento_casa), prestacao = num(p.prestacao_financiamento_casa), meses = p.meses_restantes_financiamento_casa;
  const consorcioAuto = num(p.passivo_consorcio_auto), consorcioAutoPct = num(p.consorcio_auto_pago_pct), parcelaAuto = num(p.parcela_consorcio_auto);
  t('ppFinanciamentoCasa', fmt(finCasa));
  t('ppFinanciamentoDetalhe', 'Prestação '+fmt(prestacao)+' · '+meses+' meses restantes');
  t('ppConsorcioAuto', fmt(consorcioAuto));
  { const el=$('ppConsorcioAutoBar'); if(el) el.style.width = consorcioAutoPct+'%'; }
  t('ppConsorcioAutoPct', consorcioAutoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'% pago');
  t('ppConsorcioAutoParcela', 'Parcela '+fmt(parcelaAuto));
  // Duplicatas na seção "Balanço Patrimonial" (mesmo achado documentado acima, no topo do arquivo)
  t('bpFinanciamentoCasa', fmt(finCasa));
  t('bpConsorcioAuto', fmt(consorcioAuto));

  // NOVO 15/08/2026 (achado de auditoria + pedido do usuário "corrija os dois" — mesma classe de bug
  // do LRW/LRV corrigido nesta sessão): REG.balanco.passivos.financiamentoCasa/consorcioAutoContemplado
  // e os totais derivados (bp.total/ativosTotal/patrimonioLiquido/patrimonioTotalGeral) nunca eram
  // resincronizados aqui — as linhas individuais acima (bpFinanciamentoCasa/bpConsorcioAuto) já
  // mostravam V2 ao vivo, mas os TOTAIS compostos do Balanço continuavam presos no literal
  // VARS.passivoFinanciamentoCasa/passivoConsorcioAuto capturado só uma vez no boot síncrono
  // (reg-balanco.js). Atualiza REG e re-renderiza hydrateBalanco() inteiro (mesmo padrão já usado
  // acima pra hydrateResumoExecutivo()/hydrateCenarios() — reaproveita a função de render real em vez
  // de duplicar cada t(id, valor) individualmente).
  // AMPLIADO 15/08/2026 (2º achado de auditoria, mesma classe): vw_patrimonio_v2 já expõe
  // casa/apartamento/jazigo/solar/carro/fisico_total/consorcio_casa_pago/pgbl/fgts — nenhuma dessas
  // 9 colunas era lida aqui, então REG.balanco.fisico.*/pgbl/fgts/financeiro.consorcioCasaPago (e o
  // total balFinanceiroTotal, que não tinha NENHUMA rede de sincronização) continuavam presos nos
  // literais VARS.pat*/consorcioCasaParcela*Pagas do boot síncrono. Batiam por coincidência até agora
  // — mesmo estado em que passivoFinanciamentoCasa estava antes desta sessão.
  {
    const r2 = x => Math.round(x*100)/100;
    const bf = REG.balanco.fisico;
    bf.casa = num(p.casa); bf.apartamento = num(p.apartamento); bf.jazigo = num(p.jazigo);
    bf.solar = num(p.solar); bf.carro = num(p.carro);
    bf.total = num(p.fisico_total) != null ? num(p.fisico_total) : r2(bf.casa+bf.apartamento+bf.jazigo+bf.solar+bf.carro);
    REG.balanco.pgbl = num(p.pgbl);
    REG.balanco.fgts = num(p.fgts);
    const bfin = REG.balanco.financeiro;
    bfin.consorcioCasaPago = num(p.consorcio_casa_pago);
    bfin.total = r2(bfin.reserva + bfin.btg + bfin.nectonContaCorrente + bfin.consorcioCasaPago);
    const bp = REG.balanco.passivos;
    bp.financiamentoCasa = finCasa;
    bp.consorcioAutoContemplado = consorcioAuto;
    bp.total = r2(bp.financiamentoCasa + bp.consorcioAutoContemplado);
    REG.balanco.ativosTotal = r2(bf.total + bfin.total);
    REG.balanco.patrimonioLiquido = r2(REG.balanco.ativosTotal - bp.total);
    REG.balanco.patrimonioTotalGeral = r2(REG.balanco.ativosTotal + REG.balanco.pgbl + REG.balanco.fgts - bp.total);
    if(typeof hydrateBalanco === 'function') hydrateBalanco();
  }

  // Resincroniza kpiPatrimonio/kpiPatrimonioPct/r21Patrimonio/r21MetaMilhaoPct (hydrateResumoExecutivo,
  // chamada antes desta função no boot) agora que REG.patrimonio.total/metaMilhaoPct foram atualizados acima.
  hydrateResumoExecutivo();
  // CORRIGIDO 10/08/2026: re-renderiza os gráficos de rosca (Painel: cPatrim; aba Gráficos: g_cPatrim)
  // agora que REG.patrimonioDetalhe foi atualizado acima — antes ficavam presos na composição V1.
  if(typeof atualizarGraficoPatrimonio === 'function') atualizarGraficoPatrimonio();
  // CORRIGIDO 10/08/2026: atualizarGraficoPatrimonio() mora no módulo lazy (graficos-cenarios-lazy.js)
  // e some se a aba Gráficos/Cenários nunca foi aberta — atualizarGraficoPainelPatrimonio() (sempre
  // carregada) cobre o gráfico do Painel principal nesse caso.
  if(typeof atualizarGraficoPainelPatrimonio === 'function') atualizarGraficoPainelPatrimonio();
  // NOVO 15/08/2026 (achado de auditoria: race condition real) — coverPatrimonioTotal/coverPatrimonio/
  // coverMetaPct (KPIs da Home) são escritos por hydrateResumoP2P(), chamada ANTES desta função no
  // boot (Onda 5 roda em paralelo com esta Onda 4, sem await entre elas). Se a Onda 5 (P2P) responder
  // antes da Onda 4 (Patrimônio), a Home fica presa nos valores V1 pré-promoção enquanto o Painel já
  // mostra V2 — mesmo padrão já resolvido em hydrate-onda3-livro-razao.js/hydrate-deficit-caixas-sem-
  // lrei.js/hydrate-comprometido-caixa-variavel-v2.js, só que faltava aqui.
  if(typeof hydrateResumoP2P === 'function') hydrateResumoP2P();

  // CORRIGIDO 13/08/2026 (pedido explícito do usuário): removida a comparação/aviso contra
  // hydratePatrimonio() (V1) — a migração V1→V2 está formalmente encerrada, V2 é a fonte de
  // verdade sem condição. v1Total mantido só de referência no relatório de diagnóstico abaixo.
  console.log(`Onda4Patrimonio: V2 é a fonte exibida (${fmt(total)}).`);

  window.WALLACE_ONDA4_PATRIMONIO_RELATORIO = { v1: v1Total, v2: total, caixaLanceFonte: 'V1 (exceção deliberada, ver comentário no topo do arquivo)', exibindo: 'V2' };
  console.log('Onda4Patrimonio: relatório completo em window.WALLACE_ONDA4_PATRIMONIO_RELATORIO', window.WALLACE_ONDA4_PATRIMONIO_RELATORIO);
}
