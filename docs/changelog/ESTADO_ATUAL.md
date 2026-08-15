# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 15/08/2026, bloco 10. Resumo: correção de metodologia no Wealth Score do WWI (bloco 9, já commitado/publicado) e **auditoria multidisciplinar de 43 especialistas** (bloco 10, pedido explícito do usuário) — 207 achados, achou 2 problemas de segurança reais em produção (RPC gravável sem auth, tabela financeira pública sem login) que exigem decisão do usuário antes de qualquer correção. Relatório completo em `docs/decisions/AUDITORIA_MULTIDISCIPLINAR_15082026.md`.

Sessão anterior: 14/08/2026, sessão longa (bloco 8). Resumo: correção de favicon mobile desatualizado, correção de crédito solar dessincronizado no link de compartilhamento, **auditoria completa do site (1 agente por aba)** que achou e corrigiu 8 bugs reais (Balanço, Livros Razão, Emagrecimento, WWI), decisões do usuário sobre Caixa Lance no WWI e eliminação de constantes hardcoded, investigação sênior que recuperou uma linha perdida de `historico_relatorios` com causa raiz real identificada, e **redesenho completo da Inbox Financeira** (de ~557 pendentes reais pra 41, com filtro automático rodando sozinho daqui pra frente).

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **Nunca deixar o Google Drive sincronizar a pasta `.git/`** — **CONTINUA ACONTECENDO** (achado de novo nesta sessão, `refs/heads/claude/desktop.ini`). As limpezas anteriores (13-14/08) foram sempre reativas, nunca eliminaram a causa raiz (o Drive ainda vê `.git/` como sincronizável). Se aparecer de novo, o procedimento é sempre o mesmo: `find .git -iname desktop.ini -delete` antes de qualquer `git push`.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — contenção de thread já investigada a fundo, não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (seção 1.3.5 do manual). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre, em qualquer caixa.
9. **Procedimento de baixa da fatura, decidido 14/08/2026**: quando a fatura vence e é paga de verdade, `UPDATE` na MESMA linha de `transacoes` (`afeta_saldo_real` false→true). Nunca criar uma segunda transação.
10. **NOVO 14/08/2026 — nenhuma constante financeira nova deve nascer hardcoded no `.js`** se já existe (ou faz sentido existir) um lugar correspondente em `parametros_gerais`/`indicadores`. Mudar um valor deve ser sempre uma edição de dado no Supabase, nunca deploy de código.
11. **NOVO 14/08/2026 — Caixa Lance ENTRA no Patrimônio Líquido do WWI** (relatório executivo), mas continua FORA da fórmula usada pelo Painel Executivo/Balanço (`recalcularPatrimonio()`) — são 2 contextos diferentes, decisão intencional, não confundir nem "corrigir" um pelo outro.
12. **NOVO 14/08/2026 — Inbox Financeira agora se auto-filtra** (`arquivar_inbox_historico()`, roda sozinha a cada sincronização). Não assumir mais que "muitos pendentes acumulados" é normal — se o volume voltar a crescer muito, é sinal de que algo na função nova quebrou, não que precisa de outra faxina manual em massa.
13. **NOVO 15/08/2026 — leitura manual de `energia_solar_leituras` sempre usa a data/hora que o USUÁRIO informa que tirou a foto, nunca "a data de hoje" no momento de gravar.** Já causou 2 achados de "salto implausível" que na verdade eram data errada (não erro de leitura) — o mais recente: leitura real de 12/08 21:49 gravada como 13/08 porque cruzou a meia-noite de Brasília entre o usuário mandar a foto e o agente gravar. Se o trigger `validar_plausibilidade_leitura_solar()` bloquear algo, a 1ª hipótese a checar é data errada na leitura anterior, não "o teto está errado".

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.0 Correção do Wealth Score (`protecaoPatrimonial`) — RESOLVIDO
Commitado e publicado (`7d80c59`), autorizado pelo usuário. Não reabrir.

### 1.-2 🔴 2 achados de segurança real da auditoria — RESOLVIDOS 15/08/2026
`public.wwi_upsert_relatorio_mensal` (REVOKE de PUBLIC/anon/authenticated) e `public.wallace_dados` (policy de SELECT trocada pra `service_role`, mesmo padrão das policies de escrita). Aplicado direto via migration Supabase (MCP), confirmado sem consumidor legítimo quebrado (únicos leitores reais eram jobs Python já usando a chave service_role). Detalhe em `docs/decisions/AUDITORIA_MULTIDISCIPLINAR_15082026.md`, tabela de status. Não reabrir.

