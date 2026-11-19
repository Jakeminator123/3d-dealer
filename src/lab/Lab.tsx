// Labbets ram: menyn med stegen i den ordning en dealer går dem (steps.ts), stegets rad med vad det är till för, och
// märkena för var dealern står och vad som väntar på Jakob. Stegen själva läses först när de öppnas.

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchDealers, type DealerState } from './dealers.ts';
import { viewLabel } from './names.ts';
import { Overview, PathLine } from './Overview.tsx';
import { fetchRegistry } from './registry.ts';
import { Review } from './Review.tsx';
import { routeTo, useRoute } from './route.ts';
import { needsOf, type Need } from './situation.ts';
import { stepOf, STEPS, type Step, type StepKey } from './steps.ts';
import { fetchTakes } from './takes.ts';

// Scenen drar in three och läses därför först när steget öppnas.
const SceneStep = lazy(() => import('./SceneStep.tsx'));
const PlanStep = lazy(() => import('./PlanStep.tsx'));
const DealerStep = lazy(() => import('./DealerStep.tsx'));
const DollStep = lazy(() => import('./DollStep.tsx'));
const ClipStep = lazy(() => import('./ClipStep.tsx'));

const PARTS: Step['part'][] = ['start', 'scenen', 'dealern', 'doma'];
// Märkena läses om när man byter steg, men inte oftare än så här, i millisekunder.
const FRESH = 3000;

export function Lab() {
  const [first, ...rest] = useRoute();
  const step = stepOf(first);
  const route = step.key === first ? rest : [];

  return (
    <div className="lab">
      <header className="topbar">
        <a className="brand" href={routeTo('oversikt')} title="Översikten">
          <b>3d-dealer</b>
          <span>Labbet</span>
        </a>
        <nav className="menu" aria-label="Labbets steg">
          {PARTS.map((part) => (
            <div key={part} className="menupart">
              {STEPS.filter((one) => one.part === part).map((one) => (
                <a key={one.key} className="menuitem" href={routeTo(one.key)} aria-current={one.key === step.key ? 'page' : undefined} title={one.line}>
                  <b>{one.label}</b>
                  <small>{one.caption}</small>
                </a>
              ))}
            </div>
          ))}
          <div className="menupart">
            {/* Casinot är ett eget läge med samma scen: en riktig runda mot spelkärnan. */}
            <a className="menuitem away" href="/casino/" title="Casinot: en runda mot spelkärnan, i vyn Spelaren">
              <b>Spela</b>
              <small>Casinot, en runda</small>
            </a>
          </div>
        </nav>
        <Marks step={step.key} />
      </header>
      <div className="stephead">
        <h1>{step.label}</h1>
        <p title={step.line}>{step.line}</p>
        <PathLine on={step.stages} />
      </div>
      <Shown step={step.key} route={route} />
    </div>
  );
}

function Shown({ step, route }: { step: StepKey; route: string[] }) {
  const wait = (what: string, view: ReactNode) => <Suspense fallback={<main className="notice">Läser {what} …</main>}>{view}</Suspense>;
  switch (step) {
    case 'scen':
      return wait('scenen', <SceneStep route={route} />);
    case 'kortplan':
      return wait('kortplanen', <PlanStep />);
    case 'dealer':
      return wait('dealern', <DealerStep route={route} />);
    case 'docka':
      return wait('dockan', <DollStep route={route} />);
    case 'klipp':
      return wait('tagningarna', <ClipStep route={route} />);
    case 'granska':
      return <Review route={route} />;
    default:
      return <Overview />;
  }
}

/**
 * Märkena uppe till höger: var den första dealern står, och hur mycket som väntar på Jakob. Båda leder till där det syns.
 * De läses om när steget byts, så att ett omdöme som just satts räknas.
 */
function Marks({ step }: { step: StepKey }) {
  const [needs, setNeeds] = useState<Need[] | null>(null);
  const [dealers, setDealers] = useState<DealerState[]>([]);
  const read = useRef(0);

  useEffect(() => {
    if (Date.now() - read.current < FRESH) return;
    read.current = Date.now();
    Promise.all([fetchRegistry(), fetchTakes().catch(() => null)]).then(
      ([registry, takes]) => setNeeds(needsOf(registry, takes)),
      () => setNeeds(null),
    );
    fetchDealers().then(setDealers, () => setDealers([]));
  }, [step]);

  const mine = (needs ?? []).filter((need) => need.on === 'dig');
  const dealer = dealers[0];
  const playable = dealer?.views.filter((view) => view.playable) ?? [];
  return (
    <div className="topright">
      {dealer && (
        <a className={playable.length > 0 ? 'pill ok' : 'pill attention'} href={routeTo('dealer', dealer.id)} title="Var dealern står: steget Dealer">
          <span className="dot" />
          <b>{dealer.name}</b>
          <span className="long">{playable.length > 0 ? `spelbar ur ${playable.map((view) => viewLabel(view.view)).join(', ')}` : 'inte spelbar än'}</span>
          {dealers.length > 1 && <span>+{dealers.length - 1}</span>}
        </a>
      )}
      {needs && (
        <a className={mine.length > 0 ? 'pill attention' : 'pill ok'} href={routeTo('oversikt')} title={mine.length > 0 ? mine.map((need) => `${need.count} ${need.title}`).join('\n') : 'Inget väntar på ditt omdöme'}>
          <span className="dot" />
          {mine.length > 0 ? (
            <>
              <b>{mine.length}</b> väntar på dig
            </>
          ) : (
            'Inget väntar på dig'
          )}
        </a>
      )}
    </div>
  );
}
