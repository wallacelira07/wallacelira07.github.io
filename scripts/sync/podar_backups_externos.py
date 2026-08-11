#!/usr/bin/env python3
"""
Poda de backups externos por retenção (uso interno do workflow backup_externo.yml)
======================================================================================
Apaga arquivos backups_externos/<prefixo><timestamp><sufixo> mais antigos que
--dias, usando o timestamp EMBUTIDO NO NOME do arquivo (não o mtime do
filesystem - um checkout novo do git zera o mtime de todo arquivo pro
momento do checkout, então filtrar por mtime não funcionaria numa run efêmera
de CI).

Uso:
  python3 scripts/sync/podar_backups_externos.py --prefixo wallace_schema_ --sufixo .sql --dias 30
"""
import argparse
import glob
import os
from datetime import datetime, timedelta, timezone

PASTA_BACKUPS = "backups_externos"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefixo", required=True)
    parser.add_argument("--sufixo", required=True)
    parser.add_argument("--dias", type=int, required=True)
    args = parser.parse_args()

    limite = datetime.now(timezone.utc) - timedelta(days=args.dias)
    padrao = os.path.join(PASTA_BACKUPS, f"{args.prefixo}*{args.sufixo}")

    for caminho in glob.glob(padrao):
        nome = os.path.basename(caminho)
        timestamp_str = nome[len(args.prefixo):-len(args.sufixo)]
        try:
            data_arquivo = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if data_arquivo < limite:
            os.remove(caminho)
            print(f"Removido (retenção {args.dias}d): {nome}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
