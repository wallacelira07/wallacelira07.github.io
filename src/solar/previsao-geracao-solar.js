// MÓDULO: aplicarPrevisaoGeracaoSolar() — previsão de geração solar (kWh/dia) pros próximos dias,
// calibrada com dado REAL de geração (VARS.SOLAR_GERACAO_DIARIA, robô SAJ) cruzado com a previsão
// de irradiância (Open-Meteo, mesma API pública gratuita sem chave já usada em
// hydrate-clima-solar.js, mesmo padrão de fetch). NOVO 16/08/2026 — pedido do usuário, ideia já
// tinha sido perguntada/respondida antes (ver PASSAGEM_DE_TURNO.md, 14/08/2026) sem nunca ter sido
// implementada. Decisão completa (dados usados, modelo, R², limitações, por que foi implementado
// mesmo com calibração fraca) em docs/decisions/PREVISAO_GERACAO_SOLAR_IRRADIANCIA.md.
//
// Diferente de hydrate-clima-solar.js (clima ATUAL, puramente visual, NUNCA usado em cálculo),
// este módulo faz um cálculo de verdade — mas é sempre uma PROJEÇÃO, nunca dado real, e isso é
// dito explicitamente na UI (mesmo padrão de disclaimer já usado no Simulador Regulatório de
// energia-solar.js: "Isto é uma SIMULAÇÃO/PROJEÇÃO, não dado real").
//
// MODELO: regressão linear simples geracao_kWh ≈ a + b × irradiância_prevista(MJ/m²/dia,
// shortwave_radiation_sum), treinada NO NAVEGADOR, a cada carga de página, com os dias REAIS mais
// recentes de VARS.SOLAR_GERACAO_DIARIA cruzados com a irradiância HISTÓRICA da mesma data (a API
// /v1/forecast da Open-Meteo serve past_days e forecast_days na MESMA chamada — não precisa de
// endpoint separado de arquivo histórico). Não existe coeficiente fixo/hardcoded no código: o
// fator kWh-por-irradiância é recalculado sozinho toda vez, e melhora (ou piora, honestamente)
// conforme mais dias reais de geração se acumulam no banco.
//
// HONESTIDADE DA CALIBRAÇÃO (ponto central desta implementação): a qualidade real do modelo (R²,
// erro médio, quantos dias entraram no treino) é SEMPRE exibida junto do resultado
// (#previsaoSolarDiagnostico) — nunca escondida, nunca só um número bonito sem contexto. Com poucos
// dias de histórico (o robô SAJ só existe desde 01/08/2026) o modelo é FRACO por natureza (R² baixo
// é um resultado esperado e legítimo com n pequeno, não um bug) — a seção só aparece quando há um
// mínimo de dado pra calibrar (PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO) e a relação encontrada faz
// sentido físico (mais irradiância → mais geração, nunca o contrário).

const PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO = 7; // abaixo disso a regressão tem <5 graus de liberdade - ruído, não modelo
const PREVISAO_SOLAR_DIAS_FORECAST = 7; // próximos N dias mostrados - irradiância prevista fica pouco confiável depois disso

// Regressão linear simples por mínimos quadrados, sem dependência externa (dataset é pequeno, não
// justifica carregar uma lib de estatística só pra isso). Retorna null se não der pra calibrar
// (ex: irradiância idêntica em todos os dias de treino, sem variação pra explicar nada).
function __previsaoSolarRegressaoLinear(xs, ys){
  const n = xs.length;
  const mx = xs.reduce((s,v)=>s+v,0)/n;
  const my = ys.reduce((s,v)=>s+v,0)/n;
  const sxy = xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0);
  const sxx = xs.reduce((s,x)=>s+(x-mx)**2,0);
  const syy = ys.reduce((s,y)=>s+(y-my)**2,0);
  if(sxx === 0) return null;
  const b = sxy/sxx;
  const a = my - b*mx;
  const r2 = syy === 0 ? 0 : (sxy*sxy)/(sxx*syy);
  const preds = xs.map(x => a + b*x);
  const residuos = ys.map((y,i) => y - preds[i]);
  const mae = residuos.reduce((s,r) => s + Math.abs(r), 0) / n;
  return { a, b, r2, mae, n };
}

