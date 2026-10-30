import { ITEMS_DB } from '../data/deadlockData';
import type { CounterRole, QueueEntry } from '../services/recommendations';

/** A queue entry for an item, as the buy queue holds it. */
export const entry = (id: string, role?: CounterRole): QueueEntry => ({
  item: ITEMS_DB[id],
  reason: '',
  ...(role ? { role } : {}),
});

/** The item ids of a queue, in order. */
export const ids = (queue: QueueEntry[]) => queue.map((e) => e.item.id);

/** A build that takes weapon to 4,800 first (Healbane on the way), then spirit, then vitality. */
export const SPIKE_BUILD = [
  'extended_magazine',
  'tesla_bullets',
  'healbane',
  'long_range',
  'extra_spirit',
  'slowing_hex',
  'mystic_vulnerability',
  'mystic_slow',
  'metal_skin',
];
