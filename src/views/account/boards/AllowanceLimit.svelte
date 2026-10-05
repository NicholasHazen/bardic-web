<script lang="ts">
  import { monthlyLimit, planLimit, spentSome } from '../../../fixtures/account';
  import { limitFieldText } from '../../../lib/accountText';
  import ScreenFrame from '../../voices/boards/ScreenFrame.svelte';
  import AllowanceView from '../AllowanceView.svelte';
</script>

<ScreenFrame>
  <AllowanceView spent={spentSome} limit={monthlyLimit} on monthly={limitFieldText(monthlyLimit)} plan={limitFieldText(planLimit)} resets="Resets on the 1st." />
</ScreenFrame>
