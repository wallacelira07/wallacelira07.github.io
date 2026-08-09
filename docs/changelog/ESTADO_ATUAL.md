# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 09/08/2026 (mesmo dia, continuação — Prioridade 0 fechada + PIX Geral Vanessa promovida pra V2 + migration Pluggy upsert/histórico aplicada). HEAD `285d262` (esta sessão só mexeu no Supabase, nenhum commit novo no repositório ainda), `git status` limpo (fora dos `desktop.ini` inofensivos espalhados pelo disco pelo Google Drive Desktop, nunca commitados).

## Migration aplicada nesta sessão: Pluggy DELETE+INSERT → UPSERT com histórico real (09/08/2026)

Pendência registrada no bloco de encerramento anterior da Passagem de Turno, aplicada agora com confirmação explícita do usuário. **Via `apply_migration` no Supabase de produção (`bakdgacmwlopvrrppwdm`), sem migration correspondente no repositório** (mesmo padrão já usado pra RPC do Pluggy no Bloco 35).

1. `pluggy_transacoes` ganhou 5 colunas novas: `primeiro_visto_em`, `status_anterior`, `status_mudou_em`, `qtd_sincronizacoes`, `ultima_sincronizacao_em`. Backfill aplicado nas 362 linhas existentes (`primeiro_visto_em=criado_em`, `qtd_sincronizacoes=1`, `status_anterior/status_mudou_em=NULL` — sem histórico real anterior a hoje, documentado como limite honesto).
2. RPC `atualizar_pluggy_contas` reescrita: `DELETE...WHERE true` + `INSERT` nas 3 tabelas (`pluggy_conexoes`/`pluggy_contas`/`pluggy_transacoes`) trocado por `INSERT...ON CONFLICT DO UPDATE` nas 3, usando as PKs já existentes (`item_id`/`id`/`id`). Mesma assinatura, mesmo nome, mesma lógica de geração de `id`/hash — GitHub Action não precisa de nenhum ajuste. `status_anterior`/`status_mudou_em` só mudam quando o `status` real muda (`IS DISTINCT FROM`); `qtd_sincronizacoes` incrementa a cada rodada em que a transação reaparece.
3. **Validado com teste controlado e reversível** (mesmo padrão do Bloco 34): chamei a RPC via `execute_sql` reusando dados reais de uma transação existente (`0f48aa77-...`, MP*MELIMAIS) — 1ª chamada confirmou upsert sem duplicar (`qtd_sincronizacoes` 1→2, sem mudança de status); 2ª chamada com `status` alterado pra `POSTED` confirmou captura correta (`status_anterior='PENDING'`, `status_mudou_em` preenchido, `qtd_sincronizacoes`→3). Linha revertida ao estado original depois do teste (`status='PENDING'`, `qtd_sincronizacoes=1`, campos de histórico zerados de volta) — zero resíduo do teste na tabela real.
4. `get_advisors` (security) rodado depois da migration: nenhum advisory novo — só os já conhecidos (RLS de `v1_v2_caixa_mapa`, security-definer views pré-existentes).
5. **Efeito colateral bom**: elimina de vez o `DELETE...WHERE true` (workaround do bug de segurança do Postgres documentado no Bloco 35) — não há mais `DELETE` nenhum na função.
6. **Pendência real pra confirmar 100%**: a próxima sincronização real da Action (roda de hora em hora) precisa rodar pra começar a acumular histórico de verdade em produção — o teste acima prova que a lógica funciona, mas via chamada manual, não via o caminho real do Python/Action. Só depois de alguns dias de sincronizações acumuladas o histórico vira sinal útil pra reavaliar os 10 dias de `PENDING` da conta 2250 (objetivo original do usuário).

## A mudança de fase, em uma frase

**Não se caça mais consumidor de `wallace_dados`, não se abre mais frente de engenharia grande por iniciativa própria.** O trabalho é usar o sistema de verdade, monitorar, e corrigir só o que realmente atrapalhar o uso — ou o que o usuário pedir explicitamente, como aconteceu nesta sessão (investigação e promoção da PGV).

## Critério de encerramento da V2 (não é "métrica chegou a zero")

A V2 será declarada "concluída" quando, durante um **período real de uso**: compras/pagamentos reais sem incidente, caixas/patrimônio consistentes, Pluggy sincronizando, Solar consistente, zero divergência operacional nova. **Ainda não declarado concluído** — segue sendo tempo + observação, não tarefa de agente.

## Sessão de hoje (09/08/2026) — resumo do que mudou

