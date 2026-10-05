<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Glass from '../../components/Glass.svelte';
  import type { VoiceRowModel } from '../../lib/voiceText';
  import Glyph from './Glyph.svelte';

  interface Props {
    rows: VoiceRowModel[];
    /** The chosen voice: a check and a bolder name. Leave out where nothing is chosen (the Breeze list). */
    selectedId?: string | null;
    /** Rows can be chosen (a check column is kept). */
    choosable?: boolean;
    /** The voice whose example is playing or loading. */
    playingId?: string | null;
    label: string;
    style?: string;
    /** A long list scrolls inside its own panel, so what is under it stays in reach. */
    scroll?: boolean;
    onhear?: (id: string) => void;
    onpick?: (id: string) => void;
  }
  let { rows, selectedId = null, choosable = true, playingId = null, label, style = '', scroll = false, onhear, onpick }: Props = $props();
</script>

<Glass radius={16} style="overflow:hidden;{scroll ? 'overflow-y:auto;min-height:124px;flex-shrink:1;' : ''}{style}" role={choosable ? 'radiogroup' : 'group'} aria-label={label}>
    {#each rows as r (r.id)}
      {@const on = r.id === selectedId}
      <div class="row" class:dim={r.unavailable}>
        <button type="button" class="hear" aria-label="Hear {r.name}" aria-pressed={playingId === r.id} title={r.hint} onclick={() => onhear?.(r.id)}>
          <Glyph name={playingId === r.id ? 'stop' : 'play'} />
        </button>
        {#if choosable}
          <button type="button" class="pick" role="radio" aria-checked={on} disabled={r.unavailable} onclick={() => onpick?.(r.id)}>
            <span class="text">
              <span class="name" class:on>{r.name}</span>
              <span class="detail">{r.detail}</span>
            </span>
            {#if r.premium}<Badge tone="paid">Premium</Badge>{/if}
            <span class="mark">{#if on}<Glyph name="check" size={20} color="var(--accent)" />{/if}</span>
          </button>
        {:else}
          <div class="pick static">
            <span class="text">
              <span class="name">{r.name}</span>
              <span class="detail">{r.detail}</span>
            </span>
            {#if r.premium}<Badge tone="paid">Premium</Badge>{/if}
          </div>
        {/if}
      </div>
    {/each}
</Glass>

<style>
  span { line-height: 1.35; font-family: var(--font-ui); }
  .row { min-height: 62px; display: flex; align-items: center; gap: 12px; padding: 0 8px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .row:last-child { border-bottom: 0; }
  .hear {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    padding: 0;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    cursor: pointer;
    background: var(--glass-control);
    -webkit-backdrop-filter: blur(20px) saturate(1.7);
    backdrop-filter: blur(20px) saturate(1.7);
    border: 1px solid var(--edge);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25);
  }
  .hear[aria-pressed='true'] { border-color: var(--accent); color: var(--accent); }
  .pick { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; align-self: stretch; padding: 0; border: 0; background: none; text-align: left; color: var(--ink); cursor: pointer; }
  .pick.static { cursor: default; }
  .pick:disabled { cursor: default; }
  .dim .text { opacity: 0.6; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .name { font-size: 15px; font-weight: 500; color: var(--ink); }
  .name.on { font-weight: 700; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); }
  @media (min-width: 768px) {
    .detail { color: var(--ink); }
  }
  .mark { width: 22px; flex-shrink: 0; display: flex; justify-content: center; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  @media (max-width: 300px) {
    .pick { display: grid; grid-template-columns: minmax(0, 1fr) 22px; gap: 8px; padding-block: 8px; }
    .pick.static { grid-template-columns: minmax(0, 1fr); }
    .text { grid-column: 1; }
    .mark { grid-column: 2; grid-row: 1; }
    .pick > :global(.badge) { grid-column: 1; justify-self: start; }
  }
</style>
