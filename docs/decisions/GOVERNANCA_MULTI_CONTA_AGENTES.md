# Governança Multi-Conta dos Agentes Claude — Sistema Wallace Lira

**Data**: 08/08/2026
**Pedido por**: usuário, como "endurecimento final da governança dos agentes Claude", tratado como etapa obrigatória da conclusão da V2 (não é decisão de UX cosmética — é sobre garantir que qualquer agente novo, em qualquer conta/dispositivo, comece alinhado à arquitetura V2 atual).

Este documento é a estratégia completa. As regras permanentes derivadas dele vivem em `docs/MANUAL_OPERACIONAL_AGENTES.md` seção 11 (resumo operacional) — este arquivo é o raciocínio completo e as respostas objetivas pedidas pelo usuário.

**Correção 08/08/2026 (mesma sessão)**: o usuário confirmou que **só `wallace.termica@gmail.com` interage com Claude Chat**. As outras 2 contas (`wartsila.com`) não usam Claude Chat para este sistema. Isso simplifica a maior parte do problema abaixo — não existem "3 cópias" de Custom Instructions/Project Knowledge para manter alinhadas, existe uma só. As seções 4-6 abaixo foram escritas originalmente assumindo 3 contas ativas em Claude Chat; mantidas como registro histórico do raciocínio, mas a seção 4 (proposta) e 6 (bootstrap) têm a versão corrigida logo em seguida — **a versão corrigida prevalece**.

**Aviso de método (nível de confiança, ver manual seção 0)**: as afirmações sobre comportamento de sincronização do Claude Web/Android/iOS abaixo são conhecimento geral de produto (Nível C/D — não verificado ao vivo nesta sessão). Onde a resposta depende de um comportamento específico do app que pode ter mudado, isso é sinalizado explicitamente. O usuário deve confirmar e corrigir este documento se algo divergir.

---

## 1. Nível de Confiança da Informação — implementado

Seção 0 nova em `MANUAL_OPERACIONAL_AGENTES.md` e seção equivalente no `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`. Escala A/B/C/D, regra A>B>C>D, proibição de apresentar D como fato. Não repetido aqui — ver os dois documentos.

## 2. V2 como regra global — reforçado

Já era a diretriz desde a seção 1.1 do manual (08/08/2026, sessão anterior). Reforçado nesta rodada em texto explícito na nova seção 11.3, e replicado no Google Doc. Sem mudança de conteúdo, só de visibilidade/redundância proposital — é a regra mais importante do sistema, vale repetir em mais de um lugar.

## 3. Treinamento obrigatório dos agentes — status

A tabela domínio → estrutura V2 (tabela/view/RPC oficial, o que é legado, quais exceções existem) já existe na seção 1.1 do manual e foi replicada na seção 3 do `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md`. Cobre: compras/transações, caixas, cartões, patrimônio, livros razão, parcelamentos, energia solar, investimentos/ROC, reembolsos, empréstimos internos (LREI), indicadores.

**Lacuna reconhecida, não fechada nesta rodada**: "ciclos" como domínio próprio (fechamento/abertura de ciclo financeiro) não tem uma linha dedicada na tabela — hoje é lido via `CICLO_SNAPSHOTS`, que é Classe C (sem equivalente V2, 15 consumidores, ver `docs/changelog/ESTADO_ATUAL.md`). Não é uma omissão do treinamento, é um domínio real ainda não migrado — documentado como tal em vez de fingir que existe uma tabela V2 para ciclos hoje.

## 4. Governança das três contas — proposta objetiva

Respondendo item a item, como pedido:

