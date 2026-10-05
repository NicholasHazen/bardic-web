<script lang="ts">
  import type { Glow } from '../../../components/Aura.svelte';
  import * as fx from '../../../fixtures/offline';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import UpdateAudioSheet from '../UpdateAudioSheet.svelte';
  import BookBackdrop from './BookBackdrop.svelte';

  // The board dims the aura behind the sheet.
  const DIM: Glow[] = [
    { x: -90, y: -80, size: 380, color: 'var(--glow)', opacity: 0.385, blur: 90 },
    { x: 195, y: 506, size: 360, color: 'var(--glow2)', opacity: 0.294, blur: 100 },
    { x: -60, y: 658, size: 280, color: 'var(--glow)', opacity: 0.154, blur: 90 },
  ];
</script>

<div class="board">
  <PhoneShell active="library" glows={DIM}>
    <BookBackdrop />
    {#snippet overlay()}<UpdateAudioSheet offers={fx.updateOffers} numbers={fx.updateNumbers} scrim={0.6} />{/snippet}
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>
