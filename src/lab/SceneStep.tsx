// Steget Scen: bord, sko och dealer i en vald bakgrund. Här ser Jakob bakgrunderna där de ska användas,
// vrider runt i miljön och sätter sitt omdöme på dem.

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildScene, type Background, type SceneHandle, type View } from '../scene/build.ts';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { seatsOf } from '../scene/geometry.ts';
import { backdropItems, backdropKind, PLAIN, sameLook, standIn, startLook, type Look } from './backdrops.ts';
import { fetchRegistry, mediaUrl, saveComment, saveStatus, thumbUrl, type Asset, type Item, type Registry } from './registry.ts';
import { routeTo } from './route.ts';
import { Verdict, type Judge } from './Verdict.tsx';
import { Words, type Say } from './Words.tsx';
import './scene.css';

const STEP = 'scen';
// Första dealern. Tills dealerns egen fil finns i content/ står hennes id här.
const DEALER = 'paulina';
// Skon visas från början: framifrån, i spelarens vy, står den där dealern har den vid sin vänstra hand.
// Att den hänger utanför bordskanten syns först från sidan, och då går den att dölja.
const SHOE_HIDDEN = false;

const comma = (value: number): string => String(value).replace('.', ',');

async function fetchScene(): Promise<SceneDescription> {
  const response = await fetch('/content/scene.json');
  if (!response.ok) throw new Error(`Scenens beskrivning gick inte att läsa (${response.status})`);
  return readScene(await response.json());
}

export default function SceneStep({ route }: { route: string[] }) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [scene, setScene] = useState<SceneDescription | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Registret och scenens beskrivning läses var för sig: de står i olika filer och den ena kan saknas utan den andra.
  useEffect(() => {
    fetchRegistry().then(setRegistry, (error: Error) => setProblem(error.message));
  }, []);
  useEffect(() => {
    fetchScene().then(setScene, (error: Error) => setProblem(error.message));
  }, []);

  // Omdömen och Jakobs ord sparas av servern, som svarar med registret så som det står efteråt.
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

  if (!registry || !scene) return <main className="notice">{problem ?? 'Läser scenen …'}</main>;
  return (
    <Workbench registry={registry} scene={scene} route={route} problem={problem} onProblem={setProblem} onJudge={judge} onSay={say} />
  );
}

type WorkbenchProps = {
  registry: Registry;
  scene: SceneDescription;
  route: string[];
  problem: string | null;
  onProblem: (text: string | null) => void;
  onJudge: Judge;
  onSay: Say;
};

