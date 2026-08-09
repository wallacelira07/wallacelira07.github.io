# MANUAL OPERACIONAL DE AGENTES — Sistema Wallace Lira

Procedimento único, obrigatório para qualquer agente (Claude Chat, Claude Code, Copilot, ou humano) que opere este sistema. Objetivo: eliminar erros operacionais recorrentes — compra lançada só num lado, valor não sincronizado, atualização incompleta, correção feita "no escuro".

Este documento define **como agir**. Regras de negócio (cascata de reembolso, caixas, ciclo financeiro) estão em `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` — leia os dois, não se sobrepõem.

**Este é o documento mestre.** `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (Google Doc, entrada do Claude Chat — sem acesso a este repositório) deriva deste manual e deve ser mantido em sincronia com ele; nunca o contrário. Ver seção 11.

---

## 0. Nível de Confiança da Informação

**Registrado formalmente em 08/08/2026, pedido explícito do usuário — obrigatório para qualquer resposta que cite dado do Sistema Wallace, em qualquer agente.**

Toda afirmação sobre o sistema carrega um nível de confiança. Classificar mentalmente antes de responder, e deixar o nível explícito sempre que não for óbvio pelo contexto:

| Nível | O que é | Exemplo |
|---|---|---|
| **A** | Supabase verificado — consulta direta ao banco, view verificada, RPC verificada nesta sessão | `SELECT saldo FROM vw_saldo_v2_por_caixa WHERE caixa='Variável'` executado agora |
| **B** | Repositório verificado — código lido, workflow lido, commit/`git log` conferido nesta sessão | "`hydrate-roc.js` blinda `comparacaoCDI` contra `null`, linha 43" |
| **C** | Informação fornecida pelo usuário — print, extrato, valor dito na conversa, sem verificação cruzada | "Você disse que a fatura fechou em R$435,00" |
| **D** | Inferência, hipótese, suposição — dedução, memória de sessão anterior não reconferida, extrapolação | "Provavelmente ainda está assim, mas não confirmei agora" |

**Regra obrigatória**: A > B > C > D. Ao decidir o que responder, preferir sempre o nível mais alto disponível — nunca aceitar D quando A é alcançável na mesma sessão (rodar a query, ler o arquivo).

**Nunca apresentar D como fato.** Frases como "o saldo é X" sem verificação são proibidas quando a informação é hipótese — usar "acho que", "não confirmei, mas", "seria preciso checar para confirmar".

**Aplicação específica ao Claude Chat** (sem acesso a Supabase/repositório): por padrão, qualquer afirmação sobre dado ao vivo do sistema começa no Nível C (se o usuário forneceu) ou D (se não) — nunca C/D disfarçado de A. Se a pergunta exige Nível A/B para responder com segurança, dizer isso explicitamente e encaminhar para uma sessão do Claude Code (ver seção 11.4).

---

## 1. Fonte única da verdade

**Hoje, a fonte que alimenta 100% do painel visível é `wallace_dados` no Supabase** (uma única linha JSON, `id=1`, coluna `dados`) — buscada a cada carregamento e sobreposta ao `VARS` estático via `Object.assign(VARS, dr)`. É isso, e só isso, que o usuário vê na tela.

**Existem DUAS coisas diferentes chamadas "V2" neste projeto — não confundir:**

| | V2 "arquitetural" | V2 "relacional" |
|---|---|---|
| O que é | `VARS`/`REG` clássicos virando módulos (`src/financeiro/**`) | Tabelas normais no Supabase (`caixas`, `transacoes`, `categorias`...) |
| Alimenta o painel? | **Sim** — é literalmente o V1, só reorganizado em arquivo | **Não, ainda não** — dado paralelo, infraestrutura de apoio (ver `docs/decisions/PLANO_UNIFICACAO_V1_V2.md`) |
| Documento de referência | `docs/architecture/ARCHITECTURE.md` | `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` |

Se alguém pedir "atualiza a V2", **pergunte qual das duas** antes de agir — já causou confusão real em sessões anteriores.

**Arquivo local (`src/financeiro/**/vars-*.js`) é espelho, não fonte.** Editar só o arquivo local **não muda o que aparece no site ao vivo** — o Supabase sobrescreve por cima a cada carga. Todo dado financeiro real precisa ir nos dois lugares.

---

## 1.1 V2 como sistema principal — modo de operação nativo (regra permanente, 08/08/2026)

**Mudança de direção formal do usuário**: o projeto passou da fase de transição. Todo agente Claude (Web ou Mobile) aberto neste projeto deve partir da premissa **"a V2 é o sistema principal"** e **operar** nela — não apenas consultar. A V1 (`wallace_dados`) é legado: só usar quando não existir equivalente V2, ou quando houver exceção formal documentada (ver `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` e a lista da seção 2 abaixo).

Isso não substitui a seção 2 (fluxo de lançamento) nem a seção 1 (fonte que alimenta o painel hoje) — é a lente com que qualquer agente novo deve ler as duas: ao decidir onde escrever/ler um dado, **primeiro perguntar "existe RPC/tabela/view V2 pra isso?"**, e só cair pro V1 se a resposta for não.

**Por domínio, o que já existe na V2 (operar direto, não só ler) — confirmar sempre contra a lista viva da seção 2, que é a fonte de verdade sobre o que está migrado**:

| Domínio | Estruturas V2 | Observação |
|---|---|---|
| Compras / transações | `transacoes` (+ `cartao_id`, `usuario_id`, `afeta_saldo_real`) | Lançamento definitivo via `lancar_transacao_manual()` quando o domínio já for V2-exclusivo (seção 2) |
| Caixas | `caixas`, `vw_saldo_v2_por_caixa` | Nunca editar saldo direto — sempre via array de transação (regra 2.4) |
| Patrimônio | `patrimonio`, `financiamentos` | Exceção: Caixa Lance ainda V1 |
| Cartões | `cartoes` | Mapa de titularidade (Mastercard Black/Visa) migrado Wave B1 |
| Livros Razão | `transacoes` filtradas por caixa/pessoa; `vw_compromisso_cartao_por_pessoa` (LRW/LRV) | LRR/LRS/LRC ainda não têm array V1 migrado — não assumir que existe |
| Parcelamentos | `parcelas` | — |
| Energia solar | `energia_solar_leituras`, `energia_solar_geracao_diaria`, `ciclos_solares`, `vw_ciclo_solar_aberto`, `vw_ciclo_solar_historico` | Distinguir sempre geração diária × acumulada × crédito do ciclo × histórico de ciclos fechados |
| Investimentos / ROC | `investimentos` | Schema ainda não comporta strike/prêmio/vencimento de opções — ROC continua calculado em V1 até esse gap fechar |
| Reembolsos (cascata Wärtsilä) | `reembolso_wartsila_ciclo`, `reembolso_wartsila_recebimentos` | + `transacoes` da caixa "Provisionado Wärtsilä" |
| Empréstimos internos (LREI) | `emprestimos_internos` | — |
| Indicadores | `indicadores` | Preferir sempre a `indicadores` a constante hardcoded no frontend, quando o valor mudar com o tempo |

**Critério de sucesso** (o que um agente novo, sem memória de sessões anteriores, precisa conseguir fazer só lendo este manual): registrar compra, registrar pagamento, atualizar caixa, atualizar patrimônio, atualizar cartão, atualizar livro razão, atualizar parcelamento, atualizar energia solar, atualizar investimento, atualizar reembolso, atualizar indicador — usando a estrutura V2 correspondente como primeira escolha, com a V1 tratada só como legado/exceção/domínio ainda não migrado.

**Isso não muda nenhuma regra de segurança já existente**: usuário confirma antes de lançar (seção 2.1), nunca editar saldo/placeholder direto (seção 2.4), dry-run antes de `UPDATE`/`DELETE` real (seção 4), avisar antes de commit/push (seção 8) — a V2 ser "principal" é sobre **onde** o dado mora, não sobre relaxar **como** ele é alterado.

---

## 1.2 Fase 5 — fechamento do ciclo de gravação (registrado 08-09/08/2026, importante para qualquer agente novo)

Até 08/08/2026, o formulário "＋ Lançar" (botão flutuante do painel) gravava a transação na V2 (tabela `transacoes`, via RPC `lancar_transacao_manual`) mas o painel visível **não refletia isso sozinho** — o dado ficava "gravado mas invisível" até alguém atualizar `wallace_dados` manualmente. Isso já causou perda real de visibilidade de uma transação (PIX de R$652, aprovado na Inbox e nunca lançado de fato).

**Corrigido (commit `7139966`)**: o próprio clique em "Salvar" agora invalida o cache do `WallaceFinanceService` e re-executa os módulos V2 (Caixas, Patrimônio, Wärtsilä/Reembolsos, LREI, Livro Razão, P2P, Parcelamentos) automaticamente — saldo, Balanço e Resumo Executivo se atualizam na mesma ação. **Validado com evidência real de banco** (teste reversível) e **em uso real** desde 08/08/2026 (compras de cartão registradas via `lancar_transacao_manual` com `p_cartao_id` preenchido — ex: medidor solar R$79,79 e cabo/quadro R$149,20, ambos Caixa Bens Duráveis, cartão 4628).

**Limitação conhecida, deliberada**: Necessidade Total/Modo Operacional/Saldo do Ciclo (topo do Resumo Executivo) continuam vindo de `VARS.CICLO_SNAPSHOTS`/`ciclos_financeiros_snapshots`, não somam `transacoes` ao vivo — recalcular isso é modelagem nova significativa, fora de escopo até nova decisão do usuário.

**Exceção residual**: 4 caixas (Caixa Lance + Manutenção + Saúde Família + Aniversário Júlio) continuam exibindo o valor V1 por divergência formal não resolvida — lançar nelas grava normal, mas o número na tela não se move até essa exceção ser revisitada por decisão do usuário.

**PIX Geral Vanessa promovida pra V2 em 09/08/2026** (saiu da lista acima) — investigação Nível A completa fechou a causa raiz: `TX000219`/`TX000221` estavam sob `caixa_id` errado por confusão de sigla numa migration (corrigido, `UPDATE` + `audit_log`), e a hipótese de um saldo "R$338,00" foi encerrada (era valor órfão em `wallace_dados`, nunca chegava à tela — confirmado em navegador real). O painel agora exibe o saldo V2 diretamente (`hydrate-onda2-v2.js`, `aceitarDivergenciaConhecida:true`), incluindo a linha do Balanço e a barra/percentual de meta (que mostra o valor real sem capar em 100%, pedido explícito do usuário — a caixa pode aparecer acima da meta de propósito). O residual de ~R$256 entre V1 e V2 é aceito como consequência esperada da transição (lançamentos que nascem só na V2), não mais tratado como divergência a investigar — mas a telemetria de comparação continua ativa no console (`window.WALLACE_ONDA2_V2_RELATORIO`). Ver `docs/changelog/PASSAGEM_DE_TURNO.md` pro detalhe completo da investigação.

**Cartões**: o formulário "＋ Lançar" da UI só expõe campo de CAIXA, não de cartão — mas a RPC `lancar_transacao_manual` já aceita `p_cartao_id`, então uma compra no cartão pode ser lançada via Claude Code (SQL direto) apontando `cartao_id` real, mesmo sem a UI ter esse campo ainda.

**Fluxo operacional recomendado para registrar uma compra (decisão explícita do usuário, 09/08/2026)**: o Claude Chat (mobile/web) **não tem e não deve fingir ter** acesso de gravação ao Supabase — nunca simular um lançamento, nunca inventar um ID de transação, nunca descrever qualquer variação do fluxo Excel antigo (TX000xxx, SWP_INPUT, ERP V10/V11, `recalc.py` — esse fluxo está desativado desde 08/08/2026). Fluxo de 2 passos, deliberadamente sem escrita direta via Claude Chat por enquanto (decisão explícita: primeiro validar uso real e estabilidade, só depois avaliar conector de escrita):
1. **Claude Chat interpreta**: lê a nota/print/texto da compra e devolve os dados prontos (data, valor, estabelecimento, caixa sugerida, cartão, classificação) usando as regras deste documento (nunca inventar campo sem evidência, seção 4).
2. **Usuário confirma e o sistema registra**: usuário abre o site (funciona no navegador do celular normalmente) e usa "＋ Lançar" com os dados prontos — grava e reflete no painel na hora. Alternativa: usuário cola os dados prontos numa sessão do Claude Code, que lança via SQL/RPC direto (mesmo efeito, sem esperar suporte a cartão na UI).

Se o Claude Chat perguntar se deve "criar" uma caixa que parece não existir (ex: "Caixa Bens Duráveis"), é sinal de que está usando conhecimento desatualizado (conversa antiga fora do Project, ou memória de sessão anterior) — a lista real de caixas está na tabela `caixas` do Supabase, não em nenhum "SWP_INPUT"/ERP. Orientar o usuário a abrir uma conversa nova dentro do Project.

---

## 2. Fluxo de lançamento de transações

**REGRA NOVA (08/08/2026, mudança de direção arquitetural do usuário): "V2 é a fonte real, V1 é legado" — não perpetuar convivência permanente.** Antes de seguir os passos abaixo, checar a tabela de domínios da seção 1: se o domínio for um dos já migrados (fonte V2 exclusiva), o lançamento vai **direto na tabela V2 correspondente**, e os passos 2-3 abaixo (escrever em `wallace_dados`/`vars-*.js`) **não se aplicam** a esse domínio — só aos domínios ainda listados como V1.

**Domínios já V2-exclusivos (não escrever mais em `wallace_dados` para eles)**: Patrimônio (exceto Caixa Lance) → tabelas `patrimonio`/`financiamentos`; Investimentos/ROC → `investimentos`; LREI → `emprestimos_internos`; Cascata Wärtsilä → `reembolso_wartsila_ciclo`/`reembolso_wartsila_recebimentos` (+ `transacoes` da caixa "Provisionado Wärtsilä"); Parcelamentos → `parcelas`; P2P → `indicadores` (chaves `P2P - *`); Caixas já reconciliadas (10 de 18) + Livro Razão dessas mesmas caixas + LRW/LRV (totais) → `transacoes` direto (**endurecido 08/08/2026, Wave A** — essas 3 frentes deixaram de ter fallback silencioso pro V1, mesmo padrão `⚠ Indisponível (V2)` dos domínios acima); Titularidade/mapa de cartão Mastercard Black/Visa (`CARTAO_PLUGGY_MAPA`) → tabela `cartoes` (**migrado 08/08/2026, Wave B1**, `pluggy-reconciliacao.js`).

**Exceção arquitetural formal (não é pendência, ver `docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md`)**: `cartaoMBTotal`/`cartaoInfiniteTotal`/`mercadoPagoFatura` (headline totals de fatura) nunca serão derivados só da V2 — reconciliados à mão contra extrato real do banco, "a fatura sempre vence". Diferente de Assinaturas/Recorrências (Mastercard Black/Visa), que são pendência real de dado (23 de 27 transações "Assinaturas" sem `cartao_id`), não exceção de negócio.

1. **Usuário confirma antes de lançar.** Regra permanente, sem exceção — nunca aplicar dado financeiro sem confirmação explícita.
2. **Domínio ainda V1** (ver seção 1 e lista acima): aplicar nos 2 lugares, na mesma operação:
   - Arquivo `.js` local relevante (`src/financeiro/**/vars-*.js`).
   - A linha `wallace_dados` no Supabase (`UPDATE ... SET dados = dados || jsonb_build_object(...)` ou `jsonb_set(...)`).
3. **Antes de editar uma chave no Supabase, confirmar que ela existe** (`SELECT jsonb_object_keys(dados) FROM wallace_dados WHERE id=1`) — nem toda chave do `VARS` está espelhada lá; se não existir, criar como chave nova em vez de assumir.
4. **Nunca editar placeholder de saldo direto** (`caixaLance`, `caixaVariavelSaldoReal` etc.) — são sempre recalculados por `calcularSaldoCaixa()`/`recalcularAgregadosDerivados()` a partir dos arrays de transação. Editar o array, nunca o resultado.
5. **Seguir a cascata/regra de negócio aplicável** antes de decidir o destino (ver Política Interna seções 3-5) — não assumir "vai pra Caixa Lance" sem checar a cascata do reembolso.
6. **Inbox Financeira nunca lança sozinha.** `inboxAprovar()`/`inboxRejeitar()` só mudam status — o lançamento definitivo é sempre manual, seguindo este mesmo fluxo. Se aprovar um item da Inbox, **confirmar que o formulário "+ Lançar" foi de fato submetido** antes de considerar concluído — aprovar sem lançar deixa a transação "fantasma" (já visto: `TX000652`/PIX R$652, aprovado mas nunca lançado).
7. **Se o dado também fizer sentido na V2 relacional**, replicar via `lancar_transacao_manual()` ou `sincronizar_v1_v2()` (seção 4) — mas isso é adicional, nunca substitui o passo 2.

---

## 3. Fluxo de auditoria

**V1 (painel visível):**
- `window.WALLACE_VALIDACAO_RUNTIME` — bateria de 18 fases, checar `18/18 APROVADA` depois de qualquer mudança que toque cálculo.
- `#healthBadge` — 12 checagens matemáticas do `REG`, precisa mostrar "✅ Sistema íntegro".
- `auditoriaSSOT()` — roda no boot, "N divergências" no rodapé precisa ser 0.
- Regra V135: todo "total" que ganha checagem de auditoria precisa que o detalhamento que o compõe ganhe a mesma checagem — não valida só o agregado final.

