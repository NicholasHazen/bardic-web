// Voice sources, voices, examples (samples) and the listener's default voice (spec 5.4, V1 to V10).
//
// - The server owns sources and voices; this file only reads them, asks for a re-read when a voice screen opens (V9),
//   and sets a source up. Provider keys are never handled here: the Gemini key is entered on the Premium screen (W4),
//   and a Breeze key is not asked for by any board. Nothing client side reads, stores or logs a key.
// - An example (getVoiceSample) is the only call here that may charge, and only for a premium voice, only when the
//   listener pressed that voice's button, and only with a Gemini key the server accepted. Free examples cost nothing.
// - Choosing a free voice creates the audiobook (free, makes no audio). Choosing a premium voice calls nothing.
import { get, writable } from 'svelte/store';
import { api } from '../api/client';
import { deviceId } from '../lib/device';
import {
  defaultVoiceBody,
  geminiReady,
  isConfigured,
  planFromChapter,
  playingNote,
  sampleCost,
  sampleProblem,
  type Audiobook,
  type ListenerSettings,
  type SourceKind,
  type Voice,
  type VoiceSource,
} from '../lib/voiceText';
import type { components } from '../api/schema';

export type Chapter = components['schemas']['Chapter'];
export type Result<T> = { ok: true; value: T } | { ok: false; detail: string; code?: string };

async function act<T>(run: () => Promise<{ data?: unknown; error?: unknown; response: Response }>): Promise<Result<T>> {
  try {
    const r = await run();
    if (r.response.ok) return { ok: true, value: r.data as T };
    const e = r.error as { code?: string; detail?: string } | undefined;
    return { ok: false, detail: e?.detail ?? 'Something went wrong.', code: e?.code };
  } catch {
    return { ok: false, detail: 'Your Bardic computer could not be reached.', code: 'network' };
  }
}

// ---------------------------------------------------------------- sources and voices

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface SourcesState {
  status: LoadStatus;
  items: VoiceSource[];
  error?: string;
}
export interface VoicesState {
  status: LoadStatus;
  items: Voice[];
}

export const sources = writable<SourcesState>({ status: 'idle', items: [] });
export const voices = writable<VoicesState>({ status: 'idle', items: [] });

const device = () => ({ 'X-Bardic-Device': deviceId() });

export const voiceActions = {
  async loadSources(): Promise<void> {
    sources.update((s) => ({ ...s, status: s.items.length ? s.status : 'loading' }));
    const r = await act<{ items: VoiceSource[] }>(() => api.GET('/api/voice-sources'));
    if (r.ok) sources.set({ status: 'ready', items: r.value.items });
    else sources.update((s) => ({ ...s, status: 'error', error: r.detail }));
  },

  async loadVoices(): Promise<void> {
    voices.update((v) => ({ ...v, status: v.items.length ? v.status : 'loading' }));
    const r = await act<{ items: Voice[] }>(() => api.GET('/api/voices'));
    if (r.ok) voices.set({ status: 'ready', items: r.value.items });
    else voices.update((v) => ({ ...v, status: 'error' }));
  },

  /** Read both lists. */
  async load(): Promise<void> {
    await Promise.all([voiceActions.loadSources(), voiceActions.loadVoices()]);
  },

  /**
   * A voice screen opened: ask each source the listener has set up to re-read its voices (V9), then read the lists.
   * An unreachable source keeps its last known voices on the server, so a failure here is not an error.
   */
  async openVoiceScreen(): Promise<void> {
    await voiceActions.loadSources();
    const configured = get(sources).items.filter((s) => s.kind !== 'local' && isConfigured(s));
    await Promise.all(configured.map((s) => voiceActions.refresh(s.kind, false)));
    await voiceActions.load();
  },

  /** Set a source up or change it. The server tests it first and stores nothing on failure. `body` carries no key from this client. */
  async configure(kind: SourceKind, body: { base_url?: string; enabled?: boolean }): Promise<Result<VoiceSource>> {
    const r = await act<VoiceSource>(() => api.PUT('/api/voice-sources/{source_id}', { params: { path: { source_id: kind }, header: device() }, body }));
    if (r.ok) await voiceActions.load();
    return r;
  },

  async test(kind: SourceKind): Promise<Result<VoiceSource>> {
    const r = await act<VoiceSource>(() => api.POST('/api/voice-sources/{source_id}/test', { params: { path: { source_id: kind }, header: device() } }));
    if (r.ok) await voiceActions.load();
    return r;
  },

  async refresh(kind: SourceKind, reload = true): Promise<Result<VoiceSource>> {
    const r = await act<VoiceSource>(() => api.POST('/api/voice-sources/{source_id}/refresh', { params: { path: { source_id: kind }, header: device() } }));
    if (r.ok && reload) await voiceActions.load();
    return r;
  },

  /** Forget a source's configuration. Audio already made with its voices is kept and stays playable. */
  async remove(kind: SourceKind): Promise<Result<null>> {
    const r = await act<null>(() => api.DELETE('/api/voice-sources/{source_id}', { params: { path: { source_id: kind }, header: device() } }));
    if (r.ok) await voiceActions.load();
    return r;
  },
};

