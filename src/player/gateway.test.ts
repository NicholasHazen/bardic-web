import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('../api/client', () => ({ api: { POST: post } }));

import { apiGateway } from '../state/book';
import { apiPlayerApi } from './gateway';

beforeEach(() => post.mockReset());

describe('chapter metadata gateway', () => {
  it('posts a device-scoped metadata refresh and returns all server chapters', async () => {
    const chapters = [{ id: 'chapter-1', index: 1, title: 'The Lantern River', kind: 'story', word_count: 5, text_sha256: 'synthetic' }];
    post.mockResolvedValue({ data: { items: chapters }, response: { ok: true, status: 200 } });
    expect(await apiGateway.refreshChapters('book-1')).toEqual({ ok: true, value: chapters });
    expect(post).toHaveBeenCalledWith('/api/books/{book_id}/chapters/refresh', {
      params: { path: { book_id: 'book-1' }, header: { 'X-Bardic-Device': expect.any(String) } },
    });
  });

  it('retains the server refusal code and detail', async () => {
    post.mockResolvedValue({ error: { code: 'chapter_structure_changed', detail: 'Chapter metadata was kept.' }, response: { ok: false, status: 409 } });
    expect(await apiGateway.refreshChapters('book-1')).toMatchObject({ ok: false, status: 409, code: 'chapter_structure_changed', detail: 'Chapter metadata was kept.' });
  });
});

describe('free player generation gateway', () => {
  it.each([0, 2])('honors the requested chapter while excluding matter from %i following chapters', async (ahead) => {
    const job = { id: 'job-1' };
    post.mockResolvedValue({ data: job, response: { ok: true, status: 202 } });
    expect(await apiPlayerApi.requestChapter('listener-1', 'audiobook-1', 'front-matter-1', ahead)).toEqual({ ok: true, value: { kind: 'job', job } });
    expect(post).toHaveBeenCalledWith('/api/audiobooks/{audiobook_id}/chapters/{chapter_id}/request', {
      params: {
        path: { audiobook_id: 'audiobook-1', chapter_id: 'front-matter-1' },
        header: { 'X-Bardic-Listener': 'listener-1', 'X-Bardic-Device': expect.any(String) },
      },
      body: { ahead, include_matter: false },
      fetch: expect.any(Function),
    });
  });
});
