/**
 * Voice-agent page bootstrap. Resolves DOM nodes once, hands them to the
 * player module, then wires the scenario tab-bar.
 */

import { initPlayer } from './player';
import { initScenarios } from './scenarios';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} not found`);
  return node as T;
}

initPlayer({
  audio: el<HTMLAudioElement>('va-audio'),
  callerId: el('va-caller-id'),
  status: el('va-status'),
  playBtn: el<HTMLButtonElement>('va-play'),
  scrubber: el<HTMLInputElement>('va-scrubber'),
  timeLabel: el('va-time'),
  transcript: el('va-transcript'),
  events: el('va-events'),
  eventsViewToggle: el<HTMLButtonElement>('va-events-toggle'),
  heroEmpty: el('va-empty'),
  heroPlayer: el('va-player'),
});

initScenarios(el('va-tablist'));

export {};
