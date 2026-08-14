--
-- PostgreSQL database dump
--

\restrict QWNPC6eMb25sANaldROQepi5XKdLJNes9E6V2DsixnFDdwfVn1xHxG0VZ6PYDNZ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: atualizar_cotacoes_acoes(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_cotacoes_acoes(cotacoes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  ticker_atual text;
BEGIN
  IF auth.role() IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'nao autorizado - somente service_role pode atualizar cotacoes';
  END IF;
  FOR ticker_atual IN SELECT jsonb_object_keys(cotacoes)
  LOOP
    INSERT INTO cotacoes_acoes (ticker, preco, variacao, atualizado_em)
    VALUES (
      ticker_atual,
      (cotacoes->ticker_atual->>'preco')::numeric,
      (cotacoes->ticker_atual->>'variacao')::numeric,
      now()
    )
    ON CONFLICT (ticker) DO UPDATE
      SET preco = EXCLUDED.preco,
          variacao = EXCLUDED.variacao,
          atualizado_em = EXCLUDED.atualizado_em;
  END LOOP;

  INSERT INTO public.execucoes_jobs (job_nome, status)
  VALUES ('cotacoes_acoes', 'sucesso');

  RETURN cotacoes;
END;
$$;


--
-- Name: atualizar_mercadopago_eventos(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_mercadopago_eventos(eventos jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  qtd int;
begin
  IF auth.role() IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'nao autorizado - somente service_role pode atualizar eventos Mercado Pago';
  END IF;
  insert into public.mercadopago_eventos (id, origem, tipo, descricao, valor, data, status, metadata, atualizado_em)
  select
    novo->>'id',
    coalesce(novo->>'origem','Mercado Pago'),
    novo->>'tipo',
    novo->>'descricao',
    (novo->>'valor')::numeric,
    (novo->>'data')::date,
    novo->>'status',
    novo->'metadata',
    now()
  from jsonb_array_elements(eventos) novo
  on conflict (id) do update set
    origem = excluded.origem,
    tipo = excluded.tipo,
    descricao = excluded.descricao,
    valor = excluded.valor,
    data = excluded.data,
    status = excluded.status,
    metadata = excluded.metadata,
    atualizado_em = now();

  get diagnostics qtd = row_count;

  insert into public.execucoes_jobs (job_nome, status, detalhe)
  values ('mercadopago', 'sucesso', 'gravados=' || qtd);

  return jsonb_build_object('gravados', qtd);
end;
$$;


--
-- Name: atualizar_pluggy_contas(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_pluggy_contas(contas jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  qtd_conexoes int;
  qtd_contas int;
  qtd_transacoes int;
  qtd_investimentos int;
  qtd_reservados int;
begin
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'nao autorizado - somente service_role pode atualizar contas Pluggy';
  END IF;

  insert into public.pluggy_conexoes (item_id, banco, status, atualizado_em)
  select c->>'item_id', c->>'banco', c->>'status', nullif(c->>'atualizado_em','')::timestamptz
  from jsonb_array_elements(coalesce(contas->'conexoes','[]'::jsonb)) c
  on conflict (item_id) do update set
    banco = excluded.banco,
    status = excluded.status,
    atualizado_em = excluded.atualizado_em;

  with contas_expandidas as (
    select
      c->>'item_id' as conexao_id,
      coalesce(nullif(ac.a->>'id',''), md5((c->>'item_id') || '|' || coalesce(ac.a->>'numero','') || '|' || coalesce(ac.a->>'nome',''))) as conta_id,
      ac.a as conta_json
    from jsonb_array_elements(coalesce(contas->'conexoes','[]'::jsonb)) c,
         jsonb_array_elements(coalesce(c->'contas','[]'::jsonb)) ac(a)
  )
  insert into public.pluggy_contas (id, conexao_id, numero, tipo, subtipo, nome, saldo, moeda,
    limite_total, limite_disponivel, fatura_vencimento_atual, fatura_valor_total, fatura_pagamento_minimo,
    qtd_transacoes_sincronizadas)
  select distinct on (conta_id)
    conta_id, conexao_id,
    conta_json->>'numero', conta_json->>'tipo', conta_json->>'subtipo', conta_json->>'nome',
    (conta_json->>'saldo')::numeric, conta_json->>'moeda',
    (conta_json->>'limite_total')::numeric, (conta_json->>'limite_disponivel')::numeric,
    nullif(conta_json->>'fatura_vencimento_atual','')::date,
    (conta_json->'fatura_mes_atual'->>'valor_total')::numeric,
    (conta_json->'fatura_mes_atual'->>'pagamento_minimo')::numeric,
    coalesce((conta_json->>'qtd_transacoes')::int, jsonb_array_length(coalesce(conta_json->'transacoes_recentes','[]'::jsonb)))
  from contas_expandidas
  on conflict (id) do update set
    conexao_id = excluded.conexao_id,
    numero = excluded.numero,
    tipo = excluded.tipo,
    subtipo = excluded.subtipo,
    nome = excluded.nome,
    saldo = excluded.saldo,
    moeda = excluded.moeda,
    limite_total = excluded.limite_total,
    limite_disponivel = excluded.limite_disponivel,
    fatura_vencimento_atual = excluded.fatura_vencimento_atual,
    fatura_valor_total = excluded.fatura_valor_total,
    fatura_pagamento_minimo = excluded.fatura_pagamento_minimo,
    qtd_transacoes_sincronizadas = excluded.qtd_transacoes_sincronizadas;

  with contas_expandidas as (
    select
      c->>'item_id' as conexao_id,
      coalesce(nullif(ac.a->>'id',''), md5((c->>'item_id') || '|' || coalesce(ac.a->>'numero','') || '|' || coalesce(ac.a->>'nome',''))) as conta_id,
      ac.a as conta_json
    from jsonb_array_elements(coalesce(contas->'conexoes','[]'::jsonb)) c,
         jsonb_array_elements(coalesce(c->'contas','[]'::jsonb)) ac(a)
  ),
  transacoes_expandidas as (
    select
      ce.conta_id,
      t.a as tx_json
    from contas_expandidas ce,
         jsonb_array_elements(coalesce(ce.conta_json->'transacoes_recentes','[]'::jsonb)) t(a)
  ),
  transacoes_dedup as (
    select distinct on (tx_id)
      tx_id, conta_id, data_tx, descricao, valor, categoria, status
    from (
      select
        coalesce(nullif(tx_json->>'id',''), md5(conta_id || '|' || coalesce(tx_json->>'data','') || '|' || coalesce(tx_json->>'valor','') || '|' || coalesce(tx_json->>'descricao',''))) as tx_id,
        conta_id,
        nullif(tx_json->>'data','')::timestamptz as data_tx,
        tx_json->>'descricao' as descricao,
        (tx_json->>'valor')::numeric as valor,
        tx_json->>'categoria' as categoria,
        tx_json->>'status' as status
      from transacoes_expandidas
    ) sub
  )
  insert into public.pluggy_transacoes (id, conta_id, data, descricao, valor, categoria, status,
    primeiro_visto_em, qtd_sincronizacoes, ultima_sincronizacao_em)
  select
    tx_id, conta_id, data_tx, descricao, valor, categoria, status,
    now(), 1, now()
  from transacoes_dedup
  on conflict (id) do update set
    conta_id = excluded.conta_id,
    data = excluded.data,
    descricao = excluded.descricao,
    valor = excluded.valor,
    categoria = excluded.categoria,
    status_anterior = case
      when pluggy_transacoes.status is distinct from excluded.status
      then pluggy_transacoes.status
      else pluggy_transacoes.status_anterior
    end,
    status_mudou_em = case
      when pluggy_transacoes.status is distinct from excluded.status
      then now()
      else pluggy_transacoes.status_mudou_em
    end,
    status = excluded.status,
    qtd_sincronizacoes = pluggy_transacoes.qtd_sincronizacoes + 1,
    ultima_sincronizacao_em = now();

  with investimentos_expandidos as (
    select
      c->>'item_id' as conexao_id,
      coalesce(nullif(inv.i->>'id',''), md5((c->>'item_id') || '|' || coalesce(inv.i->>'nome','') || '|' || coalesce(inv.i->>'tipo',''))) as investimento_id,
      inv.i as inv_json
    from jsonb_array_elements(coalesce(contas->'conexoes','[]'::jsonb)) c,
         jsonb_array_elements(coalesce(c->'investimentos','[]'::jsonb)) inv(i)
  )
  insert into public.pluggy_investimentos (id, conexao_id, tipo, nome, valor, instituicao, atualizado_em)
  select distinct on (investimento_id)
    investimento_id, conexao_id,
    inv_json->>'tipo', inv_json->>'nome', (inv_json->>'valor')::numeric, inv_json->>'instituicao',
    now()
  from investimentos_expandidos
  on conflict (id) do update set
    conexao_id = excluded.conexao_id,
    tipo = excluded.tipo,
    nome = excluded.nome,
    valor = excluded.valor,
    instituicao = excluded.instituicao,
    atualizado_em = now();

  -- NOVO 13/08/2026 (achado do usuario via dashboard Pluggy: bankData.reservedBalances - "saldo
  -- reservado"/cofrinhos nomeados dentro de contas BANK, ex. Mercado Pago). id = identificacao real
  -- da Pluggy quando existir, senao hash conta+nome (mesmo padrao ja usado pra contas/investimentos).
  with contas_expandidas as (
    select
      c->>'item_id' as conexao_id,
      coalesce(nullif(ac.a->>'id',''), md5((c->>'item_id') || '|' || coalesce(ac.a->>'numero','') || '|' || coalesce(ac.a->>'nome',''))) as conta_id,
      ac.a as conta_json
    from jsonb_array_elements(coalesce(contas->'conexoes','[]'::jsonb)) c,
         jsonb_array_elements(coalesce(c->'contas','[]'::jsonb)) ac(a)
  ),
  reservados_expandidos as (
    select
      ce.conta_id,
      r.a as res_json
    from contas_expandidas ce,
         jsonb_array_elements(coalesce(ce.conta_json->'saldos_reservados','[]'::jsonb)) r(a)
  )
  insert into public.pluggy_saldos_reservados (id, conta_id, nome, identificacao, valor, moeda, atualizado_em)
  select distinct on (reservado_id)
    reservado_id, conta_id, nome, identificacao, valor, moeda, now()
  from (
    select
      coalesce(nullif(res_json->>'identificacao',''), md5(conta_id || '|' || coalesce(res_json->>'nome',''))) as reservado_id,
      conta_id,
      res_json->>'nome' as nome,
      res_json->>'identificacao' as identificacao,
      (res_json->>'valor')::numeric as valor,
      res_json->>'moeda' as moeda
    from reservados_expandidos
  ) sub
  on conflict (id) do update set
    conta_id = excluded.conta_id,
    nome = excluded.nome,
    identificacao = excluded.identificacao,
    valor = excluded.valor,
    moeda = excluded.moeda,
    atualizado_em = now();

  select count(*) into qtd_conexoes from public.pluggy_conexoes;
  select count(*) into qtd_contas from public.pluggy_contas;
  select count(*) into qtd_transacoes from public.pluggy_transacoes;
  select count(*) into qtd_investimentos from public.pluggy_investimentos;
  select count(*) into qtd_reservados from public.pluggy_saldos_reservados;

  return jsonb_build_object('conexoes', qtd_conexoes, 'contas', qtd_contas, 'transacoes', qtd_transacoes, 'investimentos', qtd_investimentos, 'saldos_reservados', qtd_reservados);
end;
$$;


--
-- Name: consultar_solar_compartilhado(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consultar_solar_compartilhado(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  compartilhamento record;
  leituras jsonb;
  geracao_diaria jsonb;
  ciclo_aberto jsonb;
  ciclos_fechados jsonb;
BEGIN
  SELECT * INTO compartilhamento FROM solar_compartilhamentos WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'link invalido';
  END IF;
  IF NOT compartilhamento.ativo THEN
    RAISE EXCEPTION 'link desativado';
  END IF;
  IF compartilhamento.expira_em < now() THEN
    RAISE EXCEPTION 'link expirado';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'data', l.data, 'leitura03', l.leitura_03, 'leitura103', l.leitura_103,
    'geracaoAcumulada', l.geracao_acumulada
  ) ORDER BY l.data ASC)
  INTO leituras
  FROM energia_solar_leituras l WHERE l.casa = 'mae';

  SELECT jsonb_agg(jsonb_build_object('data', g.data, 'kwh', g.geracao_kwh) ORDER BY g.data ASC)
  INTO geracao_diaria
  FROM energia_solar_geracao_diaria g;

  SELECT to_jsonb(c) INTO ciclo_aberto FROM vw_ciclo_solar_aberto c LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'dataInicio', c.data_inicio, 'dataFim', c.data_fim,
    'creditoLiquidoKwh', c.credito_liquido_kwh,
    'creditoWallaceKwh', c.credito_wallace_kwh, 'creditoIrmaKwh', c.credito_irma_kwh
  ) ORDER BY c.data_inicio ASC)
  INTO ciclos_fechados
  FROM ciclos_solares c WHERE c.status = 'fechado';

  RETURN jsonb_build_object(
    'leituras', COALESCE(leituras, '[]'::jsonb),
    'geracaoDiaria', COALESCE(geracao_diaria, '[]'::jsonb),
    'cicloAberto', ciclo_aberto,
    'ciclosFechados', COALESCE(ciclos_fechados, '[]'::jsonb),
    'expiraEm', compartilhamento.expira_em
  );
END;
$$;


--
-- Name: criar_backup_completo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_backup_completo() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_conteudo jsonb := '{}'::jsonb;
  v_tabela text;
  v_dados jsonb;
  v_erro text;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'nao autorizado - criar_backup_completo e operacao administrativa, somente service_role ou execucao direta no banco (cron)';
  END IF;

  FOR v_tabela IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'backups'
  LOOP
    BEGIN
      EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t', v_tabela) INTO v_dados;
      v_conteudo := v_conteudo || jsonb_build_object(v_tabela, v_dados);
    EXCEPTION WHEN OTHERS THEN
      v_erro := coalesce(v_erro || '; ', '') || v_tabela || ': ' || SQLERRM;
    END;
  END LOOP;

  INSERT INTO public.backups (conteudo, tamanho_bytes, erro)
  VALUES (v_conteudo, pg_column_size(v_conteudo), v_erro)
  RETURNING id INTO v_id;

  INSERT INTO public.execucoes_jobs (job_nome, status, detalhe)
  VALUES ('backup', CASE WHEN v_erro IS NULL THEN 'sucesso' ELSE 'erro' END, v_erro);

  DELETE FROM public.backups
  WHERE id NOT IN (SELECT id FROM public.backups ORDER BY criado_em DESC LIMIT 14);

  RETURN v_id;
END;
$$;


--
-- Name: criar_categoria(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_categoria(p_nome text, p_tipo text DEFAULT 'extraordinaria'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE novo_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para criar categoria';
  END IF;
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RAISE EXCEPTION 'nome obrigatorio'; END IF;
  IF p_tipo NOT IN ('recorrente','extraordinaria') THEN RAISE EXCEPTION 'tipo invalido: %', p_tipo; END IF;
  SELECT id INTO novo_id FROM categorias WHERE lower(nome) = lower(trim(p_nome));
  IF novo_id IS NOT NULL THEN RETURN novo_id; END IF;
  INSERT INTO categorias(nome, tipo) VALUES (trim(p_nome), p_tipo) RETURNING id INTO novo_id;
  RETURN novo_id;
END; $$;


--
-- Name: criar_compartilhamento_solar(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_compartilhamento_solar(p_validade_dias integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE novo_token text; nova_expira timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido exigido para criar compartilhamento';
  END IF;
  IF p_validade_dias IS NULL OR p_validade_dias < 1 OR p_validade_dias > 365 THEN
    RAISE EXCEPTION 'validade_dias precisa estar entre 1 e 365';
  END IF;
  -- gen_random_uuid() e nativo (Postgres 13+), sem depender da extensao pgcrypto (gen_random_bytes)
  -- que nao esta habilitada neste projeto. 2 UUIDs concatenados sem hifen = 64 caracteres hex,
  -- entropia equivalente a 256 bits, mais que suficiente pra um token nao-adivinhavel.
  novo_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  nova_expira := now() + (p_validade_dias || ' days')::interval;
  INSERT INTO solar_compartilhamentos (token, expira_em) VALUES (novo_token, nova_expira);
  RETURN jsonb_build_object('token', novo_token, 'expira_em', nova_expira);
END;
$$;


--
-- Name: desativar_compartilhamento_solar(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desativar_compartilhamento_solar(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE atualizadas int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido exigido para desativar compartilhamento';
  END IF;
  UPDATE solar_compartilhamentos SET ativo = false WHERE token = p_token;
  GET DIAGNOSTICS atualizadas = ROW_COUNT;
  RETURN jsonb_build_object('desativado', atualizadas > 0);
END;
$$;


--
-- Name: diagnostico_sync_v1_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.diagnostico_sync_v1_v2() RETURNS TABLE(livro text, tx text, nome text, valor numeric, data text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH livros AS (
    SELECT 'LRW_TRANSACOES' AS livro UNION ALL SELECT 'LRV_TRANSACOES'
    UNION ALL SELECT 'LRC_LIMBO_TRANSACOES' UNION ALL SELECT 'PV_TRANSACOES'
    UNION ALL SELECT 'LRPV_TRANSACOES' UNION ALL SELECT 'BOLETOS_TRANSACOES'
    UNION ALL SELECT 'CAIXA_LANCE_TRANSACOES' UNION ALL SELECT 'MANUTENCAO_TRANSACOES'
    UNION ALL SELECT 'ANIVERSARIO_JULIO_TRANSACOES' UNION ALL SELECT 'EVENTOS_TRANSACOES'
    UNION ALL SELECT 'SAUDE_FAMILIA_TRANSACOES' UNION ALL SELECT 'SEGURO_EMPLACAMENTO_TRANSACOES'
    UNION ALL SELECT 'COMBUSTIVEL_TRANSACOES' UNION ALL SELECT 'CHURRASCO_TRANSACOES'
    UNION ALL SELECT 'MASTERCARD_INFINITE_TRANSACOES' UNION ALL SELECT 'BENS_DURAVEIS_TRANSACOES'
    UNION ALL SELECT 'CAIXA_VARIAVEL_TRANSACOES_SALDO_REAL' UNION ALL SELECT 'ESCOLA_JULIO_TRANSACOES'
  ),
  itens AS (
    SELECT l.livro, (t->>'tx') AS tx, (t->>'nome') AS nome,
           (t->>'valor')::numeric AS valor, (t->>'data') AS data
    FROM livros l, wallace_dados w, jsonb_array_elements(w.dados->l.livro) t
    WHERE (t->>'tx') IS NOT NULL
      AND (t->>'nome') NOT ILIKE 'Ajuste de reconciliação%'
      AND (t->>'nome') NOT ILIKE 'Rendimento acumulado%'
  )
  SELECT i.livro, i.tx, i.nome, i.valor, i.data
  FROM itens i
  WHERE NOT EXISTS (
    SELECT 1 FROM transacoes tr
    WHERE tr.tx_legado = i.tx AND tr.valor = i.valor
  )
  ORDER BY i.livro, i.data;
$$;


--
-- Name: fechar_ciclo_solar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fechar_ciclo_solar(p_leitura_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ciclo ciclos_solares%ROWTYPE; v_leitura energia_solar_leituras%ROWTYPE;
  v_rw numeric; v_ri numeric; v_novo_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para fechar ciclo solar';
  END IF;

  SELECT * INTO v_leitura FROM energia_solar_leituras WHERE id = p_leitura_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leitura % não encontrada', p_leitura_id; END IF;

  IF NOT v_leitura.eh_leitura_oficial_energisa THEN
    RAISE EXCEPTION 'Leitura % não está marcada como leitura oficial Energisa (eh_leitura_oficial_energisa=false) — sem evidência de fonte externa, não fecha ciclo', p_leitura_id;
  END IF;

  IF v_leitura.evidencia IS NULL OR length(trim(v_leitura.evidencia)) = 0 THEN
    RAISE EXCEPTION 'Leitura % marcada oficial mas sem evidência preenchida — fechamento requer fonte externa registrada', p_leitura_id;
  END IF;

  IF EXISTS (SELECT 1 FROM ciclos_solares WHERE leitura_fechamento_id = p_leitura_id) THEN
    RAISE EXCEPTION 'Leitura % já fechou um ciclo anteriormente', p_leitura_id;
  END IF;

  SELECT * INTO v_ciclo FROM ciclos_solares WHERE status = 'aberto' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhum ciclo aberto — verifique bootstrap de ciclos_solares'; END IF;

  IF v_leitura.data <= v_ciclo.data_inicio THEN
    RAISE EXCEPTION 'Leitura de fechamento (%) não pode ser anterior/igual ao início do ciclo aberto (%)', v_leitura.data, v_ciclo.data_inicio;
  END IF;

  SELECT valor INTO v_rw FROM indicadores WHERE nome = 'SOLAR_RATEIO - wallace';
  SELECT valor INTO v_ri FROM indicadores WHERE nome = 'SOLAR_RATEIO - irma';

  UPDATE ciclos_solares SET
    status = 'fechado', data_fim = v_leitura.data, leitura_fechamento_id = v_leitura.id,
    leitura_03_fim = v_leitura.leitura_03, leitura_103_fim = v_leitura.leitura_103,
    credito_liquido_kwh = (v_leitura.leitura_103 - v_leitura.leitura_03) - (leitura_103_inicio - leitura_03_inicio),
    credito_wallace_kwh = ((v_leitura.leitura_103 - v_leitura.leitura_03) - (leitura_103_inicio - leitura_03_inicio)) * v_rw,
    credito_irma_kwh    = ((v_leitura.leitura_103 - v_leitura.leitura_03) - (leitura_103_inicio - leitura_03_inicio)) * v_ri,
    fechado_em = now()
  WHERE id = v_ciclo.id;

  UPDATE energia_solar_leituras SET ciclo_id = v_ciclo.id WHERE ciclo_id IS NULL AND data <= v_leitura.data;

  INSERT INTO ciclos_solares (data_inicio, leitura_inicio_id, leitura_03_inicio, leitura_103_inicio, rateio_wallace_pct, rateio_irma_pct, status)
  VALUES (v_leitura.data, v_leitura.id, v_leitura.leitura_03, v_leitura.leitura_103, v_rw, v_ri, 'aberto')
  RETURNING id INTO v_novo_id;

  UPDATE energia_solar_leituras SET ciclo_id = v_novo_id WHERE id = v_leitura.id;
  RETURN v_novo_id;
END;
$$;


--
-- Name: FUNCTION fechar_ciclo_solar(p_leitura_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fechar_ciclo_solar(p_leitura_id uuid) IS 'Fecha o ciclo solar aberto usando uma leitura oficial Energisa (eh_leitura_oficial_energisa=true, evidencia obrigatória) e abre o próximo ciclo automaticamente. Nunca fecha por inferência de data.';


--
-- Name: fn_audit_log_generic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_log_generic() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  campo_nome text;
  valor_antigo text;
  valor_novo_v text;
  origem_sessao text;
  origem_efetiva text;
  usuario_efetivo text;
  linha_para_inferir jsonb;
begin
  origem_sessao := nullif(current_setting('audit.origem', true), '');
  usuario_efetivo := nullif(current_setting('audit.usuario', true), '');
  linha_para_inferir := to_jsonb(coalesce(new, old));

  if origem_sessao is not null then
    origem_efetiva := origem_sessao;
  elsif tg_table_name = 'transacoes' and linha_para_inferir ? 'origem' then
    origem_efetiva := case linha_para_inferir->>'origem'
      when 'pluggy' then 'sincronizacao'
      when 'mercado_pago' then 'sincronizacao'
      when 'reconciliacao' then 'importacao'
      when 'manual' then 'formulario'
      else 'sistema'
    end;
  else
    origem_efetiva := 'sistema';
  end if;

  if tg_op = 'INSERT' then
    insert into public.audit_log(tabela, registro_id, operacao, campo, valor_anterior, valor_novo, origem, alterado_por)
    values (tg_table_name, new.id, 'INSERT', null, null, to_jsonb(new)::text, origem_efetiva, usuario_efetivo);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log(tabela, registro_id, operacao, campo, valor_anterior, valor_novo, origem, alterado_por)
    values (tg_table_name, old.id, 'DELETE', null, to_jsonb(old)::text, null, origem_efetiva, usuario_efetivo);
    return old;
  elsif tg_op = 'UPDATE' then
    for campo_nome in select key from jsonb_each(to_jsonb(new)) loop
      valor_antigo := (to_jsonb(old)->>campo_nome);
      valor_novo_v := (to_jsonb(new)->>campo_nome);
      if valor_antigo is distinct from valor_novo_v then
        insert into public.audit_log(tabela, registro_id, operacao, campo, valor_anterior, valor_novo, origem, alterado_por)
        values (tg_table_name, new.id, 'UPDATE', campo_nome, valor_antigo, valor_novo_v, origem_efetiva, usuario_efetivo);
      end if;
    end loop;
    return new;
  end if;
  return null;
end;
$$;


--
-- Name: fn_auto_categorizar_transacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auto_categorizar_transacao() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_categoria_id uuid;
BEGIN
  IF NEW.categoria_id IS NULL AND NEW.descricao IS NOT NULL THEN
    SELECT r.categoria_id INTO v_categoria_id
    FROM regras_classificacao r
    WHERE r.ativo = true
      AND r.resultado = 'classificar'
      AND r.categoria_id IS NOT NULL
      AND r.estabelecimento_contem IS NOT NULL
      AND NEW.descricao ILIKE '%' || r.estabelecimento_contem || '%'
    ORDER BY r.prioridade ASC
    LIMIT 1;

    IF v_categoria_id IS NOT NULL THEN
      NEW.categoria_id := v_categoria_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_parse_data_v1(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_parse_data_v1(p_data text) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
begin
  if p_data is null or p_data = '' then return null; end if;
  -- YYYY-MM-DD
  if p_data ~ '^\d{4}-\d{2}-\d{2}$' then
    return p_data::date;
  end if;
  -- DD/MM/YYYY
  if p_data ~ '^\d{2}/\d{2}/\d{4}$' then
    return to_date(p_data, 'DD/MM/YYYY');
  end if;
  -- DD/MM (assume 2026 - único ano existente nos dados desta migração)
  if p_data ~ '^\d{2}/\d{2}$' then
    return to_date(p_data || '/2026', 'DD/MM/YYYY');
  end if;
  return null;
exception when others then
  return null;
end;
$_$;


--
-- Name: gerar_tx_legado_automatico(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gerar_tx_legado_automatico() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_max int;
BEGIN
  IF NEW.tx_legado IS NULL THEN
    SELECT COALESCE(MAX((substring(tx_legado from 3))::int), 0) INTO v_max
    FROM transacoes
    WHERE tx_legado ~ '^TX[0-9]{6}$';
    NEW.tx_legado := 'TX' || lpad((v_max + 1)::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$_$;


--
-- Name: lancar_reservas_pluggy(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lancar_reservas_pluggy(reservas jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  qtd_inseridas int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'nao autorizado - somente service_role pode lancar reservas Pluggy';
  end if;

  with inseridas as (
    insert into public.transacoes (data, descricao, valor, tipo, caixa_id, origem, status, pluggy_tx_id)
    select
      nullif(r->>'data','')::date,
      r->>'descricao',
      (r->>'valor')::numeric,
      r->>'tipo',
      (r->>'caixa_id')::uuid,
      'pluggy',
      'confirmado',
      r->>'pluggy_tx_id'
    from jsonb_array_elements(reservas) r
    on conflict (pluggy_tx_id) do nothing
    returning 1
  )
  select count(*) into qtd_inseridas from inseridas;

  return jsonb_build_object('inseridas', qtd_inseridas);
end;
$$;


--
-- Name: lancar_transacao_manual(date, text, numeric, text, uuid, uuid, uuid, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lancar_transacao_manual(p_data date, p_descricao text, p_valor numeric, p_tipo text, p_caixa_id uuid, p_categoria_id uuid DEFAULT NULL::uuid, p_subcategoria_id uuid DEFAULT NULL::uuid, p_cartao_id uuid DEFAULT NULL::uuid, p_usuario_id uuid DEFAULT NULL::uuid, p_afeta_saldo_real boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE novo_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para lancar transacao';
  END IF;
  PERFORM set_config('audit.origem', 'formulario', true);
  IF p_tipo NOT IN ('entrada','saida') THEN RAISE EXCEPTION 'tipo invalido: %', p_tipo; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'valor deve ser positivo'; END IF;
  IF p_caixa_id IS NULL THEN RAISE EXCEPTION 'caixa_id obrigatorio'; END IF;
  INSERT INTO transacoes(data, descricao, valor, tipo, caixa_id, categoria_id, subcategoria_id, cartao_id, usuario_id, origem, status, afeta_saldo_real)
  VALUES (p_data, p_descricao, p_valor, p_tipo, p_caixa_id, p_categoria_id, p_subcategoria_id, p_cartao_id, p_usuario_id, 'manual', 'confirmado', p_afeta_saldo_real)
  RETURNING id INTO novo_id;
  RETURN novo_id;
END; $$;


--
-- Name: listar_compartilhamentos_solar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listar_compartilhamentos_solar() RETURNS TABLE(token text, criado_em timestamp with time zone, expira_em timestamp with time zone, ativo boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido exigido para listar compartilhamentos';
  END IF;
  RETURN QUERY SELECT s.token, s.criado_em, s.expira_em, s.ativo FROM solar_compartilhamentos s ORDER BY s.criado_em DESC;
END;
$$;


--
-- Name: marcar_atualizado_em(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_atualizado_em() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;


--
-- Name: registrar_erro_cliente(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_erro_cliente(p_mensagem text, p_stack text DEFAULT NULL::text, p_contexto jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.erros_cliente (mensagem, stack, contexto)
  values (
    left(p_mensagem, 2000),
    left(coalesce(p_stack, ''), 4000),
    p_contexto
  );
end;
$$;


--
-- Name: registrar_pib_mensal(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_pib_mensal(p_mes text, p_snapshot jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE resultado jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para registrar PIB mensal';
  END IF;
  IF p_mes IS NULL OR p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_mes invalido, esperado formato YYYY-MM: %', p_mes;
  END IF;
  INSERT INTO pib_wallace_historico (mes, snapshot, atualizado_em)
  VALUES (p_mes, p_snapshot, now())
  ON CONFLICT (mes) DO UPDATE SET snapshot = EXCLUDED.snapshot, atualizado_em = now();
  SELECT jsonb_object_agg(mes, snapshot) INTO resultado FROM pib_wallace_historico;
  RETURN resultado;
END; $_$;


--
-- Name: resolver_caixa(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolver_caixa(p_categoria_id uuid, p_usuario_id uuid, p_origem text, p_estabelecimento text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT caixa_id FROM regras_resolver_caixa
  WHERE ativo
    AND (categoria_id IS NULL OR categoria_id = p_categoria_id)
    AND (usuario_id IS NULL OR usuario_id = p_usuario_id)
    AND (origem IS NULL OR origem = p_origem)
    AND (estabelecimento_contem IS NULL OR (p_estabelecimento IS NOT NULL AND p_estabelecimento ILIKE '%'||estabelecimento_contem||'%'))
  ORDER BY prioridade ASC,
    -- regra mais especifica (menos coringas, incluindo o novo campo) vence em empate de prioridade
    (categoria_id IS NOT NULL)::int + (usuario_id IS NOT NULL)::int + (origem IS NOT NULL)::int + (estabelecimento_contem IS NOT NULL)::int DESC
  LIMIT 1;
$$;


--
-- Name: resolver_usuario_por_cartao(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolver_usuario_por_cartao(p_cartao_id uuid) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(dono_real_id, usuario_id) FROM cartoes WHERE id = p_cartao_id;
$$;


--
-- Name: resolver_usuario_por_conta(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolver_usuario_por_conta(p_numero text) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT usuario_id FROM contas_bancarias WHERE numero = p_numero LIMIT 1;
$$;


--
-- Name: restaurar_backup(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restaurar_backup(p_backup_id uuid, p_confirmar boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_conteudo jsonb;
  v_tabela text;
  v_relatorio jsonb := '{}'::jsonb;
  v_qtd int;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'nao autorizado - restaurar_backup e operacao administrativa, somente service_role ou execucao direta no banco';
  END IF;
  IF NOT p_confirmar THEN
    RAISE EXCEPTION 'operacao destrutiva - chame com p_confirmar=true depois de validar o backup_id (SOBRESCREVE dados atuais)';
  END IF;

  SELECT conteudo INTO v_conteudo FROM public.backups WHERE id = p_backup_id;
  IF v_conteudo IS NULL THEN
    RAISE EXCEPTION 'backup % nao encontrado', p_backup_id;
  END IF;

  SET LOCAL session_replication_role = replica;

  FOR v_tabela IN SELECT jsonb_object_keys(v_conteudo)
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I', v_tabela);
      EXECUTE format(
        'INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(null::public.%I, $1)',
        v_tabela, v_tabela
      ) USING (v_conteudo -> v_tabela);
      GET DIAGNOSTICS v_qtd = ROW_COUNT;
      v_relatorio := v_relatorio || jsonb_build_object(v_tabela, v_qtd);
    EXCEPTION WHEN OTHERS THEN
      v_relatorio := v_relatorio || jsonb_build_object(v_tabela, 'ERRO: ' || SQLERRM);
    END;
  END LOOP;

  RETURN v_relatorio;
END;
$_$;


--
-- Name: rpc_dashboard_resumo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_dashboard_resumo() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  with ciclo as (
    select case when extract(day from current_date) >= 25
      then date_trunc('month', current_date) + interval '23 days'
      else date_trunc('month', current_date - interval '1 month') + interval '23 days'
    end::date as inicio_ciclo
  ),
  caixas_calc as (
    select c.id, c.nome,
      round(coalesce(c.saldo_inicial_ciclo,0) + coalesce((
        select sum(case when t.tipo='entrada' then t.valor else -t.valor end)
        from transacoes t, ciclo
        where t.caixa_id = c.id and t.status='confirmado' and t.afeta_saldo_real is true
          and t.data >= ciclo.inicio_ciclo),0), 2) as saldo_real_ciclo_atual
    from caixas c
  ),
  meta_milhao_calc as (
    select
      coalesce((select valor from patrimonio where tipo='reserva' and natureza='ativo' and data_snapshot=(select max(data_snapshot) from patrimonio) limit 1),0)
      + coalesce((select valor from patrimonio where tipo='investimento' and natureza='ativo' and valor=14779.62 and data_snapshot=(select max(data_snapshot) from patrimonio) limit 1),0)
      + coalesce((select saldo_real_ciclo_atual from caixas_calc where nome='Caixa Lance' limit 1),0)
      + coalesce((select valor from patrimonio where tipo='investimento' and natureza='ativo' and valor=429.75 and data_snapshot=(select max(data_snapshot) from patrimonio) limit 1),0)
    as calculado
  )
  select jsonb_build_object(
    'caixas', (select coalesce(jsonb_agg(jsonb_build_object('id', cc.id, 'nome', cc.nome, 'tipo', c.tipo,
        'saldo', coalesce((select round(sum(case when t.tipo='entrada' then t.valor else -t.valor end),2)
          from transacoes t where t.caixa_id = c.id and t.status='confirmado'),0),
        'saldo_real_ciclo_atual', cc.saldo_real_ciclo_atual
      ) order by cc.nome), '[]'::jsonb) from caixas_calc cc join caixas c on c.id=cc.id
    ),
    'patrimonio_resumo', (
      select jsonb_build_object(
        'total_ativo', coalesce(sum(valor) filter (where natureza='ativo'),0),
        'total_passivo', coalesce(sum(valor) filter (where natureza='passivo'),0),
        'liquido', coalesce(sum(valor) filter (where natureza='ativo'),0) - coalesce(sum(valor) filter (where natureza='passivo'),0)
      ) from patrimonio where data_snapshot = (select max(data_snapshot) from patrimonio)
    ),
    'investimentos', (
      select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'quantidade', quantidade,
        'valor_atual', valor_atual, 'data_atualizacao', data_atualizacao) order by valor_atual desc), '[]'::jsonb)
      from investimentos
    ),
    'metas', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'valor_alvo', valor_alvo, 'valor_atual', valor_atual,
        'pct', case when valor_alvo>0 then round(valor_atual/valor_alvo*100,2) else 0 end)), '[]'::jsonb) from metas
    ),
    'indicadores_recentes', (
      select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'valor', valor, 'data', data_calculo)), '[]'::jsonb)
      from (select distinct on (nome) nome, valor, data_calculo from indicadores order by nome, data_calculo desc) x
    ),
    'reembolsos_resumo', (
      select coalesce(jsonb_agg(jsonb_build_object('origem', origem, 'a_receber', valor_a_receber,
        'recebido', valor_recebido, 'status', status)), '[]'::jsonb) from reembolsos
    ),
    'kpis', jsonb_build_object(
      'total_transacoes', (select count(*) from transacoes),
      'transacoes_sem_categoria', (select count(*) from transacoes where categoria_id is null),
      'transacoes_confirmadas', (select count(*) from transacoes where status='confirmado'),
      'transacoes_sem_classificacao_saldo_real', (select count(*) from transacoes where afeta_saldo_real is null)
    ),
    'avisos', (
      select coalesce(jsonb_agg(aviso), '[]'::jsonb) from (
        select 'patrimonio: ' || count(*) || ' item(ns) com data_snapshot mais antiga que a mais recente (' ||
          (select max(data_snapshot) from patrimonio) || ') - pode estar sumindo do resumo sem querer' as aviso
        from patrimonio where data_snapshot <> (select max(data_snapshot) from patrimonio)
        having count(*) > 0
        union all
        select 'caixas: ' || count(*) || ' caixa(s) nunca calibrada(s) com dado real (saldo_inicial_calibrado=false)' as aviso
        from caixas where saldo_inicial_calibrado = false
        having count(*) > 0
        union all
        select 'transacoes: ' || count(*) || ' com afeta_saldo_real ainda não classificado' as aviso
        from transacoes where afeta_saldo_real is null
        having count(*) > 0
        union all
        select 'Meta do Milhão: registrado R$' || m.valor_atual || ' mas Reserva+BTG+CaixaLance+NectonCC calcula R$' || mc.calculado || ' (diff R$' || round(abs(m.valor_atual-mc.calculado),2) || ') - provavelmente defasado' as aviso
        from metas m, meta_milhao_calc mc
        where m.nome='Meta do Milhão' and abs(m.valor_atual - mc.calculado) > 0.5
        union all
        select 'transacoes: ' || count(*) || ' grupo(s) de duplicata exata (mesmo tx_legado+valor+data+caixa)' as aviso
        from (select tx_legado, valor, data, caixa_id from transacoes where tx_legado is not null
          group by tx_legado, valor, data, caixa_id having count(*) > 1) dups
        having count(*) > 0
      ) x
    ),
    'gerado_em', now()
  );
$_$;


--
-- Name: sincronizar_v1_v2(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_v1_v2(p_dry_run boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_inseridas jsonb := '[]'::jsonb;
  v_ignoradas jsonb := '[]'::jsonb;
  r record;
  v_caixa_id uuid;
  v_caixa_nome text;
  v_categoria_id uuid;
  v_tipo text;
  v_status text;
  v_new_id uuid;
  v_ja_existe boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'nao autorizado - sincronizar_v1_v2 e funcao administrativa, somente service_role';
  END IF;

  IF NOT p_dry_run THEN
    PERFORM set_config('audit.origem', 'sincronizacao', true);
  END IF;

  FOR r IN SELECT * FROM diagnostico_sync_v1_v2() ORDER BY livro, data
  LOOP
    v_caixa_id := NULL;
    v_caixa_nome := NULL;
    v_categoria_id := NULL;
    v_tipo := NULL;

    IF r.tx = 'TX000208' THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'tx_legado', r.tx, 'livro', r.livro, 'valor', r.valor,
        'motivo', 'pendencia formal de governanca: colisao de tx_legado (PLANO_UNIFICACAO_V1_V2.md secao 16) - exclusao temporaria ate decisao'
      );
      CONTINUE;
    END IF;

    SELECT c.id, m.caixa_nome INTO v_caixa_id, v_caixa_nome
    FROM v1_v2_caixa_mapa m JOIN caixas c ON c.nome = m.caixa_nome
    WHERE m.v1_array_key = r.livro AND m.confiavel;

    IF v_caixa_id IS NULL THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'tx_legado', r.tx, 'livro', r.livro, 'valor', r.valor,
        'motivo', 'livro sem mapeamento confiavel em v1_v2_caixa_mapa (exclusao estrutural, cobre LRW_TRANSACOES/LRV_TRANSACOES)'
      );
      CONTINUE;
    END IF;

    SELECT EXISTS(SELECT 1 FROM transacoes tr WHERE tr.tx_legado = r.tx AND tr.caixa_id = v_caixa_id) INTO v_ja_existe;
    IF v_ja_existe THEN
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'tx_legado', r.tx, 'caixa_nome', v_caixa_nome, 'valor', r.valor,
        'motivo', 'ja existe em transacoes para este par tx_legado+caixa_id'
      );
      CONTINUE;
    END IF;

    SELECT lower(COALESCE(elem->>'tipo','saida')) INTO v_tipo
    FROM wallace_dados w, jsonb_array_elements(w.dados->r.livro) elem
    WHERE w.id = 1 AND elem->>'tx' = r.tx LIMIT 1;
    v_tipo := CASE WHEN v_tipo LIKE '%entrada%' THEN 'entrada' ELSE 'saida' END;

    SELECT categoria_id INTO v_categoria_id
    FROM regras_classificacao
    WHERE ativo AND estabelecimento_contem IS NOT NULL
      AND upper(r.nome) LIKE '%'||upper(estabelecimento_contem)||'%'
    ORDER BY prioridade ASC LIMIT 1;

    v_status := CASE WHEN v_categoria_id IS NOT NULL THEN 'confirmado' ELSE 'pendente_classificacao' END;

    IF p_dry_run THEN
      v_inseridas := v_inseridas || jsonb_build_object(
        'tx_legado', r.tx, 'caixa_nome', v_caixa_nome, 'valor', r.valor, 'data', r.data,
        'tipo', v_tipo, 'status_previsto', v_status, 'categoria_id', v_categoria_id, 'simulado', true
      );
    ELSE
      v_new_id := NULL;
      INSERT INTO transacoes (tx_legado, caixa_id, data, valor, tipo, descricao, origem, status, afeta_saldo_real, categoria_id)
      VALUES (r.tx, v_caixa_id, fn_parse_data_v1(r.data), r.valor, v_tipo, r.nome, 'reconciliacao', v_status, true, v_categoria_id)
      ON CONFLICT (tx_legado, caixa_id) DO NOTHING
      RETURNING id INTO v_new_id;

      IF v_new_id IS NOT NULL THEN
        v_inseridas := v_inseridas || jsonb_build_object(
          'tx_legado', r.tx, 'caixa_nome', v_caixa_nome, 'valor', r.valor, 'status', v_status, 'id', v_new_id
        );
      ELSE
        v_ignoradas := v_ignoradas || jsonb_build_object(
          'tx_legado', r.tx, 'caixa_nome', v_caixa_nome, 'valor', r.valor,
          'motivo', 'ON CONFLICT DO NOTHING acionado (execucao concorrente)'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'modo', CASE WHEN p_dry_run THEN 'dry_run' ELSE 'aplicado' END,
    'executado_em', now(),
    'qtd_inseridas', jsonb_array_length(v_inseridas), 'inseridas', v_inseridas,
    'qtd_ignoradas', jsonb_array_length(v_ignoradas), 'ignoradas', v_ignoradas
  );
END;
$$;


--
-- Name: triar_mercadopago_evento(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.triar_mercadopago_evento(p_id text, p_status_triagem text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE atualizado_count int;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para triar evento';
  END IF;
  IF p_status_triagem NOT IN ('pendente','aprovado','rejeitado') THEN
    RAISE EXCEPTION 'status_triagem invalido: %', p_status_triagem;
  END IF;
  UPDATE mercadopago_eventos SET status_triagem = p_status_triagem, atualizado_em = now() WHERE id = p_id;
  GET DIAGNOSTICS atualizado_count = ROW_COUNT;
  IF atualizado_count = 0 THEN
    RAISE EXCEPTION 'evento % nao encontrado em mercadopago_eventos (V2)', p_id;
  END IF;
  RETURN jsonb_build_object('id', p_id, 'status_triagem', p_status_triagem);
END;
$$;


--
-- Name: triar_pluggy_item(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.triar_pluggy_item(p_id_externo text, p_status_triagem text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para triar item';
  END IF;
  IF p_status_triagem NOT IN ('pendente','aprovado','rejeitado') THEN
    RAISE EXCEPTION 'status_triagem invalido: %', p_status_triagem;
  END IF;
  IF p_id_externo IS NULL OR length(p_id_externo) = 0 THEN
    RAISE EXCEPTION 'p_id_externo vazio';
  END IF;
  INSERT INTO pluggy_triagem (id_externo, status_triagem, atualizado_em)
  VALUES (p_id_externo, p_status_triagem, now())
  ON CONFLICT (id_externo) DO UPDATE SET status_triagem = excluded.status_triagem, atualizado_em = now();
  RETURN jsonb_build_object('id_externo', p_id_externo, 'status_triagem', p_status_triagem);
END;
$$;


--
-- Name: validar_plausibilidade_leitura_solar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_plausibilidade_leitura_solar() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  anterior record;
  dias numeric;
  delta_03_dia numeric;
  delta_103_dia numeric;
  TETO_KWH_DIA CONSTANT numeric := 40;
BEGIN
  SELECT data, leitura_03, leitura_103 INTO anterior
  FROM energia_solar_leituras
  WHERE casa = NEW.casa AND data < NEW.data
  ORDER BY data DESC
  LIMIT 1;

  IF anterior IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.leitura_03 < anterior.leitura_03 OR NEW.leitura_103 < anterior.leitura_103 THEN
    RAISE EXCEPTION 'Leitura solar implausível: código 03/103 é cumulativo, nunca deveria diminuir (leitura anterior em %: 03=%, 103=% | nova em %: 03=%, 103=%)',
      anterior.data, anterior.leitura_03, anterior.leitura_103, NEW.data, NEW.leitura_03, NEW.leitura_103;
  END IF;

  dias := GREATEST(1, NEW.data - anterior.data);
  delta_03_dia := ROUND((NEW.leitura_03 - anterior.leitura_03) / dias, 1);
  delta_103_dia := ROUND((NEW.leitura_103 - anterior.leitura_103) / dias, 1);

  IF delta_03_dia > TETO_KWH_DIA OR delta_103_dia > TETO_KWH_DIA THEN
    RAISE EXCEPTION 'Leitura solar implausível: % kWh/dia (código 03) ou % kWh/dia (código 103) excede o teto de % kWh/dia entre % (03=%, 103=%) e % (03=%, 103=%). Confira a leitura antes de gravar.',
      delta_03_dia, delta_103_dia, TETO_KWH_DIA, anterior.data, anterior.leitura_03, anterior.leitura_103, NEW.data, NEW.leitura_03, NEW.leitura_103;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: valores_combinados_v2(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.valores_combinados_v2(p_janela_dias integer DEFAULT 5) RETURNS TABLE(valor_combinado numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with base as (
    select id, caixa_id, data, valor from transacoes where status='confirmado'
  ),
  pares as (
    select round(a.valor + b.valor, 2) as valor_combinado
    from base a join base b on b.caixa_id = a.caixa_id and b.id > a.id
      and abs(b.data - a.data) <= p_janela_dias
  ),
  triplas as (
    select round(a.valor + b.valor + c.valor, 2) as valor_combinado
    from base a
    join base b on b.caixa_id = a.caixa_id and b.id > a.id and abs(b.data - a.data) <= p_janela_dias
    join base c on c.caixa_id = a.caixa_id and c.id > b.id and abs(c.data - a.data) <= p_janela_dias
  )
  select valor_combinado from pares
  union
  select valor_combinado from triplas;
$$;


--
-- Name: verificar_hardening_views(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verificar_hardening_views() RETURNS TABLE(view_nome text, security_invoker_ok boolean, reloptions text[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_views_endurecidas text[] := array[
    'vw_compromisso_cartao_por_pessoa',
    'vw_transacoes_cartao_variavel_por_pessoa'
  ];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'verificar_hardening_views: restrito a service_role';
  end if;

  return query
  select
    c.relname::text as view_nome,
    coalesce(c.reloptions, array[]::text[]) && array['security_invoker=true'] as security_invoker_ok,
    c.reloptions::text[]
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(v_views_endurecidas);
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: aplicacoes_ozivy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aplicacoes_ozivy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date NOT NULL,
    dose_mg numeric,
    observacao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tabela text NOT NULL,
    registro_id uuid NOT NULL,
    operacao text NOT NULL,
    campo text,
    valor_anterior text,
    valor_novo text,
    origem text DEFAULT 'sistema'::text NOT NULL,
    alterado_por text,
    alterado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_operacao_check CHECK ((operacao = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))),
    CONSTRAINT audit_log_origem_check CHECK ((origem = ANY (ARRAY['importacao'::text, 'sistema'::text, 'ajuste_manual'::text, 'formulario'::text, 'sincronizacao'::text])))
);


--
-- Name: backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    conteudo jsonb NOT NULL,
    tamanho_bytes integer,
    erro text
);


--
-- Name: caixas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caixas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    saldo_inicial_ciclo numeric(14,2) DEFAULT 0 NOT NULL,
    teto_mensal numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    saldo_inicial_calibrado boolean DEFAULT false NOT NULL,
    ciclo_inicio_em date,
    meta_data_limite date,
    CONSTRAINT caixas_tipo_check CHECK ((tipo = ANY (ARRAY['operacional'::text, 'patrimonial'::text])))
);


--
-- Name: COLUMN caixas.ciclo_inicio_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.ciclo_inicio_em IS 'Data de inicio do ciclo atual da caixa: transacoes com data >= este valor contam pro saldo V2.
NULL = caixa cumulativa, sem reset de ciclo (patrimonial, fundo-meta tipo Aniversario Julio,
ou vinculada a fatura como Provisionado Wartsila). Deve ser atualizado manualmente a cada
virada de ciclo real (quando o aporte mensal do novo ciclo e lancado).';


--
-- Name: cartoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cartoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid,
    dono_real_id uuid,
    numero_final text NOT NULL,
    apelido text,
    bandeira text,
    banco text,
    conta_pluggy_id text,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cartoes_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'aposentado'::text, 'bloqueado'::text])))
);


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT categorias_tipo_check CHECK ((tipo = ANY (ARRAY['recorrente'::text, 'extraordinaria'::text])))
);


--
-- Name: ciclos_financeiros_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ciclos_financeiros_snapshots (
    ciclo_key text NOT NULL,
    label text NOT NULL,
    periodo text NOT NULL,
    fechado boolean NOT NULL,
    salario numeric,
    entradas_totais numeric,
    caixa_variavel_comprometido numeric,
    caixa_variavel_saldo_real numeric,
    caixa_variavel_disponivel numeric,
    reembolso_recebido numeric,
    reembolso_a_receber numeric,
    tolerancia_temp_valor numeric,
    tolerancia_temp_motivo text,
    teto_oficial numeric,
    teto_efetivo numeric,
    cascata jsonb,
    necessidade_total_bruta numeric,
    necessidade_total_liquida numeric,
    modo_operacional text,
    saldo_ciclo numeric,
    visa_infinite_comprometido numeric,
    mastercard_black_comprometido numeric,
    mastercard_black_pessoal_congelado numeric,
    mercado_pago_fatura_congelada numeric,
    dias_restantes integer,
    observacoes text,
    livros_razao_arquivados jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ciclos_financeiros_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ciclos_financeiros_snapshots IS 'Snapshot financeiro por ciclo (Caixa Variável, Reembolso, Tolerância, Cascata, Modo Operacional/Saldo Ciclo) + arquivo dos Livros Razão de ciclos fechados. Substitui VARS.CICLO_SNAPSHOTS (vars-ciclo-snapshots.js) — 08/08/2026. ATENÇÃO: só a ARMAZENAGEM foi migrada nesta rodada; a leitura em JS (app.js/CycleEngine.js/etc, síncrona no boot) continua lendo o literal local — ver docs/decisions/ para o motivo (cascata de cálculo síncrona no boot, risco de regressão sem validação completa). Não remover o literal de vars-ciclo-snapshots.js até essa segunda etapa ser feita.';


--
-- Name: ciclos_solares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ciclos_solares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_inicio date NOT NULL,
    data_fim date,
    leitura_inicio_id uuid,
    leitura_fechamento_id uuid,
    leitura_03_inicio numeric NOT NULL,
    leitura_103_inicio numeric NOT NULL,
    leitura_03_fim numeric,
    leitura_103_fim numeric,
    credito_liquido_kwh numeric,
    credito_wallace_kwh numeric,
    credito_irma_kwh numeric,
    rateio_wallace_pct numeric NOT NULL,
    rateio_irma_pct numeric NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    fechado_em timestamp with time zone,
    data_inicio_faturamento_energisa date,
    CONSTRAINT ciclos_solares_coerencia_fechamento CHECK ((((status = 'aberto'::text) AND (data_fim IS NULL) AND (leitura_fechamento_id IS NULL)) OR ((status = 'fechado'::text) AND (data_fim IS NOT NULL) AND (leitura_fechamento_id IS NOT NULL) AND (credito_liquido_kwh IS NOT NULL)))),
    CONSTRAINT ciclos_solares_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'fechado'::text])))
);


--
-- Name: TABLE ciclos_solares; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ciclos_solares IS 'Ciclos de crédito solar da Unidade Geradora (casa da mãe), delimitados por leituras oficiais da Energisa. Substitui o modelo de acumulado-desde-ativação (08/08/2026).';


--
-- Name: COLUMN ciclos_solares.data_inicio_faturamento_energisa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.data_inicio_faturamento_energisa IS 'Início do ciclo de faturamento da Energisa para este período (pode ser anterior a data_inicio quando a usina entra em operação no meio de um ciclo de faturamento já em andamento — ciclo de transição). Null quando coincide com data_inicio ou é desconhecido. Não afeta credito_liquido_kwh/rateio — é só contexto informativo.';


--
-- Name: contas_bancarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contas_bancarias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    banco text NOT NULL,
    tipo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'ativa'::text NOT NULL,
    numero text,
    CONSTRAINT contas_bancarias_tipo_check CHECK ((tipo = ANY (ARRAY['corrente'::text, 'poupanca'::text])))
);


--
-- Name: cotacoes_acoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotacoes_acoes (
    ticker text NOT NULL,
    preco numeric,
    variacao numeric,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE cotacoes_acoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cotacoes_acoes IS 'Cotações de ações via brapi.dev, escritas pelo robô atualizar_cotacoes_acoes.py. Substitui wallace_dados.ACOES_COTACOES (08/08/2026).';


--
-- Name: cronograma_assinaturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cronograma_assinaturas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tx text NOT NULL,
    data date,
    nome text NOT NULL,
    valor numeric(10,2) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cronograma_boletos_fixos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cronograma_boletos_fixos (
    tx text NOT NULL,
    nome text NOT NULL,
    dia_vencimento integer NOT NULL,
    valor numeric NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE cronograma_boletos_fixos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cronograma_boletos_fixos IS 'Cronograma dos boletos fixos recorrentes (dia de vencimento, valor) usado por aplicarBoletosVencidosAutomaticamente() para auto-creditar a Caixa Boletos. Substitui VARS.CRONOGRAMA_BOLETOS_FIXOS (vars-caixas.js) — 08/08/2026. Editar aqui não exige deploy de código, mesmo padrão já usado pela tabela legendas.';


--
-- Name: cronograma_consorcios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cronograma_consorcios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tx text NOT NULL,
    nome text NOT NULL,
    valor numeric(10,2) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cronograma_doacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cronograma_doacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tx text NOT NULL,
    descricao text NOT NULL,
    responsavel text,
    valor numeric(10,2) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cronograma_recorrencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cronograma_recorrencias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tx text NOT NULL,
    nome text NOT NULL,
    valor numeric(10,2) NOT NULL,
    cartao text,
    obs text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: emprestimos_internos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emprestimos_internos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_legado text NOT NULL,
    data_emprestimo date NOT NULL,
    caixa_credora_id uuid NOT NULL,
    caixa_devedora_id uuid,
    devedora_texto text,
    valor numeric NOT NULL,
    origem text,
    status text DEFAULT 'ATIVO'::text NOT NULL,
    data_quitacao date,
    quitado_por text,
    transacao_quitacao_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT emprestimos_internos_status_check CHECK ((status = ANY (ARRAY['ATIVO'::text, 'QUITADO'::text])))
);


--
-- Name: energia_solar_consumo_referencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energia_solar_consumo_referencia (
    casa text NOT NULL,
    consumo_mensal_kwh numeric NOT NULL,
    dias_base numeric DEFAULT 30 NOT NULL,
    consumo_diario_kwh numeric GENERATED ALWAYS AS ((consumo_mensal_kwh / NULLIF(dias_base, (0)::numeric))) STORED,
    fonte text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT energia_solar_consumo_referencia_casa_check CHECK ((casa = ANY (ARRAY['wallace'::text, 'irma'::text, 'mae'::text])))
);


--
-- Name: energia_solar_geracao_diaria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energia_solar_geracao_diaria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date NOT NULL,
    geracao_kwh numeric(10,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: energia_solar_geracao_intraday; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energia_solar_geracao_intraday (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date NOT NULL,
    capturado_em timestamp with time zone DEFAULT now() NOT NULL,
    geracao_acumulada_hoje_kwh numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE energia_solar_geracao_intraday; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.energia_solar_geracao_intraday IS 'Leituras INTERMEDIÁRIAS (append-only, nunca sobrescreve) do total acumulado do dia, gravadas a cada execução do robô SAJ (atualizar_geracao_saj.py, cron */10 6-18h Brasília). Diferente de energia_solar_geracao_diaria (que guarda só o valor FINAL do dia, sobrescrito a cada leitura) — esta tabela existe pra construir uma curva real "quanto a usina costuma ter gerado até tal horário", usada pelo card "Qualidade da Geração" (hydrate-onda5-qualidade-geracao.js) pra comparar o dia de hoje (ainda em andamento) contra o esperado. Criada 12/08/2026 — precisa de alguns dias de histórico acumulado antes de qualquer cálculo baseado em curva real fazer sentido; até lá, o card usa uma estimativa linear simples (regra de 3) como primeira aproximação.';


--
-- Name: energia_solar_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energia_solar_leituras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    casa text NOT NULL,
    leitura_03 numeric(10,2),
    leitura_103 numeric(10,2),
    geracao_acumulada numeric(10,2),
    data date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ciclo_id uuid,
    eh_leitura_oficial_energisa boolean DEFAULT false NOT NULL,
    evidencia text,
    CONSTRAINT energia_solar_leituras_casa_check CHECK ((casa = ANY (ARRAY['propria'::text, 'irma'::text, 'mae'::text]))),
    CONSTRAINT energia_solar_leituras_evidencia_obrigatoria CHECK (((NOT eh_leitura_oficial_energisa) OR ((evidencia IS NOT NULL) AND (length(TRIM(BOTH FROM evidencia)) > 0))))
);


--
-- Name: COLUMN energia_solar_leituras.eh_leitura_oficial_energisa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.eh_leitura_oficial_energisa IS 'true somente quando esta leitura corresponde à leitura oficial da Energisa (fatura real da UC casa da mãe) — nunca inferido por data, sempre confirmação explícita com evidência.';


--
-- Name: COLUMN energia_solar_leituras.evidencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.evidencia IS 'Referência da fonte externa oficial (ex: "Fatura Energisa agosto/2026") — obrigatória quando eh_leitura_oficial_energisa=true.';


--
-- Name: energia_solar_medicoes_tempo_real; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energia_solar_medicoes_tempo_real (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capturado_em timestamp with time zone NOT NULL,
    geracao_instantanea_w numeric,
    consumo_instantaneo_w numeric,
    importacao_w numeric,
    exportacao_w numeric,
    autoconsumo_w numeric,
    fonte text DEFAULT 'medidor_saj'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT energia_solar_medicoes_tempo_real_fonte_check CHECK ((fonte = 'medidor_saj'::text))
);


--
-- Name: TABLE energia_solar_medicoes_tempo_real; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.energia_solar_medicoes_tempo_real IS 'Leituras de alta frequência do medidor DDSU666 (bidirecional, via API SAJ) — granularidade de minutos, distinta de energia_solar_leituras (leitura manual 03/103) e energia_solar_geracao_diaria (agregado diário). Ver docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md. Colunas em W (potência instantânea), não kWh acumulado. Tabela criada em 12/08/2026, ANTES da instalação física (15/08/2026) — fica vazia até o robô ser estendido na Fase 1/2 do documento, depois de confirmados os campos reais da API pós-instalação.';


--
-- Name: erros_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erros_cliente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    mensagem text NOT NULL,
    stack text,
    contexto jsonb
);


--
-- Name: execucoes_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.execucoes_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_nome text NOT NULL,
    executado_em timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    detalhe text,
    duracao_ms integer,
    CONSTRAINT execucoes_jobs_status_check CHECK ((status = ANY (ARRAY['sucesso'::text, 'erro'::text])))
);


--
-- Name: financiamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patrimonio_id uuid NOT NULL,
    tipo text NOT NULL,
    carta_credito numeric,
    parcela_valor numeric,
    parcelas_pagas integer,
    parcelas_totais integer,
    meses_restantes integer,
    percentual_pago numeric,
    valor_quitacao numeric,
    proxima_assembleia date,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT financiamentos_tipo_check CHECK ((tipo = ANY (ARRAY['financiamento_imovel'::text, 'consorcio_veiculo'::text, 'consorcio_imovel'::text])))
);


--
-- Name: indicadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indicadores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    valor numeric(14,4) NOT NULL,
    data_calculo date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: investimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    quantidade numeric(14,4),
    valor_atual numeric(14,2),
    data_atualizacao date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ticker text,
    ativo_subjacente text,
    preco_exercicio numeric,
    data_vencimento date,
    premio_bruto numeric,
    custo_operacional numeric,
    premio_recebido numeric,
    preco_medio numeric,
    nota_corretagem text,
    exercida boolean DEFAULT false,
    data_operacao date,
    CONSTRAINT investimentos_tipo_check CHECK ((tipo = ANY (ARRAY['LFTS11'::text, 'P2P'::text, 'opcoes'::text])))
);


--
-- Name: legendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legendas (
    id text NOT NULL,
    texto text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mercadopago_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mercadopago_eventos (
    id text NOT NULL,
    origem text DEFAULT 'Mercado Pago'::text NOT NULL,
    tipo text,
    descricao text,
    valor numeric,
    data date,
    status text,
    status_triagem text DEFAULT 'pendente'::text NOT NULL,
    metadata jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE mercadopago_eventos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mercadopago_eventos IS 'Eventos financeiros do Mercado Pago normalizados, gravados por mercadopago_sync.py via RPC atualizar_mercadopago_eventos. Substitui wallace_dados.MERCADOPAGO_EVENTOS (08/08/2026).';


--
-- Name: metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    valor_alvo numeric(14,2) NOT NULL,
    valor_atual numeric(14,2) DEFAULT 0 NOT NULL,
    tipo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT metas_tipo_check CHECK ((tipo = ANY (ARRAY['milhao'::text, 'reserva'::text, 'outra'::text])))
);


--
-- Name: parametros_gerais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_gerais (
    nome text NOT NULL,
    valor jsonb NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE parametros_gerais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.parametros_gerais IS 'Escalares/objetos de configuração isolados que ainda dependiam de wallace_dados (data de nascimento, saldos patrimoniais BTG/FGTS/PGBL, financiamento da casa, consórcio, composição tarifária Energisa, overrides pontuais). Sepultamento final da V1 (12/08/2026) — substitui os últimos consumidores de wallace_dados.dados que não eram nem caixa/transação (já em transacoes/caixas) nem indicador financeiro simples (já em indicadores).';


--
-- Name: parametros_solares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_solares (
    chave text NOT NULL,
    valor numeric NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: parcelas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcelas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transacao_origem_id uuid,
    numero_parcela integer NOT NULL,
    total_parcelas integer NOT NULL,
    valor_parcela numeric(14,2) NOT NULL,
    data_prevista date,
    cartao_id uuid,
    status text DEFAULT 'ativa'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tx_legado text,
    origem_array text,
    CONSTRAINT parcelas_status_check CHECK ((status = ANY (ARRAY['ativa'::text, 'quitada'::text])))
);


--
-- Name: patrimonio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patrimonio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    valor numeric(14,2) NOT NULL,
    data_snapshot date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    natureza text DEFAULT 'ativo'::text NOT NULL,
    rotulo text,
    subtipo text,
    CONSTRAINT patrimonio_natureza_check CHECK ((natureza = ANY (ARRAY['ativo'::text, 'passivo'::text, 'informativo'::text]))),
    CONSTRAINT patrimonio_tipo_check CHECK ((tipo = ANY (ARRAY['imovel'::text, 'veiculo'::text, 'reserva'::text, 'investimento'::text])))
);


--
-- Name: pesagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pesagens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date NOT NULL,
    peso_kg numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pesagens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pesagens IS 'Pesagens do usuário (aba Emagrecimento) — 1 linha por data, peso em kg. Fonte pro gráfico de evolução. Criada 12/08/2026, junto da caixa "Saúde - Emagrecimento" (custo da caneta Ozivy Semaglutida).';


--
-- Name: pib_wallace_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pib_wallace_historico (
    mes text NOT NULL,
    snapshot jsonb NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pluggy_conexoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pluggy_conexoes (
    item_id text NOT NULL,
    banco text,
    status text,
    atualizado_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pluggy_conexoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pluggy_conexoes IS 'Conexões (items) da API Pluggy, uma por banco conectado. Substitui wallace_dados.PLUGGY_CONTAS.conexoes[] (08/08/2026). Sincronizada por substituição total a cada rodada de sincronizar_pluggy.py.';


--
-- Name: pluggy_contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pluggy_contas (
    id text NOT NULL,
    conexao_id text NOT NULL,
    numero text,
    tipo text,
    subtipo text,
    nome text,
    saldo numeric,
    moeda text,
    limite_total numeric,
    limite_disponivel numeric,
    fatura_vencimento_atual date,
    fatura_valor_total numeric,
    fatura_pagamento_minimo numeric,
    qtd_transacoes_sincronizadas integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pluggy_contas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pluggy_contas IS 'Contas bancárias/cartão dentro de cada conexão Pluggy. id = id real da conta na API Pluggy (uma vez que sincronizar_pluggy.py passe a capturá-lo) ou hash estável (item_id+numero+nome) para linhas migradas do backfill, quando o id real não estava disponível na origem. numero NÃO é único por conexão (achado real: contas diferentes podem compartilhar o mesmo número mascarado, ex. BTG Investimentos/BTG Banking). Substitui wallace_dados.PLUGGY_CONTAS.conexoes[].contas[] (08/08/2026).';


--
-- Name: pluggy_investimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pluggy_investimentos (
    id text NOT NULL,
    conexao_id text NOT NULL,
    tipo text,
    nome text,
    valor numeric,
    instituicao text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pluggy_saldos_reservados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pluggy_saldos_reservados (
    id text NOT NULL,
    conta_id text NOT NULL,
    nome text,
    identificacao text,
    valor numeric,
    moeda text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pluggy_transacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pluggy_transacoes (
    id text NOT NULL,
    conta_id text NOT NULL,
    data timestamp with time zone,
    descricao text,
    valor numeric,
    categoria text,
    status text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    primeiro_visto_em timestamp with time zone,
    status_anterior text,
    status_mudou_em timestamp with time zone,
    qtd_sincronizacoes integer DEFAULT 0 NOT NULL,
    ultima_sincronizacao_em timestamp with time zone
);


--
-- Name: TABLE pluggy_transacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pluggy_transacoes IS 'Transações recentes por conta Pluggy (janela rolante, mesma janela que o script Python já usava). Substitui wallace_dados.PLUGGY_CONTAS.conexoes[].contas[].transacoes_recentes[] (08/08/2026).';


--
-- Name: pluggy_triagem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pluggy_triagem (
    id_externo text NOT NULL,
    status_triagem text DEFAULT 'pendente'::text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pluggy_triagem_status_triagem_check CHECK ((status_triagem = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text])))
);


--
-- Name: pluggy_webhook_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pluggy_webhook_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event text NOT NULL,
    event_id text,
    item_id text,
    triggered_by text,
    client_user_id text,
    payload jsonb NOT NULL,
    recebido_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reembolso_wartsila_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reembolso_wartsila_ciclo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ciclo_referencia text NOT NULL,
    valor_total_bruto numeric NOT NULL,
    valor_a_receber numeric DEFAULT 0 NOT NULL,
    perna_fatura_wartsila numeric DEFAULT 0,
    perna_mp_corporativo numeric DEFAULT 0,
    perna_cartao_corporativo_pessoal numeric DEFAULT 0,
    perna_mp_pessoal_provisionado numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: reembolso_wartsila_recebimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reembolso_wartsila_recebimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ciclo_id uuid NOT NULL,
    data date NOT NULL,
    valor numeric NOT NULL,
    descricao text,
    transacao_id uuid
);


--
-- Name: reembolsos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reembolsos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origem text NOT NULL,
    valor_a_receber numeric(14,2) NOT NULL,
    valor_recebido numeric(14,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    transacao_origem_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reembolsos_origem_check CHECK ((origem = ANY (ARRAY['wartsila'::text, 'bradesco_saude'::text, 'outro'::text]))),
    CONSTRAINT reembolsos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'parcial'::text, 'quitado'::text])))
);


--
-- Name: regras_classificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regras_classificacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prioridade integer DEFAULT 100 NOT NULL,
    estabelecimento_contem text,
    descricao_regex text,
    categoria_id uuid,
    subcategoria_id uuid,
    caixa_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resultado text DEFAULT 'classificar'::text NOT NULL,
    CONSTRAINT regras_classificacao_resultado_check CHECK ((resultado = ANY (ARRAY['classificar'::text, 'ignorar'::text])))
);


--
-- Name: regras_resolver_caixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regras_resolver_caixa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria_id uuid,
    usuario_id uuid,
    origem text,
    caixa_id uuid NOT NULL,
    prioridade integer DEFAULT 100 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    estabelecimento_contem text
);


--
-- Name: solar_compartilhamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solar_compartilhamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: subcategorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria_id uuid NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date,
    descricao text NOT NULL,
    valor numeric(14,2) NOT NULL,
    tipo text NOT NULL,
    cartao_id uuid,
    caixa_id uuid NOT NULL,
    categoria_id uuid,
    subcategoria_id uuid,
    usuario_id uuid,
    origem text NOT NULL,
    status text DEFAULT 'confirmado'::text NOT NULL,
    pluggy_tx_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tx_legado text,
    afeta_saldo_real boolean,
    ja_orcado_assinaturas boolean DEFAULT false NOT NULL,
    CONSTRAINT transacoes_origem_check CHECK ((origem = ANY (ARRAY['pluggy'::text, 'manual'::text, 'mercado_pago'::text, 'reconciliacao'::text]))),
    CONSTRAINT transacoes_status_check CHECK ((status = ANY (ARRAY['confirmado'::text, 'pendente_classificacao'::text, 'estornado'::text]))),
    CONSTRAINT transacoes_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text])))
);


--
-- Name: COLUMN transacoes.ja_orcado_assinaturas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.ja_orcado_assinaturas IS 'true = esta compra de cartão já tem seu valor contado no orçamento de Assinaturas (cronograma_assinaturas/mbLRSConfirmado), então NÃO deve contar de novo em "Comprometido" da Caixa Variável nem aparecer em LRW/LRV (mesma classe de bug do caso TX000228/Churrasco, achado pelo usuário 12/08/2026 pras assinaturas do Mastercard Black recém-vinculadas via Pluggy). A transação em si continua existindo (cartao_id/valor reais, conta pro total do cartão) — só não é somada 2x no orçamento.';


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    papel text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usuarios_papel_check CHECK ((papel = ANY (ARRAY['titular'::text, 'dependente'::text])))
);


--
-- Name: v1_v2_caixa_mapa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.v1_v2_caixa_mapa (
    caixa_nome text NOT NULL,
    v1_saldo_inicial_key text,
    v1_array_key text,
    confiavel boolean DEFAULT true NOT NULL,
    observacao text,
    v1_saldo_inicial_fallback_arquivo_local numeric,
    v1_saldo_inicial_existe_no_supabase boolean
);


--
-- Name: wallace_dados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallace_dados (
    id integer DEFAULT 1 NOT NULL,
    dados jsonb NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT unica_linha CHECK ((id = 1))
);


--
-- Name: vw_ajustes_manuais_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_ajustes_manuais_v1 WITH (security_invoker='true') AS
 WITH itens AS (
         SELECT m.caixa_nome,
            (t.value ->> 'tx'::text) AS tx,
            COALESCE((t.value ->> 'nome'::text), ''::text) AS descricao,
            ((t.value ->> 'valor'::text))::numeric AS valor,
                CASE
                    WHEN (lower(COALESCE((t.value ->> 'tipo'::text), 'saida'::text)) ~~ '%entrada%'::text) THEN ((t.value ->> 'valor'::text))::numeric
                    ELSE (- ((t.value ->> 'valor'::text))::numeric)
                END AS delta_assinado
           FROM public.v1_v2_caixa_mapa m,
            public.wallace_dados w,
            LATERAL jsonb_array_elements(COALESCE((w.dados -> m.v1_array_key), '[]'::jsonb)) t(value)
          WHERE (m.confiavel AND (w.id = 1))
        )
 SELECT caixa_nome,
    tx,
    descricao,
    valor,
    delta_assinado
   FROM itens
  WHERE ((tx ~~* 'AJUSTE-%'::text) OR (tx ~~* 'RENDIMENTO-%'::text) OR (descricao ~~* 'Ajuste de reconcilia%'::text) OR (descricao ~~* 'Rendimento acumulado%'::text));


--
-- Name: vw_assinaturas_confirmadas_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_assinaturas_confirmadas_v2 WITH (security_invoker='true') AS
 SELECT DISTINCT t.descricao
   FROM (public.transacoes t
     JOIN public.categorias c ON ((c.id = t.categoria_id)))
  WHERE ((c.nome = 'Assinaturas'::text) AND (t.status = 'confirmado'::text));


--
-- Name: vw_ciclo_solar_aberto; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_ciclo_solar_aberto WITH (security_invoker='true') AS
 SELECT id,
    data_inicio,
    data_fim,
    leitura_inicio_id,
    leitura_fechamento_id,
    leitura_03_inicio,
    leitura_103_inicio,
    leitura_03_fim,
    leitura_103_fim,
    credito_liquido_kwh,
    credito_wallace_kwh,
    credito_irma_kwh,
    rateio_wallace_pct,
    rateio_irma_pct,
    status,
    criado_em,
    fechado_em,
    (leitura_103_inicio - leitura_03_inicio) AS baseline_kwh,
    data_inicio_faturamento_energisa
   FROM public.ciclos_solares c
  WHERE (status = 'aberto'::text);


--
-- Name: vw_ciclo_solar_historico; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_ciclo_solar_historico WITH (security_invoker='true') AS
 SELECT id,
    data_inicio,
    data_fim,
    leitura_inicio_id,
    leitura_fechamento_id,
    leitura_03_inicio,
    leitura_103_inicio,
    leitura_03_fim,
    leitura_103_fim,
    credito_liquido_kwh,
    credito_wallace_kwh,
    credito_irma_kwh,
    rateio_wallace_pct,
    rateio_irma_pct,
    status,
    criado_em,
    fechado_em,
    data_inicio_faturamento_energisa
   FROM public.ciclos_solares
  WHERE (status = 'fechado'::text)
  ORDER BY data_fim DESC;


--
-- Name: vw_compromisso_cartao_detalhe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_compromisso_cartao_detalhe WITH (security_invoker='true') AS
 SELECT t.id,
    t.data,
    t.descricao,
    t.valor,
    u.nome AS usuario_nome,
    t.usuario_id,
    c.apelido AS cartao_apelido,
    c.numero_final AS cartao_numero_final,
    t.cartao_id
   FROM (((public.transacoes t
     JOIN public.caixas cx ON (((cx.id = t.caixa_id) AND (cx.nome = 'Caixa Variável'::text))))
     LEFT JOIN public.usuarios u ON ((u.id = t.usuario_id)))
     LEFT JOIN public.cartoes c ON ((c.id = t.cartao_id)))
  WHERE ((t.afeta_saldo_real = false) AND ((cx.ciclo_inicio_em IS NULL) OR (t.data >= cx.ciclo_inicio_em) OR (t.data IS NULL)))
  ORDER BY t.data DESC, t.id DESC;


--
-- Name: vw_compromisso_cartao_por_pessoa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_compromisso_cartao_por_pessoa WITH (security_invoker='true') AS
 SELECT u.nome AS usuario_nome,
    u.id AS usuario_id,
    round(sum(t.valor), 2) AS total_comprometido,
    count(*) AS qtd_transacoes
   FROM ((public.transacoes t
     JOIN public.caixas c ON (((c.id = t.caixa_id) AND (c.nome = 'Caixa Variável'::text))))
     JOIN public.usuarios u ON ((u.id = t.usuario_id)))
  WHERE ((t.afeta_saldo_real = false) AND (t.cartao_id IS NOT NULL) AND (t.ja_orcado_assinaturas = false) AND ((c.ciclo_inicio_em IS NULL) OR (t.data >= c.ciclo_inicio_em) OR (t.data IS NULL)))
  GROUP BY u.nome, u.id;


--
-- Name: vw_emprestimos_internos_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_emprestimos_internos_v2 WITH (security_invoker='true') AS
 SELECT e.codigo_legado AS id,
    to_char((e.data_emprestimo)::timestamp with time zone, 'DD/MM'::text) AS data,
    cc.nome AS credora,
    COALESCE(cd.nome, e.devedora_texto) AS devedora,
    e.valor,
    e.origem,
    e.status,
    to_char((e.data_quitacao)::timestamp with time zone, 'DD/MM'::text) AS quitado_em,
    e.quitado_por
   FROM ((public.emprestimos_internos e
     JOIN public.caixas cc ON ((cc.id = e.caixa_credora_id)))
     LEFT JOIN public.caixas cd ON ((cd.id = e.caixa_devedora_id)))
  ORDER BY e.codigo_legado;


--
-- Name: vw_historico_erp_completo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_historico_erp_completo WITH (security_invoker='true') AS
 SELECT tx_legado AS tx,
    to_char((data)::timestamp with time zone, 'DD/MM/YYYY'::text) AS data,
    descricao AS nome,
    valor
   FROM public.transacoes
  WHERE (tx_legado IS NOT NULL)
  ORDER BY (to_char((data)::timestamp with time zone, 'DD/MM/YYYY'::text));


--
-- Name: VIEW vw_historico_erp_completo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vw_historico_erp_completo IS 'Substitui wallace_dados.HISTORICO_ERP_TODOS_CICLOS (08/08/2026) - todos os lancamentos com codigo legado, qualquer ciclo. Mesmo shape (tx/data/nome/valor) do array V1, campo `livro` omitido (confirmado morto - nenhum consumidor le). Exceções conhecidas e documentadas, não presentes aqui por ausência real de dado em transacoes: TXCON000001 (Consórcio Casa, R$501,32), TXCON000002 (Consórcio Carro, R$1.449,45). TXB000001/TXB000008/TXB000009 têm código de boleto reaproveitado entre ciclos (mesmo código, mês seguinte) - a view mostra sempre a versão mais recente gravada em transacoes, a anterior fica só no histórico git do array V1.';


--
-- Name: vw_opcoes_vendidas_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_opcoes_vendidas_v2 WITH (security_invoker='true') AS
 SELECT ticker,
    ativo_subjacente AS ativo,
    'Put vendida'::text AS tipo,
    valor_atual AS valor_mercado,
    preco_exercicio,
    to_char((data_vencimento)::timestamp with time zone, 'DD/MM/YYYY'::text) AS vencimento,
    quantidade,
    premio_bruto,
    custo_operacional,
    premio_recebido,
    preco_medio,
    nota_corretagem,
    exercida,
    (data_vencimento < CURRENT_DATE) AS vencida
   FROM public.investimentos
  WHERE (tipo = 'opcoes'::text)
  ORDER BY data_vencimento;


--
-- Name: vw_p2p_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_p2p_v2 WITH (security_invoker='true') AS
 SELECT max(valor) FILTER (WHERE (nome = 'P2P - capitalTotal'::text)) AS capital_total,
    max(valor) FILTER (WHERE (nome = 'P2P - creditosTotal'::text)) AS creditos_total,
    max(valor) FILTER (WHERE (nome = 'P2P - creditosRestantes'::text)) AS creditos_restantes,
    max(valor) FILTER (WHERE (nome = 'P2P - creditosVendidos'::text)) AS creditos_vendidos,
    max(valor) FILTER (WHERE (nome = 'P2P - precoCompra'::text)) AS preco_compra,
    max(valor) FILTER (WHERE (nome = 'P2P - precoVenda'::text)) AS preco_venda,
    max(valor) FILTER (WHERE (nome = 'P2P - lucroRealizado'::text)) AS lucro_realizado
   FROM public.indicadores
  WHERE (nome ~~ 'P2P - %'::text);


--
-- Name: vw_parcelamentos_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_parcelamentos_v2 WITH (security_invoker='true') AS
 SELECT p.tx_legado AS tx,
    COALESCE(t.descricao, p.tx_legado) AS nome,
    p.numero_parcela AS parcela_atual,
    p.total_parcelas,
    p.valor_parcela AS valor,
        CASE
            WHEN (p.status = 'ativa'::text) THEN 'ATIVO'::text
            ELSE 'QUITADO'::text
        END AS status,
    p.origem_array,
    to_char((p.data_prevista)::timestamp with time zone, 'DD/MM'::text) AS data
   FROM (public.parcelas p
     LEFT JOIN public.transacoes t ON ((t.id = p.transacao_origem_id)))
  WHERE (p.origem_array = ANY (ARRAY['PARCELAMENTOS_VISA'::text, 'PARCELAMENTOS_MP'::text]))
  ORDER BY p.origem_array, p.tx_legado;


--
-- Name: vw_patrimonio_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_patrimonio_v2 WITH (security_invoker='true') AS
 SELECT ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'reserva'::text)) AS reserva,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'btg_necton'::text)) AS btg_necton,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'necton_cc'::text)) AS necton_conta_corrente,
    ((( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'reserva'::text)) + ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'btg_necton'::text))) + ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'necton_cc'::text))) AS patrimonio_financeiro_liquido_sem_lance,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'casa'::text)) AS casa,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'apartamento'::text)) AS apartamento,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'jazigo'::text)) AS jazigo,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'solar'::text)) AS solar,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'carro'::text)) AS carro,
    ((((( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'casa'::text)) + ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'apartamento'::text))) + ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'jazigo'::text))) + ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'solar'::text))) + ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'carro'::text))) AS fisico_total,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'consorcio_casa_pago'::text)) AS consorcio_casa_pago,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'financiamento_casa'::text)) AS passivo_financiamento_casa,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'consorcio_auto'::text)) AS passivo_consorcio_auto,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'pgbl'::text)) AS pgbl,
    ( SELECT patrimonio.valor
           FROM public.patrimonio
          WHERE (patrimonio.subtipo = 'fgts'::text)) AS fgts,
    ( SELECT f.parcela_valor
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'financiamento_casa'::text)) AS prestacao_financiamento_casa,
    ( SELECT f.meses_restantes
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'financiamento_casa'::text)) AS meses_restantes_financiamento_casa,
    ( SELECT f.carta_credito
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_casa_pago'::text)) AS consorcio_casa_carta_credito,
    ( SELECT f.parcela_valor
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_casa_pago'::text)) AS consorcio_casa_parcela,
    ( SELECT f.percentual_pago
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_casa_pago'::text)) AS consorcio_casa_pago_pct,
    ( SELECT f.valor_quitacao
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_casa_pago'::text)) AS consorcio_casa_quitacao,
    ( SELECT f.proxima_assembleia
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_casa_pago'::text)) AS consorcio_casa_proxima_assembleia,
    ( SELECT f.carta_credito
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_auto'::text)) AS consorcio_auto_carta_credito,
    ( SELECT f.parcela_valor
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_auto'::text)) AS parcela_consorcio_auto,
    ( SELECT f.percentual_pago
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_auto'::text)) AS consorcio_auto_pago_pct,
    ( SELECT f.valor_quitacao
           FROM (public.financiamentos f
             JOIN public.patrimonio p ON ((p.id = f.patrimonio_id)))
          WHERE (p.subtipo = 'consorcio_auto'::text)) AS consorcio_auto_quitacao_valor;


--
-- Name: vw_timeline_v1_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_timeline_v1_v2 WITH (security_invoker='true') AS
 WITH v1_mov AS (
         SELECT m.caixa_nome,
            public.fn_parse_data_v1((t.value ->> 'data'::text)) AS data,
                CASE
                    WHEN (lower(COALESCE((t.value ->> 'tipo'::text), 'saida'::text)) ~~ '%entrada%'::text) THEN ((t.value ->> 'valor'::text))::numeric
                    ELSE (- ((t.value ->> 'valor'::text))::numeric)
                END AS delta
           FROM public.v1_v2_caixa_mapa m,
            public.wallace_dados w,
            LATERAL jsonb_array_elements(COALESCE((w.dados -> m.v1_array_key), '[]'::jsonb)) t(value)
          WHERE (m.confiavel AND (w.id = 1))
        ), v2_mov AS (
         SELECT c.nome AS caixa_nome,
            t.data,
                CASE
                    WHEN (t.tipo = 'entrada'::text) THEN t.valor
                    ELSE (- t.valor)
                END AS delta
           FROM (public.transacoes t
             JOIN public.caixas c ON ((c.id = t.caixa_id)))
          WHERE ((t.status = 'confirmado'::text) AND COALESCE(t.afeta_saldo_real, true) AND ((c.tipo = 'patrimonial'::text) OR (t.data >= '2026-07-25'::date) OR (t.data IS NULL)))
        ), dias AS (
         SELECT DISTINCT v1_mov_1.caixa_nome,
            v1_mov_1.data
           FROM v1_mov v1_mov_1
          WHERE (v1_mov_1.data IS NOT NULL)
        UNION
         SELECT DISTINCT v2_mov_1.caixa_nome,
            v2_mov_1.data
           FROM v2_mov v2_mov_1
          WHERE (v2_mov_1.data IS NOT NULL)
        ), bases AS (
         SELECT x.caixa_nome,
            x.v1_saldo_inicial,
            x.v1_delta_sem_data
           FROM ( SELECT m.caixa_nome,
                    COALESCE(((w.dados ->> m.v1_saldo_inicial_key))::numeric, m.v1_saldo_inicial_fallback_arquivo_local, (0)::numeric) AS v1_saldo_inicial,
                    COALESCE(( SELECT sum(
                                CASE
                                    WHEN (lower(COALESCE((t.value ->> 'tipo'::text), 'saida'::text)) ~~ '%entrada%'::text) THEN ((t.value ->> 'valor'::text))::numeric
                                    ELSE (- ((t.value ->> 'valor'::text))::numeric)
                                END) AS sum
                           FROM jsonb_array_elements(COALESCE((w.dados -> m.v1_array_key), '[]'::jsonb)) t(value)
                          WHERE (public.fn_parse_data_v1((t.value ->> 'data'::text)) IS NULL)), (0)::numeric) AS v1_delta_sem_data
                   FROM (public.v1_v2_caixa_mapa m
                     CROSS JOIN public.wallace_dados w)
                  WHERE (m.confiavel AND (w.id = 1))) x
        ), v2_bases AS (
         SELECT c.nome AS caixa_nome,
            c.saldo_inicial_ciclo AS v2_saldo_inicial,
            COALESCE(( SELECT sum(
                        CASE
                            WHEN (t.tipo = 'entrada'::text) THEN t.valor
                            ELSE (- t.valor)
                        END) AS sum
                   FROM public.transacoes t
                  WHERE ((t.caixa_id = c.id) AND (t.status = 'confirmado'::text) AND COALESCE(t.afeta_saldo_real, true) AND (t.data IS NULL) AND ((c.tipo = 'patrimonial'::text) OR true))), (0)::numeric) AS v2_delta_sem_data
           FROM public.caixas c
        )
 SELECT d.caixa_nome,
    d.data,
    ((bases.v1_saldo_inicial + bases.v1_delta_sem_data) + sum(COALESCE(v1_mov.delta, (0)::numeric)) OVER (PARTITION BY d.caixa_nome ORDER BY d.data ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) AS v1_saldo_acumulado,
    ((v2_bases.v2_saldo_inicial + v2_bases.v2_delta_sem_data) + sum(COALESCE(v2_mov.delta, (0)::numeric)) OVER (PARTITION BY d.caixa_nome ORDER BY d.data ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) AS v2_saldo_acumulado
   FROM ((((dias d
     JOIN bases ON ((bases.caixa_nome = d.caixa_nome)))
     JOIN v2_bases ON ((v2_bases.caixa_nome = d.caixa_nome)))
     LEFT JOIN v1_mov ON (((v1_mov.caixa_nome = d.caixa_nome) AND (v1_mov.data = d.data))))
     LEFT JOIN v2_mov ON (((v2_mov.caixa_nome = d.caixa_nome) AND (v2_mov.data = d.data))));


--
-- Name: vw_primeira_divergencia_v1_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_primeira_divergencia_v1_v2 WITH (security_invoker='true') AS
 SELECT caixa_nome,
    min(data) FILTER (WHERE (round((v1_saldo_acumulado - v2_saldo_acumulado), 2) <> (0)::numeric)) AS primeira_data_divergencia,
    max(abs(round((v1_saldo_acumulado - v2_saldo_acumulado), 2))) AS maior_impacto_acumulado_no_periodo
   FROM public.vw_timeline_v1_v2
  GROUP BY caixa_nome;


--
-- Name: vw_saldo_v1_por_caixa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_saldo_v1_por_caixa WITH (security_invoker='true') AS
 SELECT m.caixa_nome,
    m.v1_saldo_inicial_existe_no_supabase,
    COALESCE(((w.dados ->> m.v1_saldo_inicial_key))::numeric, m.v1_saldo_inicial_fallback_arquivo_local, (0)::numeric) AS v1_saldo_inicial,
    COALESCE(agg.delta, (0)::numeric) AS v1_delta,
    (COALESCE(((w.dados ->> m.v1_saldo_inicial_key))::numeric, m.v1_saldo_inicial_fallback_arquivo_local, (0)::numeric) + COALESCE(agg.delta, (0)::numeric)) AS v1_saldo_calculado,
    COALESCE(agg.qtd, (0)::bigint) AS v1_qtd_transacoes
   FROM ((public.v1_v2_caixa_mapa m
     CROSS JOIN public.wallace_dados w)
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN (lower(COALESCE((elem.value ->> 'tipo'::text), 'saida'::text)) ~~ '%entrada%'::text) THEN ((elem.value ->> 'valor'::text))::numeric
                    ELSE (- ((elem.value ->> 'valor'::text))::numeric)
                END) AS delta,
            count(*) AS qtd
           FROM jsonb_array_elements(COALESCE((w.dados -> m.v1_array_key), '[]'::jsonb)) elem(value)) agg ON (true))
  WHERE (m.confiavel AND (w.id = 1));


--
-- Name: vw_saldo_v2_por_caixa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_saldo_v2_por_caixa WITH (security_invoker='true') AS
 SELECT c.nome AS caixa_nome,
    c.tipo AS caixa_tipo,
    c.saldo_inicial_ciclo AS v2_saldo_inicial,
    COALESCE(agg.delta, (0)::numeric) AS v2_delta,
    (c.saldo_inicial_ciclo + COALESCE(agg.delta, (0)::numeric)) AS v2_saldo_calculado,
    COALESCE(agg.qtd, (0)::bigint) AS v2_qtd_transacoes
   FROM (public.caixas c
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN (t.tipo = 'entrada'::text) THEN t.valor
                    ELSE (- t.valor)
                END) AS delta,
            count(*) AS qtd
           FROM public.transacoes t
          WHERE ((t.caixa_id = c.id) AND (t.status = 'confirmado'::text) AND COALESCE(t.afeta_saldo_real, true) AND ((c.ciclo_inicio_em IS NULL) OR (t.data >= c.ciclo_inicio_em) OR (t.data IS NULL)))) agg ON (true));


--
-- Name: vw_transacoes_so_na_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_transacoes_so_na_v2 WITH (security_invoker='true') AS
 SELECT tr.id,
    c.nome AS caixa_nome,
    tr.descricao,
    tr.valor,
    tr.data,
    tr.tx_legado,
    tr.origem
   FROM (public.transacoes tr
     JOIN public.caixas c ON ((c.id = tr.caixa_id)))
  WHERE ((tr.tx_legado IS NULL) OR (NOT (EXISTS ( SELECT 1
           FROM public.v1_v2_caixa_mapa m,
            public.wallace_dados w,
            LATERAL jsonb_array_elements(COALESCE((w.dados -> m.v1_array_key), '[]'::jsonb)) t(value)
          WHERE ((w.id = 1) AND ((t.value ->> 'tx'::text) = tr.tx_legado) AND (((t.value ->> 'valor'::text))::numeric = tr.valor))))));


--
-- Name: vw_transacoes_so_no_v1; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_transacoes_so_no_v1 WITH (security_invoker='true') AS
 WITH itens AS (
         SELECT m.caixa_nome,
            (t.value ->> 'tx'::text) AS tx,
            COALESCE((t.value ->> 'nome'::text), (t.value ->> 'obs'::text), ''::text) AS descricao,
            ((t.value ->> 'valor'::text))::numeric AS valor,
            public.fn_parse_data_v1((t.value ->> 'data'::text)) AS data
           FROM public.v1_v2_caixa_mapa m,
            public.wallace_dados w,
            LATERAL jsonb_array_elements(COALESCE((w.dados -> m.v1_array_key), '[]'::jsonb)) t(value)
          WHERE (m.confiavel AND (w.id = 1) AND ((t.value ->> 'tx'::text) IS NOT NULL))
        )
 SELECT caixa_nome,
    tx,
    descricao,
    valor,
    data
   FROM itens i
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.transacoes tr
          WHERE ((tr.tx_legado = i.tx) AND (tr.valor = i.valor)))));


--
-- Name: vw_reconciliacao_v1_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_reconciliacao_v1_v2 WITH (security_invoker='true') AS
 SELECT v1.caixa_nome,
    v2.caixa_tipo,
    round(v1.v1_saldo_calculado, 2) AS v1_saldo,
    round(v2.v2_saldo_calculado, 2) AS v2_saldo,
    round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2) AS diferenca_absoluta,
        CASE
            WHEN (v1.v1_saldo_calculado = (0)::numeric) THEN NULL::numeric
            ELSE round(((100.0 * (v1.v1_saldo_calculado - v2.v2_saldo_calculado)) / abs(v1.v1_saldo_calculado)), 2)
        END AS diferenca_percentual,
    v1.v1_saldo_inicial_existe_no_supabase,
    v1.v1_qtd_transacoes,
    v2.v2_qtd_transacoes,
    COALESCE(so_v1.qtd, (0)::bigint) AS qtd_transacoes_so_no_v1,
    COALESCE(so_v1.valor, (0)::numeric) AS valor_transacoes_so_no_v1,
    COALESCE(so_v2.qtd, (0)::bigint) AS qtd_transacoes_so_na_v2,
    COALESCE(so_v2.valor, (0)::numeric) AS valor_transacoes_so_na_v2,
    COALESCE(ajustes.qtd, (0)::bigint) AS qtd_ajustes_manuais_v1,
    COALESCE(ajustes.valor, (0)::numeric) AS valor_ajustes_manuais_v1,
        CASE
            WHEN (abs(round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2)) <= 0.05) THEN 'sincronizado'::text
            WHEN ((COALESCE(so_v1.valor, (0)::numeric) <> (0)::numeric) AND (round(COALESCE(so_v1.valor, (0)::numeric), 2) = round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2))) THEN 'transacao_ausente_na_v2'::text
            WHEN ((COALESCE(so_v2.valor, (0)::numeric) <> (0)::numeric) AND (round((- so_v2.valor), 2) = round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2))) THEN 'lancamento_so_na_v2_sem_par_v1'::text
            WHEN ((COALESCE(ajustes.valor, (0)::numeric) <> (0)::numeric) AND (abs((round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2) - ajustes.valor)) <= 1.00)) THEN 'rendimento_ou_ajuste_nao_sincronizado_com_v2'::text
            WHEN (NOT v1.v1_saldo_inicial_existe_no_supabase) THEN 'saldo_inicial_ausente_no_supabase_causa_indeterminada'::text
            ELSE 'causa_nao_classificada_requer_analise_manual'::text
        END AS causa_provavel,
        CASE
            WHEN (abs(round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2)) <= 0.05) THEN 'alta'::text
            WHEN ((COALESCE(so_v1.valor, (0)::numeric) <> (0)::numeric) AND (round(COALESCE(so_v1.valor, (0)::numeric), 2) = round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2))) THEN 'alta - valor da(s) transação(ões) ausente(s) bate exato com a diferença'::text
            WHEN ((COALESCE(so_v2.valor, (0)::numeric) <> (0)::numeric) AND (round((- so_v2.valor), 2) = round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2))) THEN 'alta - valor do(s) lançamento(s) só-V2 bate exato com a diferença'::text
            WHEN ((COALESCE(ajustes.valor, (0)::numeric) <> (0)::numeric) AND (abs((round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2) - ajustes.valor)) <= 1.00)) THEN 'media - soma dos ajustes/rendimento aproxima a diferença, não é exato'::text
            WHEN (NOT v1.v1_saldo_inicial_existe_no_supabase) THEN 'baixa - saldo inicial V1 usado é o do arquivo local (fallback), diferença pode vir daí OU de outro lugar não identificado'::text
            ELSE 'baixa - nenhuma heurística explicou o valor, precisa investigação manual'::text
        END AS grau_confianca
   FROM ((((public.vw_saldo_v1_por_caixa v1
     JOIN public.vw_saldo_v2_por_caixa v2 ON ((v2.caixa_nome = v1.caixa_nome)))
     LEFT JOIN ( SELECT vw_transacoes_so_no_v1.caixa_nome,
            count(*) AS qtd,
            sum(vw_transacoes_so_no_v1.valor) AS valor
           FROM public.vw_transacoes_so_no_v1
          GROUP BY vw_transacoes_so_no_v1.caixa_nome) so_v1 ON ((so_v1.caixa_nome = v1.caixa_nome)))
     LEFT JOIN ( SELECT vw_transacoes_so_na_v2.caixa_nome,
            count(*) AS qtd,
            sum(vw_transacoes_so_na_v2.valor) AS valor
           FROM public.vw_transacoes_so_na_v2
          GROUP BY vw_transacoes_so_na_v2.caixa_nome) so_v2 ON ((so_v2.caixa_nome = v1.caixa_nome)))
     LEFT JOIN ( SELECT vw_ajustes_manuais_v1.caixa_nome,
            count(*) AS qtd,
            sum(vw_ajustes_manuais_v1.delta_assinado) AS valor
           FROM public.vw_ajustes_manuais_v1
          GROUP BY vw_ajustes_manuais_v1.caixa_nome) ajustes ON ((ajustes.caixa_nome = v1.caixa_nome)))
  ORDER BY (abs(round((v1.v1_saldo_calculado - v2.v2_saldo_calculado), 2))) DESC;


