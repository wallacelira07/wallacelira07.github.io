# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site`.

## PRODUÇÃO: domínio oficial é `wallacelira.com.br`

`https://wallacelira.com.br/` (GitHub Pages por baixo) é o ambiente real. **Fim desta sessão: `git status` limpo, mas HEAD está 2 commits À FRENTE de `origin/main` (`eff2805`, `4d2e6e2`) — NÃO enviados ainda (`git push` pendente, usuário não pediu deploy nesta rodada).** Confirmar com o usuário antes de dar push.

**Pendente de verificação manual (não dá pra checar por código)**: confirmar em Firebase Console → Authentication → Settings → Authorized domains que `wallacelira.com.br` está cadastrado.

## Protocolo de sessão nova (leia nesta ordem)

1. Este arquivo (`ESTADO_ATUAL.md`)
2. `PASSAGEM_DE_TURNO.md` — Bloco 17 tem o histórico mais recente (sessão de 08/08/2026, Onda 3 do plano de unificação V1→V2 relacional)
3. `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` — seções 22-28, é a frente de trabalho ATIVA agora (ver seção 1 abaixo)
4. `docs/architecture/ARCHITECTURE.md` + `docs/architecture/PROJECT_STRUCTURE.md`
5. **Sempre conferir o estado real do código** (`git status`, `git log --oneline -10`) **antes de assumir qualquer coisa como pendente ou concluído.**

---

## 0. INVENTÁRIO EXECUTIVO — dependência de `wallace_dados` (08/08/2026, pós-Onda 5 domínio 1)

**Regra operacional vigente**: domínio modelado no Supabase + reconciliado + consumível pelo frontend → V2 vira fonte oficial, VARS vira só compatibilidade/fallback temporário. Sem gate de divergência a partir da Onda 4.

| Domínio | Status | Fonte oficial | Observação |
|---|---|---|---|
| Patrimônio | ✅ Migrado | V2 (`patrimonio`+`financiamentos`) | Exceto Caixa Lance (ver linha própria) |
| Investimentos/ROC/Opções | ✅ Migrado | V2 (`investimentos`+`indicadores`) | — |
| LREI (empréstimos internos) | ✅ Migrado | V2 (`emprestimos_internos`) | — |
| Cascata Reembolso Wärtsilä | ✅ Migrado | V2 (`reembolso_wartsila_ciclo`) | Perna 4 (MP pessoal) fora do escopo |
| Parcelamentos (LRP/LRMP) | ✅ Migrado | V2 (`parcelas`) | `TRANSACOES_CORPORATIVAS_MP` continua V1 |
| Caixas — saldo (10 de 18) | ✅ Migrado | V2 (`vw_saldo_v2_por_caixa`) | Boletos, PIX Vanessa, Variável, Mastercard/Infinite, Bens Duráveis, Eventos, Seguro, Escola Júlio, Churrasco, Combustível |
| Livro Razão — 7 tabelas de lançamento | ✅ Migrado | V2 (`transacoes`) | Mesmas 7 caixas acima (exceto Boletos/Variável, sem aba) |
| LRW/LRV — totais confirmados | ✅ Migrado | V2 (`vw_compromisso_cartao_por_pessoa`) | Só os totais; tabela item-a-item ainda V1 |
| **Caixa Lance** | 🟡 Híbrido | V1 (log-only V2) | Divergência R$4,37 não confirmada — **não reabrir**, decisão do usuário |
| Caixas — 4 restantes (Manutenção/Saúde Família/PIX Geral Vanessa/Aniversário Júlio) | 🟡 Híbrido | V1 | Divergência R$107-346, causa indeterminada — mesma categoria da Caixa Lance |
| LRW/LRV/LRC-limbo/LRCV — tabela item-a-item | ❌ V1 | V1 | 147 candidatas em `transacoes` vs 43 itens V1, sem coluna de classificação — precisaria de critério novo, não perseguido |
| Mastercard Black/Visa — totais (`cartaoMBTotal` etc) | ❌ V1 | V1 | Ainda sobrescrito por `wallace_dados` (JSON blob), não por tabela relacional |
| Operacional (salário/orçamento/créditos/legendas/Inbox Financeira) | ❌ V1 | V1 | Sem estrutura V2 dedicada pra maior parte; `indicadores` já usado só pro CDI/ROC/PIB |
| Ciclo Snapshots (histórico por ciclo) | ❌ V1 | V1 | Sem estrutura V2 |
| P2P | ❌ V1 (não investigado a fundo) | V1 | Módulo pequeno (20 linhas) |

