<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { SleepTimer } from '../../player/types';
  import RadioRow from './RadioRow.svelte';
  import { SLEEP_OPTIONS, choiceOf, timeLeftTitle, timerFor } from './sleep';
  import { tabStop } from './radioNav';

  /**
   * Sleep timer ([SleepTimer]): off, 15, 30, 45 or 60 minutes, or the end of the chapter, with the time left.
   * Controlled by `timer`; a choice calls `onchange` with the new `SleepTimer` (its `endsAt` is `now` plus the minutes).
   */
  interface Props {
    timer: SleepTimer;
    /** Epoch ms for "time left" and for `endsAt`. Leave out in the app: the sheet reads the clock and keeps the time left fresh. */
    now?: number;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    onchange?: (timer: SleepTimer) => void;
    onclose?: () => void;
  }
  let { timer, now, placement = 'bottom', fixed = false, onchange, onclose }: Props = $props();

  let clock = $state(Date.now());
  $effect(() => {
    if (now !== undefined) return;
    clock = Date.now();
    const id = setInterval(() => (clock = Date.now()), 10_000);
    return () => clearInterval(id);
  });
  const at = $derived(now ?? clock);

  const chosen = $derived(SLEEP_OPTIONS.findIndex((o) => o.id === choiceOf(timer)));
  const left = $derived(timeLeftTitle(timer, at));
</script>

<Sheet title="Sleep timer" eyebrow="Listen" {placement} {fixed} {onclose}>
  <span class="sub">Counts listening time, not the clock.</span>
  <div class="opts" role="radiogroup" aria-label="Sleep timer">
    {#each SLEEP_OPTIONS as o, i (o.id)}
      <RadioRow
        label={o.label}
        selected={i === chosen}
        tabindex={tabStop(i, chosen)}
        onselect={() => onchange?.(timerFor(o.id, now ?? Date.now()))}
        onarrow={(n) => onchange?.(timerFor(SLEEP_OPTIONS[n]!.id, now ?? Date.now()))}
      />
    {/each}
  </div>
  <div role="status" aria-live="polite">
    {#if left}
      <Callout title={left}>It pauses the same way Pause does, so making audio ahead stops too.</Callout>
    {/if}
  </div>
  <Button size={52} style="width:100%" onclick={() => onclose?.()}>Done</Button>
</Sheet>

<style>
  /* Sits under the sheet's title as part of the same heading block. */
  .sub { margin-top: -12px; font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .opts { display: flex; flex-direction: column; gap: 8px; }
</style>
