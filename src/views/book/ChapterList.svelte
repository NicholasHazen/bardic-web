<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import ChapterCard from '../../components/ChapterCard.svelte';
  import ChapterRow from '../../components/ChapterRow.svelte';
  import Chip from '../../components/Chip.svelte';
  import type { ChaptersModel } from './types';

  /** The chapters of the book, each with exactly one audio word (B4), and the front and back matter filter (B6). */
  interface Props {
    model: ChaptersModel;
    /** Show every chapter, not the first few. */
    onshowall?: () => void;
    onfilter?: (storyOnly: boolean) => void;
  }
  let { model, onshowall, onfilter }: Props = $props();
</script>

<section class="section">
  <div class="head">
    <h2>Chapters</h2>
    {#if model.hasMatter}
      <Chip selected={model.storyOnly} onclick={() => onfilter?.(!model.storyOnly)}>Hide front and back matter</Chip>
    {/if}
  </div>
  <div class="card">
    {#snippet rows()}
      <div class="rows" data-chapter-rows>
        {#each model.rows as r (r.id)}
          <ChapterRow number={r.number} title={r.title} detail={r.detail} current={r.current}>
            {#snippet trailing()}
              {#if r.progress}
                <span class="sr">{r.wordText}</span>
                <Badge tone="here">{r.progress}</Badge>
              {:else}
                <Badge tone={r.tone}>{r.wordText}</Badge>
              {/if}
            {/snippet}
          </ChapterRow>
        {/each}
      </div>
    {/snippet}
    {#if model.more}
      <ChapterCard footer={more}>{@render rows()}</ChapterCard>
    {:else}
      <ChapterCard>{@render rows()}</ChapterCard>
    {/if}
  </div>
  {#snippet more()}<Button variant="text" onclick={onshowall}>Show all {model.total} chapters</Button>{/snippet}
</section>

<style>
  .section { display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: var(--label-pad, 0 24px); flex-wrap: wrap; }
  .head :global(button) { max-width: 100%; height: auto; min-height: 44px; white-space: normal; }
  h2 { margin: 0; font-family: var(--font-ui); font-size: 17px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .card { margin: var(--card-margin, 0 20px); }
  .rows > :global(.row:last-child) { border-bottom: 0; }
  .sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
