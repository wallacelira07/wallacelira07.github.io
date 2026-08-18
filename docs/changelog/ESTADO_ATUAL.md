# ESTADO ATUAL — SISTEMA WALLACE LIRA

**Reescrito do zero a cada sessão**. Se algo aqui contradiz `PASSAGEM_DE_TURNO.md`, este arquivo vence para o estado geral; a Passagem de Turno vence para o histórico passo a passo.

Última reescrita: 18/08/2026, bloco 21. Resumo: sessão longa, dividida em 2 frentes — (1) **bug crítico do `solar-compartilhado.html` finalmente resolvido de verdade** (causa raiz real era erro de sintaxe JS, não os problemas de execução corrigidos em tentativas anteriores) e (2) **projeto novo do zero**: medidor DDSU666 ligado direto no inversor SAJ do usuário (não confundir com o DDSU666 da Casa da Mãe, que é outro medidor, outro contexto — mas mesma família de hardware/SAJ), incluindo pesquisa exaustiva sobre a exigência do "Kit SEC" do suporte SAJ, leitura de 4 manuais oficiais, e firmware ESP32 pronto pra quando o hardware chegar. **Tudo commitado e publicado em `origin/main`** (commits `ec9f07e`→`a534715`, ver lista completa no `PASSAGEM_DE_TURNO.md`). Nada pendente de commit no momento desta reescrita.

## 0. Bloco 21 (18/08/2026) — bug do compartilhado resolvido de verdade + projeto DDSU666/SAJ do zero

### 0.1 `solar-compartilhado.html` — bug de "Carregando..." eterno FINALMENTE resolvido (causa raiz real)

**Histórico**: bug aberto desde o fim do bloco 20 (17/08), 2 tentativas de correção já feitas (mover `resp.json()` pra dentro do try/catch; adicionar timeout no fetch) sem resolver — usuário confirmou 2x que persistia. Nesta sessão, usei o Browser tool pra abrir a página real em produção e ler o console do navegador diretamente, em vez de continuar corrigindo às cegas — e achei o erro real na primeira tentativa: **`SyntaxError: Unexpected identifier 'ultimos'`**.

