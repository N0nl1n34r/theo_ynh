'use strict';

const {
  getEnv,
  createServiceSupabase,
  sendJson,
  readRawBody,
  verifyStripeSignature
} = require('./_lib/core');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt.' });
  }

  const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return sendJson(res, 503, { ok: false, error: 'Stripe-Webhook nicht konfiguriert.' });
  }

  const rawBody = await readRawBody(req);
  const sig = (req.headers && (req.headers['stripe-signature'] || req.headers['Stripe-Signature'])) || '';
  if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
    return sendJson(res, 400, { ok: false, error: 'Ungültige Stripe-Signatur.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Ungültiges Event-JSON.' });
  }

  const service = createServiceSupabase();
  const obj = (event && event.data && event.data.object) || {};

  if (event.type === 'checkout.session.completed') {
    const userId = (obj.metadata && obj.metadata.user_id) || obj.client_reference_id;
    const interval = (obj.metadata && obj.metadata.interval) === 'year' ? 'year' : 'month';
    if (userId) {
      const nowMs = Date.now();
      const defaultPaidUntil = new Date(nowMs + (interval === 'year' ? 366 : 32) * 86400 * 1000).toISOString();
      const withdrawalUntil = new Date(nowMs + 14 * 86400 * 1000).toISOString();
      await service
        .from('profiles')
        .update({
          plan_interval: interval,
          subscription_status: 'active',
          paid_until: defaultPaidUntil,
          withdrawal_until: withdrawalUntil,
          cancel_at_period_end: false,
          stripe_customer_id: obj.customer || null,
          stripe_subscription_id: obj.subscription || null
        })
        .eq('user_id', userId);
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subId = obj.id;
    const userId = obj.metadata && obj.metadata.user_id;
    const periodEndIso = obj.current_period_end
      ? new Date(Number(obj.current_period_end) * 1000).toISOString()
      : null;
    const cancelEnd = Boolean(obj.cancel_at_period_end);
    let mappedStatus = 'active';
    if (event.type === 'customer.subscription.deleted' || obj.status === 'canceled') {
      mappedStatus = 'canceled';
    } else if (obj.status === 'past_due' || obj.status === 'unpaid') {
      mappedStatus = 'past_due';
    } else if (cancelEnd) {
      mappedStatus = 'cancel_at_period_end';
    }

    const patch = {
      subscription_status: mappedStatus,
      cancel_at_period_end: cancelEnd,
      ...(periodEndIso ? { paid_until: periodEndIso } : {})
    };

    if (userId) {
      await service.from('profiles').update(patch).eq('user_id', userId);
    } else if (subId) {
      await service.from('profiles').update(patch).eq('stripe_subscription_id', subId);
    }
  } else if (event.type === 'invoice.paid') {
    const subId = obj.subscription;
    const lineEnd = obj.lines && obj.lines.data && obj.lines.data[0] && obj.lines.data[0].period && obj.lines.data[0].period.end;
    if (subId && lineEnd) {
      await service
        .from('profiles')
        .update({
          paid_until: new Date(Number(lineEnd) * 1000).toISOString(),
          subscription_status: 'active'
        })
        .eq('stripe_subscription_id', subId);
    }
  }

  return sendJson(res, 200, { ok: true, received: true });
};
