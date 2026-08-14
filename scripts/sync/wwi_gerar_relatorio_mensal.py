#!/usr/bin/env python3
"""
WALLACE WEALTH INTELLIGENCE (WWI) — job mensal -> historico_relatorios (Sistema Wallace Lira)
================================================================================================
NOVO 14/08/2026, pedido explícito do usuário: "relatório vivo, regenerado automaticamente a cada
mês". Ver docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md pro plano completo.

Roda 1x por virada de ciclo financeiro (dia 25, ver `_competencia_atual()`). Calcula os mesmos
indicadores/scores que `src/relatorio/gerar-analise-financeira.js` calcula no navegador — mas via
SQL direto nas views V2 (vw_patrimonio_v2 / vw_saldo_v2_por_caixa / metas / reembolso_wartsila_ciclo),
não via scraping de DOM (este script não tem navegador). Grava via RPC `wwi_upsert_relatorio_mensal`
(SECURITY DEFINER, service_role) — é o ÚNICO escritor real de `historico_relatorios`; o botão de
download no navegador só LÊ o que este job já persistiu (ou gera uma narrativa temporária, só pra
exibir, se este job ainda não rodou neste ciclo — nunca persiste do navegador).

LIMITAÇÃO CONHECIDA, documentada de propósito (nunca fabricar dado que não existe): alguns campos
que o coletor de DOM consegue ler direto da tela (ex. "Total operacional" do card Resumo Executivo)
não têm hoje uma fonte SQL limpa e confirmada pra este script replicar sem risco de divergir do
painel. Os sub-scores/índices que dependem desse campo (liquidez em ciclos, independência financeira,
disciplina financeira) ficam `None` no `dados_json` gravado por este job — o Wealth Score final é
recalculado só com os eixos disponíveis (mesma lógica de renormalização de pesos do motor JS), nunca
tratando ausência de dado como zero. Quando uma fonte SQL confiável pra "compromisso fixo do ciclo"
existir, ampliar aqui e em `calcularIndicadoresEScores()` (mesmo cálculo, duas linguagens).

Variáveis de ambiente necessárias:
  SUPABASE_URL  - https://bakdgacmwlopvrrppwdm.supabase.co
  SUPABASE_KEY  - **service_role**, não a chave pública (esta RPC não tem GRANT pra anon/authenticated
                  de propósito — mesma régua de segurança de lancar_transacao_manual)
"""
import json
import os
import sys
from datetime import date, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def _competencia_atual(hoje: date | None = None) -> str:
    """Ciclo financeiro do sistema (25->24), mesma chave de VARS.cicloAtual/ciclo_key. Decisão
    confirmada com o usuário (AskUserQuestion): competência = ciclo financeiro, não mês calendário.
    Ex.: 14/08/2026 (antes do dia 25) -> '2026-07' (ciclo 25/07->24/08). 26/08/2026 (depois do dia
    25) -> '2026-08' (ciclo 25/08->24/09)."""
    hoje = hoje or date.today()
    if hoje.day >= 25:
        return f"{hoje.year:04d}-{hoje.month:02d}"
    primeiro_dia_mes_atual = hoje.replace(day=1)
    mes_anterior = primeiro_dia_mes_atual - timedelta(days=1)
    return f"{mes_anterior.year:04d}-{mes_anterior.month:02d}"


def _rest_get(supabase_url: str, headers: dict, path_e_query: str):
    req = Request(f"{supabase_url}/rest/v1/{path_e_query}", headers=headers, method="GET")
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _clamp(n: float, minimo: float, maximo: float) -> float:
    return max(minimo, min(maximo, n))