// Mesmo guard de hydrate-clima-solar.js (mesmo arquivo comentado explica o motivo): hydrate() roda
// até 13x durante o boot (promocoes-financeengine.js re-hidrata caixa por caixa) — sem este guard,
// a mesma requisição pra Open-Meteo dispararia 13x seguidas, cada uma esperando a anterior.
let __previsaoSolarJaBuscada = false;
async function aplicarPrevisaoGeracaoSolar(){
  const elBloco = $('previsaoSolarBloco');
  if(!elBloco) return;
  if(__previsaoSolarJaBuscada) return;
  __previsaoSolarJaBuscada = true;
  try {
    const registros = VARS.SOLAR_GERACAO_DIARIA;
    if(!Array.isArray(registros) || !registros.length){
      console.warn('aplicarPrevisaoGeracaoSolar: sem VARS.SOLAR_GERACAO_DIARIA ainda — seção fica oculta.');
      return;
    }

    // Mesma convenção de "hoje" (Brasília, UTC-3 fixo, sem lib de fuso — Brasil não tem mais
    // horário de verão desde 2019) já usada em hydrate-onda5-qualidade-geracao.js: o dia de hoje é
    // sempre PARCIAL (robô roda só 2x/dia), nunca entra no treino nem é tratado como "previsão"
    // (previsão é só pra dias FUTUROS, que ainda não têm leitura nenhuma).
    const hojeStr = new Date(Date.now() - 3*3600*1000).toISOString().slice(0,10);
    const diasCompletos = registros.filter(r => r.data !== hojeStr && typeof r.kwh === 'number' && r.kwh > 0);
    if(diasCompletos.length < PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO){
      console.warn(`aplicarPrevisaoGeracaoSolar: só ${diasCompletos.length} dia(s) completo(s) de histórico real (mínimo ${PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO}) — sem dado suficiente pra calibrar, seção fica oculta.`);
      return;
    }

    // Coordenadas EXATAS do gerador (Rua Gildete Gomes Bezerra, 79 - Nova Brasília, Campina
    // Grande/PB) — duplicadas de propósito aqui (não referenciam a const de hydrate-clima-solar.js):
    // os módulos da base carregam em paralelo, sem ordem garantida entre eles (ver
    // __carregarScriptsParalelo em Sistema_Wallace_Lira_Completo.html, s.async=true) — depender de
    // uma const top-level de OUTRO <script> arriscaria ReferenceError se este arquivo executasse
    // primeiro. Mesmo valor (mesma usina), mesma lógica de duplicação já usada pro r2Sim em
    // energia-solar.js. CORRIGIDO 17/08/2026 (2x na mesma sessão): 1ª correção trocou o
    // centro-de-cidade (-7.2306/-35.8811, ~2,8km de erro) por geocodificação de endereço; 2ª
    // correção trocou por leitura GPS real no local (app Sun Surveyor, exportada pelo usuário) —
    // mesmo valor agora usado em hydrate-clima-solar.js e hydrate-onda5-qualidade-geracao.js.
    const lat = -7.215406, lon = -35.856661;

    const maisAntigo = diasCompletos.reduce((min,r) => r.data < min ? r.data : min, diasCompletos[0].data);
    const diasDesdeMaisAntigo = Math.round((new Date(hojeStr) - new Date(maisAntigo)) / 86400000);
    const pastDays = Math.min(92, Math.max(PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO, diasDesdeMaisAntigo + 2));
    const forecastDays = PREVISAO_SOLAR_DIAS_FORECAST + 1; // +1 = a resposta inclui hoje também (não usado na previsão, só de passagem)

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=shortwave_radiation_sum&past_days=${pastDays}&forecast_days=${forecastDays}&timezone=America%2FSao_Paulo`;
    const resp = await fetch(url);
    if(!resp.ok) throw new Error(`Open-Meteo respondeu ${resp.status}`);
    const dado = await resp.json();
    const diario = dado.daily;
    if(!diario || !Array.isArray(diario.time) || !Array.isArray(diario.shortwave_radiation_sum)){
      throw new Error('resposta sem daily.shortwave_radiation_sum');
    }
    const irradianciaPorData = {};
    diario.time.forEach((d,i) => { irradianciaPorData[d] = diario.shortwave_radiation_sum[i]; });

    // Junta geração REAL × irradiância HISTÓRICA da mesma data — só entra no treino quem tem os
    // dois valores (dias fora da janela que a Open-Meteo devolveu ficam de fora, não interpolados).
    const treinoXs = [], treinoYs = [];
    diasCompletos.forEach(r => {
      const irr = irradianciaPorData[r.data];
      if(typeof irr === 'number'){ treinoXs.push(irr); treinoYs.push(r.kwh); }
    });
    if(treinoXs.length < PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO){
      console.warn(`aplicarPrevisaoGeracaoSolar: só ${treinoXs.length} dia(s) com irradiância E geração real casadas (mínimo ${PREVISAO_SOLAR_MIN_DIAS_CALIBRACAO}) — sem dado suficiente pra calibrar, seção fica oculta.`);
      return;
    }

    const modelo = __previsaoSolarRegressaoLinear(treinoXs, treinoYs);
    // Coeficiente <= 0 seria fisicamente absurdo (mais irradiância gerando MENOS energia) — sinal
    // de que o pouco dado disponível é só ruído, não uma relação real. Nesse caso é mais honesto
    // não mostrar previsão nenhuma do que mostrar um número "calibrado" a partir de ruído.
    if(!modelo || modelo.b <= 0){
      console.warn('aplicarPrevisaoGeracaoSolar: regressão não achou relação fisicamente plausível (coeficiente <= 0) — seção fica oculta.', modelo);
      return;
    }

    // Previsão dos próximos dias — só datas ESTRITAMENTE futuras (nunca hoje, ver comentário acima
    // sobre "hoje é sempre parcial").
    const linhas = diario.time
      .map((d,i) => ({ data: d, irr: diario.shortwave_radiation_sum[i] }))
      .filter(x => x.data > hojeStr)
      .slice(0, PREVISAO_SOLAR_DIAS_FORECAST);

    if(!linhas.length){
      console.warn('aplicarPrevisaoGeracaoSolar: Open-Meteo não devolveu nenhum dia futuro de irradiância — seção fica oculta.');
      return;
    }

    const tbody = $('previsaoSolarTabela');
    if(tbody){
      tbody.innerHTML = linhas.map(x => {
        const pred = Math.max(0, modelo.a + modelo.b * x.irr);
        const [,mm,dd] = x.data.split('-');
        return `<tr><td style="padding:0.25rem 0">${dd}/${mm}</td><td>${x.irr.toLocaleString('pt-BR',{maximumFractionDigits:1})} MJ/m²</td><td>${pred.toLocaleString('pt-BR',{maximumFractionDigits:1})} kWh</td></tr>`;
      }).join('');
    }

    const elDiag = $('previsaoSolarDiagnostico');
    if(elDiag){
      const confiancaTxt = modelo.r2 >= 0.6 ? 'boa' : (modelo.r2 >= 0.3 ? 'moderada' : 'baixa');
      elDiag.textContent = `Calibrado com ${modelo.n} dia(s) reais de geração (robô SAJ) × irradiância histórica da mesma data · R² = ${modelo.r2.toFixed(2)} (correlação ${confiancaTxt}) · erro médio ±${modelo.mae.toLocaleString('pt-BR',{maximumFractionDigits:1})} kWh/dia. Quanto mais dias reais existirem, mais confiável fica — recalibra sozinho a cada carregamento, sem número fixo no código.`;
    }

    elBloco.style.display = 'block';
  } catch(err){
    console.warn('aplicarPrevisaoGeracaoSolar: falha ao calibrar/buscar previsão — seção fica oculta (nunca mostra número antigo/inventado).', err);
  }
}
