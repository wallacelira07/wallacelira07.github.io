# Backup / Restore (11/08/2026)

**Contexto**: último risco operacional real identificado na auditoria de prontidão (`HARDENING_SEGURANCA_PRODUCAO.md`, fechamento rodada 2) — projeto Supabase no plano **free**, sem backup nativo nem PITR. Esta sessão fecha o gap.

## 0. Estado ao chegar nesta sessão (achado, não esperado)

Uma sessão anterior (mesmo dia, cortada por limite de uso antes de terminar) já tinha criado a infraestrutura — tabela `public.backups`, funções `criar_backup_completo()`/`restaurar_backup()`, job `pg_cron` diário — mas **nunca chegou a testar**. `ESTADO_ATUAL.md` ainda registrava backup como "não corrigido". Ao investigar antes de assumir que era só burocracia pendente, achei que a implementação existia mas estava **quebrada silenciosamente**:

- `criar_backup_completo()` exigia `auth.role() = 'service_role'` — mas o `pg_cron` executa direto no banco, sem passar pelo PostgREST, então não existe JWT nem claim de role nesse contexto (`auth.role()` retorna `NULL`, não `'service_role'`). **O próprio job agendado (`backup-diario-completo`, `0 6 * * *`) nunca teria conseguido gravar um backup.**
- Confirmado ao vivo: `cron.job_run_details` vazio (job criado depois das 06:00 UTC de hoje, ainda não tinha dado sua primeira volta) e uma chamada manual da função (mesmo contexto do MCP, fora do PostgREST) falhava com `nao autorizado`.
- Além disso, `criar_backup_completo`/`restaurar_backup` tinham `EXECUTE` concedido a `anon` e `authenticated` — a única proteção real era o check interno (que estava quebrado). Confirmado pelo Security Advisor (4 `WARN`: `anon_security_definer_function_executable` × `authenticated_security_definer_function_executable`, para as 2 funções).

## 1. Correção aplicada

Migration `corrige_backup_permite_cron_e_revoga_grants_publicos`:

- Trocado o check de `auth.role() IS DISTINCT FROM 'service_role'` (bloqueia tudo que não é PostgREST) para `auth.role() IN ('anon','authenticated')` (bloqueia só quem realmente não deveria chamar; contexto direto de banco — cron, SQL editor, service key — passa).
- `REVOKE EXECUTE ON FUNCTION criar_backup_completo(), restaurar_backup(uuid, boolean) FROM anon, authenticated` — proteção estrutural (grant), não só checagem em runtime. Fecha os 4 `WARN` do advisor.

## 2. Validação real (não suposição)

- Chamada manual de `criar_backup_completo()` **funcionou**: backup gravado com 42 tabelas, 328 transações (bate exato com `SELECT count(*) FROM transacoes` ao vivo), 0 erro, ~1MB, heartbeat gravado em `execucoes_jobs` como `sucesso`.
- Restore validado **sem tocar em produção**: reidratei o JSON do backup de `transacoes` numa tabela `TEMP` usando a mesma técnica de `restaurar_backup` (`jsonb_populate_recordset`), comparei contagem de linhas E soma de `valor` contra a tabela real — idênticos. Não executei `restaurar_backup()` de verdade contra produção porque é uma operação destrutiva (apaga e reinsere todas as tabelas) e o plano free não tem branch/staging pra testar isolado — o roundtrip em `TEMP` prova que o mecanismo de reidratação funciona para o tipo de dado real (uuid, timestamptz, jsonb, numeric) sem correr esse risco.
- Advisors revalidados: os 4 `WARN` relacionados a backup desaparecem da lista. Nenhum `ERROR` antes ou depois.
- RLS: 43/43 tabelas do schema `public` com RLS habilitado (`backups` incluída — sem policy, deny-by-default intencional, mesmo padrão já aceito para `solar_compartilhamentos`).

## 3. Comparação objetiva — plano pago vs solução própria

