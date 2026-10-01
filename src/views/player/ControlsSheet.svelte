<script lang="ts">
  import type { NeedsYou } from '../../player/types';
  import ScrubBlock from './ScrubBlock.svelte';
  import ToolsRow from './ToolsRow.svelte';
  import TransportRow from './TransportRow.svelte';
  import { formatBookRemaining, listeningPill, sleepCaption, speedLabel, type NowPlayingState } from './nowPlaying';

  interface Props {
    state: NowPlayingState;
    now?: number;
    onclose?: () => void;
    ontoggle?: () => void;
    onskip?: (seconds: number) => void;
    onseek?: (seconds: number) => void;
    onnext?: () => void;
    onprevious?: () => void;
    onopenSpeed?: () => void;
    onopenSleep?: () => void;
    onopenChapters?: () => void;
    onopenVoice?: () => void;
    onneedsyou?: (action: NeedsYou['action']) => void;
  }
  let { state, now = Date.now(), onclose, ontoggle, onskip, onseek, onnext, onprevious, onopenSpeed, onopenSleep, onopenChapters, onopenVoice, onneedsyou }: Props = $props();

  const pill = $derived(listeningPill(state.listening, state.detail, state.needsYou));
  // svelte-ignore non_reactive_update
  let sheet: HTMLDivElement | undefined;
  $effect(() => {
    sheet?.focus({ preventScroll: true });
  });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose?.();
    }
  }
</script>

<!-- "Show controls" on the Read capsule: the Listen controls over the text, on a scrim. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Playback controls" tabindex="-1" bind:this={sheet} onkeydown={key}>
  <div class="col">
    <button type="button" class="grab" aria-label="Hide controls" onclick={onclose}><span></span></button>
    <span class="eyebrow">Playback</span>
    <div class="status">
      <span class="word">{pill?.word ?? ''}</span>
      <span class="detail">{pill?.detail ?? ''}</span>
      {#if formatBookRemaining(state.remainingSeconds)}<span class="left">{formatBookRemaining(state.remainingSeconds)}</span>{/if}
    </div>
    <ScrubBlock position={state.position} duration={state.duration} bookProgress={state.bookProgress} remainingSeconds={state.remainingSeconds} padding="0" times={false} hit={14} {onseek} />
    <TransportRow playing={state.playing} playSize={72} padding="0" {ontoggle} {onskip} {onnext} {onprevious} />
    <ToolsRow
      speed={speedLabel(state.speed)}
      sleep={sleepCaption(state.sleep, now)}
      sleepActive={state.sleep.kind !== 'off'}
      voiceName={state.voice?.name ?? 'Voice'}
      padding="0"
      {onopenSpeed} {onopenSleep} {onopenChapters} {onopenVoice}
    />
    {#if pill?.state === 'needs_you'}
      <button type="button" class="choose" onclick={() => onneedsyou?.(state.needsYou?.action)}>{state.needsYou?.action?.label ?? 'Choose what to do'}</button>
    {/if}
  </div>
</div>

<style>
  .scrim { position: absolute; inset: 0; background: rgba(10, 8, 16, 0.62); }
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 560px;
    margin: 0 auto;
    box-sizing: border-box;
    padding: 12px 20px calc(32px + env(safe-area-inset-bottom, 0px));
    background: rgba(22, 18, 32, 0.82);
    -webkit-backdrop-filter: blur(40px) saturate(1.7);
    backdrop-filter: blur(40px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 20px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32), 0 -20px 60px rgba(0, 0, 0, 0.6);
    color: #f5f1ea;
    --ink: #f5f1ea;
    --muted: #d0cade;
    --glass-control: rgba(255, 255, 255, 0.09);
    --edge: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .col { display: flex; flex-direction: column; gap: 16px; }
  .grab { align-self: center; padding: 14px 40px; margin: -14px 0; background: none; border: 0; cursor: pointer; }
  .grab span { display: block; width: 36px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.35); }
  .eyebrow { font-family: var(--font-ui); font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
  .status { display: flex; align-items: center; gap: 8px; }
  .word { font-family: var(--font-ui); font-size: 12px; font-weight: 600; color: var(--ink); }
  .detail { font-family: var(--font-ui); font-size: 12px; color: var(--muted); flex: 1; }
  .left { font-family: var(--font-ui); font-size: 12px; color: var(--muted); }
  .choose { align-self: center; height: 44px; padding: 0 20px; border-radius: 22px; background: var(--glass-control); color: var(--ink); border: 1px solid var(--edge); font-family: var(--font-ui); font-size: 14px; font-weight: 600; cursor: pointer; }
</style>
