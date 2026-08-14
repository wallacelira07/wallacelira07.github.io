# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 14/08/2026, sessão muito longa (herdou contexto do dia anterior) — bloco 1: reconciliação Wärtsilä, padronização de caixas, correções pontuais e governança de documentação (ver seção 2.1-2.9, resumo herdado). Bloco 2 (o grosso desta reescrita): **investigação e correção de performance do boot** (~6s → ~2,5s medido em produção), **refino visual "premium"** da identidade existente, produzidos por um workflow de 10 agentes especializados (5 performance + 5 design) em worktrees isoladas, revisados/integrados manualmente e publicados em produção (`wallacelira.com.br`) em 6 commits sequenciais. Também corrigido: bug de infraestrutura real (Google Drive sincronizando `.git/` inteiro, injetando `desktop.ini` até dentro de `refs/`, causando o mesmo tipo de corrupção de worktree já visto em sessões anteriores).

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** (renomeada 13/08) — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) **ATIVO**; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** (confirmado 14/08/2026) — não reabrir sem pista nova concreta.
6. **NOVO 14/08/2026 — Nunca deixar o Google Drive sincronizar a pasta `.git/`**: causou corrupção real (ver seção 1.1 abaixo). Se aparecer de novo o erro `fatal: bad object refs/desktop.ini` ou uma worktree "toda deletada" no `git status`, a causa é essa — solução é `find .git -iname "desktop.ini" -delete` (seguro, são só resíduos do Explorer/Drive, não objetos git reais), NUNCA tentar recuperar via `git reflog`/`fsck` primeiro.
7. **NOVO 14/08/2026 — Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** (investigado a fundo, ver seção 1.2) — é competição pelo mesmo thread JS com as ~18 outras ondas concorrentes. Não reabrir como "achado novo" sem medir de novo primeiro.

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.1 Google Drive sincronizando `.git/` — mitigado, não resolvido na raiz
Removidos os `desktop.ini` que já tinham se infiltrado em `.git/refs/` (bloqueava `git fetch`/`push`) e em todas as pastas de `.git/objects/`. **Não configurado ainda** para o Drive parar de sincronizar `.git/` no futuro (precisa adicionar a pasta à lista de exclusão do Google Drive for Desktop, ação fora do alcance de um agente — só o usuário tem acesso à configuração do cliente Drive). Enquanto isso não for feito, o problema pode voltar. Se voltar: mesmo comando de limpeza da regra 6 acima.

### 1.2 Boot do painel: 2,5s em produção, gargalo residual identificado mas não resolvido
Depois de 3 rodadas de correção or (paralelização de fetches → RPC batch desenhada → paralelização de contexto de dedupe → correção de lookup O(n) que não era o problema real), o boot caiu de ~6,1s (medido no servidor local, ambiente enganoso) pra **2.486ms reais em produção** (medido com login real, `wallacelira.com.br`). Breakdown real:
- `wallace-boot-start → modulos-base-loaded`: 517ms (carregamento dos ~93 scripts, já paralelizado ao máximo sem bundler)
- `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy`: ~1,7-1,8s cada, mas **investigado a fundo e confirmado que não é bug de código** — o trabalho síncrono real dentro delas é rápido (~130-140ms, instrumentado e depois removido). A causa é que essas 2 só começam a rodar ~1,2s após o boot iniciar e competem pelo mesmo thread JS com as ~18 outras ondas concorrentes até o fim do boot.
- Resto do boot: rápido (10-70ms por onda).

**Próximo passo real, se o usuário quiser continuar**: não é mais "achar outro bug", é uma mudança estrutural — throttling de quantas ondas rodam ao mesmo tempo, ou mover processamento pro servidor (RPC). Backlog, não pendência urgente.

### 1.3 R$340,00 do ciclo Wärtsilä 2026-07 ainda não chegaram
Bruto do ciclo R$7.362,76, recebido até agora R$7.022,76. Confirmado com o usuário em 14/08 que ainda não chegou. Quando chegar: nova linha em `reembolso_wartsila_recebimentos`, destino provável Caixa Lance.

### 1.4 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente (não conferido de novo nesta sessão).

### 1.5 Data-limite de metas — só 2 de N caixas têm hoje
`caixas.meta_data_limite` só preenchida pra Escola de Júlio (01/11/2026) e Caixa Aniversário Júlio (25/08/2026). Card já lê e mostra automaticamente quando populada, sem precisar de código novo.

## 2. O que foi feito nesta sessão (13-14/08/2026)

