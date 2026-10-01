<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import BookGlyph from './BookGlyph.svelte';
  import { tierText, tierTone, type AudiobookCardModel } from './types';

  /** The current audiobook: voice, tier, how much is ready and on this device, and what can be done (B2). */
  interface Props {
    model: AudiobookCardModel;
    /** Opens the voice chooser. */
    onchange?: () => void;
    onmakeready?: () => void;
    ondownload?: () => void;
    onpause?: () => void;
    onresume?: () => void;
    onstop?: () => void;
    /** Open the plan sheet for the whole book (a premium audiobook). It starts nothing: the plan sheet does, when approved. */
    onplan?: () => void;
    /** "Plan from chapter 4": open the plan sheet from the chapter the listener is in. */
    onplanfrom?: () => void;
    planFromLabel?: string;
    /** A request is in flight. */
    busy?: boolean;
    /** A line under the buttons (why an action is not available). */
    note?: string;
  }
  let { model, onchange, onmakeready, ondownload, onpause, onresume, onstop, onplan, onplanfrom, planFromLabel = 'Plan from here', busy = false, note }: Props = $props();

  const run = $derived(model.running);
  const premium = $derived(model.tier === 'premium');
  const runTone = $derived(run?.tone === 'making' ? '#bcdcff' : run?.tone === 'failed' ? '#ffbcae' : 'var(--ink)');
</script>

<Glass radius={16} style="margin: var(--card-margin, 0 20px); padding: 14px">
  <div class="card">
    <div class="who">
      <div class="disc"><BookGlyph name="headphones" size={20} color="var(--accent)" /></div>
      <div class="text">
        <div class="name">
          <span class="voice">{model.voice}</span>
          <Badge tone={tierTone(model.tier)}>{tierText(model.tier)}</Badge>
        </div>
        <span class="sub">{model.sourceLine}</span>
      </div>
      <Button variant="text" onclick={onchange} aria-label="Change voice of this audiobook">Change</Button>
    </div>

    {#if run}
      <div class="progress" role="status" aria-live="polite">
        <div class="line">
          <span class="state" style:color={runTone}>{run.label}</span>
          <span class="count">{run.countText}</span>
        </div>
        <div class="track" role="progressbar" aria-label="Chapters made" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(run.done * 100)}>
          <div class="lighter" style:width="{run.ready * 100}%"></div>
          <div class="fill" style:width="{run.done * 100}%"></div>
        </div>
        {#if run.note}<span class="sub">{run.note}</span>{/if}
      </div>
      <div class="actions">
        {#if run.canResume}
          <Button variant="glass" style="flex: 1" onclick={onresume} disabled={busy}><Glyph name="play" size={18} filled />Resume</Button>
        {:else}
          <Button variant="glass" style="flex: 1" onclick={onpause} disabled={busy || !run.canPause}><BookGlyph name="pause" />Pause</Button>
        {/if}
        <Button variant="glass" style="flex: 1" onclick={onstop} disabled={busy} aria-label="Stop making it ready">Stop</Button>
      </div>
    {:else}
      <div class="progress">
        <div class="line">
          <span class="ready">{model.readyText}</span>
          <span class="count">{model.deviceText}</span>
        </div>
        <ProgressBar value={model.ready} height={6} />
      </div>
      <div class="actions">
        {#if premium}
          <Button variant="glass" style="flex: 1" disabled={busy || !onplan} onclick={onplan} aria-describedby="plan-note"><BookGlyph name="sparkle" />Plan the whole book</Button>
        {:else}
          <Button variant="glass" style="flex: 1" onclick={onmakeready} disabled={busy || !model.canMakeReady}><BookGlyph name="sparkle" />Make ready</Button>
        {/if}
        <Button variant="glass" style="flex: 1" onclick={ondownload} disabled={!ondownload}><Glyph name="download" size={18} />Download</Button>
      </div>
      {#if premium && onplanfrom}
        <Button variant="glass" style="width: 100%" disabled={busy} onclick={onplanfrom}><BookGlyph name="sparkle" />{planFromLabel}</Button>
      {/if}
      {#if note}<span class="sub" id="plan-note">{note}</span>{/if}
    {/if}
  </div>
</Glass>

<style>
  .card { display: flex; flex-direction: column; gap: 14px; }
  .who { display: flex; align-items: center; gap: 12px; }
  .disc { width: 40px; height: 40px; border-radius: 20px; background: color-mix(in srgb, var(--accent) 18%, transparent); display: flex; align-items: center; justify-content: center; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { display: flex; align-items: center; gap: 8px; }
  .voice { font-family: var(--font-ui); font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .sub { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .progress { display: flex; flex-direction: column; gap: 6px; }
  .line { display: flex; align-items: center; gap: 8px; }
  .ready { font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .state { font-family: var(--font-ui); font-size: 13px; font-weight: 700; line-height: 1.35; }
  .count { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; flex: 1; text-align: right; }
  .track { position: relative; height: 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.18); flex: 1 1 auto; min-width: 0; }
  .lighter, .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; }
  .lighter { background: rgba(255, 255, 255, 0.28); }
  .fill { background: var(--accent); }
  .actions { display: flex; align-items: center; gap: 10px; }
</style>
