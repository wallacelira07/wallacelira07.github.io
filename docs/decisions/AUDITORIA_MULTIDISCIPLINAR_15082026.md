# Auditoria Multidisciplinar — 43 especialistas seniores (15/08/2026)

Rodada via `Workflow` (43 agentes especialistas em paralelo, 1 por papel, fase somente-leitura — nenhum arquivo editado por eles) + 1 agente de síntese. Pedido explícito do usuário: reunir uma "equipe multidisciplinar" (Liderança, UX, Front-end, Back-end, Infra/Cloud, Segurança, Qualidade, Marketing, Dados/Finanças, IA, Conteúdo) pra analisar, corrigir e melhorar o site, escopo livre.

**207 achados brutos reportados, consolidados abaixo em um relatório único.** Detalhe completo por especialista (todos os achados, não só os priorizados) está no journal do workflow — não replicado aqui pra não duplicar fonte.

**Nota de correção**: a síntese abaixo (gerada pelo agente líder) cita "correção de metodologia do Wealth Score pendente de commit" como achado ALTA — isso já foi resolvido e publicado em produção nesta mesma sessão, commit `7d80c59`, ANTES do fim desta auditoria (o workflow já estava rodando quando o commit aconteceu, então o agente de síntese não sabia). Não é mais uma pendência.

## Status de resolução (atualizado ao vivo pelo usuário, item por item — 15/08/2026)

| # | Achado | Status |
|---|---|---|
| 1 | RPC `wwi_upsert_relatorio_mensal` gravável sem auth | ✅ **RESOLVIDO** — `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`. Confirmado via `information_schema.role_routine_grants`: só `service_role`/`postgres` executam agora. Único chamador real (job Python `wwi_gerar_relatorio_mensal.py`) já usa a chave service_role — nada quebrou. |
| 2 | `wallace_dados` legível publicamente | ✅ **RESOLVIDO** — policy de SELECT pública trocada por `auth.role() = 'service_role'`, mesmo padrão das policies de escrita já existentes na tabela. Confirmado: nenhum consumidor front-end ativo (a migração V1→V2 já tinha removido o único merge/fetch client-side em 12/08); o único leitor real é `sincronizar_pluggy.py`, também via service_role. |
| 3 | XSS parcial (`render-livros-variaveis.js`, `render-parcelamentos.js`, `hydrate-onda9-livros-fixos.js`) | ✅ **RESOLVIDO** — escape adicionado em todos os campos de texto externo (nome/obs/descrição/credora/devedora/responsável) nos 3 arquivos, mesmo padrão já usado em `inbox-financeira.js`/`dashboard-navegacao.js`. Não foi possível testar ao vivo (login não é possível neste ambiente) — revisão visual cuidadosa de cada ponto de interpolação. |
| 4 | Regra "cartão nunca reduz saldo real" sem constraint no banco | ✅ **RESOLVIDO** — `CHECK (cartao_id IS NULL OR afeta_saldo_real = false)` adicionada em `transacoes`. Verificado antes: zero linhas violando a regra hoje. Testado ao vivo (INSERT dentro de `BEGIN/ROLLBACK`): a constraint rejeitou corretamente uma linha inconsistente, nada foi gravado. |
| — | Job SAJ "~144x/dia" | ❌ **FALSO POSITIVO** — usuário confirmou que a cadência foi atualizada para a cada 10 minutos de propósito (decisão já informada antes desta auditoria, o agente de Automação não tinha esse contexto). Não é bug, não reabrir. |
| — | "Duplicata" Anthropic R$52,95 | ❌ **FALSO POSITIVO** — usuário confirmou que não é duplicata. Não reabrir. |

