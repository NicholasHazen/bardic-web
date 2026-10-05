// The rules of the book page that need no server: the audio words of a chapter, how many chapters are
// ready, the chapter list (with the matter filter and the short list), progress of a job and the figures
// the free Make ready sheet shows. Plain functions with plain inputs so they can be tested; the store in
// src/state/book.ts joins them to the API.
import { formatBytes } from './bytes';
import { chapterMetricsText, chapterProgressText } from './chapterMetrics';

/** What the server says about a chapter of an audiobook (AudioWord in the contract). */
export type ServerAudioWord = 'not_yet' | 'making' | 'ready';

/** What a device says about its own copy of a chapter (W5 fills it in; until then a device holds nothing). */
export type DeviceCopy = 'held' | 'downloading' | 'failed' | 'out_of_date';

/** The words of docs/UI-GUIDE.md "Audio (per chapter)". */
export type AudioWord = 'on_device' | 'ready' | 'making' | 'not_yet' | 'downloading' | 'failed' | 'out_of_date';

export const AUDIO_WORD_TEXT: Record<AudioWord, string> = {
  on_device: 'On this device',
  ready: 'Ready',
  making: 'Making',
  not_yet: 'Not yet',
  downloading: 'Downloading',
  failed: 'Couldn’t download',
  out_of_date: 'Out of date',
};

export type BadgeTone = 'idle' | 'ready' | 'making' | 'paid' | 'failed' | 'here';

export const AUDIO_WORD_TONE: Record<AudioWord, BadgeTone> = {
  on_device: 'ready',
  ready: 'ready',
  making: 'making',
  not_yet: 'idle',
  downloading: 'making',
  failed: 'failed',
  out_of_date: 'paid',
};

/**
 * The one audio word of a chapter. A device's own state wins (a copy it holds keeps playing even when the
 * server freed the audio); otherwise the server's word.
 */
export function chapterWord(server: ServerAudioWord | undefined, device?: DeviceCopy): AudioWord {
  if (device === 'downloading') return 'downloading';
  if (device === 'failed') return 'failed';
  if (device === 'out_of_date') return 'out_of_date';
  if (device === 'held') return 'on_device';
  if (server === 'ready') return 'ready';
  if (server === 'making') return 'making';
  return 'not_yet';
}

export interface ChapterAudio {
  state: ServerAudioWord;
  /** Seconds and bytes of the audio, when it exists. */
  durationSeconds?: number;
  bytes?: number;
}

export interface Readiness {
  total: number;
  /** Audio exists on the server. */
  ready: number;
  /** A copy is held on this device. */
  onDevice: number;
  /** 0 to 1 */
  fraction: number;
}

/** "8 of 22 chapters ready" and "3 on this device". A chapter held on the device but freed on the server counts as on the device only. */
export function readiness(ids: readonly string[], audio: ReadonlyMap<string, ChapterAudio>, held: ReadonlySet<string> = new Set()): Readiness {
  let ready = 0;
  let onDevice = 0;
  for (const id of ids) {
    if (audio.get(id)?.state === 'ready') ready++;
    if (held.has(id)) onDevice++;
  }
  const total = ids.length;
  return { total, ready, onDevice, fraction: total ? ready / total : 0 };
}

export const readyText = (r: Pick<Readiness, 'ready' | 'total'>) => `${r.ready} of ${r.total} chapters ready`;
export const deviceText = (n: number) => `${n} on this device`;
/** The line of another audiobook: "13 of 22 ready · 1 on this device" (the device part only when something is held). */
export function otherLine(ready: number, total: number, onDevice: number): string {
  const base = `${ready} of ${total} ready`;
  return onDevice > 0 ? `${base} · ${deviceText(onDevice)}` : base;
}

// --------------------------------------------------------------------------- the chapter list

export interface ChapterInfo {
  id: string;
  title: string;
  kind: 'story' | 'front_matter' | 'back_matter';
  wordCount?: number;
  textLength?: number;
  pageCount?: number | null;
}

export interface ChapterRowModel {
  id: string;
  /** Story chapters count from 1; front and back matter carry a dash. */
  number: string;
  title: string;
  /** "You are here" under the current chapter. */
  detail?: string;
  /** Measured source length and audio runtime, when known. */
  metadata?: string;
  /** Progress within this chapter by text offset; separate from the audio word. */
  progressText?: string;
  current: boolean;
  matter: boolean;
  word: AudioWord;
  wordText: string;
  tone: BadgeTone;
  /** Legacy board presentation: percentage in the audio badge. Live rows use progressText and retain the audio word. */
  progress?: string;
}

