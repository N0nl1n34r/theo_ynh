'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function extractLargestScript(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error('No inline <script> found in ' + htmlPath);
  return blocks.sort((a, b) => b.length - a.length)[0];
}

function checkHtmlInlineScripts(relPath) {
  const full = path.join(ROOT, relPath);
  const html = fs.readFileSync(full, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  blocks.forEach((code, idx) => {
    const tmp = path.join(os.tmpdir(), `theo-check-${path.basename(relPath)}-${idx}.js`);
    fs.writeFileSync(tmp, code, 'utf8');
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
  console.log(`SYNTAX OK — ${relPath} (${blocks.length} inline script block(s))`);
}

function checkJsFiles(dirRel) {
  const fullDir = path.join(ROOT, dirRel);
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const rel = path.join(dirRel, entry.name);
    if (entry.isDirectory()) checkJsFiles(rel);
    else if (entry.name.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'inherit' });
      console.log(`SYNTAX OK — ${rel}`);
    }
  }
}

console.log('=== 1. Syntax-Check (HTML Inline-Scripts & Serverless API) ===');
checkHtmlInlineScripts('app/index.html');
checkHtmlInlineScripts('landing/index.html');
checkHtmlInlineScripts('landing/agb.html');
checkHtmlInlineScripts('conf/lebensrhythmus-prototyp.html');
checkJsFiles('api');

console.log('\n=== 2. Alpha-Baseline-Regression (smoke7..smoke19 gegen conf/) ===');
fs.writeFileSync('/tmp/theo.js', extractLargestScript(path.join(ROOT, 'conf/lebensrhythmus-prototyp.html')), 'utf8');
execFileSync(process.execPath, ['--check', '/tmp/theo.js'], { stdio: 'inherit' });

for (let s = 7; s <= 19; s++) {
  const driver = path.join(ROOT, 'tests', `smoke${s}.js`);
  console.log(`\n--- Running smoke${s}.js ---`);
  execFileSync(process.execPath, [driver], { cwd: ROOT, stdio: 'inherit' });
}

console.log('\n=== 3. Beta-Suite (smoke20..smoke23: App, Sync, API, RLS) ===');
for (let s = 20; s <= 23; s++) {
  const driver = path.join(ROOT, 'tests', `smoke${s}.js`);
  console.log(`\n--- Running smoke${s}.js ---`);
  execFileSync(process.execPath, [driver], { cwd: ROOT, stdio: 'inherit' });
}

console.log('\n=== 4. Produktions-Build-Prüfung (.vercel-dist) ===');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-vercel.js')], { cwd: ROOT, stdio: 'inherit' });

console.log('\n✅ ALLE ALPHA- & BETA-SUITES GRÜN.');
