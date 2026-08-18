#!/usr/bin/env python3
"""
Automação do medidor de energia EKAZA (Tuya/Smart Life) -> Supabase (Sistema Wallace Lira)
=============================================================================================
NOVO 17/08/2026. Fase 2 da integração descrita em
docs/decisions/INTEGRACAO_MEDIDOR_SMART_LIFE_TUYA.md — sondagem (Fase 1, sondar_medidor_tuya.py)
confirmou o schema real dos DPs (data points) desse aparelho específico ("EKAZA Medidor de Transf
de corrente 80A", CT 80A) depois de mudar o modo de controle do produto, no painel Tuya IoT
Platform, de "Standard Instruction" pra "DP Instruction" (sem isso, getstatus()/getproperties()
devolviam vazio mesmo com o aparelho online — produto OEM sem mapeamento padrão registrado na
Tuya).

Campos lidos de cloud.getstatus(device_id) e como converter (todos Integer brutos, escala fixa
por DP, confirmada na sondagem real de 17/08/2026 — ver Standard Status Set do painel Tuya):
  cur_voltage1       -> tensão (V)      = bruto / 10
  cur_current1       -> corrente (A)    = bruto / 1000
  cur_power1         -> potência (W)    = bruto / 10
  today_acc_energy1  -> energia hoje (kWh)  = bruto / 1000
  total_energy1      -> energia total acumulada (kWh) = bruto / 1000
  device_state1      -> estado (enum: close/monitor/working/warning), usado como está

Grava 1 linha por execução em medidor_tuya_leituras via RPC atualizar_medidor_tuya
(service_role-only, mesmo padrão de segurança já usado em atualizar_cotacoes_opcoes/
atualizar_beneficio_credito) — nunca overwrite, é histórico (mesmo espírito de
energia_solar_geracao_intraday no domínio Solar).

GENERALIZADO 18/08/2026 pra múltiplas casas (mesmo modelo de medidor, ver
docs/decisions/COMO_CONFIGURAR_NOVO_MEDIDOR_TUYA.md) — script continua idêntico por casa, só muda
QUAL conjunto de credenciais/qual valor de CASA o workflow do GitHub passa (ver
.github/workflows/atualizar_medidor_tuya.yml pro apartamento do Wallace e
atualizar_medidor_tuya_wellida.yml pra casa da Wellida). Sem CASA definido, assume "wallace"
(mesmo comportamento de antes desta mudança — 100% retrocompatível).

Variáveis de ambiente necessárias:
  TUYA_ACCESS_ID, TUYA_ACCESS_SECRET, TUYA_DEVICE_ID, TUYA_API_REGION (default "us-e")
  SUPABASE_URL, SUPABASE_KEY (service_role — a RPC rejeita anon/authenticated)
  CASA (default "wallace" — identifica de qual casa é esta leitura, ver coluna `casa` em
  medidor_tuya_leituras/medidor_tuya_consumo_diario)
"""
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Escala de cada DP bruto -> unidade real, confirmada contra a API real em 17/08/2026 (ver
# cabeçalho acima). Não é um valor "type":"Integer" comum — cada DP tem seu próprio "scale" no
# schema Tuya (divisor = 10^scale), por isso hardcoded aqui em vez de calculado genericamente.
_DP_TENSAO = "cur_voltage1"
_DP_CORRENTE = "cur_current1"
_DP_POTENCIA = "cur_power1"
_DP_ENERGIA_HOJE = "today_acc_energy1"
_DP_ENERGIA_TOTAL = "total_energy1"
_DP_ESTADO = "device_state1"


def _extrair_leitura(dps: dict) -> dict:
    def _num(codigo: str, divisor: float):
        bruto = dps.get(codigo)
        return round(bruto / divisor, 3) if bruto is not None else None

    return {
        "tensao_v": _num(_DP_TENSAO, 10),
        "corrente_a": _num(_DP_CORRENTE, 1000),
        "potencia_w": _num(_DP_POTENCIA, 10),
        "energia_hoje_kwh": _num(_DP_ENERGIA_HOJE, 1000),
        "energia_total_kwh": _num(_DP_ENERGIA_TOTAL, 1000),
        "estado": dps.get(_DP_ESTADO),
    }


def buscar_leitura(access_id: str, access_secret: str, device_id: str, api_region: str) -> dict:
    import tinytuya

    cloud = tinytuya.Cloud(
        apiRegion=api_region,
        apiKey=access_id,
        apiSecret=access_secret,
        apiDeviceID=device_id,
    )
    status = cloud.getstatus(device_id)
    if not isinstance(status, dict) or "result" not in status:
        raise RuntimeError(f"Resposta inesperada da Tuya Cloud (sem 'result'): {status}")
    if status.get("Error"):
        raise RuntimeError(f"Erro da Tuya Cloud: {status.get('Payload') or status}")

    dps = {item["code"]: item["value"] for item in status["result"] if "code" in item}
    leitura = _extrair_leitura(dps)
    if leitura["potencia_w"] is None:
        raise RuntimeError(f"DP '{_DP_POTENCIA}' ausente na resposta — schema mudou? DPs recebidos: {sorted(dps.keys())}")
    return leitura


def atualizar_supabase(supabase_url: str, supabase_key: str, leitura: dict) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    rpc_url = f"{supabase_url}/rest/v1/rpc/atualizar_medidor_tuya"
    body = json.dumps({"leitura": leitura}).encode("utf-8")
    req = Request(rpc_url, data=body, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=20) as resp:
            resultado = resp.read().decode("utf-8")
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} ao atualizar Supabase: {corpo}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar Supabase: {e}") from e
    print(f"Supabase atualizado: {resultado}")


