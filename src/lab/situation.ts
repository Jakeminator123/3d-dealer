// Läget i dag, räknat ur registret och tagningarna som servern ger dem: vad som väntar på Jakob, vad som väntar på
// agenten, och vad som finns. Översikten och menyns märke läser härifrån. Inga tal står här: allt räknas ur svaren.

import { shownText } from './names.ts';
import { sectionsOf, type Asset, type Registry } from './registry.ts';
import { routeTo } from './route.ts';
import type { Takes } from './takes.ts';

/** Något som väntar: på Jakob (`dig`) eller på agenten. `href` är stället i Labbet där det syns. */
export type Need = { key: string; on: 'dig' | 'agenten'; count: number; title: string; what: string; href: string; go: string };

/** Om omdömet är Jakobs eget: servern skriver hans omdömen i Labbet som "Jakob i Labbet …". */
export const byJakob = (asset: Pick<Asset, 'statusBy'>): boolean => typeof asset.statusBy === 'string' && asset.statusBy.startsWith('Jakob');

const files = (count: number): string => (count === 1 ? 'fil' : 'filer');
const titles = (assets: Asset[]): string => {
  const names = assets.slice(0, 3).map((asset) => shownText(asset.title));
  return assets.length > 3 ? `${names.join(', ')} och ${assets.length - 3} till` : names.join(', ');
};

/** Det som väntar, på Jakob först. */
export function needsOf(registry: Registry, takes: Takes | null): Need[] {
  const needs: Need[] = [];
  const status = (name: string): Asset[] => registry.assets.filter((asset) => asset.status === name);

  const toJudge = status('att granska');
  if (toJudge.length > 0) {
    needs.push({ key: 'att-granska', on: 'dig', count: toJudge.length, title: `${files(toJudge.length)} väntar på omdöme`, what: titles(toJudge), href: routeTo('granska', 'alla', 'status', 'att granska'), go: 'Döm i Granska' });
  }
  const unseen = registry.assets.filter((asset) => asset.group === 'clips' && asset.status === 'godkänd' && !byJakob(asset));
  if (unseen.length > 0) {
    needs.push({
      key: 'osedda',
      on: 'dig',
      count: unseen.length,
      title: `godkända klipp som bara en granskare har dömt`,
      what: 'Om rörelsen ser mänsklig ut avgör du med ögat: se klippen mot dockan, och ändra omdömet i Granska om du inte håller med.',
      href: routeTo('klipp'),
      go: 'Se dem i Klipp',
    });
  }
  const going = status('utgår');
  if (going.length > 0) {
    needs.push({ key: 'utgar', on: 'dig', count: going.length, title: `${files(going.length)} har fått utgår`, what: `${titles(going)}. Tas bort vid nästa arbetspass om du inte ändrar omdömet.`, href: routeTo('granska', 'alla', 'status', 'utgår'), go: 'Se dem i Granska' });
  }
  const again = status('granska igen');
  if (again.length > 0) {
    needs.push({ key: 'igen', on: 'agenten', count: again.length, title: `${files(again.length)} som du har bett agenten se igen`, what: `${titles(again)}. Agenten läser kön i början av varje arbetspass, rättar och svarar.`, href: routeTo('granska', 'alla', 'status', 'granska igen'), go: 'Se dem i Granska' });
  }
  const waiting = takes?.waiting ?? [];
  if (waiting.length > 0) {
    needs.push({
      key: 'paket',
      on: 'agenten',
      count: waiting.length,
      title: waiting.length === 1 ? 'tagning är förberedd och väntar på beställning' : 'tagningar är förberedda och väntar på beställning',
      what: 'Agenten laddar upp paketets filer och beställer filmen genom Runways MCP-server. Säg till i chatten.',
      href: routeTo('docka', 'tagning'),
      go: 'Se paketen i Dockan',
    });
  }
  return needs;
}

/** En avdelning i registret: hur många filer och hur många med varje omdöme. */
export type Holding = { key: string; label: string; count: number; statuses: [string, number][]; href: string };

export function holdingsOf(registry: Registry): Holding[] {
  return sectionsOf(registry).map((section) => {
    const counted = new Map<string, number>();
    for (const item of section.items) counted.set(item.asset.status, (counted.get(item.asset.status) ?? 0) + 1);
    const order = Object.keys(registry.statuses);
    const statuses = [...counted.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    return { key: section.key, label: section.label, count: section.items.length, statuses, href: routeTo('granska', section.key) };
  });
}

/** Agentens senaste svar på Jakobs ord, nyast först. */
export function repliesOf(registry: Registry, most = 3): Asset[] {
  return registry.assets
    .filter((asset) => typeof asset.reply === 'string' && asset.reply !== '')
    .sort((a, b) => String(b.replyAt ?? '').localeCompare(String(a.replyAt ?? '')))
    .slice(0, most);
}
