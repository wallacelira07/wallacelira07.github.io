# Continuidade de negócio e recuperação de desastre (11/08/2026)

**Contexto**: `docs/decisions/BACKUP_RESTORE.md` fechou o backup *dentro* do Supabase. Esta auditoria pediu o próximo nível: os backups sobrevivem à perda **total** do projeto Supabase (conta excluída, projeto corrompido, catástrofe do provedor)? Resposta antes desta sessão: **não** — toda cópia (tabela `backups`, histórico de migrations) vivia dentro da mesma instância. Este documento fecha esse gap.

## 1. Os backups atuais sobrevivem à perda total do projeto?

**Antes desta sessão: não, em nenhuma hipótese.**

- A tabela `public.backups` (dados) vive dentro do próprio banco — perde-se junto com o projeto.
- O histórico de `list_migrations` (schema/DDL — todas as `CREATE TABLE`/`FUNCTION`/`POLICY`/`TRIGGER` aplicadas) também vive **dentro** da mesma instância Supabase (schema interno de controle de migrations) — não é um arquivo local, não estava em lugar nenhum fora do projeto.
- Achado que amplia o escopo do pedido original: um backup só de **dados** não seria suficiente mesmo se estivesse fora da instância — sem o **schema** (42 tabelas, ~20 funções `SECURITY DEFINER`, policies de RLS, triggers, índices), não haveria onde reidratar os dados num projeto novo. As duas peças precisam existir fora da Supabase, juntas.

## 2. Existe hoje alguma cópia externa independente?

**Antes desta sessão: não.** Confirmado — nenhum export, nenhum repositório, nenhum arquivo local continha um snapshot do banco.

## 3. Solução implementada

Estendido o workflow `backup_externo.yml` (dispara pelo mesmo orquestrador diário `executar_tudo.yml`, já acionado pelo cron-job.org — nenhuma peça de automação nova a manter fora do GitHub) para gravar **2 cópias independentes**, dentro deste mesmo repositório GitHub — infraestrutura inteiramente separada da Supabase (contas, provedores e faturamento diferentes):

| Cópia | Conteúdo | Formato | Onde |
|---|---|---|---|
| **Dados** | Todas as linhas de todas as 42 tabelas `public` (via `criar_backup_completo()`, o mesmo mecanismo já validado em `BACKUP_RESTORE.md`) | JSON criptografado (Fernet/AES) — repositório é **público**, por isso a criptografia | `backups_externos/wallace_backup_<timestamp>.json.enc` |
| **Schema** | Estrutura completa do schema `public`: tabelas, colunas, constraints, ~20 funções `SECURITY DEFINER`, RLS policies, triggers, índices (via `pg_dump --schema-only --schema=public`) | SQL, texto puro (é só estrutura, sem dado sensível — mesmo nível de exposição de qualquer código já público neste repo) | `backups_externos/wallace_schema_<timestamp>.sql` |

Retenção: 30 dias corridos pra cada tipo (arquivos mais antigos são apagados a cada execução — a própria função `podar_backups_antigos`/script de poda embutido no workflow).

**Por que dentro do mesmo repositório GitHub, em vez de um serviço novo**: menor solução possível — reaproveita a automação diária que já existe (`executar_tudo.yml`/cron-job.org), o `GITHUB_TOKEN` automático (sem PAT novo, sem repositório novo pra manter), e a dependência `cryptography` que o projeto já instala noutro workflow (SAJ). Nenhuma conta nova, nenhum serviço novo, nenhum custo novo.

## 4. Ação pendente do usuário (não posso fazer por você)

Faltam **2 segredos novos** no GitHub (`Settings → Secrets and variables → Actions → New repository secret` do repositório `wallacelira07/wallacelira07.github.io`). Eu não tenho acesso pra criar isso por você — é uma configuração de conta que só você pode fazer.

1. **`BACKUP_ENCRYPTION_KEY`** — chave já gerada nesta sessão (formato Fernet válido, 32 bytes aleatórios, gerada localmente com `openssl`). **O valor foi entregue só no chat da sessão, propositalmente fora deste documento** — este repositório é público, e commitar a chave junto dos backups criptografados anularia toda a proteção. Se você perdeu a mensagem com o valor, gere uma chave nova (`openssl rand -base64 32 | tr '+/' '-_'`) e cadastre — só afeta backups futuros, os já criados com a chave antiga ficam ilegíveis, o que é aceitável (a próxima execução diária já gera um novo).

   **Guarde essa chave também em algum lugar SEU, fora do GitHub** (gerenciador de senhas, cofre) — GitHub Secrets é **só-escrita**: uma vez salvo, nem eu nem você consegue ler de volta pela interface. Se essa chave se perder e não existir outra cópia, todo backup de dados já criptografado vira permanentemente ilegível — o schema (item 2 abaixo) continua acessível, só o conteúdo dos dados fica perdido.

