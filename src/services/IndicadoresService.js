/**
 * IndicadoresService.js — Sistema Wallace Lira, Arquitetura V2, Fase 5
 * ======================================================================
 * NOVO 05/08/2026 (parte 108). Cobre `indicadores` (armazena o RESULTADO
 * do PIB Wallace e outros indicadores já calculados — a fórmula continua
 * em código, aqui só lê o que já foi persistido, seguindo a Fase 5.5 item
 * 7.4 "usar a tabela indicadores pra leitura direta, evitando recálculo").
 */

export class IndicadoresService {
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
    if (!resp.ok) throw new Error(`IndicadoresService: erro ${resp.status} ao buscar ${tabela}`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }

  invalidarCache() {
    this._cache.clear();
  }

  /** Todo o histórico de um indicador por nome, mais recente primeiro. */
  async getHistorico(nome) {
    return this._get('indicadores', `select=valor,data_calculo&nome=eq.${encodeURIComponent(nome)}&order=data_calculo.desc`);
  }

  /** Valor mais recente de um indicador (ou null se nunca calculado). */
  async getValorAtual(nome) {
    const hist = await this.getHistorico(nome);
    return hist.length ? Number(hist[0].valor) : null;
  }

  /** Todos os "PIB Wallace - X" mais recentes, um objeto {metrica: valor}. */
  async getPibWallace() {
    const todos = await this._get('indicadores', "select=nome,valor,data_calculo&nome=like.PIB Wallace*&order=data_calculo.desc");
    const resultado = {};
    for (const item of todos) {
      const metrica = item.nome.replace('PIB Wallace - ', '');
      if (!(metrica in resultado)) resultado[metrica] = Number(item.valor); // primeiro = mais recente
    }
    return resultado;
  }
}
