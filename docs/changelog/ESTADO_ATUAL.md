# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 14/08/2026, sessão longa (continuação direta do bloco 6 anterior — WWI recém-criado, agendamento recém-testado). Esta sessão: saga completa de fidelidade visual do relatório WWI (várias reescritas até bater com o artefato aprovado), 1 bug real de saldo em produção achado e corrigido (PIX Geral Vanessa, R$1,32 de rendimento não capturado), triagem em massa da Inbox Financeira (mais de 470 itens processados), e uma decisão de arquitetura importante generalizando o conceito "Comprometido × Disponível Real" pra 6 caixas temáticas — que revelou e corrigiu **9 transações reais mal classificadas** no banco (6 compras de cartão contando contra o saldo real quando não deveriam + 3 calibrações duplicadas).

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **Nunca deixar o Google Drive sincronizar a pasta `.git/`** — resolvido de vez em 14/08 (manhã), não reabrir sem evidência nova.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — contenção de thread já investigada a fundo, não reabrir sem medir de novo.
8. **NOVO 14/08/2026 — compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (ver seção 1.3.5 do `MANUAL_OPERACIONAL_AGENTES.md`). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre, em qualquer caixa — regra generalizada, antes só valia formalmente pra Caixa Variável. Quando lançar/corrigir transação de cartão em qualquer caixa, checar isso.

## 1. Pendências abertas AGORA (retomar por aqui)

### 1.1 Procedimento de pagamento de fatura do cartão — decisão de negócio ainda não tomada
Com a regra nova (compra de cartão nunca reduz saldo real, ver regra 8 acima), falta decidir **como registrar quando a fatura é paga de verdade** (dinheiro sai do banco), sem contar a saída duas vezes. Dois caminhos possíveis, nenhum implementado: (a) `UPDATE` na mesma transação, virando `afeta_saldo_real=true` na data do pagamento; ou (b) uma segunda transação real de pagamento, com a original marcada de forma que a reconciliação não some as duas. Precisa de decisão do usuário antes da próxima virada de fatura (dia 25). Ver `docs/decisions/GENERALIZACAO_COMPROMETIDO_CAIXAS_TEMATICAS.md`.

### 1.2 Inbox Financeira — 563 itens continuam pendentes, precisam de revisão manual
Processados nesta sessão: 111 de 479 `mercadopago_eventos` rejeitados (duplicata confirmada contra a cascata Wärtsilä já processada); 254+107 de 556 `pluggy_transacoes` rejeitados (mecânica do cofrinho + duplicata com descrição correlata). **Restam pendentes, não processados por falta de sinal seguro**: 368 `mercadopago_eventos` (descrição em branco, metadata mínimo — não dá pra classificar sem arriscar erro) e 195 `pluggy_transacoes` (107 só bateram por valor sem descrição correspondente — risco real de falso positivo, achado 1 caso assim — + 88 sem nenhum match). Não processar esses sem revisão adicional (ex: olhar `metadata`/comprovante individual) ou critério novo do usuário.

### 1.3 R$340,00 do ciclo Wärtsilä 2026-07 ainda não chegaram
Sem mudança nesta sessão — ainda não confirmado como recebido.

### 1.4 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente (não conferido nesta sessão).

### 1.5 Previsão de geração baseada em irradiância solar — sugerido, não implementado
Sem mudança — usuário ainda não decidiu se quer essa feature.

## 2. O que foi feito nesta sessão (14/08/2026, bloco 7 — continuação direta do bloco 6, WWI)

### 2.1 WWI — saga de fidelidade visual do PDF (várias reescritas até aprovar)
O relatório de fechamento em PDF (WWI, criado no bloco 6) foi rejeitado várias vezes seguidas pelo usuário até bater com o artefato "Tactical Wealth Report" que ele tinha aprovado antes numa conversa separada. Sequência real de tentativas e achados, em ordem:

