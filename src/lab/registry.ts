// Registret så som Labbet ser det: hämtat från servern och ordnat i numrerade avdelningar.

export type Asset = {
  file: string;
  group: string;
  title: string;
  status: string;
  present: boolean;
  statusBy?: string;
  /** Jakobs egna ord om filen, och agentens svar på dem. */
  comment?: string;
  commentAt?: string;
  reply?: string;
  replyAt?: string;
  note?: string;
  width?: number;
  height?: number;
  bytes?: number;
  seconds?: number;
  fps?: number;
  source?: Record<string, unknown>;
  [field: string]: unknown;
};

export type Registry = {
  statuses: Record<string, string>;
  /** De statusar som ber om en motivering. */
  asksWhy?: string[];
  groups: Record<string, string>;
  sources: Record<string, { what?: string }>;
  assets: Asset[];
  unregistered: string[];
};

export type Kind = 'bild' | 'film' | 'modell';

/** En fil med sin plats i visningen. Numret räknas inom avdelningen, i registrets ordning. */
export type Item = { asset: Asset; kind: Kind; section: string; number: number };

export type Section = { key: string; label: string; items: Item[] };

const GROUP_LABELS: Record<string, string> = {
  identity: 'Identitet',
  anchors: 'Ankare',
  backgrounds: 'Bakgrunder',
  materials: 'Material',
  models: 'Modeller',
  reference: 'Referens',
};

export function kindOf(file: string): Kind {
  const ending = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  if (ending === 'mp4' || ending === 'webm') return 'film';
  if (ending === 'glb' || ending === 'gltf') return 'modell';
  return 'bild';
}

/**
 * Avdelningarna i registrets egen gruppordning. En grupp som har både stillbilder och filmer
 * blir två avdelningar, så att filmerna numreras för sig.
 */
export function sectionsOf(registry: Registry): Section[] {
  const groups = [...new Set([...Object.keys(registry.groups), ...registry.assets.map((asset) => asset.group)])];
  const sections: Section[] = [];
  for (const group of groups) {
    const members = registry.assets.filter((asset) => asset.group === group);
    const films = members.filter((asset) => kindOf(asset.file) === 'film');
    const stills = members.filter((asset) => kindOf(asset.file) !== 'film');
    const label = GROUP_LABELS[group] ?? group;
    const split = films.length > 0 && stills.length > 0;
    const add = (key: string, name: string, assets: Asset[]) => {
      if (assets.length === 0) return;
      const items = assets.map((asset, index) => ({ asset, kind: kindOf(asset.file), section: key, number: index + 1 }));
      sections.push({ key, label: name, items });
    };
    add(group, split ? `${label}, bilder` : label, stills);
    add(split ? `${group}-filmer` : group, split ? `${label}, filmer` : label, films);
  }
  return sections;
}

const encodePath = (file: string): string => file.split('/').map(encodeURIComponent).join('/');

export const mediaUrl = (file: string): string => `/media/${encodePath(file)}`;
export const thumbUrl = (file: string, width: number): string => `/thumb/${encodePath(file)}?w=${width}`;

export async function fetchRegistry(): Promise<Registry> {
  const response = await fetch('/api/registry');
  if (!response.ok) throw new Error(`Registret gick inte att läsa (${response.status})`);
  return (await response.json()) as Registry;
}

async function post(path: string, body: unknown, failure: string): Promise<Registry> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(problem?.error ?? `${failure} (${response.status})`);
  }
  return (await response.json()) as Registry;
}

export const saveStatus = (file: string, status: string): Promise<Registry> =>
  post('/api/registry/status', { file, status }, 'Omdömet gick inte att spara');

export const saveComment = (file: string, comment: string): Promise<Registry> =>
  post('/api/registry/comment', { file, comment }, 'Orden gick inte att spara');

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}
