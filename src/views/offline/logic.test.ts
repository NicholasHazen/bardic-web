import { describe, expect, it } from 'vitest';
import * as fx from '../../fixtures/offline';
import {
  canStart, chapterRange, chaptersOf, decideAnnounce, deviceWord, downloadLabel, downloadedLine, doesNotFitText, factLines, freeSpaceText, isFullyOnDevice,
  keptText, lengthText, nextDownloaded, offersRange, playableBooks, previewDetail, progressCard, progressOf, ringLabel, sizeProgress, sizeText, sumBytes,
  unavailableChapterText, updateLabel, updateReason, usedFraction, barPercent,
} from './logic';

describe('sizes', () => {
  it('says unknown, never 0', () => {
    expect(sizeText(null)).toBe('unknown');
    expect(freeSpaceText(null)).toBe('Free space on this device is unknown');
    expect(freeSpaceText(54_000_000_000)).toBe('54 GB free on this device');
    expect(sizeText(731_000_000)).toBe('731 MB');
    expect(sizeText(1_200_000_000)).toBe('1.2 GB');
  });
  it('shares a unit', () => {
    expect(sizeProgress(61_000_000, 92_000_000)).toBe('61 of 92 MB');
    expect(sizeProgress(980_000, 4_200_000)).toBe('980 KB of 4.2 MB');
    expect(sizeProgress(null, 4)).toBeNull();
  });
  it('sums only when every size is known', () => {
    expect(sumBytes([{ bytes: 1 }, { bytes: 2 }])).toBe(3);
    expect(sumBytes([{ bytes: 1 }, { bytes: null }])).toBeNull();
  });
});

describe('chapters', () => {
  it('counts N of M', () => {
    expect(chaptersOf(5, 8)).toBe('5 of 8 chapters');
    expect(chaptersOf(18, 18, true)).toBe('18 of 18');
    expect(chaptersOf(1, 1)).toBe('1 of 1 chapter');
  });
  it('knows a book is fully on the device', () => {
    expect(isFullyOnDevice(fx.lanternfall)).toBe(true);
    expect(isFullyOnDevice(fx.ashOnDevice)).toBe(false);
  });
  it('uses the audio words', () => {
    expect(deviceWord('on_device')?.text).toBe('On this device');
    expect(deviceWord('failed')?.text).toBe('Couldn’t download');
    expect(deviceWord('out_of_date')?.text).toBe('Out of date');
    expect(deviceWord('queued')?.text).toBe('Downloading');
    expect(deviceWord('not_downloaded')).toBeNull();
  });
  it('measures progress by bytes, or by chapters when a size is unknown', () => {
    const p = progressOf(fx.ashDownloading);
    expect([p.done, p.total]).toEqual([5, 8]);
    expect(sizeProgress(p.doneBytes, p.totalBytes)).toBe('61 of 92 MB');
    const unknown = { chapters: fx.ashDownloading.chapters.map((c, i) => (i === 0 ? { ...c, bytes: null } : c)) };
    const q = progressOf(unknown);
    expect(q.totalBytes).toBeNull();
    expect(q.fraction).toBeCloseTo(5 / 8);
  });
  it('lists a line for Downloads', () => {
    expect(downloadedLine(fx.ashOnDevice)).toBe('Samantha · 3 of 22 chapters · 41 MB');
    expect(downloadedLine(fx.lanternfall)).toBe('Samantha · 18 of 18 · 210 MB');
  });
});

describe('the card', () => {
  it('reads like the board while running', () => {
    const c = progressCard(fx.ashDownloading, true)!;
    expect(c.title).toBe('Downloading · Samantha');
    expect(c.detail).toBe('5 of 8 chapters · 61 of 92 MB · Wi-Fi');
    expect(c.actions).toEqual(['pause', 'cancel']);
  });
  it('begins every problem with what is kept', () => {
    for (const b of [fx.ashPaused, fx.ashWaitingWifi, fx.ashDeviceFull, fx.ashOffline]) {
      expect(progressCard(b)!.detail).toMatch(/kept\./);
    }
    expect(progressCard(fx.ashOffline)!.detail).toContain('resumes by itself');
    expect(progressCard(fx.ashDeviceFull)!.linkToDownloads).toBe(true);
    expect(progressCard(fx.ashWaitingWifi)!.actions).toContain('mobile');
  });
  it('offers retry when idle with a failure, and nothing when idle and fine', () => {
    expect(progressCard(fx.ashIdleFailed)!.actions).toEqual(['retry']);
    expect(progressCard({ ...fx.lanternfall })).toBeNull();
  });
  it('says nothing was downloaded when nothing was', () => {
    expect(keptText(0, 8)).toBe('Nothing has been downloaded yet.');
    expect(ringLabel(5, 8)).toBe('Downloading 5 of 8 chapters. Open downloads');
  });
});

