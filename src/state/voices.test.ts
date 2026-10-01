import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { method: string; path: string; init?: { body?: unknown; params?: unknown } }[] = [];
let responses: Record<string, { status?: number; data?: unknown; error?: unknown }> = {};
vi.mock('../api/client', () => {
  const run = (method: string) => async (path: string, init?: { body?: unknown; params?: unknown }) => {
    calls.push({ method, path, init });
    const r = responses[`${method} ${path}`] ?? { status: 200, data: {} };
    const status = r.status ?? 200;
    return { data: r.data, error: r.error, response: { ok: status >= 200 && status < 300, status } };
  };
  return { api: { GET: run('GET'), PUT: run('PUT'), POST: run('POST'), DELETE: run('DELETE') }, setListener: () => {} };
});

import { get } from 'svelte/store';
import { chooseVoiceForBook, createSamplePlayer, listenerSettings, settingsActions, type AudioLike, type SampleDeps, type SampleVoice } from './voices';

const kore: SampleVoice = { id: 'kore', name: 'Kore', tier: 'premium', available: true, revision: 'r1' };
const amber: SampleVoice = { id: 'amber', name: 'Amber', tier: 'free', available: true, revision: 'r1' };

class FakeAudio {
  onended: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: unknown) => unknown) | null = null;
  constructor(readonly src: string) {}
  async play() {}
  pause() {}
  ended() {
    this.onended?.(new Event('ended'));
  }
}

function deps(over: Partial<SampleDeps> = {}) {
  const fetched: string[] = [];
  const audios: FakeAudio[] = [];
  const d: SampleDeps = {
    fetchSample: async (id) => {
      fetched.push(id);
      return { ok: true, blob: new Blob(['x']) };
    },
    objectUrl: () => `blob:${fetched.length}`,
    makeAudio: (url) => {
      const a = new FakeAudio(url);
      audios.push(a);
      return a as unknown as AudioLike;
    },
    ...over,
  };
  return { d, fetched, audios };
}

describe('the example player', () => {
  it('plays a free example without needing a key and says nothing is spent', async () => {
    const { d, fetched } = deps();
    const p = createSamplePlayer(d);
    await p.hear(amber, false);
    expect(fetched).toEqual(['amber']);
    expect(get(p)).toEqual({ voiceId: 'amber', phase: 'playing', message: 'Playing Amber. Nothing is spent.' });
  });

  it('never requests a premium example without a Google key, and explains', async () => {
    const { d, fetched } = deps();
    const p = createSamplePlayer(d);
    await p.hear(kore, false);
    expect(fetched).toEqual([]);
    expect(get(p).phase).toBe('error');
    expect(get(p).message).toMatch(/Google key is needed/);
  });

  it('requests a premium example once per revision: a repeat plays again without another request', async () => {
    const { d, fetched, audios } = deps();
    const p = createSamplePlayer(d);
    await p.hear(kore, true);
    expect(get(p).message).toBe('Playing a short example of Kore. It counts toward spending.');
    audios[0]!.ended();
    expect(get(p).phase).toBe('idle');
    await p.hear(kore, true);
    expect(fetched).toEqual(['kore']);
    expect(get(p).message).toBe('Playing Kore again. A repeat is free.');
    await p.hear({ ...kore, revision: 'r2' }, true);
    expect(fetched).toEqual(['kore']); // playing: this press stops it
    expect(get(p).phase).toBe('idle');
  });

  it('stops when the playing voice is pressed again, and switches when another is pressed', async () => {
    const { d, fetched } = deps();
    const p = createSamplePlayer(d);
    await p.hear(amber, false);
    await p.hear(amber, false);
    expect(get(p).phase).toBe('idle');
    await p.hear(amber, false);
    await p.hear({ ...amber, id: 'bram', name: 'Bram' }, false);
    expect(get(p).voiceId).toBe('bram');
    expect(fetched).toEqual(['amber', 'bram']);
  });

  it('says why an example could not be played', async () => {
    const { d } = deps({ fetchSample: async () => ({ ok: false, code: 'key_rejected' }) });
    const p = createSamplePlayer(d);
    await p.hear(kore, true);
    expect(get(p)).toMatchObject({ phase: 'error', voiceId: 'kore' });
    expect(get(p).message).toMatch(/Google rejected the key/);
  });

  it('does not request an example for a voice that cannot be reached', async () => {
    const { d, fetched } = deps();
    const p = createSamplePlayer(d);
    await p.hear({ ...amber, available: false }, false);
    expect(fetched).toEqual([]);
    expect(get(p).message).toMatch(/reachable/);
  });
});

describe('default voice', () => {
  beforeEach(() => {
    calls.length = 0;
    responses = {};
    listenerSettings.set({ listenerId: null, status: 'idle', settings: null });
  });

  it('reads the settings, then sends them back whole with only the default voice changed', async () => {
    responses['GET /api/listeners/{listener_id}/settings'] = { data: { default_voice_id: null, place_conflict: 'newest', continue_into_next_chapter: false } };
    responses['PUT /api/listeners/{listener_id}/settings'] = { data: { default_voice_id: 'kore', place_conflict: 'newest', continue_into_next_chapter: false } };
    const r = await settingsActions.setDefaultVoice('l1', 'kore');
    expect(r.ok).toBe(true);
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.init?.body).toEqual({ default_voice_id: 'kore', place_conflict: 'newest', continue_into_next_chapter: false });
    expect(get(listenerSettings).settings?.default_voice_id).toBe('kore');
  });

  it('changes nothing when the settings cannot be read', async () => {
    responses['GET /api/listeners/{listener_id}/settings'] = { status: 500, error: { code: 'server_error', detail: 'x' } };
    const r = await settingsActions.setDefaultVoice('l1', 'kore');
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('keeps the old default when the server refuses the voice', async () => {
    listenerSettings.set({ listenerId: 'l1', status: 'ready', settings: { default_voice_id: 'a', place_conflict: 'ask', continue_into_next_chapter: true } });
    responses['PUT /api/listeners/{listener_id}/settings'] = { status: 404, error: { code: 'voice_not_found', detail: 'No such voice.' } };
    const r = await settingsActions.setDefaultVoice('l1', 'gone');
    expect(r).toMatchObject({ ok: false, code: 'voice_not_found' });
    expect(get(listenerSettings).settings?.default_voice_id).toBe('a');
  });
});

describe('choosing a voice for a book', () => {
  it('asks for the audiobook of that voice and nothing else', async () => {
    calls.length = 0;
    responses['POST /api/books/{book_id}/audiobooks'] = { status: 201, data: { id: 'ab1' } };
    const r = await chooseVoiceForBook('b1', 'amber');
    expect(r.ok).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/books/{book_id}/audiobooks']);
    expect(calls[0]!.init?.body).toEqual({ voice_id: 'amber' });
  });
});
