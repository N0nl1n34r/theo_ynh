'use strict';

const {
  getSiteUrl,
  isInviteRequired,
  isMailerConfigured,
  createAnonSupabase,
  createServiceSupabase,
  sendJson,
  readJsonBody,
  normalizeEmail,
  checkRateLimit,
  sendTransactionalMail,
  buildMagicLinkMail
} = require('./_lib/core');

const VALID_SEGMENTS = new Set([
  'frisch_diagnostiziert',
  'verdacht_warteliste',
  'keine_diagnose',
  'keine_angabe'
]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt.' });
  }

  let service, anon;
  try {
    service = createServiceSupabase();
    anon = createAnonSupabase();
  } catch {
    return sendJson(res, 503, {
      ok: false,
      error: 'Die Anmeldung wird gerade eingerichtet. Bitte versuche es in Kürze erneut.'
    });
  }

  const body = await readJsonBody(req);
  if (!body) {
    return sendJson(res, 400, { ok: false, error: 'Ungültige Anfrage.' });
  }

  const allowed = await checkRateLimit(service, req, 'auth_gate', 600, 8);
  if (!allowed) {
    return sendJson(res, 429, {
      ok: false,
      error: 'Zu viele Anmeldeversuche in kurzer Zeit. Bitte warte ein paar Minuten.'
    });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Bitte gib eine gültige E-Mail-Adresse ein.'
    });
  }

  const mode = body.mode === 'register' ? 'register' : 'login';
  const rawCode = String(body.inviteCode || '').trim().toUpperCase();
  const rawSeg = body.segment ? String(body.segment).trim() : '';
  const segment = VALID_SEGMENTS.has(rawSeg) ? rawSeg : null;

  // Prüfen, ob bereits ein auth.users-Konto existiert
  const { data: foundRows, error: lookupErr } = await service.rpc('find_auth_user_by_email', {
    p_email: email
  });
  if (lookupErr) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Konto-Prüfung fehlgeschlagen. Bitte versuche es gleich noch einmal.'
    });
  }
  const existingUser = Array.isArray(foundRows) && foundRows.length > 0 ? foundRows[0] : null;
  let isNewAccount = false;

  if (mode === 'login') {
    if (!existingUser) {
      return sendJson(res, 404, {
        ok: false,
        code: 'NO_ACCOUNT',
        error: isInviteRequired()
          ? 'Unter dieser E-Mail-Adresse gibt es noch kein Beta-Konto. Wechsle bitte auf „Mit Einladungscode registrieren“.'
          : 'Unter dieser E-Mail-Adresse gibt es noch kein Konto. Bitte wähle zuerst „Neu registrieren“.'
      });
    }
  } else {
    // mode === 'register'
    if (!existingUser) {
      if (isInviteRequired()) {
        if (!rawCode || rawCode.length < 4) {
          return sendJson(res, 400, {
            ok: false,
            code: 'INVITE_REQUIRED',
            error: 'Für die geschlossene Beta wird ein Einladungscode benötigt.'
          });
        }
        const { data: claimed, error: claimErr } = await service.rpc('claim_invite_code', {
          p_code: rawCode
        });
        if (claimErr || !Array.isArray(claimed) || claimed.length === 0) {
          return sendJson(res, 400, {
            ok: false,
            code: 'INVALID_INVITE',
            error: 'Dieser Einladungscode ist nicht gültig oder wurde bereits vollständig eingelöst.'
          });
        }
      }

      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: {
          invite_code: rawCode || null,
          segment
        }
      });

      if (createErr || !created || !created.user) {
        return sendJson(res, 500, {
          ok: false,
          error: 'Dein Konto konnte gerade nicht angelegt werden. Bitte versuche es erneut.'
        });
      }

      // Sicherstellen, dass profiles mit Preis-Bestandsschutz (29 €) sofort existiert
      await service.from('profiles').upsert({
        user_id: created.user.id,
        segment,
        price_locked: 29,
        price_locked_at: new Date().toISOString(),
        invite_code: rawCode || null
      }, { onConflict: 'user_id', ignoreDuplicates: true });

      isNewAccount = true;
    }
  }

  const siteUrl = getSiteUrl(req);
  const redirectTo = `${siteUrl}/app/`;

  // Wenn Brevo/SMTP konfiguriert ist: Link serverseitig erzeugen & auf Deutsch versenden (< 5 s, ohne GoTrue-Free-Drossel)
  if (isMailerConfigured()) {
    const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo }
    });
    const actionLink = linkData && linkData.properties && linkData.properties.action_link;
    if (linkErr || !actionLink) {
      return sendJson(res, 500, {
        ok: false,
        error: 'Der Anmelde-Link konnte gerade nicht erstellt werden. Bitte versuche es gleich noch einmal.'
      });
    }
    try {
      const mail = buildMagicLinkMail({ actionLink, isNewAccount });
      await sendTransactionalMail({ to: email, ...mail });
    } catch {
      return sendJson(res, 502, {
        ok: false,
        error: 'Die E-Mail mit deinem Anmelde-Link konnte gerade nicht zugestellt werden.'
      });
    }
    return sendJson(res, 200, {
      ok: true,
      isNewAccount,
      transport: 'custom_mailer',
      message: isNewAccount
        ? 'Willkommen! Wir haben dir deinen Anmelde-Link per E-Mail geschickt. Ein Klick darauf öffnet direkt dein Theo-Konto.'
        : 'Wir haben dir einen frischen Anmelde-Link geschickt. Schau kurz in dein Postfach.'
    });
  }

  // Fallback: Supabase-eigener Auth-Mailer (z. B. solange Custom SMTP in Supabase/Vercel noch nicht hinterlegt ist)
  const { error: otpErr } = await anon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo
    }
  });

  if (otpErr) {
    const msg = String(otpErr.message || '').toLowerCase();
    const rateLimited = msg.includes('rate') || otpErr.status === 429;
    return sendJson(res, rateLimited ? 429 : 500, {
      ok: false,
      code: rateLimited ? 'RATE_LIMIT' : 'OTP_FAILED',
      error: rateLimited
        ? 'Es wurde gerade erst ein Link angefordert. Bitte schau in dein Postfach oder warte einen kurzen Moment.'
        : 'Der Anmelde-Link konnte noch nicht versendet werden (bitte SMTP-Konfiguration prüfen).'
    });
  }

  return sendJson(res, 200, {
    ok: true,
    isNewAccount,
    transport: 'supabase_auth',
    message: isNewAccount
      ? 'Willkommen! Wir haben dir deinen Anmelde-Link per E-Mail geschickt.'
      : 'Wir haben dir einen Anmelde-Link geschickt. Bitte prüfe dein Postfach (auch den Spam-Ordner).'
  });
};
