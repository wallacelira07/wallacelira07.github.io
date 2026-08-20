# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 19/08/2026, bloco 30. Resumo do bloco 30: usuário confirmou por print que o fix do bloco 29 (Combustível "não muda") funcionou ao vivo — Origem aparecendo, 6 lançamentos certos. No mesmo print apareceram misturadas na Caixa Combustível 2 saídas "Crédito KMV" (consumo de crédito pré-pago, não gasto real) — usuário pediu pra tirar essas linhas de dentro das caixas e criar um Livro Razão próprio, **LRCC — Créditos e Cupons**. Decisão explícita do usuário: LRCC é só aba de EXIBIÇÃO (filtra por padrão de descrição, `caixa_id` das transações não muda) — NÃO é caixa de verdade, não entra em Balanço/Patrimônio, mesmo espírito do card "Créditos e Cupons" já existente ("Benefícios, não patrimônio"). Implementado em `hydrate-onda3-livro-razao.js` (função `onda3EhCreditoPrePago()`, detecta pelo padrão de descrição `- Crédito <nome>`, não por `afeta_saldo_real`/`cartao_id` sozinhos — esse par aparece em ~70 transações históricas não relacionadas) + aba nova no HTML. **Achado preventivo nesta sessão**: `atualizarContadoresAbasLR()` exige registro manual de toda aba nova (bug já documentado 3x antes, "caixa nova esquecida desta lista") — LRCC seria a 4ª vítima do mesmo padrão; adicionado antes de commitar, sem esperar o usuário reportar. Resumo do bloco 29 abaixo. **O problema maior — Não Reconciliado do Mastercard Black não fechar com a fatura real — continua ABERTO**, não mexido nesta sessão, ver seção "Pendência prioritária" abaixo.

## -10. Bloco 31 (20/08/2026) — reconciliação real da fatura Mastercard Black (1371, agosto/2026): pendência prioritária avançou de verdade

Usuário mandou a fatura aberta real (xlsx baixado do Itaú, cartão 1371, ~114 lançamentos de 16/07 a 17/08) e pediu reconciliação item a item contra o que está em `transacoes`.

**1ª tentativa de comparação (por `numero_final` de cartão) deu resultado ALARMANTE e ERRADO**: parecia faltar ~R$1.955 no cartão 4628, ~R$1.207 no 2244, etc. Usuário reagiu com razão: "tudo que compramos foi enviado para o sistema e deveria bater 100%". Investiguei mais a fundo em vez de aceitar o resultado.

**Causa dos falsos alarmes, achada por comparação item a item (script Python, matching por data+valor)**:
1. Esqueci o cartão **"2250" — "MB - fatura consolidada"** (`cartoes`, alimentado via Pluggy) — boa parte do que parecia "faltar" no 4628 estava lá, só sob esse ID consolidado em vez do cartão específico.
2. Várias compras da fatura viram **múltiplas linhas em `transacoes`** (ex.: 1 compra "Mercado*MercadoLivre R$551,01" virou 3 linhas — Kit + Fone + Cortador — porque foram divididas entre Caixa Variável e Bens Duráveis). Comparação 1-pra-1 falhava nesses casos.
3. **3 transações recorrentes fixas** (Faculdade Engenharia R$441,33, Brisanet R$113,13, Rastreador do carro R$59,99) têm `cartao_id` NULL de propósito — vivem em `cronograma_recorrencias`, que usa campo `cartao` como TEXTO fixo ("Mastercard Black"), não `cartao_id` — invisíveis pra qualquer busca baseada em `cartao_id`. **Não é bug, é arquitetura conhecida (Origem fixa do LRR).**

**Depois de corrigir a comparação, o gap real caiu de milhares de reais pra ~R$35** — confirmando que o usuário estava certo: quase tudo já estava no sistema.

**Achado real, corrigido**: 16 transações de 16-19/07 (Nobre Carnes, Sup Ideal, vários H57Store, Brothers Burger etc., soma R$1.005,95) estavam com `cartao_id` do cartão 1371 (novo) — a fatura real confirma que na época dessas compras o cartão ativo ainda era o **2244** (aposentado só depois, migração completa só a partir de 31/07). `UPDATE` aplicado corrigindo os 16 `cartao_id` de 1371→2244. Usuário deu contexto adicional: "esse cartão 2244 foi cancelado, e o novo é 1371, mas no sistema parece que ainda mantém o 2244 como dono da conta" — observação registrada, não investigada a fundo ainda (pode ser sobre `dono_real_id`/`usuario_id` divergente entre 1371/2244 e o cartão consolidado 2250 na tabela `cartoes` — ver se vale investigar numa próxima sessão).

**2ª rodada, com screenshots do próprio app do banco (18-19/08, fora do período do xlsx)**: usuário mostrou 5 lançamentos recentes achando que estavam faltando. 4 de 5 já estavam certos no banco (Nobre Carnes, MP*Brothersclub, as 2 compras do Mercado Livre de 18/08). Só faltava mesmo: Amazon Prime R$19,90 (19/08).

**Erro real cometido e corrigido na hora**: lancei a Amazon Prime como transação avulsa nova (`TX000348`) sem checar primeiro se já existia como assinatura — usuário corrigiu com razão ("isso é uma assinatura, eu já expliquei 1000 vezes"), confirmei por SQL que "Amazon Prime" já existia em `cronograma_assinaturas` (TXS000009) desde antes, revertido (`DELETE`). **Memória nova salva** ([[feedback_assinaturas_nunca_transacao_avulsa]]): sempre checar `cronograma_assinaturas`/`cronograma_recorrencias` antes de inserir qualquer transação nova motivada por item de fatura/extrato.

**Registro.br (hospedagem do site, R$40,00, cobrança anual)**: usuário disse ter lançado antes como assinatura, mas busca ampla (transacoes + as 2 tabelas de cronograma) não achou nada com esse nome. Pedido explícito do usuário: buscar por valor igual (R$40,00) antes de registrar de novo — busca não achou duplicata real (os R$40,00 existentes são PIX de sabão, consulta pediátrica, venda P2P, feira de artesanato — nada relacionado). Registrado como nova assinatura em `cronograma_assinaturas` (TXS000014).

**Pendência prioritária avança, mas NÃO fecha ainda**: o gap residual de ~R$35 (Registrobr já resolvido acima reduz ainda mais) tem candidatos identificados mas não fechados: assinatura Anthropic de 04/08 registrada como estimativa (R$113,72) vs valor real da fatura (R$116,52+R$4,08 IOF = R$120,60, card 8530); Uber One/YouTube (Fábio Sabino) confirmados pelo usuário como já registrados como assinatura, não é gap real. Não mexido nesta sessão — próximo passo: atualizar `cronograma_assinaturas` Claude (TXS000002) pro valor final real da fatura em vez da estimativa, seguindo a regra "valor final sempre substitui estimativa" ([[feedback_valor_final_sobre_estimado]]).

**3 cartões novos cadastrados em `cartoes`** (usuário pediu explicitamente: "atualizar os cartões do sistema, todos os agentes e chat devem conhecer eles" — `cartoes` já é a fonte única, isso só documenta o que mudou nesta sessão pra quem não vai reler o banco):
- **8530** — MB virtual (Wallace), achado na fatura ago/2026 cobrando Anthropic Claude Sub e 1 IOF. Só existia como transação solta antes, sem `cartao_id` linkável.
- **2135** — MB virtual (Wallace), uso único observado 19/07 (Ifd*Fornatto Pizza R$146,39).
- **0317** — MB físico (Wallace), só aparece na linha "Pagamento Efetuado -R$1.937,18" da fatura — pode ser referência de conta/débito automático, não cartão de compra; cadastrado mesmo assim pra não ficar invisível se aparecer de novo. Investigar de verdade se voltar a aparecer.

Nenhuma transação existente foi religada a esses 3 cartões novos ainda (só o cadastro em `cartoes` foi feito) — se aparecerem lançamentos com esses números numa fatura futura, já existe onde linkar.

**Ainda não recalculado**: `mbLRNaoReconciliado` (o card que motivou toda essa investigação, `hydrate-visa-mb.js`) não foi tocado nesta sessão — as correções acima foram só na base (`transacoes`/`cronograma_assinaturas`), não na fórmula do painel. Próxima sessão deve conferir se o resíduo do "Não Reconciliado" mudou depois dessas correções, antes de mexer na fórmula de novo.

## -9. RESOLVIDO — confirmado ao vivo pelo usuário: JPEG da seção Livros Razão funcionando

Usuário testou em produção (login real) o download da aba LRC - Corporativo e confirmou: JPEG saiu com as 25 abas E a tabela completa (5 lançamentos, TX000158/161/174/173/172, Origem ••••2244, rodapé "5 lançamentos · Reembolso pendente R$297,31"). **Fix da seção -8 confirmado funcionando em produção, não só na réplica isolada.**

Nota à parte: durante a investigação, o usuário chegou a testar sem querer a PRÓPRIA página de teste isolada do agente (`localhost:8934`, mockup sem lógica de troca de aba) achando que era o site real — pareceu "travado" porque os botões "Aba N" daquele mockup nunca tiveryam handler de clique (só o botão "Capturar" funcionava). Servidor de teste local encerrado (`TaskStop`) depois de esclarecido. Não é um bug do site — lição registrada só pra não confundir de novo se aparecer um `localhost:XXXX` estranho num relato futuro.

**Pendência residual RESOLVIDA**: usuário confirmou que as outras abas (testado LRW/LRV) continuam funcionando normalmente depois do download — a restauração dos panes escondidos funciona de ponta a ponta em produção, não só na réplica isolada. **Investigação do JPEG quebrado da seção Livros Razão encerrada, não reabrir sem sintoma novo.**

