// Dealerns bild som textur: en film eller en stillbild på grön skärm, läst från en adress, för den vikta ytan (film.ts).
// En film styrs här på samma sätt som dockans rörelse (Clip).

import * as THREE from 'three';
import { prepareKeyTexture } from './key.ts';

/** Filmen som en dealer visar. */
export type Clip = {
  /** Filmens längd i sekunder. Noll tills filmen är läst. */
  seconds(): number;
  /** Tiden filmen står på, i sekunder. */
  time(): number;
  /** Om filmen går, eller ska gå så snart den är läst. */
  playing(): boolean;
  play(): void;
  pause(): void;
  /** Pausar filmen och ställer den på en tid. Löftet uppfylls när rutan för den tiden är framme och ska ritas. */
  seek(time: number): Promise<void>;
};

export type Picture = {
  texture: THREE.Texture;
  /** Bilden själv: filmens eller stillbildens element. */
  element: HTMLVideoElement | HTMLImageElement;
  /** Filmen, när bilden är en film. Null för en stillbild. */
  clip: Clip | null;
  /** Uppfylls när första rutan är läst, eller filen har visat sig oläsbar. */
  ready: Promise<void>;
  /** Skärmens färg: medelvärdet i bildens övre vänstra hörn, 0–255 per kanal. */
  screen(): [number, number, number];
  dispose(): void;
};

// Sidan på den ruta i bildens övre vänstra hörn där skärmens färg läses, i bildpunkter. Medelvärdet över rutan
// tar bort bruset som en filmkodning lägger på en enfärgad yta.
const CORNER = 8;
// Hur länge en ruta väntas in efter att filmen har sagt att den står på tiden, i millisekunder. Webbläsaren säger till
// när rutan visas; i en flik som inte syns kan det beskedet utebli, och då ritas rutan ändå.
const SEEK_PATIENCE = 250;
// Rutan som visas efter en förflyttning ska vara den som gäller på tiden: den börjar högst så här många sekunder före.
const SEEK_REACH = 0.1;

const isFilm = (url: string): boolean => /\.(mp4|webm)(\?|$)/i.test(url);

/** Skärmens färg: medelvärdet i bildens övre vänstra hörn. */
function screenColour(picture: HTMLVideoElement | HTMLImageElement): [number, number, number] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CORNER;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(picture, 0, 0, CORNER, CORNER, 0, 0, CORNER, CORNER);
  const { data } = context.getImageData(0, 0, CORNER, CORNER);
  const sum = [0, 0, 0];
  for (let index = 0; index < data.length; index += 4) for (let channel = 0; channel < 3; channel++) sum[channel]! += data[index + channel]!;
  const count = data.length / 4;
  return [sum[0]! / count, sum[1]! / count, sum[2]! / count];
}

/**
 * Läser filmen eller stillbilden på adressen `url`. `anisotropy` är grafikkortets högsta. `shown` anropas när första
 * rutan är läst, `changed` för varje ny ruta, och `problem` när filen inte gick att läsa; `what` är vad den kallas då.
 * En film går av sig själv från början, utan ljud och om och om igen.
 */
export function loadPicture(url: string, anisotropy: number, shown: () => void, changed: () => void, problem: (text: string) => void, what: string): Picture {
  let closed = false;
  let release = (): void => {};
  let clip: Clip | null = null;
  let texture: THREE.Texture;
  let element: HTMLVideoElement | HTMLImageElement;
  let ready: Promise<void>;

  if (isFilm(url)) {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    element = video;
    texture = new THREE.VideoTexture(video);
    const perFrame = 'requestVideoFrameCallback' in video;

    // Scenen ritas om för varje ny filmruta. En webbläsare som inte säger till per ruta ritar om i sin egen takt medan filmen går.
    let waiting = 0;
    const onFrame = (): void => {
      if (closed) return;
      changed();
      waiting = video.requestVideoFrameCallback(onFrame);
    };
    const whilePlaying = (): void => {
      if (closed) return;
      if (!video.paused) changed();
      waiting = requestAnimationFrame(whilePlaying);
    };
    if (perFrame) waiting = video.requestVideoFrameCallback(onFrame);
    else waiting = requestAnimationFrame(whilePlaying);
    release = () => {
      if (perFrame) video.cancelVideoFrameCallback(waiting);
      else cancelAnimationFrame(waiting);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    // Om filmen ska gå. Den som pausar innan filmen är läst får den stående på första rutan.
    let wanted = true;
    // En film utan ljud får starta av sig själv. Nekas den ändå står rutan kvar.
    const start = (): void => {
      video.play().catch(() => {});
    };

    ready = new Promise((resolve) => {
      video.addEventListener(
        'loadeddata',
        () => {
          if (!closed) {
            shown();
            if (wanted) start();
          }
          resolve();
        },
        { once: true },
      );
      video.addEventListener(
        'error',
        () => {
          if (!closed) problem(`${what} gick inte att läsa`);
          resolve();
        },
        { once: true },
      );
    });
    video.src = url;

    clip = {
      seconds: () => (Number.isFinite(video.duration) ? video.duration : 0),
      time: () => video.currentTime,
      playing: () => wanted,
      play() {
        wanted = true;
        if (video.readyState >= video.HAVE_CURRENT_DATA) start();
      },
      pause() {
        wanted = false;
        video.pause();
      },
      seek(time) {
        return new Promise((resolve) => {
          wanted = false;
          video.pause();
          let arrived = false;
          let presented = !perFrame;
          let settled = false;
          let patience = 0;
          const settle = (): void => {
            if (settled) return;
            settled = true;
            clearTimeout(patience);
            // Rutan läses in i grafikkortet på nytt, också när webbläsaren inte har sagt till om den.
            texture.needsUpdate = true;
            changed();
            resolve();
          };
          const both = (): void => {
            if (arrived && presented) settle();
          };
          const onPresented = (_now: number, frame: { mediaTime: number }): void => {
            if (settled || closed) return;
            if (frame.mediaTime <= time + 1e-6 && time - frame.mediaTime < SEEK_REACH) {
              presented = true;
              both();
            } else {
              video.requestVideoFrameCallback(onPresented);
            }
          };
          if (perFrame) video.requestVideoFrameCallback(onPresented);
          video.addEventListener(
            'seeked',
            () => {
              arrived = true;
              both();
              patience = window.setTimeout(settle, SEEK_PATIENCE);
            },
            { once: true },
          );
          video.currentTime = time;
        });
      },
    };
  } else {
    const image = new Image();
    element = image;
    texture = new THREE.Texture(image);
    ready = new Promise((resolve) => {
      image.onload = () => {
        if (!closed) shown();
        resolve();
      };
      image.onerror = () => {
        if (!closed) problem(`${what} gick inte att läsa`);
        resolve();
      };
    });
    image.src = url;
  }

  prepareKeyTexture(texture, anisotropy);

  return {
    texture,
    element,
    clip,
    ready,
    screen: () => screenColour(element),
    dispose() {
      closed = true;
      release();
      texture.dispose();
    },
  };
}
