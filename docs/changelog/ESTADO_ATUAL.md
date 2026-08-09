# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, fechamento da sessão de aceleração V2. HEAD `f6e2a7d`, tudo commitado e enviado — `git status` limpo.

## Métrica de consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos/religados à V2 | ~59 domínios/achados (37 no início da sessão + ~22 nesta rodada) |
| Exceções formais (fora da métrica) | ~16 |
| Restantes | ~10, todos Classe C de baixo ROI já documentados, ou bloqueados por decisão do usuário |

**O que resta de fato** (nenhum tem ROI melhor que o que já foi feito):
- `PLUGGY_TRIAGEM` — decisão persistente da Inbox (3 registros), deixada fora por decisão explícita do usuário nesta sessão. Granularidade mista (ids sintéticos por conta e por transação) — precisa de desenho próprio se algum dia for retomada.
- `PIB_WALLACE_HISTORICO`, `PADROES_RUIDO_TRANSACAO`, `DEFICIT_ZERO_PISO_OVERRIDE`, `ENERGISA_TARIFA_COMPOSICAO` — RPCs que gravam dentro do próprio `wallace_dados` (`jsonb_set`), nunca criaram tabela V2 real. Baixo ROI documentado.
- `dataNascimentoWallace` — constante permanente, ROI~0.
- `reservaRetiradaProgramada`/`aporteBTGProgramado` — baixo impacto, já majoritariamente derivado.
- `CARTAO_PLUGGY_MAPA` — bloqueado, esperando o usuário passar os finais de cartão do Itaú (pendência antiga, não nova desta sessão).
- LRW/LRV/LRC-limbo/LRCV item-a-item — bloqueado por gap de dado (D), não reabrir.
- Mercado Pago (headline totals `mercadoPagoFatura` etc.) — exceção arquitetural formal, nunca serão só-V2 (reconciliados à mão contra extrato).

**Fora do escopo, por instrução explícita do usuário**: 301×361 kWh (Solar — ver nota abaixo, contextualizado mas não resolvido/recalculado), Caixa Lance, 4 caixas de causa indeterminada, TX000203-208, headline totals Mastercard/Visa.

## O que foi feito nesta sessão (37 → ~59 removidos)

**Bloco 1 — classe de bug "id de DOM duplicado"** (6 achados, mesmo padrão: card já migrado pra V2, uma segunda exibição do mesmo valor esquecida em V1): Caixa Boletos (barra de meta + linha do Balanço), 4 caixas de Reservas (Bens Duráveis/Eventos/Seguro/Escola), 5 duplicatas do Balanço Patrimonial, Caixa Variável (`balOpCaixaVariavel`), barras/badges de meta de Escola/Bens Duráveis/Eventos/Seguro, LREI (alerta de qualidade + resumo do Balanço não resincronizavam após V2). Auditoria final confirmou: não sobra mais nenhum caso desse padrão específico.

**Bloco 2 — modelagem nova real** (3 domínios, cada um com tabela(s) relacional(is) nova(s), backfill 100% conferido, RPC reescrita mantendo assinatura pros scripts Python não precisarem mudar):
- `MERCADOPAGO_EVENTOS` → tabela `mercadopago_eventos`.
- `PLUGGY_CONTAS` → 3 tabelas (`pluggy_conexoes`/`pluggy_contas`/`pluggy_transacoes`) — achado real no caminho: número mascarado de conta não é único por conexão (BTG tinha 2 contas com o mesmo número), schema corrigido pra usar o id real da Pluggy antes do backfill.
- `CRONOGRAMA_BOLETOS_FIXOS` → tabela `cronograma_boletos_fixos` (schedule editável sem deploy).

