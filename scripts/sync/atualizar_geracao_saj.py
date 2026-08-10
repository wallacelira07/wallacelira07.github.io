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


def atualizar_v2_geracao_diaria(supabase_url: str, supabase_key: str, data_str: str, geracao_hoje: float) -> None:
    """NOVO 08/08/2026 (Onda 4/5, domínio Solar - sincronizar persistência V1->V2, mesma estratégia
    já usada nos outros domínios): grava o MESMO valor que acabou de ir pra
    wallace_dados.dados.SOLAR_GERACAO_DIARIA também na tabela relacional
    energia_solar_geracao_diaria (colunas: data, geracao_kwh) - upsert por `data` (UNIQUE), mesma
    semântica de "sobrescreve o mesmo dia" já usada no V1. Não é um dado novo, não é recalculado,
    não altera frontend/indicadores/cálculos - só passa a existir também na V2. Falha aqui é
    tratada como aviso, não derruba o script (a escrita em V1, já lida pelo site, é a crítica)."""
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    url = f"{supabase_url}/rest/v1/energia_solar_geracao_diaria?on_conflict=data"
    body = json.dumps({"data": data_str, "geracao_kwh": round(geracao_hoje, 2)}).encode("utf-8")
    req = Request(url, data=body, headers=headers, method="POST")
    with urlopen(req, timeout=20) as resp:
        resp.read()


def atualizar_v2_leitura_geracao_acumulada(supabase_url: str, supabase_key: str, geracao_total: float, hoje_str: str) -> bool:
    """CORRIGIDO 09/08/2026 (bug real: escrevia sempre na leitura mais recente por `data`, mesmo
    quando essa leitura era de ONTEM — se o robô roda antes da leitura manual de hoje ser lançada,
    ele contaminava a linha errada com o acumulado de hoje, e a linha de hoje nascia depois sem
    esse valor). Agora só atualiza a linha cuja `data` é EXATAMENTE hoje (hoje_str, UTC — mesmo
    fuso usado em SOLAR_GERACAO_DIARIA). Se ainda não existe leitura de hoje, não mexe em nenhuma
    linha antiga — devolve False pra quem chamou logar o aviso certo; a próxima execução agendada
    (roda 2x/dia) resolve sozinha assim que a leitura existir, sem depender de ordem manual-vs-robô.
    Falha de rede/HTTP aqui continua tratada como aviso pelo chamador (a escrita em V1 já é a crítica)."""
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    # 1) Acha a leitura de HOJE especificamente — nunca "a mais recente que existir".
    get_url = f"{supabase_url}/rest/v1/energia_solar_leituras?select=id,data&data=eq.{hoje_str}&limit=1"
    req = Request(get_url, headers=headers, method="GET")
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    if not linhas:
        return False
    leitura_id = linhas[0]["id"]

    # 2) Atualiza só o campo geracao_acumulada dessa linha, mesmo valor gravado em V1.
    patch_url = f"{supabase_url}/rest/v1/energia_solar_leituras?id=eq.{leitura_id}"
    body = json.dumps({"geracao_acumulada": round(geracao_total, 2)}).encode("utf-8")
    req_patch = Request(patch_url, data=body, headers=headers, method="PATCH")
    with urlopen(req_patch, timeout=20) as resp_patch:
        resp_patch.read()
    return True


