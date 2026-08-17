# Integração do medidor de energia via Smart Life (Tuya) — Fase 1 preparada, aguardando ação do usuário

**Status: FASE 1 PREPARADA, NÃO EXECUTADA (17/08/2026).** Pedido do usuário: trazer pro site os dados de um medidor de energia (voltagem/corrente/potência/kWh acumulado) hoje visível só no app Smart Life. **Confirmado explicitamente: é um aparelho diferente do DDSU666** da usina solar (que já tem plano próprio, ver `EVOLUCAO_SOLAR_MEDIDOR_SAJ.md` — não confundir os dois).

## 1. Trade-off pesquisado (por que não é imediato)

Não existe caminho 100% grátis-pra-sempre que também rode em nuvem (GitHub Actions, igual todos os outros robôs deste sistema):

| Caminho | Custo | Onde roda | Decisão |
|---|---|---|---|
| **Tuya Cloud API** (`tinytuya.Cloud`, modo cloud) | Grátis via "IoT Core Trial Edition" — precisa ser renovada periodicamente pelo próprio usuário no painel da Tuya (ação humana, não automatizável; sem isso, a chamada passa a falhar) | GitHub Actions, igual ao resto do sistema | **ESCOLHIDO** |
| **TinyTuya modo LAN local** | Grátis pra sempre, sem depender da Tuya nenhuma vez | Precisa de algo sempre ligado na rede Wi-Fi de casa (PC ou Raspberry Pi) — GitHub Actions não alcança a rede local | Descartado (mesmo problema de hospedagem que cancelou o projeto WhatsApp/Telegram — ver `feedback_agente_mensageria_cancelado` na memória) |

Perguntei ao usuário qual preferia; resposta foi "sem preferência", seguida de "dê um jeito de fazer" — interpretado como: seguir pelo caminho que roda igual ao resto do sistema (nuvem), aceitando a manutenção periódica de renovar o trial.

## 2. O que fica de responsabilidade do usuário (não é algo que um agente consegue fazer)

Um agente de IA não tem como criar contas de terceiros em nome do usuário nem escanear QR code pelo celular dele. Passo a passo completo está no cabeçalho de `scripts/sync/sondar_medidor_tuya.py`, resumo:

1. Criar conta grátis em https://iot.tuya.com (separada da conta do app Smart Life).
2. Criar um Cloud Project (Cloud > Development > Create Cloud Project).
3. Vincular o app: dentro do projeto, "Devices" > "Link Tuya App Account" > escanear QR pela aba Perfil/Me do Smart Life.
4. Assinar (grátis) o serviço "IoT Core" — Trial Edition.
5. Anotar: Access ID, Access Secret, Device ID do medidor específico.
6. Cadastrar 3 (ou 4) Secrets no repositório GitHub: `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_DEVICE_ID` (e `TUYA_API_REGION` se a região "us-e" não funcionar — ver nota abaixo).

**Manutenção recorrente esperada**: a Trial Edition do IoT Core precisa ser renovada de tempos em tempos (a documentação da própria Tuya não é clara sobre o prazo exato — relatos de comunidade variam entre 1 e 6 meses). Quando isso acontecer, o robô passa a falhar e isso vai aparecer no painel "Saúde Operacional" (mesmo mecanismo de qualquer outra automação parada) — não é uma falha silenciosa, só precisa que o usuário volte no painel da Tuya e clique em renovar.

## 3. O que já está pronto (Fase 1)

- `scripts/sync/sondar_medidor_tuya.py` — script de SONDAGEM, só leitura, nenhuma escrita no Supabase. Chama `getstatus()`, `getproperties()` e `getdevices()` da API da Tuya (via `tinytuya.Cloud`) e imprime a resposta bruta.
- `.github/workflows/sondar_medidor_tuya.yml` — dispara a sondagem manualmente pela aba Actions do GitHub, sem precisar de Python local nem estar no computador.

## 4. Próximos passos (depois que o usuário completar a seção 2)

1. Disparar o workflow "Sondar Medidor de Energia (Tuya/Smart Life)" manualmente.
2. Colar a saída completa (JSON de `getstatus`/`getproperties`) numa sessão do Claude Code.
3. A partir do formato REAL devolvido (nomes de campo variam por tipo de dispositivo Tuya — não adianta chutar antes de ver), decidir: tabela no Supabase (provável: `medidor_tuya_leituras`, 1 linha atualizada por leitura — voltagem/corrente/potência/energia hoje/energia total), RPC de escrita (mesmo padrão de segurança `service_role`-only já usado em `cotacoes_opcoes`/`beneficios_creditos`), robô de produção (cron 2x/dia, mesmo orquestrador `executar_tudo.yml`), card novo no painel.
4. Só depois de 1 ciclo confirmando que os dados batem com o que o app Smart Life mostra, considerar o card definitivo — mesmo princípio de "não pular fases" já usado no DDSU666.

## 5. Não pular fases

Mesmo erro já documentado em `EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`: confiar em nome de campo chutado sem confirmar contra a API real já causou retrabalho neste sistema antes. Este documento existe pra registrar que a Fase 1 (sondagem) é deliberada, não esquecimento — não pular direto pra tabela/card de produção antes de ver o JSON real.
