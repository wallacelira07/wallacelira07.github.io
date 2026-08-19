# Automação das faturas Água/Gás Medintech via Gmail (19/08/2026)

## Origem

Sequência: (1) achado que `totalOpBoletos` não vinha do Supabase → corrigido pra derivar de `cronograma_boletos_fixos`; (2) usuário perguntou como automatizar a captura dos boletos; (3) pesquisa de DDA (2 agentes) confirmou que **não existe API de DDA acessível a pessoa física** em nenhum provedor investigado (Pluggy, Open Finance oficial, CIP, Celcoin, BTG Empresas, TecnoSpeed, QI Tech, Kobana — todos exigem CNPJ/credenciamento institucional); (4) usuário conectou Gmail nesta sessão via MCP, permitindo verificar a alternativa real: parsing de e-mail.

## Evidência real (Nível A — e-mails e PDFs lidos nesta sessão, 19/08/2026)

- `sistemas@bzs.com.br` manda 1 e-mail por mês por conta (753=Água, 1024=Gás), assunto `"A tarifa referente ao mês de [mês] de [ano] chegou - Conta: [753/1024]"`, sempre entre os dias 19-22.
- Valor **nunca** aparece no corpo do e-mail — só no PDF anexado.
- PDFs são texto nativo (não scan/imagem) — extraíveis sem OCR.
- **Achado de drift real**: fatura de julho/2026 mostrou Água R$152,16 (cadastro tinha R$133,41) e Gás R$36,70 (cadastro tinha R$30,28) — corrigido no Supabase na mesma sessão, com o PDF como evidência.

## Método de extração escolhido: linha digitável (Febraban), não regex de layout

O valor é decodificado do 5º campo da linha digitável do boleto (14 dígitos: 4 de fator de vencimento + 10 de valor em centavos) — formato regulado e estável, imune a mudanças visuais que a Medintech fizer no PDF. Confirmado contra os 2 PDFs reais: `...15340000015216` → últimos 10 dígitos `0000015216` = R$152,16 (bate exato com "VALOR TOTAL" impresso).

## Arquitetura implementada

- [`scripts/sync/atualizar_boletos_medintech.py`](../../scripts/sync/atualizar_boletos_medintech.py) — Gmail API (OAuth refresh_token) busca e-mails recentes de `sistemas@bzs.com.br`, baixa PDF anexado, extrai valor via linha digitável, `PATCH cronograma_boletos_fixos` (idempotente — só escreve se o valor mudou).
- [`.github/workflows/atualizar_boletos_medintech.yml`](../../.github/workflows/atualizar_boletos_medintech.yml) — mesmo padrão dos outros robôs (`workflow_dispatch`+`workflow_call`, sem `schedule` — confirmado que não dispara sozinho neste repo).
- [`scripts/setup/gerar_refresh_token_gmail.py`](../../scripts/setup/gerar_refresh_token_gmail.py) — script de uso único (roda local, não no GitHub Actions) pra gerar o `refresh_token` de longa duração.

## Pendências reais (ação do usuário, fora do meu alcance)

1. Criar projeto no Google Cloud Console + habilitar Gmail API + gerar credenciais OAuth (tipo "App para computador") — ver instruções no topo de `gerar_refresh_token_gmail.py`.
2. Rodar `gerar_refresh_token_gmail.py` localmente (`pip install google-auth-oauthlib` primeiro) — gera os 3 valores.
3. Cadastrar 3 Secrets novos no GitHub (Settings → Secrets and variables → Actions): `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.
4. Criar tarefa dedicada no cron-job.org (mesmo padrão dos outros robôs — URL da API do GitHub `workflow_dispatch` pro workflow `atualizar_boletos_medintech.yml`), rodando a cada poucos dias (o robô é idempotente, sem risco de rodar demais).
5. Depois de confirmar rodando sozinho por um tempo: adicionar `boletos_medintech` em `SAUDE_JOBS_LIMIARES` (`hydrate-saude-operacional.js`) — mesmo cuidado já documentado pro medidor Tuya da Wellida, evita alarme falso "nunca rodou" antes do 1º sucesso real.

## Escopo — só resolve 2 dos 11 boletos fixos

Água e Gás (Medintech) são os únicos 2 dos 11 boletos que são contas de consumo variável — os outros 9 (financiamento, condomínio, curso, seguro, etc.) são valores fixos que mudam raramente e continuam cadastrados manualmente. Isso não é uma limitação a resolver — é o escopo certo: automatizar só o que realmente varia todo mês.
