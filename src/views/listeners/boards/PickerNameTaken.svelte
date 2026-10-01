<script lang="ts">
  import { household, nick, sam } from '../../../fixtures/listeners';
  import { nameFeedback } from '../../../lib/listenerText';
  import ManageScreen from '../ManageScreen.svelte';
  import NameSheet from '../NameSheet.svelte';
  import TabBar from '../TabBar.svelte';
  import Frame from './Frame.svelte';
  let name = $state('nick');
</script>

<Frame w={390} h={844}>
  <ManageScreen listeners={household} currentId={nick.id} intro={false} badge={false} />
  <TabBar active="settings" />
  <NameSheet mode="edit" eyebrow="Listeners · {sam.name}" bind:name hue={sam.hue} avatarName={sam.name} error={nameFeedback(name, household, sam.id)} unchanged={name === sam.name} />
</Frame>