--
-- Name: vw_roc_opcoes_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_roc_opcoes_v2 WITH (security_invoker='true') AS
 WITH cdi AS (
         SELECT indicadores.valor AS cdi_mensal
           FROM public.indicadores
          WHERE (indicadores.nome = 'CDI_MENSAL_ATUAL'::text)
          ORDER BY indicadores.data_calculo DESC
         LIMIT 1
        ), base AS (
         SELECT investimentos.ticker,
            investimentos.ativo_subjacente,
            investimentos.quantidade,
            investimentos.preco_exercicio,
            investimentos.premio_recebido,
            investimentos.data_operacao,
            investimentos.data_vencimento,
            (investimentos.data_vencimento < CURRENT_DATE) AS vencida,
                CASE
                    WHEN (investimentos.data_vencimento < CURRENT_DATE) THEN investimentos.data_vencimento
                    ELSE CURRENT_DATE
                END AS data_referencia,
            round((abs(investimentos.quantidade) / (100)::numeric)) AS contratos
           FROM public.investimentos
          WHERE (investimentos.tipo = 'opcoes'::text)
        ), calc AS (
         SELECT b.ticker,
            b.ativo_subjacente,
            b.quantidade,
            b.preco_exercicio,
            b.premio_recebido,
            b.data_operacao,
            b.data_vencimento,
            b.vencida,
            b.data_referencia,
            b.contratos,
            GREATEST((b.data_referencia - b.data_operacao), 1) AS dias_operacao,
            round(((b.preco_exercicio * (100)::numeric) * b.contratos), 2) AS capital_travado
           FROM base b
        )
 SELECT c.ticker,
    c.ativo_subjacente,
    c.vencida,
    c.contratos,
    c.dias_operacao,
    c.capital_travado,
    c.premio_recebido AS premio_liquido,
    round((c.premio_recebido / c.capital_travado), 6) AS rentabilidade,
    round((((c.premio_recebido / c.capital_travado) * (30)::numeric) / (c.dias_operacao)::numeric), 6) AS rentabilidade_mensal,
    round((power(((1)::numeric + (c.premio_recebido / c.capital_travado)), (365.0 / (c.dias_operacao)::numeric)) - (1)::numeric), 6) AS rentabilidade_anual,
    round(((((c.premio_recebido / c.capital_travado) * (30)::numeric) / (c.dias_operacao)::numeric) / (cdi.cdi_mensal / (100)::numeric)), 4) AS comparacao_cdi,
    cdi.cdi_mensal
   FROM (calc c
     CROSS JOIN cdi)
  ORDER BY c.data_vencimento;