| 5 | Zero CI (testes existem, nunca rodam) | ✅ **RESOLVIDO** — workflow novo `.github/workflows/testes_unitarios.yml`, roda os 3 arquivos de teste em push/PR que toquem `src/services/{FinanceEngine,Comparator,CycleEngine}.js`/`tests/unit/**`. Não foi possível rodar `node` localmente pra confirmar as asserções passam (ambiente sem Node) — revisão estrutural confirmou que todos os nomes importados pelos testes batem com os exports reais dos 3 módulos (não há erro de import). A 1ª execução real será no próximo push. |
| 6 | Wealth Score: motor Python estruturalmente incompleto (`organizacaoFinanceira`/`construcaoPatrimonial` ausentes, 35% do peso) | ✅ **RESOLVIDO parcialmente, sem reprocessar histórico** — `construcaoPatrimonial` implementado usando `pib_wallace_historico.snapshot->>'patrimonioLiquido'` do mês anterior (mesma fonte que o painel usa). `organizacaoFinanceira` implementado como proxy adaptado (% de campos de `indicadoresBrutos` preenchidos, já que não há DOM no job Python — documentado explicitamente como adaptação, não equivalência exata). **Reprocessamento retroativo de relatórios já gravados em `historico_relatorios` NÃO foi feito** — decisão do usuário, ver item 2 da lista de validação abaixo. |
| 7 | Guard `patrimonioLiquido > 0` ausente (`protecaoPatrimonial`/`investimentos`) | ✅ **RESOLVIDO** — guarda trocada de truthy pra `> 0` explícito nos dois motores (JS e Python). Corrige um cenário real onde patrimônio líquido negativo invertia o sinal e dava nota 100 (proteção patrimonial máxima) no pior caso possível. |

| 8 | Quick win: `robots.txt` + `<meta robots noindex>` | ✅ **RESOLVIDO** — `robots.txt` novo na raiz (`Disallow: /`) + meta tag em `index.html`, `solar-compartilhado.html`, `404.html`. |
| 9 | Quick win: `scope="col"` nos `<th>` do Livro Razão | ✅ **RESOLVIDO** — 48 `<th>` (Sistema_Wallace_Lira_Completo.html + index.html), mecânico, sem `colspan`/`rowspan` envolvido. |
| 10 | Quick win: contraste do placeholder de login | ✅ **RESOLVIDO** — `#6f6d66` → `#8c8a82`, mesmo valor sugerido no relatório. |
| 11 | Quick win: `aria-pressed`/`aria-label` no botão de esconder valores | ✅ **RESOLVIDO** — helper `_syncBtnEsconderValoresAria()` novo, usado nos 3 pontos que já alternavam o estado visual. |
| 12 | Quick win: `role="dialog"` + Escape + `aria-live` no modal de PIN | ✅ **RESOLVIDO** — `role="dialog"`/`aria-modal`/`aria-labelledby` no modal, `role="alert"`/`aria-live="assertive"` no erro, Escape fecha (input já tinha foco automático ao abrir). |
| 13 | Quick win: comentário desatualizado na Inbox Financeira | ✅ **RESOLVIDO** — comentário em `vars-operacional.js` reescrito pra refletir que Pluggy/Mercado Pago já alimentam a Inbox automaticamente (V2), não é mais "nenhuma automação implementada". |
| 14 | Quick win: remover `teste_cron.yml` | ✅ **RESOLVIDO** — arquivo removido (workflow de diagnóstico esquecido, sem referência em nenhum outro lugar do repo). |
| 15 | Quick win: favicon `#3987e5` → `#4c8ef2` | ✅ **RESOLVIDO** — SVG corrigido (os 2 stops do gradiente, alinhados ao `--accent`/`--accent-2` reais) + os 3 PNGs (32/192/apple-touch-icon) regenerados com Pillow, mesma geometria de antes, mesmas dimensões. |
| 16 | Quick win: `apple-touch-icon` ausente em `solar-compartilhado.html`/`404.html` | ✅ **RESOLVIDO** — linha adicionada nos 2 arquivos, mesmo padrão de `index.html`. |
| 17 | Quick win: `atualizar_mercadopago_eventos` sem guard `service_role` explícito | ✅ **RESOLVIDO** — trocado de blocklist (`IN ('anon','authenticated')`) pra allowlist (`IS DISTINCT FROM 'service_role'`), mesmo padrão de `atualizar_pluggy_contas`. Grants confirmados inalterados. |
| 18 | Quick win: `ORDER BY` explícito em `DISTINCT ON` de `atualizar_pluggy_contas` | ✅ **RESOLVIDO** — as 4 ocorrências de `DISTINCT ON` na função ganharam `ORDER BY` determinístico (tiebreaker por representação textual do JSON ou pelos campos extraídos). Testado isoladamente (fora da função, sem tocar tabela real): dedup agora é determinístico entre execuções. |
| 19 | Quick win: retry/backoff no `_request()` do Pluggy | ✅ **RESOLVIDO** — mesmo padrão de `mercadopago_sync.py._get()` portado: retry em 429/5xx, até 3 tentativas, backoff `2×tentativa` segundos. |

