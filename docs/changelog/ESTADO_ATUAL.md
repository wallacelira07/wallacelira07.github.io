# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 16-17/08/2026, bloco 19. Resumo: depois do bloco 18 (auditoria de 9 agentes + Grupo A, tudo fechado e publicado — ver seção 1), o usuário voltou ao vivo e mandou uma sequência longa de achados/pedidos reais olhando o painel no celular. **Tudo deste bloco já está commitado e publicado em `origin/main`** (commits `5bdc5a1` → `1607121`, ver lista completa no `PASSAGEM_DE_TURNO.md`). Nada pendente de commit no momento desta reescrita.

## 0. Bloco 19 (16-17/08/2026) — correções ao vivo + mudança de arquitetura, tudo publicado

### 0.1 Correções de UI/dado (commits `5bdc5a1`, `00a4b53`)
1. Badge "Cotações de ações" não conta mais fim de semana contra o limiar (B3 não negocia sáb/dom) — `hydrate-saude-operacional.js`.
2. "Pessoal (s/ corporativo)" do Mastercard Black dessincronizado da soma das categorias (usuário achou R$576,72 de gap sozinho) — `mbNaoReconciliado` sempre foi literal fixo 0, nunca calculado; nova função `recalcularEHidratarMbPessoal()` resincroniza tudo no fim das Ondas 3/10. Donut de composição do MB também corrigido (faltava a 8ª fatia/rótulo).
3. Gráficos "Composição" (Patrimônio/Visa/MB) cresceram — `.chart-box` preso em 190px dentro de card esticado, agora usa `flex:1` até 340px.
4. Legenda "Consumo médio diário" ganhou marcador de cor (Energia Solar, gráfico "Geração por dia").
5. Botão "+ Lançar" — fade visual na borda da barra de abas indicando que dá pra rolar mais.
6. Aporte da Caixa Saúde Família recalculado: **R$177,50/mês** (era R$135, e antes disso havia divergência R$100×R$135 nunca resolvida — fechada agora com a composição real que o usuário deu: Ginecologista Vanessa 1x R$450/ano + Pediatra Júlio 2x R$390/ano + Endocrinologista Wallace 2x R$450/ano).
7. Bug de data/posição do limbo (TX000132/TX000154) investigado — **código já estava correto** (convenção ascendente do site, TX000132 é 22/07 no banco de verdade). Só um literal vestigial sem efeito visual foi corrigido.
8. Créditos KMV Ipiranga/Shell Box corrigidos em 2 rodadas com prints reais — valor final **R$200,00** (cupom novo, diferente dos 3 antigos já usados) — Shell Box confirmado sem mudança. 2 transações reais lançadas (`TX000329`, `TX000333`, Caixa Combustível).
9. Tracking novo: pressão arterial + glicose na aba Emagrecimento (tabelas `pressao_arterial`/`glicose_leituras`, mesma RLS/padrão de `pesagens`/`aplicacoes_ozivy`) — implementado por agente, **ainda não verificado em navegador real**.
10. Tooltips do cabeçalho (relatório PDF/esconder valores/sair/logo) trocados do `title=""` nativo (cinza claro) pro mesmo estilo escuro do tooltip do e-mail — CSS puro via `data-tooltip`.

### 0.2 Mudança de regra de negócio: déficit de caixas passa a contar cartão (commit `00a4b53`, ampliado em `68d2769`)
**Pedido explícito do usuário, com exemplo real**: "quando a caixa estoura o que tem disponível (comprometido no cartão > saldo), essa diferença tem que entrar na Necessidade do ciclo, porque esse dinheiro vai vir do salário — antes disso, isso não aparecia em lugar nenhum".

`aplicarDeficitCaixasSemLrei()` (`hydrate-deficit-caixas-sem-lrei.js`) generalizada: além de saldo real negativo (comportamento antigo), agora também soma `max(0, comprometido_no_cartão − saldo_real − LREI_de_suporte)` — aplicado às 6 caixas temáticas (Bens Duráveis, Emagrecimento, Churrasco, Manutenção, Eventos, Saúde Família) **e à Caixa Variável** (unificada depois que o usuário corrigiu minha primeira tentativa de deixá-la de fora "por segurança" — ele esclareceu que `tetoOficial` R$2k/ECC e `orçamentoOperacional` R$3,2k fixo são coisas diferentes de "comprometido no cartão agora", e que a ausência dessa soma era "uma falha do sistema, porque me engana").

**Impacto real no momento da implementação**: +R$1.670,95 na Necessidade Total Bruta/Líquida (Emagrecimento R$590,00 + Bens Duráveis R$503,30 + Caixa Variável R$577,65) — vai variar a cada carga conforme saldo/comprometido mudarem. **Nunca validado em navegador real** — só conferido direto no Supabase via SQL antes e depois da implementação.

Achado ao implementar: `hydrateEstimadorSalario()` só rodava 1x no boot, nunca de novo — os cards de Necessidade (antigos e os novos da Home) ficavam presos no valor de antes do recálculo. Corrigido junto (chamada adicionada em `aplicarDeficitCaixasSemLrei()`).

