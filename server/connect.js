// Connectors, wired end to end. A connected account does two real things in
// a mission: at the first step it GATHERS evidence that matches the goal
// (mail, files, events, messages, pages, issues) onto the sources table, and
// at the delivery step, after the approval checkpoint, it DELIVERS: a Slack
// post, a Notion page, a Gmail draft, a GitHub issue, each with a real id or
// URL on the tape. Tokens stay in memory. API hosts can be redirected with
// PRAJNA_API_BASE_<PROVIDER> for tests; tokens can be seeded for tests with
// PRAJNA_TEST_TOKENS. Neither is set in production.
import { store } from './store.js';
import { ws } from './workspace.js';
import { providerForConnector } from './oauth.js';
import { queryFor } from './retrieve.js';

const TIMEOUT = 20000;
const withTimeout = (p, label) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`${label} timed out`)), TIMEOUT))]);
const BASES = {
  google: { gmail: 'https://gmail.googleapis.com', api: 'https://www.googleapis.com' },
  slack: { api: 'https://slack.com' },
  notion: { api: 'https://api.notion.com' },
  github: { api: 'https://api.github.com' },
  microsoft: { api: 'https://graph.microsoft.com' },
};
export function base(provider, which = 'api') {
  const env = process.env[`PRAJNA_API_BASE_${provider.toUpperCase()}`];
  return (env || BASES[provider][which] || BASES[provider].api).replace(/\/$/, '');
}
export function seedTestTokens() {
  if (!process.env.PRAJNA_TEST_TOKENS) return 0;
  try {
    const t = JSON.parse(process.env.PRAJNA_TEST_TOKENS);
    for (const [prov, tok] of Object.entries(t)) store.state.tokens[prov] = { token: tok.token || 'test', account: tok.account || 'test account', addedAt: Date.now(), test: true };
    console.log(`prajna: TEST tokens seeded for ${Object.keys(t).join(', ')} (PRAJNA_TEST_TOKENS is set; never set this in production)`);
    return Object.keys(t).length;
  } catch { return 0; }
}

