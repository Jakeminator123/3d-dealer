// Rundan: en giv som spelkärnan har delat, spelad som dealerns följd. Spelkärnan säger vilka kort som delas, i vilken
// ordning och till vem (händelserna deal och reveal, steg för steg); här blir varje kort ett av dealerns klipp ur
// registret, eller spelkärnans fallback när klippet saknas, och hela rundan en dealerfilm (FilmNote) som scenen spelar.
// Labbet (steget Scen, Hela given), Casinot och src/pipeline/runda.ts tar rundan härifrån, så att alla tre väljer samma
// klipp på samma sätt och spelar dem genom samma uppspelning (reel.ts, film.ts).
//
// Klippet väljs ur registret efter postens `seat` (1–7, eller `D` för dealern), `index` (kortets nummer på platsen)
// och `action` (`deal`, `hole` eller `flip`), bland godkända cykelklipp för dealern och vyn. En post utan `action` är
// en utdelning (`deal`). Kortets valör kommer ur händelsen, kortplatsen ur content/scene.json.
//
// Rundan avgör ingenting i spelet: korten, pengarna och utfallet är spelkärnans. En film avgör aldrig något av det.

import type { SeatSignalEvent, SeatView as TableView } from '../engine/seats.ts';
import { captureHeightOf, type Background } from './backdrop.ts';
import { sameSpot, type CardSpot, type FilmClip, type FilmNote } from './dealer.ts';
import type { FeltPoint, SceneDescription } from './description.ts';
import type { SeatView } from './geometry.ts';

export class RoundError extends Error {}

/**
 * Ett steg i rundan så som spelkärnan svarade: kommandot (`start`, `act` med sin handling, `insurance`), händelserna i
 * spelordning, och den publika vyn efter steget.
 */
export type RoundStep = { op?: string; action?: string; events: SeatSignalEvent[]; view: TableView };

/**
 * En runda som spelkärnan har delat utan spelare (servern, /api/runda): fröet till skon, insatserna, regeln spelarna
 * spelade efter, stegen, och kassan före och efter med kärnans utfall per hand.
 */
export type DealtRound = {
  seed: string;
  bets: Round['deal']['bets'];
  hitBelow: number;
  steps: RoundStep[];
  result: { before: number; after: number; settle: Extract<SeatSignalEvent, { type: 'settle' }> | null };
};

/**
 * Rundan som content/runda.json beskriver den. `deal` är rundan som spelkärnan delar när ingen spelar: fröet till skon,
 * insatserna per plats, och hur spelarna spelar (Hit så länge handen är under `hitBelow`, annars Stand; ingen
 * försäkring). `fallback` är hur länge ett kort utan klipp går självt: från skon (`seconds`), vänt där det ligger
 * (`turn`) och flyttat när en hand delas (`move`). `film` är hur rundan sparas som film.
 */
export type Round = {
  deal: { seed: string; bets: { seat: number; main: number }[]; hitBelow: number };
  fallback: { seconds: number; turn: number; move: number };
  film: { background: string; fps: number; hold: number };
};

/** Den första handen på en plats, och kortplatsen som ord: `plats 4, kort 1`, `plats 4, hand 2, kort 0`, `dealern, kort 1`. */
export const spotName = (spot: CardSpot): string =>
  `${spot.seat === 'D' ? 'dealern' : `plats ${spot.seat}`}${(spot.hand ?? 0) > 0 ? `, hand ${(spot.hand ?? 0) + 1}` : ''}, kort ${spot.index}`;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPositive = (value: unknown): value is number => isNumber(value) && value > 0;

