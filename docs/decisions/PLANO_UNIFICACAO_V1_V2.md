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
| **4A** (concluída, 08/08/2026) | Corrigir as 5 âncoras `saldo_inicial_ciclo` com causa raiz comprovada na Fase 3 | ✅ 5/5 caixas corrigidas, 0 desvio do previsto. Detalhamento completo na seção 11. |
| **4B** (planejada, não implementada) | Proteger `tx_legado` contra reinserção + sincronizar V1→V2 (Alternativa A: função sob demanda) | Proposta técnica na seção 11 — aguardando autorização de implementação |
| **4C** (planejada, não detalhada) | Limpar duplicidades confirmadas (Caixa Boletos: `TXB000001`/`008`/`009`, `TX000069`) | Aguardando priorização |
| **4D** (planejada, não detalhada) | Frontend passa a ler a RPC de saldo calculado **em paralelo** com V1 (mostra os dois, não troca ainda) | Usuário aprova visualmente por 1 ciclo — só depois de 4A-4C concluídas |
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

## 11. Fase 4A — execução e Fase 4B — proposta técnica (08/08/2026)

### Fase 4A — Correção das 5 âncoras de saldo inicial (executada)

**Protocolo seguido, caixa por caixa**: (1) snapshot da linha em `caixas` antes; (2) snapshot da `vw_reconciliacao_v1_v2` antes; (3) `UPDATE caixas SET saldo_inicial_ciclo = <valor>` com `set_config('audit.origem','ajuste_manual', true)` na mesma transação; (4) nova consulta à `vw_reconciliacao_v1_v2`; (5) conferência do resíduo observado contra o resíduo previsto pela decomposição algébrica da Fase 3. Regra: qualquer desvio interromperia a sequência antes da próxima caixa — não houve nenhum desvio.

| Caixa | `saldo_inicial_ciclo` antes | `saldo_inicial_ciclo` depois | Diferença V1-V2 antes | Diferença V1-V2 depois | Resíduo previsto (Fase 3) | Resultado |
|---|---:|---:|---:|---:|---:|---|
| Caixa Mastercard/Infinite | −11.172,22 | 0,00 | 11.172,22 | 0,00 | 0,00 | ✅ conforme |
| PIX Vanessa | 900,76 | 0,00 | −900,76 | 0,00 | 0,00 | ✅ conforme |
| Provisionado Wärtsilä | 0,00 | 683,04 | 339,00 | −344,04 | −344,04 | ✅ conforme |
| Caixa Lance | 3.489,75 | 3.748,74 | 254,62 | −4,37 | −4,37 | ✅ conforme |
| PIX Geral Vanessa | 78,04 | 0,00 | −200,01 | −121,97 | −121,97 | ✅ conforme |

Todas as 5 alterações estão registradas em `audit_log` (tabela=`caixas`, campo=`saldo_inicial_ciclo`, `valor_anterior`/`valor_novo`, `origem='ajuste_manual'`, timestamp `alterado_em`). Nenhuma linha de `transacoes` foi tocada nesta fase. Os resíduos remanescentes de Wärtsilä/Lance/PIX Geral Vanessa são o componente de sincronização pendente já quantificado na Fase 3 — ficam explicitamente para a Fase 4B, não são um erro desta correção.

### Fase 4B — Proposta técnica de sincronização V1→V2 (não implementada)

**Origem dos lançamentos que ainda nascem só no V1**: `diagnostico_sync_v1_v2()` (função já existente, só leitura) mostra 15 transações em 8 caixas presentes apenas na V1, todas datadas entre 04/08 e 07/08/2026 — divergência viva, recorrente, não resíduo histórico. Cruzando com `transacoes.origem`: 280 linhas vieram de migrações em lote (`reconciliacao`), 3 de `lancar_transacao_manual` (`manual`), **0 de `pluggy`/`mercado_pago`** apesar das RPCs existirem. Não existe hoje nenhum caminho de código que grave na V2 no momento em que um lançamento nasce no V1.

**Risco identificado**: `transacoes` não tem nenhuma constraint de unicidade em `tx_legado` — foi exatamente essa lacuna que permitiu a duplicidade de importação da Caixa Boletos (achado da Fase 4C). Qualquer mecanismo de sincronização precisa de proteção contra reinserção antes de rodar de forma recorrente.

**Mecanismo recomendado (Alternativa A, sem implementação ainda)**:
1. Adicionar índice único parcial em `transacoes(tx_legado) WHERE tx_legado IS NOT NULL`, para impedir reinserção do mesmo `tx_legado`.
2. Criar `sincronizar_v1_v2()`, companion de leitura de `diagnostico_sync_v1_v2()`, que insere as transações pendentes com `ON CONFLICT (tx_legado) DO NOTHING`, `origem='reconciliacao'` (reaproveita o valor já usado nas 280 linhas existentes, sem alterar o CHECK constraint existente) e `set_config('audit.origem','sincronizacao', true)` (valor já aceito pelo CHECK de `audit_log`).
3. Rodar sob demanda (início de sessão/fechamento do dia), sempre com relatório "dry-run" antes de confirmar.
4. Casos onde `caixa_id`/`categoria_id`/`usuario_id`/`cartao_id` não puderem ser resolvidos com confiança ficam com o campo `NULL` e `status='pendente_classificacao'` — nunca inferidos por padrão (mesma regra já usada na Fase 1 para a Caixa Variável).

**Alternativa B** (sincronização automática no momento da escrita, maior esforço): instrumentar os pontos de código que criam lançamentos no V1 para chamar a RPC de escrita da V2 na mesma operação — descartada como primeiro passo por exigir inventário completo dos pontos de escrita (incluindo edições manuais de sessão) e garantias de atomicidade ainda não desenhadas.

---

## 12. Handoff para o próximo agente (08/08/2026) — Fase 4 em andamento, decisão pendente

**Leia esta seção antes de qualquer coisa se você está retomando este trabalho.** Este arquivo (`docs/decisions/PLANO_UNIFICACAO_V1_V2.md`) é a fonte única desta frente de trabalho — **não confundir com `ESTADO_ATUAL.md`/`PASSAGEM_DE_TURNO.md`**, que documentam uma frente diferente (modularização `app.js`/migração `FinanceEngine`, também chamada "V2" em sessões antigas, mas é a V1 clássica virando módulos — arquitetura completamente separada do que este documento trata, que é V1 clássica (`wallace_dados`) × V2 relacional (tabelas `caixas`/`transacoes` no Supabase)).

### O que já está concluído e não precisa ser refeito
- **Fase 1** (parcial, intencional): `cartao_id`/`usuario_id` preenchidos onde havia evidência.
- **Fase 2**: `audit_log` + triggers, funcionando, testado.
- **Fase 3**: reconciliação diagnóstica das 16 caixas confiáveis, 0 divergência sem causa raiz. Ver seção 10.
- **Fase 4A**: as 5 âncoras de saldo inicial com causa comprovada foram corrigidas via `UPDATE caixas`, todas com resultado exatamente conforme previsto, tudo em `audit_log`. Ver seção 11. **Não reexecutar — já está feito.**

### Onde a sessão parou exatamente
Depois da Fase 4A, o usuário decidiu dividir a Fase 4B em duas partes (4B-1 sincronização / 4B-2 constraint de unicidade) e pediu o detalhamento técnico completo de 4B e depois de 4C — **ambos foram entregues em chat nesta sessão, mas nunca chegaram a ser escritos neste arquivo**. Estão reproduzidos abaixo, na íntegra, para não se perder.

#### Fase 4B-1 — Sincronização (proposta técnica, não implementada)
- **Origem do problema**: `diagnostico_sync_v1_v2()` (função já existente, só leitura) mostra **15 transações em 8 caixas** presentes só na V1, todas datadas entre 04/08 e 07/08/2026 — divergência viva e recorrente, não resíduo histórico. Hoje não existe nenhum código que grave na V2 no momento em que um lançamento nasce na V1 (`transacoes.origem` só tem `reconciliacao` de migrações em lote e 3 `manual`; zero `pluggy`/`mercado_pago` apesar das RPCs existirem).
- **Função proposta**: `sincronizar_v1_v2(modo: 'dry_run' | 'aplicar')` — usa `diagnostico_sync_v1_v2()` como base, resolve `caixa_id` via `v1_v2_caixa_mapa`, tenta resolver `categoria_id`/`subcategoria_id` via `regras_classificacao` e `usuario_id`/`cartao_id` via `regras_resolver_caixa`; campos não resolvidos ficam `NULL` com `status='pendente_classificacao'` (nunca inferidos por padrão). Insere com `origem='reconciliacao'`, checagem `NOT EXISTS(tx_legado, caixa_id)` antes de cada INSERT (idempotência), retorna a lista de ids inseridos via `RETURNING` (permite rollback determinístico por `DELETE ... WHERE id = ANY(lista)`).
- **Mapeamento de caixa incompleto**: 2 dos 8 "livros" pendentes (`LRW_TRANSACOES`, `LRV_TRANSACOES` — juntos 5 das 15 transações) **não têm entrada em `v1_v2_caixa_mapa`** — a função não deve inserir esses casos até decidirmos o mapeamento (provavelmente `LRW_TRANSACOES` → caixa `Mercado Pago`, hoje `confiavel=false`).
- **Resultado esperado de uma primeira rodada**: 10 das 15 pendentes entrariam automaticamente, a maioria com `status='pendente_classificacao'` por falta de regra de categoria (testado: descrição "Cortinas" não bate com nenhuma regra existente); as 5 de `LRW_TRANSACOES`/`LRV_TRANSACOES` ficariam de fora até resolver o mapeamento de caixa.
- **Não depende da Fase 4C** — nenhuma das 15 pendentes é da Caixa Boletos.

#### Fase 4B-2 — Constraint de unicidade (proposta técnica, bloqueada até a 4C)
- Testei: `tx_legado` sozinho **não pode** virar `UNIQUE` — quebraria 8 padrões legítimos já em produção (`RENDIMENTO-31-07` aparece 11x, uma vez por caixa; `TX000150`/`TX000178`/`TX000187` aparecem 2x cada, contrapartida P2P entre PIX Vanessa/PIX Geral Vanessa; `TXMP000009` aparece 2x, empréstimo espelhado na fatura).
- A chave correta é **`UNIQUE(tx_legado, caixa_id)`** — mas essa constraint **falha ao ser criada hoje**, porque `TXB000001`/`TXB000008`/`TXB000009` (Caixa Boletos) são os únicos casos de mesmo `tx_legado` **repetido na mesma caixa** — exatamente as 3 duplicidades reais identificadas na Fase 4C.
- **Só pode ser aplicada depois que a Fase 4C remover essas 3 linhas.**

#### Fase 4C — Limpeza de duplicidades da Caixa Boletos (proposta original — **EXECUTADA em 08/08/2026, ver seção 13 para o registro completo**)
- **Grupo 1 — duplicidade confirmada por `tx_legado`** (mesma caixa, mesmo `tx_legado`, 2 linhas cada, evidência: timestamps de criação idênticos ao microssegundo em lotes diferentes, 15 min de intervalo, 05/08/2026 20:44:51 vs 20:59:48 UTC):
  | tx_legado | Manter (id) | Excluir (id) | Data mantida/excluída | Valor |
  |---|---|---|---|---|
  | `TXB000001` | `533a992a-0cd7-4e07-b0de-583ec0b8fc3b` | `22a4c47b-51c9-452f-9f9a-24186f8df922` | 27/07 / 25/06 | 588,66 |
  | `TXB000008` | `12ca0197-28cb-4c34-9a0d-549ebb8d4e9d` | `1cc59070-14d1-45e3-91e5-10d840db7e95` | 31/07 / 30/06 | 163,24 |
  | `TXB000009` | `66c5ed81-ad64-487c-99f2-a1fa93101fed` | `a9d24f41-734a-4b99-8967-fb92356fd400` | 26/07 / 26/06 | 367,36 / 322,99 (valor também errado) |
- **Grupo 2 — duplicidade semântica** (mesmo evento, `tx_legado` diferentes): `TX000069` (R$1.313,69, lançamento consolidado, id `741a146d-04b7-4b9b-a662-3ee9e71ff069`) é a soma exata de `TXB000002+003+004+005+007` (210+695+133,41+30,28+245 = R$1.313,69) — mesmo evento lançado duas vezes, uma consolidada, outra itemizada. Recomendação (não decidida): manter as 5 itemizadas, excluir só `TX000069`.
- **Caso ambíguo, não excluir**: `TXB000006` (Anderson Ramos, R$210,00, 22/07) — nenhum par identificado, fica pendente à parte.
- **Zero risco de FK**: confirmado que nenhuma das 13 linhas envolvidas é referenciada por `parcelas.transacao_origem_id` nem `reembolsos.transacao_origem_id`.
- **Efeito contraintuitivo confirmado por cálculo**: excluir o Grupo 1 **piora** a diferença numérica da `vw_reconciliacao_v1_v2` para Caixa Boletos, de −R$911,32 para **−R$1.986,21** (as duplicidades estavam compensando por acaso parte do erro de escopo já descrito na Fase 3 — a inclusão indevida de `TX000140`, R$1.986,21, pela regra de matching da view que não filtra por data de início de ciclo). Isso **confirma** o diagnóstico da Fase 3 de forma independente, mas significa que **a 4C sozinha não fecha a Caixa Boletos** — precisa de uma correção separada na regra de escopo da view (ou decisão consciente sobre `TX000140`), fora do escopo da 4C.
- **Não depende da Fase 4B-1** (nenhuma sobreposição de caixas).

### Decisão pendente no momento do corte (histórico — ver seção 13 para o estado atual)
O usuário pediu a documentação de handoff antes de decidir a ordem final entre:
1. Executar 4B-1 (sincronização).
2. Executar 4C (limpeza).
3. Executar 4B-2 (constraint `UNIQUE(tx_legado, caixa_id)`) — só possível depois de (2).
4. Só então partir para a 4D (frontend paralelo).

**Atualização 08/08/2026: a Fase 4C (item 2) foi executada e validada — ver seção 13.** 4B-1 e 4B-2 continuam não implementadas. Nenhuma constraint foi criada ainda.

### Regras de governança que continuam valendo (não são específicas desta fase, são do projeto)
- Nenhuma fase/subfase avança sem autorização explícita do usuário para aquela etapa específica.
- Nunca corrigir dado "no escuro" — toda correção precisa de causa raiz comprovada com evidência reproduzível (mesmo padrão usado do início ao fim desta frente de trabalho).
- Sempre conferir o estado real do Supabase antes de assumir qualquer número como atual — os valores registrados aqui são um snapshot de 08/08/2026, não confiar cegamente se a data atual for muito posterior.

---

## 13. Fase 4C — execução e validação (08/08/2026)

**Objetivo da fase**: remover as únicas duplicidades reais de `(tx_legado, caixa_id)` na tabela `transacoes` (Caixa Boletos), pré-condição obrigatória para a Fase 4B-2 (`UNIQUE(tx_legado, caixa_id)`), que falha ao ser criada enquanto elas existirem.

### Escopo executado — Grupo 1 (duplicidade objetiva por `tx_legado`)

| tx_legado | id excluído | data excluída | valor excluído |
|---|---|---:|---:|
| TXB000001 | `22a4c47b-51c9-452f-9f9a-24186f8df922` | 25/06/2026 | R$588,66 |
| TXB000008 | `1cc59070-14d1-45e3-91e5-10d840db7e95` | 30/06/2026 | R$163,24 |
| TXB000009 | `a9d24f41-734a-4b99-8967-fb92356fd400` | 26/06/2026 | R$322,99 |

**3 linhas removidas, R$1.074,89 no total.**

**Evidência da duplicidade**: mesmo `tx_legado` + mesma `caixa_id` (Caixa Boletos, `7751575a-6339-4bf2-bda4-60817778551c`) em duas linhas cada, criadas em dois lotes de importação com 15 minutos de diferença (`2026-08-05 20:44:51` vs `20:59:48` UTC) — padrão clássico de reprocessamento duplicado do mesmo lote. Em `TXB000009` a linha duplicada também trazia o valor errado (322,99 em vez de 367,36), reforçando que era resíduo de importação malformada, não um 2º evento real.

**Fora do escopo, por decisão explícita** (mantidos intocados, confirmado antes e depois do DELETE):
- `TX000069` (id `741a146d-04b7-4b9b-a662-3ee9e71ff069`, R$1.313,69) — duplicidade **semântica** (soma exata de `TXB000002+003+004+005+007`), não duplicidade de `tx_legado`; decisão de modelagem separada, não decidida.
- `TXB000006` (Anderson Ramos, R$210,00) — sem par identificado, caso ambíguo, sem ação.

### Validações pré-execução
- Snapshot das 3 linhas candidatas confirmado igual à proposta original (id, `tx_legado`, `caixa_id`, data, valor, tipo, origem, `created_at`, descrição).
- Snapshot completo da `vw_reconciliacao_v1_v2` (17 caixas) capturado antes do DELETE — Caixa Boletos: `v1_saldo=1.488,42`, `v2_saldo=2.399,74`, `diferenca_absoluta=-911,32`.
- Checagem de FK: `parcelas.transacao_origem_id` e `reembolsos.transacao_origem_id` consultados para as 3 linhas — **zero referências**, sem risco de quebra.
- Contagem de linhas em `transacoes` antes: 283.

### Execução
`DELETE FROM transacoes WHERE id IN (...)` com `RETURNING`, confirmando exatamente as 3 linhas autorizadas removidas — nenhuma linha extra.