**V2 relacional:**
- `audit_log` — trigger automático em `UPDATE`/`DELETE` de `caixas`/`transacoes`, sempre com `set_config('audit.origem', '<motivo>', true)` antes da operação (`ajuste_manual`, `sincronizacao`, etc.) para o registro sair rastreável.
- `vw_reconciliacao_v1_v2` — reconciliação caixa a caixa, campos `diferenca_absoluta`/`causa_provavel`/`grau_confianca`. Rodar depois de qualquer mudança em `caixas`/`transacoes` que possa afetar saldo.
- `diagnostico_sync_v1_v2()` — lista o que existe no V1 e ainda não está na V2, restrito a livros com mapeamento confiável.

**Método de investigação de qualquer divergência** (Fase 3/4C/TX000140, já validado repetidamente): reconstruir o número algebricamente, comparar cada componente contra evidência real (extrato, fatura, comprovante), nunca aceitar "bateu por acaso" como prova de causa raiz.

---

## 4. Fluxo de sincronização (V1 → V2 relacional)

1. Rodar `sincronizar_v1_v2(true)` (dry-run) — **sempre primeiro**, nunca pular direto pro `false`.
2. Revisar o relatório (`inseridas`/`ignoradas`, cada ignorada com motivo).
3. Só então rodar `sincronizar_v1_v2(false)`.
4. Confirmar que a quantidade inserida bate exato com o previsto no dry-run.
5. Rodar de novo (`false`) uma segunda vez — tem que retornar 0 inserções (prova de idempotência, protegida por `UNIQUE(tx_legado, caixa_id)`).

