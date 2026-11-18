// Dealern: hennes fil i content/dealers/<id>.json, orden som texterna fylls med, och var hon står på vägen till spelbar,
// ur filen och registret.
//
//   node src/pipeline/dealer.ts [<id>]
//     Utan id: dealerna som har en fil. Med id: hennes identitetsbilder, REDO-ankaret per vy, klippen per plats och kort
//     (registrets seat, index och action), och nästa steg med kommandona. Labbets steg Dealer visar samma sak, genom
//     servern (/api/dealers).
//
// Mallen står i content/dealer.json: vad filen bär, identitetsbildernas slag (roles), orden (looks) och vad som krävs
// för att hon ska vara spelbar ur en vy (series). Texterna med platshållare står i content/identitet.json,
// content/ankare.json och content/tagning.json; fillText fyller dem. Ingenting här avgör något i spelet.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { studioRoot, viewRegistry, type RegistryEntry } from './registry.ts';

export class DealerError extends Error {}

const ROOT = studioRoot();
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VIEW = /^(spelaren|plats-[1-9])$/;

// ---------------------------------------------------------------------------------------------------------------------
// Mallen och filen

export type Role = { what: string; tag?: string; need: boolean };
export type Pronoun = 'she' | 'he';
export type Mall = {
  roles: Record<string, Role>;
  looks: { keys: Record<string, string>; uniform: string; people: Record<Pronoun, string>; pronouns: Record<Pronoun, Record<'she' | 'She' | 'her' | 'Her', string>> };
  series: { first: string[]; then: string[] };
};

/** Orden om just henne, på engelska som texterna. Det som inte står gäller inte henne (content/dealer.json, looks.keys). */
export type Looks = { pronoun: Pronoun; person?: string; hair?: string; outfit?: string; jewellery?: string; marks?: string; handMarks?: string; basis: string; source: string };
export type IdentityImage = { file: string; shows: string; note?: string };
export type Dealer = {
  id: string;
  name: string;
  looks: Looks;
  identity: { images: IdentityImage[]; basis: string; source: string };
  anchors: { redo: Record<string, string>; basis: string; source: string };
  [field: string]: unknown;
};

const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const marked = (group: unknown): boolean => {
  const value = group as { basis?: unknown; source?: unknown } | undefined;
  return (value?.basis === 'mätt' || value?.basis === 'antaget') && typeof value?.source === 'string';
};

export function readMall(root = ROOT): Mall {
  const read = json(join(root, 'content', 'dealer.json')) as Mall & Record<string, unknown>;
  const wrong: string[] = [];
  for (const group of ['roles', 'looks', 'series'] as const) if (!marked(read[group])) wrong.push(`${group}: basis och source`);
  const roles = Object.fromEntries(Object.entries(read.roles ?? {}).filter(([key]) => key !== 'basis' && key !== 'source')) as Record<string, Role>;
  for (const [key, role] of Object.entries(roles)) if (typeof role.what !== 'string' || typeof role.need !== 'boolean' || (role.need && typeof role.tag !== 'string')) wrong.push(`roles.${key}: what, need, och tag när need`);
  if (!roles['källa']) wrong.push('roles.källa saknas');
  if (typeof read.looks?.uniform !== 'string' || !read.looks.pronouns?.she || !read.looks.pronouns?.he || !read.looks.people?.she) wrong.push('looks: uniform, people och pronouns för she och he');
  for (const card of [...(read.series?.first ?? []), ...(read.series?.then ?? [])]) if (!seriesCard(card)) wrong.push(`series: ${card} är inte plats/kort[/handling]`);
  if (wrong.length > 0) throw new DealerError(`content/dealer.json går inte att använda: ${wrong.join('; ')}`);
  return { roles, looks: read.looks, series: read.series };
}

export const dealerPath = (root: string, id: string): string => join(root, 'content', 'dealers', `${id}.json`);
export const dealerFile = (id: string): string => `content/dealers/${id}.json`;

