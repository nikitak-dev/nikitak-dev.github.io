/**
 * Chat logic for multimodal-rag page.
 *
 * All assistant/user/error messages are built via createElement + textContent
 * (no innerHTML interpolation) so escaping is handled by the DOM itself.
 */

const chatPage = document.getElementById('chat-page') as HTMLElement | null;
if (!chatPage) throw new Error('chat-page element not found');

const WEBHOOK_URL = chatPage.dataset.webhook;
const connStatus = document.getElementById('conn-status');
const chat = document.getElementById('chat') as HTMLElement;
const input = document.getElementById('question') as HTMLInputElement;
const btn = document.getElementById('send') as HTMLButtonElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const emptyState = document.getElementById('empty-state');
const docsTrigger = document.getElementById('docs-trigger');

type ConnState = 'established' | 'lost' | 'missing';

function setConnStatus(state: ConnState | string) {
  if (!connStatus) return;
  const labels: Record<string, string> = { established: 'ESTABLISHED', lost: 'LOST', missing: 'MISSING' };
  connStatus.textContent = `[ CONN: ${labels[state] ?? state} ]`;
  connStatus.className = state === 'established' ? 'status-block-live' : 'status-block-dead';
}

if (!WEBHOOK_URL) {
  setConnStatus('missing');
  btn.disabled = true;
}

const isSafeUrl = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//i.test(u);
const isSafeDriveId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id);

type Source = { filename?: string; score?: number };
type MediaItem = { type: string; filename?: string; url?: string; driveFileId?: string };
type ChatResponse = { answer?: unknown; media?: MediaItem[]; sources?: Source[] };

function appendMultilineText(parent: HTMLElement, text: string) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0) parent.appendChild(document.createElement('br'));
    parent.appendChild(document.createTextNode(line));
  });
}

function buildAssistantMessage(data: ChatResponse): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg assistant';

  const answerEl = document.createElement('div');
  answerEl.className = 'answer';
  appendMultilineText(answerEl, String(data.answer ?? ''));
  wrapper.appendChild(answerEl);

  if (Array.isArray(data.media) && data.media.length > 0) {
    const mediaEl = document.createElement('div');
    mediaEl.className = 'msg-media';

    for (const m of data.media) {
      if (!isSafeUrl(m.url)) continue;
      if (!isSafeDriveId(m.driveFileId)) continue;

      const item = document.createElement('div');
      item.className = 'msg-media-item';
      const filename = typeof m.filename === 'string' ? m.filename : '';

      if (m.type === 'image') {
        const link = document.createElement('a');
        link.href = `https://drive.google.com/file/d/${m.driveFileId}/view`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        const img = document.createElement('img');
        img.className = 'loading';
        img.src = m.url;
        img.alt = filename;
        img.loading = 'lazy';
        img.addEventListener('load', () => img.classList.remove('loading'), { once: true });

        link.appendChild(img);
        item.appendChild(link);
      } else if (m.type === 'video' || m.type === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = m.url;
        iframe.loading = 'lazy';
        iframe.title = filename || 'media';
        iframe.allow = 'fullscreen';
        iframe.allowFullscreen = true;
        item.appendChild(iframe);
      } else {
        continue;
      }

      const label = document.createElement('div');
      label.className = 'media-label';
      label.textContent = filename;
      item.appendChild(label);

      mediaEl.appendChild(item);
    }

    if (mediaEl.childElementCount > 0) wrapper.appendChild(mediaEl);
  }

  if (Array.isArray(data.sources) && data.sources.length > 0) {
    const srcEl = document.createElement('div');
    srcEl.className = 'sources';

    const label = document.createElement('span');
    label.className = 'sources-label';
    label.textContent = 'src';
    srcEl.appendChild(label);

    for (const s of data.sources) {
      const scoreNum = Number(s.score) || 0;
      const pct = (scoreNum * 100).toFixed(0);

      const tag = document.createElement('div');
      tag.className = 'source-tag';

      const name = document.createElement('span');
      name.textContent = typeof s.filename === 'string' ? s.filename : '';
      tag.appendChild(name);

      const bar = document.createElement('div');
      bar.className = 'score-bar';
      const fill = document.createElement('div');
      fill.className = 'score-fill';
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      tag.appendChild(bar);

      const pctEl = document.createElement('span');
      pctEl.textContent = `${pct}%`;
      tag.appendChild(pctEl);

      srcEl.appendChild(tag);
    }

    wrapper.appendChild(srcEl);
  }

  return wrapper;
}

function hideEmptyState() {
  if (emptyState && !emptyState.classList.contains('hidden')) {
    emptyState.classList.add('hidden');
  }
}