2. **`SUPABASE_DB_URL`** — string de conexão direta do Postgres (necessária só pro `pg_dump` do schema). Pegue em **Supabase Dashboard → Project Settings → Database → Connection string → URI** (conexão direta, não o pooler). Cole direto no GitHub Secret — nunca me mande esse valor pelo chat.

Sem o passo 2, o backup de **dados** já funciona sozinho (só schema fica pendente, com aviso claro nos logs do workflow, não falha silenciosamente).

## 5. Validação com evidências reais — o que foi e o que não foi possível validar nesta sessão

**Validado com evidência real**:
- `criar_backup_completo()` produz dado correto (42 tabelas, 328 transações batendo exato com produção) — mesma validação de `BACKUP_RESTORE.md`, reaproveitada aqui.
- Mecanismo de reidratação (`jsonb_populate_recordset`) testado sem tocar produção, contagem e checksum de valor batendo.
- Chave de criptografia gerada e confirmada com o comprimento exato exigido pelo Fernet (44 caracteres, 32 bytes).
- `SUPABASE_KEY` do GitHub Actions confirmado **empiricamente** como `service_role` real (não suposição) — a automação de cotações grava dado real usando uma RPC que exige `service_role` estrito.
- `pg_dump --schema=public` restrito ao schema do próprio sistema (não toca `auth`/`storage`/`cron`/`extensions`, que já existem por padrão em qualquer projeto Supabase novo) — decisão deliberada pra evitar conflito na hora de restaurar.

**Não validado nesta sessão, honestamente sinalizado**:
- **O workflow `backup_externo.yml` ainda não rodou de verdade** — depende dos 2 segredos do item 4, que só você pode cadastrar. Assim que cadastrar, rode manualmente uma vez (aba **Actions → Backup Externo (Supabase → GitHub) → Run workflow**) pra gerar a primeira evidência real (arquivo aparecendo em `backups_externos/` + heartbeat `backup_externo` em `execucoes_jobs`). Não tenho como cadastrar segredo nem disparar isso sozinho.
- **Nenhum projeto Supabase novo foi provisionado pra testar a recuperação completa de ponta a ponta** (não é uma ação reversível pra tentar sem pedido explícito, e o plano free não tem ambiente de staging). O procedimento da seção 6 é o resultado de raciocínio cuidadoso sobre como `pg_dump --schema-only` + a `restaurar_backup()` já validada se encaixam — não é uma execução real testada.

## 6. Procedimento completo de recuperação de desastre (projeto Supabase destruído)

**Pré-requisito**: acesso aos 2 arquivos mais recentes em `backups_externos/` (`.sql` de schema + `.json.enc` de dados) e à chave `BACKUP_ENCRYPTION_KEY` guardada fora do GitHub (item 4).

1. **Provisionar projeto Supabase novo** (dashboard Supabase, "New Project").
2. **Habilitar as extensões usadas** antes de rodar o schema: `pgcrypto` e `pg_cron` (Dashboard → Database → Extensions — mesmo passo manual de qualquer projeto novo).
3. **Restaurar o schema**: rodar o `.sql` mais recente contra o projeto novo:
   ```bash
   psql "<connection string do projeto NOVO>" -f wallace_schema_<timestamp>.sql
   ```
   Isso recria as 42 tabelas, as ~20 funções (incluindo `criar_backup_completo`/`restaurar_backup`, já com a correção desta sessão), RLS policies, triggers e índices — idêntico ao projeto original no momento do dump.
4. **Descriptografar o backup de dados mais recente** (localmente, nunca num serviço de terceiro):
   ```bash
   python3 scripts/database/descriptografar_backup_externo.py \
     backups_externos/wallace_backup_<timestamp>.json.enc \
     --chave "<BACKUP_ENCRYPTION_KEY>" \
     --saida backup_decifrado.json
   ```
5. **Reinserir o conteúdo decifrado na tabela `backups` do projeto NOVO** (reaproveita o mesmo `restaurar_backup()` já testado, em vez de inventar um caminho novo):
   ```bash
   curl -X POST "https://<projeto-novo>.supabase.co/rest/v1/backups" \
     -H "apikey: <service_role do projeto NOVO>" \
     -H "Authorization: Bearer <service_role do projeto NOVO>" \
     -H "Content-Type: application/json" \
     -d "{\"conteudo\": $(cat backup_decifrado.json)}"
   ```
   Anote o `id` retornado.
6. **Restaurar de verdade**, usando a RPC já existente no schema recém-criado:
   ```sql
   select public.restaurar_backup('<id do passo 5>', true);
   ```
