<script lang="ts">
  import { nick } from '../../../fixtures/listeners';
  import FirstListenerScreen from '../FirstListenerScreen.svelte';
  import Frame from './Frame.svelte';
  let name = $state(nick.name);
</script>

<Frame w={390} h={844}><FirstListenerScreen bind:name hue={nick.hue} /></Frame>
