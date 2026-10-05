<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import { moneyText } from '../../lib/money';
  import { checkRaise, type Plan, type PlanCardModel } from '../../lib/planRules';
  import PlanGlyph, { type PlanGlyphName } from './PlanGlyph.svelte';
  import type { ProblemModel } from './types';

  /**
   * A plan that is going, as the book page shows it ([PlanPaused] and the running states of [BookRunning]; PL4 to
   * PL7, PL11): the state in the listening words, chapters done, what has been spent (known total, items without a
   * price beside it) against the limit, what is kept first, and the actions that fit the state: Pause, Resume,
   * Stop here (finished chapters are kept), raise the limit, make the rest with a free voice.
   *
   * A plan waiting on a provider quota continues by itself, so it shows when instead of a Continue button.
   * Resume and "Continue, up to $X" are the listener's explicit action on an already approved plan; the new limit is
   * named on the button. Presentational: the connected card is RunningPlan.
   */
  interface Props {
    model: PlanCardModel;
    /** The plan, for the limit that "raise" starts from. */
    plan: Pick<Plan, 'limit' | 'spent'>;
    /** The free voice offered for the rest of the book, e.g. "Samantha". */
    freeVoiceName?: string | null;
    busy?: boolean;
    problem?: ProblemModel;
    /** A resume was refused for the limit: open the field for a higher one. */
    wantsRaise?: boolean;
    onpause?: () => void;
    onresume?: () => void;
    /** Continue with a higher limit (the new limit, as typed). */
    onraise?: (limitText: string) => void;
    onstop?: () => void;
    onfree?: () => void;
    onfix?: (what: 'key' | 'allowance') => void;
    ondismissproblem?: () => void;
  }
  let { model, plan, freeVoiceName = null, busy = false, problem, wantsRaise = false, onpause, onresume, onraise, onstop, onfree, onfix, ondismissproblem }: Props = $props();

  const tones: Record<PlanCardModel['tone'], { title: string; disc: string; icon: PlanGlyphName; iconColor: string }> = {
    making: { title: '#bcdcff', disc: 'color-mix(in srgb, var(--accent) 18%, transparent)', icon: 'headphones', iconColor: 'var(--accent)' },
    waiting: { title: '#ffd493', disc: 'rgba(246, 185, 92, 0.2)', icon: 'warning', iconColor: '#ffd493' },
    paused: { title: 'var(--ink)', disc: 'rgba(255, 255, 255, 0.13)', icon: 'pause', iconColor: 'var(--ink)' },
    needs: { title: '#ffbcae', disc: 'rgba(255, 120, 100, 0.22)', icon: 'warning', iconColor: '#ffbcae' },
  };
  const look = $derived(tones[model.tone]);

  // The limit offered when the listener raises it: starts from the server's suggestion and is theirs to change.
  let raiseDraft = $state<string | null>(null);
  let raiseOpen = $state(false);
  const raiseText = $derived(raiseDraft ?? (model.raise ? moneyText(model.raise.suggested) : ''));
  const showRaise = $derived(!!model.raise || raiseOpen || wantsRaise);
  const raise = $derived(checkRaise(raiseText || (model.raise ? moneyText(model.raise.suggested) : ''), plan));
  const free = $derived(freeVoiceName ? `Make the rest with ${freeVoiceName}` : 'Make the rest with a free voice');
</script>

