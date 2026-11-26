/* SMOKE 23 (Beta §5 Datenbank & Strikte RLS) —
   1) Prüft statisch alle SQL-Migrationen auf ENABLE + FORCE ROW LEVEL SECURITY, auth.uid()=user_id,
      Spalten-Schutz-Trigger (price_locked) und RPCs.
   2) Falls SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY gesetzt sind:
      Führt einen echten 2-Konten-Isolationstest gegen Supabase Frankfurt durch (Konto B sieht 0 Zeilen von Konto A,
      Spalten-Manipulation an price_locked wird abgewiesen, waitlist/invite_codes für Clients gesperrt). */
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
let fails = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg);
  if (!cond) fails++;
}

const migDir = path.join(ROOT, 'supabase', 'migrations');
const migSql = fs.readdirSync(migDir).sort().map((f) => fs.readFileSync(path.join(migDir, f), 'utf8')).join('\n');

for (const tbl of ['profiles', 'items', 'waitlist', 'invite_codes', 'rate_limits']) {
  ok(new RegExp(`alter\\s+table\\s+public\\.${tbl}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(migSql),
    `Migration aktiviert RLS auf public.${tbl}`);
  ok(new RegExp(`alter\\s+table\\s+public\\.${tbl}\\s+force\\s+row\\s+level\\s+security`, 'i').test(migSql),
    `Migration erzwingt FORCE RLS auf public.${tbl}`);
}
ok(/auth\.uid\(\)\s*=\s*user_id/i.test(migSql) && /protect_profile_sensitive_columns/i.test(migSql) && /trg_protect_profile_columns/i.test(migSql),
  'Migration sichert auth.uid() = user_id und schützt price_locked / Abo-Spalten per Trigger');

(async () => {
  const url = (process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !anonKey || !serviceKey) {
    console.log('INFO — Keine Live-Supabase-Credentials in Env gesetzt; statische RLS-Migrationsprüfung abgeschlossen.');
    if (fails > 0) process.exit(1);
    console.log('SMOKE 23 ALL GREEN (STATIC)');
    return;
  }

  console.log('Starte Live-2-Konten-RLS-Prüfung gegen Supabase Frankfurt...');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const emailA = `theo-rls-a-${stamp}@example.com`;
  const emailB = `theo-rls-b-${stamp}@example.com`;
  const pw = 'TheoRlsTest!' + stamp;
  let userA = null;
  let userB = null;

  try {
    const cA = await admin.auth.admin.createUser({ email: emailA, password: pw, email_confirm: true, user_metadata: { segment: 'keine_diagnose' } });
    const cB = await admin.auth.admin.createUser({ email: emailB, password: pw, email_confirm: true });
    ok(!cA.error && !cB.error && cA.data.user && cB.data.user, 'Live-RLS: Zwei isolierte Test-Konten A & B angelegt');
    userA = cA.data.user;
    userB = cB.data.user;

    const clientA = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const clientB = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const sA = await clientA.auth.signInWithPassword({ email: emailA, password: pw });
    const sB = await clientB.auth.signInWithPassword({ email: emailB, password: pw });
    ok(!sA.error && !sB.error && Boolean(sA.data.session) && Boolean(sB.data.session), 'Live-RLS: Echte JWT-Sitzungen für Konto A & Konto B aktiv');

    // Konto A schreibt sensible Planungsdaten via upsert_user_items
    const upA = await clientA.rpc('upsert_user_items', {
      p_items: [
        { uid: 'theo-capsule@theo-app', kind: 'capsule', payload: { motto: { '2026': 'Geheimes Motto von A' } }, updated_at: new Date().toISOString(), deleted: false },
        { uid: 'theo-todo-sec1@theo-app', kind: 'todo', payload: { id: 'sec1', title: 'Nur für A sichtbar' }, updated_at: new Date().toISOString(), deleted: false }
      ]
    });
    ok(!upA.error && Array.isArray(upA.data) && upA.data.length === 2, 'Live-RLS: Konto A speichert eigene Items erfolgreich');

    // Konto B versucht Items & Profil von Konto A zu lesen -> MUSS 0 Zeilen liefern!
    const bReadsItems = await clientB.from('items').select('*');
    const bReadsAExplicit = await clientB.from('items').select('*').eq('user_id', userA.id);
    const bReadsProfiles = await clientB.from('profiles').select('*').eq('user_id', userA.id);

    ok(!bReadsItems.error && bReadsItems.data.length === 0 && bReadsAExplicit.data.length === 0,
      'Live-RLS: Konto B kann KEINE EINZIGE Zeile aus items von Konto A lesen (0 Zeilen)');
    ok(!bReadsProfiles.error && bReadsProfiles.data.length === 0,
      'Live-RLS: Konto B kann das Profil von Konto A nicht lesen (0 Zeilen)');

    // Konto B versucht fremde user_id in items einzuschleusen -> RLS blockiert!
    const bSpoofInsert = await clientB.from('items').insert({
      user_id: userA.id,
      uid: 'theo-todo-spoof@theo-app',
      kind: 'todo',
      payload: { title: 'Spoof' }
    });
    ok(Boolean(bSpoofInsert.error), 'Live-RLS: Konto B kann keine Zeile mit fremder user_id einfügen');

    // Konto A versucht eigenen Bestandsschutz-Preis / Abo-Status selbst zu manipulieren -> Trigger schützt!
    await clientA.from('profiles').update({ price_locked: 1, subscription_status: 'active', segment: 'verdacht_warteliste' }).eq('user_id', userA.id);
    const profAfter = await clientA.from('profiles').select('price_locked,subscription_status,segment').eq('user_id', userA.id).single();
    ok(profAfter.data && profAfter.data.price_locked === 29 && profAfter.data.subscription_status === 'beta_free' && profAfter.data.segment === 'verdacht_warteliste',
      'Live-RLS: Trigger schützt price_locked=29 & subscription_status gegen Client-Manipulation, erlaubt aber Segment-Update');

    // Clients dürfen weder waitlist noch invite_codes auslesen
    const readWl = await clientA.from('waitlist').select('*');
    const readInv = await clientA.from('invite_codes').select('*');
    ok((readWl.error || (readWl.data && readWl.data.length === 0)) && (readInv.error || (readInv.data && readInv.data.length === 0)),
      'Live-RLS: Authentifizierte Clients können weder waitlist noch invite_codes auslesen');
  } finally {
    if (userA) await admin.auth.admin.deleteUser(userA.id).catch(() => {});
    if (userB) await admin.auth.admin.deleteUser(userB.id).catch(() => {});
  }

  if (fails > 0) {
    console.error('SMOKE 23 FAILED (' + fails + ')');
    process.exit(1);
  }
  console.log('SMOKE 23 ALL GREEN (LIVE FRANKFURT RLS VERIFIED)');
})();