**Bloco 3 — Ciclo Snapshots (o maior domínio, 15 consumidores)**: religado à V2 via `ciclos_financeiros_snapshots`, reaproveitando a infraestrutura de pré-carregamento já existente (`Promise.all` no HTML, mesmo padrão de `wallace_dados`/`legendas`/solar/cartões) — nenhuma cadeia de cálculo financeiro (`aplicarCicloAoVARS`, `recalcularNecessidade`, `auditoria-automatica.js`, `CycleEngine.js`) precisou mudar. Fallback pro literal V1 mantido de propósito (números financeiros críticos, nunca sem dado por falha de rede). Bug real corrigido no caminho: `Object.assign(VARS, dr)` sobrescreveria a V2 de volta pro blob antigo — mesma classe de bug já vista em `LEGENDAS`, corrigida do mesmo jeito.

**Bugs reais corrigidos fora da fila** (reportados ao vivo pelo usuário):
- Rodapé de versão travado ("v06/08/2026 (parte 140)") — agora deriva do `__V` real.
- Alarme falso do frescor solar durante a janela noturna (robô só lê 6h-18h) — classificação de alarme agora ignora horas sem leitura por design; tempo real exibido continua honesto.
- Badge "⚠ Primeiro ciclo parcial de geração" — contextualiza o primeiro ciclo solar (usina ativou 21/07, ciclo de faturamento da Energisa começou 07/07) sem dizer que é inválido; crédito oficial (301 kWh) não mudou, só ganhou contexto. Nova coluna `ciclos_solares.data_inicio_faturamento_energisa`.

**Governança dos agentes Claude** (início da sessão, commits `3f256d3`/`7f8c910`): seção 0 (Nível de Confiança da Informação, A/B/C/D) e seção 11 (Governança e Bootstrap) no `MANUAL_OPERACIONAL_AGENTES.md`, que passa a ser o documento mestre. `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` (Google Doc, entrada do Claude Chat) reescrito por completo — antes descrevia um sistema em Excel que não existe mais. `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` novo.

## Achados técnicos importantes pra próxima sessão

1. **Padrão de pré-carregamento** (`Promise.all` no topo de `Sistema_Wallace_Lira_Completo.html`, antes de `app.js` ser criado) é a ferramenta certa pra migrar qualquer domínio que precise estar disponível de forma síncrona no boot — não presumir que "leitura síncrona no boot" é sempre um bloqueador sem checar esse mecanismo primeiro (erro cometido e corrigido nesta própria sessão, ver Bloco 3 acima).
2. **`Object.assign(VARS, dr)`** (aplicação de `wallace_dados` por cima do VARS estático) roda tarde no boot e pode sobrescrever silenciosamente qualquer campo de 1º nível que uma migração V2 já tenha resolvido antes dele — sempre checar se o domínio migrado tem uma chave homônima ainda viva em `wallace_dados` e, se sim, proteger com o padrão "guarda antes do merge, restaura depois" (já usado em `LEGENDAS` e agora `CICLO_SNAPSHOTS`).
3. **`WALLACE_VALIDACAO_RUNTIME`**: 17/18 aprovadas — a 1 reprovação (`FASE 2F`, "7/10 caixas aprovadas") é um gap **pré-existente**, não relacionado a nenhuma mudança desta sessão (3 caixas com divergência V1×V2 de causa indeterminada, já documentadas, fora de escopo por decisão do usuário).

## Protocolo de sessão nova

1. Este arquivo.
2. `PASSAGEM_DE_TURNO.md` — bloco mais recente (Bloco 32).
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — exceções permanentes, não reabrir.
4. `docs/MANUAL_OPERACIONAL_AGENTES.md` — documento mestre, seção 0 (Nível de Confiança) e seção 11 (Governança) são leitura obrigatória.
5. Sempre `git status`/`git log` antes de assumir pendente ou concluído.
6. Pendente do usuário (fora do alcance de qualquer agente): criar Project "Sistema Wallace Lira" em `wallace.termica@gmail.com`, anexar `CUSTOM_INSTRUCTIONS_SISTEMA_WALLACE.md` como Project Knowledge — sem isso, um chat novo no Claude Chat não recebe o documento automaticamente (ver `docs/decisions/GOVERNANCA_MULTI_CONTA_AGENTES.md` seção 10).