function appendAndScroll(el: HTMLElement) {
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function addUserMsg(text: string) {
  hideEmptyState();
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  appendAndScroll(div);
}

function addAssistantMsg(data: ChatResponse) {
  hideEmptyState();
  appendAndScroll(buildAssistantMessage(data));
}

function addErrorMsg(text: string) {
  hideEmptyState();
  const div = document.createElement('div');
  div.className = 'msg error';
  div.textContent = text;
  appendAndScroll(div);
}

clearBtn.addEventListener('click', () => {
  const msgs = [...chat.querySelectorAll<HTMLElement>('.msg, .typing')];
  if (!msgs.length) { input.focus(); return; }
  msgs.forEach(el => el.classList.add('msg--exit'));
  setTimeout(() => {
    msgs.forEach(el => el.remove());
    if (emptyState) emptyState.classList.remove('hidden');
    input.focus();
  }, 300);
});

/* Rotating placeholder typewriter on input */
(function () {
  const QUERIES = [
    'What is symmetric encryption?',
    'Explain the Agile sprint cycle',
    'What SQL join types are covered?',
  ];

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    input.placeholder = QUERIES[0];
    return;
  }

  let qIdx = 0;
  let currentQuery = QUERIES[0];

  input.addEventListener('click', () => {
    if (!input.value) {
      input.value = currentQuery;
      input.setSelectionRange(currentQuery.length, currentQuery.length);
      qIdx = (qIdx + 1) % QUERIES.length;
    }
  });
  window.addEventListener('advance-query-hint', () => { qIdx = (qIdx + 1) % QUERIES.length; });

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const busy = () => !!input.value;

  (async function cycle() {
    while (true) {
      while (busy()) await sleep(100);
      currentQuery = QUERIES[qIdx];
      let broken = false;
      for (let i = 1; i <= currentQuery.length; i++) {
        if (busy()) { broken = true; break; }
        input.placeholder = currentQuery.slice(0, i);
        await sleep(40);
      }
      if (broken) continue;
      for (let t = 0; t < 25; t++) {
        if (busy()) { broken = true; break; }
        await sleep(100);
      }
      if (broken) continue;
      for (let i = currentQuery.length; i > 0; i--) {
        if (busy()) { broken = true; break; }
        input.placeholder = currentQuery.slice(0, i);
        await sleep(25);
      }
      if (broken) continue;
      qIdx = (qIdx + 1) % QUERIES.length;
    }
  })();
})();

/* Docs modal trigger */
docsTrigger?.addEventListener('click', () => {
  const modal = document.getElementById('docs-modal') as HTMLDialogElement | null;
  if (!modal) return;
  modal.showModal();
  document.body.classList.add('modal-open');
});

/* Capture-phase img error fallback for chat media tiles */
document.addEventListener('error', (e) => {
  const target = e.target as HTMLElement | null;
  if (!target || target.tagName !== 'IMG') return;
  const item = target.closest('.msg-media-item') as HTMLElement | null;
  if (!item) return;
  const label = item.querySelector('.media-label');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'media-error';
  errorDiv.textContent = `[ IMAGE UNAVAILABLE: ${label?.textContent ?? 'file'} ]`;
  item.replaceChildren(errorDiv);
}, true);

let isLoading = false;

async function ask() {
  const q = input.value.trim();
  if (!q || isLoading || !WEBHOOK_URL) return;

  isLoading = true;
  addUserMsg(q);
  input.value = '';
  window.dispatchEvent(new Event('advance-query-hint'));
  btn.disabled = true;

  const typing = document.createElement('div');
  typing.className = 'typing';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'typing-dot';
    typing.appendChild(dot);
  }
  chat.appendChild(typing);
  chat.scrollTop = chat.scrollHeight;

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    });

    typing.remove();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: ChatResponse = await res.json();
    addAssistantMsg(data);
    setConnStatus('established');
  } catch (err) {
    typing.remove();
    const msg = err instanceof Error ? err.message : String(err);
    const isNetworkErr = msg.includes('fetch') || msg.includes('NetworkError');
    const isServerErr = /^HTTP 5/.test(msg);
    const isClientErr = /^HTTP 4/.test(msg);
    if (isNetworkErr || isServerErr) setConnStatus('lost'); else setConnStatus('established');
    const userMsg =
      isNetworkErr ? 'Connection error. Check your network.' :
      isServerErr ? 'Service unavailable. Try again later.' :
      isClientErr ? 'Request rejected by server. The service may be misconfigured.' :
      msg;
    addErrorMsg(userMsg);
  } finally {
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
