export type ProjectStatus = 'live' | 'private' | 'wip';
export type ProjectCategory = 'ai' | 'automation';

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  category: ProjectCategory;
  url?: string;
  desc: string;
  stack: string;
  meta: string;
  button: { label: string; disabled: boolean; ariaLabel?: string };
}

export const PROJECTS: Project[] = [
  {
    id: '001',
    title: 'VOICE_AGENT',
    status: 'private',
    category: 'ai',
    desc: 'Never miss a lead because no one picked up the phone. An AI agent handles inbound calls 24/7 — qualifies prospects, schedules meetings and logs key metrics to a database automatically. Built on voice AI infrastructure.',
    stack: 'VAPI | n8n | Airtable | Google Calendar',
    meta: 'For companies paying humans to answer routine calls',
    button: { label: 'CONTACT', disabled: true, ariaLabel: 'Contact about VOICE_AGENT project' },
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
    title: 'COMING_SOON',
    status: 'wip',
    category: 'automation',
    desc: 'Next project in development.',
    stack: '',
    meta: '—',
    button: { label: 'LOCKED', disabled: true },
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

export const liveCount = (): number => PROJECTS.filter(p => p.status === 'live').length;
export const totalCount = (): number => PROJECTS.length;
export const categoryCount = (c: ProjectCategory): number => PROJECTS.filter(p => p.category === c).length;

export const STATUS_SYMBOL: Record<ProjectStatus, string> = {
  live: '●',
  private: '○',
  wip: '○',
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: 'LIVE',
  private: 'PRIVATE',
  wip: 'WIP',
};
