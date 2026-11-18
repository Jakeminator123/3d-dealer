// En fil i full storlek, med allt registret vet om den bredvid.

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { formatBytes, mediaUrl, type Asset, type Item, type Registry, type Section } from './registry.ts';
import { Verdict, type Judge } from './Verdict.tsx';
import { Words, type Say } from './Words.tsx';

const ModelPreview = lazy(() => import('./ModelPreview.tsx'));

type Props = {
  item: Item;
  section: Section;
  registry: Registry;
  close: string;
  previous?: string;
  next?: string;
  onJudge: Judge;
  onSay: Say;
};

export function Detail({ item, section, registry, close, previous, next, onJudge, onSay }: Props) {
  const { asset, kind } = item;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const busy = ['VIDEO', 'INPUT', 'SELECT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName);
      // Esc i en textruta lämnar rutan (och sparar orden) i stället för att stänga bilden.
      if (event.key === 'Escape' && busy) (event.target as HTMLElement).blur();
      else if (event.key === 'Escape') window.location.hash = close;
      else if (busy) return;
      else if (event.key === 'ArrowLeft' && previous) window.location.hash = previous;
      else if (event.key === 'ArrowRight' && next) window.location.hash = next;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, previous, next]);

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label={asset.title}>
      <header className="detailbar">
        <span className="where">
          {section.label} {item.number} av {section.items.length}
        </span>
        <span className="name">{asset.file.slice(asset.file.lastIndexOf('/') + 1)}</span>
        <span className="spacer" />
        <Step href={previous} title="Föregående (vänsterpil)">
          ← Föregående
        </Step>
        <Step href={next} title="Nästa (högerpil)">
          Nästa →
        </Step>
        <a className="nav" href={close} title="Stäng (Esc)">
          Stäng
        </a>
      </header>

      <div className="stagewrap">
        {!asset.present ? (
          <p className="notice">Filen saknas i assets/.</p>
        ) : kind === 'bild' ? (
          <ImageStage asset={asset} />
        ) : kind === 'film' ? (
          <FilmStage asset={asset} />
        ) : (
          <Suspense fallback={<p className="notice">Läser modellen …</p>}>
            <ModelPreview url={mediaUrl(asset.file)} />
          </Suspense>
        )}
      </div>

      <Info asset={asset} registry={registry} onJudge={onJudge} onSay={onSay} />
    </div>
  );
}

function Step({ href, title, children }: { href?: string; title: string; children: ReactNode }) {
  return href ? (
    <a className="nav" href={href} title={title}>
      {children}
    </a>
  ) : (
    <span className="nav off">{children}</span>
  );
}

/** Bilden inpassad i ytan. Ett klick visar den pixel för pixel kring den punkt man klickade på. */
function ImageStage({ asset }: { asset: Asset }) {
  const stage = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element || !zoom) return;
    element.scrollLeft = zoom.x * element.scrollWidth - element.clientWidth / 2;
    element.scrollTop = zoom.y * element.scrollHeight - element.clientHeight / 2;
  }, [zoom]);

  const toggle = (event: MouseEvent<HTMLImageElement>) => {
    if (zoom) return setZoom(null);
    const box = event.currentTarget.getBoundingClientRect();
    setZoom({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height });
  };

  return (
    <div ref={stage} className={zoom ? 'stage full' : 'stage fit'}>
      <img src={mediaUrl(asset.file)} alt={asset.title} draggable={false} onClick={toggle} />
    </div>
  );
}

const RATES = [0.25, 0.5, 1, 2];

