# Próximos passos — o que só você pode fazer

Bem mais curto que o do `whatsapp-agent/` — Telegram não exige conta
business, verificação de identidade, nem cartão de crédito. São só 2 coisas
que só você pode fazer (nenhuma IA pode fazer por você — é sua conta pessoal
do Telegram, ninguém mais deveria poder criar um bot "em seu nome"):

## 1. Criar o bot e pegar o token (2 minutos)

- [ ] Abra o Telegram (celular ou computador) e procure por **@BotFather**
      (é um bot oficial do próprio Telegram, tem um selo azul de verificado).
- [ ] Mande a mensagem `/newbot`.
- [ ] Ele vai perguntar um **nome** pro bot (pode ser qualquer coisa, ex:
      "Wallace Financeiro") e depois um **username** (tem que terminar em
      `bot`, ex: `wallace_financeiro_bot` — se já existir alguém com esse
      nome, tenta outra variação).
- [ ] O BotFather responde com uma mensagem contendo um **token**, algo
      como `123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`. Copie esse token
      inteiro.
- [ ] Cole esse valor em `TELEGRAM_BOT_TOKEN` no `.env` (copie
      `.env.example` para `.env` primeiro, dentro da pasta `telegram-agent/`).

## 2. Descobrir seu próprio chat_id (pra só você poder falar com o bot)

- [ ] No Telegram, procure pelo username do bot que você acabou de criar
      (o mesmo que você escolheu no passo 1) e mande qualquer mensagem pra
      ele (ex: "oi") — mesmo que ele não responda nada ainda, isso registra
      a mensagem do lado do Telegram.
- [ ] No navegador, abra esta URL, trocando `SEU_TOKEN` pelo token que você
      copiou no passo 1:
      `https://api.telegram.org/botSEU_TOKEN/getUpdates`
- [ ] Vai aparecer um texto (JSON) — procure por `"chat":{"id":` seguido de
      um número (pode ser negativo, tudo bem). Esse número é o seu
      **chat_id**.
- [ ] Cole esse número em `ALLOWED_TELEGRAM_CHAT_IDS` no `.env` (se quiser
      autorizar mais de uma pessoa/chat, separe por vírgula).

## 3. Preencher o resto do `.env` e rodar

- [ ] `ANTHROPIC_API_KEY` — sua chave da API da Anthropic
      ([console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Project Settings →
      API → "service_role" (a de escrita, não a `anon`/pública). **Cuidado**:
      dá acesso total ao banco, nunca cole em lugar nenhum além do `.env`.
- [ ] No terminal:
      ```bash
      cd telegram-agent
      npm install
      npm start
      ```
- [ ] Deve aparecer no terminal algo como
      `[index] telegram-agent iniciando (allowlist: 1 chat(s) autorizado(s)).`
      seguido de `[telegram] polling iniciado`.
- [ ] Mande uma mensagem de teste pro bot no Telegram: "qual o saldo da
      caixa variável?" — se não responder nada, olhe o terminal por uma
      linha de erro (normalmente é chave errada ou chat_id fora da
      allowlist).

## Depois de estar rodando — checklist de segurança antes de usar de verdade

- [ ] `ALLOWED_TELEGRAM_CHAT_IDS` preenchido só com chats que você confia —
      qualquer chat autorizado pode consultar saldo e propor lançamentos.
- [ ] Testar o fluxo de confirmação manualmente pelo menos uma vez: pedir
      um lançamento, receber a pergunta de confirmação, responder "não" e
      confirmar no Supabase que nada foi gravado; depois repetir respondendo
      "sim" e confirmar que gravou exatamente uma vez.
- [ ] Lembrar que o bot só responde enquanto `npm start` estiver rodando —
      se fechar o terminal, ele para. Se quiser deixar rodando o tempo todo
      sem precisar lembrar de abrir o terminal toda vez, ver a seção "pm2"
      do `README.md` (ainda gratuito, roda no seu próprio computador — só
      facilita não esquecer de ligar).

## Se um dia quiser trocar por WhatsApp

O protótipo `whatsapp-agent/` (na mesma pasta raiz) já existe pronto, com a
mesma lógica de negócio — é só uma questão de decidir se vale o custo/
complexidade extra (conta business, servidor público) quando isso fizer
sentido pra você. Nenhum dos dois depende do outro.
