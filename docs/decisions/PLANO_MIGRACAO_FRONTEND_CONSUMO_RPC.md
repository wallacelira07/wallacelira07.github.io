# Plano — migração do frontend para consumir `rpc_necessidade_total_bruta` (22/08/2026)

**Status: só planejamento, aprovado pelo usuário. Nenhuma linha de código do site foi alterada por este documento.** Instrução explícita: "Não altere o consumo atual do site até essa homologação estar concluída."

## Onde este plano se encaixa

Fase 1b (blocos 42-44) terminou com: `rpc_necessidade_total_bruta` reescrita, determinística por `p_ciclo` (Regra 1), e homologada campo a campo contra a UI autenticada do ciclo `2026-07` (9 campos, 0 divergências — ver bloco 44 do `PASSAGEM_DE_TURNO.md`). O que falta, na ordem que o usuário definiu:

1. ✅ Homologar RPC × UI — ciclo `2026-07` feito. Cada ciclo novo que fechar repete a mesma checagem (processo contínuo já estabelecido).
2. 🔵 **Este documento** — planejar como o JS vai consumir a RPC, sem implementar ainda.
3. ⛔ Implementar a troca de consumo — só depois que a amostra de homologação crescer o suficiente e o usuário aprovar explicitamente esta fase.

## O que a RPC substitui, exatamente

`rpc_necessidade_total_bruta()` cobre 9 dos campos que hoje `recalcularNecessidade()` (`src/financeiro/operacional/recalcular-necessidade.js`) calcula em JS: `boletos`, `recorrencias`, `assinaturas`, `orcamento_operacional`, `deficit_caixas_sem_lrei`, `prov_mp`, `cobertura_garantida` (via a cascata de reembolso, calculada dentro da própria RPC), `total_operacional`, `necessidade_total_bruta`, `necessidade_liquida` — todos homologados exatos no bloco 44.

**Não cobre** (ficam JS/live como estão, sem mudança neste plano): `parcelas`/`consorcios`/`aportes_pat` como componentes de entrada já são lidos ao vivo tanto pela RPC quanto pelo JS (mesmas fontes), então não há "troca" real aí — e a projeção de 12 ciclos (`REG.evolucao.*`, índices 1-11), que é 100% JS (fórmula de decaimento de parcelas + aportes incrementais), não faz parte do escopo desta RPC e não deveria — é projeção, não fato do ciclo atual.

## O obstáculo real: síncrono × assíncrono

`recalcularNecessidade()` é chamada de forma **síncrona**, no meio de uma cadeia longa de outras funções síncronas (boot inicial + toda vez que uma edição dispara reprocessamento — ex: `editarReembolsoManejo()`, `aplicarDeficitCaixasSemLrei()`). Código logo depois dessas chamadas lê `REG.operacional.necessidadeTotalBruta` synchronously, sem esperar nada. Uma chamada à RPC é uma requisição de rede (`fetch`), inerentemente assíncrona. Substituir a fórmula JS por uma chamada de rede direto nessa função quebraria essa cadeia inteira (viraria `async`, e toda função que chama `recalcularNecessidade()` — e as que chamam essas — precisaria virar `async` também, em cascata, por todo o codebase). Isso **não é um detalhe pequeno** — é o tipo de mudança estrutural que esta migração inteira nasceu tentando evitar (a mesma classe de bug de "esqueceu de recalcular/aguardar" que motivou a migração pra SQL, começando no bloco 41).

## Estratégia recomendada: 2 sub-fases, não 1 salto

### Sub-fase A — "sombra" (paralelo, sem trocar o que a tela mostra)

Reaproveitar exatamente o padrão que já existe em `recalcular-necessidade.js:177-190` (`registrarIndicador`, fire-and-forget, não trava o render se a rede falhar): adicionar 1 chamada fire-and-forget à `rpc_necessidade_total_bruta()` no mesmo ponto, que **só compara e loga divergência** (`console.warn` se `Math.abs(rpc.necessidade_total_bruta - REG.operacional.necessidadeTotalBruta) > 0.01`, mesmo padrão de tolerância já usado em `aplicarOnda4Wartsila()` linha 76) — nunca escreve em `REG`, nunca muda o que a tela mostra. Zero risco pro usuário, zero mudança visível. Isso transforma a homologação manual (que hoje depende de eu ler a tela com o usuário logado) em um processo automático rodando toda vez que o site abrir, acumulando evidência de paridade sozinho, ciclo após ciclo, sem esperar eu voltar a cada virada.

### Sub-fase B — corte real (só depois de aprovação explícita)

Só depois que a Sub-fase A acumular paridade 100% por tempo suficiente (a definir com o usuário — sugestão: até o próximo fechamento de ciclo pelo menos, pra ter uma 2ª amostra real, já que hoje só existe 1 ciclo homologável), aí sim trocar de fato: `recalcularNecessidade()` passa a aguardar a RPC (função vira parte da cadeia assíncrona que já existe hoje pra Onda 4 Wärtsilä/Onda 5, mesmo padrão de `await Promise.all([...])` já usado em `aplicarOnda4Wartsila()`), com fallback pro cálculo JS local se a RPC falhar (rede fora, RPC indisponível) — nunca deixar a tela quebrada por causa da migração.

## Por que não pular direto pra Sub-fase B

1. O guard da RPC hoje só aceita `p_ciclo` = ciclo aberto (boletos/consórcios/aportes_pat/déficit ainda são estado ao vivo, não têm snapshot por ciclo — ver bloco 43). Se o corte acontecer bem na virada de um ciclo, existe uma janela real onde a RPC pode rejeitar a chamada ou devolver dado do ciclo errado por race condition (JS já mudou `VARS.cicloAtual`, RPC ainda não tem `reembolso_wartsila_ciclo`/`parcelas_historico_ciclo` daquele ciclo populados) — precisa de teste manual atravessando uma virada real antes do corte, não só teoria.
2. Amostra de homologação de 1 ciclo é pouca informação pra uma mudança estrutural (síncrono→assíncrono) que toca o boot inteiro do site. O usuário já disse explicitamente que quer múltiplos ciclos antes da substituição definitiva — a Sub-fase A entrega isso automaticamente, sem trabalho manual repetido.
3. Sub-fase A é reversível com 1 linha (comentar a chamada). Sub-fase B mexe em como o boot do site funciona — reversão é mais cara se algo der errado.

## Escopo explicitamente fora deste plano

- Fase 2+ (déficit LREI detalhado, Balanço, Patrimônio, Evolução 12 ciclos) — continua só planejada em `PLANO_MIGRACAO_CALCULOS_FINANCEIROS_SUPABASE.md`, nenhuma relação de dependência nova criada aqui.
- Qualquer alteração em `Sistema_Wallace_Lira_Completo.html` ou nos arquivos de `src/financeiro/operacional/` — nada foi tocado, este é só o plano.

## Próximo passo concreto (aguardando autorização explícita, item por item)

1. Implementar a Sub-fase A (chamada-sombra + log de divergência) — baixo risco, reversível, não muda o que a tela mostra.
2. Deixar rodando até acumular pelo menos +1 ciclo fechado homologável (o próximo fechamento, ~24-25/09/2026 pelo calendário do ciclo atual).
3. Repetir a homologação manual campo a campo (mesma tabela do bloco 44) nesse ciclo novo, quando fechar.
4. Só então voltar ao usuário com a evidência acumulada e pedir aprovação explícita pra Sub-fase B.
