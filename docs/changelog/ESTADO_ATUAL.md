# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 15-16/08/2026, bloco 18. Resumo: sessão dedicada a uma **auditoria de 9 agentes em paralelo** (8 abas do painel, 1 inventário de "dado disfarçado de texto" em toda a base) — 21 achados reais catalogados, **Grupo A do inventário (dado hardcoded reaproveitável) priorizado como Prioridade 0**. Lote 1 de correções (11 achados) já commitado e publicado (`4e5fd1a`). Sessão foi interrompida pelo **limite semanal de uso** (reset 18/08/2026 02h, America/Sao_Paulo) com 2 correções adicionais completas mas **ainda não commitadas** na working tree.

## ⚠️ Estado imediato ao reabrir a sessão (ler antes de qualquer coisa)

**Há trabalho terminado e não commitado na working tree** (`git status` confirma 3 arquivos modificados):
- `Sistema_Wallace_Lira_Completo.html`
- `src/financeiro/cartoes/hydrate-resumo-cartoes.js`
- `src/financeiro/patrimonio/hydrate-onda4-patrimonio.js`

Esse diff resolve 2 achados da auditoria (ver seção 1.2 abaixo) e está **completo e coerente** (não é um corte no meio de uma edição) — só falta revisar com o usuário e commitar. **Avisar o usuário do conteúdo antes de rodar `git commit`**, mesmo com autorização permanente (regra do manual, seção 8) — não commitar às cegas só porque "estava terminado quando a sessão caiu".

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

### 1.2 Correções adicionais completas, NÃO commitadas (working tree atual)
Feitas depois do lote 1, sessão caiu no limite de uso antes de revisar/commitar:
- **Título "Jul/26 a Mar/27" congelado** (Gráficos seção 06 + Painel, 3 pontos) — `Sistema_Wallace_Lira_Completo.html` ganhou `<span id="labelUltimoCicloEvolucao1/2">`/`<span id="labelJanelaEvolucao12M">`; `hydrate-resumo-cartoes.js` calcula a janela real de 12 ciclos localmente (mesmo padrão já usado pra `totalOpMar27` no topo do arquivo — recalculado ali porque `gerarMesesCiclo()` mora no módulo lazy de gráficos, que pode não ter carregado ainda no boot síncrono).
- **Balanço — 9 colunas de `vw_patrimonio_v2` nunca lidas** (achado #9: casa/apartamento/jazigo/solar/carro/pgbl/fgts/consórcio-casa-pago) — `hydrate-onda4-patrimonio.js` agora popula `REG.balanco.fisico.*`, `REG.balanco.pgbl`, `REG.balanco.fgts`, `REG.balanco.financeiro.consorcioCasaPago` a partir da V2, e recalcula `bfin.total`/`ativosTotal`/`patrimonioTotalGeral` a partir desses componentes em vez de literais do boot síncrono. Isso também dá uma rede de sincronização real a `balFinanceiroTotal` (achado #8 da lista original), que antes não tinha nenhuma.

### 1.3 Ainda não iniciados (10 dos 21 achados)
- Energia Solar: "crédito estimado hoje" calculado por 2 fórmulas diferentes na mesma função (uma dia-a-dia real, outra média achatada) — podem divergir em dias de sol/nublado atípico.
- Energia Solar: link público (`solar-compartilhado.html`) pula a trava de "leitura desatualizada" (≥10 dias) que o painel privado já respeita.
- Cenários: `liquidoSemTrabalhar` escapou da migração de constantes pro Supabase feita em 14/08 — ainda hardcoded no `.js`.
- Demais itens do lote original (ver bloco 18 do `PASSAGEM_DE_TURNO.md` para a lista consolidada completa de 21 achados) — **reconferir contra o código atual antes de assumir status**, a reconstrução exata de "o que já foi tocado" ficou sujeita a interpretação nesta reescrita; não tratar esta seção como garantia, e sim como ponto de partida pra retomar.

### 1.4 Grupo A do inventário "dado disfarçado de texto" — ainda não iniciado
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
16. **NOVO 15-16/08/2026 — Auditoria de 8 agentes achou 21 bugs/inconsistências reais no painel.** 11 corrigidos e publicados (`4e5fd1a`), 2 corrigidos mas não commitados (seção 1.2), 10 ainda abertos (seção 1.3) + Grupo A do inventário de hardcode (seção 1.4, Prioridade 0 do usuário, ainda não iniciado). Não é uma auditoria genérica — retomar exatamente por aqui, não repetir a varredura dos 9 agentes do zero.

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
3. Retomar a auditoria pela seção 1 acima (1.2 → revisar e commitar; 1.3 → achados 🔴/🟡/🟢 ainda abertos; 1.4 → Grupo A do inventário, Prioridade 0 do usuário).
4. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: Google Drive sincronizando `.git/` de novo — ver regra 6. Se o problema for arquivo sumindo da working tree (não do `.git`) durante um rebase: ver seção 2 (procedimento de recuperação testado nesta sessão).
5. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
6. **Sobre o WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
