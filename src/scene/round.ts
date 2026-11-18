// Rundan: en hel giv som följd. Ordningen och valörerna står i content/runda.json; här väljs dealerns cykelklipp för
// varje kortplats ur registrets poster och läggs i den ordningen, som en dealerfilm (FilmNote) som scenen spelar.
// Labbet (steget Scen, Hela given) och src/pipeline/runda.ts tar rundan härifrån, så att båda spelar samma klipp i samma
// ordning genom samma uppspelning (reel.ts, film.ts).
//
// Rundan avgör ingenting i spelet: korten och deras ordning är en stå-in tills spelkärnan delar ut.

import type { FilmClip, FilmNote } from './dealer.ts';
import type { SeatView } from './geometry.ts';

export class RoundError extends Error {}

/** En kortplats: platsen och vilket av platsens kort, 0 för det första. */
export type Place = { seat: number; index: number };

/** Rundan så som den står i content/runda.json. */
export type Round = { order: Place[]; faces: string[]; film: { background: string; fps: number; hold: number } };

/**
 * En post i registret så som rundan läser den: filen, omdömet och det som säger om posten är ett cykelklipp för en
 * dealer och en vy (`dealer`, `use`, `view`, `pose`, `lands`, `take`, `seconds`). Labbets och registrets poster har den formen.
 */
export type RoundEntry = { file: string; status: string; [field: string]: unknown };

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Tar emot innehållet i content/runda.json och säger på svenska vad som saknas. */
export function readRound(value: unknown): Round {
  const round = (value ?? {}) as Partial<Round>;
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const order = Array.isArray(round.order) ? round.order : [];
  need(order.length > 0 && order.every((place) => Number.isInteger(place?.seat) && place.seat > 0 && Number.isInteger(place.index) && place.index >= 0), 'order');
  need(new Set(order.map((place) => `${place?.seat}/${place?.index}`)).size === order.length, 'order: varje kortplats en gång');
  const faces = Array.isArray(round.faces) ? round.faces : [];
  need(faces.length === order.length && faces.every((face) => typeof face === 'string' && face.length >= 2 && face.length <= 3), 'faces: en valör för varje kortplats i order');
  const film = round.film;
  need(typeof film?.background === 'string' && film.background !== '', 'film.background');
  need(isNumber(film?.fps) && film.fps > 0 && isNumber(film?.hold) && film.hold >= 0, 'film.fps och film.hold');
  if (wrong.length > 0) throw new RoundError(`Rundan i content/runda.json går inte att använda: ${wrong.join('; ')}`);
  return {
    order: order.map((place) => ({ seat: place.seat, index: place.index })),
    faces: [...faces],
    film: { background: film!.background, fps: film!.fps, hold: film!.hold },
  };
}

const sameView = (a: unknown, b: SeatView): boolean => {
  const view = a as { kind?: unknown; seat?: unknown } | null | undefined;
  return view?.kind === b.kind && (b.kind !== 'plats' || view.seat === b.seat);
};

/**
 * En film som går från REDO till REDO (pose `redo → redo`), så att den går att spela efter vilken annan sådan film som
 * helst. Ett ankare i REDO är en stillbild och spelas inte.
 */
function isCycle(entry: RoundEntry): boolean {
  const steps = typeof entry.pose === 'string' ? entry.pose.split('→').map((step) => step.trim().toLowerCase()) : [];
  return /\.(mp4|webm)$/i.test(entry.file) && steps.length >= 2 && steps[0] === 'redo' && steps.at(-1) === 'redo';
}

// Ett omdöme före ett annat när två tagningar lägger samma kort. Det som utgår spelas inte.
const PREFERRED = ['godkänd', 'att granska', 'granska igen'];

/** Ett cykelklipp i rundan: posten, kortplatsen och tiden i klippet då kortet ligger. */
export type Take = { file: string; status: string; place: Place; at: number; seconds: number | null };

/** Det som skulle spelas: klippen i rundans ordning med sina kort, och de kort som saknar ett klipp som går att spela. */
export type Plan = {
  clips: FilmClip[];
  dealt: (Take & { face: string })[];
  missing: Place[];
  /** Klipp som hör till rundan men inte går att spela, och varför. */
  unusable: { file: string; why: string }[];
};

/**
 * Rundan för dealern `dealer` ur vyn `view`: för varje kortplats i rundans ordning det bästa cykelklippet ur registret,
 * med rundans valör. Bäst är ett godkänt klipp före ett ogranskat, och den senaste tagningen före en tidigare. Ett klipp
 * som saknar tiden då kortet ligger, eller utgår, spelas inte. En post vars fil saknas (`present: false`) spelas inte.
 */
export function planRound(round: Round, entries: RoundEntry[], dealer: string, view: SeatView): Plan {
  const unusable: Plan['unusable'] = [];
  const best = new Map<string, { take: Take; rank: number; number: number; order: number }>();
  entries.forEach((entry, order) => {
    if (entry.dealer !== dealer || entry.use !== 'dealerfilm' || !sameView(entry.view, view) || !isCycle(entry)) return;
    const lands = entry.lands as { seat?: unknown; index?: unknown; at?: unknown } | undefined;
    if (!Number.isInteger(lands?.seat) || !Number.isInteger(lands?.index)) return void unusable.push({ file: entry.file, why: 'lands saknar plats och kortnummer' });
    const place = { seat: lands!.seat as number, index: lands!.index as number };
    if (!round.order.some((wanted) => wanted.seat === place.seat && wanted.index === place.index)) return;
    const rank = PREFERRED.indexOf(entry.status);
    if (rank < 0) return void unusable.push({ file: entry.file, why: `status ${entry.status}` });
    if (!isNumber(lands!.at) || lands!.at < 0) return void unusable.push({ file: entry.file, why: 'lands.at saknas: tiden då kortet ligger är inte mätt' });
    if (entry.present === false) return void unusable.push({ file: entry.file, why: 'filen saknas i assets/' });
    const take: Take = { file: entry.file, status: entry.status, place, at: lands!.at, seconds: isNumber(entry.seconds) ? entry.seconds : null };
    const number = isNumber(entry.take) ? entry.take : 0;
    const key = `${place.seat}/${place.index}`;
    const known = best.get(key);
    const better = !known || rank < known.rank || (rank === known.rank && (number > known.number || (number === known.number && order > known.order)));
    if (better) best.set(key, { take, rank, number, order });
  });

  const dealt: Plan['dealt'] = [];
  const missing: Place[] = [];
  round.order.forEach((place, at) => {
    const found = best.get(`${place.seat}/${place.index}`);
    if (found) dealt.push({ ...found.take, face: round.faces[at]! });
    else missing.push(place);
  });
  const clips = dealt.map((take): FilmClip => ({ file: take.file, card: { seat: take.place.seat, index: take.place.index, face: take.face, at: take.at } }));
  return { clips, dealt, missing, unusable };
}

/**
 * Rundan som dealerfilm: klippen i rundans ordning, gjorda i vyn `view`, med varje kort kvar från att det har landat,
 * och sista rutan kvar rundans `hold` sekunder innan följden börjar om.
 */
export function roundFilm(plan: Plan, round: Round, view: SeatView): FilmNote {
  if (plan.clips.length === 0) throw new RoundError('Rundan har inga klipp att spela');
  return { kind: 'film', view, clips: plan.clips, hold: round.film.hold };
}
