# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 08/08/2026, continuação da sessão do dia, HEAD `e5f1348`.

## Commitado nesta rodada

`e5f1348` — religação de `SOLAR_GERACAO_DIARIA` na V2 (fetch + override, mesmo padrão de `SOLAR_LEITURAS`/`cartoes`) + ocultação da seção 07 "Simulador Regulatório" na aba Solar (`display:none`, código intacto). Usuário aprovou explicitamente antes do commit. `wallace_dados`: 30 consumidores já removidos (V2-exclusivo), ~54 restantes.

## Investigação do gap de sincronização SAJ — CONCLUÍDA, evidência completa (código + banco + logs GitHub Actions)

Pergunta original: por que `energia_solar_leituras.geracao_acumulada` está `NULL` na leitura de 07/08 (V2), enquanto V1 tem `437.83`? Usuário pediu 6 respostas específicas, com evidência de código/logs/banco, proibiu correção antes da causa raiz.

**São DOIS problemas diferentes, sem relação de causa entre si:**

1. **`energia_solar_leituras.geracao_acumulada` (V2) — nunca foi escrito por nenhum processo automático.** Lendo `scripts/sync/atualizar_geracao_saj.py` linha a linha: o robô só escreve em (a) `wallace_dados.SOLAR_LEITURAS[-1].geracaoAcumulada` (V1) e (b) desde hoje, na tabela `energia_solar_geracao_diaria` (campo `geracao_kwh`, tabela DIFERENTE). Não existe, em lugar nenhum do script, uma chamada que escreva em `energia_solar_leituras.geracao_acumulada`. Confirmado no banco: as 4 leituras que TÊM o valor (31/07 a 04/08) foram todas criadas no mesmo instante — `2026-08-05 20:54:33` — o momento exato do bootstrap da migração de ciclos de crédito solar (Bloco 20). A leitura de 07/08 foi criada depois, em `2026-08-08 04:20:37` (inserção manual dos códigos 03/103 novos, `leitura_03=60.00`, `leitura_103=361.00`), sem `geracao_acumulada` porque quem inseriu não tinha de onde puxar esse valor automaticamente — não existe pipeline pra isso.

2. **`energia_solar_geracao_diaria` (V2) — gap real de 06/08 e 07/08, mas não é falha de execução.** Confirmado via API do GitHub Actions: o workflow `atualizar_geracao_saj.yml` rodou (via cron-job.org, `workflow_dispatch`) A CADA ~10 MINUTOS, ininterruptamente, durante 06/08 e 07/08 inteiros — dezenas de execuções, todas `conclusion: success`, nenhuma falha. Mas o código que escreve em `energia_solar_geracao_diaria` (`atualizar_v2_geracao_diaria()`) só foi criado no commit `1c515d7`, feito hoje **08/08 às 12:05 (horário de Brasília)**. Toda execução do robô em 06/08 e 07/08 rodou uma versão do script anterior a esse commit (`actions/checkout` sempre pega o HEAD do momento) — literalmente não existia código pra escrever ali. Não é um bug de execução, é ausência de funcionalidade nos dois dias anteriores à sua criação. A partir de `1c515d7`, o robô já escreveu corretamente (linha de 08/08 existe, criada 15:40 UTC, minutos depois do commit).

**Achado colateral, fora do escopo pedido mas relevante**: o workflow standalone `atualizar_geracao_saj.yml` está sendo disparado a cada ~10 minutos (não 2x/dia como o comentário do próprio script ainda diz) — ~144 disparos/dia batendo login na API da SAJ. Não investigado a fundo (não fazia parte da pergunta), possivelmente configuração do cron-job.org desalinhada com a documentação. Reportado, não corrigido.

**Nada corrigido ainda** — só investigação, por instrução explícita do usuário.

## Protocolo de sessão nova (leia nesta ordem)

1. Este arquivo
2. `PASSAGEM_DE_TURNO.md` — Bloco 22 (mais recente) tem o corte exato de onde parou
3. `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` — 5 exceções permanentes, não reabrir
4. `docs/MANUAL_OPERACIONAL_AGENTES.md`
5. **Sempre `git status`/`git log` antes de assumir pendente ou concluído.**

---

## 0. Investigação em aberto — ENTREGAR PRA USUÁRIO NA PRÓXIMA RESPOSTA (causa raiz já encontrada, não reportada ainda)

