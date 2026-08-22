# Arquitetura final — `necessidadeTotalBruta` e campos derivados (pós Sub-fase B, 22/08/2026)

Documento pedido no critério de encerramento da Sub-fase B (`PLANO_MIGRACAO_FRONTEND_CONSUMO_RPC.md`, bloco 46 do `PASSAGEM_DE_TURNO.md`). Consolida em 1 lugar o que ficou espalhado em comentários de código.

## Fonte de verdade por campo

| Campo (`REG.operacional.*`) | Fonte oficial hoje | Como |
|---|---|---|
| `totalOperacional` | **RPC** (`rpc_necessidade_total_bruta`) | sobrescrito por `aplicar-rpc-necessidade.js` |
| `necessidadeTotalBruta` | **RPC** | idem |
| `coberturaGarantida` | **RPC** | idem |
| `necessidadeLiquida` | **RPC** | idem |
| `saldoCiclo` / `modoOperacional` / `balanco.fluxo.saidas` / `balanco.fluxo.resultado` | **RPC** (derivados dos 4 acima) | recalculados dentro de `aplicar-rpc-necessidade.js` depois da sobrescrita |
| `totalOpDetalhe.{boletos,parcelas,consorcios,recorrencias,aportesPat,provMP,assinaturas}` | **JS, leitura ao vivo** (não migrado) | cada um tem sua própria fonte V2 (ondas/hydrate específicos) — a RPC lê as MESMAS fontes, não há "2 verdades", só 2 leituras do mesmo dado |
| `reembolsoSobraPessoal` | **JS** (`recalcularReembolsos()`) | usado só pro card "Sobra Pessoal" (bruto, antes do Manejo) — a RPC não expõe esse valor isolado, só o líquido (`cobertura_garantida`) |
| `deficitCaixasSemLrei` | **JS, leitura ao vivo** (`hydrate-deficit-caixas-sem-lrei.js`) | complexo, própria cadeia de 4 fontes — RPC recalcula o TOTAL internamente pra compor `necessidade_total_bruta`, mas o detalhamento por caixa continua só em JS |

## Por que a fórmula JS continua no código (não foi deletada)

`recalcularNecessidade()` roda primeiro, síncrona, e dá um valor imediato — é o **fallback**, não um cálculo morto. `aplicar-rpc-necessidade.js` roda depois (assíncrono) e sobrescreve com o valor oficial. Se a RPC falhar (rede, ciclo fechado), a tela mantém o valor JS — nunca fica em branco. Isso não é duplicação acidental: é a mesma arquitetura já usada em `aplicarOnda4Wartsila()` (V1 síncrono → V2 assíncrono sobrescreve), escolhida deliberadamente porque converter `recalcularNecessidade()` inteira em `async` propagaria por dezenas de call sites síncronos no boot/reprocessamento — risco desproporcional ao ganho.

## Ciclo fechado — limitação conhecida, não escondida

A RPC só aceita `p_ciclo` = ciclo aberto (boletos/consórcios/aportes_pat/orçamento/déficit ainda leem estado ao vivo, sem snapshot por ciclo — Fase 2+ não implementada). Pra ciclo fechado, o valor vem do snapshot congelado em `ciclos_financeiros_snapshots` (ramo próprio em `recalcularNecessidade()`), e a RPC rejeita a chamada (guard, exception) — `aplicar-rpc-necessidade.js` trata isso como "manter valor local", correto por design, testado ao vivo (bloco 46).

## Shadow mode (permanece ativo)

Toda vez que `aplicar-rpc-necessidade.js` roda com sucesso, grava em `rpc_homologacao_necessidade_log` (Supabase) os 13 campos comparados (JS local × RPC), fire-and-forget. Não é mais o mecanismo de decisão (a RPC já é oficial), é evidência contínua — próximo fechamento de ciclo real (~24-25/09/2026) testa o caminho "ciclo fechado → snapshot" de novo, naturalmente.

## Fora de escopo (Fase 2+, não tocado)

Balanço Patrimonial, Patrimônio/Meta do Milhão, Evolução 12 ciclos, detalhamento de Déficit LREI por caixa — todos continuam 100% JS. Ver `PLANO_MIGRACAO_CALCULOS_FINANCEIROS_SUPABASE.md` pra ordem de dependência caso uma próxima fase seja aprovada.
