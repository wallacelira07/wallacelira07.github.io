# Como configurar um novo medidor Tuya (EKAZA CT) — runbook replicável

**Criado 17/08/2026**, depois de configurar o medidor do apartamento do Wallace do zero (ver `docs/decisions/INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md` pro histórico completo/achados). Guardado aqui porque o usuário vai mandar um medidor igual (mesma marca/modelo "EKAZA Medidor de Transf de corrente 80A") pra irmã instalar na casa dela — os passos abaixo devem se repetir quase idênticos.

## 0. O que muda de casa pra casa

- **Instalação física** e **conta do app Smart Life**: cada casa/pessoa tem a sua (é a irmã quem instala e quem tem o app dela no celular).
- **Conta Tuya IoT Platform (iot.tuya.com)**: pode ser a MESMA conta/projeto Cloud já usado pro medidor do Wallace, desde que essa conta consiga vincular o app Smart Life da irmã também (Tuya permite vincular várias contas de app diferentes ao mesmo Cloud Project) — mais simples que criar um projeto novo do zero. Se não der certo vincular contas de app diferentes ao mesmo projeto, aí sim criar um projeto Cloud separado.
- **Secrets do GitHub / tabela do Supabase / robô Python**: isso é trabalho de código, feito numa sessão futura quando o Device ID da irmã existir — não é replicável só copiando os passos do Wallace, precisa de nomes/tabelas próprios (ex: `TUYA_ACCESS_ID_IRMA`, ou uma coluna `casa` na tabela) pra não misturar os dois medidores. **Não pular fase**: só desenhar isso quando o Device ID real da irmã estiver em mãos.

## 1. Passos no painel da Tuya (iot.tuya.com) — repetir por medidor/casa nova

1. **Criar conta grátis** em https://iot.tuya.com (ou reusar a existente, ver seção 0).
2. **Cloud > Development > Create Cloud Project** (só se não for reusar um projeto existente). Data Center: testar "Western America" (`us-e`) primeiro.
3. Dentro do projeto: **aba "Devices" → "Link Tuya App Account"** → gera um QR Code → a pessoa (irmã, nesse caso) escaneia esse QR pela aba **"Perfil/Me"** do app Smart Life dela. Isso vincula os aparelhos já cadastrados no app dela ao projeto Cloud.
4. **Aba "Service API" → botão "Go to Authorize" (ou "Add Authorization")** → na lista, achar **"IoT Core"** → clicar em **"Free Trial"**. Confirmar que aparece "Authorized 1 Service(s)" (ou mais, se já tinha outro serviço autorizado antes).
5. **Aba "Devices"** → achar o medidor na lista (nome tipo "Medidor de Energia") → clicar nele → anotar o **Device ID** (aparece em "Basic Information").

## 2. O PASSO QUE MAIS IMPORTA — sem ele a API devolve vazio

**Achado crítico de 17/08/2026**: esse modelo específico de medidor (OEM/genérico, marca "EKAZA") **nunca teve o schema de DPs registrado no modo "Standard" da Tuya** — mesmo com o aparelho "Online" e o app mostrando dado normal, a API (`getstatus()`/`getproperties()`) devolve **vazio**, sem erro nenhum, até você fazer isto:

1. Ainda na aba **"Devices"**, no aparelho específico → tem um aviso azul no topo mencionando "standard instruction set" → clicar no link **"Product Details"** (ou ir direto em Device Debugging → tem uma engrenagem/link "Configure Control Instruction Mode").
2. Na tela **"Configure Control Instruction Mode"**, escolher **"DP Instruction"** (não "Standard Instruction", que vem selecionado por padrão e é o que causa o vazio).
3. **"Save Configuration"**.
4. Só depois disso, `getstatus()`/`getproperties()` via API passam a devolver dado real.

**Se pular esse passo**: a sondagem (seção 3) vai devolver `{"result": [], "success": true}` — parece que funcionou (sem erro), mas não tem dado nenhum dentro. Não é bug de código, é exatamente essa configuração faltando.

## 3. Schema de DPs esperado (mesmo modelo de medidor = mesmo schema)

Como é o MESMO modelo de aparelho (EKAZA CT 80A), o schema deve ser idêntico ao já mapeado pro medidor do Wallace — não precisa sondar do zero, só confirmar que bate:

| DP | Significado | Conversão |
|---|---|---|
| `cur_voltage1` | Tensão (V) | bruto ÷ 10 |
| `cur_current1` | Corrente (A) | bruto ÷ 1000 |
| `cur_power1` | Potência (W) | bruto ÷ 10 |
| `today_acc_energy1` | Energia hoje (kWh) | bruto ÷ 1000 |
| `total_energy1` | Energia total acumulada (kWh) | bruto ÷ 1000 |
| `device_state1` | Estado (`close`/`monitor`/`working`/`warning`) | direto |

Se o Device ID da irmã devolver DPs com nomes diferentes desses, é sinal de que não é exatamente o mesmo modelo internamente — nesse caso, mapear do zero (não assumir).

## 4. Quando tiver o Device ID real — próximos passos (código, sessão futura)

1. Rodar a sondagem: reaproveitar `scripts/sync/sondar_medidor_tuya.py` (ou uma cópia) com as credenciais da irmã, confirmar o schema da seção 3.
2. Desenhar como os 2 medidores (Wallace + irmã) coexistem no banco: opção mais simples é adicionar uma coluna `casa` (`'wallace'`/`'irma'`) em `medidor_tuya_leituras`/`medidor_tuya_consumo_diario`, em vez de duplicar tabelas — mas essa é uma decisão de código a tomar na hora, com o schema real em mãos, não agora.
3. Secrets novos no GitHub: `TUYA_ACCESS_ID_IRMA`, `TUYA_ACCESS_SECRET_IRMA`, `TUYA_DEVICE_ID_IRMA` (sufixo pra não colidir com os do Wallace já existentes).
4. Cron dedicado novo no cron-job.org (mesmo padrão do medidor do Wallace — cada workflow precisa da própria tarefa agendada, `executar_tudo.yml` sozinho não é suficiente, ver `docs/changelog/ESTADO_ATUAL.md` bloco 20 regra 18).
5. Card/gráfico: quando os 2 medidores (Wallace + irmã) e o DDSU666 (Casa da Mãe) estiverem online, revisitar o gráfico "Geração por dia" (seção 04, Solar) pra somar os 3 consumos reais contra a geração real da usina — deliberadamente adiado até então (ver `INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md` seção 8).