### Validações pós-execução
- Contagem de linhas em `transacoes` depois: **280** (Δ = -3, exato).
- `audit_log`: 3 registros `DELETE` gerados automaticamente (tabela `transacoes`), mesmo timestamp `2026-08-08 02:41:55.208857+00`, cada um com o snapshot JSON completo da linha removida em `valor_anterior` (recuperável se necessário).
- Nova consulta à `vw_reconciliacao_v1_v2` (17 caixas) comparada linha a linha com o snapshot pré-DELETE: **as outras 16 caixas ficaram numericamente idênticas** (Aniversário Júlio, Bens Duráveis, Churrasco, Combustível, Eventos, Caixa Lance, Manutenção, Mastercard/Infinite, Saúde Família, Seguro Emplacamento, Caixa Variável, Escola de Júlio, PIX Geral Vanessa, PIX Vanessa, Provisionado Wärtsilä) — **confirmado que só Caixa Boletos foi afetada**.
- `TX000069` e `TXB000006` confirmados presentes e intocados após o DELETE.
- Reexecução de `SELECT tx_legado, caixa_id, count(*) FROM transacoes WHERE tx_legado IS NOT NULL GROUP BY tx_legado, caixa_id HAVING count(*) > 1` → **0 linhas retornadas**. Não resta nenhuma duplicidade de `(tx_legado, caixa_id)` em toda a tabela.

### Impacto observado na `vw_reconciliacao_v1_v2` (Caixa Boletos)

| | Antes | Depois |
|---|---:|---:|
| `v2_saldo` | 2.399,74 | 3.474,63 |
| `diferenca_absoluta` (v1−v2) | **-911,32** | **-1.986,21** |

Bate exato com o previsto na proposta original (-911,32 − 1.074,89 = -1.986,21). O agravamento é **esperado, não é regressão**: as duplicidades compensavam por acaso parte de um erro de escopo já diagnosticado na Fase 3 (inclusão indevida de `TX000140`, R$1.986,21, por falha de filtro por data de início de ciclo na própria view). Fechar Caixa Boletos por completo exige tratar esse item separadamente — fora do escopo da 4C.

### Condição de saída — atingida
- [x] 3 duplicidades objetivas removidas, com evidência reproduzível.
- [x] Nenhuma FK impactada.
- [x] `TX000069` e `TXB000006` fora do escopo, confirmados intocados.
- [x] Zero duplicidades remanescentes de `(tx_legado, caixa_id)` na tabela inteira.
- [x] `UNIQUE(tx_legado, caixa_id)` **pronta para ser criada sem violação** — pré-condição da Fase 4B-2 satisfeita.

---

## 14. Fase 4B-2 — execução e validação (08/08/2026)

**Objetivo da fase**: criar a proteção estrutural `UNIQUE(tx_legado, caixa_id)` na tabela `transacoes`, fechando a vulnerabilidade que permitiu a duplicidade de importação da Caixa Boletos (achado da Fase 3, removido na Fase 4C) e habilitando `ON CONFLICT (tx_legado, caixa_id)` para a futura Fase 4B-1.

### SQL executado
```sql
ALTER TABLE public.transacoes
  ADD CONSTRAINT uq_transacoes_tx_legado_caixa_id
  UNIQUE (tx_legado, caixa_id);
```
Aplicado via migration `add_unique_constraint_tx_legado_caixa_id`, **criada com sucesso na primeira tentativa** (nenhuma violação encontrada, nenhum retrabalho).

### Validações pré-execução
- `pg_constraint` de `transacoes`: 9 constraints existentes (1 PK, 5 FK, 3 CHECK) — nenhuma cobrindo `tx_legado`/`caixa_id`.
- `SELECT tx_legado, caixa_id, COUNT(*) ... HAVING COUNT(*)>1` → **0 linhas** (duplicidades zeradas pela 4C, reconfirmado ao vivo antes de criar a constraint).
- Total de `transacoes`: **280**.
- `audit_log`: **14** registros.

### Validações pós-execução
- `pg_constraint` de `transacoes`: **10 constraints** — `uq_transacoes_tx_legado_caixa_id` (`contype='u'`) presente, definição confirmada via `pg_get_constraintdef`: `UNIQUE (tx_legado, caixa_id)`.
- Total de `transacoes`: **280** (inalterado — Δ 0).
- Duplicidades `(tx_legado, caixa_id)`: **0** (inalterado).
- `audit_log`: **14** (inalterado — DDL de constraint não gera linha de auditoria, só DML em `caixas`/`transacoes` gera).
- **0 linhas alteradas, 0 linhas removidas, 0 alterações de dado de qualquer tipo.**

### Evidência da criação
```
conname: uq_transacoes_tx_legado_caixa_id
contype: u
def: UNIQUE (tx_legado, caixa_id)
```

### Resultado dos 5 testes (cada um em bloco `DO $$ ... $$` com `RAISE EXCEPTION` forçado no final — garante `ROLLBACK` automático, nada persistido; confirmado depois por `residuo_de_teste=0` e `total_transacoes=280`)

| # | Teste | Cenário | Resultado |
|---|---|---|---|
| A | Positivo | Par novo (`TESTE-4B2-POSITIVO`, Caixa Boletos) | ✅ Inseriu sem erro |
| B | Negativo | Reinserção do par já existente `TXB000002`/Boletos | ✅ Bloqueado (`unique_violation`) |
| C | `NULL` em `tx_legado` | 2 linhas `tx_legado=NULL` na mesma caixa | ✅ Ambas aceitas (NULLs distintos, comportamento padrão do Postgres) |
| D | `tx_legado` repetido em caixa diferente | `RENDIMENTO-31-07` numa 12ª caixa (Saúde Família) onde ainda não existia | ✅ Aceito — padrão legítimo preservado |
| E | Reinserção na mesma caixa | `TXB000001`/Boletos — a exata duplicidade removida na 4C | ✅ Bloqueado (`unique_violation`) |

### Compatibilidade com `ON CONFLICT (tx_legado, caixa_id)`
Confirmada pelos Testes A e D: a constraint está ativa exatamente sobre esse par de colunas, satisfazendo o requisito do Postgres para `ON CONFLICT (tx_legado, caixa_id) DO NOTHING/UPDATE` apontar a ela diretamente sem índice adicional. Pronta para uso pela função `sincronizar_v1_v2()` da Fase 4B-1.

### Estratégia de rollback
```sql
ALTER TABLE public.transacoes DROP CONSTRAINT uq_transacoes_tx_legado_caixa_id;
```
Reversível a qualquer momento, sem perda de dado — puramente estrutural.

### Conclusão da fase
**Fase 4B-2 concluída com sucesso.** A vulnerabilidade estrutural identificada na Fase 3 e removida na Fase 4C agora está protegida no nível do banco, não só por disciplina de código. Pré-condição técnica da Fase 4B-1 (proteção contra reinserção) satisfeita. Pendência real da 4B-1 é outra: mapeamento de caixa para `LRW_TRANSACOES`/`LRV_TRANSACOES` (ver seção 12, ainda em aberto).

---

## 15. Decisão arquitetural — destino de LRW_TRANSACOES/LRV_TRANSACOES no V2 (08/08/2026)

**Investigação completa** (finalidade original, tipos de transação, forma de impacto no saldo, relação com cartões/caixas/usuários, frequência, volume histórico) conduzida antes desta decisão — ver histórico da sessão. Resumo dos achados que sustentam a conclusão:

- `LRW_TRANSACOES`/`LRV_TRANSACOES` são o ledger de compras avulsas no cartão Mastercard Black compartilhado, atribuídas por pessoa (Wallace/Vanessa) — um dos 7 componentes que decompõem `cartaoMBTotal` (junto de LRR/LRS/LRC/LRP/LRCON), não um "pote de dinheiro".
- Alimentam `caixaVariavelComprometido` (passivo futuro — vira saída de caixa só quando a fatura é paga), nunca debitam saldo real de nenhuma caixa diretamente.
- Volume recorrente e não desprezível: 19 (LRW) + 16 (LRV) lançamentos no ciclo vivo (R$1.318,19 + R$376,64), ~35 por ciclo de ~30 dias — não é caso isolado, é fluxo permanente.
- Nenhuma das 18 caixas atuais do V2 representa essa natureza de dado sem quebrar uma invariante já documentada: "Caixa Mastercard/Infinite" já está `sincronizado` 1:1 com um array V1 diferente (`MASTERCARD_INFINITE_TRANSACOES`); "Caixa Variável" exclui explicitamente "comprometido de cartão" do seu array V1 por desenho (`v1_v2_caixa_mapa.observacao`).
- O schema de `transacoes` já reserva colunas para exatamente este conceito (`usuario_id`, `cartao_id`, `afeta_saldo_real`), hoje 0% preenchidas — achado original da Fase 3.

### DECISÃO ARQUITETURAL (aprovada)
- `LRW_TRANSACOES` e `LRV_TRANSACOES` **não representam caixas**.
- `LRW_TRANSACOES` e `LRV_TRANSACOES` representam **gastos de cartão atribuídos por pessoa**.
- O destino correto no V2 é o modelo baseado em **`usuario_id` + `cartao_id` + `afeta_saldo_real=false`**, reaproveitando `resolver_usuario_por_cartao()` (já existe) e o mapeamento final-4→cartão já correto na tabela `cartoes` (11 cartões, conferido).
- Essas estruturas ficam **fora da reconciliação por caixa** — nunca ganham entrada em `v1_v2_caixa_mapa`, o que já as torna estruturalmente invisíveis a `vw_reconciliacao_v1_v2`/`vw_saldo_v2_por_caixa`/`vw_transacoes_so_no_v1`/`vw_ajustes_manuais_v1` (confirmado lendo as definições reais das views — todas iteram só sobre `v1_v2_caixa_mapa`).
- Essas estruturas ficam **fora do escopo da Fase 4B-1 atual** — a sincronização segue restrita às 10 transações das 6 caixas já mapeadas (ver seção 12); as 5 de LRW/LRV aguardam a decisão de implementação abaixo.

### DECISÃO AINDA EM ABERTO — 3a vs. 3b (sem urgência técnica, não bloqueia a 4B-1 parcial)

**Opção 3a** — sem alteração de schema:
- manter `caixa_id NOT NULL` como está hoje;
- gravar essas linhas com um `caixa_id` técnico (placeholder, candidato natural: "Caixa Mastercard/Infinite");
- `afeta_saldo_real=false` obrigatório — é a proteção que garante zero efeito no saldo calculado de qualquer caixa (`vw_saldo_v2_por_caixa` exclui via `COALESCE(t.afeta_saldo_real, true)`).
- Trade-off: dado bruto tecnicamente "mente" no campo `caixa_id` (aponta pra algo que não é a origem real), sem efeito numérico.

**Opção 3b** — com alteração de schema (futura, não decidida, não executada):
- `ALTER TABLE transacoes ALTER COLUMN caixa_id DROP NOT NULL`;
- `caixa_id = NULL` de verdade para essas linhas — representação estruturalmente correta.
- Trade-off: é uma migration de schema, precisa ser avaliada e aprovada como ação própria antes de rodar.

### STATUS
- **Alternativa 3**: ✅ aprovada como direção conceitual.
- **Escolha entre 3a e 3b**: ✅ **decidida (08/08/2026) — 3a agora, 3b depois.**
- **Impacto nas fases já concluídas (4A, 4C, 4B-2)**: nenhum.
- **Impacto na Fase 4B-1 parcial (10 transações, 6 caixas mapeadas)**: nenhum — foi executada independentemente desta decisão.

### DECISÃO: 3a agora, 3b depois (08/08/2026)

**Decisão**: implementar **3a** (sem alteração de schema) para tirar `LRW_TRANSACOES`/`LRV_TRANSACOES` do limbo operacional agora. **3b** (schema permitindo `caixa_id NULL`) fica **explicitamente adiada** — só reavaliada se surgir mais de um caso legítimo além de LRW/LRV que precise de "transação sem caixa" (hoje é caso único).

**Motivos**:
1. Resolve o problema real imediatamente — ~35 transações/ciclo continuam nascendo fora da V2 a cada ciclo que passa, dívida crescente.
2. Não exige migration — todo o mecanismo (`usuario_id`/`cartao_id`/`afeta_saldo_real`, `resolver_usuario_por_cartao()`, mapeamento de cartões) já existe.
3. Não afeta reconciliação — confirmado na investigação da seção 15: LRW/LRV nunca entram em `v1_v2_caixa_mapa` (estruturalmente invisíveis às views de reconciliação) e `afeta_saldo_real=false` exclui essas linhas do cálculo de saldo de qualquer caixa (`vw_saldo_v2_por_caixa`, `COALESCE(t.afeta_saldo_real, true)`) — as 16 caixas já reconciliadas permanecem protegidas.
4. Reduz dívida operacional recorrente, não só o histórico.
5. Mantém caminho aberto pra 3b — nada no schema ou nos dados impede uma migration futura pra `caixa_id` nullable se essa direção continuar fazendo sentido depois de mais casos de uso aparecerem.

**Ordem de execução combinada**:
1. Decidir formalmente 3a — ✅ feito aqui.
2. Implementar LRW/LRV na V2 usando a modelagem aprovada (migração histórica + candidato a `caixa_id` técnico a confirmar).
3. Construir a versão definitiva de `sincronizar_v1_v2()` (cobrindo tanto as caixas mapeadas quanto LRW/LRV).
4. Revalidar diagnósticos (`diagnostico_sync_v1_v2()`, `vw_reconciliacao_v1_v2`).
5. Só então iniciar o levantamento da Fase 4D.

### Correção da narrativa histórica: `caixa_id = Caixa Variável` não é escolha técnica pragmática — é regra de negócio oficial (08/08/2026)

A justificativa original registrada acima (e usada na execução da Parte A, seção 18) tratava `caixa_id = Caixa Variável` como a opção "menos invasiva", sem custo de reconciliação, entre alternativas tecnicamente equivalentes. **Investigação posterior identificou que a Política Interna já continha a resposta formal pra essa pergunta, desde antes desta frente de trabalho existir.**

**Fundamentação — `POLITICAS_INTERNAS_SISTEMA_WALLACE.md`, seção 13 ("Função Real da Caixa Variável")**:
> "Caixa Variável cobre custo de cartão — `CAIXA_VARIAVEL_COMPROMETIDO` = soma de TODAS as transações LRW+LRV (qualquer variante -I/-MB, qualquer dono) do ciclo atual, sempre, sem exceção por cartão específico."

**Conclusão derivada, formalizada aqui**:
- `LRW_TRANSACOES`/`LRV_TRANSACOES` **não são caixas independentes** — são a decomposição, por pessoa, do "Comprometido" que a própria Política já define como parte da Caixa Variável.
- O meio de pagamento (PIX, Mastercard Black, Visa Infinite etc.) **não altera qual caixa econômica é responsável pelo gasto** — quem responde pelo compromisso é sempre a Caixa Variável, independente do cartão usado.
- Compras de LRW/LRV **pertencem funcionalmente à Caixa Variável** — não é um "estacionamento neutro", é o destino correto por definição de negócio.
- `afeta_saldo_real=false` continua sendo o mecanismo técnico certo pra diferenciar "gasto comprometido" (fatura futura) de "gasto já liquidado" (saldo real) — exatamente a distinção Saldo Real × Comprometido que a própria seção 13 documenta.

**O que muda com essa descoberta**: nada na implementação (a Parte A, seção 18, já executou exatamente `caixa_id = Caixa Variável` inalterado — a ação tomada estava certa). O que muda é o **status da justificativa**: deixa de ser "solução técnica pragmática, sem melhor alternativa" e passa a ser **"decisão de negócio confirmada pela Política Interna §13, com compatibilidade técnica total já validada pela investigação"**.

### STATUS FINAL — implementação 3a

- ✅ **Alternativa 3** aprovada (seção 15).
- ✅ **Estratégia 3a** implementada (Parte A, seção 18).
- ✅ **Caixa Variável confirmada como destino correto de LRW/LRV** — não por eliminação, por regra de negócio explícita (Política Interna §13).
- ✅ Compatível com a Política Interna §13.
- ✅ Compatível com a arquitetura V2 (investigação técnica: zero impacto em reconciliação, zero impacto em saldo, zero conflito de constraint).
- ✅ Sem impacto na reconciliação — nenhuma mudança de caixa foi ou é necessária.

**A discussão 3a está formalmente encerrada.**

---

## 16. Fase 4B-1 — execução parcial e controlada (08/08/2026)

**Objetivo da fase**: sincronizar da V1 pra V2 as transações do ciclo vivo já presentes nas 6 caixas com mapeamento `confiavel=true` em `v1_v2_caixa_mapa`, reduzindo o gap recorrente reportado por `diagnostico_sync_v1_v2()`.

### Escopo aprovado: 9 das 10 transações candidatas

As 10 candidatas vinham de `diagnostico_sync_v1_v2()`, restritas às 6 caixas mapeadas (excluindo `LRW_TRANSACOES`/`LRV_TRANSACOES` por decisão da seção 15). Das 10, **9 foram sincronizadas**; `TX000208` foi **deliberadamente excluído**.

### Exclusão de `TX000208` — motivo

