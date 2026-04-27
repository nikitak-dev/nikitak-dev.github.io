/* Types shared across the chat module. Readonly fields document intent:
   these values are set at construction and never mutated in-place — callers
   build new objects to "change" anything. */

export type ConnState = 'established' | 'lost' | 'missing';
export type Source = { readonly filename?: string; readonly score?: number };
export type MediaItem = {
  readonly type: string;
  readonly filename?: string;
  readonly url?: string;
  readonly driveFileId?: string;
};
export type ChatResponse = {
  readonly answer?: unknown;
  readonly media?: readonly MediaItem[];
  readonly sources?: readonly Source[];
  readonly model?: string;
  readonly error?: boolean;
};
export type HistoryItem = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
};
export type TranscriptItem = { readonly q: string; readonly data: ChatResponse };
