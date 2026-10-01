<script lang="ts">
  import { household } from '../../../fixtures/listeners';
  import ChooserScreen from '../ChooserScreen.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={390} h={844}><ChooserScreen listeners={household} /></Frame>
