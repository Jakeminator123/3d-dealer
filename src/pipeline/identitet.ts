// Identiteten ur en bild: från en eller två bilder av en person till de identitetsbilder linjen behöver (ansikte,
// helkropp i dealerns kläder, händernas ovansida), förda in i registret under dealern. Runways MCP-server kan bara en
// agent anropa: koden förbereder beställningarna och tar emot bilderna. Mallen står i content/identitet.json, slagen i
// content/dealer.json (roles), dealerns ord i hennes fil.
//
//   node src/pipeline/identitet.ts ny <dealer> "<Namn>" <bild> [<bild>] [--han] [--ursprung <källa>]
//     Skriver dealerns fil (content/dealers/<dealer>.json) och för in bilderna i registret som hennes källa
//     (dealers/<dealer>/identity/kalla.png …, att granska). Källan är registrets ursprung, jakob om inget sägs.
//   node src/pipeline/identitet.ts källa <dealer> <bild> [<bild>] [--ursprung <källa>]
//     För in fler bilder av personen som källa.
//   node src/pipeline/identitet.ts förbered <dealer>
//     Skriver paketet output/identitet/<dealer>_i<n>/ med en beställning per slag som saknas, i mallens ordning
//     (ansikte, helkropp, händer): texten ur mallen och dealerns ord, referenserna (källan förminskad, och de slag som
//     redan finns), och vilka referenser som är ett tidigare stegs bild (dess taskId).
//   node src/pipeline/identitet.ts ta-emot <id>
//     För in bilderna som kvitto.json i paketet pekar ut: i registret under dealern (att granska, med slaget i `shows`),
//     beställningen med kostnaden, och i dealerns fil (identity.images).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { DealerError, dealerFile, dealerPath, fillParagraphs, placeholdersOf, readDealer, readMall, roleFile, wordKeys, wordsOf, writeDealer, type Dealer, type Mall } from './dealer.ts';
import { addOrder, addUpload, getEntry, importAsset, readRegistry, stamp, studioRoot, type Order } from './registry.ts';

export class IdentitetError extends Error {}

export const PACKAGES = 'output/identitet';
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

// ---------------------------------------------------------------------------------------------------------------------
// content/identitet.json

export type RoleOrder = { file: string; ratio: string; references: { tag: string; from: string; nth?: number; optional?: boolean }[]; text: string[] };
export type IdentitetContent = { order: { tool: string; model: string; imageSize: string; credits: number; reference: number }; roles: Record<string, RoleOrder> };

export function readIdentitet(root = studioRoot(), mall: Mall = readMall(root)): IdentitetContent {
  const read = JSON.parse(readFileSync(join(root, 'content', 'identitet.json'), 'utf8')) as IdentitetContent & Record<string, { basis?: unknown; source?: unknown }>;
  const wrong: string[] = [];
  for (const group of ['order', 'roles'] as const) {
    const marked = read[group] as { basis?: unknown; source?: unknown };
    if (!((marked?.basis === 'mätt' || marked?.basis === 'antaget') && typeof marked?.source === 'string')) wrong.push(`${group}: basis och source`);
  }
  const roles = Object.fromEntries(Object.entries(read.roles ?? {}).filter(([key]) => key !== 'basis' && key !== 'source')) as Record<string, RoleOrder>;
  const needed = Object.entries(mall.roles).filter(([, role]) => role.need).map(([key]) => key);
  for (const role of needed) if (!roles[role]) wrong.push(`roles.${role} saknas (content/dealer.json säger att linjen behöver det)`);
  const known = [...wordKeys(mall), 'person2'];
  const order = Object.keys(roles);
  for (const [key, role] of Object.entries(roles)) {
    if (!/^[a-z0-9-]+$/.test(role.file ?? '')) wrong.push(`roles.${key}.file: små bokstäver utan å, ä, ö`);
    for (const reference of role.references ?? []) {
      if (reference.from !== 'källa' && (!roles[reference.from] || order.indexOf(reference.from) >= order.indexOf(key))) wrong.push(`roles.${key}: referensen ${reference.tag} ska vara ur källan eller ett tidigare slag`);
    }
    const unknown = placeholdersOf((role.text ?? []).join(' ')).filter((word) => !known.includes(word));
    if (unknown.length > 0) wrong.push(`roles.${key}: okända ord ${unknown.join(', ')}`);
  }
  if (wrong.length > 0) throw new IdentitetError(`content/identitet.json går inte att använda: ${wrong.join('; ')}`);
  return { order: read.order, roles };
}