### 1.-1 Auditoria multidisciplinar completa (43 especialistas) — 207 achados, resolvendo 1 por 1
Rodada via `Workflow` a pedido do usuário ("equipe de agentes especialistas... escopo livre"), fase somente-leitura. Relatório completo em `docs/decisions/AUDITORIA_MULTIDISCIPLINAR_15082026.md`, com tabela de status no topo sendo atualizada conforme cada item é resolvido/descartado. 2 achados já descartados como falso-positivo pelo usuário (cadência SAJ intencional, "duplicata" Anthropic não é duplicata) — não reabrir nenhum dos dois.

**19 itens resolvidos** (usuário deu autonomia total pra continuar): 2 críticos de segurança (RPC/`wallace_dados`), XSS parcial (3 arquivos), constraint de banco pro cartão, CI dos testes unitários, Wealth Score Python (2 sub-scores implementados, sem reprocessar histórico), guard `patrimonioLiquido > 0`, e os 12 quick wins do relatório (robots.txt, acessibilidade, favicon, RPC guard, ORDER BY determinístico, retry/backoff Pluggy). Tudo commitado e publicado. Só restam as "Melhorias de médio prazo" da seção 4 do relatório (nenhuma urgente) e o item de reprocessamento retroativo do histórico do WWI (decisão do usuário, não meramente técnico).

### 1.0b Leitura solar 14/08 (casa "mãe") bloqueada pelo trigger de plausibilidade — RESOLVIDO 15/08/2026, causa raiz era data errada, não o teto
Recebida via mensagem do usuário (pergunta encaminhada de uma sessão de Claude Chat). `validar_plausibilidade_leitura_solar()` bloqueou o `INSERT` de `casa='mae'`, `data='2026-08-14'`, `leitura_03=90`, `leitura_103=527` (fotos reais confirmadas) — delta contra a linha de `13/08` (81/477) dava 50 kWh/dia no código 103, acima do teto de 40.

**Causa raiz real** (achada por análise + confirmação do usuário com as fotos originais das 2 leituras): a linha de "13/08" estava com a DATA ERRADA — a leitura (81/477) foi tirada de foto real do medidor no dia **12/08 às 21:49**, não no dia 13. `created_at` da linha era `2026-08-13 03:14 UTC` = `13/08 00:14` em Brasília — já tinha virado o dia civil quando alguém gravou a linha, e usou "a data de agora" em vez da data real informada pelo usuário. Não houve leitura nenhuma no dia 13/08.

**Correção aplicada**: `UPDATE` na linha existente (`id=aab7d71e-...`), `data` `2026-08-13`→`2026-08-12`, evidência atualizada explicando a correção. Depois, `INSERT` da leitura de 14/08 (90/527) — passou no trigger sem bloqueio (delta real: 12/08→14/08, 2 dias, 4,5 kWh/dia código 03 e 25,0 kWh/dia código 103, dentro do teto).

**Resposta às 3 perguntas do Claude Chat**: não mexer no teto de 40 kWh/dia (já pegou 2 erros reais de digitação/data até hoje, incluindo este) e não criar mecanismo de override — nenhum dos dois era o problema real.

**⚠️ Risco sistêmico pra registrar como regra**: pelo menos 2 vezes agora (este caso e o de `08/08`, documentado na evidência da linha de `07/08`) uma leitura manual do medidor solar entrou com data errada/implausível e o trigger foi quem pegou. Quem grava leitura manual em `energia_solar_leituras` (Claude Chat, tipicamente) precisa usar a data/hora que o USUÁRIO informa que tirou a foto, nunca "a data de hoje" no momento de gravar — o hiato entre o usuário mandar a foto e o agente processar/gravar pode cruzar a virada do dia civil em Brasília.

**Fechamento estrutural (não só o dado pontual)**: usuário pediu "corrigir o problema de UTC" antes da instalação do DDSU666 (hoje, 15/08/2026). Criada RPC nova `registrar_leitura_solar_manual(p_casa, p_leitura_03, p_leitura_103, p_data_hora_leitura timestamptz, p_eh_leitura_oficial_energisa, p_evidencia)` — não existia nenhuma função dedicada antes, leituras manuais entravam via `INSERT` direto sem validação de fuso nenhuma. A função exige o instante REAL da leitura como `timestamptz` (fuso explícito, sem ambiguidade) e deriva a data civil de Brasília via `AT TIME ZONE 'America/Sao_Paulo'` — testado isoladamente (12/08 21:49 → deriva `2026-08-12` corretamente). `GRANT` só pra `authenticated`/`service_role` (mesmo padrão de `lancar_transacao_manual`). Documentado como obrigatório em `docs/MANUAL_OPERACIONAL_AGENTES.md` (seção 1.1, linha da tabela de Energia solar) e sincronizado no Google Drive (`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` e `MANUAL_OPERACIONAL_AGENTES.md`, ambos sobrescritos, não cópias novas) — Claude Chat precisa usar essa RPC a partir de agora, nunca mais `INSERT` cru.

