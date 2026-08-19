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

**3ª rodada (achado real, mesmo dia)**: comparando o PDF da mãe com um 2º PDF real (fatura da irmã, também mandada pelo usuário) descobri que **a linha digitável NÃO aparece sempre** nas faturas Energisa — a da irmã (já paga) não tinha a ficha de compensação impressa, só a da mãe tinha. Método de valor trocado pra Energisa (Medintech continua com linha digitável, que é 100% confiável pra ela): 1º tenta "data de vencimento + R$valor", 2º tenta a linha "TOTAL: valor", 3º cai pra linha digitável se presente. Os 2 primeiros bateram exato nos 2 PDFs reais (mãe R$56,11, irmã R$70,12).

**Estado real ao fim desta sessão — automação de Energia (boleto TXB000009) validada só pra identificação, não pro valor do Wallace**:
- UC da mãe: `573.702.053-77` — confirmada, testada em PDF real, `_identificar_casa_energisa()` retorna `'mae'` corretamente.
- UC da irmã: `2.064.202.053-60` — confirmada, testada em PDF real, retorna `'irma'` corretamente.
- UC do Wallace: `1.994.775.053-05` — informada pelo usuário, **Nível C, ainda não confirmada contra um PDF real** (a fatura dele deste ciclo não foi emitida). Extração de valor/consumo testada com sucesso nos 2 PDFs que existem (mãe/irmã), mas nunca contra um PDF real do próprio Wallace.
- `cronograma_boletos_fixos.TXB000009` continua em R$367,36 (valor antigo, não confirmado — só não foi substituído por um valor errado).

**Pendência real que falta pra fechar isso**: quando a fatura do próprio Wallace for emitida, mandar o PDF real pra confirmar que a UC `1.994.775.053-05` aparece e que o valor bate, e só então considerar essa parte 100% validada.

**Diferença de robustez em relação à Medintech**: como o remetente exato do envio automático mensal da Energisa ainda não foi confirmado (o serviço foi ativado nesta mesma sessão, "a partir da próxima fatura" — os PDFs vistos até agora vieram de 2ª via manual), a busca é por **domínio inteiro** (`from:@energisa.com.br has:attachment`) em vez de um remetente único — mais frouxa na busca, compensada pela validação por UC antes de aceitar qualquer valor. Revisitar o remetente exato quando a 1ª fatura automática (não 2ª via) do Wallace chegar de verdade.

## Extensão 19/08/2026 (mesmo dia) — referência de consumo solar (`energia_solar_consumo_referencia`)

Usuário pediu pra também alimentar o "controle solar" automaticamente. Investigação (agente `Explore`) confirmou: **não existia nenhuma ponte entre fatura Energisa e o domínio solar** — o robô SAJ só lê geração do inversor (fonte tecnicamente incapaz de ler consumo/Energisa), e `energia_solar_consumo_referencia` era 100% manual (usuário lia a fatura e um agente digitava — a própria migration que criou a tabela cita a fala do usuário: *"quando chegar as faturas eu envio e você joga no supabase e a mágica acontece"*).

**Decisão de escopo, confirmada com o usuário antes de codar**: usar só o **consumo real do mês atual** ("Consumo em kWh", sempre presente e bem rotulado — testado nos 2 PDFs reais), não a linha "Média dos últimos meses" (que só existe em 1 dos 2 formatos de fatura vistos, formato "2ª via simplificada" — não confiável pra generalizar).

**Diferente do boleto TXB000009 (só conta pro Wallace), aqui as 3 casas contam** — cada fatura encontrada (mãe/irmã/Wallace) atualiza a linha correspondente da tabela. Testado e **já atualizado com evidência real** nesta sessão:
- `casa='mae'`: 300→**145 kWh**/30 dias (4,83 kWh/dia)
- `casa='irma'`: 112→**111 kWh**/30 dias (3,70 kWh/dia)
- `casa='wallace'`: não tocado (nenhum PDF real dele ainda)

**Achado real de bug, corrigido antes do commit**: `consumo_diario_kwh` é coluna **GERADA** no Postgres (`consumo_mensal_kwh / dias_base`, automático) — a 1ª versão do `atualizar_consumo_solar()` tentava escrever nela direto, e o Supabase rejeitou (`column consumo_diario_kwh can only be updated to DEFAULT`). Corrigido: o `PATCH` agora só manda `consumo_mensal_kwh`/`dias_base`/`fonte`, nunca `consumo_diario_kwh`.

