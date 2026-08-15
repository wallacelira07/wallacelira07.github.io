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

LIMITAÇÃO CONHECIDA, documentada de propósito (nunca fabricar dado que não existe): a Fase 1/Estágio A
(15/08/2026, WWI_ROADMAP_V1.md) descobriu que `pib_wallace_historico.snapshot` da PRÓPRIA competência
(escrito pelo painel a cada boot, não só no fechamento) já cobre "Total operacional" e afins — então
liquidez em ciclos, independência financeira e disciplina financeira deixaram de ser `None` sempre.
O gap remanescente é só `capacidade_investimento` (regra do motor JS): depende de
`aporteBTGPactual`/`depositoAtivacaoNecton`, que são literais editados à mão em
`vars-patrimonio.js` a cada ciclo, sem nenhuma tabela/coluna V2 que os espelhe — permanece `None`/
ausente neste job até existir uma fonte SQL confiável (ver `capacidadeInvestimentoDisponivel` em
`coletar_indicadores()`). Wealth Score final é recalculado só com os eixos disponíveis (mesma lógica
de renormalização de pesos do motor JS), nunca tratando ausência de dado como zero.

CORRIGIDO 15/08/2026 (achado ALTA da auditoria de 43 especialistas, docs/decisions/
AUDITORIA_MULTIDISCIPLINAR_15082026.md): até aqui, `organizacaoFinanceira` e `construcaoPatrimonial`
(35% do peso do Wealth Score) também ficavam `None` sempre — não por falta de fonte SQL, mas porque
nunca tinham sido implementados neste lado. `construcaoPatrimonial` agora usa
`pib_wallace_historico.snapshot->>'patrimonioLiquido'` do mês anterior (mesma fonte que o painel usa
em `REG.pibWallace.patrimonioInicialCiclo`). `organizacaoFinanceira` no motor JS mede "% de seções do
DOM extraídas sem erro" — sem navegador aqui, esse conceito não existe ao pé da letra; foi adaptado
pra "% dos campos de `indicadores_brutos` que este job preencheu", mesmo espírito, fonte SQL em vez
de DOM (ver comentário no ponto de cálculo, dentro de `coletar_indicadores()`). Reprocessamento
retroativo de relatórios já gravados em `historico_relatorios` NÃO foi feito — decisão do usuário.

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


# NOVO 15/08/2026 (Fase 1 do WWI_ROADMAP_V1.md — rastreabilidade de metodologia, pedido explícito
# do usuário: "toda mudança de metodologia de cálculo é rastreável"). Bump manual toda vez que a
# fórmula do Wealth Score (pesos, sub-scores, guardas) mudar de verdade — não é automático de
# propósito, precisa ser uma decisão consciente de quem edita a fórmula. Histórico de versões:
#   wwi-methodology-2026-08-15 — protecaoPatrimonial corrigido (era idêntico a endividamento, agora
#   debt-to-equity); organizacaoFinanceira/construcaoPatrimonial implementados neste motor (antes
#   sempre None); guard patrimonioLiquido>0 explícito em protecaoPatrimonial/investimentos.
METODOLOGIA_VERSAO = "wwi-methodology-2026-08-15"

# NOVO 15/08/2026 (WWI_ROADMAP_V1.md, Fase 1, Estágio A — paridade de narrativa com o motor JS).
# Constantes de negócio replicadas EXATAMENTE das mesmas usadas pelo motor JS/app.js (não são
# valores novos, só espelhados pra este lado poder calcular sem depender do DOM):
#   - META_LANCE_PROJETO_CASA: vars-patrimonio.js:95 (metaLanceProjetoCasa) — meta fixa de lance
#     pro Projeto Casa Nova (capital via BTG/Necton + Caixa Lance), R$180.000,00.
#   - WWI_MARCOS_PATRIMONIO: gerar-analise-financeira.js (WWI_MARCOS_PATRIMONIO) — marcos redondos
#     usados pra "quanto falta pro próximo salto patrimonial".
META_LANCE_PROJETO_CASA = 180000.00
WWI_MARCOS_PATRIMONIO = [100000, 250000, 500000, 1000000, 1500000, 2000000, 3000000, 5000000,
                          10000000, 20000000, 50000000]