### 0.3 Cards novos na Home: "Necessidade × Salário" (commit `68d2769`)
Pedido do usuário: Necessidade Líquida do ciclo, Salário esperado (dia 25), e a subtração dos dois ("sobra real"). Reaproveita os mesmos valores já calculados no Estimador de Salário (`liquidoMes(0)`, `R.evolucao.necessidadeLiquida[0]`), sem cálculo novo/duplicado.

### 0.4 Necessidade Bruta/Líquida agora persistida no Supabase (commit `1607121`)
Usuário pediu explicitamente depois de eu explicar o que fazia ("achava que tudo acontecia no Supabase e o site só exibia" — não é bem assim, boa parte do cálculo é só JS no navegador, nunca salvo de volta). Migration aplicada:
- `indicadores` ganhou `UNIQUE(nome)` (permite upsert).
- RPC nova `registrar_indicador(p_nome, p_valor)`, mesmo padrão de segurança de `registrar_pib_mensal` (login Firebase válido ou service_role).
- `recalcularNecessidade()` chama essa RPC (fire-and-forget) toda vez que recalcula, gravando `necessidadeTotalBruta`/`necessidadeLiquida` — agora consultável direto via SQL sem abrir o site.

**Nota pra sessão futura**: essa arquitetura híbrida (Supabase = dados brutos; muitos indicadores derivados = só JS ao vivo, alguns agora persistidos: PIB Wallace desde antes, Necessidade Bruta/Líquida desde agora) provavelmente tem mais candidatos a fazer o mesmo caminho — não levantado ainda, só mencionado ao usuário como possibilidade.

### 0.5 Validação desta sessão inteira
**Nada foi testado em navegador real** — sessão inteira operando por leitura de código + consultas diretas ao Supabase (bastante usadas pra conferir números antes/depois de cada mudança). Recomendar ao usuário testar ao vivo, principalmente: card Mastercard Black (seção 10), donut de composição MB, cards "Necessidade × Salário" na Home, ECC (ver se o valor mudou com a unificação da Caixa Variável), aba Emagrecimento (pressão/glicose), tooltips do cabeçalho.

## 1. Bloco 18 (15-16/08/2026) — auditoria de 9 agentes + Grupo A — TUDO FECHADO E PUBLICADO
Commits `4e5fd1a` → `193da0a` (ver `PASSAGEM_DE_TURNO.md` pro detalhe completo). Resumo:
- **21 achados de bug da auditoria de 9 agentes**: todos os 20 reais corrigidos ou formalmente reclassificados (1 — trava de leitura desatualizada do link solar — era mecanismo já morto nos dois lados, não uma correção real).
- **Grupo A do inventário de "dado disfarçado de texto"**: 9 de 9 achados de alta/média confiança implementados (rateio solar, parcelas do consórcio, tabela do Estimador, Fio B, notas de caixas operacionais, eventos do gráfico de alívio, aporte Bens Duráveis, teto ECC, 3 legendas do Déficit Zero).
- Grupo B (rótulos fixos de interface, ~600-700 strings) segue explicitamente fora de escopo.
- Achado da sessão (`aporteSaudeFamilia` R$100×R$135 divergente) — **resolvido no bloco 19** (seção 0.1 item 6 acima), não é mais pendência.