A função já exclui automaticamente: livros sem mapeamento confiável em `v1_v2_caixa_mapa` (hoje `LRW_TRANSACOES`/`LRV_TRANSACOES`) e `tx_legado` com pendência formal de governança (`TX000208`, `TX000203-206` — ver seção 7). Não é preciso filtrar manualmente.

---

## 5. Regras obrigatórias antes de encerrar uma sessão

- [ ] Todo dado financeiro lançado está nos 2 lugares do V1 (arquivo local **e** Supabase) — nunca só um.
- [ ] `git status` conferido — nada pendente sem explicação, ou pendência documentada no handoff.
- [ ] Se a mudança tocou cálculo/painel: `WALLACE_VALIDACAO_RUNTIME` 18/18 e `#healthBadge` íntegro, validados em navegador real (não só leitura de código).
- [ ] `docs/changelog/ESTADO_ATUAL.md` **reescrito do zero** (não editado incrementalmente) refletindo o estado real desta sessão.
- [ ] `docs/changelog/PASSAGEM_DE_TURNO.md` **recebeu um bloco novo anexado** (nunca apagar histórico) com o passo a passo da sessão.
- [ ] Qualquer decisão de negócio/investigação nova está registrada em `docs/decisions/` (não só na memória da conversa).
- [ ] Usuário avisado do que será commitado **antes** de rodar `git commit`, mesmo com autorização permanente de commitar sozinho.
- [ ] Nenhum `UPDATE`/`DELETE` real em dado financeiro sem o dry-run correspondente ter sido revisado antes.

