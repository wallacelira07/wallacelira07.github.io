# Regressão de segurança: views de cartão voltaram a SECURITY DEFINER (12/08/2026)

**Contexto**: achado numa auditoria de prontidão operacional pedida pelo usuário (não durante trabalho de migração V1→V2, que já estava encerrada). A auditoria pediu verificação ao vivo, não repetição do que os documentos anteriores afirmavam — foi assim que a regressão apareceu.

## 1. O que aconteceu

`vw_compromisso_cartao_por_pessoa` e `vw_transacoes_cartao_variavel_por_pessoa` foram corrigidas para `SECURITY INVOKER` em 11/08/2026 (rodada 2 do hardening, ver `HARDENING_SEGURANCA_PRODUCAO.md`), com o resultado documentado como "0 erros" nos advisors do Supabase.

No mesmo dia, 2 migrations posteriores recriaram essas views para corrigir bugs de dado reais (filtro de `cartao_id`, criação da segunda view):

| Hora | Migration | Efeito colateral |
|---|---|---|
| 15:38 | `fix_vw_compromisso_cartao_por_pessoa_exige_cartao_id` | Recriou a view sem reaplicar `security_invoker=true` |
| 17:12 | `criar_vw_transacoes_cartao_variavel_por_pessoa` | Criada do zero sem `security_invoker=true` |

Nenhuma das duas sessões que rodaram essas migrations percebeu a regressão — o objetivo era corrigir dado, não segurança, e não havia checagem automática que acusasse a volta ao padrão `SECURITY DEFINER`.

## 2. Impacto real (confirmado, não hipotético)

Com `SECURITY DEFINER` + `SELECT` liberado para `anon` (grant que nunca foi revogado), as duas views bypassavam a RLS das tabelas de origem (`transacoes`, `caixas`, `usuarios`, `cartoes` — todas exigem JWT Firebase válido). Qualquer request usando só a chave pública `anon` do site (visível no JS do frontend) conseguia ler transação individual de cartão — nome, valor, data — sem login.

Confirmado ao vivo, antes da correção:
- `pg_class.reloptions` das duas views: `null` (sem `security_invoker=true`).
- `information_schema.role_table_grants`: `SELECT` concedido a `anon` e `authenticated` nas duas.

## 3. Correção aplicada (12/08/2026, mesma sessão da auditoria)

```sql
select set_config('audit.origem', 'correcao_security_definer_views_regressao', true);
ALTER VIEW public.vw_compromisso_cartao_por_pessoa SET (security_invoker = true);
ALTER VIEW public.vw_transacoes_cartao_variavel_por_pessoa SET (security_invoker = true);
```

## 4. Validação (evidência real, Nível A)

1. `pg_class.reloptions` das duas views, depois do `ALTER`: `["security_invoker=true"]` em ambas.
2. `get_advisors(type=security)`: os 2 `ERROR` de `security_definer_view` não aparecem mais — 0 `ERROR` de segurança no projeto.
3. **Teste direto como `anon`** (`set local role anon`, sem JWT nenhum): `select count(*) from vw_compromisso_cartao_por_pessoa` → `0`. Mesmo teste na segunda view → `0`. Confirma que o RLS das tabelas de origem agora se aplica de fato através das views, não só que o advisor parou de reclamar.

## 5. Causa raiz e por que vai poder acontecer de novo sem uma trava

`CREATE OR REPLACE VIEW`/recriação de view **não herda** `reloptions` da view anterior — cada `CREATE`/`CREATE OR REPLACE` começa do padrão (`SECURITY DEFINER` implícito) a menos que `security_invoker=true` seja declarado explicitamente na mesma instrução ou reaplicado depois via `ALTER VIEW`. Isso não é um bug do Postgres, é o comportamento padrão — mas não havia nenhum processo (checklist, teste automático, revisão) que capturasse essa perda no momento em que aconteceu.

**O `CHECKLIST_NOVAS_ONDAS.md` cobre lógica de negócio (10 itens), não cobre schema/segurança** — esse é o gap real. Enquanto não existir uma checagem equivalente para migrations, qualquer `CREATE OR REPLACE VIEW` numa view já endurecida pode reintroduzir esta mesma classe de regressão.

## 6. Recomendação de prevenção (pendente, não implementada nesta correção)

Ideia discutida com o usuário, ainda não implementada: um passo de validação automática (CI ou script rodado antes de deploy) que:
1. Consulte `pg_class.reloptions` de toda view que já foi corrigida para `security_invoker=true` (lista fixa: as 2 desta ocorrência, mais qualquer futura).
2. Falhe/alerte se alguma dessas views aparecer sem essa opção.
3. Alternativa mais simples: checar `get_advisors(type=security)` e falhar se `security_definer_view` (nível `ERROR`) aparecer.

Ainda por decidir: onde esse passo roda (GitHub Actions? script manual de checklist de sessão?) — fica registrado aqui como próximo passo, não como concluído.
