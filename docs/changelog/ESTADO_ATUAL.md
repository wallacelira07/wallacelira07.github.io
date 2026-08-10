# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 09/08/2026, fim de sessão muito longa (auditoria de prontidão operacional → fechamento de segurança → investigação "matar V1" → reconciliação de 8 caixas → correção de critério pelo usuário → achado solar). HEAD `d733c6b` no momento desta escrita, mais uma migration solar/SAJ possivelmente ainda pendente de execução manual pelo usuário (ver pendências).

## 🎯 Regra mais importante pra próxima sessão: V1 não é mais autoridade

Durante esta sessão, o usuário corrigiu explicitamente um erro de enquadramento meu: eu estava usando `vw_reconciliacao_v1_v2` (comparação Supabase `wallace_dados` × `transacoes`) como critério de "isso precisa de correção". **Isso está errado.** V1 (`wallace_dados`/`VARS`) não é mais fonte de verdade nenhuma. O critério correto, daqui pra frente, é: **a V2 (`transacoes`/tabelas relacionais) está certa contra a realidade (extrato bancário, comprovante, o que o usuário confirma que aconteceu)** — nunca "bate com o que o V1 tinha".

`vw_reconciliacao_v1_v2` continua útil só como **ferramenta de detecção** — ela aponta rápido onde uma transação real pode ter ficado pra trás na migração (foi assim que achei e fechei 8 caixas nesta sessão). Mas se depois de investigar a V2 está certa e o V1 é que estava errado/desatualizado/tinha um conceito diferente, **a V2 fica como está** — não adaptar a V2 pra "bater com o V1".

## ✅ Segurança — Passo 2 fechado (RLS travado, views corrigidas, RPCs revogadas)

Confirmado ao vivo (não por documentação) que 28 tabelas financeiras tinham policy de SELECT aberta pra `anon` (`qual=true`) — qualquer um com a chave pública do HTML lia tudo sem login. Corrigido:
- RLS travado nas 28 tabelas + `v1_v2_caixa_mapa` (SELECT exige JWT Firebase válido, mesmo padrão de `wallace_dados`).
- **19 views `SECURITY DEFINER`** (bypassavam RLS mesmo com as tabelas travadas) convertidas pra `SECURITY INVOKER`.
- `EXECUTE` das 5 RPCs de escrita revogado de `anon`/`PUBLIC` (a passagem de turno anterior dizia que isso já tinha sido feito — não estava, só 1 das 5 tinha sido revogada de fato).
- `search_path` corrigido em 7 funções.
- `service_role` (usado pelo GitHub Actions) tem `BYPASSRLS=true`, confirmado — nenhuma automação foi afetada.

Validado: `anon` lê 0 linhas de `transacoes` agora; `get_advisors(security)` sem nenhum achado `ERROR`; usuário confirmou ao vivo, logado, painel normal.

## ✅ Reconciliação financeira — 8 caixas fechadas em R$0,00 nesta sessão

Usando a técnica "consultar `wallace_dados` (Supabase) direto, nunca o arquivo `vars-caixas.js` local (que fica desatualizado)" pra achar transações reais que nunca migraram pra V2:

| Caixa | Causa raiz real | Status |
|---|---|---|
| Caixa Manutenção | 2 transações (`TX000214`/`TX000215`) presas em `status='pendente_classificacao'` + `AJUSTE-06-08` nunca lançado | ✅ R$0,00 |
| Caixa Lance | `AJUSTE-06-08` (-R$65,76, correção manual do usuário contra print real) nunca migrado | ✅ R$0,00 (resíduo era V2 ter 1 venda P2P a mais que o V1 nunca teve — não é falta, é V2 mais completa) |
| Caixa Saúde Família | `TX000213` preso em `pendente_classificacao` + `AJUSTE-06-08` ausente | ✅ R$0,00 |
| Caixa Aniversário Júlio | `TX000208` e `AJUSTE-06-08` totalmente ausentes | ✅ R$0,00 |
| Escola de Júlio, Caixa Seguro Emplacamento, Caixa Combustível, Caixa Eventos | Mesmo `AJUSTE-06-08` (rendimento pequeno, <R$3) nunca migrado em cada uma | ✅ R$0,00 nas 4 |

Todas promovidas no código (`hydrate-onda2-v2.js` e/ou `hydrate-onda3-caixalance.js`/`hydrate-onda3-livro-razao.js`, saldo + tabela de Livro Razão juntos, pra nunca ficar "card V2 + tabela V1").

