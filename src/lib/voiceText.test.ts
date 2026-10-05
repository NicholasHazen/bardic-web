import { describe, expect, it } from 'vitest';
import {
  addressProblem,
  allowanceSummary,
  chooserDetail,
  connectProblem,
  defaultDetail,
  defaultVoiceBody,
  defaultVoiceSummary,
  freeNote,
  geminiReady,
  groupVoices,
  initialVoiceId,
  isConfigured,
  languageName,
  moneyText,
  needsSetup,
  normalizeAddress,
  planFromChapter,
  playingNote,
  premiumNote,
  sampleCost,
  sampleProblem,
  serverDetail,
  sourceProblem,
  sourceStatus,
  sourceSummary,
  tabForVoice,
  toRow,
  visibleSources,
  type ListenerSettings,
  type Voice,
  type VoiceSource,
} from './voiceText';

const voice = (id: string, source_id: string, tier: 'free' | 'premium', over: Partial<Voice> = {}): Voice => ({
  id,
  source_id,
  name: id,
  tier,
  language: 'en',
  description: 'Warm, even',
  revision: 'r1',
  available: true,
  ...over,
});
const src = (kind: VoiceSource['kind'], state: VoiceSource['state'], over: Partial<VoiceSource> = {}): VoiceSource => ({
  id: kind,
  kind,
  name: kind,
  tier: kind === 'gemini' ? 'premium' : 'free',
  state,
  voice_count: 0,
  checked_at: null,
  detail: null,
  ...over,
});

describe('source status words', () => {
  it('uses Connected, Not set up and Key rejected for a source, and Available for this computer', () => {
    expect(sourceStatus({ state: 'connected' })).toEqual({ label: 'Connected', tone: 'ready' });
    expect(sourceStatus({ state: 'not_set_up' })).toEqual({ label: 'Not set up', tone: 'idle' });
    expect(sourceStatus({ state: 'key_rejected' })).toEqual({ label: 'Key rejected', tone: 'failed' });
    expect(sourceStatus({ state: 'available' })).toEqual({ label: 'Available', tone: 'ready' });
  });
  it('says Not reachable for an unreachable server, never a listening state', () => {
    expect(sourceStatus({ state: 'unreachable' })).toEqual({ label: 'Not reachable', tone: 'failed' });
    expect(sourceStatus({ state: 'unavailable' }).label).toBe('None found');
  });
  it('counts a failing source as set up, and a missing one as not', () => {
    expect(isConfigured({ state: 'unreachable' })).toBe(true);
    expect(isConfigured({ state: 'key_rejected' })).toBe(true);
    expect(isConfigured({ state: 'not_set_up' })).toBe(false);
    expect(isConfigured({ state: 'unavailable' })).toBe(false);
  });
  it('needs the first-time set up only when no source and no voices exist (V8)', () => {
    const none = [src('breeze', 'not_set_up'), src('gemini', 'not_set_up'), src('local', 'available', { voice_count: 12 })];
    expect(needsSetup(none, 0)).toBe(true);
    expect(needsSetup(none, 12)).toBe(false);
    expect(needsSetup([src('breeze', 'unreachable'), src('gemini', 'not_set_up'), src('local', 'unavailable')], 0)).toBe(false);
  });
  it('knows when premium examples are possible: only a Gemini key the server accepted', () => {
    expect(geminiReady([src('gemini', 'connected')])).toBe(true);
    expect(geminiReady([src('gemini', 'key_rejected')])).toBe(false);
    expect(geminiReady([src('gemini', 'not_set_up')])).toBe(false);
    expect(geminiReady([])).toBe(false);
  });
  it('draws Breeze, Gemini, then This computer, and hides this computer when it has no voices (V5)', () => {
    const list = [src('local', 'available'), src('gemini', 'connected'), src('breeze', 'connected')];
    expect(visibleSources(list).map((s) => s.kind)).toEqual(['breeze', 'gemini', 'local']);
    expect(visibleSources([src('local', 'unavailable'), src('breeze', 'connected')]).map((s) => s.kind)).toEqual(['breeze']);
  });
  it('summarises a source for Settings', () => {
    expect(sourceSummary({ kind: 'gemini', state: 'connected', voice_count: 30 })).toBe('Premium · 30 voices');
    expect(sourceSummary({ kind: 'gemini', state: 'not_set_up', voice_count: 0 })).toBe('Premium · every Gemini voice');
    expect(sourceSummary({ kind: 'breeze', state: 'connected', voice_count: 14 })).toBe('Your voice server · free');
  });
  it('says what is kept first when a source is failing', () => {
    expect(sourceProblem({ kind: 'breeze', state: 'unreachable', detail: 'It did not answer.' })?.body).toMatch(/^Audio already made is kept/);
    expect(sourceProblem({ kind: 'gemini', state: 'key_rejected', detail: null })?.title).toBe('Key rejected');
    expect(sourceProblem({ kind: 'breeze', state: 'connected', detail: null })).toBeNull();
  });
});