/** Dealerns fil, prövad mot mallen. */
export function readDealer(root: string, id: string, mall = readMall(root)): Dealer {
  if (!ID.test(id)) throw new DealerError(`Ogiltigt id för en dealer: ${id} (små bokstäver, siffror och bindestreck)`);
  const path = dealerPath(root, id);
  if (!existsSync(path)) throw new DealerError(`${dealerFile(id)} finns inte. Börja med: node src/pipeline/identitet.ts ny ${id} "<Namn>" <bild>`);
  const read = json(path) as Dealer;
  const wrong: string[] = [];
  if (read.id !== id) wrong.push(`id ska vara ${id}`);
  if (typeof read.name !== 'string' || read.name === '') wrong.push('name');
  for (const group of ['looks', 'identity', 'anchors'] as const) if (!marked(read[group])) wrong.push(`${group}: basis och source`);
  if (read.looks?.pronoun !== 'she' && read.looks?.pronoun !== 'he') wrong.push('looks.pronoun: she eller he');
  for (const [key, value] of Object.entries(read.looks ?? {})) {
    if (key === 'basis' || key === 'source') continue;
    if (!(key in mall.looks.keys)) wrong.push(`looks.${key} är inget ord i content/dealer.json (looks.keys: ${Object.keys(mall.looks.keys).join(', ')})`);
    else if (typeof value !== 'string' || value.trim() === '') wrong.push(`looks.${key}: en text`);
  }
  for (const image of read.identity?.images ?? []) {
    if (typeof image?.file !== 'string' || !image.file.startsWith(`dealers/${id}/`)) wrong.push(`identity.images: ${JSON.stringify(image?.file)} ligger inte under dealers/${id}/`);
    if (!(image?.shows in mall.roles)) wrong.push(`identity.images: ${image?.file} visar ${JSON.stringify(image?.shows)}, inget av ${Object.keys(mall.roles).join(', ')}`);
  }
  if (!Array.isArray(read.identity?.images)) wrong.push('identity.images: en lista');
  for (const [view, file] of Object.entries(read.anchors?.redo ?? {})) {
    if (!VIEW.test(view)) wrong.push(`anchors.redo.${view}: vyn är spelaren eller plats-N`);
    if (typeof file !== 'string' || !file.startsWith(`dealers/${id}/anchors/`)) wrong.push(`anchors.redo.${view}: ${JSON.stringify(file)} ligger inte under dealers/${id}/anchors/`);
  }
  if (wrong.length > 0) throw new DealerError(`${dealerFile(id)} går inte att använda: ${wrong.join('; ')}`);
  return read;
}

/** Dealerna som har en fil, i bokstavsordning. */
export function listDealers(root = ROOT): string[] {
  const dir = join(root, 'content', 'dealers');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && ID.test(name.slice(0, -5)))
    .map((name) => name.slice(0, -5))
    .sort();
}

/** Skriver dealerns fil, med en rad per bild och per vy, och byter den hel (först en fil bredvid, sedan namnet). */
export function writeDealer(root: string, dealer: Dealer): void {
  const path = dealerPath(root, dealer.id);
  const text = `${JSON.stringify(dealer, null, 2)}\n`.replace(/\{\n\s+"file": ("[^"]*"),\n\s+"shows": ("[^"]*")(,\n\s+"note": ("(?:[^"\\]|\\.)*"))?\n\s+\}/g, (_all, file, shows, _more, note) =>
    `{ "file": ${file}, "shows": ${shows}${note ? `, "note": ${note}` : ''} }`,
  );
  writeFileSync(`${path}.ny`, text);
  renameSync(`${path}.ny`, path);
}

/** Bilden linjen använder för ett slag: den första i dealerns lista som visar det, eller null. */
export const roleFile = (dealer: Dealer, role: string): string | null => dealer.identity.images.find((image) => image.shows === role)?.file ?? null;
/** Vyns REDO-ankare enligt dealerns fil, eller null. */
export const anchorFor = (dealer: Dealer, view: string): string | null => dealer.anchors.redo[view] ?? null;

// ---------------------------------------------------------------------------------------------------------------------
// Orden och texterna

export type Words = Record<string, string | undefined>;

/**
 * Orden som texterna fylls med: dealerns looks, med pronomenen ({she}, {She}, {her}, {Her}), {person} ur pronomenet när
 * filen inte säger, {outfit} ur mallens uniform när filen inte säger, och {name}. `more` lägger till ord för en text
 * (till exempel rutnätets steg i ankarets).
 */
export function wordsOf(dealer: Dealer, mall: Mall, more: Words = {}): Words {
  const { basis: _basis, source: _source, pronoun, ...looks } = dealer.looks;
  return {
    ...mall.looks.pronouns[pronoun],
    person: looks.person ?? mall.looks.people[pronoun],
    outfit: looks.outfit ?? mall.looks.uniform,
    ...looks,
    name: dealer.name,
    ...more,
  };
}

const present = (value: string | undefined): value is string => typeof value === 'string' && value !== '';

/** Var platshållaren som börjar vid `at` (en `{`) slutar: läget för dess `}`. */
function closing(text: string, at: number): number {
  let depth = 0;
  for (let k = at; k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}' && --depth === 0) return k;
  }
  throw new DealerError(`Texten har en { utan }: "${text.slice(at, at + 40)}…"`);
}

