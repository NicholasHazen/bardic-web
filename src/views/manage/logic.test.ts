import { describe, expect, it } from 'vitest';
import {
  bannerTitle,
  chaptersReadyText,
  countdownBadge,
  countdownText,
  defaultChosen,
  deleteList,
  deleteRefusal,
  finishAction,
  freeButtonLabel,
  freedToast,
  freeRefusal,
  freeSpaceSummary,
  freeTotals,
  premiumWarning,
  remainingSeconds,
  remakeCostText,
  serverNameProblem,
  serverNameProblemText,
  totalText,
  undoRefusal,
  versionText,
} from './logic';
import type { RemakeEstimate, SpaceRow } from './types';

const usd = (micros: number) => ({ micros, currency: 'USD' });
const est = (low: number, high: number, basis: RemakeEstimate['basis'] = 'provider'): RemakeEstimate => ({ low: usd(low), likely: usd((low + high) / 2), high: usd(high), basis });
const samantha: SpaceRow = { id: 'a', name: 'Samantha', premium: false, chaptersReady: 8, chaptersTotal: 22, bytes: 160_000_000, remake: null };
const kore: SpaceRow = { id: 'b', name: 'Kore', premium: true, chaptersReady: 13, chaptersTotal: 22, bytes: 310_000_000, remake: est(1_800_000, 2_600_000) };

describe('what a delete lists', () => {
  it('lists the text, every audiobook with its size, and places, history and plans', () => {
    const rows = deleteList({ chapters: 22, words: 74200 }, [samantha, kore]);
    expect(rows.map((r) => r.title)).toEqual(['The book and its text', 'All audio made for it', 'Places, history and plans']);
    expect(rows[0]!.detail).toBe('22 chapters · 74,200 words');
    expect(rows[1]!.detail).toBe('Samantha 160 MB · Kore 310 MB');
  });
  it('says so when no audio was made, and never shows an unknown size as 0', () => {
    expect(deleteList({ chapters: 1, words: 1 }, [])[1]!.detail).toBe('No audio has been made for it');
    expect(deleteList({ chapters: 1, words: 1 }, [{ name: 'Mara', bytes: null }])[1]!.detail).toBe('Mara unknown');
    expect(deleteList({ chapters: 1, words: 1 }, [])[0]!.detail).toBe('1 chapter · 1 word');
  });
  it('a refusal starts with what is kept', () => {
    for (const code of ['job_running', 'deletion_pending', 'book_adding', 'other']) expect(deleteRefusal(code, 'x')).toMatch(/^(Nothing)/);
    expect(deleteRefusal('job_running', '')).toMatch(/Audio is being made/);
    expect(deleteRefusal('other', 'Disk full.')).toContain('Disk full.');
  });
  it('undo that comes too late says the book is gone', () => {
    expect(undoRefusal('deletion_done', '')).toMatch(/already deleted/);
    expect(undoRefusal('deletion_not_found', '')).toMatch(/no longer scheduled/);
    expect(undoRefusal('x', 'Try again.')).toMatch(/still scheduled/);
  });
});

