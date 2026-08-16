# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 16/08/2026, continuação do bloco 18 (usuário liberou trabalho autônomo — "pode continuar, eu vou tomar banho e dormir"). Resumo: sessão dedicada a uma **auditoria de 9 agentes em paralelo** (8 abas do painel, 1 inventário de "dado disfarçado de texto" em toda a base) — 21 achados reais catalogados. Lote 1 (11 achados, `4e5fd1a`) e lote 2 (título congelado + Balanço, `b4d3e45`) já commitados e publicados. Achados #4 e #18 corrigidos nesta continuação, ainda **não commitados** — ver seção "Estado imediato" abaixo. Achado #5 investigado a fundo e **reclassificado** (não é uma correção pendente, é um mecanismo morto nos dois lados — ver seção 1.3).

## ⚠️ Estado imediato ao reabrir a sessão (ler antes de qualquer coisa)

**Há trabalho terminado e não commitado na working tree** (`git status` confirma 3 arquivos modificados):
- `src/dashboard/charts/graficos-cenarios-lazy.js`
- `src/financeiro/operacional/reg-operacional.js`
- `src/financeiro/operacional/vars-operacional.js`

Esse diff resolve os achados #4 e #18 (ver seção 1.2 abaixo) e está **completo e coerente** — só falta revisar com o usuário e commitar. **Avisar o usuário do conteúdo antes de rodar `git commit`**, mesmo com autorização permanente (regra do manual, seção 8). **Não foi validado em navegador real** (sem credenciais de login disponíveis nesta continuação autônoma) — só revisão de código/sintaxe. Testar no painel ao vivo (aba Cenários — gráfico "Piso mínimo garantido" e card "Não trabalha" — e aba Energia Solar — "Estimativa pra hoje" na Unidade Geradora) antes ou logo depois de commitar.

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

### 1.3 Continuação autônoma 16/08/2026 — achados #4, #5, #18 (usuário liberou "pode continuar, vou dormir")

**#4 corrigido, NÃO commitado ainda** (ver "Estado imediato" no topo) — Energia Solar tinha 2 fórmulas diferentes pro mesmo conceito ("crédito líquido estimado pra hoje"): a Previsão (Fluxo 1) já usava `VARS._creditoLiquidoProjetadoHoje` (dia a dia real do robô SAJ, com average só de fallback pontual), mas o card "📊 Estimativa pra hoje" (Unidade Geradora) recalculava com a fórmula antiga, só de média achatada. `graficos-cenarios-lazy.js` corrigido pra reaproveitar a mesma projeção.

**#18 corrigido, NÃO commitado ainda** — `liquidoSemTrabalhar` (Cenários, gráfico "Piso mínimo garantido") era literal hardcoded (R$8.109,74), tinha escapado da migração de 7 constantes do Déficit Zero pro Supabase feita em 14/08. Corrigido em 2 passos:
1. **Dado**: adicionado campo novo `irrfSemPericulosidade` (R$1.738,56) dentro de `parametros_gerais.taxasHoraFolhaPontoWartsila` — o IRRF do cenário "não trabalha" é diferente do IRRF já existente ali (`irrfBaseSemAdicionais`, R$2.639,04), que é especificamente o do cenário COM Periculosidade. Escrito direto no Supabase (JSONB aditivo, mesmo padrão da migração original), com `set_config('audit.origem', ...)` antes.
2. **Código**: `reg-operacional.js` (`REG.deficitZero.liquidoSemTrabalhar`) agora calcula a partir de `VARS.taxasHoraFolhaPontoWartsila` em vez do literal — mesma metodologia documentada (Base+Supervisão+Creche−INSS−IRRF−Saúde/Dental−PGBL), com fallback pro literal antigo se o boot da V2 falhar. `graficos-cenarios-lazy.js` só passou a ler o valor já calculado (não duplica a fórmula).

**#5 investigado e RECLASSIFICADO, sem alteração de código** — a suspeita original era "o link público pula uma trava de 10 dias que o painel privado respeita". Investigação achou que essa trava (`LIMITE_DIAS_DESCOMPASSO_SEGURO`, `graficos-cenarios-lazy.js`) depende de `ultimaSolar.geracaoAcumuladaData`, campo que **nunca é populado em lugar nenhum do sistema** (é sempre `null`, ver `app.js` linha ~1330 — "não existe em energia_solar_leituras (V2), nunca fabricado"). Ou seja: a trava está adormecida também no painel privado, não é um mecanismo funcional que o público esteja pulando. Copiar o mesmo gate morto pro `solar-compartilhado.html` não protegeria nada de verdade — decisão de NÃO fazer isso, documentar como achado corrigido (a premissa do achado original estava errada) em vez de "consertar no escuro". Se o usuário quiser essa trava funcionando de verdade em algum momento, precisa de uma fonte real pra `geracaoAcumuladaData` — isso é trabalho novo, não retomar sem pedido explícito.

**Validação**: revisão de código/sintaxe feita (sem `node` disponível no ambiente pra `--check`, releitura manual das edições). **Sem validação em navegador real** — sem credenciais de login disponíveis nesta continuação autônoma. Testar no painel ao vivo assim que possível (ver "Estado imediato" no topo).

### 1.4 Status dos 21 achados originais — só falta o Grupo A do inventário
Dos 20 achados reais de bug (1-19, mais #20 que já era "confirmação boa, sem ação"), todos os 19 foram corrigidos ou investigados e formalmente reclassificados nesta sessão (lote 1 + lote 2 + esta continuação). **Nenhum achado de bug/inconsistência da auditoria original segue pendente.** O único item aberto da auditoria completa é o Grupo A do inventário de hardcode (seção 1.5), que é uma frente separada, ainda não iniciada.

### 1.5 Grupo A do inventário "dado disfarçado de texto" — ainda não iniciado
Achado paralelo do agente de inventário (~28 itens: "2 parcelas pagas" hardcoded, rateio solar fixo 0.71/0.29, percentual do consórcio sem fonte viva, etc.) — usuário pediu **"Grupo A agora"** como Prioridade 0, mas a sessão foi interrompida pelo lote de bugs 🔴 antes de começar essa frente. Reaproveita a mesma infraestrutura de `legendas`/`parametros_gerais` já em produção. Grupo B (rótulos fixos de interface, 600-700 strings) foi explicitamente adiado pelo agente de inventário como decisão separada, não retomar sem pedido novo.

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
16. **NOVO 15-16/08/2026 — Auditoria de 9 agentes achou 21 bugs/inconsistências reais no painel — TODOS os 20 achados de bug já corrigidos ou reclassificados** (13 commitados/publicados, 2 corrigidos mas ainda não commitados — seção 1.3 — e 1 reclassificado como mecanismo já morto, sem ação de código). **Só falta o Grupo A do inventário de hardcode** (seção 1.5, Prioridade 0 do usuário, ainda não iniciado). Não é uma auditoria genérica — não repetir a varredura dos 9 agentes do zero, o trabalho real que resta é o Grupo A.

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
3. Retomar pela seção 1 acima: 1.3 tem o diff pendente de revisar/commitar (achados #4 e #18); depois disso, o único trabalho real que resta da auditoria é o Grupo A do inventário (seção 1.5), Prioridade 0 do usuário.
4. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: Google Drive sincronizando `.git/` de novo — ver regra 6. Se o problema for arquivo sumindo da working tree (não do `.git`) durante um rebase: ver seção 2 (procedimento de recuperação testado nesta sessão).
5. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
6. **Sobre o WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