// ---------------------------------------------------------------------------------------------------------------------
// ny och källa

const posix = (path: string): string => path.replaceAll('\\', '/');
const write = (path: string, value: unknown): void => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
const fileOf = (root: string, given: string): string => (isAbsolute(given) ? given : resolve(root, given));

/** Ett ledigt namn under assets/dealers/<dealer>/identity/: <namn>.png, sedan <namn>-2.png och framåt. */
export function freeName(root: string, dealer: string, name: string): string {
  const taken = new Set(existsSync(join(root, 'content', 'register.db')) ? readRegistry(root).assets.map((entry) => entry.file) : []);
  for (let n = 1; ; n++) {
    const file = `dealers/${dealer}/identity/${n === 1 ? name : `${name}-${n}`}.png`;
    if (!taken.has(file) && !existsSync(join(root, 'assets', file))) return file;
  }
}

/** För in bilder av personen som dealerns källa (PNG i assets/, att granska) och sätter dem i hennes fil. */
async function addSources(root: string, dealer: Dealer, images: string[], origin: string, say: (text: string) => void): Promise<Dealer> {
  const added: { file: string; shows: string }[] = [];
  const work = join(root, PACKAGES, `${dealer.id}_kalla`);
  mkdirSync(work, { recursive: true });
  for (const image of images) {
    const path = fileOf(root, image);
    if (!existsSync(path)) throw new IdentitetError(`${image} finns inte`);
    const file = freeName(root, dealer.id, 'kalla');
    const png = join(work, file.split('/').at(-1)!);
    await sharp(path).rotate().png().toFile(png);
    const entry = await importAsset(root, {
      from: posix(relative(root, png)),
      file,
      group: 'identity',
      dealer: dealer.id,
      title: `Källa: en bild av ${dealer.name}`,
      note: `Bilden som identitetsbilderna görs ur (src/pipeline/identitet.ts), förd in ${stamp()} ur ${posix(image)}. Spelas aldrig.`,
      shows: 'källa',
      source: { from: origin, path: posix(image) },
    });
    added.push({ file: entry.file, shows: 'källa' });
    say(`Registret: ${entry.file} införd som källa, ${entry.status}.`);
  }
  const next: Dealer = { ...dealer, identity: { ...dealer.identity, images: [...dealer.identity.images, ...added] } };
  writeDealer(root, next);
  return next;
}

/** Skriver dealerns fil och för in bilderna som hennes källa. Se överst i filen. */
export async function ny(id: string, name: string, images: string[], options: { root?: string; pronoun?: 'she' | 'he'; origin?: string; say?: (text: string) => void } = {}): Promise<Dealer> {
  const root = options.root ?? studioRoot();
  const say = options.say ?? ((text: string) => console.log(text));
  if (!ID.test(id)) throw new IdentitetError(`Ogiltigt id: ${id} (små bokstäver, siffror och bindestreck)`);
  if (existsSync(dealerPath(root, id))) throw new IdentitetError(`${dealerFile(id)} finns redan; fler bilder: node src/pipeline/identitet.ts källa ${id} <bild>`);
  if (images.length === 0) throw new IdentitetError('Ge minst en bild av personen');
  const at = stamp();
  const dealer: Dealer = {
    schemaVersion: 1,
    about: `Dealern ${name}. Formen står i content/dealer.json, och src/pipeline/dealer.ts läser filen. Var hon står: node src/pipeline/dealer.ts ${id}, eller Labbets steg Dealer.`,
    id,
    name,
    looks: { pronoun: options.pronoun ?? 'she', basis: 'antaget', source: `Skriven av identitet.ts ny ${at}: bara pronomenet. Orden om håret, kläderna och det som alltid ska synas (content/dealer.json, looks.keys) skrivs här när de är kända; utan dem säger texterna att bilderna ska följas.` },
    identity: { images: [], basis: 'antaget', source: `Källan förd in ${at} av identitet.ts ny; identitetsbilderna förs in av identitet.ts ta-emot.` },
    anchors: { redo: {}, basis: 'antaget', source: 'Vyernas REDO-ankare pekas ut med node src/pipeline/ankare.ts använd när de är godkända.' },
  };
  mkdirSync(join(root, 'content', 'dealers'), { recursive: true });
  writeDealer(root, dealer);
  say(`${dealerFile(id)} skriven.`);
  readDealer(root, id);
  return addSources(root, dealer, images, options.origin ?? 'jakob', say);
}

