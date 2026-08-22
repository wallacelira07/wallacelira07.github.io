#!/usr/bin/env python3
"""
Automação de faturas de consumo (Água/Gás Medintech + Energia Energisa) -> Supabase
=======================================================================================
NOVO 19/08/2026, AMPLIADO 19/08/2026 (Energisa + referência de consumo solar). Resolve o achado da
varredura anti-hardcode: 3 componentes de consumo do "piso absoluto" (TXB000004 Água, TXB000005
Gás, TXB000009 Energia, cronograma_boletos_fixos) eram valores fixos digitados à mão, mas são
contas de CONSUMO que mudam todo mês de verdade — confirmado com PDF real (Água R$133,41->R$152,16,
Gás R$30,28->R$36,70). O valor de Energia (TXB000009, R$367,36) continua NÃO confirmado — a fatura
do próprio Wallace deste ciclo ainda não foi emitida (só as da mãe e da irmã foram vistas até agora,
usadas só pra validar o parser, nunca gravadas como se fossem dele — ver docs/decisions/ pro erro
real cometido e corrigido na 1ª tentativa).

AMPLIAÇÃO (mesmo dia): a Energisa também alimenta `energia_solar_consumo_referencia` (consumo médio
diário por casa, usado no cálculo de crédito solar GD_II) — hoje mantida 100% manual (usuário lê a
fatura e informa o valor). O robô agora atualiza essa tabela sozinho pras 3 casas (wallace/mae/irma)
sempre que achar a fatura de qualquer uma delas no e-mail — diferente do valor do boleto TXB000009
(que só conta pro Wallace), aqui as 3 contam, cada uma na sua própria linha da tabela.

NÃO EXISTE API PÚBLICA de nenhuma das 2 concessionárias (confirmado por pesquisa). A fonte real é
sempre e-mail com PDF anexado:
  - Medintech/BZS: sistemas@bzs.com.br, assunto "A tarifa referente ao mês de [mês] chegou -
    Conta: [753/1024]", 1 e-mail por conta por mês, ~dia 19-22.
  - Energisa: domínio @energisa.com.br (remetente exato do envio AUTOMÁTICO mensal ainda não
    confirmado 19/08/2026 — o serviço foi ativado nesta mesma sessão, "a partir da próxima fatura";
    os PDFs reais vistos até agora vieram de 2ª via manual). Por isso a busca de Energisa é por
    DOMÍNIO inteiro + exige anexo, não um remetente único — mais frouxa na busca, compensada pela
    identificação por UC (ver _identificar_casa_energisa abaixo) antes de aceitar qualquer dado.

MÉTODO DE EXTRAÇÃO DE VALOR — 2 métodos diferentes, um por fonte (achado real 19/08/2026: o método
da Medintech NÃO generaliza pra Energisa):
  - Medintech: decodificado da LINHA DIGITÁVEL do boleto, formato padrão Febraban (47 dígitos, 5º
    campo = 14 dígitos = 4 de fator de vencimento + 10 de valor em centavos) — regulado, estável,
    imune a mudança visual. Confirmado nos 2 PDFs reais de julho/2026.
  - Energisa: a linha digitável NÃO aparece sempre — comparando 2 PDFs reais (fatura da mãe e da
    irmã, agosto/2026), a da irmã (já paga) não tinha a ficha de compensação/linha digitável
    impressa, só a da mãe tinha. O campo confiável nos 2 casos foi outro: a data de vencimento
    seguida de "R$ valor" (padrão: data DD/MM/AAAA + "R$" + valor), com a linha "TOTAL: valor" como
    2º método de validação cruzada — os 2 bateram exato nos 2 PDFs reais (mãe R$56,11, irmã
    R$70,12). Linha digitável mantida como 3º fallback (funciona quando presente).

IDENTIFICAÇÃO DE QUAL CONTA É QUAL — 2 métodos, um por fonte:
  - Medintech: conta (753/1024) vem do ASSUNTO do e-mail, nunca do PDF — mais confiável e não exige
    abrir o PDF pra saber qual é qual.
  - Energisa: como o remetente é buscado por domínio inteiro, e as contas da mãe/irmã/Wallace
    chegam no mesmo e-mail, a identificação é pelo **Número da UC** (unidade consumidora) — campo
    sempre presente e claramente rotulado em toda fatura Energisa (confirmado pelo usuário com
    print real), e cada UC corresponde a exatamente 1 imóvel/ligação físico, nunca compartilhado
    entre pessoas. NÃO usa CPF/nome do campo PAGADOR (tentativa inicial, revertida na mesma sessão
    depois de um erro real): confirmado que o Wallace aparece como PAGADOR/titular também na conta
    da própria mãe — CPF do PAGADOR não distingue "é a conta dele" de "é uma conta que ele paga".
  - UCs confirmadas: mãe = 573.702.053-77 (vista em PDF real), irmã = 2.064.202.053-60 (vista em PDF
    real), Wallace = 1.994.775.053-05 (informada por ele, ainda não vista em PDF real — sua fatura
    deste ciclo não foi emitida).

Autenticação: OAuth 2.0 com refresh_token de longa duração (obtido 1x, manualmente, fora deste
script — ver docs/decisions/ da integração). Variáveis de ambiente necessárias:
  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
  SUPABASE_URL, SUPABASE_KEY (service_role)

Idempotente: se o valor buscado for igual ao já cadastrado, não escreve nada (evita `atualizado_em`
mudando à toa). Nunca inventa valor — se não achar e-mail do mês corrente pra alguma das contas,
loga e segue sem tocar naquele registro (P1: nunca aplicar dado sem evidência).
"""
import base64
import datetime
import json
import os
import re
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# tx/conta -> mapeamento fixo (ver cronograma_boletos_fixos, migração 18/08/2026)
_CONTA_PARA_TX = {
    "753": "TXB000004",   # Água (Medintech)
    "1024": "TXB000005",  # Gás (Medintech)
}
_TX_ENERGIA = "TXB000009"  # Energia (Energisa) — só conta pro Wallace, nunca pra mãe/irmã
# UCs por casa (ver cabeçalho do módulo pra proveniência/nível de confiança de cada uma).
_UC_PARA_CASA = {
    "1.994.775.053-05": "wallace",
    "573.702.053-77": "mae",
    "2.064.202.053-60": "irma",
}
# casa -> chave usada dentro do JSON parametros_gerais.ENERGISA_TARIFA_COMPOSICAO (nomes históricos,
# digitados à mão nas primeiras cargas manuais — mantidos pra não quebrar o que o painel já lê).
_CASA_PARA_CHAVE_COMPOSICAO = {
    "wallace": "apartamento_wallace",
    "mae": "casa_mae",
    "irma": "casa_wellida",
}
_MESES_ABREV_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


