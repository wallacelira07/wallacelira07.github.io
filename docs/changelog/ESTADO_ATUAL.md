# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, continuação da sessão do dia, HEAD `214e0f5` + trabalho descrito abaixo (`consorcioCasaProximaAssembleia`, aguardando commit).

## NOVA DIRETRIZ DO USUÁRIO (válida daqui pra frente, todas as sessões)

Critério de execução autônoma: **"Isso reduz dependência da V1 sem criar risco?"** Se sim (sem decisão de negócio pendente, sem risco financeiro, sem risco de perda de dado, sem bloqueio explícito do usuário, caminho técnico claro) — **executar direto**: investigação → conclusão → implementação → validação → commit → próximo item. Só parar e perguntar se: perda potencial de informação, decisão de negócio real, conflito com regra já definida, ou risco financeiro real.

**Regra adicional dada nesta sessão**: esgotar completamente candidatos A/B do bloco "Operacional" antes de investir em qualquer domínio Classe C (Pluggy, Mercado Pago, Ciclo Snapshots — todos já triados e confirmados C, não reabrir sem decisão explícita do usuário).

## BUG ESTRUTURAL RAIZ ENCONTRADO E CORRIGIDO (commitado `214e0f5`) — leia antes de tudo

O `WallaceFinanceService` (app.js) tem 15 métodos de fetch com cache em memória (`this._cache`, `Map` sem TTL). **5 deles** (`getPatrimonioV2`, `getCicloSolarAbertoV2`, `getIndicador`, `getReembolsoWartsilaCicloV2`, `getP2PV2`) cacheavam o ARRAY bruto da resposta mas retornavam o objeto desembrulhado (`dado[0]`) — na 1ª chamada funcionava, a partir da 2ª (cache hit) devolvia o array errado, e qualquer `.campo` lido virava `undefined` → `NaN`/exceção. **Causa única de TODOS os bugs "fantasma" reportados nesta sessão que eu não conseguia reproduzir isolado**: PETRS368W5 aparecendo como ativa, frescor mostrando "crítica" pra dado fresco, NaN em P2P/Wärtsilä (Bloco 26, nunca resolvido até agora). Corrigido nos 5 métodos (cache e retorno agora sempre guardam o mesmo valor) + 2 bugs colaterais (`comparacaoCDI` null sem guard em 3 lugares de `hydrate-roc.js`; `formatarDataBR` sem try/catch em `hydrate-onda4-investimentos.js`) + coluna "Vencimento" por linha devolvida à tabela de opções ativas.

**Validado com prova real dentro do app** (não teste isolado): descoberta importante de ambiente — o preview local (`.claude/launch.json`) faz login automático e injeta o app num `#mainIframe` de verdade; erros de console que eu vinha descartando como "limitação de login" eram bugs reais. Chamei `getPatrimonioV2()` 2x seguidas via `iframe.contentWindow.eval()` — antes divergia entre chamadas, agora sempre igual. `hydrateROC()` chamado direto: PETRS368W5 corretamente na tabela de vencidas, 2 posições ativas cada uma com sua data. DOM real: `p2pCapitalTotal`="R$ 110,00", `reembRecebidos`="R$ 5.254,98", `patTotal`="R$ 120.375,65" — todos limpos, zero NaN. Console geral: zero erros.

**Pendente**: commit + push.

## Commitado nesta sessão

- `5f36f38` — `HISTORICO_ERP_TODOS_CICLOS` migrado pra view `vw_historico_erp_completo` (cobertura 224/230 verificada completa, 6 exceções documentadas).
- `d5843e1` — `creditoUberBalance`/`creditoShellBox`/`creditoKmvIpiranga` migrados pra `indicadores`.
- `ecec857` — `proLaboreFixo` (salário-base fixo) migrado pra `indicadores`.
- `214e0f5` — bug estrutural do cache `WallaceFinanceService` (5 métodos) + correções colaterais + coluna Vencimento.

## Varredura completa do bloco "Operacional" (~26 chaves restantes antes desta rodada)

Feita a pedido do usuário ("esgotar Operacional antes de qualquer Classe C"). Resultado por chave:

