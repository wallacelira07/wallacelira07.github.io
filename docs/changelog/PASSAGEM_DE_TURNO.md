PASSAGEM DE TURNO — Sistema Wallace Lira

Sessão: 06-07/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site` (diretiva permanente: sem zip, sem cópias paralelas, sem versões alternativas — alterar sempre os arquivos reais do projeto).

## Bloco 20 — Mastercard/Visa fechado + Solar entra na V2 (modelo de ciclos de crédito) (08/08/2026, mesma sessão, continuação do Bloco 19)

**1. Mastercard Black/Visa — inventário final e fechamento formal**: levantei consumidores exatos de `cartaoMBTotal`/`cartaoInfiniteTotal`/`visaDetalhe`/`mbDetalhe`/`CARTAO_MAPA`. Achado principal: o lado Visa (LRW/LRR/LRS/LRV) está inteiramente ZERADO — usuário já confirmou em sessões anteriores (25-30/07) migração completa pro Mastercard Black, nada a fazer aí. O que resta (Assinaturas MB, Recorrências/Corp, Consórcios) está 100% bloqueado por falta de `cartao_id`/`categoria_id` em `transacoes` (32 transações), não por engenharia. Usuário decretou o domínio "fechado até onde é tecnicamente possível sem inventar dados" — registrado em `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md`, junto com as outras 4 exceções permanentes já conhecidas (headline totals, Solar 301×361, Caixa Lance, 4 caixas indeterminadas, TX000203-208). **Achado colateral, não corrigido** (fora do escopo, Parcelamentos está fechado): `VARS.livroLRP` nunca é recalculado depois que `aplicarOnda5Parcelamentos()` sobrescreve `PARCELAMENTOS_VISA` com dado V2 — fica com o valor de boot.

**2. Inventário completo de `wallace_dados` por consumidor real** (não mais por domínio): das 95 chaves, ~29 já removidas, ~10 exceções formais, ~56 restantes — dessas, só 1 (`SOLAR_LEITURAS`) era de baixo esforço/alto impacto disponível. Todo o resto exige decisão de dado nunca tomada ou investigação nova do zero (Ciclo Snapshots, Operacional ~25 chaves heterogêneas, Pluggy/MP brutos).

**3. Solar entra na V2 — modelo de ciclos de crédito, decisão de negócio + implementação completa**: usuário validou com evidência de código (não opinião) que o comportamento atual (acumulado desde ativação, nunca reseta) é ausência de implementação, não regra de negócio deliberada — só existia 1 leitura quando o domínio foi construído (31/07), nunca foi revisitado. Aprovou modelagem de ciclos reais (fechamento explícito, nunca por inferência de data — ajustou o conceito pra "leitura oficial Energisa", com evidência obrigatória, não "escolher entre leituras existentes"). Migration aplicada em 5 partes (`apply_migration`): tabela `ciclos_solares`, colunas novas em `energia_solar_leituras` (`ciclo_id`/`eh_leitura_oficial_energisa`/`evidencia`), views `vw_ciclo_solar_aberto`/`vw_ciclo_solar_historico`, RPC `fechar_ciclo_solar()`, bootstrap (ciclo 1, baseline zero, 5 leituras linkadas). **Achado próprio corrigido no processo**: a primeira versão da migration deixou `ciclos_solares` sem RLS e a RPC sem `SECURITY DEFINER` — corrigido pra igualar o padrão já usado no projeto (mesma policy de `caixas`/`investimentos`, mesmo `SECURITY DEFINER` de `lancar_transacao_manual`), confirmado via `get_advisors` antes e depois.

**4. Frontend religado (mesma sessão, autorizado explicitamente)**: `Sistema_Wallace_Lira_Completo.html` ganhou fetch paralelo de `energia_solar_leituras` (mesmo padrão de `cartoes`/`legendas`); `app.js` sobrescreve `VARS.SOLAR_LEITURAS` com o dado V2 (vence tanto o literal local quanto `wallace_dados`, mesma prioridade do bloco LEGENDAS) — **sem fallback silencioso**: se a V2 falhar, vira array vazio, não reexibe wallace_dados. `graficos-cenarios-lazy.js`: `_lazyRenderCenariosDeficitEGraficosSolar()` virou `async`, busca ciclo aberto + histórico; seção 10 agora mostra "Crédito do ciclo atual" (principal, novo) + "Acumulado desde ativação" (secundário, era o único número antes); seção 11 ganhou bloco de histórico de ciclos fechados (vazio hoje, nenhum ciclo fechou ainda); seção 12 (Previsão) passa a usar crédito do ciclo aberto e dias desde o início do ciclo, não mais desde a ativação. `FinanceEngine.js`/`promocoes-financeengine.js` verificados (não precisaram de mudança funcional — a fórmula não mudou, só a origem do array na raiz, ambos os consumidores leem o mesmo array já trocado) e documentados com comentário explicando por que continuam corretos. Nenhuma fórmula financeira, percentual de rateio, ou o caso 301×361 foi tocado.

**5. Verificação**: preview local confirma boot sem erro de console (HTML/JS parseiam certo) — validação funcional completa (valores na tela, `WALLACE_VALIDACAO_RUNTIME`) continua pendente de login real, mesma limitação de sempre.

**6. Pendência criada nesta sessão para a próxima**: usuário pediu proposta (não implementação) de uma aba própria "☀️ Energia Solar" separando o domínio inteiro (hoje espalhado dentro da aba Gráficos) — entregue no mesmo turno deste commit, aguardando aprovação antes de qualquer código.

---

## Bloco 19 — Wave A/B: desligamento sistemático da V1, nova métrica "consumidores de wallace_dados" (08/08/2026, sessão nova, continuação do Bloco 18)

**Contexto do corte**: usuário abriu a sessão reafirmando o objetivo do projeto ("desligar a V1, colocar a V2 em operação plena") e pediu execução imediata de um plano por ondas (Plan Mode usado, aprovado com ajustes). Métrica de sucesso mudou explicitamente: não é mais "quantos domínios estão na V2", é "quantos consumidores de `wallace_dados` ainda existem". Nenhum commit feito ainda nesta sessão — tudo abaixo está só no working tree.

**1. Wave A — endurecimento dos 3 domínios V2-preferenciais que ainda tinham fallback silencioso** (Caixas 10/18, Livro Razão 7 tabelas, LRW/LRV totais): apliquei o mesmo padrão `⚠ Indisponível (V2)` que os 6 domínios Onda 4/5 já usavam, em `hydrate-onda1-v2.js`, `hydrate-onda2-v2.js`, `hydrate-onda3-livro-razao.js`, `hydrate-onda3-lrwlrv.js`. **Decisão importante durante a execução**: NÃO endureci os 4 caixas com `aceitarDivergenciaConhecida:false` (PGV, Saúde Família, Manutenção, Aniversário Júlio) nem o Provisionado Wärtsilä-log — esses têm divergência V1×V2 não confirmada e o usuário proibiu reabrir essa investigação em sessão anterior. Endurecer teria forçado ou exibir V2 com divergência não decidida, ou marcar "Indisponível" um valor que hoje é legitimamente V1 — os dois errados. Só toquei nos itens que já eram V2-preferenciais de fato.

**2. Wave B1 — titularidade de cartão (Mastercard Black/Visa) migrada pra V2**: achado real ao investigar — o mapa hardcoded `CARTAO_PLUGGY_MAPA_DEFAULT` (`pluggy-reconciliacao.js`) nunca tinha o cartão 1371 (substituiu o 2244 em sessão anterior, só a tabela `cartoes` sabia disso). Corrigido com uma solução que preserva a garantia de ordem síncrona que o código já documentava como frágil (`const CARTAO_PLUGGY_MAPA` precisa de dado pronto no momento em que o script de `app.js` é parseado): adicionei um fetch de `cartoes` em paralelo no bootstrap do HTML (`Sistema_Wallace_Lira_Completo.html`, mesmo padrão já usado pra `legendas`), exposto como `window.WALLACE_CARTOES_V2` antes de `app.js` rodar. Nova função `construirCartaoPluggyMapa()` monta o mapa titular/apelido/bloqueado a partir dele; `totalVar` (qual total do ERP cada cartão soma) e `conexaoDesatualizada` continuam como regra local — são fato da integração Pluggy, não dado de identidade do cartão, sem coluna correspondente em `cartoes` hoje. Fallback pro literal antigo se a V2 não responder (offline/erro), nunca quebra.

**3. Wave B2 — Assinaturas: investigado, propositalmente NÃO migrado**. O plano original previa criar `vw_assinaturas_v2` e ligar `visaLRSConfirmado`/`mbLRSConfirmado`. Ao consultar o dado real (`SELECT` direto em `transacoes` join `categorias`), achei que 23 das 27 transações já classificadas como "Assinaturas" têm `cartao_id = null` — não dá pra saber se a cobrança foi no cartão Visa ou Mastercard Black pra maioria delas. Criar a view e ligar o frontend teria produzido um split visivelmente errado (ou não-derivável) — parei antes de escrever qualquer SQL/JS pra essa parte e documentei o achado em vez de forçar. Mesma causa raiz do gap de Recorrências/Corporativo já conhecido (34 transações sem categoria) — os dois ficam registrados juntos como pendência de dado, não de engenharia.

**4. Wave B3 — exceção arquitetural formalizada**: `docs/decisions/EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md` (novo arquivo) documenta por escrito que `cartaoMBTotal`/`cartaoInfiniteTotal`/`mercadoPagoFatura` nunca serão derivados só da V2 — regra de negócio permanente ("a fatura sempre vence"), não dívida técnica. `MANUAL_OPERACIONAL_AGENTES.md` seção 2 atualizado pra refletir os domínios endurecidos + a titularidade migrada + a referência à exceção.

**5. Waves C/D/E/F — deliberadamente NÃO executadas nesta sessão**, por instrução explícita do usuário: TX000203-208 (já classificadas, não aproximam desligamento da V1), Ciclo Snapshots, Operacional (~30 chaves), Pluggy/MP brutos. "Essas frentes só entram quando acabarem os itens migráveis de baixo risco" — palavras do usuário.

**6. Verificação**: subi o preview local (`.claude/launch.json`) e confirmei via `read_console_messages`/`get_page_text` que a página carrega sem erro até o gate de login ("Sessão não encontrada") — prova que o HTML/JS novo não quebra o parse/boot, mas não confirma cálculo/render (precisa de login real, mesma limitação de sessões anteriores). `WALLACE_VALIDACAO_RUNTIME`/`#healthBadge` não rodados.

