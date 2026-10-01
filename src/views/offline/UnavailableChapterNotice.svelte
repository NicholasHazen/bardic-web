<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import type { ChapterRef } from './logic';
  import { unavailableChapterText } from './logic';

  /**
   * O5: opening a chapter that is not on this device while the Bardic computer cannot be reached says so and offers the
   * next downloaded chapter. `chapterNumber` is the number shown, from 1; `next.index` is zero-based (DeviceChapter.index).
   */
  interface Props {
    chapterNumber: number;
    /** The next chapter held on this device (`nextDownloaded(book.chapters, index)`); null when there is none. */
    next: ChapterRef | null;
    onplaynext?: (chapterId: string) => void;
    ondismiss?: () => void;
  }
  let { chapterNumber, next, onplaynext, ondismiss }: Props = $props();

  const text = $derived(unavailableChapterText(chapterNumber, next));
</script>

<Callout tone="warn" title={text.title}>
  {text.body}
  {#snippet actions()}
    {#if next && text.playNext}<Button onclick={() => onplaynext?.(next.chapterId)}>{text.playNext}</Button>{/if}
    <Button variant="text" style="color: var(--ink)" onclick={ondismiss}>Not now</Button>
  {/snippet}
</Callout>