--
-- Name: vw_roc_carteira_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_roc_carteira_v2 WITH (security_invoker='true') AS
 WITH itens_ativos AS (
         SELECT vw_roc_opcoes_v2.ticker,
            vw_roc_opcoes_v2.ativo_subjacente,
            vw_roc_opcoes_v2.vencida,
            vw_roc_opcoes_v2.contratos,
            vw_roc_opcoes_v2.dias_operacao,
            vw_roc_opcoes_v2.capital_travado,
            vw_roc_opcoes_v2.premio_liquido,
            vw_roc_opcoes_v2.rentabilidade,
            vw_roc_opcoes_v2.rentabilidade_mensal,
            vw_roc_opcoes_v2.rentabilidade_anual,
            vw_roc_opcoes_v2.comparacao_cdi,
            vw_roc_opcoes_v2.cdi_mensal
           FROM public.vw_roc_opcoes_v2
          WHERE (NOT vw_roc_opcoes_v2.vencida)
        ), agregado AS (
         SELECT round(sum(itens_ativos.capital_travado), 2) AS capital_travado,
            round(sum(itens_ativos.premio_liquido), 2) AS premio_liquido,
            round(avg(itens_ativos.dias_operacao)) AS dias_medios,
            max(itens_ativos.cdi_mensal) AS cdi_mensal,
            count(*) AS qtd_itens
           FROM itens_ativos
        )
 SELECT capital_travado,
    premio_liquido,
    dias_medios,
    cdi_mensal,
    round((premio_liquido / NULLIF(capital_travado, (0)::numeric)), 6) AS rentabilidade,
    round((((premio_liquido / NULLIF(capital_travado, (0)::numeric)) * (30)::numeric) / NULLIF(dias_medios, (0)::numeric)), 6) AS rentabilidade_mensal,
    round((power(((1)::numeric + (premio_liquido / NULLIF(capital_travado, (0)::numeric))), (365.0 / NULLIF(dias_medios, (0)::numeric))) - (1)::numeric), 6) AS rentabilidade_anualizada,
    round(((((premio_liquido / NULLIF(capital_travado, (0)::numeric)) * (30)::numeric) / NULLIF(dias_medios, (0)::numeric)) / (cdi_mensal / (100)::numeric)), 4) AS comparacao_cdi,
    ( SELECT count(*) AS count
           FROM public.investimentos
          WHERE ((investimentos.tipo = 'opcoes'::text) AND (investimentos.preco_exercicio IS NULL))) AS itens_sem_strike,
    ( SELECT count(*) AS count
           FROM public.vw_roc_opcoes_v2
          WHERE vw_roc_opcoes_v2.vencida) AS itens_vencidos_excluidos
   FROM agregado a;