<Glass radius={16} style="margin: var(--card-margin, 0 20px); padding: 14px">
  <div class="col" data-plan-state={model.tone}>
    <div class="row" role="status" aria-live="polite">
      <div class="disc" style:background={look.disc}><PlanGlyph name={look.icon} size={20} color={look.iconColor} /></div>
      <div class="titles">
        <span class="state" style:color={look.title}>{model.title}</span>
        <span class="detail">{model.detail}</span>
      </div>
    </div>
    <div class="track" role="progressbar" aria-label="Chapters made" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(model.progress * 100)}>
      <div class="fill" style:width="{model.progress * 100}%"></div>
    </div>
    <span class="body">{model.body}</span>

    {#if problem}
      <Callout tone="error" title={problem.title}>
        {problem.text}
        {#snippet actions()}<Button variant="glass" onclick={() => ondismissproblem?.()}>Dismiss</Button>{/snippet}
      </Callout>
    {/if}

    {#if showRaise}
      <form
        class="raise"
        onsubmit={(e) => {
          e.preventDefault();
          if (raise.ok) onraise?.(raiseText);
        }}
      >
        <label class="field">
          <span class="k">New limit for this plan</span>
          <input
            value={raiseText}
            oninput={(e) => (raiseDraft = e.currentTarget.value)}
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
            aria-invalid={!raise.ok}
            aria-describedby={raise.ok ? undefined : 'raise-problem'}
          />
        </label>
        {#if !raise.ok}<p class="bad" id="raise-problem" role="alert">{raise.text}</p>{/if}
        <Button size={52} type="submit" style="width: 100%" disabled={busy || !raise.ok}>{raise.ok ? `Continue · up to ${moneyText(raise.limit)}` : 'Continue'}</Button>
      </form>
    {/if}

    <div class="actions">
      {#if model.tone === 'waiting'}
        <div class="status" role="status">{model.continues}</div>
        <div class="gap10"></div>
        {#if model.canMakeRestFree}<Button variant="glass" style="width: 100%; min-height: 48px; border-radius: 24px" disabled={busy} onclick={() => onfree?.()}>{free}</Button>{/if}
        <div class="gap6"></div>
        <Button variant="text" style="width: 100%; color: var(--ink)" disabled={busy} onclick={() => onstop?.()}>Stop here</Button>
      {:else if model.tone === 'making'}
        <div class="pair">
          <Button variant="glass" style="flex: 1" disabled={busy || !model.canPause} onclick={() => onpause?.()}><PlanGlyph name="pause" />Pause</Button>
          <Button variant="glass" style="flex: 1" disabled={busy} aria-label="Stop making it ready" onclick={() => onstop?.()}>Stop</Button>
        </div>
      {:else}
        {#if model.canResume}
          <Button style="width: 100%; min-height: 48px; border-radius: 24px" disabled={busy} onclick={() => onresume?.()}><PlanGlyph name="play" />Resume</Button>
          <div class="gap10"></div>
        {/if}
        {#if model.fix}
          <Button style="width: 100%; min-height: 48px; border-radius: 24px" disabled={busy} onclick={() => onfix?.(model.fix!)}>
            <PlanGlyph name={model.fix === 'key' ? 'key' : 'wallet'} />{model.fix === 'key' ? 'Fix Google key' : 'Open Allowance'}
          </Button>
          <div class="gap10"></div>
        {/if}
        {#if model.canResume && !showRaise && model.tone === 'paused'}
          <Button variant="glass" style="width: 100%; min-height: 48px; border-radius: 24px" disabled={busy} onclick={() => (raiseOpen = true)}>Raise the limit</Button>
          <div class="gap10"></div>
        {/if}
        {#if model.canMakeRestFree}<Button variant="glass" style="width: 100%; min-height: 48px; border-radius: 24px" disabled={busy} onclick={() => onfree?.()}>{free}</Button>{/if}
        <div class="gap6"></div>
        <Button variant="text" style="width: 100%; color: var(--ink)" disabled={busy} onclick={() => onstop?.()}>Stop here</Button>
      {/if}
    </div>
  </div>
</Glass>

<style>
  span { line-height: 1.35; }
  .col { display: flex; flex-direction: column; gap: 14px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .disc { width: 40px; height: 40px; border-radius: 20px; display: flex; align-items: center; justify-content: center; }
  .titles { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .state { font-size: 15px; font-weight: 700; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); }
  .track { position: relative; height: 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.18); flex: 1 1 auto; min-width: 0; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--accent); }
  .body { font-size: 13px; font-weight: 400; color: var(--muted); }
  .actions { display: flex; flex-direction: column; gap: 0; }
  .actions :global(button) { padding-block: 8px; box-sizing: border-box; }
  .gap10 { height: 10px; }
  .gap6 { height: 6px; }
  .pair { display: flex; align-items: center; gap: 10px; }
  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    padding: 8px 14px;
    text-align: center;
    overflow-wrap: anywhere;
    border-radius: 24px;
    box-sizing: border-box;
    background: var(--accent);
    color: #1a1206;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 0 24px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .raise { display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 0 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14); }
  .k { flex: 1; font-size: 14px; color: var(--muted); }
  input { width: 8em; border: 0; background: transparent; padding: 0; font-family: var(--font-ui); font-size: 14px; font-weight: 700; color: var(--accent); text-align: right; outline: none; box-shadow: 0 2px 0 var(--accent); }
  input[aria-invalid='true'] { color: #ffbcae; box-shadow: 0 2px 0 #ffbcae; }
  .bad { margin: 0; font-size: 12px; line-height: 1.45; color: #ffbcae; font-family: var(--font-ui); }
</style>
