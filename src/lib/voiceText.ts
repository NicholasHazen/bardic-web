// Voices: the words and rules the voice screens show. Pure functions; no DOM, no network.
// Statuses follow docs/UI-GUIDE.md ("Free" and "Premium" for money, Connected / Not set up / Key rejected for a source),
// and "Your Bardic computer" is the server.
import type { components } from '../api/schema';

export type VoiceSource = components['schemas']['VoiceSource'];
export type Voice = components['schemas']['Voice'];
export type ListenerSettings = components['schemas']['ListenerSettings'];
export type Audiobook = components['schemas']['Audiobook'];
export type SourceKind = VoiceSource['kind'];
export type Tier = Voice['tier'];

/** The order voices are listed in: Breeze first, then this computer, then Gemini. */
const VOICE_RANK: Record<string, number> = { breeze: 0, local: 1, gemini: 2 };
/** The order source cards are drawn in (the boards). */
const CARD_RANK: Record<string, number> = { breeze: 0, gemini: 1, local: 2 };

// ---------------------------------------------------------------- sources

export type StatusTone = 'ready' | 'idle' | 'failed';
export interface SourceStatus {
  label: string;
  tone: StatusTone;
}

/** The word on a source's badge. */
export function sourceStatus(s: Pick<VoiceSource, 'state'>): SourceStatus {
  switch (s.state) {
    case 'connected':
      return { label: 'Connected', tone: 'ready' };
    case 'available':
      return { label: 'Available', tone: 'ready' };
    case 'key_rejected':
      return { label: 'Key rejected', tone: 'failed' };
    case 'unreachable':
      return { label: 'Not reachable', tone: 'failed' };
    case 'unavailable':
      return { label: 'None found', tone: 'idle' };
    default:
      return { label: 'Not set up', tone: 'idle' };
  }
}

/** A source the listener has set up (even if it is failing now). */
export function isConfigured(s: Pick<VoiceSource, 'state'>): boolean {
  return s.state === 'connected' || s.state === 'available' || s.state === 'unreachable' || s.state === 'key_rejected';
}

/** A source whose voices can be used right now. */
export function isUsable(s: Pick<VoiceSource, 'state'>): boolean {
  return s.state === 'connected' || s.state === 'available';
}

/**
 * True when nothing is set up: the first-time screen (V8) is shown instead of a chooser. Voices on this computer
 * count once they are in the voice list (the listener has taken them with "Use these voices").
 */
export function needsSetup(sources: readonly VoiceSource[], voiceCount: number): boolean {
  return voiceCount === 0 && !sources.some((s) => s.kind !== 'local' && isConfigured(s));
}

/** The cards to draw: Breeze, Gemini, then This computer, which is only shown when voices are found (V5). */
export function visibleSources(sources: readonly VoiceSource[]): VoiceSource[] {
  return sources
    .filter((s) => !(s.kind === 'local' && s.state === 'unavailable'))
    .slice()
    .sort((a, b) => (CARD_RANK[a.kind] ?? 9) - (CARD_RANK[b.kind] ?? 9));
}

export const sourceByKind = (sources: readonly VoiceSource[], kind: SourceKind): VoiceSource | undefined => sources.find((s) => s.kind === kind);

/** Premium examples and plans need a Gemini key that the server accepted. */
export function geminiReady(sources: readonly VoiceSource[]): boolean {
  const g = sourceByKind(sources, 'gemini');
  return !!g && g.state === 'connected';
}

export function voicesFound(n: number): string {
  return n === 0 ? 'No voices found' : n === 1 ? '1 voice found' : `${n} voices found`;
}

/** Settings > Voices row sub-lines, and the card sub-lines on the Voices screen. */
export function sourceSummary(s: Pick<VoiceSource, 'kind' | 'state' | 'voice_count'>): string {
  switch (s.kind) {
    case 'breeze':
      return 'Your voice server · free';
    case 'gemini':
      return s.state === 'connected' && s.voice_count > 0 ? `Premium · ${s.voice_count} voices` : 'Premium · every Gemini voice';
    default:
      return 'Voices already installed';
  }
}

