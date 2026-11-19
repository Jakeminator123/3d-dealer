// Scenen i tal och videojobbet: det bakgrund, bord, sko, kort, docka, ankare och kameror står på, läst ur content/
// (scene.json, doll.json, runda.json, tagning.json), registrets poster och tagningarnas (eye, shoe, place), och vad ett
// videojobb är. Ingenting här har egna tal: allt räknas ur det som läses, och ögonen med src/scene/geometry.ts.

import type { SceneDescription, Vec3 } from '../scene/description.ts';
import { closeEye, floorY, playerEye, sceneEye, seatEye, tablePosition, type Eye } from '../scene/geometry.ts';
import type { Asset } from './registry.ts';
import { anchorName, cardCode, cardName, framesOf, viewLabel, viewWord } from './names.ts';
import { sentWords, type Take } from './takes.ts';

export type Row = { label: string; value: string; basis?: string };
export type Table = { caption?: string; head: string[]; rows: string[][]; /** Långa texter i cellerna: raderna bryts i stället för att tabellen rullar. */ wrap?: boolean };
export type Group = { id: string; title: string; text?: string; rows?: Row[]; tables?: Table[]; picture?: string; sources?: { what: string; text: string }[] };

type Json = any;

// ---------------------------------------------------------------------------------------------------------------------
// Tal i ord

export const num = (value: unknown, digits = 3): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('sv-SE', { maximumFractionDigits: digits }) : 'saknas';
const unitText = (unit: string): string => (!unit || unit === 'andel' ? '' : unit === '°' || unit === '%' ? unit : ` ${unit}`);
export const withUnit = (value: unknown, unit: string, digits = 3): string => (typeof value === 'number' && Number.isFinite(value) ? `${num(value, digits)}${unitText(unit)}` : 'saknas');
export const point = (values: unknown, unit = 'm', digits = 4): string =>
  Array.isArray(values) && values.length > 0 && values.every((v) => typeof v === 'number') ? `${values.map((v) => num(v, digits)).join('; ')}${unitText(unit)}` : 'saknas';
export const megabytes = (bytes: number | null | undefined): string => (typeof bytes === 'number' ? `${num(bytes / 1024 / 1024, 1)} MB` : 'saknas');
/** Ett mått ur matning.json i ord: värdet med sin enhet. */
export const judgedValue = (value: unknown, unit: string): string => (value === null || value === undefined ? 'saknas' : typeof value === 'number' ? withUnit(value, unit) : String(value));

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};
const basisOf = (group: Json): string | undefined => (group?.basis === 'mätt' || group?.basis === 'antaget' ? group.basis : undefined);
const sourceOf = (what: string, group: Json): { what: string; text: string }[] => (typeof group?.source === 'string' ? [{ what, text: group.source }] : []);

/** Ögat i tal: läget, vridningen från −z mot +x, lutningen nedåt, bildvinkeln över rutan och brännvidden. */
export function eyeFacts(eye: Eye) {
  const [fx, fy, fz] = unit(eye.forward);
  return {
    position: eye.position,
    yaw: degrees(Math.atan2(fx, -fz)),
    pitch: degrees(Math.asin(-fy)),
    fovV: degrees(2 * Math.atan(eye.frame.height / 2 / eye.focalPx)),
    fovH: degrees(2 * Math.atan(eye.frame.width / 2 / eye.focalPx)),
    focal: eye.focalPx,
    frame: eye.frame,
  };
}
const isEye = (value: unknown): value is Eye => {
  const eye = value as Eye | null;
  return !!eye && Array.isArray(eye.position) && Array.isArray(eye.forward) && typeof eye.focalPx === 'number' && typeof eye.frame?.width === 'number';
};
export const sameEye = (a: unknown, b: Eye): boolean =>
  isEye(a) && a.position.every((v, k) => Math.abs(v - b.position[k]!) < 1e-6) && unit(a.forward).every((v, k) => Math.abs(v - unit(b.forward)[k]!) < 1e-6) && Math.abs(a.focalPx - b.focalPx) < 1e-3;