/** Tar emot innehållet i content/runda.json och säger på svenska vad som saknas. */
export function readRound(value: unknown): Round {
  const round = (value ?? {}) as Partial<Round>;
  const wrong: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) wrong.push(what);
  };
  const deal = round.deal;
  need(typeof deal?.seed === 'string' && deal.seed.length > 0 && deal.seed.length <= 200, 'deal.seed');
  const bets = Array.isArray(deal?.bets) ? deal.bets : [];
  need(bets.length > 0 && bets.every((bet) => Number.isInteger(bet?.seat) && bet.seat >= 1 && bet.seat <= 7 && isPositive(bet.main)), 'deal.bets: plats 1–7 och en insats');
  need(new Set(bets.map((bet) => bet?.seat)).size === bets.length, 'deal.bets: varje plats en gång');
  need(isNumber(deal?.hitBelow), 'deal.hitBelow');
  const fallback = round.fallback;
  need(isPositive(fallback?.seconds) && isPositive(fallback?.turn) && isPositive(fallback?.move), 'fallback.seconds, fallback.turn och fallback.move');
  const film = round.film;
  need(typeof film?.background === 'string' && film.background !== '', 'film.background');
  need(isPositive(film?.fps) && isNumber(film?.hold) && film.hold >= 0, 'film.fps och film.hold');
  if (wrong.length > 0) throw new RoundError(`Rundan i content/runda.json går inte att använda: ${wrong.join('; ')}`);
  return {
    deal: { seed: deal!.seed, bets: bets.map((bet) => ({ seat: bet.seat, main: bet.main })), hitBelow: deal!.hitBelow },
    fallback: { seconds: fallback!.seconds, turn: fallback!.turn, move: fallback!.move },
    film: { background: film!.background, fps: film!.fps, hold: film!.hold },
  };
}

/** Vad dealern gör med ett kort: delar ut det med framsidan upp, lägger hålkortet med baksidan upp, eller vänder det. */
export type CardAction = 'deal' | 'hole' | 'flip';
export const CARD_ACTIONS: CardAction[] = ['deal', 'hole', 'flip'];

/**
 * Ett kort i rundan, i den ordning spelkärnan delar: var det ska (handen räknad bland platsens), vad det är (null med
 * baksidan upp), och vad dealern gör med det. `move` är ett kort som flyttas när en hand delas, från `from`; det har
 * inget klipp.
 */
export type Deal = CardSpot & { hand: number; face: string | null; action: CardAction | 'move'; from?: CardSpot };

const faceOf = (card: { r: string; s: string }): string => `${card.r}${card.s}`;

/**
 * Korten i rundan ur spelkärnans steg, i spelordning. En utdelning till en plats läggs på platsens hand och kortets
 * nummer i den; dealerns öppna kort är kort 0, hålkortet kort 1 med baksidan upp, och hans dragna kort 2 och framåt.
 * När hålkortet visas (reveal) vänds kort 1. Ett kort som vyn efter ett steg visar på en annan kortplats än där det
 * lades har flyttats när handen delades: det flyttas före stegets nya kort.
 */
export function dealsOf(steps: RoundStep[]): Deal[] {
  const deals: Deal[] = [];
  // Var varje spelarkort ligger, efter dess plats i skon.
  const where = new Map<number, CardSpot & { hand: number }>();
  for (const step of steps) {
    for (const hand of step.view.round?.hands ?? []) {
      hand.cards.forEach((card, index) => {
        const known = where.get(card.shoeDraw);
        const spot = { seat: hand.seat, hand: hand.hand, index };
        if (!known || sameSpot(known, spot)) return;
        deals.push({ ...spot, face: faceOf(card), action: 'move', from: { seat: known.seat, hand: known.hand, index: known.index } });
        where.set(card.shoeDraw, spot);
      });
    }
    for (const event of step.events) {
      if (event.type === 'deal') {
        const spot = event.to === 'dealer' ? { seat: 'D' as const, hand: 0, index: event.cardIndex } : { seat: event.seat!, hand: event.hand ?? 0, index: event.cardIndex };
        const face = event.faceDown || !event.card ? null : faceOf(event.card);
        deals.push({ ...spot, face, action: event.faceDown ? 'hole' : 'deal' });
        if (event.to === 'seat') where.set(event.shoeDraw, spot);
      } else if (event.type === 'reveal') {
        deals.push({ seat: 'D', hand: 0, index: event.cardIndex, face: faceOf(event.card), action: 'flip' });
      }
    }
  }
  return deals;
}

/**
 * En post i registret så som rundan läser den: filen, omdömet och det som säger om posten är ett cykelklipp för en
 * dealer och en vy (`dealer`, `use`, `view`, `pose`, `seat`, `index`, `action`, `lands`, `take`, `seconds`). Labbets och
 * registrets poster har den formen.
 */
export type RoundEntry = { file: string; status: string; [field: string]: unknown };

const sameView = (a: unknown, b: SeatView): boolean => {
  const view = a as { kind?: unknown; seat?: unknown } | null | undefined;
  return view?.kind === b.kind && (b.kind !== 'plats' || view.seat === b.seat);
};