/** Filmen i full fart, långsamt och ruta för ruta. */
function FilmStage({ asset }: { asset: Asset }) {
  const video = useRef<HTMLVideoElement>(null);
  const fps = asset.fps ?? 30;
  const [frame, setFrame] = useState(0);
  const [frames, setFrames] = useState(0);
  const [rate, setRate] = useState(1);

  const frameAt = (seconds: number) => Math.floor(seconds * fps + 0.001);

  const step = (direction: number) => {
    const element = video.current;
    if (!element) return;
    element.pause();
    const last = Math.max(Math.round(element.duration * fps) - 1, 0);
    const target = Math.min(Math.max(frameAt(element.currentTime) + direction, 0), last);
    // Sikta mitt i rutan, så att avrundning inte hamnar i rutan bredvid.
    element.currentTime = (target + 0.5) / fps;
    setFrame(target);
  };

  const speed = (value: number) => {
    setRate(value);
    if (video.current) video.current.playbackRate = value;
  };

  return (
    <div className="film">
      <video
        ref={video}
        src={mediaUrl(asset.file)}
        controls
        autoPlay
        muted
        loop
        playsInline
        onLoadedMetadata={(event) => setFrames(Math.round(event.currentTarget.duration * fps))}
        onTimeUpdate={(event) => setFrame(frameAt(event.currentTarget.currentTime))}
        onSeeked={(event) => setFrame(frameAt(event.currentTarget.currentTime))}
      />
      <div className="filmbar">
        <button type="button" onClick={() => step(-1)}>
          ← Ruta
        </button>
        <span className="frame">
          Ruta {frame + 1}
          {frames > 0 && ` av ${frames}`}
        </span>
        <button type="button" onClick={() => step(1)}>
          Ruta →
        </button>
        <span className="spacer" />
        {RATES.map((value) => (
          <button key={value} type="button" aria-pressed={rate === value} onClick={() => speed(value)}>
            {String(value).replace('.', ',')}×
          </button>
        ))}
        {asset.fps === undefined && <span className="frame">{fps} rutor/s antaget</span>}
      </div>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  dealer: 'Dealer',
  kind: 'Typ',
  pose: 'Pose',
  grip: 'Grepp',
  licence: 'Licens',
  author: 'Upphov',
  page: 'Källsida',
  oldRole: 'Roll i gamla projektet',
  oldState: 'Läge i gamla projektet',
  oldView: 'Visning i gamla projektet',
};

const SOURCE_LABELS: Record<string, string> = {
  path: 'Sökväg där',
  taskId: 'Task-id',
  model: 'Modell',
  imageSize: 'Bildstorlek',
  ratio: 'Format',
  references: 'Referenser',
  prompt: 'Text',
  sha256: 'sha256',
};

// Fält som visas på egen plats i panelen och därför inte i den allmänna listan.
const PLACED = new Set([
  'file', 'group', 'title', 'status', 'statusBy', 'statusAt', 'note', 'present', 'source',
  'comment', 'commentAt', 'reply', 'replyAt',
  'width', 'height', 'bytes', 'seconds', 'fps',
]);

type InfoProps = { asset: Asset; registry: Registry; onJudge: Judge; onSay: Say };

function Info({ asset, registry, onJudge, onSay }: InfoProps) {
  const source = asset.source ?? {};
  const from = typeof source.from === 'string' ? source.from : undefined;
  const comma = (value: number) => String(value).replace('.', ',');

  return (
    <aside className="info">
      <h2>{asset.title}</h2>
      <Verdict registry={registry} asset={asset} onJudge={onJudge} />
      <p className="meaning">
        {registry.statuses[asset.status] ?? asset.status}
        {asset.statusBy && <span className="by">{asset.statusBy}</span>}
      </p>
      <Words registry={registry} asset={asset} onSay={onSay} always />
      {asset.note && <p className="note">{asset.note}</p>}

      <dl>
        <Row label="Fil">
          <code>assets/{asset.file}</code>
        </Row>
        {asset.width && asset.height && (
          <Row label="Mått">
            {asset.width} × {asset.height} px
          </Row>
        )}
        {asset.seconds !== undefined && (
          <Row label="Längd">
            {comma(asset.seconds)} s{asset.fps !== undefined && `, ${comma(asset.fps)} rutor/s`}
          </Row>
        )}
        {asset.bytes !== undefined && <Row label="Storlek">{formatBytes(asset.bytes)}</Row>}
        {Object.entries(asset)
          .filter(([field]) => !PLACED.has(field))
          .map(([field, value]) => (
            <Row key={field} label={FIELD_LABELS[field] ?? field}>
              <Value value={value} />
            </Row>
          ))}
      </dl>

      <h3>Ursprung</h3>
      <dl>
        {from && <Row label="Från">{registry.sources[from]?.what ?? from}</Row>}
        {Object.entries(source)
          .filter(([field]) => field !== 'from')
          .map(([field, value]) => (
            <Row key={field} label={SOURCE_LABELS[field] ?? field}>
              {field === 'sha256' ? <code>{String(value)}</code> : <Value value={value} />}
            </Row>
          ))}
      </dl>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Value({ value }: { value: unknown }): ReactNode {
  if (typeof value === 'string') {
    return /^https?:\/\//.test(value) ? (
      <a href={value} target="_blank" rel="noreferrer">
        {value}
      </a>
    ) : (
      value
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return (
      <ul>
        {value.map((entry, index) => (
          <li key={index}>
            <Value value={entry} />
          </li>
        ))}
      </ul>
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([field, inner]) => `${field}: ${typeof inner === 'object' ? JSON.stringify(inner) : String(inner)}`)
      .join(' · ');
  }
  return null;
}
