# Regressão de segurança nº 2: view SECURITY DEFINER nova + 2 tabelas sem RLS (22/08/2026)

**Contexto**: achado durante uma sessão de continuidade genérica (usuário pediu "se atualize nos documentos do projeto e dê continuidade até finalizar"), não durante investigação de segurança dedicada — rodei `get_advisors(type=security)` como checagem de rotina (mesma recomendação do próprio MCP do Supabase) e apareceram 3 `ERROR`. Mesma classe de regressão já documentada em [`REGRESSAO_SECURITY_DEFINER_VIEWS_CARTAO.md`](REGRESSAO_SECURITY_DEFINER_VIEWS_CARTAO.md) (12/08/2026), mas em objetos diferentes, criados depois daquela correção.

## 1. O que foi encontrado

`get_advisors(security)` acusou 3 `ERROR`:

| Objeto | Problema | Linhas expostas a `anon` (confirmado ao vivo, sem JWT) |
|---|---|---|
| `vw_comprometido_cartao_por_caixa` | `SECURITY DEFINER` (sem `security_invoker=true`) | 19 |
| `parcelas_historico_ciclo` | RLS nunca foi habilitada na tabela | 17 |
| `regras_lancamento_estabelecimento` | RLS nunca foi habilitada na tabela | 3 |

Confirmado com `set local role anon; select count(*) from ...` antes da correção — **dado financeiro real (cartão) acessível sem login, só com a chave pública `anon` visível no JS do site.**

## 2. Por que aconteceu de novo

A causa raiz é a mesma já registrada em 12/08: `CREATE VIEW`/`CREATE TABLE` novos não herdam automaticamente os endurecimentos já aplicados em outros objetos, e não existe (ainda) uma checagem automática (CI ou script de sessão) que rode `get_advisors(security)` e falhe se aparecer `ERROR` novo. `vw_comprometido_cartao_por_caixa` é a view por trás do card "Déficit caixas sem LREI" (lida direto pelo frontend, `app.js:569`) — criada depois da correção de 12/08, sem repetir o `security_invoker=true`. `parcelas_historico_ciclo`/`regras_lancamento_estabelecimento` nunca tiveram RLS habilitada desde a criação.

## 3. Investigação antes de corrigir (pedido explícito do usuário)

Antes de aplicar qualquer DDL, o usuário pediu validação completa — feita e documentada:

- **Políticas RLS existentes**: `caixas`/`transacoes` (usadas pela view) já tinham política de leitura (`Leitura restrita a login Firebase valido`, exige `auth.jwt()` com `iss`/`aud` do Firebase). `parcelas_historico_ciclo`/`regras_lancamento_estabelecimento` não tinham nenhuma.
- **Uso real em código vivo**: grep completo em `src/**` (frontend) e no corpo de toda função RPC do banco (`prosrc ilike '%nome_tabela%'`).
  - `regras_lancamento_estabelecimento`: **zero referências** em qualquer lugar — frontend ou RPC. Tabela existe (com FKs pra `caixas`/`cartoes`/`usuarios`, 3 linhas) mas nunca foi conectada a nenhuma feature. Seguro travar sem política nenhuma.
  - `parcelas_historico_ciclo`: usada por 3 funções — `avancar_parcelas_ciclo_mensal`/`avancar_parcelas_mp_ciclo_mensal` (pg_cron, rodam como `postgres`) e **`rpc_provmp_por_ciclo`** (chamada de dentro de `rpc_necessidade_total_bruta`, que É lida pelo frontend via `aplicar-rpc-necessidade.js` — Sub-fase B, fonte oficial em produção desde hoje).
  - **Achado crítico que mudou o desenho da correção**: `rpc_necessidade_total_bruta` e `rpc_provmp_por_ciclo` são `SECURITY INVOKER` (`prosecdef=false`), ou seja, rodam com o privilégio de quem chama — o usuário autenticado no navegador, não o dono da função. Se eu só tivesse feito `ENABLE ROW LEVEL SECURITY` em `parcelas_historico_ciclo` sem adicionar uma política de leitura pra `authenticated`, teria quebrado a cadeia da Sub-fase B na hora.
  - `postgres` (dono das 2 tabelas, usado pelos cron jobs) e `service_role` têm `rolbypassrls=true` — confirmado que os cron jobs de virada de ciclo não são afetados por nenhuma política nova.

## 4. Correção aplicada (22/08/2026, migration `correcao_security_definer_view_e_rls_desabilitada_22082026`)

```sql
ALTER VIEW public.vw_comprometido_cartao_por_caixa SET (security_invoker = true);

ALTER TABLE public.parcelas_historico_ciclo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura restrita a login Firebase valido" ON public.parcelas_historico_ciclo
  FOR SELECT
  USING (
    (select auth.jwt()) IS NOT NULL
    AND ((select auth.jwt()) ->> 'iss') = 'https://securetoken.google.com/sistema-wallace-lira'
    AND ((select auth.jwt()) ->> 'aud') = 'sistema-wallace-lira'
  );

ALTER TABLE public.regras_lancamento_estabelecimento ENABLE ROW LEVEL SECURITY;
-- sem política: zero uso confirmado, tranca pra anon/authenticated, só postgres/service_role acessam.
```

## 5. Validação pós-correção (evidência real, Nível A)

1. `get_advisors(security)`: 3 `ERROR` → **0 `ERROR`**.
2. `anon` (sem JWT) nos 3 objetos: 19/17/3 linhas → **0/0/0**.
3. `authenticated` com JWT Firebase válido simulado (`set local request.jwt.claims`): **idêntico ao pré-fix** — 19 caixas comprometidas, 17 parcelas históricas, 19 caixas, 444 transações.
4. `rpc_provmp_por_ciclo('2026-07')` → R$ 403,11 (idêntico ao já validado). `rpc_necessidade_total_bruta('2026-07')` → `cobertura_garantida=1339,16` (idêntico).
5. UI ao vivo (reload, login real `wallace.termica@gmail.com`): Sistema Íntegro, 444/444 categorizadas, `0 divergências` na auditoria automática, `[aplicar-rpc-necessidade] RPC aplicada como fonte oficial ... idêntica ao valor local`.
6. **Teste funcional completo pedido pelo usuário**: criar despesa via UI real (`+ Lançar transação`) → "✓ Lançado e refletido no painel", cascata de recálculo completa sem erro. Registro de teste (`TX000380`, R$0,01, "TESTE VALIDACAO RLS 22/08 - APAGAR") confirmado e depois apagado via SQL direto (`origem='ajuste_manual'`, auditado em `audit_log`). Dashboards voltaram ao valor exato de antes do teste.
7. **Achado à parte, não é regressão**: o app não tem edição/exclusão genérica de transação via UI (confirmado no código — arquitetura de livro-razão, append-only; correções entram como novo lançamento de ajuste). Não há o que testar aí além do que já existia (Manejo/Movimentação, prompt-based, já validado antes desta correção).

## 6. Recomendação de prevenção (mesma da ocorrência de 12/08, ainda não implementada)

Ver seção 6 de [`REGRESSAO_SECURITY_DEFINER_VIEWS_CARTAO.md`](REGRESSAO_SECURITY_DEFINER_VIEWS_CARTAO.md) — a recomendação (checagem automática de `get_advisors(security)` antes de deploy) continua válida e agora tem 2 ocorrências reais reforçando a necessidade. Nenhuma automação foi implementada nesta correção também — só a correção pontual dos 3 objetos encontrados hoje.
