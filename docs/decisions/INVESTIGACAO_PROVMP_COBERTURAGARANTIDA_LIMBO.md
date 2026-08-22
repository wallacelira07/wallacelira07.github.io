# Investigação consolidada — provMP, coberturaGarantida e ajuste R$87,96

**Data**: 22/08/2026
**Escopo**: Fase 1b (PIB Wallace / Taxa de Poupança) — pontos que travaram a migração e exigiam decisão do usuário antes de qualquer SQL.
**Método**: 4 investigações independentes, cada uma restrita ao código-fonte real (`src/`), histórico git (`git log`/`git show`) e schema real do Supabase (`bakdgacmwlopvrrppwdm`, via `information_schema`/`pg_get_viewdef`). Nenhuma suposição foi usada para preencher lacuna — onde a evidência não fechou 100%, o ponto foi marcado como não comprovado.

Este documento **não contém SQL nem decisão implementada**. É insumo para o usuário decidir; a implementação (RPC) só começa depois das respostas às perguntas da Seção 2.

---

## 1. O que ficou 100% comprovado (pronto para virar SQL, após decisões da Seção 2)

### 1.1 `REG.totalOpDetalhe.provMP`

Cadeia rastreada ponta a ponta, do JS até a tabela real:

- `REG.totalOpDetalhe.provMP = VARS.totalOpProvMP` (`reg-operacional.js:37`)
- `VARS.totalOpProvMP` = soma de `VARS.PARCELAMENTOS_MP` filtrado por `status === 'ATIVO'`, arredondado a 2 casas (`hydrate-onda5-parcelamentos.js:64-65`)
- `VARS.PARCELAMENTOS_MP` = resultado de `WallaceFinanceService.getParcelamentosV2()` filtrado por `origem_array === 'PARCELAMENTOS_MP'` (`hydrate-onda5-parcelamentos.js:50-51`)
- `getParcelamentosV2()` busca a view `vw_parcelamentos_v2` via REST, `select=*`, **sem nenhum filtro de ciclo, cartão ou data** (`app.js:902-909`)
- Definição real da view (confirmada via `pg_get_viewdef`):
  ```sql
  SELECT p.tx_legado AS tx, ..., p.valor_parcela AS valor,
         CASE WHEN p.status = 'ativa' THEN 'ATIVO' ELSE 'QUITADO' END AS status,
         p.origem_array, ...
  FROM parcelas p
  LEFT JOIN transacoes t ON t.id = p.transacao_origem_id
  WHERE p.origem_array = ANY (ARRAY['PARCELAMENTOS_VISA','PARCELAMENTOS_MP'])
  ```

**Fórmula final comprovada**:
```
provMP = SUM(parcelas.valor_parcela)
         WHERE parcelas.origem_array = 'PARCELAMENTOS_MP'
           AND parcelas.status = 'ativa'
```
Validado com dado real: 5 linhas `ativa` somando R$403,11 (mais 1 linha `quitada` de R$68,36 corretamente excluída).

**Achado crítico de arquitetura (não é decisão minha, é fato do schema)**: a tabela `parcelas` **não tem coluna de ciclo**. Colunas reais: `id, transacao_origem_id, numero_parcela, total_parcelas, valor_parcela, data_prevista, cartao_id, status, created_at, tx_legado, origem_array`. O `status` (`ativa`/`quitada`) muda ao longo do tempo conforme as parcelas são pagas — então recalcular provMP "para o ciclo de julho" hoje vs. daqui a 2 meses pode dar resultados diferentes, porque não há amarração temporal nenhuma no dado, só o estado atual da linha. Isso é uma tensão direta com a Regra 1 (determinismo por ciclo) e precisa ser resolvida antes da RPC — ver pergunta 2.1.

Nenhuma menção ao ajuste de R$87,96 foi encontrada em nenhum ponto da cadeia de provMP (código, comentários ou schema).

### 1.2 `coberturaGarantida`

```
coberturaGarantida = max(0, reembolsoSobraPessoal − reembolsoManejo)
```
(`recalcular-necessidade.js:47`)

**Termo A — `reembolsoSobraPessoal`** (`recalcular-reembolsos.js:22-30`):
```
reembolsoPassThroughCorporativo = reembolsoPagaWartsila + reembolsoPagaMPCorporativo + reembolsoPagaCartaoCorporativo
reembolsoSobraPessoal = reembolsoCicloTotal
                         − reembolsoPagaWartsila
                         − reembolsoPagaMPCorporativo
                         − reembolsoPagaCartaoCorporativo
                         − REG.totalOpDetalhe.provMP
```
Os 4 primeiros sub-termos vêm de `hydrate-onda4-wartsila.js:47-56`, mapeados diretamente das colunas reais da tabela `reembolso_wartsila_ciclo` (confirmada no schema: `id, ciclo_referencia, valor_total_bruto, valor_a_receber, perna_fatura_wartsila, perna_mp_corporativo, perna_cartao_corporativo_pessoal, perna_mp_pessoal_provisionado, created_at`), lida via `WallaceFinanceService.getReembolsoWartsilaCicloV2()` (`app.js:884-899`).

