// Steget Kortplan: var korten ligger på bordet och hur stora de är, och hur fort dealerns klipp spelas. Jakob ställer
// spelarnas båge, dealerns rad, kortens storlek och klippens fart med reglage, ser planen rakt uppifrån och hela given ur
// Spelaren medan han ställer, och sparar talen genom servern: planen i content/scene.json, farten i content/runda.json.
// Talen och deras gränser står i src/scene/plan.ts; uppspelningen som lägger korten och spelar klippen efter dem är den
// enda (src/scene/build.ts, reel.ts), också i steget Scen, i Casinot och i runda.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildScene, type Background, type FilmNote, type SceneHandle } from '../scene/build.ts';
import { readScene, type FeltPoint, type SceneDescription } from '../scene/description.ts';
import type { DollDescription } from '../scene/dollPose.ts';
import { seatsOf, tablePosition } from '../scene/geometry.ts';
import { PLAN_LIMITS, planOf, samePlan, withPlan, type CardPlan } from '../scene/plan.ts';
import { backgroundOf, planPlace, readRound, spotPlace } from '../scene/round.ts';
import { roundChoices } from './backdrops.ts';
import { fetchAll, fetchContent, savePlan, type Content } from './content.ts';
import { fetchRegistry, mediaUrl, type Registry } from './registry.ts';
import './plan.css';

// Första dealern, som i steget Scen.
const DEALER = 'paulina';

const comma = (value: number, digits: number): string => value.toFixed(digits).replace('.', ',').replace(/^-(0,0*)$/, '$1');
const cm = (metres: number): string => `${comma(metres * 100, 1)} cm`;
const round4 = (value: number): number => Math.round(value * 10000) / 10000;

export default function PlanStep() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    fetchRegistry().then(setRegistry, (error: Error) => setProblem(error.message));
    fetchAll().then(setContent, (error: Error) => setProblem(error.message));
  }, []);
  if (!registry || !content) return <main className="notice">{problem ?? 'Läser kortplanen …'}</main>;
  const saved = planOf(content.scene);
  if (!saved) return <main className="notice">Scenen har ingen båge och rad att ställa (places.arc och places.row i content/scene.json).</main>;
  return <Workbench registry={registry} {...content} start={{ ...saved, speed: content.round.speed.clips }} problem={problem} onProblem={setProblem} />;
}

type WorkbenchProps = Content & { registry: Registry; start: Required<CardPlan>; problem: string | null; onProblem: (text: string | null) => void };