**7. Nenhuma migração SQL executada** — só `SELECT`s de investigação (`cartoes`, `categorias`, `usuarios`, `transacoes`). Nenhum schema mudou nesta sessão.

**Pendências novas geradas por esta sessão**: decisão do usuário sobre como (ou se) preencher `cartao_id` retroativamente nas transações de Assinaturas/Recorrências sem `cartao_id`; revisão e autorização de commit (nada commitado ainda).

---

## Bloco 18 — Onda 4 (4/4) + Onda 5 (3 domínios) + Solar + mudança de direção arquitetural "V2 é a fonte real" (08/08/2026, continuação do Bloco 17, sessão nova)

**Contexto do corte**: sessão retomada de um resumo automático (limite de contexto) no meio da Onda 4. Este bloco cobre tudo que aconteceu desde então — é a sessão mais longa e com mais mudança de direção do projeto até aqui. 14 commits, nenhum push.

**1. Onda 4 fechada (4/4 domínios autorizados)**: Patrimônio (`patrimonio`+`financiamentos`, tabela nova + rótulos + view), Investimentos/ROC (`investimentos` +10 colunas + `indicadores` CDI/ROC, reaproveitando 100% do cálculo/render V1 — `aplicarStatusVencidoEValorMercadoOpcoes`/`calcularROCOpcoes`/`hydrateROC` inalteradas), LREI (tabela nova `emprestimos_internos`, ausência real de estrutura confirmada), Cascata Wärtsilä (`reembolso_wartsila_ciclo`, achado colateral: caixa "Provisionado Wärtsilä" tinha 3 transações nunca sincronizadas na V2, corrigido). Padrão consolidado: sempre que possível, reaproveitar as funções de cálculo/render V1 já existentes em vez de duplicar lógica — só trocar a origem do dado.

**2. Onda 5 (continuação, "aposentadoria do wallace_dados")**: Parcelamentos (achado: `parcelas` já tinha as 22 linhas sincronizadas, só faltava a view), P2P (7 escalares → `indicadores`, mesmo padrão do CDI), "Qualidade da Geração" solar (indicador operacional novo, não financeiro). Mastercard Black/Visa avaliado e **bloqueado** por acoplamento a reconciliação bancária manual — não perseguido na hora, reavaliado no fim da sessão (ver item 6).

**3. Investigação Solar 301×361 kWh — não resolvida, por decisão correta do usuário**: usuário pediu prova (não opinião) de qual conceito é o crédito real pro rateio (Exportado=361 vs Saldo Líquido=301, `exportado−importado`). Prova entregue: fórmula atual documentada, fluxo do painel mostrado como contraditório com a fórmula, busca exaustiva pelo documento original (`Base_Calculo_Rateio_Solar.md`) sem sucesso (não existe no repo/backup — 2 auditorias anteriores independentes já tinham marcado essa área como "não confirmado"). **Usuário concordou explicitamente em não trocar a fórmula sem evidência externa** — ficou registrado como pendência formal, não decidido por hipótese.

**Achado colateral desta investigação, mais valioso que a dúvida original**: ao investigar por que a tabela V2 (`energia_solar_geracao_diaria`) estava parada desde 05/08, descobri que o robô SAJ **nunca parou** — ele grava em `wallace_dados.dados.SOLAR_GERACAO_DIARIA` (o blob que o frontend realmente lê), não na tabela V2. Confirmado via API pública do GitHub Actions (9 execuções, todas `success`, dado real até o próprio dia desta sessão). Corrigido (script `atualizar_geracao_saj.py` agora grava nas duas, upsert por `data`, falha na V2 não derruba o script).

**4. "Qualidade da Geração" — indicador operacional novo, separado do crédito/rateio**: usuário pediu um card que responda "a usina está indo bem ou mal" sem nenhum termo técnico (código 03/103, saldo líquido, ANEEL). Achado de design corrigido ANTES de subir: a primeira versão comparava a leitura parcial de "hoje" contra a média de dias inteiros — isso classificaria "abaixo do esperado" quase toda manhã, mesmo em dia bom (testado mentalmente com dado real: 12,26 kWh às 11h40 vs média completa = 49%, falso alarme). Corrigido: o selo de status (🔴/🟡/🟢) usa sempre o último dia FECHADO comparado à média dos dias anteriores a ele; "hoje" é só exibido, nunca recebe selo.

**5. Bug de usabilidade real corrigido — Inbox Financeira**: usuário reportou itens "duplicados" visualmente (mesma origem/valor/data, sem descrição). Investigação com dado real do Supabase confirmou 2 eventos genuínos do Mercado Pago (`tipo:'account_money'`, mesmo payer, descrição vazia) que só se distinguiam pelo `idExterno` — campo que já existia no dado bruto mas nunca era exibido nem repassado (`metadata` nem chegava a ser passado de `sincronizarMercadoPagoParaInbox()` pra `inboxAdicionarItem()`). Corrigido: `idExterno`/`payer` agora aparecem na listagem; descrição vazia gera texto automático a partir do `tipo` do evento (mapa fechado, nunca inventa texto pra tipo desconhecido). Hora/minuto do evento não existe na fonte (script Python só grava data) — documentado como limitação real, não fabricado.

**6. Ajuste de clareza visual — Caixa Variável**: usuário apontou risco de interpretação — R$313,84 (Disponível Real) aparecia em 3 lugares com rótulo genérico "Caixa variável", risco de ser lido como o saldo total (R$1.886,65). Corrigido **só o texto dos rótulos** (3 pontos), nenhum id/fórmula/valor alterado (conferido no diff antes de commitar). Mesma distinção formalizada como regra permanente no manual (seção 6.1): TEM NA CAIXA (bruto) × DISPONÍVEL REAL (bruto − comprometido).

**7. Regra nova formalizada — alerta preventivo de PGV**: gatilho formal R$50 (Política §7), mas usuário pediu alerta preventivo sempre que o saldo estiver ≤ R$100, já na resposta de abertura de sessão. Registrado como obrigatório pra todos os agentes (`MANUAL_OPERACIONAL_AGENTES.md` seção 6.1) — só alerta, nunca executa transferência/lançamento automaticamente.

**8. MUDANÇA DE DIREÇÃO ARQUITETURAL (a mais importante desta sessão)**: usuário decretou que a V2 deixa de ser espelho/transição e passa a ser a arquitetura oficial — "a pergunta do projeto não é mais como manter V1 e V2 juntas, é o que ainda impede desligar a V1". Executado nesta rodada:
   - **Inventário completo de `wallace_dados`**: 95 chaves de topo (evidência real via `jsonb_object_keys`), 5 escritores identificados (4 scripts Python + o fluxo manual do agente, que cobria a maioria das chaves), classificados em 3 grupos (migrável imediatamente / depende de modelagem / depende de dado inexistente) — `PLANO_UNIFICACAO_V1_V2.md` seções 41-42.
   - **6 domínios já migrados viraram V2-exclusivos**: Patrimônio (exceto Caixa Lance), Investimentos/ROC, LREI, Cascata Wärtsilä, Parcelamentos, P2P. Mudança concreta: nova função `marcarIndisponivelV2()` (`app.js`) — falha na busca à V2 agora mostra `⚠ Indisponível (V2)` visível em vermelho, em vez do antigo `catch` silencioso que deixava o número V1 (síncrono, já renderizado) na tela sem nenhum aviso, indistinguível de dado real. Isso elimina o "caminho redundante mantido por segurança psicológica" apontado pelo usuário.
   - **Manual operacional atualizado** (seção 2): domínios V2-exclusivos param de receber escrita em `wallace_dados` no fluxo de lançamento manual — lançamento futuro vai direto nas tabelas V2.
   - **Deliberadamente NÃO executado** (risco desproporcional sem validação em navegador, sessão inteira sem login): remover os literais V1 dos `vars-*.js` (continuam como semente síncrona do 1º segundo de render — vários rodam em cálculo síncrono no boot, antes do DOM existir); parar os 4 scripts Python de escrever em `wallace_dados` (exceto Solar, que já passou a gravar em paralelo). Ambos classificados, documentados, não executados às cegas.

**9. Auditoria conceitual Mastercard Black/Visa (fim da sessão, sem código)**: usuário pediu regra de negócio primeiro (Política §3), não schema. Achado principal: **CARTAO_MAPA/titularidade/parcelamentos já estão representados na V2** (`cartoes` está, inclusive, mais atualizada que a própria Política — cartão 1371 já substituiu o 2244 fisicamente, refletido na V2, não no documento). O que continua bloqueado: headline totals (`cartaoMBTotal`/`cartaoInfiniteTotal`, verdade externa reconciliada à mão, não migrável sem reabrir reconciliação — proibido) e um gap de 34 transações (de 147 candidatas na Caixa Variável) sem `categoria_id`, mesmo gap já documentado que bloqueou a tentativa anterior de migrar LRW/LRV item-a-item. Categoria "Assinaturas" já existe na V2 (27 transações já classificadas) — migrável com 1 view nova, sem schema. "Recorrências" não tem categoria equivalente ainda. Nenhum código escrito, só investigação — ver `PLANO_UNIFICACAO_V1_V2.md` seção 43.

**Commits desta sessão** (16 ao todo, **todos enviados ao remoto** a pedido explícito do usuário no fechamento — `git push origin main`, `6bd54ab..61d54de`, `main` sincronizado com `origin/main`): `a3b3034` (fecha Onda 3), `d144157`/`4429a43`/`0639e37`/`755b4ba` (Onda 4, 4 domínios), `b6f7f31`/`5a40eae` (Onda 5, Parcelamentos+P2P), `a4e2cfd`/`7aef36b` (regras PGV/Caixa Variável), `13e4cbe` (bug Inbox), `a470500` (rótulos Caixa Variável), `6227d94`/`1c515d7` (investigação Solar + sync V2), `5f2c05f` (mudança de direção arquitetural + V2-exclusivo), `dc0bd47` (passagem de turno Bloco 18), `61d54de` (resumo executivo final). `ESTADO_ATUAL.md` reescrito do zero nesta rodada. **Pendência nova pra próxima sessão**: confirmar `wallacelira.com.br` ao vivo (GitHub Pages deve republicar sozinho, não verificado — sem navegador disponível nesta sessão).

**Nenhum lançamento financeiro real aplicado nesta sessão** — trabalho 100% arquitetura/migração de leitura + correções de usabilidade, nenhum dado de negócio alterado (exceto rotulagem/metadados, nunca valores).

