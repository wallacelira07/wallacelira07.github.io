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
3. Atualiza esse valor na leitura mais recente da tabela relacional
   energia_solar_leituras (V2) e registra o dia em energia_solar_geracao_diaria
   (V2) — o site já lê essas tabelas automaticamente, sem precisar de deploy
   novo. REMOVIDO 10/08/2026: escrevia também em wallace_dados (V1); domínio
   Solar é V2-exclusivo desde outra sessão (app.js não lê mais wallace_dados
   pra isso), a escrita em V1 tinha virado trabalho morto.
4. NOVO 12/08/2026: também acrescenta (INSERT puro, nunca sobrescreve) uma
   linha em energia_solar_geracao_intraday a cada execução — constrói aos
   poucos um histórico real de "quanto a usina costuma ter gerado até tal
   horário", usado futuramente pelo card "Qualidade da Geração" pra comparar
   o dia de hoje (em andamento) contra uma curva real, não só uma estimativa
   linear.

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
  SUPABASE_KEY    - chave do Supabase com permissão de INSERT em
                    energia_solar_geracao_diaria e UPDATE em
                    energia_solar_leituras (ver nota de segurança abaixo)

NOTA DE SEGURANÇA sobre a SUPABASE_KEY:
  A chave "publishable"/anon usada pelo site (só leitura seguindo as regras
  de RLS) pode não ter permissão de escrita. Se a escrita falhar com erro de
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
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as crypto_padding

SAJ_BASE = "https://iop.saj-electric.com/dev-api/api/v2"
SAJ_LOGIN_URL = f"{SAJ_BASE}/sys/user/login"
SAJ_ENERGY_URL = f"{SAJ_BASE}/monitor/plantHome/getPlantEnergyStatistics"

# CORRIGIDO 09/08/2026: Brasil não usa horário de verão desde 2019, então UTC-3 fixo é
# seguro (sem depender de tzdata do SO, que nem sempre está disponível no runner do
# GitHub Actions). Precisa ser um fuso FIXO, nunca `datetime.now(timezone.utc)` puro,
# porque as leituras em SOLAR_LEITURAS/energia_solar_leituras são datadas pelo dia
# civil de Brasília (quando o usuário/Claude registra a leitura), não pelo dia em UTC.
# Se comparar "hoje" em UTC contra uma `data` em horário de Brasília, o script erra o
# dia sozinho todo santo dia entre ~21h e meia-noite (horário de Brasília) — bug real
# que essa mesma sessão quase deixou passar ao corrigir o bug anterior (ver histórico).
FUSO_BRASILIA = timezone(timedelta(hours=-3))


def hoje_brasilia_str() -> str:
    """Data civil de hoje em Brasília, formato YYYY-MM-DD — usar SEMPRE que comparar
    contra a coluna `data` de uma leitura solar, nunca `datetime.now(timezone.utc)`."""
    return datetime.now(FUSO_BRASILIA).strftime("%Y-%m-%d")

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


# Mesmo limite já usado no frontend (graficos-cenarios-lazy.js, aviso de leitura desatualizada) —
# reaproveitado aqui pra manter a mesma noção de "quão velha uma leitura pode ser e ainda ser
# confiável", em vez de inventar um número novo sem relação com o resto do sistema.
LIMITE_DIAS_LEITURA_ATRASADA = 3


def atualizar_v2_leitura_geracao_acumulada(supabase_url: str, supabase_key: str, geracao_total: float, hoje_str: str) -> bool:
    """CORRIGIDO 09/08/2026 (bug 1: contaminação de linha errada) e 10/08/2026 (bug 2: perda de
    leitura enviada tarde — achado real em produção, usuário mandou 03/103 às 23h25, depois da
    última execução agendada do dia (17h); a correção do bug 1 exigia `data == hoje` exato, então
    quando o robô rodou de novo (09h do dia seguinte), "hoje" já tinha virado outro dia e a leitura
    de ontem nunca mais bateu — ficou represada pra sempre, mesmo bug de fundo, ângulo diferente).

    Regra nova, resolve os dois ao mesmo tempo: em vez de "só a leitura de HOJE", atualiza a leitura
    MAIS RECENTE (maior `data`) SE ela ainda não tiver `geracao_acumulada` preenchido E não for mais
    velha que LIMITE_DIAS_LEITURA_ATRASADA. Por quê isso não reabre o bug 1: se a leitura mais
    recente JÁ TEM valor (de uma execução anterior), a função não mexe nela — só sobrescreveria uma
    leitura ainda vazia, nunca uma que o robô (ou uma leitura manual antiga) já preencheu; contaminar
    a linha errada exigiria a leitura de hoje ainda não existir E a mais recente já ter valor — nesse
    caso a função simplesmente não acha nada pra atualizar (devolve False), exatamente como antes.
    Por quê isso resolve o bug 2: uma leitura de ontem sem valor continua sendo "a mais recente sem
    valor" no dia seguinte — não precisa mais bater com `hoje_str` pra ser encontrada, só não pode
    ser mais velha que o limite (evita usar o acumulado de HOJE numa leitura de semanas atrás, que
    seria um erro maior, não uma correção)."""
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    # 1) Acha a leitura mais recente (por data), tenha ela valor preenchido ou não.
    get_url = f"{supabase_url}/rest/v1/energia_solar_leituras?select=id,data,geracao_acumulada&order=data.desc&limit=1"
    req = Request(get_url, headers=headers, method="GET")
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    if not linhas:
        return False
    leitura = linhas[0]
    if leitura.get("geracao_acumulada") is not None:
        return False  # já preenchida (por este robô ou manualmente) — nada a fazer, sem sobrescrever.

    data_leitura = datetime.strptime(leitura["data"][:10], "%Y-%m-%d").date()
    hoje_data = datetime.strptime(hoje_str, "%Y-%m-%d").date()
    if (hoje_data - data_leitura).days > LIMITE_DIAS_LEITURA_ATRASADA:
        return False  # leitura velha demais pra receber o acumulado de agora — não é a mesma janela de tempo.

    # 2) Atualiza só o campo geracao_acumulada dessa linha, mesmo valor gravado em V1.
    patch_url = f"{supabase_url}/rest/v1/energia_solar_leituras?id=eq.{leitura['id']}"
    body = json.dumps({"geracao_acumulada": round(geracao_total, 2)}).encode("utf-8")
    req_patch = Request(patch_url, data=body, headers=headers, method="PATCH")
    with urlopen(req_patch, timeout=20) as resp_patch:
        resp_patch.read()
    return True


