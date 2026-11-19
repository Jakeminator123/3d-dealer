// Dealerna så som servern räknar deras läge (/api/dealers, DealerState i src/pipeline/dealer.ts). Labbet läser inte
// pipeline, så formen står här. Steget Dealer, översikten och steget Dockan läser dem härifrån.

import type { SeriesCard } from './takes.ts';

export type Shown = { file: string; status: string; present: boolean; title: string };
export type DealerCard = SeriesCard & { key: string; clip: (Shown & { take: number | null; move: string | null }) | null };
export type DealerView = { view: string; anchor: Shown | null; candidates: Shown[]; cards: DealerCard[]; elsewhere: { anchor: string; clips: number }[]; playable: boolean };
export type DealerState = {
  id: string;
  name: string;
  file: string;
  identity: { role: string; what: string; need: boolean; image: (Shown & { note?: string }) | null }[];
  views: DealerView[];
  packages: { kind: string; id: string; waiting: boolean }[];
  next: { what: string; commands: string[] }[];
  problems: string[];
};

export async function fetchDealers(): Promise<DealerState[]> {
  const response = await fetch('/api/dealers', { cache: 'no-store' });
  const body = (await response.json().catch(() => null)) as DealerState[] | { error?: string } | null;
  if (!response.ok || !Array.isArray(body)) throw new Error((body as { error?: string } | null)?.error ?? `Dealerna gick inte att läsa (${response.status})`);
  return body;
}

