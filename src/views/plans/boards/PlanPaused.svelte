<script lang="ts">
  import * as fx from '../../../fixtures/plans';
  import { planCardModel } from '../../../lib/planRules';
  import BookPageBackdrop from '../../sheets/boards/BookPageBackdrop.svelte';
  import Frame from '../../sheets/boards/Frame.svelte';
  import PlanCardView from '../PlanCardView.svelte';

  const model = planCardModel(fx.planWaiting, { voiceName: fx.kore.name, nowMs: fx.NOW_LOCAL, chaptersReady: 13 });
</script>

<Frame w={390} h={844}>
  <BookPageBackdrop>
    <PlanCardView {model} plan={fx.planWaiting} freeVoiceName="Samantha" />
  </BookPageBackdrop>
</Frame>
