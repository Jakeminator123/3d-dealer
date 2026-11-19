// Steget Klipp: varje tagning bredvid dockans förlaga den gjordes efter, startade och stoppade tillsammans och i samma
// takt, med omdömet (som Jakob kan sätta här, med sina ord om vad som inte är naturligt), det mätta och beställningen.
// Fliken Underlaget visar scenens tal och vad ett videojobb är.
// Tagningarna och paketens filer kommer från servern (/api/tagningar och /tagning/, src/server/tagningar.ts). Steget
// skriver bara omdömet och orden, genom servern som Granska.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { fetchContent } from './content.ts';
import { NumberGroup } from './NumberGroup.tsx';
import { axesText, jobGroups, judgedValue, megabytes, num, point, sceneGroups, withUnit } from './numbers.ts';
import { fetchRegistry, saveComment, saveStatus, sectionsOf, type Registry } from './registry.ts';
import { Verdict, type Judge } from './Verdict.tsx';
import { Words, type Say } from './Words.tsx';
import { routeTo } from './route.ts';
import { anchorName, cardKey, cardName, cardWords, cycleLabel, framesOf, viewLabel, viewWord } from './names.ts';
import { clipUrl, fetchTakes, groupTakes, sentWords, takeUrl, type Take, type TakeGroup, type Takes } from './takes.ts';
import './clip.css';

const STEP = 'klipp';
const TAL = 'underlag';

type Json = any;
type DealerView = { view: string; anchor: { file: string } | null };
type Loaded = {
  takes: Takes;
  registry: Registry;
  scene: SceneDescription;
  raw: { scene: Json; doll: Json; runda: Json; tagning: Json };
  anchors: Record<string, string | null>;
  current: Set<string>;
  abouts: Record<string, string | undefined>;
};

const rawContent = (file: string) => fetchContent<Json>(file, file, (value) => value);
const statusClass = (status: string): string => (status === 'godkänd' ? 'yes' : status === 'utgår' ? 'no' : 'wait');
const statusWord = (status: string): string => (status === 'utgår' ? 'underkänd' : status);

async function load(): Promise<Loaded> {
  const [takes, registry, dealersResponse, scene, sceneJson, doll, runda, tagning] = await Promise.all([
    fetchTakes(),
    fetchRegistry(),
    fetch('/api/dealers', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : [])),
    fetchContent('scene.json', 'Scenens beskrivning', readScene),
    rawContent('scene.json'),
    rawContent('doll.json'),
    rawContent('runda.json'),
    rawContent('tagning.json'),
  ]);
  const anchors: Record<string, string | null> = {};
  for (const dealer of (Array.isArray(dealersResponse) ? dealersResponse : []) as { views: DealerView[] }[]) {
    for (const view of dealer.views) if (!(view.view in anchors) || view.anchor) anchors[view.view] = view.anchor?.file ?? null;
  }
  const moves = [...new Set(takes.takes.map((take) => take.move).filter((move): move is string => typeof move === 'string'))];
  const abouts = Object.fromEntries(
    await Promise.all(moves.map(async (move) => [move, await rawContent(`moves/${move}.json`).then((one) => (typeof one?.about === 'string' ? one.about : undefined), () => undefined)] as const)),
  );
  return { takes, registry, scene, raw: { scene: sceneJson, doll, runda, tagning }, anchors, current: new Set(Object.values(anchors).filter((file): file is string => !!file)), abouts };
}