def atualizar_supabase(supabase_url: str, supabase_key: str, geracao_total: float, geracao_hoje: float | None) -> None:
    """Lê SOLAR_LEITURAS atual, atualiza geracaoAcumulada da leitura DE HOJE, grava de volta.
    CORRIGIDO 09/08/2026 (bug real, causou perda de dado em produção): antes escrevia sempre em
    leituras[-1] (a última por posição), sem checar a data. Se o robô roda ANTES da leitura manual
    de hoje ser lançada, leituras[-1] ainda é a de ontem — o robô gravava o acumulado de HOJE numa
    linha de ONTEM, e quando a leitura de hoje nascia depois, ficava sem esse número (dependia da
    ordem manual-vs-robô, que não é controlável). Agora só grava se já existir uma leitura com
    data == hoje; senão pula e loga aviso — a próxima execução agendada (2x/dia) resolve sozinha
    assim que a leitura existir, sem nunca contaminar a linha errada.
    NOVO 05/08/2026 (pedido do usuário: "não vai conseguir me dar dados de vários dias?"): também
    acrescenta/atualiza um registro em SOLAR_GERACAO_DIARIA (histórico diário de verdade, um valor
    por execução do robô - antes esse dado (energy1Today, já vinha da API) era buscado e descartado,
    só o total acumulado era salvo. Isso permite um gráfico de geração por dia real, não só a média
    entre leituras manuais do medidor."""
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    hoje_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 1) Lê o estado atual
    get_url = f"{supabase_url}/rest/v1/wallace_dados?select=dados&id=eq.1"
    req = Request(get_url, headers=headers, method="GET")
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    if not linhas:
        raise RuntimeError("Linha id=1 não encontrada em wallace_dados.")
    dados_atuais = linhas[0]["dados"]
    leituras = dados_atuais.get("SOLAR_LEITURAS", [])
    if not leituras:
        raise RuntimeError("SOLAR_LEITURAS está vazio — nada para atualizar.")

    # 2) Atualiza a geração só se a leitura mais recente for de HOJE — nunca por posição.
    leitura_hoje = leituras[-1] if leituras[-1].get("data") == hoje_str else None
    if leitura_hoje is not None:
        leitura_hoje["geracaoAcumulada"] = round(geracao_total, 2)
        leitura_hoje.setdefault("fonte", "real")

    # 3) Registra a geração de HOJE no histórico diário, se a API devolveu esse valor.
    # Chave = data de hoje (UTC) - se o robô já rodou hoje (roda 2x/dia), sobrescreve o mesmo dia em
    # vez de duplicar, sempre com o valor mais recente da API (mais confiável quanto mais tarde no dia).
    # Isso não depende de existir leitura de hoje — é histórico próprio, sempre seguro de gravar.
    historico_diario = dados_atuais.get("SOLAR_GERACAO_DIARIA", [])
    if geracao_hoje is not None:
        idx_existente = next((i for i, r in enumerate(historico_diario) if r.get("data") == hoje_str), None)
        registro = {"data": hoje_str, "kwh": round(geracao_hoje, 2), "capturadoEm": datetime.now(timezone.utc).isoformat()}
        if idx_existente is not None:
            historico_diario[idx_existente] = registro
        else:
            historico_diario.append(registro)

    # 4) Grava tudo de volta numa única atualização (merge simples via || no Postgres,
    # equivalente ao que sincronizar_erp_supabase.py já faz).
    patch_url = f"{supabase_url}/rest/v1/wallace_dados?id=eq.1"
    novo_dados = dict(dados_atuais)
    novo_dados["SOLAR_LEITURAS"] = leituras
    novo_dados["SOLAR_GERACAO_DIARIA"] = historico_diario
    body = json.dumps({"dados": novo_dados}).encode("utf-8")
    req_patch = Request(patch_url, data=body, headers=headers, method="PATCH")
    with urlopen(req_patch, timeout=20) as resp_patch:
        resp_patch.read()
    if leitura_hoje is not None:
        print(f"Supabase atualizado: geracaoAcumulada={geracao_total} kWh na leitura de hoje ({hoje_str})")
    else:
        print(f"AVISO: ainda não existe leitura com data={hoje_str} em SOLAR_LEITURAS — geracaoAcumulada NÃO foi gravada em nenhuma linha (evitando contaminar a leitura de outro dia). A próxima execução agendada resolve assim que a leitura existir.", file=sys.stderr)
    print(("SOLAR_GERACAO_DIARIA[" + hoje_str + f"]={geracao_hoje} kWh") if geracao_hoje is not None else "(sem valor de hoje pra registrar em SOLAR_GERACAO_DIARIA)")

    # 5) NOVO 08/08/2026: mesmo valor, também na tabela relacional V2 (energia_solar_geracao_diaria)
    # — sincroniza persistência, mesma estratégia já usada nos outros domínios (Onda 4/5). Falha aqui
    # não derruba o script: a escrita em V1 acima (o que o site realmente lê) já está garantida.
    if geracao_hoje is not None:
        try:
            atualizar_v2_geracao_diaria(supabase_url, supabase_key, hoje_str, geracao_hoje)
            print(f"Supabase V2 (energia_solar_geracao_diaria) sincronizado: {hoje_str}={round(geracao_hoje,2)} kWh")
        except Exception as e:
            print(f"AVISO: falha ao sincronizar energia_solar_geracao_diaria (V2) — V1 já gravado normalmente, não é um erro fatal: {e}", file=sys.stderr)

    # 6) NOVO 08/08/2026, CORRIGIDO 09/08/2026 (mesmo bug de data do item 2, agora também na V2):
    # energia_solar_leituras.geracao_acumulada só é escrito se já existir a linha de hoje.
    try:
        gravou = atualizar_v2_leitura_geracao_acumulada(supabase_url, supabase_key, geracao_total, hoje_str)
        if gravou:
            print(f"Supabase V2 (energia_solar_leituras.geracao_acumulada) sincronizado: {geracao_total} kWh")
        else:
            print(f"AVISO: ainda não existe leitura V2 com data={hoje_str} em energia_solar_leituras — geracao_acumulada NÃO foi gravado (evitando contaminar a leitura de outro dia).", file=sys.stderr)
    except Exception as e:
        print(f"AVISO: falha ao sincronizar energia_solar_leituras.geracao_acumulada (V2) — V1 já gravado normalmente, não é um erro fatal: {e}", file=sys.stderr)


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
        atualizar_supabase(supabase_url, supabase_key, energia["energy_total"], energia.get("energy_hoje"))
        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
