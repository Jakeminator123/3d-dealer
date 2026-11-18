// Steget Dealer: en dealer ur hennes fil och registret, så som servern räknar läget (/api/dealers, src/pipeline/dealer.ts):
// identitetsbilderna, REDO-ankaret per vy med omdöme, klippen per plats och kort, och nästa steg med kommandona.
// Steget visar bara; omdömen sätts i Granska, och kommandona körs i terminalen.

import { useEffect, useMemo, useState } from 'react';
import { fetchRegistry, sectionsOf, thumbUrl, type Registry } from './registry.ts';
import { routeTo } from './route.ts';
import './dealer.css';

// Läget som servern ger det (DealerState i src/pipeline/dealer.ts; Labbet läser inte pipeline, så formen står här).
type Shown = { file: string; status: string; present: boolean; title: string };
type Card = { key: string; label: string; first: boolean; seat: number | 'D'; index: number; action: string; clip: (Shown & { take: number | null; move: string | null }) | null; others: number };
type View = { view: string; anchor: Shown | null; candidates: Shown[]; cards: Card[]; elsewhere: { anchor: string; clips: number }[]; playable: boolean };
type State = {
  id: string;
  name: string;
  file: string;
  identity: { role: string; what: string; need: boolean; image: (Shown & { note?: string }) | null }[];
  views: View[];
  packages: { kind: string; id: string; waiting: boolean }[];
  next: { what: string; commands: string[] }[];
  problems: string[];
};

const STEP = 'dealer';
const viewName = (view: string): string => (view === 'spelaren' ? 'Spelaren' : `Plats ${view.split('-')[1]}`);
const statusClass = (status: string | undefined): string => (status === 'godkänd' ? 'yes' : status === 'utgår' || status === 'saknas' ? 'no' : status ? 'wait' : 'none');