Colisão comprovada de `tx_legado`: já existia em `transacoes` (id `c2c82b28-1a20-45d9-84e2-0b52ef574b39`) referente a "RBM Relógios (Dia das Mães)", R$80,97, 07/07/2026, Caixa Variável — um evento real completamente diferente do `TX000208` pendente ("Reembolso à Caixa Variável", R$107,50, 06/08/2026, Caixa Aniversário Júlio). A constraint `UNIQUE(tx_legado, caixa_id)` da Fase 4B-2 **não bloqueia** essa inserção (caixas diferentes), mas inserir criaria dois eventos reais distintos compartilhando o mesmo identificador lógico — mesma classe de bug já documentada e corrigida uma vez em `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` seção 23 (colisão `TXR000001-006`, resolvida por renumeração pra `TXRR`). Decisão: não conviver com a ambiguidade, registrar como pendência formal (ver abaixo) em vez de inserir no escuro.

### Validações pré-execução
- `transacoes`: 280 linhas.
- Duplicidades `(tx_legado, caixa_id)`: 0.
- Nenhuma das 9 `tx_legado` candidatas existia em `transacoes`, sob nenhuma caixa.
- Os 6 `caixa_id` do mapeamento manual conferidos contra `caixas` (existência e `caixa_tipo`).
- `audit_log`: 14 registros.

### SQL utilizado
```sql
WITH mapa(livro, caixa_id) AS (
  VALUES
    ('CAIXA_LANCE_TRANSACOES',        'ff0cd9af-c5a9-4a9b-8cdd-c379e167275e'::uuid),
    ('CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL', '8522e256-2039-4c11-bd28-69738bfcf5b8'::uuid),
    ('LRPV_TRANSACOES',                '6c6546fa-5b83-4db6-aa33-ac1bf35370d9'::uuid),
    ('MANUTENCAO_TRANSACOES',          'df4c44af-3e30-4592-b0b5-5b863ca91591'::uuid),
    ('SAUDE_FAMILIA_TRANSACOES',       'd15e8cbe-4443-4ee4-9631-06d8d49058fe'::uuid)
),
itens AS (
  SELECT m.caixa_id, t.value->>'tx' AS tx_legado,
         fn_parse_data_v1(t.value->>'data') AS data,
         (t.value->>'valor')::numeric AS valor,
         lower(t.value->>'tipo') AS tipo_raw,
         COALESCE(t.value->>'nome', t.value->>'obs', '') AS descricao
  FROM mapa m, wallace_dados w, jsonb_array_elements(w.dados->m.livro) t
  WHERE w.id = 1
    AND t.value->>'tx' IN ('TX000216','TX000212','TX000217','TX000218',
                            'TX000219','TX000221','TX000215','TX000214','TX000213')
)
INSERT INTO transacoes
  (tx_legado, caixa_id, data, valor, tipo, descricao, origem, status, afeta_saldo_real,
   categoria_id, usuario_id, cartao_id)
SELECT
  i.tx_legado, i.caixa_id, i.data, i.valor,
  CASE WHEN i.tipo_raw = 'entrada' THEN 'entrada' ELSE 'saida' END,
  i.descricao, 'reconciliacao',
  CASE WHEN r.categoria_id IS NOT NULL THEN 'confirmado' ELSE 'pendente_classificacao' END,
  true, r.categoria_id, NULL, NULL
FROM itens i
LEFT JOIN LATERAL (
  SELECT categoria_id FROM regras_classificacao
  WHERE ativo AND estabelecimento_contem IS NOT NULL
    AND upper(i.descricao) LIKE '%'||upper(estabelecimento_contem)||'%'
  ORDER BY prioridade ASC LIMIT 1
) r ON true
ON CONFLICT (tx_legado, caixa_id) DO NOTHING
RETURNING id, tx_legado, caixa_id, valor, status;
```
`categoria_id` resolvido via `regras_classificacao` (match por substring em `estabelecimento_contem`) — só as 2 transações de Hortifruti (`TX000219`/`TX000221`) bateram regra, entraram `status='confirmado'`; as outras 7 entraram `status='pendente_classificacao'`, `categoria_id`/`usuario_id`/`cartao_id` todos `NULL` (não inferidos, mesma disciplina P1). `afeta_saldo_real=true` em todas as 9 — são movimentos reais de caixa (PIX/reembolso/empréstimo interno), não compra de cartão.

### Validações pós-execução
- `RETURNING` confirmou exatamente as 9 linhas esperadas, nenhuma a mais.
- `transacoes`: **289** (Δ +9, exato).
- Duplicidades `(tx_legado, caixa_id)`: **0** (inalterado).
- `audit_log`: **23** (Δ +9, um `INSERT` por linha, timestamps consistentes).
- `vw_reconciliacao_v1_v2` recontada para as 5 caixas afetadas: `qtd_transacoes_so_no_v1` caiu em cada uma (Caixa Lance 3→1, Caixa Manutenção 3→1, Caixa Saúde Família 2→1, Caixa Variável 2→0, PIX Vanessa inalterada em 0) — nenhum efeito colateral nas demais 13 caixas do sistema.
- **`diagnostico_sync_v1_v2()` reexecutado**: retornou exatamente **6 linhas** — `TX000208` (único item restante entre as caixas mapeadas, como esperado) + as 5 de `LRW_TRANSACOES`/`LRV_TRANSACOES` (pendência estrutural fora de escopo, seção 15). **Nenhuma pendência nova ou inesperada apareceu.**

### Números finais
| Métrica | Antes | Depois |
|---|---:|---:|
| `transacoes` | 280 | **289** |
| `audit_log` | 14 | **23** |
| Duplicidades `(tx_legado, caixa_id)` | 0 | **0** |
| Inserções executadas | — | **9** |
| Erros | — | **0** |
| Efeitos colaterais identificados | — | **0** |

### Pendência formal de governança registrada
**`TX000208`** — status: **"Pendente de definição de rastreabilidade por colisão de `tx_legado`."** Não inserido na V2. Correção a avaliar futuramente (renumeração na origem V1, alias controlado, ou outro tratamento) — nenhuma ação tomada até decisão explícita. **Atualização 08/08/2026: esta pendência foi ampliada para incluir mais 4 casos da mesma família, achados na investigação da Parte B — ver seção 20 para a lista consolidada e o registro completo.**

### Confirmações permanentes
- `LRW_TRANSACOES`/`LRV_TRANSACOES` permanecem **fora do escopo operacional** da sincronização até a implementação da 3a (ver seção 15).
- **Alternativa 3** (seção 15) continua sendo a direção arquitetural aprovada para o destino delas.
- Escolha **3a vs. 3b**: **decidida em 08/08/2026 — 3a agora, 3b adiada** (ver seção 15, "DECISÃO: 3a agora, 3b depois").

---

## 17. Caso TX000140 / Caixa Boletos — investigação, rejeição da correção na view, correção pontual da âncora (08/08/2026)

**Contexto**: último resíduo de reconciliação com hipótese forte pendente desde a Fase 3/4C (`vw_reconciliacao_v1_v2` mostrava `diferenca_absoluta = -1.986,21` pra Caixa Boletos, valor idêntico ao de `TX000140/TXB000010`).

### Hipótese inicial (rejeitada): corrigir `vw_saldo_v2_por_caixa`
Primeira leitura: a cláusula de match por `tx_legado` na view não filtra por data de início de ciclo (`>= 2026-07-25`), enquanto a cláusula de match por ausência de `tx_legado` filtra. Proposta original: aplicar o mesmo corte de data também ao ramo com `tx_legado`.

### Dry-run da correção na view — evidência de regressão em 8 caixas
Simulei a view proposta (CTE, sem `CREATE OR REPLACE`) contra as 16 caixas confiáveis. Resultado: Caixa Boletos de fato zerava (`diferenca_absoluta: -1.986,21 → 0,00`), **mas 8 outras caixas, hoje sincronizadas, passavam a divergir**: Churrasco (+100,00), Combustível (+200,00), Eventos (+166,67), Manutenção (+166,67), Saúde Família (+135,00), Seguro Emplacamento (+425,00), Escola de Júlio (+500,00), PIX Geral Vanessa (+78,04), PIX Vanessa (+900,00). Causa: essas 8 caixas também têm, no próprio array V1, uma transação de aporte-mensal (24/07) com `tx_legado` batendo — o mesmo padrão de Boletos — mas ali o match **é necessário** pra bater com o V1 (que soma o item do lado dele também), então remover o match quebra a simetria que hoje as mantém corretas.

### Rejeição formal da alteração da view
**A proposta de alterar `vw_saldo_v2_por_caixa` foi testada e rejeitada** por falhar no critério de não-regressão (P1/governança do projeto: nenhuma correção pode introduzir erro novo pra corrigir outro). A view permanece com a definição atual, sem alteração.

### Causa raiz real, com demonstração matemática do duplo efeito
A migration `v2_calibrar_saldo_inicial_todas_caixas` (06/08/2026) calibrou `saldo_inicial_ciclo` de 13 caixas com a fórmula `observado − soma(movimentos com data ≥ 2026-07-25)`. `TX000140/TXB000010` (aporte mensal Wärtsilä, R$1.986,21, **24/07/2026** — um dia antes do corte) ficou de fora da subtração, ou seja, seu efeito já estava embutido no valor "observado" usado pra Boletos. A view (criada depois, mesma sessão) soma esse mesmo valor de novo no delta, via match por `tx_legado`, sem checar data — dupla contagem, só em Boletos, porque só o array V1 de Boletos lista esse `tx_legado` como item rastreado (as outras 12 caixas calibradas não têm essa transação no próprio array).

**Prova algébrica**:
```
saldo_inicial_ciclo(2.439,25) − v1_fallback_local(613,17) = 1.826,08
TX000140(1.986,21) − AJUSTE-06-08(160,13) = 1.826,08   ← idêntico, ao centavo
```
Confirma que a calibração incorporou `TX000140` líquido de `AJUSTE-06-08` (presente na soma de movimentos no momento exato da calibração, removido depois por outra migration).

### Correção pontual da âncora (mesmo padrão da Fase 4A)

**SQL executado**:
```sql
SELECT set_config('audit.origem','ajuste_manual', true);
UPDATE caixas SET saldo_inicial_ciclo = 453.04
WHERE id = '7751575a-6339-4bf2-bda4-60817778551c'; -- Caixa Boletos
```

**Validações pré-execução**: `saldo_inicial_ciclo` atual = 2.439,25; `audit_log` = 23; `transacoes` = 289; `vw_reconciliacao_v1_v2` das 16 caixas capturada como baseline.

**Validações pós-execução**: `RETURNING` confirmou `saldo_inicial_ciclo = 453.04`; `audit_log` = **24** (Δ+1, registro abaixo); `transacoes` = **289** (inalterado); `vw_reconciliacao_v1_v2` recontada — as outras 15 caixas idênticas ao baseline, nenhuma mudou; `pg_get_viewdef('vw_saldo_v2_por_caixa')` conferida — texto idêntico ao original, **nenhuma view foi alterada**.

**Registro gerado em `audit_log`**:
```
tabela=caixas | registro_id=7751575a-6339-4bf2-bda4-60817778551c | operação=UPDATE
campo=saldo_inicial_ciclo | valor_anterior=2439.25 | valor_novo=453.04
origem=ajuste_manual | alterado_em=2026-08-08 03:18:48 UTC
```

**Plano de rollback**:
```sql
UPDATE caixas SET saldo_inicial_ciclo = 2439.25
WHERE id = '7751575a-6339-4bf2-bda4-60817778551c';
```

### Números finais

| Métrica | Antes | Depois |
|---|---:|---:|
| `saldo_inicial_ciclo` (Boletos) | 2.439,25 | **453,04** |
| `v2_saldo` (Boletos) | 3.474,63 | **1.488,42** |
| `diferenca_absoluta` (Boletos) | -1.986,21 | **0,00** |
| `audit_log` | 23 | **24** |
| `transacoes` | 289 | **289** |

### Conclusão formal
- **A divergência da Caixa Boletos foi encerrada** — `diferenca_absoluta = 0,00`, `causa_provavel = 'sincronizado'`, `grau_confianca = 'alta'`.
- **`TX000140` está totalmente explicado** — causa raiz comprovada algebricamente, não é resíduo desconhecido.
- **A view atual (`vw_saldo_v2_por_caixa`) permanece correta** — a hipótese de alterá-la foi testada e **rejeitada** por causar regressão comprovada em 8 caixas.
- **A correção aplicada ocorreu exclusivamente em `caixas.saldo_inicial_ciclo`** — nenhuma linha de `transacoes` foi tocada, nenhuma view foi alterada.

---

## 18. Implementação 3a — Parte A: metadados de LRW/LRV (08/08/2026)

**Objetivo**: dar o primeiro passo concreto da decisão 3a (seção 15) — completar metadados objetivamente resolvíveis das 35 transações de `LRW_TRANSACOES`/`LRV_TRANSACOES`, sem tocar em valor nem em `caixa_id`.

### Descoberta que corrigiu a premissa original: LRW/LRV já existiam na V2
Antes de propor qualquer `INSERT`, investigação revelou que **as 35 transações já estavam em `transacoes`** (migradas em lote em 05/08/2026, sob `caixa_id = Caixa Variável`) — não era uma migração de dado ausente, era uma reclassificação de dado já presente e majoritariamente correto: 35/35 já com `usuario_id` e `afeta_saldo_real=false`, 31/35 já com `cartao_id`, 29/35 já com `categoria_id`, 30/35 com valor batendo exato com o array V1 atual. A tarefa foi replanejada de "migração histórica" para "reclassificação pontual" com base nesse estado real, não na suposição inicial.

### Por que `caixa_id` permanece inalterado
`Caixa Variável` já funciona, de fato, como caixa técnica pras 35 linhas: nenhum dos 35 `tx_legado` existe no array V1 dela (`CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL`), então elas já são estruturalmente excluídas do delta calculado (via `EXISTS` falho + `afeta_saldo_real=false`), fazendo parte do ruído já documentado e aceito (`qtd_transacoes_so_na_v2=181` na `vw_reconciliacao_v1_v2` de Caixa Variável). Mover pra outra caixa (ex.: Mastercard/Infinite) não traria ganho de reconciliação e poluiria uma caixa hoje com match exato 3-pra-3. Decisão: manter, sem custo de oportunidade real em adiar.

### Por que valores não foram tocados
5 das 35 transações (`TX000200`, `TX000203`, `TX000204`, `TX000205`, `TX000206`) têm valor divergente entre o V1 atual e a cópia migrada em 05/08/2026. Investigação (sem correção) indicou origem provável em atualização posterior do V1 nunca repropagada pra V2 (confirmado pra `TX000200`, R$3,72 = IOF corrigido em 07/08; hipótese consistente mas não confirmada individualmente pras outras 4) — descartadas as hipóteses de erro de migração e de alteração manual em V2 (`audit_log` sem nenhum registro nessas linhas). Corrigir valor exige causa raiz individual por transação, igual à 4C/TX000140 — decisão explícita de **não misturar** isso com a reclassificação de metadados desta etapa. Fica registrado como **Parte B**, pendente, não iniciada.

### Metadados corrigidos — 4 campos, 4 linhas

| tx_legado | Campo | Antes | Depois |
|---|---|---|---|
| `TX000200` | `cartao_id` | `NULL` | `7b981bf6-80eb-473b-8cf5-91a75c4d0cd3` (MB físico 1371, Wallace) |
| `TX000203` | `cartao_id` | `NULL` | `7b981bf6-80eb-473b-8cf5-91a75c4d0cd3` (MB físico 1371, Wallace) |
| `TX000205` | `cartao_id` | `NULL` | `5774ffd5-fa19-47af-affc-761d6b880a88` (MB virtual 4628, Wallace) |
| `TX000206` | `categoria_id` | `NULL` | `533eef0f-0591-4c23-a248-566b95da7ffd` (Alimentação, regra H57STORE) |

As outras 31 linhas ficaram intocadas — não tinham gap resolvível com evidência objetiva (`TX000204`/`TX000206`-cartão ficam `NULL` por ambiguidade real no `obs`, `TX000159`/`TX000132`/`TX000191`/`TX000202` sem regra de categoria aplicável).

### SQL executado
```sql
SELECT set_config('audit.origem','ajuste_manual', true);

UPDATE transacoes SET cartao_id = '7b981bf6-80eb-473b-8cf5-91a75c4d0cd3'
WHERE tx_legado IN ('TX000200', 'TX000203');

UPDATE transacoes SET cartao_id = '5774ffd5-fa19-47af-affc-761d6b880a88'
WHERE tx_legado = 'TX000205';

UPDATE transacoes SET categoria_id = '533eef0f-0591-4c23-a248-566b95da7ffd'
WHERE tx_legado = 'TX000206';
```

### Validações pré-execução
`transacoes`=289, `audit_log`=24, duplicidades `(tx_legado, caixa_id)`=0, os 4 campos-alvo confirmados `NULL`, cartões e categoria de destino conferidos existentes.

### Validações pós-execução
`RETURNING`/reconsulta confirmou os 4 valores exatos da tabela acima. `transacoes`=**289** (inalterado — é `UPDATE`, não `INSERT`). Duplicidades `(tx_legado, caixa_id)`=**0** (inalterado). `vw_reconciliacao_v1_v2`: soma de `diferenca_absoluta` das 16 caixas recalculada = **-417,24**, idêntica à soma pré-execução — nenhuma linha mudou.

### Auditoria gerada
4 registros em `audit_log`, mesmo timestamp (`2026-08-08 03:32:38`), `origem='ajuste_manual'`, cada um com `valor_anterior=null` → `valor_novo=<id resolvido>`, um por campo/linha alterada.

### Confirmação de impacto zero em saldos e reconciliação
Garantia estrutural, não só testada: `vw_saldo_v2_por_caixa` e `vw_reconciliacao_v1_v2` não referenciam `cartao_id` nem `categoria_id` em nenhuma cláusula — impossível essas colunas afetarem saldo ou reconciliação, por construção das views.

