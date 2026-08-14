#!/usr/bin/env python3
"""
Sondagem do medidor DDSU666 na API da SAJ (Fase 1 de docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md)
====================================================================================================

O que é isto: NÃO é o robô de produção (`atualizar_geracao_saj.py`), que continua rodando
exatamente como está. Este é um script de SONDAGEM — só leitura, nenhuma escrita no Supabase —
criado para rodar logo depois da instalação física do medidor DDSU666 (prevista 15/08/2026,
Casa da Mãe), com um único objetivo: descobrir se a API da SAJ (mesmo endpoint que o robô já usa,
`getPlantEnergyStatistics`) passou a expor campos novos (geração instantânea, consumo, importação,
exportação da rede) agora que o medidor bidirecional está fisicamente conectado ao inversor.

Por que um script separado, e não estender o robô direto: o plano documentado em
EVOLUCAO_SOLAR_MEDIDOR_SAJ.md é explícito — "Fase 1 (...) Sem alterar o robô em produção ainda —
só uma sondagem/teste isolado." O robô hoje só lê o dataType "PV_ENERGY" e ignora qualquer outro
que já possa vir na resposta; até confirmar quais dataTypes novos aparecem (e com quais nomes de
campo exatos), não há como escrever a extensão certa sem chutar nomes de campo.

Como rodar (mesma forma que o robô de produção):
- Localmente: definir SAJ_USERNAME/SAJ_PASSWORD/SAJ_PLANT_UID e rodar
  `python3 scripts/sync/sondar_medidor_saj.py`
- Via GitHub Actions (sem precisar de Python local): workflow
  `.github/workflows/sondar_medidor_saj.yml`, disparo manual (workflow_dispatch) pela aba Actions
  do GitHub, ou `gh workflow run sondar_medidor_saj.yml`.

O que este script faz:
1. Loga na SAJ (reaproveita a função saj_login já validada em produção).
2. Chama getPlantEnergyStatistics e imprime O JSON INTEIRO de energyDataList — não só o campo
   PV_ENERGY que o robô já conhece. Se o medidor estiver transmitindo, é aqui que um dataType novo
   (ex: algo como "GRID_ENERGY"/"CONSUMPTION_ENERGY", nome exato desconhecido) deve aparecer.
3. Separa visualmente o que já é conhecido (PV_ENERGY) do que é NOVO (qualquer outro dataType) —
   destaque justamente no que muda antes/depois da instalação.
4. Não escreve nada no Supabase. Não altera nenhuma leitura, nenhum campo. É seguro rodar quantas
   vezes quiser, antes ou depois da instalação, sem risco nenhum de corromper dado real.

Depois de rodar isto com o medidor já instalado:
- Se aparecer dataType novo: colar a saída completa numa sessão do Claude Code — o próximo passo
  é a Fase 2 do plano (estender o robô pra também gravar em energia_solar_medicoes_tempo_real,
  tabela que já existe, só schema, vazia — ver seção 4 do documento de decisão).
- Se NÃO aparecer nada novo (só PV_ENERGY de novo): a API da SAJ pode não expor esses campos por
  este endpoint — próximo passo vira inspecionar o portal/app da SAJ manualmente (ver seção 7 do
  documento de decisão, risco já identificado: "não há garantia de que a mesma API exponha os
  campos novos").
"""
import json
import os
import sys

# Reaproveita login/POST já validados em produção — nenhuma lógica de autenticação duplicada.
from atualizar_geracao_saj import saj_login, _post_json, SAJ_ENERGY_URL
from datetime import datetime, timezone
import time


def sondar_energy_data_list(auth_header: str, plant_uid: str) -> dict:
    """Chama o MESMO endpoint que o robô de produção usa, mas devolve a resposta bruta inteira
    (não filtra por dataType) — é essa varredura completa que este script existe pra fazer."""
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
    return resp["data"]


def main() -> int:
    username = os.environ.get("SAJ_USERNAME")
    password = os.environ.get("SAJ_PASSWORD")
    plant_uid = os.environ.get("SAJ_PLANT_UID", "2268F1C3E8AF45AFB334B068063E2E97")

    faltando = [n for n, v in [("SAJ_USERNAME", username), ("SAJ_PASSWORD", password)] if not v]
    if faltando:
        print(f"ERRO: variáveis de ambiente faltando: {', '.join(faltando)}", file=sys.stderr)
        return 1

    try:
        print("=" * 70)
        print("SONDAGEM DDSU666 — Fase 1 (só leitura, nenhuma escrita no Supabase)")
        print("=" * 70)
        print("Fazendo login na SAJ...")
        auth = saj_login(username, password)
        print("Login OK. Buscando dados completos da usina...\n")
        dados = sondar_energy_data_list(auth, plant_uid)

        lista = dados.get("energyDataList", [])
        conhecidos = [item for item in lista if item.get("dataType") == "PV_ENERGY"]
        novos = [item for item in lista if item.get("dataType") != "PV_ENERGY"]

        print(f"Total de itens em energyDataList: {len(lista)}")
        print(f"  - Já conhecidos (PV_ENERGY, já lidos pelo robô de produção): {len(conhecidos)}")
        print(f"  - NOVOS (dataType diferente de PV_ENERGY — é isso que estamos procurando): {len(novos)}")
        print()

        if novos:
            print("!" * 70)
            print("ENCONTRADO(S) dataType(s) NOVO(S) — provável efeito do DDSU666 instalado:")
            print("!" * 70)
            for item in novos:
                print(json.dumps(item, indent=2, ensure_ascii=False))
                print("-" * 40)
            print("\n>>> PRÓXIMO PASSO: colar esta saída completa numa sessão do Claude Code")
            print(">>> pra decidir o mapeamento de campos e avançar pra Fase 2 do plano")
            print(">>> (docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md).")
        else:
            print("Nenhum dataType novo encontrado neste endpoint — só PV_ENERGY, igual antes da")
            print("instalação. Isso NÃO significa que o medidor não está funcionando: pode ser que")
            print("a API da SAJ exponha esses dados por outro endpoint, ou com algum atraso de")
            print("propagação. Ver seção 7 do documento de decisão (risco já identificado).")

        print("\n--- RESPOSTA BRUTA COMPLETA (pra registro / caso algo relevante esteja fora de")
        print("--- energyDataList, ex: campos soltos no nível superior de `dados`) ---")
        print(json.dumps(dados, indent=2, ensure_ascii=False))

        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
