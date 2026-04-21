/* Types shared across the chat module. */

export type ConnState = 'established' | 'lost' | 'missing';
export type Source = { filename?: string; score?: number };
export type MediaItem = { type: string; filename?: string; url?: string; driveFileId?: string };
export type ChatResponse = { answer?: unknown; media?: MediaItem[]; sources?: Source[] };
export type HistoryItem = { role: 'user' | 'assistant'; content: string };
export type TranscriptItem = { q: string; data: ChatResponse };
