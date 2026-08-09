# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, encerramento formal da **fase de migrações rápidas** V1→V2. HEAD `1aed7c6`, tudo commitado e enviado — `git status` limpo.

## Métrica final da fase de migrações rápidas

| Grupo | Quantidade |
|---|---|
| Já removidos/religados à V2 | **~61** domínios/achados (37 no início da sessão de aceleração + ~24 nesta fase) |
| Exceções formais (fora da métrica, ver classificação D abaixo) | 5 |
| Restantes classificados (A+B+C abaixo) | ~10-12 |

A fase de migrações rápidas está **encerrada por decisão do usuário** nesta sessão: a última auditoria sistemática do padrão que mais rendeu (ver seção seguinte) encontrou só 2 achados novos, contra 6 na rodada anterior — sinal de esgotamento real, não só de sorte. A próxima fase (ainda não iniciada) foca nos bloqueadores reais remanescentes, um a um, sem mais "varredura ampla".

## Classificação final dos remanescentes

**A) Bloqueado por decisão humana** (decisão explícita do usuário de não avançar, mas não formalizada como exceção permanente — pode ser reaberta se o usuário pedir):
- `PLUGGY_TRIAGEM` — decisão persistente da Inbox (3 registros), granularidade mista (ids sintéticos por conta e por transação), baixo impacto. Deixado fora por decisão explícita do usuário nesta sessão.
- LRW/LRV/LRC-limbo/LRCV item-a-item — bloqueado por gap de dado (nível de confiança D), não reabrir sem pedido novo.

**B) Bloqueado por cadastro** (dado que só o usuário pode fornecer — puramente operacional, sem decisão de negócio):
- `CARTAO_PLUGGY_MAPA` — esperando o usuário passar os finais de cartão do Itaú. Assim que vier o dado, é uma migração trivial (classe A, infraestrutura já existente).

**C) Bloqueado por modelagem** (exigiria estrutura V2 nova; hoje são RPCs que gravam de volta dentro do próprio `wallace_dados` via `jsonb_set`, nunca criaram tabela relacional real; ROI baixo demais pra justificar o esforço agora):
- `PIB_WALLACE_HISTORICO`
- `PADROES_RUIDO_TRANSACAO`
- `DEFICIT_ZERO_PISO_OVERRIDE`
- `ENERGISA_TARIFA_COMPOSICAO`
- `reservaRetiradaProgramada` / `aporteBTGProgramado` — baixo impacto, já majoritariamente derivado
- `dataNascimentoWallace` — constante permanente, ROI~0, não vale modelar

**D) Exceção formal** (ver `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` para o detalhe completo — permanentes, **não reabrir por iniciativa de agente**, fora da métrica de "restantes" desde 08/08/2026):
1. Headline totals Mastercard Black/Visa/Mercado Pago (`cartaoMBTotal`, `cartaoInfiniteTotal`, `mercadoPagoFatura`) — regra de negócio "fatura sempre vence"
2. Solar 301×361 kWh — fórmula de rateio sem prova externa
3. Caixa Lance — divergência de R$4,37 não confirmada
4. 4 caixas de causa indeterminada (Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário Júlio) — divergência R$107-346, V2 desatualizado (não recebeu lançamentos/rendimento que só entraram no V1)
5. TX000203-208 — colisão de `tx_legado` entre eventos distintos

## Padrões descobertos nesta fase (reaplicáveis em qualquer sessão futura)

