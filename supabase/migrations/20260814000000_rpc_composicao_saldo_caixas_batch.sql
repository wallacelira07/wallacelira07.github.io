-- NOVO 14/08/2026 (consolidação de boot do painel: hydrate-onda12-caixas-pequenas-v2.js faz 5
-- round-trips HTTP separados a WallaceFinanceService.getTransacoesComposicaoSaldoCaixa(nome), um por
-- caixa pequena — Caixa Lance, Caixa Bens Duráveis, Caixa Churrasco, PIX Vanessa, Caixa
-- Mastercard_Infinite. Esta RPC aceita o array de nomes e devolve a composição das N caixas numa
-- única chamada, no MESMO shape que a função client-side getTransacoesComposicaoSaldoCaixa()
-- (src/app/app.js) já retorna por caixa: { caixaId, cicloInicioEm, linhas: [...] } — só que agora
-- chaveado pelo nome da caixa num objeto jsonb (rpc_composicao_saldo_caixas_batch(nomes)::{nome:
-- {caixaId, cicloInicioEm, linhas}}).
--
-- Filtro de `linhas` REPLICA EXATAMENTE o que getTransacoesComposicaoSaldoCaixa() já replica de
-- vw_saldo_v2_por_caixa (conferido por pg_get_viewdef antes daquele commit, 12/08/2026):
--   status = 'confirmado' AND coalesce(afeta_saldo_real, true) AND
--   (ciclo_inicio_em IS NULL OR data IS NULL OR data >= ciclo_inicio_em)
-- Se este filtro divergir do da view/da função client-side, a composição devolvida por esta RPC não
-- bate com o card já exibido — mesma classe de bug já corrigida 2x nesta sessão (Onda 3 LRW/LRV,
-- Comprometido Caixa Variável). Por isso replica em vez de reimplementar.
--
-- NÃO APLICADA: este arquivo só desenha a RPC. O cliente (WallaceFinanceService.getComposicaoCaixasBatch
-- em src/app/app.js) já tem fallback automático pras 5 chamadas antigas individuais enquanto esta
-- migration não for aplicada em produção — ver comentário "NOVO 14/08/2026" em app.js.

CREATE OR REPLACE FUNCTION public.rpc_composicao_saldo_caixas_batch(p_nomes text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_object_agg(c.nome, comp.dado), '{}'::jsonb)
  FROM caixas c
  JOIN LATERAL (
    SELECT jsonb_build_object(
      'caixaId', c.id,
      'cicloInicioEm', c.ciclo_inicio_em,
      'linhas', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'tx_legado', t.tx_legado,
          'data', t.data,
          'descricao', t.descricao,
          'tipo', t.tipo,
          'valor', t.valor,
          'afeta_saldo_real', t.afeta_saldo_real
        ) ORDER BY t.data DESC, t.created_at DESC)
        FROM transacoes t
        WHERE t.caixa_id = c.id
          AND t.status = 'confirmado'
          AND coalesce(t.afeta_saldo_real, true) = true
          AND (c.ciclo_inicio_em IS NULL OR t.data IS NULL OR t.data >= c.ciclo_inicio_em)
      ), '[]'::jsonb)
    ) AS dado
  ) comp ON true
  WHERE c.nome = ANY(p_nomes);
$function$;

-- Mesmo padrão de GRANT já usado em rpc_dashboard_resumo (leitura pública via chave anônima, ver
-- comentário de _headers() em WallaceFinanceService sobre o passo 2 pendente de restringir a
-- `authenticated`).
GRANT EXECUTE ON FUNCTION public.rpc_composicao_saldo_caixas_batch(text[]) TO anon, authenticated;