**Percentual aproximado de dependência restante de `wallace_dados`**: ~80-85% dos módulos VARS ainda são fonte ativa (proxy por linha de código nos 8 arquivos `vars-*.js`: ~175 de ~1.190 linhas totais já retiradas de uso ativo, families Patrimônio+ROC+Reembolsos+parte de Caixas/Parcelamentos). Number é aproximado — reflete módulos "aposentáveis" mais do que uso real por card individual do painel.

**Próximo domínio de maior impacto ainda não perseguido**: Mastercard Black/Visa (totais `cartaoMBTotal`/`livroLR*`) — grande, mas precisa investigação de como os totais V1 (sobrescritos por `wallace_dados`) se relacionam com `transacoes`/`parcelas` já migrados, sem cair em nova reconciliação.

---

## 1. FRENTE ATIVA: Onda 5 — continuação da aposentadoria do `wallace_dados` (`docs/decisions/PLANO_UNIFICACAO_V1_V2.md`, seção 35+)

**Domínio 1 (Parcelamentos) CONCLUÍDO**: `parcelas` (V2) já tinha as 22 linhas sincronizadas 1:1 com `VARS.PARCELAMENTOS_VISA`/`MP` — só faltava a view (`vw_parcelamentos_v2`) e o módulo de ligação (`hydrate-onda5-parcelamentos.js`, reaproveita `renderParcelamentos()` V1 inalterada). Nenhuma migração de dado necessária. Seção 35 do plano.

**Candidato descartado no levantamento**: tabela item-a-item de LRW/LRV/LRC-limbo/LRCV — 147 transações candidatas em V2 vs 43 itens V1, sem coluna de classificação existente pra separar os 4 grupos sem inventar critério novo. Não perseguido (evita virar investigação de divergência, proibida pela diretriz atual).

**Domínio 2 (P2P) CONCLUÍDO**: 7 escalares migrados pra `indicadores` (mesmo padrão do CDI). Módulo `hydrate-onda5-p2p.js` reaproveita `recalcularP2P()`/`hydrateResumoP2P()` (V1, inalteradas). Seção 37 do plano.

**Domínio 3 (Mastercard Black/Visa) — BLOQUEADO, avaliado e documentado, não perseguido**: headline totals (`cartaoInfiniteTotal`/`cartaoMBTotal`) são reconciliados manualmente contra fatura real do banco (resíduo R$49,81 "naoReconciliado" já documentado, política "fatura sempre vence") — migrar exigiria reabrir reconciliação, proibido. 4 dos 8 sub-componentes dependem da mesma classificação de transações já bloqueada no domínio 1. Ver seção 36 do plano.

**Achado técnico registrado, não corrigido (impacto zero hoje)**: `VARS.livroLRP`/`totalOpProvMP` recalculam de forma síncrona no boot, antes do módulo assíncrono de Parcelamentos trocar os arrays — fiação downstream ainda reflete o valor do momento do boot, não "ao vivo" da V2 (zero divergência visível porque V1=V2 por migração). Corrigir exigiria re-disparar parte de `recalcularAgregadosDerivados()`, fora do escopo desta rodada.

