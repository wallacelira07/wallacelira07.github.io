# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 13/08/2026, sessão longa (herdou contexto de sessão anterior do mesmo dia) — auditoria completa das 6 abas (2 workflows multi-agente), reconciliação real do reembolso Wärtsilä ciclo 2026-07, controle de aplicações do Ozivy + meta de peso, e investigação Pluggy (investimentos + saldo reservado/cofrinhos). Encerrada por limite de crédito da sessão — **retomar direto pelas pendências da seção 2 abaixo**.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard/Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. **ATUALIZADO 13/08**: cartão 4845 é da Vanessa e está **ATIVO** (não aposentado) — confirmado contra `pluggy-reconciliacao.js` (fonte real), corrigido em legendas + cabeçalho seção 08 do Painel. Só o 4844 (Wallace) está aposentado.
4. **"Estimado só na ausência de valor final — tendo o valor final, não usa mais estimado"** — regra geral nova (13/08), aplicada hoje em pelo menos 3 lugares (ver seção 3). Ao destravar qualquer campo antes manual/estimado, **auditar quem mais consumia a versão antiga** antes de considerar resolvido.

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.1/1.2 Pluggy — saldo reservado (cofrinhos MP) BLOQUEADO por limite de conta, não é bug nosso (investigado a fundo 13/08, 7 caminhos testados)
Sistema Pluggy (`sincronizar_pluggy.py`) foi implementado em **02/08/2026** (commit `97092ac`) — mesma data em que as 5 conexões originais (Bradesco, Itaú, Necton, BTG, Mercado Pago) foram criadas no `meu.pluggy.ai`.

**O que É bug nosso e já foi corrigido**: a captura de `bankData.reservedBalances` (commit `4fd661d`) está correta — testada com fallback pro detalhe da conta (`GET /accounts/{id}`) também. A tabela `pluggy_saldos_reservados` continua vazia porque **o valor real hoje é R$0** nas duas contas Mercado Pago (confirmado direto no dashboard da Pluggy, "Reservado: R$0" com histórico de reservas zerando — bate com a cascata do reembolso Wärtsilä já fechada). Não é falha de captura.

**O que É bloqueio real da Pluggy, não corrigível por nós**: usuário removeu o BTG e conectou uma conta Mercado Pago NOVA (`wallace.servidor@gmail.com`, onde estão as caixas Bens Duráveis/Emagrecimento/Suavização) direto no portal `meu.pluggy.ai`. Não existe caminho de autoatendimento pra descobrir o `item_id` real dessa conexão nova pra API — testado e descartado hoje:
1. `GET /items` sem ID — não existe, API da Pluggy bloqueia listagem por decisão de segurança deles (doc oficial).
2. ID da URL do dashboard `meu.pluggy.ai/connections/{id}` — **não é o item_id real** (confirmado 2x, `HTTP 404 item not found` ao consultar via API, mesmo com IDs corretos copiados da URL).
3. Widget Pluggy Connect hospedado por nós (`pluggy-reconectar.html`, criado hoje) — bloqueado: **"Contas de teste só podem conectar conectores sandbox (Pluggy Bank). Solicite acesso a dados reais."** — nossa aplicação (`Atualizar Claude`, client id `302c9ff8-7aa4-415a-971a-a99b90ee3a33`) está em tier trial/desenvolvimento na Pluggy, sem produção liberada. Liberar exigiria due diligence formal (dados de empresa/representante legal) — não se aplica a projeto pessoal, não vale a pena perseguir.
4. Webhook de conta (`item/created`/`item/updated`, evento `all`) registrado com sucesso (Edge Function `pluggy-webhook` + tabela `pluggy_webhook_eventos`, testados e funcionando ponta a ponta) — mas a Pluggy simplesmente **não disparou nenhum evento ainda** pra essas 2 conexões, mesmo com o usuário clicando "Atualizar" 2x no dashboard deles.
5. Forçar resincronização via `PATCH /items/{id}` — recusado pela própria API: `"MeuPluggy item cant be updated"`. Esse conector (id 200, "MeuPluggy" — usado pelo portal pessoal) não aceita comando de update nenhum, nem nas 3 conexões que já funcionam. Só atualiza sozinho no ciclo automático da Pluggy.
6. Seção "Apps Parceiros" dentro do `meu.pluggy.ai` (compartilhar conexão com uma aplicação específica) — vazia, nenhuma conexão compartilhada com nenhum app, sem botão visível pra vincular retroativamente.
7. Histórico de sessões anteriores (`Cópia de backup/HISTORICO_PASSAGENS_DE_TURNO.md` e outros) — não documenta como as 5 conexões originais foram vinculadas à aplicação em 02/08; provavelmente feito manualmente pelo usuário antes de qualquer sessão de Claude Code.

**Estado atual, sem regressão**: as 3 conexões que já funcionavam (Bradesco, Itaú, Necton — `item_id` `faa29e73...`/`7a747d7d...`/`6cab9354...`) continuam sincronizando normal. O secret `PLUGGY_ITEM_IDS` foi limpo de volta pra só esses 3 (os 2 IDs chutados do Mercado Pago novo, que só geravam erro 404 inofensivo no log, foram removidos). BTG e o Mercado Pago antigo (mortos desde 02/08, antes desta sessão) seguem fora, não há como reativá-los (ponto 5 acima).

**Próximo passo real, se retomar**: esperar a Pluggy disparar o ciclo automático de sincronização das 2 conexões Mercado Pago novas (webhook já está pronto pra capturar o `item_id` assim que isso acontecer, sem precisar de mais nenhuma ação) — ou o usuário contatar o suporte da Pluggy diretamente perguntando o `item_id` das conexões pelo CPF (`096.396.684-78`). Não vale reabrir a investigação técnica, os 7 caminhos acima já foram esgotados.

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
