<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import ChapterCard from '../../components/ChapterCard.svelte';
  import ChapterRow from '../../components/ChapterRow.svelte';
  import SwitchRow from '../sheets/SwitchRow.svelte';
  import type { ChaptersModel } from './types';

  /** The chapters of the book, each with exactly one audio word (B4), and the front and back matter filter (B6). */
  interface Props {
    model: ChaptersModel;
    /** Show every chapter, not the first few. */
    onshowall?: () => void;
    onfilter?: (storyOnly: boolean) => void;
    onrefresh?: () => void;
    refreshing?: boolean;
    refreshNotice?: string;
    busy?: boolean;
  }
  let { model, onshowall, onfilter, onrefresh, refreshing = false, refreshNotice, busy = false }: Props = $props();
  let optionsOpen = $state(false);
  const optionsId = $props.id();
</script>

<section class="section">
  <div class="head">
    <h2>Chapters</h2>
    {#if model.hasMatter || onrefresh}
      <Button variant="text" aria-expanded={optionsOpen} aria-controls={optionsId} onclick={() => (optionsOpen = !optionsOpen)}>Chapter options</Button>
    {/if}
  </div>
  {#if optionsOpen}
    <div class="options" id={optionsId}>
      {#if model.hasMatter}
        <SwitchRow label="Show front and back matter" checked={!model.storyOnly} detail={model.storyOnly ? 'Hidden · your current chapter stays visible' : 'Shown'} onchange={(shown) => onfilter?.(!shown)} />
      {/if}
      {#if onrefresh}
        <div class="refresh">
          <Button variant="glass" disabled={refreshing || busy} aria-busy={refreshing} onclick={onrefresh}>{refreshing ? 'Updating chapter details…' : 'Update chapter details'}</Button>
          <p>Check names and page counts in the saved book file. Your text, place and audio are kept.</p>
          <p class="status" role="status">{refreshNotice ?? ''}</p>
        </div>
      {/if}
    </div>
  {/if}
  <div class="card">
    {#snippet rows()}
      <div class="rows" data-chapter-rows>
        {#each model.rows as r (r.id)}
          <ChapterRow number={r.number} title={r.title} detail={r.detail} metadata={r.metadata} progressText={r.progressText} current={r.current}>
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
  .options { margin: var(--card-margin, 0 20px); padding: 16px; border: 1px solid var(--edge); border-radius: 16px; background: rgba(255, 255, 255, 0.05); display: flex; flex-direction: column; gap: 16px; }
  .options :global(button) { min-height: 44px; }
  .refresh { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .refresh :global(button) { max-width: 100%; height: auto; white-space: normal; }
  .refresh p { margin: 0; color: var(--muted); font: 12px/1.5 var(--font-ui); }
  .refresh .status { color: var(--ink); }
  h2 { margin: 0; font-family: var(--font-ui); font-size: 17px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .card { margin: var(--card-margin, 0 20px); }
  .rows > :global(.row:last-child) { border-bottom: 0; }
  .sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
