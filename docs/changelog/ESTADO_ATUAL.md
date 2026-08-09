# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 09/08/2026 (mesmo dia, continuação — Prioridade 0 fechada + PIX Geral Vanessa promovida pra V2 + migration Pluggy upsert/histórico aplicada + **encerramento formal da fase de implantação V2** + 2 incidentes reais corrigidos em Operação Assistida). HEAD `c5572bd` (mais estas correções, ainda não commitadas), `git status` limpo (fora dos `desktop.ini` inofensivos espalhados pelo disco pelo Google Drive Desktop, nunca commitados).

## 🔧 Operação Assistida em ação — 2 incidentes reais reportados e corrigidos (09/08/2026, já dentro da nova fase)

Primeiro uso real da Operação Assistida declarada logo abaixo — 2 divergências reportadas pelo usuário via screenshot, ambas investigadas com evidência (Nível A) antes de qualquer correção.

**1. Card "Reembolsos a receber" mostrando R$0,00 (deveria ser R$6.700,61)** — causa raiz: `reembolso_wartsila_ciclo` (V2, domínio "Onda 4 Wärtsilä", declarado V2-exclusivo sem fallback) tinha uma linha criada 08/08 às 13:30 com um snapshot **anterior** às 2 últimas correções confirmadas pelo usuário (05/08 "parte 96" e 07/08) — nunca foi atualizada depois. A proteção "sem fallback silencioso" só cobre dado *ausente*, não dado *presente e errado*, por isso o card não soou alarme sozinho.
   - Reconstrução Nível A bottom-up (pedida explicitamente pelo usuário antes de aplicar qualquer correção, para não repetir o V1 como "argumento de autoridade"): `valor_a_receber=6700.61` confirmado por print do próprio sistema de reembolso da Wärtsilä ("Amount Due Employee: R$6.700,61", mostrado pelo usuário na sessão); `perna_cartao_corporativo_pessoal=297.31` reconstruído somando as 5 transações reais de `LRC_LIMBO_TRANSACOES` (TX000158+161+172+173+174), confirmadas também na tabela `transacoes` da V2; `perna_mp_corporativo=266.23` = `TXMP000011` (real, mas só existe no array V1 ainda, não migrado pra V2); `perna_fatura_wartsila=5056.95` = confirmação direta do usuário em 05/08 (extrato do cartão, sem transação decomponível no sistema); `valor_total_bruto=7040.61` = soma de 340 (recebido, `TX000220`, já na V2) + 6700.61 (a receber). Todos os 5 números bateram exatos com a reconstrução — corrigido via `UPDATE` direto (não é DDL, sem migration formal, mesmo padrão de correção pontual de dado já usado nesta sessão).
   - **Achado lateral registrado, não corrigido**: `TXMP000011` (R$266,23, PIX Isabel Cristina Barbosa, transporte corporativo, 01/08) ainda não foi migrado pra tabela `transacoes` da V2 — só existe no array V1. Não é urgente (fora do escopo deste incidente), mas fica registrado.
   - **Não validado no navegador** — os 5 slots de preview do projeto estavam ocupados por outras sessões simultâneas nos dois momentos em que tentei. Correção confirmada só por evidência de banco (antes/depois via `SELECT`), não por captura de tela real. Recomendado ao usuário conferir visualmente.

**2. Card "KMV Ipiranga" mostrando R$600,00 (deveria ser R$400,00)** — usuário já tinha usado 1 dos 3 cupons de R$200 e já tinha reportado isso antes, mas a correção nunca foi aplicada em nenhum lugar (nem `indicadores.creditoKmvIpiranga` na V2, nem o literal em `vars-operacional.js`) — ficou parada em R$600 desde 31/07/2026. Corrigido nos dois lugares (`UPDATE` no Supabase + literal do arquivo, mesmo padrão de manutenção dupla já usado nesta sessão pra não deixar o V1 desatualizado como fallback). Mesma limitação de validação em navegador do item 1.

## 🏁 ENCERRAMENTO DA FASE DE IMPLANTAÇÃO V2 (09/08/2026) — leia primeiro

**Decisão do usuário, registrada formalmente**: a fase de implantação da V2 está encerrada. O projeto entra em **Operação Assistida** — a métrica que importa a partir de agora é **estabilidade** e **consistência financeira** observadas no uso real, não mais "quantos consumidores de `wallace_dados` faltam" ou "% migrado". Não abrir novas frentes de migração ou refatoração grande por iniciativa própria; não perseguir 100% como métrica artificial (decisão já em vigor desde o Bloco 36 da Passagem de Turno, agora formalizada com revisão final de remanescentes).

### Comunicado oficial (posição do projeto)

> Implantação V2 concluída (100%). O sistema entra agora em fase de Operação Assistida, com monitoramento de estabilidade, qualidade de dados e evolução contínua.

**O que "100%" significa aqui, explicitamente** (confirmado pelo usuário): não significa sistema perfeito, não significa backlog zerado, não significa dívida técnica inexistente. Significa que **não existem mais migrações estruturais obrigatórias para colocar a V2 em operação** — balde "Implantação V2" vazio.

✅ Implantação V2 encerrada
✅ Sistema Wallace operando em V2
✅ Operação Assistida iniciada

### Métrica nova a partir de agora

**Parar de medir**: consumidores migrados, remanescentes V1.

**Passar a medir**: incidentes operacionais, consistência financeira, disponibilidade das automações (Actions/Pluggy/robôs), qualidade dos dados, estabilidade da operação.

### Taxonomia permanente (não confundir daqui pra frente)

**Implantação V2 ≠ Operação Assistida ≠ Backlog de Produto ≠ Governança.** Só o balde 1 pode ser chamado de "pendência da V2". Os outros 3 são vida normal de sistema em produção — existem depois de qualquer implantação bem-sucedida, para sempre. Ver classificação completa abaixo.

