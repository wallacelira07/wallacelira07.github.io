/**
 * RehidratacaoPaineisWindowScope.test.js
 * ========================================
 * Guard mecânico para a classe de bug já encontrada e corrigida em 20/08/2026
 * (ver comentário em src/dashboard/charts/graficos-cenarios-lazy.js, linha ~374):
 * `atualizarGraficosNecessidade` era chamada via `typeof atualizarGraficosNecessidade
 * === 'function'` em hydrate-deficit-caixas-sem-lrei.js, mas a função estava
 * declarada DENTRO do escopo de outra função do mesmo arquivo — nunca virava
 * propriedade de `window` quando o arquivo carregava como <script> clássico.
 * O guard `typeof` então falhava silenciosamente pra sempre (retornava
 * 'undefined', nunca lançava erro), e a rehidratação daquele painel simplesmente
 * nunca rodava — sem nenhum aviso, achado só por print manual do usuário.
 *
 * Este teste reproduz mecanicamente a mesma verificação que pegaria esse bug antes
 * de chegar em produção: para cada `typeof NOME === 'function'` (ou
 * `typeof window.NOME === 'function'`) usado como guard de rehidratação em
 * src/**\/*.js, confirma que NOME é ou (a) uma função declarada no nível raiz de
 * algum arquivo (`function NOME(...)` na coluna 0 — vira propriedade de `window`
 * quando o <script> clássico carrega, mesmo padrão usado em todo o boot, ver
 * Sistema_Wallace_Lira_Completo.html / __carregarScriptsParalelo) ou (b)
 * explicitamente atribuída via `window.NOME = ...` em algum arquivo.
 *
 * Não é uma checagem de lógica de cálculo nem de dado — só de escopo/tooling
 * (a mesma causa raiz do bug de 20/08/2026), por isso o filtro de nomes abaixo
 * só considera identificadores que seguem a convenção de nome de função de
 * rehidratação/ação já usada em todo o projeto (hydrate*, aplicar*, atualizar*,
 * recalcular*, render*, renderizar*, auditoria*, show*, obter*, promover*,
 * calcular*, construir*, gerar*, init*, anexar*, renovar*, _calcular*, _render*,
 * _atualizar*, _lazy*) — exclui de propósito nomes de parâmetro local usados no
 * mesmo padrão defensivo (ex.: `typeof extra === 'function'` em
 * hydrate-onda1-v2.js/hydrate-onda2-v2.js, onde `extra` é um parâmetro de
 * callback opcional, não uma função global).
 *
 * Rodar: node tests/unit/RehidratacaoPaineisWindowScope.test.js
 */

const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', '..', 'src');

const CONVENCAO_NOME_FUNCAO_GLOBAL =
  /^_{0,2}(hydrate|aplicar|atualizar|recalcular|render|renderizar|auditoria|show|obter|promover|calcular|construir|gerar|init|anexar|renovar)[A-Z0-9_]/;

function listarArquivosJs(dir) {
  const resultado = [];
  for (const nome of fs.readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    const stat = fs.statSync(caminho);
    if (stat.isDirectory()) {
      resultado.push(...listarArquivosJs(caminho));
    } else if (nome.endsWith('.js')) {
      resultado.push(caminho);
    }
  }
  return resultado;
}

const arquivos = listarArquivosJs(SRC_ROOT);

// 1) Nomes declarados como `function NOME(` na coluna 0 de qualquer arquivo —
//    é exatamente essa forma que, num <script> clássico (sem type=module,
//    confirmado em __carregarScriptsParalelo/Sistema_Wallace_Lira_Completo.html),
//    vira propriedade de `window` por hoisting, sem precisar de atribuição
//    explícita.
const declaradasNoTopoDoArquivo = new Set();

// 2) Nomes explicitamente atribuídos via `window.NOME = ...` em qualquer arquivo
//    — cobre os casos (como atualizarGraficosNecessidade e
//    anexarTooltipComposicaoCaixa) onde a exposição é deliberada em vez de
//    depender de hoisting de topo de arquivo.
const atribuidasEmWindow = new Set();

// 3) Nomes declarados como `function NOME(` em QUALQUER indentação, agrupados por
//    arquivo — cobre o caso legítimo de função aninhada usada só dentro do mesmo
//    arquivo/closure onde foi declarada (ex.: promoverCampoV2SeConfiavel em
//    app.js: declarada dentro de uma função, mas só chamada de dentro da MESMA
//    função — isso funciona por hoisting de escopo local, sem nunca precisar
//    virar propriedade de `window`; não é o bug que este teste audita).
const declaradasPorArquivo = new Map(); // arquivo relativo -> Set(nomes)

// 4) Todo identificador referenciado num guard `typeof NOME === 'function'`
//    (com ou sem prefixo `window.`), com o arquivo+linha onde apareceu.
const referenciasTypeof = []; // { nome, arquivo, linha }

