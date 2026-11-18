// Casinot: en riktig runda mot spelkärnan i vyn Spelaren. Jakob väljer plats och insats och delar; sedan erbjuds de
// handlingar spelkärnan tillåter. Kärnan avgör kort och pengar, i studions server eller i visningens webbläsare
// (link.ts: GameLink); här spelas bara det den har sagt. Varje steg blir dealerns film genom samma val av klipp som
// Labbet och runda.ts (src/scene/round.ts): ett godkänt cykelklipp för varje kort, eller spelkärnans fallback när
// klippet saknas, där kortet går självt medan dealern står i REDO. Filmen avgör ingenting: utfallet visas när filmen har
// lagt korten, men det är kärnans.
//
// Medan spelet väntar (före första given, när spelaren ska bestämma sig, och när rundan är avgjord) väntar dealern:
// följden slutar i vänta-klippet (waitClip i round.ts, reel.ts), som spelas om och om. När nästa kort kommer går det
// pågående varvet klart innan kortets klipp börjar, högst content/runda.json wait.most sekunder. Utan vänta-klipp står
// filmens sista ruta kvar. Kortens klipp spelas i rundans fart (speed.clips, eller den fart sidan väljer), vänta-klippet
// i 1. Filmen läggs genom ögat och skon klippen är gjorda med (registrets eye och shoe), som i Labbets hela giv.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Action } from '../engine/round.ts';
import type { SeatSignalEvent } from '../engine/seats.ts';
import type { FilmNote, SeatView } from '../scene/build.ts';
import { anchorName, anchorOf, dealName, dealsOf, madeWith, planRound, readyClip, waitClip, type Plan } from '../scene/round.ts';
import { commandFor, DEALER, VIEW, type Content, type Files, type GameLink, type Table } from './link.ts';
import { frameStyle, Stage } from './Stage.tsx';

const ACTION_LABELS: Record<Action, string> = { hit: 'Hit', stand: 'Stand', double: 'Dubbla', split: 'Dela upp' };
const OUTCOME_LABELS = { blackjack: 'Blackjack', win: 'Vinst', push: 'Lika', lose: 'Förlust' } as const;

const comma = (value: number): string => String(value).replace('.', ',');

const planOf = (content: Content, table: Table): Plan => planRound(dealsOf(table.steps), content.entries, DEALER, VIEW, content.round.fallback);

type CasinoProps = {
  game: GameLink;
  files: Files;
  content: Content;
  /** Vyn scenen ses i: Spelaren, med närbild eller utan. Utan den Spelaren. */
  view?: SeatView;
  /** Farten dealerns klipp spelas i. Utan den rundans (content/runda.json speed.clips). */
  speed?: number;
  /** Reglage som sidan lägger överst i panelen. */
  controls?: ReactNode;
};

/** Bordet: scenen och panelen med spelet. Bordet läses ur spelsessionen när det visas. */
export function Casino({ game, files, content, view = VIEW, speed, controls }: CasinoProps) {
  const [table, setTable] = useState<Table | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    game.table().then(setTable, (error: Error) => setProblem(error.message));
  }, [game]);
  if (!table) return <main className="notice">{problem ?? 'Läser bordet …'}</main>;
  return <Room game={game} files={files} content={content} table={table} onTable={setTable} problem={problem} onProblem={setProblem} view={view} speed={speed ?? content.round.speed.clips} controls={controls} />;
}

type RoomProps = {
  game: GameLink;
  files: Files;
  content: Content;
  table: Table;
  onTable: (table: Table) => void;
  problem: string | null;
  onProblem: (text: string | null) => void;
  view: SeatView;
  speed: number;
  controls?: ReactNode;
};