---

## 6. Gatilhos automáticos que devem ser verificados

| Gatilho | Onde | O que significa se disparar |
|---|---|---|
| `WALLACE_VALIDACAO_RUNTIME` ≠ 18/18 | Console do navegador | Alguma fase de validação falhou — não é enfeite, é bug real até prova em contrário |
| `#healthBadge` ≠ "✅ Sistema íntegro" | Rodapé do painel | Uma das 12 checagens matemáticas do REG não fechou |
| `auditoriaSSOT()` > 0 divergências | Console/rodapé | Total e detalhamento dessincronizaram |
| `CAIXA_VARIAVEL_PENDENTE_PROXIMO_CICLO` com valor | Simulador Fim de Ciclo | Compra do limbo (23-24 do mês) represada, precisa rolar na próxima virada de ciclo |
| `saldo_inicial_calibrado=false` (V2) | `caixas` | Caixa nunca recebeu calibração real — resíduo de reconciliação previsível |
| `transacoes.afeta_saldo_real IS NULL` | V2 | Transação sem classificação de impacto em saldo — P1, nunca deixar acumular |
| Duplicidade `(tx_legado, caixa_id)` | V2 | Bloqueada pela constraint desde a Fase 4B-2 — se aparecer erro `23505` numa sincronização, é isso |
| `avisos` em `rpc_dashboard_resumo()`/`v2_rpc_avisos_negocio` | V2 | Lista de alertas de negócio já computados pelo próprio banco — sempre ler antes de dar sessão por "tudo ok" |
| PIX Geral Vanessa (PGV) com saldo ≤ R$100,00 | Card PGV no painel — desde 09/08/2026, valor V2 (`vw_saldo_v2_por_caixa`), não mais `VARS.pixGeralVanessaSaldo` (V1) | Alerta preventivo obrigatório no resumo de abertura de sessão — ver regra completa na seção 6.1. |
| Caixa Variável citada em qualquer alerta/resumo | Card Caixa Variável no painel | Nunca citar sem dizer qual dos 2 conceitos (TEM NA CAIXA × DISPONÍVEL REAL) — ver regra completa na seção 6.1. |

