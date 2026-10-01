<script lang="ts">
  import * as fx from '../../../fixtures/offline';
  import SheetFrame from '../../voices/boards/SheetFrame.svelte';
  import DownloadSheet from '../DownloadSheet.svelte';
  import UnavailableChapterNotice from '../UnavailableChapterNotice.svelte';
  import UpdateAudioSheet from '../UpdateAudioSheet.svelte';
  import { nextDownloaded } from '../logic';

  /** Not a design board: the sheets in states the boards do not draw. */
  const next = nextDownloaded(fx.ashOnDevice.chapters, 3);
</script>

<div class="gallery">
  <div class="cell"><SheetFrame><DownloadSheet voiceName="Samantha" scope="chapters" selected={['c4', 'c5']} previews={{ ...fx.sheetPreviews, chapters: fx.chosenPreview }} chapters={fx.pickChapters} freeBytes={null} unmetered={null} /></SheetFrame></div>
  <div class="cell"><SheetFrame><DownloadSheet voiceName="Samantha" previews={fx.noFitPreviews} freeBytes={40_000_000} unmetered={true} error="Nothing was removed from this device. Your Bardic computer didn’t answer." onopendownloads={() => {}} /></SheetFrame></div>
  <div class="cell"><SheetFrame><UpdateAudioSheet offers={fx.updateOffers} numbers={fx.updateNumbers} playing={{ chapterId: 'c1', which: 'new' }} error="Your copies are kept. The device has no room for the new audio." /></SheetFrame></div>
  <div class="cell"><SheetFrame><UpdateAudioSheet offers={[fx.updateOffers[1]!]} numbers={fx.updateNumbers} /></SheetFrame></div>
  <div class="cell note"><UnavailableChapterNotice chapterNumber={7} {next} /> <UnavailableChapterNotice chapterNumber={7} next={null} /></div>
</div>

<style>
  .gallery { display: flex; flex-wrap: wrap; gap: 24px; width: 1260px; background: #000; padding: 8px; }
  .cell { width: 390px; height: 844px; position: relative; overflow: hidden; }
  .note { height: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--base); color: var(--ink); }
</style>