### Veredito objetivo

1. **V2 pronta para uso diário?** Sim.
2. **V2 pronta para produção?** Sim — já está em produção e em uso real (compras/lançamentos reais registrados, Pluggy sincronizando, Solar consistente).
3. **V2 concluída?** Depende da métrica: **concluída como fase de implantação — sim**, é isso que este bloco declara. **Concluída como "100% da arquitetura migrada" — não**, e essa deixou de ser a métrica perseguida (decisão explícita do usuário, ver Bloco 36).
4. **Percentual do comunicado de encerramento: 100%.** Não "o sistema é perfeito" — a implantação (definida como trabalho de migração/engenharia estrutural) está com o balde "Implantação V2" **vazio** (ver reclassificação abaixo). Todo item real que restou pertence a operação, produto ou governança, nenhum é migração disfarçada. Dar 95-99% implicaria dizer que ainda existe migração por fazer — não existe.
5. **Bloqueador operacional real restante?** **Nenhum identificado** nesta revisão.

### Reclassificação final — Implantação concluída ≠ Evolução futura do sistema

A partir de agora, nada aqui deve ser chamado de "pendência da V2" a menos que caia literalmente no balde 1. Os outros 3 baldes são vida normal de sistema em produção — existem *depois* de qualquer implantação bem-sucedida, para sempre.

**1) Implantação V2 — vazio.** Nenhum item. É o próprio resultado desta revisão.

**2) Operação Assistida** (monitorar, não construir — converte em tarefa pontual só se virar incidente real):
- 3 caixas de exceção residual ainda dormentes (Manutenção, Saúde Família, Aniversário Júlio) — vigilância; se o Chat gravar direto nelas e reproduzir o padrão já visto em PGV/PIX Vanessa, vira tarefa pontual, não reabertura de frente.
- Próxima Action horária do Pluggy rodar pra começar a acumular histórico real via upsert (lógica já testada, falta só o relógio passar).
- O critério original de "V2 concluída" (compras reais sem incidente, caixas/patrimônio consistentes, zero divergência nova) — não é mais meta, é a própria definição operacional desta fase.

**3) Backlog de produto** (melhoria futura opcional, sem prazo):
- Campo de cartão no formulário "＋ Lançar" (UI só via Claude Code hoje).
- `PIB_WALLACE_HISTORICO`, `PADROES_RUIDO_TRANSACAO`, `DEFICIT_ZERO_PISO_OVERRIDE`, `ENERGISA_TARIFA_COMPOSICAO` ainda em `wallace_dados` via `jsonb_set` — baixo ROI.
- Card de qualidade de geração solar lendo cópia local em vez da view V2 direto.
- `wallace_dados.pixGeralVanessaSaldo` (valor órfão R$338,00) ainda no banco — higiene, zero risco.
- Necessidade Total / Modo Operacional / Saldo do Ciclo ao vivo — modelagem nova significativa.
- `sincronizar_v1_v2()` — função já existe e foi validada em dry-run, falta só gatilho automático/periódico (frente antiga, congelada, ver `PLANO_UNIFICACAO_V1_V2.md` seção 19).
- Fase 4D (frontend da unificação V1→V2 relacional) — levantamento técnico feito, zero implementação, sem requisitos levantados.
- Conector MCP de escrita direta pro Claude Chat — avaliado e adiado deliberadamente.

**4) Governança** (decisão, política, documentação, segurança):
- RLS desabilitado em `public.v1_v2_caixa_mapa` — decisão de política pendente do usuário.
- **Achado nesta revisão, nunca formalizado antes**: `get_advisors` (security) lista 17 views com `SECURITY DEFINER` (nível ERROR) e 6 funções `SECURITY DEFINER` executáveis por `anon`/`authenticated` sem restrição (`criar_categoria`, `fechar_ciclo_solar`, `lancar_transacao_manual`, `registrar_pib_mensal`, `triar_mercadopago_evento`, `triar_pluggy_item` — nível WARN, provavelmente intencional já que é assim que o Chat/frontend grava, mas nunca revisado formalmente). Mais 6 funções com `search_path` mutável (WARN, hardening menor). Nenhuma dessas é nova desta sessão — pré-existentes, só não estavam documentadas.
- `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` (item 4) ainda lista PIX Geral Vanessa como "causa indeterminada" — desatualizado, a causa raiz foi encontrada e corrigida nesta sessão. PIX Vanessa também foi promovida e não está listada lá. Doc não corrigido ainda, registrado pra ajuste pontual futuro.
- Exceções formais já fechadas (não reabrir, ver `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`): headline totals de cartão (Mastercard Black/Visa), Solar 301×361 kWh, Caixa Lance (R$4,37), `TX000203-208` (5 colisões de `tx_legado`), `PLUGGY_TRIAGEM` permanecendo em `wallace_dados` JSONB.

### Pluggy — histórico via upsert: já concluído, não é mais pendência

A única "frente estrutural" que ainda estava aberta antes desta sessão (upsert com histórico real no Pluggy) **foi implementada, testada e commitada nesta mesma sessão** (`c5572bd`) — ver seção abaixo. Não entra mais em nenhuma classificação de pendência.

### Inbox — parecer final

**Operacional.** Fluxo completo Compra → Pluggy → Inbox → Triagem → Sistema confirmado funcionando ponta a ponta (correção do filtro Mastercard Black validada: 11→20 pendentes reais na Inbox). Nenhum fluxo quebrado conhecido nesta revisão. `PLUGGY_TRIAGEM` continuar em `wallace_dados` é decisão explícita do usuário (classe D), não uma falha.

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
