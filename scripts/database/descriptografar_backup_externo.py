#!/usr/bin/env python3
"""
Descriptografar backup externo (uso manual, em recuperação de desastre)
==========================================================================
Script de USO LOCAL (não roda no GitHub Actions) para o cenário de perda
total do projeto Supabase — ver docs/decisions/CONTINUIDADE_NEGOCIO_DR.md.

Lê um arquivo .enc de backups_externos/ (gravado por
scripts/sync/backup_externo_criptografado.py) e devolve o JSON original em
texto puro, pronto para reidratar manualmente num Supabase novo.

Uso:
  python3 scripts/database/descriptografar_backup_externo.py \
      backups_externos/wallace_backup_20260811_221255.json.enc \
      --chave "<valor de BACKUP_ENCRYPTION_KEY>" \
      --saida backup_decifrado.json

Se --chave não for passado, lê da variável de ambiente BACKUP_ENCRYPTION_KEY.
Se --saida não for passado, imprime no stdout.
"""
import argparse
import json
import os
import sys

from cryptography.fernet import Fernet, InvalidToken


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("arquivo", help="Caminho do arquivo .json.enc")
    parser.add_argument("--chave", help="Chave Fernet (ou usar BACKUP_ENCRYPTION_KEY no ambiente)")
    parser.add_argument("--saida", help="Arquivo de saída (padrão: stdout)")
    args = parser.parse_args()

    chave = args.chave or os.environ.get("BACKUP_ENCRYPTION_KEY")
    if not chave:
        print("ERRO: informe --chave ou defina BACKUP_ENCRYPTION_KEY no ambiente.", file=sys.stderr)
        return 1

    with open(args.arquivo, "rb") as fh:
        conteudo_criptografado = fh.read()

    try:
        fernet = Fernet(chave.encode("utf-8"))
        conteudo_json = fernet.decrypt(conteudo_criptografado)
    except InvalidToken:
        print("ERRO: chave errada ou arquivo corrompido/adulterado.", file=sys.stderr)
        return 1

    # valida que é JSON de verdade antes de gravar/imprimir
    dados = json.loads(conteudo_json)
    tabelas = list(dados.keys())
    print(f"OK: {len(tabelas)} tabelas no backup: {', '.join(tabelas[:10])}{'...' if len(tabelas) > 10 else ''}", file=sys.stderr)

    saida_texto = json.dumps(dados, ensure_ascii=False, indent=2)
    if args.saida:
        with open(args.saida, "w", encoding="utf-8") as fh:
            fh.write(saida_texto)
        print(f"Gravado em {args.saida}", file=sys.stderr)
    else:
        print(saida_texto)

    return 0


if __name__ == "__main__":
    sys.exit(main())
