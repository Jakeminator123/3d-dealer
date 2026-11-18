// Små förhandsbilder av bilderna i assets/, så att en sida med många stora bilder går fort att visa.
// De läggs i output/cache/thumbs och kan alltid göras om.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import sharp from 'sharp';

const WIDTHS = [320, 640, 1280];
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// Utan sharps cache släpps källfilen direkt, så att den går att byta eller ta bort medan servern kör.
sharp.cache(false);

const underway = new Map<string, Promise<string>>();

export const canThumbnail = (path: string): boolean => IMAGES.has(extname(path).toLowerCase());

/** Närmaste tillåtna bredd, så att cachen inte fylls av en fil per pixelbredd. */
export const thumbWidth = (asked: number): number =>
  WIDTHS.find((width) => width >= asked) ?? WIDTHS[WIDTHS.length - 1]!;

/** Sökvägen till en förhandsbild av `source`. Görs första gången den efterfrågas, och görs om när källan ändras. */
export function thumbnail(root: string, source: string, asked: number): Promise<string> {
  const width = thumbWidth(asked);
  const stat = statSync(source);
  const key = createHash('sha1').update(`${source}|${stat.size}|${stat.mtimeMs}|${width}`).digest('hex');
  const folder = join(root, 'output', 'cache', 'thumbs');
  const target = join(folder, `${key}.webp`);
  if (existsSync(target)) return Promise.resolve(target);

  let job = underway.get(target);
  if (!job) {
    job = (async () => {
      mkdirSync(folder, { recursive: true });
      const draft = `${target}.${process.pid}.tmp`;
      await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(draft);
      renameSync(draft, target);
      return target;
    })().finally(() => underway.delete(target));
    underway.set(target, job);
  }
  return job;
}
