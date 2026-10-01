<script lang="ts">
  import { freeRows, premiumRowsNoKey } from '../../../fixtures/voices';
  import { freeNote, premiumNote } from '../../../lib/voiceText';
  import ChooserView from '../ChooserView.svelte';
  import SheetFrame from './SheetFrame.svelte';
</script>

<SheetFrame>
  <ChooserView tab="Premium" {freeRows} premiumRows={premiumRowsNoKey} freeNote={freeNote([])} premiumNote={premiumNote()} keyProblem="missing" />
</SheetFrame>
