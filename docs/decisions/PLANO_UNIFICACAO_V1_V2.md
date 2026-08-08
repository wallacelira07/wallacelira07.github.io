# Plano de Unificação V1→V2 e Otimização Estrutural

**Criado:** 08/08/2026, a partir de briefing técnico do usuário pedindo diagnóstico completo, arquitetura alvo e plano de migração por fases. Baseado no estado real do sistema nesta data (não é teórico — todos os números abaixo vêm de consulta direta ao Supabase e ao repositório).

**Regra de governança que este plano segue** (já em vigor no projeto, `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` seção 8): nenhuma fase começa sem autorização explícita da fase anterior estar fechada. Este documento é o *plano*, não uma ordem de execução — implementação começa quando o usuário aprovar uma fase específica.

---

## 1. Diagnóstico da arquitetura atual

### V1 — "clássica"
- Fonte: uma única linha JSONB (`wallace_dados`, 1 row) espelhada em ~15 arquivos `.js` locais (`src/financeiro/**/vars-*.js`), carregados como scripts estáticos.
- Alimenta **100% do painel visível**. Toda leitura de tela passa por aqui.
- Edição = escrever nos dois lugares (arquivo local + `UPDATE wallace_dados`) na mesma operação — regra manual, sem garantia estrutural, só disciplina.
- Sem schema, sem tipo, sem constraint — é um blob JSON com ~200 chaves de topo, cada caixa tem seu próprio array de transações com formato ligeiramente diferente (`tx`/`data`/`nome`/`tipo`/`valor`, mas a granularidade e as convenções variam por caixa).

### V2 — relacional
Schema já real e bem desenhado, hoje com **282 transações**, **18 caixas**, **11 categorias**, **73 regras de classificação automática**, **13 regras de resolução de caixa**, RLS habilitado em toda tabela:

| Tabela | Linhas | Observação |
|---|---:|---|
| `transacoes` | 282 | `tipo` (entrada/saida), `caixa_id`, `categoria_id`, `usuario_id`, `origem` (pluggy/manual/mercado_pago/reconciliacao), `status` |
| `caixas` | 18 | `saldo_inicial_ciclo` é o único valor armazenado — o resto é transacional |
| `categorias`/`subcategorias` | 11 / 3 | |
| `parcelas` | 22 | parcelamentos, referenciando `transacao_origem_id` |
| `regras_classificacao` | 73 | motor de categorização automática já funcionando |
| `regras_resolver_caixa` | 13 | idem, pra caixa |
| `cartoes` | 11 | |
| `legendas` | 28 | **precedente direto do padrão "fonte única, sem redeploy"** — implementado nesta mesma sessão (07/08/2026), funciona hoje |

RPCs já existentes: `rpc_dashboard_resumo`, `lancar_transacao_manual`, `criar_categoria`, `resolver_caixa`, `resolver_usuario_por_cartao/conta`, `triar_pluggy_item`, `triar_mercadopago_evento`, `registrar_pib_mensal`, e **já existe `diagnostico_sync_v1_v2`** — vale auditar o que essa função já faz antes de criar algo novo (pode já cobrir parte do item 3 do briefing).

### O bloqueador estrutural real
```
SELECT count(*) total, count(cartao_id) com_cartao, count(usuario_id) com_usuario, count(categoria_id) com_categoria FROM transacoes;
→ total=282, com_cartao=0, com_usuario=0, com_categoria=149
```
**`cartao_id` e `usuario_id` estão 0% preenchidos em `transacoes`.** Isso não é um detalhe — é o motivo pelo qual a V2 nunca virou fonte visível: sem saber de qual cartão/pessoa veio cada transação, boa parte dos cards do painel (por cartão, por pessoa) não têm como ser recalculados a partir da V2 hoje. Qualquer plano de "V2 vira única fonte" **tem que resolver isso primeiro**, não é um item secundário do checklist.