1. **jsPDF desenhado à mão (primitivas rect/text)** — reprovado, "horríveis". Abandonado — tipografia/espaçamento de um PDF desenhado à mão nunca fica igual a HTML/CSS real, por mais que a paleta bata.
2. **html2canvas reconstruindo o CSS do artefato de memória** — ainda reprovado ("não é nem 40%"). Causa: eu estava reconstruindo classes/CSS de cabeça, com erros reais (fonte serifada/sans-serif invertida, cor da capa aproximada, badge de classificação faltando).
3. **Baixado o código-fonte REAL do artefato** (navegando até o link aprovado, extraindo o HTML/CSS literal do frame do Claude via `curl`, não reconstruído de memória) — CSS reescrito verbatim a partir daí. Resolveu a fidelidade de tipografia/cor.
4. **3 bugs de renderização achados testando o PDF real**: linha horizontal cruzando um título (pseudo-elemento `::after`+flex, mal suportado pelo html2canvas — trocado por elemento real); "%" faltando num KPI (extrator do coletor não pegava sufixo fora do `.v`); qualidade de fonte ruim (container em `left:-9999px`, scale baixo, JPEG com perda — trocados por `position:fixed`, scale 3, PNG).
5. **Estrutura de seções errada** — usuário: "tem muito mais abas, porém sem o detalhamento que o que aceitei possui". O gerador tinha 20 seções genéricas (dado cru despejado); o artefato tem 11 curadas. Reescrito pra bater exatamente: 01 CFO / 02 Painel / 03 Patrimônio / 04 Passivos / 05 Centros de Custo / 06 Projetos / 07 Liquidez / 08 Wärtsilä / 09 Aceleração / 10 Score / 11 Parecer.
6. **Mudança de arquitetura: abandonado html2canvas+jsPDF por completo** — usuário perguntou direto "por que não gera um HTML idêntico ao do link?". Resposta: o botão agora abre a página HTML real numa aba nova (`window.open`+`document.write`), sem nenhuma conversão/rasterização — um botão flutuante dentro da aba nova ("Salvar como PDF") deixa a impressão a cargo de um clique manual do usuário. Isso também resolveu, de quebra, um bug real: a versão anterior chamava `window.print()` automaticamente, que é **bloqueante** em vários navegadores — travava a aba principal do painel inteiro, não só a aba do relatório (usuário: "os dados voltaram a demorar carregar").
7. **Qualidade "premium" dos KPIs** — usuário: "sem vida, sem beleza, feio". Faltavam a legenda explicativa (`.kpi-sub`) e o selo semafórico (`.chip`) em cada card — só tinha rótulo+valor. Adicionados os 2, com cor do selo derivada dos sub-scores já calculados (nunca uma classificação nova inventada). Também corrigido: os 8 KPIs do Painel Executivo não eram os mesmos 8 do artefato (3 eram aproximações minhas) — trocados pelos exatos, incluindo "Liquidez Imediata" (soma de Reserva + Caixa Lance + Caixa Variável, calculada porque nenhuma seção coletada tem esse total pronto).
8. **Texto do CFO duplicado + números com ponto americano** — usuário mandou o texto lado a lado com o aprovado. Achados: o parágrafo de abertura já resumia pontos fortes/fracos condensados, e os parágrafos seguintes repetiam os MESMOS pontos por extenso (novo campo `resumoAberturaTexto`, mais enxuto, resolve); percentuais saíam "95.4%" em vez de "95,4%" (número puro do JS interpolado direto em template string usa formato americano — novo `_wwiFmtNum()`); "Wärtsilä" saindo minúsculo no meio de frase (`.toLowerCase()` aplicado na frase inteira, corrigido pra só a 1ª letra).
9. **Favicon** — pedido explícito do usuário. 1ª tentativa (monograma "W" dourado inventado) tinha um bug de aspas duplas cortando o atributo `href` no meio (SVG usava aspas duplas dentro de um atributo já delimitado por aspas duplas) — corrigido, mas o usuário então pediu pra usar o favicon PADRÃO do site em vez de um ícone novo — trocado pra `assets/images/favicon.svg` via URL absoluta.

**Estado final**: relatório com 11 seções idênticas ao artefato aprovado, CSS verbatim, 8 KPIs exatos com legenda+selo, texto sem duplicação e com formatação BR correta, favicon consistente com o resto do site, sem `window.print()` automático (usuário decide quando imprimir). Aguardando teste final do usuário confirmando aprovação completa.

### 2.2 PIX Geral Vanessa (CC-103) — R$1,32 de diferença real, achado e corrigido
Usuário reportou saldo do card (R$281,73) desincronizado do saldo real do app (R$283,05). Reconciliação transação por transação (17 no sistema vs. extrato real completo do usuário) confirmou: sistema matematicamente correto pro que conhecia, diferença real de R$1,32 é rendimento/juros do cofrinho nunca capturado — mesmo padrão já usado em outras 11 caixas no mesmo lote de "Ajuste de calibração" de 13/08, só que PGV tinha ficado de fora daquele lote. Lançado `TX000321` (R$1,32, mesmo padrão exato das outras 11). Saldo fechou em R$283,05, batendo com o real.

