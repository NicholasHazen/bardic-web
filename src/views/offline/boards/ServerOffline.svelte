<script lang="ts">
  import * as fx from '../../../fixtures/offline';
  import ServerOfflineView from '../ServerOfflineView.svelte';
  import { playableBooks } from '../logic';
  import OfflineFrame from './OfflineFrame.svelte';
</script>

<OfflineFrame tab="home">
  <ServerOfflineView playable={playableBooks(fx.serverOfflineState.books, fx.placeByBook)} inset={100} />
</OfflineFrame>
