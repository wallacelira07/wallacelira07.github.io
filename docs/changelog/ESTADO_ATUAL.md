# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 09/08/2026. **Mudança de fase decidida pelo usuário: de "migração V1→V2" para "operação diária controlada, em validação real".** HEAD `3bf1c0c`, `git status` limpo.

## A mudança de fase, em uma frase

**Não se caça mais consumidor de `wallace_dados`, não se abre mais frente de engenharia grande.** O que resta da migração fica registrado como pendência sem prioridade (seção abaixo). O trabalho agora é usar o sistema de verdade, monitorar, e corrigir só o que realmente atrapalhar o uso.

## Critério de encerramento definido pelo usuário (não é "métrica chegou a zero")

A V2 será declarada "concluída" quando, durante um **período real de uso**:
- ✅ Compras reais registradas sem incidente.
- ✅ Pagamentos reais registrados sem incidente.
- ✅ Caixas permanecerem consistentes.
- ✅ Patrimônio permanecer consistente.
- ✅ Pluggy continuar sincronizando (Action verde).
- ✅ Solar continuar consistente.
- ✅ Nenhuma divergência operacional nova aparecer.

**Ainda não declarado concluído** — falta o período de uso real acontecer. Isso não é uma tarefa de agente, é tempo + observação.

## O que já está pronto pra uso diário (Nível A/B, confirmado nesta sessão)

- **Fase 5 (fechamento do ciclo de gravação)**: lançar uma transação (via `lancar_transacao_manual`, formulário "＋ Lançar" ou Claude Code) atualiza caixa/Balanço/Resumo Executivo na mesma ação. Testado com evidência real de banco (transação de teste reversível) e **em uso real** desde 08/08/2026 (3 compras reais já lançadas: medidor solar R$79,79, cabo/quadro R$149,20 — ambas Caixa Bens Duráveis, cartão 4628 —, Uber R$3,41 — Caixa Variável/compromisso, cartão 4628).
- **Pluggy**: causa raiz do HTTP 400 encontrada (proteção do Supabase contra `DELETE`/`UPDATE` sem `WHERE`, específica da role do PostgREST — não reproduzível via SQL direto/`execute_sql`, lição registrada) e corrigida via `apply_migration`. **Action re-executada pelo usuário, verde.**
- **Cartões**: mapeamento oficial completo aplicado (Itaú Wallace: 1371 físico/4628 virtual/5147 Samsung Wallet; Itaú Vanessa: 6351 físico/5660 virtual/4017 Samsung Wallet) — 3 linhas novas em `cartoes`, literais de fallback atualizados.
- **Governança do Claude Chat**: `MANUAL_OPERACIONAL_AGENTES.md` (mestre, repositório) e `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (Google Doc/`.md`, Claude Chat) sincronizados, incluindo a seção 1.2 (Fase 5) que faltava no manual mestre (lacuna real encontrada e corrigida nesta sessão). **Decisão de formato**: os 2 documentos vivem no Drive (`Livro Razão/Sistema Wallace Lira - Claude Chat`) **como arquivos `.md` reais, nunca Google Doc** — evita a confusão real já vivida (conversa lendo cópia desatualizada em Doc enquanto a `.md` mais recente coexistia na mesma pasta). Fluxo de registro decidido: **2 passos, sem escrita direta via Claude Chat por enquanto** (Chat interpreta a compra → usuário confirma e registra via UI ou Claude Code) — decisão explícita de não abrir uma nova superfície de risco financeiro antes de validar o uso real da Fase 5.

## Pendências remanescentes — mantidas registradas, SEM prioridade imediata

Não abrir essas frentes por iniciativa própria. Só mexer se o usuário pedir, ou se uma delas causar um incidente real durante o uso diário.

| Item | Classe |
|---|---|
| Campo de cartão no formulário "＋ Lançar" (hoje só via Claude Code, RPC já suporta `p_cartao_id`) | Dívida técnica de UI |
| `PLUGGY_TRIAGEM` (decisão de aprovar/rejeitar da Inbox, ainda em `wallace_dados` JSONB) | B — deixado fora por decisão explícita do usuário |
| RLS desabilitado em `public.v1_v2_caixa_mapa` | Pendência de segurança — decisão de política do usuário |
| Necessidade Total / Modo Operacional / Saldo do Ciclo (não recalculam ao vivo, vêm de `ciclos_financeiros_snapshots`) | Modelagem nova significativa, fora de escopo |
| `PIB_WALLACE_HISTORICO`, `PADROES_RUIDO_TRANSACAO`, `DEFICIT_ZERO_PISO_OVERRIDE`, `ENERGISA_TARIFA_COMPOSICAO` (RPCs que gravam em `wallace_dados` via `jsonb_set`) | C — dívida técnica, baixo ROI |
| Card de qualidade de geração solar lendo cópia local em vez da view V2 direto | C — dívida técnica, dado correto |
| Headline totals de cartão, Solar 301×361 kWh, Caixa Lance, 4 caixas de causa indeterminada, `TX000203-208` | D — exceções formais, não reabrir (ver `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`) |
| Conector MCP de escrita direta para o Claude Chat | Avaliado e adiado deliberadamente — revisitar só depois do período de uso real |

## Protocolo de sessão nova (mudou — leia com atenção)

1. Este arquivo.
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente.
3. **Não iniciar nenhuma nova frente de migração/engenharia por conta própria.** A prioridade do usuário agora é usar o sistema, não reduzir consumidores.
4. Se o usuário reportar uma compra/pagamento real: seguir o fluxo de 2 passos (seção 1.2 do manual) — nunca simular lançamento, sempre confirmar antes de gravar.
5. Se o usuário reportar um **incidente** (divergência, erro, dado que não bateu): investigar com evidência real (Nível A/B), documentar em `docs/decisions/` se for uma causa raiz nova, corrigir só o que impactou a operação — não aproveitar pra "arrumar mais coisas" ao redor.
6. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
7. Pendente do usuário (fora do alcance de qualquer agente): nenhuma ação de conta pendente no momento — governança do Claude Chat já configurada e confirmada funcionando.
