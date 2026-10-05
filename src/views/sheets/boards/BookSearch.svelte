<script lang="ts">
  import Aura from '../../../components/Aura.svelte';
  import { searchHits } from '../../../fixtures/sheets';
  import BookSearchView from '../BookSearchView.svelte';
  import Frame from './Frame.svelte';

  let query = $state('ferryman');
</script>

<Frame w={390} h={844}>
  <Aura />
  <div class="screen"><BookSearchView bind:query results={searchHits} total={7} /></div>
</Frame>

<style>
  .screen { position: relative; height: 100%; }
</style>
