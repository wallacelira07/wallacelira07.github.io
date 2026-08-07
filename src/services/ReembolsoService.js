/**
 * ReembolsoService.js — Sistema Wallace Lira, Arquitetura V2, Fase 5 / 2C
 * ======================================================================
 * NOVO 05/08/2026 (parte 108). Quarta peça da camada /services. Cobre
 * `reembolsos` — Wärtsilä, Bradesco saúde, etc. Não implementa a cascata
 * de prioridade inteira (Políticas seção 5) ainda — isso já existe, testado,
 * no `CycleEngine`/`FinanceEngine.calcularReembolsos()` (Fase 2A/2B), mas
 * ainda não conectado a esta camada (falta migrar o schema `reembolsos`
 * pra ter as 5 pernas, `BACKLOG_V2_REEMBOLSOS`).
 *
 * ATUALIZADO 06/08/2026 (Fase 2C.2): `getTotalAReceber()` deixou de
 * somar/filtrar na mão — delega pro `FinanceEngine.
 * calcularSaldoAbertoReembolsos()`.
 */

import { calcularSaldoAbertoReembolsos } from './FinanceEngine.js';

export class ReembolsoService {
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
    if (!resp.ok) throw new Error(`ReembolsoService: erro ${resp.status} ao buscar ${tabela}`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }

  invalidarCache() {
    this._cache.clear();
  }

  async getReembolsos(status) {
    const filtro = status ? `&status=eq.${status}` : '';
    return this._get('reembolsos', `select=origem,valor_a_receber,valor_recebido,status${filtro}`);
  }

  /** Total ainda a receber, somando todas as origens pendentes/parciais.
   * Cálculo delegado ao FinanceEngine (Fase 2C.2). */
  async getTotalAReceber() {
    const itens = await this.getReembolsos();
    return calcularSaldoAbertoReembolsos(itens);
  }
}