### 2.1-2.9 (bloco 1, resumo herdado — detalhe completo em PASSAGEM_DE_TURNO.md)
Reconciliação Wärtsilä fechada, recalibração/renomeação de 17 caixas, bug do rodapé SSOT corrigido, sync multi-conta Mercado Pago, contagem regressiva de metas, investigação de rendimento por cofrinho (bloqueio confirmado), auditoria de governança de documentação (Drive), correção de falso-positivo "1 divergência" na auditoria de Reservas, fix do clima solar buscando 13x no boot.

### 2.10 Workflow de 10 agentes — performance + design "premium" (pedido explícito do usuário)
Usuário pediu explicitamente multi-agente ("coloque 10 agentes, 5 senior em programação e 5 designer gráfico"). Rodado como Workflow (5 performance + 5 design, cada um em worktree isolada, sem tocar `main`, sem aplicar migration no Supabase). 9/10 agentes concluíram (1 falhou na criação da worktree por causa do bug do Drive/`.git`, seção 1.1). Resultado revisado e integrado manualmente (2 conflitos de merge resolvidos combinando as duas mudanças; 1 arquivo com corrupção de worktree — mesmo bug do Drive — descartado em favor de reaplicação manual dos 4 arquivos reais alterados, verificados por leitura direta em vez de `git diff`).

**Performance entregue**: paralelização de fetches sequenciais em Onda 1/3/7/12 e na classificação de transações suspeitas da Pluggy; cache em `sessionStorage` pra endpoints pouco voláteis; RPC nova desenhada (`rpc_composicao_saldo_caixas_batch`, `supabase/migrations/`, **não aplicada** — cliente já tem fallback automático); instrumentação de boot por módulo (`window.WALLACE_BOOT_TIMING`, permanente, útil pra diagnóstico futuro); `defer` na tag do Chart.js (só script bloqueante do `<head>`).

**Visual entregue**: tipografia/espaçamento (escala modular de `--fs-*`/`--lh-*`/`--ls-*`), sombras/elevação em camadas (`--shadow-card`/`--shadow-card-hover`), gradientes de 2 tons na paleta já existente (badges, `.ciclo-btn`, `.btn-pill`, header), estados de hover/focus/active consistentes entre botões. Paleta base, layout e todos os ids/onclick usados por JS preservados intactos (verificado por leitura, não só confiado no relatório dos agentes).

**Bug real achado durante a integração** (não veio de nenhum agente isolado, só apareceu ao combinar os patches): sintaxe de objeto literal (`chave: valor,`) inserida dentro do corpo de uma `class` (`_CacheComTTL`, `app.js`) — quebrava o parse do arquivo inteiro, painel não carregava nada. Corrigido convertendo pra sintaxe de classe (`campo = valor;`).

### 2.11 Correção real de performance pós-deploy (achado ao vivo, não do workflow)
Depois de medir em produção, achado que `reconciliarTransacoesPluggy` tinha uma 4ª busca (`palavrasChaveAssinaturas`) rodando fora do `Promise.all` das outras 3 (mesma classe de bug já corrigida 2x nesta sessão) — corrigido. Também paralelizado o "contexto de dedupe" (4 buscas) com o fetch principal em Onda 6/7 (`dispararContextoDedupeInbox()`, nova função compartilhada em `classificacao-inbox.js`). Essas correções são válidas e ficaram no código, mas **não foram a causa dominante do tempo de Onda 6/7** (ver 1.2 acima) — medido antes/depois, tempo não mudou significativamente, o que levou à investigação mais funda que concluiu ser contenção de thread, não bug de sequenciamento.

### 2.12 `inboxAdicionarItem()` — lookup O(n) trocado por índice O(1) (correção válida, mas não era o gargalo)
`VARS.INBOX_FINANCEIRA.find(...)` (O(n) por chamada, ~1.057 chamadas no boot) trocado por `Map` (`_inboxIndicePorIdExterno`). Correção legítima (mesma classe de bug documentada 2x no próprio código), mantida — mas medição pós-deploy confirmou que a Inbox real só tem 12 itens, então não era isso que causava os 1,7-1,8s.

## 3. Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Se `git fetch`/`push`/worktree falhar com erro de ref/objeto corrompido: ver regra 6 (seção 🎯) antes de qualquer outra investigação.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. Retomar pela seção 1 — nenhuma pendência depende de código urgente.
6. **Sempre que "atualizar passagem de turno" for pedido**: checklist completa da seção 10 do `docs/MANUAL_OPERACIONAL_AGENTES.md`, inclui os 2 arquivos do Google Drive (`Livro Razão/Agentes/`).
