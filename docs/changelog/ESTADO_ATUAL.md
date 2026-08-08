# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, via Claude Code, direto em `G:\My Drive\Livro Razão\Site`.

## PRODUÇÃO: domínio oficial é `wallacelira.com.br`

`https://wallacelira.com.br/` (GitHub Pages por baixo) é o ambiente real. **Fim desta sessão: `git status` limpo, mas HEAD está 14 commits À FRENTE de `origin/main` — NENHUM push feito ainda nesta sessão nem nas anteriores desde `eff2805`.** Confirmar com o usuário antes de dar push (lista completa dos 14 commits no Bloco 18 da Passagem de Turno).

**Pendente de verificação manual (não dá pra checar por código)**: confirmar em Firebase Console → Authentication → Settings → Authorized domains que `wallacelira.com.br` está cadastrado.

**Validação em navegador real de TODA a sessão está pendente** — usuário recusou login manual em todas as rodadas desta sessão. Toda validação foi técnica/estática (schema, referências, nomes globais) + conferência SQL direta contra valores documentados. Primeira prioridade da próxima sessão com login disponível: rodar `WALLACE_VALIDACAO_RUNTIME`, `#healthBadge`, e os `window.WALLACE_ONDA*_RELATORIO` de todos os módulos novos.

## Protocolo de sessão nova (leia nesta ordem)

0. **`docs/changelog/RESUMO_EXECUTIVO_08-08-2026.md`** — resumo executivo objetivo/acionável pra troca de agente (7 blocos: pronto / migrado nesta sessão / ainda em V1 / o que falta pra desligar V1 / governança / diretriz oficial / próximo passo recomendado). Ler primeiro se o objetivo for só entender o estado do projeto rápido.
1. Este arquivo (`ESTADO_ATUAL.md`)
2. `PASSAGEM_DE_TURNO.md` — Bloco 18 tem o histórico completo desta sessão (08/08/2026)
3. `docs/decisions/PLANO_UNIFICACAO_V1_V2.md` — seções 30-42 são a frente de trabalho ATIVA (mudança de direção arquitetural, ver seção 0 abaixo)
4. `docs/MANUAL_OPERACIONAL_AGENTES.md` — seção 2 mudou nesta sessão (domínios V2-exclusivos não recebem mais escrita em `wallace_dados`); seção 6.1 é nova (regras obrigatórias PGV/Caixa Variável)
5. **Sempre conferir o estado real do código** (`git status`, `git log --oneline -20`) **antes de assumir qualquer coisa como pendente ou concluído.**

---

## 0. MUDANÇA DE DIREÇÃO ARQUITETURAL (08/08/2026, decisão explícita do usuário) — LER PRIMEIRO

**A V2 deixou de ser tratada como espelho/transição.** Passa a ser a arquitetura oficial do sistema. Convivência V1↔V2 permanente deixa de ser o padrão — agora exige justificativa. `wallace_dados` passa a ser só histórico/legado/contingência temporária, nunca mais fonte operacional por padrão.

**A pergunta do projeto mudou**: não é mais "como manter V1 e V2 funcionando juntas", e sim **"o que ainda impede desligar a V1?"**

**Regra nova permanente** (`MANUAL_OPERACIONAL_AGENTES.md` seção 2): antes de qualquer lançamento financeiro, checar se o domínio já é V2-exclusivo (tabela abaixo) — se for, o lançamento vai direto na tabela V2, **não** mais em `wallace_dados`.

## 1. Inventário executivo — dependência de `wallace_dados`

Evidência real (`SELECT jsonb_object_keys(dados) FROM wallace_dados WHERE id=1`): 95 chaves de topo. Inventário completo, com escritores identificados (4 scripts Python + o fluxo manual do agente) e classificação por domínio: `docs/decisions/PLANO_UNIFICACAO_V1_V2.md`, seções 41-42.

