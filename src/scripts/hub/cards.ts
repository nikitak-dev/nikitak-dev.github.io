/* Project-card selection + keyboard navigation. Digits 1-9 jump to a card,
   arrows cycle selection, Enter launches, Escape deselects. Suppressed while
   any modal is open, and while the boot screen is active (the caller passes
   an isBootActive predicate so this module doesn't need to know about boot). */

type IsActive = () => boolean;

export function initCardNav(isBootActive: IsActive): void {
  const cards = document.querySelectorAll<HTMLElement>('.project-card');
  if (!cards.length) return;

  let selectedCard: HTMLElement | null = null;

  function selectCard(card: HTMLElement | null): void {
    if (selectedCard) {
      selectedCard.classList.remove('selected');
      selectedCard.classList.remove('kb-pulse');
    }
    selectedCard = card ?? null;
    if (selectedCard) selectedCard.classList.add('selected');
    /* Drop stale Tab focus on any other card so its :focus-visible clears. */
    cards.forEach(c => { if (c !== selectedCard && c === document.activeElement) (c as HTMLElement).blur(); });
  }

  function isNavigable(card: HTMLElement | null | undefined): boolean {
    const url = card?.dataset.url;
    return !!url && url !== '#';
  }

  function launchSelected(): void {
    if (!selectedCard) return;
    const btn = selectedCard.querySelector<HTMLButtonElement>('.card-launch');
    if (btn && btn.disabled) return;
    if (isNavigable(selectedCard)) window.location.href = selectedCard.dataset.url!;
  }

  function kbPulse(card: HTMLElement | null): void {
    if (!card) return;
    card.classList.remove('kb-pulse');
    void card.offsetWidth;
    card.classList.add('kb-pulse');
  }

  cards.forEach(card => {
    card.addEventListener('click', () => {
      selectCard(card);
      /* Skip pulse on navigating click — anchor navigation itself is the feedback.
         For non-navigable cards (private/wip), pulse is the only response. */
      if (!isNavigable(card)) kbPulse(card);
    });
    /* Tab focus only — highlight via :focus-visible CSS, no .selected state.
       But clear any prior .selected so two cards aren't highlighted at once. */
    card.addEventListener('focus', () => {
      if (!card.matches(':focus-visible')) return;
      if (selectedCard && selectedCard !== card) {
        selectedCard.classList.remove('selected', 'kb-pulse');
        selectedCard = null;
      }
      kbPulse(card);
    });
  });

  document.addEventListener('click', e => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('.project-card')) selectCard(null);
  });

  document.addEventListener('keydown', e => {
    if (isBootActive()) return;
    /* Suppress hub shortcuts while a modal is open — Esc/Enter/digits belong to the dialog */
    if (document.body.classList.contains('modal-open')) return;
    /* For arrow nav, use Tab-focused card as starting point if nothing is selected */
    const active = document.activeElement as HTMLElement | null;
    const focusedCard = active?.closest<HTMLElement>('.project-card');
    const baseIdx = selectedCard
      ? Array.from(cards).indexOf(selectedCard)
      : focusedCard ? Array.from(cards).indexOf(focusedCard) : -1;
    if (/^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key) - 1;
      if (cards[idx]) { selectCard(cards[idx]!); kbPulse(cards[idx]!); }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (baseIdx + 1) % cards.length;
      selectCard(cards[nextIdx]!); kbPulse(cards[nextIdx]!);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (baseIdx - 1 + cards.length) % cards.length;
      selectCard(cards[prevIdx]!); kbPulse(cards[prevIdx]!);
    } else if (e.key === 'Enter') {
      launchSelected();
    } else if (e.key === 'Escape') {
      selectCard(null);
    }
  });
}
