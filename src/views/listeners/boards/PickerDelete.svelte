<script lang="ts">
  import { household, nick, sam } from '../../../fixtures/listeners';
  import DeleteSheet from '../DeleteSheet.svelte';
  import ManageScreen from '../ManageScreen.svelte';
  import TabBar from '../TabBar.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={390} h={844}>
  <ManageScreen listeners={household} currentId={nick.id} intro={false} badge={false} />
  <TabBar active="settings" />
  <DeleteSheet name={sam.name} otherNames={household.filter((l) => l.id !== sam.id).map((l) => l.name)} booksStarted={6} />
</Frame>
