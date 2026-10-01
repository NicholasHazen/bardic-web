<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import type { DeviceChapter } from '../../offline/types';
  import { deviceWord } from './logic';

  /**
   * One chapter of a download with its one audio word on this device. A failed chapter offers Retry, an out of
   * date one offers Update (the listener chooses; nothing is replaced here).
   */
  interface Props {
    chapter: DeviceChapter;
    last?: boolean;
    onretry?: (chapterId: string) => void;
    onupdate?: (chapterId: string) => void;
  }
  let { chapter, last = false, onretry, onupdate }: Props = $props();

  const word = $derived(deviceWord(chapter.state));
  const detail = $derived(chapter.state === 'failed' && chapter.error ? chapter.error : null);
  const number = $derived(chapter.index + 1);
</script>

<div class="row" class:last>
  <span class="num">{number}</span>
  <div class="text">
    <span class="title">{chapter.title}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
    {#if chapter.state === 'failed' && detail}
      <Button variant="text" style="align-self: flex-start; margin-left: -8px" aria-label="Retry {chapter.title}" onclick={() => onretry?.(chapter.chapterId)}>Retry</Button>
    {/if}
  </div>
  {#if chapter.state === 'failed' && !detail}
    <Button variant="text" aria-label="Retry {chapter.title}" onclick={() => onretry?.(chapter.chapterId)}>Retry</Button>
  {:else if chapter.state === 'out_of_date'}
    <Button variant="text" aria-label="Update {chapter.title}" onclick={() => onupdate?.(chapter.chapterId)}>Update</Button>
  {/if}
  {#if word}<Badge tone={word.tone}>{word.text}</Badge>{/if}
</div>

<style>
  .row { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 0 12px 0 16px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .row.last { border-bottom: 0; }
  .num { font-family: var(--font-ui); font-size: 13px; font-weight: 700; color: var(--muted); line-height: 1.35; width: 22px; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .title { font-family: var(--font-book); font-size: 16px; font-weight: 400; color: var(--ink); line-height: 1.35; }
  .detail { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: #ffbcae; line-height: 1.35; }
</style>