/** The card's sub-line on the Voices screen: what the source is, not how many voices it has. */
export const SOURCE_KIND_LINE: Record<SourceKind, string> = { breeze: 'Your voice server · free', gemini: 'Premium · every Gemini voice', local: 'Voices already installed' };

export const SOURCE_BLURB: Record<SourceKind, string> = {
  breeze: 'Voices come from your Breeze server on your network. Free, and nothing is sent to the internet.',
  gemini: 'Sounds more natural. Costs money per book. Bardic shows an estimate and a limit first, and only sends the text being spoken.',
  local: 'Optional. Voices your Bardic computer already has, if any. Free.',
};

/** The first-time screen's one line per source (V8). */
export function setupBlurb(s: Pick<VoiceSource, 'kind' | 'voice_count'>): string {
  switch (s.kind) {
    case 'breeze':
      return 'Your own voice server on your network. Enter its address.';
    case 'gemini':
      return 'Every Gemini voice. Paste a Google API key. You approve a plan with a limit before anything is spent.';
    default:
      return `Voices already installed on your Bardic computer: ${s.voice_count} found.`;
  }
}

export interface SourceProblem {
  title: string;
  body: string;
}

/** What to say when a configured source is failing. What is kept comes first. */
export function sourceProblem(s: Pick<VoiceSource, 'kind' | 'state' | 'detail'>): SourceProblem | null {
  const why = s.detail ? ` ${s.detail}` : '';
  if (s.state === 'unreachable') {
    const where = s.kind === 'breeze' ? 'your Breeze server' : 'this source';
    return { title: `Can’t reach ${where}`, body: `Audio already made is kept and still plays. Its voices are listed but can’t be used until it is back.${why}` };
  }
  if (s.state === 'key_rejected') {
    return { title: 'Key rejected', body: `Audio already made is kept and still plays. Nothing new can be made with a premium voice until the key is fixed.${why}` };
  }
  return null;
}

// ---------------------------------------------------------------- voices

export function languageName(code: string): string {
  const c = code.trim();
  // und, mul and zxx are "not stated", "several" and "no language": nothing worth showing
  if (!c || ['und', 'mul', 'zxx'].includes(c.toLowerCase())) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(c) ?? c;
  } catch {
    return c;
  }
}

const rank = (v: Voice) => VOICE_RANK[v.source_id] ?? 3;

/** Free voices (Breeze, then this computer) and premium voices (Gemini), each in the order the source gave them. */
export function groupVoices(voices: readonly Voice[]): { free: Voice[]; premium: Voice[] } {
  const ordered = voices.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i).map((x) => x.v);
  return { free: ordered.filter((v) => v.tier === 'free'), premium: ordered.filter((v) => v.tier === 'premium') };
}

const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** The sub-line of a voice in the chooser. */
export function chooserDetail(v: Voice): string {
  const off = v.available ? '' : 'not reachable now';
  if (v.source_id === 'local') return join('On your Bardic computer', off);
  if (v.source_id === 'breeze') return join(v.description, 'from Breeze', off);
  return join(v.description, languageName(v.language) || 'Gemini', off);
}

/** The sub-line of a voice on the Default voice screen. */
export function defaultDetail(v: Voice): string {
  return join(v.description, v.tier === 'premium' ? 'premium' : 'free', v.available ? '' : 'not reachable now');
}

/** The sub-line of a voice on the Breeze screen. */
export function serverDetail(v: Voice): string {
  return join(v.description, languageName(v.language));
}

/** "Samantha · free", the default voice as Settings shows it. */
export function defaultVoiceSummary(v: Voice | null | undefined): string {
  return v ? `${v.name} · ${v.tier === 'premium' ? 'premium' : 'free'}` : 'Not chosen yet';
}

