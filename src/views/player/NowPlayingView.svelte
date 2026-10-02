<script lang="ts">
  import { tick } from 'svelte';
  import Aura, { type Glow, PHONE_GLOWS } from '../../components/Aura.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import { applyPalette } from '../../theme/apply';
  import { tabletGlows } from '../../theme/aura';
  import type { Palette } from '../../theme/derive';
  import type { Mode, NeedsYou, ReaderAppearance } from '../../player/types';
  import type { PageWidth } from '../sheets/appearance';
  import { TABLET_GLOWS } from '../shell/TabletShell.svelte';
  import DownloadRing from '../offline/DownloadRing.svelte';
  import ControlsSheet from './ControlsSheet.svelte';
  import Glyph from './Glyph.svelte';
  import ListenPanel from './ListenPanel.svelte';
  import ModeSwitch from './ModeSwitch.svelte';
  import PButton from './PButton.svelte';
  import ReadCapsule from './ReadCapsule.svelte';
  import ReadPanel from './ReadPanel.svelte';
  import { listeningPill, liveAnnouncement, type Layout, type NowPlayingState } from './nowPlaying';
  import { readerColors } from './reading';

  interface Props {
    state: NowPlayingState;
    appearance: ReaderAppearance;
    layout: Layout;
    /** author and series for the tablet portrait Listen screen; defaults to the author */
    byline?: string;
    /** lines to mark with a dotted underline in Read mode */
    markedLineIds?: string[];
    /** the book's colours (from its cover); omit for the default coral and amber */
    palette?: Palette;
    /** replace the aura glows (the boards draw a few screens with their own) */
    glows?: Glow[];
    /** Read: true while the text follows the narration; false once the listener scrolled away ("Back to narration" shows) */
    following?: boolean;
    /** Whether Read follows automatically; explicit jumps remain available. */
    followNarration?: boolean;
    pageWidth?: PageWidth;
    /** Read on a phone or tablet portrait: the Listen controls are open over the text */
    controlsOpen?: boolean;
    /** epoch ms for the sleep timer caption */
    now?: number;
    ontoggle?: () => void;
    onskip?: (seconds: number) => void;
    onseek?: (seconds: number) => void;
    onnext?: () => void;
    onprevious?: () => void;
    ongotoline?: (lineId: string) => void;
    onsetmode?: (mode: Mode) => void;
    onopenSpeed?: () => void;
    onopenSleep?: () => void;
    onopenChapters?: () => void;
    onopenVoice?: () => void;
    onopenAppearance?: () => void;
    onopensearch?: () => void;
    onmore?: () => void;
    oncollapse?: () => void;
    /** "Choose what to do" in the Needs you state; receives the state's own action */
    onneedsyou?: (action: NeedsYou['action']) => void;
    /** A download is running in the background: the small progress ring beside the reader controls (Read, phone and tablet portrait). */
    download?: { fraction: number | null; label: string } | null;
    /** The ring opens the downloads. */
    onopendownloads?: () => void;
  }
  let {
    state, appearance, layout, byline, markedLineIds = [], palette, glows, following = $bindable(true), followNarration = true, pageWidth = 'wide', controlsOpen = $bindable(false),
    now, ontoggle, onskip, onseek, onnext, onprevious, ongotoline, onsetmode, onopenSpeed, onopenSleep, onopenChapters, onopenVoice,
    onopenAppearance, onopensearch, onmore, oncollapse, onneedsyou, download = null, onopendownloads,
  }: Props = $props();

  const PORTRAIT_GLOWS: Glow[] = [
    { x: -127, y: -113, size: 537, color: 'var(--glow)', opacity: 0.55, blur: 90 },
    { x: 417, y: 716, size: 509, color: 'var(--glow2)', opacity: 0.42, blur: 100 },
    { x: -84, y: 931, size: 396, color: 'var(--glow)', opacity: 0.22, blur: 90 },
  ];

  // svelte-ignore non_reactive_update
  let root: HTMLDivElement | undefined;
  $effect(() => {
    if (palette && root) applyPalette(root, palette);
  });

  const colors = $derived(readerColors(appearance.theme));
  const landscape = $derived(layout === 'tablet-landscape');
  const reading = $derived(state.mode === 'read' && !landscape);
  /** Read dims the aura further (the listener's setting, and the dim theme) */
  const dim = $derived(reading && (appearance.dimAura || colors.dim));
  const paper = $derived(reading ? colors.paper : null);
  const baseGlows = $derived(glows ?? (landscape ? TABLET_GLOWS : layout === 'tablet-portrait' ? PORTRAIT_GLOWS : PHONE_GLOWS));
  const safeGlows = $derived(layout === 'phone' ? baseGlows : tabletGlows(baseGlows, palette));
  const shownGlows = $derived(dim ? safeGlows.map((g) => ({ ...g, opacity: g.opacity * 0.55 })) : safeGlows);
  const pill = $derived(listeningPill(state.listening, state.detail, state.needsYou));

  // Opening Read starts following the narration again; the controls sheet only belongs to Read.
  let before: Mode | undefined;
  $effect(() => {
    const m = state.mode;
    if (before !== undefined && before !== m) {
      if (m === 'read') following = followNarration;
      else controlsOpen = false;
    }
    before = m;
  });
  $effect(() => {
    if (landscape) controlsOpen = false;
  });

  function closeControls() {
    controlsOpen = false;
    void tick().then(() => root?.querySelector<HTMLElement>('[data-show-controls]')?.focus());
  }
  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      onopensearch?.();
    }
  }
  const topPad = $derived(layout === 'tablet-portrait' && state.mode === 'listen' ? '16px 24px 0' : '8px 16px 0');
