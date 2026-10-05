<script lang="ts">
  import * as fx from '../../../fixtures/plans';
  import { moneyText } from '../../../lib/money';
  import SheetFrame from '../../voices/boards/SheetFrame.svelte';
  import { blockedModel } from '../model';
  import PlanBlockedView from '../PlanBlockedView.svelte';

  // The whole book would pass the Allowance; the first 12 chapters fit, and are chosen.
  const options = [fx.optionsWhole[0]!, { id: 'smaller', title: 'First 12 chapters', detail: `About ${moneyText(fx.estimateSmaller.cost.likely)}` }];
  const model = blockedModel({
    voiceName: fx.kore.name,
    options,
    selected: 'smaller',
    estimate: fx.estimateSmaller,
    blockedFrom: fx.estimateBlocked,
    whole: true,
    limitText: '$1.20',
    nowMs: fx.AT,
  });
</script>

<SheetFrame>
  <PlanBlockedView {model} scrim={0.6} />
</SheetFrame>
