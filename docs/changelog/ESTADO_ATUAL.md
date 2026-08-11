# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 11/08/2026, fim de sessão longa (UI/UX da Home/Painel + compartilhamento solar + correção real de crédito solar). HEAD `adfcf90`, tudo commitado e pushed (branch `main`, `wallacelira07.github.io`). Além do código, esta sessão também gravou correções direto no Supabase (dados, não código — ver seção "Correção de dado real" abaixo).

## 🎯 Regra permanente: V1 não é autoridade

`wallace_dados`/`VARS` (V1) não é mais fonte de verdade para o domínio financeiro (V2 relacional manda). **Exceção conhecida e aceita**: `ENERGISA_TARIFA_COMPOSICAO` (composição/histórico de fatura por unidade) ainda mora só em `wallace_dados` — não migrado pra V2, mas é dado de referência/apresentação, não saldo. Editar sempre no Supabase primeiro (ele sobrescreve o fallback local a cada carga).

## ✅ Corrigido nesta sessão — UI/UX (Home, Painel, abas)

1. **Menu de abas (`.home-nav-grid`) reposicionado 3 vezes até o formato final**: capa → logo abaixo do Simulador Fim de Ciclo → **sem sticky** (rola junto com a página, não trava no topo) — decisão final do usuário depois de eu ter implementado sticky por engano na 1ª tentativa (interpretação errada de um vídeo que não consegui abrir).
2. **Vão vazio acima da barra de abas ao rolar**: `body{padding-top:2.5rem}` só era parcialmente cancelado (`-1.5rem`) fora da capa — sobravam 16px visíveis. Corrigido pra cancelar o padding inteiro.
3. **Clique na aba Painel escondia o kpi-strip** (Patrimônio Líquido/Total Operacional/Caixa Variável/Modo Operacional) atrás da barra fixa — `irParaPrimeiraSecao()` rolava pro 1º `.section-num`, pulando qualquer conteúdo antes dele. Agora rola pro topo do próprio pane.
4. **Ícone de busca praticamente invisível no mobile** — SVG renderizando com `width:2.67px` (achatado) apesar do CSS pedir 15px. Hardening com `min-width`/`flex-shrink:0` (causa raiz exata não 100% confirmada, mas corrigido na prática).
5. **Rótulos de valor sobre as barras**: gráfico "Histórico mês a mês" (Energia Solar) ganhou rótulos (pedido do usuário, "igual todo gráfico do site"), depois simplificados pra só o número (sem "kWh") — com "kWh" as barras vizinhas coladas sobrepunham o texto.
6. **"Atrasado" falso na Previsão solar logo após fechar um ciclo** — `diasDesdeInicioCiclo` contava até a última leitura MANUAL (que, recém-aberto o ciclo, é a própria data de abertura → 0 dias), zerando a Média mesmo com o numerador já projetado até hoje. Corrigido pra contar até hoje (Brasília).

## ✅ Corrigido nesta sessão — Compartilhamento Solar (`solar-compartilhado.html`)

- Tarifa errada: mostrava ~R$0,18/kWh (média diluída = economia autoconsumida ÷ geração TOTAL, incluindo o kWh exportado sem economia direta nesta fórmula simplificada) em vez da tarifa real R$0,8995/kWh informada pelo usuário. Corrigido pra usar a tarifa real diretamente.
- RPC `consultar_solar_compartilhado` estendida pra devolver `ciclosFechados` — página ganhou 2 gráficos novos ("Histórico mês a mês" e "Rateio Solar por ciclo fechado"), além do de geração diária que já existia.
- Card de link gerado (painel privado) não mostra mais o token de 64 caracteres cru — só botões "Abrir página"/"Copiar link".

## ✅ Corrigido nesta sessão — Seção 04 "Previsão" reestruturada (pedido formal do usuário, documento anexado)

