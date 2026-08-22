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