Usuário pediu causa raiz de por que a aba Solar mostra "Dados insuficientes para calcular consumo direto/autoconsumo/dependência". **Já investigado e resolvido — só falta comunicar**:

1. `geracao_acumulada` existe em `energia_solar_leituras`? **Sim** (numeric, nullable).
2. A sincronização V1→V2 levou o campo corretamente? **Não, pra leitura mais recente.** Evidência real (`execute_sql`): a linha de `data='2026-08-07'` em `energia_solar_leituras` tem `geracao_acumulada = NULL`. A mesma leitura em `wallace_dados.SOLAR_LEITURAS` (V1) tem `geracaoAcumulada: 437.83`. Leituras anteriores (08-04: 362.78, 08-02: 336.11) **estão corretas na V2** — o gap é só na linha mais recente.
3. O frontend está lendo o campo? **Sim, corretamente** — `app.js` mapeia `geracaoAcumulada: r.geracao_acumulada != null ? Number(r.geracao_acumulada) : null`, consistente com o dado.
4. O campo está chegando vazio? **Sim, mas porque já está NULL na origem (V2)**, não é perda no caminho.
5. A consulta não usa o campo? **Usa** — `select=leitura_03,leitura_103,geracao_acumulada,data` inclui o campo.

**Causa raiz**: gap de sincronização do robô Python (`atualizar_geracao_saj.py`) especificamente na leitura mais recente de `energia_solar_leituras` — mesma classe de problema já achado em `energia_solar_geracao_diaria` (dias 06/08 e 07/08 faltando lá também). Padrão: os dados mais recentes (últimos 1-2 dias) não estão chegando completos na V2, embora estejam completos na V1. **Não corrigido** — usuário pediu causa raiz antes de qualquer correção, e disse explicitamente "não quero fallback, não quero workaround, não quero mascarar". Decisão de como corrigir (rodar o robô de novo? script tem bug? corrigir a linha manualmente com evidência do V1?) fica pra próxima sessão, com o usuário.

## 1. O que foi concluído e commitado nesta sessão (3 commits)

- `d0c0c65` — Wave A (Caixas/Livro Razão/LRW-MB endurecidos), Wave B1 (titularidade de cartão via `cartoes`), Wave B3 (exceção headline totals), Mastercard/Visa fechado, Solar ciclos de crédito (schema + RPC `fechar_ciclo_solar` + frontend religado seções 10/11/12).
- `be78388` — Aba própria "☀️ Energia Solar" extraída de Gráficos (7 seções, lazy loading isolado, Busca Global corrigida).

Ver `docs/changelog/PASSAGEM_DE_TURNO.md` Blocos 19-21 pra narrativa completa.

## 2. Métrica do projeto: consumidores de `wallace_dados`

| Grupo | Quantidade |
|---|---|
| Já removidos (V2-exclusivo) | 30 (`SOLAR_LEITURAS` + `SOLAR_GERACAO_DIARIA`, ambos commitados em `e5f1348`) |
| Exceções formais (fora da métrica) | ~10 — `docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md` |
| Restantes | ~54 |

**Próximo item recomendado** (ranking por impacto/esforço/decisão): `ENERGISA_TARIFA_COMPOSICAO` + consumos diários (seção 06 da aba Solar) — precisa de tabela V2 nova (não existe ainda), mas não depende de decisão humana.

## 3. Pendências abertas

1. **Decisão do usuário sobre como corrigir os 2 problemas achados na investigação SAJ** (seção acima): (a) criar pipeline pra `energia_solar_leituras.geracao_acumulada` ser escrito automaticamente (hoje só existe bootstrap manual de migração); (b) nada a corrigir no gap 06-07/08 de `energia_solar_geracao_diaria` — já resolvido sozinho a partir do commit `1c515d7` (08/08), é histórico morto, não dá pra reconstruir sem inventar dado.
2. Achado colateral não investigado: workflow `atualizar_geracao_saj.yml` disparando a cada ~10min (não 2x/dia como documentado) — confirmar se é intencional (cron-job.org) antes de mexer.
3. As 5 exceções formais — não reabrir.
4. Validação em navegador real com login — segue pendente.
5. `v1_v2_caixa_mapa` sem RLS — backlog, não misturar com Solar.
