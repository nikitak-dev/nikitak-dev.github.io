/**
 * Audio playback + synced rendering for the voice-agent demo.
 *
 * State-ownership:
 *   - audio element + its event lifecycle (play/pause/timeupdate/ended/error)
 *   - status indicator (RING / TALKING / ENDED / UNAVAILABLE)
 *   - transcript turn highlighting + auto-scroll
 *   - events reveal-by-timestamp + active highlight
 *   - plain ↔ technical view toggle (persisted in localStorage)
 *
 * Single source of truth: audio.currentTime — every render path reads from it.
 */

import type { Scenario, Turn, TimelineEvent } from '../../data/voice-agent-scenarios';

export interface PlayerDom {
  readonly audio: HTMLAudioElement;
  readonly callerId: HTMLElement;
  readonly status: HTMLElement;
  readonly playBtn: HTMLButtonElement;
  readonly scrubber: HTMLInputElement;
  readonly timeLabel: HTMLElement;
  readonly transcript: HTMLElement;
  readonly events: HTMLElement;
  readonly eventsViewToggle: HTMLButtonElement;
  readonly heroEmpty: HTMLElement;
  readonly heroPlayer: HTMLElement;
}

type Status = 'idle' | 'talking' | 'ended' | 'unavailable';

const STATUS_TEXT: Record<Status, string> = {
  idle: '● RING',
  talking: '● TALKING',
  ended: '● ENDED',
  unavailable: '● UNAVAILABLE',
};

const SCRUBBER_RES = 1000;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let dom: PlayerDom | null = null;
let current: Scenario | null = null;

export function initPlayer(elements: PlayerDom): void {
  dom = elements;
  bindAudio();
  bindScrubber();
  bindEventsView();
}

export function loadScenario(scenario: Scenario | null): void {
  if (!dom) return;
  current = scenario;

  if (!scenario) {
    showEmpty();
    return;
  }

  showPlayer();
  dom.audio.pause();
  dom.audio.src = scenario.audioSrc;
  dom.audio.load();
  dom.audio.currentTime = 0;
  dom.callerId.textContent = scenario.callerId;
  dom.scrubber.value = '0';
  dom.timeLabel.textContent = `0:00 / ${formatTime(scenario.durationMs)}`;
  setStatus('idle');
  resetPlayButton();
  renderTranscript(scenario.turns);
  renderEvents(scenario.events);
}

function showEmpty(): void {
  if (!dom) return;
  dom.heroEmpty.hidden = false;
  dom.heroPlayer.hidden = true;
}

function showPlayer(): void {
  if (!dom) return;
  dom.heroEmpty.hidden = true;
  dom.heroPlayer.hidden = false;
}

function bindAudio(): void {
  if (!dom) return;
  const { audio, playBtn } = dom;

  playBtn.addEventListener('click', () => {
    if (!current) return;
    if (audio.paused) audio.play().catch(() => setStatus('unavailable'));
    else audio.pause();
  });

  audio.addEventListener('play', () => {
    setStatus('talking');
    playBtn.textContent = '[ ❚❚ ]';
    playBtn.setAttribute('aria-label', 'Pause demo call');
  });

  audio.addEventListener('pause', () => {
    if (!audio.ended) resetPlayButton();
  });

  audio.addEventListener('ended', () => {
    setStatus('ended');
    resetPlayButton();
  });

  audio.addEventListener('timeupdate', onTimeUpdate);
  audio.addEventListener('error', () => setStatus('unavailable'));
}

function bindScrubber(): void {
  if (!dom) return;
  const { audio, scrubber } = dom;
  scrubber.addEventListener('input', () => {
    const dur = audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    audio.currentTime = (Number(scrubber.value) / SCRUBBER_RES) * dur;
  });
}

function bindEventsView(): void {
  if (!dom) return;
  const { events, eventsViewToggle } = dom;
  const stored = readEventView();
  events.dataset['view'] = stored;
  eventsViewToggle.textContent = stored === 'plain' ? '[ show technical ]' : '[ show plain ]';

  eventsViewToggle.addEventListener('click', () => {
    if (!dom) return;
    const next = dom.events.dataset['view'] === 'plain' ? 'technical' : 'plain';
    dom.events.dataset['view'] = next;
    dom.eventsViewToggle.textContent = next === 'plain' ? '[ show technical ]' : '[ show plain ]';
    writeEventView(next);
  });
}

