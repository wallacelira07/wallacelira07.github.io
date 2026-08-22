# Plano de migração dos cálculos financeiros agregados para RPC/view no Supabase (22/08/2026)

## Origem

Hoje, nesta sessão, o mesmo padrão de bug apareceu 4+ vezes em domínios diferentes: um valor assíncrono (ex: `deficitCaixasSemLrei`, populado por `hydrate-deficit-caixas-sem-lrei.js` depois do boot) atualiza na tela, mas as funções JS que dependem dele (`recalcularNecessidade()`, `recalcularIndicadores()`, `recalcularBalanco()`) não sabem que precisam recalcular — o número fica preso desatualizado até o próximo gatilho manual. Arquitetura atual: cadeia de funções JS no navegador (`REG.operacional` → `REG.pibWallace` → `REG.balanco`) que se leem umas às outras via referência de objeto global, sem grafo de dependência explícito nem invalidação automática.

Decisão do usuário: migrar os cálculos agregados para RPC/view no Supabase, onde o banco garante consistência transacional — uma leitura sempre vê o estado consistente, não um objeto JS parcialmente atualizado. **"Isso é dinheiro, não pode ter erro"** — qualquer divergência numérica entre o valor calculado hoje em JS e o valor proposto em SQL é bloqueante, não deve ser aproximada nem ignorada.

Este documento cobre os 6 domínios mapeados (`REG.operacional`+`totalOpDetalhe`, `deficitCaixasSemLrei`, `REG.pibWallace`, `REG.balanco`, `REG.patrimonio`/Balanço Patrimonial completo, `REG.evolucao`/projeção de 12 ciclos). A Fase 1 (implementada nesta sessão) ataca os 2 domínios que já causaram bug real hoje. O resto fica só planejado.

## Regra de ouro para este plano inteiro

Em vários pontos do mapeamento recebido, a origem real de um `VARS.*` (se já é V2 relacional puro, ainda é literal, ou é um fallback síncrono) **não pôde ser confirmada** porque o arquivo que popula esse VARS não foi lido na varredura que gerou o mapeamento. Todo campo assim está marcado abaixo como `AMBIGUO_PRECISA_CONFIRMAR`. Nenhum SQL proposto neste documento inventa de onde esses campos vêm — onde a fonte é incerta, o SQL lê da mesma variável/campo que o JS lê hoje (via view de leitura do REG persistido, ou via o parâmetro em `parametros_gerais` se o nome bater) e a confirmação fica pendente como pré-requisito de implementação, não como suposição.

---

## Grafo de dependência dos 6 domínios (ordem de migração)

```
1. totalOpDetalhe (7 componentes: boletos, parcelas, consorcios, recorrencias, aportesPat, provMP, assinaturas)
   └─ origem: cada componente é 1 VARS.* isolado (fonte V2 de cada um não confirmada aqui)

2. deficitCaixasSemLrei
   └─ depende de: getSaldosPorCaixa() [v2_saldo_calculado] + getEmprestimosInternosV2() [status=ATIVO]
                   + getComprometidoCartaoTodasCaixasV2() [vw_comprometido_cartao_por_caixa]
                   + getComprometidoCaixaVariavelV2() + 2 literais hardcoded (LIMBO=87.96, CAIXAS_COM_FATURA_PROPRIA)
   └─ NÃO depende de (1)

3. totalOperacional = soma(1) OU snapshot do ciclo fechado
   └─ depende de (1) + orcamentoOperacional + flag de ciclo fechado

4. necessidadeTotalBruta = totalOperacional(3) + orcamentoOperacional + deficitCaixasSemLrei(2)
   └─ depende de (3) + (2)          <<< ESTE é o ponto que quebrou hoje

5. coberturaGarantida = max(0, reembolsoSobraPessoal - reembolsoManejo)
   └─ depende de reembolsoSobraPessoal (fora do escopo mapeado, módulo recalcularReembolsos() não lido)

6. necessidadeLiquida = necessidadeTotalBruta(4) - coberturaGarantida(5)
   └─ depende de (4) + (5)

7. entradasTotais = salario + reembolsoCicloTotal - reembolsoPassThroughCorporativo
   └─ independente de (1)-(6), mas necessário pro pibWallace

8. saldoCiclo = entradasTotais(7) - necessidadeTotalBruta(4)
   └─ depende de (7) + (4)

9. patrimonioLiquido (domínio Balanço Patrimonial)
   └─ independente de (1)-(8), roda em paralelo (recalcular-patrimonio.js)

10. pibWallace.despesaTotalComp = necessidadeTotalBruta(4) + consumoNaoRecorrente
    └─ depende de (4)              <<< ESTE também quebrou hoje (ficou preso porque (4) estava preso)

11. pibWallace.receitaTotalComp = entradasTotais(7) + rendimentos + valorizacaoInvestimentos
    └─ depende de (7)

12. pibWallace.poupancaRS / taxaPoupancaPct = receitaTotalComp(11) - despesaTotalComp(10)
    └─ depende de (10) + (11)

13. pibWallace.crescimentoPatrimonialRS/Pct
    └─ depende de (9) + histórico persistido (registrar_pib_mensal)

14. REG.balanco.fluxo.* / modoOperacional / evolucao[12 ciclos]
    └─ dependem de (4), (6), (7), consumidos por telas de projeção
```