export const isMatter = (c: Pick<ChapterInfo, 'kind'>) => c.kind !== 'story';

export function hasMatter(chapters: readonly Pick<ChapterInfo, 'kind'>[]): boolean {
  return chapters.some(isMatter);
}

/** The matter filter (B6): "story" leaves out front and back matter. */
export function filterMatter<T extends Pick<ChapterInfo, 'kind'>>(chapters: readonly T[], filter: 'all' | 'story'): T[] {
  return filter === 'story' ? chapters.filter((c) => !isMatter(c)) : [...chapters];
}

export const percentText = (p: number) => `${Math.floor(Math.min(Math.max(p, 0), 1) * 100)}%`;

export interface RowsInput {
  chapters: readonly ChapterInfo[];
  audio: ReadonlyMap<string, ChapterAudio>;
  held?: ReadonlySet<string>;
  /** Device copies that are not simply held (W5). */
  deviceState?: ReadonlyMap<string, DeviceCopy>;
  currentId?: string | null;
  /** Legacy board presentation only: the listener's progress in the book, 0 to 1. */
  progress?: number;
  /** Unicode code point place inside the current chapter. */
  currentOffset?: number;
  /** Measured runtime of the copy this device actually holds; preferred to newer server audio. */
  heldDurations?: ReadonlyMap<string, number>;
  filter?: 'all' | 'story';
}

/** One row per chapter, each with exactly one audio word (B4). Numbers count story chapters of the whole book, whatever the filter. */
export function chapterRows(input: RowsInput): ChapterRowModel[] {
  const { chapters, audio, held = new Set(), deviceState = new Map(), currentId, progress, currentOffset, heldDurations = new Map(), filter = 'all' } = input;
  let story = 0;
  const numbered = chapters.map((c) => ({ c, number: isMatter(c) ? '–' : String(++story) }));
  return numbered
    .filter(({ c }) => filter === 'all' || !isMatter(c) || c.id === currentId)
    .map(({ c, number }) => {
      const device = deviceState.get(c.id) ?? (held.has(c.id) ? 'held' : undefined);
      const word = chapterWord(audio.get(c.id)?.state, device);
      const current = c.id === currentId;
      const row: ChapterRowModel = {
        id: c.id,
        number,
        title: c.title,
        current,
        matter: isMatter(c),
        word,
        wordText: AUDIO_WORD_TEXT[word],
        tone: AUDIO_WORD_TONE[word],
      };
      const serverAudio = audio.get(c.id);
      const durationSeconds = heldDurations.get(c.id) ?? (device === 'held' || device === 'out_of_date'
        ? undefined
        : serverAudio?.state === 'ready' ? serverAudio.durationSeconds : undefined);
      const metadata = chapterMetricsText({ wordCount: c.wordCount, pageCount: c.pageCount, durationSeconds });
      if (metadata) row.metadata = metadata;
      if (current) {
        row.detail = 'You are here';
        const withinChapter = chapterProgressText(currentOffset, c.textLength);
        if (withinChapter) row.progressText = withinChapter;
        if ((word === 'ready' || word === 'on_device') && progress !== undefined) row.progress = percentText(progress);
      }
      return row;
    });
}

export const SHORT_LIST = 4;

export interface ShortList {
  rows: ChapterRowModel[];
  /** More rows exist than are shown. */
  more: boolean;
  total: number;
}

/** The first look at the list: a few rows from the current chapter (or the start). `expanded` shows all. */
export function shortList(rows: readonly ChapterRowModel[], expanded: boolean, size = SHORT_LIST): ShortList {
  const total = rows.length;
  if (expanded || total <= size) return { rows: [...rows], more: false, total };
  const at = rows.findIndex((r) => r.current);
  const start = at < 0 ? 0 : Math.min(at, total - size);
  return { rows: rows.slice(start, start + size), more: true, total };
}

/**
 * The chapter after `fromId` that "next chapter" goes to: front and back matter are skipped unless
 * `includeMatter` (B6). Undefined at the end.
 */