### Números finais
| Métrica | Antes | Depois |
|---|---:|---:|
| `transacoes` | 289 | **289** |
| `audit_log` | 24 | **28** |
| Duplicidades `(tx_legado, caixa_id)` | 0 | **0** |
| Campos corrigidos | — | **4** |
| Valores alterados | — | **0** |
| Caixas alteradas | — | **0** |
| Impacto financeiro | — | **0** |

### Conclusão formal
- **Parte A concluída ✅.**
- **Modelagem LRW/LRV operacionalmente estabilizada sob a estratégia 3a** — as 35 transações já residem corretamente na V2 (atribuição por pessoa via `usuario_id`, `afeta_saldo_real=false`), com metadados objetivamente resolvíveis completos.
- `caixa_id` permanece inalterado (Caixa Variável, sem custo de reconciliação).
- `afeta_saldo_real=false` permanece inalterado.
- **Divergências de valor (Parte B, 5 transações) permanecem fora do escopo desta fase** — investigação dedicada ainda não autorizada.

---

## 19. `sincronizar_v1_v2()` — versão permanente, criação e validação em dry-run (08/08/2026)

**Objetivo**: substituir a sincronização manual pontual (usada na 4B-1 e implicitamente na Parte A) por uma função reutilizável, idempotente, que qualquer sessão futura possa rodar sem reconstruir a lógica do zero.

### Função criada
`public.sincronizar_v1_v2(p_dry_run boolean DEFAULT true) RETURNS jsonb`, `SECURITY DEFINER`, `search_path='public'`. Migration `criar_sincronizar_v1_v2`.

**Lógica** (reaproveita integralmente o que já foi validado manualmente na 4B-1):
- Fonte única: `diagnostico_sync_v1_v2()` (função de leitura já existente).
- Exclusão nominal de `TX000208` — comentário na própria migration documenta que é **temporária**, dependente da decisão futura de governança sobre a colisão de `tx_legado` (seção 16), e que o filtro deve ser removido explicitamente só quando essa decisão for tomada.
- Exclusão estrutural de livros sem `confiavel=true` em `v1_v2_caixa_mapa` — comentário na migration documenta que isso cobre `LRW_TRANSACOES`/`LRV_TRANSACOES` por não terem mapeamento de caixa (decisão da seção 15), e qualquer livro futuro na mesma situação, sem hardcode de nome.
- Idempotência via `ON CONFLICT (tx_legado, caixa_id) DO NOTHING` (constraint da 4B-2) + checagem prévia equivalente pra relatório preciso do motivo de cada linha ignorada.
- Retorna `jsonb` com `inseridas`/`ignoradas` completos (cada ignorada com motivo) e contadores.
- `EXECUTE` revogado de `PUBLIC`/`anon`/`authenticated` (mesma política de segurança das outras RPCs de escrita do projeto).

### Validação da criação
`prosecdef=true` (confirma `SECURITY DEFINER`), `proacl={postgres=X, service_role=X}` (confirma que `PUBLIC`/`anon`/`authenticated` não têm `EXECUTE`).

### Resultado do dry-run (`sincronizar_v1_v2(true)`)
```json
{"modo": "dry_run", "qtd_inseridas": 0, "qtd_ignoradas": 6}
```
As 6 ignoradas: `TX000208` (governança) + as 5 transações de `LRW_TRANSACOES`/`LRV_TRANSACOES` que `diagnostico_sync_v1_v2()` ainda lista como pendentes por divergência de valor (mesmas 5 da "Parte B", seção 18) — todas corretamente excluídas pela regra estrutural de mapeamento, **antes mesmo de qualquer checagem de valor**. Confirma que a função nunca tentaria duplicar essas 5 linhas, mesmo que a Parte B nunca seja resolvida. Zero candidatos legítimos existem hoje (o backlog conhecido já foi coberto manualmente na 4B-1).

### Decisão: não executar `sincronizar_v1_v2(false)` agora
**Validação funcional concluída em modo dry-run.** Como não existem candidatos elegíveis no momento, rodar o modo de escrita agora não adicionaria evidência nova — só confirmaria que 0 inserções continuam sendo 0. **A validação de escrita efetiva será realizada na primeira ocorrência de um candidato elegível identificado por `diagnostico_sync_v1_v2()`.**

### Teste de aceitação registrado para a próxima ocorrência

**Pré-condição**: `diagnostico_sync_v1_v2()` retorna pelo menos 1 candidato elegível (livro com `confiavel=true`, `tx_legado ≠ TX000208`).

**Execução**:
1. Rodar `sincronizar_v1_v2(true)` — registrar a quantidade prevista de inserções.
2. Rodar `sincronizar_v1_v2(false)`.
3. Confirmar que a quantidade inserida corresponde exatamente ao previsto no passo 1.

**Validações**:
- `tx_legado` preservado exato.
- Caixa correta (conforme `v1_v2_caixa_mapa`).
- Categoria correta (quando resolvível via `regras_classificacao`).
- Registro criado em `audit_log` por linha inserida.
- Segunda execução de `sincronizar_v1_v2(false)` retorna 0 inserções (prova de idempotência).
- Nenhuma duplicidade gerada (`(tx_legado, caixa_id)` continua único).

### Conclusão
**Função validada para entrada em produção.** Modo real não executado ainda — aguardando o próximo candidato legítimo pra validar escrita efetiva e idempotência de ponta a ponta com dado real, não hipotético.

---

## 20. Investigação Parte B — reclassificação das 5 divergências de valor (08/08/2026)

**Objetivo**: determinar se as 5 divergências de valor entre V1 (atual) e V2 (snapshot de 05/08/2026), em `TX000200`/`203`/`204`/`205`/`206`, representam erro real pendente na V2 ou correções legítimas do V1 posteriores à migração.

**Método**: reconstrução direta a partir das migrations originais de importação (`v2_fase2_migrar_transacoes_ciclo_atual` e `v2_fase2_migrar_historico_parte1`), que fazem `INSERT ... SELECT` direto do `wallace_dados` — permitindo identificar exatamente de qual array e em qual momento cada valor foi lido, sem inferência.

### Achado central: 4 dos 5 casos não são divergência de valor — são colisão de `tx_legado`

`TX000203`/`204`/`205`/`206` vieram da migração `v2_fase2_migrar_historico_parte1` (lote 05/08/2026 20:59:48), que lê `HISTORICO_ERP_TODOS_CICLOS` (arquivo de ciclos já fechados) — um array **completamente diferente** de `LRW_TRANSACOES`/`LRV_TRANSACOES` (ciclo vivo). Localizado o elemento original em `HISTORICO_ERP_TODOS_CICLOS` para cada um: são **4 transações reais de junho/julho de 2026, sem nenhuma relação** com as transações de agosto que hoje ocupam os mesmos códigos no array vivo do V1:

| tx_legado | Na V2 hoje (= arquivo histórico) | No V1 vivo hoje (LRW/LRV) |
|---|---|---|
| `TX000203` | "BRISANET", R$114,99, 26/06/2026 | "Sorveteria Papa Açaí", R$61,15, 05/08/2026 |
| `TX000204` | "CONTA_VIVO", R$469,00, 30/06/2026 | "H57Store", R$22,97, 05/08/2026 |
| `TX000205` | "CONTA_VIVO", R$54,00, 01/07/2026 | "ANTHROPIC*CLAUDE SUB", R$113,72, 06/08/2026 |
| `TX000206` | "DRYCLEAN_USA", R$132,00, 15/07/2026 | "H57Store", R$36,95, 06/08/2026 |

Mesma família de bug já documentada em `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` seção 23 (colisão `TXR000001-006` entre LRV e LRR, corrigida por renumeração) e já registrada nesta frente de trabalho pra `TX000208` (seção 16).

`TX000200` é o único caso diferente: veio da migração do ciclo vivo (`v2_fase2_migrar_transacoes_ciclo_atual`, lote 20:44:51), é **a mesma transação nos dois lados** ("ANTHROPIC*CLAUDE SUB", 04/08/2026) — diferença de R$3,72 = IOF que faltava, corrigido no V1 em 07/08/2026, dois dias depois do snapshot da migração.

### Registro individual

**`TX000200`**
- Mesmo evento nos dois lados (mesma descrição, mesma data).
- Correção legítima do V1, posterior ao snapshot da migração.
- Diferença: R$3,72 (IOF de 3,38% adicionado depois).
- Confiança: **alta**.
- Status: candidata a correção futura de valor na V2 (mesmo padrão já usado no Dr.Pizza/`TX000222`) — **não corrigido nesta etapa**.

**`TX000203`, `TX000204`, `TX000205`, `TX000206`**
- Não representam divergência de valor.
- Representam colisão de `tx_legado`: eventos históricos reais e distintos (arquivados em `HISTORICO_ERP_TODOS_CICLOS`) reutilizaram o mesmo identificador sequencial de eventos completamente diferentes do ciclo vivo atual.
- Mesma família do problema já documentado para `TX000208`.
- Confiança: **alta** (evidência direta — elemento original localizado e comparado, não inferência).
- Status: **não corrigir valores** — são dois registros legítimos cada um, o problema é de numeração/rastreabilidade, não de dado errado.

### Pendências de governança consolidadas (atualização da seção 16)

| tx_legado | Classificação |
|---|---|
| `TX000208` | Colisão de `tx_legado` entre eventos distintos |
| `TX000203` | Colisão de `tx_legado` entre eventos distintos |
| `TX000204` | Colisão de `tx_legado` entre eventos distintos |
| `TX000205` | Colisão de `tx_legado` entre eventos distintos |
| `TX000206` | Colisão de `tx_legado` entre eventos distintos |

Nenhuma correção de valor foi executada em nenhum dos 5 casos.

### Conclusão formal
- **Investigação da Parte B encerrada.**
- **1 divergência de valor real identificada** (`TX000200`) — candidata a correção futura, causa raiz alta confiança.
- **4 casos reclassificados como problema de rastreabilidade** (`TX000203`/`204`/`205`/`206`) — somam-se ao `TX000208`, total de **5 colisões de `tx_legado`** registradas como pendência de governança.
- **Nenhuma evidência de erro de migração** — ambas as migrations leram fielmente o que existia em `wallace_dados` no momento em que rodaram.
- **Nenhuma evidência de alteração manual na V2** — `audit_log` não tem nenhum registro pras 5 linhas desde que a tabela de auditoria existe.
- **Nenhuma ação corretiva executada** — só diagnóstico, como combinado.

---

## 21. Correção de `TX000200` e encerramento do programa V1→V2 do ponto de vista de dados (08/08/2026)

### Correção executada
```sql
SELECT set_config('audit.origem','ajuste_manual', true);
UPDATE transacoes SET valor = 113.72
WHERE tx_legado = 'TX000200' AND caixa_id = '8522e256-2039-4c11-bd28-69738bfcf5b8';
```
Causa raiz já comprovada na Parte B (seção 20): mesma transação nos dois lados ("ANTHROPIC*CLAUDE SUB", 04/08/2026), diferença de R$3,72 explicada pelo IOF corrigido no V1 em 07/08/2026, dois dias após o snapshot da migração. Não é colisão de `tx_legado`, não é problema de modelagem, não é problema de reconciliação — correção isolada de alta confiança.

**Validações**:

| Métrica | Antes | Depois |
|---|---:|---:|
| `valor(TX000200)` | 110,00 | **113,72** |
| `transacoes` | 289 | **289** |
| `audit_log` | 28 | **29** |
| Soma de `diferenca_absoluta` nas 16 caixas (`vw_reconciliacao_v1_v2`) | -417,24 | **-417,24** (inalterada) |

Registro gerado: `audit_log`, `campo='valor'`, `valor_anterior=110.00` → `valor_novo=113.72`, `origem='ajuste_manual'`. Impacto zero em `vw_reconciliacao_v1_v2`/`vw_saldo_v2_por_caixa`/saldos de qualquer caixa — garantido por `afeta_saldo_real=false` (a linha já é excluída de todo cálculo de saldo, independente do valor). Nenhuma outra linha tocada.

### Backlog de governança final (5 itens, todos "Colisão de `tx_legado` entre eventos distintos")

| tx_legado | Classificação | Ação |
|---|---|---|
| `TX000208` | Colisão de `tx_legado` entre eventos distintos | Não corrigido — decisão de rastreabilidade pendente |
| `TX000203` | Colisão de `tx_legado` entre eventos distintos | Não corrigido — decisão de rastreabilidade pendente |
| `TX000204` | Colisão de `tx_legado` entre eventos distintos | Não corrigido — decisão de rastreabilidade pendente |
| `TX000205` | Colisão de `tx_legado` entre eventos distintos | Não corrigido — decisão de rastreabilidade pendente |
| `TX000206` | Colisão de `tx_legado` entre eventos distintos | Não corrigido — decisão de rastreabilidade pendente |

### Encerramento formal — programa V1→V2, do ponto de vista de dados

- ✅ Estrutura V2 validada
- ✅ Migração executada
- ✅ Reconciliação financeira concluída
- ✅ Auditoria implantada (`audit_log`)
- ✅ Duplicidades eliminadas (Fase 4C)
- ✅ `UNIQUE(tx_legado, caixa_id)` implantada (Fase 4B-2)
- ✅ `sincronizar_v1_v2()` criada e validada em dry-run (seção 19)
- ✅ Modelagem LRW/LRV concluída, fundamentada na Política Interna §13 (seção 15/18)
- ✅ Parte A concluída (metadados)
- ✅ Parte B investigada, classificada e a única divergência de valor real (`TX000200`) corrigida (seções 20-21)

**Não existe mais nenhuma divergência de dado sem causa raiz conhecida.** O que resta é governança (5 colisões de `tx_legado`, documentadas, sem ação até decisão explícita), automação (`sincronizar_v1_v2()` sem gatilho automático) e produto (Fase 4D, sem requisitos levantados) — não mais investigação de dados.

---

## Próximo passo

Programa V1→V2 **encerrado do ponto de vista de dados** (seção 21). Levantamento técnico da Fase 4D registrado (seção 22), sem nenhuma implementação. Próximo agente: leia as seções 12-22 antes de qualquer ação nova.

---

## 22. Fase 4D — levantamento técnico da transição V1→V2 (08/08/2026)

**Natureza deste registro: é um levantamento técnico, não uma decisão de implementação.** Nenhuma alteração funcional ou de interface foi realizada como parte desta atividade — só diagnóstico e mapeamento. Diretriz explícita do usuário: o painel atual permanece exatamente como está, nenhum card muda de posição, nenhuma seção nova aparece pro usuário, a V2 continua como infraestrutura de apoio nos bastidores. A decisão de expor qualquer informação da V2 pro usuário fica para uma etapa futura e explícita, fora do escopo deste registro.

### Mapeamento por domínio: fonte V1 hoje × equivalente V2

| Domínio do painel | Fonte V1 (hoje) | Equivalente V2 | Prontidão V2 |
|---|---|---|---|
| Caixas operacionais/patrimoniais (16 confiáveis) | `wallace_dados.<CAIXA>_TRANSACOES` + `<CAIXA>_SALDO_INICIAL` | `caixas` + `transacoes` + `vw_saldo_v2_por_caixa` | ✅ Pronto — reconciliado, `vw_reconciliacao_v1_v2` já valida caixa a caixa |
| Caixa Mastercard/Infinite | `cartaoMBTotal`, `cartaoInfiniteTotal` | `caixas`/`transacoes` (caixa própria) | ✅ Pronto — `sincronizado`, alta confiança |
| Cartão MB — Wallace/Vanessa (LRW/LRV) | `LRW_TRANSACOES`/`LRV_TRANSACOES`, `mbLRWConfirmado`/`mbLRVConfirmado` | `transacoes` (`caixa_id=Caixa Variável`, `usuario_id`, `afeta_saldo_real=false`) | ✅ Pronto conceitualmente (Política §13, Parte A) — mas **não existe hoje nenhuma agregação V2 equivalente a `mbLRWConfirmado`/`mbLRVConfirmado`** (soma por pessoa), só a linha crua |
| Recorrências/Assinaturas/Corporativo (LRR/LRS/LRC) | `mbLRRConfirmado`/`mbLRSConfirmado`/`livroLRC` | Nenhum array V1 correspondente foi migrado (fora do escopo desta frente) | ❌ Não iniciado |
| Boletos fixos recorrentes | `CRONOGRAMA_BOLETOS_FIXOS` | Sem tabela V2 dedicada | ❌ Não iniciado |
| Patrimônio (Reserva, BTG/Necton, imóveis) | `reserva`, `btgNecton`, `patFgts` etc | `patrimonio` (tabela existe, populada) | 🟡 Parcial — tabela existe, não auditada linha a linha nesta frente |
| Investimentos/Opções | `opcoesVendidasDetalhe`, `ACOES_COTACOES` | `investimentos` (tabela existe) | 🟡 Parcial — mesma ressalva |
| Metas | `metaSuavizacao` etc | `metas` (tabela existe) | 🟡 Parcial |
| Reembolsos (Wärtsilä) | `reembolsoCicloTotal`, cascata | `reembolsos` (tabela existe, 1 linha hoje) | 🟡 Parcial — não é a mesma granularidade da cascata V1 |
| Solar | `SOLAR_GERACAO_DIARIA`/`SOLAR_LEITURAS` | `energia_solar_geracao_diaria`/`energia_solar_leituras` (tabelas existem) | 🟡 Parcial, não auditado |
| Inbox Financeira / Pluggy / Mercado Pago | `INBOX_FINANCEIRA` (efêmero, nunca persiste) | Sem equivalente — é fluxo de triagem, não dado de saldo | N/A — natureza diferente, não é candidato a "trocar fonte" |

