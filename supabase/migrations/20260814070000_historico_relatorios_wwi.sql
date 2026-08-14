-- WALLACE WEALTH INTELLIGENCE (WWI) — historico_relatorios + RPC de escrita
-- 14/08/2026, pedido explícito do usuário: "transformar o botão de download num gerador automático
-- de relatórios executivos patrimoniais... o usuário NÃO quer PDF estático, quer um relatório vivo,
-- regenerado automaticamente a cada mês". Plano completo em
-- docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md.
--
-- STATUS: APLICADA em produção 14/08/2026 (via apply_migration, Fase B do plano aprovado pelo
-- usuário). Dry-run feito antes: confirmado que a tabela/RPC não existiam (to_regclass/to_regprocedure
-- null), depois de aplicar testada com upsert 2x num competencia fake ('9999-99') confirmando que
-- score/dados_json atualizam e analise_ia preserva o valor original — linha de teste removida em
-- seguida. Este arquivo só documenta/versiona a migration já aplicada (mesmo padrão de
-- energia_solar_consumo_referencia.sql).
--
-- Decisões confirmadas com o usuário (AskUserQuestion, ver docs/decisions/):
--   - competencia = CICLO FINANCEIRO do sistema ('YYYY-MM', mesmo valor de VARS.cicloAtual /
--     ciclos_financeiros_snapshots.ciclo_key — período 25→24, NÃO mês calendário).
--   - Escrita só via job mensal automatizado (service_role), nunca client-side (chave anon não tem
--     permissão de escrita aqui — mesma régua de lancar_transacao_manual).
--   - narrativa_ia/analise_ia é escrita só na CRIAÇÃO da competência e preservada em updates
--     seguintes (requisito do usuário: "durante o mesmo mês a narrativa permanece igual, apenas os
--     valores financeiros são atualizados") — por isso dados_json e analise_ia são colunas JSONB
--     SEPARADAS: a RPC abaixo sempre sobrescreve dados_json, nunca sobrescreve analise_ia num UPDATE.

CREATE TABLE public.historico_relatorios (
  competencia    text PRIMARY KEY,                 -- 'YYYY-MM' do CICLO financeiro (ver nota acima) — chave natural, mesmo padrão de ciclos_financeiros_snapshots.ciclo_key
  score          numeric,                          -- Wealth Score 0-100, desnormalizado (ORDER BY/gráfico de evolução sem abrir dados_json)
  dados_json     jsonb NOT NULL,                   -- indicadores/KPIs/sub-scores/índices calculados — SEMPRE sobrescrito a cada regeneração dentro da mesma competência
  analise_ia     jsonb NOT NULL,                   -- narrativa (pontosFortesTexto/pontosFracosTexto/riscosTexto/oportunidadesTexto/recomendacoesTexto/parecerFinalTexto/regrasAplicadas) — escrita só na criação, preservada em updates
  pdf_url        text,                             -- NULL na v1 — PDF é só download client-side (doc.save()), sem Supabase Storage nesta versão
  created_at     timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.historico_relatorios ENABLE ROW LEVEL SECURITY;

-- Leitura: mesma política padrão de qualquer tabela financeira do sistema (JWT Firebase válido).
-- Escrita: NENHUM GRANT a anon/authenticated de propósito — só a RPC abaixo, chamada com service_role
-- pelo job mensal (scripts/sync/wwi_gerar_relatorio_mensal.py, Fase B).
CREATE POLICY "Leitura restrita a login Firebase valido" ON public.historico_relatorios
FOR SELECT TO public
USING (
  (select auth.jwt()) IS NOT NULL
  AND (select auth.jwt())->>'iss' = 'https://securetoken.google.com/sistema-wallace-lira'
  AND (select auth.jwt())->>'aud' = 'sistema-wallace-lira'
);

COMMENT ON TABLE public.historico_relatorios IS
  'WALLACE WEALTH INTELLIGENCE (WWI) — 1 linha por competência (ciclo financeiro, mesma chave de ciclos_financeiros_snapshots.ciclo_key). analise_ia é escrita só na criação da competência e preservada em updates (narrativa estável durante o ciclo); dados_json é sempre sobrescrito. Escrita só via RPC wwi_upsert_relatorio_mensal, chamada com service_role pelo job mensal — nunca client-side. Ver docs/decisions/WWI_RELATORIO_EXECUTIVO_INTELIGENCIA.md.';

-- RPC de escrita — upsert idempotente. Chamar 2x na mesma competência é seguro: a 2ª chamada
-- sobrescreve score/dados_json (números atualizados) e preserva analise_ia (narrativa original).
CREATE OR REPLACE FUNCTION public.wwi_upsert_relatorio_mensal(
  p_competencia text,
  p_score       numeric,
  p_dados_json  jsonb,
  p_analise_ia  jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  INSERT INTO historico_relatorios (competencia, score, dados_json, analise_ia)
  VALUES (p_competencia, p_score, p_dados_json, p_analise_ia)
  ON CONFLICT (competencia) DO UPDATE SET
    score         = EXCLUDED.score,
    dados_json    = EXCLUDED.dados_json,
    atualizado_em = now()
    -- analise_ia e created_at NÃO entram no SET: preserva a narrativa e a data de criação originais
    -- da competência — requisito do usuário, ver comentário no topo do arquivo.
  RETURNING jsonb_build_object(
    'competencia', competencia, 'score', score, 'created_at', created_at, 'atualizado_em', atualizado_em
  ) INTO v_resultado;
  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.wwi_upsert_relatorio_mensal IS
  'WWI — upsert idempotente de historico_relatorios. Só chamável com service_role (sem GRANT a anon/authenticated de propósito) — mesma régua de segurança de lancar_transacao_manual. Preserva analise_ia em updates (nunca sobrescreve narrativa já persistida na competência).';

-- Sem GRANT EXECUTE a anon/authenticated — a ausência é intencional (ver comentário acima).
