# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 16/08/2026, continuação do bloco 18 (usuário liberou trabalho autônomo — "pode continuar, eu vou tomar banho e dormir"). Resumo: sessão dedicada a uma **auditoria de 9 agentes em paralelo** — 21 achados de bug (todos corrigidos/reclassificados, ver seção 1) + um inventário separado de "dado disfarçado de texto" (Grupo A, Prioridade 0 do usuário). Bugs: lote 1 (`4e5fd1a`), lote 2 (`b4d3e45`) e lote 3/achados #4+#18 (`e3dcf30`) já commitados e publicados. **Grupo A**: 7 dos ~9 achados de confiança alta/média implementados nesta continuação, ainda **não commitados** — ver seção "Estado imediato" abaixo.

## ⚠️ Estado imediato ao reabrir a sessão (ler antes de qualquer coisa)

**Há trabalho terminado e não commitado na working tree** (`git status` vai mostrar ~10 arquivos modificados — `Sistema_Wallace_Lira_Completo.html` + vários `src/financeiro/**`/`src/dashboard/charts/graficos-cenarios-lazy.js`).

Esse diff é o **Grupo A do inventário de hardcode** (seção 1.5 abaixo), 7 dos 9 achados de confiança alta/média — está **completo e coerente**, só falta revisar com o usuário e commitar. **Avisar o usuário do conteúdo antes de rodar `git commit`**, mesmo com autorização permanente (regra do manual, seção 8). **Não foi validado em navegador real** (sem credenciais de login disponíveis nesta continuação autônoma) — só revisão de código/sintaxe manual. Testar no painel ao vivo antes ou logo depois de commitar, em especial: aba Energia Solar (cards do Fluxo de Energia "Wallace"/"Wellida", título da seção 05 "Rateio Solar", card Fio B da seção 06), aba Balanço (linha "Consórcio da Casa"), Livro Razão Bens Duráveis (callout "Aporte alvo"), card ECC (seção 07 do Painel), Estimador de Salário (tabela "Fórmula exata"), e os textos "fica em casa"/"Não trabalha"/"Piso mínimo garantido" da aba Cenários.

## 1. Auditoria de 9 agentes (15-16/08/2026) — status

### 1.1 Lote 1 — commitado e publicado (`4e5fd1a`, 11 de 21 achados)
Corrigidos e no `origin/main`:
- Painel: data da fatura MP deixou de ser texto congelado (`hydrate-mercado-pago.js`).
- Gráficos: donut `g_cVisa` (seção 02) passa a combinar Visa+MB — o gráfico de barras irmão já tinha sido corrigido em 26/07, o donut tinha ficado pra trás.
- Energia Solar: `usinaAindaGerandoHoje` passa a usar o helper de fuso Brasília (era hora local da máquina); constante morta `solarGeracaoDiariaEstimada` removida.
- Cenários: "Superávit projetado" passa a usar Necessidade Líquida (usava Bruta, dessincronizado desde correção de 12/08); texto do ciclo encerrado (25/06-24/07) e desvio padrão (44,7%→~46,2%) recalculados/dinâmicos; valor R$8.109,64→74 corrigido em `vars-operacional.js`.
- Estimador de Salário: badge "Modo Normal" fixo vira modo real (`Crítico`/`Baixo`/`Normal`/`Alto`).
- Home: race condition corrigida — `aplicarOnda4Patrimonio()` agora avisa `hydrateResumoP2P()` depois de promover V2 (os 3 KPIs da Home podiam ficar presos em V1 se a busca de P2P terminasse primeiro).
- WWI: fallback do KPI "Projeto Casa Nova" corrigido (comparava tipo errado, nunca funcionava); gráfico passa a parear 2 séries por competência, não por posição no array.
- Emagrecimento: aviso não diz mais "sem meta definida" quando a meta de 110kg já existe.

Ver mensagem completa do commit (`git show 4e5fd1a`) para a lista exata.