--
-- Name: vw_saude_jobs; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_saude_jobs WITH (security_invoker='true') AS
 SELECT DISTINCT ON (job_nome) job_nome,
    executado_em AS ultima_execucao,
    status AS ultimo_status,
    detalhe AS ultimo_detalhe,
    (EXTRACT(epoch FROM (now() - executado_em)) / 3600.0) AS horas_desde_ultima_execucao
   FROM public.execucoes_jobs
  ORDER BY job_nome, executado_em DESC;


--
-- Name: vw_transacoes_cartao_variavel_por_pessoa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_transacoes_cartao_variavel_por_pessoa WITH (security_invoker='true') AS
 SELECT u.nome AS usuario_nome,
    u.id AS usuario_id,
    t.tx_legado,
    t.data,
    t.descricao,
    t.valor
   FROM ((public.transacoes t
     JOIN public.caixas c ON (((c.id = t.caixa_id) AND (c.nome = 'Caixa Variável'::text))))
     JOIN public.usuarios u ON ((u.id = t.usuario_id)))
  WHERE ((t.afeta_saldo_real = false) AND (t.cartao_id IS NOT NULL) AND (t.ja_orcado_assinaturas = false) AND ((c.ciclo_inicio_em IS NULL) OR (t.data >= c.ciclo_inicio_em) OR (t.data IS NULL)))
  ORDER BY t.data DESC NULLS LAST;


