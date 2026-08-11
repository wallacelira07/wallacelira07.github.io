# Checklist oficial — toda "Onda" nova (migração V1→V2 de um domínio)

**Status: obrigatório.** Criado 11/08/2026 (hardening de produção) depois de 3 bugs reais da mesma classe nesta semana (Patrimônio, Caixa Variável, Caixas operacionais — seção 46 de `PLANO_UNIFICACAO_V1_V2.md`): o texto do card já mostrava V2, mas o gráfico/busca/cache correspondente continuava lendo V1 porque só o `<tbody>`/texto era sobrescrito, nunca o objeto `REG`/array `VARS` que outras partes do sistema realmente consultam.

**Regra de aplicação**: nenhuma Onda nova entra sem passar por este checklist. Se algum item não se aplica ao domínio específico, documentar explicitamente "N/A — motivo", nunca pular em silêncio.

## Checklist

1. **Atualização de `REG`** — a função Onda escreve o objeto/campo `REG.*` correspondente (não só o texto do DOM)? Qualquer gráfico ou cálculo que leia `REG.*` direto (não o texto renderizado) precisa do dado atualizado ali.
2. **Atualização de `VARS`** — se o domínio tem um array `VARS.*_TRANSACOES` (ou equivalente) usado por outra função além da própria Onda (Busca Global, outro hydrate), ele é reescrito também? (Não só o `<tbody>`.)
3. **Cache** — se `WallaceFinanceService._cache` guarda a chamada, e algo precisa buscar de novo depois de uma ação do usuário (ex: lançamento manual), o cache é invalidado no ponto certo?
4. **Re-render** — depois de atualizar `REG`/`VARS`, a função re-chama os `hydrate*()`/`render*()` que dependem desse dado? (Não basta atualizar o estado, precisa redesenhar quem já tinha renderizado com o valor antigo.)
5. **Gráficos** — existe algum `new Chart(...)` que lê esse mesmo `REG.*`/`VARS.*`? Ele foi criado 1x no boot (nunca mais atualizado) ou tem uma função de update dedicada (`atualizarGrafico*()`) chamada pela Onda? Gráfico `new Chart()` não se atualiza sozinho quando o dado-fonte muda depois.
6. **Busca Global** — se o domínio tem um livro buscável (`LIVROS_BUSCAVEIS`, `dashboard-navegacao.js`), o array que a busca lê (`VARS[nomeLivro]`) é o mesmo que a tela mostra, não uma cópia desatualizada?
7. **Rehidratação/ordem de execução** — a Onda é assíncrona? Existe algo síncrono no boot que lê o mesmo dado ANTES da Onda terminar (efeito "primeira leitura errada, corrige só depois")? Documentar se isso é aceitável (efeito transitório) ou precisa de tratamento.
8. **Persistência** — se a Onda escreve dado (não só lê), a escrita usa RPC (nunca REST direto em tabela) e tem checagem de autenticação real (não só GRANT)? Ver `HARDENING_SEGURANCA_PRODUCAO.md`.
9. **Auditoria automática** — se o domínio tem uma relação matemática que pode ser checada (`A + B = C`), existe um check correspondente em `auditoria-automatica.js`? Se não existir e fizer sentido ter, considerar adicionar (foi exatamente a falta desse check que deixou o gap do Mastercard Black invisível por dias).
10. **Fallback documentado** — se a V2 falhar (fetch quebra), o comportamento é "mostra V1 silenciosamente" ou "avisa que está indisponível"? Qual dos dois é o certo para este domínio específico, e está documentado no comentário da função?

## Onde aplicar

Todo arquivo `hydrate-onda*.js` (ou equivalente) novo. Revisar este checklist item por item no comentário de cabeçalho do módulo, mesmo padrão já usado nos módulos existentes (`hydrate-onda9-livros-fixos.js`, `hydrate-onda3-livro-razao.js` são bons exemplos de documentação completa).