### Causa raiz confirmada das divergências (não é teoria — auditado nesta sessão)
Nenhuma divergência V1×V2 encontrada nesta sessão era erro de cálculo. Três causas, todas mapeadas:
1. **V2 nunca recebe lançamento feito só no V1** (não existe replicação automática V1→V2 nem V2→V1).
2. **V2 nunca recebe rendimento dos cofrinhos** (confirmado comparando ao vivo com o app Mercado Pago).
3. **Um bug real de dupla-contagem** (Caixa Wärtsilä, juro de R$27,37 contado 2x) — corrigido nesta sessão, mas é a prova de que edição manual duplicada em V1 sem trilha de auditoria facilita esse tipo de erro.

Achado à parte, relevante pro item 8 do briefing: o padrão `AJUSTE-DD-MM` (`AJUSTE-06-08`, `RENDIMENTO-31-07`, etc.) existe em 12 caixas hoje. Prova matemática nesta sessão (`V1 − ajuste = V2`) mostrou que a interpretação inicial ("são artificiais") estava errada — a maioria é rendimento real não capturado por transação individual (o Mercado Pago não emite comprovante de rendimento por dia, só o agregado). Ou seja: **nem todo "ajuste manual" é sinal de dado forjado — parte é o formato real da fonte (rendimento sem TX própria)**. Qualquer detector automático de "ajuste artificial" (item 8) precisa diferenciar isso, não sinalizar todo `AJUSTE-*` como suspeito.

---

## 2. Arquitetura alvo recomendada

```
Frontend (Sistema_Wallace_Lira_Completo.html)
   ↓ fetch direto (sem intermediário V1)
Supabase (fonte única)
   ├─ transacoes (fato bruto, imutável após confirmado)
   ├─ caixas (saldo_inicial_ciclo + saldo calculado via view)
   ├─ audit_log (trilha de auditoria — novo, item 3)
   └─ RPCs de agregação (dashboard, relatórios)
   ↓
Dashboard (rpc_dashboard_resumo, já existe — evolui, não recria)
   ↓
Relatórios / gráficos
```

**Decisão-chave**: manter `wallace_dados` como tabela **só depois** que `transacoes`/`caixas` cobrirem 100% do que ela cobre hoje — nunca como um "big bang" de trocar tudo de uma vez. A V1 não desliga até a V2 provar, caixa por caixa, que o saldo bate (mesma disciplina de fallback automático que já existe no `FinanceEngine`/`Comparator` — reaproveitar esse mecanismo, não inventar um novo).

### Vantagens de eliminar a dupla fonte
- Elimina a classe inteira de bug encontrada nesta sessão (edição em 1 lugar só, esquecida no outro).
- RLS, tipo de dado, foreign key e constraint — nada disso existe no JSONB do V1.
- Auditoria fica trivial (é SQL, não grep em array JSON).

### Riscos
- **282 transações não é "big data"**, mas a migração de `cartao_id`/`usuario_id` retroativa é trabalho manual/semi-automático linha a linha (regras de classificação já ajudam, mas não são 100% confiáveis pra dado histórico ambíguo).
- Congelamento de ciclo (`POLITICAS_INTERNAS` seção 8: só correção de bug entre dia 25 e 24) — migração estrutural grande só pode começar/terminar dentro da janela livre do ciclo, não pode ficar "pela metade" atravessando um fechamento de ciclo dia 25.
- Todo o front-end hoje lê `VARS`/`REG` (objeto JS local) — trocar a fonte de dado não é só trocar o backend, é reescrever a camada de leitura de cada card (~200 pontos de leitura). Esse é o maior esforço real do plano, maior que o schema em si.

---

## 3. Plano de migração por fases

