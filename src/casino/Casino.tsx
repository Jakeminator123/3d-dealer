// Casinot: en riktig runda mot spelkärnan i vyn Spelaren. Jakob väljer plats och insats och delar; sedan erbjuds de
// handlingar spelkärnan tillåter. Kärnan avgör kort och pengar: i studions server, eller i webbläsaren när Casinot är
// byggt statiskt (src/statisk). Casinot når den genom samma gränssnitt i båda fallen (link.ts); här spelas bara det den
// har sagt. Varje steg blir dealerns film genom samma val av klipp som Labbet och runda.ts (src/scene/round.ts): ett
// godkänt cykelklipp för varje kort, eller spelkärnans fallback när klippet saknas, där kortet går självt medan dealern
// står i REDO. Filmen avgör ingenting: utfallet visas när filmen har lagt korten, men det är kärnans.
//
// Medan spelet väntar (före första given, när spelaren ska bestämma sig, och när rundan är avgjord) väntar dealern:
// följden slutar i vänta-klippet (waitClip i round.ts, reel.ts), som spelas om och om. När nästa kort kommer går det
// pågående varvet klart innan kortets klipp börjar, högst content/runda.json wait.most sekunder. Utan vänta-klipp står
// filmens sista ruta kvar. Kortens klipp spelas i rundans fart (speed.clips), vänta-klippet i 1.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '../engine/round.ts';
import type { SeatSignalEvent } from '../engine/seats.ts';
import { buildScene, type Background, type FilmNote, type SceneHandle } from '../scene/build.ts';
import type { SceneDescription } from '../scene/description.ts';
import type { DollDescription } from '../scene/dollPose.ts';
import { nextStart, reelEnd } from '../scene/reel.ts';
import { anchorName, anchorOf, dealName, dealsOf, planRound, readyClip, speedOf, waitClip, type Plan } from '../scene/round.ts';
import { commandFor, DEALER, loadContent, VIEW, type Content, type Files, type GameLink, type Table } from './link.ts';

const ACTION_LABELS: Record<Action, string> = { hit: 'Hit', stand: 'Stand', double: 'Dubbla', split: 'Dela upp' };
const OUTCOME_LABELS = { blackjack: 'Blackjack', win: 'Vinst', push: 'Lika', lose: 'Förlust' } as const;

const comma = (value: number): string => String(value).replace('.', ',');

const planOf = (content: Content, table: Table): Plan => planRound(dealsOf(table.steps), content.entries, DEALER, VIEW, content.round.fallback);

/**
 * Casinot med spelsessionen `game` och filerna `files`. `lab` är adressen till Labbet; utan den (det statiska bygget,
 * där Labbet inte följer med) står länken avstängd.
 */
export function Casino({ game, files, lab }: { game: GameLink; files: Files; lab?: string }) {
  const [content, setContent] = useState<Content | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    loadContent(files).then(setContent, (error: Error) => setProblem(error.message));
    game.table().then(setTable, (error: Error) => setProblem(error.message));
  }, [game, files]);
  return (
    <div className="casino">
      <header className="casinotop">
        <div className="brand">
          3d-dealer <span>Casinot</span>
        </div>
        {table && (
          <div className="purse" aria-label="Kassa">
            Kassa <strong>{comma(table.state.balance)}</strong>
          </div>
        )}
        {lab ? (
          <a className="elsewhere" href={lab}>
            Labbet
          </a>
        ) : (
          <span className="elsewhere" aria-disabled="true" title="Labbet finns bara i studion">
            Labbet
          </span>
        )}
      </header>
      {content && table ? (
        <Room game={game} files={files} content={content} table={table} onTable={setTable} problem={problem} onProblem={setProblem} />
      ) : (
        <main className="notice">{problem ?? 'Läser bordet …'}</main>
      )}
    </div>
  );
}

type RoomProps = { game: GameLink; files: Files; content: Content; table: Table; onTable: (table: Table) => void; problem: string | null; onProblem: (text: string | null) => void };