/** The free tab's reassurance, naming only what the listener has. */
export function freeNote(voices: readonly Voice[]): { title: string; body: string } {
  const hasBreeze = voices.some((v) => v.source_id === 'breeze');
  const local = voices.find((v) => v.source_id === 'local');
  const where = hasBreeze && local ? `Breeze runs on your network and ${local.name} on your Bardic computer.` : hasBreeze ? 'Breeze runs on your network.' : local ? `${local.name} runs on your Bardic computer.` : '';
  return { title: 'Free and private', body: `${where} Nothing is sent to the internet.`.trim() };
}

// ---------------------------------------------------------------- samples and cost

export type SampleKind = 'free' | 'counts' | 'needs_key';
export interface SampleCost {
  kind: SampleKind;
  /** What pressing the sample button costs, in words. */
  note: string;
  canHear: boolean;
}

/** V2: free examples cost nothing; premium examples are short, counted toward spending, and need a Gemini key. */
export function sampleCost(v: Pick<Voice, 'tier' | 'available'>, geminiOk: boolean): SampleCost {
  if (v.tier === 'free') return { kind: 'free', note: 'Free. Nothing is spent.', canHear: v.available };
  if (!geminiOk) return { kind: 'needs_key', note: 'A Google key is needed to hear a premium example.', canHear: false };
  return { kind: 'counts', note: 'A short example. It counts toward spending.', canHear: v.available };
}

/** The line shown while an example plays. */
export function playingNote(name: string, cost: SampleCost, repeat = false): string {
  if (cost.kind === 'counts') return repeat ? `Playing ${name} again. A repeat is free.` : `Playing a short example of ${name}. It counts toward spending.`;
  return `Playing ${name}. Nothing is spent.`;
}

/** Why an example could not be played. */
export function sampleProblem(name: string, code: string | undefined): string {
  const why: Record<string, string> = {
    source_not_set_up: 'Premium examples need a Google key.',
    key_rejected: 'Google rejected the key. Fix it in Settings › Voices.',
    provider_quota: 'Google’s limit was reached. Try again later.',
    voice_changed: 'This voice changed on its server. Open Settings › Voices to refresh.',
    rate_limited: 'The voice server is busy. Try again in a moment.',
    voice_not_found: 'This voice is no longer available.',
    network: 'Your Bardic computer could not be reached.',
  };
  return `Couldn’t play ${name}. ${(code && why[code]) || 'Try again.'}`;
}

export interface PremiumNote {
  title: string;
  body: string;
}

/** The callout under the premium list. `cost` is the server's own figure, when it has one (never invented here). */
export function premiumNote(cost?: string): PremiumNote {
  const head = cost ? `Whole book: about ${cost}, from Google’s published rates. ` : '';
  return { title: 'Premium voices cost money', body: `${head}Nothing is sent until you approve a plan with a limit. Examples are short and count toward your Allowance.` };
}

// ---------------------------------------------------------------- choosing

/** "Plan from chapter 4": the 1-based number of the chapter the listener is in, or null at the start (that is the whole book). */
export function planFromChapter(chapters: readonly { id: string; index: number }[], placeChapterId: string | null | undefined): number | null {
  if (!placeChapterId) return null;
  const c = chapters.find((x) => x.id === placeChapterId);
  return c && c.index >= 1 ? c.index + 1 : null;
}

/** Which voice starts selected: the book's own audiobook (most made first), then the listener's default. */
export function initialVoiceId(
  voices: readonly Voice[],
  audiobooks: readonly Pick<Audiobook, 'voice_id' | 'chapters_ready' | 'created_at'>[],
  settings: Pick<ListenerSettings, 'default_voice_id'> | null,
): string | null {
  const known = new Set(voices.map((v) => v.id));
  const mine = audiobooks
    .filter((a) => known.has(a.voice_id))
    .sort((a, b) => b.chapters_ready - a.chapters_ready || (a.created_at < b.created_at ? 1 : -1));
  if (mine[0]) return mine[0].voice_id;
  const d = settings?.default_voice_id;
  return d && known.has(d) ? d : null;
}

export type ChooserTab = 'Free' | 'Premium';
export const tabForVoice = (v: Pick<Voice, 'tier'> | undefined): ChooserTab => (v?.tier === 'premium' ? 'Premium' : 'Free');