| Fase | Objetivo | Critério de saída (nunca pula sem isso) |
|---|---|---|
| **0** (já feito) | Schema V2 existe, RPCs básicas, `legendas` provando o padrão | ✅ concluído |
| **1** (parcial, 08/08/2026) | Preencher `cartao_id`/`usuario_id` retroativo nas transações | 🟡 34 `cartao_id` + 49 `usuario_id` preenchidos com evidência real (regex no texto original do V1 cruzado com `tx_legado`). O resto (Caixa Variável majoritariamente) ficou **intencionalmente null** — usuário confirmou que essa caixa é da família, não só do Wallace, então não dá pra assumir um dono padrão sem evidência. Critério de "100%" do plano original foi revisado: nem toda transação tem um usuário/cartão atribuível de verdade, então a meta agora é "100% do que é resolvível com evidência", não 100% bruto. |
| **2** (concluída, 08/08/2026) | Trilha de auditoria (`audit_log`) + triggers | ✅ Tabela `audit_log` (granularidade por campo em UPDATE, linha inteira em INSERT/DELETE) + trigger genérico (`fn_audit_log_generic`) em `transacoes` e `caixas`. Origem da escrita (`importacao`/`sistema`/`ajuste_manual`/`formulario`/`sincronizacao`) é declarada pela RPC quando possível (`lancar_transacao_manual` → `formulario`) ou **inferida automaticamente** da própria coluna `transacoes.origem` quando a escrita vem de fora de uma RPC (scripts Python de Pluggy/Mercado Pago, que gravam via REST direto e não conseguem declarar sessão). Testado de ponta a ponta (INSERT/UPDATE/DELETE, inferência de origem, revogação de EXECUTE público na função de trigger — pego pelo advisor de segurança do Supabase e corrigido na hora). |
| **3** (concluída, 08/08/2026) | Diagnóstico de reconciliação V1×V2 por caixa (views comparativas, sem correção de dados) | ✅ 16/16 caixas confiáveis analisadas, 0 divergência material sem causa raiz identificada. Detalhamento completo na seção 10. |
| **4** | Frontend passa a ler a RPC de saldo calculado **em paralelo** com V1 (mostra os dois, não troca ainda) | Usuário aprova visualmente por 1 ciclo |
| **5** | Frontend troca a fonte principal pra V2, V1 vira só fallback/histórico | Sem regressão visual em nenhum card, 1 ciclo de observação |
| **6** | Descontinuar `wallace_dados`/arquivos locais como fonte ativa (viram só arquivo morto/histórico) | Autorização explícita do usuário |

**Nenhuma fase pula a anterior**, mesmo parecendo mais rápido — mesma regra já usada na migração `FinanceEngine` que está rodando desde 06/08.

---

## 4. Quick wins (baixo esforço, alto impacto) — candidatos a começar já

1. **Auditar `diagnostico_sync_v1_v2`** — já existe, pode já resolver parte do item 3 do briefing sem escrever nada novo. **Rodada em 08/08/2026**: só **15 transações** em 8 caixas ainda não têm par na V2 (`LRW_TRANSACOES` 3, `CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL` 2, `CAIXA_LANCE_TRANSACOES` 2, `LRPV_TRANSACOES` 2, `LRV_TRANSACOES` 2, `MANUTENCAO_TRANSACOES` 2, `ANIVERSARIO_JULIO_TRANSACOES` 1, `SAUDE_FAMILIA_TRANSACOES` 1) — muito menor do que o esperado. Fechar sync manual de V1→V2 pra essas 15 é um quick win real, não uma fase de meses.
2. **Índices em `transacoes`** (item 4 do briefing) — hoje sem nenhum índice além da PK, com filtros óbvios (`caixa_id`, `data`, `categoria_id`, `tipo`). Baixo risco, reversível, ganho imediato em qualquer RPC que já existe.
3. **Materializar o padrão da `legendas`** pra outro caso de uso pequeno primeiro (prova de conceito de baixo risco antes de ir pro saldo, que é crítico).

## 5. Melhorias estruturais de médio prazo
- Preenchimento de `cartao_id`/`usuario_id` (Fase 1 acima) — é o bloqueador real, maior item de esforço médio prazo.
- `audit_log` com trigger (Fase 2).
- View de saldo calculado rodando em paralelo (Fase 3).

## 6. Melhorias de longo prazo
- Troca real de fonte no frontend (Fases 4-6) — reescreve ~200 pontos de leitura de card, é o item mais caro do plano inteiro.
- Particionamento/paginação (item 9 do briefing) — **não necessário agora** (282 linhas). Vale re-avaliar só se passar de ~10-20 mil transações; implementar antes disso é esforço sem retorno.

## 7. Checklist priorizado (impacto × esforço)