def coletar_indicadores(supabase_url: str, headers: dict, competencia: str) -> dict:
    """Espelha (parcialmente — ver limitação no topo do arquivo) os campos de
    calcularIndicadoresEScores() do motor JS, mas lendo direto das views V2 em vez de DOM."""
    patrimonio = _rest_get(supabase_url, headers, "vw_patrimonio_v2?select=*")
    patrimonio = patrimonio[0] if patrimonio else {}

    saldos_caixas = _rest_get(supabase_url, headers, "vw_saldo_v2_por_caixa?select=caixa_nome,v2_saldo_calculado")
    caixa_lance = next((c["v2_saldo_calculado"] for c in saldos_caixas if c["caixa_nome"] == "Caixa Lance"), 0) or 0

    metas = _rest_get(supabase_url, headers, "metas?select=nome,valor_atual,valor_alvo")
    meta_milhao = next((m for m in metas if m["nome"] == "Meta do Milhão"), None)
    meta_milhao_pct = round((meta_milhao["valor_atual"] / meta_milhao["valor_alvo"]) * 100, 2) if meta_milhao and meta_milhao["valor_alvo"] else None

    reembolso = _rest_get(supabase_url, headers, f"reembolso_wartsila_ciclo?select=*&ciclo_referencia=eq.{competencia}")
    reembolso = reembolso[0] if reembolso else None
    reemb_recebido = (reembolso["valor_total_bruto"] - reembolso["valor_a_receber"]) if reembolso else None
    reemb_a_receber = reembolso["valor_a_receber"] if reembolso else None
    reemb_total_ciclo = reembolso["valor_total_bruto"] if reembolso else None

    financeiro_sem_lance = patrimonio.get("patrimonio_financeiro_liquido_sem_lance")
    patrimonio_financeiro = (financeiro_sem_lance + caixa_lance) if financeiro_sem_lance is not None else None
    fisico_total = patrimonio.get("fisico_total")
    consorcio_casa_pago = patrimonio.get("consorcio_casa_pago")
    passivo_financiamento_casa = patrimonio.get("passivo_financiamento_casa") or 0
    passivo_consorcio_auto = patrimonio.get("passivo_consorcio_auto") or 0
    passivos_total = passivo_financiamento_casa + passivo_consorcio_auto

    ativos_total = None
    patrimonio_liquido = None
    if patrimonio_financeiro is not None and fisico_total is not None and consorcio_casa_pago is not None:
        ativos_total = patrimonio_financeiro + fisico_total + consorcio_casa_pago
        patrimonio_liquido = ativos_total - passivos_total

    # CORRIGIDO 14/08/2026 (achado real testando o job pela 1ª vez, "Test Run" real disparado pelo
    # usuário via cron-job.org): vw_patrimonio_v2.consorcio_casa_pago_pct já vem como percentual
    # PRONTO (0.42 = 0,42%, não uma fração 0-1 que precisa multiplicar por 100 — confirmado contra
    # o mesmo padrão em consorcio_auto_pago_pct = 75.22, que também já é literal). A heurística
    # anterior (`*100 se <=1`) quebrava exatamente o caso real de um percentual pequeno de verdade
    # (Consórcio Casa Nova, 0,42% pago) gravando 42% — 100x maior que o real. Removida.
    consorcio_casa_pago_pct = patrimonio.get("consorcio_casa_pago_pct")

    # NOTA: total_operacional (compromisso fixo do ciclo) não tem fonte SQL confiável hoje pra este
    # script - ver limitação documentada no topo do arquivo. liquidez/independenciaFinanceira/
    # disciplinaFinanceira ficam None aqui de propósito (nunca fabricados).
    indicadores_brutos = {
        "patrimonioLiquido": patrimonio_liquido,
        "ativosTotal": ativos_total,
        "passivosTotal": passivos_total,
        "patrimonioFinanceiro": patrimonio_financeiro,
        "reserva": patrimonio.get("reserva"),
        "totalOperacional": None,
        "metaMilhaoPct": meta_milhao_pct,
        "reembRecebidos": reemb_recebido,
        "reembAReceber": reemb_a_receber,
        "reembTotalCiclo": reemb_total_ciclo,
        "consorcioCasaPagoPct": consorcio_casa_pago_pct,
        "crescPatrimInicial": None,
        "crescPatrimAtual": None,
        "liquidezCiclos": None,
        "poupancaReceitas": None,
        "poupancaSobrou": None,
    }

    subscores = {"liquidez": None, "organizacaoFinanceira": None, "construcaoPatrimonial": None}
    if passivos_total is not None and ativos_total:
        alavancagem = _clamp(100 - (passivos_total / ativos_total * 100) / 50 * 100, 0, 100)
        subscores["protecaoPatrimonial"] = alavancagem
        subscores["endividamento"] = alavancagem
    else:
        subscores["protecaoPatrimonial"] = None
        subscores["endividamento"] = None
    if patrimonio_financeiro is not None and patrimonio_liquido:
        subscores["investimentos"] = _clamp(patrimonio_financeiro / patrimonio_liquido / 0.40 * 100, 0, 100)
    else:
        subscores["investimentos"] = None
    pcts_execucao = [v for v in [meta_milhao_pct, consorcio_casa_pago_pct] if v is not None]
    subscores["execucaoDeMetas"] = _clamp(sum(pcts_execucao) / len(pcts_execucao), 0, 100) if pcts_execucao else None

    pesos = {"liquidez": 0.15, "protecaoPatrimonial": 0.15, "investimentos": 0.20, "endividamento": 0.15,
             "organizacaoFinanceira": 0.10, "execucaoDeMetas": 0.15, "construcaoPatrimonial": 0.10}
    soma_pesos = soma_ponderada = 0.0
    for eixo, peso in pesos.items():
        v = subscores.get(eixo)
        if v is None:
            continue
        soma_pesos += peso
        soma_ponderada += v * peso
    wealth_score = round(soma_ponderada / soma_pesos) if soma_pesos > 0 else None

    indices = {
        "metaDoMilhao": meta_milhao_pct,
        "casaNova": consorcio_casa_pago_pct,
        "independenciaFinanceira": None,
        "disciplinaFinanceira": None,
    }

    return {"wealthScore": wealth_score, "subscores": subscores, "indices": indices, "indicadoresBrutos": indicadores_brutos}


