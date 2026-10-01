<script lang="ts">
  import { household, nick } from '../../../fixtures/listeners';
  import { nameFeedback } from '../../../lib/listenerText';
  import ManageScreen from '../ManageScreen.svelte';
  import NameSheet from '../NameSheet.svelte';
  import TabBar from '../TabBar.svelte';
  import Frame from './Frame.svelte';
  let name = $state('S');
</script>

<Frame w={390} h={844}>
  <ManageScreen listeners={household} currentId={nick.id} intro={false} badge={false} />
  <TabBar active="settings" />
  <NameSheet mode="add" eyebrow="Listeners" bind:name hue={200} error={nameFeedback(name, household)} />
</Frame>
