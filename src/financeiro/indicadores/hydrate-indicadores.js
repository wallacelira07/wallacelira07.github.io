// MÓDULO: hydrateIndicadores() — renderização do card PIB Wallace / Taxa de Poupança / Crescimento
// Patrimonial (seção 23). Extraído de hydrate() (app.js) na modularização (07/08/2026). Script
// clássico (não ES module), carrega ANTES do app.js — hydrate() é síncrona (onDomPronto(hydrate),
// dentro do próprio app.js) e chama hydrateIndicadores() no meio da própria execução. Usa só
// REG.pibWallace/REG.balanco.patrimonioLiquido (leitura, já calculados por recalcularAgregadosDerivados()
// antes de hydrate() rodar) — nenhuma variável local compartilhada com o resto de hydrate(). Nenhum
// id de DOM, fórmula ou comportamento visual foi alterado.
function hydrateIndicadores(){
  const t = (id,v)=>{ const el=$(id); if(el) el.textContent=v; };

  // NOVO 04/08/2026 (parte 78): render do card PIB Wallace, secao 23.
  { const P = REG.pibWallace;
    if(P){
      t('pibSalario', fmt(P.salarioLiquido));
      t('pibReembolsos', fmt(P.reembolsos));
      t('pibRendimentos', fmt(P.rendimentos));
      t('pibValorizacao', fmt(P.valorizacaoInvestimentos));
      t('pibConsumoNaoRecorrente', '-'+fmt(P.consumoNaoRecorrente));
      t('pibTotal', fmt(P.total));
      // NOVO 05/08/2026 (parte 97): Eficiencia Financeira e Consumo Improdutivo ja aparecem no
      // primeiro mes (nao dependem de historico, so do ciclo atual). Taxa de Crescimento SO aparece
      // a partir do 2o mes registrado (precisa de um ciclo anterior pra comparar) - nao inventa 0%
      // nem esconde que ainda esta pendente.
      const serieEl = $('pibSerieHistorica');
      if(serieEl){
        const partes = [];
        partes.push('Eficiência Financeira: <strong>'+P.eficienciaFinanceiraPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%</strong> da renda sobrou depois de todos os gastos do ciclo (taxa de poupança real)');
        partes.push('Consumo Improdutivo: <strong>'+P.consumoImprodutivoPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%</strong> da renda foi bens duráveis avulsos');
        if(P.taxaCrescimentoPct != null){
          partes.push('Taxa de Crescimento: <strong style="color:'+(P.taxaCrescimentoPct>=0?'var(--green)':'var(--red)')+'">'+(P.taxaCrescimentoPct>=0?'+':'')+P.taxaCrescimentoPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%</strong> vs. ciclo anterior registrado');
        } else {
          partes.push('Taxa de Crescimento: ainda sem ciclo anterior no histórico ('+P.mesesNoHistorico+' mês(es) registrado(s) até agora — aparece a partir do 2º)');
        }
        serieEl.innerHTML = partes.join(' · ');
      }
      // NOVO 07/08/2026: render de Crescimento Patrimonial + Taxa de Poupança (metodologia nova,
      // substitui o PIB Wallace como indicador principal exibido — cálculo do PIB Wallace acima
      // continua rodando e sendo persistido, só não é mais o número em destaque na tela).
      const elCrescInicial = $('crescPatrimInicial');
      if(elCrescInicial) elCrescInicial.textContent = P.patrimonioInicialCiclo != null ? fmt(P.patrimonioInicialCiclo) : '— (1º ciclo registrado)';
      t('crescPatrimAtual', fmt(REG.balanco.patrimonioLiquido));
      const elDelta = $('crescPatrimDelta');
      if(elDelta){
        if(P.crescimentoPatrimonialRS != null){
          const cor = P.crescimentoPatrimonialRS >= 0 ? 'var(--green)' : 'var(--red)';
          const sinal = P.crescimentoPatrimonialRS >= 0 ? '+' : '';
          elDelta.innerHTML = `<span style="color:${cor}">${sinal}${fmt(P.crescimentoPatrimonialRS)} (${sinal}${P.crescimentoPatrimonialPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})}%)</span>`;
        } else {
          elDelta.textContent = 'Aparece a partir do 2º ciclo registrado (precisa do patrimônio do fechamento anterior).';
        }
      }
      t('poupancaReceitas', fmt(P.receitaTotalComp));
      t('poupancaDespesas', fmt(P.despesaTotalComp));
      const elSobrou = $('poupancaSobrou');
      if(elSobrou){
        const cor = P.poupancaRS >= 0 ? 'var(--green)' : 'var(--red)';
        elSobrou.innerHTML = `<span style="color:${cor}">${fmt(P.poupancaRS)}</span> <span style="color:var(--text-dim);font-weight:400">(${P.taxaPoupancaPct != null ? P.taxaPoupancaPct.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%' : '—'})</span>`;
      }
    }
  }
}
