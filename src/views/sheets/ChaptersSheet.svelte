<script lang="ts">
  import { onMount } from 'svelte';
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { chapterRows, chaptersToMake, hasMatter, type SheetChapter } from './chapters';
  import SwitchRow from './SwitchRow.svelte';

  /**
   * Chapters ([ChaptersSheet]): every chapter with its one audio word, the one you are in marked, tap to go.
   * Front and back matter can be hidden. "Make the rest ready" only asks: `onmakeready` opens the book's plan
   * flow, nothing is made or paid for from here.
   */
  interface Props {
    /** Shown above the title. */
    bookTitle: string;
    chapters: SheetChapter[];
    currentId: string | null;
    /** Current chapter place in Unicode code points. */
    chapterOffset?: number;
    /** Hide front and back matter (the chapter you are in always stays). */
    storyOnly?: boolean;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    onselect?: (chapterId: string) => void;
    onstoryonly?: (storyOnly: boolean) => void;
    onmakeready?: () => void;
    onclose?: () => void;
  }
  let { bookTitle, chapters, currentId, chapterOffset, storyOnly = false, placement = 'bottom', fixed = false, onselect, onstoryonly, onmakeready, onclose }: Props = $props();

  let hide = $state(false);
  $effect(() => {
    hide = storyOnly;
  });
  const rows = $derived(chapterRows(chapters, currentId, hide, chapterOffset));
  const matter = $derived(hasMatter(chapters));
  const toMake = $derived(chaptersToMake(chapters));

  let list: HTMLUListElement | undefined = $state();
  onMount(() => {
    // Long books: open with the chapter you are in on show.
    list?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  });
</script>

<Sheet title="Chapters" eyebrow={bookTitle} {placement} {fixed} scrim={fixed ? 0.3 : undefined} {onclose}>
  {#if matter}
    <div class="matter-option">
      <SwitchRow label="Show front and back matter" checked={!hide} detail={hide ? 'Hidden · your current chapter stays visible' : 'Shown'} onchange={(shown) => ((hide = !shown), onstoryonly?.(!shown))} />
    </div>
  {/if}
  <div class="scroller">
    <div class="scrolling">
    <Glass radius={16} style="overflow:hidden">
      <ul bind:this={list} class="rows" aria-label="Chapters">
        {#each rows as r (r.id)}
          <li>
            <button type="button" class="row" class:current={r.current} aria-current={r.current ? 'true' : undefined} aria-label="{r.number === '–' ? '' : `Chapter ${r.number}, `}{r.title}, {r.wordText}{r.detail ? `, ${r.detail}` : ''}{r.current ? ', you are here' : ''}{r.progressText ? `, ${r.progressText}` : ''}" onclick={() => onselect?.(r.id)}>
              <span class="num">{r.number}</span>
              <span class="text">
                <span class="title">{r.title}</span>
                {#if r.detail}<span class="detail">{r.detail}</span>{/if}
                {#if r.progressText}<span class="detail">You are here · {r.progressText}</span>{/if}
              </span>
              <span class="word"><Badge tone={r.tone}>{r.wordText}</Badge></span>
            </button>
          </li>
        {/each}
      </ul>
    </Glass>
    </div>
    <div class="fade" aria-hidden="true"></div>
  </div>
  {#if toMake > 0}
    <div class="make">
      <Button style="width:100%;min-height:48px;border-radius:24px" onclick={() => onmakeready?.()}>Make the rest ready</Button>
      <span class="note">Ready chapters play without waiting.</span>
    </div>
  {/if}
</Sheet>

<style>
  span { line-height: 1.35; }
  .matter-option :global(button) { min-height: 44px; }
  .scroller { height: 551px; max-height: max(120px, calc(100dvh - 293px)); position: relative; flex-shrink: 0; }
  .scrolling { height: 100%; overflow-y: auto; scrollbar-width: none; }
  .scrolling::-webkit-scrollbar { display: none; }
  .fade { position: absolute; left: 0; right: 0; bottom: 0; height: 40px; pointer-events: none; background: linear-gradient(to bottom, rgba(22, 18, 32, 0), rgba(22, 18, 32, 0.9)); }
  .rows { list-style: none; margin: 0; padding: 0; }
  li:not(:last-child) .row { border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 60px;
    padding: 0 14px;
    box-sizing: border-box;
    background: transparent;
    border: 0 solid transparent;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
    font-family: var(--font-ui);
  }
  .row.current { background: rgba(255, 255, 255, 0.1); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .num { font-size: 13px; font-weight: 700; color: var(--muted); width: 22px; flex-shrink: 0; }
  .current .num { color: var(--accent); }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; overflow-wrap: anywhere; padding-block: 8px; }
  .title { font-family: var(--font-book); font-size: 15px; font-weight: 400; color: var(--ink); }
  .current .title { font-weight: 600; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); }
  .word { max-width: 104px; flex-shrink: 0; display: flex; justify-content: flex-end; }
  .make { display: flex; flex-direction: column; gap: 8px; }
  .note { font-size: 13px; font-weight: 400; color: var(--muted); text-align: center; }
  @media (max-width: 300px) {
    .row { flex-wrap: wrap; gap: 4px 12px; padding-block: 8px; }
    .text { flex-basis: calc(100% - 34px); padding-block: 0; }
    .word { width: auto; margin-left: 34px; }
  }
</style>