export async function kalla(id: string, images: string[], options: { root?: string; origin?: string; say?: (text: string) => void } = {}): Promise<Dealer> {
  const root = options.root ?? studioRoot();
  return addSources(root, readDealer(root, id), images, options.origin ?? 'jakob', options.say ?? ((text: string) => console.log(text)));
}

// ---------------------------------------------------------------------------------------------------------------------
// förbered

export type Prepared = { id: string; dir: string; order: Record<string, unknown>; roles: string[] };

/** Gör paketet med beställningarna av de identitetsbilder som saknas. Se överst i filen. */
export async function forbered(dealerId: string, options: { root?: string; out?: string; say?: (text: string) => void } = {}): Promise<Prepared> {
  const root = options.root ?? studioRoot();
  const out = options.out ?? join(root, PACKAGES);
  const say = options.say ?? ((text: string) => console.log(text));
  const mall = readMall(root);
  const content = readIdentitet(root, mall);
  const dealer = readDealer(root, dealerId, mall);
  const status = (file: string | null) => (file ? (getEntry(root, file)?.status ?? 'saknas') : null);
  const missing = Object.keys(content.roles).filter((role) => {
    const one = status(roleFile(dealer, role));
    return one === null || one === 'utgår' || one === 'saknas';
  });
  if (missing.length === 0) throw new IdentitetError(`${dealer.name} har alla identitetsbilder linjen behöver (${Object.keys(content.roles).join(', ')}): se node src/pipeline/dealer.ts ${dealerId}`);
  const sources = dealer.identity.images.filter((image) => image.shows === 'källa' && existsSync(join(root, 'assets', image.file)));
  if (sources.length === 0) throw new IdentitetError(`${dealerFile(dealerId)} har ingen källa: node src/pipeline/identitet.ts källa ${dealerId} <bild>`);

  mkdirSync(out, { recursive: true });
  const taken = readdirSync(out).map((name) => new RegExp(`^${dealerId}_i(\\d+)$`).exec(name)?.[1]).filter(Boolean).map(Number);
  const n = taken.length ? Math.max(...taken) + 1 : 1;
  const id = `${dealerId}_i${n}`;
  const dir = join(out, id);
  mkdirSync(join(dir, 'ref'), { recursive: true });
  const pkg = posix(relative(root, dir));
  const shrink = async (file: string, name: string): Promise<string> => {
    await sharp(join(root, 'assets', file)).resize(content.order.reference, content.order.reference, { fit: 'inside', withoutEnlargement: true }).removeAlpha().jpeg({ quality: 93 }).toFile(join(dir, 'ref', name));
    return `${pkg}/ref/${name}`;
  };
  const sourceRefs: string[] = [];
  for (const [k, image] of sources.entries()) sourceRefs.push(await shrink(image.file, `kalla-${k + 1}.jpg`));
  const words = wordsOf(dealer, mall, sources.length > 1 ? { person2: '@person2' } : {});
  const steps = [];
  for (const role of missing) {
    const order = content.roles[role]!;
    const references = [];
    for (const reference of order.references) {
      if (reference.from === 'källa') {
        const nth = (reference.nth ?? 1) - 1;
        if (!sourceRefs[nth]) {
          if (reference.optional) continue;
          throw new IdentitetError(`${role}: källa ${nth + 1} saknas`);
        }
        references.push({ tag: reference.tag, file: sourceRefs[nth], upload: true, identity: sources[nth]!.file });
      } else if (missing.includes(reference.from)) {
        references.push({ tag: reference.tag, taskId: `<${reference.from}s taskId>`, from: reference.from });
      } else {
        const file = roleFile(dealer, reference.from)!;
        references.push({ tag: reference.tag, file: await shrink(file, `${content.roles[reference.from]!.file}.jpg`), upload: true, identity: file });
      }
    }
    const text = fillParagraphs(order.text, words);
    writeFileSync(join(dir, `text-${order.file}.txt`), text);
    steps.push({ step: role, tool: content.order.tool, model: content.order.model, imageSize: content.order.imageSize, ratio: order.ratio, credits: content.order.credits, referenceImages: references, promptFile: `${pkg}/text-${order.file}.txt`, promptText: text, file: order.file });
  }
  const order = {
    about: 'Beställningarna av en dealers identitetsbilder, gjorda av src/pipeline/identitet.ts förbered. En generate_image per steg, i tur och ordning genom Runways MCP-server; en referens med taskId är ett tidigare stegs bild.',
    id,
    made: stamp(),
    dealer: dealerId,
    steps,
    receipts: `${pkg}/kvitto.json: [{ "step": "<slag>", "file": "<nedladdad bild>", "taskId": "<id>", "credits": <n>, "before": <saldo före>, "after": <saldo efter>, "at": "ÅÅÅÅ-MM-DD TT:MM" }]`,
    uploads: `${pkg}/uppladdat.json: [{ "file": "<filen i paketet>", "url": "<adressen>", "assetId": "<id>", "at": "ÅÅÅÅ-MM-DD TT:MM" }]`,
  };
  write(join(dir, 'bestallning.json'), order);
  say(`Paket: ${pkg}`);
  for (const step of steps) say(`  ${step.step.padEnd(9)} ${step.model}, ${step.imageSize}, ${step.ratio}: ${step.referenceImages.map((ref) => `@${ref.tag}`).join(' ')}; texten i ${step.promptFile.split('/').at(-1)} (cirka ${step.credits} krediter)`);
  say('Härnäst, för agenten:');
  say('  1. Läs saldot (whoami). Ladda upp ref/*.jpg (init_upload, curl, complete_upload); skriv adresserna i uppladdat.json.');
  say('  2. generate_image för varje steg i ordning som bestallning.json säger; ett tidigare stegs bild ges med dess taskId. Se på varje bild.');
  say(`  3. Läs saldot efter varje steg, ladda ned bilderna och skriv ${pkg}/kvitto.json. Sedan:`);
  say(`     node src/pipeline/identitet.ts ta-emot ${id}`);
  return { id, dir, order, roles: missing };
}

