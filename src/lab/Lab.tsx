import { lazy, Suspense } from 'react';
import { Review } from './Review.tsx';
import { routeTo, useRoute } from './route.ts';

// Scenen drar in three och läses därför först när steget öppnas.
const SceneStep = lazy(() => import('./SceneStep.tsx'));

// Stegen står i docs/architecture.md. Ett steg utan vy är inte byggt än.
const STEPS = [
  { key: 'scen', label: 'Scen', built: true },
  { key: 'dealer', label: 'Dealer', built: false },
  { key: 'klipp', label: 'Klipp', built: false },
  { key: 'granska', label: 'Granska', built: true },
  { key: 'spela', label: 'Spela', built: false },
];

// Steget man kommer till utan adress, och med en adress som inte pekar ut ett byggt steg.
const START = 'granska';

export function Lab() {
  const [first, ...rest] = useRoute();
  const current = STEPS.some((step) => step.built && step.key === first) ? first : START;

  return (
    <div className="lab">
      <header className="top">
        <div className="brand">
          3d-dealer <span>Labbet</span>
        </div>
        <nav className="steps" aria-label="Steg">
          {STEPS.map((step) =>
            step.built ? (
              <a
                key={step.key}
                className={step.key === current ? 'step on' : 'step'}
                href={routeTo(step.key)}
                aria-current={step.key === current ? 'page' : undefined}
              >
                {step.label}
              </a>
            ) : (
              <span key={step.key} className="step off" title="Inte byggt än">
                {step.label}
              </span>
            ),
          )}
        </nav>
        {/* Casinot är ett eget läge, med samma scen: en riktig runda mot spelkärnan. */}
        <a className="step elsewhere" href="/casino/" title="Spela en runda mot spelkärnan">
          Casinot
        </a>
      </header>
      {current === 'scen' ? (
        <Suspense fallback={<main className="notice">Läser scenen …</main>}>
          <SceneStep route={rest} />
        </Suspense>
      ) : (
        <Review route={rest} />
      )}
    </div>
  );
}