def gerar_narrativa(indicadores: dict) -> dict:
    """Mesmo espírito de gerarAnaliseFinanceira() (motor JS) — regras determinísticas, nunca cita
    número fora de `indicadores`. Subconjunto das regras (as que dependem de totalOperacional/
    crescimento patrimonial ficam de fora aqui, mesma limitação documentada no topo do arquivo)."""
    b = indicadores["indicadoresBrutos"]
    subscores = indicadores["subscores"]
    pontos_fortes, pontos_fracos, riscos, oportunidades, recomendacoes = [], [], [], [], []

    if subscores.get("endividamento") is not None:
        if subscores["endividamento"] >= 80:
            pontos_fortes.append(
                f"Alavancagem controlada: passivos representam {round((b['passivosTotal']/b['ativosTotal'])*100, 1)}% do ativo total.")
        elif subscores["endividamento"] < 40:
            pontos_fracos.append(
                f"Alavancagem elevada: passivos já representam {round((b['passivosTotal']/b['ativosTotal'])*100, 1)}% do ativo total.")
            riscos.append("Nível de dívida sobre ativos merece monitoramento antes de novos compromissos de longo prazo.")

    if subscores.get("investimentos") is not None:
        if subscores["investimentos"] < 50:
            pontos_fracos.append("Patrimônio concentrado majoritariamente em ativos físicos/ilíquidos.")
            oportunidades.append("Redirecionar o próximo ciclo de aportes para ativos líquidos ajuda a equilibrar a composição do patrimônio.")
        elif subscores["investimentos"] >= 90:
            pontos_fortes.append("Boa proporção de patrimônio financeiro/líquido frente ao total.")

    if b.get("metaMilhaoPct") is not None:
        if b["metaMilhaoPct"] < 25:
            pontos_fracos.append(f"Meta do Milhão ainda em fase inicial: {b['metaMilhaoPct']}% do caminho percorrido.")
        elif b["metaMilhaoPct"] >= 50:
            pontos_fortes.append(f"Meta do Milhão já em {b['metaMilhaoPct']}% — mais da metade do caminho percorrido.")

    if b.get("consorcioCasaPagoPct") is not None and b["consorcioCasaPagoPct"] < 5:
        riscos.append("Consórcio Casa Nova ainda em fase pré-contemplação: parcela mensal é um compromisso certo para um benefício ainda incerto.")

    if b.get("reembAReceber"):
        oportunidades.append(f"Reembolso Wärtsilä do ciclo tem R$ {b['reembAReceber']:.2f} ainda pendente de confirmação.")
    if b.get("reembRecebidos") is not None and b.get("reembTotalCiclo"):
        eficiencia = (b["reembRecebidos"] / b["reembTotalCiclo"]) * 100
        if eficiencia >= 90:
            pontos_fortes.append(f"Eficiência de recuperação do reembolso Wärtsilä em {eficiencia:.1f}% no ciclo.")

    if not pontos_fortes and not pontos_fracos:
        pontos_fracos.append("Dados insuficientes na coleta via SQL deste job para uma leitura completa — ver limitação documentada no topo do script.")

    score = indicadores.get("wealthScore")
    if score is not None:
        if score >= 90:
            nivel = "Nível Elite — base institucional consolidada em praticamente todos os eixos avaliados."
        elif score >= 75:
            nivel = "Nível Avançado — disciplina e proteção patrimonial sólidas; a próxima fronteira normalmente é alocação/diversificação."
        elif score >= 55:
            nivel = "Nível Estável — fundamentos presentes, com espaço real de melhoria em pelo menos um eixo crítico."
        else:
            nivel = "Nível de Atenção — recomenda-se revisão de prioridades antes de assumir novos compromissos."
        parecer = f"Wealth Score do ciclo: {score}/100. {nivel}"
    else:
        parecer = "Não foi possível calcular o Wealth Score deste ciclo — dados insuficientes na coleta."

    return {
        "pontosFortesTexto": pontos_fortes, "pontosFracosTexto": pontos_fracos, "riscosTexto": riscos,
        "oportunidadesTexto": oportunidades, "recomendacoesTexto": recomendacoes,
        "parecerFinalTexto": parecer, "regrasAplicadas": ["motor_python_job_mensal"],
    }


