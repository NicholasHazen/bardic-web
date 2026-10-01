<script lang="ts">
  import { amber, freeRows, premiumRows } from '../../../fixtures/voices';
  import { freeNote, premiumNote } from '../../../lib/voiceText';
  import ChooserView from '../ChooserView.svelte';
  import SheetFrame from './SheetFrame.svelte';

  const note = freeNote([
    { ...amber, source_id: 'breeze' },
    { ...amber, id: 'fx-samantha', name: 'Samantha', source_id: 'local' },
  ]);
</script>

<SheetFrame>
  <ChooserView tab="Free" {freeRows} {premiumRows} selectedId={amber.id} freeNote={note} premiumNote={premiumNote('$2.10')} />
</SheetFrame>
