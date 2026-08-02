#!/usr/bin/env python3
"""
Automação SAJ (Elekeeper) -> Supabase (Sistema Wallace Lira)
==============================================================

O que faz:
1. Loga na API da SAJ (iop.saj-electric.com) com usuário/senha (senha é
   criptografada com AES-128-ECB antes do envio, igual o próprio site faz —
   nunca manda a senha em texto puro pela rede).
2. Busca a geração acumulada real da usina (endpoint getPlantEnergyStatistics,
   campo energyDataList -> dataType "PV_ENERGY" -> energy1Total).
3. Atualiza esse valor na última leitura registrada em SOLAR_LEITURAS no
   Supabase (o site já lê esse campo automaticamente, sem precisar de
   deploy novo — confirmado no Sistema Wallace Lira, V221+).

O que NÃO faz (ainda):
- Não sabe os códigos 03/103 do medidor bidirecional da Energisa — isso
  continua sendo informado manualmente (foto/fatura) até existir alguma
  forma de automatizar a leitura da Energisa também.
- Não cria uma leitura nova por dia automaticamente — atualiza a geração
  da leitura mais recente já existente. Quando o usuário mandar um 03/103
  novo (nova leitura), o Claude cria a entrada nova; esse script só
  mantém a geração em dia na entrada que já existe.

Como rodar:
- Localmente: definir as variáveis de ambiente abaixo e rodar
  `python3 atualizar_geracao_saj.py`
- Automático: ver o arquivo .github/workflows/atualizar_geracao_saj.yml
  (roda 2x por dia via GitHub Actions - 09h e 17h horário de Brasília,
  atualizado 02/08/2026 a pedido do usuário; era 1x/dia antes - de graça,
  sem servidor nenhum).

Variáveis de ambiente necessárias (nunca colocar direto no código):
  SAJ_USERNAME    - email de login do Elekeeper/SAJ
  SAJ_PASSWORD    - senha do Elekeeper/SAJ (texto puro; o script hasheia)
  SAJ_PLANT_UID   - 2268F1C3E8AF45AFB334B068063E2E97 (já descoberto)
  SUPABASE_URL    - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY    - chave do Supabase com permissão de UPDATE na tabela
                    wallace_dados (ver nota de segurança abaixo)

NOTA DE SEGURANÇA sobre a SUPABASE_KEY:
  A chave "publishable"/anon usada pelo site (só leitura seguindo as regras
  de RLS) pode não ter permissão de escrita. Se o UPDATE falhar com erro de
  permissão, será necessário usar uma chave com mais privilégio (ex: a
  "service_role" key, disponível no painel do Supabase em
  Project Settings > API). Essa chave NUNCA deve aparecer no site (só aqui,
  como GitHub Secret, que fica encriptado e nunca é exibido em logs).
"""
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as crypto_padding

SAJ_BASE = "https://iop.saj-electric.com/dev-api/api/v2"
SAJ_LOGIN_URL = f"{SAJ_BASE}/sys/user/login"
SAJ_ENERGY_URL = f"{SAJ_BASE}/monitor/plantHome/getPlantEnergyStatistics"

# CORRIGIDO (chave real confirmada via breakpoint no navegador, 01/08/2026 - testada byte a byte
# contra um login de teste real, bateu exato): a chave NAO e derivada do clientSecret OAuth (isso foi
# uma hipotese errada testada e descartada). E uma constante fixa embutida no bundle JS do site,
# achada pausando a execucao dentro da funcao wE() e inspecionando o valor de S_ ao vivo.
SAJ_CLIENT_SECRET_HEX = "ec1840a7c53cf0709eb784be480379b6"


def _criptografar_senha_aes(senha: str) -> str:
    """Replica exatamente a funcao wE() do JS do site: AES-128-ECB com padding PKCS7, saida em hex."""
    chave = bytes.fromhex(SAJ_CLIENT_SECRET_HEX)
    padder = crypto_padding.PKCS7(128).padder()
    dados_com_padding = padder.update(senha.encode("utf-8")) + padder.finalize()
    cipher = Cipher(algorithms.AES(chave), modes.ECB())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(dados_com_padding) + encryptor.finalize()
    return ciphertext.hex()


def _post_json(url: str, payload: dict, headers: dict | None = None) -> dict:
    """POST simples usando só a biblioteca padrão (sem precisar instalar requests)."""
    data = json.dumps(payload).encode("utf-8")
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = Request(url, data=data, headers=req_headers, method="POST")
    try:
        with urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} em {url}: {corpo}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao acessar {url}: {e}") from e


def saj_login(username: str, password: str) -> str:
    """Loga na SAJ e retorna o header de Authorization completo (ex: 'Bearer eyJ...')."""
    senha_criptografada = _criptografar_senha_aes(password)
    agora = datetime.now(timezone.utc)
    payload = {
        "lang": "pt",
        "password": senha_criptografada,
        "appProjectName": "elekeeper",
        "clientCode": "organization",
        "clientDate": agora.strftime("%Y-%m-%d"),
        "clientId": "esolar-monitor-admin",
        "loginType": 1,
        "rememberMe": False,
        "themeColor": "dark",
        "timeStamp": int(time.time() * 1000),
        "username": username,
    }
    resp = _post_json(SAJ_LOGIN_URL, payload)
    if not resp.get("connOk") or resp.get("errCode") != 0:
        raise RuntimeError(f"Login SAJ falhou: {resp.get('errMsg') or resp}")
    dados = resp["data"]
    token_head = dados.get("tokenHead", "Bearer ")
    token = dados["token"]
    return f"{token_head}{token}".strip() if not token_head.endswith(" ") else f"{token_head}{token}"