// ---------------------------------------------------------------------------------------------------------------------
// ta-emot

type Receipt = { step: string; file: string; taskId: string; credits: number; before: number; after: number; at?: string };
type Ordered = { id: string; dealer: string; steps: { step: string; model: string; imageSize: string; ratio: string; file: string; referenceImages: { tag: string; file?: string; taskId?: string; identity?: string }[]; promptText: string }[] };

/** För in bilderna i kvitto.json. Se överst i filen. */
export async function taEmot(id: string, options: { root?: string; out?: string; say?: (text: string) => void } = {}): Promise<string[]> {
  const root = options.root ?? studioRoot();
  const out = options.out ?? join(root, PACKAGES);
  const say = options.say ?? ((text: string) => console.log(text));
  const dir = join(out, id);
  const pkg = posix(relative(root, dir));
  if (!existsSync(join(dir, 'bestallning.json'))) throw new IdentitetError(`Paketet ${id} finns inte: kör förbered först`);
  if (!existsSync(join(dir, 'kvitto.json'))) throw new IdentitetError(`${pkg}/kvitto.json saknas (formen står i bestallning.json, receipts)`);
  const ordered = JSON.parse(readFileSync(join(dir, 'bestallning.json'), 'utf8')) as Ordered;
  const receipts = JSON.parse(readFileSync(join(dir, 'kvitto.json'), 'utf8')) as Receipt[];
  const mall = readMall(root);
  let dealer = readDealer(root, ordered.dealer, mall);
  // Det som redan är mottaget, i ett tidigare ta-emot (delvis.json) eller helt (mottaget.json).
  const kept = ['mottaget.json', 'delvis.json'].map((name) => join(dir, name)).find((path) => existsSync(path));
  const done = kept ? (JSON.parse(readFileSync(kept, 'utf8')) as { received: Record<string, string> }).received : {};
  const said: string[] = [];
  for (const step of ordered.steps) {
    const receipt = receipts.find((one) => one.step === step.step);
    if (!receipt || done[step.step]) continue;
    for (const [name, value] of Object.entries({ credits: receipt.credits, before: receipt.before, after: receipt.after })) if (!Number.isInteger(value)) throw new IdentitetError(`kvitto.json, ${step.step}: ${name} ska vara ett heltal`);
    const png = join(dir, `${step.file}.png`);
    await sharp(fileOf(root, receipt.file)).png().toFile(png);
    const file = freeName(root, ordered.dealer, step.file);
    const references = step.referenceImages.map((ref) => ({ tag: ref.tag, what: ref.identity ?? ref.file ?? (ref.taskId ? `${ref.taskId.replace(/^<|s taskId>$/g, '')}: ${receipts.find((one) => one.step === ref.taskId?.replace(/^<|s taskId>$/g, ''))?.taskId ?? '?'}` : '') }));
    const entry = await importAsset(root, {
      from: posix(relative(root, png)),
      file,
      group: 'identity',
      dealer: ordered.dealer,
      title: `${step.step[0]!.toUpperCase()}${step.step.slice(1)}: ${mall.roles[step.step]?.what ?? step.step}`,
      note: `Gjord ${stamp()} genom src/pipeline/identitet.ts (paketet ${pkg}) ur dealerns källa och mallen content/identitet.json. Inte dömd: väntar på en oberoende granskare.`,
      shows: step.step,
      licence: 'Ingen tredjepartslicens: genererad på Jakobs Runway-konto',
      source: { from: 'runway', taskId: receipt.taskId, model: step.model, imageSize: step.imageSize, ratio: step.ratio, credits: receipt.credits, references, prompt: step.promptText, package: pkg },
    });
    const order: Order = {
      at: receipt.at ?? stamp(),
      model: step.model,
      kind: 'bild',
      purpose: `identitet, ${step.step}: ${ordered.dealer} (${file})`,
      inputs: JSON.stringify({ imageSize: step.imageSize, ratio: step.ratio, references }),
      prompt: step.promptText,
      taskId: receipt.taskId,
      credits: receipt.credits,
      balanceBefore: receipt.before,
      balanceAfter: receipt.after,
      basis: receipt.credits === receipt.before - receipt.after ? 'mätt' : 'antaget',
      outcome: 'att granska',
      result: file,
      note: `bilden: ${posix(relative(root, fileOf(root, receipt.file)))}`,
    };
    said.push(`Registret: ${entry.file} införd (${step.step}, ${entry.status}); beställningen ${receipt.taskId} (rad ${addOrder(root, order)}).`);
    dealer = { ...dealer, identity: { ...dealer.identity, images: [...dealer.identity.images, { file: entry.file, shows: step.step }] } };
    writeDealer(root, dealer);
    done[step.step] = entry.file;
  }
  if (existsSync(join(dir, 'uppladdat.json')) && Object.keys(done).length === ordered.steps.length) {
    for (const upload of JSON.parse(readFileSync(join(dir, 'uppladdat.json'), 'utf8')) as { file: string; url: string; assetId?: string; at?: string }[]) {
      addUpload(root, { file: upload.file.startsWith('output/') ? upload.file : `${pkg}/${upload.file}`, url: upload.url, assetId: upload.assetId ?? null, at: upload.at ?? null });
    }
  }
  const complete = Object.keys(done).length === ordered.steps.length;
  write(join(dir, complete ? 'mottaget.json' : 'delvis.json'), { at: stamp(), received: done });
  if (complete && existsSync(join(dir, 'delvis.json'))) rmSync(join(dir, 'delvis.json'));
  for (const line of said) say(line);
  say(said.length ? `Härnäst: en oberoende granskare dömer bilderna i full storlek (npm run reg -- status <fil> godkänd "<vem och varför>"). Läget: node src/pipeline/dealer.ts ${ordered.dealer}` : 'Inget nytt att ta emot.');
  return said;
}

