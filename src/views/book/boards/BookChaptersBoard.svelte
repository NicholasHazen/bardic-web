<script lang="ts">
  import { onMount } from 'svelte';
  import MiniPlayer from '../../../components/MiniPlayer.svelte';
  import * as fx from '../../../fixtures/book';
  import * as lib from '../../../fixtures/library';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import BookView from '../BookView.svelte';

  let board: HTMLDivElement;
  // The board is the page scrolled until "Other audiobooks" sits 20 px from the top.
  onMount(() => {
    const target = board.querySelector<HTMLElement>('[data-section="other"]');
    const scroller = target?.closest<HTMLElement>('.content');
    if (target && scroller) scroller.scrollTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 20;
  });
</script>

<div class="board" bind:this={board}>
  <PhoneShell active="library">
    <div class="scrolled">
      <BookView header={fx.header} primaryLabel="Continue listening" audiobook={fx.samantha} others={[fx.kore]} chapters={fx.allChapters()} ondownload={() => {}} />
    </div>
    {#snippet player()}<MiniPlayer {...lib.miniPlayer} />{/snippet}
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
  .scrolled { --page-gap: 18px; }
</style>
