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

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.0 Correção do Wealth Score (`protecaoPatrimonial`) — RESOLVIDO
Commitado e publicado (`7d80c59`), autorizado pelo usuário. Não reabrir.

### 1.-2 🔴 2 achados de segurança real da auditoria — RESOLVIDOS 15/08/2026
`public.wwi_upsert_relatorio_mensal` (REVOKE de PUBLIC/anon/authenticated) e `public.wallace_dados` (policy de SELECT trocada pra `service_role`, mesmo padrão das policies de escrita). Aplicado direto via migration Supabase (MCP), confirmado sem consumidor legítimo quebrado (únicos leitores reais eram jobs Python já usando a chave service_role). Detalhe em `docs/decisions/AUDITORIA_MULTIDISCIPLINAR_15082026.md`, tabela de status. Não reabrir.

### 1.-1 Auditoria multidisciplinar completa (43 especialistas) — 207 achados, resolvendo 1 por 1
Rodada via `Workflow` a pedido do usuário ("equipe de agentes especialistas... escopo livre"), fase somente-leitura. Relatório completo em `docs/decisions/AUDITORIA_MULTIDISCIPLINAR_15082026.md`, com tabela de status no topo sendo atualizada conforme cada item é resolvido/descartado. 2 achados já descartados como falso-positivo pelo usuário (cadência SAJ intencional, "duplicata" Anthropic não é duplicata) — não reabrir nenhum dos dois.

**19 itens resolvidos** (usuário deu autonomia total pra continuar): 2 críticos de segurança (RPC/`wallace_dados`), XSS parcial (3 arquivos), constraint de banco pro cartão, CI dos testes unitários, Wealth Score Python (2 sub-scores implementados, sem reprocessar histórico), guard `patrimonioLiquido > 0`, e os 12 quick wins do relatório (robots.txt, acessibilidade, favicon, RPC guard, ORDER BY determinístico, retry/backoff Pluggy). Tudo commitado e publicado. Só restam as "Melhorias de médio prazo" da seção 4 do relatório (nenhuma urgente) e o item de reprocessamento retroativo do histórico do WWI (decisão do usuário, não meramente técnico).

### 1.0b NA FILA — Leitura solar 14/08 (casa "mae") bloqueada pelo trigger de plausibilidade, pergunta do Claude Chat
Recebida via mensagem do usuário (encaminhando pergunta pronta de uma sessão de Claude Chat), ainda NÃO respondida/decidida — só registrada aqui pra não perder o contexto.

Tentativa de `INSERT` em `energia_solar_leituras`: `casa='mae'`, `data='2026-08-14'`, `leitura_03=90` (13/08 era 81), `leitura_103=527` (13/08 era 477). Confirmado por 2 fotos reais do medidor enviadas pelo usuário — não é erro de digitação. Bloqueado por `validar_plausibilidade_leitura_solar()`: delta do dia (8,0 kWh código 03 / 50,0 kWh código 103) excede o teto fixo de `TETO_KWH_DIA = 40`, sem nenhum mecanismo de override.

Perguntas em aberto (do Claude Chat, repassadas pelo usuário):
1. O teto de 40 kWh/dia está certo pro código 103 (injetada), ou devia ser diferenciado por código (03 vs 103 podem ter perfis de geração bem diferentes)?
2. Há motivo plausível pra um salto de 50 kWh/dia num único dia (dia de sol forte) ou ainda desconfia de erro de leitura mesmo com foto?
3. Vale adicionar um mecanismo de override documentado (ex: coluna `confirmado_apesar_do_teto boolean`) pra quando há evidência fotográfica real, em vez de só endurecer o teto?

Se a decisão for gravar direto: `casa='mae'`, `data='2026-08-14'`, `leitura_03=90`, `leitura_103=527`, `eh_leitura_oficial_energisa=false`. **Não gravado ainda** — aguardando decisão do usuário sobre as 3 perguntas acima antes de tocar no trigger ou inserir a leitura.

### 1.1 Instalação física do medidor DDSU666 — hoje é 15/08/2026, dia da instalação (Casa da Mãe)
Fase 1 (sondagem, só leitura) está pronta: `scripts/sync/sondar_medidor_saj.py` + workflow `sondar_medidor_saj.yml` (disparo manual via GitHub Actions, do celular). **Se já é 15/08 ou depois quando esta sessão for lida**: confirmar se a sondagem já foi disparada e o que ela retornou antes de qualquer outra coisa relacionada a Solar. Detalhe completo em `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`.

### 1.2 41 itens ainda pendentes na Inbox Financeira (baixo risco, não urgente)
Depois do redesenho desta sessão (ver regra 12 acima e `docs/decisions/INBOX_FINANCEIRA_REDESIGN_FILTROS.md`), sobraram 41 itens (13 `mercadopago_eventos` + 28 Pluggy) sem match automático — ruído de sincronização de baixo valor (IOF <R$5, arredondamentos, duplicatas no mesmo timestamp). Não verificados individualmente. Só revisar se o usuário pedir ou se o volume voltar a crescer.

### 1.3 Autor do `DELETE` que apagou a linha de `historico_relatorios` de julho — desconhecido, sem como recuperar
A investigação sênior desta sessão confirmou que a linha foi gravada de verdade e depois apagada por um `DELETE` real (corretamente filtrado por competência), mas não há nenhum log/rastro de quem/quando — a tabela nunca teve trigger de auditoria antes de hoje. **Não reabrir como investigação** — não há mais evidência a extrair. O trigger novo (`trg_audit_historico_relatorios`) garante que isso nunca mais fique sem rastro.

### 1.4 R$340,00 do ciclo Wärtsilä 2026-07 ainda não chegaram
Sem mudança nesta sessão — ainda não confirmado como recebido.

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
