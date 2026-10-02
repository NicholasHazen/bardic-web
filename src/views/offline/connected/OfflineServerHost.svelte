<script lang="ts">
  import { browserStorage } from '../../../lib/clock';
  import { offline } from '../../../offline/offline';
  import { listenerStore } from '../../../state/listener';
  import { serverName } from '../../../state/serverName';
  import { startListening } from '../../nowplaying/start';
  import ServerOfflineView from '../ServerOfflineView.svelte';
  import { awayPlayable, readLocalPlace } from './mapping';

  /**
   * "Can't reach Bardic" (O4): shown in place of any screen that needs the Bardic computer and has no local data. Lists what
   * plays from this device; Try again checks (sends nothing, changes nothing) and the app refreshes by itself when it is back.
   */
  let checking = $state(false);
  const listenerId = $derived($listenerStore.currentId);
  const places = $derived.by(() => {
    const out: Record<string, ReturnType<typeof readLocalPlace>> = {};
    if (listenerId) for (const b of $offline.books) out[b.bookId] = readLocalPlace(browserStorage(), listenerId, b.bookId);
    return out;
  });
  const playable = $derived(awayPlayable($offline, places));

  async function retry() {
    checking = true;
    await offline.refresh();
    checking = false;
  }
</script>

<ServerOfflineView {playable} {checking} serverName={$serverName} inset={100} onplay={(id) => void startListening(id)} onretry={() => void retry()} />
