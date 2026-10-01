import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { method: string; path: string; init?: { body?: unknown; params?: { header?: Record<string, string> } } };
const calls: Call[] = [];
let responses: Record<string, { status?: number; data?: unknown; error?: unknown }> = {};
vi.mock('../api/client', () => {
  const run = (method: string) => async (path: string, init?: Call['init']) => {
    calls.push({ method, path, init });
    const r = responses[`${method} ${path}`] ?? { status: 200, data: {} };
    const status = r.status ?? 200;
    return { data: r.data, error: r.error, response: { ok: status >= 200 && status < 300, status } };
  };
  return { api: { GET: run('GET'), PUT: run('PUT'), POST: run('POST'), DELETE: run('DELETE') }, setListener: () => {} };
});
vi.mock('./listener', async () => {
  const { writable } = await import('svelte/store');
  return { listenerStore: writable({ currentId: 'l1' }) };
});

import { get } from 'svelte/store';
import { render } from 'svelte/server';
import { allowanceActions, allowanceStore, keptStore, keyActions, keyBusy, keyOutcome, pricesStore } from './allowance';
import { sources } from './voices';
import KeyProblemView from '../views/account/KeyProblemView.svelte';
import PremiumAccountView from '../views/account/PremiumAccountView.svelte';
import { listenerStore } from './listener';

const SECRET = 'AIzaSy-SECRET-key-0123456789';
const usd = (micros: number) => ({ micros, currency: 'USD' });
const gemini = (state: string, extra = {}) => ({ id: 'gemini', kind: 'gemini', name: 'Gemini', tier: 'premium', state, voice_count: 30, checked_at: null, detail: null, has_key: true, ...extra });

beforeEach(() => {
  calls.length = 0;
  responses = { 'GET /api/voices': { data: { items: [] } }, 'GET /api/voice-sources': { data: { items: [] } } };
  sources.set({ status: 'idle', items: [] });
  keyOutcome.set(null);
  keyBusy.set(null);
  keptStore.set(null);
  allowanceStore.set({ status: 'idle', allowance: null });
});

const everything = () =>
  JSON.stringify({
    outcome: get(keyOutcome),
    busy: get(keyBusy),
    kept: get(keptStore),
    sources: get(sources),
    allowance: get(allowanceStore),
    prices: get(pricesStore),
  });

describe('the Gemini key is write-only', () => {
  it('sends the key once, in the request body, and keeps it nowhere', async () => {
    responses['PUT /api/voice-sources/{source_id}'] = { data: gemini('connected') };
    responses['GET /api/voice-sources'] = { data: { items: [gemini('connected')] } };
    const out = await keyActions.check(SECRET);
    expect(out.kind).toBe('connected');
    const put = calls.filter((c) => c.method === 'PUT');
    expect(put).toHaveLength(1);
    expect(put[0]!.init?.body).toEqual({ api_key: SECRET });
    // nothing else was sent with it (no other call carries it)
    expect(JSON.stringify(calls.filter((c) => c !== put[0]))).not.toContain(SECRET);
    // and no store holds it afterwards
    expect(everything()).not.toContain(SECRET);
    expect(get(sources).items[0]).not.toHaveProperty('api_key');
  });

  it('a rejected key: words from the code, not from the server text, and the key is not in them', async () => {
    responses['PUT /api/voice-sources/{source_id}'] = { status: 400, error: { code: 'key_rejected', detail: `Google said: API key ${SECRET} not valid` } };
    const out = await keyActions.check(SECRET);
    expect(out.kind).toBe('problem');
    expect(out.words.title).toBe('Key rejected');
    expect(out.words.body.startsWith('Audio already made is kept and still plays.')).toBe(true);
    expect(everything()).not.toContain(SECRET);
    expect(JSON.stringify(out)).not.toContain('Google said');
  });

  it('an unreachable server maps to words that say nothing was changed', async () => {
    const out = await keyActions.check(SECRET);
    // the default mock answers 200 with an empty body: not connected, so it is a problem, never a success
    expect(out.kind).toBe('problem');
    expect(everything()).not.toContain(SECRET);
  });

  it('test again re-checks the stored key without sending any key', async () => {
    responses['POST /api/voice-sources/{source_id}/test'] = { data: gemini('key_rejected') };
    responses['GET /api/voice-sources'] = { data: { items: [gemini('key_rejected')] } };
    const out = await keyActions.test();
    expect(out.kind).toBe('problem');
    expect(out.words.title).toBe('Still rejected');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.init?.body).toBeUndefined();
  });

  it('remove forgets the key and clears the outcome', async () => {
    responses['DELETE /api/voice-sources/{source_id}'] = { status: 204 };
    responses['GET /api/voice-sources'] = { data: { items: [gemini('not_set_up', { has_key: false })] } };
    expect(await keyActions.remove()).toBeNull();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
    expect(get(keyOutcome)).toBeNull();
  });

  it('reads the plans the key stopped', async () => {
    responses['GET /api/plans'] = { data: { items: [{ state: 'needs_you', needs_you: { code: 'key_rejected', text: '' }, chapters_done: 13, chapters_total: 22 }] } };
    await keyActions.loadKept();
    expect(get(keptStore)).toEqual({ plans: 1, done: 13, total: 22 });
  });
});

