/* SMOKE 21 (Beta M3 Sync) — 2-Geräte-Konvergenz über Supabase items,
   Pro-Row-LWW (updated_at), Grabsteine (deleted=true), Flugmodus/Offline-Reconnect,
   Multi-Account-Cache-Schutz (ownerId) & R13b-Neugeräte-Schutz (Pull vor erstem Push!) */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
const scripts = [...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const mainScript = scripts.sort((a, b) => b.length - a.length)[0];

let fails = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg);
  if (!cond) fails++;
}

/* Serverseitige Referenz-Implementierung der Postgres-Tabelle public.items + RPC upsert_user_items + RLS */
function createInMemorySupabaseCloud() {
  const tables = { items: [] }; // { user_id, uid, kind, payload, updated_at, synced_at, deleted }
  const rpcLog = [];
  let srvClock = Date.now();
  const nextServerNow = () => {
    const n = Date.now();
    srvClock = n > srvClock ? n : srvClock + 1;
    return new Date(srvClock).toISOString();
  };

  function makeClientForSession(getSessionFn) {
    return {
      auth: {
        getSession: async () => ({ data: { session: getSessionFn() } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({})
      },
      from(tbl) {
        if (tbl !== 'items') throw new Error('Unexpected table ' + tbl);
        let minSyncedAt = null;
        const builder = {
          select() { return builder; },
          gte(col, val) {
            if (col === 'synced_at') minSyncedAt = val;
            return builder;
          },
          then(resolve, reject) {
            try {
              const sess = getSessionFn();
              if (!sess || !sess.user) return Promise.resolve({ data: [], error: { message: 'JWT missing' } }).then(resolve, reject);
              const uid = sess.user.id;
              const rows = tables.items
                .filter((r) => r.user_id === uid && (!minSyncedAt || Date.parse(r.synced_at) >= Date.parse(minSyncedAt)))
                .map((r) => JSON.parse(JSON.stringify(r)));
              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            } catch (err) {
              return Promise.reject(err).then(resolve, reject);
            }
          }
        };
        return builder;
      },
      async rpc(fnName, args) {
        const sess = getSessionFn();
        if (!sess || !sess.user) return { data: null, error: { message: 'Not authenticated' } };
        if (fnName !== 'upsert_user_items') throw new Error('Unexpected RPC ' + fnName);
        const userId = sess.user.id;
        const batch = Array.isArray(args.p_items) ? args.p_items : [];
        rpcLog.push({ userId, uids: batch.map((b) => b.uid) });
        const out = [];
        for (const item of batch) {
          const syncedAt = nextServerNow();
          const existing = tables.items.find((r) => r.user_id === userId && r.uid === item.uid);
          if (!existing) {
            const row = {
              user_id: userId,
              uid: item.uid,
              kind: item.kind,
              payload: JSON.parse(JSON.stringify(item.payload || {})),
              updated_at: item.updated_at || syncedAt,
              synced_at: syncedAt,
              deleted: Boolean(item.deleted)
            };
            tables.items.push(row);
            out.push({ uid: row.uid, updated_at: row.updated_at, synced_at: row.synced_at, deleted: row.deleted });
          } else {
            // Exakt wie in supabase/migrations/20261126000100_theo_beta_init.sql: Pro-Row-LWW via updated_at >= existing.updated_at
            if (Date.parse(item.updated_at) >= Date.parse(existing.updated_at)) {
              existing.kind = item.kind;
              existing.payload = JSON.parse(JSON.stringify(item.payload || {}));
              existing.updated_at = item.updated_at;
              existing.synced_at = syncedAt;
              existing.deleted = Boolean(item.deleted);
            }
            out.push({ uid: existing.uid, updated_at: existing.updated_at, synced_at: existing.synced_at, deleted: existing.deleted });
          }
        }
        return { data: out, error: null };
      }
    };
  }

  return { tables, rpcLog, makeClientForSession };
}

function spawnDevice(cloud, initialSession, initialStore = {}) {
  let currentSession = initialSession;
  const store = Object.assign({}, initialStore);
  const els = {};
  function mkEl(id) {
    return {
      id, value: '', checked: false, innerHTML: '', textContent: '', style: {}, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, focus() {}, click() {},
      contains() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; }
    };
  }
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, Promise, URLSearchParams,
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    location: { protocol: 'https:', search: '', hash: '', href: 'https://theo-beta.example/app/' },
    window: { addEventListener() {} },
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
      createElement: (t) => mkEl('tmp-' + t),
      body: mkEl('body'),
      addEventListener() {}
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true, supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'anon', inviteRequired: true })
    }),
    __THEO_SB_MOCK__: cloud.makeClientForSession(() => currentSession)
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    mainScript + '\nglobalThis.__D={get S(){return S},set S(v){S=v},ui,ACT,AUTH,SYNC,save,pushAll,pullAll,syncCycle,bindAuthSession,wk,blocksFor,apsFor};',
    sandbox
  );
  return {
    d: sandbox.__D,
    nav: sandbox.navigator,
    store,
    setSession(s) {
      currentSession = s;
      sandbox.__D.bindAuthSession(s);
    }
  };
}

