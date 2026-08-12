/**
 * FinanceService.js — Sistema Wallace Lira, Arquitetura V2, Fase 5 / 2C
 * ======================================================================
 * NOVO 05/08/2026 (parte 104). Primeira peça real da camada /services
 * descrita na seção 3 da Arquitetura V2: única camada que fala com o
 * Supabase pra dado financeiro (caixas, transações, saldo em tempo real).
 *
 * ATUALIZADO 06/08/2026 (Fase 2C.2): `getSaldoCaixa()` deixou de somar
 * transações na mão (formula duplicada, e incompleta — nem somava
 * `saldo_inicial_ciclo`) e passou a delegar 100% pro `FinanceEngine.
 * calcularSaldoCaixa()`, a mesma função já testada contra os 18 Domínios
 * de Caixas auditados. Regra da Fase 2C: nenhum Service recalcula fórmula,
 * toda matemática vem do FinanceEngine ou do CycleEngine.
 *
 * ESCOPO DESTA VERSÃO (proposital, não é o refactor completo):
 *   Este arquivo NÃO substitui o app.js hoje. Ele é a base pronta pra
 *   consumo gradual — cada seção do painel que for migrada passa a chamar
 *   FinanceService em vez de ler VARS/REG direto.
 *
 * USO:
 *   import { FinanceService } from './src/services/FinanceService.js';
 *   const fs = new FinanceService(SUPABASE_URL, SUPABASE_KEY);
 *   const caixas = await fs.getCaixas();
 *   const saldo = await fs.getSaldoCaixa('Caixa Variável');
 */

import { calcularSaldoCaixa } from './FinanceEngine.js';

// ATUALIZADO 06/08/2026 (parte 141): início efetivo do ciclo financeiro atual (2026-07,
// nominalmente 25/07-24/08, Política seção 9). Usa 24/07 e não 25/07 porque o aporte mensal
// (salário Wärtsilä) cai um dia antes quando a virada oficial cai em fim de semana — mesmo
// tratamento já documentado nos arrays V1 (Manutenção, Eventos, Seguro Emplacamento etc, todos
// com TX datado 24/07 tratado como parte do ciclo atual). Sem esse ajuste, o filtro de ciclo
// abaixo excluiria esse aporte do V2 e quebraria a reconciliação já validada nas 9 caixas do
// Grupo A + Bens Duráveis. Mudar este valor manualmente a cada virada de ciclo até o CycleEngine
// (Fase 2A) assumir essa responsabilidade de forma automática — pendência conhecida, não
// escondida.
const CICLO_ATUAL_INICIO = '2026-07-24';

export class FinanceService {
  constructor(supabaseUrl, supabaseKey) {
    this.url = supabaseUrl;
    this.key = supabaseKey;
    this._cache = new Map(); // Fase 5.5 item 7.3: cache em memória, dura o ciclo da sessão
  }

  // ---- infraestrutura interna --------------------------------------

