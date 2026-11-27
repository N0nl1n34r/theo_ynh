'use strict';

const {
  getEnv,
  getSiteUrl,
  isInviteRequired,
  isStripeConfigured,
  sendJson
} = require('./_lib/core');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, error: 'Methode nicht erlaubt.' });
  }
  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return sendJson(res, 200, {
    ok: Boolean(supabaseUrl && supabaseAnonKey),
    supabaseUrl,
    supabaseAnonKey,
    siteUrl: getSiteUrl(req),
    inviteRequired: isInviteRequired(),
    stripeEnabled: isStripeConfigured(),
    region: 'eu-central-1'
  });
};
