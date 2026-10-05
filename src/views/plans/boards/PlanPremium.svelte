<script lang="ts">
  import * as fx from '../../../fixtures/plans';
  import SheetFrame from '../../voices/boards/SheetFrame.svelte';
  import { sheetModel } from '../model';
  import PlanSheet from '../PlanSheet.svelte';

  const model = sheetModel({ voiceName: fx.kore.name, options: fx.optionsWhole, selected: 'whole', estimate: fx.estimateWhole, limitText: '$2.60', nowMs: fx.AT });
</script>

<SheetFrame>
  <PlanSheet {model} scrim={0.6} />
</SheetFrame>