--
-- Name: aplicacoes_ozivy aplicacoes_ozivy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aplicacoes_ozivy
    ADD CONSTRAINT aplicacoes_ozivy_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: backups backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);


--
-- Name: caixas caixas_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixas
    ADD CONSTRAINT caixas_nome_key UNIQUE (nome);


--
-- Name: caixas caixas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixas
    ADD CONSTRAINT caixas_pkey PRIMARY KEY (id);


--
-- Name: cartoes cartoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_pkey PRIMARY KEY (id);


--
-- Name: categorias categorias_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_nome_key UNIQUE (nome);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: ciclos_financeiros_snapshots ciclos_financeiros_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciclos_financeiros_snapshots
    ADD CONSTRAINT ciclos_financeiros_snapshots_pkey PRIMARY KEY (ciclo_key);


--
-- Name: ciclos_solares ciclos_solares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciclos_solares
    ADD CONSTRAINT ciclos_solares_pkey PRIMARY KEY (id);


--
-- Name: contas_bancarias contas_bancarias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_bancarias
    ADD CONSTRAINT contas_bancarias_pkey PRIMARY KEY (id);


--
-- Name: cotacoes_acoes cotacoes_acoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotacoes_acoes
    ADD CONSTRAINT cotacoes_acoes_pkey PRIMARY KEY (ticker);