### 1.1 Instalação física do medidor — TROCA DE MODELO, só libera 25/08/2026
**Atualizado 15/08/2026 pelo usuário**: o medidor que chegou/foi instalado é o **modelo 313269**, que **não tem comunicação RS485** — inadequado pro que o domínio Solar precisa (integração Modbus/RS485 com o inversor SAJ, ver `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`). Usuário já encomendou o **modelo 313270** (com RS485), mas só libera/chega no dia **25/08/2026**. Toda a parte elétrica/física já está instalada — só falta trocar o medidor em si pelo modelo certo. **Não disparar a sondagem (`sondar_medidor_saj.yml`) nem investigar dado novo da API SAJ antes de 25/08** — não vai ter nada de RS485 pra achar com o 313269 instalado agora. Retomar essa frente só depois da troca.

### 1.2 Inbox Financeira — volume cresceu pra 211 (13 MP + 198 Pluggy), 55 processados nesta sessão, restam 144 Pluggy + 13 MP
O número "41" do redesenho de 14/08 estava desatualizado — o volume voltou a crescer (198 Pluggy pendentes, não 28). Investigado e processado nesta sessão (15/08), sem esperar pedido do usuário (regra 6 do manual — agente processa a fila sozinho):

1. **41 pares duplicados por sincronização multi-conta** — 2 conexões Pluggy diferentes (`wallace.termica@` e `wallace.servidor@`) sincronizam a MESMA conta Mercado Pago, então toda transação real aparece 2x com `descricao`/`valor`/`data` idênticos. Rejeitada a cópia extra de cada par (41 linhas), mantida 1 de cada. **⚠️ Isso é estrutural, vai continuar acontecendo a cada sync** — `arquivar_inbox_historico()` não detecta esse tipo de duplicata (só ciclo passado/já lançado); avaliar se vale ensinar a função a dedupli­car por `descricao+valor+data` entre contas do mesmo `banco='MeuPluggy'`.
2. **11 taxas de IOF <R$5** — resíduo mecânico de compra internacional já contabilizada no valor da compra, não é "transação esquecida". Rejeitadas.
3. **2 TEDs da Wärtsilä já lançadas** (R$340,00 de 06/08 = `TX000220`; R$6.682,76 de 13/08 = `TX000280`, ambas `confirmado` em `transacoes`) — rejeitadas como duplicata cross-source (Pluggy vê o extrato bancário, mas o lançamento já existe no ERP).

**Restam 144 Pluggy + 13 MP não processados** — inclui itens de maior valor (4 outras TEDs Wärtsilä sem correspondência 1:1 óbvia em `transacoes`, provavelmente os depósitos brutos de salário antes de serem splitados em múltiplos aportes; R$2.015,58 recorrente 3x; RAIA DROGASIL, MERCADOLIVRE, pagamentos de conta). **Não processados às cegas de propósito** — passaram por checagem de correspondência com `transacoes` e não bateram, então não são duplicata óbvia; precisam de revisão mais cuidadosa (contexto de qual caixa/o que representam), não uma faxina automática.

**Achado inicial descartado, esclarecido pelo usuário**: a TED Wärtsilä de R$340,00 (06/08, `TX000220`) é um reembolso DIFERENTE do que a pendência 1.4 rastreia — coincidência de valor, não é o mesmo evento. `TX000220` e `TX000280` (R$6.682,76) já estavam corretamente computados; a pendência de R$340,00 do ciclo 2026-07 (`reembolso_wartsila_ciclo.valor_a_receber`) continua real e sem relação com essas 2 TEDs. Não é inconsistência — `reembolso_wartsila_ciclo` está certo. Não reabrir essa dúvida.

### 1.2b 🔴 URGENTE — webhook Pluggy retornando 500 até o usuário configurar 1 secret no Supabase
Achado da auditoria (segredo hardcoded no código-fonte da Edge Function `pluggy-webhook`) corrigido — código trocado pra `Deno.env.get("PLUGGY_WEBHOOK_SECRET")`, deployado (`version: 2`), sem fallback hardcoded (fail-safe: recusa tudo com 500 se a env var não existir). **Efeito colateral esperado até o usuário agir**: o webhook está recusando toda requisição da Pluggy agora, porque a secret ainda não existe no Supabase.

