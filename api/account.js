'use strict';

const {
  getSiteUrl,
  isMailerConfigured,
  createServiceSupabase,
  createUserSupabase,
  sendJson,
  readJsonBody,
  sha256Hex,
  randomToken,
  sendTransactionalMail,
  buildWelcomeMail,
  buildAccountDeleteMail
} = require('./_lib/core');

function extractBearerToken(req) {
  const raw = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

module.exports = async function handler(req, res) {
  const siteUrl = getSiteUrl(req);
  const urlObj = new URL(req.url || '/api/account', siteUrl);
  const queryAction = urlObj.searchParams.get('action') || '';

  let service;
  try {
    service = createServiceSupabase();
  } catch {
    return sendJson(res, 503, { ok: false, error: 'Kontodienst wird gerade eingerichtet.' });
  }

  // 1) Bestätigungslink zur endgültigen Konto-Löschung (GET /api/account?action=confirm_delete&uid=...&token=...)
  if (req.method === 'GET' && queryAction === 'confirm_delete') {
    const uid = String(urlObj.searchParams.get('uid') || '').trim();
    const rawToken = String(urlObj.searchParams.get('token') || '').trim();
    const removeWaitlist = urlObj.searchParams.get('waitlist') === '1';
    if (!uid || rawToken.length < 16) {
      res.statusCode = 302;
      res.setHeader('Location', `${siteUrl}/app/?account=delete_invalid`);
      return res.end();
    }

    const { data: prof } = await service
      .from('profiles')
      .select('user_id, delete_token_hash, delete_requested_at')
      .eq('user_id', uid)
      .maybeSingle();

    if (!prof || !prof.delete_token_hash || prof.delete_token_hash !== sha256Hex(rawToken)) {
      res.statusCode = 302;
      res.setHeader('Location', `${siteUrl}/app/?account=delete_invalid`);
      return res.end();
    }

    // Maximal 24 Stunden Gültigkeit des Lösch-Links
    const reqTs = prof.delete_requested_at ? new Date(prof.delete_requested_at).getTime() : 0;
    if (!reqTs || Date.now() - reqTs > 24 * 3600 * 1000) {
      res.statusCode = 302;
      res.setHeader('Location', `${siteUrl}/app/?account=delete_expired`);
      return res.end();
    }

    const { data: userInfo } = await service.auth.admin.getUserById(uid);
    const userEmail = userInfo && userInfo.user && userInfo.user.email;
    if (removeWaitlist && userEmail) {
      await service.from('waitlist').delete().eq('email', userEmail.toLowerCase());
    }

    // Löscht auth.users und kaskadiert automatisch über ON DELETE CASCADE auf profiles & items
    const { error: delErr } = await service.auth.admin.deleteUser(uid);
    if (delErr) {
      return sendJson(res, 500, { ok: false, error: 'Konto konnte gerade nicht gelöscht werden.' });
    }

    if (String((req.headers && req.headers.accept) || '').includes('application/json')) {
      return sendJson(res, 200, { ok: true, deleted: true });
    }
    res.statusCode = 302;
    res.setHeader('Location', `${siteUrl}/?account=deleted`);
    return res.end();
  }

  // Alle übrigen Aktionen erfordern ein gültiges Bearer-JWT der angemeldeten Person
  const accessToken = extractBearerToken(req);
  if (!accessToken) {
    return sendJson(res, 401, { ok: false, error: 'Nicht angemeldet.' });
  }

  const userClient = createUserSupabase(accessToken);
  const { data: authData, error: authErr } = await userClient.auth.getUser(accessToken);
  if (authErr || !authData || !authData.user) {
    return sendJson(res, 401, { ok: false, error: 'Sitzung abgelaufen — bitte neu anmelden.' });
  }
  const user = authData.user;

  // Sicherstellen, dass das Profil existiert (inkl. Bestandsschutz price_locked = 29)
  let { data: profile } = await userClient
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile) {
    await service.from('profiles').upsert({
      user_id: user.id,
      price_locked: 29,
      price_locked_at: new Date().toISOString()
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    const reread = await userClient.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    profile = reread.data;
  }

  // 2) GET /api/account -> Profilstatus + einmalige Willkommens-Mail beim allerersten Login (M2)
  if (req.method === 'GET') {
    let welcomeMailSent = false;
    if (profile && !profile.welcome_sent_at && user.email) {
      const nowIso = new Date().toISOString();
      if (isMailerConfigured()) {
        try {
          const mail = buildWelcomeMail({ appUrl: `${siteUrl}/app/` });
          const resMail = await sendTransactionalMail({ to: user.email, ...mail });
          welcomeMailSent = Boolean(resMail && resMail.delivered);
          if (welcomeMailSent) {
            await service
              .from('profiles')
              .update({ welcome_sent_at: nowIso })
              .eq('user_id', user.id);
            profile.welcome_sent_at = nowIso;
          }
        } catch {}
      }
    }

    return sendJson(res, 200, {
      ok: true,
      user: { id: user.id, email: user.email },
      welcomeMailSent,
      profile: profile ? {
        segment: profile.segment || null,
        price_locked: Number(profile.price_locked || 29),
        price_locked_at: profile.price_locked_at,
        onboarding_done: Boolean(profile.onboarding_done),
        plan_interval: profile.plan_interval || null,
        subscription_status: profile.subscription_status || 'beta_free',
        paid_until: profile.paid_until || null,
        cancel_at_period_end: Boolean(profile.cancel_at_period_end),
        withdrawal_until: profile.withdrawal_until || null
      } : null
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt.' });
  }

  const body = await readJsonBody(req);
  if (!body) {
    return sendJson(res, 400, { ok: false, error: 'Ungültige Anfrage.' });
  }

  // 3) Vollständiger JSON-Datenexport des eigenen items-Bestands (M4, strikt über RLS userClient)
  if (body.action === 'export') {
    const { data: items, error: itemsErr } = await userClient
      .from('items')
      .select('uid, kind, payload, updated_at, deleted')
      .order('kind', { ascending: true })
      .order('uid', { ascending: true });

    if (itemsErr) {
      return sendJson(res, 500, { ok: false, error: 'Datenexport konnte nicht gelesen werden.' });
    }

    const { data: feedback, error: feedbackErr } = await userClient
      .from('app_feedback')
      .select('id, category, message, page, created_at')
      .order('created_at', { ascending: true });
    if (feedbackErr) {
      return sendJson(res, 500, { ok: false, error: 'Feedback für den Datenexport konnte nicht gelesen werden.' });
    }

    const exportBundle = {
      schema: 'theo-beta-export-v1',
      exported_at: new Date().toISOString(),
      account: {
        email: user.email,
        price_locked_eur_month: profile ? Number(profile.price_locked || 29) : 29,
        price_locked_at: profile ? profile.price_locked_at : null,
        segment: profile ? profile.segment : null
      },
      items_count: (items || []).filter((i) => !i.deleted).length,
      items: items || [],
      feedback: feedback || []
    };

    res.setHeader('Content-Disposition', `attachment; filename="theo-datenexport-${new Date().toISOString().slice(0, 10)}.json"`);
    return sendJson(res, 200, exportBundle);
  }

  // 4) Onboarding als erledigt markieren / Segment anpassen
  if (body.action === 'update_prefs') {
    const patch = {};
    if (typeof body.onboarding_done === 'boolean') patch.onboarding_done = body.onboarding_done;
    if (body.segment !== undefined) {
      patch.segment = body.segment ? String(body.segment).slice(0, 120) : null;
    }
    const { error: upErr } = await userClient
      .from('profiles')
      .update(patch)
      .eq('user_id', user.id);
    if (upErr) {
      return sendJson(res, 500, { ok: false, error: 'Einstellung konnte nicht gespeichert werden.' });
    }
    return sendJson(res, 200, { ok: true });
  }

  // 5) Konto-Löschung anfordern (M4: Bestätigungslink per E-Mail; falls kein Mailer aktiv, mit explizitem Bestätigungswort möglich)
  if (body.action === 'request_delete') {
    const removeWaitlist = Boolean(body.removeWaitlist);
    const rawToken = randomToken(24);
    const { error: tokErr } = await service
      .from('profiles')
      .update({
        delete_token_hash: sha256Hex(rawToken),
        delete_requested_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (tokErr) {
      return sendJson(res, 500, { ok: false, error: 'Lösch-Anfrage konnte nicht vorbereitet werden.' });
    }

    const confirmUrl = `${siteUrl}/api/account?action=confirm_delete&uid=${encodeURIComponent(user.id)}&token=${encodeURIComponent(rawToken)}${removeWaitlist ? '&waitlist=1' : ''}`;

    if (isMailerConfigured() && user.email) {
      try {
        const mail = buildAccountDeleteMail({ confirmUrl });
        await sendTransactionalMail({ to: user.email, ...mail });
        return sendJson(res, 200, {
          ok: true,
          step: 'email_sent',
          message: 'Wir haben dir eine E-Mail zur Bestätigung geschickt. Erst nach Klick auf den Link wird dein Konto samt allen Daten endgültig gelöscht.'
        });
      } catch {
        return sendJson(res, 502, {
          ok: false,
          error: 'Die Bestätigungs-E-Mail konnte gerade nicht versendet werden.'
        });
      }
    }

    // Falls noch kein externer Mail-Dienst hinterlegt ist, erlauben wir bei expliziter Phrase „KONTO LÖSCHEN“ die direkte Ausführung
    if (String(body.confirmPhrase || '').trim().toUpperCase() === 'KONTO LÖSCHEN') {
      if (removeWaitlist && user.email) {
        await service.from('waitlist').delete().eq('email', user.email.toLowerCase());
      }
      const { error: delNowErr } = await service.auth.admin.deleteUser(user.id);
      if (delNowErr) {
        return sendJson(res, 500, { ok: false, error: 'Konto konnte nicht gelöscht werden.' });
      }
      return sendJson(res, 200, {
        ok: true,
        step: 'deleted_now',
        message: 'Dein Konto und alle zugehörigen Daten wurden vollständig gelöscht.'
      });
    }

    return sendJson(res, 200, {
      ok: true,
      step: 'phrase_required',
      message: 'Da aktuell noch kein SMTP-Versand aktiv ist, gib zur Sicherheitsbestätigung bitte exakt KONTO LÖSCHEN ein.'
    });
  }

  return sendJson(res, 400, { ok: false, error: 'Unbekannte Aktion.' });
};
