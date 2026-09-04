// The exchange catalog: council models, skills, connectors, desks.
// Static product data; connect flows are stubbed at launch (recorded in PRODUCT.md).

// House models. `provider` + `modelId` are what a BYOK key would call; a model
// is LIVE when the workspace holds a key for its provider.
export const MODELS = [
  { id: 'opus', symbol: 'OPS', name: 'Claude Opus', house: 'Anthropic', role: 'Deep reasoning · long-horizon plans', tier: 'included', color: '#D97757', provider: 'anthropic', modelId: 'claude-opus-5' },
  { id: 'sonnet', symbol: 'SNT', name: 'Claude Sonnet', house: 'Anthropic', role: 'Fast, balanced generalist', tier: 'included', color: '#D97757', provider: 'anthropic', modelId: 'claude-sonnet-5' },
  { id: 'gpt', symbol: 'SOL', name: 'GPT-5.6', house: 'OpenAI', role: 'Broad knowledge · code', tier: 'included', color: '#6BA292', provider: 'openai', modelId: 'gpt-5.6' },
  { id: 'gemini', symbol: 'GEM', name: 'Gemini 3.1 Pro', house: 'Google', role: 'Multimodal · retrieval', tier: 'included', color: '#5B8DEF', provider: 'google', modelId: 'gemini-3.1-pro' },
  { id: 'deepseek', symbol: 'DSK', name: 'DeepSeek R2', house: 'DeepSeek', role: 'Contrarian verifier', tier: 'included', color: '#8B7FD4', provider: 'openai', modelId: 'deepseek-reasoner', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'llama', symbol: 'LMA', name: 'Llama 4 405B', house: 'Meta', role: 'Open-weights baseline', tier: 'included', color: '#C9A227', provider: 'openai', modelId: 'meta-llama/llama-4-maverick', baseUrl: 'https://api.together.xyz/v1' },
];

// Custom (BYOK) seats live in the store; resolve across both lists.
let customResolver = () => [];
export function bindCustomModels(fn) { customResolver = fn; }
export function allModels() { return [...MODELS, ...customResolver()]; }

export const DESKS = [
  {
    id: 'brief', code: 'RES', name: 'Research desk', deliverable: 'Decision brief',
    tint: 'amber',
    blurb: 'Evidence-graded research briefs with sources you can audit.',
    placeholder: 'What decision do you need evidence for?',
    samples: [
      'Should we enter the EU home-battery market in 2027?',
      'State of AI agent platforms, who wins the enterprise?',
      'Is vertical farming finally unit-economic in India?',
    ],
  },
  {
    id: 'deck', code: 'DCK', name: 'Deck desk', deliverable: 'Slide deck',
    tint: 'rose',
    blurb: 'Narrative-first decks, argument before ornament.',
    placeholder: 'What story must the room believe?',
    samples: [
      'Series A pitch for a carbon-accounting startup',
      'Quarterly business review for a logistics platform',
      'Executive briefing: agentic AI for pharma R&D',
    ],
  },
  {
    id: 'site', code: 'STE', name: 'Site desk', deliverable: 'Landing page',
    tint: 'blue',
    blurb: 'Shippable landing pages with the argument built in.',
    placeholder: 'What are we launching, and to whom?',
    samples: [
      'Landing page for a specialty coffee subscription',
      'Waitlist page for a developer-tools startup',
      'Launch page for an executive AI masterclass',
    ],
  },
  {
    id: 'mobile', code: 'MOB', name: 'Mobile desk', deliverable: 'Mobile app prototype',
    tint: 'rose',
    blurb: 'Tappable phone prototypes, screens, flows, and a tab bar that works.',
    placeholder: 'Describe the mobile app you want to create…',
    samples: [
      'Build a mobile app for a restaurant',
      'Build a mobile app for a fitness tracker',
      'Build a mobile app for a weather forecast',
      'Build a mobile app for a news reader',
    ],
  },
  {
    id: 'analysis', code: 'ANL', name: 'Analysis desk', deliverable: 'Metrics dashboard',
    tint: 'green',
    blurb: 'Numbers interrogated, not decorated, with the caveats attached.',
    placeholder: 'What do the numbers need to answer?',
    samples: [
      'Cohort retention for our Q2 signups: where is the leak?',
      'Marketing channel efficiency across the last 4 quarters',
      'Pricing experiment readout: annual vs monthly plans',
    ],
  },
];