function onTimeUpdate(): void {
  if (!dom || !current) return;
  const tMs = dom.audio.currentTime * 1000;
  const total = current.durationMs;

  if (total > 0) {
    dom.scrubber.value = String(Math.round((tMs / total) * SCRUBBER_RES));
    dom.timeLabel.textContent = `${formatTime(tMs)} / ${formatTime(total)}`;
  }

  highlightActiveTurn(tMs);
  revealEvents(tMs);
}

function renderTranscript(turns: readonly Turn[]): void {
  if (!dom) return;
  dom.transcript.replaceChildren(...turns.map((t, i) => buildTurn(t, i)));
}

function buildTurn(turn: Turn, index: number): HTMLElement {
  const div = document.createElement('div');
  div.className = `va-turn va-turn--${turn.speaker}`;
  div.dataset['turnIndex'] = String(index);
  div.dataset['startMs'] = String(turn.startMs);
  div.dataset['endMs'] = String(turn.endMs);
  div.dataset['active'] = 'false';

  const label = document.createElement('span');
  label.className = 'va-turn-label';
  label.textContent = turn.speaker === 'sophie' ? '[Sophie]' : '[Caller]';

  const text = document.createElement('span');
  text.className = 'va-turn-text';
  text.textContent = turn.text;

  div.append(label, text);
  return div;
}

function renderEvents(events: readonly TimelineEvent[]): void {
  if (!dom) return;
  dom.events.replaceChildren(...events.map((ev, i) => buildEvent(ev, i)));
}

function buildEvent(event: TimelineEvent, index: number): HTMLElement {
  const li = document.createElement('li');
  li.className = 'va-event';
  li.dataset['eventIndex'] = String(index);
  li.dataset['atMs'] = String(event.atMs);
  li.dataset['revealed'] = 'false';
  li.dataset['active'] = 'false';

  const plain = document.createElement('span');
  plain.className = 'va-event-plain';
  plain.textContent = `→ ${event.plain}`;

  const tech = document.createElement('span');
  tech.className = 'va-event-technical';
  tech.textContent = `→ ${event.technical}`;

  li.append(plain, tech);
  return li;
}

function highlightActiveTurn(tMs: number): void {
  if (!dom) return;
  const turnEls = Array.from(dom.transcript.querySelectorAll<HTMLElement>('.va-turn'));
  const activeEl = turnEls.find(el => {
    const start = Number(el.dataset['startMs']);
    const end = Number(el.dataset['endMs']);
    return tMs >= start && tMs < end;
  }) ?? null;

  turnEls.forEach(el => {
    el.dataset['active'] = String(el === activeEl);
  });

  if (activeEl) {
    activeEl.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }
}

function revealEvents(tMs: number): void {
  if (!dom) return;
  const eventEls = Array.from(dom.events.querySelectorAll<HTMLElement>('.va-event'));
  // Latest event whose timestamp has been crossed — marked active; everything
  // below it is hidden, everything at-or-before is revealed.
  const lastRevealedIdx = eventEls.findLastIndex(el => Number(el.dataset['atMs']) <= tMs);

  eventEls.forEach((el, i) => {
    el.dataset['revealed'] = String(i <= lastRevealedIdx);
    el.dataset['active'] = String(i === lastRevealedIdx);
  });
}

function setStatus(status: Status): void {
  if (!dom) return;
  dom.status.dataset['status'] = status;
  dom.status.textContent = STATUS_TEXT[status];
}

function resetPlayButton(): void {
  if (!dom) return;
  dom.playBtn.textContent = '[ ▶ ]';
  dom.playBtn.setAttribute('aria-label', 'Play demo call');
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const EVENT_VIEW_KEY = 'va:eventView';
type EventView = 'plain' | 'technical';

function readEventView(): EventView {
  try {
    return localStorage.getItem(EVENT_VIEW_KEY) === 'technical' ? 'technical' : 'plain';
  } catch {
    return 'plain';
  }
}

function writeEventView(view: EventView): void {
  try {
    localStorage.setItem(EVENT_VIEW_KEY, view);
  } catch {
    // Storage unavailable (private mode / quota) — non-fatal, view stays in DOM.
  }
}
