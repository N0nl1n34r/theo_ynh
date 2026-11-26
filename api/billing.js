'use strict';

const {
  getEnv,
  getSiteUrl,
  isStripeConfigured,
  isMailerConfigured,
  createServiceSupabase,
  createUserSupabase,
  sendJson,
  readJsonBody,
  normalizeEmail,
  checkRateLimit,
  sendTransactionalMail,
  buildCancelConfirmationMail
} = require('./_lib/core');

function extractBearerToken(req) {
  const raw = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function stripeRequest(path, method, formParams) {
  const key = getEnv('STRIPE_SECRET_KEY');
  const fetchFn = globalThis.__THEO_STRIPE_FETCH__ || globalThis.fetch;
  const body = formParams ? new URLSearchParams(formParams).toString() : undefined;
  const resp = await fetchFn(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((json && json.error && json.error.message) || `Stripe-Fehler (${resp.status})`);
  }
  return json;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt.' });
  }

  let service;
  try {
    service = createServiceSupabase();
  } catch {
    return sendJson(res, 503, { ok: false, error: 'Abrechnungsdienst wird gerade eingerichtet.' });
  }

  const body = await readJsonBody(req);
  if (!body) {
    return sendJson(res, 400, { ok: false, error: 'Ungültige Anfrage.' });
  }

  const siteUrl = getSiteUrl(req);

  // ==========================================================================
  // A) § 312k BGB Kündigungsbutton / Widerruf (auch ohne Login über /agb#kuendigung erreichbar,
  //    oder direkt eingeloggt aus dem Konto-Bereich)
  // ==========================================================================
  if (body.action === 'cancel') {
    const allowed = await checkRateLimit(service, req, 'billing_cancel', 600, 6);
    if (!allowed) {
      return sendJson(res, 429, { ok: false, error: 'Bitte warte einen kurzen Moment vor dem nächsten Versuch.' });
    }

    let targetUserId = null;
    let targetEmail = '';
    const token = extractBearerToken(req);
    if (token) {
      const userClient = createUserSupabase(token);
      const { data: authData } = await userClient.auth.getUser(token);
      if (authData && authData.user) {
        targetUserId = authData.user.id;
        targetEmail = authData.user.email || '';
      }
    }

    if (!targetUserId) {
      // Öffentlicher 2-Stufen-Kündigungsweg gemäß § 312k BGB anhand der Konto-E-Mail
      const formEmail = normalizeEmail(body.email);
      if (!formEmail) {
        return sendJson(res, 400, { ok: false, error: 'Bitte gib die E-Mail-Adresse deines Theo-Kontos an.' });
      }
      const { data: rows } = await service.rpc('find_auth_user_by_email', { p_email: formEmail });
      const found = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      targetEmail = formEmail;
      if (found) targetUserId = found.id;
    }

    const now = new Date();
    let effectiveDateStr = 'Ende des laufenden Abrechnungszeitraums';
    let immediateWithdrawal = false;

    if (targetUserId) {
      const { data: prof } = await service
        .from('profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (prof) {
        const withinWithdrawal = Boolean(
          body.reason === 'withdrawal' &&
          prof.withdrawal_until &&
          new Date(prof.withdrawal_until).getTime() >= now.getTime()
        );
        immediateWithdrawal = withinWithdrawal;

        if (prof.stripe_subscription_id && isStripeConfigured()) {
          if (withinWithdrawal) {
            await stripeRequest(`/subscriptions/${encodeURIComponent(prof.stripe_subscription_id)}`, 'DELETE');
          } else {
            const sub = await stripeRequest(`/subscriptions/${encodeURIComponent(prof.stripe_subscription_id)}`, 'POST', {
              cancel_at_period_end: 'true'
            });
            if (sub && sub.current_period_end) {
              effectiveDateStr = new Date(sub.current_period_end * 1000).toLocaleDateString('de-DE');
            }
          }
        } else if (prof.paid_until) {
          effectiveDateStr = new Date(prof.paid_until).toLocaleDateString('de-DE');
        }

        await service
          .from('profiles')
          .update({
            cancel_at_period_end: !withinWithdrawal,
            canceled_at: now.toISOString(),
            subscription_status: withinWithdrawal ? 'canceled' : (prof.subscription_status === 'active' ? 'cancel_at_period_end' : prof.subscription_status),
            ...(withinWithdrawal ? { paid_until: now.toISOString() } : {})
          })
          .eq('user_id', targetUserId);
      }
    }

    if (targetEmail && isMailerConfigured()) {
      try {
        const mail = buildCancelConfirmationMail({
          email: targetEmail,
          effectiveDateStr,
          immediateWithdrawal
        });
        await sendTransactionalMail({ to: targetEmail, ...mail });
      } catch {}
    }

    return sendJson(res, 200, {
      ok: true,
      confirmedAt: now.toISOString(),
      immediateWithdrawal,
      effectiveDateStr,
      message: immediateWithdrawal
        ? 'Dein Widerruf wurde sofort wirksam vermerkt. Eine Bestätigung geht an deine E-Mail-Adresse.'
        : `Deine Kündigung ist eingegangen und zum ${effectiveDateStr} vorgemerkt.`
    });
  }

  // ==========================================================================
  // B) Stripe Checkout starten (M5: 29 €/Monat oder 290 €/Jahr mit Bestandsschutz)
  // ==========================================================================
  if (body.action === 'checkout') {
    const token = extractBearerToken(req);
    if (!token) {
      return sendJson(res, 401, { ok: false, error: 'Bitte melde dich zuerst in deinem Theo-Konto an.' });
    }
    const userClient = createUserSupabase(token);
    const { data: authData, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !authData || !authData.user) {
      return sendJson(res, 401, { ok: false, error: 'Sitzung abgelaufen — bitte neu anmelden.' });
    }
    const user = authData.user;

    const { data: prof } = await service
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Bestandsschutz: Bestandskonten zahlen immer ihren eingefrorenen Satz (Standard 29 € / 290 €), niemals spätere Erhöhungen!
    const lockedMonthlyEur = Math.min(29, Number((prof && prof.price_locked) || 29));
    const interval = body.interval === 'year' ? 'year' : 'month';
    const unitAmountCents = interval === 'year'
      ? Math.round(lockedMonthlyEur * 10 * 100) // 290,00 € (10 statt 12 Monate)
      : Math.round(lockedMonthlyEur * 100);     // 29,00 €

    if (!isStripeConfigured()) {
      return sendJson(res, 200, {
        ok: true,
        configured: false,
        lockedMonthlyEur,
        lockedYearlyEur: lockedMonthlyEur * 10,
        message: `Dein Preis-Bestandsschutz (${lockedMonthlyEur} €/Monat bzw. ${lockedMonthlyEur * 10} €/Jahr) ist fest in deinem Konto gespeichert. Während der Pilot-Beta ist noch keine Zahlung nötig.`
      });
    }

    const configuredPriceId = interval === 'year'
      ? getEnv('STRIPE_PRICE_YEARLY_290')
      : getEnv('STRIPE_PRICE_MONTHLY_29');

    const params = {
      mode: 'subscription',
      success_url: `${siteUrl}/app/?billing=success`,
      cancel_url: `${siteUrl}/app/?billing=cancel`,
      client_reference_id: user.id,
      'metadata[user_id]': user.id,
      'metadata[interval]': interval,
      'metadata[price_locked_eur]': String(lockedMonthlyEur),
      'subscription_data[metadata][user_id]': user.id,
      'subscription_data[metadata][price_locked_eur]': String(lockedMonthlyEur)
    };

    if (prof && prof.stripe_customer_id) {
      params.customer = prof.stripe_customer_id;
    } else if (user.email) {
      params.customer_email = user.email;
    }

    if (configuredPriceId && lockedMonthlyEur === 29) {
      params['line_items[0][price]'] = configuredPriceId;
      params['line_items[0][quantity]'] = '1';
    } else {
      params['line_items[0][price_data][currency]'] = 'eur';
      params['line_items[0][price_data][unit_amount]'] = String(unitAmountCents);
      params['line_items[0][price_data][recurring][interval]'] = interval;
      params['line_items[0][price_data][product_data][name]'] = interval === 'year'
        ? `Theo Jahresabo (Bestandsschutz ${lockedMonthlyEur * 10} €/Jahr)`
        : `Theo Monatsabo (Bestandsschutz ${lockedMonthlyEur} €/Monat)`;
      params['line_items[0][quantity]'] = '1';
    }

    try {
      const session = await stripeRequest('/checkout/sessions', 'POST', params);
      return sendJson(res, 200, {
        ok: true,
        configured: true,
        url: session.url,
        sessionId: session.id,
        lockedMonthlyEur
      });
    } catch (e) {
      return sendJson(res, 502, {
        ok: false,
        error: `Zahlungsfenster konnte nicht geöffnet werden: ${e.message}`
      });
    }
  }

  return sendJson(res, 400, { ok: false, error: 'Unbekannte Abrechnungs-Aktion.' });
};
