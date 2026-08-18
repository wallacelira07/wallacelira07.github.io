# ESP32 + MAX485 — leitura do DDSU666 (SAJ, Casa da Mãe)

Lê o medidor bidirecional DDSU666 direto pelo RS485 (em paralelo com o inversor
SAJ R5-6K-S2-15, sem depender do Kit SEC nem da nuvem eSolar da SAJ) e posta o
resultado direto no Supabase, a cada 5 minutos — mesmo padrão arquitetural já
usado no medidor Tuya do apartamento (dispositivo local → Supabase direto).

Contexto completo da decisão em `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`.

## Material

| Item | Observação |
|---|---|
| ESP32 DevKit (ex: ESP32-WROOM-32) | |
| Módulo MAX485 (RS485↔TTL) | |
| Fonte USB 5V | |
| Jumpers | |
| Caixa plástica pequena (IP54+) | proteger o conjunto perto do quadro |

## Ligação

```
DDSU666 RS485-A -----------> MAX485 A
DDSU666 RS485-B -----------> MAX485 B
                              MAX485 RO  -> ESP32 GPIO16 (RX)
                              MAX485 DI  -> ESP32 GPIO17 (TX)
                              MAX485 DE+RE (juntos) -> ESP32 GPIO4
                              MAX485 VCC -> 3.3V ou 5V (conforme o módulo)
                              MAX485 GND -> GND
```

RS485 aceita múltiplos dispositivos no mesmo barramento — o ESP32 fica em
paralelo com o inversor, sem desligar nada existente.

## Passo a passo da instalação

1. **Antes de tudo**: reconfigurar o medidor pelos botões físicos dele. Ele
   sai de fábrica falando protocolo DL/T645-2007, não Modbus. Pressione e
   segure o botão até entrar no menu, curte-pressione até sair de
   "645Protocol" e cair em qualquer modo Modbus (`8n2`/`8n1`/`8E1`/`8o1`).
   Sem esse passo, o firmware não consegue ler nada.
2. Fazer a fiação acima.
3. Copiar `segredos.h.exemplo` para `segredos.h` na mesma pasta e preencher
   com o WiFi e a `service_role` key do Supabase (Project Settings > API).
4. Instalar a biblioteca **ModbusMaster** (Doc Walker) pelo Library Manager
   da Arduino IDE.
5. Gravar `esp32_ddsu666_saj.ino` no ESP32 via USB.
6. Abrir o Monitor Serial (115200 baud) e confirmar que as leituras aparecem
   (`U=...V I=...A P=...kW Importada=...kWh Exportada=...kWh`) antes de
   fechar a caixa.

## Mapa de registradores usado

Fonte: manual oficial Chint "DDSU666 Single phase Smart Meter — Operation
Manual" (ZTY0.464.1224, ago/2020). **Não confundir com o manual da linha
trifásica DTSU666/DSSU666 — usa endereços diferentes.**

| Endereço | Campo | Unidade |
|---|---|---|
| `2000H` | Tensão | V |
| `2002H` | Corrente | A |
| `2004H` | Potência ativa combinada | kW |
| `200EH` | Frequência (não usado no firmware atual) | Hz |
| `4000H` | Energia importada da rede (acumulada) | kWh |
| `400AH` | Energia exportada pra rede (acumulada) | kWh |

## Backend

Tabela `medidor_ddsu666_saj_leituras` + RPC `atualizar_medidor_ddsu666_saj`
já criadas em produção (17/08/2026), mesmo padrão de RLS/segurança do
medidor Tuya — RLS restrita a login Firebase pra leitura, escrita bloqueada
pra `anon`/`authenticated` (só `service_role`).
