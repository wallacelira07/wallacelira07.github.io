# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 12/08/2026, sessão longa de modernização (Fases 1-4, mobile, paleta, componentes, performance) + correção de dado real solar (2 faturas reais) + **auditoria completa de prontidão operacional pedida pelo usuário**, com correções aplicadas em cima dos achados. `__V` deve bater com o HEAD após o próximo commit.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** (e reforçada hoje — "sepultamento final da V1", sessão paralela, ver seção 6.1 do manual). `wallace_dados` não recebe mais nenhuma escrita e a maioria dos consumidores de leitura também já migrou pra `parametros_gerais`/tabelas próprias.
2. **Mastercard Black e Caixa Mastercard/Infinite** — investigados, causa raiz identificada, formalizados como exceção. Não reabrir.
3. **Hardening de segurança** — múltiplas rodadas (11/08, 12/08). Ver auditoria fresca abaixo.
4. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita.

## ⚠️ Achado crítico de processo (12/08/2026) — comentários do código podem estar desatualizados NO MESMO DIA

Uma correção de dado real (composição tarifária solar) foi feita seguindo um comentário do código que dizia "wallace_dados sobrescreve isto" — mas outra sessão, no mesmo dia, já tinha removido esse mecanismo (`Object.assign(VARS, dr)`, "sepultamento final da V1") e migrado a fonte viva pra `parametros_gerais`, sem atualizar o comentário. A correção ficou sem efeito por horas até validação com login real revelar isso. **Regra nova registrada em `MANUAL_OPERACIONAL_AGENTES.md` seção 5**: nunca confiar em comentário sobre "onde o dado vive de verdade" sem confirmar no código atual — duas sessões no mesmo repositório no mesmo dia é o cenário normal deste projeto, não exceção.

## ✅ Modernização mobile/performance/visual — todas as 4 fases concluídas e validadas com login real

| Fase | Escopo | Status |
|---|---|---|
| 1 | Performance (cache TTL granular) | ✅ Concluída |
| 2 | Mobile — scroll horizontal Livro Razão (24 painéis) + auto-hide `.master-tabs` | ✅ Concluída, validada ao vivo (login real, scroll de mouse, 4 painéis testados individualmente) |
| 3 | Visual (paleta/tipografia refinadas) | ✅ Concluída |
| 4 | Performance adicional + consistência de componentes | ✅ 6 de 10 achados aplicados; 4 investigados e conscientemente descartados (Chart.js `.update()` e `new Function` não deviam ser mexidos — motivos documentados em `PASSAGEM_DE_TURNO.md`) |

Commits principais da sessão (ordem cronológica, todos pushed): `2da024b` `821cf31` `1a0b583`→`36c0939` (tarifa real) `b7b83c4` `c642dcf` `6de448e` `85cd084` (auto-hide) `b9df4e2`→`8a3d824` (histórico consumo Wellida) `e07cfb0`→`9b3af31` (regra de coordenação + índices).

## ✅ Auditoria de prontidão operacional (12/08/2026) — pedida explicitamente pelo usuário

Auditoria completa (arquitetura, financeiro, solar, automações, segurança, performance) com evidência real coletada ao vivo (advisors do Supabase, `execucoes_jobs`, `pg_policies`, contagens em `transacoes`, não só leitura de código). **Nota geral: 7,4/10 — Produção Inicial, ~80% de prontidão operacional. Veredito: sim, operar continuamente, com vigilância.**

**Achados corrigidos na mesma sessão**:
1. **25 índices de FK faltando** (advisor de performance, categoria WARN→INFO) — criados via migration (`adiciona_indices_fk_faltantes`), confirmado no advisor que a categoria zerou.
2. **Regra de coordenação multi-sessão** registrada no manual (ver achado crítico acima).
3. **Confirmado (não era gap novo)**: o heartbeat "Verificação de segurança (views)" nunca tinha registrado execução no painel — investigado a fundo: o script (`scripts/checks/verificar_seguranca_views.py`) e o workflow (`.github/workflows/verificar_seguranca_views.yml`) já existem e estão corretamente ligados ao orquestrador (`executar_tudo.yml`), criados **hoje mesmo** por uma sessão paralela em resposta a uma regressão de segurança real (2 views recriadas sem `security_invoker=true` por uma migration — já corrigido, confirmado via SQL: `security_invoker=true` presente nas 2 views agora). Só ainda não teve a primeira execução agendada — não é bug, é falta de tempo desde a criação. Deve se resolver sozinho no próximo ciclo do orquestrador (cron-job.org).

**Achados NÃO corrigidos, decisão deliberada**:
- 10 funções `SECURITY DEFINER` expostas a `anon`/`authenticated` — todas com checagem de auth interna (padrão já aceito em rodada de hardening anterior). Migrar pra `SECURITY INVOKER` estruturalmente é possível mas exige teste função por função; não fiz por risco/benefício desfavorável nesta sessão.
- Teste de disaster recovery completo (restaurar backup externo num projeto Supabase novo do zero) — ação grande, com custo/risco, não executada autonomamente.

**Achado que corrige memória desatualizada**: o backup externo (`backup_externo.yml`) **já rodou de verdade** — 3 execuções com sucesso confirmadas em `execucoes_jobs` E arquivos reais encontrados em `backups_externos/` (JSON criptografado 1.3MB + schema SQL 154KB, 11/08). A pendência antiga "segredos do GitHub nunca cadastrados" está resolvida — não é mais pendência.

## ✅ Correção de dado real — solar (12/08/2026)

Duas faturas reais em PDF (Wellida NF 009.005.476, Casa da Mãe NF 009.005.819, Ago/26) usadas para corrigir: composição tarifária real (COSIP como valor exato, não %), e histórico de consumo de 12 meses da Wellida (`solarConsumoIrmaAnoAnterior`) — corrigido em 2 rodadas (a 1ª assumiu indexação fixa por calendário; validação ao vivo no gráfico revelou janela móvel por nome de mês, corrigido de novo com o valor real). Card "Fluxo 1" já estava correto, confirmado contra o banco. Tudo commitado e pushed, detalhe completo em `PASSAGEM_DE_TURNO.md`.

## Pendências antigas, sem decisão do usuário ainda

| Item | Nota |
|---|---|
| Visa Infinite — cobertura baixa de `cartao_id`/histórico | Congelado por decisão explícita, não mexer sem evidência nova |
| `solarConsumoMaeAnoAnterior` (histórico Mai/25-Abr/26 da Casa da Mãe) | Não corrigido — as faturas desta sessão não cobrem esse período |
| `cotacoes_acoes` sem heartbeat visível no painel de Saúde Operacional (achado antigo, não confirmado nesta sessão) | Job roda e sincroniza normalmente (`execucoes_jobs` confirma), possível bug isolado no card do painel, não investigado a fundo |
| Painel principal em mobile real (celular físico do usuário) | Testado apenas via emulação de viewport no navegador desta sessão — nunca confirmado num aparelho físico de verdade |
| SECURITY DEFINER → SECURITY INVOKER nas 10 funções expostas | Estruturalmente possível, não feito por risco/benefício — ver auditoria acima |

## Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
4. **Antes de editar qualquer dado "vivo"/config**: confirmar no código ATUAL (não em comentário) qual fonte realmente alimenta a tela — ver achado crítico desta sessão, regra formal na seção 5 do manual.
5. Validar mudanças de CSS/JS no painel logado sempre que possível (login real, não só leitura de código) — esta sessão fez isso extensivamente e pegou 2 bugs reais que a leitura de código sozinha não pegaria.