// ---------------------------------------------------------------------------------------------------------------------
// Kommandoraden

const USAGE = `Använd:
  node src/pipeline/identitet.ts ny <dealer> "<Namn>" <bild> [<bild>] [--han] [--ursprung <källa>]
  node src/pipeline/identitet.ts källa <dealer> <bild> [<bild>] [--ursprung <källa>]
  node src/pipeline/identitet.ts förbered <dealer>
  node src/pipeline/identitet.ts ta-emot <id>
Vägen: docs/production.md, Identitet.`;

if (import.meta.main) {
  const [word, ...args] = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const words = args.filter((arg, k) => !arg.startsWith('--') && args[k - 1] !== '--ursprung');
  try {
    if (word === 'ny' && words.length >= 3) await ny(words[0]!, words[1]!, words.slice(2), { pronoun: args.includes('--han') ? 'he' : 'she', origin: flag('--ursprung') });
    else if ((word === 'källa' || word === 'kalla') && words.length >= 2) await kalla(words[0]!, words.slice(1), { origin: flag('--ursprung') });
    else if ((word === 'förbered' || word === 'forbered') && words.length === 1) await forbered(words[0]!);
    else if (word === 'ta-emot' && words.length === 1) await taEmot(words[0]!);
    else {
      console.error(USAGE);
      process.exitCode = 2;
    }
  } catch (error) {
    if (!(error instanceof IdentitetError || error instanceof DealerError || error instanceof Error)) throw error;
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
