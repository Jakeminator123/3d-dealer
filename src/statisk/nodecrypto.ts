// node:crypto och Buffer för spelkärnan i webbläsaren, i det statiska Casinot. Kärnan (src/engine) är skriven för Node
// och läser createHash, randomFillSync, randomBytes och randomUUID ur node:crypto, och Buffer som global. Det statiska
// bygget (bygg.ts) pekar node:crypto hit, så att kärnan körs som den står, utan ändringar. Bara det kärnan använder finns:
// sha256 (synkront, som Nodes), slumpen ur webbläsarens crypto.getRandomValues, och en Buffer med de metoder rng.ts läser.
//
// Att kärnan ger samma utfall med den här filen som med Nodes prövas i spel.test.ts: samma frö ger samma runda.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Bytes som Nodes Buffer, med det kärnan läser: from, alloc, copy, readUInt32BE, writeBigUInt64BE och toString. */
export class Bytes extends Uint8Array {
  static override from(value: unknown, encoding?: unknown): Bytes {
    if (typeof value === 'string') {
      if (encoding !== undefined && encoding !== 'utf8' && encoding !== 'utf-8') throw new TypeError(`Teckenkodningen ${String(encoding)} finns inte här`);
      const bytes = encoder.encode(value);
      const out = new Bytes(bytes.length);
      out.set(bytes);
      return out;
    }
    const source = value as ArrayLike<number>;
    const out = new Bytes(source.length);
    out.set(source);
    return out;
  }

  static alloc(size: number): Bytes {
    return new Bytes(size);
  }

  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const part = this.subarray(sourceStart, Math.min(sourceEnd, sourceStart + target.length - targetStart));
    target.set(part, targetStart);
    return part.length;
  }

  readUInt32BE(offset = 0): number {
    return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint32(offset, false);
  }

  writeBigUInt64BE(value: bigint, offset = 0): number {
    new DataView(this.buffer, this.byteOffset, this.byteLength).setBigUint64(offset, value, false);
    return offset + 8;
  }

  override toString(encoding?: string): string {
    if (encoding === 'hex') return hex(this);
    return decoder.decode(this);
  }
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// SHA-256 (FIPS 180-4): rundkonstanterna och startvärdena.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const START = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** SHA-256 av hela `message`. */
function sha256(message: Uint8Array): Bytes {
  const length = message.length;
  const blocks = Math.ceil((length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000), false);
  view.setUint32(padded.length - 4, (length * 8) >>> 0, false);
  const h = START.slice();
  const w = new Uint32Array(64);
  for (let block = 0; block < blocks; block++) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block * 64 + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + choose + K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const major = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + major) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  const out = new Bytes(32);
  const outView = new DataView(out.buffer);
  h.forEach((word, i) => outView.setUint32(i * 4, word, false));
  return out;
}

/** En hash som Nodes: update med text (UTF-8) eller bytes, copy, och digest som bytes eller hex. */
export type Hash = { update(data: string | Uint8Array, encoding?: string): Hash; copy(): Hash; digest(): Bytes; digest(encoding: 'hex'): string };

/** En hash över allt som har lagts i `parts`. Kärnan hashar korta texter, så delarna sparas och hashas när de läses. */
function hashOf(parts: Uint8Array[]): Hash {
  const whole = (): Bytes => {
    const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
      all.set(part, at);
      at += part.length;
    }
    return sha256(all);
  };
  const hash: Hash = {
    update(data, encoding) {
      parts.push(typeof data === 'string' ? Bytes.from(data, encoding) : Uint8Array.from(data));
      return hash;
    },
    copy: () => hashOf([...parts]),
    digest: ((encoding?: 'hex') => (encoding === 'hex' ? hex(whole()) : whole())) as Hash['digest'],
  };
  return hash;
}

export function createHash(algorithm: string): Hash {
  if (algorithm !== 'sha256') throw new TypeError(`Hashen ${algorithm} finns inte här, bara sha256`);
  return hashOf([]);
}

// crypto.getRandomValues fyller högst så här många bytes åt gången.
const MOST_RANDOM = 65536;

export function randomFillSync<T extends ArrayBufferView>(target: T): T {
  const bytes = new Uint8Array(target.buffer as ArrayBuffer, target.byteOffset, target.byteLength);
  for (let at = 0; at < bytes.length; at += MOST_RANDOM) globalThis.crypto.getRandomValues(bytes.subarray(at, at + MOST_RANDOM));
  return target;
}

export function randomBytes(size: number): Bytes {
  return randomFillSync(new Bytes(size));
}

export function randomUUID(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // En sida utan säker förbindelse har inte randomUUID: en version 4 ur slumpen (RFC 9562).
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const text = hex(bytes);
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

// Kärnan läser Buffer som global (rng.ts). Den här filen läses före kärnans egna, eftersom de läser node:crypto först.
if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') (globalThis as { Buffer?: unknown }).Buffer = Bytes;
