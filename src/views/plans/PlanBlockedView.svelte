<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import OptionCard from '../../components/OptionCard.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import LimitRow from './LimitRow.svelte';
  import PlanGlyph from './PlanGlyph.svelte';
  import type { PlanBlockedModel } from './types';

  /**
   * A plan that would pass the Allowance ([PlanBlocked], PL3): says so first, offers a smaller plan, and offers
   * opening the Allowance. The Approve button is offered only when the chosen plan fits (`model.approveLabel`); for the
   * plan that does not fit there is no Approve at all. Presentational: the connected sheet is PlanFlow.
   */
  interface Props {
    model: PlanBlockedModel;
    onselect?: (id: string) => void;
    onlimit?: (text: string) => void;
    onapprove?: () => void;
    onallowance?: () => void;
    onclose?: () => void;
    onfix?: () => void;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    scrim?: number;
  }
  let { model, onselect, onlimit, onapprove, onallowance, onclose, onfix, placement = 'bottom', fixed = false, scrim }: Props = $props();
</script>

<Sheet title="Make ready" eyebrow={model.eyebrow} {onclose} {placement} {fixed} {scrim}>
  <Callout tone="warn" title={model.headline.title}>{model.headline.text}</Callout>
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
      <div class="r"><dt>Estimated cost</dt><dd class="strong" role={model.loading ? 'status' : undefined}>{model.loading ? 'Working it out…' : model.cost}</dd></div>
      {#if !model.loading}
        <LimitRow value={model.limitText} shown={model.limitShown} invalid={!!model.limitProblem} describedby={model.limitProblem ? 'blocked-limit-line' : undefined} disabled={model.busy} onchange={onlimit} />
      {/if}
      <div class="r last"><dt>Left in Allowance</dt><dd class="warn">{model.left}</dd></div>
    </dl>
  </Glass>
  {#if model.limitProblem}<p class="line" id="blocked-limit-line" role="alert">{model.limitProblem}</p>{/if}
  {#if model.error}
    <Callout tone="error" title={model.error.title}>
      {model.error.text}
      {#snippet actions()}
        {#if model.error?.actionLabel}<Button variant="glass" onclick={() => onfix?.()}>{model.error.actionLabel}</Button>{/if}
      {/snippet}
    </Callout>
  {/if}
  <div class="actions">
    {#if model.approveLabel}
      <Button size={52} style="width: 100%" disabled={model.busy} onclick={() => onapprove?.()}>{model.busy ? 'Approving…' : model.approveLabel}</Button>
    {/if}
    <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" onclick={() => onallowance?.()}><PlanGlyph name="wallet" />Open Allowance</Button>
    {#if !model.approveLabel}<Button variant="text" style="width: 100%; color: var(--ink)" onclick={() => onclose?.()}>Not now</Button>{/if}
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
  dd.warn { color: #ffd493; }
  .line { margin: 0; font-family: var(--font-ui); font-size: 12px; line-height: 1.45; color: #ffbcae; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
</style>
