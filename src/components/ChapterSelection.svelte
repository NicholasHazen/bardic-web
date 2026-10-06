<script lang="ts">
  import type { ChapterSelectionItem } from '../lib/chapterSelection';
  interface Props {
    chapters: readonly ChapterSelectionItem[];
    selectedChapterIds: readonly string[];
    disabled?: boolean;
    onchange?: (ids: string[]) => void;
  }
  let { chapters, selectedChapterIds, disabled = false, onchange }: Props = $props();
  const selected = $derived(new Set(selectedChapterIds));
  const count = $derived(chapters.filter((chapter) => selected.has(chapter.id)).length);

  function toggle(id: string, checked: boolean) {
    const next = new Set(selectedChapterIds);
    if (checked) next.add(id);
    else next.delete(id);
    onchange?.([...next]);
  }
</script>

<fieldset {disabled}>
  <legend>Choose chapters</legend>
  <div class="tools">
    <span role="status">{count} of {chapters.length} chapters selected</span>
    <div class="buttons">
      <button type="button" onclick={() => onchange?.(chapters.map((chapter) => chapter.id))}>Select all</button>
      <button type="button" onclick={() => onchange?.([])}>Clear selection</button>
    </div>
  </div>
  <div class="chapters">
    {#each chapters as chapter (chapter.id)}
      <label>
        <input type="checkbox" checked={selected.has(chapter.id)} onchange={(event) => toggle(chapter.id, event.currentTarget.checked)} />
        <span class="title">{chapter.title}{#if chapter.matter}<span class="matter">Front or back matter</span>{/if}</span>
        {#if chapter.ready}<span class="ready">Ready</span>{/if}
      </label>
    {/each}
  </div>
  <p>{count === 0 ? 'Choose at least one chapter.' : 'Chapters already ready are kept.'}</p>
</fieldset>

<style>
  fieldset { min-width: 0; padding: 12px; margin: 0; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px; font-family: var(--font-ui); color: var(--ink); }
  legend { padding: 0 4px; font-size: 14px; font-weight: 600; }
  .tools { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--muted); }
  .buttons { display: flex; flex-wrap: wrap; gap: 4px; }
  button { min-height: 44px; padding: 8px; background: transparent; border: 0; color: var(--ink); font: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .chapters { max-height: 240px; overflow-y: auto; overscroll-behavior: contain; }
  label { display: flex; align-items: center; gap: 12px; padding: 8px 0; min-height: 44px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 14px; line-height: 1.35; cursor: pointer; }
  label:last-child { border-bottom: 0; }
  input { width: 20px; height: 20px; margin: 0; flex-shrink: 0; accent-color: var(--accent); }
  .title { min-width: 0; flex: 1; overflow-wrap: anywhere; }
  .matter { display: block; font-size: 12px; color: var(--muted); }
  .ready { font-size: 12px; color: #c3f0ba; flex-shrink: 0; }
  p { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
  fieldset:disabled { opacity: 0.72; }
  fieldset:disabled button, fieldset:disabled label { cursor: default; }
</style>
