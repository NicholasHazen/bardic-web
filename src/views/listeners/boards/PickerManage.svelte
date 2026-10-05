<script lang="ts">
  import { household, nick } from '../../../fixtures/listeners';
  import ManageScreen from '../ManageScreen.svelte';
  import TabBar from '../TabBar.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={390} h={844}>
  <ManageScreen listeners={household} currentId={nick.id} />
  <TabBar active="settings" />
</Frame>