def registrar_leitura_intraday(supabase_url: str, supabase_key: str, data_str: str, geracao_hoje: float) -> None:
    """NOVO 12/08/2026 (pedido do usuário: "quero ver se hoje está abaixo/normal/acima do
    esperado", ver docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md pro contexto maior de dado em
    tempo real do domínio Solar): INSERT puro (nunca upsert) em energia_solar_geracao_intraday a
    cada execução — ao contrário de atualizar_v2_geracao_diaria (que sobrescreve o valor do dia),
    esta tabela acumula TODAS as leituras intermediárias, construindo o histórico real de "quanto
    a usina costuma ter gerado até tal horário". Precisa de alguns dias de acumulação antes de
    qualquer comparação por curva real fazer sentido - até lá, o frontend usa uma estimativa
    linear simples. Falha aqui não derruba o script (mesmo padrão de best-effort dos outros
    registros de observabilidade)."""
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    url = f"{supabase_url}/rest/v1/energia_solar_geracao_intraday"
    body = json.dumps({"data": data_str, "geracao_acumulada_hoje_kwh": round(geracao_hoje, 3)}).encode("utf-8")
    req = Request(url, data=body, headers=headers, method="POST")
    with urlopen(req, timeout=20) as resp:
        resp.read()


def atualizar_supabase(supabase_url: str, supabase_key: str, geracao_total: float, geracao_hoje: float | None) -> None:
    """Grava a geração da usina só na V2 — energia_solar_geracao_diaria (histórico por dia) e
    energia_solar_leituras.geracao_acumulada (leitura mais recente ainda vazia, dentro de
    LIMITE_DIAS_LEITURA_ATRASADA).
    REMOVIDO 10/08/2026 (varredura "demais leitores/escritores ativos da V1" — fila original da
    migração V2 exclusiva): esta função também lia/gravava wallace_dados.SOLAR_LEITURAS/
    SOLAR_GERACAO_DIARIA (V1). Confirmado em app.js que o domínio Solar é V2-exclusivo desde outra
    sessão anterior (sem fallback silencioso pro wallace_dados, ver app.js ~841-887) — ou seja, essa
    escrita em V1 já não tinha mais nenhum leitor, era trabalho descartado a cada execução. V2 já
    tinha sua própria lógica independente pra achar "qual leitura atualizar", não dependia do
    resultado da leitura de V1 removida aqui."""
    hoje_str = hoje_brasilia_str()

    if geracao_hoje is not None:
        atualizar_v2_geracao_diaria(supabase_url, supabase_key, hoje_str, geracao_hoje)
        print(f"Supabase V2 (energia_solar_geracao_diaria) sincronizado: {hoje_str}={round(geracao_hoje,2)} kWh")
        try:
            registrar_leitura_intraday(supabase_url, supabase_key, hoje_str, geracao_hoje)
            print(f"Supabase V2 (energia_solar_geracao_intraday) leitura registrada: {round(geracao_hoje,2)} kWh")
        except Exception as e:
            print(f"AVISO: falha ao registrar leitura intraday ({e}) - não afeta a geração diária, que já foi gravada.", file=sys.stderr)
    else:
        print("(sem valor de hoje pra registrar em energia_solar_geracao_diaria)")

    gravou = atualizar_v2_leitura_geracao_acumulada(supabase_url, supabase_key, geracao_total, hoje_str)
    if gravou:
        print(f"Supabase V2 (energia_solar_leituras.geracao_acumulada) sincronizado: {geracao_total} kWh")
    else:
        print(f"AVISO: nenhuma leitura pendente dentro do prazo em energia_solar_leituras (a mais recente já tem geracao_acumulada, ou é mais velha que {LIMITE_DIAS_LEITURA_ATRASADA} dias) — nada gravado. A próxima execução agendada resolve assim que houver uma leitura nova/vazia dentro do prazo.", file=sys.stderr)


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
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("geracao_solar", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
