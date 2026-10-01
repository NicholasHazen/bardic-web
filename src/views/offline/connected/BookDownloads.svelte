<script lang="ts">
  import { offline } from '../../../offline/offline';
  import DownloadProgressView from '../DownloadProgressView.svelte';
  import { downloadRows, showDownloadCard } from './mapping';

  /**
   * The download of one audiobook on its book page, connected (O2, O6): progress, pause, resume, cancel, retry, use mobile
   * data, and the chapters that failed or are out of date. Nothing shows while nothing is going on and nothing needs a choice.
   */
  interface Props {
    audiobookId: string;
    /** Opens the newer-audio sheet. */
    onupdate?: (chapterId: string) => void;
  }
  let { audiobookId, onupdate }: Props = $props();

  const book = $derived($offline.books.find((b) => b.audiobookId === audiobookId));
</script>

{#if showDownloadCard(book)}
  <DownloadProgressView
    {book}
    rows={downloadRows(book)}
    unmetered={$offline.storage.unmetered}
    onpause={() => offline.pause(audiobookId)}
    onresume={() => offline.resume(audiobookId)}
    oncancel={() => offline.cancel(audiobookId)}
    onretry={(id) => offline.retry(audiobookId, id)}
    onusemobile={() => offline.setOptions(audiobookId, { wifiOnly: false })}
    {onupdate}
    onopendownloads={() => (location.hash = '#/settings/downloads')}
  />
{/if}
