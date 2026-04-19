/* Keyboard activation mirrors the mouse: while Enter (or Space on a button)
   is held, the target gets `.kbd-press`; activation (click/navigation) is
   deferred until keyup. Enter in the chat input presses #send instead. */

const PRESS_KEYS = new Set(['Enter', ' ']);
const pressed = new Set<HTMLElement>();
let pendingClick: HTMLElement | null = null;

function isPressable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.tagName === 'BUTTON') return true;
  if (el.tagName === 'A' && el.hasAttribute('href')) return true;
  if (el.classList.contains('project-card')) return true;
  return false;
}

function applyPress(el: HTMLElement): void {
  if (pressed.has(el)) return;
  el.classList.add('kbd-press');
  pressed.add(el);
}

function cancel(): void {
  pressed.forEach(el => el.classList.remove('kbd-press'));
  pressed.clear();
  pendingClick = null;
}

document.addEventListener('keydown', (e) => {
  if (!PRESS_KEYS.has(e.key)) return;
  const active = document.activeElement;

  /* Chat input: Enter presses #send, defer activation to keyup. */
  if (e.key === 'Enter' && active instanceof HTMLElement &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    if (active.id === 'question') {
      const send = document.getElementById('send') as HTMLButtonElement | null;
      if (send && !send.disabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) {
          applyPress(send);
          pendingClick = send;
        }
      }
    }
    return;
  }

  if (!isPressable(active)) return;

  /* Defer activation to keyup for Enter (all targets) and for Space on
     non-<button> targets (anchors, cards). Space on <button> keeps the
     native keyup→click path — we only track the visual press. */
  const isButton = active.tagName === 'BUTTON';
  const defer = e.key === 'Enter' || !isButton;

  if (defer) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) {
      applyPress(active);
      pendingClick = active;
    }
  } else if (!e.repeat) {
    applyPress(active);
  }
}, true);

document.addEventListener('keyup', (e) => {
  if (!PRESS_KEYS.has(e.key)) return;
  const target = pendingClick;
  cancel();
  if (target) target.click();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancel();
});

window.addEventListener('blur', cancel);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancel();
});