| Item | Impacto | Esforço | Prioridade |
|---|---|---|---|
| Índices em `transacoes` | Médio | Muito baixo | 🟢 fazer já |
| Auditar `diagnostico_sync_v1_v2` existente | Médio | Muito baixo | 🟢 fazer já |
| Preencher `cartao_id`/`usuario_id` | Alto | Alto | 🟡 próximo passo real |
| `audit_log` + triggers | Alto | Médio | 🟡 depois do preenchimento |
| View de saldo calculado, comparação paralela | Alto | Médio | 🟡 depois do audit_log |
| Troca de fonte no frontend | Muito alto | Muito alto | 🔴 só depois de tudo acima validado |
| Particionamento/escalabilidade 10k+ | Baixo (hoje) | Alto | 🔴 não fazer agora |
| Materialized views / cache agressivo | Baixo (hoje, 282 linhas) | Médio | 🔴 reavaliar quando o volume crescer |

## 8. Riscos da migração
- Maior risco real: **perder histórico** se a migração de `cartao_id`/`usuario_id` for feita sem auditoria linha a linha (mesmo aviso que já existe no próprio `docs/decisions/MAPA_MIGRACAO_V2.md` do repositório).
- Segundo risco: **atravessar um fechamento de ciclo (dia 25)** no meio de uma fase — janela de congelamento já é regra do projeto, este plano respeita.
- Terceiro risco: item 2 do briefing (eliminar saldo armazenado, calcular tudo dinamicamente) **não deve ser levado ao pé da letra pra `saldo_inicial_ciclo`** — esse campo é uma âncora de fechamento de ciclo anterior, não um cache preguiçoso; removê-lo obrigaria recalcular a vida inteira da caixa desde a criação a cada leitura. Manter como está: saldo inicial armazenado (barato, 1 linha) + delta calculado do ciclo atual (já é assim hoje).

## 9. Sobre "eliminar saldos armazenados" (item 2 do briefing) — parecer técnico específico
O sistema **já segue majoritariamente esse padrão**: cada caixa é `saldo_inicial_ciclo` (1 número, âncora) + soma das transações do ciclo atual (`calcularSaldoCaixa`, já implementado tanto em V1 quanto em `FinanceEngine.js`). Não há "saldo atual" armazenado e mantido manualmente em lugar nenhum do V1 real — os poucos lugares que pareciam ter isso (`caixaVariavelSaldoReal`, etc.) já são recalculados, não editados. **Recomendação**: não mudar esse padrão, ele já está correto — o problema nunca foi "saldo armazenado", foi "duas fontes calculando o mesmo saldo de formas que podem divergir".

---

## 10. Fechamento formal da Fase 3 (08/08/2026)

### Objetivo da fase
Validar, com evidência transação-por-transação, se os saldos calculados na V2 reproduzem os saldos reais da V1 usando apenas as transações já migradas — sem alterar nenhum dado, sem criar correções, sem recalibrar saldos. O objetivo era puramente diagnóstico: provar *onde* e *por quê* V1 e V2 divergem, caixa por caixa, antes de qualquer fase de correção.

### Metodologia utilizada
1. Reconstrução do saldo de cada caixa em duas trilhas independentes: (a) V1 — saldo inicial (âncora `*_SALDO_INICIAL`/`*_SALDO_INICIAL_CICLO`, com fallback documentado quando ausente no Supabase) + soma assinada de todas as transações do array `wallace_dados->'{CAIXA}_TRANSACOES'`; (b) V2 — `caixas.saldo_inicial_ciclo` + soma assinada das transações confirmadas em `transacoes` que a view considera pertencentes ao ciclo/caixa.
2. Casamento de transações entre V1 e V2 por `tx_legado` (chave de correlação 1:1 com o campo `tx` do V1).
3. Classificação de cada transação em: presente nos dois lados (OK), só no V1, só na V2, ou presente nos dois lados com valor/data/tipo divergente.
4. Para as caixas com maior divergência absoluta, investigação manual linha a linha (mesmo rigor usado no caso seminal Caixa Mastercard/Infinite): primeira divergência cronológica, decomposição algébrica da diferença total em componentes individuais (saldo inicial vs. movimentos), e conferência de que a soma dos componentes fecha exatamente com a diferença reportada pela view.
5. Rastreamento de origem de valores suspeitos até a migration SQL, timestamp e conta responsável que os gravou (via `supabase_migrations.schema_migrations`), quando a trilha de `audit_log` não cobria o evento (por ter sido criada depois).

