# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão** (nunca acumula). Se algo aqui contradiz o `HISTORICO_PASSAGENS_DE_TURNO.md`, este arquivo vence.

Última reescrita: 06/08/2026 (mesma rodada, após FASE 2E). **Regra fixa**: sempre entregar este documento junto com o pacote do site atualizado.

---

## Estado geral

**Só `app.js` foi tocado nesta rodada** — única alteração de código de produção da sessão, escopo estritamente limitado ao aprovado (Caixa Variável, substituição real do valor exibido). `Sistema_Wallace_Lira_Completo.html` teve **só o rodapé de versão atualizado à mão** (`parte 138` → `parte 139`, regra de sempre atualizar antes de entregar) — nenhuma outra linha do HTML mudou (confirmado por diff contra o zip anterior, idêntico fora do rodapé). `FinanceEngine.js`, `Comparator.js`, `FinanceService.js` e todos os outros Services continuam **byte-idênticos** ao pacote anterior (confirmado por md5sum) — nenhum Service/Engine foi criado ou alterado.

## FASE 2E — Primeira SUBSTITUIÇÃO REAL (Caixa Variável) — CONCLUÍDA

Escopo autorizado e cumprido à risca: **só Caixa Variável**, **o valor exibido na UI passa a vir do FinanceEngine (V2)**, mantendo intactos o cálculo antigo (V1), o Comparator e os logs já existentes da FASE 2D — nada foi apagado.

### O que foi feito

O bloco `experimentalCaixaVariavelViaFinanceEngine()` da FASE 2D (só leitura/console) foi **renomeado para `substituirCaixaVariavelViaFinanceEngine()`** e ganhou um passo novo, adicionado **depois** do log `[OK]` já existente (branch `[WARN]` continua idêntico, ver abaixo):

1. **V1 e V2 continuam calculados exatamente como na FASE 2D** — mesma fonte (`VARS.CICLO_SNAPSHOTS[VARS.cicloAtual].caixaVariavelSaldoReal`), mesmo fetch em `caixas`/`transacoes` (Caixa Variável, Supabase relacional), mesmo `WallaceFinanceEngine.calcularSaldoCaixa()`, mesma comparação via `WallaceComparator.compararLote()`. **Nenhuma dessas 4 linhas foi tocada.**
2. **Novo**: só quando `lote.totalDivergente === 0` (Comparator confirma V1=V2), o valor V2 é escrito em `REG.caixaVariavel.saldoReal` (**nunca em `VARS`, nunca no snapshot** — o V1 continua existindo e sendo calculado normalmente, só deixou de ser o que aparece na tela), `REG.caixaVariavel.disponivel` é recalculado a partir dele (`saldoReal - comprometido`, mesma fórmula que já existia em `recalcularAgregadosDerivados()`), e a UI é re-renderizada chamando **funções que já existiam** (`hydrate()`, `atualizarGraficosPorCiclo()`, `WallaceBus.emit('saldoAtualizado', ...)`) — nenhuma renderização nova foi escrita.
3. **Segurança**: se o Comparator detectar divergência, o branch `[WARN]` (idêntico ao da FASE 2D, só com uma frase a mais dizendo que a substituição não foi aplicada) roda e **nada é escrito em `REG`** — a tela permanece no V1, sem risco de mostrar um valor não confirmado.
4. **Escopo de ciclo**: como a V2 ainda não tem conceito de ciclo (nenhuma tabela relacional tem coluna de período — ver `ARQUITETURA_ERP_WALLACE_V2_ATUALIZADA.md`), a substituição só é válida pro ciclo vivo em que foi calculada (`VARS.cicloAtual` no momento deste boot). Um listener em `WallaceBus.on('cicloAlterado', ...)` reaplica a substituição se o usuário voltar pro mesmo ciclo vivo; em qualquer ciclo diferente (ex: um ciclo fechado), `recalcularAgregadosDerivados()` já resincroniza `REG.caixaVariavel.saldoReal` a partir do V1 normalmente, sem nenhuma ação do bloco novo — a tela mostra o V1 como sempre mostrou, comportamento inalterado.

### Validação feita nesta rodada (harness Node, fora do navegador)

Construído um harness (`node`, mocks de `fetch`/`REG`/`VARS`/`WallaceBus`/`hydrate`/`atualizarGraficosPorCiclo`, código real extraído do `app.js`) cobrindo os 2 cenários:

