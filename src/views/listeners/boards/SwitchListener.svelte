<script lang="ts">
  import { household, nick, onDevice, recent } from '../../../fixtures/listeners';
  import BackdropHome from '../BackdropHome.svelte';
  import SwitchSheet from '../SwitchSheet.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={390} h={844}>
  <BackdropHome layout="phone" listenerName={nick.name} listenerHue={nick.hue} {onDevice} {recent} />
  <SwitchSheet listeners={household} currentId={nick.id} playing={{ bookTitle: 'The Ash Ledger' }} />
</Frame>