function Workbench({ registry, scene, route, problem, onProblem, onJudge, onSay }: WorkbenchProps) {
  // Den valda vyn. Ett nytt värde ställer scenen i vyn, också när det är samma vy som förut.
  const [view, setView] = useState<View>({ kind: 'spelaren' });
  // Sant när man med musen har vridit eller zoomat bort från den valda vyn.
  const [moved, setMoved] = useState(false);
  const [shoeHidden, setShoeHidden] = useState(SHOE_HIDDEN);
  // Reglagens värden per bakgrund. De lever så länge sidan är öppen och sparas inte.
  const [looks, setLooks] = useState<Record<string, Look>>({});

  const choose = (next: View) => {
    setView(next);
    setMoved(false);
  };
  const onMoved = useCallback(() => setMoved(true), []);
  const viewName = view.kind === 'spelaren' ? 'Spelaren' : view.kind === 'filmkameran' ? 'Filmkameran' : `Plats ${view.seat}`;

  // Adressen är scen/<nummer>, med samma nummer som bakgrunden har i Granska. Utan nummer visas den första.
  const items = backdropItems(registry);
  const chosen = items.find((item) => item.number === Number(route[0])) ?? items[0];
  const dealer = standIn(registry, DEALER);

  // Ett fel som gällde förra bakgrunden ska inte stå kvar över nästa.
  const file = chosen?.asset.file;
  useEffect(() => onProblem(null), [file, onProblem]);

  const start = chosen ? startLook(chosen.asset, scene.background.liftDeg) : null;
  const look = chosen && start ? (looks[chosen.asset.file] ?? start) : null;
  const change = (part: Partial<Look>) => {
    if (chosen && look) setLooks((all) => ({ ...all, [chosen.asset.file]: { ...look, ...part } }));
  };

  const background: Background | null =
    chosen && look && chosen.asset.present ? { url: mediaUrl(chosen.asset.file), kind: backdropKind(chosen.asset), ...look } : null;

  return (
    <div className="scenestep">
      <main className="scenemain">
        <header className="scenehead">
          {chosen ? (
            <>
              <div className="scenetitle">
                <span className="scenenumber">{chosen.number}</span>
                <h1>{chosen.asset.title}</h1>
                {chosen.asset.note && <p className="scenenote">{chosen.asset.note}</p>}
              </div>
              {/* Omdömet och Jakobs egna ord om bakgrunden, intill scenen han ser den i. Rutan är bakgrundens egen: den byts med bakgrunden. */}
              <div className="scenejudge">
                <Verdict registry={registry} asset={chosen.asset} onJudge={onJudge} />
                <Words key={chosen.asset.file} registry={registry} asset={chosen.asset} onSay={onSay} always />
              </div>
            </>
          ) : (
            <h1>Registret har inga bakgrunder</h1>
          )}
        </header>

        <div className="sceneview">
          <Stage
            scene={scene}
            dealer={dealer?.file ?? null}
            background={background}
            view={view}
            shoe={!shoeHidden}
            onMoved={onMoved}
            onProblem={onProblem}
          />
        </div>

        <section className="scenecontrols" aria-label="Reglage">
          {problem && <p className="warning">{problem}</p>}
          {chosen && !chosen.asset.present && <p className="warning">Bakgrundens fil saknas i assets/.</p>}

          <div className="control">
            <span className="controlname">Vy</span>
            <div className="filters" role="group" aria-label="Vy">
              <button
                type="button"
                aria-pressed={!moved && view.kind === 'spelaren'}
                title="Spelarens öga: vyn man spelar i"
                onClick={() => choose({ kind: 'spelaren' })}
              >
                Spelaren
              </button>
              {seatsOf(scene).map((seat) => (
                <button
                  key={seat}
                  type="button"
                  aria-pressed={!moved && view.kind === 'plats' && view.seat === seat}
                  title={seat === scene.camera.seat ? 'Samma öga som Spelaren' : `Spelarens öga flyttat till plats ${seat}`}
                  onClick={() => choose({ kind: 'plats', seat })}
                >
                  Plats {seat}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={!moved && view.kind === 'filmkameran'}
                title="Kameran dealerns bilder är gjorda genom: härifrån ska dealern se ut som i sin bild"
                onClick={() => choose({ kind: 'filmkameran' })}
              >
                Filmkameran
              </button>
              <button type="button" aria-pressed={moved} title="Fri vy från det du ser" onClick={() => setMoved(true)}>
                Fri
              </button>
            </div>
            {moved && (
              <button type="button" className="reset" onClick={() => choose({ ...view })}>
                Tillbaka till {viewName}
              </button>
            )}
            <span className="controlhint">Dra i scenen för att vrida, hjulet zoomar, högerknappen flyttar.</span>
            <label className="check">
              <input type="checkbox" checked={shoeHidden} onChange={(event) => setShoeHidden(event.currentTarget.checked)} />
              Dölj skon
            </label>
          </div>

          {look && start && (
            <div className="control">
              <span className="controlname">Bakgrund</span>
              <Slider label="Vrid" unit="°" min={-180} max={180} step={1} value={look.turn} onChange={(turn) => change({ turn })} />
              <Slider label="Lyft" unit="°" min={0} max={45} step={1} value={look.lift} onChange={(lift) => change({ lift })} />
              <Slider label="Oskärpa" min={0} max={30} step={0.5} value={look.blur} onChange={(blur) => change({ blur })} />
              <Slider label="Ljusstyrka" min={0.05} max={2} step={0.01} value={look.exposure} onChange={(exposure) => change({ exposure })} />
              <label className="check">
                <input type="checkbox" checked={look.mirror} onChange={(event) => change({ mirror: event.currentTarget.checked })} />
                Spegelvänd
              </label>
              <button type="button" className="reset" disabled={sameLook(look, start)} onClick={() => change(start)}>
                Återställ
              </button>
            </div>
          )}

          <ul className="scenenotes">
            <li>
              Reglagen sparas inte än. De startar på bakgrundens värden ur gamla projektet, när posten har sådana, och lyftet på
              scenens värde ({comma(scene.background.liftDeg)}°). De gäller så länge sidan är öppen.
            </li>
            <li>
              Spelaren är vyn man spelar i: ögat {comma(scene.player.height)} m över filten, i dealerns ögonhöjd,{' '}
              {comma(scene.player.distance)} m från hennes bordskant, {comma(scene.player.pitchDeg)}° nedåt med{' '}
              {comma(scene.player.fovDeg)}° bildvinkel. Plats 1–7 är samma öga flyttat till platsen. Bordet lutar{' '}
              {comma(scene.table.tilt.deg)}° mot spelaren, så att filten öppnar sig; kortplatserna, skon och dealerns händer lutar
              med det.
            </li>
            <li>
              {dealer
                ? `Dealern är en stå-in ur gamla rutan: ankaret ”${dealer.title}”, projicerat från filmkameran och vikt vid bordskanten. Filmkameran är kameran de gamla ankarna är gjorda genom (${comma(Math.round(scene.camera.pitchDeg))}° nedåt): därifrån ser dealern ut som i ankarbilden, så när som på händerna, som bordets lutning flyttar några bildpunkter. Skon i den bilden är övermålad där scenens sko står.`
                : `Ingen dealer visas: registret har inget ankare i vila för ${DEALER}.`}
            </li>
            <li>
              {chosen && backdropKind(chosen.asset) === 'platt'
                ? 'Platt bild: den visas som en kuliss rakt bakom dealern, så stor som spelarens ruta. Utanför den är det svart.'
                : `360-bilden ligger oändligt långt bort: den vrids med vyn men förskjuts inte när ögat flyttas. Spelarens öga står i dealerns ögonhöjd, så olyft ligger horisonten bakom hennes huvud.${
                    look && look.lift > 0
                      ? ` Bilden är lyft ${comma(look.lift)}°: då syns mer av väggarna och mindre av golvet. Lyftet gäller i alla vyer; lodräta linjer står kvar lodräta, men horisonten buktar svagt nedåt mot rutans kanter.`
                      : ''
                  }`}{' '}
              Bord och sko har ett neutralt ljus; bakgrunden lyser inte på dem än. Skon står där den stod i ankarbilden; från sidan
              syns att den hänger utanför bordskanten.
            </li>
          </ul>
        </section>
      </main>

      <aside className="backdrops" aria-label="Bakgrunder">
        <h2>
          Bakgrunder <span>{items.length}</span>
        </h2>
        {items.map((item) => (
          <BackdropCard key={item.asset.file} item={item} registry={registry} current={item === chosen} onJudge={onJudge} />
        ))}
      </aside>
    </div>
  );
}

type StageProps = {
  scene: SceneDescription;
  dealer: string | null;
  background: Background | null;
  view: View;
  shoe: boolean;
  onMoved: () => void;
  onProblem: (text: string) => void;
};

/** 3D-ytan. Den har kamerans sidförhållande och fyller så mycket av platsen som ryms. */
function Stage({ scene, dealer, background, view, shoe, onMoved, onProblem }: StageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<SceneHandle | null>(null);

  useEffect(() => {
    const element = holder.current!;
    const built = buildScene(element, scene, { urlOf: mediaUrl, dealer, onProblem, onMoved });
    const fit = () => built.resize(element.clientWidth, element.clientHeight);
    const watcher = new ResizeObserver(fit);
    watcher.observe(element);
    fit();
    setHandle(built);
    return () => {
      watcher.disconnect();
      built.dispose();
      setHandle(null);
    };
  }, [scene, dealer, onProblem, onMoved]);

  // Bakgrunden lämnas över fält för fält, så att scenen bara får ett nytt besked när något faktiskt har ändrats.
  const { url, kind, turn, blur, exposure, mirror, lift } = background ?? { url: null, kind: '360' as const, ...PLAIN };
  useEffect(() => {
    handle?.setBackground(url === null ? null : { url, kind, turn, blur, exposure, mirror, lift });
  }, [handle, url, kind, turn, blur, exposure, mirror, lift]);

  useEffect(() => {
    handle?.setView(view);
  }, [handle, view]);

  useEffect(() => {
    handle?.setShoe(shoe);
  }, [handle, shoe]);

  const { width, height } = scene.camera.frame;
  return (
    <div
      ref={holder}
      className="scenestage"
      role="img"
      aria-label="Scenen i 3D"
      style={{ aspectRatio: `${width} / ${height}`, width: `min(100cqw, 100cqh * ${width} / ${height})` }}
    />
  );
}

type SliderProps = {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

function Slider({ label, unit = '', min, max, step, value, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <output>
        {comma(value)}
        {unit}
      </output>
    </label>
  );
}

const KIND_LABELS = { '360': '360-bild', platt: 'Platt bild' };

function BackdropCard({ item, registry, current, onJudge }: { item: Item; registry: Registry; current: boolean; onJudge: Judge }) {
  const { asset } = item;
  const card = useRef<HTMLElement>(null);

  // Den valda bakgrunden hålls synlig i listan, också när adressen pekar ut en som ligger långt ner.
  useEffect(() => {
    if (current) card.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <article ref={card} className="backdrop" data-status={asset.status} aria-current={current ? 'true' : undefined}>
      <a className="backdroppick" href={routeTo(STEP, item.number)} aria-label={`Visa ${asset.title} i scenen`}>
        <span className="backdropthumb">
          {asset.present ? <img src={thumbUrl(asset.file, 320)} alt="" loading="lazy" /> : <span className="placeholder">Filen saknas</span>}
          <span className="number">{item.number}</span>
        </span>
        <span className="backdroptext">
          <span className="title">{asset.title}</span>
          <span className="file">{facts(asset)}</span>
        </span>
      </a>
      <Verdict registry={registry} asset={asset} onJudge={onJudge} />
    </article>
  );
}

function facts(asset: Asset): string {
  const size = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
  return [KIND_LABELS[backdropKind(asset)], size].filter(Boolean).join(' · ');
}
