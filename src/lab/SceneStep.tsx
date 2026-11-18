// Steget Scen: bord, sko och dealer i en vald bakgrund. Här ser Jakob bakgrunderna där de ska användas,
// vrider runt i miljön och sätter sitt omdöme på dem. Härifrån sparas också förlagor: scenen som bild eller klipp ur en vy.

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildScene, type Background, type Dealer, type FilmNote, type SceneHandle, type View } from '../scene/build.ts';
import { readScene, type SceneDescription } from '../scene/description.ts';
import { seatsOf } from '../scene/geometry.ts';
import { backdropItems, backdropKind, dealerChoices, PLAIN, sameLook, startLook, type Look } from './backdrops.ts';
import { saveForlaga, type Saved } from './forlaga.ts';
import { fetchRegistry, mediaUrl, saveComment, saveStatus, thumbUrl, type Asset, type Item, type Registry } from './registry.ts';
import { routeTo } from './route.ts';
import { Verdict, type Judge } from './Verdict.tsx';
import { Words, type Say } from './Words.tsx';
import './scene.css';

const STEP = 'scen';
// Första dealern. Tills dealerns egen fil finns i content/ står hennes id här.
const DEALER = 'paulina';
// Kortet scenen lägger där ett klipp har lagt sitt märkkort. Tills spelkärnan säger vilket kort det är står ett ess här.
const SHOWN_CARD = 'A♠';
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
  // Dealern som visas, som registrets file. Tom innan något är valt: då gäller den förvalda.
  const [dealerFile, setDealerFile] = useState('');
  const [paused, setPaused] = useState(false);
  // Scenen som visas, så att en förlaga kan sparas ur den.
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  // En förlaga som sparas just nu: hur många rutor som är inne. Och den som sparades senast.
  const [saving, setSaving] = useState<{ still: boolean; done: number; of: number } | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  const choose = (next: View) => {
    setView(next);
    setMoved(false);
  };
  const onMoved = useCallback(() => setMoved(true), []);
  const viewName = view.kind === 'spelaren' ? 'Spelaren' : `Plats ${view.seat}`;

  // Adressen är scen/<nummer>, med samma nummer som bakgrunden har i Granska. Utan nummer visas den första.
  const items = backdropItems(registry);
  const chosen = items.find((item) => item.number === Number(route[0])) ?? items[0];
  const dealers = dealerChoices(registry, DEALER);
  // Från början visas den första dealerfilmen: en film före en stillbild.
  const choice = dealers.find((entry) => entry.dealer.file === dealerFile) ?? dealers[0] ?? null;
  // Den valda dealerfilmen är en följd med ett klipp, med scenens kort där klippet lägger sitt.
  const dealer: FilmNote | null = choice
    ? {
        kind: 'film',
        view: choice.dealer.view,
        clips: [{ file: choice.dealer.file, ...(choice.lands ? { card: { seat: choice.lands.seat, index: choice.lands.index, face: SHOWN_CARD, at: choice.lands.at } } : {}) }],
      }
    : null;

  // Ett fel som gällde förra bakgrunden ska inte stå kvar över nästa.
  const file = chosen?.asset.file;
  useEffect(() => onProblem(null), [file, onProblem]);

  const { captureHeight, radius } = scene.room;
  const start = chosen ? startLook(chosen.asset, { lift: scene.background.liftDeg, height: captureHeight, radius }) : null;
  const look = chosen && start ? (looks[chosen.asset.file] ?? start) : null;
  const change = (part: Partial<Look>) => {
    if (chosen && look) setLooks((all) => ({ ...all, [chosen.asset.file]: { ...look, ...part } }));
  };

  const round = chosen ? backdropKind(chosen.asset) === '360' : false;
  const background: Background | null =
    chosen && look && chosen.asset.present ? { url: mediaUrl(chosen.asset.file), kind: backdropKind(chosen.asset), ...look } : null;

  // Förlagan sparas ur den valda fasta vyn, också när musen har vridit bort från den, i förlagans egen ruta.
  const save = async (still: boolean) => {
    if (!handle || saving) return;
    setSaving({ still, done: 0, of: 0 });
    setSaved(null);
    onProblem(null);
    try {
      const order = {
        view,
        dealer,
        background: chosen && look && background ? { file: chosen.asset.file, kind: background.kind, ...look } : null,
        studio: null,
        shoe: !shoeHidden,
        frame: scene.forlaga.frame,
        fps: scene.forlaga.fps,
      };
      setSaved(await saveForlaga(handle, order, still, (done, of) => setSaving({ still, done, of })));
    } catch (error) {
      onProblem((error as Error).message);
    } finally {
      setSaving(null);
    }
  };

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
            dealer={dealer}
            paused={paused}
            background={background}
            view={view}
            shoe={!shoeHidden}
            onMoved={onMoved}
            onProblem={onProblem}
            onHandle={setHandle}
          />
        </div>

        {/* Medan en förlaga sparas står reglagen stilla: varje ruta ska ritas ur samma scen. */}
        <section className="scenecontrols" aria-label="Reglage" inert={saving !== null}>
          {problem && <p className="warning">{problem}</p>}
          {chosen && !chosen.asset.present && <p className="warning">Bakgrundens fil saknas i assets/.</p>}

          <div className="control">
            <span className="controlname">Dealer</span>
            <select
              className="pick"
              aria-label="Dealer"
              value={choice?.dealer.file ?? ''}
              onChange={(event) => {
                setDealerFile(event.currentTarget.value);
                setPaused(false);
              }}
            >
              {dealers.length === 0 && <option value="">Ingen dealer i registret</option>}
              {dealers.map((entry) => (
                <option key={entry.dealer.file} value={entry.dealer.file}>
                  {entry.label}
                </option>
              ))}
            </select>
            {choice?.film && (
              <button type="button" className="reset" aria-pressed={paused} onClick={() => setPaused(!paused)}>
                {paused ? 'Spela' : 'Pausa'}
              </button>
            )}
            <button type="button" className="reset" disabled={!handle} title={`Scenen ur ${viewName} som en bild, ${frameText(scene)}`} onClick={() => save(true)}>
              Spara bild
            </button>
            <button
              type="button"
              className="reset"
              disabled={!handle || !choice?.film}
              title={`Hela dealerns film ur ${viewName}, ruta för ruta, ${frameText(scene)}`}
              onClick={() => save(false)}
            >
              Spara klipp
            </button>
            <span className="controlhint" role="status">
              {saving
                ? saving.of > 0
                  ? `Sparar ruta ${saving.done} av ${saving.of} …`
                  : 'Börjar spara …'
                : saved
                  ? `Sparad: ${saved.file}${saved.seconds > 0 ? ` (${saved.frames} rutor, ${comma(saved.seconds)} s)` : ''}`
                  : `Förlagan sparas ur ${viewName}${moved ? ', inte ur den fria vyn' : ''}.`}
            </span>
          </div>

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
              {round && (
                <>
                  <Slider label="Höjd" unit=" m" min={0.5} max={4} step={0.05} value={look.height} onChange={(height) => change({ height })} />
                  <Slider label="Radie" unit=" m" min={3} max={40} step={0.5} value={look.radius} onChange={(radius) => change({ radius })} />
                </>
              )}
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
              Reglagen sparas inte än. De startar på bakgrundens värden ur gamla projektet, när posten har sådana, och rummets höjd,
              radie och lyft på scenens värden ({comma(captureHeight)} m, {comma(radius)} m och {comma(scene.background.liftDeg)}°).
              De gäller så länge sidan är öppen, och följer med i förlagans beskrivning.
            </li>
            <li>
              Spelaren är vyn man spelar i: ögat {comma(scene.player.height)} m över filten, i dealerns ögonhöjd,{' '}
              {comma(scene.player.distance)} m från hennes bordskant, {comma(scene.player.pitchDeg)}° nedåt med{' '}
              {comma(scene.player.fovDeg)}° bildvinkel. Plats 1–7 är samma öga flyttat till platsen. Bordet lutar{' '}
              {comma(scene.table.tilt.deg)}° mot spelaren, så att filten öppnar sig; kortplatserna, skon och dealerns händer lutar
              med det.
            </li>
            <li>
              {!choice
                ? 'Ingen dealer visas: registret har ingen dealerfilm för dealern.'
                : `Dealern är en dealerfilm: ”${choice.label}”, en ${choice.film ? 'film' : 'stillbild'} av dealern på grön skärm, gjord i närbilden av ${choice.dealer.view.kind === 'plats' ? `Plats ${choice.dealer.view.seat}` : 'Spelaren'}: samma öga som vyn, inzoomat på dealern. Bilden läggs tillbaka genom det ögat och viks vid bordskanten, så att kroppen står upprätt och händerna ligger på filten. Sedd ur den vyn är den bilden som den är; ur andra vyer är kroppen platt.${choice.lands ? ` När klippet har lagt sitt märkkort (${comma(choice.lands.at)} s in) tas det blå bort och scenens kort ligger på kortplatsen för plats ${choice.lands.seat}; valören är en stå-in.` : ''} Spara bild och Spara klipp lägger scenen ur vald vy i output/forlagor/, ${frameText(scene)}, med en beskrivning bredvid.`}
            </li>
            <li>
              {!round
                ? 'Platt bild: den visas som en kuliss rakt bakom dealern, så stor som spelarens ruta. Utanför den är det svart, och den har inget golv.'
                : `360-bilden visas som ett rum med golv. Golvet ligger där bordet står, och bilden antas vara tagen ${
                    look ? comma(look.height) : comma(captureHeight)
                  } m över golvet, rakt över eller under spelarens öga, med väggarna ${look ? comma(look.radius) : comma(radius)} m bort. Rummet förskjuts därför som ett rum gör när vyn flyttas. Höjd gör rummet större eller mindre mot bordet; Radie flyttar väggarna.${
                    look && look.lift > 0 ? ` Bilden är dessutom lyft ${comma(look.lift)}°; med golv i rummet behövs det inte.` : ''
                  } Under bordet ligger en mjuk skugga på golvet.`}{' '}
              Bord och sko har ett neutralt ljus; bakgrunden lyser inte på dem än. Skon står där den stod i de gamla ankarna; från
              sidan syns att den hänger utanför bordskanten.
            </li>
          </ul>
        </section>
      </main>

      <aside className="backdrops" aria-label="Bakgrunder" inert={saving !== null}>
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
  /**
   * Dealern, med scenens kort där klippet lägger sitt. Scenen byggs om när den byts mot en annan, inte när samma dealer
   * kommer som ett nytt värde.
   */
  dealer: Dealer | null;
  /** Om dealerns film står stilla. */
  paused: boolean;
  background: Background | null;
  view: View;
  shoe: boolean;
  onMoved: () => void;
  onProblem: (text: string) => void;
  /** Får scenen när den är byggd, och null när den stängs. */
  onHandle: (handle: SceneHandle | null) => void;
};

