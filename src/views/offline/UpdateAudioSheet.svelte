<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import Icon from '../../components/Icon.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { UpdateOffer } from '../../offline/types';
  import { factLines, lengthText, offersRange, sumBytes, updateEyebrow, updateLabel, updateReason } from './logic';
  import OfflineGlyph from './OfflineGlyph.svelte';

  /**
   * Newer audio ([UpdateAudio], O6, D6): what changed (voice name and revision, length, size), a way to hear old and
   * new, and the choices "Update N chapters", "Keep what I have" or a choice per chapter. Nothing is replaced without
   * the listener's choice, and kept copies keep playing. The callbacks map to OfflineCommands: `onupdate` to
   * applyUpdate(audiobookId, chapterIds), `onkeep` to keepOld(audiobookId, chapterIds). Playing old or new is wired
   * by the player: `onplayold` and `onplaynew` receive the chapter; `playing` shows which one sounds.
   */
  interface Props {
    /** The offers for one audiobook (UpdateOffer.audiobookId is the same for all). */
    offers: UpdateOffer[];
    /** Chapter number (from 1) by chapterId, for "chapters 1 to 3". UpdateOffer carries only the title. */
    numbers?: Record<string, number>;
    /** Which side sounds now. */
    playing?: { chapterId: string; which: 'old' | 'new' } | null;
    /** Applying the update is running. */
    busy?: boolean;
    /** Why it failed; begins with what is kept. */
    error?: string;
    onplayold?: (chapterId: string) => void;
    onplaynew?: (chapterId: string) => void;
    onstopplaying?: () => void;
    onupdate?: (audiobookId: string, chapterIds: string[]) => void;
    onkeep?: (audiobookId: string, chapterIds: string[]) => void;
    onclose?: () => void;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    scrim?: number;
  }
  let { offers, numbers = {}, playing = null, busy = false, error, onplayold, onplaynew, onstopplaying, onupdate, onkeep, onclose, placement = 'bottom', fixed = false, scrim }: Props = $props();

  let choosing = $state(false);
  /** Chapters left out by the listener while choosing; all are chosen at first. */
  let leftOut = $state<string[]>([]);

  const chosen = $derived(offers.filter((o) => !leftOut.includes(o.chapterId)));
  const audiobookId = $derived(offers[0]?.audiobookId ?? '');
  const voiceName = $derived(offers[0]?.newer.voiceName ?? '');
  const range = $derived(offersRange(offers, numbers));
  const oldSide = $derived(factLines(chosen.map((o) => o.held)));
  const newSide = $derived(factLines(chosen.map((o) => o.newer)));
  const newBytes = $derived(sumBytes(chosen.map((o) => ({ bytes: o.newer.bytes }))));
  /** The chapter the Hear buttons play: the first one chosen. */
  const focus = $derived(chosen[0] ?? offers[0]);

  function toggle(id: string) {
    leftOut = leftOut.includes(id) ? leftOut.filter((x) => x !== id) : [...leftOut, id];
  }
  const isPlaying = (which: 'old' | 'new') => playing?.which === which && playing.chapterId === focus?.chapterId;
  function hear(which: 'old' | 'new') {
    if (!focus) return;
    if (isPlaying(which)) onstopplaying?.();
    else if (which === 'old') onplayold?.(focus.chapterId);
    else onplaynew?.(focus.chapterId);
  }
</script>