def _mes_anterior(competencia: str) -> str:
    """'2026-08' -> '2026-07', '2026-01' -> '2025-12'. Usado pra buscar o patrimônio líquido do
    fechamento do ciclo anterior em pib_wallace_historico (ver construcaoPatrimonial abaixo)."""
    ano, mes = (int(p) for p in competencia.split("-"))
    if mes == 1:
        return f"{ano - 1:04d}-12"
    return f"{ano:04d}-{mes - 1:02d}"


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

    # NOVO 15/08/2026 (Estágio A — paridade de narrativa): teto_mensal por caixa, usado pelo motor
    # JS (centrosDeCusto/escolaJulioPct) como "meta" de cada caixa temática. Mesma tabela/coluna,
    # nenhum dado novo inventado.
    caixas_com_teto = _rest_get(supabase_url, headers, "caixas?select=nome,teto_mensal")
    teto_por_caixa = {c["nome"]: c["teto_mensal"] for c in caixas_com_teto if c.get("teto_mensal") is not None}
    saldo_por_caixa = {c["caixa_nome"]: (c["v2_saldo_calculado"] or 0) for c in saldos_caixas}

    # NOVO 15/08/2026 (Estágio A): empréstimos internos ATIVOS — mesmo padrão de risco baixíssimo
    # (LREI) que o motor JS classifica em _wwiMontarPassivosRank(), pra manter os passivos completos
    # (financiamento+consórcio auto+LREI ativas), não só os 2 que vw_patrimonio_v2 já expõe.
    lrei_ativas = _rest_get(
        supabase_url, headers,
        "emprestimos_internos?select=codigo_legado,valor,caixa_credora_id,caixa_devedora_id,devedora_texto&status=eq.ATIVO")

    # CORRIGIDO 14/08/2026 (auditoria achou tabela `metas` órfã — nenhum código de `src/` lê/escreve
    # nela, e `metas.valor_atual` fica estático desde a criação enquanto o painel ao vivo usa outra
    # fórmula: REG.patrimonio.metaMilhaoPct = (reserva+btgNecton+caixaLance+nectonContaCorrente)/1M,
    # ver src/financeiro/patrimonio/reg-patrimonio.js linha 13. `metas` já tinha divergido R$2.474,63
    # do valor real (12,03% vs 11,78%) e só cresceria, porque nada faz UPDATE nela. Em vez de ler de
    # `metas`, calcula igual ao painel, direto — reserva/btg_necton/necton_conta_corrente já vêm de
    # `patrimonio` (buscado acima como `vw_patrimonio_v2` pra patrimônio_financeiro), caixa_lance já
    # veio de `saldos_caixas` também acima. Nenhuma query nova, nenhuma dependência de tabela parada.
    reserva = patrimonio.get("reserva")
    btg_necton = patrimonio.get("btg_necton")
    necton_cc = patrimonio.get("necton_conta_corrente")
    if None not in (reserva, btg_necton, necton_cc):
        meta_milhao_total = reserva + btg_necton + necton_cc + caixa_lance
        meta_milhao_pct = round(meta_milhao_total / 1_000_000 * 100, 2)
    else:
        meta_milhao_pct = None

    reembolso = _rest_get(supabase_url, headers, f"reembolso_wartsila_ciclo?select=*&ciclo_referencia=eq.{competencia}")
    reembolso = reembolso[0] if reembolso else None
    reemb_recebido = (reembolso["valor_total_bruto"] - reembolso["valor_a_receber"]) if reembolso else None
    reemb_a_receber = reembolso["valor_a_receber"] if reembolso else None
    reemb_total_ciclo = reembolso["valor_total_bruto"] if reembolso else None

    # CORRIGIDO 14/08/2026 (auditoria seção 9 do WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md): antes,
    # este script somava `consorcio_casa_pago` só na hora de montar `ativos_total`, fora de
    # `patrimonio_financeiro` — enquanto o lado JS (`recalcular-patrimonio.js:31`, `bfin.total =
    # reserva+btg+nectonContaCorrente+consorcioCasaPago`) sempre incluiu. Os TOTAIS finais
    # (ativosTotal/patrimonioLiquido) batiam nos dois lados de qualquer jeito (é a mesma soma,
    # só agrupada diferente), mas o NUMERADOR do sub-score "investimentos"
    # (patrimonioFinanceiro/patrimonioLiquido) divergia em exatamente o valor do consórcio pago.
    # Decisão: alinhar este lado ao JS, não o contrário — o próprio Balanço Patrimonial que
    # alimenta o painel (fonte já auditada, não mexida aqui) classifica consórcio casa pago dentro
    # de "🏛️ Patrimônio Financeiro", não dentro do bloco físico (`bf.total` = casa+apartamento+
    # jazigo+solar+carro, nunca inclui consórcio). Consistência com essa classificação já
    # estabelecida > escolher um critério novo só para o WWI.
    financeiro_sem_lance = patrimonio.get("patrimonio_financeiro_liquido_sem_lance")
    fisico_total = patrimonio.get("fisico_total")
    consorcio_casa_pago = patrimonio.get("consorcio_casa_pago")
    if None not in (financeiro_sem_lance, consorcio_casa_pago):
        patrimonio_financeiro = financeiro_sem_lance + caixa_lance + consorcio_casa_pago
    else:
        patrimonio_financeiro = None
    passivo_financiamento_casa = patrimonio.get("passivo_financiamento_casa") or 0
    passivo_consorcio_auto = patrimonio.get("passivo_consorcio_auto") or 0
    passivos_total = passivo_financiamento_casa + passivo_consorcio_auto

    ativos_total = None
    patrimonio_liquido = None
    if patrimonio_financeiro is not None and fisico_total is not None:
        # consorcio_casa_pago já está dentro de patrimonio_financeiro (ver acima) — não somar de
        # novo aqui, senão conta 2x (mesmo cuidado que o JS toma: bfin.total já inclui consórcio,
        # ativosTotal = bf.total + bfin.total, uma soma só).
        ativos_total = patrimonio_financeiro + fisico_total
        patrimonio_liquido = ativos_total - passivos_total

    # CORRIGIDO 14/08/2026 (achado real testando o job pela 1ª vez, "Test Run" real disparado pelo
    # usuário via cron-job.org): vw_patrimonio_v2.consorcio_casa_pago_pct já vem como percentual
    # PRONTO (0.42 = 0,42%, não uma fração 0-1 que precisa multiplicar por 100 — confirmado contra
    # o mesmo padrão em consorcio_auto_pago_pct = 75.22, que também já é literal). A heurística
    # anterior (`*100 se <=1`) quebrava exatamente o caso real de um percentual pequeno de verdade
    # (Consórcio Casa Nova, 0,42% pago) gravando 42% — 100x maior que o real. Removida.
    consorcio_casa_pago_pct = patrimonio.get("consorcio_casa_pago_pct")

    # CORRIGIDO 15/08/2026 (achado ALTA da auditoria de 43 especialistas: motor Python faltava 2 dos
    # 7 sub-scores do Wealth Score, 35% do peso, divergindo do motor JS por construção). Patrimônio
    # líquido do FECHAMENTO do ciclo anterior tem fonte SQL confiável: pib_wallace_historico.snapshot
    # ->>'patrimonioLiquido', gravado por registrar_pib_mensal() a cada fechamento de ciclo (mesma
    # fonte que REG.pibWallace.patrimonioInicialCiclo usa no painel — recalcular-indicadores.js).
    # Se o mês anterior nunca fechou ciclo (ainda não gravou snapshot), fica None — nunca fabricado.
    hist_anterior = _rest_get(
        supabase_url, headers,
        f"pib_wallace_historico?select=snapshot&mes=eq.{_mes_anterior(competencia)}")
    cresc_patrim_inicial = (hist_anterior[0]["snapshot"].get("patrimonioLiquido")
                             if hist_anterior else None)
    cresc_patrim_atual = patrimonio_liquido

    # NOVO 15/08/2026 (Estágio A — paridade de narrativa, achado real durante a investigação: ao
    # contrário do que a limitação original documentava, `pib_wallace_historico` TEM uma fonte pra
    # totalOperacional/poupança — só não era usada aqui. `registrar_pib_mensal()` (recalcular-
    # indicadores.js) grava/atualiza a linha da COMPETÊNCIA ATUAL a cada boot do painel (não só no
    # fechamento do ciclo), então por volta do dia 25 (quando este job roda) a linha do próprio mês
    # já deve existir, contanto que o usuário tenha aberto o painel ao menos 1x no ciclo — suposição
    # razoável de uso normal, mas NÃO garantida. Se a linha não existir ainda, tudo abaixo fica
    # `None` (nunca fabricado) — mesmo padrão defensivo do resto do script.
    #   totalOperacional ≈ despesaTotalComp - consumoNaoRecorrente (mesma decomposição documentada
    #   em recalcular-indicadores.js: "Despesa Total = necessidadeTotalBruta + consumoNaoRecorrente").
    hist_atual = _rest_get(
        supabase_url, headers, f"pib_wallace_historico?select=snapshot&mes=eq.{competencia}")
    snap_atual = hist_atual[0]["snapshot"] if hist_atual else {}
    poupanca_receitas = snap_atual.get("receitaTotalComp")
    poupanca_sobrou = snap_atual.get("poupancaRS")
    despesa_total_comp = snap_atual.get("despesaTotalComp")
    consumo_nao_recorrente = snap_atual.get("consumoNaoRecorrente")
    total_operacional = (
        despesa_total_comp - consumo_nao_recorrente
        if despesa_total_comp is not None and consumo_nao_recorrente is not None else None)

    liquidez_ciclos = (reserva / total_operacional
                        if reserva is not None and total_operacional else None)

    indicadores_brutos = {
        "patrimonioLiquido": patrimonio_liquido,
        "ativosTotal": ativos_total,
        "passivosTotal": passivos_total,
        "patrimonioFinanceiro": patrimonio_financeiro,
        "reserva": patrimonio.get("reserva"),
        "totalOperacional": total_operacional,
        "metaMilhaoPct": meta_milhao_pct,
        "reembRecebidos": reemb_recebido,
        "reembAReceber": reemb_a_receber,
        "reembTotalCiclo": reemb_total_ciclo,
        "consorcioCasaPagoPct": consorcio_casa_pago_pct,
        "crescPatrimInicial": cresc_patrim_inicial,
        "crescPatrimAtual": cresc_patrim_atual,
        "liquidezCiclos": liquidez_ciclos,
        "poupancaReceitas": poupanca_receitas,
        "poupancaSobrou": poupanca_sobrou,
    }

    # CORRIGIDO 15/08/2026 (Estágio A — antes sempre None por falta de fonte SQL pra
    # totalOperacional; ver bloco de coleta de pib_wallace_historico acima). Mesma fórmula do motor
    # JS: 24 ciclos (~2 anos) de reserva sozinha = nota máxima.
    subscores = {
        "liquidez": _clamp(liquidez_ciclos / 24 * 100, 0, 100) if liquidez_ciclos is not None else None
    }
    # Mesma fórmula do motor JS (gerar-analise-financeira.js): variação % do patrimônio líquido entre
    # o fechamento do ciclo anterior e agora, centrada em 50 (0% de crescimento = 50; a cada 2 pontos
    # percentuais de crescimento, +1 na nota).
    if cresc_patrim_inicial and cresc_patrim_atual is not None:
        subscores["construcaoPatrimonial"] = _clamp(
            50 + ((cresc_patrim_atual - cresc_patrim_inicial) / cresc_patrim_inicial * 100) / 2, 0, 100)
    else:
        subscores["construcaoPatrimonial"] = None
    # CORRIGIDO 15/08/2026 (paridade com gerar-analise-financeira.js — ver comentário lá): protecaoPatrimonial
    # media exatamente a mesma coisa que endividamento (passivos/ativoTotal), duplicando o peso real da
    # alavancagem no Wealth Score. Agora mede debt-to-equity (passivos/patrimônio líquido) — ângulo
    # complementar, não repetido.
    # CORRIGIDO 15/08/2026 (paridade com gerar-analise-financeira.js — mesmo achado ALTA da
    # auditoria): guarda explícita `> 0`, não truthy — patrimônio líquido negativo invertia o sinal
    # e podia dar nota 100 (proteção máxima) no pior cenário possível.
    if passivos_total is not None and patrimonio_liquido and patrimonio_liquido > 0:
        subscores["protecaoPatrimonial"] = _clamp(100 - (passivos_total / patrimonio_liquido * 100), 0, 100)
    else:
        subscores["protecaoPatrimonial"] = None
    if passivos_total is not None and ativos_total:
        subscores["endividamento"] = _clamp(100 - (passivos_total / ativos_total * 100) / 50 * 100, 0, 100)
    else:
        subscores["endividamento"] = None
    if patrimonio_financeiro is not None and patrimonio_liquido and patrimonio_liquido > 0:
        subscores["investimentos"] = _clamp(patrimonio_financeiro / patrimonio_liquido / 0.40 * 100, 0, 100)
    else:
        subscores["investimentos"] = None
    pcts_execucao = [v for v in [meta_milhao_pct, consorcio_casa_pago_pct] if v is not None]
    subscores["execucaoDeMetas"] = _clamp(sum(pcts_execucao) / len(pcts_execucao), 0, 100) if pcts_execucao else None

    # organizacaoFinanceira: o motor JS mede "% das seções do relatório que o coletor de DOM
    # conseguiu extrair sem erro" — não é replicável ao pé da letra aqui (este script não tem
    # navegador, não existe DOM pra medir). ADAPTAÇÃO DELIBERADA (15/08/2026, mesmo espírito da
    # métrica original, "o relatório teve dado suficiente pra se montar", só que medido na fonte SQL
    # em vez do DOM): % dos campos de `indicadores_brutos` que este job conseguiu preencher (não
    # None). Documentado explicitamente como proxy adaptado, não idêntico ao JS — se essa adaptação
    # não for aceitável, o usuário pode decidir deixar `None` permanentemente aqui.
    campos_totais = len(indicadores_brutos)
    campos_preenchidos = sum(1 for v in indicadores_brutos.values() if v is not None)
    subscores["organizacaoFinanceira"] = (
        _clamp(campos_preenchidos / campos_totais * 100, 0, 100) if campos_totais else None)

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

    # CORRIGIDO 15/08/2026 (Estágio A): independenciaFinanceira/disciplinaFinanceira agora têm fonte
    # (totalOperacional/poupança via pib_wallace_historico da própria competência, ver acima) —
    # mesmas fórmulas do motor JS.
    independencia_financeira = (
        _clamp(patrimonio_liquido / total_operacional / 240 * 100, 0, 100)
        if patrimonio_liquido is not None and total_operacional else None)
    disciplina_financeira = (
        _clamp(poupanca_sobrou / poupanca_receitas * 100, 0, 100)
        if poupanca_receitas and poupanca_sobrou is not None else None)

    indices = {
        "metaDoMilhao": meta_milhao_pct,
        "casaNova": consorcio_casa_pago_pct,
        "independenciaFinanceira": independencia_financeira,
        "disciplinaFinanceira": disciplina_financeira,
    }

    # NOVO 15/08/2026 (Estágio A) — dado bruto adicional, só pra alimentar gerar_narrativa() (as 8
    # regras/5 blocos novos portados do motor JS). Fica FORA de indicadoresBrutos de propósito: esse
    # dict já é usado como universo de campos pro proxy de organizacaoFinanceira (ver acima) — somar
    # campos novos ali mudaria esse cálculo sem necessidade.
    qtd_caixas = len(saldo_por_caixa)
    caixas_zeradas = sum(1 for v in saldo_por_caixa.values() if v == 0)

    meta_milhao_acumulado = (
        (reserva or 0) + (btg_necton or 0) + (necton_cc or 0) + caixa_lance
        if None not in (reserva, btg_necton, necton_cc) else None)
    meta_milhao_falta = (1_000_000 - meta_milhao_acumulado) if meta_milhao_acumulado is not None else None

    capital_casa_nova = (
        (btg_necton or 0) + caixa_lance if btg_necton is not None else None)
    projeto_casa_nova_pct = (
        _clamp(capital_casa_nova / META_LANCE_PROJETO_CASA * 100, 0, 999)
        if capital_casa_nova is not None else None)
    projeto_casa_nova_falta = (
        META_LANCE_PROJETO_CASA - capital_casa_nova if capital_casa_nova is not None else None)

    consorcio_casa_nova_falta = patrimonio.get("consorcio_casa_quitacao")
    consorcio_casa_nova_acumulado = patrimonio.get("consorcio_casa_pago")

    escola_julio_saldo = saldo_por_caixa.get("Escola de Júlio")
    escola_julio_teto = teto_por_caixa.get("Escola de Júlio")
    escola_julio_pct = (
        _clamp(escola_julio_saldo / escola_julio_teto * 100, 0, 999)
        if escola_julio_saldo is not None and escola_julio_teto else None)

    # Centros de Custo — mesmo agrupamento por padrão de nome de WWI_FAMILIAS_CAIXA (gerar-analise-
    # financeira.js), "leitura" só quando TODAS as caixas do grupo têm teto conhecido (mesma regra:
    # cobertura parcial produziria % artificialmente inflado, uma forma de fabricar leitura).
    import re as _re
    familias = [
        ("Estratégicos", _re.compile(r"lance|w[aä]rtsil[aä]|suaviza", _re.I)),
        ("Operacionais", _re.compile(r"vari[aá]vel|boleto|mercado pago|mastercard|combust[ií]vel|manuten[cç][aã]o|seguro", _re.I)),
        ("Familiares", _re.compile(r"sa[uú]de|pix|anivers[aá]rio|emagrecimento|churrasco|evento", _re.I)),
        ("De Objetivos", _re.compile(r"escola|dur[aá]vel|duravel", _re.I)),
    ]
    grupos = {nome: {"caixas": [], "total": 0.0, "meta_total": 0.0, "com_meta": 0} for nome, _ in familias}
    grupos["Outros"] = {"caixas": [], "total": 0.0, "meta_total": 0.0, "com_meta": 0}
    for nome_caixa, saldo in saldo_por_caixa.items():
        grupo_nome = next((g for g, pad in familias if pad.search(nome_caixa)), "Outros")
        g = grupos[grupo_nome]
        g["caixas"].append(nome_caixa)
        g["total"] += saldo or 0
        teto = teto_por_caixa.get(nome_caixa)
        if teto is not None:
            g["meta_total"] += teto
            g["com_meta"] += 1
    centros_de_custo = []
    for nome_grupo, g in grupos.items():
        if not g["caixas"]:
            continue
        cobertura_total = g["com_meta"] == len(g["caixas"]) and g["meta_total"] > 0
        pct = round(g["total"] / g["meta_total"] * 100, 1) if cobertura_total else None
        centros_de_custo.append({
            "nome": nome_grupo, "caixas": g["caixas"], "total": round(g["total"], 2),
            "metaTotal": round(g["meta_total"], 2) if cobertura_total else None, "pct": pct,
        })

    # Passivos Rank — mesma heurística de risco por padrão de nome de _wwiMontarPassivosRank()
    # (gerar-analise-financeira.js): LREI = baixíssimo, consórcio = médio, resto = baixo.
    passivos_rank = []
    if passivo_financiamento_casa:
        passivos_rank.append({"nome": "Financiamento da Casa", "valor": passivo_financiamento_casa,
                               "risco": "baixo", "descricao": "Condições contratuais conhecidas e estáveis — não exige antecipação."})
    if passivo_consorcio_auto:
        passivos_rank.append({"nome": "Consórcio Auto", "valor": passivo_consorcio_auto,
                               "risco": "medio", "descricao": "Fluxo mensal certo, contemplação (por sorteio ou lance) ainda incerta em prazo."})
    for lrei in lrei_ativas:
        passivos_rank.append({
            "nome": lrei.get("codigo_legado") or "Empréstimo interno",
            "valor": lrei.get("valor"), "risco": "baixo",
            "descricao": "Empréstimo interno, sem juros — ressarcimento já mapeado na própria caixa credora.",
        })

    dados_narrativos = {
        "qtdCaixas": qtd_caixas, "caixasZeradas": caixas_zeradas,
        "metaMilhaoAcumulado": meta_milhao_acumulado, "metaMilhaoFalta": meta_milhao_falta,
        "capitalCasaNova": capital_casa_nova, "projetoCasaNovaPct": projeto_casa_nova_pct,
        "projetoCasaNovaFalta": projeto_casa_nova_falta,
        "consorcioCasaNovaAcumulado": consorcio_casa_nova_acumulado,
        "consorcioCasaNovaFalta": consorcio_casa_nova_falta,
        "escolaJulioSaldo": escola_julio_saldo, "escolaJulioPct": escola_julio_pct,
        "centrosDeCusto": centros_de_custo, "passivosRank": passivos_rank,
        "balancoLinhas": {
            "ativosTotal": ativos_total, "passivosTotal": passivos_total,
            "patrimonioLiquido": patrimonio_liquido, "fisicoTotal": fisico_total,
            "patrimonioFinanceiro": patrimonio_financeiro,
        },
        # GAP DOCUMENTADO (Estágio A, ver WWI_NARRATIVE_ENGINE_ANALISE.md seção 5): "capacidade de
        # investimento" (regra 'capacidade_investimento' do JS) depende de aporteBTGPactual/
        # depositoAtivacaoNecton — hoje literais editados à mão em vars-patrimonio.js, sem tabela V2
        # correspondente. Sem fonte SQL confiável, fica de fora aqui de propósito (nunca fabricado).
        "capacidadeInvestimentoDisponivel": False,
    }

    return {"wealthScore": wealth_score, "subscores": subscores, "indices": indices,
            "indicadoresBrutos": indicadores_brutos, "metodologiaVersao": METODOLOGIA_VERSAO,
            "dadosNarrativos": dados_narrativos}


