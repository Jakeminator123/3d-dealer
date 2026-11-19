// Justerade gränser: det en cykel avviker från med avsikt (content/tagning-justerad.json).
//
// Originalen står i content/tagning.json (limits) och ändras inte av en avvikelse: de är satta efter den mätta verkliga
// dealern och proven. En cykel som med avsikt gör något annat (tvåhandsgiven är vänd mot skon i REDO) får sin gräns
// här, under cykelns id, och den läggs i originalets ställe bara när just den cykeln prövas: i tagning.ts forbered och
// i måtten som Labbets steg Dockan frågar servern om (src/server/rorelser.ts). Vad måttet är och dess enhet tas ur
// originalet, så en justering kan inte gälla ett mått som saknar original.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { limitText, type Limit } from './matning.ts';

/** En justerad gräns: gränsen själv och vem som sade det. */
export type Bound = Pick<Limit, 'is' | 'least' | 'most' | 'see'> & { source: string };
/** Cykelns id → måttets nyckel → den justerade gränsen. */
export type Adjusted = Record<string, Record<string, Bound>>;

export class AdjustedError extends Error {}

const FILE = 'tagning-justerad.json';
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const BOUNDS = ['is', 'least', 'most', 'see'] as const;

/** Tar emot innehållet i content/tagning-justerad.json och säger vad som saknas eller inte går ihop. */
export function readAdjustedFrom(value: unknown): Adjusted {
  const cycles = (value as { cycles?: unknown } | null)?.cycles;
  if (!cycles || typeof cycles !== 'object' || Array.isArray(cycles)) throw new AdjustedError(`${FILE}: cycles ska vara ett objekt med cyklernas id`);
  for (const [cycle, entries] of Object.entries(cycles as Record<string, unknown>)) {
    if (!ID.test(cycle)) throw new AdjustedError(`${FILE}: ogiltigt id på cykeln: ${cycle}`);
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new AdjustedError(`${FILE}: ${cycle} ska vara ett objekt med måttens nycklar`);
    for (const [key, bound] of Object.entries(entries as Record<string, Partial<Bound> | null>)) {
      const at = `${FILE}: ${cycle}.${key}`;
      if (!bound || typeof bound !== 'object') throw new AdjustedError(`${at} ska vara en gräns`);
      if (typeof bound.source !== 'string' || bound.source === '') throw new AdjustedError(`${at} saknar källa (source)`);
      if (bound.is === undefined && bound.least === undefined && bound.most === undefined) throw new AdjustedError(`${at} saknar gräns (is, least eller most)`);
      const stray = Object.keys(bound).filter((field) => field !== 'source' && !(BOUNDS as readonly string[]).includes(field));
      if (stray.length > 0) throw new AdjustedError(`${at} har annat än en gräns och en källa: ${stray.join(', ')}`);
    }
  }
  return cycles as Adjusted;
}

/** Justeringarna i content/tagning-justerad.json. Finns filen inte är ingenting justerat. */
export function readAdjusted(root: string): Adjusted {
  const path = join(root, 'content', FILE);
  return existsSync(path) ? readAdjustedFrom(JSON.parse(readFileSync(path, 'utf8'))) : {};
}

/**
 * Gränserna som cykeln `cycle` prövas mot: originalen, med cykelns justeringar i originalens ställe. Originalets gräns
 * står kvar i källan, så att den som läser omdömet ser båda. En cykel utan justeringar får originalen som de är.
 */
export function limitsFor(limits: Record<string, Limit>, adjusted: Adjusted, cycle: string): Record<string, Limit> {
  const own = adjusted[cycle];
  if (!own) return limits;
  const out = { ...limits };
  for (const [key, bound] of Object.entries(own)) {
    const original = limits[key];
    if (!original) throw new AdjustedError(`${FILE}: ${cycle}.${key} justerar en gräns som inte finns i content/tagning.json`);
    const { is: _is, least: _least, most: _most, see: _see, doll: _doll, ...kept } = original;
    const { source, ...given } = bound;
    out[key] = { ...kept, ...given, source: `Justerad för ${cycle} (content/${FILE}): ${source}. Originalet ${limitText(original)}: ${original.source}` };
  }
  return out;
}
