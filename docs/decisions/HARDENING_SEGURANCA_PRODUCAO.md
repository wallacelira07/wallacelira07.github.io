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

## Confirmação final

- ✅ Não existe mais nenhum caminho conhecido para executar RPC sensível sem autenticação (as que precisam de autenticação agora verificam ela internamente, em vez de depender só do GRANT).
- ✅ Não existe mais nenhum caminho para gravar em qualquer tabela do schema `public` usando só a chave `anon` (nem por REST direto, nem por herança de `DEFAULT PRIVILEGES` em tabelas futuras).
- ✅ Nenhuma automação/funcionalidade existente foi afetada (verificado: toda escrita do sistema passa por RPC, que roda com privilégio próprio, independente de grant de tabela do chamador).
