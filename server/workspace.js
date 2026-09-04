// Zenith-parity workspace surfaces: chats, projects, plugins, tools, profile,
// subscription, templates, the expanded connector catalog. Persisted in
// data/workspace-*.json through the store; keys/tokens remain memory-only.
import { store } from './store.js';

/* ------------------------------ catalogs ---------------------------------- */

export const DECK_TEMPLATES = [
  { id: 'none', name: 'No template', blurb: 'The house picks the layout.', theme: null },
  { id: 'dawn', name: 'Meridian Dawn', blurb: 'Warm paper, large serif titles, coral accents.', theme: { paper: '#f6f1e6', ink: '#1c1a16', acc: '#c9573a', font: "Georgia,'Times New Roman',serif" } },
  { id: 'noir', name: 'Signal Noir', blurb: 'Black ground, amber signal, condensed caps.', theme: { paper: '#0f1110', ink: '#f2ede2', acc: '#ffb300', font: "'Helvetica Neue',Arial,sans-serif" } },
  { id: 'harbor', name: 'Harbor Green', blurb: 'Deep green, mint accents, calm and corporate.', theme: { paper: '#eef3ef', ink: '#10261c', acc: '#1d5c3a', font: "'Avenir Next','Segoe UI',sans-serif" } },
  { id: 'slate', name: 'Slate Console', blurb: 'Cool grey slabs with electric blue.', theme: { paper: '#e9edf2', ink: '#151a22', acc: '#2f6fed', font: "'Helvetica Neue',Arial,sans-serif" } },
  { id: 'ochre', name: 'Ochre Field', blurb: 'Earth tones, wide margins, editorial.', theme: { paper: '#f3e9d6', ink: '#2b2116', acc: '#b7791f', font: "Georgia,serif" } },
];

export const PLUGINS = [
  { id: 'claude-skills', name: 'Claude Skills', by: 'Anthropic', what: 'Load skill packs into missions as standing procedures.', effect: 'Wired: installed skills add their steps (cite guard, steelman, deck doctor, copy cutter, accessibility audit, chart smith) to every ticket. Off, tickets carry only the core steps.' },
  { id: 'codex-delegate', name: 'Codex delegate', by: 'OpenAI', what: 'Delegate build steps to a coding agent and keep control of the contract.', effect: 'Not wired yet: toggling records the intent; build steps still run in the house.' },
  { id: 'code-interpreter', name: 'Code interpreter', by: 'House', what: 'Run computations over attached data during analysis.', effect: 'Wired: the analyze step computes change, peak, trough, mean, spread and top segment over an attached CSV, on the tape and in the artifact.' },
  { id: 'web-search', name: 'Web search', by: 'House', what: 'Search the open web for research missions.', effect: 'Wired: with a Brave Search key loaded, the research sweep reads the live web; off, only the open encyclopedia.' },
  { id: 'browser', name: 'Browser', by: 'House', what: 'Drive a real browser to read pages and verify surfaces.', effect: 'Not wired yet: the house has no headless browser; toggling records the intent.' },
  { id: 'documents', name: 'Documents', by: 'House', what: 'Read and write PDF, Word, Excel and PowerPoint files.', effect: 'Wired: attached Word, PowerPoint and Excel files are read as evidence (text only). Export to .pptx is not wired yet.' },
  { id: 'claude-code', name: 'Claude Code coordination', by: 'Anthropic', what: 'Coordinate long engineering work from a terminal session.', effect: 'Not wired yet: the prajna CLI already attaches a workspace; this toggle records the intent to coordinate a coding session.' },
];

export const TOOLS = [
  { id: 'task-agent', name: 'Task Agent', what: 'Enable task delegation to a sub-agent for complex operations.' },
  { id: 'media', name: 'Media Generation', what: 'Generate images and videos.' },
  { id: 'browser', name: 'Browser', what: 'Use a real browser session for browser automation.' },
];

