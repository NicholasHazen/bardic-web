<script lang="ts">
  import { allConnected } from '../../../fixtures/voices';
  import SourcesView from '../SourcesView.svelte';
  import ScreenFrame from './ScreenFrame.svelte';
</script>

<ScreenFrame>
  <SourcesView sources={allConnected} />
</ScreenFrame>