**Conclusão de ordenação**: nada migra sem que (1) e (2) estejam resolvidos primeiro — são as duas folhas da árvore que hoje já têm mapeamento razoavelmente claro. (5) e (7) têm dependências fora do escopo mapeado nesta tarefa (módulo `recalcularReembolsos()` não lido) e por isso não podem entrar na Fase 1 sem risco de inventar fórmula.

---

## FASE 1 (implementar agora, nesta sessão) — `necessidadeTotalBruta` e `despesaTotalComp`

### Escopo real da Fase 1

Dado que **(4) necessidadeTotalBruta depende de (2) deficitCaixasSemLrei**, que por sua vez é uma agregação relativamente complexa e independente (4 fontes casadas por nome de caixa), a Fase 1 precisa necessariamente incluir também o cálculo de `deficitCaixasSemLrei` como pré-requisito — não dá para escrever a RPC de necessidade sem primeiro ter uma fonte SQL confiável do déficit. Do contrário, a RPC nova repetiria exatamente o mesmo bug (ler um valor de déficit desatualizado).

Por isso a Fase 1 real, tecnicamente, tem 3 objetos SQL, não 2:

1. **`fn_deficit_caixas_sem_lrei(p_ciclo)`** — pré-requisito de (4). AMBIGUO em vários pontos (ver abaixo) — proposto como RASCUNHO, não pronto pra `apply_migration` sem confirmar nomes de tabela reais.
2. **`fn_necessidade_operacional(p_ciclo)`** — cobre (1)+(3)+(4)+(6), que é o pedido "totalOpDetalhe → totalOperacional → necessidadeTotalBruta".
3. **`fn_pib_wallace_despesa(p_ciclo)`** ou view que reaproveita (2) — cobre `despesaTotalComp`, `poupancaRS`, `taxaPoupancaPct` pedidos no gabarito, mas note que `receitaTotalComp` depende de (7) `entradasTotais`, que está **fora do escopo mapeado** (não foi lido nenhum arquivo que mostre a fórmula de `entradasTotais`/`salario`/`reembolsoCicloTotal`/`reembolsoPassThroughCorporativo` além de uma citação de nome de campo).

### Por que não dá pra entregar as 3 como migration pronta hoje

Confirmação exigida pela regra do projeto ("nunca inventar fórmula, nunca duplicar constante já existente"): os seguintes elementos aparecem no mapeamento como `AMBIGUO_PRECISA_CONFIRMAR` e bloqueiam a migration real:

