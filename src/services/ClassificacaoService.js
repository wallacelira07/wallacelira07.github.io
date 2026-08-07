/**
 * ClassificacaoService.js — Sistema Wallace Lira, Arquitetura V2, Fase 5
 * ======================================================================
 * NOVO 05/08/2026 (parte 104). Segunda peça da camada /services. Aplica
 * `regras_classificacao` (Fase 3) em código — a mesma lógica que rodou
 * como SQL nesta sessão pra categorizar 78 transações retroativamente,
 * agora reutilizável (Inbox Financeira futura, sincronização Pluggy, etc.
 * chamam isto em vez de reimplementar o match).
 *
 * Contrato: dado um texto bruto (nome de estabelecimento/PIX), devolve a
 * melhor regra que bate (por prioridade) ou null se nenhuma bater —
 * NUNCA inventa uma classificação quando não há regra, consistente com
 * a política de não categorizar no escuro (Manual regra 04).
 */

export class ClassificacaoService {
  constructor(supabaseUrl, supabaseKey) {
    this.url = supabaseUrl;
    this.key = supabaseKey;
    this._regras = null; // cache: regras mudam pouco, carrega 1x por sessão
  }

  async _carregarRegras() {
    if (this._regras) return this._regras;
    const resp = await fetch(
      `${this.url}/rest/v1/regras_classificacao?select=prioridade,estabelecimento_contem,categoria_id,caixa_id,resultado&ativo=eq.true&order=prioridade.asc`,
      { headers: { apikey: this.key, Authorization: `Bearer ${this.key}` } }
    );
    if (!resp.ok) throw new Error(`ClassificacaoService: erro ${resp.status} ao buscar regras`);
    this._regras = await resp.json();
    return this._regras;
  }

  invalidarCache() {
    this._regras = null;
  }

  /**
   * @param {string} textoBruto - nome de estabelecimento ou descrição crua
   * @returns {Promise<{resultado: 'ignorar'} | {resultado: 'classificar', categoria_id: string, caixa_id: string} | null>}
   *   null = nenhuma regra bateu, NÃO adivinha.
   */
  async classificar(textoBruto) {
    if (!textoBruto) return null;
    const regras = await this._carregarRegras();
    const texto = textoBruto.toUpperCase();
    for (const r of regras) {
      if (r.estabelecimento_contem && texto.includes(r.estabelecimento_contem.toUpperCase())) {
        return r.resultado === 'ignorar'
          ? { resultado: 'ignorar' }
          : { resultado: 'classificar', categoria_id: r.categoria_id, caixa_id: r.caixa_id };
      }
    }
    return null;
  }

  /** Classifica uma lista (ex: lote novo do Pluggy) de uma vez, preservando
   * a ordem. Itens sem match voltam com `resultado: null` — a Inbox
   * Financeira decide o que fazer com eles (normalmente: perguntar ao
   * usuário, nunca assumir). */
  async classificarLote(textos) {
    const regras = await this._carregarRegras(); // 1 busca só pro lote inteiro
    return textos.map((texto) => {
      if (!texto) return { texto, resultado: null };
      const up = texto.toUpperCase();
      const r = regras.find((r) => r.estabelecimento_contem && up.includes(r.estabelecimento_contem.toUpperCase()));
      if (!r) return { texto, resultado: null };
      return r.resultado === 'ignorar'
        ? { texto, resultado: 'ignorar' }
        : { texto, resultado: 'classificar', categoria_id: r.categoria_id, caixa_id: r.caixa_id };
    });
  }
}