| Domínio | Status | Fonte oficial | Observação |
|---|---|---|---|
| Patrimônio | ✅ **V2-exclusivo** | `patrimonio`+`financiamentos` | Exceto Caixa Lance (linha própria abaixo). Falha na V2 = `⚠ Indisponível (V2)` visível, sem fallback silencioso |
| Investimentos/ROC/Opções | ✅ **V2-exclusivo** | `investimentos`+`indicadores` | idem |
| LREI (empréstimos internos) | ✅ **V2-exclusivo** | `emprestimos_internos` | idem |
| Cascata Reembolso Wärtsilä | ✅ **V2-exclusivo** | `reembolso_wartsila_ciclo` | Perna 4 (MP pessoal) fora do escopo; idem |
| Parcelamentos (LRP/LRMP) | ✅ **V2-exclusivo** | `parcelas` | `TRANSACOES_CORPORATIVAS_MP` continua V1; idem |
| P2P | ✅ **V2-exclusivo** | `indicadores` (`P2P - *`) | idem |
| Caixas — saldo (10 de 18) | ✅ Migrado (overlay condicional, Onda 1-3) | `vw_saldo_v2_por_caixa` | Boletos, PIX Vanessa, Variável, Mastercard/Infinite, Bens Duráveis, Eventos, Seguro, Escola Júlio, Churrasco, Combustível |
| Livro Razão — 7 tabelas | ✅ Migrado | `transacoes` | Mesmas 7 caixas acima |
| LRW/LRV — totais confirmados | ✅ Migrado | `vw_compromisso_cartao_por_pessoa` | Só totais; tabela item-a-item ainda V1 |
| Solar — persistência | ✅ Sincronizada | Grava V1+V2 em paralelo | Leitura do frontend continua V1 (crédito/rateio pendente — ver seção 3) |
| Qualidade da Geração (solar) | ✅ Novo, V2 | `energia_solar_geracao_diaria` (blob V1) + `indicadores` (limites) | Indicador operacional, não financeiro — separado do crédito/rateio |
| **Caixa Lance** | 🟡 Híbrido | V1 (log-only V2) | Divergência R$4,37 não confirmada — **não reabrir**, decisão do usuário |
| Caixas — 4 restantes (Manutenção/Saúde Família/PIX Geral Vanessa/Aniversário Júlio) | 🟡 Híbrido | V1 | Divergência R$107-346, causa indeterminada |
| **Mastercard Black/Visa** | 🟡 Parcial (achado nesta sessão) | Misto | CARTAO_MAPA/titularidade/parcelamentos já ✅ na V2 (`cartoes`/`parcelas`). Headline totals (`cartaoMBTotal` etc.) ❌ bloqueados por design (verdade externa, "fatura sempre vence"). Assinaturas 🟡 (categoria já existe, falta view). Recorrências/Corporativo ❌ (34 transações sem categoria). Ver seção 43 do plano |
| LRW/LRV/LRC-limbo/LRCV — item-a-item | ❌ V1 | V1 | Mesmo gap de classificação do Mastercard/Visa acima |
| Operacional (salário/orçamento/créditos/legendas/Inbox) | ❌ V1 | V1 | ~30 chaves heterogêneas, sem domínio único |
| Ciclo Snapshots | ❌ V1 | V1 | Sem estrutura V2, nunca investigado |
| Pluggy / Mercado Pago (eventos brutos) | ❌ V1 | V1 | Integrações externas, fora do escopo |

**Deliberadamente não executado** (risco desproporcional sem validação em navegador, sessão inteira sem login): remover os literais V1 dos 6 domínios V2-exclusivos (`vars-*.js`, continuam como semente síncrona do 1º segundo de render); parar os scripts Python de escrever em `wallace_dados` (exceto Solar).

## 2. Bug de usabilidade corrigido — Inbox Financeira

Itens sem descrição do Mercado Pago (`tipo:'account_money'`) pareciam duplicados — só se distinguiam pelo `idExterno`, que existia no dado mas nunca era exibido. Corrigido: `idExterno`/`payer` (metadata) agora aparecem na listagem; descrição vazia gera texto automático a partir do `tipo` do evento. Hora/minuto do evento não está disponível na fonte (script Python só grava data) — documentado, não fabricado.

## 3. Investigação Solar — 301×361 kWh (NÃO decidido, aguardando evidência externa)

