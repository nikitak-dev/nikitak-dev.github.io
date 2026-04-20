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

function buildFileCard(type: 'pdf' | 'video', viewUrl: string, filename: string): HTMLElement {
  const link = document.createElement('a');
  link.className = 'media-body media-body--file';
  link.href = viewUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const icon = document.createElement('div');
  icon.className = 'file-icon';
  icon.textContent = type === 'pdf' ? '[PDF]' : '[VID]';
  link.appendChild(icon);

  if (filename) {
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = filename;
    link.appendChild(name);
  }

  const open = document.createElement('div');
  open.className = 'file-open';
  open.textContent = '[ OPEN ]';
  link.appendChild(open);

  return link;
}

function buildImageBody(src: string, alt: string, viewUrl: string): HTMLElement {
  const link = document.createElement('a');
  link.className = 'media-body media-body--image';
  link.href = viewUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const img = document.createElement('img');
  img.className = 'loading';
  img.src = src;
  img.alt = alt;
  img.loading = 'lazy';
  img.addEventListener('load', () => img.classList.remove('loading'), { once: true });

  link.appendChild(img);
  return link;
}

function buildMediaList(media: MediaItem[]): HTMLElement | null {
  const mediaEl = document.createElement('div');
  mediaEl.className = 'msg-media';

  for (const m of media) {
    if (!isSafeUrl(m.url)) continue;
    if (!isSafeDriveId(m.driveFileId)) continue;

    const filename = typeof m.filename === 'string' ? m.filename : '';
    const viewUrl = `https://drive.google.com/file/d/${m.driveFileId}/view`;

    const item = document.createElement('div');
    item.className = 'msg-media-item';

    if (m.type === 'image') {
      item.appendChild(buildImageBody(m.url, filename, viewUrl));
    } else if (m.type === 'video' || m.type === 'pdf') {
      item.appendChild(buildFileCard(m.type, viewUrl, filename));
    } else {
      continue;
    }

    mediaEl.appendChild(item);
  }

  return mediaEl.childElementCount > 0 ? mediaEl : null;
}

let sourcesUid = 0;