function eyeRow(name: string, eye: Eye, basis: string): string[] {
  const f = eyeFacts(eye);
  return [name, point(f.position, 'm', 3), withUnit(f.position[1], 'm', 3), withUnit(f.yaw, '°', 1), withUnit(f.pitch, '°', 1), `${num(f.fovV, 1)} × ${num(f.fovH, 1)}°`, withUnit(f.focal, 'bp', 0), `${f.frame.width} × ${f.frame.height}`, basis];
}

/** Vyns närbild i dag: Spelarens, eller platsens (kamerans egen plats är Spelaren). */
export function todayClose(scene: SceneDescription, view: string): Eye | null {
  if (view === 'spelaren') return closeEye(scene, playerEye(scene));
  const seat = Number(view.split('-')[1]);
  if (!scene.places.seats.some((one) => one.seat === seat)) return null;
  return closeEye(scene, seat === scene.camera.seat ? playerEye(scene) : seatEye(scene, seat));
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenen

export type SceneInput = {
  raw: { scene: Json; doll: Json; runda: Json; tagning: Json };
  scene: SceneDescription;
  assets: Asset[];
  /** Vyernas REDO-ankare i dealerns fil: vy → registernamn. */
  anchors: Record<string, string | null>;
  takes: Take[];
  cycle: (move: string | null) => string;
};

/** Koordinaterna i en mening, som scene.json säger dem, och var linsen origo står under är. */
export function axesText(input: SceneInput): string {
  const { scene, raw } = input;
  const first = String(raw.scene.about ?? '').split(/(?<=\.)\s/)[0] ?? '';
  return `${first} Kameran origo står under är gamla projektets lins (camera i content/scene.json): ${point(scene.camera.position, 'm', 2)}, alltså ${withUnit(scene.camera.position[1], 'm', 2)} över filten. Dealerns bordskant ligger på z = ${num(scene.dealerEdge.z, 4)} m och Spelarens öga på z = ${num(playerEye(scene).position[2], 4)} m.`;
}

export function sceneGroups(input: SceneInput): Group[] {
  const { scene, assets, takes } = input;
  const { scene: sceneJson, doll: dollJson, runda: rundaJson, tagning: tagningJson } = input.raw;
  const player = playerEye(scene);
  const playerNear = closeEye(scene, player);
  const seats = scene.places.seats.map((one) => one.seat);

  const anchorEntries = assets.filter((entry) => entry.group === 'anchors' && String(entry.pose ?? '').toLowerCase() === 'redo');
  const eyeName = (eye: Eye): string => {
    const names = anchorEntries.filter((entry) => sameEye(entry.eye, eye)).map((entry) => `ankaret ${anchorName(entry.file)}${viewWord(entry.view) === 'spelaren' ? '' : ` (${viewLabel(viewWord(entry.view))})`}`);
    for (const view of ['spelaren', ...seats.map((seat) => `plats-${seat}`)]) {
      const near = todayClose(scene, view);
      if (near && sameEye(eye, near) && !(view !== 'spelaren' && Number(view.split('-')[1]) === scene.camera.seat)) names.push(`${viewLabel(view)}s närbild i dag`);
    }
    return [...new Set(names)].join(', ') || 'ett öga som ingen vy har i dag';
  };

  const eyes = new Map<string, { eye: Eye; takes: number; cycles: Set<string> }>();
  const shoes = new Map<string, { shoe: Json; takes: number; cycles: Set<string> }>();
  for (const take of takes) {
    if (isEye(take.eye)) {
      const key = JSON.stringify(take.eye);
      const group = eyes.get(key) ?? { eye: take.eye, takes: 0, cycles: new Set<string>() };
      group.takes++;
      group.cycles.add(input.cycle(take.move));
      eyes.set(key, group);
    }
    const shoe = take.shoe as Json;
    if (shoe && Array.isArray(shoe.at)) {
      const key = JSON.stringify(shoe);
      const group = shoes.get(key) ?? { shoe, takes: 0, cycles: new Set<string>() };
      group.takes++;
      group.cycles.add(input.cycle(take.move));
      shoes.set(key, group);
    }
  }

  const box = scene.table.model.box;
  const floor = floorY(scene);
  const background = assets.find((entry) => entry.file === rundaJson.film?.background);
  const oldView = (background?.oldView ?? null) as Json;
  const proof = tagningJson.proof?.background ?? {};
  const arc = sceneJson.places?.arc ?? {};
  const row = sceneJson.places?.row ?? {};
  const places = sceneJson.places;
  const cards = Math.max(0, ...scene.places.seats.map((one) => one.cards.length), scene.places.dealer.length);

  const groups: Group[] = [
    {
      id: 'ogon',
      title: 'Ögonen',
      text: 'Varje vy är ett öga i scenen. Vridningen är kring lodlinjen, räknad från rakt mot dealern (längs −z), positiv åt höger i bild (mot +x). Lutningen är nedåt från vågrätt, och bildvinkeln är över hela rutan.',
      tables: [
        {
          head: ['Vy', 'Läge x; y; z', 'Höjd över filten', 'Vridning', 'Lutning nedåt', 'Bildvinkel lodrät × vågrät', 'Brännvidd', 'Ruta', 'Grund'],
          rows: [
            eyeRow('Spelaren', player, `player, ${basisOf(sceneJson.player) ?? 'saknas'}`),
            eyeRow('Spelarens närbild', playerNear, `player, film, ${basisOf(sceneJson.film) ?? 'saknas'}`),
            ...seats.map((seat) => (seat === scene.camera.seat ? [`Plats ${seat}`, 'samma öga som Spelaren', '', '', '', '', '', '', ''] : eyeRow(`Plats ${seat}`, seatEye(scene, seat), `player, places, ${basisOf(places) ?? 'saknas'}`))),
            eyeRow('Gamla linsen (ingen vy)', sceneEye(scene), `camera, ${basisOf(sceneJson.camera) ?? 'saknas'}`),
          ],
        },
        {
          caption: 'Ögonen klippen är gjorda genom, ur tagningarnas poster',
          head: ['Öga', 'Läge x; y; z', 'Vridning', 'Lutning nedåt', 'Brännvidd', 'Tagningar', 'Cykler'],
          rows: [...eyes.values()].map((group) => {
            const f = eyeFacts(group.eye);
            return [eyeName(group.eye), point(f.position, 'm', 3), withUnit(f.yaw, '°', 2), withUnit(f.pitch, '°', 2), withUnit(f.focal, 'bp', 0), String(group.takes), [...group.cycles].join(', ')];
          }),
        },
      ],
      sources: [...sourceOf('player', sceneJson.player), ...sourceOf('camera', sceneJson.camera), ...sourceOf('film', sceneJson.film)],
    },
    {
      id: 'bord',
      title: 'Bordet',
      rows: [
        { label: 'Modellen', value: String(scene.table.file) },
        { label: 'Modellens mått: längd × djup × höjd', value: `${num(box.max[0] - box.min[0])} × ${num(box.max[2] - box.min[2])} × ${num(box.max[1] - box.min[1])} m`, basis: basisOf(sceneJson.table?.model) },
        { label: 'Filtens höjd i modellen', value: withUnit(scene.table.model.feltY, 'm'), basis: basisOf(sceneJson.table?.model) },
        { label: 'Dealerns kant i modellen (z)', value: withUnit(scene.table.model.dealerEdgeZ, 'm'), basis: basisOf(sceneJson.table?.model) },
        { label: 'Dealerns bordskant i scenen (z)', value: withUnit(scene.dealerEdge.z, 'm', 4), basis: basisOf(sceneJson.dealerEdge) },
        { label: 'Modellens origo i scenen', value: point(tablePosition(scene), 'm', 3) },
        { label: 'Lutning mot spelaren, kring dealerns bordskant', value: withUnit(scene.table.tilt.deg, '°'), basis: basisOf(sceneJson.table?.tilt) },
        { label: 'Golvet under filtens plan', value: withUnit(-floor, 'm', 3) },
      ],
      sources: [...sourceOf('table.model', sceneJson.table?.model), ...sourceOf('table.tilt', sceneJson.table?.tilt), ...sourceOf('dealerEdge', sceneJson.dealerEdge)],
    },
    {
      id: 'sko',
      title: 'Skon',
      rows: [
        { label: 'Modellen', value: String(scene.shoe.file) },
        { label: 'Mitten på filten (x; z)', value: point(scene.shoe.at), basis: basisOf(sceneJson.shoe) },
        { label: 'Vridning kring lodlinjen (0 = mynningen mot kameran)', value: withUnit(scene.shoe.yawDeg, '°'), basis: basisOf(sceneJson.shoe) },
        { label: 'Längd', value: withUnit(scene.shoe.length, 'm'), basis: basisOf(sceneJson.shoe) },
      ],
      tables: [
        {
          caption: 'Skon tagningarna är gjorda med, ur deras poster',
          head: ['Mitten (x; z)', 'Vridning', 'Längd', 'Tagningar', 'Cykler', 'Mot scenen i dag'],
          rows: [...shoes.values()].map((group) => [
            point(group.shoe.at),
            withUnit(group.shoe.yawDeg, '°'),
            withUnit(group.shoe.length, 'm'),
            String(group.takes),
            [...group.cycles].join(', '),
            JSON.stringify(group.shoe.at) === JSON.stringify(scene.shoe.at) && group.shoe.yawDeg === scene.shoe.yawDeg && group.shoe.length === scene.shoe.length ? 'samma' : 'ett tidigare läge',
          ]),
        },
      ],
      sources: sourceOf('shoe', sceneJson.shoe),
    },
    {
      id: 'kortplan',
      title: 'Kortplanen',
      text: 'Spelarnas kortplatser räknas ur en båge och dealerns ur en rad. Lägena är kortets mitt på filten, på ett olutat bord; bordets lutning lägger dem på plats.',
      rows: [
        { label: 'Bågens mitt i sidled (centreX)', value: withUnit(arc.centreX, 'm', 4), basis: basisOf(places) },
        { label: 'Första kortets djup i mitten (depth)', value: withUnit(arc.depth, 'm', 4), basis: basisOf(places) },
        { label: 'Bredd från första till sista platsen (width)', value: withUnit(arc.width, 'm', 4), basis: basisOf(places) },
        { label: 'Ytterplatserna böjda mot dealern (bend)', value: withUnit(arc.bend, 'm', 4), basis: basisOf(places) },
        { label: 'Rundning (round: 1 är ett V, 2 rund)', value: num(arc.round), basis: basisOf(places) },
        { label: 'Nästa kort på en plats (step x; z)', value: point(arc.step), basis: basisOf(places) },
        { label: 'Platser och kort per plats', value: `${num(arc.seats)} platser, ${num(arc.cards)} kort`, basis: basisOf(places) },
        { label: 'Dealerns första kort (row.first x; z)', value: point(row.first), basis: basisOf(places) },
        { label: 'Dealerns nästa kort (row.step x; z)', value: point(row.step), basis: basisOf(places) },
        { label: 'Dealerns kort', value: num(row.cards), basis: basisOf(places) },
        { label: 'Kortet: bredd × höjd × tjocklek', value: `${num(scene.card.width * 1000, 1)} × ${num(scene.card.height * 1000, 1)} × ${num(scene.card.thickness * 1000, 2)} mm`, basis: basisOf(sceneJson.card) },
        { label: 'Kortets hörnradie', value: withUnit(scene.card.corner * 1000, 'mm', 2), basis: basisOf(sceneJson.card) },
        { label: 'Kortet på bordet mot filmens kort (onTable.scale)', value: withUnit(scene.card.onTable.scale, 'gånger'), basis: basisOf(sceneJson.card?.onTable) },
      ],
      tables: [
        {
          caption: 'Kortplatserna i dag, x; z i meter',
          head: ['Plats', ...Array.from({ length: cards }, (_, k) => cardCode(k))],
          rows: [...scene.places.seats.map((one) => [`P${one.seat}`, ...one.cards.map((card) => point(card, ''))]), ['D', ...scene.places.dealer.map((card) => point(card, ''))]],
        },
      ],
      sources: [...sourceOf('places', places), ...sourceOf('card', sceneJson.card), ...sourceOf('card.onTable', sceneJson.card?.onTable)],
    },
    {
      id: 'rum',
      title: 'Rummet',
      rows: [
        { label: 'Bakgrunden i rundans film (runda.json)', value: background ? `${background.title} (${background.file}), ${background.width ?? '?'} × ${background.height ?? '?'} bp${background.kind === '360' ? ', 360-bild' : ''}` : `${String(rundaJson.film?.background ?? 'saknas')}, ingen post i registret` },
        { label: 'Bakgrundens licens', value: background ? `${String(background.licence ?? 'saknas')}${background.author ? `, ${String(background.author)}` : ''}` : 'saknas' },
        { label: 'Hur den visas (registrets oldView)', value: oldView ? `oskärpa ${num(oldView.blur)}, exponering ${num(oldView.exposure)}, vridning ${withUnit(oldView.turn, '°')}, spegling ${oldView.mirror ? 'ja' : 'nej'}` : 'saknas' },
        { label: 'Beviset i scenen (tagning.json, proof)', value: `${String(proof.file ?? 'saknas')}, oskärpa ${num(proof.blur)}, exponering ${num(proof.exposure)}, vridning ${withUnit(proof.turn, '°')}`, basis: basisOf(tagningJson.proof) },
        { label: 'Bilden antas tagen så högt över golvet', value: withUnit(scene.room.captureHeight, 'm'), basis: basisOf(sceneJson.room) },
        ...Object.entries(scene.room.captureHeights ?? {}).map(([file, height]) => ({ label: `Egen höjd för ${file}`, value: withUnit(height, 'm'), basis: basisOf(sceneJson.room) })),
        { label: 'Väggarna från den punkten', value: withUnit(scene.room.radius, 'm'), basis: basisOf(sceneJson.room) },
        { label: 'Bildens lyft', value: withUnit(scene.background.liftDeg, '°'), basis: basisOf(sceneJson.background) },
        { label: 'Golvet under filtens plan, räknat ur bordet', value: withUnit(-floor, 'm', 3) },
        { label: 'Skuggan under bordet: räckvidd och styrka', value: `${withUnit(scene.room.shadowReach, 'm')}, ${num(scene.room.shadowStrength)}`, basis: basisOf(sceneJson.room) },
        { label: 'Dealerns skugga på filten: förskjutning, mjukhet, styrka', value: `${withUnit(scene.room.dealerShadow.offset, 'm')}, ${withUnit(scene.room.dealerShadow.blur, 'm')}, ${num(scene.room.dealerShadow.strength)}`, basis: basisOf(sceneJson.room) },
        { label: 'Rundans film: rutor per sekund', value: withUnit(rundaJson.film?.fps, 'rutor/s'), basis: basisOf(rundaJson.film) },
      ],
      sources: [...sourceOf('room', sceneJson.room), ...sourceOf('background', sceneJson.background), ...sourceOf('runda.json, film', rundaJson.film)],
    },
    {
      id: 'docka',
      title: 'Dockan',
      text: 'Dockan är lika för alla dealers. Höjderna är över filten, i meter.',
      rows: [
        { label: 'Axelbredd mellan axellederna', value: withUnit(2 * dollJson.body?.shoulderHalfWidth, 'm'), basis: basisOf(dollJson.body) },
        { label: 'Axellederna över filten', value: withUnit(dollJson.body?.shoulderHeight, 'm', 4), basis: basisOf(dollJson.body) },
        { label: 'Ögonhöjd över filten', value: withUnit(dollJson.body?.eyeHeight, 'm', 4), basis: basisOf(dollJson.body) },
        { label: 'Huvudets mitt över filten, och radien', value: `${withUnit(dollJson.body?.head?.height, 'm', 4)}, ${withUnit(dollJson.body?.head?.radius, 'm', 4)}`, basis: basisOf(dollJson.body) },
        { label: 'Axlarnas mitt i sidled (x)', value: withUnit(dollJson.body?.centreX, 'm', 4), basis: basisOf(dollJson.body) },
        { label: 'Axlar och ansikte bakom dealerns bordskant', value: withUnit(dollJson.sitting?.behindEdge, 'm'), basis: basisOf(dollJson.sitting) },
        { label: 'Höften under filtens höjd', value: withUnit(dollJson.sitting?.hipBelowFelt, 'm'), basis: basisOf(dollJson.sitting) },
        { label: 'Överarm och underarm', value: `${withUnit(dollJson.arm?.upper, 'm')} och ${withUnit(dollJson.arm?.fore, 'm')}`, basis: basisOf(dollJson.arm) },
        { label: 'Räckvidd innan hon lutar sig', value: withUnit(dollJson.arm?.reach, 'm'), basis: basisOf(dollJson.arm) },
        { label: 'VILA: handleden från kroppens mitt i sidled', value: withUnit(dollJson.rest?.wristFromCentre, 'm', 4), basis: basisOf(dollJson.rest) },
        { label: 'VILA: fingertopparna framför bordskanten', value: withUnit(dollJson.rest?.fingertipsBeforeEdge, 'm'), basis: basisOf(dollJson.rest) },
        { label: 'VILA: handen vriden inåt', value: withUnit(dollJson.rest?.toeInDeg, '°'), basis: basisOf(dollJson.rest) },
        { label: 'Blicken i REDO mot', value: dollJson.gaze?.ready ? `plats ${dollJson.gaze.ready.seat}, ${cardCode(dollJson.gaze.ready.index)}` : 'saknas', basis: basisOf(dollJson.gaze) },
      ],
      sources: [...sourceOf('body', dollJson.body), ...sourceOf('sitting', dollJson.sitting), ...sourceOf('arm', dollJson.arm), ...sourceOf('rest', dollJson.rest), ...sourceOf('gaze', dollJson.gaze)],
    },
  ];

  for (const [view, file] of Object.entries(input.anchors)) {
    if (!file) continue;
    const entry = assets.find((one) => one.file === file);
    const eye = isEye(entry?.eye) ? entry!.eye : null;
    const f = eye ? eyeFacts(eye) : null;
    const near = todayClose(scene, view);
    const shoe = entry?.shoe as Json;
    const source = (entry?.source ?? {}) as Json;
    groups.push({
      id: `ankare-${view}`,
      title: `Ankaret ${anchorName(file)} ur ${viewLabel(view)}`,
      rows: [
        { label: 'Registernamnet', value: file },
        { label: 'Status', value: entry ? (entry.status === 'utgår' ? 'underkänd' : entry.status) : 'ingen post i registret' },
        { label: 'Storlek', value: entry?.width ? `${entry.width} × ${entry.height} bp` : 'saknas' },
        { label: 'Sista bildsteget gjort med', value: typeof source.model === 'string' ? source.model : 'saknas' },
        { label: 'Ögat: läge x; y; z', value: f ? point(f.position, 'm', 4) : 'saknas' },
        { label: 'Ögat: vridning och lutning nedåt', value: f ? `${withUnit(f.yaw, '°', 2)} och ${withUnit(f.pitch, '°', 2)}` : 'saknas' },
        { label: 'Ögat: brännvidd och ruta', value: f ? `${withUnit(f.focal, 'bp', 1)}, ${f.frame.width} × ${f.frame.height}` : 'saknas' },
        {
          label: 'Mot vyns närbild i dag',
          value: !eye || !near ? 'saknas' : sameEye(eye, near) ? 'samma öga' : `ögat står ${withUnit(Math.hypot(...(eye.position.map((v, k) => v - near.position[k]!) as Vec3)), 'm', 3)} från dagens, med brännvidden ${num(eye.focalPx, 0)} mot ${num(near.focalPx, 0)} bp; klippen ur ankaret läggs genom dess eget öga`,
        },
        { label: 'Skon i ankaret (x; z, vridning, längd)', value: shoe?.at ? `${point(shoe.at)}, ${withUnit(shoe.yawDeg, '°')}, ${withUnit(shoe.length, 'm')}` : 'saknas' },
      ],
      picture: entry?.present ? file : undefined,
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------------------------------------------------
// Videojobbet

/** Vad ett videojobb är, ur content/tagning.json (order och reference) och tagningarnas beställningar och mått. */
export function jobGroups(tagningJson: Json, takes: Take[], sample: Take | null, cycle: (move: string | null) => string): Group[] {
  const order = tagningJson.order ?? {};
  const reference = tagningJson.reference ?? {};
  const prices = new Map<number, Map<number, number>>();
  for (const take of takes) {
    const one = take.order;
    if (!one || one.basis !== 'mätt' || one.credits === null || one.seconds === null) continue;
    const credits = prices.get(one.seconds) ?? new Map<number, number>();
    credits.set(one.credits, (credits.get(one.credits) ?? 0) + 1);
    prices.set(one.seconds, credits);
  }
  const priceText = [...prices.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seconds, credits]) => `${seconds} s: ${[...credits.entries()].map(([value, n]) => `${value} krediter (${n} ${n === 1 ? 'tagning' : 'tagningar'})`).join(', ')}`)
    .join('; ');
  const film = sample?.film ?? null;
  const name = sample ? `${cardName(sample.seat, sample.index, sample.action)} t${sample.take ?? '?'} i ${cycle(sample.move)}` : null;
  return [
    {
      id: 'jobb',
      title: 'Ett videojobb',
      text: `Ett videojobb är en beställning genom ${String(order.tool ?? 'Runway')}: filmmodellen gör ett klipp ur tre underlag och en text.${name ? ` Raderna om ett klipps eget mått gäller ${name}.` : ''}`,
      rows: [
        { label: 'Modell', value: String(order.model ?? 'saknas'), basis: basisOf(order) },
        { label: 'Upplösning och bildformat', value: `${String(order.resolution ?? 'saknas')}, ${String(order.ratio ?? 'saknas')}`, basis: basisOf(order) },
        { label: 'Längd som beställs', value: `lika lång som cykeln i hela sekunder, minst ${withUnit(order.least, 's')}; standardlängden är ${withUnit(order.duration, 's')}`, basis: basisOf(order) },
        { label: 'Klippets längd i beställningen', value: sample ? withUnit(sample.request.duration, 's') : 'saknas' },
        { label: 'Klippets ruta och takt', value: film ? `${film.width ?? '?'} × ${film.height ?? '?'} bp, ${withUnit(film.fps, 'rutor/s')}` : 'saknas' },
        { label: 'Klippets längd', value: film ? `${withUnit(film.seconds, 's')}, ${num(film.frames)} rutor` : 'saknas' },
        { label: 'Kodek', value: film?.codec ?? 'saknas' },
        { label: 'Filstorlek', value: megabytes(sample?.bytes) },
        { label: 'Ljud', value: sample?.soundInDownload ? 'filmen kommer med ljud; ta-emot tar bort det utan omkodning' : film?.audio === false ? 'inget ljud' : 'saknas' },
        { label: 'Pris per klipp, mätt med saldot före och efter', value: priceText || 'saknas' },
        { label: 'Det här klippet', value: sample?.order ? `${withUnit(sample.order.credits, 'krediter', 0)} (${sample.order.basis})` : 'saknas' },
      ],
      sources: sourceOf('tagning.json, order', order),
    },
    {
      id: 'underlag',
      title: 'De tre underlagen',
      tables: [
        {
          wrap: true,
          head: ['Underlag', 'Vad', 'Format'],
          rows: [
            ['Första bild (startFrame)', `vyns REDO-ankare${sample?.anchor ? `, ${framesOf(sample.anchor, sample.seat, sample.index, sample.action).first} (${sample.anchor})` : ''}`, 'en stillbild i filmens ruta'],
            ['Sista bild (endFrame)', `samma ankare med märkkortet målat där kortet ska ligga${sample ? `, ${framesOf(sample.anchor, sample.seat, sample.index, sample.action).last}` : ''}`, 'en stillbild i filmens ruta'],
            // Filmen som skickades med bilderna står i beställningen: dockans film, ett klipp i dess ställe, eller ingen.
            sample && sample.sent.kind !== 'docka'
              ? [
                  sample.sent.role ? `Referensen (${sample.sent.role})` : 'Referensen',
                  sentWords(sample.sent),
                  sample.sent.kind === 'ingen' ? 'ingen film' : `${withUnit(sample.sent.fps, 'rutor/s')}, ${num(sample.sent.frames)} rutor, ${withUnit(sample.sent.seconds, 's')}`,
                ]
              : [
                  'Dockans film (referenceVideos)',
                  `dockan gör cykeln ur vyns närbild i grå ateljé (skärmen ${point(reference.studio?.screen, '', 0)}, bordet ${point(reference.studio?.table, '', 0)}, 0–255)`,
                  sample?.reference ? `${withUnit(sample.reference.fps ?? reference.fps, 'rutor/s')}, ${num(sample.reference.frames)} rutor, ${withUnit(sample.reference.seconds, 's')}` : withUnit(reference.fps, 'rutor/s'),
                ],
          ],
        },
      ],
      sources: sourceOf('tagning.json, reference', reference),
    },
  ];
}
