import { describe, expect, it } from 'vitest';
import { isQuotaError, memoryStore, withQuota, type ChapterContent, type ChapterRecord } from './store';

const rec = (over: Partial<ChapterRecord> = {}): ChapterRecord => ({
  audiobookId: 'a',
  chapterId: 'c',
  bookId: 'b',
  audioId: 'au1',
  bytes: 10,
  sha256: 'x',
  contentType: 'audio/wav',
  durationSeconds: 1,
  voiceName: 'Mara',
  voiceRevision: 'r1',
  textSha256: 't',
  textBytes: 5,
  storedAt: 1,
  verifiedAt: null,
  ...over,
});
const content: ChapterContent = { text: 'hello', lines: [{ id: 'l', start: 0, end: 5 }], timings: [{ line_id: 'l', start_ms: 0, end_ms: 9 }] };

describe('the memory store', () => {
  it('stores audio as parts that must arrive in order, and reports how much is there', async () => {
    const s = memoryStore();
    await s.appendPart('au1', 0, new Blob(['12345']));
    await expect(s.appendPart('au1', 2, new Blob(['x']))).rejects.toThrow();
    await s.appendPart('au1', 1, new Blob(['67890']));
    expect(await s.partial('au1')).toEqual({ bytes: 10, parts: 2 });
    expect(await (await s.readAudio('au1'))!.text()).toBe('1234567890');
    expect(await s.readAudio('nope')).toBeNull();
  });
  it('commits a chapter only when the audio is all there, and leaves the old copy alone when it refuses', async () => {
    const s = memoryStore();
    await s.appendPart('au1', 0, new Blob(['12345']));
    await expect(s.commitChapter(rec(), content)).rejects.toThrow(/5 bytes/);
    expect(await s.chapter('a', 'c')).toBeNull();
    await s.appendPart('au1', 1, new Blob(['67890']));
    expect(await s.commitChapter(rec(), content)).toBeNull();
    // a replacement that is short is refused and the held chapter is untouched
    await s.appendPart('au2', 0, new Blob(['abc']));
    await expect(s.commitChapter(rec({ audioId: 'au2', bytes: 10 }), content)).rejects.toThrow();
    expect((await s.chapter('a', 'c'))!.audioId).toBe('au1');
    expect(await s.readAudio('au1')).not.toBeNull();
    // a complete one swaps, and the old audio goes in the same step
    await s.appendPart('au2', 1, new Blob(['defghij']));
    const replaced = await s.commitChapter(rec({ audioId: 'au2', bytes: 10 }), content);
    expect(replaced!.audioId).toBe('au1');
    expect(await s.readAudio('au1')).toBeNull();
  });
  it('counts what it holds and what is still partial', async () => {
    const s = memoryStore();
    await s.appendPart('au1', 0, new Blob(['1234567890']));
    await s.commitChapter(rec(), content);
    await s.appendPart('au9', 0, new Blob(['xyz']));
    expect(await s.usage()).toEqual({ audioBytes: 10, textBytes: 5, partialBytes: 3, total: 18 });
  });
  it('keeps small values by prefix', async () => {
    const s = memoryStore();
    await s.setValue('book:a', 1);
    await s.setValue('book:b', 2);
    await s.setValue('other', 3);
    expect((await s.listValues<number>('book:')).map((x) => x.value)).toEqual([1, 2]);
    expect(await s.getValue('missing')).toBeNull();
  });
});

describe('a store with a quota', () => {
  it('throws the error a full device throws', async () => {
    const s = withQuota(memoryStore(), 8);
    await s.appendPart('au1', 0, new Blob(['12345']));
    let caught: unknown;
    await s.appendPart('au1', 1, new Blob(['67890'])).catch((e) => (caught = e));
    expect(isQuotaError(caught)).toBe(true);
    expect((caught as DOMException).name).toBe('QuotaExceededError');
  });
});