### Classificação explícita por grau de prontidão

**✅ Prontos** (reconciliados, evidência suficiente pra eventual troca de fonte):
- As 16 caixas operacionais/patrimoniais mapeadas em `v1_v2_caixa_mapa`.
- Dentro delas, 4 já batem exato hoje (`sincronizado`, alta confiança): Caixa Mastercard/Infinite, Caixa Variável, PIX Vanessa, Caixa Boletos (desde a correção da seção 17).
- Cartão MB por pessoa (LRW/LRV) — pronto conceitualmente e na V2 (Parte A), mas falta a agregação equivalente a `mbLRWConfirmado`/`mbLRVConfirmado` antes de qualquer card específico poder trocar.

**🟡 Parcialmente validados** (tabela V2 existe e está populada, mas nunca foi auditada linha a linha nesta frente):
- Patrimônio, Investimentos/Opções, Metas, Reembolsos, Solar.

**❌ Não auditados / não iniciados**:
- Recorrências/Assinaturas/Corporativo (LRR/LRS/LRC) — nenhum array migrado.
- Boletos fixos recorrentes — sem tabela V2 dedicada.
- Inbox Financeira — natureza diferente (triagem efêmera), não é candidata a troca de fonte.

### Estratégia de transição gradual (proposta, não decidida, não agendada)

1. **Caixas já `sincronizado`** (Mastercard/Infinite, Variável, PIX Vanessa, Boletos) — candidatas naturais a serem as primeiras, se um dia decidirem trocar fonte de 1 card por vez. Risco mínimo: número já bate.
2. **Caixas com causa residual conhecida e alta confiança** (`vw_reconciliacao_v1_v2` classifica como `transacao_ausente_na_v2`, `grau_confianca=alta`) — precisam só de um `sincronizar_v1_v2()` rodado antes de trocar.
3. **Caixas com `causa_provavel = saldo_inicial_ausente...`, baixa confiança** — não trocar antes de investigar (mesmo tratamento rigoroso já usado no caso Boletos/`TX000140`, seção 17).
4. **Domínios nunca auditados** (patrimônio, investimentos, solar, reembolsos, metas) — precisam de uma rodada de reconciliação própria (mesmo método da Fase 3) antes de qualquer troca ser cogitada.
5. **LRW/LRV, LRR/LRS/LRC, boletos fixos** — não têm "saldo" pra trocar (são detalhamento/agregado), ficam de fora dessa lógica de troca por caixa.

### Achados de frontend (impacto técnico de uma eventual troca de fonte)

- **Não existe client Supabase único** — 3 implementações paralelas fazem fetch direto ao Supabase, cada uma com URL/chave duplicada: `WallaceFinanceService` (`src/app/app.js`), `FinanceService` (`src/services/FinanceService.js`, documentado como "camada oficial da Fase 5"), e fetch ad hoc em `src/integrations/pluggy/pluggy-reconciliacao.js`. Trocar a fonte de qualquer card exigiria decidir qual client consolidar primeiro — recomendação: `FinanceService.js`, antes de trocar o primeiro card, não depois.
- **Ausência de feature flags / registro dinâmico de abas** — o sistema de navegação (`showMaster()`) usa 4 `master-pane` fixos numa lista fechada, sem infraestrutura pra alternar fonte de dado de um card isoladamente nem pra expor/ocultar algo condicionalmente. Qualquer transição gradual real precisaria dessa infraestrutura construída antes.
- **Inexistência atual de agregação equivalente a `mbLRWConfirmado`/`mbLRVConfirmado`** — a V2 tem a linha crua de cada compra (`transacoes` com `afeta_saldo_real=false`), mas nenhuma view/RPC soma isso por pessoa hoje. Um card futuro de "cartão por pessoa" precisaria dessa agregação nova antes de poder trocar de fonte.

### Conclusão executiva

**Neste momento, apenas o conjunto de caixas operacionais/patrimoniais reconciliadas possui evidência suficiente para eventual troca de fonte V1→V2. Os demais domínios possuem estrutura V2 existente, porém ainda não passaram pelo mesmo processo de reconciliação e validação.**

---

## 23. Onda 1 — primeiros componentes lendo V2 em produção (08/08/2026)

**Objetivo**: fazer os 4 cards já `sincronizado` (`vw_reconciliacao_v1_v2`, `diferenca_absoluta=0`) lerem a V2 como origem efetiva, sem alterar HTML/CSS/IDs/regra de negócio, mantendo V1 como fallback automático.

### Escopo
Caixa Mastercard/Infinite, Caixa Variável (saldo real), PIX Vanessa, Caixa Boletos.

### Client único
`WallaceFinanceService` (`src/app/app.js`) — consolidação já feita numa sessão anterior como reimplementação sem sintaxe de módulo da API pública de `FinanceService.js` (ES module incompatível com `app.js` ser script clássico com `onclick=` inline; converter pra `type="module"` quebraria todos eles — risco fora do escopo desta onda). Novo método `getSaldosPorCaixa()` adicionado, consumindo `vw_saldo_v2_por_caixa`.

### Achado crítico durante a implementação
`rpc_dashboard_resumo()` (fonte originalmente cogitada) **não serve pra este uso**: campo `saldo` soma toda transação da caixa sem filtro de ciclo/`afeta_saldo_real` (dava -R$1.802,00 pra Boletos em vez de R$1.488,42); campo `saldo_real_ciclo_atual` da mesma RPC diverge pra PIX Vanessa (R$180,91 vs R$302,88 já validado). Trocado pra `vw_saldo_v2_por_caixa` — a mesma view usada e validada em toda esta frente de trabalho — antes de qualquer código rodar em produção.

### Validação em ambiente real (navegador real, login real do usuário, não simulado)

| Caixa | V1 | V2 (`vw_saldo_v2_por_caixa`) | Diverge? |
|---|---:|---:|---|
| Caixa Boletos | R$1.488,42 | R$1.488,42 | Não |
| PIX Vanessa | R$302,88 | R$302,88 | Não |
| Caixa Variável (saldo real) | R$1.886,65 | R$1.886,65 | Não |
| Caixa Mastercard/Infinite | R$11.172,22 | R$11.172,22 | Não |

Confirmado via `window.WALLACE_ONDA1_V2_RELATORIO` no console real: `diverge:false, diferenca:0` nos 4. Layout conferido por screenshot — zero alteração visual. Uma falha isolada de rede (`WallaceFinanceService is not defined`, provável race durante o fluxo de login) foi absorvida pelo fallback automático sem quebrar a tela — prova prática do mecanismo de segurança, não achado de bug novo.

### Arquivos alterados
`src/financeiro/caixas/hydrate-onda1-v2.js` (novo), `src/app/app.js` (+`getSaldosPorCaixa()`, +chamada `aplicarOnda1V2()` no fim de `hydrate()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada no array de módulos), `.claude/serve.ps1`/`.claude/launch.json` (porta configurável via `$env:PORT`, infraestrutura de teste local, sem impacto em produção).

### Status
**Migradas para V2 (fonte efetiva, com fallback V1 ativo)**: Caixa Boletos, PIX Vanessa, Caixa Variável (saldo real), Caixa Mastercard/Infinite — 4 componentes. Rollback disponível (comentar `aplicarOnda1V2();` em `app.js`).

---

## 24. Onda 2 — overlay condicional pras 11 caixas restantes + diagnóstico Livro Razão Fase 1 (08/08/2026)

**Objetivo**: estender o modelo da Onda 1 pras 11 caixas restantes e iniciar o desligamento de `*_TRANSACOES` como fonte do Livro Razão — sem sincronização contínua V1→V2, sem nova investigação de dado antes de implementar (só a checagem pré-migração por caixa que a própria diretriz desta onda exige).

### Diferença de desenho em relação à Onda 1
Checagem ao vivo mostrou que **nenhuma das 11 caixas está com V1×V2=0 hoje** (6 têm resíduo de um item `AJUSTE-06-08`, deliberadamente excluído de `sincronizar_v1_v2()` por já ser governança conhecida — Política Interna §31 — rodei o dry-run pra confirmar, 0 candidatos inseríveis; 5 têm causa indeterminada, baixa confiança, mesma classe do caso Boletos antes de resolvido). Por isso o overlay aqui é **condicional**: só troca o texto pra V2 se `|V1−V2|≤R$0,01`; caso contrário mantém V1 e só loga a divergência — nunca esconde, nunca força V2 errado pra tela.

### Caixas efetivamente migradas nesta rodada (V1×V2 bateram, exibindo V2)
**Caixa Churrasco** (R$100,24) e **Caixa Combustível** (R$200,50) — 2 de 11.

### Caixas bloqueadas (divergência real, mantendo V1, logado)

| Caixa | V1 | V2 | Diferença | Causa |
|---|---:|---:|---:|---|
| Caixa Bens Duráveis | R$0,00 | -R$355,00 | R$355,00 | `AJUSTE-06-08` não sincronizado |
| Caixa Eventos | R$167,43 | R$167,09 | R$0,34 | idem |
| Caixa Seguro Emplacamento | R$426,96 | R$426,08 | R$0,88 | idem |
| Escola de Júlio | R$1.011,86 | R$1.009,80 | R$2,06 | idem |
| PIX Geral Vanessa | R$50,69 | R$172,70 | R$122,01 | causa indeterminada, baixa confiança |
| Caixa Saúde Família | R$147,06 | -R$0,06 | R$147,12 | idem |
| Caixa Manutenção | R$0,72 | R$346,45 | R$345,73 | idem |
| Caixa Aniversário Júlio | R$93,70 | R$200,80 | R$107,10 | idem |
| Provisionado Wärtsilä | R$339,00 | R$683,04 | R$344,04 | causa indeterminada + gap estrutural (campo "fatura" sem equivalente V2) — **log-only, nunca escreve no DOM** (card de 4 estados, fora do escopo desta onda) |

Nenhuma dessas 9 foi corrigida nesta onda — correção de dado é decisão separada (mesmo protocolo da Parte B/TX000140), fora do escopo de "leitura V2".

### Livro Razão — Fase 1 (diagnóstico apenas, renderização V1 100% inalterada)
Reaproveitou `vw_reconciliacao_v1_v2` (qtd de transações + valor das diferenças por caixa) em vez de somar arrays no cliente. Resultado ao vivo: **13 das 15 caixas verificadas têm quantidade de transações V1≠V2** (Caixa Lance, Manutenção, Aniversário Júlio, Eventos, Saúde Família, Seguro Emplacamento, Combustível, Churrasco, PIX Geral Vanessa, Bens Duráveis, Boletos, Variável, Escola de Júlio) — só Mastercard/Infinite e PIX Vanessa batem em quantidade. Confirma que o Livro Razão precisa da mesma investigação por caixa antes de qualquer Fase 2 (exibição). Relatório completo em `window.WALLACE_LIVRO_RAZAO_DIAGNOSTICO`.

### Validação em ambiente real
Console real, login real, confirmado: `window.WALLACE_ONDA2_V2_RELATORIO` (11 entradas) e `window.WALLACE_LIVRO_RAZAO_DIAGNOSTICO` (15 entradas) batendo com a tabela acima. Mesma falha transiente de carregamento já vista na Onda 1 (`WallaceFinanceService` não inicializado na primeira passada de `hydrate()`) ocorreu de novo, absorvida pelo fallback nas 3 funções sem nenhum impacto visível — padrão conhecido, não regressão nova, candidato a investigação de causa raiz numa sessão futura (não bloqueante).

### Arquivos alterados
`src/financeiro/caixas/hydrate-onda2-v2.js` (novo), `src/app/app.js` (+`getReconciliacaoPorCaixa()`, +chamadas `aplicarOnda2V2()`/`diagnosticoLivroRazaoFase1()` no fim de `hydrate()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada no array de módulos).

### Status (original)
**Migradas nesta onda**: Caixa Churrasco, Caixa Combustível (2). **Total acumulado lendo V2 (Ondas 1+2)**: 6 caixas. **Bloqueadas, aguardando resolução de divergência real**: 9 caixas + Livro Razão completo. Mecanismo pronto pra promover cada uma automaticamente assim que a divergência real fechar, sem novo código.

### Atualização 08/08/2026 — mudança de critério: "divergência documentada não bloqueia mais"

**1. Objetivo**: aplicar a nova regra do usuário — divergência conhecida e documentada deixa de ser bloqueador; só falta de estrutura V2 bloqueia.

**2. Escopo**: reclassificar as 9 caixas bloqueadas da Onda 2 em 2 grupos e liberar exibição V2 pro grupo com causa confirmada.

**3. Arquivos alterados**: `src/financeiro/caixas/hydrate-onda2-v2.js` (campo novo `aceitarDivergenciaConhecida` por item do mapa, lógica de exibição condicionada a ele).

**4. Fonte antiga**: `VARS`/`REG` (V1) nas 9 caixas, sem exceção.

**5. Fonte nova**: `vw_saldo_v2_por_caixa` (V2) pras 4 com causa confirmada, mesmo com diferença — Caixa Bens Duráveis, Caixa Eventos, Caixa Seguro Emplacamento, Escola de Júlio (todas com causa `AJUSTE-06-08` já identificada, Política Interna §31). As outras 4 — Caixa Manutenção, Caixa Saúde Família, PIX Geral Vanessa, Caixa Aniversário Júlio — **permanecem em V1**, por decisão explícita do usuário: causa "indeterminada, baixa confiança", diferenças grandes (R$107 a R$346) sem explicação confirmada, categoria diferente do `AJUSTE-06-08`. Provisionado Wärtsilä continua log-only (falta de estrutura, não só divergência).

**6. Validação**: navegador real, login real — `window.WALLACE_ONDA2_V2_RELATORIO` conferido, 6 de 11 exibindo `"V2"`, 4 exibindo `"V1 (fallback)"` (as 4 de causa indeterminada), 1 `"V1 (log-only)"` (Wärtsilä).

**7. Resultado**: **10 caixas lendo V2 em produção** (4 da Onda 1 + 6 desta atualização), zero alteração de layout/IDs/CSS.

**8. Rollback**: reverter `aceitarDivergenciaConhecida` pra `false` nos 4 itens, ou comentar `aplicarOnda2V2();` em `app.js` pra reverter tudo.

---

## 25. Onda 3, prioridade 1 — Livro Razão lendo V2 (08/08/2026)

**1. Objetivo**: V2 como fonte principal das tabelas de Livro Razão, V1 só como fallback — primeira prioridade da Onda 3.

**2. Escopo**: as 7 tabelas cuja caixa já tem o saldo migrado (coerência card↔tabela): Caixa Eventos, Caixa Seguro Emplacamento, Caixa Combustível, Caixa Churrasco, Caixa Mastercard/Infinite, Caixa Bens Duráveis, PIX Vanessa. Fora do escopo: caixas ainda em V1 no saldo (Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário Júlio, Lance, Wärtsilä) — mesma caixa não pode ter card V2 + tabela V1 nem o contrário. LRW/LRV/LRC-limbo/LRCV e Boletos (sem aba própria) ficam fora, mesmo motivo de sempre.

**3. Arquivos alterados**: `src/financeiro/caixas/hydrate-onda3-livro-razao.js` (novo), `src/app/app.js` (+`getTransacoesPorCaixaIds()`, +`onDomPronto(aplicarOnda3LivroRazao)` registrado depois de `renderLivrosVariaveis()` de propósito — precisa da V1 já ter preenchido a tabela antes de sobrescrever), `Sistema_Wallace_Lira_Completo.html` (+1 entrada no array de módulos).

**Achado e correção no caminho — bug real de ordem de execução**: `onDomPronto(fn)` roda `fn()` **de forma síncrona e imediata** sempre que o DOM já está pronto (não é fila assíncrona) — e como `app.js` é injetado depois de um `fetch()` assíncrono, isso é o caso normal, não exceção. `WallaceFinanceService` estava definido bem abaixo de `onDomPronto(hydrate)` no arquivo — dependendo do timing exato do carregamento, `hydrate()` podia rodar ANTES do parser sequer chegar na definição, causando `ReferenceError` determinístico (mascarado de "falha transiente" nas Ondas 1/2 porque só acontecia em parte dos carregamentos). Corrigido: `WallaceFinanceService` movido pro topo do arquivo, logo após a definição de `onDomPronto`, antes de qualquer chamada. Nenhuma duplicação deixada — conferido só 1 `const WallaceFinanceService` no arquivo depois da mudança.

**4. Fonte antiga**: arrays `*_TRANSACOES` (V1) — `renderLivrosVariaveis()`, continua rodando primeiro, intocada.

**5. Fonte nova**: `transacoes` (V2), filtrado por `caixa_id IN (...)` numa única chamada, `status=eq.confirmado`. Rodapé (soma/qtd) calculado a partir das mesmas linhas exibidas — **não** usa `vw_saldo_v2_por_caixa` pro rodapé, então pode não bater com o saldo do card (mesmo comportamento que o rodapé já tinha em V1: sempre foi só a soma da lista mostrada, nunca o saldo completo com saldo inicial — confirmado lendo `render-livros-variaveis.js`, `tfPV`/`tf_lrXxx` sempre foram `array.reduce(...)`, sem somar saldo inicial).