describe('voice grouping, order and tiers', () => {
  const all = [
    voice('kore', 'gemini', 'premium'),
    voice('samantha', 'local', 'free'),
    voice('amber', 'breeze', 'free'),
    voice('puck', 'gemini', 'premium'),
    voice('bram', 'breeze', 'free'),
  ];
  it('puts Breeze first, then this computer, in the order the source gave them (V1)', () => {
    expect(groupVoices(all).free.map((v) => v.id)).toEqual(['amber', 'bram', 'samantha']);
  });
  it('puts every premium voice in Premium, in the order given', () => {
    expect(groupVoices(all).premium.map((v) => v.id)).toEqual(['kore', 'puck']);
  });
  it('keeps a voice whose source is unknown in its tier, last', () => {
    expect(groupVoices([voice('x', 'other', 'free'), voice('a', 'breeze', 'free')]).free.map((v) => v.id)).toEqual(['a', 'x']);
  });
  it('picks the tab from the voice', () => {
    expect(tabForVoice(voice('k', 'gemini', 'premium'))).toBe('Premium');
    expect(tabForVoice(voice('a', 'breeze', 'free'))).toBe('Free');
    expect(tabForVoice(undefined)).toBe('Free');
  });
  it('words the sub-line by source', () => {
    expect(chooserDetail(voice('a', 'breeze', 'free'))).toBe('Warm, even · from Breeze');
    expect(chooserDetail(voice('s', 'local', 'free'))).toBe('On your Bardic computer');
    expect(chooserDetail(voice('k', 'gemini', 'premium', { description: 'Clear, calm' }))).toBe('Clear, calm · English');
    expect(chooserDetail(voice('a', 'breeze', 'free', { available: false }))).toBe('Warm, even · from Breeze · not reachable now');
    expect(defaultDetail(voice('k', 'gemini', 'premium', { description: 'Clear, calm' }))).toBe('Clear, calm · premium');
    expect(defaultDetail(voice('s', 'local', 'free'))).toBe('Warm, even · free');
    expect(serverDetail(voice('a', 'breeze', 'free', { description: 'Soft' }))).toBe('Soft · English');
  });
  it('turns a voice into a row and flags a voice that cannot be used', () => {
    expect(toRow(voice('k', 'gemini', 'premium', { available: false }), chooserDetail)).toMatchObject({ id: 'k', premium: true, unavailable: true });
  });
  it('names languages and tolerates odd codes', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('')).toBe('');
    expect(languageName('und')).toBe('');
    expect(chooserDetail(voice('g', 'gemini', 'premium', { description: 'Firm', language: 'und' }))).toBe('Firm · Gemini');
    expect(serverDetail(voice('t', 'breeze', 'free', { description: 'Soft', language: 'und' }))).toBe('Soft');
    expect(languageName('zz-not-a-code!')).not.toBe('');
  });
  it('summarises the default voice for Settings', () => {
    expect(defaultVoiceSummary(voice('s', 'local', 'free', { name: 'Samantha' }))).toBe('Samantha · free');
    expect(defaultVoiceSummary(voice('k', 'gemini', 'premium', { name: 'Kore' }))).toBe('Kore · premium');
    expect(defaultVoiceSummary(null)).toBe('Not chosen yet');
  });
  it('names only what the listener has in the free note', () => {
    const b = voice('a', 'breeze', 'free');
    const l = voice('s', 'local', 'free', { name: 'Samantha' });
    expect(freeNote([b, l]).body).toBe('Breeze runs on your network and Samantha on your Bardic computer. Nothing is sent to the internet.');
    expect(freeNote([b]).body).toBe('Breeze runs on your network. Nothing is sent to the internet.');
    expect(freeNote([l]).body).toBe('Samantha runs on your Bardic computer. Nothing is sent to the internet.');
  });
});

describe('what an example costs (V2)', () => {
  const free = { tier: 'free' as const, available: true };
  const premium = { tier: 'premium' as const, available: true };
  it('is free for a free voice, with or without a Google key', () => {
    expect(sampleCost(free, false)).toMatchObject({ kind: 'free', canHear: true, note: 'Free. Nothing is spent.' });
    expect(sampleCost(free, true).kind).toBe('free');
  });
  it('counts toward spending for a premium voice with a key', () => {
    const c = sampleCost(premium, true);
    expect(c).toMatchObject({ kind: 'counts', canHear: true });
    expect(c.note).toMatch(/counts toward spending/);
  });
  it('explains that a key is needed, and does not allow the call, for a premium voice without one', () => {
    const c = sampleCost(premium, false);
    expect(c).toMatchObject({ kind: 'needs_key', canHear: false });
    expect(c.note).toMatch(/Google key is needed/);
  });
  it('does not allow an example from a voice that cannot be reached', () => {
    expect(sampleCost({ tier: 'free', available: false }, true).canHear).toBe(false);
  });
  it('says what is playing, and that a repeat is free', () => {
    expect(playingNote('Kore', sampleCost(premium, true))).toBe('Playing a short example of Kore. It counts toward spending.');
    expect(playingNote('Kore', sampleCost(premium, true), true)).toBe('Playing Kore again. A repeat is free.');
    expect(playingNote('Amber', sampleCost(free, false))).toBe('Playing Amber. Nothing is spent.');
  });
  it('turns a server error into words', () => {
    expect(sampleProblem('Kore', 'key_rejected')).toMatch(/Google rejected the key/);
    expect(sampleProblem('Kore', 'provider_quota')).toMatch(/limit was reached/);
    expect(sampleProblem('Amber', 'rate_limited')).toMatch(/busy/);
    expect(sampleProblem('Amber', undefined)).toBe('Couldn’t play Amber. Try again.');
  });
  it('shows a cost only when the server gave one', () => {
    expect(premiumNote('$2.10').body).toBe('Whole book: about $2.10, from Google’s published rates. Nothing is sent until you approve a plan with a limit. Examples are short and count toward your Allowance.');
    expect(premiumNote().body.startsWith('Nothing is sent until you approve a plan')).toBe(true);
    expect(premiumNote().title).toBe('Premium voices cost money');
  });
});

