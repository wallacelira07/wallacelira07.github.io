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

  // CORRIGIDO 14/08/2026 (ampliação da camada de cache, pedido do usuário — reduzir refetch entre
  // cargas de página): o `if (this._regras) return this._regras` acima já evitava refetch DENTRO da
  // mesma sessão de página, mas _regras é uma variável de instância comum — some a cada F5, igual ao
  // WallaceFinanceService._cache antes desta mudança (mesmo raciocínio, ver app.js _CacheComTTL).
  // regras_classificacao é editada manualmente, raro, nunca por um lançamento — candidato seguro pra
  // sessionStorage (nunca localStorage: expira ao fechar a aba). TTL de 90s: se a memória (this._regras)
  // já tiver o valor, nem chega a olhar o sessionStorage; se não, tenta sessionStorage ANTES de ir pra
  // rede; qualquer erro de sessionStorage (quota, modo anônimo, JSON corrompido) cai silenciosamente
  // pro fetch normal, nunca quebra a classificação.
  _CHAVE_SESSION_STORAGE = 'wfs_cache_v1:regras_classificacao';
  _TTL_SESSION_STORAGE_MS = 90000;

  _lerRegrasPersistidas() {
    try {
      const bruto = sessionStorage.getItem(this._CHAVE_SESSION_STORAGE);
      if (!bruto) return undefined;
      const entrada = JSON.parse(bruto);
      if (!entrada || typeof entrada.gravadoEm !== 'number') return undefined;
      if (Date.now() - entrada.gravadoEm > this._TTL_SESSION_STORAGE_MS) {
        sessionStorage.removeItem(this._CHAVE_SESSION_STORAGE);
        return undefined;
      }
      return entrada.valor;
    } catch (e) {
      return undefined;
    }
  }

  _gravarRegrasPersistidas(valor) {
    try {
      sessionStorage.setItem(this._CHAVE_SESSION_STORAGE, JSON.stringify({ valor, gravadoEm: Date.now() }));
    } catch (e) {
      // Bônus de performance, não garantia — falha aqui não impede a classificação de funcionar.
    }
  }

  async _carregarRegras() {
    if (this._regras) return this._regras;
    const persistidas = this._lerRegrasPersistidas();
    if (persistidas !== undefined) {
      this._regras = persistidas;
      return this._regras;
    }
    const resp = await fetch(
      `${this.url}/rest/v1/regras_classificacao?select=prioridade,estabelecimento_contem,categoria_id,caixa_id,resultado&ativo=eq.true&order=prioridade.asc`,
      { headers: { apikey: this.key, Authorization: `Bearer ${this.key}` } }
    );
    if (!resp.ok) throw new Error(`ClassificacaoService: erro ${resp.status} ao buscar regras`);
    this._regras = await resp.json();
    this._gravarRegrasPersistidas(this._regras);
    return this._regras;
  }

  invalidarCache() {
    this._regras = null;
    try { sessionStorage.removeItem(this._CHAVE_SESSION_STORAGE); } catch (e) {}
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