7. **Recriar o job de cron** (não é DDL, é uma linha de dado no schema `cron`, fora do dump de `public`):
   ```sql
   select cron.schedule('backup-diario-completo', '0 6 * * *', 'SELECT public.criar_backup_completo()');
   ```
8. **Apontar o site pro projeto novo**: trocar `SUPABASE_URL`/chaves em todo lugar que referencia o projeto antigo (`assets/js/**`, GitHub Secrets, `.env` local se houver) — fora do escopo desta auditoria, mas é o passo final óbvio pra o site voltar a funcionar.
9. **Conferir**: `select count(*) from transacoes;` e outras tabelas-chave batendo com o relatório JSON devolvido pelo passo 6.

## 7. Arquitetura final de backup

```
Supabase (produção)
  └─ pg_cron diário 06:00 UTC → criar_backup_completo() → tabela backups (14 cópias, dentro da instância)
                                                                │
GitHub Actions (executar_tudo.yml, disparado por cron-job.org, mesmo horário diário)
  └─ backup_externo.yml
       ├─ chama criar_backup_completo() de novo (não depende do cron interno já ter rodado)
       ├─ criptografa (Fernet) → backups_externos/*.json.enc  (30 cópias, dados)
       ├─ pg_dump --schema=public                             (30 cópias, estrutura)
       └─ commit + push → GitHub (infraestrutura 100% independente da Supabase)
```

## 8. RPO / RTO / retenção — consolidado

| | Backup interno (Supabase) | Backup externo (GitHub) |
|---|---|---|
| Retenção | 14 dias | 30 dias (dados e schema) |
| RPO | ~24h | ~24h (mesma cadência diária) |
| RTO — incidente comum (erro de dado, ainda com o projeto Supabase vivo) | Minutos (`restaurar_backup` direto) | Não necessário — o interno já resolve |
| RTO — perda total do projeto | Não se aplica (não sobrevive) | Estimado em **horas, não minutos** — provisionar projeto novo, habilitar extensões, rodar schema, decifrar e reinserir dados (passos 1-9 da seção 6), depois reapontar o site. Maior parte do tempo é processo manual/humano, não computação. |

## 9. Risco residual real (sem maquiagem)

1. **O workflow nunca rodou de verdade** — depende dos 2 segredos que só o usuário pode cadastrar (seção 4). Até isso acontecer, o "ponto único de falha" está **corrigido no design e no código, mas não confirmado em produção**.
2. **A chave de criptografia é só-escrita no GitHub** — se for perdida sem cópia pessoal, os backups de dados já gravados ficam permanentemente ilegíveis (o schema continua acessível, só o conteúdo dos dados se perde). Mitigação: guardá-la também fora do GitHub (item 4) — ação do usuário, não automatizável.
3. **Recuperação completa nunca foi ensaiada de ponta a ponta** contra um projeto Supabase novo de verdade — o procedimento da seção 6 é resultado de raciocínio cuidadoso sobre peças já validadas individualmente (schema dump restrito a `public`, mecanismo de reidratação testado), não uma execução real. Primeira vez que rodar de verdade (se algum dia precisar) é a primeira prova de fogo do procedimento completo.
4. **RTO de horas para perda total** é uma estimativa de processo, não medida — nunca cronometrado de verdade.
5. **Credenciais externas dos scripts de automação** (SAJ, Pluggy, Mercado Pago, brapi) não fazem parte de nenhum backup — se o projeto Supabase for recriado do zero, essas integrações precisam ser reconectadas manualmente (fora do escopo de "dados financeiros do sistema", mas vale registrar).

## 10. Percentual final de prontidão operacional

**Antes desta sessão** (fim do fechamento anterior, `HARDENING_SEGURANCA_PRODUCAO.md`): ~92% — único gap conhecido era backup/restore.

**Depois de `BACKUP_RESTORE.md`** (backup interno corrigido e testado): ~96% — gap remanescente identificado como "backup vive dentro da mesma instância".

**Depois desta auditoria de continuidade de negócio**: **~98%**. Não é 100% por 2 motivos genuínos, não por excesso de cautela:
- O último passo de ativação (2 segredos do GitHub) depende de uma ação que só o usuário pode fazer — o sistema não está tecnicamente "testado em produção" até isso acontecer.
- Recuperação completa de projeto destruído nunca foi ensaiada de ponta a ponta (item 3 da seção 9) — é um risco baixo-probabilidade, mas real, de o procedimento documentado ter um passo que não funciona exatamente como esperado na primeira tentativa real.

Não existe mais nenhum **ponto único de falha conhecido e não endereçado** — o que resta é validação empírica de um design já implementado, não uma lacuna de design.