**Achado crítico de não-determinismo (já existe hoje, mesmo antes de qualquer RPC)**: a query que busca `reembolso_wartsila_ciclo` usa
```
GET /reembolso_wartsila_ciclo?select=*&order=ciclo_referencia.desc&limit=1
```
ou seja, **sempre pega a linha mais recente da tabela**, nunca filtra por `ciclo_referencia = <ciclo pedido>`. Isso viola a Regra 1 diretamente: o resultado depende de qual é o último ciclo cadastrado no banco no momento da chamada, não do ciclo que está sendo consultado/exibido. Qualquer RPC futura precisa obrigatoriamente adicionar `WHERE ciclo_referencia = p_ciclo`, nunca replicar o "pega o último" atual.

**Termo B — `reembolsoManejo`**: hoje é um literal fixo `VARS.reembolsoManejo = 0` (`vars-reembolsos.js`), comentado como "Manual, zerado por padrão... preencher só quando o usuário confirmar que de fato tirou parte da sobra pra outro destino". Não existe:
- coluna correspondente em `parametros_gerais` (consulta real: `SELECT nome FROM parametros_gerais WHERE nome ilike '%manejo%' OR ilike '%reembolso%'` → vazio);
- input editável na UI (`<span class="v" id="reembManejo">—</span>` — elemento de leitura, sem handler de edição em todo o repositório).

Ou seja: apesar do comentário dizer "manual", **não existe hoje nenhum mecanismo real de edição** — é um zero hardcoded de fato.

---

## 2. O que NÃO ficou comprovado — perguntas objetivas para o usuário

### Bloco A — Ajuste de R$87,96

**A.1.** O ajuste `LIMBO_VIRADA_25_07_NAO_DEBITADO = 87.96` foi criado em 12/08/2026 (commit `44fb996`) para cobrir duas transações reais e específicas — TX000132 (R$56,99, 22/07/2026) e TX000154 (R$30,97, 24/07/2026) — que caíram no "limbo" da virada de ciclo 24/07→25/07 e nunca foram pré-debitadas (o mecanismo `REGRA_LIMBO_FATURA_MB_CICLO` depende de `VARS.caixaVariavelPendenteProximoCiclo` ser preenchido manualmente na virada, o que não aconteceu). O próprio comentário do código e a mensagem de commit classificam isso como **"correção pontual, não recorrente"**, com instrução explícita "não repetir em ciclos futuros sem novo achado". Em 20/08/2026 (commit `53d56a3`) o mesmo valor foi copiado (não recalculado) para um segundo arquivo, para eliminar uma divergência de relatório.

> **Pergunta objetiva**: Esse ajuste de R$87,96 ainda é necessário hoje (agosto/2026), ou as duas transações (TX000132 e TX000154) já foram refletidas corretamente em algum lugar por outro caminho desde então — podendo o ajuste ser zerado/removido?
> - [ ] Ainda é necessário — manter
> - [ ] Já pode ser removido — as transações já estão refletidas por outro caminho
> - [ ] Não sei / preciso checar antes de responder

**A.2.** Não encontrei a definição formal completa da `REGRA_LIMBO_FATURA_MB_CICLO` em nenhum arquivo do repositório verificado (ela é citada por nome, mas não documentada por extenso em `docs/decisions/` nem `docs/changelog/`).

> **Pergunta objetiva**: Essa regra está documentada em algum lugar fora deste repositório (ex.: `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` ou outro doc que eu não tenho acesso)? Se sim, qual arquivo?

**A.3.** Não validei no banco (tabela `transacoes`) se TX000132 e TX000154 realmente existem com os valores/datas citados — a investigação foi restrita a código/git/docs, não a validação contra o Supabase.

> **Pergunta objetiva**: Autoriza consulta ao Supabase (`SELECT * FROM transacoes WHERE tx_legado IN ('TX000132','TX000154')`) para confirmar esses dois lançamentos antes de decidir o destino do ajuste? (sim/não)

### Bloco B — Determinismo de `provMP`

**B.1.** A tabela `parcelas` não tem coluna de ciclo. O `status` (`ativa`/`quitada`) de cada parcela muda ao longo do tempo conforme é paga, então uma RPC `p_ciclo → provMP` não pode reproduzir de forma determinística o valor histórico de um ciclo passado usando só o `status` atual — o mesmo ciclo pode "mudar de resposta" com o tempo.

