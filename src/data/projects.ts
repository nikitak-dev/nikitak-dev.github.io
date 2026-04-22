/** Drives card status colour (`.card-status.live/.private/.wip`) and the pulse animation on `live`. */
type ProjectStatus = 'live' | 'private' | 'wip';

/** Drives card palette: `ai` keeps the green theme, `automation` remaps via `.theme-amber`. */
type ProjectCategory = 'ai' | 'automation';

/** Single project entry rendered as a card on the hub page. Array order in PROJECTS = card order. */
interface Project {
  /** 3-digit identifier shown as `[ 001 ]` in the card header. */
  id: string;
  /** UPPER_SNAKE_CASE name shown as card title. */
  title: string;
  status: ProjectStatus;
  category: ProjectCategory;
  /** Route to the project's dedicated page. Omit until that page exists — the card then renders without a hyperlink. */
  url?: string;
  /** 1–2 sentence problem-framed description. */
  desc: string;
  /** `'A | B | C'` stack pipeline, appears under `//` comment. Empty string hides the stack line. */
  stack: string;
  /** Short phrase shown bottom-left of card. */
  meta: string;
  button: { label: string; disabled: boolean; ariaLabel?: string };
}

/** Ordered source of truth for hub project cards. Add/remove/reorder here; hub renders directly from this. */
export const PROJECTS: Project[] = [
  {
    id: '001',
    title: 'VOICE_AGENT',
    status: 'private',
    category: 'ai',
    desc: 'Never miss a lead because no one picked up the phone. An AI agent handles inbound calls 24/7 — qualifies prospects, schedules meetings and logs key metrics to a database automatically. Built on voice AI infrastructure.',
    stack: 'VAPI | n8n | Airtable | Google Calendar',
    meta: 'For companies paying humans to answer routine calls',
    button: { label: 'LOCKED', disabled: true, ariaLabel: 'VOICE_AGENT is private' },
  },
  {
    id: '002',
    title: 'MULTIMODAL_RAG',
    status: 'live',
    category: 'ai',
    url: '/multimodal-rag/',
    desc: 'What if you could Google your own files? Upload anything — docs, images, audio, video, PDFs — ask in plain language, get the answer. Built on vector embeddings and semantic retrieval.',
    stack: 'n8n | Gemini | Pinecone | OpenRouter',
    meta: 'For teams where "find the document" wastes hours',
    button: { label: 'LAUNCH', disabled: false, ariaLabel: 'Launch MULTIMODAL_RAG demo' },
  },
  {
    id: '003',
    title: 'DB_MERGE',
    status: 'wip',
    category: 'automation',
    url: '/db-merge/',
    desc: '',
    stack: '',
    meta: '',
    button: { label: 'PREVIEW', disabled: false, ariaLabel: 'Preview DB_MERGE page' },
  },
  {
    id: '004',
    title: 'COMING_SOON',
    status: 'wip',
    category: 'automation',
    desc: 'Next project in development.',
    stack: '',
    meta: '—',
    button: { label: 'LOCKED', disabled: true },
  },
];

/** Projects with status === 'live'. Feeds the `[ PROC: N/T LIVE ]` footer counter. */
export const liveCount = (): number => PROJECTS.filter(p => p.status === 'live').length;

/** Total number of projects. Feeds the `[ PROC: N/T LIVE ]` footer counter. */
export const totalCount = (): number => PROJECTS.length;

/** Projects in a given category. Drives the legend counters on the hub. */
export const categoryCount = (c: ProjectCategory): number => PROJECTS.filter(p => p.category === c).length;

/** Human-readable labels for the status tokens, rendered inside `.card-status`. */
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: 'LIVE',
  private: 'PRIVATE',
  wip: 'WIP',
};
