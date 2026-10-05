<script lang="ts">
  import Badge from './Badge.svelte';
  import Cover from './Cover.svelte';
  import Glass from './Glass.svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import Scrubber from './Scrubber.svelte';

  interface Props {
    title: string;
    /** e.g. "Chapter 4 · The Ferryman’s Ledger" */
    subtitle: string;
    color?: string;
    /** Badge word: one of the four listening states. */
    state?: string;
    /** e.g. "6 min ahead" */
    ahead?: string;
    progress: number;
    elapsed: string;
    remaining: string;
    speed: string;
    playing?: boolean;
    onplaypause?: () => void;
    onseek?: (value: number) => void;
    onback?: () => void;
    onforward?: () => void;
    onprevious?: () => void;
    onnext?: () => void;
    oncollapse?: () => void;
    onslower?: () => void;
    onfaster?: () => void;
    onsleep?: () => void;
    onchapters?: () => void;
  }
  let {
    title, subtitle, color = '#c65a43', state = 'Playing', ahead, progress, elapsed, remaining, speed, playing = true,
    onplaypause, onseek, onback, onforward, onprevious, onnext, oncollapse, onslower, onfaster, onsleep, onchapters,
  }: Props = $props();
</script>

<Glass variant="sheet" style="padding: 14px 16px 16px">
  <div class="col">
    <div class="head">
      <Cover {color} width={56} height={84} radius={11} pad={7} shadowY={7} shadowBlur={14} />
      <div class="text">
        <span class="title">{title}</span>
        <span class="sub">{subtitle}</span>
        <div class="state">
          <Badge tone="here">{state}</Badge>
          {#if ahead}<span class="sub">{ahead}</span>{/if}
        </div>
      </div>
      <IconButton label="Collapse" icon="chevron-down" tone="ghost" onclick={oncollapse} />
    </div>
    <div class="scrub">
      <Scrubber slim value={progress} onchange={onseek} />
      <div class="times">
        <span class="sub grow">{elapsed}</span>
        <span class="sub">{remaining}</span>
      </div>
    </div>
    <div class="transport">
      <IconButton label="Previous chapter" icon="skip-back" size={48} onclick={onprevious} />
      <IconButton label="Back 15 seconds" icon="back-15" size={52} onclick={onback} />
      <IconButton label={playing ? 'Pause' : 'Play'} icon={playing ? 'pause' : 'play'} tone="accent" size={64} iconSize={26} onclick={onplaypause} />
      <IconButton label="Forward 15 seconds" icon="forward-15" size={52} onclick={onforward} />
      <IconButton label="Next chapter" icon="skip-forward" size={48} onclick={onnext} />
    </div>
    <div class="tools">
      <Glass radius={22} role="group" aria-label="Speed" style="height: 44px; display: flex; align-items: center; padding: 0 2px">
        <div class="stepper">
          <button type="button" class="step" aria-label="Slower" onclick={onslower}>&minus;</button>
          <span class="speed">{speed}</span>
          <button type="button" class="step" aria-label="Faster" onclick={onfaster}>+</button>
        </div>
      </Glass>
      <Glass tag="button" radius={22} type="button" onclick={onsleep} style="height: 44px; padding: 0 14px; display: flex; align-items: center; gap: 6px">
        <Icon name="moon" size={16} />
        <span class="sleep">Sleep</span>
      </Glass>
      <Glass tag="button" radius={22} type="button" aria-label="Chapters" onclick={onchapters} style="height: 44px; width: 44px; padding: 0; display: flex; align-items: center; justify-content: center">
        <Icon name="list" size={18} />
      </Glass>
    </div>
  </div>
</Glass>

<style>
  .col { display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; align-items: center; gap: 12px; }
  .text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .title { font-family: var(--font-ui); font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .sub { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .state { display: flex; align-items: center; gap: 6px; }
  .scrub { display: flex; flex-direction: column; gap: 6px; }
  .times { display: flex; align-items: center; }
  .grow { flex: 1; }
  .transport { display: flex; align-items: center; justify-content: space-between; }
  .tools { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .stepper { display: flex; align-items: center; }
  .step { display: inline-flex; align-items: center; justify-content: center; height: 44px; width: 40px; padding: 0; border: 1px solid transparent; background: transparent; color: var(--ink); font-family: var(--font-ui); font-size: 18px; font-weight: 600; cursor: pointer; }
  .speed { font-family: var(--font-ui); font-size: 14px; font-weight: 700; color: var(--ink); line-height: 1.35; min-width: 44px; text-align: center; }
  .sleep { font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; }
</style>