export function nextChapter<T extends Pick<ChapterInfo, 'id' | 'kind'>>(chapters: readonly T[], fromId: string, includeMatter = false): T | undefined {
  const i = chapters.findIndex((c) => c.id === fromId);
  if (i < 0) return undefined;
  return chapters.slice(i + 1).find((c) => includeMatter || !isMatter(c));
}

// --------------------------------------------------------------------------- the running job

export type JobStateName = 'queued' | 'running' | 'waiting' | 'paused' | 'needs_you' | 'completed' | 'stopped' | 'failed';

/** A job that is still going (the audiobook card shows it as making ready). */
export const isActiveJob = (state: JobStateName) => state === 'queued' || state === 'running' || state === 'waiting' || state === 'paused' || state === 'needs_you';

export interface RunningModel {
  label: string;
  tone: 'making' | 'idle' | 'failed';
  countText: string;
  /** What is ready in the audiobook, 0 to 1 (the light bar). */
  ready: number;
  /** What this job has made, 0 to 1 (the accent bar). */
  done: number;
  note: string;
  paused: boolean;
  canPause: boolean;
  canResume: boolean;
}

/** Seconds left from the pace so far, or undefined when nothing was made yet (unknown stays unknown). */
export function secondsLeft(done: number, total: number, startedAtMs: number, nowMs: number): number | undefined {
  if (done <= 0 || total <= done) return undefined;
  const elapsed = (nowMs - startedAtMs) / 1000;
  if (!(elapsed > 0)) return undefined;
  return Math.round((elapsed / done) * (total - done));
}