## Bloco 17 — Onda 3 (Livro Razão, LRW/LRV, Patrimônio bloqueado, Metas parcial) + pivô estratégico V1→V2 (08/08/2026, continuação do Bloco 16, sessão nova)

**Contexto do corte**: esta sessão retomou de um resumo automático (limite de contexto, não de crédito) — o histórico completo do pivô estratégico e das Ondas 1/2 está fora deste bloco (aconteceu majoritariamente na parte da sessão que foi resumida). Aqui vai o que se sabe do resumo + o que foi executado depois da retomada.

**0. O pivô estratégico (resumido, aconteceu antes da retomada)**: usuário decretou "Pare de tratar a V2 como sistema auxiliar" e depois "MUDANÇA DE DIREÇÃO ESTRATÉGICA — não quero mais investir tempo em sincronização V1→V2 como solução permanente. Quero V2 relacional como única fonte de verdade." Isso abriu a Onda 1 (4 caixas, zero divergência, `vw_saldo_v2_por_caixa`) e a Onda 2 (+6 caixas com divergência documentada aceita, política nova: "divergência documentada não bloqueia, só ausência de estrutura bloqueia"; 4 caixas de causa indeterminada ficaram de fora por decisão explícita — Manutenção, Saúde Família, PIX Geral Vanessa, Aniversário Júlio). Depois disso o usuário deu a ordem de prioridade da Onda 3: **1. Livro Razão → 2. LRW/LRV → 3. Patrimônio → 4. Metas → 5. Investimentos**, com regra explícita de não parar entre prioridades pra nova rodada de análise, "exceto se encontrar ausência real de estrutura na V2".

**1. Onda 3, Prioridade 1 (Livro Razão) — feita antes da retomada, commit `a59a943`**: 7 tabelas de lançamentos migradas pra ler `transacoes` direto (mesmo escopo das caixas já migradas — Eventos, Seguro, Combustível, Churrasco, Mastercard/Infinite, Bens Duráveis, PIX Vanessa). No caminho, achado e corrigido um bug real determinístico: `onDomPronto(fn)` roda `fn()` de forma SÍNCRONA (não é fila) sempre que o DOM já está pronto — caso normal aqui, já que `app.js` é injetado depois de um `fetch()` assíncrono. `WallaceFinanceService` estava definido textualmente DEPOIS de `onDomPronto(hydrate)`, causando `ReferenceError` em parte dos carregamentos (mascarado de "falha transiente" nas Ondas anteriores). Corrigido movendo `WallaceFinanceService` pro topo do arquivo.

**2. Onda 3, Prioridade 2 (LRW/LRV) — feita nesta retomada, commit `eff2805`**: investigação SQL mostrou que, das 35 linhas de `transacoes` marcadas como LRW/LRV (Caixa Variável, `afeta_saldo_real=false`), exatamente 30 têm `usuario_id` preenchido (25 Wallace R$1.128,11, 5 Vanessa R$218,21) e 5 não (`TX000200/203/204/205/206`) — e essas 5 são precisamente o grupo já identificado numa sessão anterior como "colisão de `tx_legado` com eventos históricos não relacionados" (Parte B da investigação de reconciliação). Ou seja: a divergência V1×V2 aqui (R$435,08 Wallace, R$146,41 Vanessa) já estava 100% explicada antes mesmo de criar código novo — não foi preciso investigação adicional. Criada view `vw_compromisso_cartao_por_pessoa` (agregação pura, `JOIN usuarios` exclui as 5 linhas sem `usuario_id` naturalmente, sem filtro extra) e módulo `hydrate-onda3-lrwlrv.js` sobrescrevendo `mbLRW`/`mbLRV`. Validado ao vivo (login já ativo na aba), zero erro de console.

**3. Onda 3, Prioridade 3 (Patrimônio) — BLOQUEADA, sem código escrito**: ao investigar a tabela `patrimonio` (V2, 11 linhas) pra reproduzir `patTotal`/`patrimonioDetalhe`/`passivosPatrimoniais`, achado um bloqueio estrutural real, não só divergência: a tabela só tem colunas `id/tipo/valor/data_snapshot/created_at/natureza`, **sem nenhum campo de rótulo**. Duas linhas têm `tipo='investimento'` (R$14.779,62 = BTG Necton, R$429,75 = Necton conta corrente) e são indistinguíveis por qualquer coluna — só bateriam por coincidência de valor, o que seria inventar lógica de correspondência frágil (proibido pela restrição da rodada: "não criar lógica nova de negócio"). Além disso, `passivosPatrimoniais` (seção 11 do painel) precisa de campos que não existem na tabela: `prestacaoFinanciamentoCasa`, `mesesRestantesFinanciamentoCasa`, `consorcioAutoPct`, `parcelaConsorcioAuto`. **Decisão: não migrar, documentar o bloqueio (seção 27 do plano) com o caminho de desbloqueio registrado (schema novo: coluna de rótulo + tabela/colunas de metadados de financiamento), sem executar.**

**4. Onda 3, Prioridade 4 (Metas) — parcial, commit `4d2e6e2`**: a tabela `metas` (V2) tem 2 linhas — "Fundo de Suavização Salarial (CC-304)" e "Meta do Milhão". A primeira bateu limpo: `vw_saldo_v2_por_caixa` já tem "Conta Suavização (CC-304)" com saldo R$0,00, idêntico ao V1 (`VARS.contaSuavizacao`, conta zerada desde a ativação). Migrado o card (`cxSuavizSaldo`/`cxSuavizTxt`/`cxSuavizBar`), reproduzindo a MESMA fórmula de texto/barra do V1, só trocando a fonte do saldo — módulo `hydrate-onda3-suavizacao.js`. "Meta do Milhão" **não migrada**: depende de `patrimonio.total`, que depende do saldo da Caixa Lance — achado novo nesta investigação: **a Caixa Lance nunca entrou em nenhum `*_V2_MAPA` de Onda anterior**, ou seja, a divergência V1×V2 dela nunca foi classificada. Registrado como pendência transversal (destravaria parte da Prioridade 3 + a Meta do Milhão inteira se resolvida).

**5. Onda 3, Prioridade 5 (Investimentos) — não iniciada.** A sessão parou na Prioridade 3/4 por ter batido o critério explícito do usuário de parada ("ausência real de estrutura na V2") — reportado ao usuário antes de prosseguir, em vez de seguir direto pra Investimentos com 2 blocos em aberto.

**Padrão de código consolidado nesta sessão** (repetir em qualquer Onda futura): módulo dedicado `hydrate-ondaX-nome.js`, método novo em `WallaceFinanceService` (topo de `app.js`), fetch/compare/log/overlay condicional (só sobrescreve DOM em caso de sucesso e — se aplicável — divergência aceita), `window.WALLACE_ONDAX_..._RELATORIO` global pra inspeção via console, chamada em `app.js` registrada DEPOIS da função V1 equivalente (nunca antes — senão V1 sobrescreve o V2), entrada no array de módulos do `Sistema_Wallace_Lira_Completo.html`, documentação de 8 pontos em `PLANO_UNIFICACAO_V1_V2.md`, validação ao vivo (login real, `document.getElementById('mainIframe').contentWindow`) antes de considerar pronto.

**Commits desta sessão** (avisados antes de cada um, ainda **NÃO enviados pro remoto** — `git status -sb` mostra `ahead 2` no fim da sessão): `eff2805` (LRW/LRV), `4d2e6e2` (Suavização + documentação do bloqueio de Patrimônio). `ESTADO_ATUAL.md` reescrito do zero nesta rodada; este bloco documenta o passo a passo.

**Nenhum lançamento financeiro real aplicado nesta sessão** — trabalho 100% de migração de leitura (frontend), nenhum dado de negócio alterado.

## Bloco 16 — Handoff por limite de crédito: performance, bugs reais, features novas, dupla arquitetura V1/V2 (07/08/2026, continuação do Bloco 15, mesma sessão)

**Contexto do corte**: usuário avisou "prepare a passagem de turno que seu crédito vai acabar" no meio de uma implementação (redesign dos botões flutuantes) — esta sessão fecha aqui, com uma tarefa deliberadamente incompleta (ver item 8). `ESTADO_ATUAL.md` foi reescrito do zero nesta rodada com o resumo estruturado; aqui vai o histórico passo a passo do que aconteceu, na ordem.

**1. Descoberta central da sessão: duas arquiteturas de dados paralelas.** O usuário pediu correção de performance e, no meio do trabalho, foi mostrando prints do painel ao vivo pedindo ajustes pontuais (FGTS, Caixa Wärtsilä, IOF ausente). Ao investigar por que os dados não batiam, descobri que existem DUAS fontes de dado completamente separadas: (a) V1 clássico — `VARS`/`REG` estáticos + uma linha JSON (`wallace_dados` no Supabase) que sobrescreve o VARS a cada carga (`Object.assign(VARS, dr)`) — é isso que alimenta o painel visível; (b) V2 relacional — tabelas normais (`caixas`, `transacoes`, `categorias`) alimentadas pelo botão "+ Lançar" e pela Inbox Financeira — NÃO afeta o painel ainda, é dado paralelo pra comparação futura (Fase 5). Isso explica por que a auditoria `FASE 2F` (`WALLACE_VALIDACAO_RUNTIME`) ficou REPROVADA o resto da sessão (4-10 caixas divergentes V1×V2) — é esperado, não é bug: são os lançamentos reais de hoje que entraram no V1 mas não foram replicados no V2 (decisão implícita, dado o volume — ver item 5).

**2. Diagnóstico de performance (pedido "PRIORIDADE MÁXIMA")**: medido por código-fonte (contagem de requisições) já que autenticação real é necessária pra medir em navegador de verdade (usuário logou na aba pra permitir a medição ao vivo depois). Achados: 55 módulos via `document.write` sequenciais + 3 fetches iniciais (`await` em cadeia) + cadeia de 8 `onload` no final = ~67 requisições 100% seriais, nenhuma cacheada (`?v=Date.now()` sempre). Autorizado a corrigir.

