// MÓDULO: fórmulas solares compartilhadas entre o painel privado (graficos-cenarios-lazy.js) e a
// página pública de compartilhamento (solar-compartilhado.html).
//
// NOVO 22/08/2026 (pedido do usuário, prioridade 0: "eu quero algo espelhado, mexeu no site e no
// compartilhado muda automaticamente" — achado real: a fórmula de consumo médio via medidor Tuya foi
// corrigida no painel privado (descartar o 1º dia de histórico, sempre parcial) mas ESQUECIDA no
// compartilhado, gerando números diferentes nas duas páginas pro mesmo dado. 2ª vez que isso
// acontece na mesma sessão (a mesma fórmula do medidor Tuya já tinha sido corrigida sem espelhar
// antes). Este arquivo existe pra isso nunca mais acontecer: qualquer fórmula usada nas 2 páginas
// deve morar AQUI, nunca copiada — as duas páginas chamam a mesma função, corrigir aqui corrige nos
// 2 lugares ao mesmo tempo, automaticamente, sem precisar lembrar de replicar.
//
// Script clássico (não ES module) de propósito — carrega igual nas 2 páginas (`<script src="src/
// solar/calculos-solares-compartilhados.js">`), sem bundler/import/export, funções penduradas direto
// no escopo global (window implícito). Zero dependência de VARS/REG/dados/auth — só recebe dados já
// prontos como parâmetro e devolve o número calculado, pra funcionar igual nas 2 páginas mesmo elas
// tendo formatos de fetch/autenticação completamente diferentes (painel privado = Firebase, público =
// token de compartilhamento).

// Média de consumo diário real via medidor Tuya, descartando o 1º dia de histórico (sempre parcial —
// o medidor é instalado no meio do dia, só capta as horas restantes, puxando a média pra baixo de
// forma artificial). `diario` é o array bruto (aceita tanto `kwh_consumido` quanto `kwhConsumido`,
// os 2 formatos de campo usados pelas 2 páginas). `fallback` é usado só se não houver nenhum dia
// utilizável (medidor recém-instalado, sem nenhuma leitura completa ainda).
// Em que mês (1-12) o ciclo de leitura da GD FECHA, dado um dia de referência (ISO 'AAAA-MM-DD') e o
// dia do mês em que a leitura oficial acontece (hoje sempre 8 — Casa da Mãe/Wellida, mesmo ciclo).
// Ex.: diaVirada=8, dataStr='2026-08-07' -> fecha em Ago (8); '2026-08-09' -> já fechou, o crédito
// vai pro ciclo que fecha em Set (9). Usada tanto pelo painel privado (mesFechamentoCiclo) quanto
// pelo compartilhado (mesFechamentoCicloRateio) — antes 2 cópias idênticas, agora uma função só.
function mesFechamentoCicloGD(dataStr, diaVirada){
  const [, mes, dia] = dataStr.split('-').map(Number);
  let m = dia <= diaVirada ? mes : mes + 1;
  if(m > 12) m = 1;
  return m;
}

// Cronograma legal da Lei 14.300/2022 pra cobrança do Fio B sobre créditos de GD (15%/23, 30%/24,
// 45%/25, 60%/26, 75%/27, 90%/28-29, 100%/30+) — mesmo valor usado nas 2 páginas, cópia deliberada
// de src/solar/vars-energia-solar.js (FIO_B_COBRANCA_2026_PCT/FIO_B_PCT_DA_DISTRIBUICAO). Atualizar
// aqui quando o ano virar 2027 (75%) — só este arquivo, nunca mais em 2 lugares.
const FIO_B_COBRANCA_2026_PCT = 60;
const FIO_B_PCT_DA_DISTRIBUICAO = 28; // fatia do Fio B dentro da categoria "Distribuição" da fatura
const CONSUMO_MINIMO_COM_SOLAR_KWH = 30; // ligação monofásica (Wallace/Wellida/Mãe, confirmado pelo usuário)

