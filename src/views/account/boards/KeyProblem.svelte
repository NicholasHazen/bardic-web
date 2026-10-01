<script lang="ts">
  import { boardKeyProblem } from '../../../fixtures/account';
  import ScreenFrame from '../../voices/boards/ScreenFrame.svelte';
  import KeyProblemView from '../KeyProblemView.svelte';
</script>

<ScreenFrame>
  <KeyProblemView words={boardKeyProblem} />
</ScreenFrame>
