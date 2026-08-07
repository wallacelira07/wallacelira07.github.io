/**
 * DashboardService.js — Sistema Wallace Lira, Arquitetura V2, Fase 2C
 * ======================================================================
 * NOVO 06/08/2026. Última peça pedida da Fase 2C.1. Diferente de todos os
 * outros Services, este NÃO fala com o Supabase diretamente — orquestra
 * os outros Services (Finance, Patrimonio, Reembolso, Indicadores,
 * Energia) e monta 1 objeto de resumo. Regra da Fase 2C: nenhum Service
 * recalcula fórmula — este arquivo é 100% composição, 0% matemática. Toda
 * conta que aparece aqui já veio pronta de outro Service (que por sua vez
 * já delega pro FinanceEngine/CycleEngine).
 *
 * ESCOPO: alternativa em JS ao que `rpc_dashboard_resumo()` já faz no
 * Supabase (usada hoje só pelo badge de auditoria cruzada V1×V2 do
 * `app.js`, ver Etapa 0 da auditoria geral). Este Service existe pra
 * quando o consumo for direto da V2 via Services, não mais via RPC única
 * — as duas formas devem, por construção, concordar (mesmas tabelas).
 */

export class DashboardService {
  /**
   * @param {object} services - instâncias já criadas: { financeService,
   *   patrimonioService, reembolsoService, indicadoresService, energiaService,
   *   parcelaService }. Todas opcionais — se uma faltar, a seção
   *   correspondente do resumo vem null, não quebra o resto.
   */
  constructor(services) {
    this.services = services;
  }

  /** Resumo completo — 1 chamada, várias seções, nenhuma delas calculada aqui. */
  async getResumo() {
    const s = this.services;
    const [caixas, patrimonio, investimentos, reembolsos, pib, energia, parcelas] = await Promise.all([
      s.financeService ? s.financeService.getResumoPorCaixa() : null,
      s.patrimonioService ? s.patrimonioService.getPatrimonioAtual() : null,
      s.patrimonioService ? s.patrimonioService.getTotalInvestido() : null,
      s.reembolsoService ? s.reembolsoService.getTotalAReceber() : null,
      s.indicadoresService ? s.indicadoresService.getPibWallace() : null,
      s.energiaService ? s.energiaService.getCreditoLiquidoAtual() : null,
      s.parcelaService ? s.parcelaService.getTotalComprometidoMensal() : null,
    ]);
    return { caixas, patrimonio, investimentos, reembolsos, pib, energia, parcelas };
  }
}
