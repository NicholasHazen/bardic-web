<script lang="ts">
  import { appearanceTablet, extrasPhone } from '../../../fixtures/sheets';
  import ReaderAppearanceSheet from '../ReaderAppearanceSheet.svelte';
  import Frame from './Frame.svelte';
  import TabletBackdrop from './TabletBackdrop.svelte';

  let value = $state(appearanceTablet);
  let extras = $state(extrasPhone);
</script>

<Frame w={1194} h={834}>
  <TabletBackdrop />
  <ReaderAppearanceSheet {value} {extras} placement="popover" onchange={(v) => (value = v)} onextras={(e) => (extras = e)} />
</Frame>
