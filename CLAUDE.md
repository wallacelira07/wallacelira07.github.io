# Sistema Wallace Lira — leia antes de qualquer coisa

Este arquivo é carregado automaticamente em toda sessão do Claude Code neste repositório. Ele existe só pra apontar pro manual — não duplicar conteúdo aqui.

## Leitura obrigatória, nesta ordem, antes de qualquer ação

1. **[`docs/MANUAL_OPERACIONAL_AGENTES.md`](docs/MANUAL_OPERACIONAL_AGENTES.md)** — como operar este sistema. Fonte única da verdade, fluxo de lançamento, fluxo de auditoria, fluxo de sincronização, regras de encerramento de sessão, procedimentos proibidos. **Se você é um agente de IA (Claude Code, Claude Chat, Copilot ou outro) trabalhando neste repositório, este documento não é opcional.**
2. [`docs/changelog/ESTADO_ATUAL.md`](docs/changelog/ESTADO_ATUAL.md) — estado real da sessão anterior, reescrito do zero a cada corte.
3. [`docs/changelog/PASSAGEM_DE_TURNO.md`](docs/changelog/PASSAGEM_DE_TURNO.md) — histórico narrativo (bloco mais recente = topo).
4. [`POLITICAS_INTERNAS_SISTEMA_WALLACE.md`](../Cópia%20de%20backup/POLITICAS_INTERNAS_SISTEMA_WALLACE.md) (fora deste repo, ver caminho no `MANUAL_OPERACIONAL_AGENTES.md`) — regras de negócio (cascata de reembolso, caixas, ciclo financeiro).
5. [`ROTINA_MENSAL_SOP.md`](../Rotina%20mensal/ROTINA_MENSAL_SOP.md) (fora deste repo) — documento **pro usuário**, não pro agente: o que ele ainda precisa mandar manualmente todo mês (faturas, Energisa, FGTS, etc.), o que já é automático, e os fechamentos reais dos 3 cartões (Visa dia 19, Mastercard dia 22, Mercado Pago dia 29/paga 04). Se o usuário perguntar "o que eu preciso fazer" ou similar, a resposta vem daqui — não inventar nem confiar em memória de sessões antigas, ler o arquivo.

## As 3 regras que mais já causaram retrabalho quando ignoradas

- **"V2" tem dois significados diferentes neste projeto** — arquitetural (VARS/REG modularizado, alimenta o painel) e relacional (tabelas Supabase, ainda não alimenta o painel). Confirmar qual antes de agir. Detalhe completo na seção 1 do manual.
- **Nunca editar só o arquivo local.** As tabelas V2 relacionais do Supabase (`transacoes`, `caixas`, `legendas`, `indicadores`, `parametros_gerais`, etc.) são a fonte real do que o painel exibe hoje para os domínios já migrados — editar só `src/financeiro/**/vars-*.js` pode não mudar o que o usuário vê, dependendo do domínio. **Atenção**: até 12/08/2026 esta regra falava do merge `wallace_dados` sobrescrevendo o `VARS` a cada carga — esse merge foi **removido do código nessa data** (ver comentário "REMOVIDO 12/08/2026" em `src/app/app.js`); a tabela `wallace_dados` não é mais lida em lugar nenhum do boot. Confirmar sempre qual mecanismo real está em vigor pro domínio específico antes de editar (ver `docs/changelog/ESTADO_ATUAL.md`).
- **Nunca commitar/dar push sem avisar antes**, mesmo com autorização permanente de commitar sozinho.

Todo o resto — checklists de início/fim de sessão, gatilhos automáticos, procedimentos de correção — está no manual. Não repita aqui.
