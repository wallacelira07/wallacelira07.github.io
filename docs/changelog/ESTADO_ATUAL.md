# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 18/08/2026, bloco 26. Resumo: sessão longa com vários blocos — aportes recalculados (bloco 22), auditoria noturna autônoma de 16 achados (bloco 23), correção real dos achados prioritários + código morto eliminado + infra do medidor Tuya da Wellida preparada (bloco 24), medidor da Wellida detectado como modelo diferente e adaptado + extensão de validade de link + robô adaptado (bloco 25), e **bloco 26**: medidor da Wellida foi ao ar de verdade — 2 bugs reais descobertos e corrigidos em produção (região da API errada, chave primária bloqueando 2ª casa), card reordenado a pedido do usuário. **Tudo commitado e publicado** (push feito, `main` atualizado).

## 0. Bloco 26 (18/08/2026) — medidor da Wellida em produção de verdade (2 bugs reais corrigidos ao vivo) + reordenação de cards

### 0.1 Saga do erro Tuya `913` — 2 causas reais, ambas resolvidas

Usuário disparou o workflow `atualizar_medidor_tuya_wellida.yml` pela primeira vez e caiu num erro genérico da Tuya Cloud: `913 - No permission. The data center is suspended`. Investigação em 2 etapas, ambas confirmadas por evidência real antes de declarar resolvido:

1. **Região errada**: o secret `TUYA_API_REGION_WELLIDA` estava como `us-e` (copiado do padrão do Wallace), mas o painel Tuya mostrava o device sob "Western America Data Center" — que mapeia pro código `us` puro na API, não `us-e` (sub-região diferente, "America Leste"). Usuário trocou o secret pra `us` — resolveu a conexão, o robô passou a ler a leitura real do device (`energia_total_kwh: 0.0`, esperado pra medidor recém-instalado).
2. **Bug real meu, achado na hora**: com a conexão funcionando, apareceu um NOVO erro — `HTTP 409 duplicate key value violates unique constraint "medidor_tuya_consumo_diario_pkey"`. Causa: na migração de generalização multi-casa (bloco 24), dropei a constraint UNIQUE errada (`medidor_tuya_consumo_diario_data_key`) mas a PRIMARY KEY real da tabela (`medidor_tuya_consumo_diario_pkey`, só em `data`, sem `casa`) continuou intacta — bloqueava qualquer 2ª casa gravar numa data que o Wallace já tivesse usado. Corrigido: `DROP CONSTRAINT medidor_tuya_consumo_diario_pkey` (a `UNIQUE(data,casa)` já existente é suficiente pro `ON CONFLICT` do trigger). Confirmado que a transação inteira tinha revertido no erro anterior (nenhum dado órfão pra limpar).

**Resultado confirmado em produção**: `medidor_tuya_leituras` e `medidor_tuya_consumo_diario` já têm linha real com `casa='wellida'`, gravada com sucesso, heartbeat registrado como `medidor_tuya_wellida = sucesso`.

### 0.2 Reordenação dos cards do medidor (pedido do usuário)

Ordem antiga: telemetria Wallace → telemetria Wellida → comparação Wallace → comparação Wellida (agrupado por TIPO de card). Ordem nova, pedida explicitamente: telemetria Wallace → comparação Wallace → telemetria Wellida → comparação Wellida (agrupado por PESSOA). Aplicado nos 2 lugares (`Sistema_Wallace_Lira_Completo.html` e `solar-compartilhado.html`) — só reordenação de HTML, nenhuma lógica mudou.

### 0.3 Pendências reais restantes pro medidor da Wellida

