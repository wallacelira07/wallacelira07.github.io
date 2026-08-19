# Automação da virada de ciclo financeiro (19/08/2026)

## Contexto

Até 19/08/2026, "fechar o ciclo financeiro" (virada do dia 25) era 100% manual: alguém tinha que
editar `VARS.CICLO_SNAPSHOTS`/a linha correspondente em `ciclos_financeiros_snapshots` (Supabase),
marcar `fechado: true`, congelar ~15 campos (Necessidade Total, saldo da Caixa Variável, faturas de
cartão, 4 Livros Razão inteiros) e criar a linha do ciclo novo. Investigação confirmou (2 agentes,
19/08/2026): não existia NENHUM gatilho automático — `VARS.cicloAtual` era um literal fixo no
código, nenhum robô escrevia `fechado=true` em lugar nenhum.

O usuário pediu a automação de verdade: disparar sozinho à meia-noite (horário de Brasília) do dia
25, sempre fixo (confirmado explicitamente: não segue a data de recebimento do salário, que às
vezes cai dia 23/24).

## Por que não é um script Python simples

Todos os outros robôs deste projeto (faturas, medidores, cotações) são Python simples: buscam um
dado externo, calculam pouco, gravam. "Fechar o ciclo" é diferente — os ~15 campos que precisam ser
congelados (`necessidadeTotalBruta`, `caixaVariavelSaldoReal`, faturas Visa/Mastercard/MP, os 4
Livros Razão) só existem DEPOIS de rodar centenas de linhas de fórmula financeira em `app.js` /
`promocoes-financeengine.js` / `recalcular-necessidade.js`, em cima de dado que só é lido com sessão
autenticada (RLS). Reimplementar essa fórmula em Python duplicaria lógica financeira crítica em 2
lugares — o próprio projeto já registra 1 caso real desse risco se materializando (bug "teto de
disponibilidade" do Solar, achado quando o gate V1×V2 ainda existia).

**Decisão**: em vez de duplicar fórmula, o robô (`scripts/sync/fechar_ciclo_financeiro.mjs`, Node +
Playwright) abre o PRÓPRIO site num navegador headless, loga de verdade (mesmo formulário de
email/senha que qualquer humano usa), espera o JS real do site terminar de calcular tudo
(`performance.mark('wallace-boot-complete')`, já existente no boot), e só então LÊ o resultado
(`window.REG`/`window.VARS`) pra gravar o retrato congelado. Zero fórmula reimplementada.

## Peças construídas

1. **RPC `fechar_ciclo_financeiro(p_novo_ciclo_key, p_novo_label, p_novo_periodo, p_snapshot)`**
   (Supabase, migration `criar_rpc_fechar_ciclo_financeiro`) — mesmo padrão de autenticação/segurança
   de `fechar_ciclo_solar` (login Firebase válido OU `service_role`). Acha o ciclo com `fechado=false`
   (deve haver exatamente 1), grava nele os campos do snapshot recebido, marca `fechado=true`, e
   insere a linha do ciclo novo (`fechado=false`, só metadado — o ciclo aberto sempre lê valor VIVO,
   nunca do snapshot, ver `aplicarCicloAoVARS` em `app.js`). Recusa rodar se já existir uma linha pro
   `ciclo_key` novo (idempotência — dispara 2x no mesmo dia falha alto, nunca duplica/corrompe
   silenciosamente).

2. **`scripts/sync/fechar_ciclo_financeiro.mjs`** — login via Playwright só serve pra fazer o site
   calcular os números reais (a leitura de `transacoes` exige sessão). A GRAVAÇÃO (chamada da RPC)
   usa a chave `service_role` (`SUPABASE_KEY`, mesma já usada por `wwi_gerar_relatorio_mensal.py`),
   não o login — dá pra girar a senha de login sem quebrar a gravação, e vice-versa. Suporta
   `DRY_RUN=true` (loga, calcula, imprime o payload, NUNCA grava) — usar isso no primeiro teste.

3. **`.github/workflows/fechar_ciclo_financeiro.yml`** — mesmo padrão dos outros workflows deste
   repo: **sem** `schedule:` nativo (documentado nos outros workflows como "nunca disparou sozinho
   neste repo"), só `workflow_dispatch`/`workflow_call`. Disparo real precisa ser externo
   (cron-job.org → API do GitHub `workflow_dispatch`), mesmo padrão já usado pelo relatório WWI.

4. **`vars-ciclo-snapshots.js`** — corrigido bug relacionado: `VARS.cicloAtual` era um literal fixo
   mesmo no caminho "V2" (sempre `'2026-07'`, nunca acompanhava sozinho um ciclo novo aberto pela
   RPC). Agora deriva da própria linha com `fechado=false` — invariante já garantida pelo banco.

## O que o usuário ainda precisa fazer (fora do alcance de um agente)

1. **Criar 2 secrets novos no GitHub** (Settings → Secrets and variables → Actions):
   `WALLACE_LOGIN_EMAIL` e `WALLACE_LOGIN_PASSWORD` — o mesmo login usado no painel. (`SUPABASE_URL`/
   `SUPABASE_KEY` já existem, reaproveitados dos outros robôs.)
2. **Testar primeiro com `DRY_RUN=true`** disparando o workflow manualmente (aba Actions →
   "Fechar Ciclo Financeiro" → Run workflow → dry_run=true) e conferir se o payload impresso no log
   bate com o que o painel mostra ao vivo. **Não confiar no robô rodando sozinho sem esse teste.**
3. **Criar a tarefa no cron-job.org** (mesmo padrão dos outros: URL da API do GitHub
   `workflow_dispatch` deste workflow, reaproveitando o token já configurado), agendada pra ~00:01
   (horário de Brasília) do dia 25 de cada mês.

## Limitação conhecida, registrada de propósito

`mastercardBlackPessoalCongelado` fica sempre `null` no snapshot automático — não foi encontrada uma
fonte viva equivalente e confiável em `VARS`/`REG` hoje (o valor histórico em
`vars-ciclo-snapshots.js` parece ter sido definido manualmente num congelamento artificial passado,
não deriva de uma fórmula ao vivo clara). Revisar manualmente esse campo específico depois do
primeiro fechamento automático real, e decidir a fonte certa antes de confiar nele cegamente.
