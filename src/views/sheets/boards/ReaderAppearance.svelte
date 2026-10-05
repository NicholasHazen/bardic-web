<script lang="ts">
  import { appearancePhone, extrasPhone } from '../../../fixtures/sheets';
  import ReaderAppearanceSheet from '../ReaderAppearanceSheet.svelte';
  import Frame from './Frame.svelte';
  import ReadBackdrop from './ReadBackdrop.svelte';

  let value = $state(appearancePhone);
  let extras = $state(extrasPhone);
</script>

<Frame w={390} h={844} scrim={0.3}>
  <ReadBackdrop />
  <ReaderAppearanceSheet {value} {extras} onchange={(v) => (value = v)} onextras={(e) => (extras = e)} />
</Frame>
