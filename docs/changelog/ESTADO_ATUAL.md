# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, fechamento da sessão. HEAD `be5395f` (todo o trabalho da sessão já commitado e enviado). `docs/MANUAL_OPERACIONAL_AGENTES.md` tem 1 alteração local não commitada (seção 1.1 nova, ver abaixo) — aguardando aviso ao usuário antes do commit, conforme regra permanente.

## NOVA DIRETRIZ DO USUÁRIO (válida daqui pra frente, todas as sessões)

Critério de execução autônoma: **"Isso reduz dependência da V1 sem criar risco?"** Se sim (sem decisão de negócio pendente, sem risco financeiro, sem risco de perda de dado, sem bloqueio explícito do usuário, caminho técnico claro) — **executar direto**: investigação → conclusão → implementação → validação → commit → próximo item. Só parar e perguntar se: perda potencial de informação, decisão de negócio real, conflito com regra já definida, ou risco financeiro real.

**Regra adicional (confirmada nesta sessão)**: não abrir Pluggy, Mercado Pago nem Ciclo Snapshots agora — todos Classe C (modelagem nova pesada), sem ROI melhor que o que resta do bloco Operacional. Só reabrir com decisão explícita do usuário.

**Regra nova (pedido explícito do usuário, formalizada nesta sessão)**: todo agente Claude (Web ou Mobile) aberto neste projeto deve operar a V2 como sistema principal — não só consultar. Formalizado como seção 1.1 do `MANUAL_OPERACIONAL_AGENTES.md` (ver "Trabalho desta sessão" abaixo).

## BUG ESTRUTURAL RAIZ ENCONTRADO E CORRIGIDO (commit `214e0f5`, já em produção)

O `WallaceFinanceService` (app.js) tinha 5 métodos de fetch (`getPatrimonioV2`, `getCicloSolarAbertoV2`, `getIndicador`, `getReembolsoWartsilaCicloV2`, `getP2PV2`) que cacheavam o ARRAY bruto da resposta mas retornavam o objeto desembrulhado (`dado[0]`). 1ª chamada funcionava; a partir da 2ª (cache hit) o cache devolvia o array errado, e qualquer `.campo` lido virava `undefined` → `NaN`/exceção. **Causa única confirmada** de: PETRS368W5 aparecendo ativa (vencida 31/07), frescor "crítica" pra dado fresco, NaN em P2P/Wärtsilä. Corrigido nos 5 métodos + 2 bugs colaterais (`comparacaoCDI` null sem guard em `hydrate-roc.js`; `formatarDataBR` sem try/catch em `hydrate-onda4-investimentos.js`) + coluna "Vencimento" por linha devolvida à tabela de opções ativas.

Validado com prova real dentro do app (não teste isolado): chamadas repetidas via `iframe.contentWindow.eval()` deixaram de divergir; DOM real conferido (`p2pCapitalTotal`="R$ 110,00", `reembRecebidos`="R$ 5.254,98", `patTotal`="R$ 120.375,65"); console geral zerado.

**Descoberta de ambiente registrada**: o preview local (`.claude/launch.json`) faz login automático de verdade e injeta o app num `#mainIframe` real — erros de console não são "limitação de login do preview", são bugs de produção genuínos. Checar `document.getElementById('mainIframe')` antes de descartar qualquer erro como artefato de ambiente.

## Commitado nesta sessão

- `5f36f38` — `HISTORICO_ERP_TODOS_CICLOS` migrado pra view `vw_historico_erp_completo` (cobertura 224/230 completa, 6 exceções documentadas).
- `d5843e1` — `creditoUberBalance`/`creditoShellBox`/`creditoKmvIpiranga` migrados pra `indicadores`.
- `ecec857` — `proLaboreFixo` (salário-base fixo) migrado pra `indicadores`.
- `214e0f5` — bug estrutural do cache `WallaceFinanceService` (5 métodos) + correções colaterais + coluna Vencimento.
- `be5395f` — `consorcioCasaProximaAssembleia` migrado (dado já vinha na mesma fetch de `getPatrimonioV2()`, só nunca fora ligado ao DOM) + fecha varredura completa do bloco Operacional (~25 chaves restantes triadas, nenhuma outra migrável agora — ver `PASSAGEM_DE_TURNO.md` Bloco 28 para o detalhe por chave).