---

## 6.1 Regras obrigatórias para TODOS os agentes (Claude Chat, Claude Code, Copilot, futuros agentes)

**Registrado formalmente em 08/08/2026, pedido explícito do usuário — não são sugestões, são regras permanentes de operação deste sistema, aplicáveis em qualquer sessão, qualquer agente.**

### Regra Operacional — Caixa Variável

Nunca confundir:

- **TEM NA CAIXA** = saldo bruto existente na Caixa Variável.
- **DISPONÍVEL REAL** = saldo bruto − comprometido.

**Exemplo real** (Política Interna §13):

```
Tem na Caixa:     R$ 1.886,65
Comprometido:     R$ 1.572,81
Disponível Real:  R$   313,84   (= 1.886,65 − 1.572,81)
```

Portanto:
- R$1.886,65 é o dinheiro existente.
- R$313,84 é o dinheiro ainda disponível para novas despesas.
- **Nunca** dizer que a Caixa Variável "tem R$313,84".
- **Sempre** informar explicitamente qual conceito está sendo usado — qualquer alerta operacional deve indicar claramente "Tem na Caixa" ou "Disponível Real".

**É proibido usar "saldo da Caixa Variável" de forma ambígua.**

### Regra Operacional — PIX Geral Vanessa (PGV)

Além do gatilho formal da Política Interna §7:
- **Gatilho oficial** = R$50,00.
- **Reposição padrão** = R$300,00, vindos da PIX Vanessa.

**Atualização 09/08/2026**: a PGV foi promovida pra exibição V2 (ver seção 1.2) — o valor que aparece no painel, e que deve ser usado pra checar o gatilho, agora é o saldo V2 (`vw_saldo_v2_por_caixa`, caixa "PIX Geral Vanessa"), não mais `VARS.pixGeralVanessaSaldo` (V1). Os dois valores divergem (~R$256 de diferença, residual aceito da transição) — usar sempre o que está na tela.