**12 de 13 quick wins do relatório resolvidos nesta rodada** (o 13º, CI, já tinha sido feito antes). Restam só as "Melhorias de médio prazo" da seção 4 do relatório — nenhuma urgente, e a decisão de reprocessamento retroativo do Wealth Score (item 2 da lista de validação abaixo).

---

# Auditoria Multidisciplinar Consolidada — Sistema Wallace Lira
**43 especialistas · Sistema de gestão financeira pessoal/familiar · 15/08/2026**

---

## 1. Resumo executivo

O sistema está estruturalmente saudável para o porte que tem — um painel financeiro pessoal/familiar em HTML/JS vanilla + Supabase, sem funil de aquisição nem público externo relevante — mas a auditoria encontrou dois problemas de segurança de dado real que precisam de decisão imediata do usuário: uma RPC financeira (`wwi_upsert_relatorio_mensal`) gravável por qualquer pessoa com a chave pública, sem nenhuma checagem de autenticação, e uma tabela de dados financeiros completos (`wallace_dados`) legível publicamente sem login. Ambos foram confirmados ao vivo por múltiplos especialistas (DBA, Cybersecurity, Pentester) via consulta direta ao Supabase, não são hipóteses. Fora isso, o padrão recorrente mais caro do projeto é a divergência entre os dois motores que calculam o Wealth Score (JS sob demanda × job Python mensal) — o motor Python está estruturalmente incompleto (falta ~35% do peso dos sub-scores) e já divergiu do JS antes. A suíte de testes unitários existe mas nunca roda automaticamente: zero CI é a lacuna de engenharia mais barata de fechar e com maior retorno. O restante dos achados é dívida técnica e polimento de UX/acessibilidade/SEO de severidade média a baixa, nada bloqueante.

---

## 2. Achados CRÍTICOS / ALTA severidade

### 🔴 CRÍTICO — RPC financeira gravável sem autenticação — ✅ RESOLVIDO (ver tabela de status acima)
**`public.wwi_upsert_relatorio_mensal`** (SECURITY DEFINER) aceita `anon`/`authenticated` executando INSERT/UPDATE em `historico_relatorios` sem nenhuma checagem de `auth.role()`/`auth.jwt()`, ao contrário de todas as outras 8 RPCs de escrita do sistema (confirmado ao vivo via `has_function_privilege()` no projeto Supabase).
— Reportado por: **DBA, Cybersecurity Specialist, Pentester, Back-end Architect**.
**Ação sugerida**: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + guarda `auth.role() = 'service_role'` (mesmo padrão de `registrar_pib_mensal`). Não aplicar sem validar com o usuário — mexe em dado financeiro real e a tabela já teve incidente antes.

### 🔴 CRÍTICO — Dado financeiro completo legível publicamente — ✅ RESOLVIDO (ver tabela de status acima)
**`public.wallace_dados`** tem policy de SELECT `true` para `anon` — qualquer pessoa com a chave pública do site lê o blob financeiro completo da família, sem login.
— Reportado por: **DBA, Cybersecurity Specialist**.
**Ação sugerida**: trocar a policy para o mesmo padrão JWT Firebase das demais tabelas, ou dropar (é V1 legado, migração já encerrada). Confirmar antes se algum job externo ainda lê essa tabela anonimamente.

