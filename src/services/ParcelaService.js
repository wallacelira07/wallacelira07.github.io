/**
 * ParcelaService.js — Sistema Wallace Lira, Arquitetura V2, Fase 5 / 2C
 * ======================================================================
 * NOVO 05/08/2026 (parte 108). Cobre `parcelas` (substitui PARCELAMENTOS_VISA
 * + PARCELAMENTOS_MP). Lembrete real desta sessão (Fase 2): a fonte só
 * guarda o status ATUAL de cada parcelamento (parcela X de N), não uma
 * linha por ocorrência futura — `data_prevista` costuma vir null, não é bug.
 *
 * ATUALIZADO 06/08/2026 (Fase 2C.2): `getTotalComprometidoMensal()` delega
 * a soma pro `FinanceEngine.somarCampo()` — mesma função já testada contra
 * as 15 parcelas ativas reais do Domínio 4 (soma R$1.421,00).
 */

import { somarCampo } from './FinanceEngine.js';

export class ParcelaService {
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
    if (!resp.ok) throw new Error(`ParcelaService: erro ${resp.status} ao buscar ${tabela}`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }

  invalidarCache() {
    this._cache.clear();
  }

  async getParcelasAtivas() {
    return this._get('parcelas', 'select=numero_parcela,total_parcelas,valor_parcela,status,transacao_origem_id,origem_array&status=eq.ativa');
  }

  /** Soma do valor mensal comprometido em parcelas ativas — cálculo
   * delegado ao FinanceEngine (Fase 2C.2). */
  async getTotalComprometidoMensal() {
    const ativas = await this.getParcelasAtivas();
    return somarCampo(ativas, 'valor_parcela');
  }

  /** Quantas parcelas ainda faltam pra cada uma quitar (total - atual). */
  async getParcelasRestantes() {
    const ativas = await this.getParcelasAtivas();
    return ativas.map((p) => ({
      ...p,
      parcelas_restantes: p.total_parcelas - p.numero_parcela,
    }));
  }
}