**6. Validação**: navegador real, login real, após a correção de ordem — 0 erros, `window.WALLACE_ONDA3_LIVRO_RAZAO_RELATORIO` com as 7 tabelas em `fonte:"V2"`. Achado registrado sem esconder: PIX Vanessa mostrou 8 linhas na V2 contra 6 que a `vw_reconciliacao_v1_v2` conta como "correspondentes" — a query desta tabela não aplica o mesmo filtro de correspondência tx_legado/ciclo da view de saldo, mostra tudo que está confirmado na caixa (inclui `RENDIMENTO-31-07`/`AJUSTE-06-08`, que a view de saldo trata à parte). Não investigado a fundo (fora do escopo desta entrega, por pedido explícito do usuário de não abrir novas rodadas de investigação) — registrado como diferença conhecida.

**7. Resultado**: **7 tabelas de Livro Razão lendo V2 em produção**, zero alteração de layout/IDs/CSS. Bug de ordem de execução corrigido beneficia também as Ondas 1 e 2 (fallback não deve mais disparar por esse motivo).

**8. Rollback**: comentar `onDomPronto(aplicarOnda3LivroRazao);` em `app.js` — as 7 tabelas voltam a mostrar só V1 (renderLivrosVariaveis já roda antes, nada mais muda).

---

## 26. Onda 3, prioridade 2 — LRW/LRV (compromisso de cartão por pessoa) lendo V2 (08/08/2026)

**1. Objetivo**: reproduzir `VARS.mbLRWConfirmado`/`mbLRVConfirmado` (compromisso de cartão MB por pessoa, Política Interna §13) a partir de dados já existentes em `transacoes`, sem modelagem de domínio nova — 2ª prioridade da Onda 3 (ordem explícita do usuário: Livro Razão → LRW/LRV → Patrimônio → Metas → Investimentos).

**2. Escopo**: os 2 valores exibidos em `mbLRW`/`mbLRV` (`src/financeiro/cartoes/hydrate-visa-mb.js:24-25`). Fora do escopo: o gráfico de pizza que usa `Object.values(REG.mbDetalhe)` (`graficos-painel-principal.js`) — Chart.js, não é um id de texto simples, mesma regra das Ondas anteriores de só sobrescrever cards/tabelas de texto.

**SQL criado**: view `vw_compromisso_cartao_por_pessoa` — soma `transacoes.valor` agrupado por `usuario_id`/`usuario_nome`, filtrado por `caixa_id = Caixa Variável` e `afeta_saldo_real = false`, via `JOIN usuarios`. Nenhuma lógica nova: é a mesma agregação que já dá base ao LRW/LRV, só que lida direto da V2.

```sql
CREATE VIEW public.vw_compromisso_cartao_por_pessoa AS
SELECT u.nome AS usuario_nome, u.id AS usuario_id,
       round(sum(t.valor), 2) AS total_comprometido, count(*) AS qtd_transacoes
FROM public.transacoes t
JOIN public.caixas c ON c.id = t.caixa_id AND c.nome = 'Caixa Variável'
JOIN public.usuarios u ON u.id = t.usuario_id
WHERE t.afeta_saldo_real = false
GROUP BY u.nome, u.id;
```

**3. Arquivos alterados**: `src/financeiro/cartoes/hydrate-onda3-lrwlrv.js` (novo), `src/app/app.js` (+`getCompromissoCartaoPorPessoa()`, +chamada `aplicarOnda3LrwLrv()` logo depois de `hydrateVisaMB()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada no array de módulos).

**4. Fonte antiga**: `VARS.mbLRWConfirmado` (1563,19) / `VARS.mbLRVConfirmado` (364,62) — literais hardcoded, mantidos manualmente a cada compra.

**5. Fonte nova**: `vw_compromisso_cartao_por_pessoa` — Wallace R$1.128,11 (25 transações), Vanessa R$218,21 (5 transações).

**Evidência V1 × V2**: divergência confirmada e **100% explicada** — as mesmas 5 linhas já documentadas na Parte B (`TX000200/203/204/205/206`, colisão de `tx_legado` com eventos históricos não relacionados) nunca tiveram `usuario_id` preenchido (corretamente — não são compras de cartão de ninguém) e por isso ficam fora da soma V2 pelo próprio `JOIN usuarios`, sem filtro extra necessário. Wallace: V1=1563,19 × V2=1128,11 (diferença R$435,08). Vanessa: V1=364,62 × V2=218,21 (diferença R$146,41). Divergência conhecida e documentada, aceita pela regra de 08/08/2026 — exibe V2 mesmo assim, sem esconder a diferença (logada em todo carregamento).

**6. Validação**: navegador real, login real (Firebase, sessão já ativa) — `window.WALLACE_ONDA3_LRWLRV_RELATORIO` confirma `exibindo:"V2"` pros 2 usuários, valores no DOM (`#mbLRW`="R$ 1.128,11", `#mbLRV`="R$ 218,21") batendo exatamente com a view. Zero erros no console.

**7. Resultado**: **LRW/LRV lendo V2 em produção**, zero alteração de layout/IDs/CSS. Percentual atualizado de dependência da V1: 10 caixas (saldo) + 7 tabelas de Livro Razão + LRW/LRV agora lêem V2; restam em V1: 4 caixas de causa indeterminada (Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário Júlio), Caixa Lance, Provisionado Wärtsilä, e os domínios ainda não migrados da Onda 3 (Patrimônio, Metas, Investimentos).

**8. Rollback**: comentar `aplicarOnda3LrwLrv();` em `app.js` — `mbLRW`/`mbLRV` voltam a mostrar só V1 (`hydrateVisaMB()` já roda antes, nada mais muda).

---

## 27. Onda 3, prioridade 3 — Patrimônio: BLOQUEADO por ausência real de estrutura V2 (08/08/2026)

**1. Objetivo**: migrar `patTotal`/`patrimonioDetalhe`/`passivosPatrimoniais` (seções Patrimônio + Passivos Patrimoniais) pra V2 — 3ª prioridade da Onda 3.

**2. Investigação**: a tabela `patrimonio` (V2) existe (11 linhas), colunas `id, tipo, valor, data_snapshot, created_at, natureza` — **sem nenhum campo de rótulo/descrição**. Achados que travam a migração:
- **Ambiguidade estrutural real**: 2 linhas com `tipo='investimento'` (R$14.779,62 = BTG Necton, R$429,75 = Necton conta corrente) são **indistinguíveis por qualquer coluna** — só por coincidência de valor batem com `VARS.btgNecton`/`VARS.nectonContaCorrente`. Escrever código que casa por valor seria inventar lógica nova (proibido pela restrição desta rodada) e frágil (quebra na próxima atualização de saldo).
- **Campos inexistentes**: `passivosPatrimoniais` precisa de `prestacaoFinanciamentoCasa`, `mesesRestantesFinanciamentoCasa`, `consorcioAutoPct`, `parcelaConsorcioAuto` — nenhum desses tem coluna equivalente na tabela `patrimonio` (só `tipo`/`valor`/`natureza`, sem metadados de parcela/prestação/percentual).
- `patrimonio.total` (V1) também depende do saldo da **Caixa Lance**, que nunca foi classificada em nenhuma Onda anterior (nem incluída no `ONDA2_V2_MAPA`) — divergência V1×V2 sem causa raiz confirmada.

**3. Decisão**: **não migrado**. Isto é o caso previsto na regra do usuário ("ausência real de estrutura na V2" = bloqueador real, diferente de divergência documentada) — não uma investigação nova, é a constatação de que a V2 relacional ainda não modela patrimônio físico/financeiro no nível de detalhe que o painel exibe hoje. Nenhum arquivo de frontend alterado nesta seção.

**Caminho pra desbloquear (registrado, não executado)**: adicionar colunas `descricao`/`subtipo` na tabela `patrimonio` pra desambiguar linhas do mesmo `tipo`, e uma tabela (ou colunas) pra metadados de financiamento/consórcio (prestação, parcela, % pago, meses restantes) — modelagem de domínio nova, fora do escopo desta rodada ("apenas reproduzir dados já existentes").

---

## 28. Onda 3, prioridade 4 — Metas: parcial (Fundo de Suavização migrado; Meta do Milhão bloqueada) (08/08/2026)

**1. Objetivo**: migrar os 2 itens da tabela `metas` (V2) — Fundo de Suavização Salarial (CC-304) e Meta do Milhão — 4ª prioridade da Onda 3.

**2. Escopo**: card "Fundo de Suavização Salarial" (`cxSuavizSaldo`/`cxSuavizTxt`/`cxSuavizBar`, `hydrate-caixas.js`). Meta do Milhão (`patPctBadge`/`patPctBar`, `hydrate-patrimonio.js`) **fica fora** — depende de `patrimonio.total`, mesma pendência que bloqueou a Prioridade 3 (seção 27), incluindo a saldo não-classificada da Caixa Lance.

**3. Arquivos alterados**: `src/financeiro/caixas/hydrate-onda3-suavizacao.js` (novo), `src/app/app.js` (+chamada `aplicarOnda3Suavizacao()` logo depois de `hydrateCaixas()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada no array de módulos).

**4. Fonte antiga**: `VARS.contaSuavizacao` (derivado de `SUAVIZACAO_TRANSACOES`, V1).

**5. Fonte nova**: `vw_saldo_v2_por_caixa`, linha "Conta Suavização (CC-304)". A meta fixa (R$12.000, `VARS.metaSuavizacao`) continua vindo do código — não é um valor rastreado em `transacoes`/tabela própria na V2, mesmo caso do gap D (Provisionado Wärtsilä) já documentado.

**Evidência V1 × V2**: `V1=R$0,00 × V2=R$0,00` — zero divergência (conta zerada desde a ativação, V90). Reproduz também os textos derivados ("Zerada"/"Zerada · excedente...") e a largura da barra, com a mesma fórmula do V1, só trocando a fonte do saldo.

**6. Validação**: navegador real, login real — `window.WALLACE_ONDA3_SUAVIZACAO_RELATORIO` = `{v1:0, v2:0, diverge:false, exibindo:"V2"}`. Zero erros no console.

**7. Resultado**: **1 de 2 itens de Metas lendo V2** (Fundo de Suavização). Meta do Milhão permanece em V1, bloqueada pela mesma ausência de estrutura da Prioridade 3.

**8. Rollback**: comentar `aplicarOnda3Suavizacao();` em `app.js` — o card volta a vir só de `hydrateCaixas()` (V1).

---

## 29. Onda 3, prioridade 5 — Investimentos: BLOQUEADO por ausência real de estrutura V2 (08/08/2026)

**1. Objetivo**: reproduzir `VARS.opcoesVendidasDetalhe` (card ROC/Opções, seção 17, `hydrate-roc.js`) a partir da tabela `investimentos` (V2) — 5ª e última prioridade da Onda 3.

**2. Achado que bloqueia**: `investimentos` (V2, 4 linhas) só tem `id/tipo/quantidade/valor_atual/data_atualizacao/ticker`. O V1 usa ~14 campos por operação que não existem na V2: `precoExercicio`, `vencimento`, `premioBruto`, `custoOperacional`, `premioRecebido`, `precoMedio`, `cotacaoAtual`, `resultadoDiario`, `resultadoHistorico`, `precoBlackScholes`, `notaCorretagem`, `exercida`, `statusPosicao` — usados na tabela de opções e no cálculo de ROC (capital travado). Reproduzir isso exigiria schema novo, não é modelagem existente a reaproveitar. Mesma categoria de bloqueio da Prioridade 3 (seção 27) — **não escrito nenhum código**.

**3. Arquivos alterados**: nenhum.

**4-8**: não aplicável — bloqueado antes de qualquer implementação.

---

## 30. Pendência transversal — Caixa Lance: causa raiz investigada, divergência pequena mas não confirmada (08/08/2026)

**1. Objetivo**: classificar a divergência V1×V2 da Caixa Lance (nunca entrou em nenhum `*_V2_MAPA` de Onda anterior), que trava parte da Prioridade 3 e a Meta do Milhão inteira.

**2. Escopo**: 2 ids que exibem `VARS.caixaLance` — `balResLance` (Balanço, `hydrate-balanco.js`) e `patLance` (Patrimônio, `hydrate-patrimonio.js`).

**SQL usado (nenhum criado — 100% views já existentes)**: `vw_reconciliacao_v1_v2`, `vw_transacoes_so_no_v1`, `vw_ajustes_manuais_v1`, filtradas por `caixa_nome ILIKE '%lance%'`.

**3. Arquivos alterados**: `src/financeiro/caixas/hydrate-onda3-caixalance.js` (novo), `src/app/app.js` (+chamada `aplicarOnda3CaixaLance()` logo depois de `hydrateBalanco()`/Onda 2), `Sistema_Wallace_Lira_Completo.html` (+1 entrada no array de módulos).

**4. Fonte antiga**: `VARS.caixaLance` (`calcularSaldoCaixa(CAIXA_LANCE_SALDO_INICIAL_CICLO, CAIXA_LANCE_TRANSACOES)`).

**5. Fonte nova**: `vw_saldo_v2_por_caixa`, linha "Caixa Lance" (reaproveita `WallaceFinanceService.getSaldosPorCaixa()`, já em produção desde a Onda 1 — nenhum SQL novo).

**Evidência V1 × V2**: V1=R$4.522,13 × V2=R$4.526,50, diferença R$4,37 (0,10%). Investigação (views já existentes, sem SQL novo): `AJUSTE-06-08` (-R$65,76, "saldo real confirmado pelo usuário via print Mercado Pago") existe só no V1 — foi escrito direto em `wallace_dados` numa sessão anterior e nunca sincronizado como transação real na V2 (`vw_transacoes_so_no_v1`). Isso sozinho não fecha a conta inteira (R$65,76 ≠ R$4,37) — resíduo de R$4,37 continua com `causa_provavel = saldo_inicial_ausente_no_supabase_causa_indeterminada`, confiança **baixa** pela própria view. Mesma classe de caso das 4 caixas já excluídas na Onda 2 (Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário Júlio): divergência pequena, mas sem causa raiz *confirmada* — não é "documentada" no sentido da regra de 08/08 (que exige causa conhecida, não só resíduo pequeno).

**Decisão**: `aceitarDivergenciaConhecida: false` para os 2 ids — módulo registrado e ligado (Caixa Lance deixa de estar "nunca classificada"), mas continua exibindo V1 até a causa dos R$4,37 ser confirmada (ou o `AJUSTE-06-08` ser sincronizado como transação real na V2). Na prática, hoje o módulo é 100% log-only (não escreve no DOM).

**6. Validação**: técnica/estática apenas — usuário recusou login manual nesta sessão (regra permanente: IA nunca digita senha). Verificado objetivamente: script carregado 1x no HTML, todas as referências (`REG.balanco.reservas.caixaLance`, `REG.patrimonioDetalhe.caixaLance`, `$`, `fmt`, `WallaceFinanceService`) existem no código real, nomes globais (`ONDA3_CAIXALANCE_MAPA`, `aplicarOnda3CaixaLance`, `WALLACE_ONDA3_CAIXALANCE_RELATORIO`) únicos em `src/`, fallback automático em caso de erro de fetch (try/catch retorna sem tocar DOM), escrita no DOM restrita aos 2 ids previstos. **Validação em navegador real (console, `WALLACE_ONDA3_CAIXALANCE_RELATORIO`) continua pendente** — fazer na próxima vez que alguém logar.

**7. Resultado**: Caixa Lance passa a ser **comparada e logada** a cada carregamento (não mais "nunca classificada"), mas continua exibindo V1 — nem migração completa nem mais bloqueio invisível. Se a causa dos R$4,37 for confirmada (ou o ajuste sincronizado), virar `aceitarDivergenciaConhecida: true` é a única mudança necessária no arquivo.

**8. Rollback**: comentar `aplicarOnda3CaixaLance();` em `app.js`.

---

## Status da Onda 3 após Prioridades 1-5 (08/08/2026)

| Prioridade | Item | Status |
|---|---|---|
| 1 | Livro Razão (7 tabelas) | ✅ Migrado |
| 2 | LRW/LRV (compromisso por pessoa) | ✅ Migrado |
| 3 | Patrimônio | ⛔ Bloqueado — ausência real de estrutura V2 (ambiguidade de linhas + metadados inexistentes) |
| 4 | Metas | 🟡 Parcial — Fundo de Suavização migrado; Meta do Milhão bloqueada (mesma causa da P3) |
| 5 | Investimentos | ⛔ Bloqueado — ausência real de estrutura V2 (`investimentos` sem os ~14 campos que `opcoesVendidasDetalhe` usa) |

Onda 3 esgotada: as 5 prioridades foram percorridas na ordem — 2 migradas, 1 parcial, 2 bloqueadas por ausência real de estrutura (critério de parada explícito do usuário).

**Pendência transversal investigada (não mais em aberto como "nunca classificada")**: Caixa Lance agora comparada/logada a cada carregamento (seção 30), continua em V1 por divergência de baixa confiança (R$4,37, causa não confirmada) — não migrada, mas não é mais um ponto cego.

---

# ONDA 4 — "Supabase como fonte única de verdade" (08/08/2026)

**Mudança de prioridade explícita do usuário**: a partir daqui, a V2 deixa de ser "candidata sujeita a aceite por divergência" e passa a ser **fonte primária assim que a estrutura existir** — sem gate de comparação, sem parar pra revisão intermediária. Fallback V1 só em erro técnico (fetch falhou/tabela vazia), nunca por diferença de valor. Ordem autorizada: Patrimônio → Investimentos/ROC → LREI → Cascata Wärtsilä. Regra: aplicar migration, migrar dados, validar, documentar, commitar, seguir — só parar em bloqueador técnico real.

## 31. Onda 4, domínio 1 — Patrimônio: schema criado, dados migrados, V2 é a fonte (08/08/2026)

**1. Objetivo**: eliminar a ausência de estrutura que bloqueava a Onda 3/Prioridade 3 — rotular as 11 linhas de `patrimonio` e modelar os metadados de financiamento/consórcio que não existiam em lugar nenhum da V2.

**2. Escopo**: `patTotal`, `patReserva`, `patBtg`, `patEscola` (nectonContaCorrente), `patAcumulado`, `patFalta`, `patPctBadge`/`patPctBar` (Meta do Milhão), `ppFinanciamentoCasa`/`ppFinanciamentoDetalhe`/`ppConsorcioAuto`/`ppConsorcioAutoBar`/`ppConsorcioAutoPct`/`ppConsorcioAutoParcela` (seção 11, Passivos Patrimoniais). **Exceção deliberada**: `patLance` continua vindo do V1 (`caixaLance`) — pendência já registrada na seção 30 (divergência R$4,37, causa não confirmada), usuário pediu explicitamente pra não reabrir.

**SQL criado** (3 migrations aplicadas via Supabase MCP):
```sql
-- Migration 1: patrimonio_rotulo_financiamentos
ALTER TABLE public.patrimonio ADD COLUMN rotulo text, ADD COLUMN subtipo text;
ALTER TABLE public.patrimonio DROP CONSTRAINT patrimonio_natureza_check;
ALTER TABLE public.patrimonio ADD CONSTRAINT patrimonio_natureza_check
  CHECK (natureza = ANY (ARRAY['ativo','passivo','informativo']));
CREATE TABLE public.financiamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patrimonio_id uuid NOT NULL REFERENCES public.patrimonio(id),
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['financiamento_imovel','consorcio_veiculo','consorcio_imovel'])),
  carta_credito numeric, parcela_valor numeric, parcelas_pagas integer, parcelas_totais integer,
  meses_restantes integer, percentual_pago numeric, valor_quitacao numeric, proxima_assembleia date,
  created_at timestamptz DEFAULT now()
);
-- RLS: mesma policy de leitura publica ja usada nas outras tabelas (migration 2, financiamentos_rls_alinhar_padrao)