/**
 * Fyller en text: `{ord}` blir ordet (ett fel om det saknas), `{ord?text}` blir texten när ordet finns och `{ord!text}`
 * när det inte gör det. Texten i en villkorad del fylls också, så att `{handMarks?{Her} hands carry {handMarks}.}` går.
 */
export function fillText(template: string, words: Words): string {
  let out = '';
  let at = 0;
  while (at < template.length) {
    const open = template.indexOf('{', at);
    const shut = template.indexOf('}', at);
    if (shut >= 0 && (open < 0 || shut < open)) throw new DealerError(`Texten har en } utan {: "${template.slice(Math.max(0, shut - 40), shut + 1)}"`);
    if (open < 0) {
      out += template.slice(at);
      break;
    }
    out += template.slice(at, open);
    const end = closing(template, open);
    const inner = template.slice(open + 1, end);
    const match = /^(\w+)(?:([?!])([\s\S]*))?$/.exec(inner);
    if (!match) throw new DealerError(`Okänd platshållare: {${inner.slice(0, 40)}}`);
    const [, key, sign, text] = match;
    if (!sign) {
      if (!present(words[key!])) throw new DealerError(`Ordet ${key} saknas för texten`);
      out += words[key!];
    } else if ((sign === '?') === present(words[key!])) out += fillText(text!, words);
    at = end + 1;
  }
  return out;
}