async function call(url, opts, label) {
  const r = await withTimeout(fetch(url, opts), label);
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!r.ok || j.ok === false) throw new Error(j.error?.message || j.error || j.message || `${label} ${r.status}`);
  return j;
}
const auth = (t) => ({ authorization: `Bearer ${t}` });
const clip = (s, n = 1200) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------- GATHER ----------------------------------- */
const GATHER = {
  async gmail(t, q) {
    const list = await call(`${base('google', 'gmail')}/gmail/v1/users/me/messages?maxResults=5&q=${encodeURIComponent(q)}`, { headers: auth(t) }, 'Gmail');
    const out = [];
    for (const m of (list.messages || []).slice(0, 5)) {
      const msg = await call(`${base('google', 'gmail')}/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: auth(t) }, 'Gmail');
      const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
      out.push({ title: h.subject || '(no subject)', url: `https://mail.google.com/mail/u/0/#all/${m.id}`, kind: 'mail', extract: clip(`${h.from ? `From ${h.from}. ` : ''}${h.date ? `${h.date}. ` : ''}${msg.snippet || ''}`) });
    }
    return out;
  },
  async gdrive(t, q) {
    const term = q.replace(/'/g, '');
    const list = await call(`${base('google')}/drive/v3/files?pageSize=5&q=${encodeURIComponent(`fullText contains '${term}'`)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`, { headers: auth(t) }, 'Drive');
    const out = [];
    for (const f of list.files || []) {
      let extract = `${f.mimeType || 'file'}, modified ${(f.modifiedTime || '').slice(0, 10)}`;
      if (f.mimeType === 'application/vnd.google-apps.document') {
        try { const r = await withTimeout(fetch(`${base('google')}/drive/v3/files/${f.id}/export?mimeType=text/plain`, { headers: auth(t) }), 'Drive export'); if (r.ok) extract = clip(await r.text(), 2000); } catch { /* keep metadata */ }
      }
      out.push({ title: f.name, url: f.webViewLink || null, kind: 'file', extract });
    }
    return out;
  },
  gdocs: (t, q) => GATHER.gdrive(t, q),
  sheets: (t, q) => GATHER.gdrive(t, q),
  async gcal(t, q) {
    const min = new Date(Date.now() - 30 * 86400000).toISOString();
    const j = await call(`${base('google')}/calendar/v3/calendars/primary/events?maxResults=5&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(min)}&q=${encodeURIComponent(q)}`, { headers: auth(t) }, 'Calendar');
    return (j.items || []).map((e) => ({ title: e.summary || '(untitled event)', url: e.htmlLink || null, kind: 'event', extract: clip(`${e.start?.dateTime || e.start?.date || ''}. ${e.description || ''}`) }));
  },
  async slack(t, q) {
    const j = await call(`${base('slack')}/api/search.messages?count=5&query=${encodeURIComponent(q)}`, { headers: auth(t) }, 'Slack search');
    return (j.messages?.matches || []).map((m) => ({ title: `#${m.channel?.name || 'channel'}: ${clip(m.text, 60)}`, url: m.permalink || null, kind: 'message', extract: clip(`${m.username ? `${m.username}: ` : ''}${m.text}`) }));
  },
  async notion(t, q) {
    const h = { ...auth(t), 'Notion-Version': '2022-06-28', 'content-type': 'application/json' };
    const j = await call(`${base('notion')}/v1/search`, { method: 'POST', headers: h, body: JSON.stringify({ query: q, page_size: 5 }) }, 'Notion search');
    const out = [];
    for (const p of (j.results || []).slice(0, 5)) {
      const title = p.properties?.title?.title?.[0]?.plain_text || p.properties?.Name?.title?.[0]?.plain_text || p.title?.[0]?.plain_text || 'Untitled';
      let extract = `${p.object}, edited ${(p.last_edited_time || '').slice(0, 10)}`;
      try {
        const b = await call(`${base('notion')}/v1/blocks/${p.id}/children?page_size=30`, { headers: h }, 'Notion blocks');
        const text = (b.results || []).map((x) => (x[x.type]?.rich_text || []).map((r) => r.plain_text).join('')).filter(Boolean).join(' ');
        if (text) extract = clip(text, 2000);
      } catch { /* keep metadata */ }
      out.push({ title, url: p.url || null, kind: 'page', extract });
    }
    return out;
  },
  async outlook(t, q) {
    const j = await call(`${base('microsoft')}/v1.0/me/messages?$search=${encodeURIComponent(`"${q.replace(/"/g, '')}"`)}&$top=5&$select=subject,from,receivedDateTime,bodyPreview,webLink`, { headers: auth(t) }, 'Outlook');
    return (j.value || []).map((m) => ({ title: m.subject || '(no subject)', url: m.webLink || null, kind: 'mail', extract: clip(`${m.from?.emailAddress?.name || m.from?.emailAddress?.address ? `From ${m.from.emailAddress.name || m.from.emailAddress.address}. ` : ''}${(m.receivedDateTime || '').slice(0, 10)}. ${m.bodyPreview || ''}`) }));
  },
  async onedrive(t, q) {
    const j = await call(`${base('microsoft')}/v1.0/me/drive/root/search(q='${encodeURIComponent(q.replace(/'/g, ''))}')?$top=5&$select=name,webUrl,lastModifiedDateTime,file`, { headers: auth(t) }, 'OneDrive');
    return (j.value || []).map((f) => ({ title: f.name, url: f.webUrl || null, kind: 'file', extract: clip(`${f.file?.mimeType || 'file'}, modified ${(f.lastModifiedDateTime || '').slice(0, 10)}`) }));
  },
  async github(t, q) {
    const j = await call(`${base('github')}/search/issues?per_page=5&q=${encodeURIComponent(`${q} is:issue`)}`, { headers: { ...auth(t), 'user-agent': 'prajna', accept: 'application/vnd.github+json' } }, 'GitHub search');
    return (j.items || []).map((i) => ({ title: `${i.title} (#${i.number})`, url: i.html_url || null, kind: 'issue', extract: clip(`${i.state}. ${i.body || ''}`) }));
  },
};

// Gather evidence for one connector. Returns { sources, note } or throws.
export async function gather(cid, goal) {
  const provider = providerForConnector(cid);
  const tok = provider && store.token(provider);
  if (!tok) throw new Error(`${cid}: no live token in memory, reconnect on the Connectors page`);
  const fn = GATHER[cid];
  if (!fn) return { sources: [], note: `${cid}: connected, nothing to gather for this desk` };
  const q = queryFor(goal);
  const found = await fn(tok.token, q);
  const sources = found.map((s) => ({ ...s, engine: 'connector', connector: cid, retrieved: today() }));
  return { sources, note: `${cid}: ${sources.length} item${sources.length === 1 ? '' : 's'} matching “${q}” on the table${sources.length ? `: ${sources.map((s) => s.title).slice(0, 4).join(' · ')}` : ''}` };
}

/* ------------------------------- DELIVER ---------------------------------- */
export function targets() { const w = ws(); if (!w.connectorTargets) w.connectorTargets = {}; return w.connectorTargets; }

function summary(m, link) {
  const lines = [`${m.serial}: ${m.deliverable} for “${m.goal}”.${m.lineage ? ` Version ${m.lineage.version}, superseding ${m.lineage.parentSerial}${(m.lineage.feedback || []).length ? `, written against ${m.lineage.feedback.length} owner note${m.lineage.feedback.length === 1 ? '' : 's'}` : ''}.` : ''}`, m.narrative ? m.narrative.split(/(?<=\.)\s+/).slice(0, 3).join(' ') : `Delivered by Prajñā, ${m.contract.plan.length} steps, ${Number(m.spent || 0).toFixed(1)} credits.`, `Open it: ${link}`];
  return lines.join('\n\n');
}

// The earlier delivery this one continues: the same mission's last delivery
// to that app (a re-delivery), or an ancestor version's (an amendment).
export function priorDelivery(m, cid) {
  const own = [...(m.deliveries || [])].reverse().find((d) => d.connector === cid && d.ok && d.id);
  if (own) return own;
  let cur = m; let hops = 0;
  while (cur?.lineage?.parentId && hops++ < 10) {
    cur = store.mission(cur.lineage.parentId);
    const d = cur && [...(cur.deliveries || [])].reverse().find((x) => x.connector === cid && x.ok && x.id);
    if (d) return d;
  }
  return null;
}

const DELIVER = {
  async slack(t, m, link, prior) {
    const target = targets().slack;
    let channel = target;
    if (!channel) {
      const j = await call(`${base('slack')}/api/conversations.list?limit=50&exclude_archived=true`, { headers: auth(t) }, 'Slack channels');
      channel = (j.channels || []).find((c) => c.is_member)?.id || (j.channels || [])[0]?.id;
      if (!channel) throw new Error('no channel to post to; set one on the Connectors page');
    }
    const threaded = prior && (prior.target === channel || String(prior.where || '').startsWith(`Slack ${channel}`)) ? prior.id : null;
    const j = await call(`${base('slack')}/api/chat.postMessage`, { method: 'POST', headers: { ...auth(t), 'content-type': 'application/json' }, body: JSON.stringify({ channel, text: summary(m, link), ...(threaded ? { thread_ts: threaded } : {}) }) }, 'Slack post');
    return { id: threaded || j.ts || null, url: j.permalink || null, where: `Slack ${channel}${threaded ? ' (in the earlier thread)' : ''}`, target: channel };
  },
  async notion(t, m, link, prior) {
    const h = { ...auth(t), 'Notion-Version': '2022-06-28', 'content-type': 'application/json' };
    const paras = summary(m, link).split('\n\n').map((text) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text.slice(0, 1900) } }] } }));
    if (prior && prior.id) {
      // One page per deliverable: retitle it and append this version beneath a heading.
      await call(`${base('notion')}/v1/pages/${prior.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ properties: { title: { title: [{ type: 'text', text: { content: `${m.serial}: ${m.deliverable}${m.lineage ? ` (v${m.lineage.version})` : ''}` } }] } } }) }, 'Notion retitle');
      const heading = { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: `${m.lineage ? `Version ${m.lineage.version}` : 'Delivered again'}, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC` } }] } };
      await call(`${base('notion')}/v1/blocks/${prior.id}/children`, { method: 'PATCH', headers: h, body: JSON.stringify({ children: [heading, ...paras] }) }, 'Notion append');
      return { id: prior.id, url: prior.url || null, where: 'Notion page (updated in place)' };
    }
    const parent = targets().notion;
    if (!parent) throw new Error('no Notion parent page set; paste a page id on the Connectors page');
    const j = await call(`${base('notion')}/v1/pages`, { method: 'POST', headers: h, body: JSON.stringify({ parent: { page_id: parent }, properties: { title: { title: [{ type: 'text', text: { content: `${m.serial}: ${m.deliverable}` } }] } }, children: paras }) }, 'Notion page');
    return { id: j.id || null, url: j.url || null, where: 'Notion page' };
  },
  async gmail(t, m, link) {
    const to = ws().profile?.email;
    if (!to) throw new Error('no email on the profile to draft to');
    const raw = Buffer.from([`To: ${to}`, `Subject: ${m.serial}: ${m.deliverable}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', summary(m, link)].join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const j = await call(`${base('google', 'gmail')}/gmail/v1/users/me/drafts`, { method: 'POST', headers: { ...auth(t), 'content-type': 'application/json' }, body: JSON.stringify({ message: { raw } }) }, 'Gmail draft');
    return { id: j.id || null, url: j.id ? `https://mail.google.com/mail/u/0/#drafts/${j.message?.id || ''}` : null, where: `Gmail draft to ${to}` };
  },
  async outlook(t, m, link) {
    const to = ws().profile?.email;
    if (!to) throw new Error('no email on the profile to draft to');
    const j = await call(`${base('microsoft')}/v1.0/me/messages`, { method: 'POST', headers: { ...auth(t), 'content-type': 'application/json' }, body: JSON.stringify({ subject: `${m.serial}: ${m.deliverable}`, body: { contentType: 'Text', content: summary(m, link) }, toRecipients: [{ emailAddress: { address: to } }] }) }, 'Outlook draft');
    return { id: j.id || null, url: j.webLink || null, where: `Outlook draft to ${to}` };
  },
  async github(t, m, link, prior) {
    const repo = targets().github;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('no GitHub repository set (owner/repo) on the Connectors page');
    if (prior && prior.id && (prior.target === repo || String(prior.where || '').startsWith(`GitHub ${repo}`))) {
      const j = await call(`${base('github')}/repos/${repo}/issues/${prior.id}/comments`, { method: 'POST', headers: { ...auth(t), 'user-agent': 'prajna', accept: 'application/vnd.github+json', 'content-type': 'application/json' }, body: JSON.stringify({ body: `${m.lineage ? `**Version ${m.lineage.version}**\n\n` : '**Delivered again**\n\n'}${summary(m, link)}` }) }, 'GitHub comment');
      return { id: prior.id, url: j.html_url || prior.url || null, where: `GitHub ${repo} (comment on the earlier issue)`, target: repo };
    }
    const j = await call(`${base('github')}/repos/${repo}/issues`, { method: 'POST', headers: { ...auth(t), 'user-agent': 'prajna', accept: 'application/vnd.github+json', 'content-type': 'application/json' }, body: JSON.stringify({ title: `${m.serial}: ${m.deliverable}`, body: summary(m, link) }) }, 'GitHub issue');
    return { id: j.number || null, url: j.html_url || null, where: `GitHub ${repo}`, target: repo };
  },
};

export async function deliver(cid, mission, link) {
  const provider = providerForConnector(cid);
  const tok = provider && store.token(provider);
  if (!tok) throw new Error(`${cid}: no live token in memory`);
  const fn = DELIVER[cid];
  if (!fn) throw new Error(`${cid}: delivery is not wired for this connector`);
  return fn(tok.token, mission, link, priorDelivery(mission, cid));
}
export const DELIVERABLE_CONNECTORS = Object.keys(DELIVER);