**Alerta preventivo obrigatório**: sempre que a PGV estiver ≤ R$100,00, incluir aviso no resumo inicial da sessão. Formato:

```
⚠ PIX Geral Vanessa em R$X,XX.
Gatilho formal: R$50,00.
Reposição padrão: R$300,00.
Preparar reposição da PIX Vanessa caso ocorra nova saída.
```

**Importante**: apenas alertar; nunca executar transferência automaticamente; nunca criar lançamento automaticamente; decisão continua humana.

### Diretriz permanente — antes de comentar situação da Caixa Variável

1. Ler saldo bruto.
2. Ler comprometido.
3. Calcular disponível real (bruto − comprometido).
4. Informar explicitamente qual valor está sendo citado.

---

## 7. Procedimentos de correção

1. **Nunca corrigir "no escuro"** — toda correção de dado exige causa raiz comprovada com evidência reproduzível (extrato, fatura, comprovante, ou reconstrução algébrica exata), nunca "parece que é isso".
2. **Sempre dry-run antes do `UPDATE`/`INSERT`/`DELETE` real**: snapshot do estado atual, SQL exato, impacto esperado em todas as views/saldos afetados, plano de rollback — só então executar.
3. **Preferir o ajuste mais pontual possível.** Se o problema está numa única célula (`caixas.saldo_inicial_ciclo`), corrigir só ali — não alterar view, schema ou lógica compartilhada pra resolver um caso isolado (ver seção 17 do plano V1→V2: correção na view foi cogitada, testada em dry-run, e **rejeitada** por regredir 8 outras caixas; a correção pontual na âncora resolveu com risco zero).
4. **Toda correção gera rastro**: `set_config('audit.origem', ...)` antes da operação, e o achado + a correção registrados em `docs/decisions/` (não só relatado no chat).
5. **Divergência de valor entre V1 e V2 não é sempre "erro"** — pode ser colisão de `tx_legado` entre dois eventos reais diferentes (mesma classe do `TX000208`), correção legítima do V1 posterior à migração, ou resíduo de sincronização conhecido. Classificar antes de decidir se corrige.
6. **Nunca aceitar "ajuste de reconciliação" como automaticamente ilegítimo nem automaticamente legítimo** — provar antes de remover ou manter (ver Política Interna seção 31, achado dos "ajustes artificiais").

---

## 8. Procedimentos proibidos

- Commitar ou dar `git push` sem avisar o usuário antes, mesmo com autorização permanente de commitar sozinho.
- `git push --force`, `git reset --hard`, ou qualquer comando destrutivo sem confirmação explícita e específica pra aquele caso.
- Pular hooks (`--no-verify`) ou assinatura (`--no-gpg-sign`) sem pedido explícito.
- Editar `src/services/FinanceEngine.js`/`Comparator.js` sem autorização explícita — são a camada V2 arquitetural validada; qualquer mudança exige rodar as 18 fases de novo.
- Mover `src/services/*.js` entre pastas — têm `import`/`require` relativos entre si, quebra em cadeia.
- Criar pasta vazia "pra organizar melhor no futuro".
- Escrever `</script>` como texto solto dentro de um bloco `<script>` (mesmo em comentário) — trunca o parser HTML, já causou bug real de página travada.
- Lançar transação financeira sem confirmação explícita do usuário.
- Inferir/inventar dado que não existe (P1 — cartão, categoria, usuário, valor: se não há evidência objetiva, o campo fica `NULL`/pendente, nunca chutado).
- Corrigir valor em `transacoes` sem ter isolado se é erro real ou colisão de `tx_legado` — os dois exigem tratamento diferente.
- Rodar `sincronizar_v1_v2(false)` sem ter revisado o `sincronizar_v1_v2(true)` correspondente antes.
- Alterar view/schema compartilhado pra resolver um problema isolado de uma única linha/caixa.
- Confiar em narrativa de sessão anterior sem checar `git status`/`git log`/estado real do banco primeiro — já causou trabalho duplicado e diagnóstico errado mais de uma vez.
- Reproduzir letra de música, ou mais de 1 citação de qualquer fonte externa por resposta.

---

## 9. Checklist de Início de Sessão