> **Pergunta objetiva**: Como você quer que a RPC de `provMP` se comporte para ciclos passados?
> - [ ] Opção 1 — Snapshot atual apenas: a RPC só é válida/chamada para o ciclo corrente (comportamento igual ao JS de hoje), e não se compromete a reproduzir ciclos passados corretamente.
> - [ ] Opção 2 — Adicionar rastreamento histórico: criar uma forma de amarrar cada parcela/status a um ciclo (ex.: nova coluna ou tabela de histórico de status), para permitir recálculo determinístico de ciclos passados. (implica mudança de schema, fora do escopo desta rodada)
> - [ ] Opção 3 — Usar `data_prevista` como proxy do ciclo (ex.: parcela pertence ao ciclo em que sua `data_prevista` cai), aceitando que isso pode divergir um pouco da lógica atual de `status`.
> - [ ] Outra ideia sua

**B.2.** Não verifiquei o schema da tabela `transacoes` (ligada via `parcelas.transacao_origem_id`) para saber se ela tem uma coluna de ciclo que poderia servir de caminho indireto.

> **Pergunta objetiva**: Você sabe se `transacoes` tem uma coluna de ciclo (ex. `ciclo_referencia` ou similar) que poderia ser usada para filtrar parcelas por ciclo de origem via join? Se não souber, posso investigar isso na próxima rodada.

### Bloco C — `coberturaGarantida` / `reembolsoManejo`

**C.1.** O comentário do código diz que `reembolsoManejo` é "manual", mas não existe hoje nenhum mecanismo de edição (nem UI, nem RPC, nem coluna em `parametros_gerais`) — é um zero fixo.

> **Pergunta objetiva**: `reembolsoManejo` ainda é um campo que você pretende editar manualmente no futuro (ex.: quando mover parte da sobra para outro destino), ou essa intenção já foi abandonada e pode ser tratado permanentemente como 0 na RPC?
> - [ ] Ainda pretendo usar — precisa virar campo editável (parametros_gerais ou tabela dedicada)
> - [ ] Abandonado — pode ser fixado como 0

**C.2.** A busca de `reembolso_wartsila_ciclo` hoje usa `order=ciclo_referencia.desc&limit=1` (sempre o ciclo mais recente), nunca filtra pelo ciclo pedido — isso já viola a Regra 1 mesmo no JS atual, antes de qualquer RPC.

> **Pergunta objetiva**: Confirma que a RPC deve corrigir esse comportamento, filtrando explicitamente por `ciclo_referencia = p_ciclo` (em vez de "pegar sempre o mais recente")? Isso muda o resultado para consultas de ciclos que não sejam o mais recente — quer que eu valide antes se isso muda algum número que você já usa hoje?
> - [ ] Sim, corrigir para filtrar por p_ciclo — pode mudar resultados de consultas históricas, tudo bem
> - [ ] Preciso ver o impacto antes de decidir

**C.3.** Existe uma tabela `reembolso_wartsila_recebimentos` no schema que não é referenciada em nenhum arquivo de `src/`.

> **Pergunta objetiva**: Essa tabela é usada por algum outro caminho (RPC já existente no banco, processo externo) ou está órfã/reservada para uso futuro e pode ser ignorada nesta migração?

**C.4.** `provMP` (o 4º termo subtraído em `reembolsoSobraPessoal`) tem suas próprias questões de determinismo (Bloco B) — como `coberturaGarantida` depende de `reembolsoSobraPessoal`, que depende de `provMP`, a resposta ao Bloco B afeta diretamente `coberturaGarantida` também. Nenhuma pergunta nova aqui, só o registro da dependência.

### Bloco D — Janela de ciclo (`mbCicloAtualInicio` / `mbDataEstaEmLimbo`), usada em recorrências/assinaturas confirmadas

Essas funções alimentam `VARS.mbLRSConfirmado`, `VARS.mbLRRConfirmado`, `VARS.visaLRRConfirmado` e `REG.totalOpDetalhe.recorrencias/assinaturas` — não são `provMP`/`coberturaGarantida` diretamente, mas foram levantadas na mesma rodada de investigação porque também têm risco de não-determinismo (`new Date()`).

Tradução determinística proposta (**ainda não implementada, é só a lógica equivalente para avaliação**):
```sql
v_ciclo_inicio date := (p_ciclo || '-25')::date;
-- filtro:
x.ultima_cobranca_em >= v_ciclo_inicio
AND NOT (EXTRACT(DAY FROM x.ultima_cobranca_em)::int BETWEEN 22 AND 24)
```
Confirmado no schema real (`wallace_schema_20260822_061233.sql`): `cronograma_assinaturas.ultima_cobranca_em` e `cronograma_recorrencias.ultima_cobranca_em` são colunas `date` nativas — sem os riscos de comparação lexical que o JS original tinha.