### 2.3 Inbox Financeira — triagem em massa (regra 6 do manual, gestão autônoma)
Achado: 479 `mercadopago_eventos` + 556 `pluggy_transacoes` pendentes, muito acima do normal — a maioria com anos de atraso. Processado com cautela (nunca bulk-update sem checar risco de falso positivo):
- **`mercadopago_eventos`**: 111 rejeitados (valor+data batendo exatamente com transações já lançadas da cascata Wärtsilä processada em 13/08). 368 continuam pendentes — descrição em branco, sem sinal suficiente pra classificar.
- **`pluggy_transacoes`**: 254 rejeitados (mecânica interna do cofrinho — "Dinheiro reservado/retirado", "Aplicação/Resgate COFRINHOS", autotransferência mesma pessoa — já documentado como regra no manual). 107 rejeitados por duplicata confirmada (valor + descrição correlata com transação já existente — exigido correlação de texto, não só valor, depois de achar 1 falso-positivo real de coincidência de valor: "RegistroBR" R$40 batendo com "Sabão Júlio" R$40, coisas diferentes). 195 continuam pendentes.
- Ver pendência 1.2.

### 2.4 Generalização de "Comprometido × Disponível Real" pras caixas temáticas — pergunta de arquitetura do Claude Chat, decisão do usuário, 9 transações corrigidas
Claude Chat trouxe uma pergunta de arquitetura (achado real dele: compra de R$104,30 no cartão MB virtual, lançada na Caixa Bens Duráveis, sem nenhum efeito visual no saldo do card). Investigado e respondido: o conceito só existia implementado pra Caixa Variável — não por decisão documentada, só porque nunca tinha sido generalizado. Usuário decidiu: generalizar pras 6 caixas temáticas que compram no cartão (Churrasco, Bens Duráveis, Manutenção, Eventos e Viagens, Saúde Família, Emagrecimento).

**Implementado**: `WallaceFinanceService.getComprometidoPorCaixaV2(caixaId)` (generalização parametrizada da fórmula já usada pra Variável) + novo módulo `hydrate-comprometido-caixas-tematicas-v2.js`, injetando bloco "(−) Comprometido no cartão / (=) Disponível Real" no card de cada uma das 6 caixas, só quando há valor comprometido > 0 no ciclo.

**Corrigido no dado histórico, depois de auditoria** (usuário generalizou o princípio: "as caixas são apenas referências... o saldo da caixa não deve ser subtraído das compras, a caixa é o pulmão pra pagar a fatura, isso é o mesmo da Caixa Variável"): achadas **6 transações com `cartao_id` preenchido mas `afeta_saldo_real=true`** (deveria ser sempre `false`) — TX000227/TX000226/TX000159-A/TX000159-B (Bens Duráveis), TX000228 (Churrasco), TX000277 (Emagrecimento). Corrigidas. Isso quase dobrou os 3 saldos — usuário percebeu na hora ("o valor não pode dobrar") e apontou a causa: **3 lançamentos de "calibração"/"saldo físico confirmado" duplicavam dinheiro já contabilizado em outro aporte**, criados numa época em que a compra de cartão ainda contava contra o saldo (a calibração "recompunha" o que a compra tinha subtraído — virou duplicata depois da correção acima). Removidas TX000316/TX000309/TX000300. Saldos finais: Bens Duráveis R$583,99, Churrasco R$358,87, Emagrecimento R$278,89 — nenhum dobrou.

**Regra nova documentada** na seção 1.3.5 do `MANUAL_OPERACIONAL_AGENTES.md` (propagada pra qualquer Claude): compra com `cartao_id` preenchido nunca reduz saldo real, em nenhuma caixa. Quando a caixa não tem saldo suficiente pro comprometido, não há regra fixa (LREI vs. ficar negativo aguardando recurso) — decisão do usuário caso a caso, nunca decidir sozinho. Detalhe completo em `docs/decisions/GENERALIZACAO_COMPROMETIDO_CAIXAS_TEMATICAS.md`.

## 3. Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa — nesta sessão, mais de uma vez o usuário testou uma versão desatualizada porque a Action de auto-bump ainda não tinha rodado; sempre considerar esse atraso antes de assumir que "não funcionou".
4. Retomar pela seção 1 — as pendências mais concretas são a Inbox Financeira (1.2, 563 itens) e a decisão de procedimento de pagamento de fatura (1.1).
5. **Sempre que "atualizar passagem de turno" for pedido**: checklist completa da seção 10 do `docs/MANUAL_OPERACIONAL_AGENTES.md`. Nesta sessão, **atualizar SIM os documentos do Google Drive** — a regra nova da seção 1.3.5 (compra de cartão nunca reduz saldo real) é regra de negócio nova que o Claude Chat precisa conhecer, e foi literalmente uma pergunta trazida por ele que motivou a mudança.