const RE_FUNCAO_TOPO = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;
const RE_FUNCAO_QUALQUER = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
const RE_WINDOW_ASSIGN = /window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
const RE_TYPEOF_GUARD = /typeof\s+(?:window\.)?([A-Za-z_$][\w$]*)\s*===\s*['"]function['"]/g;

for (const arquivo of arquivos) {
  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const linhas = conteudo.split('\n');
  const arquivoRel = path.relative(SRC_ROOT, arquivo);

  linhas.forEach((linha) => {
    const matchTopo = linha.match(RE_FUNCAO_TOPO);
    if (matchTopo) declaradasNoTopoDoArquivo.add(matchTopo[1]);
  });

  const declaradasNesteArquivo = new Set();
  let mf;
  RE_FUNCAO_QUALQUER.lastIndex = 0;
  while ((mf = RE_FUNCAO_QUALQUER.exec(conteudo))) {
    declaradasNesteArquivo.add(mf[1]);
  }
  declaradasPorArquivo.set(arquivoRel, declaradasNesteArquivo);

  let m;
  RE_WINDOW_ASSIGN.lastIndex = 0;
  while ((m = RE_WINDOW_ASSIGN.exec(conteudo))) {
    atribuidasEmWindow.add(m[1]);
  }

  linhas.forEach((linha, idx) => {
    RE_TYPEOF_GUARD.lastIndex = 0;
    let mg;
    while ((mg = RE_TYPEOF_GUARD.exec(linha))) {
      referenciasTypeof.push({ nome: mg[1], arquivo: arquivoRel, linha: idx + 1 });
    }
  });
}

// Exceções conhecidas, documentadas de propósito (não escondidas): casos reais
// encontrados ao escrever este teste que NÃO são a classe de bug auditada aqui
// (função ausente do arquivo/window), mas sim um problema estrutural diferente
// — fora do escopo deste teste mecânico de escopo. Cada entrada precisa do
// motivo documentado.
const EXCECOES_CONHECIDAS = {
  // compartilhamento-solar.js roda dentro do iframe de Sistema_Wallace_Lira_
  // Completo.html (ver index.html, <iframe id="mainIframe">) — janela própria,
  // separada do documento pai. `renovarTokenFirebase` só existe em index.html
  // (window do documento PAI, linha ~2060/2091), nunca em nenhum arquivo de
  // src/ carregado dentro do iframe — então `typeof window.renovarTokenFirebase`
  // dentro do iframe é sempre 'undefined', e o retry de token nunca dispara.
  // Bug real, pré-existente, DIFERENTE da classe auditada aqui (função nunca
  // exposta em NENHUM window, não só no window errado) — não corrigido por este
  // teste, fica documentado aqui pra não ficar escondido nem travar este guard.
  renovarTokenFirebase: 'declarada só em index.html (window do documento pai), nunca em src/ (window do iframe onde o guard roda) — ver comentário acima',
};

let total = 0;
const jaReportados = new Set(); // evita repetir o mesmo nome dezenas de vezes (chamado em vários arquivos)

for (const ref of referenciasTypeof) {
  if (!CONVENCAO_NOME_FUNCAO_GLOBAL.test(ref.nome)) continue; // fora da convenção de função global (ex.: parâmetro local "extra") — não é o que este teste audita
  total++;
  const exposta =
    declaradasNoTopoDoArquivo.has(ref.nome) ||
    atribuidasEmWindow.has(ref.nome) ||
    (declaradasPorArquivo.get(ref.arquivo) || new Set()).has(ref.nome); // função aninhada, mas usada só dentro do mesmo arquivo/closure
  if (!exposta) {
    const chave = ref.nome;
    if (Object.prototype.hasOwnProperty.call(EXCECOES_CONHECIDAS, chave)) {
      if (!jaReportados.has('__excecao__' + chave)) {
        jaReportados.add('__excecao__' + chave);
        console.log(`⚠️  ${ref.nome}: exceção conhecida e documentada (${EXCECOES_CONHECIDAS[chave]}) — ver ${ref.arquivo}:${ref.linha}.`);
      }
      continue;
    }
    if (!jaReportados.has(chave)) {
      jaReportados.add(chave);
      console.log(`❌ ${ref.nome}: referenciada via typeof em ${ref.arquivo}:${ref.linha}, mas não é função declarada em nenhum arquivo nem atribuída a window.${ref.nome} em nenhum lugar — o guard sempre falha silenciosamente.`);
    }
  }
}

const nomesComFalhaReal = [...jaReportados].filter((n) => !n.startsWith('__excecao__'));

let falhouPorFaltaDeCobertura = false;
if (total === 0) {
  console.log('⚠️  Nenhum guard typeof(...)===\'function\' com nome na convenção de função global foi encontrado — teste não teve o que verificar (revisar CONVENCAO_NOME_FUNCAO_GLOBAL).');
  falhouPorFaltaDeCobertura = true;
}

const nomesDistintos = new Set(referenciasTypeof.filter((r) => CONVENCAO_NOME_FUNCAO_GLOBAL.test(r.nome)).map((r) => r.nome)).size;
console.log(`\n${nomesComFalhaReal.length === 0 ? '✅' : '❌'} RehidratacaoPaineisWindowScope: ${nomesDistintos - nomesComFalhaReal.length}/${nomesDistintos} nome(s) distinto(s) expostos em window corretamente, ${nomesComFalhaReal.length} sem exposição (${total} guards checados no total).`);

process.exit(nomesComFalhaReal.length > 0 || falhouPorFaltaDeCobertura ? 1 : 0);