1. **Custom Instructions**: curto, só um ponteiro. Nunca colar o conteúdo operacional completo lá — isso criaria uma 4ª cópia da mesma informação, fora de sincronia por natureza (Custom Instructions não é um arquivo, é um campo de texto solto por conta). Texto sugerido: *"Para qualquer assunto do Sistema Wallace Lira, leia primeiro o documento anexado no Project antes de responder. Nunca presuma saldo/regra sem checar o documento ou perguntar ao usuário."*
2. **Project Knowledge**: o `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (Google Doc) anexado como arquivo de conhecimento do Project, em cada uma das 3 contas. Preferir anexar o link/arquivo do Drive (se o app suportar reimportar/atualizar automaticamente) a colar o texto cru — colar o texto cria a mesma 4ª cópia do problema acima.
3. **Repositório** (`G:\My Drive\Livro Razão\Site`): tudo que é operacional-técnico e específico do código/banco — `MANUAL_OPERACIONAL_AGENTES.md` (mestre), `docs/decisions/*`, `docs/changelog/*`. Isso só o Claude Code lê; não depende de conta.
4. **Documentos compartilhados** (Google Docs/Drive): só o `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` — ele existe justamente para cobrir o Claude Chat, que não tem acesso ao repositório. Não duplicar seu conteúdo em outro doc.
5. **Fonte canônica da verdade**: `docs/MANUAL_OPERACIONAL_AGENTES.md` (ver seção 8 abaixo).
6. **Como evitar que uma conta fique desatualizada**: não ter cópias — as 3 contas apontam para o mesmo Google Doc vivo (Project Knowledge com o Drive real, não texto colado). Se o app não permitir referência viva e exigir texto colado, a mitigação é o checklist da seção 9 (rodar a cada migração concluída) mais uma checagem manual periódica do usuário (sugestão: 1x por mês, ou sempre que abrir uma sessão em uma conta que não usa há tempo) comparando timestamp do Google Doc com a última atualização citada nele.
7. **Como propagar atualizações futuras**: fluxo único, ver seção 9 (mesma seção 11.6 do manual).

**Versão corrigida (conta única confirmada)**: os 7 itens acima continuam válidos em espírito, mas na prática só existe **uma** conta (`wallace.termica@gmail.com`) com Project/Custom Instructions/Project Knowledge para configurar — não 3. "Propagar para as outras contas" deixa de ser necessário porque as outras contas não interagem com Claude Chat neste sistema. Se um dia isso mudar, reabrir esta seção.

## 5. Web, Mobile e novas sessões

**O que sincroniza automaticamente** (Nível C — comportamento geral conhecido do produto Claude.ai, confirmar na prática): dentro da **mesma conta**, Custom Instructions e Projects (incluindo Project Knowledge) são configurações de conta, não de dispositivo — Web, app Android e app iOS/iPadOS logados com o mesmo e-mail veem o mesmo Custom Instructions e os mesmos Projects.

**O que NÃO sincroniza**: nada entre contas diferentes. `wallace.termica@gmail.com`, `wallace.servidor@wartsila.com` e `wallace.lira@wartsila.com` são 3 contas Anthropic completamente independentes (mesmo que seja a mesma pessoa) — não existe organização/workspace compartilhado entre elas nesta configuração. Qualquer coisa configurada numa conta fica só nela.

**Configurações que precisam ser replicadas manualmente**: Custom Instructions (texto curto, replicar as 3 vezes) e a criação do Project + anexo do Google Doc (replicar as 3 vezes, uma configuração por conta).

**Como padronizar a experiência entre dispositivos**: não precisa de ação por dispositivo — só por conta. Um Project criado uma vez na conta X já aparece igual em Web/Android/iOS daquela conta. O trabalho real é 3x (uma vez por conta), não 3x por dispositivo.

## 6. Bootstrap de novos chats — estratégia

Coberto na seção 11.5 do manual. Resumo: o próprio `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` já abre (desde a reescrita de 08/08/2026) afirmando que o Excel não é mais fonte e que a V2 é o sistema principal — isso já reduz drasticamente o risco de um chat novo assumir V1/Excel por conta própria, **desde que o documento esteja de fato acessível** (Project Knowledge ou Custom Instructions da conta) no momento em que o chat novo é aberto. A ação que falta é 100% de configuração de conta (Project + anexo), fora do alcance de qualquer agente sem login nas 3 contas — só o usuário pode fazer.

## 7. Claude Chat × Claude Code

Tabela completa na seção 11.4 do manual. Resumo da regra: Claude Chat nunca apresenta dado ao vivo como Nível A/B por conta própria — ou tem a informação de fonte confiável (documento/usuário, Nível B/C) ou declara que não sabe e encaminha para o Claude Code.

## 8. Fonte canônica — decisão

**`docs/MANUAL_OPERACIONAL_AGENTES.md` é o documento mestre.**

Motivo da escolha (não é arbitrária): é o único artefato que já resolve "qualquer conta, qualquer dispositivo" sem nenhuma configuração adicional — porque o Claude Code lê arquivos do repositório diretamente, independente de qual das 3 contas está logada. O Google Doc depende de configuração de conta (Project Knowledge) para chegar ao Claude Chat; o manual não depende de nada disso para chegar ao Claude Code.

`CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` é derivado — existe porque o Claude Chat não tem alternativa (não lê repositório). Toda regra nova nasce no manual; se for relevante para quem não tem acesso ao repo, é replicada no Google Doc na mesma sessão.

`POLITICAS_INTERNAS_SISTEMA_WALLACE.md` continua sendo a referência de regras de **negócio** (cascata, caixas, ciclo) — não compete com o manual, que é sobre **procedimento**. Os dois já eram declarados como complementares desde a criação do manual.

## 9. Processo de manutenção — fluxo formal

Ver seção 11.6 do manual (reproduzido aqui por completude):

1. Atualizar o manual (mestre).
2. Se afeta o Claude Chat: atualizar o Google Doc na mesma sessão.
3. Reescrever `ESTADO_ATUAL.md` do zero.
4. Anexar bloco novo em `PASSAGEM_DE_TURNO.md`.
5. Se criou decisão/exceção nova: registrar em `docs/decisions/`.
6. Avisar o usuário do que mudou nos dois documentos antes de encerrar a sessão.

## 10. Resultado esperado — o que ainda depende do usuário

Implementado nesta sessão, sem depender de mais nada do usuário:
- Seção "Nível de Confiança da Informação" nos dois documentos.
- Reforço explícito "V2 é regra global" nos dois documentos.
- Tabela de treinamento por domínio (já existia, mantida/revisada).
- Distinção operacional Claude Chat × Claude Code documentada.
- Fonte canônica declarada formalmente.
- Fluxo de manutenção formalizado.

**Depende do usuário, porque exige login na conta** (confirmado 08/08/2026: só `wallace.termica@gmail.com` interage com Claude Chat — os passos abaixo são feitos uma vez só, nessa conta):
1. Criar um Project ("Sistema Wallace Lira" ou nome equivalente) em `wallace.termica@gmail.com`.
2. Anexar `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` como Project Knowledge (preferir link vivo do Drive; se o app não suportar, colar o texto atual e teria que ser recolado a cada atualização — pior cenário, mas funcional).
3. Definir o Custom Instructions curto (texto sugerido na seção 4.1 acima).

Não é necessário repetir nada nas outras 2 contas (`wallace.servidor@wartsila.com`, `wallace.lira@wartsila.com`) — elas não usam Claude Chat para este sistema. Se usarem Claude Code neste repositório, já leem `MANUAL_OPERACIONAL_AGENTES.md` automaticamente, sem configuração adicional.

Sem os 3 passos acima, o Google Doc atualizado existe mas não chega automaticamente a um chat novo aberto em `wallace.termica@gmail.com` — a mitigação de "chat novo assume V1/Excel" só funciona de fato depois desses passos.
