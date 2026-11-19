// Rörelsens värden som reglage i steget Dockan: vilka värden i en cykel (content/moves/cykel-*.json) som går att ändra,
// vad de heter och betyder, i vilken grupp de står, i vilken enhet de visas och inom vilka gränser. Betydelserna är de
// som src/scene/dollPose.ts ger dem (DollCycle, Life, Hands, Back) och som koden där använder dem: ett värde visas bara
// när det verkligen gäller det som spelas (handlingen, och om cykeln delar med två händer). Gränserna är reglagens;
// vad som går ihop prövar readCycle, och vad dockan klarar moveFor. Här står inga värden för en viss rörelse.

import type { Action, DollCycle, DollMove, Seat } from '../scene/dollPose.ts';

export type GroupKey = 'takt' | 'vag' | 'vandning' | 'blick' | 'bal' | 'andning' | 'hander';
export type Group = { key: GroupKey; label: string; what: string };

export const GROUPS: Group[] = [
  { key: 'takt', label: 'Takt', what: 'Hur länge varje del av cykeln tar. Tillsammans är de cykelns längd.' },
  { key: 'vag', label: 'Väg', what: 'Hur handen lägger kortet, knuffar det på plats och går tillbaka till skon.' },
  { key: 'vandning', label: 'Hålkort och vändning', what: 'Hur dealerns hålkort läggs med baksidan upp, och hur det vänds.' },
  { key: 'blick', label: 'Blick och huvud', what: 'Vart hon ser, och hur huvudet följer blicken.' },
  { key: 'bal', label: 'Bål', what: 'Hur kroppen lutar och vrider sig mot kortet, och när den kommer hem.' },
  { key: 'andning', label: 'Andning', what: 'Det lilla som gör att hon aldrig står helt still. Noll i REDO, så att klippen kan följa på varandra.' },
  { key: 'hander', label: 'Två händer', what: 'Tvåhandsgiven: vänster hand drar ut kortet, höger hand tar det och lägger det.' },
];

/**
 * Hur ett värde visas: `s` sekunder, `rutor` sekunder i hela rutor, `cm` meter som centimeter, `grader`, `rad` radianer
 * som grader, `andel` 0–1, `antal` ett heltal, `ruta` en ruta i den lästa given, `cm/rad` meter per radian som
 * centimeter per radian, `val` ett av flera ord, `ja/nej` sant eller falskt.
 */
export type Unit = 's' | 'rutor' | 'cm' | 'grader' | 'rad' | 'andel' | 'antal' | 'ruta' | 'cm/rad' | 'val' | 'ja/nej';

/** Det som avgör vilka värden som gäller: cykeln, handlingen, platsen och den lästa given cykeln bygger på. */
export type FieldContext = { cycle: DollCycle; action: Action; seat: Seat; give: DollMove | null };

export type Field = {
  id: string;
  group: GroupKey;
  label: string;
  what: string;
  unit: Unit;
  /** Vägen i cykelns fil som reglaget ändrar, eller null när värdet inte gäller det som spelas. */
  at: (context: FieldContext) => string[] | null;
  /** Gränserna i filens enhet. Ett värde som redan står utanför dem vidgar dem. */
  range?: (context: FieldContext) => [number, number];
  /** Steget i filens enhet; för `rutor` en ruta. */
  step?: number;
  choices?: { value: string; label: string }[];
};

// ---------------------------------------------------------------------------------------------------------------------
// Att läsa och skriva en väg i cykeln

