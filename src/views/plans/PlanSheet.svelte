<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import OptionCard from '../../components/OptionCard.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import LimitRow from './LimitRow.svelte';
  import type { PlanSheetModel } from './types';

  /**
   * The plan sheet for a premium audiobook ([PlanPremium], PL1 and PL2): scope, text size, chapters to make, length,
   * the estimate as a range with the most likely value, the plan's limit (editable) and what is left of a monthly
   * limit. This is the ONLY place a paid plan is approved: the Approve button calls `onapprove`, and it is offered
   * only when `model.approveLabel` is set (a fresh estimate that fits, with a valid limit). Presentational: the
   * connected sheet is PlanFlow.
   */
  interface Props {
    model: PlanSheetModel;
    onselect?: (id: string) => void;
    onlimit?: (text: string) => void;
    /** Opens [EstimateExplained]. */
    onwhy?: () => void;
    onapprove?: () => void;
    /** Closes the sheet; nothing is started. */
    onclose?: () => void;
    /** The one thing the error offers (fix the key, open the Allowance). */
    onfix?: () => void;
    onrefresh?: () => void;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    scrim?: number;
  }
  let { model, onselect, onlimit, onwhy, onapprove, onclose, onfix, onrefresh, placement = 'bottom', fixed = false, scrim }: Props = $props();
</script>

<Sheet title="Make ready" eyebrow={model.eyebrow} {onclose} {placement} {fixed} {scrim}>
  {#if model.notice}
    <Callout title={model.notice.title}>{model.notice.text}</Callout>
  {/if}
  <div class="options" role="radiogroup" aria-label="What to make ready">
    {#each model.options as o (o.id)}
      <OptionCard title={o.title} detail={o.detail} selected={o.id === model.selected} disabled={model.busy} onselect={() => onselect?.(o.id)} />
    {/each}
  </div>
  <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
    <dl aria-busy={model.loading ? 'true' : 'false'}>
      {#if model.rows}
        <div class="r"><dt>Text to speak</dt><dd>{model.rows.characters}</dd></div>
        <div class="r"><dt>To make</dt><dd>{model.rows.toMake}</dd></div>
        <div class="r"><dt>Length</dt><dd>{model.rows.length}</dd></div>
        <div class="r"><dt>Estimated cost</dt><dd class="strong">{model.rows.cost}</dd></div>
        <div class="r"><dt>Most likely</dt><dd>{model.rows.likely}</dd></div>
      {:else}
        <div class="r"><dt>Estimated cost</dt><dd class="soft" role="status">{model.loading ? 'Working it out…' : 'Not known'}</dd></div>
      {/if}
      {#if model.rows}
        <div class="limit-definition"><dt class="sr-only">Limit for this plan</dt><dd><LimitRow value={model.limitText} shown={model.limitShown} invalid={!!model.limitProblem} describedby={model.limitProblem || model.limitNote ? 'limit-line' : undefined} disabled={model.busy} onchange={onlimit} /></dd></div>
      {/if}
      <div class="r last"><dt>Monthly limit</dt><dd>{model.monthly}</dd></div>
    </dl>
  </Glass>
  {#if model.limitProblem}
    <p class="line bad" id="limit-line" role="alert">{model.limitProblem}</p>
  {:else if model.limitNote}
    <p class="line" id="limit-line">{model.limitNote}</p>
  {/if}
  {#if model.error}
    <Callout tone="error" title={model.error.title}>
      {model.error.text}
      {#snippet actions()}
        {#if model.error?.actionLabel}<Button variant="glass" onclick={() => onfix?.()}>{model.error.actionLabel}</Button>{/if}
      {/snippet}
    </Callout>
  {:else if model.whyNot}
    <p class="line" role="status">{model.whyNot}</p>
  {/if}
  <span class="why">
    <button type="button" class="link" onclick={() => onwhy?.()}>Why a range?</button>
    Bardic counts characters exactly but prices them from Google’s published rates. Bardic stops at the limit and asks before going over. Finished chapters are always kept.
  </span>
  <div class="actions">
    {#if model.approveLabel}
      <Button size={52} style="width: 100%" disabled={model.busy} onclick={() => onapprove?.()}>{model.busy ? 'Approving…' : model.approveLabel}</Button>
    {:else if onrefresh && !model.loading && model.whyNot}
      <Button size={52} variant="glass" style="width: 100%" onclick={() => onrefresh?.()}>Estimate again</Button>
    {/if}
    <Button variant="text" style="width: 100%; color: var(--ink)" onclick={() => onclose?.()}>Not now</Button>
  </div>
</Sheet>

<style>
  .options { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
  dl { margin: 0; }
  .r { min-height: 46px; display: flex; align-items: center; gap: 12px; padding: 0 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .r.last { border-bottom: 0; }
  dt { font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; flex: 1; }
  dd { margin: 0; font-family: var(--font-ui); font-size: 14px; font-weight: 500; color: var(--ink); line-height: 1.35; }
  dd.strong { font-weight: 700; }
  dd.soft { color: var(--muted); }
  .why { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .link {
    position: relative;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  /* A 44 px target around the words, without making the line taller. */
  .link::after { content: ''; position: absolute; left: -4px; right: -4px; top: -14px; bottom: -14px; }
  .line { margin: 0; font-family: var(--font-ui); font-size: 12px; line-height: 1.45; color: var(--muted); }
  .line.bad { color: #ffbcae; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .limit-definition dd { margin: 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