### 🟠 ALTA — Wealth Score: dois motores divergentes, um deles estruturalmente incompleto — ✅ RESOLVIDO parcialmente (ver tabela de status acima, item 6)
O job Python (`scripts/sync/wwi_gerar_relatorio_mensal.py`) implementa só uma fração dos sub-scores que o motor JS (`src/relatorio/gerar-analise-financeira.js`) calcula — `organizacaoFinanceira` e `construcaoPatrimonial` (35% do peso) simplesmente não existem no lado Python. Já divergiu 2x antes, sem guarda estrutural contra recorrência.
— Reportado por: **Project Manager (Liderança), BI Analyst, QA Automation Engineer, Auditor Financeiro**.
**Ação sugerida**: implementar os sub-scores faltantes no Python (ou documentar por que ficam fora) e criar um teste de paridade JS×Python com dataset sintético fixo, rodando em CI. **financeiro_sensivel — não corrigir sem validar com o usuário se os relatórios já publicados precisam ser reprocessados.**

### 🟠 ALTA — Zero CI: testes existem, nunca rodam — ✅ RESOLVIDO (ver tabela de status acima, item 5)
`tests/unit/{FinanceEngine,Comparator,CycleEngine}.test.js` existem e presumivelmente passam, mas nenhum workflow os executa — não há `package.json` na raiz nem step `node tests/...` em nenhum `.github/workflows/*.yml`.
— Reportado por: **Project Manager (Liderança), QA Analyst, QA Automation Engineer, DevOps Engineer**.
**Ação sugerida**: workflow leve `node --test` (ou os 3 arquivos direto) disparado em push/PR tocando `src/`/`tests/`. Custo quase zero, elimina uma classe inteira de regressão hoje só pega por auditoria manual cara.

### 🟠 ALTA — XSS: escape aplicado parcialmente, mesma classe de bug em outros pontos — ✅ RESOLVIDO (ver tabela de status acima)
O fix de XSS real (14/08) cobriu só 2-3 arquivos; `render-livros-variaveis.js`, `render-parcelamentos.js` e `hydrate-onda9-livros-fixos.js` ainda interpolam `descricao`/`nome`/`obs` direto em template literal → `innerHTML`, sem escape.
— Reportado por: **Desenvolvedor Front-end Senior, Pentester**.
**Ação sugerida**: extrair `escapeHtml()` único (as 3 implementações ad-hoc existentes já divergem entre si) e propagar para os pontos crus. Correção de segurança já aprovada em princípio — pode ser aplicada diretamente, mas avisar o usuário por tocar módulo que já teve incidente real.

### 🟠 ALTA — Regra "cartão nunca reduz saldo real" só existe por convenção, sem constraint no banco — ✅ RESOLVIDO (ver tabela de status acima)
Já foi violada 6 vezes historicamente (Bens Duráveis, Churrasco, Emagrecimento) antes de ser corrigida/generalizada; nada no schema impede recorrência.
— Reportado por: **Business Analyst, Controller Financeiro**.
**Ação sugerida**: `CHECK (cartao_id IS NULL OR afeta_saldo_real = false)` ou trigger equivalente. **financeiro_sensivel — validar com o usuário antes de aplicar, mudança estrutural.**

### ~~🟠 ALTA — Job SAJ disparando ~144x/dia em vez de 2x/dia~~ — ❌ FALSO POSITIVO
Cadência de 10 em 10 minutos é intencional, decisão já informada ao agente antes desta auditoria — o especialista de Automação não tinha esse contexto. Não reabrir.

### ~~🟠 ALTA — Duplicata real não detectada: Anthropic R$52,95 lançada 2x~~ — ❌ FALSO POSITIVO
Usuário confirmou que não é duplicata. Não reabrir.

### 🟠 ALTA — `protecaoPatrimonial` pode dar nota 100 justamente com patrimônio líquido negativo — ✅ RESOLVIDO (ver tabela de status acima, item 7)
Guard usa truthy em vez de `> 0` explícito em `src/relatorio/gerar-analise-financeira.js` (linhas 162-163) — em alavancagem alta, o sub-score de proteção patrimonial pode inverter o sinal.
— Reportado por: **Especialista em Métricas e KPIs**. **financeiro_sensivel.**

### 🟠 ALTA — app.js: monólito de ~2900 linhas sem teste, sem separação de responsabilidades
`WallaceFinanceService` concentra HTTP client, cache global e lógica de negócio no mesmo arquivo que também é boot/DOM; ~91 módulos `hydrate-*` dependem de ordem de carregamento implícita sem checagem estrutural.
— Reportado por: **Front-end Architect, Desenvolvedor Front-end Senior**.
**Ação sugerida**: extrair `WallaceFinanceService` para arquivo próprio (mesmo padrão script-global já usado pelos outros 91 módulos) — reduz o arquivo pela metade sem risco de quebrar os `onclick` inline.

