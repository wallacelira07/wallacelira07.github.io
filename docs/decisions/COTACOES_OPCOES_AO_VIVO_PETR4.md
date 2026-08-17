# Cotação ao vivo de opções — implementado, PETR4 + ITUB4 (2 fontes gratuitas)

**Status: IMPLEMENTADO em 17/08/2026, AMPLIADO na mesma sessão.** Pedido original do usuário: *"procure uma fonte gratuita, tente implementar"*, depois de eu apontar que o "valor de mercado" das puts vendidas (card ROC) nunca foi automatizado — sempre dependeu do usuário colar uma nota de corretagem nova em `vars-roc.js` manualmente. Ampliado depois que o usuário rejeitou a 1ª versão ("pedi para implementar algo para todas as ações ou as principais, não pode ser só PETR4").

## 1. O que mudou

`o.cotacaoAtual`/`o.valorMercado` de **todas** as séries com posição ativa (`PETRT379`/PETR4 e `ITUBT424`/ITUB4) passam a vir de cotação real, buscada 2x/dia (mesmo cron do resto das automações). Nenhuma série com posição ativa continua 100% manual.

## 2. Duas fontes, por quê

Pesquisado e testado ao vivo em 17/08/2026: o endpoint de opções da brapi.dev só é gratuito (sem token, sandbox) para o ativo-objeto **PETR4**. Qualquer outro ativo (ITUB4 incluso) devolve `MISSING_TOKEN` sem o plano **Pro** (**R$139,99/mês**). Pesquisei alternativas antes de aceitar essa limitação como definitiva:

| Fonte | Custo | Cobertura | Decisão |
|---|---|---|---|
| **brapi.dev** (`/api/v2/options/chain`) | Grátis (sandbox) | Só PETR4 sem token | Fonte primária — já funciona, não mexer |
| **OpLab** (oplab.com.br) | R$97–185/mês (plano PRO obrigatório pra API) | Qualquer ativo | Descartado — mais caro que brapi Pro pra resolver o mesmo problema |
| **opcoes.net.br** (scraping HTML público) | Grátis | Qualquer opção da B3 | **Escolhido como fallback** (usuário optou explicitamente por essa via ao ser apresentado o trade-off: scraping é mais frágil que API oficial, mas sem custo) |

## 3. Como funciona (dual-source, por série)

1. **Tenta brapi.dev primeiro** (`buscar_preco_brapi`) — igual antes, só funciona de graça pra PETR4.
2. **Se a brapi não cobrir** (qualquer `underlying` ≠ PETR4, ou falha de qualquer tipo), cai pro **fallback `opcoes.net.br`** (`buscar_preco_opcoes_net`): busca `https://opcoes.net.br/<symbol>` (ex: `https://opcoes.net.br/ITUBT424`), uma página pública sem login/token, e extrai via regex a coluna **"Ult"** (último negócio) da linha mais recente da tabela de cotação da própria opção — **não** a segunda tabela da página (`id="miniGrid"`, que é só navegação entre strikes, nunca cotação).
3. Se nenhuma das duas fontes tiver preço válido pro dia, **não atualiza** — mantém o valor anterior (nunca inventa `0`).

**Importante sobre a fonte de fallback**: `opcoes.net.br` mostra os **últimos 5 pregões (EOD, fechamento)**, não cotação em tempo real — página explicitamente diz "para dados em tempo real... é necessário ser assinante". Suficiente pro uso deste sistema (referência de valor de mercado atualizada periodicamente, não day-trading), mas é **scraping de HTML**, mais frágil que uma API oficial: quebra se o site mudar o layout da tabela. Se isso acontecer, o robô vai logar `AVISO: tabela de cotação não encontrada... layout do site pode ter mudado` e simplesmente não atualizar aquela série (heartbeat registra `erro` só se NENHUMA série atualizar — 1 série falhando não derruba as outras).

## 4. Implementação técnica

- **Robô**: `scripts/sync/atualizar_cotacoes_opcoes.py` — `SERIES_MONITORADAS` agora tem `PETRT379` (PETR4) e `ITUBT424` (ITUB4); precisa ser **atualizada manualmente** quando o usuário abrir/fechar uma posição.
- **Armazenamento**: tabela `cotacoes_opcoes` (Supabase) + RPC `atualizar_cotacoes_opcoes` — inalterados, mesma estrutura já usada desde a 1ª versão, só recebe mais 1 símbolo agora.
- **Orquestração**: `.github/workflows/atualizar_cotacoes_opcoes.yml`, chamado por `executar_tudo.yml` — inalterado, nenhum secret novo (scraping não precisa de autenticação).
- **Cliente**: `WallaceFinanceService.getCotacoesOpcoes()` + `aplicarCotacoesOpcoesV2()` (hydrate-roc.js) — já cobriam qualquer symbol presente na tabela, nenhuma mudança necessária; ITUB4 passa a ganhar o ícone 🔄 (preço ao vivo) automaticamente assim que a 1ª cotação real chegar.
- **Observabilidade**: job `cotacoes_opcoes` no painel Saúde Operacional — inalterado.

## 5. Custo

**Zero.** As duas fontes são gratuitas; nenhuma infraestrutura nova (mesmo cron, mesmos secrets).

## 6. Risco aceito conscientemente

Scraping de HTML de um site de terceiros (`opcoes.net.br`) é **estruturalmente mais frágil** que consumir uma API documentada — não há contrato de estabilidade, o layout pode mudar sem aviso. O usuário foi informado desse trade-off explicitamente (opção "scraping de site público" apresentada ao lado de "manter manual" e "pagar plano pago") e escolheu essa via. Se o scraping quebrar no futuro, revisitar as 2 outras opções descartadas (aceitar manual de novo, ou pagar brapi Pro/OpLab) em vez de tentar consertar o parser às cegas sem conferir se o site mudou de fato.

## 7. Revisitar quando

- Usuário abrir posição nova em qualquer ativo → adicionar em `SERIES_MONITORADAS` (`atualizar_cotacoes_opcoes.py`) — a fonte de fallback (`opcoes.net.br`) cobre qualquer ativo-objeto da B3, não só PETR4/ITUB4, então nenhum ativo novo deveria ficar sem cobertura automática de novo.
- `AVISO: tabela de cotação não encontrada` aparecer nos logs → o layout do `opcoes.net.br` mudou, o parser (`buscar_preco_opcoes_net`) precisa ser ajustado.
- Usuário decidir que vale pagar um plano (brapi Pro ou OpLab) → dá pra trocar o fallback por uma chamada de API oficial, mais robusta que scraping.
