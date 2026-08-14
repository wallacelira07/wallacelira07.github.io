# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 14/08/2026, sessão longa (herdou contexto de sessão anterior do mesmo dia/dia anterior) — reconciliação Wärtsilä concluída, renomeação/padronização de caixas, correção do bug do rodapé SSOT, sincronização multi-conta Mercado Pago, contagem regressiva de metas com prazo, investigação de rendimento por cofrinho (bloqueio confirmado), **auditoria + correção da governança de documentação** (manual apontava pra pasta errada no Google Drive, cópia real 5 dias desatualizada), e mais 2 correções pontuais ainda não commitadas (auditoria de Reservas com fórmula desatualizada, painel Solar buscando clima 13x no boot).

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** (renomeada 13/08, era "Caixa Mastercard/Infinite") — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) está **ATIVO**; só o 4844 (Wallace) está aposentado.
4. **"Estimado só na ausência de valor final"** — regra permanente: ao destravar qualquer campo antes manual/estimado, auditar quem mais consumia a versão antiga antes de considerar resolvido.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** (confirmado 14/08/2026, ver seção 1 abaixo) — não reabrir essa investigação sem uma pista nova concreta (ex: Pluggy lançar um campo novo na API).

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.1 R$340,00 do ciclo Wärtsilä 2026-07 ainda não chegaram
Bruto do ciclo R$7.362,76, recebido até agora R$7.022,76 (R$340 em 07/08 + R$6.682,76 em 13/08). Confirmado com o usuário em 14/08 que ainda não chegou. Quando chegar: nova linha em `reembolso_wartsila_recebimentos`, destino provável Caixa Lance (sobra final do ciclo, já era o plano original).

### 1.2 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente (não conferido de novo nesta sessão — checar saldo atual antes de assumir que já resolveu sozinha).

### 1.3 Backlog não crítico do `sincronizar_pluggy.py`
Nenhum log de debug residual identificado nesta sessão (já limpo em sessão anterior, commit `f3df757`). Se aparecer print `[debug ...]` numa sessão futura, é sinal de regressão, remover.

### 1.4 2 arquivos com correção pronta, ainda não commitados
`src/auditoria/verificacoes/auditoria-automatica.js` e `src/solar/hydrate-clima-solar.js` — ver 2.8/2.9 abaixo. Testar e commitar (avisando antes) assim que retomar a sessão.

### 1.5 Data-limite de metas — só 2 de N caixas têm hoje
`caixas.meta_data_limite` (coluna nova 14/08/2026) só está preenchida para Escola de Júlio (01/11/2026) e Caixa Aniversário Júlio (25/08/2026). Se o usuário quiser prazo em outras metas no futuro, é só popular a coluna — o card já lê e mostra automaticamente (`aplicarMetasV2CaixasEstaticas()`, `hydrate-caixas.js`), não precisa de código novo.

## 2. O que foi feito nesta sessão (13-14/08/2026)

### 2.1 Reconciliação Wärtsilä — fechamento total (ver PASSAGEM_DE_TURNO.md pro passo a passo com os 2 erros corrigidos)
Cascata completa registrada (TX000280-302 + calibração de 14 caixas). Todas as 27 transações de `origem='reconciliacao'` de 13/08 confirmadas categorizadas (nenhuma com `categoria_id` nulo) — pendência que parecia aberta na verdade já tinha sido concluída antes do bug do rodapé aparecer.

### 2.2 Recalibração de 17 caixas + renomeação + CC-codes
17 caixas recalibradas para valores reais fornecidos pelo usuário. 3 renomeadas (`Provisionado Wärtsilä`→`Caixa Wartsila`, `Mercado Pago`→`Caixa Mercado Pago`, `Caixa Mastercard/Infinite`→`Caixa Mastercard_Infinite`) — propagado em DB (`caixas.nome`, `v1_v2_caixa_mapa` limpo antes por FK) + todo JS/HTML que referenciava o nome antigo. CC-205 (Bens Duráveis) e CC-209 (Emagrecimento) atribuídos. Todas as metas dos 12 cards estáticos + os dinâmicos consolidadas pra ler só de `caixas.teto_mensal` (fonte única V2).