**Correção de um erro registrado antes**: uma investigação anterior nesta mesma sessão concluiu "Caixa Saúde Família e Aniversário Júlio não existem na V2, precisam ser criadas do zero" — **isso estava errado**. As duas já existiam (`d15e8cbe-...` e `ffa94985-...`), só tinham transações reais faltando, mesmo padrão das outras. Não acreditar em "não existe" sem reconferir a query.

**PIX Vanessa e Caixa Bens Duráveis**: reavaliadas sob o critério novo (V2 contra a realidade, não contra V1) — **nenhuma das duas tinha problema real**. PIX Vanessa bate com o padrão real dos extratos MP (retirada do cofrinho → PIX pra ela). Bens Duráveis negativa é o comportamento desenhado (virou centro de custo separado numa sessão anterior, pode ficar negativa). Não mexi em nenhuma — estavam certas, a "divergência" era só contra um V1 irrelevante.

## ⚠️ Quase-duplicação evitada — lição registrada

Durante investigação de reconciliação de cartão (Visa Infinite 4844), assumi errado que "zero linhas em `transacoes` pra esse `cartao_id`" = "nada rastreado" e cheguei a inserir 41 transações de julho antes do usuário interromper ("vai duplicar"). Revertido na hora (`DELETE ... WHERE tx_legado LIKE 'TX4844-%'`, confirmado 0 linhas). Essas compras já estavam lançadas manualmente em outro mecanismo do sistema que não localizei antes de agir. **Regra**: nunca mais assumir "ausente numa tabela = nunca lançado" sem confirmar onde o dado real mora primeiro.

## ✅ 3 melhorias de mobile/UX entregues e testadas (DOM/CSS via preview local, sem login real)

1. **Busca sumia no mobile** (`display:none` fixo <780px, sem alternativa) — botão-ícone (`#headerSearchToggleBtn`) abre o campo como overlay. Testado.
2. **Barra de 22 categorias do Livro Razão** virava ~11 linhas de botão no celular antes de mostrar dado — vira faixa rolável horizontal só <640px.
3. **Link direto pra uma aba** (`index.html?aba=solar`) — bug real achado e corrigido: primeira versão usava `onDomPronto()` (roda cedo demais, `showMaster()` ainda não existia nesse ponto do carregamento); corrigido com `window.addEventListener('load', ...)`. Testado com e sem o parâmetro.

**Não validado com login real** — usuário deve conferir os 3 no celular/navegador de verdade.

## ✅ Bug estrutural do robô SAJ corrigido na raiz (não é mais só "rodar de novo")

Usuário reportou "de novo perdeu os dados do SAJ" (cards "Autoconsumo/Dependência da rede/Exportação da geração: Dados insuficientes"). Diagnóstico: `energia_solar_geracao_diaria` estava completa e correta até hoje (09/08, 30,49 kWh) — o problema era só a linha de hoje em `energia_solar_leituras` (leitura manual Energisa 03=69/103=412, criada às 23h25) ter `geracao_acumulada=NULL`.

**Causa raiz real** (achada lendo `scripts/sync/atualizar_geracao_saj.py` por completo): o script sempre escrevia o acumulado do inversor na leitura **mais recente por posição/data**, sem checar se essa leitura era efetivamente de hoje. Se o robô roda (09h ou 17h) ANTES da leitura manual da Energisa ser cadastrada, ele grava o número de hoje numa linha de ONTEM — e quando a leitura de hoje nasce depois, fica sem o campo, dependendo de sorte de ordem manual×robô.

**Corrigido nesta sessão** (`scripts/sync/atualizar_geracao_saj.py`, funções `atualizar_supabase` e `atualizar_v2_leitura_geracao_acumulada`): agora só grava `geracaoAcumulada`/`geracao_acumulada` se já existir uma leitura com `data == hoje` (V1 em `SOLAR_LEITURAS`, V2 em `energia_solar_leituras`); senão pula e loga aviso, sem nunca contaminar a linha errada. Commitado e enviado (`7a64293`).

