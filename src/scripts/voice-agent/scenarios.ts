/**
 * Scenario tab-bar: builds tabs from SCENARIOS, handles click + arrow nav,
 * and asks the player to load whichever scenario the user picked.
 */

import type { Scenario } from '../../data/voice-agent-scenarios';
import { SCENARIOS } from '../../data/voice-agent-scenarios';
import { loadScenario } from './player';

export function initScenarios(tablist: HTMLElement): void {
  if (SCENARIOS.length === 0) {
    tablist.hidden = true;
    loadScenario(null);
    return;
  }

  tablist.hidden = false;
  tablist.replaceChildren(...SCENARIOS.map((s, i) => buildTab(s, i === 0)));
  loadScenario(SCENARIOS[0] ?? null);

  tablist.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
    if (!tab) return;
    activateTab(tablist, tab);
  });

  tablist.addEventListener('keydown', (e) => {
    if (!isNavKey(e.key)) return;
    const tabs = Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const idx = tabs.findIndex(t => t === document.activeElement);
    if (idx === -1) return;

    e.preventDefault();
    const next = nextIndex(e.key, idx, tabs.length);
    const target = tabs[next];
    if (!target) return;
    target.focus();
    activateTab(tablist, target);
  });
}

function buildTab(scenario: Scenario, active: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'tab');
  btn.className = 'va-tab btn-terminal';
  btn.textContent = `[ ${scenario.label} ]`;
  btn.dataset['scenarioId'] = scenario.id;
  btn.setAttribute('aria-selected', String(active));
  btn.tabIndex = active ? 0 : -1;
  return btn;
}

function activateTab(tablist: HTMLElement, target: HTMLButtonElement): void {
  const id = target.dataset['scenarioId'];
  const scenario = SCENARIOS.find(s => s.id === id) ?? null;

  tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach(t => {
    const isActive = t === target;
    t.setAttribute('aria-selected', String(isActive));
    t.tabIndex = isActive ? 0 : -1;
  });

  loadScenario(scenario);
}

type NavKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

function isNavKey(key: string): key is NavKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';
}

function nextIndex(key: NavKey, idx: number, len: number): number {
  switch (key) {
    case 'ArrowLeft':  return (idx - 1 + len) % len;
    case 'ArrowRight': return (idx + 1) % len;
    case 'Home':       return 0;
    case 'End':        return len - 1;
  }
}