// Piso da fatura mesmo com 100% dos créditos cobrindo o consumo — Custo de Disponibilidade + Fio B +
// Iluminação Pública + Encargos setoriais, os 4 componentes que a Lei 14.300 nunca deixa zerar.
// `pct` = composicao_pct da casa ({distribuicao, iluminacao, encargos, ...}, em %, 0-100).
// `cosipValorReal` = valor exato da COSIP (linha "CONTRIB ILUM PUBLICA" da fatura), undefined se não
// tiver — nesse caso estima por pct.iluminacao (menos preciso, só fallback).
function calcularResidualFormula(faturaBase, consumoKwh, pct, cosipValorReal){
  const tarifaReal = faturaBase / consumoKwh;
  const fioBFracaoDaDistribuicao = (FIO_B_COBRANCA_2026_PCT/100) * (FIO_B_PCT_DA_DISTRIBUICAO/100);
  const custoDisponibilidade = Math.round(CONSUMO_MINIMO_COM_SOLAR_KWH * tarifaReal * 100) / 100;
  const fioBValor = Math.round(faturaBase * (pct.distribuicao||0)/100 * fioBFracaoDaDistribuicao * 100) / 100;
  const iluminacaoValor = cosipValorReal !== undefined ? cosipValorReal : Math.round(faturaBase * (pct.iluminacao||0)/100 * 100) / 100;
  const encargosValor = Math.round(faturaBase * (pct.encargos||0)/100 * 100) / 100;
  const residual = Math.round((custoDisponibilidade + fioBValor + iluminacaoValor + encargosValor) * 100) / 100;
  return { tarifaReal, custoDisponibilidade, fioBValor, iluminacaoValor, encargosValor, residual };
}

// "Economia real deste mês": sem solar (consumo real deste mês × tarifa da última fatura pré-solar)
// vs. com solar (fatura real que o robô já capturou este mês). Usada pelo card "💰 Economia real
// deste mês" nas 2 páginas (residualTbodyEl/graficos-cenarios-lazy.js e economiaRealTbodyCompartilhado/
// solar-compartilhado.html) — antes 2 cópias quase idênticas da mesma fórmula. Retorna null se faltar
// algum dos 4 campos (nunca inventa número parcial).
function calcularEconomiaRealMes(faturaPreSolar, consumoPreSolar, valorMesAtual, consumoMesAtual){
  if(faturaPreSolar === undefined || !consumoPreSolar || valorMesAtual === undefined || !consumoMesAtual) return null;
  const tarifaPreSolar = faturaPreSolar / consumoPreSolar;
  const semSolar = Math.round(tarifaPreSolar * consumoMesAtual * 100) / 100;
  const economiaReal = Math.round((semSolar - valorMesAtual) * 100) / 100;
  const economiaRealPct = semSolar > 0 ? Math.round((economiaReal/semSolar)*1000)/10 : 0;
  return { tarifaPreSolar, semSolar, economiaReal, economiaRealPct };
}

function mediaConsumoDiarioTuyaRecente(diario, fallback){
  const pegarKwh = r => r.kwh_consumido != null ? Number(r.kwh_consumido) : (r.kwhConsumido != null ? Number(r.kwhConsumido) : null);
  const validos = (diario||[])
    .map(r => ({ data: r.data, kwh: pegarKwh(r) }))
    .filter(r => r.kwh != null)
    .sort((a,b) => a.data < b.data ? -1 : 1);
  const semPrimeiroDiaParcial = validos.length > 1 ? validos.slice(1) : validos; // só descarta se sobrar pelo menos 1 dia completo
  const janela = semPrimeiroDiaParcial.slice(-14); // últimos até 14 dias com leitura completa
  if(!janela.length) return fallback;
  return Math.round((janela.reduce((s,r)=>s+r.kwh,0)/janela.length)*100)/100;
}