def buscar_geracao_acumulada(auth_header: str, plant_uid: str) -> dict:
    """Retorna {'energy_hoje': float, 'energy_total': float} da usina."""
    agora = datetime.now(timezone.utc)
    payload = {
        "appProjectName": "elekeeper",
        "clientCode": "organization",
        "clientDate": agora.strftime("%Y-%m-%d"),
        "clientId": "esolar-monitor-admin",
        "lang": "pt",
        "orgCode": "saj",
        "plantUid": plant_uid,
        "themeColor": "dark",
        "timeStamp": int(time.time() * 1000),
    }
    resp = _post_json(SAJ_ENERGY_URL, payload, headers={"Authorization": auth_header})
    if not resp.get("connOk") or resp.get("errCode") != 0:
        raise RuntimeError(f"Busca de energia falhou: {resp.get('errMsg') or resp}")
    lista = resp["data"]["energyDataList"]
    pv = next((item for item in lista if item.get("dataType") == "PV_ENERGY"), None)
    if not pv:
        raise RuntimeError(f"Campo PV_ENERGY não encontrado na resposta: {lista}")
    return {"energy_hoje": pv.get("energy1Today"), "energy_total": pv.get("energy1Total")}


def atualizar_supabase(supabase_url: str, supabase_key: str, geracao_total: float) -> None:
    """Lê SOLAR_LEITURAS atual, atualiza geracaoAcumulada da ÚLTIMA leitura, grava de volta."""
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    # 1) Lê o estado atual
    get_url = f"{supabase_url}/rest/v1/wallace_dados?select=dados&id=eq.1"
    req = Request(get_url, headers=headers, method="GET")
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    if not linhas:
        raise RuntimeError("Linha id=1 não encontrada em wallace_dados.")
    leituras = linhas[0]["dados"].get("SOLAR_LEITURAS", [])
    if not leituras:
        raise RuntimeError("SOLAR_LEITURAS está vazio — nada para atualizar.")

    # 2) Atualiza a geração da ÚLTIMA leitura
    leituras[-1]["geracaoAcumulada"] = round(geracao_total, 2)
    leituras[-1].setdefault("fonte", "real")

    # 3) Grava de volta (merge via jsonb_build_object no PATCH)
    patch_url = f"{supabase_url}/rest/v1/wallace_dados?id=eq.1"
    body = json.dumps({"dados": {"SOLAR_LEITURAS": leituras}}).encode("utf-8")
    # PostgREST não faz merge profundo de JSON via PATCH simples do jeito que
    # o Supabase SQL faz com `||` — por isso usamos a função RPC abaixo em vez
    # de um PATCH cru. Ver função SQL sugerida no README do script.
    # CORRIGIDO 02/08/2026: existia uma versao antiga e duplicada desta funcao
    # RPC no banco (mesmo nome, assinatura diferente) causando erro HTTP 300
    # "Multiple Choices" (Postgres nao sabia qual versao chamar) - removida a
    # duplicata, so a versao completa (com geracao_hoje/receita_hoje/receita_total
    # opcionais) ficou.
    rpc_url = f"{supabase_url}/rest/v1/rpc/atualizar_geracao_solar"
    rpc_body = json.dumps({"nova_geracao": round(geracao_total, 2)}).encode("utf-8")
    req2 = Request(rpc_url, data=rpc_body, headers=headers, method="POST")
    with urlopen(req2, timeout=20) as resp2:
        resultado = resp2.read().decode("utf-8")
    print(f"Supabase atualizado via RPC: {resultado}")


def main() -> int:
    username = os.environ.get("SAJ_USERNAME")
    password = os.environ.get("SAJ_PASSWORD")
    plant_uid = os.environ.get("SAJ_PLANT_UID", "2268F1C3E8AF45AFB334B068063E2E97")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")

    faltando = [n for n, v in [
        ("SAJ_USERNAME", username), ("SAJ_PASSWORD", password),
        ("SUPABASE_URL", supabase_url), ("SUPABASE_KEY", supabase_key),
    ] if not v]
    if faltando:
        print(f"ERRO: variáveis de ambiente faltando: {', '.join(faltando)}", file=sys.stderr)
        return 1

    try:
        print("Fazendo login na SAJ...")
        auth = saj_login(username, password)
        print("Login OK. Buscando geração acumulada...")
        energia = buscar_geracao_acumulada(auth, plant_uid)
        print(f"Geração hoje: {energia['energy_hoje']} kWh | Geração total acumulada: {energia['energy_total']} kWh")
        print("Atualizando Supabase...")
        atualizar_supabase(supabase_url, supabase_key, energia["energy_total"])
        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
