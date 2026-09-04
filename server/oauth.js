// Real OAuth 2.0 connections — zero dependencies. Client ids/secrets and the
// resulting tokens live ONLY in server memory (never on disk, never sent to
// the browser), per the house rule: keys are never saved.
import crypto from 'node:crypto';
import { store } from './store.js';

const TIMEOUT = 20000;
const withTimeout = (p, label) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`${label} timed out`)), TIMEOUT))]);

export const OAUTH_PROVIDERS = {
  google: {
    label: 'Google',
    covers: ['gmail', 'gdrive', 'gcal', 'sheets', 'youtube'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/calendar.readonly'],
    extraAuth: { access_type: 'offline', prompt: 'consent' },
    console: 'https://console.cloud.google.com/apis/credentials — OAuth client (Web application)',
    async identity(t) {
      const r = await withTimeout(fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${t}` } }), 'Google');
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'userinfo failed');
      return j.email || j.name || 'Google account';
    },
    async evidence(t, connector) {
      if (connector === 'gmail') {
        const r = await withTimeout(fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=newer_than:7d', { headers: { authorization: `Bearer ${t}` } }), 'Gmail');
        const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'gmail failed');
        return `Gmail: ${j.resultSizeEstimate ?? (j.messages || []).length} threads from the last 7 days available as evidence (read-only)`;
      }
      if (connector === 'gdrive') {
        const r = await withTimeout(fetch('https://www.googleapis.com/drive/v3/files?pageSize=3&orderBy=modifiedTime%20desc&fields=files(name)', { headers: { authorization: `Bearer ${t}` } }), 'Drive');
        const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'drive failed');
        return `Drive: latest files — ${(j.files || []).map((f) => f.name).join(' · ') || 'none'}`;
      }
      if (connector === 'gcal') {
        const now = new Date().toISOString();
        const r = await withTimeout(fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=3&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(now)}`, { headers: { authorization: `Bearer ${t}` } }), 'Calendar');
        const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'calendar failed');
        return `Calendar: next — ${(j.items || []).map((e) => e.summary).join(' · ') || 'nothing upcoming'}`;
      }
      return `${connector}: connected via Google (scope not read in this desk)`;
    },
  },
  slack: {
    label: 'Slack',
    covers: ['slack'],
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['channels:read', 'chat:write', 'users:read'],
    scopeParam: 'scope',
    console: 'https://api.slack.com/apps — create app, add redirect URL under OAuth & Permissions',
    tokenField: (j) => j.access_token || j.authed_user?.access_token,
    async identity(t) {
      const r = await withTimeout(fetch('https://slack.com/api/auth.test', { method: 'POST', headers: { authorization: `Bearer ${t}` } }), 'Slack');
      const j = await r.json(); if (!j.ok) throw new Error(j.error || 'auth.test failed');
      return `${j.team} (${j.user})`;
    },
    async evidence(t) {
      const r = await withTimeout(fetch('https://slack.com/api/conversations.list?limit=50&exclude_archived=true', { headers: { authorization: `Bearer ${t}` } }), 'Slack');
      const j = await r.json(); if (!j.ok) throw new Error(j.error || 'conversations.list failed');
      return `Slack: ${(j.channels || []).length} channels reachable — delivery can post to #${(j.channels || [])[0]?.name || 'general'}`;
    },
  },
  notion: {
    label: 'Notion',
    covers: ['notion'],
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    extraAuth: { owner: 'user' },
    basicAuth: true,
    console: 'https://www.notion.so/my-integrations — Public integration, add redirect URI',
    async identity(t) {
      const r = await withTimeout(fetch('https://api.notion.com/v1/users/me', { headers: { authorization: `Bearer ${t}`, 'Notion-Version': '2022-06-28' } }), 'Notion');
      const j = await r.json(); if (!r.ok) throw new Error(j.message || 'users/me failed');
      return j.name || j.bot?.owner?.user?.name || 'Notion workspace';
    },
    async evidence(t) {
      const r = await withTimeout(fetch('https://api.notion.com/v1/search', { method: 'POST', headers: { authorization: `Bearer ${t}`, 'Notion-Version': '2022-06-28', 'content-type': 'application/json' }, body: JSON.stringify({ page_size: 3, sort: { direction: 'descending', timestamp: 'last_edited_time' } }) }), 'Notion');
      const j = await r.json(); if (!r.ok) throw new Error(j.message || 'search failed');
      const titles = (j.results || []).map((p) => p.properties?.title?.title?.[0]?.plain_text || p.properties?.Name?.title?.[0]?.plain_text || p.object).filter(Boolean);
      return `Notion: recently edited — ${titles.join(' · ') || 'no shared pages yet'}`;
    },
  },
  github: {
    label: 'GitHub',
    covers: ['github'],
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'repo'],
    console: 'https://github.com/settings/developers — OAuth App, set callback URL',
    async identity(t) {
      const r = await withTimeout(fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${t}`, 'user-agent': 'prajna' } }), 'GitHub');
      const j = await r.json(); if (!r.ok) throw new Error(j.message || 'user failed');
      return j.login;
    },
    async evidence(t) {
      const r = await withTimeout(fetch('https://api.github.com/user/repos?sort=pushed&per_page=3', { headers: { authorization: `Bearer ${t}`, 'user-agent': 'prajna' } }), 'GitHub');
      const j = await r.json(); if (!r.ok) throw new Error(j.message || 'repos failed');
      return `GitHub: recently pushed — ${(j || []).map((x) => x.full_name).join(' · ') || 'none'}`;
    },
  },
};

export function providerForConnector(cid) {
  return Object.entries(OAUTH_PROVIDERS).find(([, p]) => p.covers.includes(cid))?.[0] || null;
}

const pendingStates = new Map(); // state → { provider, at }

export function redirectUri(req, provider) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/oauth/${provider}/callback`;
}

export function startUrl(req, provider) {
  const p = OAUTH_PROVIDERS[provider];
  const app = store.oauthApp(provider);
  if (!p) throw new Error('Unknown provider.');
  if (!app) throw new Error(`No ${p.label} OAuth app loaded — add its client id and secret under Your keys.`);
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { provider, at: Date.now() });
  for (const [k, v] of pendingStates) if (Date.now() - v.at > 600000) pendingStates.delete(k);
  const u = new URL(p.authUrl);
  u.searchParams.set('client_id', app.clientId);
  u.searchParams.set('redirect_uri', redirectUri(req, provider));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('state', state);
  if (p.scopes.length) u.searchParams.set(p.scopeParam || 'scope', p.scopes.join(' '));
  for (const [k, v] of Object.entries(p.extraAuth || {})) u.searchParams.set(k, v);
  return u.toString();
}

