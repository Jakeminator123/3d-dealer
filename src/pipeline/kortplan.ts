// Sparar kortplanen som Labbet ställer (steget Kortplan) i content/scene.json: spelarnas båge (places.arc), dealerns rad
// (places.row) och kortens storlek på bordet (card.onTable.scale), och klippens fart i content/runda.json (speed.clips).
// Bara de talen tas emot, prövade mot gränserna i src/scene/plan.ts (readPlan); allt annat i filerna står kvar tecken
// för tecken, en fil skrivs bara när dess tal har ändrats, och varje sparad grupp får tiden den ställdes i Labbet
// (`setInLab`). Servern (/api/kortplan) är vägen hit.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { readScene } from '../scene/description.ts';
import { planOf, PlanError, readPlan, type CardPlan } from '../scene/plan.ts';
import { readRound } from '../scene/round.ts';

export { PlanError } from '../scene/plan.ts';

/** Ett värde skrivet som filen skriver korta grupper: på en rad, med mellanslag efter kolon och komma. */
function compact(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(compact).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([key, inner]) => `${JSON.stringify(key)}: ${compact(inner)}`).join(', ')} }`;
  return JSON.stringify(value);
}

/**
 * Var värdet för nyckeln `path` står i JSON-texten `text`: början och slutet, som teckenläge. Texten läses tecken för
 * tecken, med strängar och nivåer, så att samma namn på en annan nivå inte tas. Null när nyckeln inte finns.
 */
export function valueSpan(text: string, path: string[]): [number, number] | null {
  let at = 0;
  const space = () => {
    while (at < text.length && /\s/.test(text[at]!)) at++;
  };
  const string = (): string => {
    const start = at;
    at++;
    while (text[at] !== '"') at += text[at] === '\\' ? 2 : 1;
    at++;
    return JSON.parse(text.slice(start, at)) as string;
  };
  // Hoppar över ett värde och ger dess slut.
  const skip = (): void => {
    space();
    const first = text[at];
    if (first === '"') return void string();
    if (first === '{' || first === '[') {
      const close = first === '{' ? '}' : ']';
      at++;
      for (;;) {
        space();
        if (text[at] === close) return void at++;
        if (first === '{') {
          string();
          space();
          at++; // :
        }
        skip();
        space();
        if (text[at] === ',') at++;
      }
    }
    while (at < text.length && !/[\s,}\]]/.test(text[at]!)) at++;
  };
  // Går ned genom objekten längs vägen.
  const find = (depth: number): [number, number] | null => {
    space();
    if (text[at] !== '{') return null;
    at++;
    for (;;) {
      space();
      if (text[at] === '}') return null;
      const key = string();
      space();
      at++; // :
      space();
      if (key === path[depth]) {
        if (depth === path.length - 1) {
          const start = at;
          skip();
          return [start, at];
        }
        return find(depth + 1);
      }
      skip();
      space();
      if (text[at] === ',') at++;
    }
  };
  try {
    return find(0);
  } catch {
    return null;
  }
}

/** Texten i filen `name` med värdet för `path` utbytt mot `value`, skrivet i filens korta form. */
function replaced(text: string, path: string[], value: unknown, name: string): string {
  const span = valueSpan(text, path);
  if (!span) throw new PlanError(`${name} saknar ${path.join('.')}`);
  return text.slice(0, span[0]) + compact(value) + text.slice(span[1]);
}

/**
 * Byter `setInLab` i gruppen `path`, eller lägger det på en egen rad före gruppens `basis`, med samma indrag: ingen
 * annan rad ändras.
 */
function stamped(text: string, path: string[], when: string, name: string): string {
  const known = valueSpan(text, [...path, 'setInLab']);
  if (known) return text.slice(0, known[0]) + JSON.stringify(when) + text.slice(known[1]);
  const basis = valueSpan(text, [...path, 'basis']);
  if (!basis) throw new PlanError(`${name} saknar ${[...path, 'basis'].join('.')}`);
  const lineStart = text.lastIndexOf('\n', basis[0]) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart))![0];
  return `${text.slice(0, lineStart)}${indent}"setInLab": ${JSON.stringify(when)},\n${text.slice(lineStart)}`;
}

/**
 * Texten `next` att skriva i filen `name`, prövad: den ska vara filen som den var med de nya talen och tiden
 * (`expected`), inget annat, och gå att läsa med `read`. Annars skrivs ingenting.
 */
function checked(next: string, expected: unknown, name: string, read: (value: unknown) => unknown): string {
  let written: unknown;
  try {
    written = JSON.parse(next);
  } catch {
    throw new Error(`Kortplanen gick inte att skriva: texten blev inte JSON. ${name} är orörd.`);
  }
  if (!isDeepStrictEqual(written, expected)) throw new Error(`Kortplanen gick inte att skriva utan att röra annat i ${name}. Filen är orörd.`);
  read(written);
  return next;
}

type Group = Record<string, unknown>;
type SceneFile = { places: Group; card: Group & { onTable: Group } };

/**
 * Sparar kortplanen `value` (som Labbet skickar den) under `root`: bågen, raden och storleken i content/scene.json, och
 * farten, när den sägs, i content/runda.json. Talen prövas först (readPlan); antalet platser och kortplatser, källorna
 * och allt annat står kvar. En fil skrivs bara när dess tal har ändrats. Varje fil prövas innan någon skrivs och ska
 * vara precis den förra med de nya talen; annars skrivs ingenting. `when` är tiden som den skrivs i registret,
 * "ÅÅÅÅ-MM-DD TT:MM". Ger planen som den står efteråt.
 */
export function savePlan(root: string, value: unknown, when: string): CardPlan {
  const sceneFile = join(root, 'content', 'scene.json');
  const text = readFileSync(sceneFile, 'utf8');
  const whole = JSON.parse(text) as SceneFile;
  const scene = readScene(JSON.parse(text));
  const plan = readPlan(value, scene);
  const { speed, ...cards } = plan;
  const stamp = `Jakob i Labbet ${when}`;
  const writes: { file: string; text: string }[] = [];

  if (!isDeepStrictEqual(planOf(scene), cards)) {
    // Bågens och radens antal står kvar; fälten står i samma ordning som förut.
    const arc = { ...(whole.places.arc as Group), ...plan.arc };
    const row = { ...(whole.places.row as Group), ...plan.row };
    const name = 'content/scene.json';
    let next = replaced(text, ['places', 'arc'], arc, name);
    next = replaced(next, ['places', 'row'], row, name);
    next = replaced(next, ['card', 'onTable', 'scale'], plan.scale, name);
    next = stamped(next, ['places'], stamp, name);
    next = stamped(next, ['card', 'onTable'], stamp, name);
    const expected = JSON.parse(text) as SceneFile;
    Object.assign(expected.places, { arc, row, setInLab: stamp });
    Object.assign(expected.card.onTable, { scale: plan.scale, setInLab: stamp });
    writes.push({ file: sceneFile, text: checked(next, expected, name, readScene) });
  }

  if (speed !== undefined) {
    const roundFile = join(root, 'content', 'runda.json');
    const roundText = readFileSync(roundFile, 'utf8');
    if (readRound(JSON.parse(roundText)).speed.clips !== speed) {
      const name = 'content/runda.json';
      const next = stamped(replaced(roundText, ['speed', 'clips'], speed, name), ['speed'], stamp, name);
      const expected = JSON.parse(roundText) as { speed: Group };
      Object.assign(expected.speed, { clips: speed, setInLab: stamp });
      writes.push({ file: roundFile, text: checked(next, expected, name, readRound) });
    }
  }

  for (const { file, text: next } of writes) {
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, next);
    renameSync(temporary, file);
  }
  return plan;
}