## -8. Continuação do bloco 30 — corrigido DE VERDADE, com validação em escala real ANTES de publicar

Depois do revert do `onclone` (seção -7), o usuário pediu pra insistir na correção ("corrija essa falha agora") e, em paralelo, pediu de novo pra mover o botão pra dentro do card (pra facilitar o teste dele). Desta vez, antes de tocar em qualquer código de produção, montei uma réplica muito mais fiel na página de teste isolada: **25 abas reais** (não 8) e **tabelas de 8 linhas cada** (não 2) — bem mais perto da escala real da seção Livros Razão, já que a hipótese era exatamente que o `onclone` se comportou diferente numa estrutura pequena vs. grande.

**Fix aplicado (técnica diferente do `onclone`)**: em vez de mexer só na cópia (que causou o regressão anterior, motivo exato não confirmado), `baixarSecaoComoJPEG()` agora remove os `.pane:not(.active)` da **própria página real** ANTES de chamar `html2canvas`, e devolve cada um pro lugar exato assim que a captura termina (posição salva via `nextSibling`, restaurados em `.finally()` — roda mesmo se a captura falhar). Testado na réplica de 25 abas: capturou TODAS as 25 abas E as 8 linhas da tabela corretamente, confirmado por captura de tela real, não só teoria.

**2º bug achado e corrigido ANTES de publicar** (só apareceu na escala real de 25 panes, nunca nos testes pequenos anteriores): restaurar os panes removidos na MESMA ordem em que foram removidos lança `NotFoundError` — o `nextSibling` salvo de um pane pode ser OUTRO pane também removido, que ainda não voltou pro DOM na hora do `insertBefore`. Se isso tivesse ido pra produção sem ser pego, as abas removidas NUNCA voltariam (erro não tratado no meio do `.finally()`), quebrando permanentemente LRW/LRV/todas as outras abas até o usuário recarregar a página inteira — regressão bem pior que o sintoma original. Corrigido restaurando em ORDEM INVERSA (o último removido tem a referência mais estável). Confirmado sem erro e com a ordem final idêntica à original antes de aplicar em produção.

**Botão de print reaplicado dentro do `.card`** (pedido do usuário, ancorado logo abaixo de `#lrTabs`, mesma técnica de antes) — agora seguro porque a causa real do JPEG quebrado (excesso de panes escondidos) está corrigida, não a posição do botão. Testado JUNTO com o fix acima na réplica de 25 abas antes de aplicar — o botão aparece como um pequeno ícone na imagem capturada (efeito colateral cosmético aceitável), a tabela renderiza certo do mesmo jeito.

**Lição reforçada**: depois do `onclone` ter passado no teste pequeno e falhado em produção, a escala do teste (25 panes reais, não 8 sintéticos) foi o que expôs o bug de ordem de restauração ANTES de publicar — sempre replicar o tamanho/complexidade real da estrutura ao testar, não só a forma.

**Validado nesta sessão via reprodução isolada em escala real (25 abas, tabelas de 8 linhas)** — ainda não confirmado no site de produção com login real. Próxima sessão/usuário deve testar baixando o JPEG de uma aba LRC/LRMI/LRCC e confirmar que as OUTRAS abas (LRW, LRV etc.) continuam funcionando normalmente depois do download (prova de que a restauração realmente devolveu tudo).

## -7. Continuação do bloco 30 — tentativa `onclone` PIOROU em produção, revertida; download da seção Livros Razão fica com limitação conhecida, não resolvida

A correção com `onclone` (seção -6 abaixo) foi testada e validada numa página de teste isolada antes de publicar — mas o usuário testou em produção e reportou que **piorou**: a captura passou a mostrar só a grade de abas, ainda menor que antes (nem o espaço em branco onde a tabela deveria estar aparecia mais). Revertido imediatamente pra chamada simples do `html2canvas` (sem `onclone`), mesmo comportamento de antes de toda essa investigação.

**Causa exata da diferença entre o teste isolado (funcionou) e produção (piorou) NÃO foi investigada até o fim** — a hipótese mais provável é alguma interação entre `onclone` e o jeito que o html2canvas 1.4.1 mede a altura total via iframe interno quando muitos nós (~24 panes reais, com tabelas grandes) são removidos no meio do processo, diferente da estrutura sintética de 8 panes pequenos do teste. Não teorizar mais sobre isso sem acesso real a login/dispositivo pra iterar com segurança — qualquer tentativa nova de mexer em `baixarSecaoComoJPEG()` pra este caso específico precisa ser testada pelo próprio usuário antes/durante, não só numa reprodução isolada.

**Resumo de tudo que foi tentado nesta sessão pro download da seção Livros Razão, do que funcionou e do que não**:
1. Mover o botão de posição → não era a causa, revertido.
2. `</div>` sobrando (bloco 29, remoção do LRCON) → bug real, ficou corrigido (não reverter).
3. `onclone` removendo panes inativos da cópia → piorou em produção apesar de validado isolado, revertido.

**Estado final**: baixar o JPEG da seção "07 Livros Razão" com uma aba tipo LRC/LRMI/LRCC ativa continua sem mostrar a tabela corretamente — limitação conhecida do html2canvas com essa estrutura (muitos `.pane` escondidos), sem solução aplicada. Não tentar de novo sem validação ao vivo passo a passo com o usuário.

## -6. Continuação do bloco 30 — causa raiz REAL e DEFINITIVA achada e corrigida: bug do html2canvas com muitos irmãos `display:none`

Depois da correção da `</div>` sobrando (seção -5 abaixo), usuário testou de novo (confirmado: recarregou a página, testou depois do aviso de publicação) e reportou que continuava igual — **corretamente**, a `</div>` era um bug real (bom ter corrigido), mas não era a causa deste sintoma específico.

**Investigação levada a sério, sem adivinhar de novo**: montei um servidor HTTP local mínimo (PowerShell `HttpListener`, já que não há node/python neste ambiente) servindo uma página de teste isolada, reproduzindo exatamente a estrutura da seção 07 (grade `.tabs` em CSS Grid + 8 `.pane` sendo 1 ativo/7 escondidos via `display:none`) e testei `html2canvas` de verdade, com captura de tela real do resultado (não só leitura de código). Confirmado visualmente: a captura sai só com a grade de abas, sem o conteúdo do pane ativo — reproduzido 100% fora do site real, isolando a variável.

**Causa raiz real**: `html2canvas` 1.4.1 tem um bug/limitação real — falha em renderizar o conteúdo de um elemento quando ele tem MUITOS irmãos `display:none` no mesmo container (testado: removendo os 7 panes escondidos da página de teste, a captura passa a funcionar perfeitamente). Na seção real, `.card` tem até 24 `.pane` escondidos ao lado do único ativo — bate exatamente com o padrão do bug. Confirmado que trocar `.tabs` de `display:grid` pra `display:flex` NÃO resolve (mesmo padrão de falha) e que a opção `foreignObjectRendering:true` do html2canvas também NÃO resolve — o problema é mesmo os irmãos escondidos, não o layout da grade.

**Corrigido**: `baixarSecaoComoJPEG()` (`ui-componentes-visuais.js`) agora passa `onclone` pro html2canvas — um callback que roda numa CÓPIA isolada do DOM (nunca a página real que o usuário está usando ao mesmo tempo) e remove `.pane:not(.active)` dessa cópia antes da renderização. Testado na página de teste isolada: com `onclone`, a captura volta a mostrar a tabela corretamente. `.pane:not(.active)` só existe na seção de Livros Razão — zero efeito nas outras ~47 seções do site (que não têm essa classe).

**Lição registrada**: quando um sintoma sobrevive a uma correção plausível mas errada, vale a pena isolar a variável de verdade (reprodução mínima fora do sistema real) em vez de ficar só lendo código e formulando teoria sobre teoria — a reprodução isolada achou a causa real em poucos minutos, onde leitura de código sozinha não teria achado (o bug é do html2canvas em si, não do código do site).

**Validado nesta sessão via reprodução isolada** (não no site real com login, ainda) — próxima sessão/usuário deve confirmar baixando o JPEG de uma aba LRC/LRMI/LRCC no site de produção.

## -5. Continuação do bloco 30 — causa raiz REAL do JPEG quebrado achada: `</div>` sobrando desde a remoção do LRCON (bloco 29), nada a ver com o botão

Usuário reportou: baixando o JPEG da seção "07 Livros Razão" (botão ⬇) com uma aba LRC (Corporativo) em diante selecionada, o arquivo vem só com a grade de abas, sem a tabela — LRW até LRR normais. 1ª tentativa (mover o botão pra dentro do `.card`) foi cogitada como causa e revertida, mas o usuário corrigiu: **o problema já existia ANTES dessa mudança de posição** — não era o botão.

**Causa raiz real, achada por leitura cuidadosa do HTML**: `Sistema_Wallace_Lira_Completo.html` linha 641 tinha uma `</div>` SOBRANDO, sem abertura correspondente — sobrevivente da remoção da aba LRCON no bloco 29 (a linha 640, `<div id="lrcon" class="pane" style="display:none"></div>`, já é auto-contida/balanceada; a 641 era um resto órfão do conteúdo antigo que foi apagado). Essa `</div>` extra fechava o `.card` da seção 07 (aberto na linha 530) CEDO DEMAIS — logo depois da aba LRCON morta — jogando as ~19 abas seguintes (LRC, LRMP, LRCV, LREI, LRDOA, LRPV, LRPVSALDO, LRBD, LRCL, LRMN, LRAJ, LREV, LRSF, LRSE, LRCB, LRCH, LRMI, LREM, LRCC) pra FORA da árvore DOM do `.card`, mesmo elas continuando a renderizar normalmente NA TELA (o parser HTML5 corrige tags desbalanceadas silenciosamente, sem quebrar a visualização — só a estrutura lógica fica errada). `html2canvas(card,...)` (`baixarSecaoComoJPEG()`) captura literalmente o subtree de `.card` — como essas abas não são mais descendentes dele, ficam de fora de qualquer captura, mesmo a pessoa vendo a tabela perfeitamente na tela ao navegar até ela diretamente.

