// Steget Dealer: en dealer ur hennes fil och registret, så som servern räknar läget (/api/dealers, src/pipeline/dealer.ts),
// ritat som en karta över det en spelbar dealer kräver och vad som finns: identitetsbilderna, REDO-ankaret per vy, och
// en nod per kort i serien med sitt läge (godkänd, att granska, underkänd, paket väntar, saknas). Tagningarna och
// paketen som väntar läses ur /api/tagningar; ett kort med klipp öppnas i steget Klipp. Steget visar bara; omdömen
// sätts i Granska, och kommandona körs i terminalen.

import { useEffect, useMemo, useState } from 'react';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { fetchContent } from './content.ts';
import { fetchDealers, type DealerCard as Card, type DealerState as State, type DealerView as View, type Shown } from './dealers.ts';
import { anchorName, cardCode, cardName, shownText, viewLabel } from './names.ts';
import { fetchRegistry, sectionsOf, thumbUrl, type Registry } from './registry.ts';
import { routeTo } from './route.ts';
import { dealerOrder, fetchTakes, NODE_STATES, nodeOf, type MapNode, type NodeState, type Takes, type Waiting } from './takes.ts';
import './dealer.css';

const STEP = 'dealer';
/** Ett paket som väntar, med kortets namn och cykeln: "P4 C1 t2 (cykel-tva-hander)". */
const packageName = (one: Waiting): string => `${cardName(one.seat, one.index, one.action)} t${one.take ?? '?'} (${one.move ?? 'okänd cykel'})`;
const statusClass = (status: string | undefined): string => (status === 'godkänd' ? 'yes' : status === 'utgår' || status === 'saknas' ? 'no' : status ? 'wait' : 'none');
const NODE_CLASS: Record<NodeState, string> = { godkänd: 'st-ok', 'att granska': 'st-rev', underkänd: 'st-fail', 'paket väntar': 'st-pkg', saknas: 'st-none' };
const NODE_BADGE: Record<NodeState, string> = { godkänd: 'yes', 'att granska': 'wait', underkänd: 'no', 'paket väntar': 'pkg', saknas: 'none' };
const NODE_WORDS: Record<NodeState, string> = {
  godkänd: 'klippet är godkänt',
  'att granska': 'klippet väntar på omdöme',
  underkänd: 'arkiverad eller utgår, tas om',
  'paket väntar': 'paketet är gjort, beställningen inte',
  saknas: 'inget klipp och inget paket',
};
const joined = (items: (string | number)[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} och ${items.at(-1)}`);

export default function DealerStep({ route }: { route: string[] }) {
  const [dealers, setDealers] = useState<State[] | null>(null);
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [takes, setTakes] = useState<Takes | null>(null);
  const [scene, setScene] = useState<SceneDescription | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetchDealers().then(setDealers, (error: Error) => setProblem(error.message));
    fetchRegistry().then(setRegistry, () => {});
    fetchTakes().then(setTakes, (error: Error) => setProblem(error.message));
    fetchContent('scene.json', 'Scenens beskrivning', readScene).then(setScene, () => {});
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
        <div className="emptystate">
          <b>Ingen dealer än</b>
          En dealer börjar med en bild av personen:
          <pre className="command">node src/pipeline/identitet.ts ny &lt;id&gt; "&lt;Namn&gt;" &lt;bild&gt;</pre>
        </div>
      </main>
    );
  }
  const state = dealers.find((one) => one.id === route[0]) ?? dealers[0]!;
  const linkTo = (file: string) => review.get(file);
  const waiting = state.packages.filter((one) => one.waiting);
  const needed = state.identity.filter((one) => one.need);
  const neededOk = needed.filter((one) => one.image?.status === 'godkänd').length;
  const ownTakes = takes ? { takes: takes.takes.filter((take) => take.dealer === state.id), waiting: takes.waiting.filter((one) => one.dealer === state.id) } : null;
  const missingViews = scene ? scene.places.seats.map((one) => one.seat).filter((seat) => seat !== scene.camera.seat && !state.views.some((view) => view.view === `plats-${seat}`)) : [];
  const spelaren = state.views.find((view) => view.view === 'spelaren');

  return (
    <main className="main dealer">
      {dealers.length > 1 && (
        <nav className="tabs chooser" aria-label="Dealers">
          {dealers.map((one) => (
            <a key={one.id} href={routeTo(STEP, one.id)} aria-current={one.id === state.id ? 'page' : undefined}>
              {one.name}
            </a>
          ))}
        </nav>
      )}
      <div className="bar">
        <h2 className="dealername">
          {state.name} <code>{state.file}</code>
        </h2>
        <span className={state.views.some((view) => view.playable) ? 'badge yes' : 'badge wait'}>
          {state.views.some((view) => view.playable) ? `spelbar ur ${state.views.filter((view) => view.playable).map((view) => viewLabel(view.view)).join(', ')}` : 'inte spelbar än'}
        </span>
      </div>
      {state.problems.map((text) => (
        <p key={text} className="warning">
          {text}
        </p>
      ))}

      <h2>
        Nästa steg <span>kommandona körs i terminalen, beställningar av agenten</span>
      </h2>
      {state.next.length === 0 ? (
        <p className="empty">Inget att göra här.</p>
      ) : (
        <ol className="next panel">
          {state.next.map((step) => (
            <li key={step.what}>
              <p>{shownText(step.what)}</p>
              {step.commands.length > 0 && (
                <details className="more">
                  <summary>{step.commands.length === 1 ? 'Kommandot' : `${step.commands.length} kommandon`}, för agenten i terminalen</summary>
                  {step.commands.map((command) => (
                    <pre key={command} className="command">
                      {command}
                    </pre>
                  ))}
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {waiting.length > 0 && (
        <p className="empty">
          Förberedda tagningar som väntar på att agenten beställer dem: {(ownTakes?.waiting ?? []).map(packageName).join(', ') || waiting.length}.
        </p>
      )}

      <h2>
        Kartan <span>vad en spelbar dealer kräver, och vad som finns</span>
      </h2>
      <p className="empty">
        En kedja per vy: godkända identitetsbilder, ett godkänt REDO-ankare för vyn, och ett godkänt klipp för varje kort i serien (content/dealer.json, series). Ett tryck på ett kort med klipp öppnar det i steget Klipp, bredvid dockan.
      </p>
      <details className="more">
        <summary>Hur namnen läses: P4 C1, D hålkort, A2.1 · REDO</summary>
        <p className="empty names">
          P är platsen och C kortet på platsen, räknat från 1: P4 C1 är plats 4, första kortet. D är dealern: D C1 hennes öppna kort, D hålkort det andra kortet med baksidan upp, D vändning när det vänds, D C3 och D C4 hennes extrakort. Väntan spelas medan spelet väntar; t är tagningen. Ankarna: A1 · VILA (båda händerna på filten), A2.n · REDO (handen vid kortet i skon; n är REDO-ställningens version, med sin serie)
          {spelaren?.anchor ? `, här ${anchorName(spelaren.anchor.file)} (${spelaren.anchor.file.split('/').at(-1)})` : ''}, och A3P1–A3P7 och A3D · C1 (REDO med kortet lagt på platsen: det en tagning slutar på).
        </p>
      </details>
      <div className="legend" aria-label="Lägena">
        {NODE_STATES.map((one) => (
          <span key={one} className="legendrow">
            <span className={`badge ${NODE_BADGE[one]}`}>{one}</span> <span className="empty">{NODE_WORDS[one]}</span>
          </span>
        ))}
      </div>

      <div className="mapstage identity">
        <h3>
          Identitet <span className="empty">{`${neededOk} av ${needed.length} som krävs godkända; bilderna som bär hennes likhet`}</span>
        </h3>
        <div className="tiles">
          {state.identity
            .filter((one) => one.need || one.image)
            .map((one) => (
              <Tile key={one.role} label={`${one.role}${one.need ? ' (krävs)' : ''}`} sub={one.what} shown={one.image} href={one.image ? linkTo(one.image.file) : undefined} note={one.image?.note} />
            ))}
        </div>
      </div>

      {state.views.map((view) => (
        <section key={view.view} className="mapview">
          <div className="arrow" aria-hidden="true">
            ↓
          </div>
          <h2>
            Vy {viewLabel(view.view)} <span>{summary(view, ownTakes)}</span>
          </h2>
          <div className="mapstage">
            <h3>
              REDO-ankaret {view.anchor ? anchorName(view.anchor.file) : ''} <span className="empty">vyns, i dealerns fil</span>
            </h3>
            <div className="tiles">
              <Tile label={view.anchor ? anchorName(view.anchor.file) : 'REDO-ankaret'} sub={view.anchor ? shownText(view.anchor.title) : 'inget i dealerns fil'} shown={view.anchor} href={view.anchor ? linkTo(view.anchor.file) : undefined} wide />
            </div>
            {view.candidates.length > 0 && (
              <p className="empty">
                Andra REDO-ankare för vyn: {view.candidates.map((one) => `${anchorName(one.file)} (${one.status})`).join(', ')}. Klipp ur dem kedjas inte med vyns ankare.
              </p>
            )}
          </div>
          <div className="arrow" aria-hidden="true">
            ↓
          </div>
          <div className="mapstage">
            <h3>
              Serien ur {view.anchor ? anchorName(view.anchor.file) : 'vyn'} <span className="empty">tonade kolumner och kort hör till serien sedan</span>
            </h3>
            {ownTakes ? <SeriesMap view={view} takes={ownTakes} /> : <p className="empty">{problem ?? 'Läser tagningarna …'}</p>}
            {view.elsewhere.map((one) => (
              <p key={one.anchor} className="empty">
                Ur {anchorName(one.anchor)} ({one.anchor.split('/').at(-1)}): {one.clips} godkända klipp, som inte kedjas med vyns ankare.
              </p>
            ))}
            {ownTakes && <OtherPackages view={view} takes={ownTakes} />}
          </div>
        </section>
      ))}
      {scene && (
        <p className="empty missing">
          {missingViews.length > 0 && `Plats ${joined(missingViews)}: REDO-ankare och serie saknas. `}Plats {scene.camera.seat} är samma öga som Spelaren.
        </p>
      )}
    </main>
  );
}

/** Vyns läge i en rad: seriens första kort och de senare. */
function summary(view: View, takes: Takes | null): string {
  const nodes = takes ? view.cards.map((card) => ({ card, node: nodeOf(view.view, view.anchor?.file ?? null, card, takes.takes, takes.waiting) })) : [];
  const count = (first: boolean, state: NodeState) => nodes.filter((one) => one.card.first === first && one.node.state === state).length;
  const first = view.cards.filter((card) => card.first).length;
  const then = view.cards.length - first;
  const rest = (isFirst: boolean) =>
    (['att granska', 'underkänd', 'paket väntar', 'saknas'] as NodeState[])
      .map((state) => [state, count(isFirst, state)] as const)
      .filter(([, n]) => n > 0)
      .map(([state, n]) => `${n} ${state}`)
      .join(', ');
  if (!takes) return view.playable ? 'spelbar' : '';
  const firstRest = rest(true);
  const thenRest = rest(false);
  return `${count(true, 'godkänd')} av ${first} kort godkända${firstRest ? ` (${firstRest})` : ''}; senare kort ${count(false, 'godkänd')} av ${then}${thenRest ? ` (${thenRest})` : ''}. ${view.playable ? 'Spelbar.' : 'Inte spelbar än.'}`;
}

/** Seriens kort som noder: platserna i rader med korten i kolumner, sedan dealerns kort och väntan. */
function SeriesMap({ view, takes }: { view: View; takes: Takes }) {
  const anchor = view.anchor?.file ?? null;
  const nodes = view.cards.map((card) => ({ card, node: nodeOf(view.view, anchor, card, takes.takes, takes.waiting) }));
  const seats = [...new Set(view.cards.filter((card) => card.seat !== 'D').map((card) => card.seat as number))].sort((a, b) => a - b);
  const columns = [...new Set(view.cards.filter((card) => card.seat !== 'D').map((card) => card.index))].sort((a, b) => a - b);
  const later = (index: number) => view.cards.some((card) => card.seat !== 'D' && card.index === index && !card.first);
  const dealer = nodes.filter((one) => one.card.seat === 'D').sort((a, b) => dealerOrder(a.card.index, a.card.action) - dealerOrder(b.card.index, b.card.action));
  return (
    <div className="seriesmap">
      <div className="nodegrid" style={{ gridTemplateColumns: `2.4rem repeat(${columns.length}, minmax(84px, 1fr))` }} role="group" aria-label={`Spelarnas kort ur ${viewLabel(view.view)}`}>
        <span />
        {columns.map((index) => (
          <span key={index} className={later(index) ? 'colhead later' : 'colhead'}>
            {cardCode(index)}
            {later(index) ? ' (sedan)' : ''}
          </span>
        ))}
        {seats.map((seat) => (
          <Row key={seat} seat={seat} columns={columns} nodes={nodes} />
        ))}
      </div>
      <h4>Dealern</h4>
      <div className="dealergrid" role="group" aria-label={`Dealerns kort ur ${viewLabel(view.view)}`}>
        {dealer.map(({ card, node }) => (
          <Node key={card.key} node={node} first={card.first} />
        ))}
      </div>
    </div>
  );
}

function Row({ seat, columns, nodes }: { seat: number; columns: number[]; nodes: { card: Card; node: MapNode }[] }) {
  return (
    <>
      <span className="rowhead">P{seat}</span>
      {columns.map((index) => {
        const found = nodes.find((one) => one.card.seat === seat && one.card.index === index && one.card.action === 'deal');
        return found ? <Node key={index} node={found.node} first={found.card.first} /> : <span key={index} />;
      })}
    </>
  );
}

function Node({ node, first }: { node: MapNode; first: boolean }) {
  const body = (
    <>
      <b>
        {node.name} {node.step && <span className={`stepbadge s${node.step}`}>steg {node.step}</span>}
      </b>
      <span className="word">
        {node.state}
        {node.take !== null && node.state !== 'saknas' ? ` · t${node.take}` : ''}
      </span>
      {node.note && <small>{node.note}</small>}
    </>
  );
  const className = `node ${NODE_CLASS[node.state]}${first ? '' : ' later'}`;
  return node.open ? (
    <a className={className} href={routeTo('klipp', node.open)} title={`${node.words}: öppna i steget Klipp`}>
      {body}
    </a>
  ) : (
    <div className={className} title={node.words}>
      {body}
    </div>
  );
}

/** Paket ur vyn som väntar på beställning men inte hör till något kort som saknar klipp: provklipp och omtagningar. */
function OtherPackages({ view, takes }: { view: View; takes: Takes }) {
  const anchor = view.anchor?.file ?? null;
  const shown = new Set(view.cards.flatMap((card) => (card.clip ? [] : takes.waiting.filter((one) => (one.view ?? 'spelaren') === view.view && one.seat === card.seat && one.index === card.index && one.action === card.action && (anchor === null || one.anchor === anchor)).map((one) => one.id))));
  const rest = takes.waiting.filter((one) => (one.view ?? 'spelaren') === view.view && !shown.has(one.id));
  if (rest.length === 0) return null;
  return <p className="empty">Andra förberedda tagningar ur vyn som väntar på beställning: {rest.map(packageName).join(', ')}.</p>;
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
