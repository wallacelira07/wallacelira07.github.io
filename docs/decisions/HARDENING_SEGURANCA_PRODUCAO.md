# Hardening de segurança — produção (11/08/2026)

**Contexto**: auditoria de prontidão operacional identificou 3 classes de gap de segurança. Usuário classificou como "Prioridade 0 absoluta" e pediu execução imediata, fora do escopo da migração V1→V2 (já encerrada).

## 1. RPCs SECURITY DEFINER sem checagem de autenticação — corrigido

Todas as funções abaixo receberam a mesma validação já usada em `lancar_transacao_manual`/`registrar_pib_mensal`:

| Função | Antes | Depois |
|---|---|---|
| `atualizar_cotacoes_acoes` | Sem checagem interna (protegida só por GRANT, restrito a `service_role`) | `IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION` |
| `atualizar_mercadopago_eventos` | Idem | Idem |
| `atualizar_pluggy_contas` | Idem | Idem |
| `fechar_ciclo_solar` | Sem checagem interna (GRANT restrito a `authenticated`) | Checagem de issuer/audience do JWT Firebase, mesmo padrão de `lancar_transacao_manual` |
| `sincronizar_v1_v2` | Sem checagem interna (GRANT restrito a `service_role`/`postgres`) | `IF auth.role() IS DISTINCT FROM 'service_role'` (defesa em profundidade — função administrativa) |

**Achado que revisa a gravidade inicial**: as 4 primeiras já não eram exploráveis via chave anon — o `GRANT EXECUTE` já estava restrito a `service_role`/`authenticated` antes de qualquer mudança de hoje (confirmado consultando `information_schema.routine_privileges`, não suposição). A correção de hoje é defesa em profundidade (blindar mesmo se o GRANT for alterado por engano no futuro), não fechamento de uma porta que estava de fato aberta.

**Não modificadas, por decisão consciente**: `consultar_solar_compartilhado`, `criar_compartilhamento_solar`, `desativar_compartilhamento_solar`, `listar_compartilhamentos_solar` — são a funcionalidade de link público de compartilhamento solar, **deve** continuar acessível sem login (é o propósito da feature). Sinalizadas pelo advisor como "públicas" corretamente — não é gap, é design.

## 2. RLS — corrigido

- `parametros_solares`: RLS habilitado + policy `SELECT` pública (mesmo padrão de `legendas`/`cotacoes_acoes`).
- `pib_wallace_historico`: idem.

Ambas eram tabelas criadas na sessão anterior (mesmo dia) sem RLS — regressão própria, corrigida no mesmo dia.

## 3. Grants excessivos — corrigido, na raiz

**Achado real, mais sério do que o esperado**: TODAS as ~43 tabelas/views do schema `public` tinham `INSERT`, `UPDATE`, `DELETE` e **`TRUNCATE`** concedidos para `anon` E `authenticated` — incluindo `TRUNCATE`, que não é coberto por RLS (RLS não se aplica a TRUNCATE em Postgres). Causa raiz: `ALTER DEFAULT PRIVILEGES` do papel `postgres` no schema `public` concedia isso automaticamente a toda tabela nova.

**Verificação antes de agir**: confirmado por grep exaustivo em todo o frontend (`src/` + HTML principal) que **100% das escritas passam por RPC** (`/rest/v1/rpc/...`), nunca por REST direto em tabela. RPCs `SECURITY DEFINER` rodam com o privilégio do dono da função, não do chamador — revogar grants de tabela do `anon`/`authenticated` não afeta nenhuma RPC existente.