---

## 3. Quick wins (baixo esforço, alto impacto, não toca lógica financeira) — ✅ TODOS RESOLVIDOS 15/08/2026 (ver tabela de status, itens 8-19)

- **CI mínimo**: workflow que roda os 3 testes unitários existentes em push/PR.
- **`robots.txt` + `<meta name="robots" content="noindex,nofollow">`** em `index.html`, `solar-compartilhado.html`, `404.html` — hoje o site inteiro é indexável por padrão (SEO Técnico, SEO de Conteúdo, Marketing Digital, 3 papéis convergindo no mesmo achado).
- **`scope="col"`** nos 51 `<th>` do Livro Razão — find-and-replace mecânico (Acessibilidade).
- **Contraste do placeholder de login** abaixo de 4,5:1 — trocar por `#8c8a82` ou mais claro (Acessibilidade).
- **`aria-pressed`/`aria-label`** dinâmico no botão de esconder valores (Acessibilidade).
- **`role="dialog"` + Escape + `aria-live`** no modal de PIN (Acessibilidade) — hoje sem semântica nenhuma de diálogo.
- **Comentário desatualizado na Inbox Financeira** ("nenhuma automação de captura existe ainda") — contradiz o estado real do produto e pode induzir erro de um agente futuro (PM).
- **Remover `teste_cron.yml`** — workflow de diagnóstico esquecido, agendado a cada 5 minutos, com `actions: write` em produção, cuja hipótese já foi confirmada e documentada em outro lugar (DevOps, Automação).
- **Favicon**: alinhar `#3987e5` do SVG para `#4c8ef2` (o `--accent` real do CSS) — última ponta solta de uma correção de identidade já feita (Designer Gráfico).
- **`apple-touch-icon`** ausente em `solar-compartilhado.html` e `404.html`, presente em `index.html` — adicionar a mesma linha (Designer Gráfico).
- **Padronizar `atualizar_mercadopago_eventos`** para exigir `auth.role() = 'service_role'` explicitamente, igual às RPCs irmãs da Pluggy — ajuste de 1 linha (Meios de Pagamento).
- **`ORDER BY` explícito** em todo `DISTINCT ON` de `atualizar_pluggy_contas` — hoje a deduplicação é não-determinística (Dev Back-end Senior).
- **Retry/backoff** no `_request()` do Pluggy, portando o padrão já existente em `mercadopago_sync.py._get()` (Especialista em APIs).

---

## 4. Melhorias de médio prazo (por tema) — 8 de ~16 resolvidas 15/08/2026 (pedido do usuário: "resolva tudo com prioridade 0")

✅ **Resolvidas**: 12 tabelas financeiras ganharam trigger de `audit_log` (reaproveitando `fn_audit_log_generic()` já existente); `pib_wallace_historico` restrita a login Firebase válido (mesmo padrão de `wallace_dados`); `concurrency:` adicionada em 6 workflows de sync (nunca mais 2 disparos sobrepostos); falha parcial de sincronização (Mercado Pago/Pluggy) agora reflete corretamente no heartbeat/Saúde Operacional em vez de aparecer como "sucesso"; painel de Saúde Operacional passou a cobrir backup externo e relatório WWI mensal; Chart.js ganhou SRI (hash real via `api.cdnjs.com`, testado ao vivo — `window.Chart` carrega normal); ambiguidade da redação das "4 caixas em V1" corrigida no manual (era exceção formal já aceita, não pendência).

✅ **Resolvidas depois (15/08, mesmo dia)**: segredo do webhook Pluggy — código trocado pra `Deno.env.get`, deployado, usuário configurou o secret no Supabase e foi testado ao vivo (`curl` → 200). 2 dos 3 itens de UX: confirmação + desfazer no "✘ Rejeitar" da Inbox; atalho fixo "＋ Lançar" na barra `.master-tabs`. `graficos-cenarios-lazy.js` on-demand — resolvido por um agente especialista dedicado: o ARQUIVO (não só a renderização) agora carrega só quando o usuário abre Gráficos/Cenários/Solar pela 1ª vez, mesmo padrão já validado do html2canvas, risco verificado (único caller sem guard defensivo era `showMaster()`, corrigido).

