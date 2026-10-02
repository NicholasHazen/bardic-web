// Exercise the real browser database, including engines that cannot persist Blob values.
import { test, expect } from './fixtures';
import { apiCall } from './harness';

test('audio parts survive Blob storage refusal, incomplete replacement and a fresh page', async ({ page, stack }) => {
  const listener = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Storage listener' })).json.id as string;
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), listener);
  await page.goto('/?e2e=offline');
  await page.waitForFunction(() => !!window.__offlineKit);
  const result = await page.evaluate(async () => {
    const store = window.__offlineKit!.realStore;
    const originalPut = IDBObjectStore.prototype.put;
    let blobAttempts = 0;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'parts' && value instanceof Blob) {
        blobAttempts++;
        throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
      }
      return originalPut.call(this, value, key);
    };
    try {
      await store.appendPart('storage-audio', 0, new Blob(['signal-']));
      await store.appendPart('storage-audio', 1, new Blob(['🌿']));
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
    const text = 'Signal 🌿 stayed green.';
    const digest = async (bytes: BufferSource) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((n) => n.toString(16).padStart(2, '0')).join('');
    const record = {
      audiobookId: 'storage-audiobook', chapterId: 'storage-chapter', bookId: 'storage-book', audioId: 'storage-audio',
      bytes: 11, sha256: await digest(await (await store.readAudio('storage-audio'))!.arrayBuffer()), contentType: 'audio/wav',
      durationSeconds: 1, voiceName: 'Mara', voiceRevision: 'synthetic-r1', textSha256: await digest(new TextEncoder().encode(text)),
      textBytes: 25, storedAt: Date.now(), verifiedAt: Date.now(),
    };
    const content = { text, lines: [{ id: 'synthetic-line', start: 0, end: [...text].length }], timings: [{ line_id: 'synthetic-line', start_ms: 0, end_ms: 1000 }] };
    await store.commitChapter(record, content);
    await store.appendPart('incomplete-audio', 0, new Blob(['short']));
    let incompleteRejected = false;
    try { await store.commitChapter({ ...record, audioId: 'incomplete-audio' }, content); } catch { incompleteRejected = true; }
    return {
      blobAttempts, incompleteRejected, partial: await store.partial('storage-audio'),
      audio: await (await store.readAudio('storage-audio'))!.text(),
      keptAudio: (await store.chapter('storage-audiobook', 'storage-chapter'))!.audioId,
      usage: await store.usage(),
    };
  });
  expect(result).toMatchObject({ blobAttempts: 1, incompleteRejected: true, partial: { bytes: 11, parts: 2 }, audio: 'signal-🌿', keptAudio: 'storage-audio' });
  expect(result.usage).toEqual({ audioBytes: 11, textBytes: 25, partialBytes: 5, total: 41 });
  await page.reload();
  await page.waitForFunction(() => !!window.__offlineKit);
  expect(await page.evaluate(async () => {
    const store = window.__offlineKit!.realStore;
    return { audio: await (await store.readAudio('storage-audio'))!.text(), text: (await store.content('storage-audiobook', 'storage-chapter'))!.text };
  })).toEqual({ audio: 'signal-🌿', text: 'Signal 🌿 stayed green.' });
});