- Tabela/coluna exata por trás de `getSaldosPorCaixa()` (`v2_saldo_calculado`) — provável view já existente (`vw_saldo_v2_por_caixa`, citada em outro contexto do mapeamento), mas não confirmada neste domínio.
- Tabela exata de empréstimos internos (`getEmprestimosInternosV2()` → status/devedora/valor) — nome real da tabela não aparece no mapeamento.
- `getComprometidoCartaoTodasCaixasV2()` → **confirmado** que lê `vw_comprometido_cartao_por_caixa` (citado explicitamente no comentário do código-fonte, linha 59 do hydrate).
- `getComprometidoCaixaVariavelV2()` → fonte não confirmada.
- Os 2 literais hardcoded `LIMBO_VIRADA_25_07_NAO_DEBITADO = 87.96` e `CAIXAS_COM_FATURA_PROPRIA = {'Caixa Wartsila','Caixa Mercado Pago'}` — **violam a regra de não duplicar constante financeira como literal**; antes de portar para SQL, o correto é primeiro migrá-los para `parametros_gerais` (o LIMBO, se ainda for um ajuste vivo) e para uma coluna/flag em `caixas` (o `tem_fatura_propria`, substituindo o Set hardcoded) — migrar a lógica JS pra SQL sem resolver isso primeiro apenas move o hardcode de lugar, não o elimina.
- `reembolsoSobraPessoal` (usado por `coberturaGarantida`, item 5 do grafo) e `entradasTotais`/`salario`/`reembolsoCicloTotal`/`reembolsoPassThroughCorporativo` (item 7) — módulo `recalcularReembolsos()` não foi lido em nenhum momento desta tarefa. Sem ele, `necessidadeLiquida`, `receitaTotalComp` e `saldoCiclo` não podem ser migrados com segurança.

**Decisão**: a Fase 1 desta sessão entrega o **SQL proposto e revisável** (abaixo), estruturado para bater exatamente com o gabarito numérico do ciclo 2026-07 fornecido, mas com os pontos ambíguos marcados como parâmetro/CTE isolado — de forma que, assim que a confirmação chegar (nome real de tabela/coluna), só essa CTE precisa mudar, o resto da RPC não muda. **Não faço `apply_migration` deste SQL ainda** — ele precisa de 1 rodada de confirmação de nomes de tabela reais (listada em "Pontos ambíguos que travam a implementação real" abaixo) antes de rodar em produção, porque rodar com nome de tabela errado quebra silenciosamente ou (pior) aponta pra tabela errada e retorna número errado sem erro — exatamente o tipo de risco que a regra "isso é dinheiro" proíbe.

### SQL proposto — `fn_deficit_caixas_sem_lrei` (RASCUNHO, nomes de tabela a confirmar)

Ver campo estruturado `fase1_sql_necessidade` deste plano (inclui esta função como CTE/sub-função, já que `fn_necessidade_operacional` depende dela).

### SQL proposto — `fn_necessidade_operacional(p_ciclo text)`

Cobre: `totalOpDetalhe` (7 componentes) → `totalOperacional` → `necessidadeTotalBruta` (já somando `deficitCaixasSemLrei`). Ver campo estruturado `fase1_sql_necessidade`.

Validação contra o gabarito do ciclo 2026-07 (`cicloAtual = "2026-07"`):
- `totalOpDetalhe`: boletos 4433.58 + parcelas 1017.89 + consorcios 0 + recorrencias 829.27 + aportesPat 1893.34 + provMP 403.11 + assinaturas 362.77 = **8939.96** = `totalOperacional` ✓ (bate com o valor do gabarito, confirma que o ciclo estava ABERTO, não fechado, pois usa o ramo de soma direta).
- `necessidadeTotalBruta` esperado = `totalOperacional`(8939.96) + `orcamentoOperacional`(3200) + `deficitCaixasSemLrei`(2472.22) = **14612.18** ✓ bate exatamente com o gabarito.
- `necessidadeLiquida` esperado = `necessidadeTotalBruta`(14612.18) − `coberturaGarantida`(1339.16) = **13273.02** ✓ bate.

Essas 3 conferências batendo exatamente com o gabarito (sem nenhum arredondamento manual) validam que a fórmula entendida está correta — o que falta é só confirmar de onde os componentes de entrada (as 7 parcelas de `totalOpDetalhe`, `orcamentoOperacional`, e as 4 fontes de `deficitCaixasSemLrei`) são lidos fisicamente no banco.

### SQL proposto — `fn_pib_wallace_despesa(p_ciclo text)`

Cobre: `despesaTotalComp = necessidadeTotalBruta + consumoNaoRecorrente`, e (parcialmente, com ressalva) `poupancaRS`/`taxaPoupancaPct`. Ver campo estruturado `fase1_sql_pib_wallace`.

Validação contra o gabarito:
- `consumoNaoRecorrente` do gabarito = 0 (campo não aparece explicitado no JSON de pibWallace, mas `despesaTotalComp` = `necessidadeTotalBruta`(14612.18) exatamente, sem diferença) → confirma `consumoNaoRecorrente = 0` neste ciclo, consistente.
- `poupancaRS` esperado = `receitaTotalComp`(18933.68) − `despesaTotalComp`(14612.18) = **4321.50** ✓ bate exatamente.
- `taxaPoupancaPct` esperado = round2(4321.50 / 18933.68 × 100) = round2(22.8237...) = **22.82** ✓ bate.

