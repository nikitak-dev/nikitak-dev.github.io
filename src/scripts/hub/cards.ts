/* Project-card selection + keyboard navigation. Digits 1-9 jump to a card,
   arrows cycle selection, Enter launches, Escape deselects. Suppressed while
   any modal is open, and while the intro overlay is active (the caller passes
   an isIntroActive predicate so this module doesn't need to know about intro).

   Selection and focus are kept in lockstep so there is never a `.selected` glow
   competing with a stray Tab-focus ring: keyboard navigation moves DOM focus onto
   the target card's interactive element, and selection follows keyboard focus. */

type IsActive = () => boolean;

export function initCardNav(isIntroActive: IsActive): void {
  const cards = document.querySelectorAll<HTMLElement>('.project-card');
  if (!cards.length) return;

  let selectedCard: HTMLElement | null = null;

  function selectCard(card: HTMLElement | null): void {
    if (selectedCard && selectedCard !== card) {
      selectedCard.classList.remove('selected', 'kb-pulse');
    }
    selectedCard = card ?? null;
    if (selectedCard) selectedCard.classList.add('selected');
  }

  function isNavigable(card: HTMLElement | null | undefined): boolean {
    const url = card?.dataset.url;
    return !!url && url !== '#';
  }

  /* The real <button aria-controls> on an `action: 'about'` card. DocsModal auto-wires
     it to open the matching dialog; we only relay card-level activation onto it. */
  function aboutButton(card: HTMLElement | null | undefined): HTMLButtonElement | null {
    return card?.querySelector<HTMLButtonElement>('.card-launch[aria-controls]') ?? null;
  }

  /* The element that actually takes focus for a card: the card itself when it is the
     interactive node (`<a>` page card), otherwise its inner ABOUT button. */
  function focusTarget(card: HTMLElement): HTMLElement {
    return isNavigable(card) ? card : (aboutButton(card) ?? card);
  }

  function kbPulse(card: HTMLElement | null): void {
    if (!card) return;
    card.classList.remove('kb-pulse');
    void card.offsetWidth;
    card.classList.add('kb-pulse');
  }

  /* Keyboard selection: mark the card selected AND move focus onto it, so the single
     card glow (.selected / :focus-visible / :has(:focus-visible)) is the only highlight
     and any prior focus ring is cleared by the focus move itself. */
  function focusCard(card: HTMLElement): void {
    selectCard(card);
    kbPulse(card);
    focusTarget(card).focus({ preventScroll: true });
  }

  function launchSelected(): void {
    if (!selectedCard) return;
    if (isNavigable(selectedCard)) { window.location.href = selectedCard.dataset.url!; return; }
    const btn = aboutButton(selectedCard);
    if (btn && !btn.disabled) btn.click();
  }

  cards.forEach(card => {
    card.addEventListener('click', e => {
      selectCard(card);
      /* `about` cards open their modal on any in-card click; relay to the real
         aria-controls button unless the click already landed on it (it self-wires). */
      const btn = aboutButton(card);
      if (btn && !btn.disabled) {
        const onButton = e.target instanceof Element && e.target.closest('.card-launch');
        if (!onButton) btn.click();
        return;
      }
      /* Skip pulse on navigating click — anchor navigation itself is the feedback.
         For non-navigable cards (private/wip), pulse is the only response. */
      if (!isNavigable(card)) kbPulse(card);
    });
  });

  /* Selection follows keyboard focus: Tabbing onto a card (or its inner ABOUT button)
     makes it the selected card and drops any prior selection, while Tabbing onto
     anything outside the card zone (header, legend, footer) clears the selection —
     so a stale `.selected` glow can never linger while the focus ring sits elsewhere.
     Mouse focus (:focus-visible false) is left to the click handler. focusin (not
     focus) is used because it bubbles. */
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.matches(':focus-visible')) return;
    const card = el.closest<HTMLElement>('.project-card');
    if (!card) { selectCard(null); return; }
    if (card !== selectedCard) { selectCard(card); kbPulse(card); }
  });

  document.addEventListener('click', e => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('.project-card')) selectCard(null);
  });

  document.addEventListener('keydown', e => {
    if (isIntroActive()) return;
    /* Suppress hub shortcuts while a modal is open — Esc/Enter/digits belong to the dialog */
    if (document.body.classList.contains('modal-open')) return;
    /* For arrow nav, use the Tab-focused card as starting point if nothing is selected */
    const active = document.activeElement as HTMLElement | null;
    const focusedCard = active?.closest<HTMLElement>('.project-card');
    const baseIdx = selectedCard
      ? Array.from(cards).indexOf(selectedCard)
      : focusedCard ? Array.from(cards).indexOf(focusedCard) : -1;
    if (/^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key) - 1;
      if (cards[idx]) focusCard(cards[idx]!);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusCard(cards[(baseIdx + 1) % cards.length]!);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      focusCard(cards[(baseIdx - 1 + cards.length) % cards.length]!);
    } else if (e.key === 'Enter') {
      launchSelected();
    } else if (e.key === 'Escape') {
      /* Deselect and drop the focus ring so nothing stays highlighted. */
      const focused = selectedCard ? focusTarget(selectedCard) : focusedCard;
      selectCard(null);
      focused?.blur();
    }
  });
}