**Ação pendente, só o usuário consegue fazer** (sem CLI/token de Management API disponível neste ambiente pra fazer por script): Supabase Dashboard → Project Settings → Edge Functions → `pluggy-webhook` → Manage secrets → adicionar `PLUGGY_WEBHOOK_SECRET` = `LjfvwItOK5e0K+gAT5iDJSFMgD2B+vbXCxddTNJukV8=` (MESMO valor que já estava hardcoded — não foi rotacionado, só movido de lugar, pra não precisar re-registrar o webhook na Pluggy).

### 1.3 Autor do `DELETE` que apagou a linha de `historico_relatorios` de julho — desconhecido, sem como recuperar
A investigação sênior desta sessão confirmou que a linha foi gravada de verdade e depois apagada por um `DELETE` real (corretamente filtrado por competência), mas não há nenhum log/rastro de quem/quando — a tabela nunca teve trigger de auditoria antes de hoje. **Não reabrir como investigação** — não há mais evidência a extrair. O trigger novo (`trg_audit_historico_relatorios`) garante que isso nunca mais fique sem rastro.

### 1.4 R$340,00 do ciclo Wärtsilä 2026-07 ainda não chegaram
Sem mudança — ainda não confirmado como recebido. **Confirmado pelo usuário 15/08/2026**: as 2 TEDs achadas na Inbox (`TX000220`/`TX000280`, ver 1.2) são reembolsos diferentes, já computados — não têm relação com esta pendência específica. Não confundir os dois de novo.

### 1.5 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente (não conferido nesta sessão).

### 1.6 Previsão de geração baseada em irradiância solar — sugerido, não implementado
Sem mudança — usuário ainda não decidiu se quer essa feature.

## 2. O que foi feito nesta sessão (15/08/2026, bloco 9)

Resumo executivo — detalhe completo em `docs/changelog/PASSAGEM_DE_TURNO.md`, bloco 9, e `docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md` seção 9.1:

1. Achado de metodologia no Wealth Score do WWI: sub-score `protecaoPatrimonial` era matematicamente idêntico a `endividamento` (mesma fórmula, passivos/ativoTotal) — dobrava o peso real da alavancagem pra 30% do score sem intenção documentada.
2. `protecaoPatrimonial` corrigido pra medir debt-to-equity (passivos/patrimônio líquido) — ângulo complementar ao `endividamento` (que continua passivos/ativoTotal, inalterado).
3. Corrigido nos dois motores — `src/relatorio/gerar-analise-financeira.js` (JS, botão manual) e `scripts/sync/wwi_gerar_relatorio_mensal.py` (job mensal) — pra não repetir o padrão de divergência JS×Python já visto e corrigido no bloco 8 (item "investimentos").

**Pendente**: ver item 1.0 acima — mudança ainda não commitada/pushada, esperando aviso ao usuário. Nenhum dado/Supabase envolvido, é lógica pura de cálculo.

Bloco 9 (correção Wealth Score) resumido acima na seção 1.0 (RESOLVIDO). Bloco 10 (auditoria de 43 especialistas) resumido nas seções 1.-2 e 1.-1 acima.

Sessão anterior (14/08/2026, bloco 8) resumida: procedimento de baixa de fatura, favicon mobile, crédito solar do link compartilhado, auditoria de 6 agentes (8 bugs reais corrigidos), recuperação de `historico_relatorios`, migração de constantes do Déficit Zero pro Supabase, redesenho da Inbox Financeira (~557→41 pendentes). Todo commitado (`80c96f9`+`5d22216`+`35e2069`) e publicado — detalhe completo em `PASSAGEM_DE_TURNO.md` bloco 8.

## 3. Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: é o Google Drive sincronizando `.git/` de novo (regra 6 acima) — rodar `find .git -iname desktop.ini -delete` antes de tentar de novo, não é bug de código.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. Retomar pela seção 1 — o item 1.0 (commit pendente do Wealth Score) e o 1.1 (instalação do DDSU666, hoje/15/08) são os mais urgentes.
6. **Sempre que "atualizar passagem de turno" for pedido**: checklist completa da seção 10 do `docs/MANUAL_OPERACIONAL_AGENTES.md`. Nesta sessão (bloco 9), a mudança é só metodologia de cálculo interna (fórmula já documentada como "v1, não fixa em pedra" na seção 4 do doc WWI) — não configura regra de negócio nova nem domínio V2 novo, então os documentos do Google Drive (`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`/`MANUAL_OPERACIONAL_AGENTES.md`) não precisaram de atualização.
