# Tarefas Agendadas — cron-job.org (registrado 21/08/2026)

**Contexto:** cron-job.org é um serviço externo, sem MCP/conector disponível para nenhum agente Claude. Nenhum agente (Chat ou Code) tem visibilidade automática desta configuração — este documento existe justamente para cobrir essa lacuna, registrado manualmente a partir de prints reais enviados pelo usuário (Nível C — confirmar contra o painel ao vivo se precisar de certeza total, a config pode mudar sem que este documento seja atualizado).

Todas as tarefas apontam para `https://api.github.com/repos/wallacelira07/wallac...` (workflow_dispatch de um repositório GitHub) — o cron-job.org é só o gatilho de horário; a lógica real está nos workflows do repositório.

## Lista completa (12 jobs, confirmados por print 21/08/2026)

| Job | Frequência |
|---|---|
| Dividendos | 1x por dia |
| WWI - Relatório Mensal | Mensal |
| Atualizar Faturas Energia (Energisa), Água/Gás (Medintech) e Mastercard Black (Itaú) | 08h, 14h, 20h |
| Ações Abertura | A cada 1 hora |
| Atualizar Cotações de Opções (PETR4) | A cada 1 hora |
| SAJ Manhã | A cada 10 minutos |
| Medidor do Apartamento | A cada 10 minutos |
| Medidor de Wellida | A cada 10 minutos |
| Backup Externo | — (frequência não visível no print) |
| Mercado Pago | A cada 10 minutos |
| Pluggy | A cada 10 minutos |
| Verificação de Segurança - Views | — (frequência não visível no print) |

## Observações

- **Atualizar Faturas Energia/Água/Gás/Mastercard** (08/14/20h): é o robô descrito em `AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md` — cobre `cronograma_boletos_fixos` (TXB000004 Água, TXB000005 Gás, TXB000009 Energia). Ampliado 22/08/2026 com `scripts/sync/atualizar_fatura_itau_mb.py` (fatura do Mastercard Black, Itaú Personnalité) — atualiza `indicadores.cartaoMBTotal`, workflow `atualizar_boletos_medintech.yml` (nome de exibição atualizado nesta mesma data, arquivo continua igual). Renomeada pelo usuário no cron-job.org, 22/08/2026, pro nome exato: "Atualizar Faturas Energia (Energisa), Água/Gás (Medintech) e Mastercard Black (Itaú) - 08, 14 e 20hs".
- **SAJ Manhã**: nome sugere robô ligado a `atualizar_geracao_saj.py`, mas a documentação desse script cita execução 2x/dia (09h/17h) via GitHub Actions `schedule` nativo — não fica claro se este job do cron-job.org é redundante/complementar a esse agendamento nativo ou se é a fonte real do disparo. Vale confirmar com o usuário ou Claude Code.
- **Medidor do Apartamento / Medidor de Wellida** (10 em 10 min): provavelmente ligados aos medidores Tuya mencionados em outras decisões (Wellida) — não confirmado contra código real nesta sessão.
- **Backup Externo** e **Verificação de Segurança - Views**: sem mais contexto disponível; frequência não capturada no print.

## Manutenção

Se a configuração no cron-job.org mudar (job novo, horário alterado, job removido), este documento **não atualiza sozinho** — precisa de novo print/registro manual. Não tratar como fonte viva automática.