function buildSourcesList(sources: Source[]): HTMLElement {
  const srcEl = document.createElement('div');
  srcEl.className = 'sources';

  const tagsId = `sources-tags-${++sourcesUid}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sources-toggle btn-terminal';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', tagsId);
  toggle.textContent = 'SHOW SOURCES';

  const tags = document.createElement('div');
  tags.className = 'sources-tags';
  tags.id = tagsId;
  tags.hidden = true;

  const header = document.createElement('div');
  header.className = 'sources-header';
  const hName = document.createElement('span');
  hName.className = 'sources-header-name';
  hName.textContent = 'SOURCE';
  const hMetric = document.createElement('span');
  hMetric.className = 'sources-header-metric';
  hMetric.textContent = 'RELEVANCE';
  header.appendChild(hName);
  header.appendChild(hMetric);
  tags.appendChild(header);

  for (const s of sources) {
    const scoreNum = Number(s.score) || 0;
    const pct = (scoreNum * 100).toFixed(0);

    const tag = document.createElement('div');
    tag.className = 'source-tag';

    const name = document.createElement('span');
    name.className = 'source-name';
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
    pctEl.className = 'source-pct';
    pctEl.textContent = `${pct}%`;
    tag.appendChild(pctEl);

    tags.appendChild(tag);
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames: Keyframe[] = [
    { opacity: 0, transform: 'translateY(10px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ];
  let anim: Animation | null = null;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.textContent = expanded ? 'SHOW SOURCES' : 'HIDE SOURCES';

    anim?.cancel();
    const duration = reduced ? 0 : 300;

    if (expanded) {
      anim = tags.animate(frames, { duration, easing: 'ease-in', direction: 'reverse', fill: 'forwards' });
      anim.onfinish = () => { tags.hidden = true; };
    } else {
      tags.hidden = false;
      anim = tags.animate(frames, { duration, easing: 'ease-out', fill: 'forwards' });
      requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    }
  });

  srcEl.appendChild(toggle);
  srcEl.appendChild(tags);
  return srcEl;
}

function makePrefix(text: string): HTMLSpanElement {
  const prefix = document.createElement('span');
  prefix.className = 'bubble-prefix';
  prefix.textContent = text;
  return prefix;
}

function buildAssistantMessage(data: ChatResponse): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg assistant';

  const answerEl = document.createElement('div');
  answerEl.className = 'answer bubble bubble--left';
  answerEl.appendChild(makePrefix('< SYS'));
  appendMultilineText(answerEl, String(data.answer ?? ''));
  wrapper.appendChild(answerEl);

  if (Array.isArray(data.media) && data.media.length > 0) {
    const mediaEl = buildMediaList(data.media);
    if (mediaEl) wrapper.appendChild(mediaEl);
  }

  if (Array.isArray(data.sources) && data.sources.length > 0) {
    wrapper.appendChild(buildSourcesList(data.sources));
  }

  return wrapper;
}

function hideEmptyState() {
  if (emptyState && !emptyState.classList.contains('hidden')) {
    // BaseLayout's cascade `release()` pins inline `animation: none; opacity: 1`
    // after the fadeIn ends. Clear both so the `.hidden` fadeSlideOut can run.
    emptyState.style.animation = '';
    emptyState.style.opacity = '';
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
  div.className = 'msg user bubble bubble--right';
  div.appendChild(makePrefix('YOU >'));
  div.appendChild(document.createTextNode(text));
  appendAndScroll(div);
}

function addAssistantMsg(data: ChatResponse) {
  hideEmptyState();
  appendAndScroll(buildAssistantMessage(data));
}

function addErrorMsg(text: string) {
  hideEmptyState();
  const div = document.createElement('div');
  div.className = 'msg error bubble bubble--left bubble--error';
  div.appendChild(makePrefix('< ERR'));
  div.appendChild(document.createTextNode(text));
  appendAndScroll(div);
}

clearBtn.addEventListener('click', () => {
  inflight?.abort();
  const msgs = [...chat.querySelectorAll<HTMLElement>('.msg, .typing')];
  if (!msgs.length) { input.focus(); return; }
  msgs.forEach(el => el.classList.add('msg--exit'));
  setTimeout(() => {
    msgs.forEach(el => el.remove());
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.style.animation = 'none';
      emptyState.style.opacity = '1';
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      emptyState.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: reducedMotion ? 0 : 400, easing: 'ease-out' },
      );
    }
    input.focus();
  }, 300);
});

/* Rotating placeholder typewriter on input */
(function () {
  // QUERIES is non-empty and qIdx is always in bounds via `% QUERIES.length`,
  // so `!` assertions on array access are safe under noUncheckedIndexedAccess.
  const QUERIES = [
    'What is symmetric encryption?',
    'Explain the Agile sprint cycle',
    'What SQL join types are covered?',
  ];

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    input.placeholder = QUERIES[0]!;
    return;
  }

  let qIdx = 0;
  let currentQuery: string = QUERIES[0]!;

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
      currentQuery = QUERIES[qIdx]!;
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
  docsTrigger.setAttribute('aria-expanded', 'true');
});

/* Capture-phase img error fallback for chat media tiles */
document.addEventListener('error', (e) => {
  const target = e.target as HTMLElement | null;
  if (!target || target.tagName !== 'IMG') return;
  const item = target.closest('.msg-media-item') as HTMLElement | null;
  if (!item) return;
  const body = item.querySelector('.media-body');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'media-body media-error';
  errorDiv.textContent = '[ IMAGE UNAVAILABLE ]';
  if (body) body.replaceWith(errorDiv); else item.appendChild(errorDiv);
}, true);

let isLoading = false;
let inflight: AbortController | null = null;

const REQUEST_TIMEOUT_MS = 15000;

async function sendQuestion(q: string, url: string, signal: AbortSignal): Promise<ChatResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: q }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ChatResponse>;
}

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
  typing.appendChild(makePrefix('< SYS'));
  const label = document.createElement('span');
  label.className = 'typing-label';
  label.textContent = 'PROCESSING';
  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  const logoAnim = document.querySelector('.header-left h1 .cursor')?.getAnimations()[0];
  const elapsed = typeof logoAnim?.currentTime === 'number' ? logoAnim.currentTime : performance.now();
  cursor.style.animationDelay = `-${elapsed % 1000}ms`;
  cursor.setAttribute('aria-hidden', 'true');
  typing.appendChild(label);
  typing.appendChild(cursor);
  chat.appendChild(typing);
  chat.scrollTop = chat.scrollHeight;

  inflight = new AbortController();
  const signal = AbortSignal.any([inflight.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);

  try {
    const data = await sendQuestion(q, WEBHOOK_URL, signal);
    typing.remove();
    addAssistantMsg(data);
    setConnStatus('established');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User cancelled via CLR — CLR handles DOM cleanup.
      return;
    }
    typing.remove();
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeoutErr = err instanceof DOMException && err.name === 'TimeoutError';
    const isNetworkErr = !isTimeoutErr && (msg.includes('fetch') || msg.includes('NetworkError'));
    const isServerErr = /^HTTP 5/.test(msg);
    const isClientErr = /^HTTP 4/.test(msg);
    if (isTimeoutErr || isNetworkErr || isServerErr) setConnStatus('lost'); else setConnStatus('established');
    const userMsg =
      isTimeoutErr ? 'Request timed out. The service is slow or unreachable.' :
      isNetworkErr ? 'Connection error. Check your network.' :
      isServerErr ? 'Service unavailable. Try again later.' :
      isClientErr ? 'Request rejected by server. The service may be misconfigured.' :
      msg;
    addErrorMsg(userMsg);
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
