/**
 * Chat orchestrator for multimodal-rag page.
 *
 * State-ownership (module-private elsewhere):
 *   conn.ts       — #conn-status DOM + error taxonomy
 *   history.ts    — chatHistory + transcript + sessionStorage persistence
 *   messages.ts   — chat/empty-state DOM (addUserMsg, addAssistantMsg, ...)
 *   helpers.ts    — pure DOM factories (buildAssistantMessage, ...)
 *   placeholder.ts — rotating input placeholder typewriter
 *
 * This file owns: WEBHOOK_URL, animation timing constants, isLoading/inflight,
 * the fetch logic (sendQuestion/ask), and wiring of DOM events to submodules.
 *
 * All assistant/user/error messages are built via createElement + textContent
 * (no innerHTML interpolation) so escaping is handled by the DOM itself.
 */

import type { ChatResponse, HistoryItem } from './types';
import { tokenMs } from './helpers';
import { classifyError, initConn, setConnStatus } from './conn';
import {
  clearHistory,
  getHistory,
  pushTurn,
  rehydrate,
} from './history';
import {
  addAssistantMsg,
  addErrorMsg,
  addTypingIndicator,
  addUserMsg,
  initMediaErrorFallback,
  initMessages,
  showEmptyState,
} from './messages';
import { startPlaceholderCycle } from './placeholder';

const chatPage = document.getElementById('chat-page') as HTMLElement | null;
if (!chatPage) throw new Error('chat-page element not found');

// Dev mode uses the Vite proxy (/webhook/rag-chat) to bypass CORS locally.
// Production uses the real URL injected via PUBLIC_RAG_WEBHOOK env var.
const WEBHOOK_URL = import.meta.env.DEV ? '/webhook/rag-chat' : chatPage.dataset.webhook;

const chat = document.getElementById('chat') as HTMLElement;
const input = document.getElementById('question') as HTMLInputElement;
const btn = document.getElementById('send') as HTMLButtonElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const emptyState = document.getElementById('empty-state');

const ANIM_CONTENT_MS = tokenMs('--anim-content', 500);
const ANIM_REVEAL_MS = tokenMs('--anim-reveal', 500);
const ANIM_MESSAGE_MS = tokenMs('--anim-message', 300);

// 30s accommodates the full retrieval + rewrite + LLM chain. Claude Sonnet 4
// under load + Gemini Flash rewrite routinely pushes past 15s on cold paths.
const REQUEST_TIMEOUT_MS = 30000;

initConn(document.getElementById('conn-status'));
initMessages(chat, emptyState, ANIM_CONTENT_MS, ANIM_REVEAL_MS);
initMediaErrorFallback();

if (!WEBHOOK_URL) {
  setConnStatus('missing');
  btn.disabled = true;
}

let isLoading = false;
let inflight: AbortController | null = null;

clearBtn.addEventListener('click', () => {
  inflight?.abort();
  clearHistory();
  const msgs = [...chat.querySelectorAll<HTMLElement>('.msg, .typing')];
  if (!msgs.length) { input.focus(); return; }
  msgs.forEach(el => {
    // Drop rehydrated class so .msg--exit wins animation resolution —
    // otherwise rehydrated's fadeIn rule keeps masking exit.
    el.classList.remove('msg--rehydrated');
    el.classList.add('msg--exit');
  });
  setTimeout(() => {
    msgs.forEach(el => el.remove());
    showEmptyState();
    input.focus();
  }, ANIM_MESSAGE_MS);
});

startPlaceholderCycle(input);

// Hydrate session transcript on page load (survives refresh, clears on tab close)
const hadRehydrate = rehydrate((item) => {
  addUserMsg(item.q);
  addAssistantMsg(item.data);
});
if (hadRehydrate) {
  // Rehydrated history = one object in the cascade. Top-to-bottom sequence:
  // empty-state fadeOut (0) → history fadeIn (1 step) → input-bar slide (2 steps).
  // History shares a single delay; input-bar follows naturally via its DOM index.
  chat.querySelectorAll<HTMLElement>('.msg').forEach((el) => {
    el.classList.add('msg--rehydrated');
    el.style.setProperty('--cascade-delay', 'calc(var(--cascade-step) * 1)');
  });
}

async function sendQuestion(q: string, url: string, signal: AbortSignal): Promise<ChatResponse> {
  const history = getHistory();
  const body: { question: string; history?: HistoryItem[] } = { question: q };
  if (history.length) body.history = history;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ChatResponse>;
}

async function ask(): Promise<void> {
  const q = input.value.trim();
  if (!q || isLoading || !WEBHOOK_URL) return;

  isLoading = true;
  addUserMsg(q);
  input.value = '';
  window.dispatchEvent(new Event('advance-query-hint'));
  btn.disabled = true;

  const typing = addTypingIndicator();

  inflight = new AbortController();
  const signal = AbortSignal.any([inflight.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);

  // Fade out the typing indicator before the next message arrives.
  const retireTyping = () => new Promise<void>((resolve) => {
    typing.classList.add('msg--exit');
    setTimeout(() => { typing.remove(); resolve(); }, ANIM_MESSAGE_MS);
  });

  try {
    const data = await sendQuestion(q, WEBHOOK_URL, signal);
    await retireTyping();
    addAssistantMsg(data);
    setConnStatus('established');
    pushTurn(q, String(data.answer ?? ''), data);
  } catch (err) {
    const classified = classifyError(err);
    if (classified.aborted) {
      // User cancelled via CLR — CLR handles DOM cleanup.
      return;
    }
    await retireTyping();
    setConnStatus(classified.state!);
    addErrorMsg(classified.userMsg!);
  } finally {
    inflight = null;
    isLoading = false;
    btn.disabled = false;
    input.focus();
  }
}

btn.addEventListener('click', ask);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ask();
  if (e.key === 'Escape') {
    if (input.value) { input.value = ''; } else { input.blur(); }
  }
});

/* Skip initial focus on touch devices — prevents auto-opening the soft keyboard */
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  input.focus();
}

/* DEV-only visual QA harness for media tiles. Opt in with ?mock=1 in the URL
   (e.g. http://localhost:4321/multimodal-rag/?mock=1). Dynamic import lets
   Vite DCE the mock module out of prod builds — mock.ts never ships. */
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  import('./mock').then(m => m.renderMock(addAssistantMsg));
}

export {};
