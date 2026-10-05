<script lang="ts">
  import type { NeedsYou } from '../../player/types';
  import NowCover from './NowCover.svelte';
  import ScrubBlock from './ScrubBlock.svelte';
  import StatePill from './StatePill.svelte';
  import ToolsRow from './ToolsRow.svelte';
  import TransportRow from './TransportRow.svelte';
  import { chapterLine, listeningPill, sleepCaption, speedLabel, upNext, type Layout, type NowPlayingState } from './nowPlaying';

  interface Props {
    state: NowPlayingState;
    layout: Layout;
    /** author and series, shown on the tablet portrait screen; defaults to the author */
    byline?: string;
    /** epoch ms for the sleep caption */
    now?: number;
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
  let {
    state, layout, byline, now = Date.now(), ontoggle, onskip, onseek, onnext, onprevious,
    onopenSpeed, onopenSleep, onopenChapters, onopenVoice, onneedsyou,
  }: Props = $props();

  const pill = $derived(listeningPill(state.listening, state.detail, state.needsYou));
  const title = $derived(state.book?.title ?? '');
  const line = $derived(chapterLine(state.chapter));
  const color = $derived(state.book?.coverColor ?? '#c65a43');
  const next = $derived(upNext(state.chapters, state.chapter?.id ?? null));
  const sleep = $derived(sleepCaption(state.sleep, now));
  const wide = $derived(layout !== 'phone');
</script>

{#snippet statePill(justify: string)}
  <div class="state" style:align-items={justify}>
    <div class="pillrow" style:justify-content={justify === 'center' ? 'center' : 'flex-start'}>
      {#if pill}
        <StatePill {pill} />
        {#if pill.detail && pill.state !== 'needs_you'}<span class="detail">{pill.detail}</span>{/if}
      {/if}
    </div>
    {#if pill && pill.state === 'needs_you'}
      {#if pill.detail}<p class="kept" style:text-align={justify === 'center' ? 'center' : 'left'} style:padding={justify === 'center' ? '0 28px' : '0'}>{pill.detail}</p>{/if}
      <button type="button" class="choose" style:align-self={justify === 'center' ? 'center' : 'flex-start'} onclick={() => onneedsyou?.(state.needsYou?.action)}>{state.needsYou?.action?.label ?? 'Choose what to do'}</button>
    {/if}
  </div>
{/snippet}

{#snippet controls(scrubPad: string, transportPad: string, toolsPad: string, playSize: number)}
  <ScrubBlock position={state.position} duration={state.duration} bookProgress={state.bookProgress} remainingSeconds={state.remainingSeconds} padding={scrubPad} {onseek} />
  <TransportRow playing={state.playing} {playSize} padding={transportPad} {ontoggle} {onskip} {onnext} {onprevious} />
  <ToolsRow
    speed={speedLabel(state.speed)}
    {sleep}
    sleepActive={state.sleep.kind !== 'off'}
    voiceName={state.voice?.name ?? 'Voice'}
    padding={toolsPad}
    {onopenSpeed} {onopenSleep} {onopenChapters} {onopenVoice}
  />
{/snippet}

<div class="lp">
  {#if layout === 'phone'}
    <div class="mid" style:gap="22px">
      <NowCover {color} src={state.book?.coverSrc} width={232} height={348} shrink pad={29} {title} titleSize={30} shadow="0 26px 50px rgba(0,0,0,.6)" />
      <div class="titles center">
        <h1 class="t" style:font-size="26px">{title}</h1>
        <span class="ch" style:font-size="17px">{line}</span>
      </div>
    </div>
    <div class="bottom" style:gap="18px" style:padding-bottom="calc(34px + env(safe-area-inset-bottom, 0px))">
      {@render statePill('center')}
      {@render controls('0 20px', '0 20px', '0 20px', 76)}
    </div>
  {:else if layout === 'tablet-landscape'}
    <div class="mid" style:gap="20px">
      <NowCover {color} src={state.book?.coverSrc} width={250} height={375} shrink pad={31} {title} titleSize={32} shadow="0 26px 50px rgba(0,0,0,.6)" />
      <div class="titles center">
        <h1 class="t" style:font-size="32px">{title}</h1>
        <span class="ch" style:font-size="19px">{line}</span>
      </div>
    </div>
    <div class="bottom" style:gap="14px" style:padding-bottom="28px">
      {@render statePill('center')}
      {@render controls('0 28px', '0 24px', '0 20px', 76)}
    </div>
  {:else}
    <div class="mid portrait">
      <div class="head">
        <NowCover {color} src={state.book?.coverSrc} width={300} height={450} pad={37} {title} titleSize={32} shadow="0 30px 60px rgba(0,0,0,.6)" />
        <div class="info">
          <span class="eyebrow">Now playing</span>
          <div class="titles">
            <h1 class="t" style:font-size="34px" style:line-height="1.05">{title}</h1>
            <span class="by">{byline ?? state.book?.author ?? ''}</span>
            <span class="ch" style:font-size="19px" style:color="var(--ink)">{line}</span>
          </div>
          {@render statePill('flex-start')}
          {#if next.length}
            <div class="upnext">
              <span class="uplabel">Up next</span>
              <ul class="list">
                {#each next as row (row.id)}
                  <li class="item">
                    <span class="num">{row.number}</span>
                    <span class="name">{row.title}</span>
                    <span class="word">{row.word}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>
    </div>
    <div class="bottom portrait-bottom">
      {@render controls('0', '0', '0', 84)}
    </div>
  {/if}
</div>

<style>
  .lp { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; scrollbar-width: none; }
  .lp::-webkit-scrollbar { display: none; }
  .mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: min-content; }
  .mid.portrait { flex-direction: row; align-items: center; justify-content: flex-start; }
  .bottom { display: flex; flex-direction: column; flex-shrink: 0; }
  .portrait-bottom { gap: 20px; width: 100%; max-width: 560px; align-self: center; padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px)); box-sizing: content-box; }
  .titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; max-width: 100%; flex-shrink: 0; overflow-wrap: anywhere; }
  .titles.center { max-width: calc(100% - 32px); }
  .titles.center { align-items: center; text-align: center; }
  .t { margin: 0; font-family: var(--font-ui); font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
  .ch { font-family: var(--font-book); color: var(--muted); }
  .by { font-family: var(--font-ui); font-size: 15px; color: var(--muted); }
  .state { display: flex; flex-direction: column; gap: 10px; }
  .pillrow { display: flex; align-items: center; gap: 8px; min-height: 24px; flex-wrap: wrap; }
  .detail { font-family: var(--font-ui); font-size: 12px; color: var(--muted); }
  .kept { margin: 0; font-family: var(--font-ui); font-size: 13px; line-height: 1.45; color: var(--muted); }
  .choose { min-height: 44px; max-width: calc(100% - 32px); box-sizing: border-box; padding: 8px 20px; border-radius: 22px; background: var(--glass-control); color: var(--ink); border: 1px solid var(--edge); font-family: var(--font-ui); font-size: 14px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; cursor: pointer; }
  .head { display: flex; align-items: flex-end; gap: 24px; padding: 12px 56px 0; min-width: 0; max-width: 100%; box-sizing: border-box; }
  .info { display: flex; flex-direction: column; gap: 14px; flex: 1; min-width: 0; justify-content: flex-end; }
  .eyebrow { font-family: var(--font-ui); font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--label-accent, var(--accent)); }
  .upnext { display: flex; flex-direction: column; gap: 8px; }
  .uplabel { font-family: var(--font-ui); font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .list { list-style: none; margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; width: 100%; background: rgba(14, 12, 22, 0.45); -webkit-backdrop-filter: blur(30px) saturate(1.7); backdrop-filter: blur(30px) saturate(1.7); border: 1px solid var(--edge); border-radius: 16px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 10px 30px rgba(0, 0, 0, 0.28); }
  .item { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .num { font-family: var(--font-ui); font-size: 13px; font-weight: 700; color: var(--muted); width: 22px; }
  .name { font-family: var(--font-book); font-size: 16px; color: var(--ink); flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .word { font-family: var(--font-ui); font-size: 12px; color: var(--muted); }
  @media (max-width: 300px) {
    .lp { flex: none; }
    .mid { flex: none; overflow: visible; padding: 20px 12px; }
    .titles { max-width: 100%; overflow-wrap: anywhere; }
    .bottom { flex-shrink: 0; }
    .pillrow { flex-wrap: wrap; }
  }
</style>
