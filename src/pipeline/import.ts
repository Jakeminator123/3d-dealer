// Importen: en ny fil förs in i assets/ och får sin post i registret, eller en post som inte ska vara kvar stryks.
//
//   node src/pipeline/import.ts <post.json>
//   node src/pipeline/import.ts stryk <fil i assets> "<varför>"
//
// post.json bär postens fält så som de ska stå i registret (file, group, title, note, source och det som hör till
// slaget av fil), och därtill `from`: var filen ligger nu, räknat från projektmappen. Måtten läses ur filen själv:
// bytes, sha256 (i source), bredd och höjd, och för en film längd och takt. Statusen blir `att granska` om posten inte
// säger något annat; ett omdöme sätts sedan med `npm run judge`. Flera poster går att lämna som en lista.
//
// Att stryka arkiverar: filen flyttas till output/work/struket/, utanför assets/, och posten stryks med en anteckning
// under leftOut om vad som ströks och varför. Ingenting raderas.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { addEntry, assetsDir, dropEntry, readRegistry, RegistryError, type RegistryEntry } from './registry.ts';

export class ImportError extends Error {}

const run = promisify(execFile);
const FILE = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)+$/;
const isFilm = (file: string): boolean => /\.(mp4|webm)$/i.test(file);
const isPicture = (file: string): boolean => /\.(png|jpe?g|webp)$/i.test(file);
// Fälten som mäts ur filen själv (factsOf). En post kan inte sätta dem.
const MEASURED = ['width', 'height', 'bytes', 'seconds', 'fps'];

export const sha256Of = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Det som går att läsa ur filen själv: storlek, och för bilder och filmer mått, längd och takt. */
export async function factsOf(path: string): Promise<Record<string, number>> {
  const bytes = statSync(path).size;
  if (isPicture(path)) {
    const { width, height } = await sharp(path).metadata();
    return { width: width!, height: height!, bytes };
  }
  if (isFilm(path)) {
    const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path]);
    const read = JSON.parse(probe.stdout) as { streams: { width: number; height: number; r_frame_rate: string }[]; format: { duration: string } };
    const stream = read.streams[0];
    if (!stream) throw new ImportError(`${path}: filmen har inget bildspår`);
    const [over, under] = stream.r_frame_rate.split('/').map(Number);
    return { width: stream.width, height: stream.height, seconds: Number(Number(read.format.duration).toFixed(2)), fps: Number((over! / (under || 1)).toFixed(3)), bytes };
  }
  return { bytes };
}

/** Om filmen har ett ljudspår. Dealerns filmer ska inte ha något: ljud och lipsync väntar. */
export async function hasSound(path: string): Promise<boolean> {
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path]);
  return probe.stdout.trim() !== '';
}

export type Post = RegistryEntry & { from: string; replace?: boolean };

/**
 * För in en fil: kopierar den till assets/ under postens `file` och lägger posten i registret. En fil som redan ligger
 * där med annat innehåll skrivs bara över när posten säger `replace`, och då byts också posten.
 */
export async function importAsset(root: string, post: Partial<Post>): Promise<RegistryEntry> {
  const { from, replace, ...fields } = post;
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new ImportError(`Posten går inte att föra in: ${what}`);
  };
  need(typeof from === 'string' && from !== '', 'from saknas');
  need(typeof fields.file === 'string' && FILE.test(fields.file), `file ska vara en sökväg under assets/ med små bokstäver: ${fields.file}`);
  need(typeof fields.title === 'string' && fields.title !== '', 'title saknas');
  need(typeof fields.group === 'string' && Object.hasOwn((readRegistry(root).groups ?? {}) as object, fields.group), `gruppen finns inte i registret: ${fields.group}`);
  const source = resolve(root, from!);
  need(existsSync(source), `${from} finns inte`);
  need(typeof fields.source === 'object' && fields.source !== null && typeof (fields.source as { from?: unknown }).from === 'string', 'source.from saknas');
  if (isFilm(source)) need(!(await hasSound(source)), `${from} har ljud: ta bort ljudspåret först`);

  const target = join(assetsDir(root), fields.file!);
  const sha256 = sha256Of(source);
  if (existsSync(target) && sha256Of(target) !== sha256 && !replace) {
    throw new ImportError(`${fields.file} finns redan i assets/ med annat innehåll. Säg replace i posten för att byta den.`);
  }
  const facts = await factsOf(source);
  const { file, group, dealer, title, status, note, source: origin, ...rest } = fields;
  // Måtten är alltid de som mäts ur filen: tal som posten bär för dem följer inte med, och en bild får ingen längd.
  const told = Object.fromEntries(Object.entries(rest).filter(([field]) => !MEASURED.includes(field)));
  // Postens fält i registrets vanliga ordning: vad det är, läget, måtten, och sist ursprunget.
  const entry: RegistryEntry = {
    file: file!,
    group,
    ...(dealer === undefined ? {} : { dealer }),
    title,
    status: typeof status === 'string' ? status : 'att granska',
    ...(note === undefined ? {} : { note }),
    ...facts,
    ...told,
    source: { ...(origin as object), sha256 },
  };
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target) || sha256Of(target) !== sha256) copyFileSync(source, target);
  return addEntry(root, entry, replace === true);
}

/** Arkiverar en post: filen flyttas ur assets/ till output/work/struket/, posten stryks, och leftOut får veta vad och varför. */
export function strike(root: string, file: string, why: string): string {
  const entry = readRegistry(root).assets.find((candidate) => candidate.file === file);
  if (!entry) throw new RegistryError(`Ingen post i registret för ${file}`);
  const from = join(assetsDir(root), file);
  const to = join(root, 'output', 'work', 'struket', file);
  if (existsSync(from)) {
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
  }
  const sha256 = (entry.source as { sha256?: string } | undefined)?.sha256;
  dropEntry(root, file, `${why} Filen ligger i output/work/struket/${file}${sha256 ? ` (sha256 ${sha256.slice(0, 12)})` : ''}.`);
  return to;
}

/** Posterna i en fil: en post eller en lista av dem. En fil som saknas eller inte är JSON sägs med sitt namn. */
export function readPosts(path: string): Partial<Post>[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ImportError(`${path} går inte att läsa: finns filen?`);
  }
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch (error) {
    throw new ImportError(`${path} är inte giltig JSON: ${(error as Error).message}`);
  }
  return (Array.isArray(read) ? read : [read]) as Partial<Post>[];
}

if (import.meta.main) {
  const root = process.env.STUDIO_DATA ? resolve(process.env.STUDIO_DATA) : resolve(import.meta.dirname, '..', '..');
  const [first, second, third] = process.argv.slice(2);
  try {
    if (first === 'stryk' && second && third) {
      console.log(`${second}: arkiverad, filen ligger i ${strike(root, second, third)}`);
    } else if (first && first !== 'stryk') {
      for (const post of readPosts(first)) {
        const entry = await importAsset(root, post);
        console.log(`${entry.file}: ${entry.status}, ${entry.width ?? '?'} × ${entry.height ?? '?'}${entry.seconds ? `, ${entry.seconds} s i ${entry.fps} rutor/s` : ''}, ${entry.bytes} byte`);
      }
    } else {
      console.error('Använd: node src/pipeline/import.ts <post.json> | stryk <fil i assets> "<varför>"');
      process.exitCode = 2;
    }
  } catch (error) {
    if (!(error instanceof ImportError) && !(error instanceof RegistryError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
