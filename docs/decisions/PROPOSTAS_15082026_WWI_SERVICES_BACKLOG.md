# Propostas 15/08/2026 — priorização por impacto no negócio (pedido explícito do usuário)

Usuário pediu priorização das pendências restantes da auditoria de 43 especialistas por impacto no negócio, com 5 decisões explícitas. Este documento cobre os itens que exigem proposta/aprovação antes de agir (1, 2, 5) e o relatório do item 4. O item 3 (lint `hydrate-*`) só precisava de registro em backlog — feito em `ESTADO_ATUAL.md` seção 1.2d.

---

## 1. Reprocessamento do histórico do WWI — PROPOSTA (aguardando aprovação)

### Situação real, investigada antes de propor qualquer coisa

Antes de desenhar uma "estratégia de reprocessamento em massa", chequei quanto histórico real existe pra reprocessar. Resposta: **muito pouco — o sistema é novo.**

| Fonte | Competências/pontos existentes |
|---|---|
| `historico_relatorios` (WWI) | **1** — `2026-07` (já reprocessado na sessão anterior, score 53→58) |
| `reembolso_wartsila_ciclo` | **1** — `2026-07` |
| `pib_wallace_historico` | **2** — `2026-06` e `2026-07` |
| `patrimonio` (breakdown completo por `data_snapshot`) | **1** snapshot completo (`2026-08-05`, 10 linhas) + 1 parcial incompleto (`2026-07-31`, só 2 linhas) |

**Achado importante que muda a estratégia**: os 2 registros de `pib_wallace_historico` (jun/jul) foram **ambos gravados no mesmo dia** (`registradoEm`: 09/08/2026, com ~3h de diferença um do outro) — ou seja, não são capturas mensais ao vivo, foram backfilled retroativamente na mesma sessão. E o `patrimonioLiquido` das duas é **idêntico** (R$469.472,20) — sinal de que quem fez o backfill usou o mesmo valor corrente pros dois meses, porque não havia como reconstruir o patrimônio real de junho separado do de julho (a tabela `patrimonio`, que tem o *breakdown* por ativo/passivo necessário pros sub-scores do Wealth Score, só começa a ter dado real em `2026-07-31`, e incompleto).

### Por que não dá pra "construir uma base histórica" reprocessando pra trás

Reconstituir um Wealth Score de junho, maio, etc. exigiria **inventar** `ativosTotal`/`passivosTotal`/`patrimonioFinanceiro` separados pra cada mês passado — dado que não existe e não pode ser reconstruído com precisão a partir do que sobrou (só o patrimônio líquido total de 2 meses, sem o breakdown). Isso violaria a regra já estabelecida neste projeto (documentada em vários pontos do código: "nunca fabricar dado que não existe", mesmo princípio que impediu preencher os 2 dias de gap em `energia_solar_geracao_diaria` há alguns dias). Um Wealth Score de meses passados calculado com número estimado teria a aparência de fato histórico real, mas não seria — e um comparativo trimestral/anual construído em cima disso ficaria estruturalmente enganoso.

### Estratégia recomendada (Opção A)

**Não fabricar histórico retroativo.** A base histórica do WWI nasce em julho/2026 (1 competência real e correta) e **cresce organicamente daqui pra frente**, 1 linha nova por virada de ciclo (dia 25), pelo job `wwi_gerar_relatorio_mensal.py`. Em vez de "reprocessar o passado", o investimento de maior impacto real é **garantir que essa série cresça sem falhas** — porque é aí que mora o risco real: se o job de 25/08 falhar silenciosamente ou gravar dado incompleto, a série fica com buraco desde o 2º mês.

Ações concretas propostas (baixo risco, sem tocar dado financeiro):
1. **Confirmar que o agendamento externo (cron-job.org) pro dia 25 está configurado e ativo** — só o usuário tem acesso a essa conta externa, não consigo verificar sozinho.
2. **Adicionar um campo `metodologia_versao`** em `dados_json` (ex: `"v2-15082026"`) toda vez que o motor de cálculo mudar — assim, qualquer comparativo futuro sabe automaticamente quando está comparando metodologias diferentes, sem depender de alguém lembrar a data de cabeça. Baixo risco, aditivo.
3. **Job de agosto**: quando a virada de ciclo acontecer (25/08), validar que a linha nova é gravada corretamente na primeira tentativa (posso monitorar/conferir se o usuário topar).

