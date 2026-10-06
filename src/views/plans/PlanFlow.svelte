<script lang="ts">
  import { onMount } from 'svelte';
  import { planStore } from '../../state/plans';
  import type { Problem } from '../../lib/planRules';
  import EstimateExplainedView from './EstimateExplainedView.svelte';
  import { blockedModel, explainedModel, sheetModel } from './model';
  import PlanBlockedView from './PlanBlockedView.svelte';
  import PlanSheet from './PlanSheet.svelte';
  import type { ProblemModel } from './types';

  /**
   * The plan sheet, connected (PL1 to PL3, PL11): opens when the plan store is opened for an audiobook, prices the
   * scope (free), and approves only when the listener presses Approve. Shows [PlanPremium], [PlanBlocked] once a plan
   * would pass the Allowance, and [EstimateExplained] from "Why a range?". Mounted once by the book page.
   */
  interface Props {
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
  }
  let { placement = 'bottom', fixed = false }: Props = $props();

  const f = $derived($planStore.flow);

  // Time moves on while the sheet is open: an estimate that has passed its 15 minutes loses its Approve button.
  let nowMs = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (nowMs = Date.now()), 15_000);
    return () => clearInterval(t);
  });
  $effect(() => {
    void f.estimate;
    nowMs = Date.now();
  });

  const LABEL: Record<string, string | undefined> = { fix_key: 'Fix Google key', allowance: 'Open Allowance', preview_again: 'Try again' };
  const say = (p: Problem | null): ProblemModel | undefined => (p ? { title: p.title, text: p.text, ...(LABEL[p.action] ? { actionLabel: LABEL[p.action] } : {}) } : undefined);

  const options = $derived(
    f.choices.length ? f.choices.map((c) => ({ id: c.id, title: c.title, detail: c.detail })) : [{ id: 'whole', title: 'Whole book', detail: 'Reading the chapters…' }],
  );
  const input = $derived({
    voiceName: f.voiceName,
    options,
    selected: f.selected,
    includeMatter: f.matterAvailable ? f.includeMatter : undefined,
    estimate: f.estimate,
    previewing: f.phase === 'loading' || f.phase === 'previewing',
    limitText: f.limitText,
    nowMs,
    used: new Set(f.used),
    busy: f.phase === 'approving',
    notice: say(f.notice),
    error: say(f.error),
  });

  function leave(hash: string) {
    planStore.close();
    location.hash = hash;
  }
  function fix() {
    const a = f.error?.action;
    if (a === 'fix_key') leave('#/settings/premium');
    else if (a === 'allowance') leave('#/settings/allowance');
    else void planStore.refresh();
  }
</script>

{#if f.phase !== 'closed'}
  {#if f.explain && f.estimate}
    <EstimateExplainedView model={explainedModel(f.estimate)} {placement} {fixed} onclose={() => planStore.explain(false)} />
  {:else if f.blockedFrom}
    <PlanBlockedView
      model={blockedModel({ ...input, blockedFrom: f.blockedFrom, whole: f.blockedWhole })}
      {placement}
      {fixed}
      onselect={(id) => planStore.select(id)}
      onmatter={(include) => planStore.setIncludeMatter(include)}
      chapters={f.chapterChoices}
      selectedChapterIds={f.selectedChapterIds}
      onchapters={(ids) => planStore.setChapters(ids)}
      onlimit={(t) => planStore.setLimit(t)}
      onapprove={() => planStore.approve()}
      onallowance={() => leave('#/settings/allowance')}
      onclose={() => planStore.close()}
      onfix={fix}
    />
  {:else}
    <PlanSheet
      model={sheetModel(input)}
      {placement}
      {fixed}
      onselect={(id) => planStore.select(id)}
      onmatter={(include) => planStore.setIncludeMatter(include)}
      chapters={f.chapterChoices}
      selectedChapterIds={f.selectedChapterIds}
      onchapters={(ids) => planStore.setChapters(ids)}
      onlimit={(t) => planStore.setLimit(t)}
      onwhy={() => planStore.explain(true)}
      onapprove={() => planStore.approve()}
      onclose={() => planStore.close()}
      onfix={fix}
      onrefresh={f.estimate ? () => planStore.refresh() : undefined}
    />
  {/if}
{/if}
