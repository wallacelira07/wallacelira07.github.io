# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero em 22/08/2026** (sessão longa, blocos 38-40 do `PASSAGEM_DE_TURNO.md`). Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo. Detalhe completo de qualquer item abaixo está lá, buscar pelo número do bloco citado.

## 0. Resumo executivo — o que mudou hoje (22/08/2026)

1. **`liquidoReal` corrigido de vez** — risco estrutural documentado desde 20/08 (precisava edição manual de código a cada virada de ciclo) eliminado. Agora lê ao vivo de `ciclos_financeiros_snapshots.salario`, uma coluna V2 que já existia mas nunca estava conectada. Confirmar salário de ciclo novo virou `UPDATE` no banco, não deploy. Ver bloco 38.
2. **`metas.valor_atual` (Meta do Milhão) automatizado** — RPC `atualizar_meta_valor_atual`, fire-and-forget, chamada toda vez que o patrimônio recalcula. Ver bloco 38.
3. **Carrossel `.master-tabs` — 12 rodadas de correção/ajuste**, do zero até um carrossel de loop infinito de verdade (clones de DOM nas 2 pontas, nunca inverte direção, animação com duração proporcional à distância, trava contra cliques rápidos travando o giro). Ver blocos 38-39 pro histórico completo — hoje está publicado e o usuário aceitou o resultado final ("não é o que eu queria mas tá bom").
4. **Pluggy instrumentado** — fatura do Mastercard Black confirmada como limitação real do conector Itaú Personnalité (não bug nosso); rendimento das caixinhas Mercado Pago tem achado novo real (`hasReservedBalance=True` mas dado vazio — sugere bug do lado da Pluggy, não mais "limitação do sandbox"). Ver bloco 40.
5. **Categorização**: `TX000378` (venda de crédito P2P) categorizada — badge deve estar 443/443.
6. **Cards Mastercard Black e Visa Infinite**: lista completa de caixas temáticas comprometidas (era 1 linha resumida "9 caixas"), com a sigla do Livro Razão em cada linha (LRBD, LREM, etc). Visa ganhou a mesma lista pela primeira vez.
7. **2 gráficos irmãos corrigidos** (`psDataLabelPlugin`/`pnlDataLabelPlugin`, aba Cenários) — rótulo de barra muito negativa colava no eixo X, mesmo bug já corrigido em `dzDataLabelPlugin` em 20/08, nunca propagado.
8. **Achado de negócio, não é código**: `Caixa Wartsila` e `Caixa Mercado Pago` nunca devem ser oferecidas como destino de uma compra nova no cartão — são pagadoras de fatura de um cartão específico, não caixas de orçamento genéricas. Já documentado no manual (seção 1.3.4) e no `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`.
9. **2 bugs financeiros reais achados e corrigidos** (usuário: "isso é dinheiro, não pode ter erro"): `rpc_dashboard_resumo().caixas[].saldo` somava compra no cartão como se reduzisse saldo real (corrigido, filtra `afeta_saldo_real=true`); `recalcularIndicadores()` (Taxa de Poupança) ficou preso desatualizado depois do déficit assíncrono resolver (adicionado à lista de reprocessamento). Ver bloco 41.
10. **Migração financeira pra Supabase — Fase 1b CONCLUÍDA** (decisão do usuário após os bugs do item 9). Fase 1a (`rpc_necessidade_total_bruta`) implementada e validada exata contra o site ao vivo. Fase 1b investigada a fundo (workflow de 5 agentes, sem inventar fórmula) — achou 2 bugs reais extras e implementou os 3 pré-requisitos que faltavam (R$87,96 como parâmetro auditável, `provMP` histórico determinístico, `reembolsoManejo` editável). Usuário aprovou formalmente a Regra 1 (determinismo: RPC baseada exclusivamente no ciclo informado, nunca em `NOW()`/`current_date`) e pediu a RPC final consolidada. Ver bloco 42-43.
11. **`rpc_necessidade_total_bruta` reescrita pra cumprir a Regra 1** (mesma RPC, não uma nova — decisão consciente de corrigir em vez de duplicar). Antes: janela de recorrências/assinaturas usava `fn_mb_ciclo_atual_inicio()` (baseada em `current_date`, sem teto); reembolso Wärtsilä pegava `order by ciclo_referencia desc limit 1` (mesmo bug de não-determinismo já corrigido no JS, mas não na RPC); `reembolso_manejo` hardcoded em 0; `prov_mp` lia direto de `vw_parcelamentos_v2` (estado ao vivo). Agora: janela calculada só a partir de `p_ciclo` (`(p_ciclo||'-25')::date` até 24 do mês seguinte, com teto), reembolso filtrado por `ciclo_referencia = p_ciclo`, `reembolso_manejo` lido da coluna real, `prov_mp` vem de `rpc_provmp_por_ciclo(p_ciclo)`. Validado: comparação sem-teto/com-teto deu zero divergência hoje (829,27 idêntico); `cobertura_garantida` bate exato calculando na mão a partir das colunas-fonte (1339,16). **Limitação documentada, não escondida**: boletos/consórcios/aportes_pat/orçamento/déficit ainda leem estado ao vivo (Fase 2+, não implementada) — por isso a RPC só aceita `p_ciclo` = ciclo aberto, ainda não serve pra recalcular ciclo fechado.
12. **IMPORTANTE**: as RPCs novas (`rpc_necessidade_total_bruta`, `rpc_provmp_por_ciclo`) existem no Supabase e batem exato com os valores validados, mas **o site ainda não foi trocado pra consumi-las** — o JS continua calculando localmente (já com os bugs do item 9 corrigidos, e com `coberturaGarantida`/`reembolsoManejo` corrigidos hoje). Trocar o consumo é um passo futuro, explicitamente adiado pelo usuário até esta RPC estar validada — o que acabou de acontecer agora.
13. **Fase 1b encerrada pelo usuário (22/08/2026)** — validação inicial foi nível-dado (sem login disponível na hora). Usuário aprovou o encerramento mesmo assim, mas exigiu homologação formal RPC×UI antes de trocar o consumo no JS. **Feita na sequência, mesma sessão**: usuário logou, homologação campo a campo contra a UI real do ciclo `2026-07` — **9 campos comparados, 0 divergências** (`necessidade_total_bruta`, `necessidade_liquida`, `cobertura_garantida`, `prov_mp`, `deficit_caixas_sem_lrei`, `boletos`, `recorrencias`, `assinaturas`, `orcamento_operacional`, todos exatos). Ciclo `2026-06` marcado formalmente **NÃO HOMOLOGÁVEL** (audit_log de `parcelas` só começa 19/08/2026, um mês depois da virada desse ciclo — sem fonte confiável pra reconstruir, não inventado). Processo de homologação contínua estabelecido: cada fechamento de ciclo novo repete a checagem. Ver bloco 44 pra tabela completa e evidências.