- **Cron dedicado no cron-job.org**: ainda não criado — passei a URL/method/headers/body pro usuário (mesma API do GitHub `workflow_dispatch`, reaproveitando o token já configurado nas outras tarefas). `.github/workflows/atualizar_medidor_tuya_wellida.yml`.
- **`medidor_tuya_wellida` ainda não está em `SAUDE_JOBS_LIMIARES`** (`hydrate-saude-operacional.js`) — de propósito, só adicionar depois do cron confirmado rodando sozinho por um tempo (evita alarme falso "nunca rodou").
- **Medidor da Wellida ficou fisicamente offline** (app Smart Life mostrou "Device Connection Failure") logo depois do 1º sucesso — orientado troubleshooting padrão (WiFi/roteador/disjuntor, mesmo problema já visto no medidor do Wallace). O contador de energia é gravado no hardware do próprio medidor (não se perde offline) — só a granularidade por-leitura fica comprometida no período sem conexão, o total nunca é perdido.
- **Modelo do medidor da Wellida é bidirecional** (`forward_energy_total`/`reverse_energy_total`, DP diferente do CT simples do Wallace) — só energia total é gravada de verdade; potência/tensão/corrente/estado sempre ficam `—` pra ela, não é falha, é limitação real do aparelho (documentado em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`).

## 1. Bloco 25 (18/08/2026) — medidor da Wellida: modelo identificado, robô adaptado, card replicado, extensão de link

Usuário mandou prints ao vivo do painel Tuya (device já linkado, `ebf0d04e88180e1474o2is`) — schema de DPs confirmado DIFERENTE do EKAZA CT do Wallace (só `forward_energy_total`/`reverse_energy_total`, sem tensão/corrente/potência/estado). `scripts/sync/atualizar_medidor_tuya.py` ganhou suporte a múltiplos modelos via `TUYA_MODELO` (`ekaza_ct` default Wallace, `bidirecional_ab` novo pra Wellida). Card "Consumo real × crédito" replicado pro painel privado e compartilhado (função `aplicarConsumoRealVsCreditoPorCasa()` generalizada, RPC ganhou `medidorTuyaWellidaConsumoDiario`/`medidorTuyaWellidaUltima`). Nova opção de estender validade de link de compartilhamento já existente (RPC `estender_compartilhamento_solar`, botão "+dias").

## 2. Bloco 24 (18/08/2026) — achado #4 resolvido de verdade + código morto eliminado + medidor Tuya preparado (infra inicial)

**Achado #4** (trava de descompasso do card solar público): coluna `geracao_acumulada_atualizado_em` criada em `energia_solar_leituras`, robô `atualizar_geracao_saj.py` grava o timestamp real, RPC/painel privado/compartilhado atualizados — a trava (10 dias de descompasso) agora funciona de verdade nos 2 lados (antes nenhum dos 2 disparava, o campo era sempre `null`).

**Código morto eliminado** (8 de 9 achados da auditoria, autorizado pelo usuário: "pode eliminar"): `aplicarBoletosVencidosAutomaticamente()`, `VARS.necessidadeHeld`, `VARS.consorcioAutoQuitacaoValor`, `VARS.mastercardBlackCongelado`, cluster `renderCapaNav()`/`irParaCapaDestino()`/`CAPA_DESTINOS`/`NOMES_PANE`/`renderPageStrip()` removidos. `.chart-box.small` completado com CSS real em vez de removido. Mantidos de propósito: `VARS.solarConsumoMaeRecente` (dado real de fatura) e `CycleEngine.js` (serviço testado, arquitetura planejada).

**Infra multi-casa do medidor Tuya** criada (banco, robô, workflow, card) — nessa época ainda hipotética ("quando o Device ID existir"), depois confirmada real no mesmo dia (bloco 25).

## 3. Bloco 23 (18/08/2026) — auditoria noturna autônoma (7 agentes + verificação adversarial, carta branca do usuário)

Usuário: "coloque 10 agente trabalhando... não pare, eu vou dormir... carta branca para agir". Workflow de 7 agentes finders (financeiro, V1×V2, sintaxe JS, paridade solar, código morto, UI/CSS, segurança) + verificação adversarial (1 skeptic por achado). **16 achados, 16 confirmados, 0 descartados.**

**Limite respeitado mesmo com carta branca**: nenhuma escrita em tabela financeira, nenhum push sem avisar antes (regra permanente do `CLAUDE.md`). Corrigidos na hora: legenda Saúde Família dessincronizada, `CLAUDE.md` desatualizado (regra do `wallace_dados` obsoleta desde 12/08), comentários V1×V2 obsoletos, cor de gráfico divergente, 1 grant de segurança desnecessário revogado. O resto ficou reportado pro usuário decidir (resolvido nos blocos 24-26 acima).

## 4. Bloco 22 (18/08/2026) — recálculo de aportes + padronização de cards

- **Caixa Saúde Família**: R$177,50 → **R$210,83/mês** (composição completa: 2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa + 2x endócrino Wallace).
- **Emagrecimento**: R$278,89 → **R$490,00/mês** (caneta subiu de preço; usuário tem 3 canetas em estoque, não compra nova nos próximos 1-2 ciclos, mas aporte continua).
- **Bens Duráveis/Boletos/Fundo de Suavização**: pedido recálculo, CONFIRMADOS já corretos (zero mudança de código).
- **Cards "Todas as Caixas"**: altura padronizada via `.caixas-grid`/`min-height:168px` (não testado ao vivo, exige login).
- **3 LREI ativos** (R$266,23+R$103,55+R$1.950,77): confirmado real via SQL, não é bug.

## 5. Bloco 21 e anteriores

Ver `PASSAGEM_DE_TURNO.md` para o histórico narrativo completo. Resumo: bug crítico do `solar-compartilhado.html` (travamento "Carregando...") resolvido de verdade (erro de sintaxe JS); projeto DDSU666/SAJ do zero (Kit SEC não é exigível, firmware pronto, aguardando hardware físico 25/08/2026).

## 🎯 Regras permanentes (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova.
6. **`.git` real em `C:\Users\WLI015\.git-repos\Site.git`** — máquina nova precisa `git clone` novo. Usar merge (não rebase) pra sincronizar — bug conhecido de rebase nesta pasta sincronizada pelo Drive.
7. **Boot do painel ~1,7-1,8s (`aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy`) NÃO é bug** — não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz saldo real de nenhuma caixa** (manual seção 1.3.5). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre.
9. **Baixa de fatura**: `UPDATE` na MESMA linha de `transacoes`, nunca criar 2ª transação.
10. **Nenhuma constante financeira nova nasce hardcoded no `.js`** se já existe lugar em `parametros_gerais`/`indicadores`.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI**, mas FORA do Painel Executivo/Balanço.
12. **Inbox Financeira DESATIVADA DA UI** — itens ambíguos ficam `pendente` silenciosamente.
13. **Leitura manual de `energia_solar_leituras` sempre usa data/hora REAL da foto**, nunca "hoje".
14. **Medidor solar DDSU666 (Casa da Mãe): modelo certo só libera 25/08/2026.** Não confundir com o DDSU666 do inversor SAJ (bloco 21) — mesma família de hardware, contextos diferentes.
15. **WWI congelado funcionalmente, em observação** desde 15/08/2026. Não abrir fase nova sem evidência real ou pedido explícito.
16. **Necessidade Total Bruta/Líquida persistida em `indicadores`** a cada recálculo — só atualiza no próximo login (agente não dispara sem sessão).
17. **Medidor Tuya do apartamento em produção**, cron a cada 10min. Medidor da Wellida também em produção desde bloco 26 (cron ainda pendente de criar).
18. **`executar_tudo.yml` NÃO é o mecanismo real de automação.** Cada workflow precisa de tarefa dedicada no cron-job.org (URL da API do GitHub `workflow_dispatch`, não é webhook simples).
19. **Cotação de opções cobre PETR4 (brapi.dev) e ITUB4 (fallback `opcoes.net.br`, scraping).**
20. **Limiar `SOLAR_STATUS_LIMITES - acimaApartirDe` é 110%.**
21. **`solar-compartilhado.html` confirmado funcionando** desde bloco 21 — se travar de novo, ler console do navegador primeiro, não repetir tentativas antigas.
22. **Runbook de replicação de medidor Tuya** em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md` — inclui agora a lição da região `us` vs `us-e` e o bug de PK multi-casa, já corrigidos.
23. **Kit SEC da SAJ não é exigível** pra função básica de medidor+export limitation, confirmado por 4 manuais oficiais.
24. **Firmware ESP32 pro DDSU666/SAJ pronto** em `firmware/esp32_ddsu666_saj/`, aguardando hardware físico (25/08/2026). Mapa Modbus: `4000H`/`400AH` (monofásico), nunca `101EH`/`1028H` (trifásico).
25. **Tabela `caixas_aportes_mensais` (Supabase) é a fonte única de verdade dos aportes mensais** de todas as caixas — ver seção 6 abaixo pro snapshot completo.
26. **Cards da seção "Todas as Caixas" usam `.caixas-grid` (CSS)** pra altura uniforme — se algum outro lugar do painel tiver cards de tamanho desigual, mesma técnica provavelmente resolve.
27. **NOVO bloco 26 — medidor Tuya multi-casa: a PRIMARY KEY de `medidor_tuya_consumo_diario` é `(data, casa)`** (não mais só `data`, corrigido bloco 26). Se criar uma 3ª casa nova, não precisa mexer nisso de novo — já está certo.
28. **NOVO bloco 26 — região da API Tuya não é igual ao rótulo do painel.** "Western America Data Center" no painel = código `us` na API (não `us-e`). Confirmar sempre com um teste real antes de assumir, o rótulo visual da Tuya é impreciso.

## Pendências abertas

1. **DDSU666 (SAJ)**: aguardando hardware chegar (~25/08/2026) pra fiação/reconfiguração/teste real.
2. **R$340,00 do ciclo Wärtsilä 2026-07** ainda não confirmados como recebidos (não confundir com TEDs já lançadas).
3. **LREI0003/0004/0005 ativas** (R$266,23+R$103,55+R$1.950,77) — usuário optou por deixar como está, tendem a normalizar.
4. **Lint dos ~91 módulos `hydrate-*`** — adiado por decisão consciente do usuário, não reabrir sem pedido novo.
5. **Projeto WhatsApp/Telegram** — cancelado 17/08, não retomar sem confirmação explícita dos 2 motivos originais (custo API + hospedagem 24/7).
6. **Necessidade Total Bruta/Líquida** — recálculo automático pendente do próximo login (regra 16).
7. **Medidor da Wellida**: cron dedicado no cron-job.org ainda não criado (usuário tem a URL/config); `medidor_tuya_wellida` ainda não monitorado em Saúde Operacional (esperar cron rodar sozinho primeiro). Robô lê corretamente Canal B (`current_b`/`power_b` — corrigido 18/08, o medidor está fisicamente ligado nesse canal, não no A) e usa fallback de `medidor_tuya_consumo_diario` pro campo "Consumo hoje" (esse modelo não tem contador "hoje" próprio). `energia_total_kwh` ainda em 0,00 kWh mesmo com potência ativa (~56W) — acompanhar; se continuar travado por várias horas, mesmo padrão de travamento já visto no medidor do Wallace (resolve com reset físico). **Usuário já comprou um medidor substituto IDÊNTICO ao do apartamento (mesmo modelo EKAZA CT), chega domingo (23/08/2026)** — quando trocar, o workflow dela deve voltar pro `TUYA_MODELO=ekaza_ct` (padrão, igual ao Wallace) em vez do `bidirecional_ab` atual, e o `TUYA_DEVICE_ID_WELLIDA`/região precisam ser atualizados pro novo aparelho. Até lá, seguir usando os dados do medidor bidirecional atual.
8. **2 achados da auditoria noturna sem decisão tomada** (não são bugs, são escolhas de produto/segurança): (a) vale a pena implementar rastreamento real de `geracaoAcumuladaData` retroativo, ou deixar só daqui pra frente (já resolvido pra frente, bloco 24)? (b) `registrar_erro_cliente()` sem checagem de role — intencional (log pré-login) ou deveria restringir?

## Snapshot da tabela `caixas_aportes_mensais` (Supabase) — 18/08/2026

Fonte única de verdade dos aportes mensais, consultável por qualquer agente sem ler código.

| Caixa | Aporte mensal | Tipo |
|---|---|---|
| Caixa Boletos | R$4.550,77 | contínuo |
| Caixa Variável | R$2.000,00 | contínuo (teto oficial) |
| PIX Vanessa | R$1.200,00 | contínuo |
| Escola de Júlio (fase 2027) | R$839,64 | temporário (Jan-Nov/2027) |
| Caixa Seguro Emplacamento | R$425,00 | contínuo |
| Emagrecimento | R$490,00 | contínuo |
| Escola de Júlio (ciclo atual) | R$500,00 | temporário (até Nov/2026) |
| Caixa Bens Duráveis | R$250,00 | contínuo |
| Caixa Saúde Família | R$210,83 | temporário (até ~Nov/2027) |
| Caixa Aniversário Júlio | R$200,00 | temporário (até 14/09/2026) |
| Caixa Combustível | R$200,00 | contínuo |
| Caixa Eventos | R$166,67 | contínuo |
| Caixa Manutenção | R$166,67 | contínuo |
| Caixa Churrasco | R$100,00 | contínuo |
| Lance, Mastercard_Infinite, Mercado Pago, Wartsila, Suavização, PIX Geral Vanessa | — | sem aporte fixo |

## Protocolo de sessão nova

1. Este arquivo primeiro, depois os blocos mais recentes de `docs/changelog/PASSAGEM_DE_TURNO.md`.
2. `git status` — deveria estar limpo (tudo commitado/publicado nesta reescrita); confirmar.
3. **Medidor Tuya**: Wallace e Wellida ambos em produção. Se algum aparecer travado/offline, é MUITO provavelmente o aparelho físico (WiFi/disjuntor) — orientar reset antes de mexer em código ou Supabase.
4. **Se o usuário mencionar o DDSU666 chegando/instalado**: ver pendência 1 acima, `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md` tem o mapa de registradores.
5. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
6. **WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
7. **Aportes mensais de qualquer caixa**: consultar `caixas_aportes_mensais` (Supabase) primeiro, é a fonte única de verdade.
8. **Cron externo (cron-job.org)**: qualquer automação nova precisa de tarefa dedicada lá — a URL é a API do GitHub `workflow_dispatch` (não um endpoint simples), reaproveitar token já configurado.
9. **Se replicar mais um medidor Tuya (3ª casa)**: seguir `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`, já atualizado com as 2 lições reais do bloco 26 (região `us`, PK multi-casa).
