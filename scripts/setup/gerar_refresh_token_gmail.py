#!/usr/bin/env python3
"""
Gerador de refresh_token do Gmail (uso único, roda localmente) — Sistema Wallace Lira
========================================================================================
NOVO 19/08/2026. Passo único pra habilitar scripts/sync/atualizar_boletos_medintech.py: obtém um
refresh_token de longa duração pra conta wallace.termica@gmail.com (a que recebe os e-mails da
Medintech), pra guardar como Secret do GitHub — o robô nunca precisa abrir navegador de novo depois
disso.

PRÉ-REQUISITOS (você faz 1x, no Google Cloud Console):
  1. console.cloud.google.com -> criar projeto novo (ou reaproveitar um existente)
  2. "APIs e Serviços" -> "Biblioteca" -> habilitar "Gmail API"
  3. "APIs e Serviços" -> "Tela de consentimento OAuth" -> tipo "Externo", preencher o mínimo
     (nome do app, e-mail), adicionar seu e-mail em "Usuários de teste" se ficar em modo teste
  4. "APIs e Serviços" -> "Credenciais" -> "Criar credenciais" -> "ID do cliente OAuth" -> tipo
     "App para computador" -> baixar o JSON, salvar como `credenciais_gmail_oauth.json` NA MESMA
     PASTA deste script (NUNCA commitar esse arquivo — já está no .gitignore? confirme antes)

RODAR:
  pip install google-auth-oauthlib
  python scripts/setup/gerar_refresh_token_gmail.py

Abre o navegador, você loga e autoriza (escopo: só LEITURA do Gmail, "gmail.readonly" — este
script/robô nunca manda nem apaga e-mail). No final, imprime 3 valores (client_id, client_secret,
refresh_token) pra você colar como Secrets no GitHub (Settings -> Secrets and variables -> Actions):
  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
"""
import json
import os

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
_PASTA = os.path.dirname(__file__)
_ARQ_CREDENCIAIS = os.path.join(_PASTA, "credenciais_gmail_oauth.json")


def main():
    from google_auth_oauthlib.flow import InstalledAppFlow

    if not os.path.exists(_ARQ_CREDENCIAIS):
        print(f"ERRO: não achei {_ARQ_CREDENCIAIS}")
        print("Baixe o JSON de credenciais OAuth do Google Cloud Console (ver instruções no topo deste arquivo) e salve com esse nome, nesta pasta.")
        return 1

    flow = InstalledAppFlow.from_client_secrets_file(_ARQ_CREDENCIAIS, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(_ARQ_CREDENCIAIS) as f:
        client_info = json.load(f)["installed"]

    print("\n" + "=" * 70)
    print("Sucesso! Copie estes 3 valores como Secrets do GitHub (Settings -> Secrets and variables -> Actions -> New repository secret):")
    print("=" * 70)
    print(f"GMAIL_CLIENT_ID = {client_info['client_id']}")
    print(f"GMAIL_CLIENT_SECRET = {client_info['client_secret']}")
    print(f"GMAIL_REFRESH_TOKEN = {creds.refresh_token}")
    print("=" * 70)
    print("\nDepois de salvar os 3 Secrets, pode apagar credenciais_gmail_oauth.json desta pasta (não precisa mais dele).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
