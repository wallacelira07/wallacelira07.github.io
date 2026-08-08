# RESUMO EXECUTIVO FINAL — Sistema Wallace Lira (08/08/2026)

Documento de passagem de turno pra troca de agente. Objetivo, sem prosa — para o histórico narrativo completo desta sessão, ver `PASSAGEM_DE_TURNO.md` Bloco 18. Para o estado geral, `ESTADO_ATUAL.md`.

---

## 1. O QUE JÁ ESTÁ PRONTO

| Domínio | Status | Fonte atual | Depende de `wallace_dados`? | Compatibilidade temporária? |
|---|---|---|---|---|
| Patrimônio | ✅ V2-exclusivo | `patrimonio`+`financiamentos` | Não (exceto Caixa Lance, ver bloco 3) | Não — falha na V2 = erro visível, sem fallback V1 |
| Investimentos/ROC/Opções | ✅ V2-exclusivo | `investimentos`+`indicadores` | Não | Não |
| LREI (empréstimos internos) | ✅ V2-exclusivo | `emprestimos_internos` | Não | Não |
| Cascata Reembolso Wärtsilä | ✅ V2-exclusivo | `reembolso_wartsila_ciclo` | Não (perna 4/MP pessoal fora do escopo) | Não |
| Parcelamentos (LRP/LRMP) | ✅ V2-exclusivo | `parcelas` | Não | Não |
| P2P | ✅ V2-exclusivo | `indicadores` (`P2P - *`) | Não | Não |
| Caixas — saldo (10 de 18) | ✅ Operacional | `vw_saldo_v2_por_caixa` | Não | Sim — overlay condicional (Onda 1-3, mais antigo, ainda não endurecido pro padrão V2-exclusivo) |
| Livro Razão (7 tabelas) | ✅ Operacional | `transacoes` | Não | Sim, mesmo motivo acima |
| LRW/LRV (totais) | ✅ Operacional | `vw_compromisso_cartao_por_pessoa` | Não | Sim, mesmo motivo acima |
| Solar — persistência | ✅ Sincronizada | Grava V1+V2 em paralelo | **Sim, por decisão explícita** (leitura do frontend continua V1, crédito/rateio não decidido) | Sim, deliberada |
| Qualidade da Geração (solar) | ✅ Nativo V2 | `energia_solar_geracao_diaria`+`indicadores` | Não | Não |

**Resumo**: 6 domínios 100% V2-exclusivos (sem nenhuma dependência de V1, nem leitura nem fallback). 3 domínios operacionais na V2 mas ainda com o padrão antigo de overlay (funcionam, não foram endurecidos). 2 itens solares com propósitos diferentes (persistência sincronizada ≠ decisão de fonte de leitura, que segue travada).

---

## 2. O QUE FOI MIGRADO NESTA SESSÃO

**Tabelas novas**: `financiamentos`, `emprestimos_internos`, `reembolso_wartsila_ciclo`, `reembolso_wartsila_recebimentos`.

**Colunas novas**: `patrimonio` (+`rotulo`,+`subtipo`), `investimentos` (+10 colunas: strike, vencimento, prêmios, custos, nota, exercida, data_operação).

**Views novas**: `vw_patrimonio_v2`, `vw_opcoes_vendidas_v2`, `vw_roc_opcoes_v2`, `vw_roc_carteira_v2`, `vw_emprestimos_internos_v2`, `vw_parcelamentos_v2`, `vw_p2p_v2`.

**`indicadores` (parâmetros externos, mesmo padrão do CDI)**: ROC_STATUS_LIMITES, P2P (7 escalares), SOLAR_STATUS_LIMITES.

**Scripts alterados**: `atualizar_geracao_saj.py` (+`atualizar_v2_geracao_diaria()`, sincroniza V1→V2 em paralelo, falha não derruba o script).

**Funções/módulos JS novos**: `hydrate-onda4-patrimonio.js`, `hydrate-onda4-investimentos.js`, `hydrate-onda4-lrei.js`, `hydrate-onda4-wartsila.js`, `hydrate-onda5-parcelamentos.js`, `hydrate-onda5-p2p.js`, `hydrate-onda5-qualidade-geracao.js`, `marcarIndisponivelV2()` (app.js).

