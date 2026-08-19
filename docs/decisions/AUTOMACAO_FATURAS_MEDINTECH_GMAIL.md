# Automação das faturas de consumo via Gmail — Água/Gás Medintech + Energia Energisa (19/08/2026)

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

## Escopo — só resolve 3 dos 11 boletos fixos

Água, Gás (Medintech) e Energia (Energisa) são os únicos 3 dos 11 boletos que são contas de consumo variável — os outros 8 (financiamento, condomínio, curso, seguro, consórcios) são valores fixos que mudam raramente e continuam cadastrados manualmente. Isso não é uma limitação a resolver — é o escopo certo: automatizar só o que realmente varia todo mês.

## Extensão 19/08/2026 — Energia (Energisa Paraíba, TXB000009) — INCOMPLETA, com 1 erro real corrigido a tempo

Mesmo dia, mesmo padrão. Usuário ativou o envio de fatura por e-mail da Energisa nesta sessão e mandou exemplos de PDF pra validar antes de codar (mesma disciplina da Medintech — nunca construir parser às cegas). Esta extensão teve 2 rodadas de correção real — registradas as duas, sem esconder a que deu errado.

**1ª rodada (errada, revertida na mesma sessão)**: o 2º PDF de exemplo (agosto/2026, pedido como 2ª via manual via `sistemas_siatt@energisa.com.br`) tinha "WALLACE PATRICK GALDINO LIRA" e o CPF dele (096.396.684-78) no campo **PAGADOR** — pareceu, na hora, ser a fatura dele. Escrevi `TXB000009 = R$56,11` no Supabase com base nisso e no método de extração (linha digitável Febraban) validado corretamente (`...15520000005611` → R$56,11, bate com "VALOR DO DOCUMENTO"). **O usuário corrigiu logo em seguida: essa fatura é da CASA DA MÃE — o Wallace aparece como PAGADOR/titular dela também (arranjo familiar), então CPF do PAGADOR não prova "é a conta dele", só prova "ele paga essa conta"**. Revertido no Supabase pro valor anterior (R$367,36) na mesma sessão, antes de qualquer commit.

**2ª rodada (correção real)**: o identificador correto é o **Número da UC** (unidade consumidora) — campo sempre presente e claramente rotulado em toda fatura Energisa (confirmado pelo usuário com print real, card próprio "Número da UC"), e cada UC corresponde a exatamente 1 imóvel/ligação física, nunca compartilhado entre pessoas (diferente do CPF do PAGADOR). `_texto_confirma_wallace()` reescrita pra checar a UC do Wallace, não mais o CPF ancorado em "PAGADOR". Testado contra o mesmo PDF (fatura da mãe): agora retorna `False` corretamente (antes, com o método antigo, retornava `True` — o próprio bug confirmado e corrigido).

**Estado real ao fim desta sessão — automação de Energia AINDA NÃO validada de ponta a ponta**:
- UC da mãe: `573.702.053-77` (confirmada, já vista em PDF real — usada só pra provar que a validação rejeita corretamente).
- UC da irmã: `2.064.202.053-60` (informada pelo usuário, nunca vista em PDF).
- UC do Wallace: `1.994.775.053-05` (informada pelo usuário — **Nível C, ainda não confirmada contra um PDF real**, porque a fatura dele deste ciclo ainda não foi emitida). O script já está configurado pra validar por essa UC, mas **nunca foi testado contra uma fatura real do próprio Wallace** — só contra a da mãe (validando corretamente que ela é rejeitada).
- `cronograma_boletos_fixos.TXB000009` continua em R$367,36 (valor antigo, não confirmado — só não foi substituído por um valor errado).

**Pendência real que falta pra fechar isso**: quando a fatura do próprio Wallace for emitida (ele ainda não sabe quando — "minha conta não foi emitida ainda"), mandar o PDF real pra confirmar que a UC `1.994.775.053-05` aparece exatamente como esperado no texto extraído, e só então considerar essa parte da automação validada.

**Diferença de robustez em relação à Medintech**: como o remetente exato do envio automático mensal da Energisa ainda não foi confirmado (o serviço foi ativado nesta mesma sessão, "a partir da próxima fatura" — os PDFs vistos até agora vieram de 2ª via manual), a busca é por **domínio inteiro** (`from:@energisa.com.br has:attachment`) em vez de um remetente único — mais frouxa na busca, compensada pela validação por UC antes de aceitar qualquer valor. Revisitar o remetente exato quando a 1ª fatura automática (não 2ª via) do Wallace chegar de verdade.
