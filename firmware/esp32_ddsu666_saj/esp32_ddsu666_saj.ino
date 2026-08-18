/*
  ESP32 + MAX485 lendo o medidor DDSU666 (Chint), ligado direto no RS485 do
  inversor SAJ R5-6K-S2-15 (Casa da Mãe), sem depender do Kit SEC nem da
  nuvem eSolar da SAJ.

  Por que isto existe: a SAJ recusou dar suporte técnico pra integração de
  terceiros (ver docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md, seção 9) e a
  linha de base da API deles (rodada 17/08/2026, antes da instalação física)
  mostrou o campo `recommendInstallingSecTip` — sinal de que o dado de
  consumo/import/export pode continuar preso atrás do Kit SEC mesmo depois do
  medidor instalado. Esta rota (ESP32 lendo o Modbus do medidor diretamente e
  postando no nosso próprio Supabase) não depende de nada disso — mesmo
  padrão arquitetural já usado no medidor Tuya do apartamento (dispositivo
  local -> Supabase direto, sem nuvem de terceiro no meio).

  Mapa de registradores usado (fonte: manual oficial Chint "DDSU666 Single
  phase Smart Meter — Operation Manual", ZTY0.464.1224, ago/2020 — NÃO
  confundir com o manual da linha trifásica DTSU666/DSSU666, que usa
  endereços diferentes):
    2000H  U    tensão (float IEEE754, 2 registradores)
    2002H  I    corrente (float IEEE754, 2 registradores)
    2004H  P    potência ativa combinada, em kW (float IEEE754, 2 registradores)
    200EH  Freq frequência (float IEEE754, 2 registradores) — não usado aqui
    4000H  Ep   energia ativa importada da rede, em kWh (equivalente ao
                código 03 da Energisa)
    400AH  -Ep  energia ativa exportada pra rede, em kWh (equivalente ao
                código 103 da Energisa)

  PRÉ-REQUISITO ÚNICO, feito uma vez só na instalação, pelos botões físicos
  do medidor (não dá pra fazer por aqui): o DDSU666 sai de fábrica falando
  protocolo DL/T645-2007. Pressione e segure o botão até entrar no menu de
  troca de protocolo, e curte-pressione até sair de "645Protocol" e cair em
  qualquer um dos modos Modbus (8n2/8n1/8E1/8o1) — só então este firmware
  consegue conversar com ele.

  Biblioteca necessária (Arduino Library Manager): "ModbusMaster" (Doc Walker).
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ModbusMaster.h>

#include "segredos.h"  // WIFI_SSID, WIFI_SENHA, SUPABASE_URL, SUPABASE_SERVICE_KEY — nunca commitado, ver segredos.h.exemplo

// Pinos do MAX485 — ajustar conforme a fiação real feita na instalação.
const int PINO_RX = 16;       // MAX485 RO -> ESP32 RX
const int PINO_TX = 17;       // MAX485 DI -> ESP32 TX
const int PINO_DIRECAO = 4;   // MAX485 DE+RE (ligados juntos) -> ESP32 GPIO

const uint8_t ENDERECO_MODBUS_MEDIDOR = 1;  // registrador 0006H (Addr) do medidor, default de fábrica costuma ser 1
const unsigned long INTERVALO_LEITURA_MS = 5UL * 60UL * 1000UL;  // 5min, mesmo intervalo do robô SAJ de produção

ModbusMaster node;

void antesDeTransmitir() {
  digitalWrite(PINO_DIRECAO, HIGH);
}

void depoisDeTransmitir() {
  digitalWrite(PINO_DIRECAO, LOW);
}

// Os registradores do DDSU666 são float IEEE754 de 32 bits, formato "ABCD"
// (registrador alto primeiro, cada registrador já em ordem normal de bytes)
// — mesma convenção documentada no manual da linha trifásica, assumida igual
// aqui na falta de nota em contrário no manual monofásico.
float lerFloatModbus(uint16_t enderecoRegistrador) {
  uint8_t resultado = node.readHoldingRegisters(enderecoRegistrador, 2);
  if (resultado != node.ku8MBSuccess) {
    Serial.printf("Falha ao ler registrador 0x%04X (codigo erro Modbus: %d)\n", enderecoRegistrador, resultado);
    return NAN;
  }
  uint32_t bitsIEEE754 = ((uint32_t)node.getResponseBuffer(0) << 16) | node.getResponseBuffer(1);
  float valor;
  memcpy(&valor, &bitsIEEE754, sizeof(valor));
  return valor;
}

void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  Serial.print("Conectando ao WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" conectado.");
}

// Postagem direto na RPC do Supabase (mesmo padrão de segurança do medidor
// Tuya: a chave usada aqui é a service_role, nunca a anon key — só ela tem
// permissão de escrita, ver a função atualizar_medidor_ddsu666_saj no banco).
bool postarLeituraSupabase(float tensao, float corrente, float potenciaKw, float energiaImportadaKwh, float energiaExportadaKwh) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/atualizar_medidor_ddsu666_saj";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_SERVICE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_SERVICE_KEY);

  String corpo = String("{\"leitura\":{") +
    "\"tensao_v\":" + String(tensao, 2) + "," +
    "\"corrente_a\":" + String(corrente, 3) + "," +
    "\"potencia_ativa_w\":" + String(potenciaKw * 1000.0, 1) + "," +
    "\"energia_importada_kwh\":" + String(energiaImportadaKwh, 3) + "," +
    "\"energia_exportada_kwh\":" + String(energiaExportadaKwh, 3) +
    "}}";

  int codigoHttp = http.POST(corpo);
  bool sucesso = (codigoHttp >= 200 && codigoHttp < 300);
  if (!sucesso) {
    Serial.printf("Falha ao postar no Supabase: HTTP %d — %s\n", codigoHttp, http.getString().c_str());
  }
  http.end();
  return sucesso;
}

void setup() {
  Serial.begin(115200);
  pinMode(PINO_DIRECAO, OUTPUT);
  digitalWrite(PINO_DIRECAO, LOW);

  Serial2.begin(9600, SERIAL_8N1, PINO_RX, PINO_TX);  // 9600bps, 8N1 — precisa bater com o que foi configurado no medidor (registrador 000CH)
  node.begin(ENDERECO_MODBUS_MEDIDOR, Serial2);
  node.preTransmission(antesDeTransmitir);
  node.postTransmission(depoisDeTransmitir);

  conectarWifi();
}

void loop() {
  float tensao = lerFloatModbus(0x2000);
  float corrente = lerFloatModbus(0x2002);
  float potenciaKw = lerFloatModbus(0x2004);
  float energiaImportada = lerFloatModbus(0x4000);
  float energiaExportada = lerFloatModbus(0x400A);

  if (!isnan(tensao) && !isnan(energiaImportada)) {
    Serial.printf("U=%.1fV I=%.3fA P=%.3fkW Importada=%.3fkWh Exportada=%.3fkWh\n",
                  tensao, corrente, potenciaKw, energiaImportada, energiaExportada);
    if (WiFi.status() == WL_CONNECTED) {
      postarLeituraSupabase(tensao, corrente, potenciaKw, energiaImportada, energiaExportada);
    } else {
      Serial.println("WiFi caiu — tentando reconectar...");
      conectarWifi();
    }
  } else {
    Serial.println("Leitura Modbus falhou nesta rodada — tentando de novo no próximo ciclo.");
  }

  delay(INTERVALO_LEITURA_MS);
}
