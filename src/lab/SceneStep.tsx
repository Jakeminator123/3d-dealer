// Steget Scen: bord, sko och dealer i en vald bakgrund. Här ser Jakob bakgrunderna där de ska användas,
// vrider runt i miljön och sätter sitt omdöme på dem, och ser dealern lägga ett kort eller hela given. Härifrån sparas
// också förlagor: scenen som bild eller klipp ur en vy.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureHeightOf } from '../scene/backdrop.ts';
import { buildScene, type Background, type Dealer, type FilmNote, type SceneHandle, type View } from '../scene/build.ts';
import type { SceneDescription } from '../scene/description.ts';
import type { DollDescription } from '../scene/dollPose.ts';
import { seatsOf } from '../scene/geometry.ts';
import { anchorName, dealName, waitClip } from '../scene/round.ts';
import { backdropItems, backdropKind, dealerChoices, PLAIN, roundChoices, sameLook, startLook, type Look } from './backdrops.ts';
import { fetchAll, type Content } from './content.ts';
import { saveForlaga, type Saved } from './forlaga.ts';
import { fetchRegistry, mediaUrl, saveComment, saveStatus, thumbUrl, type Asset, type Item, type Registry } from './registry.ts';
import { anchorName as coded, shownText } from './names.ts';
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