  async _get(tabela, query) {
    const chave = `${tabela}?${query}`;
    if (this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this.url}/rest/v1/${tabela}?${query}`, {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}` },
    });
    if (!resp.ok) {
      throw new Error(`FinanceService: erro ${resp.status} ao buscar ${tabela}`);
    }
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }

  /** Fase 5.5 item 7.3: invalidação explícita — chamar depois de qualquer escrita. */
  invalidarCache() {
    this._cache.clear();
  }

  // ---- caixas ---------------------------------------------------------

  async getCaixas() {
    return this._get('caixas', 'select=id,nome,tipo,teto_mensal,saldo_inicial_ciclo');
  }

  async getCaixaPorNome(nome) {
    const todas = await this.getCaixas();
    return todas.find((c) => c.nome === nome) || null;
  }

  /**
   * Saldo em tempo real de uma caixa. Busca `saldo_inicial_ciclo` (V2) e as
   * transações confirmadas, e delega o CÁLCULO pro `FinanceEngine.
   * calcularSaldoCaixa()` — mesma fórmula usada nos 18 Domínios de Caixas
   * já auditados (Fase 2C.2: fonte oficial passa a ser só o Engine).
   *
   * CORRIGIDO 06/08/2026 (parte 141): até aqui a query não filtrava por data
   * nem por `afeta_saldo_real` — somava TODA transação confirmada da caixa,
   * incluindo histórico de ciclos já fechados. Isso nunca deu problema nas
   * caixas cujo array V1 só tem transação do ciclo atual, mas quebrou a
   * reconciliação de Boletos (V2 carregava 10 transações do ciclo anterior)
   * e inflou Lance com 1 transação de 21/07 sem correspondente no V1.
   * `escopo` controla o filtro: 'ciclo_atual' (default, novo) restringe a
   * `data >= CICLO_ATUAL_INICIO`; 'todo_historico' preserva o comportamento
   * antigo, para os poucos usos que precisam do saldo cumulativo completo
   * (ex: caixas patrimoniais fora do conceito de ciclo, se algum dia
   * existirem). Nenhuma chamada existente no app.js usa este Service ainda
   * (Fase 5 em andamento) — não há regressão em produção por esta mudança.
   */
  async getSaldoCaixa(nomeCaixa, { escopo = 'ciclo_atual' } = {}) {
    const caixa = await this.getCaixaPorNome(nomeCaixa);
    if (!caixa) throw new Error(`FinanceService: caixa "${nomeCaixa}" não encontrada`);
    const filtroData = escopo === 'ciclo_atual' ? `&data=gte.${CICLO_ATUAL_INICIO}` : '';
    const transacoes = await this._get(
      'transacoes',
      `select=tipo,valor&caixa_id=eq.${caixa.id}&status=eq.confirmado${filtroData}`
    );
    // Adapta pro formato que calcularSaldoCaixa espera: {tipo:'Entrada'|'Saída', valor}
    const transacoesAdaptadas = transacoes.map((t) => ({
      tipo: t.tipo === 'entrada' ? 'Entrada' : 'Saída',
      valor: Number(t.valor),
    }));
    return calcularSaldoCaixa(Number(caixa.saldo_inicial_ciclo || 0), transacoesAdaptadas);
  }

  /** Fase 5.5 item 7.1: UMA chamada só pro dashboard inteiro (caixas, patrimônio,
   * metas, indicadores, reembolsos), em vez de N SELECTs separados. A RPC
   * `rpc_dashboard_resumo()` já existe no Supabase (criada e testada 05/08/2026). */
  async getDashboardResumo() {
    const chave = 'rpc:dashboard_resumo';
    if (this._cache.has(chave)) return this._cache.get(chave);
    const resp = await fetch(`${this.url}/rest/v1/rpc/rpc_dashboard_resumo`, {
      method: 'POST',
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!resp.ok) throw new Error(`FinanceService: erro ${resp.status} ao buscar dashboard`);
    const dado = await resp.json();
    this._cache.set(chave, dado);
    return dado;
  }

  // ---- transações -------------------------------------------------

  /**
   * @param {object} filtros - { caixaNome, categoriaNome, dataInicio, dataFim, status }
   * Todos opcionais. Sem filtro nenhum, traz tudo (cuidado — usar com paginação
   * quando a tabela crescer, ver Fase 5.5 item 7.6/7.7).
   */
  async getTransacoes(filtros = {}) {
    const partes = ['select=id,tx_legado,data,tipo,valor,descricao,caixa_id,categoria_id,status,origem'];
    if (filtros.status) partes.push(`status=eq.${filtros.status}`);
    if (filtros.dataInicio) partes.push(`data=gte.${filtros.dataInicio}`);
    if (filtros.dataFim) partes.push(`data=lte.${filtros.dataFim}`);
    if (filtros.caixaNome) {
      const caixa = await this.getCaixaPorNome(filtros.caixaNome);
      if (caixa) partes.push(`caixa_id=eq.${caixa.id}`);
    }
    return this._get('transacoes', partes.join('&') + '&order=data.desc');
  }

  /** Resumo por caixa — o que a Fase 5.5 item 7.1 (rpc_dashboard_resumo) vai
   * eventualmente substituir por uma única RPC; por enquanto, monta em JS
   * (orquestração, não cálculo — cada saldo individual já vem do Engine). */
  async getResumoPorCaixa() {
    const caixas = await this.getCaixas();
    // CORRIGIDO 12/08/2026 (Fase 4, achado da auditoria): era um await sequencial em loop, 1
    // round-trip ao Supabase por caixa (10-15 hoje) em vez de paralelo. Promise.all dispara todas
    // de uma vez - mesmo resultado, tempo total = a mais lenta, não a soma de todas.
    const saldos = await Promise.all(caixas.map(c => this.getSaldoCaixa(c.nome)));
    return caixas.map((c, i) => ({ nome: c.nome, saldo: saldos[i] }));
  }
}