describe('announcements', () => {
  it('speak the first value, then only a new 10% step after the gap', () => {
    const a = decideAnnounce(null, 5, 0);
    expect(a.say).toBe(true);
    expect(decideAnnounce(a.state, 8, 10_000).say).toBe(false);
    expect(decideAnnounce(a.state, 14, 1_000).say).toBe(false);
    const b = decideAnnounce(a.state, 14, 6_000);
    expect(b.say).toBe(true);
    expect(decideAnnounce(b.state, 15, 60_000, 5000, true).say).toBe(true);
  });
});

describe('the Download sheet', () => {
  const [ready, whole] = [fx.sheetPreviews.ready_now, fx.sheetPreviews.whole_book];
  it('names what it does and the size', () => {
    expect(downloadLabel('ready_now', ready)).toBe('Download 92 MB');
    expect(downloadLabel('whole_book', whole)).toBe('Download 92 MB now');
    expect(downloadLabel('chapters', fx.chosenPreview)).toBe('Download 2 chapters · 23 MB');
    expect(downloadLabel('ready_now', { ...ready, bytes: null })).toBe('Download 8 chapters');
  });
  it('describes each option', () => {
    expect(previewDetail('ready_now', ready, 0)).toBe('8 chapters · 92 MB');
    expect(previewDetail('whole_book', whole, 0, 240_000_000)).toBe('22 chapters · about 240 MB');
    expect(previewDetail('chapters', null, 0)).toBe('');
    expect(previewDetail('ready_now', { ...ready, bytes: null }, 0)).toBe('8 chapters · size unknown');
  });
  it('does not start when it does not fit, and says what is kept', () => {
    expect(canStart(fx.noFitPreviews.ready_now)).toBe(false);
    expect(canStart(ready)).toBe(true);
    expect(canStart(null)).toBe(false);
    expect(doesNotFitText(fx.noFitPreviews.ready_now)).toContain('Nothing on this device has been removed');
  });
});

describe('Downloads', () => {
  it('shows a sliver when something is held, and nothing when unknown', () => {
    const f = usedFraction({ usedBytes: 731_000_000, freeBytes: 54_000_000_000 });
    expect(barPercent(f, true)).toBe(2);
    expect(usedFraction({ usedBytes: 1, freeBytes: null })).toBeNull();
    expect(barPercent(null, true)).toBe(0);
  });
});

describe('update offers', () => {
  it('words the range and the choice', () => {
    expect(chapterRange([1, 2, 3])).toBe('chapters 1 to 3');
    expect(chapterRange([4])).toBe('chapter 4');
    expect(chapterRange([2, 5, 9])).toBe('chapters 2, 5 and 9');
    expect(offersRange(fx.updateOffers, fx.updateNumbers)).toBe('chapters 1 to 3');
    expect(offersRange(fx.updateOffers, {})).toBe('3 chapters');
    expect(updateLabel(3, 162_000_000)).toBe('Update 3 chapters · 162 MB');
    expect(updateLabel(1, null)).toBe('Update 1 chapter');
  });
  it('totals the facts like the board', () => {
    const old = factLines(fx.updateOffers.map((o) => o.held));
    const now = factLines(fx.updateOffers.map((o) => o.newer));
    expect([old.length, old.size]).toEqual(['Length 12:04', '160 MB']);
    expect([now.length, now.size, now.revision]).toEqual(['Length 11:52', '162 MB', 'Sonoma voice 14.1']);
    expect(factLines([{ ...fx.updateOffers[0]!.held, seconds: null }]).length).toBe('Length unknown');
    expect(lengthText(3729)).toBe('1:02:09');
  });
  it('explains the change and promises no replacement', () => {
    expect(updateReason(fx.updateOffers, 'chapters 1 to 3')).toContain('were made again');
    expect(updateReason(fx.updateOffers, 'chapters 1 to 3')).toContain('still fine to keep');
  });
});

describe('O5 and away from home', () => {
  it('offers the next downloaded chapter', () => {
    const n = nextDownloaded(fx.lanternfall.chapters, 4)!;
    expect(n.index).toBe(5);
    expect(nextDownloaded(fx.ashOnDevice.chapters, 3)).toBeNull();
    const t = unavailableChapterText(5, n);
    expect(t.title).toBe('Chapter 5 is not on this device');
    expect(t.playNext).toBe('Play chapter 6');
    expect(unavailableChapterText(7, null).playNext).toBeNull();
  });
  it('lists what can be played, the current book first', () => {
    const p = playableBooks(fx.serverOfflineState.books, fx.placeByBook);
    expect(p.map((b) => [b.title, b.line, b.current])).toEqual([
      ['The Ash Ledger', 'Chapter 4 · 3 chapters on this device', true],
      ['Lanternfall', 'Whole book on this device', false],
    ]);
  });
});
