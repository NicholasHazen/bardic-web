<script lang="ts">
  import type { SleepTimer } from '../../../player/types';
  import { NOW, sleep30 } from '../../../fixtures/sheets';
  import SleepTimerSheet from '../SleepTimerSheet.svelte';
  import Frame from './Frame.svelte';
  import ReadBackdrop from './ReadBackdrop.svelte';

  let timer = $state<SleepTimer>(sleep30);
</script>

<Frame w={390} h={844} scrim={0.3}>
  <ReadBackdrop />
  <SleepTimerSheet {timer} now={NOW} onchange={(t) => (timer = t)} />
</Frame>