**Corrigido**: `</div>` extra removida (`Sistema_Wallace_Lira_Completo.html` linha 641). Confirmado por contagem total: 1367 `<div>` = 1367 `</div>` no arquivo inteiro depois da correção (balanceado). Fechamento correto do `.card` continua sendo a `</div>` da linha 795 (logo antes da seção 08), agora emparelhada certo com a abertura da linha 530.

**Reposicionamento do botão de print (pedido original)**: revertido antes por engano (achando que era a causa), mantido revertido mesmo agora que a causa real foi corrigida — o botão continua no cabeçalho pra todas as seções. Fica como pedido separado, não resolvido ainda, pra não empilhar 2 mudanças not-tested na mesma sessão sem validação ao vivo.

**Lição registrada**: `</div>` órfã depois de remover um bloco HTML pode não quebrar a tela (o navegador conserta sozinho na hora de renderizar) mas quebra qualquer ferramenta que dependa da árvore DOM real (html2canvas, `querySelectorAll` escopado, etc.) — depois de remover qualquer bloco de HTML, contar `<div>`/`</div>` da região editada é mais confiável que só olhar a tela.

**Não validado em navegador real com login** (mesma limitação de sempre) — usuário deve conferir baixando o JPEG de uma aba LRC/LRMI/LRCC depois desta correção.

**De brinde, mesmo pedido**: nome do arquivo baixado incluía só o título da SEÇÃO ("secao-07-livros-razao-<data>.jpg"), igual pra qualquer uma das 25 abas — usuário pediu pra identificar a caixa. Corrigido em `inicializarBotoesPrintSecao()`: o handler de clique agora lê `.tab.active` (a aba selecionada no momento) e anexa o nome dela ao título antes de gerar o slug do arquivo (ex. `secao-07-livros-razao-lrc-corporativo-2026-08-19.jpg`), tirando o sufixo "(N)" de contagem do nome. Só se aplica a seções com abas — as demais (maioria do site) continuam com o nome de sempre.

## -4. Continuação do bloco 30 — bug real corrigido: LRW/LRV/LRC-limbo revertiam pro V1 (sem Origem, sem ano) a cada troca de ciclo

Usuário reportou: "as compras do limbo devem ter sua origem preenchida, cartão, e a data falta o ano". Investigado a fundo (não assumido "flash transitório de boot") — achada a causa raiz real, mesma classe de bug já corrigida no bloco 28 pra Caixa Variável, nunca replicada aqui.

`aplicarCicloAoVARS()` (`app.js`, dentro de `trocarCiclo()`) restaura, ao voltar pro ciclo ATUAL (não fechado), as constantes `LRW_TRANSACOES_CICLO_ATUAL`/`LRV_TRANSACOES_CICLO_ATUAL`/`LRC_LIMBO_TRANSACOES_CICLO_ATUAL` — capturadas **uma única vez, na carga do script** (`app.js` linha ~1907-1909), ANTES de qualquer fetch V2 (`aplicarOnda3LrwLrv()`/`aplicarOnda10LrcLimbo()`) terminar. Essas 3 constantes ficam congeladas pra sempre com o shape do literal V1 antigo (`vars-mercado-pago.js`, sem `cartaoId`, data `'DD/MM'` sem ano). Toda vez que o usuário troca de ciclo e volta pro atual, `VARS.LRW_TRANSACOES`/`LRV_TRANSACOES`/`LRC_LIMBO_TRANSACOES` são sobrescritas com essas constantes congeladas — mesmo depois da V2 já ter corrigido a tela no boot — e a tabela reverte silenciosamente, sem nunca se corrigir sozinha de novo (a V2 já rodou 1x, não re-roda sem gatilho).

**Corrigido** em `trocarCiclo()` (`src/financeiro/cenarios/ciclo-selecao.js`): depois do bloco já existente que re-busca V2 pra Caixa Variável (bloco 28), novo bloco re-chama `aplicarOnda3LrwLrv()`/`aplicarOnda10LrcLimbo()` — só quando o ciclo selecionado é o ATUAL (`!snap.fechado`); pra ciclo fechado, a fotografia congelada do snapshot continua sendo o comportamento CORRETO (regra V174), não deve ser sobrescrita por dado ao vivo. Mesmo padrão aditivo/fire-and-forget do fix da Caixa Variável.

**RESOLVIDO** (agente dedicado, mesmo dia, prioridade 0): `LRPGV_TRANSACOES` (PIX Geral Vanessa) tinha a MESMA constante congelada (`LRPGV_TRANSACOES_CICLO_ATUAL`, app.js linha ~1910) e o mesmo padrão de restore (linhas ~1938/1946) — quem a corrige de verdade é `aplicarOnda3LivroRazao()` (as 13 caixas temáticas do ONDA3_LR_MAPA), não `aplicarOnda3LrwLrv()`. Documentado abaixo como risco residual, depois corrigido dentro do mesmo bloco `if(!fechado)` de `trocarCiclo()` (`src/financeiro/cenarios/ciclo-selecao.js`): adicionada a chamada `if(typeof aplicarOnda3LivroRazao === 'function') aplicarOnda3LivroRazao();`, mesmo padrão fire-and-forget dos dois blocos irmãos. Como efeito colateral desejado, as outras 12 caixas temáticas do ONDA3_LR_MAPA também passam a se re-hidratar a cada troca de ciclo (antes só rodavam no boot). Ver commit da correção no topo de `PASSAGEM_DE_TURNO.md`.

**Não validado em navegador real com login** (mesma limitação de sempre) — próxima sessão deve conferir: trocar de ciclo (ex. ir pro Jun/26 fechado e voltar pro Jul/26 atual) e checar que LRW/LRV/LRC-limbo continuam com Origem preenchida e data com ano depois da troca.

## -3. Continuação do bloco 30 — 3ª transação KMV registrada + espaçamento das abas do LR corrigido + "print fecha" investigado (sem causa em código)

Usuário mandou mais 2 prints do app KMV mostrando um 3º abastecimento com Crédito KMV não registrado ainda: **P Monumento Comércio Varejista de Combustíveis Ltda, R$200,00, 17/07/2026 às 11h27**. Registrado em `transacoes` (`TX000347`, mesmo padrão dos outros 2 — `caixa_id` Combustível, `cartao_id` null, `afeta_saldo_real=false`, descrição terminando em "- Crédito KMV" pra já entrar automaticamente no filtro do LRCC).

**Print de alinhamento**: usuário mostrou a grade de abas do Livro Razão (seção 07) com a última linha (rótulos longos tipo "LREM - Emagrecimento"/"LRCC - Créditos e Cupons" quebram em 2 linhas) parecendo colada no cabeçalho da tabela logo abaixo. Corrigido com `margin-top:0.6rem` em `.pane.active` (`assets/css/styles.css`) — dá respiro sem mexer no tamanho/quebra de texto dos botões (que já eram intencionais, `min-height` documentado desde 14/08).

**"Toda vez que vou tirar print está fechando"**: investigado no código (busca por `visibilitychange`/`blur`/logout automático/redirect) — **nenhuma causa em código encontrada**. Firebase usa persistência padrão (sobrevive a troca de app). Resposta dada ao usuário: é muito provavelmente o navegador/SO do celular matando a aba em segundo plano por gerenciamento de memória/bateria ao abrir o app de captura — não é algo commitável. Se o sintoma persistir e for realmente o site (não o SO), precisa de mais detalhe do usuário (qual navegador/app, print reproduzindo o problema) antes de investigar mais.

## -2. Continuação do bloco 30 — Origem do LRCC corrigida (Cupom/Crédito, não PIX/dinheiro) + crédito Uber atualizado

Usuário testou o LRCC ao vivo e mandou print: a coluna Origem mostrava "🔑 PIX/dinheiro" nas 2 linhas de Crédito KMV — tecnicamente correto (`cartao_id` é nulo) mas enganoso, pediu algo como "Cupom ou Gift". Corrigido em `onda3LinhaTransacao()` (`hydrate-onda3-livro-razao.js`): checa `onda3EhCreditoPrePago(t)` ANTES do cartão/PIX genérico, mostra **"🎟️ Cupom/Crédito"** (cor âmbar) pra essas linhas.

Usuário também pediu pra registrar todo consumo de crédito pré-pago já usado que ainda não estivesse na tabela `transacoes`, mandando 5 prints dos apps reais (KMV Ipiranga, Shell Box, Uber Wallet). **Conferido por SQL antes de mexer em qualquer coisa**: os 2 lançamentos já existentes (TX000329, 16/08; TX000333, 05/08) batem exatamente com os 2 abastecimentos reais do app KMV (mesmas datas) — os "4" registros que pareciam aparecer no print do app eram a mesma lista de 2 duplicada (captura de scroll), não 4 eventos reais. Confirmado também que o filtro de descrição (`- Crédito <nome>`) não pega por engano os outros "crédito P2P" da caixa Variável (aquisição/venda de lote de crédito de maquininha, semântica totalmente diferente) — são 4 transações reais não relacionadas, checadas uma a uma. **Nada novo registrado** — usuário confirmou que os 2 KMV restantes (ainda não gastos) já estão refletidos só como SALDO no card "Créditos e Cupons", sem virar transação até serem de fato usados.

