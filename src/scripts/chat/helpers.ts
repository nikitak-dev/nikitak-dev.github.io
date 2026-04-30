/* Pure DOM builders and validators for the chat UI. No module-level state
   beyond the `sourcesUid` counter used to generate unique IDs for the
   aria-controls wiring on collapsible source lists. */

import type { ChatResponse, MediaItem, Source } from './types';

/* Read a CSS custom property declared as seconds and return milliseconds.
   Single source of truth for timings is tokens.css. */
export function tokenMs(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n * 1000 : fallback;
}

const isSafeUrl = (u: unknown): u is string =>
  typeof u === 'string' && /^https:\/\//i.test(u);

const isSafeDriveId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id);

export function makePrefix(text: string): HTMLSpanElement {
  const prefix = document.createElement('span');
  prefix.className = 'bubble-prefix';
  prefix.textContent = text;
  return prefix;
}

function appendMultilineText(parent: HTMLElement, text: string): void {
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
  img.referrerPolicy = 'no-referrer';
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
    if (m.type === 'image') item.classList.add('msg-media-item--image');

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

function buildSourcesList(sources: Source[], animRevealMs: number, chatEl: HTMLElement): HTMLElement {
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

  const inner = document.createElement('div');
  inner.className = 'sources-tags-inner';
  tags.appendChild(inner);

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
  inner.appendChild(header);

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

    inner.appendChild(tag);
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.textContent = expanded ? 'SHOW SOURCES' : 'HIDE SOURCES';
    tags.classList.toggle('expanded');

    // When opening, smooth-scroll to reveal the expanded block after the
    // grid-template-rows transition finishes (height has settled by then).
    if (!expanded) {
      const delay = reduced ? 0 : animRevealMs;
      setTimeout(() => {
        const SCROLL_GAP = 12;
        const overflow = tags.getBoundingClientRect().bottom - chatEl.getBoundingClientRect().bottom + SCROLL_GAP;
        if (overflow > 0) {
          chatEl.scrollBy({ top: overflow, behavior: reduced ? 'auto' : 'smooth' });
        }
      }, delay);
    }
  });

  srcEl.appendChild(toggle);
  srcEl.appendChild(tags);
  return srcEl;
}

export function buildAssistantMessage(data: ChatResponse, animRevealMs: number, chatEl: HTMLElement): HTMLElement {
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
    wrapper.appendChild(buildSourcesList(data.sources, animRevealMs, chatEl));
  }

  return wrapper;
}