function Workbench({ registry, scene, doll, round, dealt, start, problem, onProblem }: WorkbenchProps) {
  // Det sparade i content/scene.json och content/runda.json, och det Jakob ställer. Scenen byggs en gång; planen och
  // farten ställs om i den medan given spelar.
  const [saved, setSaved] = useState<Required<CardPlan>>(start);
  const [draft, setDraft] = useState<Required<CardPlan>>(start);
  const [showPlaces, setShowPlaces] = useState(true);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  const planned = useMemo(() => withPlan(scene, draft), [scene, draft]);
  const changed = !samePlan(draft, saved);

  // Hela given ur Spelaren, som i steget Scen: rundan som spelkärnan har delat, med dealerns godkända klipp.
  const choice = useMemo(() => roundChoices(registry, DEALER, dealt, round, seatsOf(scene)).find((entry) => entry.view.kind === 'spelaren') ?? null, [registry, dealt, round, scene]);
  const room = registry.assets.find((entry) => entry.file === round.film.background);
  const background = useMemo<Background | null>(() => (room && room.present ? { ...backgroundOf(room, scene), url: mediaUrl(room.file) } : null), [room, scene]);
  // Där handen lägger korten i filmerna (registrets place), för varje kort i given som har ett klipp.
  const filmed = useMemo(
    () =>
      (choice?.dealer.clips ?? []).flatMap((clip) => {
        if (clip.file === null || !clip.card) return [];
        const place = spotPlace(scene, clip.card);
        return place ? [{ card: clip.card, place }] : [];
      }),
    [choice, scene],
  );

  const set = (change: (plan: Required<CardPlan>) => Required<CardPlan>) => {
    setDraft((plan) => change(plan));
    setSaid(null);
  };
  const save = async () => {
    setBusy(true);
    onProblem(null);
    try {
      const answer = await savePlan(draft);
      const plan = { ...answer, speed: answer.speed ?? draft.speed };
      setSaved(plan);
      setDraft(plan);
      setSaid(`Sparad ${new Date().toTimeString().slice(0, 5)}: kortplanen i content/scene.json och farten i content/runda.json. Labbet, Casinot och runda.ts spelar med dem från nästa gång de läser filerna.`);
    } catch (error) {
      onProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    onProblem(null);
    try {
      const [scene, round] = await Promise.all([fetchContent('scene.json', 'Scenens beskrivning', readScene), fetchContent('runda.json', 'Rundan', readRound)]);
      const plan = planOf(scene);
      if (!plan) throw new Error('Scenen har ingen båge och rad att ställa');
      const fresh = { ...plan, speed: round.speed.clips };
      setSaved(fresh);
      setDraft(fresh);
      setSaid('Återställd till det som står i content/scene.json och content/runda.json.');
    } catch (error) {
      onProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const again = () => {
    const clip = handle?.clip;
    if (clip) void clip.seek(0).then(() => clip.play());
  };

  const edge = scene.dealerEdge.z;
  const L = PLAN_LIMITS;
  const { glide } = scene.card.onTable;
  // Hur länge ett kort med klipp tar i given: klippens längder i registret, i farten som ställs.
  const lengths = (choice?.plan.dealt ?? []).flatMap((deal) => (deal.file !== null && deal.seconds > 0 ? [deal.seconds] : []));
  const span = (scale: number) => {
    if (lengths.length === 0) return null;
    const [low, high] = [comma(Math.min(...lengths) / scale, 1), comma(Math.max(...lengths) / scale, 1)];
    return low === high ? `${low} s` : `${low}–${high} s`;
  };
  return (
    <div className="planstep">
      <div className="planviews">
        <section className="planpane withlegend" aria-label="Kortplanen rakt uppifrån">
          <h2>Rakt uppifrån</h2>
          <PlanView scene={planned} doll={doll} filmed={filmed} />
          <p className="planlegend">
            <span className="legendpart">
              <span className="swatch plan" /> kortplanen, i kortens storlek på bordet ({comma(draft.scale, 2)} ×)
            </span>
            <span className="legendpart">
              <span className="swatch dealer" /> dealerns kort
            </span>
            <span className="legendpart">
              <span className="swatch filmed" /> där handen lägger kortet i filmerna; linjen är vägen kortet glider
            </span>
          </p>
        </section>
        <section className="planpane" aria-label="Hela given ur Spelaren">
          <h2>
            Ur Spelaren, hela given{' '}
            <button type="button" className="btn small" disabled={!handle?.clip} onClick={again}>
              ⟲ Börja om
            </button>
            <label className="check">
              <input type="checkbox" checked={showPlaces} onChange={(event) => setShowPlaces(event.currentTarget.checked)} />
              Kortplatserna
            </label>
          </h2>
          <div className="planscene">
            {choice ? (
              <Stage scene={scene} planned={planned} speed={draft.speed} doll={doll} dealer={choice.dealer} background={background} places={showPlaces} onProblem={onProblem} onHandle={setHandle} />
            ) : (
              <p className="notice">Registret har inga godkända cykelklipp ur Spelaren att spela.</p>
            )}
          </div>
        </section>
      </div>

      <section className="plancontrols" aria-label="Reglage" inert={busy}>
        {problem && <p className="problem">{problem}</p>}
        <div className="plangroups">
          <fieldset>
            <legend>Spelarnas kort (bågen)</legend>
            <Slider label="Mitt i sidled" range={L.centreX} value={draft.arc.centreX} show={cm} onChange={(centreX) => set((plan) => ({ ...plan, arc: { ...plan.arc, centreX } }))} />
            <Slider label="Från dealerns kant" range={L.depthFromEdge} value={draft.arc.depth - edge} show={cm} hint="plats 4:s första kort" onChange={(value) => set((plan) => ({ ...plan, arc: { ...plan.arc, depth: round4(value + edge) } }))} />
            <Slider label="Bredd, plats 1–7" range={L.width} value={draft.arc.width} show={cm} onChange={(width) => set((plan) => ({ ...plan, arc: { ...plan.arc, width } }))} />
            <Slider label="Böjning" range={L.bend} value={draft.arc.bend} show={cm} hint="ytterplatserna mot dealern; 0 är en rak linje" onChange={(bend) => set((plan) => ({ ...plan, arc: { ...plan.arc, bend } }))} />
            <Slider label="Rundning" range={L.round} step={0.1} value={draft.arc.round} show={(value) => comma(value, 1)} hint="1 är ett V, 2 rund, 4 platt i mitten" onChange={(value) => set((plan) => ({ ...plan, arc: { ...plan.arc, round: value } }))} />
            <Slider label="Nästa kort åt höger" range={L.arcStep.x} value={draft.arc.step[0]} show={cm} onChange={(x) => set((plan) => ({ ...plan, arc: { ...plan.arc, step: [x, plan.arc.step[1]] } }))} />
            <Slider label="Nästa kort mot spelaren" range={L.arcStep.z} value={draft.arc.step[1]} show={cm} onChange={(z) => set((plan) => ({ ...plan, arc: { ...plan.arc, step: [plan.arc.step[0], z] } }))} />
          </fieldset>
          <fieldset>
            <legend>Dealerns kort (raden)</legend>
            <Slider label="Första kortet i sidled" range={L.rowFirst.x} value={draft.row.first[0]} show={cm} onChange={(x) => set((plan) => ({ ...plan, row: { ...plan.row, first: [x, plan.row.first[1]] } }))} />
            <Slider label="Från dealerns kant" range={L.rowFirst.zFromEdge} value={draft.row.first[1] - edge} show={cm} onChange={(value) => set((plan) => ({ ...plan, row: { ...plan.row, first: [plan.row.first[0], round4(value + edge)] } }))} />
            <Slider label="Nästa kort åt höger" range={L.rowStep.x} value={draft.row.step[0]} show={cm} onChange={(x) => set((plan) => ({ ...plan, row: { ...plan.row, step: [x, plan.row.step[1]] } }))} />
            <Slider label="Nästa kort mot spelaren" range={L.rowStep.z} value={draft.row.step[1]} show={cm} onChange={(z) => set((plan) => ({ ...plan, row: { ...plan.row, step: [plan.row.step[0], z] } }))} />
          </fieldset>
          <fieldset>
            <legend>Korten och farten</legend>
            <Slider label="Storlek på bordet" range={L.scale} step={0.01} value={draft.scale} show={(value) => `${comma(value, 2)} ×`} hint={`1 är filmens kort, ${cm(scene.card.width)} × ${cm(scene.card.height)}`} onChange={(scale) => set((plan) => ({ ...plan, scale }))} />
            <Slider
              label="Klippens fart"
              range={L.speed}
              step={0.05}
              value={draft.speed}
              show={(value) => `${comma(value, 2)} ×`}
              hint="1 är som klippen är filmade, 2 dubbelt så fort. Vänta-klippet och kort utan klipp går alltid i sin egen takt."
              onChange={(speed) => set((plan) => ({ ...plan, speed }))}
            />
            {span(1) && (
              <p className="hint">
                Ett kort med klipp tar {span(draft.speed)} (filmat {span(1)}).
              </p>
            )}
            <div className="planbuttons">
              <button type="button" className="btn primary" disabled={!changed || busy} title="Kortplanen i content/scene.json och farten i content/runda.json" onClick={save}>
                Spara
              </button>
              <button type="button" className="btn" disabled={busy} onClick={reset}>
                Återställ till det sparade
              </button>
            </div>
            <p className="hint" role="status">
              {busy ? 'Arbetar …' : (said ?? (changed ? 'Ändrat men inte sparat: det syns här, men inte i steget Scen, Casinot eller runda.ts förrän det är sparat.' : 'Som det står i content/scene.json och content/runda.json.'))}
            </p>
          </fieldset>
        </div>
        <details className="more">
          <summary>Vad som gäller direkt, och vad som kräver nya filmer</summary>
        <div className="plannotes">
          <p>
            <strong>Gäller direkt, också för filmerna som redan finns:</strong> var korten ligger på bordet och hur stora de är. Kortet
            landar där dealerns hand lade det i filmen, i filmens storlek, och när handen har släppt det och lyft ({comma(glide.after, 1)} s
            efter att det landat) glider det på {comma(glide.seconds, 1)} s till sin plats i planen och sin storlek. Är planen densamma
            som när filmen gjordes rör sig ingenting. I luften har kortet alltid filmens storlek.
          </p>
          <p>
            <strong>Farten gäller också direkt:</strong> dealerns klipp spelas så många gånger fortare än de är filmade, och allt som hör
            till klippets tid följer med: när kortet landar och märkkortet byts mot scenens kort, glidningen (tiderna ovan delas med farten)
            och bytet till nästa klipp. Vänta-klippet, när dealern väntar på spelet, och kort utan klipp går alltid i sin egen takt.
          </p>
          <p>
            <strong>Kräver nya filmer:</strong> var dealerns hand lägger kortet. Dockan, förlagorna och nya tagningar följer den sparade
            planen, men i en film som redan är gjord lägger handen kortet där den gjorde då (de streckade korten uppifrån), och kortet
            glider sedan därifrån. Ju längre bort planen ligger, desto längre glider kortet.
          </p>
        </div>
        </details>
      </section>
    </div>
  );
}

type SliderProps = {
  label: string;
  range: readonly [number, number];
  step?: number;
  value: number;
  show: (value: number) => string;
  hint?: string;
  onChange: (value: number) => void;
};

/** Ett reglage inom talets gränser (plan.ts), med värdet i ord bredvid. Talet avrundas till 0,1 mm, som i filen. */
function Slider({ label, range, step = 0.0005, value, show, hint, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={range[0]} max={range[1]} step={step} value={value} onChange={(event) => onChange(round4(Number(event.currentTarget.value)))} />
      <output>{show(value)}</output>
      {hint && <small className="what">{hint}</small>}
    </label>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Planen rakt uppifrån: x åt höger, spelarna nedåt och dealern uppåt, i millimeter. Bordet som på ett olutat bord.

type PlanViewProps = { scene: SceneDescription; doll: DollDescription; filmed: { card: { seat: number | 'D'; index: number }; place: FeltPoint }[] };

const MM = 1000;

function PlanView({ scene, doll, filmed }: PlanViewProps) {
  const edge = scene.dealerEdge.z;
  const { width, height } = scene.card;
  const size = scene.card.onTable.scale;
  // Utsnittet står still medan planen ställs: filten där kortplanens gränser kan lägga kort (plan.ts), från skon bakom
  // dealerns kant till en bit förbi det djupaste.
  const view = { x: -1, z: edge - 0.2, w: 2, h: PLAN_LIMITS.depthFromEdge[1] + 0.3 };
  const at = tablePosition(scene);
  const { min, max } = scene.table.model.box;
  const card = (place: FeltPoint, scale: number) => ({ x: (place[0] - (width * scale) / 2) * MM, y: (place[1] - (height * scale) / 2) * MM, width: width * scale * MM, height: height * scale * MM });
  // Skon: fotens mitt, vriden kring lodlinjen (build.ts), lika bred som höljet i content/doll.json.
  const yaw = (scene.shoe.yawDeg * Math.PI) / 180;
  const half = { across: doll.shoeEnvelope.halfWidth * scene.shoe.length, along: scene.shoe.length / 2 };
  const shoe = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => {
    const across = a! * half.across;
    const along = b! * half.along;
    return [(scene.shoe.at[0] + across * Math.cos(yaw) + along * Math.sin(yaw)) * MM, (scene.shoe.at[1] - across * Math.sin(yaw) + along * Math.cos(yaw)) * MM];
  });
  const seats = scene.places.seats;
  return (
    <svg className="planview" viewBox={`${view.x * MM} ${view.z * MM} ${view.w * MM} ${view.h * MM}`} role="img" aria-label="Bord, sko och kortplatser rakt uppifrån">
      <rect className="planfelt" x={(at[0] + min[0]) * MM} y={(at[2] + min[2]) * MM} width={(max[0] - min[0]) * MM} height={(max[2] - min[2]) * MM} rx={60} />
      <line className="planedge" x1={view.x * MM} x2={(view.x + view.w) * MM} y1={edge * MM} y2={edge * MM} />
      <text className="plantext" x={(view.x + 0.02) * MM} y={(edge - 0.015) * MM}>
        dealerns bordskant (vecket)
      </text>
      <polygon className="planshoe" points={shoe.map((point) => point.join(',')).join(' ')} />
      <text className="plantext" x={scene.shoe.at[0] * MM} y={scene.shoe.at[1] * MM} textAnchor="middle" dominantBaseline="middle">
        skon
      </text>
      {/* Där handen lägger korten i filmerna, och vägen därifrån till planen. */}
      {filmed.map(({ card: spot, place }, order) => {
        const target = planPlace(scene, spot);
        return (
          <g key={`${spot.seat}/${spot.index}/${order}`}>
            <rect className="planfilmed" {...card(place, 1)} rx={3.5} />
            {target && Math.hypot(target[0] - place[0], target[1] - place[1]) > 0.001 && (
              <line className="planglide" x1={place[0] * MM} y1={place[1] * MM} x2={target[0] * MM} y2={target[1] * MM} />
            )}
          </g>
        );
      })}
      {scene.places.dealer.map((place, index) => (
        <rect key={`D${index}`} className="plandealer" {...card(place, size)} rx={3.5 * size} />
      ))}
      <text className="planlabel" x={scene.places.dealer[0]![0] * MM - ((width * size) / 2) * MM} y={(scene.places.dealer[0]![1] + (height * size) / 2) * MM + 34}>
        D
      </text>
      {seats.map((seat) => (
        <g key={seat.seat}>
          {seat.cards.map((place, index) => (
            <rect key={index} className="plancard" {...card(place, size)} rx={3.5 * size} />
          ))}
          <text className="planlabel" x={seat.cards[0]![0] * MM - ((width * size) / 2) * MM} y={(seat.cards[0]![1] + (height * size) / 2) * MM + 34}>
            {seat.seat}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenen ur Spelaren med hela given. Den byggs med den sparade scenen och får planen och farten som ställs (setPlan,
// setSpeed) utan att byggas om.

type StageProps = {
  scene: SceneDescription;
  planned: SceneDescription;
  /** Farten dealerns klipp spelas i, som den ställs. */
  speed: number;
  doll: DollDescription;
  dealer: FilmNote;
  background: Background | null;
  places: boolean;
  onProblem: (text: string) => void;
  onHandle: (handle: SceneHandle | null) => void;
};

function Stage({ scene, planned, speed, doll, dealer, background, places, onProblem, onHandle }: StageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  const dealerKey = JSON.stringify(dealer);
  const problem = useCallback((text: string) => onProblem(text), [onProblem]);

  useEffect(() => {
    const element = holder.current!;
    const built = buildScene(element, scene, { urlOf: mediaUrl, dealer: JSON.parse(dealerKey) as FilmNote, doll, onProblem: problem });
    const fit = () => built.resize(element.clientWidth, element.clientHeight);
    const watcher = new ResizeObserver(fit);
    watcher.observe(element);
    fit();
    built.setView({ kind: 'spelaren' });
    built.setShoe(true);
    setHandle(built);
    onHandle(built);
    return () => {
      watcher.disconnect();
      built.dispose();
      setHandle(null);
      onHandle(null);
    };
  }, [scene, doll, dealerKey, problem, onHandle]);

  useEffect(() => {
    void handle?.setBackground(background);
  }, [handle, background]);
  useEffect(() => {
    handle?.setPlan(planned);
  }, [handle, planned]);
  useEffect(() => {
    handle?.setSpeed(speed);
  }, [handle, speed]);
  useEffect(() => {
    handle?.setPlaces(places);
  }, [handle, places]);

  const { width, height } = scene.camera.frame;
  return <div ref={holder} className="planstage" role="img" aria-label="Scenen ur Spelaren" style={{ aspectRatio: `${width} / ${height}`, width: `min(100cqw, 100cqh * ${width} / ${height})` }} />;
}
