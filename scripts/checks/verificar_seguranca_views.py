#!/usr/bin/env python3
"""
Verificação de regressão de segurança (SECURITY DEFINER) -> Supabase (Sistema Wallace Lira)
=============================================================================================
NOVO 12/08/2026, resposta direta a um achado real: as views vw_compromisso_cartao_por_pessoa e
vw_transacoes_cartao_variavel_por_pessoa foram endurecidas para SECURITY INVOKER em 11/08, e duas
migrations de correção de dado no mesmo dia as recriaram sem reaplicar a opção - ninguém percebeu
até uma auditoria de prontidão pedir verificação ao vivo em vez de confiar no que os documentos já
afirmavam. Ver docs/decisions/REGRESSAO_SECURITY_DEFINER_VIEWS_CARTAO.md para o achado completo.

Este script fecha a causa raiz (falta de trava automática): chama a RPC
verificar_hardening_views() (SECURITY DEFINER, restrita a service_role) a cada execução diária do
orquestrador e falha ruidosamente se qualquer view da lista endurecida tiver perdido
security_invoker=true - em vez de depender de alguém lembrar de checar manualmente de novo.

Variáveis de ambiente necessárias:
  SUPABASE_URL  - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY  - chave service_role (mesma já usada pelos outros scripts agendados)
"""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def verificar() -> tuple[bool, str]:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        return False, "SUPABASE_URL/SUPABASE_KEY ausentes."

    url = f"{supabase_url}/rest/v1/rpc/verificar_hardening_views"
    req = Request(url, data=b"{}", method="POST", headers={
        "Content-Type": "application/json",
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    })
    try:
        with urlopen(req, timeout=20) as resp:
            linhas = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        return False, f"HTTP {e.code} ao chamar verificar_hardening_views: {corpo}"
    except URLError as e:
        return False, f"Falha de rede ao chamar verificar_hardening_views: {e}"

    if not isinstance(linhas, list) or not linhas:
        return False, f"Resposta inesperada (vazia ou não é lista): {linhas!r}"

    regressoes = [l for l in linhas if not l.get("security_invoker_ok")]
    if regressoes:
        detalhe = "; ".join(
            f"{l['view_nome']} (reloptions={l.get('reloptions')})" for l in regressoes
        )
        return False, f"REGRESSÃO DE SEGURANÇA: {len(regressoes)} view(s) voltaram a SECURITY DEFINER: {detalhe}"

    nomes = ", ".join(l["view_nome"] for l in linhas)
    return True, f"{len(linhas)} view(s) endurecida(s) confirmadas OK: {nomes}"


def main() -> int:
    ok, mensagem = verificar()
    if ok:
        print(f"OK: {mensagem}")
        return 0
    print(f"FALHA: {mensagem}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sync"))
    from _heartbeat import registrar_execucao  # type: ignore

    codigo = main()
    registrar_execucao("seguranca_views", "sucesso" if codigo == 0 else "erro")
    sys.exit(codigo)