export const CONNECTOR_CATALOG = [
  // popular
  ['gmail', 'Gmail', 'Communication', 'google', 'Read threads as evidence; draft replies as artifacts.', true],
  ['gmaps', 'Google Maps', 'Location', null, 'Places, routes and distances as mission evidence.', true],
  ['youtube', 'YouTube', 'Media', 'google', 'Transcripts as research evidence with timestamped citations.', true],
  ['notion', 'Notion', 'Productivity', 'notion', 'Source pages as evidence; publish briefs to your wiki.', true],
  ['gdrive', 'Google Drive', 'Files', 'google', 'Pull documents into mission evidence; file artifacts back.', true],
  ['gdocs', 'Google Docs', 'Productivity', 'google', 'Read and write documents.', true],
  ['outlook', 'Outlook', 'Communication', null, 'Mail and calendar evidence for briefs and updates.', true],
  ['slack', 'Slack', 'Communication', 'slack', 'Post mission deliveries to a channel; pull threads as context.', true],
  ['gcal', 'Google Calendar', 'Productivity', 'google', 'Schedule evidence; book time when a mission needs it.', true],
  // accounting
  ['freeagent', 'FreeAgent', 'Accounting', null, 'Cloud-based accounting for small businesses.'],
  ['freshbooks', 'FreshBooks', 'Accounting', null, 'Invoicing and expenses for service teams.'],
  ['moneybird', 'Moneybird', 'Accounting', null, 'Online invoicing and bookkeeping.'],
  ['ynab', 'YNAB', 'Accounting', null, 'Zero-based budgeting.'],
  ['xero', 'Xero', 'Accounting', null, 'Small-business accounting platform.'],
  ['quickbooks', 'QuickBooks', 'Accounting', null, 'Accounting, invoicing and payroll.'],
  // communication
  ['discord', 'Discord', 'Communication', null, 'Community channels as context; post updates.'],
  ['teams', 'Microsoft Teams', 'Communication', null, 'Chats and meetings as evidence.'],
  ['zoom', 'Zoom', 'Communication', null, 'Meeting recordings and transcripts.'],
  ['telegram', 'Telegram', 'Communication', null, 'Bot posts and channel reads.'],
  ['whatsapp', 'WhatsApp Business', 'Communication', null, 'Customer conversations as evidence.'],
  // crm & sales
  ['hubspot', 'HubSpot', 'CRM', null, 'Pipeline and contact evidence for revenue missions.'],
  ['salesforce', 'Salesforce', 'CRM', null, 'Opportunities, accounts and activity.'],
  ['pipedrive', 'Pipedrive', 'CRM', null, 'Deal pipeline for sales analysis.'],
  ['intercom', 'Intercom', 'Support', null, 'Conversations and tickets as customer evidence.'],
  ['zendesk', 'Zendesk', 'Support', null, 'Support tickets for product research.'],
  // dev
  ['github', 'GitHub', 'Developer', 'github', 'Repos, issues and PRs as evidence for engineering missions.'],
  ['gitlab', 'GitLab', 'Developer', null, 'Repositories and pipelines.'],
  ['linear', 'Linear', 'Work', null, 'Cycle and project data for delivery analysis.'],
  ['jira', 'Jira', 'Work', null, 'Board exports for flow metrics and delivery forecasts.'],
  ['asana', 'Asana', 'Work', null, 'Tasks and projects as planning context.'],
  ['trello', 'Trello', 'Work', null, 'Boards as lightweight planning context.'],
  ['vercel', 'Vercel', 'Developer', null, 'Deploy generated sites.'],
  ['netlify', 'Netlify', 'Developer', null, 'Deploy generated sites.'],
  // files & data
  ['dropbox', 'Dropbox', 'Files', null, 'Files as evidence; deliver artifacts to folders.'],
  ['onedrive', 'OneDrive', 'Files', null, 'Microsoft files as evidence.'],
  ['box', 'Box', 'Files', null, 'Enterprise document storage.'],
  ['sheets', 'Google Sheets', 'Data', 'google', 'Spreadsheets as analysis inputs; results written back.'],
  ['airtable', 'Airtable', 'Data', null, 'Bases as structured evidence.'],
  ['snowflake', 'Snowflake', 'Data', null, 'Warehouse queries for analysis desks.'],
  ['postgres', 'PostgreSQL', 'Data', null, 'Read-only SQL over your database.'],
  // marketing & social
  ['mailchimp', 'Mailchimp', 'Marketing', null, 'Campaign metrics as evidence.'],
  ['x', 'X / Twitter', 'Social', null, 'Public sentiment sampling with explicit bias caveats.'],
  ['linkedin', 'LinkedIn', 'Social', null, 'Company and post signals.'],
  ['reddit', 'Reddit', 'Social', null, 'Community threads as qualitative evidence.'],
  ['rss', 'RSS / Feeds', 'News', null, 'Fresh sector news wired straight into research missions.'],
  // design & docs
  ['figma', 'Figma', 'Design', null, 'Design files as evidence for product and site missions.'],
  ['canva', 'Canva', 'Design', null, 'Brand kits and templates for decks.'],
  ['confluence', 'Confluence', 'Docs', null, 'Wiki pages as evidence.'],
  // payments
  ['stripe', 'Stripe', 'Revenue', null, 'Billing data for pricing and retention analysis.'],
  ['shopify', 'Shopify', 'Commerce', null, 'Orders and products for commerce analysis.'],
].map(([id, name, category, provider, what, popular]) => ({ id, name, category, provider, what, popular: !!popular }));