export default function ClipStep({ route }: { route: string[] }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    load().then(setData, (error: Error) => setProblem(error.message));
  }, []);
  // Ett omdöme eller Jakobs ord sparas genom servern, och sedan läses tagningarna om, så att läget syns överallt i steget.
  const keep = useCallback((saving: Promise<Registry>) => {
    saving.then(
      () => load().then(setData, (error: Error) => setProblem(error.message)),
      (error: Error) => setProblem(error.message),
    );
  }, []);
  const judge = useCallback<Judge>((file, status) => keep(saveStatus(file, status)), [keep]);
  const say = useCallback<Say>((file, comment) => keep(saveComment(file, comment)), [keep]);

  const groups = useMemo(() => (data ? groupTakes(data.takes.takes, data.current) : []), [data]);
  const ordered = useMemo(() => groups.flatMap((group) => group.takes), [groups]);
  const review = useMemo(() => {
    const where = new Map<string, string>();
    if (data) for (const section of sectionsOf(data.registry)) for (const item of section.items) where.set(item.asset.file, routeTo('granska', item.section, item.number));
    return where;
  }, [data]);

  if (!data) return <main className="notice">{problem ?? 'Läser tagningarna …'}</main>;
  if (ordered.length === 0)
    return (
      <main className="main clipstep">
        <div className="emptystate">
          <b>Inga tagningar med paket än</b>
          En tagning förbereds i steget Dockan, eller med <code>node src/pipeline/tagning.ts forbered</code>, och beställs av agenten.
        </div>
      </main>
    );

  const numbers = route[0] === TAL;
  const wanted = numbers ? route[1] : route[0];
  const at = Math.max(0, ordered.findIndex((take) => take.id === wanted));
  const take = ordered[at]!;
  const previous = ordered[(at - 1 + ordered.length) % ordered.length]!;
  const next = ordered[(at + 1) % ordered.length]!;
  const cycle = (move: string | null) => cycleLabel(move, move ? data.abouts[move] : undefined);
  const groupName = (group: TakeGroup) => `${viewLabel(group.view)} · ${anchorName(group.anchor)} · ${cycle(group.move)}${group.current ? '' : ' (äldre ankare)'}`;
  const to = (id: string) => routeTo(STEP, ...(numbers ? [TAL] : []), id);
  const picker = (
    <div className="picker">
      <a className="btn icon" href={to(previous.id)} aria-label="Föregående tagning">
        ‹
      </a>
      <select className="select" aria-label="Välj tagning" value={take.id} onChange={(event) => void (window.location.hash = to(event.currentTarget.value))}>
        {groups.map((group) => (
          <optgroup key={group.key} label={groupName(group)}>
            {group.takes.map((one) => (
              <option key={one.id} value={one.id}>
                {`${cardName(one.seat, one.index, one.action)} t${one.take ?? '?'}${one.variant ? ` ${one.variant}` : ''} · ${statusWord(one.status)}${one.archived ? ', arkiverad' : ''}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <a className="btn icon" href={to(next.id)} aria-label="Nästa tagning">
        ›
      </a>
      <span className="count">
        {at + 1} av {ordered.length}
      </span>
    </div>
  );

  return (
    <div className="clipstep">
      <aside className="side takelist" aria-label="Tagningarna">
        {groups.map((group) => (
          <section key={group.key}>
            <h3>{groupName(group)}</h3>
            {group.takes.map((one) => (
              <a key={one.id} className="section" href={to(one.id)} aria-current={one.id === take.id ? 'page' : undefined}>
                {cardName(one.seat, one.index, one.action)} t{one.take ?? '?'}{one.variant ? ` ${one.variant}` : ''}
                <span className={`badge ${statusClass(one.status)}`}>{statusWord(one.status)}</span>
              </a>
            ))}
          </section>
        ))}
      </aside>
      <main className="main">
        <nav className="tabs" aria-label="Klipp">
          <a href={routeTo(STEP, take.id)} aria-current={numbers ? undefined : 'page'}>
            Klipp mot docka
          </a>
          <a href={routeTo(STEP, TAL, take.id)} aria-current={numbers ? 'page' : undefined}>
            Scenen i tal och videojobbet
          </a>
        </nav>
        {picker}
        {numbers ? (
          <Numbers data={data} sample={take} cycle={cycle} />
        ) : (
          <>
            <Compare key={take.id} take={take} rate={rate} setRate={setRate} />
            {problem && <p className="problem">{problem}</p>}
            <Facts take={take} cycle={cycle} review={review.get(take.file)} registry={data.registry} onJudge={judge} onSay={say} />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Filmen och dockan i samma takt

function Compare({ take, rate, setRate }: { take: Take; rate: number; setRate: (rate: number) => void }) {
  const [top, setTop] = useState<'film' | 'bevis'>('film');
  const [playing, setPlaying] = useState(false);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const pos = useRef<HTMLSpanElement>(null);
  const running = useRef(false);
  const fps = take.film?.fps ?? 24;
  const frames = take.film?.frames ?? null;
  const film = top === 'bevis' && take.files.includes('bevis.mp4') ? takeUrl(take.id, 'bevis.mp4') : clipUrl(take);
  // Till höger dockans film, som klippet mäts mot, eller det klipp som skickades som referens i dess ställe.
  const [right, setRight] = useState<'docka' | 'klipp'>('docka');
  const sentClip = take.sent.kind === 'klipp' && take.files.includes('referensklipp.mp4');
  const doll = right === 'klipp' && sentClip ? takeUrl(take.id, 'referensklipp.mp4') : take.files.includes('referens.mp4') ? takeUrl(take.id, 'referens.mp4') : null;
  const rightWords =
    right === 'klipp' && sentClip
      ? 'Referensklippet, som skickades i stället för dockans film'
      : take.sent.kind === 'docka'
        ? 'Dockans film, som skickades som rörelsereferens'
        : take.sent.kind === 'klipp'
          ? 'Dockans film: skickades inte, ett klipp var referens'
          : 'Dockans film: skickades inte, ingen film var referens';

  const frameOf = (t: number): number => {
    const k = Math.floor(t * fps + 0.001);
    return frames ? Math.max(0, Math.min(frames - 1, k)) : Math.max(0, k);
  };
  const dollTime = (t: number): number => {
    const length = b.current?.duration;
    return length && Number.isFinite(length) ? Math.min(t, Math.max(0, length - 0.001)) : t;
  };
  const show = () => {
    const t = a.current?.currentTime ?? 0;
    if (pos.current) pos.current.textContent = `ruta ${frameOf(t) + 1}${frames ? ` av ${frames}` : ''} · ${num(t, 2)} s`;
  };

  const speed = useRef(rate);
  speed.current = rate;
  useEffect(() => {
    for (const video of [a.current, b.current]) if (video) video.playbackRate = rate;
  }, [rate]);
  useEffect(
    () => () => {
      running.current = false;
    },
    [],
  );

  // Filmen leder; dockan följer den, och står på sin sista ruta när filmen är längre. En liten skillnad tas igen med
  // dockans fart (högst en femtedel fortare eller långsammare), en stor med ett hopp, så att dockan inte hackar.
  const follow = () => {
    if (!running.current || !a.current || !b.current) return;
    const film = a.current;
    const doll = b.current;
    const t = film.currentTime;
    const end = Number.isFinite(doll.duration) ? doll.duration - 0.03 : Infinity;
    if (t < end && !doll.seeking) {
      const behind = t - doll.currentTime;
      if (Math.abs(behind) > 0.25) doll.currentTime = t;
      doll.playbackRate = speed.current * (1 + Math.max(-0.2, Math.min(0.2, behind * 2)));
      if (doll.paused) void doll.play().catch(() => {});
    }
    show();
    requestAnimationFrame(follow);
  };
  const start = () => {
    if (!a.current) return;
    running.current = true;
    setPlaying(true);
    a.current.playbackRate = rate;
    if (b.current) {
      b.current.playbackRate = rate;
      b.current.currentTime = dollTime(a.current.currentTime);
      void b.current.play().catch(() => {});
    }
    a.current.play().then(
      () => requestAnimationFrame(follow),
      () => {
        running.current = false;
        setPlaying(false);
      },
    );
  };
  const stop = () => {
    running.current = false;
    setPlaying(false);
    a.current?.pause();
    b.current?.pause();
    if (a.current && b.current) b.current.currentTime = dollTime(a.current.currentTime);
    show();
  };
  const step = (delta: number) => {
    if (running.current) stop();
    if (!a.current) return;
    const k = frameOf(a.current.currentTime) + delta;
    const t = (Math.max(0, frames ? Math.min(frames - 1, k) : k) + 0.5) / fps;
    a.current.currentTime = t;
    if (b.current) b.current.currentTime = dollTime(t);
    show();
  };

  return (
    <section className="compare">
      <div className="pair">
        <figure>
          <figcaption>
            <span>{top === 'bevis' ? 'Beviset: klippet lagt i scenen' : 'Filmen'}</span>
            {take.files.includes('bevis.mp4') && (
              <span className="seg small" role="group" aria-label="Överst">
                <button type="button" aria-pressed={top === 'film'} onClick={() => setTop('film')}>
                  Filmen
                </button>
                <button type="button" aria-pressed={top === 'bevis'} onClick={() => setTop('bevis')}>
                  I scenen
                </button>
              </span>
            )}
          </figcaption>
          <div className="screen">
            {film ? (
              <video key={film} ref={a} src={`${film}#t=0.001`} muted playsInline loop preload="auto" disablePictureInPicture onLoadedMetadata={(event) => { event.currentTarget.playbackRate = rate; show(); }} onSeeked={show} />
            ) : (
              <span className="placeholder">Klippets fil finns inte</span>
            )}
          </div>
        </figure>
        <figure>
          <figcaption>
            <span>{rightWords}</span>
            {sentClip ? (
              <span className="seg small" role="group" aria-label="Till höger">
                <button type="button" aria-pressed={right === 'docka'} onClick={() => setRight('docka')}>
                  Dockan
                </button>
                <button type="button" aria-pressed={right === 'klipp'} onClick={() => setRight('klipp')}>
                  Referensklippet
                </button>
              </span>
            ) : (
              <span className="dim">{take.reference?.frames ? `${take.reference.frames} rutor` : ''}</span>
            )}
          </figcaption>
          <div className="screen">{doll ? <video key={doll} ref={b} src={`${doll}#t=0.001`} muted playsInline preload="auto" disablePictureInPicture onLoadedMetadata={(event) => void (event.currentTarget.playbackRate = rate)} /> : <span className="placeholder">Paketet har ingen film av dockan</span>}</div>
        </figure>
      </div>
      <div className="controls">
        <button type="button" className="btn primary" onClick={() => (playing ? stop() : start())} disabled={!film}>
          {playing ? 'Stoppa' : 'Spela båda'}
        </button>
        <button type="button" className="btn" aria-pressed={rate !== 1} onClick={() => setRate(rate === 1 ? 0.5 : 1)}>
          Halv fart
        </button>
        <button type="button" className="btn" onClick={() => step(-1)} aria-label="En ruta bakåt" disabled={!film}>
          ‹ Ruta
        </button>
        <button type="button" className="btn" onClick={() => step(1)} aria-label="En ruta framåt" disabled={!film}>
          Ruta ›
        </button>
        <span className="frame" ref={pos} aria-live="polite" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Det som står om tagningen

function Facts({ take, cycle, review, registry, onJudge, onSay }: { take: Take; cycle: (move: string | null) => string; review?: string; registry: Registry; onJudge: Judge; onSay: Say }) {
  // Tagningens post i registret, när klippet står där: då går omdömet att sätta här.
  const asset = take.present ? registry.assets.find((entry) => entry.file === take.file) : undefined;
  const [whole, setWhole] = useState(false);
  const why = take.statusBy ?? '';
  const long = why.length > 320;
  const judged = take.judged;
  const shown = (key: string) => judged?.shown.find((one) => one.key === key);
  const measure = (key: string, label: string) => {
    const one = shown(key);
    return { label, value: one ? judgedValue(one.value, one.unit) : 'mättes inte för den här tagningen', limit: one?.limit ?? '', verdict: one?.verdict ?? '' };
  };
  const lands = take.times?.clip?.lands;
  const dollLands = take.times?.doll?.lands;
  const ligger = shown('kortetLigger');
  const measures = judged
    ? [
        measure('takt', 'Takten: största steg mot grannarnas'),
        measure('kortetsMitt', 'Kortets mitt mot sista bilden'),
        measure('kortetsOverlapp', 'Kortets överlapp med sista bildens märkkort'),
        {
          label: 'När kortet ligger',
          value: typeof lands === 'number' ? `${withUnit(lands, 's')} in i klippet; dockan ${withUnit(dollLands, 's')}` : 'mättes inte för den här tagningen',
          limit: ligger ? `skillnaden ${judgedValue(ligger.value, ligger.unit)}, gräns ${ligger.limit}` : '',
          verdict: ligger?.verdict ?? '',
        },
      ]
    : [];
  const outside = judged?.shown.filter((one) => one.verdict !== 'inom') ?? [];
  const order = take.order;
  const film = take.film;
  const view = viewWord(take.view);

  return (
    <section className="facts">
      <div className="bar">
        <h2>
          {cardName(take.seat, take.index, take.action)} t{take.take ?? '?'}{take.variant ? ` · variant ${take.variant}` : ''}
        </h2>
        <span className={`badge ${statusClass(take.status)}`}>{statusWord(take.status)}</span>
      </div>
      <p className="dim">
        {cardWords(take.seat, take.index, take.action)}; cykel {cycle(take.move)}, ur {viewLabel(view)}, ankaret {anchorName(take.anchor)}
        {take.anchor ? ` (${take.anchor.split('/').at(-1)})` : ''}.
      </p>
      <p className="frameline">
        Börjar på <b>{framesOf(take.anchor, take.seat, take.index, take.action).first}</b> och slutar på <b>{framesOf(take.anchor, take.seat, take.index, take.action).last}</b>. Referensen: {sentWords(take.sent)}.
      </p>
      <p>
        <code>{take.file}</code> {review && take.present ? <a className="link" href={review}>Öppna i Granska</a> : null}{' '}
        {take.move && (
          <a className="link" href={routeTo('docka', 'varden', take.move, cardKey(take.seat, take.index, take.action))}>
            Se rörelsen i Dockan
          </a>
        )}
      </p>
      {take.archived && (
        <p className="warning">
          Arkiverad {take.archived.at ?? ''}: {take.archived.why}
        </p>
      )}

      <h2>Omdömet</h2>
      {asset && (
        <div className="clipjudge">
          <span className="label">Ditt omdöme, och vad som inte är naturligt</span>
          <Verdict registry={registry} asset={asset} onJudge={onJudge} />
          <Words key={asset.file} registry={registry} asset={asset} onSay={onSay} always />
        </div>
      )}
      <p>
        <span className={`badge ${statusClass(take.status)}`}>{statusWord(take.status)}</span> {take.statusAt ? `satt ${take.statusAt}` : 'inget datum'}
      </p>
      <p className={long && !whole ? 'why clamp' : 'why'}>{why ? `Dömd av: ${why}` : 'Inget omdöme med motivering än.'}</p>
      {long && (
        <button type="button" className="btn quiet small more" onClick={() => setWhole(!whole)}>
          {whole ? 'Visa mindre' : 'Visa hela motiveringen'}
        </button>
      )}
      {take.comment && <p className="reply"><b>Jakob:</b> {take.comment}</p>}
      {take.reply && <p className="reply"><b>Svar:</b> {take.reply}</p>}

      <h2>Mätt <span>{judged ? `${judged.inside} av ${judged.total} mått inom sina gränser` : 'paketet har inga mått'}</span></h2>
      <ul className="measures">
        {measures.map((one) => (
          <li key={one.label}>
            <b>{one.label}</b>
            <span>
              {one.value}
              {one.verdict && one.verdict !== 'inom' ? <em> · {one.verdict}</em> : null}
            </span>
            {one.limit && <small>{one.limit.startsWith('skillnaden') ? one.limit : `gräns ${one.limit}`}</small>}
          </li>
        ))}
      </ul>
      {judged && (
        <>
          <h2>Utanför sin gräns <span>{outside.length === 0 ? 'inga' : outside.length}</span></h2>
          {outside.length > 0 && (
            <ul className="measures">
              {outside.map((one) => (
                <li key={one.key}>
                  <b>{one.what}</b>
                  <span>
                    {judgedValue(one.value, one.unit)} <em>· {one.verdict}</em>
                  </span>
                  <small>gräns {one.limit}</small>
                </li>
              ))}
            </ul>
          )}
          <p className="dim">Ett mått utanför sin gräns underkänner inte tagningen; granskaren ser på den och dömer.</p>
        </>
      )}

      <h2>Beställningen</h2>
      <p>
        {order
          ? `${order.model}, ${order.seconds === null ? 'längden saknas' : `${order.seconds} s`}, ${order.credits === null ? 'krediterna saknas' : `${order.credits} krediter`} (${order.basis || 'grund saknas'}), ${order.received ? 'togs emot' : 'i registret'} ${order.at ?? 'utan datum'}, tagning ${take.take ?? '?'}.`
          : `Beställningen saknas i registret. Paketet bad om ${take.request.model ?? '?'}, ${take.request.duration ?? '?'} s.`}
      </p>
      <dl className="format">
        <dt>Filmen</dt>
        <dd>{film ? `${film.width ?? '?'} × ${film.height ?? '?'} bp, ${withUnit(film.fps, 'rutor/s')}, ${num(film.frames)} rutor, ${withUnit(film.seconds, 's')}, ${film.codec ?? '?'}, ${film.audio ? 'med ljud' : 'utan ljud'}, ${megabytes(take.bytes)}` : 'inte mätt'}</dd>
        <dt>Referensen</dt>
        <dd>
          {sentWords(take.sent)}
          {take.sent.kind === 'klipp' ? `${take.sent.role ? ` (${take.sent.role})` : ''}: ${withUnit(take.sent.fps, 'rutor/s')}, ${num(take.sent.frames)} rutor, ${withUnit(take.sent.seconds, 's')}` : ''}
        </dd>
        <dt>Dockans film</dt>
        <dd>
          {take.reference ? `${withUnit(take.reference.fps, 'rutor/s')}, ${num(take.reference.frames)} rutor, ${withUnit(take.reference.seconds, 's')}` : 'saknas i beställningen'}
          {take.sent.kind !== 'docka' && take.reference ? '; skickades inte, men klippet mäts mot den' : ''}
        </dd>
        <dt>Kortplatsen</dt>
        <dd>{point(take.place)} (x; z på filten)</dd>
        <dt>Paketet</dt>
        <dd>
          <code>output/tagningar/{take.id}/</code>
        </dd>
      </dl>
      {take.files.includes('ark.jpg') && (
        <details className="sheet">
          <summary>Arket: rutor ur filmen</summary>
          <img src={takeUrl(take.id, 'ark.jpg')} alt={`Rutor ur ${cardName(take.seat, take.index, take.action)} t${take.take ?? '?'}`} loading="lazy" />
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Underlaget: scenen i tal och videojobbet

function Numbers({ data, sample, cycle }: { data: Loaded; sample: Take; cycle: (move: string | null) => string }) {
  const input = { raw: data.raw, scene: data.scene, assets: data.registry.assets, anchors: data.anchors, takes: data.takes.takes, cycle };
  const scene = useMemo(() => sceneGroups(input), [data]);
  const job = jobGroups(data.raw.tagning, data.takes.takes, sample, cycle);
  return (
    <section className="numbers">
      <h2>Koordinaterna</h2>
      <p>{axesText(input)}</p>
      <p className="dim">Varje tal står med sin enhet. Märket säger om filen kallar värdet mätt eller antaget; tal utan märke är räknade ur de andra eller lästa ur registret.</p>
      {scene.map((group) => (
        <NumberGroup key={group.id} group={group} />
      ))}
      <h2 className="part">Videojobbet</h2>
      <p className="dim">Videojobbets egna mått gäller den valda tagningen; välj en annan i listan.</p>
      {job.map((group) => (
        <NumberGroup key={group.id} group={group} />
      ))}
    </section>
  );
}
