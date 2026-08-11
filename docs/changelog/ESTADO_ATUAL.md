# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 10/08/2026, fim de sessão (créditos no fim, ~99%). HEAD `30ee4ae`, tudo commitado e pushed (branch `main`, `wallacelira07.github.io`).

## 🎯 Regra permanente: V1 não é autoridade

`wallace_dados`/`VARS` (V1) não é mais fonte de verdade — a V2 (`transacoes`/tabelas relacionais) só é validada contra a realidade (extrato, comprovante, confirmação do usuário), nunca contra o que o V1 dizia.

## ✅ Corrigido nesta sessão — 3 bugs de dado sérios (gráficos/tabelas dessincronizados)

1. **Reserva de Emergência**: mostrava R$100.644,15 (com rendimento) na aba Cenários — usuário já retirou o rendimento, valor real é R$100.000,00 fixo (rotina mensal). Corrigido em 3 pontos: tabela V2 `patrimonio` (UPDATE aplicado), literal V1 (`vars-patrimonio.js`), e `REG.reserva.atual` (nunca era resincronizado quando a V2 de Patrimônio carregava — `aplicarOnda4Patrimonio()` agora atualiza e re-chama `hydrateCenarios()`).
2. **"Necessidade (paga tudo)" (Cenários) ≠ "Necessidade líquida" (Gráficos)** a partir do 2º mês: `REG.superavitNormal.necessidade` era array literal congelado desde V150 (25/07), só índice 0 resincronizado. Corrigido pela raiz: `REG.superavitNormal.necessidade` agora é a MESMA referência de `REG.evolucao.necessidadeBruta` (array vivo) — impossível dessincronizar de novo.
3. **"Evolução do Total Operacional" subia no mês seguinte** (contrário à tendência de queda): `D.provMP` (parcelas Mercado Pago) contado 2x — fixo em `baseFixaOperacional` E de novo dentro de `somaParcelasProjetadas()`. Removido de `baseFixaOperacional`.

**Nenhum dos 3 testado em navegador real** (sem login) — confirmar com o usuário no próximo acesso.

## ⚠️ PENDÊNCIA — qual conta é a "Reserva de R$100k"?

Usuário mencionou "os 100k estão no Itaú" ao ser informado que a Reserva de Emergência (BTG, campo `VARS.reserva`/tabela `patrimonio` id `d36ce6aa...`) não pode vir do Pluggy porque a Pluggy só sincroniza saldo de conta corrente/cartão (não investimentos). **Não investigado se são a mesma reserva (mapeamento errado) ou duas reservas diferentes** — checar com o usuário antes de mexer em qualquer valor de Reserva de novo.

## ✅ Corrigido — fila "demais leitores/escritores V1" (domínio Solar fechado)

`scripts/sync/atualizar_geracao_saj.py` parou de escrever em `wallace_dados` (V1) — confirmado que `app.js` não lê mais `SOLAR_LEITURAS`/`SOLAR_GERACAO_DIARIA` de lá (domínio V2-exclusivo desde outra sessão). Escrita V2 (`energia_solar_geracao_diaria`/`energia_solar_leituras`) já existia em paralelo, agora é a única.

**Investigado**: `scripts/database/sincronizar_erp_supabase.py` (escreve `HISTORICO_ERP_TODOS_CICLOS` em `wallace_dados`) — diferente do caso Solar, NÃO é uma correção rápida. A leitura já prioriza V2 corretamente (`vw_historico_erp_completo`, V1 só como fallback silencioso, já documentado como aceitável em `PLANO_UNIFICACAO_V1_V2.md:1711` — "domínio auxiliar de busca, não card financeiro"). O bloqueio é na ESCRITA: a tabela V2 `transacoes` exige `caixa_id` (NOT NULL, FK) e a planilha ERP só tem o nome do livro em texto — não existe mapeamento livro→caixa_id pronto pra popular isso sem risco de gravar dado mal categorizado na tabela viva. Precisa de um mapeamento novo antes de qualquer migração de escrita — não é dívida técnica simples, registrar como escopo próprio se o usuário quiser continuar essa fila. **Com isso, a fila "demais leitores/escritores V1" está fechada até onde dá sem trabalho de schema novo** — só restam Cartões (fora de escopo) e este item (bloqueado por mapeamento).

## ✅ Corrigido — 8 achados de UI/UX via foto real do celular/navegador

Botão Compartilhar (aba Solar) invisível (`var(--purple)` sem fallback) + redesenhado em pílula com ícone · card "Caixa Var." sempre verde mesmo negativo · lupa quase invisível na faixa 560-780px · "Ver Ciclo" vazando pra todas as abas (movido pra dentro de `#painel`, por pedido explícito do usuário — contraria decisão antiga V145 de propósito) · F5 sempre voltava pro Painel sem lembrar a aba (restaurado via `sessionStorage`) · espaço vazio acima do menu de abas em todas as abas exceto a capa · Busca Global não achava "PIB" nem outros termos em seções com 2+ blocos (indexador só olhava o 1º irmão, agora varre todos) · card "PIB Wallace (metodologia antiga)" removido da tela por pedido do usuário (Crescimento Patrimonial já é o indicador correto).

## ✅ Corrigido — performance de boot (~500ms)

Os 6 módulos finais do boot (documentados como independentes de `promocoes-financeengine.js`) esperavam ele terminar por completo antes de começar a baixar — agora em paralelo. `window.WALLACE_BOOT_TIMING` (instrumentação já existia) confirma: total ~935ms antes, maior fatia era essa espera sequencial.

## ✅ Decisão tomada com o usuário — atualizar dados ao trocar de aba

Nem sempre (mais chamadas ao Supabase, mais lento) nem nunca (fica velho numa sessão longa). Implementado: recarrega o iframe inteiro (reaproveita o F5, que já restaura a aba) só se passou +5min desde o último boot (`window.__wallaceUltimoBootTs`). Recarregar tudo em vez de re-chamar `hydrate()`/os "onda" na mão foi escolha deliberada de segurança — gráficos (`graficos-cenarios-lazy.js`) não são seguros de recriar (`new Chart()` 2x duplica/quebra).

## Pendências antigas, sem decisão do usuário ainda

| Item | Nota |
|---|---|
| Rodapé "ERP V11" | Já corrigido em sessão anterior (`f1e3d95`) |
| Abas cortando/travando ao rolar no mobile | Usuário nunca respondeu ao pedido de print/gravação, não investigado |
| 3 transações LRW/LRV sem dono (R$282,71) | Só o usuário pode dizer de quem são |
| `window.WALLACE_BOOT_TIMING` | Já lido nesta sessão (~935ms total, boot paralelo aplicado) |
| Cartões (Visa Infinite/Mastercard Black) | Bloqueador estrutural, sessão dedicada — fora de escopo |

## Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. **Pendência da Reserva R$100k (Itaú vs BTG) é a mais urgente** — não mexer em nenhum valor de Reserva sem esclarecer com o usuário primeiro.
3. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. Continuar a fila "demais leitores/escritores V1": próximo item é `sincronizar_erp_supabase.py`.
