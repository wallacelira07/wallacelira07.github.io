# AUDITORIA_IMPACTO_BUG_LRC.md — TRILHA C

**Missão**: "Promoção Operacional Controlada da V2", TRILHA C. Medir o impacto completo do `BUG_CONFIRMADO_V1_LRC_OBSOLETO`. **Nada foi corrigido nesta rodada** — o bug já havia sido corrigido numa sessão anterior (`CORRECAO_BUG_LRC.md`, mesmo dia 06/08/2026); esta auditoria só mede e classifica o impacto histórico, como pedido.

---

## Mecanismo do bug (recapitulando, pra contexto das 7 respostas abaixo)

Dentro de `aplicarCicloAoVARS(cicloKey)`, `VARS.livroLRC` — usado na perna 3 da cascata de reembolso (`reembolsoPagaCartaoCorporativo = livroLRCVisaOnly + livroLRC`) — era calculado **1 única vez, no boot** (`app.js`, fora da função, a partir do ciclo que estava ativo NAQUELE momento), e nunca recalculado depois. Ao selecionar um ciclo **fechado** no seletor, `VARS.LRC_LIMBO_TRANSACOES` já virava corretamente a fotografia congelada daquele ciclo — mas `VARS.livroLRC` continuava sendo a soma do ciclo do boot, não do ciclo selecionado. Corrigido reordenando: `livroLRC` agora é recalculado **depois** que `LRC_LIMBO_TRANSACOES` já reflete o ciclo certo.

---

## 1. Desde quando existe

Desde que o sistema passou a ter **fotografias congeladas de ciclo fechado** com seletor de ciclo na UI (mecanismo introduzido na V174, comentário no código: "V174: Visa/MB/MP e as 4 tabelas de Livros Razão agora respeitam o ciclo selecionado"). O ciclo `2026-06` fechou na virada de 25/07/2026 (25 é o dia de corte do ciclo financeiro — ver `ESTADO_ATUAL`/Políticas). **A partir de 25/07/2026** o bug ficou "armado": qualquer sessão que selecionasse o ciclo fechado no seletor veria o valor errado. Corrigido em 06/08/2026. Janela de exposição: **12 dias corridos** (25/07 a 06/08), mas só se manifestava nas sessões em que alguém de fato selecionou o ciclo `2026-06` no seletor — não há registro de quantas vezes isso aconteceu (não há telemetria de cliques no sistema).

## 2. Quantos ciclos afeta

**Exatamente 1**: o ciclo `2026-06` — é o **único ciclo fechado** que existe no sistema hoje (confirmado em `VARS.CICLO_SNAPSHOTS`: só 2 chaves, `2026-06` com `fechado:true` e `2026-07` com `fechado:false`). O bug só podia se manifestar no branch `snap.fechado===true` — o ciclo atual (`2026-07`) nunca foi afetado, confirmado por simulação na correção original (`CORRECAO_BUG_LRC.md`: "Ciclo atual (2026-07): sem regressão"). Como o fix já está em produção, **nenhum ciclo futuro será afetado quando fechar** — o bug não é recorrente, foi estrutural e já foi eliminado na raiz.

## 3. Qual diferença financeira produz

**R$186,12**, sempre a mesma magnitude, em toda métrica que dependia da perna 3 da cascata — porque todas essas métricas propagam a mesma diferença bruta (`livroLRC` do ciclo 2026-06 real = R$483,43; valor errado exibido = R$297,31 do ciclo 2026-07; diferença R$186,12), sem nenhuma outra fonte de erro composta.

## 4. Impacto na cascata

| Campo (ciclo 2026-06, ao ser selecionado) | Antes (bug) | Depois (correto) | Diferença |
|---|---|---|---|
| Perna 3 — Corporativo (cartão) | R$297,31 | R$483,43 | **+R$186,12** (subestimado antes) |
| Pass-through corporativo total (Wärtsilä + MP corp + cartão corp) | R$2.231,86 | R$2.417,98 | **+R$186,12** |
| Sobra Pessoal | R$2.280,01 | R$2.093,89 | **−R$186,12** (superestimada antes) |

Total do ciclo (`reembolsoCicloTotal` = R$4.914,98) **não foi afetado** — vem direto do snapshot (`reembolsoRecebido`+`reembolsoAReceber`), nunca dependeu de `livroLRC`. O bug só distorcia a **distribuição interna** da cascata, não o total.

## 5. Impacto nos reembolsos

Mesmo impacto da seção 4 (é a mesma cascata — "Reembolsos" e "Cascata" não são domínios separados no sistema, são a mesma estrutura). Nenhum outro campo de reembolso (`reembolsoRecebido`, `reembolsoAReceber`, `recebidosNoCiclo`) foi afetado — todos vêm de literais do snapshot ou de fórmulas que não tocam `livroLRC`.

## 6. Impacto em dashboards

