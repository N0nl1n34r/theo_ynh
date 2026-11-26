/* SMOKE 20 (Beta M0–M4) — Zero-CalDAV/Nextcloud-Guard, YunoHost-Unversehrtheit,
   Zero-External-Tracker-Check, Rechtstext- & Wording-Leitplanken,
   Auth-Gate-Zustände, 5-Minuten-Onboarding, Vorschau-Modus & Alpha-UX-Invarianten in app/index.html */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let fails = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg);
  if (!cond) fails++;
}

/* ---------- 1. YunoHost-Altbestand unverändert ---------- */
const ynhDiff = execSync('git status --porcelain conf/ scripts/ manifest.toml', { cwd: ROOT, encoding: 'utf8' }).trim();
ok(ynhDiff === '', 'YunoHost-Altbestand (conf/, scripts/, manifest.toml) ist 100 % unverändert');

/* ---------- 2. Null CalDAV / Nextcloud / WebDAV / ICS in app/, landing/, api/ ---------- */
function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else if (!entry.name.endsWith('.png') && entry.name !== 'supabase.min.js') out.push(p);
  }
  return out;
}

const betaFiles = [
  ...walkFiles(path.join(ROOT, 'app')),
  ...walkFiles(path.join(ROOT, 'landing')),
  ...walkFiles(path.join(ROOT, 'api'))
];
const caldavHits = [];
const forbiddenRe = /caldav|nextcloud|webdav|__dav_proxy__|__theo_proxy__|VEVENT|VTODO|VJOURNAL/i;
for (const f of betaFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  if (forbiddenRe.test(txt)) caldavHits.push(path.relative(ROOT, f));
}
ok(caldavHits.length === 0, 'Null CalDAV/Nextcloud/WebDAV/ICS-Treffer in app/, landing/, api/');