/** "About 22 min", "About 1 h 5 min", "Less than a minute". */
export function durationText(seconds: number): string {
  if (seconds < 45) return 'Less than a minute';
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `About ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `About ${h} h` : `About ${h} h ${m} min`;
}

export interface JobLike {
  state: JobStateName;
  chapters_total: number;
  chapters_done: number;
  created_at: string;
  waiting?: { text: string } | null;
  needs_you?: { text: string } | null;
}

export function runningModel(job: JobLike, audiobook: { chapters_ready: number; chapters_total: number }, nowMs: number): RunningModel {
  const total = Math.max(job.chapters_total, 0);
  const done = Math.min(job.chapters_done, total);
  const m: RunningModel = {
    label: 'Making it ready',
    tone: 'making',
    countText: `${done} of ${total} chapters`,
    ready: audiobook.chapters_total ? Math.max(audiobook.chapters_ready, done) / audiobook.chapters_total : 0,
    done: total ? done / total : 0,
    note: '',
    paused: false,
    canPause: false,
    canResume: false,
  };
  const left = secondsLeft(done, total, Date.parse(job.created_at), nowMs);
  switch (job.state) {
    case 'queued':
    case 'running':
      m.note = left === undefined ? 'Getting started. You can listen while it works.' : `${durationText(left)} left. You can listen while it works.`;
      m.canPause = true;
      break;
    case 'waiting':
      m.label = 'Waiting';
      m.tone = 'idle';
      m.note = `${job.waiting?.text ?? 'Held for a moment.'} Nothing is wrong; finished chapters are kept.`;
      m.canPause = true;
      break;
    case 'paused':
      m.label = 'Paused';
      m.tone = 'idle';
      m.paused = true;
      m.note = 'Paused. Finished chapters are kept.';
      m.canResume = true;
      break;
    case 'needs_you':
      m.label = 'Needs you';
      m.tone = 'failed';
      m.note = `Finished chapters are kept. ${job.needs_you?.text ?? ''}`.trim();
      m.canPause = true;
      break;
    default:
      m.note = '';
  }
  return m;
}

// --------------------------------------------------------------------------- the free Make ready sheet

export interface ScopeBody {
  kind: 'whole_book' | 'from_chapter';
  from_chapter_id?: string | null;
  include_matter?: boolean;
}

export interface MakeOption {
  id: 'whole' | 'from';
  title: string;
  detail: string;
  scope: ScopeBody;
  /** Chapters of the scope, in reading order. */
  chapterIds: string[];
}

export interface MakeInput {
  chapters: readonly (ChapterInfo & { word_count: number })[];
  audio: ReadonlyMap<string, ChapterAudio>;
  /** The chapter the listener is in; offers "From chapter N" when it is not the first. */
  currentId?: string | null;
  /** Whether front and back matter are voiced. Omitted preserves the existing whole-book scopes. */
  includeMatter?: boolean;
}

function scopeDetail(ids: string[], audio: ReadonlyMap<string, ChapterAudio>): string {
  const ready = ids.filter((id) => audio.get(id)?.state === 'ready').length;
  const noun = `${ids.length} ${ids.length === 1 ? 'chapter' : 'chapters'}`;
  if (ready === 0) return `${noun} · none ready yet`;
  if (ready === ids.length) return `${noun} · all ready`;
  return `${noun} · ${ready} ready`;
}

/** The scopes a free voice can be made ready for: the whole book, and from the current chapter when there is one after the first. */
export function makeOptions(input: MakeInput): MakeOption[] {
  const { chapters, audio, currentId, includeMatter = true } = input;
  const eligible = (c: ChapterInfo) => includeMatter || !isMatter(c);
  const matterScope = input.includeMatter === undefined ? {} : { include_matter: includeMatter };
  const all = chapters.filter(eligible).map((c) => c.id);
  const out: MakeOption[] = [{ id: 'whole', title: 'Whole book', detail: scopeDetail(all, audio), scope: { kind: 'whole_book', ...matterScope }, chapterIds: all }];
  const at = currentId ? chapters.findIndex((c) => c.id === currentId) : -1;
  if (at > 0) {
    const ids = chapters.slice(at).filter(eligible).map((c) => c.id);
    const c = chapters[at]!;
    const story = chapters.slice(0, at + 1).filter((x) => !isMatter(x)).length;
    out.push({
      id: 'from',
      title: isMatter(c) ? 'From here' : `From chapter ${story}`,
      detail: scopeDetail(ids, audio),
      scope: { kind: 'from_chapter', from_chapter_id: c.id, ...matterScope },
      chapterIds: ids,
    });
  }
  return out;
}

/** Speech runs at about this many words a minute when read aloud. */
export const WORDS_PER_MINUTE = 150;
/**
 * Seconds of audio a free voice makes per second of waiting, until a job has measured it. Breeze on
 * the reference machine runs at about 0.9: slightly slower than real time (measured live: 10.2 s of
 * audio in 10.8 s). An assumption, said as "About". So a long book takes about as long as it lasts.
 */
export const ASSUMED_MAKE_RATE = 0.9;
/** 24 kHz 16-bit mono WAV, what the server stores today; used for the size until audio of this server has been measured. */
export const ASSUMED_BYTES_PER_SECOND = 48_000;

/** Bytes per second of audio, measured from audio already made (undefined when there is none). */
export function measuredBytesPerSecond(audio: Iterable<ChapterAudio>): number | undefined {
  let bytes = 0;
  let seconds = 0;
  for (const a of audio) {
    if (a.state === 'ready' && a.bytes && a.durationSeconds) {
      bytes += a.bytes;
      seconds += a.durationSeconds;
    }
  }
  return seconds > 0 ? bytes / seconds : undefined;
}

export interface MakeEstimate {
  toMake: number;
  seconds: number;
  bytes: number;
  /** True when the size comes from audio already made rather than the default rate. */
  measured: boolean;
}

/** What making the not-ready chapters of a scope takes: chapters, time and space on the server. */
export function estimateMake(
  chapters: readonly Pick<ChapterInfo & { word_count: number }, 'id' | 'word_count'>[],
  scopeIds: readonly string[],
  audio: ReadonlyMap<string, ChapterAudio>,
  bytesPerSecond?: number,
): MakeEstimate {
  const inScope = new Set(scopeIds);
  const todo = chapters.filter((c) => inScope.has(c.id) && audio.get(c.id)?.state !== 'ready');
  const words = todo.reduce((n, c) => n + c.word_count, 0);
  const spoken = (words / WORDS_PER_MINUTE) * 60;
  return {
    toMake: todo.length,
    seconds: spoken / ASSUMED_MAKE_RATE,
    bytes: Math.round(spoken * (bytesPerSecond ?? ASSUMED_BYTES_PER_SECOND)),
    measured: bytesPerSecond !== undefined,
  };
}

export const countText = (n: number) => `${n} ${n === 1 ? 'chapter' : 'chapters'}`;
export const timeText = (seconds: number) => `${durationText(seconds)}, in the background`;
export const spaceText = (bytes: number) => `About ${formatBytes(bytes)} on the server`;
