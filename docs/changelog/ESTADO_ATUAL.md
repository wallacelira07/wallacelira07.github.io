# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, modo aceleração (governança encerrada em `7f8c910`, usuário autorizou fila contínua sem checkpoints). HEAD após este bloco: `caixaBoletos` — 3 IDs de DOM que ainda mostravam V1 puro (`cxBoletosPct`/`cxBoletosBar`/`balResBoletos`) migrados para V2, reaproveitando o fetch já existente do Onda 1 (sem tabela/RPC nova). Validado ao vivo (Supabase real, sem login — `Sistema_Wallace_Lira_Completo.html` roda standalone): R$1.488,42 / 57,2% / mesma largura de barra / R$1.488,42, zero erro de console.

## Métrica

✅ 47 consumidores removidos: +1 Boletos (`cxBoletosPct`/`cxBoletosBar`/`balResBoletos`), +4 caixas (linha "Reservas" de Bens Duráveis/Eventos/Seguro Emplacamento/Escola de Júlio), +5 Patrimônio (`bfinReserva`/`bfinBTG`/`bfinNectonCC`/`bpFinanciamentoCasa`/`bpConsorcioAuto`, seção "Balanço Patrimonial") — mesma classe de bug nos 3 casos
✅ ~16 exceções formais
✅ ~36 consumidores restantes

**Achado sistêmico** (3 ocorrências do mesmo padrão nesta rodada): quando uma caixa/valor patrimonial aparece em 2 pontos de exibição diferentes (card + linha do Balanço, ou card "Meta do Milhão" + seção "Balanço Patrimonial"), as Ondas anteriores só migraram 1 dos 2 ids. Boletos e as 4 caixas de Reservas: auditados por completo, não sobra mais nenhum caso — os `balRes*`/`balOp*` restantes em V1 (`balOpPixVanessa`/PGV, `balResLance`) são intencionais (divergência real não resolvida, já documentada). Patrimônio: os 5 ids duplicados corrigidos; os TOTAIS compostos da seção Balanço (`balFinanceiroTotal`, `balAtivosTotal`, `balPatrimonioLiquido`/`TotalGeral`) ficam de propósito em V1 — misturam componentes sem V2 ainda (físico: casa/apartamento/jazigo/solar/carro; PGBL; FGTS; consórcio casa pelo valor pago), não é o mesmo padrão simples de duplicata.

**Nota**: `CRONOGRAMA_BOLETOS_FIXOS`/`BOLETOS_TRANSACOES`/`aplicarBoletosVencidosAutomaticamente()` continuam existindo em `app.js`/`vars-caixas.js` — o padrão desta migração (igual a todas as ondas anteriores) é sobrescrever só a exibição em DOM com V2, mantendo o cálculo V1 internamente vivo (usado por auditoria/validação runtime). "Consumidor removido" = ID de DOM que já não mostra mais valor derivado só de V1.

**Próximo item da fila**: Pluggy/Mercado Pago/Ciclo Snapshots continuam Classe C, não abrir agora. Buscando próximo candidato A/B fora desses três — próxima varredura: chaves ainda não triadas fora do bloco Operacional (já esgotado) e fora de Livro Razão (LRR/LRS/LRC, sem array V1 migrado, provavelmente Classe C/D).

## Endurecimento de governança dos agentes Claude (08/08/2026, mesma sessão)

Pedido explícito do usuário, tratado como etapa obrigatória da conclusão da V2 — não é atualização cosmética de documento, é sobre garantir que qualquer Claude novo (qualquer conta, qualquer dispositivo) comece alinhado à V2.

**Confirmado pelo usuário**: só `wallace.termica@gmail.com` interage com Claude Chat. As outras 2 contas (`wallace.servidor@wartsila.com`, `wallace.lira@wartsila.com`) não usam Claude Chat para este sistema — isso eliminou a maior parte da complexidade de sincronização multi-conta originalmente levantada.

**Implementado**:
- `docs/MANUAL_OPERACIONAL_AGENTES.md` — nova seção 0 (Nível de Confiança da Informação: A=Supabase verificado, B=repositório verificado, C=usuário informou, D=hipótese; regra A>B>C>D, nunca apresentar D como fato) e nova seção 11 (Governança Multi-Conta e Bootstrap de Novos Chats: declara este manual como documento mestre, `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` como derivado/entrada do Claude Chat, tabela Claude Chat × Claude Code, fluxo de manutenção pra evitar divergência futura).
- `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` — novo, respostas objetivas às 10 perguntas do usuário sobre governança (Custom Instructions vs Project Knowledge vs repositório, fonte canônica, bootstrap, etc.), já corrigido para refletir a conta única.
- `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (Google Doc, salvo direto, sem passar por `git`) — seções 15 (Nível de Confiança) e 16 (Documento Mestre e Governança) adicionadas. **Nota técnica**: a inserção via automação de navegador caiu logo após a introdução em vez do fim do documento (limitação da ferramenta de automação, não do conteúdo) — conteúdo íntegro e completo, só com ordem de seção não-sequencial (15/16 aparecem antes da seção 1). Cosmético, não afeta a leitura.

**Pendente do usuário** (fora do alcance de qualquer agente — exige login em `wallace.termica@gmail.com`): criar um Project "Sistema Wallace Lira", anexar o Google Doc como Project Knowledge, definir Custom Instructions curto apontando pro Project. Sem isso, um chat novo não recebe o documento automaticamente. Texto sugerido e detalhe completo em `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` seção 10.

## Trabalho desta rodada, pendente de commit

- `docs/MANUAL_OPERACIONAL_AGENTES.md` (seções 0 e 11 novas + correção de "3 contas" → "conta única" na seção 11.1/11.5).
- `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` (novo arquivo).

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
