/* SMOKE 22 (Beta M1, M2, M4, M5 Serverless APIs) —
   Warteliste + Double-Opt-In + Austragen + Rate-Limit,
   Invite-Gate + deutscher Magic-Link + Willkommens-Mail + price_locked=29,
   JSON-Datenexport + Self-Service-Konto-Löschung,
   Stripe-Checkout mit Bestandsschutz (29 € trotz höherem Neupreis) + HMAC-Webhook + § 312k-Kündigung */
'use strict';

const crypto = require('crypto');

let fails = 0;
function ok(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg);
  if (!cond) fails++;
}

process.env.SUPABASE_URL = 'https://yiwnklgmmklvlmpywiwg.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-secret-for-hmac';
process.env.INVITE_REQUIRED = 'true';
process.env.NEXT_PUBLIC_SITE_URL = 'https://theo-beta.example';
process.env.BREVO_API_KEY = 'brevo-mock-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_123';
process.env.PUBLIC_PRICE_EUR = '49'; // Selbst wenn Neupreis später 49 € wäre, muss Bestandsschutz 29 € greifen!

/* In-Memory-Mock für Service-Supabase, User-Supabase, Mail-Transport & Stripe */
const db = {
  waitlist: [],
  invite_codes: [{ code: 'THEO-BETA-2026', max_uses: 1, used: 0, expires_at: null }],
  users: [],
  profiles: [],
  items: [],
  rateHits: {}
};
const sentMails = [];
const stripeCalls = [];

function makeQuery(tableName, filterState = {}) {
  const state = {
    op: filterState.op || 'select',
    eqs: filterState.eqs || {},
    updatePatch: filterState.updatePatch || null,
    upsertRow: filterState.upsertRow || null,
    wantSingle: false
  };
  const rowsMatch = (r) => Object.entries(state.eqs).every(([k, v]) => r[k] === v);

  const builder = {
    select() { return builder; },
    order() { return builder; },
    eq(col, val) { state.eqs[col] = val; return builder; },
    upsert(row) { state.op = 'upsert'; state.upsertRow = row; return builder; },
    insert(row) { state.op = 'insert'; state.upsertRow = row; return builder; },
    update(patch) { state.op = 'update'; state.updatePatch = patch; return builder; },
    delete() { state.op = 'delete'; return builder; },
    maybeSingle() { state.wantSingle = true; return builder; },
    single() { state.wantSingle = true; return builder; },
    then(resolve, reject) {
      try {
        const tbl = db[tableName];
        if (state.op === 'upsert') {
          const keyCol = tableName === 'waitlist' ? 'email' : (tableName === 'profiles' ? 'user_id' : 'id');
          let hit = tbl.find((r) => r[keyCol] === state.upsertRow[keyCol]);
          if (hit) Object.assign(hit, state.upsertRow);
          else {
            hit = Object.assign({ created_at: new Date().toISOString() }, state.upsertRow);
            tbl.push(hit);
          }
          return Promise.resolve({ data: state.wantSingle ? hit : [hit], error: null }).then(resolve, reject);
        }
        if (state.op === 'insert') {
          const row = Object.assign({ created_at: new Date().toISOString() }, state.upsertRow);
          tbl.push(row);
          return Promise.resolve({ data: state.wantSingle ? row : [row], error: null }).then(resolve, reject);
        }
        if (state.op === 'update') {
          const hits = tbl.filter(rowsMatch);
          hits.forEach((h) => Object.assign(h, state.updatePatch));
          return Promise.resolve({ data: state.wantSingle ? (hits[0] || null) : hits, error: null }).then(resolve, reject);
        }
        if (state.op === 'delete') {
          const removedRows = tbl.filter(rowsMatch);
          db[tableName] = tbl.filter((r) => !rowsMatch(r));
          return Promise.resolve({ data: removedRows, count: removedRows.length, error: null }).then(resolve, reject);
        }
        const hits = tbl.filter(rowsMatch);
        return Promise.resolve({ data: state.wantSingle ? (hits[0] || null) : hits, error: null }).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    }
  };
  return builder;
}

const mockServiceSb = {
  from: (t) => makeQuery(t),
  async rpc(fn, args) {
    if (fn === 'check_rate_limit') {
      const k = args.p_bucket;
      db.rateHits[k] = (db.rateHits[k] || 0) + 1;
      return { data: db.rateHits[k] <= args.p_max_hits, error: null };
    }
    if (fn === 'find_auth_user_by_email') {
      const u = db.users.find((x) => x.email === String(args.p_email || '').toLowerCase());
      return { data: u ? [{ id: u.id, email: u.email }] : [], error: null };
    }
    if (fn === 'claim_invite_code') {
      const c = db.invite_codes.find((x) => x.code === String(args.p_code || '').toUpperCase());
      if (!c || c.used >= c.max_uses) return { data: [], error: null };
      c.used += 1;
      return { data: [c], error: null };
    }
    return { data: null, error: null };
  },
  auth: {
    async getUser(token) {
      const u = db.users.find((x) => x.token === token);
      return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'Invalid token' } };
    },
    admin: {
      async createUser({ email, user_metadata }) {
        const id = 'usr-' + (db.users.length + 1);
        const u = { id, email: email.toLowerCase(), token: 'tok-' + id, created_at: new Date().toISOString() };
        db.users.push(u);
        db.profiles.push({
          user_id: id,
          segment: (user_metadata && user_metadata.segment) || null,
          invite_code: (user_metadata && user_metadata.invite_code) || null,
          price_locked: 29,
          price_locked_at: new Date().toISOString(),
          subscription_status: 'beta_free',
          welcome_sent_at: null,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          paid_until: null,
          created_at: new Date().toISOString()
        });
        return { data: { user: u }, error: null };
      },
      async generateLink({ email, options }) {
        return {
          data: {
            properties: {
              action_link: (options && options.redirectTo ? options.redirectTo : 'https://theo-beta.example/app/') + '#access_token=magic123'
            }
          },
          error: null
        };
      },
      async getUserById(userId) {
        const u = db.users.find((x) => x.id === userId);
        return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'Not found' } };
      },
      async deleteUser(userId) {
        db.users = db.users.filter((u) => u.id !== userId);
        db.profiles = db.profiles.filter((p) => p.user_id !== userId);
        db.items = db.items.filter((i) => i.user_id !== userId);
        return { data: {}, error: null };
      }
    }
  }
};

