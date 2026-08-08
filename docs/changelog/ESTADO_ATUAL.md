# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, continuação da sessão do dia, HEAD `5f36f38` + trabalho descrito abaixo (créditos externos Uber/Shell/Ipiranga, aguardando commit).

## NOVA DIRETRIZ DO USUÁRIO (válida daqui pra frente, todas as sessões)

Critério de execução autônoma: **"Isso reduz dependência da V1 sem criar risco?"** Se sim (sem decisão de negócio pendente, sem risco financeiro, sem risco de perda de dado, sem bloqueio explícito do usuário, caminho técnico claro) — **executar direto**: investigação → conclusão → implementação → validação → commit → próximo item. Só parar e perguntar se: perda potencial de informação, decisão de negócio real, conflito com regra já definida, ou risco financeiro real. Não pedir autorização pra cada passo intermediário.

## Concluído nesta sessão (commitado + push)

1. `e5f1348`/`cc315fa`/`26315fc` — gap SAJ investigado e corrigido (`geracao_acumulada` em `energia_solar_leituras` passou a sincronizar automaticamente), validado com prova real.
2. `22d6b2c` — `ACOES_COTACOES` migrado pra V2 (tabela `cotacoes_acoes`) + bugfix de formato de data no card Solar.
3. `1a1867d` — infraestrutura de frescor (badge relativo, 4 faixas, `indicadores.SOLAR_FRESCOR_LIMITES`) + infraestrutura de legendas dinâmicas (`formatarLegenda`/`formatarFrescor`/`montarBadgeFrescor`, placeholders `{chave}`, 100% retrocompatível) + migração Fase 1 (Solar + Cotações).
4. `7267d00` — bugfix real: soma dos Livros Razão (LRW/LRV) errada por dois escritores concorrentes (um stale desde 25/07) — removida a duplicação. Blindagem NaN no frescor.

## Commitado (`5f36f38`) — `HISTORICO_ERP_TODOS_CICLOS` migrado pra V2

**Triagem completa feita** (3 consumidores reais: `pluggy-reconciliacao.js`, `classificacao-inbox.js`, `dashboard-navegacao.js` — todos só leem `tx`/`valor`/`nome`/`data`; campo `livro` por registro confirmado morto). Cobertura verificada **por completo, não por amostragem**: 230 registros do array V1 comparados 1:1 contra `transacoes.tx_legado` — 224 batem 100%, 6 com ressalva documentada:

- `TXCON000001` (Consórcio Casa, R$501,32) e `TXCON000002` (Consórcio Carro, R$1.449,45) — **ausentes da V2** (domínio LRCON nunca migrado pra `transacoes`). Exceção aceita pelo usuário.
- `TXRR000005` — coberto sob outro código (`TXR_FACULDADE_MB_JUL26`, mesmo dado exato).
- `TXB000001`/`TXB000008`/`TXB000009` — código de boleto recorrente (Prestação da Casa/Conselho Regional/Energia) **reaproveitado entre ciclos consecutivos** — a V2 guarda só a versão mais recente de cada código; a anterior (mesmo mês, valor diferente no caso da Energia) fica só no histórico git do array V1. Risco baixo (só afetaria reconciliação se um ciclo já fechado fosse reaberto).

**Executado**:
- View `vw_historico_erp_completo` (Supabase) — `select tx_legado as tx, to_char(data,'DD/MM/YYYY') as data, descricao as nome, valor from transacoes where tx_legado is not null` — 292 linhas, superset do array V1 (inclui até ajustes fora do padrão TX, só ajuda reconciliação).
- Frontend: `Sistema_Wallace_Lira_Completo.html` (fetch paralelo `WALLACE_HISTORICO_ERP_V2`) + `src/app/app.js` (override de `VARS.HISTORICO_ERP_TODOS_CICLOS` se a V2 respondeu — fallback silencioso permitido, mesmo padrão `cartoes`/`cotacoes_acoes`, domínio auxiliar não crítico). **Zero mudança nos 3 arquivos consumidores** — todos continuam lendo `VARS.HISTORICO_ERP_TODOS_CICLOS` normalmente, só a origem do dado mudou (mesmo padrão já usado em todo o resto da sessão).
- Verificado: view testada via REST real (anon key), preview local sem erro novo de console.