(async () => {
  const cloud = createInMemorySupabaseCloud();
  const sessUserA = { access_token: 'jwt-a', user: { id: 'user-a-uuid', email: 'a@example.de' } };

  const devA = spawnDevice(cloud, sessUserA);
  const devB = spawnDevice(cloud, sessUserA);
  await new Promise((r) => setTimeout(r, 30));

  /* ---------- T1: Alle Entitätstypen von Gerät A nach Gerät B synchronisieren ---------- */
  const W = devA.d.wk();
  const yr = String(new Date().getFullYear());
  devA.d.S.motto[yr] = 'Gelassen durch das Jahr';
  devA.d.S.areas.push({ id: 'ar1', name: 'Gesundheit', emoji: '🌿', color: '#7CA982' });
  devA.d.S.projects.push({
    id: 'pr1', areaId: 'ar1', name: 'Rücken stärken', emoji: '🧘', note: '', views: { list: true, kanban: true },
    todos: [{ id: 'td1', title: 'Matte ausrollen', firstStep: 'Ins Wohnzimmer legen', done: false, kanban: 'offen', due: W }]
  });
  devA.d.S.tasks.push({ id: 'tk1', title: 'Rezept abholen', firstStep: 'Karte einstecken', done: false, kanban: 'offen', due: null });
  devA.d.blocksFor(W)['0|0'] = { id: 'bl1', kind: 'typ', typeId: 'ty7', title: 'Ruhiger Fokus', ampel: 'gelb', note: 'Kapitel 1', done: false };
  devA.d.apsFor(W)['1|1'] = { id: 'ap1', day: 1, slot: 1, title: 'Physiotherapie', time: '14:30–15:15', t0: '14:30', t1: '15:15', ampel: 'gruen', span: 1 };
  devA.d.S.mit[W] = { text: 'Physio wahrnehmen', done: false };
  devA.d.S.phases.push({ id: 'ph1', start: W, end: W, title: 'Schonwoche', desc: '', color: '#A3B98F' });
  devA.d.save();

  await devA.d.syncCycle(false);
  await devB.d.syncCycle(false);

  ok(devB.d.S.motto[yr] === 'Gelassen durch das Jahr', 'T1a: Kapsel (Jahresmotto & Bereiche) auf Gerät B angekommen');
  ok(devB.d.S.projects.length === 1 && devB.d.S.projects[0].todos[0].title === 'Matte ausrollen',
    'T1b: Projekt + Projekt-To-do inkl. Erster Schritt auf Gerät B angekommen');
  ok(devB.d.S.tasks.length === 1 && devB.d.S.tasks[0].title === 'Rezept abholen',
    'T1c: Einzelaufgabe auf Gerät B angekommen');
  ok(devB.d.blocksFor(W)['0|0'] && devB.d.blocksFor(W)['0|0'].title === 'Ruhiger Fokus',
    'T1d: Wochenblock (theo-block-...) auf Gerät B angekommen');
  ok(devB.d.apsFor(W)['1|1'] && devB.d.apsFor(W)['1|1'].title === 'Physiotherapie',
    'T1e: Termin (theo-appt-...) auf Gerät B angekommen');
  ok(devB.d.S.mit[W] && devB.d.S.mit[W].text === 'Physio wahrnehmen' && devB.d.S.phases.length === 1,
    'T1f: Tages-MIT & Jahresphase auf Gerät B angekommen');

  /* ---------- T2: R13b-Neugeräte-Schutz (Pull vor erstem Push!) ---------- */
  const logLenBeforeC = cloud.rpcLog.length;
  const devC = spawnDevice(cloud, null);
  await new Promise((r) => setTimeout(r, 15));
  devC.setSession(sessUserA);
  // Gerät C ist noch unpulled (S.meta.pulled === false) — selbst wenn pushAll() direkt gerufen wird, darf die leere Kapsel NIEMALS hochgeladen werden!
  devC.d.S.capsuleTs = Date.now() + 999999;
  const prematurePush = await devC.d.pushAll();
  const cPushedCapsule = cloud.rpcLog.slice(logLenBeforeC).some((entry) => entry.uids.includes('theo-capsule@theo-app'));
  ok(prematurePush.ok === 0 && !cPushedCapsule,
    'T2a (R13b-Regression): Frisches Gerät C überschreibt vor erstem Pull NIEMALS die Server-Kapsel');

  await devC.d.syncCycle(false);
  ok(devC.d.S.motto[yr] === 'Gelassen durch das Jahr' && devC.d.S.areas.length === 1,
    'T2b (R13b-Regression): Frisches Gerät C übernimmt beim ersten Sync vollständig die bestehende Server-Kapsel');

  /* ---------- T3: Pro-Row-LWW (unabhängige Zeilen + Konflikt-Auflösung über updated_at) ---------- */
  // Gerät A ändert Block 0|0, Gerät B ändert gleichzeitig Todo td1 -> beide Zeilen bleiben erhalten!
  devA.d.blocksFor(W)['0|0'].note = 'Kapitel 1 + 2 fertig';
  devA.d.save();
  devB.d.S.projects[0].todos[0].done = true;
  devB.d.S.projects[0].todos[0].kanban = 'fertig';
  devB.d.save();

  await devA.d.syncCycle(false);
  await devB.d.syncCycle(false);
  await devA.d.syncCycle(false);

  ok(devA.d.S.projects[0].todos[0].done === true && devB.d.blocksFor(W)['0|0'].note === 'Kapitel 1 + 2 fertig',
    'T3a: Pro-Row-LWW führt gleichzeitige Änderungen verschiedener Items verlustfrei zusammen');

  // Gleiche Zeile: Gerät B schreibt später (neuere updated_at) -> B gewinnt deterministisch
  devA.d.S.tasks[0].title = 'Älterer Titel von A';
  devA.d.save();
  await new Promise((r) => setTimeout(r, 10));
  devB.d.S.tasks[0].title = 'Neuerer Titel von B';
  devB.d.save();

  await devA.d.syncCycle(false);
  await devB.d.syncCycle(false);
  await devA.d.syncCycle(false);
  ok(devA.d.S.tasks[0].title === 'Neuerer Titel von B' && devB.d.S.tasks[0].title === 'Neuerer Titel von B',
    'T3b: Bei Konflikt auf derselben Zeile gewinnt deterministisch das neuere updated_at');

  /* ---------- T4: Grabsteine (deleted=true) löschen zuverlässig auf Zweitgerät ---------- */
  devA.d.ACT.freeSlot({ day: '0', slot: '0' });
  await devA.d.ACT.apptDel({ id: 'ap1' });
  devA.d.ACT.phaseDel({ id: 'ph1' });
  devA.d.ACT.delTask({ id: 'tk1' });
  await devA.d.syncCycle(false);
  await devB.d.syncCycle(false);

  ok(!devB.d.blocksFor(W)['0|0'] && !devB.d.apsFor(W)['1|1'] && devB.d.S.phases.length === 0 && devB.d.S.tasks.length === 0,
    'T4: Gelöschte Blöcke, Termine, Phasen und Aufgaben werden per Tombstone (deleted=true) auf Gerät B entfernt');

  /* ---------- T5: Flugmodus (Offline-Edits in localStorage -> Reconnect -> Konvergenz) ---------- */
  devA.nav.onLine = false;
  devA.d.SYNC.online = false;
  devA.d.blocksFor(W)['3|2'] = { id: 'bl_off', kind: 'typ', typeId: 'ty1', title: 'Abendspaziergang im Flugmodus', ampel: 'gruen', note: '', done: false };
  devA.d.save();
  await devA.d.syncCycle(false);
  ok(!devB.d.blocksFor(W)['3|2'] && JSON.parse(devA.store['theo-state']).blocks[W]['3|2'].title === 'Abendspaziergang im Flugmodus',
    'T5a: Im Flugmodus bleibt Änderung lokal in localStorage gesichert, ohne fehlerhaften Netzwerk-Push');

  devA.nav.onLine = true;
  devA.d.SYNC.online = true;
  await devA.d.syncCycle(false);
  await devB.d.syncCycle(false);
  ok(devB.d.blocksFor(W)['3|2'] && devB.d.blocksFor(W)['3|2'].title === 'Abendspaziergang im Flugmodus',
    'T5b: Nach Reconnect synchronisiert die Offline-Änderung automatisch auf Gerät B');

  /* ---------- T6: Multi-Account-Isolierung im Browser (ownerId-Wechsel leert lokalen Cache) ---------- */
  devA.setSession({ access_token: 'jwt-user-2', user: { id: 'user-b-uuid', email: 'b@example.de' } });
  ok(devA.d.S.meta.ownerId === 'user-b-uuid' && Object.keys(devA.d.blocksFor(W)).length === 0 && devA.d.S.projects.length === 0,
    'T6: Konto-Wechsel im selben Browser verwirft fremden lokalen Cache (ownerId-Schutz)');

  if (fails > 0) {
    console.error('SMOKE 21 FAILED (' + fails + ')');
    process.exit(1);
  }
  console.log('SMOKE 21 ALL GREEN');
})();
