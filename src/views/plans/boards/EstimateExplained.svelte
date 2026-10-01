<script lang="ts">
  import * as fx from '../../../fixtures/plans';
  import SheetFrame from '../../voices/boards/SheetFrame.svelte';
  import EstimateExplainedView from '../EstimateExplainedView.svelte';
  import { explainedModel } from '../model';

  const model = explainedModel(fx.estimateWhole);
</script>

<SheetFrame>
  <EstimateExplainedView {model} scrim={0.6} />
</SheetFrame>
