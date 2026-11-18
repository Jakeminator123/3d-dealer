// Vad som saknar film än, som visningen säger det överst: de kort i en runda som läggs utan dealerns rörelse.

import { DEALER, VIEW } from '../casino/link.ts';
import { planRound, type Deal, type RoundEntry } from '../scene/round.ts';

const ORDINALS = ['första', 'andra', 'tredje', 'fjärde'];

/** Platserna som ord: `1`, `1 och 4`, `1, 4 och 7`. */
export const listed = (items: string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} och ${items.at(-1)}`);

/**
 * Vad som saknar film än, som en mening: de kort som registret inte har något godkänt klipp till för dealern och vyn,
 * med samma val som när rundan spelas (planRound i src/scene/round.ts). Dealerns kort, och spelarnas kort för kort på
 * platserna `seats`. Ett kort på en delad hand har aldrig klipp: klippen lägger på platsens första hand.
 */
export function withoutFilm(entries: RoundEntry[], seats: number[]): string {
  const deal = (seat: number | 'D', index: number, action: Deal['action'] = 'deal'): Deal => ({ seat, hand: 0, index, face: null, action });
  const dealers = [deal('D', 0), deal('D', 1, 'hole'), deal('D', 1, 'flip'), deal('D', 2)];
  const players = ORDINALS.map((_, index) => seats.map((seat) => deal(seat, index)));
  const plan = planRound([...dealers, ...players.flat()], entries, DEALER, VIEW, { seconds: 1, turn: 1, move: 1 });
  const key = (one: Deal): string => `${one.seat}/${one.index}/${one.action}`;
  const missing = new Set(plan.missing.map(key));
  const parts: string[] = [];
  const dealerLacks = dealers.filter((one) => missing.has(key(one)));
  if (dealerLacks.length === dealers.length) parts.push('dealerns egna kort');
  else if (dealerLacks.length > 0) parts.push(`dealerns kort ${listed(dealerLacks.map((one) => `${one.index}${one.action === 'deal' ? '' : ` (${one.action})`}`))}`);
  for (const [index, row] of players.entries()) {
    const lacking = row.filter((one) => missing.has(key(one))).map((one) => String(one.seat));
    if (lacking.length === row.length) {
      parts.push(index === 0 ? 'spelarnas kort' : `spelarnas ${ORDINALS[index]} kort och fler`);
      break;
    }
    if (lacking.length > 0) parts.push(`${ORDINALS[index]} kortet till plats ${listed(lacking)}`);
  }
  parts.push('kort på en delad hand');
  // Med fler än två delar skiljs den sista av med komma, eftersom delarna själva kan bära ett och.
  const text = parts.length > 2 ? `${parts.slice(0, -1).join(', ')}, och ${parts.at(-1)}` : listed(parts);
  return `Utan film än: ${text}. De läggs utan hennes rörelse.`;
}