def main() -> int:
    access_id = os.environ.get("TUYA_ACCESS_ID")
    access_secret = os.environ.get("TUYA_ACCESS_SECRET")
    device_id = os.environ.get("TUYA_DEVICE_ID")
    api_region = os.environ.get("TUYA_API_REGION") or "us-e"
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    casa = os.environ.get("CASA") or "wallace"

    faltando = [n for n, v in [
        ("TUYA_ACCESS_ID", access_id), ("TUYA_ACCESS_SECRET", access_secret), ("TUYA_DEVICE_ID", device_id),
        ("SUPABASE_URL", supabase_url), ("SUPABASE_KEY", supabase_key),
    ] if not v]
    if faltando:
        print(f"ERRO: variáveis de ambiente faltando: {', '.join(faltando)}", file=sys.stderr)
        return 1

    try:
        print(f"[{casa}] Conectando na Tuya Cloud API (região {api_region})...")
        leitura = buscar_leitura(access_id, access_secret, device_id, api_region)
        leitura["casa"] = casa
        print(f"[{casa}] Leitura: {leitura['tensao_v']}V, {leitura['corrente_a']}A, {leitura['potencia_w']}W, "
              f"hoje={leitura['energia_hoje_kwh']}kWh, total={leitura['energia_total_kwh']}kWh, estado={leitura['estado']}")
        print(f"[{casa}] Atualizando Supabase...")
        atualizar_supabase(supabase_url, supabase_key, leitura)
        print(f"[{casa}] Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"[{casa}] ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    from _heartbeat import registrar_execucao
    _codigo = main()
    # CORRIGIDO 18/08/2026 (mesmo achado do RPC atualizar_medidor_tuya): job_nome do Wallace tem que
    # continuar 'medidor_tuya' (sem sufixo) - é a chave que SAUDE_JOBS_LIMIARES.medidor_tuya já
    # monitora em produção. Só casas novas ganham sufixo (ex: 'medidor_tuya_wellida').
    _casa = os.environ.get("CASA") or "wallace"
    _job_nome = "medidor_tuya" if _casa == "wallace" else "medidor_tuya_" + _casa
    registrar_execucao(_job_nome, "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
