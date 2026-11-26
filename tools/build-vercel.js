'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, '.vercel-dist');
const DIST_APP = path.join(DIST, 'app');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST_APP, { recursive: true });

const landingFiles = [
  'index.html',
  'impressum.html',
  'datenschutz.html',
  'agb.html',
  'theo-icon.png'
];
for (const f of landingFiles) {
  fs.copyFileSync(path.join(ROOT, 'landing', f), path.join(DIST, f));
}

const appFiles = [
  'index.html',
  'manifest.webmanifest',
  'education.js',
  'sw.js',
  'theo-icon.png'
];
for (const f of appFiles) {
  fs.copyFileSync(path.join(ROOT, 'app', f), path.join(DIST_APP, f));
}

const sbUmdCandidates = [
  path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
  path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'main', 'index.js')
];
const sbUmd = sbUmdCandidates.find((p) => fs.existsSync(p));
if (!sbUmd) {
  throw new Error('Could not find @supabase/supabase-js UMD bundle in node_modules');
}
fs.copyFileSync(sbUmd, path.join(DIST_APP, 'supabase.min.js'));

// Safety guard: verify zero CalDAV/Nextcloud strings in shipped HTML/JS assets (excluding vendored SDK)
const checkTargets = [
  ...landingFiles.filter((f) => f.endsWith('.html')).map((f) => path.join(DIST, f)),
  path.join(DIST_APP, 'index.html'),
  path.join(DIST_APP, 'sw.js'),
  path.join(DIST_APP, 'manifest.webmanifest')
];

const forbiddenRe = /caldav|nextcloud|webdav|__dav_proxy__|__theo_proxy__/i;
for (const file of checkTargets) {
  const txt = fs.readFileSync(file, 'utf8');
  if (forbiddenRe.test(txt)) {
    throw new Error(`Forbidden legacy calendar token found in build output: ${file}`);
  }
}

console.log('Built .vercel-dist successfully (Landing + PWA App + same-origin supabase.min.js).');
