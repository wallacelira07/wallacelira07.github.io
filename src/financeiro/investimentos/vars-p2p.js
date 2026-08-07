// MODULO: criarVarsP2P() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsP2P(){
  return {
  // CORRIGIDO 23/07/2026: secao 18 (Operacoes P2P) do site era 100% texto hardcoded, nunca tinha sido
  // ligada ao REG - "Creditos restantes" mostrava "8/10" e "Lucro realizado" R$9,00, desatualizados desde
  // a V136 (22/07/2026), quando TXP2P0003 (venda de 2 creditos ao Elcio) mudou os numeros reais para
  // 6/10 restantes e R$27,00 de lucro. Agora vem do VARS, igual ao resto do sistema.
  p2pCapitalTotal: 110,           // = P2P_CAPITAL_TOTAL do ERP
  p2pCreditosTotal: 10,           // = P2P_CREDITOS_TOTAL
  p2pCreditosRestantes: 6,        // = P2P_CREDITOS_RESTANTES (V136: 9-1-2=6, era 8 no site)
  p2pCreditosVendidos: 3,         // = P2P_CREDITOS_VENDIDOS (TXP2P0002+TXP2P0003)
  p2pPrecoCompra: 11,             // = P2P_PRECO_COMPRA (110/10)
  p2pPrecoVenda: 20,              // = P2P_PRECO_VENDA
  p2pLucroRealizado: 27,          // = P2P_LUCRO_REALIZADO (V136: R$9+R$18=R$27, era R$9 no site)
  };
}
