# Automação dos extratos de consórcio Porto Seguro via Gmail (20/08/2026)

## Origem

Usuário pediu um robô pra pegar no e-mail os extratos dos consórcios. Reaproveita 100% da infraestrutura já validada em [`AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md`](AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md) (Gmail API OAuth já configurada, mesmos Secrets do GitHub) — nenhuma credencial nova precisou ser criada.

## Evidência real (Nível A — 2 PDFs reais lidos e testados nesta sessão, 20/08/2026)

- Remetente: `comunicacao@novidades.portobank.com.br` (confirmado pelo usuário).
- Documento: "Extrato do Consorciado" (Porto Seguro Administradora de Consórcios Ltda).
- 2 consórcios reais testados: Grupo `I0464`/Cota `0012-00` (Casa Nova, valor R$1.449,45 — já batia com o cadastro) e Grupo `AF316`/Cota `0346-00` (Carro — **achou drift real**: cadastro tinha R$501,32, valor real da última parcela paga é R$501,15, a diferença é correção/reajuste mensal normal do consórcio).
- Parser testado direto (`_extrair_grupo_cota`/`_extrair_valor_contribuicao_mensal`) contra os 2 PDFs reais, bateu exato nos dois.

## Método de extração

- **Identificação**: por `Grupo`+`Cota` (rótulo `Grupo: XXXXX Cota: NNNN-NN`, único por contrato, nunca muda) — não por nome do bem ("IMOVEL"/"AUTOMOVEL" é ambíguo, não diz qual consórcio específico).
- **Valor**: a 1ª linha `RECBTO. PARCELA` da seção "Conta Corrente" (extrato lista em ordem decrescente, confirmado nos 2 PDFs — a parcela mais recente aparece primeiro), coluna "Valor a Pagar". **Não** usa o campo "Valor Contrib. Mensal" da seção "Percentuais" — esse é o valor do plano original na venda, não a parcela atual já corrigida (achado real: no Carro, esse campo mostra R$500,98, mas a parcela realmente paga em 18/08 foi R$501,15 — são conceitos diferentes).

## Destino: `cronograma_boletos_fixos`, não `cronograma_consorcios`

Achado ao investigar antes de codar: `cronograma_consorcios` tem as 2 linhas (`TXCON000001`/`TXCON000002`) com `ativo=false` — tabela desativada desde que os consórcios migraram do Mastercard Black pra pagamento em dinheiro (11/08/2026, ver `hydrate-onda9-livros-fixos.js`) — e não é mais lida pelo painel em lugar nenhum. `cronograma_boletos_fixos` é a fonte viva hoje, reaproveitando os mesmos `tx_legado` (`TXCON000001`=Carro, `TXCON000002`=Casa Nova) na migração.

## Arquitetura implementada

- [`scripts/sync/atualizar_consorcio_porto.py`](../../scripts/sync/atualizar_consorcio_porto.py) — Gmail API (mesmo `refresh_token` da Medintech/Energisa), busca e-mails de `comunicacao@novidades.portobank.com.br`, baixa PDF anexado, extrai Grupo+Cota e valor da última parcela, `PATCH cronograma_boletos_fixos` (idempotente).
- [`.github/workflows/atualizar_consorcio_porto.yml`](../../.github/workflows/atualizar_consorcio_porto.yml) — mesmo padrão dos outros robôs (`workflow_dispatch`+`workflow_call`, sem `schedule`, roda solto — não entra na cadeia do `executar_tudo.yml`, mesmo tratamento já dado ao robô de boletos_medintech).

## Pendências reais (ação do usuário, fora do meu alcance)

1. **Nenhuma credencial nova** — reaproveita os Secrets já cadastrados (`GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN`/`SUPABASE_URL`/`SUPABASE_KEY`).
2. **Nenhuma tarefa nova no cron-job.org** (pedido do usuário: "não pode usar o mesmo?") — o passo `python3 scripts/sync/atualizar_consorcio_porto.py` foi encaixado dentro do workflow `atualizar_boletos_medintech.yml`, que já roda 1x/dia às 12h via a tarefa existente do cron-job.org ("Atualizar Faturas Energia (Energisa) e Água/Gás (Medintech) - 12hs"). Zero configuração nova. `atualizar_consorcio_porto.yml` continua existindo separado só pra permitir rodar/testar o robô do consórcio sozinho pela aba Actions, se precisar.
3. **Assunto do e-mail automático ainda não confirmado**: os 2 PDFs usados pra validar este parser vieram de um encaminhamento manual do usuário, não de um e-mail automático visto diretamente. A busca hoje é só por remetente + anexo (mais frouxa), compensada pela identificação por Grupo+Cota antes de aceitar qualquer valor. Revisitar se um dia o remetente automático real for diferente do usado aqui.
4. Depois de confirmar rodando sozinho por um tempo: adicionar `consorcio_porto` em `SAUDE_JOBS_LIMIARES` (`hydrate-saude-operacional.js`), mesmo cuidado documentado pros outros robôs novos — evita alarme falso "nunca rodou" antes do 1º sucesso real.

## Escopo — só os 2 consórcios Porto, não os 24 itens de "PARCELAMENTOS_*"

Este robô resolve especificamente os extratos de consórcio (Carro + Casa Nova), que têm sua própria lógica de correção mensal e formato de documento. As parcelas de cartão (`PARCELAMENTOS_VISA`/`PARCELAMENTOS_MP`/`PARCELAMENTOS_TERCEIROS`) já têm sua própria automação de avanço via `pg_cron` (ver `docs/changelog/ESTADO_ATUAL.md`, seção de 20/08/2026) — mecanismos diferentes, não confundir.