| | A) Upgrade Pro + PITR | B) Backup próprio (implementado) |
|---|---|---|
| Custo | US$25/mês (Pro) + US$100/mês (PITR 7 dias) = **US$125/mês mínimo** — PITR nunca vem incluído no Pro | **US$0** |
| Esforço | Upgrade de plano (imediato) | Já implementado e testado nesta sessão |
| Retenção | Pro sozinho: 7 dias de backup diário. PITR: 7/14/28 dias conforme o tier pago | 14 backups diários (~14 dias), configurável trocando o `LIMIT 14` na função |
| RPO (perda máxima de dado) | Pro: ~24h. PITR: segundos/minutos | ~24h (cadência do cron diário) |
| RTO (tempo de recuperação) | Restauração pelo painel Supabase, minutos, processo gerenciado pela Supabase | Manual via SQL (`restaurar_backup`), minutos — testado o mecanismo, não o restore completo ao vivo (ver seção 5) |
| Complexidade operacional | Baixa — Supabase cuida de tudo | Média — depende do cron `pg_cron` continuar ativo e de alguém rodar `restaurar_backup` corretamente quando precisar |
| Risco residual | Backup fora da mesma instância/projeto (proteção real contra perda catastrófica do projeto) | Backup vive **dentro do mesmo banco** — não protege contra perda do projeto inteiro (exclusão da conta, falha catastrófica da instância) |

**Recomendação única**: manter a solução própria (B), já implementada e validada, sem custo. Ela cobre o risco real e prioritário (erro humano, bug de dado, `DELETE`/`UPDATE` incorreto — os incidentes reais que já aconteceram neste projeto, ex. leitura solar de 08/08, duplicidade de juros). Não recomendo o upgrade agora — US$125/mês é desproporcional ao estágio do projeto (uso pessoal, ~300 transações) para ganhar uma proteção (backup fora da instância) que tem probabilidade baixa de ser o modo de falha real. Se o projeto crescer para operação crítica de terceiros ou o valor protegido justificar, reabrir essa decisão.

## 4. Procedimento de restore (documentado, passo a passo)

**Pré-requisito**: acesso de `service_role` (chave de serviço) ou execução direta no SQL editor do Supabase — nunca disponível para `anon`/`authenticated` (bloqueado por grant e por check interno).

1. Listar backups disponíveis:
   ```sql
   select id, criado_em, tamanho_bytes, erro from public.backups order by criado_em desc;
   ```
2. Escolher o `id` do backup mais recente **anterior** ao momento do problema (nunca o mais recente por padrão — se o dado ruim já foi gravado, o backup de agora também pode conter o erro).
3. (Opcional, recomendado) Inspecionar o conteúdo antes de restaurar, ex.: conferir uma tabela específica:
   ```sql
   select jsonb_array_length(conteudo->'transacoes') from public.backups where id = '<id>';
   ```
4. Restaurar (operação destrutiva — apaga e reinsere TODAS as tabelas capturadas no backup):
   ```sql
   select public.restaurar_backup('<id>', true);
   ```
   Retorna um relatório JSON com a contagem de linhas restauradas por tabela (ou `'ERRO: ...'` por tabela, se alguma falhar — as demais continuam).
5. Conferir o resultado: comparar contagens-chave (ex. `select count(*) from transacoes`) contra o esperado pelo relatório do passo 4.
6. Bumpar `__V` no HTML principal e pedir pro usuário validar visualmente no navegador antes de considerar encerrado.

**RTO estimado**: minutos — o gargalo é o processo humano (achar o backup certo, decidir se é seguro restaurar), não o SQL em si (reidratação de ~1MB/42 tabelas é praticamente instantânea, confirmado pelo teste da seção 2).
**RPO estimado**: até ~24h (cadência do cron diário, `0 6 * * *` UTC = 03:00 America/Sao_Paulo).

## 5. Risco residual (honesto, não maquiado)

1. **Restore completo nunca foi executado de ponta a ponta contra dados reais** — só o mecanismo de reidratação foi validado (seção 2), por ser destrutivo e não haver ambiente de staging no plano free. Se o dia chegar de precisar restaurar de verdade, a primeira execução real será a primeira prova de fogo do procedimento completo (não do mecanismo, que já está provado).
2. **Backup vive dentro do mesmo projeto/instância** — não protege contra perda do projeto Supabase inteiro (exclusão de conta, catástrofe de infraestrutura do provedor). Mitigação futura de baixo custo: exportar o `conteudo` do backup mais recente periodicamente para um local fora do Supabase (ex. Google Drive, já usado pelo projeto) — não implementado nesta sessão, não pedido.
3. **Cron ainda não teve sua primeira execução agendada real** (job criado hoje depois das 06:00 UTC) — a próxima execução automática será amanhã de manhã (~03:00 horário de Brasília). Vale conferir `execucoes_jobs`/`backups` amanhã pra confirmar que rodou sozinho, sem intervenção manual.
4. **Retenção de 14 dias** — se um problema de dado for descoberto mais de 14 dias depois de acontecer, não há mais backup daquele ponto. Aceitável para o padrão de uso atual (problemas de dado neste projeto até hoje foram descobertos em dias, não semanas).
