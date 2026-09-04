#!/usr/bin/env node
// Post-deploy self-check: every path the app depends on must answer with the
// right content type. Run it against the live origin after a deploy; a
// mismatch exits non-zero so the deploy step fails loudly.
//   node scripts/postdeploy-check.mjs https://www.example.com
const origin = (process.argv[2] || process.env.PRAJNA_PUBLIC_URL || '').replace(/\/$/, '');
if (!origin) { console.error('usage: postdeploy-check <origin>'); process.exit(2); }
const CHECKS = [
  ['/', 'text/html'],
  ['/logo.png', 'image/png'],
  ['/mark.png', 'image/png'],
  ['/favicon.png', 'image/png'],
  ['/fonts/archivo-normal.woff2', 'font/woff2'],
  ['/fonts/doto-normal.woff2', 'font/woff2'],
  ['/api/health', 'application/json'],
  ['/api/session', 'application/json'],
  ['/api/legal', 'application/json'],
  ['/legal/terms', 'text/html'],
  ['/legal/privacy', 'text/html'],
  ['/legal/ai', 'text/html'],
  ['/status', 'text/html'],
];
let bad = 0;
for (const [p, type] of CHECKS) {
  try {
    const r = await fetch(origin + p, { redirect: 'manual' });
    const ct = r.headers.get('content-type') || '';
    const ok = r.status === 200 && ct.startsWith(type);
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${p}  ${r.status} ${ct || '(no type)'}${ok ? '' : `  expected ${type}`}`);
  } catch (e) { bad++; console.log(`FAIL ${p}  ${e.message}`); }
}
// The app shell must reference a hashed bundle that actually serves.
try {
  const html = await (await fetch(origin + '/')).text();
  const m = html.match(/assets\/index-[\w-]+\.js/);
  if (!m) { bad++; console.log('FAIL app shell references no bundle'); }
  else { const r = await fetch(`${origin}/${m[0]}`); const ok = r.ok && (r.headers.get('content-type') || '').includes('javascript'); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} /${m[0]}  ${r.status}`); }
} catch (e) { bad++; console.log(`FAIL bundle check ${e.message}`); }
const h = await fetch(origin + '/api/health').then((r) => r.json()).catch(() => null);
if (h) console.log(`version ${h.version}, uptime ${h.uptimeSeconds}s, data ${h.dataWritable ? 'writable' : 'READ-ONLY'}`);
console.log(bad ? `${bad} check(s) FAILED` : 'all checks passed');
process.exit(bad ? 1 : 0);
