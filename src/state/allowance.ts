// The Gemini account and the Allowance (spec 5.4 V2/V5, 5.8 PL8 to PL11).
//
// - The provider key is WRITE-ONLY. `keyActions.check(key)` hands the text to one request and keeps nothing: no store,
//   no module variable, no log, no message built from it. What comes back (a VoiceSource) has `has_key`, never a key.
//   Error words are chosen from the server's error code, never from its text (see lib/accountText.ts).
// - Nothing here can start paid work. The key check reads the model list (free); the Allowance only sets limits.
// - Money is integer micros end to end; the form sends what parseMicros produced.
import { get, writable } from 'svelte/store';
import { api } from '../api/client';
import { deviceId } from '../lib/device';
import {
  allowanceErrorWords,
  checkLimits,
  keptByKeyProblem,
  keyErrorWords,
  type Allowance,
  type Kept,
  type LimitForm,
  type Price,
  type Words,
} from '../lib/accountText';
import type { VoiceSource } from '../lib/voiceText';
import { listenerStore } from './listener';
import { voiceActions, type LoadStatus } from './voices';

type Reply = { data?: unknown; error?: unknown; response: Response };
type Result<T> = { ok: true; value: T } | { ok: false; code: string };

async function act<T>(run: () => Promise<Reply>): Promise<Result<T>> {
  try {
    const r = await run();
    if (r.response.ok) return { ok: true, value: r.data as T };
    const e = r.error as { code?: string } | undefined;
    return { ok: false, code: e?.code ?? 'other' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

const device = () => ({ 'X-Bardic-Device': deviceId() });

// ---------------------------------------------------------------- the Gemini key

/** What a key action did, in words. `kind: 'connected'` is the only success. */
export type KeyOutcome = { kind: 'connected'; words: Words } | { kind: 'problem'; words: Words; code: string };

export type KeyBusy = 'check' | 'test' | 'remove' | null;
export const keyBusy = writable<KeyBusy>(null);
/** The last key action's result, for the screen to show. It never holds a key. */
export const keyOutcome = writable<KeyOutcome | null>(null);

/** Plans the key stopped, and what they kept (PL11). null when there are none. */
export const keptStore = writable<Kept | null>(null);

const connected: KeyOutcome = { kind: 'connected', words: { title: 'Connected', body: 'The key works.' } };
const problem = (code: string): KeyOutcome => ({ kind: 'problem', code, words: keyErrorWords(code) });

export const keyActions = {
  /**
   * Send a key to your Bardic computer, which checks it against Google's model list (free) and stores it only when
   * Google accepts it. The key is not kept here: the caller clears its field, and the only copy that remains is on the
   * server, which never returns it.
   */
  async check(key: string): Promise<KeyOutcome> {
    keyBusy.set('check');
    keyOutcome.set(null);
    const r = await act<VoiceSource>(() =>
      api.PUT('/api/voice-sources/{source_id}', { params: { path: { source_id: 'gemini' }, header: device() }, body: { api_key: key } }),
    );
    const out = r.ok ? (r.value.state === 'connected' ? connected : problem(r.value.state === 'key_rejected' ? 'key_rejected' : 'source_unreachable')) : problem(r.code);
    if (r.ok) await voiceActions.load();
    keyOutcome.set(out);
    keyBusy.set(null);
    return out;
  },

  /** Check the stored key again (reads the model list; free, speaks nothing). */
  async test(): Promise<KeyOutcome> {
    keyBusy.set('test');
    keyOutcome.set(null);
    const r = await act<VoiceSource>(() => api.POST('/api/voice-sources/{source_id}/test', { params: { path: { source_id: 'gemini' }, header: device() } }));
    let out: KeyOutcome;
    if (!r.ok) out = problem(r.code);
    else {
      await voiceActions.load();
      out = r.value.state === 'connected' ? connected : problem(r.value.state === 'key_rejected' ? 'key_still_rejected' : 'source_unreachable');
    }
    keyOutcome.set(out);
    keyBusy.set(null);
    return out;
  },

  /** Forget the key. Audio already made is kept and stays playable. */
  async remove(): Promise<KeyOutcome | null> {
    keyBusy.set('remove');
    keyOutcome.set(null);
    const r = await voiceActions.remove('gemini');
    keyBusy.set(null);
    if (r.ok) return null;
    const out = problem(r.code ?? 'other');
    keyOutcome.set(out);
    return out;
  },

  /** Plans stopped by the key: what they kept. Read-only. */
  async loadKept(): Promise<void> {
    const r = await act<{ items: Parameters<typeof keptByKeyProblem>[0] }>(() => api.GET('/api/plans', { params: { query: { state: 'needs_you' } } }));
    keptStore.set(r.ok ? keptByKeyProblem(r.value.items) : null);
  },

  clearOutcome() {
    keyOutcome.set(null);
  },
};

// ---------------------------------------------------------------- prices

export interface PricesState {
  status: LoadStatus;
  items: Price[];
}
export const pricesStore = writable<PricesState>({ status: 'idle', items: [] });

export const pricesActions = {
  /** The dated price table the server is using. Read only: opening a screen never asks the provider. */
  async load(): Promise<void> {
    const r = await act<{ items: Price[] }>(() => api.GET('/api/prices'));
    if (r.ok) pricesStore.set({ status: 'ready', items: r.value.items });
    else pricesStore.update((p) => ({ ...p, status: 'error' }));
  },
};

// ---------------------------------------------------------------- the Allowance

export interface AllowanceState {
  status: LoadStatus;
  allowance: Allowance | null;
}
export const allowanceStore = writable<AllowanceState>({ status: 'idle', allowance: null });

export type SaveResult = { ok: true; allowance: Allowance } | { ok: false; message: string; monthlyError: string; planError: string };

export const allowanceActions = {
  async load(): Promise<void> {
    allowanceStore.update((s) => ({ ...s, status: s.allowance ? s.status : 'loading' }));
    const r = await act<Allowance>(() => api.GET('/api/allowance'));
    if (r.ok) allowanceStore.set({ status: 'ready', allowance: r.value });
    else allowanceStore.update((s) => ({ ...s, status: 'error' }));
  },

  /**
   * Set the monthly limit (or none) and the default limit for one plan. The amounts are parsed from the typed text into
   * integer micros; nothing is sent when they do not parse. A monthly limit below what is spent is allowed (PL9); the
   * server says what it does and the screen repeats it.
   */
  async save(form: LimitForm, currency: string): Promise<SaveResult> {
    const c = checkLimits(form);
    if (!c.ok || c.plan === null) return { ok: false, message: '', monthlyError: c.monthlyError, planError: c.planError };
    const listener = get(listenerStore).currentId;
    if (!listener) return { ok: false, message: allowanceErrorWords('listener_not_found'), monthlyError: '', planError: '' };
    const body = {
      monthly_limit: c.monthly === null ? null : { micros: c.monthly, currency },
      default_plan_limit: { micros: c.plan, currency },
    };
    const r = await act<Allowance>(() =>
      api.PUT('/api/allowance', { params: { header: { 'X-Bardic-Listener': listener, ...device() } }, body }),
    );
    if (!r.ok) return { ok: false, message: allowanceErrorWords(r.code), monthlyError: '', planError: '' };
    allowanceStore.set({ status: 'ready', allowance: r.value });
    return { ok: true, allowance: r.value };
  },
};
