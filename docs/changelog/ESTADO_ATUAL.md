# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, continuação da sessão do dia, HEAD `d5843e1` + trabalho descrito abaixo (`proLaboreFixo`, aguardando commit).

## NOVA DIRETRIZ DO USUÁRIO (válida daqui pra frente, todas as sessões)

Critério de execução autônoma: **"Isso reduz dependência da V1 sem criar risco?"** Se sim (sem decisão de negócio pendente, sem risco financeiro, sem risco de perda de dado, sem bloqueio explícito do usuário, caminho técnico claro) — **executar direto**: investigação → conclusão → implementação → validação → commit → próximo item. Só parar e perguntar se: perda potencial de informação, decisão de negócio real, conflito com regra já definida, ou risco financeiro real. Não pedir autorização pra cada passo intermediário.

## Concluído nesta sessão (commitado + push)

1. `e5f1348`/`cc315fa`/`26315fc` — gap SAJ investigado e corrigido (`geracao_acumulada` em `energia_solar_leituras` passou a sincronizar automaticamente), validado com prova real.
2. `22d6b2c` — `ACOES_COTACOES` migrado pra V2 (tabela `cotacoes_acoes`) + bugfix de formato de data no card Solar.
3. `1a1867d` — infraestrutura de frescor (badge relativo, 4 faixas, `indicadores.SOLAR_FRESCOR_LIMITES`) + infraestrutura de legendas dinâmicas (`formatarLegenda`/`formatarFrescor`/`montarBadgeFrescor`, placeholders `{chave}`, 100% retrocompatível) + migração Fase 1 (Solar + Cotações).
4. `7267d00` — bugfix real: soma dos Livros Razão (LRW/LRV) errada por dois escritores concorrentes (um stale desde 25/07) — removida a duplicação. Blindagem NaN no frescor.

## Commitado nesta sessão (últimos 2 commits)

- `5f36f38` — `HISTORICO_ERP_TODOS_CICLOS` migrado pra view `vw_historico_erp_completo` (cobertura 224/230 verificada completa, 6 exceções documentadas — ver Bloco 26 da Passagem de Turno). Zero mudança nos 3 consumidores reais.
- `d5843e1` — `creditoUberBalance`/`creditoShellBox`/`creditoKmvIpiranga` migrados pra `indicadores` (único consumidor: `hydrate-roc.js`).

## Em andamento, NÃO commitado — `proLaboreFixo` migrado pra V2

Continuação direta sob a nova diretriz (sem pausa pra autorização). Salário-base fixo (R$11.600,00), múltiplos consumidores (`hydrate-qualidade.js`, `hydrate-caixas.js`, `hydrate-onda3-suavizacao.js`, `recalcular-necessidade.js`, `reg-operacional.js`) — todos leem `VARS.proLaboreFixo` direto, sem reconciliação.

**Cuidado de sequência resolvido**: `reg-operacional.js` copia `VARS.proLaboreFixo` pra `REG.operacional.proLaboreFixo` uma única vez, síncrono, linha ~1034 de `app.js`. A sobrescrita V2 precisa rodar ANTES disso — colocada na linha ~683 (junto dos outros overrides), confirmado seguro porque todo fetch V2 já resolveu antes do `app.js` carregar.

**Executado**: 1 registro novo em `indicadores`, adicionado ao mesmo fetch já usado pros créditos externos (`nome=in.(...)`) — sem requisição nova. Testado via REST real, preview sem erro novo.

**Pendente**: commit + push.

**Triados e descartados por ora** (não são quick-wins): `dataNascimentoWallace` (constante permanente, ROI ~0), `PIB_WALLACE_HISTORICO`/`PADROES_RUIDO_TRANSACAO`/`DEFICIT_ZERO_PISO_OVERRIDE` (já gravados via RPC, mas dentro do próprio `wallace_dados` — precisam de tabela nova, não é view/RPC simples, classificação C), `coberturaGarantidaConfirmada` (por definição só preenchido por confirmação manual do usuário — depende de decisão humana), `aporteBTGProgramado` (já majoritariamente derivado em runtime, baixo impacto).

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 35 commitados; +1 (`proLaboreFixo`) pronto, aguardando push |
| Exceções formais (fora da métrica) | ~10 — `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` + 2 novas (TXCON000001/002) |
| Restantes | ~47 após o push |

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