**Regra operacional nova (08/08/2026, pedido explícito do usuário, ver `docs/MANUAL_OPERACIONAL_AGENTES.md` seções 6 e 9)**: alerta preventivo de PIX Geral Vanessa (PGV) sempre que o saldo estiver ≤ R$100,00 (gatilho formal R$50,00, Política Interna §7) — deve aparecer na resposta de boas-vindas/resumo operacional de abertura de toda sessão nova, a partir de agora. Só alerta, nunca executa transferência/lançamento.

---

## 1.1 HISTÓRICO (ENCERRADO, NÃO REABRIR): Onda 3 — V2 relacional virando fonte de leitura do frontend (`docs/decisions/PLANO_UNIFICACAO_V1_V2.md`, seções 22-28)

**Mudança de direção estratégica desta sessão** (pedido explícito do usuário): "Pare de tratar a V2 como sistema auxiliar" — objetivo passou a ser trocar a LEITURA do frontend de V1 (`wallace_dados`) pra V2 relacional (`caixas`/`transacoes`), caixa por caixa, mantendo fallback V1 automático em caso de falha e **zero mudança de layout/IDs/CSS**. Política vigente (mudou no meio da sessão, por decisão explícita do usuário): **"divergência conhecida e documentada não bloqueia migração — só ausência real de estrutura na V2 bloqueia."**

**Progresso, Onda a Onda:**
- **Onda 1** (4 caixas, zero divergência): Caixa Boletos, PIX Vanessa, Caixa Variável, Mastercard/Infinite — saldo lendo V2 via `vw_saldo_v2_por_caixa`.
- **Onda 2** (+6 caixas, divergência documentada aceita): Caixa Bens Duráveis, Caixa Eventos, Caixa Seguro Emplacamento, Escola de Júlio, Caixa Churrasco, Caixa Combustível — mesma view, causa `AJUSTE-06-08` (Política Interna §31, rendimento real de cofrinho MP sem comprovante diário). **4 caixas ficaram de fora por decisão explícita do usuário** (causa indeterminada, baixa confiança): Caixa Manutenção, Caixa Saúde Família, PIX Geral Vanessa, Caixa Aniversário Júlio. Provisionado Wärtsilä é log-only (não tem card de número simples).
- **Onda 3, prioridade 1 — Livro Razão**: as 7 tabelas de lançamentos das caixas já migradas (Eventos, Seguro, Combustível, Churrasco, Mastercard/Infinite, Bens Duráveis, PIX Vanessa) passaram a ler `transacoes` direto. **Bug real encontrado e corrigido no caminho**: `onDomPronto(fn)` roda `fn()` de forma SÍNCRONA quando o DOM já está pronto (não é fila assíncrona) — como `app.js` é injetado depois de um `fetch()` assíncrono, isso é o caso normal. `WallaceFinanceService` estava definido DEPOIS de `onDomPronto(hydrate)` no arquivo, causando `ReferenceError` determinístico em parte dos carregamentos. Corrigido: `WallaceFinanceService` movido pro topo de `app.js`, logo após a definição de `onDomPronto`.
- **Onda 3, prioridade 2 — LRW/LRV**: view nova `vw_compromisso_cartao_por_pessoa` (agregação pura de `transacoes`, Caixa Variável + `afeta_saldo_real=false`, por pessoa) substitui `VARS.mbLRWConfirmado`/`mbLRVConfirmado`. Divergência (Wallace R$435,08, Vanessa R$146,41) 100% explicada por 5 linhas já conhecidas (`TX000200/203/204/205/206`, colisão de `tx_legado`, Parte B) sem `usuario_id` — aceita.
- **Onda 3, prioridade 3 — Patrimônio: BLOQUEADA, ausência real de estrutura.** A tabela `patrimonio` (V2) só tem `id/tipo/valor/data_snapshot/natureza`, sem rótulo — 2 linhas `tipo='investimento'` (BTG R$14.779,62 e Necton R$429,75) são indistinguíveis exceto pelo valor, e não existe nenhuma coluna pros metadados de financiamento/consórcio (prestação, parcela, % pago, meses restantes). Não migrado. Caminho de desbloqueio (schema novo) registrado, não executado.
- **Onda 3, prioridade 4 — Metas: PARCIAL.** Card "Fundo de Suavização Salarial" migrado (zero divergência, R$0,00 nos dois). "Meta do Milhão" continua em V1 — depende do `patrimonio.total` bloqueado na prioridade 3.
- **Onda 3, prioridade 5 — Investimentos: BLOQUEADA, ausência real de estrutura (achado nesta sessão).** A tabela `investimentos` (V2, 4 linhas) só tem `id/tipo/quantidade/valor_atual/data_atualizacao/ticker` — o card ROC/Opções (`VARS.opcoesVendidasDetalhe`) usa ~14 campos por operação que não existem na V2 (`precoExercicio`, `vencimento`, `premioBruto`, `custoOperacional`, `premioRecebido`, `precoMedio`, `cotacaoAtual`, `resultadoDiario`, `resultadoHistorico`, `precoBlackScholes`, `notaCorretagem`, `exercida`, `statusPosicao`). Não migrado, nenhum código escrito. **Onda 3 esgotada** — as 5 prioridades foram percorridas na ordem definida pelo usuário; 2 migradas, 1 parcial, 2 bloqueadas por ausência real de estrutura.

