<script lang="ts">
  import { allConnected } from '../../../fixtures/voices';
  import ScreenFrame from '../../voices/boards/ScreenFrame.svelte';
  import SettingsView from '../SettingsView.svelte';
</script>

<ScreenFrame>
  <SettingsView listener={{ name: 'Nick', hue: 38 }} defaultVoice="Samantha · free" sources={allConnected} allowance="No monthly limit · $2.60 spent" downloads="1.2 GB · 3 books" />
</ScreenFrame>