describe('free up space', () => {
  const rows = [samantha, kore];
  it('chooses the free audio by default and never the premium one', () => {
    expect([...defaultChosen(rows)]).toEqual(['a']);
    expect([...defaultChosen([{ ...samantha, bytes: 0 }])]).toEqual([]);
  });
  it('totals what is chosen and counts what it cannot size', () => {
    expect(freeTotals(rows, new Set(['a']))).toEqual({ bytes: 160_000_000, unknown: 0, count: 1 });
    expect(freeTotals(rows, new Set(['a', 'b'])).bytes).toBe(470_000_000);
    const t = freeTotals([samantha, { ...kore, bytes: null }], new Set(['a', 'b']));
    expect(t).toEqual({ bytes: 160_000_000, unknown: 1, count: 2 });
    expect(totalText(t)).toBe('at least 160 MB');
    expect(totalText(freeTotals([{ ...kore, bytes: null }], new Set(['b'])))).toBe('unknown');
    expect(totalText(freeTotals(rows, new Set()))).toBe('0 B');
  });
  it('the button names what goes and how much, as the board does', () => {
    expect(freeButtonLabel(rows, new Set(['a']))).toBe('Delete Samantha audio · 160 MB');
    expect(freeButtonLabel(rows, new Set(['a', 'b']))).toBe('Delete audio of 2 audiobooks · 470 MB');
    expect(freeButtonLabel(rows, new Set())).toBe('Choose audio to delete');
  });
  it('the row says how many chapters are ready', () => {
    expect(chaptersReadyText(samantha)).toBe('Free · 8 of 22 chapters ready');
    expect(chaptersReadyText(kore)).toBe('Premium · 13 of 22 chapters ready');
  });
  it('the premium warning shows the estimate range, and says a new plan is needed', () => {
    expect(premiumWarning(kore)).toEqual({
      title: 'Making Kore again costs money',
      body: 'Deleting Kore’s audio frees 310 MB. Getting it back needs a new plan, about $1.80 to $2.60.',
    });
  });
  it('does not invent a price when the server has none', () => {
    expect(remakeCostText(est(0, 0, 'unknown'))).toBe('the cost cannot be estimated');
    expect(remakeCostText(null)).toBe('the cost cannot be estimated');
    expect(premiumWarning({ ...kore, remake: undefined }).body).toMatch(/new plan, the cost cannot be estimated\.$/);
    expect(remakeCostText(est(2_600_000, 2_600_000))).toBe('about $2.60');
    expect(remakeCostText(est(1_000, 4_000))).toBe('under $0.01');
  });
  it('the result toast keeps places and downloads in the words', () => {
    expect(freedToast(1_200_000_000)).toBe('Freed 1.2 GB. Places and downloads are kept.');
    expect(freedToast(null)).toMatch(/^Freed the audio\./);
  });
  it('a refusal begins with what is kept', () => {
    expect(freeRefusal('job_running', '')).toMatch(/^Your audio, places and downloads were not touched\. Audio is being made/);
    expect(freeRefusal('x', 'Boom.')).toMatch(/^Your audio, places and downloads were not touched\. Boom\./);
  });
  it('the menu line lists only audio that can be freed', () => {
    expect(freeSpaceSummary(rows)).toBe('Delete audio you can make again: 160 MB Samantha, 310 MB Kore');
    expect(freeSpaceSummary([{ name: 'Mara', bytes: 0 }])).toMatch(/No audio/);
  });
});

describe('the countdown', () => {
  const at = '2026-01-15T12:01:00.000Z';
  const t0 = Date.parse('2026-01-15T12:00:13.000Z');
  const T_EARLY = Date.parse('2026-01-15T11:59:59.900Z');
  it('counts whole seconds to the server time, never below zero', () => {
    expect(remainingSeconds(at, t0)).toBe(47);
    expect(remainingSeconds(at, t0 + 46_001)).toBe(1);
    expect(remainingSeconds(at, t0 + 100_000)).toBe(0);
    expect(remainingSeconds('nonsense', t0)).toBe(0);
    // never more than the wait the server set, even when this device's idea of the server's clock is a little late
    expect(remainingSeconds(at, T_EARLY, 0, 60)).toBe(60);
    expect(remainingSeconds(at, T_EARLY, 0)).toBe(61);
  });
  it('corrects for a device clock that is off', () => {
    // this device is 5 minutes fast: server time = device time - 5 min
    expect(remainingSeconds(at, t0 + 300_000, -300_000)).toBe(47);
  });
  it('says it in words', () => {
    expect(countdownText(47)).toBe('Permanent in 47 seconds');
    expect(countdownText(1)).toBe('Permanent in 1 second');
    expect(countdownText(0)).toBe('Deleting now');
    expect(countdownText(125)).toBe('Permanent in 2 min 5 s');
    expect(countdownText(120)).toBe('Permanent in 2 min');
    expect(countdownBadge(47)).toBe('47');
    expect(countdownBadge(500)).toBe('99+');
    expect(bannerTitle('The Ash Ledger')).toBe('Deleting The Ash Ledger');
    expect(bannerTitle('')).toBe('Deleting a book');
  });
});

describe('the menu', () => {
  it('offers the one that changes something', () => {
    expect(finishAction(null)).toBe('finish');
    expect(finishAction({ finished: { finished: false } })).toBe('finish');
    expect(finishAction({ finished: { finished: true } })).toBe('reopen');
  });
});

describe('server name', () => {
  it('trims, counts code points and refuses control characters', () => {
    expect(serverNameProblem('  Nick’s Mac mini ')).toBeNull();
    expect(serverNameProblem('   ')).toBe('empty');
    expect(serverNameProblem('')).toBe('empty');
    expect(serverNameProblem('a'.repeat(60))).toBeNull();
    expect(serverNameProblem('a'.repeat(61))).toBe('too_long');
    expect(serverNameProblem('😀'.repeat(60))).toBeNull();
    expect(serverNameProblem('a\nb')).toBe('control');
    expect(serverNameProblemText('too_long')).toMatch(/60/);
  });
  it('version', () => {
    expect(versionText('2.0.0', '0.4.0')).toBe('2.0.0 (API 0.4.0)');
    expect(versionText('0.4.0', '0.4.0')).toBe('0.4.0');
  });
});