**Pendência transversal investigada nesta sessão (não mais "nunca classificada")**: saldo da Caixa Lance — divergência V1×V2 de R$4,37 (0,10%). Investigação (views já existentes `vw_reconciliacao_v1_v2`/`vw_transacoes_so_no_v1`/`vw_ajustes_manuais_v1`, sem SQL novo): `AJUSTE-06-08` (-R$65,76) existe só no V1 (nunca sincronizado como transação real na V2), mas isso sozinho não fecha a conta — resíduo de R$4,37 continua com causa indeterminada/baixa confiança. Módulo `hydrate-onda3-caixalance.js` criado e ligado (mesmo padrão da Onda 2), comparando/logando a cada carregamento, mas com `aceitarDivergenciaConhecida: false` — continua exibindo V1 até a causa ser confirmada. Validação em navegador real **pendente** (usuário recusou login manual nesta sessão; só validação técnica/estática foi feita — ver seção 30 do plano).

**Padrão de código estabelecido** (repetir em qualquer migração nova): módulo dedicado em `src/financeiro/**/hydrate-onda*.js`, método novo em `WallaceFinanceService` (`src/app/app.js`, perto do topo), fetch/compare/log/overlay condicional, `window.WALLACE_ONDAX_..._RELATORIO` pra inspeção via console, chamada registrada em `app.js` DEPOIS da função V1 equivalente (pra sobrescrever, nunca competir por ordem), entrada nova no array de módulos do `Sistema_Wallace_Lira_Completo.html`, documentação no formato de 8 pontos (Objetivo/Escopo/Arquivos/Fonte antiga/Fonte nova/Validação/Resultado/Rollback) em `PLANO_UNIFICACAO_V1_V2.md`, validação ao vivo no navegador antes de considerar pronto, commit avisado antes.

**Views V2 validadas e confiáveis pra saldo/reconciliação** (não reinventar): `vw_saldo_v2_por_caixa` (saldo por caixa — `rpc_dashboard_resumo().caixas[].saldo` é NÃO confiável, soma tudo sem filtro de ciclo), `vw_reconciliacao_v1_v2` (V1×V2 lado a lado, qtd de transações, causa provável), `vw_compromisso_cartao_por_pessoa` (nova nesta sessão, LRW/LRV).

## 1.5. FRENTE SEPARADA, EM PAUSA: reconciliação/sincronização V1×V2 clássica