### Impacto esperado
Nenhum reprocessamento retroativo além do que já foi feito (2026-07, já concluído). Ganho real: série histórica confiável **a partir de agora**, sem risco de o usuário achar que está vendo uma tendência de 6 meses quando na verdade são 2 pontos, um deles fabricado.

### Riscos
- **De fazer o backfill mesmo assim**: dado fabricado apresentado como histórico real — pode distorcer qualquer decisão futura baseada em "tendência" que não existiu de verdade.
- **De não fazer nada**: nenhum, a série já está correta pra o único ponto que existe.

### Tempo estimado
Ações 1-2 acima: minutos (item 2 é código, item 1 depende do usuário verificar a conta externa).

### Plano de rollback
Não aplicável — não há mudança destrutiva proposta. `metodologia_versao` é aditivo (não quebra leitura de registros antigos sem o campo).

**Peço sua decisão**: aprova a Opção A (não fabricar histórico, só reforçar a automação futura)? Ou prefere uma Opção B específica (ex: aceitar um Wealth Score de junho **explicitamente marcado como estimado/incompleto**, com os sub-scores que dependem de breakdown patrimonial ficando `null` — mesma lógica de "nunca trata ausência como zero" que o motor já usa)? Não vou fazer nenhuma das duas sem confirmação sua.

---

## 2. `src/services/*.js` — situação atual, vantagens/desvantagens, recomendação (sem alteração de código)

### Situação atual
3 arquivos, 847 linhas no total: `FinanceEngine.js` (688 linhas, funções puras de cálculo financeiro), `Comparator.js` (56 linhas, compara resultado antigo × novo), `CycleEngine.js` (103 linhas, resolve ciclo financeiro). Nasceram de uma tentativa de migração ("Fase 5 da Arquitetura V2") pra extrair a lógica de cálculo do `app.js` pra funções puras, testáveis fora do navegador.

**Zero consumidor em produção** — confirmado por grep: nenhum HTML, nenhum módulo `hydrate-*`, nenhum outro arquivo de `src/` importa essas 3 funções. Os únicos arquivos que os usam são os próprios testes (`tests/unit/FinanceEngine.test.js`, `Comparator.test.js`, `CycleEngine.test.js`) — que **passam** (revisão estrutural feita nesta sessão, ver `docs/decisions/AUDITORIA_MULTIDISCIPLINAR_15082026.md`) e provam matematicamente, contra números reais já auditados, que essas funções reproduzem exatamente o comportamento do `app.js` atual.

O motor de cálculo que roda de verdade hoje é `WallaceFinanceService` — um objeto de ~2900 linhas dentro de `app.js`, misturando cliente HTTP, cache e lógica de negócio no mesmo arquivo que também cuida de boot/DOM. Isso já foi identificado como achado ALTA da auditoria (item "app.js: monólito sem separação de responsabilidades").

Diferente dos 8 arquivos de `src/services/` removidos numa sessão anterior (achados 100% mortos, zero consumidor incluindo teste), estes 3 sobreviveram exatamente porque têm cobertura de teste real — não é código esquecido, é código pronto e testado que nunca foi *ligado*.

### Vantagens de convergir (migrar `app.js` pra usar `FinanceEngine.js`)
- Lógica financeira testável de verdade em CI, sem precisar de navegador/login (hoje, qualquer validação de cálculo depende de login manual, que nem sempre é possível neste ambiente).
- Separação de responsabilidade: cálculo puro isolado de rede/DOM, mais fácil de auditar e de dar manutenção sem medo de efeito colateral.
- O trabalho pesado (extrair e provar equivalência) **já foi feito** — os testes já prometem que `FinanceEngine.js` reproduz o `app.js` de hoje.

### Desvantagens
- `app.js` (2876 linhas) depende de globais vivos (`VARS`/`REG`) e efeitos colaterais de DOM que `FinanceEngine.js` (funções puras) não foi desenhado pra substituir 1:1 sozinho — a migração real exigiria reescrever a camada de orquestração em volta, não só trocar as funções de cálculo.
- É a lógica de **maior risco** do sistema — qualquer erro de migração na camada financeira central afeta todos os cálculos exibidos, sem margem de erro.
- Sem ambiente de teste com login real disponível nesta sessão, qualquer migração não poderia ser validada visualmente antes do usuário testar — risco maior do que o normal.
- Zero problema real que essa migração resolveria hoje (o `app.js` funciona, os números batem) — é dívida técnica, não bug.

