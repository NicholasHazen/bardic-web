<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import MatterChoice from '../../components/MatterChoice.svelte';
  import ChapterSelection from '../../components/ChapterSelection.svelte';
  import type { ChapterSelectionItem } from '../../lib/chapterSelection';
  import OptionCard from '../../components/OptionCard.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { MakeSheetModel } from './types';

  /** The confirmation for making a free audiobook ready: scope, how many chapters, time and space ([PlanFree], V3). Nothing is paid. */
  interface Props {
    model: MakeSheetModel;
    onselect?: (id: string) => void;
    onstart?: () => void;
    onclose?: () => void;
    /** Live audio selection; independent of the chapter list's visibility. */
    includeMatter?: boolean;
    onmatter?: (include: boolean) => void;
    chapters?: readonly ChapterSelectionItem[];
    selectedChapterIds?: readonly string[];
    onchapters?: (ids: string[]) => void;
    placement?: 'bottom' | 'popover';
    /** Position against the viewport (the app) instead of the nearest positioned parent (design boards). */
    fixed?: boolean;
  }
  let { model, onselect, onstart, onclose, includeMatter, onmatter, chapters, selectedChapterIds = [], onchapters, placement = 'bottom', fixed = false }: Props = $props();
  const emptySelection = $derived(model.selected === 'chosen' && !chapters?.some((chapter) => selectedChapterIds.includes(chapter.id)));
</script>

<Sheet title="Make ready" eyebrow={model.eyebrow} {onclose} {placement} {fixed}>
  <div class="options" role="radiogroup" aria-label="What to make ready">
    {#each model.options as o (o.id)}
      <OptionCard title={o.title} detail={o.detail} selected={o.id === model.selected} disabled={model.busy} onselect={() => onselect?.(o.id)} />
    {/each}
  </div>
  {#if includeMatter !== undefined}
    <MatterChoice checked={includeMatter} disabled={model.busy} onchange={onmatter} />
  {/if}
  {#if model.selected === 'chosen' && chapters}
    <ChapterSelection {chapters} {selectedChapterIds} disabled={model.busy} onchange={onchapters} />
  {/if}
  <Glass radius={16} style="overflow: hidden">
    <dl>
      <div class="r"><dt>To make</dt><dd>{model.toMake}</dd></div>
      <div class="r"><dt>Time</dt><dd>{model.time}</dd></div>
      <div class="r"><dt>Cost</dt><dd class="free">Free</dd></div>
      <div class="r"><dt>Space</dt><dd>{model.space}</dd></div>
    </dl>
  </Glass>
  {#if model.error}
    <Callout tone="error" title="Nothing was started">{model.error}</Callout>
  {:else}
    <span class="note">You can listen while it works. Stop any time; finished chapters are kept.</span>
  {/if}
  <div class="actions">
    <Button size={52} style="width: 100%" onclick={onstart} disabled={model.busy || model.nothingToMake || emptySelection}>{model.nothingToMake && !emptySelection ? 'Everything is ready' : 'Start'}</Button>
    <Button variant="text" style="width: 100%; color: var(--ink)" onclick={onclose}>Not now</Button>
  </div>
</Sheet>

<style>
  .options { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
  dl { margin: 0; }
  .r { min-height: 46px; display: flex; align-items: center; gap: 8px 12px; padding: 8px 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); flex-wrap: wrap; }
  .r:last-child { border-bottom: 0; }
  dt { font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; flex: 1; }
  dd { margin: 0; max-width: 100%; overflow-wrap: anywhere; font-family: var(--font-ui); font-size: 14px; font-weight: 500; color: var(--ink); line-height: 1.35; }
  dd.free { font-weight: 700; color: #c3f0ba; }
  .note { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
</style>