/** Orden en text frågar efter, också i villkorade delar. */
export function placeholdersOf(template: string): string[] {
  const found = new Set<string>();
  for (let at = template.indexOf('{'); at >= 0; at = template.indexOf('{', at + 1)) {
    const key = /^\{(\w+)/.exec(template.slice(at))?.[1];
    if (key) found.add(key);
  }
  return [...found];
}

/** Orden en dealer kan bära i texterna: looks.keys utom pronomenet, pronomenens fyra och name. */
export const wordKeys = (mall: Mall): string[] => [...Object.keys(mall.looks.keys).filter((key) => key !== 'pronoun'), 'she', 'She', 'her', 'Her', 'name'];

/** En text som stycken (en lista) eller en enda text, fylld: styckena skiljs av en tom rad. */
export const fillParagraphs = (paragraphs: string | string[], words: Words): string =>
  (Array.isArray(paragraphs) ? paragraphs : [paragraphs]).map((paragraph) => fillText(paragraph, words).replace(/ {2,}/g, ' ').trim()).join('\n\n');

// ---------------------------------------------------------------------------------------------------------------------
// Serien: korten en vy behöver för att dealern ska vara spelbar

export type SeriesCard = { seat: number | 'D'; index: number; action: string; key: string };

/** Ett kort i serien ur "plats/kort[/handling]": "4/0", "D/1/hole". Null när texten inte har den formen. */
export function seriesCard(text: string): SeriesCard | null {
  const match = /^([1-7]|D)\/(\d)(?:\/(deal|hole|flip|wait))?$/.exec(text);
  if (!match) return null;
  const seat = match[1] === 'D' ? 'D' : Number(match[1]);
  const index = Number(match[2]);
  const action = match[3] ?? 'deal';
  return { seat, index, action, key: `${seat}/${index}/${action}` };
}

/** Kortet i ord: "plats 4, kort 0", "dealerns kort 1, hålkortet", "väntan". */
export function cardLabel(card: Pick<SeriesCard, 'seat' | 'index' | 'action'>): string {
  if (card.action === 'wait') return 'väntan i REDO';
  const where = card.seat === 'D' ? `dealerns kort ${card.index}` : `plats ${card.seat}, kort ${card.index}`;
  return card.action === 'hole' ? `${where}, hålkortet` : card.action === 'flip' ? `${where}, vändningen` : where;
}

// ---------------------------------------------------------------------------------------------------------------------
// Var hon står

type Entry = RegistryEntry & { present?: boolean };
export type Shown = { file: string; status: string; present: boolean; title: string };
export type IdentityState = { role: string; what: string; need: boolean; image: (Shown & { note?: string }) | null };
export type ClipState = Shown & { take: number | null; move: string | null };
export type CardState = SeriesCard & { label: string; first: boolean; clip: ClipState | null; others: number };
export type ViewState = {
  view: string;
  anchor: Shown | null;
  /** Andra REDO-ankare för vyn i registret, nyast först. */
  candidates: Shown[];
  cards: CardState[];
  /** Godkända klipp ur vyn gjorda ur ett annat ankare än vyns: de kedjas inte med det här ankarets. */
  elsewhere: { anchor: string; clips: number }[];
  playable: boolean;
};
export type Step = { what: string; commands: string[] };
export type DealerState = {
  id: string;
  name: string;
  file: string;
  identity: IdentityState[];
  views: ViewState[];
  packages: { kind: string; id: string; waiting: boolean }[];
  next: Step[];
  problems: string[];
};

const GOOD = 'godkänd';
const viewWord = (view: unknown): string | null => {
  const seen = view as { kind?: unknown; seat?: unknown } | null | undefined;
  if (seen?.kind === 'spelaren') return 'spelaren';
  if (seen?.kind === 'plats' && Number.isInteger(seen.seat)) return `plats-${seen.seat}`;
  return null;
};
const shown = (entry: Entry): Shown => ({ file: entry.file, status: entry.status, present: entry.present !== false, title: String(entry.title ?? '') });
/** REDO-ankaret ett klipp är gjort ur: registernamnet i dess första bilds referens (source.references, startFrame). */
function clipAnchor(entry: Entry): string | null {
  const references = (entry.source as { references?: { role?: unknown; what?: unknown }[] } | undefined)?.references;
  const what = Array.isArray(references) ? references.find((reference) => reference?.role === 'startFrame')?.what : undefined;
  return typeof what === 'string' ? (/dealers\/[a-z0-9-]+\/anchors\/[a-z0-9_.-]+\.png/.exec(what)?.[0] ?? null) : null;
}

/** Paketen i output/ för dealern: identitet, ankare och tagningar, och om de väntar på att tas emot. */
function packagesOf(root: string, id: string): DealerState['packages'] {
  const found: DealerState['packages'] = [];
  for (const [kind, dir, done] of [['identitet', 'output/identitet', 'mottaget.json'], ['ankare', 'output/ankare', 'mottaget.json'], ['tagning', 'output/tagningar', 'post.json']] as const) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      if (!name.startsWith(`${id}_`) || !existsSync(join(base, name, 'bestallning.json'))) continue;
      found.push({ kind, id: name, waiting: !existsSync(join(base, name, done)) });
    }
  }
  return found;
}

const review = (file: string): string => `npm run reg -- status ${file} godkänd "<granskaren och varför>"`;

/**
 * Var dealern står: identitetsbilderna per slag, REDO-ankaret och klippen per vy, paketen som väntar, och nästa steg
 * med kommandona, i den ordning linjen går (docs/production.md). Vyerna är Spelaren och de vyer som dealerns fil eller
 * registret har ankare eller klipp för. `entries` är registrets poster (viewRegistry); annars läses registret.
 */
