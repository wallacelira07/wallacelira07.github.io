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

## 1. FRENTE ATIVA: Onda 3 — V2 relacional virando fonte de leitura do frontend (`docs/decisions/PLANO_UNIFICACAO_V1_V2.md`, seções 22-28)

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

**Sessões anteriores** (não repetir como novo): performance de carregamento (módulos paralelizados), bug de parser HTML (`</script>` literal dentro de comentário truncando o `<script>`), card FGTS com placeholder hardcoded, card Caixa Wärtsilä (número/barra/legenda), IOF ausente em 2 compras Mastercard Black, cache stale da API REST do Supabase (não investigado a fundo, só documentado).

## 5. Como aplicar dado financeiro real (fluxo consolidado, sem mudança nesta sessão)

1. Usuário confirma o lançamento (nunca aplicar sem confirmação explícita — regra permanente).
2. Aplicar nos 2 lugares do V1: arquivo `.js` local relevante (`src/financeiro/**/vars-*.js`) **e** a linha `wallace_dados` no Supabase — checar antes se a chave existe lá (`select jsonb_object_keys(dados) from wallace_dados where id=1`).
3. **Autorização de commit**: usuário autorizou "comitar sozinho, só avisar antes" — `git push` também já autorizado quando pedido. Nesta sessão: 2 commits feitos (`eff2805`, `4d2e6e2`), **push NÃO feito ainda** (avisar antes).

## 6. Pendente / em aberto (atualizado 08/08/2026)

**Resolvidas — não reabrir como bug novo:** redesign dos botões flutuantes, compra Dr.Pizza R$207,02, Caixa Lance reconciliada do lado V1, `AJUSTE-06-08` revisado, bug de ordem `onDomPronto`.

1. **Onda 3 encerrada** (5/5 prioridades percorridas) — estado aceito pelo usuário, não reabrir.
2. **Onda 4 EM ANDAMENTO — "Supabase como fonte única de verdade"** (mudança de prioridade máxima do projeto, 08/08/2026): desenhar e implementar as estruturas que faltavam na V2, sem gate de divergência (V2 vira fonte assim que a estrutura existir). Ordem autorizada: Patrimônio → Investimentos/ROC → LREI → Cascata Wärtsilä. **Domínio 1 (Patrimônio) CONCLUÍDO** — schema criado (`patrimonio.rotulo/subtipo` + tabela `financiamentos` + view `vw_patrimonio_v2`), dados migrados (mesmos valores do VARS), módulo `hydrate-onda4-patrimonio.js` ligado, V2 é a fonte primária (exceto Caixa Lance, exceção deliberada). Ver seção 31 do plano.
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
