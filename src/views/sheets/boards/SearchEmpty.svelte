<script lang="ts">
  import Aura from '../../../components/Aura.svelte';
  import TabBar from '../../shell/TabBar.svelte';
  import SearchEmptyView from '../SearchEmptyView.svelte';
  import Frame from './Frame.svelte';

  let query = $state('dune');
</script>

<Frame w={390} h={844}>
  <Aura />
  <div class="screen"><SearchEmptyView bind:query /></div>
  <TabBar active="library" />
</Frame>

<style>
  .screen { position: relative; height: 100%; }
</style>
