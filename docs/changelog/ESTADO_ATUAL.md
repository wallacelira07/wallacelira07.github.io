# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026. **Fase 5 (fechar o ciclo de gravação) — status: IMPLEMENTADA, aguardando validação operacional da UI.** HEAD `9cb1ed2`, tudo commitado e enviado — `git status` limpo.

## Mudança de prioridade nesta sessão

A fase de "migrações rápidas" (caçar consumidores de `wallace_dados` por baixo esforço) foi encerrada formalmente (ver bloco anterior desta seção, e `PASSAGEM_DE_TURNO.md` Bloco 33). Uma auditoria de prontidão operacional pedida pelo usuário encontrou que **leitura/consulta já está pronta** (Patrimônio, Solar, ROC, Investimentos, Livros Razão, Caixas, Parcelamentos, Reembolsos, Ciclo atual — todos V2, com as exceções formais já conhecidas), mas **a gravação não fechava o ciclo**: o formulário "＋ Lançar" gravava direto no Supabase (tabela `transacoes`), mas nada no painel visível se atualizava sozinho — a própria mensagem do sistema avisava isso. Caso real documentado desse problema: `TX000652` (PIX R$652), aprovado na Inbox e nunca lançado de fato no livro visível.

**Nova prioridade absoluta, substituindo a caça a consumidores**: Fase 5 — unificar "＋ Lançar"/Inbox com tudo que o usuário vê (livros, caixas, Resumo Executivo, Balanço, indicadores), sem depender de atualização manual da V1.

## Fase 5 — o que já foi fechado

**Achado estrutural que tornou isso simples** (confirmado direto no schema do Supabase antes de implementar, não suposto): `vw_saldo_v2_por_caixa` já é uma VIEW **live** — `saldo_inicial_ciclo + soma(transações do ciclo atual)`. Inserir uma transação nova na caixa certa já muda o saldo calculado pela view sozinho, sem nenhum SQL novo. O único motivo de o painel não refletir isso era que os módulos `hydrate-onda*.js` (que buscam essa view) só rodavam **uma vez, no boot**, e o cache em memória do `WallaceFinanceService` (`Map` sem TTL) segurava a resposta antiga.

**Implementado** (`src/app/app.js`, commit `7139966`): nova função `atualizarPainelAposLancamento()` — invalida o cache e re-roda os mesmos módulos V2 já existentes (Caixas Onda 1/2/3, Patrimônio, Wärtsilä/Reembolsos, LREI, Livro Razão, P2P, Parcelamentos), reaproveitando tudo que já existia (zero lógica de cálculo nova). Chamada automaticamente no fim do clique em "Salvar" do formulário "＋ Lançar", que agora só mostra "✓ Lançado e refletido no painel" depois que o refresh termina de verdade (`await`).

**Testado com evidência real (Nível A — consulta direta ao Supabase de produção, teste reversível)**: lançamento de teste de R$0,01 na Caixa Boletos via `select lancar_transacao_manual(...)` (mesma RPC do formulário) — saldo da view foi de R$1.488,42 (5 transações) para R$1.488,43 (6 transações), diferença exata de R$0,01. Transação removida em seguida (`DELETE`), saldo voltou a R$1.488,42 (5 transações) — reversão confirmada, zero resíduo. `audit_log` registrou o INSERT e o DELETE automaticamente com `origem='formulario'`. **Confirma as etapas 1-2 (inserção + view reage sozinha) com prova real de banco.**

**Ainda sem prova ao vivo (etapas 3-5: invalidação de cache, reexecução dos módulos, atualização do DOM)**: o ambiente de preview desta sessão não conseguiu abrir um navegador real (5 slots de preview ocupados por outras sessões simultâneas, em todas as tentativas). Essa parte foi verificada só por revisão manual de código (Nível B). **Pendência real para a próxima sessão ou para o próprio usuário**: testar o clique de "＋ Lançar" na UI de verdade e confirmar que o saldo muda na tela sem recarregar a página.

**Limitação conhecida, deliberadamente fora desta rodada**: Necessidade Total / Modo Operacional / Saldo do Ciclo (topo do Resumo Executivo) continuam vindo de um snapshot do ciclo mantido à parte (`VARS.CICLO_SNAPSHOTS`), não são soma ao vivo de `transacoes`. Recalcular isso ao vivo é modelagem nova significativa — mesmo bloqueador técnico já identificado na investigação de Ciclo Snapshots Etapa 2. Uma compra lançada muda o saldo da caixa e o Balanço, mas não muda esses 3 números de topo. Usuário concordou explicitamente em deixar isso fora.

