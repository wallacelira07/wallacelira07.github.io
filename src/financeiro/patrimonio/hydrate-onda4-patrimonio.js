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
const ONDA4_PATRIMONIO_IDS = ['patTotal','patReserva','patBtg','patEscola','patAcumulado','patFalta','patPctBadge','ppFinanciamentoCasa','ppFinanciamentoDetalhe','ppConsorcioAuto','ppConsorcioAutoPct','ppConsorcioAutoParcela'];

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

  const total = Math.round((reserva + btg + caixaLance + nectonCC) * 100) / 100;
  const metaMilhao = REG.patrimonio.metaMilhao; // 1.000.000, constante — mesmo valor do V1, não é dado a migrar
  const metaMilhaoPct = Math.round((total / metaMilhao * 100) * 100) / 100;

  t('patTotal', fmt(total));
  t('patReserva', fmt(reserva));
  t('patBtg', fmt(btg));
  t('patEscola', fmt(nectonCC));
  t('patAcumulado', fmt(total));
  t('patFalta', fmt(metaMilhao - total));
  t('patPctBadge', metaMilhaoPct.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%');
  { const el=$('patPctBar'); if(el) el.style.width = metaMilhaoPct+'%'; }

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

  // Auditoria: confere contra o que hydratePatrimonio() (V1) já tinha escrito antes desta função rodar
  const v1Total = Math.round(REG.patrimonio.total * 100) / 100;
  const diverge = Math.abs(v1Total - total) > 0.01;
  if(diverge) console.warn(`Onda4Patrimonio: V1=${fmt(v1Total)} × V2=${fmt(total)} — DIVERGE (inesperado, investigar antes de confiar na V2 aqui).`);
  else console.log(`Onda4Patrimonio: V1×V2 batem (${fmt(total)}). V2 é a fonte exibida.`);

  window.WALLACE_ONDA4_PATRIMONIO_RELATORIO = { v1: v1Total, v2: total, diverge, caixaLanceFonte: 'V1 (exceção deliberada, ver comentário no topo do arquivo)', exibindo: 'V2' };
  console.log('Onda4Patrimonio: relatório completo em window.WALLACE_ONDA4_PATRIMONIO_RELATORIO', window.WALLACE_ONDA4_PATRIMONIO_RELATORIO);
}
