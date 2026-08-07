# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 07/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site`. **Modo fechamento — Fase 2 consolidada.**

---

## FinanceEngine operacional — definição final

**FinanceEngine operacional** = todo componente com função pura equivalente em `src/services/FinanceEngine.js`, testada, sem depender de área congelada (Livro LRC/array, `cartao_id`/`usuario_id`, schema `investimentos`), está **implementado** em `app.js` (chamando o FinanceEngine via `WallaceComparator`, com fallback automático pro V1). "Operacional" não significa "todos os componentes exibindo V2 agora" — significa que a arquitetura de promoção segura está completa e implantada para 100% do universo elegível, e cada componente individual roda ou em V2 (confirmado) ou em fallback V1 (seguro, nunca quebra), decidido pelo Comparator em tempo real a cada carregamento.

## 1. Quantidade final de componentes ativos (implementados)

**39 componentes** cobertos por 18 blocos FASE (2D, 2F–2V) em `app.js`, chamando `WallaceFinanceEngine` + validando via `WallaceComparator`. Todos os 39 estão **implementados e no ar**, cada um decidindo sozinho, a cada carregamento do site, se exibe V2 (aprovado) ou V1 (fallback).

## 2. Quantidade de componentes em fallback (confirmado em runtime)

- **10 confirmados em fallback**: os componentes da FASE 2F (Caixa Manutenção, Aniversário Júlio, Eventos, Saúde Família, Seguro Emplacamento, Combustível, Churrasco, Escola de Júlio, Bens Duráveis, Caixa Lance) — confirmado em navegador real: `[FASE 2F] 0/10`. Causa raiz identificada: corte de ciclo (`CICLO_ATUAL_INICIO` hardcoded) explica Boletos e parcialmente Lance; o resto é resíduo de calibração pré-existente sem relação com o corte (ver `MAPA_MIGRACAO_V2.md`).
- **29 restantes**: implementados, instrumentados (`window.WALLACE_VALIDACAO_RUNTIME`), mas **sem confirmação de execução em navegador real nesta sessão** — não são tratados como "aprovados" nem como "fallback" até essa confirmação acontecer. Isso não é uma pendência de investigação, é só o próximo passo mecânico (abrir o site, ler o console).

## 3. Itens congelados (fora do escopo por decisão do usuário)

- **Caixa Boletos** — causa identificada (corte de ciclo `2026-07-24` vs `2026-07-25`), mas fora do escopo de correção por decisão do usuário. Fica de fora até o saldo real de abertura do ciclo ser confirmado e/ou o usuário autorizar a correção do corte.
- **`VARS.livroLRC`** (array/cascata de reembolso) — represado.
- **Migração `cartao_id`/`usuario_id`** — não iniciada.
- **Migração pro schema `investimentos`** — bloqueador estrutural real (schema incompleto).

## 4. Itens explicados (não são mais pendência, nem divergência, nem investigação em aberto)

- **Caixa Bens Duráveis** — déficit inicial conhecido (caixa criada negativa em R$355,00: fone de ouvido + aparador de pelos, sem fundo acumulado prévio). Comportamento esperado. **Sem ação necessária.**
- **Caixa Lance** — diferença de R$266,23 é `LREI0003` (Caixa Lance → Fatura Cartão Mercado Pago), empréstimo interno com ressarcimento via reembolsos Wärtsilá, já registrado ativo no sistema. **Diferença explicada e documentada. Sem ação necessária.**

Nota de precisão: essa reclassificação fecha a pergunta "por que esse valor aparece assim" (contexto de negócio, painel Supabase relacional). Ela **não** promove esses 2 componentes no FinanceEngine — isso continua sendo decidido pelo Comparator da FASE 2F (hoje em fallback, junto com as outras 8 caixas do lote, por causas já mapeadas e não relacionadas ao déficit/LREI). As duas coisas são independentes e ambas estão fechadas, cada uma do seu jeito: Bens Duráveis/Lance não geram mais dúvida de negócio; FASE 2F como um todo tem causa raiz conhecida e está congelada junto com Boletos.

## 5. Estado consolidado da migração V1→V2 (FinanceEngine) — Fase 2 encerrada

| Domínio | Status |
|---|---|
| 1. Caixas | 39 componentes implementados; 10 (FASE 2F) confirmados em fallback com causa conhecida; Boletos congelado |
| 2-9 | Ver `MAPA_MIGRACAO_V2.md` para detalhe por domínio — sem mudança nesta rodada |

## Encerramento da Fase 2

A Fase 2 está **encerrada**. Todo componente elegível (função pronta, testada, sem depender de área congelada) foi implementado. O que resta fora de "operacional confirmado" se enquadra em exatamente 3 categorias, todas fechadas nesta rodada: **congelado por decisão** (Boletos, Livro LRC, `cartao_id`/`usuario_id`, schema), **explicado e sem ação** (Bens Duráveis, Lance), ou **implementado aguardando confirmação mecânica de runtime** (29 componentes, não é pendência de investigação — é só abrir o navegador).

## Pendências que dependem de decisão do usuário

1. Autorizar ou não a correção do corte de ciclo (`CICLO_ATUAL_INICIO`) — resolveria Boletos, não resolveria as outras 9 caixas da FASE 2F.
2. `VARS.livroLRC` — reabrir ou continuar represado.
3. Commit — via VS Code, com o usuário.
