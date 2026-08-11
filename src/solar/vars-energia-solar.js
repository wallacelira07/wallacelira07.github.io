// MODULO: criarVarsEnergiaSolar() - fragmento do VARS (estado inicial), extraido do literal const VARS = {...}
// de app.js na modularizacao Fase 4 (07/08/2026) - MESMOS valores, MESMA estrutura, copia verbatim
// por intervalo de linha (nao retypado a mao). Vira uma FUNCAO porque alguns campos usam expressoes
// runtime; carrega ANTES do app.js (script estatico), chamado depois que este proprio modulo ja
// existe no escopo global - mesmo padrao de seguranca de ordem do REG/CARTAO_PLUGGY_MAPA_DEFAULT.
function criarVarsEnergiaSolar(){
  return {
  // Calculadora Energia Solar (fatura Energisa Jun/2026, real)
  faturaEnergisaValor: 322.99,
  faturaEnergisaKwh: 304,
  consumoMinimoComSolarKwh: 30,
  taxaMinimaEnergisa: 38.00,

  // NOVO 31/07/2026: Rateio de credito solar por casa (Wallace/Irma), baseado no medidor bidirecional
  // da casa da mae (codigo 03=consumido da rede, codigo 103=injetado na rede). Formulas e constantes
  // definidas em Base_Calculo_Rateio_Solar.md (documento do usuario). Medidor nunca zera - acumula
  // desde data_ativacao (21/07/2026) indefinidamente; cada leitura nova e comparada com essa data fixa,
  // nao com a leitura anterior (salvo calculo explicito de delta entre 2 leituras).
  solarDataAtivacao: '2026-07-21',
  solarRateioWallace: 0.71,
  solarRateioIrma: 0.29,
  // NOVO 01/08/2026 (pedido do usuario): premissa de quanto cada categoria da fatura Energisa e
  // efetivamente compensada pelos creditos de energia solar (Lei 14.300/2022, Marco Legal da GD).
  // Energia/Transmissao: 100% compensados (creditos abatem 1:1). Iluminacao Publica (COSIP) e
  // Encargos setoriais: NUNCA compensados por lei, sempre sobram na fatura mesmo com credito de sobra.
  // CORRIGIDO 01/08/2026 (2a correcao, usuario apontou erro conceitual meu): o Fio B NAO e a categoria
  // "Distribuicao" inteira - e so UMA FATIA dela (Fio A + Fio B + Encargos + Perdas compoem a TUSD;
  // "Distribuicao" no app da Energisa e so a parte de infraestrutura fisica). O Fio B representa
  // ~28% a 30% do valor da tarifa TE+TUSD (usando 28%, extremo mais conservador/otimista pro usuario).
  // Cobranca 2026 confirmada: 60% do Fio B. Logo, cobranca real sobre a categoria Distribuicao =
  // 60% x 28% = 16,8% (nao 60% direto como eu tinha calculado antes, errado) - ou seja, 83,2% da
  // Distribuicao continua sendo de fato compensada pelos creditos solares.
  FIO_B_PCT_DA_DISTRIBUICAO: 28, // fatia do Fio B dentro da categoria "Distribuicao" da fatura (varia 28-30% na Energisa PB, usado o extremo mais conservador)
  FIO_B_COBRANCA_2026_PCT: 60, // confirmado - cronograma da Lei 14.300 pra sistemas conectados apos 07/01/2023 (15%/23, 30%/24, 45%/25, 60%/26, 75%/27, 90%/28-29)
  // NOVO 01/08/2026: fallback estatico da composicao tarifaria por unidade (prints do app Energisa,
  // 01/08/2026) - o Supabase tem a copia "viva" (ENERGISA_TARIFA_COMPOSICAO) que sobrescreve isto via
  // Object.assign(VARS, dr) no carregamento; mantido aqui so pra o card nao ficar vazio se o banco
  // estiver fora do ar. Editar via Supabase normalmente, nao aqui.
  // ATUALIZADO 11/08/2026 (2 faturas oficiais reais em PDF, casa_wellida NF 009.005.476 e casa_mae
  // NF 009.005.819, ambas emitidas 10/08/2026, período 08/07→07/08/2026) - fallback local só, a copia
  // viva no Supabase (wallace_dados.ENERGISA_TARIFA_COMPOSICAO) já foi atualizada e sempre vence.
  ENERGISA_TARIFA_COMPOSICAO: {
    apartamento_wallace: { uc:'1.994.775.053-05', historico:{ mai26:270.10, jun26:322.99, jul26:367.36 }, composicao_pct:{ energia:28, impostos:22, distribuicao:22, iluminacao:12, encargos:12, transmissao:5 } },
    casa_wellida: { uc:'2.064.202.053-60', historico:{ mai26:141.82, jun26:106.23, jul26:94.45, ago26:70.12 }, fatura_ago26_valor:70.12, fatura_ago26_consumo_kwh:111, composicao_pct:{ energia:28, impostos:22, distribuicao:22, iluminacao:12, encargos:12, transmissao:5 } },
    casa_mae: { uc:'573.702.053-77', fatura_jul26_valor:203.61, fatura_jun26_valor:301.54, fatura_ago26_valor:56.11, fatura_ago26_consumo_kwh:145, fatura_ago26_injetada_kwh:339, composicao_pct:{ energia:28, impostos:22, distribuicao:22, iluminacao:12, encargos:12, transmissao:5 } },
  },
  // ATUALIZADO 05/08/2026 (parte 99): fatura Energisa real do apartamento do Wallace (UC 1.994.775.053-05,
  // Rua Luzinalda Edite de Araujo Leite 598 Bloco C Apto 806C - Serrotão, leitura dia 21 = bate exato
  // com DIA_LEITURA_WALLACE=21). Usa a linha "Média" da propria fatura (300 kWh / 30 dias, a mesma
  // referencia de 30 dias que a Energisa usa nas outras 2 faturas ja conferidas nesta sessao). Era
  // 291/30=9,70 (fonte antiga nao documentada) - bem proximo do valor real, so agora com fonte.
  solarConsumoDiarioWallace: 300/30,  // 10,00 kWh/dia (fatura Energisa real, linha Média)
  // ATUALIZADO 05/08/2026 (parte 99): agora com fatura real da casa da IRMA (UC 2.064.202.053-60, Rua
  // Jose Palmeira Filho 580 - Jd America, leitura dia 08, confirmado pelo proprio usuario nesta mensagem:
  // "segue a fatura da minha irma e minha"). NOTA: essa UC le no mesmo dia 08 que a UC da mae (573...) -
  // coincidencia de roteiro de leitura da Energisa (bairros proximos), nao confundir com o comentario
  // antigo de DIA_LEITURA_WELLIDA dizendo "mesmo ciclo da Casa da Mae" - a leitura acontece no mesmo dia,
  // mas sao 2 unidades consumidoras diferentes, confirmado pelo usuario diretamente nesta sessao. Usa a
  // linha "Média" da fatura (112 kWh / 30 dias). Era 119/30=3,97 (fonte antiga nao documentada) - bem
  // proximo do valor real, so agora com fonte.
  solarConsumoDiarioIrma: 112/30,      // 3,73 kWh/dia (fatura Energisa real, linha Média)
  // NOVO 05/08/2026 (parte 97): casa da MAE/geradora - a fatura real da UC 573.702.053-77 (Rua Gildete
  // Gomes Bezerra 79, leitura dia 08 = bate com DIA_LEITURA_WELLIDA=8) e dela, nao da Irma. Media
  // calculada so com os 7 MESES DE LEITURA REAL (excluindo os 6 marcados "*" = "Faturamento pela
  // média/mínimo", que sao estimativa da Energisa, nao leitura real): Out/25 168kWh/32d, Nov/25 201/30,
  // Dez/25 270/33, Jan/26 242/30, Fev/26 210/28, Mar/26 215/28, Abr/26 266/32 -> soma 1572 kWh / 213
  // dias = 7,38 kWh/dia. Usada so pra estimar o consumo total das 3 casas (grafico "Geracao por dia");
  // NAO entra no rateio Wallace/Irma (essa casa e a fonte, nao uma recebedora de credito).
  solarConsumoDiarioMae: 1572/213,      // 7,38 kWh/dia (media real ponderada por dias, so meses com leitura de verdade - fatura Energisa confirmada)
  solarGeracaoDiariaEstimada: 25.6,   // kWh/dia bruto (app SAJ), usado so como fallback quando faltar leitura real
  // NOVO 31/07/2026: quando o usuario informar o valor REAL da fatura pos-solar de um mes (a partir da
  // fatura de 21/08), a chave (mesmo nome usado em mesesPares: 'Jul','Ago',...) entra aqui e passa a
  // valer sobre o calculo/projecao daquele mes no grafico da secao 09. Comeca vazio - nenhuma fatura
  // pos-solar chegou ainda.
  ENERGIA_FATURAS_REAIS: {},
  // NOVO 01/08/2026: consumo mensal historico da Irma (mesmo padrao do kwhAnoAnterior do Wallace, secao
  // 09) - nao existe historico mes-a-mes dela ainda, entao comeca com a media fixa (119) repetida nos 12
  // meses. Quando o usuario informar consumo real de um mes especifico dela, entra aqui (chave = nome do
  // mes) e passa a valer sobre a media.
  SOLAR_CONSUMO_IRMA_MES_REAL: {},
  // NOVO 01/08/2026: quando um mes de leitura solar FECHA (o usuario confirma o total gerado naquele mes
  // inteiro, nao so uma leitura parcial), o valor entra aqui (chave = nome do mes, valor = {wallace, irma}
  // em kWh) e passa a valer sobre a estimativa. O mes atual (em andamento) usa a ultima leitura parcial
  // diretamente, nao precisa estar aqui.
  SOLAR_CREDITO_MENSAL_REAL: {},
  // NOVO 01/08/2026: consumo mensal REAL dos ultimos 12 meses da Wellida (irma), extraido da fatura
  // Energisa (UC 2.064.202.053-60, Rua Jose Palmeira Filho 580, Jd America), grafico "Consumo Faturado"
  // da propria fatura Jul/2026. Conferido visualmente (rasterizado + ampliado, nao so texto extraido,
  // ordem: Jul/25 a Jun/26). Substitui a media fixa (119) usada como placeholder ate agora.
  solarConsumoIrmaAnoAnterior: [74,70,82,103,127,122,138,142,172,140,100,112], // Jul/25..Jun/26 kWh
  // NOVO 02/08/2026 (pedido do usuario, 2 faturas Energisa da Casa da Mae): consumo historico da
  // unidade geradora (Casa da Mae), mesma janela de 12 meses das outras 2 unidades. Confirmado pelo
  // usuario: Mai/25..Abr/26. Media: 195 kWh/mes.
  solarConsumoMaeAnoAnterior: [171,172,174,175,177,168,201,270,242,210,215,266], // Mai/25..Abr/26 kWh
  // Dados mais recentes (fora da janela de 12 meses acima, guardados a parte): Jun/26 foi o mes de
  // transferencia de titularidade pro nome do usuario (por isso o ciclo de 40 dias, fora do padrao) -
  // nao usado no calculo do consumo medio, so como referencia/contexto.
  solarConsumoMaeRecente: { jun26: {kwh:284, dias:40}, jul26: {kwh:194, dias:30} },
  SOLAR_LEITURAS: [
    // Cada leitura nova enviada pelo usuario (leitura_03 + leitura_103 + data) vira uma linha aqui.
    // dias = data_leitura - solarDataAtivacao. creditoLiquido = leitura103 - leitura03. Resto deriva
    // das formulas da secao 3 do documento base. fonte:'real' (leitura enviada) ou 'estimado' (fallback).
    // CORRIGIDO 01/08/2026 (V250, documento do usuario "SEM ESTIMATIVAS"): novo campo geracaoAcumulada
    // (kWh, leitura REAL do inversor SAJ - "Geracao Total"/"Geracao Acumulada" do app/portal). Enquanto
    // for null, os campos derivados dela (consumoDireto, consumoTotalCasa, autoconsumoPct,
    // dependenciaPct, exportacaoPct) NAO sao calculados - a tela mostra "Dados insuficientes para
    // calculo" em vez de estimar. Nunca mais usar solarGeracaoDiariaEstimada para isso.
    { data:'2026-07-31', dias:10, leitura03:38, leitura103:210, geracaoAcumulada:268.74, geracaoAcumuladaData:'2026-08-01', fonte:'real' }, // NOVO 01/08/2026 (V259): geracaoAcumuladaData rastreia quando ESSE numero foi lido de verdade (o robo da SAJ atualiza isso sozinho todo dia - ver script atualizar_geracao_saj.py), separado da data da leitura 03/103 (manual, so muda quando o usuario manda foto do medidor). Sem isso, consumo direto ficaria cada vez mais errado conforme os dois descasam (geracao andando sozinha, 03/103 parado).
  ],
  // NOVO 05/08/2026 (pedido do usuario: "não vai conseguir me dar dados de vários dias?"): a API da
  // SAJ sempre devolveu geracao de HOJE (energy1Today) alem do total acumulado, mas o script
  // atualizar_geracao_saj.py so guardava o total - o valor diario era buscado e jogado fora. Corrigido
  // (ver script) pra tambem gravar aqui, 1 registro por dia que o robo rodar (2x/dia, sobrescreve o
  // mesmo dia). Vazio por enquanto - populado sozinho a partir da proxima execucao do robo.
  SOLAR_GERACAO_DIARIA: [],
  };
}