/**
 * En film som går från REDO till REDO (pose `redo → redo`, eller fler steg däremellan), så att den går att spela efter
 * vilken annan sådan film som helst. Ett ankare i REDO är en stillbild och spelas inte.
 */
function isCycle(entry: RoundEntry): boolean {
  const steps = typeof entry.pose === 'string' ? entry.pose.split('→').map((step) => step.trim().toLowerCase()) : [];
  return /\.(mp4|webm)$/i.test(entry.file) && steps.length >= 2 && steps[0] === 'redo' && steps.at(-1) === 'redo';
}

/** Omdömet ett klipp måste ha för att spelas i en runda. */
const PLAYED = 'godkänd';

/** Ett cykelklipp i rundan: posten, vad det gör och tiden i klippet då kortet ligger. */
type Take = { file: string; status: string; seat: number | 'D'; index: number; action: CardAction; at: number; seconds: number | null };

const clipKey = (seat: number | 'D', index: number, action: CardAction): string => `${seat}/${index}/${action}`;

/** Vad posten säger att klippet gör: platsen och kortets nummer (`seat`, `index`, eller ur `lands`) och `action`. */
function takeOf(entry: RoundEntry): Take | string {
  const lands = (entry.lands ?? {}) as { seat?: unknown; index?: unknown; at?: unknown };
  const seat = entry.seat ?? lands.seat;
  const index = entry.index ?? lands.index;
  const action = entry.action ?? 'deal';
  if (!((Number.isInteger(seat) && (seat as number) >= 1) || seat === 'D') || !Number.isInteger(index) || (index as number) < 0) return 'seat och index saknas';
  if (!CARD_ACTIONS.includes(action as CardAction)) return `action ${JSON.stringify(action)} är inte deal, hole eller flip`;
  if (!isNumber(lands.at) || lands.at < 0) return 'lands.at saknas: tiden då kortet ligger är inte mätt';
  return { file: entry.file, status: entry.status, seat: seat as number | 'D', index: index as number, action: action as CardAction, at: lands.at, seconds: isNumber(entry.seconds) ? entry.seconds : null };
}

/**
 * REDO-ankaret ett klipp är gjort ur: första bilden i dess beställning (registrets `source.references`, rollen
 * `startFrame`). Klipp ur olika ankare börjar och slutar i olika REDO-bilder och kedjas inte. Null när posten inte säger.
 */
export function anchorOf(entry: RoundEntry): string | null {
  const references = (entry.source as { references?: unknown } | undefined)?.references;
  const start = Array.isArray(references) ? references.find((reference) => (reference as { role?: unknown })?.role === 'startFrame') : undefined;
  const what = (start as { what?: unknown } | undefined)?.what;
  return typeof what === 'string' && what !== '' ? what : null;
}

/** Det som spelas: följden, och för varje kort klippet som lägger det, eller null när kortet går självt. */
export type Plan = {
  clips: FilmClip[];
  dealt: (Deal & { file: string | null; status: string | null; at: number; seconds: number })[];
  /** Kort utan ett godkänt klipp, som därför går självt (spelkärnans fallback). En flyttning har inga klipp och räknas inte. */
  missing: Deal[];
  /** Klipp som hör till rundan men inte spelas, och varför. Bara ur det valda ankaret: de andra ankarna står i `anchors`. */
  unusable: { file: string; why: string }[];
  /** REDO-ankaret följdens klipp är gjorda ur (anchorOf). Null när inget kort i rundan har ett godkänt klipp. */
  anchor: string | null;
  /** Varje ankare med godkända klipp för rundan, och hur många av rundans kort de har klipp till, flest först. */
  anchors: { anchor: string | null; clips: number }[];
};

/**
 * Rundan för dealern `dealer` ur vyn `view`: för varje kort i `deals` det godkända cykelklippet ur registret som gör
 * just det (plats, kortets nummer, action), den senaste tagningen före en tidigare. Alla klipp i en följd är gjorda ur
 * samma REDO-ankare (anchorOf): det ankare vars godkända klipp täcker flest av rundans kort, vid lika det med flest
 * godkända klipp ur vyn, och sedan det senast införda. Ett kort på en delad hand (hand 2 och framåt) har inget klipp:
 * klippen lägger på platsens första hand. Saknas klippet går kortet självt från skon på `fallback.seconds` (vänds på
 * `fallback.turn`), medan dealern står i REDO; ett kort som flyttas när en hand delas går på `fallback.move`. En post
 * vars fil saknas (`present: false`) spelas inte.
 */