_FUSO_BRASILIA = datetime.timezone(datetime.timedelta(hours=-3))


def _chave_mes_atual() -> str:
    """Chave tipo 'set26' pra parametros_gerais.ENERGISA_TARIFA_COMPOSICAO[casa].fatura_<chave>_valor —
    mesmo critério das chaves digitadas à mão até aqui (mês/ano em que a fatura foi lida por e-mail,
    não o mês de referência do consumo dentro da fatura). CORRIGIDO 19/08/2026 (auditoria de fuso
    horário): usava utcnow() — robô roda em GitHub Actions (UTC), então perto da virada de mês em
    horário de Brasília (ex. 31/ago 22h BRT = 01/set 01h UTC) gravava sob a chave do mês seguinte
    por engano. Usar sempre o relógio de Brasília aqui."""
    agora = datetime.datetime.now(_FUSO_BRASILIA)
    return f"{_MESES_ABREV_PT[agora.month - 1]}{agora.year % 100:02d}"


def _mes_abrev_capitalizado_atual() -> str:
    """'Set' — mesmo formato de rótulo usado em VARS.ENERGIA_FATURAS_REAIS (graficos-cenarios-lazy.js,
    gráfico 06), pra alimentar a barra 'este ano' com a fatura REAL do Wallace assim que o robô achar.
    Mesma correção de fuso horário de _chave_mes_atual() acima."""
    agora = datetime.datetime.now(_FUSO_BRASILIA)
    return _MESES_ABREV_PT[agora.month - 1].capitalize()

_GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


def _obter_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    body = (
        f"client_id={client_id}&client_secret={client_secret}"
        f"&refresh_token={refresh_token}&grant_type=refresh_token"
    ).encode("utf-8")
    req = Request(_GMAIL_TOKEN_URL, data=body, method="POST",
                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))["access_token"]


def _gmail_get(path: str, access_token: str) -> dict:
    req = Request(f"{_GMAIL_API_BASE}{path}", headers={"Authorization": f"Bearer {access_token}"})
    with urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _extrair_conta_do_assunto(assunto: str) -> str | None:
    m = re.search(r"Conta:\s*(\d+)", assunto or "")
    return m.group(1) if m else None


def _extrair_valor_da_linha_digitavel(texto_pdf: str) -> float | None:
    """Decodifica o valor a partir da linha digitável padrão Febraban (ver cabeçalho do módulo).
    Procura o 5º campo (14 dígitos, sem pontuação, geralmente colado no fim da linha digitável)."""
    candidatos = re.findall(r"\b(\d{14})\b", texto_pdf.replace(".", "").replace(" ", "\n"))
    for c in candidatos:
        centavos = int(c[4:])  # 10 dígitos finais = valor em centavos
        valor = centavos / 100
        if 1.00 <= valor <= 5000.00:  # faixa plausível pra essas 3 contas — descarta falso-positivo
            return round(valor, 2)
    return None