**Crédito Uber atualizado** (pedido explícito, com print do app: "Uber balances R$62.28"): `UPDATE beneficios_creditos SET saldo = 62.28 WHERE nome = 'uber'` (era R$68,69). Shell Box conferido no print (R$200,00) — já batia com o banco, nenhuma mudança necessária.

**Não validado em navegador real com login** (mesma limitação de sempre) — próxima sessão/usuário deve conferir: card "Créditos e Cupons" mostrando Uber R$62,28, e a aba LRCC com Origem "🎟️ Cupom/Crédito" nas 2 linhas.

## -1. Bloco 30 (19/08/2026) — LRCC (Créditos e Cupons) criado + confirmação ao vivo do fix "Combustível não muda"

### -1.1 Confirmação ao vivo — pendência 0b do bloco 29 RESOLVIDA

Usuário testou em produção com login real e mandou print: Caixa Combustível mostrando os lançamentos com coluna Origem preenchida e o rodapé recalculado. O fix da flag `window.__wallaceOnda3LivroRazaoAplicado` (race condition, bloco 29) funcionou como esperado. Não reabrir essa investigação sem sintoma novo.

### -1.2 LRCC — Créditos e Cupons, aba nova (só exibição, decisão explícita do usuário)

Print do mesmo teste mostrou 2 linhas "Abastecimento Posto Ipiranga (...) - Crédito KMV" (R$200,00 cada, TX000329/TX000333) misturadas dentro da Caixa Combustível, "atrapalhando a leitura do gasto real de combustível" (palavras do usuário). Pergunta feita antes de codar: LRCC devia virar caixa de verdade (nova linha em `caixas`, entra em Balanço/Patrimônio) ou só aba de exibição? Usuário escolheu **"Só aba de exibição (Recomendado)"**.

Implementado em `src/financeiro/caixas/hydrate-onda3-livro-razao.js`:
- `onda3EhCreditoPrePago(t)`: regex `/-\s*Cr[ée]dito\s+\S/i` na descrição — não usa `afeta_saldo_real=false` + `cartao_id null` sozinho porque esse par aparece em ~70 transações históricas não relacionadas (parcelamentos antigos, P2P, estornos), confirmado por SQL antes de escrever o filtro.
- As 13 caixas de `ONDA3_LR_MAPA` agora excluem essas linhas da própria tabela e da soma (`linhas = transacoes.filter(t => t.caixa_id === caixaId && !onda3EhCreditoPrePago(t))`) — antes elas apareciam na tabela só excluídas da soma, agora nem aparecem, o LRCC é a única fonte.
- Novo bloco no fim de `aplicarOnda3LivroRazao()`: varre TODAS as transações buscadas (não só de 1 caixa) por `onda3EhCreditoPrePago()`, popula `lrccTbody`/`tf_lrcc`/`qtd_lrcc`. Se um novo tipo de crédito pré-pago aparecer (ex: "- Crédito Shell Box"), o padrão já cobre automaticamente.
- Aba nova no HTML (`Sistema_Wallace_Lira_Completo.html`): botão `LRCC - Créditos e Cupons`, pane com nota fixa explicando "não tira dinheiro real de nenhuma caixa, não entra em Balanço/Patrimônio".
- **Achado preventivo, corrigido antes de qualquer teste do usuário**: `atualizarContadoresAbasLR()` (`src/dashboard/widgets/atualizar-contadores-abas-lr.js`) exige registro manual de cada aba (`paineis[]`/`labels{}`) — o próprio arquivo documenta 3 ocorrências anteriores do mesmo bug ("caixa nova esquecida desta lista", ex.: LRBD, depois LREM). Adicionado `lrcc` nos dois arrays antes de commitar, pra não repeti-lo pela 4ª vez.

**Não validado em navegador real com login nesta sessão** (mesma limitação de sempre, sem acesso a login) — próxima sessão/usuário deve conferir: aba "LRCC - Créditos e Cupons (N)" aparece com contador certo, mostra as 2 linhas de KMV, e a Caixa Combustível não mostra mais essas 2 linhas nem soma elas no rodapé.

## 0. Bloco 29 (19/08/2026) — coluna Origem em todos os Livros Razão + bug de race condition corrigido (Combustível "não muda") + LRCON removido

### 0.1 Coluna Origem — rollout completo

Pedido permanente do usuário, repetido várias vezes na sessão: toda linha de todo Livro Razão precisa dizer se saiu de cartão (final do cartão) ou PIX/dinheiro — motivo prático dele: "se tivesse isso, seria mais simples saber o que são compras do cartão". Implementado em 2 estilos, dependendo se a linha tem `cartao_id` real por transação ou não:

- **Origem dinâmica** (lê `cartao_id` real da transação, mostra `💳 ••••NNNN` via `getCartoesMapa()`, ou `🔑 PIX/dinheiro` se nulo): LRW, LRV, LRC-limbo, LRCV (sempre PIX por definição, sem coluna — já era o conceito), e as 13 caixas temáticas via `onda3LinhaTransacao()` (`hydrate-onda3-livro-razao.js`).
- **Origem fixa** (a fonte não tem `cartao_id` por linha — é agregado/schedule, não `transacoes`; cartão é sempre o mesmo por definição do livro): LRS/LRR (assinaturas/recorrências) = `💳 ••••4628`; LRP (parcelas Visa) = `💳 ••••4844`; LRMP (parcelas Mercado Pago) = `💳 ••••7642`; LRB (boletos) = `🧾 Boleto`; LRDOA (doações) = `🔑 PIX`.

### 0.2 Bug real corrigido — "Combustível não muda" era race condition, não cache

**Sintoma relatado pelo usuário**: mesmo com o servidor confirmado servindo o JS/HTML corrigidos (fetch direto com `cache:'no-store'` batendo), e testado em aba anônima genuína com navegador fechado entre tentativas, a Caixa Combustível continuava sem a coluna Origem e com o rodapé antigo (`-R$198,50`, a soma ERRADA que conta os 2 "Crédito KMV" de R$200 como saída de caixa).

**Causa raiz real** (achada lendo o código, não suposta): `render-livros-variaveis.js` tem um bloco `CAIXAS_LR_SIMPLES` (+ 2 blocos irmãos pra PIX Vanessa e Bens Duráveis) que desenha as MESMAS 9+2 tabelas que `hydrate-onda3-livro-razao.js`/`aplicarOnda3LivroRazao()` (V2, correto) já desenha — só que com o shape antigo (sem Origem) e o rodapé de `VARS.caixaCombustivel` (nunca recalculado, sempre com a soma errada). 4 módulos assíncronos diferentes (`aplicarOnda4Lrei`, `aplicarOnda3LrwLrv`, `aplicarOnda10LrcLimbo`, `aplicarOnda12CaixasPequenasV2`) rechamam `renderLivrosVariaveis()` inteira só pra atualizar UMA tabela sua — e como todos são fetches paralelos sem ordem garantida, sempre que um deles resolvia DEPOIS de `aplicarOnda3LivroRazao()`, o redraw errado vencia a corrida e apagava o certo. Não era cache nenhum — cada F5/aba anônima literalmente refazia a corrida do zero, às vezes ganhando às vezes perdendo.

**Fix**: `aplicarOnda3LivroRazao()` seta `window.__wallaceOnda3LivroRazaoAplicado = true` no fim (`hydrate-onda3-livro-razao.js`). `render-livros-variaveis.js` agora pula os 3 blocos (`CAIXAS_LR_SIMPLES` + PV + BD) quando essa flag já está `true` — a V2 correta nunca mais é sobrescrita depois de assumir. Commit `4e0b327`.

**Efeito colateral aceito, documentado**: com a flag ativa, trocar de ciclo pelo seletor (`trocarCiclo()`) não redesenha mais essas 11 tabelas com dado filtrado por ciclo — mas `aplicarOnda3LivroRazao()` já não filtrava por ciclo mesmo antes desta correção (só por `caixa_id`), então não é uma regressão nova, é uma característica pré-existente da Onda 3 que ficou mais visível.

### 0.3 LRCON (Consórcios) removido

Aba/botão/pane HTML removidos (`Sistema_Wallace_Lira_Completo.html`), referência em `onda9MarcarIndisponivel` (`hydrate-onda9-livros-fixos.js`) limpa. Motivo: consórcios migraram pra Boletos há tempo, `cronograma_consorcios` permanentemente `ativo=false` — aba não tinha mais dado real pra mostrar.

## 1. Pendência PRIORITÁRIA — "Não Reconciliado" do Mastercard Black ainda não fecha com a fatura real (usuário vai continuar isso com outro agente)

**Estado real, Nível A/B (código lido + SQL rodado nesta sessão)**: `hydrate-visa-mb.js`, função que popula `mbLRNaoReconciliado` (linha ~75): `D.naoReconciliado = R.cartaoMB.total - D.corp - somaPartes`, onde `somaPartes` é a soma de LRW+LRV+LRS+LRR (as 4 categorias que compõem o pessoal, sem corporativo). `cartaoMBTotal` está fixado em R$6.480,29 (valor real do banco, âncora — ver `docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md`, "a fatura sempre vence", nunca derivada só da V2). O resíduo (`naoReconciliado`) não fecha em zero.