// ---------------------------------------------------------------- a book's context

export interface BookVoiceContext {
  audiobooks: Audiobook[];
  /** "Plan from chapter N": the chapter the listener is in, or null at the start. */
  fromChapter: number | null;
}

/** What the chooser needs to know about the book: its audiobooks and the chapter the listener is in. */
export async function loadBookContext(bookId: string, listenerId: string): Promise<BookVoiceContext> {
  const [abs, book, chapters] = await Promise.all([
    act<{ items: Audiobook[] }>(() => api.GET('/api/books/{book_id}/audiobooks', { params: { path: { book_id: bookId } } })),
    act<components['schemas']['Book']>(() => api.GET('/api/books/{book_id}', { params: { path: { book_id: bookId }, header: { 'X-Bardic-Listener': listenerId } } })),
    act<{ items: Chapter[] }>(() => api.GET('/api/books/{book_id}/chapters', { params: { path: { book_id: bookId } } })),
  ]);
  return {
    audiobooks: abs.ok ? abs.value.items : [],
    fromChapter: book.ok && chapters.ok ? planFromChapter(chapters.value.items, book.value.place?.chapter_id) : null,
  };
}

/** Choosing a free voice: the audiobook for it (made at once, free, no audio). A repeat returns the existing one. */
export function chooseVoiceForBook(bookId: string, voiceId: string): Promise<Result<Audiobook>> {
  return act<Audiobook>(() => api.POST('/api/books/{book_id}/audiobooks', { params: { path: { book_id: bookId }, header: device() }, body: { voice_id: voiceId } }));
}

// ---------------------------------------------------------------- default voice

export interface SettingsState {
  listenerId: string | null;
  status: LoadStatus;
  settings: ListenerSettings | null;
}
export const listenerSettings = writable<SettingsState>({ listenerId: null, status: 'idle', settings: null });