export function dealerState(root: string, id: string, entries?: Entry[]): DealerState {
  const mall = readMall(root);
  const problems: string[] = [];
  let dealer: Dealer | null = null;
  try {
    dealer = readDealer(root, id, mall);
  } catch (error) {
    if (!(error instanceof DealerError)) throw error;
    problems.push(error.message);
  }
  const all = (entries ?? viewRegistry(root).assets).filter((entry) => entry.dealer === id);
  const byFile = new Map(all.map((entry) => [entry.file, entry]));
  const listed = new Set(dealer?.identity.images.map((image) => image.file) ?? []);

  const identity: IdentityState[] = Object.entries(mall.roles).map(([role, about]) => {
    const image = dealer?.identity.images.find((one) => one.shows === role);
    const entry = image ? byFile.get(image.file) : undefined;
    if (image && !entry) problems.push(`${image.file} står i dealerns fil men inte i registret`);
    return { role, what: about.what, need: about.need, image: image ? { ...(entry ? shown(entry) : { file: image.file, status: 'saknas', present: false, title: '' }), ...(image.note ? { note: image.note } : {}) } : null };
  });
  for (const entry of all) if (entry.group === 'identity' && !listed.has(entry.file) && entry.status !== 'utgår') problems.push(`${entry.file} är en identitetsbild för ${id} i registret men står inte i dealerns fil`);

  const series = [...mall.series.first.map((text) => ({ ...seriesCard(text)!, first: true })), ...mall.series.then.map((text) => ({ ...seriesCard(text)!, first: false }))];
  const words = new Set(['spelaren', ...Object.keys(dealer?.anchors.redo ?? {})]);
  for (const entry of all) if ((entry.group === 'anchors' || entry.group === 'clips') && entry.use === 'dealerfilm') words.add(viewWord(entry.view) ?? 'spelaren');
  const views: ViewState[] = [...words].sort((a, b) => (a === 'spelaren' ? -1 : b === 'spelaren' ? 1 : a.localeCompare(b))).map((view) => {
    const chosen = dealer ? anchorFor(dealer, view) : null;
    const chosenEntry = chosen ? byFile.get(chosen) : undefined;
    if (chosen && !chosenEntry) problems.push(`${chosen} är vyns ankare i dealerns fil men står inte i registret`);
    const candidates = all
      .filter((entry) => entry.group === 'anchors' && entry.use === 'dealerfilm' && viewWord(entry.view) === view && String(entry.pose ?? '').toLowerCase() === 'redo' && entry.file !== chosen)
      .reverse()
      .map(shown);
    const clips = all.filter((entry) => entry.group === 'clips' && entry.use === 'dealerfilm' && viewWord(entry.view) === view);
    const cards: CardState[] = series.map((card) => {
      const matching = clips.filter((entry) => {
        const lands = (entry.lands ?? {}) as { seat?: unknown; index?: unknown };
        return (entry.seat ?? lands.seat) === card.seat && (entry.index ?? lands.index) === card.index && String(entry.action ?? 'deal') === card.action && entry.status !== 'utgår';
      });
      const own = matching.filter((entry) => chosen !== null && clipAnchor(entry) === chosen);
      const best = [...own].sort((a, b) => Number(b.status === GOOD) - Number(a.status === GOOD) || Number(b.take ?? 0) - Number(a.take ?? 0))[0];
      return {
        ...card,
        label: cardLabel(card),
        clip: best ? { ...shown(best), take: typeof best.take === 'number' ? best.take : null, move: typeof best.move === 'string' ? best.move : null } : null,
        others: matching.filter((entry) => !own.includes(entry) && entry.status === GOOD).length,
      };
    });
    const elsewhere = new Map<string, number>();
    for (const entry of clips) {
      const anchor = clipAnchor(entry);
      if (entry.status === GOOD && anchor && anchor !== chosen) elsewhere.set(anchor, (elsewhere.get(anchor) ?? 0) + 1);
    }
    return {
      view,
      anchor: chosen ? (chosenEntry ? shown(chosenEntry) : { file: chosen, status: 'saknas', present: false, title: '' }) : null,
      candidates,
      cards,
      elsewhere: [...elsewhere.entries()].map(([anchor, count]) => ({ anchor, clips: count })),
      playable: chosenEntry?.status === GOOD && cards.filter((card) => card.first).every((card) => card.clip?.status === GOOD),
    };
  });

  const packages = packagesOf(root, id);
  return { id, name: dealer?.name ?? id, file: dealerFile(id), identity, views, packages, next: nextSteps(id, dealer, identity, views, packages), problems };
}

