'use strict';

const {
  getSiteUrl,
  createServiceSupabase,
  sendJson,
  sendHtml,
  readJsonBody,
  normalizeEmail,
  sha256Hex,
  randomToken,
  checkRateLimit,
  sendTransactionalMail,
  buildWaitlistConfirmMail
} = require('./_lib/core');

const VALID_SEGMENTS = new Set([
  'frisch_diagnostiziert',
  'verdacht_warteliste',
  'keine_diagnose',
  'keine_angabe'
]);

function wantsJson(req) {
  const acc = String((req.headers && req.headers.accept) || '');
  return acc.includes('application/json') && !acc.includes('text/html');
}

module.exports = async function handler(req, res) {
  const siteUrl = getSiteUrl(req);
  const urlObj = new URL(req.url || '/api/waitlist', siteUrl);
  const action = urlObj.searchParams.get('action') || '';

  let service;
  try {
    service = createServiceSupabase();
  } catch {
    return sendJson(res, 503, {
      ok: false,
      error: 'Die Warteliste wird gerade eingerichtet. Bitte versuche es in Kürze erneut.'
    });
  }

  // 1) Double-Opt-in-Bestätigung per Link
  if (req.method === 'GET' && action === 'confirm') {
    const rawToken = String(urlObj.searchParams.get('token') || '').trim();
    if (!rawToken || rawToken.length < 16) {
      if (wantsJson(req)) return sendJson(res, 400, { ok: false, error: 'Ungültiger Bestätigungslink.' });
      res.statusCode = 302;
      res.setHeader('Location', `${siteUrl}/?waitlist=invalid#warteliste`);
      return res.end();
    }
    const tokenHash = sha256Hex(rawToken);
    const { data: rows, error } = await service
      .from('waitlist')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        token: null,
        updated_at: new Date().toISOString()
      })
      .eq('token', tokenHash)
      .select('id, email, status');

    if (error || !rows || !rows.length) {
      if (wantsJson(req)) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Dieser Bestätigungslink wurde bereits verwendet oder ist abgelaufen.'
        });
      }
      res.statusCode = 302;
      res.setHeader('Location', `${siteUrl}/?waitlist=expired#warteliste`);
      return res.end();
    }

    if (wantsJson(req)) {
      return sendJson(res, 200, { ok: true, status: 'confirmed' });
    }
    res.statusCode = 302;
    res.setHeader('Location', `${siteUrl}/?waitlist=confirmed#warteliste`);
    return res.end();
  }

  // 2) Selbstständiges Austragen / Löschen aus der Warteliste (M4)
  if ((req.method === 'GET' || req.method === 'POST') && action === 'unsubscribe') {
    const rawToken = String(urlObj.searchParams.get('token') || '').trim();
    if (!rawToken || rawToken.length < 16) {
      return sendJson(res, 400, { ok: false, error: 'Ungültiger Austragungslink.' });
    }
    const unsubHash = sha256Hex(rawToken);
    const { data: deletedRows } = await service
      .from('waitlist')
      .delete()
      .eq('unsubscribe_token', unsubHash)
      .select('id');

    const removed = Boolean(deletedRows && deletedRows.length);
    if (wantsJson(req)) {
      return sendJson(res, 200, { ok: true, removed });
    }
    if (req.method === 'GET') {
      res.statusCode = 302;
      res.setHeader('Location', `${siteUrl}/?waitlist=removed#warteliste`);
      return res.end();
    }
    return sendHtml(res, 200, '<p>Deine Adresse wurde aus der Warteliste gelöscht.</p>');
  }

  // 3) Neue Wartelisten-Eintragung (POST)
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt.' });
  }

  const body = await readJsonBody(req);
  if (!body) {
    return sendJson(res, 400, { ok: false, error: 'Ungültige Anfrage.' });
  }

  // Stilles Honeypot-Feld gegen Spam-Bots
  if (body.website || body.hp) {
    return sendJson(res, 200, {
      ok: true,
      message: 'Fast geschafft — bitte bestätige noch kurz den Link in deinem Postfach.'
    });
  }

  const allowed = await checkRateLimit(service, req, 'waitlist', 600, 6);
  if (!allowed) {
    return sendJson(res, 429, {
      ok: false,
      error: 'Zu viele Anfragen in kurzer Zeit. Bitte warte ein paar Minuten und versuche es dann in Ruhe erneut.'
    });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Bitte gib eine gültige E-Mail-Adresse ein.'
    });
  }

  const rawSegment = body.segment ? String(body.segment).trim() : null;
  const segment = rawSegment && VALID_SEGMENTS.has(rawSegment) ? rawSegment : null;

  const { data: existing } = await service
    .from('waitlist')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();

  if (existing && existing.status === 'confirmed') {
    return sendJson(res, 200, {
      ok: true,
      alreadyConfirmed: true,
      message: 'Du stehst bereits bestätigt auf der Warteliste — wir melden uns, sobald dein Platz frei wird.'
    });
  }

  const rawConfirmToken = randomToken(24);
  const rawUnsubToken = randomToken(24);
  const payload = {
    email,
    segment,
    status: 'pending',
    token: sha256Hex(rawConfirmToken),
    unsubscribe_token: sha256Hex(rawUnsubToken),
    confirmed_at: null,
    updated_at: new Date().toISOString()
  };

  const { error: upsertErr } = await service
    .from('waitlist')
    .upsert(payload, { onConflict: 'email' });

  if (upsertErr) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Die Eintragung konnte gerade nicht gespeichert werden. Bitte versuche es gleich noch einmal.'
    });
  }

  const confirmUrl = `${siteUrl}/api/waitlist?action=confirm&token=${encodeURIComponent(rawConfirmToken)}`;
  const unsubscribeUrl = `${siteUrl}/api/waitlist?action=unsubscribe&token=${encodeURIComponent(rawUnsubToken)}`;

  let mailResult = { delivered: false, transport: 'unconfigured' };
  try {
    const mail = buildWaitlistConfirmMail({ confirmUrl, unsubscribeUrl });
    mailResult = await sendTransactionalMail({ to: email, ...mail });
  } catch {
    return sendJson(res, 502, {
      ok: false,
      error: 'Dein Platz wurde vorgemerkt, aber die Bestätigungs-E-Mail konnte gerade nicht versendet werden. Bitte versuche es später erneut.'
    });
  }

  return sendJson(res, 200, {
    ok: true,
    mailDelivered: mailResult.delivered,
    message: mailResult.delivered
      ? 'Fast geschafft: Wir haben dir gerade eine E-Mail geschickt. Bitte klicke darin kurz auf den Bestätigungslink (Double Opt-in).'
      : 'Deine Vormerkung ist gespeichert. Sobald der E-Mail-Versand freigeschaltet ist, erhältst du deinen Bestätigungslink.'
  });
};
