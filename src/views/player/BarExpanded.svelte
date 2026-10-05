<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import ScrubBlock from './ScrubBlock.svelte';
  import TransportRowCompact from './TransportRowCompact.svelte';
  import Badge from '../../components/Badge.svelte';
  import { chapterLine, listeningPill, sleepCaption, speedLabel, stepSpeed, type NowPlayingState } from './nowPlaying';

  interface Props {
    state: Pick<NowPlayingState, 'book' | 'chapter' | 'listening' | 'detail' | 'needsYou' | 'playing' | 'position' | 'duration' | 'bookProgress' | 'remainingSeconds' | 'speed' | 'sleep'>;
    layout?: 'phone' | 'tablet';
    now?: number;
    oncollapse?: () => void;
    ontoggle?: () => void;
    onskip?: (seconds: number) => void;
    onseek?: (seconds: number) => void;
    onnext?: () => void;
    onprevious?: () => void;
    /** the − and + of the speed stepper pass the next speed on the guide's list */
    onsetspeed?: (speed: number) => void;
    onopenSleep?: () => void;
    onopenChapters?: () => void;
  }
  let { state, layout = 'phone', now = Date.now(), oncollapse, ontoggle, onskip, onseek, onnext, onprevious, onsetspeed, onopenSleep, onopenChapters }: Props = $props();

  const pill = $derived(listeningPill(state.listening, state.detail, state.needsYou));
  const color = $derived(state.book?.coverColor ?? '#c65a43');
  const sleepOn = $derived(state.sleep.kind !== 'off');
  // svelte-ignore non_reactive_update
  let card: HTMLDivElement | undefined;
  $effect(() => {
    card?.focus({ preventScroll: true });
  });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      oncollapse?.();
    }
  }
</script>

<!-- The mini-player opened from the bar: the same controls as Now Playing, as a floating card over the screen. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={oncollapse}></div>
<div class="place" class:tablet={layout === 'tablet'}>
  <div class="card" role="dialog" aria-modal="true" aria-label="Now playing" tabindex="-1" bind:this={card} onkeydown={key}>
    <div class="col">
      <div class="head">
        <div class="cover" style:background={color} aria-hidden="true">
          {#if state.book?.coverSrc}<img src={state.book.coverSrc} alt="" />{/if}
        </div>
        <div class="text">
          <span class="title">{state.book?.title ?? ''}</span>
          <span class="sub">{chapterLine(state.chapter)}</span>
          <div class="state">
            {#if pill}
              <Badge tone={pill.tone}>{pill.word}</Badge>
              {#if pill.detail}<span class="sub">{pill.detail}</span>{/if}
            {/if}
          </div>
        </div>
        <IconButton label="Collapse" icon="chevron-down" tone="ghost" class="plain" onclick={oncollapse} />
      </div>
      <ScrubBlock position={state.position} duration={state.duration} bookProgress={state.bookProgress} remainingSeconds={state.remainingSeconds} padding="0" compact leading={1.35} {onseek} />
      <TransportRowCompact playing={state.playing} {ontoggle} {onskip} {onnext} {onprevious} />
      <div class="tools">
        <div class="stepper" role="group" aria-label="Speed">
          <button type="button" class="step" aria-label="Slower" onclick={() => onsetspeed?.(stepSpeed(state.speed, -1))}>&minus;</button>
          <span class="speed">{speedLabel(state.speed)}</span>
          <button type="button" class="step" aria-label="Faster" onclick={() => onsetspeed?.(stepSpeed(state.speed, 1))}>+</button>
        </div>
        <button type="button" class="tool sleep" aria-label={sleepOn ? `Sleep, ${sleepCaption(state.sleep, now)}` : 'Sleep'} onclick={onopenSleep}>
          <Icon name="moon" size={16} />
          <span>{sleepOn ? sleepCaption(state.sleep, now) : 'Sleep'}</span>
        </button>
        <button type="button" class="tool chapters" aria-label="Chapters" onclick={onopenChapters}><Icon name="list" size={18} /></button>
      </div>
    </div>
  </div>
</div>

<style>
  /* the board draws the ghost button with no backdrop filter */
  :global(button.ib.plain) { -webkit-backdrop-filter: none; backdrop-filter: none; }
  .scrim { position: absolute; inset: 0; background: rgba(10, 8, 16, 0.62); }
  .place { position: absolute; left: 14px; right: 14px; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
  .place.tablet { left: 96px; right: 0; bottom: 20px; display: flex; justify-content: center; }
  .place.tablet .card { width: min(560px, calc(100% - 48px)); }
  .card {
    box-sizing: border-box;
    padding: 14px 16px 16px;
    max-height: calc(100vh - 120px - env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    background: rgba(20, 16, 28, 0.82);
    -webkit-backdrop-filter: blur(40px) saturate(1.7);
    backdrop-filter: blur(40px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 20px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 -12px 40px rgba(0, 0, 0, 0.5);
    color: var(--ink);
    outline: none;
  }
  .col { display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; align-items: center; gap: 12px; }
  .cover { position: relative; box-sizing: border-box; width: 56px; height: 84px; border-radius: 11px; padding: 7px; box-shadow: 0 7px 14px rgba(0, 0, 0, 0.5); flex-shrink: 0; border: 1px solid rgba(255, 255, 255, 0.18); display: flex; flex-direction: column; justify-content: flex-end; }
  .cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 10px; }
  .text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .title { font-family: var(--font-ui); font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .sub { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .state { display: flex; align-items: center; gap: 6px; min-height: 22px; }
  .tools { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .stepper, .tool {
    box-sizing: border-box;
    height: 44px;
    display: flex;
    align-items: center;
    color: var(--ink);
    background: var(--glass-control);
    -webkit-backdrop-filter: blur(26px) saturate(1.7);
    backdrop-filter: blur(26px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 22px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 10px 30px rgba(0, 0, 0, 0.28);
  }
  .stepper { padding: 0 2px; }
  .step { display: inline-flex; align-items: center; justify-content: center; height: 44px; width: 40px; padding: 0; border: 1px solid transparent; background: transparent; color: var(--ink); font-family: var(--font-ui); font-size: 18px; font-weight: 600; cursor: pointer; position: relative; }
  /* 40 px wide as drawn; the target is 44 */
  .step::before { content: ''; position: absolute; inset: 0 -2px; }
  .speed { font-family: var(--font-ui); font-size: 14px; font-weight: 700; color: var(--ink); line-height: 1.35; min-width: 44px; text-align: center; }
  .tool { cursor: pointer; }
  .sleep { padding: 0 14px; gap: 6px; }
  .sleep span { font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .chapters { width: 44px; padding: 0; justify-content: center; }
  @media (max-width: 360px) {
    .tools { flex-wrap: wrap; }
    .state { flex-wrap: wrap; }
  }
</style>