Fórmula do rateio (`saldoLiquido = exportado − importado`) provada como o que está implementado e validado contra o documento original do usuário (`Base_Calculo_Rateio_Solar.md`) numa sessão passada — mas esse documento **não existe** neste repositório/backup, e o "Fluxo de energia" do próprio painel contradiz a fórmula (sugere que só a exportação vira crédito). **Nenhuma fórmula alterada** — decisão explícita do usuário de não trocar 301 por 361 sem prova externa (documento original ou fatura Energisa real com a linha de crédito). Ver seção 38 do plano.

**Achado colateral, mais importante que a dúvida original**: o robô SAJ nunca parou — grava em `wallace_dados.dados.SOLAR_GERACAO_DIARIA` (o que o frontend lê), confirmado real até o próprio dia desta sessão via GitHub Actions. A tabela V2 relacional estava só desatualizada (gap comum de sincronização) — corrigido (seção 40 do plano, script agora grava nas duas).

**Novo indicador implementado**: "Qualidade da Geração" (card "☀️ Como a usina está indo", seção 10) — 100% separado do crédito/rateio, compara o último dia FECHADO contra a média de dias anteriores (nunca compara "hoje parcial", evita falso alarme). Limites parametrizados em `indicadores`.

## 4. Regras operacionais formalizadas (obrigatórias para todos os agentes)

`MANUAL_OPERACIONAL_AGENTES.md`, seção 6.1:
- **Caixa Variável**: nunca confundir TEM NA CAIXA (bruto) × DISPONÍVEL REAL (bruto − comprometido). Rótulos do painel já ajustados (3 pontos) pra deixar isso explícito, sem alterar nenhum id/fórmula/valor.
- **PGV**: alerta preventivo obrigatório no resumo de abertura de sessão sempre que o saldo estiver ≤ R$100 (gatilho formal R$50, Política §7). Só alerta, nunca executa transferência/lançamento.

## 5. Próximo domínio em auditoria conceitual — Mastercard Black/Visa

Auditoria feita nesta sessão (conceito → V2 → VARS remanescentes → menor modelagem), Política Interna §3 como referência obrigatória. Achado principal: CARTAO_MAPA/titularidade/parcelamentos **já estão na V2** (a tabela `cartoes` está inclusive mais atualizada que a própria Política nesse ponto — cartão 1371 já substituiu o 2244, refletido na V2 mas não no documento). O que resta bloqueado: headline totals (verdade externa, não migrável sem reabrir reconciliação) e um gap de 34 transações sem categoria (mesmo gap já documentado pro LRW/LRV item-a-item). Nenhum código alterado — só auditoria. Ver seção 43 do plano.

## 6. Ambiente de teste local

- `.claude/launch.json` + `.claude/serve.ps1`: servidor HTTP estático local (`autoPort` habilitado).
- Login usa Firebase real — **a IA nunca digita senha**. `VARS`/`REG`/`WallaceFinanceService` são bindings léxicos de topo, não aparecem como propriedade de `window` — usar `contentWindow.eval('VARS.algumaCoisa')` dentro do iframe.
- `window.WALLACE_VALIDACAO_RUNTIME` (18 fases), `#healthBadge` (12 checagens), e agora `window.WALLACE_ONDA{1,2,3,4,5}*_RELATORIO` (um por módulo migrado) são os testes de regressão padrão — **nenhum rodado em navegador real nesta sessão**, só checagem estática + SQL direto.

## 7. Pendências abertas (não reabrir como problema novo sem confirmar com o usuário)

1. 14 commits não enviados ao remoto (`git push` pendente).
2. Validação em navegador real de tudo desde a Onda 3 (toda a sessão sem login).
3. Caixa Lance (R$4,37) e as 4 caixas de causa indeterminada — **não reabrir**, decisão do usuário.
4. Solar 301×361 kWh — **não reabrir**, aguardando documento original ou fatura real.
5. Mastercard Black/Visa — auditoria conceitual feita, implementação ainda não iniciada (aguardando decisão sobre o que fazer com Assinaturas/Recorrências/34 transações órfãs).
6. R$652,00 que sumiu da Inbox Financeira sozinho (sessão muito anterior, motivo nunca investigado a fundo).
7. Firebase Console → Authorized domains: confirmação manual pendente.
8. `AJUSTE-06-08`: não remover nenhum `AJUSTE-*`/`RENDIMENTO-*` até o usuário revisar.