export async function finishCallback(req, provider, code, state) {
  const p = OAUTH_PROVIDERS[provider];
  const app = store.oauthApp(provider);
  const pend = pendingStates.get(state);
  if (!p || !app) throw new Error('Provider not configured.');
  if (!pend || pend.provider !== provider) throw new Error('OAuth state mismatch — start the connection again.');
  pendingStates.delete(state);
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(req, provider) });
  const headers = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  if (p.basicAuth) headers.authorization = `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`;
  else { body.set('client_id', app.clientId); body.set('client_secret', app.clientSecret); }
  const r = await withTimeout(fetch(p.tokenUrl, { method: 'POST', headers, body }), `${p.label} token`);
  const j = await r.json().catch(() => ({}));
  const token = p.tokenField ? p.tokenField(j) : j.access_token;
  if (!r.ok || !token) throw new Error(j.error_description || j.error || j.message || `${p.label} refused the code`);
  let account = p.label;
  try { account = await p.identity(token); } catch (e) { account = `${p.label} (identity check failed: ${e.message})`; }
  store.setToken(provider, { token, refresh: j.refresh_token || null, expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : null, account });
  return account;
}

// A real, read-only probe used as evidence on the tape for connected sources.
export async function evidenceFor(cid) {
  const provider = providerForConnector(cid);
  const t = provider && store.token(provider);
  if (!t) return null;
  return OAUTH_PROVIDERS[provider].evidence(t.token, cid);
}