**Sim, em cascata — mas só enquanto o ciclo fechado 2026-06 estava selecionado na tela.** `reembolsoPassThroughCorporativo` (que estava R$186,12 **menor** do que deveria, pelo bug) é subtraído em 3 lugares:

| Campo do Dashboard | Efeito do bug (enquanto ciclo 2026-06 selecionado) |
|---|---|
| `REG.operacional.entradasTotais` | **Superestimado em R$186,12** (subtraía menos pass-through do que devia) |
| `REG.balanco.fluxo.entradas` | Idem (é o mesmo valor, fonte única) |
| `REG.operacional.saldoCiclo` = entradas − necessidadeTotalBruta | Superestimado em R$186,12: **R$21.493,77 (com o bug) vs. R$21.307,65 (correto)** — `necessidadeTotalBruta` vem do snapshot congelado (R$14.898,13), não afetada; só o lado das entradas mudava. (Nota: o campo `saldoCiclo: 6.836,41` que aparece dentro do próprio objeto `CICLO_SNAPSHOTS['2026-06']` é um literal informativo separado, gravado como metadado do snapshot — nunca foi a fonte do valor exibido ao vivo, então não é comparável a este número.) |
| `REG.balanco.fluxo.resultado` = entradas − saídas | Superestimado em R$186,12 (mesma razão) |
| Modo Operacional (badge Crítico/Baixo/Normal/Alto) | **Não mudava de faixa neste caso**: R$21.493,77 (com bug) e R$21.307,65 (correto) caem ambos, com folga, na faixa "Alto" (≥R$8.000) — o badge mostrado nunca esteve errado, só o número por trás dele |

## 7. Impacto em indicadores

**PIB Wallace** (Domínio 6) é o único indicador que consome `reembolsoPassThroughCorporativo`:

| Campo | Efeito |
|---|---|
| `REG.pibWallace.reembolsos` = reembolsoCicloTotal − passThrough | Superestimado em R$186,12 enquanto ciclo 2026-06 selecionado |
| `REG.pibWallace.total` | Idem, mesma magnitude (soma direta do componente acima) |
| `REG.pibWallace.eficienciaFinanceiraPct` | Levemente distorcido (numerador `resultado` e denominador `entradas` mudam pelo mesmo valor absoluto, mas em bases diferentes — o % desloca um pouco, não pelo mesmo fator) |

**Persistência (`PIB_WALLACE_HISTORICO`, Supabase) — NÃO contaminada**: a gravação (`registrar_pib_mensal`) roda a cada carga de página usando `VARS.cicloAtual` (o ciclo que o site abre por padrão), nunca o ciclo que o usuário eventualmente selecionou manualmente no seletor. Como `VARS.cicloAtual` sempre foi `2026-07` (nunca o ciclo fechado), **o histórico persistido nunca recebeu o valor errado** — o bug só afetava a *exibição ao vivo* de quem selecionava manualmente o ciclo 2026-06, nunca o dado gravado.

---

## Classificação final

# 🟡 MODERADO

Justificativa (critérios usados pra não classificar como LATENTE nem CRÍTICO):

- **Não é LATENTE**: o bug se manifestava ativamente e de forma visível toda vez que o ciclo fechado era selecionado — não é um problema adormecido que nunca apareceu na tela.
- **Não é CRÍTICO**: 4 fatores limitam severamente o alcance —
  1. Escopo de **1 único ciclo**, e esse ciclo já está fechado (não vai mudar de novo, não há mais "dano acontecendo").
  2. Magnitude de **R$186,12** — cerca de 0,9% do saldo do ciclo fechado (R$21.307,65, valor correto), pequeno o suficiente pra não mudar nenhuma decisão binária (Modo Operacional não mudou de faixa, por exemplo, ver seção 6).
  3. **Nenhum dado persistido foi contaminado** (Supabase `PIB_WALLACE_HISTORICO`, snapshots) — o erro só existia na tela, nunca gravado.
  4. Já **corrigido e validado** (simulação Node com dados reais dos 2 ciclos, confirmando o antes/depois exato) antes mesmo desta auditoria começar.

## O que fica de pendência real (não é sobre o bug em si, é sobre o processo)

- Não existe telemetria de qual ciclo estava selecionado quando, então não é possível saber **quantas vezes** o valor errado foi de fato visto na tela durante os 12 dias de exposição — só que era *possível* vê-lo.
- Duas variáveis com a **mesma classe de risco teórica** (falta de cycle-scoping) foram citadas mas **não corrigidas** na correção original, por estarem fora do escopo aprovado naquele momento: `VARS.livroLRCVisaOnly` (hoje sempre 0, sem divergência observável) e `VARS.livroLRCQtdLancamentos` (contador só usado em texto). Ficam registradas aqui de novo, como **candidatas a auditoria futura, não como bug confirmado** — nenhuma das duas produziu diferença observável até hoje.