**3. Implementação da correção de performance**: os 55 módulos + 3 fetches viraram paralelos (`Promise.all`), cache-busting virou versão fixa (`__V`), cadeia de `onload` final reduzida de 8 pra 2 sequenciais reais (`energia-solar.js`→`promocoes-financeengine.js`, única dependência de ordem verdadeira) + 6 em paralelo. Resultado medido ao vivo (servidor local): ~10-15s relatados → 3,8-4,4s medidos (2 cargas). Bug real encontrado no processo: um comentário JS continha o texto literal `</script>`, fechando a tag HTML prematuramente e truncando o resto do bloco (`ReferenceError: __V is not defined`, tela travada em "—"). Corrigido. **Lição pra próxima sessão**: nunca escrever `</script>` como texto solto dentro de um `<script>`, nem em comentário.

**4. Bugs pontuais corrigidos** (apontados pelo usuário via prints do painel ao vivo, um a um): card FGTS com placeholder hardcoded (`R$77.683,60` em vez de `—`); card Caixa Wärtsilä mostrando a fatura como número principal em vez do saldo real da caixa, barra de progresso decorativa (nunca conectada a nenhum cálculo) e legenda usando um indicador (`recebidosNoCiclo`) que dava negativo mesmo com dinheiro real recebido; IOF de 3,38% ausente em 2 compras Anthropic (TX000200/TX000205) apesar do comentário dizer que estava incluído — corrigido nas 2 + no total mestre `cartaoMBTotal` (achado ao aplicar o IOF do TX000205 mais recente e o usuário pedir pra "inspecionar porque tem outra na mesma situação" — exatamente TX000200 tinha o mesmo bug). Scrollbar cinza quase invisível trocada por cinza claro. Card PIX Geral Vanessa ganhou meta de R$300 (confirmada pelo usuário) com barra animada.

**5. Lançamentos financeiros reais aplicados (V1: arquivo local + Supabase `wallace_dados`, sempre os 2 lugares)**: reembolso Bradesco R$312 (split R$164,94 Lance + R$147,06 Saúde Família, LREI0002 quitado), cortinas R$450 + empréstimo LREI0004 R$103,55 (Lance→Manutenção), reembolso Wärtsilä R$340 (dentro da própria Caixa Wärtsilä — usuário corrigiu explicitamente que NÃO vai direto pra Caixa Lance, segue a cascata da política seção 5), R$107,50 adiantamento bolo de Júlio (fluxo Variável→Vanessa→Aniversário reembolsa→Vanessa repassa pra mulher do bolo), Hortifruti R$46,97 (PIX Geral Vanessa/LRPV), `reembolsoAReceber` atualizado pra R$6.700,61 (usuário confirmou, R$340 já recebido conta à parte). Inbox Financeira: 12 pendentes, cruzados um a um contra o que já tinha sido lançado — 11 rejeitados (duplicavam lançamentos já feitos), 1 (R$652, Wärtsilä+Bradesco combinados) **desapareceu sozinho da Inbox antes de eu rejeitar, motivo não investigado**.

**6. Deploy**: usuário autorizou explicitamente "você comita sozinho, só me avise antes" (mudança de regra permanente, antes era "nunca commitar sem pedido explícito") e depois "se precisar faça o deploy" — 4 commits feitos e enviados nesta sessão (`e1c4aa7` performance+bugs, `608fdb9` reembolsoAReceber, `422b04d` saudação+inatividade+split+categoria+botões). Descoberta no caminho: 2 commits (`9b97ed2`, `1bc7769`) já tinham sido feitos por fora (provavelmente o usuário via VS Code, ou outra sessão) sem eu saber — sempre rodar `git status`/`git log` antes de assumir o que está pendente.

**7. Features novas implementadas** (pedidos explícitos do usuário, não bugfix): saudação premium ("Bom dia/Boa tarde, Wallace/Vanessa" conforme e-mail logado + horário, `wallace.termica@gmail.com`/`vanessaflor.galdino@gmail.com`, únicos 2 com acesso); logout automático por 15min de inatividade; formulário "+ Lançar" ganhou opção de dividir valor entre várias caixas (várias linhas caixa+valor, 1 chamada de RPC por linha) e opção de criar categoria nova (nova função Postgres `criar_categoria`, aplicada via migration do Supabase MCP, SECURITY DEFINER, não está em arquivo `.sql` do repo).

**8. INCOMPLETO no corte**: usuário rejeitou o visual do redesign dos botões flutuantes (pill sólida com gradiente, achou "horroroso"), mandou print de referência e pediu: círculo pequeno com ícone, tira lateral com o texto aparece só no hover. Decidido o approach (label posicionado absoluto atrás do círculo, revela com opacity+transform no `:hover`) mas **nenhum código foi escrito ainda** — próxima sessão retoma em `src/app/app.js`, procurar `.wallace-fab` (CSS injetado dinamicamente via `<style>` em JS, não em `assets/css/styles.css`).

## Bloco 15 — Handoff (narrativa desatualizada vs. disco real) + lançamentos financeiros reais do ciclo (07/08/2026)

**Parte 1 — passagem de turno pedida pelo usuário** ("faça a passagem para o próximo agente / se atualize nas documentações do projeto"): a narrativa da sessão anterior (achava que só tinha criado `reg-operacional.js`, faltando 6 módulos REG e todo o VARS) estava completamente desatualizada em relação ao disco real — REG (7 módulos) e VARS (10 módulos) já estavam prontos, o projeto já tinha sido fisicamente reorganizado (Bloco 14) e tudo já estava commitado (`b83e165`+`e4a0226`). Corrigido reconferindo `git status`/`git log`/`git diff`/`find` antes de escrever qualquer coisa — `docs/changelog/ESTADO_ATUAL.md` foi reescrito do zero pra refletir o estado real (4 fases da modularização V2 concluídas, reorganização física concluída, 2 arquivos com dado financeiro real não commitado: `vars-caixas.js` e `vars-mercado-pago.js`, sincronização Supabase TX000192-208). Lição confirmada: nunca confiar em narrativa de sessão sem checar `git`/filesystem primeiro, especialmente após qualquer indício de lacuna de tempo ou compactação de contexto.

**Parte 2 — lançamentos reais do ciclo (confirmados um a um pelo usuário antes de escrever)**:
1. **Reembolso Bradesco R$312,00** dividido em 2 pernas: R$164,94 quita `LREI0002` (Caixa Lance ← Caixa Saúde Família, `status` virou `QUITADO` em `LREI_ATIVAS`) — `TX000212` (Entrada, Caixa Lance) + `TX000213` (Entrada, `SAUDE_FAMILIA_TRANSACOES`). R$147,06 foi pra Caixa Saúde Família também via `TX000213`.
2. **Cortinas R$450,00** saem da Caixa Manutenção (`TX000214`, Saída). Como a Manutenção não tinha saldo suficiente, o empréstimo novo é só a DIFERENÇA (R$103,55, não o valor cheio) — `LREI0004` criado em `LREI_ATIVAS` (Caixa Lance credora, Caixa Manutenção devedora), com `TX000216` (Saída, Caixa Lance) + `TX000215` (Entrada, Manutenção).
3. **Reembolso Wärtsilä R$340,00** — CORRIGIDO por instrução explícita do usuário: NÃO é lançamento direto na Caixa Lance. Segue a cascata da política (seção 5): Cartão Wärtsilä → corporativo Mastercard → corporativo Mercado Pago → Pessoal Mercado Pago → só a sobra vai pra Caixa Lance. Usuário confirmou que já transferiu o R$340 de verdade pra dentro da Caixa Wärtsilä — lançado como `TX000220` (Entrada) em `WARTSILA_CAIXA_TRANSACOES`, e `VARS.reembolsoCicloTotal` atualizado (4914.98 → 5254.98, SSOT, mesmo padrão V137) pra refletir o recebimento no indicador da cascata. `sobraPessoal` continua sendo recalculado automaticamente pela fórmula existente (`FinanceEngine.js`) — nenhuma entrada manual extra necessária na Caixa Lance por enquanto.
4. **R$107,50 (adiantamento bolo de Júlio)** — fluxo completo esclarecido pelo usuário: Caixa Variável pagou Vanessa (nunca lançado antes, "não prestei atenção") → Caixa Aniversário Júlio reembolsou a Caixa Variável (isso já existia como `TX000208`, só a descrição estava errada, dizendo que ia direto "pra Vanessa" — corrigida pra refletir que é reembolso à Variável) → Vanessa repassou o valor pra Maria Karoline de Lima Frazao (mulher do bolo, comprovante MP 172378658144). Adicionados `TX000217` (Saída) e `TX000218` (Entrada) em `CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL` — efeito líquido zero na Caixa Variável (dinheiro só passou por ela), exatamente como o usuário descreveu.
5. **R$46,97 (Hortifruti Dupomar)** — usuário confirmou "sai do Pix Geral Vanessa" (comprovante MP 172431149270, 06/08). Adicionado `TX000219` (Saída) em `LRPV_TRANSACOES` — mesmo padrão de `TX000153` (mesmo fornecedor, "PIX Dupomar Hortifruti").
6. **Confirmado** (resposta "1-a" do usuário): Caixa Bens Duráveis mantém o plano como está; `AJUSTE-06-08` continua item separado, não decidido, não mexido.

Todos os placeholders de saldo (`caixaLance`, `caixaManutencao`, `caixaSaudeFamilia`, `caixaVariavelSaldoReal`, `pixGeralVanessaSaldo` etc.) foram deixados intocados — são sempre recalculados por `calcularSaldoCaixa()` a partir dos arrays de transação, nunca editados à mão.

**Arquivos alterados**: `src/financeiro/caixas/vars-caixas.js`, `src/financeiro/operacional/vars-reembolsos.js`. **Ainda não commitado** (usuário commita via VS Code). **Não validado em navegador nesta rodada** (exigiria login manual do usuário na aba) — validar com `WALLACE_VALIDACAO_RUNTIME` (18/18) e `healthBadge` antes de considerar fechado.

## Bloco 14 — Reorganização física completa do projeto (07/08/2026, continuação do Bloco 13, mesma sessão)

Depois da validação em navegador da Fase 3+4 (REG/VARS, ver Bloco 13) e de uma auditoria de pré-deploy (achados: `calcularValorKwhGerado()` órfã em `energia-solar.js`; CNAME/Firebase authorized domain pendentes pro domínio próprio; nenhum bug real), o usuário decretou "modo congelamento pré-deploy" — e, na sequência, revogou esse congelamento em favor de uma reorganização arquitetural física completa do projeto, dando prioridade a ela sobre o deploy imediato.

