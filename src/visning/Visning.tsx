// Visningen: Casinot och hela given på en statisk sida, utan studions server, för att pröva det som har skapats från en
// telefon. Spelkärnan körs i webbläsaren (spel.ts), och klippen, rummet och modellerna ligger bredvid sidan (bygg.ts).
// Två lägen i vyn Spelaren: Spela (Casinot, samma som i studion) och Hela given (som i Labbet). Närbilden och klippens
// fart väljs här och gäller båda; de sparas inte.

import { useEffect, useMemo, useState } from 'react';
import { Casino } from '../casino/Casino.tsx';
import { DEALER, VIEW, loadContent, type Content, type GameLink } from '../casino/link.ts';
import { seatsOf } from '../scene/geometry.ts';
import { Given } from './Given.tsx';
import { withoutFilm } from './missing.ts';
import { fetchShowing, showingFiles, type Showing } from './spel.ts';

type Mode = 'spela' | 'given';
const MODES: { mode: Mode; label: string }[] = [
  { mode: 'spela', label: 'Spela' },
  { mode: 'given', label: 'Hela given' },
];
// Farterna att pröva klippen i, som gånger farten de är filmade i.
const SPEEDS = [1, 1.5, 2];

const comma = (value: number): string => String(value).replace('.', ',');
const modeOf = (hash: string): Mode => (hash === '#given' ? 'given' : 'spela');

type Loaded = { content: Content; showing: Showing };

export function Visning({ game }: { game: GameLink }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => modeOf(window.location.hash));
  const [close, setClose] = useState(false);
  const [speed, setSpeed] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([loadContent(showingFiles), fetchShowing()]).then(([content, showing]) => setLoaded({ content, showing }), (error: Error) => setProblem(error.message));
  }, []);
  useEffect(() => {
    const follow = () => setMode(modeOf(window.location.hash));
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  const lacking = useMemo(() => (loaded ? withoutFilm(loaded.content.entries, seatsOf(loaded.content.scene)) : null), [loaded]);
  const choose = (next: Mode): void => {
    setMode(next);
    window.history.replaceState(null, '', next === 'given' ? '#given' : `${window.location.pathname}${window.location.search}`);
  };

  // Farten börjar på rundans (content/runda.json speed.clips); finns den inte bland valen läggs den till.
  const studio = loaded?.content.round.speed.clips ?? 1;
  const pace = speed ?? studio;
  const speeds = [...new Set([...SPEEDS, studio])].sort((a, b) => a - b);
  const view = close ? { ...VIEW, close: true } : VIEW;
  const name = DEALER.charAt(0).toUpperCase() + DEALER.slice(1);

  const controls = (
    <div className="row choices">
      <button type="button" aria-pressed={close} title="Samma öga, inzoomat på dealern" onClick={() => setClose(!close)}>
        Närbild
      </button>
      <span className="label">Fart</span>
      <div className="speeds" role="group" aria-label="Klippens fart">
        {speeds.map((one) => (
          <button key={one} type="button" aria-pressed={pace === one} onClick={() => setSpeed(one)}>
            {comma(one)}×
          </button>
        ))}
      </div>
      <span className="hint">Sparas inte.</span>
    </div>
  );

  return (
    <div className="visning">
      <header className="visningtop">
        <div className="brand">
          3d-dealer <span>{name}</span>
        </div>
        <span className="built">{loaded ? `Visning, byggd ${loaded.showing.built.replace(' ', ' kl. ')}` : 'Visning'}</span>
        <nav className="modes" aria-label="Läge">
          {MODES.map((one) => (
            <button key={one.mode} type="button" aria-pressed={mode === one.mode} onClick={() => choose(one.mode)}>
              {one.label}
            </button>
          ))}
        </nav>
        {lacking && <p className="lacking">{lacking}</p>}
      </header>
      {!loaded ? (
        <main className="notice">{problem ?? 'Läser visningen …'}</main>
      ) : mode === 'spela' ? (
        <Casino game={game} files={showingFiles} content={loaded.content} view={view} speed={pace} controls={controls} />
      ) : (
        <Given content={loaded.content} files={showingFiles} dealt={loaded.showing.dealt} view={view} speed={pace} controls={controls} />
      )}
    </div>
  );
}