/** Nästa steg, i linjens ordning: det första som inte är gjort, och det som går att göra samtidigt. */
function nextSteps(id: string, dealer: Dealer | null, identity: IdentityState[], views: ViewState[], packages: DealerState['packages']): Step[] {
  if (!dealer) return [{ what: 'Skriv dealerns fil ur en bild av personen: den förs in i registret som hennes källa.', commands: [`node src/pipeline/identitet.ts ny ${id} "<Namn>" <bild> [<bild>] [--han]`] }];
  const steps: Step[] = [];
  const waiting = (kind: string) => packages.filter((one) => one.kind === kind && one.waiting);
  const needed = identity.filter((one) => one.need);
  const missing = needed.filter((one) => !one.image || one.image.status === 'utgår');
  const unjudged = needed.filter((one) => one.image && one.image.status !== GOOD && one.image.status !== 'utgår');
  if (!identity.find((one) => one.role === 'källa')?.image && missing.length > 0) steps.push({ what: 'Ge henne en bild av personen att göra identitetsbilderna ur.', commands: [`node src/pipeline/identitet.ts källa ${id} <bild> [<bild>]`] });
  if (missing.length > 0) {
    const open = waiting('identitet');
    steps.push(
      open.length > 0
        ? { what: `Beställ identitetsbilderna i paketet (${missing.map((one) => one.role).join(', ')}) som bestallning.json säger, och ta emot dem.`, commands: open.map((one) => `node src/pipeline/identitet.ts ta-emot ${one.id}`) }
        : { what: `Identitetsbilder saknas: ${missing.map((one) => one.role).join(', ')}. Förbered beställningarna, beställ genom Runways MCP-server, ta emot.`, commands: [`node src/pipeline/identitet.ts förbered ${id}`] },
    );
  }
  if (unjudged.length > 0) steps.push({ what: `En oberoende granskare dömer identitetsbilderna: ${unjudged.map((one) => one.role).join(', ')}.`, commands: unjudged.map((one) => review(one.image!.file)) });
  if (missing.length > 0 || unjudged.length > 0) return steps;

  for (const view of views) {
    const open = waiting('ankare').filter((one) => one.id.startsWith(`${id}_${view.view}_`));
    const fresh = view.candidates.filter((one) => one.status === 'att granska' || one.status === 'granska igen');
    const approved = view.candidates.find((one) => one.status === GOOD);
    if (!view.anchor || view.anchor.status !== GOOD) {
      if (fresh.length > 0) steps.push({ what: `${view.view}: en oberoende granskare dömer ankaret.`, commands: fresh.map((one) => review(one.file)) });
      else if (approved) steps.push({ what: `${view.view}: ${approved.file} är godkänt; peka ut det som vyns REDO.`, commands: [`node src/pipeline/ankare.ts använd ${id} ${view.view} ${approved.file}`] });
      else if (view.anchor && view.anchor.status !== 'utgår') steps.push({ what: `${view.view}: en oberoende granskare dömer vyns ankare.`, commands: [review(view.anchor.file)] });
      else if (open.length > 0) steps.push({ what: `${view.view}: beställ ankarets två bildsteg som paketets bestallning.json säger, skriv kvitto.json och ta emot.`, commands: open.map((one) => `node src/pipeline/ankare.ts ta-emot ${one.id}`) });
      else steps.push({ what: `${view.view}: inget godkänt REDO-ankare. Förbered underlaget och texterna.`, commands: [`node src/pipeline/ankare.ts förbered ${id} ${view.view}`] });
      continue;
    }
    const first = view.cards.filter((card) => card.first);
    // Ytterlägena först (plats 1 och 7), sedan dealerns kort, sedan resten (docs/production.md, Filmen).
    const order = (card: CardState): number => (card.seat === 1 || card.seat === 7 ? 0 : card.seat === 'D' ? 1 : 2);
    const lacking = first.filter((card) => !card.clip).sort((a, b) => order(a) - order(b));
    const judging = view.cards.filter((card) => card.clip && card.clip.status !== GOOD);
    const seat = (card: CardState) => `${card.seat} ${card.index}${card.action === 'deal' ? '' : ` ${card.action}`}`;
    if (judging.length > 0) steps.push({ what: `${view.view}: ${judging.length} klipp väntar på omdöme.`, commands: judging.slice(0, 3).map((card) => review(card.clip!.file)) });
    if (lacking.length === first.length) {
      steps.push({ what: `${view.view}: inga klipp ur ankaret än. Gör provklipp som Jakob väljer mellan innan serien beställs (docs/production.md, Filmen).`, commands: [`node src/pipeline/tagning.ts forbered ${id} ${view.view} 4 0`] });
    } else if (lacking.length > 0) {
      steps.push({ what: `${view.view}: ${lacking.length} av seriens ${first.length} kort saknar klipp${waiting('tagning').filter((one) => one.id.startsWith(`${id}_${view.view}_`)).length ? ` (${waiting('tagning').filter((one) => one.id.startsWith(`${id}_${view.view}_`)).length} paket ur vyn väntar på beställning)` : ''}. Ytterlägena först.`, commands: lacking.slice(0, 3).map((card) => `node src/pipeline/tagning.ts forbered ${id} ${view.view} ${seat(card)}`) });
    } else if (view.playable) {
      steps.push({ what: `${view.view}: spelbar. Se rundan.`, commands: [`node src/pipeline/runda.ts ${id} ${view.view} --plan`] });
    }
  }
  return steps;
}