export const settingsActions = {
  async load(listenerId: string): Promise<void> {
    listenerSettings.update((s) => (s.listenerId === listenerId ? { ...s, status: s.settings ? s.status : 'loading' } : { listenerId, status: 'loading', settings: null }));
    const r = await act<ListenerSettings>(() => api.GET('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: listenerId } } }));
    if (get(listenerSettings).listenerId !== listenerId) return;
    if (r.ok) listenerSettings.set({ listenerId, status: 'ready', settings: r.value });
    else listenerSettings.update((s) => ({ ...s, status: 'error' }));
  },

  /** Set the listener's default voice. The server replaces settings as a whole, so the others are sent back as read. */
  async setDefaultVoice(listenerId: string, voiceId: string | null): Promise<Result<ListenerSettings>> {
    let current = get(listenerSettings);
    if (current.listenerId !== listenerId || !current.settings) {
      await settingsActions.load(listenerId);
      current = get(listenerSettings);
    }
    if (!current.settings) return { ok: false, detail: 'Your settings could not be read, so nothing was changed.', code: 'network' };
    const body = defaultVoiceBody(current.settings, voiceId);
    const r = await act<ListenerSettings>(() =>
      api.PUT('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: listenerId }, header: device() }, body }),
    );
    if (r.ok) listenerSettings.set({ listenerId, status: 'ready', settings: r.value });
    return r;
  },
};

// ---------------------------------------------------------------- examples

export type SamplePhase = 'idle' | 'loading' | 'playing' | 'error';
export interface SampleState {
  voiceId: string | null;
  phase: SamplePhase;
  /** What to tell the listener: what is playing and what it costs, or why it could not play. */
  message: string;
}

/** The part of an <audio> element the player uses (tests pass a small fake). */
export type AudioLike = Pick<HTMLAudioElement, 'play' | 'pause' | 'onended' | 'onerror'>;

export interface SampleDeps {
  /** The only call that can charge. Called for a premium voice only after the listener pressed its button. */
  fetchSample(voiceId: string): Promise<{ ok: true; blob: Blob } | { ok: false; code?: string }>;
  makeAudio(url: string): AudioLike;
  objectUrl(blob: Blob): string;
}

export const apiSampleDeps: SampleDeps = {
  async fetchSample(voiceId) {
    try {
      const r = await api.GET('/api/voices/{voice_id}/sample', { params: { path: { voice_id: voiceId } }, parseAs: 'blob' });
      if (r.response.ok && r.data) return { ok: true, blob: r.data as unknown as Blob };
      const e = r.error as { code?: string } | undefined;
      return { ok: false, code: e?.code };
    } catch {
      return { ok: false, code: 'network' };
    }
  },
  makeAudio: (url) => new Audio(url),
  objectUrl: (blob) => URL.createObjectURL(blob),
};

export type SampleVoice = Pick<Voice, 'id' | 'name' | 'tier' | 'available' | 'revision'>;

export interface SamplePlayer {
  subscribe: (run: (s: SampleState) => void) => () => void;
  /** Press a voice's example button: play it, stop it if it is playing, or say what stops it. */
  hear(v: SampleVoice, geminiOk: boolean): Promise<void>;
  stop(): void;
}

const IDLE: SampleState = { voiceId: null, phase: 'idle', message: '' };

export function createSamplePlayer(deps: SampleDeps): SamplePlayer {
  const state = writable<SampleState>(IDLE);
  // One example at a time. Examples are kept per voice revision, so a repeat plays again without another request.
  const cache = new Map<string, string>();
  let audio: AudioLike | null = null;
  let turn = 0;

  const halt = () => {
    turn++;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio = null;
    }
  };

  return {
    subscribe: state.subscribe,
    stop() {
      halt();
      state.set(IDLE);
    },
    async hear(v, geminiOk) {
      const current = get(state);
      if (current.voiceId === v.id && (current.phase === 'playing' || current.phase === 'loading')) {
        halt();
        state.set(IDLE);
        return;
      }
      halt();
      const cost = sampleCost(v, geminiOk);
      if (cost.kind === 'needs_key') {
        state.set({ voiceId: v.id, phase: 'error', message: `${cost.note} Add one in Settings › Voices.` });
        return;
      }
      if (!cost.canHear) {
        state.set({ voiceId: v.id, phase: 'error', message: `${v.name} can’t be heard until its source is reachable.` });
        return;
      }
      const mine = ++turn;
      const key = `${v.id}@${v.revision}`;
      let url = cache.get(key);
      const repeat = !!url;
      state.set({ voiceId: v.id, phase: 'loading', message: cost.kind === 'counts' ? `Getting a short example of ${v.name}. It counts toward spending.` : `Getting an example of ${v.name}.` });
      if (!url) {
        const r = await deps.fetchSample(v.id);
        if (mine !== turn) return;
        if (!r.ok) {
          state.set({ voiceId: v.id, phase: 'error', message: sampleProblem(v.name, r.code) });
          return;
        }
        url = deps.objectUrl(r.blob);
        cache.set(key, url);
      }
      const a = deps.makeAudio(url);
      audio = a;
      a.onended = () => {
        if (mine === turn) {
          audio = null;
          state.set(IDLE);
        }
      };
      a.onerror = () => {
        if (mine === turn) state.set({ voiceId: v.id, phase: 'error', message: sampleProblem(v.name, undefined) });
      };
      try {
        await a.play();
        if (mine === turn) state.set({ voiceId: v.id, phase: 'playing', message: playingNote(v.name, cost, repeat) });
      } catch {
        if (mine === turn) state.set({ voiceId: v.id, phase: 'error', message: sampleProblem(v.name, undefined) });
      }
    },
  };
}

/** The player the screens use. */
export const samples = createSamplePlayer(apiSampleDeps);

export { geminiReady };