**A ideia do usuário pra resolver isso, nas palavras dele (repetida várias vezes nesta sessão)**: *"você precisa usar os LRs, das caixas para formar o cartão, toda compra que é feita no cartão é presa em um LR e uma caixa... você tem que sempre contar no total comprometido tudo que é registrado nesses livros LRW, LRV, LRS, LRR, LRC, LRCV, LRBD, LRMN, LREV, LRSF, LRSE, LRCB, LRCH, LREM como no Mastercard Black e para o Pessoal (s/ corporativo) tem que descontar o LRC."* — ou seja: a soma de TODOS os Livros Razão cuja Origem aponta pro cartão Mastercard Black (agora que a coluna Origem existe em todos eles, ver seção 0.1 acima) deveria, por construção, bater exatamente com a fatura real — porque toda compra no cartão nasce como uma linha de `transacoes` com aquele `cartao_id`, presa a uma caixa/LR específico (regra 1.3 do manual operacional).

**O que já foi feito nesta sessão a caminho disso**: a coluna Origem (seção 0.1) é o pré-requisito de dado que faltava — antes dela não dava pra somar "tudo que aponta pro Mastercard Black" de forma confiável, porque as 13 caixas temáticas não guardavam `cartao_id` visível por linha nas tabelas. `atualizarCaixasTematicasComprometidoMB()` (`hydrate-visa-mb.js`) já busca o comprometido MB-only das 9 caixas temáticas via `getComprometidoPorCaixaECartoesV2` — mas **a tentativa de somar esse valor no `naoReconciliado` piorou o resultado ao vivo** (foi de +R$1.248,23 pra −R$1.617,62, testado com login real) e foi revertida — o valor continua calculado/exibido (`mbLRCaixasTematicas`) mas fora da fórmula. Não investigado a fundo o motivo de piorar (hipótese não confirmada: dupla contagem entre `somaPartes` — que já inclui LRW/LRV — e o comprometido das temáticas, que pode se sobrepor parcialmente com compras que também aparecem em LRW/LRV se a caixa "paga" via Caixa Variável em vez de saldo próprio).

**Próximo passo sugerido pro agente que continuar**: antes de mexer na fórmula de novo, reconstruir a soma TOTAL de "tudo com Origem = Mastercard Black" **direto pela coluna Origem já implementada** (uma query em `transacoes` filtrando `cartao_id = <uuid do MB>` no ciclo relevante, comparada linha a linha contra o que cada LR já soma) em vez de tentar somar por-caixa-agregada de novo — a fonte de verdade pra "quem é MB" agora é o `cartao_id`, não mais uma lista de caixas presumidas. Se a soma direta por `cartao_id` também não bater com a fatura, o gap é uma transação real faltando ou mal-taggeada (`cartao_id` errado/nulo numa compra que deveria ser MB) — mesma classe dos 2 achados reais já feitos antes nesta investigação (TX28004 com `afeta_saldo_real` errado, MP*BROTHERSCLUB faltando lançar) — não um problema de fórmula.

## 2. Bloco 28 (19/08/2026) — investigação P0 "transações V2 invisíveis": achado diferente do relatado, 1 bug real corrigido, 1 aviso de mitigação, 1 falso-alarme (KMV) descartado

Usuário trouxe um relatório de outro agente (Claude Chat, arquivo `.md` avulso) alertando prioridade máxima: "48 transações lançadas só na V2 desde 13/07, R$7.091,00, nunca aparecem no painel real porque `app.js` ainda lê 100% de V1". Antes de agir, rodei 10 agentes (SQL direto no Supabase + leitura do código real, nunca supondo o relatório certo) pra confirmar ou refutar.

### 0.1 A premissa do relatório estava parcialmente errada

As 10 caixas afetadas (Caixa Variável, Bens Duráveis, PIX Geral Vanessa, Lance, Churrasco, Mercado Pago, Combustível, Emagrecimento, PIX Vanessa, Mastercard_Infinite) **já leem o saldo de V2**, não de V1/`wallace_dados` — confirmado arquivo:linha para cada uma. A causa raiz real é mais específica que "painel lê V1":

1. **A view `vw_saldo_v2_por_caixa` exclui `afeta_saldo_real=false`** (por design — esse valor deveria contar em "Comprometido no cartão", não no saldo). **Caixa Combustível tem 2 lançamentos reais** (R$200,00 cada, "Abastecimento Posto Ipiranga — Crédito KMV", 05/08 e 16/08) com `afeta_saldo_real=false` **E `cartao_id` nulo** — pareciam invisíveis em qualquer bloco (nem saldo, nem comprometido). **Investigado e descartado como bug**: o usuário confirmou que "Crédito KMV" é um crédito pré-pago próprio (posto de combustível), com controle já implementado — tabela `beneficios_creditos` (linha `kmv_ipiranga`, card "Créditos e Cupons" do painel, `credKmv`), confirmado por SQL que o saldo (R$200,00 hoje) já reflete os 2 gastos de R$200,00. `afeta_saldo_real=false`+`cartao_id=null` estão **corretos** — não é caixa nem cartão, é consumo de crédito pré-pago, não gera dívida nem deveria contar em saldo/comprometido de Caixa Combustível. Nenhuma escrita feita nas transações (não precisava).
2. **Bug real, corrigido**: `trocarCiclo()` (seletor de ciclo da UI, sem F5) chama `recalcularAgregadosDerivados()`, que reescreve `REG.caixaVariavel.saldoReal/comprometido` a partir de V1 incondicionalmente — e nunca re-chama `aplicarOnda1V2()`/`aplicarComprometidoCaixaVariavelV2()` (que só rodam 1x no boot via `onDomPronto`). Resultado: no carregamento inicial o usuário vê o valor V2 correto; ao trocar de ciclo pelo seletor, a Caixa Variável **revertia silenciosamente pro V1 congelado** até a próxima recarga de página inteira.

### 0.2 Achados colaterais da investigação (não corrigidos, registrados)

- `FinanceService.js`/`PatrimonioService.js`/etc. (a "camada de Services" que o relatório original citava como "já pronta, só falta conectar") **foi deletada em 14/08/2026** (commit `2b20137`, "código morto, zero consumidor") — só sobrevive num worktree órfão nunca mergeado. O mecanismo real e ativo hoje é outro: `WallaceFinanceService` inline em `app.js` + os blocos `promocoes-financeengine.js` (FASE 2D/2F).
- `MATRIZ_MIGRACAO_FASE2.md` (citado no relatório original) **não existe em lugar nenhum do repositório** (nem histórico de git) — tratar como não-fonte se aparecer citado de novo.
- FASE 2F (`promocoes-financeengine.js`) promove em lote **outras** 10 caixas (Manutenção, Aniversário Júlio, Eventos, Saúde Família, Seguro Emplacamento, Combustível, Churrasco, Escola de Júlio, Bens Duráveis, Lance) via gate de "divergência V1×V2 zero" — mas como V1 está congelado (decisão de 12/08) e V2 recebe lançamentos novos, esse gate está **estruturalmente fadado a reprovar** caixas com lançamento manual recente. Não é bloqueio de infra, é um critério de design que passou a trabalhar contra a decisão já tomada. Fica pra decisão futura, não mexido agora.
- Não há `node`/`npm`/`package.json` neste ambiente — nenhum teste automatizado pode ser rodado antes de mudar código de cálculo financeiro; o único "teste" real hoje é o Comparator rodando ao vivo em produção.

### 0.3 O que foi corrigido/implementado nesta sessão

1. **Correção real** (`src/financeiro/cenarios/ciclo-selecao.js`, dentro de `trocarCiclo()`): 2 linhas adicionadas, re-chamando `aplicarOnda1V2()`/`aplicarComprometidoCaixaVariavelV2()` a cada troca de ciclo (aditivo, reaproveita cache em memória, fallback de falha já embutido nas próprias funções — `marcarIndisponivelV2`). Também atualiza os gráficos Chart.js da Caixa Variável depois que a V2 resolve.
2. **Aviso de mitigação** (novo `src/auditoria/verificacoes/hydrate-aviso-lancamentos-manuais-v2.js` + card em `Sistema_Wallace_Lira_Completo.html` + CSS em `assets/css/styles.css`): banner vermelho na Home, só leitura (1 `SELECT` em `transacoes` via `WallaceFinanceService.getTransacoesManualPendentesV2()`, mesmo padrão de `getSaudeJobs()`), mostra contagem/soma de lançamentos `origem='manual'` — avisa sem prometer qual caixa específica está errada, já que a causa varia por caixa. Escondido se zero lançamentos ou se a busca falhar.
3. **3 rodadas de verificação adversarial** (workflow, 10 agentes no total): confirmado que nenhum cálculo de saldo/comprometido existente foi tocado, que os números do aviso batem exato com SQL direto, e que RLS do Supabase já impede vazamento sem login. Zero achado bloqueante.
4. **Gate de divergência V1×V2 removido nas 3 fases realmente afetadas por staleness** (segundo workflow, 10 agentes: 5 triando as 17 fases de `promocoes-financeengine.js` uma a uma, 1 implementando, 3 verificando adversarialmente + 1 síntese, a pedido explícito do usuário — "só V2 vai existir"). Achado: **só 3 das 17 fases (FASE 2F — as 10 caixas reconciliadas — e FASE 2G itens 1/2 — Patrimônio Financeiro/Meta do Milhão, que herdam a Caixa Lance da 2F) eram staleness de verdade** (V1 congelado vs V2 crescendo com lançamento novo) — essas tiveram o gate trocado pra `aprovado = true`.
5. **Usuário insistiu ("só V2 como verdade absoluta, não pode existir nada paralelo") e o gate foi removido nas OUTRAS 14 fases também**, a pedido explícito e repetido, apesar do risco explicado (essas 14 são teste de regressão de fórmula, não staleness — V1 e V2 leem as MESMAS variáveis no mesmo instante, sem fetch novo; divergência ali indicaria bug de cálculo, não dado desatualizado). Todas as 17 fases agora têm `aprovado = true` — `WallaceComparator.compararLote()` continua rodando em TODAS, só que 100% como log/diagnóstico (`console.table`), nunca mais bloqueia o que é exibido. Diff revisado pessoalmente (22 linhas, só a condição do gate mudou em cada uma, nenhuma fórmula tocada) antes de commitar. **Risco real assumido conscientemente**: se o FinanceEngine tiver um bug de fórmula não descoberto em alguma dessas 14 fases, ele agora vai pro ar direto (antes ficava barrado pelo gate) — já aconteceu 1 vez antes (Solar, "teto de disponibilidade", corrigido antes desta sessão) via exatamente esse mecanismo. Comentário de alerta específico deixado na FASE 2K (Solar) por ser a que já pegou um bug real antes.