export function getAt(value: unknown, path: string[]): unknown {
  let at: unknown = value;
  for (const key of path) {
    if (at === null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

/** En kopia av `value` med `next` på vägen `path`; allt annat är detsamma. */
export function setAt<T>(value: T, path: string[], next: unknown): T {
  if (path.length === 0) return next as T;
  const [key, ...rest] = path;
  const own = (value ?? {}) as Record<string, unknown>;
  const copy = Array.isArray(own) ? [...own] : { ...own };
  (copy as Record<string, unknown>)[key!] = setAt(own[key!], rest, next);
  return copy as T;
}

// ---------------------------------------------------------------------------------------------------------------------
// När ett värde gäller

const twoHanded = (context: FieldContext): boolean => context.cycle.hands !== undefined && context.action === 'deal';
const waiting = (context: FieldContext): boolean => context.action === 'wait';
/** Vägen när den finns i cykeln och värdet gäller, annars null. */
const where = (path: string[], applies: (context: FieldContext) => boolean = () => true) => (context: FieldContext): string[] | null =>
  applies(context) && getAt(context.cycle, path) !== undefined ? path : null;

/** Andningen som spelas: väntans egen i en väntan, tvåhandsgivens egen i den, annars cykelns (dollPose.ts, waited och handsLife). */
function breathPath(context: FieldContext): string[] {
  if (waiting(context)) return context.cycle.wait?.breath ? ['wait', 'breath'] : ['life', 'breath'];
  return twoHanded(context) && context.cycle.hands?.breath ? ['hands', 'breath'] : ['life', 'breath'];
}
/** Ytterplatsernas lutning: tvåhandsgivens egen i den, annars cykelns. */
const sidePath = (context: FieldContext): string[] => (twoHanded(context) && context.cycle.hands?.side ? ['hands', 'side'] : ['life', 'side']);
const breath = (key: string) => (context: FieldContext): string[] | null => where([...breathPath(context), key])(context);
const side = (key: string) => (context: FieldContext): string[] | null => (waiting(context) ? null : where([...sidePath(context), key])(context));

const notWaiting = (context: FieldContext): boolean => !waiting(context);
const oneHand = (context: FieldContext): boolean => !waiting(context) && !twoHanded(context);
const fixed = (low: number, high: number) => (): [number, number] => [low, high];
const number = (value: unknown, otherwise = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : otherwise);

// ---------------------------------------------------------------------------------------------------------------------
// Reglagen

/** Cykelns egen takt gäller allt utom väntan och tvåhandsgiven, som har sina egna. */
const part = (key: string, label: string, what: string, range: [number, number]): Field => ({ id: `parts.${key}`, group: 'takt', label, what, unit: 'rutor', at: where(['parts', key], oneHand), range: fixed(...range) });
const handsPart = (key: string, label: string, what: string, range: [number, number]): Field => ({
  id: `hands.parts.${key}`,
  group: 'takt',
  label,
  what,
  unit: 'rutor',
  at: where(['hands', 'parts', key], twoHanded),
  range: fixed(...range),
});

export const FIELDS: Field[] = [
  // Takt
  part('ready', 'Stilla i början', 'Hur länge hon står i REDO innan handen går.', [0, 1.5]),
  part('deal', 'Ut med kortet', 'Från REDO tills kortet ligger på platsen. I en vändning också vägen ut till hålkortet och lyftet.', [0.3, 4]),
  part('onCard', 'Handen kvar på kortet', 'Fingrarna vilar på kortet, och knuffar det på plats, innan handen lämnar det.', [0, 2]),
  part('back', 'Tillbaka till skon', 'Vägen tillbaka till nästa kort i skon.', [0.2, 3]),
  part('still', 'Stilla i slutet', 'Hur länge hon står i REDO innan cykeln är slut.', [0, 1.5]),
  handsPart('ready', 'Stilla i början', 'Hur länge hon står i REDO innan händerna går.', [0, 1.5]),
  handsPart('slide', 'Vänster hand drar ut kortet', 'Vänster hand drar kortet ur skon till handbytet, medan höger hand går dit.', [0.1, 2]),
  handsPart('raise', 'Båda reser kortet', 'Höger hand tar kortets kortsida och båda reser det.', [0.1, 1.5]),
  handsPart('carry', 'Höger hand bär kortet', 'Höger hand bär kortet, vänder det och lägger det.', [0.1, 2]),
  handsPart('onCard', 'Fingrarna kvar på kortet', 'Fingrarna vilar på kortet och knuffar det på plats.', [0.05, 2]),
  handsPart('back', 'Höger hand hem', 'Höger hand går tillbaka till sin vila.', [0.1, 2]),
  handsPart('still', 'Stilla i slutet', 'Hur länge hon står i REDO innan cykeln är slut.', [0, 1.5]),
  { id: 'wait.seconds', group: 'takt', label: 'Väntans längd', what: 'Ett varv av väntan, som spelas om och om medan spelaren bestämmer sig.', unit: 'rutor', at: where(['wait', 'seconds'], waiting), range: fixed(1, 8) },

  // Väg
  { id: 'life.touch', group: 'vag', label: 'Läggningen', what: '0: handen stannar mjukt vid kortet. 1: den bromsar in och lyfter genast, som när man lägger ned något.', unit: 'andel', at: where(['life', 'touch'], notWaiting), range: fixed(0, 1), step: 0.05 },
  { id: 'life.effort', group: 'vag', label: 'Vridningen tar tid', what: 'Handens väg räknas som greppets sträcka plus så mycket per radian kortet vrids: mer ger vändningen mer tid.', unit: 'cm/rad', at: where(['life', 'effort'], oneHand), range: fixed(0, 0.2) },
  { id: 'hands.effort', group: 'vag', label: 'Vändningen i luften tar tid', what: 'Bärningens väg räknas som greppets sträcka plus så mycket per radian kortet vänds.', unit: 'cm/rad', at: where(['hands', 'effort'], twoHanded), range: fixed(0, 0.2) },
  { id: 'life.calm.hand', group: 'vag', label: 'Utjämning av handen', what: 'Hur många gånger den lästa givens spår för hand och kort jämnas ut innan de spelas fortare.', unit: 'antal', at: where(['life', 'calm', 'hand'], notWaiting), range: fixed(0, 40), step: 1 },
  { id: 'back.lift', group: 'vag', label: 'Bågen tillbaka', what: 'Hur högt över den raka vägen handen lyfter som mest på vägen tillbaka.', unit: 'cm', at: where(['back', 'lift'], oneHand), range: fixed(0, 0.2) },
  { id: 'back.release', group: 'vag', label: 'Lämnar filten', what: 'Så stor del av vägen tillbaka har gått när handen har lämnat filten.', unit: 'andel', at: where(['back', 'release'], oneHand), range: fixed(0.05, 1), step: 0.01 },
  {
    id: 'back.open',
    group: 'vag',
    label: 'Fingrarna öppnas',
    what: 'Fingrarna går ur greppet till en avslappnad hand tills så stor del av vägen tillbaka är gången.',
    unit: 'andel',
    at: where(['back', 'open'], notWaiting),
    range: (context) => [0.05, number(context.cycle.back.close, 0.95)],
    step: 0.01,
  },
  {
    id: 'back.close',
    group: 'vag',
    label: 'Fingrarna sluts',
    what: 'Från så stor del av vägen tillbaka sluter sig fingrarna till nypet i skon.',
    unit: 'andel',
    at: where(['back', 'close'], notWaiting),
    range: (context) => [number(context.cycle.back.open, 0.05), 0.98],
    step: 0.01,
  },
  {
    id: 'back.look',
    group: 'vag',
    label: 'Blicken till nästa kort',
    what: 'Så stor del av vägen tillbaka har gått när blicken når nästa kort i skon. Gäller bara när blicken följer kortet.',
    unit: 'andel',
    at: where(['back', 'look'], (context) => notWaiting(context) && context.cycle.life.look !== 'place'),
    range: fixed(0.05, 1),
    step: 0.01,
  },
  { id: 'push.reach', group: 'vag', label: 'Knuffen', what: 'Kortet landar så långt före sin plats, och fingertopparna skjuter det dit. 0 är ingen knuff.', unit: 'cm', at: where(['push', 'reach'], notWaiting), range: fixed(0, 0.06) },
  {
    id: 'push.from',
    group: 'vag',
    label: 'Knuffen börjar',
    what: 'Sekunder från att kortet ligger. Negativt: medan kortet läggs, så att det glider in.',
    unit: 's',
    at: where(['push', 'from'], notWaiting),
    range: (context) => [-Math.max(0, number(context.cycle.parts.deal) - 0.05), number(context.cycle.push?.to) - 0.05],
    step: 0.01,
  },
  {
    id: 'push.to',
    group: 'vag',
    label: 'Knuffen slutar',
    what: 'Sekunder från att kortet ligger; högst så länge handen är kvar på kortet.',
    unit: 's',
    at: where(['push', 'to'], notWaiting),
    range: (context) => [number(context.cycle.push?.from) + 0.05, twoHanded(context) ? number(context.cycle.hands?.parts.onCard) : number(context.cycle.parts.onCard)],
    step: 0.01,
  },

  // Hålkort och vändning
  {
    id: 'hole',
    group: 'vandning',
    label: 'Hålkortet läggs',
    what: 'Som en giv utan vändningen, eller plant ur skon längs filten till sin plats.',
    unit: 'val',
    at: where(['hole'], (context) => context.action === 'hole'),
    choices: [
      { value: 'given', label: 'Som en giv' },
      { value: 'flat', label: 'Plant längs filten' },
    ],
  },
  { id: 'flip.reach', group: 'vandning', label: 'Ut till hålkortet', what: 'Hur lång tid handen tar ut till hålkortet på bordet.', unit: 'rutor', at: where(['flip', 'reach'], (context) => context.action === 'flip'), range: fixed(0.1, 1.5) },
  { id: 'flip.pickUp', group: 'vandning', label: 'Lyftet', what: 'Hur lång tid handen tar att lyfta hålkortet innan det vänds.', unit: 'rutor', at: where(['flip', 'pickUp'], (context) => context.action === 'flip'), range: fixed(0.1, 1.2) },
  {
    id: 'flip.from',
    group: 'vandning',
    label: 'Lyftets topp',
    what: 'Rutan i den lästa given där lyftet vänder: där håller handen kortet ovanför bordet strax före givens egen vändning.',
    unit: 'ruta',
    at: where(['flip', 'from'], (context) => context.action === 'flip'),
    range: (context) => [0, Math.max(0, (context.give?.moments.edge[0] ?? 3) - 3)],
    step: 1,
  },
  { id: 'flip.follow', group: 'vandning', label: 'Kroppen följer lyftet', what: 'Så stor andel av handens höjd följer axlarna och huvudet med upp och ned.', unit: 'andel', at: where(['flip', 'follow'], (context) => context.action === 'flip'), range: fixed(0, 1), step: 0.05 },

  // Blick och huvud
  {
    id: 'life.look',
    group: 'blick',
    label: 'Blicken',
    what: 'Följer kortet från skon och tillbaka, eller går från bordets mitt till platsen och tillbaka utan att se på skon.',
    unit: 'val',
    at: (context) => (waiting(context) ? null : ['life', 'look']),
    choices: [
      { value: 'card', label: 'Följer kortet' },
      { value: 'place', label: 'Till platsen' },
    ],
  },
  { id: 'life.gazeLead', group: 'blick', label: 'Blicken före kortet', what: 'Blicken ser dit kortet är om så lång tid.', unit: 's', at: where(['life', 'gazeLead'], notWaiting), range: fixed(0, 0.8), step: 0.01 },
  { id: 'life.headLag', group: 'blick', label: 'Huvudet efter blicken', what: 'Huvudet vänds mot dit blicken såg så lång tid tidigare.', unit: 's', at: where(['life', 'headLag'], notWaiting), range: fixed(0, 0.5), step: 0.01 },
  { id: 'life.headShare', group: 'blick', label: 'Huvudets del av vridningen', what: 'Så stor del av vägen vrids huvudet; ögonen tar resten.', unit: 'andel', at: where(['life', 'headShare']), range: fixed(0, 1), step: 0.05 },
  { id: 'life.headSpan', group: 'blick', label: 'Huvudets jämnhet', what: 'Blicken vägs över så lång tid, så att ett snabbt ögonkast blir en jämn vridning av huvudet.', unit: 's', at: where(['life', 'headSpan'], notWaiting), range: fixed(0, 1), step: 0.01 },
  { id: 'life.nod', group: 'blick', label: 'Nicken', what: 'En liten nick när kortet läggs. 0 är ingen nick.', unit: 'grader', at: where(['life', 'nod'], notWaiting), range: fixed(0, 15), step: 0.5 },
  { id: 'wait.look', group: 'blick', label: 'Blicken upp mot spelarna', what: 'Som mest så stor del av vägen från bordets mitt upp mot spelarna.', unit: 'andel', at: where(['wait', 'look'], waiting), range: fixed(0, 1), step: 0.05 },
  { id: 'wait.across', group: 'blick', label: 'Blicken åt sidorna', what: 'Så många grader åt var sida under varvet.', unit: 'grader', at: where(['wait', 'across'], waiting), range: fixed(0, 45), step: 1 },
  { id: 'wait.head.0', group: 'blick', label: 'Huvudet åt sidan', what: 'Huvudets mitt följer blicken så långt åt sidan.', unit: 'cm', at: where(['wait', 'head', '0'], waiting), range: fixed(0, 0.08) },
  { id: 'wait.head.1', group: 'blick', label: 'Huvudet uppåt', what: 'Huvudets mitt följer blicken så långt uppåt.', unit: 'cm', at: where(['wait', 'head', '1'], waiting), range: fixed(0, 0.08) },

  // Bål
  { id: 'life.trunkLead', group: 'bal', label: 'Bålen börjar före handen', what: 'Bålens lutning mot platsen börjar så långt innan handen lämnar REDO.', unit: 's', at: where(['life', 'trunkLead'], notWaiting), range: fixed(0, 0.6), step: 0.01 },
  {
    id: 'trunkLag',
    group: 'bal',
    label: 'Bålen går hem efter handen',
    what: 'Bålen börjar gå tillbaka så långt efter att handen har lämnat kortet.',
    unit: 's',
    at: (context) => (waiting(context) ? null : twoHanded(context) && context.cycle.hands?.trunkLag !== undefined ? ['hands', 'trunkLag'] : ['life', 'trunkLag']),
    range: fixed(0, 0.6),
    step: 0.01,
  },
  { id: 'life.leanLeast', group: 'bal', label: 'Minsta lutning', what: 'Hon lutar sig minst så mycket mot varje kort, också där armen når utan.', unit: 'rad', at: where(['life', 'leanLeast'], notWaiting), range: fixed(0, 0.15) },
  { id: 'side.from', group: 'bal', label: 'Ytterplats från', what: 'Där armen kräver mer lutning än så böjer hon sig mindre och vrider axlarna mer.', unit: 'rad', at: side('from'), range: fixed(0, 0.6) },
  {
    id: 'side.most',
    group: 'bal',
    label: 'Mest böjning ytterst',
    what: 'Vid ytterplatserna närmar sig böjningen från höften så mycket; axlarnas vridning tar resten.',
    unit: 'rad',
    at: side('most'),
    range: (context) => [number(getAt(context.cycle, [...sidePath(context), 'from'])) + 0.005, 0.7],
  },
  { id: 'side.twist', group: 'bal', label: 'Axlarnas vridning', what: 'Axlarna vrids så många gånger det böjningen inte tar.', unit: 'andel', at: side('twist'), range: fixed(0, 3), step: 0.05 },
  { id: 'side.home', group: 'bal', label: 'Bålen hemma före slutet', what: 'Vid ytterplatserna är bålen tillbaka så långt innan cykeln är slut.', unit: 's', at: side('home'), range: fixed(0, 0.8), step: 0.01 },
  { id: 'life.calm.body', group: 'bal', label: 'Utjämning av kroppen', what: 'Hur många gånger den lästa givens spår för kroppen och den vilande handen jämnas ut.', unit: 'antal', at: where(['life', 'calm', 'body'], notWaiting), range: fixed(0, 60), step: 1 },
  { id: 'wait.trunk.0', group: 'bal', label: 'Axlarna följer huvudet', what: 'Axlarna följer huvudet åt sidan med så stor andel.', unit: 'andel', at: where(['wait', 'trunk', '0'], waiting), range: fixed(0, 1), step: 0.05 },
  { id: 'wait.trunk.1', group: 'bal', label: 'Axlarna kommer efter', what: 'Så många sekunder efter huvudet.', unit: 's', at: where(['wait', 'trunk', '1'], waiting), range: fixed(0, 2), step: 0.05 },

  // Andning
  { id: 'breath.rise', group: 'andning', label: 'Axlarna lyfts', what: 'Så mycket lyfts axlarna i ett andetag.', unit: 'cm', at: breath('rise'), range: fixed(0, 0.03) },
  { id: 'breath.head', group: 'andning', label: 'Huvudet lyfts', what: 'Så mycket lyfts huvudet i ett andetag.', unit: 'cm', at: breath('head'), range: fixed(0, 0.03) },
  { id: 'breath.sway', group: 'andning', label: 'Huvudet svänger', what: 'Så långt svänger huvudet i sidled, en gång per cykel.', unit: 'cm', at: breath('sway'), range: fixed(0, 0.04) },
  { id: 'breath.turn', group: 'andning', label: 'Huvudet vrids', what: 'Så många grader vrids huvudet fram och tillbaka under cykeln.', unit: 'grader', at: breath('turn'), range: fixed(0, 15), step: 0.5 },
  { id: 'breath.fingers', group: 'andning', label: 'Vilande handens fingrar', what: 'Så mycket lyfts pek- och långfingret på handen som vilar på filten.', unit: 'cm', at: breath('fingers'), range: fixed(0, 0.04) },
  { id: 'breath.cycles', group: 'andning', label: 'Andetag per cykel', what: 'Hur många gånger hon andas under en cykel.', unit: 'antal', at: breath('cycles'), range: fixed(1, 4), step: 1 },
  {
    id: 'breath.still',
    group: 'andning',
    label: 'Börjar och slutar stilla',
    what: 'Andningen börjar och slutar med farten noll i REDO, så att klippet kan följa på en cykel utan andning.',
    unit: 'ja/nej',
    at: (context) => [...breathPath(context), 'still'],
  },

  // Två händer
  { id: 'hands.release', group: 'hander', label: 'Vänster hand släpper', what: 'Så lång tid efter handbytet släpper vänster hand kortet och går tillbaka till skon.', unit: 's', at: where(['hands', 'release'], twoHanded), range: (context) => [0.05, number(context.cycle.hands?.parts.raise) + number(context.cycle.hands?.parts.carry) - 0.05], step: 0.01 },
  { id: 'hands.follow', group: 'hander', label: 'Vänster hand följer med upp', what: 'Så stor del av resningen följer vänster hands fingrar kortet innan de släpper.', unit: 'andel', at: where(['hands', 'follow'], twoHanded), range: fixed(0, 1), step: 0.05 },
  { id: 'hands.leftStill', group: 'hander', label: 'Vänster hand stilla i slutet', what: 'Hur länge vänster hand står i REDO i slutet; dit går den på resten av cykeln.', unit: 's', at: where(['hands', 'leftStill'], twoHanded), range: fixed(0, 1.5), step: 0.01 },
  { id: 'hands.handoff.edge', group: 'hander', label: 'Handbytet från kanten', what: 'Kortets mitt vid handbytet ligger så långt från dealerns bordskant.', unit: 'cm', at: where(['hands', 'handoff', 'edge'], twoHanded), range: fixed(0.05, 0.3) },
  {
    id: 'hands.handoff.from',
    group: 'hander',
    label: 'Handbytet från skon',
    what: 'Kortets kortsida mot skon ligger så långt från skons nos vid handbytet, för den valda platsen.',
    unit: 'cm',
    at: (context) => where(['hands', 'handoff', 'from', String(context.seat)], twoHanded)(context),
    range: fixed(0.05, 0.4),
  },
  { id: 'hands.lift.reach', group: 'hander', label: 'Höger hand bågar dit', what: 'Så högt bågar höger hand på väg till handbytet.', unit: 'cm', at: where(['hands', 'lift', 'reach'], twoHanded), range: fixed(0, 0.12) },
  { id: 'hands.lift.back', group: 'hander', label: 'Höger hand bågar hem', what: 'Så högt bågar höger hand på väg hem till vilan.', unit: 'cm', at: where(['hands', 'lift', 'back'], twoHanded), range: fixed(0, 0.12) },
  { id: 'hands.lift.left', group: 'hander', label: 'Vänster hand bågar till skon', what: 'Så högt bågar vänster hand på väg tillbaka till skon.', unit: 'cm', at: where(['hands', 'lift', 'left'], twoHanded), range: fixed(0, 0.12) },
  { id: 'hands.wristMost', group: 'hander', label: 'Största vinkel i handleden', what: 'Armbågarna vrids så att handlederna håller sig inom så många grader där det går.', unit: 'grader', at: where(['hands', 'wristMost'], twoHanded), range: fixed(30, 150), step: 1 },
];

// ---------------------------------------------------------------------------------------------------------------------
// Visa och ställa

/** Ett reglage som gäller: fältet, vägen i cykeln och värdet där. */
export type Shown = { field: Field; path: string[]; value: unknown };

/** Reglagen som gäller för det som spelas, i gruppernas ordning. */
export function fieldsFor(context: FieldContext): Shown[] {
  const shown: Shown[] = [];
  for (const field of FIELDS) {
    const path = field.at(context);
    if (!path) continue;
    const value = getAt(context.cycle, path);
    // En kryssruta och ett val får sakna sitt värde (falskt, och det första valet, som läsaren tar när inget sägs);
    // andra visas bara när cykeln har dem.
    if (value === undefined && field.unit !== 'ja/nej' && field.unit !== 'val') continue;
    shown.push({ field, path, value });
  }
  return shown;
}

const comma = (value: number, digits: number): string => value.toFixed(digits).replace('.', ',').replace(/^-(0,0*)$/, '$1');

/** Talet så som reglaget visar det: i centimeter, grader och så vidare. */
export function toShown(unit: Unit, value: number): number {
  if (unit === 'cm' || unit === 'cm/rad') return value * 100;
  if (unit === 'rad') return (value * 180) / Math.PI;
  return value;
}

/** Tillbaka till filens enhet, avrundat så som filerna skriver talen. */
export function fromShown(unit: Unit, shown: number, fps = 30): number {
  const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;
  if (unit === 'cm' || unit === 'cm/rad') return round(shown / 100, 4);
  if (unit === 'rad') return round((shown * Math.PI) / 180, 4);
  if (unit === 'rutor') return round(Math.round(shown * fps) / fps, 4);
  if (unit === 'antal' || unit === 'ruta') return Math.round(shown);
  return round(shown, 4);
}

/** Reglagets steg i visad enhet. */
export function stepOf(field: Field, fps = 30): number {
  if (field.unit === 'rutor') return 1 / fps;
  if (field.step !== undefined) return toShown(field.unit, field.step);
  if (field.unit === 'cm' || field.unit === 'cm/rad') return 0.1;
  if (field.unit === 'rad') return 0.1;
  return 0.01;
}

/** Gränserna i visad enhet, vidgade så att värdet själv ryms. */
export function rangeOf(field: Field, context: FieldContext, value: number): [number, number] {
  const [low, high] = field.range?.(context) ?? [0, 1];
  return [Math.min(toShown(field.unit, low), toShown(field.unit, value)), Math.max(toShown(field.unit, high), toShown(field.unit, value))];
}

/** Värdet i ord, med sin enhet: "1,60 s · 48 rutor", "5,0 cm", "1,7°". */
export function said(field: Field, value: unknown, fps = 30): string {
  if (field.unit === 'val') return field.choices?.find((choice) => choice.value === value)?.label ?? String(value ?? '');
  if (field.unit === 'ja/nej') return value === true ? 'ja' : 'nej';
  if (typeof value !== 'number') return '–';
  switch (field.unit) {
    case 'rutor':
      return `${comma(value, 2)} s · ${Math.round(value * fps)} rutor`;
    case 's':
      return `${comma(value, 2)} s`;
    case 'cm':
      return `${comma(value * 100, 1)} cm`;
    case 'cm/rad':
      return `${comma(value * 100, 1)} cm/rad`;
    case 'rad':
      return `${comma((value * 180) / Math.PI, 1)}°`;
    case 'grader':
      return `${comma(value, 1)}°`;
    case 'andel':
      return comma(value, 2);
    default:
      return String(value);
  }
}

const sum = (values: Record<string, number>): number => Object.values(values).reduce((total, part) => total + part, 0);
const exact = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Cykeln med `value` på vägen `path`, och med längden som följer: `seconds` är summan av takten (readCycle kräver det).
 * En cykel med två händer har två takter som ska vara lika långa, en för tvåhandsgiven och en för hålkortet, vändningen
 * och väntan: den andra taktens "stilla i slutet" tar skillnaden, så att båda går ihop.
 */
export function withValue(cycle: DollCycle, path: string[], value: unknown): DollCycle {
  let next = setAt(cycle, path, value);
  const changedTakt = path[0] === 'parts' || (path[0] === 'hands' && path[1] === 'parts');
  if (!changedTakt) return next;
  const own = path[0] === 'parts' ? next.parts : next.hands!.parts;
  const seconds = exact(sum(own));
  next = { ...next, seconds };
  if (next.hands) {
    const other = path[0] === 'parts' ? next.hands.parts : next.parts;
    const still = exact(seconds - (sum(other) - other.still));
    if (path[0] === 'parts') next = { ...next, hands: { ...next.hands, parts: { ...next.hands.parts, still } } };
    else next = { ...next, parts: { ...next.parts, still } };
  }
  return next;
}

/** Om värdet på vägen skiljer sig från ursprunget. */
export const isChanged = (original: unknown, edited: unknown, path: string[]): boolean => getAt(original, path) !== getAt(edited, path);
