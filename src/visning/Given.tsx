// Hela given i visningen, som i Labbets steg Scen: rundan som spelkärnan delade efter content/runda.json (visning.json),
// med varje kort spelat med dealerns godkända cykelklipp eller, när klippet saknas, spelkärnans fallback. Samma val och
// samma uppspelning som Labbet, Casinot och src/pipeline/runda.ts (src/scene/round.ts): given spelas om och om, och efter
// sista kortet väntar dealern (vänta-klippet) eller står sista rutan kvar rundans hold sekunder.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { DEALER, VIEW, type Content, type Files } from '../casino/link.ts';
import { frameStyle, Stage } from '../casino/Stage.tsx';
import type { FilmNote, SceneHandle, SeatView } from '../scene/build.ts';
import { anchorName, dealName, dealsOf, planRound, roundFilm, waitClip, type DealtRound } from '../scene/round.ts';
import { listed } from './missing.ts';

const OUTCOME_LABELS = { blackjack: 'vinner med blackjack', win: 'vinner', push: 'får lika', lose: 'förlorar' } as const;

const comma = (value: number): string => String(value).replace('.', ',');

type GivenProps = { content: Content; files: Files; dealt: DealtRound; view: SeatView; speed: number; controls?: ReactNode };

export function Given({ content, files, dealt, view, speed, controls }: GivenProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  const [paused, setPaused] = useState(false);
  const skip = useRef<() => void>(() => {});
  const plan = useMemo(() => planRound(dealsOf(dealt.steps), content.entries, DEALER, VIEW, content.round.fallback), [dealt, content]);
  const wait = waitClip(content.entries, DEALER, VIEW, plan.anchor);
  const film = roundFilm(plan, content.round, VIEW);
  const dealer: FilmNote = { ...film, ...(wait ? { wait } : {}), speed };

  const again = (): void => {
    const clip = handle?.clip;
    if (!clip) return;
    setPaused(false);
    void clip.seek(0).then(() => clip.play());
  };
  const pause = (): void => {
    const clip = handle?.clip;
    if (!clip) return;
    if (paused) clip.play();
    else clip.pause();
    setPaused(!paused);
  };

  // Korten som delas, och vändningen av hålkortet, som är en del av given men inget nytt kort.
  const cards = plan.dealt.filter((one) => one.action === 'deal' || one.action === 'hole').length;
  const flips = plan.dealt.filter((one) => one.action === 'flip').length;
  const settle = dealt.result.settle;
  const outcomes = settle?.hands.map((hand) => `plats ${hand.seat} ${OUTCOME_LABELS[hand.outcome]}`) ?? [];

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
          start={0}
          play
          most={content.round.wait.most}
          fps={content.round.film.fps}
          onDone={() => {}}
          skip={skip}
          onProblem={setProblem}
          onShown={setHandle}
        />
      </div>
      <section className="panel" aria-label="Hela given">
        {controls}
        {problem && <p className="warning">{problem}</p>}
        <div className="row">
          <span className="say">
            Hela given: {cards} kort{flips > 0 ? ' och vändningen' : ''}
          </span>
          <button type="button" disabled={!handle?.clip} onClick={again}>
            Börja om
          </button>
          <button type="button" disabled={!handle?.clip} aria-pressed={paused} onClick={pause}>
            {paused ? 'Spela' : 'Pausa'}
          </button>
        </div>
        <p className="missing">
          En runda som spelkärnan har delat: plats {listed(dealt.bets.map((bet) => String(bet.seat)))}, insats {comma(dealt.bets[0]?.main ?? 0)}, spelarna tar Hit under {dealt.hitBelow}
          {outcomes.length > 0 ? `, och ${listed(outcomes)}` : ''}. Korten kommer i spelkärnans ordning med dess valörer, och hålkortet ligger med baksidan upp tills det vänds.
          {wait ? ' Efter sista kortet väntar dealern, och sedan börjar given om.' : ` Efter sista kortet står sista rutan kvar ${comma(content.round.film.hold)} s, och sedan börjar given om.`}
        </p>
        {plan.missing.length > 0 && <p className="missing">Utan klipp, kortet går självt medan dealern står i REDO: {plan.missing.map(dealName).join('; ')}.</p>}
        {plan.anchor !== null && <p className="missing">Klippen är gjorda ur REDO-ankaret {anchorName(plan.anchor)}.</p>}
      </section>
    </main>
  );
}