describe('what the screens render after a key is sent', () => {
  // The screens clear their field as soon as the key is sent, so the field's value is empty in the markup. This renders
  // the views the way they are after that (draft is '') and looks for the key anywhere in the output.
  it('PremiumAccountView has no key text, an empty password field, and autofill off', () => {
    const { body } = render(PremiumAccountView, { props: { status: 'connected', draft: '', callout: { tone: 'info', title: 'Connected', body: 'The key works.' } } });
    expect(body).not.toContain(SECRET);
    expect(body).toMatch(/type="password"/);
    expect(body).toMatch(/autocomplete="off"/);
    expect(body).not.toMatch(/value="[^"]+"/); // no value attribute is ever rendered on the key field
  });

  it('KeyProblemView likewise', () => {
    const { body } = render(KeyProblemView, { props: { words: { title: 'Google rejected the key', body: 'Audio already made keeps playing.' }, draft: '' } });
    expect(body).not.toContain(SECRET);
    expect(body).toMatch(/type="password"/);
    expect(body).toContain('Free voices are not affected.');
  });
});

describe('the Allowance', () => {
  const allowance = (over = {}) => ({
    monthly_limit: null,
    default_plan_limit: usd(5_000_000),
    period_start: '2026-10-01T00:00:00Z',
    period_end: '2026-11-01T00:00:00Z',
    spent: { known: usd(2_600_000), unknown_items: 1 },
    currency: 'USD',
    ...over,
  });

  it('reads the allowance with its unknown items intact', async () => {
    responses['GET /api/allowance'] = { data: allowance() };
    await allowanceActions.load();
    expect(get(allowanceStore).allowance?.spent).toEqual({ known: usd(2_600_000), unknown_items: 1 });
  });

  it('saves integer micros, with the listener and the device', async () => {
    responses['PUT /api/allowance'] = { data: allowance({ monthly_limit: usd(20_000_000) }) };
    const r = await allowanceActions.save({ on: true, monthly: '20', plan: '5.00' }, 'USD');
    expect(r.ok).toBe(true);
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.init?.body).toEqual({ monthly_limit: { micros: 20_000_000, currency: 'USD' }, default_plan_limit: { micros: 5_000_000, currency: 'USD' } });
    expect(put.init?.params?.header?.['X-Bardic-Listener']).toBe('l1');
    expect(put.init?.params?.header?.['X-Bardic-Device']).toBeTruthy();
    expect(get(allowanceStore).allowance?.monthly_limit).toEqual(usd(20_000_000));
  });

  it('turning the limit off sends null', async () => {
    responses['PUT /api/allowance'] = { data: allowance() };
    await allowanceActions.save({ on: false, monthly: '20', plan: '5' }, 'USD');
    expect((calls[0]!.init?.body as { monthly_limit: unknown }).monthly_limit).toBeNull();
  });

  it('sends nothing when an amount does not parse, and says which', async () => {
    const r = await allowanceActions.save({ on: true, monthly: 'lots', plan: '5' }, 'USD');
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.monthlyError).toContain('must be an amount in dollars');
    expect(calls).toHaveLength(0);
  });

  it('a limit below spending is sent, not refused (PL9)', async () => {
    responses['PUT /api/allowance'] = { data: allowance({ monthly_limit: usd(1_000_000) }) };
    const r = await allowanceActions.save({ on: true, monthly: '1', plan: '5' }, 'USD');
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('a refused save says nothing was saved and keeps the old allowance', async () => {
    responses['GET /api/allowance'] = { data: allowance() };
    await allowanceActions.load();
    responses['PUT /api/allowance'] = { status: 400, error: { code: 'invalid_request', detail: 'x' } };
    const r = await allowanceActions.save({ on: true, monthly: '20', plan: '5' }, 'USD');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain('nothing was saved');
    expect(get(allowanceStore).allowance?.monthly_limit).toBeNull();
  });

  it('without a listener nothing is sent', async () => {
    (listenerStore as unknown as { set: (v: unknown) => void }).set({ currentId: null });
    const r = await allowanceActions.save({ on: false, monthly: '', plan: '5' }, 'USD');
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
    (listenerStore as unknown as { set: (v: unknown) => void }).set({ currentId: 'l1' });
  });
});
