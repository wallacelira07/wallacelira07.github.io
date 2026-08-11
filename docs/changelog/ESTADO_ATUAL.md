# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 11/08/2026, fim de sessão muito longa (adequação consórcios/LREI, encerramento formal da migração V1→V2, auditoria de prontidão operacional, 2 rodadas de hardening de segurança, varredura final de fechamento). Tudo commitado e pushed (branch `main`, `wallacelira07.github.io`), working tree limpo. Sessão inteira sem acesso a login real — nenhuma mudança visual foi conferida no navegador.

## 🎯 Regras permanentes desta sessão (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada.** `wallace_dados` não recebe mais nenhuma escrita (confirmado por SQL, `pg_proc`, 0 funções escrevem nela). V1 é legado/fallback. Ver `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` seção 52-54.
2. **Mastercard Black e Caixa Mastercard/Infinite** — investigados, causa raiz identificada, formalizados como exceção. Não reabrir. Ver seção 51 do mesmo documento.
3. **Hardening de segurança concluído em 2 rodadas** (mesmo dia). 0 erros (`ERROR`) nos advisors do Supabase. Ver `docs/decisions/HARDENING_SEGURANCA_PRODUCAO.md`.
4. **`wallace_dados`/`VARS` (V1) não é fonte de verdade** — regra de sessões anteriores, continua valendo.

## ✅ Concluído nesta sessão

1. **Onda 9** — LRS/LRR/LRCON/LRDOA (4 tabelas do Livro Razão) migradas de HTML estático pra Supabase ao vivo.
2. **Adequação dos consórcios Porto** — saem do cartão, viram boleto pago em dinheiro pela Caixa Boletos (dia 15); LREI0005 cobre o 1º mês de transição; aporte da Caixa Boletos sobe de R$2.600 pra R$4.550,77.
3. **Caixa Mastercard/Infinite corrigida** — 2 saídas de pagamento de fatura que faltavam + bug de juros duplicados (mesmo padrão já visto na Caixa Wärtsilä).
4. **Gap do Mastercard Black (R$2.678,41) explicado** — causa raiz é janela de fatura real ≠ ciclo interno do app, não erro de dado. 16 transações reais tiveram `cartao_id` corrigido (cartão aposentado → ativo).
5. **Correção de UX**: site abrindo na aba Painel em vez do Dashboard numa entrada nova (não só F5) — corrigido via Performance Navigation Timing API.
6. **Migração V1→V2 encerrada formalmente** — checklist de encerramento, backlog não-bloqueador documentado, aprovação explícita do usuário registrada.
7. **Auditoria de prontidão operacional completa** — 40+ itens avaliados por domínio (arquitetura, financeiro, solar, automações, segurança, performance), nota geral, veredito.
8. **Hardening de segurança, rodada 1**: 5 RPCs `SECURITY DEFINER` ganharam checagem de auth; RLS habilitado em 2 tabelas novas; `REVOKE` de INSERT/UPDATE/DELETE/TRUNCATE de `anon`/`authenticated` em TODAS as ~43 tabelas/views + `DEFAULT PRIVILEGES` corrigido na raiz (176 concessões → 0).
9. **Hardening de segurança, rodada 2**: 2 views `SECURITY DEFINER` convertidas pra `SECURITY INVOKER`; `search_path` explícito nas últimas 2 funções; painel novo "Saúde Operacional" (tabela `execucoes_jobs` + heartbeat nos 4 scripts Python agendados); confirmado que a proteção de leitura solar implausível já existia; checklist oficial de novas Ondas criado; decisão de manter cron-job.org com monitoramento (não migrar pra Supabase Cron agora).
10. **Varredura final de fechamento**: TODO/FIXME/HACK no código (zero ocorrências reais — só falsos positivos da palavra "TODOS"), triggers (11, todos revisados, nenhum problema), RLS sem policy (1 tabela, `solar_compartilhamentos`, deny-by-default intencional, seguro), advisors de performance (25 FKs sem índice + 23 índices não usados, ambos INFO, esperado pro volume atual — ~300 linhas em `transacoes`), plano do projeto Supabase confirmado **free tier** (sem backup/PITR automático — ver pendência abaixo).

## ⚠️ Único risco remanescente real, não mitigado

**Backup/recuperação**: o projeto Supabase está no plano **free**, que não inclui backup automático nem Point-in-Time Recovery. Não existe hoje nenhum procedimento de backup/restore validado (nem manual, nem automatizado) para os dados financeiros reais do sistema. Isso não foi corrigido nesta sessão — exigiria decisão do usuário (upgrade de plano pago, ou implementar rotina de export manual/agendado) antes de qualquer ação. Ver `docs/decisions/HARDENING_SEGURANCA_PRODUCAO.md` seção de fechamento final.

## Pendências antigas, sem decisão do usuário ainda

| Item | Nota |
|---|---|
| Visa Infinite — cobertura baixa de `cartao_id`/histórico | Congelado por decisão explícita, não mexer sem evidência nova |
| Backup/restore (ver acima) | Precisa decisão do usuário: upgrade de plano ou rotina manual |
| Limiares do painel de Saúde Operacional | Estimados, não calibrados contra execução real ainda (vão se autocorrigir com o tempo) |

## Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa. `__V` atual: `20260811-33`.
4. **Nenhuma mudança desta sessão foi testada em navegador real** (sem login) — pedir confirmação visual do usuário na próxima sessão antes de considerar qualquer item "confirmado funcionando", especialmente o painel de Saúde Operacional (novo) e a correção da aba de entrada.