export default function SceneStep({ route }: { route: string[] }) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Registret och beskrivningarna läses var för sig: de står i olika filer och det ena kan saknas utan det andra.
  useEffect(() => {
    fetchRegistry().then(setRegistry, (error: Error) => setProblem(error.message));
  }, []);
  useEffect(() => {
    fetchAll().then(setContent, (error: Error) => setProblem(error.message));
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

  if (!registry || !content) return <main className="notice">{problem ?? 'Läser scenen …'}</main>;
  return (
    <Workbench registry={registry} {...content} route={route} problem={problem} onProblem={setProblem} onJudge={judge} onSay={say} />
  );
}

type WorkbenchProps = Content & {
  registry: Registry;
  route: string[];
  problem: string | null;
  onProblem: (text: string | null) => void;
  onJudge: Judge;
  onSay: Say;
};

function Workbench({ registry, scene, doll, round, dealt, route, problem, onProblem, onJudge, onSay }: WorkbenchProps) {
  // Den valda vyn. Ett nytt värde ställer scenen i vyn, också när det är samma vy som förut.
  const [view, setView] = useState<View>({ kind: 'spelaren' });
  // Om vyn visas som sin närbild: samma öga, inzoomat på dealern, där dealerns filmer görs.
  const [close, setClose] = useState(false);
  const shown = useMemo<View>(() => (close ? { ...view, close: true } : view), [view, close]);
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
  const viewName = `${view.kind === 'spelaren' ? 'Spelaren' : `Plats ${view.seat}`}${close ? ', närbild' : ''}`;

  // Adressen är scen/<nummer>, med samma nummer som bakgrunden har i Granska. Utan nummer visas den första.
  const items = backdropItems(registry);
  const chosen = items.find((item) => item.number === Number(route[0])) ?? items[0];
  const dealers = dealerChoices(registry, DEALER);
  // Hela given ur varje vy där dealern har cykelklipp: rundan som spelkärnan har delat, så som runda.ts och Casinot
  // spelar den (src/scene/round.ts).
  const rounds = roundChoices(registry, DEALER, dealt, round, seatsOf(scene));
  // Från början visas hela given, och utan den den första dealerfilmen: en film före en stillbild.
  const roundChoice = rounds.find((entry) => entry.key === dealerFile) ?? (dealerFile === '' ? (rounds[0] ?? null) : null);
  const choice = roundChoice ? null : (dealers.find((entry) => entry.dealer.file === dealerFile) ?? dealers[0] ?? null);
  // Hela given är en följd av klipp med scenens kort kvar på bordet; ett valt klipp är en följd med ett klipp, lagt genom
  // ögat det är gjort i, och dess kort landar där handen lade det och går sedan till kortplanen, som i hela given.
  const { eye, shoe, place } = choice?.made ?? {};
  // När hela given har spelat klart väntar dealern med vänta-klippet ur givens ankare, ett varv eller fler som täcker
  // rundans hold, och sedan börjar given om. Utan vänta-klipp står sista rutan kvar under hold.
  const wait = roundChoice ? waitClip(registry.assets, DEALER, roundChoice.view, roundChoice.plan.anchor) : null;
  const dealer: FilmNote | null = roundChoice
    ? { ...roundChoice.dealer, ...(wait ? { wait } : {}) }
    : choice
      ? {
          kind: 'film',
          view: choice.dealer.view,
          clips: [{ file: choice.dealer.file, ...(choice.lands ? { card: { seat: choice.lands.seat, index: choice.lands.index, face: SHOWN_CARD, at: choice.lands.at, ...(place ? { place } : {}) } } : {}) }],
          ...(eye ? { eye } : {}),
          ...(shoe ? { shoe } : {}),
        }
      : null;
  const playing = roundChoice !== null || choice?.film === true;
  const madeIn = (dealer?.view.kind === 'plats' ? `Plats ${dealer.view.seat}` : 'Spelaren');
  // Ställer dealerns film på början och spelar den, om den inte är pausad.
  const again = () => {
    const clip = handle?.clip;
    if (!clip) return;
    void clip.seek(0).then(() => {
      if (!paused) clip.play();
    });
  };

  // Ett fel som gällde förra bakgrunden ska inte stå kvar över nästa.
  const file = chosen?.asset.file;
  useEffect(() => onProblem(null), [file, onProblem]);

  const { captureHeight, radius } = scene.room;
  // Höjden är bakgrundens egen när scenen har en (room.captureHeights), annars scenens.
  const start = chosen ? startLook(chosen.asset, { lift: scene.background.liftDeg, height: captureHeightOf(scene, chosen.asset.file), radius }) : null;
  const look = chosen && start ? (looks[chosen.asset.file] ?? start) : null;
  const change = (part: Partial<Look>) => {
    if (chosen && look) setLooks((all) => ({ ...all, [chosen.asset.file]: { ...look, ...part } }));
  };

  const sphere = chosen ? backdropKind(chosen.asset) === '360' : false;
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
        view: shown,
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
                <span className="label">
                  Bakgrund {chosen.number} av {items.length}
                </span>
                <h2>{chosen.asset.title}</h2>
                {chosen.asset.note && <p className="hint">{chosen.asset.note}</p>}
              </div>
              {/* Omdömet och Jakobs egna ord om bakgrunden, intill scenen han ser den i. Rutan är bakgrundens egen: den byts med bakgrunden. */}
              <div className="scenejudge">
                <span className="label">Ditt omdöme om bakgrunden</span>
                <Verdict registry={registry} asset={chosen.asset} onJudge={onJudge} />
                <Words key={chosen.asset.file} registry={registry} asset={chosen.asset} onSay={onSay} always />
              </div>
            </>
          ) : (
            <h2>Registret har inga bakgrunder</h2>
          )}
        </header>

        <div className="sceneview">
          <Stage
            scene={scene}
            doll={doll}
            dealer={dealer}
            paused={paused}
            background={background}
            view={shown}
            shoe={!shoeHidden}
            onMoved={onMoved}
            onProblem={onProblem}
            onHandle={setHandle}
          />
        </div>

        {/* Medan en förlaga sparas står reglagen stilla: varje ruta ska ritas ur samma scen. */}
        <section className="scenecontrols" aria-label="Reglage" inert={saving !== null}>
          {problem && <p className="problem">{problem}</p>}
          {chosen && !chosen.asset.present && <p className="warning">Bakgrundens fil saknas i assets/.</p>}

          <div className="row">
            <span className="rowname">Dealer</span>
            <select
              className="select"
              aria-label="Dealer"
              value={roundChoice?.key ?? choice?.dealer.file ?? ''}
              onChange={(event) => {
                setDealerFile(event.currentTarget.value);
                setPaused(false);
              }}
            >
              {dealers.length === 0 && <option value="">Ingen dealer i registret</option>}
              {rounds.length > 0 && (
                <optgroup label="Hela given">
                  {rounds.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Ett klipp">
                {dealers.map((entry) => (
                  <option key={entry.dealer.file} value={entry.dealer.file}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            </select>
            {playing && (
              <>
                <button type="button" className="btn" aria-pressed={paused} onClick={() => setPaused(!paused)}>
                  {paused ? '▶ Spela' : '❚❚ Pausa'}
                </button>
                <button type="button" className="btn" disabled={!handle?.clip} title="Dealerns film från början" onClick={again}>
                  ⟲ Börja om
                </button>
              </>
            )}
            <span className="spacer" />
            <span className="hint" role="status">
              {saving
                ? saving.of > 0
                  ? `Sparar ruta ${saving.done} av ${saving.of} …`
                  : 'Börjar spara …'
                : saved
                  ? `Sparad: ${saved.file}${saved.seconds > 0 ? ` (${saved.frames} rutor, ${comma(saved.seconds)} s)` : ''}`
                  : `Förlagan sparas ur ${viewName}${moved ? ', inte ur den fria vyn' : ''}.`}
            </span>
            <button type="button" className="btn" disabled={!handle} title={`Scenen ur ${viewName} som en bild, ${frameText(scene)}`} onClick={() => save(true)}>
              Spara bild
            </button>
            <button
              type="button"
              className="btn"
              disabled={!handle || !playing}
              title={`Hela dealerns film ur ${viewName}, ruta för ruta, ${frameText(scene)}`}
              onClick={() => save(false)}
            >
              Spara klipp
            </button>
          </div>

          <div className="row">
            <span className="rowname">Vy</span>
            <div className="seg" role="group" aria-label="Vy">
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
              <button type="button" className="btn quiet" onClick={() => choose({ ...view })}>
                ↩ Tillbaka till {viewName}
              </button>
            )}
            <label className="check" title="Samma öga, inzoomat på dealern: rutan dealerns filmer görs i">
              <input
                type="checkbox"
                checked={close}
                onChange={(event) => {
                  setClose(event.currentTarget.checked);
                  setMoved(false);
                }}
              />
              Närbild
            </label>
            <label className="check">
              <input type="checkbox" checked={shoeHidden} onChange={(event) => setShoeHidden(event.currentTarget.checked)} />
              Dölj skon
            </label>
            <span className="hint">Dra i scenen för att vrida, hjulet zoomar, högerknappen flyttar.</span>
          </div>

          {look && start && (
            <div className="row">
              <span className="rowname">Bakgrund</span>
              <div className="slidergrid">
                <Slider label="Vrid" unit="°" min={-180} max={180} step={1} value={look.turn} onChange={(turn) => change({ turn })} />
                {sphere && (
                  <>
                    <Slider label="Höjd" unit=" m" min={0.5} max={4} step={0.05} value={look.height} onChange={(height) => change({ height })} />
                    <Slider label="Radie" unit=" m" min={3} max={40} step={0.5} value={look.radius} onChange={(radius) => change({ radius })} />
                  </>
                )}
                <Slider label="Lyft" unit="°" min={0} max={45} step={1} value={look.lift} onChange={(lift) => change({ lift })} />
                <Slider label="Oskärpa" min={0} max={30} step={0.5} value={look.blur} onChange={(blur) => change({ blur })} />
                <Slider label="Ljusstyrka" min={0.05} max={2} step={0.01} value={look.exposure} onChange={(exposure) => change({ exposure })} />
              </div>
              <label className="check">
                <input type="checkbox" checked={look.mirror} onChange={(event) => change({ mirror: event.currentTarget.checked })} />
                Spegelvänd
              </label>
              <button type="button" className="btn quiet" disabled={sameLook(look, start)} onClick={() => change(start)}>
                Återställ
              </button>
            </div>
          )}

          <details className="more">
            <summary>Vad du ser, och vad som sparas</summary>
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
              {roundChoice
                ? `Hela given: en runda som spelkärnan har delat (frö ${dealt.seed}, plats ${dealt.bets.map((bet) => bet.seat).join(', ')}, Hit under ${dealt.hitBelow}; content/runda.json), ${roundChoice.plan.dealt.length} kort i spelkärnans ordning med dess valörer. Varje kort spelas med dealerns godkända cykelklipp ur registret, gjort i närbilden av ${madeIn}, eller, när klippet saknas, går kortet självt medan dealern står i REDO; samma val och samma uppspelning som node src/pipeline/runda.ts och Casinot. Hålkortet ligger med baksidan upp tills det vänds. Klippen spelas efter varandra utan glapp, i ${comma(round.speed.clips)} gångers fart (content/runda.json, ställs i steget Kortplan), och varje kort ligger kvar på bordet från att det har landat; när handen har släppt det och lyft går det till sin plats i kortplanen och sin storlek på bordet (steget Kortplan). ${wait ? `Efter sista kortet väntar dealern: vänta-klippet (${wait.split('/').at(-1)}) spelas ett varv eller fler, så många som täcker ${comma(round.film.hold)} s, och given börjar om där ett varv slutar, i REDO.` : `Efter sista kortet står sista rutan kvar ${comma(round.film.hold)} s, och sedan börjar given om (givens ankare har inget vänta-klipp).`} Börja om tar den från början. Bilden läggs tillbaka genom ${madeIn}s öga: sedd ur den vyn, eller dess närbild, är den bilden som den är; ur andra vyer är kroppen platt. Alla klipp i given är gjorda ur samma REDO-ankare, det med flest godkända klipp för rundan: ${coded(roundChoice.plan.anchor)} (${anchorName(roundChoice.plan.anchor)})${roundChoice.plan.anchors.length > 1 ? ` (inte valda: ${roundChoice.plan.anchors.slice(1).map((one) => `${coded(one.anchor)} (${anchorName(one.anchor)}), ${one.clips} klipp`).join('; ')})` : ''}.${roundChoice.plan.missing.length > 0 ? ` Saknar klipp: ${roundChoice.plan.missing.map((deal) => shownText(dealName(deal))).join('; ')}.` : ''}`
                : !choice
                  ? 'Ingen dealer visas: registret har ingen dealerfilm för dealern.'
                  : `Dealern är en dealerfilm: ”${choice.label}”, en ${choice.film ? 'film' : 'stillbild'} av dealern på grön skärm, gjord i närbilden av ${madeIn}: samma öga som vyn, inzoomat på dealern. Bilden läggs tillbaka genom det ögat och viks vid bordskanten, så att kroppen står upprätt och händerna ligger på filten. Sedd ur den vyn är den bilden som den är; ur andra vyer är kroppen platt.${choice.lands ? ` När klippet har lagt sitt märkkort (${comma(choice.lands.at)} s in) tas det blå bort och scenens kort ligger där handen lade det, och går sedan till kortplatsen för plats ${choice.lands.seat} i kortplanen; valören är en stå-in.` : ''}`}{' '}
              Hjulet zoomar utan att flytta ögat. Vrider man bort från vyn där filmen är gjord tonar scenens sko in över filmens.{' '}
              Spara bild och Spara klipp lägger scenen ur vald vy i output/forlagor/, {frameText(scene)}, med en beskrivning bredvid.
            </li>
            <li>
              {!sphere
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
          </details>
        </section>
      </main>

      <aside className="backdrops" aria-label="Bakgrunder" inert={saving !== null}>
        <h2 className="label">
          Bakgrunderna <span>{items.length}, välj en för att se den i scenen</span>
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
  /** Dockans mått: där kortet står i skons mynning, som dealerfilmens nyckel målar kortets kant efter. */
  doll: DollDescription;
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
function Stage({ scene, doll, dealer, paused, background, view, shoe, onMoved, onProblem, onHandle }: StageProps) {
  const holder = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<SceneHandle | null>(null);
  // Dealern som text: lika för två värden som säger samma sak.
  const dealerKey = JSON.stringify(dealer);

  useEffect(() => {
    const element = holder.current!;
    const built = buildScene(element, scene, { urlOf: mediaUrl, dealer: JSON.parse(dealerKey) as Dealer | null, doll, onProblem, onMoved });
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
  }, [scene, doll, dealerKey, onProblem, onMoved, onHandle]);

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