## Trabalho desta sessão ainda não commitado

- **`docs/MANUAL_OPERACIONAL_AGENTES.md` — nova seção 1.1** ("V2 como sistema principal — modo de operação nativo"), a pedido explícito do usuário: formaliza que todo agente Claude (Web/Mobile) deve operar a V2 (não só consultar) por padrão, com tabela de domínio → estrutura V2 já existente (transações, caixas, patrimônio, cartões, livros razão, parcelamentos, energia solar, investimentos, reembolsos, empréstimos internos, indicadores) e critério de sucesso. Não altera nenhuma regra de segurança existente (confirmação antes de lançar, nunca editar saldo direto, dry-run, aviso antes de commit) — é só sobre onde o dado mora, não sobre como é alterado. **Pendente**: avisar o usuário do conteúdo antes de commitar.

## Bloco "Operacional" — esgotado (candidatos A/B)

Resultado da varredura completa (~26 chaves), a pedido do usuário ("esgotar Operacional antes de qualquer Classe C"):

- **Migrado nesta rodada**: `consorcioCasaProximaAssembleia`.
- **Já resolvidas sem ação** (V1 lida mas sempre sobrescrita antes de aparecer): `mesesRestantesFinanciamentoCasa`/`passivoFinanciamentoCasa`/`parcelaConsorcioAuto`, `opcoesVendidasValorMercado`, `reembolsoCicloTotal`/`provisionadoWartsila`/`faturaWartsila`.
- **Morta**: `FGTS` (chave de topo, distinta de `patFgts`) — zero consumidor real.
- **D — exceção formal**: `mbLRCConfirmado`/`mbLRSConfirmado`/`mbLRVConfirmado`/`mbLRWConfirmado` (headline totals, exceção já documentada); `coberturaGarantidaConfirmada` (decisão humana por definição).
- **C — modelagem real necessária**: `PIB_WALLACE_HISTORICO`/`PADROES_RUIDO_TRANSACAO`/`DEFICIT_ZERO_PISO_OVERRIDE`, `ENERGISA_TARIFA_COMPOSICAO`, `dataNascimentoWallace` (ROI~0), `reservaRetiradaProgramada`/`aporteBTGProgramado` (baixo impacto).
- **Único não totalmente investigado**: `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES`/`EXTRAORDINARIO_BENS_DURAVEIS` — acoplado a lógica real de auto-crédito de boletos (`app.js:851-861`), mais complexo que scalar swap, precisa de investigação própria antes de classificar com segurança.

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 37 commitados |
| Exceções formais (fora da métrica) | ~16 |
| Restantes | ~46 |

**Fora do escopo, por instrução explícita do usuário**: 301×361 (Solar), Caixa Lance, 4 caixas de causa indeterminada, TX000203-208, headline totals Mastercard/Visa (inclui os 4 mb*Confirmado).

## Próximos candidatos

1. `CARTAO_PLUGGY_MAPA` — bloqueado, aguardando o usuário passar os finais de cartão do Itaú.
2. `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES` — único remanescente do bloco Operacional ainda não classificado com segurança.
3. Pluggy, Mercado Pago, Ciclo Snapshots — todos C, **usuário decidiu explicitamente não abrir agora**. Não reabrir sem novo pedido dele.
4. LRW/LRV/LRC-limbo/LRCV item-a-item — D, bloqueado por gap de dado.

## Protocolo de sessão nova

1. Este arquivo
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir
4. `docs/MANUAL_OPERACIONAL_AGENTES.md` — inclui a nova seção 1.1 (V2 como sistema principal), leitura obrigatória pra qualquer agente
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
6. **Se algum erro de console parecer "só do ambiente de preview local"**: checar `document.getElementById('mainIframe')` antes de descartar — o preview local desta sessão faz login automático de verdade.