**Passagem de turno anterior recuperada**: a sessão de hoje começou identificando que a sessão logo antes tinha sido cortada pelo limite de crédito depois de um commit de código, sem atualizar este arquivo — documentado retroativamente no início do bloco 38. Lição registrada: escrever a passagem de turno ANTES do último commit quando o crédito está acabando, não depois.

## ✅ LISTA CONSOLIDADA DE PENDÊNCIAS REAIS (atualizada 22/08/2026, fim do bloco 42)

**Migração financeira — próximo passo concreto:**
- [x] Fase 1b encerrada pelo usuário (22/08/2026) — `rpc_necessidade_total_bruta` reescrita, determinística (Regra 1), validada. Ver item 10-13 do resumo executivo.
- [x] Homologação RPC × UI autenticada, ciclo `2026-07` — 9 campos, 0 divergências. Ciclo `2026-06` marcado não-homologável (motivo documentado, bloco 44). Processo de homologação contínua estabelecido pra cada fechamento de ciclo futuro.
- [x] Plano de migração do frontend escrito — `docs/decisions/PLANO_MIGRACAO_FRONTEND_CONSUMO_RPC.md`.
- [x] **Sub-fase A implantada e validada em produção (22/08/2026, bloco 45)**: tabela `rpc_homologacao_necessidade_log` + RPC `registrar_homologacao_necessidade` (Supabase) + `shadow-homologacao-necessidade.js` (novo, chamado no fim de `recalcularNecessidade()`). Testado ao vivo na sessão autenticada real: boot (13/13 campos batendo) e reprocessamento (3 chamadas rápidas → debounce colapsa em 1 gravação, 0 divergência). Não muda nada visível pro usuário — só loga/grava evidência em paralelo.
- [ ] **Sub-fase B (corte real, RPC vira fonte oficial) — NÃO iniciada, aguardando mais ciclos.** Critério do próprio usuário (plano aprovado): múltiplos ciclos sem divergência antes do corte definitivo. Hoje só 1 ciclo (`2026-07`, aberto) tem evidência completa. Próximo gatilho natural: fechamento do ciclo atual (~24-25/09/2026) — mesmo evento que já aciona nova rodada de homologação manual (bloco 44).
- [ ] Fase 2+ da migração (boletos/consórcios/aportes_pat/orçamento/déficit LREI ainda leem estado ao vivo, não por ciclo; Balanço, Patrimônio, Evolução 12 meses) — só planejada em `docs/decisions/PLANO_MIGRACAO_CALCULOS_FINANCEIROS_SUPABASE.md`, nada implementado ainda.