def gravar_snapshot(supabase_url: str, service_role_key: str, competencia: str, indicadores: dict, narrativa: dict) -> dict:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    rpc_url = f"{supabase_url}/rest/v1/rpc/wwi_upsert_relatorio_mensal"
    body = json.dumps({
        "p_competencia": competencia,
        "p_score": indicadores.get("wealthScore"),
        "p_dados_json": indicadores,
        "p_analise_ia": narrativa,
    }).encode("utf-8")
    req = Request(rpc_url, data=body, headers=headers, method="POST")
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    if not supabase_url or not supabase_key:
        print("ERRO: SUPABASE_URL e/ou SUPABASE_KEY não definidos.", file=sys.stderr)
        return 1

    competencia = _competencia_atual()
    print(f"WWI: gerando/atualizando relatório mensal da competência {competencia}...")

    headers_leitura = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    try:
        indicadores = coletar_indicadores(supabase_url, headers_leitura, competencia)
        narrativa = gerar_narrativa(indicadores)
        resultado = gravar_snapshot(supabase_url, supabase_key, competencia, indicadores, narrativa)
        print(f"WWI: snapshot gravado com sucesso: {resultado}")
        return 0
    except (HTTPError, URLError) as e:
        print(f"ERRO: falha de rede/HTTP ao gerar relatório WWI: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("wwi_relatorio_mensal", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
