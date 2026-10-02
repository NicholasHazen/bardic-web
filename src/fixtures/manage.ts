// Synthetic data for the book management boards (W6): BookMenu, FreeSpace, DeleteConfirm, DeleteUndo, ServerName.
// Original text only; the names are the boards' own.
import { colors } from './library';
import { deleteList, freeSpaceSummary } from '../views/manage/logic';
import type { BookCardModel } from '../views/library/types';
import type { SpaceRow } from '../views/manage/types';

export const book = { title: 'The Ash Ledger', author: 'Odile Brandt', color: colors.ash, seriesLine: 'The Ashmark Cycle · Volume 2', meta: '22 chapters · 74,200 words', chapters: 22, words: 74200 };

const usd = (micros: number) => ({ micros, currency: 'USD' });

export const samantha: SpaceRow = { id: 'samantha', name: 'Samantha', premium: false, chaptersReady: 8, chaptersTotal: 22, bytes: 160_000_000, remake: null };
/** Premium: making it again would cost $1.80 to $2.60. */
export const kore: SpaceRow = {
  id: 'kore',
  name: 'Kore',
  premium: true,
  chaptersReady: 13,
  chaptersTotal: 22,
  bytes: 310_000_000,
  remake: { low: usd(1_800_000), likely: usd(2_200_000), high: usd(2_600_000), basis: 'provider' },
};
export const spaceRows: SpaceRow[] = [samantha, kore];
export const chosenFree = new Set([samantha.id]);

export const menuFreeSummary = freeSpaceSummary(spaceRows);
export const deleteRows = deleteList({ chapters: book.chapters, words: book.words }, spaceRows);

/** The Library behind the Deleting banner: the book being deleted is already hidden. */
export const libraryAfterDelete: BookCardModel[] = [
  { id: 'lantern', title: 'Lanternfall', subtitle: 'Vol. 1', color: colors.lantern, onDevice: true },
  { id: 'hollow', title: 'Hollow Tide', subtitle: 'Vol. 4', color: colors.hollow, onDevice: true },
  { id: 'salt', title: 'The Salt Road', subtitle: 'Tamsin Hale', color: '#8a5a34' },
];

export const serverName = 'Nick’s Mac mini';
export const serverDetails = [
  { label: 'Address', value: 'bardic.local:8765' },
  { label: 'Version', value: '2.0.0' },
  { label: 'Data folder', value: '/Users/nick/Bardic' },
  { label: 'Free space', value: '312 GB' },
];
