/* Connection-status indicator + fetch-error taxonomy. Owns the #conn-status
   DOM element; the orchestrator wires it via initConn and calls setConnStatus
   / classifyError as the chain progresses. */

import type { ConnState } from './types';

let connStatusEl: HTMLElement | null = null;

export function initConn(el: HTMLElement | null): void {
  connStatusEl = el;
}

const LABELS: Record<ConnState, string> = {
  established: 'ESTABLISHED',
  lost: 'LOST',
  missing: 'MISSING',
};

export function setConnStatus(state: ConnState): void {
  if (!connStatusEl) return;
  connStatusEl.textContent = `[ CONN: ${LABELS[state]} ]`;
  connStatusEl.className = state === 'established' ? 'status-block-live' : 'status-block-dead';
}

type ClassifiedError = {
  /* Whether the user's cancel triggered this — callers skip UI retirement. */
  aborted: boolean;
  /* Only meaningful when aborted is false. */
  state?: ConnState;
  userMsg?: string;
};

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { aborted: true };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const isTimeoutErr = err instanceof DOMException && err.name === 'TimeoutError';
  const isNetworkErr = !isTimeoutErr && (msg.includes('fetch') || msg.includes('NetworkError'));
  const isServerErr = /^HTTP 5/.test(msg);
  const isClientErr = /^HTTP 4/.test(msg);
  const state: ConnState = (isTimeoutErr || isNetworkErr || isServerErr) ? 'lost' : 'established';
  const userMsg =
    isTimeoutErr ? 'Request timed out. The service is slow or unreachable.' :
    isNetworkErr ? 'Connection error. Check your network.' :
    isServerErr ? 'Service unavailable. Try again later.' :
    isClientErr ? 'Request rejected by server. The service may be misconfigured.' :
    msg;
  return { aborted: false, state, userMsg };
}
