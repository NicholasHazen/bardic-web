<script lang="ts">
  import { freeRows, kore, premiumRows } from '../../../fixtures/voices';
  import { freeNote, premiumNote } from '../../../lib/voiceText';
  import ChooserView from '../ChooserView.svelte';
  import SheetFrame from './SheetFrame.svelte';
</script>

<SheetFrame>
  <ChooserView tab="Premium" {freeRows} {premiumRows} selectedId={kore.id} freeNote={freeNote([])} premiumNote={premiumNote('$2.10')} fromChapter={4} />
</SheetFrame>