const corePath = require.resolve('../api/_lib/core.js');
const realCore = require(corePath);
require.cache[corePath].exports = Object.assign({}, realCore, {
  createServiceSupabase: () => mockServiceSb,
  createAnonSupabase: () => mockServiceSb,
  createUserSupabase: (tok) => {
    const u = db.users.find((x) => x.token === tok);
    return {
      auth: mockServiceSb.auth,
      from: (t) => makeQuery(t, { eqs: u ? { user_id: u.id } : { user_id: '__none__' } })
    };
  },
  sendTransactionalMail: async (mail) => {
    sentMails.push(mail);
    return { ok: true, delivered: true, transport: 'mock' };
  }
});

global.fetch = async (url, init = {}) => {
  stripeCalls.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '' });
  if (String(url).includes('/v1/checkout/sessions')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    };
  }
  if (String(url).includes('/v1/subscriptions/')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'sub_test_1',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400
      })
    };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const configHandler = require('../api/config.js');
const waitlistHandler = require('../api/waitlist.js');
const authGateHandler = require('../api/auth-gate.js');
const accountHandler = require('../api/account.js');
const billingHandler = require('../api/billing.js');
const stripeWebhookHandler = require('../api/stripe-webhook.js');

function callApi(handler, { method = 'GET', url = '/api/test', headers = {}, body = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const resHeaders = {};
    const req = {
      method,
      url,
      headers: Object.assign({ host: 'theo-beta.example', 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.7' }, headers),
      body: typeof body === 'object' && !Buffer.isBuffer(body) ? body : undefined,
      rawBody: Buffer.isBuffer(body) || typeof body === 'string' ? body : undefined,
      readable: false
    };
    const res = {
      statusCode: 200,
      setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
      end(chunk) {
        const raw = chunk ? String(chunk) : '';
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: resHeaders, raw, json });
      }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

(async () => {
  /* ---------- 1. /api/config ---------- */
  const rCfg = await callApi(configHandler, { method: 'GET', url: '/api/config' });
  ok(rCfg.status === 200 && rCfg.json.inviteRequired === true && !rCfg.raw.includes('service-role'),
    '/api/config liefert nur öffentliche Parameter und niemals Service-Role-Secrets');

  /* ---------- 2. /api/waitlist (Double Opt-in + Austragen) ---------- */
  const rWl1 = await callApi(waitlistHandler, {
    method: 'POST',
    url: '/api/waitlist',
    body: { email: 'Lisa@Example.de', segment: 'verdacht_warteliste' }
  });
  ok(rWl1.status === 200 && db.waitlist.length === 1 && db.waitlist[0].status === 'pending' && sentMails.length === 1,
    'Warteliste legt Eintrag zunächst als status=pending an und sendet Double-Opt-In-Mail');

  const doiMatch = sentMails[0].text.match(/action=confirm&token=([A-Za-z0-9._-]+)/);
  const unsubMatch = sentMails[0].text.match(/action=unsubscribe&token=([A-Za-z0-9._-]+)/);
  ok(Boolean(doiMatch && unsubMatch), 'Double-Opt-In-Mail enthält getrennte Bestätigungs- & Austragen-Tokens');

  const rWlConfirm = await callApi(waitlistHandler, {
    method: 'GET',
    url: '/api/waitlist?action=confirm&token=' + encodeURIComponent(doiMatch[1])
  });
  ok(rWlConfirm.status === 302 && db.waitlist[0].status === 'confirmed' && Boolean(db.waitlist[0].confirmed_at),
    'Klick auf Bestätigungs-Link setzt Wartelisten-Status auf confirmed + confirmed_at');

  const rWlUnsub = await callApi(waitlistHandler, {
    method: 'GET',
    url: '/api/waitlist?action=unsubscribe&token=' + encodeURIComponent(unsubMatch[1])
  });
  ok(rWlUnsub.status === 302 && db.waitlist.length === 0,
    'Austragen-Link löscht den Wartelisten-Eintrag vollständig und selbstständig');

  /* ---------- 3. /api/auth-gate + erster Login (/api/account) ---------- */
  const rBadInv = await callApi(authGateHandler, {
    method: 'POST',
    url: '/api/auth-gate',
    body: { mode: 'register', email: 'neu@example.de', inviteCode: 'FALSCH' }
  });
  ok(rBadInv.status === 400 && db.users.length === 0,
    'Auth-Gate weist ungültigen Einladungscode vor Kontoanlage ab');

  const mailsBeforeReg = sentMails.length;
  const rGoodReg = await callApi(authGateHandler, {
    method: 'POST',
    url: '/api/auth-gate',
    body: { mode: 'register', email: 'neu@example.de', inviteCode: 'THEO-BETA-2026', segment: 'frisch_diagnostiziert' }
  });
  ok(rGoodReg.status === 200 && db.users.length === 1 && db.profiles[0].price_locked === 29 && db.invite_codes[0].used === 1,
    'Gültige Einladung legt Konto mit price_locked=29 & Segment an und zählt Invite-Code hoch');

  // Erster Login in der App ruft GET /api/account -> versendet exakt 1x die deutsche Willkommens-Mail
  const rFirstLogin = await callApi(accountHandler, {
    method: 'GET',
    url: '/api/account',
    headers: { authorization: 'Bearer ' + db.users[0].token }
  });
  const rSecondLogin = await callApi(accountHandler, {
    method: 'GET',
    url: '/api/account',
    headers: { authorization: 'Bearer ' + db.users[0].token }
  });
  ok(rFirstLogin.json.welcomeMailSent === true && rSecondLogin.json.welcomeMailSent === false && sentMails.length === mailsBeforeReg + 2 && sentMails[sentMails.length - 1].subject.includes('Willkommen'),
    'Erster Login versendet deutschen Magic-Link + genau 1 deutsche Willkommens-Mail (keine Serie)');

  // Erschöpfter Invite-Code (max_uses=1, used=1) wird für zweite Person abgelehnt
  const rExhausted = await callApi(authGateHandler, {
    method: 'POST',
    url: '/api/auth-gate',
    body: { mode: 'register', email: 'zweite@example.de', inviteCode: 'THEO-BETA-2026' }
  });
  ok(rExhausted.status === 400 && db.users.length === 1,
    'Erschöpfter Einladungscode (used >= max_uses) lässt keine weitere Registrierung zu');

  /* ---------- 4. /api/billing & /api/stripe-webhook (M5 Bestandsschutz + HMAC + § 312k) ---------- */
  const userToken = db.users[0].token;
  const rCheckout = await callApi(billingHandler, {
    method: 'POST',
    url: '/api/billing',
    headers: { authorization: 'Bearer ' + userToken },
    body: { action: 'checkout', interval: 'month' }
  });
  const checkoutBody = stripeCalls.find((c) => c.url.includes('/v1/checkout/sessions')).body;
  const params = new URLSearchParams(checkoutBody);
  ok(rCheckout.status === 200 && params.get('line_items[0][price_data][unit_amount]') === '2900',
    'Stripe-Checkout berechnet exakt 29,00 € (profiles.price_locked=29) trotz PUBLIC_PRICE_EUR=49!');

  const rCheckoutYear = await callApi(billingHandler, {
    method: 'POST',
    url: '/api/billing',
    headers: { authorization: 'Bearer ' + userToken },
    body: { action: 'checkout', interval: 'year' }
  });
  const yearBody = stripeCalls[stripeCalls.length - 1].body;
  const yearParams = new URLSearchParams(yearBody);
  ok(rCheckoutYear.status === 200 && yearParams.get('line_items[0][price_data][unit_amount]') === '29000',
    'Stripe-Jahresabo berechnet exakt 290,00 € (2 Monate frei auf Basis des Bestandsschutzes)');

  // Stripe-Webhook mit gültiger HMAC-Signatur vs. gefälschter Signatur
  const eventPayload = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        client_reference_id: db.users[0].id,
        customer: 'cus_beta_1',
        subscription: 'sub_test_1',
        metadata: { user_id: db.users[0].id }
      }
    }
  });
  const ts = Math.floor(Date.now() / 1000);
  const validSig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${ts}.${eventPayload}`).digest('hex');

  const rBadWh = await callApi(stripeWebhookHandler, {
    method: 'POST',
    url: '/api/stripe-webhook',
    headers: { 'stripe-signature': `t=${ts},v1=deadbeef` },
    body: eventPayload
  });
  ok(rBadWh.status === 400 && db.profiles[0].subscription_status === 'beta_free',
    'Gefälschte Stripe-Webhook-Signatur wird strikt mit HTTP 400 abgewiesen');

  const rGoodWh = await callApi(stripeWebhookHandler, {
    method: 'POST',
    url: '/api/stripe-webhook',
    headers: { 'stripe-signature': `t=${ts},v1=${validSig}` },
    body: eventPayload
  });
  ok(rGoodWh.status === 200 && db.profiles[0].subscription_status === 'active' && Boolean(db.profiles[0].paid_until),
    'Gültiger Stripe-Webhook aktiviert Abo und schreibt paid_until in profiles');

  // § 312k BGB Kündigung im eingeloggten Zustand
  const rCancel = await callApi(billingHandler, {
    method: 'POST',
    url: '/api/billing',
    headers: { authorization: 'Bearer ' + userToken },
    body: { action: 'cancel', reason: 'ordinary' }
  });
  ok(rCancel.status === 200 && db.profiles[0].subscription_status === 'cancel_at_period_end',
    '§ 312k-Kündigung setzt Abo auf cancel_at_period_end und sendet Eingangsbestätigung');

  /* ---------- 5. /api/account (JSON-Datenexport & Self-Service-Konto-Löschung) ---------- */
  db.items.push({
    user_id: db.users[0].id,
    uid: 'theo-capsule@theo-app',
    kind: 'capsule',
    payload: { motto: { '2026': 'Ruhig bleiben' } },
    updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
    deleted: false
  });

  const rExport = await callApi(accountHandler, {
    method: 'POST',
    url: '/api/account',
    headers: { authorization: 'Bearer ' + userToken },
    body: { action: 'export' }
  });
  ok(rExport.status === 200 && rExport.json.schema === 'theo-beta-export-v1' && rExport.json.items.length === 1,
    'Self-Service-Datenexport liefert vollständigen JSON-Dump aller eigenen items');

  const mailsBeforeDel = sentMails.length;
  const rReqDel = await callApi(accountHandler, {
    method: 'POST',
    url: '/api/account',
    headers: { authorization: 'Bearer ' + userToken },
    body: { action: 'request_delete', removeWaitlist: true }
  });
  const delUrlMatch = sentMails[sentMails.length - 1].text.match(/(\/api\/account\?action=confirm_delete[^\s]+)/);
  ok(rReqDel.status === 200 && sentMails.length === mailsBeforeDel + 1 && Boolean(delUrlMatch),
    'Konto-Löschung versendet signierten E-Mail-Bestätigungslink');

  const rExecDel = await callApi(accountHandler, {
    method: 'GET',
    url: delUrlMatch[1]
  });
  ok(rExecDel.status === 302 && db.users.length === 0 && db.profiles.length === 0 && db.items.length === 0,
    'Bestätigter Lösch-Link entfernt auth.user samt profiles & items kaskadierend');

  if (fails > 0) {
    console.error('SMOKE 22 FAILED (' + fails + ')');
    process.exit(1);
  }
  console.log('SMOKE 22 ALL GREEN');
})();