**Processo seguido, por pedido explícito do usuário**: mapear tudo antes de mexer, apresentar estrutura atual/proposta/riscos/ordem, só then executar. A proposta original do usuário (`src/{app,dashboard,financeiro,solar,auditoria,integrations,services,shared,components,assets}` com ~40 subpastas) foi podada — removidas ~15 pastas que ficariam vazias ou exigiriam quebrar arquivo existente em pedaços pra preencher (`shared/`, `components/*`, `assets/js`, `assets/fonts`, subpastas de `solar/`, a maioria de `integrations/*`, `services/api|cache|storage`, `.github/ISSUE_TEMPLATE`/`PULL_REQUEST_TEMPLATE`, `tests/integration`/`mock`) — critério: "prefiro arquitetura coerente do que árvore bonita cheia de diretório sem uso" (palavras do usuário).

**Achado que mudou o plano**: `src/services/*.js` têm `import`/`require('./Outro.js')` reais entre si (`CycleEngine.js`, `EnergiaService.js`, `FinanceService.js` etc.) — mover qualquer um pra pasta diferente quebraria essas referências relativas. `services/` ficou intocado, flat, como já estava. Achado lateral: 9 dos 11 arquivos de `src/services/` (tudo exceto `FinanceEngine.js`/`Comparator.js`) não são carregados por nada em produção — arquitetura anterior superada, mantidos por estarem fora do escopo autorizado.

**Execução** (~78 arquivos movidos, ~75 caminhos reescritos):
- 63 módulos de `src/modules/` (pasta removida) + `app.js` (raiz → `src/app/`) distribuídos em `src/{dashboard,financeiro,solar,auditoria,integrations}/`, um domínio de negócio por pasta (hydrate+reg+vars+recalcular do mesmo domínio juntos, não agrupados por "tipo de arquivo").
- `promocoes-financeengine.js` (cross-domínio, toca as 18 fases de todos os domínios) foi pra `src/app/`, junto do bootstrap — não tinha lar de domínio único.
- Docs → `docs/{architecture,changelog,decisions,database}/` (README.md ficou na raiz — GitHub só renderiza README de raiz como home do repo).
- Scripts Python → `scripts/{database,sync}/`.
- CSS/favicons → `assets/{css,images}/`.
- 3 arquivos `.test.js` → `tests/unit/`, com os `require('./X.js')` corrigidos pra `require('../../src/services/X.js')`.
- Reescrita de caminho feita via script PowerShell (mesmo método confiável da extração do VARS) — 63 substituições de módulo + 1 de `app.js` + 1 de `styles.css` no HTML principal, 3 de favicon no `index.html`, todas conferidas por contagem exata (nenhum caminho antigo sobrou, exceto texto de comentário histórico sem efeito funcional).
- 4 workflows (`atualizar_cotacoes_acoes.yml`, `atualizar_geracao_saj.yml`, `mercadopago_sync.yml`, `sincronizar_pluggy.yml`) tiveram o `run: python3 X.py` atualizado pro caminho novo — sem isso os cron jobs quebrariam. `_headers` também atualizado.

**Validação em navegador feita nesta rodada** (usuário ainda autenticado): reload completo, todos os ~140 requests de rede (contando o carregamento duplicado de sessões anteriores no log) retornaram 200 OK nos caminhos novos, console sem erro novo, `WALLACE_VALIDACAO_RUNTIME` 18/18 `APROVADA`, `healthBadge` "✅ Sistema íntegro", valores reais no painel idênticos aos de antes da reorganização.

**Gerado**: `docs/architecture/PROJECT_STRUCTURE.md` (árvore completa), `docs/architecture/ARCHITECTURE.md` (camadas VARS/REG, padrão de carregamento estático×dinâmico, convenção de nomeação), `docs/CONTRIBUTING.md` (como adicionar módulo/domínio/serviço/script novo).

**Nenhum commit feito.** Decisão em aberto pro usuário: retomar o deploy (CNAME + Firebase authorized domain) que estava planejado antes da reorganização começar.

## Bloco 13 — Fase 4 (`VARS`) modularizada em 9 domínios (10º criado: `vars-operacional.js`), sem validação em navegador (07/08/2026, continuação do Bloco 12)

Usuário aprovou a Fase 3 (`REG`, ver Bloco 12) mesmo sem validação em navegador e pediu pra seguir direto pra Fase 4 (`VARS`), com a mesma regra: não parar por causa do login, registrar exatamente o que foi movido, validar tudo em lote depois.

**Ordem dada pelo usuário**: `vars-caixas` → `vars-mercado-pago` → `vars-p2p` → `vars-patrimonio` → `vars-reembolsos` → `vars-roc` → `vars-energia-solar` → `vars-ciclo-snapshots` → `vars-operacional`.

**2 achados/decisões antes de começar** (perguntei ao usuário antes de escrever qualquer módulo, dado o tamanho e risco de `VARS`):
1. `VARS.PLUGGY_CONTAS` nunca existe no literal estático (só chega via `Object.assign(VARS, window.WALLACE_DADOS_REMOTOS)` em runtime) — usuário confirmou não criar `vars-pluggy.js`.
2. ~35 chaves (salário, orçamento, `coberturaGarantida`, teto/tolerância da Caixa Variável, LEGENDAS, CDI, médias salariais, históricos, Inbox Financeira etc.) não cabiam nos 9 domínios financeiros — usuário aprovou criar um 10º módulo, `vars-operacional.js`, espelhando o domínio "Operacional" que o REG já tinha.

**Achado estrutural**: `VARS` fechava (linha 235→1470 do app.js daquele momento) bem antes do que a posição de `aplicarBoletosVencidosAutomaticamente()` sugeria — entre o fechamento do literal e essa função existe ~115 linhas de pós-processamento síncrono (`Object.freeze` de 3 objetos, merge de dados remotos do Supabase, ~10 saldos derivados via `calcularSaldoCaixa()`) que dependem do `VARS` inteiro já montado. Essa faixa ficou intocada em `app.js`, mesma categoria do que já tinha ficado com `REG` (`calcularAporteIncrementalPorCiclo()`).

**Método**: dado o tamanho de `VARS` (~1.235 linhas, ~200 chaves de topo — bem mais granular que as 35 do `REG`), em vez de editar manualmente como na Fase 3, mapeei as ~90 faixas de linha exatas (chave a chave) e usei um script PowerShell pra copiar por intervalo de linha direto do arquivo pros 9 módulos novos — evita erro de transcrição num arquivo desse tamanho. Um bug real do próprio script (PowerShell "achatava" arrays de 1 único intervalo, zerando o conteúdo de 2 módulos) foi pego pela checagem de integridade (chaves balanceadas + contagem de chaves) antes de prosseguir, corrigido, script re-executado.

**Checagem de integridade feita** (sem navegador — sem Node/Python neste ambiente): 200 chaves de topo no `VARS` original = 200 chaves extraídas nos 9 módulos = 200 únicas (zero perdida, zero duplicada, conferido via script). Chaves/colchetes balanceados em cada módulo novo e em `app.js` inteiro depois da cirurgia.

`app.js`: **2.644 → 1.423 linhas** (-1.221). `const VARS = {}` (vazio) + 9 `Object.assign(VARS, criarVarsXxx())`, mesmo padrão do `REG`. HTML: 8 `<script>` estáticos adicionados antes do `app.js`, logo depois dos 7 `reg-*.js`.

**Mapa final de `app.js` (1.423 linhas) construído a pedido do usuário** ("quero um mapa do que sobra") — registrado em `ESTADO_ATUAL.md` seção 2.9. Conclusão: tirando o `WallaceFinanceService` (~500 linhas, serviço autocontido já validado 18/18, fora de escopo desde a Fase 2), o resto é bootstrap/orquestração pura — monta `VARS`/`REG` a partir dos módulos, roda pós-processamento que precisa do objeto inteiro, e faz as poucas chamadas de orquestração que não podem virar módulo por ordem síncrona de execução. Não decidido ainda, formalmente, se isso fecha a V2 arquitetural — depende da validação em navegador (item 0 das pendências).

**Pendência crítica pra próxima sessão**: validação consolidada em navegador (REG + VARS juntos — console, 18/18 fases, healthBadge, valores reais por domínio). Nenhum commit feito.

## Bloco 12 — Fase 3 (`REG`) modularizada em 7 domínios, sem validação em navegador (07/08/2026, continuação do Bloco 11)

Sessão seguinte, retomando exatamente do ponto do Bloco 11 (`hydrate()`/`recalcularAgregadosDerivados()` já concluídos, `REG` era a próxima frente). Usuário já tinha mapeado a estrutura do `REG` (35 chaves de topo) numa sessão anterior que caiu no meio — só o módulo `reg-operacional.js` tinha sido criado, sem ligar. Confirmei isso conferindo o código real (não a documentação, que estava desatualizada) antes de agir.

Usuário aprovou o agrupamento proposto (7 módulos por domínio, espelhando a mesma divisão já usada em `recalcularAgregadosDerivados()`) e definiu a ordem: `reg-caixas` → `reg-mercado-pago` → `reg-p2p` → `reg-patrimonio` → `reg-reembolsos` → `reg-balanco` (mais o `reg-operacional.js` que só faltava ligar). Regra explícita: só mover definições nesta etapa, sem alterar nomes de campo, estrutura ou comportamento.

**Bloqueio real encontrado**: o preview local caiu em "Sessão não encontrada" — o login usa Firebase real (email/senha), e por regra de segurança a IA nunca digita senha em nenhum campo. Sem o usuário logado na aba, não dá pra rodar `WALLACE_VALIDACAO_RUNTIME`/conferir `healthBadge`/console.

**Decisão do usuário**: não parar o ritmo por causa disso. Autorizou seguir criando e ligando todos os 7 módulos (script no HTML + `Object.assign` em `app.js` + remoção das chaves do literal antigo) SEM validação individual, documentando exatamente o que foi movido em cada passo, deixando a validação consolidada pra quando ele logar. Instrução explícita: não voltar para auditorias/PIX Geral Vanessa/Caixa Lance/Caixa Boletos nesta frente.

**Executado**: os 7 módulos criados (cópia verbatim de cada fragmento, mesmo padrão de função fábrica de `reg-operacional.js` — chamada só depois que `VARS` já existe, mesmo motivo do `CARTAO_PLUGGY_MAPA_DEFAULT`). `app.js`: 2.897 → **2.644 linhas** (-253). `const REG` virou um literal vazio (`{}`) seguido de 7 chamadas `Object.assign(REG, criarRegXxx())`. Checagem estática (sem navegador, já que não há Node/Python neste ambiente): chaves balanceadas em `app.js` e em cada módulo novo (todos diff 0), as 35 chaves originais do `REG` contabilizadas uma única vez cada entre os 7 módulos. Detalhe módulo-a-módulo (arquivo/chaves/linhas removidas) registrado em `ESTADO_ATUAL.md`, seção 2.7.