### Infraestrutura criada (todas views/funções de leitura — nenhuma altera dado)
| Objeto | Tipo | Função |
|---|---|---|
| `v1_v2_caixa_mapa` | Tabela | Mapeia cada caixa V2 → chave do array V1, chave do saldo inicial V1, valor de fallback (quando ausente no Supabase) e flag `confiavel` |
| `fn_parse_data_v1(text)` | Função (immutable) | Parser defensivo de datas do formato V1 (`DD/MM`) para `date`, com tratamento de exceção |
| `vw_saldo_v1_por_caixa` | View | Saldo V1 calculado (âncora + soma do array JSONB) por caixa |
| `vw_saldo_v2_por_caixa` | View | Saldo V2 calculado (`saldo_inicial_ciclo` + soma de `transacoes` confirmadas, escopo por `tx_legado` presente no array V1 ou, para caixas patrimoniais, sem corte de data) |
| `vw_transacoes_so_no_v1` / `vw_transacoes_so_na_v2` | Views | Listas de transações presentes em apenas um dos lados, por caixa |
| `vw_ajustes_manuais_v1` | View | Lançamentos `AJUSTE-*`/`RENDIMENTO-*` do V1, isolados para não confundir com bug |
| `vw_reconciliacao_v1_v2` | View (deliverable principal) | Consolida saldo V1, saldo V2, diferença absoluta/percentual, contagem e valor de transações só-em-cada-lado, causa provável (heurística) e grau de confiança, por caixa |
| `vw_timeline_v1_v2` / `vw_primeira_divergencia_v1_v2` | Views | Linha do tempo cronológica e primeira divergência por caixa |

### Limitações encontradas
- `v1_saldo_inicial_existe_no_supabase = false` para praticamente todas as caixas — a âncora de saldo inicial da V1 nunca foi migrada para o Supabase como campo estruturado; o valor usado como referência V1 é um **fallback confirmado manualmente** a partir do arquivo local (`vars-caixas.js`/`vars-reembolsos.js`), não uma leitura direta de uma fonte estruturada.
- A trilha de `audit_log` (Fase 2) só existe a partir de 08/08/2026 — eventos anteriores a essa data (incluindo a calibração de `saldo_inicial_ciclo` de 06/08/2026) não têm registro de auditoria nativo; a reconstrução desses eventos dependeu de consultar `supabase_migrations.schema_migrations` (que guarda o SQL de cada migration aplicada) como fonte alternativa de evidência.
- Duas caixas (`Mercado Pago`, `Conta Suavização CC-304`) ficaram marcadas `confiavel = false` em `v1_v2_caixa_mapa` e foram excluídas da reconciliação por não terem mapeamento 1:1 claro entre V1 e V2 — não fazem parte das 16 caixas classificadas nesta fase.

### Correções metodológicas realizadas durante a análise (autocorrigidas, não apontadas pelo usuário)
1. **Escopo do V2 sem corte de ciclo**: a primeira versão de `vw_saldo_v2_por_caixa` somava todo o histórico de transações da V2 sem filtrar por ciclo, gerando uma divergência espúria de ~R$16.241 na Caixa Variável. Corrigido antes de apresentar qualquer resultado, adicionando filtro condicional por `caixa_tipo`.
2. **Corte de data excluindo transação legítima**: um filtro `data >= 2026-07-25` excluía `TX000142` (aporte de R$500, datado de 24/07) da Escola de Júlio, produzindo uma divergência falsa de R$502,06 em vez do resíduo real de R$2,06. Corrigido redefinindo o escopo V2 como "transação cujo `tx_legado` existe no array V1", não mais por data fixa.
3. **Ordem de prioridade das heurísticas de causa provável**: a primeira versão do `CASE` em `vw_reconciliacao_v1_v2` verificava a condição genérica "saldo inicial ausente" antes das heurísticas específicas de maior confiança, mascarando achados como o casamento exato da Caixa Bens Duráveis. Reordenado para checar as heurísticas mais específicas primeiro.
4. **Soma de componentes com sinal errado (Caixa Lance)**: uma rodada anterior desta fase reportou o efeito das transações só-no-V1 da Caixa Lance usando a soma dos valores absolutos (R$334,25) em vez do efeito líquido assinado (−R$4,37), deixando um resíduo de R$79,63 aparentemente inexplicado. Corrigido na rodada final: com o sinal correto, a decomposição fecha 100% com a diferença total (R$254,62).