## Extensão 19/08/2026 (mesmo dia, mais tarde) — pedido do usuário: "06 Economia antes × depois (apartamento) e Quanto você ainda vai pagar mesmo com 100% dos créditos deve ser atualizado pelo robo"

Até aqui o robô só alimentava `cronograma_boletos_fixos` (TXB000009) e `energia_solar_consumo_referencia`. Duas seções do painel privado (gráfico "06 Economia antes × depois" e o card "💡 Quanto você ainda vai pagar mesmo com 100% dos créditos") continuavam lendo `parametros_gerais.ENERGISA_TARIFA_COMPOSICAO`/`ENERGIA_FATURAS_REAIS`, mas ninguém automatizava a escrita nesses 2 parâmetros — alguém tinha que copiar o valor da fatura à mão pro Supabase todo mês.

**Mudança no robô** (`_buscar_energisa`, `buscar_faturas_do_mes`, `main()` em `atualizar_boletos_medintech.py`): agora, pra QUALQUER das 3 casas identificadas por UC (não só Wallace), reaproveita o mesmo valor+consumo já extraído do PDF (sem chamada nova) e:
- faz merge (nunca sobrescreve o JSON inteiro) em `ENERGISA_TARIFA_COMPOSICAO[casa]`, gravando `fatura_<mês><ano>_valor`/`_consumo_kwh`/`_periodo_dias` com uma chave de mês CALCULADA (`_chave_mes_atual()`, ex. `set26`), não mais uma constante fixa;
- quando a casa é `wallace`, também grava `ENERGIA_FATURAS_REAIS[<Mês capitalizado>]` (ex. `Set`), que é o campo que o gráfico 06 lê como "fatura real" pra parar de usar a projeção calculada.
- Idempotente, mesmo padrão dos outros 2: só escreve se o valor mudou.

**Mudança no JS** (`graficos-cenarios-lazy.js`, bloco do card residual): a leitura de `d.fatura_ago26_valor`/`d.fatura_ago26_consumo_kwh` era uma chave **FIXA escrita à mão** — nunca ia acompanhar setembro/outubro sozinha. Trocada por `faturaEnergisaMaisRecente(d)`, que varre as chaves `fatura_<mês><ano>_valor` presentes no JSON e pega a mais recente por data, com fallback pro histórico antigo (`d.historico.jul26`) se nenhuma existir ainda. Nenhuma edição de código será necessária nos próximos meses.

**Parâmetro novo criado no Supabase**: `parametros_gerais.ENERGIA_FATURAS_REAIS` não existia como linha (só como default `{}` hardcoded em `vars-energia-solar.js`) — criado com `valor={}` pra existir um alvo pro `PATCH` do robô.

**Estado ao fim desta extensão**: só wiring/infraestrutura — nenhuma fatura nova do Wallace foi processada ainda (a dele deste ciclo continua não emitida, mesma pendência já registrada acima), então `ENERGIA_FATURAS_REAIS` continua `{}` e o gráfico 06 continua mostrando "baseado na geração real do medidor" (fonte='calculado'), não "fatura real" — vai passar a mostrar sozinho assim que o robô achar a 1ª fatura Energisa real do Wallace.

## Extensão 19/08/2026 (mesmo dia) — 2 achados de usuário corrigidos nos gráficos "Crédito × medidor Tuya"

1. **"coloque os valores sobre as barras"** (gráfico 04 "Geração por dia vs. consumo médio das casas", painel privado — o gráfico irmão no compartilhado já tinha os valores, só o privado não): adicionado `valorSobreBarraGeracaoPlugin`, mesmo padrão do `solarBarLabelPlugin` já usado no gráfico 05.
2. **"tá faltando o credito gerado em setembro no compartilhado"**: os gráficos novos "Crédito × medidor Tuya" (Wallace/Wellida) no `solar-compartilhado.html` só liam `ciclosFechados` (ciclo já ENCERRADO) pra montar a barra verde de crédito — o mês do ciclo ainda ABERTO nunca tinha crédito, só a barra vermelha de consumo (que já vinha de dado ao vivo). O painel privado já resolvia isso (usa leituras cruas, não só ciclos fechados); o compartilhado, não. Corrigido: preenche o índice do ciclo aberto com `fluxo2.wallace/wellida.creditoAtual` (crédito projetado ao vivo, mesma fórmula já usada no card "Consumo real × crédito" da mesma página) — verificado ao vivo, bate exatamente com o valor do painel privado (Wallace 151 kWh, Wellida 62 kWh em Set/26).
