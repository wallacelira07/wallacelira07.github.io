# Automação do boleto de condomínio (Bellagio Residence) via Gmail (20/08/2026)

## Origem

Usuário mostrou print de um e-mail de aviso de vencimento (administradora "Nova Mais", plataforma Condomob) e pediu robô. Reaproveita a mesma infraestrutura Gmail já validada (Medintech/Energisa/Consórcio Porto), nenhuma credencial nova.

## Evidência real (Nível A — print real lido nesta sessão, 20/08/2026)

- Remetente: `condomob@email.condomob.net`, assunto "Bellagio Residence - Seu boleto vencera daqui a N dia(s)".
- Corpo **texto plano, sem PDF anexado** — mais simples que os outros robôs: `Unidade: C806`, `Vencimento: DD/MM/AAAA`, `Período: MM/AAAA`, `Valor: R$ X,XX`.
- Usuário confirmou o padrão de envio: normalmente 2 e-mails por mês — ~10-12 dias antes do vencimento e outro sempre no dia 9 (1 dia antes, vencimento é dia 10).

## Erro real cometido e corrigido na mesma sessão

1ª versão do robô gravava o valor literal do campo "Valor:" do e-mail (R$220,00) direto em `cronograma_boletos_fixos.TXB000002`, substituindo o R$210,00 já cadastrado. **O usuário corrigiu na hora**: R$210,00 estava certo — é o valor pago com desconto de pontualidade; o e-mail mostra sempre o valor NOMINAL (sem desconto). Confirmado: o desconto é **R$10,00 fixo** todo mês. Corrigido antes de qualquer commit — o parser agora subtrai `_DESCONTO_PONTUALIDADE` (constante, R$10,00) do valor extraído antes de gravar.

**Lição pra próximas automações de boleto**: nunca assumir que "o valor que aparece no e-mail/PDF" é o valor final pago — conferir sempre se existe desconto/encargo condicional (pontualidade, antecipação, etc.) antes de deixar um robô gravar automático.

## Arquitetura implementada

- [`scripts/sync/atualizar_boleto_condominio.py`](../../scripts/sync/atualizar_boleto_condominio.py) — busca e-mails de `condomob@email.condomob.net`, extrai valor nominal do corpo (texto plano, sem PDF), subtrai o desconto fixo, `PATCH cronograma_boletos_fixos.TXB000002` (idempotente).
- Encaixado no mesmo workflow `atualizar_boletos_medintech.yml` que já roda Energisa/Medintech/Consórcio Porto (mesmo pedido do usuário "não pode usar o mesmo?" já aplicado ao Consórcio Porto) — **zero configuração nova no cron-job.org**.

## Pendências reais (ação do usuário, fora do meu alcance)

1. **Nenhuma credencial nova, nenhuma tarefa nova no cron-job.org** — reaproveita tudo que já existe.
2. Se o desconto de pontualidade mudar de valor um dia (reajuste da administradora), avisar pra eu atualizar `_DESCONTO_PONTUALIDADE` no script — não é algo que o robô consegue descobrir sozinho pelo e-mail.
