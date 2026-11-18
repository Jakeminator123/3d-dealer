// Var i Labbet man står, buret av adressens del efter #. Då går en vy att ladda om och att peka på.

import { useSyncExternalStore } from 'react';

function subscribe(changed: () => void): () => void {
  window.addEventListener('hashchange', changed);
  return () => window.removeEventListener('hashchange', changed);
}

/** Adressens delar, till exempel ['granska', 'backgrounds', '5']. */
export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

export const routeTo = (...parts: (string | number)[]): string =>
  `#${parts.map((part) => encodeURIComponent(String(part))).join('/')}`;
