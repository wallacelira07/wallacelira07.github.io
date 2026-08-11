# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 10/08/2026, fim de sessão longa (UI/UX + 3 bugs de dado + início da frente Cartões). HEAD `edb470f`, tudo commitado e pushed (branch `main`, `wallacelira07.github.io`).

## 🎯 Regra permanente: V1 não é autoridade

`wallace_dados`/`VARS` (V1) não é mais fonte de verdade — a V2 (`transacoes`/tabelas relacionais) só é validada contra a realidade (extrato, comprovante, confirmação do usuário), nunca contra o que o V1 dizia.

## ✅ Corrigido nesta sessão — 3 bugs de dado sérios (gráficos/tabelas dessincronizados)

1. **Reserva de Emergência**: mostrava R$100.644,15 (com rendimento) na aba Cenários — usuário retirou o rendimento, valor real é R$100.000,00 fixo. Corrigido em 3 pontos: tabela V2 `patrimonio`, literal V1 (`vars-patrimonio.js`), e `REG.reserva.atual` (nunca resincronizava quando a V2 de Patrimônio carregava). **Esclarecido depois**: a Reserva é conta **Itaú**, não BTG (comentários antigos do código estavam ambíguos/conflitantes sobre o banco) — valor R$100.000 continua correto, só a documentação foi corrigida.
2. **"Necessidade (paga tudo)" (Cenários) ≠ "Necessidade líquida" (Gráficos)**: `REG.superavitNormal.necessidade` era array literal congelado desde 25/07. Corrigido pela raiz — agora é a MESMA referência de `REG.evolucao.necessidadeBruta`.
3. **"Evolução do Total Operacional" subia no mês seguinte**: `D.provMP` contado 2x (fixo + projetado). Removido da parte fixa.

**Nenhum dos 3 testado em navegador real** (sem login) — confirmar com o usuário no próximo acesso.

## ✅ Fila "demais leitores/escritores V1" — fechada

- **Solar**: `scripts/sync/atualizar_geracao_saj.py` parou de escrever em `wallace_dados` (V1 já não tinha leitor).
- **ERP histórico**: `scripts/database/sincronizar_erp_supabase.py` migrado de V1 (`wallace_dados.HISTORICO_ERP_TODOS_CICLOS`) pra V2 (`transacoes`, UPSERT por `tx_legado`+`caixa_id`). Backfill executado contra a planilha real do usuário (`ERP_WALLACE_LIRA_V11_ATUALIZADO.xlsx`).
- **Resta só Cartões** — não é mais "bloqueador estrutural fora de escopo": o usuário pediu explicitamente pra começar essa frente nesta sessão (ver seção abaixo). Ainda não é a migração completa.

## ✅ Cartões — sessão dedicada iniciada (não completa)

Pedido do usuário: rastreabilidade individual de compras em cartão + decidir `mbLRVConfirmado`/`mbLRWConfirmado`.

- **`transacoes.cartao_id`** já existia (correção de premissa do pedido original), só nunca tinha sido usado de verdade.
- **`mbLRVConfirmado`/`mbLRWConfirmado`**: já resolvido desde uma sessão anterior (Onda 3, 08/08) — o valor exibido já é 100% V2 (`vw_compromisso_cartao_por_pessoa`). Os *headline totals* (`cartaoMBTotal`/`cartaoInfiniteTotal`/`mercadoPagoFatura`) têm exceção arquitetural **permanente** ("a fatura sempre vence") — não mexido, não é pra mexer.
- **106 transações classificadas** (livros LRW/LRV/LRP/LRS/LRR) usando colunas reais da planilha (RESPONSAVEL/FORMA_PAGAMENTO) — 100% ganharam `usuario_id`, 56% ganharam `cartao_id` específico (resto ficou `NULL` de propósito, sem número explícito na fonte, regra "nenhuma inferência sem evidência").
- **Regressão própria encontrada e corrigida no mesmo movimento**: o backfill do ERP (acima) inflou `vw_compromisso_cartao_por_pessoa` com histórico antigo (view não tinha filtro de ciclo) — Wallace chegou a mostrar R$8.802 em vez de ~R$1.600. Corrigido com filtro de `ciclo_inicio_em`, mesmo padrão de `vw_saldo_v2_por_caixa`.
- **Saldos de caixa reais confirmados intactos** em cada etapa (checado via `vw_saldo_v2_por_caixa` antes/depois).

**NÃO feito** (fica pra quando o usuário quiser continuar esta frente): classificação retroativa das transações "Cartao" genérico (sem número, ~47 desta rodada + mais fora dela); domínio Visa Infinite continua com poucas transações classificadas; totais de fatura via Pluggy (item já documentado como aprovado/não implementado, Cartões-scope).

Detalhe técnico completo: `docs/decisions/PLANO_UNIFICACAO_V1_V2.md`, seções 49-50.

## ✅ Corrigido — 8 achados de UI/UX via foto real do celular/navegador

Botão Compartilhar (aba Solar) invisível + redesenhado em pílula com ícone · card "Caixa Var." sempre verde mesmo negativo · lupa quase invisível na faixa 560-780px · "Ver Ciclo" vazando pra todas as abas (movido pra dentro de `#painel`) · F5 sempre voltava pro Painel sem lembrar a aba · espaço vazio acima do menu de abas · Busca Global não achava "PIB" (indexador só olhava o 1º irmão da seção) · card "PIB Wallace (metodologia antiga)" removido da tela.

## ✅ Corrigido — performance de boot (~500ms) + atualização por aba

Boot: 6 módulos finais paralelizados com `promocoes-financeengine.js` (antes esperavam ele terminar). Troca de aba: decisão tomada com o usuário — recarrega (reaproveitando o F5) só se passou +5min desde o último boot, não a cada clique.

## Pendências antigas, sem decisão do usuário ainda

| Item | Nota |
|---|---|
| Abas cortando/travando ao rolar no mobile | Usuário nunca respondeu ao pedido de print/gravação, não investigado |
| 3 transações LRW/LRV sem dono (R$282,71) | Colisão de `tx_legado` de sessão anterior (TX000200/203/204/205/206), documentada em `hydrate-onda3-lrwlrv.js` — só o usuário pode dizer de quem são |
| Cartões — classificação retroativa completa + totais via Pluggy | Frente aberta nesta sessão, não terminada — ver seção acima |

## Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
4. Se continuar Cartões: ler seção 49-50 de `PLANO_UNIFICACAO_V1_V2.md` primeiro — já tem convenção de registro definida (não reinventar), e o cuidado de sempre checar `vw_saldo_v2_por_caixa` antes/depois de qualquer INSERT/UPDATE em massa em `transacoes` (regressão real já aconteceu uma vez).
