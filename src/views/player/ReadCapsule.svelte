<script lang="ts">
  import IconButton from '../../components/IconButton.svelte';
  import { capsuleLabel, listeningPill, speedLabel, type Layout, type NowPlayingState } from './nowPlaying';

  interface Props {
    state: Pick<NowPlayingState, 'playing' | 'position' | 'bookProgress' | 'speed' | 'listening' | 'detail' | 'needsYou'>;
    layout: Layout;
    controlsOpen?: boolean;
    ontoggle?: () => void;
    onskip?: (seconds: number) => void;
    onopenSpeed?: () => void;
    onshowcontrols?: () => void;
  }
  let { state, layout, controlsOpen = false, ontoggle, onskip, onopenSpeed, onshowcontrols }: Props = $props();

  // One capsule that never grows: a time and a thin bar, or, when the audio is not simply playing, the state word.
  const pill = $derived(listeningPill(state.listening, state.detail, state.needsYou));
  const showWord = $derived(!!pill && pill.state !== 'playing');
  const label = $derived(showWord && pill ? pill.word : capsuleLabel(state.position, state.bookProgress));
</script>

<div class="capsule" class:centered={layout === 'tablet-portrait'} role="group" aria-label="Playback">
  <div class="inner">
    <IconButton label={state.playing ? 'Pause' : 'Play'} icon={state.playing ? 'pause' : 'play'} tone="accent" size={48} iconSize={20} onclick={ontoggle} />
    <div class="txt">
      <span class="label">{#if showWord && pill}<span class="dot" style:background={pill.dot}></span>{/if}{label}</span>
      <div class="bar"><div class="fill" style:width="{Math.min(1, Math.max(0, state.bookProgress)) * 100}%"></div></div>
    </div>
    <button type="button" class="speed" aria-label="Playback speed {speedLabel(state.speed)}" onclick={onopenSpeed}>{speedLabel(state.speed)}</button>
    <IconButton label="Back 15 seconds" icon="back-15" tone="ghost" class="plain" onclick={() => onskip?.(-15)} />
    <IconButton label="Show controls" icon="chevron-down" tone="ghost" class="plain" iconSize={20} aria-expanded={controlsOpen} data-show-controls="" onclick={onshowcontrols} />
  </div>
</div>

<style>
  :global(button.ib.plain) { -webkit-backdrop-filter: none; backdrop-filter: none; }
  .capsule {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: calc(20px + env(safe-area-inset-bottom, 0px));
    height: 68px;
    box-sizing: border-box;
    padding: 0 10px;
    display: flex;
    align-items: center;
    background: var(--capsule, rgba(20, 16, 28, 0.55));
    -webkit-backdrop-filter: blur(30px) saturate(1.7);
    backdrop-filter: blur(30px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 20px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32), 0 16px 40px rgba(0, 0, 0, 0.5);
  }
  .capsule.centered { left: 50%; right: auto; margin-left: -210px; width: 420px; }
  .inner { display: flex; align-items: center; gap: 12px; }
  .txt { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  .label { font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--ink); white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
  .bar { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.2); position: relative; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: var(--accent); }
  .speed { height: 44px; min-width: 52px; padding: 0 9px; border-radius: 22px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge); color: var(--ink); font-family: var(--font-ui); font-size: 13px; font-weight: 700; flex-shrink: 0; cursor: pointer; }
</style>
