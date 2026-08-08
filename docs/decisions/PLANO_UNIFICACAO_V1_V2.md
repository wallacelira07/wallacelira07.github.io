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
**`TX000208`** — status: **"Pendente de definição de rastreabilidade por colisão de `tx_legado`."** Não inserido na V2. Correção a avaliar futuramente (renumeração na origem V1, alias controlado, ou outro tratamento) — nenhuma ação tomada até decisão explícita.

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

## Próximo passo

**Fase 4A, 4B-2, 4C, 4B-1 (parcial) concluídas e validadas** (seções 11, 13, 14, 16). Caso `TX000140`/Caixa Boletos encerrado (seção 17). **Decisão 3a/3b encerrada formalmente — 3a implementada, Parte A concluída, `caixa_id=Caixa Variável` confirmado por regra de negócio (Política Interna §13), não só por pragmatismo técnico** (seção 18 + correção de narrativa na seção 15). `sincronizar_v1_v2()` construída e validada em dry-run, aguardando primeiro candidato real pra validar escrita (seção 19). Pendências reais: `TX000208` (governança, seção 16), Parte B — 5 divergências de valor (seção 18, não investigada), sincronização recorrente/agendada (sem mecanismo automático de disparo, só execução manual da função). Fase 4D sem proposta técnica ainda. Próximo agente: leia as seções 12-19 antes de qualquer ação nova.