- [ ] Ler `docs/changelog/ESTADO_ATUAL.md` inteiro primeiro.
- [ ] Ler o(s) bloco(s) mais recente(s) de `docs/changelog/PASSAGEM_DE_TURNO.md`.
- [ ] Rodar `git status` e `git log --oneline -10` — nunca assumir o que está pendente/concluído sem conferir.
- [ ] Se a tarefa envolver "V2", identificar qual das duas (seção 1) antes de tocar em qualquer arquivo.
- [ ] Se a tarefa envolver `caixas`/`transacoes`/qualquer tabela relacional, ler `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` seção mais recente antes de agir.
- [ ] Se for mexer em dado financeiro, checar `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` pra regra de negócio aplicável (cascata, caixa correta, exceção conhecida).
- [ ] Confirmar com o usuário qualquer coisa que pareça pendência de outra sessão antes de reabrir como problema novo.
- [ ] **Checar saldo atual da PIX Geral Vanessa (PGV)** — se ≤ R$100,00 (gatilho formal R$50,00, Política Interna §7), incluir alerta preventivo já na resposta de boas-vindas/resumo operacional de abertura: `⚠ PIX Geral Vanessa em R$X,XX. Gatilho de reposição: R$50,00. Preparar transferência de R$300 da PIX Vanessa caso ocorra qualquer nova saída.` Só alerta — não executar transferência, não lançar, não alterar saldo (regra nova 08/08/2026, ver seção 6).

## 10. Checklist de Encerramento de Sessão

- [ ] Todo lançamento financeiro real está nos lugares aplicáveis (arquivo local + Supabase `wallace_dados`; V2 relacional se decidido).
- [ ] `WALLACE_VALIDACAO_RUNTIME` 18/18 e `#healthBadge` íntegro, se algo tocou cálculo/painel — validado em navegador real.
- [ ] `git status` limpo, ou pendência explicada no handoff.
- [ ] `docs/changelog/ESTADO_ATUAL.md` reescrito do zero.
- [ ] `docs/changelog/PASSAGEM_DE_TURNO.md` recebeu bloco novo anexado.
- [ ] Toda decisão/investigação nova registrada em `docs/decisions/` com evidência, não só narrada no chat.
- [ ] Usuário avisado do que foi commitado/enviado nesta sessão.
- [ ] Nenhuma correção de dado ficou "no escuro" — toda causa raiz documentada, mesmo quando a decisão foi não corrigir ainda.

---

## 11. Governança Multi-Conta e Bootstrap de Novos Chats

**Registrado formalmente em 08/08/2026, pedido explícito do usuário — endurecimento final de governança dos agentes Claude, parte obrigatória da conclusão da V2.**

### 11.1 Contexto: 3 contas, uma só interage com Claude Chat

O usuário opera em 3 contas Anthropic/Google separadas — `wallace.termica@gmail.com`, `wallace.servidor@wartsila.com`, `wallace.lira@wartsila.com`. **Confirmado pelo usuário (08/08/2026): só `wallace.termica@gmail.com` interage com Claude Chat** (Web/Android/iOS). As outras 2 contas (`wartsila.com`) não usam Claude Chat para este sistema — se aparecerem em alguma sessão, é via Claude Code (que lê este repositório diretamente, independente de conta) ou fora do escopo deste sistema.

Isso elimina o problema de sincronização multi-conta para o Claude Chat: não há 3 cópias de Custom Instructions/Project Knowledge para manter alinhadas, só uma. Custom Instructions e Projects (incluindo Project Knowledge) sincronizam automaticamente entre Web/Android/iOS **dentro dessa única conta** — isso é conhecimento de produto Nível D/C (comportamento geral do Claude.ai, não verificado ao vivo nesta sessão); se divergir na prática, o usuário deve confirmar e este documento deve ser corrigido.

Se essa premissa mudar no futuro (outra conta passar a usar Claude Chat para o Sistema Wallace), a seção 11.5 precisa ser reaberta — hoje ela assume conta única.

### 11.2 Fonte canônica — uma verdade, dois pontos de entrada

**Este arquivo (`docs/MANUAL_OPERACIONAL_AGENTES.md`) é o documento mestre.** Motivo: é lido automaticamente por qualquer Claude Code aberto neste repositório, em qualquer conta, sem nenhuma configuração manual — é o único ponto que já resolve "qualquer conta, qualquer dispositivo" hoje, porque depende do repositório Git, não de conta.

**`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`** (Google Doc) é o ponto de entrada do **Claude Chat** (Web/Android/iOS — sem acesso ao repositório) e **deriva** deste manual: sempre que este manual mudar de forma que afete o que o Claude Chat precisa saber, o Google Doc deve ser atualizado na mesma sessão (ver 11.6). Nunca editar o Google Doc com uma regra nova sem que ela também exista aqui — o inverso (regra só aqui, ainda não propagada) é aceitável temporariamente, com pendência registrada no handoff.

Nenhum outro documento (Custom Instructions colado à mão em cada conta, anotação solta, memória de conversa) deve conter regra operacional própria — sempre apontar para os dois documentos acima.

### 11.3 V2 como regra global (reforço)

Vale para os dois documentos, sem exceção: a V2 é o sistema principal. Sempre que existir tabela/view/RPC/indicador V2 para um domínio, o agente usa a estrutura V2. A V1 (`wallace_dados`) só é usada quando não existir equivalente V2, ou quando houver exceção formal documentada (`docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`). Ver tabela de domínios completa na seção 1.1.

### 11.4 Claude Chat × Claude Code — divisão operacional

