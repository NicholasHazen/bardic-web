<script lang="ts">
  import { nick } from '../../../fixtures/listeners';
  import ManageScreen from '../ManageScreen.svelte';
  import NameSheet from '../NameSheet.svelte';
  import TabBar from '../TabBar.svelte';
  import Frame from './Frame.svelte';
  let name = $state(nick.name);
</script>

<Frame w={390} h={844}>
  <ManageScreen listeners={[nick]} currentId={nick.id} intro={false} badge={false} />
  <TabBar active="settings" />
  <NameSheet mode="edit" eyebrow="Listeners" bind:name hue={nick.hue} unchanged={name === nick.name} onlyOne />
</Frame>