/** The whole settings object with only the default voice changed (the server replaces settings as a whole). */
export function defaultVoiceBody(current: ListenerSettings, voiceId: string | null): ListenerSettings {
  return { ...current, default_voice_id: voiceId };
}

// ---------------------------------------------------------------- Breeze address

/** The address as the server wants it: a scheme, no trailing slash. Empty stays empty. */
export function normalizeAddress(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `http://${t}`;
  return withScheme.replace(/\/+$/, '');
}

export function addressProblem(raw: string): string | null {
  const a = normalizeAddress(raw);
  if (!a) return 'Enter the address of your Breeze server.';
  try {
    const u = new URL(a);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'The address must start with http:// or https://.';
    if (u.username || u.password) return 'Leave the user name and password out of the address.';
    if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return 'Use the server’s address only, without a path.';
  } catch {
    return 'That does not look like an address, for example http://breeze.local:8080.';
  }
  return null;
}

/** What to say when connecting failed. Nothing was stored, and that comes first. */
export function connectProblem(code: string | undefined, detail: string | undefined): SourceProblem {
  const why = detail ? ` ${detail}` : '';
  if (code === 'key_rejected') return { title: 'Key rejected', body: `Nothing was changed.${why}` };
  if (code === 'network') return { title: 'Couldn’t reach your Bardic computer', body: 'Nothing was changed. Check that this device is on the same network and try again.' };
  return { title: 'Couldn’t connect', body: `Nothing was changed.${why}` };
}

/**
 * What the Premium tab shows before a Google key is set: a few of the Gemini voices by name, so the listener can see what
 * premium offers. They are not real voices of the server: their ids start with `preview:`, they cannot be chosen, and
 * their example buttons only explain that a key is needed (V2).
 */
export const PREVIEW_PREFIX = 'preview:';
export const previewVoices: Voice[] = [
  { id: `${PREVIEW_PREFIX}kore`, source_id: 'gemini', name: 'Kore', tier: 'premium', language: 'en', description: 'Clear, calm', revision: '', available: true },
  { id: `${PREVIEW_PREFIX}puck`, source_id: 'gemini', name: 'Puck', tier: 'premium', language: 'en', description: 'Lively', revision: '', available: true },
];
export const isPreview = (id: string) => id.startsWith(PREVIEW_PREFIX);

// ---------------------------------------------------------------- rows

/** What a voice row needs to draw itself. */
export interface VoiceRowModel {
  id: string;
  name: string;
  detail: string;
  premium: boolean;
  /** Its source cannot be reached now: listed, but not usable. */
  unavailable: boolean;
  /** What pressing the example button costs, in words (the button's tooltip). */
  hint?: string;
}

export function toRow(v: Voice, detail: (v: Voice) => string): VoiceRowModel {
  return { id: v.id, name: v.name, detail: detail(v), premium: v.tier === 'premium', unavailable: !v.available };
}

// ---------------------------------------------------------------- Allowance line

type Money = components['schemas']['Money'];
type Allowance = components['schemas']['Allowance'];

/** "$2.60" from integer micros. A real amount under one cent says so instead of rounding to zero. */
export function moneyText(m: Money): string {
  if (m.micros > 0 && m.micros < 10_000) return `under ${moneyText({ micros: 10_000, currency: m.currency })}`;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency }).format(m.micros / 1_000_000);
  } catch {
    return `${(m.micros / 1_000_000).toFixed(2)} ${m.currency}`;
  }
}

/** The Allowance row's sub-line: "No monthly limit · $2.60 spent". Items without a price are counted, never added as zero. */
export function allowanceSummary(a: Pick<Allowance, 'monthly_limit' | 'spent'>): string {
  const limit = a.monthly_limit ? `${moneyText(a.monthly_limit)} a month` : 'No monthly limit';
  const unknown = a.spent.unknown_items > 0 ? `, plus ${a.spent.unknown_items} not priced` : '';
  return `${limit} · ${moneyText(a.spent.known)} spent${unknown}`;
}
