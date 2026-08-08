# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, continuação da sessão do dia, HEAD `22d6b2c` + trabalho descrito abaixo (frescor + legendas dinâmicas, aguardando commit).

## Concluído e validado nesta sessão (commitado + push)

1. `e5f1348` — religação de `SOLAR_GERACAO_DIARIA` na V2 + ocultação da seção 07 "Simulador Regulatório".
2. `cc315fa` — documentação da investigação do gap SAJ.
3. `26315fc` — correção do gap: robô SAJ passa a atualizar `energia_solar_leituras.geracao_acumulada` automaticamente. **Validado com prova real** (disparo manual, run `31270756547`, `446.07` gravado).
4. `22d6b2c` — `ACOES_COTACOES` migrado pra V2 (tabela `cotacoes_acoes` + RPC estendida) + correção do bug de formato de data (DD/MM invertido) no card "Qualidade da Geração".

## Em andamento — Fase 1 de "frescor + legendas dinâmicas" (executado no banco, frontend pronto, NÃO commitado ainda)

Pedido do usuário: card Solar mostrava horário absoluto ("captado às 12:40") em vez de frescor relativo, e ele apontou que texto de negócio no frontend deveria vir do Supabase (mesma diretriz já dada antes pra `legendas`).

**Achado no caminho, corrigido**: `energia_solar_geracao_diaria.created_at` **não** reflete a última atualização — só a primeira inserção do dia (upserts parciais via PostgREST `merge-duplicates` só tocam as colunas do payload). Provado ao vivo: `geracao_kwh` mudou de `27.38`→`27.77`→`29.25` (robô rodando normalmente) enquanto `created_at` ficou parado 155min. Corrigido com coluna `atualizado_em` + trigger `BEFORE INSERT OR UPDATE` (`marcar_atualizado_em()`) em `energia_solar_geracao_diaria` E `cotacoes_acoes` — já validado rodando ao vivo (trigger disparou num run real do robô durante a sessão).

**Achado adicional, corrigido no banco**: o mesmo gap de sincronização já documentado (06/08 e 07/08 faltando em `energia_solar_geracao_diaria`) foi preenchido com os valores REAIS já existentes em `wallace_dados.SOLAR_GERACAO_DIARIA` (V1, que sempre gravou) — `06/08=24.38 kWh`, `07/08=31.54 kWh` (usuário confirmou 31,5 de memória). Não é fabricação: é cópia de dado real já capturado pelo robô, mesma natureza do bootstrap da migração original.

### Infraestrutura nova — padrão de legendas dinâmicas (`legendas` table, sem mudança de schema)

Convenção: placeholders `{chave}` dentro do `texto` de `legendas`, substituídos em runtime. **3 categorias, 1 função**:

- **A) Fixo** — `formatarLegenda(id)`. Idêntico ao comportamento anterior (`VARS.LEGENDAS[id]`). 28 registros antigos continuam funcionando sem nenhuma mudança (nenhum usa `{}`).
- **B) Parametrizado** — `formatarLegenda(id, {hora: '14:32'})` → substitui `{hora}` no texto.
- **C) Totalmente dinâmico (frescor)** — `montarBadgeFrescor(idBase, timestampISO, limites)`: calcula a faixa (verde/amarelo/laranja/vermelho) via `formatarFrescor()`, escolhe a legenda `idBase+Faixa` (ex: `legFrescorSolarVerde`), substitui `{emoji}`/`{tempo}`. Fallback genérico em código se a legenda da faixa não existir no Supabase — nunca quebra a tela.

**3 funções globais novas em `app.js`** (`formatarTempoRelativo`, `formatarFrescor`, `formatarLegenda`, `montarBadgeFrescor`) — mesmo espírito de `marcarIndisponivelV2`, reutilizáveis por qualquer módulo.

**Limites de frescor**: `indicadores` — `SOLAR_FRESCOR_LIMITES - minutosVerde/minutosAmarelo/minutosLaranja` (15/120/1440, editável sem redeploy, mesmo padrão de `ROC_STATUS_LIMITES`/`SOLAR_STATUS_LIMITES`). Reutilizados também pra Cotações (mesmo domínio semântico: "quão velho é aceitável").

**13 legendas novas inseridas em `legendas`** (28→41): `legQgHojeParcial` (parametrizado), `legQgSemLeituraHoje`, `legOpcoesOtmItm` (fixo), + 4 faixas × 2 domínios (`legFrescorSolar*`, `legFrescorCotacoes*`) + `*SemDado` de cada.

**Migração Fase 1 aplicada** (frontend, pronto pra commit):
- `hydrate-onda5-qualidade-geracao.js`: texto "hoje é parcial" agora vem de `formatarLegenda('legQgHojeParcial', {hora})`; badge de frescor novo (`#qgFrescor`) baseado em `atualizado_em`, recalcula sozinho a cada 60s.
- `hydrate-roc.js`: legenda de cotações (`#legOpcoesCotacoes`) trocou horário absoluto por `montarBadgeFrescor('legFrescorCotacoes', ...)`, mesma atualização a cada 60s.
- `Sistema_Wallace_Lira_Completo.html`/`app.js`: fetch de `atualizado_em` incluído no select de `energia_solar_geracao_diaria`; `VARS.SOLAR_GERACAO_DIARIA[].atualizadoEm` novo.

**Verificação feita**: preview local recarregado, console sem erro nos arquivos tocados (erros pré-existentes e não relacionados encontrados em `hydrate-onda4-patrimonio.js`/`hydrate-onda4-investimentos.js` — fora do escopo desta rodada, não tocados, registrados como achado avulso).

**Pendente**: commit + push (a lógica de banco — trigger, `atualizado_em`, legendas — já está ativa em produção; só falta o site consumir).

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 31 (`ACOES_COTACOES` incluso, commit `22d6b2c`) |
| Exceções formais (fora da métrica) | ~10 — `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` |
| Restantes | ~53 |

**Fora do escopo, por instrução explícita do usuário**: 301×361 (Solar), Caixa Lance, 4 caixas de causa indeterminada, TX000203-208, headline totals Mastercard/Visa.

## Próximos candidatos (impacto/esforço/independência de decisão), inventário seção 41 do plano

1. `CARTAO_PLUGGY_MAPA` — checar se sobrou consumidor real da chave antiga de `wallace_dados` (grande parte já migrada, Wave B1).
2. `HISTORICO_ERP_TODOS_CICLOS` — escritor manual, candidato a tabela V2.
3. Ciclo Snapshots + resto de "Operacional" (~30 chaves) — sem triagem item a item ainda.

## Protocolo de sessão nova

1. Este arquivo
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir
4. `docs/MANUAL_OPERACIONAL_AGENTES.md`
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
