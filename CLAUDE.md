# Sistema Wallace Lira — leia antes de qualquer coisa

Este arquivo é carregado automaticamente em toda sessão do Claude Code neste repositório. Ele existe só pra apontar pro manual — não duplicar conteúdo aqui.

## Leitura obrigatória, nesta ordem, antes de qualquer ação

1. **[`docs/MANUAL_OPERACIONAL_AGENTES.md`](docs/MANUAL_OPERACIONAL_AGENTES.md)** — como operar este sistema. Fonte única da verdade, fluxo de lançamento, fluxo de auditoria, fluxo de sincronização, regras de encerramento de sessão, procedimentos proibidos. **Se você é um agente de IA (Claude Code, Claude Chat, Copilot ou outro) trabalhando neste repositório, este documento não é opcional.**
2. [`docs/changelog/ESTADO_ATUAL.md`](docs/changelog/ESTADO_ATUAL.md) — estado real da sessão anterior, reescrito do zero a cada corte.
3. [`docs/changelog/PASSAGEM_DE_TURNO.md`](docs/changelog/PASSAGEM_DE_TURNO.md) — histórico narrativo (bloco mais recente = topo).
4. [`POLITICAS_INTERNAS_SISTEMA_WALLACE.md`](../Cópia%20de%20backup/POLITICAS_INTERNAS_SISTEMA_WALLACE.md) (fora deste repo, ver caminho no `MANUAL_OPERACIONAL_AGENTES.md`) — regras de negócio (cascata de reembolso, caixas, ciclo financeiro).

## As 3 regras que mais já causaram retrabalho quando ignoradas

- **"V2" tem dois significados diferentes neste projeto** — arquitetural (VARS/REG modularizado, alimenta o painel) e relacional (tabelas Supabase, ainda não alimenta o painel). Confirmar qual antes de agir. Detalhe completo na seção 1 do manual.
- **Nunca editar só o arquivo local.** `wallace_dados` no Supabase sobrescreve o `VARS` a cada carga — editar só `src/financeiro/**/vars-*.js` não muda o que o usuário vê no site.
- **Nunca commitar/dar push sem avisar antes**, mesmo com autorização permanente de commitar sozinho.

Todo o resto — checklists de início/fim de sessão, gatilhos automáticos, procedimentos de correção — está no manual. Não repita aqui.
