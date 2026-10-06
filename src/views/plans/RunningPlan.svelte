<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import { endedText, planCardModel } from '../../lib/planRules';
  import { planStore } from '../../state/plans';
  import { generationModel, type GenerationJob } from '../../lib/generationProgress';
  import PlanCardView from './PlanCardView.svelte';

  /**
   * The plan of this audiobook on the book page (PL4 to PL7, PL11), connected: progress, spend against the limit, what
   * is kept, and Pause, Resume, Stop. A plan that ended while the page was open says what was kept and spent until
   * dismissed. Nothing here approves a plan; Resume continues one the listener already approved.
   */
  interface Props {
    audiobookId: string;
    voiceName: string;
    /** Chapters of this audiobook that are ready now (the plan’s own count only covers the plan). */
    chaptersReady?: number;
    /** A free voice to offer for the rest of the book, e.g. "Samantha". */
    freeVoiceName?: string | null;
    job?: (GenerationJob & { id: string }) | null;
    chapters?: { id: string; title: string }[];
    onfree?: () => void;
  }
  let { audiobookId, voiceName, chaptersReady, freeVoiceName = null, job, chapters = [], onfree }: Props = $props();

  const t = $derived($planStore.track);
  const plan = $derived(t.active.find((p) => p.audiobook_id === audiobookId));
  const ended = $derived(!plan && t.ended?.audiobook_id === audiobookId ? t.ended : null);

  // A waiting plan counts down ("Continues in about 40 s").
  let nowMs = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (nowMs = Date.now()), 5000);
    return () => clearInterval(id);
  });
  $effect(() => {
    void plan?.updated_at;
    nowMs = Date.now();
  });

  const model = $derived(plan ? planCardModel(plan, { voiceName, nowMs, ...(chaptersReady === undefined ? {} : { chaptersReady }) }) : null);
  const problem = $derived(plan && t.problem?.planId === plan.id ? { title: t.problem.title, text: t.problem.text } : undefined);

  function fix(what: 'key' | 'allowance') {
    location.hash = what === 'key' ? '#/settings/premium' : '#/settings/allowance';
  }
</script>

{#if plan && model}
  <PlanCardView
    {model}
    {plan}
    generation={job?.id === plan.job_id ? generationModel(job, chapters) : null}
    {freeVoiceName}
    busy={t.busy}
    {problem}
    wantsRaise={t.raisePlanId === plan.id}
    onpause={() => planStore.pause(plan.id)}
    onresume={() => planStore.resume(plan.id)}
    onraise={(text) => planStore.resume(plan.id, text)}
    onstop={() => planStore.stop(plan.id)}
    {onfree}
    onfix={fix}
    ondismissproblem={() => planStore.dismissProblem()}
  />
{:else if ended}
  {@const say = endedText(ended)}
  <div class="ended">
    <Callout title={say.title}>
      {say.text}
      {#snippet actions()}<Button variant="glass" onclick={() => planStore.dismissEnded()}>Dismiss</Button>{/snippet}
    </Callout>
  </div>
{/if}

<style>
  .ended { margin: var(--card-margin, 0 20px); }
</style>
