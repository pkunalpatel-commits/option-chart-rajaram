// Cloudflare Worker (free): proxy + AUTOMATIC Dhan token renewal. No daily manual step.
// Bindings / variables (Settings):
//   KV namespace binding named  KV                 (stores the latest token)
//   Secrets: DHAN_CLIENT_ID, DHAN_TOKEN (first token, from web.dhan.co)
//   Optional full-auto fallback: DHAN_PIN, DHAN_TOTP_SECRET (TOTP setup key from Dhan)
//   Variable: ALLOWED_ORIGIN = https://yoursite.netlify.app
//   Triggers > Cron:  30 2,14 * * *   (every 12 h)
const ALLOW = ['/charts/intraday', '/optionchain', '/optionchain/expirylist'];

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const ok = !env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;
    if (!ok || req.method !== 'POST' || !ALLOW.includes(path))
      return new Response('Forbidden', { status: 403, headers: cors });

    const token = (await env.KV.get('token')) || env.DHAN_TOKEN;
    const r = await fetch('https://api.dhan.co/v2' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access-token': token, 'client-id': env.DHAN_CLIENT_ID },
      body: await req.text(),
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2' },
    });
  },
  async scheduled(_ev, env) { await refreshToken(env); },
};

async function refreshToken(env) {
  const cur = (await env.KV.get('token')) || env.DHAN_TOKEN;
  if (cur) {                                   // 1) renew while the current token is still valid
    try {
      const r = await fetch('https://api.dhan.co/v2/RenewToken', {
        headers: { 'access-token': cur, dhanClientId: env.DHAN_CLIENT_ID },
      });
      if (r.ok) { const j = await r.json(); if (j.accessToken) { await env.KV.put('token', j.accessToken); return; } }
    } catch (e) {}
  }
  if (env.DHAN_PIN && env.DHAN_TOTP_SECRET) {  // 2) token already dead: log in again with PIN + TOTP
    const code = await totp(env.DHAN_TOTP_SECRET);
    const r = await fetch(`https://auth.dhan.co/app/generateAccessToken?dhanClientId=${env.DHAN_CLIENT_ID}&pin=${env.DHAN_PIN}&totp=${code}`, { method: 'POST' });
    if (r.ok) { const j = await r.json(); if (j.accessToken) await env.KV.put('token', j.accessToken); }
  }
}

async function totp(secret) {                  // standard 6-digit, 30 s TOTP
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', s = secret.replace(/[\s=]/g, '').toUpperCase();
  let bits = '', bytes = [];
  for (const c of s) bits += A.indexOf(c).toString(2).padStart(5, '0');
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const ctr = new DataView(new ArrayBuffer(8)); ctr.setUint32(4, Math.floor(Date.now() / 30000));
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, ctr)), o = h[19] & 15;
  const n = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(n).padStart(6, '0');
}
