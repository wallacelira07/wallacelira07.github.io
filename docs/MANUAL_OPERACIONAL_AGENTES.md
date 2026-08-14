# MANUAL OPERACIONAL DE AGENTES — Sistema Wallace Lira

Procedimento único, obrigatório para qualquer agente (Claude Chat, Claude Code, Copilot, ou humano) que opere este sistema. Objetivo: eliminar erros operacionais recorrentes — compra lançada só num lado, valor não sincronizado, atualização incompleta, correção feita "no escuro".

Este documento define **como agir**. Regras de negócio (cascata de reembolso, caixas, ciclo financeiro) estão em `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` — leia os dois, não se sobrepõem.

**Este é o documento mestre.** `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (arquivo `.md` real no Google Drive, pasta `Livro Razão/Agentes/` — entrada do Claude Chat, que não tem acesso a este repositório) deriva deste manual e deve ser mantido em sincronia com ele; nunca o contrário. Ver seção 11.

---

## 0. Nível de Confiança da Informação

**Registrado formalmente em 08/08/2026, pedido explícito do usuário — obrigatório para qualquer resposta que cite dado do Sistema Wallace, em qualquer agente.**

Toda afirmação sobre o sistema carrega um nível de confiança. Classificar mentalmente antes de responder, e deixar o nível explícito sempre que não for óbvio pelo contexto:

| Nível | O que é | Exemplo |
|---|---|---|
| **A** | Supabase verificado — consulta direta ao banco, view verificada, RPC verificada nesta sessão | `SELECT saldo FROM vw_saldo_v2_por_caixa WHERE caixa='Variável'` executado agora |
| **B** | Repositório verificado — código lido, workflow lido, commit/`git log` conferido nesta sessão | "`hydrate-roc.js` blinda `comparacaoCDI` contra `null`, linha 43" |
| **C** | Informação fornecida pelo usuário — print, extrato, valor dito na conversa, sem verificação cruzada | "Você disse que a fatura fechou em R$435,00" |
| **D** | Inferência, hipótese, suposição — dedução, memória de sessão anterior não reconferida, extrapolação | "Provavelmente ainda está assim, mas não confirmei agora" |

**Regra obrigatória**: A > B > C > D. Ao decidir o que responder, preferir sempre o nível mais alto disponível — nunca aceitar D quando A é alcançável na mesma sessão (rodar a query, ler o arquivo).

**Nunca apresentar D como fato.** Frases como "o saldo é X" sem verificação são proibidas quando a informação é hipótese — usar "acho que", "não confirmei, mas", "seria preciso checar para confirmar".

**Aplicação específica ao Claude Chat** (Supabase sim, repositório/código-fonte não — ver "Fronteira Chat × Code", seção 1.2): dado que ele mesmo consultou/gravou agora no Supabase é Nível A de verdade. Qualquer afirmação sobre código-fonte, arquitetura, ou histórico de commits continua começando no Nível C (usuário forneceu) ou D (hipótese) — isso sim é Nível A/B exclusivo do Claude Code. Se a pergunta exige entender/mudar código ou estrutura, dizer isso explicitamente e encaminhar para uma sessão do Claude Code (ver seção 11.4).

---

## 1. Fonte única da verdade

**ATUALIZADO 12/08/2026 — `wallace_dados` foi DESLIGADA de vez.** A busca que sobrepunha `wallace_dados` ao `VARS` (`Object.assign(VARS, dr)`) foi **removida do HTML** (`Sistema_Wallace_Lira_Completo.html`, "sepultamento final da V1") — o site **não lê mais essa linha**, em nenhuma hipótese. Editar `wallace_dados` hoje não tem efeito nenhum no que o usuário vê. Se qualquer documento/memória mais antigo disser o contrário, este parágrafo tem precedência.

**A fonte real hoje é a tabela `indicadores`** (par nome/valor, uma linha por indicador — `cartaoMBTotal`, `mbLRWConfirmado`, etc.) para os totais agregados, e `transacoes`/`caixas`/demais tabelas V2 relacionais para tudo que é lançamento individual. Ver seção 1.1 pra tabela completa por domínio.

**Existem DUAS coisas diferentes chamadas "V2" neste projeto — não confundir:**

| | V2 "arquitetural" | V2 "relacional" |
|---|---|---|
| O que é | `VARS`/`REG` clássicos virando módulos (`src/financeiro/**`) | Tabelas normais no Supabase (`caixas`, `transacoes`, `categorias`...) |
| Alimenta o painel? | **Sim** — é literalmente o V1, só reorganizado em arquivo | **Não, ainda não** — dado paralelo, infraestrutura de apoio (ver `docs/decisions/PLANO_UNIFICACAO_V1_V2.md`) |
| Documento de referência | `docs/architecture/ARCHITECTURE.md` | `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` |

Se alguém pedir "atualiza a V2", **pergunte qual das duas** antes de agir — já causou confusão real em sessões anteriores.

**Arquivo local (`src/financeiro/**/vars-*.js`) é espelho, não fonte.** Editar só o arquivo local **não muda o que aparece no site ao vivo** — o Supabase sobrescreve por cima a cada carga. Todo dado financeiro real precisa ir nos dois lugares.

---

## 1.1 V2 como sistema principal — modo de operação nativo (regra permanente, 08/08/2026)

**Mudança de direção formal do usuário**: o projeto passou da fase de transição. Todo agente Claude (Web ou Mobile) aberto neste projeto deve partir da premissa **"a V2 é o sistema principal"** e **operar** nela — não apenas consultar. A V1 (`wallace_dados`) é legado: só usar quando não existir equivalente V2, ou quando houver exceção formal documentada (ver `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` e a lista da seção 2 abaixo).

Isso não substitui a seção 2 (fluxo de lançamento) nem a seção 1 (fonte que alimenta o painel hoje) — é a lente com que qualquer agente novo deve ler as duas: ao decidir onde escrever/ler um dado, **primeiro perguntar "existe RPC/tabela/view V2 pra isso?"**, e só cair pro V1 se a resposta for não.

**Por domínio, o que já existe na V2 (operar direto, não só ler) — confirmar sempre contra a lista viva da seção 2, que é a fonte de verdade sobre o que está migrado**:

| Domínio | Estruturas V2 | Observação |
|---|---|---|
| Compras / transações | `transacoes` (+ `cartao_id`, `usuario_id`, `afeta_saldo_real`) | Lançamento definitivo via `lancar_transacao_manual()` quando o domínio já for V2-exclusivo (seção 2) |
| Caixas | `caixas` (+ `ciclo_inicio_em`), `vw_saldo_v2_por_caixa` | Nunca editar saldo direto — sempre via `transacoes` (regra 2.4). Caixas operacionais somam só transações com `data >= caixas.ciclo_inicio_em` (NULL = caixa cumulativa, sem reset) — **atualizar essa coluna a cada virada de ciclo real** (quando o aporte mensal do novo ciclo é lançado), senão o ciclo novo some com o antigo. |
| Patrimônio | `patrimonio`, `financiamentos` | Exceção: Caixa Lance ainda V1 |
| Cartões | `cartoes` | Mapa de titularidade (Mastercard Black/Visa) migrado Wave B1 |
| Livros Razão | `transacoes` filtradas por caixa/pessoa; `vw_compromisso_cartao_por_pessoa` (LRW/LRV) | LRR/LRS/LRC ainda não têm array V1 migrado — não assumir que existe |
| Parcelamentos | `parcelas` | — |
| Energia solar | `energia_solar_leituras`, `energia_solar_geracao_diaria`, `ciclos_solares`, `vw_ciclo_solar_aberto`, `vw_ciclo_solar_historico` | Distinguir sempre geração diária × acumulada × crédito do ciclo × histórico de ciclos fechados |
| Investimentos / ROC | `investimentos` | Schema ainda não comporta strike/prêmio/vencimento de opções — ROC continua calculado em V1 até esse gap fechar |
| Reembolsos (cascata Wärtsilä) | `reembolso_wartsila_ciclo`, `reembolso_wartsila_recebimentos` | + `transacoes` da caixa "Provisionado Wärtsilä" |
| Empréstimos internos (LREI) | `emprestimos_internos` | — |
| Indicadores | `indicadores` | Preferir sempre a `indicadores` a constante hardcoded no frontend, quando o valor mudar com o tempo |

**Critério de sucesso** (o que um agente novo, sem memória de sessões anteriores, precisa conseguir fazer só lendo este manual): registrar compra, registrar pagamento, atualizar caixa, atualizar patrimônio, atualizar cartão, atualizar livro razão, atualizar parcelamento, atualizar energia solar, atualizar investimento, atualizar reembolso, atualizar indicador — usando a estrutura V2 correspondente como primeira escolha, com a V1 tratada só como legado/exceção/domínio ainda não migrado.

**Regra pra lançar uma transação nova, corrigida 09/08/2026 (versão anterior deste texto, de mais cedo no mesmo dia, exigia atribuir `tx_legado` manualmente como critério de existência — isso mudou, ver abaixo)**:

Pra uma transação **contar no saldo da caixa** (`vw_saldo_v2_por_caixa`), ela só precisa de 4 coisas, todas nativas da V2:
- `caixa_id` correto;
- `status = 'confirmado'`;
- `afeta_saldo_real = true`;
- `data` real da compra, dentro do ciclo da caixa (`>= caixas.ciclo_inicio_em`).

`tx_legado` **não é mais critério de existência/visibilidade no saldo** — a view não checa mais essa coluna nem o array V1 (`wallace_dados`). Isso foi uma mudança de arquitetura deliberada em 09/08/2026 (`vw_saldo_v2_por_caixa` reescrita, ver `docs/decisions/` da data): antes, uma transação com `tx_legado` preenchido só contava se também existisse espelhada em `wallace_dados` — isso escondeu dinheiro real de 3 transações (PGV, PIX Vanessa, Bens Duráveis) por dias, sem erro nenhum no console.

`tx_legado` continua **recomendado, não obrigatório**: sem ele, a transação aparece com "—" na coluna TX das tabelas de Livro Razão (cosmético, não afeta saldo). Se for atribuir um:
1. Checar o maior TX existente: `select max(tx_legado) from transacoes where tx_legado ~ '^TX[0-9]{6}$';`.
2. `update transacoes set tx_legado = 'TX0002XX' where id = '<uuid retornado>';`, próximo número sequencial (nunca reutilizar, nunca pular).
3. Par espelhado (saída de uma caixa = entrada em outra) recebe o **mesmo** código nos dois lados — padrão já usado em `TX000150`/`TX000223`.

**Isso não muda nenhuma regra de segurança já existente**: usuário confirma antes de lançar (seção 2.1), nunca editar saldo/placeholder direto (seção 2.4), dry-run antes de `UPDATE`/`DELETE` real (seção 4), avisar antes de commit/push (seção 8) — a V2 ser "principal" é sobre **onde** o dado mora, não sobre relaxar **como** ele é alterado.

---

## 1.2 Fase 5 — fechamento do ciclo de gravação (registrado 08-09/08/2026, importante para qualquer agente novo)

Até 08/08/2026, o formulário "＋ Lançar" (botão flutuante do painel) gravava a transação na V2 (tabela `transacoes`, via RPC `lancar_transacao_manual`) mas o painel visível **não refletia isso sozinho** — o dado ficava "gravado mas invisível" até alguém atualizar `wallace_dados` manualmente. Isso já causou perda real de visibilidade de uma transação (PIX de R$652, aprovado na Inbox e nunca lançado de fato).

**Corrigido (commit `7139966`)**: o próprio clique em "Salvar" agora invalida o cache do `WallaceFinanceService` e re-executa os módulos V2 (Caixas, Patrimônio, Wärtsilä/Reembolsos, LREI, Livro Razão, P2P, Parcelamentos) automaticamente — saldo, Balanço e Resumo Executivo se atualizam na mesma ação. **Validado com evidência real de banco** (teste reversível) e **em uso real** desde 08/08/2026 (compras de cartão registradas via `lancar_transacao_manual` com `p_cartao_id` preenchido — ex: medidor solar R$79,79 e cabo/quadro R$149,20, ambos Caixa Bens Duráveis, cartão 4628).

**Limitação conhecida, deliberada**: Necessidade Total/Modo Operacional/Saldo do Ciclo (topo do Resumo Executivo) continuam vindo de `VARS.CICLO_SNAPSHOTS`/`ciclos_financeiros_snapshots`, não somam `transacoes` ao vivo — recalcular isso é modelagem nova significativa, fora de escopo até nova decisão do usuário.

**Exceção residual**: 4 caixas (Caixa Lance + Manutenção + Saúde Família + Aniversário Júlio) continuam exibindo o valor V1 por divergência formal não resolvida — lançar nelas grava normal, mas o número na tela não se move até essa exceção ser revisitada por decisão do usuário.

**PIX Geral Vanessa promovida pra V2 em 09/08/2026** (saiu da lista acima) — investigação Nível A completa fechou a causa raiz: `TX000219`/`TX000221` estavam sob `caixa_id` errado por confusão de sigla numa migration (corrigido, `UPDATE` + `audit_log`), e a hipótese de um saldo "R$338,00" foi encerrada (era valor órfão em `wallace_dados`, nunca chegava à tela — confirmado em navegador real). O painel agora exibe o saldo V2 diretamente (`hydrate-onda2-v2.js`, `aceitarDivergenciaConhecida:true`), incluindo a linha do Balanço e a barra/percentual de meta (que mostra o valor real sem capar em 100%, pedido explícito do usuário — a caixa pode aparecer acima da meta de propósito). O residual de ~R$256 entre V1 e V2 é aceito como consequência esperada da transição (lançamentos que nascem só na V2), não mais tratado como divergência a investigar — mas a telemetria de comparação continua ativa no console (`window.WALLACE_ONDA2_V2_RELATORIO`). Ver `docs/changelog/PASSAGEM_DE_TURNO.md` pro detalhe completo da investigação.

**Cartões**: o formulário "＋ Lançar" da UI só expõe campo de CAIXA, não de cartão — mas a RPC `lancar_transacao_manual` já aceita `p_cartao_id`, então uma compra no cartão pode ser lançada via Claude Code (SQL direto) apontando `cartao_id` real, mesmo sem a UI ter esse campo ainda.

**Fluxo operacional pra registrar uma compra (REVERTIDO 09/08/2026, decisão explícita do usuário — corrige a versão anterior deste texto, que impunha um fluxo de 2 passos "Chat só interpreta, usuário lança")**: essa não é a arquitetura que o usuário quer. **O Claude Chat (mobile/web) tem conector Supabase ativo e deve gravar direto** — lê a nota/print/texto da compra e já lança via `lancar_transacao_manual` (ou SQL direto, mesma capacidade do Claude Code), sem passar a tarefa de volta pro usuário clicar em "＋ Lançar". O fluxo de handoff manual nunca deveria ter sido a regra padrão — foi uma decisão de sessão anterior que não refletia a intenção real do usuário, revertida assim que ele apontou o problema.

O que continua valendo, sem exceção (regras permanentes, não específicas deste fluxo):
- **Usuário confirma antes de lançar** (seção 2, regra 1) — nunca aplicar dado financeiro sem confirmação explícita, mas a gravação em si é do próprio Chat, não repassada.
- **Nunca inventar campo sem evidência** (seção 4, P1) — data/valor/estabelecimento/caixa/cartão vêm do comprovante real, nunca chutados.
- **`tx_legado` recomendado, não mais obrigatório** (ver seção 1.1) — a view de saldo (`vw_saldo_v2_por_caixa`) não depende mais dele desde a migration de `ciclo_inicio_em` (09/08/2026); sem ele, só aparece "—" na coluna TX do Livro Razão (cosmético).
- Nunca descrever qualquer variação do fluxo Excel antigo (TX000xxx solto sem gravação real, SWP_INPUT, ERP V10/V11, `recalc.py`) — esse fluxo está desativado desde 08/08/2026.

**Fronteira Chat × Code (esclarecida na mesma decisão, 09/08/2026): "o Chat tem que fazer tudo, menos mudanças arquitetônicas".** Isso divide por TIPO de operação, não por "quem tem acesso":
- **Claude Chat faz sozinho, sem passar pro usuário nem pro Claude Code**: qualquer `INSERT`/`UPDATE` de **dado** — lançar transação (`lancar_transacao_manual`/SQL direto), corrigir valor/descrição/categoria de um registro existente, atualizar `tx_legado`, ajustar saldo via novo lançamento. Isso é rotina operacional, não arquitetura.
- **Fica só com Claude Code**: qualquer mudança de **estrutura** — `ALTER TABLE`, criar/alterar `VIEW`/`FUNCTION`/`RPC`, migration (`apply_migration`), mudar regra de cálculo compartilhada (ex: a fórmula de `vw_saldo_v2_por_caixa`, o que conta como "Comprometido" da Caixa Variável), editar código-fonte do site (`.js`/`.html`/`.css`). Esse tipo de mudança afeta todo mundo que usa o sistema, precisa do dry-run/validação/commit-com-aviso da seção 4/7/8 — o Chat não tem (e não deve ter) essa ferramenta.
- Na dúvida se algo é "dado" ou "arquitetura": se a ação é sobre uma linha específica (uma compra, uma caixa, um empréstimo), é dado — Chat resolve. Se a ação muda o que TODA linha futura vai fazer (uma fórmula, uma regra, uma coluna nova), é arquitetura — só Claude Code.

Se o Claude Chat perguntar se deve "criar" uma caixa que parece não existir (ex: "Caixa Bens Duráveis"), é sinal de que está usando conhecimento desatualizado (conversa antiga fora do Project, ou memória de sessão anterior) — a lista real de caixas está na tabela `caixas` do Supabase, não em nenhum "SWP_INPUT"/ERP. Orientar o usuário a abrir uma conversa nova dentro do Project.

---

## 1.3 Lançamento de compra em cartão de crédito — procedimento correto (NOVO 12/08/2026)

**Registrado depois de uma madrugada de reconciliação onde Claude Chat e Claude Code editaram os mesmos campos agregados (`indicadores.mbLRWConfirmado`/`cartaoMBTotal`) de formas incompatíveis, sem se coordenar — um sobrescreveu o outro sem aviso, e o usuário não conseguiu confiar no painel por horas. Isso não pode se repetir.**

### 1.3.1 A transação individual é a fonte — o agregado é derivado, nunca editado à mão como atalho

Toda compra de cartão **sempre** vira uma linha nova em `transacoes`, com estes campos preenchidos sempre que a evidência existir (comprovante/print/fatura):

| Campo | Obrigatório? | Regra |
|---|---|---|
| `caixa_id` | Sim | Caixa que "paga" essa fatura — normalmente Caixa Variável, mas pode ser Churrasco/Bens Duráveis/Provisionado Wärtsilä/etc (ver seção 1.3.4) |
| `usuario_id` | Sim, se souber quem comprou | Sem isso, a compra **some** de `vw_compromisso_cartao_por_pessoa` e `vw_transacoes_cartao_variavel_por_pessoa` (o `JOIN usuarios` é interno — filtra fora silenciosamente). Achado real 12/08: 6 lançamentos do Pluggy entraram sem `usuario_id` e sumiram da lista LRW por dias sem erro nenhum. |
| `cartao_id` | Sim, se souber qual cartão | Idem — sem isso a compra não aparece em nenhuma view por cartão. Cartão virtual avulso/de uso único (ex: cartão temporário do Mastercard Black) ainda é um `cartao_id` real — usar o cartão "MB virtual" existente em `cartoes`, não deixar `NULL` só porque é avulso. |
| `data` | Sim | Data real da compra (comprovante), não a data do lançamento |
| `tipo` | Sim | `saida` |
| `afeta_saldo_real` | Sim | `false` para compra de cartão (é compromisso de fatura futura, não saída de caixa agora) |
| `ja_orcado_assinaturas` | Sim, se for assinatura já contada em `cronograma_assinaturas` | Evita contar 2x (mesma classe do achado TX000228/Churrasco) |
| `tx_legado` | Recomendado | Próximo `TX0002XX` sequencial, nunca reutilizar |
| `origem` | Sim | `'manual'` (você digitou/leu o comprovante agora), `'pluggy'` (sincronização automática), `'reconciliacao'` (lote de reconciliação histórica) |

**Depois disso — nunca antes** — os agregados (`indicadores.mbLRWConfirmado`, `cartaoMBTotal`, etc.) podem ser recalculados. Eles são **espelho** do que já está em `transacoes`, não um número que se edita direto como atalho pra "economizar um passo". Editar só o agregado, sem a linha em `transacoes`, é exatamente o que causou o problema desta madrugada — parece mais rápido, mas quebra toda auditoria futura (o valor existe, mas não tem como provar de onde veio).

### 1.3.2 Antes de editar um `indicadores` agregado, checar se outro agente já mexeu

**`indicadores` agora tem trigger de auditoria** (`trg_audit_indicadores`, criado 12/08/2026, mesmo padrão de `transacoes`/`caixas`) — toda mudança fica em `audit_log`. Antes de atualizar `mbLRWConfirmado`/`cartaoMBTotal`/qualquer indicador financeiro:

```sql
select campo, valor_anterior, valor_novo, origem, alterado_por, alterado_em
from audit_log
where tabela = 'indicadores' and registro_id = (select id from indicadores where nome = '<nome>')
order by alterado_em desc limit 5;
```

Se o último registro for de **menos de algumas horas atrás** e a origem/valor não bater com o que você está prestes a escrever, **pare e avise o usuário** antes de sobrescrever — pode ser outro agente (Chat ou Code) no meio de um trabalho, não assuma que seu valor está mais certo só porque é o seu.

**Sempre `set_config('audit.origem', ...)` antes da operação** (mesma regra já valia pra `transacoes`/`caixas`, seção 3) — sem isso o `audit_log` grava `origem='sistema'`, genérico demais pra reconstruir o que aconteceu depois.

### 1.3.3 Limbo (compra entre o fechamento da fatura e a virada do ciclo) sempre pertence ao ciclo da frente

Regra de negócio já existente (`REGRA_LIMBO_FATURA_MB_CICLO`, seção 6), reforçada aqui porque foi a causa de 2 bugs reais na mesma sessão (12/08): uma compra feita entre o **fechamento da fatura** (~dia 22) e a **virada do ciclo financeiro** (dia 25) é do cartão, mas conta **no ciclo que está começando**, não no que está fechando — mesmo a `data` da transação sendo anterior a `ciclo_inicio_em`.

Isso tem 2 efeitos práticos que todo agente precisa saber:
1. **Nos totais agregados** (`getComprometidoCaixaVariavelV2`, etc.): a transação do limbo não entra na soma automática (filtro `data >= ciclo_inicio_em`, correto por design) — precisa ser **somada à parte, uma vez, na virada do ciclo**. Se isso não for feito manualmente, o valor simplesmente não conta em lugar nenhum (achado real: R$87,96 de 2 compras do limbo ficaram "perdidas" por não terem sido pré-debitadas na virada de 25/07).
2. **Nas listas detalhadas** (LRW/LRV): mesma exclusão por data — se a transação do limbo for relevante o suficiente pra aparecer na lista (não só no agregado), ela precisa ser reinserida manualmente depois da carga assíncrona da V2 (ver `hydrate-onda3-lrwlrv.js` pra um exemplo já implementado).

### 1.3.4 Nem toda compra de cartão é da Caixa Variável

Qualquer caixa pode ter gasto no cartão, não só a Caixa Variável — o que muda é só o `caixa_id`. Confirmado em produção (12/08): Caixa Variável, Provisionado Wärtsilä (corp, reembolsável pela Wärtsilä), Caixa Churrasco, Caixa Bens Duráveis já têm compra real no cartão. A lógica é sempre a mesma: **a caixa é de onde o dinheiro sai (orçamento); o cartão é só o meio de pagamento; a transação em `transacoes` é o que liga os dois.** Antes de lançar, perguntar "essa compra é do dia a dia geral (Caixa Variável) ou tem uma caixa temática própria (Churrasco, Bens Duráveis, etc.)?" — nunca assumir Caixa Variável por padrão sem checar.

## 1.4 Estimador de Salário — calcular `liquidoProjetadoProximoCiclo` a partir da folha de ponto (NOVO 12/08/2026)

Todo mês chega uma folha de ponto (PDF da Wärtsilä) com as horas do período e a data de pagamento dos adicionais (~25 do mês seguinte). O usuário pediu esse cálculo antes (via Claude Chat) sem deixar a metodologia documentada — registrado aqui pra nenhum agente precisar reconstruir do zero nem reabrir as mesmas perguntas.

**Fonte da verdade, sempre consultar primeiro:**
```sql
select nome, valor from parametros_gerais where nome = 'taxasHoraFolhaPontoWartsila';
```
Contém: `salarioBaseFixoMensal`, taxas por hora (`horaExtra50`, `horaExtra100`, `bancoDeHoras50`, `adicionalNoturno20`, `adicionalSobreaviso`), `dsrMultiplicador`, e as 2 decisões já confirmadas pelo usuário (não perguntar de novo):
- **Hora Interjornada 50%** usa a mesma taxa de Hora Extra 50%.
- **Periculosidade Campo II** (horas na folha) não tem taxa própria — já embutida nos 30% fixos do salário-base, é só registro.

**Fórmula:**
```
liquidoProjetadoProximoCiclo = salarioBaseFixoMensal + (Σ horas_adicional × taxa_adicional) × dsrMultiplicador
```
DSR aplica só sobre a soma dos adicionais, nunca sobre o salário-base.

**Ao recalcular pra um mês novo**, gravar em `parametros_gerais`:
1. `liquidoProjetadoProximoCiclo` (valor final) — já é lido automaticamente pelo boot (`app.js`, bloco `WALLACE_PARAMETROS_GERAIS_V2`), sobrescreve `VARS.liquidoProjetadoProximoCiclo` sem precisar editar código.
2. `liquidoProjetadoProximoCiclo_memoria_calculo` (objeto com o detalhamento: horas de cada adicional, subtotal com/sem DSR, data do cálculo) — só rastreabilidade, não é lido pelo site, é pra auditoria/próximo agente conferir a conta.

Se `salarioBaseFixoMensal` mudar (reajuste salarial confirmado pelo usuário), atualizar em `taxasHoraFolhaPontoWartsila` — não duplicar o número em outro lugar.

---

## 1.5 Criar uma caixa nova — toda caixa tem que nascer com Livro Razão (NOVO 12/08/2026)

**Regra permanente do usuário, pedida mais de uma vez** (05/08/2026, comentário "parte 99, pedido repetido do usuario" em `render-livros-variaveis.js`; repetida de novo em 12/08/2026 quando a caixa Emagrecimento nasceu só com card de saldo). Motivo, nas palavras do usuário: **"sempre que houver caixa deve haver um livro, é lá que haverá auditoria"** — pra ele, o Livro Razão não é cosmético, é onde a auditoria lançamento-a-lançamento acontece. Uma caixa só com saldo agregado, sem LR, fica sem rastreabilidade individual mesmo que o número esteja certo.

Sempre que uma caixa nova for criada (`INSERT INTO caixas` ou equivalente), entregar **na mesma sessão**, sem esperar o usuário pedir de novo:

1. **A caixa em si** (`caixas`, ver seção 2 pra domínio V2).
2. **Aba de Livro Razão dedicada** em `Sistema_Wallace_Lira_Completo.html`, seção "Livros razão":
   - Botão: `<button class="tab" id="lrTabBtn_<id>" onclick="showLR('<id>',this)">LR?? - Nome</button>`
   - Pane: `<div id="<id>" class="pane"><table>...</table><div class="tfoot">...</div></div>`, mesma estrutura de colunas (TX/Data/Descrição/Tipo/Valor) das demais.
3. **Entrada em `ONDA3_LR_MAPA`** (`src/financeiro/caixas/hydrate-onda3-livro-razao.js`) — busca as transações reais da caixa na V2 automaticamente, sem precisar reescrever a lógica de novo.
4. **Se fizer sentido pra Busca Global**, registrar em `LIVROS_BUSCAVEIS` e `LIVRO_PARA_TAB_LR` (`src/dashboard/navigation/dashboard-navegacao.js`) — permite clicar numa TX e cair direto na aba certa.

Exemplo de referência (feito certo): caixa Emagrecimento, 12/08/2026 — commit que criou a aba LREM junto com a caixa.

---

## 2. Fluxo de lançamento de transações

**REGRA NOVA (08/08/2026, mudança de direção arquitetural do usuário): "V2 é a fonte real, V1 é legado" — não perpetuar convivência permanente.** Antes de seguir os passos abaixo, checar a tabela de domínios da seção 1: se o domínio for um dos já migrados (fonte V2 exclusiva), o lançamento vai **direto na tabela V2 correspondente**, e os passos 2-3 abaixo (escrever em `wallace_dados`/`vars-*.js`) **não se aplicam** a esse domínio — só aos domínios ainda listados como V1.

**Domínios já V2-exclusivos (não escrever mais em `wallace_dados` para eles)**: Patrimônio (exceto Caixa Lance) → tabelas `patrimonio`/`financiamentos`; Investimentos/ROC → `investimentos`; LREI → `emprestimos_internos`; Cascata Wärtsilä → `reembolso_wartsila_ciclo`/`reembolso_wartsila_recebimentos` (+ `transacoes` da caixa "Provisionado Wärtsilä"); Parcelamentos → `parcelas`; P2P → `indicadores` (chaves `P2P - *`); Caixas já reconciliadas (10 de 18) + Livro Razão dessas mesmas caixas + LRW/LRV (totais) → `transacoes` direto (**endurecido 08/08/2026, Wave A** — essas 3 frentes deixaram de ter fallback silencioso pro V1, mesmo padrão `⚠ Indisponível (V2)` dos domínios acima); Titularidade/mapa de cartão Mastercard Black/Visa (`CARTAO_PLUGGY_MAPA`) → tabela `cartoes` (**migrado 08/08/2026, Wave B1**, `pluggy-reconciliacao.js`).

**Exceção arquitetural formal (não é pendência, ver `docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md`)**: `cartaoMBTotal`/`cartaoInfiniteTotal`/`mercadoPagoFatura` (headline totals de fatura) nunca serão derivados só da V2 — reconciliados à mão contra extrato real do banco, "a fatura sempre vence". Diferente de Assinaturas/Recorrências (Mastercard Black/Visa), que são pendência real de dado (23 de 27 transações "Assinaturas" sem `cartao_id`), não exceção de negócio.

1. **Usuário confirma antes de lançar.** Regra permanente — nunca aplicar dado financeiro sem confirmação explícita. **Exceção única e explícita, pedida pelo usuário em 12/08/2026**: itens da Inbox Financeira (Pluggy/Mercado Pago) — ver regra 6.
2. **Domínio ainda V1** (ver seção 1 e lista acima): aplicar nos 2 lugares, na mesma operação:
   - Arquivo `.js` local relevante (`src/financeiro/**/vars-*.js`).
   - A linha `wallace_dados` no Supabase (`UPDATE ... SET dados = dados || jsonb_build_object(...)` ou `jsonb_set(...)`).
3. **Antes de editar uma chave no Supabase, confirmar que ela existe** (`SELECT jsonb_object_keys(dados) FROM wallace_dados WHERE id=1`) — nem toda chave do `VARS` está espelhada lá; se não existir, criar como chave nova em vez de assumir.
4. **Nunca editar placeholder de saldo direto** (`caixaLance`, `caixaVariavelSaldoReal` etc.) — são sempre recalculados por `calcularSaldoCaixa()`/`recalcularAgregadosDerivados()` a partir dos arrays de transação. Editar o array, nunca o resultado.
5. **Seguir a cascata/regra de negócio aplicável** antes de decidir o destino (ver Política Interna seções 3-5) — não assumir "vai pra Caixa Lance" sem checar a cascata do reembolso.

   **5a. Procedimento validado da Cascata de Reembolso Wärtsilä (13/08/2026, depois de 2 erros reais cometidos e corrigidos na mesma sessão — leia antes de processar qualquer TED/reembolso novo, vale pra qualquer agente, inclusive Claude Chat):**
   - As 5 pernas da cascata (Fatura Wärtsilä, MP corporativo, Cartão corp. pessoal, MP pessoal, Sobra) são **conceitos de cálculo**, não necessariamente 5 transações separadas — só viram transações reais quando o dinheiro precisa fisicamente sair de uma caixa e entrar em outra.
   - **Perna 4 (MP pessoal) nunca precisa ser perguntada ao usuário** — `perna_mp_pessoal_provisionado` é `NULL` de propósito em `reembolso_wartsila_ciclo` (fora do escopo dessa tabela). O valor real é a soma de `vw_parcelamentos_v2` filtrado por `origem_array='PARCELAMENTOS_MP'` e `status='ATIVO'`. Se outro agente (ou o Chat) travar pedindo esse valor ao usuário, está ignorando essa fonte já existente.
   - **Cada cartão/serviço tem sua PRÓPRIA caixa — nunca misturar reembolsos de cartões diferentes numa caixa só.** Erro real cometido: mandar a perna 2 (MP corporativo) e a perna 4 (MP pessoal) direto pra Caixa Lance. Correto: essas 2 pernas (que são do Mercado Pago) vão pra caixa "Mercado Pago"; a perna 3 (cartão corporativo pessoal) vai pra caixa "Mastercard/Infinite"; só a SOBRA final (o que não pertence a nenhuma fatura específica) vai pra Caixa Lance.
   - **Um valor de perna coincidir exatamente com uma LREI ativa NÃO significa que são a mesma coisa.** Erro real cometido: perna 2 do ciclo 2026-07 era R$266,23 e a LREI0003 (dívida ativa) também era R$266,23 — quitei a LREI0003 usando a perna 2, errado. A LREI0003 tinha sido criada por uma fatura de um ciclo ANTERIOR (data do empréstimo diferente da data do ciclo Wärtsilä em questão) — **sempre conferir a `data_emprestimo` da LREI contra o `ciclo_referencia` do reembolso antes de vincular os dois**, nunca só pelo valor bater.
   - **Transações reais de cartão corporativo (`cartao_id` preenchido) usam `caixa_id='Provisionado Wärtsilä'` DE PROPÓSITO, mesmo não sendo dinheiro que passou por lá de fato** — é o mecanismo que alimenta o Livro Razão Corporativo (LRC), ver `WallaceFinanceService.getTransacoesCorporativoCartaoDetalhe()` em `app.js` (filtro literal `caixa_id=eq.<id Wärtsilä>&cartao_id=not.is.null`). Não "corrigir" esse `caixa_id` achando que é erro de dado sem antes grepar esse filtro.
   - **Sempre apresentar a tabela de divisão como PLANO antes de fazer qualquer `INSERT`/`UPDATE` real**, mesmo com autorização geral de commitar sozinho — regra pedida explicitamente pelo usuário depois do 2º erro ("você não pode fazer movimentações sem eu confirmar a realidade delas"). Só executar depois de confirmação explícita linha por linha.
   - **"Aporte" ≠ "Empréstimo Interno"**: quando a sobra de um reembolso cobre uma caixa negativa, isso é um APORTE (categoria "Financeiro", sem criar LREI) se o dinheiro é do próprio usuário/reembolso — só vira LREI quando é o saldo PRÓPRIO de outra caixa (ex: Caixa Lance) sendo emprestado. Confundir os dois cria uma dívida interna que não deveria existir.
6. **Inbox Financeira: gestão autônoma pelo agente, sem envolver o usuário (decisão de 12/08/2026).** Motivo: o fluxo `inboxAprovar()`/`inboxRejeitar()` da UI nunca lança sozinho — só pré-preenche o formulário "+ Lançar", que precisa de clique manual em Salvar, e isso já causou pelo menos 1 transação "fantasma" (`R$652`, aprovado mas nunca lançado — ver [[project_pendencias_0807]]). O usuário não quer mais clicar aceitar/rejeitar. Nova regra: qualquer agente que abrir uma sessão neste projeto deve, sem perguntar, processar `mercadopago_eventos` (`status_triagem='pendente'`) e os itens novos de `pluggy_transacoes` do mesmo jeito feito em 12/08/2026:
   - **Duplicata confirmada** (bate por valor absoluto + janela de data com uma transação já existente, ou é mecânica interna do "cofrinho" Mercado Pago — descrições `Dinheiro reservado/retirado Caixa X`, que já são espelhadas pelas transações reais da caixa) → marcar `status_triagem='rejeitado'`, não lançar nada.
   - **Item novo com evidência forte** (valor+data batem com `cronograma_boletos_fixos`, regra de `regras_classificacao`, ou descrição inequívoca) → `INSERT` direto em `transacoes` (mesmos campos do RPC `lancar_transacao_manual`: `origem='manual'`, `status='confirmado'`) e marcar `status_triagem='aprovado'`.
   - **Exceção: categoria "Assinaturas" nunca é lançada por esse processo** (regra do usuário, 12/08/2026: "assinaturas eu nunca conto quando são pagas, porque já são gastos fixos" — já orçadas à parte, lançar de novo duplicaria o orçamento). Se o item bater com regra de assinatura conhecida (Netflix/Spotify/Anthropic/MeliMais/etc), marcar `status_triagem='rejeitado'` sem lançar, mesmo que seja cobrança nova/legítima.
   - **CORRIGIDO 12/08/2026 (mesma sessão, o agente lançou e teve que reverter): os 9 boletos de `cronograma_boletos_fixos` NUNCA são lançados manualmente via V2 por esse processo — banimento total, igual Assinaturas.** Causa: existe `aplicarBoletosVencidosAutomaticamente()` (`src/app/app.js:1361-1385`), rodando **sozinha no boot de toda carga do painel V1**, que já credita esses 9 boletos (mesmos códigos `tx` fixos: `TXB000001` a `TXB000009`) na Caixa Boletos assim que o dia de vencimento passa dentro do ciclo — criado em 31/07/2026 (V214) a pedido explícito do usuário ("quero que o pagamento desses boletos sejam automáticos"). Um item de `mercadopago_eventos`/Pluggy que bate valor+data com um desses 9 é **confirmação de que o V1 já tratou** (rejeitar sem lançar), não um pagamento novo pra registrar em V2. Recorrências fora dessa lista de 9 (parcelamentos, consórcios, assinaturas fora do cronograma) continuam com cuidado redobrado normal de dedup, não banimento — só os 9 nomeados em `cronograma_boletos_fixos` têm esse mecanismo automático V1 específico.
   - **Genuinamente ambíguo** (sem match de valor, sem regra, descrição não identifica o que é) → não inventar categoria/caixa; documentar o achado pro usuário como achado extraordinário (não como pendência de aprovação) e deixar `status_triagem='pendente'` só nesse caso raro.
   - Cuidado já identificado: `pt.valor` em `pluggy_transacoes` é **assinado** (negativo pra saída) — comparar sempre por `abs(valor)` contra `transacoes.valor` (sempre positivo), senão a dedup falha silenciosamente.
   - As RPCs `triar_pluggy_item`/`triar_mercadopago_evento` exigem JWT de usuário autenticado (`auth.role()='service_role'` falha via MCP) — usar `UPDATE` direto nas tabelas (`pluggy_triagem`/`mercadopago_eventos`) quando operando via Supabase MCP.
7. **Se o dado também fizer sentido na V2 relacional**, replicar via `lancar_transacao_manual()` ou `sincronizar_v1_v2()` (seção 4) — mas isso é adicional, nunca substitui o passo 2.

---

## 3. Fluxo de auditoria

**V1 (painel visível):**
- `window.WALLACE_VALIDACAO_RUNTIME` — bateria de 18 fases, checar `18/18 APROVADA` depois de qualquer mudança que toque cálculo.
- `#healthBadge` — 12 checagens matemáticas do `REG`, precisa mostrar "✅ Sistema íntegro".
- `auditoriaSSOT()` — roda no boot, "N divergências" no rodapé precisa ser 0.
- Regra V135: todo "total" que ganha checagem de auditoria precisa que o detalhamento que o compõe ganhe a mesma checagem — não valida só o agregado final.