export function planRound(deals: Deal[], entries: RoundEntry[], dealer: string, view: SeatView, fallback: Round['fallback']): Plan {
  const wanted = new Set(deals.filter((deal) => deal.action !== 'move' && deal.hand === 0).map((deal) => clipKey(deal.seat, deal.index, deal.action as CardAction)));
  // Per ankare: det bästa klippet för varje kort i rundan, hur många godkända klipp ankaret har ur vyn, och när dess
  // senaste post fördes in. Klippen som inte spelas, med ankaret de hör till.
  type Group = { best: Map<string, { take: Take; number: number; order: number }>; approved: number; latest: number };
  const sets = new Map<string | null, Group>();
  const skipped: (Plan['unusable'][number] & { anchor: string | null })[] = [];
  entries.forEach((entry, order) => {
    if (entry.dealer !== dealer || entry.use !== 'dealerfilm' || !sameView(entry.view, view) || !isCycle(entry)) return;
    const anchor = anchorOf(entry);
    const take = takeOf(entry);
    if (typeof take === 'string') return void skipped.push({ file: entry.file, why: take, anchor });
    const key = clipKey(take.seat, take.index, take.action);
    const playable = entry.status === PLAYED && entry.present !== false;
    if (playable) {
      const set = sets.get(anchor) ?? { best: new Map(), approved: 0, latest: -1 };
      sets.set(anchor, set);
      set.approved += 1;
      set.latest = Math.max(set.latest, order);
    }
    if (!wanted.has(key)) return;
    if (entry.status !== PLAYED) return void skipped.push({ file: entry.file, why: `status ${entry.status}`, anchor });
    if (entry.present === false) return void skipped.push({ file: entry.file, why: 'filen saknas i assets/', anchor });
    const best = sets.get(anchor)!.best;
    const number = isNumber(entry.take) ? entry.take : 0;
    const known = best.get(key);
    if (!known || number > known.number || (number === known.number && order > known.order)) best.set(key, { take, number, order });
  });
  const ranked = [...sets.entries()]
    .filter(([, set]) => set.best.size > 0)
    .sort(([, a], [, b]) => b.best.size - a.best.size || b.approved - a.approved || b.latest - a.latest);
  const anchor = ranked[0]?.[0] ?? null;
  const best = ranked[0]?.[1].best ?? new Map<string, { take: Take; number: number; order: number }>();
  const unusable = skipped.filter((item) => ranked.length === 0 || item.anchor === anchor).map(({ file, why }) => ({ file, why }));

  const clips: FilmClip[] = [];
  const dealt: Plan['dealt'] = [];
  const missing: Deal[] = [];
  for (const deal of deals) {
    const spot: CardSpot = { seat: deal.seat, index: deal.index, ...(deal.hand > 0 ? { hand: deal.hand } : {}) };
    if (deal.action === 'move') {
      const seconds = fallback.move;
      clips.push({ file: null, seconds, card: { ...spot, face: deal.face, at: seconds }, from: deal.from! });
      dealt.push({ ...deal, file: null, status: null, at: seconds, seconds });
      continue;
    }
    const found = deal.hand === 0 ? best.get(clipKey(deal.seat, deal.index, deal.action)) : undefined;
    if (found) {
      clips.push({ file: found.take.file, card: { ...spot, face: deal.face, at: found.take.at } });
      dealt.push({ ...deal, file: found.take.file, status: found.take.status, at: found.take.at, seconds: found.take.seconds ?? 0 });
      continue;
    }
    const seconds = deal.action === 'flip' ? fallback.turn : fallback.seconds;
    clips.push({ file: null, seconds, card: { ...spot, face: deal.face, at: seconds }, from: deal.action === 'flip' ? spot : 'skon' });
    dealt.push({ ...deal, file: null, status: null, at: seconds, seconds });
    missing.push(deal);
  }
  return { clips, dealt, missing, unusable, anchor, anchors: ranked.map(([one, set]) => ({ anchor: one, clips: set.best.size })) };
}

/** Ankaret som ord: filens namn utan mapp, eller att posten inte säger det. */
export const anchorName = (anchor: string | null): string => (anchor === null ? 'okänt ankare' : (anchor.split('/').at(-1) ?? anchor));

