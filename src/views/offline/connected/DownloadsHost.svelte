<script lang="ts">
  import { offline } from '../../../offline/offline';
  import DownloadsScreen from '../DownloadsScreen.svelte';
  import UpdateAudioHost from './UpdateAudioHost.svelte';

  /**
   * Downloads (`#/settings/downloads`), connected (O7, O8, O6): what is held, removing a book from this device only, the
   * device rules, the offers to remove books taken out of the library and the newer-audio banner.
   */
  let busy = $state(false);
  let error = $state<string | undefined>();
  let reviewing = $state<string | null>(null);

  // Opening Downloads, and the Bardic computer coming back, compare what is held with the server.
  const online = $derived($offline.online);
  $effect(() => {
    if (online) void offline.checkUpdates();
  });

  async function remove(audiobookId: string) {
    busy = true;
    error = undefined;
    try {
      await offline.remove(audiobookId);
    } catch {
      error = 'Everything is kept. The download could not be removed; try again.';
    }
    busy = false;
  }
</script>

<!-- The sheets of this screen sit over the tab bar (they come earlier in the page than the bar, so they are raised). -->
<div class="host">
<DownloadsScreen
  offline={$offline}
  {busy}
  {error}
  fixed
  onback={() => (location.hash = '#/settings')}
  onopenbook={(id) => (location.hash = `#/book/${id}`)}
  onremove={(id) => void remove(id)}
  onwifionly={(on) => {
    for (const b of $offline.books) offline.setOptions(b.audiobookId, { wifiOnly: on });
  }}
  onsetremovedays={(d) => offline.setRemoveFinishedAfterDays(d)}
  onreviewupdates={(id) => (reviewing = id)}
/>
{#if reviewing}<UpdateAudioHost audiobookId={reviewing} fixed onclose={() => (reviewing = null)} />{/if}
</div>

<style>
  .host :global(.scrim.fixed) { z-index: 40; }
  .host :global(.sheet.fixed) { z-index: 41; }
</style>
