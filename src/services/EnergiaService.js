/**
 * EnergiaService.js — Sistema Wallace Lira, Arquitetura V2, Fase 5 / 2C
 * ======================================================================
 * NOVO 05/08/2026 (parte 108). Última peça da camada /services (seção 3
 * completa: FinanceService, ClassificacaoService, PatrimonioService,
 * ReembolsoService, ParcelaService, IndicadoresService, EnergiaService).
 * Cobre `energia_solar_leituras` (medidor bidirecional códigos 03/103) e
 * `energia_solar_geracao_diaria`.
 *
 * ATUALIZADO 06/08/2026 (Fase 2C.2): `getCreditoLiquidoAtual()` delega a
 * subtração pro `FinanceEngine.calcularCreditoLiquidoMedidor()`.
 */

import { calcularCreditoLiquidoMedidor } from './FinanceEngine.js';

export class EnergiaService {
  constructor(supabaseUrl, supabaseKey) {
    this.url = supabaseUrl;
    this.key = supabaseKey;
    this._cache = new Map();
  }

  async _get(tabela, query) {
    const chave = `${tabela}?${query}`;
    if (this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this.url}/rest/v1/${tabela}?${query}`, {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
    });
    if (!resp.ok) throw new Error(`EnergiaService: erro ${resp.status} ao buscar ${tabela}`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }

  invalidarCache() {
    this._cache.clear();
  }

  async getLeituras() {
    return this._get('energia_solar_leituras', 'select=casa,leitura_03,leitura_103,geracao_acumulada,data&order=data.desc');
  }

  async getGeracaoDiaria(limite = 30) {
    return this._get('energia_solar_geracao_diaria', `select=data,geracao_kwh&order=data.desc&limit=${limite}`);
  }

  /** Net do medidor bidirecional: código 103 (injetado) - código 03 (consumido da rede),
   * usando a leitura mais recente. Positivo = injetou mais do que consumiu (crédito).
   * Cálculo delegado ao FinanceEngine (Fase 2C.2). */
  async getCreditoLiquidoAtual() {
    const leituras = await this.getLeituras();
    if (!leituras.length) return null;
    const ultima = leituras[0];
    return calcularCreditoLiquidoMedidor(Number(ultima.leitura_103), Number(ultima.leitura_03));
  }
}
