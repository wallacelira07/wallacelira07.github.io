# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, continuação da sessão do dia, HEAD `26315fc` + trabalho não commitado descrito abaixo.

## Concluído e validado nesta sessão (commitado + push)

1. `e5f1348` — religação de `SOLAR_GERACAO_DIARIA` na V2 + ocultação da seção 07 "Simulador Regulatório".
2. `cc315fa` — documentação da investigação do gap SAJ (causa raiz, evidências, conclusão).
3. `26315fc` — **correção do gap**: robô SAJ passa a atualizar `energia_solar_leituras.geracao_acumulada` automaticamente (nova função `atualizar_v2_leitura_geracao_acumulada()`). **Validado com prova real**: disparo manual do workflow (`workflow_dispatch`, run `31270756547`, commit `26315fc`, `conclusion: success`) — leitura de 07/08 saiu de `NULL` para `446.07`. Domínio Solar (geração) considerado estabilizado.

## Em andamento, NÃO commitado — próximo consumidor de `wallace_dados` eliminado

**`ACOES_COTACOES` / `ACOES_COTACOES_ATUALIZADO_EM`** (cotações de ações via brapi.dev, único consumidor: `hydrate-roc.js`, tabela de opções ROC). Escolhido por ser o item de maior impacto/menor esforço/zero decisão humana disponível no inventário da seção 41 do `PLANO_UNIFICACAO_V1_V2.md`: escrita já centralizada numa única RPC `SECURITY DEFINER`, schema trivial (ticker→preço), sem ambiguidade, sem reconciliação.

**Executado**:
- Migration `criar_tabela_cotacoes_acoes` — tabela nova `cotacoes_acoes` (ticker PK, preco, variacao, atualizado_em), RLS com policy de leitura pública (mesmo padrão de `indicadores`/`energia_solar_geracao_diaria`).
- Migration `atualizar_cotacoes_acoes_grava_v2` — a RPC existente (`atualizar_cotacoes_acoes`, já `SECURITY DEFINER`) passou a fazer upsert em `cotacoes_acoes` além do `UPDATE` em `wallace_dados` já existente. **Efeito imediato**: não depende de deploy/push — a próxima execução do robô Python (`atualizar_cotacoes_acoes.py`, workflow já existente) já grava nas duas.
- Frontend: `Sistema_Wallace_Lira_Completo.html` (fetch paralelo `WALLACE_COTACOES_ACOES_V2`) + `src/app/app.js` (override de `VARS.ACOES_COTACOES`/`ACOES_COTACOES_ATUALIZADO_EM` se a V2 respondeu — fallback silencioso permitido, mesmo padrão de `cartoes`/Wave B1, domínio informativo não crítico).

**Pendente**: aprovação do usuário pra commitar/push o frontend (a RPC já está ativa em produção, só falta o site ler de lá) + validação real (disparar `atualizar_cotacoes_acoes.yml` manualmente e conferir `cotacoes_acoes` populada, mesmo processo já usado pro SAJ).

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 30 commitados; +1 (`ACOES_COTACOES`) pronto, aguardando push |
| Exceções formais (fora da métrica) | ~10 — `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` |
| Restantes | ~53 após o push de `ACOES_COTACOES` |

**Fora do escopo, por instrução explícita do usuário** (não gastar energia): 301×361 (Solar), Caixa Lance, 4 caixas de causa indeterminada, TX000203-208, headline totals Mastercard/Visa.

## Próximos candidatos (ordenados por impacto/esforço/independência de decisão), do inventário da seção 41 do plano

1. ~~`ACOES_COTACOES`~~ — em execução (acima).
2. `CARTAO_PLUGGY_MAPA` — mapa de identidade de cartão; grande parte já migrada (Wave B1, tabela `cartoes`), mas a chave ainda existe em `wallace_dados` — checar se algum consumidor real ainda lê a chave antiga antes de considerar eliminável.
3. `HISTORICO_ERP_TODOS_CICLOS` — escritor não agendado (manual, sob demanda), candidato a virar tabela V2 se algum consumidor real ainda ler daí.
4. Ciclo Snapshots e o restante de "Operacional" (~30 chaves heterogêneas) — precisam de triagem individual (alguns podem ser tão simples quanto `ACOES_COTACOES`, outros exigem modelagem real). Não teve triagem item a item ainda.

## Protocolo de sessão nova

1. Este arquivo
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir
4. `docs/MANUAL_OPERACIONAL_AGENTES.md`
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