function Room({ game, files, content, table, onTable, problem, onProblem, view, speed, controls }: RoomProps) {
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
  // Ögat och skon klippen är gjorda med: rundans klipps, och utan runda REDO-klippets.
  const madeBy = idle ? (readyEntry ? madeWith(readyEntry) : null) : plan;
  const made = { ...(madeBy?.eye ? { eye: madeBy.eye } : {}), ...(madeBy?.shoe ? { shoe: madeBy.shoe } : {}) };
  // Utan runda och med vänta-klippet väntar dealern från början: en följd av vänta-klippet, som slutar i väntan. Rundans
  // klipp spelas i rundans fart; vänta-klippet i 1.
  const dealer: FilmNote | null = !idle
    ? { kind: 'film', view: VIEW, clips: plan.clips, loop: false, ...(wait ? { wait } : {}), ...(speed !== 1 ? { speed } : {}), ...made }
    : wait
      ? { kind: 'film', view: VIEW, clips: [{ file: wait }], loop: false, wait, ...made }
      : ready
        ? { kind: 'film', view: VIEW, clips: [{ file: ready }], loop: false, ...made }
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

  const { view: state, limits, balance } = table.state;
  const round = state.round;
  const events = table.steps.flatMap((step) => step.events);
  const settle = events.find((event): event is Extract<SeatSignalEvent, { type: 'settle' }> => event.type === 'settle');
  const still = busy || playing;
  const most = Math.min(limits.max, balance);

  return (
    <main className="room">
      <div className="tableview" style={frameStyle(content.scene)}>
        <Stage
          scene={content.scene}
          doll={content.doll}
          background={content.background}
          urlOf={files.url}
          dealer={dealer}
          view={view}
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
        {controls}
        {problem && <p className="warning">{problem}</p>}

        <div className="row purse" aria-label="Kassa">
          <span className="label">Kassa</span> <strong>{comma(balance)}</strong>
        </div>

        {playing ? (
          <div className="row">
            <span className="say">Dealern delar …</span>
            <button type="button" onClick={() => skip.current()}>
              Hoppa fram
            </button>
          </div>
        ) : (
          <>
            {round && <Hands view={state} settle={settle ?? null} />}

            {!round && (
              <>
                <div className="row">
                  <span className="label">Plats</span>
                  <div className="seats" role="group" aria-label="Plats">
                    {content.scene.places.seats.map((entry) => (
                      <button key={entry.seat} type="button" aria-pressed={seat === entry.seat} onClick={() => setSeat(entry.seat)}>
                        {entry.seat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="row">
                  <label className="stake">
                    <span className="label">Insats</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={limits.min}
                      max={most}
                      step={limits.min}
                      value={stake}
                      onChange={(event) => setStake(Number(event.currentTarget.value))}
                    />
                  </label>
                  <button type="button" className="go" disabled={still || !(stake >= limits.min && stake <= most)} onClick={() => send({ op: 'start', bets: [{ seat, main: stake }] })}>
                    Dela
                  </button>
                  {balance < limits.min && (
                    <button type="button" onClick={fresh}>
                      Ny kassa
                    </button>
                  )}
                </div>
              </>
            )}

            {round?.phase === 'insurance' && (
              <div className="row">
                <span className="say">Dealern visar ett ess. Försäkring?</span>
                <button type="button" disabled={still} onClick={() => send({ op: 'insurance', roundId: state.roundId, take: true })}>
                  Försäkra ({comma(round.hands.reduce((sum, hand) => sum + hand.stake / 2, 0))})
                </button>
                <button type="button" disabled={still} onClick={() => send({ op: 'insurance', roundId: state.roundId, take: false })}>
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
                    onClick={() => send({ op: 'act', action, seat: round.activeSeat, handIndex: round.active, roundId: state.roundId, turnSeq: state.turnSeq })}
                  >
                    {ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            )}

            {round?.phase === 'settled' && (
              <div className="row">
                <button type="button" className="go" disabled={still} onClick={() => send({ op: 'collect', roundId: state.roundId })}>
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
          Spelkärnan {game.where} avgör kort och pengar ({state.shoe?.source === 'secure' ? 'säker sko' : `sko: ${state.shoe?.source}`}, insats {limits.min}–{limits.max}). Filmen visar bara det
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