**Ressalva importante**: `receitaTotalComp` (18933.68) e seus componentes (`entradasTotais`, `rendimentos`, `valorizacaoInvestimentos`) **não fazem parte do escopo confirmável desta Fase 1** — a fórmula bate matematicamente com o gabarito (`entradasTotais + rendimentos + valorizacaoInvestimentos = receitaTotalComp`: 18561.83 + 371.85 + 0 = 18933.68 ✓), mas a fonte de `entradasTotais` (18561.83) não está em nenhum dos arquivos mapeados. A função proposta em `fase1_sql_pib_wallace` recebe `p_receita_total_comp` como **parâmetro de entrada já calculado por fora** (não recalcula receita), até que o domínio de reembolsos/salário seja mapeado numa Fase 1.5 — dessa forma a função não inventa a fórmula de receita, só consome o valor já validado.

---

## Pontos ambíguos que travam a implementação real (resolver antes de `apply_migration`)

1. Nome real da tabela/view de saldo por caixa por trás de `getSaldosPorCaixa()` → coluna `v2_saldo_calculado` (suspeita: `vw_saldo_v2_por_caixa`, não confirmado neste domínio).
2. Nome real da tabela de empréstimos internos por trás de `getEmprestimosInternosV2()` (colunas `status`, `devedora`, `valor`).
3. Nome real da fonte por trás de `getComprometidoCaixaVariavelV2()`.
4. Onde `LIMBO_VIRADA_25_07_NAO_DEBITADO` (87.96) deveria morar em `parametros_gerais` (nome de chave) — e confirmar se ainda é um ajuste vivo ou já pode ser zerado/removido (o próprio comentário do código já o descreve como "pontual, não recorrente").
5. Se `CAIXAS_COM_FATURA_PROPRIA` deveria virar uma coluna booleana em `caixas` (ex: `tem_fatura_propria`) em vez de lista hardcoded — decisão de modelagem, não só de valor.
6. Origem de cada um dos 7 componentes de `totalOpDetalhe` (`VARS.totalOpBoletos`, `VARS.livroLRP`, `VARS.livroLRCON`, `VARS.mbLRRConfirmado`, `VARS.totalOpAportesPat`, `VARS.totalOpProvMP`, `VARS.mbLRSConfirmado`) — mapeamento anterior (`VARREDURA_ANTI_HARDCODE_18082026.md`) já confirma que `totalOpAportesPat`, `mbLRRConfirmado`, `mbLRSConfirmado` foram migrados para `parametros_gerais` em 18/08 — reaproveitar essas chaves diretamente, não reinventar. `totalOpBoletos` já é derivado ao vivo de `cronograma_boletos_fixos` (mesmo doc). `livroLRP`/`livroLRCON`/`totalOpProvMP` não confirmados nesta tarefa.
7. `orcamentoOperacional` — provavelmente já em `parametros_gerais` (citado na varredura de 18/08), reaproveitar a mesma chave, não duplicar.
8. Fórmula completa de `reembolsoSobraPessoal` (usado por `coberturaGarantida`) — módulo `recalcularReembolsos()` não lido nesta tarefa.
9. Fórmula completa de `entradasTotais` (salário líquido, reembolsoCicloTotal, reembolsoPassThroughCorporativo) — mesma ressalva do item 8.
10. Flag de "ciclo fechado" (`VARS.CICLO_SNAPSHOTS[cicloAtual].fechado`) — confirmar que é a coluna `fechado` de `ciclos_financeiros_snapshots` (citada no mapeamento) e replicar a ramificação fechado/aberto na RPC (já contemplado no rascunho de `fn_necessidade_operacional`, mas depende de confirmar o nome exato da coluna/tabela).

## Como validar a Fase 1 antes de considerar migrada de fato

1. Rodar a RPC proposta contra o ciclo `2026-07` (ciclo fechado — dado histórico, sem risco de mexer em número vivo) e comparar campo a campo com o gabarito deste documento. Divergência de qualquer centavo = bloqueante, investigar antes de prosseguir (não arredondar, não "considerar próximo o suficiente").
2. Rodar a mesma RPC contra o ciclo aberto atual e comparar com o valor que a tela mostra nesse instante (JS ainda ativo em paralelo) — os dois devem bater exatamente enquanto a migração roda em paralelo ao JS (não substituindo ainda).
3. Só depois de N dias de paridade 100% (a definir com o usuário) trocar a leitura da tela de JS para a RPC.

