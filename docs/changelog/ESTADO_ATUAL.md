# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 13/08/2026, sessão longa (herdou contexto de sessão anterior do mesmo dia) — auditoria completa das 6 abas (2 workflows multi-agente), reconciliação real do reembolso Wärtsilä ciclo 2026-07, controle de aplicações do Ozivy + meta de peso, e investigação Pluggy (investimentos + saldo reservado/cofrinhos). Encerrada por limite de crédito da sessão — **retomar direto pelas pendências da seção 2 abaixo**.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard/Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. **ATUALIZADO 13/08**: cartão 4845 é da Vanessa e está **ATIVO** (não aposentado) — confirmado contra `pluggy-reconciliacao.js` (fonte real), corrigido em legendas + cabeçalho seção 08 do Painel. Só o 4844 (Wallace) está aposentado.
4. **"Estimado só na ausência de valor final — tendo o valor final, não usa mais estimado"** — regra geral nova (13/08), aplicada hoje em pelo menos 3 lugares (ver seção 3). Ao destravar qualquer campo antes manual/estimado, **auditar quem mais consumia a versão antiga** antes de considerar resolvido.

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.1/1.2 Pluggy — RESOLVIDO 13/08 (depois de uma exclusão acidental de conta e recriação completa)

Sistema Pluggy (`sincronizar_pluggy.py`) foi implementado em **02/08/2026** (commit `97092ac`).

**Saga completa desta sessão**: pendência original era só "saldo reservado (cofrinhos MP) não aparece". Investigação mostrou que **não era bug** — o valor reservado real é R$0 hoje nas 2 contas Mercado Pago (confirmado no dashboard da Pluggy, histórico de reservas zerando, bate com a cascata do reembolso Wärtsilä já fechada). O problema real era outro: o usuário tinha conectado 2 contas Mercado Pago novas direto no portal `meu.pluggy.ai`, e não existia como descobrir o `item_id` real delas pra colocar no secret `PLUGGY_ITEM_IDS` — 7 caminhos técnicos testados e descartados (sem endpoint de listagem, ID da URL do dashboard não é o `item_id` real, widget bloqueado por conta trial, webhook de conta sem disparar, `PATCH /items` recusado pelo conector "MeuPluggy", sem opção de compartilhar conexão com app no `meu.pluggy.ai`, sem registro em sessões anteriores de como isso foi feito originalmente).

**No meio da investigação, o usuário excluiu a conta inteira da Pluggy por engano** (achou que estava excluindo só o app de demo) — isso invalidou `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` e quebrou a sincronização por completo (não só o Mercado Pago, Bradesco/Itaú/Necton também pararam). Confirmado com o suporte oficial via WhatsApp: **irreversível**, precisa recriar conta.