## Em andamento, NÃO commitado — `creditoUberBalance`/`creditoShellBox`/`creditoKmvIpiranga` migrados pra V2

Continuação direta sob a nova diretriz (sem pausa pra autorização). 3 créditos externos de apps (Uber/Shell/Ipiranga), "verdade externa" atualizada manualmente — mesmo padrão do `CDI_MENSAL_ATUAL`. Único consumidor real: `hydrate-roc.js` (3 linhas de exibição direta via `t('credUberTotal', fmt(...))` etc, nenhum cálculo em cima).

**Executado**: 3 registros novos em `indicadores` (mesmo padrão `SOLAR_FRESCOR_LIMITES`/CDI), fetch único (`nome=in.(creditoUberBalance,creditoShellBox,creditoKmvIpiranga)`) no bootstrap do HTML + override em `app.js` (fallback silencioso, mesmo padrão de sempre). Testado via REST real, preview sem erro novo.

**Pendente**: commit + push.

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 32 commitados; +3 (créditos externos) pronto, aguardando push |
| Exceções formais (fora da métrica) | ~10 — `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` + 2 novas (TXCON000001/002) |
| Restantes | ~48 após o push |

**Fora do escopo, por instrução explícita do usuário**: 301×361 (Solar), Caixa Lance, 4 caixas de causa indeterminada, TX000203-208, headline totals Mastercard/Visa.

## Próximos candidatos (impacto/esforço/independência de decisão)

1. `CARTAO_PLUGGY_MAPA` — bloqueado, aguardando o usuário passar os finais de cartão do Itaú (achado: campo `banco` em `cartoes` é genérico demais, "Itaú/Bradesco/Personnalité conforme apelido", não distingue banco real por cartão — problema de qualidade de cadastro, não de código).
2. Resto de "Operacional" (~27 chaves restantes, ex: `dataNascimentoWallace`, `proLaboreFixo`, `aporteBTGProgramado`, `coberturaGarantidaConfirmada`, `FGTS`, `PADROES_RUIDO_TRANSACAO`, `CRONOGRAMA_BOLETOS_FIXOS`, `DEFICIT_ZERO_PISO_OVERRIDE`, `reservaRetiradaProgramada`, `PIB_WALLACE_HISTORICO`) — nenhuma triada ainda, candidatas a repetir o mesmo processo (baixo esforço se forem escalares de 1 consumidor, como os 2 já migrados).
3. Pluggy/reconciliação, Mercado Pago eventos brutos, Ciclo Snapshots — não investigados, provavelmente C (modelagem/integração externa).
4. LRW/LRV/LRC-limbo/LRCV item-a-item — D, bloqueado por gap de dado (`usuario_id`/`categoria_id` ausente em ~34 transações).

## Itens NaN reportados, aguardando confirmação do usuário (Ctrl+Shift+R)

P2P (seção 18) e Reembolsos Wärtsilä (seção 19) mostraram "R$ NaN" no navegador do usuário. Dados conferidos limpos no banco (`vw_p2p_v2`, `reembolso_wartsila_ciclo`) e código com guarda contra `null`/falha (mostraria "Indisponível", não NaN) — suspeita forte é cache do `WallaceFinanceService` sem TTL numa aba aberta há muito tempo (mesma classe do bug de frescor "crítica"/PETRS368W5 ativa, ambos não reproduzidos em teste isolado). Usuário vai confirmar com hard-refresh antes de abrir frente de correção — **se persistir, é bug real, investigar o fluxo completo.**

## Protocolo de sessão nova

1. Este arquivo
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir
4. `docs/MANUAL_OPERACIONAL_AGENTES.md`
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
