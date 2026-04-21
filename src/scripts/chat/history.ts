/* Chat history persistence (sessionStorage) + turn bookkeeping. State is
   module-private: orchestrator talks to this module only through getHistory /
   pushTurn / clearHistory / rehydrate. */

import type { ChatResponse, HistoryItem, TranscriptItem } from './types';

const HISTORY_KEY = 'rag_chat_transcript';
export const HISTORY_MAX_TURNS = 10;

let chatHistory: HistoryItem[] = [];
let transcript: TranscriptItem[] = [];

function persist(): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify({ h: chatHistory, t: transcript }));
  } catch { /* quota exceeded or storage disabled — silently skip */ }
}

export function getHistory(): HistoryItem[] {
  return chatHistory;
}

export function pushTurn(userQ: string, answerPreview: string, data: ChatResponse): void {
  chatHistory.push({ role: 'user', content: userQ });
  chatHistory.push({ role: 'assistant', content: answerPreview.slice(0, 500) });
  transcript.push({ q: userQ, data });
  if (chatHistory.length > HISTORY_MAX_TURNS * 2) chatHistory = chatHistory.slice(-HISTORY_MAX_TURNS * 2);
  if (transcript.length > HISTORY_MAX_TURNS) transcript = transcript.slice(-HISTORY_MAX_TURNS);
  persist();
}

export function clearHistory(): void {
  chatHistory = [];
  transcript = [];
  sessionStorage.removeItem(HISTORY_KEY);
}

/* Loads the previous session's transcript and calls onTurn for each turn.
   Returns true if there was any data to rehydrate. */
export function rehydrate(onTurn: (item: TranscriptItem) => void): boolean {
  try {
    const saved = sessionStorage.getItem(HISTORY_KEY);
    if (!saved) return false;
    const parsed = JSON.parse(saved) as { h?: HistoryItem[]; t?: TranscriptItem[] };
    if (!Array.isArray(parsed.h) || !Array.isArray(parsed.t) || !parsed.t.length) return false;
    chatHistory = parsed.h;
    transcript = parsed.t;
    parsed.t.forEach(onTurn);
    return true;
  } catch {
    /* corrupt storage, ignore */
    return false;
  }
}