**Pendência crítica pra próxima sessão**: validação em navegador ainda não feita (console, 18/18 fases, healthBadge, valores reais por domínio) — é o primeiro passo antes de decidir avançar pra Fase 4 (`VARS`). Nenhum commit feito.

## Bloco 11 — Modularização "MODO V2 ARQUITETURAL" + achados de negócio (07/08/2026, mesma sessão dos blocos 1-10)

Depois do bloco 10 (Mercado Pago fechado), a sessão continuou por muito mais tempo, com 2 frentes grandes novas. Handoff completo desta sessão está em `ESTADO_ATUAL.md` (seções 2-5) — aqui vai só o histórico narrativo, em ordem.

**1) Correção da PIX Geral Vanessa e investigação de Caixa Lance.** Usuário pediu pra investigar por que o painel V1↔V2 mostrava 12 divergências. Achado: 8 das 12 (Manutenção, Aniversário, Eventos, Saúde, Seguro, Combustível, Churrasco, Escola) eram lançamentos `AJUSTE-06-08` escritos direto no Supabase (`wallace_dados`) numa sessão anterior — investigação de origem (quem/quando/rendimento real vs ajuste manual) ficou **inconclusiva**, não decidida, não removida. PIX Geral Vanessa tinha bug real e isolado (2 transações faltando no array de cálculo) — corrigido, aprovado pelo usuário, aplicado. `PGV_SALDO_INICIAL_CICLO` não mexido (usuário recusou, corretamente: o campo `saldo_inicial_ciclo` do banco pra essa caixa está com dupla-contagem confirmada). Caixa Lance investigada, mas reconciliação bloqueada por falta de âncora de fechamento confiável — não forçada.

**2) Painel V1↔V2 reclassificado + botões flutuantes redesenhados.** Painel agora separa "divergência real" de "diferença explicada" (Boletos/Lance/Bens Duráveis, causa já conhecida). Botões `+ Lançar`/`💰 V2`: tamanho padronizado, empilhados, badge fixo em círculo, fecha clicando fora.

**3) Modularização — "MODO MODULARIZAÇÃO" depois "MODO V2 ARQUITETURAL".** Usuário pediu pra continuar a modularização começada numa sessão anterior (só 1 módulo existia: `promocoes-financeengine.js`). Processo em 2 fases:

- **Fase A (módulos autocontidos, sem tocar no núcleo)**: extraídos 10 módulos — `energia-solar.js`, `opcoes-roc.js`, `dashboard-navegacao.js`, `ui-navegacao-basica.js`, `ui-componentes-visuais.js`, `graficos-cenarios-lazy.js`, `graficos-utilitarios.js`, `filtro-livros-razao.js`, `contagem-abas-livros-razao.js`. Descoberta importante nesse processo: nem todo módulo pode carregar DEPOIS do `app.js` (padrão `onload`, usado quando o código só roda via `onclick`/evento) — alguns precisam carregar ANTES (padrão `document.write` estático), porque são chamados em código SÍNCRONO no meio da execução do `app.js` (ex: a IIFE que cria os gráficos do Painel na carga da página, ou o cálculo de ROC/Opções que roda dentro do `VARS`). Confundir os 2 padrões quebra o site.
  - **1 incidente real nessa fase**: um comentário `/* */` mal fechado comentou o resto do `app.js` inteiro (bug silencioso, sem erro de sintaxe óbvio até muito depois no arquivo) — pego pelo usuário via screenshot ("dados sumiram"), corrigido na hora.

- **Fase B (usuário mudou o objetivo)**: depois dos 10 módulos, usuário decidiu que o objetivo não é "reduzir linhas", é "terminar a V2 arquitetural" — `VARS`/`REG` pararem de ser mega-containers, `hydrate()`/`recalcularAgregadosDerivados()` pararem de ser motores únicos. Pedi pra mapear os 4 blocos do núcleo antes de mexer (responsabilidades/dependências/consumidores) — mapa completo apresentado, achado central: `REG.balanco` sozinho lê de 6+ domínios diferentes (não é um domínio, é uma visão cruzada), e `recalcularAgregadosDerivados()` é uma CADEIA (passo N lê resultado do passo N-1), não uma lista de cálculos independentes. Ordem de execução aprovada pelo usuário: **hydrate() → recalcularAgregadosDerivados() → REG → VARS**, nessa ordem, um de cada vez.

  Começou a quebra de `hydrate()` (785 linhas originais) em funções por domínio, sempre carregando ANTES do `app.js` (mesmo motivo do padrão acima — `hydrate()` é chamada de forma síncrona via `onDomPronto(hydrate)` dentro do próprio `app.js`). Extraídos até agora: `hydrate-roc.js`, `hydrate-caixas.js`, `hydrate-patrimonio.js`, `hydrate-indicadores.js`. **`hydrate-metas.js` foi criado e verificado, mas ainda não foi ligado** (nem `app.js` nem o HTML foram editados pra usá-lo) — sessão interrompida nesse ponto exato pra escrever esta passagem de turno. Ver `ESTADO_ATUAL.md` seção 2.3 pros 3 passos exatos de como terminar isso.

  **2 incidentes mecânicos reais nessa fase**, ambos pegos antes de virarem regressão real:
  - Um `sed` com substituição multi-linha colapsou 3 linhas em 1 só, fazendo um comentário `//` "engolir" 2 declarações `const` que o código de baixo precisava (`hydrate-caixas.js`) — corrigido via `Edit` direto, sem depender de `sed` pra blocos grandes de novo.
  - Esqueci de fechar uma função com `}` no fim do arquivo (`hydrate-indicadores.js`) — `SyntaxError: Unexpected end of input`, pego no console do navegador, corrigido na hora.
  
  Por causa desses 2 erros, o usuário pediu um checklist obrigatório antes de testar cada módulo novo daqui pra frente: conferir fechamento de função, chaves balanceadas, nenhum comentário `//` comendo código, variáveis locais que atravessam a fronteira do corte reinseridas onde precisar.

`app.js`: 8.890 → 5.056 linhas (43% menor) nesta sessão. 14 módulos em `src/modules/`. Nenhum commit feito — segue via VS Code com o usuário.

## Bloco 10 — Mercado Pago implementado (competência, não caixa) — fecha o bloco 9 (07/08/2026)

O item 4 do bloco 9 (Mercado Pago/Wärtsilá) estava só revisado, sem aprovação. Usuário aprovou e **acrescentou uma regra nova**: o corporativo do ciclo tem que seguir competência (data real da despesa), nunca o status de pagamento da fatura — "uma viagem corporativa em 26/07 pertence ao ciclo atual mesmo que a fatura anterior tenha sido paga em 04/08".

Isso invalidou a proposta original do bloco 9 (que usava `VARS.reembolsoPagaMPCorporativo`, um número manual por ciclo, não derivado de data real). Investigação nova encontrou a peça certa: `VARS.TRANSACOES_CORPORATIVAS_MP` — array já existente no sistema (criado em outra sessão, V159), cada item com `data` real e `tipo:'corp'`/`'unico'`, já usado num painel de detalhe (LRMP-corp, `app.js` ~linha 4066) pra filtrar por competência — só não estava plugado no cálculo do Balanço.

**Implementado:**
- `REG.balanco.corporativoMPDoCiclo` (novo campo) — soma de `TRANSACOES_CORPORATIVAS_MP` com `tipo==='corp'` e data dentro do período do ciclo atual, mesmo filtro do painel LRMP-corp.
- `REG.balanco.obrigacoes.mercadoPago = mercadoPagoFatura - corporativoMPDoCiclo`, sem `max(0,...)`.
- `balObrWartsila` (HTML) passa a mostrar `corporativoMPDoCiclo`, não mais o acumulado.
- Novo indicador HTML separado (`balReembolsoWartsilaAcumulado`, badge "Só informativo") pro acumulado histórico `faturaMPCorporativoPendente` — não entra em nenhuma conta de ciclo.
- Legenda `legMPCorporativoRetorno` corrigida.
- `VARS.reembolsoPagaMPCorporativo` (cascata do reembolso, domínio separado) **não foi tocado** — fora do pedido.

Com o dado atual do array, valor esperado do Corporativo do Ciclo: **R$266,23** (só `TXMP000011`, 01/08, cai no ciclo 25/07→24/08).

**Não validado em navegador nesta sessão** — nem este item, nem os outros 2 pendentes do bloco 9 (botões flutuantes, Crescimento Patrimonial/Taxa de Poupança). Ver `ESTADO_ATUAL.md`, itens 3-5, pra detalhe.

### Arquivos alterados neste bloco
- `app.js` — `REG.balanco.corporativoMPDoCiclo` novo, fórmula do Mercado Pago líquido trocada, render de `balObrWartsila` corrigido, novo render de `balReembolsoWartsilaAcumulado`, legenda corrigida.
- `Sistema_Wallace_Lira_Completo.html` — nova linha HTML pro indicador acumulado.
- `ESTADO_ATUAL.md`, `PASSAGEM_DE_TURNO.md` — atualizados pra handoff.

## Bloco 9 — Modularização, UI, metodologia do indicador principal, revisão Mercado Pago (07/08/2026)

Depois do fechamento da Fase 2 (bloco 8), a sessão continuou com 4 frentes novas:

**1) Modularização.** Pedido do usuário: dividir `app.js` (8.890 linhas) em módulos, "app.js só como bootstrap". Mapeamento completo feito primeiro (tabela com linhas/dependências/risco/ordem — não repetida aqui, ver o chat ou refazer se precisar). Achado crítico: `VARS`/`REG`/`recalcularAgregadosDerivados()`/`hydrate()` (~4.100 linhas, 46% do arquivo) são um núcleo monolítico que mistura TODOS os domínios — não dá pra recortar em `caixas/`, `patrimonio/` etc. sem redesenhar o motor de dados inteiro. Segundo achado: o próprio código já documenta que `type="module"` quebraria todos os `onclick` inline do HTML — modularização real aqui só pode ser scripts clássicos em sequência, nunca ES modules.

