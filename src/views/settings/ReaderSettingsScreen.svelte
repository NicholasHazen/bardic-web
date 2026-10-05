<script lang="ts">
  import { readerActions, readerPreferences } from '../../state/reader';
  import ReaderAppearanceSheet from '../sheets/ReaderAppearanceSheet.svelte';
  import SettingsScreen from './SettingsScreen.svelte';
  let width = $state(window.innerWidth);
  let height = $state(window.innerHeight);
  const placement = $derived(width >= 768 && width > height ? 'popover' : 'bottom');
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />
<SettingsScreen />
<ReaderAppearanceSheet
  value={$readerPreferences.appearance}
  extras={$readerPreferences.extras}
  {placement}
  fixed
  showDimAura
  onchange={readerActions.setAppearance}
  onextras={readerActions.setExtras}
  onclose={() => (location.hash = '#/settings')}
/>
