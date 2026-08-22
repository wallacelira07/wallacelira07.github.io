--
-- PostgreSQL database dump
--

\restrict ijM8NF0sNEwGAQsBY5xAFqfkkoXRUJHjPTYSJgNpJ0UJ318VCLB20cWH4PXD2l1

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
-- Name: arquivar_inbox_historico(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.arquivar_inbox_historico() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ciclo_inicio date;
  v_mp_arquivados int := 0;
  v_mp_rejeitados_dedup int := 0;
  v_mp_rejeitados_assinatura int := 0;
  v_pluggy_historico int := 0;
  v_pluggy_dedup int := 0;
  v_pluggy_rejeitados_assinatura int := 0;
begin
  select ciclo_inicio_em into v_ciclo_inicio
  from public.caixas where nome = 'Caixa Variável' limit 1;

  if v_ciclo_inicio is null then
    return jsonb_build_object('erro', 'ciclo_inicio_em nao encontrado para Caixa Variavel, nada arquivado');
  end if;

  update public.mercadopago_eventos
  set status_triagem = 'arquivado_historico', atualizado_em = now()
  where status_triagem = 'pendente' and data < v_ciclo_inicio;
  get diagnostics v_mp_arquivados = row_count;

  update public.mercadopago_eventos me
  set status_triagem = 'rejeitado', atualizado_em = now()
  where me.status_triagem = 'pendente'
    and exists (
      select 1 from public.transacoes t
      where t.status in ('confirmado','pendente_classificacao')
        and round(abs(t.valor),2) = round(abs(me.valor),2)
        and t.data between (me.data - 20) and (me.data + 20)
    );
  get diagnostics v_mp_rejeitados_dedup = row_count;

  -- NOVO 15/08/2026 (achado do usuário: "Inbox pega minha assinatura como compra não
  -- registrada" - Claude/Anthropic com IOF variável nunca batia por valor exato com a transação
  -- real, então sobrevivia aos filtros de dedup por valor e ficava pendente pra sempre, mesmo já
  -- orçado em cronograma_assinaturas). Qualquer pendente (qualquer ciclo) cuja descrição contenha
  -- o 1o radical (>=4 letras) do nome de uma assinatura ATIVA -> rejeitado, mesmo sem bater por
  -- valor. Mesma regra já documentada no manual ("Assinaturas nunca são lançadas por esse
  -- processo"), agora automática em vez de só um aviso cosmético no client
  -- (descricaoBateAssinaturaConhecida em classificacao-inbox.js já detectava isso, só nunca
  -- filtrava).
  update public.mercadopago_eventos me
  set status_triagem = 'rejeitado', atualizado_em = now()
  where me.status_triagem = 'pendente'
    and exists (
      select 1 from public.cronograma_assinaturas ca
      where ca.ativo = true
        and length(split_part(ca.nome, ' ', 1)) >= 4
        and me.descricao ilike '%' || split_part(ca.nome, ' ', 1) || '%'
    );
  get diagnostics v_mp_rejeitados_assinatura = row_count;

  insert into public.pluggy_triagem (id_externo, status_triagem, atualizado_em)
  select 'pluggy-tx-' || t.id, 'rejeitado', now()
  from public.pluggy_transacoes t
  where t.data::date < v_ciclo_inicio
    and not exists (select 1 from public.pluggy_triagem pt where pt.id_externo = 'pluggy-tx-' || t.id)
  on conflict (id_externo) do update set status_triagem = 'rejeitado', atualizado_em = now();
  get diagnostics v_pluggy_historico = row_count;

  insert into public.pluggy_triagem (id_externo, status_triagem, atualizado_em)
  select 'pluggy-tx-' || t.id, 'rejeitado', now()
  from public.pluggy_transacoes t
  where t.data::date >= v_ciclo_inicio
    and not exists (select 1 from public.pluggy_triagem pt where pt.id_externo = 'pluggy-tx-' || t.id)
    and exists (
      select 1 from public.transacoes tr
      where tr.status in ('confirmado','pendente_classificacao')
        and round(abs(tr.valor),2) = round(abs(t.valor),2)
        and tr.data between (t.data::date - 20) and (t.data::date + 20)
    )
  on conflict (id_externo) do update set status_triagem = 'rejeitado', atualizado_em = now();
  get diagnostics v_pluggy_dedup = row_count;

  -- NOVO 15/08/2026 - mesma regra acima, versão Pluggy.
  insert into public.pluggy_triagem (id_externo, status_triagem, atualizado_em)
  select 'pluggy-tx-' || t.id, 'rejeitado', now()
  from public.pluggy_transacoes t
  where not exists (select 1 from public.pluggy_triagem pt where pt.id_externo = 'pluggy-tx-' || t.id)
    and exists (
      select 1 from public.cronograma_assinaturas ca
      where ca.ativo = true
        and length(split_part(ca.nome, ' ', 1)) >= 4
        and t.descricao ilike '%' || split_part(ca.nome, ' ', 1) || '%'
    )
  on conflict (id_externo) do update set status_triagem = 'rejeitado', atualizado_em = now();
  get diagnostics v_pluggy_rejeitados_assinatura = row_count;

  return jsonb_build_object(
    'ciclo_inicio_usado', v_ciclo_inicio,
    'mp_arquivados_historico', v_mp_arquivados,
    'mp_rejeitados_dedup_ciclo_atual', v_mp_rejeitados_dedup,
    'mp_rejeitados_assinatura_conhecida', v_mp_rejeitados_assinatura,
    'pluggy_arquivados_historico', v_pluggy_historico,
    'pluggy_rejeitados_dedup_ciclo_atual', v_pluggy_dedup,
    'pluggy_rejeitados_assinatura_conhecida', v_pluggy_rejeitados_assinatura
  );
end;
$$;


--
-- Name: FUNCTION arquivar_inbox_historico(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.arquivar_inbox_historico() IS 'Fecha o loop entre o filtro client-side da Inbox (ciclo atual + dedup por valor, já existente em
  classificacao-inbox.js/pluggy-reconciliacao.js desde 09-12/08/2026) e o estado persistido em
  mercadopago_eventos.status_triagem/pluggy_triagem — sem isso, o filtro só escondia da tela, nunca
  resolvia a linha, e as tabelas de staging cresciam para sempre. Chamada automaticamente ao final de
  atualizar_mercadopago_eventos()/atualizar_pluggy_contas() (toda sincronização via robô), então roda
  sem precisar de intervenção manual. Critério: (1) qualquer pendente com data anterior ao
  ciclo_inicio_em atual da caixa "Caixa Variável" -> arquivado_historico (nunca foi olhado, é história
  velha demais pra interessar); (2) pendente do ciclo atual cujo valor absoluto bate com uma transação
  já confirmada em transacoes dentro de uma janela de 20 dias -> rejeitado (ruído: já foi lançado por
  fora do fluxo da Inbox). Só o que sobra depois disso é pendente de verdade.';


--
-- Name: atualizar_beneficio_credito(text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_beneficio_credito(p_nome text, p_novo_saldo numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.role() is distinct from 'service_role' and (
       auth.jwt() is null
       or (auth.jwt() ->> 'iss') is distinct from 'https://securetoken.google.com/sistema-wallace-lira'
       or (auth.jwt() ->> 'aud') is distinct from 'sistema-wallace-lira'
     ) then
    raise exception 'nao autenticado - login valido ou service_role exigido';
  end if;
  update beneficios_creditos set saldo = p_novo_saldo, atualizado_em = now() where nome = p_nome;
  if not found then
    raise exception 'credito % nao encontrado', p_nome;
  end if;
end;
$$;


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

    -- NOVO 21/08/2026 (pedido do usuario: grafico de tendencia do preco desde a entrada da opcao ate
    -- o vencimento) - cotacoes_acoes so guarda o preco mais recente (sobrescrito); esta tabela nunca
    -- sobrescreve, acumula 1 linha por dia por ticker. ON CONFLICT idempotente - reexecutar no mesmo
    -- dia so atualiza o preco (fechamento do dia pode mudar entre a 1a e a ultima sincronizacao).
    INSERT INTO cotacoes_acoes_historico (ticker, data, preco_fechamento)
    VALUES (
      ticker_atual,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      (cotacoes->ticker_atual->>'preco')::numeric
    )
    ON CONFLICT (ticker, data) DO UPDATE
      SET preco_fechamento = EXCLUDED.preco_fechamento;
  END LOOP;

  INSERT INTO public.execucoes_jobs (job_nome, status)
  VALUES ('cotacoes_acoes', 'sucesso');

  RETURN cotacoes;
END;
$$;


--
-- Name: atualizar_cotacoes_opcoes(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_cotacoes_opcoes(cotacoes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  symbol_atual text;
BEGIN
  IF auth.role() IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'nao autorizado - somente service_role pode atualizar cotacoes de opcoes';
  END IF;
  FOR symbol_atual IN SELECT jsonb_object_keys(cotacoes)
  LOOP
    INSERT INTO cotacoes_opcoes (symbol, preco, atualizado_em)
    VALUES (
      symbol_atual,
      (cotacoes->symbol_atual->>'preco')::numeric,
      now()
    )
    ON CONFLICT (symbol) DO UPDATE
      SET preco = EXCLUDED.preco,
          atualizado_em = EXCLUDED.atualizado_em;
  END LOOP;

  INSERT INTO public.execucoes_jobs (job_nome, status)
  VALUES ('cotacoes_opcoes', 'sucesso');

  RETURN cotacoes;
END;
$$;


--
-- Name: atualizar_medidor_ddsu666_saj(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_medidor_ddsu666_saj(leitura jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.role() IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'nao autorizado - somente service_role pode atualizar leituras do medidor DDSU666 SAJ';
  END IF;

  INSERT INTO medidor_ddsu666_saj_leituras (tensao_v, corrente_a, potencia_ativa_w, energia_importada_kwh, energia_exportada_kwh)
  VALUES (
    (leitura->>'tensao_v')::numeric,
    (leitura->>'corrente_a')::numeric,
    (leitura->>'potencia_ativa_w')::numeric,
    (leitura->>'energia_importada_kwh')::numeric,
    (leitura->>'energia_exportada_kwh')::numeric
  );

  INSERT INTO public.execucoes_jobs (job_nome, status)
  VALUES ('medidor_ddsu666_saj', 'sucesso');

  RETURN leitura;
END;
$$;


--
-- Name: atualizar_medidor_tuya(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_medidor_tuya(leitura jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_casa text := COALESCE(leitura->>'casa', 'wallace');
BEGIN
  IF auth.role() IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'nao autorizado - somente service_role pode atualizar leituras do medidor tuya';
  END IF;

  INSERT INTO medidor_tuya_leituras (tensao_v, corrente_a, potencia_w, energia_hoje_kwh, energia_total_kwh, estado, casa)
  VALUES (
    (leitura->>'tensao_v')::numeric,
    (leitura->>'corrente_a')::numeric,
    (leitura->>'potencia_w')::numeric,
    (leitura->>'energia_hoje_kwh')::numeric,
    (leitura->>'energia_total_kwh')::numeric,
    leitura->>'estado',
    v_casa
  );

  -- CORRIGIDO 18/08/2026 (auto-achado ao generalizar pra multi-casa): job_nome do Wallace tem que
  -- continuar exatamente 'medidor_tuya' (sem sufixo) - e a chave fixa que
  -- SAUDE_JOBS_LIMIARES.medidor_tuya (hydrate-saude-operacional.js) ja monitora em producao. So
  -- casas NOVAS (Wellida em diante) ganham o sufixo, pra nao quebrar o heartbeat existente.
  INSERT INTO public.execucoes_jobs (job_nome, status)
  VALUES (CASE WHEN v_casa = 'wallace' THEN 'medidor_tuya' ELSE 'medidor_tuya_' || v_casa END, 'sucesso');

  RETURN leitura;
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
  -- CORRIGIDO 15/08/2026 (achado da auditoria de 43 especialistas: guard por blocklist
  -- IN ('anon','authenticated') divergia do padrao allowlist usado pela RPC irma
  -- atualizar_pluggy_contas e pelas demais RPCs de escrita - allowlist e' mais seguro por
  -- construcao, nao depende de listar cada role a bloquear).
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
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

  -- NOVO 14/08/2026: fecha o loop Inbox (ver comentário completo em arquivar_inbox_historico()) -
  -- arquiva pendente de ciclo passado e rejeita pendente do ciclo atual já lançado por fora, toda
  -- vez que este sync roda, pra staging nunca mais crescer sem controle.
  perform public.arquivar_inbox_historico();

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

  -- CORRIGIDO 15/08/2026 (achado da auditoria de 43 especialistas: DISTINCT ON sem ORDER BY
  -- explícito escolhe uma linha arbitrária/não-determinística entre duplicatas do mesmo lote).
  -- Tiebreaker: representação textual do JSON da conta - determinístico entre execuções, sem
  -- depender de nenhuma coluna nova. Duplicata real de conta_id só ocorre quando 2 produtos do
  -- mesmo banco compartilham "numero" (já documentado em outro comentário deste arquivo).
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
  order by conta_id, conta_json::text
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
    order by tx_id, sub.descricao, sub.valor, sub.data_tx
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
  order by investimento_id, inv_json::text
  on conflict (id) do update set
    conexao_id = excluded.conexao_id,
    tipo = excluded.tipo,
    nome = excluded.nome,
    valor = excluded.valor,
    instituicao = excluded.instituicao,
    atualizado_em = now();

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
  order by reservado_id, sub.nome, sub.valor
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

  -- NOVO 14/08/2026: mesmo fechamento de loop aplicado ao sync do Mercado Pago acima - roda a cada
  -- sincronizacao da Pluggy, arquiva pendente velho e rejeita pendente do ciclo atual ja lancado por
  -- fora (ver comentario completo em arquivar_inbox_historico()).
  perform public.arquivar_inbox_historico();

  return jsonb_build_object('conexoes', qtd_conexoes, 'contas', qtd_contas, 'transacoes', qtd_transacoes, 'investimentos', qtd_investimentos, 'saldos_reservados', qtd_reservados);
end;
$$;


--
-- Name: avancar_parcelas_ciclo_mensal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avancar_parcelas_ciclo_mensal() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- CORRIGIDO 20/08/2026 (achado real do usuário: "Visa fecha 19, Mastercard 22" — a suposição
  -- original era que PARCELAMENTOS_VISA fechava junto com o Mastercard Black dia 22, errado).
  -- PARCELAMENTOS_VISA = Visa Infinite Bradesco de verdade, fecha dia 19. Roda dia 20 (1 dia depois).
  UPDATE public.parcelas
  SET numero_parcela = numero_parcela + 1,
      status = CASE WHEN numero_parcela + 1 > total_parcelas THEN 'quitada' ELSE status END
  WHERE status = 'ativa'
    AND origem_array = 'PARCELAMENTOS_VISA';
END;
$$;


--
-- Name: FUNCTION avancar_parcelas_ciclo_mensal(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.avancar_parcelas_ciclo_mensal() IS 'Achado 20/08/2026 (auditoria de operação contínua): avanço de parcelas.numero_parcela era 100% manual. Cobre só PARCELAMENTOS_VISA (Visa Infinite Bradesco, fecha dia 19 — confirmado pelo usuário). Agendado via pg_cron, job "avancar-parcelas-visa-mensal", dia 20 de cada mês.';


--
-- Name: avancar_parcelas_mp_ciclo_mensal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avancar_parcelas_mp_ciclo_mensal() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- CORRIGIDO 20/08/2026 (achado real: PARCELAMENTOS_TERCEIROS usa o cartão "Visa MP (compra p/ Mãe,
  -- reembolsável)" — bandeira Visa mas banco Mercado Pago (cartoes.id 7158ae08...), ou seja segue o
  -- ciclo do Mercado Pago, não do Visa Infinite Bradesco, apesar do nome. Mercado Pago fecha dia 29,
  -- paga dia 04 (confirmado pelo usuário) — roda dia 1 de cada mês (sempre existe, ao contrário de
  -- dia 30 em fevereiro/abril/etc).
  UPDATE public.parcelas
  SET numero_parcela = numero_parcela + 1,
      status = CASE WHEN numero_parcela + 1 > total_parcelas THEN 'quitada' ELSE status END
  WHERE status = 'ativa'
    AND origem_array IN ('PARCELAMENTOS_MP', 'PARCELAMENTOS_TERCEIROS');
END;
$$;


--
-- Name: FUNCTION avancar_parcelas_mp_ciclo_mensal(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.avancar_parcelas_mp_ciclo_mensal() IS 'Achado 20/08/2026: cobre PARCELAMENTOS_MP e PARCELAMENTOS_TERCEIROS (ambos no cartão Mercado Pago, fecha dia 29, paga dia 04 — confirmado pelo usuário). Agendado via pg_cron, job "avancar-parcelas-mp-mensal", dia 1 de cada mês.';


--
-- Name: checar_recorrencia_existente(numeric, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checar_recorrencia_existente(p_valor numeric, p_data date DEFAULT CURRENT_DATE, p_tolerancia_dias integer DEFAULT 5) RETURNS TABLE(origem text, tx text, nome text, valor numeric, ultima_cobranca_em date, dias_de_diferenca integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT * FROM (
    SELECT 'assinatura'::text AS origem, tx, nome, valor, ultima_cobranca_em,
           CASE WHEN ultima_cobranca_em IS NULL THEN NULL ELSE abs(p_data - ultima_cobranca_em) END AS dias_de_diferenca
    FROM cronograma_assinaturas WHERE abs(valor - p_valor) < 0.02
    UNION ALL
    SELECT 'recorrencia'::text, tx, nome, valor, ultima_cobranca_em,
           CASE WHEN ultima_cobranca_em IS NULL THEN NULL ELSE abs(p_data - ultima_cobranca_em) END
    FROM cronograma_recorrencias WHERE abs(valor - p_valor) < 0.02
    UNION ALL
    SELECT 'consorcio'::text, tx, nome, valor, NULL, NULL
    FROM cronograma_consorcios WHERE abs(valor - p_valor) < 0.02
    UNION ALL
    SELECT 'doacao'::text, tx, descricao, valor, NULL, NULL
    FROM cronograma_doacoes WHERE abs(valor - p_valor) < 0.02
  ) t
  ORDER BY dias_de_diferenca NULLS LAST;
$$;


--
-- Name: FUNCTION checar_recorrencia_existente(p_valor numeric, p_data date, p_tolerancia_dias integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.checar_recorrencia_existente(p_valor numeric, p_data date, p_tolerancia_dias integer) IS 'Achado 20/08/2026 (erro real do agente, repetido apesar de memória já registrada em feedback_assinaturas_nunca_transacao_avulsa): compras avulsas de "Compras Wallace/Vanessa" às vezes são na verdade uma assinatura/recorrência/consórcio/doação já cadastrada, aparecendo na fatura com um nome de fantasia diferente do banco (ex.: "Asa*new Servicos Autom" R$59,99 = New Car Rastreador, TXRR000006). Uso obrigatório ANTES de inserir qualquer transacoes avulsa por valor/mercante desconhecido: select * from checar_recorrencia_existente(valor, data). Se retornar linha com dias_de_diferenca baixo (0-5), é quase certo que é a mesma cobrança — não duplicar.';


--
-- Name: checar_recorrencia_existente(numeric, date, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checar_recorrencia_existente(p_valor numeric, p_data date DEFAULT CURRENT_DATE, p_nome_fatura text DEFAULT NULL::text, p_tolerancia_dias integer DEFAULT 5) RETURNS TABLE(origem text, tx text, nome text, nome_fantasia_fatura text, valor numeric, ultima_cobranca_em date, dias_de_diferenca integer, bate_nome boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT * FROM (
    SELECT 'assinatura'::text AS origem, tx, nome, nome_fantasia_fatura, valor, ultima_cobranca_em,
           CASE WHEN ultima_cobranca_em IS NULL THEN NULL ELSE abs(p_data - ultima_cobranca_em) END AS dias_de_diferenca,
           (p_nome_fatura IS NOT NULL AND nome_fantasia_fatura IS NOT NULL AND nome_fantasia_fatura ILIKE '%' || p_nome_fatura || '%') AS bate_nome
    FROM cronograma_assinaturas
    WHERE abs(valor - p_valor) < 0.02
       OR (p_nome_fatura IS NOT NULL AND nome_fantasia_fatura ILIKE '%' || p_nome_fatura || '%')
    UNION ALL
    SELECT 'recorrencia'::text, tx, nome, nome_fantasia_fatura, valor, ultima_cobranca_em,
           CASE WHEN ultima_cobranca_em IS NULL THEN NULL ELSE abs(p_data - ultima_cobranca_em) END,
           (p_nome_fatura IS NOT NULL AND nome_fantasia_fatura IS NOT NULL AND nome_fantasia_fatura ILIKE '%' || p_nome_fatura || '%')
    FROM cronograma_recorrencias
    WHERE abs(valor - p_valor) < 0.02
       OR (p_nome_fatura IS NOT NULL AND nome_fantasia_fatura ILIKE '%' || p_nome_fatura || '%')
    UNION ALL
    SELECT 'consorcio'::text, tx, nome, NULL, valor, NULL, NULL, false
    FROM cronograma_consorcios WHERE abs(valor - p_valor) < 0.02
    UNION ALL
    SELECT 'doacao'::text, tx, descricao, NULL, valor, NULL, NULL, false
    FROM cronograma_doacoes WHERE abs(valor - p_valor) < 0.02
  ) t
  ORDER BY bate_nome DESC NULLS LAST, dias_de_diferenca NULLS LAST;
$$;


--
-- Name: FUNCTION checar_recorrencia_existente(p_valor numeric, p_data date, p_nome_fatura text, p_tolerancia_dias integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.checar_recorrencia_existente(p_valor numeric, p_data date, p_nome_fatura text, p_tolerancia_dias integer) IS 'Achado 20/08/2026 (erro real do agente, repetido apesar de memória já registrada em feedback_assinaturas_nunca_transacao_avulsa): compras avulsas de "Compras Wallace/Vanessa" às vezes são na verdade uma assinatura/recorrência/consórcio/doação já cadastrada, aparecendo na fatura com nome de fantasia diferente (ex.: "Asa*new Servicos Autom" R$59,99 = New Car Rastreador, TXRR000006). Uso obrigatório ANTES de inserir qualquer transacoes avulsa por valor/mercante desconhecido: select * from checar_recorrencia_existente(valor, data, ''nome como aparece na fatura''). bate_nome=true é quase certeza de duplicata; dias_de_diferenca baixo (0-5) com valor batendo também é forte indício.';


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
  medidor_ultima jsonb;
  medidor_ciclo_base jsonb;
  medidor_consumo_diario jsonb;
  medidor_wellida_ultima jsonb;
  medidor_wellida_consumo_diario jsonb;
  consumo_referencia jsonb;
  composicao_tarifa jsonb;
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
    'geracaoAcumulada', l.geracao_acumulada,
    'geracaoAcumuladaData', l.geracao_acumulada_atualizado_em
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

  SELECT jsonb_build_object(
    'capturadoEm', t.capturado_em, 'tensaoV', t.tensao_v, 'correnteA', t.corrente_a,
    'potenciaW', t.potencia_w, 'energiaHojeKwh', t.energia_hoje_kwh,
    'energiaTotalKwh', t.energia_total_kwh, 'estado', t.estado
  ) INTO medidor_ultima
  FROM medidor_tuya_leituras t WHERE t.casa = 'wallace' ORDER BY t.capturado_em DESC LIMIT 1;

  SELECT jsonb_build_object('capturadoEm', t.capturado_em, 'energiaTotalKwh', t.energia_total_kwh)
  INTO medidor_ciclo_base
  FROM medidor_tuya_leituras t
  WHERE t.casa = 'wallace' AND t.capturado_em >= (
    CASE WHEN EXTRACT(DAY FROM now() AT TIME ZONE 'America/Sao_Paulo') >= 21
      THEN date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '20 days'
      ELSE date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month' + interval '20 days'
    END
  )
  ORDER BY t.capturado_em ASC LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('data', d.data, 'kwhConsumido', d.kwh_consumido) ORDER BY d.data ASC)
  INTO medidor_consumo_diario
  FROM medidor_tuya_consumo_diario d WHERE d.casa = 'wallace';

  SELECT jsonb_build_object(
    'capturadoEm', t.capturado_em, 'tensaoV', t.tensao_v, 'correnteA', t.corrente_a,
    'potenciaW', t.potencia_w, 'energiaHojeKwh', t.energia_hoje_kwh,
    'energiaTotalKwh', t.energia_total_kwh, 'estado', t.estado
  ) INTO medidor_wellida_ultima
  FROM medidor_tuya_leituras t WHERE t.casa = 'wellida' ORDER BY t.capturado_em DESC LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('data', d.data, 'kwhConsumido', d.kwh_consumido) ORDER BY d.data ASC)
  INTO medidor_wellida_consumo_diario
  FROM medidor_tuya_consumo_diario d WHERE d.casa = 'wellida';

  SELECT jsonb_agg(jsonb_build_object(
    'casa', r.casa, 'consumoMensalKwh', r.consumo_mensal_kwh, 'diasBase', r.dias_base,
    'consumoDiarioKwh', r.consumo_diario_kwh, 'fonte', r.fonte, 'atualizadoEm', r.atualizado_em
  ))
  INTO consumo_referencia
  FROM energia_solar_consumo_referencia r WHERE r.casa IN ('wallace', 'irma');

  -- AMPLIADO 22/08/2026 (pedido do usuario: "esse campo tem que aparecer no compartilhando" - card
  -- "Economia real deste mes") - devolve o objeto ENERGISA_TARIFA_COMPOSICAO completo de wallace/
  -- wellida (fatura_pre_solar_valor/_consumo_kwh, fatura_<mesano>_valor/_consumo_kwh, cosip,
  -- composicao_pct, residual_validado) - mesma fonte que o painel privado ja le direto de
  -- VARS.ENERGISA_TARIFA_COMPOSICAO. Mae fica de fora (pagina eh so pra Wallace/Wellida).
  SELECT jsonb_build_object(
    'wallace', pg.valor->'apartamento_wallace',
    'wellida', pg.valor->'casa_wellida'
  )
  INTO composicao_tarifa
  FROM parametros_gerais pg WHERE pg.nome = 'ENERGISA_TARIFA_COMPOSICAO';

  RETURN jsonb_build_object(
    'leituras', COALESCE(leituras, '[]'::jsonb),
    'geracaoDiaria', COALESCE(geracao_diaria, '[]'::jsonb),
    'cicloAberto', ciclo_aberto,
    'ciclosFechados', COALESCE(ciclos_fechados, '[]'::jsonb),
    'medidorTuyaUltima', medidor_ultima,
    'medidorTuyaCicloBase', medidor_ciclo_base,
    'medidorTuyaConsumoDiario', COALESCE(medidor_consumo_diario, '[]'::jsonb),
    'medidorTuyaWellidaUltima', medidor_wellida_ultima,
    'medidorTuyaWellidaConsumoDiario', COALESCE(medidor_wellida_consumo_diario, '[]'::jsonb),
    'consumoReferencia', COALESCE(consumo_referencia, '[]'::jsonb),
    'energisaTarifaComposicao', COALESCE(composicao_tarifa, '{}'::jsonb),
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
-- Name: estender_compartilhamento_solar(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estender_compartilhamento_solar(p_token text, p_dias_adicionais integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  atualizadas int;
  nova_expiracao timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido exigido para estender compartilhamento';
  END IF;

  IF p_dias_adicionais IS NULL OR p_dias_adicionais < 1 OR p_dias_adicionais > 365 THEN
    RAISE EXCEPTION 'p_dias_adicionais precisa ser um numero entre 1 e 365';
  END IF;

  -- Soma a partir do MAIOR entre "agora" e a expiracao atual - um link ja vencido volta a valer a
  -- partir de agora (nao soma dias em cima de uma data que ja passou, o que resultaria numa
  -- validade menor do que o usuario pediu); um link ainda ativo soma em cima da expiracao real dele.
  UPDATE solar_compartilhamentos
  SET expira_em = GREATEST(now(), expira_em) + (p_dias_adicionais || ' days')::interval
  WHERE token = p_token AND ativo = true
  RETURNING expira_em INTO nova_expiracao;
  GET DIAGNOSTICS atualizadas = ROW_COUNT;

  IF atualizadas = 0 THEN
    RAISE EXCEPTION 'link nao encontrado ou ja desativado';
  END IF;

  RETURN jsonb_build_object('estendido', true, 'expira_em', nova_expiracao);
END;
$$;


--
-- Name: fechar_ciclo_financeiro(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fechar_ciclo_financeiro(p_novo_ciclo_key text, p_novo_label text, p_novo_periodo text, p_snapshot jsonb) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_ciclo_aberto ciclos_financeiros_snapshots%ROWTYPE;
BEGIN
  -- Mesmo padrao de autenticacao de fechar_ciclo_solar: login Firebase valido (JWT com iss/aud do
  -- projeto) OU service_role. Fechar um ciclo financeiro congela numeros que o usuario ve
  -- permanentemente como "fechado" - nunca sem autenticacao.
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para fechar ciclo financeiro';
  END IF;

  IF p_novo_ciclo_key IS NULL OR p_novo_ciclo_key !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_novo_ciclo_key invalido (esperado YYYY-MM): %', p_novo_ciclo_key;
  END IF;

  SELECT * INTO v_ciclo_aberto FROM ciclos_financeiros_snapshots WHERE fechado = false LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhum ciclo aberto encontrado - verifique ciclos_financeiros_snapshots (deveria haver exatamente 1 linha com fechado=false)';
  END IF;

  IF EXISTS (SELECT 1 FROM ciclos_financeiros_snapshots WHERE ciclo_key = p_novo_ciclo_key) THEN
    RAISE EXCEPTION 'Ja existe uma linha para o ciclo %  - fechamento ja rodou ou chave duplicada, abortando pra nao sobrescrever', p_novo_ciclo_key;
  END IF;

  -- Congela o ciclo que estava aberto com o retrato vivo calculado pelo proprio navegador (JS real do
  -- site, nunca reconstruido em SQL/Python - risco de formula duplicada divergente). p_snapshot vem
  -- pronto no mesmo shape de REG/VARS, so remapeado pra snake_case das colunas.
  UPDATE ciclos_financeiros_snapshots SET
    fechado = true,
    salario = (p_snapshot->>'salario')::numeric,
    entradas_totais = (p_snapshot->>'entradasTotais')::numeric,
    caixa_variavel_comprometido = (p_snapshot->>'caixaVariavelComprometido')::numeric,
    caixa_variavel_saldo_real = (p_snapshot->>'caixaVariavelSaldoReal')::numeric,
    caixa_variavel_disponivel = (p_snapshot->>'caixaVariavelDisponivel')::numeric,
    reembolso_recebido = (p_snapshot->>'reembolsoRecebido')::numeric,
    reembolso_a_receber = (p_snapshot->>'reembolsoAReceber')::numeric,
    tolerancia_temp_valor = (p_snapshot->>'toleranciaTempValor')::numeric,
    tolerancia_temp_motivo = p_snapshot->>'toleranciaTempMotivo',
    teto_oficial = (p_snapshot->>'tetoOficial')::numeric,
    teto_efetivo = (p_snapshot->>'tetoEfetivo')::numeric,
    cascata = p_snapshot->'cascata',
    necessidade_total_bruta = (p_snapshot->>'necessidadeTotalBruta')::numeric,
    necessidade_total_liquida = (p_snapshot->>'necessidadeTotalLiquida')::numeric,
    modo_operacional = p_snapshot->>'modoOperacional',
    saldo_ciclo = (p_snapshot->>'saldoCiclo')::numeric,
    visa_infinite_comprometido = (p_snapshot->>'visaInfiniteComprometido')::numeric,
    mastercard_black_comprometido = (p_snapshot->>'mastercardBlackComprometido')::numeric,
    mastercard_black_pessoal_congelado = (p_snapshot->>'mastercardBlackPessoalCongelado')::numeric,
    mercado_pago_fatura_congelada = (p_snapshot->>'mercadoPagoFaturaCongelada')::numeric,
    dias_restantes = 0,
    livros_razao_arquivados = p_snapshot->'livrosRazaoArquivados',
    observacoes = coalesce(observacoes, '') || CASE WHEN observacoes IS NULL OR observacoes = '' THEN '' ELSE E'\n' END
      || 'Fechado automaticamente em ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' (robo fechar_ciclo_financeiro).',
    atualizado_em = now()
  WHERE id = v_ciclo_aberto.id;

  -- Abre o novo ciclo - so metadado (label/periodo), todo o resto fica null porque ciclo ABERTO le os
  -- valores VIVOS de VARS/transacoes (ver aplicarCicloAoVARS, ramo fechado=false), nunca do snapshot.
  INSERT INTO ciclos_financeiros_snapshots (ciclo_key, label, periodo, fechado, dias_restantes, criado_em, atualizado_em)
  VALUES (p_novo_ciclo_key, p_novo_label, p_novo_periodo, false, null, now(), now());

  RETURN p_novo_ciclo_key;
END;
$_$;


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
-- Name: fn_audit_log_historico_relatorios(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_log_historico_relatorios() RETURNS trigger
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
  reg_id uuid;
begin
  origem_sessao := nullif(current_setting('audit.origem', true), '');
  usuario_efetivo := nullif(current_setting('audit.usuario', true), '');
  origem_efetiva := coalesce(origem_sessao, 'sistema');
  reg_id := md5('historico_relatorios:' || coalesce(new.competencia, old.competencia))::uuid;

  if tg_op = 'INSERT' then
    insert into public.audit_log(tabela, registro_id, operacao, campo, valor_anterior, valor_novo, origem, alterado_por)
    values ('historico_relatorios', reg_id, 'INSERT', 'competencia', null, to_jsonb(new)::text, origem_efetiva, usuario_efetivo);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log(tabela, registro_id, operacao, campo, valor_anterior, valor_novo, origem, alterado_por)
    values ('historico_relatorios', reg_id, 'DELETE', 'competencia', to_jsonb(old)::text, null, origem_efetiva, usuario_efetivo);
    return old;
  elsif tg_op = 'UPDATE' then
    for campo_nome in select key from jsonb_each(to_jsonb(new)) loop
      valor_antigo := (to_jsonb(old)->>campo_nome);
      valor_novo_v := (to_jsonb(new)->>campo_nome);
      if valor_antigo is distinct from valor_novo_v then
        insert into public.audit_log(tabela, registro_id, operacao, campo, valor_anterior, valor_novo, origem, alterado_por)
        values ('historico_relatorios', reg_id, 'UPDATE', campo_nome, valor_antigo, valor_novo_v, origem_efetiva, usuario_efetivo);
      end if;
    end loop;
    return new;
  end if;
  return null;
end;
$$;


--
-- Name: FUNCTION fn_audit_log_historico_relatorios(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_audit_log_historico_relatorios() IS 'Auditoria dedicada de historico_relatorios (criada 14/08/2026 após incidente: linha da competência 2026-07 apagada sem rastro, tabela nunca teve trigger). Não reaproveita fn_audit_log_generic() porque essa assume PK uuid chamada id; historico_relatorios usa PK text competencia. registro_id é um uuid determinístico derivado de md5(competencia) -- mesma competência sempre mapeia pro mesmo registro_id.';


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
-- Name: lancar_transacao_manual(date, text, numeric, text, uuid, uuid, uuid, uuid, uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lancar_transacao_manual(p_data date, p_descricao text, p_valor numeric, p_tipo text, p_caixa_id uuid, p_categoria_id uuid DEFAULT NULL::uuid, p_subcategoria_id uuid DEFAULT NULL::uuid, p_cartao_id uuid DEFAULT NULL::uuid, p_usuario_id uuid DEFAULT NULL::uuid, p_afeta_saldo_real boolean DEFAULT true, p_pluggy_tx_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE novo_id uuid;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' AND (
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
  INSERT INTO transacoes(data, descricao, valor, tipo, caixa_id, categoria_id, subcategoria_id, cartao_id, usuario_id, origem, status, afeta_saldo_real, pluggy_tx_id)
  VALUES (p_data, p_descricao, p_valor, p_tipo, p_caixa_id, p_categoria_id, p_subcategoria_id, p_cartao_id, p_usuario_id, 'manual', 'confirmado', p_afeta_saldo_real, p_pluggy_tx_id)
  RETURNING id INTO novo_id;
  RETURN novo_id;
END; $$;


--
-- Name: FUNCTION lancar_transacao_manual(p_data date, p_descricao text, p_valor numeric, p_tipo text, p_caixa_id uuid, p_categoria_id uuid, p_subcategoria_id uuid, p_cartao_id uuid, p_usuario_id uuid, p_afeta_saldo_real boolean, p_pluggy_tx_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.lancar_transacao_manual(p_data date, p_descricao text, p_valor numeric, p_tipo text, p_caixa_id uuid, p_categoria_id uuid, p_subcategoria_id uuid, p_cartao_id uuid, p_usuario_id uuid, p_afeta_saldo_real boolean, p_pluggy_tx_id text) IS 'RPC do formulário "+ Lançar transação" (app.js). p_pluggy_tx_id (novo, 21/08/2026) grava o elo de volta pra pluggy_transacoes.id quando o lançamento nasceu de um item da Inbox aprovado (inboxAprovar em inbox-financeira.js) — permite dedup por ID exato em reconciliarTransacoesPluggy(), não só por valor.';


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
declare
  v_ip text;
  v_recentes int;
begin
  v_ip := coalesce(
    (current_setting('request.headers', true)::json ->> 'x-forwarded-for'),
    'desconhecido'
  );
  select count(*) into v_recentes
  from public.erros_cliente
  where origem_ip = v_ip and ocorrido_em > now() - interval '5 minutes';
  if v_recentes >= 20 then
    return;
  end if;
  insert into public.erros_cliente (mensagem, stack, contexto, origem_ip)
  values (left(p_mensagem, 2000), left(coalesce(p_stack, ''), 4000), p_contexto, v_ip);
end;
$$;


--
-- Name: registrar_indicador(text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_indicador(p_nome text, p_valor numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.role() is distinct from 'service_role' and (
       auth.jwt() is null
       or (auth.jwt() ->> 'iss') is distinct from 'https://securetoken.google.com/sistema-wallace-lira'
       or (auth.jwt() ->> 'aud') is distinct from 'sistema-wallace-lira'
     ) then
    raise exception 'nao autenticado - login valido ou service_role exigido para registrar indicador';
  end if;
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'p_nome invalido';
  end if;
  insert into indicadores (nome, valor, data_calculo)
  values (p_nome, p_valor, current_date)
  on conflict (nome) do update set valor = excluded.valor, data_calculo = excluded.data_calculo;
end;
$$;


--
-- Name: registrar_leitura_solar_manual(text, numeric, numeric, timestamp with time zone, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_leitura_solar_manual(p_casa text, p_leitura_03 numeric, p_leitura_103 numeric, p_data_hora_leitura timestamp with time zone, p_eh_leitura_oficial_energisa boolean DEFAULT false, p_evidencia text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_data date;
  v_id uuid;
BEGIN
  -- CORRIGIDO 21/08/2026 (achado real: Claude Chat e Claude Code usam o conector oficial
  -- Supabase<->Claude, OAuth com acesso de dono do projeto — não passa pelas claims de sessão do
  -- PostgREST, então auth.role() vem NULL nesse tipo de conexão, mesmo com acesso total real.
  -- auth.role() IS NULL reconhece esse caso — não é uma brecha nova, é o mesmo nível de confiança
  -- que o usuário já concedeu ao conectar esse app com acesso de owner ao projeto).
  IF auth.role() IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' AND (
       auth.jwt() IS NULL
       OR (auth.jwt() ->> 'iss') IS DISTINCT FROM 'https://securetoken.google.com/sistema-wallace-lira'
       OR (auth.jwt() ->> 'aud') IS DISTINCT FROM 'sistema-wallace-lira'
     ) THEN
    RAISE EXCEPTION 'nao autenticado - login valido ou service_role exigido para registrar leitura solar manual';
  END IF;

  IF p_data_hora_leitura IS NULL THEN
    RAISE EXCEPTION 'p_data_hora_leitura obrigatorio - informar o instante REAL em que a foto/leitura foi tirada (com fuso), nunca "agora"/CURRENT_TIMESTAMP';
  END IF;
  IF p_casa IS NULL OR length(trim(p_casa)) = 0 THEN
    RAISE EXCEPTION 'p_casa obrigatorio';
  END IF;
  IF p_leitura_03 IS NULL OR p_leitura_103 IS NULL THEN
    RAISE EXCEPTION 'p_leitura_03 e p_leitura_103 sao obrigatorios';
  END IF;

  v_data := (p_data_hora_leitura AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.energia_solar_leituras
    (casa, data, leitura_03, leitura_103, eh_leitura_oficial_energisa, evidencia)
  VALUES
    (p_casa, v_data, p_leitura_03, p_leitura_103, p_eh_leitura_oficial_energisa,
     coalesce(p_evidencia || ' ', '') ||
     format('[data derivada automaticamente de %s (instante real informado pelo chamador), fuso America/Sao_Paulo — registrar_leitura_solar_manual()]', p_data_hora_leitura))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id, 'casa', p_casa, 'data', v_data,
    'leitura_03', p_leitura_03, 'leitura_103', p_leitura_103,
    'data_hora_leitura_informada', p_data_hora_leitura
  );
END;
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
-- Name: rpc_composicao_saldo_caixas_batch(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_composicao_saldo_caixas_batch(p_nomes text[]) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: FUNCTION rpc_composicao_saldo_caixas_batch(p_nomes text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_composicao_saldo_caixas_batch(p_nomes text[]) IS 'Aplicada 21/08/2026 (estava desenhada desde 14/08 mas nunca aplicada — achado durante auditoria de performance). Consolida N chamadas individuais de getTransacoesComposicaoSaldoCaixa() em 1 round-trip. Cliente (WallaceFinanceService.getComposicaoCaixasBatch, app.js) já tinha fallback automático pras chamadas individuais, agora usa esta RPC.';


--
-- Name: rpc_comprometido_caixas_batch(uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_comprometido_caixas_batch(p_caixa_ids uuid[], p_cartao_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_object_agg(cx.id, coalesce(soma.total, 0)), '{}'::jsonb)
  FROM caixas cx
  LEFT JOIN LATERAL (
    SELECT sum(t.valor) AS total
    FROM transacoes t
    WHERE t.caixa_id = cx.id
      AND t.status = 'confirmado'
      AND t.tipo = 'saida'
      AND t.afeta_saldo_real = false
      AND t.ja_orcado_assinaturas = false
      AND (cx.ciclo_inicio_em IS NULL OR t.data >= cx.ciclo_inicio_em)
      AND (
        (p_cartao_ids IS NULL AND t.cartao_id IS NOT NULL)
        OR (p_cartao_ids IS NOT NULL AND t.cartao_id = ANY(p_cartao_ids))
      )
  ) soma ON true
  WHERE cx.id = ANY(p_caixa_ids);
$$;


--
-- Name: FUNCTION rpc_comprometido_caixas_batch(p_caixa_ids uuid[], p_cartao_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_comprometido_caixas_batch(p_caixa_ids uuid[], p_cartao_ids uuid[]) IS 'Batch de getComprometidoPorCaixaV2()/getComprometidoPorCaixaECartoesV2() (src/app/app.js) — devolve {caixa_id: soma_comprometido} pra N caixas numa única chamada, em vez de 1 request por caixa. p_cartao_ids=NULL replica o filtro genérico (qualquer cartão); um array restringe à família específica (ex: Mastercard Black). Mesma fórmula exata das 2 funções JS, criada 21/08/2026 numa auditoria de performance (HAR real mostrou 16 round-trips paralelos onde cabia 1).';


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
  -- CORRIGIDO 14/08/2026: mesmo padrão de vw_patrimonio_v2 ("última linha por subtipo",
  -- não "data_snapshot máxima global"). Antes, com data_snapshot=max(data_snapshot) global,
  -- só o subtipo com o snapshot mais recente (reserva) sobrevivia e os outros 12 itens de
  -- patrimonio sumiam do total (liquido caía de ~R$468mil pra R$100mil). Ver
  -- docs/decisions/ para o achado original.
  patrimonio_latest as (
    select distinct on (subtipo) subtipo, tipo, natureza, valor, data_snapshot
    from patrimonio
    order by subtipo, data_snapshot desc, id desc
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
      ) from patrimonio_latest
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
-- Name: rpc_saldo_ciclo_caixas_batch(uuid[], date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_saldo_ciclo_caixas_batch(p_caixa_ids uuid[], p_data_inicio date) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_object_agg(cx.id, jsonb_build_object(
      'entradas', coalesce(soma.entradas, 0),
      'saidas', coalesce(soma.saidas, 0)
    )), '{}'::jsonb)
  FROM caixas cx
  LEFT JOIN LATERAL (
    SELECT
      sum(t.valor) FILTER (WHERE t.tipo = 'entrada') AS entradas,
      sum(t.valor) FILTER (WHERE t.tipo = 'saida') AS saidas
    FROM transacoes t
    WHERE t.caixa_id = cx.id
      AND t.status = 'confirmado'
      AND t.data >= p_data_inicio
  ) soma ON true
  WHERE cx.id = ANY(p_caixa_ids);
$$;


--
-- Name: FUNCTION rpc_saldo_ciclo_caixas_batch(p_caixa_ids uuid[], p_data_inicio date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rpc_saldo_ciclo_caixas_batch(p_caixa_ids uuid[], p_data_inicio date) IS 'Batch de promocaoLote10CaixasReconciliadas() (src/app/promocoes-financeengine.js) — devolve soma de entradas/saídas (status=confirmado, data>=p_data_inicio) pra N caixas numa única chamada. JS continua fazendo saldo = saldo_inicial_ciclo + entradas − saídas via WallaceFinanceEngine.calcularSaldoCaixa() (fórmula não duplicada aqui). Criada 21/08/2026 numa auditoria de performance (HAR real mostrou 10 round-trips paralelos onde cabia 1).';


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
-- Name: trg_medidor_tuya_consumo_diario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_medidor_tuya_consumo_diario() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dia date;
  v_baseline numeric;
BEGIN
  IF NEW.energia_total_kwh IS NULL THEN
    RETURN NEW;
  END IF;

  v_dia := (NEW.capturado_em AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT energia_total_kwh INTO v_baseline
  FROM medidor_tuya_leituras
  WHERE (capturado_em AT TIME ZONE 'America/Sao_Paulo')::date = v_dia
    AND casa = NEW.casa
    AND energia_total_kwh IS NOT NULL
  ORDER BY capturado_em ASC
  LIMIT 1;

  INSERT INTO medidor_tuya_consumo_diario (data, casa, kwh_consumido, atualizado_em)
  VALUES (v_dia, NEW.casa, GREATEST(0, ROUND(NEW.energia_total_kwh - v_baseline, 3)), now())
  ON CONFLICT (data, casa) DO UPDATE
    SET kwh_consumido = EXCLUDED.kwh_consumido,
        atualizado_em = EXCLUDED.atualizado_em;

  RETURN NEW;
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
-- Name: upsert_dividendos_acoes(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_dividendos_acoes(p_dividendos jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  item jsonb;
begin
  if auth.role() in ('anon','authenticated') then
    raise exception 'nao autorizado - somente service_role pode atualizar dividendos';
  end if;
  for item in select * from jsonb_array_elements(p_dividendos)
  loop
    insert into dividendos_acoes (ticker, tipo, valor, data_pagamento, data_com, aprovado_em)
    values (
      item->>'ticker',
      item->>'tipo',
      (item->>'valor')::numeric,
      nullif(item->>'data_pagamento','')::date,
      nullif(item->>'data_com','')::date,
      nullif(item->>'aprovado_em','')::date
    )
    on conflict (ticker, tipo, data_pagamento, valor) do nothing;
  end loop;
  return p_dividendos;
end;
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


--
-- Name: wwi_upsert_relatorio_mensal(text, numeric, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wwi_upsert_relatorio_mensal(p_competencia text, p_score numeric, p_dados_json jsonb, p_analise_ia jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  INSERT INTO historico_relatorios (competencia, score, dados_json, analise_ia)
  VALUES (p_competencia, p_score, p_dados_json, p_analise_ia)
  ON CONFLICT (competencia) DO UPDATE SET
    score         = EXCLUDED.score,
    dados_json    = EXCLUDED.dados_json,
    atualizado_em = now()
  RETURNING jsonb_build_object(
    'competencia', competencia, 'score', score, 'created_at', created_at, 'atualizado_em', atualizado_em
  ) INTO v_resultado;
  RETURN v_resultado;
END;
$$;


--
-- Name: FUNCTION wwi_upsert_relatorio_mensal(p_competencia text, p_score numeric, p_dados_json jsonb, p_analise_ia jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.wwi_upsert_relatorio_mensal(p_competencia text, p_score numeric, p_dados_json jsonb, p_analise_ia jsonb) IS 'WWI — upsert idempotente de historico_relatorios. Só chamável com service_role (sem GRANT a anon/authenticated de propósito) — mesma régua de segurança de lancar_transacao_manual. Preserva analise_ia em updates (nunca sobrescreve narrativa já persistida na competência).';


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
-- Name: TABLE aplicacoes_ozivy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.aplicacoes_ozivy IS 'Controle de doses aplicadas da caneta Ozivy (Semaglutida, aplicação semanal), aba Emagrecimento. 1 linha por aplicação real, inserida manualmente/via agente conforme acontece — não é gerada automaticamente e não existe formulário de insert no painel. Fonte viva desde 13/08/2026.';


--
-- Name: COLUMN aplicacoes_ozivy.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aplicacoes_ozivy.data IS 'Data em que a dose foi efetivamente aplicada (não é data de compra nem de agendamento). "Próxima prevista" no painel é só última data +7 dias — não é confirmação médica.';


--
-- Name: COLUMN aplicacoes_ozivy.dose_mg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aplicacoes_ozivy.dose_mg IS 'Dose aplicada em miligramas (mg) de Semaglutida.';


--
-- Name: COLUMN aplicacoes_ozivy.observacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.aplicacoes_ozivy.observacao IS 'Texto livre sobre a aplicação (ex.: fase de titulação, efeitos observados). Opcional.';


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
-- Name: TABLE audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_log IS 'Changelog automático gerado por trigger (fn_audit_log_generic / fn_audit_log_historico_relatorios) sobre tabelas financeiras rastreadas (transacoes, caixas, cartoes, parcelas, indicadores, cronograma_assinaturas, cronograma_recorrencias, emprestimos_internos, reembolso_wartsila_ciclo, historico_relatorios). Fonte viva, alimentada pelo banco, não pela aplicação. NÃO confundir com erros_cliente (erro de runtime JS) nem com execucoes_jobs (heartbeat de cron).';


--
-- Name: COLUMN audit_log.tabela; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.tabela IS 'Nome da tabela public.* que sofreu a alteração (ex.: transacoes, caixas).';


--
-- Name: COLUMN audit_log.registro_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.registro_id IS 'PK (uuid) da linha alterada na tabela referida por "tabela". Para historico_relatorios (PK text competencia), é um uuid determinístico derivado de md5(competencia), não a PK real.';


--
-- Name: COLUMN audit_log.operacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.operacao IS 'Tipo de operação capturada pelo trigger: INSERT, UPDATE ou DELETE.';


--
-- Name: COLUMN audit_log.campo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.campo IS 'Nome da coluna alterada (só em UPDATE de campo único); NULL em INSERT/DELETE de linha inteira, onde valor_novo/valor_anterior carregam o registro completo em texto.';


--
-- Name: COLUMN audit_log.valor_anterior; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.valor_anterior IS 'Valor antes da alteração, serializado como texto (pode ser um JSON de linha inteira em INSERT/DELETE).';


--
-- Name: COLUMN audit_log.valor_novo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.valor_novo IS 'Valor depois da alteração, serializado como texto (pode ser um JSON de linha inteira em INSERT/DELETE).';


--
-- Name: COLUMN audit_log.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.origem IS 'Quem/o que disparou a mudança: ''sistema'' (default/trigger automático), ''ajuste_manual'' (edição direta via SQL/painel), ''sincronizacao'' (job automatizado, ex. Pluggy).';


--
-- Name: COLUMN audit_log.alterado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.alterado_por IS 'Identificador textual livre de quem fez a alteração manual (ex. nome do agente/sessão); NULL quando a origem é automática (sincronizacao/sistema).';


--
-- Name: COLUMN audit_log.alterado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.alterado_em IS 'Timestamp (UTC) em que a alteração ocorreu, capturado pelo trigger no momento da transação.';


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
-- Name: TABLE backups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.backups IS 'Snapshot diário completo do banco (todas as tabelas relevantes serializadas em JSON dentro de "conteudo"), gerado por pg_cron via criar_backup_completo() (job "backup-diario-completo", ~06:00 UTC) e usado só para disaster recovery via restaurar_backup(). Retenção de 14 backups (~14 dias). Não é dado de negócio, é infraestrutura de DR — NÃO ler/consumir no app. Complementar ao backup externo (pg_dump criptografado no GitHub, ver docs/decisions/CONTINUIDADE_NEGOCIO_DR.md), que cobre o caso do projeto Supabase inteiro sumir.';


--
-- Name: COLUMN backups.criado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.backups.criado_em IS 'Timestamp (UTC) em que este snapshot foi gerado pelo cron diário.';


--
-- Name: COLUMN backups.conteudo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.backups.conteudo IS 'JSON com o dump de todas as tabelas capturadas no snapshot (pode passar de vários MB por linha — não fazer select * em lote, filtrar/paginar).';


--
-- Name: COLUMN backups.tamanho_bytes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.backups.tamanho_bytes IS 'Tamanho em bytes do JSON de "conteudo" nesse snapshot, usado para monitorar crescimento do backup ao longo do tempo.';


--
-- Name: COLUMN backups.erro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.backups.erro IS 'Mensagem de erro se o backup falhou nessa execução; NULL quando o backup foi concluído com sucesso.';


--
-- Name: beneficios_creditos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beneficios_creditos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    label text NOT NULL,
    saldo numeric NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE beneficios_creditos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.beneficios_creditos IS 'Saldo atual de créditos/benefícios externos de mobilidade (Uber Balance, Shell Box, KMV Ipiranga), mantido manualmente pelo usuário via Chat. Migrou 17/08/2026 de literal hardcoded em vars-operacional.js (creditoUberBalance/creditoShellBox/creditoKmvIpiranga) para esta tabela — fonte real hoje, lida por WallaceFinanceService.getBeneficiosCreditos() (src/app/app.js) e exibida no card "Créditos e Cupons". Saldo NÃO é sincronizado automaticamente com nenhum provedor externo — é debitado manualmente conforme o uso relatado pelo usuário.';


--
-- Name: COLUMN beneficios_creditos.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.beneficios_creditos.nome IS 'Chave técnica do crédito (ex.: shell_box, kmv_ipiranga, uber) — usada como identificador estável no código, não mostrar direto na UI.';


--
-- Name: COLUMN beneficios_creditos.label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.beneficios_creditos.label IS 'Texto de exibição amigável do crédito, mostrado na UI (ex.: "Uber (balance+one+gift)").';


--
-- Name: COLUMN beneficios_creditos.saldo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.beneficios_creditos.saldo IS 'Saldo atual do crédito em R$, atualizado manualmente pelo usuário (não é um "aporte mensal" nem se repõe sozinho — só cai com uso e sobe quando o usuário registra recarga/crédito novo).';


--
-- Name: COLUMN beneficios_creditos.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.beneficios_creditos.atualizado_em IS 'Timestamp (UTC) da última atualização manual do saldo.';


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
-- Name: TABLE caixas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.caixas IS 'Fonte real (V2) das caixas/reservas financeiras do sistema. Saldo atual de cada caixa NÃO fica armazenado numa coluna aqui — é calculado ao vivo pela view vw_saldo_v2_por_caixa como saldo_inicial_ciclo + soma das transações de transacoes (status=confirmado, coalesce(afeta_saldo_real,true), data >= ciclo_inicio_em) daquela caixa. Alimenta o painel (seção 05 Caixas Operacionais e os cards extras dinâmicos).';


--
-- Name: COLUMN caixas.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.nome IS 'Nome exato da caixa, usado como chave de casamento em vários lugares do frontend (ex: CAIXAS_JA_COBERTAS_ESTATICAMENTE, PREFIXO_CC em hydrate-caixas.js). Mudar aqui sem atualizar o código quebra o mapeamento.';


--
-- Name: COLUMN caixas.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.tipo IS 'Categoria da caixa (ex: operacional). Não confundir com o CC-XXX (código de card) usado só no frontend, que não existe como coluna.';


--
-- Name: COLUMN caixas.saldo_inicial_ciclo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.saldo_inicial_ciclo IS 'Saldo (R$) da caixa NO INÍCIO do ciclo atual (ciclo_inicio_em) — ponto de partida fixo sobre o qual a view vw_saldo_v2_por_caixa soma as transações do ciclo para chegar no saldo ao vivo. NÃO é o saldo atual da caixa.';


--
-- Name: COLUMN caixas.teto_mensal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.teto_mensal IS 'Limite de gasto/meta de acumulação da caixa — significado varia por caixa, NUNCA confundir com aporte mensal real (esse fica em parametros_gerais.RESUMO_APORTES_MENSAIS_CAIXAS). Padrão mais comum: ~12x o aporte mensal (meta = 1 ano de reserva acumulada, ex. Bens Duráveis 3000=250x12, Seguro Emplacamento 5100=425x12). Exceção real (21/08/2026): Emagrecimento é caixa de GASTO recorrente (caneta Ozivy, ~R$490/mês), não de acumulação — não faz sentido um teto de "1 ano guardado" porque o saldo nunca acumula, é gasto todo ciclo; teto = 490 (o próprio aporte mensal), não um múltiplo.';


--
-- Name: COLUMN caixas.saldo_inicial_calibrado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.saldo_inicial_calibrado IS 'Flag booleana indicando se saldo_inicial_ciclo já foi calibrado/conferido manualmente (true) para esta caixa.';


--
-- Name: COLUMN caixas.ciclo_inicio_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.ciclo_inicio_em IS 'Data (YYYY-MM-DD) de início do ciclo financeiro interno desta caixa — é o corte usado por vw_saldo_v2_por_caixa e por várias queries do frontend (filtro data >= ciclo_inicio_em) pra decidir quais transações contam no saldo/comprometido do ciclo atual. Conceito DIFERENTE do ciclo de fechamento de fatura de cartão (ex: Mastercard Black fecha dia 22) — os dois não são alinhados de propósito, não tentar sincronizar.';


--
-- Name: COLUMN caixas.meta_data_limite; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas.meta_data_limite IS 'Data-limite (prazo) opcional pra bater a meta (teto_mensal) desta caixa, ex: Escola de Júlio, Aniversário Júlio. Usado só pra mostrar contagem regressiva no card; caixas sem prazo definido (maioria) ficam NULL.';


--
-- Name: caixas_aportes_mensais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caixas_aportes_mensais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caixa_id uuid,
    caixa_nome text NOT NULL,
    aporte_mensal numeric,
    tipo text NOT NULL,
    vigencia text,
    fonte text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT caixas_aportes_mensais_tipo_check CHECK ((tipo = ANY (ARRAY['continuo'::text, 'temporario'::text, 'sem_aporte_fixo'::text])))
);


--
-- Name: TABLE caixas_aportes_mensais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.caixas_aportes_mensais IS 'Tabela de DOCUMENTAÇÃO/referência manual — registra o aporte mensal REAL (R$/mês) que efetivamente entra em cada caixa temática, para auditoria de "aportes das caixas temáticas vs. teto". NÃO é lida por nenhum código do site (confirmado por grep em src/**, zero referências) — os valores reais de aporte continuam hardcoded em VARS no frontend (ver coluna fonte). Atualização é manual, feita por agente/usuário como snapshot de consulta. NÃO confundir com caixas.teto_mensal, que é um LIMITE/META de saldo, não um valor de aporte mensal.';


--
-- Name: COLUMN caixas_aportes_mensais.caixa_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas_aportes_mensais.caixa_id IS 'FK lógica pra caixas.id (nullable — nem toda linha tem correspondência direta e confiável na tabela caixas, ex: linhas "ciclo atual" que representam um valor calculado, não uma caixa fixa).';


--
-- Name: COLUMN caixas_aportes_mensais.caixa_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas_aportes_mensais.caixa_nome IS 'Nome descritivo da caixa/aporte documentado. Pode não bater 1:1 com caixas.nome (ex: "Escola de Júlio (ciclo atual)" é uma variação anotada, não o nome exato da caixa).';


--
-- Name: COLUMN caixas_aportes_mensais.aporte_mensal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas_aportes_mensais.aporte_mensal IS 'Valor (R$) que efetivamente entra por mês nesta caixa, segundo a fonte real citada na coluna `fonte`. Este é o "aporte mensal real" — NÃO confundir com caixas.teto_mensal (que é meta/limite, não fluxo de entrada).';


--
-- Name: COLUMN caixas_aportes_mensais.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas_aportes_mensais.tipo IS 'Natureza do aporte: "continuo" (permanente, sem previsão de término) ou "temporario" (tem prazo/vigência definida, ver coluna vigencia).';


--
-- Name: COLUMN caixas_aportes_mensais.vigencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas_aportes_mensais.vigencia IS 'Texto livre descrevendo até quando o aporte vale, quando tipo=temporario (ex: data de conclusão, número de ciclos restantes). NULL/vago quando tipo=continuo.';


--
-- Name: COLUMN caixas_aportes_mensais.fonte; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas_aportes_mensais.fonte IS 'Onde no código-fonte (arquivo/função/linha) este valor de aporte está definido de fato hoje — esta tabela é só um snapshot documental, a fonte viva é sempre o código apontado aqui.';


--
-- Name: COLUMN caixas_aportes_mensais.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.caixas_aportes_mensais.atualizado_em IS 'Timestamp da última vez que este snapshot foi conferido/atualizado manualmente — não é atualizado automaticamente por nenhum processo.';


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
-- Name: TABLE cartoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cartoes IS 'Cadastro V2 dos cartões de crédito/plásticos do sistema (um por final de cartão, não um por fatura/banco). Fonte viva usada em runtime (window.WALLACE_CARTOES_V2, buscado no bootstrap) para montar o mapa de reconciliação Pluggy (construirCartaoPluggyMapa em pluggy-reconciliacao.js), que decide de qual TOTAL de fatura (ex: cartaoMBTotal, cartaoInfiniteTotal — variáveis em VARS/REG, não colunas desta tabela) e de qual titular cada transação da Pluggy pertence. Vários finais diferentes (plástico físico, virtual, Samsung Wallet) podem apontar pro mesmo total consolidado de fatura.';


--
-- Name: COLUMN cartoes.usuario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.usuario_id IS 'UUID do titular nominal do cartão (Wallace/Vanessa/Júlio/Gabriela — mapeado em CARTAO_PLUGGY_NOME_USUARIO no frontend, não é FK para uma tabela de usuários visível aqui). Usado só pra exibir de quem é o cartão nas telas de reconciliação.';


--
-- Name: COLUMN cartoes.dono_real_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.dono_real_id IS 'Preenchido só quando o cartão é COMPARTILHADO (ex: cartão no nome de uma pessoa mas usado de fato por outra) — aponta o titular real, distinto de usuario_id. Quando NULL, usuario_id já é o dono real.';


--
-- Name: COLUMN cartoes.numero_final; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.numero_final IS 'Últimos 4 dígitos do cartão (texto, não numérico) — chave usada pra casar transações importadas da Pluggy com o cartão/titular certo. Um mesmo cartão físico pode ter múltiplos finais (físico/virtual/Samsung Wallet) todos na mesma fatura consolidada.';


--
-- Name: COLUMN cartoes.apelido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.apelido IS 'Nome descritivo/apelido de exibição do cartão no painel (ex: "MB ativo", "Visa Infinite aposentado"). NÃO é bandeira nem banco.';


--
-- Name: COLUMN cartoes.bandeira; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.bandeira IS 'Bandeira do cartão (ex: Mastercard, Visa). Frequentemente NULL nos dados atuais — não depender deste campo sem checar se está preenchido.';


--
-- Name: COLUMN cartoes.banco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.banco IS 'Banco emissor. Nos dados atuais aparece como texto genérico agregando várias marcas ("Itaú/Bradesco/Personnalité conforme apelido") em vez de um valor específico por linha — não tratar como identificador confiável do banco real deste cartão específico, olhar o apelido junto.';


--
-- Name: COLUMN cartoes.conta_pluggy_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.conta_pluggy_id IS 'ID da conta na integração Pluggy (Open Finance), quando este cartão está conectado à sincronização automática de extrato/fatura. NULL = não conectado via Pluggy.';


--
-- Name: COLUMN cartoes.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cartoes.status IS 'Estado do cartão: "ativo" (em uso normal), "aposentado" (não usado mais, mantido só por histórico), "bloqueado" (cancelado/suspenso — reconciliação Pluggy marca como bloqueado nas transações relacionadas).';


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
-- Name: TABLE categorias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.categorias IS 'Cadastro V2 de categorias de transação (nível macro, ex: Alimentação, Transporte, Saúde). Referenciada por transacoes.categoria_id (usada por RPCs de lançamento, ex: p_categoria_id em rpc_criar_transacao/rpc_categoria_para_caixa). Tem uma tabela irmã mais granular, subcategorias — não confundir as duas: esta é o nível superior.';


--
-- Name: COLUMN categorias.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categorias.nome IS 'Nome de exibição da categoria (texto livre, ex: "Alimentação", "Assinaturas"). Algumas partes do frontend comparam por este nome como string literal (ex: filtro "Reembolsável - Terceiros" em hydrate-mercado-pago-terceiros-v2.js) em vez de por id — renomear uma categoria existente pode quebrar esses filtros textuais.';


--
-- Name: COLUMN categorias.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categorias.tipo IS 'Classificação da categoria: "recorrente" (gasto/entrada regular e previsível todo ciclo) ou "extraordinaria" (pontual/fora do padrão). Usado para separar análises de gasto fixo vs. variável.';


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

COMMENT ON TABLE public.ciclos_financeiros_snapshots IS 'FONTE VIVA V2 relacional dos ciclos financeiros do painel (1 linha por ciclo, chave ciclo_key ''YYYY-MM''). Lida a cada boot do site (fetch direto, window.WALLACE_CICLO_SNAPSHOTS_V2) e transformada em VARS.CICLO_SNAPSHOTS por src/financeiro/cenarios/vars-ciclo-snapshots.js; se a rede falhar, o site cai num literal V1 hardcoded (fallback, não fonte real). Escrita pela RPC fechar_ciclo_financeiro ao fechar um ciclo (congela os valores de cartão/fatura e arquiva os lançamentos em livros_razao_arquivados); enquanto o ciclo está aberto (fechado=false), campos como caixa_variavel_saldo_real são sincronizados a partir de vw_saldo_v2_por_caixa. Invariante do sistema: existe sempre exatamente 1 linha com fechado=false — é essa linha que o código usa para determinar o ciclo atual, nunca um valor fixo no código.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.ciclo_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.ciclo_key IS 'Chave do ciclo, formato ''YYYY-MM''. NÃO é necessariamente o mês calendário exato do período — ver coluna periodo para as datas reais de início/fim (ciclos costumam ir de ~dia 25 a ~dia 24 do mês seguinte).';


--
-- Name: COLUMN ciclos_financeiros_snapshots.label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.label IS 'Rótulo exibido no painel: período + status (ex: ''Jun/26 (26/06–24/07) — FECHADO'', ''Jul/26 (25/07–24/08) — ATUAL'').';


--
-- Name: COLUMN ciclos_financeiros_snapshots.periodo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.periodo IS 'Texto com as datas reais de início e fim do ciclo, formato ''DD/MM/AAAA a DD/MM/AAAA''.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.fechado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.fechado IS 'true = ciclo já fechado (dados congelados/históricos). false = ciclo aberto/atual. Só pode existir 1 linha com false por vez — invariante imposta pela RPC fechar_ciclo_financeiro; o código deriva o "ciclo atual" achando essa linha, não usa valor fixo.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.salario; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.salario IS 'Salário líquido recebido dentro do período deste ciclo, em R$.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.entradas_totais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.entradas_totais IS 'Soma de todas as entradas do ciclo (salário + reembolsos + outras), em R$.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.caixa_variavel_comprometido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.caixa_variavel_comprometido IS 'Valor já GASTO/comprometido na Caixa Variável dentro deste ciclo, em R$. NÃO é limite/teto de gasto — ver teto_oficial/teto_efetivo para isso.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.caixa_variavel_saldo_real; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.caixa_variavel_saldo_real IS 'Saldo real disponível na Caixa Variável, em R$. Quando o ciclo está aberto, este campo é sincronizado com vw_saldo_v2_por_caixa (a fonte viva) — o valor aqui pode ficar defasado se a sincronização não rodou recentemente.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.caixa_variavel_disponivel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.caixa_variavel_disponivel IS 'caixa_variavel_saldo_real menos caixa_variavel_comprometido, em R$ — quanto ainda pode ser gasto na Caixa Variável.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.reembolso_recebido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.reembolso_recebido IS 'Valor de reembolso (empresa/terceiros) já efetivamente recebido dentro deste ciclo, em R$.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.reembolso_a_receber; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.reembolso_a_receber IS 'Valor de reembolso ainda pendente de recebimento neste ciclo, em R$. reembolso_recebido + reembolso_a_receber = total de reembolso do ciclo.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.tolerancia_temp_valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.tolerancia_temp_valor IS 'Valor extra TEMPORÁRIO liberado acima do teto oficial de gasto, em R$, por um motivo excepcional (ex: viagem). Some ao teto_oficial para formar o teto_efetivo. Não confundir com um aporte permanente — é um limite temporário de gasto.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.tolerancia_temp_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.tolerancia_temp_motivo IS 'Texto livre explicando o motivo da tolerância temporária concedida (ex: ''Viagem família Vanessa, até 24/07/2026 (encerrada)'').';


--
-- Name: COLUMN ciclos_financeiros_snapshots.teto_oficial; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.teto_oficial IS 'Teto/LIMITE de gasto oficial e padrão da Caixa Variável para o ciclo, em R$. É um limite máximo, não um valor de aporte ou gasto real — não confundir com caixa_variavel_comprometido (o que já foi de fato gasto).';


--
-- Name: COLUMN ciclos_financeiros_snapshots.teto_efetivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.teto_efetivo IS 'Teto de gasto REALMENTE aplicado no ciclo, em R$ (normalmente teto_oficial + tolerancia_temp_valor quando há tolerância ativa). Ainda é um limite, não um gasto ou aporte real.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.cascata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.cascata IS 'JSONB com o detalhamento da "cascata do reembolso" deste ciclo: distribuição do valor de reembolso entre mpPessoal, mpCorporativo, faturaWartsila, cartaoCorporativo e sobraTotal (todos em R$). Específico e isolado por ciclo — sem cruzamento com outros ciclos.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.necessidade_total_bruta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.necessidade_total_bruta IS 'Soma de todos os compromissos financeiros do ciclo (boletos+parcelas+consórcios+recorrências+aportes+assinaturas+orçamento) ANTES de deduzir a cobertura já garantida, em R$.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.necessidade_total_liquida; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.necessidade_total_liquida IS 'necessidade_total_bruta menos a cobertura já garantida (ex: parte da cascata do reembolso que já cobre alguma dívida), em R$. É o número usado na decisão financeira real do usuário (ex: gráfico de déficit).';


--
-- Name: COLUMN ciclos_financeiros_snapshots.modo_operacional; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.modo_operacional IS 'Classificação textual do regime financeiro do ciclo (ex: ''Normal'', ''Alto'') derivada da necessidade/tolerância do período.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.saldo_ciclo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.saldo_ciclo IS 'Saldo financeiro geral consolidado do ciclo, em R$.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.visa_infinite_comprometido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.visa_infinite_comprometido IS 'Valor comprometido no cartão Visa Infinite no MOMENTO EXATO do fechamento deste ciclo, em R$ — congelado, não atualiza mais depois. Só é relevante/preenchido em linhas com fechado=true; para o ciclo aberto (fechado=false) fica NULL de propósito, pois o painel usa os valores vivos do topo do VARS (cartaoInfiniteTotal) em vez deste campo.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.mastercard_black_comprometido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.mastercard_black_comprometido IS 'Valor TOTAL comprometido no cartão Mastercard Black no momento do fechamento deste ciclo, em R$ — congelado (é o "fechamento artificial" criado manualmente pelo usuário, não um cálculo automático). NÃO confundir com mastercard_black_pessoal_congelado (só a parte pessoal, sem corporativo). NULL/ignorado quando o ciclo está aberto — o painel usa o valor vivo (cartaoMBTotal) nesse caso.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.mastercard_black_pessoal_congelado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.mastercard_black_pessoal_congelado IS 'Parte PESSOAL (excluindo gastos corporativos) do total congelado do Mastercard Black no momento do fechamento, em R$. Subconjunto de mastercard_black_comprometido — não são o mesmo valor, não usar um pelo outro.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.mercado_pago_fatura_congelada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.mercado_pago_fatura_congelada IS 'Fatura do Mercado Pago congelada no momento do fechamento deste ciclo, em R$ (sem incluir adiantamentos que só entraram no ciclo seguinte). Só relevante para ciclos fechados.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.dias_restantes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.dias_restantes IS 'Dias restantes até o fim do ciclo. 0 quando o ciclo já está fechado.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.observacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.observacoes IS 'Texto livre com anotações sobre a abertura/fechamento deste ciclo (ex: ressalvas sobre salário recebido antecipado).';


--
-- Name: COLUMN ciclos_financeiros_snapshots.livros_razao_arquivados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.livros_razao_arquivados IS 'JSONB com os lançamentos arquivados deste ciclo fechado, agrupados por livro-razão (LRW_TRANSACOES, LRV_TRANSACOES, LRC_LIMBO_TRANSACOES, LRPV_TRANSACOES). Só populado quando fechado=true — para o ciclo aberto o painel referencia diretamente os arrays "vivos" do VARS em vez de duplicar os dados aqui.';


--
-- Name: COLUMN ciclos_financeiros_snapshots.criado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.criado_em IS 'Timestamp de criação da linha (quando o ciclo foi aberto/inserido).';


--
-- Name: COLUMN ciclos_financeiros_snapshots.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_financeiros_snapshots.atualizado_em IS 'Timestamp da última atualização da linha (ex: última sincronização de dados vivos do ciclo aberto, ou momento do fechamento).';


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

COMMENT ON TABLE public.ciclos_solares IS 'Um ciclo de faturamento de energia solar (Casa da Mãe, unidade geradora, medidor bidirecional Energisa). Cada linha vai de uma leitura de abertura até a leitura de fechamento seguinte e calcula o crédito líquido de kWh gerado a ser rateado entre Wallace e a irmã. Fonte viva, alimentada manualmente (não há automação de fechamento de ciclo).';


--
-- Name: COLUMN ciclos_solares.data_inicio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.data_inicio IS 'Data civil (Brasília) de abertura do ciclo — normalmente a data_fim do ciclo anterior.';


--
-- Name: COLUMN ciclos_solares.data_fim; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.data_fim IS 'Data civil de fechamento do ciclo. NULL enquanto o ciclo está aberto (status=''aberto'').';


--
-- Name: COLUMN ciclos_solares.leitura_inicio_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.leitura_inicio_id IS 'FK para energia_solar_leituras.id — a leitura usada como abertura deste ciclo (pode ser NULL em ciclos antigos importados sem o link).';


--
-- Name: COLUMN ciclos_solares.leitura_fechamento_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.leitura_fechamento_id IS 'FK para energia_solar_leituras.id — a leitura usada para fechar este ciclo (a mesma linha normalmente vira leitura_inicio_id do ciclo seguinte).';


--
-- Name: COLUMN ciclos_solares.leitura_03_inicio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.leitura_03_inicio IS 'Leitura do código 03 do medidor bidirecional (energia IMPORTADA da rede, kWh acumulado) no início do ciclo.';


--
-- Name: COLUMN ciclos_solares.leitura_103_inicio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.leitura_103_inicio IS 'Leitura do código 103 do medidor bidirecional (energia EXPORTADA para a rede, kWh acumulado) no início do ciclo.';


--
-- Name: COLUMN ciclos_solares.leitura_03_fim; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.leitura_03_fim IS 'Leitura do código 03 (importada, kWh acumulado) no fechamento do ciclo. NULL enquanto aberto.';


--
-- Name: COLUMN ciclos_solares.leitura_103_fim; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.leitura_103_fim IS 'Leitura do código 103 (exportada, kWh acumulado) no fechamento do ciclo. NULL enquanto aberto.';


--
-- Name: COLUMN ciclos_solares.credito_liquido_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.credito_liquido_kwh IS 'Crédito líquido de geração do ciclo em kWh = delta(código 103) − delta(código 03) do período. Calculado só no fechamento (NULL em ciclo aberto). ATENÇÃO: existe uma exceção formal registrada (docs/decisions/EXCECOES_FORMAIS_DESLIGAMENTO_V1.md, item 2) sobre divergência 301×361 kWh na fórmula de rateio — não tratar este valor como validado por prova externa sem checar esse documento.';


--
-- Name: COLUMN ciclos_solares.credito_wallace_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.credito_wallace_kwh IS 'Fatia do credito_liquido_kwh que cabe a Wallace = credito_liquido_kwh * rateio_wallace_pct.';


--
-- Name: COLUMN ciclos_solares.credito_irma_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.credito_irma_kwh IS 'Fatia do credito_liquido_kwh que cabe à irmã = credito_liquido_kwh * rateio_irma_pct.';


--
-- Name: COLUMN ciclos_solares.rateio_wallace_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.rateio_wallace_pct IS 'Percentual (0-1) do crédito líquido do ciclo que cabe a Wallace no rateio de compartilhamento solar. NÃO confundir com percentual de consumo — é a regra de divisão do CRÉDITO gerado, definida por acordo entre as partes, não calculada a partir do consumo real de cada casa.';


--
-- Name: COLUMN ciclos_solares.rateio_irma_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.rateio_irma_pct IS 'Percentual (0-1) do crédito líquido do ciclo que cabe à irmã. rateio_wallace_pct + rateio_irma_pct = 1.';


--
-- Name: COLUMN ciclos_solares.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.status IS 'Estado do ciclo: ''aberto'' (em andamento, sem leitura de fechamento ainda) ou ''fechado'' (leitura de fechamento registrada, créditos calculados).';


--
-- Name: COLUMN ciclos_solares.data_inicio_faturamento_energisa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ciclos_solares.data_inicio_faturamento_energisa IS 'Data de início do período de faturamento OFICIAL da Energisa para este ciclo (pode divergir de data_inicio, que é a data da leitura manual — a fatura da concessionária tem seu próprio corte de ciclo).';


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

COMMENT ON TABLE public.cotacoes_acoes IS 'Cotações de ações brasileiras (B3), 1 linha por ticker, sobrescrita a cada atualização (sem histórico). Alimentada por robô scripts/sync (via brapi.dev). Fonte V2-EXCLUSIVA pro domínio ACOES_COTACOES do painel (window.WALLACE_COTACOES_ACOES_V2) — desde a migração não há mais fallback silencioso pro literal antigo/wallace_dados; se essa tabela não responder, o painel zera o dado em vez de mostrar algo desatualizado.';


--
-- Name: COLUMN cotacoes_acoes.ticker; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cotacoes_acoes.ticker IS 'Código do ativo na B3 (ex: ABEV3, B3SA3).';


--
-- Name: COLUMN cotacoes_acoes.preco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cotacoes_acoes.preco IS 'Último preço em R$.';


--
-- Name: COLUMN cotacoes_acoes.variacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cotacoes_acoes.variacao IS 'Variação percentual do dia (%), não variação em R$.';


--
-- Name: COLUMN cotacoes_acoes.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cotacoes_acoes.atualizado_em IS 'Timestamp da última atualização do preço.';


--
-- Name: cotacoes_acoes_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotacoes_acoes_historico (
    ticker text NOT NULL,
    data date NOT NULL,
    preco_fechamento numeric NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE cotacoes_acoes_historico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cotacoes_acoes_historico IS 'Série histórica diária de fechamento por ticker — usada pra gráfico de tendência (preço da ação desde a data de entrada da opção até o vencimento, comparado ao strike). Diferente de cotacoes_acoes (só o preço mais recente, sobrescrito a cada sync) — esta tabela nunca sobrescreve, só acumula (INSERT ... ON CONFLICT (ticker,data) DO UPDATE, idempotente por dia). Alimentada por scripts/sync/atualizar_cotacoes_acoes.py (dia corrente, a cada sync) + backfill manual único (21/08/2026, via range histórico da brapi.dev) pros tickers com opção ativa (PETR4, ITUB4).';


--
-- Name: cotacoes_opcoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotacoes_opcoes (
    symbol text NOT NULL,
    preco numeric NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE cotacoes_opcoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cotacoes_opcoes IS 'Cotações de opções (hoje PETR4/ITUB4), 1 linha por symbol, sobrescrita a cada atualização (sem histórico). Alimentada por scripts/sync/atualizar_cotacoes_opcoes.py (brapi.dev). Usada para marcar a mercado (mark-to-market) as posições de opções vendidas em investimentos (tipo=''opcoes''), casando cotacoes_opcoes.symbol com investimentos.ticker.';


--
-- Name: COLUMN cotacoes_opcoes.symbol; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cotacoes_opcoes.symbol IS 'Código da opção (ex: PETRT379). Casa com investimentos.ticker para as posições tipo=''opcoes''.';


--
-- Name: COLUMN cotacoes_opcoes.preco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cotacoes_opcoes.preco IS 'Último prêmio/preço da opção em R$.';


--
-- Name: COLUMN cotacoes_opcoes.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cotacoes_opcoes.atualizado_em IS 'Timestamp da última atualização do preço.';


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
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    ultima_cobranca_em date,
    valor_cobrado_ultima_vez numeric,
    nome_fantasia_fatura text
);


--
-- Name: TABLE cronograma_assinaturas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cronograma_assinaturas IS 'Fonte viva (V2) das assinaturas recorrentes (streaming, apps, etc.) cobradas no Mastercard Black virtual 4628. Alimenta o Livro Razão LRS e o card mbLRSConfirmado. Migrada de literal estático em 11/08/2026 (antes era HTML fixo, nunca lido do banco). NÃO confundir com transações avulsas em `transacoes`: assinatura/recorrência reconhecida aqui NUNCA deve ser lançada de novo como transação solta (dobraria a conta) — ver regra permanente em cronograma_recorrencias.';


--
-- Name: COLUMN cronograma_assinaturas.tx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.tx IS 'Código legado (TXSxxxxxx) só para rastreabilidade/auditoria — não é chave usada por outra tabela relacional.';


--
-- Name: COLUMN cronograma_assinaturas.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.data IS 'Data de referência/criação do registro da assinatura no cronograma (não é data de cobrança), usada só para ordenação (order=data.asc na query padrão).';


--
-- Name: COLUMN cronograma_assinaturas.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.nome IS 'Nome comercial da assinatura como o usuário a reconhece (ex: "Meli+ (Mercado Livre)"). Pode diferir do nome que aparece na fatura real — ver nome_fantasia_fatura.';


--
-- Name: COLUMN cronograma_assinaturas.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.valor IS 'Valor mensal ATUAL/vigente da assinatura, em R$ — reflete o preço novo pra orçamento futuro. Pode NÃO bater com o valor realmente cobrado na última fatura se houve reajuste de preço nesse meio-tempo (ver valor_cobrado_ultima_vez).';


--
-- Name: COLUMN cronograma_assinaturas.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.ativo IS 'true = assinatura em vigor, entra nas somas de compromisso mensal e no Livro Razão LRS. false = cancelada, some das somas mas o histórico da linha fica preservado (não é deletada).';


--
-- Name: COLUMN cronograma_assinaturas.ultima_cobranca_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.ultima_cobranca_em IS 'Data real da última cobrança CONFIRMADA (vista na fatura), não a próxima prevista. Usada para filtrar se a assinatura "já cobrou neste ciclo" (jaCobrouNesteCicloGenerico) na reconciliação de fatura. Coluna existe desde 20/08/2026 — antes disso ficava de fora da query e o cálculo de reconciliado ficava zerado por engano (bug já corrigido).';


--
-- Name: COLUMN cronograma_assinaturas.valor_cobrado_ultima_vez; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.valor_cobrado_ultima_vez IS 'Valor efetivamente cobrado (R$) na última fatura, preenchido só quando DIVERGE de `valor` (ex: cobrança antiga no preço velho, já reajustado no cadastro). Nullable — null significa "cobrou exatamente o valor atual". Usado só na soma do "Não Reconciliado". NÃO confundir com `valor`, que é o preço vigente/futuro.';


--
-- Name: COLUMN cronograma_assinaturas.nome_fantasia_fatura; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_assinaturas.nome_fantasia_fatura IS 'Nome como a cobrança aparece literalmente na fatura do cartão (pode ser diferente do nome comercial em `nome`) — usado como referência de conferência na reconciliação, não em cálculo.';


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

COMMENT ON TABLE public.cronograma_boletos_fixos IS 'Fonte viva (V2) do schedule dos boletos fixos mensais (ex: prestação da casa, PIX FIES, curso de inglês) pagos via Caixa Boletos. Editável direto no Supabase, sem deploy de código — migrada em 08/08/2026 de um literal (VARS.CRONOGRAMA_BOLETOS_FIXOS em src/financeiro/caixas/vars-caixas.js, que hoje é só fallback síncrono do boot). Alimenta o Livro Razão LRB e a lógica de auto-crédito de boletos vencidos (aplicarBoletosVencidosAutomaticamente em app.js, que continua V1 inalterada — só o schedule de dia/valor vem da V2).';


--
-- Name: COLUMN cronograma_boletos_fixos.tx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_boletos_fixos.tx IS 'Código do boleto (TXBxxxxxx) — usado pra casar com o TX correspondente no Livro Razão LRB e, no caso dos TXCON (consórcios), também aparece com esse padrão apesar de logicamente pertencer ao domínio de consórcio.';


--
-- Name: COLUMN cronograma_boletos_fixos.dia_vencimento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_boletos_fixos.dia_vencimento IS 'Dia do mês (1-31) em que o boleto vence, TODO mês. NÃO é uma data específica.';


--
-- Name: COLUMN cronograma_boletos_fixos.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_boletos_fixos.valor IS 'Valor fixo mensal do boleto, em R$. É o valor que efetivamente sai da Caixa Boletos — NÃO confundir com teto/limite de caixa (ver caixas.teto_mensal, que é limite de gasto, não valor comprometido real).';


--
-- Name: COLUMN cronograma_boletos_fixos.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_boletos_fixos.ativo IS 'true = boleto em vigor, entra no schedule e no auto-crédito mensal. false = descontinuado, histórico preservado (ex: os 2 consórcios Porto migraram pra cá como TXCON000001/002 quando saíram do cartão, dia_vencimento 15).';


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
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    ultima_cobranca_em date
);


--
-- Name: TABLE cronograma_consorcios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cronograma_consorcios IS 'Fonte viva (V2) dos consórcios cobrados via cartão (histórico). Migrada de literal estático em 11/08/2026. ATENÇÃO — tabela hoje efetivamente VAZIA na prática: os 2 únicos consórcios (Porto Carro e Porto Casa Nova) migraram em 17/07/2026 de cobrança no Mastercard Black para pagamento em boleto pela Caixa Boletos, e ambas as linhas aqui ficaram com ativo=false permanentemente. A fonte viva atual dos consórcios é cronograma_boletos_fixos (tx TXCON000001/000002, dia_vencimento 15), NÃO esta tabela. O Livro Razão LRCON consulta esta tabela (filtro ativo=eq.true) e por isso mostra 0 lançamentos de propósito — não é bug.';


--
-- Name: COLUMN cronograma_consorcios.tx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_consorcios.tx IS 'Código legado do consórcio (TXCONxxxxxx) — mesmo padrão de tx usado depois em cronograma_boletos_fixos para os mesmos itens.';


--
-- Name: COLUMN cronograma_consorcios.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_consorcios.valor IS 'Valor da parcela mensal do consórcio, em R$, referente à ÉPOCA em que ainda era cobrado no cartão. Desatualizado/irrelevante hoje — valor real atual está em cronograma_boletos_fixos.';


--
-- Name: COLUMN cronograma_consorcios.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_consorcios.ativo IS 'false em ambas as linhas hoje — consórcio deixou de ser cobrado por este mecanismo (ver nota da tabela). NÃO reativar sem antes remover/ajustar o par correspondente em cronograma_boletos_fixos, senão o consórcio conta 2x.';


--
-- Name: COLUMN cronograma_consorcios.ultima_cobranca_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_consorcios.ultima_cobranca_em IS 'Data da última cobrança real no cartão, de quando esta tabela ainda era a fonte ativa (antes de 17/07/2026). Null em ambas as linhas atuais.';


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
-- Name: TABLE cronograma_doacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cronograma_doacoes IS 'Fonte viva (V2) das doações/repasses recorrentes reconhecidos (ex: crédito P2P doado). Migrada de literal estático em 11/08/2026. Alimenta o Livro Razão LRDOA. Hoje só 1 linha ativa (Vanessa).';


--
-- Name: COLUMN cronograma_doacoes.tx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_doacoes.tx IS 'Código legado da doação (TXRP2Pxxxxx ou similar) — só rastreabilidade, não FK.';


--
-- Name: COLUMN cronograma_doacoes.descricao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_doacoes.descricao IS 'Descrição livre do que é a doação/repasse (ex: "Crédito P2P doado à Vanessa").';


--
-- Name: COLUMN cronograma_doacoes.responsavel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_doacoes.responsavel IS 'Quem faz a doação (ex: "Wallace") — texto livre, não FK para usuário.';


--
-- Name: COLUMN cronograma_doacoes.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_doacoes.valor IS 'Valor mensal da doação, em R$.';


--
-- Name: COLUMN cronograma_doacoes.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_doacoes.ativo IS 'true = doação em vigor, entra no LRDOA e nas somas de compromisso mensal. false = encerrada, histórico preservado.';


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
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    ultima_cobranca_em date,
    valor_cobrado_ultima_vez numeric,
    nome_fantasia_fatura text
);


--
-- Name: TABLE cronograma_recorrencias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cronograma_recorrencias IS 'Fonte viva (V2) das despesas recorrentes de valor variável (Vivo, planos funerários, etc.), cobradas no Mastercard Black. Diferente de cronograma_assinaturas apenas por convenção de nome (mesma mecânica). Alimenta o Livro Razão LRR e a soma "Não Reconciliado" do MB. REGRA PERMANENTE (achado real, já repetido): nenhuma recorrência reconhecida aqui pode ser lançada de novo como transação avulsa em `transacoes` — dobraria a conta na Necessidade Total.';


--
-- Name: COLUMN cronograma_recorrencias.tx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.tx IS 'Código legado (TXRRxxxxxx) só para rastreabilidade — não é FK.';


--
-- Name: COLUMN cronograma_recorrencias.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.nome IS 'Nome comercial da recorrência (ex: "Vivo", "Digna"). Pode diferir do nome na fatura real — ver nome_fantasia_fatura.';


--
-- Name: COLUMN cronograma_recorrencias.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.valor IS 'Valor mensal ATUAL/vigente da recorrência, em R$. Pode NÃO bater com o valor realmente cobrado na última fatura após reajuste (ver valor_cobrado_ultima_vez) — ex.: Vivo mudou de R$539,08 (fatura de transição, 2 lançamentos) para R$435,00 a partir de set/2026.';


--
-- Name: COLUMN cronograma_recorrencias.cartao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.cartao IS 'Nome do cartão onde a recorrência é cobrada (ex: "Mastercard Black") — texto livre, não FK para tabela de cartões.';


--
-- Name: COLUMN cronograma_recorrencias.obs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.obs IS 'Observação livre de contexto/histórico da recorrência (ex: detalhe de reajuste de plano, explicação de cobrança dividida em 2 linhas na fatura). Só documentação, não entra em cálculo.';


--
-- Name: COLUMN cronograma_recorrencias.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.ativo IS 'true = recorrência em vigor, entra nas somas de compromisso mensal. false = cancelada, histórico preservado.';


--
-- Name: COLUMN cronograma_recorrencias.criado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.criado_em IS 'Timestamp de criação do registro — usado como critério de ordenação padrão da query (order=criado_em.asc), não tem relação com data de cobrança.';


--
-- Name: COLUMN cronograma_recorrencias.ultima_cobranca_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.ultima_cobranca_em IS 'Data real da última cobrança CONFIRMADA na fatura (não a próxima prevista). Usada pra filtrar se a recorrência "já cobrou de verdade dentro do ciclo atual do cartão" na soma do Não Reconciliado — achado real: sem esse filtro, uma recorrência cobrada dia 17/07 com próxima só em 11/09 contava em TODO ciclo entre essas datas por engano.';


--
-- Name: COLUMN cronograma_recorrencias.valor_cobrado_ultima_vez; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.valor_cobrado_ultima_vez IS 'Valor efetivamente cobrado (R$) na última fatura, só preenchido quando DIVERGE de `valor`. Nullable. NÃO confundir com `valor` (preço vigente/futuro).';


--
-- Name: COLUMN cronograma_recorrencias.nome_fantasia_fatura; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cronograma_recorrencias.nome_fantasia_fatura IS 'Nome como a cobrança aparece literalmente na fatura do cartão (pode ser bem diferente do nome comercial em `nome`, ex: "Digna" aparece como "Digna Vida E Pos Vida").';


--
-- Name: dividendos_acoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dividendos_acoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticker text NOT NULL,
    tipo text NOT NULL,
    valor numeric NOT NULL,
    data_pagamento date,
    data_com date,
    aprovado_em date,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dividendos_acoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dividendos_acoes IS 'Histórico de proventos (dividendos/JCP) por ação, via brapi.dev (?dividends=true, testado 21/08/2026 — grátis, sem token, campo dividendYield NÃO incluso, calcular manualmente). Alimenta o Calendário de Dividendos da "Carteira de Ações Recebidas" (opções exercidas). unique(ticker,tipo,data_pagamento,valor) evita duplicata em re-sync.';


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
-- Name: TABLE emprestimos_internos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.emprestimos_internos IS 'LREI - Livro de Empréstimos Internos entre caixas (ex: Caixa Lance cobre um gasto de outra caixa). Fonte V2 EXCLUSIVA, tabela viva - alimenta a tela via view vw_emprestimos_internos_v2 (ver hydrate-onda4-lrei.js/aplicarOnda4Lrei). Espelha 1:1 os antigos VARS.LREI_ATIVAS (fallback síncrono do boot em vars-reembolsos.js, mantido só como placeholder, não é mais a fonte real).';


--
-- Name: COLUMN emprestimos_internos.codigo_legado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.codigo_legado IS 'Código do livro no formato LREIxxxx (ex: LREI0005), herdado do ERP/planilha antiga. Identificador de exibição, não é chave técnica.';


--
-- Name: COLUMN emprestimos_internos.data_emprestimo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.data_emprestimo IS 'Data em que o empréstimo interno foi concedido (caixa credora cobriu o gasto da devedora).';


--
-- Name: COLUMN emprestimos_internos.caixa_credora_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.caixa_credora_id IS 'FK para caixas: caixa que EMPRESTOU o dinheiro (fica com o direito a receber de volta). NÃO confundir com caixa_devedora_id.';


--
-- Name: COLUMN emprestimos_internos.caixa_devedora_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.caixa_devedora_id IS 'FK para caixas: caixa que DEVE o valor de volta pra credora. Pode ser NULL quando o devedor não é uma caixa cadastrada (ver devedora_texto nesse caso, ex: "Fatura Cartão Mercado Pago").';


--
-- Name: COLUMN emprestimos_internos.devedora_texto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.devedora_texto IS 'Descrição textual do devedor quando ele não corresponde a uma caixa cadastrada (caixa_devedora_id fica NULL). Ex: "Fatura Cartão Mercado Pago".';


--
-- Name: COLUMN emprestimos_internos.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.valor IS 'Valor emprestado, em R$.';


--
-- Name: COLUMN emprestimos_internos.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.origem IS 'Texto livre explicando o motivo/contexto do empréstimo (o "porquê" da cobertura).';


--
-- Name: COLUMN emprestimos_internos.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.status IS 'ATIVO (ainda não quitado) ou QUITADO (já foi pago de volta pra caixa credora).';


--
-- Name: COLUMN emprestimos_internos.data_quitacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.data_quitacao IS 'Data em que o empréstimo foi efetivamente quitado. NULL enquanto status = ATIVO.';


--
-- Name: COLUMN emprestimos_internos.quitado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.quitado_por IS 'Texto livre descrevendo como/com qual transação a quitação aconteceu (ex: referência a um TX de reembolso).';


--
-- Name: COLUMN emprestimos_internos.transacao_quitacao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.emprestimos_internos.transacao_quitacao_id IS 'Referência (não FK formal) à transação em `transacoes` que efetivou a quitação, quando existe.';


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
-- Name: TABLE energia_solar_consumo_referencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.energia_solar_consumo_referencia IS 'Consumo mensal de referência (kWh) de cada uma das 3 casas do rateio solar (Wallace, mãe, irmã), usado como baseline em gráficos e alertas de cobertura/projeção. Fonte VIVA (migrada 14/08/2026 do hardcode em src/solar/vars-energia-solar.js) — app.js lê esta tabela em window.WALLACE_SOLAR_CONSUMO_REFERENCIA_V2 e sobrescreve VARS.solarConsumoDiario{Wallace,Irma,Mae} quando disponível, mas TEM fallback silencioso pro valor hardcoded se a tabela estiver vazia/offline (diferente de energia_solar_leituras/energia_solar_geracao_diaria, que são V2-exclusivas sem fallback).';


--
-- Name: COLUMN energia_solar_consumo_referencia.casa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_consumo_referencia.casa IS 'Identifica a casa: ''wallace'', ''mae'' ou ''irma''. Usado para mapear pro campo VARS correspondente (CASA_PARA_CAMPO_VARS em app.js).';


--
-- Name: COLUMN energia_solar_consumo_referencia.consumo_mensal_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_consumo_referencia.consumo_mensal_kwh IS 'Consumo mensal de referência em kWh, tirado da fatura Energisa real da casa (não estimado).';


--
-- Name: COLUMN energia_solar_consumo_referencia.dias_base; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_consumo_referencia.dias_base IS 'Número de dias usado para derivar consumo_diario_kwh a partir de consumo_mensal_kwh (normalmente 30).';


--
-- Name: COLUMN energia_solar_consumo_referencia.consumo_diario_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_consumo_referencia.consumo_diario_kwh IS 'Consumo diário médio em kWh = consumo_mensal_kwh / dias_base. É o valor efetivamente usado em VARS (6 lugares do código: gráficos de energia, alerta de cobertura, projeção de consumo esperado).';


--
-- Name: COLUMN energia_solar_consumo_referencia.fonte; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_consumo_referencia.fonte IS 'Texto livre citando a origem do dado (ex: número da fatura Energisa, ou robô que atualizou automaticamente) — auditoria de proveniência, não um enum fixo.';


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
-- Name: TABLE energia_solar_geracao_diaria; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.energia_solar_geracao_diaria IS 'Histórico de geração de energia solar por dia (1 linha por data), da usina da Casa da Mãe. Fonte VIVA e V2-EXCLUSIVA (desde 08/08/2026): alimentada 2x/dia pelo robô scripts/sync/atualizar_geracao_saj.py (scraping da API SAJ/Elekeeper), upsert por `data`. app.js lê via window.WALLACE_SOLAR_GERACAO_DIARIA_V2 SEM fallback pro wallace_dados/V1 — se a tabela não responder, os campos dependentes ficam vazios (nunca herdam valor antigo). Consumida por hydrate-onda5-qualidade-geracao.js e graficos-cenarios-lazy.js. Pode ter gaps reais de dias sem sincronização (nunca preenchido artificialmente).';


--
-- Name: COLUMN energia_solar_geracao_diaria.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_geracao_diaria.data IS 'Data civil (Brasília) da geração. Chave de upsert do robô SAJ — uma linha por dia, sobrescrita se o robô rodar de novo no mesmo dia.';


--
-- Name: COLUMN energia_solar_geracao_diaria.geracao_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_geracao_diaria.geracao_kwh IS 'Geração total do dia em kWh (campo energy1Today da API SAJ). Valor final do dia, não acumulado histórico da usina.';


--
-- Name: COLUMN energia_solar_geracao_diaria.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_geracao_diaria.atualizado_em IS 'Timestamp da última escrita/upsert desta linha pelo robô — usado por telas de "frescor" pra saber se o dado está desatualizado.';


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

COMMENT ON TABLE public.energia_solar_geracao_intraday IS 'Log de leituras intermediárias de geração acumulada do dia (kWh), uma linha por execução do robô SAJ (2x/dia), sempre por INSERT puro (nunca upsert/sobrescreve) — ao contrário de energia_solar_geracao_diaria, que guarda só o valor final do dia. Construído desde 12/08/2026 pra formar uma curva real de "quanto a usina costuma ter gerado até tal horário", usada pelo card "Qualidade da Geração" pra comparar o dia em andamento contra uma curva real em vez de estimativa linear. Ainda em fase de acumulação de histórico.';


--
-- Name: COLUMN energia_solar_geracao_intraday.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_geracao_intraday.data IS 'Data civil (Brasília) a que esta leitura pertence (pode ter várias linhas na mesma data, uma por horário de captura).';


--
-- Name: COLUMN energia_solar_geracao_intraday.capturado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_geracao_intraday.capturado_em IS 'Timestamp exato da captura pelo robô (granularidade de minutos, não só o dia).';


--
-- Name: COLUMN energia_solar_geracao_intraday.geracao_acumulada_hoje_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_geracao_intraday.geracao_acumulada_hoje_kwh IS 'Geração acumulada do dia (kWh) no momento exato de capturado_em — não é o total final do dia, é um ponto da curva intradiária.';


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
    geracao_acumulada_atualizado_em timestamp with time zone,
    CONSTRAINT energia_solar_leituras_casa_check CHECK ((casa = ANY (ARRAY['propria'::text, 'irma'::text, 'mae'::text]))),
    CONSTRAINT energia_solar_leituras_evidencia_obrigatoria CHECK (((NOT eh_leitura_oficial_energisa) OR ((evidencia IS NOT NULL) AND (length(TRIM(BOTH FROM evidencia)) > 0))))
);


--
-- Name: TABLE energia_solar_leituras; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.energia_solar_leituras IS 'Leituras manuais/esporádicas do medidor bidirecional Energisa (códigos 03/103) na Casa da Mãe, mais o vínculo com a geração acumulada do inversor SAJ naquele momento. Fonte VIVA e V2-EXCLUSIVA desde 08/08/2026 (app.js lê via window.WALLACE_SOLAR_LEITURAS_V2, sem fallback pro wallace_dados/V1). Granularidade: 1 linha por leitura manual (não é diária) — normalmente enviada pelo usuário via foto/chat. As leituras que fecham um ciclo de faturamento são linkadas em ciclos_solares (leitura_inicio_id/leitura_fechamento_id); as demais são só acompanhamento intermediário do ciclo aberto.';


--
-- Name: COLUMN energia_solar_leituras.casa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.casa IS 'Casa onde a leitura foi feita — hoje sempre ''mae'' (unidade geradora com o medidor bidirecional da Energisa).';


--
-- Name: COLUMN energia_solar_leituras.leitura_03; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.leitura_03 IS 'Leitura do código 03 do medidor bidirecional: energia IMPORTADA da rede (kWh, valor acumulado do medidor, não delta). NÃO confundir com leitura_103 (exportada).';


--
-- Name: COLUMN energia_solar_leituras.leitura_103; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.leitura_103 IS 'Leitura do código 103 do medidor bidirecional: energia EXPORTADA para a rede (kWh, valor acumulado do medidor, não delta). É o código relevante pro crédito solar.';


--
-- Name: COLUMN energia_solar_leituras.geracao_acumulada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.geracao_acumulada IS 'Geração acumulada TOTAL do inversor SAJ (kWh, desde a instalação da usina) no momento desta leitura — preenchida automaticamente pelo robô atualizar_geracao_saj.py na leitura mais recente ainda vazia (nunca sobrescreve uma leitura que já tem valor). NÃO confundir com energia_solar_geracao_diaria.geracao_kwh, que é a geração só DAQUELE dia.';


--
-- Name: COLUMN energia_solar_leituras.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.data IS 'Data civil (Brasília) em que a leitura foi feita/registrada.';


--
-- Name: COLUMN energia_solar_leituras.ciclo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.ciclo_id IS 'FK para ciclos_solares.id quando esta leitura fecha ou abre um ciclo. NULL para leituras de acompanhamento intermediário (a maioria).';


--
-- Name: COLUMN energia_solar_leituras.eh_leitura_oficial_energisa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.eh_leitura_oficial_energisa IS 'TRUE só quando a leitura veio da fatura oficial da Energisa (fecha o ciclo de faturamento de verdade); FALSE para leituras manuais de acompanhamento feitas pelo usuário entre faturas (foto do medidor, não é o fechamento oficial).';


--
-- Name: COLUMN energia_solar_leituras.evidencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.evidencia IS 'Texto livre com a origem/prova da leitura (ex.: "leitura manual enviada via foto pelo usuário em DD/MM", cálculo do delta contra a leitura anterior) — auditoria, não usado em cálculo.';


--
-- Name: COLUMN energia_solar_leituras.geracao_acumulada_atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_leituras.geracao_acumulada_atualizado_em IS 'Timestamp de quando geracao_acumulada foi preenchido pelo robô SAJ (adicionado 18/08/2026 — antes não existia, e por isso a trava de "descompasso" do painel nunca conseguia disparar por falta de data pra comparar).';


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

COMMENT ON TABLE public.energia_solar_medicoes_tempo_real IS 'Tabela criada em 12/08/2026 (Fase 2 do plano de evolução do medidor DDSU666, ver docs/decisions/EVOLUCAO_SOLAR_MEDIDOR_SAJ.md) para dado de alta frequência (geração/consumo/import/export instantâneos em Watts) vindo do medidor bidirecional DDSU666 instalado na Casa da Mãe (15/08/2026). AINDA VAZIA / NÃO CONSUMIDA: nenhum robô grava aqui e nenhum código do site lê esta tabela ainda — só schema criado antecipadamente. Os nomes de coluna são SUGERIDOS, não confirmados contra payload real da API (podem receber ALTER TABLE quando a Fase 1/sondagem confirmar o formato real).';


--
-- Name: COLUMN energia_solar_medicoes_tempo_real.capturado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_medicoes_tempo_real.capturado_em IS 'Timestamp da leitura instantânea do medidor. Granularidade planejada: minutos, não dias (diferente de energia_solar_geracao_diaria).';


--
-- Name: COLUMN energia_solar_medicoes_tempo_real.geracao_instantanea_w; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_medicoes_tempo_real.geracao_instantanea_w IS 'Potência de geração instantânea em Watts (kWp no momento) — NÃO em kWh acumulado, diferente das demais tabelas do domínio Solar.';


--
-- Name: COLUMN energia_solar_medicoes_tempo_real.consumo_instantaneo_w; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_medicoes_tempo_real.consumo_instantaneo_w IS 'Potência de consumo instantâneo da casa em Watts, medida no ponto de conexão.';


--
-- Name: COLUMN energia_solar_medicoes_tempo_real.importacao_w; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_medicoes_tempo_real.importacao_w IS 'Potência importada da rede em Watts no instante da leitura (quando consumo > geração).';


--
-- Name: COLUMN energia_solar_medicoes_tempo_real.exportacao_w; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_medicoes_tempo_real.exportacao_w IS 'Potência exportada para a rede em Watts no instante da leitura (quando geração > consumo).';


--
-- Name: COLUMN energia_solar_medicoes_tempo_real.autoconsumo_w; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_medicoes_tempo_real.autoconsumo_w IS 'Potência gerada e consumida na hora (nunca passa pela rede), em Watts — derivado ou vindo pronto da API, a confirmar quando a integração real for implementada. NÃO confundir com a estimativa de 50% de autoconsumo usada hoje em src/solar/energia-solar.js (gerarForecastSolar) — aquela é premissa de simulação de cenário futuro, não dado real desta tabela.';


--
-- Name: COLUMN energia_solar_medicoes_tempo_real.fonte; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.energia_solar_medicoes_tempo_real.fonte IS 'Origem da medição, default ''medidor_saj'' — existe pra nunca confundir dado real do medidor com a estimativa de autoconsumo do simulador.';


--
-- Name: erros_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erros_cliente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    mensagem text NOT NULL,
    stack text,
    contexto jsonb,
    origem_ip text
);


--
-- Name: TABLE erros_cliente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.erros_cliente IS 'Log de erros de runtime JavaScript capturados no navegador (window.onerror / unhandledrejection) e gravados via função RPC chamada pelo próprio front-end. É telemetria de bug de front-end (ex.: "ReferenceError", "SyntaxError") — NÃO confundir com audit_log (mudança de dado financeiro) nem com execucoes_jobs (heartbeat de job de servidor).';


--
-- Name: COLUMN erros_cliente.ocorrido_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros_cliente.ocorrido_em IS 'Timestamp (UTC) em que o erro ocorreu no navegador do usuário.';


--
-- Name: COLUMN erros_cliente.mensagem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros_cliente.mensagem IS 'Mensagem do erro JS, truncada em 2000 caracteres pela função de inserção.';


--
-- Name: COLUMN erros_cliente.stack; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros_cliente.stack IS 'Stack trace do erro (inclui geralmente a URL do arquivo/versão, ex. "?v=20260812-0339"), truncado em 4000 caracteres.';


--
-- Name: COLUMN erros_cliente.contexto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros_cliente.contexto IS 'JSON livre com metadados adicionais do erro (ex.: {"tipo":"erro"} ou {"tipo":"promise"} para rejeições não tratadas).';


--
-- Name: COLUMN erros_cliente.origem_ip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros_cliente.origem_ip IS 'IP de origem da requisição que reportou o erro, quando capturado; frequentemente NULL.';


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
-- Name: TABLE execucoes_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.execucoes_jobs IS 'Heartbeat de automações agendadas (pg_cron / scripts Python externos, ex. backup, geracao_solar, pluggy): cada job grava uma linha ao final de toda execução, sucesso ou erro. Consumido pela view vw_saude_jobs e por hydrate-saude-operacional.js pra classificar cada job em OK/Atenção/Falha por idade da última execução (card "Saúde Operacional", hardening 11/08/2026 — existe pra eliminar falha silenciosa de automação). NÃO confundir com audit_log (mudança de dado) nem com erros_cliente (erro de front-end).';


--
-- Name: COLUMN execucoes_jobs.job_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.execucoes_jobs.job_nome IS 'Identificador do job (ex.: backup, geracao_solar, pluggy) — usado para agrupar/ordenar na view vw_saude_jobs.';


--
-- Name: COLUMN execucoes_jobs.executado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.execucoes_jobs.executado_em IS 'Timestamp (UTC) do fim dessa execução do job.';


--
-- Name: COLUMN execucoes_jobs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.execucoes_jobs.status IS 'Resultado da execução: ''sucesso'' ou ''erro'' (CHECK constraint restringe a esses 2 valores).';


--
-- Name: COLUMN execucoes_jobs.detalhe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.execucoes_jobs.detalhe IS 'Mensagem livre com detalhe do resultado (ex. texto do erro), quando aplicável; costuma ser NULL em sucesso.';


--
-- Name: COLUMN execucoes_jobs.duracao_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.execucoes_jobs.duracao_ms IS 'Duração da execução em milissegundos, quando o script mede e reporta; frequentemente NULL.';


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
-- Name: TABLE financiamentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.financiamentos IS 'Detalhe de financiamentos/consórcios (imóvel e veículo) vinculados a um item de `patrimonio` via patrimonio_id. Fonte V2 EXCLUSIVA, alimenta a tela via view vw_patrimonio_v2 (ver hydrate-onda4-patrimonio.js/aplicarOnda4Patrimonio). Sem fallback V1 em caso de erro (domínio migrado por completo, exceto Caixa Lance que fica fora deste escopo).';


--
-- Name: COLUMN financiamentos.patrimonio_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.patrimonio_id IS 'FK para patrimonio.id: o ativo (imóvel/veículo) ao qual este financiamento/consórcio se refere.';


--
-- Name: COLUMN financiamentos.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.tipo IS 'Tipo do financiamento: financiamento_imovel (financiamento bancário tradicional), consorcio_imovel ou consorcio_veiculo.';


--
-- Name: COLUMN financiamentos.carta_credito; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.carta_credito IS 'Valor da carta de crédito do consórcio, em R$ (não se aplica a financiamento_imovel, fica NULL).';


--
-- Name: COLUMN financiamentos.parcela_valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.parcela_valor IS 'Valor da parcela mensal, em R$.';


--
-- Name: COLUMN financiamentos.parcelas_pagas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.parcelas_pagas IS 'Quantidade de parcelas já pagas até agora (nem sempre preenchido - alguns registros usam percentual_pago/meses_restantes em vez disso).';


--
-- Name: COLUMN financiamentos.parcelas_totais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.parcelas_totais IS 'Quantidade total de parcelas do contrato.';


--
-- Name: COLUMN financiamentos.meses_restantes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.meses_restantes IS 'Quantidade de meses restantes até o fim do financiamento/consórcio.';


--
-- Name: COLUMN financiamentos.percentual_pago; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.percentual_pago IS 'Percentual já pago do consórcio (0-100, ex: 75.22 = 75,22%). NÃO confundir com um percentual sobre o saldo devedor bancário - é sobre a carta de crédito do consórcio.';


--
-- Name: COLUMN financiamentos.valor_quitacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.valor_quitacao IS 'Valor necessário pra quitar/antecipar o saldo devedor hoje, em R$ (não é o saldo já pago).';


--
-- Name: COLUMN financiamentos.proxima_assembleia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.financiamentos.proxima_assembleia IS 'Data da próxima assembleia do consórcio (não se aplica a financiamento_imovel, fica NULL).';


--
-- Name: glicose_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.glicose_leituras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date NOT NULL,
    glicose_mgdl integer NOT NULL,
    periodo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE glicose_leituras; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.glicose_leituras IS 'Registro pessoal de glicemia (aba Emagrecimento). 1 linha por leitura, inserida manualmente/via agente (RLS só leitura, sem formulário de insert no painel). Fonte viva desde 16/08/2026.';


--
-- Name: COLUMN glicose_leituras.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.glicose_leituras.data IS 'Data real da leitura (não a data de registro — essa é created_at).';


--
-- Name: COLUMN glicose_leituras.glicose_mgdl; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.glicose_leituras.glicose_mgdl IS 'Glicemia em mg/dL.';


--
-- Name: COLUMN glicose_leituras.periodo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.glicose_leituras.periodo IS 'Contexto da leitura (ex.: "jejum", "pós-refeição", "aleatório"). Pode ser NULL. A classificação de referência (Normal <100 / Pré-diabetes 100-125 / Diabetes ≥126 em jejum) só é aplicada quando periodo=''jejum'' ou está NULL — outros períodos variam demais fisiologicamente e ficam sem rótulo pra não inventar diagnóstico fora de contexto.';


--
-- Name: historico_relatorios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_relatorios (
    competencia text NOT NULL,
    score numeric,
    dados_json jsonb NOT NULL,
    analise_ia jsonb NOT NULL,
    pdf_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE historico_relatorios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.historico_relatorios IS 'Série histórica dos relatórios/Wealth Score Index (WWI) gerados ao final de cada ciclo financeiro. 1 linha por competência (ciclo). Escrita EXCLUSIVA do job mensal server-side (service_role) — o client-side (painel) só faz leitura pública via WallaceFinanceService, nunca escreve aqui. Usada para comparar o ciclo atual com ciclos anteriores no relatório executivo.';


--
-- Name: COLUMN historico_relatorios.competencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historico_relatorios.competencia IS 'Chave do ciclo financeiro no formato YYYY-MM, mas representa o CICLO financeiro (fechamento dia 25→24), não o mês calendário. É a chave primária/natural da tabela — vem de VARS.cicloAtual, decisão explícita do usuário.';


--
-- Name: COLUMN historico_relatorios.score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historico_relatorios.score IS 'Wealth Score (Índice de Bem-Estar Financeiro) do ciclo, 0-100, calculado a partir dos subscores em dados_json.wealthScore.';


--
-- Name: COLUMN historico_relatorios.dados_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historico_relatorios.dados_json IS 'JSON completo com os indicadores/subscores/dados narrativos brutos calculados no fechamento do ciclo (índices, balanço, centros de custo, metas etc.) — insumo estruturado do relatório.';


--
-- Name: COLUMN historico_relatorios.analise_ia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historico_relatorios.analise_ia IS 'JSON com o texto gerado (riscos, pontos fortes/fracos, oportunidades, parecer final) para o relatório executivo daquele ciclo — narrativa, não os números brutos (esses ficam em dados_json).';


--
-- Name: COLUMN historico_relatorios.pdf_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historico_relatorios.pdf_url IS 'URL do PDF do relatório gerado para essa competência, se já foi exportado. Pode ser NULL se ainda não foi gerado/exportado.';


--
-- Name: COLUMN historico_relatorios.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.historico_relatorios.atualizado_em IS 'Timestamp da última atualização da linha (ex.: reprocessamento de metodologia). Ver analise_ia.regrasAplicadas para histórico de reprocessamentos naquele ciclo.';


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
-- Name: TABLE indicadores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.indicadores IS 'Log histórico de indicadores calculados no site (motor V1 em JS), gravado via RPC registrar_indicador(p_nome, p_valor) toda vez que o motor recalcula (recalcular-necessidade.js, recalcular-indicadores.js). É só ESCRITA fire-and-forget a partir do site — o painel nunca lê de volta esta tabela, cada recálculo grava um novo snapshot com data_calculo=hoje. Serve de série histórica pra consulta externa (Chat/API), não é fonte viva de nenhum campo exibido no painel.';


--
-- Name: COLUMN indicadores.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.indicadores.nome IS 'Chave do indicador, ex.: "PIB Wallace - total", "PIB Wallace - reembolsos", "PIB Wallace - rendimentos", "necessidadeTotalBruta", "necessidadeLiquida". Não é enum fixo — cada chamada de registrar_indicador pode criar um nome novo.';


--
-- Name: COLUMN indicadores.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.indicadores.valor IS 'Valor numérico do indicador no momento do cálculo (R$ na maioria dos casos, ex.: PIB Wallace em reais). Snapshot pontual, não corrigido depois.';


--
-- Name: COLUMN indicadores.data_calculo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.indicadores.data_calculo IS 'Data em que o valor foi calculado/gravado (normalmente = data do boot/recálculo, não uma data de referência escolhida pelo usuário).';


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
-- Name: TABLE investimentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.investimentos IS 'Tabela genérica de posições de investimento do usuário, MISTURANDO tipos diferentes na coluna tipo (ex: ''LFTS11'' = ETF Tesouro Selic, ''P2P'' = créditos de empréstimo peer-to-peer, ''opcoes'' = opções vendidas/short na B3). NÃO confundir com pluggy_investimentos (essa é só CDB Itaú sincronizado via Pluggy, tabela separada). Para ROC/opções, o painel lê só as linhas tipo=''opcoes'' (ver WallaceFinanceService.getInvestimentosOpcoesV2 em app.js, e cálculo em opcoes-roc.js). Fonte VIVA, atualizada manualmente pelo usuário (não há robô automático gravando aqui).';


--
-- Name: COLUMN investimentos.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.tipo IS 'Categoria da posição: valores observados ''LFTS11'', ''P2P'', ''opcoes''. Determina quais das colunas específicas de opções (ativo_subjacente, preco_exercicio, etc.) fazem sentido — pra tipo != ''opcoes'' essas colunas ficam NULL.';


--
-- Name: COLUMN investimentos.quantidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.quantidade IS 'Quantidade de cotas/contratos. Para opções vendidas (short), aparece NEGATIVA (ex: -200) — não é erro de sinal, representa posição vendida.';


--
-- Name: COLUMN investimentos.valor_atual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.valor_atual IS 'Valor atual da posição em R$ (marcação mais recente conhecida). Para opções vendidas pode ser negativo (passivo em aberto).';


--
-- Name: COLUMN investimentos.data_atualizacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.data_atualizacao IS 'Data de referência do valor_atual mais recente.';


--
-- Name: COLUMN investimentos.ticker; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.ticker IS 'Código do ativo/opção. Para opções, casa com cotacoes_opcoes.symbol pra marcação a mercado.';


--
-- Name: COLUMN investimentos.ativo_subjacente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.ativo_subjacente IS 'Só para tipo=''opcoes'': código da ação-base da opção (ex: PETR4). NULL pros demais tipos.';


--
-- Name: COLUMN investimentos.preco_exercicio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.preco_exercicio IS 'Só para tipo=''opcoes'': preço de exercício (strike) em R$. NULL pros demais tipos.';


--
-- Name: COLUMN investimentos.data_vencimento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.data_vencimento IS 'Só para tipo=''opcoes'': data de vencimento do contrato. NULL pros demais tipos.';


--
-- Name: COLUMN investimentos.premio_bruto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.premio_bruto IS 'Só para tipo=''opcoes'': prêmio bruto recebido na venda da opção, em R$, ANTES de descontar custo_operacional. NÃO confundir com premio_recebido (que é o líquido).';


--
-- Name: COLUMN investimentos.custo_operacional; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.custo_operacional IS 'Só para tipo=''opcoes'': custos da operação (corretagem/emolumentos) em R$, descontados do prêmio bruto.';


--
-- Name: COLUMN investimentos.premio_recebido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.premio_recebido IS 'Só para tipo=''opcoes'': prêmio LÍQUIDO efetivamente recebido em R$ = premio_bruto - custo_operacional. É este valor, não premio_bruto, que entra no cálculo de ROC.';


--
-- Name: COLUMN investimentos.preco_medio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.preco_medio IS 'Só para tipo=''opcoes'': preço médio por contrato/opção (premio_recebido / |quantidade|, aproximadamente).';


--
-- Name: COLUMN investimentos.nota_corretagem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.nota_corretagem IS 'Só para tipo=''opcoes'': referência textual da nota de corretagem (número + data), texto livre, não FK.';


--
-- Name: COLUMN investimentos.exercida; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.exercida IS 'Só para tipo=''opcoes'': flag de CONFIRMAÇÃO MANUAL de que a opção foi exercida (default false). NÃO é calculado automaticamente pela data de vencimento — "vencida" (passou da data) é calculado à parte no app (VARS.opcoesVendidasDetalhe); uma opção pode estar vencida=true (calculado) e exercida=false (ainda não confirmada manualmente, caso mais comum: "virou pó").';


--
-- Name: COLUMN investimentos.data_operacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investimentos.data_operacao IS 'Só para tipo=''opcoes'': data em que a operação de venda da opção foi executada (não confundir com data_atualizacao, que é a data da última marcação de valor).';


--
-- Name: legendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legendas (
    id text NOT NULL,
    texto text NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE legendas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.legendas IS 'Fonte VIVA (V2) de textos explicativos/legendas exibidos no painel (tooltips, notas de rodapé de seções como Parcelamentos Visa/MP, Limbo Corporativo, cronograma de boletos, ROC, simulador de ciclo, etc.). Lida em runtime pelos módulos hydrate-*.js e vars-operacional.js — editar aqui muda o texto exibido no site sem precisar de deploy de código.';


--
-- Name: COLUMN legendas.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.legendas.id IS 'Chave textual estável usada no código pra buscar a legenda (ex.: "legParcelamentosVisaAuto", "legLRCLimboCorporativo") — precisa bater exatamente com a string usada no hydrate-*.js correspondente, senão a legenda não aparece.';


--
-- Name: COLUMN legendas.texto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.legendas.texto IS 'Texto da legenda/nota exibido na tela, em português, pode conter explicação de regra de negócio (ex.: prioridade de reembolso, mecanismo de auto-avanço de parcelas).';


--
-- Name: COLUMN legendas.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.legendas.atualizado_em IS 'Timestamp da última edição manual do texto.';


--
-- Name: medidor_ddsu666_saj_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medidor_ddsu666_saj_leituras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capturado_em timestamp with time zone DEFAULT now() NOT NULL,
    tensao_v numeric,
    corrente_a numeric,
    potencia_ativa_w numeric,
    energia_importada_kwh numeric,
    energia_exportada_kwh numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE medidor_ddsu666_saj_leituras; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.medidor_ddsu666_saj_leituras IS 'Leituras do medidor bidirecional DDSU666 (instalado 15/08/2026, homologado junto ao inversor SAJ), gravadas pelo firmware ESP32 (firmware/esp32_ddsu666_saj). Fonte VIVA, distinta do medidor Tuya (que é unidirecional/só consumo) — este mede importação E exportação de energia (rede <-> solar).';


--
-- Name: COLUMN medidor_ddsu666_saj_leituras.capturado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_ddsu666_saj_leituras.capturado_em IS 'Timestamp real da leitura no medidor (pode diferir de created_at se houver atraso de envio).';


--
-- Name: COLUMN medidor_ddsu666_saj_leituras.tensao_v; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_ddsu666_saj_leituras.tensao_v IS 'Tensão instantânea em Volts.';


--
-- Name: COLUMN medidor_ddsu666_saj_leituras.corrente_a; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_ddsu666_saj_leituras.corrente_a IS 'Corrente instantânea em Ampères.';


--
-- Name: COLUMN medidor_ddsu666_saj_leituras.potencia_ativa_w; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_ddsu666_saj_leituras.potencia_ativa_w IS 'Potência ativa instantânea em Watts.';


--
-- Name: COLUMN medidor_ddsu666_saj_leituras.energia_importada_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_ddsu666_saj_leituras.energia_importada_kwh IS 'Contador acumulado (kWh) de energia IMPORTADA da rede (consumida da concessionária). Contador monotônico crescente — para consumo de um período, calcular a diferença entre leituras.';


--
-- Name: COLUMN medidor_ddsu666_saj_leituras.energia_exportada_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_ddsu666_saj_leituras.energia_exportada_kwh IS 'Contador acumulado (kWh) de energia EXPORTADA para a rede (excedente solar injetado). Contador monotônico crescente — para exportação de um período, calcular a diferença entre leituras. NÃO confundir com energia_importada_kwh.';


--
-- Name: medidor_tuya_consumo_diario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medidor_tuya_consumo_diario (
    data date NOT NULL,
    kwh_consumido numeric NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    casa text DEFAULT 'wallace'::text NOT NULL
);


--
-- Name: TABLE medidor_tuya_consumo_diario; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.medidor_tuya_consumo_diario IS 'Consumo diário agregado (1 linha por casa por dia) derivado das leituras de medidor_tuya_leituras, mantido por trigger de banco (trg_medidor_tuya_consumo_diario). Fonte VIVA e mais confiável para consumo diário que medidor_tuya_leituras.energia_hoje_kwh.';


--
-- Name: COLUMN medidor_tuya_consumo_diario.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_consumo_diario.data IS 'Dia (calendário) a que o consumo agregado se refere.';


--
-- Name: COLUMN medidor_tuya_consumo_diario.kwh_consumido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_consumo_diario.kwh_consumido IS 'Consumo total do dia em kWh para essa casa. Fonte usada pelos gráficos de cenário (graficos-cenarios-lazy.js) para consumo por mês/ciclo.';


--
-- Name: COLUMN medidor_tuya_consumo_diario.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_consumo_diario.atualizado_em IS 'Timestamp da última atualização desta linha pelo trigger (o dia corrente é reatualizado a cada nova leitura).';


--
-- Name: COLUMN medidor_tuya_consumo_diario.casa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_consumo_diario.casa IS 'Qual casa/unidade: ''wallace'' ou ''wellida''.';


--
-- Name: medidor_tuya_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medidor_tuya_leituras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    capturado_em timestamp with time zone DEFAULT now() NOT NULL,
    tensao_v numeric,
    corrente_a numeric,
    potencia_w numeric,
    energia_hoje_kwh numeric,
    energia_total_kwh numeric,
    estado text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    casa text DEFAULT 'wallace'::text NOT NULL
);


--
-- Name: TABLE medidor_tuya_leituras; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.medidor_tuya_leituras IS 'Leituras brutas do medidor de energia Tuya (unidirecional, só mede consumo — diferente do DDSU666 que é bidirecional), gravadas várias vezes por dia pelo robô scripts/sync/atualizar_medidor_tuya.py. Existe 1 medidor por casa (coluna casa: ''wallace''/''wellida''). Fonte VIVA.';


--
-- Name: COLUMN medidor_tuya_leituras.capturado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.capturado_em IS 'Timestamp real da leitura no medidor.';


--
-- Name: COLUMN medidor_tuya_leituras.tensao_v; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.tensao_v IS 'Tensão instantânea em Volts.';


--
-- Name: COLUMN medidor_tuya_leituras.corrente_a; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.corrente_a IS 'Corrente instantânea em Ampères.';


--
-- Name: COLUMN medidor_tuya_leituras.potencia_w; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.potencia_w IS 'Potência instantânea em Watts.';


--
-- Name: COLUMN medidor_tuya_leituras.energia_hoje_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.energia_hoje_kwh IS 'Energia consumida "hoje" segundo o contador interno do próprio medidor Tuya. No modelo bidirecional_ab este campo costuma vir NULL — nesse caso o app (hydrate-medidor-tuya.js) reaproveita medidor_tuya_consumo_diario do mesmo dia como substituto. NÃO é a fonte mais confiável de consumo diário — ver medidor_tuya_consumo_diario.kwh_consumido.';


--
-- Name: COLUMN medidor_tuya_leituras.energia_total_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.energia_total_kwh IS 'Contador acumulado (kWh) monotônico crescente desde a instalação do medidor. Para consumo de um ciclo/período, calcular a DIFERENÇA entre a leitura mais recente e uma leitura base (ver lógica em hydrate-medidor-tuya.js) — nunca usar o valor absoluto como "consumo do período". Pode ficar em platô (valor idêntico) por período prolongado sem indicar necessariamente falha.';


--
-- Name: COLUMN medidor_tuya_leituras.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.estado IS 'Estado reportado pelo dispositivo Tuya (ex: "working"). Não é status de sincronização do robô.';


--
-- Name: COLUMN medidor_tuya_leituras.casa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.medidor_tuya_leituras.casa IS 'Qual casa/unidade este medidor mede: ''wallace'' ou ''wellida''. Cada casa tem seu próprio medidor físico.';


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

COMMENT ON TABLE public.mercadopago_eventos IS 'Eventos financeiros do Mercado Pago (extrato/movimentações), sincronizados via RPC atualizar_mercadopago_eventos chamada pelo script mercadopago_sync.py. Fonte relacional viva desde 08/08/2026 — substituiu wallace_dados.MERCADOPAGO_EVENTOS, que parou de ser atualizado a partir dessa data (não usar wallace_dados.MERCADOPAGO_EVENTOS como fonte). Consumida pela Inbox Financeira/Onda 6 para conciliação.';


--
-- Name: COLUMN mercadopago_eventos.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.id IS 'ID externo do evento no Mercado Pago (texto, não gerado pelo banco). Chave de deduplicação ao reimportar.';


--
-- Name: COLUMN mercadopago_eventos.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.tipo IS 'Tipo do evento conforme a API do Mercado Pago (ex.: "account_money"). Não confundir com status ou status_triagem.';


--
-- Name: COLUMN mercadopago_eventos.descricao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.descricao IS 'Descrição/contraparte do evento (ex.: nome do banco/instituição envolvida), pode vir vazia.';


--
-- Name: COLUMN mercadopago_eventos.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.valor IS 'Valor do evento em R$. Pode ser NULL (evento sem valor normalizado) — nesse caso a Inbox ignora o evento (nada a conciliar).';


--
-- Name: COLUMN mercadopago_eventos.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.status IS 'Status do evento no Mercado Pago (ex.: approved). NÃO confundir com status_triagem, que é a decisão interna do usuário sobre esse evento.';


--
-- Name: COLUMN mercadopago_eventos.status_triagem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.status_triagem IS 'Decisão interna de triagem do evento na Inbox Financeira: ''pendente'' (default, ainda não decidido), ou aprovado/rejeitado/arquivado_historico etc conforme a RPC restrita triar_mercadopago_evento (só permite alterar esta coluna, nenhuma outra). Evento com status_triagem != ''pendente'' não reaparece na Inbox em recargas futuras. Ausência do campo (dado antigo em cache do cliente) é tratada como ''pendente'' por segurança, pra não esconder nada.';


--
-- Name: COLUMN mercadopago_eventos.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.metadata IS 'JSON bruto com dados extras do evento vindos da API do Mercado Pago (ex.: payer, collector_id, payment_method). Estrutura não padronizada, varia por tipo de evento.';


--
-- Name: COLUMN mercadopago_eventos.criado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.criado_em IS 'Timestamp de quando a linha foi criada no Supabase (não confundir com a coluna data, que é a data do evento financeiro em si).';


--
-- Name: COLUMN mercadopago_eventos.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mercadopago_eventos.atualizado_em IS 'Última vez que esta linha foi atualizada pela RPC de sincronização (inclui mudanças de status_triagem).';


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
-- Name: TABLE metas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.metas IS 'Achado 20/08/2026: tabela órfã do painel privado (não lida/escrita por nenhum código de src/**, que calcula tudo em memória via VARS/REG e reg-patrimonio.js). Serve só de eco pra quem consulta rpc_dashboard_resumo() externamente (Claude Chat, API). Corrigida manualmente em 21/08/2026 (Meta do Milhão desatualizada em ~R$2.400 pela mesma causa do achado caixaLance/V1 daquele dia) — sem automação escrevendo aqui, então volta a ficar desatualizada com o tempo; atualizar manualmente se for consultada de novo.';


--
-- Name: COLUMN metas.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.metas.nome IS 'Nome livre da meta (ex.: "Fundo de Suavização Salarial (CC-304)", "Meta do Milhão"). Sem relação direta com nenhum campo VARS/REG do painel.';


--
-- Name: COLUMN metas.valor_alvo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.metas.valor_alvo IS 'Valor-alvo da meta em R$ (ex.: 1.000.000,00 para a Meta do Milhão). Não confundir com patrimônio líquido real calculado no painel (REG.balanco.patrimonioLiquido), que não lê este campo.';


--
-- Name: COLUMN metas.valor_atual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.metas.valor_atual IS 'Valor atual acumulado em R$, atualizado manualmente nesta tabela — não sincronizado automaticamente com o patrimônio líquido real calculado pelo motor do site.';


--
-- Name: COLUMN metas.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.metas.tipo IS 'Categoria livre da meta (ex.: "milhao", "outra") — usada só como rótulo, sem lógica de negócio associada a ela no código atual.';


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

COMMENT ON TABLE public.parametros_gerais IS 'Fonte VIVA (V2) de ~15 parâmetros/escalares gerais do sistema (data de nascimento, passivo do financiamento da casa, meses restantes, saldos de reserva/BTG/Necton, créditos externos, pró-labore fixo, etc.), lida no boot como window.WALLACE_PARAMETROS_GERAIS_V2 e sobrescrevendo os literais padrão de vars-*.js (VARS.<nome> = valor da tabela) quando o fetch funciona. Se o fetch falhar, o site cai de volta pro literal de código capturado em __literalAntesDoMerge (app.js) — nunca mistura wallace_dados (removido 12/08/2026).';


--
-- Name: COLUMN parametros_gerais.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_gerais.nome IS 'Nome do parâmetro = mesmo nome do campo VARS.<nome> em vars-*.js (ex.: "dataNascimentoWallace", "passivoFinanciamentoCasa", "mesesRestantesFinanciamentoCasa"). É a chave usada pra fazer o merge em VARS no boot.';


--
-- Name: COLUMN parametros_gerais.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_gerais.valor IS 'Valor do parâmetro em JSONB — tipo varia por parâmetro (string de data "1992-05-13", número em R$ como 61081.39, inteiro de meses como 146, etc.). Ler o tipo real caso a caso, não assumir número.';


--
-- Name: COLUMN parametros_gerais.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_gerais.atualizado_em IS 'Timestamp da última edição manual do parâmetro (não é recalculado automaticamente pelo motor — edição é sempre manual/pontual).';


--
-- Name: parametros_solares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_solares (
    chave text NOT NULL,
    valor numeric NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE parametros_solares; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.parametros_solares IS 'Fonte VIVA (V2) dos parâmetros da calculadora de Energia Solar (fatura Energisa, consumo mínimo pós-solar, taxa mínima), lida no boot como window.WALLACE_PARAMETROS_SOLARES_V2 e sobrescrevendo os literais padrão de src/solar/vars-energia-solar.js (VARS.<chave> = valor da tabela). Se o fetch falhar, cai pro literal de código (__literalAntesDoMerge em app.js) — domínio Solar migrado pra V2 em 08/08/2026, não usa wallace_dados.';


--
-- Name: COLUMN parametros_solares.chave; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_solares.chave IS 'Nome do parâmetro = mesmo nome do campo VARS.<chave> (ex.: "faturaEnergisaValor" em R$, "faturaEnergisaKwh" em kWh, "consumoMinimoComSolarKwh" em kWh, "taxaMinimaEnergisa" em R$). É a chave usada pra fazer o merge em VARS no boot.';


--
-- Name: COLUMN parametros_solares.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_solares.valor IS 'Valor numérico do parâmetro — unidade depende da chave (R$ para valores de fatura/taxa, kWh para consumo). Ver nome da chave pra saber a unidade.';


--
-- Name: COLUMN parametros_solares.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_solares.atualizado_em IS 'Timestamp da última edição manual do parâmetro (atualizado quando a fatura real da Energisa muda de valor, por exemplo).';


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
-- Name: TABLE parcelas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.parcelas IS 'Fonte viva (V2) das compras parceladas — substitui os arrays VARS.PARCELAMENTOS_VISA/PARCELAMENTOS_MP/PARCELAMENTOS_TERCEIROS (Onda 5, 08/08/2026). Cada linha é UMA parcela específica de uma compra parcelada (não a compra inteira). Alimenta os Livros Razão LRP (Visa) e LRMP (Mercado Pago) via VARS.PARCELAMENTOS_VISA/MP, recalculados 1:1 a partir de `origem_array`. Também alimenta VARS.livroLRP e VARS.totalOpProvMP (soma das parcelas com status=ativa), usados na cascata de reembolso Wärtsilä e na Necessidade Total/Líquida — NUNCA editar esses totais diretamente, eles são derivados desta tabela.';


--
-- Name: COLUMN parcelas.transacao_origem_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.transacao_origem_id IS 'FK (nullable) pra `transacoes.id` — a transação que originou o parcelamento, quando existente na V2 relacional. Null quando a origem só existe no legado (ver tx_legado) ou quando cartao_id também é null (parcelamentos de terceiros/MP sem transação V2 correspondente).';


--
-- Name: COLUMN parcelas.numero_parcela; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.numero_parcela IS 'Número da parcela atual dentro do parcelamento (ex: 4 de 6). Corresponde a "parcelaAtual" no array VARS mapeado.';


--
-- Name: COLUMN parcelas.total_parcelas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.total_parcelas IS 'Total de parcelas do parcelamento inteiro (ex: 6 em "4 de 6").';


--
-- Name: COLUMN parcelas.valor_parcela; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.valor_parcela IS 'Valor de UMA parcela (não o valor total da compra), em R$.';


--
-- Name: COLUMN parcelas.data_prevista; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.data_prevista IS 'Data prevista de cobrança desta parcela específica.';


--
-- Name: COLUMN parcelas.cartao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.cartao_id IS 'FK (nullable) pra tabela de cartões — em qual cartão esta parcela é cobrada. Null é comum em linhas de origem_array=PARCELAMENTOS_MP (Mercado Pago não é "cartão" no mesmo sentido) — não é erro de preenchimento.';


--
-- Name: COLUMN parcelas.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.status IS 'Estado da parcela em minúsculas: ''ativa'' (ainda sendo cobrada/soma nos totais) ou ''quitada'' (já paga, sai das somas). NÃO confundir com o valor equivalente em maiúsculas (''ATIVO''/''QUITADO'') usado no array VARS mapeado em memória (hydrate-onda5-parcelamentos.js normaliza um pro outro).';


--
-- Name: COLUMN parcelas.tx_legado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.tx_legado IS 'Código TX do sistema legado (TXPxxxxxx Visa, TXMPxxxxxx Mercado Pago) — usado só para conferência/auditoria de que V1 e V2 batem 1:1, não é FK.';


--
-- Name: COLUMN parcelas.origem_array; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parcelas.origem_array IS 'De qual array VARS legado esta parcela veio / pra qual Livro Razão ela alimenta: ''PARCELAMENTOS_VISA'' (LRP), ''PARCELAMENTOS_MP'' (LRMP) ou ''PARCELAMENTOS_TERCEIROS'' (parcelamentos de terceiros, fora do padrão Visa/MP). É o campo usado pelo código pra filtrar/rotear cada linha pro Livro Razão certo — não é metadado decorativo.';


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
-- Name: TABLE patrimonio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.patrimonio IS 'Itens de patrimônio (ativos como imóveis/veículo/investimentos e placas solares) usados no cálculo do Patrimônio Total. Fonte V2 EXCLUSIVA, alimenta a tela via view vw_patrimonio_v2 (ver hydrate-onda4-patrimonio.js). Cada linha é um item/snapshot, não uma série histórica por item - atualizar valor é UPDATE na linha existente, não INSERT de nova linha por período (ver data_snapshot).';


--
-- Name: COLUMN patrimonio.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patrimonio.tipo IS 'Categoria macro do item: imovel, investimento, veiculo, etc. Ver subtipo para o detalhe.';


--
-- Name: COLUMN patrimonio.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patrimonio.valor IS 'Valor do item, em R$, na data_snapshot.';


--
-- Name: COLUMN patrimonio.data_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patrimonio.data_snapshot IS 'Data de referência do valor informado (não é a data de aquisição do bem).';


--
-- Name: COLUMN patrimonio.natureza; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patrimonio.natureza IS 'Se o item é ativo (soma no patrimônio) ou outra natureza cadastrada. Default ''ativo''.';


--
-- Name: COLUMN patrimonio.rotulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patrimonio.rotulo IS 'Rótulo de exibição do item (ex: "Apartamento", "Jazigo", "Placas Solares").';


--
-- Name: COLUMN patrimonio.subtipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.patrimonio.subtipo IS 'Subcategoria do item (ex: apartamento, casa, jazigo, solar, carro) - usada pela view vw_patrimonio_v2 pra distribuir os valores em colunas próprias (casa/apartamento/jazigo/solar/carro).';


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

COMMENT ON TABLE public.pesagens IS 'Registro pessoal de peso (aba Emagrecimento). 1 linha por data de pesagem, inserida manualmente/via agente (RLS só leitura, sem formulário de insert no painel). Fonte viva, ativa desde 12/08/2026.';


--
-- Name: COLUMN pesagens.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pesagens.data IS 'Data da pesagem (não confundir com created_at, que é o timestamp de quando a linha foi gravada no banco).';


--
-- Name: COLUMN pesagens.peso_kg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pesagens.peso_kg IS 'Peso em quilogramas (kg). Vem como numeric/string da API — código do painel aplica Number() antes de usar.';


--
-- Name: pib_wallace_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pib_wallace_historico (
    mes text NOT NULL,
    snapshot jsonb NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pib_wallace_historico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pib_wallace_historico IS 'Histórico mensal (1 linha por competência ''YYYY-MM'' em mes) dos indicadores agregados de receita/despesa/poupança/patrimônio do painel ("PIB Wallace" e "Taxa de Poupança"). Escrita pela RPC registrar_pib_mensal(), chamada por src/financeiro/indicadores/recalcular-indicadores.js A CADA BOOT do painel para a competência ATUAL — não só no fechamento do ciclo — então a linha do mês corrente vai sendo sobrescrita/atualizada continuamente até o ciclo fechar (não é um snapshot único e definitivo até então). Fonte viva usada tanto pelo próprio painel (REG.pibWallace.patrimonioInicialCiclo/taxaCrescimentoPct comparam com o mês anterior) quanto pelo job Python scripts/sync/wwi_gerar_relatorio_mensal.py (cálculo do Wealth Score/relatório WWI, campos construcaoPatrimonial e independenciaFinanceira/disciplinaFinanceira).';


--
-- Name: COLUMN pib_wallace_historico.mes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pib_wallace_historico.mes IS 'Chave da competência/ciclo, formato ''YYYY-MM''. Chave única da tabela (1 linha por mês).';


--
-- Name: COLUMN pib_wallace_historico.snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pib_wallace_historico.snapshot IS 'JSONB com os indicadores calculados na última execução de registrar_pib_mensal() para esta competência: salarioLiquido, reembolsos, rendimentos, valorizacaoInvestimentos, consumoNaoRecorrente, total (R$, indicador legado "PIB Wallace" = salarioLiquido+reembolsos+rendimentos+valorizacaoInvestimentos-consumoNaoRecorrente), entradasTotais (R$), patrimonioLiquido (R$, patrimônio líquido no momento do cálculo — usado pelo mês seguinte como "patrimônio do fechamento do ciclo anterior", ver REG.pibWallace.patrimonioInicialCiclo), receitaTotalComp (R$), despesaTotalComp (R$), poupancaRS (R$, receitaTotalComp-despesaTotalComp — é o INDICADOR PRINCIPAL atual, substituiu o "total"/PIB Wallace legado como métrica principal exibida, mas ambos continuam sendo gravados), taxaPoupancaPct (%, poupancaRS/receitaTotalComp), registradoEm (timestamp ISO de quando este snapshot foi calculado, distinto de atualizado_em da linha).';


--
-- Name: COLUMN pib_wallace_historico.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pib_wallace_historico.atualizado_em IS 'Timestamp da última escrita desta linha pela RPC registrar_pib_mensal (não confundir com snapshot->>''registradoEm'', que é gerado no cliente/painel no momento do cálculo).';


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

COMMENT ON TABLE public.pluggy_conexoes IS 'Fonte viva V2 (relacional). Uma linha por conexão bancária (item) da Open Finance via Pluggy — substituiu wallace_dados.PLUGGY_CONTAS (merge removido 12/08/2026). Alimentada pelo script scripts/sync/sincronizar_pluggy.py e lida por app.js (getPluggyContasV2). Contém só metadados da conexão; contas ficam em pluggy_contas, transações em pluggy_transacoes.';


--
-- Name: COLUMN pluggy_conexoes.item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_conexoes.item_id IS 'ID da conexão (item) na Pluggy. Chave usada por pluggy_contas.conexao_id e pluggy_investimentos.conexao_id para relacionar (não há FK declarada).';


--
-- Name: COLUMN pluggy_conexoes.banco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_conexoes.banco IS 'ATENÇÃO: normalmente vem genérico "MeuPluggy" para praticamente todas as conexões (não distingue o banco real) — não usar este campo para identificar qual banco é. Ver comentário em app.js linha ~690: o banco real precisa ser inferido por outro caminho (ex: pluggy_contas.nome).';


--
-- Name: COLUMN pluggy_conexoes.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_conexoes.status IS 'Status do item na Pluggy (ex: UPDATED, UNSTABLE, LOGIN_ERROR). Reflete o resultado da última sincronização daquela conexão, não o status de uma conta ou transação específica.';


--
-- Name: COLUMN pluggy_conexoes.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_conexoes.atualizado_em IS 'Timestamp da última atualização reportada pela própria Pluggy para este item (não é a hora do nosso sync local).';


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

COMMENT ON TABLE public.pluggy_contas IS 'Fonte viva V2 (relacional). Uma linha por conta/cartão dentro de uma conexão Pluggy (pluggy_conexoes). Inclui contas bancárias (tipo BANK) e cartões de crédito (tipo CREDIT). Substituiu wallace_dados.PLUGGY_CONTAS.contas (migração Onda 7, 08/08/2026). Sincronizada por scripts/sync/sincronizar_pluggy.py via RPC atualizar_pluggy_contas, que faz substituição total (não incremental) a cada sync.';


--
-- Name: COLUMN pluggy_contas.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.id IS 'ID da conta na Pluggy. Referenciado por pluggy_transacoes.conta_id e pluggy_saldos_reservados.conta_id (não há FK declarada).';


--
-- Name: COLUMN pluggy_contas.conexao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.conexao_id IS 'Referencia pluggy_conexoes.item_id (não há FK declarada).';


--
-- Name: COLUMN pluggy_contas.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.nome IS 'Nome da instituição/conta trazido pela Pluggy (ex: "Mercado Pago", "AZUL ITAU VISA INFINITE"). Como pluggy_conexoes.banco costuma vir genérico "MeuPluggy", este campo é o único jeito confiável de identificar qual banco/cartão é uma conta.';


--
-- Name: COLUMN pluggy_contas.saldo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.saldo IS 'Para tipo=BANK: saldo em conta, em R$. Para tipo=CREDIT: valor já utilizado do limite do cartão, em R$ (NÃO é saldo em conta corrente).';


--
-- Name: COLUMN pluggy_contas.limite_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.limite_total IS 'Cartão de crédito (tipo=CREDIT): limite total do cartão, em R$. NULL para contas BANK.';


--
-- Name: COLUMN pluggy_contas.limite_disponivel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.limite_disponivel IS 'Cartão de crédito (tipo=CREDIT): limite ainda disponível (não utilizado), em R$. NULL para contas BANK.';


--
-- Name: COLUMN pluggy_contas.fatura_vencimento_atual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.fatura_vencimento_atual IS 'Cartão de crédito: data de vencimento da fatura atual em aberto.';


--
-- Name: COLUMN pluggy_contas.fatura_valor_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.fatura_valor_total IS 'Cartão de crédito: valor total da fatura atual em aberto, em R$.';


--
-- Name: COLUMN pluggy_contas.fatura_pagamento_minimo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.fatura_pagamento_minimo IS 'Cartão de crédito: valor mínimo para pagamento da fatura atual, em R$.';


--
-- Name: COLUMN pluggy_contas.qtd_transacoes_sincronizadas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_contas.qtd_transacoes_sincronizadas IS 'Contador cumulativo de quantas transações já foram trazidas da Pluggy para esta conta, mantido pelo script de sync — não é saldo nem é o total de transações do período atual.';


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
-- Name: TABLE pluggy_investimentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pluggy_investimentos IS 'Fonte viva V2 (relacional), criada 13/08/2026. Uma linha por posição de investimento trazida pelo endpoint /investments da Pluggy (antes esse dado era buscado e descartado, não persistido). Usada hoje sobretudo para o saldo real da Reserva de Emergência (app.js getReservaEmergenciaPluggy, filtra nome ilike ITAU + tipo=FIXED_INCOME) — NÃO substitui patrimonio.reserva (o valor âncora manual de R$100.000,00 travado em vars-patrimonio.js), é só um informativo adicional lido junto.';


--
-- Name: COLUMN pluggy_investimentos.conexao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_investimentos.conexao_id IS 'Referencia pluggy_conexoes.item_id (não há FK declarada). Como pluggy_conexoes.banco vem genérico "MeuPluggy" para todas as conexões, é preciso usar este id junto com pluggy_investimentos.nome para isolar a posição certa (ex: distinguir CDB Itaú de ações na Necton).';


--
-- Name: COLUMN pluggy_investimentos.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_investimentos.tipo IS 'Tipo do investimento conforme Pluggy: FIXED_INCOME (renda fixa, ex: CDB/Tesouro), EQUITY (ações/ETF na bolsa), etc.';


--
-- Name: COLUMN pluggy_investimentos.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_investimentos.nome IS 'Nome/ticker do ativo (ex: "LFTS11", "CMIG3") ou nome do produto de renda fixa. Vários registros podem ter valor=0 (posição zerada ou ativo listado sem saldo).';


--
-- Name: COLUMN pluggy_investimentos.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_investimentos.valor IS 'Valor atual da posição, em R$.';


--
-- Name: COLUMN pluggy_investimentos.instituicao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_investimentos.instituicao IS 'Quase sempre NULL na prática (Pluggy não preenche de forma confiável) — não usar como filtro; o código filtra por nome/tipo em vez disso.';


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
-- Name: TABLE pluggy_saldos_reservados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pluggy_saldos_reservados IS 'Tabela V2 criada para guardar valores reservados/separados dentro de uma conta bancária (bankData.reservedBalances da Pluggy, ex: dinheiro "guardado" dentro da conta corrente). HOJE SEMPRE VAZIA (0 linhas) — investigação em andamento (13/08/2026, ver scripts/sync/sincronizar_pluggy.py função buscar_conta_detalhe): hipótese é que reservedBalances só vem no detalhe de UMA conta (GET /accounts/{id}), não na listagem usada normalmente. Não assumir que "conta sem reserva" = "usuário não tem dinheiro reservado"; pode ser lacuna de coleta, não fato financeiro.';


--
-- Name: COLUMN pluggy_saldos_reservados.conta_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_saldos_reservados.conta_id IS 'Referencia pluggy_contas.id (não há FK declarada).';


--
-- Name: COLUMN pluggy_saldos_reservados.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_saldos_reservados.valor IS 'Valor reservado dentro da conta, em R$ — não é o saldo total da conta (esse é pluggy_contas.saldo).';


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

COMMENT ON TABLE public.pluggy_transacoes IS 'Fonte viva V2 (relacional). Uma linha por transação bancária/cartão trazida da Pluggy, ligada a pluggy_contas. Substituiu wallace_dados.PLUGGY_CONTAS.contas[].transacoes_recentes (migração Onda 7, 08/08/2026). Alimenta a Inbox Financeira (reconciliarPluggy/reconciliarTransacoesPluggy em app.js) — decisão de aprovar/rejeitar cada transação da Inbox fica em pluggy_triagem, não aqui. RPC de sync faz upsert (não substituição total como em pluggy_contas), por isso existem campos de rastreio de mudança de status abaixo.';


--
-- Name: COLUMN pluggy_transacoes.conta_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.conta_id IS 'Referencia pluggy_contas.id (não há FK declarada).';


--
-- Name: COLUMN pluggy_transacoes.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.data IS 'Data/hora real da transação, conforme reportada pelo banco via Pluggy. Esta é a data a usar para reconciliação por período, não criado_em.';


--
-- Name: COLUMN pluggy_transacoes.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.valor IS 'Valor da transação em R$. Sinal indica direção: positivo = entrada/crédito, negativo = saída/débito (ver exemplos: TED recebida = positivo, Pix enviado = negativo).';


--
-- Name: COLUMN pluggy_transacoes.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.status IS 'Status da transação conforme Pluggy: PENDING (ainda não compensada/pode mudar) ou POSTED (já lançada/definitiva). Transação PENDING pode desaparecer ou mudar de valor em sync futuro — não tratar como definitiva para reconciliação.';


--
-- Name: COLUMN pluggy_transacoes.criado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.criado_em IS 'Timestamp em que ESTA LINHA foi inserida no nosso banco (primeira vez que o sync trouxe esta transação). Não confundir com pluggy_transacoes.data, que é a data real do lançamento bancário.';


--
-- Name: COLUMN pluggy_transacoes.primeiro_visto_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.primeiro_visto_em IS 'Timestamp da primeira vez que o sync viu esta transação (em geral igual a criado_em). Usado para diferenciar "transação nova" de "transação já conhecida que só teve status atualizado".';


--
-- Name: COLUMN pluggy_transacoes.status_anterior; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.status_anterior IS 'Valor de status antes da última mudança (ex: PENDING antes de virar POSTED). NULL se o status nunca mudou desde que a transação foi vista pela primeira vez.';


--
-- Name: COLUMN pluggy_transacoes.status_mudou_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.status_mudou_em IS 'Timestamp da última vez que status_anterior -> status mudou. NULL se nunca mudou.';


--
-- Name: COLUMN pluggy_transacoes.qtd_sincronizacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.qtd_sincronizacoes IS 'Contador cumulativo de quantas vezes o sync trouxe/revisitou esta transação (incrementado a cada rodada, mesmo sem mudança de dado).';


--
-- Name: COLUMN pluggy_transacoes.ultima_sincronizacao_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_transacoes.ultima_sincronizacao_em IS 'Timestamp da última vez que o sync rodou e considerou esta transação, independente de ter havido mudança.';


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
-- Name: TABLE pluggy_triagem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pluggy_triagem IS 'Fonte viva V2 (relacional). Guarda a decisão humana (aprovado/rejeitado) sobre itens da Inbox Financeira de origem Pluggy, para não reaparecerem depois de decididos. Substituiu wallace_dados.PLUGGY_TRIAGEM (migrado 10/08/2026, RPC triar_pluggy_item). Regra do sistema: a Inbox NUNCA lança automaticamente em transacoes a partir daqui — só aprova/rejeita a triagem em si (ver feedback_inbox_nunca_lancar_automatico). Maioria das linhas hoje é "rejeitado" (item descartado da Inbox, não vira lançamento).';


--
-- Name: COLUMN pluggy_triagem.id_externo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_triagem.id_externo IS 'Identificador do item triado da Inbox — NÃO é sempre um id de pluggy_transacoes: pode ser "pluggy-tx-<id da transação>" (transação normal) ou outros prefixos como "pluggy-desatualizada-<id>" (ex: conexão/item desatualizado sinalizado na Inbox). Conferir o prefixo antes de tentar fazer join direto com pluggy_transacoes.id.';


--
-- Name: COLUMN pluggy_triagem.status_triagem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_triagem.status_triagem IS 'Decisão registrada: "aprovado" ou "rejeitado". Default é "pendente" mas não há linha pendente persistida aqui — pendência real fica só na Inbox em memória (itens ainda sem decisão simplesmente não têm linha nesta tabela).';


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
-- Name: TABLE pluggy_webhook_eventos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pluggy_webhook_eventos IS 'Log histórico bruto (não é fonte de leitura pelo painel/site) dos eventos recebidos da Pluggy via webhook (Edge Function pluggy-webhook, registrado por scripts/sync/sincronizar_pluggy.py::garantir_webhook_registrado, evento "all"). Serve principalmente para descobrir item_id de conexões feitas fora do app (ex: direto no portal meu.pluggy.ai), já que a API Pluggy não tem endpoint para listar todos os items. Não confundir com pluggy_conexoes/pluggy_contas/pluggy_transacoes, que são o estado atual consolidado — esta tabela é só o histórico de eventos crus recebidos.';


--
-- Name: COLUMN pluggy_webhook_eventos.event; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_webhook_eventos.event IS 'Tipo do evento Pluggy, ex: connector/status_updated, item/updated, item/deleted, item/created, item/waiting_user_input.';


--
-- Name: COLUMN pluggy_webhook_eventos.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_webhook_eventos.event_id IS 'ID único do evento gerado pela Pluggy (eventId no payload).';


--
-- Name: COLUMN pluggy_webhook_eventos.item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_webhook_eventos.item_id IS 'ID do item (conexão) relacionado ao evento, quando aplicável — pode ser NULL para eventos que não são de item (ex: connector/status_updated, que é por conector, não por conexão do usuário).';


--
-- Name: COLUMN pluggy_webhook_eventos.payload; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_webhook_eventos.payload IS 'Corpo JSON completo recebido no webhook, como veio da Pluggy — fonte de verdade caso os campos extraídos acima não bastem.';


--
-- Name: COLUMN pluggy_webhook_eventos.recebido_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pluggy_webhook_eventos.recebido_em IS 'Timestamp em que nossa Edge Function recebeu o evento (não é necessariamente igual ao horário em que o evento ocorreu na Pluggy).';


--
-- Name: pressao_arterial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pressao_arterial (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data date NOT NULL,
    sistolica integer NOT NULL,
    diastolica integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE pressao_arterial; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pressao_arterial IS 'Registro pessoal de pressão arterial (aba Emagrecimento). 1 linha por medição, inserida manualmente/via agente (RLS só leitura, sem formulário de insert no painel). Fonte viva desde 16/08/2026.';


--
-- Name: COLUMN pressao_arterial.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pressao_arterial.data IS 'Data real da medição (não a data de registro — essa é created_at).';


--
-- Name: COLUMN pressao_arterial.sistolica; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pressao_arterial.sistolica IS 'Pressão sistólica em mmHg (número "de cima").';


--
-- Name: COLUMN pressao_arterial.diastolica; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pressao_arterial.diastolica IS 'Pressão diastólica em mmHg (número "de baixo"). Classificação clínica exibida no painel usa referência padrão American Heart Association — é rótulo informativo, NÃO substitui avaliação médica.';


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
-- Name: TABLE reembolso_wartsila_ciclo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reembolso_wartsila_ciclo IS 'Fonte V2 viva e ATIVA do ciclo mais recente de reembolso da Wärtsilä (empregador do usuário), consumida direto pelo app (WallaceFinanceService.getReembolsoWartsilaCicloV2, GET .../reembolso_wartsila_ciclo?order=ciclo_referencia.desc&limit=1 - ver app.js). Quebra o valor total do ciclo pelas "pernas" da cascata de reembolso (política: Fatura Wärtsilä -> MP Corporativo -> Cartão Corporativo Pessoal -> MP Pessoal -> sobra vai pra Caixa Lance). NÃO confundir com a tabela `reembolsos` (genérica, morta/órfã, não usada por nenhum cálculo - ver comentário na tabela reembolsos).';


--
-- Name: COLUMN reembolso_wartsila_ciclo.ciclo_referencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_ciclo.ciclo_referencia IS 'Identificador do ciclo no formato YYYY-MM (ex: "2026-07"). A linha mais recente (maior ciclo_referencia) é a única lida pelo app.';


--
-- Name: COLUMN reembolso_wartsila_ciclo.valor_total_bruto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_ciclo.valor_total_bruto IS 'Valor total bruto a ser reembolsado pela Wärtsilä neste ciclo, em R$ (soma de todas as pernas).';


--
-- Name: COLUMN reembolso_wartsila_ciclo.valor_a_receber; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_ciclo.valor_a_receber IS 'Saldo AINDA pendente de recebimento deste ciclo, em R$. 0.00 = ciclo já totalmente recebido (ver reembolso_wartsila_recebimentos pelo histórico de recebimentos que zeraram esse saldo). NÃO é o valor total do ciclo - é só o que falta.';


--
-- Name: COLUMN reembolso_wartsila_ciclo.perna_fatura_wartsila; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_ciclo.perna_fatura_wartsila IS 'Perna 1 da cascata: valor da fatura direta com a Wärtsilä (cartão corporativo Wärtsilä), em R$.';


--
-- Name: COLUMN reembolso_wartsila_ciclo.perna_mp_corporativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_ciclo.perna_mp_corporativo IS 'Perna 2 da cascata: valor que passou pelo Mercado Pago corporativo, em R$.';


--
-- Name: COLUMN reembolso_wartsila_ciclo.perna_cartao_corporativo_pessoal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_ciclo.perna_cartao_corporativo_pessoal IS 'Perna 3 da cascata: valor que passou pelo cartão corporativo mas foi gasto pessoal (a reembolsar ao usuário), em R$.';


--
-- Name: COLUMN reembolso_wartsila_ciclo.perna_mp_pessoal_provisionado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_ciclo.perna_mp_pessoal_provisionado IS 'Perna 4 da cascata: valor provisionado no Mercado Pago pessoal, em R$. Pode ser NULL quando não há provisionamento nesse ciclo.';


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
-- Name: TABLE reembolso_wartsila_recebimentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reembolso_wartsila_recebimentos IS 'Log/histórico dos recebimentos reais (TED, transferência) que abateram o valor_a_receber de um ciclo em reembolso_wartsila_ciclo (FK ciclo_id). Ao contrário de reembolso_wartsila_ciclo, NÃO é lida diretamente por nenhum código em src/** (grep confirmou zero ocorrências) - parece ser um ledger de apoio/auditoria mantido manualmente, não uma fonte que alimenta a tela hoje. Confirmar antes de assumir que está sincronizada com valor_a_receber.';


--
-- Name: COLUMN reembolso_wartsila_recebimentos.ciclo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_recebimentos.ciclo_id IS 'FK para reembolso_wartsila_ciclo.id: a qual ciclo este recebimento pertence.';


--
-- Name: COLUMN reembolso_wartsila_recebimentos.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_recebimentos.data IS 'Data em que o recebimento aconteceu.';


--
-- Name: COLUMN reembolso_wartsila_recebimentos.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_recebimentos.valor IS 'Valor recebido nesta parcela do reembolso, em R$.';


--
-- Name: COLUMN reembolso_wartsila_recebimentos.descricao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_recebimentos.descricao IS 'Texto livre descrevendo a origem do recebimento (ex: referência a um TX ou "TED recebido - reembolso Wärtsilä ciclo 2026-07").';


--
-- Name: COLUMN reembolso_wartsila_recebimentos.transacao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolso_wartsila_recebimentos.transacao_id IS 'Referência (não FK formal) à transação em `transacoes` correspondente a este recebimento, quando existe.';


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
-- Name: TABLE reembolsos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reembolsos IS 'Tabela órfã (achado 20/08/2026, ver comentário em app.js ~linha 2570) — nenhum cálculo do painel lê esta tabela, só existia pra alimentar RPC de consulta externa. A única linha (Wärtsilä) estava congelada desde 05/08/2026 mostrando R$7.022,76 pendente, mesmo já totalmente recebido (ver reembolso_wartsila_ciclo, fonte real e viva). Corrigida em 21/08/2026 pra refletir a realidade (valor_recebido=7022.76, status=quitado) — mas continua sem nenhuma automação escrevendo aqui; se um novo reembolso Wärtsilä começar, esta linha vai ficar desatualizada de novo a menos que alguém a atualize manualmente.';


--
-- Name: COLUMN reembolsos.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolsos.origem IS 'Texto livre identificando a origem do reembolso (ex: "wartsila"). Não é enum controlado.';


--
-- Name: COLUMN reembolsos.valor_a_receber; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolsos.valor_a_receber IS 'DESATUALIZADO/NÃO CONFIÁVEL (ver comentário da tabela) - valor congelado desde 05/08/2026, não reflete recebimentos reais posteriores.';


--
-- Name: COLUMN reembolsos.valor_recebido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolsos.valor_recebido IS 'DESATUALIZADO/NÃO CONFIÁVEL (ver comentário da tabela) - nunca atualizado após a calibração inicial.';


--
-- Name: COLUMN reembolsos.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolsos.status IS 'Status textual (ex: "pendente") - não reflete o estado real, tabela não é mais mantida.';


--
-- Name: COLUMN reembolsos.transacao_origem_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reembolsos.transacao_origem_id IS 'Referência (não FK formal) à transação de origem, quando preenchida.';


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
-- Name: TABLE regras_classificacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.regras_classificacao IS 'Fonte VIVA (V2) das regras de classificação automática de transações da Inbox Financeira (Pluggy) — lida via REST em app.js (classificarViaV2) e pluggy-reconciliacao.js, best-effort, só PREENCHE sugestão de categoria quando o classificador determinístico V1 (classificarItemDeterministico) não achou nada; nunca lança transação sozinha (ver regra "Inbox nunca lança automático" na memória do usuário). Avaliada em ordem de prioridade (menor = mais prioritário), primeira regra ativa cujo estabelecimento_contem/descricao_regex bate com a descrição vence.';


--
-- Name: COLUMN regras_classificacao.prioridade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.prioridade IS 'Ordem de avaliação da regra — menor número = avaliada primeiro. Default 100.';


--
-- Name: COLUMN regras_classificacao.estabelecimento_contem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.estabelecimento_contem IS 'Substring (case-insensitive, comparada em UPPERCASE no código) que precisa estar contida na descrição/estabelecimento bruto da transação pra regra bater.';


--
-- Name: COLUMN regras_classificacao.descricao_regex; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.descricao_regex IS 'Regex alternativa aplicada sobre a descrição bruta da transação (usada por regras que não dependem de nome de estabelecimento, ex.: "dinheiro (retirado|reservado)").';


--
-- Name: COLUMN regras_classificacao.categoria_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.categoria_id IS 'Categoria sugerida quando a regra bate e resultado=''classificar''. NULL quando resultado=''ignorar'' (regra é só de exclusão, não sugere categoria).';


--
-- Name: COLUMN regras_classificacao.subcategoria_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.subcategoria_id IS 'Subcategoria sugerida (opcional), mesmo esquema de categoria_id.';


--
-- Name: COLUMN regras_classificacao.caixa_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.caixa_id IS 'Caixa sugerida diretamente pela regra (raro — na maioria dos casos a caixa vem de regras_resolver_caixa via RPC resolver_caixa a partir da categoria, não fixada aqui).';


--
-- Name: COLUMN regras_classificacao.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.ativo IS 'Se false, a regra é ignorada na avaliação (mesmo padrão de soft-disable usado em outras tabelas de regra do sistema).';


--
-- Name: COLUMN regras_classificacao.resultado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_classificacao.resultado IS 'NÃO É genérico: só dois valores usados no código — ''classificar'' (sugere categoria_id/subcategoria_id/caixa_id) ou ''ignorar'' (regra de exclusão/ruído, ex.: transferência entre contas próprias, aplicação em cofrinhos — não deve virar transação classificada). Regras com resultado=''ignorar'' correspondem ao antigo PADROES_RUIDO_TRANSACAO do V1.';


--
-- Name: regras_lancamento_estabelecimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regras_lancamento_estabelecimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    estabelecimento_padrao text NOT NULL,
    estabelecimento_contem text NOT NULL,
    usuario_id uuid,
    cartao_id uuid,
    caixa_id uuid,
    confianca_pct numeric NOT NULL,
    ocorrencias integer NOT NULL,
    ultima_ocorrencia_em date,
    observacao text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE regras_lancamento_estabelecimento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.regras_lancamento_estabelecimento IS 'Referência de cartão/caixa padrão por estabelecimento, derivada do histórico real de transacoes (não é regra de negócio fixa, é estatística — confianca_pct/ocorrencias mostram a força do padrão). Uso: Claude Chat consulta ANTES de perguntar ao usuário qual cartão/caixa usar numa compra nova, quando o usuário não especificou. NUNCA usar como fonte de verdade pra lançar sem confirmação — é só um atalho pra reduzir perguntas óbvias, a confirmação do lançamento em si continua obrigatória (MANUAL_OPERACIONAL_AGENTES.md seção 2). Repopular manualmente conforme o histórico crescer — sem automação de atualização ainda.';


--
-- Name: COLUMN regras_lancamento_estabelecimento.estabelecimento_contem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_lancamento_estabelecimento.estabelecimento_contem IS 'Padrão pra usar em ILIKE (%padrao%) contra transacoes.descricao.';


--
-- Name: COLUMN regras_lancamento_estabelecimento.confianca_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_lancamento_estabelecimento.confianca_pct IS 'Percentual de dominância desse cartao_id/caixa_id no histórico desse estabelecimento+usuario. Abaixo de ~70%% não é confiável como default silencioso — perguntar mesmo assim.';


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
-- Name: TABLE regras_resolver_caixa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.regras_resolver_caixa IS 'Fonte VIVA (V2) das regras que a RPC resolver_caixa(p_categoria_id, p_usuario_id, p_origem) usa pra sugerir automaticamente em qual caixa (caixas.id) uma transação nova deve cair, a partir da categoria/usuário/origem informados. Chamada tanto no form manual de lançamento (app.js, botão "sugerir caixa") quanto no fluxo automático da Inbox (pluggy-reconciliacao.js, encadeada depois de regras_classificacao). Apenas SUGERE — nunca lança/move transação sozinha.';


--
-- Name: COLUMN regras_resolver_caixa.categoria_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_resolver_caixa.categoria_id IS 'Categoria que, combinada com usuario_id/origem/estabelecimento_contem, determina a caixa sugerida. Pode ser NULL para regra mais genérica.';


--
-- Name: COLUMN regras_resolver_caixa.usuario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_resolver_caixa.usuario_id IS 'Filtra a regra por usuário responsável pela transação (NULL = regra vale pra qualquer usuário).';


--
-- Name: COLUMN regras_resolver_caixa.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_resolver_caixa.origem IS 'Filtra a regra pela origem da transação (ex.: "mercado_pago", "manual", "pluggy-warmup"). NULL = regra vale pra qualquer origem.';


--
-- Name: COLUMN regras_resolver_caixa.caixa_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_resolver_caixa.caixa_id IS 'Caixa (public.caixas.id) sugerida quando a regra bate — é o resultado final que a RPC resolver_caixa devolve.';


--
-- Name: COLUMN regras_resolver_caixa.prioridade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_resolver_caixa.prioridade IS 'Ordem de avaliação — menor número = avaliada primeiro (default 100), mesmo padrão de regras_classificacao.';


--
-- Name: COLUMN regras_resolver_caixa.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_resolver_caixa.ativo IS 'Se false, a regra é ignorada na resolução.';


--
-- Name: COLUMN regras_resolver_caixa.estabelecimento_contem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.regras_resolver_caixa.estabelecimento_contem IS 'Substring opcional do estabelecimento/descrição, usada como critério extra de match além de categoria/usuário/origem.';


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
-- Name: TABLE solar_compartilhamentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.solar_compartilhamentos IS 'Tokens de compartilhamento público temporário da página solar-compartilhado.html (link que alguém de fora pode abrir sem login pra ver dados solares). RLS está HABILITADO mas SEM NENHUMA POLICY — isso significa acesso direto à tabela é NEGADO por padrão pra todo mundo, inclusive o dono; leitura/escrita provavelmente só funciona via RPC SECURITY DEFINER (não encontrada referência de SELECT direto no código-fonte de src/**). Ver docs/decisions/HARDENING_SEGURANCA_PRODUCAO.md item 3 e memória "Bug ativo: compartilhado travado".';


--
-- Name: COLUMN solar_compartilhamentos.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.solar_compartilhamentos.token IS 'Token opaco usado na URL pública de compartilhamento.';


--
-- Name: COLUMN solar_compartilhamentos.criado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.solar_compartilhamentos.criado_em IS 'Momento de criação do link.';


--
-- Name: COLUMN solar_compartilhamentos.expira_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.solar_compartilhamentos.expira_em IS 'Momento de expiração do link — nas linhas observadas, expira 24h após criado_em.';


--
-- Name: COLUMN solar_compartilhamentos.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.solar_compartilhamentos.ativo IS 'Se o link ainda está ativo/utilizável (independente de já ter expirado por data).';


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
-- Name: TABLE subcategorias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subcategorias IS 'Cadastro V2 de subcategorias (nível granular dentro de uma categoria, ex: Mercado/Restaurante/Lanche dentro de "Alimentação"). Referenciada por transacoes.subcategoria_id. Não confundir com categorias — esta é o nível de detalhe abaixo daquela.';


--
-- Name: COLUMN subcategorias.categoria_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subcategorias.categoria_id IS 'FK para categorias.id — categoria macro à qual esta subcategoria pertence.';


--
-- Name: COLUMN subcategorias.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subcategorias.nome IS 'Nome de exibição da subcategoria (texto livre, ex: "Mercado", "Restaurante").';


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
    CONSTRAINT chk_cartao_nao_afeta_saldo_real CHECK (((cartao_id IS NULL) OR (afeta_saldo_real = false))),
    CONSTRAINT transacoes_origem_check CHECK ((origem = ANY (ARRAY['pluggy'::text, 'manual'::text, 'mercado_pago'::text, 'reconciliacao'::text]))),
    CONSTRAINT transacoes_status_check CHECK ((status = ANY (ARRAY['confirmado'::text, 'pendente_classificacao'::text, 'estornado'::text]))),
    CONSTRAINT transacoes_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'saida'::text])))
);


--
-- Name: TABLE transacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transacoes IS 'Tabela central V2 (relacional) de lançamentos financeiros — entradas e saídas. É a fonte real usada por vw_saldo_v2_por_caixa (saldo de cada caixa = caixas.saldo_inicial_ciclo + soma de transacoes do ciclo) e por várias views/queries de comprometido, LR (Livro Razão) e reconciliação. Volume real hoje: maioria origem=reconciliacao (~344), depois manual (~52) e pluggy (~43); status majoritariamente confirmado, com poucos pendente_classificacao/estornado.';


--
-- Name: COLUMN transacoes.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.data IS 'Data (YYYY-MM-DD) do lançamento — é o campo usado nos filtros de ciclo (data >= caixas.ciclo_inicio_em) que decidem se a transação entra no saldo/comprometido do ciclo atual. Nullable — transação sem data fica de fora de filtros por ciclo (ver comentário da view vw_saldo_v2_por_caixa: ciclo_inicio_em IS NULL OR data >= ciclo_inicio_em OR data IS NULL).';


--
-- Name: COLUMN transacoes.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.valor IS 'Valor (R$) do lançamento, sempre positivo — o sinal de entrada/saída vem da coluna tipo, não do valor.';


--
-- Name: COLUMN transacoes.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.tipo IS 'entrada ou saida. Determina se valor soma ou subtrai do saldo da caixa.';


--
-- Name: COLUMN transacoes.cartao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.cartao_id IS 'FK para cartoes.id, preenchida só quando o lançamento é uma compra de CARTÃO DE CRÉDITO (não débito/pix direto da caixa). Combinado com afeta_saldo_real=false é o padrão usado para identificar "comprometido" — compra já feita no cartão mas cuja fatura ainda não foi paga da caixa.';


--
-- Name: COLUMN transacoes.caixa_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.caixa_id IS 'FK obrigatória para caixas.id — de qual caixa este lançamento sai/entra. Compra de cartão sem caixa temática própria (ex: H57Store, Uber) cai na Caixa Variável por padrão.';


--
-- Name: COLUMN transacoes.categoria_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.categoria_id IS 'FK para categorias.id (nullable). Nem toda transação está categorizada — ver status=pendente_classificacao e o KPI de cobertura de categorização.';


--
-- Name: COLUMN transacoes.subcategoria_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.subcategoria_id IS 'FK para subcategorias.id (nullable), detalhamento opcional dentro da categoria.';


--
-- Name: COLUMN transacoes.usuario_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.usuario_id IS 'UUID de quem fez/é dono do lançamento (Wallace/Vanessa/Júlio/Gabriela). Pode ser NULL em lançamentos automáticos da Pluggy sem titular identificado.';


--
-- Name: COLUMN transacoes.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.origem IS 'Como o lançamento entrou no sistema: "manual" (digitado no painel), "pluggy" (importado automaticamente via Open Finance), "reconciliacao" (conciliado/ajustado a partir de um processo de reconciliação, é a origem mais numerosa hoje). NÃO usar como sinônimo de confiabilidade — todas podem estar status=confirmado.';


--
-- Name: COLUMN transacoes.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.status IS 'Estado do lançamento: "confirmado" (vale pra saldo/relatórios, maioria dos registros), "pendente_classificacao" (existe mas ainda falta categorizar/revisar, ex: item cru da Inbox), "estornado" (cancelado/revertido — não deve contar em somas de saldo). A view vw_saldo_v2_por_caixa e praticamente todo query do frontend filtram status=eq.confirmado explicitamente.';


--
-- Name: COLUMN transacoes.pluggy_tx_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.pluggy_tx_id IS 'ID original da transação na Pluggy (Open Finance), quando origem=pluggy. Usado para dedup/reconciliação — não confiar em dedup só por valor exato (já causou duplicata real, ver histórico de reconciliação MB).';


--
-- Name: COLUMN transacoes.tx_legado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.tx_legado IS 'Código sequencial legado (TXNNNNNN) mantido por compatibilidade/rastreabilidade com o histórico "V1" em texto (VARS/REG), usado como referência humana em vários LRs e logs. NÃO é chave técnica (a chave real é id uuid) — só um rótulo estável pra localizar o mesmo lançamento entre sistema novo e anotações antigas.';


--
-- Name: COLUMN transacoes.afeta_saldo_real; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.afeta_saldo_real IS 'Booleano (nullable, tratado como coalesce(afeta_saldo_real,true) nas views) que distingue: true/NULL = a transação JÁ afetou o saldo real da caixa (dinheiro já saiu/entrou de fato). false = compra feita no CARTÃO (não na caixa diretamente) que ainda vai gerar débito futuro na fatura — usada para calcular "comprometido" (gasto já feito, ainda não pago da caixa), tipicamente junto com cartao_id preenchido. NÃO confundir com status=estornado (que é cancelamento, não timing de pagamento).';


--
-- Name: COLUMN transacoes.ja_orcado_assinaturas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transacoes.ja_orcado_assinaturas IS 'Booleano — true quando este lançamento de cartão já é contado no orçamento separado de Assinaturas (cronograma_assinaturas/cronograma_recorrencias). Usado para EXCLUIR a transação do cálculo de "comprometido" da Caixa Variável e evitar contar o mesmo gasto 2 vezes (Assinaturas + Comprometido). Regra relacionada: assinaturas/recorrências nunca devem virar um INSERT avulso nesta tabela sem checar esses cronogramas antes.';


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
-- Name: TABLE usuarios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.usuarios IS 'Cadastro fixo dos membros da família/domicílio (Wallace, Vanessa como titulares; Júlio como dependente). Tabela pequena e estável, referenciada como FK usuario_id em outras tabelas (ex. cartoes, transacoes) para atribuir a quem pertence um cartão/lançamento. Não é autenticação de sistema (login é separado) — é só o registro de "pessoa da família" para fins de atribuição financeira.';


--
-- Name: COLUMN usuarios.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usuarios.nome IS 'Nome da pessoa (Wallace, Vanessa, Júlio).';


--
-- Name: COLUMN usuarios.papel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.usuarios.papel IS 'Papel no domicílio: ''titular'' ou ''dependente''.';


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
-- Name: TABLE v1_v2_caixa_mapa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.v1_v2_caixa_mapa IS 'Tabela de METADADOS da migração V1 (VARS/vars-caixas.js) -> V2 relacional (transacoes/caixas), não é dado financeiro em si. Documenta, por caixa, se a migração daquela caixa é confiável (confiavel=true/false) e as chaves originais em VARS que ela substitui. Consumida por funções SQL de migração (ex. hidratação de transações) para EXCLUIR automaticamente caixas cujo mapeamento não é confiável (ver seção do MANUAL_OPERACIONAL_AGENTES.md sobre hidratação). confiavel=false não significa "caixa errada" — pode só significar "sem histórico transacional ainda" (caso Conta Suavização).';


--
-- Name: COLUMN v1_v2_caixa_mapa.caixa_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.v1_v2_caixa_mapa.caixa_nome IS 'Nome de exibição da caixa (ex.: "Caixa Lance", "Conta Suavização (CC-304)").';


--
-- Name: COLUMN v1_v2_caixa_mapa.v1_saldo_inicial_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.v1_v2_caixa_mapa.v1_saldo_inicial_key IS 'Nome da constante VARS/legado que guardava o saldo inicial dessa caixa no V1 (ex.: CAIXA_LANCE_SALDO_INICIAL_CICLO); NULL quando a caixa não existia como saldo inicial separado no V1.';


--
-- Name: COLUMN v1_v2_caixa_mapa.v1_array_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.v1_v2_caixa_mapa.v1_array_key IS 'Nome da constante VARS/legado que guardava o array de transações dessa caixa no V1 (ex.: CAIXA_LANCE_TRANSACOES); NULL quando a caixa é escalar no V1 (sem array de transações), não confundir com "não migrada".';


--
-- Name: COLUMN v1_v2_caixa_mapa.confiavel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.v1_v2_caixa_mapa.confiavel IS 'true = mapeamento V1->V2 dessa caixa foi reconciliado linha a linha e pode ser usado por scripts de migração/hidratação automática; false = NÃO usar automaticamente, exige checagem manual antes (motivo geralmente detalhado em "observacao").';


--
-- Name: COLUMN v1_v2_caixa_mapa.observacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.v1_v2_caixa_mapa.observacao IS 'Texto livre explicando o porquê de confiavel=true/false e detalhes da reconciliação (ex. data em que foi conferida, se o saldo_inicial existe no Supabase ou só no arquivo local).';


--
-- Name: COLUMN v1_v2_caixa_mapa.v1_saldo_inicial_fallback_arquivo_local; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.v1_v2_caixa_mapa.v1_saldo_inicial_fallback_arquivo_local IS 'Valor (R$) do saldo inicial dessa caixa encontrado no arquivo local vars-caixas.js/vars-reembolsos.js, usado como fallback quando o Supabase não tem esse saldo inicial gravado (ver coluna seguinte).';


--
-- Name: COLUMN v1_v2_caixa_mapa.v1_saldo_inicial_existe_no_supabase; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.v1_v2_caixa_mapa.v1_saldo_inicial_existe_no_supabase IS 'true/false/NULL indicando se o saldo inicial dessa caixa já está gravado em alguma tabela V2 do Supabase (não só no arquivo local vars-*.js).';


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
-- Name: TABLE wallace_dados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.wallace_dados IS 'TABELA LEGADA (V1) — blob único (sempre id=1) com ~90 chaves em JSON, resíduo do sistema antigo baseado em VARS estático. Até 12/08/2026 era mesclada por cima de VARS no boot via Object.assign(VARS, dr) em src/app/app.js; esse merge foi REMOVIDO NESSA DATA a pedido explícito do usuário (revogação da exceção arquitetural) e NÃO é mais lida em lugar nenhum do boot do painel hoje. Cada chave que ela alimentava já tem fonte V2 dedicada própria (transacoes/caixas/indicadores/parametros_gerais/etc. — ver comentário "REMOVIDO 12/08/2026" em src/app/app.js para o mapeamento completo). NÃO tratar como fonte de dado atual — é histórico morto, mantida só por precaução/rollback. NÃO confundir com as tabelas V2 relacionais (essas sim são a fonte viva).';


--
-- Name: COLUMN wallace_dados.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wallace_dados.id IS 'Sempre 1 — tabela de linha única (singleton), não tem múltiplos registros.';


--
-- Name: COLUMN wallace_dados.dados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wallace_dados.dados IS 'JSON legado com ~90 chaves de primeiro nível (ex.: caixaLance, PLUGGY_CONTAS, cartaoMBTotal, LEGENDAS, SOLAR_LEITURAS) — cada uma migrada para uma tabela V2 própria e hoje desconectada do boot do painel. Não escrever/ler daqui para funcionalidade nova.';


--
-- Name: COLUMN wallace_dados.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wallace_dados.atualizado_em IS 'Timestamp (UTC) da última escrita nesse blob — não é indicador de "dado atualizado hoje", pode estar parado há dias já que nada mais escreve aqui ativamente no fluxo normal.';


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
-- Name: vw_comprometido_cartao_por_caixa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_comprometido_cartao_por_caixa AS
 SELECT c.id AS caixa_id,
    c.nome AS caixa_nome,
    (COALESCE(sum(t.valor) FILTER (WHERE ((t.status = 'confirmado'::text) AND (t.tipo = 'saida'::text) AND (t.afeta_saldo_real = false) AND (t.cartao_id IS NOT NULL) AND (t.ja_orcado_assinaturas = false) AND ((c.ciclo_inicio_em IS NULL) OR (t.data >= c.ciclo_inicio_em)) AND ((t.categoria_id IS NULL) OR (t.categoria_id <> ALL (ARRAY['1cc9db18-aec4-4cf1-962d-4d9a36f44f70'::uuid, 'e928229a-b984-4232-89d9-aadf6b17fe19'::uuid]))))), (0)::numeric))::numeric(12,2) AS comprometido_cartao
   FROM (public.caixas c
     LEFT JOIN public.transacoes t ON ((t.caixa_id = c.id)))
  GROUP BY c.id, c.nome;


--
-- Name: VIEW vw_comprometido_cartao_por_caixa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vw_comprometido_cartao_por_caixa IS 'Padrão único "centro de custo" (pedido do usuário 21/08/2026): soma genérica de compras no cartão ainda não pagas (afeta_saldo_real=false, cartao_id preenchido, status=confirmado, tipo=saida) por caixa, sem lista fixa de ids. Combinar com vw_saldo_v2_por_caixa.v2_saldo_calculado pra obter Disponível Real (saldo − comprometido) — esse é o único número que representa dinheiro de fato disponível; o saldo bruto pode incluir dinheiro já comprometido no cartão. Substitui as listas fixas CAIXAS_TEMATICAS_COMPROMETIDO_V2/MB_CAIXAS_TEMATICAS_IDS pro propósito de EXIBIÇÃO (o cálculo específico do Não Reconciliado do Mastercard Black, filtrado só pelos cartões MB, continua em atualizarCaixasTematicasComprometidoMB/hydrate-visa-mb.js — propósito diferente, não duplicar aqui).';


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
    t.valor,
    t.cartao_id
   FROM ((public.transacoes t
     JOIN public.caixas c ON (((c.id = t.caixa_id) AND (c.nome = 'Caixa Variável'::text))))
     JOIN public.usuarios u ON ((u.id = t.usuario_id)))
  WHERE ((t.afeta_saldo_real = false) AND (t.cartao_id IS NOT NULL) AND (t.ja_orcado_assinaturas = false) AND ((c.ciclo_inicio_em IS NULL) OR (t.data >= c.ciclo_inicio_em) OR (t.data IS NULL)))
  ORDER BY t.data DESC NULLS LAST;


--
-- Name: vw_wwi_comparativo_mensal; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_wwi_comparativo_mensal WITH (security_invoker='true') AS
 WITH base AS (
         SELECT hr.competencia,
            to_date((hr.competencia || '-01'::text), 'YYYY-MM-DD'::text) AS competencia_data,
            hr.score,
            (((hr.dados_json -> 'indicadoresBrutos'::text) ->> 'patrimonioLiquido'::text))::numeric AS patrimonio_liquido,
            (hr.dados_json ->> 'metodologiaVersao'::text) AS metodologia_versao
           FROM public.historico_relatorios hr
        ), mensal AS (
         SELECT b.competencia,
            b.competencia_data,
            b.score,
            b.patrimonio_liquido,
            b.metodologia_versao,
            (EXTRACT(year FROM b.competencia_data))::integer AS ano,
            (EXTRACT(quarter FROM b.competencia_data))::integer AS trimestre,
            lag(b.score) OVER (ORDER BY b.competencia_data) AS score_mes_anterior,
            lag(b.patrimonio_liquido) OVER (ORDER BY b.competencia_data) AS patrimonio_mes_anterior,
            lag(b.metodologia_versao) OVER (ORDER BY b.competencia_data) AS metodologia_versao_mes_anterior
           FROM base b
        ), fechamento_trimestre AS (
         SELECT DISTINCT ON (mensal.ano, mensal.trimestre) mensal.ano,
            mensal.trimestre,
            mensal.competencia_data,
            mensal.score AS score_fechamento_trimestre,
            mensal.patrimonio_liquido AS patrimonio_fechamento_trimestre
           FROM mensal
          ORDER BY mensal.ano, mensal.trimestre, mensal.competencia_data DESC
        ), trimestre_comparado AS (
         SELECT fechamento_trimestre.ano,
            fechamento_trimestre.trimestre,
            fechamento_trimestre.score_fechamento_trimestre,
            fechamento_trimestre.patrimonio_fechamento_trimestre,
            lag(fechamento_trimestre.score_fechamento_trimestre) OVER (ORDER BY fechamento_trimestre.ano, fechamento_trimestre.trimestre) AS score_trimestre_anterior,
            lag(fechamento_trimestre.patrimonio_fechamento_trimestre) OVER (ORDER BY fechamento_trimestre.ano, fechamento_trimestre.trimestre) AS patrimonio_trimestre_anterior
           FROM fechamento_trimestre
        ), fechamento_ano AS (
         SELECT DISTINCT ON (mensal.ano) mensal.ano,
            mensal.competencia_data,
            mensal.score AS score_fechamento_ano,
            mensal.patrimonio_liquido AS patrimonio_fechamento_ano
           FROM mensal
          ORDER BY mensal.ano, mensal.competencia_data DESC
        ), ano_comparado AS (
         SELECT fechamento_ano.ano,
            fechamento_ano.score_fechamento_ano,
            fechamento_ano.patrimonio_fechamento_ano,
            lag(fechamento_ano.score_fechamento_ano) OVER (ORDER BY fechamento_ano.ano) AS score_ano_anterior,
            lag(fechamento_ano.patrimonio_fechamento_ano) OVER (ORDER BY fechamento_ano.ano) AS patrimonio_ano_anterior
           FROM fechamento_ano
        )
 SELECT m.competencia,
    m.ano,
    m.trimestre,
    m.metodologia_versao,
    ((m.metodologia_versao IS DISTINCT FROM m.metodologia_versao_mes_anterior) AND (m.metodologia_versao_mes_anterior IS NOT NULL)) AS metodologia_mudou_desde_mes_anterior,
    m.score,
    m.patrimonio_liquido,
    m.score_mes_anterior,
    (m.score - m.score_mes_anterior) AS delta_score_mom,
        CASE
            WHEN ((m.score_mes_anterior IS NOT NULL) AND (m.score_mes_anterior <> (0)::numeric)) THEN round((((m.score - m.score_mes_anterior) / m.score_mes_anterior) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS delta_score_mom_pct,
    m.patrimonio_mes_anterior,
    (m.patrimonio_liquido - m.patrimonio_mes_anterior) AS delta_patrimonio_mom,
        CASE
            WHEN ((m.patrimonio_mes_anterior IS NOT NULL) AND (m.patrimonio_mes_anterior <> (0)::numeric)) THEN round((((m.patrimonio_liquido - m.patrimonio_mes_anterior) / m.patrimonio_mes_anterior) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS delta_patrimonio_mom_pct,
    tc.score_trimestre_anterior,
    (tc.score_fechamento_trimestre - tc.score_trimestre_anterior) AS delta_score_qoq,
    tc.patrimonio_trimestre_anterior,
    (tc.patrimonio_fechamento_trimestre - tc.patrimonio_trimestre_anterior) AS delta_patrimonio_qoq,
    ac.score_ano_anterior,
    (ac.score_fechamento_ano - ac.score_ano_anterior) AS delta_score_yoy,
    ac.patrimonio_ano_anterior,
    (ac.patrimonio_fechamento_ano - ac.patrimonio_ano_anterior) AS delta_patrimonio_yoy
   FROM ((mensal m
     LEFT JOIN trimestre_comparado tc ON (((tc.ano = m.ano) AND (tc.trimestre = m.trimestre))))
     LEFT JOIN ano_comparado ac ON ((ac.ano = m.ano)))
  ORDER BY m.competencia_data DESC;


--
-- Name: vw_wwi_metricas_historico; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_wwi_metricas_historico WITH (security_invoker='true') AS
 WITH base AS (
         SELECT hr.competencia,
            to_date((hr.competencia || '-01'::text), 'YYYY-MM-DD'::text) AS competencia_data,
            (hr.dados_json ->> 'metodologiaVersao'::text) AS metodologia_versao,
            m_1.metrica,
            (m_1.valor)::numeric AS valor
           FROM (public.historico_relatorios hr
             CROSS JOIN LATERAL ( SELECT 'patrimonioFinanceiro'::text AS metrica,
                    (hr.dados_json #>> '{indicadoresBrutos,patrimonioFinanceiro}'::text[]) AS valor
                UNION ALL
                 SELECT 'ativosTotal'::text,
                    (hr.dados_json #>> '{indicadoresBrutos,ativosTotal}'::text[])
                UNION ALL
                 SELECT 'passivosTotal'::text,
                    (hr.dados_json #>> '{indicadoresBrutos,passivosTotal}'::text[])
                UNION ALL
                 SELECT 'reserva'::text,
                    (hr.dados_json #>> '{indicadoresBrutos,reserva}'::text[])
                UNION ALL
                 SELECT 'liquidezCiclos'::text,
                    (hr.dados_json #>> '{indicadoresBrutos,liquidezCiclos}'::text[])
                UNION ALL
                 SELECT 'metaMilhaoPct'::text,
                    (hr.dados_json #>> '{indicadoresBrutos,metaMilhaoPct}'::text[])
                UNION ALL
                 SELECT 'consorcioCasaPagoPct'::text,
                    (hr.dados_json #>> '{indicadoresBrutos,consorcioCasaPagoPct}'::text[])
                UNION ALL
                 SELECT 'projetoCasaNovaPct'::text,
                    (hr.dados_json #>> '{dadosNarrativos,projetoCasaNovaPct}'::text[])
                UNION ALL
                 SELECT 'subscore_liquidez'::text,
                    (hr.dados_json #>> '{subscores,liquidez}'::text[])
                UNION ALL
                 SELECT 'subscore_endividamento'::text,
                    (hr.dados_json #>> '{subscores,endividamento}'::text[])
                UNION ALL
                 SELECT 'subscore_investimentos'::text,
                    (hr.dados_json #>> '{subscores,investimentos}'::text[])
                UNION ALL
                 SELECT 'subscore_protecaoPatrimonial'::text,
                    (hr.dados_json #>> '{subscores,protecaoPatrimonial}'::text[])
                UNION ALL
                 SELECT 'subscore_organizacaoFinanceira'::text,
                    (hr.dados_json #>> '{subscores,organizacaoFinanceira}'::text[])
                UNION ALL
                 SELECT 'subscore_execucaoDeMetas'::text,
                    (hr.dados_json #>> '{subscores,execucaoDeMetas}'::text[])
                UNION ALL
                 SELECT 'subscore_construcaoPatrimonial'::text,
                    (hr.dados_json #>> '{subscores,construcaoPatrimonial}'::text[])) m_1)
          WHERE (m_1.valor IS NOT NULL)
        ), mensal AS (
         SELECT b.competencia,
            b.competencia_data,
            b.metodologia_versao,
            b.metrica,
            b.valor,
            (EXTRACT(year FROM b.competencia_data))::integer AS ano,
            (EXTRACT(quarter FROM b.competencia_data))::integer AS trimestre,
            lag(b.valor) OVER w AS valor_mes_anterior,
            lag(b.competencia_data) OVER w AS competencia_data_anterior,
            lag(b.metodologia_versao) OVER w AS metodologia_versao_anterior
           FROM base b
          WINDOW w AS (PARTITION BY b.metrica ORDER BY b.competencia_data)
        ), fechamento_trimestre AS (
         SELECT DISTINCT ON (mensal.metrica, mensal.ano, mensal.trimestre) mensal.metrica,
            mensal.ano,
            mensal.trimestre,
            mensal.competencia_data,
            mensal.valor AS valor_fechamento_trimestre
           FROM mensal
          ORDER BY mensal.metrica, mensal.ano, mensal.trimestre, mensal.competencia_data DESC
        ), trimestre_comparado AS (
         SELECT fechamento_trimestre.metrica,
            fechamento_trimestre.ano,
            fechamento_trimestre.trimestre,
            fechamento_trimestre.valor_fechamento_trimestre,
            lag(fechamento_trimestre.valor_fechamento_trimestre) OVER (PARTITION BY fechamento_trimestre.metrica ORDER BY fechamento_trimestre.ano, fechamento_trimestre.trimestre) AS valor_trimestre_anterior
           FROM fechamento_trimestre
        ), fechamento_ano AS (
         SELECT DISTINCT ON (mensal.metrica, mensal.ano) mensal.metrica,
            mensal.ano,
            mensal.competencia_data,
            mensal.valor AS valor_fechamento_ano
           FROM mensal
          ORDER BY mensal.metrica, mensal.ano, mensal.competencia_data DESC
        ), ano_comparado AS (
         SELECT fechamento_ano.metrica,
            fechamento_ano.ano,
            fechamento_ano.valor_fechamento_ano,
            lag(fechamento_ano.valor_fechamento_ano) OVER (PARTITION BY fechamento_ano.metrica ORDER BY fechamento_ano.ano) AS valor_ano_anterior
           FROM fechamento_ano
        )
 SELECT m.competencia,
    m.metrica,
    m.metodologia_versao,
    m.valor,
    ((m.competencia_data_anterior IS NOT NULL) AND (m.competencia_data_anterior = ((m.competencia_data - '1 mon'::interval))::date)) AS serie_contigua_mom,
    m.valor_mes_anterior,
        CASE
            WHEN ((m.valor_mes_anterior IS NOT NULL) AND (m.competencia_data_anterior = ((m.competencia_data - '1 mon'::interval))::date)) THEN (m.valor - m.valor_mes_anterior)
            ELSE NULL::numeric
        END AS delta_mom,
        CASE
            WHEN ((m.valor_mes_anterior IS NOT NULL) AND (m.valor_mes_anterior <> (0)::numeric) AND (m.competencia_data_anterior = ((m.competencia_data - '1 mon'::interval))::date)) THEN round((((m.valor - m.valor_mes_anterior) / abs(m.valor_mes_anterior)) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS delta_mom_pct,
    ((m.metodologia_versao IS DISTINCT FROM m.metodologia_versao_anterior) AND (m.metodologia_versao_anterior IS NOT NULL)) AS metodologia_mudou_mom,
    tc.valor_trimestre_anterior,
    (tc.valor_fechamento_trimestre - tc.valor_trimestre_anterior) AS delta_qoq,
    ac.valor_ano_anterior,
    (ac.valor_fechamento_ano - ac.valor_ano_anterior) AS delta_yoy
   FROM ((mensal m
     LEFT JOIN trimestre_comparado tc ON (((tc.metrica = m.metrica) AND (tc.ano = m.ano) AND (tc.trimestre = m.trimestre))))
     LEFT JOIN ano_comparado ac ON (((ac.metrica = m.metrica) AND (ac.ano = m.ano))))
  ORDER BY m.metrica, m.competencia_data DESC;


--
-- Name: vw_wwi_score_historico; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_wwi_score_historico WITH (security_invoker='true') AS
 WITH base AS (
         SELECT hr.competencia,
            to_date((hr.competencia || '-01'::text), 'YYYY-MM-DD'::text) AS competencia_data,
            hr.score,
            (hr.dados_json ->> 'metodologiaVersao'::text) AS metodologia_versao
           FROM public.historico_relatorios hr
          WHERE (hr.score IS NOT NULL)
        ), numerada AS (
         SELECT b.competencia,
            b.competencia_data,
            b.score,
            b.metodologia_versao,
            lag(b.competencia_data, 2) OVER (ORDER BY b.competencia_data) AS competencia_data_2atras
           FROM base b
        ), mm AS (
         SELECT n.competencia,
            n.competencia_data,
            n.score,
            n.metodologia_versao,
                CASE
                    WHEN (n.competencia_data_2atras = ((n.competencia_data - '2 mons'::interval))::date) THEN round((((n.score + lag(n.score, 1) OVER (ORDER BY n.competencia_data)) + lag(n.score, 2) OVER (ORDER BY n.competencia_data)) / 3.0), 2)
                    ELSE NULL::numeric
                END AS media_movel_3
           FROM numerada n
        ), melhor_pior_metodologia AS (
         SELECT base.metodologia_versao,
            max(base.score) AS melhor,
            min(base.score) AS pior
           FROM base
          GROUP BY base.metodologia_versao
        )
 SELECT mm.competencia,
    mm.score,
    mm.metodologia_versao,
    mm.media_movel_3,
    mpm.melhor AS melhor_score_mesma_metodologia,
    mpm.pior AS pior_score_mesma_metodologia,
    ( SELECT max(base.score) AS max
           FROM base) AS melhor_score_historico_absoluto,
    ( SELECT min(base.score) AS min
           FROM base) AS pior_score_historico_absoluto,
        CASE
            WHEN ((mm.media_movel_3 IS NOT NULL) AND (lag(mm.media_movel_3) OVER (ORDER BY mm.competencia_data) IS NOT NULL)) THEN
            CASE
                WHEN (mm.media_movel_3 > lag(mm.media_movel_3) OVER (ORDER BY mm.competencia_data)) THEN 'alta'::text
                WHEN (mm.media_movel_3 < lag(mm.media_movel_3) OVER (ORDER BY mm.competencia_data)) THEN 'queda'::text
                ELSE 'estavel'::text
            END
            ELSE NULL::text
        END AS tendencia
   FROM (mm
     JOIN melhor_pior_metodologia mpm ON ((mpm.metodologia_versao = mm.metodologia_versao)))
  ORDER BY mm.competencia_data DESC;


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
-- Name: beneficios_creditos beneficios_creditos_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficios_creditos
    ADD CONSTRAINT beneficios_creditos_nome_key UNIQUE (nome);


--
-- Name: beneficios_creditos beneficios_creditos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beneficios_creditos
    ADD CONSTRAINT beneficios_creditos_pkey PRIMARY KEY (id);


--
-- Name: caixas_aportes_mensais caixas_aportes_mensais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixas_aportes_mensais
    ADD CONSTRAINT caixas_aportes_mensais_pkey PRIMARY KEY (id);


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
-- Name: cotacoes_acoes_historico cotacoes_acoes_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotacoes_acoes_historico
    ADD CONSTRAINT cotacoes_acoes_historico_pkey PRIMARY KEY (ticker, data);


--
-- Name: cotacoes_acoes cotacoes_acoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotacoes_acoes
    ADD CONSTRAINT cotacoes_acoes_pkey PRIMARY KEY (ticker);


--
-- Name: cotacoes_opcoes cotacoes_opcoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotacoes_opcoes
    ADD CONSTRAINT cotacoes_opcoes_pkey PRIMARY KEY (symbol);


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
-- Name: dividendos_acoes dividendos_acoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dividendos_acoes
    ADD CONSTRAINT dividendos_acoes_pkey PRIMARY KEY (id);


--
-- Name: dividendos_acoes dividendos_acoes_ticker_tipo_data_pagamento_valor_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dividendos_acoes
    ADD CONSTRAINT dividendos_acoes_ticker_tipo_data_pagamento_valor_key UNIQUE (ticker, tipo, data_pagamento, valor);


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
-- Name: glicose_leituras glicose_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.glicose_leituras
    ADD CONSTRAINT glicose_leituras_pkey PRIMARY KEY (id);


--
-- Name: historico_relatorios historico_relatorios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_relatorios
    ADD CONSTRAINT historico_relatorios_pkey PRIMARY KEY (competencia);


--
-- Name: indicadores indicadores_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicadores
    ADD CONSTRAINT indicadores_nome_key UNIQUE (nome);


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
-- Name: medidor_ddsu666_saj_leituras medidor_ddsu666_saj_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medidor_ddsu666_saj_leituras
    ADD CONSTRAINT medidor_ddsu666_saj_leituras_pkey PRIMARY KEY (id);


--
-- Name: medidor_tuya_consumo_diario medidor_tuya_consumo_diario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medidor_tuya_consumo_diario
    ADD CONSTRAINT medidor_tuya_consumo_diario_pkey PRIMARY KEY (data, casa);


--
-- Name: medidor_tuya_leituras medidor_tuya_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medidor_tuya_leituras
    ADD CONSTRAINT medidor_tuya_leituras_pkey PRIMARY KEY (id);


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
-- Name: pressao_arterial pressao_arterial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pressao_arterial
    ADD CONSTRAINT pressao_arterial_pkey PRIMARY KEY (id);


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
-- Name: regras_lancamento_estabelecimento regras_lancamento_estabelecimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_lancamento_estabelecimento
    ADD CONSTRAINT regras_lancamento_estabelecimento_pkey PRIMARY KEY (id);


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
-- Name: idx_caixas_aportes_mensais_caixa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caixas_aportes_mensais_caixa_id ON public.caixas_aportes_mensais USING btree (caixa_id);


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
-- Name: idx_pluggy_investimentos_conexao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pluggy_investimentos_conexao_id ON public.pluggy_investimentos USING btree (conexao_id);


--
-- Name: idx_pluggy_saldos_reservados_conta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pluggy_saldos_reservados_conta_id ON public.pluggy_saldos_reservados USING btree (conta_id);


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
-- Name: cartoes trg_audit_cartoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_cartoes AFTER INSERT OR DELETE OR UPDATE ON public.cartoes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: contas_bancarias trg_audit_contas_bancarias; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_contas_bancarias AFTER INSERT OR DELETE OR UPDATE ON public.contas_bancarias FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: cronograma_assinaturas trg_audit_cronograma_assinaturas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_cronograma_assinaturas AFTER INSERT OR DELETE OR UPDATE ON public.cronograma_assinaturas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: cronograma_consorcios trg_audit_cronograma_consorcios; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_cronograma_consorcios AFTER INSERT OR DELETE OR UPDATE ON public.cronograma_consorcios FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: cronograma_recorrencias trg_audit_cronograma_recorrencias; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_cronograma_recorrencias AFTER INSERT OR DELETE OR UPDATE ON public.cronograma_recorrencias FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: emprestimos_internos trg_audit_emprestimos_internos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_emprestimos_internos AFTER INSERT OR DELETE OR UPDATE ON public.emprestimos_internos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: financiamentos trg_audit_financiamentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_financiamentos AFTER INSERT OR DELETE OR UPDATE ON public.financiamentos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: historico_relatorios trg_audit_historico_relatorios; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_historico_relatorios AFTER INSERT OR DELETE OR UPDATE ON public.historico_relatorios FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_historico_relatorios();


--
-- Name: indicadores trg_audit_indicadores; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_indicadores AFTER INSERT OR DELETE OR UPDATE ON public.indicadores FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: investimentos trg_audit_investimentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_investimentos AFTER INSERT OR DELETE OR UPDATE ON public.investimentos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: metas trg_audit_metas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_metas AFTER INSERT OR DELETE OR UPDATE ON public.metas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: parcelas trg_audit_parcelas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_parcelas AFTER INSERT OR DELETE OR UPDATE ON public.parcelas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: patrimonio trg_audit_patrimonio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_patrimonio AFTER INSERT OR DELETE OR UPDATE ON public.patrimonio FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: reembolso_wartsila_ciclo trg_audit_reembolso_wartsila_ciclo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_reembolso_wartsila_ciclo AFTER INSERT OR DELETE OR UPDATE ON public.reembolso_wartsila_ciclo FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: reembolso_wartsila_recebimentos trg_audit_reembolso_wartsila_recebimentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_reembolso_wartsila_recebimentos AFTER INSERT OR DELETE OR UPDATE ON public.reembolso_wartsila_recebimentos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: reembolsos trg_audit_reembolsos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_reembolsos AFTER INSERT OR DELETE OR UPDATE ON public.reembolsos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: transacoes trg_audit_transacoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_transacoes AFTER INSERT OR DELETE OR UPDATE ON public.transacoes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


--
-- Name: usuarios trg_audit_usuarios; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_usuarios AFTER INSERT OR DELETE OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_generic();


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
-- Name: medidor_tuya_leituras trigger_medidor_tuya_consumo_diario; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_medidor_tuya_consumo_diario AFTER INSERT ON public.medidor_tuya_leituras FOR EACH ROW EXECUTE FUNCTION public.trg_medidor_tuya_consumo_diario();


--
-- Name: caixas_aportes_mensais caixas_aportes_mensais_caixa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixas_aportes_mensais
    ADD CONSTRAINT caixas_aportes_mensais_caixa_id_fkey FOREIGN KEY (caixa_id) REFERENCES public.caixas(id);


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
-- Name: regras_lancamento_estabelecimento regras_lancamento_estabelecimento_caixa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_lancamento_estabelecimento
    ADD CONSTRAINT regras_lancamento_estabelecimento_caixa_id_fkey FOREIGN KEY (caixa_id) REFERENCES public.caixas(id);


--
-- Name: regras_lancamento_estabelecimento regras_lancamento_estabelecimento_cartao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_lancamento_estabelecimento
    ADD CONSTRAINT regras_lancamento_estabelecimento_cartao_id_fkey FOREIGN KEY (cartao_id) REFERENCES public.cartoes(id);


--
-- Name: regras_lancamento_estabelecimento regras_lancamento_estabelecimento_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_lancamento_estabelecimento
    ADD CONSTRAINT regras_lancamento_estabelecimento_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


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
-- Name: aplicacoes_ozivy Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.aplicacoes_ozivy FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: beneficios_creditos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.beneficios_creditos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: caixas Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.caixas FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: caixas_aportes_mensais Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.caixas_aportes_mensais FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


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
-- Name: cronograma_assinaturas Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.cronograma_assinaturas FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: cronograma_boletos_fixos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.cronograma_boletos_fixos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: cronograma_consorcios Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.cronograma_consorcios FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: cronograma_doacoes Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.cronograma_doacoes FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: cronograma_recorrencias Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.cronograma_recorrencias FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


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
-- Name: glicose_leituras Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.glicose_leituras FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: historico_relatorios Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.historico_relatorios FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: indicadores Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.indicadores FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: investimentos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.investimentos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: medidor_ddsu666_saj_leituras Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.medidor_ddsu666_saj_leituras FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: medidor_tuya_consumo_diario Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.medidor_tuya_consumo_diario FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: medidor_tuya_leituras Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.medidor_tuya_leituras FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: mercadopago_eventos Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.mercadopago_eventos FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: metas Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.metas FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


--
-- Name: parametros_gerais Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.parametros_gerais FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


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
-- Name: pib_wallace_historico Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pib_wallace_historico FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


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
-- Name: pressao_arterial Leitura restrita a login Firebase valido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura restrita a login Firebase valido" ON public.pressao_arterial FOR SELECT USING (((( SELECT auth.jwt() AS jwt) IS NOT NULL) AND ((( SELECT auth.jwt() AS jwt) ->> 'iss'::text) = 'https://securetoken.google.com/sistema-wallace-lira'::text) AND ((( SELECT auth.jwt() AS jwt) ->> 'aud'::text) = 'sistema-wallace-lira'::text)));


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
-- Name: cotacoes_acoes_historico Leitura via anon key (site publico); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura via anon key (site publico)" ON public.cotacoes_acoes_historico FOR SELECT USING (true);


--
-- Name: cotacoes_opcoes Leitura via anon key (site publico); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura via anon key (site publico)" ON public.cotacoes_opcoes FOR SELECT USING (true);


--
-- Name: dividendos_acoes Leitura via anon key (site publico); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura via anon key (site publico)" ON public.dividendos_acoes FOR SELECT USING (true);


--
-- Name: wallace_dados Leitura via service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura via service role" ON public.wallace_dados FOR SELECT USING ((( SELECT auth.role() AS role) = 'service_role'::text));


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
-- Name: beneficios_creditos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.beneficios_creditos ENABLE ROW LEVEL SECURITY;

--
-- Name: caixas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

--
-- Name: caixas_aportes_mensais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.caixas_aportes_mensais ENABLE ROW LEVEL SECURITY;

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
-- Name: cotacoes_acoes_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cotacoes_acoes_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: cotacoes_opcoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cotacoes_opcoes ENABLE ROW LEVEL SECURITY;

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
-- Name: dividendos_acoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dividendos_acoes ENABLE ROW LEVEL SECURITY;

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
-- Name: glicose_leituras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.glicose_leituras ENABLE ROW LEVEL SECURITY;

--
-- Name: historico_relatorios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historico_relatorios ENABLE ROW LEVEL SECURITY;

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
-- Name: medidor_ddsu666_saj_leituras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medidor_ddsu666_saj_leituras ENABLE ROW LEVEL SECURITY;

--
-- Name: medidor_tuya_consumo_diario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medidor_tuya_consumo_diario ENABLE ROW LEVEL SECURITY;

--
-- Name: medidor_tuya_leituras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medidor_tuya_leituras ENABLE ROW LEVEL SECURITY;

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
-- Name: pressao_arterial; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pressao_arterial ENABLE ROW LEVEL SECURITY;

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

\unrestrict ijM8NF0sNEwGAQsBY5xAFqfkkoXRUJHjPTYSJgNpJ0UJ318VCLB20cWH4PXD2l1