Implementado: **módulo 1** (`src/modules/promocoes-financeengine.js`), as 18 fases FinanceEngine (2D-2V) extraídas, ~1.207 linhas. Carrega via `onload` depois do `app.js` terminar (script dinâmico é `async=true` por padrão — sem o `onload` a ordem não seria garantida). `app.js` caiu pra ~7.700 linhas. **Confirmado em runtime real**: 18/18 fases continuam aprovadas depois da divisão, comportamento idêntico.

**2) UI dos botões flutuantes.** "+ Lançar" e "💰 V2" não ficavam simétricos (o `right` fixo em rem de cada um colava quando o badge de divergência crescia). Corrigido com dock flutuante único via flexbox. **Não validado em navegador ainda.**

**3) Indicador principal — metodologia trocada.** Usuário (citando conselho externo) apontou que "PIB Wallace" media fluxo de caixa e excluía consumo não recorrente — não representa crescimento de riqueza. Verificação confirmou: "Eficiência Financeira" já existente era quase a mesma coisa que a "Taxa de Poupança" pedida, só com receita/despesa incompletas (faltava rendimentos/valorização na receita, consumo não recorrente na despesa). Implementado:
- `REG.pibWallace.taxaPoupancaPct`/`.poupancaRS` — receita e despesa **completas**, sem excluir nada.
- `REG.pibWallace.crescimentoPatrimonialPct`/`.RS` — precisa de patrimônio do fechamento do ciclo anterior; **começou a persistir agora** (`patrimonioLiquido` adicionado ao payload de `registrar_pib_mensal`) — só aparece a partir do próximo ciclo fechado.
- PIB Wallace antigo: cálculo/persistência intactos, virou `<details>` recolhido (não apagado).
- HTML (seção 10) redesenhada com 2 cards novos + o antigo recolhido.
- **Não validado em navegador ainda.**

**4) Mercado Pago / Reembolso Wärtsilá — só revisão, SEM implementar.** Usuário reportou valores errados nos cards "Mercado Pago líquido" e "Corporativo Mercado Pago (ciclo atual)". Regra de negócio nova pedida: nunca misturar dado do ciclo atual (25→24) com acumulado de reembolso pendente. Revisão confirmou:
- `VARS.faturaMPCorporativoPendente` (R$1.544,11) = acumulado histórico, NÃO escopado ao ciclo — usado incorretamente em 2 lugares (`REG.balanco.obrigacoes.mercadoPago`, linha ~3056; `hydrate()` `balObrWartsila`, linha ~4873).
- `VARS.reembolsoPagaMPCorporativo` **já existe e já é cycle-scoped** — é o campo certo pro "Corporativo do Ciclo", só não está conectado ainda.
- Proposta apresentada ao usuário (fórmula `mercadoPagoFatura - reembolsoPagaMPCorporativo`, sem `max(0,...)`; `faturaMPCorporativoPendente` vira indicador separado, só informativo). **Aguardando aprovação — nada foi codificado.**

### O que NÃO foi feito

- Módulos 2+ da modularização (energia-solar-config, inbox-conciliacao, busca-global, gráficos, cenários, ciclo).
- Validação em navegador dos itens 2 e 3 acima (botões, Crescimento Patrimonial/Taxa de Poupança).
- Implementação do item 4 (Mercado Pago) — só a revisão, esperando aprovação.
- Nenhum commit.

### Arquivos alterados neste bloco

- `app.js` — módulo 1 extraído (removidas ~1.207 linhas), botões (dock flutuante), novos campos `REG.pibWallace.*` (taxa de poupança/crescimento patrimonial), RPC `registrar_pib_mensal` expandida.
- `src/modules/promocoes-financeengine.js` — **novo arquivo**, as 18 fases FinanceEngine.
- `Sistema_Wallace_Lira_Completo.html` — carregamento do módulo novo (`onload` chain), seção 10 redesenhada (Crescimento Patrimonial + Taxa de Poupança + PIB Wallace recolhido), guard de login corrigido (já era de um bloco anterior, `localStorage`→`sessionStorage`).
- `ESTADO_ATUAL.md`, `PASSAGEM_DE_TURNO.md` — reescritos pra handoff.

## Bloco 8 — FECHAMENTO DA FASE 2 (07/08/2026)

Estado oficial consolidado, sem nova auditoria/investigação:

**39 componentes implementados** (18 blocos FASE, 2D-2V). **10 confirmados em fallback** (FASE 2F, runtime real: `0/10`). **29 implementados, aguardando confirmação mecânica de runtime** (não é pendência de investigação).

**Congelado**: Caixa Boletos (causa conhecida — corte de ciclo — fora de escopo por decisão), `VARS.livroLRC` (array/cascata), `cartao_id`/`usuario_id`, schema `investimentos`.

**Explicado, sem ação**: Caixa Bens Duráveis (déficit inicial conhecido, R$355,00) e Caixa Lance (`LREI0003`, R$266,23, ressarcimento via Wärtsilá) — fechados do ponto de vista de negócio. Continuam dentro do fallback confirmado da FASE 2F, por causa raiz separada (corte de ciclo), não relacionada ao déficit/LREI.

**FinanceEngine operacional**: definição e escopo final registrados em `ESTADO_ATUAL.md`, seção "FinanceEngine operacional — definição final". Fase 2 encerrada nesta sessão.

Arquivos atualizados: `ESTADO_ATUAL.md` (reescrito), `MAPA_MIGRACAO_V2.md` (nota de fechamento), `PASSAGEM_DE_TURNO.md` (este bloco). Nenhum código alterado, nenhuma fase nova, nenhuma investigação aberta.

## Bloco 7 — reconciliação com extratos reais + correção de contexto (regras de negócio)

Usuário enviou 7 extratos originais (Bradesco Visa Infinite jun/jul, Bradesco conta corrente, 3 extratos Mercado Pago cobrindo jun-ago) como fonte de verdade, pedindo reconciliação das caixas divergentes. Cruzamento revelou: a transação de R$1.986,21 em Caixa Boletos e a de R$266,23 em Caixa Lance, ambas datadas 24/07/2026, batem exatamente com os diffs vistos no painel Supabase relacional — confirmando que **para Boletos** a causa raiz é o corte de ciclo hardcoded (`CICLO_ATUAL_INICIO = '2026-07-24'`, `FinanceService.js:38`).

Simulação controlada (sem alterar arquivos) testando trocar `2026-07-24`→`2026-07-25` em todos os pontos da FASE 2F: **Boletos zera a diferença (confirma a hipótese)**, mas **as outras 9 caixas do lote piorariam** (Lance principalmente — a caixa tem múltiplas transações por dia, cortar só a data de 24/07 remove mais dinheiro do que deveria). Resultado simulado: 0/10 → 1/10 aprovariam. **Não é uma correção uniforme viável** — precisaria ser por caixa, não uma troca global de data.

**Correção de contexto do usuário, importante para não reabrir como bug**:
- **Caixa Bens Duráveis (V2 = -R$355,00)**: NÃO é anomalia. É déficit inicial conhecido — a caixa nasceu propositalmente negativa (fone de ouvido + aparador de pelos, R$355,00, sem fundo acumulado prévio). Reclassificado, não investigar mais.
- **Caixa Lance (diferença de R$266,23)**: NÃO é erro nem perda. É um LREI — Lance emprestou R$266,23 pra cobrir a fatura Mercado Pago, com obrigação de ressarcimento pelos reembolsos da Wärtsilá. Reclassificado como crédito a recuperar.

Ambas reclassificações são só de documentação/interpretação — nenhum código foi alterado.

## Bloco 6 — instrumentação temporária de validação runtime (nenhuma fase nova)

Usuário confirmou em navegador real que a FASE 2F reprova (0/10). Pediu instrumentação uniforme das 18 fases (2D-2V) pra descobrir quantas realmente aprovam em runtime — **sem criar FASE 2W/3, sem tocar UI, sem nenhuma promoção nova**.

**Implementado**: 1 helper (`registrarValidacaoFase(fase, aprovado, motivo)`) logo antes da FASE 2D, empilhando cada resultado em `window.WALLACE_VALIDACAO_RUNTIME` e logando `[FASE XX] APROVADA/REPROVADA — motivo`. Cada uma das 18 fases ganhou 1-2 linhas extras (chamando o helper no ponto onde já decidia `aprovado`) — nenhuma lógica de negócio, nenhum gate, nenhuma fórmula foi alterada. No fim da FASE 2V, um resumo automático roda: `console.table(window.WALLACE_VALIDACAO_RUNTIME)`.

**Como ler o resultado real**: abrir o site no navegador, abrir o console (F12), recarregar a página, e ver a tabela final `[VALIDAÇÃO RUNTIME] Resumo completo das 18 fases`. Ou digitar `window.WALLACE_VALIDACAO_RUNTIME` a qualquer momento depois do carregamento.

**Eu não tenho como rodar isso neste ambiente** (sem navegador/Node) — a tabela real só existe depois que você abrir o site. Marcado como **TEMPORÁRIO** no próprio comentário do código — remover depois da validação, não é uma peça permanente da arquitetura.

## Bloco 5 — varredura completa das 46 funções exportadas do FinanceEngine

Usuário recusou considerar a fila esgotada de novo e pediu varredura de TODA função exportada em `src/services/FinanceEngine.js`: já ligada? testada? promovível sem schema/`cartao_id`/`usuario_id`/Boletos?

| Função | Já ligada? | Pode ser promovida? |
|---|---|---|
| `calcularIdade` | Não | Sim — cópia fiel de app.js:2860 |
| `calcularPatrimonio` | Não | Sim, com gate condicional — 🟡 conhecido (override Financiamento Casa), mas mesmo padrão de segurança de sempre decide em runtime |
| `calcularLiquidoMes` | Não | Sim, mas com padrão novo — substitui o corpo da função `liquidoMes(i)` (chamada em 5 pontos), não escreve 1 campo |
| `calcularAtivoPassivoLiquido`, `somarCampo`, `calcularSaldoAbertoReembolsos`, `calcularCreditoLiquidoMedidor` | Não | Não — helpers genéricos pro `src/services/*Service.js` (array-shape do Supabase), sem ganho direto sobre `app.js` sem reconstruir um fetch novo |
| `calcularVisaTotalComprometido` | Não | Não — depende de `VARS.livroLRC` (array represado), risco de timing mantido por cautela |
| `getDisponibilidade`, `getPercentualFioB`, `aplicarTributosPorDentro` | Não (diretamente) | Não — helpers internos, já usados dentro de `calcularContaComSolar`, que já está promovido |
| `classificarStatusROC` | Não (diretamente) | Não — já usada indiretamente via `calcularROCPosicao`/`calcularROCConsolidado` (FASE 2S) |
| (demais 32 funções) | Sim | — |

