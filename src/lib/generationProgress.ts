import { durationText } from './bookAudio';

/** Completed provider requests, not streamed audio or playable chapter completion. */
export interface GenerationProgress {
  chapter_id: string;
  requests_done: number;
  requests_total: number;
  characters_done: number;
  characters_total: number;
  elapsed_seconds: number;
  chapter_seconds_remaining: number | null;
  job_seconds_remaining: number | null;
}

export interface GenerationJob {
  state: string;
  current_chapter_id?: string | null;
  generation?: GenerationProgress | null;
}

export interface GenerationModel {
  chapterId: string;
  title: string;
  fraction: number;
  detail: string;
  chapterTime: string;
  jobTime: string;
}

export function remainingTime(seconds: number | null | undefined): string | null {
  return seconds != null && Number.isFinite(seconds) && seconds >= 0
    ? `${durationText(seconds)} left`
    : null;
}

/** No extrapolation from the job's creation time: queueing, pauses and quota waits are not work. */
export function generationModel(job: GenerationJob | null | undefined, chapters: readonly { id: string; title: string }[] = []): GenerationModel | null {
  const g = job?.generation;
  if (!g || !['running', 'waiting', 'paused', 'needs_you'].includes(job!.state) || g.chapter_id !== job!.current_chapter_id) return null;
  if (![g.characters_done, g.characters_total, g.requests_done, g.requests_total].every((n) => Number.isFinite(n) && n >= 0) || g.characters_total === 0 || g.requests_total === 0) return null;
  const fraction = Math.min(g.characters_done / g.characters_total, 1);
  const active = job!.state === 'running';
  const chapterTime = active ? remainingTime(g.chapter_seconds_remaining) : null;
  const jobTime = active ? remainingTime(g.job_seconds_remaining) : null;
  return {
    chapterId: g.chapter_id,
    title: chapters.find((c) => c.id === g.chapter_id)?.title ?? 'Current chapter',
    fraction,
    detail: `${Math.floor(fraction * 100)}% of chapter · ${Math.min(g.requests_done, g.requests_total)} of ${g.requests_total} requests complete`,
    chapterTime: chapterTime ? `Chapter: ${chapterTime}` : active ? 'Chapter time: Unknown until enough audio is made' : 'Chapter time: Unknown while generation is not running',
    jobTime: jobTime ? `Selected chapters: ${jobTime}` : active ? 'Generation time: Unknown until enough audio is made' : 'Generation time: Unknown while generation is not running',
  };
}