### Recomendação final
**Não migrar agora.** Não é código morto (tem propósito, tem teste, tem prova de equivalência) — mas também não há gatilho de negócio pra justificar o risco de mexer no núcleo de cálculo sem conseguir validar visualmente numa sessão como esta. Recomendo revisitar só quando houver um projeto dedicado com escopo próprio (tempo reservado, ambiente de teste com login, plano de rollback por função) — não como resposta a uma pendência de auditoria. Enquanto isso, os 3 arquivos continuam existindo, testados, sem custo de manutenção real (não são tocados, não quebram nada).

---

## 4. Relatório de classificação da Inbox Financeira (~150 itens) — sem execução

157 itens pendentes (144 Pluggy + 13 Mercado Pago), classificados por padrão de descrição:

| Categoria | Qtd | Soma (R$) | Valor médio |
|---|---|---|---|
| Compra/estabelecimento comercial (varejo, restaurante, serviço) | 64 | 20.845,32 | 325,71 |
| Movimentação de investimento (bolsa, conta remunerada) | 18 | 680,00 | 37,78 |
| Compra e-commerce (Mercado Livre) | 14 | 1.138,96 | 81,35 |
| Pix enviado | 12 | 2.842,00 | 236,83 |
| Pagamento de conta/boleto | 8 | 2.529,46 | 316,18 |
| Pix recebido | 7 | 9.343,92 | 1.334,85 |
| Fatura de cartão (movimentação bancária) | 6 | 36.390,48 | 6.065,08 |
| Cobrança Mercado Pago (assinatura/serviço) | 5 | 1.211,20 | 242,24 |
| Pix QR Code (comércio) | 4 | 160,00 | 40,00 |
| Wärtsilä (salário/reembolso) | 4 | 21.734,54 | 5.433,64 |
| Taxa/encargo bancário | 1 | 16,27 | 16,27 |
| Transferência bancária (TED/DOC) | 1 | 312,00 | 312,00 |
| **Total** | **144** (+ 13 MP) | — | — |

**Baixa confiança de classificação automática**: a categoria "Compra/estabelecimento comercial" (64 itens, 41% do total) é a maior e a menos confiável — foi classificada por exclusão (não bateu com nenhum padrão mais específico), cada linha precisa de leitura individual pra saber se é gasto real esquecido ou algo já lançado por outro caminho.

**Exigem decisão humana antes de qualquer ação** (não são candidatas a automação, mesmo que eu quisesse): as 6 linhas de "Fatura de cartão" (R$36.390,48) e as 4 "Wärtsilä" (R$21.734,54) — juntas somam R$58.125,02, mais da metade do valor total pendente. Já confirmado nesta sessão que pelo menos 2 dessas linhas tocam a cascata de pagamento do **Visa Infinite**, domínio formalmente congelado por decisão sua — não processar sem decisão explícita nova.

**Nenhuma classificação foi executada** — isto é só o raio-x, por pedido explícito.

---

## 5. Wallace Wealth Intelligence — proposta de arquitetura (sem código)

### O que já existe hoje (não é do zero)

| Componente proposto pelo usuário | Equivalente real hoje |
|---|---|
| `wealth_reports` | `historico_relatorios` (competência, score, `dados_json`, `analise_ia`) — 1 linha/mês |
| `wealth_scores` | Embutido dentro de `dados_json.subscores`/`wealthScore` — não é tabela própria |
| `wealth_snapshots` | Embutido dentro de `dados_json.indicadoresBrutos` — não é tabela própria |
| `narrative_engine` | **Duplicado em 2 lugares**: `gerarAnaliseFinanceira()` (JS, `src/relatorio/gerar-analise-financeira.js`) e `gerar_narrativa()` (Python, `wwi_gerar_relatorio_mensal.py`) — mesma lógica, 2 implementações, risco de divergência já confirmado 2x nesta sessão |
| `pdf_generator` | Botão de download client-side (`jsPDF`, roda no navegador do usuário) |
| Histórico mensal | `historico_relatorios`, 1 linha/competência, `UPSERT` idempotente via `wwi_upsert_relatorio_mensal()` |
| Comparativos automáticos | **Não existe** — cada linha é isolada, nada calcula delta entre competências hoje |
| Wealth Score evolutivo | Existe como conceito (a coluna `score` cresce 1 linha/mês), mas sem nenhuma visualização/cálculo de evolução ainda |