<Sheet title="Newer audio is available" eyebrow={updateEyebrow(voiceName, range)} {onclose} {placement} {fixed} {scrim}>
  <span class="why">{updateReason(offers, range)}</span>
  <Glass radius={16} style="overflow: hidden; display: flex; flex-shrink: 0">
    <div class="side" role="group" aria-label="On this device">
      <div class="col">
        <span class="cap">On this device</span>
        <span class="old">{oldSide.voice}</span>
        <span class="old">{oldSide.revision}</span>
        <span class="old">{oldSide.length}</span>
        <span class="old">{oldSide.size}</span>
      </div>
    </div>
    <div class="rule"></div>
    <div class="side" role="group" aria-label="Newer on your computer">
      <div class="col">
        <span class="cap new">Newer on your computer</span>
        <span class="newv">{newSide.voice}</span>
        <span class="newv">{newSide.revision}</span>
        <span class="newv">{newSide.length}</span>
        <span class="newv">{newSide.size}</span>
      </div>
    </div>
  </Glass>
  {#if choosing}
    <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
      <div class="list" role="group" aria-label="Chapters to update">
        {#each offers as o (o.chapterId)}
          {@const on = !leftOut.includes(o.chapterId)}
          <button type="button" class="pick" role="checkbox" aria-checked={on} onclick={() => toggle(o.chapterId)}>
            <span class="box" class:on>{#if on}<OfflineGlyph name="check" size={14} color="#1a1206" />{/if}</span>
            <span class="ctitle">{numbers[o.chapterId] !== undefined ? `${numbers[o.chapterId]} · ` : ''}{o.chapterTitle}</span>
            <span class="csub">{lengthText(o.held.seconds) ?? 'unknown'} to {lengthText(o.newer.seconds) ?? 'unknown'}</span>
          </button>
        {/each}
      </div>
    </Glass>
  {/if}
  <div class="hear">
    <Button variant="glass" style="flex: 1" aria-pressed={isPlaying('old')} aria-label={isPlaying('old') ? 'Stop the old audio' : `Hear old audio of ${focus?.chapterTitle ?? 'the chapter'}`} onclick={() => hear('old')}>
      <Icon name={isPlaying('old') ? 'pause' : 'play'} size={18} />{isPlaying('old') ? 'Stop' : 'Hear old'}
    </Button>
    <Button variant="glass" style="flex: 1" aria-pressed={isPlaying('new')} aria-label={isPlaying('new') ? 'Stop the new audio' : `Hear new audio of ${focus?.chapterTitle ?? 'the chapter'}`} onclick={() => hear('new')}>
      <Icon name={isPlaying('new') ? 'pause' : 'play'} size={18} />{isPlaying('new') ? 'Stop' : 'Hear new'}
    </Button>
  </div>
  {#if error}
    <Callout tone="error" title="Couldn’t update">{error}</Callout>
  {/if}
  <div class="actions">
    <Button size={52} style="width: 100%" disabled={busy || chosen.length === 0} aria-busy={busy} onclick={() => onupdate?.(audiobookId, chosen.map((o) => o.chapterId))}>
      <OfflineGlyph name="download" size={18} />{updateLabel(chosen.length, newBytes)}
    </Button>
    <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" disabled={busy} onclick={() => onkeep?.(audiobookId, offers.map((o) => o.chapterId))}>Keep what I have</Button>
  </div>
  {#if offers.length > 1}
    <button type="button" class="foot" aria-expanded={choosing} onclick={() => (choosing = !choosing)}>Places and finished marks never change. Choose per chapter in the list.</button>
  {:else}
    <span class="foot">Places and finished marks never change. Your copy keeps playing until you update.</span>
  {/if}
</Sheet>

<style>
  .why { font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .side { display: flex; align-items: center; gap: 14px; padding: 14px; min-width: 0; overflow-wrap: anywhere; }
  .col { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  .rule { width: 1px; background: rgba(255, 255, 255, 0.12); }
  .cap { font-family: var(--font-ui); font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; }
  .cap.new { color: var(--accent); }
  .old { font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .newv { font-family: var(--font-ui); font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .hear { display: flex; align-items: center; gap: 10px; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .foot { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; text-align: center; }
  button.foot { position: relative; background: none; border: 0; padding: 0; cursor: pointer; }
  /* The line is 16 px tall; this keeps the touch target at 44. */
  button.foot::after { content: ''; position: absolute; inset: -14px 0; }
  button.foot:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
  .list { max-height: 220px; overflow-y: auto; }
  .pick { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 0 14px; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: none; text-align: left; cursor: pointer; font-family: var(--font-ui); color: var(--ink); }
  .pick:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .box { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box; }
  .box.on { background: var(--accent); border-color: var(--accent); }
  .ctitle { font-family: var(--font-book); font-size: 15px; flex: 1; min-width: 0; line-height: 1.35; overflow-wrap: anywhere; }
  .csub { font-size: 12px; color: var(--muted); }
</style>
