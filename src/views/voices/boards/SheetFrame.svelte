<script lang="ts">
  import type { Snippet } from 'svelte';
  import Aura, { type Glow } from '../../../components/Aura.svelte';
  import Glyph from '../Glyph.svelte';

  /** The page a voice sheet is drawn over on the boards: Now Playing, dimmed, with its minimise button and the book's title. */
  let { children }: { children: Snippet } = $props();

  const DIM: Glow[] = [
    { x: -90, y: -80, size: 380, color: 'var(--glow)', opacity: 0.385, blur: 90 },
    { x: 195, y: 506, size: 360, color: 'var(--glow2)', opacity: 0.294, blur: 100 },
    { x: -60, y: 658, size: 280, color: 'var(--glow)', opacity: 0.154, blur: 90 },
  ];
</script>

<div class="frame">
  <Aura glows={DIM} />
  <div class="page">
    <div class="top"><button type="button" aria-label="Minimise"><Glyph name="down" /></button></div>
    <div class="title strut"><span>The Ferryman’s Ledger</span></div>
  </div>
  {@render children()}
</div>

<style>
  .frame { width: 390px; height: 844px; position: relative; overflow: hidden; background: var(--base); font-family: var(--font-ui); }
  .page { position: relative; height: 100%; }
  .top { display: flex; align-items: center; padding: 8px 16px; }
  button {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    background: var(--glass-control);
    -webkit-backdrop-filter: blur(20px) saturate(1.7);
    backdrop-filter: blur(20px) saturate(1.7);
    border: 1px solid var(--edge);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25);
  }
  .title { padding: 20px 26px; }
  .title span { font-size: 30px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; }
  /* The design draws the title as inline text in a plain block, so the line box also holds the default text strut. */
  .strut { font-family: serif; line-height: normal; }
  .strut span { font-family: var(--font-ui); }
</style>
