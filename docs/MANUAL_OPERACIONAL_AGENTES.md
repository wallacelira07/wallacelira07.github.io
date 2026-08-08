# MANUAL OPERACIONAL DE AGENTES — Sistema Wallace Lira

Procedimento único, obrigatório para qualquer agente (Claude Chat, Claude Code, Copilot, ou humano) que opere este sistema. Objetivo: eliminar erros operacionais recorrentes — compra lançada só num lado, valor não sincronizado, atualização incompleta, correção feita "no escuro".

Este documento define **como agir**. Regras de negócio (cascata de reembolso, caixas, ciclo financeiro) estão em `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` — leia os dois, não se sobrepõem.

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

## 2. Fluxo de lançamento de transações

**REGRA NOVA (08/08/2026, mudança de direção arquitetural do usuário): "V2 é a fonte real, V1 é legado" — não perpetuar convivência permanente.** Antes de seguir os passos abaixo, checar a tabela de domínios da seção 1: se o domínio for um dos já migrados (fonte V2 exclusiva), o lançamento vai **direto na tabela V2 correspondente**, e os passos 2-3 abaixo (escrever em `wallace_dados`/`vars-*.js`) **não se aplicam** a esse domínio — só aos domínios ainda listados como V1.

**Domínios já V2-exclusivos (não escrever mais em `wallace_dados` para eles)**: Patrimônio (exceto Caixa Lance) → tabelas `patrimonio`/`financiamentos`; Investimentos/ROC → `investimentos`; LREI → `emprestimos_internos`; Cascata Wärtsilä → `reembolso_wartsila_ciclo`/`reembolso_wartsila_recebimentos` (+ `transacoes` da caixa "Provisionado Wärtsilä"); Parcelamentos → `parcelas`; P2P → `indicadores` (chaves `P2P - *`); Caixas já reconciliadas (10 de 18) + Livro Razão dessas mesmas caixas + LRW/LRV (totais) → `transacoes` direto.

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
| PIX Geral Vanessa (PGV) com saldo ≤ R$100,00 | Card PGV no painel (`VARS.pixGeralVanessaSaldo`) | Alerta preventivo obrigatório no resumo de abertura de sessão — ver regra completa na seção 6.1. |
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

**Alerta preventivo obrigatório**: sempre que a PGV estiver ≤ R$100,00, incluir aviso no resumo inicial da sessão. Formato:

```
⚠ PIX Geral Vanessa em R$50,69.
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

*Este manual é operacional, não narrativo — não registra o que aconteceu (isso é `PASSAGEM_DE_TURNO.md`) nem o estado atual dos dados (isso é `ESTADO_ATUAL.md`). Registra como qualquer agente deve proceder, sempre. Atualizar aqui quando um procedimento mudar de fato, não quando um evento pontual acontecer.*