**Segundo bug achado ao validar o primeiro** (autônomo, madrugada 09→10/08, usuário dormindo, pedido explícito "fique corrigindo as falhas"): o `hoje_str` usado pra comparar contra a coluna `data` era calculado com `datetime.now(timezone.utc)`, mas as leituras são datadas pelo dia civil de **Brasília**, não UTC. Isso faz "hoje" bater errado sozinho todo dia entre ~21h e meia-noite (horário de Brasília) — justo a janela em que o usuário mais lança leitura manual da Energisa à noite. Corrigido: novo `FUSO_BRASILIA`/`hoje_brasilia_str()` (UTC-3 fixo, Brasil não tem horário de verão desde 2019), usado no cálculo de `hoje_str` em `atualizar_supabase`. Confirmado por SQL direto no Supabase: a leitura de 09/08 (`b5f3fda0-...`) segue com `geracao_acumulada=NULL` — **esse valor histórico específico não vai ser preenchido sozinho** (a próxima execução agendada já vai calcular "hoje"=10/08, que não bate com a `data`=09/08 dessa linha) — não fabriquei o número; se o usuário quiser fechar esse buraco específico, precisa informar o total acumulado real de 09/08 (foto do Elekeeper) pra lançar manual. Dali em diante (leituras novas) o bug estruturalmene está corrigido nas duas frentes (linha errada E dia errado).

## Pendências remanescentes — ordem de prioridade pra próxima sessão

| Item | Prioridade |
|---|---|
| Leitura de 09/08 em `energia_solar_leituras` ficou com `geracao_acumulada=NULL` pra sempre — cards "Autoconsumo/Dependência da rede/Exportação da geração" mostram "Dados insuficientes" enquanto essa continuar sendo a leitura mais recente. **10/08: usuário confirmou que isso NÃO é pendência de bug** — ele não tem leitura em tempo real da Energisa (só de vez em quando, manual), já comprou um Energy Meter pra pegar dado direto do inversor mas ainda não instalou. Até a instalação, esse gap é esperado e reaparece a cada card entre leituras manuais — não tentar "resolver" de novo sem pedido explícito novo. Desbloqueia sozinho assim que o usuário lançar a próxima leitura 03/103 real (cria linha nova, robô SAJ preenche o acumulado dela no próximo ciclo agendado). | Baixa — comportamento esperado, não bug; reavaliar só depois do Energy Meter instalado |
| Ler `window.WALLACE_BOOT_TIMING` real (usuário já confirmou que funciona, nunca foi lido) — **não executável sem o usuário**: só existe depois de login real (iframe autenticado), e entrar credenciais/senha por conta própria é proibido pra qualquer agente | Alta — pedido explícito do usuário, mas trava em ação que só ele pode fazer (abrir DevTools console logado e colar aqui) |
| Classificar as 3 transações do LRW/LRV sem dono (R$282,71, `usuario_id=NULL`) — só o usuário pode dizer de quem são | Média — bloqueia fechar totalmente o domínio Caixa Variável/cartão |
| Cartões Mastercard/Visa (totais de fatura) — precisa reconciliação bancária manual real, não é SQL puro; **cuidado**: já teve 1 quase-duplicação nesse domínio nesta sessão | Média — grande, arriscado, precisa entender onde o dado já mora antes de mexer |
| LRC-limbo/LRCV — nunca teve modelagem de dado aprovada (diferente de LRW/LRV) | Baixa — decisão de arquitetura, não bug |
| Dependência de cron-job.org (externo, gratuito) pra automações do GitHub Actions, sem monitoramento de falha | Baixa — fora do alcance de qualquer agente sem conta do usuário |
| Campo de cartão na UI do "+ Lançar" (hoje só via SQL/Claude Code) | Baixa — dívida técnica de UI conhecida |

## Protocolo de sessão nova

1. Este arquivo.
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente (topo).
3. **Regra de ouro**: nunca comparar V2 contra V1 pra decidir se algo "está certo" — só contra a realidade. `vw_reconciliacao_v1_v2` é ferramenta de detecção de migração incompleta, não de validação.
4. Antes de assumir "essa transação não existe em `transacoes`, preciso inserir": procurar primeiro onde ela pode já estar rastreada por outro caminho (aconteceu 1x nesta sessão, quase virou duplicação real).
5. Antes de tocar em qualquer RPC/tabela financeira: a canalização de auth token já existe (`obterTokenAuthSupabase()`/`_headers()`/`__wallaceAuthHeader()`) — reaproveitar, não recriar.
6. `git status`/`git log` sempre antes de assumir pendente ou concluído — e antes de confiar em qualquer afirmação anterior tipo "essa caixa não existe" sem reconferir com uma query nova.