## 2. Incidente técnico já resolvido (bloco 18, sem repetição no bloco 19)
Rebase interrompido pelo Google Drive durante o push do lote 1 — `HEAD` local tinha o commit completo, só a working tree ficou corrompida. Recuperado com `git checkout HEAD -- .`. Procedimento documentado caso se repita: `git status` pra confirmar HEAD íntegro, depois `git checkout HEAD -- .`.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **RESOLVIDO NA RAIZ 15/08/2026 — Google Drive sincronizando `.git/`.** `.git` real movido pra `C:\Users\WLI015\.git-repos\Site.git` (ponteiro de 1 linha no repo). Local à máquina `WLI015`; máquina nova precisa de `git clone` novo. **17/08/2026 — mitigação adicional**: os arquivos do PROJETO em si (não o `.git`) ainda podem travar momentaneamente durante `git rebase` (Drive sincronizando em background) — fisicamente inevitável enquanto ficam numa pasta sincronizada, não é regressão do fix acima. Usar `.claude\git-safe-sync.ps1` (retry automático) em vez de `git pull --rebase`/`push` cru — ver manual seção 7.1.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (seção 1.3.5 do manual). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre, em qualquer caixa. **ATUALIZADO 16/08/2026**: isso não muda — mas agora o EXCEDENTE (comprometido > saldo) passa a contar na Necessidade do ciclo (regra nova, seção 0.2 acima). As duas regras coexistem: saldo real nunca cai por causa do cartão, mas a Necessidade sabe do estouro.
9. **Procedimento de baixa da fatura**: `UPDATE` na MESMA linha de `transacoes` (`afeta_saldo_real` false→true). Nunca criar uma segunda transação.
10. **Nenhuma constante financeira nova deve nascer hardcoded no `.js`** se já existe (ou faz sentido existir) lugar correspondente em `parametros_gerais`/`indicadores`.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI**, mas continua FORA da fórmula do Painel Executivo/Balanço — 2 contextos intencionais.
12. **Inbox Financeira DESATIVADA DA UI** (pedido do usuário) — sincronização continua rodando por baixo. Não reativar sem pedido explícito.
13. **Leitura manual de `energia_solar_leituras` sempre usa a data/hora REAL da foto**, nunca "hoje" no momento de gravar.
14. **Medidor solar DDSU666: modelo certo (313270) só libera 25/08/2026.** Não sondar API antes dessa data.
15. **WWI (Wallace Wealth Intelligence) congelado funcionalmente, em período de observação** desde 15/08/2026. Ver `docs/decisions/WWI_ROADMAP_V1.md`. Não abrir fase nova sem evidência real de divergência ou pedido explícito.
16. **NOVO 16/08/2026 — Necessidade Total Bruta/Líquida agora conta o excedente de comprometido-no-cartão de TODAS as caixas com cartão (incluindo Caixa Variável)**, e o resultado final é persistido em `indicadores` (Supabase) a cada recálculo — ver seção 0.2/0.4 acima. Não é mais só cálculo ao vivo em JS.
17. **NOVO 16/08/2026 — Arquitetura híbrida confirmada e parcialmente fechada**: PIB Wallace (desde antes) e Necessidade Bruta/Líquida (desde agora) são gravados no Supabase a cada recálculo do site; outros indicadores derivados ainda só existem ao vivo em JS, nunca persistidos. Se o usuário pedir mais indicadores consultáveis via Chat/SQL, esse é o padrão a seguir (RPC `registrar_indicador`, já genérica pra qualquer nome/valor).

## 3. Pendências abertas de sessões anteriores (sem mudança nesta sessão)

### 3.1 Instalação física do medidor solar — TROCA DE MODELO, só libera 25/08/2026
Modelo errado (313269, sem RS485) instalado; modelo certo (313270) chega 25/08/2026.

### 3.2 Inbox Financeira — ~144 Pluggy + 13 MP não processados
Precisam de revisão caso a caso. Não automatizar às cegas.

### 3.3 R$340,00 do ciclo Wärtsilä 2026-07 ainda não confirmados como recebidos
Não é a mesma coisa que as TEDs já lançadas (`TX000220`/`TX000280`).

### 3.4 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente.

### 3.5 Backlog técnico adiado (decisão consciente do usuário)
Lint dos ~91 módulos `hydrate-*`; previsão de geração solar por irradiância.

### 3.6 ENCERRADO 17/08/2026 — projeto "Agente financeiro no WhatsApp/Telegram", tentado e desfeito
Usuário pediu implementação (WhatsApp primeiro, depois Telegram como alternativa sem custo/mais simples quando soube que hospedagem/conta business teriam custo/complexidade). Ambos os protótipos foram construídos (`whatsapp-agent/`, `telegram-agent/`, código completo com a regra de confirmação em código, nunca delegada ao modelo) e chegaram a ser commitados/publicados. **Usuário pediu cancelamento total logo em seguida**: não quer rodar um processo no próprio computador, e o custo da API da Anthropic (inevitável em qualquer canal — Telegram/WhatsApp são grátis, mas o Claude cobra por uso) não era aceitável pra ele, mesmo sendo pequeno (estimado abaixo de R$10-20/mês de uso pessoal). Ambas as pastas foram removidas (`git rm -r`) e o commit de remoção publicado. **Não retomar este projeto sem pedido explícito novo e sem ANTES deixar claríssimo, por escrito, que qualquer canal (WhatsApp/Telegram/email/outro) vai ter custo de API da Anthropic, mesmo que o canal em si seja gratuito** — essa foi a causa raiz do cancelamento, não a arquitetura em si.

## 4. Protocolo de sessão nova

1. Este arquivo primeiro, depois os blocos mais recentes de `docs/changelog/PASSAGEM_DE_TURNO.md` (bloco 19 = correções ao vivo + mudança de arquitetura desta sessão).
2. `git status` — não deveria haver nada pendente no momento desta reescrita, mas confirmar sempre.
3. **Testar no navegador real assim que possível** — nada do bloco 19 foi validado visualmente (ver seção 0.5). Prioridade: card Mastercard Black, ECC/ Necessidade (mudou de valor com a unificação da Caixa Variável), cards novos da Home, aba Emagrecimento (pressão/glicose).
4. Se aparecer erro de push tipo `bad object refs/heads/claude/desktop.ini`: Google Drive sincronizando `.git/` de novo — ver regra 6. Se o problema for arquivo sumindo da working tree durante um rebase: ver seção 2.
5. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
6. **Sobre o WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
7. Projeto do WhatsApp (seção 3.6): só retomar se o usuário trouxer o assunto de volta.
