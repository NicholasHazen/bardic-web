<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Field from '../../components/Field.svelte';
  import Glass from '../../components/Glass.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import ScreenHead from '../voices/ScreenHead.svelte';
  import { PLAN_LIMIT_NOTE, spendNote, spentHeadline, spentOfLimit, usedPercent, type Words } from '../../lib/accountText';
  import type { Money, Spend } from '../../lib/money';

  /**
   * The Allowance ([Allowance], [AllowanceLimit], PL8, PL9): this month's estimated spending (the known total, with the
   * count of items that could not be priced beside it, never as zero), an optional monthly limit (off by default) and the
   * default limit for one plan. The card is the "with a limit" variant when a monthly limit is saved.
   */
  interface Props {
    spent: Spend;
    /** The saved monthly limit; null means none. */
    limit: Money | null;
    /** The currency symbol or code in the field labels: "$". */
    unit?: string;
    /** The switch and the two amounts as typed. */
    on?: boolean;
    monthly?: string;
    plan?: string;
    monthlyError?: string;
    planError?: string;
    /** "Resets on the 1st." */
    resets?: string;
    /** "$17.40 left this month." Shown under the bar when given. */
    left?: string;
    /** The PL9 note: a limit below spending is allowed, and what it does. */
    notice?: Words | null;
    /** After a save: what happened. */
    status?: string;
    /** A refusal: nothing was saved. */
    error?: string;
    saving?: boolean;
    onback?: () => void;
    onsave?: () => void;
  }
  let {
    spent,
    limit,
    unit = '$',
    on = $bindable(false),
    monthly = $bindable(''),
    plan = $bindable(''),
    monthlyError = '',
    planError = '',
    resets = '',
    left = '',
    notice = null,
    status = '',
    error = '',
    saving = false,
    onback,
    onsave,
  }: Props = $props();

  const intro = $derived(
    limit
      ? 'A monthly limit shared by everyone using this Bardic. Each plan stops at its own limit, and never above what is left here.'
      : 'Nothing paid starts without a plan with its own limit. A monthly limit adds a ceiling for everyone using this Bardic.',
  );
</script>

<div class="col">
  <ScreenHead title="Allowance" {onback} />
  <p class="intro">{intro}</p>

  <Glass radius={16} style="margin:0 20px;padding:14px">
    {#if limit}
      <div class="card">
        <div class="line">
          <span class="k">This month</span>
          <span class="v">{spentOfLimit(spent, limit)}</span>
        </div>
        <ProgressBar value={usedPercent(spent, limit) / 100} height={8} />
        <span class="small">{resets ? `${resets} ` : ''}{spendNote(spent)}</span>
        {#if left}<span class="small">{left}</span>{/if}
      </div>
    {:else}
      <div class="card tight">
        <div class="line">
          <span class="k">This month</span>
          <span class="v">{spentHeadline(spent)}</span>
        </div>
        <span class="small">{spendNote(spent)}</span>
      </div>
    {/if}
  </Glass>

  <Glass radius={16} style="margin:0 20px;overflow:hidden">
    <button type="button" class="row" class:ruled={on} role="switch" aria-checked={on} onclick={() => (on = !on)}>
      <span class="texts">
        <span class="t">Set a monthly limit</span>
        <span class="d">{on ? 'On: plans stop before passing it' : 'Off: only each plan’s own limit applies'}</span>
      </span>
      <span class="track" class:on><span class="knob"></span></span>
    </button>
    {#if on}
      <div class="fieldrow">
        <div class="grow">
          <Field label="Monthly limit ({unit})" id="allowance-monthly" bind:value={monthly} inputmode="decimal" autocomplete="off" aria-invalid={monthlyError ? 'true' : undefined} aria-describedby={monthlyError ? 'allowance-monthly-err' : undefined} />
          {#if monthlyError}<span id="allowance-monthly-err" class="err">{monthlyError}</span>{/if}
        </div>
      </div>
    {/if}
  </Glass>

  <div class="pad">
    <Field label="Default limit for one plan ({unit})" id="allowance-plan" bind:value={plan} inputmode="decimal" autocomplete="off" aria-invalid={planError ? 'true' : undefined} aria-describedby={planError ? 'allowance-plan-err' : undefined} />
    {#if planError}<span id="allowance-plan-err" class="err">{planError}</span>{/if}
  </div>

  {#if notice}
    <div class="pad"><Callout tone="warn" title={notice.title}>{notice.body}</Callout></div>
  {/if}

  <div class="pad">
    <Callout tone="info" title={PLAN_LIMIT_NOTE}>Anyone can start a plan, and every plan asks first with its own limit. Spending is not split between listeners.</Callout>
  </div>

  {#if error}<p class="pad msg err" role="alert">{error}</p>{/if}
  {#if status}<p class="pad msg" role="status">{status}</p>{/if}

  <div class="pad">
    <Button size={52} style="width:100%" disabled={saving} onclick={() => onsave?.()}>{saving ? 'Saving…' : 'Save'}</Button>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 16px; }
  .pad { padding: 0 20px; }
  .intro { margin: 0; padding: 0 24px; font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .card { display: flex; flex-direction: column; gap: 10px; }
  .card.tight { gap: 6px; }
  .line { display: flex; align-items: center; gap: 8px; }
  .k { flex: 1; font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .v { font-family: var(--font-ui); font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .small { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .row { width: 100%; min-height: 66px; display: flex; align-items: center; gap: 12px; padding: 0 14px; box-sizing: border-box; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; font: inherit; }
  .row.ruled { border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 16px; }
  .texts { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .t { font-family: var(--font-ui); font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .d { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .track { width: 50px; height: 30px; border-radius: 15px; background: rgba(255, 255, 255, 0.2); position: relative; flex-shrink: 0; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3); }
  .track.on { background: var(--accent); }
  .knob { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4); }
  .track.on .knob { left: 23px; }
  .fieldrow { min-height: 92px; display: flex; align-items: center; gap: 12px; padding: 8px 14px 14px; box-sizing: border-box; }
  .grow { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .err { font-family: var(--font-ui); font-size: 12px; line-height: 1.35; color: #ffbcae; }
  .pad > .err { display: block; margin-top: 6px; }
  .msg { margin: 0; font-family: var(--font-ui); font-size: 13px; line-height: 1.35; color: var(--ink); }
  .msg.err { color: #ffbcae; }
</style>
