#!/usr/bin/env python3
"""
Heartbeat de automações -> Supabase (Sistema Wallace Lira)
============================================================
NOVO 11/08/2026 (hardening de produção, pedido do usuário: "eliminar falha
silenciosa" — nenhuma automação agendada tinha registro de última execução,
então uma falha silenciosa (cron parado, API mudou, credencial expirada)
só era percebida quando alguém notava o dado desatualizado na tela).

Grava 1 linha em `execucoes_jobs` (tabela V2) ao final de CADA execução de
job agendado, sucesso ou falha — o painel "Saúde Operacional" do site lê
`vw_saude_jobs` (última execução por job) pra mostrar OK/Atenção/Falha.

Uso (no final de cada script, dentro do bloco `if __name__ == "__main__":`):

    from _heartbeat import registrar_execucao
    codigo = main()
    registrar_execucao("nome_do_job", "sucesso" if codigo == 0 else "erro")
    sys.exit(codigo)

Falha ao registrar o heartbeat NUNCA derruba o job (é só observabilidade,
não é o objetivo real do script) - sempre best-effort, sempre com try/except.
"""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def registrar_execucao(job_nome: str, status: str, detalhe: str | None = None) -> None:
    """status deve ser 'sucesso' ou 'erro' (mesmo CHECK constraint da tabela)."""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        print(f"AVISO (heartbeat): SUPABASE_URL/SUPABASE_KEY ausentes - heartbeat de '{job_nome}' não registrado.", file=sys.stderr)
        return
    try:
        url = f"{supabase_url}/rest/v1/execucoes_jobs"
        corpo = {"job_nome": job_nome, "status": status}
        if detalhe:
            corpo["detalhe"] = detalhe[:2000]  # limite defensivo, coluna text sem constraint mas evita payload gigante
        body = json.dumps(corpo).encode("utf-8")
        req = Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Prefer": "return=minimal",
        })
        with urlopen(req, timeout=15) as resp:
            resp.read()
        print(f"Heartbeat registrado: {job_nome} = {status}")
    except (HTTPError, URLError, Exception) as e:
        print(f"AVISO (heartbeat): falha ao registrar execução de '{job_nome}' ({e}) - não afeta o resultado do job.", file=sys.stderr)