Problema conceitual: a seção misturava o fechamento da GD (onde o crédito é gerado) com a leitura da UC de cada casa (onde a Energisa aplica o crédito na fatura), fazendo o usuário achar que o crédito do ciclo aberto (ainda em formação) era "tudo que resta pra próxima conta". Agora são 2 blocos sempre visíveis, por casa: **Fluxo 1** (🔒 crédito do último ciclo já FECHADO, congelado, o que realmente abate a próxima fatura) e **Fluxo 2** (🌱 crédito do ciclo atual, em formação, cresce todo dia). `renderFluxo1Fechado()` nova função, usa `ciclosSolarFechados[0]` (mais recente por `data_fim DESC`).

## 🔧 Correção de dado real — ciclo solar fechado tinha crédito inflado (achado + corrigido nesta sessão)

**Não é bug de código, é dado incorreto que já estava gravado.** Usuário recebeu as faturas reais de agosto/2026 (casa da mãe/GD e Wellida) e desconfiou de inflação de crédito no gráfico. Investigação:

- Confirmado que o sistema **não** mistura consumo pré-instalação (08/07-20/07) no cálculo — o ciclo já zerava a base em 21/07 (data real de instalação), como deveria.
- Causa real: a leitura manual de 08/08/2026 (código 103 = 412) tinha um salto de **+51 kWh em 1 único dia** (fisicamente implausível, máximo plausível ~25-30 kWh/dia) frente à leitura de 07/08 (361) — e o usuário confirmou depois que o leiturista da Energisa passou de fato em 07/08, não 08/08 (fatura registrada errado, provavelmente por 08/08 cair num sábado).
- **Corrigido direto no Supabase** (não precisou de deploy — dados são lidos ao vivo): leitura de 08/08 desmarcada como oficial (`eh_leitura_oficial_energisa=false`, evidência de auditoria gravada); leitura de 07/08 (03=60/103=361) virou o fechamento oficial do ciclo (21/07→07/08). Crédito líquido: 343→**301 kWh** (Wallace 243,53→**213,71**, Wellida 99,47→**87,29**). Ciclo aberto atual realinhado pra começar do mesmo ponto (07/08, 60/361).
- Validado externamente contra a fatura Energisa NF 009.005.819 (código 103/injetada=339 kWh no período) — usado só como referência, não como valor de fechamento (o medidor manual continua sendo a fonte primária, por diretriz do próprio usuário).
- Faturas reais de agosto (casa_wellida R$70,12/111kWh, casa_mae R$56,11/145kWh+339kWh injetada) registradas em `ENERGISA_TARIFA_COMPOSICAO` (Supabase `wallace_dados` + fallback local `vars-energia-solar.js`).

## ⚠️ Pendência aberta — leitura de 08/08 (69/412) ainda existe no histórico

Não foi apagada, só desmarcada como oficial. Como é cronologicamente posterior à leitura de 07/08 que agora é o início do ciclo aberto, pode aparecer distorcendo telas de "progresso desde a abertura" até o usuário mandar uma leitura nova e real do medidor. **Pedir uma leitura fresca na próxima sessão.**

## 💡 Proposta em aberto, sem decisão — buffer de 1h + validação de plausibilidade

Usuário perguntou sobre criar um buffer de 1h nas leituras do SAJ. Sugeri complementar com uma checagem automática de plausibilidade (rejeitar/alertar leitura manual com delta diário fisicamente impossível, ~mesmo raciocínio usado pra achar o bug de 412 acima) — nenhuma das duas coisas implementada ainda, esperando confirmação do usuário.

## Pendências antigas, sem decisão do usuário ainda

| Item | Nota |
|---|---|
| 3 transações LRW/LRV sem dono (R$282,71) | Colisão de `tx_legado` de sessão anterior, documentada em `hydrate-onda3-lrwlrv.js` — só o usuário pode dizer de quem são |
| Cartões — classificação retroativa completa + totais via Pluggy | Frente aberta em sessão anterior (10/08), não retomada nesta |

## Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído — **lembrar que nem toda correção desta sessão é um commit**: a correção do ciclo solar (seção acima) foi só SQL direto no Supabase, não aparece no `git log`.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
4. Pedir uma leitura solar fresca do medidor pro usuário (ver pendência acima) antes de confiar em qualquer tela de "progresso do ciclo atual".