describe('choosing for a book', () => {
  const chapters = [
    { id: 'c1', index: 0 },
    { id: 'c2', index: 1 },
    { id: 'c4', index: 3 },
  ];
  it('plans from the chapter the listener is in, counting from 1; at the start there is no such offer', () => {
    expect(planFromChapter(chapters, 'c4')).toBe(4);
    expect(planFromChapter(chapters, 'c1')).toBeNull();
    expect(planFromChapter(chapters, null)).toBeNull();
    expect(planFromChapter(chapters, 'gone')).toBeNull();
  });
  const vs = [voice('a', 'breeze', 'free'), voice('k', 'gemini', 'premium')];
  const ab = (voice_id: string, chapters_ready: number, created_at: string) => ({ voice_id, chapters_ready, created_at });
  it('starts on the voice the book already has the most audio in', () => {
    expect(initialVoiceId(vs, [ab('a', 2, '2026-01-01T00:00:00Z'), ab('k', 5, '2026-01-02T00:00:00Z')], { default_voice_id: 'a' })).toBe('k');
  });
  it('then on the listener default, then nothing', () => {
    expect(initialVoiceId(vs, [], { default_voice_id: 'a' })).toBe('a');
    expect(initialVoiceId(vs, [], { default_voice_id: 'gone' })).toBeNull();
    expect(initialVoiceId(vs, [ab('gone', 3, '2026-01-01T00:00:00Z')], null)).toBeNull();
  });
});

describe('default voice update body', () => {
  const current: ListenerSettings = { default_voice_id: 'a', place_conflict: 'newest', continue_into_next_chapter: false };
  it('changes only the default voice, because the server replaces settings as a whole', () => {
    const body = defaultVoiceBody(current, 'k');
    expect(body).toEqual({ default_voice_id: 'k', place_conflict: 'newest', continue_into_next_chapter: false });
    expect(current.default_voice_id).toBe('a');
  });
  it('can clear it', () => {
    expect(defaultVoiceBody(current, null).default_voice_id).toBeNull();
  });
});

describe('Breeze address', () => {
  it('adds http:// and drops a trailing slash', () => {
    expect(normalizeAddress(' breeze.local:8080/ ')).toBe('http://breeze.local:8080');
    expect(normalizeAddress('https://b.example')).toBe('https://b.example');
    expect(normalizeAddress('   ')).toBe('');
  });
  it('rejects what the server would', () => {
    expect(addressProblem('')).toMatch(/Enter the address/);
    expect(addressProblem('http://u:p@breeze.local')).toMatch(/user name/);
    expect(addressProblem('http://breeze.local/v1')).toMatch(/without a path/);
    expect(addressProblem('ftp://breeze.local')).toMatch(/http/);
    expect(addressProblem('breeze.local:8080')).toBeNull();
    expect(addressProblem('http://127.0.0.1:9000')).toBeNull();
  });
  it('says nothing was changed first when connecting fails', () => {
    expect(connectProblem('source_unreachable', 'Connection refused.')).toEqual({ title: 'Couldn’t connect', body: 'Nothing was changed. Connection refused.' });
    expect(connectProblem('network', undefined).body).toMatch(/^Nothing was changed/);
    expect(connectProblem('key_rejected', undefined).title).toBe('Key rejected');
  });
});

describe('Allowance line', () => {
  const usd = (micros: number) => ({ micros, currency: 'USD' });
  it('reads "No monthly limit · $2.60 spent"', () => {
    expect(allowanceSummary({ monthly_limit: null, spent: { known: usd(2_600_000), unknown_items: 0 } })).toBe('No monthly limit · $2.60 spent');
  });
  it('shows a limit, and counts unpriced items instead of adding them as zero', () => {
    expect(allowanceSummary({ monthly_limit: usd(10_000_000), spent: { known: usd(0), unknown_items: 2 } })).toBe('$10.00 a month · $0.00 spent, plus 2 not priced');
  });
  it('does not round a real amount down to nothing', () => {
    expect(moneyText(usd(4_000))).toBe('under $0.01');
    expect(moneyText(usd(0))).toBe('$0.00');
  });
});