export default function DealerStep({ route }: { route: string[] }) {
  const [dealers, setDealers] = useState<State[] | null>(null);
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dealers', { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as State[] | { error?: string };
        if (!response.ok || !Array.isArray(body)) throw new Error((body as { error?: string }).error ?? `Dealerna gick inte att läsa (${response.status})`);
        setDealers(body);
      })
      .catch((error: Error) => setProblem(error.message));
    fetchRegistry().then(setRegistry, () => {});
  }, []);

  // Var en fil står i Granska: avdelning och nummer.
  const review = useMemo(() => {
    const where = new Map<string, string>();
    if (registry) for (const section of sectionsOf(registry)) for (const item of section.items) where.set(item.asset.file, routeTo('granska', item.section, item.number));
    return where;
  }, [registry]);

  if (!dealers) return <main className="notice">{problem ?? 'Läser dealerna …'}</main>;
  if (dealers.length === 0) {
    return (
      <main className="main dealer">
        <h1>Ingen dealer än</h1>
        <p className="empty">En dealer börjar med en bild av personen:</p>
        <pre className="command">node src/pipeline/identitet.ts ny &lt;id&gt; "&lt;Namn&gt;" &lt;bild&gt;</pre>
      </main>
    );
  }
  const state = dealers.find((one) => one.id === route[0]) ?? dealers[0]!;
  const linkTo = (file: string) => review.get(file);
  const waiting = state.packages.filter((one) => one.waiting);

  return (
    <main className="main dealer">
      {dealers.length > 1 && (
        <nav className="chooser" aria-label="Dealers">
          {dealers.map((one) => (
            <a key={one.id} href={routeTo(STEP, one.id)} aria-current={one.id === state.id ? 'page' : undefined}>
              {one.name}
            </a>
          ))}
        </nav>
      )}
      <div className="bar">
        <h1>
          {state.name} <code>{state.file}</code>
        </h1>
        <span className={state.views.some((view) => view.playable) ? 'badge yes' : 'badge wait'}>
          {state.views.some((view) => view.playable) ? `spelbar ur ${state.views.filter((view) => view.playable).map((view) => viewName(view.view)).join(', ')}` : 'inte spelbar än'}
        </span>
      </div>
      {state.problems.map((text) => (
        <p key={text} className="warning">
          {text}
        </p>
      ))}

      <h2>Nästa steg</h2>
      {state.next.length === 0 ? (
        <p className="empty">Inget att göra här.</p>
      ) : (
        <ol className="next">
          {state.next.map((step) => (
            <li key={step.what}>
              <p>{step.what}</p>
              {step.commands.map((command) => (
                <pre key={command} className="command">
                  {command}
                </pre>
              ))}
            </li>
          ))}
        </ol>
      )}
      {waiting.length > 0 && (
        <p className="empty">
          Paket som väntar på beställning: {waiting.map((one) => `${one.id} (${one.kind})`).join(', ')}
        </p>
      )}

      <h2>
        Identitet <span>bilderna som bär hennes likhet</span>
      </h2>
      <div className="tiles">
        {state.identity
          .filter((one) => one.need || one.image)
          .map((one) => (
            <Tile key={one.role} label={one.role} sub={one.what} shown={one.image} href={one.image ? linkTo(one.image.file) : undefined} note={one.image?.note} />
          ))}
      </div>

      {state.views.map((view) => (
        <section key={view.view}>
          <h2>
            {viewName(view.view)} <span>{view.playable ? 'spelbar' : 'REDO-ankaret och klippen ur det'}</span>
          </h2>
          <div className="tiles">
            <Tile label="REDO-ankaret" sub={view.anchor ? 'vyns, i dealerns fil' : 'inget i dealerns fil'} shown={view.anchor} href={view.anchor ? linkTo(view.anchor.file) : undefined} wide />
            {view.candidates.slice(0, 3).map((one) => (
              <Tile key={one.file} label="annat ankare" sub={one.file.split('/').at(-1)!} shown={one} href={linkTo(one.file)} wide />
            ))}
          </div>
          <Cards view={view} linkTo={linkTo} />
          {view.elsewhere.map((one) => (
            <p key={one.anchor} className="empty">
              Ur {one.anchor.split('/').at(-1)}: {one.clips} godkända klipp, som inte kedjas med vyns ankare.
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}

function Tile({ label, sub, shown, href, note, wide }: { label: string; sub: string; shown: Shown | null; href?: string; note?: string; wide?: boolean }) {
  const body = (
    <>
      <div className={wide ? 'thumb wide' : 'thumb'}>{shown?.present ? <img src={thumbUrl(shown.file, wide ? 480 : 320)} alt="" loading="lazy" /> : <span>{shown ? 'filen saknas' : 'saknas'}</span>}</div>
      <div className="meta">
        <b>{label}</b>
        <span className={`badge ${statusClass(shown?.status)}`}>{shown?.status ?? 'saknas'}</span>
      </div>
      <p>{sub}</p>
      {shown && <code>{shown.file}</code>}
      {note && <p className="note">{note}</p>}
    </>
  );
  return href ? (
    <a className="tile" href={href} title="Öppna i Granska">
      {body}
    </a>
  ) : (
    <div className="tile">{body}</div>
  );
}

/** Seriens kort: platserna i rader, korten och handlingarna i kolumner, med klippets omdöme. */
function Cards({ view, linkTo }: { view: View; linkTo: (file: string) => string | undefined }) {
  const seats = [...new Set(view.cards.map((card) => card.seat))];
  const columns = [...new Set(view.cards.map((card) => `${card.index}/${card.action}`))].sort();
  const done = view.cards.filter((card) => card.first && card.clip?.status === 'godkänd').length;
  const first = view.cards.filter((card) => card.first).length;
  return (
    <>
      <p className="empty">
        Klipp ur ankaret: {done} av seriens {first} kort godkända. Tonade rutor hör till serien sedan.
      </p>
      <table className="cards">
        <thead>
          <tr>
            <th />
            {columns.map((column) => {
              const [index, action] = column.split('/');
              return <th key={column}>{`kort ${index}${action === 'deal' ? '' : ` ${action}`}`}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {seats.map((seat) => (
            <tr key={seat}>
              <th>{seat === 'D' ? 'dealern' : `plats ${seat}`}</th>
              {columns.map((column) => {
                const card = view.cards.find((one) => one.seat === seat && `${one.index}/${one.action}` === column);
                if (!card) return <td key={column} />;
                const href = card.clip ? linkTo(card.clip.file) : undefined;
                const text = card.clip ? card.clip.status : '–';
                return (
                  <td key={column} className={`${statusClass(card.clip?.status)}${card.first ? '' : ' later'}`} title={`${card.label}${card.clip ? `: ${card.clip.file}` : ': inget klipp'}${card.others ? ` (${card.others} godkända ur andra ankare)` : ''}`}>
                    {href ? <a href={href}>{text}</a> : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
