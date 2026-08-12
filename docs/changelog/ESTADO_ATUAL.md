# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 12/08/2026, sessão de responsividade/modernização mobile (retomada após limite de uso). Commits pushed: `2da024b` (Fase 1 — TTL de 90s no cache do `WallaceFinanceService` + scroll horizontal nos 24 painéis do Livro Razão), `821cf31` (Fase 3 — refino de paleta/tipografia do design system), `1a0b583` (composição tarifária real Wellida/Casa da Mãe, com correção também aplicada na cópia viva no Supabase).

## ✅ Correção de dado real — composição tarifária Wellida/Casa da Mãe (12/08/2026)

Usuário mandou 2 faturas reais em PDF (Ago/26, NF 009.005.476 Wellida e NF 009.005.819 Casa da Mãe). A tabela "Residual pós-solar estimado" (seção 10, `graficos-cenarios-lazy.js`) usava uma composição tarifária genérica chutada (28% energia/22% impostos/22% distribuição/12% iluminação/12% encargos/5% transmissão) igual pra todas as unidades. Substituído pelos percentuais reais extraídos da página 2 de cada fatura — **exceto Iluminação Pública (COSIP)**, que não faz parte dessa tabela percentual (é linha separada, nunca compensada por lei): a fórmula agora usa o valor real exato da COSIP (`cosip_valor_real`: R$13,87 Wellida, R$18,12 Casa da Mãe) em vez de estimar por %. Validado batendo o resultado recalculado da Wellida (R$51,93 residual/R$42,52 economia, 45,0%) contra uma estimativa anterior já dada pelo usuário (R$51,68/R$42,77, 45,3%) — muito próximo, valida a abordagem. Casa da Mãe recalculada deu bem diferente da estimativa anterior (R$67,48/R$136,13, 66,9% vs. estimativa antiga de R$87,88/R$115,73) — usuário confirmou que a estimativa antiga também tinha sido calculada por mim (não era uma fonte externa), então o novo número (baseado em dado real da fatura) é o que vale.

**Corrigido tanto localmente (`src/solar/vars-energia-solar.js`) quanto na cópia viva no Supabase** (`wallace_dados.ENERGISA_TARIFA_COMPOSICAO`, que sobrescreve o arquivo local no carregamento — regra permanente do `CLAUDE.md`, não esquecer de novo).

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada.** `wallace_dados` não recebe mais nenhuma escrita (confirmado por SQL, `pg_proc`, 0 funções escrevem nela). V1 é legado/fallback. Ver `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` seção 52-54.
2. **Mastercard Black e Caixa Mastercard/Infinite** — investigados, causa raiz identificada, formalizados como exceção. Não reabrir. Ver seção 51 do mesmo documento.
3. **Hardening de segurança concluído em 2 rodadas** (11/08/2026). 0 erros (`ERROR`) nos advisors do Supabase. Ver `docs/decisions/HARDENING_SEGURANCA_PRODUCAO.md`.
4. **`wallace_dados`/`VARS` (V1) não é fonte de verdade** — regra de sessões anteriores, continua valendo.
5. **Backup/restore interno + continuidade de negócio/DR externo (GitHub)** — implementados e testados em 11/08/2026. Ver seção de pendências abaixo (falta ativação pelo usuário).

## ✅ Concluído nesta sessão (12/08/2026)

1. **Fase 1 (performance)**: `WallaceFinanceService._cache` trocado de `Map` puro (sem expiração) pra `_CacheComTTL` (90s), mesma API (`has/get/set/clear`), nenhum dos ~35 métodos que já chamavam `this._cache.*` precisou mudar. Motivação: sessão longa aberta podia mostrar dado desatualizado até F5 manual ou `invalidarCache()` — causa raiz confirmada de uma confusão real na madrugada anterior (Onda 3 LRW/LRV).
2. **Fase 2 (mobile/responsividade) — investigação**: testadas de verdade (sem login, 375px) a tela de login e a página pública `solar-compartilhado.html` — ambas OK, sem overflow horizontal. Painel principal não testável (exige login, sem credencial no ambiente).
3. **Correção de bug real reportado pelo usuário (print)**: os 24 painéis do Livro Razão (`.pane`, classe compartilhada — LRW, LRV, LRB, LRP, LRS, LRR, LRCON, LRC, LRMP, LRCV, LREI, LRDOA, LRPGV, LRPV, LRBD, LRCL, LRMN, LRAJ, LREV, LRSF, LRSE, LRCB, LRCH, LRMI) não tinham `overflow-x:auto`, diferente do Inbox/Opções (que já tinham desde 10/08). Tabela larga ficava cortada pela borda do painel, texto inalcançável. Corrigido com 1 regra CSS (`.pane.active{overflow-x:auto}`) cobrindo os 24 de uma vez. Testado com estrutura isolada real (`.pane`+`table`+CSS de produção) confirmando que o painel rola mas a página não ganha scroll lateral.
4. **Achado de processo, não de código**: commit `8e835e0` (tooltip de composição de saldo, legendas do Simulador Fim de Ciclo, cor dinâmica na barra Disponível) já existia no repositório antes desta sessão retomar — não era outro agente trabalhando em paralelo, era a mesma sessão antes de um corte de contexto/limite de uso que não sobreviveu em memória. `git diff` confirmou que bateu byte a byte com o que eu ia "reimplementar". **Lição**: depois de retomar após limite de uso, sempre `git log`/`git diff` antes de assumir o que está pendente.