function Room({ game, files, content, table, onTable, problem, onProblem }: RoomProps) {
  const plan = useMemo(() => planOf(content, table), [content, table]);
  // Filmen är hela rundan hittills. Efter ett steg spelas den från första nya delen; vid en omladdning står den i slutet.
  const [from, setFrom] = useState<number | 'end'>('end');
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstSeat = table.state.view.round?.hands[0]?.seat;
  const [seat, setSeat] = useState(firstSeat ?? 4);
  const [stake, setStake] = useState(10);
  const skip = useRef<() => void>(() => {});

  // Utan runda står dealern i REDO: första rutan av ett godkänt cykelklipp.
  const ready = useMemo(() => readyClip(content.entries, DEALER, VIEW), [content.entries]);
  const idle = plan.clips.length === 0;
  // Vänta-klippet ur ankaret följdens klipp är gjorda ur, och utan runda ur REDO-klippets ankare. Null när det saknas.
  const readyEntry = content.entries.find((entry) => entry.file === ready);
  const wait = waitClip(content.entries, DEALER, VIEW, idle ? (readyEntry ? anchorOf(readyEntry) : null) : plan.anchor);
  // Utan runda och med vänta-klippet väntar dealern från början: en följd av vänta-klippet, som slutar i väntan. Rundans
  // klipp spelas i rundans fart (content/runda.json speed.clips, som i Labbet och runda.ts); vänta-klippet i 1.
  const dealer: FilmNote | null = !idle
    ? { kind: 'film', view: VIEW, clips: plan.clips, loop: false, ...(wait ? { wait } : {}), ...speedOf(content.round) }
    : wait
      ? { kind: 'film', view: VIEW, clips: [{ file: wait }], loop: false, wait }
      : ready
        ? { kind: 'film', view: VIEW, clips: [{ file: ready }], loop: false }
        : null;

  const send = async (command: Record<string, unknown>): Promise<void> => {
    if (busy || playing) return;
    setBusy(true);
    onProblem(null);
    try {
      const next = await game.command(commandFor(table, command));
      const before = plan.clips.length;
      const after = planOf(content, next).clips.length;
      if (after > before) {
        setFrom(before);
        setPlaying(true);
      } else setFrom('end');
      onTable(next);
    } catch (error) {
      onProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fresh = async (): Promise<void> => {
    onProblem(null);
    try {
      setFrom('end');
      onTable(await game.reset());
    } catch (error) {
      onProblem((error as Error).message);
    }
  };

  const { view, limits, balance } = table.state;
  const round = view.round;
  const events = table.steps.flatMap((step) => step.events);
  const settle = events.find((event): event is Extract<SeatSignalEvent, { type: 'settle' }> => event.type === 'settle');
  const still = busy || playing;

  return (
    <main className="room">
      <div className="tableview">
        <Stage
          scene={content.scene}
          doll={content.doll}
          background={content.background}
          urlOf={files.url}
          dealer={dealer}
          start={idle ? (wait ? 'end' : 0) : from}
          play={!idle && from !== 'end' && playing}
          most={content.round.wait.most}
          fps={content.round.film.fps}
          onDone={() => setPlaying(false)}
          skip={skip}
          onProblem={onProblem}
        />
      </div>

      <section className="panel" aria-label="Spelet">
        {problem && <p className="warning">{problem}</p>}

        {playing ? (
          <div className="row">
            <span className="say">Dealern delar …</span>
            <button type="button" onClick={() => skip.current()}>
              Hoppa fram
            </button>
          </div>
        ) : (
          <>
            {round && <Hands view={view} settle={settle ?? null} />}

            {!round && (
              <div className="row">
                <span className="label">Plats</span>
                <div className="seats" role="group" aria-label="Plats">
                  {content.scene.places.seats.map((entry) => (
                    <button key={entry.seat} type="button" aria-pressed={seat === entry.seat} onClick={() => setSeat(entry.seat)}>
                      {entry.seat}
                    </button>
                  ))}
                </div>
                <label className="stake">
                  <span className="label">Insats</span>
                  <input
                    type="number"
                    min={limits.min}
                    max={Math.min(limits.max, balance)}
                    step={limits.min}
                    value={stake}
                    onChange={(event) => setStake(Number(event.currentTarget.value))}
                  />
                </label>
                <button type="button" className="go" disabled={still || !(stake >= limits.min && stake <= Math.min(limits.max, balance))} onClick={() => send({ op: 'start', bets: [{ seat, main: stake }] })}>
                  Dela
                </button>
                {balance < limits.min && (
                  <button type="button" onClick={fresh}>
                    Ny kassa
                  </button>
                )}
              </div>
            )}

            {round?.phase === 'insurance' && (
              <div className="row">
                <span className="say">Dealern visar ett ess. Försäkring?</span>
                <button type="button" disabled={still} onClick={() => send({ op: 'insurance', roundId: view.roundId, take: true })}>
                  Försäkra ({comma(round.hands.reduce((sum, hand) => sum + hand.stake / 2, 0))})
                </button>
                <button type="button" disabled={still} onClick={() => send({ op: 'insurance', roundId: view.roundId, take: false })}>
                  Nej tack
                </button>
              </div>
            )}

            {round?.phase === 'decisions' && (
              <div className="row">
                <span className="say">
                  Plats {round.activeSeat}
                  {round.hands.filter((hand) => hand.seat === round.activeSeat).length > 1 ? `, hand ${(round.hands[round.active]?.hand ?? 0) + 1}` : ''}: {round.hands[round.active]?.total}
                </span>
                {round.legalActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="go"
                    disabled={still}
                    onClick={() => send({ op: 'act', action, seat: round.activeSeat, handIndex: round.active, roundId: view.roundId, turnSeq: view.turnSeq })}
                  >
                    {ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            )}

            {round?.phase === 'settled' && (
              <div className="row">
                <button type="button" className="go" disabled={still} onClick={() => send({ op: 'collect', roundId: view.roundId })}>
                  Ny runda
                </button>
              </div>
            )}
          </>
        )}

        {plan.missing.length > 0 && (
          <p className="missing">
            Utan klipp, kortet går självt medan dealern står i REDO: {plan.missing.map(dealName).join('; ')}.
          </p>
        )}
        {plan.anchor !== null && (
          <p className="missing">
            Klippen är gjorda ur REDO-ankaret {anchorName(plan.anchor)}
            {plan.anchors.length > 1 ? ` (inte valda: ${plan.anchors.slice(1).map((one) => anchorName(one.anchor)).join(', ')})` : ''}.
          </p>
        )}
        {dealer && !wait && <p className="missing">Inget vänta-klipp ur ankaret: medan spelet väntar står filmens sista ruta kvar.</p>}
        <p className="fine">
          Spelkärnan {game.where} avgör kort och pengar ({view.shoe?.source === 'secure' ? 'säker sko' : `sko: ${view.shoe?.source}`}, insats {limits.min}–{limits.max}). Filmen visar bara det
          kärnan har sagt. {game.lasts}
        </p>
      </section>
    </main>
  );
}

/** Händerna och dealern så som kärnan säger att de står, och utfallet när rundan är avgjord. */
function Hands({ view, settle }: { view: Table['state']['view']; settle: Extract<SeatSignalEvent, { type: 'settle' }> | null }) {
  const round = view.round!;
  const face = (card: { r: string; s: string }) => `${card.r}${card.s}`;
  const hidden = round.holeDraw !== null && !round.dealer.some((card) => card.shoeDraw === round.holeDraw);
  return (
    <div className="hands">
      <div className="hand dealer">
        <span className="label">Dealern</span>
        <span className="cards">
          {round.dealer.map(face).join(' ')}
          {hidden ? ' + baksidan' : ''}
        </span>
        <span className="total">{round.dealerTotal}</span>
      </div>
      {round.hands.map((hand) => {
        const result = settle?.hands.find((one) => one.handIndex === hand.handIndex);
        return (
          <div key={hand.handIndex} className="hand" data-outcome={result?.outcome}>
            <span className="label">
              Plats {hand.seat}
              {round.hands.filter((other) => other.seat === hand.seat).length > 1 ? `, hand ${hand.hand + 1}` : ''}
            </span>
            <span className="cards">{hand.cards.map(face).join(' ')}</span>
            <span className="total">
              {hand.total}
              {hand.soft && hand.total < 21 ? ' mjuk' : ''}
              {hand.busted ? ', tjock' : ''}
            </span>
            <span className="stakeinfo">insats {comma(hand.stake)}</span>
            {result && (
              <span className="outcome">
                {OUTCOME_LABELS[result.outcome]}
                {result.returned > 0 ? `: ${comma(result.returned)} tillbaka` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

type StageProps = {
  scene: SceneDescription;
  doll: DollDescription;
  background: Background | null;
  /** Adressen till en fil ur registret (Files.url). */
  urlOf: (file: string) => string;
  /** Dealerns film: hela rundan hittills, eller dealern i REDO. */
  dealer: FilmNote | null;
  /** Delen filmen börjar på, eller dess slut. */
  start: number | 'end';
  /**
   * Om filmen spelas därifrån när den är byggd, eller står still (en följd som väntar väntar då). Läses när en ny film
   * byggs, och bygger inte om den.
   */
  play: boolean;
  /** Hur länge en ny film högst väntar på att dealerns varv av väntan ska gå klart, i sekunder (content/runda.json). */
  most: number;
  /** Filmernas rutor per sekund (content/runda.json): en halv ruta från varvets slut räknas som slutet. */
  fps: number;
  /** Sägs till när filmen har lagt sitt sista kort. */
  onDone: () => void;
  /** Får det som hoppar fram till filmens slut. */
  skip: { current: () => void };
  onProblem: (text: string) => void;
};

// Hur länge, i millisekunder, en ny film väntar efter att varvet borde ha gått klart, om filmen som syns har stannat.
const TURN_PATIENCE = 500;

/**
 * Uppfylls när dealern i scenen `handle` har gått klart med sitt pågående varv av väntan (reel.ts, nextStart, högst
 * `most` sekunder), inom `near` sekunder från varvets slut. Direkt när hennes film inte går eller inte väntar, och när
 * `still` slutar vara sant.
 */
function turnOver(handle: SceneHandle | null, most: number, near: number, still: () => boolean): Promise<void> {
  const clip = handle?.clip;
  const reel = handle?.reel();
  if (!clip || !reel || reel.wait === undefined || !clip.playing()) return Promise.resolve();
  const from = clip.time();
  const at = nextStart(reel, from, most);
  if (at - from <= near) return Promise.resolve();
  const until = performance.now() + (at - from) * 1000 + TURN_PATIENCE;
  return new Promise((done) => {
    const look = (): void => {
      const now = clip.time();
      if (!still() || now >= at - near || now < from || performance.now() > until) return done();
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

/**
 * Scenen. En ny dealerfilm byggs i en egen scen bredvid den som syns, och tar dess plats först när bord, rum och
 * klipp är lästa och filmen står där den ska börja, så att bordet inte blinkar mellan stegen. Väntar dealern i den som
 * syns tar den nya över där hennes pågående varv slutar, i REDO, där den nya filmen börjar.
 */
function Stage({ scene, doll, background, urlOf, dealer, start, play, most, fps, onDone, skip, onProblem }: StageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const shown = useRef<{ handle: SceneHandle; layer: HTMLDivElement } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const playing = useRef(play);
  playing.current = play;
  const dealerKey = JSON.stringify(dealer);

  useEffect(() => {
    const host = holder.current!;
    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.style.visibility = 'hidden';
    host.append(layer);
    let alive = true;
    let watching = 0;
    const handle = buildScene(layer, scene, { urlOf, dealer: JSON.parse(dealerKey) as FilmNote | null, doll, onProblem });
    const fit = () => handle.resize(host.clientWidth, host.clientHeight);
    const watcher = new ResizeObserver(fit);
    watcher.observe(host);
    fit();
    handle.setView(VIEW);
    handle.setShoe(true);
    // Hoppa fram innan den nya filmen syns: den tar över direkt och hoppar till sitt slut.
    let hurry = false;
    skip.current = () => void (hurry = true);

    void Promise.all([handle.ready, handle.setBackground(background)]).then(async () => {
      if (!alive) return;
      const clip = handle.clip;
      const reel = handle.reel();
      const at = !reel ? 0 : start === 'end' ? reel.seconds : (reel.starts[start] ?? reel.seconds);
      if (clip) await clip.seek(at);
      if (!alive) return;
      await turnOver(shown.current?.handle ?? null, most, 0.5 / fps, () => alive && !hurry);
      if (!alive) return;
      layer.style.visibility = 'visible';
      const before = shown.current;
      shown.current = { handle, layer };
      before?.handle.dispose();
      before?.layer.remove();
      if (!clip || !reel) return void done.current();
      // En följd som väntar går in i väntan när den har spelat klart, eller hoppats fram; annars står sista rutan kvar.
      const rest = () => {
        if (reel.wait !== undefined) clip.play();
      };
      if (!playing.current) {
        rest();
        return void done.current();
      }
      const finish = () => {
        cancelAnimationFrame(watching);
        if (alive) done.current();
      };
      skip.current = () =>
        void clip.seek(reel.seconds).then(() => {
          if (!alive) return;
          rest();
          finish();
        });
      if (hurry) return skip.current();
      clip.play();
      const watch = () => {
        if (!alive) return;
        if (clip.time() >= reelEnd(reel) - 1e-3) return finish();
        watching = requestAnimationFrame(watch);
      };
      watching = requestAnimationFrame(watch);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(watching);
      watcher.disconnect();
      // Den som syns står kvar tills nästa är framme; en som aldrig kom fram städas bort direkt.
      if (shown.current?.handle !== handle) {
        handle.dispose();
        layer.remove();
      }
    };
  }, [scene, doll, background, urlOf, dealerKey, start, most, fps, onProblem, skip]);

  useEffect(
    () => () => {
      shown.current?.handle.dispose();
      shown.current?.layer.remove();
      shown.current = null;
    },
    [],
  );

  const { width, height } = scene.camera.frame;
  return <div ref={holder} className="stage" role="img" aria-label="Bordet i 3D" style={{ aspectRatio: `${width} / ${height}`, width: `min(100cqw, 100cqh * ${width} / ${height})` }} />;
}
