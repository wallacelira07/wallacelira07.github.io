# Como contribuir — Sistema Wallace Lira

Ler primeiro: [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) e [architecture/PROJECT_STRUCTURE.md](architecture/PROJECT_STRUCTURE.md).

## Antes de qualquer coisa

Este projeto **não tem bundler nem test runner automatizado** neste ambiente. Toda mudança é validada manualmente: abrir `index.html` num servidor estático, logar (Firebase), checar:
- Console sem erros.
- `window.WALLACE_VALIDACAO_RUNTIME` (dentro do iframe) → 18/18 fases `APROVADA`.
- `#healthBadge` → "✅ Sistema íntegro".

## Adicionar um módulo novo dentro de um domínio existente

1. Criar o arquivo dentro da pasta do domínio (`src/financeiro/caixas/`, `src/dashboard/charts/`, etc.).
2. Decidir o padrão de carregamento (ver ARCHITECTURE.md, seção "Padrão de carregamento"):
   - Se a função é chamada de forma síncrona dentro de `src/app/app.js` → `document.write` estático, ANTES da tag do `app.js`.
   - Se só roda via evento/clique → cadeia `onload`, DEPOIS do `app.js`.
3. Adicionar a tag em `Sistema_Wallace_Lira_Completo.html`, na mesma posição relativa dos outros módulos do domínio.
4. Validar (checklist acima).

## Adicionar um domínio novo (pasta nova)

1. Criar a pasta em `src/financeiro/`, `src/dashboard/`, `src/auditoria/` ou `src/integrations/` — só criar pasta nova se não houver domínio existente que já sirva. **Não criar pasta vazia** "pra organizar melhor no futuro" — só quando houver arquivo de verdade pra colocar nela.
2. Seguir a convenção de nomeação (`hydrate-*`, `recalcular-*`, `reg-*`, `vars-*`, `render-*` — ver ARCHITECTURE.md).
3. Se o domínio tiver fragmento de `VARS`/`REG`: a função fábrica (`criarVarsXxx()`/`criarRegXxx()`) precisa ser chamada em `src/app/app.js`, na sequência de `Object.assign()` já existente — adicionar a chamada lá.
4. Se o domínio tiver renderização: criar `hydrateXxx()` e adicionar a chamada dentro de `hydrate()` em `app.js`.
5. Se o domínio tiver cálculo: criar `recalcularXxx()` e adicionar a chamada dentro de `recalcularAgregadosDerivados()` em `app.js`.

## Adicionar uma integração externa nova

Colocar em `src/integrations/<nome-da-integração>/`. Seguir o padrão de `src/integrations/pluggy/pluggy-reconciliacao.js` — funções globais, carregadas de acordo com onde são chamadas (mesma regra de padrão estático/dinâmico).

## Adicionar um serviço (`src/services/`)

`src/services/` é tratado à parte — os arquivos ali têm `import`/`require()` relativos entre si (`FinanceEngine.js`, `Comparator.js`, `CycleEngine.js`, etc.). **Novo arquivo de serviço entra em `src/services/` direto, na raiz da pasta** — não criar subpasta, para não quebrar os caminhos relativos dos que já existem. Só `FinanceEngine.js` e `Comparator.js` são carregados em produção hoje (via `fetch()` isolado, não `<script src>` — ver ARCHITECTURE.md).

## Adicionar/editar um script Python de automação

- Sincroniza dado externo (Pluggy, Mercado Pago, cotações, geração solar) → `scripts/sync/`, e precisa de um workflow em `.github/workflows/` chamando `python3 scripts/sync/NOME.py`.
- Roda manual, sem cron (ex: export/sync pontual do ERP) → `scripts/database/`, sem workflow.

## Documentação

- Mudança de arquitetura → atualizar `docs/architecture/ARCHITECTURE.md`.
- Decisão de negócio/investigação → `docs/decisions/`.
- Estado de sessão/handoff → `docs/changelog/ESTADO_ATUAL.md` (sempre reescrito do zero) e `docs/changelog/PASSAGEM_DE_TURNO.md` (histórico narrativo, nunca apagado, só anexado).

## Regras que não têm exceção

- Nunca commitar nem dar push sem pedido explícito do usuário.
- Nunca alterar `FinanceEngine.js`/`Comparator.js` sem autorização explícita — são a camada V2 validada, qualquer mudança exige rodar as 18 fases de novo.
- Nunca mover `src/services/*.js` pra pastas diferentes entre si (quebra os `import`/`require` relativos).
- Nunca criar pasta vazia "para o futuro".
