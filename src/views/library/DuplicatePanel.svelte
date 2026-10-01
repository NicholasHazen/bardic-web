<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Cover from '../../components/Cover.svelte';
  import Glass from '../../components/Glass.svelte';
  import type { ExistingBookModel } from './types';

  interface Props {
    /** The file being added. */
    fileName: string;
    existing: ExistingBookModel;
    onopen?: () => void;
    onrestore?: () => void;
    onaddcopy?: () => void;
    oncancel?: () => void;
  }
  let { fileName, existing, onopen, onrestore, onaddcopy, oncancel }: Props = $props();
</script>

<div class="panel">
  <p class="lead">{fileName} looks the same as a book you already have.</p>
  <Glass radius={16} style="padding: 12px">
    <div class="book">
      <Cover color={existing.color} src={existing.coverSrc} width={56} height={84} radius={11} pad={7} shadowY={7} shadowBlur={14} />
      <div class="text">
        <span class="name">{existing.title}</span>
        <span class="detail">{existing.detail}{existing.removed ? ' · Removed' : ''}</span>
      </div>
    </div>
  </Glass>
  <div class="actions">
    {#if existing.removed}
      <Button size={52} style="width: 100%" onclick={onrestore}>Restore the book</Button>
    {:else}
      <Button size={52} style="width: 100%" onclick={onopen}>Open the existing book</Button>
    {/if}
    <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" onclick={onaddcopy}>Add another copy</Button>
    <Button variant="text" style="width: 100%; color: var(--ink); padding: 0 8px" onclick={oncancel}>Cancel</Button>
  </div>
  <span class="foot">{existing.removed ? 'Restoring brings back its places and audio. Nothing else changes.' : 'A second copy starts with no places or audio. Nothing is deleted.'}</span>
</div>

<style>
  .panel { display: contents; font-family: var(--font-ui); }
  .lead { margin: 0; font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; overflow-wrap: anywhere; }
  .book { display: flex; align-items: center; gap: 12px; }
  .text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .name { font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .foot { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; text-align: center; }
</style>