**Aguardando ação do usuário (não é trabalho de agente):**
- [ ] Reverter `saudeEmagrecimentoAporte` de 0 pra 490.00 (`parametros_gerais` + `vars-operacional.js`) quando o ciclo 25/09→24/10 abrir — pausado por só 1 ciclo (não fazer antes disso).
- [ ] Rendimento das caixinhas Mercado Pago (`hasReservedBalance=True` mas dado vazio) — achado aponta pra bug do lado da Pluggy; só resolve contatando o suporte deles, se o usuário achar que vale a pena.
- [ ] Revogar `parametros_gerais.AJUSTES_PONTUAIS_LIMBO_CICLO` (R$87,96) quando o ciclo 2026-07 fechar (25/08) — não é permanente, ver campo `revogar_quando` no próprio registro.

**Confirmado resolvido/fechado hoje (não reabrir sem pista nova):**
- [x] `liquidoReal` — corrigido de vez, lê ao vivo do banco.
- [x] `metas.valor_atual` — automatizado.
- [x] Carrossel `.master-tabs` — aceito pelo usuário no estado atual.
- [x] Fatura Mastercard Black via Pluggy — confirmado limitação real da instituição, não é mais suspeita.
- [x] `PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP` auditoria item a item — descartado, os jobs `pg_cron` já bastam (confirmado pelo usuário).
- [x] Parsing de nota de corretagem via Gmail — descartado, usuário não recebe nota por e-mail (premissa errada).
- [x] Categorização `TX000378` — feita, categoria P2P.
- [x] Cron-job.org (Consórcio Porto + robô de dividendos) — já estavam criados, confirmado pelo usuário.
- [x] `rpc_dashboard_resumo().caixas[].saldo` contando compra de cartão como redução de saldo — corrigido.
- [x] Taxa de Poupança/`despesaTotalComp` dessincronizada — corrigido (adicionado à lista de reprocessamento).
- [x] `reembolso_wartsila_ciclo` sempre pegando o ciclo mais recente em vez do exibido — corrigido.
- [x] `reembolsoManejo` sem mecanismo de edição real — corrigido, campo editável agora.

**Risco estrutural conhecido, sem solução (baixa prioridade, valor pequeno):**
- [ ] `mbIOFConfirmado` — literal manual, atualizar a cada fatura MB nova reconciliada (~R$18-40/mês).

## 1. Fonte de verdade e arquitetura (sem mudança hoje — ver manual pra detalhe)

V2 relacional (Supabase) é o sistema principal. `wallace_dados` (V1) desligada de vez desde 12/08/2026. Domínios V2-exclusivos, exceções formais e o mapa completo por domínio estão em `docs/MANUAL_OPERACIONAL_AGENTES.md` (documento mestre) — não duplicado aqui, ele é a fonte viva e muda com mais frequência do que faz sentido espelhar neste arquivo de estado.

## 2. Pendências técnicas reais deixadas em aberto pra próxima sessão

- **Validar visualmente com login real** o card Visa Infinite (lista de caixas temáticas, hoje zerada — confirmar que aparece certo, não só que não dá erro).
- **`regras_lancamento_estabelecimento`** continua com poucas linhas — cresce sozinha conforme uso, nada a fazer.
- Nenhuma pendência de commit/push no fim desta sessão — tudo publicado.

## 3. Referência rápida (não muda com frequência, mantida por conveniência)

- Ciclo financeiro: 25 a 24 do mês seguinte. Mastercard Black: compras 25→24, fatura fecha dia 22, limbo 22-24 pertence ao ciclo da frente.
- Aportes mensais reais por caixa: `parametros_gerais.RESUMO_APORTES_MENSAIS_CAIXAS` — nunca `caixas.teto_mensal` (é limite de gasto, não aporte).
- `docs/decisions/` tem o histórico de decisões formais — consultar antes de tratar algo como bug se envolver uma exceção conhecida.
- Checklist de início/fim de sessão: seção 9/10 do `docs/MANUAL_OPERACIONAL_AGENTES.md`.

---

*Histórico detalhado de sessões anteriores (reconciliação Mastercard Black/Visa de 20/08, auditoria de 9/10/43 agentes, bugs estruturais "dado que nunca expira", cascata Wärtsilä, etc.) não é repetido aqui — está preservado inteiro em `docs/changelog/PASSAGEM_DE_TURNO.md`, blocos anteriores ao 38. Este arquivo reflete só o estado ATUAL; pra entender como se chegou aqui, ler a Passagem de Turno.*
