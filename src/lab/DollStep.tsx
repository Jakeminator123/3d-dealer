// Steget Dockan: dockan levande i scenen. Jakob väljer rörelse (content/moves/), plats, kort och handling, spelar,
// pausar, drar i tiden och stegar ruta för ruta, vrider kameran fritt eller hoppar till vyerna, och ändrar rörelsens
// värden med reglage (dollFields.ts) medan dockan visar ändringen. En ändring sparas som en ny rörelse genom servern,
// dockans rörelsemått räknas där som när ett paket görs, och en tagning förbereds där med samma väg som
// `node src/pipeline/tagning.ts forbered`. Ingenting beställs härifrån: beställningen lägger agenten.
//
// Adressen är docka/<flik>/<rörelse>/<kort>, där kortet är plats-kort med handlingen efter när den inte är deal:
// 4-0, d-1-hole, d-1-flip, d-0-wait.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildScene, type Background, type SceneHandle, type Studio, type View } from '../scene/build.ts';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { ACTIONS, readCycle, readDoll, type Action, type DollCycle, type DollDescription, type DollMove } from '../scene/dollPose.ts';
import { seatsOf } from '../scene/geometry.ts';
import { backgroundOf, readRound } from '../scene/round.ts';
import { fetchContent } from './content.ts';
import { fetchDealers, type DealerState } from './dealers.ts';
import { fieldsFor, fromShown, getAt, GROUPS, isChanged, rangeOf, said, stepOf, toShown, withValue, type FieldContext, type Shown } from './dollFields.ts';
import type { Answer, Asked } from './dollWorker.ts';
import { fetchRegistry, mediaUrl, type Registry } from './registry.ts';
import { fetchJob, fetchMoves, measureMove, prepareTake, saveMove, type Card, type Check, type Job, type Measured, type MoveInfo, type Saved } from './rorelser.ts';
import { routeTo } from './route.ts';
import { anchorName, cardCode, cardKey as keyOf, cardName, cardWords, cycleLabel, framesOf, shownText, viewLabel } from './names.ts';
import { fetchTakes, sentWords, takeUrl, type Takes } from './takes.ts';
import './docka.css';

const STEP = 'docka';
const TABS = [
  { key: 'varden', label: 'Värden' },
  { key: 'matt', label: 'Mått' },
  { key: 'tagning', label: 'Tagning' },
] as const;
type Tab = (typeof TABS)[number]['key'];
const ACTION_WORDS: Record<Action, string> = { deal: 'Lägg kortet', hole: 'Hålkortet', flip: 'Vänd hålkortet', wait: 'Vänta' };
const ACTION_WHAT: Record<Action, string> = {
  deal: 'Kortet läggs med framsidan upp.',
  hole: 'Dealerns andra kort läggs med baksidan upp.',
  flip: 'Hålkortet vänds där det ligger.',
  wait: 'Hon väntar i REDO medan spelaren bestämmer sig.',
};
const SPEEDS = [1, 0.5, 0.25];
// Bakgrunden bakom dockan: mörk, dockans egen grå ateljé (som hennes film sparas i), eller rundans rum.
type Backdrop = 'mork' | 'atelje' | 'rum';
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;

const comma = (value: number, digits = 2): string => value.toFixed(digits).replace('.', ',');
const cardKey = (card: Card): string => keyOf(card.seat, card.index, card.action);
function cardOf(word: string | undefined): Card | null {
  const match = /^(d|\d+)-(\d+)(?:-(hole|flip|wait))?$/.exec(word ?? '');
  if (!match) return null;
  return { seat: match[1] === 'd' ? 'D' : Number(match[1]), index: Number(match[2]), action: (match[3] ?? 'deal') as Action };
}

type Loaded = {
  scene: SceneDescription;
  doll: DollDescription;
  raw: { scene: unknown; doll: unknown; tagning: any };
  registry: Registry;
  room: Background | null;
  moves: MoveInfo[];
  dealers: DealerState[];
};

export default function DollStep({ route }: { route: string[] }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const raw = (file: string) => fetchContent<unknown>(file, file, (value) => value);
    Promise.all([raw('scene.json'), raw('doll.json'), raw('tagning.json'), fetchContent('runda.json', 'Rundan', readRound), fetchRegistry(), fetchMoves(), fetchDealers().catch(() => [])]).then(
      ([sceneJson, dollJson, tagning, round, registry, moves, dealers]) => {
        const scene = readScene(sceneJson);
        const entry = registry.assets.find((asset) => asset.file === round.film.background && asset.present);
        const room = entry ? { ...backgroundOf(entry, scene), url: mediaUrl(entry.file) } : null;
        setData({ scene, doll: readDoll(dollJson), raw: { scene: sceneJson, doll: dollJson, tagning }, registry, room, moves, dealers });
      },
      (error: Error) => setProblem(error.message),
    );
  }, []);

  if (!data) return <main className="notice">{problem ?? 'Läser dockan …'}</main>;
  if (data.moves.length === 0) {
    return (
      <main className="main">
        <div className="emptystate">
          <b>Inga rörelser i content/moves/</b>
          Dockan gör en rörelse ur content/moves/. Där finns ingen än.
        </div>
      </main>
    );
  }
  return <Workbench data={data} route={route} onMoves={(moves) => setData({ ...data, moves })} />;
}

// ---------------------------------------------------------------------------------------------------------------------
// Arbetsbänken: valen, dockan och panelen

