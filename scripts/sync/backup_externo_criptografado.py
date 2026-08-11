#!/usr/bin/env python3
"""
Backup externo criptografado (Supabase -> GitHub) - Sistema Wallace Lira
==========================================================================
NOVO 11/08/2026 - fecha o ultimo ponto unico de falha da auditoria de
continuidade de negocio: os backups da tabela `backups` (ver
docs/decisions/BACKUP_RESTORE.md) vivem DENTRO da mesma instancia Supabase -
nao sobrevivem a perda total do projeto (exclusao de conta, catastrofe do
provedor). Este script cria uma copia INDEPENDENTE, fora da infraestrutura
Supabase, dentro deste mesmo repositorio GitHub. Como o repositorio e
PUBLICO, o conteudo e criptografado (Fernet/AES) antes de ser gravado - sem
a chave (guardada so em GitHub Secrets, nunca commitada), o arquivo e ruido
ilegivel.

Fluxo:
  1. Chama a RPC criar_backup_completo() (mesma usada pelo pg_cron interno)
     para garantir um snapshot fresco, sem depender do cron interno do
     Supabase ja ter rodado hoje.
  2. Busca o conteudo desse backup na tabela `backups`.
  3. Criptografa o JSON com Fernet.
  4. Grava em backups_externos/wallace_backup_<timestamp>.json.enc (o commit
     e o push ficam por conta do workflow do GitHub Actions, nao deste
     script).
  5. Poda arquivos locais com mais de RETENCAO_DIAS dias.

Variaveis de ambiente necessarias:
  SUPABASE_URL           - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY           - chave service_role (mesma dos outros scripts -
                            confirmado empiricamente que e service_role,
                            11/08/2026: RPCs que exigem service_role estrito
                            ja funcionam com essa mesma chave)
  BACKUP_ENCRYPTION_KEY  - chave Fernet dedicada (gerada 1x, guardada so no
                            GitHub Secrets - nunca commitar, nunca logar)
"""
import glob
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from cryptography.fernet import Fernet

PASTA_BACKUPS = "backups_externos"
RETENCAO_DIAS = 30


def chamar_rpc_criar_backup(supabase_url: str, supabase_key: str) -> str:
    url = f"{supabase_url}/rest/v1/rpc/criar_backup_completo"
    req = Request(url, data=b"{}", method="POST", headers={
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    })
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def buscar_conteudo_backup(supabase_url: str, supabase_key: str, backup_id: str) -> dict:
    url = f"{supabase_url}/rest/v1/backups?id=eq.{backup_id}&select=conteudo,tamanho_bytes,criado_em,erro"
    req = Request(url, method="GET", headers={
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    })
    with urlopen(req, timeout=60) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    if not linhas:
        raise RuntimeError(f"Backup {backup_id} nao encontrado logo apos ser criado")
    return linhas[0]


def podar_backups_antigos() -> None:
    limite = datetime.now(timezone.utc) - timedelta(days=RETENCAO_DIAS)
    for caminho in glob.glob(os.path.join(PASTA_BACKUPS, "wallace_backup_*.json.enc")):
        nome = os.path.basename(caminho)
        try:
            timestamp_str = nome.replace("wallace_backup_", "").replace(".json.enc", "")
            data_arquivo = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if data_arquivo < limite:
            os.remove(caminho)
            print(f"Removido (retencao {RETENCAO_DIAS}d): {nome}")


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    chave_criptografia = os.environ.get("BACKUP_ENCRYPTION_KEY")

    if not supabase_url or not supabase_key:
        print("ERRO: SUPABASE_URL e/ou SUPABASE_KEY nao definidos.", file=sys.stderr)
        return 1
    if not chave_criptografia:
        print("ERRO: BACKUP_ENCRYPTION_KEY nao definida.", file=sys.stderr)
        return 1

    try:
        print("Criando snapshot fresco no Supabase (criar_backup_completo)...")
        backup_id = chamar_rpc_criar_backup(supabase_url, supabase_key)
        print(f"Backup interno criado: {backup_id}")

        linha = buscar_conteudo_backup(supabase_url, supabase_key, backup_id)
        if linha.get("erro"):
            print(f"AVISO: backup interno reportou erro parcial: {linha['erro']}", file=sys.stderr)

        conteudo_json = json.dumps(linha["conteudo"]).encode("utf-8")
        print(f"Conteudo obtido: {len(conteudo_json)} bytes")

        fernet = Fernet(chave_criptografia.encode("utf-8"))
        conteudo_criptografado = fernet.encrypt(conteudo_json)

        os.makedirs(PASTA_BACKUPS, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        caminho = os.path.join(PASTA_BACKUPS, f"wallace_backup_{timestamp}.json.enc")
        with open(caminho, "wb") as fh:
            fh.write(conteudo_criptografado)
        print(f"Backup externo gravado: {caminho} ({len(conteudo_criptografado)} bytes)")

        podar_backups_antigos()

        print("Concluido com sucesso.")
        return 0
    except (HTTPError, URLError) as e:
        print(f"ERRO de rede/HTTP: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("backup_externo", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
