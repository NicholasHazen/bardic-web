<script lang="ts">
  import Aura, { PHONE_GLOWS } from '../../../components/Aura.svelte';
  import { readerLines, reader } from '../../../fixtures/sheets';

  /**
   * The Read screen behind the phone sheets. A stand-in drawn from fixtures for the design boards, not the real Now
   * Playing screen (built separately). The aura is dimmed as it is while reading.
   */
  interface Props {
    /** Index of the line being read (shaded). */
    current?: number;
  }
  let { current = 1 }: Props = $props();
  const glows = PHONE_GLOWS.map((g) => ({ ...g, opacity: g.opacity * 0.55 }));
</script>

<Aura {glows} />
<div class="read">
  <div class="text">
    <span class="eyebrow">{reader.eyebrow}</span>
    <span class="title">{reader.title}</span>
    {#each readerLines as line, i}
      <p><span class:now={i === current} class:last={i === readerLines.length - 1}>{line}</span></p>
    {/each}
  </div>
</div>

<style>
  .read { position: relative; height: 100%; font-family: var(--font-ui); color: var(--ink); }
  .text { display: flex; flex-direction: column; gap: 18px; padding: 74px 26px 0; }
  .eyebrow { font-size: 12px; font-weight: 700; color: var(--accent); line-height: 1.35; letter-spacing: 0.14em; text-transform: uppercase; }
  .title { font-size: 30px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; line-height: 1.1; }
  p { margin: 0; font-family: var(--font-book); font-size: 21px; line-height: 1.72; color: var(--ink); }
  span { border-radius: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .now { background: color-mix(in srgb, var(--accent) 18%, transparent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent); }
  .last { text-decoration: underline dotted var(--accent); text-underline-offset: 5px; }
</style>
