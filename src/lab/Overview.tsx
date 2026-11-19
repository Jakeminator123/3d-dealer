// Översikten: Labbets startsida. Svarar på vad som finns, vad som väntar på Jakob, och vart han går för att se något.
// Talen och listorna kommer ur registret, dealerna, tagningarna och rörelserna så som servern ger dem; här står inga.

import { useEffect, useState, type CSSProperties } from 'react';
import { fetchDealers, type DealerState, type DealerView } from './dealers.ts';
import { anchorName, shownText, viewLabel } from './names.ts';
import { fetchRegistry, type Registry } from './registry.ts';
import { fetchMoves, type MoveInfo } from './rorelser.ts';
import { routeTo } from './route.ts';
import { holdingsOf, needsOf, repliesOf, type Need } from './situation.ts';
import { PATH, STEPS, type Stage } from './steps.ts';
import { fetchTakes, nodeOf, type Takes } from './takes.ts';

type Loaded = { registry: Registry; takes: Takes | null; dealers: DealerState[]; moves: MoveInfo[] };

export function Overview() {
  const [data, setData] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    // Registret bär det mesta; det andra visas när det finns, och ett fel där står som ett fel utan att sidan faller.
    Promise.all([fetchRegistry(), fetchTakes().catch(() => null), fetchDealers().catch(() => []), fetchMoves().catch(() => [])]).then(
      ([registry, takes, dealers, moves]) => setData({ registry, takes, dealers, moves }),
      (error: Error) => setProblem(error.message),
    );
  }, []);

  if (!data) return <main className="notice">{problem ?? 'Läser läget …'}</main>;
  const { registry, takes, dealers, moves } = data;
  const needs = needsOf(registry, takes);
  const mine = needs.filter((need) => need.on === 'dig');
  const agents = needs.filter((need) => need.on === 'agenten');
  const replies = repliesOf(registry);
  const cycles = moves.filter((move) => move.kind === 'cykel');

  return (
    <main className="main overview">
      <h2>
        Väntar på dig <span>{mine.length === 0 ? 'inget just nu' : ''}</span>
      </h2>
      {mine.length === 0 ? (
        <p className="empty">Inget väntar på ditt omdöme. Det agenten gör står nedanför.</p>
      ) : (
        <div className="needs">
          {mine.map((need) => (
            <NeedCard key={need.key} need={need} />
          ))}
        </div>
      )}

      {agents.length > 0 && (
        <>
          <h2>
            Väntar på agenten <span>sker i chatten</span>
          </h2>
          <div className="needs">
            {agents.map((need) => (
              <NeedCard key={need.key} need={need} />
            ))}
          </div>
        </>
      )}

      <h2>
        Dealerna <span>var var och en står på vägen till spelbar</span>
      </h2>
      {dealers.length === 0 ? (
        <div className="emptystate">
          <b>Ingen dealer än</b>
          En dealer börjar med en bild av personen:
          <pre className="command">node src/pipeline/identitet.ts ny &lt;id&gt; "&lt;Namn&gt;" &lt;bild&gt;</pre>
        </div>
      ) : (
        dealers.map((dealer) => <DealerCard key={dealer.id} dealer={dealer} takes={takes} />)
      )}

      <h2>
        Vad som finns <span>i registret, content/moves/ och output/tagningar/</span>
      </h2>
      <div className="holdings">
        {holdingsOf(registry).map((holding) => (
          <a key={holding.key} className="holding" href={holding.href} title={`Öppna ${holding.label} i Granska`}>
            <span className="label">{holding.label}</span>
            <span className="count">{holding.count}</span>
            <small>{holding.statuses.map(([status, count]) => `${count} ${status}`).join(' · ')}</small>
          </a>
        ))}
        <a className="holding" href={routeTo('docka')} title="Öppna dockan">
          <span className="label">Rörelser</span>
          <span className="count">{moves.length}</span>
          <small>
            {cycles.length} cykler och {moves.length - cycles.length} läst giv; {cycles.filter((move) => move.locked === null).length} går att ändra
          </small>
        </a>
        {takes && (
          <a className="holding" href={routeTo('klipp')} title="Öppna tagningarna">
            <span className="label">Tagningar</span>
            <span className="count">{takes.takes.length}</span>
            <small>
              med paket; {takes.takes.filter((take) => take.archived).length} arkiverade, {takes.waiting.length} väntar på beställning
            </small>
          </a>
        )}
      </div>

      {replies.length > 0 && (
        <>
          <h2>
            Agentens senaste svar <span>på dina ord om en fil</span>
          </h2>
          <ul className="replies">
            {replies.map((asset) => (
              <li key={asset.file}>
                <small>
                  {shownText(asset.title)} · {asset.replyAt ?? ''}
                </small>
                {asset.reply}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>
        Vart går jag? <span>stegen i den ordning en dealer går dem</span>
      </h2>
      <div className="steplist">
        {STEPS.filter((step) => step.key !== 'oversikt').map((step) => (
          <a key={step.key} className="stepcard" href={routeTo(step.key)}>
            <b>{step.label}</b>
            <small>{step.caption}</small>
            <p>{step.line}</p>
            <PathLine on={step.stages} />
          </a>
        ))}
        <a className="stepcard" href="/casino/">
          <b>Spela ↗</b>
          <small>Casinot, ett eget läge</small>
          <p>En runda mot spelkärnan i vyn Spelaren: välj plats och insats, dela, och spela de handlingar kärnan erbjuder.</p>
          <PathLine on={['Spela']} />
        </a>
      </div>
    </main>
  );
}

function NeedCard({ need }: { need: Need }) {
  return (
    <article className={need.on === 'dig' ? 'need' : 'need agent'}>
      <span className="count">{need.count}</span>
      <b>{need.title}</b>
      <p>{need.what}</p>
      <a className="btn small" href={need.href}>
        {need.go} →
      </a>
    </article>
  );
}

/** Produktionens väg med de steg som `on` säger framhävda. */
export function PathLine({ on }: { on: Stage[] }) {
  return (
    <ol className="path" aria-label="Produktionens steg" title="Vägen en dealer går i produktionen (docs/production.md); det framhävda är det här steget visar">
      <li className="pathname">I produktionen:</li>
      {PATH.map((stage) => (
        <li key={stage}>
          <span className={on.includes(stage) ? 'on' : undefined}>{stage}</span>
        </li>
      ))}
    </ol>
  );
}

/** Seriens läge ur en vy: godkända kort av alla. */
function seriesOf(view: DealerView, takes: Takes | null): { approved: number; total: number; laterApproved: number; later: number } {
  const ok = (card: DealerView['cards'][number]): boolean =>
    takes ? nodeOf(view.view, view.anchor?.file ?? null, card, takes.takes, takes.waiting).state === 'godkänd' : card.clip?.status === 'godkänd';
  // Som i steget Dealer: seriens första kort (content/dealer.json, series.first) för sig, och de senare för sig.
  const first = view.cards.filter((card) => card.first);
  const later = view.cards.filter((card) => !card.first);
  return { approved: first.filter(ok).length, total: first.length, laterApproved: later.filter(ok).length, later: later.length };
}

/** En dealer på produktionens väg: identitet, ankare, film, granska och spela, med var hon står i varje. */
function DealerCard({ dealer, takes }: { dealer: DealerState; takes: Takes | null }) {
  const needed = dealer.identity.filter((one) => one.need);
  const identityOk = needed.filter((one) => one.image?.status === 'godkänd').length;
  const anchored = dealer.views.filter((view) => view.anchor?.status === 'godkänd');
  const playable = dealer.views.filter((view) => view.playable);
  const series = dealer.views.map((view) => ({ view, ...seriesOf(view, takes) }));
  const ownClips = takes ? takes.takes.filter((take) => take.dealer === dealer.id && take.present) : [];
  const toJudge = ownClips.filter((take) => take.status === 'att granska' || take.status === 'granska igen').length;
  const tone = (ok: boolean, some: boolean): string => (ok ? 'var(--yes)' : some ? 'var(--warn)' : 'var(--no)');
  const next = dealer.next[0];

  return (
    <section className="panel dealercard">
      <header>
        <h3>{dealer.name}</h3>
        <span className={playable.length > 0 ? 'badge yes' : 'badge wait'}>{playable.length > 0 ? `spelbar ur ${playable.map((view) => viewLabel(view.view)).join(', ')}` : 'inte spelbar än'}</span>
        <code>{dealer.file}</code>
        <a className="btn small" href={routeTo('dealer', dealer.id)}>
          Hela kartan i Dealer →
        </a>
      </header>
      {dealer.problems.map((text) => (
        <p key={text} className="warning">
          {text}
        </p>
      ))}
      <ol className="journey">
        <li>
          <a href={routeTo('dealer', dealer.id)} style={{ '--c': tone(identityOk === needed.length, identityOk > 0) } as CSSProperties}>
            <span className="jstage">Identitet</span>
            <b>
              {identityOk} av {needed.length} godkända
            </b>
            <small>bilderna som bär hennes likhet</small>
          </a>
        </li>
        <li>
          <a href={routeTo('dealer', dealer.id)} style={{ '--c': tone(anchored.length > 0 && anchored.length === dealer.views.length, anchored.length > 0) } as CSSProperties}>
            <span className="jstage">Ankare</span>
            <b>{anchored.length > 0 ? anchored.map((view) => `${anchorName(view.anchor!.file)} ur ${viewLabel(view.view)}`).join(', ') : 'inget godkänt'}</b>
            <small>en stillbild per vy, som klippen börjar och slutar på</small>
          </a>
        </li>
        <li>
          <a href={routeTo('klipp')} style={{ '--c': tone(series.length > 0 && series.every((one) => one.approved === one.total && one.laterApproved === one.later), series.some((one) => one.approved > 0)) } as CSSProperties}>
            <span className="jstage">Film</span>
            <b>{series.map((one) => `${viewLabel(one.view.view)}: ${one.approved} av ${one.total} kort${one.later > 0 ? `, senare ${one.laterApproved} av ${one.later}` : ''}`).join('; ') || 'ingen serie'}</b>
            <small>ett godkänt klipp per kort i serien</small>
          </a>
        </li>
        <li>
          <a href={routeTo('granska', 'clips-filmer')} style={{ '--c': tone(toJudge === 0, true) } as CSSProperties}>
            <span className="jstage">Granska</span>
            <b>{toJudge === 0 ? 'inga klipp väntar' : `${toJudge} klipp väntar på omdöme`}</b>
            <small>{ownClips.length} klipp i registret</small>
          </a>
        </li>
        <li>
          <a href="/casino/" style={{ '--c': tone(playable.length > 0, false) } as CSSProperties}>
            <span className="jstage">Spela</span>
            <b>{playable.length > 0 ? 'spelbar i Casinot' : 'inte spelbar än'}</b>
            <small>en runda mot spelkärnan</small>
          </a>
        </li>
      </ol>
      {next && (
        <div className="nextstep">
          <span className="label">Nästa steg</span> {next.what}
          {next.commands.slice(0, 1).map((command) => (
            <pre key={command} className="command">
              {command}
            </pre>
          ))}
        </div>
      )}
    </section>
  );
}
