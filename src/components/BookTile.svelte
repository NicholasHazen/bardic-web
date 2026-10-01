<script lang="ts">
  import Badge from './Badge.svelte';
  import Cover from './Cover.svelte';
  import ProgressBar from './ProgressBar.svelte';

  interface Props {
    title: string;
    author?: string;
    /** Cover colour. */
    color?: string;
    /** 0 to 1; shows a progress bar when set. */
    progress?: number;
    /** A volume with no text yet: dashed tile with a Missing badge. */
    missing?: boolean;
    /** Line under a missing tile. */
    note?: string;
  }
  let { title, author, color = '#c65a43', progress, missing = false, note = 'No text yet' }: Props = $props();
</script>

<div class="tile">
  {#if missing}
    <div class="missing">
      <span class="name">{title}</span>
      <Badge>Missing</Badge>
    </div>
    <span class="author">{note}</span>
  {:else}
    <Cover {color} width={104} height={156} {title} />
    <div class="meta">
      <span class="name">{title}</span>
      {#if author}<span class="author">{author}</span>{/if}
    </div>
    {#if progress !== undefined}<ProgressBar value={progress} />{/if}
  {/if}
</div>

<style>
  .tile { display: flex; flex-direction: column; gap: 6px; width: 104px; flex-shrink: 0; font-family: var(--font-ui); }
  .meta { display: flex; flex-direction: column; gap: 1px; }
  .meta .name { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; max-width: 104px; }
  .author { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .missing { width: 104px; height: 156px; border-radius: 8px; border: 1.5px dashed rgba(255, 255, 255, 0.4); box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 8px; }
  .missing .name { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; }
</style>