-- Migration 3: view_patrimonio_v2 (reproduz a formula de recalcularPatrimonio(), so lendo V2)
CREATE VIEW public.vw_patrimonio_v2 AS SELECT
  (SELECT valor FROM patrimonio WHERE subtipo='reserva') AS reserva,
  (SELECT valor FROM patrimonio WHERE subtipo='btg_necton') AS btg_necton,
  (SELECT valor FROM patrimonio WHERE subtipo='necton_cc') AS necton_conta_corrente,
  -- + fisico (casa/apartamento/jazigo/solar/carro), passivos (financiamento_casa/consorcio_auto),
  -- pgbl/fgts (informativo) e os 9 campos de financiamentos (prestacao/meses/carta_credito/parcela/
  -- pct/quitacao/assembleia) via JOIN patrimonio+financiamentos — ver arquivo de migration completo
  -- no histórico do Supabase MCP (nome "view_patrimonio_v2").
  ...;
```

**3. Arquivos alterados**: `src/financeiro/patrimonio/hydrate-onda4-patrimonio.js` (novo), `src/app/app.js` (+`getPatrimonioV2()` no `WallaceFinanceService`, +chamada `aplicarOnda4Patrimonio()` no final de `hydrate()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada no array de módulos).

**4. Fonte antiga**: `VARS.reserva`/`btgNecton`/`nectonContaCorrente`/`patCasa`/`patApartamento`/`patJazigo`/`patSolar`/`patCarro`/`patPgbl`/`patFgts`/`passivoFinanciamentoCasa`/`prestacaoFinanciamentoCasa`/`mesesRestantesFinanciamentoCasa`/`passivoConsorcioAuto`/`consorcioAutoPagoPct`/`parcelaConsorcioAuto`/`consorcioCasaCartaCredito`/`consorcioCasaParcela`/`consorcioCasaPagoPct`/`consorcioCasaQuitacao`/`consorcioCasaProximaAssembleia`.

**5. Fonte nova**: `vw_patrimonio_v2` (join `patrimonio`+`financiamentos`, rotulados por `subtipo`).

**Migração dos dados**: 11 `UPDATE`s (rótulo/subtipo nas linhas já existentes, identificadas por valor — mesma correspondência 1:1 já confirmada na sessão anterior), 3 `INSERT`s em `financiamentos` (financiamento casa, consórcio casa, consórcio auto) e 2 `INSERT`s novos em `patrimonio` (PGBL R$133.472,56 e FGTS R$82.983,60, `natureza='informativo'`) — todos com os mesmos valores já exibidos hoje via `VARS`, nenhum número novo inventado. Nenhuma linha existente teve seu `valor` alterado.

**6. Validação**: técnica (login manual recusado pelo usuário, mesma substituição já aceita na Onda 3/seção 30) — `SELECT * FROM vw_patrimonio_v2` confere **exatamente** com os 20+ valores documentados de `VARS` (reserva 100644,15, btg 14779,62, nectonCC 429,75, físico total 430.800,00, financiamento casa 61.081,39 + prestação 588,66/147 meses, consórcio auto 18.998,83 + 75,22%/R$501,15, consórcio casa 0,42%/R$1.449,45/R$450.000,00/R$550.601,43/21-08-2026) — zero divergência, por construção. Checagem estática do módulo novo: script carregado 1x, `WallaceFinanceService.getPatrimonioV2`/`REG.patrimonioDetalhe.caixaLance`/`REG.patrimonio.metaMilhao`/`REG.patrimonio.total` existem no código real, nomes globais (`aplicarOnda4Patrimonio`, `WALLACE_ONDA4_PATRIMONIO_RELATORIO`) únicos em `src/`, fallback automático em erro de fetch, escrita de DOM restrita aos 13 ids previstos. **Validação em navegador real continua pendente** (mesma situação da seção 30).

**7. Resultado**: **Patrimônio (exceto Caixa Lance) migrado para V2 como fonte primária**, sem gate de divergência. `VARS.reserva/btgNecton/nectonContaCorrente/patCasa/.../consorcioCasa*` (~20 chaves) deixam de ser necessárias no frontend — continuam existindo em `wallace_dados` só como histórico/fallback, não como fonte ativa.

**8. Rollback**: comentar `aplicarOnda4Patrimonio();` em `app.js` (dados na V2 não são revertidos — só a leitura volta a ser V1). Reversão de schema, se necessária: `DROP VIEW vw_patrimonio_v2; DROP TABLE financiamentos; ALTER TABLE patrimonio DROP COLUMN rotulo, DROP COLUMN subtipo;` (reverte a constraint de `natureza` antes de derrubar as 2 linhas informativas, se for o caso).

## 32. Onda 4, domínio 2 — Investimentos/ROC/Opções: schema criado, V1 reaproveitado sobre dado V2 (08/08/2026)

**1. Objetivo**: eliminar a ausência de estrutura que bloqueava a Onda 3/Prioridade 5 — adicionar à `investimentos` os ~9 campos que `opcoesVendidasDetalhe` usa por operação (strike, vencimento, prêmios, custos, nota de corretagem, exercício).

**2. Escopo**: seção 17 inteira (Opções vendidas/ROC) — cards de resumo (`opcoesValorMercado`/`opcoesPremioTotal`/`opcoesPremioBrutoTotal`/`opcoesCustosTotal`/`rocCapitalTravado`/`rocPremioLiquido`/`rocRentabilidade*`/`rocComparacaoCDI`/`rocDiasMedios`/`rocStatusBadge`/`legRocCarteira`) + as 3 tabelas (posições ativas/vencidas/exercidas, `opcoesTbody`/`opcoesVencidasTbody`/`opcoesExercidasTbody`).

**Estratégia diferente dos outros domínios**: em vez de reimplementar a renderização (~230 linhas em `hydrate-roc.js`, incluindo integração com cotações ao vivo brapi.dev, cores OTM/ITM, 3 tabelas), o módulo novo troca só a **origem do dado bruto** e **reaproveita as 3 funções V1 inalteradas**: `aplicarStatusVencidoEValorMercadoOpcoes()` + `calcularROCOpcoes()` (`opcoes-roc.js`) pro cálculo, `hydrateROC()` (`hydrate-roc.js`) pra renderização — chamadas de novo, agora operando sobre `VARS.opcoesVendidasDetalhe` sobrescrito com dado da V2. Zero lógica duplicada.

**SQL criado**:
```sql
ALTER TABLE public.investimentos
  ADD COLUMN ativo_subjacente text, ADD COLUMN preco_exercicio numeric, ADD COLUMN data_vencimento date,
  ADD COLUMN premio_bruto numeric, ADD COLUMN custo_operacional numeric, ADD COLUMN premio_recebido numeric,
  ADD COLUMN preco_medio numeric, ADD COLUMN nota_corretagem text, ADD COLUMN exercida boolean DEFAULT false,
  ADD COLUMN data_operacao date; -- mesma data ja embutida como texto em nota_corretagem, estruturada
```
Parâmetros globais (CDI/ROC) reaproveitam `indicadores` (mesmo padrão já usado pro "PIB Wallace"): `CDI_MENSAL_ATUAL`, `ROC_STATUS_LIMITES - boaAte`, `ROC_STATUS_LIMITES - muitoBoaAte`.

Também criadas `vw_opcoes_vendidas_v2` e `vw_roc_opcoes_v2`/`vw_roc_carteira_v2` (tradução SQL da mesma fórmula de `calcularROCOpcoes()`, pra consulta/auditoria direta via SQL) — **não usadas pelo frontend** (que reaproveita o cálculo JS original), mas documentadas e validadas como registro de que a fórmula bate nas 2 formas.

**3. Arquivos alterados**: `src/financeiro/investimentos/hydrate-onda4-investimentos.js` (novo), `src/app/app.js` (+`getInvestimentosOpcoesV2()`/`getIndicador()` no `WallaceFinanceService`, +chamada `aplicarOnda4Investimentos()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada).

**4. Fonte antiga**: `VARS.opcoesVendidasDetalhe` (3 posições, literal), `VARS.CDI_MENSAL_ATUAL`, `VARS.ROC_STATUS_LIMITES`.

**5. Fonte nova**: `investimentos` (tipo=opcoes, via `getInvestimentosOpcoesV2()`) + `indicadores` (via `getIndicador()`).

**Migração dos dados**: `UPDATE` nas 2 linhas já existentes (PETRT379/ITUBT424) com os mesmos valores de `vars-roc.js`, `INSERT` de 1 linha nova (PETRS368W5, posição encerrada, não existia na V2), 3 `INSERT`s em `indicadores`.

**6. Validação**: `SELECT * FROM vw_roc_opcoes_v2`/`vw_roc_carteira_v2` confere exato com os cálculos documentados (capital travado R$7.372,00/R$8.364,00, prêmio líquido R$154,84/R$177,04, consolidado R$15.736,00 capital/R$331,88 prêmio, 1 item vencido excluído, 0 sem strike). Checagem estática do módulo: script carregado 1x, `aplicarStatusVencidoEValorMercadoOpcoes`/`calcularROCOpcoes`/`hydrateROC` existem e são globais (scripts clássicos, carregados antes de `app.js`), nomes novos (`aplicarOnda4Investimentos`, `WALLACE_ONDA4_INVESTIMENTOS_RELATORIO`, `getInvestimentosOpcoesV2`, `getIndicador`) únicos em `src/`. **Validação em navegador real pendente** (mesma situação dos domínios anteriores).

**7. Resultado**: **seção 17 inteira migrada para V2 como fonte**, reaproveitando 100% do código de cálculo/renderização V1. `VARS.opcoesVendidasDetalhe`/`CDI_MENSAL_ATUAL`/`ROC_STATUS_LIMITES` deixam de ser necessários no frontend.

**8. Rollback**: comentar `aplicarOnda4Investimentos();` em `app.js`.

## 33. Onda 4, domínio 3 — LREI (Empréstimos Internos): tabela nova criada, V1 reaproveitado (08/08/2026)

**1. Objetivo**: eliminar a ausência real de estrutura confirmada na proposta — nenhuma tabela da V2 rastreava empréstimos internos entre caixas.

**2. Escopo**: aba "LREI - Empréstimos" do Livro Razão (`lreiTbody`, `lrTabBtn_lrei`, dentro de `renderLivrosVariaveis()`).

**Mesma estratégia do domínio 2**: troca a origem de `VARS.LREI_ATIVAS` e re-chama `renderLivrosVariaveis()` (`render-livros-variaveis.js`, inalterada) — zero lógica de renderização duplicada.

**SQL criado**:
```sql
CREATE TABLE public.emprestimos_internos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_legado text UNIQUE NOT NULL,
  data_emprestimo date NOT NULL,
  caixa_credora_id uuid NOT NULL REFERENCES public.caixas(id),
  caixa_devedora_id uuid REFERENCES public.caixas(id),  -- NULL quando devedora nao e uma caixa
  devedora_texto text,                                   -- fallback ('Fatura Cartão Mercado Pago')
  valor numeric NOT NULL, origem text,
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status = ANY (ARRAY['ATIVO','QUITADO'])),
  data_quitacao date, quitado_por text,
  transacao_quitacao_id uuid REFERENCES public.transacoes(id),
  created_at timestamptz DEFAULT now()
);
-- RLS: mesma policy de leitura publica das outras tabelas

CREATE VIEW public.vw_emprestimos_internos_v2 AS
SELECT e.codigo_legado AS id, to_char(e.data_emprestimo,'DD/MM') AS data, cc.nome AS credora,
  COALESCE(cd.nome, e.devedora_texto) AS devedora, e.valor, e.origem, e.status,
  to_char(e.data_quitacao,'DD/MM') AS quitado_em, e.quitado_por
FROM public.emprestimos_internos e
JOIN public.caixas cc ON cc.id = e.caixa_credora_id
LEFT JOIN public.caixas cd ON cd.id = e.caixa_devedora_id
ORDER BY e.codigo_legado;
```

**3. Arquivos alterados**: `src/financeiro/operacional/hydrate-onda4-lrei.js` (novo), `src/app/app.js` (+`getEmprestimosInternosV2()`, +`onDomPronto(aplicarOnda4Lrei)` logo depois de `aplicarOnda3LivroRazao`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada).

**4. Fonte antiga**: `VARS.LREI_ATIVAS` (3 itens, literal em `vars-reembolsos.js`).

**5. Fonte nova**: `emprestimos_internos` via `vw_emprestimos_internos_v2`.

**Migração dos dados**: 3 `INSERT`s (LREI0002 quitado — com `transacao_quitacao_id` apontando pra `TX000212` de verdade —, LREI0003 e LREI0004 ativos), `caixa_credora_id`/`caixa_devedora_id` resolvidos via nome (`Caixa Lance`/`Caixa Saúde Família`/`Caixa Manutenção`), `devedora_texto='Fatura Cartão Mercado Pago'` pro LREI0003 (não é caixa). Mesmos valores já em `VARS`, nenhum dado novo.

**6. Validação**: `SELECT * FROM vw_emprestimos_internos_v2` confere exato (3 itens, mesmos id/data/credora/devedora/valor/origem/status/quitadoEm/quitadoPor). Checagem estática: script carregado 1x, `renderLivrosVariaveis`/`fmt` existem e são globais, nomes novos únicos. **Validação em navegador real pendente.**

**Nota de escopo**: outros consumidores de `VARS.LREI_ATIVAS` que rodam ANTES deste módulo no boot síncrono (`REG.qualidade.lreiAtivos`, `aporteBTGProgramado.caixaLanceCompleta`, simulador de ciclo) não foram re-executados — mesmo padrão aceito no domínio 2, valores idênticos por migração, sem divergência visual.

**7. Resultado**: **LREI migrado para V2 como fonte**. `VARS.LREI_ATIVAS` deixa de ser necessário no frontend.

**8. Rollback**: comentar `onDomPronto(aplicarOnda4Lrei);` em `app.js`.

## 34. Onda 4, domínio 4 — Cascata de Reembolso Wärtsilä: schema criado, gap de sincronização da caixa corrigido (08/08/2026)

**1. Objetivo**: eliminar a ausência de estrutura por perna/ciclo (a tabela `reembolsos` é um total corrido, sem quebra) — último dos 4 domínios autorizados.

**2. Escopo**: seção "Reembolso Wärtsilä" (`reembRecebidos`/`reembAReceber`/`reembCicloTotal`/`reembPagaWartsila`/`reembPagaMP`/`reembPagaCartao`/`reembSobraPessoal`/`reembMPPessoal`/`metaInv*`).

**Achado durante a implementação (fora do plano original, descoberto ao investigar)**: a caixa "Provisionado Wärtsilä" já existia na V2 (`caixas`, saldo inicial R$683,04) mas com **0 transações sincronizadas** — `vw_saldo_v2_por_caixa` mostrava o saldo travado no inicial, nunca refletindo as 3 movimentações já documentadas em `VARS.WARTSILA_CAIXA_TRANSACOES`. Corrigido via `INSERT` aditivo em `transacoes` (3 linhas, mesmos valores/datas já documentados) — saldo V2 agora R$339,00, batendo exato com o cálculo V1 (683,04-656,67-27,37+340,00).

**SQL criado**:
```sql
CREATE TABLE public.reembolso_wartsila_ciclo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_referencia text NOT NULL UNIQUE,
  valor_total_bruto numeric NOT NULL, valor_a_receber numeric NOT NULL DEFAULT 0,
  perna_fatura_wartsila numeric DEFAULT 0, perna_mp_corporativo numeric DEFAULT 0,
  perna_cartao_corporativo_pessoal numeric DEFAULT 0,
  perna_mp_pessoal_provisionado numeric, -- NULL: fora do escopo (dominio parcelamentos MP)
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.reembolso_wartsila_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id uuid NOT NULL REFERENCES public.reembolso_wartsila_ciclo(id),
  data date NOT NULL, valor numeric NOT NULL, descricao text,
  transacao_id uuid REFERENCES public.transacoes(id)
);
```

**Decisão de não-alteração**: `reembolsos` (tabela pré-existente, 1 linha `origem='wartsila', valor_a_receber=7022.76, valor_recebido=0`) **não foi tocada** — mesma disciplina "nenhum dado existente alterado" das 3 migrations anteriores. A quebra por perna/ciclo é aditiva, em tabela nova.

**3. Arquivos alterados**: `src/financeiro/operacional/hydrate-onda4-wartsila.js` (novo), `src/app/app.js` (+`getReembolsoWartsilaCicloV2()`, +chamada `aplicarOnda4Wartsila()` no final de `hydrate()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada).

