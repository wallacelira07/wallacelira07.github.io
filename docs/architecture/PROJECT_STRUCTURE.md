# Estrutura do projeto — Sistema Wallace Lira

Gerado em 07/08/2026, na reorganização física completa (V2 arquitetural + reorganização de pastas).

```
Site/
├── index.html                          # Login (Firebase Auth) + shell do iframe do painel
├── Sistema_Wallace_Lira_Completo.html  # Painel real — carrega todos os módulos, sempre dentro do iframe
├── .nojekyll                           # Desativa processamento Jekyll no GitHub Pages
├── _headers                            # Cache-Control (Netlify — inerte no GitHub Pages, mantido por precaução)
├── README.md                           # Fica na raiz por convenção do GitHub (repo homepage)
│
├── assets/
│   ├── css/styles.css
│   └── images/{favicon-32.png, favicon-192.png, apple-touch-icon.png}
│
├── src/
│   ├── app/
│   │   ├── app.js                        # Bootstrap: monta VARS/REG a partir dos módulos, orquestra hydrate()/recalcularAgregadosDerivados()
│   │   └── promocoes-financeengine.js    # 18 fases de promoção V1→V2 (comparação FinanceEngine), cross-domínio
│   │
│   ├── dashboard/
│   │   ├── navigation/    # navegação entre seções, busca global, filtro de Livros Razão
│   │   ├── charts/        # Chart.js: painel principal, cenários lazy, utilitários de gráfico
│   │   └── widgets/       # componentes visuais soltos (esconder valores, contadores de aba, seletor de ciclo)
│   │
│   ├── financeiro/
│   │   ├── balanco/         # Balanço Patrimonial (hydrate + REG + recalcular)
│   │   ├── caixas/          # Caixa Variável + Caixas Operacionais (hydrate + REG + VARS + recalcular)
│   │   ├── cenarios/        # Reserva de Emergência, Cenário Histórico, Simulador Fim de Ciclo, seletor de ciclo
│   │   ├── indicadores/     # PIB Wallace, Taxa de Poupança, Crescimento Patrimonial
│   │   ├── livros-razao/    # Totais e renderização das tabelas LRW/LRV/LRB/LRP/.../LRPV
│   │   ├── patrimonio/      # Patrimônio Total, Meta do Milhão, Consórcios, Passivos
│   │   ├── cartoes/         # Visa Infinite, Mastercard Black, Mercado Pago
│   │   ├── investimentos/   # Operações P2P + ROC (opções vendidas)
│   │   └── operacional/     # Salário, Reembolsos/Cascata, Metas, Estimador, Resumo Executivo — domínio "catch-all" do que não é um ativo financeiro específico
│   │
│   ├── solar/               # Simulador de Energia Solar (Calculadora + rateio Wallace/Irmã)
│   │
│   ├── auditoria/
│   │   ├── inbox/            # Inbox Financeira (triagem manual de lançamentos)
│   │   ├── classificacao/    # Classificação automática de itens da Inbox
│   │   └── verificacoes/     # Card "Verificações de Negócio" + auditoria automática do REG
│   │
│   ├── integrations/
│   │   └── pluggy/           # Reconciliação de contas/transações via Pluggy (Open Finance)
│   │
│   └── services/             # FinanceEngine.js + Comparator.js (únicos usados em produção, via fetch isolado)
│                              # + CycleEngine/*Service.js (não carregados em produção — ver ARCHITECTURE.md)
│                              # INTOCADO na reorganização: têm import/require relativos entre si
│
├── docs/
│   ├── architecture/   # este arquivo + ARCHITECTURE.md
│   ├── changelog/      # ESTADO_ATUAL.md (snapshot da sessão) + PASSAGEM_DE_TURNO.md (histórico narrativo)
│   ├── decisions/      # MAPA_MIGRACAO_V2.md + AUDITORIA_IMPACTO_BUG_LRC.md
│   ├── database/       # DER.md (diagrama entidade-relação)
│   └── CONTRIBUTING.md
│
├── scripts/
│   ├── database/   # exportar_erp_supabase.py, sincronizar_erp_supabase.py (rodam manual, sem workflow)
│   └── sync/       # atualizar_cotacoes_acoes.py, atualizar_geracao_saj.py, mercadopago_sync.py, sincronizar_pluggy.py (rodam via GitHub Actions)
│
├── tests/
│   └── unit/       # Comparator.test.js, CycleEngine.test.js, FinanceEngine.test.js (sem test runner configurado neste ambiente)
│
└── .github/workflows/   # 6 workflows — 4 chamam scripts/sync/*.py, 1 orquestra os 4, 1 é smoke-test de cron
```

## O que NÃO mudou de lugar
- `.github/workflows/` — já estava bem organizado, só os `run: python3 ...` foram atualizados pro novo caminho de `scripts/`.
- `src/services/` — os arquivos têm `import`/`require('./Outro.js')` entre si; mover qualquer um pra pasta diferente quebraria essas referências relativas.
- `index.html`, `Sistema_Wallace_Lira_Completo.html`, `.nojekyll`, `_headers`, `README.md` — GitHub Pages e GitHub exigem esses na raiz.

## Contagem
63 módulos de domínio (`src/{dashboard,financeiro,solar,auditoria,integrations}/**`) + 2 arquivos de bootstrap (`src/app/`) + 11 arquivos de serviço em `src/services/` (2 usados em produção) + 3 testes.