### 0.4 Pendências reais abertas desta investigação

- **As outras 9 caixas do achado original** (mesmo padrão `afeta_saldo_real=false` + `cartao_id` nulo pode existir em outras, só Combustível foi confirmado por SQL) — não auditado linha a linha ainda, escopo desta sessão foi só confirmar o padrão e corrigir o achado concreto.

## 3. Bloco 27 (19/08/2026) — automação de faturas via Gmail (Água/Gás/Energia) + consumo solar automático + gráficos novos

### 0.1 Água/Gás Medintech — automação completa, ponta a ponta

Usuário conectou o Gmail via MCP nesta sessão. `scripts/sync/atualizar_boletos_medintech.py` busca e-mail de `sistemas@bzs.com.br` (contas 753=Água, 1024=Gás), baixa o PDF anexado, extrai o valor pela **linha digitável Febraban** (formato regulado, imune a mudança de layout do PDF) e faz `PATCH` idempotente em `cronograma_boletos_fixos`. Workflow `atualizar_boletos_medintech.yml` no mesmo padrão dos outros robôs (`workflow_dispatch`+`workflow_call`, sem `schedule`). **Achado de drift real**: fatura de julho/2026 mostrou Água R$133,41→R$152,16 e Gás R$30,28→R$36,70 — corrigido no Supabase com o PDF como evidência.

### 0.2 Energia Energisa (TXB000009) — estendido, mas AINDA INCOMPLETO pro Wallace

3 rodadas de correção real na mesma sessão, documentadas em detalhe em `docs/decisions/AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md`:

1. **Erro cometido e revertido**: 1ª tentativa validava a fatura por CPF do campo PAGADOR — descobriu-se que o Wallace é pagador também na conta da própria mãe (arranjo familiar), então CPF do pagador não prova "é a conta dele". Chegou a escrever `TXB000009=R$56,11` (valor da fatura da mãe) no Supabase, revertido pro valor anterior (R$367,36) antes de qualquer commit.
2. **Corrigido de verdade**: identificação agora usa o **Número da UC** (unidade consumidora — sempre presente, exclusiva de 1 imóvel, nunca compartilhada). Testado contra o PDF da mãe: rejeita corretamente.
3. **3º achado real**: a linha digitável Febraban não aparece em toda fatura Energisa (a da irmã, já paga, não tem ficha de compensação). Método de valor trocado pra Energisa: `vencimento+R$` → `TOTAL:` → linha digitável (fallback). Testado contra 2 PDFs reais (mãe R$56,11/145kWh, irmã R$70,12/111kWh) — bateram exato.

**Estado real**: UC da mãe (`573.702.053-77`) e da irmã (`2.064.202.053-60`) confirmadas contra PDF real. UC do Wallace (`1.994.775.053-05`) é **Nível C** — informada pelo usuário, nunca testada contra PDF real dele (fatura do ciclo atual ainda não emitida). `cronograma_boletos_fixos.TXB000009` continua em R$367,36 (valor antigo, não substituído por engano).

### 0.3 Consumo solar de referência (3 casas) automatizado

`energia_solar_consumo_referencia` era 100% manual (usuário lia a fatura, agente digitava). Mesmo robô passou a atualizar automaticamente, usando o "Consumo em kWh" do mês atual (não a média histórica, que só existe em 1 dos 2 formatos de fatura vistos). Atualizado com evidência real: mãe 300→145 kWh, irmã 112→111 kWh (Wallace não tocado). **Bug real corrigido antes do commit**: `consumo_diario_kwh` é coluna GERADA no Postgres — script tentava escrever nela direto, Supabase rejeitava; corrigido pra só mandar `consumo_mensal_kwh`/`dias_base`/`fonte`.

### 0.4 Card "Consumo real (fatura Energisa)" — painel privado + compartilhado

Novo card abaixo dos cards de crédito solar (Wallace/Wellida), alimentado por `window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2` (sem fetch novo). RPC `consultar_solar_compartilhado` ampliada com `consumoReferencia`. **Bug real achado pelo usuário ao vivo** ("cadê? não apareceu"): a query só selecionava `casa/consumo_diario_kwh/fonte`, nunca `consumo_mensal_kwh` — o card checava esse campo pra decidir se tinha dado, sempre `null`, sempre caía no fallback "sem fatura". Corrigido (select ampliado), confirmado ao vivo depois.

### 0.5 Gráficos novos "Crédito × medidor Tuya" (mês a mês, 1 por pessoa)

Pedido do usuário, 3 rodadas de refinamento (1ª tentativa errada foi mexer nos cards existentes; o pedido real era gráficos NOVOS comparando crédito gerado × leitura do medidor Tuya, não a fatura Energisa). 2 gráficos por painel (Wallace/Wellida), mesmo estilo do gráfico 05, 12 meses. **Bug real achado pelo usuário com print**: consumo agregado por mês CALENDÁRIO, crédito indexado por mês em que o CICLO FECHA (corte dia 8) — os 2 eixos não batiam. Corrigido pra usar a mesma função de fechamento de ciclo já usada pelo crédito.

### 0.6 Ajustes finais da sessão

- Gráfico 04 (Geração por dia, painel privado) ganhou valores sobre as barras, igualando o compartilhado.
- **Bug real no compartilhado**: os gráficos "Crédito × medidor Tuya" só liam `ciclosFechados` — o mês do ciclo ainda aberto (Set/26) nunca tinha barra de crédito. Corrigido pra usar `fluxo2.wallace/wellida.creditoAtual` (mesma fórmula do card "Consumo real × crédito"), verificado batendo com o painel privado (151/62 kWh).
- Robô passou a também alimentar `parametros_gerais.ENERGISA_TARIFA_COMPOSICAO` (3 casas) e `ENERGIA_FATURAS_REAIS` (Wallace) a cada fatura Energisa nova — fecha o último trecho manual do gráfico 06 "Economia antes × depois" e do card "Quanto você ainda vai pagar". JS trocado de chave fixa (`fatura_ago26_valor`) pra busca automática da fatura mais recente disponível — nenhuma edição de código necessária nos próximos meses.

### 0.7 O que ainda falta pra fechar de vez

`ENERGIA_FATURAS_REAIS` continua `{}` — nenhuma fatura Energisa do próprio Wallace foi processada ainda (a dele deste ciclo não foi emitida). Quando chegar, mandar o PDF real pra confirmar UC + valor, e só então essa parte fica 100% validada (ver seção Pendências).

## 4. Bloco 26 (18/08/2026) — medidor da Wellida em produção de verdade (2 bugs reais corrigidos ao vivo) + reordenação de cards

### 1.1 Saga do erro Tuya `913` — 2 causas reais, ambas resolvidas

Usuário disparou o workflow `atualizar_medidor_tuya_wellida.yml` pela primeira vez e caiu num erro genérico da Tuya Cloud: `913 - No permission. The data center is suspended`. Investigação em 2 etapas, ambas confirmadas por evidência real antes de declarar resolvido:

1. **Região errada**: o secret `TUYA_API_REGION_WELLIDA` estava como `us-e` (copiado do padrão do Wallace), mas o painel Tuya mostrava o device sob "Western America Data Center" — que mapeia pro código `us` puro na API, não `us-e` (sub-região diferente, "America Leste"). Usuário trocou o secret pra `us` — resolveu a conexão, o robô passou a ler a leitura real do device (`energia_total_kwh: 0.0`, esperado pra medidor recém-instalado).
2. **Bug real meu, achado na hora**: com a conexão funcionando, apareceu um NOVO erro — `HTTP 409 duplicate key value violates unique constraint "medidor_tuya_consumo_diario_pkey"`. Causa: na migração de generalização multi-casa (bloco 24), dropei a constraint UNIQUE errada (`medidor_tuya_consumo_diario_data_key`) mas a PRIMARY KEY real da tabela (`medidor_tuya_consumo_diario_pkey`, só em `data`, sem `casa`) continuou intacta — bloqueava qualquer 2ª casa gravar numa data que o Wallace já tivesse usado. Corrigido: `DROP CONSTRAINT medidor_tuya_consumo_diario_pkey` (a `UNIQUE(data,casa)` já existente é suficiente pro `ON CONFLICT` do trigger). Confirmado que a transação inteira tinha revertido no erro anterior (nenhum dado órfão pra limpar).

**Resultado confirmado em produção**: `medidor_tuya_leituras` e `medidor_tuya_consumo_diario` já têm linha real com `casa='wellida'`, gravada com sucesso, heartbeat registrado como `medidor_tuya_wellida = sucesso`.

### 1.2 Reordenação dos cards do medidor (pedido do usuário)

Ordem antiga: telemetria Wallace → telemetria Wellida → comparação Wallace → comparação Wellida (agrupado por TIPO de card). Ordem nova, pedida explicitamente: telemetria Wallace → comparação Wallace → telemetria Wellida → comparação Wellida (agrupado por PESSOA). Aplicado nos 2 lugares (`Sistema_Wallace_Lira_Completo.html` e `solar-compartilhado.html`) — só reordenação de HTML, nenhuma lógica mudou.