**Se for pedido pra continuar reconciliação/correção de saldo, sincronização em massa (`sincronizar_v1_v2`), ou duplicidade de `tx_legado`** — isso é a frente ANTIGA (pré-pivô estratégico), documentada em `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` seções 1-21. Ficou em pausa quando o usuário decretou "o programa V1→V2 está encerrado do ponto de vista de dados" e mudou o foco pra Onda 3 (seção 1 acima). Não é a mesma coisa que "V2 arquitetural" (VARS/REG modularizados, ver seção 2 abaixo) — ver `CLAUDE.md` na raiz do repo pra não confundir os 3 sentidos de "V2" que já coexistiram neste projeto.

**Estado no corte**: Fase 1 parcial (`cartao_id`/`usuario_id`), Fase 2 concluída (`audit_log`), Fase 3 (diagnóstico/reconciliação) fechada formalmente, Fase 4A (correção das 5 âncoras `saldo_inicial_ciclo`) executada. Fase 4B (sincronização) e 4C (limpeza Caixa Boletos) detalhadas mas não implementadas — não é mais prioridade a menos que o usuário peça explicitamente pra retomar.

## 2. MODULARIZAÇÃO V2 ARQUITETURAL + REORGANIZAÇÃO FÍSICA — ✅ CONCLUÍDAS (sem mudança nesta sessão)

`app.js` → `src/app/app.js`, `VARS`/`REG` modularizados em fábricas por domínio, projeto reorganizado em pastas por domínio de negócio. Sem novidade aqui nesta sessão — ver `PASSAGEM_DE_TURNO.md` Blocos 9-14 pro histórico completo, não repetir.

## 3. Lançamentos financeiros reais aplicados (07-08/08/2026) — todos no V1 (arquivo local + Supabase `wallace_dados`)

Sem lançamento financeiro novo nesta sessão (o trabalho foi 100% migração de leitura V1→V2, não alteração de dado). Ver `PASSAGEM_DE_TURNO.md` Bloco 16 pra lista completa dos lançamentos das sessões anteriores. Resumo do que já está aplicado: reembolso Bradesco R$312, cortinas R$450 + empréstimo LREI0004, reembolso Wärtsilä R$340, R$107,50 bolo de Júlio, Hortifruti R$46,97, correção de IOF (TX000200/TX000205), compra Dr.Pizza R$207,02 (portada pro V1, commit `1f1a69a`).

## 4. Bugs reais encontrados e corrigidos

**Nesta sessão**: bug de ordem de execução `onDomPronto`/`WallaceFinanceService` (ver seção 1 acima — determinístico, não intermitente, corrigido na raiz, beneficia todas as Ondas).

**Bug de usabilidade corrigido (08/08/2026, pedido explícito do usuário)**: itens da Inbox Financeira com mesma origem/valor/data pareciam duplicados quando o Mercado Pago não manda descrição (evento `tipo:'account_money'`, `descricao:''`) — confirmado com dado real do Supabase (2 eventos reais, R$107,50, 07/08/2026, descrição vazia, mesmo `payer`, únicos campos que os distinguem são `id` e o timestamp completo perdido na sincronização). **Auditoria de campos** (pedida pelo usuário): `idExterno` (`MP...`) e `metadata.payer`/`metadata.payment_method` já existiam no dado bruto e no item da Inbox, mas nunca eram renderizados na tabela — `metadata` nem sequer era repassado de `sincronizarMercadoPagoParaInbox()` pra `inboxAdicionarItem()`. Hora/minuto do evento **não está disponível**: `mercadopago_sync.py` trunca `date_approved`/`date_created` pra `[:10]` (só data) na origem — corrigir isso exige alterar o script Python (roda como GitHub Action agendado), fora do escopo desta correção visual, não executado.

