<script lang="ts">
  import { get } from 'svelte/store';
  import { offline } from '../../../offline/offline';
  import type { DownloadPreview, DownloadScope } from '../../../offline/types';
  import { isTablet } from '../../shell/viewport';
  import DownloadSheet from '../DownloadSheet.svelte';
  import type { ScopeKind } from '../logic';
  import type { PickChapter } from '../types';

  /**
   * The Download sheet, connected (O1): the numbers come from `offline.preview` for each scope (nothing is downloaded to
   * work them out) and Start is `offline.start`. A problem is said in the sheet, beginning with what is kept.
   */
  interface Props {
    audiobookId: string;
    voiceName: string;
    chapters: PickChapter[];
    onclose?: () => void;
    onopendownloads?: () => void;
  }
  let { audiobookId, voiceName, chapters, onclose, onopendownloads }: Props = $props();

  let scope = $state<ScopeKind>('ready_now');
  let selected = $state<string[]>([]);
  // Wi-Fi only is the sensible default only where the browser can tell Wi-Fi from mobile data. Where it cannot (Safari,
  // most desktop browsers) the option would wait forever, so it starts off and the sheet says why.
  let wifiOnly = $state(get(offline).storage.unmetered !== null);
  let keepNew = $state(true);
  let busy = $state(false);
  let error = $state<string | undefined>();
  let previews = $state<{ ready_now: DownloadPreview | null; whole_book: DownloadPreview | null; chapters: DownloadPreview | null }>({ ready_now: null, whole_book: null, chapters: null });

  // The two fixed scopes are counted when the sheet opens; the chosen chapters whenever the choice changes.
  $effect(() => {
    const id = audiobookId;
    let live = true;
    for (const kind of ['ready_now', 'whole_book'] as const) {
      void offline.preview(id, { kind }).then(
        (p) => live && (previews[kind] = p),
        () => live && (previews[kind] = { chaptersToGet: 0, bytes: null, freeBytes: null, fits: null, notReadyYet: 0 }),
      );
    }
    return () => (live = false);
  });
  $effect(() => {
    const ids = selected;
    const id = audiobookId;
    if (ids.length === 0) {
      previews.chapters = null;
      return;
    }
    let live = true;
    void offline.preview(id, { kind: 'chapters', chapterIds: ids }).then(
      (p) => live && (previews.chapters = p),
      () => live && (previews.chapters = { chaptersToGet: 0, bytes: null, freeBytes: null, fits: null, notReadyYet: 0 }),
    );
    return () => (live = false);
  });

  const freeBytes = $derived(previews[scope]?.freeBytes ?? previews.ready_now?.freeBytes ?? $offline.storage.freeBytes);

  async function start(s: DownloadScope, opts: { wifiOnly: boolean; keepNew: boolean }) {
    busy = true;
    error = undefined;
    try {
      await offline.start(audiobookId, s, opts);
    } catch {
      error = 'Nothing was downloaded and nothing on this device was changed. Try again.';
    }
    busy = false;
    const problem = $offline.notice;
    if (error || (problem && $offline.books.find((b) => b.audiobookId === audiobookId)?.status === 'idle')) {
      error ??= problem ?? undefined;
      return;
    }
    onclose?.();
  }
</script>

<DownloadSheet
  {voiceName}
  bind:scope
  bind:selected
  bind:wifiOnly
  bind:keepNew
  {previews}
  {chapters}
  {freeBytes}
  unmetered={$offline.storage.unmetered}
  {error}
  {busy}
  placement={$isTablet ? 'popover' : 'bottom'}
  onstart={start}
  {onopendownloads}
  {onclose}
/>