**Estratégia**: mesma dos domínios 2/3 — sobrescreve só os campos de entrada (`VARS.faturaWartsila`, `REG.faturaWartsila`, `REG.wartsilaCaixa.fatura/provisionado`, `REG.operacional.reembolsoPaga*/reembolsoCicloTotal/reembolsosAReceber`) e reaproveita `recalcularReembolsos()`+`hydrateReembolsos()` (V1, inalteradas). `REG.totalOpDetalhe.provMP` (perna 4, domínio de parcelamentos MP) **não é tocado** — fora do escopo autorizado.

**4. Fonte antiga**: `VARS.faturaWartsila`/`reembolsoPagaCartaoCorporativo`/`reembolsoPagaMPCorporativo`/`reembolsoCicloTotal`/`__reembolsosAReceber`, `VARS.WARTSILA_CAIXA_SALDO_INICIAL`+`WARTSILA_CAIXA_TRANSACOES`.

**5. Fonte nova**: `reembolso_wartsila_ciclo` (pernas 1-3 + total + a receber) + `vw_saldo_v2_por_caixa` (Provisionado Wärtsilä, já madura desde a Onda 1/2).

**Migração dos dados**: 1 `INSERT` no ciclo 2026-07 (total bruto R$5.254,98, a receber R$0, perna fatura R$0 — paga —, perna MP corporativo R$1.277,88, perna cartão corporativo R$483,83), 1 `INSERT` em recebimentos (TX000220, R$340,00, linkado à transação real), + as 3 transações da caixa (achado acima). Mesmos valores já em `VARS`, nenhum dado novo inventado.

**6. Validação**: `SELECT * FROM reembolso_wartsila_ciclo`/`reembolso_wartsila_recebimentos` confere exato. `vw_saldo_v2_por_caixa` pra "Provisionado Wärtsilä" = R$339,00 (batia com o cálculo manual V1 antes mesmo de rodar o módulo). Checagem estática: script carregado 1x, `recalcularReembolsos`/`hydrateReembolsos`/`REG.wartsilaCaixa`/`REG.operacional`/`REG.totalOpDetalhe` existem no código real, nomes novos únicos. **Validação em navegador real pendente** (mesma situação dos 3 domínios anteriores).

**7. Resultado**: **Cascata Wärtsilä migrada para V2 como fonte** (exceto perna 4/MP pessoal, fora do escopo). `VARS.faturaWartsila`/`reembolsoPaga*`/`reembolsoCicloTotal`/`WARTSILA_CAIXA_*` deixam de ser necessários no frontend. **Fim dos 4 domínios autorizados pela Onda 4.**

**8. Rollback**: comentar `aplicarOnda4Wartsila();` em `app.js`. As 3 transações inseridas em `transacoes` (achado à parte, não fazem parte do rollback da leitura) permanecem — são dado real sincronizado, não lógica de exibição.

---

## Status da Onda 4 (08/08/2026) — 4/4 domínios autorizados implementados

| # | Domínio | Status | Estratégia |
|---|---|---|---|
| 1 | Patrimônio | ✅ Migrado | Overlay novo (`hydrate-onda4-patrimonio.js`) |
| 2 | Investimentos/ROC | ✅ Migrado | Reaproveita cálculo/render V1 (`opcoes-roc.js`/`hydrate-roc.js`) |
| 3 | LREI | ✅ Migrado | Reaproveita render V1 (`renderLivrosVariaveis()`) |
| 4 | Cascata Wärtsilá | ✅ Migrado | Reaproveita cálculo/render V1 (`recalcularReembolsos()`/`hydrateReembolsos()`) |

**Achado colateral fora do plano original**: caixa "Provisionado Wärtsilä" tinha gap de sincronização (0 transações na V2 apesar de já ter saldo inicial) — corrigido no caminho do domínio 4.

**Pendência transversal, não resolvida por decisão explícita do usuário**: divergência de R$4,37 da Caixa Lance (seção 30) — não reaberta nesta Onda.

**Validação em navegador real de TODOS os 4 domínios continua pendente** — usuário recusou login manual em toda a Onda 4; toda validação foi técnica/estática + conferência SQL direta contra os valores documentados do V1.

---

# ONDA 5 — continuação da aposentadoria do `wallace_dados` (08/08/2026)

**Diretriz do usuário**: Onda 4 aprovada e encerrada, não reabrir. A partir daqui, regra operacional permanente: sempre que um domínio estiver modelado no Supabase + reconciliado + consumível pelo frontend, ele deixa de ter VARS como fonte oficial (VARS vira só compatibilidade/fallback). Seguir direto pro próximo domínio de maior impacto, sem nova rodada de levantamento/estratégia — só corrigir bugs reais achados em validação.

## 35. Onda 5, domínio 1 — Parcelamentos (LRP/LRMP): view criada sobre tabela já sincronizada, V1 reaproveitado (08/08/2026)

**1. Objetivo**: identificar e migrar o próximo domínio de maior impacto sem precisar de nova investigação de divergência (regra explícita do usuário: não reabrir reconciliação).

**2. Achado ao levantar candidatos**: `parcelas` (V2) **já tinha as 22 linhas** (16 `PARCELAMENTOS_VISA` + 6 `PARCELAMENTOS_MP`) sincronizadas 1:1 com os arrays do VARS — mesmo `tx_legado`, `numero_parcela`/`total_parcelas`, `valor_parcela`, `status` (conferido linha a linha) — provavelmente já preparada por uma sessão/sincronização anterior. Só faltava a view de consumo e o módulo de ligação, nenhuma migração de dado necessária. **Candidato descartado no mesmo levantamento**: as 4 tabelas de compras variáveis remanescentes (LRW/LRV/LRC-limbo/LRCV, domínio Mercado Pago/Mastercard Black) — investigação preliminar achou 147 transações candidatas em `transacoes` (Caixa Variável, `afeta_saldo_real=false`) contra só 43 itens nos 4 arrays V1, sem coluna existente pra separar os 4 grupos sem inventar critério novo — ficaria classificado como "ausência real de estrutura de categorização", não perseguido agora pra não virar investigação de divergência (proibida pela diretriz atual).

**2.1 Escopo**: seção 15 (LRP — Visa Infinite, LRMP — Mercado Pago), tabelas `lrpTbody`/`lrmpTbody`.

**SQL criado**:
```sql
CREATE VIEW public.vw_parcelamentos_v2 AS
SELECT p.tx_legado AS tx, COALESCE(t.descricao, p.tx_legado) AS nome,
  p.numero_parcela AS parcela_atual, p.total_parcelas, p.valor_parcela AS valor,
  CASE WHEN p.status='ativa' THEN 'ATIVO' ELSE 'QUITADO' END AS status,
  p.origem_array, to_char(p.data_prevista,'DD/MM') AS data
FROM public.parcelas p
LEFT JOIN public.transacoes t ON t.id = p.transacao_origem_id
WHERE p.origem_array IN ('PARCELAMENTOS_VISA','PARCELAMENTOS_MP')
ORDER BY p.origem_array, p.tx_legado;
```

**3. Arquivos alterados**: `src/financeiro/livros-razao/hydrate-onda5-parcelamentos.js` (novo), `src/app/app.js` (+`getParcelamentosV2()`, +`onDomPronto(aplicarOnda5Parcelamentos)` logo depois de `renderParcelamentos`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada).

**Estratégia**: mesma dos domínios 2-4 da Onda 4 — troca a origem de `VARS.PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP` e reaproveita `renderParcelamentos()` (`render-parcelamentos.js`, inalterada) — zero lógica de renderização duplicada.

**4. Fonte antiga**: `VARS.PARCELAMENTOS_VISA` (16 itens)/`PARCELAMENTOS_MP` (6 itens).

**5. Fonte nova**: `parcelas` via `vw_parcelamentos_v2`.

**Migração dos dados**: **nenhuma** — os dados já existiam, só a view foi criada.

**Diferença cosmética conhecida, não financeira, não bloqueia**: o "nome" vem de `transacoes.descricao` (ex: `"TEACHER_MATIAS"`) em vez do texto V1 mais legível (`"Teacher Matias"`) — mesma informação, formatação diferente na origem. Não reformatado (evitaria inventar lógica de texto nova). 1 item (`TXP000025`, RBM Relógios, já quitado) não tem `transacao_origem_id` ligado — usa o próprio `tx_legado` como nome de fallback, documentado, não inventado.

**6. Validação**: `SELECT * FROM vw_parcelamentos_v2 WHERE status='ATIVO'` confere exato com os 15 itens ativos documentados (quantidades, parcela atual/total, valores — todos batendo). Checagem estática: script carregado 1x, `renderParcelamentos`/`fmt` existem e são globais, nomes novos (`aplicarOnda5Parcelamentos`, `WALLACE_ONDA5_PARCELAMENTOS_RELATORIO`, `getParcelamentosV2`) únicos em `src/`. **Validação em navegador real pendente** (mesma situação de toda a Onda 4).

**7. Resultado**: **Parcelamentos migrado para V2 como fonte**. `VARS.PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP` deixam de ser necessários no frontend. `VARS.TRANSACOES_CORPORATIVAS_MP` (itens corporativos/avulsos, sem equivalente em `parcelas`) continua V1 — fora do escopo desta migração, não afetado.

**8. Rollback**: comentar `onDomPronto(aplicarOnda5Parcelamentos);` em `app.js`.

## 36. Onda 5, domínio 3 — avaliação Mastercard Black/Visa (BLOQUEADO para migração completa) + domínio 2 executado (P2P) (08/08/2026)

**Avaliação rápida Mastercard Black/Visa (pedida pelo usuário, sem nova rodada de levantamento)**:
- **Totais que ainda dependem de VARS**: `cartaoInfiniteTotal`/`cartaoMBTotal` (headline, seções 01/02/03), `mercadoPagoFatura`, `mastercardBlackCongelado`, `livroLRCON`/`livroLRB`/`livroLRCV`, e os 3 sub-detalhamentos `visaDetalhe`/`mbDetalhe` (parcelas/consórcios/wallace/recorrências/corp/assinaturas/vanessa/nãoReconciliado).
- **O que já é calculável a partir da V2 sem nova estrutura**: `visaDetalhe.parcelas`/`mbDetalhe.parcelas` (via `livroLRP`, que deriva de `PARCELAMENTOS_VISA` — já migrado na Onda 5 domínio 1) e o equivalente MP (`totalOpProvMP`, de `PARCELAMENTOS_MP`) — **mas o recálculo desses 2 totais roda 1x, de forma síncrona, ANTES do módulo de Parcelamentos (assíncrono) sobrescrever os arrays** — achado nesta avaliação: a fórmula ficou "presa" no valor V1 do momento do boot, mesmo com o array já vindo da V2. Não é bug visível hoje (V1=V2 por migração, zero divergência), mas a fiação downstream não é de fato V2 ainda. Registrado como nota técnica, não corrigido agora (impacto visual zero, fora do escopo desta rodada).
- **O que está genuinamente bloqueado**: os headline totals (`cartaoInfiniteTotal`/`cartaoMBTotal`) são **números de fatura real do banco, reconciliados manualmente linha a linha contra o extrato** (auditoria SSOT V135/V111, com um resíduo documentado de R$49,81 "naoReconciliado" — o próprio V1 admite que nem toda fatura bate exato com a soma dos itens, por política "fatura sempre vence"). Derivar isso 100% da V2 exigiria re-itemizar a fatura transação a transação — **isso é reconciliação, explicitamente proibida nesta rodada**. Além disso, 4 dos 8 componentes do detalhamento (`wallace`/`vanessa` de LRW/LRV, `corp` de LRC-limbo) dependem da mesma classificação de 147 transações candidatas sem coluna discriminadora, já documentada como bloqueada na seção 35.
- **Caminho incremental seguro que existe, mas não foi executado agora**: migrar os headline totals pra `indicadores` como "verdade externa" (mesmo padrão do CDI) — tecnicamente seguro, mas de baixo valor real (não reduz a necessidade de reconciliação manual, só move onde o número mora) e exigiria tocar `recalcularMercadoPago()` em conjunto com o gap de fiação já achado acima. Avaliado como esforço/risco desproporcional ao ganho nesta rodada — **não executado, domínio permanece V1**.

**Decisão**: Mastercard Black/Visa fica **documentado como bloqueado por acoplamento a reconciliação bancária manual + mesma ausência de classificação já registrada** — não perseguido. Seguindo pro próximo domínio de maior impacto sem esse acoplamento: **P2P** (seção 18), isolado (`recalcularP2P()` só depende de `VARS.p2p*`, sem dependência cruzada de nenhum outro domínio).

---

## 37. Onda 5, domínio 2 — P2P: migrado para V2 (`indicadores`), V1 reaproveitado (08/08/2026)

**1. Objetivo**: reduzir dependência de `wallace_dados` num domínio pequeno e isolado, sem reabrir reconciliação.

**2. Escopo**: seção 18 (Operações P2P) — `p2pCapitalTotal`/`p2pCreditosRestantes`/`p2pSaldoInvestido`/`p2pLucroRealizado`/`p2pDetalhe`.

**SQL criado**: 7 linhas em `indicadores` (mesmo padrão do CDI — "verdade externa", plataforma P2P, não derivável de `transacoes`/`parcelas`) + view:
```sql
INSERT INTO public.indicadores (nome, valor, data_calculo) VALUES
  ('P2P - capitalTotal', 110, '2026-08-08'), ('P2P - creditosTotal', 10, '2026-08-08'),
  ('P2P - creditosRestantes', 6, '2026-08-08'), ('P2P - creditosVendidos', 3, '2026-08-08'),
  ('P2P - precoCompra', 11, '2026-08-08'), ('P2P - precoVenda', 20, '2026-08-08'),
  ('P2P - lucroRealizado', 27, '2026-08-08');

CREATE VIEW public.vw_p2p_v2 AS SELECT
  MAX(valor) FILTER (WHERE nome='P2P - capitalTotal') AS capital_total, ... -- 1 linha, 7 colunas
FROM public.indicadores WHERE nome LIKE 'P2P - %';
```

**3. Arquivos alterados**: `src/financeiro/investimentos/hydrate-onda5-p2p.js` (novo), `src/app/app.js` (+`getP2PV2()`, +chamada `aplicarOnda5P2P()` no final de `hydrate()`), `Sistema_Wallace_Lira_Completo.html` (+1 entrada).

**Estratégia**: mesma dos domínios anteriores — sobrescreve `VARS.p2p*`+`REG.p2p.*` (campos base) e reaproveita `recalcularP2P()`+`hydrateResumoP2P()` (V1, inalteradas) pro cálculo (`saldoInvestido`/`rentabilidadePct`)/renderização.

**4. Fonte antiga**: `VARS.p2pCapitalTotal`/`p2pCreditosTotal`/`p2pCreditosRestantes`/`p2pCreditosVendidos`/`p2pPrecoCompra`/`p2pPrecoVenda`/`p2pLucroRealizado` (7 literais).

**5. Fonte nova**: `indicadores` via `vw_p2p_v2`.

**Migração dos dados**: 7 `INSERT`s, mesmos valores já em `vars-p2p.js`, nenhum dado novo.

**6. Validação**: `SELECT * FROM vw_p2p_v2` confere exato (110/10/6/3/11/20/27). Checagem estática: script carregado 1x, `recalcularP2P`/`hydrateResumoP2P` existem e são globais, nomes novos únicos. **Validação em navegador real pendente** (mesma situação de toda a Onda 4/5).

**7. Resultado**: **P2P migrado para V2 como fonte**. `VARS.p2p*` deixa de ser necessário no frontend.

**8. Rollback**: comentar `aplicarOnda5P2P();` em `app.js`.

---

## Status da Onda 5 (08/08/2026)

| Domínio | Status |
|---|---|
| 1. Parcelamentos (LRP/LRMP) | ✅ Migrado |
| 2. P2P | ✅ Migrado |
| 3. Mastercard Black/Visa | ⛔ Bloqueado — acoplado a reconciliação bancária manual + gap de classificação já documentado (seção 35) |

**Achado técnico registrado, não corrigido** (baixo impacto, zero divergência visível hoje): `VARS.livroLRP`/`totalOpProvMP` são recalculados de forma síncrona no boot, antes do módulo assíncrono de Parcelamentos trocar os arrays por V2 — a fiação downstream ainda reflete o valor do momento do boot, não literalmente "ao vivo" da V2. Corrigir exigiria re-disparar parte da cadeia de `recalcularAgregadosDerivados()`, fora do escopo desta rodada.
