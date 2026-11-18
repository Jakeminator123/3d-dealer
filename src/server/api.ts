// Serverns egna vägar: registret, filerna i assets/ och deras förhandsbilder, och förlagorna som scenen sparar.
// Allt annat lämnas vidare (till Vite, som sköter sidorna).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { ForlagaError, saveFrame, startForlaga } from '../pipeline/forlaga.ts';
import { assetsDir, RegistryError, setStatus, setWords, stamp, viewRegistry } from '../pipeline/registry.ts';
import { pathInside, sendFile, sendJson, sendText } from './files.ts';
import { canThumbnail, thumbnail } from './thumbs.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const BODY_LIMIT = 64 * 1024;
// En ruta i en förlaga är en PNG i full storlek. Gränsen rymmer en ruta utan att släppa in vad som helst.
const FRAME_LIMIT = 64 * 1024 * 1024;

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).host;
  } catch {
    return null;
  }
}

/** Servern är bara till för den här datorn: en förfrågan ska vara ställd till localhost. */
function askedLocally(request: IncomingMessage): boolean {
  const host = hostOf(request.headers.host);
  return host !== null && LOCAL_HOSTS.has(new URL(`http://${host}`).hostname);
}

/**
 * En ändring ska komma från Labbets egen sida, inte från en annan webbsida som är öppen i webbläsaren.
 * Innehållet ska vara av den sort vägen tar emot: en sort som en annan sida inte får skicka utan att fråga först.
 */
function sentByOwnPage(request: IncomingMessage, type = 'application/json'): boolean {
  const origin = request.headers.origin;
  const sameOrigin = origin === undefined || hostOf(origin) === hostOf(request.headers.host);
  return sameOrigin && (request.headers['content-type'] ?? '').startsWith(type);
}

/** Det som går fel i en förfrågan: för stort, eller inte det vägen tar emot. */
class RequestError extends Error {}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of request) {
    size += (part as Buffer).length;
    if (size > limit) throw new RequestError('För stor förfrågan');
    parts.push(part as Buffer);
  }
  return Buffer.concat(parts);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request, BODY_LIMIT);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new RequestError('Förfrågan är inte giltig JSON');
  }
}

/** Namnet i en väg, som det skrevs. Ett namn som inte går att läsa tas emot som det står och faller på att det inte är städat. */
function decodeName(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Ett fel som den som frågade kan rätta: det svaras med sitt skäl. Andra fel är serverns egna. */
const askersFault = (error: unknown): error is Error => error instanceof RegistryError || error instanceof ForlagaError || error instanceof RequestError;

export type Api = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

/**
 * Svarar på serverns vägar för projektmappen `root`. Ger false när vägen inte är serverns.
 * `now` ger tiden som den skrivs i registret, "ÅÅÅÅ-MM-DD TT:MM".
 */
export function createApi(root: string, now: () => string = stamp): Api {
  const assets = assetsDir(root);

  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const own = ['/api/', '/media/', '/thumb/', '/content/'].find((prefix) => path.startsWith(prefix));
    if (!own) return false;

    if (!askedLocally(request)) {
      sendText(response, 403, 'Servern svarar bara på localhost');
      return true;
    }
    const reading = request.method === 'GET' || request.method === 'HEAD';

    if (path === '/api/registry' && reading) {
      sendJson(response, 200, viewRegistry(root));
    } else if (path === '/api/registry/status' && request.method === 'POST') {
      if (!sentByOwnPage(request)) {
        sendText(response, 403, 'Ändringar tas bara emot från Labbets egen sida');
        return true;
      }
      try {
        const body = (await readJson(request)) as { file?: unknown; status?: unknown };
        if (typeof body?.file !== 'string' || typeof body?.status !== 'string') {
          throw new RegistryError('Förfrågan ska bära file och status');
        }
        setStatus(root, body.file, body.status, `Jakob i Labbet ${now().slice(0, 10)}`, now());
        sendJson(response, 200, viewRegistry(root));
      } catch (error) {
        if (!askersFault(error)) throw error;
        sendJson(response, 400, { error: error.message });
      }
    } else if (path === '/api/registry/comment' && request.method === 'POST') {
      // Jakobs egna ord om en fil, skrivna i Labbet.
      if (!sentByOwnPage(request)) {
        sendText(response, 403, 'Ändringar tas bara emot från Labbets egen sida');
        return true;
      }
      try {
        const body = (await readJson(request)) as { file?: unknown; comment?: unknown };
        if (typeof body?.file !== 'string' || typeof body?.comment !== 'string') {
          throw new RegistryError('Förfrågan ska bära file och comment');
        }
        setWords(root, body.file, 'comment', body.comment, now());
        sendJson(response, 200, viewRegistry(root));
      } catch (error) {
        if (!askersFault(error)) throw error;
        sendJson(response, 400, { error: error.message });
      }
    } else if (path.startsWith('/api/forlaga/') && request.method === 'POST') {
      // Förlagor som scenen i Labbet sparar: först beställningen, sedan rutorna en i taget. De hamnar bara i output/forlagor/.
      const [first, second, ...more] = path.slice('/api/forlaga/'.length).split('/');
      const starting = first === 'start' && second === undefined;
      const frame = !starting && second !== undefined && /^\d{1,6}$/.test(second) && more.length === 0;
      if (!starting && !frame) {
        sendText(response, 404, 'Vägen finns inte');
        return true;
      }
      if (!sentByOwnPage(request, starting ? 'application/json' : 'image/png')) {
        sendText(response, 403, 'Förlagor tas bara emot från Labbets egen sida');
        return true;
      }
      try {
        if (starting) sendJson(response, 200, startForlaga(root, await readJson(request)));
        else sendJson(response, 200, { saved: await saveFrame(root, decodeName(first!), Number(second), await readBody(request, FRAME_LIMIT), now()) });
      } catch (error) {
        if (!askersFault(error)) throw error;
        sendJson(response, 400, { error: error.message });
      }
    } else if (own === '/media/' && reading) {
      const file = pathInside(assets, path.slice(own.length));
      if (file) sendFile(request, response, file);
      else sendText(response, 404, 'Filen finns inte');
    } else if (own === '/content/' && reading) {
      // Beskrivningarna i content/ (scenen, dealers, klipp) läses som de står. Bara JSON, bara läsning.
      const file = path.endsWith('.json') ? pathInside(join(root, 'content'), path.slice(own.length)) : null;
      if (file) sendFile(request, response, file);
      else sendText(response, 404, 'Filen finns inte');
    } else if (own === '/thumb/' && reading) {
      const file = pathInside(assets, path.slice(own.length));
      if (!file || !canThumbnail(file)) {
        sendText(response, 404, 'Ingen förhandsbild för den filen');
        return true;
      }
      let thumb: string;
      try {
        thumb = await thumbnail(root, file, Number(url.searchParams.get('w')) || 640);
      } catch (error) {
        console.error(`Förhandsbild av ${file} gick inte att göra:`, error);
        sendText(response, 404, 'Förhandsbilden gick inte att göra');
        return true;
      }
      sendFile(request, response, thumb);
    } else {
      sendText(response, 404, 'Vägen finns inte');
    }
    return true;
  };
}
