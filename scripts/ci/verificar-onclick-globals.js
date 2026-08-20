#!/usr/bin/env node
// NOVO 20/08/2026 - achado de auditoria classificado como seguro (domínio Arquitetura/Frontend):
// os handlers inline (onclick=, onchange=, oninput=, onsubmit=) espalhados pelo HTML (49 só em
// Sistema_Wallace_Lira_Completo.html) chamam funções que precisam existir no escopo global (window)
// em tempo de execução - nada barrava hoje um typo, uma função renomeada/removida ou um refactor
// pra ES module (que tornaria as funções não-globais) sem quebrar silenciosamente um botão. Este
// script é só uma checagem estática best-effort: extrai os nomes de função referenciados nos
// handlers inline dos arquivos HTML da raiz do site e confere se cada nome aparece declarado como
// `function nome(`, `window.nome =` ou `const/let/var nome = function|(` em algum .js de src/**
// (que é como as ~91 módulos deste projeto expõem funções pro escopo global via <script> clássico,
// não ES module - ver PLANO_UNIFICACAO_V1_V2.md linha ~960) ou em algum <script> inline do próprio
// HTML. Autocontido (sem framework, sem npm install - só fs/path do Node) e puramente aditivo: só
// lê arquivos, nunca escreve nada, não roda nenhuma lógica financeira.
//
// Limitação conhecida (aceitável pro propósito de "pegar typo/função removida"): não modela a
// ordem/condicionalidade real de carregamento dos módulos (ver comentário sobre __preloadScriptsFinaisDaCadeia
// e window.__promiseModulosBase em Sistema_Wallace_Lira_Completo.html) - só confirma que a função
// existe declarada em ALGUM lugar do código-fonte, não que ela já foi carregada no momento do clique.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const HTML_FILES = [
  'Sistema_Wallace_Lira_Completo.html',
  'index.html',
  'solar-compartilhado.html',
  '404.html',
].filter((f) => fs.existsSync(path.join(ROOT, f)));

const RE_HANDLER = /on(?:click|change|input|submit)="\s*([a-zA-Z_$][\w]*)\s*\(/g;
const RE_FUNC_DECL = /function\s+([a-zA-Z_$][\w]*)\s*\(/g;
const RE_WINDOW_ASSIGN = /window\.([a-zA-Z_$][\w]*)\s*=/g;
const RE_CONST_FUNC = /(?:const|let|var)\s+([a-zA-Z_$][\w]*)\s*=\s*(?:function|\()/g;

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.claude' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function collectGlobals(text, into) {
  let m;
  while ((m = RE_FUNC_DECL.exec(text))) into.add(m[1]);
  while ((m = RE_WINDOW_ASSIGN.exec(text))) into.add(m[1]);
  while ((m = RE_CONST_FUNC.exec(text))) into.add(m[1]);
}

const knownGlobals = new Set();

const srcDir = path.join(ROOT, 'src');
if (fs.existsSync(srcDir)) {
  for (const file of listJsFiles(srcDir)) {
    collectGlobals(fs.readFileSync(file, 'utf8'), knownGlobals);
  }
}

const htmlTexts = {};
for (const hf of HTML_FILES) {
  const text = fs.readFileSync(path.join(ROOT, hf), 'utf8');
  htmlTexts[hf] = text;
  collectGlobals(text, knownGlobals); // funções declaradas em <script> inline também contam
}

let failed = false;

for (const hf of HTML_FILES) {
  const text = htmlTexts[hf];
  const handlers = new Set();
  let m;
  RE_HANDLER.lastIndex = 0;
  while ((m = RE_HANDLER.exec(text))) handlers.add(m[1]);

  const missing = [...handlers].filter((name) => !knownGlobals.has(name)).sort();

  if (missing.length > 0) {
    failed = true;
    console.error(`[FALHA] ${hf}: handler(s) inline referenciando função não declarada em src/**/*.js nem em <script> do próprio arquivo:`);
    for (const name of missing) console.error(`  - ${name}`);
  } else {
    console.log(`[OK] ${hf}: ${handlers.size} função(ões) referenciada(s) em onclick/onchange/oninput/onsubmit, todas declaradas.`);
  }
}

if (failed) {
  console.error('\nVerificação de onclick= vs funções globais FALHOU.');
  process.exit(1);
} else {
  console.log('\nVerificação de onclick= vs funções globais OK.');
  process.exit(0);
}
