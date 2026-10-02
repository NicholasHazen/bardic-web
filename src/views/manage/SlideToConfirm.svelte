<script lang="ts">
  import { begin, cancel, fractionOf, initial, key, move, release, valueText, type SlideState } from './slide';
  import ManageGlyph from './ManageGlyph.svelte';

  /**
   * Slide to confirm: a handle dragged to the end, for the one action that cannot be taken back. It is a real
   * slider for assistive technology and the keyboard: Enter, Space or the right arrow move it a quarter at a time,
   * four presses confirm, the left arrow steps back. Escape closes the sheet around it and never confirms.
   */
  interface Props {
    label: string;
    disabled?: boolean;
    /** Called once, when the handle reaches the end (or the fourth key press). */
    onconfirm?: () => void;
  }
  let { label, disabled = false, onconfirm }: Props = $props();

  let s = $state<SlideState>(initial());
  let track: HTMLDivElement;
  let inner = $state(0);
  let handle: HTMLDivElement;
  let grab = 0;
  const HANDLE = 48;

  function set(next: SlideState) {
    const was = s.status;
    s = next;
    if (was !== 'confirmed' && next.status === 'confirmed') onconfirm?.();
  }

  function down(e: PointerEvent) {
    if (disabled || s.status === 'confirmed') return;
    grab = e.clientX - handle.getBoundingClientRect().left;
    handle.setPointerCapture(e.pointerId);
    set(begin(s));
  }
  function moved(e: PointerEvent) {
    if (s.status !== 'dragging') return;
    const t = track.getBoundingClientRect();
    // the track has a 1 px border: its inside is where the handle travels
    set(move(s, fractionOf(e.clientX, t.left + 1, t.width - 2, HANDLE, grab)));
  }
  function up() {
    set(release(s));
  }
  function lost() {
    if (s.status === 'dragging') set(cancel(s));
  }
  function keydown(e: KeyboardEvent) {
    if (disabled) return;
    if (['Enter', ' ', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home'].includes(e.key)) {
      e.preventDefault();
      set(key(s, e.key));
    }
  }

  const travel = $derived(Math.max(0, inner - HANDLE - 8));
</script>

<div class="track" bind:this={track} bind:clientWidth={inner} class:confirmed={s.status === 'confirmed'} class:dragging={s.status === 'dragging'} style:--fade={1 - Math.min(1, s.value * 1.6)}>
  <div
    bind:this={handle}
    class="handle"
    role="slider"
    tabindex={disabled ? -1 : 0}
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(s.value * 100)}
    aria-valuetext={valueText(s)}
    aria-orientation="horizontal"
    aria-disabled={disabled}
    aria-describedby="slide-help"
    style:transform="translateX({s.value * travel}px)"
    onpointerdown={down}
    onpointermove={moved}
    onpointerup={up}
    onpointercancel={lost}
    onlostpointercapture={lost}
    onkeydown={keydown}
  >
    <ManageGlyph name="trash" size={20} color="#3a1410" />
  </div>
  <span class="label">{label}</span>
  <span id="slide-help" class="sr">Drag the handle to the end. Or press Enter, Space or the right arrow four times. The left arrow steps back.</span>
</div>

<style>
  .track { height: 56px; border-radius: 28px; background: rgba(255, 120, 100, 0.14); border: 1px solid rgba(255, 120, 100, 0.5); position: relative; display: flex; align-items: center; justify-content: center; flex-shrink: 0; user-select: none; -webkit-user-select: none; }
  .handle { position: absolute; left: 4px; top: 4px; width: 48px; height: 48px; border-radius: 24px; background: #ffbcae; display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none; transition: transform 0.18s ease; z-index: 1; }
  .dragging .handle { transition: none; cursor: grabbing; }
  .handle:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  .label { font-family: var(--font-ui); font-size: 14px; font-weight: 600; color: #ffbcae; line-height: 1.35; opacity: var(--fade); pointer-events: none; }
  .confirmed .handle { cursor: default; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) {
    .handle { transition: none; }
  }
</style>
