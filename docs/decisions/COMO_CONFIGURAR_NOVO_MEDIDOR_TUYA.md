# Como configurar um novo medidor Tuya (EKAZA CT) — runbook replicável

**Criado 17/08/2026**, depois de configurar o medidor do apartamento do Wallace do zero (ver `docs/decisions/INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md` pro histórico completo/achados). **Atualizado no mesmo dia**: já são 2 casas novas confirmadas recebendo o mesmo medidor — a irmã (usuário mandou um medidor pra ela instalar) e o cunhado (usuário já pediu pra ele instalar também) — provavelmente não serão as últimas. Os passos abaixo devem se repetir quase idênticos pra qualquer casa nova.

## 0. O que muda de casa pra casa

- **Instalação física** e **conta do app Smart Life**: cada casa/pessoa tem a sua (é quem mora lá quem instala e quem tem o app dela no celular).
- **Conta Tuya IoT Platform (iot.tuya.com)**: pode ser a MESMA conta/projeto Cloud já usado pro medidor do Wallace, desde que essa conta consiga vincular o app Smart Life de cada pessoa também (Tuya permite vincular várias contas de app diferentes ao mesmo Cloud Project) — mais simples que criar um projeto novo pra cada casa. Se não der certo vincular várias contas de app ao mesmo projeto, aí sim criar um projeto Cloud separado por casa.
- **Secrets do GitHub / tabela do Supabase / robô Python**: isso é trabalho de código, feito numa sessão futura quando o Device ID de cada casa existir — não é replicável só copiando os passos, precisa de nomes/tabelas próprios por casa (ver seção 4) pra não misturar os medidores. **Não pular fase**: só desenhar isso quando o Device ID real de cada casa estiver em mãos.

## 1. Passos no painel da Tuya (iot.tuya.com) — repetir por medidor/casa nova

1. **Criar conta grátis** em https://iot.tuya.com (ou reusar a existente, ver seção 0).
2. **Cloud > Development > Create Cloud Project** (só se não for reusar um projeto existente). Data Center: testar "Western America" (`us-e`) primeiro.
3. Dentro do projeto: **aba "Devices" → "Link Tuya App Account"** → gera um QR Code → a pessoa da casa escaneia esse QR pela aba **"Perfil/Me"** do app Smart Life dela. Isso vincula os aparelhos já cadastrados no app dela ao projeto Cloud.
4. **Aba "Service API" → botão "Go to Authorize" (ou "Add Authorization")** → na lista, achar **"IoT Core"** → clicar em **"Free Trial"**. Confirmar que aparece "Authorized 1 Service(s)" (ou mais, se já tinha outro serviço autorizado antes).
5. **Aba "Devices"** → achar o medidor na lista (nome tipo "Medidor de Energia") → clicar nele → anotar o **Device ID** (aparece em "Basic Information").

## 2. O PASSO QUE MAIS IMPORTA — sem ele a API devolve vazio

**Achado crítico de 17/08/2026**: esse modelo específico de medidor (OEM/genérico, marca "EKAZA") **nunca teve o schema de DPs registrado no modo "Standard" da Tuya** — mesmo com o aparelho "Online" e o app mostrando dado normal, a API (`getstatus()`/`getproperties()`) devolve **vazio**, sem erro nenhum, até você fazer isto:

1. Ainda na aba **"Devices"**, no aparelho específico → tem um aviso azul no topo mencionando "standard instruction set" → clicar no link **"Product Details"** (ou ir direto em Device Debugging → tem uma engrenagem/link "Configure Control Instruction Mode").
2. Na tela **"Configure Control Instruction Mode"**, escolher **"DP Instruction"** (não "Standard Instruction", que vem selecionado por padrão e é o que causa o vazio).
3. **"Save Configuration"**.
4. Só depois disso, `getstatus()`/`getproperties()` via API passam a devolver dado real.

**Se pular esse passo**: a sondagem (seção 3) vai devolver `{"result": [], "success": true}` — parece que funcionou (sem erro), mas não tem dado nenhum dentro. Não é bug de código, é exatamente essa configuração faltando. **Isso vale pra CADA medidor novo, mesmo sendo o mesmo modelo já configurado antes** — é uma configuração por dispositivo, não por conta/projeto.

## 3. Schema de DPs esperado (mesmo modelo de medidor = mesmo schema)

Como é o MESMO modelo de aparelho (EKAZA CT 80A), o schema deve ser idêntico em qualquer casa — não precisa sondar do zero, só confirmar que bate:

| DP | Significado | Conversão |
|---|---|---|
| `cur_voltage1` | Tensão (V) | bruto ÷ 10 |
| `cur_current1` | Corrente (A) | bruto ÷ 1000 |
| `cur_power1` | Potência (W) | bruto ÷ 10 |
| `today_acc_energy1` | Energia hoje (kWh) | bruto ÷ 1000 |
| `total_energy1` | Energia total acumulada (kWh) | bruto ÷ 1000 |
| `device_state1` | Estado (`close`/`monitor`/`working`/`warning`) | direto |

Se o Device ID de uma casa nova devolver DPs com nomes diferentes desses, é sinal de que não é exatamente o mesmo modelo internamente — nesse caso, mapear do zero (não assumir).

## 4. Quando tiver o Device ID real de uma casa nova — próximos passos (código, sessão futura)

1. Rodar a sondagem: reaproveitar `scripts/sync/sondar_medidor_tuya.py` (ou uma cópia) com as credenciais da casa nova, confirmar o schema da seção 3.
2. Desenhar como os medidores de várias casas coexistem no banco: opção mais simples é adicionar uma coluna `casa` (`'wallace'`/`'irma'`/`'cunhado'`/...) em `medidor_tuya_leituras`/`medidor_tuya_consumo_diario`, em vez de duplicar tabelas a cada casa nova — mas essa é uma decisão de código a tomar na hora, com o schema real em mãos, não agora. Nomear a coluna/valores de forma genérica desde o início (não travar em só 2 casas) já que mais devem aparecer.
3. Secrets novos no GitHub: `TUYA_ACCESS_ID_<CASA>`, `TUYA_ACCESS_SECRET_<CASA>`, `TUYA_DEVICE_ID_<CASA>` (sufixo com o nome da casa, ex: `_IRMA`, `_CUNHADO`, pra não colidir com os do Wallace já existentes nem entre si).
4. Cron dedicado novo no cron-job.org por casa (mesmo padrão do medidor do Wallace — cada workflow precisa da própria tarefa agendada, `executar_tudo.yml` sozinho não é suficiente, ver `docs/changelog/ESTADO_ATUAL.md` bloco 20 regra 18).
5. Card/gráfico: quando os medidores de todas as casas (Wallace, irmã, cunhado, Casa da Mãe via DDSU666) estiverem online, revisitar o gráfico "Geração por dia" (seção 04, Solar) pra somar os consumos reais contra a geração real da usina — deliberadamente adiado até então (ver `INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md` seção 8). O gráfico "Rateio Solar" (seção 05) e o card "Consumo real × crédito" também podem ganhar uma série por casa, mesmo padrão do que já existe pro Wallace.