def _baixar_texto_pdf(dados_pdf_base64: bytes) -> str:
    import io
    import pdfplumber
    with pdfplumber.open(io.BytesIO(dados_pdf_base64)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def _identificar_casa_energisa(texto_pdf: str) -> str | None:
    """Identifica de qual casa (wallace/mae/irma) é a fatura Energisa, pelo Número da UC — ver
    cabeçalho do módulo pro motivo de não usar CPF/PAGADOR."""
    def _so_digitos(s: str) -> str:
        return re.sub(r"\D", "", s)
    texto_digitos = _so_digitos(texto_pdf)
    for uc, casa in _UC_PARA_CASA.items():
        if uc in texto_pdf or _so_digitos(uc) in texto_digitos:
            return casa
    return None


def _extrair_valor_energisa(texto_pdf: str) -> float | None:
    """3 métodos em cascata (ver cabeçalho do módulo — a linha digitável nem sempre está presente
    nas faturas Energisa, ao contrário da Medintech). Os 2 primeiros já bateram exato nos 2 PDFs
    reais testados (mãe R$56,11, irmã R$70,12)."""
    m = re.search(r"\d{2}/\d{2}/\d{4}\s+R\$\s*([\d.,]+)", texto_pdf)
    if m:
        return _texto_para_valor(m.group(1))
    m = re.search(r"TOTAL:\s*([\d.,]+)", texto_pdf)
    if m:
        return _texto_para_valor(m.group(1))
    return _extrair_valor_da_linha_digitavel(texto_pdf)


def _texto_para_valor(texto: str) -> float | None:
    """'70,12' -> 70.12; '1.234,56' -> 1234.56."""
    try:
        return round(float(texto.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def _extrair_consumo_energisa(texto_pdf: str) -> tuple[float, int] | None:
    """(consumo_kwh_do_mes, dias) a partir dos campos "Consumo em kWh" e "Dias:" — sempre presentes
    (testado nos 2 PDFs reais). Usa o consumo REAL do mês atual, não uma média histórica (decisão do
    usuário 19/08/2026: mais preciso e mais confiável de achar em qualquer formato de fatura)."""
    m_consumo = re.search(r"Consumo em kWh\s+(?:KWH\s+)?([\d.,]+)", texto_pdf)
    m_dias = re.search(r"Dias:\s*(\d+)", texto_pdf)
    if not m_consumo or not m_dias:
        return None
    consumo = _texto_para_valor(m_consumo.group(1))
    if consumo is None:
        return None
    return consumo, int(m_dias.group(1))


def _anexo_pdf_do_email(msg: dict) -> str | None:
    for parte in msg["payload"].get("parts", []) or []:
        if (parte.get("filename") or "").lower().endswith(".pdf"):
            return parte["body"].get("attachmentId")
    return None


def _buscar_medintech(access_token: str, resultado: dict) -> None:
    """Água (753/TXB000004) e Gás (1024/TXB000005) — conta vem do ASSUNTO do e-mail."""
    busca = _gmail_get("/messages?q=" + "from:sistemas@bzs.com.br newer_than:10d".replace(" ", "%20"), access_token)
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        conta = _extrair_conta_do_assunto(assunto)
        if conta is None or conta not in _CONTA_PARA_TX:
            continue
        tx = _CONTA_PARA_TX[conta]
        anexo_id = _anexo_pdf_do_email(msg)
        if anexo_id is None:
            print(f"AVISO: e-mail '{assunto}' (conta {conta}) sem PDF anexado — pulando.", file=sys.stderr)
            continue
        anexo = _gmail_get(f"/messages/{item['id']}/attachments/{anexo_id}", access_token)
        texto = _baixar_texto_pdf(base64.urlsafe_b64decode(anexo["data"]))
        valor = _extrair_valor_da_linha_digitavel(texto)
        if valor is None:
            print(f"AVISO: não consegui extrair valor do PDF de '{assunto}' (conta {conta}) — pulando, nada é inventado.", file=sys.stderr)
            continue
        if tx not in resultado:  # Gmail retorna mais recente primeiro — não sobrescreve com e-mail mais antigo
            resultado[tx] = valor
            print(f"Conta {conta} ({tx}): R$ {valor:.2f} — extraído de '{assunto}'")


def _buscar_energisa(access_token: str, resultado_boletos: dict, resultado_consumo: dict, resultado_composicao: dict) -> None:
    """Energisa — remetente exato do envio automático ainda não confirmado (ver cabeçalho do
    módulo), então busca por DOMÍNIO inteiro + exige anexo. Cada e-mail encontrado é identificado
    por UC (_identificar_casa_energisa) e usado pra 3 coisas independentes, todas do MESMO PDF (1
    leitura de valor+consumo por casa, reaproveitada nas 3):
      - resultado_boletos[TXB000009] SÓ se a casa for 'wallace' (é o único que conta como despesa
        pessoal dele no cronograma_boletos_fixos).
      - resultado_consumo[casa] pra QUALQUER uma das 3 casas (mãe/irmã/Wallace todas alimentam a
        referência de consumo solar, ver cabeçalho do módulo).
      - resultado_composicao[casa] pra QUALQUER uma das 3 casas (alimenta
        parametros_gerais.ENERGISA_TARIFA_COMPOSICAO[casa], usada nos gráficos "06 Economia antes ×
        depois" e "Quanto você ainda vai pagar mesmo com 100% dos créditos" — NOVO 19/08/2026, pedido
        do usuário: "deve ser atualizado pelo robô", esses 2 pontos eram os únicos dessa família que
        ainda dependiam de alguém copiar valor da fatura à mão pro Supabase)."""
    busca = _gmail_get("/messages?q=" + "from:@energisa.com.br has:attachment newer_than:10d".replace(" ", "%20"), access_token)
    for item in busca.get("messages", []):
        msg = _gmail_get(f"/messages/{item['id']}?format=full", access_token)
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        assunto = headers.get("Subject", "")
        anexo_id = _anexo_pdf_do_email(msg)
        if anexo_id is None:
            continue
        anexo = _gmail_get(f"/messages/{item['id']}/attachments/{anexo_id}", access_token)
        texto = _baixar_texto_pdf(base64.urlsafe_b64decode(anexo["data"]))
        casa = _identificar_casa_energisa(texto)
        if os.environ.get("DEBUG_ENERGISA_TEXTO_PDF"):
            # TEMPORÁRIO 21/08/2026 (pedido do usuário: preciso do texto real do PDF pra escrever a
            # extração da composição percentual — energia/encargos/impostos/iluminação/distribuição —
            # que hoje é 100% digitada à mão e nunca conferida contra a fatura real). Remover depois
            # que essa extração for implementada e validada, mesmo padrão já usado (e já removido) no
            # debug do robô de consórcio Porto.
            print(f"===== DEBUG PDF ENERGISA ('{assunto}', casa={casa}) =====\n{texto}\n===== FIM DEBUG =====")
        if casa is None:
            print(f"AVISO: PDF de '{assunto}' (Energisa) não confirma UC de nenhuma casa conhecida — pulando.", file=sys.stderr)
            continue
        if casa in resultado_composicao:  # Gmail retorna mais recente primeiro — mantém o mais recente por casa
            continue

        valor = _extrair_valor_energisa(texto)
        consumo = _extrair_consumo_energisa(texto)
        if valor is None and consumo is None:
            print(f"AVISO: não consegui extrair valor nem consumo do PDF de '{assunto}' (Energisa, {casa}) — pulando, nada é inventado.", file=sys.stderr)
            continue

        if casa == "wallace" and valor is not None:
            resultado_boletos[_TX_ENERGIA] = valor
            print(f"Energia ({_TX_ENERGIA}): R$ {valor:.2f} — extraído de '{assunto}'")
        if consumo is not None:
            resultado_consumo[casa] = consumo
            print(f"Consumo solar ({casa}): {consumo[0]:.2f} kWh / {consumo[1]} dias — extraído de '{assunto}'")
        if valor is not None and consumo is not None:
            resultado_composicao[casa] = {"valor": valor, "consumo_kwh": consumo[0], "dias": consumo[1]}


def buscar_faturas_do_mes(access_token: str) -> tuple[dict, dict, dict]:
    """Retorna ({tx: valor} pro cronograma_boletos_fixos, {casa: (consumo_kwh, dias)} pra
    energia_solar_consumo_referencia, {casa: {valor, consumo_kwh, dias}} pra
    parametros_gerais.ENERGISA_TARIFA_COMPOSICAO), todos das faturas encontradas nos últimos 10 dias."""
    resultado_boletos: dict = {}
    resultado_consumo: dict = {}
    resultado_composicao: dict = {}
    _buscar_medintech(access_token, resultado_boletos)
    _buscar_energisa(access_token, resultado_boletos, resultado_consumo, resultado_composicao)
    return resultado_boletos, resultado_consumo, resultado_composicao


def atualizar_supabase(supabase_url: str, supabase_key: str, tx: str, valor: float) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=eq.{tx}"
    body = json.dumps({"valor": valor}).encode("utf-8")
    req = Request(url, data=body, headers=headers, method="PATCH")
    try:
        with urlopen(req, timeout=20) as resp:
            resultado = resp.read().decode("utf-8")
    except HTTPError as e:
        corpo = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} ao atualizar {tx}: {corpo}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar {tx}: {e}") from e
    print(f"Supabase atualizado ({tx}): {resultado}")


def obter_valores_atuais(supabase_url: str, supabase_key: str) -> dict:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/cronograma_boletos_fixos?tx=in.(TXB000004,TXB000005,{_TX_ENERGIA})&select=tx,valor"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    return {l["tx"]: float(l["valor"]) for l in linhas}


def atualizar_consumo_solar(supabase_url: str, supabase_key: str, casa: str, consumo_kwh: float, dias: int) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    # consumo_diario_kwh é coluna GERADA no Supabase (achado real 19/08/2026, testado contra o
    # banco: "column consumo_diario_kwh can only be updated to DEFAULT") — nunca escrever nela,
    # o Postgres calcula sozinho a partir de consumo_mensal_kwh/dias_base.
    corpo = {
        "consumo_mensal_kwh": consumo_kwh,
        "dias_base": dias,
        "fonte": "Fatura Energisa real, consumo do mês (automático via robô, atualizar_boletos_medintech.py)",
    }
    url = f"{supabase_url}/rest/v1/energia_solar_consumo_referencia?casa=eq.{casa}"
    req = Request(url, data=json.dumps(corpo).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urlopen(req, timeout=20) as resp:
            resultado = resp.read().decode("utf-8")
    except HTTPError as e:
        corpo_erro = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} ao atualizar consumo solar ({casa}): {corpo_erro}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar consumo solar ({casa}): {e}") from e
    print(f"Supabase atualizado (consumo solar, {casa}): {resultado}")


def obter_consumo_solar_atual(supabase_url: str, supabase_key: str) -> dict:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/energia_solar_consumo_referencia?select=casa,consumo_mensal_kwh"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    return {l["casa"]: float(l["consumo_mensal_kwh"]) for l in linhas}


def obter_parametro_json(supabase_url: str, supabase_key: str, nome: str) -> dict:
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    url = f"{supabase_url}/rest/v1/parametros_gerais?nome=eq.{nome}&select=valor"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as resp:
        linhas = json.loads(resp.read().decode("utf-8"))
    return linhas[0]["valor"] if linhas else {}


def atualizar_parametro_json(supabase_url: str, supabase_key: str, nome: str, valor: dict) -> None:
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{supabase_url}/rest/v1/parametros_gerais?nome=eq.{nome}"
    req = Request(url, data=json.dumps({"valor": valor}).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urlopen(req, timeout=20) as resp:
            resultado = resp.read().decode("utf-8")
    except HTTPError as e:
        corpo_erro = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} ao atualizar parâmetro {nome}: {corpo_erro}") from e
    except URLError as e:
        raise RuntimeError(f"Falha de rede ao atualizar parâmetro {nome}: {e}") from e
    print(f"Supabase atualizado (parametros_gerais.{nome}): {resultado}")


def main() -> int:
    client_id = os.environ.get("GMAIL_CLIENT_ID")
    client_secret = os.environ.get("GMAIL_CLIENT_SECRET")
    refresh_token = os.environ.get("GMAIL_REFRESH_TOKEN")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")

    faltando = [n for n, v in [
        ("GMAIL_CLIENT_ID", client_id), ("GMAIL_CLIENT_SECRET", client_secret),
        ("GMAIL_REFRESH_TOKEN", refresh_token),
        ("SUPABASE_URL", supabase_url), ("SUPABASE_KEY", supabase_key),
    ] if not v]
    if faltando:
        print(f"ERRO: variáveis de ambiente faltando: {', '.join(faltando)}", file=sys.stderr)
        return 1

    try:
        print("Autenticando na Gmail API...")
        access_token = _obter_access_token(client_id, client_secret, refresh_token)
        print("Buscando faturas de consumo (Água/Gás Medintech + Energia Energisa) dos últimos 10 dias...")
        boletos_encontrados, consumo_encontrado, composicao_encontrada = buscar_faturas_do_mes(access_token)

        if boletos_encontrados:
            atuais = obter_valores_atuais(supabase_url, supabase_key)
            for tx, valor_novo in boletos_encontrados.items():
                valor_atual = atuais.get(tx)
                if valor_atual is not None and abs(valor_atual - valor_novo) < 0.005:
                    print(f"{tx}: valor já está atualizado (R$ {valor_atual:.2f}) — nada a fazer.")
                    continue
                print(f"{tx}: R$ {valor_atual if valor_atual is not None else '—'} -> R$ {valor_novo:.2f}")
                atualizar_supabase(supabase_url, supabase_key, tx, valor_novo)

        if consumo_encontrado:
            consumo_atual = obter_consumo_solar_atual(supabase_url, supabase_key)
            for casa, (consumo_kwh, dias) in consumo_encontrado.items():
                atual = consumo_atual.get(casa)
                if atual is not None and abs(atual - consumo_kwh) < 0.005:
                    print(f"Consumo solar ({casa}): já está atualizado ({atual:.2f} kWh) — nada a fazer.")
                    continue
                print(f"Consumo solar ({casa}): {atual if atual is not None else '—'} kWh -> {consumo_kwh:.2f} kWh ({dias} dias)")
                atualizar_consumo_solar(supabase_url, supabase_key, casa, consumo_kwh, dias)

        if composicao_encontrada:
            # NOVO 19/08/2026 (pedido do usuário: "06 Economia antes × depois (apartamento) e Quanto
            # você ainda vai pagar mesmo com 100% dos créditos deve ser atualizado pelo robo") —
            # até aqui essas 2 seções liam parametros_gerais.ENERGISA_TARIFA_COMPOSICAO/
            # ENERGIA_FATURAS_REAIS, mas as 2 só eram atualizadas por alguém digitando o valor da
            # fatura à mão no Supabase. Mescla (nunca sobrescreve o JSON inteiro — cada casa mantém
            # composicao_pct/cosip/uc/histórico já cadastrados, só ganha o par fatura_<mês>_valor/
            # _consumo_kwh do mês novo) e, quando for a fatura do Wallace, também alimenta
            # ENERGIA_FATURAS_REAIS (gráfico 06 "este ano com solar").
            composicao_atual = obter_parametro_json(supabase_url, supabase_key, "ENERGISA_TARIFA_COMPOSICAO")
            faturas_reais_atual = obter_parametro_json(supabase_url, supabase_key, "ENERGIA_FATURAS_REAIS")
            chave_mes = _chave_mes_atual()
            mudou_composicao = False
            mudou_faturas_reais = False
            for casa, dados in composicao_encontrada.items():
                chave_json = _CASA_PARA_CHAVE_COMPOSICAO.get(casa)
                if chave_json is None:
                    continue
                bloco = composicao_atual.setdefault(chave_json, {})
                campo_valor = f"fatura_{chave_mes}_valor"
                campo_consumo = f"fatura_{chave_mes}_consumo_kwh"
                campo_dias = f"fatura_{chave_mes}_periodo_dias"
                if bloco.get(campo_valor) == dados["valor"] and bloco.get(campo_consumo) == dados["consumo_kwh"]:
                    print(f"ENERGISA_TARIFA_COMPOSICAO ({casa}, {chave_mes}): já está atualizado — nada a fazer.")
                else:
                    bloco[campo_valor] = dados["valor"]
                    bloco[campo_consumo] = dados["consumo_kwh"]
                    bloco[campo_dias] = dados["dias"]
                    bloco["fonte"] = f"Fatura Energisa real (automático via robô, atualizar_boletos_medintech.py) — {chave_mes}"
                    mudou_composicao = True
                    print(f"ENERGISA_TARIFA_COMPOSICAO ({casa}): {campo_valor} = R$ {dados['valor']:.2f}, {campo_consumo} = {dados['consumo_kwh']:.2f} kWh")

                if casa == "wallace":
                    mes_label = _mes_abrev_capitalizado_atual()
                    if faturas_reais_atual.get(mes_label) == dados["valor"]:
                        print(f"ENERGIA_FATURAS_REAIS ({mes_label}): já está atualizado — nada a fazer.")
                    else:
                        faturas_reais_atual[mes_label] = dados["valor"]
                        mudou_faturas_reais = True
                        print(f"ENERGIA_FATURAS_REAIS ({mes_label}): R$ {dados['valor']:.2f}")

            if mudou_composicao:
                atualizar_parametro_json(supabase_url, supabase_key, "ENERGISA_TARIFA_COMPOSICAO", composicao_atual)
            if mudou_faturas_reais:
                atualizar_parametro_json(supabase_url, supabase_key, "ENERGIA_FATURAS_REAIS", faturas_reais_atual)

        if not boletos_encontrados and not consumo_encontrado and not composicao_encontrada:
            print("Nenhuma fatura nova encontrada neste período — nada a atualizar.")

        print("Concluído com sucesso.")
        return 0
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(__file__))
    from _heartbeat import registrar_execucao
    _codigo = main()
    registrar_execucao("boletos_medintech", "sucesso" if _codigo == 0 else "erro")
    sys.exit(_codigo)
