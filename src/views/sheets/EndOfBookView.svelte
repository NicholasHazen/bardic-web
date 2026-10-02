<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Cover from '../../components/Cover.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import RoundButton from '../shell/RoundButton.svelte';

  /**
   * End of book ([EndOfBook], S9): the book is finished. Offers Mark as finished, the next book in the series the
   * listener owns (with a note when a volume is missing) and Listen again from the start. Leaving it here marks the
   * book finished after 24 hours (C6), which the closing note says.
   */
  interface Props {
    title: string;
    coverColor: string;
    coverSrc?: string;
    /** "Chapter 22 of 22 · listened over 9 days" */
    summary: string;
    /** The next book the listener owns; null when there is none. */
    next?: { title: string } | null;
    /** "Volume 3 of The Ashmark Cycle is not in your library." Only when a volume is missing. */
    missingVolume?: string | null;
    /** Already marked as finished. */
    finished?: boolean;
    onminimise?: () => void;
    onmore?: () => void;
    onfinish?: () => void;
    onnext?: () => void;
    onrestart?: () => void;
  }
  let { title, coverColor, coverSrc, summary, next = null, missingVolume = null, finished = false, onminimise, onmore, onfinish, onnext, onrestart }: Props = $props();
</script>

<div class="page">
  <div class="bar">
    <RoundButton label="Minimise" icon="chevron" onclick={onminimise} />
    <div class="grow"></div>
    <RoundButton label="More" icon="more" onclick={onmore} />
  </div>
  <div class="cover">
    <Cover color={coverColor} src={coverSrc} width={200} height={300} radius={10} pad={25} shadowY={25} shadowBlur={50} {title} titleSize={26} />
  </div>
  <div class="texts">
    <span class="eyebrow">The end</span>
    <h1>You finished {title}</h1>
    <span class="summary">{summary}</span>
  </div>
  <div class="progress" aria-hidden="true">
    <ProgressBar value={1} height={5} />
    <span class="pct">100%</span>
  </div>
  <div class="actions">
    <Button size={52} style="width:100%" disabled={finished} onclick={() => onfinish?.()}><Glyph name="check" size={18} />{finished ? 'Marked as finished' : 'Mark as finished'}</Button>
    {#if next}
      <div class="sp"></div>
      <Button variant="glass" icon="arrow-right" style="width:100%;height:48px;border-radius:24px" onclick={() => onnext?.()}>{next.title} · next you own</Button>
    {/if}
    <div class="sp"></div>
    <Button variant="text" style="width:100%;color:var(--ink)" onclick={() => onrestart?.()}>Listen again from the start</Button>
  </div>
  <!-- The design draws this as an inline span in a plain div, so the default strut sets the line height. -->
  <div class="note"><span>{#if missingVolume}{missingVolume}{' '}{/if}If you leave this book here, Bardic marks it finished tomorrow.</span></div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 18px; height: 100%; overflow: hidden; font-family: var(--font-ui); color: var(--ink); }
  .bar { display: flex; align-items: center; padding: 8px 16px; }
  .grow { flex: 1; }
  .cover { display: flex; justify-content: center; padding-top: 6px; }
  .texts { display: flex; flex-direction: column; gap: 6px; padding: 0 28px; align-items: center; }
  .eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); line-height: 1.35; letter-spacing: 0.14em; text-transform: uppercase; text-align: center; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; color: var(--ink); text-align: center; letter-spacing: -0.02em; line-height: 1.15; }
  .summary { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; text-align: center; }
  .progress { display: flex; align-items: center; gap: 10px; padding: 0 32px; }
  .pct { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; }
  .actions { display: flex; flex-direction: column; padding: 0 20px; }
  .sp { height: 10px; }
  .note { padding: 0 28px; font-family: serif; line-height: normal; }
  .note span { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  @media (max-width: 300px) {
    .page { height: auto; min-height: 100%; overflow: visible; padding-bottom: 24px; }
    .cover :global(.cover) { width: calc(100vw - 32px) !important; height: auto !important; aspect-ratio: 2 / 3; }
    .texts, .note { padding-inline: 12px; overflow-wrap: anywhere; }
    .actions :global(button) { white-space: normal; height: auto !important; min-height: 44px; padding-block: 10px; }
  }
</style>