**Correção aplicada** (só camada visual, aprovação/rejeição intocadas): `inbox-financeira.js` — `inboxAdicionarItem()` agora aceita e guarda `metadata`; `renderInboxFinanceira()` mostra uma linha de identificação (Pagador + ID externo) abaixo da descrição, só quando o dado existir. `classificacao-inbox.js` — `sincronizarMercadoPagoParaInbox()` repassa `ev.metadata`; quando `ev.descricao` vem vazia, gera descrição automática a partir de `ev.tipo` (mapa fechado: account_money/pix/bank_transfer/credit_card/debit_card/ticket, nunca inventa texto pra tipo desconhecido — mostra o tipo cru nesse caso) em vez do antigo `"(sem descrição)"` genérico.

**Sessões anteriores** (não repetir como novo): performance de carregamento (módulos paralelizados), bug de parser HTML (`</script>` literal dentro de comentário truncando o `<script>`), card FGTS com placeholder hardcoded, card Caixa Wärtsilä (número/barra/legenda), IOF ausente em 2 compras Mastercard Black, cache stale da API REST do Supabase (não investigado a fundo, só documentado).

## 5. Como aplicar dado financeiro real (fluxo consolidado, sem mudança nesta sessão)

1. Usuário confirma o lançamento (nunca aplicar sem confirmação explícita — regra permanente).
2. Aplicar nos 2 lugares do V1: arquivo `.js` local relevante (`src/financeiro/**/vars-*.js`) **e** a linha `wallace_dados` no Supabase — checar antes se a chave existe lá (`select jsonb_object_keys(dados) from wallace_dados where id=1`).
3. **Autorização de commit**: usuário autorizou "comitar sozinho, só avisar antes" — `git push` também já autorizado quando pedido. Nesta sessão: 2 commits feitos (`eff2805`, `4d2e6e2`), **push NÃO feito ainda** (avisar antes).

## 6. Pendente / em aberto (atualizado 08/08/2026)

**Resolvidas — não reabrir como bug novo:** redesign dos botões flutuantes, compra Dr.Pizza R$207,02, Caixa Lance reconciliada do lado V1, `AJUSTE-06-08` revisado, bug de ordem `onDomPronto`.

1. **Onda 3 encerrada** (5/5 prioridades percorridas) — estado aceito pelo usuário, não reabrir.
2. **Onda 4 EM ANDAMENTO — "Supabase como fonte única de verdade"** (mudança de prioridade máxima do projeto, 08/08/2026): desenhar e implementar as estruturas que faltavam na V2, sem gate de divergência (V2 vira fonte assim que a estrutura existir). Ordem autorizada: Patrimônio → Investimentos/ROC → LREI → Cascata Wärtsilä.
   - **Domínio 1 (Patrimônio) CONCLUÍDO** — schema criado (`patrimonio.rotulo/subtipo` + tabela `financiamentos` + view `vw_patrimonio_v2`), dados migrados, módulo `hydrate-onda4-patrimonio.js` ligado, V2 é a fonte primária (exceto Caixa Lance, exceção deliberada). Seção 31 do plano.
   - **Domínio 2 (Investimentos/ROC) CONCLUÍDO** — `investimentos` ganhou 10 colunas novas (strike/vencimento/prêmios/custos/nota/exercida/data_operacao), 3 parâmetros globais em `indicadores` (CDI/ROC_STATUS_LIMITES). Módulo `hydrate-onda4-investimentos.js` reaproveita 100% do cálculo/renderização V1 (`aplicarStatusVencidoEValorMercadoOpcoes`/`calcularROCOpcoes`/`hydrateROC`, inalteradas) sobre dado da V2 — zero lógica duplicada. Seção 32 do plano.
   - **Domínio 3 (LREI) CONCLUÍDO** — tabela nova `emprestimos_internos` (ausência real de estrutura confirmada, não existia nada equivalente). Módulo `hydrate-onda4-lrei.js` reaproveita `renderLivrosVariaveis()` (V1, inalterada). Seção 33 do plano.
   - **Domínio 4 (Cascata Wärtsilá) CONCLUÍDO — Onda 4 esgotada (4/4)**. Tabelas novas `reembolso_wartsila_ciclo`/`reembolso_wartsila_recebimentos`. Achado colateral: caixa "Provisionado Wärtsilä" tinha 0 transações sincronizadas na V2 (saldo travado no inicial) — corrigido, agora R$339,00 (bate com V1). Módulo `hydrate-onda4-wartsila.js` reaproveita `recalcularReembolsos()`/`hydrateReembolsos()` (V1, inalteradas). Seção 34 do plano. **Validação em navegador de toda a Onda 4 continua pendente** (login manual recusado pelo usuário em toda a Onda).
