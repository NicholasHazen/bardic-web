import { describe, expect, it } from 'vitest';
import { generationModel, remainingTime, type GenerationJob, type GenerationProgress } from './generationProgress';
import { runningModel } from './bookAudio';

const progress: GenerationProgress = {
  chapter_id: 'c1', requests_done: 1, requests_total: 4, characters_done: 1500, characters_total: 10000,
  elapsed_seconds: 30, chapter_seconds_remaining: 170, job_seconds_remaining: 600,
};
const job: GenerationJob = { state: 'running', current_chapter_id: 'c1', generation: progress };

describe('generation progress from measured server work', () => {
  it('weights the chapter by completed text rather than unequal request counts', () => {
    expect(generationModel(job, [{ id: 'c1', title: 'A synthetic chapter' }])).toMatchObject({
      title: 'A synthetic chapter', fraction: 0.15, detail: '15% of chapter · 1 of 4 requests complete',
      chapterTime: 'Chapter: About 3 min left', jobTime: 'Selected chapters: About 10 min left',
    });
  });
  it('shows unknown before a timing sample, even if the job has been queued for hours', () => {
    const g = { ...progress, requests_done: 0, characters_done: 0, chapter_seconds_remaining: null, job_seconds_remaining: null };
    expect(generationModel({ ...job, generation: g })).toMatchObject({ fraction: 0, chapterTime: expect.stringContaining('Unknown'), jobTime: expect.stringContaining('Unknown') });
    const m = runningModel({ state: 'running', chapters_total: 5, chapters_done: 2, created_at: '2020-01-01', generation: null }, { chapters_ready: 2, chapters_total: 5 }, Date.now());
    expect(m.note).toContain('Unknown');
  });
  it('suppresses estimates during pauses, quota waits and decisions', () => {
    for (const state of ['paused', 'waiting', 'needs_you']) {
      expect(generationModel({ ...job, state })).toMatchObject({ chapterTime: expect.stringContaining('Unknown'), jobTime: expect.stringContaining('Unknown') });
    }
  });
  it('does not attach a previous chapter or ended attempt to a new chapter', () => {
    expect(generationModel({ ...job, current_chapter_id: 'c2' })).toBeNull();
    for (const state of ['queued', 'completed', 'stopped', 'failed']) expect(generationModel({ ...job, state })).toBeNull();
    expect(generationModel({ ...job, generation: null })).toBeNull();
  });
  it('never emits NaN or unbounded progress for invalid data', () => {
    for (const invalid of [{ characters_total: 0 }, { requests_total: 0 }, { characters_done: NaN }, { characters_done: -1 }]) {
      expect(generationModel({ ...job, generation: { ...progress, ...invalid } })).toBeNull();
    }
    expect(generationModel({ ...job, generation: { ...progress, characters_done: 20000, requests_done: 8 } })).toMatchObject({ fraction: 1, detail: '100% of chapter · 4 of 4 requests complete' });
    for (const value of [null, undefined, NaN, Infinity, -1]) expect(remainingTime(value)).toBeNull();
    expect(remainingTime(0)).toBe('Less than a minute left');
  });
});