export const SKILLS = [
  { id: 'cite-guard', symbol: 'CTG', name: 'Cite Guard', desk: 'Research', what: 'Grades every claim A–D by source strength; refuses to ship ungraded assertions.', install: 'installed' },
  { id: 'steelman', symbol: 'STL', name: 'Steelman', desk: 'Research', what: 'Builds the strongest case against your own conclusion before the brief closes.', install: 'installed' },
  { id: 'deck-doctor', symbol: 'DKD', name: 'Deck Doctor', desk: 'Deck', what: 'One idea per slide, evidence beneath assertion; kills bullet sprawl on sight.', install: 'installed' },
  { id: 'chart-smith', symbol: 'CHS', name: 'Chart Smith', desk: 'Analysis', what: 'Picks the honest chart form for the data; bans dual axes and truncated bars.', install: 'installed' },
  { id: 'copy-cutter', symbol: 'CPC', name: 'Copy Cutter', desk: 'Site', what: 'Cuts landing copy to one promise, one proof, one action.', install: 'installed' },
  { id: 'tone-ledger', symbol: 'TNL', name: 'Tone Ledger', desk: 'All desks', what: 'Holds your house voice across every artifact, calm, precise, no hype.', install: 'available' },
  { id: 'redline', symbol: 'RDL', name: 'Redline', desk: 'Research', what: 'Contract and policy diffing with negotiation-ready annotations.', install: 'available' },
  { id: 'forecast', symbol: 'FCT', name: 'Forecast', desk: 'Analysis', what: 'Probabilistic projections with explicit confidence intervals, never point guesses.', install: 'available' },
  { id: 'storyboard', symbol: 'SBD', name: 'Storyboard', desk: 'Deck', what: 'Sequences an argument as a narrative arc before a single slide is drawn.', install: 'available' },
  { id: 'a11y-audit', symbol: 'ALY', name: 'Access Audit', desk: 'Site', what: 'WCAG AA pass on every shipped page, contrast, focus order, semantics.', install: 'available' },
  { id: 'translate', symbol: 'TRN', name: 'Polyglot', desk: 'All desks', what: 'Ships any artifact in 12 languages with locale-aware numbers and dates.', install: 'available' },
  { id: 'summarizer', symbol: 'SUM', name: 'Room Summary', desk: 'All desks', what: 'One-paragraph executive summary calibrated to a 30-second read.', install: 'available' },
];

export const CONNECTORS = [
  { id: 'gmail', provider: 'google', name: 'Gmail', kind: 'Mail', what: 'Read threads as evidence; draft replies as artifacts.' },
  { id: 'outlook', name: 'Outlook', kind: 'Mail', what: 'Mail and calendar evidence for briefs and updates.' },
  { id: 'gdrive', provider: 'google', name: 'Google Drive', kind: 'Files', what: 'Pull documents into mission evidence; file artifacts back.' },
  { id: 'notion', provider: 'notion', name: 'Notion', kind: 'Docs', what: 'Source pages as evidence; publish briefs to your wiki.' },
  { id: 'slack', provider: 'slack', name: 'Slack', kind: 'Chat', what: 'Post mission fills to a channel; pull threads as context.' },
  { id: 'github', provider: 'github', name: 'GitHub', kind: 'Code', what: 'Repos, issues and PRs as evidence for engineering missions.' },
  { id: 'linear', name: 'Linear', kind: 'Work', what: 'Cycle and project data for delivery analysis.' },
  { id: 'jira', name: 'Jira', kind: 'Work', what: 'Board exports for flow metrics and delivery forecasts.' },
  { id: 'gcal', provider: 'google', name: 'Google Calendar', kind: 'Time', what: 'Schedule evidence; book time when a mission needs it.' },
  { id: 'sheets', provider: 'google', name: 'Google Sheets', kind: 'Data', what: 'Spreadsheets as analysis inputs; results written back.' },
  { id: 'hubspot', name: 'HubSpot', kind: 'CRM', what: 'Pipeline and contact evidence for revenue missions.' },
  { id: 'stripe', name: 'Stripe', kind: 'Revenue', what: 'Billing data for pricing and retention analysis.' },
  { id: 'figma', name: 'Figma', kind: 'Design', what: 'Design files as evidence for product and site missions.' },
  { id: 'youtube', provider: 'google', name: 'YouTube', kind: 'Media', what: 'Transcripts as research evidence with timestamped citations.' },
  { id: 'x', name: 'X / Twitter', kind: 'Social', what: 'Public sentiment sampling with explicit bias caveats.' },
  { id: 'rss', name: 'RSS / Feeds', kind: 'News', what: 'Fresh sector news wired straight into research missions.' },
];

export function deskById(id) {
  return DESKS.find((d) => d.id === id) || DESKS[0];
}
export function modelById(id) {
  return allModels().find((m) => m.id === id) || MODELS[0];
}
