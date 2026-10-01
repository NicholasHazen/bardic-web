<script lang="ts">
  import { household, nick, onDevice, recent } from '../../../fixtures/listeners';
  import BackdropHome from '../BackdropHome.svelte';
  import SwitchSheet from '../SwitchSheet.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={1194} h={834}>
  <BackdropHome layout="tablet" listenerName={nick.name} listenerHue={nick.hue} {onDevice} {recent} />
  <SwitchSheet listeners={household} currentId={nick.id} placement="popover" />
</Frame>