### 1.2 Lote 2 — commitado e publicado (`b4d3e45`, +2 achados, 13 de 21 no total)
- **Título "Jul/26 a Mar/27" congelado** (achado #3, Gráficos seção 06 + Painel, 3 pontos) — `Sistema_Wallace_Lira_Completo.html` ganhou `<span id="labelUltimoCicloEvolucao1/2">`/`<span id="labelJanelaEvolucao12M">`; `hydrate-resumo-cartoes.js` calcula a janela real de 12 ciclos localmente.
- **Balanço — 9 colunas de `vw_patrimonio_v2` nunca lidas** (achado #9: casa/apartamento/jazigo/solar/carro/pgbl/fgts/consórcio-casa-pago) — `hydrate-onda4-patrimonio.js` agora popula `REG.balanco.fisico.*`, `REG.balanco.pgbl`, `REG.balanco.fgts`, `REG.balanco.financeiro.consorcioCasaPago` a partir da V2, e recalcula `bfin.total`/`ativosTotal`/`patrimonioTotalGeral` a partir desses componentes. Também dá rede de sincronização real a `balFinanceiroTotal` (achado #8), que antes não tinha nenhuma.

### 1.3 Lote 3 — commitado e publicado (`e3dcf30`, achados #4 e #18, 15 de 21 no total)

**#4** — Energia Solar tinha 2 fórmulas diferentes pro mesmo conceito ("crédito líquido estimado pra hoje"): a Previsão (Fluxo 1) já usava `VARS._creditoLiquidoProjetadoHoje` (dia a dia real do robô SAJ, com average só de fallback pontual), mas o card "📊 Estimativa pra hoje" (Unidade Geradora) recalculava com a fórmula antiga, só de média achatada. `graficos-cenarios-lazy.js` corrigido pra reaproveitar a mesma projeção.

**#18** — `liquidoSemTrabalhar` (Cenários, gráfico "Piso mínimo garantido") era literal hardcoded (R$8.109,74), tinha escapado da migração de 7 constantes do Déficit Zero pro Supabase feita em 14/08. Corrigido em 2 passos:
1. **Dado**: adicionado campo novo `irrfSemPericulosidade` (R$1.738,56) dentro de `parametros_gerais.taxasHoraFolhaPontoWartsila` — o IRRF do cenário "não trabalha" é diferente do IRRF já existente ali (`irrfBaseSemAdicionais`, R$2.639,04), que é especificamente o do cenário COM Periculosidade. Escrito direto no Supabase (JSONB aditivo, mesmo padrão da migração original), com `set_config('audit.origem', ...)` antes.
2. **Código**: `reg-operacional.js` (`REG.deficitZero.liquidoSemTrabalhar`) agora calcula a partir de `VARS.taxasHoraFolhaPontoWartsila` em vez do literal — mesma metodologia documentada (Base+Supervisão+Creche−INSS−IRRF−Saúde/Dental−PGBL), com fallback pro literal antigo se o boot da V2 falhar. `graficos-cenarios-lazy.js` só passou a ler o valor já calculado (não duplica a fórmula).

**#5 investigado e RECLASSIFICADO, sem alteração de código** — a suspeita original era "o link público pula uma trava de 10 dias que o painel privado respeita". Investigação achou que essa trava (`LIMITE_DIAS_DESCOMPASSO_SEGURO`, `graficos-cenarios-lazy.js`) depende de `ultimaSolar.geracaoAcumuladaData`, campo que **nunca é populado em lugar nenhum do sistema** (é sempre `null`, ver `app.js` linha ~1330 — "não existe em energia_solar_leituras (V2), nunca fabricado"). Ou seja: a trava está adormecida também no painel privado, não é um mecanismo funcional que o público esteja pulando. Copiar o mesmo gate morto pro `solar-compartilhado.html` não protegeria nada de verdade — decisão de NÃO fazer isso, documentar como achado corrigido (a premissa do achado original estava errada) em vez de "consertar no escuro". Se o usuário quiser essa trava funcionando de verdade em algum momento, precisa de uma fonte real pra `geracaoAcumuladaData` — isso é trabalho novo, não retomar sem pedido explícito.

**#5 investigado e RECLASSIFICADO, sem alteração de código** — a suspeita original era "o link público pula uma trava de 10 dias que o painel privado respeita". Investigação achou que essa trava (`LIMITE_DIAS_DESCOMPASSO_SEGURO`, `graficos-cenarios-lazy.js`) depende de `ultimaSolar.geracaoAcumuladaData`, campo que **nunca é populado em lugar nenhum do sistema** (é sempre `null`, ver `app.js` linha ~1330 — "não existe em energia_solar_leituras (V2), nunca fabricado"). Ou seja: a trava está adormecida também no painel privado, não é um mecanismo funcional que o público esteja pulando. Copiar o mesmo gate morto pro `solar-compartilhado.html` não protegeria nada de verdade — decisão de NÃO fazer isso, documentar como achado corrigido (a premissa do achado original estava errada) em vez de "consertar no escuro". Se o usuário quiser essa trava funcionando de verdade em algum momento, precisa de uma fonte real pra `geracaoAcumuladaData` — isso é trabalho novo, não retomar sem pedido explícito.

### 1.4 Status dos 21 achados originais de bug — todos fechados
Dos 20 achados reais de bug (1-19, mais #20 que já era "confirmação boa, sem ação"), todos os 19 foram corrigidos ou investigados e formalmente reclassificados nesta sessão (lote 1 + lote 2 + lote 3). **Nenhum achado de bug/inconsistência da auditoria original segue pendente.**

### 1.5 Grupo A do inventário "dado disfarçado de texto" — 7 de 9 achados implementados, NÃO commitado ainda
Achado paralelo de um agente de inventário dedicado (rodado nesta continuação, ver bloco 18 parte 3 do `PASSAGEM_DE_TURNO.md` pro relatório completo) — usuário pediu **"Grupo A agora"** como Prioridade 0. O agente listou 9 itens de confiança alta/média (com fonte viva já confirmada por código lido) + 3 duvidosos (sem fonte viva confirmada, deixados de fora por falta de evidência). **Implementados** (ver "Estado imediato" no topo pra lista de arquivos):
1. Rateio Solar "71%/29%" hardcoded em 4 pontos → `Sistema_Wallace_Lira_Completo.html` ganhou `id`s, `graficos-cenarios-lazy.js` popula de `VARS.solarRateioWallace/Irma`.
2. "2 parcelas pagas" (Consórcio da Casa, Balanço) → `id` novo + `hydrate-balanco.js` lê `VARS.consorcioCasaParcelasPagas`.
3. Tabela "Fórmula exata" do Estimador de Salário — só INSS e Saúde/Dental corrigidos (os únicos com **drift real já confirmado**: HTML dizia R$382,67, `parametros_gerais` real é R$413,15). Percentuais de taxa (Periculosidade 30%/Supervisão 5%/PGBL 6%) e a constante de dedução do IRRF (R$908,73, parcela fixa da tabela progressiva) deixados como estão — são constantes de lei/fórmula, não fato pessoal que dessincroniza, `taxasHoraFolhaPontoWartsila` não tem campo equivalente pra eles.
4. Fio B "16,8%/83,2%" (Energia Solar, card residual pós-solar) → calculado de `VARS.FIO_B_COBRANCA_2026_PCT × FIO_B_PCT_DA_DISTRIBUICAO`, vai se atualizar sozinho quando o cronograma da Lei 14.300 subir a cobrança (75% em 2027).
7. "Aporte alvo R$250,00/mês" (callout Livro Razão Bens Duráveis) → `id` novo + `hydrate-caixas.js` lê `VARS.BENS_DURAVEIS_APORTE_MENSAL_ALVO` (mesma fonte já usada 2 linhas acima no card irmão).
8. "R$2.000" (teto da Caixa Variável, texto do card ECC) → `id` novo + `hydrate-simulador-ciclo.js` lê `VARS.tetoOficial`.
9. 3 legendas (`legCenarioFicaEmCasa`/`legPisoSemTrabalhar`/`legDeficitSemEmbarque`) migradas pro padrão dinâmico já usado nas outras 4 legendas calculadas do mesmo arquivo — `REG.deficitZero` ganhou campo novo `pisoGarantidoTrabalhando` (mesma metodologia de `liquidoSemTrabalhar`, mas COM Periculosidade).

**Não implementados** (mais arriscados sem validação em navegador — deixados para quando o usuário puder revisar):
5. Cluster `CAIXAS_OPERACIONAIS_INFO` (9 notas de tooltip do gráfico "Caixas Operacionais", `graficos-cenarios-lazy.js:444-456`) — percentuais "X% da meta" deveriam derivar de `REG.caixasOperacionais.<chave>.saldo/.meta` em vez de string fixa.
6. Cluster `alivioEventos` (marcos do gráfico "Alívio de pressão", mesma arquivo:514-517) — datas dos marcos ("14/09", "01/11") são índices fixos calculados a mão, deveriam vir de `calcularAporteIncrementalPorCiclo()`.

**3 itens duvidosos, sem ação** (agente sinalizou baixa confiança, sem fonte viva confirmada): texto da Conta Vivo "R$523→R$435" (fonte viva não existe hoje, precisaria ser criada), nota histórica da transação Tokio Marine R$266,23 (fato passado, não "dado que muda"), tarifa "R$1,0625/kWh Jun/2026" (âncora histórica intencional de comparação, correta como está).

**Validação**: revisão de código/sintaxe feita manualmente (sem `node` disponível pra `--check`). **Sem validação em navegador real** — sem credenciais de login disponíveis nesta continuação autônoma. Testar no painel ao vivo antes ou logo depois de commitar (ver lista de telas na seção "Estado imediato" no topo).

Grupo B (rótulos fixos de interface, 600-700 strings) segue explicitamente fora de escopo — decisão separada, não retomar sem pedido novo.

## 2. Incidente técnico da sessão (resolvido, sem perda de dado)
Durante o `git push` do lote 1, um rebase foi interrompido pelo Google Drive (mesma classe de problema da regra 6 abaixo, mas desta vez um arquivo de trabalho — `hydrate-emagrecimento.js` — sumiu do disco durante a operação, restando só um `desktop.ini`). Diagnosticado: o `HEAD` local tinha o commit completo, só a working tree ficou corrompida pelo rebase cortado. Recuperado com `git checkout HEAD -- .` (restauração total a partir do commit), rebase repetido com sucesso, push concluído (`4e5fd1a` está em `origin/main`, confirmado). Não é uma regressão da correção da regra 6 (essa foi sobre `.git/` sendo indexado pelo Drive) — é um caso novo (interrupção de rebase por I/O do Drive na working tree), mas mesma causa raiz de fundo. Se se repetir, mesmo procedimento de recuperação: `git status` pra confirmar HEAD íntegro, depois `git checkout HEAD -- .`.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **RESOLVIDO NA RAIZ 15/08/2026 — Google Drive sincronizando `.git/`.** `.git` real movido pra `C:\Users\WLI015\.git-repos\Site.git` (ponteiro de 1 linha no repo). Local à máquina `WLI015`; máquina nova precisa de `git clone` novo. Ver seção 2 acima pra um incidente relacionado (mas distinto) ocorrido nesta sessão.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (seção 1.3.5 do manual). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre, em qualquer caixa.
9. **Procedimento de baixa da fatura**: `UPDATE` na MESMA linha de `transacoes` (`afeta_saldo_real` false→true). Nunca criar uma segunda transação.
10. **Nenhuma constante financeira nova deve nascer hardcoded no `.js`** se já existe (ou faz sentido existir) lugar correspondente em `parametros_gerais`/`indicadores`.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI**, mas continua FORA da fórmula do Painel Executivo/Balanço — 2 contextos intencionais.
12. **Inbox Financeira DESATIVADA DA UI** (pedido do usuário) — sincronização continua rodando por baixo. Não reativar sem pedido explícito.
13. **Leitura manual de `energia_solar_leituras` sempre usa a data/hora REAL da foto**, nunca "hoje" no momento de gravar.
14. **Medidor solar DDSU666: modelo certo (313270) só libera 25/08/2026.** Não sondar API antes dessa data.
15. **WWI (Wallace Wealth Intelligence) congelado funcionalmente, em período de observação** desde 15/08/2026. Ver `docs/decisions/WWI_ROADMAP_V1.md`. Não abrir fase nova sem evidência real de divergência ou pedido explícito.
16. **NOVO 15-16/08/2026 — Auditoria de 9 agentes achou 21 bugs/inconsistências reais no painel — TODOS os 20 achados de bug já corrigidos ou reclassificados e publicados** (lotes 1+2+3, `4e5fd1a`/`b4d3e45`/`e3dcf30`). O inventário paralelo de hardcode (Grupo A, Prioridade 0 do usuário) teve 7 de 9 achados de alta/média confiança implementados, **ainda não commitados** (seção 1.5 — diff pronto na working tree, revisar/testar/commitar). Faltam só os 2 clusters mais arriscados (notas de gráfico calculadas a mão) + Grupo B (fora de escopo). Não repetir a varredura dos 9 agentes nem o inventário do zero.

## 3. Pendências abertas de sessões anteriores (sem mudança nesta sessão)

### 3.1 Instalação física do medidor solar — TROCA DE MODELO, só libera 25/08/2026
Modelo errado (313269, sem RS485) instalado; modelo certo (313270) chega 25/08/2026.

### 3.2 Inbox Financeira — ~144 Pluggy + 13 MP não processados
Precisam de revisão caso a caso. Não automatizar às cegas.

### 3.3 R$340,00 do ciclo Wärtsilä 2026-07 ainda não confirmados como recebidos
Não é a mesma coisa que as TEDs já lançadas (`TX000220`/`TX000280`).

### 3.4 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente.

### 3.5 Backlog técnico adiado (decisão consciente do usuário)
Lint dos ~91 módulos `hydrate-*`; previsão de geração solar por irradiância.

## 4. Protocolo de sessão nova

1. Este arquivo primeiro, depois o bloco 18 (mais recente) de `docs/changelog/PASSAGEM_DE_TURNO.md` pro passo a passo completo da auditoria.
2. `git status` **antes de qualquer coisa** — há diff real pendente de revisão/commit (seção "Estado imediato" no topo deste arquivo).
3. Retomar pela seção 1.5 acima — diff do Grupo A pendente de testar/revisar/commitar. Depois disso, o que resta é opcional/baixa prioridade: os 2 clusters não implementados (achados #5/#6 do inventário) ou parar por aqui — o essencial da auditoria já está fechado.
4. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: Google Drive sincronizando `.git/` de novo — ver regra 6. Se o problema for arquivo sumindo da working tree (não do `.git`) durante um rebase: ver seção 2 (procedimento de recuperação testado nesta sessão).
5. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
6. **Sobre o WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
