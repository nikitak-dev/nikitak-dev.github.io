/** Drives card status colour (`.card-status.live/.private/.wip`) and the pulse animation on `live`. */
type ProjectStatus = 'live' | 'private' | 'wip';

/** Drives card palette: `ai` keeps the green theme, `automation` remaps via `.theme-amber`. */
type ProjectCategory = 'ai' | 'automation';

/** Single project entry rendered as a card on the hub page. Array order in PROJECTS = card order.
    All fields are readonly — projects are static data, consumed by the hub renderer and never mutated. */
interface Project {
  /** 3-digit identifier shown as `[ 001 ]` in the card header. */
  readonly id: string;
  /** UPPER_SNAKE_CASE name shown as card title. */
  readonly title: string;
  readonly status: ProjectStatus;
  readonly category: ProjectCategory;
  /** Route to the project's dedicated page. Omit until that page exists — the card then renders without a hyperlink. */
  readonly url?: string;
  /** 1–2 sentence problem-framed description. */
  readonly desc: string;
  /** `'A | B | C'` stack pipeline, appears under `//` comment. Empty string hides the stack line. */
  readonly stack: string;
  /** Short phrase shown bottom-left of card. */
  readonly meta: string;
  readonly button: { readonly label: string; readonly disabled: boolean; readonly ariaLabel?: string };
}

/** Ordered source of truth for hub project cards. Add/remove/reorder here; hub renders directly from this. */
export const PROJECTS: readonly Project[] = [
  {
    id: '001',
    title: 'VOICE_AGENT',
    status: 'wip',
    category: 'ai',
    url: '/voice-agent/',
    desc: 'A lead calls, no one picks up, and minutes later they are signing with the competitor who did — that is how fast a hot lead goes cold. An AI agent handles inbound calls 24/7 — qualifies prospects, schedules meetings, and logs key metrics to a database automatically.',
    stack: 'n8n | Vapi | Supabase | Google Calendar',
    meta: 'For local service businesses that book over the phone',
    button: { label: 'PREVIEW', disabled: false, ariaLabel: 'Preview VOICE_AGENT page' },
  },
  {
    id: '002',
    title: 'MULTIMODAL_RAG',
    status: 'live',
    category: 'ai',
    url: '/multimodal-rag/',
    desc: 'The answer is already in your files — but it is locked in a scanned PDF, a screenshot, or an hour-long recording that keyword search cannot read, so you waste half a day digging or redo work that was already done. This agent reads anything you upload — docs, images, audio, video, PDFs — and answers in plain language.',
    stack: 'n8n | Gemini | Pinecone | OpenRouter',
    meta: 'For legal, finance, and support teams',
    button: { label: 'LAUNCH', disabled: false, ariaLabel: 'Launch MULTIMODAL_RAG demo' },
  },
  {
    id: '003',
    title: 'DB_MERGE',
    status: 'wip',
    category: 'automation',
    url: '/db-merge/',
    desc: 'Week after week, someone exports the same records from five systems, pastes them into one sheet, and hand-fixes the columns that never line up — and a single missed duplicate quietly corrupts the report leadership is about to trust. This pipeline pulls from systems with clashing schemas, reconciles them into one clean table, deduplicates, and syncs every destination on a schedule.',
    stack: 'n8n | Google Sheets | Airtable | Discord',
    meta: 'For ops and finance teams without a data engineer',
    button: { label: 'PREVIEW', disabled: false, ariaLabel: 'Preview DB_MERGE page' },
  },
  {
    id: '004',
    title: 'FOLDER_CLONE',
    status: 'wip',
    category: 'automation',
    url: '/folder-clone/',
    desc: 'Ever tried to copy a Google Drive folder and watched it leave the subfolders behind? Drive cannot clone a nested tree — this workflow does. It walks the entire hierarchy, recreates every subfolder, and batch-copies the contents into a fresh dated workspace, then reports exactly what it moved.',
    stack: 'n8n | Google Drive | Telegram',
    meta: 'For agencies onboarding clients in Google Drive',
    button: { label: 'PREVIEW', disabled: false, ariaLabel: 'Preview FOLDER_CLONE page' },
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