--
-- Name: cronograma_assinaturas cronograma_assinaturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cronograma_assinaturas
    ADD CONSTRAINT cronograma_assinaturas_pkey PRIMARY KEY (id);


--
-- Name: cronograma_boletos_fixos cronograma_boletos_fixos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cronograma_boletos_fixos
    ADD CONSTRAINT cronograma_boletos_fixos_pkey PRIMARY KEY (tx);


--
-- Name: cronograma_consorcios cronograma_consorcios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cronograma_consorcios
    ADD CONSTRAINT cronograma_consorcios_pkey PRIMARY KEY (id);


--
-- Name: cronograma_doacoes cronograma_doacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cronograma_doacoes
    ADD CONSTRAINT cronograma_doacoes_pkey PRIMARY KEY (id);


--
-- Name: cronograma_recorrencias cronograma_recorrencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cronograma_recorrencias
    ADD CONSTRAINT cronograma_recorrencias_pkey PRIMARY KEY (id);


--
-- Name: emprestimos_internos emprestimos_internos_codigo_legado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emprestimos_internos
    ADD CONSTRAINT emprestimos_internos_codigo_legado_key UNIQUE (codigo_legado);


--
-- Name: emprestimos_internos emprestimos_internos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emprestimos_internos
    ADD CONSTRAINT emprestimos_internos_pkey PRIMARY KEY (id);