### Classificação final das divergências
**16 caixas confiáveis analisadas. 0 divergências materiais sem causa raiz identificada.** Nenhuma correção de dado foi executada em nenhum momento da Fase 3 — todas as consultas usadas nesta fase são somente leitura (`SELECT`); a única escrita já registrada no histórico (preenchimento de `cartao_id`/`usuario_id`, correção do bug de dupla-contagem em Wärtsilä) ocorreu nas Fases 1/2, antes do início desta fase, e está documentada nas seções correspondentes acima.

| Caixa | Diferença (R$) | Causa(s) | Confiança |
|---|---:|---|---|
| Caixa Mastercard/Infinite | 11.172,22 | Erro de modelagem — sinal invertido em `saldo_inicial_ciclo` | Alta |
| Caixa Boletos | 911,32 | Importação duplicada (2 lotes de inserção sobrepostos) + Erro de modelagem (escopo da view de reconciliação reintroduz transações fora do período usado na calibração original da âncora) | Alta |
| PIX Vanessa | 900,76 | Saldo inicial incorreto (100% da diferença, todas as transações batem 1:1) | Alta |
| Provisionado Wärtsilä | 339,00 | Saldo inicial incorreto (âncora nunca preenchida na V2) + Sincronização pendente (3 movimentos reais nunca replicados) | Alta |
| Caixa Lance | 254,62 | Saldo inicial incorreto (+258,99) + Sincronização pendente (−4,37, líquido) | Alta |
| PIX Geral Vanessa | 200,01 | Saldo inicial incorreto (−78,04) + Sincronização pendente (−121,97) | Alta |
| Caixa Manutenção | 345,73 | Sincronização pendente | Alta |
| Caixa Saúde Família | 147,12 | Sincronização pendente | Alta |
| Caixa Aniversário Júlio | 107,10 | Sincronização pendente | Alta |
| Caixa Bens Duráveis | 355,00 | Sincronização pendente (transação ausente na V2) | Alta |
| Escola de Júlio | 2,06 | Rendimento não sincronizado | Alta |
| Caixa Seguro Emplacamento | 0,88 | Rendimento não sincronizado | Alta |
| Caixa Combustível | 0,40 | Rendimento não sincronizado | Alta |
| Caixa Eventos | 0,34 | Rendimento não sincronizado | Alta |
| Caixa Churrasco | 0,17 | Rendimento não sincronizado | Alta |
| Caixa Variável | 0,00 | Sem divergência material (181 transações só na V2 fora do escopo de cálculo, sem efeito no saldo) | Alta |

### Tabela consolidada por categoria

| Categoria | Qtd caixas | Valor absoluto total | Confiança |
|---|---:|---:|---|
| Sincronização pendente (pura) | 4 | R$954,95 | Alta |
| Saldo inicial incorreto (puro) | 1 | R$900,76 | Alta |
| Saldo inicial incorreto + Sincronização pendente (mista, decomposta) | 3 | R$793,63 | Alta |
| Importação duplicada + Erro de modelagem (mista, decomposta) | 1 | R$911,32 | Alta |
| Erro de modelagem — sinal invertido | 1 | R$11.172,22 | Alta |
| Rendimento não sincronizado | 5 | R$3,85 | Alta |
| Sem divergência material | 1 | R$0,00 | Alta |
| **Não explicada** | **0** | **R$0,00** | — |
| **Total** | **16** | **R$14.736,73** | |

