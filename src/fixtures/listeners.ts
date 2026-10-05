// Synthetic listeners and books for the listener boards. Original names only.
import type { ListenerRow, ShelfBook } from '../views/listeners/types';

export const nick: ListenerRow = { id: 'fx-nick', name: 'Nick', hue: 38, detail: 'Listened today' };
export const sam: ListenerRow = { id: 'fx-sam', name: 'Sam', hue: 175, detail: 'Listened 3 days ago' };
export const riley: ListenerRow = { id: 'fx-riley', name: 'Riley', hue: 268, detail: 'Listened last month' };
export const jo: ListenerRow = { id: 'fx-jo', name: 'Jo', hue: 340, detail: 'Not started yet' };

export const household: ListenerRow[] = [nick, sam, riley, jo];

/** What is on Home behind the switcher. */
export const onDevice: ShelfBook[] = [
  { title: 'The Ash Ledger', second: '34%', color: '#c65a43', onDevice: true, progress: 0.34 },
  { title: 'Lanternfall', second: 'Odile Brandt', color: '#3f6f8f', onDevice: true },
  { title: 'Hollow Tide', second: 'Odile Brandt', color: '#4c7a5a', onDevice: true },
];
export const recent: ShelfBook[] = [
  { title: 'The Salt Road', second: 'Tamsin Hale', color: '#8a5a34' },
  { title: 'A Small Weather', second: 'Jonah Pryce', color: '#6b5a8c' },
  { title: 'Winterhouse Letters', second: 'R. K. Osei', color: '#4a5568' },
];
