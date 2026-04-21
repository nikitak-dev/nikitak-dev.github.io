/* Rotating placeholder typewriter on the chat input. Cycles through a short
   list of example queries, typing and erasing each on loop. Clicking the
   empty input copies the current suggestion in. Reduced-motion short-circuits
   to a static placeholder. */

const QUERIES = [
  'What is symmetric encryption?',
  'Explain the Agile sprint cycle',
  'What SQL join types are covered?',
];

export function startPlaceholderCycle(input: HTMLInputElement): void {
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
}