1. **Prioridade 0 encerrada**: a divergência de R$121,97 na PIX Geral Vanessa tinha causa raiz real — `TX000219`/`TX000221` foram inseridas na V2 sob o `caixa_id` errado ("PIX Vanessa" em vez de "PIX Geral Vanessa") por confusão de sigla numa migration de 08/08. Corrigido via `UPDATE transacoes SET caixa_id=...`, registrado em `audit_log`, rollback documentado. Investigação Nível A completa (extrato bancário real da Vanessa + export JSON do Mercado Pago com `origem:"cofrinhos"` + confirmação do usuário em chat).
2. **Hipótese do saldo "R$338,00" encerrada**: era um valor órfão em `wallace_dados.pixGeralVanessaSaldo`, resíduo de antes da migração V192 (27/07/2026) — sobrescrito toda carga de página pelo recálculo real (`app.js:926`), nunca chegava à tela. Confirmado em navegador real: o site sempre mostrou R$50,69 (V1 recalculado), nunca R$338.
3. **PIX Geral Vanessa promovida pra exibição V2** (decisão do usuário, causa raiz já resolvida e documentada): `hydrate-onda2-v2.js` — `aceitarDivergenciaConhecida: true`, `extraId` pra linha do Balanço, `extra()` pra barra/percentual de meta (mostra valor real sem capar em 100%, pedido explícito, já que a caixa passou da meta de propósito). Painel agora mostra **R$306,73** (era R$50,69), Balanço idem, meta em **102,2%**. Telemetria de divergência mantida no console (`window.WALLACE_ONDA2_V2_RELATORIO`) — resíduo de ~R$256 entre V1 e V2 aceito como consequência esperada da transição (lançamentos que nascem só na V2), não mais divergência a investigar. Validado em navegador real antes e depois. Commits `2c35499`/`285d262`.
4. **Governança do Claude Chat reorganizada**: os 2 documentos (`MANUAL_OPERACIONAL_AGENTES.md`/`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`) saíram de `Livro Razão/Sistema Wallace Lira - Claude Chat/` (upload estático, cada atualização criava cópia nova) e foram pra `Livro Razão/Agentes/`, com um ponteiro fixo (`ONDE_LER.md`) — o Claude Chat, com o conector do Google Drive ativo, agora busca a versão mais recente ao vivo em vez de depender de Project Knowledge reanexado manualmente. Cópias antigas removidas.
5. **Achado lateral, resolvido**: duas versões do Google Drive Desktop rodando ao mesmo tempo neste computador causaram travamento consistente de acesso à pasta de governança — corrigido encerrando as duas e reabrindo só a mais recente. Isso também gerou uma enxurrada de arquivos `desktop.ini` (inclusive dentro de `.git/refs/`, quebrando a manutenção automática do Git num commit) — limpos de dentro do `.git`; os que sobraram fora do `.git` são inofensivos e não vão pro controle de versão.

## O que já está pronto pra uso diário (Nível A/B)

- **Fase 5 (fechamento do ciclo de gravação)**: lançar uma transação atualiza caixa/Balanço/Resumo Executivo na mesma ação, incluindo agora a PGV (Onda 2 roda dentro de `atualizarPainelAposLancamento()`).
- **Pluggy**: Action verde, sincronização completa.
- **Cartões**: mapeamento oficial completo (Itaú Wallace/Vanessa, 6 finais).
- **PIX Geral Vanessa**: efetivamente operada pela V2 — mesma classe das outras 10 caixas já migradas, não é mais exceção.

## Pendências remanescentes — mantidas registradas, SEM prioridade imediata

Não abrir essas frentes por iniciativa própria. Só mexer se o usuário pedir, ou se uma delas causar um incidente real durante o uso diário.

| Item | Classe |
|---|---|
| **Risco estrutural**: as 4 caixas de exceção residual restantes (Caixa Lance, Manutenção, Saúde Família, Aniversário Júlio) têm a mesma exposição que a PGV tinha — se o Chat gravar direto na V2 delas, o padrão "cresce no banco, invisível no painel" se repete. Hoje dormant (nenhum lançamento fora de `reconciliacao` até 09/08). Candidatas naturais a promoção se/quando a mesma investigação Nível A for feita. | A — mesma classe já resolvida uma vez, replicável |
| Campo de cartão no formulário "＋ Lançar" (hoje só via Claude Code, RPC já suporta `p_cartao_id`) | Dívida técnica de UI |
| `PLUGGY_TRIAGEM` (decisão de aprovar/rejeitar da Inbox, ainda em `wallace_dados` JSONB) | B — deixado fora por decisão explícita do usuário |
| RLS desabilitado em `public.v1_v2_caixa_mapa` | Pendência de segurança — decisão de política do usuário |
| Necessidade Total / Modo Operacional / Saldo do Ciclo (não recalculam ao vivo, vêm de `ciclos_financeiros_snapshots`) | Modelagem nova significativa, fora de escopo |
| `PIB_WALLACE_HISTORICO`, `PADROES_RUIDO_TRANSACAO`, `DEFICIT_ZERO_PISO_OVERRIDE`, `ENERGISA_TARIFA_COMPOSICAO` (RPCs que gravam em `wallace_dados` via `jsonb_set`) | C — dívida técnica, baixo ROI |
| Card de qualidade de geração solar lendo cópia local em vez da view V2 direto | C — dívida técnica, dado correto |
| Headline totals de cartão, Solar 301×361 kWh, Caixa Lance, 4 caixas de causa indeterminada, `TX000203-208` | D — exceções formais, não reabrir (ver `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`) |
| Conector MCP de escrita direta para o Claude Chat | Avaliado e adiado deliberadamente — revisitar só depois do período de uso real |
| `wallace_dados.pixGeralVanessaSaldo` (valor órfão, R$338,00) ainda existe no banco, não removido | Higiene — zero risco, mas pode confundir quem ler `wallace_dados` direto no futuro achando que é o valor exibido |

## Protocolo de sessão nova

1. Este arquivo.
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente.
3. **Não iniciar nenhuma nova frente de migração/engenharia por conta própria.** A prioridade do usuário é usar o sistema, não reduzir consumidores — exceto quando o usuário pedir uma investigação específica, como hoje.
4. Se o usuário reportar uma compra/pagamento real: seguir o fluxo de 2 passos (seção 1.2 do manual) — nunca simular lançamento, sempre confirmar antes de gravar.
5. Se o usuário reportar um **incidente** (divergência, erro, dado que não bateu): investigar com evidência real (Nível A/B), documentar em `docs/decisions/` se for uma causa raiz nova, corrigir só o que impactou a operação.
6. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
7. Pendente do usuário (fora do alcance de qualquer agente): nas Custom Instructions do Project do Claude Chat, colar a instrução apontando pro `Livro Razão/Agentes/ONDE_LER.md` (ver Bloco de reorganização de governança em `PASSAGEM_DE_TURNO.md`) — ainda não confirmado se foi feito.