## Plano de modernização mobile — fases

| Fase | Escopo | Status |
|---|---|---|
| 1 | Performance (cache TTL) | ✅ Concluída, commitada (`2da024b`) |
| 2 | Mobile/responsividade — auditoria + correções pontuais | 🔶 Em andamento — bug do Livro Razão corrigido; painel principal ainda não testado (sem login) |
| 3 | Visual/design (paleta, tipografia) | ✅ Concluída, commitada (`821cf31`) — ver detalhe abaixo |
| 4 | Performance adicional + consistência de componentes (escopo definido pelo usuário) | 🔶 Auditoria de código concluída (10 achados, ver `PASSAGEM_DE_TURNO.md`), aplicação aguardando priorização do usuário |

## ✅ Fase 3 — refino de paleta e tipografia (12/08/2026)

Usuário pediu modernização geral (sem bug pontual) e autorizou aplicar direto nos tokens (`:root` de `assets/css/styles.css`), não só propor. Mudança: fundo mais frio/rico, texto com mais contraste, accent azul/verde/âmbar/vermelho levemente mais vivos (mesma família de matiz, refino de saturação/luminosidade — não é uma repaginação de identidade). `font-family` do `body` ganhou fallback mais completo (`BlinkMacSystemFont`, `Helvetica Neue`, `Arial`).

**Cuidado tomado**: o CSS tinha ~45 ocorrências de cores repetidas como valores hardcoded (hex/rgba) fora dos tokens (gradientes do `.cover`, sombras, `rgba()` de estados hover/active) — se só os tokens em `:root` fossem trocados, essas duplicatas ficariam com a cor antiga, gerando inconsistência visual (custura entre elementos). Todas foram atualizadas em conjunto (find/replace exato dos mesmos pares hex/RGB), preservando 100% de consistência.

**Validado visualmente** (não só por leitura de código): página de teste isolada dentro do projeto (`_teste_paleta_temp.html`, criada e apagada em seguida), servida pelo servidor local já configurado em `.claude/launch.json` (`wallace-static`), carregando o `assets/css/styles.css` real. Screenshot confirmou hierarquia de texto, cores de status (verde/vermelho/âmbar) e accent/accent-2 legíveis e coerentes. **Painel principal logado segue não testado** — mesma limitação de sempre (sem credencial no ambiente).

## Pendências antigas, sem decisão do usuário ainda

| Item | Nota |
|---|---|
| Visa Infinite — cobertura baixa de `cartao_id`/histórico | Congelado por decisão explícita, não mexer sem evidência nova |
| Limiares do painel de Saúde Operacional | Estimados, não calibrados contra execução real ainda |
| Cadastrar `BACKUP_ENCRYPTION_KEY`/`SUPABASE_DB_URL` no GitHub + rodar o workflow `backup_externo.yml` 1x | Bloqueia validação final do backup externo/DR — ver `docs/decisions/CONTINUIDADE_NEGOCIO_DR.md` seção 4 |
| `cotacoes_acoes` sem heartbeat em `execucoes_jobs` | RPC funciona, mas o heartbeat do job nunca aparece — possível bug isolado, não investigado |
| Painel principal (`Sistema_Wallace_Lira_Completo.html`) no celular | Usuário precisa testar e reportar o que quebra, OU liberar acesso de login pro agente — nenhuma sessão recente conseguiu testar de verdade |

## Protocolo de sessão nova

1. Este arquivo, depois o bloco mais recente de `PASSAGEM_DE_TURNO.md`.
2. `git status`/`git log -5` antes de assumir o que está pendente/concluído.
3. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
4. Mudanças de CSS/JS desta sessão **não foram testadas no painel principal com login real** — pedir confirmação visual do usuário antes de considerar "confirmado funcionando" no painel logado.
