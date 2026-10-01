<script lang="ts">
  import { speed as fixtureSpeed } from '../../../fixtures/sheets';
  import SpeedSheet from '../SpeedSheet.svelte';
  import Frame from './Frame.svelte';
  import ReadBackdrop from './ReadBackdrop.svelte';

  let speed = $state(fixtureSpeed);
</script>

<Frame w={390} h={844} scrim={0.3}>
  <ReadBackdrop />
  <SpeedSheet {speed} onchange={(s) => (speed = s)} />
</Frame>
