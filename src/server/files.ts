// Lämnar ut filer ur en mapp över HTTP, med stöd för delhämtning så att filmer går att spola i.

import { createReadStream, statSync, type Stats } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pipeline, type Readable } from 'node:stream';

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json; charset=utf-8',
};

/** Sökvägen till filen om den ligger i mappen `base`, annars null. Stoppar försök att kliva ut ur mappen. */
export function pathInside(base: string, urlPath: string): string | null {
  let relative: string;
  try {
    relative = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (relative.includes('\0')) return null;
  const root = resolve(base);
  const target = resolve(root, `.${sep}${relative}`);
  return target.startsWith(root + sep) ? target : null;
}

/** Skickar filen, hel eller den del som efterfrågas. Ger tillbaka läsningen av filen när en sådan startas. */
export function sendFile(request: IncomingMessage, response: ServerResponse, path: string): Readable | null {
  let stat: Stats | null = null;
  try {
    stat = statSync(path);
  } catch {
    // Filen finns inte: samma svar som för en mapp.
  }
  if (!stat?.isFile()) {
    sendText(response, 404, 'Filen finns inte');
    return null;
  }

  const modified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000);
  response.setHeader('Content-Type', TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Last-Modified', modified.toUTCString());
  response.setHeader('Cache-Control', 'no-cache');

  const since = request.headers['if-modified-since'];
  if (since && !request.headers.range && new Date(since).getTime() >= modified.getTime()) {
    response.writeHead(304).end();
    return null;
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  let start = 0;
  let end = stat.size - 1;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else {
      start = Math.max(stat.size - Number(range[2]), 0);
    }
    if (start > end || start >= stat.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      return null;
    }
    response.statusCode = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }
  response.setHeader('Content-Length', end - start + 1);
  if (request.method === 'HEAD' || stat.size === 0) {
    response.end();
    return null;
  }
  // pipeline stänger filen även när webbläsaren avbryter mitt i, till exempel när en film byts ut.
  // Annars står filen öppen och går inte att byta eller ta bort medan servern kör.
  const reading = createReadStream(path, { start, end });
  pipeline(reading, response, () => {});
  return reading;
}

export function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response
    .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(body));
}
