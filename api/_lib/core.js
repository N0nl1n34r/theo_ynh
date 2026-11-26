'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const tls = require('node:tls');
const { createClient } = require('@supabase/supabase-js');

function getEnv(name, fallback = '') {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : fallback;
}

function getSiteUrl(req) {
  const explicit = getEnv('NEXT_PUBLIC_SITE_URL');
  if (explicit) return explicit.replace(/\/+$/, '');
  const proto = (req && req.headers && (req.headers['x-forwarded-proto'] || 'https')) || 'https';
  const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'localhost:3000';
  return `${String(proto).split(',')[0].trim()}://${String(host).split(',')[0].trim()}`;
}

function isInviteRequired() {
  const raw = getEnv('INVITE_REQUIRED', 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function isStripeConfigured() {
  return Boolean(getEnv('STRIPE_SECRET_KEY'));
}

function isMailerConfigured() {
  return Boolean(getEnv('BREVO_API_KEY') || (getEnv('SMTP_HOST') && getEnv('SMTP_USER') && getEnv('SMTP_PASS')));
}

function createAnonSupabase() {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL oder SUPABASE_ANON_KEY fehlt');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function createServiceSupabase() {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function createUserSupabase(accessToken) {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL oder SUPABASE_ANON_KEY fehlt');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
}

function sendJson(res, status, data) {
  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, html) {
  setSecurityHeaders(res);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = status;
  res.end(html);
}

async function readRawBody(req) {
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody, 'utf8');
  }
  if (req.body && (typeof req.body === 'string' || Buffer.isBuffer(req.body))) {
    return Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body, 'utf8');
  }
  if (req.body && typeof req.body === 'object' && !req.readable) {
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Anfrage zu groß'));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await readRawBody(req);
  if (!raw || !raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.length < 5 || s.length > 254) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return '';
  return s;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function clientHashKey(req, scope) {
  const xff = (req && req.headers && req.headers['x-forwarded-for']) || '';
  const ip = String(xff).split(',')[0].trim() || (req && req.socket && req.socket.remoteAddress) || 'local';
  const salt = getEnv('RATE_LIMIT_SALT', 'theo-beta-eu-salt');
  return `${scope}:${sha256Hex(`${ip}|${salt}`).slice(0, 32)}`;
}

async function checkRateLimit(serviceClient, req, scope, windowSeconds = 600, maxHits = 8) {
  try {
    const key = clientHashKey(req, scope);
    const { data, error } = await serviceClient.rpc('check_rate_limit', {
      p_bucket_key: key,
      p_window_seconds: windowSeconds,
      p_max_hits: maxHits
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

function parseFromHeader(rawFrom) {
  const str = rawFrom || 'Theo <hallo@theo-app.de>';
  const m = str.match(/^(.*?)<([^>]+)>\s*$/);
  if (m) {
    return {
      name: m[1].trim().replace(/^"|"$/g, '') || 'Theo',
      email: m[2].trim()
    };
  }
  return { name: 'Theo', email: str.trim() };
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

async function sendViaBrevo({ to, subject, html, text }) {
  const apiKey = getEnv('BREVO_API_KEY');
  const sender = parseFromHeader(getEnv('MAIL_FROM', 'Theo <hallo@theo-app.de>'));
  const replyToEmail = getEnv('MAIL_REPLY_TO', sender.email);
  const fetchFn = globalThis.__THEO_MAIL_FETCH__ || globalThis.fetch;
  const resp = await fetchFn('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      replyTo: replyToEmail ? { email: replyToEmail } : undefined,
      subject,
      htmlContent: html,
      textContent: text
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Brevo-Versand fehlgeschlagen (${resp.status}): ${errText.slice(0, 180)}`);
  }
  return { delivered: true, transport: 'brevo' };
}

async function sendViaSmtp({ to, subject, html, text }) {
  const host = getEnv('SMTP_HOST');
  const port = Number(getEnv('SMTP_PORT', '587')) || 587;
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');
  const sender = parseFromHeader(getEnv('MAIL_FROM', `Theo <${user}>`));
  const boundary = `theo_${randomToken(12)}`;
  const msg = [
    `From: "${sender.name.replace(/"/g, '')}" <${sender.email}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomToken(12)}@${sender.email.split('@')[1] || 'theo.local'}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
    ''
  ].join('\r\n');

  const sendOverSocket = () => new Promise((resolve, reject) => {
    let sock = port === 465
      ? tls.connect({ host, port, servername: host })
      : net.createConnection({ host, port });
    let buf = '';
    let waiter = null;
    const timeout = setTimeout(() => {
      sock.destroy();
      reject(new Error('SMTP-Zeitüberschreitung'));
    }, 15000);

    function onData(chunk) {
      buf += chunk.toString('utf8');
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (/^\d{3} /.test(line) && waiter) {
          const fn = waiter;
          waiter = null;
          buf = lines.slice(i + 1).join('\r\n');
          fn(line);
          return;
        }
      }
    }

    function cmd(line) {
      return new Promise((resCmd, rejCmd) => {
        waiter = (reply) => {
          const code = Number(reply.slice(0, 3));
          if (code >= 400) rejCmd(new Error(`SMTP ${reply}`));
          else resCmd(reply);
        };
        if (line !== null) sock.write(`${line}\r\n`);
      });
    }

    sock.on('data', onData);
    sock.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    (async () => {
      try {
        await cmd(null);
        await cmd(`EHLO theo-app.local`);
        if (port !== 465) {
          await cmd('STARTTLS');
          sock.removeListener('data', onData);
          sock = tls.connect({ socket: sock, servername: host });
          sock.on('data', onData);
          await cmd('EHLO theo-app.local');
        }
        await cmd('AUTH LOGIN');
        await cmd(Buffer.from(user, 'utf8').toString('base64'));
        await cmd(Buffer.from(pass, 'utf8').toString('base64'));
        await cmd(`MAIL FROM:<${sender.email}>`);
        await cmd(`RCPT TO:<${to}>`);
        await cmd('DATA');
        await cmd(`${msg.replace(/\r\n\./g, '\r\n..')}\r\n.`);
        await cmd('QUIT').catch(() => {});
        clearTimeout(timeout);
        sock.end();
        resolve({ delivered: true, transport: 'smtp' });
      } catch (e) {
        clearTimeout(timeout);
        sock.destroy();
        reject(e);
      }
    })();
  });

  return await sendOverSocket();
}

async function sendTransactionalMail({ to, subject, html, text }) {
  if (typeof globalThis.__THEO_SEND_MAIL__ === 'function') {
    return await globalThis.__THEO_SEND_MAIL__({ to, subject, html, text });
  }
  if (getEnv('BREVO_API_KEY')) {
    return await sendViaBrevo({ to, subject, html, text });
  }
  if (getEnv('SMTP_HOST') && getEnv('SMTP_USER') && getEnv('SMTP_PASS')) {
    return await sendViaSmtp({ to, subject, html, text });
  }
  return { delivered: false, transport: 'unconfigured' };
}

function wrapCalmMail({ preheader, heading, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#FBF9F2;color:#2E2A25;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escHtml(preheader || heading)}</div>
  <div style="max-width:540px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E2D5;border-radius:16px;padding:28px 26px;">
    <div style="font-size:13px;color:#7A7267;letter-spacing:.04em;margin-bottom:10px;">🐣 Theo · Ruhige Alltagsplanung</div>
    <h1 style="font-size:21px;line-height:1.35;margin:0 0 14px;color:#2E2A25;font-weight:650;">${escHtml(heading)}</h1>
    <div style="font-size:15px;color:#3E3932;">${bodyHtml}</div>
    ${ctaLabel && ctaUrl ? `
      <div style="margin:24px 0 20px;">
        <a href="${escHtml(ctaUrl)}" style="display:inline-block;background:#5E7A64;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px;">${escHtml(ctaLabel)}</a>
      </div>
      <p style="font-size:12px;color:#7A7267;word-break:break-all;margin:0 0 14px;">Falls der Knopf sich nicht öffnet, kopiere diesen Link in deinen Browser:<br>${escHtml(ctaUrl)}</p>
    ` : ''}
    <hr style="border:none;border-top:1px solid #EFEAE0;margin:22px 0 14px;">
    <p style="font-size:12px;color:#7A7267;margin:0;">
      ${footerNote || 'Theo ist ein Werkzeug zur persönlichen Selbstorganisation und ersetzt keine ärztliche oder psychotherapeutische Diagnose oder Behandlung.'}
    </p>
  </div>
</body>
</html>`;
}

function buildWaitlistConfirmMail({ confirmUrl, unsubscribeUrl }) {
  const subject = 'Bitte bestätige deinen Platz auf der Theo-Warteliste';
  const html = wrapCalmMail({
    preheader: 'Ein Klick genügt — danach melden wir uns erst wieder, wenn dein Beta-Platz frei ist.',
    heading: 'Schön, dass du da bist — bitte kurz bestätigen',
    bodyHtml: `<p>Du hast dich für die Warteliste von <b>Theo</b> eingetragen.</p>
      <p>Mit einem Klick auf den Knopf bestätigst du deine Adresse (Double Opt-in). Danach schicken wir dir keine Werbeflut, sondern melden uns ruhig, sobald neue Einladungen für die Beta bereitstehen.</p>`,
    ctaLabel: 'Wartelisten-Platz bestätigen',
    ctaUrl: confirmUrl,
    footerNote: `Falls du dich nicht selbst eingetragen hast, ignoriere diese Nachricht einfach — ohne Klick wird nichts aktiviert. Austragen jederzeit über: ${escHtml(unsubscribeUrl)}`
  });
  const text = [
    'Schön, dass du da bist — bitte bestätige kurz deine E-Mail-Adresse für die Theo-Warteliste:',
    '',
    confirmUrl,
    '',
    'Falls du dich nicht eingetragen hast, kannst du diese E-Mail einfach ignorieren.',
    `Jederzeit austragen: ${unsubscribeUrl}`
  ].join('\n');
  return { subject, html, text };
}

function buildMagicLinkMail({ actionLink, isNewAccount }) {
  const subject = isNewAccount ? 'Dein Anmelde-Link für Theo (Beta)' : 'Dein Anmelde-Link für Theo';
  const html = wrapCalmMail({
    preheader: 'Ein Klick meldet dich ohne Passwort bei Theo an.',
    heading: isNewAccount ? 'Willkommen in der Theo-Beta' : 'Hier ist dein Anmelde-Link',
    bodyHtml: `<p>${isNewAccount
      ? 'Deine Einladung wurde eingelöst und dein persönlicher Bestandsschutz (29 €/Monat bzw. 290 €/Jahr) ist fest in deinem Konto hinterlegt.'
      : 'Mit diesem Link meldest du dich direkt und ohne Passwort in Theo an.'}</p>
      <p>Der Link ist aus Sicherheitsgründen zeitlich begrenzt und gilt für eine einmalige Anmeldung.</p>`,
    ctaLabel: 'Jetzt bei Theo anmelden',
    ctaUrl: actionLink
  });
  const text = [
    isNewAccount ? 'Willkommen in der Theo-Beta!' : 'Hier ist dein Anmelde-Link für Theo:',
    '',
    actionLink,
    '',
    'Der Link ist zeitlich begrenzt und gilt für eine einmalige Anmeldung.'
  ].join('\n');
  return { subject, html, text };
}

function buildWelcomeMail({ appUrl }) {
  const subject = 'Willkommen bei Theo — deine ersten 5 ruhigen Minuten';
  const html = wrapCalmMail({
    preheader: 'Drei kleine Schritte für einen entspannten Start ohne Druck.',
    heading: 'Willkommen bei Theo',
    bodyHtml: `<p>Schön, dass du in der Beta dabei bist. Theo kennt keine Streaks, keine roten Überfällig-Zähler und keinen Leistungsdruck.</p>
      <p><b>Wenn du magst, starte ganz klein in 3 Schritten:</b></p>
      <ol style="padding-left:20px;margin:10px 0 14px;">
        <li><b>Eingangskiste leeren:</b> Schreib alles, was gerade im Kopf kreist, ungefiltert in die Eingangskiste.</li>
        <li><b>Woche grob spüren:</b> Leg 2–3 realistische Blöcke (Vormittag, Mittag &amp; Nachmittag, Abend) an — und lass bewusst Luft dazwischen.</li>
        <li><b>Auf dem Handy ablegen:</b> Öffne Theo im mobilen Browser und wähle „Zum Home-Bildschirm hinzufügen“, damit deine Planung auch offline griffbereit ist.</li>
      </ol>
      <p>Dein Preis-Bestandsschutz (<b>29 €/Monat</b> bzw. <b>290 €/Jahr</b>) ist dauerhaft in deinem Konto verankert.</p>`,
    ctaLabel: 'Theo öffnen',
    ctaUrl: appUrl
  });
  const text = [
    'Willkommen bei Theo!',
    '',
    'Theo kennt keine Streaks und keine Schuldmarker. Drei ruhige Schritte für den Start:',
    '1. Gedanken ungefiltert in die Eingangskiste werfen.',
    '2. Zwei bis drei realistische Wochen-Blöcke setzen — mit Luft dazwischen.',
    '3. Auf dem Smartphone über „Zum Home-Bildschirm“ als App installieren (funktioniert auch offline).',
    '',
    `Hier geht es zur App: ${appUrl}`
  ].join('\n');
  return { subject, html, text };
}

function buildAccountDeleteMail({ confirmUrl }) {
  const subject = 'Konto-Löschung bei Theo bestätigen';
  const html = wrapCalmMail({
    preheader: 'Bitte bestätige, falls dein Theo-Konto samt allen Planungsdaten endgültig gelöscht werden soll.',
    heading: 'Möchtest du dein Theo-Konto endgültig löschen?',
    bodyHtml: `<p>Für dein Konto wurde die vollständige Löschung angefordert.</p>
      <p>Wenn du auf den Knopf klickst, werden dein Zugang, dein Profil und alle gespeicherten Blöcke, Termine, Phasen und Aufgaben unwiderruflich aus unserer Datenbank in Frankfurt entfernt.</p>`,
    ctaLabel: 'Konto & Daten endgültig löschen',
    ctaUrl: confirmUrl,
    footerNote: 'Falls du diese Anfrage nicht ausgelöst hast, klicke nicht auf den Link — dein Konto bleibt dann unverändert bestehen.'
  });
  const text = [
    'Für dein Theo-Konto wurde die endgültige Löschung angefordert.',
    'Mit diesem Link werden dein Konto und alle Planungsdaten unwiderruflich gelöscht:',
    '',
    confirmUrl,
    '',
    'Falls du das nicht warst, ignoriere diese Nachricht einfach.'
  ].join('\n');
  return { subject, html, text };
}

function buildCancelConfirmationMail({ email, effectiveDateStr, immediateWithdrawal }) {
  const subject = immediateWithdrawal ? 'Bestätigung deines Widerrufs bei Theo' : 'Kündigungsbestätigung deines Theo-Abos';
  const html = wrapCalmMail({
    preheader: 'Hiermit bestätigen wir den Eingang deiner Erklärung gemäß § 312k BGB.',
    heading: immediateWithdrawal ? 'Dein Widerruf ist eingegangen' : 'Deine Kündigung ist bestätigt',
    bodyHtml: `<p>Wir bestätigen dir hiermit den Eingang deiner ${immediateWithdrawal ? 'Widerrufserklärung' : 'Kündigung'} für das Konto <b>${escHtml(email)}</b> am ${escHtml(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }))}.</p>
      <p>${immediateWithdrawal
        ? 'Dein Vertrag wurde im Rahmen der 14-tägigen Widerrufsfrist mit sofortiger Wirkung beendet.'
        : `Dein Abonnement endet zum <b>${escHtml(effectiveDateStr || 'Ende des laufenden Abrechnungszeitraums')}</b>; es erfolgen danach keine weiteren Abbuchungen.`}</p>
      <p>Deine Daten kannst du jederzeit unter <i>Konfig → Konto &amp; Datenexport</i> als JSON-Datei herunterladen.</p>`
  });
  const text = [
    immediateWithdrawal ? 'Bestätigung deines Widerrufs bei Theo' : 'Kündigungsbestätigung deines Theo-Abos',
    `Konto: ${email}`,
    `Zeitpunkt: ${new Date().toISOString()}`,
    immediateWithdrawal
      ? 'Beendigung: sofort im Rahmen des 14-tägigen Widerrufsrechts.'
      : `Beendigung zum: ${effectiveDateStr || 'Ende des laufenden Abrechnungszeitraums'}`
  ].join('\n');
  return { subject, html, text };
}

function verifyStripeSignature(rawBuffer, sigHeader, secret, toleranceSec = 300) {
  if (!sigHeader || !secret) return false;
  const parts = String(sigHeader).split(',');
  let timestamp = '';
  const signatures = [];
  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === 't') timestamp = v;
    if (k === 'v1' && v) signatures.push(v);
  }
  if (!timestamp || !signatures.length) return false;
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > toleranceSec) return false;

  const signedPayload = `${timestamp}.${rawBuffer.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  const expBuf = Buffer.from(expected, 'hex');
  for (const sig of signatures) {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        return true;
      }
    } catch {}
  }
  return false;
}

module.exports = {
  getEnv,
  getSiteUrl,
  isInviteRequired,
  isStripeConfigured,
  isMailerConfigured,
  createAnonSupabase,
  createServiceSupabase,
  createUserSupabase,
  sendJson,
  sendHtml,
  readRawBody,
  readJsonBody,
  normalizeEmail,
  sha256Hex,
  randomToken,
  escHtml,
  checkRateLimit,
  sendTransactionalMail,
  buildWaitlistConfirmMail,
  buildMagicLinkMail,
  buildWelcomeMail,
  buildAccountDeleteMail,
  buildCancelConfirmationMail,
  verifyStripeSignature
};