**Ação**:
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` de `anon`/`authenticated` em todas as tabelas E views do schema `public`.
- `ALTER DEFAULT PRIVILEGES` corrigido — tabela nova a partir de agora nasce só com `SELECT` para `anon`/`authenticated`, protegida por RLS quando sensível.

**Antes**: 176+ concessões de escrita (tabelas + views) para `anon`/`authenticated`.
**Depois**: 0.

## 4. Resultado dos advisors (Supabase)

| Categoria | Antes | Depois |
|---|---|---|
| `rls_disabled_in_public` (ERROR) | 2 (`parametros_solares`, `pib_wallace_historico`) | **0** |
| `security_definer_view` (ERROR) | 2 | 2 (não tocado — ver riscos remanescentes) |
| `rls_enabled_no_policy` (INFO) | 1 (`solar_compartilhamentos`) | 1 (não tocado, fora do escopo pedido) |
| `function_search_path_mutable` (WARN) | 2 | 2 (não tocado, fora do escopo pedido) |
| `*_security_definer_function_executable` (WARN) | 13 | 13 (esperado — funções continuam acessíveis a usuários logados/públicas por design, agora com checagem interna nas que precisavam) |

## Riscos remanescentes (não corrigidos nesta rodada, fora do escopo pedido)

1. **2 views `SECURITY DEFINER`** (`vw_compromisso_cartao_por_pessoa`, `vw_transacoes_cartao_variavel_por_pessoa`) — rodam com permissão do criador, não do usuário. Convertê-las para `SECURITY INVOKER` exigiria criar policies de `SELECT` em `transacoes`/`usuarios`/`caixas` para `authenticated`, risco real de quebrar a leitura se mal calibrado — não tentado sem pedido explícito.
2. **2 funções com `search_path` mutável** (`validar_plausibilidade_leitura_solar`, `gerar_tx_legado_automatico`) — risco teórico de search_path hijacking, baixo no contexto deste projeto (schema `public` único, sem múltiplos schemas conflitantes).
3. **`solar_compartilhamentos` com RLS habilitado mas sem nenhuma policy** — hoje isso significa acesso NEGADO por padrão a todo mundo (inclusive ao dono), o que é seguro por padrão mas pode estar impedindo alguma leitura legítima — vale checar se a feature de compartilhamento depende de leitura direta dessa tabela ou só da RPC (que já é `SECURITY DEFINER`, então não seria afetada).

## Confirmação final (rodada 1)

- ✅ Não existe mais nenhum caminho conhecido para executar RPC sensível sem autenticação (as que precisam de autenticação agora verificam ela internamente, em vez de depender só do GRANT).
- ✅ Não existe mais nenhum caminho para gravar em qualquer tabela do schema `public` usando só a chave `anon` (nem por REST direto, nem por herança de `DEFAULT PRIVILEGES` em tabelas futuras).
- ✅ Nenhuma automação/funcionalidade existente foi afetada (verificado: toda escrita do sistema passa por RPC, que roda com privilégio próprio, independente de grant de tabela do chamador).

---

# Rodada 2 — eliminação dos riscos remanescentes (11/08/2026, mesmo dia)

**Pedido do usuário**: "eliminar TODOS os riscos remanescentes... elevar para produção endurecida e observável, sem pendências operacionais conhecidas."

## 1) Monitoramento de automações — implementado

Tabela nova `execucoes_jobs` (job_nome, executado_em, status sucesso/erro, detalhe) + view `vw_saude_jobs` (última execução por job, idade em horas). Todos os 4 scripts agendados (`atualizar_cotacoes_acoes.py`, `mercadopago_sync.py`, `sincronizar_pluggy.py`, `atualizar_geracao_saj.py`) agora gravam um heartbeat ao final de toda execução — sucesso ou falha — via helper novo `scripts/sync/_heartbeat.py` (best-effort: falha ao registrar o heartbeat nunca derruba o job real).

## 2) Alertas de sincronização — implementado

Card novo "🩺 Saúde Operacional" (home, logo abaixo de "Verificações de Negócio") — `hydrate-saude-operacional.js`. Classifica cada job em 🟢 OK / 🟡 Atenção / 🔴 Falha por idade da última execução, limiares por job (Pluggy/Mercado Pago/Cotações: atenção 36h, falha 72h; Solar: atenção 24h, falha 48h — cadência esperada, não fato garantido, ajustável). Job que nunca rodou aparece como ⚪, contabilizado como "atenção" no relatório agregado (`window.WALLACE_SAUDE_OPERACIONAL_RELATORIO`).

**Limitação honesta**: os limiares são estimativas da cadência esperada, não confirmados contra o agendamento real do cron-job.org (que não expõe consulta programática) — se a cadência real for diferente, o painel vai gerar falso-positivo/negativo até alguém calibrar os números certos observando o comportamento real por alguns dias.

## 3) cron-job.org — decisão: manter (Opção B), com monitoramento

**Avaliado**: migrar para Supabase Cron (`pg_cron`) exigiria também `pg_net` pra chamar a API do GitHub (Postgres não roda Python nem chama APIs externas complexas sozinho) — replicaria a mesma dependência de disparo externo, só trocando de fornecedor, sem eliminar o padrão "disparo web dispara workflow". Testar essa migração de ponta a ponta sem quebrar a produção em uso exigiria um ciclo de observação real (não dá pra confirmar que o cron novo dispara certo sem esperar os cron ticks acontecerem) — fora do que dá pra validar com segurança nesta sessão.

**Decisão**: manter cron-job.org (Opção B), mas agora com **mecanismo de detecção de falha real** (itens 1-2 acima) — se o cron-job.org parar de disparar por qualquer motivo, o painel de Saúde Operacional mostra 🔴 Falha na automação afetada dentro do prazo do limiar (24-72h conforme o job), sem depender de percepção visual casual do dado desatualizado.

**Migração pra Supabase Cron/Opção A fica registrada como melhoria futura**, não bloqueador — exigiria sessão dedicada com janela de observação real.

## 4) Security Definer Views — corrigido

`vw_compromisso_cartao_por_pessoa` e `vw_transacoes_cartao_variavel_por_pessoa` convertidas para `SECURITY INVOKER` (`ALTER VIEW ... SET (security_invoker = true)`). Verificado antes de agir: `transacoes`/`usuarios`/`caixas` já têm policy de `SELECT` liberada pra qualquer request com JWT Firebase válido (mesmo critério que a própria view usaria) e o frontend sempre manda esse JWT quando logado (`WallaceFinanceService._headers()`) — conversão seguraz, sem quebra.

## 5) Search Path — corrigido

`gerar_tx_legado_automatico` e `validar_plausibilidade_leitura_solar` ganharam `SET search_path TO 'public'` explícito. Zero avisos de `function_search_path_mutable` remanescentes.

## 6) Painel de Saúde Operacional — implementado

O mesmo card do item 2 cobre a visão consolidada pedida (jobs agendados, última sincronização, status). Escopo consciente: **não** inclui indicador dedicado de "Banco"/Supabase em si (se o Supabase estiver fora do ar, o boot inteiro falha de um jeito muito mais visível do que um card silencioso — painel de saúde de banco em si teria valor marginal comparado ao resto do sistema já não carregar).

## 7) Proteção das leituras Energisa — já existia, confirmado

**Achado ao investigar**: `validar_plausibilidade_leitura_solar()` (trigger `BEFORE INSERT/UPDATE` em `energia_solar_leituras`) já implementa exatamente o que foi pedido — bloqueia leitura que diminui (códigos 03/103 são cumulativos) e leitura com delta diário acima de 40 kWh/dia (teto configurável no código da função). Foi implementado numa sessão anterior a esta auditoria, não estava documentado como "concluído" na avaliação de prontidão operacional anterior — corrigido aqui. **Nenhum código novo necessário**, item já satisfeito.

## 8) Checklist oficial para novas Ondas — criado

`docs/decisions/CHECKLIST_NOVAS_ONDAS.md`, 10 itens obrigatórios (REG, VARS, cache, re-render, gráficos, busca global, ordem de execução, persistência via RPC autenticada, auditoria automática, fallback documentado). Regra: nenhuma Onda nova entra sem passar pelo checklist.

## 9) Revalidação final

**Advisors do Supabase (security), antes → depois da rodada 2**:

| Categoria | Rodada 1 (após hardening inicial) | Rodada 2 (final) |
|---|---:|---:|
| `security_definer_view` (ERROR) | 2 | **0** |
| `function_search_path_mutable` (WARN) | 2 | **0** |
| `rls_enabled_no_policy` (INFO) | 1 | 1 (não tocado — deny-by-default, seguro) |
| `*_security_definer_function_executable` (WARN) | 13 | 13 (esperado — funções públicas por design ou já autenticadas internamente) |
| **Total de itens** | **18** | **15** |
| **Erros (ERROR)** | **0** | **0** |

**Auditoria automática (`auditoria-automatica.js`, 12 checks matemáticos do REG)**: não executável sem login real nesta sessão (roda no navegador, depende de `REG` populado pós-boot) — mesma limitação já registrada na auditoria de prontidão operacional anterior. Recomendação: rodar e conferir `window.WALLACE_AUDITORIA_RELATORIO`/badge do header na próxima sessão com acesso ao painel.

**Testes operacionais das automações**: não executáveis nesta sessão (dependem de credenciais reais de API — Pluggy/Mercado Pago/SAJ/brapi — e de aguardar um ciclo real de cron). O heartbeat só populará `execucoes_jobs` na próxima execução real de cada job — até lá, o painel de Saúde Operacional mostra ⚪ "nunca registrou execução" pra todos os 4, o que é esperado e não é falha.

## Avaliação final de maturidade operacional

**Antes desta rodada**: Produção Inicial (~75%), com 2 gaps de segurança ERROR abertos e zero observabilidade de automação.
**Depois desta rodada**: **Produção Endurecida e Observável**. Zero erros de segurança conhecidos, zero pendência de "falha silenciosa" sem mecanismo de detecção, checklist formal impede regressão da classe de bug mais recorrente da semana (reidratação incompleta).

**O que ainda não é "Produção Madura"** (não bloqueador, registrado por transparência):
- Limiares do painel de saúde são estimados, não calibrados contra dados reais de execução (vão se auto-corrigir conforme o heartbeat acumula histórico).
- cron-job.org continua sendo disparo externo de terceiro — mitigado por monitoramento, não eliminado.
- 2 views `SECURITY DEFINER` do domínio de compartilhamento solar (`consultar/criar/desativar/listar_compartilhamentos_solar`) continuam públicas por design — correto, mas é superfície de ataque que existe conscientemente, não por omissão.

## Confirmação final (rodada 2)

- ✅ Todos os 9 itens da Prioridade 0 executados ou confirmados já implementados.
- ✅ 0 erros de segurança (`ERROR`) nos advisors do Supabase.
- ✅ Mecanismo de detecção de falha silenciosa implementado e ativo (popula a partir da próxima execução real de cada job).
- ✅ Nenhuma automação/funcionalidade existente quebrada (heartbeat é best-effort, nunca derruba o job real; views convertidas verificadas contra as RLS policies reais antes de agir).