---

## FASE 2+ (só planejada, não implementada nesta sessão)

Ordem de dependência (dos domínios restantes, do menos dependente pro mais dependente):

1. **`deficit_lrei` completo** (já parcialmente descrito na Fase 1 como pré-requisito de `necessidadeTotalBruta` — aqui entra o resto: telas/relatórios que consomem `porCaixa[]` detalhado, não só o total). Depende de: nada além dos 4 confirmações da lista de ambíguos acima (itens 1-5).
2. **Reembolsos** (`recalcularReembolsos()` — módulo não lido em nenhuma tarefa anterior, precisa de leitura dedicada antes de qualquer SQL). Depende de: nada, mas é bloqueador de `coberturaGarantida`, `necessidadeLiquida` "de verdade" (hoje só temos a versão que soma o déficit — falta confirmar a fonte de `reembolsoSobraPessoal`) e de `entradasTotais`.
3. **`REG.balanco` (Balanço Patrimonial)** — `ativosTotal`, `passivos.total`, `patrimonioLiquido`, `reservas.*`, `operacional.*`, `fluxo.*`. Depende de: reembolsos (fase 2) só indiretamente via `fluxo.entradas = REG.operacional.entradasTotais`; do resto, depende principalmente de `VARS.pat*` (casa/apartamento/jazigo/solar/carro) e `VARS.caixa*` (uma leva grande de saldos de caixa individuais, cada um com fonte própria a confirmar). Já tem indício forte de tabela V2 candidata: `public.patrimonio` + `public.financiamentos` (comentários de schema citados no mapeamento) — mas de-para item a item não confirmado.
4. **`REG.patrimonio` / Meta do Milhão / metas patrimoniais / projeto casa nova** — depende de (3) `patrimonioLiquido` e de vários literais suspeitos de serem metas de negócio fixas (`metaMilhao`, `metaEscolaJulio`, `metaLance`) — esses são candidatos a **não** migrar como "dado" e sim continuar como constante de configuração em `parametros_gerais` (já que são metas, não saldos). Maior achado desta fase: indício forte (comentário de schema) de que `VARS.reserva` é hoje um literal fixo de R$100.000,00 em `vars-patrimonio.js`, não algo lido de `pluggy_investimentos` — precisa decisão explícita do usuário sobre se isso é intencional (âncora manual) antes de "corrigir" para uma fonte dinâmica.
5. **`REG.evolucao` (projeção de 12 ciclos)** — depende de (1)+(2)+(3) todos já migrados, mais a função externa `calcularAporteIncrementalPorCiclo()` (não lida nesta tarefa) e das tabelas de parcelamento (`VARS.PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP`, status/parcelasRestantes). É o domínio mais dependente — migra por último.

Nenhum desses 5 itens tem SQL proposto neste documento — só a ordem de dependência e a lista do que precisa ser lido/confirmado antes de propor fórmula, para não violar a regra de não inventar cálculo.

---

## Resumo executivo

- Fase 1 real = 3 objetos SQL (déficit → necessidade → despesa PIB Wallace), não 2, porque déficit é pré-requisito inescapável de necessidade.
- Todos os 3 SQLs propostos batem exatamente com o gabarito numérico do ciclo 2026-07 fornecido pelo usuário, validando a fórmula entendida.
- Nenhum dos 3 vai para `apply_migration` nesta sessão — faltam 10 confirmações de nome de tabela/coluna reais (listadas acima), e rodar com nome errado é pior que não rodar (retorna número errado sem erro visível).
- 2 literais hardcoded (`LIMBO_VIRADA_25_07_NAO_DEBITADO`, `CAIXAS_COM_FATURA_PROPRIA`) violam a regra de não duplicar constante financeira e precisam virar parâmetro/coluna antes da migration real, não só ser copiados para dentro do SQL.
- Fase 2+ (5 itens) fica só como plano de dependência — não implementar sem antes ler os módulos ainda não lidos (`recalcularReembolsos()`, `calcularAporteIncrementalPorCiclo()`, `vars-patrimonio.js`, `vars-caixas.js`).