**1. "Card migrado para V2, exibição secundária esquecida em V1"** — de longe o padrão mais produtivo desta fase (~8 achados reais: Boletos, 4 caixas de Reservas, 5 duplicatas de Patrimônio, Caixa Variável, barras de meta de Escola/Bens Duráveis/Eventos/Seguro, LREI em 2 variantes, e nesta última rodada Caixa Wärtsilä + totais de Patrimônio no Resumo Executivo). **Causa raiz sempre a mesma**: `hydrate()` roda dezenas de funções de renderização de forma SÍNCRONA no boot, na ordem em que aparecem no HTML; os módulos `hydrate-onda*.js` (assíncronos, resolvidos bem depois) atualizam `VARS`/`REG` mas só re-chamam a função de renderização do card "principal" — qualquer OUTRA função que já tinha lido o mesmo campo mais cedo (Resumo Executivo, barra de meta, linha do Balanço, badge) fica com o valor V1 congelado pra sempre, mesmo depois do dado em `REG` já estar certo. **Correção sempre igual**: re-chamar (não reescrever) a(s) função(ões) de renderização afetada(s) no final do módulo `onda*`, depois de `REG`/`VARS` já atualizados — são idempotentes por leitura pura de estado, seguro re-chamar.
   - Achado nesta última rodada: às vezes o próprio campo derivado (`REG.patrimonio.total`, `REG.qualidade.lreiAtivos`) nunca era resincronizado, só os campos "de entrada" — nesse caso a re-chamada de função sozinha não resolve, é preciso também atualizar o campo derivado ANTES de re-chamar a renderização.
   - **Cuidado ao implementar o fix**: se uma auditoria de divergência V1×V2 já existia no fim da função (log `console.warn` comparando V1 antigo × V2 novo), capturar o valor V1 ORIGINAL antes de sobrescrever o campo em `REG` — inverter a ordem faz a auditoria comparar o valor contra ele mesmo (bug real cometido e corrigido na própria sessão, ver Patrimônio/Wärtsilä nesta rodada).

**2. Bug estrutural do cache do `WallaceFinanceService`** (Bloco 27, sessão anterior a esta) — 5 métodos (`getPatrimonioV2`, `getCicloSolarAbertoV2`, `getIndicador`, `getReembolsoWartsilaCicloV2`, `getP2PV2`) cacheavam o ARRAY bruto da resposta mas retornavam o item desembrulhado (`dado[0]`); a partir do 2º cache-hit o método passava a devolver o array inteiro em vez do objeto esperado, produzindo `NaN`/`undefined` em cascata (P2P, Wärtsilä, Patrimônio, Investimentos, frescor solar) — sintomas que pareciam desconectados até a causa raiz única ser encontrada. **Lição**: em qualquer método com cache manual, sempre cachear exatamente o mesmo valor que é retornado, nunca uma forma intermediária.

**3. Padrão de pré-carregamento** (`Promise.all` no topo de `Sistema_Wallace_Lira_Completo.html`, antes de `app.js` existir) — usado pra religar Ciclo Snapshots (15 consumidores, o maior domínio da sessão) sem reescrever nenhuma cadeia de cálculo síncrona (`aplicarCicloAoVARS`/`recalcularNecessidade`/`auditoria-automatica.js`/`CycleEngine.js`). **Não presumir que "leitura síncrona no boot" é sempre um bloqueador técnico real** sem checar esse mecanismo primeiro — uma primeira avaliação errada já classificou Ciclo Snapshots como bloqueador antes de este padrão ser aplicado.

**4. Critério que permitiu remover dezenas de consumidores sem modelagem nova**: "o dado já existe em V2 — outro módulo já buscou essa mesma view/tabela — só falta ligar o ID de DOM que ficou de fora". Zero fetch novo, zero tabela nova, só reaproveitar o `valorV2` já resolvido em memória. Esse critério sozinho (classe A) respondeu pela maior parte dos ~61 achados; migrações reais com tabela nova (classe B, mais lentas e arriscadas) foram só 4: Mercado Pago, Pluggy, Cronograma de Boletos, e a armazenagem do Ciclo Snapshots.

## Protocolo de sessão nova

1. Este arquivo.
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente.
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir.
4. `docs/MANUAL_OPERACIONAL_AGENTES.md` — documento mestre, seção 0 (Nível de Confiança) e seção 11 (Governança) são leitura obrigatória.
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
6. **Próxima fase**: não é mais "varredura ampla por padrão conhecido" — é bloqueador a bloqueador, seguindo a classificação A/B/C/D acima. Comece perguntando ao usuário se ele tem os finais de cartão do Itaú (item B, único puramente operacional).
7. Pendente do usuário (fora do alcance de qualquer agente): criar Project "Sistema Wallace Lira" em `wallace.termica@gmail.com`, anexar `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` como Project Knowledge — sem isso, um chat novo no Claude Chat não recebe o documento automaticamente (ver `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` seção 10).
