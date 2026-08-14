-- NOVO 14/08/2026 (pedido do usuário: "quero que crie o local para receber os dados e os cálculos,
-- quando chegar as faturas eu envio e você joga no supabase e a mágica acontece"). Consumo diário de
-- referência de cada casa vinculada à usina (Wallace/apartamento, Wellida/irmã, Mãe/geradora) —
-- linha "Média" da fatura Energisa real de cada UC. Até agora vivia hardcoded em
-- src/solar/vars-energia-solar.js (VARS.solarConsumoDiarioWallace/Irma/Mae) — toda vez que uma
-- fatura nova chegava, alguém precisava editar código pra atualizar. Agora o cliente busca daqui
-- primeiro (via bootstrap fetch no HTML + app.js), com fallback pros valores hardcoded se a tabela
-- estiver vazia ou o fetch falhar — nunca quebra o site.
--
-- APLICADA em produção 14/08/2026 (via apply_migration). Este arquivo só documenta/versiona a
-- migration já aplicada.
--
-- consumo_mensal_kwh + dias_base = como a fatura real expressa a média ("300 kWh / 30 dias" pro
-- Wallace, "1572 kWh / 213 dias" pra Mãe — ponderado só nos meses com leitura real confirmada,
-- comentário original do vars-energia-solar.js). consumo_diario_kwh é a divisão já pronta, GERADA
-- (sempre consistente com os dois campos-fonte, nunca diverge por engano).
CREATE TABLE public.energia_solar_consumo_referencia (
  casa text PRIMARY KEY CHECK (casa IN ('wallace', 'irma', 'mae')),
  consumo_mensal_kwh numeric NOT NULL,
  dias_base numeric NOT NULL DEFAULT 30,
  consumo_diario_kwh numeric GENERATED ALWAYS AS (consumo_mensal_kwh / NULLIF(dias_base, 0)) STORED,
  fonte text NOT NULL, -- ex: 'Fatura Energisa Ago/26, linha Média' — sempre citar a fatura de origem, nunca "estimado"
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.energia_solar_consumo_referencia ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de RLS já usado em energia_solar_geracao_diaria (leitura só com login Firebase válido
-- do próprio site, escrita só via service_role — nunca anon/authenticated genérico).
CREATE POLICY "Leitura restrita a login Firebase valido"
ON public.energia_solar_consumo_referencia
FOR SELECT
TO public
USING (
  (select auth.jwt()) IS NOT NULL
  AND (select auth.jwt())->>'iss' = 'https://securetoken.google.com/sistema-wallace-lira'
  AND (select auth.jwt())->>'aud' = 'sistema-wallace-lira'
);

-- Popula com os valores REAIS já confirmados por fatura, atualmente hardcoded no código (nenhum
-- número novo/estimado — só migra o que já existia pra cá) — assim a tabela nasce equivalente ao
-- que o site já mostra hoje, sem mudar nenhum valor exibido.
INSERT INTO public.energia_solar_consumo_referencia (casa, consumo_mensal_kwh, dias_base, fonte) VALUES
  ('wallace', 300, 30, 'Fatura Energisa real, linha Média (migrado do hardcode em vars-energia-solar.js, 14/08/2026)'),
  ('irma', 112, 30, 'Fatura Energisa real, linha Média (migrado do hardcode em vars-energia-solar.js, 14/08/2026)'),
  ('mae', 1572, 213, 'Média real ponderada por dias, só meses com leitura confirmada (migrado do hardcode em vars-energia-solar.js, 14/08/2026)');