def gerar_narrativa(indicadores: dict) -> dict:
    """Mesmo espírito de gerarAnaliseFinanceira() (motor JS) — regras determinísticas, nunca cita
    número fora de `indicadores`.

    AMPLIADO 15/08/2026 (WWI_ROADMAP_V1.md, Fase 1, Estágio A — paridade de narrativa): antes tinha
    só 6 das 20 regras nomeadas do motor JS. Portadas mais 8 (liquidez_forte/media/fraca,
    escola_julio_baixo/ok, projeto_casa_nova_capital, caixas_zeradas, poupanca_alta) usando fontes
    SQL achadas durante a investigação (ver WWI_NARRATIVE_ENGINE_ANALISE.md) — principalmente
    `pib_wallace_historico` da PRÓPRIA competência (não só do mês anterior), que carrega
    receita/despesa/poupança já calculados pelo painel a cada boot. 1 regra do JS
    ('capacidade_investimento') continua de fora — gap documentado, sem fonte SQL confiável (ver
    comentário em `coletar_indicadores()`, campo `capacidadeInvestimentoDisponivel`)."""
    b = indicadores["indicadoresBrutos"]
    subscores = indicadores["subscores"]
    dn = indicadores.get("dadosNarrativos", {})
    pontos_fortes, pontos_fracos, riscos, oportunidades, recomendacoes = [], [], [], [], []
    regras_aplicadas = []

    def regra(nome, condicao, fn):
        if not condicao:
            return
        regras_aplicadas.append(nome)
        fn()

    # ===== Liquidez (NOVO Estágio A) =====
    regra("liquidez_forte", subscores.get("liquidez") is not None and subscores["liquidez"] >= 80, lambda: (
        pontos_fortes.append(f"Liquidez de nível muito forte: a Reserva de Emergência (R$ {b['reserva']:.2f}) cobre sozinha cerca de {b['liquidezCiclos']:.1f} ciclos de compromisso fixo — bem acima do padrão de mercado (6 meses/ciclos costuma ser considerado uma reserva robusta).")))
    regra("liquidez_media", subscores.get("liquidez") is not None and 40 <= subscores["liquidez"] < 80, lambda: (
        pontos_fortes.append(f"Liquidez em nível saudável: a Reserva de Emergência cobre cerca de {b['liquidezCiclos']:.1f} ciclos de compromisso fixo, dentro da faixa considerada segura para o perfil.")))
    def _liquidez_fraca():
        pontos_fracos.append(f"Liquidez abaixo do recomendável: a Reserva cobriria só {b['liquidezCiclos']:.1f} ciclos de compromisso fixo sozinha, sem contar outras fontes de caixa disponíveis no sistema.")
        riscos.append("Um imprevisto financeiro grande (perda de renda, despesa médica, reparo urgente) encontraria o sistema com pouca folga de caixa imediata, exigindo recorrer a caixas patrimoniais ou empréstimo interno antes do previsto.")
        recomendacoes.append("Priorizar reforço da Reserva de Emergência no próximo ciclo antes de qualquer novo aporte discricionário — é a base sobre a qual o resto da estratégia patrimonial se apoia.")
    regra("liquidez_fraca", subscores.get("liquidez") is not None and subscores["liquidez"] < 40, _liquidez_fraca)

    if subscores.get("endividamento") is not None:
        if subscores["endividamento"] >= 80:
            pontos_fortes.append(
                f"Alavancagem controlada: passivos representam {round((b['passivosTotal']/b['ativosTotal'])*100, 1)}% do ativo total.")
            regras_aplicadas.append("alavancagem_baixa")
        elif subscores["endividamento"] < 40:
            pontos_fracos.append(
                f"Alavancagem elevada: passivos já representam {round((b['passivosTotal']/b['ativosTotal'])*100, 1)}% do ativo total.")
            riscos.append("Nível de dívida sobre ativos merece monitoramento antes de novos compromissos de longo prazo.")
            regras_aplicadas.append("alavancagem_alta")

    if subscores.get("investimentos") is not None:
        if subscores["investimentos"] < 50:
            pontos_fracos.append("Patrimônio concentrado majoritariamente em ativos físicos/ilíquidos.")
            oportunidades.append("Redirecionar o próximo ciclo de aportes para ativos líquidos ajuda a equilibrar a composição do patrimônio.")
            regras_aplicadas.append("concentracao_fisica")
        elif subscores["investimentos"] >= 90:
            pontos_fortes.append("Boa proporção de patrimônio financeiro/líquido frente ao total.")
            regras_aplicadas.append("investimentos_bem_alocados")

    if b.get("metaMilhaoPct") is not None:
        if b["metaMilhaoPct"] < 25:
            pontos_fracos.append(f"Meta do Milhão ainda em fase inicial: {b['metaMilhaoPct']}% do caminho percorrido.")
            regras_aplicadas.append("meta_milhao_inicial")
        elif b["metaMilhaoPct"] >= 50:
            pontos_fortes.append(f"Meta do Milhão já em {b['metaMilhaoPct']}% — mais da metade do caminho percorrido.")
            regras_aplicadas.append("meta_milhao_mais_da_metade")

    regra("casa_nova_pre_contemplacao", b.get("consorcioCasaPagoPct") is not None and b["consorcioCasaPagoPct"] < 5, lambda: (
        riscos.append(f"Consórcio Casa Nova ainda em fase pré-contemplação ({b['consorcioCasaPagoPct']:.2f}% pago): a parcela mensal é um compromisso certo para um benefício (a contemplação, por sorteio ou lance) ainda incerto em prazo.")))

    # ===== Escola de Júlio (NOVO Estágio A) =====
    regra("escola_julio_baixo", dn.get("escolaJulioPct") is not None and dn["escolaJulioPct"] < 30, lambda: (
        riscos.append(f"Escola de Júlio em {dn['escolaJulioPct']:.1f}% do valor necessário acumulado — se o prazo do próximo ciclo escolar estiver próximo, esse é um compromisso com data certa que merece prioridade de aporte.")))
    regra("escola_julio_ok", dn.get("escolaJulioPct") is not None and dn["escolaJulioPct"] >= 30, lambda: (
        pontos_fortes.append(f"Escola de Júlio com {dn['escolaJulioPct']:.1f}% do valor necessário já acumulado, dentro do esperado para o momento do ciclo escolar.")))

    # ===== Projeto Casa Nova — capital via BTG/Necton + Caixa Lance (NOVO Estágio A) =====
    regra("projeto_casa_nova_capital", dn.get("projetoCasaNovaPct") is not None, lambda: (
        oportunidades.append(f"Projeto Casa Nova em {dn['projetoCasaNovaPct']:.1f}% de maturidade, com R$ {dn['capitalCasaNova']:.2f} de capital hoje disponível (BTG/Necton + Caixa Lance) para eventual lance.")))

    if b.get("reembAReceber"):
        oportunidades.append(f"Reembolso Wärtsilä do ciclo tem R$ {b['reembAReceber']:.2f} ainda pendente de confirmação.")
        regras_aplicadas.append("wartsila_pendencia")
    if b.get("reembRecebidos") is not None and b.get("reembTotalCiclo"):
        eficiencia = (b["reembRecebidos"] / b["reembTotalCiclo"]) * 100
        if eficiencia >= 90:
            pontos_fortes.append(f"Eficiência de recuperação do reembolso Wärtsilä em {eficiencia:.1f}% no ciclo.")
            regras_aplicadas.append("wartsila_recuperacao_alta")

    # ===== Centros de custo zerados (NOVO Estágio A) =====
    regra("caixas_zeradas", dn.get("caixasZeradas") not in (None, 0), lambda: (
        pontos_fracos.append(f"{dn['caixasZeradas']} de {dn['qtdCaixas']} centros de custo estão com saldo zerado neste ciclo — pode ser normal, mas vale conferir se algum deles deveria ter recebido aporte.")))

    # ===== Poupança do ciclo (NOVO Estágio A) =====
    def _poupanca_alta():
        taxa = (b["poupancaSobrou"] / b["poupancaReceitas"]) * 100
        if taxa >= 25:
            pontos_fortes.append(f"Taxa de poupança do ciclo em {taxa:.1f}% — nível de elite para o perfil.")
    regra("poupanca_alta", b.get("poupancaReceitas") and b.get("poupancaSobrou") is not None, _poupanca_alta)

    if not pontos_fortes and not pontos_fracos:
        pontos_fracos.append("Dados insuficientes na coleta via SQL deste job para uma leitura completa — ver limitação documentada no topo do script.")
        regras_aplicadas.append("fallback_dados_insuficientes")

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

    # ===== resumoAberturaTexto (NOVO Estágio A) — mesmas 2 frases do motor JS =====
    frases_abertura = [parecer if score is not None else "Não foi possível calcular o Wealth Score deste ciclo — dados insuficientes na coleta."]
    if b.get("patrimonioLiquido") is not None:
        extra = (f", resultado de R$ {b['ativosTotal']:.2f} em ativos menos R$ {b['passivosTotal']:.2f} em passivos"
                  if b.get("ativosTotal") is not None and b.get("passivosTotal") is not None else "")
        frases_abertura.append(f"O patrimônio líquido do ciclo está em R$ {b['patrimonioLiquido']:.2f}{extra}.")
    resumo_abertura = " ".join(frases_abertura)

    # ===== proximoSaltoTexto (NOVO Estágio A) — mesmos marcos redondos do motor JS =====
    proximo_salto = None
    if b.get("patrimonioLiquido") is not None:
        proximo_marco = next((m for m in WWI_MARCOS_PATRIMONIO if m > b["patrimonioLiquido"]), None)
        if proximo_marco is not None:
            falta = proximo_marco - b["patrimonioLiquido"]
            proximo_salto = f"Com o patrimônio líquido atual em R$ {b['patrimonioLiquido']:.2f}, faltam R$ {falta:.2f} para atingir o próximo marco redondo de R$ {proximo_marco:.2f}."
        else:
            proximo_salto = f"O patrimônio líquido atual (R$ {b['patrimonioLiquido']:.2f}) já superou todos os marcos redondos de referência deste relatório."

    # ===== perfilConstrucaoTexto (NOVO Estágio A) — mesmos 2 limiares já usados acima (não inventados) =====
    perfil_construcao = None
    if b.get("poupancaReceitas") and b.get("poupancaSobrou") is not None and subscores.get("investimentos") is not None:
        taxa_poupanca = (b["poupancaSobrou"] / b["poupancaReceitas"]) * 100
        poupanca_elite = taxa_poupanca >= 25
        alocacao_equilibrada = subscores["investimentos"] >= 50
        perfil = "mais próximo de um construtor de riqueza ativo" if (poupanca_elite and alocacao_equilibrada) else "ainda mais próximo do padrão de um investidor comum"
        perfil_construcao = (f"Combinando taxa de poupança do ciclo ({taxa_poupanca:.1f}%, limiar de \"elite\" já usado neste relatório é >=25%) com a "
                              f"proporção de patrimônio financeiro/líquido bem alocado (nota {round(subscores['investimentos'])}/100, limiar de composição "
                              f"equilibrada já usado neste relatório é >=50), o padrão observado no ciclo está {perfil}.")

    # ===== 5 blocos estruturados (NOVO Estágio A) — mesmos nomes/formato do motor JS =====
    projetos = []
    if b.get("metaMilhaoPct") is not None:
        projetos.append({
            "nome": "Meta do milhão", "pct": b["metaMilhaoPct"],
            "objetivo": "Acumular R$ 1.000.000 em patrimônio líquido.",
            "acumulado": dn.get("metaMilhaoAcumulado"), "falta": dn.get("metaMilhaoFalta"),
        })
    if dn.get("projetoCasaNovaPct") is not None:
        projetos.append({
            "nome": "Projeto casa nova", "pct": dn["projetoCasaNovaPct"],
            "objetivo": "Reunir capital (BTG/Necton + Caixa Lance) para viabilizar a compra da casa nova.",
            "acumulado": dn.get("capitalCasaNova"), "falta": dn.get("projetoCasaNovaFalta"),
        })
    if b.get("consorcioCasaPagoPct") is not None:
        projetos.append({
            "nome": "Consórcio casa nova (I0464 · Cota 12)", "pct": b["consorcioCasaPagoPct"],
            "objetivo": "Consórcio I0464, Cota 12 — carta de crédito para a casa nova, via contemplação por sorteio ou lance.",
            "acumulado": dn.get("consorcioCasaNovaAcumulado"), "falta": dn.get("consorcioCasaNovaFalta"),
        })

    composicao_patrimonio = {
        "linhas": dn.get("balancoLinhas", {}),
        "eixos": [
            {"label": "Eficiência patrimonial", "val": subscores.get("organizacaoFinanceira")},
            {"label": "Liquidez", "val": subscores.get("liquidez")},
            {"label": "Concentração (diversificação)", "val": subscores.get("investimentos")},
            {"label": "Proteção patrimonial", "val": subscores.get("protecaoPatrimonial")},
            {"label": "Geração futura", "val": subscores.get("construcaoPatrimonial")},
        ],
    }
    eixos_validos = [e["val"] for e in composicao_patrimonio["eixos"] if e["val"] is not None]
    composicao_patrimonio["nota"] = round(sum(eixos_validos) / len(eixos_validos)) if eixos_validos else None

    liquidez_analise = {
        "classificacao": (
            None if subscores.get("liquidez") is None else
            "Muito Forte" if subscores["liquidez"] >= 80 else
            "Forte" if subscores["liquidez"] >= 60 else
            "Adequada" if subscores["liquidez"] >= 40 else "Abaixo do recomendado"),
        "liquidezCiclos": b.get("liquidezCiclos"),
        "independenciaFinanceira": indicadores.get("indices", {}).get("independenciaFinanceira"),
    }

    return {
        "pontosFortesTexto": pontos_fortes, "pontosFracosTexto": pontos_fracos, "riscosTexto": riscos,
        "oportunidadesTexto": oportunidades, "recomendacoesTexto": recomendacoes,
        "parecerFinalTexto": parecer, "resumoAberturaTexto": resumo_abertura,
        "proximoSaltoTexto": proximo_salto, "perfilConstrucaoTexto": perfil_construcao,
        "regrasAplicadas": regras_aplicadas or ["motor_python_job_mensal"],
        "projetos": projetos, "passivosRank": dn.get("passivosRank", []),
        "centrosDeCusto": dn.get("centrosDeCusto", []),
        "composicaoPatrimonio": composicao_patrimonio, "liquidezAnalise": liquidez_analise,
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