| Cenário | `REG.caixaVariavel.saldoReal` após rodar | `hydrate()`/`atualizarGraficosPorCiclo()` chamados? |
|---|---|---|
| V1=V2 (sem divergência) | Passa a ser o valor do FinanceEngine (V2) | Sim, 1×, mais 1× extra ao reemitir `cicloAlterado` pro mesmo ciclo |
| V1≠V2 (divergência proposital, R$26,80 de diferença) | **Permanece o V1** — nada escrito em `REG` | **Não** — 0 chamadas, confirmando que a substituição não roda sem confirmação do Comparator |

Também confirmado no cenário sem divergência: reemitir `cicloAlterado` pra um ciclo **diferente** do vivo (`2026-06`) **não** reaplica a substituição (0 chamadas extras de `hydrate()`), e `VARS.CICLO_SNAPSHOTS` permanece intocado nos dois cenários.

- `node --check app.js` → OK.
- Diff completo contra o `app.js` da rodada anterior: só o bloco da FASE 2D/2E foi alterado (93 linhas de diff, todas dentro desse único bloco) — confirmado, nenhuma outra função tocada.
- **Não testado em navegador real** (sem rede neste ambiente) — o fetch real ao Supabase e o re-render via `hydrate()`/`atualizarGraficosPorCiclo()` num DOM real não foram exercitados ao vivo, só via harness Node com mocks fiéis à assinatura real dessas funções. Recomendação para a próxima sessão com navegador: recarregar o site, confirmar `[OK] Caixa Variável V1=V2` no console seguido de `[FASE 2E] UI da Caixa Variável agora exibe o valor do FinanceEngine...`, e confirmar visualmente que o card da Caixa Variável (saldo real e disponível) e os 2 gráficos (`cVariavel`, `g_cVariavel`) mostram o mesmo valor de antes (V1 e V2 devem bater — se não baterem, o `[WARN]` já teria impedido a troca, mas vale conferir visualmente pra fechar o ciclo de validação).

## Marco de transição — 5 de 5 critérios atendidos (mantido da rodada anterior)

| Critério | Status |
|---|---|
| ✓ Services concluídos | **Sim** |
| ✓ Nenhuma fórmula duplicada | **Sim** |
| ✓ Comparador funcionando | **Sim** |
| ✓ 78+ testes passando | **Sim** (85, inalterado nesta rodada — nenhum teste novo) |
| ✓ `app.js` consumindo Service de forma real | **Sim, agora além de experimental** — Caixa Variável, `FinanceEngine`+`Comparator`, valor exibido na UI vem do V2 quando confirmado sem divergência |

## RECOMENDAÇÃO OBJETIVA: **PRIMEIRA SUBSTITUIÇÃO REAL FEITA — AGUARDANDO CONFIRMAÇÃO EM NAVEGADOR**

Restrita à Caixa Variável, exatamente como autorizado. As demais candidatas (Livro LRC, Reembolsos, Patrimônio, Meta do Milhão, PIB Wallace, Necessidade Líquida, Modo Operacional, ROC) **continuam com o mesmo status da rodada anterior** (ver `FASE_2C_SERVICES.md`) — nada foi avançado nelas nesta rodada, por proibição explícita do escopo.

## Próximo passo real

Aguardando decisão do usuário: confirmar em navegador real que (a) o console mostra `[OK]` seguido de `[FASE 2E]` sem erro, (b) o card/gráficos da Caixa Variável continuam corretos visualmente, e então decidir se a próxima rodada abre uma nova candidata (Livro LRC é a mais preparada, mesma ordem já definida em `FASE_2C_SERVICES.md`) — sempre uma candidata por vez, mesmo padrão desta rodada.

## Protocolo de sessão nova

1. `MANUAL_TROCA_DE_CHAT.md` → 2. Este arquivo → 3. `ARQUITETURA_ERP_WALLACE_V2_ATUALIZADA.md` → 4. Supabase real via MCP → 5. `MAPA_CAMPOS_SUPABASE_VS_CODIGO.md` → 6. `AUDITORIA_DOMINIO_1..6.md` + `ENGENHARIA_REVERSA_FUNCOES_IMPURAS.md` + `MATRIZ_MIGRACAO_FASE2.md` + `MAPA_COMPLETO_APLICAR_CICLO.md` + `AUDITORIA_IMPACTO_BUG_LRC.md` + `CORRECAO_BUG_LRC.md` + `FASE_2C_SERVICES.md` + `src/services/*` (tudo dentro do zip) → 7. `HISTORICO_PASSAGENS_DE_TURNO.md` só sob demanda.
