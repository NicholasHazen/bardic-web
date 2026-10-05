<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { PlaceConflictInfo } from '../../player/types';
  import Glyph from '../shell/Glyph.svelte';
  import SwitchRow from './SwitchRow.svelte';
  import { choiceLabel, placeCards, placeLine, type PlaceCardModel } from './texts';

  /**
   * Two places ([PlaceConflict], C4): the place on the other device and the place on this one, each with device,
   * chapter, progress and time. The listener chooses; the other place stays in history. `onresolve` is the
   * engine's `resolveConflict`; `alwaysNewest` says the listener also asked to stop being asked (D3) so the owner can
   * change the listener setting. Nothing is ever discarded without this choice.
   */
  interface Props {
    conflict: PlaceConflictInfo;
    bookTitle: string;
    /** Epoch ms, for "3 min ago" and "Yesterday, 9:40 pm". Leave out in the app. */
    now?: number;
    /** The chapter numbers to show when they are not the position among all chapters plus one (a book with front matter). */
    chapterNumbers?: { mine?: number | null; theirs?: number | null };
    /** A choice is being saved. */
    busy?: boolean;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    onresolve?: (choice: 'mine' | 'theirs', opts: { alwaysNewest: boolean }) => void;
    /** Closing without choosing leaves both places as they are. */
    onclose?: () => void;
  }
  let { conflict, bookTitle, now = Date.now(), chapterNumbers, busy = false, placement = 'bottom', fixed = false, onresolve, onclose }: Props = $props();

  let alwaysNewest = $state(false);
  const cards = $derived(placeCards(conflict, now, chapterNumbers));
  const primary = $derived(cards[0]);
  const secondary = $derived(cards[1]);
  const modeOf = (c: PlaceCardModel) => (c.who === 'theirs' ? conflict.theirs.mode : conflict.mine.mode);
</script>

<Sheet title="Where to continue?" eyebrow={bookTitle} {placement} {fixed} scrim={fixed ? 0.6 : undefined} {onclose}>
  <p class="lead">Your place is different on two devices. Nothing is lost; pick the one you want.</p>
  <ul class="cards" aria-label="The two places">
    {#each cards as c (c.who)}
      <li class="card" class:suggested={c.suggested} aria-label="{c.device}, {modeOf(c) === 'read' ? 'reading' : 'listening'}, {placeLine(c)}, {c.percent} percent, {c.when}">
        <div class="top">
          <span class="icon">
            {#if modeOf(c) === 'read'}<Glyph name="book" size={18} />{:else}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM20 12h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" /></svg>{/if}
          </span>
          <span class="device">{c.device}</span>
          <span class="when">{c.when}</span>
        </div>
        <span class="chapter">{placeLine(c)}</span>
        <div class="bar" aria-hidden="true">
          <ProgressBar value={c.percent / 100} height={5} />
          <span class="pct">{c.percent}%</span>
        </div>
      </li>
    {/each}
  </ul>
  <div class="choices">
    <Button size={52} icon="play" style="width:100%" disabled={busy} onclick={() => onresolve?.(primary.who, { alwaysNewest })}>{choiceLabel(primary, secondary)}</Button>
    <Button variant="glass" style="width:100%;min-height:48px;border-radius:24px" disabled={busy} onclick={() => onresolve?.(secondary.who, { alwaysNewest })}>{choiceLabel(secondary, primary)}</Button>
  </div>
  <Glass radius={16} style="padding:10px 14px;flex-shrink:0">
    <SwitchRow label="Always use the newest place" detail="Stops asking. You can change this in Settings › Listening." checked={alwaysNewest} onchange={(c) => (alwaysNewest = c)} />
  </Glass>
  <span class="kept">The other place is kept in your history.</span>
</Sheet>

<style>
  span { line-height: 1.35; }
  .lead { margin: 0; font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .card { border-radius: 16px; padding: 14px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14); display: flex; flex-direction: column; gap: 10px; }
  .card.suggested { background: rgba(255, 255, 255, 0.14); border: 1.5px solid var(--accent); }
  .top { display: flex; align-items: center; gap: 10px; }
  .icon { display: inline-flex; color: var(--muted); flex-shrink: 0; }
  .suggested .icon { color: var(--accent); }
  .device { font-size: 14px; font-weight: 700; color: var(--ink); flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .when { font-size: 12px; font-weight: 400; color: var(--muted); }
  .chapter { font-family: var(--font-book); font-size: 16px; font-weight: 500; color: var(--ink); overflow-wrap: anywhere; }
  .bar { display: flex; align-items: center; gap: 10px; }
  .pct { font-size: 12px; font-weight: 700; color: var(--muted); }
  .choices { display: flex; flex-direction: column; gap: 8px; }
  .choices :global(button) { padding-block: 8px; box-sizing: border-box; }
  .kept { font-size: 12px; font-weight: 400; color: var(--muted); text-align: center; }
</style>
