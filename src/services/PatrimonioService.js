/**
 * PatrimonioService.js — Sistema Wallace Lira, Arquitetura V2, Fase 5 / 2C
 * ======================================================================
 * NOVO 05/08/2026 (parte 108). Terceira peça da camada /services (ver seção 3
 * da Arquitetura V2). Cobre `patrimonio` e `investimentos` — imóveis,
 * veículo, reserva, LFTS11, opções, P2P, patrimônio líquido (ativo-passivo).
 *
 * ATUALIZADO 06/08/2026 (Fase 2C.2): `getPatrimonioAtual()` e
 * `getTotalInvestido()` deixaram de somar/subtrair na mão (fórmula
 * duplicada) — delegam pro `FinanceEngine.calcularAtivoPassivoLiquido()`
 * e `FinanceEngine.somarCampo()`, mesmas funções já testadas contra os
 * dados reais do Domínio 3.
 */

import { calcularAtivoPassivoLiquido, somarCampo } from './FinanceEngine.js';

export class PatrimonioService {
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
    if (!resp.ok) throw new Error(`PatrimonioService: erro ${resp.status} ao buscar ${tabela}`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }

  invalidarCache() {
    this._cache.clear();
  }

  /** Snapshot mais recente (todos os itens com a data_snapshot mais nova).
   * Busca e filtra (orquestração); o CÁLCULO vem do FinanceEngine. */
  async getPatrimonioAtual() {
    const todos = await this._get('patrimonio', 'select=tipo,valor,natureza,data_snapshot&order=data_snapshot.desc');
    if (!todos.length) return { itens: [], totalAtivo: 0, totalPassivo: 0, liquido: 0 };
    const dataRecente = todos[0].data_snapshot;
    const itens = todos.filter((i) => i.data_snapshot === dataRecente);
    const { totalAtivo, totalPassivo, liquido } = calcularAtivoPassivoLiquido(itens);
    return { itens, totalAtivo, totalPassivo, liquido };
  }

  /** Posições de investimento (LFTS11, P2P, opções) mais recentes por tipo */
  async getInvestimentos() {
    return this._get('investimentos', 'select=tipo,quantidade,valor_atual,data_atualizacao&order=data_atualizacao.desc');
  }

  async getTotalInvestido() {
    const itens = await this.getInvestimentos();
    return somarCampo(itens, 'valor_atual');
  }
}