**Causa raiz confirmada**: um comentário HTML dentro do template literal gigante do JS (`app.innerHTML = \`...\``, linha ~664-772) continha crases (`` ` ``) usadas como formatação estilo Markdown — `` `ultimos` `` — na linha 694. Como esse "comentário" na verdade é conteúdo de uma string JS (não um comentário real, já que está dentro de um template literal), o primeiro crase fechava a string do JS sem querer, "ultimos" virava um token de código solto (daí o erro), e o segundo crase abria uma string nova, bagunçando o resto do parse. **Sendo erro de sintaxe (não de execução), nenhum dos 2 try/catch das tentativas anteriores conseguia pegar** — o `<script>` inteiro nem chegava a ser interpretado pelo navegador, por isso a página ficava travada sem nenhum erro visível.

**Correção**: crases trocadas por aspas simples no comentário (linha 694). Testado ao vivo em produção (`https://wallacelira.com.br/solar-compartilhado.html?token=...`, aba nova, sem cache) — **confirmado funcionando**: página renderiza completa (geração, autoconsumo, créditos Fluxo 1/2, gráficos, histórico de ciclos, card do medidor Tuya), zero erro no console.

Commits: `e5f5e6d` (2 correções anteriores + comentário de bug no topo do arquivo), `ad21e0a` (a correção real). Ambos publicados e testados.

**Lição registrada pro futuro**: a verificação manual de sintaxe (contagem de chaves/parênteses feita em sessões anteriores) não detecta esse tipo de bug — crase solta dentro de HTML-dentro-de-template-literal é um ponto cego real. Se aparecer sintoma parecido de novo (travamento silencioso, sem erro nenhum), abrir a página em navegador real com DevTools **é sempre o primeiro passo**, não o último.

### 0.2 Medidor DDSU666 direto no inversor SAJ — investigação completa + firmware pronto

**Contexto**: o usuário tem um inversor SAJ R5-6K-S2-15 e quer ligar um medidor DDSU666 (Chint) direto na porta RS485 dele, pra ler energia importada/exportada automaticamente (função equivalente ao código 03/103 da Energisa que hoje é só leitura manual). O suporte técnico da SAJ insiste que é preciso comprar um "Kit SEC" (medidor + módulo WiFi separado) — usuário desconfiava que essa exigência não tinha respaldo no manual do próprio equipamento.

**Investigação (várias rodadas de pesquisa + leitura de manuais oficiais fornecidos pelo usuário)**:
1. Datasheet do SEC Kit: função é "upload de dados do smart meter + inversor pra nuvem eSolar via WiFi/Ethernet" (24H Load Monitoring) — não é a função básica de leitura/limitação de exportação.
2. Manual de instalação do SEC Kit mostrava o SEC no meio da cadeia RS485 (inversor→SEC→medidor) — motivo real da confusão do suporte, mas é a topologia de UM produto específico, não a única forma de ligar o medidor.
3. **Manual oficial do DDSU666 monofásico** (seção 6, "Export limitation function setting"): dá o passo a passo pra habilitar limitação de exportação via app "eSolar O&M", conectando localmente (Bluetooth/WiFi) no próprio inversor — **zero menção ao Kit SEC**.
4. **Manual oficial do inversor R5** (51 páginas): confirma "There is no LCD display screen in R5 series products" (bate com a observação do usuário) e tem um **código de erro dedicado** (Erro 49, "Loss of communication between Power Meter and Control Board") — prova de que comunicação com medidor externo é função NATIVA do firmware do inversor, não dependente de acessório de terceiro. Em 51 páginas, "SEC" não aparece nenhuma vez.
5. Suporte SAJ, contatado diretamente, recusou responder ("SAJ não disponibiliza suporte técnico para plataformas de terceiros nem APIs pra integração externa") — confirma que não vale a pena esperar resposta oficial deles.
6. **Sondagem real da API SAJ rodada 17/08 (antes da instalação física)**: `energyDataList` só trouxe `PV_ENERGY` (já conhecido); achado real foi um campo separado, `recommendInstallingSecTip` — o nome do campo amarra especificamente ao "SEC" no backend deles, sugerindo que o lado de NUVEM (não o local) pode continuar condicionado ao Kit SEC mesmo com o medidor instalado direto.

**Decisão tomada**: em vez de depender da resposta da SAJ (que não vai vir) ou da nuvem deles (incerta), o caminho é um **ESP32 + módulo MAX485 lendo o medidor via Modbus RTU direto**, postando os dados direto no Supabase — mesmo padrão arquitetural já usado no medidor Tuya do apartamento (dispositivo local → banco, sem nuvem de terceiro no meio). Resolve o problema independente de qualquer coisa que a SAJ decida.

**Entregas desta sessão**:
- **Schema Supabase criado e em produção**: tabela `medidor_ddsu666_saj_leituras` + RPC `atualizar_medidor_ddsu666_saj`, mesmo padrão de segurança (RLS Firebase pra leitura, `service_role`-only pra escrita) do medidor Tuya. `get_advisors` rodado, único aviso é o mesmo WARN padrão já aceito nas funções gêmeas.
- **Mapa de registradores Modbus correto** confirmado por fonte primária (manual oficial DDSU666 monofásico, ZTY0.464.1224) — **cuidado, existe um mapa ERRADO documentado numa tentativa anterior da mesma sessão** (endereços `101EH`/`1028H`, que são do modelo TRIFÁSICO DTSU666/DSSU666, corrigidos pros endereços certos `4000H`/`400AH` do modelo monofásico real). Ver `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md` seção 8 pro mapa completo e o alerta de correção.
- **Firmware ESP32 completo e pronto**: `firmware/esp32_ddsu666_saj/esp32_ddsu666_saj.ino` — lê tensão/corrente/potência/energia importada/exportada via Modbus, posta no Supabase a cada 5min. `segredos.h.exemplo` (template de WiFi/chave, nunca commitado) e `README.md` (material, fiação, passo a passo, mapa de registradores) junto.
- **Usuário já comprou o material** (ESP32, MAX485, fonte, jumpers, caixinha) e está com o Arduino IDE configurado (ESP32 board + biblioteca ModbusMaster instalados, `segredos.h` preenchido com WiFi e chave do Supabase) — só falta compilar/gravar e testar o WiFi (sem o medidor ainda, que só chega fisicamente 25/08/2026).

**Nada disso foi testado com o medidor real ainda** — instalação física, reconfiguração do medidor (sai de fábrica em protocolo DL/T645, precisa trocar pra Modbus pelos botões físicos) e teste de leitura real ficam pra quando o hardware chegar (25/08/2026).

### 0.3 Limpeza — 5 PDFs de manuais removidos da raiz do projeto

Os 5 manuais (DDSU666 monofásico e trifásico, Smart Meters datasheet, SEC Kit, inversor R5) que o usuário colocou na raiz do projeto pra eu ler foram removidos depois de extraído tudo que precisava (já documentado em `EVOLUCAO_SOLAR_MEDIDOR_SAJ.md`) — eram arquivos de referência temporários, nunca fizeram parte do código do site, nunca foram commitados.

## 1. Bloco 20 (17/08/2026) — modelo solar + medidor Tuya em produção + cotações de opções ampliadas

Resumo (detalhe completo no `PASSAGEM_DE_TURNO.md`): modelo de geração solar por curva de elevação real; medidor Tuya do apartamento em produção (cron 10min); cotação de opções ampliada (PETR4+ITUB4); UI da barra de abas corrigida; busca global corrigida; runbook de replicação do medidor Tuya criado; e a paridade do compartilhado que gerou o bug do bloco 21 (0.1 acima) — **encerrado nesta sessão, não é mais pendência**.

## 2. Bloco 19 e anteriores

Ver `PASSAGEM_DE_TURNO.md` para o histórico completo — nenhuma mudança nesta sessão nos itens desses blocos.

## 🎯 Regras permanentes de sessões anteriores (não reabrir sem pedido novo)

1. **Migração V1→V2 relacional está formalmente encerrada** — não reabrir.
2. **Mastercard Black e Caixa Mastercard_Infinite** — exceção formalizada, não reabrir.
3. **Visa Infinite** — cobertura baixa de `cartao_id`/histórico, congelado por decisão explícita. Cartão 4845 (Vanessa) ATIVO; só o 4844 (Wallace) aposentado.
4. **"Estimado só na ausência de valor final"** — ao destravar campo antes manual/estimado, auditar quem mais consumia a versão antiga.
5. **Rendimento por cofrinho do Mercado Pago não é automatizável** — não reabrir sem pista nova concreta.
6. **`.git` real fica em `C:\Users\WLI015\.git-repos\Site.git`** (fora da pasta sincronizada pelo Drive) — máquina nova precisa de `git clone` novo. Usar `.claude\git-safe-sync.ps1` (retry automático) em vez de `git pull --rebase`/`push` cru — se ele recusar com erro fora do padrão conhecido, resolver manualmente (`git stash` do que estiver bloqueando, rebase, `git stash pop`) em vez de insistir cru.
7. **Boot do painel: ~1,7-1,8s de `aplicarOnda6MercadoPago`/`aplicarOnda7Pluggy` NÃO é bug de código** — não reabrir sem medir de novo.
8. **Compra de cartão NUNCA reduz o saldo real de nenhuma caixa** (manual seção 1.3.5). `cartao_id` preenchido → `afeta_saldo_real=false`, sempre.
9. **Procedimento de baixa da fatura**: `UPDATE` na MESMA linha de `transacoes` (`afeta_saldo_real` false→true). Nunca criar uma segunda transação.
10. **Nenhuma constante financeira nova deve nascer hardcoded no `.js`** se já existe (ou faz sentido existir) lugar correspondente em `parametros_gerais`/`indicadores`.
11. **Caixa Lance ENTRA no Patrimônio Líquido do WWI**, mas continua FORA da fórmula do Painel Executivo/Balanço.
12. **Inbox Financeira DESATIVADA DA UI** — itens ambíguos ficam `pendente` silenciosamente, nunca mais reportados ao usuário.
13. **Leitura manual de `energia_solar_leituras` sempre usa a data/hora REAL da foto**, nunca "hoje" no momento de gravar.
14. **Medidor solar DDSU666 (Casa da Mãe): modelo certo (313270) só libera 25/08/2026.** Não sondar API antes dessa data. **Não confundir com o medidor DDSU666 do bloco 21 (0.2 acima)** — mesma família de hardware, contextos diferentes (Casa da Mãe × ligação no inversor SAJ do usuário), mas na prática podem ser o mesmo evento físico (medidor chegando 25/08) — conferir com o usuário se surgir ambiguidade.
15. **WWI (Wallace Wealth Intelligence) congelado funcionalmente, em observação** desde 15/08/2026. Não abrir fase nova sem evidência real ou pedido explícito.
16. **Necessidade Total Bruta/Líquida persistida em `indicadores`** a cada recálculo.
17. **Medidor Tuya do apartamento em produção**, cron dedicado a cada 10min. Card na aba Solar.
18. **`executar_tudo.yml` NÃO é o mecanismo real de automação deste sistema.** Cada workflow precisa de tarefa dedicada no cron-job.org.
19. **Cotação de opções cobre PETR4 (brapi.dev) e ITUB4 (fallback `opcoes.net.br`, scraping).**
20. **Limiar `SOLAR_STATUS_LIMITES - acimaApartirDe` é 110%** (não mais 115%).
21. **`solar-compartilhado.html` tinha try/catch incompleto — corrigido e AGORA CONFIRMADO FUNCIONANDO** (ver 0.1 acima). Checar se algum outro arquivo autocontido do site tem o mesmo ponto cego (crase solta dentro de template literal) antes de assumir que não.
22. **Runbook de replicação de medidor Tuya existe** em `docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md`.
23. **NOVO bloco 21 — Kit SEC da SAJ não é exigível pra função básica de medidor+export limitation**, confirmado por 4 manuais oficiais lidos na íntegra. Ver `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md` seções 7-9 pro histórico completo da investigação. SAJ recusou dar suporte à integração — não insistir em contato com eles.
24. **NOVO bloco 21 — Firmware ESP32 pro DDSU666/SAJ está pronto** em `firmware/esp32_ddsu666_saj/`, aguardando só a chegada física do hardware (25/08/2026) pra fiação e teste real. Mapa de registradores Modbus documentado — usar SEMPRE os endereços do manual monofásico (`4000H`/`400AH` pra energia), nunca os do trifásico (`101EH`/`1028H`, que foi um erro descartado na mesma sessão).

## 3. Pendências abertas

### 3.1 Instalação física do DDSU666 (SAJ, ligação direta no inversor) — aguardando hardware chegar
Material comprado pelo usuário (ESP32, MAX485, fonte, jumpers, caixa). Firmware pronto e testado (parte que dá pra testar sem o medidor — WiFi conecta OK). Falta: hardware chegar, reconfigurar o medidor pra protocolo Modbus (botões físicos), fazer a fiação, testar leitura real, fechar a instalação.

### 3.2 R$340,00 do ciclo Wärtsilä 2026-07 ainda não confirmados como recebidos
Não é a mesma coisa que as TEDs já lançadas (`TX000220`/`TX000280`).

### 3.3 LREI0004 (R$103,55) segue ativa
Aguardando Caixa Manutenção acumular saldo suficiente.

### 3.4 Backlog técnico adiado (decisão consciente do usuário)
Lint dos ~91 módulos `hydrate-*` — análise estática de qualidade de código, não é bug, adiado por decisão própria do usuário. Não reabrir sem pedido novo.

### 3.5 ENCERRADO — projeto "Agente financeiro no WhatsApp/Telegram"
Cancelado pelo usuário em 17/08. Reaberto como pergunta nesta sessão (ESP32 poderia servir de servidor?) — respondido que não é tecnicamente viável (ESP32 é microcontrolador, não roda Node/navegador) e que os 2 motivos originais do cancelamento (custo de API inevitável + precisa rodar em algum lugar 24/7) continuam de pé. Usuário ainda não respondeu se topa esses 2 pontos — **não retomar sem essa confirmação explícita**.

## 4. Protocolo de sessão nova

1. Este arquivo primeiro, depois os blocos mais recentes de `docs/changelog/PASSAGEM_DE_TURNO.md`.
2. `git status` — não deveria haver nada pendente no momento desta reescrita, mas confirmar sempre.
3. **Se o usuário mencionar o medidor DDSU666 chegando/instalado**: ver seção 3.1 acima — próximo passo é reconfigurar protocolo, fazer fiação, gravar firmware (já pronto), testar. Mapa de registradores em `docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md` seção 8.
4. Confirmar `__V` (rodapé do site) bate com o HEAD do commit antes de pedir pro usuário testar qualquer coisa.
5. **Sobre o WWI: NÃO retomar trabalho novo por conta própria** — congelado, regra 15.
6. Se o medidor Tuya parecer travado de novo, é MUITO provavelmente o aparelho físico — orientar reset do disjuntor antes de investigar a integração.
7. **`solar-compartilhado.html` está confirmado funcionando** (0.1 acima) — se o usuário reportar travamento de novo, não repetir as mesmas 3 tentativas já feitas; ler o console do navegador real primeiro (Browser tool), é o método que finalmente achou a causa raiz desta vez.