| Chave | Classe | Motivo |
|---|---|---|
| `consorcioCasaProximaAssembleia` | **A — migrado nesta rodada** | Dado já vinha na mesma fetch de `getPatrimonioV2()` (vw_patrimonio_v2), só nunca tinha sido ligado ao DOM. Zero fetch novo. |
| `FGTS` (chave topo, distinta de `patFgts`) | Morta | Zero consumidor real no frontend — `grep` não achou nenhuma leitura de `VARS.FGTS`. Não é mais um "consumidor" de fato. |
| `mesesRestantesFinanciamentoCasa`/`passivoFinanciamentoCasa`/`parcelaConsorcioAuto` | Já resolvido | `hydrate-onda4-patrimonio.js` já escreve o DOM correspondente direto da V2 (`p.passivo_financiamento_casa` etc.), depois que `hydratePatrimonio()` (V1) escreve primeiro — o valor V1 é sempre sobrescrito, nunca visível. Nenhuma ação necessária. |
| `opcoesVendidasValorMercado` | Já resolvido | Recalculado em runtime a partir de `VARS.opcoesVendidasDetalhe`, que já vem 100% da V2 desde a Onda 4. |
| `reembolsoCicloTotal`/`provisionadoWartsila`/`faturaWartsila` | Já resolvido | Onda 4 Wärtsilä já sobrescreve. |
| `mbLRCConfirmado`/`mbLRSConfirmado`/`mbLRVConfirmado`/`mbLRWConfirmado` | **D** | Alimentam `mbDetalhe`/headline totals (`cartaoMBTotal`) — mesma exceção formal já documentada (`EXCECAO_ARQUITETURAL_HEADLINE_TOTALS_CARTOES.md`), não reabrir. `mbLRWConfirmado`/`mbLRVConfirmado` específicos já migrados via Onda 3 (`hydrate-onda3-lrwlrv.js`). |
| `reservaRetiradaProgramada` | C (baixo prioridade) | Único consumidor alimenta `aporteBTGProgramado.rendimentoReserva`, já classificado como baixo impacto/derivado. |
| `ENERGISA_TARIFA_COMPOSICAO` | C | Precisa de tabela V2 nova (já documentado desde a seção 41 do plano), não existe ainda. |
| `dataNascimentoWallace` | C (ROI~0) | Constante permanente, nunca muda — `indicadores.valor` é numérico, não comporta data sem acomodação de schema pra ganho quase nulo. |
| `coberturaGarantidaConfirmada` | **D** | Por definição só preenchido por confirmação manual explícita do usuário — depende de decisão humana, nunca fórmula automática. |
| `PIB_WALLACE_HISTORICO`/`PADROES_RUIDO_TRANSACAO`/`DEFICIT_ZERO_PISO_OVERRIDE` | C | RPCs existentes gravam DENTRO do próprio `wallace_dados` (`jsonb_set`), nunca criaram tabela V2 real — precisam de modelagem (série histórica por ciclo). |
| `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES`/`EXTRAORDINARIO_BENS_DURAVEIS` | C | Acoplados a lógica de auto-crédito de boletos (`app.js:851-861`, cria transações novas a partir do cronograma) — mais complexo que um scalar swap, precisa de investigação própria antes de classificar com segurança. |
| `aporteBTGProgramado` | C (baixo prioridade) | Já majoritariamente derivado em runtime, baixo impacto. |

**Conclusão da varredura**: candidatos A/B do bloco Operacional **esgotados** por ora — restam só C (modelagem) e D (exceção/decisão humana). `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES` são os únicos ainda com potencial de reclassificação (não totalmente investigados a fundo), mas não são scalars simples como os já migrados.

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 36 commitados; +1 (`consorcioCasaProximaAssembleia`) pronto, aguardando push |
| Exceções formais (fora da métrica) | ~10 + 2 novas (TXCON000001/002) + 4 novas (mb LRC/LRS/LRV/LRW Confirmado, headline totals) |
| Restantes | ~46 após o push |

**Fora do escopo, por instrução explícita do usuário**: 301×361 (Solar), Caixa Lance, 4 caixas de causa indeterminada, TX000203-208, headline totals Mastercard/Visa (inclui os 4 mb*Confirmado acima).

## Próximos candidatos

1. `CARTAO_PLUGGY_MAPA` — bloqueado, aguardando o usuário passar os finais de cartão do Itaú.
2. `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES` — único remanescente do bloco Operacional ainda não classificado com segurança, precisa de investigação própria da lógica de auto-crédito.
3. Pluggy, Mercado Pago, Ciclo Snapshots — todos C, aguardando decisão do usuário sobre investir em modelagem nova.
4. LRW/LRV/LRC-limbo/LRCV item-a-item — D, bloqueado por gap de dado.

## Protocolo de sessão nova

1. Este arquivo
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir
4. `docs/MANUAL_OPERACIONAL_AGENTES.md`
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
6. **Se algum erro de console parecer "só do ambiente de preview local"**: checar `document.getElementById('mainIframe')` antes de descartar — o preview local desta sessão faz login automático de verdade, não é sempre a tela de login estática.
