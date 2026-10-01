<script lang="ts">
  import { KEY_CONNECTED } from '../../../lib/accountText';
  import ScreenFrame from '../../voices/boards/ScreenFrame.svelte';
  import PremiumAccountView from '../PremiumAccountView.svelte';
</script>

<ScreenFrame>
  <PremiumAccountView status="connected" callout={{ tone: 'info', ...KEY_CONNECTED }} />
</ScreenFrame>
