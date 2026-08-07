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
| **1** | Preencher `cartao_id`/`usuario_id` retroativo nas 282 transações | 100% preenchido, auditado 1x1 contra V1 |
| **2** | Trilha de auditoria (`audit_log`) + triggers | Toda escrita em `transacoes`/`caixas` gera log, testado |
| **3** | View/RPC de saldo calculado por caixa, comparada em paralelo com V1 (mesmo padrão do `Comparator.js` já existente) | 18/18 caixas batendo, 0 divergência por 1 ciclo inteiro completo |
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

## Próximo passo

Este documento é o plano. Meu único quick win que executaria sem esperar mais aprovação, por ser reversível e de risco desprezível, é o **índice em `transacoes`** (item 1 do checklist) — mas mesmo esse só entra depois de você confirmar. Qual fase quer autorizar primeiro?
