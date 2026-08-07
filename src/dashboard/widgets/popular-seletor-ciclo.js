// MÓDULO: popularSeletorCiclo() — cria os botões do seletor de ciclo dinamicamente a partir de
// CICLO_LISTA/VARS.CICLO_SNAPSHOTS (nunca precisa editar o HTML na mão quando um novo ciclo fecha).
// Extraído de app.js na modularização (07/08/2026). Depende de CICLO_LISTA (const global em app.js),
// trocarCiclo() e atualizarBotoesSeletorCiclo() (funções globais em app.js) — todas já existem no
// momento da CHAMADA (via onDomPronto, depois do DOM pronto e do app.js inteiro já ter carregado),
// mesmo esta função sendo definida num módulo carregado ANTES do app.js. Chamada via
// onDomPronto(popularSeletorCiclo) em app.js, que continua igual. Nenhuma fórmula ou comportamento
// mudou.
function popularSeletorCiclo(){
  const wrap = $('cicloSeletorBtns');
  if(!wrap) return;
  wrap.innerHTML = '';
  // ordem mais recente primeiro (ciclo atual a esquerda)
  [...CICLO_LISTA].reverse().forEach(key=>{
    const snap = VARS.CICLO_SNAPSHOTS[key];
    const btn = document.createElement('button');
    btn.className = 'ciclo-btn' + (snap.fechado ? ' ciclo-fechado-btn' : '');
    btn.id = 'cicloBtn_'+key;
    btn.textContent = snap.fechado ? ('🔒 '+snap.label.replace(' — FECHADO','')) : ('🟢 '+snap.label.replace(' — ATUAL',''));
    btn.onclick = () => trocarCiclo(key);
    wrap.appendChild(btn);
  });
  atualizarBotoesSeletorCiclo();
}