| | Claude Chat (Web/Android/iOS, só `wallace.termica@gmail.com`) | Claude Code (este repositório, qualquer conta) |
|---|---|---|
| Acesso | Nenhum a Supabase/repositório — só o que está em Project Knowledge/Custom Instructions e o que o usuário cola na conversa | Supabase (MCP) + arquivos do repositório + git |
| Papel | Orienta, interpreta, explica, analisa, tira dúvida sobre regra de negócio | Consulta dado real, valida, cria commits, executa mudança |
| Nível de confiança padrão | C (usuário forneceu) ou D (hipótese) — nunca A/B por conta própria | A/B disponíveis via consulta direta |
| Quando não tem evidência suficiente | **Dizer isso explicitamente** e encaminhar a alteração/dúvida para uma sessão do Claude Code | N/A — já tem acesso; se faltar dado, perguntar ao usuário (Nível C) antes de assumir |

Frase padrão para o Claude Chat encaminhar: *"Não tenho acesso ao Supabase/repositório para confirmar isso agora (Nível C/D) — para uma resposta Nível A, abra uma sessão do Claude Code."*

### 11.5 Bootstrap de novos chats — minimizar risco de assumir V1/Excel

Todo chat novo (qualquer conta, qualquer dispositivo) deve começar assumindo, sem precisar que o usuário repita:

- ✅ V2 (Supabase relacional) como sistema principal.
- ✅ `wallace_dados` como legado, não fonte primária.
- ✅ Exceções formais documentadas existem e devem ser checadas antes de tratar algo como bug.
- ✅ O Excel (`ERP_WALLACE_LIRA_V10_preenchido.xlsx`) não é mais consultado por padrão — parou de ser atualizado antes da migração para Supabase/Claude Code (08/08/2026).

Mecanismo: o `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` já foi reescrito (08/08/2026) para abrir com essa premissa. **Ação recomendada ao usuário** (fora do alcance de qualquer agente sem login na conta) — uma única vez, só em `wallace.termica@gmail.com`: criar um Project dedicado (ex.: "Sistema Wallace Lira"), anexar o documento como Project Knowledge, e manter o Custom Instructions da conta curto, só apontando para o Project ("Para qualquer assunto do Sistema Wallace Lira, leia primeiro o documento anexado neste Project"). Feito uma vez, propaga automaticamente para Web/Android/iOS dessa conta — não precisa repetir por dispositivo.

**Formato oficial dos arquivos no Drive (decisão do usuário, 09/08/2026)**: os dois documentos (`MANUAL_OPERACIONAL_AGENTES.md` e `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`) vivem na pasta `Livro Razão/Sistema Wallace Lira - Claude Chat` do Google Drive, **como arquivos `.md` reais** (`mimeType: text/markdown`, criados com `disableConversionToGoogleType`), **não como Google Doc**. Motivo: uma tentativa inicial criou cópias em Google Doc, que reintroduzem escape de markdown e (mais grave) geraram confusão real — o usuário viu uma conversa do Claude Chat lendo uma cópia desatualizada em Google Doc enquanto a versão `.md` mais recente também existia na mesma pasta, e não havia como saber qual delas o Project Knowledge estava de fato usando. **Se qualquer agente futuro for atualizar esses documentos**: criar sempre como `.md`, nunca deixar duas versões (Doc + `.md`) coexistindo na pasta — apagar a anterior primeiro (peça ao usuário, não há ferramenta de exclusão de arquivo do Drive disponível para agentes nesta sessão) ou avisar explicitamente qual é a oficial.

### 11.6 Processo de manutenção — evitar divergência futura

Toda vez que uma migração V2 for concluída ou uma regra operacional mudar:

1. Atualizar este manual (`docs/MANUAL_OPERACIONAL_AGENTES.md`) — documento mestre.
2. Se a mudança afeta o que o Claude Chat precisa saber (novo domínio V2, nova regra de negócio, nova exceção formal): atualizar `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` na mesma sessão.
3. Atualizar `docs/changelog/ESTADO_ATUAL.md` (reescrito do zero).
4. Anexar bloco novo em `docs/changelog/PASSAGEM_DE_TURNO.md`.
5. Se a mudança criou uma decisão/exceção nova, registrar em `docs/decisions/`.
6. Avisar o usuário do que foi alterado nos dois documentos (manual + Google Doc) antes de considerar a sessão encerrada — o aviso de commit (seção 8) cobre o manual; o Google Doc não passa por `git`, mas merece o mesmo aviso explícito.

Este fluxo é o mesmo independente de qual conta/dispositivo iniciou a sessão — não existe versão "web" ou "mobile" dele.

---

*Este manual é operacional, não narrativo — não registra o que aconteceu (isso é `PASSAGEM_DE_TURNO.md`) nem o estado atual dos dados (isso é `ESTADO_ATUAL.md`). Registra como qualquer agente deve proceder, sempre. Atualizar aqui quando um procedimento mudar de fato, não quando um evento pontual acontecer.*