export const PLANS = [
  { id: 'free', name: 'Free', price: 0, credits: 800, blurb: 'Try every desk. 800 house credits a month.', features: ['All desks', 'Panel of up to 3', 'Bring your own keys', 'Community projects'] },
  { id: 'pro', name: 'Pro', price: 20, credits: 5000, blurb: 'For daily builders. PRO models on the panel, priority runs.', features: ['PRO models', 'Panel of up to 5', '5,000 credits a month', 'Media generation', 'Priority queue'] },
  { id: 'team', name: 'Team', price: 60, credits: 20000, blurb: 'Shared projects, shared credits, review before merge.', features: ['Everything in Pro', 'Shared projects', 'Boards with review', 'Admin controls'] },
];

/* ------------------------------ state -------------------------------------- */

function ensure() {
  const st = store.state;
  if (!st.ws) {
    st.ws = store._read('workspace-ui.json', null) || {
      chats: [], projects: [{ id: 'p_default', name: 'My workspace', createdAt: Date.now(), chatIds: [] }],
      plugins: ['claude-skills', 'documents'], tools: { 'task-agent': true, media: false, browser: false },
      mcp: [],
      profile: { name: '', email: '', handle: '', bio: '', avatar: 'P' },
      personalization: { tone: 'calm and precise', defaultModel: 'opus', defaultAdvisers: ['gpt', 'deepseek'], theme: 'night' },
      language: 'en',
      plan: 'free',
      invoices: [],
      media: [],
      showcase: [],
      ledger: [],
      consent: null,
      boards: [],
    };
  }
  // The profile belongs to whoever opens the house, never a seeded name.
  if (st.ws.profile && (st.ws.profile.email === 'just4nagesh@gmail.com' || st.ws.profile.name === 'Nagesh Sharma')) st.ws.profile = { name: '', email: '', handle: '', bio: '', avatar: 'P' };
  if (!st.ws.media) st.ws.media = [];
  if (!st.ws.showcase) st.ws.showcase = [];
  if (!st.ws.ledger) st.ws.ledger = [];
  if (st.ws.consent === undefined) st.ws.consent = null;
  return st.ws;
}
export function ws() { return ensure(); }
export function flushWs() { store._write('workspace-ui.json', ensure()); }

/* ------------------------------ chats -------------------------------------- */

const id = () => Math.random().toString(36).slice(2, 10);

export function createChat({ title, mode, projectId }) {
  const w = ensure();
  const chat = { id: id(), title: (title || 'New chat').slice(0, 80), mode: mode || 'chat', projectId: projectId || 'p_default', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  w.chats.unshift(chat);
  const p = w.projects.find((x) => x.id === chat.projectId) || w.projects[0];
  p.chatIds.unshift(chat.id);
  flushWs();
  return chat;
}
export function getChat(cid) { return ensure().chats.find((c) => c.id === cid) || null; }
export function addMessage(cid, msg) {
  const c = getChat(cid);
  if (!c) return null;
  const m = { id: id(), at: Date.now(), ...msg };
  c.messages.push(m);
  c.updatedAt = Date.now();
  if (c.messages.length === 1 && msg.role === 'user') c.title = String(msg.text || '').slice(0, 60) || c.title;
  flushWs();
  return m;
}
export function deleteChat(cid) {
  const w = ensure();
  w.chats = w.chats.filter((c) => c.id !== cid);
  w.projects.forEach((p) => (p.chatIds = p.chatIds.filter((x) => x !== cid)));
  flushWs();
}
export function renameChat(cid, title) { const c = getChat(cid); if (c) { c.title = String(title).slice(0, 80); flushWs(); } return c; }

export function publicWs() {
  const w = ensure();
  return {
    chats: w.chats.map(({ messages, ...c }) => ({ ...c, messageCount: messages.length, last: messages[messages.length - 1]?.text?.slice(0, 80) || '' })),
    projects: w.projects, plugins: w.plugins, tools: w.tools, mcp: w.mcp,
    profile: w.profile, personalization: w.personalization, language: w.language, plan: w.plan, invoices: w.invoices, boards: w.boards, media: w.media.slice(0, 48), showcase: w.showcase, ledger: (w.ledger || []).slice(0, 200), consent: w.consent || null,
  };
}
