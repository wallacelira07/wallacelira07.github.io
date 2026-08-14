-- NOVO 14/08/2026 (achado real: transações lançadas direto no banco por outro agente/interface,
-- ex. Claude Chat, nunca passam pelo classificador client-side (classificarViaV2, JS deste repo) —
-- ficavam com categoria_id nulo até alguém notar manualmente (badge "396/398 categorizadas").
-- Regras já existem em regras_classificacao (mesma tabela usada pelo classificador do navegador,
-- ex: H57STORE->Alimentação, UBER->Transporte) — só faltava aplicar no lado do banco também.
-- Este trigger não substitui o classificador client-side (ele continua rodando, mais rápido/richer
-- pro usuário), só garante uma rede de segurança no banco: se uma transação chegar sem categoria_id
-- e existir uma regra ativa cujo estabelecimento_contem bata (case-insensitive) na descrição, aplica
-- automaticamente. Só preenche categoria_id — nunca mexe em caixa_id (resolver_caixa já é usado à
-- parte, com mais contexto/confiança, não replicado aqui pra não arriscar mandar pra caixa errada).
--
-- APLICADA em produção 14/08/2026 (via apply_migration), testada ao vivo com INSERT de teste
-- ("TESTE_TRIGGER Uber Gabriela" → categoria_id preenchido corretamente com "Transporte", linha
-- apagada depois do teste). Este arquivo só documenta/versiona a migration já aplicada.
CREATE OR REPLACE FUNCTION public.fn_auto_categorizar_transacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS trg_auto_categorizar_transacao ON public.transacoes;
CREATE TRIGGER trg_auto_categorizar_transacao
  BEFORE INSERT OR UPDATE ON public.transacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_categorizar_transacao();