### Avaliação honesta antes de propor a arquitetura nova

Normalizar agora em 5 tabelas separadas (`wealth_snapshots`/`wealth_scores`/`wealth_reports`/...) pra um sistema que gera **1 linha por mês** é over-engineering — a complexidade de manter 5 tabelas relacionadas (joins, integridade referencial, migração do dado já existente) não se paga com o volume real. A separação faz sentido pra um sistema multi-usuário ou com granularidade semanal/diária — não é o caso aqui (uso pessoal/familiar, 1 relatório por virada de ciclo).

### Proposta de arquitetura (evolutiva, não uma reescrita)

**Camada 1 — Dado (sem tabela nova por enquanto)**
Manter `historico_relatorios` como a fonte única de verdade de "1 relatório = 1 linha", mas endurecer o schema:
- Adicionar `metodologia_versao text` (ver item 1) — toda mudança de fórmula fica rastreável sem depender de comentário em `regrasAplicadas`.
- Manter `dados_json`/`analise_ia` como estão (JSON é apropriado aqui — o formato dos indicadores muda com a evolução do produto, um schema relacional rígido pra isso geraria migração toda vez que um indicador novo entrar).
- **Revisitar tabela própria pra `wealth_snapshots`/`wealth_scores` só se/quando a granularidade aumentar** (ex: se o usuário quiser um snapshot semanal em vez de mensal — aí sim o volume justifica separar).

**Camada 2 — Narrative engine (aqui sim, mudança estrutural real recomendada)**
Este é o ponto de maior valor real da proposta do usuário. Hoje existem 2 motores de narrativa (JS e Python) fazendo a mesma coisa com potencial de divergir — já divergiram 2x nesta sessão (sub-scores ausentes, fórmula duplicada). Proposta: **o job Python já é o único escritor real de `historico_relatorios`** (documentado no próprio código) — formalizar isso: o motor JS deixa de ter lógica de narrativa própria e vira um **consumidor read-only** (só lê o que o Python já gravou), exceto quando o usuário pede o botão de download **antes** do job do mês ter rodado (aí gera uma prévia local, já é o comportamento documentado hoje, só não formalizado como regra única). Isso elimina a classe inteira de bug "JS e Python calculam diferente" de uma vez, em vez de corrigir sub-score por sub-score toda vez que aparece.

**Camada 3 — Comparativos automáticos (peça nova real, vale construir)**
Não precisa de tabela nova — uma **view** (`vw_wwi_comparativo_mensal`) que faz `LAG()` sobre `historico_relatorios` ordenado por competência, calculando delta de score/patrimônio/sub-scores mês a mês. Trimestral/anual: mesma view, agregando por `date_trunc('quarter'/'year', competencia)`. Baixo custo, cresce sozinha conforme a série de meses cresce — hoje daria 1 linha (sem "mês anterior" pra comparar), e a partir de agosto passa a ter comparativo real.

**Camada 4 — PDF generator**
Manter client-side (`jsPDF`) — não há necessidade de gerar PDF no servidor pra um usuário só, sem agendamento de envio. Only revisitar se o usuário quiser, por exemplo, receber o PDF automaticamente por e-mail todo mês (aí sim justificaria mover pra servidor).

**Camada 5 — Wealth Score evolutivo**
Consequência natural das camadas 1 e 3 — um gráfico novo no painel (ou no próprio relatório WWI) lendo `vw_wwi_comparativo_mensal`, sem infraestrutura nova além da view.

### Resumo da recomendação
Da lista de 5 "componentes" que o usuário propôs, **1 já existe** (`wealth_reports`), **2 estão embutidos e não precisam virar tabela própria ainda** (`wealth_snapshots`/`wealth_scores`), **1 é a peça que realmente vale a pena construir agora** (`narrative_engine` unificado — resolve um bug de classe inteira), e **1 já está resolvido do jeito certo pro porte do sistema** (`pdf_generator` client-side). A peça que falta de verdade e ainda não existe nem embutida é **comparativos automáticos** — e essa é barata (1 view).

**Isso é só arquitetura, nenhum código foi escrito.** Se aprovar essa direção (evolutiva, não os 5 tabelas do zero), o próximo passo natural seria: (1) `metodologia_versao` + a view de comparativo (baixo risco, pode ir junto), depois (2) a unificação do narrative engine (mudança estrutural, merece sessão própria com mais tempo de teste).
