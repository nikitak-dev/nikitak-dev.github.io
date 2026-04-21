/* DOM ownership for chat messages. Orchestrator calls initMessages(chat,
   emptyState, animMs) once, then add*Msg / hideEmptyState / showEmptyState. */

import type { ChatResponse } from './types';
import { buildAssistantMessage, makePrefix } from './helpers';

let chatEl: HTMLElement | null = null;
let emptyStateEl: HTMLElement | null = null;
let animContentMs = 500;
let animRevealMs = 500;

export function initMessages(
  chat: HTMLElement,
  emptyState: HTMLElement | null,
  contentMs: number,
  revealMs: number,
): void {
  chatEl = chat;
  emptyStateEl = emptyState;
  animContentMs = contentMs;
  animRevealMs = revealMs;
}

function appendAndScroll(el: HTMLElement): void {
  chatEl!.appendChild(el);
  chatEl!.scrollTop = chatEl!.scrollHeight;
}

function hideEmptyState(): void {
  if (emptyStateEl && !emptyStateEl.classList.contains('hidden')) {
    // BaseLayout's cascade `release()` pins inline `animation: none; opacity: 1`
    // after the fadeIn ends. Clear both so the `.hidden` fadeSlideOut can run.
    emptyStateEl.style.animation = '';
    emptyStateEl.style.opacity = '';
    emptyStateEl.classList.add('hidden');
  }
}

export function showEmptyState(): void {
  if (!emptyStateEl) return;
  emptyStateEl.classList.remove('hidden');
  emptyStateEl.style.animation = 'none';
  emptyStateEl.style.opacity = '1';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  emptyStateEl.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: reducedMotion ? 0 : animContentMs, easing: 'ease-out' },
  );
}

export function addUserMsg(text: string): void {
  hideEmptyState();
  const div = document.createElement('div');
  div.className = 'msg user bubble bubble--right';
  div.appendChild(makePrefix('YOU >'));
  div.appendChild(document.createTextNode(text));
  appendAndScroll(div);
}

export function addAssistantMsg(data: ChatResponse): void {
  hideEmptyState();
  appendAndScroll(buildAssistantMessage(data, animRevealMs, chatEl!));
}

export function addErrorMsg(text: string): void {
  hideEmptyState();
  const div = document.createElement('div');
  div.className = 'msg error bubble bubble--left bubble--error';
  div.appendChild(makePrefix('< ERR'));
  div.appendChild(document.createTextNode(text));
  appendAndScroll(div);
}

/* Build the "< SYS | PROCESSING" typing indicator. Delay syncs with the logo
   cursor's current animation offset so both blink in unison. Returns the
   created element so the orchestrator can remove it later. */
export function addTypingIndicator(): HTMLElement {
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
  chatEl!.appendChild(typing);
  chatEl!.scrollTop = chatEl!.scrollHeight;
  return typing;
}
