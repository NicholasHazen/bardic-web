<script lang="ts">
  import { nick, onDevice, recent } from '../../../fixtures/listeners';
  import { NOW, book, conflict } from '../../../fixtures/sheets';
  import BackdropHome from '../../listeners/BackdropHome.svelte';
  import PlaceConflictSheet from '../PlaceConflictSheet.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={390} h={844} scrim={0.6}>
  <div class="dim"><BackdropHome layout="phone" listenerName={nick.name} listenerHue={nick.hue} {onDevice} {recent} /></div>
  <PlaceConflictSheet {conflict} bookTitle={book.title} now={NOW} onresolve={() => {}} />
</Frame>

<style>
  /* This board's Home aura is at 70% of the usual strength. */
  .dim { width: 100%; height: 100%; }
  .dim :global(.glow:nth-child(1)) { opacity: 0.385 !important; }
  .dim :global(.glow:nth-child(2)) { opacity: 0.294 !important; }
  .dim :global(.glow:nth-child(3)) { opacity: 0.154 !important; }
</style>