**Resolvido**: usuário recriou a conta na Pluggy (mesmo e-mail), criou aplicação nova, gerou `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` novos (atualizados no GitHub Secrets). As 5 conexões bancárias em si (`meu.pluggy.ai`) sobreviveram à exclusão da conta de desenvolvedor — só precisou vincular a aplicação nova a elas, o que apareceu automaticamente na aba **"Demo"** do dashboard novo (`dashboard.pluggy.ai` → aplicação → "Conecte um item demo" → lista "Itens Conectados", cada um mostra o `item_id` real no topo do painel de detalhe — **este é o método correto pra pegar `item_id`, documentar pra próxima vez**). Novos `item_id` (todos testados, workflow rodou com sucesso #240):

| Conta | item_id |
|---|---|
| Mercado Pago 01 (`8574022051-6`, wallace.termica@) | `fa0d9464-d700-41e2-8edf-cadabbb8bff7` |
| Mercado Pago 02 (`6426567142-2`, wallace.servidor@, tem as caixas Bens Duráveis/Emagrecimento/Suavização) | `4b6c0e77-f007-4249-a614-15dc3bce026b` |
| Necton | `37d5b1f6-07bd-4a93-80ee-5aeb7d6a0b64` |
| Itaú | `d7808e04-7ab1-47b2-bfa0-71a94b824e3e` |
| Bradesco | `33b80bf0-92c9-4a54-bc8c-d34ff3765ae8` |

BTG não foi reconectado (decisão antiga do usuário, não trazia investimento de valor). Webhook de conta (`pluggy-webhook` Edge Function + tabela `pluggy_webhook_eventos`) continua registrado e ativo na aplicação nova — útil pra descobrir automaticamente o `item_id` de qualquer conexão futura, sem repetir a investigação de hoje.

**Limpeza pendente pra próxima sessão** (não crítico): o script `sincronizar_pluggy.py` acumulou bastante log de debug (`[debug reservedBalances]`, `[debug item_id]`, `[debug item completo]`, `[debug forcar update]`, `[connect_token base64]`) desta investigação — pode ser removido agora que está tudo resolvido, deixando só os prints essenciais. `pluggy-reconectar.html` (página utilitária criada hoje) pode ser removida do repo também, não é mais necessária.

### 1.3 R$340,00 do ciclo Wärtsilä 2026-07 ainda não chegaram
Ver seção 3.1. Quando chegar: atualizar `reembolso_wartsila_recebimentos` (nova linha) e decidir destino (provavelmente Caixa Lance, sobra final do ciclo).

### 1.4 LREI0003 (R$266,23) e LREI0004 (R$103,55) seguem ativas
LREI0003: aguardando reembolso de um ciclo Wärtsilä ANTERIOR a 2026-07 (a tabela `reembolso_wartsila_ciclo` só tem registro a partir de 2026-07, esse ciclo anterior não tem registro formal). LREI0004: aguardando Caixa Manutenção acumular saldo (hoje R$0,72, precisa R$103,55).

### 1.5 Divergência V1×V2 nova no console (esperada, não é bug)
`Onda2V2 [Provisionado Wärtsilä]: V1=R$4.275,21 × V2=R$5.055,95 — DIVERGE R$780.74`. É esperada — reflete a reconciliação real de hoje (ver seção 3.1), mas o sistema tem uma trava de segurança que não promove automaticamente divergências grandes/não explicadas, então ainda mostra o V1 (fallback) nessa caixa específica. Vai resolver sozinho quando um valor V1 mais recente for gravado, ou pode ser resolvido manualmente numa próxima sessão se o usuário quiser ver V2 já.

## 2. O que foi feito nesta sessão (13/08/2026)

### 2.1 Auditoria completa das 6 abas — 2 workflows multi-agente + aplicação
Pedido do usuário: 6 agentes (1 por aba: Painel/Gráficos/Solar/Cenários/Balanço/Emagrecimento) auditando estética+legendas, depois outra rodada de 6 auditando fórmulas+matemática. Total ~60 achados reais (não genéricos). Destaques corrigidos:
- **Solar**: tabela "Quanto você ainda vai pagar" usava fatura de Jul/26 em vez da real de Ago/26 já carregada — corrigido, mais o texto do aviso que descrevia a fórmula errada ("maior valor entre" quando o código sempre soma os 4 componentes — o código estava certo, o texto que estava desatualizado). **Conferido à mão pelo usuário e por mim, bate exato.**
- **Cenários**: bug de sinal real no gráfico/tabela "Superávit Normal" (mostrava "+-1.234" em verde pra diferença negativa) — corrigido antes da auditoria formal, replicando padrão já usado nas tabelas irmãs. Estimador de Salário comparava 2 ciclos diferentes (líquido do ciclo atual × necessidade do ciclo seguinte) — corrigido pra mesmo ciclo. `pisoTotal` (seção 03) era um literal fixo, virou soma real dos 6 componentes.
- **Balanço**: Caixa Boletos contada 2x em "Total reservado" (migrou de seção mas fórmula antiga não foi atualizada) — corrigido. Jargão técnico "V2 (Supabase relacional)" removido da UI do usuário final.
- **Painel**: badge de Modo Operacional só trocava texto, não cor/classe — corrigido. Legenda/cabeçalho Visa Infinite corrigidos (ver regra 3 da seção anterior).
- Uma rodada da Workflow bateu no limite de gasto mensal da conta no meio do caminho (5 de 6 agentes falharam) — resumida depois com sucesso (`resumeFromRunId`), sem perda de trabalho.
- Merge das 6 worktrees: 5 limpas via `git merge`, 1 (Painel) tinha um estado de working-tree corrompido (git status mostrava todo arquivo como deleted+untracked simultaneamente, causa não investigada — possível artefato do isolamento de worktree) — reaplicado manualmente arquivo por arquivo em vez de confiar no merge automático.
- Todas as 6 abas validadas visualmente (login real, zero erro de console) antes do commit.
- Commits: `6f62cc9`/`c7d970f`/`be5112d`/`b20e1c7` (fix por aba) → `e5f6d4e`/`b0c81f1`/`598bb32`/`d03b9f9` (merges) → `af02cad` (Painel manual + Pluggy investimentos). Todos pushed.

### 3.1 Reconciliação real do reembolso Wärtsilä — ciclo 2026-07
TED de R$6.682,76 recebido 13/08 (mais R$340,00 recebidos 07/08 = R$7.022,76 até agora). **Total bruto do ciclo corrigido pelo usuário: R$7.362,76** (não R$7.380,61 como estava gravado) — falta receber R$340,00.

Cascata final registrada em `transacoes` (TX000280 a TX000302, todas `origem='reconciliacao'`, `status='confirmado'`):
- Perna 1 (Fatura Wärtsilä, R$5.056,95): fica em "Provisionado Wärtsilä" (não é transação separada, é a reserva implícita)
- Perna 2 (MP corporativo, R$266,23) + Perna 4 (MP pessoal, R$403,11) = R$669,34 → Caixa "Mercado Pago" (fatura que vence 04/09)
- Perna 3 (Cartão corp. pessoal, R$297,31) → Caixa "Mastercard/Infinite" (reembolsa 5 compras reais idênticas: Outback+Super Bom+Capuaba+2 lanchonetes, 25-29/07)
- Sobra (R$999,16 de R$1.339,16 total, falta R$340) → Caixa Lance
- Da sobra, R$971,51 repassados como **aporte (não empréstimo)** pras 3 caixas negativas sem LREI: Bens Duráveis (R$583,99), Emagrecimento (R$278,89), Churrasco (R$108,63) — todas zeraram exato
- LREI0005 (R$1.950,77, consórcios Porto) quitada separadamente, com saldo PRÓPRIO da Caixa Boletos (não related ao Wärtsilä)
- LREI0003 foi erroneamente marcada quitada e depois revertida — origem real é uma fatura MP corporativo de um ciclo ANTERIOR (24/07), não deste ciclo. Fica ativa (ver pendência 1.4).

**Achado colateral corrigido**: 5 transações reais (Outback/Super Bom/Capuaba/2 lanchonetes) tinham `cartao_id` certo (Mastercard Black) mas `caixa_id` errado apontando pra "Caixa Variável" — na verdade `caixa_id=Provisionado Wärtsilä + cartao_id preenchido` é o mecanismo PROPOSITAL que alimenta o LRC (Livro Razão Corporativo, ver `getTransacoesCorporativoCartaoDetalhe()` em app.js). Corrigido de volta (eu mesmo tinha corrigido errado antes, revertido depois de o usuário apontar).

### 3.2 Aba Emagrecimento — controle de Ozivy + meta de peso
- Nova seção "Aplicações do Ozivy" (semaglutida, aplicação semanal): tabela `aplicacoes_ozivy` nova no Supabase, gráfico de dose ao longo do tempo, "próxima prevista" = última +7 dias. 1ª aplicação registrada (13/08, 0,25mg).
- Pesagem registrada: 139,6kg (13/08, primeira pesagem real).
- Meta de peso adicionada: **110kg** (`VARS.emagrecimentoMetaKg`), card "Falta pra meta" mostra 29,6kg restantes ou "Meta batida! 🎉".
- Commits: `adec7eb` (Ozivy), `e2c7b25` (meta).

### 3.3 Pluggy — investimentos (funcionando) + Reserva de Emergência
- **Investimentos**: `sincronizar_pluggy.py` já buscava `/investments` mas descartava o resultado (nenhuma tabela salvava). Criada `pluggy_investimentos` + RPC atualizada — testado ao vivo pelo usuário, funcionou: capturou 3 CDBs reais do Itaú (R$50.571,64 + R$49.628,96 + R$1,01) e ações do BTG (LFTS11 R$14.823,80 + 3 ações zeradas). **Confirmado: cofrinho Mercado Pago e previdência BTG NÃO vêm por `/investments`** — não existe nenhum registro pra essas 2 conexões, mesmo com o endpoint sendo chamado corretamente. Não é bug nosso, é a Pluggy que não expõe esses 2 produtos específicos por esse endpoint (ver 1.1 pra saldo reservado, que é o caminho certo pro cofrinho MP).
- **Reserva de Emergência**: os 3 CDBs do Itaú **são** a Reserva de Emergência (confirmado pelo usuário). Estratégia dele: manter sempre R$100.000,00 lá, sacar o rendimento acumulado no fim do mês pra Caixa Lance. `patrimonio.reserva` continua manual/travado em R$100.000,00 (usado no cálculo do patrimônio total, não deve variar com o rendimento) — adicionado um card informativo novo na seção 02 do Balanço (`#bfinReservaPluggy`) mostrando o saldo real via Pluggy e o rendimento a sacar (hoje R$201,61). Commits: `af02cad` (investimentos), `20ac7a3` (card Reserva).

## 3. Protocolo de sessão nova
1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
4. Retomar direto pela seção 1 (pendências) — a 1.1 (saldo reservado Pluggy) é a mais provável de ser o próximo pedido do usuário.
