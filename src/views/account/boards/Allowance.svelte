<script lang="ts">
  import { planLimit, spentSome } from '../../../fixtures/account';
  import { limitFieldText } from '../../../lib/accountText';
  import ScreenFrame from '../../voices/boards/ScreenFrame.svelte';
  import AllowanceView from '../AllowanceView.svelte';
</script>

<ScreenFrame>
  <AllowanceView spent={spentSome} limit={null} on={false} plan={limitFieldText(planLimit)} />
</ScreenFrame>
