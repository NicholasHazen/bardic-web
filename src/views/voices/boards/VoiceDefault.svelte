<script lang="ts">
  import { defaultRows, samantha } from '../../../fixtures/voices';
  import DefaultVoiceView from '../DefaultVoiceView.svelte';
  import ScreenFrame from './ScreenFrame.svelte';
</script>

<ScreenFrame>
  <DefaultVoiceView rows={defaultRows} selectedId={samantha.id} />
</ScreenFrame>
