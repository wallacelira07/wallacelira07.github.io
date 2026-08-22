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

**Passagem de turno anterior recuperada**: a sessão de hoje começou identificando que a sessão logo antes tinha sido cortada pelo limite de crédito depois de um commit de código, sem atualizar este arquivo — documentado retroativamente no início do bloco 38. Lição registrada: escrever a passagem de turno ANTES do último commit quando o crédito está acabando, não depois.

## ✅ LISTA CONSOLIDADA DE PENDÊNCIAS REAIS (atualizada 22/08/2026, fim do bloco 40)

**Aguardando ação do usuário (não é trabalho de agente):**
- [ ] Reverter `saudeEmagrecimentoAporte` de 0 pra 490.00 (`parametros_gerais` + `vars-operacional.js`) quando o ciclo 25/09→24/10 abrir — pausado por só 1 ciclo (não fazer antes disso).
- [ ] Rendimento das caixinhas Mercado Pago (`hasReservedBalance=True` mas dado vazio) — achado aponta pra bug do lado da Pluggy; só resolve contatando o suporte deles, se o usuário achar que vale a pena.

**Confirmado resolvido/fechado hoje (não reabrir sem pista nova):**
- [x] `liquidoReal` — corrigido de vez, lê ao vivo do banco.
- [x] `metas.valor_atual` — automatizado.
- [x] Carrossel `.master-tabs` — aceito pelo usuário no estado atual.
- [x] Fatura Mastercard Black via Pluggy — confirmado limitação real da instituição, não é mais suspeita.
- [x] `PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP` auditoria item a item — descartado, os jobs `pg_cron` já bastam (confirmado pelo usuário).
- [x] Parsing de nota de corretagem via Gmail — descartado, usuário não recebe nota por e-mail (premissa errada).
- [x] Categorização `TX000378` — feita, categoria P2P.
- [x] Cron-job.org (Consórcio Porto + robô de dividendos) — já estavam criados, confirmado pelo usuário.

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