✅ **Resolvida também**: `PASSAGEM_DE_TURNO.md` arquivado por competência — tinha passado de 1500 linhas nunca arquivadas; blocos de 13/08/2026 pra trás movidos pra `docs/changelog/PASSAGEM_DE_TURNO_ARQUIVO_ATE_13082026.md` (conteúdo integral, nada editado/resumido, só realocado), arquivo principal ficou só com 14-15/08.

⏸️ **Não resolvidas, motivo registrado**: `src/services/*.js` (pergunta arquitetural, precisa decisão do usuário); **scroll position ao trocar de aba — usuário confirmou explicitamente pra não fazer** (conflita com decisão de 11/08/2026 já em produção, "quando eu clicar sobre a aba deveria vir para cima desse menu"; não reabrir); lint dos 91 módulos `hydrate-*` (escopo grande).

**Observabilidade e automação**
- Painel de Saúde Operacional não cobre backup externo nem relatório WWI mensal (SRE) — faltam 2 chaves em `SAUDE_JOBS_LIMIARES`.
- Nenhum alerta ativo quando um job agendado falha — tudo é pull/client-side hoje (SRE, Cloud Architect, Automação); o job "resumo" do `executar_tudo.yml` já calcula o status agregado, só falta disparar notificação.
- `cron-job.org` é ponto único de falha externo sem redundância nem monitoramento — investigar por que o `schedule:` nativo do GitHub Actions falhou antes de descartá-lo de vez (Cloud Architect, DevOps).

**Segurança de RPCs e banco**
- Padrão `SECURITY DEFINER` depende de memória do autor, sem salvaguarda estrutural — adotar `REVOKE EXECUTE FROM PUBLIC` como postura padrão e estender o workflow `verificar_seguranca_views.yml` para sinalizar RPCs sem guarda (Back-end Architect).
- 12 tabelas financeiras sem trigger de `audit_log`, mesma classe de lacuna que já causou o incidente de `historico_relatorios` (Auditor Financeiro).
- `audit_log` não é à prova de adulteração pelo mesmo nível de privilégio que causou o incidente anterior — revisar grants de DELETE/UPDATE (Auditor Financeiro).
- `pib_wallace_historico` com leitura 100% pública sem exigir login (Pentester) — validar se é intencional antes de restringir.

**Arquitetura front-end**
- Camada `src/services/*.js` (FinanceEngine/Comparator/CycleEngine) parcialmente morta, nunca migrada para produção — perguntar ao usuário se a intenção ainda é convergir pra lá ou se `WallaceFinanceService` em `app.js` é a decisão final (Front-end Architect).
- Lint/checagem de dependência implícita entre os ~91 módulos `hydrate-*` (Front-end Architect).

**Performance**
- `graficos-cenarios-lazy.js` (maior módulo do boot, 2193 linhas) carregado incondicionalmente apesar do nome "lazy" — verificar se pode virar sob-demanda, mesmo padrão já aplicado ao html2canvas (Performance Web).
- Chart.js ainda vem de CDN externo sem SRI — considerar self-host (Performance Web).
- Módulos de relatório financeiro carregados no boot sem consumidor visível na UI (Performance Web) — mesma investigação de gatilho que o item anterior.

**UX**
- Formulário de lançamento manual exige rolar por 20 seções (UX Designer) — atalho fixo no cabeçalho ou link "↓ Lançar transação" no topo.
- Troca de aba mestre sempre volta ao topo, perdendo posição de scroll (UX Designer).
- "✘ Rejeitar" na Inbox executa em 1 clique sem confirmação nem desfazer (UX Designer).
- Inbox Financeira sem triagem por severidade/valor — 41 itens indiferenciados numa tabela plana (PM).