## Bloqueadores operacionais restantes, ordenados por impacto (pós-Fase 5)

Reclassificação pedida pelo usuário depois da prova de banco: **nenhum item da lista antiga que dependia da hipótese "lançamento não reflete no saldo" continua válido como bloqueador amplo** — isso foi resolvido para as caixas normais (a maioria das 18). O que resta é mais estreito:

1. **Validação visual da UI (não é bug, é confirmação pendente)** — a prova de banco (etapas 1-2) é forte evidência de que o resto funciona, mas o clique real na tela ainda não foi testado ao vivo nesta sessão (ambiente de preview bloqueado o tempo todo). Ação: usuário testar 1 lançamento real numa caixa normal (ex: Boletos) e conferir se o saldo muda sem reload.
2. **5 caixas com exceção formal (Caixa Lance + Manutenção + Saúde Família + PIX Geral Vanessa + Aniversário Júlio)** — continuam exibindo o valor V1 por decisão já tomada (divergência não resolvida, não reabrir). Efeito prático: registrar uma compra/pagamento contra uma DESSAS 5 caixas específicas grava normalmente no banco, mas o número na tela não se move — mesma classe do problema antigo, só que agora restrita a essas 5, não a todas.
3. **Cartões (Mastercard Black, Visa Infinite, Mercado Pago) não têm campo de lançamento manual no formulário "＋ Lançar"** — só entram por sincronização automática (Pluggy/Mercado Pago) ou triagem na Inbox. Coerente com a exceção formal já existente (headline total de cartão é sempre V1, regra de negócio "fatura sempre vence"), mas significa que "registrar uma compra no cartão" na hora, manualmente, não é uma ação suportada hoje — só caixas.
4. **Necessidade Total/Modo Operacional/Saldo do Ciclo não recalculam ao vivo** — aceito fora de escopo pelo usuário (modelagem própria de ciclo, não bug).

**Nenhum destes impede o uso diário do fluxo principal** (registrar compras/pagamentos em qualquer uma das ~13 caixas normais, acompanhar saldos/caixas/patrimônio/solar) — são recortes específicos, não uma barreira geral como antes da Fase 5.

## Pendência de segurança em aberto (não corrigir sem decisão do usuário)

`public.v1_v2_caixa_mapa` está com **RLS desabilitado** — exposta a leitura/escrita por qualquer chave anon (sinalizado pelo advisor do Supabase, re-confirmado nesta sessão). Não corrigido: habilitar RLS sem policy nova bloquearia todo acesso à tabela. Requer decisão do usuário sobre política de acesso antes de qualquer mudança.

## Métrica da fase de migrações rápidas (histórico, não é mais a prioridade)

| Grupo | Quantidade |
|---|---|
| Já removidos/religados à V2 | ~61 domínios/achados |
| Exceções formais (fora da métrica) | 5 — ver `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` |
| Remanescentes classificados (A/B/C/D por impacto operacional, não mais por esforço) | ~10-12 — nenhum impede uso diário hoje, exceto a lacuna de gravação que a Fase 5 está fechando |

Detalhe completo da classificação e dos padrões técnicos descobertos na fase anterior: `PASSAGEM_DE_TURNO.md`, Bloco 33.

## Protocolo de sessão nova

1. Este arquivo.
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente (Fase 5).
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir.
4. `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md` — plano futuro do domínio Solar (medidor Chint/SAJ adquirido 08/08/2026, ainda não instalado) — só documentação, nada implementado.
5. `docs/MANUAL_OPERACIONAL_AGENTES.md` — documento mestre.
6. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
7. **Primeira ação recomendada**: testar "＋ Lançar" numa UI real (navegador de verdade, não preview bloqueado) e confirmar que o saldo da caixa muda sem reload — fecha a validação que esta sessão não conseguiu completar.
8. Pendente do usuário (fora do alcance de qualquer agente): criar Project "Sistema Wallace Lira" em `wallace.termica@gmail.com`, anexar `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` como Project Knowledge.