4. **Caixa Lance — divergência de R$4,37 investigada, causa não confirmada** (ver seção 1). Módulo `hydrate-onda3-caixalance.js` criado, comparando/logando, mas exibindo V1 (não é mais ponto cego, mas não migrou). Se a causa for confirmada, virar `aceitarDivergenciaConhecida: true` no arquivo é a única mudança necessária.
5. **Validação em navegador do módulo Caixa Lance PENDENTE** — usuário recusou login manual nesta sessão; só validação técnica/estática foi feita (script carregado, referências existem, sem duplicidade de nomes globais, fallback confirmado por leitura de código). Fazer a validação ao vivo (`window.WALLACE_ONDA3_CAIXALANCE_RELATORIO`) na próxima vez que alguém logar.
6. **2 commits anteriores não enviados** (`eff2805`, `4d2e6e2`) + o commit desta sessão — avisar/confirmar push com o usuário.
7. **R$652,00 sumiu da Inbox Financeira sozinho** (sessão anterior, motivo ainda desconhecido) — não confundir com o caso do Dr.Pizza (já resolvido).
8. **Cache stale da API REST do Supabase** (sessão anterior) — não investigado a fundo, só documentado.
9. **IDs da Inbox Financeira (`INBX000001` etc.) são posicionais, não estáveis** — perigoso se algum código guardar como referência persistente.
10. **PIX Geral Vanessa**: `saldo_inicial_ciclo` duplicado no Supabase (dupla-contagem confirmada) — usuário recusou corrigir até ter mais clareza. Também é uma das 4 caixas fora da Onda 2 (causa indeterminada).
11. **Caixa Boletos**: falta o saldo real de abertura do ciclo em 25/07 (`CICLO_ATUAL_INICIO` hardcoded). Ver Fase 4C da frente antiga (seção 1.5).
12. **`AJUSTE-06-08`**: não remover nenhum `AJUSTE-*`/`RENDIMENTO-*` até o usuário revisar a interpretação nova (rendimento real, não ajuste artificial).
13. **Firebase Console → Authorized domains**: confirmação manual pendente de que `wallacelira.com.br` está cadastrado.

## 7. Ambiente de teste local

- `.claude/launch.json` + `.claude/serve.ps1`: servidor HTTP estático local (`autoPort` habilitado nesta sessão anterior — evita conflito de porta entre sessões).
- Login usa Firebase real — **a IA nunca digita senha**. Painel roda dentro de `<iframe id="mainIframe">` — inspecionar via `document.getElementById('mainIframe').contentWindow`. `VARS`/`REG`/`WallaceFinanceService` são bindings léxicos de topo (`const`), **não** aparecem como propriedade do `window` do iframe — usar `contentWindow.eval('VARS.algumaCoisa')` ou acessar via `document` do iframe pra IDs de DOM, não `contentWindow.VARS` direto.
- `window.WALLACE_VALIDACAO_RUNTIME` (18 fases), `#healthBadge` (12 checagens do REG) e, agora, `window.WALLACE_ONDA{1,2,3}*_RELATORIO` (relatório de cada módulo de migração V2, com `v1`/`v2`/`diverge`/`exibindo` por item) são os testes de regressão padrão depois de qualquer mudança nas Ondas.