--
-- Name: energia_solar_consumo_referencia energia_solar_consumo_referencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_solar_consumo_referencia
    ADD CONSTRAINT energia_solar_consumo_referencia_pkey PRIMARY KEY (casa);


--
-- Name: energia_solar_geracao_diaria energia_solar_geracao_diaria_data_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_solar_geracao_diaria
    ADD CONSTRAINT energia_solar_geracao_diaria_data_key UNIQUE (data);


--
-- Name: energia_solar_geracao_diaria energia_solar_geracao_diaria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_solar_geracao_diaria
    ADD CONSTRAINT energia_solar_geracao_diaria_pkey PRIMARY KEY (id);


--
-- Name: energia_solar_geracao_intraday energia_solar_geracao_intraday_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_solar_geracao_intraday
    ADD CONSTRAINT energia_solar_geracao_intraday_pkey PRIMARY KEY (id);


--
-- Name: energia_solar_leituras energia_solar_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_solar_leituras
    ADD CONSTRAINT energia_solar_leituras_pkey PRIMARY KEY (id);


--
-- Name: energia_solar_medicoes_tempo_real energia_solar_medicoes_tempo_real_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_solar_medicoes_tempo_real
    ADD CONSTRAINT energia_solar_medicoes_tempo_real_pkey PRIMARY KEY (id);


--
-- Name: erros_cliente erros_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erros_cliente
    ADD CONSTRAINT erros_cliente_pkey PRIMARY KEY (id);


--
-- Name: execucoes_jobs execucoes_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.execucoes_jobs
    ADD CONSTRAINT execucoes_jobs_pkey PRIMARY KEY (id);


--
-- Name: financiamentos financiamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_pkey PRIMARY KEY (id);


--
-- Name: indicadores indicadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicadores
    ADD CONSTRAINT indicadores_pkey PRIMARY KEY (id);


--
-- Name: investimentos investimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investimentos
    ADD CONSTRAINT investimentos_pkey PRIMARY KEY (id);


--
-- Name: legendas legendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legendas
    ADD CONSTRAINT legendas_pkey PRIMARY KEY (id);


--
-- Name: mercadopago_eventos mercadopago_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadopago_eventos
    ADD CONSTRAINT mercadopago_eventos_pkey PRIMARY KEY (id);


--
-- Name: metas metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_pkey PRIMARY KEY (id);


--
-- Name: parametros_gerais parametros_gerais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_gerais
    ADD CONSTRAINT parametros_gerais_pkey PRIMARY KEY (nome);


--
-- Name: parametros_solares parametros_solares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_solares
    ADD CONSTRAINT parametros_solares_pkey PRIMARY KEY (chave);


--
-- Name: parcelas parcelas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcelas
    ADD CONSTRAINT parcelas_pkey PRIMARY KEY (id);


--
-- Name: patrimonio patrimonio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patrimonio
    ADD CONSTRAINT patrimonio_pkey PRIMARY KEY (id);


--
-- Name: pesagens pesagens_data_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesagens
    ADD CONSTRAINT pesagens_data_key UNIQUE (data);


--
-- Name: pesagens pesagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesagens
    ADD CONSTRAINT pesagens_pkey PRIMARY KEY (id);


--
-- Name: pib_wallace_historico pib_wallace_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pib_wallace_historico
    ADD CONSTRAINT pib_wallace_historico_pkey PRIMARY KEY (mes);


--
-- Name: pluggy_conexoes pluggy_conexoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_conexoes
    ADD CONSTRAINT pluggy_conexoes_pkey PRIMARY KEY (item_id);


--
-- Name: pluggy_contas pluggy_contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_contas
    ADD CONSTRAINT pluggy_contas_pkey PRIMARY KEY (id);


--
-- Name: pluggy_investimentos pluggy_investimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_investimentos
    ADD CONSTRAINT pluggy_investimentos_pkey PRIMARY KEY (id);


--
-- Name: pluggy_saldos_reservados pluggy_saldos_reservados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_saldos_reservados
    ADD CONSTRAINT pluggy_saldos_reservados_pkey PRIMARY KEY (id);


--
-- Name: pluggy_transacoes pluggy_transacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_transacoes
    ADD CONSTRAINT pluggy_transacoes_pkey PRIMARY KEY (id);


--
-- Name: pluggy_triagem pluggy_triagem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_triagem
    ADD CONSTRAINT pluggy_triagem_pkey PRIMARY KEY (id_externo);


--
-- Name: pluggy_webhook_eventos pluggy_webhook_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_webhook_eventos
    ADD CONSTRAINT pluggy_webhook_eventos_pkey PRIMARY KEY (id);


--
-- Name: reembolso_wartsila_ciclo reembolso_wartsila_ciclo_ciclo_referencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reembolso_wartsila_ciclo
    ADD CONSTRAINT reembolso_wartsila_ciclo_ciclo_referencia_key UNIQUE (ciclo_referencia);


--
-- Name: reembolso_wartsila_ciclo reembolso_wartsila_ciclo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reembolso_wartsila_ciclo
    ADD CONSTRAINT reembolso_wartsila_ciclo_pkey PRIMARY KEY (id);


--
-- Name: reembolso_wartsila_recebimentos reembolso_wartsila_recebimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reembolso_wartsila_recebimentos
    ADD CONSTRAINT reembolso_wartsila_recebimentos_pkey PRIMARY KEY (id);


--
-- Name: reembolsos reembolsos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reembolsos
    ADD CONSTRAINT reembolsos_pkey PRIMARY KEY (id);


--
-- Name: regras_classificacao regras_classificacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_classificacao
    ADD CONSTRAINT regras_classificacao_pkey PRIMARY KEY (id);


--
-- Name: regras_resolver_caixa regras_resolver_caixa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_resolver_caixa
    ADD CONSTRAINT regras_resolver_caixa_pkey PRIMARY KEY (id);


--
-- Name: solar_compartilhamentos solar_compartilhamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_compartilhamentos
    ADD CONSTRAINT solar_compartilhamentos_pkey PRIMARY KEY (id);


--
-- Name: solar_compartilhamentos solar_compartilhamentos_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solar_compartilhamentos
    ADD CONSTRAINT solar_compartilhamentos_token_key UNIQUE (token);


--
-- Name: subcategorias subcategorias_categoria_id_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_categoria_id_nome_key UNIQUE (categoria_id, nome);


--
-- Name: subcategorias subcategorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_pkey PRIMARY KEY (id);


--
-- Name: transacoes transacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT transacoes_pkey PRIMARY KEY (id);


--
-- Name: transacoes uq_transacoes_pluggy_tx_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT uq_transacoes_pluggy_tx_id UNIQUE (pluggy_tx_id);


--
-- Name: transacoes uq_transacoes_tx_legado_caixa_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT uq_transacoes_tx_legado_caixa_id UNIQUE (tx_legado, caixa_id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: v1_v2_caixa_mapa v1_v2_caixa_mapa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.v1_v2_caixa_mapa
    ADD CONSTRAINT v1_v2_caixa_mapa_pkey PRIMARY KEY (caixa_nome);


--
-- Name: wallace_dados wallace_dados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallace_dados
    ADD CONSTRAINT wallace_dados_pkey PRIMARY KEY (id);


--
-- Name: ciclos_solares_um_aberto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ciclos_solares_um_aberto_idx ON public.ciclos_solares USING btree (status) WHERE (status = 'aberto'::text);


--
-- Name: energia_solar_geracao_intraday_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX energia_solar_geracao_intraday_data_idx ON public.energia_solar_geracao_intraday USING btree (data, capturado_em);


--
-- Name: energia_solar_medicoes_tempo_real_capturado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX energia_solar_medicoes_tempo_real_capturado_em_idx ON public.energia_solar_medicoes_tempo_real USING btree (capturado_em DESC);


--
-- Name: idx_audit_log_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_origem ON public.audit_log USING btree (origem, alterado_em DESC);


--
-- Name: idx_audit_log_registro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_registro ON public.audit_log USING btree (tabela, registro_id, alterado_em DESC);


--
-- Name: idx_cartoes_dono_real_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cartoes_dono_real_id ON public.cartoes USING btree (dono_real_id);


--
-- Name: idx_cartoes_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cartoes_usuario_id ON public.cartoes USING btree (usuario_id);


--
-- Name: idx_ciclos_solares_leitura_fechamento_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ciclos_solares_leitura_fechamento_id ON public.ciclos_solares USING btree (leitura_fechamento_id);


--
-- Name: idx_ciclos_solares_leitura_inicio_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ciclos_solares_leitura_inicio_id ON public.ciclos_solares USING btree (leitura_inicio_id);


--
-- Name: idx_contas_bancarias_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contas_bancarias_usuario_id ON public.contas_bancarias USING btree (usuario_id);


--
-- Name: idx_emprestimos_internos_caixa_credora_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emprestimos_internos_caixa_credora_id ON public.emprestimos_internos USING btree (caixa_credora_id);


--
-- Name: idx_emprestimos_internos_caixa_devedora_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emprestimos_internos_caixa_devedora_id ON public.emprestimos_internos USING btree (caixa_devedora_id);


--
-- Name: idx_emprestimos_internos_transacao_quitacao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emprestimos_internos_transacao_quitacao_id ON public.emprestimos_internos USING btree (transacao_quitacao_id);


--
-- Name: idx_energia_leituras_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_energia_leituras_data ON public.energia_solar_leituras USING btree (data);


--
-- Name: idx_energia_solar_leituras_ciclo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_energia_solar_leituras_ciclo_id ON public.energia_solar_leituras USING btree (ciclo_id);


--
-- Name: idx_execucoes_jobs_nome_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_execucoes_jobs_nome_data ON public.execucoes_jobs USING btree (job_nome, executado_em DESC);


--
-- Name: idx_financiamentos_patrimonio_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financiamentos_patrimonio_id ON public.financiamentos USING btree (patrimonio_id);


--
-- Name: idx_indicadores_nome_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indicadores_nome_data ON public.indicadores USING btree (nome, data_calculo);


--
-- Name: idx_parcelas_cartao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcelas_cartao_id ON public.parcelas USING btree (cartao_id);


--
-- Name: idx_parcelas_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcelas_origem ON public.parcelas USING btree (transacao_origem_id);


--
-- Name: idx_patrimonio_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patrimonio_snapshot ON public.patrimonio USING btree (data_snapshot);


--
-- Name: idx_pluggy_contas_conexao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pluggy_contas_conexao_id ON public.pluggy_contas USING btree (conexao_id);


--
-- Name: idx_pluggy_transacoes_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pluggy_transacoes_conta_id ON public.pluggy_transacoes USING btree (conta_id);


--
-- Name: idx_reembolso_wartsila_recebimentos_ciclo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reembolso_wartsila_recebimentos_ciclo_id ON public.reembolso_wartsila_recebimentos USING btree (ciclo_id);


--
-- Name: idx_reembolso_wartsila_recebimentos_transacao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reembolso_wartsila_recebimentos_transacao_id ON public.reembolso_wartsila_recebimentos USING btree (transacao_id);


--
-- Name: idx_reembolsos_transacao_origem_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reembolsos_transacao_origem_id ON public.reembolsos USING btree (transacao_origem_id);


--
-- Name: idx_regras_classificacao_caixa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regras_classificacao_caixa_id ON public.regras_classificacao USING btree (caixa_id);


--
-- Name: idx_regras_classificacao_categoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regras_classificacao_categoria_id ON public.regras_classificacao USING btree (categoria_id);


--
-- Name: idx_regras_classificacao_subcategoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regras_classificacao_subcategoria_id ON public.regras_classificacao USING btree (subcategoria_id);


--
-- Name: idx_regras_prioridade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regras_prioridade ON public.regras_classificacao USING btree (prioridade);


--
-- Name: idx_regras_resolver_caixa_caixa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regras_resolver_caixa_caixa_id ON public.regras_resolver_caixa USING btree (caixa_id);


--
-- Name: idx_regras_resolver_caixa_categoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regras_resolver_caixa_categoria_id ON public.regras_resolver_caixa USING btree (categoria_id);


--
-- Name: idx_regras_resolver_caixa_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regras_resolver_caixa_usuario_id ON public.regras_resolver_caixa USING btree (usuario_id);


--
-- Name: idx_transacoes_caixa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacoes_caixa ON public.transacoes USING btree (caixa_id);


--
-- Name: idx_transacoes_cartao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacoes_cartao ON public.transacoes USING btree (cartao_id);


--
-- Name: idx_transacoes_categoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacoes_categoria_id ON public.transacoes USING btree (categoria_id);


--
-- Name: idx_transacoes_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacoes_data ON public.transacoes USING btree (data);


--
-- Name: idx_transacoes_pluggy_tx_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transacoes_pluggy_tx_id ON public.transacoes USING btree (pluggy_tx_id) WHERE (pluggy_tx_id IS NOT NULL);


--
-- Name: idx_transacoes_subcategoria_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacoes_subcategoria_id ON public.transacoes USING btree (subcategoria_id);


--
-- Name: idx_transacoes_tx_legado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacoes_tx_legado ON public.transacoes USING btree (tx_legado);


--
-- Name: idx_transacoes_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transacoes_usuario_id ON public.transacoes USING btree (usuario_id);


--
-- Name: pesagens_data_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pesagens_data_idx ON public.pesagens USING btree (data DESC);


--
-- Name: cotacoes_acoes trg_atualizado_em_cotacoes_acoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_atualizado_em_cotacoes_acoes BEFORE INSERT OR UPDATE ON public.cotacoes_acoes FOR EACH ROW EXECUTE FUNCTION public.marcar_atualizado_em();


--
-- Name: cronograma_assinaturas trg_atualizado_em_cronograma_assinaturas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_atualizado_em_cronograma_assinaturas BEFORE INSERT OR UPDATE ON public.cronograma_assinaturas FOR EACH ROW EXECUTE FUNCTION public.marcar_atualizado_em();


--
-- Name: cronograma_consorcios trg_atualizado_em_cronograma_consorcios; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_atualizado_em_cronograma_consorcios BEFORE INSERT OR UPDATE ON public.cronograma_consorcios FOR EACH ROW EXECUTE FUNCTION public.marcar_atualizado_em();


--
-- Name: cronograma_doacoes trg_atualizado_em_cronograma_doacoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_atualizado_em_cronograma_doacoes BEFORE INSERT OR UPDATE ON public.cronograma_doacoes FOR EACH ROW EXECUTE FUNCTION public.marcar_atualizado_em();


--
-- Name: cronograma_recorrencias trg_atualizado_em_cronograma_recorrencias; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_atualizado_em_cronograma_recorrencias BEFORE INSERT OR UPDATE ON public.cronograma_recorrencias FOR EACH ROW EXECUTE FUNCTION public.marcar_atualizado_em();


--
-- Name: energia_solar_geracao_diaria trg_atualizado_em_geracao_diaria; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_atualizado_em_geracao_diaria BEFORE INSERT OR UPDATE ON public.energia_solar_geracao_diaria FOR EACH ROW EXECUTE FUNCTION public.marcar_atualizado_em();


--
-- Name: caixas trg_audit_caixas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_caixas AFTER INSERT OR DELETE OR UPDATE ON public.caixas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: indicadores trg_audit_indicadores; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_indicadores AFTER INSERT OR DELETE OR UPDATE ON public.indicadores FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: transacoes trg_audit_transacoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_transacoes AFTER INSERT OR DELETE OR UPDATE ON public.transacoes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: transacoes trg_auto_categorizar_transacao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_categorizar_transacao BEFORE INSERT OR UPDATE ON public.transacoes FOR EACH ROW EXECUTE FUNCTION public.fn_auto_categorizar_transacao();


--
-- Name: transacoes trg_gerar_tx_legado_automatico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gerar_tx_legado_automatico BEFORE INSERT ON public.transacoes FOR EACH ROW EXECUTE FUNCTION public.gerar_tx_legado_automatico();


--
-- Name: energia_solar_leituras trg_valida_plausibilidade_leitura_solar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_valida_plausibilidade_leitura_solar BEFORE INSERT OR UPDATE OF leitura_03, leitura_103, data ON public.energia_solar_leituras FOR EACH ROW WHEN ((new.casa = 'mae'::text)) EXECUTE FUNCTION public.validar_plausibilidade_leitura_solar();


--
-- Name: cartoes cartoes_dono_real_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_dono_real_id_fkey FOREIGN KEY (dono_real_id) REFERENCES public.usuarios(id);


--
-- Name: cartoes cartoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cartoes
    ADD CONSTRAINT cartoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: ciclos_solares ciclos_solares_leitura_fechamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciclos_solares
    ADD CONSTRAINT ciclos_solares_leitura_fechamento_id_fkey FOREIGN KEY (leitura_fechamento_id) REFERENCES public.energia_solar_leituras(id);


--
-- Name: ciclos_solares ciclos_solares_leitura_inicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciclos_solares
    ADD CONSTRAINT ciclos_solares_leitura_inicio_id_fkey FOREIGN KEY (leitura_inicio_id) REFERENCES public.energia_solar_leituras(id);


--
-- Name: contas_bancarias contas_bancarias_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contas_bancarias
    ADD CONSTRAINT contas_bancarias_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: emprestimos_internos emprestimos_internos_caixa_credora_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emprestimos_internos
    ADD CONSTRAINT emprestimos_internos_caixa_credora_id_fkey FOREIGN KEY (caixa_credora_id) REFERENCES public.caixas(id);


--
-- Name: emprestimos_internos emprestimos_internos_caixa_devedora_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emprestimos_internos
    ADD CONSTRAINT emprestimos_internos_caixa_devedora_id_fkey FOREIGN KEY (caixa_devedora_id) REFERENCES public.caixas(id);


--
-- Name: emprestimos_internos emprestimos_internos_transacao_quitacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emprestimos_internos
    ADD CONSTRAINT emprestimos_internos_transacao_quitacao_id_fkey FOREIGN KEY (transacao_quitacao_id) REFERENCES public.transacoes(id);


--
-- Name: energia_solar_leituras energia_solar_leituras_ciclo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_solar_leituras
    ADD CONSTRAINT energia_solar_leituras_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES public.ciclos_solares(id);


--
-- Name: financiamentos financiamentos_patrimonio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiamentos
    ADD CONSTRAINT financiamentos_patrimonio_id_fkey FOREIGN KEY (patrimonio_id) REFERENCES public.patrimonio(id);


--
-- Name: parcelas parcelas_cartao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcelas
    ADD CONSTRAINT parcelas_cartao_id_fkey FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id);