/** Ett kort i rundan som ord: kortplatsen, och vad som händer med det när det inte bara delas ut. */
export function dealName(deal: Deal): string {
  const what = { deal: '', hole: ' med baksidan upp (hole)', flip: ' vänds (flip)', move: ` flyttas från ${deal.from ? spotName(deal.from) : '?'}` }[deal.action];
  return `${spotName(deal)}${deal.action === 'deal' ? ' (deal)' : what}`;
}

/**
 * Rundan som dealerfilm: delarna i spelordning, gjorda i vyn `view`, med varje kort kvar från att det har landat, och
 * sista rutan kvar rundans `hold` sekunder innan följden börjar om. Med `loop: false` står sista rutan kvar.
 */
export function roundFilm(plan: Plan, round: Round, view: SeatView, loop = true): FilmNote {
  if (plan.clips.length === 0) throw new RoundError('Rundan har inga kort att spela');
  return { kind: 'film', view, clips: plan.clips, hold: round.film.hold, ...(loop ? {} : { loop: false }) };
}

/**
 * Dealern i REDO när inget kort delas: det första godkända cykelklippet ur vyn, som står på sin första ruta, gjort ur
 * det ankare som har flest godkända klipp ur vyn (vid lika det senast införda). Null när vyn inte har något.
 */
export function readyClip(entries: RoundEntry[], dealer: string, view: SeatView): string | null {
  const played = entries.filter((entry) => entry.dealer === dealer && entry.use === 'dealerfilm' && sameView(entry.view, view) && isCycle(entry) && entry.status === PLAYED && entry.present !== false);
  const count = new Map<string | null, { clips: number; latest: number }>();
  played.forEach((entry, order) => {
    const known = count.get(anchorOf(entry)) ?? { clips: 0, latest: -1 };
    count.set(anchorOf(entry), { clips: known.clips + 1, latest: order });
  });
  const chosen = [...count.entries()].sort(([, a], [, b]) => b.clips - a.clips || b.latest - a.latest)[0]?.[0];
  return played.find((entry) => anchorOf(entry) === chosen)?.file ?? null;
}

/**
 * Kortplatsen på filten för ett kort: platsens kortplats `index` ur content/scene.json (dealerns ur `places.dealer`).
 * Ett kort bortom platsens sista kortplats ligger ett steg längre i samma riktning som de två sista, och en delad hand
 * (hand 2 och framåt) ligger ett kort längre mot spelaren per hand. Båda är räknade ur scenens tal, inte mätta. Null
 * när scenen inte har platsen.
 */
export function spotPlace(scene: SceneDescription, spot: CardSpot): FeltPoint | null {
  const row = spot.seat === 'D' ? scene.places.dealer : scene.places.seats.find((entry) => entry.seat === spot.seat)?.cards;
  if (!row || row.length === 0 || !Number.isInteger(spot.index) || spot.index < 0) return null;
  let place: FeltPoint;
  if (spot.index < row.length) place = row[spot.index]!;
  else if (row.length >= 2) {
    const [a, b] = [row.at(-2)!, row.at(-1)!];
    const steps = spot.index - (row.length - 1);
    place = [b[0] + steps * (b[0] - a[0]), b[1] + steps * (b[1] - a[1])];
  } else return null;
  const hand = spot.hand ?? 0;
  return hand > 0 ? [place[0], place[1] + hand * scene.card.height] : place;
}

/** Bakgrunden i en beställning: registrets fil och hur den visas. */
export type OrderBackground = Omit<Background, 'url'> & { file: string };

/**
 * Rundans rum ur registrets post: filen, gamla projektets visning (`oldView`) och rummets mått ur scenen, med
 * bakgrundens egen höjd när scenen har en (`room.captureHeights`).
 */
export function backgroundOf(entry: RoundEntry | undefined, scene: SceneDescription): OrderBackground {
  if (!entry) throw new RoundError('Rundans bakgrund har ingen post i registret');
  const old = (entry.oldView ?? {}) as Record<string, unknown>;
  const number = (value: unknown, otherwise: number): number => (isNumber(value) ? value : otherwise);
  const round = entry.kind !== 'platt';
  return {
    file: entry.file,
    kind: round ? '360' : 'platt',
    turn: number(old.turn, 0),
    blur: number(old.blur, 0),
    exposure: number(old.exposure, 1),
    mirror: typeof old.mirror === 'boolean' ? old.mirror : false,
    lift: round ? scene.background.liftDeg : 0,
    height: captureHeightOf(scene, entry.file),
    radius: scene.room.radius,
  };
}