/** 3D-ytan. Den har kamerans sidförhållande och fyller så mycket av platsen som ryms. */
function Stage({ scene, dealer, paused, background, view, shoe, onMoved, onProblem, onHandle }: StageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  // Dealern som text: lika för två värden som säger samma sak.
  const dealerKey = JSON.stringify(dealer);

  useEffect(() => {
    const element = holder.current!;
    const built = buildScene(element, scene, { urlOf: mediaUrl, dealer: JSON.parse(dealerKey) as Dealer | null, onProblem, onMoved });
    const fit = () => built.resize(element.clientWidth, element.clientHeight);
    const watcher = new ResizeObserver(fit);
    watcher.observe(element);
    fit();
    setHandle(built);
    onHandle(built);
    return () => {
      watcher.disconnect();
      built.dispose();
      setHandle(null);
      onHandle(null);
    };
  }, [scene, dealerKey, onProblem, onMoved, onHandle]);

  // Bakgrunden lämnas över fält för fält, så att scenen bara får ett nytt besked när något faktiskt har ändrats.
  const { url, kind, turn, blur, exposure, mirror, lift, height: roomHeight, radius } = background ?? { url: null, kind: '360' as const, ...PLAIN, lift: 0, height: 0, radius: 0 };
  useEffect(() => {
    handle?.setBackground(url === null ? null : { url, kind, turn, blur, exposure, mirror, lift, height: roomHeight, radius });
  }, [handle, url, kind, turn, blur, exposure, mirror, lift, roomHeight, radius]);

  useEffect(() => {
    handle?.setView(view);
  }, [handle, view]);

  useEffect(() => {
    if (paused) handle?.clip?.pause();
    else handle?.clip?.play();
  }, [handle, paused]);

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

/** Förlagans ruta och takt i ord. */
const frameText = (scene: SceneDescription): string =>
  `${scene.forlaga.frame.width} × ${scene.forlaga.frame.height} bildpunkter i ${comma(scene.forlaga.fps)} rutor per sekund`;

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