</script>

<svelte:window {onkeydown} />

<div
  class="np"
  bind:this={root}
  role="region"
  aria-label="Now playing"
  style:background={paper ?? undefined}
  style:--ink={paper ? colors.ink : undefined}
  style:--muted={paper ? colors.muted : undefined}
  style:--glass-control={paper ? colors.glass : undefined}
  style:--edge={paper ? colors.edge : undefined}
  style:--label-accent={paper ? colors.accent : undefined}
  style:--capsule={paper ? colors.capsule : undefined}
>
  {#if !paper}<Aura glows={shownGlows} />{/if}
  {#if dim && !paper}<div class="dimmer" aria-hidden="true"></div>{/if}

  <!-- the listening state, spoken politely whenever it changes -->
  <div class="sr" role="status" aria-live="polite">{liveAnnouncement(pill)}</div>

  <div class="layer">
    {#if landscape}
      <div class="landscape">
        <div class="left">
          <div class="bar one">
            <IconButton label="Minimise" icon="chevron-down" onclick={oncollapse} />
          </div>
          <ListenPanel {state} {layout} {byline} {now} {ontoggle} {onskip} {onseek} {onnext} {onprevious} {onopenSpeed} {onopenSleep} {onopenChapters} {onopenVoice} {onneedsyou} />
        </div>
        <ReadPanel {state} {appearance} {layout} {markedLineIds} {followNarration} {pageWidth} bind:following {ongotoline} {onopenAppearance} />
      </div>
    {:else}
      <div class="column">
        <div class="bar" style:padding={topPad}>
          <IconButton label="Minimise" icon="chevron-down" onclick={oncollapse} />
          <div class="mid"><ModeSwitch value={state.mode} onchange={onsetmode} /></div>
          {#if state.mode === 'read'}
            <PButton label="Text settings" onclick={onopenAppearance}><Glyph name="text-size" /></PButton>
          {:else}
            <IconButton label="More" icon="more" onclick={onmore} />
          {/if}
          {#if state.mode === 'read' && download}
            <DownloadRing fraction={download.fraction} label={download.label} onclick={onopendownloads} style="position: absolute; left: calc(50% + 89px); top: 14px" />
          {/if}
        </div>
        {#if state.mode === 'listen'}
          <ListenPanel {state} {layout} {byline} {now} {ontoggle} {onskip} {onseek} {onnext} {onprevious} {onopenSpeed} {onopenSleep} {onopenChapters} {onopenVoice} {onneedsyou} />
        {:else}
          <ReadPanel {state} {appearance} {layout} {markedLineIds} {followNarration} {pageWidth} bind:following {ongotoline} />
        {/if}
      </div>
      {#if state.mode === 'read'}
        {#if controlsOpen}
          <ControlsSheet {state} {now} onclose={closeControls} {ontoggle} {onskip} {onseek} {onnext} {onprevious} {onopenSpeed} {onopenSleep} {onopenChapters} {onopenVoice} {onneedsyou} />
        {:else}
          <ReadCapsule {state} {layout} {controlsOpen} {ontoggle} {onskip} {onopenSpeed} onshowcontrols={() => (controlsOpen = true)} />
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style>
  .np { position: relative; width: 100%; height: 100%; overflow: hidden; box-sizing: content-box; background: var(--base); color: var(--ink); font-family: var(--font-ui); }
  .dimmer { position: absolute; inset: 0; background: rgba(10, 8, 16, 0.35); }
  .layer { position: relative; height: 100%; }
  .column { display: flex; flex-direction: column; height: 100%; }
  .bar { position: relative; display: flex; align-items: center; }
  .bar.one { padding: 14px 20px 0; }
  .mid { flex: 1; display: flex; justify-content: center; }
  .landscape { display: flex; align-items: stretch; height: 100%; }
  .left { width: 480px; flex-shrink: 0; height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
  .sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  @media (max-width: 300px) {
    .np { overflow-y: auto; }
    .layer, .column { height: auto; min-height: 100%; }
    .bar { flex-wrap: wrap; gap: 8px; padding: 8px 12px 0 !important; }
    .bar > .mid { order: 3; flex-basis: 100%; }
  }
</style>
