import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../lib/clock';
import { PlaceQueue, type PlaceInput } from './queue';

const input = (offset: number, base = 1): PlaceInput => ({ chapter_id: 'c1', offset, mode: 'listening', audiobook_id: 'ab1', base_revision: base });

describe('PlaceQueue', () => {
  it('coalesces writes for one book: the latest wins, the order of first queueing is kept', () => {
    const q = new PlaceQueue(memoryStorage());
    q.put('l1', 'bookA', input(10), 100);
    q.put('l1', 'bookB', input(5), 200);
    q.put('l1', 'bookA', input(40), 300);
    expect(q.size).toBe(2);
    expect(q.all().map((e) => `${e.bookId}:${e.input.offset}`)).toEqual(['bookA:40', 'bookB:5']);
  });
  it('is kept across a reload', () => {
    const storage = memoryStorage();
    new PlaceQueue(storage).put('l1', 'bookA', input(10), 100);
    const again = new PlaceQueue(storage);
    expect(again.get('l1', 'bookA')!.input.offset).toBe(10);
  });
  it('an acknowledgement for an older write does not remove a newer one', () => {
    const q = new PlaceQueue(memoryStorage());
    const first = q.put('l1', 'bookA', input(10), 1);
    const sent = first.seq;
    q.put('l1', 'bookA', input(20), 2);
    expect(q.remove('l1', 'bookA', sent)).toBe(false);
    expect(q.get('l1', 'bookA')!.input.offset).toBe(20);
    expect(q.remove('l1', 'bookA', q.get('l1', 'bookA')!.seq)).toBe(true);
    expect(q.size).toBe(0);
  });
  it('rebases to the server revision', () => {
    const q = new PlaceQueue(memoryStorage());
    q.put('l1', 'bookA', input(10, 3), 1);
    q.rebase('l1', 'bookA', 9);
    expect(q.get('l1', 'bookA')!.input.base_revision).toBe(9);
  });
  it('ignores a damaged store', () => {
    const storage = memoryStorage({ 'bardic.placequeue': '{not json' });
    expect(new PlaceQueue(storage).size).toBe(0);
    const odd = memoryStorage({ 'bardic.placequeue': JSON.stringify([{ nope: 1 }]) });
    expect(new PlaceQueue(odd).size).toBe(0);
  });
});