### 1.3 Pendências reais restantes pro medidor da Wellida

- **Cron dedicado no cron-job.org**: ainda não criado — passei a URL/method/headers/body pro usuário (mesma API do GitHub `workflow_dispatch`, reaproveitando o token já configurado nas outras tarefas). `.github/workflows/atualizar_medidor_tuya_wellida.yml`.
- **`medidor_tuya_wellida` ainda não está em `SAUDE_JOBS_LIMIARES`** (`hydrate-saude-operacional.js`) — de propósito, só adicionar depois do cron confirmado rodando sozinho por um tempo (evita alarme falso "nunca rodou").
- **Medidor da Wellida ficou fisicamente offline** (app Smart Life mostrou "Device Connection Failure") logo depois do 1º sucesso — orientado troubleshooting padrão (WiFi/roteador/disjuntor, mesmo problema já visto no medidor do Wallace). O contador de energia é gravado no hardware do próprio medidor (não se perde offline) — só a granularidade por-leitura fica comprometida no período sem conexão, o total nunca é perdido.
- **Modelo do medidor da Wellida é bidirecional** (`forward_energy_total`/`reverse_energy_total`, DP diferente do CT simples do Wallace) — só energia total é gravada de verdade; potência/tensão/corrente/estado sempre ficam `—` pra ela, não é falha, é limitação real do aparelho (documentado em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`).

## 5. Bloco 25 (18/08/2026) — medidor da Wellida: modelo identificado, robô adaptado, card replicado, extensão de link

Usuário mandou prints ao vivo do painel Tuya (device já linkado, `ebf0d04e88180e1474o2is`) — schema de DPs confirmado DIFERENTE do EKAZA CT do Wallace (só `forward_energy_total`/`reverse_energy_total`, sem tensão/corrente/potência/estado). `scripts/sync/atualizar_medidor_tuya.py` ganhou suporte a múltiplos modelos via `TUYA_MODELO` (`ekaza_ct` default Wallace, `bidirecional_ab` novo pra Wellida). Card "Consumo real × crédito" replicado pro painel privado e compartilhado (função `aplicarConsumoRealVsCreditoPorCasa()` generalizada, RPC ganhou `medidorTuyaWellidaConsumoDiario`/`medidorTuyaWellidaUltima`). Nova opção de estender validade de link de compartilhamento já existente (RPC `estender_compartilhamento_solar`, botão "+dias").

## 6. Bloco 24 (18/08/2026) — achado #4 resolvido de verdade + código morto eliminado + medidor Tuya preparado (infra inicial)

**Achado #4** (trava de descompasso do card solar público): coluna `geracao_acumulada_atualizado_em` criada em `energia_solar_leituras`, robô `atualizar_geracao_saj.py` grava o timestamp real, RPC/painel privado/compartilhado atualizados — a trava (10 dias de descompasso) agora funciona de verdade nos 2 lados (antes nenhum dos 2 disparava, o campo era sempre `null`).

**Código morto eliminado** (8 de 9 achados da auditoria, autorizado pelo usuário: "pode eliminar"): `aplicarBoletosVencidosAutomaticamente()`, `VARS.necessidadeHeld`, `VARS.consorcioAutoQuitacaoValor`, `VARS.mastercardBlackCongelado`, cluster `renderCapaNav()`/`irParaCapaDestino()`/`CAPA_DESTINOS`/`NOMES_PANE`/`renderPageStrip()` removidos. `.chart-box.small` completado com CSS real em vez de removido. Mantidos de propósito: `VARS.solarConsumoMaeRecente` (dado real de fatura) e `CycleEngine.js` (serviço testado, arquitetura planejada).

**Infra multi-casa do medidor Tuya** criada (banco, robô, workflow, card) — nessa época ainda hipotética ("quando o Device ID existir"), depois confirmada real no mesmo dia (bloco 25).

## 7. Bloco 23 (18/08/2026) — auditoria noturna autônoma (7 agentes + verificação adversarial, carta branca do usuário)

Usuário: "coloque 10 agente trabalhando... não pare, eu vou dormir... carta branca para agir". Workflow de 7 agentes finders (financeiro, V1×V2, sintaxe JS, paridade solar, código morto, UI/CSS, segurança) + verificação adversarial (1 skeptic por achado). **16 achados, 16 confirmados, 0 descartados.**

**Limite respeitado mesmo com carta branca**: nenhuma escrita em tabela financeira, nenhum push sem avisar antes (regra permanente do `CLAUDE.md`). Corrigidos na hora: legenda Saúde Família dessincronizada, `CLAUDE.md` desatualizado (regra do `wallace_dados` obsoleta desde 12/08), comentários V1×V2 obsoletos, cor de gráfico divergente, 1 grant de segurança desnecessário revogado. O resto ficou reportado pro usuário decidir (resolvido nos blocos 24-26 acima).

## 8. Bloco 22 (18/08/2026) — recálculo de aportes + padronização de cards

- **Caixa Saúde Família**: R$177,50 → **R$210,83/mês** (composição completa: 2x pediatra + 2x dentista Júlio + 1x ginecologista Vanessa + 2x endócrino Wallace).
- **Emagrecimento**: R$278,89 → **R$490,00/mês** (caneta subiu de preço; usuário tem 3 canetas em estoque, não compra nova nos próximos 1-2 ciclos, mas aporte continua).
- **Bens Duráveis/Boletos/Fundo de Suavização**: pedido recálculo, CONFIRMADOS já corretos (zero mudança de código).
- **Cards "Todas as Caixas"**: altura padronizada via `.caixas-grid`/`min-height:168px` (não testado ao vivo, exige login).
- **3 LREI ativos** (R$266,23+R$103,55+R$1.950,77): confirmado real via SQL, não é bug.

## 9. Bloco 21 e anteriores

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
27. **Medidor Tuya multi-casa: a PRIMARY KEY de `medidor_tuya_consumo_diario` é `(data, casa)`** (não mais só `data`, corrigido bloco 26). Se criar uma 3ª casa nova, não precisa mexer nisso de novo — já está certo.
28. **Região da API Tuya não é igual ao rótulo do painel.** "Western America Data Center" no painel = código `us` na API (não `us-e`). Confirmar sempre com um teste real antes de assumir, o rótulo visual da Tuya é impreciso.
29. **NOVO bloco 27 — não existe API de DDA acessível a pessoa física** (confirmado: Pluggy, Open Finance oficial, CIP, Celcoin, BTG Empresas, TecnoSpeed, QI Tech, Kobana — todos exigem CNPJ/credenciamento institucional). Alternativa real e já implementada: parsing de e-mail via Gmail API (ver `docs/decisions/AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md`).
30. **NOVO bloco 27 — identificar de quem é uma fatura Energisa usa o Número da UC, nunca o CPF do campo PAGADOR.** O Wallace é pagador/titular também da conta da própria mãe (arranjo familiar) — CPF do pagador só prova "ele paga essa conta", não "é a conta dele". Cada UC corresponde a exatamente 1 imóvel, nunca compartilhada.
31. **NOVO bloco 27 — nem toda fatura Energisa tem linha digitável Febraban** (só quando ainda tem ficha de compensação; fatura já paga/2ª via simplificada não tem). Ordem de fallback pro valor: `vencimento+R$` → `TOTAL:` → linha digitável. Medintech (Água/Gás) continua só com linha digitável, que é 100% confiável pra ela.
32. **NOVO bloco 27 — `consumo_diario_kwh` em `energia_solar_consumo_referencia` é coluna GERADA no Postgres**, nunca escrever nela direto (só `consumo_mensal_kwh`/`dias_base`/`fonte`).
33. **NOVO bloco 27 — crédito solar é indexado pelo mês em que o CICLO FECHA (corte dia 8), consumo por mês calendário são coisas diferentes.** Qualquer gráfico/comparação novo que cruze os dois precisa usar a mesma função de fechamento de ciclo (`mesFechamentoCiclo`/`mesFechamentoCicloRateio`) dos dois lados, senão os eixos não batem.
34. **NOVO bloco 28 — "as 10 caixas do achado P0 leem V1, não V2" é FALSO.** Antes de assumir que um card lê V1/`wallace_dados`, ler o código real — quase todas as caixas relevantes já foram promovidas pra V2 (ver mapa de fontes por caixa no bloco 28). O gap real é mais sutil: `afeta_saldo_real=false` + `cartao_id` nulo cai fora de qualquer filtro (view de saldo E cálculo de comprometido), e o seletor de ciclo não re-buscava V2 (corrigido).
35. **NOVO bloco 28 — `FinanceService.js`/`PatrimonioService.js`/etc. NÃO EXISTEM em `main`** (deletados 14/08/2026, commit `2b20137`, código morto sem consumidor). Não citar/planejar em cima deles como "já prontos, só falta conectar" — só sobrevivem num worktree órfão nunca mergeado. O mecanismo real é `WallaceFinanceService` inline em `app.js` + `promocoes-financeengine.js`.
36. **NOVO bloco 28 — `MATRIZ_MIGRACAO_FASE2.md` NÃO EXISTE** no repositório (nem no histórico do git). Se aparecer citado em algum relatório/prompt, tratar como referência não confiável.
37. **NOVO bloco 28 — transação com `afeta_saldo_real=false` E `cartao_id=null` não é necessariamente bug.** Confirmado com o usuário: "Crédito KMV" (Posto Ipiranga) é um crédito pré-pago com controle próprio na tabela `beneficios_creditos`/card "Créditos e Cupons" — pago com crédito, não gera dívida, corretamente fora do saldo real e do comprometido no cartão. Antes de tratar esse padrão como bug em outra caixa, checar primeiro se existe um crédito pré-pago próprio (`beneficios_creditos`) cobrindo aquele gasto.
38. **NOVO bloco 29 — coluna Origem (final do cartão ou PIX) existe em praticamente todos os Livros Razão agora.** Se algum LR novo for criado, seguir o mesmo padrão: dinâmica via `cartao_id` real quando a fonte é `transacoes` linha a linha (ver `onda3LinhaTransacao()`), fixa quando a fonte é agregado/schedule sem `cartao_id` por linha (LRS/LRR/LRP/LRMP/LRB/LRDOA).
39. **NOVO bloco 29 — `renderLivrosVariaveis()` NUNCA deve ser rechamada inteira só pra redesenhar 1 tabela específica.** Ela redesenha por padrão as 9 caixas de `CAIXAS_LR_SIMPLES` + PV + BD, que hoje são donas de `hydrate-onda3-livro-razao.js`/`aplicarOnda3LivroRazao()` (V2) — rechamar a função inteira depois que a V2 já rodou (`window.__wallaceOnda3LivroRazaoAplicado === true`) é bloqueado por guarda, mas se criar um módulo novo que precisa redesenhar só LREI/LRW/LRV/LRC-limbo, escrever uma função dedicada pra essa tabela específica (mesmo padrão de `onda8LrbRenderTabela()`), nunca chamar `renderLivrosVariaveis()` de novo pra isso.
40. **NOVO bloco 29 — LRCON removido de vez** (consórcios migraram pra Boletos, `cronograma_consorcios` permanentemente `ativo=false`). Não recriar sem pedido explícito novo.
41. **NOVO bloco 29 — Não Reconciliado do Mastercard Black CONTINUA sem fechar com a fatura real.** Não é mais tratado como resolvido nem descartado — é a pendência prioritária pro próximo agente, ver seção 1 (Pendência PRIORITÁRIA) no topo deste arquivo. A ideia do usuário pra resolver é somar por `cartao_id` real (Origem, já implementada) em vez de por caixa-agregada.
42. **RESOLVIDO bloco 28 — TODAS as 17 fases de `promocoes-financeengine.js` (FASE 2F até FASE 2V) têm `aprovado = true` fixo agora**, por decisão explícita e repetida do usuário ("só V2 existe, nada paralelo") — não bloqueiam mais por divergência V1×V2, nunca. `WallaceComparator.compararLote()` continua rodando em todas, só que 100% como diagnóstico (`console.table`/`console.warn`), nunca mais decide o que é exibido. **Trade-off assumido conscientemente**: 3 dessas fases (2F, 2G item1/2) tinham staleness real (V1 congelado vs V2 vivo) — correção genuína. As outras 14 eram gate de REGRESSÃO DE FÓRMULA (V1×V2 usam as mesmas variáveis, sem fetch novo) — removê-las também significa que um bug de cálculo futuro no FinanceEngine não seria mais barrado automaticamente, só apareceria direto na tela (já aconteceu 1 vez, Solar/teto de disponibilidade, antes desta sessão). Se reabrir esse arquivo e desconfiar de algum número, `console.table` de cada fase ainda mostra a comparação V1×V2 — checar ali antes de mexer em código.
43. **NOVO bloco 30 — LRCC (Créditos e Cupons) é aba de EXIBIÇÃO, não caixa de verdade** (decisão explícita do usuário: "Só aba de exibição"). Filtra por padrão de descrição (`onda3EhCreditoPrePago()`, regex `- Crédito <nome>`), nunca muda `caixa_id`. Não entra em Balanço/Patrimônio. Se aparecer um crédito pré-pago de tipo novo (além de KMV), confirmar que a descrição segue o padrão "- Crédito X" — se não seguir, o filtro não pega automaticamente.
44. **NOVO bloco 30 — toda aba de Livro Razão nova precisa ser registrada manualmente em `atualizarContadoresAbasLR()`** (`src/dashboard/widgets/atualizar-contadores-abas-lr.js`, arrays `paineis`/`labels`) — não há auto-descoberta. Bug já se repetiu 4x (LRBD, LREM, e agora quase LRCC) — checar esse arquivo sempre que criar uma aba de LR nova, antes do usuário reportar "o botão não mostra quantidade".

## Pendências abertas

0. **PRIORITÁRIA — Não Reconciliado do Mastercard Black ainda não fecha com a fatura real.** Ver seção 1 (Pendência PRIORITÁRIA) no topo deste arquivo pro detalhe completo e a ideia do usuário de como resolver (somar por `cartao_id`/Origem real, não por caixa-agregada). Usuário vai continuar isso com outro agente.
0b. **RESOLVIDO bloco 30 — correção da race condition (Combustível "não muda") CONFIRMADA ao vivo pelo usuário** (print real, login real). Não reabrir sem sintoma novo.
0c. **NOVO bloco 30 — LRCC (Créditos e Cupons) commitado mas NÃO validado em navegador real com login** nesta sessão. Confirmar visualmente: aba "LRCC - Créditos e Cupons (N)" mostra as 2 linhas de Crédito KMV, e a Caixa Combustível não mostra mais essas 2 linhas (nem no rodapé).
1. **DDSU666 (SAJ)**: aguardando hardware chegar (~25/08/2026) pra fiação/reconfiguração/teste real.
2. **R$340,00 do ciclo Wärtsilä 2026-07** ainda não confirmados como recebidos (não confundir com TEDs já lançadas).
3. **LREI0003/0004/0005 ativas** (R$266,23+R$103,55+R$1.950,77) — usuário optou por deixar como está, tendem a normalizar.
4. **Lint dos ~91 módulos `hydrate-*`** — adiado por decisão consciente do usuário, não reabrir sem pedido novo.
5. **Projeto WhatsApp/Telegram** — cancelado 17/08, não retomar sem confirmação explícita dos 2 motivos originais (custo API + hospedagem 24/7).
6. **Necessidade Total Bruta/Líquida** — recálculo automático pendente do próximo login (regra 16).
7. **Medidor da Wellida**: cron dedicado no cron-job.org ainda não criado (usuário tem a URL/config); `medidor_tuya_wellida` ainda não monitorado em Saúde Operacional (esperar cron rodar sozinho primeiro). **Usuário já comprou um medidor substituto IDÊNTICO ao do apartamento (mesmo modelo EKAZA CT), chega domingo (23/08/2026)** — quando trocar, o workflow dela deve voltar pro `TUYA_MODELO=ekaza_ct` (padrão, igual ao Wallace) em vez do `bidirecional_ab` atual, e o `TUYA_DEVICE_ID_WELLIDA`/região precisam ser atualizados pro novo aparelho. Até lá, seguir usando os dados do medidor bidirecional atual.
8. **2 achados da auditoria noturna sem decisão tomada** (não são bugs, são escolhas de produto/segurança): (a) vale a pena implementar rastreamento real de `geracaoAcumuladaData` retroativo, ou deixar só daqui pra frente (já resolvido pra frente, bloco 24)? (b) `registrar_erro_cliente()` sem checagem de role — intencional (log pré-login) ou deveria restringir?
9. **NOVO bloco 27 — automação de Energia (TXB000009) ainda não validada de ponta a ponta pro Wallace**: UC dele (`1.994.775.053-05`) é Nível C (informada, nunca testada contra PDF real — a fatura do ciclo atual dele não foi emitida). `cronograma_boletos_fixos.TXB000009` continua no valor antigo (R$367,36). Quando a fatura dele chegar, mandar o PDF real pra confirmar UC+valor antes de considerar fechado.
10. **NOVO bloco 27 — `ENERGIA_FATURAS_REAIS` continua `{}`** (nenhuma fatura Energisa do Wallace processada ainda) — gráfico 06 continua mostrando fonte='calculado' até a 1ª fatura real dele ser processada pelo robô; deve virar 'fatura real' sozinho, sem código novo.
11. **NOVO bloco 27 — remetente exato do envio automático mensal da Energisa ainda não confirmado** (serviço ativado nesta sessão, ainda não chegou nenhuma fatura automática, só 2ª via manual). Busca hoje é por domínio inteiro (`from:@energisa.com.br has:attachment`), compensada pela validação por UC. Revisitar quando a 1ª fatura automática real chegar.
12. **NOVO bloco 27 — pendências de setup do robô Gmail** (ação do usuário, fora do alcance do agente): criar tarefa dedicada no cron-job.org pro workflow `atualizar_boletos_medintech.yml`; depois de confirmar rodando sozinho, adicionar `boletos_medintech` em `SAUDE_JOBS_LIMIARES`.
13. **NOVO bloco 28 — auditar as outras 9 caixas do achado P0** pelo mesmo padrão confirmado em Combustível (`afeta_saldo_real=false` + `cartao_id` nulo) — só Combustível foi confirmado por SQL nesta sessão, as demais (Bens Duráveis, Lance, Churrasco, Mercado Pago, PIX Geral Vanessa, PIX Vanessa, Emagrecimento, Mastercard_Infinite) podem ter o mesmo problema, não verificado ainda.

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
10. **Se mexer em fatura Energisa/UC/robô de faturas**: ler `docs/decisions/AUTOMACAO_FATURAS_MEDINTECH_GMAIL.md` primeiro — tem as 3 lições reais do bloco 27 (UC não CPF pagador, fallback de linha digitável, coluna gerada no Postgres).
11. **Fatura do Wallace (Energisa) ainda não emitida** — quando chegar, é a peça que falta pra fechar as pendências 9/10 acima.