**V2 relacional:**
- `audit_log` — trigger automático em `UPDATE`/`DELETE`/`INSERT` de `caixas`/`transacoes`/**`indicadores`** (esta última desde 12/08/2026, ver seção 1.3.2), sempre com `set_config('audit.origem', '<motivo>', true)` antes da operação (`ajuste_manual`, `sincronizacao`, etc.) para o registro sair rastreável.
- `vw_reconciliacao_v1_v2` — reconciliação caixa a caixa, campos `diferenca_absoluta`/`causa_provavel`/`grau_confianca`. Rodar depois de qualquer mudança em `caixas`/`transacoes` que possa afetar saldo.
- `diagnostico_sync_v1_v2()` — lista o que existe no V1 e ainda não está na V2, restrito a livros com mapeamento confiável.

**Método de investigação de qualquer divergência** (Fase 3/4C/TX000140, já validado repetidamente): reconstruir o número algebricamente, comparar cada componente contra evidência real (extrato, fatura, comprovante), nunca aceitar "bateu por acaso" como prova de causa raiz.

---

## 4. Fluxo de sincronização (V1 → V2 relacional)

1. Rodar `sincronizar_v1_v2(true)` (dry-run) — **sempre primeiro**, nunca pular direto pro `false`.
2. Revisar o relatório (`inseridas`/`ignoradas`, cada ignorada com motivo).
3. Só então rodar `sincronizar_v1_v2(false)`.
4. Confirmar que a quantidade inserida bate exato com o previsto no dry-run.
5. Rodar de novo (`false`) uma segunda vez — tem que retornar 0 inserções (prova de idempotência, protegida por `UNIQUE(tx_legado, caixa_id)`).

A função já exclui automaticamente: livros sem mapeamento confiável em `v1_v2_caixa_mapa` (hoje `LRW_TRANSACOES`/`LRV_TRANSACOES`) e `tx_legado` com pendência formal de governança (`TX000208`, `TX000203-206` — ver seção 7). Não é preciso filtrar manualmente.

---

## 5. Regras obrigatórias antes de encerrar uma sessão

- [ ] Todo dado financeiro lançado está nos 2 lugares do V1 (arquivo local **e** Supabase) — nunca só um.
- [ ] `git status` conferido — nada pendente sem explicação, ou pendência documentada no handoff.
- [ ] Se a mudança tocou cálculo/painel: `WALLACE_VALIDACAO_RUNTIME` 18/18 e `#healthBadge` íntegro, validados em navegador real (não só leitura de código).
- [ ] `docs/changelog/ESTADO_ATUAL.md` **reescrito do zero** (não editado incrementalmente) refletindo o estado real desta sessão.
- [ ] `docs/changelog/PASSAGEM_DE_TURNO.md` **recebeu um bloco novo anexado** (nunca apagar histórico) com o passo a passo da sessão.
- [ ] Qualquer decisão de negócio/investigação nova está registrada em `docs/decisions/` (não só na memória da conversa).
- [ ] Usuário avisado do que será commitado **antes** de rodar `git commit`, mesmo com autorização permanente de commitar sozinho.
- [ ] Nenhum `UPDATE`/`DELETE` real em dado financeiro sem o dry-run correspondente ter sido revisado antes.
- [ ] **Antes de editar qualquer dado "vivo"/config que um comentário do código diz vir de outro lugar** (ex: "Supabase sobrescreve isto no carregamento"): confirmar no `app.js`/código ATUAL, não no comentário, qual bloco realmente popula a variável em `window`/`VARS` agora. Comentários descrevem a arquitetura de quando foram escritos, não necessariamente a de agora — ver achado real de 12/08/2026 abaixo.

**Achado real que motivou a regra acima (12/08/2026)**: numa mesma sessão, duas correções de dado real (composição tarifária Energisa) foram feitas em `wallace_dados` seguindo um comentário do código que dizia "essa tabela sobrescreve o VARS local" — mas horas antes, *outra sessão* (mesmo dia, mesmo repositório) tinha removido esse merge por completo (`Object.assign(VARS, dr)`, "sepultamento final da V1") e migrado a fonte viva pra `parametros_gerais`, sem atualizar o comentário. A correção ficou "no ar" por horas até uma validação com login real no painel revelar que os números não tinham mudado. **Duas sessões trabalhando no mesmo repositório no mesmo dia, sem coordenação síncrona, é a situação normal deste projeto** (não uma exceção) — todo agente deve assumir que o código pode ter mudado de arquitetura desde a última vez que leu, e validar contra o estado atual antes de confiar em comentário/documentação.

---

## 6. Gatilhos automáticos que devem ser verificados

| Gatilho | Onde | O que significa se disparar |
|---|---|---|
| `WALLACE_VALIDACAO_RUNTIME` ≠ 18/18 | Console do navegador | Alguma fase de validação falhou — não é enfeite, é bug real até prova em contrário |
| `#healthBadge` ≠ "✅ Sistema íntegro" | Rodapé do painel | Uma das 12 checagens matemáticas do REG não fechou |
| `auditoriaSSOT()` > 0 divergências | Console/rodapé | Total e detalhamento dessincronizaram |
| `CAIXA_VARIAVEL_PENDENTE_PROXIMO_CICLO` com valor | Simulador Fim de Ciclo | Compra do limbo (23-24 do mês) represada, precisa rolar na próxima virada de ciclo |
| `saldo_inicial_calibrado=false` (V2) | `caixas` | Caixa nunca recebeu calibração real — resíduo de reconciliação previsível |
| `transacoes.afeta_saldo_real IS NULL` | V2 | Transação sem classificação de impacto em saldo — P1, nunca deixar acumular |
| Duplicidade `(tx_legado, caixa_id)` | V2 | Bloqueada pela constraint desde a Fase 4B-2 — se aparecer erro `23505` numa sincronização, é isso |
| `avisos` em `rpc_dashboard_resumo()`/`v2_rpc_avisos_negocio` | V2 | Lista de alertas de negócio já computados pelo próprio banco — sempre ler antes de dar sessão por "tudo ok" |
| PIX Geral Vanessa (PGV) com saldo ≤ R$100,00 | Card PGV no painel — desde 09/08/2026, valor V2 (`vw_saldo_v2_por_caixa`), não mais `VARS.pixGeralVanessaSaldo` (V1) | Alerta preventivo obrigatório no resumo de abertura de sessão — ver regra completa na seção 6.1. |
| Caixa Variável citada em qualquer alerta/resumo | Card Caixa Variável no painel | Nunca citar sem dizer qual dos 2 conceitos (TEM NA CAIXA × DISPONÍVEL REAL) — ver regra completa na seção 6.1. |

---

## 6.1 Regras obrigatórias para TODOS os agentes (Claude Chat, Claude Code, Copilot, futuros agentes)

**Registrado formalmente em 08/08/2026, pedido explícito do usuário — não são sugestões, são regras permanentes de operação deste sistema, aplicáveis em qualquer sessão, qualquer agente.**

### Regra Operacional — Caixa Variável

Nunca confundir:

- **TEM NA CAIXA** = saldo bruto existente na Caixa Variável.
- **DISPONÍVEL REAL** = saldo bruto − comprometido.

**Exemplo real** (Política Interna §13):

```
Tem na Caixa:     R$ 1.886,65
Comprometido:     R$ 1.572,81
Disponível Real:  R$   313,84   (= 1.886,65 − 1.572,81)
```

Portanto:
- R$1.886,65 é o dinheiro existente.
- R$313,84 é o dinheiro ainda disponível para novas despesas.
- **Nunca** dizer que a Caixa Variável "tem R$313,84".
- **Sempre** informar explicitamente qual conceito está sendo usado — qualquer alerta operacional deve indicar claramente "Tem na Caixa" ou "Disponível Real".

**É proibido usar "saldo da Caixa Variável" de forma ambígua.**

### Regra Operacional — PIX Geral Vanessa (PGV)

Além do gatilho formal da Política Interna §7:
- **Gatilho oficial** = R$50,00.
- **Reposição padrão** = R$300,00, vindos da PIX Vanessa.

**Atualização 09/08/2026**: a PGV foi promovida pra exibição V2 (ver seção 1.2) — o valor que aparece no painel, e que deve ser usado pra checar o gatilho, agora é o saldo V2 (`vw_saldo_v2_por_caixa`, caixa "PIX Geral Vanessa"), não mais `VARS.pixGeralVanessaSaldo` (V1). Os dois valores divergem (~R$256 de diferença, residual aceito da transição) — usar sempre o que está na tela.

**Alerta preventivo obrigatório**: sempre que a PGV estiver ≤ R$100,00, incluir aviso no resumo inicial da sessão. Formato:

```
⚠ PIX Geral Vanessa em R$X,XX.
Gatilho formal: R$50,00.
Reposição padrão: R$300,00.
Preparar reposição da PIX Vanessa caso ocorra nova saída.
```

**Importante**: apenas alertar; nunca executar transferência automaticamente; nunca criar lançamento automaticamente; decisão continua humana.

### Diretriz permanente — antes de comentar situação da Caixa Variável

1. Ler saldo bruto.
2. Ler comprometido.
3. Calcular disponível real (bruto − comprometido).
4. Informar explicitamente qual valor está sendo citado.

---

## 7. Procedimentos de correção

1. **Nunca corrigir "no escuro"** — toda correção de dado exige causa raiz comprovada com evidência reproduzível (extrato, fatura, comprovante, ou reconstrução algébrica exata), nunca "parece que é isso".
2. **Sempre dry-run antes do `UPDATE`/`INSERT`/`DELETE` real**: snapshot do estado atual, SQL exato, impacto esperado em todas as views/saldos afetados, plano de rollback — só então executar.
3. **Preferir o ajuste mais pontual possível.** Se o problema está numa única célula (`caixas.saldo_inicial_ciclo`), corrigir só ali — não alterar view, schema ou lógica compartilhada pra resolver um caso isolado (ver seção 17 do plano V1→V2: correção na view foi cogitada, testada em dry-run, e **rejeitada** por regredir 8 outras caixas; a correção pontual na âncora resolveu com risco zero).
4. **Toda correção gera rastro**: `set_config('audit.origem', ...)` antes da operação, e o achado + a correção registrados em `docs/decisions/` (não só relatado no chat).
5. **Divergência de valor entre V1 e V2 não é sempre "erro"** — pode ser colisão de `tx_legado` entre dois eventos reais diferentes (mesma classe do `TX000208`), correção legítima do V1 posterior à migração, ou resíduo de sincronização conhecido. Classificar antes de decidir se corrige.
6. **Nunca aceitar "ajuste de reconciliação" como automaticamente ilegítimo nem automaticamente legítimo** — provar antes de remover ou manter (ver Política Interna seção 31, achado dos "ajustes artificiais").

---

## 8. Procedimentos proibidos

- Commitar ou dar `git push` sem avisar o usuário antes, mesmo com autorização permanente de commitar sozinho.
- `git push --force`, `git reset --hard`, ou qualquer comando destrutivo sem confirmação explícita e específica pra aquele caso.
- Pular hooks (`--no-verify`) ou assinatura (`--no-gpg-sign`) sem pedido explícito.
- Editar `src/services/FinanceEngine.js`/`Comparator.js` sem autorização explícita — são a camada V2 arquitetural validada; qualquer mudança exige rodar as 18 fases de novo.
- Mover `src/services/*.js` entre pastas — têm `import`/`require` relativos entre si, quebra em cadeia.
- Criar pasta vazia "pra organizar melhor no futuro".
- Escrever `</script>` como texto solto dentro de um bloco `<script>` (mesmo em comentário) — trunca o parser HTML, já causou bug real de página travada.
- Lançar transação financeira sem confirmação explícita do usuário.
- Inferir/inventar dado que não existe (P1 — cartão, categoria, usuário, valor: se não há evidência objetiva, o campo fica `NULL`/pendente, nunca chutado).
- Corrigir valor em `transacoes` sem ter isolado se é erro real ou colisão de `tx_legado` — os dois exigem tratamento diferente.
- Rodar `sincronizar_v1_v2(false)` sem ter revisado o `sincronizar_v1_v2(true)` correspondente antes.
- Alterar view/schema compartilhado pra resolver um problema isolado de uma única linha/caixa.
- Confiar em narrativa de sessão anterior sem checar `git status`/`git log`/estado real do banco primeiro — já causou trabalho duplicado e diagnóstico errado mais de uma vez.
- Reproduzir letra de música, ou mais de 1 citação de qualquer fonte externa por resposta.

---

## 9. Checklist de Início de Sessão

- [ ] Ler `docs/changelog/ESTADO_ATUAL.md` inteiro primeiro.
- [ ] Ler o(s) bloco(s) mais recente(s) de `docs/changelog/PASSAGEM_DE_TURNO.md`.
- [ ] Rodar `git status` e `git log --oneline -10` — nunca assumir o que está pendente/concluído sem conferir.
- [ ] Se a tarefa envolver "V2", identificar qual das duas (seção 1) antes de tocar em qualquer arquivo.
- [ ] Se a tarefa envolver `caixas`/`transacoes`/qualquer tabela relacional, ler `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` seção mais recente antes de agir.
- [ ] Se for mexer em dado financeiro, checar `POLITICAS_INTERNAS_SISTEMA_WALLACE.md` pra regra de negócio aplicável (cascata, caixa correta, exceção conhecida).
- [ ] Confirmar com o usuário qualquer coisa que pareça pendência de outra sessão antes de reabrir como problema novo.
- [ ] **Checar saldo atual da PIX Geral Vanessa (PGV)** — se ≤ R$100,00 (gatilho formal R$50,00, Política Interna §7), incluir alerta preventivo já na resposta de boas-vindas/resumo operacional de abertura: `⚠ PIX Geral Vanessa em R$X,XX. Gatilho de reposição: R$50,00. Preparar transferência de R$300 da PIX Vanessa caso ocorra qualquer nova saída.` Só alerta — não executar transferência, não lançar, não alterar saldo (regra nova 08/08/2026, ver seção 6).

## 10. Checklist de Encerramento de Sessão

**Regra geral (pedido explícito do usuário, 14/08/2026, depois de repetidos problemas do Claude Chat "se perder" por documentação desatualizada): "passagem de turno" significa TODOS os documentos abaixo, sempre — nunca só o `ESTADO_ATUAL.md`. Um documento desatualizado é pior que nenhum, porque passa confiança falsa.**

- [ ] Todo lançamento financeiro real está nos lugares aplicáveis (Supabase V2 relacional; `wallace_dados`/V1 só se for exceção formal documentada).
- [ ] `WALLACE_VALIDACAO_RUNTIME` 18/18 e `#healthBadge` íntegro, se algo tocou cálculo/painel — validado em navegador real.
- [ ] `git status` limpo, ou pendência explicada no handoff.
- [ ] `docs/changelog/ESTADO_ATUAL.md` reescrito do zero.
- [ ] `docs/changelog/PASSAGEM_DE_TURNO.md` recebeu bloco novo anexado.
- [ ] Toda decisão/investigação nova registrada em `docs/decisions/` com evidência, não só narrada no chat.
- [ ] **Se algo mudou que afete o que o Claude Chat precisa saber** (regra de negócio nova, domínio V2 novo, exceção formal nova, procedimento mudado): `Livro Razão/Agentes/CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` no Google Drive **sobrescrito** (nunca criar cópia nova) com o conteúdo atualizado, na mesma sessão — não deixar pra depois.
- [ ] **Se este manual (`MANUAL_OPERACIONAL_AGENTES.md`) mudou**: a cópia em `Livro Razão/Agentes/MANUAL_OPERACIONAL_AGENTES.md` no Google Drive também **sobrescrita**, mesmo conteúdo do repositório — as duas nunca podem divergir (achado real 14/08/2026: ficaram 5 dias divergentes sem ninguém notar, porque esse passo não estava neste checklist).
- [ ] Nenhum arquivo `NOME (1).md`/`.gdoc` órfão foi deixado pra trás na pasta `Agentes/` do Drive (ver seção 11.5) — sempre sobrescrever o arquivo existente, nunca criar cópia numerada ao lado.
- [ ] Usuário avisado do que foi commitado/enviado nesta sessão, e do que foi atualizado no Google Drive (o Drive não passa por `git`, merece aviso explícito à parte).
- [ ] Nenhuma correção de dado ficou "no escuro" — toda causa raiz documentada, mesmo quando a decisão foi não corrigir ainda.

---

## 11. Governança Multi-Conta e Bootstrap de Novos Chats

**Registrado formalmente em 08/08/2026, pedido explícito do usuário — endurecimento final de governança dos agentes Claude, parte obrigatória da conclusão da V2.**

### 11.1 Contexto: 3 contas, uma só interage com Claude Chat

O usuário opera em 3 contas Anthropic/Google separadas — `wallace.termica@gmail.com`, `wallace.servidor@wartsila.com`, `wallace.lira@wartsila.com`. **Confirmado pelo usuário (08/08/2026): só `wallace.termica@gmail.com` interage com Claude Chat** (Web/Android/iOS). As outras 2 contas (`wartsila.com`) não usam Claude Chat para este sistema — se aparecerem em alguma sessão, é via Claude Code (que lê este repositório diretamente, independente de conta) ou fora do escopo deste sistema.

Isso elimina o problema de sincronização multi-conta para o Claude Chat: não há 3 cópias de Custom Instructions/Project Knowledge para manter alinhadas, só uma. Custom Instructions e Projects (incluindo Project Knowledge) sincronizam automaticamente entre Web/Android/iOS **dentro dessa única conta** — isso é conhecimento de produto Nível D/C (comportamento geral do Claude.ai, não verificado ao vivo nesta sessão); se divergir na prática, o usuário deve confirmar e este documento deve ser corrigido.

Se essa premissa mudar no futuro (outra conta passar a usar Claude Chat para o Sistema Wallace), a seção 11.5 precisa ser reaberta — hoje ela assume conta única.

### 11.2 Fonte canônica — uma verdade, dois pontos de entrada

**Este arquivo (`docs/MANUAL_OPERACIONAL_AGENTES.md`) é o documento mestre.** Motivo: é lido automaticamente por qualquer Claude Code aberto neste repositório, em qualquer conta, sem nenhuma configuração manual — é o único ponto que já resolve "qualquer conta, qualquer dispositivo" hoje, porque depende do repositório Git, não de conta.

**`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`** (Google Doc) é o ponto de entrada do **Claude Chat** (Web/Android/iOS — sem acesso ao repositório) e **deriva** deste manual: sempre que este manual mudar de forma que afete o que o Claude Chat precisa saber, o Google Doc deve ser atualizado na mesma sessão (ver 11.6). Nunca editar o Google Doc com uma regra nova sem que ela também exista aqui — o inverso (regra só aqui, ainda não propagada) é aceitável temporariamente, com pendência registrada no handoff.

Nenhum outro documento (Custom Instructions colado à mão em cada conta, anotação solta, memória de conversa) deve conter regra operacional própria — sempre apontar para os dois documentos acima.

### 11.3 V2 como regra global (reforço)

Vale para os dois documentos, sem exceção: a V2 é o sistema principal. Sempre que existir tabela/view/RPC/indicador V2 para um domínio, o agente usa a estrutura V2. A V1 (`wallace_dados`) só é usada quando não existir equivalente V2, ou quando houver exceção formal documentada (`docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`). Ver tabela de domínios completa na seção 1.1.

### 11.4 Claude Chat × Claude Code — divisão operacional

**Atualizado 09/08/2026 (decisão explícita do usuário, corrige a linha "Acesso" abaixo, que estava desatualizada)**: o Claude Chat **tem** conector Supabase ativo e **deve gravar dado diretamente** — a divisão certa não é "quem tem acesso ao banco", é **tipo de operação** (ver regra completa na seção 1.2, "Fronteira Chat × Code"): Chat lança/corrige dado (linha específica); Code faz mudança estrutural (schema/view/RPC/código-fonte).

| | Claude Chat (Web/Android/iOS, só `wallace.termica@gmail.com`) | Claude Code (este repositório, qualquer conta) |
|---|---|---|
| Acesso | Supabase (conector, leitura **e escrita de dado**) + Google Drive (leitura deste manual, seção 11.7) — **sem acesso ao repositório Git nem a ferramentas de schema/migration** | Supabase (MCP, leitura/escrita de dado **e** estrutura) + arquivos do repositório + git |
| Papel | Interpreta comprovante/print, lança/corrige transação direto no banco, orienta, explica regra de negócio | Consulta dado real, faz mudança estrutural (schema/view/RPC/código), valida, cria commits |
| Nível de confiança padrão | A pra dado que ele mesmo consultou/gravou no Supabase agora; C/D pra qualquer coisa que dependa do repositório/código-fonte (não tem acesso) | A/B disponíveis via consulta direta a banco e repositório |
| Quando a tarefa é mudança estrutural | **Dizer isso explicitamente** e encaminhar pra uma sessão do Claude Code — não é sobre "não ter acesso", é sobre o tipo de operação exigir o processo de dry-run/validação da seção 4/7/8 | N/A — já é o responsável por esse tipo de mudança |

Frase padrão para o Claude Chat encaminhar uma mudança **estrutural** (não uma dúvida de dado, que ele já resolve sozinho consultando o Supabase): *"Isso exige mudar código/schema, não só lançar um dado — para uma sessão do Claude Code."*

### 11.5 Bootstrap de novos chats — minimizar risco de assumir V1/Excel

Todo chat novo (qualquer conta, qualquer dispositivo) deve começar assumindo, sem precisar que o usuário repita:

- ✅ V2 (Supabase relacional) como sistema principal.
- ✅ `wallace_dados` como legado, não fonte primária.
- ✅ Exceções formais documentadas existem e devem ser checadas antes de tratar algo como bug.
- ✅ O Excel (`ERP_WALLACE_LIRA_V10_preenchido.xlsx`) não é mais consultado por padrão — parou de ser atualizado antes da migração para Supabase/Claude Code (08/08/2026).

Mecanismo: o `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` já foi reescrito (08/08/2026) para abrir com essa premissa. **Ação recomendada ao usuário** (fora do alcance de qualquer agente sem login na conta) — uma única vez, só em `wallace.termica@gmail.com`: criar um Project dedicado (ex.: "Sistema Wallace Lira"), anexar o documento como Project Knowledge, e manter o Custom Instructions da conta curto, só apontando para o Project ("Para qualquer assunto do Sistema Wallace Lira, leia primeiro o documento anexado neste Project"). Feito uma vez, propaga automaticamente para Web/Android/iOS dessa conta — não precisa repetir por dispositivo.

**Formato e local oficiais dos arquivos no Drive (decisão do usuário, 09/08/2026, endereço corrigido 14/08/2026)**: os documentos vivem na pasta **`Livro Razão/Agentes/`** do Google Drive (conta `wallace.termica@gmail.com`), **como arquivos `.md` reais** (`mimeType: text/markdown`, criados com `disableConversionToGoogleType`), **nunca como Google Doc**. A pasta `Livro Razão/Sistema Wallace Lira - Claude Chat/` (endereço original de 09/08) foi abandonada no mesmo dia em favor de `Agentes/`, mas este manual continuou citando o endereço antigo por 5 dias sem ninguém notar — achado real 14/08/2026: a pasta antiga estava vazia (só `desktop.ini`), e a cópia real em `Agentes/` tinha ficado 5 dias sem sincronizar com o repositório (ainda descrevia `wallace_dados` como fonte viva do painel, desligada em 12/08). Motivo de exigir `.md` puro, nunca Google Doc: uma tentativa inicial criou cópias em Google Doc, que reintroduzem escape de markdown e geraram confusão real — o usuário viu uma conversa do Claude Chat lendo uma cópia desatualizada em Google Doc enquanto a versão `.md` mais recente também existia na mesma pasta, sem como saber qual o Project Knowledge estava de fato usando.

**Arquivo `ONDE_LER.md`** (mesma pasta `Agentes/`) é o ponteiro estável — nunca muda de nome/lugar, só existe pra dizer "os documentos reais estão aqui". Se o endereço mudar de novo no futuro, atualizar `ONDE_LER.md` primeiro e SEMPRE checar que ele bate com o que este manual diz (é exatamente essa divergência que causou o problema de 14/08).

**Regra de manutenção, sem exceção**: sempre **sobrescrever** o arquivo existente na pasta `Agentes/` — nunca criar `NOME (1).md`/`NOME_v2.md` ao lado. Um arquivo com sufixo numérico nessa pasta é sinal de sincronização quebrada (achado real 14/08/2026: `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE (1).md` ficou 2 dias como a única cópia existente, enquanto o nome oficial sem sufixo não existia) — se encontrar um, renomear removendo o sufixo (nunca apagar sem antes conferir que é a versão mais recente). Também nunca deixar um arquivo `.gdoc` (atalho de Google Doc) solto em qualquer lugar do Drive com nome parecido — apagar assim que encontrado, é resíduo da tentativa antiga de Google Doc.

### 11.6 Processo de manutenção — evitar divergência futura

Toda vez que uma migração V2 for concluída ou uma regra operacional mudar:

1. Atualizar este manual (`docs/MANUAL_OPERACIONAL_AGENTES.md`) — documento mestre.
2. Se a mudança afeta o que o Claude Chat precisa saber (novo domínio V2, nova regra de negócio, nova exceção formal): atualizar `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` na mesma sessão.
3. Atualizar `docs/changelog/ESTADO_ATUAL.md` (reescrito do zero).
4. Anexar bloco novo em `docs/changelog/PASSAGEM_DE_TURNO.md`.
5. Se a mudança criou uma decisão/exceção nova, registrar em `docs/decisions/`.
6. Avisar o usuário do que foi alterado nos dois documentos (manual + Google Doc) antes de considerar a sessão encerrada — o aviso de commit (seção 8) cobre o manual; o Google Doc não passa por `git`, mas merece o mesmo aviso explícito.

Este fluxo é o mesmo independente de qual conta/dispositivo iniciou a sessão — não existe versão "web" ou "mobile" dele.

---

*Este manual é operacional, não narrativo — não registra o que aconteceu (isso é `PASSAGEM_DE_TURNO.md`) nem o estado atual dos dados (isso é `ESTADO_ATUAL.md`). Registra como qualquer agente deve proceder, sempre. Atualizar aqui quando um procedimento mudar de fato, não quando um evento pontual acontecer.*
