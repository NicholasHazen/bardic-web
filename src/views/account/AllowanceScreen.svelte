<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import {
    BELOW_SPENDING_WORDS,
    belowSpending,
    checkLimits,
    leftText,
    LIMIT_OFF_NOTE,
    limitFieldText,
    resetsText,
  } from '../../lib/accountText';
  import { allowanceActions, allowanceStore } from '../../state/allowance';
  import ScreenHead from '../voices/ScreenHead.svelte';
  import AllowanceView from './AllowanceView.svelte';

  /**
   * The Allowance (PL8, PL9): this month's estimated spending with the unknown items counted beside it, the optional
   * monthly limit (off by default) and the default limit for one plan. Shows the "no limit" or the "with a limit" variant
   * from what is saved. Route `#/settings/allowance`; goes inside <Shell active="settings">. It only sets limits: nothing
   * paid starts from here.
   */
  interface Props {
    onback?: () => void;
  }
  let { onback = () => (location.hash = '#/settings') }: Props = $props();

  const a = $derived($allowanceStore.allowance);

  let on = $state(false);
  let monthly = $state('');
  let plan = $state('');
  let monthlyError = $state('');
  let planError = $state('');
  let status = $state('');
  let error = $state('');
  let saving = $state(false);

  // Fill the form once from what the server has; after that the fields are the listener's until they save.
  let filled = false;
  $effect(() => {
    if (filled || !a) return;
    filled = true;
    on = a.monthly_limit !== null;
    monthly = limitFieldText(a.monthly_limit);
    plan = limitFieldText(a.default_plan_limit);
  });

  onMount(() => void allowanceActions.load());

  // PL9: a limit below what is spent is allowed; say what it does as soon as it is typed.
  const checked = $derived(checkLimits({ on, monthly, plan }));
  const notice = $derived(a && checked.monthly !== null && belowSpending(checked.monthly, a.spent) ? BELOW_SPENDING_WORDS : null);

  async function save() {
    if (!a) return;
    saving = true;
    status = '';
    error = '';
    const r = await allowanceActions.save({ on, monthly, plan }, a.currency);
    saving = false;
    monthlyError = r.ok ? '' : r.monthlyError;
    planError = r.ok ? '' : r.planError;
    if (!r.ok) {
      error = r.message;
      return;
    }
    const m = r.allowance.monthly_limit;
    status = m ? 'Saved.' : `Saved. There is no monthly limit. ${LIMIT_OFF_NOTE}`;
    on = m !== null;
    monthly = limitFieldText(m);
    plan = limitFieldText(r.allowance.default_plan_limit);
  }
</script>

{#if a}
  <AllowanceView
    spent={a.spent}
    limit={a.monthly_limit}
    unit={a.currency === 'USD' ? '$' : a.currency}
    bind:on
    bind:monthly
    bind:plan
    {monthlyError}
    {planError}
    resets={resetsText(a.period_end)}
    left={a.monthly_limit ? leftText(a.spent, a.monthly_limit) : ''}
    {notice}
    {status}
    {error}
    {saving}
    {onback}
    onsave={() => void save()}
  />
{:else}
  <div class="wait">
    <ScreenHead title="Allowance" {onback} />
    {#if $allowanceStore.status === 'error'}
      <div class="pad">
        <Callout tone="error" title="Couldn’t reach your Bardic computer">
          Nothing was changed. Limits already set still apply. Try again when it is on.
          {#snippet actions()}<Button variant="glass" onclick={() => allowanceActions.load()}>Try again</Button>{/snippet}
        </Callout>
      </div>
    {:else}
      <p class="pad msg" role="status">Reading the Allowance…</p>
    {/if}
  </div>
{/if}

<style>
  .wait { display: flex; flex-direction: column; gap: 16px; }
  .pad { padding: 0 20px; }
  .msg { margin: 0; font-family: var(--font-ui); font-size: 14px; color: var(--muted); }
</style>