**Decisões arquiteturais**:
1. Padrão consolidado: reaproveitar cálculo/render V1 já existente (nunca duplicar lógica), só trocar a origem do dado.
2. **Mudança de direção oficial**: V2 deixou de ser espelho — vira arquitetura oficial (ver bloco 6).
3. Fallback silencioso pra V1 eliminado nos 6 domínios V2-exclusivos — falha agora é visível (`⚠ Indisponível (V2)`).
4. Regra nova: domínio V2-exclusivo não recebe mais escrita em `wallace_dados` no fluxo manual de lançamento.

**Commits desta sessão** (16, **todos enviados** — `git push origin main` feito a pedido explícito do usuário, `6bd54ab..61d54de`): `a3b3034`, `d144157`, `4429a43`, `0639e37`, `755b4ba`, `b6f7f31`, `5a40eae`, `a4e2cfd`, `7aef36b`, `13e4cbe`, `a470500`, `6227d94`, `1c515d7`, `5f2c05f`, `dc0bd47`, `61d54de`.

---

## 3. O QUE AINDA ESTÁ EM V1

Evidência real: 95 chaves em `wallace_dados.dados` (`SELECT jsonb_object_keys(dados)`). Classificação:

| Item | Classificação | Motivo |
|---|---|---|
| Assinaturas (Mastercard/Visa) | 🟢 Migrável imediatamente | Categoria "Assinaturas" já existe na V2, 27 transações já classificadas — só falta 1 view |
| CARTAO_MAPA / titularidade (Mastercard/Visa) | 🟢 Já está na V2, só falta ligar no frontend | `cartoes` já tem tudo (mais atualizado até que a Política Interna) |
| Caixa Lance + 4 caixas causa indeterminada | 🟡 Depende de decisão (não reabrir — ordem do usuário) | Divergência não confirmada, usuário proibiu reabrir |
| Solar (crédito/rateio) | 🟡 Depende de evidência externa (não reabrir — ordem do usuário) | Documento original `Base_Calculo_Rateio_Solar.md` não existe no repo; sem fatura real não há prova |
| Recorrências/Corporativo (Mastercard/Visa) | 🔴 Depende de dado inexistente | 34 de 147 transações candidatas sem `categoria_id`; não existe categoria "Recorrências" ainda |
| Headline totals Mastercard/Visa (`cartaoMBTotal` etc.) | 🔴 Bloqueado por design | Verdade externa reconciliada à mão ("fatura sempre vence") — não é modelável sem reabrir reconciliação |
| LRW/LRV/LRC-limbo/LRCV item-a-item | 🔴 Depende de dado inexistente | 147 transações candidatas vs 43 itens V1, sem coluna discriminadora — mesmo gap do item acima |
| Ciclo Snapshots | 🔴 Depende de modelagem | Nunca investigado nesta rodada — domínio inteiro em aberto |
| Operacional (salário/créditos/legendas/Inbox) | 🔴 Depende de modelagem | ~30 chaves heterogêneas, sem domínio único, nunca investigado |
| Pluggy / Mercado Pago (eventos brutos) | 🔴 Depende de modelagem | Integrações externas, fora do escopo desta sessão |

**Literais V1 ainda vivos nos 6 domínios já V2-exclusivos**: os arquivos `vars-*.js` continuam com os valores antigos (não apagados) — servem de semente síncrona pro primeiro segundo de render, antes do módulo assíncrono trocar pra V2. Classificação: 🟢 migrável, mas **não executado** por exigir validação em navegador (indisponível a sessão inteira).

---

## 4. O QUE AINDA FALTA PARA DESLIGAR A V1