/* ---------- 3. Null externe CDNs / Tracker / US-Analytics ---------- */
const htmlDocs = [
  'landing/index.html',
  'landing/impressum.html',
  'landing/datenschutz.html',
  'landing/agb.html',
  'app/index.html'
];
const externalTrackerHits = [];
const extRe = /https?:\/\/(?!localhost)[^\s"'<>]+/gi;
for (const rel of htmlDocs) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const urls = txt.match(extRe) || [];
  for (const u of urls) {
    // Erlaubt sind ausschließlich XML-Namespaces (w3.org/2000/svg) oder verlinkte Behörden-/Infoseiten in <a href>, niemals <script src> / <link href> / @import
    if (!u.includes('w3.org/2000/svg') && !u.includes('ec.europa.eu/consumers/odr')) {
      externalTrackerHits.push(rel + ': ' + u);
    }
  }
  const extAsset = /<(?:script|link|img|iframe)\b[^>]+(?:src|href)=["']https?:\/\//i.test(txt) || /@import\s+url\(["']?https?:\/\//i.test(txt);
  if (extAsset) externalTrackerHits.push(rel + ': external asset tag');
}
ok(externalTrackerHits.length === 0, 'Keine externen Tracker, US-Fonts oder Dritt-CDNs in HTML-Dokumenten (' + externalTrackerHits.length + ')');

/* ---------- 4. Landingpage & Rechtstext-Pflichtinhalte ---------- */
const landingHtml = fs.readFileSync(path.join(ROOT, 'landing/index.html'), 'utf8');
ok(landingHtml.includes('frisch_diagnostiziert') && landingHtml.includes('verdacht_warteliste') && landingHtml.includes('keine_diagnose'),
  'Landingpage erfasst alle 3 optionalen Segmente für die Warteliste');
ok(landingHtml.includes('29 €') && landingHtml.includes('290 €') && /Bestandsschutz/i.test(landingHtml),
  'Landingpage kommuniziert 29 €/Monat, 290 €/Jahr und dauerhaften Bestandsschutz');
ok(/ersetzt keine ärztliche oder psychotherapeutische Diagnose/i.test(landingHtml),
  'Landingpage enthält den verbindlichen Abgrenzungshinweis (kein Heilversprechen)');
ok(!/Heilung|heilt ADHS|therapiert|behandelt Symptome/i.test(landingHtml),
  'Landingpage enthält keinerlei Heilversprechen');

for (const legalDoc of ['landing/impressum.html', 'landing/datenschutz.html', 'landing/agb.html']) {
  const ltxt = fs.readFileSync(path.join(ROOT, legalDoc), 'utf8');
  ok(ltxt.includes('legal-review: needed'), legalDoc + ' trägt sichtbare Prüfmarkierung legal-review: needed');
}
const datenschutzHtml = fs.readFileSync(path.join(ROOT, 'landing/datenschutz.html'), 'utf8');
ok(/Frankfurt/i.test(datenschutzHtml) && /Supabase/i.test(datenschutzHtml) && /Vercel/i.test(datenschutzHtml),
  'Datenschutzerklärung benennt ehrlich Supabase, Vercel und Serverstandort Frankfurt');
const agbHtml = fs.readFileSync(path.join(ROOT, 'landing/agb.html'), 'utf8');
ok(/Widerrufsbelehrung/i.test(agbHtml) && /312k/i.test(agbHtml) && agbHtml.includes('id="kuendigung"'),
  'AGB enthalten 14-Tage-Widerrufsbelehrung und zweistufigen § 312k-Kündigungsbereich');

/* ---------- 5. Beta-App in Sandbox booten: Auth-Gate, Onboarding, Vorschau & Alpha-UX ---------- */
const appHtml = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
const scripts = [...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const mainScript = scripts.sort((a, b) => b.length - a.length)[0];

function bootAppInstance(opts = {}) {
  const els = {};
  const handlers = {};
  function mkEl(id) {
    return {
      id, value: '', checked: true, innerHTML: '', textContent: '', style: {}, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      appendChild(c) { this.children.push(c); }, remove() {}, setAttribute() {}, addEventListener() {},
      focus() {}, click() {}, scrollIntoView() {},
      contains() { return false; },
      querySelector() { return null; }, querySelectorAll() { return []; }
    };
  }
  const store = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise, URLSearchParams,
    Blob: class { constructor(p) { this.p = p; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    navigator: { onLine: opts.online !== false, clipboard: { writeText: async () => {} } },
    location: {
      protocol: opts.protocol || 'https:',
      search: opts.search || '',
      hash: opts.hash || '',
      href: 'https://theo-beta.example/app/'
    },
    window: { addEventListener(ev, fn) { handlers['win:' + ev] = fn; } },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; }
    },
    document: {
      activeElement: null,
      getElementById: (id) => els[id] || (els[id] = mkEl(id)),
      querySelector: (s) => els['q:' + s] || (els['q:' + s] = mkEl('q:' + s)),
      querySelectorAll: () => [],
      createElement: (t) => mkEl('tmp-' + t + '-' + Math.random()),
      body: mkEl('body'),
      addEventListener(n, f) { handlers[n] = f; }
    },
    fetch: opts.fetch || (async (url) => {
      if (String(url).includes('/api/config')) {
        return { ok: true, json: async () => ({ ok: true, supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'anon', inviteRequired: true }) };
      }
      if (String(url).includes('/api/auth-gate')) {
        return { ok: true, json: async () => ({ ok: true, step: 'email_sent', message: 'Anmelde-Link gesendet.' }) };
      }
      return { ok: true, json: async () => ({ ok: true }), text: async () => '{}' };
    }),
    __THEO_SB_MOCK__: opts.sbMock || {
      auth: {
        getSession: async () => ({ data: { session: opts.session || null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({})
      },
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      rpc: async () => ({ data: [], error: null })
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    mainScript + '\nglobalThis.__EX={S:()=>S,ui,ACT,AUTH,SYNC,render,wk,blocksFor,apsFor,kanOf,setKan,KCOLS,estDays,renderMd,timePickHtml};',
    sandbox
  );
  return { ex: sandbox.__EX, els, store };
}

(async () => {
  // 5a) Unangemeldet über HTTPS -> Deutsches Auth-Gate
  const g1 = bootAppInstance({ protocol: 'https:', session: null });
  await new Promise((r) => setTimeout(r, 20));
  const gateHtml1 = g1.els['q:#main'].innerHTML;
  ok(gateHtml1.includes('Geschlossene Beta') && gateHtml1.includes('Anmelde-Link per E-Mail senden'),
    'Auth-Gate zeigt passwortlosen deutschen Magic-Link-Login');

  g1.ex.ACT.authSwitchMode({ m: 'register' });
  const gateReg = g1.els['q:#main'].innerHTML;
  ok(gateReg.includes('Einladungscode') && gateReg.includes('29 €/Monat') && gateReg.includes('auth-seg'),
    'Registrierungs-Tab fordert Einladungscode, zeigt optionales Segment & 29-€-Bestandsschutz');

  // Ungültige / fehlende Eingabe fängt Client freundlich auf
  g1.els['auth-email'] = { value: 'test@example.com' };
  g1.els['auth-invite'] = { value: '' };
  await g1.ex.ACT.authSubmit();
  ok(g1.els['q:#main'].innerHTML.includes('Bitte gib deinen Einladungscode ein'),
    'Fehlender Einladungscode wird verständlich auf Deutsch erklärt');

  g1.els['auth-invite'] = { value: 'THEO-BETA-2026' };
  await g1.ex.ACT.authSubmit();
  ok(g1.ex.ui.authStep === 'sent' && g1.els['q:#main'].innerHTML.includes('E-Mail ist unterwegs'),
    'Nach erfolgreichem Auth-Gate wechselt UI in Zustand „Mail geschickt“ inkl. Erneut-senden-Button');

  // Abgelaufener Link (otp_expired)
  const gExp = bootAppInstance({ protocol: 'https:', search: '?error_code=otp_expired' });
  await new Promise((r) => setTimeout(r, 20));
  ok(gExp.els['q:#main'].innerHTML.includes('abgelaufen oder wurde schon einmal verwendet'),
    'Abgelaufener Magic-Link (otp_expired) zeigt klaren deutschen Hinweis zum Neu-Anfordern');

  // Vorschau-Modus ohne Login ("Ohne Anmeldung testen")
  g1.ex.ACT.enterDemo();
  const demoHtml = g1.els['q:#main'].innerHTML;
  ok(g1.ex.ui.demoMode === true && demoHtml.includes('Lokaler Vorschau-Modus') && demoHtml.includes('wgrid'),
    'Demo-Schalter öffnet Beispiel-Woche im 7×3-Raster ohne Server-Zwang');

  // 5b) Angemeldete Sitzung: Onboarding + Alpha-UX-Invarianten
  const gAuth = bootAppInstance({
    protocol: 'https:',
    session: { access_token: 'tok-1', user: { id: 'u-1', email: 'anna@example.de' } }
  });
  await new Promise((r) => setTimeout(r, 25));
  const weekHtml = gAuth.els['q:#main'].innerHTML;
  ok(weekHtml.includes('Deine ersten 5 ruhigen Minuten in Theo') && weekHtml.includes('seedStarterBlocks'),
    'Wochenansicht zeigt beim Start das ruhige 5-Minuten-Onboarding');

  gAuth.ex.ACT.seedStarterBlocks();
  const W = gAuth.ex.wk();
  const placedCount = Object.keys(gAuth.ex.blocksFor(W)).length;
  ok(placedCount === 3, 'Onboarding „3 Beispiel-Blöcke legen“ setzt 3 ruhige Starter-Blöcke in die aktuelle Woche');

  gAuth.ex.ACT.openMottoQuick();
  gAuth.els['qm-inp'].value = 'Ruhig Schritt für Schritt';
  gAuth.ex.ACT.saveMottoQuick();
  const yr = String(new Date().getFullYear());
  ok(gAuth.ex.S().motto[yr] === 'Ruhig Schritt für Schritt', 'Onboarding Jahresmotto speichert sauber');

  // Kanban, PERT/Estimate, Markdown-XSS-Schutz & 15-Min-Timepicker
  const todo = { id: 't1', title: 'Test', done: false, kanban: 'offen', est: { mode: 'pert', to: 1, tm: 2, tp: 5 } };
  gAuth.ex.S().projects.push({ id: 'p1', areaId: null, name: 'Testprojekt', emoji: '📋', note: '', views: { list: true, kanban: true }, todos: [todo] });
  gAuth.ex.setKan('t1', 'fertig');
  ok(todo.done === true && gAuth.ex.kanOf(todo) === 'fertig', 'Kanban-Status & Erledigt-Flag bleiben synchron');
  ok(Math.abs(gAuth.ex.estDays(todo) - 2.333) < 0.02, 'PERT-Drei-Punkt-Schätzung (estDays) intakt');
  const mdHtml = gAuth.ex.renderMd('**Wichtig**\n<script>alert(1)</script>');
  ok(mdHtml.includes('<b>Wichtig</b>') && !mdHtml.includes('<script>'), 'Eingangskiste rendert Markdown XSS-sicher');
  const tp = gAuth.ex.timePickHtml('09:15', 'data-test="1"', false);
  ok(tp.includes('value="09:15" selected') && !tp.includes('09:17'), '15-Minuten-Time-Picker (:00/:15/:30/:45) intakt');

  // Konfigurationsansicht: Bestandsschutz, Export, Konto löschen, Abmelden
  gAuth.ex.ACT.nav({ v: 'konfig' });
  const cfgHtml = gAuth.els['q:#main'].innerHTML;
  ok(cfgHtml.includes('Bestandsschutz: 29 €/Monat') && cfgHtml.includes('exportAccountJson') && cfgHtml.includes('openAccountDelete'),
    'Konfiguration zeigt 29-€-Bestandsschutz, JSON-Gesamtexport und Self-Service-Konto-Löschung');

  await gAuth.ex.ACT.authLogout();
  ok(gAuth.ex.AUTH.session === null && gAuth.els['q:#main'].innerHTML.includes('Geschlossene Beta'),
    'Abmelden beendet die Sitzung sauber und kehrt zum Auth-Gate zurück');

  if (fails > 0) {
    console.error('SMOKE 20 FAILED (' + fails + ')');
    process.exit(1);
  }
  console.log('SMOKE 20 ALL GREEN');
})();
