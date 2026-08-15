# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 14/08/2026, sessão longa (bloco 8). Resumo: correção de favicon mobile desatualizado, correção de crédito solar dessincronizado no link de compartilhamento, **auditoria completa do site (1 agente por aba)** que achou e corrigiu 8 bugs reais (Balanço, Livros Razão, Emagrecimento, WWI), decisões do usuário sobre Caixa Lance no WWI e eliminação de constantes hardcoded, investigação sênior que recuperou uma linha perdida de `historico_relatorios` com causa raiz real identificada, e **redesenho completo da Inbox Financeira** (de ~557 pendentes reais pra 41, com filtro automático rodando sozinho daqui pra frente).

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

## 2. O que foi feito nesta sessão (14/08/2026, bloco 8)

Resumo executivo — detalhe passo a passo completo em `docs/changelog/PASSAGEM_DE_TURNO.md`, bloco 8:

1. Procedimento de baixa da fatura do cartão decidido (fecha pendência do bloco 7).
2. Medidor DDSU666 Fase 1 preparada (commit `147a5eb`, sessão anterior a este bloco).
3. Favicon mobile desatualizado corrigido (PNGs regenerados a partir do SVG atual).
4. Crédito solar do link de compartilhamento corrigido (Fluxo 2 projetado igual ao painel privado) — commit `5d22216`.
5. Auditoria completa (6 agentes, 1 por aba) achou e corrigiu 8 bugs reais: `passivoFinanciamentoCasa` desatualizado, RPC `rpc_dashboard_resumo` zerando patrimônio, selo "✓ confirmado" incondicional, Emagrecimento sem bloco de Comprometido/Disponível, contador de LR travado, rodapé de LR sem rótulo, Caixa Lance faltando no WWI, `metas.valor_atual` órfã.
6. `historico_relatorios` vazia investigada a fundo (causa raiz real: `DELETE` sem rastro) e recuperada com dado revalidado do zero.
7. Constantes do "Déficit Zero" migradas pro Supabase (nenhum hardcode financeiro novo daqui pra frente).
8. Inbox Financeira redesenhada — filtro automático de ciclo passado/duplicata, rodando sozinho a cada sincronização. ~557 pendentes reais → 41.

Todo o código desta sessão está commitado (`80c96f9` + `5d22216` + `35e2069`, todos com merge do bump automático de `__V`) e publicado em produção. Migrations do Supabase já aplicadas em produção (não passam por commit git).

## 3. Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: é o Google Drive sincronizando `.git/` de novo (regra 6 acima) — rodar `find .git -iname desktop.ini -delete` antes de tentar de novo, não é bug de código.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. Retomar pela seção 1 — o item com data mais urgente é 1.1 (instalação do DDSU666, hoje/15/08).
6. **Sempre que "atualizar passagem de turno" for pedido**: checklist completa da seção 10 do `docs/MANUAL_OPERACIONAL_AGENTES.md`. Nesta sessão, os 2 documentos do Google Drive (`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` e `MANUAL_OPERACIONAL_AGENTES.md`) foram sincronizados com todas as regras novas (fatura, Déficit Zero no Supabase, Caixa Lance no WWI, Inbox auto-filtrada).