| Domínio | Motivo | Bloqueador | Esforço |
|---|---|---|---|
| **Mastercard Black/Visa** | Maior domínio ainda ativo em V1 | Parcial: titularidade/parcelamentos já prontos (só ligar), Assinaturas migrável, mas headline totals são bloqueados por design (P1, "fatura sempre vence") — nunca vão ser 100% V2 | 🟡 Médio pra parte migrável; 🔴 Alto/impossível pros totais sem mudar a política de reconciliação |
| **Ciclo Snapshots** | Histórico por ciclo, usado no simulador/gráficos | Nunca investigado — não se sabe ainda se é modelável sem lógica nova | 🔴 Alto (investigação do zero) |
| **Operacional** | ~30 chaves heterogêneas (salário, créditos, legendas, Inbox) | Sem domínio único — cada chave pode exigir tratamento diferente | 🔴 Alto (não é 1 domínio, são vários pequenos) |
| **Solar (crédito/rateio)** | Persistência já sincronizada, leitura ainda V1 | Falta documento original ou fatura real — não é esforço de engenharia, é falta de evidência | 🟡 Médio, mas trava esperando o usuário, não código |
| Caixa Lance + 4 caixas | Pequeno em impacto, mas trava Patrimônio 100% e a Meta do Milhão | Divergência não confirmada — usuário proibiu reabrir | — (não é pra atacar agora) |
| LRW/LRV/LRC-limbo/LRCV item-a-item | Tabelas de detalhe, não afeta saldo | 34/147 transações sem categoria — precisa decisão de classificação, não é migração mecânica | 🟡 Médio (decisão + categorização, não schema) |
| Pluggy/Mercado Pago brutos | Alimentam a Inbox, não o painel principal | Nunca modelado | 🔴 Alto |

**Overlay antigo (Caixas/Livro Razão/LRW-LRV) ainda não endurecido pro padrão V2-exclusivo** — funciona hoje, mas tecnicamente ainda tem fallback silencioso pra V1 (padrão anterior à mudança de direção desta sessão). Esforço: 🟢 Baixo (é só replicar o `marcarIndisponivelV2()` já pronto).

---

## 5. PENDÊNCIAS DE GOVERNANÇA

| Item | Status |
|---|---|
| `TX000203` | Colisão de `tx_legado` entre eventos distintos — **não corrigido**, decisão de rastreabilidade pendente |
| `TX000204` | Idem |
| `TX000205` | Idem |
| `TX000206` | Idem |
| `TX000208` | Idem — o caso original que abriu essa família de pendência |
| R$652,00 sumido da Inbox Financeira | Sessão muito anterior, motivo nunca investigado a fundo |
| Firebase Console → Authorized domains | Confirmação manual pendente (não checável por código) |
| `AJUSTE-06-08` (12 caixas) | Não remover nenhum `AJUSTE-*`/`RENDIMENTO-*` até o usuário revisar a interpretação (rendimento real, não ajuste artificial) |
| **Validação em navegador real** | **Pendente de TODA a sessão** — usuário recusou login manual em todas as rodadas; toda validação foi técnica/SQL, nunca visual |
| `git push` | ~~Pendente~~ **Resolvido** — 16 commits enviados a pedido do usuário (`61d54de`). Confirmar site ao vivo (`wallacelira.com.br`) na próxima sessão. |

---

## 6. DIRETRIZ OFICIAL DO PROJETO

- **V2 (Supabase relacional) é a arquitetura oficial do sistema.**
- **Supabase é a única fonte operacional de verdade.**
- **Não existe mais estratégia de convivência permanente V1 ↔ V2.**
- `wallace_dados` passa a ser **legado** — histórico, contingência temporária até o último consumidor sair.
- **Todo domínio já modelado, reconciliado e validado deve operar exclusivamente na V2.**
- **Compatibilidade com V1 precisa ser justificada** — deixou de ser o padrão automático.
- **Objetivo final**: desligamento completo da V1. A pergunta do projeto não é mais "como manter as duas juntas", é **"o que ainda impede desligar a V1?"**

---

## 7. PRÓXIMO PASSO RECOMENDADO

**Atacar Mastercard Black/Visa — especificamente a fatia já derisked nesta sessão (titularidade + Assinaturas), fechando o domínio com uma exceção permanente e documentada pros headline totals.**

**Por quê**: é o único domínio grande que já saiu de "totalmente desconhecido" pra "auditado e mapeado" — CARTAO_MAPA já existe na V2 (mais atualizado que a própria Política), Assinaturas tem categoria e dado prontos, e o bloqueio dos totais tem causa raiz clara e definitiva (P1, "fatura sempre vence", não é falta de investigação — é uma regra de negócio permanente). Os outros 3 candidatos (Ciclo Snapshots, Operacional, Solar) exigem começar do zero (investigação) ou esperar o usuário (documento/fatura) — nenhum dos dois é "atacável" agora com o mesmo nível de confiança. Terminar Mastercard/Visa até onde é honestamente possível — e formalizar por escrito que os totais **nunca** serão derivados da V2 — fecha um domínio inteiro em vez de deixar mais um "quase pronto" pendurado, e é o uso mais eficiente do próximo bloco de trabalho.
