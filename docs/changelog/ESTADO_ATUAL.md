# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, continuação da sessão do dia, HEAD `ecec857` + trabalho descrito abaixo (bug estrutural do `WallaceFinanceService`, aguardando commit).

## NOVA DIRETRIZ DO USUÁRIO (válida daqui pra frente, todas as sessões)

Critério de execução autônoma: **"Isso reduz dependência da V1 sem criar risco?"** Se sim (sem decisão de negócio pendente, sem risco financeiro, sem risco de perda de dado, sem bloqueio explícito do usuário, caminho técnico claro) — **executar direto**: investigação → conclusão → implementação → validação → commit → próximo item. Só parar e perguntar se: perda potencial de informação, decisão de negócio real, conflito com regra já definida, ou risco financeiro real.

## BUG ESTRUTURAL RAIZ ENCONTRADO E CORRIGIDO (não commitado ainda) — leia antes de tudo

O `WallaceFinanceService` (app.js) tem 15 métodos de fetch com cache em memória (`this._cache`, `Map` sem TTL). **5 deles** (`getPatrimonioV2`, `getCicloSolarAbertoV2`, `getIndicador`, `getReembolsoWartsilaCicloV2`, `getP2PV2`) cacheavam o ARRAY bruto da resposta mas retornavam o objeto desembrulhado (`dado[0]`) — na 1ª chamada funcionava, a partir da 2ª (cache hit) devolvia o array errado, e qualquer `.campo` lido virava `undefined` → `NaN`/exceção. **Causa única de TODOS os bugs "fantasma" reportados nesta sessão que eu não conseguia reproduzir isolado**: PETRS368W5 aparecendo como ativa, frescor mostrando "crítica" pra dado fresco, NaN em P2P/Wärtsilä (Bloco 26, nunca resolvido até agora). Corrigido nos 5 métodos (cache e retorno agora sempre guardam o mesmo valor) + 2 bugs colaterais (`comparacaoCDI` null sem guard em 3 lugares de `hydrate-roc.js`; `formatarDataBR` sem try/catch em `hydrate-onda4-investimentos.js`) + coluna "Vencimento" por linha devolvida à tabela de opções ativas.

**Validado com prova real dentro do app** (não teste isolado): descoberta importante de ambiente — o preview local (`.claude/launch.json`) faz login automático e injeta o app num `#mainIframe` de verdade; erros de console que eu vinha descartando como "limitação de login" eram bugs reais. Chamei `getPatrimonioV2()` 2x seguidas via `iframe.contentWindow.eval()` — antes divergia entre chamadas, agora sempre igual. `hydrateROC()` chamado direto: PETRS368W5 corretamente na tabela de vencidas, 2 posições ativas cada uma com sua data. DOM real: `p2pCapitalTotal`="R$ 110,00", `reembRecebidos`="R$ 5.254,98", `patTotal`="R$ 120.375,65" — todos limpos, zero NaN. Console geral: zero erros.

**Pendente**: commit + push.

## Commitado nesta sessão

- `5f36f38` — `HISTORICO_ERP_TODOS_CICLOS` migrado pra view `vw_historico_erp_completo` (cobertura 224/230 verificada completa, 6 exceções documentadas).
- `d5843e1` — `creditoUberBalance`/`creditoShellBox`/`creditoKmvIpiranga` migrados pra `indicadores`.
- `ecec857` — `proLaboreFixo` (salário-base fixo) migrado pra `indicadores`.

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 36 commitados |
| Exceções formais (fora da métrica) | ~10 — `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` + 2 novas (TXCON000001/002) |
| Restantes | ~47 |

**Fora do escopo, por instrução explícita do usuário**: 301×361 (Solar), Caixa Lance, 4 caixas de causa indeterminada, TX000203-208, headline totals Mastercard/Visa.

## Próximos candidatos (impacto/esforço/independência de decisão)

1. `CARTAO_PLUGGY_MAPA` — bloqueado, aguardando o usuário passar os finais de cartão do Itaú (campo `banco` em `cartoes` é genérico demais, "Itaú/Bradesco/Personnalité conforme apelido", não distingue banco real por cartão — problema de qualidade de cadastro).
2. Resto de "Operacional" (~26 chaves restantes: `dataNascimentoWallace`, `aporteBTGProgramado`, `coberturaGarantidaConfirmada`, `FGTS`, `PADROES_RUIDO_TRANSACAO`, `CRONOGRAMA_BOLETOS_FIXOS`, `DEFICIT_ZERO_PISO_OVERRIDE`, `reservaRetiradaProgramada`, `PIB_WALLACE_HISTORICO`) — triados parcialmente: `dataNascimentoWallace` ROI~0, `coberturaGarantidaConfirmada` depende de decisão humana por definição, `PIB_WALLACE_HISTORICO`/`PADROES_RUIDO_TRANSACAO`/`DEFICIT_ZERO_PISO_OVERRIDE` já gravados via RPC mas DENTRO do próprio `wallace_dados` (não é tabela V2 real) — precisam de modelagem, classe C.
3. Pluggy (`PLUGGY_CONTAS`/`PLUGGY_TRIAGEM`) e Mercado Pago (`MERCADOPAGO_EVENTOS`) — investigados: as 3 RPCs existentes (`atualizar_pluggy_contas`, `triar_pluggy_item`, `triar_mercadopago_evento`) fazem `jsonb_set` DENTRO do próprio `wallace_dados`, nunca criaram tabela V2 real. Classe C — exige schema novo (tabelas de conexões/contas/transações Pluggy; tabela de eventos Mercado Pago) + reescrita de 3 arquivos consumidores. Bloqueador técnico relevante, não é quick-win — usuário decidiu não entrar nessa frente agora.
4. Ciclo Snapshots — ainda não investigado.
5. LRW/LRV/LRC-limbo/LRCV item-a-item — D, bloqueado por gap de dado (`usuario_id`/`categoria_id` ausente em ~34 transações).

## Protocolo de sessão nova

1. Este arquivo
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir
4. `docs/MANUAL_OPERACIONAL_AGENTES.md`
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
6. **Se algum erro de console parecer "só do ambiente de preview local"**: checar `document.getElementById('mainIframe')` antes de descartar — o preview local desta sessão faz login automático de verdade, não é sempre a tela de login estática.