function Workbench({ data, route, onMoves }: { data: Loaded; route: string[]; onMoves: (moves: MoveInfo[]) => void }) {
  const { scene, doll, moves } = data;
  // Adressen: fliken, rörelsen och kortet. Utan rörelse visas den som flest klipp är gjorda med.
  const tab: Tab = TABS.some((one) => one.key === route[0]) ? (route[0] as Tab) : 'varden';
  const usual = [...moves].filter((move) => move.kind === 'cykel').sort((a, b) => b.clips - a.clips)[0] ?? moves[0]!;
  const info = moves.find((move) => move.name === route[1]) ?? usual;
  const name = info.name;
  const asked = cardOf(route[2]) ?? { seat: 4, index: 0, action: 'deal' };
  const cycleMove = info.kind === 'cykel';
  // En läst giv gör bara en giv; en handling utan dealerns plats blir en giv.
  const card: Card = !cycleMove || (asked.action !== 'deal' && asked.seat !== 'D') ? { ...asked, action: 'deal' } : asked;
  const go = useCallback((next: { tab?: Tab; move?: string; card?: Card }) => {
    window.location.hash = routeTo(STEP, next.tab ?? tab, next.move ?? name, cardKey(next.card ?? card));
  }, [tab, name, card.seat, card.index, card.action]);

  // Rörelsernas filer: som de står i content/moves/, och givarna cyklerna bygger på.
  const files = useRef(new Map<string, unknown>());
  const [, setRead] = useState(0);
  const [readProblem, setReadProblem] = useState<string | null>(null);
  const original = files.current.get(name);
  const giveName = cycleMove ? info.give : name;
  const giveJson = giveName ? files.current.get(giveName) : undefined;
  useEffect(() => {
    for (const file of [name, giveName]) {
      if (!file || files.current.has(file)) continue;
      fetchContent<unknown>(`moves/${file}.json`, `Rörelsen ${file}`, (value) => value).then(
        (value) => {
          files.current.set(file, value);
          setRead((n) => n + 1);
        },
        (error: Error) => setReadProblem(error.message),
      );
    }
  }, [name, giveName]);

  // Det som ställts med reglagen, per rörelse, så länge sidan är öppen, och det som sparades senast.
  const [drafts, setDrafts] = useState<Record<string, DollCycle>>({});
  const [savedNote, setSavedNote] = useState<{ name: string; text: string } | null>(null);
  const edited: DollCycle | null = cycleMove && original ? (drafts[name] ?? (original as DollCycle)) : null;
  const changedCount = edited && original ? countChanges(original as DollCycle, edited) : 0;
  const invalid = useMemo(() => {
    if (!edited) return null;
    try {
      readCycle(edited);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }, [edited]);
  const change = (path: string[], value: unknown) => {
    if (!edited) return;
    setDrafts((all) => ({ ...all, [name]: withValue(edited, path, value) }));
  };
  const resetAll = () =>
    setDrafts((all) => {
      const { [name]: _gone, ...rest } = all;
      return rest;
    });

  // Dockans rörelse till platsen, räknad i en egen tråd (dollWorker.ts) när något har ändrats.
  const { move, computing, moveProblem } = useMove(data, giveName ?? null, giveJson, cycleMove ? edited : null, invalid, card);

  // Kameran och bakgrunden.
  const [view, setView] = useState<View>({ kind: 'spelaren' });
  const [close, setClose] = useState(false);
  const [moved, setMoved] = useState(false);
  const [backdrop, setBackdrop] = useState<Backdrop>('mork');
  const [places, setPlaces] = useState(false);
  const shownView = useMemo<View>(() => (close ? { ...view, close: true } : view), [view, close]);
  const studio = useMemo<Studio | null>(() => {
    const own = data.raw.tagning?.reference?.studio as { screen?: number[]; table?: number[] } | undefined;
    return own?.screen ? { screen: own.screen as Studio['screen'], table: (own.table ?? null) as Studio['table'] } : null;
  }, [data]);
  const chooseView = (next: View) => {
    setView(next);
    setMoved(false);
  };

  const seats = seatsOf(scene);
  const indexes = card.seat === 'D' ? scene.places.dealer.length : (scene.places.seats.find((one) => one.seat === card.seat)?.cards.length ?? 1);
  const label = cycleLabel(name, info.about);

  return (
    <div className="dollstep">
      <section className="dollmain" aria-label="Dockan">
        <div className="dollpick">
          <label className="pickfield">
            <span className="label">Rörelse</span>
            <select className="select" value={name} onChange={(event) => go({ move: event.currentTarget.value })}>
              <optgroup label="Cykler: REDO → kortet lagt → REDO">
                {moves
                  .filter((move) => move.kind === 'cykel')
                  .map((move) => (
                    <option key={move.name} value={move.name}>
                      {cycleLabel(move.name, move.about)}
                      {move.clips > 0 ? ` · ${move.clips} klipp` : move.madeInLab ? ' · gjord i Labbet' : ''}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Läst giv, som cyklerna bygger på">
                {moves
                  .filter((move) => move.kind === 'giv')
                  .map((move) => (
                    <option key={move.name} value={move.name}>
                      {move.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <div className="pickfield">
            <span className="label">Kortet till plats</span>
            <div className="seg small" role="group" aria-label="Plats">
              {[...seats, 'D' as const].map((seat) => (
                <button
                  key={seat}
                  type="button"
                  aria-pressed={card.seat === seat}
                  title={seat === 'D' ? 'Dealerns egna kort' : `Spelarplats ${seat}`}
                  onClick={() => go({ card: { seat, index: 0, action: 'deal' } })}
                >
                  {seat === 'D' ? 'Dealern' : seat}
                </button>
              ))}
            </div>
          </div>
          <div className="pickfield">
            <span className="label">Kort</span>
            <div className="seg small" role="group" aria-label="Kort">
              {Array.from({ length: indexes }, (_, index) => (
                <button key={index} type="button" aria-pressed={card.index === index} disabled={card.action === 'wait'} title={cardWords(card.seat, index, 'deal')} onClick={() => go({ card: { ...card, index, action: card.action === 'deal' || index === 1 ? card.action : 'deal' } })}>
                  {cardCode(index)}
                </button>
              ))}
            </div>
          </div>
          <div className="pickfield">
            <span className="label">Handling</span>
            <div className="seg small" role="group" aria-label="Handling">
              {ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-pressed={card.action === action}
                  disabled={action !== 'deal' && !cycleMove}
                  title={action === 'deal' ? ACTION_WHAT.deal : `${ACTION_WHAT[action]} Görs hos dealern${card.seat === 'D' ? '' : ': valet flyttar kortet dit'}.`}
                  onClick={() => go({ card: { seat: 'D', index: action === 'wait' ? 0 : action === 'deal' ? card.index : 1, action } })}
                >
                  {ACTION_WORDS[action]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Player
          scene={scene}
          doll={doll}
          move={move}
          computing={computing}
          problem={moveProblem ?? invalid ?? readProblem}
          view={shownView}
          backdrop={backdrop === 'atelje' ? { studio, background: null } : backdrop === 'rum' ? { studio: null, background: data.room } : { studio: null, background: null }}
          places={places}
          onMoved={() => setMoved(true)}
          title={`${label}: ${cardName(card.seat, card.index, card.action)}, ${cardWords(card.seat, card.index, card.action)}`}
        />

        <div className="dollcamera">
          <span className="rowname">Vy</span>
          <div className="seg small" role="group" aria-label="Vy">
            <button type="button" aria-pressed={!moved && view.kind === 'spelaren'} title="Spelarens öga: vyn man spelar i" onClick={() => chooseView({ kind: 'spelaren' })}>
              Spelaren
            </button>
            {seats.map((seat) => (
              <button key={seat} type="button" aria-pressed={!moved && view.kind === 'plats' && view.seat === seat} title={`Spelarens öga flyttat till plats ${seat}`} onClick={() => chooseView({ kind: 'plats', seat })}>
                Plats {seat}
              </button>
            ))}
          </div>
          <label className="check" title="Samma öga, inzoomat på dealern: rutan hennes filmer görs i">
            <input
              type="checkbox"
              checked={close}
              onChange={(event) => {
                setClose(event.currentTarget.checked);
                setMoved(false);
              }}
            />
            Närbild
          </label>
          {moved && (
            <button type="button" className="btn small quiet" onClick={() => chooseView({ ...view })}>
              ↩ Tillbaka till vyn
            </button>
          )}
          <span className="spacer" />
          <span className="rowname">Bakom</span>
          <div className="seg small" role="group" aria-label="Bakom dockan">
            <button type="button" aria-pressed={backdrop === 'mork'} onClick={() => setBackdrop('mork')}>
              Mörkt
            </button>
            <button type="button" aria-pressed={backdrop === 'atelje'} disabled={!studio} title="Den grå ateljén som dockans film sparas i när en tagning förbereds" onClick={() => setBackdrop('atelje')}>
              Ateljén
            </button>
            <button type="button" aria-pressed={backdrop === 'rum'} disabled={!data.room} title="Rummet som rundan spelas i" onClick={() => setBackdrop('rum')}>
              Rummet
            </button>
          </div>
          <label className="check" title="Kortplatsernas konturer på filten">
            <input type="checkbox" checked={places} onChange={(event) => setPlaces(event.currentTarget.checked)} />
            Kortplatserna
          </label>
        </div>
      </section>

      <aside className="dollside" aria-label="Rörelsens värden, mått och tagning">
        <nav className="tabs" aria-label="Panelen">
          {TABS.map((one) => (
            <a key={one.key} href={routeTo(STEP, one.key, name, cardKey(card))} aria-current={tab === one.key ? 'page' : undefined}>
              {one.label}
              {one.key === 'varden' && changedCount > 0 ? <span className="tally">{changedCount}</span> : null}
            </a>
          ))}
        </nav>
        <div className="dollpanel">
          <MoveHead info={info} label={label} changed={changedCount} />
          {savedNote && savedNote.name === name && changedCount === 0 && <p className="done">{savedNote.text}</p>}
          {tab === 'varden' ? (
            <Values
              info={info}
              original={original as DollCycle | undefined}
              edited={edited}
              context={edited ? { cycle: edited, action: card.action, seat: card.seat, give: (giveJson as DollMove | undefined) ?? null } : null}
              fps={(giveJson as DollMove | undefined)?.fps ?? 30}
              least={Number(data.raw.tagning?.order?.least) || null}
              invalid={invalid}
              changed={changedCount}
              onChange={change}
              onResetAll={resetAll}
              moves={moves}
              onSaved={(saved, after) => {
                onMoves(after);
                files.current.delete(saved.name);
                resetAll();
                setSavedNote({ name: saved.name, text: `Sparad som ${saved.file}${saved.overwrote ? ', över den förra' : ''}: ${saved.changes.join('; ')}. Dockan gör nu den sparade rörelsen, och en tagning kan förberedas med den.` });
                go({ move: saved.name });
              }}
            />
          ) : tab === 'matt' ? (
            <Measures key={`${name}/${cardKey(card)}`} cycle={edited} invalid={invalid} card={card} />
          ) : (
            <Prepare info={info} card={card} dirty={changedCount > 0} dealers={data.dealers} onValues={() => go({ tab: 'varden' })} />
          )}
        </div>
      </aside>
    </div>
  );
}

const countChanges = (original: DollCycle, edited: DollCycle): number => {
  let count = 0;
  const walk = (a: unknown, b: unknown): void => {
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (key !== 'seconds') walk((a as any)[key], (b as any)[key]);
    } else if (a !== b) count++;
  };
  walk(original, edited);
  return count;
};

/** Rörelsen dockan gör: räknad i dollWorker.ts när cykeln, platsen eller handlingen har ändrats, den senaste som gäller. */
function useMove(data: Loaded, giveName: string | null, giveJson: unknown, cycle: DollCycle | null, invalid: string | null, card: Card) {
  const worker = useRef<Worker | null>(null);
  const sentGives = useRef(new Set<string>());
  const latest = useRef(0);
  const busy = useRef(false);
  const waiting = useRef<Asked | null>(null);
  const [move, setMove] = useState<DollMove | null>(null);
  const [computing, setComputing] = useState(false);
  const [moveProblem, setMoveProblem] = useState<string | null>(null);

  useEffect(() => {
    const made = new Worker(new URL('./dollWorker.ts', import.meta.url), { type: 'module' });
    made.postMessage({ kind: 'scene', scene: data.raw.scene, doll: data.raw.doll } satisfies Asked);
    made.onmessage = (event: MessageEvent<Answer>) => {
      const answer = event.data;
      busy.current = false;
      if (waiting.current) {
        const next = waiting.current;
        waiting.current = null;
        busy.current = true;
        made.postMessage(next);
      }
      if (answer.id !== latest.current) return;
      setComputing(false);
      if (answer.kind === 'move') {
        setMove(answer.move);
        setMoveProblem(null);
      } else {
        setMoveProblem(`Dockan kan inte göra det med de här värdena: ${answer.error}`);
      }
    };
    worker.current = made;
    return () => {
      made.terminate();
      worker.current = null;
      sentGives.current.clear();
    };
  }, [data.raw]);

  useEffect(() => {
    const made = worker.current;
    if (!made || !giveName || !giveJson || invalid) return;
    if (!sentGives.current.has(giveName)) {
      made.postMessage({ kind: 'give', name: giveName, give: giveJson } satisfies Asked);
      sentGives.current.add(giveName);
    }
    const asked: Asked = { kind: 'move', id: ++latest.current, give: giveName, cycle, seat: card.seat, index: card.index, action: card.action };
    setComputing(true);
    // Medan en rörelse räknas väntar bara den senaste frågan; de emellan behövs inte.
    if (busy.current) waiting.current = asked;
    else {
      busy.current = true;
      made.postMessage(asked);
    }
  }, [giveName, giveJson, cycle, invalid, card.seat, card.index, card.action]);

  return { move, computing, moveProblem };
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenen med dockan, och uppspelningen

type PlayerProps = {
  scene: SceneDescription;
  doll: DollDescription;
  move: DollMove | null;
  computing: boolean;
  problem: string | null;
  view: View;
  backdrop: { studio: Studio | null; background: Background | null };
  places: boolean;
  onMoved: () => void;
  title: string;
};

/** Tidpunkterna i rörelsen som märks på tidslinjen, i sekunder. */
function marksOf(move: DollMove): { at: number; label: string }[] {
  if (move.tracks.lookUp) return [];
  const frame = (at: number | undefined) => (at === undefined ? null : at / move.fps);
  const marks: [number | null, string][] = [
    [frame(move.back?.out?.[1]), 'når hålkortet'],
    [move.back?.out ? null : frame(move.moments.leavesShoe), 'lämnar skon'],
    [frame(move.back?.handoff?.[0]), 'handbytet'],
    [frame(move.moments.rests), 'kortet ligger'],
    [frame(move.back?.letsGo), 'släpper'],
    [frame(move.back?.home), 'åter i skon'],
  ];
  return marks.filter((mark): mark is [number, string] => mark[0] !== null).map(([at, label]) => ({ at, label }));
}

function Player({ scene, doll, move, computing, problem, view, backdrop, places, onMoved, title }: PlayerProps) {
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const seconds = move?.seconds ?? 0;
  const fps = move?.fps ?? 30;
  const frames = move ? move.frameCount : 0;
  const frame = Math.min(Math.max(0, frames - 1), Math.round(time * fps));

  // Rörelsen byts i scenen utan att den byggs om; tiden står kvar inom den nya rörelsens längd.
  useEffect(() => {
    if (!handle || !move) return;
    handle.setDollMove(move);
    setTime((t) => Math.min(t, move.seconds));
  }, [handle, move]);
  useEffect(() => {
    if (handle?.clip) void handle.clip.seek(time);
  }, [handle, time, move]);

  // Uppspelningen: tiden går i vald fart, och i en slinga börjar den om (en cykel slutar där den börjar).
  const state = useRef({ speed, loop, seconds });
  state.current = { speed, loop, seconds };
  useEffect(() => {
    if (!playing || !handle) return;
    let last = performance.now();
    let waiting = requestAnimationFrame(function tick(now) {
      const step = ((now - last) / 1000) * state.current.speed;
      last = now;
      setTime((t) => {
        const next = t + step;
        if (next < state.current.seconds) return next;
        if (state.current.loop) return state.current.seconds > 0 ? next % state.current.seconds : 0;
        setPlaying(false);
        return state.current.seconds;
      });
      waiting = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(waiting);
  }, [playing, handle]);

  const play = () => {
    if (!playing && time >= seconds - 1e-6) setTime(0);
    setPlaying(!playing);
  };
  const stepBy = (delta: number) => {
    setPlaying(false);
    setTime(Math.max(0, Math.min(seconds, (frame + delta) / fps)));
  };

  // Tangenterna: mellanslag spelar och pausar, pilarna stegar en ruta, Home går till början.
  const keys = useRef({ play, stepBy });
  keys.current = { play, stepBy };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
      if (event.key === ' ') {
        event.preventDefault();
        keys.current.play();
      } else if (event.key === 'ArrowLeft') keys.current.stepBy(-1);
      else if (event.key === 'ArrowRight') keys.current.stepBy(1);
      else if (event.key === 'Home') {
        setPlaying(false);
        setTime(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="dollview">
        {move ? (
          <Stage scene={scene} doll={doll} first={move} view={view} backdrop={backdrop} places={places} onMoved={onMoved} onHandle={setHandle} />
        ) : (
          <p className="notice">{problem ?? 'Dockan räknas …'}</p>
        )}
        <div className="dolltag">
          <b>{title}</b>
          <span>Dra för att vrida · hjulet zoomar · högerknappen flyttar</span>
        </div>
        {computing && <div className="dollbusy">Räknar om dockan …</div>}
        {move && problem && <p className="problem dollproblem">{problem}</p>}
      </div>
      <div className="transport">
        <button type="button" className="btn primary icon" onClick={play} disabled={!move} title="Spela eller pausa (mellanslag)" aria-label={playing ? 'Pausa' : 'Spela'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="btn icon" onClick={() => stepBy(-1)} disabled={!move} title="En ruta bakåt (vänsterpil)" aria-label="En ruta bakåt">
          ‹
        </button>
        <button type="button" className="btn icon" onClick={() => stepBy(1)} disabled={!move} title="En ruta framåt (högerpil)" aria-label="En ruta framåt">
          ›
        </button>
        <div className="timeline">
          <input
            type="range"
            min={0}
            max={seconds || 1}
            step={1 / fps}
            value={time}
            aria-label="Tiden i rörelsen"
            onChange={(event) => {
              setPlaying(false);
              setTime(Number(event.currentTarget.value));
            }}
          />
          <div className="marks" aria-hidden="true">
            {move &&
              marksOf(move).map((mark) => (
                <span key={mark.label} style={{ left: `${(mark.at / seconds) * 100}%` }}>
                  {mark.label}
                </span>
              ))}
          </div>
        </div>
        <span className="clock" aria-live="off">
          {comma(time)} / {comma(seconds)} s
          <small>
            ruta {frame + 1} av {frames}
          </small>
        </span>
        <div className="seg small" role="group" aria-label="Fart">
          {SPEEDS.map((value) => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)} title={value === 1 ? 'Verklig fart' : `${String(value).replace('.', ',')} gånger verklig fart`}>
              {value === 1 ? '1×' : value === 0.5 ? '½×' : '¼×'}
            </button>
          ))}
        </div>
        <label className="check" title="Börjar om när rörelsen är slut">
          <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.currentTarget.checked)} />
          Slinga
        </label>
      </div>
    </>
  );
}

type StageProps = {
  scene: SceneDescription;
  doll: DollDescription;
  /** Rörelsen scenen byggs med. Senare rörelser byts in med setDollMove. */
  first: DollMove;
  view: View;
  backdrop: { studio: Studio | null; background: Background | null };
  places: boolean;
  onMoved: () => void;
  onHandle: (handle: SceneHandle | null) => void;
};

/** 3D-ytan med dockan. Den byggs en gång och fyller sin plats; vyn, bakgrunden och kortplatserna ställs i den. */
const Stage = memo(function Stage({ scene, doll, first, view, backdrop, places, onMoved, onHandle }: StageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const moved = useRef(onMoved);
  moved.current = onMoved;
  const start = useRef(first);

  useEffect(() => {
    const element = holder.current!;
    const built = buildScene(element, scene, { urlOf: mediaUrl, dealer: { kind: 'docka', doll, move: start.current, pose: 'giv' }, doll, onProblem: setProblem, onMoved: () => moved.current() });
    const fit = () => built.resize(element.clientWidth, element.clientHeight);
    const watcher = new ResizeObserver(fit);
    watcher.observe(element);
    fit();
    setHandle(built);
    onHandle(built);
    return () => {
      watcher.disconnect();
      built.dispose();
      setHandle(null);
      onHandle(null);
    };
  }, [scene, doll, onHandle]);

  useEffect(() => {
    handle?.setView(view);
  }, [handle, view]);
  useEffect(() => {
    if (!handle) return;
    handle.setStudio(backdrop.studio);
    void handle.setBackground(backdrop.background);
  }, [handle, backdrop.studio, backdrop.background]);
  useEffect(() => {
    handle?.setPlaces(places);
  }, [handle, places]);

  return (
    <>
      <div ref={holder} className="dollstage" role="img" aria-label="Dockan i scenen" />
      {problem && <p className="problem dollproblem">{problem}</p>}
    </>
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// Panelen

function MoveHead({ info, label, changed }: { info: MoveInfo; label: string; changed: number }) {
  return (
    <header className="movehead">
      <div>
        <span className="label">{info.kind === 'cykel' ? 'Cykel' : 'Läst giv'}</span>
        <h2>{label}</h2>
        <code>content/moves/{info.name}.json</code>
      </div>
      <p className="hint">
        {info.locked ? (
          <>
            <span className="badge" title={info.locked}>
              skrivs inte över
            </span>{' '}
            <span title={info.locked}>{info.locked.split('; ')[0]}.</span>
            {info.kind === 'cykel' ? ' En ändring sparas som en ny rörelse.' : ''}
          </>
        ) : (
          <>
            <span className="badge pkg">gjord i Labbet</span> Ingen tagning är gjord med den: den går att spara om under samma namn.
          </>
        )}
        {changed > 0 && ` ${changed} ${changed === 1 ? 'värde ändrat' : 'värden ändrade'}, inte sparade.`}
      </p>
    </header>
  );
}

type ValuesProps = {
  info: MoveInfo;
  original: DollCycle | undefined;
  edited: DollCycle | null;
  context: FieldContext | null;
  fps: number;
  least: number | null;
  invalid: string | null;
  changed: number;
  onChange: (path: string[], value: unknown) => void;
  onResetAll: () => void;
  moves: MoveInfo[];
  onSaved: (saved: Saved, moves: MoveInfo[]) => void;
};

function Values({ info, original, edited, context, fps, least, invalid, changed, onChange, onResetAll, moves, onSaved }: ValuesProps) {
  if (info.kind !== 'cykel') {
    return (
      <div className="emptystate">
        <b>Den lästa given har inga reglage</b>
        Dess spår för hand, kort och kropp är lästa ur en film av en verklig dealer, ruta för ruta. Cyklerna bygger på den och
        bär takten, vägen tillbaka, blicken, bålen och andningen: välj en cykel för att ändra dem.
      </div>
    );
  }
  if (!original || !edited || !context) return <p className="notice">Läser rörelsen …</p>;
  const shown = fieldsFor(context);
  const film = least === null ? null : Math.max(least, Math.ceil(edited.seconds - 1e-9));
  return (
    <div className="values">
      <div className="valuesbar">
        <span>
          Cykeln <b>{comma(edited.seconds)} s</b>
          {film !== null && <> · filmen beställs som {film} s</>}
        </span>
        <button type="button" className="btn small quiet" disabled={changed === 0} onClick={onResetAll}>
          ↺ Återställ alla
        </button>
      </div>
      {invalid && <p className="problem">Värdena går inte ihop: {invalid.replace(/^Cykeln går inte att använda: /, '')}</p>}
      {GROUPS.map((group) => {
        const mine = shown.filter((entry) => entry.field.group === group.key);
        if (mine.length === 0) return null;
        const moved = mine.filter((entry) => isChanged(original, edited, entry.path)).length;
        return (
          <details key={group.key} className="valuegroup" open>
            <summary>
              <b>{group.label}</b>
              {moved > 0 && <span className="tally">{moved}</span>}
              <small>{group.what}</small>
            </summary>
            {mine.map((entry) => (
              <Control key={entry.field.id} entry={entry} context={context} fps={fps} original={getAt(original, entry.path)} onChange={onChange} />
            ))}
          </details>
        );
      })}
      <SaveBox info={info} edited={edited} changed={changed} invalid={invalid} moves={moves} onSaved={onSaved} />
      {changed > 0 && (
        <div className="savebar">
          <span>
            <b>{changed}</b> {changed === 1 ? 'värde ändrat' : 'värden ändrade'}, inte sparade
          </span>
          <button type="button" className="btn primary small" onClick={(event) => event.currentTarget.closest('.values')?.querySelector('.savebox')?.scrollIntoView({ behavior: 'smooth', block: 'end' })}>
            Spara ↓
          </button>
        </div>
      )}
    </div>
  );
}

function Control({ entry, context, fps, original, onChange }: { entry: Shown; context: FieldContext; fps: number; original: unknown; onChange: (path: string[], value: unknown) => void }) {
  const { field, path, value } = entry;
  // En kryssruta utan värde i filen är falsk.
  const changed = field.unit === 'ja/nej' ? Boolean(value) !== Boolean(original) : value !== original;
  const reset = (
    <button type="button" className="btn small quiet reset" disabled={!changed} title={changed ? `Tillbaka till ${said(field, original, fps)}` : 'Som i filen'} onClick={() => onChange(path, original)}>
      ↺
    </button>
  );
  if (field.unit === 'val') {
    const current = value ?? field.choices?.[0]?.value;
    return (
      <div className={changed ? 'control changed' : 'control'}>
        <span className="name">{field.label}</span>
        <div className="seg small" role="group" aria-label={field.label}>
          {field.choices?.map((choice) => (
            <button key={choice.value} type="button" aria-pressed={current === choice.value} onClick={() => onChange(path, choice.value)}>
              {choice.label}
            </button>
          ))}
        </div>
        {reset}
        <small className="what">{field.what}</small>
      </div>
    );
  }
  if (field.unit === 'ja/nej') {
    return (
      <div className={changed ? 'control changed' : 'control'}>
        <label className="check name">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(path, event.currentTarget.checked)} />
          {field.label}
        </label>
        <span />
        {reset}
        <small className="what">{field.what}</small>
      </div>
    );
  }
  const number = typeof value === 'number' ? value : 0;
  const [low, high] = rangeOf(field, context, number);
  return (
    <div className={changed ? 'control changed' : 'control'}>
      <label className="name" htmlFor={`f-${field.id}`}>
        {field.label}
      </label>
      <input id={`f-${field.id}`} type="range" min={low} max={high} step={stepOf(field, fps)} value={toShown(field.unit, number)} onChange={(event) => onChange(path, fromShown(field.unit, Number(event.currentTarget.value), fps))} />
      <output htmlFor={`f-${field.id}`}>{said(field, number, fps)}</output>
      {reset}
      <small className="what">
        {field.what}
        {changed && <em> Var {said(field, original, fps)}.</em>}
      </small>
    </div>
  );
}

/** Namnet som föreslås: rörelsens eget när den är gjord i Labbet, annars dess namn med -labb-<n>, det första lediga. */
function suggested(info: MoveInfo, moves: MoveInfo[]): string {
  if (info.madeInLab && !info.locked) return info.name;
  const base = info.name.replace(/-labb-\d+$/, '');
  for (let n = 1; ; n++) {
    const name = `${base}-labb-${n}`;
    if (!moves.some((move) => move.name === name)) return name;
  }
}

function SaveBox({ info, edited, changed, invalid, moves, onSaved }: { info: MoveInfo; edited: DollCycle; changed: number; invalid: string | null; moves: MoveInfo[]; onSaved: (saved: Saved, moves: MoveInfo[]) => void }) {
  const [name, setName] = useState(() => suggested(info, moves));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setName(suggested(info, moves)), [info.name]);
  const taken = moves.find((move) => move.name === name);
  const why = !NAME.test(name)
    ? 'Namnet: små bokstäver a–z, siffror och bindestreck.'
    : taken?.locked
      ? `${name} finns redan och skrivs inte över.`
      : taken
        ? `${name} är gjord i Labbet och skrivs över.`
        : `Sparas som content/moves/${name}.json.`;
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { saved, moves: after } = await saveMove(name, info.name, edited, note);
      setNote('');
      onSaved(saved, after);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="savebox">
      <h3 className="label">Spara som ny rörelse</h3>
      {problem && <p className="problem">{problem}</p>}
      <label className="savefield">
        <span>Namn</span>
        <input className="field" value={name} spellCheck={false} onChange={(event) => setName(event.currentTarget.value.toLowerCase())} />
      </label>
      <p className="hint">{why}</p>
      <label className="savefield">
        <span>Varför, om du vill</span>
        <textarea className="field" rows={2} value={note} placeholder="Vad ändringen ska göra, med dina ord. Det står i rörelsens fil." onChange={(event) => setNote(event.currentTarget.value)} />
      </label>
      <button type="button" className="btn primary" disabled={busy || changed === 0 || invalid !== null || !NAME.test(name) || Boolean(taken?.locked)} onClick={save}>
        {busy ? 'Sparar …' : `Spara ${changed} ${changed === 1 ? 'ändring' : 'ändringar'} som ${name}`}
      </button>
      <p className="hint">Prövas av servern med samma läsare som resten innan den skrivs. En rörelse som ett klipp eller ett paket är gjort med skrivs aldrig över.</p>
    </section>
  );
}

// Mått

function Measures({ cycle, invalid, card }: { cycle: DollCycle | null; invalid: string | null; card: Card }) {
  const [measured, setMeasured] = useState<{ at: string; of: string; result: Measured } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const now = cycle ? JSON.stringify(cycle) : '';
  const run = async () => {
    if (!cycle) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await measureMove(cycle, card);
      setMeasured({ at: new Date().toTimeString().slice(0, 5), of: now, result });
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!cycle) {
    return (
      <div className="emptystate">
        <b>Måtten gäller en cykel</b>
        Välj en cykel: den lästa given gör ingen väg tillbaka, och måtten räknas på cykelns rörelse.
      </div>
    );
  }
  const outside = measured?.result.checks.filter((one) => one.verdict !== 'inom') ?? [];
  const others = measured ? Object.entries(measured.result.values).filter(([key, value]) => value.value !== null && !measured.result.checks.some((one) => one.key === key)) : [];
  return (
    <div className="measurepanel">
      <p className="hint">
        Samma mått som prövas på dockan när en tagning förbereds, innan något beställs: hur länge hon står stilla, tvära stopp, knyck, och om huvudet går före handen. Kling kopierar dockans dynamik nästan exakt, så det som ska bli mjukt i filmen görs mjukt här. Ett mått utanför sin gräns underkänner inget.
      </p>
      <button type="button" className="btn primary" disabled={busy || invalid !== null} onClick={run}>
        {busy ? 'Mäter …' : `Mät ${cardWords(card.seat, card.index, card.action)} med de här värdena`}
      </button>
      {problem && <p className="problem">{problem}</p>}
      {measured && (
        <>
          <p className={measured.of === now ? 'hint' : 'warning'}>
            Mätt {measured.at}
            {measured.of === now ? ', med värdena som de står nu.' : '. Värdena har ändrats sedan dess: mät igen.'} {outside.length === 0 ? 'Alla mått inom sina gränser.' : `${outside.length} utanför eller att se efter.`}
          </p>
          <ul className="measures">
            {measured.result.checks.map((one) => (
              <CheckRow key={one.key} check={one} />
            ))}
          </ul>
          {others.length > 0 && (
            <details className="more">
              <summary>Övriga mått, utan gräns ({others.length})</summary>
              <ul className="measures">
                {others.map(([key, value]) => (
                  <li key={key}>
                    <b>{value.what}</b>
                    <span>{String(value.value).replace('.', ',')}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Måttets namn kort, och resten som förklaring: "dockans handled när kortet läggs" och "största vinkel …". */
function checkWords(what: string): { name: string; more: string } {
  const [name = what, ...rest] = what.replace(/^rörelse: /, '').split(': ');
  return { name: name.charAt(0).toUpperCase() + name.slice(1), more: rest.join(': ') };
}
const MARKS: Record<string, string> = { inom: '✓', 'se efter': '!', utanför: '✕', saknas: '–' };

function CheckRow({ check }: { check: Check }) {
  const value = typeof check.value === 'number' ? String(check.value).replace('.', ',') : String(check.value ?? '–');
  return (
    <li>
      <b>
        <span className={`mark ${check.verdict === 'inom' ? 'ok' : check.verdict === 'se efter' ? 'see' : 'off'}`}>{MARKS[check.verdict] ?? '?'}</span> {checkWords(check.what).name}
      </b>
      <span>
        {value}
        {check.unit ? ` ${check.unit}` : ''}
        {check.verdict !== 'inom' && <em className={check.verdict === 'se efter' ? 'see' : undefined}> · {check.verdict}</em>}
      </span>
      <small>
        {checkWords(check.what).more ? `${checkWords(check.what).more}. ` : ''}Gräns {check.limit}.
      </small>
    </li>
  );
}

// Tagning

function Prepare({ info, card, dirty, dealers, onValues }: { info: MoveInfo; card: Card; dirty: boolean; dealers: DealerState[]; onValues: () => void }) {
  const [dealer, setDealer] = useState(dealers[0]?.id ?? '');
  const views = dealers.find((one) => one.id === dealer)?.views.filter((view) => view.anchor) ?? [];
  const [view, setView] = useState('spelaren');
  const anchorFile = views.find((one) => one.view === view)?.anchor?.file ?? null;
  const [job, setJob] = useState<Job | null>(null);
  const [takes, setTakes] = useState<Takes | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetchJob().then(setJob, (error: Error) => setProblem(error.message));
    fetchTakes().then(setTakes, () => setTakes(null));
  }, []);
  // Medan en tagning förbereds frågas servern varje sekund hur långt den har kommit.
  useEffect(() => {
    if (job?.state !== 'förbereds') return;
    const timer = window.setInterval(() => {
      fetchJob().then(
        (fresh) => {
          setJob(fresh);
          if (fresh?.state !== 'förbereds') fetchTakes().then(setTakes, () => {});
        },
        () => {},
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [job?.state]);

  const spec = { dealer, view, seat: card.seat, index: card.index, action: card.action, cycle: info.name };
  const command = `node src/pipeline/tagning.ts forbered ${dealer || '<dealer>'} ${view} ${card.seat} ${card.index} ${card.action} --cykel ${info.name}`;
  const blocked = info.kind !== 'cykel' ? 'En tagning görs med en cykel: välj en cykel.' : dirty ? 'Värdena är ändrade men inte sparade. En tagning görs med en rörelse som står i content/moves/: spara först.' : !dealer ? 'Ingen dealer har en fil i content/dealers/.' : !views.some((one) => one.view === view) ? `${dealer} har inget REDO-ankare ur ${viewLabel(view)}.` : null;
  const start = async () => {
    setProblem(null);
    try {
      setJob(await prepareTake(spec));
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  const waiting = takes?.waiting ?? [];

  return (
    <div className="preparepanel">
      <p className="hint">
        Gör paketet för en tagning av det dockan visar, så som <code>tagning.ts forbered</code> gör det: dockans film ur vyns närbild i grå ateljé, första och sista bilden ur vyns REDO-ankare, texten och <code>bestallning.json</code>, i <code>output/tagningar/</code>. Inga krediter: ingenting beställs härifrån.
      </p>
      <div className="preparefields">
        <label className="savefield">
          <span>Dealer</span>
          <select className="select" value={dealer} onChange={(event) => setDealer(event.currentTarget.value)}>
            {dealers.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </label>
        <label className="savefield">
          <span>Vy, med sitt REDO-ankare</span>
          <select className="select" value={view} onChange={(event) => setView(event.currentTarget.value)}>
            {views.map((one) => (
              <option key={one.view} value={one.view}>
                {viewLabel(one.view)}: {anchorName(one.anchor!.file)}, {one.anchor!.file.split('/').at(-1)} ({one.anchor!.status})
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        <b>{cardWords(card.seat, card.index, card.action)}</b> med <b>{info.name}</b>{anchorFile ? `: börjar på ${framesOf(anchorFile, card.seat, card.index, card.action).first} och slutar på ${framesOf(anchorFile, card.seat, card.index, card.action).last}` : ''}
      </p>
      <details className="more">
        <summary>Samma sak i terminalen, för agenten</summary>
        <pre className="command">{command}</pre>
      </details>
      {blocked ? (
        <p className="warning">
          {blocked}{' '}
          {dirty && (
            <button type="button" className="btn small" onClick={onValues}>
              Till värdena
            </button>
          )}
        </p>
      ) : (
        <button type="button" className="btn primary" disabled={job?.state === 'förbereds'} onClick={start}>
          {job?.state === 'förbereds' ? 'Förbereds …' : 'Förbered tagningen'}
        </button>
      )}
      {problem && <p className="problem">{problem}</p>}
      {job && <JobView job={job} />}

      <h3 className="label">
        Paket som väntar på beställning <span>{waiting.length}</span>
      </h3>
      {waiting.length === 0 ? (
        <p className="hint">Inga. Ett paket som förbereds här hamnar i listan tills agenten har beställt filmen och tagit emot den.</p>
      ) : (
        <ul className="waitlist">
          {waiting.map((one) => (
            <li key={one.id}>
              <b title={one.id}>
                {cardName(one.seat, one.index, one.action)} t{one.take ?? '?'}
              </b>
              <small>
                {cardWords(one.seat, one.index, one.action)} · {one.move ?? 'okänd cykel'} · referens: {one.sent === 'docka' ? 'dockans film' : one.sent === 'klipp' ? 'ett klipp' : 'ingen film'} · gjort {one.made ?? '?'}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobView({ job }: { job: Job }) {
  const order = job.result?.order;
  // Bilderna paketet börjar och slutar på, med ankarnas koder (names.ts).
  const frames = framesOf(typeof order?.anchor === 'string' ? order.anchor : null, job.spec.seat, job.spec.index, job.spec.action ?? 'deal');
  const state = job.state === 'förbereds' ? 'förbereds' : job.state === 'förberedd' ? 'förberedd, väntar på beställning' : 'gick inte';
  return (
    <section className="job panel">
      <header>
        <span className={job.state === 'förberedd' ? 'badge pkg' : job.state === 'gick inte' ? 'badge no' : 'badge wait'}>{state}</span>
        <small>
          börjad {job.started}
          {job.ended ? `, klar ${job.ended}` : ''}
        </small>
      </header>
      {job.error && <p className="problem">{job.error}</p>}
      {job.result && order && (
        <>
          <p>
            Paketet <code>{job.result.dir}/</code>: {String(order.model ?? '')}, {String(order.resolution ?? '')}, {String(order.duration ?? '')} s. Agenten laddar upp filerna och beställer filmen genom Runways MCP-server: säg till i chatten.
          </p>
          <div className="frames">
            <figure>
              <img src={takeUrl(job.result.id, 'forsta.png')} alt="Första bilden" />
              <figcaption>första bilden · {frames.first}</figcaption>
            </figure>
            <figure>
              <img src={takeUrl(job.result.id, 'sista.png')} alt="Sista bilden" />
              <figcaption>sista bilden · {frames.last}</figcaption>
            </figure>
            <figure>
              <video src={takeUrl(job.result.id, 'referens.mp4')} muted loop autoPlay playsInline />
              <figcaption>dockans film</figcaption>
            </figure>
          </div>
          {job.result.checks.length > 0 && (
            <ul className="measures">
              {job.result.checks.map((one) => (
                <CheckRow key={one.key} check={one} />
              ))}
            </ul>
          )}
          {typeof order.prompt === 'string' && (
            <details className="more">
              <summary>Texten till filmmodellen</summary>
              <p className="prompt">{order.prompt}</p>
            </details>
          )}
        </>
      )}
      <details className="more" open={job.state !== 'förberedd'}>
        <summary>Vad tagning.ts skrev ({job.lines.length} rader)</summary>
        <pre className="log">{job.lines.slice(-40).map(shownText).join('\n') || '…'}</pre>
      </details>
    </section>
  );
}