**Integrações externas (Pluggy/Mercado Pago/SAJ)**
- Status real do pagamento Mercado Pago (`approved`/`refunded`/`rejected`) capturado mas nunca usado para decidir nada na Inbox (Meios de Pagamento) — **financeiro_sensivel, ver seção 5**.
- ~~Segredo do webhook Pluggy em texto puro na Edge Function, sem rotação~~ — ✅ RESOLVIDO 15/08/2026, testado ao vivo (`curl` retornou 200 com o secret configurado no Supabase).
- Falha parcial de sincronização (Mercado Pago/Pluggy) registrada como "sucesso" no heartbeat (Dev Back-end Senior, Data Engineer).
- Nenhum workflow de sync declara `concurrency:`, sem proteção contra execuções sobrepostas (Dev Back-end Senior).

**Documentação**
- ~~`PASSAGEM_DE_TURNO.md` com 1433+ linhas, só anexado, nunca arquivado por competência~~ (Content Manager) — ✅ RESOLVIDO 15/08/2026, ver tabela de status.
- `PLANO_UNIFICACAO_V1_V2.md` (1933 linhas) sem selo de status apesar da migração estar formalmente encerrada (Content Manager).
- 4 caixas ainda dependem do valor V1 na tela apesar da migração "formalmente encerrada" — redação ambígua entre "congelado por decisão" e "pendência ativa" (Business Analyst).

---

## 5. Itens que EXIGEM validação explícita do usuário antes de qualquer implementação

Tudo marcado `financeiro_sensivel`, ou que contradiga uma decisão já documentada:

1. ~~Commit pendente da correção de metodologia do Wealth Score~~ — **já resolvido, commit `7d80c59`, ver nota de correção no topo deste documento.**
2. **Reprocessamento retroativo de `historico_relatorios`** caso o motor Python seja corrigido — decidir se snapshots já gravados são recalculados ou mantidos com marca de "metodologia pré-15/08".
3. ~~Correção de `wwi_upsert_relatorio_mensal` e da policy pública de `wallace_dados`~~ — ✅ RESOLVIDO, ver tabela de status no topo do documento.
4. ~~Constraint de banco para "cartão nunca reduz saldo real"~~ — ✅ RESOLVIDO, ver tabela de status no topo do documento.
5. **Duplicata Anthropic R$52,95** — não apagar nenhuma das duas TX sem o usuário identificar qual é a real.
6. ~~Guard `patrimonioLiquido > 0`~~ — ✅ RESOLVIDO, ver tabela de status no topo do documento.
7. **Uso do campo `status` do Mercado Pago para filtrar a Inbox** e comportamento quando um evento já triado muda para `refunded`/`charged_back` — decisão de regra de negócio, toca cascata de reembolso já documentada.
8. **RPC de apoio para a cascata de reembolso Wärtsilä** (`validar_plano_cascata_wartsila`) — sugestão de processo, não aplicar sem confirmação.
9. **Trigger de auditoria (`audit_log`) nas 12 tabelas sem cobertura** — levantamento único e decisão do usuário sobre prioridade.
10. **Ambiguidade das 4 caixas em V1 congelado** — decidir se ficam permanentemente congeladas (como Mastercard Black) ou voltam ao backlog ativo com prazo.
11. **Wealth Score histórico**: se a auditoria classificatória mudar o eixo `organizacaoFinanceira` (hoje mede completude do coletor de DOM, não organização real) — decisão de negócio sobre o próximo ciclo de revisão.

---

## 6. Papéis que não se aplicaram de verdade a este produto

- **CRO Specialist (Conversão)**: não há funil de aquisição, cadastro público, carrinho ou CTA — `index.html` é login de usuário já cadastrado manualmente, `solar-compartilhado.html` é relatório só-leitura sem nenhuma ação a converter. O conceito de CRO não tem alvo neste produto.
- **Editor de Vídeo**: nenhum ativo de vídeo/GIF/Lottie no repositório (varredura confirmada por grep e glob); as únicas "animações" são transições CSS decorativas. Sistema de uso familiar direto, sem onboarding guiado nem público externo que justificasse investimento em vídeo.

Ambos os papéis documentaram a varredura que fizeram antes de declarar não aplicável — não é ausência de esforço, é ausência de alvo real no produto.
