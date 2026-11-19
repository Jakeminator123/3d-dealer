// Steget Granska: allt i registret, avdelning för avdelning, med Jakobs omdöme på varje fil.

import { useCallback, useEffect, useState } from 'react';
import { Detail } from './Detail.tsx';
import {
  fetchRegistry,
  formatBytes,
  mediaUrl,
  saveComment,
  saveStatus,
  sectionsOf,
  thumbUrl,
  type Item,
  type Registry,
} from './registry.ts';
import { routeTo } from './route.ts';
import { FILM_STEPS, shownText, stepName } from './names.ts';
import { capitalize, Verdict, type Judge } from './Verdict.tsx';
import { Words, type Say } from './Words.tsx';

const STEP = 'granska';
const ALL = 'alla';

export function Review({ route }: { route: string[] }) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  // Adressen granska/<vy>/status/<status> visar bara filerna med det omdömet: dit leder översikten.
  const asked = route[1] === 'status' ? (route[2] ?? null) : null;
  useEffect(() => {
    if (asked !== null) setOnly(asked);
  }, [asked]);

  useEffect(() => {
    fetchRegistry().then(setRegistry, (error: Error) => setProblem(error.message));
  }, []);

  const keep = useCallback((saving: Promise<Registry>) => {
    saving.then(
      (fresh) => {
        setRegistry(fresh);
        setProblem(null);
      },
      (error: Error) => setProblem(error.message),
    );
  }, []);
  const judge = useCallback<Judge>((file, status) => keep(saveStatus(file, status)), [keep]);
  const say = useCallback<Say>((file, comment) => keep(saveComment(file, comment)), [keep]);

  if (!registry) return <main className="notice">{problem ?? 'Läser registret …'}</main>;

  // Adressen är granska/<vy> eller, med en fil öppen, granska/<avdelning>/<nummer>
  // respektive granska/alla/<avdelning>/<nummer>.
  const sections = sectionsOf(registry);
  const [view = ALL, first, second] = route;
  const shown = view === ALL ? sections : sections.filter((section) => section.key === view);
  const items = shown.flatMap((section) => section.items);
  const passes = (item: Item) => only === null || item.asset.status === only;

  const openSection = second === undefined ? view : first;
  const openNumber = Number(second ?? first);
  const open = items.find((item) => item.section === openSection && item.number === openNumber);
  const at = open ? items.indexOf(open) : -1;
  const previous = open ? items.slice(0, at).findLast(passes) : undefined;
  const next = open ? items.slice(at + 1).find(passes) : undefined;

  const pathTo = (item: Item): string =>
    view === ALL ? routeTo(STEP, ALL, item.section, item.number) : routeTo(STEP, item.section, item.number);

  const missing = registry.assets.filter((asset) => !asset.present);
  const visibleCount = items.filter(passes).length;

  return (
    <div className="review">
      <aside className="side">
        <h2 className="label">Registrets avdelningar</h2>
        <nav aria-label="Avdelningar">
          <a className="section" href={routeTo(STEP, ALL)} aria-current={view === ALL ? 'page' : undefined}>
            Alla <span>{sections.flatMap((section) => section.items).filter(passes).length}</span>
          </a>
          {sections.map((section) => (
            <a
              key={section.key}
              className="section"
              href={routeTo(STEP, section.key)}
              aria-current={view === section.key ? 'page' : undefined}
            >
              {section.label} <span>{section.items.filter(passes).length}</span>
            </a>
          ))}
        </nav>
        <p className="hint">
          Ett klick på ett omdöme sparas direkt i registret, <code>content/register.db</code>. Ingen fil tas bort härifrån.
        </p>
      </aside>

      <main className="main">
        <div className="bar">
          <h2>{view === ALL ? 'Alla filer' : (shown[0]?.label ?? 'Okänd avdelning')}</h2>
          <div className="seg" role="group" aria-label="Visa">
            <button type="button" aria-pressed={only === null} onClick={() => setOnly(null)}>
              Alla <b>{items.length}</b>
            </button>
            {Object.entries(registry.statuses).map(([status, meaning]) => (
              <button
                key={status}
                type="button"
                data-status={status}
                aria-pressed={only === status}
                title={meaning}
                onClick={() => setOnly(status)}
              >
                {capitalize(status)} <b>{items.filter((item) => item.asset.status === status).length}</b>
              </button>
            ))}
          </div>
        </div>

        {problem && <p className="warning">{problem}</p>}
        {missing.length > 0 && (
          <p className="warning">
            {missing.length} poster i registret saknar sin fil i <code>assets/</code>:{' '}
            {missing.map((asset) => asset.file).join(', ')}
          </p>
        )}
        {registry.unregistered.length > 0 && (
          <p className="warning">
            {registry.unregistered.length} filer i <code>assets/</code> saknar post i registret:{' '}
            {registry.unregistered.join(', ')}
          </p>
        )}

        {visibleCount === 0 && <p className="empty">Inget här med den statusen.</p>}
        {shown.map((section) => {
          const visible = section.items.filter(passes);
          if (visible.length === 0) return null;
          return (
            <section key={section.key}>
              {view === ALL && (
                <h2>
                  {section.label} <span>{visible.length}</span>
                </h2>
              )}
              <div className="grid">
                {visible.map((item) => (
                  <Card key={item.asset.file} item={item} registry={registry} href={pathTo(item)} onJudge={judge} onSay={say} />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {open && (
        <Detail
          key={open.asset.file}
          item={open}
          section={sections.find((section) => section.key === open.section)!}
          registry={registry}
          close={routeTo(STEP, view)}
          previous={previous && pathTo(previous)}
          next={next && pathTo(next)}
          onJudge={judge}
          onSay={say}
        />
      )}
    </div>
  );
}

type CardProps = { item: Item; registry: Registry; href: string; onJudge: Judge; onSay: Say };

function Card({ item, registry, href, onJudge, onSay }: CardProps) {
  const { asset, kind } = item;
  const facts = [
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null,
    asset.seconds ? `${String(asset.seconds).replace('.', ',')} s` : null,
    asset.bytes ? formatBytes(asset.bytes) : null,
  ].filter(Boolean);

  return (
    <article className="card" data-status={asset.status}>
      <a className="thumb" href={href} aria-label={`Öppna ${shownText(asset.title)}`}>
        <Thumb item={item} />
        <span className="number">{item.number}</span>
        {kind !== 'bild' && <span className="kind">{kind === 'film' ? 'Film' : '3D-modell'}</span>}
      </a>
      <div className="caption">
        <div className="title">{shownText(asset.title)}</div>
        {asset.step && (
          <span className={`stepbadge s${asset.step}`} title={FILM_STEPS[asset.step - 1]!.line}>
            {stepName(asset.step)}
          </span>
        )}
        <div className="file">
          {asset.file.slice(asset.file.lastIndexOf('/') + 1)} · {facts.join(' · ')}
        </div>
      </div>
      <Verdict registry={registry} asset={asset} onJudge={onJudge} />
      <Words registry={registry} asset={asset} onSay={onSay} />
    </article>
  );
}

function Thumb({ item }: { item: Item }) {
  const { asset, kind } = item;
  if (!asset.present) return <span className="placeholder">Filen saknas i assets/</span>;
  if (kind === 'bild') return <img src={thumbUrl(asset.file, 640)} alt="" loading="lazy" />;
  if (kind === 'modell') return <span className="placeholder">Öppna för att se modellen</span>;
  return (
    <video
      src={`${mediaUrl(asset.file)}#t=0.1`}
      preload="metadata"
      muted
      loop
      playsInline
      onMouseEnter={(event) => void event.currentTarget.play().catch(() => {})}
      onMouseLeave={(event) => event.currentTarget.pause()}
    />
  );
}