**3 implementadas**: FASE 2T (idade), FASE 2U (Balanço completo, gate condicional), FASE 2V (`liquidoMes(i)`, primeira promoção de função em vez de campo — validada nos 12 índices do cenário antes da troca). Mesmo padrão de segurança: Comparator confirma zero divergência antes de qualquer escrita/troca; se divergir, V1 permanece intocado. Comparator não pôde ser executado ao vivo neste ambiente. Sintaxe: balanço manual de chaves/parênteses/colchetes conferido (137/137, 375/375, 48/48).

**39 componentes/funções conectadas** (36 anteriores + 3). Fila verde esgotada de novo, confirmado por varredura completa desta vez (46 funções exportadas, todas classificadas).

## Bloco 4 — "MODO ACELERAÇÃO": Livro LRC e ROC/Opções liberados pontualmente

Depois do fechamento da Fase 2 (bloco 3, "FinanceEngine operacional" aceito), o usuário liberou Livro LRC e ROC/Opções especificamente pra análise e promoção do que estivesse pronto sem tocar schema/migração/histórico. Achados:

| Item | Pronto? | O que faltava |
|---|---|---|
| Livro LRC — total exibido (`REG.livrosRazaoTotais.LRC.total`) | Sim | Só escrever a IIFE — função e entradas (2 escalares já confirmados) já existiam. **Diferente** do `VARS.livroLRC` (array/cascata), que continua represado. |
| Opções — Valor de Mercado Consolidado | Sim | Idem — só escrever a IIFE, sem schema. |
| Opções — Dias Operação / Status / ROC posição / ROC consolidado | Sim, com adaptação | Converter datas BR pra ISO antes de chamar `calcularDiasOperacao`; `classificarStatusROC` do FinanceEngine devolve string, não objeto {label,emoji,classe} — reconstruído com mapa fixo pra não quebrar a UI. |
| `comparacaoCDI` (função dedicada) | Não | 🟡 — é 1 divisão trivial, mas nunca foi extraída como função separada do FinanceEngine (reaplicada inline, sem comparator dedicado, reaproveitando `rentabilidadeMensal` já validado). |
| `statusPosicao`/`vencida` | Não | 🔴 — lógica de decisão, não é fórmula, baixo valor. |
| Migração pra tabela `investimentos` (schema) | Não | 🔴 — bloqueador estrutural real (schema sem strike/prêmio/vencimento), não depende de decisão. |

**3 novas fases implementadas**: FASE 2Q (Livro LRC total), FASE 2R (Valor de Mercado Consolidado), FASE 2S (ROC posições + carteira). Mesmo padrão de segurança de sempre — Comparator confirma zero divergência antes de escrever, fallback automático pro V1. Comparator não pôde rodar ao vivo (sem navegador/Node neste ambiente); validação de sintaxe foi manual (chaves/parênteses/colchetes balanceados: 97/97, 265/265, 35/35).

**Fila verde esgotada de novo** — nenhum item 🟢+testado+sem dependência restante depois desses 3.

## Bloco 1 — aplicação da FASE 2M (pacote externo)

O usuário anexou `Passagem de turno_Code.zip` (pacote de uma sessão de chat anterior). Diff contra o `app.js` real mostrou que as FASES 2F-2L já estavam aplicadas; só faltava a **FASE 2M** (Domínio 4: `totalOpDetalhe.recorrencias`/`.assinaturas`), inserida no mesmo ponto do pacote. `app.js` ficou byte-idêntico ao pacote depois disso. `ESTADO_ATUAL.md`/`MAPA_MIGRACAO_V2.md` atualizados. Revisado e aprovado pelo usuário nesta sessão (diff resumido apresentado, checklist de itens confirmados, sem alteração em Livro LRC/Boletos/ROC/Opções). **Sem commit** — usuário commita via VS Code.

## Bloco 2 — diagnóstico e "MODO FECHAMENTO" (mesma sessão)

Usuário pediu diagnóstico completo do que faltava pra declarar a migração encerrada. Levantamento contra o código real (não só a documentação) achou:
- Um segundo mecanismo V1↔V2 **separado**, não documentado no `MAPA_MIGRACAO_V2.md`: painel "Arquitetura V2" via Supabase relacional (`rpc_dashboard_resumo()`), responsável pelos 12 alarmes que o usuário viu na tela (Caixa Boletos, Caixa Lance, Bens Duráveis etc. com diffs grandes). **Não faz parte do FinanceEngine** — registrado como pendência de decisão, não investigado a fundo (instrução do usuário: sem mais investigação de Supabase).
- Gaps reais entre "função 🟢 na matriz" e "função realmente chamada no `app.js`": Caixa Variável (tetoEfetivo/folegoAteTeto), Projeto Casa Nova, Escola de Júlio % (domínio 3), e o domínio 9 inteiro (ROC/Opções, congelado por instrução).

Usuário respondeu com "MODO FECHAMENTO": autorizou implementar direto, sem mais paradas, tudo que for 🟢 + testado + sem dependência de Livro LRC/Caixa Boletos/`cartao_id`/`usuario_id`/ROC/Opções/schema novo.

## Bloco 3 — execução (3 itens promovidos, mesma sessão)

| Fase | Item | Resultado |
|---|---|---|
| FASE 2N | Caixa Variável — `tetoEfetivo`/`folegoAteTeto` | Comparator embutido no bloco (roda no boot real do navegador); cópia fiel da fórmula já usada pra `.disponivel` (mesma função `calcularCaixaVariavel`, mesmas entradas, `comprometidoParaTeto === comprometido` confirmado no código) — divergência esperada zero por construção. |
| FASE 2O | Projeto Casa Nova (capital disponível, %, falta) | Idem — mesmas entradas do V1 (`VARS.btgNecton`, `VARS.caixaLance`, `REG.projetoCasaNova.metaLance`), cópia fiel, divergência esperada zero. |
| FASE 2P | Escola de Júlio % da meta | Idem — mesmas entradas (`VARS.escolaJulioSaldo`, `VARS.metaEscolaJulio`), cópia fiel, divergência esperada zero. |

Todas seguem o padrão de segurança de todas as fases anteriores: só escrevem em `REG` se `WallaceComparator` confirmar `totalDivergente === 0`; se divergir, cai automaticamente no valor V1 e loga `[WARN]` no console — nunca quebra a tela. **Comparator não pôde ser executado ao vivo neste ambiente** (sem navegador/Node disponível) — a validação real acontece no boot do site; recomendado conferir o console na próxima sessão com navegador (`[FASE 2N]`, `[FASE 2O]`, `[FASE 2P]`, todos esperados "X/X" sem `[WARN]`).

**Depois desses 3, não sobrou nenhum item 🟢-testado-sem-dependência implementável** — conferido item a item contra a matriz completa (ver `ESTADO_ATUAL.md`, seção "Itens 🟢 restantes verificados"). O que resta é 🟡/🔴 por natureza, ou congelado por instrução explícita (Livro LRC, Caixa Boletos, `cartao_id`/`usuario_id`, ROC, Opções, schema Supabase).

## Estado consolidado da migração V1→V2 (FinanceEngine) ao final desta sessão

| Domínio | Status |
|---|---|
| 1. Caixas | 11/12 saldos + Caixa Variável completa (disponível/teto/fôlego) — só Boletos fora (congelado) |
| 2. Reembolsos/Cascata | 2/6 itens — resto depende de Livro LRC (congelado) ou é cascata não migrada (🔴) |
| 3. Patrimônio/Balanço | 6/9 itens — resto é Financiamento Casa (🟡) ou Consórcio Casa Nova trivial não extraído (🔴) |
| 4. Cartões/Livros Razão | 1 item — resto depende de Livro LRC/`cartao_id`/`usuario_id` (congelado) |
| 5. Indicadores/PIB Wallace | 4/4 completo |
| 6. Necessidade/Modo Operacional | 2/5 itens — resto é parcial (🟡) ou trivial não extraído (🔴) |
| 7. Energia Solar | 5/5 completo |
| 8. P2P | 1/1 completo |
| 9. Opções/ROC | Congelado — 0 tocado |

**36 componentes reais rodando via FinanceEngine** (30 até FASE 2M + FASE 2N/2O/2P + FASE 2Q/2R/2S). V1 nunca foi apagado em nenhum deles.

## O que NÃO foi feito

- Nenhum commit/push — segue só com o usuário via VS Code.
- Nenhuma investigação do painel Supabase relacional (12 alarmes) — fora do escopo, registrado como pendência de decisão.
- `VARS.livroLRC` (array/cascata), Caixa Boletos, `cartao_id`/`usuario_id`, migração pro schema `investimentos` — continuam intocados (represados ou bloqueados estruturalmente).
- `comparacaoCDI` (função dedicada) e `statusPosicao`/`vencida` — não extraídos, baixo valor/sem função pronta.

## Pendências que dependem de decisão do usuário

1. Caixa Boletos — falta o saldo real de abertura do ciclo (25/07).
2. `VARS.livroLRC` (array/cascata de reembolso) — reabrir ou continuar represado.
3. Painel "Arquitetura V2" via Supabase relacional — 12 divergências ativas na última checagem visual, mecanismo separado do FinanceEngine, mesmo nome "V2".
4. UI dos botões flutuantes ("+ Lançar" / "💰 V2") — pedido de melhoria estética foi pausado a meio caminho (revertido, `app.js` ficou limpo) quando o usuário priorizou o fechamento funcional. Ainda pendente, se quiser retomar.
5. Commit — via VS Code, com o usuário.

## Arquivos alterados nesta sessão

- `app.js` — FASE 2M aplicada (bloco 1); FASE 2N/2O/2P (bloco 3); FASE 2Q/2R/2S (bloco 4); FASE 2T/2U/2V (bloco 5). Nenhuma alteração de UI/CSS permaneceu (revertida).
- `ESTADO_ATUAL.md` — reescrito refletindo o estado final pós-FASE 2V.
- `MAPA_MIGRACAO_V2.md` — linhas de tetoEfetivo/folegoAteTeto, Projeto Casa Nova, Escola de Júlio %, Livro LRC (total), 4 itens de ROC/Valor de Mercado, Balanço completo e idade marcadas como conectadas.
- `PASSAGEM_DE_TURNO.md` — este arquivo, atualizado cobrindo os 5 blocos da sessão.