### 2.3 Bug do rodapé "N divergência(s) SSOT" — corrigido
Causa raiz: `auditoriaAutomatica()` roda 3x por carregamento, e o aviso anterior nunca era removido do rodapé antes de decidir o que mostrar de novo (append sem cleanup) — por isso o badge "1 divergência" persistia mesmo depois do dado subjacente já ter resolvido. Corrigido em `src/auditoria/verificacoes/auditoria-automatica.js`: os dois branches (0 e N problemas) agora removem `.aviso-ssot-divergencia` antes de decidir o que exibir.

### 2.4 Sincronização multi-conta Mercado Pago
`scripts/sync/mercadopago_sync.py` reescrito pra aceitar lista de tokens (`MERCADO_PAGO_ACCESS_TOKEN` = `token1,token2`, mesma convenção de `PLUGGY_ITEM_IDS`), com checkpoint isolado por `collector_id` (campo `metadata->>collector_id` em `mercadopago_eventos`) — sincronizar a conta 2 nunca risca corromper o checkpoint da conta 1. Nova aplicação de produção criada no Mercado Pago (conta `wallace.servidor@gmail.com`, app "Sistema Wallace Lira", Checkout Pro), Access Token obtido via Browser pane (usuário resolveu os 2 reCAPTCHA/2FA que apareceram, agente não pode resolver captcha). Secret do GitHub atualizado com os 2 tokens. Testado ao vivo (workflow run #45): conta 1/2 sincronizou incremental (7 eventos), conta 2/2 sincronizou histórico completo pela 1ª vez (3 eventos) — heartbeat sucesso.

### 2.5 Contagem regressiva em metas com prazo
Coluna nova `caixas.meta_data_limite` (date, nullable). Populada pra Escola de Júlio (01/11/2026) e Caixa Aniversário Júlio (25/08/2026) — as duas únicas datas que o usuário informou. Card mostra "faltam N dias (DD/MM/AAAA)" abaixo da barra de meta, cor vermelha quando faltam ≤7 dias. Lógica em `aplicarMetasV2CaixasEstaticas()` (`hydrate-caixas.js`), IDs `cxEscolaPrazo`/`cxAnivPrazo` no HTML.

### 2.6 Rendimento por cofrinho Mercado Pago — investigado, confirmado bloqueio real da Pluggy
Pedido do usuário: capturar automaticamente o rendimento de cada cofrinho MP (mesma automação de saldo reservado, feita em sessão anterior). Investigação: as transações "Rendimentos"/"Proceeds interests and dividends" que a Pluggy já sincroniza são da **conta corrente** (irrisórias, ~R$0,10-0,70, esporádicas — usuário identificou isso corretamente ao ver o valor), não dos cofrinhos individuais. Verificação da documentação oficial da Pluggy (`docs.pluggy.ai/docs/accounts.md`, via `llms.txt`) confirmou que `bankData` só documenta `transferNumber`/`closingBalance`/`automaticallyInvestedBalance`/`overdraftContractedLimit`/`overdraftUsedLimit`/`unarrangedOverdraftAmount` — nenhum campo de juros/remuneração/indexador pra `reservedBalances`. **Não é falta de tentativa, é limitação real e documentada da API** — mesma classe do bloqueio já confirmado pra `/investments` (cofrinho MP e previdência BTG não aparecem lá também). Decisão: manter calibração manual mensal, sem previsão de automação total.

### 2.7 Auditoria e correção da governança de documentação (achado real, não é feature)
Usuário relatou "muito problema para o Claude Chat atualizar as coisas, ele se perde todo". Investigação encontrou 2 problemas reais e independentes:
1. **`MANUAL_OPERACIONAL_AGENTES.md` (seção 11.5) apontava pra pasta errada do Google Drive** (`Livro Razão/Sistema Wallace Lira - Claude Chat/`, abandonada em 09/08 e hoje vazia) em vez da pasta real (`Livro Razão/Agentes/`, confirmada pelo próprio `ONDE_LER.md` da pasta certa). Corrigido — seção 11.5 agora documenta o endereço certo e registra o achado pra não se perder de novo.
2. **A cópia real (`Agentes/MANUAL_OPERACIONAL_AGENTES.md`) estava 5 dias desatualizada** (última sincronização 09/08, ainda descrevia `wallace_dados` como fonte viva do painel — desligada em 12/08) — sobrescrita com o conteúdo atual do repositório.
3. `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE (1).md` — arquivo duplicado com sufixo "(1)" (proibido pela própria regra de manutenção do `ONDE_LER.md`), também desatualizado desde 12/08. Reescrito como `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (sem sufixo), cobrindo tudo que mudou entre 12/08 e 14/08 (Pluggy 100% V2, renomeação de caixas, metas com prazo, sync multi-conta MP, bloqueio de rendimento cofrinho). Arquivo "(1)" antigo apagado.
4. `.gdoc` órfão (`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md.gdoc`) solto na raiz do Drive, resíduo da tentativa antiga de usar Google Doc — apagado.
5. **Checklist de Encerramento de Sessão (seção 10 do manual) endurecido**: antes só citava `ESTADO_ATUAL.md`/`PASSAGEM_DE_TURNO.md`; agora exige explicitamente sobrescrever os 2 arquivos do Drive sempre que o manual ou algo que o Claude Chat precisa saber mudar, e checar que não sobrou arquivo `(1)`/`.gdoc` órfão. **Esse é o padrão que deve valer daqui pra frente sempre que o usuário pedir "atualizar a passagem de turno"** — não é só este arquivo + PASSAGEM_DE_TURNO.md, é a lista completa da seção 10.

### 2.8 Auditoria automática: falso-positivo "1 divergência" nas Reservas (achado real)
`auditoriaAutomatica()` (`src/auditoria/verificacoes/auditoria-automatica.js`, checagem 7) somava `r.boletos` na conferência de Reservas, mas `recalcularBalanco()` (`recalcular-balanco.js`) parou de somar Boletos no total em 13/08 (Caixa Boletos migrou da seção 05/reservas pra seção 06/operacional). A checagem nunca foi atualizada junto — passou a acusar "1 divergência" em todo carregamento desde então (~R$1.648,55 de diferença, o valor da Caixa Boletos). Não era o bug do rodapé de novo (2.3, já corrigido), era a própria auditoria comparando contra fórmula desatualizada. Corrigido: soma agora é só das 12 caixas de reserva de fato (`r.boletos` continua existindo no objeto como linha informativa, só não entra mais nesta soma — igual já não entra em `recalcularBalanco()`). **Ainda não commitado.**

### 2.9 Painel Solar buscando o clima 13x no boot (achado real, ~7s de atraso)
`aplicarClimaSolar()` (`src/solar/hydrate-clima-solar.js`) rodava sem nenhuma proteção contra chamada repetida. `hydrate()` é chamado de novo até 13x durante o boot (`promocoes-financeengine.js` promove cada caixa V1→V2 individualmente, re-hidratando a cada uma), e cada chamada disparava a mesma requisição pra Open-Meteo — 13 requisições sequenciais pro mesmo dado (limite de conexões por host do navegador as enfileira), somando ~7s sozinho no fim da fila de carregamento. Clima é só contexto visual (nunca usado em cálculo). Corrigido com uma flag de módulo (`__climaSolarJaBuscado`) que faz a função retornar cedo depois da 1ª busca bem-sucedida da carga de página. **Ainda não commitado.**

## 3. Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
4. Retomar direto pela seção 1 (pendências) — nenhuma delas depende de código, são só acompanhamento de dinheiro real (1.1/1.2) ou dado a popular quando o usuário decidir (1.4).
5. **Sempre que "atualizar passagem de turno" for pedido**: seguir a checklist completa da seção 10 do `docs/MANUAL_OPERACIONAL_AGENTES.md` — inclui os 2 arquivos do Google Drive (`Livro Razão/Agentes/`), não só os 2 arquivos deste repositório.
