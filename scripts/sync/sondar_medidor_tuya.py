#!/usr/bin/env python3
"""
Sondagem do medidor de energia via app Smart Life (Tuya) — SÓ LEITURA
=========================================================================
NOVO 17/08/2026 (pedido do usuário: "de um jeito de fazer" — integrar um medidor
de energia monitorado hoje pelo app Smart Life). Mesmo padrão já usado em
scripts/sync/sondar_medidor_saj.py pro DDSU666: script de SONDAGEM primeiro,
nenhuma escrita no Supabase, só pra descobrir o formato REAL da resposta da API
antes de desenhar a tabela/robô de produção (não pular fases — já erramos nome
de campo chutado sem sondar antes em outras integrações deste sistema).

Usa a biblioteca `tinytuya` (open-source, MIT license) no modo CLOUD API —
NÃO é a mesma coisa do modo LAN/local da mesma lib (que exigiria rodar na rede
Wi-Fi de casa, opção descartada — ver docs/decisions/ deste tema). O modo Cloud
faz a chamada assinada (HMAC) pra API da Tuya por HTTPS, funciona de qualquer
lugar (inclusive GitHub Actions), mas depende da Trial Edition do serviço
"IoT Core" do projeto Cloud da Tuya — grátis, mas precisa ser renovada
periodicamente pelo próprio usuário no painel da Tuya (não automatizável, é
uma ação humana no console deles). Ver seção de custo/manutenção no decision
doc.

PRÉ-REQUISITO (o usuário precisa fazer isso ANTES de rodar este script — eu
não tenho como fazer por ele, é conta pessoal dele):
  1. Criar conta em https://iot.tuya.com (gratuita, separada da conta do app
     Smart Life).
  2. Cloud > Development > Create Cloud Project (qualquer nome, ex: "Wallace
     Painel"). Escolher o Data Center mais próximo do Brasil (testar "Western
     America" / região "us-e" primeiro — a doc da própria Tuya admite que a
     escolha "pode não ser a mais lógica geograficamente").
  3. Dentro do projeto, aba "Devices" > "Link Tuya App Account" > escanear o
     QR Code pela aba "Perfil/Me" do app Smart Life no celular — isso vincula
     os aparelhos já cadastrados no app ao projeto Cloud.
  4. Aba "Service API" > assinar (grátis) o serviço "IoT Core" (Trial Edition).
  5. Anotar 3 coisas do painel: Access ID (Client ID), Access Secret (Client
     Secret), e o Device ID do medidor específico (aparece na lista de
     dispositivos vinculados, dentro do projeto).
  6. Cadastrar como Secrets do repositório GitHub: TUYA_ACCESS_ID,
     TUYA_ACCESS_SECRET, TUYA_DEVICE_ID (e opcionalmente TUYA_API_REGION, ver
     abaixo — default "us-e" se não informado).

Depois disso, disparar manualmente o workflow "Sondar Medidor de Energia
(Tuya)" pela aba Actions do GitHub (workflow_dispatch, sem precisar estar no
computador) e colar a saída completa numa sessão do Claude Code — a partir do
JSON real devolvido, decido o mapeamento de campos e crio a tabela/robô de
produção (mesmo fluxo do DDSU666).
"""
import json
import os
import sys


def main() -> int:
    access_id = os.environ.get("TUYA_ACCESS_ID")
    access_secret = os.environ.get("TUYA_ACCESS_SECRET")
    device_id = os.environ.get("TUYA_DEVICE_ID")
    api_region = os.environ.get("TUYA_API_REGION", "us-e")

    faltando = [n for n, v in [("TUYA_ACCESS_ID", access_id), ("TUYA_ACCESS_SECRET", access_secret), ("TUYA_DEVICE_ID", device_id)] if not v]
    if faltando:
        print(f"ERRO: secrets ausentes: {', '.join(faltando)}. Ver o cabeçalho deste script pro passo a passo de como obter cada um (conta Tuya IoT Platform, precisa ser feito pelo usuário).", file=sys.stderr)
        return 1

    try:
        import tinytuya
    except ImportError:
        print("ERRO: biblioteca 'tinytuya' não instalada (deveria ter sido instalada pelo workflow via pip).", file=sys.stderr)
        return 1

    print(f"Conectando na Tuya Cloud API (região {api_region})...")
    cloud = tinytuya.Cloud(
        apiRegion=api_region,
        apiKey=access_id,
        apiSecret=access_secret,
        apiDeviceID=device_id,
    )

    print("\n===== getstatus(device_id) =====")
    try:
        status = cloud.getstatus(device_id)
        print(json.dumps(status, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"AVISO: getstatus falhou: {e}", file=sys.stderr)

    print("\n===== getproperties(device_id) =====")
    try:
        props = cloud.getproperties(device_id)
        print(json.dumps(props, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"AVISO: getproperties falhou: {e}", file=sys.stderr)

    print("\n===== getdevices() (lista completa vinculada ao projeto, conferência) =====")
    try:
        devices = cloud.getdevices()
        print(json.dumps(devices, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"AVISO: getdevices falhou: {e}", file=sys.stderr)

    print("\nSondagem concluída — nenhuma escrita foi feita no Supabase. Cole esta saída completa numa sessão do Claude Code pra decidir o mapeamento de campos e avançar pro robô de produção.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
