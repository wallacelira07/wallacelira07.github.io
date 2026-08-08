# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site` (mesma sessão longa do dia, HEAD de entrada `a44be02`).

## PRODUÇÃO: domínio oficial é `wallacelira.com.br`

Commit sendo preparado agora (autorizado pelo usuário) — ver hash no bloco mais recente de `PASSAGEM_DE_TURNO.md` assim que sair. Push **não** foi pedido ainda nesta sessão.

**Validação em navegador com login real continua pendente.** Confirmado só que o HTML/JS carrega sem erro de console até o gate de login (preview local, `.claude/launch.json`). `WALLACE_VALIDACAO_RUNTIME`/`#healthBadge` não rodados.

## Protocolo de sessão nova (leia nesta ordem)

1. Este arquivo (`ESTADO_ATUAL.md`)
2. `PASSAGEM_DE_TURNO.md` — Bloco 19 (mesmo dia, sessão longa: Wave A/B, Mastercard/Visa fechado, Solar V2 completo)
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — **novo**, consolida as 5 exceções permanentes (headline totals, Solar 301×361, Caixa Lance, 4 caixas indeterminadas, TX000203-208) — não são mais pendência
4. `docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md` — detalhe da exceção de cartão
5. `docs/MANUAL_OPERACIONAL_AGENTES.md` — seção 2 atualizada
6. **Sempre conferir `git status`/`git log` antes de assumir pendente ou concluído.**

---

## 0. MÉTRICA DO PROJETO: consumidores de `wallace_dados`, não "domínios migrados"

Critério de sucesso do usuário: **quanto da V1 ainda está vivo**, medido por chave de `wallace_dados` (95 chaves de topo) com consumidor real no frontend.

| Grupo | Descrição | Quantidade |
|---|---|---|
| **1 — Já removidos** (V2-exclusivo, sem consumidor real) | Caixas/Livro Razão/LRW-MB (Wave A), titularidade de cartão (Wave B1), Patrimônio/ROC/LREI/Parcelamentos (sessões anteriores), **`SOLAR_LEITURAS`** (religado hoje) | **28** |
| **2 — Exceções formais** (fora da métrica a partir de hoje) | Headline totals cartão, Solar 301×361, Caixa Lance, 4 caixas indeterminadas, TX000203-208 | **~10** |
| **3 — Consumidores reais restantes** | Assinaturas/Recorrências/Corp/Consórcios (bloqueado por dado), Ciclo Snapshots, Operacional (~25 chaves heterogêneas), Pluggy/MP brutos, LRC/LRCV item-a-item | **~55** |

**Nenhum item de baixo esforço/alto impacto continua disponível** — o único que havia (religar Solar) foi executado nesta sessão. O que resta do Grupo 3 exige decisão de dado (não código) ou investigação nova do zero.

## 1. Mastercard Black/Visa — domínio fechado até onde é tecnicamente possível

Registrado formalmente (`EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`): titularidade, `CARTAO_MAPA`, LRW/LRV e estrutura geral de cartões estão resolvidos e V2-exclusivos. Assinaturas/Recorrências/Corp/Consórcios bloqueados por falta de `cartao_id`/`categoria_id` em `transacoes` — decisão de dado do usuário, não engenharia pendente. **Não entra mais em rodadas de trabalho pesado.**

## 2. Solar — modelo de ciclos de crédito implementado na V2

**Schema novo** (Supabase, aplicado via `apply_migration`): tabela `ciclos_solares` (ciclo aberto/fechado, congelamento de crédito, snapshot de rateio), colunas novas em `energia_solar_leituras` (`ciclo_id`, `eh_leitura_oficial_energisa`, `evidencia` — evidência obrigatória pra fechar ciclo, nunca por inferência de data), RPC `fechar_ciclo_solar()` (SECURITY DEFINER, matching o padrão de RLS do projeto), views `vw_ciclo_solar_aberto`/`vw_ciclo_solar_historico`. Bootstrap: ciclo 1 aberto desde 21/07/2026, baseline zero (mesma premissa que já valia implicitamente), 5 leituras existentes já linkadas.

**Frontend religado**: seções 10 (Unidade Geradora — crédito do ciclo atual principal + acumulado desde ativação secundário), 11 (Rateio Solar — ganhou bloco de histórico de ciclos fechados, hoje vazio pois nenhum ciclo fechou ainda) e 12 (Previsão — agora baseada no ciclo aberto, não mais no acumulado desde ativação) leem `energia_solar_leituras`/`vw_ciclo_solar_aberto`/`vw_ciclo_solar_historico` (V2), não mais `wallace_dados.SOLAR_LEITURAS`. Nenhuma fórmula financeira/rateio/301×361 alterada — só a origem do dado bruto e a separação conceitual ciclo-atual × acumulado.

**O que continua em V1 no domínio Solar**: `SOLAR_GERACAO_DIARIA` (Qualidade da Geração, já sincronizado V1+V2 mas leitura do frontend ainda V1), `ENERGISA_TARIFA_COMPOSICAO`/consumos diários (seção 09, residual pós-solar), heurística de gráfico mensal por mês-calendário (mantida por decisão de não reescrever, convive com o histórico real novo).

**Aba própria "☀️ Energia Solar" implementada** (mesmo dia, commit seguinte): domínio inteiro extraído da aba Gráficos — pane `#solar` nova (7 seções renumeradas: Qualidade da Geração, Unidade Geradora, Rateio+Histórico, Previsão, Geração diária, Economia antes×depois, Simulador), lazy loading isolado (`initSolarLazy()`, não carrega mais junto com Gráficos/Cenários), Busca Global corrigida (apontava pro título antigo da seção, achado durante a implementação). Nenhum id de DOM, cálculo ou fórmula alterado — só reorganização de HTML + divisão de uma função JS em duas.

## 3. Verificação desta sessão

- Preview local: HTML/JS carrega sem erro de console até o gate de login (index.html correto, não `Sistema_Wallace_Lira_Completo.html` direto — ver memória `feedback_preview_entry_point`).
- **Validação funcional completa (WALLACE_VALIDACAO_RUNTIME, healthBadge, valores renderizados na tela) não foi feita — precisa de login real.**
- Nenhuma migração SQL fora do já reportado (ciclos_solares). `get_advisors` rodado, achado próprio corrigido (RLS + SECURITY DEFINER de `ciclos_solares`/`fechar_ciclo_solar`).

## 4. Pendências abertas

1. Validação em navegador real com login — segue pendente desde sessões anteriores.
2. Proposta da aba "☀️ Energia Solar" — a ser entregue nesta mesma sessão, sem implementar ainda.
3. `v1_v2_caixa_mapa` sem RLS — backlog, não misturar com modelagem de domínio.
4. Assinaturas/Recorrências/Corp/Consórcios (32 transações sem `cartao_id`/`categoria_id`) — decisão do usuário pendente, não código.
5. As 5 exceções formais (`EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`) — **não reabrir**.
6. Ciclo Snapshots, Operacional, Pluggy/MP brutos — fora de escopo até esgotar itens de baixo esforço (não há nenhum disponível agora).