**D.1.** O filtro original não tem limite superior (só `>= cicloInicio`, sem teto). No JS isso funciona porque "hoje" está implicitamente sempre dentro do ciclo sendo calculado. Numa RPC chamada com `p_ciclo` arbitrário (ex.: um ciclo histórico), uma data de cobrança futura em relação a `p_ciclo` passaria no filtro sem ser barrada (a menos que caísse por acaso no dia 22-24 de algum mês).

> **Pergunta objetiva**: A RPC deve replicar o comportamento original exatamente (sem teto superior), ou adicionar um teto implícito de `< (mês seguinte a p_ciclo)-25` (fim nominal do ciclo, dia 24 do mês seguinte)?
> - [ ] Replicar sem teto (comportamento idêntico ao JS de hoje)
> - [ ] Adicionar teto — só contar cobranças dentro da janela nominal do próprio ciclo

---

## 3. Recomendação final sobre o ajuste de R$87,96

**Recomendação (não é decisão tomada — aguardando resposta à pergunta A.1 acima): descartar o ajuste na migração para RPC, e não replicá-lo como parâmetro permanente em `parametros_gerais`.**

Justificativa baseada na evidência encontrada:

1. O próprio código-fonte, em **ambos** os arquivos onde o valor aparece, o classifica textualmente como "correção pontual" / "não recorrente", com instrução explícita "não repetir em ciclos futuros sem novo achado equivalente". Isso não é uma leitura minha — é o texto literal deixado pelo agente/usuário que implementou o ajuste.
2. A mensagem dos dois commits (`44fb996` e `53d56a3`) descreve o ajuste como reconciliação histórica ligada a duas transações específicas de julho/2026 (TX000132 e TX000154), não como uma regra de negócio geral aplicável a qualquer ciclo.
3. Um ajuste com essas características — vinculado a duas transações nomeadas de um mês específico — não se encaixa na definição de "parâmetro geral" (algo que se aplica de forma estável e repetida a qualquer ciclo). Promovê-lo a `parametros_gerais` correria o risco de ele ser aplicado indevidamente a ciclos futuros por engano, exatamente o que o comentário original pede para evitar.
4. Ao mesmo tempo, **não há evidência de que as duas transações originais já tenham sido corrigidas por outro caminho** — só a suposição de que, passado tempo suficiente, o problema já deve estar resolvido. Isso é o ponto que falta confirmar (pergunta A.1): se ainda não foi corrigido por outro caminho, descartar sem mais nada faria o sistema voltar a subestimar o Disponível Real em R$87,96, recriando o problema original.

**Alternativa, se a resposta a A.1 for "ainda é necessário"**: mover para `parametros_gerais` como um valor auditável e documentado (não hardcode duplicado em 2 arquivos), mas com metadado explícito de que é um ajuste de reconciliação pontual amarrado às transações TX000132/TX000154 — não uma constante financeira recorrente — e com um lembrete/data de revisão para o usuário reavaliar se ainda se aplica. Essa alternativa só deve ser implementada se o usuário confirmar que o ajuste segue vivo.

Nenhuma das duas opções foi implementada. Aguardando respostas do Bloco A antes de qualquer SQL.

---

## 4. Resumo das perguntas em aberto (checklist rápido para o usuário)

1. **A.1** — R$87,96: manter, remover, ou não sabe?
2. **A.2** — `REGRA_LIMBO_FATURA_MB_CICLO` está documentada em algum lugar fora deste repositório?
3. **A.3** — Autoriza consulta ao Supabase para confirmar TX000132/TX000154?
4. **B.1** — Como a RPC de `provMP` deve tratar ciclos passados (snapshot atual / histórico novo / proxy por `data_prevista` / outra ideia)?
5. **B.2** — Sabe se `transacoes` tem coluna de ciclo utilizável via join com `parcelas`?
6. **C.1** — `reembolsoManejo`: ainda pretende usar manualmente, ou fixar em 0?
7. **C.2** — Confirma corrigir a busca de `reembolso_wartsila_ciclo` para filtrar por `p_ciclo` (em vez de "sempre o mais recente")?
8. **C.3** — `reembolso_wartsila_recebimentos` está em uso por algum caminho fora de `src/`, ou pode ser ignorada?
9. **D.1** — Janela de recorrências/assinaturas: replicar sem teto superior, ou adicionar teto nominal do ciclo?
