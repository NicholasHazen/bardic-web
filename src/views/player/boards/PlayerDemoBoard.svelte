<script lang="ts">
  import { onMount } from 'svelte';
  import * as fx from '../../../fixtures/player';
  import type { Mode, PlayerState } from '../../../player/types';
  import type { Layout } from '../nowPlaying';
  import NowPlayingView from '../NowPlayingView.svelte';

  // A small stand-in for the engine, to try the screen by hand (#/board/PlayerDemo): the spoken line
  // advances every 1.5 s while playing, and the controls change the state. Not one of the design boards.
  // Try other states: ?s=ready|waiting|needs, ?mode=listen|read, ?layout=landscape|portrait
  const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  const base = { ready: fx.gettingReady, waiting: fx.waiting, needs: fx.needsYou }[q.get('s') ?? ''] ?? fx.nowPlayingState;
  const layout = (({ landscape: 'tablet-landscape', portrait: 'tablet-portrait' } as const)[q.get('layout') as 'landscape' | 'portrait'] ?? 'phone') as Layout;
  const size = { phone: [390, 844], 'tablet-landscape': [1194, 834], 'tablet-portrait': [834, 1194] }[layout] as [number, number];
  let s: PlayerState = $state({
    ...base,
    mode: (q.get('mode') ?? 'read') as Mode,
    text: fx.longChapter.text,
    lines: fx.longChapter.lines,
    currentLineId: 'l1',
  });
  let following = $state(true);
  let log: string[] = $state([]);

  onMount(() => {
    const t = setInterval(() => {
      if (!s.playing) return;
      const i = s.lines.findIndex((l) => l.id === s.currentLineId);
      s.currentLineId = s.lines[(i + 1) % s.lines.length]?.id ?? null;
    }, 1500);
    return () => clearInterval(t);
  });
</script>

<div class="board" style:width="{size[0]}px" style:height="{size[1]}px">
  <NowPlayingView
    state={s}
    appearance={layout === 'phone' ? fx.appearancePhone : fx.appearancePortrait}
    {layout}
    bind:following
    ontoggle={() => (s.playing = !s.playing)}
    onsetmode={(m) => (s.mode = m)}
    ongotoline={(id) => { s.currentLineId = id; log.push(`gotoLine ${id}`); }}
    onskip={(n) => log.push(`skip ${n}`)}
    onopenSpeed={() => log.push('speed')}
  />
  <output class="log" data-testid="log">{log.join(',')}</output>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
  .log { position: absolute; left: -9999px; }
</style>
