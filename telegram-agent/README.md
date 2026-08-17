# telegram-agent — protótipo de agente financeiro via Telegram

Alternativa **sem custo e mais simples** ao protótipo irmão `whatsapp-agent/`
(mesma pasta raiz deste repositório). Faz a mesma coisa — responde perguntas
sobre saldo/transações e propõe lançamentos, sempre com confirmação explícita
antes de gravar qualquer coisa — mas usando Telegram em vez de WhatsApp.

## Por que Telegram em vez de WhatsApp

| | WhatsApp (Twilio/Meta) | Telegram |
|---|---|---|
| Conta necessária | Business Account + verificação | Só sua conta pessoal do Telegram, já existente |
| Custo | Sandbox grátis pra testar; produção pode ter custo por mensagem/hospedagem | Sempre grátis, sem limite de mensagens |
| Servidor público (webhook) | Obrigatório (precisa de HTTPS público — ngrok ou hospedagem) | **Não precisa** — usa "long polling", roda no seu computador |
| Tempo pra primeira mensagem funcionando | Minutos (Twilio Sandbox) a dias (Meta produção) | ~2 minutos |
| Validação de assinatura de webhook | Sim (X-Hub-Signature-256 / X-Twilio-Signature) | Não se aplica (sem webhook) |

A diferença técnica central: o Telegram Bot API oferece **long polling**
(`getUpdates`) — o próprio script pergunta ao Telegram "tem mensagem nova?"
em loop, e o Telegram segura a resposta até ter algo ou até um timeout
passar. Isso elimina a necessidade de expor seu computador à internet
(ngrok/hospedagem/HTTPS/certificado) — o preço dessa simplicidade é que o bot
só responde enquanto o script estiver rodando (fechou o terminal, para de
responder até rodar `npm start` de novo).

## O que é reaproveitado do protótipo whatsapp-agent/

A lógica de negócio (não depende de canal nenhum) é idêntica, copiada sem
mudança de comportamento:
- `src/agent/tools.js` — as mesmas 5 tools (buscar_referencia, consultar_saldo,
  listar_transacoes_recentes, consultar_resumo_financeiro, propor_lancamento).
- `src/agent/claudeAgent.js` — mesmo loop de tool-use.
- `src/supabase/client.js` e `queries.js` — mesmas consultas/RPC ao Supabase.
- `src/conversation/pendingConfirmations.js` — mesmo mecanismo de confirmação
  em código (não delegado ao modelo).
- `src/utils/confirmationWords.js` — mesmo reconhecimento de "sim"/"não".

O que muda é só a camada de canal: `src/telegram.js` (long polling +
sendMessage, via fetch direto à API do Telegram, sem SDK) no lugar de
`src/whatsapp/*.js` + `src/server.js` (Express, rotas de webhook, validação
de assinatura Meta/Twilio).

## Regra de segurança (igual ao protótipo irmão, não relaxada)

A confirmação antes de lançar é aplicada em **código determinístico**
(`src/index.js`), nunca deixada a critério do modelo — mesma defesa em
profundidade documentada em `docs/MANUAL_OPERACIONAL_AGENTES.md` e no mesmo
incidente que gerou a proibição de 17/08/2026 de auto-lançar a partir da
Inbox Financeira. `propor_lancamento` (a única tool "de escrita") nunca toca
o banco — só registra uma proposta em memória e devolve o texto de
confirmação. O `INSERT` real só acontece se uma mensagem **separada**, do
mesmo chat autorizado, confirmar com "sim" dentro do prazo configurado.

## Rodando localmente

```bash
cd telegram-agent
npm install
cp .env.example .env
# preencha o .env (ver PROXIMOS_PASSOS.md)
npm start
```

Deixe o terminal aberto — é o "servidor". Pra rodar em segundo plano de
forma mais robusta (sobrevive a fechar o terminal, reinicia sozinho se
cair), considere `pm2` (`npm install -g pm2 && pm2 start src/index.js --name telegram-agent`)
depois de validar que funciona com `npm start` primeiro.

## Limitações conhecidas (documentadas, não escondidas)

- **Estado de confirmação em memória** (`pendingConfirmations.js`) — reiniciar
  o processo perde qualquer proposta pendente (não é destrutivo, só precisa
  perguntar de novo).
- **`audit_log` grava `origem='sistema'`** para lançamentos feitos por este
  agente (mesma limitação do protótipo irmão — ver comentário em
  `src/supabase/queries.js#lancarTransacao`), a menos que uma RPC dedicada
  seja criada depois (mudança de schema, fora do escopo deste protótipo).
- **Só processa mensagens de texto** — foto/áudio/sticker são ignorados por
  enquanto (poderia usar Vision da Anthropic pra ler foto de comprovante,
  mas isso é uma extensão futura, não implementada aqui).
- **Um único processo** — não foi pensado pra rodar várias instâncias ao
  mesmo tempo (cada uma teria seu próprio estado de confirmação em memória e
  brigaria pelo `getUpdates` do mesmo bot).