--
-- Name: parcelas parcelas_transacao_origem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcelas
    ADD CONSTRAINT parcelas_transacao_origem_id_fkey FOREIGN KEY (transacao_origem_id) REFERENCES public.transacoes(id);


--
-- Name: pluggy_contas pluggy_contas_conexao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_contas
    ADD CONSTRAINT pluggy_contas_conexao_id_fkey FOREIGN KEY (conexao_id) REFERENCES public.pluggy_conexoes(item_id) ON DELETE CASCADE;


--
-- Name: pluggy_investimentos pluggy_investimentos_conexao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_investimentos
    ADD CONSTRAINT pluggy_investimentos_conexao_id_fkey FOREIGN KEY (conexao_id) REFERENCES public.pluggy_conexoes(item_id) ON DELETE CASCADE;


--
-- Name: pluggy_saldos_reservados pluggy_saldos_reservados_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_saldos_reservados
    ADD CONSTRAINT pluggy_saldos_reservados_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.pluggy_contas(id) ON DELETE CASCADE;


--
-- Name: pluggy_transacoes pluggy_transacoes_conta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pluggy_transacoes
    ADD CONSTRAINT pluggy_transacoes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES public.pluggy_contas(id) ON DELETE CASCADE;


--
-- Name: reembolso_wartsila_recebimentos reembolso_wartsila_recebimentos_ciclo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reembolso_wartsila_recebimentos
    ADD CONSTRAINT reembolso_wartsila_recebimentos_ciclo_id_fkey FOREIGN KEY (ciclo_id) REFERENCES public.reembolso_wartsila_ciclo(id);


--
-- Name: reembolso_wartsila_recebimentos reembolso_wartsila_recebimentos_transacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reembolso_wartsila_recebimentos
    ADD CONSTRAINT reembolso_wartsila_recebimentos_transacao_id_fkey FOREIGN KEY (transacao_id) REFERENCES public.transacoes(id);


--
-- Name: reembolsos reembolsos_transacao_origem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reembolsos
    ADD CONSTRAINT reembolsos_transacao_origem_id_fkey FOREIGN KEY (transacao_origem_id) REFERENCES public.transacoes(id);


--
-- Name: regras_classificacao regras_classificacao_caixa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_classificacao
    ADD CONSTRAINT regras_classificacao_caixa_id_fkey FOREIGN KEY (caixa_id) REFERENCES public.caixas(id);


--
-- Name: regras_classificacao regras_classificacao_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_classificacao
    ADD CONSTRAINT regras_classificacao_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: regras_classificacao regras_classificacao_subcategoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_classificacao
    ADD CONSTRAINT regras_classificacao_subcategoria_id_fkey FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id);


--
-- Name: regras_resolver_caixa regras_resolver_caixa_caixa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_resolver_caixa
    ADD CONSTRAINT regras_resolver_caixa_caixa_id_fkey FOREIGN KEY (caixa_id) REFERENCES public.caixas(id);


--
-- Name: regras_resolver_caixa regras_resolver_caixa_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_resolver_caixa
    ADD CONSTRAINT regras_resolver_caixa_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: regras_resolver_caixa regras_resolver_caixa_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_resolver_caixa
    ADD CONSTRAINT regras_resolver_caixa_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: subcategorias subcategorias_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: transacoes transacoes_caixa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT transacoes_caixa_id_fkey FOREIGN KEY (caixa_id) REFERENCES public.caixas(id);


--
-- Name: transacoes transacoes_cartao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT transacoes_cartao_id_fkey FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id);


--
-- Name: transacoes transacoes_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT transacoes_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: transacoes transacoes_subcategoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT transacoes_subcategoria_id_fkey FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id);


--
-- Name: transacoes transacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transacoes
    ADD CONSTRAINT transacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: v1_v2_caixa_mapa v1_v2_caixa_mapa_caixa_nome_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.v1_v2_caixa_mapa
    ADD CONSTRAINT v1_v2_caixa_mapa_caixa_nome_fkey FOREIGN KEY (caixa_nome) REFERENCES public.caixas(nome);


--
-- Name: wallace_dados Escrita via service role (delete); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrita via service role (delete)" ON public.wallace_dados FOR DELETE USING ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: wallace_dados Escrita via service role (insert); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrita via service role (insert)" ON public.wallace_dados FOR INSERT WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: wallace_dados Escrita via service role (update); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrita via service role (update)" ON public.wallace_dados FOR UPDATE USING ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: parametros_gerais Leitura pública parametros_gerais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura pública parametros_gerais" ON public.parametros_gerais FOR SELECT USING (true);


--
-- Name: aplicacoes_ozivy Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.aplicacoes_ozivy FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: caixas Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.caixas FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: cartoes Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.cartoes FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: categorias Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.categorias FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: ciclos_financeiros_snapshots Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.ciclos_financeiros_snapshots FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: ciclos_solares Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.ciclos_solares FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: contas_bancarias Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.contas_bancarias FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: cronograma_boletos_fixos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.cronograma_boletos_fixos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: emprestimos_internos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.emprestimos_internos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: energia_solar_consumo_referencia Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.energia_solar_consumo_referencia FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: energia_solar_geracao_diaria Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.energia_solar_geracao_diaria FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: energia_solar_geracao_intraday Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.energia_solar_geracao_intraday FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: energia_solar_leituras Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.energia_solar_leituras FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: energia_solar_medicoes_tempo_real Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.energia_solar_medicoes_tempo_real FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: financiamentos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.financiamentos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: indicadores Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.indicadores FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: investimentos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.investimentos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: mercadopago_eventos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.mercadopago_eventos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: metas Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.metas FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: parcelas Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.parcelas FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: patrimonio Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.patrimonio FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: pesagens Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pesagens FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: pluggy_conexoes Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pluggy_conexoes FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: pluggy_contas Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pluggy_contas FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: pluggy_investimentos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pluggy_investimentos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: pluggy_saldos_reservados Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pluggy_saldos_reservados FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: pluggy_transacoes Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pluggy_transacoes FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: reembolso_wartsila_ciclo Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.reembolso_wartsila_ciclo FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: reembolso_wartsila_recebimentos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.reembolso_wartsila_recebimentos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: reembolsos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.reembolsos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: regras_classificacao Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.regras_classificacao FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: regras_resolver_caixa Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.regras_resolver_caixa FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: subcategorias Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.subcategorias FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: transacoes Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.transacoes FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: usuarios Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.usuarios FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: v1_v2_caixa_mapa Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.v1_v2_caixa_mapa FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: cotacoes_acoes Leitura via anon key (site publico); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura via anon key (site publico)" ON public.cotacoes_acoes FOR SELECT USING (true);


--
-- Name: wallace_dados Leitura via anon key (site publico); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura via anon key (site publico)" ON public.wallace_dados FOR SELECT TO authenticated, anon USING (true);


--
-- Name: aplicacoes_ozivy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aplicacoes_ozivy ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_select_authenticated ON public.audit_log FOR SELECT TO authenticated USING (true);


--
-- Name: backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

--
-- Name: caixas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

--
-- Name: cartoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: ciclos_financeiros_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ciclos_financeiros_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: ciclos_solares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ciclos_solares ENABLE ROW LEVEL SECURITY;

--
-- Name: contas_bancarias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;

--
-- Name: cotacoes_acoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cotacoes_acoes ENABLE ROW LEVEL SECURITY;

--
-- Name: cronograma_assinaturas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cronograma_assinaturas ENABLE ROW LEVEL SECURITY;

--
-- Name: cronograma_boletos_fixos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cronograma_boletos_fixos ENABLE ROW LEVEL SECURITY;

--
-- Name: cronograma_consorcios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cronograma_consorcios ENABLE ROW LEVEL SECURITY;

--
-- Name: cronograma_doacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cronograma_doacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: cronograma_recorrencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cronograma_recorrencias ENABLE ROW LEVEL SECURITY;

--
-- Name: emprestimos_internos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emprestimos_internos ENABLE ROW LEVEL SECURITY;

--
-- Name: energia_solar_consumo_referencia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.energia_solar_consumo_referencia ENABLE ROW LEVEL SECURITY;

--
-- Name: energia_solar_geracao_diaria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.energia_solar_geracao_diaria ENABLE ROW LEVEL SECURITY;

--
-- Name: energia_solar_geracao_intraday; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.energia_solar_geracao_intraday ENABLE ROW LEVEL SECURITY;

--
-- Name: energia_solar_leituras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.energia_solar_leituras ENABLE ROW LEVEL SECURITY;

--
-- Name: energia_solar_medicoes_tempo_real; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.energia_solar_medicoes_tempo_real ENABLE ROW LEVEL SECURITY;

--
-- Name: erros_cliente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.erros_cliente ENABLE ROW LEVEL SECURITY;

--
-- Name: execucoes_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.execucoes_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: execucoes_jobs execucoes_jobs_select_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY execucoes_jobs_select_publica ON public.execucoes_jobs FOR SELECT USING (true);


--
-- Name: financiamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financiamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: indicadores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.indicadores ENABLE ROW LEVEL SECURITY;

--
-- Name: investimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: legendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.legendas ENABLE ROW LEVEL SECURITY;

--
-- Name: legendas legendas_select_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY legendas_select_publica ON public.legendas FOR SELECT USING (true);


--
-- Name: cronograma_assinaturas leitura publica cronograma_assinaturas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leitura publica cronograma_assinaturas" ON public.cronograma_assinaturas FOR SELECT USING (true);


--
-- Name: cronograma_consorcios leitura publica cronograma_consorcios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leitura publica cronograma_consorcios" ON public.cronograma_consorcios FOR SELECT USING (true);


--
-- Name: cronograma_doacoes leitura publica cronograma_doacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leitura publica cronograma_doacoes" ON public.cronograma_doacoes FOR SELECT USING (true);


--
-- Name: cronograma_recorrencias leitura publica cronograma_recorrencias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leitura publica cronograma_recorrencias" ON public.cronograma_recorrencias FOR SELECT USING (true);


--
-- Name: mercadopago_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mercadopago_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: metas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_gerais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros_gerais ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_solares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros_solares ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_solares parametros_solares_select_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parametros_solares_select_publica ON public.parametros_solares FOR SELECT USING (true);


--
-- Name: parcelas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;

--
-- Name: patrimonio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.patrimonio ENABLE ROW LEVEL SECURITY;

--
-- Name: pesagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pesagens ENABLE ROW LEVEL SECURITY;

--
-- Name: pib_wallace_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pib_wallace_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: pib_wallace_historico pib_wallace_historico_select_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pib_wallace_historico_select_publica ON public.pib_wallace_historico FOR SELECT USING (true);


--
-- Name: pluggy_conexoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pluggy_conexoes ENABLE ROW LEVEL SECURITY;

--
-- Name: pluggy_contas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pluggy_contas ENABLE ROW LEVEL SECURITY;

--
-- Name: pluggy_investimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pluggy_investimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: pluggy_saldos_reservados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pluggy_saldos_reservados ENABLE ROW LEVEL SECURITY;

--
-- Name: pluggy_transacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pluggy_transacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: pluggy_triagem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pluggy_triagem ENABLE ROW LEVEL SECURITY;

--
-- Name: pluggy_triagem pluggy_triagem_select_autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pluggy_triagem_select_autenticado ON public.pluggy_triagem FOR SELECT USING (((( SELECT auth.role() AS role) = 'service_role'::text) OR ((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text))));


--
-- Name: pluggy_webhook_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pluggy_webhook_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: reembolso_wartsila_ciclo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reembolso_wartsila_ciclo ENABLE ROW LEVEL SECURITY;

--
-- Name: reembolso_wartsila_recebimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reembolso_wartsila_recebimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: reembolsos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reembolsos ENABLE ROW LEVEL SECURITY;

--
-- Name: regras_classificacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regras_classificacao ENABLE ROW LEVEL SECURITY;

--
-- Name: regras_resolver_caixa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regras_resolver_caixa ENABLE ROW LEVEL SECURITY;

--
-- Name: solar_compartilhamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solar_compartilhamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: subcategorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;

--
-- Name: transacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: v1_v2_caixa_mapa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.v1_v2_caixa_mapa ENABLE ROW LEVEL SECURITY;

--
-- Name: wallace_dados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallace_dados ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict QWNPC6eMb25sANaldROQepi5XKdLJNes9E6V2DsixnFDdwfVn1xHxG0VZ6PYDNZ