/** Läget i ord, ett stycke per del, som kommandot skriver det. */
export function stateText(state: DealerState): string {
  const lines: string[] = [`${state.name} (${state.file})`];
  for (const problem of state.problems) lines.push(`  obs: ${problem}`);
  lines.push('Identitet:');
  for (const one of state.identity) if (one.need || one.image) lines.push(`  ${one.role.padEnd(9)} ${one.image ? `${one.image.file} [${one.image.status}]` : one.need ? 'saknas' : '-'}`);
  for (const view of state.views) {
    lines.push(`Vy ${view.view}: ankaret ${view.anchor ? `${view.anchor.file} [${view.anchor.status}]` : 'saknas'}${view.playable ? ', spelbar' : ''}`);
    for (const other of view.candidates) lines.push(`  annat ankare: ${other.file} [${other.status}]`);
    const cards = view.cards.map((card) => `${card.seat}/${card.index}${card.action === 'deal' ? '' : card.action[0]}:${card.clip ? (card.clip.status === GOOD ? 'ok' : card.clip.status) : '–'}`);
    lines.push(`  klipp ur ankaret: ${cards.join(' ')}`);
    for (const other of view.elsewhere) lines.push(`  ur ${other.anchor}: ${other.clips} godkända klipp (kedjas inte med vyns ankare)`);
  }
  const waiting = state.packages.filter((one) => one.waiting);
  if (waiting.length > 0) lines.push(`Paket som väntar: ${waiting.length} (${[...new Set(waiting.map((one) => one.kind))].join(', ')})`);
  lines.push('Nästa steg:');
  state.next.forEach((step, k) => {
    lines.push(`  ${k + 1}. ${step.what}`);
    for (const command of step.commands) lines.push(`       ${command}`);
  });
  return lines.join('\n');
}

if (import.meta.main) {
  const [id] = process.argv.slice(2);
  try {
    if (!id) {
      const ids = listDealers();
      console.log(ids.length ? ids.map((one) => `${one}: node src/pipeline/dealer.ts ${one}`).join('\n') : 'Inga dealers i content/dealers/.');
    } else {
      console.log(stateText(dealerState(ROOT, id)));
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
