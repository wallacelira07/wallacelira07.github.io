// MÓDULO: aplicarClimaSolar() — clima atual de Campina Grande/PB (Open-Meteo, API pública gratuita,
// sem chave/cadastro), mostrado como contexto visual na seção 01 "Como a usina está indo". NOVO
// 11/08/2026 (pedido do usuário: "hoje a geração está baixa, mas está chovendo, então eu vendo esse
// ícone já sei o porque" — quer o contexto do clima junto do card de desempenho, sem precisar abrir
// outro app). Puramente informativo — NUNCA usado em nenhum cálculo de geração/crédito/rateio, só
// ajuda a interpretar visualmente por que um dia pode estar abaixo da média. Sem fallback silencioso
// enganoso: se a API falhar, o bloco simplesmente não aparece (display:none, já é o padrão no HTML) —
// nunca mostra um clima antigo/inventado como se fosse agora.
//
// Coordenadas EXATAS do gerador (Rua Gildete Gomes Bezerra, 79 - Nova Brasília, Campina Grande/PB,
// mesma UC 573.702.053-77) fixas aqui de propósito (mesma lógica de CAIXA_VARIAVEL_ID_V2 em app.js —
// constante estável, não precisa vir de configuração externa pra um valor que não muda). CORRIGIDO
// 17/08/2026 (2x na mesma sessão): 1ª correção trocou o centro-de-cidade (-7.2306/-35.8811, ~2,8km
// de erro) por geocodificação de endereço (OpenStreetMap Nominatim); 2ª correção trocou por leitura
// GPS real no local, exportada do app Sun Surveyor pelo usuário (mais precisa que geocodificação por
// texto) — mesmo valor agora usado em hydrate-onda5-qualidade-geracao.js e previsao-geracao-solar.js
// (duplicado nos 3 arquivos de propósito, ver comentário lá).
const CLIMA_SOLAR_LAT = -7.215406;
const CLIMA_SOLAR_LON = -35.856661;

// Códigos WMO (documentação oficial Open-Meteo) -> {emoji, texto}. Cobre os códigos realmente
// possíveis pro clima brasileiro (sem neve) + os poucos que podem aparecer por precaução.
const CLIMA_SOLAR_CODIGOS = {
  0: { emoji: '☀️', texto: 'Céu limpo' },
  1: { emoji: '🌤️', texto: 'Poucas nuvens' },
  2: { emoji: '⛅', texto: 'Parcialmente nublado' },
  3: { emoji: '☁️', texto: 'Nublado' },
  45: { emoji: '🌫️', texto: 'Neblina' },
  48: { emoji: '🌫️', texto: 'Neblina com geada' },
  51: { emoji: '🌦️', texto: 'Garoa fraca' },
  53: { emoji: '🌦️', texto: 'Garoa' },
  55: { emoji: '🌦️', texto: 'Garoa forte' },
  56: { emoji: '🌦️', texto: 'Garoa gelada' },
  57: { emoji: '🌦️', texto: 'Garoa gelada forte' },
  61: { emoji: '🌧️', texto: 'Chuva fraca' },
  63: { emoji: '🌧️', texto: 'Chuva' },
  65: { emoji: '🌧️', texto: 'Chuva forte' },
  66: { emoji: '🌧️', texto: 'Chuva gelada' },
  67: { emoji: '🌧️', texto: 'Chuva gelada forte' },
  71: { emoji: '🌨️', texto: 'Neve fraca' },
  73: { emoji: '🌨️', texto: 'Neve' },
  75: { emoji: '🌨️', texto: 'Neve forte' },
  77: { emoji: '🌨️', texto: 'Grãos de neve' },
  80: { emoji: '🌦️', texto: 'Pancada de chuva fraca' },
  81: { emoji: '🌦️', texto: 'Pancada de chuva' },
  82: { emoji: '⛈️', texto: 'Pancada de chuva forte' },
  85: { emoji: '🌨️', texto: 'Pancada de neve fraca' },
  86: { emoji: '🌨️', texto: 'Pancada de neve forte' },
  95: { emoji: '⛈️', texto: 'Trovoada' },
  96: { emoji: '⛈️', texto: 'Trovoada com granizo' },
  99: { emoji: '⛈️', texto: 'Trovoada com granizo forte' },
};

// CORRIGIDO 14/08/2026 (achado real: painel demorando ~7s pra carregar) - hydrate() e chamada de
// novo ate 13x durante o boot (promocoes-financeengine.js promove cada caixa V1->V2 individualmente,
// re-hidratando a cada uma), e aplicarClimaSolar() rodava a cada chamada sem nenhuma protecao -
// disparava a MESMA requisicao pra Open-Meteo 13 vezes seguidas, cada uma esperando a anterior
// (limite de conexoes por host do navegador), somando ~7s sozinho no fim da fila. O clima e so
// contexto visual (nunca usado em calculo, ver comentario no topo do arquivo) - nao precisa
// re-buscar a cada re-hidratacao da mesma carga de pagina, 1x ja e suficiente.
let __climaSolarJaBuscado = false;
async function aplicarClimaSolar(){
  const elBloco = $('qgClima');
  if(!elBloco) return;
  if(__climaSolarJaBuscado) return;
  __climaSolarJaBuscado = true;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CLIMA_SOLAR_LAT}&longitude=${CLIMA_SOLAR_LON}&current=temperature_2m,weather_code,is_day&timezone=America%2FSao_Paulo`;
    // NOVO 12/08/2026 (pedido do usuário: "precisa de data e hora nesse menu do tempo") - current.time
    // vem no fuso já pedido acima (America/Sao_Paulo), formato 'YYYY-MM-DDTHH:mm' - horário real da
    // LEITURA (não o horário local do navegador de quem está olhando, que pode estar em outro fuso).
    const resp = await fetch(url);
    if(!resp.ok) throw new Error(`Open-Meteo respondeu ${resp.status}`);
    const dado = await resp.json();
    const atual = dado.current;
    if(!atual || typeof atual.temperature_2m !== 'number') throw new Error('resposta sem current.temperature_2m');
    const info = CLIMA_SOLAR_CODIGOS[atual.weather_code] || { emoji: '🌡️', texto: 'Sem descrição' };
    // Sol vira lua à noite pro mesmo código "céu limpo/poucas nuvens" (is_day=0) — mais fiel ao momento real.
    const emoji = (atual.is_day === 0 && (atual.weather_code === 0 || atual.weather_code === 1)) ? '🌙' : info.emoji;
    const temp = Math.round(atual.temperature_2m);
    const elIcone = $('qgClimaIcone'), elTexto = $('qgClimaTexto'), elLocal = $('qgClimaLocal');
    if(elIcone) elIcone.textContent = emoji;
    if(elTexto) elTexto.textContent = `${temp}°C · ${info.texto}`;
    if(elLocal && atual.time){
      const [dataIso, horaIso] = atual.time.split('T');
      const [ano, mes, dia] = dataIso.split('-');
      elLocal.textContent = `Campina Grande/PB · ${dia}/${mes} ${horaIso}`;
    }
    elBloco.style.display = 'flex';
  } catch(err){
    console.warn('aplicarClimaSolar: falha ao buscar clima da Open-Meteo — bloco fica oculto (nunca mostra dado antigo/inventado).', err);
  }
}
