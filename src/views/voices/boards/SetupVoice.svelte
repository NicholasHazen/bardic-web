<script lang="ts">
  import { nothingSetUp } from '../../../fixtures/voices';
  import SetupVoiceView from '../SetupVoiceView.svelte';
  import SheetFrame from './SheetFrame.svelte';
</script>

<SheetFrame>
  <SetupVoiceView sources={nothingSetUp} />
</SheetFrame>
