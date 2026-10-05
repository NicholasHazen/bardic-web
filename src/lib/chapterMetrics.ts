// Chapter details describe measured source text and finished audio. Pages are source pagination,
// never a conversion from words or a count of pages in the reflowing reader.
export interface ChapterMetrics {
  wordCount?: number | null;
  pageCount?: number | null;
  durationSeconds?: number | null;
}

const countKnown = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Compact runtime of finished audio; no guessed duration for a chapter that has not been voiced. */
export function voicedRuntimeText(seconds: number | null | undefined): string | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  if (seconds < 60) return '<1 min audio';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min audio`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min audio` : `${hours} h audio`;
}

/** Known chapter length and finished audio runtime. Unknown facts are omitted rather than shown as zero. */
export function chapterMetricsText(metrics: ChapterMetrics): string | undefined {
  const parts: string[] = [];
  if (countKnown(metrics.wordCount)) parts.push(`${metrics.wordCount.toLocaleString('en-US')} ${metrics.wordCount === 1 ? 'word' : 'words'}`);
  if (countKnown(metrics.pageCount) && metrics.pageCount > 0) parts.push(`${metrics.pageCount.toLocaleString('en-US')} ${metrics.pageCount === 1 ? 'page' : 'pages'}`);
  const runtime = voicedRuntimeText(metrics.durationSeconds);
  if (runtime) parts.push(runtime);
  return parts.length ? parts.join(' · ') : undefined;
}

/** The place inside this chapter, in Unicode code points. Whole-book progress does not enter this calculation. */
export function chapterProgress(offset: number | null | undefined, textLength: number | null | undefined): number | undefined {
  if (typeof offset !== 'number' || !Number.isFinite(offset) || !countKnown(textLength) || textLength === 0) return undefined;
  return Math.min(1, Math.max(0, offset / textLength));
}

export function chapterProgressText(offset: number | null | undefined, textLength: number | null | undefined): string | undefined {
  const fraction = chapterProgress(offset, textLength);
  return fraction === undefined ? undefined : `${Math.floor(fraction * 100)}% through chapter`;
}
