# DER — Arquitetura V2, Sistema Wallace Lira

Documenta o schema **real em produção** no Supabase (`bakdgacmwlopvrrppwdm`), não o design original. Onde os dois divergem, é porque a prática desta sessão (05/08/2026) achou um gap real — cada divergência está marcada com o motivo.

---

## Tabelas e colunas reais (16 tabelas)

### `usuarios`
`id, nome, papel ('titular'|'dependente')`

### `contas_bancarias`
`id, usuario_id, banco, tipo ('corrente'|'poupanca')`

### `cartoes`
`id, usuario_id, dono_real_id (nullable), numero_final, apelido, bandeira, banco, conta_pluggy_id, status ('ativo'|'aposentado'|'bloqueado')`
- `dono_real_id`: usado de verdade pro caso "2250" (fatura consolidada Personnalité) — confirmado com o usuário que é da Vanessa.

### `caixas`
`id, nome, tipo ('operacional'|'patrimonial'), saldo_inicial_ciclo, teto_mensal (nullable), saldo_inicial_calibrado`
- **18 caixas**, não 13 como o design original previa: as 13 originais + Bens Duráveis, Conta Suavização (CC-304), Escola de Júlio, PIX Geral Vanessa, Provisionado Wärtsilä, Mercado Pago.
- `saldo_inicial_ciclo`: **18/18 caixas calibradas com dado real** (06/08/2026). Representa o saldo carregado do ciclo anterior (25→24), não um valor fixo global.
- **`saldo_inicial_calibrado`** (boolean, adicionada 06/08/2026): flag explícita pra distinguir "calibrado de propósito pra 0" de "nunca calibrado" — o linter da RPC (ver abaixo) tentou inferir isso pelo valor primeiro e gerou falso-positivo em 4 caixas legitimamente zeradas. Lição: nunca inferir estado por valor quando dá pra ter uma flag de verdade.

### `categorias` / `subcategorias`
`id, nome, tipo ('recorrente'|'extraordinaria')` / `id, categoria_id, nome`
- 11 categorias reais: Alimentação, Transporte, Assinaturas, Saúde, Educação, Boletos, Consórcios, Bens Duráveis, Reembolsável Corporativo, Eventos e Viagens, P2P.

### `transacoes`
`id, data (nullable), descricao, valor, tipo ('entrada'|'saida'), cartao_id, caixa_id, categoria_id, subcategoria_id, usuario_id, origem, status ('confirmado'|'pendente_classificacao'|'estornado'), tx_legado, afeta_saldo_real`
- **`data` é nullable** (design original não previa): 1 caso real (TXS000008) tinha data vazia na fonte — melhor NULL do que fabricar.
- **`tx_legado`** (não estava no design original): os códigos TX legados colidem entre livros (Políticas seção 23) — não servem como `pluggy_tx_id` (esse fica reservado pra idempotência real da API Pluggy). Sem unique constraint de propósito.
- **`afeta_saldo_real`** (boolean, não estava no design original): distingue "mexeu no dinheiro agora" (PIX, boleto, TED) de "virou dívida de cartão pra pagar depois" (comprometido). 100% de cobertura (281/281), populado via campo `livro` da fonte + sinal textual explícito — nunca chutado.
- **281 transações**, checksums validados: R$64.859,31 soma total.

### `parcelas`
`id, transacao_origem_id (nullable), numero_parcela, total_parcelas, valor_parcela, data_prevista (nullable), cartao_id, status ('ativa'|'quitada'), tx_legado, origem_array`
- **`transacao_origem_id` e `data_prevista` nullable** (design original exigia NOT NULL): a fonte real (`PARCELAMENTOS_VISA`/`MP`) só guarda o status atual (parcela X de N), não uma linha por ocorrência futura.
- 22 parcelas, 15/22 linkadas à transação de origem real (achado: os itens "LRP" do histórico eram a mesma compra já em `PARCELAMENTOS_VISA`, não transações novas).

### `regras_classificacao`
`id, prioridade, estabelecimento_contem, descricao_regex, categoria_id, subcategoria_id, caixa_id, ativo, resultado ('classificar'|'ignorar')`
- **`resultado`** (não estava no design original): `PADROES_RUIDO_TRANSACAO` (14 padrões) são exclusão, não classificação positiva — os campos originais só previam classificar.
- 68 regras: 14 ignorar + 54 classificar (validado: 69% recall, 0% erro contra dado real).

### `investimentos`
`id, tipo ('LFTS11'|'P2P'|'opcoes'), quantidade, valor_atual, data_atualizacao` — sem mudança do design original.

### `patrimonio`
`id, tipo ('imovel'|'veiculo'|'reserva'|'investimento'), valor, data_snapshot, natureza ('ativo'|'passivo')`
- **`natureza`** (não estava no design original): o Balanço real é Ativo−Passivo, o design original só previa ativos. Sem essa coluna, não dava pra representar o financiamento da casa (R$61.081,39, passivo).

### `reembolsos` / `metas` / `indicadores` / `energia_solar_leituras` / `energia_solar_geracao_diaria`
Sem mudança relevante do design original.

---

## RPC: `rpc_dashboard_resumo()`

Não estava no design original (Fase 5.5, item 7.1, criada nesta sessão). Retorna numa chamada só: `caixas[]` (nome, tipo, `saldo` bruto, `saldo_real_ciclo_atual` calibrado), `patrimonio_resumo`, `metas[]`, `indicadores_recentes[]`, `reembolsos_resumo[]`, `kpis`, `avisos[]`.

**`avisos[]`** (06/08/2026): linter estrutural automático, existe porque um bug real (patrimônio preso em snapshot antigo, sumindo do resumo sem avisar) só foi achado quando o usuário comparou manualmente o número da tela com o da V2. Checa: (1) patrimônio com `data_snapshot` desatualizada, (2) caixas com `saldo_inicial_calibrado=false`, (3) transações com `afeta_saldo_real` não classificado, (4) `metas.valor_atual` da Meta do Milhão divergindo do cálculo ao vivo (Reserva+BTG+CaixaLance+NectonCC). Estado em 06/08/2026: 0 avisos.

**Requer RLS com policy de leitura pra `anon`/`authenticated`** — todas as 16 tabelas tinham RLS habilitado desde a Fase 1 mas sem policy nenhuma, o que devolvia tudo vazio pro site real (achado só quando testado como o papel `anon` de verdade, não como admin via MCP). Corrigido, policy "Leitura via anon key (site publico)" replicada nas 16.

---

## Camada `/services` (Fase 5) — 7/7 peças

`FinanceService`, `ClassificacaoService`, `PatrimonioService`, `ReembolsoService`, `ParcelaService`, `IndicadoresService`, `EnergiaService`. Todos testados contra dado real (não mock genérico) via `fetch` mockado reproduzindo o formato do PostgREST. Nenhum consumido pelo `app.js` ainda (só a auditoria V1↔V2 e o painel "💰 V2" usam a RPC diretamente, não via classe de serviço) — migração seção-por-seção fica pra decisão explícita do usuário, é a parte de maior risco do roadmap.

---

## Lição geral desta sessão

Todo gap listado acima só apareceu na prática — tentando migrar dado real, calibrar contra saldo real, testar como usuário real (`anon`). Nenhum foi encontrado só lendo o design original. Reforça o princípio já em uso: escrever código/schema é fácil, confiar nele sem rodar contra dado real é que costuma esconder o problema.