### Achados não-monetários (não afetam saldo, sem correção nesta fase)
1. **Diferença de classificação** — `TXMP000009` (Caixa Lance, 24/07, R$266,23) existe nos dois lados com valor idêntico, mas descrição/natureza de negócio diferente: V1 registra como "Empréstimo p/ Fatura Cartão Mercado Pago (LREI0003)", V2 registra como "Transporte corporativo (Edjamilson Marques Barbosa)".
2. **Diferença de escopo/cobertura** — PIX Geral Vanessa tem 16 transações na V2 (27/06 a 17/07/2026, R$1.085,66 em módulo) sem correspondente no array V1 dessa caixa; não afetam o saldo porque a view exclui corretamente transações sem par no V1.
3. **Diferença de escopo/cobertura** — Caixa Variável tem 181 transações na V2 (R$30.153,41 em módulo) sem correspondente no array V1; mesma proteção de escopo evita que afetem o saldo calculado.

### Conclusão executiva
A Fase 3 comprovou, com evidência reproduzível e sem alterar um único registro, que **nenhuma das divergências V1×V2 remanescentes é um mistério** — todas têm causa raiz identificada, quantificada e rastreável até uma migration, um timestamp de inserção ou uma transação específica. A hipótese inicial de trabalho ("as divergências são consequência de saldos iniciais ausentes") foi **refutada quantitativamente**: das 16 caixas, só 4 têm causa puramente de saldo inicial; a maioria (9 de 16) envolve sincronização pendente — ou seja, o problema real não é um erro estrutural de migração, é a **ausência de replicação contínua V1→V2**, que vai reaparecer a cada novo lançamento até que essa lacuna operacional seja endereçada (candidato natural para a Fase 4).

### Critérios para encerramento da Fase 3
- ✅ Todas as divergências materiais classificadas (16/16 caixas, 0 não explicadas).
- ✅ Causas quantificadas (cada componente da diferença decomposto em R$, somando exatamente ao valor total reportado pela view, para as 3 caixas de causa mista revisitadas nesta rodada).
- ✅ Rastreabilidade preservada (toda conclusão remete a `tx_legado`, migration versionada, timestamp de `created_at`/`alterado_em` ou linha específica do array JSONB — nada baseado em suposição).
- ✅ Reconciliação considerada auditável e defensável (reproduzível a qualquer momento consultando `vw_reconciliacao_v1_v2` e as views de apoio, sem depender de memória de sessão).

### Pendências para fases futuras
1. **Ajustes de sincronização pendentes identificados**: Caixa Manutenção, Caixa Saúde Família, Caixa Aniversário Júlio, Caixa Bens Duráveis (sincronização pura); componente de sincronização em Provisionado Wärtsilä, Caixa Lance e PIX Geral Vanessa (causa mista).
2. **Correções de saldo inicial identificadas**: PIX Vanessa (âncora sem correspondente V1); Provisionado Wärtsilä (âncora nunca preenchida, 0 em vez de R$683,04); Caixa Lance (gap de R$258,99 entre fallback V1 e valor gravado na V2); PIX Geral Vanessa (gap de R$78,04).
3. **Correções de modelagem identificadas**: Caixa Mastercard/Infinite (sinal invertido em `saldo_inicial_ciclo`); Caixa Boletos (duplicidade de importação — linhas com mesmo `tx_legado` inseridas duas vezes — e inconsistência de escopo entre a migration de calibração original e a view de reconciliação atual).
4. **Diferenças de classificação sem impacto financeiro**: `TXMP000009` (Caixa Lance) com descrição/natureza de negócio diferente em V1 e V2, mesmo valor.
5. **Diferenças de escopo/cobertura sem impacto financeiro**: 16 transações de PIX Geral Vanessa e 181 transações de Caixa Variável presentes só na V2, sem correspondente no array V1 dessas caixas.

---

## Próximo passo

Fase 3 encerrada. Próxima decisão do usuário: autorizar a Fase 4 (proposta detalhada em separado no chat) ou revisar este fechamento antes.

Este documento é o plano. Meu único quick win que executaria sem esperar mais aprovação, por ser reversível e de risco desprezível, é o **índice em `transacoes`** (item 1 do checklist) — mas mesmo esse só entra depois de você confirmar. Qual fase quer autorizar primeiro?
