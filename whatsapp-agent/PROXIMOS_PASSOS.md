# Próximos passos — o que só você pode fazer

Este documento lista, passo a passo, tudo que precisa de uma ação humana em
contas reais. Nenhum agente de IA (Claude Code incluído) pode criar contas
de WhatsApp Business, comprar número de telefone, aprovar App na Meta, ou
gastar dinheiro em hospedagem por você — isso é deliberado, não uma
limitação técnica contornável.

A ordem abaixo é a mais rápida para ver o protótipo funcionando de verdade
(caminho Twilio primeiro). Se você já sabe que quer ir direto para produção
com número próprio, pule para a seção "Caminho B — Meta Cloud API".

---

## 0. Pré-requisitos gerais

- [ ] Node.js 18.17 ou mais recente instalado na máquina que vai rodar o
      servidor (`node --version` para conferir).
- [ ] Uma chave de API da Anthropic (`ANTHROPIC_API_KEY`) — se você já usa
      Claude Chat/API para outra coisa, pode reaproveitar uma chave existente
      ou criar uma nova em [console.anthropic.com](https://console.anthropic.com/settings/keys).
- [ ] A `SUPABASE_SERVICE_ROLE_KEY` do projeto `bakdgacmwlopvrrppwdm` — a
      **mesma classe de chave** que os scripts em `scripts/sync/*.py` já usam
      (não é a chave pública/anon, é a de service_role, com permissão de
      escrita). Encontre em: Supabase Dashboard → Project Settings → API →
      "service_role" (em "Project API keys").
      **Cuidado**: essa chave dá acesso total ao banco. Nunca cole ela em
      lugar nenhum além do `.env` local (que nunca vai para o Git).

---

## Caminho A — Twilio WhatsApp Sandbox (recomendado para prototipar, minutos)

### A1. Criar conta Twilio

- [ ] Vá em [twilio.com/try-twilio](https://www.twilio.com/try-twilio) e crie
      uma conta gratuita (cartão pode ser pedido para verificação, mas o
      Sandbox de WhatsApp não cobra por si só).
- [ ] No Console Twilio, anote o **Account SID** e o **Auth Token**
      (aparecem na página inicial do Console) — vão em `TWILIO_ACCOUNT_SID`
      e `TWILIO_AUTH_TOKEN` no `.env`.

### A2. Ativar o WhatsApp Sandbox

- [ ] No Console Twilio, vá em **Messaging → Try it out → Send a WhatsApp message**
      (ou busque "WhatsApp Sandbox" na busca do Console).
- [ ] Você vai ver um número Twilio (geralmente `+1 415 523 8886`) e uma
      frase tipo `join <duas-palavras>`.
- [ ] No seu celular, mande essa frase exata pelo WhatsApp para esse número.
      Isso "conecta" seu número pessoal ao Sandbox por 72 horas (depois
      precisa mandar a frase de novo se ficar mais de 72h sem interagir).
- [ ] Coloque esse número Twilio em `TWILIO_WHATSAPP_FROM` no `.env`, no
      formato `whatsapp:+14155238886`.

### A3. Configurar o webhook do Sandbox

- [ ] Ainda na página do Sandbox, tem um campo **"When a message comes in"**
      — cole ali a URL pública do seu servidor local + `/webhook/twilio`
      (ex: `https://SEU-SUBDOMINIO.ngrok-free.app/webhook/twilio`). Você só
      vai ter essa URL depois do passo A4.
- [ ] Método: **HTTP POST**.

### A4. Expor seu servidor local com HTTPS público (ngrok)

O WhatsApp/Twilio precisa conseguir chamar seu servidor pela internet — ele
não enxerga `localhost`.

- [ ] Instale o [ngrok](https://ngrok.com/download) (ou similar: Cloudflare
      Tunnel, localtunnel).
- [ ] Rode o servidor local: `cd whatsapp-agent && npm start` (porta 3000
      por padrão).
- [ ] Em outro terminal: `ngrok http 3000`.
- [ ] Copie a URL HTTPS que o ngrok mostra (algo como
      `https://abcd1234.ngrok-free.app`) e volte no passo A3 para colar
      `<essa-url>/webhook/twilio` no campo do Sandbox.
- [ ] **Atenção**: no plano gratuito do ngrok, essa URL muda toda vez que
      você reinicia o túnel — você vai precisar atualizar o campo no Twilio
      de novo. Para um número fixo, considere um plano pago do ngrok ou um
      dos serviços de hospedagem do Caminho C.

### A5. Preencher o `.env` e testar

- [ ] Copie `.env.example` para `.env` dentro de `whatsapp-agent/`.
- [ ] Preencha `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
- [ ] Defina `WHATSAPP_PROVIDER=twilio`.
- [ ] Defina `WALLACE_WHATSAPP_ALLOWED_NUMBERS` com o **seu próprio número**
      de WhatsApp em formato E.164 (ex: `+5541999999999`) — sem isso o
      agente ignora toda mensagem, mesmo a sua.
- [ ] Reinicie o servidor (`npm start`) depois de qualquer mudança no `.env`.
- [ ] Mande uma mensagem de teste pelo WhatsApp para o número do Sandbox:
      "qual o saldo da caixa variável?"
- [ ] Se não responder nada, olhe o terminal do servidor (`npm start`) para
      logs de erro — normalmente é chave errada ou allowlist sem o número
      certo.

---

## Caminho B — Meta WhatsApp Business Cloud API (produção, número fixo)

Faça isso depois de validar tudo no Caminho A, quando quiser um número que
não expira a cada 72h.

### B1. Criar conta Meta Business e App

- [ ] Crie (ou use uma existente) uma conta em
      [business.facebook.com](https://business.facebook.com/).
- [ ] Vá em [developers.facebook.com](https://developers.facebook.com/apps/)
      → "Criar App" → tipo "Business".
- [ ] Dentro do App, adicione o produto **"WhatsApp"**.

### B2. Configurar número de telefone

- [ ] A Meta te dá um número de teste grátis para começar (funciona só com
      até 5 números autorizados por você, ótimo para continuar prototipando
      sem gastar). Para produção de verdade, você vai precisar adicionar um
      número de telefone próprio (pode ser um número novo, não pode ser um
      já usado no WhatsApp normal/Business App) e passar pela verificação de
      negócio da Meta (pode levar de horas a alguns dias).
- [ ] Anote o **Phone Number ID** (aparece no painel do produto WhatsApp) →
      `WHATSAPP_META_PHONE_NUMBER_ID`.
- [ ] Gere um **token de acesso** (no início é um token temporário de 24h,
      bom só para testar; para produção real gere um token permanente via
      System User — a documentação da Meta explica o passo, muda com
      frequência então não vou fixar aqui o caminho exato do menu) →
      `WHATSAPP_META_TOKEN`.

### B3. Configurar o webhook

- [ ] No painel do produto WhatsApp → Configuration → Webhook, cole a URL
      pública do seu servidor + `/webhook/meta` (mesma lógica do ngrok do
      Caminho A, ou já a URL de produção se você já hospedou — ver
      Caminho C).
- [ ] Escolha um **Verify Token** — qualquer string secreta que você mesmo
      inventa (não vem de lugar nenhum, você que decide) — e coloque o mesmo
      valor em `WHATSAPP_META_VERIFY_TOKEN` no `.env` **antes** de salvar a
      URL no painel da Meta (a Meta faz uma checagem GET na hora de salvar,
      e o servidor precisa já estar rodando com esse valor configurado).
- [ ] Inscreva o webhook no campo **`messages`** (é o evento que carrega
      mensagens recebidas).
- [ ] Pegue o **App Secret** (Configurações do App → Básico) →
      `WHATSAPP_META_APP_SECRET` — usado para validar a assinatura de cada
      requisição recebida.

### B4. Preencher o `.env`

- [ ] Defina `WHATSAPP_PROVIDER=meta`.
- [ ] Preencha `WHATSAPP_META_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`,
      `WHATSAPP_META_VERIFY_TOKEN`, `WHATSAPP_META_APP_SECRET`.
- [ ] Reinicie o servidor.

---

## Caminho C — Hospedar em produção (sair do seu computador/ngrok)

Necessário se você quiser o agente disponível o tempo todo, não só quando
seu computador está ligado com `npm start` rodando.

- [ ] Escolha um provedor: Railway, Render, Fly.io, uma VPS pequena (ex:
      DigitalOcean/Hetzner), ou qualquer lugar que rode Node.js com HTTPS
      público. Não há recomendação forte aqui — qualquer um serve para o
      volume de tráfego de um assistente pessoal.
- [ ] Configure as mesmas variáveis de ambiente do `.env` no painel do
      provedor escolhido (nunca commitar o `.env` real no Git — o
      `.gitignore` deste diretório já bloqueia isso).
- [ ] Aponte o webhook (Twilio ou Meta, conforme o caminho escolhido) para
      a URL pública do serviço hospedado, em vez do túnel ngrok.
- [ ] Configure HTTPS (a maioria dos provedores acima já fornece certificado
      automático).

---

## Depois de estar rodando — checklist de segurança antes de usar de verdade

- [ ] `WALLACE_WHATSAPP_ALLOWED_NUMBERS` preenchido só com números que você
      confia de verdade — qualquer número nessa lista pode consultar saldo e
      propor lançamentos.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` nunca aparece em nenhum log, commit, ou
      mensagem de erro exposta ao usuário do WhatsApp.
- [ ] Testar o fluxo de confirmação manualmente pelo menos uma vez: pedir
      um lançamento, receber a pergunta de confirmação, responder "não" e
      confirmar no Supabase que nada foi gravado; depois repetir respondendo
      "sim" e confirmar que gravou exatamente uma vez.
- [ ] Testar o timeout de confirmação: propor um lançamento, esperar mais de
      `CONFIRMATION_TIMEOUT_MINUTES` (15 min por padrão), responder "sim", e
      confirmar que o agente diz que a proposta expirou (em vez de lançar
      uma proposta antiga por engano).

---

## Melhorias recomendadas antes de considerar isto "produção" (não bloqueantes para prototipar)

Estas não são passo a passo para o usuário — são notas técnicas para uma
sessão futura de Claude Code, deixadas aqui para não se perder:

- Mover `pendingConfirmations` (hoje um `Map` em memória) para uma tabela no
  Supabase, para sobreviver a reinícios do servidor e funcionar com mais de
  uma instância rodando.
- Criar uma RPC dedicada (`lancar_transacao_whatsapp_agent`, por exemplo)
  que já faça `set_config('audit.origem', 'whatsapp_agent', true)` antes do
  `INSERT`, para que `audit_log` pare de mostrar `origem='sistema'` para
  lançamentos vindos deste agente — isso é mudança de schema, exige Claude
  Code + o processo de dry-run da seção 4/7 do manual operacional, nunca
  aplicar sem revisão.
- Adicionar testes automatizados cobrindo `pendingConfirmations` +
  `confirmationWords` (o coração da regra de segurança) antes de confiar
  nisso com dinheiro real em produção contínua.
- Trocar a validação manual de assinatura do Twilio (`twilioSandbox.js`)
  pelo pacote oficial `twilio` (`validateRequest`) antes de produção — a
  implementação atual é simplificada para não adicionar dependência.
