<script lang="ts">
  import { onMount } from 'svelte';
  import { player } from '../../player/player';
  import { listenerStore } from '../../state/listener';
  import { deletions, followDeletions } from '../../state/manage';
  import { showToast } from '../../state/toast';
  import { isTablet } from '../shell/viewport';
  import DeletionBanner from './DeletionBanner.svelte';
  import { remainingSeconds, undoRefusal } from './logic';

  /**
   * "Deleting <book>, Undo" wherever the screen is, while a deletion is waiting out its 60 seconds. The schedule is
   * the server's; this reads it back on load (so it survives closing the page and a server restart) and from the
   * event stream, and only draws the countdown from it. Undo cancels it on the server.
   */
  const listenerId = $derived($listenerStore.currentId);

  $effect(() => {
    const id = listenerId;
    if (id) return followDeletions(id);
  });

  let now = $state(Date.now());
  let busy = $state<Record<string, boolean>>({});
  let problem = $state<Record<string, string>>({});

  const items = $derived($deletions.items.filter((i) => i.executesAt));
  $effect(() => {
    if (!items.length) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // Past its time the deletion is about to run: read the server until it says done.
  $effect(() => {
    const id = listenerId;
    void now;
    if (!id) return;
    for (const i of items) if (remainingSeconds(i.executesAt, now, $deletions.skewMs) === 0) void deletions.refresh(id, i.bookId);
  });

  onMount(() => {
    now = Date.now();
  });

  async function undo(bookId: string, title: string) {
    const id = listenerId;
    if (!id || busy[bookId]) return;
    busy = { ...busy, [bookId]: true };
    const r = await deletions.undo(id, bookId);
    busy = { ...busy, [bookId]: false };
    if (r.ok) {
      problem = { ...problem, [bookId]: '' };
      showToast({ message: title ? `${title} is back, with your places.` : 'The book is back, with your places.' });
    } else {
      problem = { ...problem, [bookId]: undoRefusal(r.code, r.detail) };
      if (r.code === 'deletion_done' || r.code === 'deletion_not_found') showToast({ message: undoRefusal(r.code, r.detail) });
    }
  }

  const lifted = $derived($player.loaded && !!$player.book);
</script>

{#if items.length}
  <div class="host" role="region" aria-label="Pending book deletions" class:tablet={$isTablet} class:lifted>
    {#each items as i (i.bookId)}
      <DeletionBanner title={i.title} seconds={remainingSeconds(i.executesAt, now, $deletions.skewMs, i.totalSeconds)} busy={busy[i.bookId]} error={problem[i.bookId] || undefined} onundo={() => undo(i.bookId, i.title)} />
    {/each}
  </div>
{/if}

<style>
  .host { position: fixed; left: 14px; right: 14px; bottom: 96px; z-index: 45; display: flex; flex-direction: column; gap: 8px; max-width: 520px; margin: 0 auto; }
  .host.lifted { bottom: 188px; }
  .host.tablet { left: 116px; right: 20px; bottom: 20px; margin: 0; }
  .host.tablet.lifted { bottom: 120px; }
</style>
